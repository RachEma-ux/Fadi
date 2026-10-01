import { Router } from "express";
import { db } from "../db/client.js";
import { atelierStore, programmeRepartitions, projects, projectSteps } from "../db/schema.js";
import { isNativeFloorDesign, isNativeLevelArray, projectNativeModel, replaceProjection } from "../lib/native-projection.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import {
  PARCOURS_STEPS,
  PROGRAMME_REPARTITION,
  exampleAttachment,
  exampleBuildingType,
  exampleAtelierStore,
  exampleRegistryName,
  exampleStepContents,
  listParcoursExamples,
} from "../data/parcours.js";

export const examplesRouter = Router();
examplesRouter.use(requireAuth);

/**
 * Bibliothèque d'exemples : des projets-sources extraits d'un prototype
 * antérieur (voir apps/api/src/data), pas des données inventées pour la
 * démonstration. `GET` liste ce qui est importable ; `POST .../import`
 * copie l'exemple dans un nouveau projet appartenant à l'utilisateur —
 * une copie, jamais une référence partagée, pour que l'utilisateur puisse
 * ensuite la modifier librement sans affecter l'exemple d'origine.
 */
examplesRouter.get("/", (_req, res) => {
  res.json(listParcoursExamples());
});

examplesRouter.post("/:exampleId/import", async (req, res) => {
  const exampleId = req.params.exampleId as string;
  const registry = exampleRegistryName(exampleId);
  const contents = exampleStepContents(exampleId);
  if (!registry || !contents) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const id = newId("proj");
  const atelier = exampleAtelierStore(exampleId);
  const buildingType = exampleBuildingType(exampleId);

  const created = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        id,
        ownerId: req.user!.id,
        code: registry.code,
        name: registry.name,
        sourceExampleId: exampleId,
        sourceAttachment: exampleAttachment(exampleId) ?? null,
        // Le modèle architectural importé compte comme une première révision
        // du projet (pas une révision par objet : ce n'est pas une suite de
        // commandes utilisateur, voir docs/architecture.md — « le chargement
        // initial n'est pas une action utilisateur annulable »).
        modelRevision: atelier ? 1 : 0,
      })
      .returning();
    if (!project) throw new Error("project insert returned nothing");
    await tx.insert(projectSteps).values(
      PARCOURS_STEPS.map((def) => {
        const content = contents[def.number]!;
        return { projectId: id, stepNumber: def.number, status: content.status, content: { ...content } };
      }),
    );

    if (buildingType) {
      // Type et composantes déclarés par l'exemple : c'est d'eux que dépend le
      // profil Harmonie (« Formation & bureaux ») et la répartition par type.
      await tx.insert(programmeRepartitions).values({
        projectId: id,
        type: buildingType.type,
        baseArea: PROGRAMME_REPARTITION.defaults.baseArea,
        mode: PROGRAMME_REPARTITION.defaults.mode,
        custom: {},
        components: buildingType.components,
      });
    }

    if (atelier) {
      // Le modèle natif de l'exemple, tel quel, dans le magasin du moteur
      // (registre, projet actif, domaines) — et sa projection dérivée vers
      // `levels` / `architectural_objects` (identifiants préfixés par projet,
      // relations remappées : voir lib/native-projection.ts).
      await tx.insert(atelierStore).values(Object.entries(atelier.entries).map(([key, value]) => ({ projectId: id, key, value, revision: 1 })));
      const nativeLevels = atelier.entries[`design.v13.project.${atelier.nativeId}.levels`];
      const floorDesign = atelier.entries[`design.v13.project.${atelier.nativeId}.floorDesign`];
      if (isNativeLevelArray(nativeLevels) && isNativeFloorDesign(floorDesign)) {
        await replaceProjection(tx, id, projectNativeModel(id, nativeLevels, floorDesign, 1));
      }
    }

    return project;
  });

  res.status(201).json(created);
});
