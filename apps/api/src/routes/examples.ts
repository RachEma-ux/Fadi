import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { atelierStore, parcels, programmeCases, programmeRepartitions, projects, projectSteps } from "../db/schema.js";
import { hashOf, parcelSnapshotFromNative, summarize, type NativeParcelDomain } from "../lib/parcel-transmission.js";
import { repartitionFromCase, type ProgrammeCase } from "@parcours/domain-model";
import { randomUUID } from "node:crypto";
import { isNativeFloorDesign, isNativeLevelArray, projectNativeModel, replaceProjection } from "../lib/native-projection.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { stampStepFingerprints } from "../lib/project-archive.js";
import {
  PARCOURS_STEPS,
  PROGRAMME_REPARTITION,
  exampleAttachment,
  exampleBuildingType,
  exampleAtelierStore,
  exampleHarmonyDossier,
  exampleProgrammeCase,
  exampleRegistryName,
  exampleSiteObservations,
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
        // Données du site de l'exemple (étape 01) : côté d'approche, contextes, source, repère de travail.
        siteObservations: (exampleSiteObservations(exampleId) as unknown as Record<string, unknown> | null) ?? null,
        // Dossier Harmony de l'exemple (observations, références directionnelles, fiches de locaux, revue de conception), tel quel.
        harmony: exampleHarmonyDossier(exampleId)?.harmony ?? null,
      })
      .returning();
    if (!project) throw new Error("project insert returned nothing");
    await tx.insert(projectSteps).values(
      PARCOURS_STEPS.map((def) => {
        const content = contents[def.number]!;
        return { projectId: id, stepNumber: def.number, status: content.status, content: { ...content } };
      }),
    );

    const programmeCaseFile = exampleProgrammeCase(exampleId);
    if (programmeCaseFile) {
      // Le cas de programme résolu de l'exemple (`Parcours.ProgrammeCase`,
      // 74 fiches d'espaces, révision 6) devient le programme appliqué du
      // projet importé ; la répartition est chargée depuis ses fiches
      // (mode « cas »), comme `updateRepartition` du prototype.
      const pc = programmeCaseFile.programme as unknown as ProgrammeCase;
      await tx.insert(programmeCases).values({ projectId: id, revision: pc.revision, caseId: pc.caseId, scenarioId: pc.scenarioId, data: pc as unknown as Record<string, unknown> });
      const rep = repartitionFromCase(pc);
      await tx.insert(programmeRepartitions).values({ projectId: id, type: rep.type, baseArea: rep.baseArea, mode: rep.mode, custom: rep.custom, components: buildingType?.components ?? [] });
    } else if (buildingType) {
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
      // La parcelle de l'exemple ouverte dans l'outil Parcelle (étape 01) :
      // le fichier que `parcelSnapshot()` du prototype dérivait du modèle natif.
      const np = atelier.entries[`design.v13.project.${atelier.nativeId}.nativeParcel`] as NativeParcelDomain | undefined;
      const footprint = (atelier.entries[`design.v13.project.${atelier.nativeId}.buildingFootprint`] as { vertices?: [number, number][] } | undefined)?.vertices ?? null;
      if (np) {
        const snapshot = parcelSnapshotFromNative(np, registry.name, { footprint, workingFootprintArea: "673" });
        const parcelId = randomUUID();
        await tx.insert(parcels).values({ projectId: id, id: parcelId, number: 1, name: snapshot.name, crs: snapshot.crs, parcelNumber: snapshot.parcelNumber ?? "", data: snapshot as Record<string, unknown>, revision: 1 });
        await tx
          .update(projects)
          .set({
            parcelsInitialized: true,
            parcelTransmission: {
              status: "linked",
              reason: "Parcelle liée au modèle ; bornes / contexte transmis, aucune capacité ni autorisation inventée.",
              at: new Date().toISOString(),
              signature: hashOf(snapshot),
              nativeId: atelier.nativeId,
              parcelId,
              parcel: summarize(snapshot),
            },
          })
          .where(eq(projects.id, id));
      }
    }

    // Empreintes de péremption (« À réexaminer ») : les propositions générées
    // et les choix retenus de l'exemple sont datés des données importées —
    // site, programme, modèle, intentions — pour que seuls des changements
    // ultérieurs les signalent.
    await stampStepFingerprints(tx, { id, name: project.name, siteObservations: project.siteObservations, harmony: project.harmony });

    return project;
  });

  res.status(201).json(created);
});
