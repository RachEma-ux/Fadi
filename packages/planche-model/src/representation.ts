/**
 * Lot 7 — représentation en lecture seule d'une Planche hors de la Planche (vue 3D de l'Atelier, export IFC) :
 * un maillage triangulé en coordonnées monde par objet de la racine (groupe ou composant) et un maillage pour la
 * géométrie libre de la racine. Les solides (lot 6) sont maillés orientés vers l'extérieur avec leur volume ; les
 * objets non solides et les faces libres sont triangulés face par face, sans volume (« non évalué »).
 */
import { appliquer, contexte, estSolide, matriceMonde, positionsFace, transformerNormale, type Contexte, type Id, type Matrice4, type Modele } from "./geometrie-libre.js";
import { maillageDuSolide, motifNonSolide, triangulerFace, volumeDuMaillage } from "./maillage.js";
import { normalize, type Vec3 } from "./vecteur.js";

export interface MaillagePlanche {
  /** Identifiant de l'occurrence, ou `"racine"` pour la géométrie libre. */
  readonly id: Id | "racine";
  readonly nom: string;
  readonly genre: "groupe" | "composant" | "racine";
  readonly solide: boolean;
  /** Volume (m³) des solides seulement ; `null` = non évalué. */
  readonly volume: number | null;
  /** Coordonnées monde, 3 par sommet. */
  readonly positions: readonly number[];
  /** Indices de sommets, 3 par triangle. */
  readonly triangles: readonly number[];
}

function triangulerContexte(c: Contexte, M: Matrice4 | null, positions: number[], triangles: number[]): void {
  for (const f of Object.values(c.faces)) {
    if (f.masquee) continue;
    const p = positionsFace(c, f);
    const T = (q: Vec3): Vec3 => (M ? appliquer(M, q) : q);
    const exterieur = p.exterieur.map(T);
    const trous = p.trous.map((b) => b.map(T));
    const n = normalize(M ? transformerNormale(M, f.normale) : f.normale);
    const tous = [...exterieur, ...trous.flat()];
    const base = positions.length / 3;
    for (const q of tous) positions.push(q.x, q.y, q.z);
    const tri = triangulerFace(exterieur, trous, n);
    for (let i = 0; i < tri.length; i += 3) triangles.push(base + (tri[i] as number), base + (tri[i + 1] as number), base + (tri[i + 2] as number));
  }
}

/** Maillages des objets de la racine (masqués exclus) puis de la géométrie libre, dans un ordre stable (identifiants). */
export function maillagesPlanche(m: Modele): MaillagePlanche[] {
  const sortie: MaillagePlanche[] = [];
  const occurrences = Object.values(m.racine.occurrences)
    .filter((o) => !o.masquee)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const o of occurrences) {
    const def = m.definitions[o.definition];
    if (!def) continue;
    const nom = o.nom ?? def.nom;
    const solide = !motifNonSolide(m, o.id) && estSolide(m, o.id);
    if (solide) {
      const mesh = maillageDuSolide(m, o.id);
      sortie.push({ id: o.id, nom, genre: def.genre, solide: true, volume: volumeDuMaillage(mesh), positions: mesh.positions, triangles: mesh.triangles });
    } else {
      const positions: number[] = [];
      const triangles: number[] = [];
      triangulerContexte(contexte(m, o.id), matriceMonde(m, o.id), positions, triangles);
      if (triangles.length) sortie.push({ id: o.id, nom, genre: def.genre, solide: false, volume: null, positions, triangles });
    }
  }
  const positions: number[] = [];
  const triangles: number[] = [];
  triangulerContexte(m.racine, null, positions, triangles);
  if (triangles.length) sortie.push({ id: "racine", nom: "Géométrie libre", genre: "racine", solide: false, volume: null, positions, triangles });
  return sortie;
}
