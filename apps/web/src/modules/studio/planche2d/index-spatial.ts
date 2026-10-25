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
 *
 * C.1-05 : au-dessus du seuil, la sélection et l'accrochage passent par l'index **incrémental** (`indexIncremental`,
 * `suiviIncremental`) : d'une révision à l'autre, seuls les éléments ajoutés, retirés ou modifiés y sont insérés ou
 * retirés. `indexGrille` reste le repli (suite à doublon) et la référence des mesures.
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

// ——— Index incrémental (C.1-05) ———

/**
 * Index spatial **incrémental** : grille uniforme creuse (cellules rangées par clé, sans emprise fixe) dont le côté est
 * choisi à la création, tenue à jour par insertion, suppression et mise à jour d'éléments, sans reconstruction. Même
 * contrat que `IndexSpatial` : `chercher(zone)` rend **exactement** les éléments dont la boîte recoupe la zone, dans
 * l'ordre de leur rang (l'ordre du document après `synchroniser`). Un élément est désigné par son identité (objet
 * immuable du document : un objet modifié est un nouvel objet). Une boîte non finie, très grande ou hors de la plage
 * des cellules est rangée parmi les grands, toujours examinés : l'index n'écarte jamais à tort. Contrôlé par un test de
 * propriétés (suites aléatoires de mutations, graine fixe, comparées au parcours linéaire).
 */
export interface IndexSpatialIncremental<T> extends IndexSpatial<T> {
  /** Ajoute `item` (absent) ; `rang` : sa place dans l'ordre (par défaut après tous les autres). */
  inserer(item: T, boite: Boite2D, rang?: number): void;
  /** Retire `item` ; faux s'il n'y était pas. */
  supprimer(item: T): boolean;
  /** Nouvelle boîte pour `item` (présent), rang conservé. */
  mettreAJour(item: T, boite: Boite2D): void;
  /** Remplace `ancien` par `nouveau` à la même place (rang conservé). */
  remplacer(ancien: T, nouveau: T, boite: Boite2D): void;
  contient(item: T): boolean;
  /** Éléments rangés parmi les grands (toujours examinés) : mesure de la répartition, sans effet sur le résultat. */
  readonly nombreGrands: number;
  /** Rang de `item` (undefined s'il est absent). */
  rangDe(item: T): number | undefined;
  /**
   * Met l'index à la suite `items` (ordre du document) : retire les absents, insère les nouveaux, garde les autres
   * (même identité : leur boîte n'est pas recalculée) et renumérote les rangs. Rend le bilan des mutations.
   */
  synchroniser(items: readonly T[], boite: (t: T) => Boite2D): BilanSynchronisation;
}

export interface BilanSynchronisation { inseres: number; supprimes: number; conserves: number }

interface EntreeIndex<T> { item: T; boite: Boite2D; rang: number; cellules: number[] | null; tour: number }

/** Demi-plage des indices de cellule : au-delà, l'élément est rangé parmi les grands (clé numérique exacte). */
const PLAGE_CELLULES = 2 ** 20;
const cleCellule = (c: number, r: number): number => (c + PLAGE_CELLULES) * 2 ** 21 + (r + PLAGE_CELLULES);

/** Côté de cellule adapté à un ensemble (environ deux éléments par cellule sur son emprise, comme `indexGrille`) ; 1 à défaut. */
export function coteGrille(boites: readonly Boite2D[]): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const b of boites) {
    if (!finie(b)) continue;
    n++;
    if (b.min.x < x0) x0 = b.min.x;
    if (b.min.y < y0) y0 = b.min.y;
    if (b.max.x > x1) x1 = b.max.x;
    if (b.max.y > y1) y1 = b.max.y;
  }
  if (!n || !(x1 >= x0 && y1 >= y0)) return 1;
  const w = x1 - x0, h = y1 - y0;
  const c = Math.max(Math.sqrt((Math.max(w, 1e-9) * Math.max(h, 1e-9)) / Math.max(1, n / 2)), Math.max(w, h) / COTE_MAX, 1e-9);
  return Number.isFinite(c) && c > 0 ? c : 1;
}

/** Index incrémental vide, de côté de cellule `cote` (mètres du dessin, strictement positif et fini). */
export function indexIncremental<T>(cote: number): IndexSpatialIncremental<T> {
  if (!(Number.isFinite(cote) && cote > 0)) throw new RangeError("côté de cellule strictement positif et fini attendu");
  const entrees = new Map<T, EntreeIndex<T>>();
  const cellules = new Map<number, Set<EntreeIndex<T>>>();
  const grands = new Set<EntreeIndex<T>>();
  let prochainRang = 0;
  let tour = 0;
  const indice = (v: number) => Math.floor(v / cote);
  const horsPlage = (ks: readonly number[]) => ks.some((k) => !Number.isFinite(k) || Math.abs(k) >= PLAGE_CELLULES);

  function ranger(e: EntreeIndex<T>): void {
    const b = e.boite;
    if (!finie(b)) { e.cellules = null; grands.add(e); return; }
    const c0 = indice(b.min.x), c1 = indice(b.max.x), r0 = indice(b.min.y), r1 = indice(b.max.y);
    if (horsPlage([c0, c1, r0, r1]) || (c1 - c0 + 1) * (r1 - r0 + 1) > CELLULES_MAX_PAR_ELEMENT) { e.cellules = null; grands.add(e); return; }
    const cles: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = cleCellule(c, r);
        cles.push(k);
        const s = cellules.get(k);
        if (s) s.add(e); else cellules.set(k, new Set([e]));
      }
    }
    e.cellules = cles;
  }
  function deranger(e: EntreeIndex<T>): void {
    if (e.cellules === null) { grands.delete(e); return; }
    for (const k of e.cellules) {
      const s = cellules.get(k);
      if (!s) continue;
      s.delete(e);
      if (!s.size) cellules.delete(k);
    }
    e.cellules = null;
  }
  const nouvelle = (item: T, boite: Boite2D, rang: number): EntreeIndex<T> => {
    const e: EntreeIndex<T> = { item, boite, rang, cellules: null, tour: 0 };
    entrees.set(item, e);
    ranger(e);
    return e;
  };
  const trier = (l: EntreeIndex<T>[]) => l.sort((a, b) => a.rang - b.rang).map((e) => e.item);
  const tous = (zone: Boite2D) => trier([...entrees.values()].filter((e) => recoupe(e.boite, zone)));

  return {
    get taille() { return entrees.size; },
    get nombreGrands() { return grands.size; },
    inserer(item, boite, rang) {
      if (entrees.has(item)) throw new Error("élément déjà présent dans l'index");
      const r = rang ?? prochainRang;
      if (r >= prochainRang) prochainRang = r + 1;
      nouvelle(item, boite, r);
    },
    supprimer(item) {
      const e = entrees.get(item);
      if (!e) return false;
      deranger(e);
      entrees.delete(item);
      return true;
    },
    mettreAJour(item, boite) {
      const e = entrees.get(item);
      if (!e) throw new Error("élément absent de l'index");
      deranger(e);
      e.boite = boite;
      ranger(e);
    },
    remplacer(ancien, nouveau, boite) {
      const e = entrees.get(ancien);
      if (!e) throw new Error("élément absent de l'index");
      if (ancien !== nouveau && entrees.has(nouveau)) throw new Error("élément déjà présent dans l'index");
      deranger(e);
      entrees.delete(ancien);
      nouvelle(nouveau, boite, e.rang);
    },
    contient: (item) => entrees.has(item),
    rangDe: (item) => entrees.get(item)?.rang,
    synchroniser(items, boite) {
      const voulus = new Set(items);
      let supprimes = 0, inseres = 0, conserves = 0;
      for (const [item, e] of entrees) if (!voulus.has(item)) { deranger(e); entrees.delete(item); supprimes++; }
      items.forEach((item, i) => {
        const e = entrees.get(item);
        if (e) { e.rang = i; conserves++; return; }
        nouvelle(item, boite(item), i);
        inseres++;
      });
      prochainRang = items.length;
      return { inseres, supprimes, conserves };
    },
    chercher(zone) {
      if (!finie(zone)) return tous(zone);
      const c0 = indice(zone.min.x), c1 = indice(zone.max.x), r0 = indice(zone.min.y), r1 = indice(zone.max.y);
      // Zone plus vaste que l'ensemble, ou hors de la plage des clés : le parcours de tous rend le même résultat.
      if (horsPlage([c0, c1, r0, r1]) || !((c1 - c0 + 1) * (r1 - r0 + 1) <= entrees.size)) return tous(zone);
      if (++tour === Number.MAX_SAFE_INTEGER) { for (const e of entrees.values()) e.tour = 0; tour = 1; }
      const trouves: EntreeIndex<T>[] = [];
      const examiner = (e: EntreeIndex<T>) => {
        if (e.tour === tour) return;
        e.tour = tour;
        if (recoupe(e.boite, zone)) trouves.push(e);
      };
      for (const e of grands) examiner(e);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const s = cellules.get(cleCellule(c, r));
          if (s) for (const e of s) examiner(e);
        }
      }
      return trier(trouves);
    },
  };
}

/**
 * Index incrémental qui suit un document de révision en révision (C.1-05) : `suivre(items)` synchronise l'index sur la
 * suite d'éléments de la révision courante (seuls les éléments ajoutés, retirés ou modifiés — nouvelle identité — sont
 * touchés) puis le rend. La même suite (même tableau) ne coûte rien. Le côté des cellules est choisi sur la première
 * révision ; si la répartition dérive (plus d'un quart d'éléments parmi les grands), l'index est reconstruit — un
 * choix de performance, jamais de résultat : la recherche reste exacte dans tous les cas.
 */
export function suiviIncremental<T>(boite: (t: T) => Boite2D): { suivre(items: readonly T[]): IndexSpatialIncremental<T> | null; readonly dernierBilan: BilanSynchronisation | null } {
  let index: IndexSpatialIncremental<T> | null = null;
  let vu: readonly T[] | null = null;
  let bilan: BilanSynchronisation | null = null;
  const construire = (items: readonly T[]) => {
    const boites = items.map(boite);
    const i = indexIncremental<T>(coteGrille(boites));
    items.forEach((t, k) => i.inserer(t, boites[k]!, k));
    bilan = { inseres: items.length, supprimes: 0, conserves: 0 };
    return i;
  };
  return {
    get dernierBilan() { return bilan; },
    suivre(items) {
      if (index && vu === items) return index;
      // Un même objet deux fois dans la suite n'a pas de rang unique : l'appelant garde alors l'index non incrémental.
      if (new Set(items).size !== items.length) { index = null; vu = null; bilan = null; return null; }
      if (!index) index = construire(items);
      else {
        bilan = index.synchroniser(items, boite);
        // Répartition dérivée (emprise bien plus vaste qu'à la création) : nouveau côté de cellule.
        const premier = bilan;
        if (items.length > 64 && index.nombreGrands > items.length / 4) { index = construire(items); bilan = premier; }
      }
      vu = items;
      return index;
    },
  };
}
