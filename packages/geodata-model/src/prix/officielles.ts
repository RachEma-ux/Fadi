/**
 * Lignes d'un fichier de valeurs immobilières de référence officielles (Concept Prix v1.1 §3, Plan §5 et §6 « Import
 * preview and commit »). Logique pure : lecture d'une ligne (colonnes documentées ci-dessous), contrôle de sa forme et
 * motifs de refus codés ; aucune base, aucune donnée embarquée (D-GD-29).
 *
 * Une valeur officielle est enregistrée **sans transformation** sous l'une de ses formes (unique, fourchette, couple
 * terrain + construction, conditionnelle), toujours avec son texte d'origine. Les nombres suivent la règle unique de
 * lecture des montants (`lireNombreObservation`). La zone garde son identifiant d'origine ; sa géométrie, si elle est
 * fournie, doit être en WGS 84 déclaré (aucune reprojection implicite) ; un territoire proposé n'est jamais retenu sans
 * revue (`a-revoir`). La validité de l'édition est déclarée par l'importateur, jamais déduite de la date d'import.
 */
import { lireNombreObservation, uniteCanonique } from "./montants.js";
import { estDateIso } from "./validation.js";
import { estBaseSurface, estTransactionPrix, estTypeBien, type BaseSurface, type EtatBien, type TransactionPrix, type TypeBien } from "./types.js";

/** Colonnes documentées d'un fichier de valeurs officielles (CSV avec en-tête, ou JSON : liste d'objets). */
export const COLONNES_VALEURS_OFFICIELLES = [
  "zone_code", "zone_libelle", "zone_description", "territoire", "geometrie", "crs", "categorie_originale", "type_bien", "etat_bien", "transaction",
  "base_surface", "forme", "valeur", "valeur_min", "valeur_max", "valeur_terrain", "valeur_construction", "condition", "texte_original", "monnaie", "unite",
  "date_debut", "date_fin", "page_ou_ligne",
] as const;
/** Colonnes qui doivent figurer dans l'en-tête (les autres peuvent manquer). */
export const COLONNES_OBLIGATOIRES_OFFICIELLES = ["zone_code", "categorie_originale", "type_bien", "transaction", "base_surface", "forme", "texte_original", "monnaie", "unite", "date_debut"] as const;

/** Systèmes de coordonnées admis pour une géométrie fournie : WGS 84 seulement (aucune reprojection implicite). */
export const CRS_ADMIS_OFFICIELLES = ["EPSG:4326", "CRS84", "OGC:CRS84"] as const;

export const FORMES_VALEUR_OFFICIELLE = ["unique", "fourchette", "terrain-construction", "conditionnelle"] as const;
export type FormeOfficielle = (typeof FORMES_VALEUR_OFFICIELLE)[number];

/** Codes stables des motifs de refus d'une ligne de valeur officielle (quarantaine du lot). */
export const MOTIFS_QUARANTAINE_OFFICIELLE = [
  "zone-absente",
  "zone-sans-description",
  "geometrie-illisible",
  "crs-non-admis",
  "categorie-absente",
  "type-bien-inconnu",
  "etat-bien-inconnu",
  "transaction-inconnue",
  "base-surface-inconnue",
  "forme-inconnue",
  "valeur-illisible",
  "valeur-non-positive",
  "fourchette-inversee",
  "condition-absente",
  "valeurs-en-trop",
  "texte-original-absent",
  "monnaie-inconnue",
  "unite-inconnue",
  "date-invalide",
  "dates-incoherentes",
  // Posé par la chaîne d'import : la même zone (même identifiant d'origine) décrite autrement par une autre ligne du
  // fichier ou par un lot précédent de la même édition ; la première description reste, la ligne attend une revue.
  "zone-incoherente",
] as const;
export type MotifQuarantaineOfficielle = (typeof MOTIFS_QUARANTAINE_OFFICIELLE)[number];

/** Ligne de valeur officielle validée, prête à écrire (montants en nombres décimaux exacts lus du texte). */
export interface ValeurOfficielleLue {
  readonly zone: {
    readonly code: string;
    readonly libelle: string | null;
    readonly description: string | null;
    /** Géométrie GeoJSON (Polygon ou MultiPolygon) en WGS 84, telle que fournie, ou null. */
    readonly geometrie: unknown;
    readonly crs: string | null;
    /** Territoire proposé par le fichier : jamais retenu sans revue. */
    readonly territoirePropose: string | null;
  };
  readonly categorieOriginale: string;
  readonly typeBien: TypeBien;
  readonly etat: EtatBien;
  readonly transaction: TransactionPrix;
  readonly baseSurface: BaseSurface;
  readonly forme: FormeOfficielle;
  readonly valeur: number | null;
  readonly valeurMin: number | null;
  readonly valeurMax: number | null;
  readonly valeurTerrain: number | null;
  readonly valeurConstruction: number | null;
  readonly condition: string | null;
  readonly texteOriginal: string;
  readonly monnaie: string;
  readonly unite: string;
  readonly dateDebut: string;
  readonly dateFin: string | null;
  readonly pageOuLigne: string | null;
}

export type ResultatLigneOfficielle =
  | { readonly ok: true; readonly valeur: ValeurOfficielleLue }
  | { readonly ok: false; readonly motifs: readonly MotifQuarantaineOfficielle[] };

const estForme = (x: string): x is FormeOfficielle => (FORMES_VALEUR_OFFICIELLE as readonly string[]).includes(x);

/** Contrôle d'une ligne lue (texte) ; tous les motifs sont rapportés, dans l'ordre de `MOTIFS_QUARANTAINE_OFFICIELLE`. */
export function lireLigneOfficielle(l: Readonly<Record<string, string>>): ResultatLigneOfficielle {
  const v = (k: (typeof COLONNES_VALEURS_OFFICIELLES)[number]) => (l[k] ?? "").trim();
  const m = new Set<MotifQuarantaineOfficielle>();
  if (!v("zone_code")) m.add("zone-absente");
  let geometrie: unknown = null;
  if (v("geometrie")) {
    try {
      const g = JSON.parse(v("geometrie")) as { type?: unknown; coordinates?: unknown };
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) m.add("geometrie-illisible");
      else geometrie = g;
    } catch { m.add("geometrie-illisible"); }
    if (!(CRS_ADMIS_OFFICIELLES as readonly string[]).includes(v("crs").toUpperCase())) m.add("crs-non-admis");
  }
  if (!v("geometrie") && !v("zone_description")) m.add("zone-sans-description");
  if (!v("categorie_originale")) m.add("categorie-absente");
  const ty = v("type_bien").toLowerCase();
  if (!estTypeBien(ty)) m.add("type-bien-inconnu");
  const et = v("etat_bien").toLowerCase().replace("é", "e");
  if (et && et !== "ancien" && et !== "recent" && et !== "neuf") m.add("etat-bien-inconnu");
  const tr = v("transaction").toLowerCase();
  if (!estTransactionPrix(tr)) m.add("transaction-inconnue");
  const base = v("base_surface").toLowerCase();
  if (!estBaseSurface(base)) m.add("base-surface-inconnue");
  const forme = v("forme").toLowerCase();
  if (!estForme(forme)) m.add("forme-inconnue");

  const nombre = (k: "valeur" | "valeur_min" | "valeur_max" | "valeur_terrain" | "valeur_construction"): number | null => {
    const n = lireNombreObservation(v(k));
    if (n.motif === "illisible") { m.add("valeur-illisible"); return null; }
    if (n.valeur !== null && !(n.valeur > 0)) m.add("valeur-non-positive");
    return n.valeur;
  };
  const valeur = nombre("valeur"), valeurMin = nombre("valeur_min"), valeurMax = nombre("valeur_max");
  const valeurTerrain = nombre("valeur_terrain"), valeurConstruction = nombre("valeur_construction");
  const condition = v("condition") || null;
  // Chaque forme exige ses valeurs et refuse les autres (aucune transformation d'une forme en une autre).
  const attendues: Record<FormeOfficielle, readonly (number | string | null)[]> = {
    unique: [valeur], fourchette: [valeurMin, valeurMax], "terrain-construction": [valeurTerrain, valeurConstruction], conditionnelle: [valeur],
  };
  const toutes = { valeur, valeurMin, valeurMax, valeurTerrain, valeurConstruction };
  const parForme: Record<FormeOfficielle, readonly (keyof typeof toutes)[]> = {
    unique: ["valeur"], fourchette: ["valeurMin", "valeurMax"], "terrain-construction": ["valeurTerrain", "valeurConstruction"], conditionnelle: ["valeur"],
  };
  if (estForme(forme)) {
    if (attendues[forme].some((x) => x === null) && !m.has("valeur-illisible")) m.add("valeur-illisible");
    const enTrop = (Object.keys(toutes) as (keyof typeof toutes)[]).filter((k) => !parForme[forme].includes(k) && toutes[k] !== null);
    if (enTrop.length || (forme !== "conditionnelle" && condition)) m.add("valeurs-en-trop");
    if (forme === "fourchette" && valeurMin !== null && valeurMax !== null && valeurMax < valeurMin) m.add("fourchette-inversee");
    if (forme === "conditionnelle" && !condition) m.add("condition-absente");
  }
  if (!v("texte_original")) m.add("texte-original-absent");
  const monnaie = v("monnaie").toUpperCase();
  if (!/^[A-Z]{3}$/.test(monnaie)) m.add("monnaie-inconnue");
  const unite = uniteCanonique(v("unite"));
  if (!unite || (/^[A-Z]{3}$/.test(monnaie) && !unite.startsWith(monnaie))) m.add("unite-inconnue");
  if (!estDateIso(v("date_debut")) || (v("date_fin") && !estDateIso(v("date_fin")))) m.add("date-invalide");
  else if (v("date_fin") && v("date_fin") < v("date_debut")) m.add("dates-incoherentes");

  if (m.size) return { ok: false, motifs: MOTIFS_QUARANTAINE_OFFICIELLE.filter((x) => m.has(x)) };
  return {
    ok: true,
    valeur: {
      zone: {
        code: v("zone_code"), libelle: v("zone_libelle") || null, description: v("zone_description") || null, geometrie,
        crs: geometrie ? v("crs").toUpperCase() : null, territoirePropose: v("territoire") || null,
      },
      categorieOriginale: v("categorie_originale"), typeBien: ty as TypeBien, etat: (et || null) as EtatBien, transaction: tr as TransactionPrix,
      baseSurface: base as BaseSurface, forme: forme as FormeOfficielle, valeur: forme === "unique" || forme === "conditionnelle" ? valeur : null,
      valeurMin, valeurMax, valeurTerrain, valeurConstruction, condition, texteOriginal: v("texte_original"), monnaie, unite: unite!,
      dateDebut: v("date_debut"), dateFin: v("date_fin") || null, pageOuLigne: v("page_ou_ligne") || null,
    },
  };
}
