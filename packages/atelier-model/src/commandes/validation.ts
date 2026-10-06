/**
 * Validation des paramètres canoniques de chaque classe (section 5.2) : unités, bornes, préconditions sur les
 * objets référencés. Retourne des paramètres typés ou lève `ErreurCommande` (400 côté API) — jamais de valeur
 * par défaut inventée pour une grandeur physique (R3) : une hauteur absente reste `null`.
 */
import { contourFerme } from "./changer-classe.js";
import { profilFerme } from "./hachures-associees.js";
import { lireOuvrant } from "../ouvrants.js";
import { lireMenuiserie } from "../menuiserie.js";
import { lireCintre, type Cintre } from "../cintres.js";
import { distance, longueurAxeMur } from "../geometrie.js";
import { USAGES_DALLE, type ModeleAtelier, type ParamsParClasse } from "../modele.js";
import type { Classe } from "../ontologie.js";
import { TOLERANCE_REDUCTEUR, type Longueur } from "../unites.js";
import { ErreurCommande, lire } from "./base.js";

type Brut = Record<string, unknown>;

/** Renflements d'une polyligne (D-063) : un par segment, |b| ≤ 1 (demi-cercle au plus) ; tous nuls : clé absente. */
function renflementsDe(p: Brut, forme: string, n: number, ferme: boolean): { renflements?: number[] } {
  const v = p["renflements"];
  if (v === undefined || v === null) return {};
  if (forme !== "polyligne") throw new ErreurCommande("invalide", "renflements", "segments en arc : polylignes seulement");
  const attendu = n - 1 + (ferme && n > 2 ? 1 : 0);
  if (!Array.isArray(v) || v.length !== attendu || !v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1 + 1e-12)) throw new ErreurCommande("invalide", "renflements", `renflements : ${attendu} nombre(s) entre −1 et 1 (un par segment)`);
  const r = (v as number[]).map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12));
  return r.some((x) => x !== 0) ? { renflements: r } : {};
}

/** Espace sur plusieurs niveaux (D-142) : niveau haut connu, exclusif d'une hauteur propre ; absent : clé omise. */
function niveauHautEspace(etat: ModeleAtelier, p: Brut): { niveauHautId?: string } {
  const id = lire.chaineOuNull(p, "niveauHautId");
  if (id === null) return {};
  if (!etat.niveaux[id]) throw new ErreurCommande("precondition", "niveauHautId", `niveau inconnu : ${id}`);
  if (p["hauteur"] !== undefined && p["hauteur"] !== null) throw new ErreurCommande("invalide", "niveauHautId", "espace : hauteur propre ou niveau haut, pas les deux");
  return { niveauHautId: id };
}

/** Hauteur propre d'une pièce ou d'un espace (D-059) : clé présente seulement si déclarée. */
const hauteurPropre = (p: Brut): { hauteur?: Longueur } => {
  const h = lire.longueur(p, "hauteur", { optionnel: true, strict: true });
  return h ? { hauteur: h } : {};
};

function surfaceOuNull(params: Brut, cle: string) {
  const v = params[cle];
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || (v as { unit?: string }).unit !== "m2" || !Number.isFinite((v as { value?: number }).value)) {
    throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une surface ({ value, unit: "m2" })`);
  }
  return { value: (v as { value: number }).value, unit: "m2" as const };
}

function contour(params: Brut, min = 3) {
  const c = lire.points(params, "contour", { min });
  return { contour: c, trous: lire.trous(params) };
}

export const VALIDATEURS: { [C in Classe]: (etat: ModeleAtelier, params: Brut) => ParamsParClasse[C] } = {
  mur(etat, p) {
    const a = lire.point(p, "a")!;
    const b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "mur de longueur nulle");
    const niveauHautId = lire.chaineOuNull(p, "niveauHautId");
    if (niveauHautId !== null && !etat.niveaux[niveauHautId]) throw new ErreurCommande("precondition", "niveauHautId", `niveau inconnu : ${niveauHautId}`);
    return {
      a,
      b,
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }),
      niveauHautId,
      alignement: lire.enumeration(p, "alignement", ["gauche", "axe", "droite"] as const, "axe"),
      exterieur: lire.booleen(p, "exterieur", false),
      nom: lire.chaineOuNull(p, "nom"),
      ...renflementMur(etat, p),
    };
  },
  porte: (etat, p) => {
    const o = ouverture(etat, p);
    const ouvrant = lireOuvrant(p["ouvrant"]);
    // Menuiserie de porte (D-113) : dormant, seuil, vantaux pleins ou vitrés (porte-fenêtre).
    const hote = etat.objets[o.murHoteId] as { params: { epaisseur: { value: number } } };
    const menuiserie = lireMenuiserie(p["menuiserie"], { largeur: o.largeur.value, hauteur: o.hauteur.value, epaisseurMur: hote.params.epaisseur.value, porte: true });
    return { ...o, ...(ouvrant ? { ouvrant } : {}), ...(menuiserie ? { menuiserie } : {}) };
  },
  fenetre: (etat, p) => {
    const o = ouverture(etat, p);
    // Menuiserie paramétrée (D-101) : dormant, vitrage, vantaux ; absente : panneau simple.
    const hote = etat.objets[o.murHoteId] as { params: { epaisseur: { value: number } } };
    const menuiserie = lireMenuiserie(p["menuiserie"], { largeur: o.largeur.value, hauteur: o.hauteur.value, epaisseurMur: hote.params.epaisseur.value });
    return menuiserie ? { ...o, menuiserie } : o;
  },
  ouverture: (etat, p) => ouverture(etat, p),
  dalle(_etat, p) {
    const usage = p["usage"] === undefined || p["usage"] === null ? null : lire.enumeration(p, "usage", USAGES_DALLE);
    return { ...contour(p), epaisseur: lire.longueur(p, "epaisseur", { strict: true })!, decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" }, nom: lire.chaineOuNull(p, "nom"), ...(usage ? { usage } : {}), ...penteDalle(p) };
  },
  toiture(_etat, p) {
    return {
      ...contour(p),
      type: lire.enumeration(p, "type", ["plate", "monopente", "bipente"] as const, "plate"),
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      pente: lire.angle(p, "pente", { optionnel: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  escalier(etat, p) {
    const a = lire.point(p, "a")!;
    const b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "escalier de longueur nulle");
    const niveauDepartId = lire.chaine(p, "niveauDepartId");
    if (!etat.niveaux[niveauDepartId]) throw new ErreurCommande("precondition", "niveauDepartId", `niveau inconnu : ${niveauDepartId}`);
    const niveauArriveeId = lire.chaineOuNull(p, "niveauArriveeId");
    if (niveauArriveeId !== null && !etat.niveaux[niveauArriveeId]) throw new ErreurCommande("precondition", "niveauArriveeId", `niveau d'arrivée inconnu : ${niveauArriveeId}`);
    return {
      a,
      b,
      largeur: lire.longueur(p, "largeur", { strict: true })!,
      hauteurAFranchir: lire.longueur(p, "hauteurAFranchir", { strict: true })!,
      marches: lire.nombre(p, "marches", { optionnel: true, entier: true, min: 1 }),
      contremarches: lire.nombre(p, "contremarches", { optionnel: true, entier: true, min: 1 }),
      epaisseurPaillasse: lire.longueur(p, "epaisseurPaillasse", { optionnel: true, strict: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      niveauDepartId,
      niveauArriveeId,
      groupe: lire.chaineOuNull(p, "groupe"),
      referencePlanSeulement: lire.booleen(p, "referencePlanSeulement", false),
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  piece(_etat, p) {
    return {
      ...contour(p),
      code: lire.chaineOuNull(p, "code"),
      nom: lire.chaine(p, "nom"),
      categorie: lire.chaineOuNull(p, "categorie"),
      aireDeclaree: surfaceOuNull(p, "aireDeclaree"),
      notes: lire.chaineOuNull(p, "notes"),
      etiquette: lire.point(p, "etiquette", { optionnel: true }),
      ...hauteurPropre(p),
    };
  },
  espace(etat, p) {
    const polys = p["polygones"];
    if (!Array.isArray(polys) || polys.length === 0) throw new ErreurCommande("invalide", "polygones", "« polygones » requis (au moins un contour)");
    const polygones = polys.map((poly, i) => {
      if (typeof poly !== "object" || poly === null) throw new ErreurCommande("invalide", `polygones[${i}]`, "contour attendu");
      return contour(poly as Brut);
    });
    return {
      polygones,
      code: lire.chaineOuNull(p, "code"),
      nom: lire.chaine(p, "nom"),
      categorie: lire.chaineOuNull(p, "categorie"),
      aireDeclaree: surfaceOuNull(p, "aireDeclaree"),
      notes: lire.chaineOuNull(p, "notes"),
      etiquette: lire.point(p, "etiquette", { optionnel: true }),
      ...hauteurPropre(p),
      ...niveauHautEspace(etat, p),
    };
  },
  zone(_etat, p) {
    return { ...contour(p), nom: lire.chaine(p, "nom"), categorie: lire.chaineOuNull(p, "categorie") };
  },
  poteau(_etat, p) {
    const formeId = lire.chaine(p, "formeId");
    const largeur = lire.longueur(p, "largeur", { strict: true })!;
    const profondeur = lire.longueur(p, "profondeur", { strict: true })!;
    // Profilés (D-139) : épaisseur des parois saisie, inférieure à la moitié de la plus petite dimension.
    const profile = PROFILES_POTEAU.includes(formeId);
    const ep = profile ? lire.longueur(p, "epaisseurProfil", { strict: true }) : null;
    if (!profile && p["epaisseurProfil"] !== undefined && p["epaisseurProfil"] !== null) throw new ErreurCommande("invalide", "epaisseurProfil", "épaisseur de paroi réservée aux profilés I, T, L, U");
    if (ep && ep.value >= Math.min(largeur.value, profondeur.value) / 2) throw new ErreurCommande("invalide", "epaisseurProfil", "épaisseur de paroi inférieure à la moitié de la largeur et de la profondeur");
    return {
      point: lire.point(p, "point")!,
      formeId,
      ...(ep ? { epaisseurProfil: ep } : {}),
      largeur,
      profondeur,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }),
      angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
      nom: lire.chaineOuNull(p, "nom"),
      statutConception: lire.chaineOuNull(p, "statutConception"),
    };
  },
  solide(_etat, p) {
    const ferme = lire.booleen(p, "ferme", true);
    return {
      ...contour(p, ferme ? 3 : 2),
      ferme,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      epaisseur: lire.longueur(p, "epaisseur", { optionnel: true }),
      role: lire.chaine(p, "role", { optionnel: true }) || "solid",
      nom: lire.chaineOuNull(p, "nom"),
      couleur: lire.chaineOuNull(p, "couleur"),
      ...sourceSolide(_etat, p),
    };
  },
  esquisse(_etat, p) {
    const forme = lire.enumeration(p, "forme", ["ligne", "polyligne", "arc", "cercle", "rectangle", "polygone", "spline", "construction", "hachure", "ellipse"] as const);
    const minPoints: Record<typeof forme, number> = { ligne: 2, polyligne: 2, arc: 0, cercle: 0, rectangle: 2, polygone: 3, spline: 2, construction: 2, hachure: 3, ellipse: 0 };
    const points = lire.points(p, "points", { min: minPoints[forme], optionnel: minPoints[forme] === 0 });
    const centre = lire.point(p, "centre", { optionnel: true });
    const rayon = lire.longueur(p, "rayon", { optionnel: true, strict: true });
    if ((forme === "arc" || forme === "cercle" || forme === "ellipse") && (!centre || !rayon)) throw new ErreurCommande("invalide", "centre", `${forme} : centre et rayon requis`);
    const rayonB = forme === "ellipse" ? lire.longueur(p, "rayonB", { strict: true }) : null;
    if (rayonB && rayon && rayonB.value > rayon.value + 1e-12) throw new ErreurCommande("invalide", "rayonB", "ellipse : le demi-petit axe (rayonB) ne dépasse pas le demi-grand axe (rayon)");
    if (forme === "ligne" || forme === "construction") {
      if (distance(points[0]!, points[1]!) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "points", "segment de longueur nulle");
    }
    return {
      forme,
      points,
      ferme: lire.booleen(p, "ferme", forme === "polygone" || forme === "rectangle" || forme === "hachure" || forme === "cercle" || forme === "ellipse"),
      centre,
      rayon,
      angleDebut: lire.angle(p, "angleDebut", { optionnel: true }),
      angleFin: lire.angle(p, "angleFin", { optionnel: true }),
      motif: lire.chaineOuNull(p, "motif"),
      ...(forme === "ellipse" ? { rayonB, rotation: lire.angle(p, "rotation", { optionnel: true }) ?? { value: 0, unit: "deg" } } : {}),
      ...renflementsDe(p, forme, points.length, lire.booleen(p, "ferme", false)),
      ...tangentesDe(p, forme, points.length),
      ...sourceHachure(_etat, p, forme),
      ...degradeDe(p, forme),
      ...motifLignesDe(p, forme),
      ...axeDeDe(_etat, p, forme),
    };
  },
  "reference-plan"(_etat, p) {
    return { ...contour(p), source: lire.chaineOuNull(p, "source"), echelle: lire.nombre(p, "echelle", { optionnel: true, min: 0 }), nom: lire.chaineOuNull(p, "nom") };
  },
  cotation(_etat, p) {
    return { a: lire.point(p, "a")!, b: lire.point(p, "b")!, decalage: lire.longueur(p, "decalage", { optionnel: true }) ?? { value: 0, unit: "m" } };
  },
  texte(_etat, p) {
    return { position: lire.point(p, "position")!, texte: lire.chaine(p, "texte") };
  },
  etiquette(etat, p) {
    const objetId = lire.chaineOuNull(p, "objetId");
    if (objetId !== null && !etat.objets[objetId]) throw new ErreurCommande("precondition", "objetId", `objet inconnu : ${objetId}`);
    return { position: lire.point(p, "position")!, texte: lire.chaine(p, "texte"), objetId };
  },
  "garde-corps"(_etat, p) {
    const points = lire.points(p, "points", { min: 2 });
    for (let i = 0; i + 1 < points.length; i++) if (distance(points[i]!, points[i + 1]!) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "points", "segment de garde-corps de longueur nulle");
    return {
      points,
      ferme: lire.booleen(p, "ferme", false),
      // Hauteur saisie, jamais déduite d'une règle (R3) : obligatoire.
      hauteur: lire.longueur(p, "hauteur", { strict: true })!,
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      remplissage: lire.enumeration(p, "remplissage", ["barreaudage", "plein", "vitre"] as const, "barreaudage"),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  "objet-importe"(_etat, p) {
    const m = p["maillage"] as { positions?: unknown; indices?: unknown } | undefined;
    const positions = m?.positions;
    const indices = m?.indices;
    if (!Array.isArray(positions) || positions.length % 3 !== 0 || positions.length > 1_500_000 || !positions.every((v) => typeof v === "number" && Number.isFinite(v))) throw new ErreurCommande("invalide", "maillage.positions", "maillage : coordonnées x, y, z finies attendues (500 000 sommets au plus)");
    const n = positions.length / 3;
    if (!Array.isArray(indices) || indices.length % 3 !== 0 || !indices.every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new ErreurCommande("invalide", "maillage.indices", "maillage : triangles d'indices entiers valides attendus");
    return {
      ifcClasse: lire.chaine(p, "ifcClasse"),
      globalId: lire.chaine(p, "globalId"),
      nom: lire.chaineOuNull(p, "nom"),
      type: lire.chaineOuNull(p, "type"),
      maillage: { positions: positions as number[], indices: indices as number[] },
      empreinte: lire.points(p, "empreinte", { optionnel: true }),
      source: lire.chaineOuNull(p, "source"),
    };
  },
  "bloc-occurrence"(_etat, p) {
    return { position: lire.point(p, "position")!, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, echelle: lire.nombre(p, "echelle", { optionnel: true, min: 0 }) ?? 1, ...(lire.booleen(p, "miroir", false) ? { miroir: true as const } : {}) };
  },
};

/** Renflement d'un mur courbe (D-086) : |b| ≤ 1 ; nul ou absent : mur droit (clé omise). */
function renflementMur(_etat: ModeleAtelier, p: Brut): { renflement?: number } {
  const b = p["renflement"];
  if (b === undefined || b === null || b === 0) return {};
  if (typeof b !== "number" || !Number.isFinite(b) || Math.abs(b) > 1) throw new ErreurCommande("invalide", "renflement", "renflement de mur : nombre entre −1 et 1 (demi-cercle au plus)");
  return { renflement: b };
}

function ouverture(etat: ModeleAtelier, p: Brut): ParamsParClasse["porte"] {
  const murHoteId = lire.chaine(p, "murHoteId");
  const hote = etat.objets[murHoteId];
  if (!hote || hote.classe !== "mur") throw new ErreurCommande("precondition", "murHoteId", `mur hôte introuvable : ${murHoteId}`);
  const position = lire.nombre(p, "position", { min: 0, max: 1 })!;
  const largeur = lire.longueur(p, "largeur", { strict: true })!;
  // Mur courbe (D-095) : position en fraction de la longueur d'arc de l'axe.
  const longueurMur = longueurAxeMur(hote.params);
  const demi = largeur.value / 2 / longueurMur;
  if (position - demi < -1e-9 || position + demi > 1 + 1e-9) throw new ErreurCommande("precondition", "position", "l'emprise de l'ouverture sort du mur hôte");
  return {
    murHoteId,
    position,
    largeur,
    hauteur: lire.longueur(p, "hauteur", { strict: true })!,
    allege: lire.longueur(p, "allege", { optionnel: true }),
    repere: lire.chaineOuNull(p, "repere"),
    ...cintreOuverture(p, largeur.value),
  };
}

/** Haut cintré (D-141) : absent ou null, baie rectangulaire (clé omise). */
function cintreOuverture(p: Brut, largeur: number): { cintre?: Cintre } {
  const hauteur = lire.longueur(p, "hauteur", { strict: true })!.value;
  const c = lireCintre(p["cintre"], largeur, hauteur);
  return c ? { cintre: c } : {};
}

/**
 * Tangentes imposées d'une courbe (D-082) : une entrée par point, `null` = tangente libre (courbe passant par les
 * points) ; vecteur en mètres (direction et intensité). Absent, ou toutes libres : clé omise.
 */
/** Solide associé (D-114) : esquisse source au profil fermé ; absente : solide libre. */
function sourceSolide(etat: ModeleAtelier, p: Brut): { sourceId?: string } {
  const id = p["sourceId"];
  if (id === undefined || id === null) return {};
  if (typeof id !== "string" || !etat.objets[id]) throw new ErreurCommande("precondition", "sourceId", `esquisse source inconnue : ${String(id)}`);
  if (!profilFerme(etat.objets[id]!)) throw new ErreurCommande("precondition", "sourceId", `${id} n'a pas de profil fermé (esquisse fermée, cercle, ellipse, courbe fermée)`);
  return { sourceId: id };
}

/** Hachure associative (D-092) : objet source à contour fermé dont la hachure suit le contour ; absente : libre. */
function sourceHachure(etat: ModeleAtelier, p: Brut, forme: string): { sourceId?: string } {
  const id = p["sourceId"];
  if (id === undefined || id === null) return {};
  if (forme !== "hachure") throw new ErreurCommande("invalide", "sourceId", "objet source réservé aux hachures");
  if (typeof id !== "string" || !etat.objets[id]) throw new ErreurCommande("precondition", "sourceId", `objet source inconnu : ${String(id)}`);
  if (!contourFerme(etat.objets[id]!)) throw new ErreurCommande("precondition", "sourceId", `${id} n'a pas de contour fermé (dalle, pièce, zone, polygone ou rectangle)`);
  return { sourceId: id };
}

/** Axe associé au centre d'un cercle, d'un arc ou d'une ellipse (D-132) : lignes de construction seulement. */
function axeDeDe(etat: ModeleAtelier, p: Brut, forme: string): { axeDe?: { sourceId: string; angle: number; debord: number } } {
  const brut = p["axeDe"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "construction") throw new ErreurCommande("invalide", "axeDe", "axe associé réservé aux lignes de construction");
  const q = brut as Brut;
  const sourceId = lire.chaine(q, "sourceId");
  const s = etat.objets[sourceId];
  if (!s || s.classe !== "esquisse" || !s.params.centre || !s.params.rayon) throw new ErreurCommande("precondition", "axeDe", `${sourceId} : cercle, arc ou ellipse attendu`);
  const angle = q["angle"];
  if (typeof angle !== "number" || !Number.isFinite(angle)) throw new ErreurCommande("invalide", "axeDe.angle", "angle en degrés");
  return { axeDe: { sourceId, angle, debord: lire.nombre(q, "debord", { min: 0, max: 100 })! } };
}

/** Lignes d'un motif importé (D-121) : hachures seulement, une à huit familles (angle, pas en m) ; null les retire. */
function motifLignesDe(p: Brut, forme: string): { motifLignes?: { angle: number; pas: number }[] } {
  const brut = p["motifLignes"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "hachure") throw new ErreurCommande("invalide", "motifLignes", "lignes de motif réservées aux hachures");
  if (!Array.isArray(brut) || brut.length < 1 || brut.length > 8) throw new ErreurCommande("invalide", "motifLignes", "une à huit lignes de motif { angle, pas }");
  return {
    motifLignes: brut.map((x, i) => {
      const q = (x ?? {}) as Brut;
      const angle = q["angle"];
      if (typeof angle !== "number" || !Number.isFinite(angle)) throw new ErreurCommande("invalide", `motifLignes[${i}].angle`, "angle en degrés");
      return { angle, pas: lire.nombre(q, "pas", { min: 1e-5, max: 1000 })! };
    }),
  };
}

/** Dégradé (D-120) : hachures seulement ; deux gris entre 0 (noir) et 1 (blanc) et un angle ; null le retire. */
function degradeDe(p: Brut, forme: string): { degrade?: { de: number; a: number; angle: { value: number; unit: "deg" } } } {
  const brut = p["degrade"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "hachure") throw new ErreurCommande("invalide", "degrade", "dégradé réservé aux hachures");
  if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "degrade", "dégradé : { de, a, angle }");
  const q = brut as Brut;
  const de = lire.nombre(q, "de", { min: 0, max: 1 })!;
  const a = lire.nombre(q, "a", { min: 0, max: 1 })!;
  const angle = lire.angle(q, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" as const };
  return { degrade: { de, a, angle: { value: angle.value, unit: "deg" } } };
}

/** Pente d'une dalle (D-140) : angle de 0 (exclu) à 60°, direction de montée ; null la retire. */
function penteDalle(p: Brut): { pente?: { angle: { value: number; unit: "deg" }; direction: { value: number; unit: "deg" } } } {
  const brut = p["pente"];
  if (brut === undefined || brut === null) return {};
  if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "pente", "pente : { angle, direction }");
  const q = brut as Brut;
  const angle = lire.angle(q, "angle")!;
  if (!(angle.value > 0 && angle.value <= 60)) throw new ErreurCommande("invalide", "pente.angle", "pente entre 0 (exclu) et 60°");
  const direction = lire.angle(q, "direction", { optionnel: true }) ?? { value: 0, unit: "deg" as const };
  return { pente: { angle: { value: angle.value, unit: "deg" }, direction: { value: direction.value, unit: "deg" } } };
}

/** Formes de section des poteaux qui demandent une épaisseur de paroi (D-139). */
export const PROFILES_POTEAU = ["I", "T", "L", "U"];

function tangentesDe(p: Brut, forme: string, n: number): { tangentes?: ({ x: number; y: number } | null)[] } {
  const brut = p["tangentes"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "spline") throw new ErreurCommande("invalide", "tangentes", "tangentes réservées aux courbes (spline)");
  if (!Array.isArray(brut) || brut.length !== n) throw new ErreurCommande("invalide", "tangentes", `une tangente (ou null) par point : ${n} attendue(s)`);
  const t = brut.map((v, i) => {
    if (v === null) return null;
    const q = v as { x?: unknown; y?: unknown };
    if (typeof q.x !== "number" || typeof q.y !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.y)) throw new ErreurCommande("invalide", `tangentes[${i}]`, "vecteur { x, y } en mètres, ou null");
    if (Math.hypot(q.x, q.y) < 1e-9) throw new ErreurCommande("invalide", `tangentes[${i}]`, "tangente nulle : utiliser null (libre)");
    return { x: q.x, y: q.y };
  });
  return t.some((x) => x !== null) ? { tangentes: t } : {};
}

export function validerParams<C extends Classe>(etat: ModeleAtelier, classe: C, params: Brut): ParamsParClasse[C] {
  return VALIDATEURS[classe](etat, params);
}
