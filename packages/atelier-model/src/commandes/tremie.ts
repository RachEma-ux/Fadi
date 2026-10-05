/**
 * Trémie d'escalier (D-059, fiche DA-07-10) : `escalier.tremie` { id, dalleId, marge? } perce la dalle d'un trou
 * égal à l'emprise en plan de l'escalier (axe a → b, largeur centrée), agrandie de `marge` (m, déclarée, 0 par
 * défaut : aucun dégagement n'est supposé). Refus : trou hors de la dalle, chevauchement d'un trou existant, dalle
 * ou escalier inconnus. La dalle reste une dalle (trou ordinaire, modifiable ou retirable comme les autres).
 */
import { intersectionSegments, normalise, perp, pointDansPolygone, sub, type Vec } from "../geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";
import { pt, type Point2 } from "../unites.js";
import { effetsVides, ErreurCommande, lire, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

/** Emprise en plan d'un escalier, agrandie de `marge` de chaque côté. */
export function empriseEscalier(e: Occurrence<"escalier">, marge = 0): Point2[] {
  const { a, b } = e.params;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const w = e.params.largeur.value / 2 + marge;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const p = (s: number, o: number) => pt(Math.round((a.x + u.x * s + n.x * o) * 1e6) / 1e6, Math.round((a.y + u.y * s + n.y * o) * 1e6) / 1e6);
  return [p(-marge, -w), p(L + marge, -w), p(L + marge, w), p(-marge, w)];
}

const sesCotes = (poly: readonly Vec[]) => poly.map((q, i) => [q, poly[(i + 1) % poly.length]!] as const);

function seChevauchent(p1: readonly Vec[], p2: readonly Vec[]): boolean {
  if (p1.some((q) => pointDansPolygone(q, p2)) || p2.some((q) => pointDansPolygone(q, p1))) return true;
  for (const [a, b] of sesCotes(p1)) for (const [c, d] of sesCotes(p2)) if (intersectionSegments(a, b, c, d)) return true;
  return false;
}

export function tremieEscalier(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.chaine(p, "id");
  const e = etat.objets[id];
  if (e?.classe !== "escalier") throw new ErreurCommande("precondition", "id", `escalier inconnu : ${id}`);
  const dalleId = lire.chaine(p, "dalleId");
  const d = etat.objets[dalleId];
  if (d?.classe !== "dalle") throw new ErreurCommande("precondition", "dalleId", `dalle inconnue : ${dalleId}`);
  const marge = lire.nombre(p, "marge", { optionnel: true, min: 0, max: 5 }) ?? 0;
  const trou = empriseEscalier(e as Occurrence<"escalier">, marge);
  const contour = d.params.contour;
  if (!trou.every((q) => pointDansPolygone(q, contour)) || sesCotes(trou).some(([a, b]) => sesCotes(contour).some(([c, f]) => intersectionSegments(a, b, c, f)))) throw new ErreurCommande("precondition", "dalleId", `l'emprise de l'escalier ne tient pas dans la dalle ${dalleId}`);
  const autre = d.params.trous.findIndex((t) => seChevauchent(trou, t));
  if (autre >= 0) throw new ErreurCommande("precondition", "dalleId", `l'emprise chevauche le trou ${autre + 1} de la dalle ${dalleId}`);
  const effets = effetsVides();
  effets.modifies.push(dalleId);
  if (d.niveauId) effets.niveauxTouches.push(d.niveauId);
  const dalle = { ...d, params: { ...d.params, trous: [...d.params.trous, trou] } } as OccurrenceQuelconque;
  return { etat: { ...etat, objets: { ...etat.objets, [dalleId]: dalle } }, effets };
}
