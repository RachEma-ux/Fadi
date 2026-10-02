import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { atelierStore, parcels, programmeRepartitions, projects, projectSteps } from "../db/schema.js";
import { hashOf, parcelSnapshotFromNative, summarize, type NativeParcelDomain } from "../lib/parcel-transmission.js";
import { randomUUID } from "node:crypto";
import { isNativeFloorDesign, isNativeLevelArray, projectNativeModel, replaceProjection } from "../lib/native-projection.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { sourceExampleOrigin, sourceExampleText, sourceExamplesForStep, type SourceExample } from "@parcours/domain-model";
import {
  PARCOURS_STEPS,
  PROGRAMME_REPARTITION,
  SOURCE_EXAMPLES,
  exampleAttachment,
  exampleBuildingType,
  exampleAtelierStore,
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

/**
 * Exemples issus des fichiers sources (`SOURCE_EXAMPLES` du prototype) :
 * la bibliothèque complète (10 cas), un cas, et les cas proposés à une
 * étape avec leur contenu pertinent (`exampleText`). Cas pédagogiques à
 * adapter — jamais considérés comme données réelles du projet.
 */
function sourceSummary(e: SourceExample) {
  return { key: e.key, title: e.title, origin: sourceExampleOrigin(SOURCE_EXAMPLES, e), location: e.location ?? "", summary: e.summary ?? "", capacity: e.capacity ?? null, unit: e.unit ?? e.capacityUnit ?? "" };
}

examplesRouter.get("/sources", (_req, res) => {
  res.json(SOURCE_EXAMPLES.examples.map(sourceSummary));
});

examplesRouter.get("/sources/step/:stepNumber", (req, res) => {
  const n = Number(req.params["stepNumber"]);
  if (!Number.isInteger(n) || n < 1 || n > 21) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(sourceExamplesForStep(SOURCE_EXAMPLES, n).map((e) => ({ ...sourceSummary(e), text: sourceExampleText(e, n) })));
});

examplesRouter.get("/sources/:key", (req, res) => {
  const e = SOURCE_EXAMPLES.examples.find((x) => x.key === req.params["key"]);
  if (!e) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ...e, origin: sourceExampleOrigin(SOURCE_EXAMPLES, e) });
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

    return project;
  });

  res.status(201).json(created);
});
