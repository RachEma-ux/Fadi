/**
 * Accès serveur au magasin du moteur de l'Atelier (`atelier_store`), partagé
 * par le routeur de l'Atelier (écritures du moteur, avec révision annoncée)
 * et par les transmissions internes (parcelle → modèle), qui écrivent sans
 * révision annoncée mais avancent la révision de la clé et celle du modèle
 * de la même façon.
 */
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { db } from "../db/client.js";
import { atelierStore, projects } from "../db/schema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MODEL_DOMAINS = new Set(["levels", "floorDesign", "nativeParcel", "buildingFootprint"]);

export function domainOf(key: string): { nativeId: string; domain: string } | null {
  const m = /^design\.v13\.project\.(.+)\.([A-Za-z0-9_-]+)$/.exec(key);
  return m ? { nativeId: m[1]!, domain: m[2]! } : null;
}

export const projectKey = (nativeId: string, domain: string) => `design.v13.project.${nativeId}.${domain}`;

export async function readStoreEntry(tx: Tx, projectId: string, key: string): Promise<{ value: unknown; revision: number } | null> {
  const row = (await tx.select().from(atelierStore).where(and(eq(atelierStore.projectId, projectId), eq(atelierStore.key, key))).limit(1))[0];
  return row ? { value: row.value, revision: row.revision } : null;
}

/** Écrit une clé (révision +1) ; avance `projects.modelRevision` si la clé décrit le bâtiment ou la parcelle. Retourne la révision de la clé. */
export async function writeStoreEntry(tx: Tx, project: { id: string; modelRevision: number }, key: string, value: unknown): Promise<{ revision: number; modelRevision: number }> {
  const existing = await readStoreEntry(tx, project.id, key);
  const revision = (existing?.revision ?? 0) + 1;
  await tx
    .insert(atelierStore)
    .values({ projectId: project.id, key, value, revision, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [atelierStore.projectId, atelierStore.key], set: { value, revision, updatedAt: new Date() } });
  const d = domainOf(key);
  let modelRevision = project.modelRevision;
  if (d && MODEL_DOMAINS.has(d.domain)) {
    modelRevision = project.modelRevision + 1;
    project.modelRevision = modelRevision;
    await tx.update(projects).set({ modelRevision, updatedAt: new Date() }).where(eq(projects.id, project.id));
  } else {
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
  }
  return { revision, modelRevision };
}

/** Le projet natif actif du magasin, ou un nouveau projet natif enregistré dans le registre (`ensureNative()` du prototype). */
export async function ensureNativeProject(tx: Tx, project: { id: string; name: string; modelRevision: number }): Promise<string> {
  const active = (await readStoreEntry(tx, project.id, "design.v13.activeProject"))?.value;
  const registryRow = await readStoreEntry(tx, project.id, "design.v13.registry");
  const registry = Array.isArray(registryRow?.value) ? (registryRow!.value as { id: string }[]) : [];
  if (typeof active === "string" && registry.some((p) => p.id === active)) return active;
  const id = `native-fadi-${randomUUID()}`;
  await writeStoreEntry(tx, project, "design.v13.registry", [...registry, { id, name: project.name, parcel: "", location: "" }]);
  await writeStoreEntry(tx, project, "design.v13.activeProject", id);
  return id;
}
