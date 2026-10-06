/**
 * Chaînes jointives comme profils (D-126, DA-01-09) : des lignes et polylignes d'esquisse ouvertes, d'un même niveau,
 * jointives bout à bout (tolérance du réducteur), qui se referment forment un contour — détection proposée à
 * l'utilisateur (« Joindre en profil »), jamais imposée : rien n'est écrit ici.
 */
import { distance } from "../geometrie.js";
import type { ModeleAtelier, Occurrence } from "../modele.js";
import { TOLERANCE_REDUCTEUR, type Point2 } from "../unites.js";

/** Contour fermé formé par une sélection de traits jointifs, ou null (sélection hétérogène, ouverte ou ramifiée). */
export function chaineFermee(etat: ModeleAtelier, ids: readonly string[]): Point2[] | null {
  if (ids.length < 2) return null;
  const traits: Point2[][] = [];
  let niveau: string | null | undefined;
  for (const id of ids) {
    const o = etat.objets[id];
    if (!o || o.classe !== "esquisse") return null;
    const p = (o as Occurrence<"esquisse">).params;
    if (!["ligne", "polyligne"].includes(p.forme) || p.ferme || p.renflements?.some((b) => b !== 0) || p.points.length < 2) return null;
    if (niveau !== undefined && o.niveauId !== niveau) return null;
    niveau = o.niveauId;
    traits.push([...p.points]);
  }
  const tol = TOLERANCE_REDUCTEUR * 10;
  const meme = (u: Point2, v: Point2) => distance(u, v) <= tol;
  const restes = traits.slice(1);
  let chaine = [...traits[0]!];
  while (restes.length) {
    const fin = chaine[chaine.length - 1]!;
    const i = restes.findIndex((r) => meme(r[0]!, fin) || meme(r[r.length - 1]!, fin));
    if (i < 0) return null; // chaîne parcourue d'un bout : un trait non rattaché à la suite (ramification, trou)
    const r = restes.splice(i, 1)[0]!;
    chaine = meme(r[0]!, fin) ? [...chaine, ...r.slice(1)] : [...chaine, ...[...r].reverse().slice(1)];
  }
  if (chaine.length < 4 || !meme(chaine[0]!, chaine[chaine.length - 1]!)) return null;
  return chaine.slice(0, -1);
}
