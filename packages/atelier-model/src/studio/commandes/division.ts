import { studioPolylineSegmentCount } from "../courbes.js";
import { STUDIO_INDEXED_ANCHOR, type StudioAnchor } from "../noyau/ancres.js";
import type { StudioPoint } from "../noyau/types.js";
import { fail, same } from "../noyau/validation.js";
import type { StudioDimensionLink } from "../objets/cote.js";
import { studioStraightSegment } from "../objets/cote-angulaire.js";
import { studioAnchorPoint, validerForme } from "../objets/index.js";
import type { StudioShape } from "../objets/formes.js";
import { editable, type Etat } from "./etat.js";

type Polyligne = Extract<StudioShape, { type: "polyline" }>;

/**
 * Division d'un segment droit de polyligne (lot F1, TEST-007), au point situé à `distance` de son premier sommet : un
 * sommet est inséré au rang i + 1, les autres sommets gardent leurs coordonnées. Chaque lien de cote vers cette
 * polyligne est soit **réattaché de façon prouvée** — nouveau rang calculé, puis égalité exacte des coordonnées de
 * l'ancien et du nouveau sommet (ou des extrémités du segment pour une cote angulaire) contrôlée —, soit rompu : la
 * cote passe « à résoudre » avec sa dernière géométrie, jamais rattachée par approximation. Le milieu du segment divisé
 * n'existe plus : il n'est réattaché qu'au nouveau sommet, et seulement si celui-ci coïncide exactement avec lui ; une
 * cote angulaire liée au segment divisé est rompue (ses deux moitiés sont de nouveaux segments). Un segment courbe
 * (renflement non nul) n'est pas divisé : refus explicite.
 *
 * Rend le nombre de liens réattachés (rang changé) et rompus, pour le compte rendu de la commande.
 */
export function diviserSegmentPolyligne(state: Etat, polyId: string, segment: number, distance: number, path: string): { reattaches: number; rompus: number } {
  const index = state.objects.findIndex((o) => o.id === polyId);
  const avant = state.objects[index];
  if (!avant || avant.type !== "polyline") return fail(path, `polyligne introuvable : ${polyId}`);
  editable(state, avant, path);
  const n = avant.points.length;
  if (!Number.isInteger(segment) || segment < 0 || segment >= studioPolylineSegmentCount(avant)) fail(`${path}.params.face`, `segment ${segment} inexistant`);
  if ((avant.bulges?.[segment] ?? 0) !== 0) fail(`${path}.params.face`, "segment courbe (renflement) : division non prise en charge");
  const a = avant.points[segment]!, b = avant.points[(segment + 1) % n]!;
  const longueur = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(distance > 0 && distance < longueur)) fail(`${path}.params.distance`, `distance strictement comprise entre 0 et la longueur de l’arête (${longueur} m) attendue`);
  const k = distance / longueur;
  const p: StudioPoint = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  if (same(p, a) || same(p, b)) fail(`${path}.params.distance`, "le point de division se confond avec un sommet de l’arête");
  const rang = segment + 1;
  const points = [...avant.points.slice(0, rang), p, ...avant.points.slice(rang)];
  const bulges = avant.bulges ? [...avant.bulges.slice(0, rang), 0, ...avant.bulges.slice(rang)] : undefined;
  const apres = validerForme({ ...avant, points, ...(bulges ? { bulges } : {}) }, path) as Polyligne;
  state.objects[index] = apres;

  let reattaches = 0, rompus = 0;
  /** Nouvelle ancre d'un sommet ou d'un milieu indexé, puis preuve par égalité exacte ; null = lien rompu. */
  const ancre = (l: StudioDimensionLink): StudioDimensionLink | null => {
    const m = STUDIO_INDEXED_ANCHOR.exec(l.anchor);
    if (!m) return l;
    const i = Number(m[2]);
    const ancien = studioAnchorPoint(avant, l.anchor);
    let nouvelle: StudioAnchor;
    if (m[1] === "vertex") nouvelle = `vertex-${i >= rang ? i + 1 : i}`;
    else if (i < segment) nouvelle = l.anchor;
    else if (i > segment) nouvelle = `mid-${i + 1}`;
    else nouvelle = `vertex-${rang}`; // milieu du segment divisé : seulement s'il coïncide avec le nouveau sommet
    const q = studioAnchorPoint(apres, nouvelle);
    if (!ancien || !q || !same(ancien, q)) return null;
    if (nouvelle !== l.anchor) reattaches++;
    return { objectId: l.objectId, anchor: nouvelle };
  };
  state.dimensions = state.dimensions.map((d) => {
    const concerne = (l: StudioDimensionLink | null) => !!l && l.objectId === polyId;
    if (!concerne(d.links.start) && !concerne(d.links.end)) return d;
    const start = concerne(d.links.start) ? ancre(d.links.start!) : d.links.start;
    const end = concerne(d.links.end) ? ancre(d.links.end!) : d.links.end;
    const casse = (concerne(d.links.start) && !start) || (concerne(d.links.end) && !end);
    if (!casse && start === d.links.start && end === d.links.end) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    if (casse) rompus++;
    return { ...d, links: { start, end }, toResolve: casse ? true : d.toResolve };
  });
  /** Segment d'une cote angulaire : rang décalé au-delà du segment divisé, preuve par mêmes extrémités ; null = rompu. */
  const seg = (l: { objectId: string; segment: number }): { objectId: string; segment: number } | null => {
    if (l.segment === segment) return null;
    const nouveau = l.segment > segment ? l.segment + 1 : l.segment;
    const s0 = studioStraightSegment(avant, l.segment), s1 = studioStraightSegment(apres, nouveau);
    if (!s0 || !s1 || !same(s0.a, s1.a) || !same(s0.b, s1.b)) return null;
    if (nouveau !== l.segment) reattaches++;
    return nouveau === l.segment ? l : { objectId: l.objectId, segment: nouveau };
  };
  state.annotations = state.annotations.map((x) => {
    if (x.type !== "angular-dimension") return x;
    const concerne = (l: { objectId: string } | null) => !!l && l.objectId === polyId;
    if (!concerne(x.links.first) && !concerne(x.links.second)) return x;
    const first = concerne(x.links.first) ? seg(x.links.first!) : x.links.first;
    const second = concerne(x.links.second) ? seg(x.links.second!) : x.links.second;
    const casse = (concerne(x.links.first) && !first) || (concerne(x.links.second) && !second);
    if (!casse && first === x.links.first && second === x.links.second) return x;
    editable(state, x, `${path} (cote angulaire liée ${x.id})`);
    if (casse) { rompus++; return { ...x, links: { first: first ?? null, second: second ?? null }, toResolve: true }; }
    return { ...x, links: { first: first ?? null, second: second ?? null } };
  });
  return { reattaches, rompus };
}
