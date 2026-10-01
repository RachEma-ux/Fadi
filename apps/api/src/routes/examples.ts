import { Router } from "express";
import { db } from "../db/client.js";
import { architecturalObjects, levels, projects, projectSteps } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import {
  PARCOURS_STEPS,
  exampleAttachment,
  exampleNativeArchitecture,
  exampleRegistryName,
  exampleStepContents,
  listParcoursExamples,
} from "../data/parcours.js";

/** Insère par lots : ~1750 objets en une seule requête dépasserait sans utilité la taille raisonnable d'une requête SQL. */
async function insertInChunks<T extends Record<string, unknown>>(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: Parameters<typeof tx.insert>[0],
  rows: T[],
  chunkSize = 300,
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await tx.insert(table).values(rows.slice(i, i + chunkSize));
  }
}

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
  const nativeArchitecture = exampleNativeArchitecture(exampleId);

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
        modelRevision: nativeArchitecture ? 1 : 0,
      })
      .returning();
    if (!project) throw new Error("project insert returned nothing");
    await tx.insert(projectSteps).values(
      PARCOURS_STEPS.map((def) => {
        const content = contents[def.number]!;
        return { projectId: id, stepNumber: def.number, status: content.status, content: { ...content } };
      }),
    );

    if (nativeArchitecture) {
      // Les identifiants natifs ("EX118-rdc-W-009"...) sont des clés
      // primaires globales côté serveur (levels.id, architectural_objects.id),
      // pas scopées par projet : un deuxième import de P.118 entrerait en
      // collision avec le premier. On les préserve donc en les préfixant par
      // l'id du projet créé — correspondance explicite, remappée partout où
      // un identifiant natif est référencé (relations `hosted-by`) — plutôt
      // que de les perdre ou de les laisser entrer en conflit silencieusement.
      const levelIdMap = new Map(nativeArchitecture.levels.map((lvl) => [lvl.id, `${id}_${lvl.id}`]));
      const objectIdMap = new Map<string, string>();
      for (const objs of Object.values(nativeArchitecture.objectsByLevel)) {
        for (const obj of objs) objectIdMap.set(obj.id, `${id}_${obj.id}`);
      }

      await insertInChunks(
        tx,
        levels,
        nativeArchitecture.levels.map((lvl) => ({
          id: levelIdMap.get(lvl.id)!,
          projectId: id,
          label: lvl.label,
          elevation: lvl.elevation,
          position: lvl.position,
        })),
      );

      const objectRows = Object.entries(nativeArchitecture.objectsByLevel).flatMap(([nativeLevelId, objs]) =>
        objs.map((obj) => ({
          id: objectIdMap.get(obj.id)!,
          levelId: levelIdMap.get(nativeLevelId)!,
          kind: obj.kind,
          properties: obj.properties,
          relations: obj.relations.map((r) => ({
            kind: r.kind,
            targetId: objectIdMap.get(r.targetId) ?? r.targetId,
          })),
          modelRevision: 1,
        })),
      );
      await insertInChunks(tx, architecturalObjects, objectRows);
    }

    return project;
  });

  res.status(201).json(created);
});
