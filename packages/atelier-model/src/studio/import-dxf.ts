import { studioAngleNormal, studioShapeBoundPoints } from "./courbes.js";
import { STUDIO_BULGE_MAX, STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument, type StudioLayer, type StudioPoint, type StudioShape } from "./document-2d.js";
import { validerNonNatif, type StudioNonNatif, type StudioRaisonNonNatif } from "./non-natifs/non-natifs.js";
import { STUDIO_LIMITES_BLOCS, studioCleNomBloc, studioPointsInsertion, validerDefinitionBloc, validerInsertionBloc, type StudioDefinitionBloc, type StudioInsertionBloc } from "./blocs/blocs.js";

/**
 * Import DXF ASCII vers Studio (`studio-document/1`) : du texte DXF à une liste de `StudioCommand` à appliquer au
 * brouillon (rien n'est écrit ici). Pur et déterministe : même texte, même document et mêmes options, mêmes commandes.
 * Autonome : n'emprunte rien à l'import DXF de l'Atelier (fond de plan d'un autre modèle) ; reprend seulement la
 * structure des codes de groupe (R12 et suivantes, CRLF ou LF).
 *
 * Unités : `$INSUNITS` de l'en-tête donne un facteur explicite vers le mètre ; absent, nul (« sans unité ») ou d'un code
 * non pris en charge, l'unité est **inconnue** : aucune commande n'est produite tant que l'utilisateur n'a pas choisi
 * `options.unite` (jamais devinée, ni par `$MEASUREMENT` ni par l'étendue du dessin). Repère : les coordonnées X, Y du
 * fichier deviennent celles du repère `local-2d` du document, sans translation ni rotation ; Z est ignoré (compté).
 *
 * Entités prises : LINE → ligne ; CIRCLE → cercle ; ARC → arc (cercle si ses angles se confondent, 0° → 360°) (angles du fichier en degrés, sens trigonométrique, ramenés
 * en radians dans [0 ; 2π[) ; LWPOLYLINE / POLYLINE 2D à segments courbes (renflement 42 non nul) → polyligne avec ses
 * renflements ; LWPOLYLINE / POLYLINE 2D droite fermée de 4 sommets parallèle aux axes → rectangle, sinon chaque segment
 * droit → ligne (comme avant les courbes : un import déjà fait se rejoue à l'identique). Tout le reste (TEXT, INSERT,
 * SPLINE, HATCH, DIMENSION, ELLIPSE…, cercles ou arcs sans rayon ou sans angle, polylignes 3D ou lissées, entités hors du plan XY ou de l'espace papier, segments de longueur nulle) est **compté par
 * type** dans `nonPris`, jamais écarté en silence. Calques : table LAYER et noms portés par les entités ; « 0 » → calque
 * implicite ; un calque du document de même nom est repris, sinon il est créé (visibilité et verrouillage du fichier).
 *
 * Éléments non natifs (lot F3, `options.conserverNonNatifs`) : chaque entité **entière** non prise (TEXT, INSERT,
 * SPLINE…, hors plan, espace papier, coordonnées manquantes) est en plus conservée dans le document comme élément non
 * natif (`studio.nonnatif.conserver`) : type, handle (code 5), nom de bloc (INSERT), raison ; elle reste comptée dans
 * `nonPris`. Une partie seulement écartée (largeur, épaisseur, segment nul) n'en fait pas un élément non natif.
 *
 * Blocs (X.1-01) : la section BLOCKS est lue ; un INSERT d'un bloc dont **toutes** les entités sont prises (LINE,
 * CIRCLE, ARC, polylignes 2D), à échelle uniforme (|41| = |42|, 43 ignoré), sans attributs (66) ni réseau (70 / 71),
 * devient une **insertion** d'une définition de bloc Studio (position, rotation 50, échelle, symétrie : 41 × 42 < 0) ;
 * la définition (nom décodé, point de base 10 / 20, éléments) est créée une fois par bloc inséré, ou reprise si le
 * document en a une de même nom et de mêmes éléments (sinon nom suffixé « (2) »). Les éléments d'un bloc prennent le
 * calque de l'insertion (un calque d'élément autre que « 0 » est compté, jamais deviné). Tout autre INSERT reste compté
 * (et conservé comme élément non natif si l'option est cochée), avec sa raison.
 */

/** Unités convertibles, en facteur rationnel exact vers le mètre (valeur en m = x × mul ÷ div). */
export const STUDIO_DXF_UNITES = Object.freeze({
  mm: { insunits: 4, mul: 1, div: 1000 },
  cm: { insunits: 5, mul: 1, div: 100 },
  dm: { insunits: 14, mul: 1, div: 10 },
  m: { insunits: 6, mul: 1, div: 1 },
  dam: { insunits: 15, mul: 10, div: 1 },
  hm: { insunits: 16, mul: 100, div: 1 },
  km: { insunits: 7, mul: 1000, div: 1 },
  um: { insunits: 13, mul: 1, div: 1_000_000 },
  nm: { insunits: 12, mul: 1, div: 1_000_000_000 },
  in: { insunits: 1, mul: 254, div: 10_000 },
  ft: { insunits: 2, mul: 3048, div: 10_000 },
  "ft-us": { insunits: 21, mul: 1200, div: 3937 },
  yd: { insunits: 10, mul: 9144, div: 10_000 },
  mi: { insunits: 3, mul: 1_609_344, div: 1000 },
  mil: { insunits: 9, mul: 254, div: 10_000_000 },
  uin: { insunits: 8, mul: 254, div: 10_000_000_000 },
} as const);
export type StudioDxfUnite = keyof typeof STUDIO_DXF_UNITES;
/** Unités proposées au choix quand le fichier n'en déclare pas (les plus courantes en dessin). */
export const STUDIO_DXF_UNITES_CHOIX: readonly StudioDxfUnite[] = Object.freeze(["mm", "cm", "m", "in", "ft"] as const);

/**
 * Bornes techniques de l'import (le document garde les siennes, `STUDIO_LIMITS`) : fichier de 5 Mo au plus (refus) ;
 * coordonnée convertie de ±1e9 m au plus (pas une valeur métier : la forme au-delà n'est pas prise, elle est comptée).
 */
export const STUDIO_DXF_LIMITES = Object.freeze({ octets: 5 * 1024 * 1024, coordonnee: 1e9 } as const);

export interface StudioDxfOptions {
  /** Document qui recevra l'import : identifiants déjà pris, calques existants, limites. Vide par défaut. */
  document?: StudioDocument;
  /** Unité choisie par l'utilisateur, utilisée seulement quand le fichier n'en déclare pas de convertible. */
  unite?: StudioDxfUnite;
  /** Conserver chaque entité entière non prise comme élément non natif (lot F3) ; faux par défaut. */
  conserverNonNatifs?: boolean;
}

export interface StudioDxfBornes {
  min: StudioPoint;
  max: StudioPoint;
}
export interface StudioDxfCalque {
  /** Nom lu dans le fichier (échappements `\U+XXXX` décodés). */
  nom: string;
  /** Calque Studio cible : implicite, existant (même nom), créé, ou aucun (calque du fichier sans objet importé : listé, pas créé). */
  cible: "implicite" | "existant" | "cree" | "sans-objet";
  /** Identifiant Studio ; absent pour le calque implicite. */
  id?: string;
  objets: number;
  /** Nom raccourci à `STUDIO_LIMITS.layerName` caractères pour le calque créé. */
  nomRaccourci?: boolean;
  /** Nom Studio retenu quand il diffère du nom du fichier (raccourci, suffixe « (2) » pour rester unique). */
  nomStudio?: string;
}
/**
 * Repères source et cible de l'import (EX-080) : repère général (WCS) du fichier, en unités du fichier, vers le repère
 * `local-2d` du document en mètres ; conversion déclarée (facteur exact, aucune translation ni rotation, Z ignoré).
 */
export interface StudioDxfReperes {
  source: { repere: "dxf-wcs"; unite: StudioDxfUnite | null; espace: "objet" };
  cible: { repere: "local-2d"; unite: "m" };
  /** Facteur vers le mètre (null : unité inconnue, rien n'est converti). */
  echelle: number | null;
  translation: { x: 0; y: 0 };
  rotation: 0;
  z: "ignore";
}
export interface StudioDxfRapport {
  unite: { code: number | null; valeur: StudioDxfUnite | null; origine: "fichier" | "choix" | "inconnue" };
  /** Repères source / cible et conversion (EX-080). */
  reperes: StudioDxfReperes;
  /** Mètres par unité du fichier ; `null` tant que l'unité est inconnue. */
  facteur: number | null;
  entites: { lignes: number; rectangles: number; segments: number; cercles: number; arcs: number; polylignes: number; insertions?: number; blocs?: number; total: number };
  /** Entités ou parties d'entités non importées, comptées par type (ordre alphabétique). */
  nonPris: { type: string; nombre: number }[];
  calques: StudioDxfCalque[];
  /** Bornes des objets importés, en mètres ; `null` si l'unité est inconnue ou si rien n'est importé. */
  bornes: StudioDxfBornes | null;
  /** Mêmes bornes en unités du fichier. */
  bornesFichier: StudioDxfBornes | null;
  /** Nombre d'entités prises dont une cote Z non nulle a été ignorée (projection sur le plan XY). */
  zIgnores: number;
  /** Entités conservées comme éléments non natifs (présent seulement avec `conserverNonNatifs`). */
  nonNatifs?: number;
}
export interface StudioDxfResultat {
  statut: "pret" | "unite-inconnue";
  /** Vide tant que l'unité est inconnue ; sinon calques créés, objets, puis verrouillages. */
  commandes: StudioCommand[];
  rapport: StudioDxfRapport;
}

function fail(path: string, message: string): never {
  throw new StudioValidationError(path, message);
}

// ——— Lecture des codes de groupe ———

interface Paire {
  code: number;
  valeur: string;
  ligne: number;
}

function paires(texte: string): Paire[] {
  if (typeof texte !== "string") fail("dxf", "texte attendu");
  if (texte.length > STUDIO_DXF_LIMITES.octets) fail("dxf", `fichier de ${STUDIO_DXF_LIMITES.octets / 1024 / 1024} Mo au plus`);
  const sansBom = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
  if (sansBom.startsWith("AutoCAD Binary DXF")) fail("dxf", "DXF binaire non pris en charge : enregistrez le fichier en DXF ASCII");
  const lignes = sansBom.split(/\r\n|\n|\r/);
  // Fin de fichier : une ligne vide finale n'est pas une paire.
  while (lignes.length && lignes[lignes.length - 1]!.trim() === "") lignes.pop();
  if (lignes.length % 2 !== 0) fail("dxf", `ligne ${lignes.length} : valeur attendue après le code de groupe`);
  const out: Paire[] = [];
  for (let i = 0; i < lignes.length; i += 2) {
    const brut = lignes[i]!.trim();
    if (!/^-?\d{1,4}$/.test(brut)) fail("dxf", `ligne ${i + 1} : code de groupe attendu (seul le DXF ASCII est lu)`);
    out.push({ code: Number(brut), valeur: lignes[i + 1]!, ligne: i + 2 });
  }
  return out;
}

const NOMBRE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
function nombre(p: Paire): number {
  const v = p.valeur.trim();
  const n = NOMBRE.test(v) ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) fail("dxf", `ligne ${p.ligne} : nombre attendu pour le code ${p.code}`);
  return n;
}
function entier(p: Paire): number {
  const n = nombre(p);
  if (!Number.isInteger(n)) fail("dxf", `ligne ${p.ligne} : entier attendu pour le code ${p.code}`);
  return n;
}

/** Échappements DXF `\U+XXXX` (écrits par l'export Studio et les logiciels de DAO) décodés. */
const decoder = (s: string): string => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_m, h: string) => String.fromCharCode(Number.parseInt(h, 16)));
const nomCalque = (s: string): string => decoder(s.trim());
const cleCalque = (s: string): string => s.toLocaleUpperCase("en-US");

interface Entite {
  type: string;
  champs: Paire[];
  /** POLYLINE : sommets (VERTEX) jusqu'à SEQEND. */
  sommets?: Paire[][];
}

/** Bloc lu dans la section BLOCKS (nom décodé, point de base, entités groupées comme celles d'ENTITIES). */
interface BlocDxf { nom: string; base: { x: number | null; y: number | null }; flags: number; entites: Entite[] }

interface Sections {
  insunits: number | null;
  calques: { nom: string; visible: boolean; verrouille: boolean }[];
  entites: Entite[];
  /** Blocs par nom (clé sans casse) ; ceux d'espace objet ou papier (« * ») ne sont pas des blocs insérables. */
  blocs: Map<string, BlocDxf>;
}

/** Découpe en sections ; seules HEADER ($INSUNITS), TABLES (LAYER) et ENTITIES sont lues. */
function sections(ps: Paire[]): Sections {
  const out: Sections = { insunits: null, calques: [], entites: [], blocs: new Map() };
  let i = 0;
  const estZero = (k: number, v?: string) => ps[k]?.code === 0 && (v === undefined || ps[k]!.valeur.trim() === v);
  while (i < ps.length) {
    if (!estZero(i, "SECTION")) {
      if (estZero(i, "EOF")) break;
      i++;
      continue;
    }
    const nom = ps[i + 1]?.code === 2 ? ps[i + 1]!.valeur.trim() : "";
    i += 2;
    const debut = i;
    while (i < ps.length && !estZero(i, "ENDSEC")) i++;
    if (i >= ps.length) fail("dxf", `section ${nom || "sans nom"} non terminée (ENDSEC attendu)`);
    const corps = ps.slice(debut, i);
    i++;
    if (nom === "HEADER") {
      for (let k = 0; k < corps.length; k++) {
        if (corps[k]!.code === 9 && corps[k]!.valeur.trim() === "$INSUNITS") {
          const v = corps[k + 1];
          if (!v || v.code !== 70) fail("dxf", "$INSUNITS : code 70 attendu");
          out.insunits = entier(v);
        }
      }
    } else if (nom === "TABLES") {
      out.calques = tableCalques(corps);
    } else if (nom === "ENTITIES") {
      out.entites = entites(corps);
    } else if (nom === "BLOCKS") {
      out.blocs = blocsDxf(corps);
    }
  }
  return out;
}

function enregistrements(corps: Paire[]): Entite[] {
  const out: Entite[] = [];
  let courant: Entite | null = null;
  for (const p of corps) {
    if (p.code === 0) {
      courant = { type: p.valeur.trim().toUpperCase(), champs: [] };
      out.push(courant);
    } else courant?.champs.push(p);
  }
  return out;
}

function tableCalques(corps: Paire[]): Sections["calques"] {
  const out: Sections["calques"] = [];
  let dansLayer = false;
  for (const e of enregistrements(corps)) {
    if (e.type === "TABLE") {
      dansLayer = e.champs.find((p) => p.code === 2)?.valeur.trim().toUpperCase() === "LAYER";
      continue;
    }
    if (e.type === "ENDTAB") {
      dansLayer = false;
      continue;
    }
    if (!dansLayer || e.type !== "LAYER") continue;
    const nom = nomCalque(e.champs.find((p) => p.code === 2)?.valeur ?? "");
    if (!nom) continue;
    const flags = e.champs.find((p) => p.code === 70);
    const couleur = e.champs.find((p) => p.code === 62);
    const f = flags ? entier(flags) : 0;
    // Couleur négative : calque éteint ; drapeau 1 : gelé ; drapeau 4 : verrouillé.
    out.push({ nom, visible: !(couleur && nombre(couleur) < 0) && (f & 1) === 0, verrouille: (f & 4) !== 0 });
  }
  return out;
}

/** Section BLOCKS : chaque BLOCK … ENDBLK, ses entités groupées (POLYLINE / VERTEX, INSERT / ATTRIB). */
function blocsDxf(corps: Paire[]): Map<string, BlocDxf> {
  const out = new Map<string, BlocDxf>();
  let courant: { nom: string; base: BlocDxf["base"]; flags: number; brutes: Entite[] } | null = null;
  for (const e of enregistrements(corps)) {
    if (e.type === "BLOCK") {
      const coord = (code: number) => { const p = champ(e, code); return p ? nombre(p) : null; };
      courant = { nom: decoder(champ(e, 2)?.valeur.trim() ?? ""), base: { x: coord(10), y: coord(20) }, flags: champ(e, 70) ? entier(champ(e, 70)!) : 0, brutes: [] };
    } else if (e.type === "ENDBLK") {
      if (courant && courant.nom && !courant.nom.startsWith("*") && !out.has(cleCalque(courant.nom))) out.set(cleCalque(courant.nom), { nom: courant.nom, base: courant.base, flags: courant.flags, entites: grouper(courant.brutes) });
      courant = null;
    } else courant?.brutes.push(e);
  }
  return out;
}

function entites(corps: Paire[]): Entite[] {
  return grouper(enregistrements(corps));
}

function grouper(brutes: Entite[]): Entite[] {
  const out: Entite[] = [];
  for (let k = 0; k < brutes.length; k++) {
    const e = brutes[k]!;
    if (e.type === "POLYLINE") {
      const sommets: Paire[][] = [];
      let j = k + 1;
      while (j < brutes.length && brutes[j]!.type === "VERTEX") sommets.push(brutes[j++]!.champs);
      if (brutes[j]?.type === "SEQEND") j++;
      out.push({ ...e, sommets });
      k = j - 1;
      continue;
    }
    if (e.type === "INSERT" && e.champs.some((p) => p.code === 66 && p.valeur.trim() === "1")) {
      // Attributs d'un bloc inséré (66 = 1) : ATTRIB… SEQEND appartiennent à l'INSERT, compté une seule fois.
      let j = k + 1;
      while (j < brutes.length && brutes[j]!.type === "ATTRIB") j++;
      if (brutes[j]?.type === "SEQEND") j++;
      out.push(e);
      k = j - 1;
      continue;
    }
    // VERTEX, ATTRIB ou SEQEND isolés : comptés par leur type, comme toute entité non prise.
    out.push(e);
  }
  return out;
}

// ——— Géométrie lue ———

const champ = (e: { champs: Paire[] } | Paire[], code: number): Paire | undefined => (Array.isArray(e) ? e : e.champs).find((p) => p.code === code);
const valeur = (e: Entite | Paire[], code: number, defaut: number): number => {
  const p = champ(e, code);
  return p ? nombre(p) : defaut;
};

/** Plan de l'entité : direction d'extrusion (210/220/230) +Z seulement ; sinon l'entité n'est pas dans le plan XY. */
function dansPlanXY(e: Entite): boolean {
  return valeur(e, 210, 0) === 0 && valeur(e, 220, 0) === 0 && valeur(e, 230, 1) > 0;
}

interface Segment {
  a: StudioPoint;
  b: StudioPoint;
}
/** `source` : type DXF de l'entité d'origine (pour compter un refus après conversion). */
type Forme =
  | { type: "ligne"; source: string; calque: string; a: StudioPoint; b: StudioPoint; segment: boolean }
  | { type: "rectangle"; source: string; calque: string; min: StudioPoint; max: StudioPoint }
  | { type: "cercle"; source: string; calque: string; c: StudioPoint; r: number }
  | { type: "arc"; source: string; calque: string; c: StudioPoint; r: number; a0: number; a1: number }
  | { type: "polyligne"; source: string; calque: string; pts: StudioPoint[]; ferme: boolean; bulges: number[] };

/** Points qui bornent une forme lue (unités du fichier). */
function pointsForme(f: Forme): StudioPoint[] {
  switch (f.type) {
    case "ligne": return [f.a, f.b];
    case "rectangle": return [f.min, f.max];
    case "cercle": return [{ x: f.c.x - f.r, y: f.c.y - f.r }, { x: f.c.x + f.r, y: f.c.y + f.r }];
    case "arc": return studioShapeBoundPoints({ id: "-", type: "arc", center: f.c, radius: f.r, startAngle: f.a0, endAngle: f.a1 });
    case "polyligne": return studioShapeBoundPoints({ id: "-", type: "polyline", points: f.pts, closed: f.ferme, bulges: f.bulges });
  }
}

/** Rectangle parallèle aux axes : 4 sommets distincts, chaque côté horizontal ou vertical, coins exacts. */
function rectangle(pts: StudioPoint[]): { min: StudioPoint; max: StudioPoint } | null {
  const p = pts.length === 5 && pts[0]!.x === pts[4]!.x && pts[0]!.y === pts[4]!.y ? pts.slice(0, 4) : pts;
  if (p.length !== 4) return null;
  const xs = [...new Set(p.map((q) => q.x))], ys = [...new Set(p.map((q) => q.y))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  for (let i = 0; i < 4; i++) {
    const a = p[i]!, b = p[(i + 1) % 4]!;
    if ((a.x === b.x) === (a.y === b.y)) return null;
  }
  const coins = new Set(p.map((q) => `${q.x} ${q.y}`));
  if (coins.size !== 4) return null;
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** Entité entière non prise, candidate à l'état non natif. */
interface Ecartee {
  entite: string;
  raison: StudioRaisonNonNatif;
  detail?: string;
  handle?: string;
  nom?: string;
  calque: string;
}

/** INSERT pris : bloc, calque, position, facteurs et rotation (unités du fichier, degrés). */
interface InsertLu { source: "INSERT"; calque: string; bloc: string; position: StudioPoint; sx: number; sy: number; rotation: number }

interface Lecture {
  formes: Forme[];
  insertions: InsertLu[];
  nonPris: Map<string, number>;
  calquesEntites: string[];
  zIgnores: number;
  ecartees: Ecartee[];
}

function lire(ents: Entite[], blocsLisibles: ReadonlySet<string> = new Set()): Lecture {
  const formes: Forme[] = [];
  const insertions: InsertLu[] = [];
  const nonPris = new Map<string, number>();
  const calquesEntites: string[] = [];
  let zIgnores = 0;
  const ecartees: Ecartee[] = [];
  const compter = (type: string, n = 1) => nonPris.set(type, (nonPris.get(type) ?? 0) + n);
  const calqueDe = (e: Entite | Paire[]) => nomCalque(champ(e, 8)?.valeur ?? "") || "0";
  /** Entité entière non prise : comptée, et retenue comme candidate à l'état non natif. */
  const ecarter = (e: Entite, cle: string, raison: StudioRaisonNonNatif, detail?: string) => {
    compter(cle);
    const handle = champ(e, 5)?.valeur.trim();
    const nom = e.type === "INSERT" ? decoder(champ(e, 2)?.valeur.trim() ?? "") : "";
    ecartees.push({ entite: e.type || "(sans type)", raison, ...(detail ? { detail } : {}), ...(handle ? { handle } : {}), ...(nom ? { nom } : {}), calque: calqueDe(e) });
  };
  for (const e of ents) {
    if (e.type === "INSERT") {
      // Bloc inséré (X.1-01) : pris seulement s'il est représentable par une insertion Studio, sinon compté avec sa raison.
      const nom = decoder(champ(e, 2)?.valeur.trim() ?? "");
      const x = champ(e, 10), y = champ(e, 20);
      const sx = valeur(e, 41, 1), sy = valeur(e, 42, 1);
      if (champ(e, 67) && entier(champ(e, 67)!) === 1) ecarter(e, "INSERT", "placement-non-interpretable", "code 67 (espace papier)");
      else if (!dansPlanXY(e)) ecarter(e, "INSERT", "placement-non-interpretable", "code 210 (hors plan XY)");
      else if (e.champs.some((p) => p.code === 66 && p.valeur.trim() === "1")) ecarter(e, "INSERT", "representation-non-interpretable", "code 66 (attributs)");
      else if (valeur(e, 70, 1) > 1 || valeur(e, 71, 1) > 1) ecarter(e, "INSERT", "representation-non-interpretable", "codes 70 / 71 (réseau de blocs)");
      else if (!x || !y) ecarter(e, "INSERT", "dimensions-non-interpretables", "codes 10 / 20 (coordonnées manquantes)");
      else if (sx === 0 || sy === 0 || Math.abs(sx) !== Math.abs(sy)) ecarter(e, "INSERT", "dimensions-non-interpretables", "codes 41 / 42 (échelle nulle ou non uniforme)");
      else if (!blocsLisibles.has(cleCalque(nom))) ecarter(e, "INSERT", "type-sans-equivalent");
      else {
        const calque = calqueDe(e);
        insertions.push({ source: "INSERT", calque, bloc: cleCalque(nom), position: { x: nombre(x), y: nombre(y) }, sx, sy, rotation: valeur(e, 50, 0) });
        calquesEntites.push(calque);
        if (valeur(e, 30, 0) !== 0) zIgnores++;
      }
      continue;
    }
    if (e.type !== "LINE" && e.type !== "LWPOLYLINE" && e.type !== "POLYLINE" && e.type !== "CIRCLE" && e.type !== "ARC") {
      ecarter(e, e.type || "(sans type)", "type-sans-equivalent");
      continue;
    }
    if (champ(e, 67) && entier(champ(e, 67)!) === 1) {
      ecarter(e, `${e.type} (espace papier)`, "placement-non-interpretable", "code 67");
      continue;
    }
    if (!dansPlanXY(e)) {
      ecarter(e, `${e.type} (hors plan XY)`, "placement-non-interpretable", "code 210");
      continue;
    }
    const calque = calqueDe(e);
    let z = false;
    const avant = formes.length;
    const poser = (pts: StudioPoint[], ferme: boolean, renflements: number[]) => {
      const n = pts.length;
      const nbSegments = ferme ? n : n - 1;
      if (renflements.slice(0, nbSegments).some((b) => b !== 0)) {
        // Polyligne à segments courbes : sommets consécutifs confondus retirés (segment nul compté), renflements gardés.
        if (renflements.slice(0, nbSegments).some((b) => Math.abs(b) > STUDIO_BULGE_MAX)) {
          ecarter(e, `${e.type} (renflement hors limites)`, "dimensions-non-interpretables", "code 42");
          return;
        }
        const sommets: StudioPoint[] = [], bulges: number[] = [];
        let fermeture = renflements[n - 1] ?? 0;
        for (let i = 0; i < n; i++) {
          const p = pts[i]!, precedent = sommets[sommets.length - 1];
          if (precedent && precedent.x === p.x && precedent.y === p.y) {
            compter(`${e.type} (segment de longueur nulle)`);
            continue;
          }
          if (sommets.length) bulges.push(renflements[i - 1] ?? 0);
          sommets.push(p);
        }
        if (ferme && sommets.length > 1 && sommets[0]!.x === sommets[sommets.length - 1]!.x && sommets[0]!.y === sommets[sommets.length - 1]!.y) {
          compter(`${e.type} (segment de longueur nulle)`);
          // Dernier sommet répétant le premier : le segment qui y menait devient le segment de fermeture, renflement compris.
          sommets.pop();
          fermeture = bulges.pop() ?? 0;
        }
        if (ferme) bulges.push(fermeture);
        if (sommets.length < 2 || (ferme && sommets.length < 3 && bulges.every((b) => b === 0))) {
          ecarter(e, `${e.type} (moins de deux sommets distincts)`, "dimensions-non-interpretables", "codes 10 / 20");
          return;
        }
        formes.push({ type: "polyligne", source: e.type, calque, pts: sommets, ferme, bulges });
        return;
      }
      const r = ferme ? rectangle(pts) : null;
      if (r) {
        formes.push({ type: "rectangle", source: e.type, calque, ...r });
        return;
      }
      const segs: Segment[] = [];
      for (let i = 0; i < nbSegments; i++) {
        const a = pts[i]!, b = pts[(i + 1) % n]!;
        if (a.x === b.x && a.y === b.y) compter(`${e.type} (segment de longueur nulle)`);
        else segs.push({ a, b });
      }
      for (const s of segs) formes.push({ type: "ligne", source: e.type, calque, a: s.a, b: s.b, segment: true });
    };
    /** Coordonnée lue seulement si elle est présente : une coordonnée absente n'est jamais remplacée par 0. */
    const coord = (src: Entite | Paire[], code: number): number | null => {
      const p = champ(src, code);
      return p ? nombre(p) : null;
    };
    const nonNul = (src: Entite | Paire[], ...codes: number[]) => codes.some((c) => valeur(src, c, 0) !== 0);
    // Largeurs (40, 41, 43) et épaisseur (39) ne sont pas représentables : la géométrie est prise, l'attribut compté.
    let largeur = false;
    if (e.type === "CIRCLE" || e.type === "ARC") {
      const x = coord(e, 10), y = coord(e, 20), r = coord(e, 40);
      if (x === null || y === null || r === null) {
        ecarter(e, `${e.type} (coordonnées ou rayon manquants)`, "dimensions-non-interpretables", "codes 10 / 20 / 40");
        continue;
      }
      if (!(r > 0)) {
        ecarter(e, `${e.type} (rayon nul ou négatif)`, "dimensions-non-interpretables", "code 40");
        continue;
      }
      z = valeur(e, 30, 0) !== 0;
      if (e.type === "CIRCLE") formes.push({ type: "cercle", source: e.type, calque, c: { x, y }, r });
      else {
        const d0 = coord(e, 50), d1 = coord(e, 51);
        if (d0 === null || d1 === null) {
          ecarter(e, "ARC (angles manquants)", "dimensions-non-interpretables", "codes 50 / 51");
          continue;
        }
        const a0 = studioAngleNormal((d0 * Math.PI) / 180), a1 = studioAngleNormal((d1 * Math.PI) / 180);
        // Angles égaux une fois ramenés dans [0 ; 360°[ (0° → 360°) : en DXF, un arc d'un tour complet, soit un cercle.
        if (a0 === a1) formes.push({ type: "cercle", source: e.type, calque, c: { x, y }, r });
        else formes.push({ type: "arc", source: e.type, calque, c: { x, y }, r, a0, a1 });
      }
    } else if (e.type === "LINE") {
      const x1 = coord(e, 10), y1 = coord(e, 20), x2 = coord(e, 11), y2 = coord(e, 21);
      if (x1 === null || y1 === null || x2 === null || y2 === null) {
        ecarter(e, "LINE (coordonnées manquantes)", "dimensions-non-interpretables", "codes 10 / 20 / 11 / 21");
        continue;
      }
      z = valeur(e, 30, 0) !== 0 || valeur(e, 31, 0) !== 0;
      if (x1 === x2 && y1 === y2) ecarter(e, "LINE (longueur nulle)", "dimensions-non-interpretables", "codes 10 / 20 / 11 / 21");
      else formes.push({ type: "ligne", source: e.type, calque, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, segment: false });
    } else if (e.type === "LWPOLYLINE") {
      const pts: StudioPoint[] = [], courbes: number[] = [];
      let x: number | null = null, incomplet = false;
      for (const p of e.champs) {
        if (p.code === 10) {
          if (x !== null) incomplet = true;
          x = nombre(p);
        } else if (p.code === 20) {
          if (x === null) {
            incomplet = true;
            continue;
          }
          pts.push({ x, y: nombre(p) });
          courbes.push(0);
          x = null;
        } else if (p.code === 42 && pts.length) courbes[pts.length - 1] = nombre(p);
        else if ((p.code === 40 || p.code === 41 || p.code === 43) && nombre(p) !== 0) largeur = true;
      }
      if (incomplet || x !== null) {
        ecarter(e, "LWPOLYLINE (coordonnées manquantes)", "dimensions-non-interpretables", "codes 10 / 20");
        continue;
      }
      z = valeur(e, 38, 0) !== 0;
      const ferme = (entier(champ(e, 70) ?? { code: 70, valeur: "0", ligne: 0 }) & 1) === 1;
      if (pts.length < 2) ecarter(e, "LWPOLYLINE (moins de deux sommets)", "dimensions-non-interpretables", "codes 10 / 20");
      else poser(pts, ferme, courbes);
    } else {
      const flags = champ(e, 70) ? entier(champ(e, 70)!) : 0;
      if (flags & (8 | 16 | 64)) {
        ecarter(e, `POLYLINE (${flags & 8 ? "3D" : "maillage"})`, "representation-non-interpretable", "code 70");
        continue;
      }
      if (flags & (2 | 4)) {
        ecarter(e, "POLYLINE (lissée)", "representation-non-interpretable", "code 70");
        continue;
      }
      const pts: StudioPoint[] = [], courbes: number[] = [];
      let incomplet = false;
      largeur = nonNul(e, 40, 41);
      for (const v of e.sommets ?? []) {
        const x = coord(v, 10), y = coord(v, 20);
        if (x === null || y === null) {
          incomplet = true;
          break;
        }
        pts.push({ x, y });
        courbes.push(valeur(v, 42, 0));
        if (valeur(v, 30, 0) !== 0) z = true;
        if (nonNul(v, 40, 41)) largeur = true;
      }
      if (incomplet) {
        ecarter(e, "POLYLINE (coordonnées manquantes)", "dimensions-non-interpretables", "codes 10 / 20");
        continue;
      }
      if (valeur(e, 30, 0) !== 0) z = true;
      if (pts.length < 2) ecarter(e, "POLYLINE (moins de deux sommets)", "dimensions-non-interpretables", "codes 10 / 20");
      else poser(pts, (flags & 1) === 1, courbes);
    }
    if (formes.length === avant) continue;
    calquesEntites.push(calque);
    if (largeur) compter(`${e.type} (largeur ignorée)`);
    if (nonNul(e, 39)) compter(`${e.type} (épaisseur ignorée)`);
    if (z) zIgnores++;
  }
  return { formes, insertions, nonPris, calquesEntites, zIgnores, ecartees };
}

/** Bloc lu et ses éléments, ou null s'il n'est pas représentable (une entité non prise, aucun élément, base absente). */
interface BlocLu { nom: string; base: StudioPoint; formes: Forme[]; nonPris: Map<string, number>; zIgnores: number; calquesPropres: number }
function lireBlocs(blocs: ReadonlyMap<string, BlocDxf>): Map<string, BlocLu> {
  const out = new Map<string, BlocLu>();
  for (const [cle, b] of blocs) {
    // Référence externe (4), superposée (8) ou dépendante (16) : jamais lue comme une définition.
    if (b.flags & (4 | 8 | 16) || b.base.x === null || b.base.y === null) continue;
    const l = lire(b.entites);
    if (l.ecartees.length || l.insertions.length || !l.formes.length) continue;
    out.set(cle, { nom: b.nom, base: { x: b.base.x, y: b.base.y }, formes: l.formes, nonPris: l.nonPris, zIgnores: l.zIgnores, calquesPropres: l.formes.filter((f) => f.calque !== "0").length });
  }
  return out;
}

// ——— Conversion et commandes ———

function convertisseur(u: StudioDxfUnite): (v: number) => number {
  const { mul, div } = STUDIO_DXF_UNITES[u];
  if (mul === 1 && div === 1) return (v) => v;
  // Facteur rationnel appliqué en deux opérations, puis arrondi au nanomètre : pas de bruit flottant (4000 mm → 4 m).
  return (v) => {
    const m = (v * mul) / div;
    const r = Math.round(m * 1e9) / 1e9;
    return Object.is(r, -0) ? 0 : r;
  };
}

function uniteDuCode(code: number | null): StudioDxfUnite | null {
  if (code === null) return null;
  for (const [nom, u] of Object.entries(STUDIO_DXF_UNITES)) if (u.insunits === code) return nom as StudioDxfUnite;
  return null;
}

function bornesDe(pts: StudioPoint[]): StudioDxfBornes | null {
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** Prochain identifiant libre `prefixe-n` (n croissant depuis 1), hors des identifiants déjà pris. */
function allocateur(pris: Set<string>, prefixe: string): () => string {
  let n = 0;
  return () => {
    let id: string;
    do id = `${prefixe}${++n}`;
    while (pris.has(id));
    pris.add(id);
    return id;
  };
}

/**
 * Lit un DXF ASCII et rend les commandes Studio qui l'ajoutent au document, avec le rapport d'import. Lève
 * `StudioValidationError` pour un fichier illisible ou trop grand, un calque cible verrouillé, ou un document qui
 * dépasserait `STUDIO_LIMITS` (refus, jamais de troncature).
 */
export function lireDxfStudio(texte: string, options: StudioDxfOptions = {}): StudioDxfResultat {
  const doc = options.document ? validateStudioDocument(options.document) : null;
  if (options.unite !== undefined && !Object.hasOwn(STUDIO_DXF_UNITES, options.unite)) fail("dxf.unite", "unité non prise en charge");
  const s = sections(paires(texte));
  const blocsLus = lireBlocs(s.blocs);
  const lecture = lire(s.entites, new Set(blocsLus.keys()));
  const nonPris = new Map(lecture.nonPris);
  const compter = (type: string) => nonPris.set(type, (nonPris.get(type) ?? 0) + 1);

  const deFichier = uniteDuCode(s.insunits === 0 ? null : s.insunits);
  const unite = deFichier ?? options.unite ?? null;
  const origine: StudioDxfRapport["unite"]["origine"] = deFichier ? "fichier" : unite ? "choix" : "inconnue";
  const conv = unite ? convertisseur(unite) : null;

  // Conversion en mètres : une forme hors de ±1e9 m ou devenue nulle (arrondi au nanomètre) n'est pas prise, elle est comptée.
  const retenues: { forme: Forme; geo: Geometrie | null }[] = [];
  for (const forme of lecture.formes) {
    if (!conv) {
      retenues.push({ forme, geo: null });
      continue;
    }
    const geo = convertir(forme, conv);
    if (geo === "hors-limites") compter(`${forme.source} (coordonnée au-delà de 10⁹ m)`);
    else if (geo === "nulle") compter(`${forme.source} (longueur nulle après conversion)`);
    else retenues.push({ forme, geo });
  }

  // Blocs (X.1-01) : définitions des blocs insérés, converties en mètres ; un bloc dont un élément sortirait des
  // limites ou deviendrait nul n'est pas pris, ses insertions sont comptées.
  const definitionsLues = new Map<string, { nom: string; base: StudioPoint; elements: StudioShape[] }>();
  const insertionsRetenues: InsertLu[] = [];
  for (const ins of lecture.insertions) {
    if (!conv) { insertionsRetenues.push(ins); continue; }
    let def = definitionsLues.get(ins.bloc);
    if (!def && !definitionsLues.has(ins.bloc)) {
      const b = blocsLus.get(ins.bloc)!;
      const geos = b.formes.map((f) => convertir(f, conv));
      const base = { x: conv(b.base.x), y: conv(b.base.y) };
      if (geos.every((g): g is Geometrie => typeof g === "object") && Math.abs(base.x) <= STUDIO_DXF_LIMITES.coordonnee && Math.abs(base.y) <= STUDIO_DXF_LIMITES.coordonnee && geos.length <= STUDIO_LIMITES_BLOCS.elements) {
        def = { nom: b.nom, base, elements: geos.map((g, k) => ({ id: `e${k + 1}`, ...g, ...(g.type === "polyline" && g.bulges.every((x) => x === 0) ? { bulges: undefined } : {}) }) as StudioShape).map((o) => JSON.parse(JSON.stringify(o)) as StudioShape) };
        for (const [type, n] of b.nonPris) for (let k = 0; k < n; k++) compter(`BLOCK ${type}`);
        for (let k = 0; k < b.calquesPropres; k++) compter("BLOCK (calque d’élément ignoré : calque de l’insertion)");
      }
      definitionsLues.set(ins.bloc, def!);
    }
    const position = { x: conv(ins.position.x), y: conv(ins.position.y) };
    if (!def) compter("INSERT (bloc hors limites après conversion)");
    else if (!(Math.abs(position.x) <= STUDIO_DXF_LIMITES.coordonnee && Math.abs(position.y) <= STUDIO_DXF_LIMITES.coordonnee) || Math.abs(ins.sx) > STUDIO_LIMITES_BLOCS.echelle) compter("INSERT (coordonnée au-delà de 10⁹ m)");
    else insertionsRetenues.push({ ...ins, position });
  }

  // Calques : table LAYER d'abord (ordre du fichier), puis noms portés seulement par des entités (ordre d'apparition).
  // Comparaison sans casse (« Murs » = « MURS »), dans le fichier comme avec les calques du document.
  const parCle = new Map<string, { nom: string; visible: boolean; verrouille: boolean }>();
  for (const c of s.calques) if (!parCle.has(cleCalque(c.nom))) parCle.set(cleCalque(c.nom), c);
  for (const nom of lecture.calquesEntites) if (!parCle.has(cleCalque(nom))) parCle.set(cleCalque(nom), { nom, visible: true, verrouille: false });
  // Éléments non natifs (lot F3) : seulement à la demande ; leur calque est repris ou créé comme celui d'un objet.
  const ecartees = options.conserverNonNatifs ? lecture.ecartees : [];
  for (const x of ecartees) if (!parCle.has(cleCalque(x.calque))) parCle.set(cleCalque(x.calque), { nom: x.calque, visible: true, verrouille: false });
  const nnParCalque = new Map<string, number>();
  for (const x of ecartees) nnParCalque.set(cleCalque(x.calque), (nnParCalque.get(cleCalque(x.calque)) ?? 0) + 1);
  const objetsParCalque = new Map<string, number>();
  for (const { forme } of retenues) objetsParCalque.set(cleCalque(forme.calque), (objetsParCalque.get(cleCalque(forme.calque)) ?? 0) + 1);
  for (const i of insertionsRetenues) objetsParCalque.set(cleCalque(i.calque), (objetsParCalque.get(cleCalque(i.calque)) ?? 0) + 1);
  const nomsStudio = nomsDeCalques([...parCle].filter(([, c]) => c.nom !== "0"));

  const existants = doc?.layers ?? [];
  const pris = new Set<string>([...(doc?.objects ?? []).map((o) => o.id), ...(doc?.dimensions ?? []).map((d) => d.id), ...existants.map((l) => l.id), ...(doc?.blocs ?? []).map((b) => b.id), ...(doc?.insertions ?? []).map((i) => i.id), ...(doc?.contraintes ?? []).map((c) => c.id)]);
  const idCalque = allocateur(pris, "dxf-calque-");
  const idObjet = allocateur(pris, "dxf-");
  const calques: StudioDxfCalque[] = [];
  const cible = new Map<string, string | undefined>();
  const creer: StudioLayer[] = [];
  const verrouiller: StudioLayer[] = [];
  for (const [cle, c] of parCle) {
    const objets = objetsParCalque.get(cle) ?? 0;
    const recoit = objets + (nnParCalque.get(cle) ?? 0);
    if (c.nom === "0") {
      const defaut = existants.find((l) => l.id === STUDIO_DEFAULT_LAYER_ID);
      if (recoit && defaut?.locked) fail("dxf.calques", "le calque implicite du document est verrouillé");
      calques.push({ nom: c.nom, cible: "implicite", objets });
      cible.set(cle, undefined);
      continue;
    }
    const nom = nomsStudio.get(cle)!;
    const raccourci = nom !== c.nom ? { nomStudio: nom, nomRaccourci: true as const } : {};
    const meme = existants.find((l) => l.id !== STUDIO_DEFAULT_LAYER_ID && cleCalque(l.name) === cleCalque(nom));
    if (meme) {
      if (recoit && meme.locked) fail("dxf.calques", `calque verrouillé dans le document : ${meme.name}`);
      calques.push({ nom: c.nom, cible: "existant", id: meme.id, objets, ...raccourci });
      cible.set(cle, meme.id);
      continue;
    }
    if (!recoit) {
      calques.push({ nom: c.nom, cible: "sans-objet", objets, ...raccourci });
      continue;
    }
    const id = idCalque();
    creer.push({ id, name: nom, visible: c.visible, locked: false });
    if (c.verrouille) verrouiller.push({ id, name: nom, visible: c.visible, locked: true });
    calques.push({ nom: c.nom, cible: "cree", id, objets, ...raccourci });
    cible.set(cle, id);
  }

  const lignes = retenues.filter(({ forme }) => forme.type === "ligne");
  const nombreDe = (t: Forme["type"]) => retenues.filter(({ forme }) => forme.type === t).length;
  const rapport: StudioDxfRapport = {
    unite: { code: s.insunits, valeur: unite, origine },
    reperes: {
      source: { repere: "dxf-wcs", unite, espace: "objet" }, cible: { repere: "local-2d", unite: "m" },
      echelle: unite ? STUDIO_DXF_UNITES[unite].mul / STUDIO_DXF_UNITES[unite].div : null, translation: { x: 0, y: 0 }, rotation: 0, z: "ignore",
    },
    facteur: unite ? STUDIO_DXF_UNITES[unite].mul / STUDIO_DXF_UNITES[unite].div : null,
    entites: {
      lignes: lignes.filter(({ forme }) => forme.type === "ligne" && !forme.segment).length,
      rectangles: nombreDe("rectangle"),
      segments: lignes.filter(({ forme }) => forme.type === "ligne" && forme.segment).length,
      cercles: nombreDe("cercle"),
      arcs: nombreDe("arc"),
      polylignes: nombreDe("polyligne"),
      // Blocs (X.1-01) : présents seulement quand l'import pose des insertions (forme antérieure inchangée sinon).
      ...(insertionsRetenues.length ? { insertions: insertionsRetenues.length, blocs: new Set(insertionsRetenues.map((i) => i.bloc)).size } : {}),
      total: retenues.length + insertionsRetenues.length,
    },
    nonPris: [...nonPris].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([type, nombre]) => ({ type, nombre })),
    calques,
    bornes: null,
    bornesFichier: bornesDe([...retenues.flatMap(({ forme: f }) => pointsForme(f)), ...insertionsRetenues.map((i) => i.position)]),
    zIgnores: lecture.zIgnores,
    ...(options.conserverNonNatifs ? { nonNatifs: ecartees.length } : {}),
  };
  if (!conv) return { statut: "unite-inconnue", commandes: [], rapport };

  const objetsAvant = (doc?.objects.length ?? 0) + (doc?.dimensions?.length ?? 0);
  if ((doc?.nonNatifs?.length ?? 0) + ecartees.length > STUDIO_LIMITS.objects) fail("dxf.objets", `${STUDIO_LIMITS.objects} éléments non natifs au plus par document`);
  if (objetsAvant + retenues.length > STUDIO_LIMITS.objects) fail("dxf.objets", `${STUDIO_LIMITS.objects} objets au plus par document : l’import en ajouterait ${retenues.length} aux ${objetsAvant} existants`);
  if ((doc?.insertions?.length ?? 0) + insertionsRetenues.length > STUDIO_LIMITES_BLOCS.insertions) fail("dxf.objets", `${STUDIO_LIMITES_BLOCS.insertions} insertions au plus par document`);
  if (existants.length + creer.length > STUDIO_LIMITS.layers) fail("dxf.calques", `${STUDIO_LIMITS.layers} calques au plus par document`);

  const commandes: StudioCommand[] = creer.map((l) => ({ toolId: "studio.calque.creer", params: l }));
  const pts: StudioPoint[] = [];
  for (const { forme, geo } of retenues) {
    const layerId = cible.get(cleCalque(forme.calque));
    const calque = layerId === undefined ? {} : { layerId };
    const g = geo!;
    const s = { id: idObjet(), ...g, ...calque } as StudioShape;
    const toolId = ({ line: "studio.dessin.ligne", rectangle: "studio.dessin.rectangle", circle: "studio.dessin.cercle", arc: "studio.dessin.arc", polyline: "studio.dessin.polyligne" } as const)[g.type];
    commandes.push({ toolId, params: s } as StudioCommand);
    pts.push(...studioShapeBoundPoints(s));
  }
  // Blocs insérés (X.1-01) : une définition par bloc (reprise si le document a la même, de même nom), puis les insertions.
  const idBloc = allocateur(pris, "dxf-bloc-");
  const blocsDoc = [...(doc?.blocs ?? [])];
  const idDeBloc = new Map<string, string>();
  for (const i of insertionsRetenues) {
    if (idDeBloc.has(i.bloc)) continue;
    const lu = definitionsLues.get(i.bloc)!;
    const nomBase = (lu.nom.trim() || "Bloc").slice(0, STUDIO_LIMITES_BLOCS.nom);
    const meme = blocsDoc.find((b) => studioCleNomBloc(b.nom) === studioCleNomBloc(nomBase) && JSON.stringify({ base: b.base, e: b.elements }) === JSON.stringify({ base: lu.base, e: lu.elements }));
    if (meme) { idDeBloc.set(i.bloc, meme.id); continue; }
    let nom = nomBase;
    for (let n = 2; blocsDoc.some((b) => studioCleNomBloc(b.nom) === studioCleNomBloc(nom)); n++) { const suffixe = ` (${n})`; nom = nomBase.slice(0, STUDIO_LIMITES_BLOCS.nom - suffixe.length) + suffixe; }
    const def: StudioDefinitionBloc = validerDefinitionBloc({ id: idBloc(), type: "bloc", nom, base: lu.base, elements: lu.elements }, "dxf.bloc");
    blocsDoc.push(def);
    idDeBloc.set(i.bloc, def.id);
    commandes.push({ toolId: "studio.bloc.definir", params: { id: def.id, nom: def.nom, base: def.base, elements: def.elements } });
  }
  for (const i of insertionsRetenues) {
    const layerId = cible.get(cleCalque(i.calque));
    const symetrie = i.sx * i.sy < 0;
    const rotation = studioAngleNormal(((i.rotation + (i.sy < 0 ? 180 : 0)) * Math.PI) / 180);
    const ins: StudioInsertionBloc = validerInsertionBloc({ id: idObjet(), type: "insertion", bloc: idDeBloc.get(i.bloc)!, ...(layerId === undefined ? {} : { layerId }), position: i.position, rotation, echelle: Math.abs(i.sx), ...(symetrie ? { symetrie: true } : {}) }, "dxf.insertion");
    commandes.push({ toolId: "studio.bloc.inserer", params: ins });
    pts.push(...studioPointsInsertion(blocsDoc.find((b) => b.id === ins.bloc)!, ins));
  }
  // Éléments non natifs : origine (type, handle, nom de bloc) et raison ; donnée du fichier, jamais traduite.
  const pris2 = new Set([...pris, ...(doc?.nonNatifs ?? []).map((n) => n.id), ...(doc?.architecture ?? []).map((x) => x.id), ...(doc?.solides ?? []).map((x) => x.id), ...(doc?.annotations ?? []).map((x) => x.id)]);
  const idNonNatif = allocateur(pris2, "dxf-nn-");
  for (const x of ecartees) {
    const layerId = cible.get(cleCalque(x.calque));
    const n: StudioNonNatif = validerNonNatif({
      id: idNonNatif(), type: "non-native", ...(layerId === undefined ? {} : { layerId }),
      origine: { format: "dxf", entite: x.entite.slice(0, 64), ...(x.handle ? { identifiant: x.handle.slice(0, 128) } : {}), ...(x.nom ? { nom: x.nom.slice(0, 200) } : {}) },
      raison: x.raison, ...(x.detail ? { detail: x.detail } : {}),
    }, "dxf.nonNatif");
    commandes.push({ toolId: "studio.nonnatif.conserver", params: n });
  }
  for (const l of verrouiller) commandes.push({ toolId: "studio.calque.modifier", params: l });
  rapport.bornes = bornesDe(pts);
  return { statut: "pret", commandes, rapport };
}

type Geometrie =
  | { type: "line"; start: StudioPoint; end: StudioPoint }
  | { type: "rectangle"; origin: StudioPoint; width: number; height: number }
  | { type: "circle"; center: StudioPoint; radius: number }
  | { type: "arc"; center: StudioPoint; radius: number; startAngle: number; endAngle: number }
  | { type: "polyline"; points: StudioPoint[]; closed: boolean; bulges: number[] };

function convertir(f: Forme, conv: (v: number) => number): Geometrie | "hors-limites" | "nulle" {
  const point = (p: StudioPoint): StudioPoint => ({ x: conv(p.x), y: conv(p.y) });
  const dehors = (...ps: StudioPoint[]) => ps.some((p) => !(Math.abs(p.x) <= STUDIO_DXF_LIMITES.coordonnee && Math.abs(p.y) <= STUDIO_DXF_LIMITES.coordonnee));
  if (f.type === "ligne") {
    const start = point(f.a), end = point(f.b);
    if (dehors(start, end)) return "hors-limites";
    // Deux points distincts dans le fichier peuvent se confondre une fois arrondis au nanomètre.
    return start.x === end.x && start.y === end.y ? "nulle" : { type: "line", start, end };
  }
  if (f.type === "cercle" || f.type === "arc") {
    const center = point(f.c), radius = conv(f.r);
    if (dehors(center, { x: center.x + radius, y: center.y + radius }, { x: center.x - radius, y: center.y - radius })) return "hors-limites";
    if (!(radius > 0)) return "nulle";
    return f.type === "cercle" ? { type: "circle", center, radius } : { type: "arc", center, radius, startAngle: f.a0, endAngle: f.a1 };
  }
  if (f.type === "polyligne") {
    const points = f.pts.map(point);
    if (dehors(...points)) return "hors-limites";
    const n = points.length;
    for (let i = 0; i < (f.ferme ? n : n - 1); i++) {
      const a = points[i]!, b = points[(i + 1) % n]!;
      if (a.x === b.x && a.y === b.y) return "nulle";
    }
    return { type: "polyline", points, closed: f.ferme, bulges: [...f.bulges] };
  }
  const origin = point(f.min), max = point(f.max);
  if (dehors(origin, max)) return "hors-limites";
  const width = Math.round((max.x - origin.x) * 1e9) / 1e9, height = Math.round((max.y - origin.y) * 1e9) / 1e9;
  return width > 0 && height > 0 ? { type: "rectangle", origin, width, height } : "nulle";
}

/**
 * Noms Studio des calques du fichier (hors « 0 »), déterministes à partir du seul fichier : un nom au-delà de
 * `STUDIO_LIMITS.layerName` caractères est raccourci, puis rendu unique (sans casse) par un suffixe « (2) », « (3) »…
 * Un nouvel import du même fichier retrouve donc les mêmes noms, et reprend les calques créés la première fois.
 */
function nomsDeCalques(entrees: [string, { nom: string }][]): Map<string, string> {
  const max = STUDIO_LIMITS.layerName;
  const out = new Map<string, string>();
  const utilises = new Set<string>();
  for (const [cle, c] of entrees) if (c.nom.length <= max) {
    out.set(cle, c.nom);
    utilises.add(cle);
  }
  for (const [cle, c] of entrees) {
    if (c.nom.length <= max) continue;
    let nom = c.nom.slice(0, max);
    for (let n = 2; utilises.has(cleCalque(nom)); n++) {
      const suffixe = ` (${n})`;
      nom = c.nom.slice(0, max - suffixe.length) + suffixe;
    }
    utilises.add(cleCalque(nom));
    out.set(cle, nom);
  }
  return out;
}
