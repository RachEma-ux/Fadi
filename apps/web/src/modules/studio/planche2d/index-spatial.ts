/**
 * Index spatial de la planche 2D (Studio) : grille uniforme sur les boîtes englobantes des éléments, utilisée par la
 * sélection par rectangle (`selection.ts`) et la collecte des candidats d'accrochage (`accrochage/entites.ts`) au-dessus
 * d'un seuil mesuré (`SEUIL_INDEX_SPATIAL`) ; en dessous, le parcours linéaire reste la règle.
 *
 * Contrat : `chercher(zone)` rend **exactement** les éléments dont la boîte recoupe la zone (bornes comprises, mêmes
 * comparaisons que `seRecouvrent`), dans l'ordre d'insertion — le même résultat qu'un parcours linéaire filtré, plus vite
 * (contrôlé par test de propriété sur des documents aléatoires). Une boîte non finie (élément sans tracé) ou très grande
 * est rangée à part et toujours examinée : rien n'est jamais écarté par l'index lui-même. Dérivé, jamais une donnée du
 * document. Pur : ni React ni DOM.
 */
import type { StudioPoint } from "@parcours/atelier-model";

export interface Boite2D { min: StudioPoint; max: StudioPoint }

/**
 * Nombre d'éléments à partir duquel l'index spatial remplace le parcours linéaire. Mesuré (banc C.1, Node 22,
 * documents aléatoires de 1 000 / 5 000 / 20 000 objets) : linéaire, une sélection par rectangle coûte 2,2 / 7,1 / 35 ms
 * et un survol d'accrochage 0,035 / 0,16 / 0,69 ms ; indexé, 0,02 ms et 0,03 ms à toute taille. Sous 1 000 éléments, le
 * parcours linéaire reste sous 2,5 ms (imperceptible) et ne garde aucune mémoire dérivée : il reste la règle.
 */
export const SEUIL_INDEX_SPATIAL = 1000;

export interface IndexSpatial<T> {
  readonly taille: number;
  /** Éléments dont la boîte recoupe `zone`, dans l'ordre d'insertion. */
  chercher(zone: Boite2D): T[];
}

const recoupe = (a: Boite2D, b: Boite2D): boolean => a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y;
const finie = (b: Boite2D): boolean => Number.isFinite(b.min.x) && Number.isFinite(b.min.y) && Number.isFinite(b.max.x) && Number.isFinite(b.max.y);

/** Parcours linéaire filtré : la référence de l'index (et son repli). */
export function indexLineaireBoites<T>(items: readonly T[], boite: (t: T) => Boite2D): IndexSpatial<T> {
  const boites = items.map(boite);
  return { taille: items.length, chercher: (zone) => items.filter((_, i) => recoupe(boites[i]!, zone)) };
}

/** Cellules au plus qu'un élément peut occuper avant d'être rangé parmi les grands (toujours examinés). */
const CELLULES_MAX_PAR_ELEMENT = 64;
/** Côté de la grille, en cellules, au plus. */
const COTE_MAX = 2048;

/**
 * Grille uniforme : environ deux éléments par cellule sur l'emprise de l'ensemble. Une requête qui couvre plus de
 * cellules qu'il n'y a d'éléments se rabat sur le parcours de tous (même résultat).
 */
export function indexGrille<T>(items: readonly T[], boite: (t: T) => Boite2D): IndexSpatial<T> {
  const n = items.length;
  const boites = items.map(boite);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boites) {
    if (!finie(b)) continue;
    if (b.min.x < x0) x0 = b.min.x;
    if (b.min.y < y0) y0 = b.min.y;
    if (b.max.x > x1) x1 = b.max.x;
    if (b.max.y > y1) y1 = b.max.y;
  }
  const tous = (zone: Boite2D) => items.filter((_, i) => recoupe(boites[i]!, zone));
  if (!(x1 >= x0 && y1 >= y0)) return { taille: n, chercher: tous };
  const w = x1 - x0, h = y1 - y0;
  const cote = Math.max(Math.sqrt((Math.max(w, 1e-9) * Math.max(h, 1e-9)) / Math.max(1, n / 2)), Math.max(w, h) / COTE_MAX, 1e-9);
  const cols = Math.max(1, Math.min(COTE_MAX, Math.ceil(w / cote) || 1));
  const rows = Math.max(1, Math.min(COTE_MAX, Math.ceil(h / cote) || 1));
  const col = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / cote)));
  const row = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor((y - y0) / cote)));
  const cellules = new Map<number, number[]>();
  const grands: number[] = [];
  boites.forEach((b, i) => {
    if (!finie(b)) { grands.push(i); return; }
    const c0 = col(b.min.x), c1 = col(b.max.x), r0 = row(b.min.y), r1 = row(b.max.y);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > CELLULES_MAX_PAR_ELEMENT) { grands.push(i); return; }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * cols + c;
        const l = cellules.get(k);
        if (l) l.push(i); else cellules.set(k, [i]);
      }
    }
  });
  const vu = new Uint32Array(n);
  let tour = 0;
  return {
    taille: n,
    chercher(zone) {
      if (!finie(zone)) return tous(zone);
      // Zone hors de l'emprise : seuls les grands peuvent la recouper.
      const dehors = zone.max.x < x0 || zone.min.x > x1 || zone.max.y < y0 || zone.min.y > y1;
      const c0 = col(zone.min.x), c1 = col(zone.max.x), r0 = row(zone.min.y), r1 = row(zone.max.y);
      if (!dehors && (c1 - c0 + 1) * (r1 - r0 + 1) > n) return tous(zone);
      if (++tour === 0xffffffff) { vu.fill(0); tour = 1; }
      const trouves: number[] = [];
      const examiner = (i: number) => {
        if (vu[i] === tour) return;
        vu[i] = tour;
        if (recoupe(boites[i]!, zone)) trouves.push(i);
      };
      for (const i of grands) examiner(i);
      if (!dehors) {
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const l = cellules.get(r * cols + c);
            if (l) for (const i of l) examiner(i);
          }
        }
      }
      trouves.sort((a, b) => a - b);
      return trouves.map((i) => items[i]!);
    },
  };
}

/** Index adapté à la taille : grille au-dessus du seuil mesuré, parcours linéaire en dessous. */
export function indexSpatial<T>(items: readonly T[], boite: (t: T) => Boite2D, seuil = SEUIL_INDEX_SPATIAL): IndexSpatial<T> {
  return items.length >= seuil ? indexGrille(items, boite) : indexLineaireBoites(items, boite);
}
