/**
 * Cas 2 du catalogue, lot 8 — composants d'agence (n° 32, 61, 79, 25, 88). Pur : ni React, ni DOM.
 *
 * Un composant d'agence est un **fichier** `fadi-composant/1` (JSON) que l'agence importe ; il est archivé tel quel en
 * base pour le compte (`sandbox_fichiers_extensions`, identifiant réservé `planche-composant` du cœur) et gardé avec la
 * définition qu'il produit (`composantAgence.texte`). Fadi ne fournit aucune valeur : sections du cadre, hauteur de
 * garde-corps, barreau et lisse viennent du fichier ; largeur, hauteur, allège, vantaux, longueur et vide maximal entre
 * barreaux viennent de la saisie ou de la baie visée. Aucun vide réglementaire n'est proposé.
 *
 * ```json
 * { "format": "fadi-composant/1", "source": "…", "nom": "Fenêtre bois", "genre": "fenetre",
 *   "cadre": { "largeur": 0.06, "profondeur": 0.07 }, "vantaux": 2 }
 * { "format": "fadi-composant/1", "source": "…", "nom": "Porte palière", "genre": "porte", "main": "gauche",
 *   "cadre": { "largeur": 0.05, "profondeur": 0.08 }, "vantaux": 1 }
 * { "format": "fadi-composant/1", "source": "…", "nom": "Garde-corps acier", "genre": "garde-corps",
 *   "garde-corps": { "hauteur": 1.0, "barreau": 0.02, "lisse": 0.04 } }
 * ```
 *
 * Repère local d'une menuiserie : x le long de la largeur, z vers le haut, y vers l'extérieur de la face d'appui (le cadre
 * occupe y ∈ [−profondeur, 0], dans l'épaisseur du mur). Le contour de l'ouverture est le rectangle [0, L] × [0, H] à
 * y = 0. Une ouverture découpée (n° 25) est notée sur l'occurrence et suit celle-ci : `suivreOuvertures` rebouche
 * l'ancien trou et perce le nouveau après chaque opération.
 */
import {
  type ComposantAgenceDefinition,
  type Definition,
  type FacesPolygonales,
  type Id,
  type Matrice4,
  type Modele,
  type Occurrence,
  ajouterSegments,
  appliquer,
  boucherTrou,
  composer,
  contexte,
  creerGroupeDepuisFaces,
  effacerEntites,
  inverserMatrice,
  matriceMonde,
  nombreOccurrences,
  positionsFace,
  translation,
  transformerNormale,
} from "./geometrie-libre.js";
import { type Vec3, cross, dist, dot, normalize, v3 } from "./vecteur.js";

export const FORMAT_COMPOSANT = "fadi-composant/1";
export const GENRES_COMPOSANT = ["fenetre", "porte", "baie", "garde-corps"] as const;
export type GenreComposant = (typeof GENRES_COMPOSANT)[number];

export interface FichierComposant {
  readonly format: typeof FORMAT_COMPOSANT;
  readonly source: string;
  readonly nom: string;
  readonly genre: GenreComposant;
  readonly main?: "gauche" | "droite";
  readonly cadre?: { readonly largeur: number; readonly profondeur: number };
  readonly vantaux?: number;
  readonly "garde-corps"?: { readonly hauteur: number; readonly barreau: number; readonly lisse: number };
}

export const MESSAGES_COMPOSANT = {
  json: "Le fichier n'est pas du JSON lisible.",
  format: "Format attendu : « fadi-composant/1 ».",
  source: "Le fichier doit citer sa source.",
  nom: "Le fichier doit nommer le composant.",
  genre: "Genre attendu : fenetre, porte, baie ou garde-corps.",
  cadre: "Une menuiserie déclare la section de son cadre (largeur et profondeur positives, en mètres).",
  "garde-corps": "Un garde-corps déclare sa hauteur, son barreau et sa lisse (positifs, en mètres).",
  main: "Main attendue : gauche ou droite.",
  vantaux: "Le nombre de vantaux est un entier de 1 à 12.",
  valeur: "Saisissez « {nom} » (nombre positif, en mètres).",
  "face-non-verticale": "Visez une face verticale (un mur, une baie).",
  "face-inconnue": "Choisissez la face d'appui (la baie ou le mur).",
  "arete-garde-corps": "Pour un garde-corps, cliquez ses deux extrémités dans la vue, ou choisissez l'arête horizontale qui le porte.",
  "trop-petit": "La baie est plus petite que deux fois le cadre : le composant ne tient pas.",
  "hors-face": "L'ouverture ne tient pas dans la face d'appui : rien n'a été découpé.",
  "pas-composant": "Choisissez un composant posé depuis un fichier d'agence.",
  "aucun-remplace": "Aucune occurrence remplacée (sélection vide ou verrouillée).",
} as const;
export type CleComposant = keyof typeof MESSAGES_COMPOSANT;
export class ErreurComposant extends Error {
  constructor(
    readonly cle: CleComposant,
    readonly args: Readonly<Record<string, string>> = {},
  ) {
    super(Object.entries(args).reduce<string>((t, [k, v]) => t.replace(`{${k}}`, v), MESSAGES_COMPOSANT[cle]));
  }
}

const positif = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Lit un fichier de composant ; refuse tout ce qui manque (aucune valeur par défaut). */
export function lireFichierComposant(texte: string): { readonly ok: true; readonly fichier: FichierComposant } | { readonly ok: false; readonly erreur: CleComposant } {
  let j: unknown;
  try {
    j = JSON.parse(texte);
  } catch {
    return { ok: false, erreur: "json" };
  }
  const o = j as Record<string, unknown>;
  if (!o || typeof o !== "object" || o["format"] !== FORMAT_COMPOSANT) return { ok: false, erreur: "format" };
  if (typeof o["source"] !== "string" || !o["source"].trim()) return { ok: false, erreur: "source" };
  if (typeof o["nom"] !== "string" || !o["nom"].trim()) return { ok: false, erreur: "nom" };
  const genre = o["genre"];
  if (typeof genre !== "string" || !(GENRES_COMPOSANT as readonly string[]).includes(genre)) return { ok: false, erreur: "genre" };
  if (o["main"] !== undefined && o["main"] !== "gauche" && o["main"] !== "droite") return { ok: false, erreur: "main" };
  if (o["vantaux"] !== undefined && !(Number.isInteger(o["vantaux"]) && (o["vantaux"] as number) >= 1 && (o["vantaux"] as number) <= 12)) return { ok: false, erreur: "vantaux" };
  if (genre === "garde-corps") {
    const g = o["garde-corps"] as Record<string, unknown> | undefined;
    if (!g || !positif(g["hauteur"]) || !positif(g["barreau"]) || !positif(g["lisse"]) || (g["lisse"] as number) >= (g["hauteur"] as number)) return { ok: false, erreur: "garde-corps" };
  } else {
    const c = o["cadre"] as Record<string, unknown> | undefined;
    if (!c || !positif(c["largeur"]) || !positif(c["profondeur"])) return { ok: false, erreur: "cadre" };
  }
  return { ok: true, fichier: o as unknown as FichierComposant };
}

/** Valeurs demandées à la pose, par genre (libellés à l'interface) ; la baie visée en donne une partie. */
export const VALEURS_COMPOSANT: Readonly<Record<GenreComposant, readonly string[]>> = {
  fenetre: ["largeur", "hauteur", "allege", "vantaux"],
  porte: ["largeur", "hauteur", "vantaux"],
  baie: ["largeur", "hauteur", "allege"],
  "garde-corps": ["longueur", "vide"],
};

/**
 * Nombre de barreaux d'un garde-corps (n° 61) : barreaux de section `barreau` répartis de bout en bout de la longueur,
 * le moins possible tel que le vide entre deux barreaux ne dépasse pas `vide` (saisi par l'utilisateur).
 */
export function nombreBarreaux(longueur: number, barreau: number, vide: number): { readonly nombre: number; readonly vide: number } {
  if (!positif(longueur) || !positif(barreau) || !positif(vide) || barreau >= longueur) throw new ErreurComposant("valeur", { nom: "vide" });
  const n = Math.max(2, Math.ceil((longueur + vide) / (barreau + vide) - 1e-9));
  return { nombre: n, vide: (longueur - n * barreau) / (n - 1) };
}

/** Faces d'une boîte alignée (sens direct vers l'extérieur). */
function boite(a: Vec3, b: Vec3): Vec3[][][] {
  const [x0, x1, y0, y1, z0, z1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), Math.min(a.z, b.z), Math.max(a.z, b.z)];
  const p = (x: number, y: number, z: number) => v3(x, y, z);
  return [
    [[p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)]],
    [[p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)]],
    [[p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)]],
    [[p(x1, y1, z0), p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1)]],
    [[p(x0, y1, z0), p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1)]],
    [[p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)]],
  ];
}

const exiger = (v: Readonly<Record<string, number>>, nom: string, entier = false): number => {
  const x = v[nom];
  if (!positif(x) || (entier && !Number.isInteger(x))) throw new ErreurComposant("valeur", { nom });
  return x;
};

/** Faces locales du composant pour ces valeurs (n° 32, 61). */
export function facesComposant(f: FichierComposant, valeurs: Readonly<Record<string, number>>): FacesPolygonales {
  if (f.genre === "garde-corps") {
    const g = f["garde-corps"]!;
    const L = exiger(valeurs, "longueur");
    const { nombre } = nombreBarreaux(L, g.barreau, exiger(valeurs, "vide"));
    const faces: Vec3[][][] = [...boite(v3(0, -g.lisse, g.hauteur - g.lisse), v3(L, 0, g.hauteur))];
    const pas = (L - g.barreau) / (nombre - 1);
    const y0 = -(g.lisse + g.barreau) / 2;
    for (let i = 0; i < nombre; i++) faces.push(...boite(v3(i * pas, y0, 0), v3(i * pas + g.barreau, y0 + g.barreau, g.hauteur - g.lisse)));
    return faces;
  }
  const L = exiger(valeurs, "largeur");
  const H = exiger(valeurs, "hauteur");
  const s = f.cadre!.largeur;
  const p = f.cadre!.profondeur;
  if (L <= 2 * s || H <= 2 * s) throw new ErreurComposant("trop-petit");
  const bas = f.genre === "porte" ? 0 : s;
  const faces: Vec3[][][] = [
    ...boite(v3(0, -p, 0), v3(s, 0, H)),
    ...boite(v3(L - s, -p, 0), v3(L, 0, H)),
    ...boite(v3(s, -p, H - s), v3(L - s, 0, H)),
    ...(f.genre === "porte" ? [] : boite(v3(s, -p, 0), v3(L - s, 0, s))),
  ];
  if (f.genre === "baie") return faces;
  const k = exiger(valeurs, "vantaux", true);
  const largeurVantail = (L - 2 * s - (k - 1) * s) / k;
  if (largeurVantail <= 0) throw new ErreurComposant("trop-petit");
  const ym = -p / 2;
  for (let i = 0; i < k; i++) {
    const x0 = s + i * (largeurVantail + s);
    if (i > 0) faces.push(...boite(v3(x0 - s, -p, bas), v3(x0, 0, H - s)));
    // Vantail : une face (vitrage ou panneau), sans épaisseur inventée.
    faces.push([[v3(x0, ym, bas), v3(x0 + largeurVantail, ym, bas), v3(x0 + largeurVantail, ym, H - s), v3(x0, ym, H - s)]]);
  }
  return faces;
}

/** Contour local de l'ouverture d'une menuiserie (rectangle à y = 0) ; `null` pour un garde-corps. */
export function contourLocal(c: ComposantAgenceDefinition): Vec3[] | null {
  if (c.genre === "garde-corps") return null;
  const L = c.valeurs["largeur"], H = c.valeurs["hauteur"];
  if (!positif(L) || !positif(H)) return null;
  return [v3(0, 0, 0), v3(L, 0, 0), v3(L, 0, H), v3(0, 0, H)];
}

/** Crée la définition (composant) des faces locales, sans occurrence ; métadonnées du composant d'agence. */
function creerDefinition(m: Modele, f: FichierComposant, meta: ComposantAgenceDefinition): { modele: Modele; definition: Id } {
  const r = creerGroupeDepuisFaces(m, facesComposant(f, meta.valeurs), { genre: "composant", nom: f.nom });
  const { [r.occurrence]: _o, ...reste } = r.modele.racine.occurrences;
  const def = r.modele.definitions[r.definition] as Definition;
  return {
    modele: { ...r.modele, racine: { ...r.modele.racine, occurrences: reste }, definitions: { ...r.modele.definitions, [r.definition]: { ...def, composantAgence: meta, ...(f.genre !== "garde-corps" ? { decouperOuverture: true } : {}) } } },
    definition: r.definition,
  };
}

/** Matrice locale → monde d'une menuiserie : x le long de la face, y vers l'extérieur (normale), z vertical. */
const repere = (u: Vec3, n: Vec3, z: Vec3, o: Vec3): Matrice4 => [u.x, n.x, z.x, o.x, u.y, n.y, z.y, o.y, u.z, n.z, z.z, o.z, 0, 0, 0, 1];

export interface Pose {
  readonly fichier: FichierComposant;
  readonly texte: string;
  readonly nomFichier: string;
  readonly archive?: string;
  /** Valeurs saisies (mètres ; vantaux entier) ; la baie visée donne largeur et hauteur. */
  readonly valeurs: Readonly<Record<string, number>>;
  /** Découper l'ouverture dans la face d'appui (n° 25). */
  readonly decouper: boolean;
}

export interface ResultatPose {
  readonly modele: Modele;
  readonly occurrence: Id;
  readonly baie: "trou" | "face" | "saisie" | "arete";
  readonly valeurs: Readonly<Record<string, number>>;
}

function egal(a: readonly Vec3[], b: readonly Vec3[]): boolean {
  return a.length === b.length && a.every((p) => b.some((q) => dist(p, q) <= 1e-5));
}

/** Perce `contour` (positions dans le contexte `dans`) dans la face qui le contient ; `null` si impossible. */
export function percer(m: Modele, contour: readonly Vec3[], dans: Id | undefined): Modele | null {
  const o = dans !== undefined ? { dans } : {};
  let r;
  try {
    r = ajouterSegments(m, contour.map((p, i) => [p, contour[(i + 1) % contour.length]!] as const), o);
  } catch {
    return null;
  }
  const c = contexte(r.modele, dans);
  const interieure = Object.values(c.faces).find((f) => f.trous.length === 0 && egal(f.exterieur.map((s) => c.sommets[s]!.position), contour));
  const englobe = interieure && Object.values(c.faces).some((f) => f.id !== interieure.id && f.trous.some((b) => egal(b.map((s) => c.sommets[s]!.position), contour)));
  if (!interieure || !englobe) return null;
  return effacerEntites(r.modele, [interieure.id], o).modele;
}

/** Genre de baie qu'offre une face : un trou, une face dessinée dans une autre, ou un mur plein (baie à placer). */
export function genreBaie(m: Modele, face: Id, dans?: Id): "trou" | "face" | "saisie" | null {
  const c = contexte(m, dans);
  const f = c.faces[face];
  if (!f) return null;
  if (f.trous.length > 0) return "trou";
  const contour = f.exterieur.map((s) => c.sommets[s]!.position);
  return Object.values(c.faces).some((g) => g.id !== f.id && g.trous.some((t) => egal(t.map((s) => c.sommets[s]!.position), contour))) ? "face" : "saisie";
}

/** Pose le composant dans la baie visée (n° 79) : trou, face dessinée (découpée si demandé) ou face de mur (saisie). */
export function poserComposant(m: Modele, pose: Pose, cible: { readonly face?: Id; readonly arete?: Id; readonly dans?: Id; readonly point?: Vec3; readonly segment?: { readonly a: Vec3; readonly b: Vec3 } }): ResultatPose {
  const f = pose.fichier;
  const M = cible.dans !== undefined ? matriceMonde(m, cible.dans) : null;
  const monde = (p: Vec3): Vec3 => (M ? appliquer(M, p) : p);
  const c = contexte(m, cible.dans);
  const meta0 = { fichier: pose.nomFichier, ...(pose.archive ? { archive: pose.archive } : {}), genre: f.genre, ...(f.main ? { main: f.main } : {}), texte: pose.texte };
  if (f.genre === "garde-corps") {
    // Deux points pointés dans la vue (le second donne la direction ; le premier fixe la hauteur), ou une arête choisie.
    const a = cible.arete ? c.aretes[cible.arete] : undefined;
    const A = cible.segment ? cible.segment.a : a ? monde(c.sommets[a.a]!.position) : null;
    const B = cible.segment ? v3(cible.segment.b.x, cible.segment.b.y, cible.segment.a.z) : a ? monde(c.sommets[a.b]!.position) : null;
    if (!A || !B || Math.abs(A.z - B.z) > 1e-6 || Math.hypot(B.x - A.x, B.y - A.y) <= 1e-9) throw new ErreurComposant("arete-garde-corps");
    const longueur = pose.valeurs["longueur"] ?? dist(A, B);
    const valeurs = { ...pose.valeurs, longueur };
    const d = creerDefinition(m, f, { ...meta0, valeurs });
    const u = normalize(v3(B.x - A.x, B.y - A.y, 0));
    const z = v3(0, 0, 1);
    const n = cross(z, u);
    return placer(d.modele, d.definition, repere(u, n, z, A), null, "arete", valeurs);
  }
  const face = cible.face ? c.faces[cible.face] : undefined;
  if (!face) throw new ErreurComposant("face-inconnue");
  const n = normalize(M ? transformerNormale(M, face.normale) : face.normale);
  if (Math.abs(n.z) > 1e-6) throw new ErreurComposant("face-non-verticale");
  const z = v3(0, 0, 1);
  const u = normalize(cross(n, z));
  const positions = positionsFace(c, face);
  const ext = positions.exterieur.map(monde);
  const bornes = (pts: readonly Vec3[]) => ({ u0: Math.min(...pts.map((p) => dot(p, u))), u1: Math.max(...pts.map((p) => dot(p, u))), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) });
  const origine = (b: { u0: number; z0: number }): Vec3 => {
    const p0 = ext[0]!;
    const du = b.u0 - dot(p0, u);
    return v3(p0.x + u.x * du, p0.y + u.y * du, b.z0);
  };
  let fb = bornes(ext);
  let baie: ResultatPose["baie"];
  let b: { u0: number; u1: number; z0: number; z1: number };
  let percee: readonly Vec3[] | null = null;
  let modele = m;
  if (positions.trous.length > 0) {
    baie = "trou";
    b = bornes(positions.trous[0]!.map(monde));
  } else {
    const contour = face.exterieur.map((s) => c.sommets[s]!.position);
    const hote = Object.values(c.faces).find((g) => g.id !== face.id && g.trous.some((t) => egal(t.map((s) => c.sommets[s]!.position), contour)));
    if (hote) {
      baie = "face";
      b = fb;
      fb = bornes(positionsFace(c, hote).exterieur.map(monde));
      if (pose.decouper) {
        modele = effacerEntites(m, [face.id], cible.dans !== undefined ? { dans: cible.dans } : {}).modele;
        percee = contour;
      }
    } else {
      baie = "saisie";
      const L = exiger(pose.valeurs, "largeur");
      const H = exiger(pose.valeurs, "hauteur");
      const allege = f.genre === "porte" ? 0 : (pose.valeurs["allege"] ?? NaN);
      if (f.genre !== "porte" && !(Number.isFinite(allege) && allege >= 0)) throw new ErreurComposant("valeur", { nom: "allege" });
      // Le point cliqué sur le mur donne le milieu de la largeur ; sans point, la baie est centrée sur la face.
      const centre = cible.point ? dot(cible.point, u) : (fb.u0 + fb.u1) / 2;
      b = { u0: centre - L / 2, u1: centre + L / 2, z0: fb.z0 + allege, z1: fb.z0 + allege + H };
    }
  }
  // Baie saisie : les valeurs tapées sont gardées telles quelles ; sinon, elles sont reprises de la baie visée.
  const valeurs: Record<string, number> = baie === "saisie" ? { ...pose.valeurs } : { ...pose.valeurs, largeur: b.u1 - b.u0, hauteur: b.z1 - b.z0 };
  if (f.genre !== "porte" && baie !== "saisie") valeurs["allege"] = b.z0 - fb.z0;
  if (f.genre !== "baie" && valeurs["vantaux"] === undefined && f.vantaux !== undefined) valeurs["vantaux"] = f.vantaux;
  const d = creerDefinition(modele, f, { ...meta0, valeurs });
  const T = repere(u, n, z, origine(b));
  const r = placer(d.modele, d.definition, T, null, baie, valeurs);
  if (percee) return { ...r, modele: noterOuverture(r.modele, r.occurrence, { ...(cible.dans !== undefined ? { dans: cible.dans } : {}), contour: percee }) };
  if (baie === "saisie" && pose.decouper) {
    const contour = enContexte(r.modele, r.occurrence, cible.dans);
    const p = contour ? percer(r.modele, contour, cible.dans) : null;
    if (!p) throw new ErreurComposant("hors-face");
    return { ...r, modele: noterOuverture(p, r.occurrence, { ...(cible.dans !== undefined ? { dans: cible.dans } : {}), contour: contour! }) };
  }
  return r;
}

function placer(m: Modele, definition: Id, T: Matrice4, _o: null, baie: ResultatPose["baie"], valeurs: Readonly<Record<string, number>>): ResultatPose {
  const id = `o${m.prochainId}`;
  const occ: Occurrence = { id, definition, transformation: T };
  return { modele: { ...m, prochainId: m.prochainId + 1, racine: { ...m.racine, occurrences: { ...m.racine.occurrences, [id]: occ } } }, occurrence: id, baie, valeurs };
}

function noterOuverture(m: Modele, occ: Id, ouverture: Occurrence["ouverture"]): Modele {
  const o = m.racine.occurrences[occ];
  if (!o) return m;
  const { ouverture: _a, ...reste } = o;
  return { ...m, racine: { ...m.racine, occurrences: { ...m.racine.occurrences, [occ]: ouverture ? { ...reste, ouverture } : reste } } };
}

/** Contour de l'ouverture de l'occurrence, dans le contexte `dans` (positions locales de la face d'appui). */
function enContexte(m: Modele, occ: Id, dans: Id | undefined): Vec3[] | null {
  const o = m.racine.occurrences[occ];
  const d = o ? m.definitions[o.definition] : undefined;
  const c = d?.composantAgence ? contourLocal(d.composantAgence) : null;
  if (!o || !c) return null;
  const H = dans !== undefined ? matriceMonde(m, dans) : null;
  const inv = H ? inverserMatrice(H) : null;
  if (H && !inv) return null;
  return c.map((p) => {
    const w = appliquer(o.transformation, p);
    return inv ? appliquer(inv, w) : w;
  });
}

/** Composant d'agence de l'occurrence (fichier relu depuis la définition), sinon `null`. */
export function composantDe(m: Modele, occ: Id): { readonly meta: ComposantAgenceDefinition; readonly fichier: FichierComposant } | null {
  const o = m.racine.occurrences[occ];
  const meta = o ? m.definitions[o.definition]?.composantAgence : undefined;
  if (!meta) return null;
  const l = lireFichierComposant(meta.texte);
  return l.ok ? { meta, fichier: l.fichier } : null;
}

/** Retire les définitions de composants d'agence qui n'ont plus d'occurrence. */
function purger(m: Modele): Modele {
  const inutiles = Object.values(m.definitions).filter((d) => d.composantAgence && nombreOccurrences(m, d.id) === 0).map((d) => d.id);
  if (!inutiles.length) return m;
  const defs = { ...m.definitions };
  for (const id of inutiles) delete defs[id];
  return { ...m, definitions: defs };
}

/**
 * Régénère le composant avec de nouvelles valeurs (n° 32 : largeur, hauteur, allège, vantaux ; n° 61 : longueur et
 * vide). L'allège déplace la menuiserie verticalement dans son plan ; le trou suit (`suivreOuvertures`).
 */
export function regenererComposant(m: Modele, occ: Id, valeurs: Readonly<Record<string, number>>): Modele {
  const k = composantDe(m, occ);
  if (!k) throw new ErreurComposant("pas-composant");
  const nouvelles = { ...k.meta.valeurs, ...valeurs };
  const d = creerDefinition(m, k.fichier, { ...k.meta, valeurs: nouvelles });
  const o = d.modele.racine.occurrences[occ]!;
  const dz = (nouvelles["allege"] ?? 0) - (k.meta.valeurs["allege"] ?? 0);
  const T = Math.abs(dz) > 1e-9 ? composer(o.transformation, translation(v3(0, 0, dz))) : o.transformation;
  return purger({ ...d.modele, racine: { ...d.modele.racine, occurrences: { ...d.modele.racine.occurrences, [occ]: { ...o, definition: d.definition, transformation: T } } } });
}

/**
 * Remplace la définition des occurrences choisies (n° 88) : position, balise, nom, niveau, matière et données gardés.
 * Une occurrence verrouillée n'est pas remplacée.
 */
export function remplacerOccurrences(m: Modele, occs: readonly Id[], definition: Id): { readonly modele: Modele; readonly remplaces: number } {
  if (!m.definitions[definition]) throw new ErreurComposant("pas-composant");
  const o = { ...m.racine.occurrences };
  let n = 0;
  for (const id of occs) {
    const x = o[id];
    if (!x || x.verrouille || x.definition === definition) continue;
    o[id] = { ...x, definition };
    n++;
  }
  if (n === 0) throw new ErreurComposant("aucun-remplace");
  return { modele: purger({ ...m, racine: { ...m.racine, occurrences: o } }), remplaces: n };
}

/** Crée (sans la poser) la définition d'un fichier d'agence avec ses valeurs, pour un remplacement. */
export function definitionDepuisFichier(m: Modele, pose: Omit<Pose, "decouper">): { readonly modele: Modele; readonly definition: Id } {
  const f = pose.fichier;
  const valeurs = { ...(f.vantaux !== undefined ? { vantaux: f.vantaux } : {}), ...pose.valeurs };
  return creerDefinition(m, f, { fichier: pose.nomFichier, ...(pose.archive ? { archive: pose.archive } : {}), genre: f.genre, ...(f.main ? { main: f.main } : {}), texte: pose.texte, valeurs });
}

/**
 * Le trou suit son composant (n° 25) : pour chaque occurrence de la racine qui a découpé une ouverture, si elle a été
 * déplacée, remplacée, régénérée ou effacée, l'ancien trou est rebouché et, si elle existe encore, le nouveau est percé
 * dans la face d'appui (ouverture oubliée si le composant ne tient plus dans une face).
 */
export function suivreOuvertures(avant: Modele, apres: Modele): Modele {
  let m = apres;
  const occsAvant = avant.racine.occurrences;
  const ids = new Set([...Object.keys(occsAvant), ...Object.keys(apres.racine.occurrences)]);
  const memeContour = (x: Occurrence["ouverture"], y: Occurrence["ouverture"]): boolean => !!x && !!y && x.dans === y.dans && egal(x.contour, y.contour);
  for (const id of ids) {
    const a = occsAvant[id];
    const b = m.racine.occurrences[id];
    if (!a?.ouverture && !b?.ouverture) continue;
    if (a && b && a.definition === b.definition && JSON.stringify(a.transformation) === JSON.stringify(b.transformation)) continue;
    if (!a && b) {
      // Posée par cette opération même, ou copie d'un composant qui a découpé son ouverture : la copie perce la sienne.
      const copie = Object.values(apres.racine.occurrences).some((x) => x.id !== id && memeContour(x.ouverture, b.ouverture));
      if (!copie) continue;
    }
    const dans = (b?.ouverture ?? a?.ouverture)!.dans;
    if (dans !== undefined && !matriceMonde(m, dans)) {
      if (b) m = noterOuverture(m, id, undefined);
      continue;
    }
    if (a?.ouverture) m = boucherTrou(m, a.ouverture.contour, dans !== undefined ? { dans } : {}).modele;
    if (!b) continue;
    const contour = enContexte(m, id, dans);
    const p = contour ? percer(m, contour, dans) : null;
    m = p && contour ? noterOuverture(p, id, { ...(dans !== undefined ? { dans } : {}), contour }) : noterOuverture(m, id, undefined);
  }
  return m;
}
