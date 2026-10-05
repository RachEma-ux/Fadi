/**
 * Arrondir des sommets (D-063, fiches DA-02-10, DA-01-04) : `esquisse.arrondirSommets` { id, rayon, sommets? }
 * remplace chaque sommet visé d'une polyligne, d'un polygone ou d'un rectangle par un segment en arc tangent à ses
 * deux côtés (renflement DXF) : la forme devient une polyligne (fermée si elle l'était). `sommets` absent : tous les
 * sommets qui le permettent (les extrémités d'une polyligne ouverte ne s'arrondissent pas). Refus nominatifs :
 * rayon trop grand pour un côté (les deux raccords d'un même côté comptés), côtés alignés, objet lié.
 */
import { ErreurCommande, effetsVides, lire, type ResultatCommande } from "../commandes/base.js";
import { validerParams } from "../commandes/validation.js";
import { distance, type Vec } from "../geometrie.js";
import { referencesVers, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque } from "../modele.js";
import { pt, type Point2 } from "../unites.js";

type Brut = Record<string, unknown>;

export function arrondirSommets(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const o = etat.objets[id]!;
  if (o.classe !== "esquisse" || !["polyligne", "polygone", "rectangle"].includes(o.params.forme)) throw new ErreurCommande("precondition", "id", "arrondir : polylignes, polygones et rectangles d'esquisse");
  const e = o as Occurrence<"esquisse">;
  if (referencesVers(etat, id).length || Object.values(etat.relations).some((r) => r.sourceId === id || r.targetId === id)) throw new ErreurCommande("precondition", "id", `${id} est visé par une cote, une contrainte ou une relation : la détacher d'abord`);
  const rayon = lire.longueur(p, "rayon", { strict: true })!.value;
  const q = e.params;
  const pts: Point2[] = q.forme === "rectangle" && q.points.length === 2 ? [pt(q.points[0]!.x, q.points[0]!.y), pt(q.points[1]!.x, q.points[0]!.y), pt(q.points[1]!.x, q.points[1]!.y), pt(q.points[0]!.x, q.points[1]!.y)] : q.points;
  const ferme = q.ferme || q.forme === "polygone" || q.forme === "rectangle";
  const n = pts.length;
  const anciens = q.renflements ?? [];
  const eligible = (i: number) => (ferme || (i > 0 && i < n - 1)) && (anciens[(i - 1 + n) % n] ?? 0) === 0 && (anciens[i] ?? 0) === 0;
  let vises: number[];
  if (p["sommets"] === undefined || p["sommets"] === null) vises = Array.from({ length: n }, (_, i) => i).filter(eligible);
  else {
    const v = p["sommets"];
    if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x >= 0 && x < n)) throw new ErreurCommande("invalide", "sommets", `sommets : indices de 0 à ${n - 1}`);
    vises = [...new Set(v as number[])].sort((a, b) => a - b);
    for (const i of vises) if (!eligible(i)) throw new ErreurCommande("precondition", "sommets", `sommet ${i + 1} : extrémité d'une polyligne ouverte ou déjà en arc`);
  }
  if (!vises.length) throw new ErreurCommande("precondition", "sommets", "aucun sommet à arrondir");
  // Recul de chaque sommet visé : t = r / tan(φ/2), φ angle intérieur entre les deux côtés.
  const recul = new Map<number, { t: number; bulge: number }>();
  for (const i of vises) {
    const v = pts[i]!;
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[(i + 1) % n]!;
    const u1 = { x: (v.x - a.x) / distance(a, v), y: (v.y - a.y) / distance(a, v) };
    const u2 = { x: (b.x - v.x) / distance(v, b), y: (b.y - v.y) / distance(v, b) };
    const croix = u1.x * u2.y - u1.y * u2.x;
    const deviation = Math.atan2(croix, u1.x * u2.x + u1.y * u2.y); // angle de virage signé (gauche > 0)
    if (Math.abs(deviation) < 1e-9) throw new ErreurCommande("precondition", "sommets", `sommet ${i + 1} : côtés alignés, rien à arrondir`);
    const t = rayon * Math.tan(Math.abs(deviation) / 2);
    // Un virage à gauche est un arc parcouru en sens direct : renflement positif.
    recul.set(i, { t, bulge: Math.tan(deviation / 4) });
  }
  // Chaque côté doit porter les reculs de ses deux extrémités.
  for (let i = 0; i < n - (ferme ? 0 : 1); i++) {
    const j = (i + 1) % n;
    const l = distance(pts[i]!, pts[j]!);
    if ((recul.get(i)?.t ?? 0) + (recul.get(j)?.t ?? 0) > l + 1e-9) throw new ErreurCommande("precondition", "rayon", `rayon trop grand pour le côté ${i + 1}–${j + 1} (${l.toFixed(3)} m)`);
  }
  const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
  const nouveaux: Point2[] = [];
  const renflements: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i]!;
    const rr = recul.get(i);
    const sortie = anciens[i] ?? 0; // renflement du côté i → i+1 (inchangé)
    if (!rr) {
      nouveaux.push(v);
      if (ferme || i < n - 1) renflements.push(sortie);
      continue;
    }
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[(i + 1) % n]!;
    const vers = (de: Vec, k: number): Point2 => {
      const l = distance(v, de);
      return pt(r9(v.x + ((de.x - v.x) / l) * k), r9(v.y + ((de.y - v.y) / l) * k));
    };
    nouveaux.push(vers(a, rr.t), vers(b, rr.t));
    renflements.push(Math.round(rr.bulge * 1e12) / 1e12, sortie);
  }
  if (!ferme) renflements.splice(nouveaux.length - 1);
  const params = validerParams(etat, "esquisse", { ...q, forme: "polyligne", points: nouveaux, ferme, renflements } as unknown as Brut);
  const effets = effetsVides();
  effets.modifies.push(id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, params } as OccurrenceQuelconque } }, effets };
}
