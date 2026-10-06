/**
 * Hachures associatives (D-092, fiche DA-01-11) : après chaque commande, une hachure liée à un objet source reprend
 * le contour fermé de sa source s'il a changé (même commande, même révision) ; source supprimée ou devenue ouverte :
 * la hachure garde son dernier contour et perd le lien (dit dans les effets). Une hachure verrouillée ne suit pas.
 */
import { REFERENCE_EXTERNE, versRepereProjet, type ParamsReferenceExterne } from "./refexterne.js";
import { pointsArc, pointsEllipse, pointsPolyligne, pointsSpline } from "../geometrie.js";
import type { Contour, ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";
import { pt, type Point2 } from "../unites.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, type ContexteCommande, type Effets, type ResultatCommande } from "./base.js";
import { creerOccurrence } from "./objets.js";
import { contourFerme } from "./changer-classe.js";

/**
 * Profil fermé d'une esquisse ou d'un contour (D-114, solide associatif) : contours fermés exacts, et courbes fermées
 * discrétisées (cercle et ellipse 48 points, courbe fermée 8 points par segment, polyligne fermée à arcs).
 */
export function profilFerme(o: OccurrenceQuelconque): Contour | null {
  const c = contourFerme(o);
  if (c) return c;
  if (o.classe !== "esquisse") return null;
  const q = o.params;
  const r6 = (v: { x: number; y: number }) => ({ x: Math.round(v.x * 1e9) / 1e9, y: Math.round(v.y * 1e9) / 1e9, frame: "local" as const, unit: "m" as const });
  if (q.forme === "cercle" && q.centre && q.rayon) return { contour: pointsArc(q.centre, q.rayon.value, 0, 360, 48).slice(0, -1).map(r6), trous: [] };
  if (q.forme === "ellipse" && q.centre && q.rayon && q.rayonB) return { contour: pointsEllipse(q.centre, q.rayon.value, q.rayonB.value, q.rotation?.value ?? 0, 48).map(r6), trous: [] };
  if (q.forme === "spline" && q.ferme && q.points.length >= 3) {
    const p = pointsSpline(q.points, 8, true, q.tangentes);
    return { contour: (p.length > 1 && p[0]!.x === p[p.length - 1]!.x && p[0]!.y === p[p.length - 1]!.y ? p.slice(0, -1) : p).map(r6), trous: [] };
  }
  if (q.forme === "polyligne" && q.ferme && q.renflements) return { contour: pointsPolyligne(q.points, true, q.renflements).map(r6), trous: [] };
  return null;
}

export function suivreHachures(etat: ModeleAtelier, effets: Effets): { etat: ModeleAtelier; effets: Effets } {
  let objets = etat.objets;
  const modifies: string[] = [];
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "esquisse" || o.params.forme !== "hachure" || !o.params.sourceId || o.verrouille) continue;
    const h = o as Occurrence<"esquisse">;
    const source = etat.objets[h.params.sourceId!];
    const c = source ? contourFerme(source) : null;
    if (!c) {
      const { sourceId: _s, ...reste } = h.params;
      void _s;
      objets = { ...objets, [h.id]: { ...h, params: reste } };
      modifies.push(h.id);
      continue;
    }
    const meme = c.contour.length === h.params.points.length && c.contour.every((q, i) => q.x === h.params.points[i]!.x && q.y === h.params.points[i]!.y);
    if (meme) continue;
    objets = { ...objets, [h.id]: { ...h, params: { ...h.params, points: c.contour.map((q) => ({ ...q })) } } };
    modifies.push(h.id);
  }
  // Solides associés (D-114) : le contour suit le profil fermé de l'esquisse source ; source supprimée ou ouverte :
  // le solide garde son dernier contour et perd le lien.
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "solide" || !o.params.sourceId || o.verrouille) continue;
    const s = o as Occurrence<"solide">;
    const source = etat.objets[s.params.sourceId!];
    const c = source ? profilFerme(source) : null;
    if (!c) {
      const { sourceId: _s, ...reste } = s.params;
      void _s;
      objets = { ...objets, [s.id]: { ...s, params: reste } };
      modifies.push(s.id);
      continue;
    }
    const meme = c.contour.length === s.params.contour.length && c.contour.every((q, i) => q.x === s.params.contour[i]!.x && q.y === s.params.contour[i]!.y) && JSON.stringify(c.trous) === JSON.stringify(s.params.trous);
    if (meme) continue;
    objets = { ...objets, [s.id]: { ...s, params: { ...s.params, contour: c.contour.map((q) => ({ ...q })), trous: c.trous.map((t) => t.map((q) => ({ ...q }))) } } };
    modifies.push(s.id);
  }
  // Axes associés (D-132) : la ligne passe par le centre de sa source, dans sa direction, débord compris.
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "esquisse" || !o.params.axeDe || o.verrouille) continue;
    const a = o as Occurrence<"esquisse">;
    const source = etat.objets[a.params.axeDe!.sourceId];
    const pts = source ? pointsAxeAssocie(source, a.params.axeDe!) : null;
    if (!pts) {
      const { axeDe: _x, ...reste } = a.params;
      void _x;
      objets = { ...objets, [a.id]: { ...a, params: reste } };
      modifies.push(a.id);
      continue;
    }
    if (pts.every((q, i) => q.x === a.params.points[i]?.x && q.y === a.params.points[i]?.y) && a.params.points.length === 2) continue;
    objets = { ...objets, [a.id]: { ...a, params: { ...a.params, points: pts } } };
    modifies.push(a.id);
  }
  // Cotes sur une référence externe (D-153) : extrémités recalculées par le calage courant ; source épinglée sur une
  // autre publication : « à vérifier » ; référence détachée : la cote garde sa dernière position et perd le lien.
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "cotation" || !o.params.externe || o.verrouille) continue;
    const k = o as Occurrence<"cotation">;
    const ex = k.params.externe!;
    const def = etat.definitions[ex.referenceId];
    if (!def || def.classe !== REFERENCE_EXTERNE) {
      const { externe: _e, ...reste } = k.params;
      void _e;
      objets = { ...objets, [k.id]: { ...k, params: reste } };
      modifies.push(k.id);
      continue;
    }
    const ref = def.params as unknown as ParamsReferenceExterne;
    const P = (v: { x: number; y: number }) => { const r = versRepereProjet(v, ref); return pt(r.x, r.y); };
    const a = P(ex.a);
    const b = P(ex.b);
    const aVerifier = ex.revisionSource !== ref.revisionSource;
    if (a.x === k.params.a.x && a.y === k.params.a.y && b.x === k.params.b.x && b.y === k.params.b.y && aVerifier === !!ex.aVerifier) continue;
    const { aVerifier: _v, ...exReste } = ex;
    void _v;
    objets = { ...objets, [k.id]: { ...k, params: { ...k.params, a, b, externe: { ...exReste, ...(aVerifier ? { aVerifier: true as const } : {}) } } } };
    modifies.push(k.id);
  }
  if (!modifies.length) return { etat, effets };
  return { etat: { ...etat, objets }, effets: { ...effets, modifies: [...new Set([...effets.modifies, ...modifies])] } };
}

/** Extrémités d'un axe associé (D-132) : centre ± (demi-étendue du contour dans la direction + débord). */
export function pointsAxeAssocie(source: OccurrenceQuelconque, axe: { angle: number; debord: number }): Point2[] | null {
  if (source.classe !== "esquisse" || !source.params.centre || !source.params.rayon) return null;
  const q = source.params;
  const rot = q.forme === "ellipse" ? (q.rotation?.value ?? 0) : 0;
  const t = ((axe.angle + rot) * Math.PI) / 180;
  const u = { x: Math.cos(t), y: Math.sin(t) };
  // Demi-étendue : rayon ; ellipse : rayon dans la direction de l'axe (relative à son grand axe).
  let r = q.rayon!.value;
  if (q.forme === "ellipse" && q.rayonB) {
    const a = (axe.angle * Math.PI) / 180;
    r = 1 / Math.sqrt((Math.cos(a) / q.rayon!.value) ** 2 + (Math.sin(a) / q.rayonB.value) ** 2);
  }
  const L = r + axe.debord;
  const c = q.centre!;
  const r9 = (v: number) => Math.round(v * 1e9) / 1e9;
  return [pt(r9(c.x - u.x * L), r9(c.y - u.y * L)), pt(r9(c.x + u.x * L), r9(c.y + u.y * L))];
}

/** `esquisse.axesCentre` (D-132) : deux axes associés (0° et 90°) au centre d'un cercle, d'un arc ou d'une ellipse. */
export function creerAxesCentre(etat: ModeleAtelier, p: Record<string, unknown>, ctx: ContexteCommande): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const s = etat.objets[id]!;
  const debord = lire.nombre(p, "debord", { min: 0, max: 100 })!;
  if (s.classe !== "esquisse" || !s.params.centre || !s.params.rayon) throw new ErreurCommande("precondition", "id", `${id} : cercle, arc ou ellipse attendu`);
  let courant = etat;
  let effets = effetsVides();
  for (const angle of [0, 90]) {
    const pts = pointsAxeAssocie(s, { angle, debord })!;
    const r = creerOccurrence(courant, { niveauId: s.niveauId, calqueId: s.calqueId, params: { forme: "construction", points: pts, ferme: false, axeDe: { sourceId: id, angle, debord } } }, ctx, "esquisse");
    courant = r.etat;
    effets = fusionnerEffets(effets, r.effets);
  }
  return { etat: courant, effets };
}
