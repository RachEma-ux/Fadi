/**
 * Client de l'archive des originaux des fonds calés (cas 4, lot C4, étape 1 ; décision du maître d'ouvrage du
 * 27 novembre 2026). Seul appelant de `/sandbox/fonds` : le fichier reçu y est rangé tel quel avant que la Planche n'en
 * pose la copie réduite ; sans archive, pas de fond.
 */
import type { OriginalFond, PieceCalage } from "@parcours/sandbox-planche-model";

export const ADRESSE_FONDS = "/sandbox/fonds";

/** Erreur d'archivage : `compte` (401), `type` (415), `taille` (413), `reseau`, ou `serveur`. */
export class ErreurArchiveFond extends Error {
  constructor(readonly code: "compte" | "type" | "taille" | "reseau" | "serveur") {
    super(code);
  }
}

/** Range l'original tel quel ; rend sa référence (le même fichier déjà rangé rend la référence existante). */
export async function archiverOriginalFond(f: File, type: string = f.type): Promise<OriginalFond> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_FONDS, { method: "POST", credentials: "include", headers: { "Content-Type": type, "X-Fadi-Nom": encodeURIComponent(f.name) }, body: f });
  } catch {
    throw new ErreurArchiveFond("reseau");
  }
  if (r.status === 401) throw new ErreurArchiveFond("compte");
  if (r.status === 415) throw new ErreurArchiveFond("type");
  if (r.status === 413) throw new ErreurArchiveFond("taille");
  if (!r.ok) throw new ErreurArchiveFond("serveur");
  const o = ((await r.json()) as { original: { id: string; type: OriginalFond["type"]; taille: number; empreinte: string } }).original;
  return { id: o.id, type: o.type, taille: o.taille, empreinte: o.empreinte };
}

/** Pièce de calage d'une orthophoto (world file, .prj) rangée telle quelle (D-GD-29) : rend sa référence. */
export async function archiverPieceCalage(f: File, role: "calage" | "prj"): Promise<PieceCalage> {
  const o = await archiverOriginalFond(f, "text/plain");
  return { role, id: o.id, empreinte: o.empreinte };
}

/** Adresse de l'original (lecture par le compte qui l'a rangé). */
export const adresseOriginalFond = (id: string): string => `${ADRESSE_FONDS}/${encodeURIComponent(id)}`;
