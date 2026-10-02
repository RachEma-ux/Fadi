/**
 * Module Projets et sources — fichiers de parcelle de l'outil Parcelle
 * (étape 01). Monté sous `/projects/:projectId/parcels`, ce routeur sert
 * **le contrat que l'outil attend de son « Site » d'origine**
 * (`project-files.js` du document Parcelle) :
 *
 *   GET    /            → { files: [métadonnées], initialized }
 *   GET    /:id         → { file: { …métadonnées, data } }
 *   PUT    /:id         { data, revision } → 201 / 200 { file } ; 409 si la révision annoncée n'est plus la courante
 *   DELETE /:id         { revision } → { removed, files, next } ; 409 idem
 *
 * et la transmission vers le modèle de l'Atelier (`acceptParcel` du
 * prototype) :
 *
 *   POST   /:id/transmit → { transmission, nativeId }
 */
import { Router, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { parcels, projects } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { loadOwnedProject } from "../lib/owned-project.js";
import { acceptParcel, hashOf, measure, summarize, type NativeParcelDomain, type ParcelSnapshot, type ParcelTransmission, SUPPORTED_CRS } from "../lib/parcel-transmission.js";
import { ensureNativeProject, projectKey, readStoreEntry, writeStoreEntry } from "../lib/atelier-store.js";

export const parcelsRouter = Router({ mergeParams: true });
parcelsRouter.use(requireAuth);

const projectIdOf = (req: Request) => (req.params as Record<string, string>)["projectId"] ?? "";
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

const coordinate = z.union([z.string().max(24), z.number().finite().refine((n) => Math.abs(n) <= 2e7)]);
const snapshotSchema = z
  .object({
    name: z.string().max(80),
    crs: z.string().refine((c) => SUPPORTED_CRS.has(c), "Système de coordonnées non pris en charge."),
    parcelNumber: z.string().max(40).optional(),
    points: z.array(z.object({ id: z.string().max(32), x: coordinate, y: coordinate }).passthrough()).max(200),
    source: z.string().max(40).optional(),
  })
  .passthrough();

const putSchema = z.object({ data: snapshotSchema, revision: z.number().int().min(0) });
const deleteSchema = z.object({ revision: z.number().int().min(0) });

type ParcelRow = typeof parcels.$inferSelect;

function metadata(row: ParcelRow) {
  const snapshot = row.data as unknown as ParcelSnapshot;
  const { area, perimeter } = measure(snapshot);
  return {
    id: row.id,
    number: row.number,
    parcelNumber: snapshot.parcelNumber ?? "",
    sourceFilename: snapshot.provenance?.filename ?? "",
    name: row.name,
    crs: row.crs,
    revision: row.revision,
    updated_at: row.updatedAt.toISOString(),
    area,
    perimeter,
    boundaryCount: snapshot.points.length,
  };
}

async function listRows(projectId: string): Promise<ParcelRow[]> {
  // Les plus récentes d'abord, comme la liste « Mes parcelles » de l'outil.
  const rows = await db.select().from(parcels).where(eq(parcels.projectId, projectId)).orderBy(asc(parcels.updatedAt));
  return rows.reverse();
}

parcelsRouter.get("/", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rows = await listRows(project.id);
  res.json({ files: rows.map(metadata), initialized: project.parcelsInitialized || rows.length > 0, transmission: project.parcelTransmission });
});

parcelsRouter.get("/:parcelId", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const id = req.params["parcelId"] as string;
  const row = (await db.select().from(parcels).where(and(eq(parcels.projectId, project.id), eq(parcels.id, id))).limit(1))[0];
  if (!row) {
    res.status(404).json({ error: "Parcelle introuvable." });
    return;
  }
  res.json({ file: { ...metadata(row), data: row.data } });
});

parcelsRouter.put("/:parcelId", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const id = req.params["parcelId"] as string;
  if (!ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Identifiant invalide." });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Fichier de parcelle invalide." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const old = (await tx.select().from(parcels).where(and(eq(parcels.projectId, project.id), eq(parcels.id, id))).limit(1))[0];
    if ((old?.revision ?? 0) !== parsed.data.revision) {
      return { conflict: true as const };
    }
    const data = parsed.data.data;
    const number = old?.number ?? (await tx.select({ n: parcels.number }).from(parcels).where(eq(parcels.projectId, project.id))).reduce((m, r) => Math.max(m, r.n), 0) + 1;
    const row = {
      projectId: project.id,
      id,
      number,
      name: data.name,
      crs: data.crs,
      parcelNumber: data.parcelNumber ?? "",
      data: data as Record<string, unknown>,
      revision: parsed.data.revision + 1,
      updatedAt: new Date(),
    };
    await tx.insert(parcels).values(row).onConflictDoUpdate({ target: [parcels.projectId, parcels.id], set: row });
    await tx.update(projects).set({ parcelsInitialized: true, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return { conflict: false as const, created: !old, row: { ...row, updatedAt: row.updatedAt } as ParcelRow };
  });
  if (result.conflict) {
    res.status(409).json({ error: "Cette parcelle a été modifiée dans une autre fenêtre. Téléchargez votre saisie avant de rouvrir le fichier." });
    return;
  }
  res.status(result.created ? 201 : 200).json({ file: metadata(result.row) });
});

parcelsRouter.delete("/:parcelId", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const id = req.params["parcelId"] as string;
  const parsed = deleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Révision invalide." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const old = (await tx.select().from(parcels).where(and(eq(parcels.projectId, project.id), eq(parcels.id, id))).limit(1))[0];
    if (!old) return { status: 404 as const };
    if (old.revision !== parsed.data.revision) return { status: 409 as const };
    await tx.delete(parcels).where(and(eq(parcels.projectId, project.id), eq(parcels.id, id)));
    await tx.update(projects).set({ parcelsInitialized: true, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return { status: 200 as const };
  });
  if (result.status === 404) {
    res.status(404).json({ error: "Parcelle introuvable." });
    return;
  }
  if (result.status === 409) {
    res.status(409).json({ error: "Cette parcelle a été modifiée dans une autre fenêtre. Rouvrez-la avant de la supprimer." });
    return;
  }
  const rows = await listRows(project.id);
  const next = rows[0] ?? null;
  res.json({ removed: id, files: rows.map(metadata), next: next ? { ...metadata(next), data: next.data } : null });
});

// --- Transmission parcelle → modèle (acceptParcel) --------------------------

const transmitSchema = z.object({ data: snapshotSchema.optional() });

/**
 * Comme `frameReady()` / `flushParcel()` du prototype : c'est la parcelle
 * **capturée** dans l'outil qui est transmise (corps `{ data }`), à chaque
 * changement de signature et avant de quitter l'étape ; sans corps, c'est le
 * fichier enregistré. Une signature déjà transmise pour ce fichier ne
 * provoque aucune écriture (rechargement de la page, clics sans saisie).
 */
parcelsRouter.post("/:parcelId/transmit", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const id = req.params["parcelId"] as string;
  if (!ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Identifiant invalide." });
    return;
  }
  const parsed = transmitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parcelle invalide." });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    let snapshot = parsed.data.data as ParcelSnapshot | undefined;
    if (!snapshot) {
      const row = (await tx.select().from(parcels).where(and(eq(parcels.projectId, project.id), eq(parcels.id, id))).limit(1))[0];
      if (!row) return null;
      snapshot = row.data as unknown as ParcelSnapshot;
    }
    const previous = project.parcelTransmission as (ParcelTransmission & { parcelId?: string }) | null;
    if (previous && previous.parcelId === id && previous.signature === hashOf(snapshot) && previous.parcel) {
      return previous;
    }
    const nativeId = await ensureNativeProject(tx, project);
    const currentParcel = ((await readStoreEntry(tx, project.id, projectKey(nativeId, "nativeParcel")))?.value as NativeParcelDomain | undefined) ?? null;
    const footprintRow = (await readStoreEntry(tx, project.id, projectKey(nativeId, "buildingFootprint")))?.value as { vertices?: unknown } | undefined;
    const floorDesign = (await readStoreEntry(tx, project.id, projectKey(nativeId, "floorDesign")))?.value as { levels?: Record<string, Record<string, unknown[]>> } | undefined;
    const buildingDrawn = Object.values(floorDesign?.levels ?? {}).some((lvl) => ["walls", "rooms", "paths", "columns", "stairs"].some((k) => Array.isArray(lvl[k]) && lvl[k]!.length > 0));
    const now = new Date().toISOString();
    const result = acceptParcel({
      snapshot,
      currentParcel,
      currentFootprint: Array.isArray(footprintRow?.vertices) ? (footprintRow!.vertices as [number, number][]) : null,
      buildingDrawn,
      now,
    });
    if (result.writes.nativeParcel) await writeStoreEntry(tx, project, projectKey(nativeId, "nativeParcel"), result.writes.nativeParcel);
    if (result.writes.buildingFootprint) await writeStoreEntry(tx, project, projectKey(nativeId, "buildingFootprint"), result.writes.buildingFootprint);
    const transmission = { ...result.transmission, nativeId, parcelId: id, parcel: summarize(snapshot) };
    await tx.update(projects).set({ parcelTransmission: transmission, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return transmission;
  });
  if (!outcome) {
    res.status(404).json({ error: "Parcelle introuvable." });
    return;
  }
  res.json({ transmission: outcome });
});
