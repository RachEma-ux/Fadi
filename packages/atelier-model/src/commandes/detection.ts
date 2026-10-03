/**
 * Détection de pièces (`piece.detecter`, annexe B) : **proposition seulement, jamais imposée**. Les axes des murs
 * du niveau forment un graphe plan (coupé aux intersections) ; chaque face bornée est un contour proposé.
 * Rien n'est créé : la création passe par `piece.creer`. Les propositions sont rendues par `detecterPieces`
 * et dans `Effets.propositions` (D-024, nature `contour-piece`, provenance `calcul`, statut `a-verifier`).
 * Un lot qui ne contient que `piece.detecter` ne change pas le modèle : ni révision ni empreinte nouvelles.
 *
 * Limites connues : graphe construit sur les axes (pas sur les faces des murs) ; fusion des sommets à
 * `longueurMin` près. Ce sont des propositions à vérifier par l'utilisateur.
 */
import type { EtatModele } from "../contrats/etat.js";
import { TOLERANCES } from "../contrats/tolerances.js";
import type { IdObjet } from "../ontologie/classes.js";
import { estPointLocal, REPERE_LOCAL_PROJET, type PointLocal } from "../ontologie/reperes.js";
import { aire } from "../ontologie/unites.js";
import { controlerNiveau, type Corps } from "./communs.js";
import { aireSignee, distance, intersectionDroites, pointDansPolygone, pt, sous, type Vec } from "./geometrie.js";
import { motif } from "./transaction.js";

export interface PieceProposee {
  readonly contour: readonly PointLocal[];
  /** Aire calculée (m²), provenance `calcul`. */
  readonly aire: number;
}

/** Contours fermés formés par les axes des murs du niveau ; avec `point`, le plus petit qui le contient. */
export function detecterPieces(etat: Pick<EtatModele, "objets">, niveauId: IdObjet, point?: Vec): PieceProposee[] {
  const tol = TOLERANCES.longueurMin;
  const segs: [Vec, Vec][] = [];
  for (const o of Object.values(etat.objets)) if (o.classe === "mur" && o.niveauId === niveauId) segs.push([o.params.axe.a, o.params.axe.b]);
  // Sommets fusionnés à `tol` près.
  const sommets: Vec[] = [];
  const indice = (p: Vec): number => {
    const i = sommets.findIndex((q) => distance(p, q) <= tol);
    if (i >= 0) return i;
    sommets.push(p);
    return sommets.length - 1;
  };
  const aretes = new Set<string>();
  const voisins = new Map<number, Set<number>>();
  const lier = (i: number, j: number) => {
    if (i === j) return;
    const k = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (aretes.has(k)) return;
    aretes.add(k);
    if (!voisins.has(i)) voisins.set(i, new Set());
    if (!voisins.has(j)) voisins.set(j, new Set());
    voisins.get(i)?.add(j);
    voisins.get(j)?.add(i);
  };
  segs.forEach(([a, b], i) => {
    const d = sous(b, a);
    const L = Math.hypot(d.x, d.y);
    if (L === 0) return;
    const coupes = new Set<number>([0, 1]);
    segs.forEach(([c, e], j) => {
      if (i === j) return;
      const w = sous(e, c);
      const x = intersectionDroites(a, d, c, w);
      const lw = Math.hypot(w.x, w.y);
      if (x && x.s * L >= -tol && (x.s - 1) * L <= tol && x.u * lw >= -tol && (x.u - 1) * lw <= tol) coupes.add(Math.min(1, Math.max(0, x.s)));
    });
    const ts = [...coupes].sort((p, q) => p - q);
    const idx = ts.map((t) => indice({ x: a.x + d.x * t, y: a.y + d.y * t }));
    for (let k = 1; k < idx.length; k++) lier(idx[k - 1] as number, idx[k] as number);
  });
  // Parcours des faces : à chaque sommet, on tourne au plus serré à gauche (face à gauche de l'arête).
  const angle = (i: number, j: number) => {
    const p = sommets[i] as Vec;
    const q = sommets[j] as Vec;
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  const vues = new Set<string>();
  const faces: PieceProposee[] = [];
  for (const [u, vs] of voisins) {
    for (const v of vs) {
      if (vues.has(`${u}>${v}`)) continue;
      const cycle: number[] = [];
      let [a, b] = [u, v];
      let garde = 0;
      while (!vues.has(`${a}>${b}`) && garde++ < 10000) {
        vues.add(`${a}>${b}`);
        cycle.push(a);
        const retour = angle(b, a);
        let meilleur = -1;
        let meilleurDelta = Infinity;
        for (const w of voisins.get(b) ?? []) {
          if (w === a && (voisins.get(b)?.size ?? 0) > 1) continue;
          // Écart angulaire mesuré dans le sens horaire depuis la direction de retour.
          let delta = retour - angle(b, w);
          while (delta <= 0) delta += 2 * Math.PI;
          if (delta < meilleurDelta) {
            meilleurDelta = delta;
            meilleur = w;
          }
        }
        if (meilleur < 0) break;
        [a, b] = [b, meilleur];
      }
      const contour = cycle.map((i) => sommets[i] as Vec);
      const aire = aireSignee(contour);
      if (contour.length >= 3 && aire > TOLERANCES.aireMin) faces.push({ contour: contour.map((p) => pt(p.x, p.y)), aire });
    }
  }
  if (point === undefined) return faces;
  const contenant = faces.filter((f) => pointDansPolygone(point, f.contour)).sort((x, y) => x.aire - y.aire);
  return contenant.slice(0, 1);
}

export const detecter: Corps<"piece.detecter"> = (tx, c) => {
  const n = controlerNiveau(tx, c.params.niveauId, "params.niveauId");
  if (!n) return;
  const p = c.params.point;
  if (p !== undefined && (!estPointLocal(p) || (p.repereLocal ?? REPERE_LOCAL_PROJET) !== REPERE_LOCAL_PROJET)) {
    tx.refuser("repere-melange", "params.point", motif("Détection de pièce", "point mal formé ou hors du repère local du projet", "désigner un point du plan"));
    return;
  }
  const objets: Record<IdObjet, ReturnType<typeof tx.objets>[number]> = {};
  for (const o of tx.objets()) objets[o.id] = o;
  const propositions = detecterPieces({ objets }, n.id, p);
  for (const f of propositions) {
    tx.proposer({ nature: "contour-piece", niveauId: n.id, contour: f.contour, aire: aire(f.aire), provenance: "calcul", statut: "a-verifier" });
  }
};
