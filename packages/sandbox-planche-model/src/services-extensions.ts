/**
 * Services que la Planche rend à une extension (protocole 1.0, lot 2) : lecture complète du modèle, opération
 * explicite, sélection. Module pur : la Planche lui prête son modèle par `AccesPlanche`, rien n'est dessiné ici.
 *
 * Règles (spécification du protocole, « Opération ») :
 *  - toute modification se fait dans une opération ; à la validation, l'ensemble est appliqué d'un bloc, en un seul pas
 *    d'annulation, sous le nom donné ;
 *  - une seule opération à la fois par extension : en ouvrir une seconde est une erreur nommée ;
 *  - une modification sans opération ouverte reçoit une opération automatique au nom de l'appel en cours, validée à la
 *    fin de cet appel ;
 *  - avant d'appliquer, la Planche vérifie que le dessin n'a pas changé depuis l'ouverture ; sinon l'opération est
 *    refusée, rien n'est appliqué, et l'extension en est prévenue par une erreur nommée.
 *
 * Tant qu'une opération est ouverte, l'extension lit son modèle de travail (elle voit ses propres changements) ;
 * l'utilisateur, lui, ne voit rien avant la validation.
 */
import { changerDonneesExtension, estCleDonnee, lireCibleDonnees, lireDonneesExtension, lireValeurDonnee, BORNES_DONNEES, type MotifDonnees } from "./donnees-extensions.js";
import type { Cote, DirectionCote, FormatCote } from "./annotations.js";
import { reglagesDe } from "./cotes.js";
import { ajouterArc, ajouterPolygone, ajouterSegments, ajouterTriangles, appliquer, baliserOccurrences, composer, contexte, IDENTITE, modifierAnnotations, peindreFaces, peindreOccurrences, positionsFace, verrouillerOccurrences, type Contexte, type Id, type Matrice4, type Modele } from "./geometrie-libre.js";
import { arcParTroisPoints, formaterNombre, pointsArc } from "./outils/commun-formes.js";
import { estMotif, NOM_MOTIF_MAX } from "./plan-vectoriel.js";
import { formaterAire } from "./outils/metre.js";
import { FONCTIONS_MODIFICATION, FONCTIONS_MODIFICATION_SCRIPT, jugerDemandeExtension, type ErreurProtocole, type FicheExtension, type FonctionModification } from "./protocole-extensions.js";
import { ErreurScript, creerFonctionsPlanche, type FonctionScript, type FonctionsPlanche } from "./scripts.js";
import { type Vec3, v3 } from "./vecteur.js";
import { niveauxTries } from "./niveaux.js";
import { rayonFace, scene } from "./outils/selection.js";
import { PasUnSolide, maillageDuSolide, motifNonSolide, type Maillage } from "./maillage.js";
import type { AdaptateurBooleens, PointPlan, PolygonePlan } from "./outils/machine.js";

/** Ce que la Planche prête à une extension. Les lectures rendent l'état courant à chaque appel. */
export interface AccesPlanche {
  readonly modele: () => Modele;
  readonly selection: () => readonly Id[];
  /** Occurrence ouverte en édition ; `undefined` = racine. */
  readonly dans: () => Id | undefined;
  /** Applique un modèle de travail en un seul pas d'annulation nommé ; `false` si la Planche le refuse. */
  readonly appliquer: (travail: Modele, nom: string, crees: readonly Id[], contexte?: ContexteApplication) => boolean;
  readonly selectionner: (ids: readonly Id[], contexte?: ContexteApplication) => void;
  /** Séparateur décimal de l'interface (lot 7, « unites ») ; absent = virgule. */
  readonly separateur?: () => "." | ",";
  /** (1.3) Décimales d'affichage des longueurs choisies pour le projet (Info modèle) ; absent = 2. */
  readonly decimales?: () => number;
  /** (1.4) Moteur booléen chargé (manifold-3d), pour les opérations planes ; absent ou `null` = pas chargé. */
  readonly booleens?: () => AdaptateurBooleens | null;
  /** (1.4) Altitude NGF du ±0,00 de la planche (Info planche) ; absent ou `null` = non renseignée. */
  readonly referenceNGF?: () => number | null;
}

/** Dans quel appel une opération est appliquée (lot 7). */
export interface ContexteApplication {
  /** Vrai pendant un événement : l'opération se rattache au pas d'annulation de l'utilisateur, sans en créer un. */
  readonly discrete: boolean;
  /** Ce que la Planche a joint à l'appel (rang dans une chaîne de réactions) ; rendu tel quel. */
  readonly marque: unknown;
}
export interface OptionsAppel {
  readonly discrete?: boolean;
  readonly marque?: unknown;
}

/** Les fonctions de « modele.modifier » en 1.0 sont bien des fonctions d'un script personnel (contrôle de type). */
FONCTIONS_MODIFICATION_SCRIPT satisfies readonly FonctionScript[];

export const MAX_NOM_OPERATION = 80;
/** Au-delà, « modele.lire » est refusé plutôt que de transmettre un modèle démesuré à l'espace isolé. */
export const MAX_ENTITES_LECTURE = 50_000;
/** (1.1) Niveaux d'occurrences imbriquées descendus par la lecture du modèle entier ; au-delà, la lecture est refusée. */
export const MAX_PROFONDEUR_MONDE = 32;
export const MAX_SELECTION_EXTENSION = 10_000;
/** (1.1) Segments d'un seul appel « lignes » ; côtés d'un arc ou d'un cercle (bornes de la Planche, 3 à 999). */
export const MAX_SEGMENTS_APPEL = 20_000;
/** (1.6) Triangles d'un seul appel « triangles » (l'insertion fusionne les coplanaires : coût croissant, borne prudente). */
export const MAX_TRIANGLES_APPEL = 5_000;
/** (1.6) Rayons d'un seul appel `geometrie.rayon`. */
export const MAX_RAYONS_APPEL = 2_000;
export const COTES_ARC_DEFAUT = 12;
export const COTES_CERCLE_DEFAUT = 24;
/** (1.1) Nom d'une balise créée par une extension, en caractères. */
export const MAX_NOM_BALISE = 80;
/** (1.5) Nom d'une matière créée par une extension, en caractères. */
export const MAX_NOM_MATIERE = 80;
/** (1.5) Couleur d'une matière créée sans couleur : gris neutre de la Planche. */
export const COULEUR_MATIERE_DEFAUT = "#bdbdbd";
/** (1.4) Solides d'une coupe ou d'une projection ; polygones et points d'une union ; hauteur de coupe (± m). */
export const BORNES_PLANS = { solides: 5_000, polygones: 10_000, points: 200_000, hauteur: 10_000 } as const;

/** (1.4) Polygone rendu à l'extension : contour extérieur, trous, aire nette en m². */
export interface PolygoneLu {
  readonly exterieur: PointPlan[];
  readonly trous: PointPlan[][];
  readonly aire: number;
}
/** (1.4) Résultat d'une coupe ou d'une projection : union de tous les solides, puis le détail par solide. */
export interface PlansLus {
  readonly polygones: PolygoneLu[];
  /** Aire de l'union (aucun recouvrement compté deux fois), en m². */
  readonly aire: number;
  /** Chaque solide retenu (chemin depuis la racine : une instance de composant par chemin) et sa propre aire. */
  readonly solides: { readonly id: Id; readonly chemin: Id[]; readonly balise: Id | null; readonly aire: number }[];
  /** Objets écartés parce qu'ils ne sont pas des solides fermés, avec le motif : rien n'est omis en silence. */
  readonly ecartes: { readonly id: Id; readonly chemin: Id[]; readonly motif: string }[];
  /** Faces posées à la racine hors de tout groupe : jamais comptées (pas un solide). */
  readonly facesLibres: number;
}

const aireContourPlan = (c: readonly PointPlan[]): number => {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i] as PointPlan;
    const q = c[(i + 1) % c.length] as PointPlan;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};
const polygoneLu = (p: PolygonePlan): PolygoneLu => ({
  exterieur: p.exterieur.map(([x, y]) => [x, y]),
  trous: p.trous.map((t) => t.map(([x, y]) => [x, y] as PointPlan)),
  aire: aireContourPlan(p.exterieur) - p.trous.reduce((s, t) => s + aireContourPlan(t), 0),
});
const airePolygones = (ps: readonly PolygoneLu[]): number => ps.reduce((s, p) => s + p.aire, 0);
/**
 * Tous les chemins (racine → occurrence) qui mènent à un objet, chacun avec sa matrice monde composée et la balise
 * héritée (celle de l'objet, sinon du plus proche contenant qui en porte une). Bornés à `BORNES_PLANS.solides`.
 */
function cheminsVers(m: Modele, id: Id): { chemin: Id[]; M: Matrice4; balise: Id | null }[] {
  const trouves: { chemin: Id[]; M: Matrice4; balise: Id | null }[] = [];
  const chercher = (c: Contexte, M: Matrice4, chemin: Id[], herite: Id | null, prof: number): void => {
    if (prof > MAX_PROFONDEUR_MONDE || trouves.length >= BORNES_PLANS.solides) return;
    for (const o of Object.values(c.occurrences)) {
      const M2 = composer(M, o.transformation);
      const b = o.balise ?? herite;
      const ch = [...chemin, o.id];
      if (o.id === id) trouves.push({ chemin: ch, M: M2, balise: b });
      const d = m.definitions[o.definition];
      if (d) chercher(d.contenu, M2, ch, b, prof + 1);
    }
  };
  chercher(m.racine, IDENTITE, [], null, 1);
  return trouves;
}

/** (1.4) Polygones passés par une extension : `{ exterieur, trous? }`, points `[x, y]` finis ; message d'erreur sinon. */
function lirePolygonesPlan(v: unknown): PolygonePlan[] | string {
  if (!Array.isArray(v) || v.length === 0 || v.length > BORNES_PLANS.polygones) return `polygones : liste de 1 à ${BORNES_PLANS.polygones} polygones attendue`;
  let points = 0;
  const contour = (c: unknown): PointPlan[] | null => {
    if (!Array.isArray(c) || c.length < 3) return null;
    const pts: PointPlan[] = [];
    for (const p of c) {
      if (!Array.isArray(p) || p.length !== 2 || !p.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
      pts.push([p[0], p[1]]);
    }
    points += pts.length;
    return pts;
  };
  const sortie: PolygonePlan[] = [];
  for (const brut of v) {
    if (!estObjet(brut)) return "polygone : { exterieur, trous } attendu";
    const exterieur = contour(brut["exterieur"]);
    if (!exterieur) return "exterieur : au moins 3 points [x, y] attendus";
    const t = brut["trous"] ?? [];
    if (!Array.isArray(t)) return "trous : liste de contours attendue";
    const trous: PointPlan[][] = [];
    for (const c of t) {
      const lu = contour(c);
      if (!lu) return "trou : au moins 3 points [x, y] attendus";
      trous.push(lu);
    }
    if (points > BORNES_PLANS.points) return `polygones de plus de ${BORNES_PLANS.points} points`;
    sortie.push({ exterieur, trous });
  }
  return sortie;
}
/** (1.3) Texte posé par une extension (`textes.creer`), en caractères. */
export const MAX_TEXTE_EXTENSION = 200;
/** (1.3) Directions admises d'une cote créée par une extension. */
export const DIRECTIONS_COTE: readonly DirectionCote[] = ["alignee", "horizontale", "verticale", "axe-x", "axe-y", "axe-z"];
/** Couleur d'une balise : « #rrggbb ». */
const MOTIF_COULEUR = /^#[0-9a-fA-F]{6}$/;
/** Couleur d'une balise créée sans couleur : celle que propose le panneau Balises de la Planche. */
export const COULEUR_BALISE_DEFAUT = "#2f7bd6";

export interface FaceLue {
  readonly id: Id;
  /** Contour extérieur, en mètres. */
  readonly points: readonly (readonly [number, number, number])[];
  readonly trous: number;
  /** Aire en m². */
  readonly aire: number;
  /** (Lot 7) Matière du recto, ou `null`. */
  readonly matiere: Id | null;
}
export interface AreteLue {
  readonly id: Id;
  readonly points: readonly (readonly [number, number, number])[];
  /** Longueur en mètres. */
  readonly longueur: number;
  /** (1.1) Courbe dont l'arête fait partie (arc, cercle, polygone), pour l'écrire en vrai arc ; `null` = segment simple. */
  readonly courbe?: CourbeLue | null;
}
/** (1.1) Courbe d'une arête, dans les coordonnées de la lecture. */
export interface CourbeLue {
  readonly id: Id;
  readonly genre: "cercle" | "polygone" | "arc";
  readonly centre: readonly [number, number, number];
  readonly rayon: number;
  readonly normale: readonly [number, number, number];
}
/**
 * (1.1) Lecture du modèle entier (`modele.lire({ portee: "monde" })`) : chaque face et chaque arête, à tous les niveaux,
 * en coordonnées du modèle. `chemin` = occurrences traversées depuis la racine (vide à la racine) : une même arête d'un
 * composant posé deux fois apparaît deux fois, avec deux chemins. `balise` = celle de l'occurrence la plus proche qui
 * en porte une ; `null` = aucune.
 */
export interface FaceMonde extends FaceLue {
  readonly chemin: readonly Id[];
  readonly balise: Id | null;
}
export interface AreteMonde extends AreteLue {
  readonly chemin: readonly Id[];
  readonly balise: Id | null;
}
export interface ModeleLuMonde {
  readonly portee: "monde";
  readonly faces: readonly FaceMonde[];
  readonly aretes: readonly AreteMonde[];
  readonly enOperation: boolean;
}
export interface ObjetLu {
  readonly id: Id;
  readonly nom: string;
  readonly genre: "groupe" | "composant";
  /** (Lot 7) Matière et balise posées sur l'objet, ou `null`. */
  readonly matiere: Id | null;
  readonly balise: Id | null;
}

/** (Lot 7) Unités de la Planche : le dessin est en mètres ; l'affichage suit la langue de l'interface. */
export interface UnitesLues {
  readonly longueur: "m";
  readonly aire: "m²";
  readonly decimales: number;
  readonly separateur: "." | ",";
  /** (1.3) Pas d'accrochage des longueurs saisies (m), ou `null` s'il est coupé. */
  readonly pasLongueur: number | null;
  /** (1.3) Pas d'accrochage des angles (degrés), ou `null` s'il est coupé. */
  readonly pasAngle: number | null;
  /** (1.3) Format des valeurs de cote du projet. */
  readonly formatCote: FormatCote;
}
/** Rendu par « modele.lire » : tout le contexte courant (la racine, ou l'objet ouvert en édition). */
export interface ModeleLu {
  readonly faces: readonly FaceLue[];
  readonly aretes: readonly AreteLue[];
  /** (1.3) Groupe ou composant ouvert en édition (le contexte lu), ou `null` à la racine. */
  readonly dans?: Id | null;
  readonly objets: readonly ObjetLu[];
  /** Vrai pendant une opération ouverte : la lecture montre le modèle de travail de l'extension. */
  readonly enOperation: boolean;
}

export type ReponseService = { readonly ok: true; readonly resultat: unknown } | { readonly ok: false; readonly erreur: ErreurProtocole; readonly detail: string };

export interface ServicesExtension {
  /** Début d'un appel adressé à l'extension (commande ou événement) : `nom` nomme l'opération automatique éventuelle. */
  readonly debutAppel: (nom: string, options?: OptionsAppel) => void;
  /**
   * Fin de l'appel. `reussi` faux (erreur, délai, arrêt) : l'opération en cours est abandonnée, quelle qu'elle soit.
   * `reussi` vrai : l'opération automatique est validée ; une opération explicite reste ouverte. Rend `false` si une
   * opération automatique n'a pas pu être appliquée (dessin changé entre-temps).
   */
  readonly finAppel: (reussi: boolean) => boolean;
  readonly servir: (nom: string, donnees: unknown) => ReponseService;
  /** Abandonne l'opération ouverte, sans rien appliquer (arrêt ou désinstallation de l'extension). */
  readonly abandonner: () => void;
  readonly operationOuverte: () => boolean;
}

interface Operation {
  readonly nom: string;
  readonly automatique: boolean;
  /** Modèle et contexte de la Planche à l'ouverture : comparés à la validation. */
  readonly base: Modele;
  readonly dans: Id | undefined;
  readonly travail: FonctionsPlanche;
  /** Sélection demandée pendant l'opération : posée à la validation seulement. */
  selection: readonly Id[] | null;
}

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const refus = (erreur: ErreurProtocole, detail = ""): ReponseService => ({ ok: false, erreur, detail });
const rendu = (resultat: unknown = null): ReponseService => ({ ok: true, resultat });

const triplet = (p: Vec3): [number, number, number] => [p.x, p.y, p.z];
const estPoint = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));
const versVec = (v: readonly [number, number, number]): Vec3 => v3(v[0], v[1], v[2]);

/** Courbe d'une arête d'un contexte, transformée par `M` (lecture du modèle entier) ou telle quelle. */
function courbeLue(c: Contexte, id: Id | undefined, M: Matrice4 | null): CourbeLue | null {
  const k = id !== undefined ? c.courbes[id] : undefined;
  if (!k) return null;
  if (!M) return { id: k.id, genre: k.genre, centre: triplet(k.centre), rayon: k.rayon, normale: triplet(k.normale) };
  const centre = appliquer(M, k.centre);
  const bout = appliquer(M, v3(k.centre.x + k.normale.x, k.centre.y + k.normale.y, k.centre.z + k.normale.z));
  const n = v3(bout.x - centre.x, bout.y - centre.y, bout.z - centre.z);
  const ln = Math.hypot(n.x, n.y, n.z) || 1;
  // Rayon mesuré sur une arête réelle de la courbe : il suit une mise à l'échelle de l'occurrence.
  const arete = k.aretes.map((a) => c.aretes[a]).find((a) => a !== undefined);
  const sommet = arete ? c.sommets[arete.a]?.position : undefined;
  const p = sommet ? appliquer(M, sommet) : undefined;
  const rayon = p ? Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z) : k.rayon;
  // Une mise à l'échelle non uniforme dans le plan de la courbe en fait une ellipse : la courbe n'est alors plus
  // annoncée (les segments restent seuls exacts).
  for (const id of k.aretes) {
    const a = c.aretes[id];
    for (const s of a ? [a.a, a.b] : []) {
      const q = c.sommets[s]?.position;
      if (!q) continue;
      const t = appliquer(M, q);
      if (Math.abs(Math.hypot(t.x - centre.x, t.y - centre.y, t.z - centre.z) - rayon) > 1e-6 * Math.max(1, rayon)) return null;
    }
  }
  return { id: k.id, genre: k.genre, centre: triplet(centre), rayon, normale: [n.x / ln, n.y / ln, n.z / ln] };
}

/**
 * (1.1) Modèle entier en coordonnées du modèle : racine puis occurrences, descendues avec leur transformation composée
 * (masquées exclues, comme à l'affichage et à l'export). Rend le motif du refus quand le modèle dépasse `max` entités ou
 * `MAX_PROFONDEUR_MONDE` niveaux d'imbrication : rien n'est omis en silence.
 */
function lireMonde(m: Modele, max: number): { faces: FaceMonde[]; aretes: AreteMonde[] } | string {
  const faces: FaceMonde[] = [];
  const aretes: AreteMonde[] = [];
  let motif = null as string | null;
  const parcourir = (c: Contexte, M: Matrice4 | null, chemin: readonly Id[], balise: Id | null, profondeur: number): void => {
    if (motif) return;
    if (profondeur > MAX_PROFONDEUR_MONDE) {
      motif = `modèle imbriqué sur plus de ${MAX_PROFONDEUR_MONDE} niveaux`;
      return;
    }
    const T = (q: Vec3): [number, number, number] => triplet(M ? appliquer(M, q) : q);
    for (const f of Object.values(c.faces)) {
      if (f.masquee) continue;
      const p = positionsFace(c, f);
      const pts = p.exterieur.map(T);
      faces.push({ id: f.id, chemin, balise, points: pts, trous: f.trous.length, aire: aireContour(pts, p.trous.map((t) => t.map(T))), matiere: f.materiauRecto ?? null });
    }
    for (const a of Object.values(c.aretes)) {
      if (a.masquee) continue;
      const pa = c.sommets[a.a]?.position;
      const pb = c.sommets[a.b]?.position;
      if (!pa || !pb) continue;
      const [qa, qb] = [T(pa), T(pb)];
      aretes.push({ id: a.id, chemin, balise, points: [qa, qb], longueur: Math.hypot(qb[0] - qa[0], qb[1] - qa[1], qb[2] - qa[2]), courbe: courbeLue(c, a.courbe, M) });
    }
    if (faces.length + aretes.length > max) {
      motif = `modèle de plus de ${max} entités`;
      return;
    }
    for (const o of Object.values(c.occurrences)) {
      if (o.masquee) continue;
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, M ? composer(M, o.transformation) : o.transformation, [...chemin, o.id], o.balise ?? balise, profondeur + 1);
    }
  };
  parcourir(m.racine, null, [], null, 0);
  return motif ?? { faces, aretes };
}

/**
 * (1.1) Arguments de « lignes », « arc » et « cercle », en mètres :
 *   lignes([[a, b], …])                         segments, une seule opération ; rend les éléments créés
 *   arc(depart, milieu, fin, cotes = 12)        arc passant par trois points, une courbe « arc »
 *   cercle(centre, rayon, normale = [0, 0, 1], cotes = 24)   cercle, une courbe, face automatique
 * Rend l'opération du modèle à faire, ou le motif du refus.
 */
function lireCourbe(fonction: "lignes" | "arc" | "cercle" | "triangles", args: readonly unknown[]): string | ((m: Modele, dans: Id | undefined) => ReturnType<typeof ajouterSegments>) {
  const cotes = (v: unknown, defaut: number): number | null => (v === undefined ? defaut : typeof v === "number" && Number.isInteger(v) && v >= 3 && v <= 999 ? v : null);
  const o = (dans: Id | undefined) => (dans !== undefined ? { dans } : {});
  if (fonction === "lignes") {
    const l = args[0];
    if (!Array.isArray(l) || l.length === 0 || l.length > MAX_SEGMENTS_APPEL || !l.every((s) => Array.isArray(s) && s.length === 2 && estPoint(s[0]) && estPoint(s[1]))) return `lignes : liste de 1 à ${MAX_SEGMENTS_APPEL} segments [[x, y, z], [x, y, z]] attendue`;
    const segments = (l as [[number, number, number], [number, number, number]][]).map(([a, b]) => [versVec(a), versVec(b)] as const);
    return (m, dans) => ajouterSegments(m, segments, o(dans));
  }
  if (fonction === "triangles") {
    const l = args[0];
    if (!Array.isArray(l) || l.length === 0 || l.length > MAX_TRIANGLES_APPEL || !l.every((t) => Array.isArray(t) && t.length === 3 && t.every(estPoint))) return `triangles : liste de 1 à ${MAX_TRIANGLES_APPEL} triangles [[x, y, z], [x, y, z], [x, y, z]] attendue`;
    // Un triangle d'aire nulle n'a pas de normale : refusé avec son rang (rien n'est ignoré en silence).
    const tris = (l as [number, number, number][][]).map((t) => t.map(versVec) as unknown as readonly [Vec3, Vec3, Vec3]);
    const plat = tris.findIndex(([a, b, c]) => {
      const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const w = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      return Math.hypot(u.y * w.z - u.z * w.y, u.z * w.x - u.x * w.z, u.x * w.y - u.y * w.x) < 1e-12;
    });
    if (plat >= 0) return `triangles : le triangle ${plat + 1} est d'aire nulle`;
    return (m, dans) => ajouterTriangles(m, tris, o(dans));
  }
  if (fonction === "arc") {
    const [a, p, b, n] = args;
    if (!estPoint(a) || !estPoint(p) || !estPoint(b)) return "arc : trois points [x, y, z] attendus (départ, milieu, fin)";
    const k = cotes(n, COTES_ARC_DEFAUT);
    if (k === null) return "arc : côtés, entier de 3 à 999";
    const g = arcParTroisPoints(versVec(a), versVec(p), versVec(b));
    if (!g) return "arc : les trois points sont alignés ou confondus";
    return (m, dans) => ajouterArc(m, pointsArc(g, k), { centre: g.centre, rayon: g.rayon, normale: g.normale }, o(dans));
  }
  const [centre, rayon, normale, n] = args;
  if (!estPoint(centre)) return "cercle : centre [x, y, z] attendu";
  if (typeof rayon !== "number" || !Number.isFinite(rayon) || rayon <= 0) return "cercle : rayon positif attendu, en mètres";
  const nn = normale === undefined ? ([0, 0, 1] as [number, number, number]) : normale;
  if (!estPoint(nn) || Math.hypot(...nn) < 1e-9) return "cercle : normale [x, y, z] non nulle attendue";
  const k = cotes(n, COTES_CERCLE_DEFAUT);
  if (k === null) return "cercle : côtés, entier de 3 à 999";
  return (m, dans) => ajouterPolygone(m, versVec(centre), versVec(nn), rayon, k, { ...o(dans), genre: "cercle" });
}

/** Aire d'un contour plan (moins ses trous), par le produit vectoriel : vaut aussi après transformation. */
function aireContour(exterieur: readonly (readonly [number, number, number])[], trous: readonly (readonly (readonly [number, number, number])[])[]): number {
  const aire = (b: readonly (readonly [number, number, number])[]): number => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i]!;
      const q = b[(i + 1) % b.length]!;
      x += p[1] * q[2] - p[2] * q[1];
      y += p[2] * q[0] - p[0] * q[2];
      z += p[0] * q[1] - p[1] * q[0];
    }
    return Math.hypot(x, y, z) / 2;
  };
  return Math.max(0, aire(exterieur) - trous.reduce((s, t) => s + aire(t), 0));
}

export function creerServicesExtension(fiche: Pick<FicheExtension, "permissions" | "id">, acces: AccesPlanche): ServicesExtension {
  let operation: Operation | null = null;
  let appel: string | null = null;
  let optionsAppel: OptionsAppel = {};
  const contexteCourant = (): ContexteApplication => ({ discrete: optionsAppel.discrete === true, marque: optionsAppel.marque });

  const fonctions = (modele: Modele, dans: Id | undefined): FonctionsPlanche => creerFonctionsPlanche(modele, { selection: acces.selection(), ...(dans !== undefined ? { dans } : {}) });
  /** Fonctions de lecture : sur le modèle de travail si une opération est ouverte, sinon sur le modèle de la Planche. */
  const vue = (): FonctionsPlanche => operation?.travail ?? fonctions(acces.modele(), acces.dans());

  const ouvrir = (nom: string, automatique: boolean): Operation => {
    const base = acces.modele();
    const dans = acces.dans();
    operation = { nom, automatique, base, dans, travail: fonctions(base, dans), selection: null };
    return operation;
  };

  const valider = (): ReponseService => {
    const op = operation;
    if (!op) return refus("operation_absente");
    operation = null;
    const travail = op.travail.modele();
    const crees = op.travail.crees();
    // Le dessin ou le contexte d'édition a changé depuis l'ouverture : rien n'est appliqué, ni dessin ni sélection
    // (une sélection retenue pendant l'opération désigne des objets du modèle d'alors).
    if ((travail !== op.base || op.selection) && (acces.modele() !== op.base || acces.dans() !== op.dans)) return refus("operation_refusee", "le dessin a changé depuis l'ouverture de l'opération");
    if (travail !== op.base && !acces.appliquer(travail, op.nom, crees, contexteCourant())) return refus("operation_refusee", "la Planche a refusé l'opération");
    if (op.selection) acces.selectionner(op.selection.filter((id) => op.travail.existe(id)), contexteCourant());
    return rendu({ crees });
  };

  const lire = (donnees: unknown): ReponseService => {
    const portee = estObjet(donnees) ? (donnees["portee"] ?? "contexte") : "contexte";
    if (portee !== "contexte" && portee !== "monde") return refus("argument_invalide", "portee : « contexte » ou « monde »");
    const f = vue();
    const m = f.modele();
    if (portee === "monde") {
      const monde = lireMonde(m, MAX_ENTITES_LECTURE);
      if (typeof monde === "string") return refus("argument_invalide", monde);
      const lu: ModeleLuMonde = { portee: "monde", ...monde, enOperation: operation !== null };
      return rendu(lu);
    }
    const dans = operation ? operation.dans : acces.dans();
    const c = contexte(m, dans);
    const faces = Object.keys(c.faces);
    const aretes = Object.keys(c.aretes);
    const objets = Object.values(c.occurrences);
    if (faces.length + aretes.length + objets.length > MAX_ENTITES_LECTURE) return refus("argument_invalide", `modèle de plus de ${MAX_ENTITES_LECTURE} entités`);
    const points = (id: Id) => f.api.points(id) as [number, number, number][];
    const lu: ModeleLu = {
      faces: faces.map((id) => ({ id, points: points(id), trous: c.faces[id]!.trous.length, aire: f.api.aire(id) as number, matiere: c.faces[id]!.materiauRecto ?? null })),
      aretes: aretes.map((id) => ({ id, points: points(id), longueur: f.api.longueur(id) as number, courbe: courbeLue(c, c.aretes[id]!.courbe, null) })),
      objets: objets.map((occ) => ({ id: occ.id, nom: f.api.nom(occ.id) as string, genre: m.definitions[occ.definition]?.genre ?? "groupe", matiere: occ.materiau ?? null, balise: occ.balise ?? null })),
      dans: dans ?? null,
      enOperation: operation !== null,
    };
    return rendu(lu);
  };

  const modifier = (donnees: unknown): ReponseService => {
    if (!estObjet(donnees) || typeof donnees["fonction"] !== "string" || !(FONCTIONS_MODIFICATION as readonly string[]).includes(donnees["fonction"])) return refus("argument_invalide", "fonction de dessin inconnue");
    const args = donnees["arguments"] ?? [];
    if (!Array.isArray(args) || args.length > 8) return refus("argument_invalide", "arguments : liste attendue");
    const fonction = donnees["fonction"] as FonctionModification;
    // Fonctions de 1.1 : arguments lus ici, avant toute opération (un argument faux n'ouvre rien).
    let courbe: ((m: Modele, dans: Id | undefined) => { readonly modele: Modele; readonly rapport: { readonly crees: readonly Id[]; readonly supprimes: readonly Id[]; readonly modifies: readonly Id[] } }) | null = null;
    if (fonction === "lignes" || fonction === "arc" || fonction === "cercle" || fonction === "triangles") {
      const lu = lireCourbe(fonction, args);
      if (typeof lu === "string") return refus("argument_invalide", lu);
      courbe = lu;
    }
    // Sans opération ouverte : opération automatique au nom de l'appel en cours, validée à la fin de l'appel.
    const op = operation ?? ouvrir(appel ?? "extension", true);
    // Une fonction fait parfois plusieurs opérations du modèle (une boîte : sa base, puis son volume) : refusée à
    // mi-chemin, elle ne laisse rien dans le modèle de travail.
    const revenir = op.travail.figer();
    try {
      if (courbe) return rendu(op.travail.appliquer(courbe(op.travail.modele(), op.dans)));
      return rendu(op.travail.api[fonction as FonctionScript](...(args as unknown[])) ?? null);
    } catch (e) {
      revenir();
      if (e instanceof ErreurScript) return refus(e.cle === "introuvable" ? "objet_introuvable" : "argument_invalide", e.message);
      // Refus du modèle lui-même (géométrie impossible) : l'opération reste ouverte, l'extension décide de la suite.
      return refus("argument_invalide", (e instanceof Error ? e.message : String(e)).slice(0, 500));
    }
  };

  const definirSelection = (donnees: unknown): ReponseService => {
    const ids = estObjet(donnees) ? donnees["ids"] : null;
    if (!Array.isArray(ids) || ids.length > MAX_SELECTION_EXTENSION || !ids.every((x): x is string => typeof x === "string")) return refus("argument_invalide", "ids : liste d'identifiants attendue");
    const f = vue();
    const absent = ids.find((id) => !f.existe(id));
    if (absent !== undefined) return refus("objet_introuvable", absent);
    const uniques = [...new Set(ids)];
    if (operation) operation.selection = uniques;
    else acces.selectionner(uniques, contexteCourant());
    return rendu();
  };

  /** `matieres.appliquer` et `balises.appliquer` : une modification, dans l'opération ouverte ou automatique. */
  const appliquerAttribut = (donnees: unknown, quoi: "matiere" | "balise"): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const ids = d ? d["ids"] : null;
    const valeur = d ? d[quoi] : undefined;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SELECTION_EXTENSION || !ids.every((x): x is string => typeof x === "string")) return refus("argument_invalide", "ids : liste d'identifiants attendue");
    if (valeur !== null && typeof valeur !== "string") return refus("argument_invalide", `${quoi} : identifiant, ou null pour retirer`);
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const m = op.travail.modele();
    const table = quoi === "matiere" ? m.annotations?.materiaux : m.annotations?.balises;
    if (valeur !== null && !(table && Object.prototype.hasOwnProperty.call(table, valeur))) return refus("objet_introuvable", valeur);
    const c = contexte(m, op.dans);
    const uniques = [...new Set(ids)];
    const faces = uniques.filter((id) => c.faces[id]);
    const objets = uniques.filter((id) => c.occurrences[id]);
    const absent = uniques.find((id) => !c.faces[id] && !c.occurrences[id]);
    if (absent !== undefined) return refus("objet_introuvable", absent);
    if (quoi === "balise" && faces.length) return refus("argument_invalide", "une balise se pose sur un objet, pas sur une face");
    const o = op.dans !== undefined ? { dans: op.dans } : {};
    const revenir = op.travail.figer();
    try {
      if (quoi === "balise") op.travail.appliquer(baliserOccurrences(m, objets, valeur, o));
      else {
        if (faces.length) op.travail.appliquer(peindreFaces(op.travail.modele(), faces, valeur, o));
        if (objets.length) op.travail.appliquer(peindreOccurrences(op.travail.modele(), objets, valeur, o));
      }
    } catch (e) {
      revenir();
      return refus("argument_invalide", (e instanceof Error ? e.message : String(e)).slice(0, 500));
    }
    return rendu();
  };

  /**
   * (1.1) `balises.creer { nom, couleur? }` : une balise nouvelle, visible, dans l'opération ouverte ou automatique ;
   * rend son identifiant. Une balise du même nom existe déjà : son identifiant est rendu, rien n'est créé (un plan
   * importé deux fois ne double pas ses calques).
   */
  const creerBalise = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const nom = d && typeof d["nom"] === "string" ? d["nom"].trim() : "";
    const couleur = d ? (d["couleur"] ?? COULEUR_BALISE_DEFAUT) : COULEUR_BALISE_DEFAUT;
    if (nom.length === 0 || nom.length > MAX_NOM_BALISE) return refus("argument_invalide", `nom : texte de 1 à ${MAX_NOM_BALISE} caractères attendu`);
    if (typeof couleur !== "string" || !MOTIF_COULEUR.test(couleur)) return refus("argument_invalide", "couleur : « #rrggbb » attendue");
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const existante = Object.values(op.travail.modele().annotations?.balises ?? {}).find((b) => b.nom === nom);
    if (existante) return rendu(existante.id);
    const r = modifierAnnotations(op.travail.modele(), (a, id) => {
      const k = id("b");
      a.balises[k] = { id: k, nom, couleur: couleur.toLowerCase(), visible: true };
      return k;
    });
    op.travail.appliquer(r);
    return rendu(r.extra);
  };

  /**
   * (1.5) `matieres.creer { nom, couleur?, motif? }` : une matière d'apparence, avec ou sans motif de hachure
   * (`motifs.creer`) ; une matière du même nom est rendue telle quelle. Rend son identifiant.
   */
  const creerMatiere = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const nom = d && typeof d["nom"] === "string" ? d["nom"].trim() : "";
    const couleur = d ? (d["couleur"] ?? COULEUR_MATIERE_DEFAUT) : COULEUR_MATIERE_DEFAUT;
    const motif = d ? (d["motif"] ?? null) : null;
    if (nom.length === 0 || nom.length > MAX_NOM_MATIERE) return refus("argument_invalide", `nom : texte de 1 à ${MAX_NOM_MATIERE} caractères attendu`);
    if (typeof couleur !== "string" || !MOTIF_COULEUR.test(couleur)) return refus("argument_invalide", "couleur : « #rrggbb » attendue");
    if (motif !== null && typeof motif !== "string") return refus("argument_invalide", "motif : identifiant de motif, ou absent");
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const an = op.travail.modele().annotations;
    if (motif !== null && !an?.motifs?.[motif]) return refus("objet_introuvable", motif);
    const existante = Object.values(an?.materiaux ?? {}).find((x) => x.nom === nom);
    if (existante) return rendu(existante.id);
    const r = modifierAnnotations(op.travail.modele(), (a, id) => {
      const k = id("m");
      a.materiaux[k] = { id: k, nom, couleur: couleur.toLowerCase(), ...(motif !== null ? { motif } : {}) };
      return k;
    });
    op.travail.appliquer(r);
    return rendu(r.extra);
  };

  /**
   * (1.5) `motifs.creer { nom, familles, fichier? }` : un motif de hachure (familles de lignes du .pat : angle en degrés,
   * origine, décalage et tirets en mm papier). `fichier` : nom du fichier d'où il vient, sinon « saisi ». Un motif du même
   * nom est rendu tel quel. Rend son identifiant.
   */
  const creerMotif = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const nom = d && typeof d["nom"] === "string" ? d["nom"].trim() : "";
    const fichier = d ? d["fichier"] : undefined;
    if (nom.length === 0 || nom.length > NOM_MOTIF_MAX) return refus("argument_invalide", `nom : texte de 1 à ${NOM_MOTIF_MAX} caractères attendu`);
    if (fichier !== undefined && (typeof fichier !== "string" || fichier.length === 0 || fichier.length > 200)) return refus("argument_invalide", "fichier : nom de 1 à 200 caractères");
    const source = typeof fichier === "string" ? ({ genre: "pat", fichier } as const) : ({ genre: "saisie" } as const);
    const familles = d ? d["familles"] : null;
    if (!estMotif("h0", { id: "h0", nom, familles, source })) return refus("argument_invalide", "familles : 1 à 64 familles { angle, x0, y0, dx, dy (non nul), tirets (32 au plus) } attendues");
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const existant = Object.values(op.travail.modele().annotations?.motifs ?? {}).find((x) => x.nom === nom);
    if (existant) return rendu(existant.id);
    const r = modifierAnnotations(op.travail.modele(), (a, id) => {
      const k = id("h");
      a.motifs[k] = { id: k, nom, familles: (familles as { angle: number; x0: number; y0: number; dx: number; dy: number; tirets: number[] }[]).map((f) => ({ angle: f.angle, x0: f.x0, y0: f.y0, dx: f.dx, dy: f.dy, tirets: [...f.tirets] })), source };
      return k;
    });
    op.travail.appliquer(r);
    return rendu(r.extra);
  };

  const unites = (): UnitesLues => {
    const r = reglagesDe(vue().modele());
    const d = acces.decimales?.();
    return {
      longueur: "m",
      aire: "m²",
      decimales: typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6 ? d : 2,
      separateur: acces.separateur?.() ?? ",",
      pasLongueur: r.accrochageLongueur,
      pasAngle: r.accrochageAngle,
      formatCote: r.formatCote ?? "metres",
    };
  };

  /** (1.3) Balise facultative d'une annotation : identifiant d'une balise existante, ou un message de refus. */
  const baliseAnnotation = (d: Record<string, unknown> | null, m: Modele): { readonly balise?: Id } | string => {
    const b = d?.["balise"];
    if (b === undefined || b === null) return {};
    if (typeof b !== "string" || !m.annotations?.balises[b]) return "balise : identifiant d'une balise existante attendu";
    return { balise: b };
  };

  /**
   * (1.3) `cotes.creer { a, b, position, direction?, balise? }` : une cote linéaire entre deux points du monde, sa ligne passant
   * par `position` ; rend son identifiant. La cote n'est pas associée aux sommets : elle garde la valeur mesurée.
   */
  const creerCote = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const a = d?.["a"], b = d?.["b"], position = d?.["position"];
    const direction = d?.["direction"] ?? "alignee";
    if (!estPoint(a) || !estPoint(b) || !estPoint(position)) return refus("argument_invalide", "a, b et position : points [x, y, z] attendus");
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-9) return refus("argument_invalide", "a et b confondus");
    if (typeof direction !== "string" || !(DIRECTIONS_COTE as readonly string[]).includes(direction)) return refus("argument_invalide", `direction : ${DIRECTIONS_COTE.join(", ")}`);
    const balise = baliseAnnotation(d, vue().modele());
    if (typeof balise === "string") return refus("argument_invalide", balise);
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const r = modifierAnnotations(op.travail.modele(), (an, id) => {
      const k = id("c");
      const c: Cote = { id: k, genre: "lineaire", a: v3(...a), b: v3(...b), position: v3(...position), ...(direction !== "alignee" ? { direction: direction as DirectionCote } : {}), ...balise };
      an.cotes[k] = c;
      return k;
    });
    op.travail.appliquer(r);
    return rendu(r.extra);
  };

  /** (1.3) `textes.creer { ancre, position, texte, balise? }` : un texte avec repère (ancre, ligne de rappel, texte) ; rend son identifiant. */
  const creerTexte = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const ancre = d?.["ancre"], position = d?.["position"];
    const texte = d && typeof d["texte"] === "string" ? d["texte"].trim() : "";
    if (!estPoint(ancre) || !estPoint(position)) return refus("argument_invalide", "ancre et position : points [x, y, z] attendus");
    if (texte.length === 0 || texte.length > MAX_TEXTE_EXTENSION) return refus("argument_invalide", `texte : 1 à ${MAX_TEXTE_EXTENSION} caractères attendus`);
    const balise = baliseAnnotation(d, vue().modele());
    if (typeof balise === "string") return refus("argument_invalide", balise);
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const r = modifierAnnotations(op.travail.modele(), (an, id) => {
      const k = id("t");
      an.textes[k] = { id: k, genre: "repere", ancre: v3(...ancre), position: v3(...position), texte, ...balise };
      return k;
    });
    op.travail.appliquer(r);
    return rendu(r.extra);
  };

  /** (1.3) `annotations.lire` : les cotes linéaires et les textes avec repère du dessin (coordonnées du monde). */
  const lireAnnotations = (): ReponseService => {
    const a = vue().modele().annotations;
    const p = (v: Vec3) => [v.x, v.y, v.z];
    const cotes = Object.values(a?.cotes ?? {}).flatMap((c) => (c.genre === "lineaire" ? [{ id: c.id, a: p(c.a), b: p(c.b), position: p(c.position), direction: c.direction ?? "alignee" }] : []));
    const textes = Object.values(a?.textes ?? {}).flatMap((x) => (x.genre === "repere" ? [{ id: x.id, ancre: p(x.ancre), position: p(x.position), texte: x.texte }] : []));
    return rendu({ cotes, textes });
  };

  /** (1.3) `annotations.effacer { ids }` : efface des cotes et des textes ; un identifiant inconnu est refusé, rien n'est effacé. */
  const effacerAnnotations = (donnees: unknown): ReponseService => {
    const ids = estObjet(donnees) ? donnees["ids"] : null;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SELECTION_EXTENSION || !ids.every((x): x is string => typeof x === "string")) return refus("argument_invalide", "ids : liste d'identifiants attendue");
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const a = op.travail.modele().annotations;
    const absent = ids.find((id) => !a?.cotes[id] && !a?.textes[id]);
    if (absent !== undefined) return refus("objet_introuvable", absent);
    op.travail.appliquer(
      modifierAnnotations(op.travail.modele(), (an) => {
        for (const id of ids) {
          delete an.cotes[id];
          delete an.textes[id];
        }
      }),
    );
    return rendu();
  };

  /** (1.3) `objets.verrouiller { ids, verrou }` : verrouille ou déverrouille des groupes et composants du contexte. */
  const verrouiller = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const ids = d ? d["ids"] : null;
    const verrou = d ? d["verrou"] : null;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SELECTION_EXTENSION || !ids.every((x): x is string => typeof x === "string")) return refus("argument_invalide", "ids : liste d'identifiants attendue");
    if (typeof verrou !== "boolean") return refus("argument_invalide", "verrou : vrai ou faux attendu");
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const c = contexte(op.travail.modele(), op.dans);
    const absent = ids.find((id) => !c.occurrences[id]);
    if (absent !== undefined) return refus("objet_introuvable", absent);
    op.travail.appliquer(verrouillerOccurrences(op.travail.modele(), [...new Set(ids)], verrou, op.dans !== undefined ? { dans: op.dans } : {}));
    return rendu();
  };
  const formater = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : null;
    const valeur = d ? d["valeur"] : null;
    const genre = d ? (d["genre"] ?? "longueur") : null;
    if (typeof valeur !== "number" || !Number.isFinite(valeur)) return refus("argument_invalide", "valeur : nombre attendu, en mètres ou en mètres carrés");
    if (genre !== "longueur" && genre !== "aire") return refus("argument_invalide", "genre : « longueur » ou « aire »");
    const u = unites();
    // (1.3) Une longueur suit la précision réelle du projet ; une aire garde la forme du Mètre.
    return rendu(genre === "aire" ? formaterAire(valeur, u.separateur) : `${formaterNombre(valeur, u.decimales, u.separateur)} m`);
  };

  const erreurDonnees = (motif: MotifDonnees, detail: string): ReponseService => refus(motif === "introuvable" ? "objet_introuvable" : "argument_invalide", detail);

  /** `donnees.lire` : sur le modèle de travail pendant une opération (l'extension relit ce qu'elle vient d'écrire). */
  const lireDonnees = (donnees: unknown): ReponseService => {
    const cible = estObjet(donnees) ? lireCibleDonnees(donnees["cible"]) : null;
    if (!cible) return refus("argument_invalide", "cible : « projet », un identifiant d'objet ou { composant } attendu");
    const cle = (donnees as Record<string, unknown>)["cle"];
    if (cle !== undefined && !estCleDonnee(cle)) return refus("argument_invalide", `cle : lettres, chiffres, « . », « _ » ou « - », ${BORNES_DONNEES.cle} caractères au plus`);
    const lu = lireDonneesExtension(vue().modele(), fiche.id, cible, operation ? operation.dans : acces.dans());
    if (!lu.ok) return erreurDonnees(lu.motif, lu.detail);
    if (cle === undefined) return rendu(lu.valeur);
    return rendu(Object.prototype.hasOwnProperty.call(lu.valeur, cle) ? lu.valeur[cle] : null);
  };

  /** `donnees.ecrire` et `donnees.effacer` : une modification du dessin, dans l'opération ouverte ou automatique. */
  const changerDonnees = (donnees: unknown, ecrire: boolean): ReponseService => {
    const cible = estObjet(donnees) ? lireCibleDonnees(donnees["cible"]) : null;
    if (!cible) return refus("argument_invalide", "cible : « projet », un identifiant d'objet ou { composant } attendu");
    const d = donnees as Record<string, unknown>;
    const cle = d["cle"];
    if ((ecrire || cle !== undefined) && !estCleDonnee(cle)) return refus("argument_invalide", `cle : lettres, chiffres, « . », « _ » ou « - », ${BORNES_DONNEES.cle} caractères au plus`);
    const valeur = ecrire ? lireValeurDonnee(d["valeur"]) : undefined;
    if (ecrire && !valeur) return refus("argument_invalide", `valeur : des données seulement, ${BORNES_DONNEES.valeur} caractères au plus une fois écrites`);
    const op = operation ?? ouvrir(appel ?? "extension", true);
    const r = changerDonneesExtension(op.travail.modele(), fiche.id, cible, { ...(typeof cle === "string" ? { cle } : {}), ...(valeur ? { valeur } : {}) }, op.dans);
    if (!r.ok) return erreurDonnees(r.motif, r.detail);
    if (r.valeur) {
      try {
        op.travail.appliquer(r.valeur);
      } catch (e) {
        return refus("argument_invalide", (e instanceof Error ? e.message : String(e)).slice(0, 500));
      }
    }
    return rendu();
  };

  /** (1.4) Moteur des opérations planes, ou le refus à rendre. */
  const moteurPlans = () => {
    const plans = acces.booleens?.()?.plans;
    return plans ?? refus("argument_invalide", "moteur des opérations planes indisponible (manifold-3d non chargé)");
  };

  /**
   * (1.4) Solides du modèle entier (ou des objets nommés), chacun à sa place monde : une instance de composant par
   * chemin. Un objet qui n'est pas un solide fermé est descendu s'il contient d'autres objets, sinon écarté avec son
   * motif.
   */
  const solidesDe = (m: Modele, objets: unknown): { solides: { id: Id; chemin: Id[]; balise: Id | null; maillage: Maillage }[]; ecartes: PlansLus["ecartes"]; facesLibres: number } | ReponseService => {
    const solides: { id: Id; chemin: Id[]; balise: Id | null; maillage: Maillage }[] = [];
    const ecartes: { id: Id; chemin: Id[]; motif: string }[] = [];
    let trop = false;
    // La balise d'un objet vaut pour son contenu qui n'a pas la sienne (comme à l'affichage).
    const visiter = (id: Id, M: Matrice4 | null, chemin: Id[], balise: Id | null, profondeur: number): void => {
      if (trop) return;
      if (profondeur > MAX_PROFONDEUR_MONDE) return void ecartes.push({ id, chemin, motif: `imbriqué sur plus de ${MAX_PROFONDEUR_MONDE} niveaux` });
      const motif = motifNonSolide(m, id);
      if (motif === null) {
        try {
          if (solides.length >= BORNES_PLANS.solides) return void (trop = true);
          return void solides.push({ id, chemin, balise, maillage: maillageDuSolide(m, id, M) });
        } catch (e) {
          if (!(e instanceof PasUnSolide)) throw e;
          return void ecartes.push({ id, chemin, motif: e.message });
        }
      }
      const c = contexte(m, id);
      const enfants = Object.values(c.occurrences).filter((o) => !o.masquee);
      if (enfants.length === 0) return void ecartes.push({ id, chemin, motif });
      const faces = Object.values(c.faces).filter((f) => !f.masquee).length;
      if (faces > 0) ecartes.push({ id, chemin, motif: `${faces} face(s) hors de tout solide` });
      for (const o of enfants) visiter(o.id, M ? composer(M, o.transformation) : o.transformation, [...chemin, o.id], o.balise ?? balise, profondeur + 1);
    };
    let facesLibres = 0;
    if (objets === undefined || objets === null) {
      facesLibres = Object.values(m.racine.faces).filter((f) => !f.masquee).length;
      for (const o of Object.values(m.racine.occurrences)) if (!o.masquee) visiter(o.id, o.transformation, [o.id], o.balise ?? null, 1);
    } else {
      if (!Array.isArray(objets) || objets.length === 0 || objets.length > BORNES_PLANS.solides || !objets.every((x) => typeof x === "string")) return refus("argument_invalide", `objets : liste de 1 à ${BORNES_PLANS.solides} identifiants`);
      for (const id of objets as string[]) {
        // Chaque instance de l'objet (un composant placé deux fois donne deux chemins), avec ses ancêtres.
        const chemins = cheminsVers(m, id);
        if (chemins.length === 0) return refus("objet_introuvable", id);
        for (const c of chemins) visiter(id, c.M, c.chemin, c.balise, c.chemin.length);
        if (trop) break;
      }
    }
    if (trop) return refus("argument_invalide", `plus de ${BORNES_PLANS.solides} solides`);
    return { solides, ecartes, facesLibres };
  };

  /** (1.4) `geometrie.coupe` (hauteur donnée) et `geometrie.projection` (hauteur absente). */
  const plansDesSolides = (donnees: unknown, coupe: boolean): ReponseService => {
    const d = estObjet(donnees) ? donnees : {};
    const h = d["hauteur"];
    if (coupe && (typeof h !== "number" || !Number.isFinite(h) || Math.abs(h) > BORNES_PLANS.hauteur)) return refus("argument_invalide", `hauteur : nombre de −${BORNES_PLANS.hauteur} à ${BORNES_PLANS.hauteur} m attendu`);
    const plans = moteurPlans();
    if ("ok" in plans) return plans;
    const sans = d["sansBalises"];
    if (sans !== undefined && (!Array.isArray(sans) || sans.length > 200 || !sans.every((b) => typeof b === "string"))) return refus("argument_invalide", "sansBalises : liste d'identifiants de balises");
    const lu0 = solidesDe(vue().modele(), d["objets"]);
    if ("ok" in lu0) return lu0;
    // Solides dont la balise est écartée : ni comptés ni rendus (l'union reste sans double compte).
    const ecarter = new Set((sans ?? []) as string[]);
    const lu = { ...lu0, solides: lu0.solides.filter((x) => x.balise === null || !ecarter.has(x.balise)) };
    const calcul = (ms: readonly Maillage[]) => (coupe ? plans.coupe(ms, h as number) : plans.projection(ms)).map(polygoneLu);
    try {
      const polygones = lu.solides.length ? calcul(lu.solides.map((x) => x.maillage)) : [];
      const resultat: PlansLus = {
        polygones,
        aire: airePolygones(polygones),
        solides: lu.solides.map((x) => ({ id: x.id, chemin: x.chemin, balise: x.balise, aire: airePolygones(calcul([x.maillage])) })),
        ecartes: lu.ecartes,
        facesLibres: lu.facesLibres,
      };
      return rendu(resultat);
    } catch (e) {
      return refus("argument_invalide", (e instanceof Error ? e.message : String(e)).slice(0, 500));
    }
  };

  /** (1.6) `site.lire` : l'Emplacement saisi (Info planche), tel quel ; `null` s'il ne l'est pas. Rien n'est deviné. */
  const lireSite = (): ReponseService => {
    const e = reglagesDe(vue().modele()).emplacement;
    return rendu({ emplacement: e ? { latitude: e.latitude, longitude: e.longitude, altitude: e.altitude ?? null, lieu: e.lieu ?? null, nord: e.nord } : null });
  };

  /**
   * (1.6) `geometrie.rayon { rayons, distanceMax?, objets? }` : premier impact de chaque rayon contre les faces visibles du
   * modèle (coordonnées du modèle ; une balise masquée ou verrouillée n'est pas visée, comme à la souris). `objets` limite
   * aux faces contenues dans ces groupes ou composants. Les deux faces d'une paroi comptent : la plus proche gagne.
   */
  const lancerRayons = (donnees: unknown): ReponseService => {
    const d = estObjet(donnees) ? donnees : {};
    const rs = d["rayons"];
    if (!Array.isArray(rs) || rs.length === 0 || rs.length > MAX_RAYONS_APPEL) return refus("argument_invalide", `rayons : liste de 1 à ${MAX_RAYONS_APPEL} rayons { origine, direction } attendue`);
    const lus: { origine: Vec3; direction: Vec3 }[] = [];
    for (const [i, r] of rs.entries()) {
      if (!estObjet(r) || !estPoint(r["origine"]) || !estPoint(r["direction"]) || Math.hypot(...(r["direction"] as number[])) < 1e-12) return refus("argument_invalide", `rayon ${i + 1} : origine [x, y, z] et direction non nulle attendues`);
      const n = Math.hypot(...(r["direction"] as number[]));
      const [x, y, z] = r["direction"] as [number, number, number];
      lus.push({ origine: versVec(r["origine"] as [number, number, number]), direction: v3(x / n, y / n, z / n) });
    }
    const max = d["distanceMax"];
    if (max !== undefined && !(typeof max === "number" && Number.isFinite(max) && max > 0)) return refus("argument_invalide", "distanceMax : nombre positif attendu, en mètres");
    const objets = d["objets"];
    if (objets !== undefined && !(Array.isArray(objets) && objets.length <= MAX_SELECTION_EXTENSION && objets.every((x): x is string => typeof x === "string"))) return refus("argument_invalide", "objets : liste d'identifiants attendue");
    const f = vue();
    const absent = (objets ?? []).find((id) => !f.existe(id));
    if (absent !== undefined) return refus("objet_introuvable", absent);
    const filtre = objets && objets.length > 0 ? new Set(objets) : null;
    const faces = scene(f.modele()).filter((el): el is Extract<typeof el, { genre: "face" }> => el.genre === "face" && (!filtre || el.chemin.some((c) => filtre.has(c))));
    const impacts = lus.map((r) => {
      let mieux: { t: number; el: (typeof faces)[number] } | null = null;
      for (const el of faces) {
        const t = rayonFace(r, el);
        if (t !== null && (max === undefined || t <= max) && (!mieux || t < mieux.t)) mieux = { t, el };
      }
      if (!mieux) return null;
      const p = { x: r.origine.x + r.direction.x * mieux.t, y: r.origine.y + r.direction.y * mieux.t, z: r.origine.z + r.direction.z * mieux.t };
      const n = mieux.el.normale;
      return { point: [p.x, p.y, p.z], distance: mieux.t, face: mieux.el.id, chemin: [...mieux.el.chemin], normale: [n.x, n.y, n.z] };
    });
    return rendu({ impacts });
  };

  /** (1.4) `geometrie.union` : union de polygones donnés par l'extension. */
  const unionPlans = (donnees: unknown): ReponseService => {
    const lu = lirePolygonesPlan(estObjet(donnees) ? donnees["polygones"] : null);
    if (typeof lu === "string") return refus("argument_invalide", lu);
    const plans = moteurPlans();
    if ("ok" in plans) return plans;
    try {
      const polygones = plans.union(lu).map(polygoneLu);
      return rendu({ polygones, aire: airePolygones(polygones) });
    } catch (e) {
      return refus("argument_invalide", (e instanceof Error ? e.message : String(e)).slice(0, 500));
    }
  };

  return {
    debutAppel: (nom, options = {}) => {
      appel = nom;
      optionsAppel = options;
    },
    finAppel: (reussi) => {
      appel = null;
      try {
        if (!operation) return true;
        if (!reussi) {
          operation = null;
          return true;
        }
        return operation.automatique ? valider().ok : true;
      } finally {
        optionsAppel = {};
      }
    },
    servir: (nom, donnees) => {
      const jugement = jugerDemandeExtension(fiche, nom);
      if (!jugement.ok) return refus(jugement.erreur, jugement.detail);
      switch (nom) {
        case "modele.lire":
          return lire(donnees);
        case "modele.modifier":
          return modifier(donnees);
        case "operation.ouvrir": {
          if (operation) return refus("operation_deja_ouverte", operation.nom);
          const n = estObjet(donnees) ? donnees["nom"] : null;
          if (typeof n !== "string" || n.trim().length === 0 || n.length > MAX_NOM_OPERATION) return refus("argument_invalide", `nom : texte de 1 à ${MAX_NOM_OPERATION} caractères attendu`);
          ouvrir(n.trim(), false);
          return rendu();
        }
        case "operation.valider":
          return valider();
        case "operation.abandonner":
          if (!operation) return refus("operation_absente");
          operation = null;
          return rendu();
        case "selection.lire": {
          const f = vue();
          // Pendant une opération, l'extension relit la sélection qu'elle vient de demander (même vide).
          return rendu((operation?.selection ?? acces.selection()).filter((id) => f.existe(id)));
        }
        case "selection.definir":
          return definirSelection(donnees);
        case "matieres.lire":
          return rendu(Object.values(vue().modele().annotations?.materiaux ?? {}).map((x) => ({ id: x.id, nom: x.nom, couleur: x.couleur, motif: x.motif ?? null })));
        case "matieres.creer":
          return creerMatiere(donnees);
        case "motifs.lire":
          return rendu(Object.values(vue().modele().annotations?.motifs ?? {}).map((x) => ({ id: x.id, nom: x.nom, familles: x.familles })));
        case "motifs.creer":
          return creerMotif(donnees);
        case "matieres.appliquer":
          return appliquerAttribut(donnees, "matiere");
        case "balises.lire":
          return rendu(Object.values(vue().modele().annotations?.balises ?? {}).map((x) => ({ id: x.id, nom: x.nom, couleur: x.couleur, visible: x.visible })));
        case "balises.appliquer":
          return appliquerAttribut(donnees, "balise");
        case "balises.creer":
          return creerBalise(donnees);
        case "cotes.creer":
          return creerCote(donnees);
        case "textes.creer":
          return creerTexte(donnees);
        case "objets.verrouiller":
          return verrouiller(donnees);
        case "annotations.lire":
          return lireAnnotations();
        case "annotations.effacer":
          return effacerAnnotations(donnees);
        case "unites.lire":
          return rendu(unites());
        case "unites.formater":
          return formater(donnees);
        case "donnees.lire":
          return lireDonnees(donnees);
        case "donnees.ecrire":
          return changerDonnees(donnees, true);
        case "donnees.effacer":
          return changerDonnees(donnees, false);
        case "geometrie.coupe":
          return plansDesSolides(donnees, true);
        case "geometrie.projection":
          return plansDesSolides(donnees, false);
        case "geometrie.union":
          return unionPlans(donnees);
        case "site.lire":
          return lireSite();
        case "geometrie.rayon":
          return lancerRayons(donnees);
        case "niveaux.lire": {
          const ref = acces.referenceNGF?.() ?? null;
          return rendu({
            niveaux: niveauxTries(vue().modele()).map((n) => ({ id: n.id, nom: n.nom, altitude: n.altitude, hauteur: n.hauteur })),
            referenceNGF: typeof ref === "number" && Number.isFinite(ref) ? ref : null,
          });
        }
        default:
          return refus("demande_inconnue", nom);
      }
    },
    abandonner: () => {
      operation = null;
    },
    operationOuverte: () => operation !== null,
  };
}
