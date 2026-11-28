/**
 * Client de la projection WGS84 → système du projet (cas 4, lot C4, étape 7b), seul appelant de `/sandbox/projections`.
 * La définition vient d'un .prj fourni (`wkt`) ou des systèmes connus de Fadi ; un système inconnu sans .prj est refusé.
 */
export const ADRESSE_PROJECTIONS = "/sandbox/projections";

export class ErreurProjection extends Error {
  constructor(readonly code: "systeme_inconnu" | "projection" | "demande" | "compte" | "reseau" | "serveur") {
    super(code);
  }
}

export async function projeterVersSysteme(systeme: string, wkt: string | null, points: readonly (readonly [number, number])[]): Promise<{ readonly points: [number, number][]; readonly source: "fadi" | "prj" }> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_PROJECTIONS, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systeme, ...(wkt ? { wkt } : {}), points }) });
  } catch {
    throw new ErreurProjection("reseau");
  }
  if (r.status === 401) throw new ErreurProjection("compte");
  if (!r.ok) {
    const code = ((await r.json().catch(() => ({}))) as { error?: string }).error;
    throw new ErreurProjection(code === "systeme_inconnu" || code === "projection" ? code : r.status === 400 ? "demande" : "serveur");
  }
  return (await r.json()) as { points: [number, number][]; source: "fadi" | "prj" };
}

/** Cas 2, lot 5 (n° 92) : systèmes dont Fadi a la définition, liste fermée lue par l'API. */
export interface SystemeConnu {
  readonly code: string;
  readonly nom: string;
}
export interface SystemesConnus {
  readonly horizontaux: readonly SystemeConnu[];
  readonly verticaux: readonly SystemeConnu[];
}

/** Lecture de la liste fermée des systèmes (`GET /sandbox/projections/systemes`) ; `null` si elle n'a pas pu être lue. */
export async function lireSystemesConnus(): Promise<SystemesConnus | null> {
  try {
    const r = await fetch(`${ADRESSE_PROJECTIONS}/systemes`, { credentials: "include" });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<SystemesConnus>;
    const liste = (v: unknown): SystemeConnu[] => (Array.isArray(v) ? v.filter((x): x is SystemeConnu => typeof x?.code === "string" && typeof x?.nom === "string") : []);
    return { horizontaux: liste(j.horizontaux), verticaux: liste(j.verticaux) };
  } catch {
    return null;
  }
}
