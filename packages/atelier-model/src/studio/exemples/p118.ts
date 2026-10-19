import type { StudioCommand } from "../composition/types.js";
import type { StudioOpening, StudioOpeningKind, StudioWall } from "../architecture/types.js";
import { geometrieMur, ouverturesSeChevauchent, placerOuverture, type GeometrieMur } from "../architecture/geometrie.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import type { StudioPoint } from "../noyau/types.js";
import { STUDIO_TEXT_MAX } from "../objets/texte.js";

/**
 * Convertisseur PUR « niveau `floorDesign` de l'exemple P.118 → commandes Studio » (`studio-commands/1`). Il ne produit
 * que ce que `studio-document/1` représente fidèlement : murs d'architecture, ouvertures (portes, fenêtres), cotes,
 * textes, polylignes des tracés (`paths`, trous compris), calques (nom, visibilité, verrou) et leur couleur en apparence
 * d'affichage, propriétés déclarées (nom et type d'un mur, repère et nom d'une ouverture), nom d'un local en étiquette. Tout le reste
 * est déclaré absent dans le rapport (`absents`), jamais simulé ; tout élément refusé par le modèle l'est aussi (`refus`).
 *
 * Rapport EXHAUSTIF : pour chaque famille lue (`niveau`, `layers`, `walls`, `doors`, `windows`, `paths`, `paths · holes`,
 * `dims`, `texts`, `rooms`, `columns`, `stairs`), `CLES_CONSOMMEES_P118` liste les clés que le convertisseur lit ; toute
 * autre clé présente dans l'exemple devient une entrée `absents` (« famille · clé », nombre d'éléments qui la portent,
 * `origine`), avec sa raison propre quand elle est connue. Les familles sans représentation (`rooms`, `columns`,
 * `stairs`) sont déclarées absentes en entier, avec la liste de leurs clés. Un test vérifie que l'union des clés du jeu
 * P.118, moins les clés consommées et déclarées, est vide. `kind` est contrôlé (nature attendue de la famille).
 *
 * Repères : les coordonnées des murs, baies, cotes, textes et tracés sont en mètres dans le repère LOCAL du plan de
 * l'exemple ; elles sont reprises telles quelles dans le `local-2d` de Studio. Le repère cadastral (`nativeParcel`,
 * EPSG:26191) n'est jamais lu. Les polygones des métadonnées `rooms` sont exprimés dans un AUTRE repère (aligné sur les
 * stations de la trame, non déclaré dans l'exemple) : ils ne sont pas convertis, pour ne pas mélanger deux repères ;
 * les locaux sont dessinés par leurs tracés `role = room`, qui sont dans le repère du plan.
 *
 * Valeurs : uniquement les nombres de l'exemple. Les seules transformations sont déclarées dans le rapport :
 * position d'une ouverture (bord de début = t × longueur − largeur / 2 ; `t` est la fraction du CENTRE de la baie le long
 * du mur), base d'un mur = altitude du niveau, couleurs mises en minuscules, sommets consécutifs répétés retirés,
 * étiquette d'un local placée au centroïde de son tracé (dérivé, seulement s'il tombe dans le contour et hors de ses
 * trous). Les
 * conventions graphiques indispensables au format (hauteur, rotation et justification d'un texte, qui n'existent pas
 * dans l'exemple) sont nommées dans `conventions` : ce sont des réglages d'affichage, pas des données du projet.
 *
 * Version : `VERSION_CONVERSION_P118` change à chaque évolution des commandes produites ; le serveur l'inscrit (avec une
 * empreinte des commandes) dans les identifiants de requête et dans le marquage de l'étude installée.
 */

/** Version du convertisseur (à incrémenter dès que les commandes produites changent). */
export const VERSION_CONVERSION_P118 = 2;

/** Familles de l'exemple inventoriées par le rapport. */
export const FAMILLES_P118 = ["niveau", "layers", "walls", "doors", "windows", "paths", "paths · holes", "dims", "texts", "rooms", "columns", "stairs"] as const;
export type FamilleP118 = (typeof FAMILLES_P118)[number];
/**
 * Clés LUES par le convertisseur, par famille (converties, contrôlées, ou comptées pour une déclaration de famille). Les
 * familles `rooms`, `columns`, `stairs` n'ont aucune clé consommée : elles sont déclarées absentes en entier.
 */
export const CLES_CONSOMMEES_P118: Readonly<Record<FamilleP118, readonly string[]>> = Object.freeze({
  niveau: ["id", "name", "elevation", "layers", "walls", "doors", "windows", "paths", "dims", "texts", "rooms", "columns", "stairs"],
  layers: ["color", "visible", "locked"],
  walls: ["id", "kind", "a", "b", "thickness", "height", "layer", "lineRef", "name", "type"],
  doors: ["id", "kind", "hostWallId", "t", "width", "height", "sill", "mark", "name"],
  windows: ["id", "kind", "hostWallId", "t", "width", "height", "sill", "mark", "name"],
  paths: ["id", "kind", "name", "points", "holes", "closed", "role", "layer"],
  "paths · holes": ["id", "kind", "poly"],
  dims: ["id", "kind", "a", "b", "offset", "layer"],
  texts: ["id", "kind", "x", "y", "text", "layer"],
  rooms: [],
  columns: [],
  stairs: [],
});
/** Nature (`kind`) attendue d'un élément de chaque famille, quand l'exemple la déclare. */
const NATURES: Partial<Record<FamilleP118, string>> = { walls: "wall", doors: "door", windows: "window", paths: "path", "paths · holes": "poly", dims: "dim", texts: "text" };
const EXTRUSION = "tracés dessinés en plan seulement : solides, dalles et leurs épaisseurs ou décalages ne sont pas des objets studio-document/1 fidèles (aucune extrusion simulée)";
const COULEUR_OBJET = "couleur propre d'un objet non reprise (seule la couleur du calque l'est)";
/** Raisons propres des clés non consommées connues ; les autres reçoivent la raison générale. */
const RAISONS_CLES: Partial<Record<FamilleP118, Record<string, string>>> = {
  niveau: {
    height: "hauteur d'étage : studio-document/1 n'a pas de niveau ; chaque mur garde sa propre hauteur",
    exteriorWallIds: "studio-document/1 n'a pas d'attribut « mur extérieur »",
    areas: "surfaces du niveau : pas d'équivalent dans studio-document/1 (aucune surface recalculée ni simulée)",
    meta: "métadonnées du niveau : pas d'équivalent dans studio-document/1",
    activeLayer: "calque actif de l'éditeur de l'exemple : état d'interface, pas une donnée du plan",
  },
  layers: { fill: "studio-document/1 n'a pas de couleur de remplissage de calque" },
  walls: { color: COULEUR_OBJET },
  doors: { layer: "une ouverture Studio suit le calque de son mur : son calque propre n'est pas repris" },
  windows: { layer: "une ouverture Studio suit le calque de son mur : son calque propre n'est pas repris" },
  paths: { height: EXTRUSION, thickness: EXTRUSION, baseOffset: EXTRUSION, cadSolid: EXTRUSION, topOffsets: EXTRUSION, vertexOffsets: EXTRUSION, color: COULEUR_OBJET },
};
const RAISON_GENERALE = "attribut de l'exemple sans équivalent dans studio-document/1 : non repris (aucune valeur simulée)";
/** Familles sans représentation fidèle, déclarées absentes en entier (avec la liste de leurs clés). */
const FAMILLES_ABSENTES: Partial<Record<FamilleP118, string>> = {
  columns: "studio-document/1 n'a pas de poteau typé (section, forme, angle, statut de conception) ; aucun contour simulé",
  stairs: "studio-document/1 n'a pas d'escalier (volées, contremarches, niveaux de départ et d'arrivée) ; seuls ses tracés d'accessoires (paths) sont dessinés",
  rooms: "métadonnées de locaux (code, surface déclarée, catégorie, notes) dans un repère distinct du plan (non déclaré) : non converties pour ne pas mélanger les repères ; les locaux sont dessinés par leurs tracés role = room",
};

/** Hauteur d'affichage des textes (m) : convention graphique du convertisseur, l'exemple ne donne aucune taille. */
export const CONVENTION_HAUTEUR_TEXTE_P118 = 0.3;
/** Calque créé par le convertisseur pour les noms des locaux (étiquettes dérivées des tracés `role = room`). */
export const CALQUE_NOMS_LOCAUX_P118 = Object.freeze({ id: "p118-noms-locaux", name: "Noms des locaux (étiquettes dérivées)" });
/** Source déclarée des propriétés reprises de l'exemple. */
export const SOURCE_PROPRIETES_P118 = "Exemple P.118 (floorDesign)";

type Brut = Record<string, unknown>;

export interface LigneConversion {
  famille: string;
  /** Éléments lus dans l'exemple. */
  source: number;
  /** Éléments produits (objets Studio). */
  cible: number;
  transformations: string[];
}
export interface AbsentConversion {
  famille: string;
  nombre: number;
  raison: string;
  /** Clés de l'exemple couvertes par cette déclaration (inventaire exhaustif des clés non consommées). */
  origine?: { famille: FamilleP118; cles: string[] };
}
export interface RefusConversion {
  famille: string;
  id: string;
  raison: string;
}
export interface ConventionConversion {
  nom: string;
  valeur: string;
  raison: string;
}
export interface ComptesConversion {
  calques: number;
  apparences: number;
  murs: number;
  portes: number;
  fenetres: number;
  cotes: number;
  textes: number;
  polylignes: number;
  nomsLocaux: number;
  proprietes: number;
}
export interface ConversionNiveauP118 {
  niveauId: string;
  nom: string;
  /** Altitude du niveau (m), telle que déclarée par l'exemple : base des murs. */
  elevation: number;
  commandes: StudioCommand[];
  comptes: ComptesConversion;
  rapport: { convertis: LigneConversion[]; absents: AbsentConversion[]; refus: RefusConversion[]; conventions: ConventionConversion[] };
}

const estObjet = (v: unknown): v is Brut => !!v && typeof v === "object" && !Array.isArray(v);
const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const chaine = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const liste = (src: Brut, k: string): Brut[] => (Array.isArray(src[k]) ? (src[k] as unknown[]).filter(estObjet) : []);
function point(v: unknown): StudioPoint | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = nombre(v[0]), y = nombre(v[1]);
  return x === null || y === null ? null : { x, y };
}
/** Sommets d'un tracé, sommets consécutifs répétés (et fermeture répétée) retirés ; `retires` compte les retraits. */
function sommets(v: unknown, ferme: boolean): { points: StudioPoint[]; retires: number } | null {
  if (!Array.isArray(v)) return null;
  const pts: StudioPoint[] = [];
  let retires = 0;
  for (const brut of v) {
    const p = point(brut);
    if (!p) return null;
    const prec = pts[pts.length - 1];
    if (prec && prec.x === p.x && prec.y === p.y) { retires++; continue; }
    pts.push(p);
  }
  while (ferme && pts.length > 1 && pts[0]!.x === pts[pts.length - 1]!.x && pts[0]!.y === pts[pts.length - 1]!.y) { pts.pop(); retires++; }
  return { points: pts, retires };
}
/** Texte d'une ligne pour un contenu Studio (une seule ligne, sans caractère de contrôle, 500 caractères au plus). */
function contenuTexte(v: unknown): string | null {
  const s = chaine(v);
  if (!s || /[\u0000-\u001F\u007F]/.test(s) || [...s].length > STUDIO_TEXT_MAX) return null;
  return s;
}
/** Identifiant de calque stable, lisible (ASCII), unique dans le niveau. */
function slug(nom: string): string {
  const s = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "calque";
}
const aireSignee = (p: readonly StudioPoint[]): number => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const u = p[i]!, v = p[(i + 1) % p.length]!;
    a += u.x * v.y - v.x * u.y;
  }
  return a / 2;
};
function centroide(p: readonly StudioPoint[]): StudioPoint | null {
  const a = aireSignee(p);
  if (!(Math.abs(a) > 0)) return null;
  let cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const u = p[i]!, v = p[(i + 1) % p.length]!;
    const k = u.x * v.y - v.x * u.y;
    cx += (u.x + v.x) * k;
    cy += (u.y + v.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
function dansContour(q: StudioPoint, p: readonly StudioPoint[]): boolean {
  let dedans = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!, b = p[j]!;
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}
const COULEUR = /^#[0-9a-f]{6}$/;

/**
 * Convertit un niveau de `floorDesign.levels` en commandes Studio. `niveau` est l'objet brut de l'exemple (`id`, `name`,
 * `elevation`, `walls`, `doors`, `windows`, `dims`, `texts`, `paths`, `layers`, …). Ordre des commandes : calques
 * (déverrouillés), apparences, murs, ouvertures, propriétés, cotes, polylignes, textes, étiquettes des locaux, puis
 * verrouillage des calques déclarés verrouillés (un calque verrouillé refuse toute création). Pur et déterministe.
 */
export function convertirNiveauP118(niveau: unknown): ConversionNiveauP118 {
  if (!estObjet(niveau)) throw new Error("niveau floorDesign attendu");
  const niveauId = chaine(niveau["id"]);
  const elevation = nombre(niveau["elevation"]);
  if (!niveauId) throw new Error("niveau sans identifiant");
  if (elevation === null) throw new Error(`niveau ${niveauId} : altitude (elevation) absente`);
  const nom = chaine(niveau["name"]) ?? niveauId;
  const commandes: StudioCommand[] = [];
  const convertis: LigneConversion[] = [];
  const absents: AbsentConversion[] = [];
  const refus: RefusConversion[] = [];
  const conventions: ConventionConversion[] = [];
  const comptes: ComptesConversion = { calques: 0, apparences: 0, murs: 0, portes: 0, fenetres: 0, cotes: 0, textes: 0, polylignes: 0, nomsLocaux: 0, proprietes: 0 };
  const ids = new Set<string>();
  const refuser = (famille: string, id: string, raison: string) => refus.push({ famille, id, raison });
  const libre = (famille: string, id: string): boolean => {
    if (ids.has(id)) { refuser(famille, id, "identifiant déjà employé dans le niveau"); return false; }
    ids.add(id);
    return true;
  };
  /** `kind` déclaré et différent de la nature attendue de la famille : élément refusé (jamais réinterprété). */
  const natureRefusee = (famille: FamilleP118, id: string, o: Brut): boolean => {
    const k = o["kind"];
    if (k === undefined || k === NATURES[famille]) return false;
    refuser(famille, id, `nature « ${String(k)} » inattendue (attendue : « ${NATURES[famille]} »)`);
    return true;
  };

  // ——— Calques (nom, visibilité, verrou ; couleur de trait en apparence d'affichage) ———
  const calquesBruts = estObjet(niveau["layers"]) ? Object.entries(niveau["layers"]).filter((e): e is [string, Brut] => estObjet(e[1])) : [];
  const calqueDe = new Map<string, string>();
  const verrouilles: { id: string; name: string; visible: boolean }[] = [];
  const pris = new Set<string>([CALQUE_NOMS_LOCAUX_P118.id]);
  let couleurs = 0, sansCouleur = 0;
  for (const [nomCalque, l] of calquesBruts) {
    if (nomCalque.length > STUDIO_LIMITS.layerName || !nomCalque.trim()) { refuser("layers", nomCalque, `nom de calque vide ou de plus de ${STUDIO_LIMITS.layerName} caractères`); continue; }
    if (typeof l["visible"] !== "boolean" || typeof l["locked"] !== "boolean") { refuser("layers", nomCalque, "visibilité ou verrou non déclaré"); continue; }
    let id = `p118-${slug(nomCalque)}`;
    for (let k = 2; pris.has(id); k++) id = `p118-${slug(nomCalque)}-${k}`;
    pris.add(id);
    calqueDe.set(nomCalque, id);
    commandes.push({ toolId: "studio.calque.creer", params: { id, name: nomCalque, visible: l["visible"], locked: false } });
    comptes.calques++;
    if (l["locked"]) verrouilles.push({ id, name: nomCalque, visible: l["visible"] });
    const couleur = chaine(l["color"])?.toLowerCase() ?? null;
    if (couleur && COULEUR.test(couleur)) {
      commandes.push({ toolId: "studio.apparence.definir", params: { id: `${id}-couleur`, type: "appearance", target: { kind: "layer", id }, color: couleur } });
      comptes.apparences++;
      couleurs++;
    } else sansCouleur++;
  }
  convertis.push({ famille: "layers", source: calquesBruts.length, cible: comptes.calques, transformations: ["nom, visibilité et verrou conservés (verrou posé en fin de lot)", `couleur de trait → apparence d'affichage du calque (${couleurs}, minuscules)`] });
  if (sansCouleur) absents.push({ famille: "layers · color", nombre: sansCouleur, raison: "couleur absente ou hors forme #rrggbb : aucune apparence" });
  const calque = (o: Brut): { layerId?: string } => {
    const id = calqueDe.get(chaine(o["layer"]) ?? "");
    return id ? { layerId: id } : {};
  };
  let sansCalque = 0;
  const noteCalque = (o: Brut) => { if (chaine(o["layer"]) && !calqueDe.has(chaine(o["layer"])!)) sansCalque++; };
  const proprietes: StudioCommand[] = [];
  const propriete = (cibleId: string, nomP: string, valeur: unknown) => {
    const v = chaine(valeur);
    if (!v || v !== v.trim()) return;
    proprietes.push({ toolId: "studio.propriete.definir", params: { cibleId, nom: nomP, valeur: v, source: SOURCE_PROPRIETES_P118 } });
  };

  // ——— Murs ———
  const murs = new Map<string, { mur: StudioWall; g: GeometrieMur; poses: StudioOpening[] }>();
  const mursBruts = liste(niveau, "walls");
  let lineRefAbsent = 0;
  for (const w of mursBruts) {
    const id = chaine(w["id"]) ?? "";
    const a = point(w["a"]), b = point(w["b"]), thickness = nombre(w["thickness"]), height = nombre(w["height"]);
    if (!id) { refuser("walls", "(sans identifiant)", "mur sans identifiant"); continue; }
    if (natureRefusee("walls", id, w)) continue;
    if (!a || !b || (a.x === b.x && a.y === b.y)) { refuser("walls", id, "axe a → b absent ou de longueur nulle"); continue; }
    if (thickness === null || thickness <= 0) { refuser("walls", id, "épaisseur absente ou nulle (non évaluée)"); continue; }
    if (height === null || height <= 0) { refuser("walls", id, "hauteur absente ou nulle (non évaluée)"); continue; }
    const lineRef = w["lineRef"];
    if (lineRef !== undefined && lineRef !== "axe") { refuser("walls", id, `référence de tracé « ${String(lineRef)} » non représentée (seul l'axe l'est)`); continue; }
    if (lineRef === undefined) lineRefAbsent++;
    const mur: StudioWall = { id, type: "wall", ...calque(w), axis: [a, b], thickness, height, base: elevation, justification: "center" };
    const g = geometrieMur(mur);
    if (!g.ok) { refuser("walls", id, g.raison); continue; }
    if (!libre("walls", id)) continue;
    noteCalque(w);
    commandes.push({ toolId: "studio.architecture.mur", params: mur });
    murs.set(id, { mur, g: g.valeur, poses: [] });
    comptes.murs++;
    propriete(id, "Nom", w["name"]);
    propriete(id, "Type", w["type"]);
  }
  convertis.push({ famille: "walls", source: mursBruts.length, cible: comptes.murs, transformations: ["axe a → b, épaisseur et hauteur conservées", `base = altitude du niveau (${elevation} m)`, "lineRef « axe » → justification centrée", ...(lineRefAbsent ? [`lineRef absent (${lineRefAbsent}) → axe centré, même lecture que l'import natif de l'Atelier`] : []), "name, type → propriétés déclarées « Nom », « Type »"] });

  // ——— Ouvertures (portes, fenêtres) ———
  for (const [famille, kind, cle] of [["doors", "porte", "portes"], ["windows", "fenetre", "fenetres"]] as const) {
    const bruts = liste(niveau, famille);
    for (const q of bruts) {
      const id = chaine(q["id"]) ?? "";
      const hostId = chaine(q["hostWallId"]) ?? "";
      const t = nombre(q["t"]), width = nombre(q["width"]), height = nombre(q["height"]), sill = nombre(q["sill"]);
      if (!id) { refuser(famille, "(sans identifiant)", "ouverture sans identifiant"); continue; }
      if (natureRefusee(famille, id, q)) continue;
      const hote = murs.get(hostId);
      if (!hote) { refuser(famille, id, `mur hôte « ${hostId} » absent ou non converti`); continue; }
      if (t === null || width === null || width <= 0 || height === null || height <= 0 || sill === null || sill < 0) { refuser(famille, id, "t, largeur, hauteur ou allège absente (non évaluée)"); continue; }
      let position = t * hote.g.longueur - width / 2;
      // Arrondi flottant seulement (borne technique 1e-9 × longueur) : jamais un recalage d'une baie qui déborde.
      if (position < 0 && position > -hote.g.tolerance) position = 0;
      if (position < 0) { refuser(famille, id, `bord de début avant le début du mur (t × longueur − largeur / 2 = ${position} m)`); continue; }
      const o: StudioOpening = { id, type: "opening", hostId, position, width, height, sill, kind: kind as StudioOpeningKind };
      const p = placerOuverture(hote.mur, hote.g, o);
      if (!p.ok) { refuser(famille, id, p.raison); continue; }
      const voisine = hote.poses.find((x) => ouverturesSeChevauchent(x, o, hote.g.tolerance));
      if (voisine) { refuser(famille, id, `chevauche l'ouverture ${voisine.id} sur le mur ${hostId}`); continue; }
      if (!libre(famille, id)) continue;
      hote.poses.push(o);
      commandes.push({ toolId: "studio.architecture.ouverture", params: o });
      comptes[cle]++;
      propriete(id, "Repère", q["mark"]);
      propriete(id, "Nom", q["name"]);
    }
    convertis.push({ famille, source: bruts.length, cible: comptes[cle], transformations: ["position = t × longueur du mur − largeur / 2 (bord de début ; t = fraction du centre)", "largeur, hauteur, allège conservées", `type déclaré « ${kind} »`, "mark, name → propriétés déclarées « Repère », « Nom »"] });
  }
  commandes.push(...proprietes);
  comptes.proprietes = proprietes.length;

  // ——— Cotes (libres : l'exemple ne les rattache pas) ———
  const dims = liste(niveau, "dims");
  for (const d of dims) {
    const id = chaine(d["id"]) ?? "";
    const a = point(d["a"]), b = point(d["b"]), offset = nombre(d["offset"]);
    if (!id || !a || !b || (a.x === b.x && a.y === b.y) || offset === null) { refuser("dims", id || "(sans identifiant)", "extrémités ou décalage absents, ou cote de longueur nulle"); continue; }
    if (natureRefusee("dims", id, d)) continue;
    if (!libre("dims", id)) continue;
    noteCalque(d);
    commandes.push({ toolId: "studio.dessin.cote", params: { id, type: "dimension", ...calque(d), start: a, end: b, offset, links: { start: null, end: null }, toResolve: false } });
    comptes.cotes++;
  }
  convertis.push({ famille: "dims", source: dims.length, cible: comptes.cotes, transformations: ["a, b, offset conservés ; cotes libres (non liées)"] });

  // ——— Tracés (paths) → polylignes fermées, trous en polylignes distinctes ———
  const paths = liste(niveau, "paths");
  let trous = 0, trousConvertis = 0, retires = 0, nomsTraces = 0;
  const locaux: { id: string; nom: string; contour: StudioPoint[]; trous: StudioPoint[][] }[] = [];
  const roles = new Map<string, number>();
  const ajouterPolyligne = (id: string, pts: StudioPoint[], ferme: boolean, o: Brut, famille: string): boolean => {
    if (pts.length < (ferme ? 3 : 2)) { refuser(famille, id, `${pts.length} sommet(s) distinct(s) : contour non représentable`); return false; }
    if (pts.length > STUDIO_LIMITS.polylinePoints) { refuser(famille, id, `plus de ${STUDIO_LIMITS.polylinePoints} sommets`); return false; }
    if (!libre(famille, id)) return false;
    noteCalque(o);
    commandes.push({ toolId: "studio.dessin.polyligne", params: { id, type: "polyline", ...calque(o), points: pts, closed: ferme } });
    comptes.polylignes++;
    return true;
  };
  for (const p of paths) {
    const id = chaine(p["id"]) ?? "";
    if (!id) { refuser("paths", "(sans identifiant)", "tracé sans identifiant"); continue; }
    if (natureRefusee("paths", id, p)) continue;
    const ferme = p["closed"] !== false;
    const s = sommets(p["points"], ferme);
    if (!s) { refuser("paths", id, "sommets absents ou non numériques"); continue; }
    retires += s.retires;
    const role = chaine(p["role"]) ?? "solid";
    roles.set(role, (roles.get(role) ?? 0) + 1);
    if (!ajouterPolyligne(id, s.points, ferme, p, "paths")) continue;
    if (chaine(p["name"]) && !(role === "room" && ferme)) nomsTraces++;
    const local = role === "room" && ferme ? { id, nom: chaine(p["name"]) ?? "", contour: s.points, trous: [] as StudioPoint[][] } : null;
    if (local) locaux.push(local);
    const holes = Array.isArray(p["holes"]) ? (p["holes"] as unknown[]).filter(estObjet) : [];
    holes.forEach((h, i) => {
      trous++;
      const hid = chaine(h["id"]) ?? `${id}-H${i}`;
      if (natureRefusee("paths · holes", hid, h)) return;
      const hs = sommets(h["poly"], true);
      if (!hs) { refuser("paths · holes", hid, "sommets du trou absents ou non numériques"); return; }
      retires += hs.retires;
      // Un trou exclut l'étiquette du local même s'il n'est pas représentable (aucune position dans un vide).
      if (local && hs.points.length >= 3) local.trous.push(hs.points);
      if (ajouterPolyligne(hid, hs.points, true, p, "paths · holes")) trousConvertis++;
    });
  }
  convertis.push({ famille: "paths", source: paths.length, cible: comptes.polylignes - trousConvertis, transformations: [`rôles : ${[...roles].map(([r, n]) => `${r} (${n})`).join(", ") || "aucun"} — chaque tracé devient une polyligne de son calque`, ...(retires ? [`sommets consécutifs répétés retirés (${retires})`] : [])] });
  if (trous) convertis.push({ famille: "paths · holes", source: trous, cible: trousConvertis, transformations: ["chaque trou devient une polyligne fermée distincte (la relation contour / trou n'est pas représentée)"] });
  // `name` d'un tracé n'est lu que pour un local (étiquette) : une polyligne n'admet pas de propriété déclarée.
  if (nomsTraces) absents.push({ famille: "paths · name (hors locaux)", nombre: nomsTraces, raison: "nom d'un tracé qui n'est pas un local : une polyligne studio-document/1 n'a ni nom ni propriété déclarée (seuls murs, ouvertures et objets extrudés en portent)" });

  // ——— Textes ———
  const texts = liste(niveau, "texts");
  for (const t of texts) {
    const id = chaine(t["id"]) ?? "";
    const x = nombre(t["x"]), y = nombre(t["y"]), content = contenuTexte(t["text"]);
    if (!id || x === null || y === null || !content) { refuser("texts", id || "(sans identifiant)", "position ou contenu absent, ou contenu hors d'une ligne de 500 caractères"); continue; }
    if (natureRefusee("texts", id, t)) continue;
    if (!libre("texts", id)) continue;
    noteCalque(t);
    commandes.push({ toolId: "studio.dessin.texte", params: { id, type: "text", ...calque(t), position: { x, y }, height: CONVENTION_HAUTEUR_TEXTE_P118, rotation: 0, content, justification: "left" } });
    comptes.textes++;
  }
  convertis.push({ famille: "texts", source: texts.length, cible: comptes.textes, transformations: ["x, y, texte conservés"] });

  // ——— Noms des locaux (aucune entité « local » dans studio-document/1) ———
  if (locaux.length) {
    const etiquettes: StudioCommand[] = [];
    for (const l of locaux) {
      const content = contenuTexte(l.nom);
      const c = centroide(l.contour);
      if (!content) { refuser("paths · room (nom)", l.id, "local sans nom"); continue; }
      if (!c || !dansContour(c, l.contour)) { refuser("paths · room (nom)", l.id, "centroïde hors du contour : étiquette non placée (aucune position inventée)"); continue; }
      if (l.trous.some((trou) => dansContour(c, trou))) { refuser("paths · room (nom)", l.id, "centroïde dans un trou du contour : étiquette non placée (aucune position inventée)"); continue; }
      const id = `${l.id}-nom`;
      if (!libre("paths · room (nom)", id)) continue;
      etiquettes.push({ toolId: "studio.dessin.texte", params: { id, type: "text", layerId: CALQUE_NOMS_LOCAUX_P118.id, position: c, height: CONVENTION_HAUTEUR_TEXTE_P118, rotation: 0, content, justification: "center" } });
    }
    if (etiquettes.length) {
      commandes.push({ toolId: "studio.calque.creer", params: { id: CALQUE_NOMS_LOCAUX_P118.id, name: CALQUE_NOMS_LOCAUX_P118.name, visible: true, locked: false } });
      comptes.calques++;
      commandes.push(...etiquettes);
      comptes.nomsLocaux = etiquettes.length;
    }
    convertis.push({ famille: "paths · room (nom)", source: locaux.length, cible: comptes.nomsLocaux, transformations: ["nom du tracé → texte centré au centroïde du contour (dérivé), calque « Noms des locaux (étiquettes dérivées) »"] });
  }
  if (sansCalque) absents.push({ famille: "layer non déclaré", nombre: sansCalque, raison: "calque cité mais absent de layers : objet placé sur le calque implicite" });

  // ——— Verrous des calques déclarés verrouillés, en dernier ———
  for (const v of verrouilles) commandes.push({ toolId: "studio.calque.modifier", params: { id: v.id, name: v.name, visible: v.visible, locked: true } });

  // ——— Inventaire exhaustif des clés : familles absentes en entier, puis clés non consommées ———
  for (const [famille, objets] of objetsParFamille(niveau)) {
    const cles = new Map<string, number>();
    for (const o of objets) for (const [k, v] of Object.entries(o)) if (v !== undefined) cles.set(k, (cles.get(k) ?? 0) + 1);
    const entiere = FAMILLES_ABSENTES[famille];
    if (entiere) {
      if (objets.length) absents.push({ famille, nombre: objets.length, raison: entiere, origine: { famille, cles: [...cles.keys()].sort() } });
      continue;
    }
    const consommees = new Set(CLES_CONSOMMEES_P118[famille]);
    for (const [k, n] of [...cles].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
      if (consommees.has(k)) continue;
      absents.push({ famille: `${famille} · ${k}`, nombre: n, raison: RAISONS_CLES[famille]?.[k] ?? RAISON_GENERALE, origine: { famille, cles: [k] } });
    }
  }

  conventions.push(
    { nom: "texte · hauteur", valeur: `${CONVENTION_HAUTEUR_TEXTE_P118} m`, raison: "l'exemple ne donne aucune taille de texte ; hauteur d'affichage exigée par le format" },
    { nom: "texte · rotation", valeur: "0", raison: "l'exemple ne donne aucune rotation de texte" },
    { nom: "texte · justification", valeur: "gauche (textes de l'exemple), centre (noms des locaux)", raison: "l'exemple ne donne aucune justification" },
    { nom: "calque · noms des locaux", valeur: "visible, déverrouillé", raison: "calque créé par le convertisseur pour les étiquettes dérivées" },
  );
  return { niveauId, nom, elevation, commandes, comptes, rapport: { convertis, absents, refus, conventions } };
}

export interface ConversionExempleP118 {
  /** `VERSION_CONVERSION_P118` du convertisseur qui a produit ces commandes. */
  version: number;
  niveaux: ConversionNiveauP118[];
}

/** Éléments bruts de chaque famille inventoriée d'un niveau (les éléments non-objets sont ignorés). */
function objetsParFamille(niveau: Brut): [FamilleP118, Brut[]][] {
  const calques = estObjet(niveau["layers"]) ? Object.values(niveau["layers"]).filter(estObjet) : [];
  const trous = liste(niveau, "paths").flatMap((p) => (Array.isArray(p["holes"]) ? (p["holes"] as unknown[]).filter(estObjet) : []));
  return FAMILLES_P118.map((f) => [f, f === "niveau" ? [niveau] : f === "layers" ? calques : f === "paths · holes" ? trous : liste(niveau, f)]);
}

/**
 * Tous les niveaux du `floorDesign` de l'exemple, dans l'ordre de `domains.levels` (sinon l'ordre des clés). Les
 * domaines cadastraux (`nativeParcel`, `buildingFootprint`) ne sont jamais lus.
 */
export function convertirExempleP118(domains: { levels?: unknown; floorDesign?: unknown }): ConversionExempleP118 {
  const fd = estObjet(domains.floorDesign) ? domains.floorDesign : null;
  const niveaux = fd && estObjet(fd["levels"]) ? fd["levels"] : null;
  if (!niveaux) throw new Error("floorDesign.levels attendu");
  const ordre = Array.isArray(domains.levels) ? domains.levels.filter(estObjet).map((l) => chaine(l["id"])).filter((id): id is string => !!id && estObjet(niveaux[id])) : [];
  const ids = ordre.length ? ordre : Object.keys(niveaux);
  return { version: VERSION_CONVERSION_P118, niveaux: ids.map((id) => convertirNiveauP118(niveaux[id])) };
}

/** Découpe une liste de commandes en lots d'au plus `taille` commandes, ordre conservé (borne d'enveloppe : 500). */
export function lotsDeCommandes(commandes: readonly StudioCommand[], taille = 500): StudioCommand[][] {
  if (!Number.isInteger(taille) || taille < 1) throw new RangeError("taille entière positive attendue");
  const lots: StudioCommand[][] = [];
  for (let i = 0; i < commandes.length; i += taille) lots.push(commandes.slice(i, i + taille));
  return lots;
}
