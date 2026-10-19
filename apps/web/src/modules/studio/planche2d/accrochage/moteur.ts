/**
 * Moteur d'accrochage de la planche 2D (Studio) : candidats d'accrochage aux objets (extrémité, milieu, centre,
 * quadrant, intersection, perpendiculaire et tangente depuis le dernier point posé, point le plus proche), repérage
 * orthogonal et polaire depuis le dernier point, angle imposé par la saisie. Repère `local-2d`, mètres ; les angles
 * se comptent depuis +x vers +y (sens trigonométrique du modèle).
 *
 * Règles de priorité (déterministes, contrôlées par test) :
 *  1. Un angle imposé (« <45 ») l'emporte sur tout : le point reste sur la droite imposée.
 *  2. Points géométriques exacts (extrémité, intersection, milieu, centre, quadrant) ;
 *  3. puis points relatifs au dernier point posé (perpendiculaire, tangente) ;
 *  4. puis repérage orthogonal (Maj tenue ou bascule) ou polaire ;
 *  5. puis le point le plus proche sur un objet ; à défaut, la grille ou le centimètre (espace de travail).
 *  Dans un même rang, le plus proche du pointeur gagne ; à distance égale (1e-12 m), l'ordre de `MODES_ACCROCHAGE`,
 *  puis l'ordre des objets dans le document, puis l'ordre de construction.
 * Seuls les objets dont la boîte recoupe la zone utile (vue ∩ disque de tolérance autour du pointeur) sont examinés
 * (`IndexAccrochage`). Dérivé : rien ici ne modifie le document. Pur : ni React ni DOM.
 */
import type { StudioAnchor, StudioPoint } from "@parcours/atelier-model";
import type { PointAccroche } from "../geometrie-2d";
import { boiteAutour, boiteEntite, intersectionBoites, seRecouvrent, surArc, type Boite, type Entite, type IndexAccrochage } from "./entites";
import { distance, intersectionsEntites, net, netPoint, piedsPerpendiculaires, plusProche, pointsTangence } from "./intersections";

export type ModeAccrochage = "extremite" | "intersection" | "milieu" | "centre" | "quadrant" | "perpendiculaire" | "tangente" | "proche";
/** Ordre de départage à distance égale (et ordre d'affichage des bascules). */
export const MODES_ACCROCHAGE: readonly ModeAccrochage[] = Object.freeze(["extremite", "intersection", "milieu", "centre", "quadrant", "perpendiculaire", "tangente", "proche"]);
/** Modes actifs à l'ouverture : les sommets nommés (comportement d'origine) et les intersections. */
export const MODES_PAR_DEFAUT: ReadonlySet<ModeAccrochage> = new Set<ModeAccrochage>(["extremite", "intersection", "milieu", "centre", "quadrant"]);

export type GenreRepere = ModeAccrochage | "orthogonal" | "polaire" | "angle";
/** Libellé affiché près du repère (français, traduit par le dictionnaire anglais). */
export const LIBELLES_REPERE: Readonly<Record<GenreRepere, string>> = Object.freeze({
  extremite: "Extrémité", intersection: "Intersection", milieu: "Milieu", centre: "Centre", quadrant: "Quadrant",
  perpendiculaire: "Perpendiculaire", tangente: "Tangente", proche: "Proche", orthogonal: "Orthogonal", polaire: "Polaire", angle: "Angle imposé",
});

/** Rang de priorité : 0 points exacts, 1 relatifs au dernier point, 2 repérage, 3 plus proche. */
export const rangRepere = (g: GenreRepere): number =>
  g === "perpendiculaire" || g === "tangente" ? 1 : g === "orthogonal" || g === "polaire" || g === "angle" ? 2 : g === "proche" ? 3 : 0;

export interface Repere {
  genre: GenreRepere;
  point: StudioPoint;
  /** Objets qui portent le point (deux pour une intersection ; aucun pour le repérage). */
  objets: readonly string[];
  /** Sommet nommé du modèle : il lie une cote ; null pour un point construit (intersection, perpendiculaire…). */
  ancre: PointAccroche | null;
  /** Distance au pointeur (mètres). */
  distance: number;
  /** Repérage : direction suivie (radians) et ligne guide depuis le dernier point. */
  angle?: number;
  guide?: { de: StudioPoint; vers: StudioPoint };
}

export interface ReglagesAccrochage {
  /** Accrochage aux objets (bascule « Accrocher aux sommets ») : coupé, aucun mode d'objet ne joue. */
  objets: boolean;
  modes: ReadonlySet<ModeAccrochage>;
  orthogonal: boolean;
  polaire: boolean;
  /** Pas du repérage polaire, en degrés (15, 30, 45 ou 90). */
  pasPolaire: number;
}

export const PAS_POLAIRES: readonly number[] = Object.freeze([15, 30, 45, 90]);
export const pasPolaireSuivant = (pas: number): number => PAS_POLAIRES[(PAS_POLAIRES.indexOf(pas) + 1) % PAS_POLAIRES.length]!;

export interface RequeteAccrochage {
  curseur: StudioPoint;
  /** Tolérance (mètres). */
  tolerance: number;
  /** Dernier point posé (perpendiculaire, tangente, repérage) ; null avant le premier point. */
  base: StudioPoint | null;
  /** Vue affichée : aucun candidat hors de la vue. */
  vue?: Boite | undefined;
  exclure?: ReadonlySet<string> | undefined;
  /** Angle imposé par la saisie (degrés), ou null. */
  verrouAngle?: number | null | undefined;
  /** Pas des longueurs suivies (mètres) : 0,01 par défaut, le pas de grille quand elle est active. */
  pasLongueur?: number | undefined;
}

const modeAncre = (a: StudioAnchor): ModeAccrochage =>
  a === "mid" || a.startsWith("mid-") ? "milieu" : a === "center" ? "centre" : a.startsWith("quadrant-") ? "quadrant" : "extremite";

const dans = (b: Boite, p: StudioPoint) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y;

type Candidat = Repere & { rang: number; seq: number };

function comparer(a: Candidat, b: Candidat): number {
  const r = rangRepere(a.genre) - rangRepere(b.genre);
  if (r) return r;
  if (Math.abs(a.distance - b.distance) > 1e-12) return a.distance - b.distance;
  const m = MODES_ACCROCHAGE.indexOf(a.genre as ModeAccrochage) - MODES_ACCROCHAGE.indexOf(b.genre as ModeAccrochage);
  return m || a.rang - b.rang || a.seq - b.seq;
}

/** Tous les candidats d'accrochage aux objets à `tolerance` du pointeur, du plus prioritaire au moins prioritaire. */
export function candidatsObjets(index: IndexAccrochage, q: RequeteAccrochage, r: ReglagesAccrochage): Repere[] {
  if (!r.objets || !(q.tolerance > 0)) return [];
  const disque = boiteAutour(q.curseur, q.tolerance);
  const zone = q.vue ? intersectionBoites(disque, q.vue) : disque;
  if (!zone) return [];
  const formes = index.formes(zone).filter((f) => !q.exclure?.has(f.forme.id));
  const out: Candidat[] = [];
  let seq = 0;
  const poser = (genre: ModeAccrochage, point: StudioPoint, objets: string[], rang: number, ancre: PointAccroche | null = null) => {
    if (!r.modes.has(genre)) return;
    const d = distance(point, q.curseur);
    if (d > q.tolerance || (q.vue && !dans(q.vue, point))) return;
    out.push({ genre, point, objets, ancre, distance: d, rang, seq: seq++ });
  };

  const proches: { e: Entite; rang: number }[] = [];
  for (const f of formes) {
    // Sommets nommés du modèle (ils lient une cote).
    for (const a of f.ancres) poser(modeAncre(a.anchor), { ...a.point }, [f.forme.id], f.rang, { point: { ...a.point }, objectId: f.forme.id, anchor: a.anchor });
    for (const e of f.entites) {
      if (!seRecouvrent(boiteEntite(e), zone)) continue;
      proches.push({ e, rang: f.rang });
      // Points construits sans sommet nommé : milieux des côtés d'un rectangle, centre et quadrants des arcs.
      if (e.type === "segment" && f.forme.type === "rectangle") poser("milieu", netPoint({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }), [f.forme.id], f.rang);
      if (e.type === "arc") {
        if (e.renflement) poser("centre", netPoint(e.c), [f.forme.id], f.rang);
        for (const k of [0, 1, 2, 3]) {
          const u = (k * Math.PI) / 2;
          const p = netPoint({ x: e.c.x + e.r * Math.cos(u), y: e.c.y + e.r * Math.sin(u) });
          if (surArc(e, u)) poser("quadrant", p, [f.forme.id], f.rang);
        }
      }
    }
  }
  // Intersections deux à deux des entités proches (une même polyligne peut se recouper).
  if (r.modes.has("intersection")) {
    for (let i = 0; i < proches.length; i++) {
      for (let j = i + 1; j < proches.length; j++) {
        const a = proches[i]!, b = proches[j]!;
        if (!seRecouvrent(boiteEntite(a.e), boiteEntite(b.e))) continue;
        const ids = a.e.objectId === b.e.objectId ? [a.e.objectId] : [a.e.objectId, b.e.objectId];
        for (const p of intersectionsEntites(a.e, b.e)) poser("intersection", p, ids, Math.min(a.rang, b.rang));
      }
    }
  }
  for (const { e, rang } of proches) {
    if (q.base && r.modes.has("perpendiculaire")) for (const p of piedsPerpendiculaires(e, q.base)) poser("perpendiculaire", p, [e.objectId], rang);
    if (q.base && r.modes.has("tangente")) for (const p of pointsTangence(e, q.base)) poser("tangente", p, [e.objectId], rang);
    if (r.modes.has("proche")) { const p = plusProche(e, q.curseur); if (p) poser("proche", p, [e.objectId], rang); }
  }
  return out.sort(comparer).map(({ rang: _r, seq: _s, ...c }) => c);
}

/** Point suivi sur la droite de direction `angle` (radians) depuis `base`, longueur arrondie au pas. */
function rayon(genre: "orthogonal" | "polaire" | "angle", base: StudioPoint, curseur: StudioPoint, angle: number, pas: number): Repere {
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const L = (curseur.x - base.x) * ux + (curseur.y - base.y) * uy;
  const Lr = net(Math.round(L / pas) * pas);
  const point = netPoint({ x: base.x + Lr * ux, y: base.y + Lr * uy });
  return { genre, point, objets: [], ancre: null, distance: distance(point, curseur), angle, guide: { de: { ...base }, vers: point } };
}

/** Angle normalisé à un multiple du pas (radians), le plus proche de la direction donnée. */
const multiple = (a: number, pas: number) => Math.round(a / pas) * pas;

/**
 * Repérage depuis le dernier point : angle imposé, puis orthogonal (multiples de 90°, toujours engagé), puis polaire
 * (multiples du pas, engagé quand le pointeur est à `tolerance` de la droite, en avant du dernier point).
 */
export function suivre(q: RequeteAccrochage, r: ReglagesAccrochage): Repere | null {
  const base = q.base;
  if (!base) return null;
  const pas = q.pasLongueur && q.pasLongueur > 0 ? q.pasLongueur : 0.01;
  if (q.verrouAngle !== null && q.verrouAngle !== undefined && Number.isFinite(q.verrouAngle)) return rayon("angle", base, q.curseur, (q.verrouAngle * Math.PI) / 180, pas);
  const dx = q.curseur.x - base.x, dy = q.curseur.y - base.y;
  if (dx === 0 && dy === 0) return null;
  const a = Math.atan2(dy, dx);
  if (r.orthogonal) return rayon("orthogonal", base, q.curseur, multiple(a, Math.PI / 2), pas);
  if (r.polaire && r.pasPolaire > 0) {
    const u = multiple(a, (r.pasPolaire * Math.PI) / 180);
    const ux = Math.cos(u), uy = Math.sin(u);
    const avant = dx * ux + dy * uy, ecart = Math.abs(dx * uy - dy * ux);
    if (avant > 0 && ecart <= q.tolerance) return rayon("polaire", base, q.curseur, u, pas);
  }
  return null;
}

/** Repère retenu selon les règles de priorité, ou null (l'espace de travail se rabat sur la grille ou le centimètre). */
export function resoudre(index: IndexAccrochage, q: RequeteAccrochage, r: ReglagesAccrochage): Repere | null {
  if (q.base && q.verrouAngle !== null && q.verrouAngle !== undefined) return suivre(q, r);
  const objets = candidatsObjets(index, q, r);
  const fort = objets[0] && rangRepere(objets[0].genre) <= 1 ? objets[0] : null;
  return fort ?? suivre(q, r) ?? objets[0] ?? null;
}

/** Libellé du repère : « Polaire 45° » pour le repérage polaire, le nom du mode sinon. */
export function libelleRepere(rep: Pick<Repere, "genre" | "angle">): string {
  if ((rep.genre === "polaire" || rep.genre === "angle" || rep.genre === "orthogonal") && rep.angle !== undefined) {
    const deg = Math.round(((((rep.angle * 180) / Math.PI) % 360) + 360) % 360 * 100) / 100;
    return `${LIBELLES_REPERE[rep.genre]} ${String(deg).replace(".", ",")}°`;
  }
  return LIBELLES_REPERE[rep.genre];
}
