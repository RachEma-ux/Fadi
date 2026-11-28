/**
 * Client de l'archive des fichiers des références verrouillées (cas 4, lot C4, étape 3). Seul appelant de
 * `/sandbox/references` : la maquette reçue (OBJ, STL, IFC) y est rangée telle quelle, puis relue à chaque ouverture ;
 * le dessin n'en garde que la fiche.
 */
import type { FichierReference, FormatReference } from "@parcours/sandbox-planche-model";

export const ADRESSE_REFERENCES = "/sandbox/references";

/** Erreur d'archivage ou de lecture : `compte` (401), `format` (415), `taille` (413), `absent` (404), `reseau`, `serveur`. */
export class ErreurFichierReference extends Error {
  constructor(readonly code: "compte" | "format" | "taille" | "absent" | "reseau" | "serveur") {
    super(code);
  }
}

const erreurDe = (s: number): ErreurFichierReference => new ErreurFichierReference(s === 401 ? "compte" : s === 415 ? "format" : s === 413 ? "taille" : s === 404 ? "absent" : "serveur");

/** Range le fichier tel quel ; rend sa référence (le même fichier déjà rangé rend la référence existante). */
export async function archiverFichierReference(f: File, format: FormatReference | "pdf" | "ifczip" | "kml" | "kmz" | "prj"): Promise<FichierReference> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_REFERENCES, { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream", "X-Fadi-Nom": encodeURIComponent(f.name), "X-Fadi-Format": format }, body: f });
  } catch {
    throw new ErreurFichierReference("reseau");
  }
  if (!r.ok) throw erreurDe(r.status);
  const o = ((await r.json()) as { fichier: { id: string; taille: number; empreinte: string } }).fichier;
  return { id: o.id, taille: o.taille, empreinte: o.empreinte };
}

/** Relit les octets rangés (lecture par le compte qui les a rangés). */
export async function lireFichierReference(id: string): Promise<ArrayBuffer> {
  const adresse = `${ADRESSE_REFERENCES}/${encodeURIComponent(id)}`;
  let r: Response;
  try {
    r = await fetch(adresse, { credentials: "include" });
  } catch {
    throw new ErreurFichierReference("reseau");
  }
  if (!r.ok) throw erreurDe(r.status);
  return r.arrayBuffer();
}
