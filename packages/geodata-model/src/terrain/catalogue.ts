/**
 * Terrain haute résolution — catalogue et import contrôlé (plan v1.0, lot TER-02, Issue #381). Logique pure, partagée par
 * l'API et ses commandes : déclaration d'un jeu d'altitudes (fiche), cycle de vie d'une version, contrôle d'un en-tête
 * raster contre sa déclaration, levée de quarantaine, clé d'idempotence, quota. Aucun accès au disque, au réseau ni au DOM.
 *
 * Règles (plan § TER-02, décisions TER-D1 à TER-D18 du 2 novembre 2026) :
 *  - une référence verticale inconnue met la version en **quarantaine** ; rien n'est deviné ni réétiqueté (une hauteur
 *    ellipsoïdale n'est jamais présentée comme orthométrique) ; seule une décision consignée la lève (TER-D13) ;
 *  - un fichier mal formé est **rejeté** ; un écart entre fichier et déclaration (repère, pas, NoData, unités) le met en
 *    quarantaine — la déclaration ne corrige jamais le fichier ;
 *  - MNT et MNS sont deux produits distincts, jamais fusionnés (TER-D16) ;
 *  - un jeu de démonstration (Lucerne) ou synthétique porte une étiquette obligatoire et ne représente aucun site réel.
 */
import { lireDroits, USAGES, type DroitsVersion } from "../droits.js";

/** Niveaux du catalogue multi-résolution (TER-D16). */
export const NIVEAUX_TERRAIN = ["mondial", "regional-officiel", "leve-local"] as const;
export type NiveauTerrain = (typeof NIVEAUX_TERRAIN)[number];

/** MNT : terrain nu ; MNS : surface (bâti, végétation). Jamais l'un pour l'autre. */
export const PRODUITS_TERRAIN = ["MNT", "MNS"] as const;
export type ProduitTerrain = (typeof PRODUITS_TERRAIN)[number];

/**
 * Cycle de vie du plan (TER-D12) : déposé → validation → rejeté | quarantaine | traitement → revue → accepté → publié →
 * remplacé | retiré. Une version ne revient jamais en arrière, sauf le retour arrière du plan (une version remplacée est
 * republiée : TER-04) ; « rejeté » et « retiré » sont terminaux.
 */
export const ETATS_TERRAIN = ["depose", "validation", "rejete", "quarantaine", "traitement", "revue", "accepte", "publie", "remplace", "retire"] as const;
export type EtatTerrain = (typeof ETATS_TERRAIN)[number];

export const TRANSITIONS_TERRAIN: Readonly<Record<EtatTerrain, readonly EtatTerrain[]>> = {
  depose: ["validation"],
  validation: ["rejete", "quarantaine", "traitement"],
  rejete: [],
  quarantaine: ["traitement", "retire"],
  traitement: ["revue", "quarantaine", "rejete"],
  revue: ["accepte", "quarantaine", "retire"],
  accepte: ["publie", "retire"],
  publie: ["remplace", "retire"],
  // Retour arrière (plan § Verification, TER-04) : une version remplacée peut être republiée ; l'actuelle devient remplacée.
  remplace: ["publie", "retire"],
  retire: [],
};

export const LIBELLES_ETATS_TERRAIN: Readonly<Record<EtatTerrain, string>> = {
  depose: "Déposé",
  validation: "En validation",
  rejete: "Rejeté",
  quarantaine: "En quarantaine",
  traitement: "Prêt au traitement",
  revue: "En attente de revue",
  accepte: "Accepté",
  publie: "Publié",
  remplace: "Remplacé",
  retire: "Retiré",
};

export const transitionAdmise = (de: EtatTerrain, vers: EtatTerrain): boolean => TRANSITIONS_TERRAIN[de].includes(vers);
export const estEtatTerrain = (x: unknown): x is EtatTerrain => typeof x === "string" && (ETATS_TERRAIN as readonly string[]).includes(x);

/**
 * Référence verticale **telle que lue** : déclarée (par le fichier, ou par la documentation du producteur avec sa
 * source), ou non déclarée — un indice (nom de fichier…) est conservé comme tel, jamais promu en déclaration.
 */
export type ReferenceVerticale =
  | { readonly statut: "declaree"; readonly code: string | null; readonly libelle: string; readonly origine: "fichier" | "documentation" | "decision"; readonly source: string }
  | { readonly statut: "non-declaree"; readonly indice: string | null };

export type UnitePas = "m" | "deg" | "arcsec";
export interface PasDeGrille { readonly valeur: number; readonly unite: UnitePas }

export interface PrecisionDeclaree {
  /** Texte du producteur, tel quel (« LE90 < 4 m »…). */
  readonly texte: string;
  /** Valeur verticale en mètres si le producteur en donne une, sinon null (« non évaluée »). */
  readonly verticaleM: number | null;
  readonly source: string;
}

/** Comment l'original arrive dans le dépôt : fichier téléchargé tel quel, extrait de fenêtre d'un COG, ou dépôt manuel. */
export type Acquisition =
  | { readonly methode: "telechargement"; readonly url: string; readonly empreinte: string }
  | { readonly methode: "fenetre"; readonly url: string; readonly fenetre: { readonly ouest: number; readonly sud: number; readonly est: number; readonly nord: number }; readonly empreinte: string | null }
  | { readonly methode: "depot" };

/** Fiche d'un jeu d'altitudes (une version d'un produit), relue avant tout import. */
export interface DeclarationTerrain {
  readonly cle: string;
  readonly titre: string;
  readonly producteur: string;
  readonly niveau: NiveauTerrain;
  readonly produit: ProduitTerrain;
  /** Étiquette affichée avec chaque valeur (« Données suisses de démonstration… », « test seulement »), ou null. */
  readonly etiquette: string | null;
  readonly demonstration: boolean;
  readonly synthetique: boolean;
  readonly licence: { readonly nom: string; readonly url: string | null };
  readonly attribution: string;
  readonly droits: DroitsVersion;
  readonly version: { readonly libelle: string; readonly doi: string | null; readonly date: string | null; readonly url: string | null };
  readonly acquisition: Acquisition;
  readonly fichier: { readonly nom: string; readonly format: "GeoTIFF" };
  readonly crsHorizontal: string;
  readonly referenceVerticale: ReferenceVerticale;
  readonly uniteVerticale: "m";
  readonly pasNatif: PasDeGrille;
  readonly nodata: number | null;
  readonly precisionDeclaree: PrecisionDeclaree | null;
}

const CLE = /^[a-z0-9][a-z0-9-]{2,79}$/;
const NOM_FICHIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(tif|tiff)$/;
const CRS = /^EPSG:\d{4,6}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const texte = (x: unknown, min = 1, max = 500): x is string => typeof x === "string" && x.trim().length >= min && x.length <= max;
const nul = <T>(x: unknown, f: (y: unknown) => y is T): x is T | null => x === null || f(x);
const nombre = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const urlHttps = (x: unknown): x is string => {
  if (typeof x !== "string") return false;
  try { return new URL(x).protocol === "https:"; } catch { return false; }
};

export type ResultatDeclaration = { readonly ok: true; readonly declaration: DeclarationTerrain } | { readonly ok: false; readonly erreurs: readonly string[] };

function lireReference(x: unknown, erreurs: string[]): ReferenceVerticale | null {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!o) { erreurs.push("referenceVerticale : objet attendu"); return null; }
  if (o["statut"] === "non-declaree") {
    if (!nul(o["indice"], (y): y is string => texte(y))) erreurs.push("referenceVerticale.indice : texte ou null");
    return { statut: "non-declaree", indice: (o["indice"] as string | null) ?? null };
  }
  if (o["statut"] === "declaree") {
    if (!nul(o["code"], (y): y is string => typeof y === "string" && CRS.test(y))) erreurs.push("referenceVerticale.code : EPSG:nnnn ou null");
    if (!texte(o["libelle"], 2)) erreurs.push("referenceVerticale.libelle : texte requis");
    if (o["origine"] !== "fichier" && o["origine"] !== "documentation") erreurs.push("referenceVerticale.origine : « fichier » ou « documentation » (une décision se consigne par la levée de quarantaine)");
    if (!texte(o["source"], 5)) erreurs.push("referenceVerticale.source : où la référence est déclarée (adresse ou document)");
    return { statut: "declaree", code: (o["code"] as string | null) ?? null, libelle: String(o["libelle"] ?? ""), origine: o["origine"] as "fichier" | "documentation", source: String(o["source"] ?? "") };
  }
  erreurs.push("referenceVerticale.statut : « declaree » ou « non-declaree »");
  return null;
}

function lireAcquisition(x: unknown, erreurs: string[]): Acquisition | null {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!o) { erreurs.push("acquisition : objet attendu"); return null; }
  if (o["methode"] === "depot") return { methode: "depot" };
  if (o["methode"] === "telechargement") {
    if (!urlHttps(o["url"])) erreurs.push("acquisition.url : adresse https requise");
    if (typeof o["empreinte"] !== "string" || !SHA256.test(o["empreinte"])) erreurs.push("acquisition.empreinte : SHA-256 de l'original requis (64 hexadécimaux)");
    return { methode: "telechargement", url: String(o["url"]), empreinte: String(o["empreinte"]) };
  }
  if (o["methode"] === "fenetre") {
    if (!urlHttps(o["url"])) erreurs.push("acquisition.url : adresse https requise");
    const f = o["fenetre"] && typeof o["fenetre"] === "object" ? (o["fenetre"] as Record<string, unknown>) : {};
    const [w, s, e, n] = [f["ouest"], f["sud"], f["est"], f["nord"]];
    if (![w, s, e, n].every(nombre) || !((e as number) > (w as number) && (n as number) > (s as number))) erreurs.push("acquisition.fenetre : ouest < est et sud < nord, en nombres");
    if (!nul(o["empreinte"], (y): y is string => typeof y === "string" && SHA256.test(y))) erreurs.push("acquisition.empreinte : SHA-256 ou null");
    return { methode: "fenetre", url: String(o["url"]), fenetre: { ouest: w as number, sud: s as number, est: e as number, nord: n as number }, empreinte: (o["empreinte"] as string | null) ?? null };
  }
  erreurs.push("acquisition.methode : « telechargement », « fenetre » ou « depot »");
  return null;
}

/** Valide une fiche de jeu d'altitudes ; toute incohérence est une erreur (rien n'est complété par défaut). */
export function validerDeclarationTerrain(x: unknown): ResultatDeclaration {
  const erreurs: string[] = [];
  const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  if (!o) return { ok: false, erreurs: ["fiche : objet JSON attendu"] };
  if (typeof o["cle"] !== "string" || !CLE.test(o["cle"])) erreurs.push("cle : minuscules, chiffres et tirets (3 à 80)");
  if (!texte(o["titre"], 3)) erreurs.push("titre : requis");
  if (!texte(o["producteur"], 2)) erreurs.push("producteur : requis");
  if (!(NIVEAUX_TERRAIN as readonly unknown[]).includes(o["niveau"])) erreurs.push(`niveau : ${NIVEAUX_TERRAIN.join(", ")}`);
  if (!(PRODUITS_TERRAIN as readonly unknown[]).includes(o["produit"])) erreurs.push("produit : MNT ou MNS");
  if (typeof o["demonstration"] !== "boolean") erreurs.push("demonstration : booléen");
  if (typeof o["synthetique"] !== "boolean") erreurs.push("synthetique : booléen");
  if (!nul(o["etiquette"], (y): y is string => texte(y, 5))) erreurs.push("etiquette : texte ou null");
  const etiquette = typeof o["etiquette"] === "string" ? o["etiquette"] : null;
  if (o["demonstration"] === true && !etiquette) erreurs.push("etiquette : obligatoire pour un jeu de démonstration (il ne représente aucun site réel)");
  if (o["synthetique"] === true && !(etiquette ?? "").toLowerCase().includes("test seulement")) erreurs.push("etiquette : un jeu synthétique est étiqueté « test seulement »");
  const lic = o["licence"] && typeof o["licence"] === "object" ? (o["licence"] as Record<string, unknown>) : {};
  if (!texte(lic["nom"], 2)) erreurs.push("licence.nom : requis");
  if (!nul(lic["url"], urlHttps)) erreurs.push("licence.url : https ou null");
  if (!texte(o["attribution"], 3, 1000)) erreurs.push("attribution : texte requis (affiché et exporté)");
  const droitsLus = o["droits"] && typeof o["droits"] === "object" ? (o["droits"] as Record<string, unknown>) : {};
  for (const u of USAGES) if (!["autorise", "refuse", "inconnu"].includes(droitsLus[u] as string)) erreurs.push(`droits.${u} : autorise, refuse ou inconnu`);
  const v = o["version"] && typeof o["version"] === "object" ? (o["version"] as Record<string, unknown>) : {};
  if (!texte(v["libelle"], 1, 200)) erreurs.push("version.libelle : requis");
  if (!nul(v["doi"], (y): y is string => texte(y, 5, 200))) erreurs.push("version.doi : texte ou null");
  if (!nul(v["date"], (y): y is string => texte(y, 4, 200))) erreurs.push("version.date : date de levé ou de version, ou null");
  if (!nul(v["url"], urlHttps)) erreurs.push("version.url : https ou null");
  const acquisition = lireAcquisition(o["acquisition"], erreurs);
  const f = o["fichier"] && typeof o["fichier"] === "object" ? (o["fichier"] as Record<string, unknown>) : {};
  if (typeof f["nom"] !== "string" || !NOM_FICHIER.test(f["nom"])) erreurs.push("fichier.nom : nom simple en .tif / .tiff (aucun chemin)");
  if (f["format"] !== "GeoTIFF") erreurs.push("fichier.format : GeoTIFF (seul format de ce lot)");
  if (typeof o["crsHorizontal"] !== "string" || !CRS.test(o["crsHorizontal"])) erreurs.push("crsHorizontal : EPSG:nnnn");
  const referenceVerticale = lireReference(o["referenceVerticale"], erreurs);
  if (o["uniteVerticale"] !== "m") erreurs.push("uniteVerticale : m (toute autre unité est refusée, aucune conversion)");
  const p = o["pasNatif"] && typeof o["pasNatif"] === "object" ? (o["pasNatif"] as Record<string, unknown>) : {};
  if (!nombre(p["valeur"]) || (p["valeur"] as number) <= 0) erreurs.push("pasNatif.valeur : nombre > 0");
  if (!["m", "deg", "arcsec"].includes(p["unite"] as string)) erreurs.push("pasNatif.unite : m, deg ou arcsec");
  if (!nul(o["nodata"], nombre)) erreurs.push("nodata : nombre ou null");
  let precisionDeclaree: PrecisionDeclaree | null = null;
  if (o["precisionDeclaree"] !== null) {
    const q = o["precisionDeclaree"] && typeof o["precisionDeclaree"] === "object" ? (o["precisionDeclaree"] as Record<string, unknown>) : null;
    if (!q || !texte(q["texte"], 2) || !texte(q["source"], 5) || !nul(q["verticaleM"], nombre)) erreurs.push("precisionDeclaree : { texte, verticaleM (nombre ou null), source } ou null");
    else precisionDeclaree = { texte: q["texte"] as string, verticaleM: (q["verticaleM"] as number | null) ?? null, source: q["source"] as string };
  }
  if (erreurs.length || !acquisition || !referenceVerticale) return { ok: false, erreurs };
  return {
    ok: true,
    declaration: {
      cle: o["cle"] as string, titre: o["titre"] as string, producteur: o["producteur"] as string,
      niveau: o["niveau"] as NiveauTerrain, produit: o["produit"] as ProduitTerrain, etiquette,
      demonstration: o["demonstration"] as boolean, synthetique: o["synthetique"] as boolean,
      licence: { nom: lic["nom"] as string, url: (lic["url"] as string | null) ?? null }, attribution: o["attribution"] as string,
      droits: lireDroits(droitsLus),
      version: { libelle: v["libelle"] as string, doi: (v["doi"] as string | null) ?? null, date: (v["date"] as string | null) ?? null, url: (v["url"] as string | null) ?? null },
      acquisition, fichier: { nom: f["nom"] as string, format: "GeoTIFF" }, crsHorizontal: o["crsHorizontal"] as string,
      referenceVerticale, uniteVerticale: "m", pasNatif: { valeur: p["valeur"] as number, unite: p["unite"] as UnitePas },
      nodata: (o["nodata"] as number | null) ?? null, precisionDeclaree,
    },
  };
}

/** En-tête lu dans le fichier (sans lire les valeurs) : ce que le fichier dit de lui-même. */
export interface EnTeteRaster {
  readonly format: "GeoTIFF";
  readonly largeur: number;
  readonly hauteur: number;
  /** « EPSG:nnnn » lu dans les clés, ou null si le fichier n'est pas géoréférencé par un code. */
  readonly crsHorizontal: string | null;
  readonly geographique: boolean;
  /** Code de la clé `VerticalCSTypeGeoKey`, ou null (absente). */
  readonly verticalEpsg: number | null;
  /** Code de la clé `VerticalUnitsGeoKey`, ou null. 9001 = mètre. */
  readonly uniteVerticaleEpsg: number | null;
  /** Unité linéaire des coordonnées projetées (`ProjLinearUnitsGeoKey`), null pour un repère géographique ou si absente. */
  readonly uniteHorizontaleEpsg: number | null;
  /** Pas en x et y, dans l'unité du repère (degrés ou mètres), valeurs absolues. */
  readonly pas: readonly [number, number];
  /** [ouest, sud, est, nord] dans le repère du fichier. */
  readonly bornes: readonly [number, number, number, number];
  readonly nodata: number | null;
  readonly typeEchantillon: "flottant" | "entier" | "entier-non-signe";
  readonly bits: number;
  /** `GTRasterTypeGeoKey` : 1 = aire, 2 = point ; null si absente. */
  readonly pixel: "aire" | "point" | null;
}

export type CodeMotif =
  | "dimensions" | "trop-grand" | "georeference-absente" | "bornes" | "pas-invalide" | "echantillon"
  | "crs-different" | "unite-horizontale" | "reference-verticale-inconnue" | "datum-incompatible" | "unite-verticale"
  | "nodata-different" | "nodata-inconnu" | "pas-different";
export interface Motif { readonly code: CodeMotif; readonly gravite: "rejet" | "quarantaine"; readonly message: string }

export interface VerdictControle {
  readonly etat: "rejete" | "quarantaine" | "traitement";
  readonly motifs: readonly Motif[];
  /** Référence verticale retenue pour la version (déclarée ou non) — jamais devinée. */
  readonly referenceVerticale: ReferenceVerticale;
  readonly nodata: number | null;
  readonly cellules: number;
}

/** Limites d'exploitation (TER-D14) ; le quota disque est une configuration (TER-D7). */
export const LIMITES_TERRAIN = Object.freeze({
  /** Taille d'un fichier importé. */
  octetsFichier: 4 * 1024 ** 3,
  /** Cellules d'une grille importée (≈ 10 km² à 25 cm avec marge). */
  cellules: 400_000_000,
  /** Quota par défaut du volume terrain (TER-D7 : 60 Go). */
  quotaOctets: 60 * 1000 ** 3,
});

/** Pas déclaré exprimé dans l'unité du repère du fichier (conversion d'unités seulement : arcsec ↔ deg). */
export function pasDansLeRepere(p: PasDeGrille, geographique: boolean): number | null {
  if (geographique) return p.unite === "deg" ? p.valeur : p.unite === "arcsec" ? p.valeur / 3600 : null;
  return p.unite === "m" ? p.valeur : null;
}

const egaux = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-6);

/**
 * Contrôle l'en-tête d'un fichier contre sa déclaration. Rejet : fichier inexploitable. Quarantaine : écart ou inconnue
 * qu'une personne doit trancher. Sinon : prêt au traitement (TER-03). Aucune valeur n'est corrigée.
 */
export function controlerTerrain(e: EnTeteRaster, d: DeclarationTerrain, limites: { readonly cellules: number } = LIMITES_TERRAIN): VerdictControle {
  const motifs: Motif[] = [];
  const rejet = (code: CodeMotif, message: string) => motifs.push({ code, gravite: "rejet", message });
  const quarantaine = (code: CodeMotif, message: string) => motifs.push({ code, gravite: "quarantaine", message });
  const cellules = e.largeur * e.hauteur;
  if (!(Number.isInteger(e.largeur) && Number.isInteger(e.hauteur) && e.largeur > 0 && e.hauteur > 0)) rejet("dimensions", "Dimensions de la grille invalides.");
  else if (cellules > limites.cellules) rejet("trop-grand", `Grille de ${cellules} cellules : au-delà de la limite de ${limites.cellules}.`);
  if (!e.crsHorizontal) rejet("georeference-absente", "Le fichier ne déclare aucun système de coordonnées par un code EPSG : aucun repère n'est deviné.");
  if (!(e.pas[0] > 0 && e.pas[1] > 0 && Number.isFinite(e.pas[0]) && Number.isFinite(e.pas[1]))) rejet("pas-invalide", "Pas de grille illisible ou nul.");
  const [o, s, es, n] = e.bornes;
  if (![o, s, es, n].every(Number.isFinite) || !(es > o && n > s) || (e.geographique && !(o >= -180.01 && es <= 180.01 && s >= -90.01 && n <= 90.01))) rejet("bornes", "Emprise du fichier incohérente avec son repère.");
  if (e.typeEchantillon !== "flottant" && e.typeEchantillon !== "entier") rejet("echantillon", "Valeurs d'altitude non signées ou d'un type non pris en charge : altitude sous zéro impossible à représenter.");

  if (e.crsHorizontal && e.crsHorizontal !== d.crsHorizontal) quarantaine("crs-different", `Repère du fichier ${e.crsHorizontal} différent de la déclaration ${d.crsHorizontal}.`);
  if (!e.geographique && e.uniteHorizontaleEpsg !== null && e.uniteHorizontaleEpsg !== 9001) quarantaine("unite-horizontale", `Unité horizontale EPSG:${e.uniteHorizontaleEpsg} : le mètre est attendu pour un repère projeté.`);

  // Référence verticale : jamais devinée, jamais réétiquetée.
  let referenceVerticale: ReferenceVerticale = d.referenceVerticale;
  const codeFichier = e.verticalEpsg !== null ? `EPSG:${e.verticalEpsg}` : null;
  if (codeFichier) {
    if (d.referenceVerticale.statut === "declaree" && d.referenceVerticale.code && d.referenceVerticale.code !== codeFichier) {
      quarantaine("datum-incompatible", `Référence verticale du fichier ${codeFichier} différente de celle déclarée ${d.referenceVerticale.code} : aucune conversion sans transformation approuvée.`);
    } else if (d.referenceVerticale.statut !== "declaree" || d.referenceVerticale.origine !== "documentation") {
      referenceVerticale = { statut: "declaree", code: codeFichier, libelle: d.referenceVerticale.statut === "declaree" ? d.referenceVerticale.libelle : codeFichier, origine: "fichier", source: "clé VerticalCSTypeGeoKey du fichier" };
    }
  } else if (d.referenceVerticale.statut === "non-declaree") {
    quarantaine("reference-verticale-inconnue", `Référence verticale non déclarée (ni par le fichier, ni par la documentation du producteur)${d.referenceVerticale.indice ? ` — indice relevé : ${d.referenceVerticale.indice}` : ""}. La version reste en quarantaine jusqu'à une décision consignée.`);
  }
  if (e.uniteVerticaleEpsg !== null && e.uniteVerticaleEpsg !== 9001) quarantaine("unite-verticale", `Unité verticale EPSG:${e.uniteVerticaleEpsg} : le mètre est attendu, aucune conversion n'est faite.`);

  // NoData : distinct de zéro, jamais supposé.
  let nodata = e.nodata;
  if (e.nodata !== null && d.nodata !== null && !Object.is(e.nodata, d.nodata) && e.nodata !== d.nodata) quarantaine("nodata-different", `NoData du fichier (${e.nodata}) différent de la déclaration (${d.nodata}).`);
  if (e.nodata === null && d.nodata === null) quarantaine("nodata-inconnu", "Aucune valeur NoData déclarée (fichier ni fiche) : les cellules sans mesure ne peuvent être distinguées.");
  if (e.nodata === null && d.nodata !== null) nodata = d.nodata;

  const pasDeclare = pasDansLeRepere(d.pasNatif, e.geographique);
  if (pasDeclare === null) quarantaine("pas-different", `Pas déclaré en ${d.pasNatif.unite} pour un repère ${e.geographique ? "géographique" : "projeté"}.`);
  else if (e.pas[0] > 0 && (!egaux(e.pas[0], pasDeclare) || !egaux(e.pas[1], pasDeclare))) quarantaine("pas-different", `Pas du fichier ${e.pas[0]} × ${e.pas[1]} différent du pas déclaré ${pasDeclare} : aucun rééchantillonnage ne change la qualité.`);

  const etat = motifs.some((m) => m.gravite === "rejet") ? "rejete" : motifs.length ? "quarantaine" : "traitement";
  return { etat, motifs, referenceVerticale, nodata, cellules };
}

/** Décision de levée de quarantaine (TER-D13) : un responsable de publication, une référence verticale sourcée, un motif. */
export interface DecisionLevee {
  readonly referenceVerticale: { readonly code: string | null; readonly libelle: string; readonly source: string } | null;
  readonly motif: string;
}

/**
 * Une quarantaine ne se lève que sur décision consignée, motif par motif : une référence verticale inconnue exige une
 * référence **déclarée avec sa source** ; les autres écarts exigent un motif écrit. Renvoie les erreurs (vide = admise).
 */
export function controlerLevee(motifs: readonly Motif[], d: DecisionLevee): string[] {
  const erreurs: string[] = [];
  if (!texte(d.motif, 10, 2000)) erreurs.push("Motif écrit requis (10 caractères au moins).");
  if (motifs.some((m) => m.gravite === "rejet")) erreurs.push("Une version rejetée ne sort pas de son état : déposer un nouveau fichier.");
  if (motifs.some((m) => m.code === "reference-verticale-inconnue")) {
    const r = d.referenceVerticale;
    if (!r || !texte(r.libelle, 2) || !texte(r.source, 5) || (r.code !== null && !CRS.test(r.code))) erreurs.push("Référence verticale inconnue : la décision doit déclarer la référence (libellé, code EPSG ou null) et la source qui l'établit.");
  }
  return erreurs;
}

/** Texte canoniqueTerrain (clés triées) d'une valeur JSON : base de la clé d'idempotence. */
export function canoniqueTerrain(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canoniqueTerrain).join(",")}]`;
  return `{${Object.keys(x as object).sort().map((k) => `${JSON.stringify(k)}:${canoniqueTerrain((x as Record<string, unknown>)[k])}`).join(",")}}`;
}

/** Texte dont l'empreinte SHA-256 identifie un traitement : empreinte(s) d'entrée + configuration (plan § TER-02). */
export const texteIdempotence = (type: string, empreintes: readonly string[], configuration: unknown): string =>
  canoniqueTerrain({ type, entrees: [...empreintes].sort(), configuration });

export type VerdictQuota = { readonly ok: true; readonly reste: number } | { readonly ok: false; readonly motif: string };
/** Quota du volume terrain (TER-D7) : un import qui le dépasserait est refusé, rien n'est écrasé ni effacé. */
export function verifierQuota(utilise: number, ajout: number, quota: number): VerdictQuota {
  if (!(quota > 0)) return { ok: false, motif: "Quota du stockage terrain non configuré." };
  if (utilise + ajout > quota) return { ok: false, motif: `Quota du stockage terrain dépassé : ${utilise + ajout} octets pour ${quota} autorisés.` };
  return { ok: true, reste: quota - utilise - ajout };
}
