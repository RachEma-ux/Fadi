/**
 * Projection du modèle natif de l'Atelier (format `design.v13` du moteur :
 * domaine `levels` + domaine `floorDesign`) vers les tables normalisées
 * `levels` / `architectural_objects` du modèle de domaine.
 *
 * Le moteur reste propriétaire du modèle (il lit et écrit ses domaines tels
 * quels dans `atelier_store`) ; cette projection est une vue dérivée,
 * régénérée à chaque sauvegarde, pour que les autres modules — et l'API
 * `/levels/:id/objects` — voient les objets sans parler le format du moteur.
 * Rien n'est omis : chaque élément de chaque famille devient un objet avec
 * son `kind`, toutes ses propriétés (repère local) et ses relations
 * explicites (porte / fenêtre → mur hôte).
 */
import { eq } from "drizzle-orm";
import type { db } from "../db/client.js";
import { architecturalObjects, levels } from "../db/schema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface NativeLevel {
  id: string;
  name: string;
  elevation: number;
  height?: number;
}

export interface NativeFloorDesign {
  levels: Record<string, Record<string, unknown>>;
  meta?: unknown;
}

const GROUPS = ["walls", "columns", "doors", "windows", "stairs", "paths", "dims", "texts", "rooms"] as const;
const SINGULAR: Record<(typeof GROUPS)[number], string> = {
  walls: "wall",
  columns: "column",
  doors: "door",
  windows: "window",
  stairs: "stairs",
  paths: "path",
  dims: "dim",
  texts: "text",
  rooms: "room",
};

export interface ProjectionRows {
  levelRows: { id: string; projectId: string; label: string; elevation: number; position: number }[];
  objectRows: { id: string; levelId: string; kind: string; properties: Record<string, unknown>; relations: { kind: string; targetId: string }[]; modelRevision: number }[];
}

/**
 * Identifiants natifs préfixés par le projet Fadi : `levels.id` et
 * `architectural_objects.id` sont des clés primaires globales, et deux
 * projets peuvent importer le même modèle. Les relations sont remappées
 * avec la même règle, jamais laissées sur l'id natif brut.
 */
export function projectNativeModel(projectId: string, nativeLevels: NativeLevel[], floorDesign: NativeFloorDesign, modelRevision: number): ProjectionRows {
  const levelId = (nativeId: string) => `${projectId}_${nativeId}`;
  const objectId = (nativeId: string) => `${projectId}_${nativeId}`;
  const levelRows: ProjectionRows["levelRows"] = nativeLevels.map((lvl, i) => ({ id: levelId(lvl.id), projectId, label: lvl.name, elevation: lvl.elevation, position: i }));
  const objectRows: ProjectionRows["objectRows"] = [];
  for (const lvl of nativeLevels) {
    const src = floorDesign.levels[lvl.id];
    if (!src) continue;
    for (const group of GROUPS) {
      const arr = src[group];
      if (!Array.isArray(arr)) continue;
      arr.forEach((item: Record<string, unknown>, idx) => {
        const { id, kind, ...rest } = item;
        const nativeId = typeof id === "string" && id ? id : `${lvl.id}-${group}-${idx}`;
        const host = typeof rest["hostWallId"] === "string" ? (rest["hostWallId"] as string) : null;
        objectRows.push({
          id: objectId(nativeId),
          levelId: levelId(lvl.id),
          kind: typeof kind === "string" && kind ? kind : SINGULAR[group],
          properties: { frame: "local", ...rest },
          relations: host ? [{ kind: "hosted-by", targetId: objectId(host) }] : [],
          modelRevision,
        });
      });
    }
  }
  return { levelRows, objectRows };
}

/** Remplace la projection d'un projet (niveaux + objets) dans la transaction donnée, par lots. */
export async function replaceProjection(tx: Tx, projectId: string, rows: ProjectionRows): Promise<void> {
  await tx.delete(levels).where(eq(levels.projectId, projectId));
  if (rows.levelRows.length) await tx.insert(levels).values(rows.levelRows);
  for (let i = 0; i < rows.objectRows.length; i += 300) {
    await tx.insert(architecturalObjects).values(rows.objectRows.slice(i, i + 300));
  }
}

export function isNativeLevelArray(v: unknown): v is NativeLevel[] {
  return Array.isArray(v) && v.every((l) => l && typeof l === "object" && typeof (l as NativeLevel).id === "string" && typeof (l as NativeLevel).name === "string" && Number.isFinite((l as NativeLevel).elevation));
}

export function isNativeFloorDesign(v: unknown): v is NativeFloorDesign {
  return !!v && typeof v === "object" && !!(v as NativeFloorDesign).levels && typeof (v as NativeFloorDesign).levels === "object";
}
