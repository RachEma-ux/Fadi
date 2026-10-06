/**
 * Ajuster une forme fermée sans la décomposer (D-117, DA-02-07) : polygone, rectangle ou hachure d'esquisse, dalle,
 * toiture, zone, pièce, solide (contour fermé) coupés par la droite porteuse d'une limite droite (axe de mur, ligne,
 * escalier). Le côté gardé est celui du point `cote` ; la forme reste un seul objet (mêmes identifiant, calque,
 * propriétés). Refus motivés : limite courbe, forme non coupée, coupe en plusieurs morceaux, trou coupé par la limite,
 * aire déclarée renseignée (elle ne vaudrait plus), forme associée (elle suit sa source), segments en arc.
 */
import type { ModeleAtelier, OccurrenceQuelconque } from "../modele.js";
import { pt, type Point2 } from "../unites.js";
import { ErreurCommande, effetsVides, lire, type ResultatCommande } from "./base.js";
import { validerParams } from "./validation.js";

type Brut = Record<string, unknown>;
type V = { x: number; y: number };
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const EPS = 1e-9;

/** Vrai si l'objet est une forme fermée que l'ajustement coupe sans la décomposer. */
export function estFormeFermee(o: OccurrenceQuelconque): boolean {
  if (o.classe === "esquisse") return o.params.ferme === true && (o.params.forme === "polygone" || o.params.forme === "rectangle" || o.params.forme === "hachure" || o.params.forme === "polyligne");
  if (o.classe === "solide") return o.params.ferme;
  return o.classe === "dalle" || o.classe === "toiture" || o.classe === "zone" || o.classe === "piece";
}

/** Coupe d'un polygone simple par une droite : partie du côté signe > 0 ; refus si plusieurs morceaux. */
export function couperPolygone(poly: readonly V[], a: V, b: V, signe: 1 | -1): Point2[] | "intact" | "vide" | "morceaux" {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const L = Math.hypot(d.x, d.y);
  const s = (q: V) => (signe * (d.x * (q.y - a.y) - d.y * (q.x - a.x))) / L;
  const v = poly.map(s);
  const garde = v.filter((x) => x > EPS).length;
  const jete = v.filter((x) => x < -EPS).length;
  if (jete === 0) return "intact";
  if (garde === 0) return "vide";
  // Changements de signe (zéros ignorés) le long du contour : deux pour un seul morceau.
  const nonNuls = v.filter((x) => Math.abs(x) > EPS);
  let changements = 0;
  for (let i = 0; i < nonNuls.length; i++) if (Math.sign(nonNuls[i]!) !== Math.sign(nonNuls[(i + 1) % nonNuls.length]!)) changements++;
  if (changements > 2) return "morceaux";
  const out: Point2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const sp = v[i]!;
    const sq = v[(i + 1) % n]!;
    if (sp >= -EPS) out.push(pt(r9(p.x), r9(p.y)));
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      const t = sp / (sp - sq);
      out.push(pt(r9(p.x + (q.x - p.x) * t), r9(p.y + (q.y - p.y) * t)));
    }
  }
  const net = out.filter((q, i) => {
    const r = out[(i + 1) % out.length]!;
    return Math.hypot(q.x - r.x, q.y - r.y) > EPS;
  });
  return net.length >= 3 ? net : "vide";
}

export function ajusterForme(etat: ModeleAtelier, p: Brut, o: OccurrenceQuelconque, limite: { a: V; b: V }): ResultatCommande {
  const cote = lire.point(p, "cote", { optionnel: true });
  if (!cote) throw new ErreurCommande("invalide", "cote", "forme fermée : indiquer le côté à garder (point `cote`)");
  const d = { x: limite.b.x - limite.a.x, y: limite.b.y - limite.a.y };
  const sc = d.x * (cote.y - limite.a.y) - d.y * (cote.x - limite.a.x);
  if (Math.abs(sc) < 1e-12) throw new ErreurCommande("invalide", "cote", "point sur la limite : choisir un côté");
  const signe: 1 | -1 = sc > 0 ? 1 : -1;
  const q = o.params as unknown as Brut;
  if (q["sourceId"]) throw new ErreurCommande("precondition", "id", `${o.id} suit sa source : ajuster la source`);
  if (q["aireDeclaree"]) throw new ErreurCommande("precondition", "id", "une aire déclarée est renseignée : elle ne vaudrait plus après l'ajustement — la retirer d'abord");
  if (Array.isArray(q["renflements"]) && (q["renflements"] as number[]).some((x) => x !== 0)) throw new ErreurCommande("precondition", "id", "segments en arc : décomposer d'abord");
  let contour: V[];
  let trous: V[][] = [];
  if (o.classe === "esquisse") {
    const pts = o.params.points;
    contour = o.params.forme === "rectangle" && pts.length === 2 ? [pts[0]!, pt(pts[1]!.x, pts[0]!.y), pts[1]!, pt(pts[0]!.x, pts[1]!.y)] : [...pts];
  } else {
    contour = [...(q["contour"] as V[])];
    trous = ((q["trous"] as V[][] | undefined) ?? []).map((h) => [...h]);
  }
  const r = couperPolygone(contour, limite.a, limite.b, signe);
  if (r === "intact") throw new ErreurCommande("precondition", "limiteId", "la limite ne coupe pas la forme du côté gardé : rien à ajuster");
  if (r === "vide") throw new ErreurCommande("precondition", "cote", "rien ne resterait de ce côté de la limite");
  if (r === "morceaux") throw new ErreurCommande("precondition", "limiteId", "la limite couperait la forme en plusieurs morceaux : la scinder d'abord");
  const trousGardes: Point2[][] = [];
  for (const h of trous) {
    const k = couperPolygone(h, limite.a, limite.b, signe);
    if (k === "intact") trousGardes.push(h.map((x) => pt(x.x, x.y)));
    else if (k !== "vide") throw new ErreurCommande("precondition", "limiteId", "un trou est coupé par la limite : le retirer ou le modifier d'abord");
  }
  let brut: Brut;
  if (o.classe === "esquisse") brut = { ...q, forme: o.params.forme === "rectangle" ? "polygone" : o.params.forme, points: r, ferme: true };
  else {
    brut = { ...q, contour: r, trous: trousGardes };
    const et = q["etiquette"] as V | null | undefined;
    const se = et ? d.x * (et.y - limite.a.y) - d.y * (et.x - limite.a.x) : 0;
    if (et && se !== 0 && Math.sign(se) !== signe) brut["etiquette"] = null; // étiquette du côté retiré
  }
  const params = validerParams(etat, o.classe, brut);
  const effets = effetsVides();
  effets.modifies.push(o.id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [o.id]: { ...o, params } as OccurrenceQuelconque } }, effets };
}
