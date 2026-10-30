/**
 * Agrégats publiés par un tiers (Concept §4, Plan §5) — ex. le baromètre FeenWay : valeurs conservées **telles que
 * publiées** (méthode, période, unités et effectifs de l'éditeur ; effectifs = annonces, pas biens distincts), marquées
 * approximatives quand l'éditeur abrège les montants. Jamais recalculées, jamais fusionnées avec les médianes calculées
 * par Fadi, jamais présentées comme une statistique de biens distincts.
 *
 * Ce module lit un jeu de lignes CSV déjà découpé (`lireCsv`) : aucune donnée n'est embarquée (D-GD-29). Il ne porte
 * aucun libellé d'interface : seulement des codes stables (erreurs, niveaux, natures) que l'interface traduit.
 */
import { parserMontant, uniteCanonique, versCentimes } from "./montants.js";
import { estDateIso } from "./validation.js";
import type { ValeurMarche } from "./comparaison.js";
import { comparerTexte, type TransactionPrix, type TypeBien } from "./types.js";

/** Nature d'un agrégat publié : produit distinct de la couche des annonces, issu d'une source unique dérivée. */
export const NATURE_AGREGAT_PUBLIE = "agregat-publie" as const;

export type NiveauGeoAgregat = "ville" | "quartier-commercial";

/** Montant publié : valeur numérique de l'éditeur, texte affiché d'origine et indicateur d'abréviation. */
export interface MontantPublie {
  readonly valeur: number;
  readonly centimes: number;
  readonly approximatif: boolean;
  readonly texteOriginal: string;
}

export interface AgregatPublie {
  readonly editeur: string;
  readonly edition: string;
  /** Numéro de ligne dans le fichier (1 = première ligne de données). */
  readonly ligne: number;
  readonly ville: string;
  readonly niveauGeo: NiveauGeoAgregat;
  /** Libellé géographique de l'éditeur (ville ou quartier commercial), conservé tel quel. */
  readonly libelleGeo: string;
  readonly typeBien: TypeBien;
  readonly typeBienOriginal: string;
  readonly transaction: TransactionPrix;
  /** Nombre d'annonces déclaré par l'éditeur (annonces, pas biens distincts). */
  readonly nombreAnnonces: number;
  readonly prixMedian: MontantPublie | null;
  readonly prixMedianM2: MontantPublie | null;
  /** Unité du prix médian (`MAD` ou `MAD/mois`). */
  readonly unite: string;
  /** Unité du prix médian au m² (`MAD/m2` ou `MAD/m2/mois`). */
  readonly uniteM2: string;
  /** Tendance sur 90 jours en pour cent, telle que publiée ; null si non publiée. */
  readonly tendance90j: number | null;
  readonly periode: { readonly debut: string; readonly fin: string };
  readonly source: string;
  readonly sourceUrl: string;
  readonly licence: string;
}

/** En-tête du baromètre FeenWay tel qu'archivé dans le dépôt de sources. */
export const ENTETES_FEENWAY = [
  "city", "geographic_level", "zone", "property_type", "transaction", "listing_count",
  "median_price_display", "median_price_numeric", "median_price_is_abbreviated",
  "median_unit_price_display", "median_unit_price_numeric", "price_unit", "area_price_unit",
  "trend_90d_pct", "source", "source_url", "data_period", "license_as_declared",
] as const;

/** Colonnes dont la valeur est obligatoire sur chaque ligne. */
const OBLIGATOIRES = ["city", "geographic_level", "zone", "property_type", "transaction", "listing_count", "price_unit", "area_price_unit", "source", "data_period"] as const;

/** Correspondance des types de biens FeenWay (clé normalisée en minuscules) vers les types Fadi. */
export const CORRESPONDANCE_TYPES_FEENWAY: Readonly<Record<string, TypeBien>> = {
  appartement: "appartement", appartements: "appartement",
  villa: "villa", villas: "villa",
  "local commercial": "local-commercial", "locaux commerciaux": "local-commercial",
  terrain: "terrain", terrains: "terrain",
  bureau: "bureau", bureaux: "bureau",
  maison: "maison", maisons: "maison",
  studio: "studio", studios: "studio",
  immeuble: "immeuble", immeubles: "immeuble",
  ferme: "ferme", fermes: "ferme",
};

export const CORRESPONDANCE_TRANSACTIONS_FEENWAY: Readonly<Record<string, TransactionPrix>> = { SALE: "vente", RENT: "location" };
export const CORRESPONDANCE_NIVEAUX_FEENWAY: Readonly<Record<string, NiveauGeoAgregat>> = { city: "ville", neighborhood: "quartier-commercial" };

/** Unités attendues selon la transaction : (prix médian, prix médian au m²). */
export const UNITES_ATTENDUES: Readonly<Record<TransactionPrix, { readonly unite: string; readonly uniteM2: string }>> = {
  vente: { unite: "MAD", uniteM2: "MAD/m2" },
  location: { unite: "MAD/mois", uniteM2: "MAD/m2/mois" },
};

export const CODES_ERREUR_AGREGAT = [
  "colonne-manquante",
  "valeur-obligatoire-absente",
  "niveau-inconnu",
  "type-bien-inconnu",
  "transaction-inconnue",
  "compte-non-entier",
  "compte-negatif",
  "montant-illisible",
  "montant-negatif",
  "abreviation-illisible",
  "affichage-incoherent",
  "unite-inconnue",
  "unite-incoherente",
  "tendance-illisible",
  "periode-illisible",
  "ligne-en-double",
] as const;
export type CodeErreurAgregat = (typeof CODES_ERREUR_AGREGAT)[number];

export interface ErreurAgregat {
  /** Numéro de ligne de données (1 = première), ou 0 pour une erreur d'en-tête. */
  readonly ligne: number;
  readonly colonne: string | null;
  readonly code: CodeErreurAgregat;
}

export interface ResultatLectureAgregats {
  /** Lignes valides, dans l'ordre du fichier. */
  readonly agregats: readonly AgregatPublie[];
  /** Erreurs : une ligne en erreur n'est jamais retenue. */
  readonly erreurs: readonly ErreurAgregat[];
  /** Nombre de lignes lues. */
  readonly lignesLues: number;
}

/** Montant publié à partir du nombre de l'éditeur, du texte affiché et de l'indicateur d'abréviation. */
function lireMontantPublie(
  numerique: string, affiche: string, abrege: string | null, ligne: number, colonne: string, erreurs: ErreurAgregat[],
): MontantPublie | null {
  const n = numerique.trim();
  if (!n) {
    // Sans nombre : le texte affiché doit lui aussi être absent (« — », vide) ; jamais 0.
    if (parserMontant(affiche).valeur !== null) erreurs.push({ ligne, colonne, code: "affichage-incoherent" });
    return null;
  }
  if (/^-/.test(n)) { erreurs.push({ ligne, colonne, code: "montant-negatif" }); return null; }
  const centimes = versCentimes(n);
  if (centimes === null) { erreurs.push({ ligne, colonne, code: "montant-illisible" }); return null; }
  const lu = parserMontant(affiche);
  let approximatif = lu.approximatif;
  if (abrege !== null) {
    const a = abrege.trim().toLowerCase();
    if (a === "true" || a === "1") approximatif = true;
    else if (a === "false" || a === "0" || a === "") approximatif = lu.approximatif;
    else erreurs.push({ ligne, colonne: "median_price_is_abbreviated", code: "abreviation-illisible" });
  }
  // Le texte affiché doit représenter le même montant (exactement, ou à l'arrondi de l'abréviation près).
  if (lu.centimes !== null && lu.centimes !== centimes && !lu.approximatif) erreurs.push({ ligne, colonne, code: "affichage-incoherent" });
  return { valeur: centimes / 100, centimes, approximatif, texteOriginal: affiche };
}

/**
 * Lit et valide les lignes d'un baromètre FeenWay (en-tête `ENTETES_FEENWAY`) : colonnes requises, valeurs
 * obligatoires, correspondances de niveau, type et transaction, effectifs entiers non négatifs, montants non négatifs,
 * unités cohérentes avec la transaction (vente : MAD et MAD/m2 ; location : MAD/mois et MAD/m2/mois), période
 * AAAA-MM-JJ/AAAA-MM-JJ, lignes en double. Une ligne en erreur n'est pas retenue ; ses erreurs sont rapportées.
 */
export function lireAgregatsFeenway(lignes: readonly Readonly<Record<string, string>>[], meta: { readonly edition: string; readonly editeur?: string }): ResultatLectureAgregats {
  const erreurs: ErreurAgregat[] = [];
  const presentes = new Set(lignes.flatMap((l) => Object.keys(l)));
  const manquantes = lignes.length ? ENTETES_FEENWAY.filter((c) => !presentes.has(c)) : [];
  for (const c of manquantes) erreurs.push({ ligne: 0, colonne: c, code: "colonne-manquante" });
  if (manquantes.length) return { agregats: [], erreurs, lignesLues: lignes.length };

  const agregats: AgregatPublie[] = [];
  const vues = new Set<string>();
  lignes.forEach((l, i) => {
    const ligne = i + 1;
    const e: ErreurAgregat[] = [];
    const v = (c: (typeof ENTETES_FEENWAY)[number]) => (l[c] ?? "").trim();
    for (const c of OBLIGATOIRES) if (!v(c)) e.push({ ligne, colonne: c, code: "valeur-obligatoire-absente" });

    const niveauGeo = CORRESPONDANCE_NIVEAUX_FEENWAY[v("geographic_level")];
    if (v("geographic_level") && !niveauGeo) e.push({ ligne, colonne: "geographic_level", code: "niveau-inconnu" });
    const typeBien = CORRESPONDANCE_TYPES_FEENWAY[v("property_type").toLowerCase().replace(/\s+/g, " ")];
    if (v("property_type") && !typeBien) e.push({ ligne, colonne: "property_type", code: "type-bien-inconnu" });
    const transaction = CORRESPONDANCE_TRANSACTIONS_FEENWAY[v("transaction").toUpperCase()];
    if (v("transaction") && !transaction) e.push({ ligne, colonne: "transaction", code: "transaction-inconnue" });

    let nombreAnnonces = NaN;
    if (v("listing_count")) {
      const s = v("listing_count").replace(/\.0+$/, "");
      if (/^-\d+$/.test(s)) e.push({ ligne, colonne: "listing_count", code: "compte-negatif" });
      else if (!/^\d+$/.test(s)) e.push({ ligne, colonne: "listing_count", code: "compte-non-entier" });
      else nombreAnnonces = Number(s);
    }

    const prixMedian = lireMontantPublie(v("median_price_numeric"), l.median_price_display ?? "", l.median_price_is_abbreviated ?? null, ligne, "median_price_numeric", e);
    const prixMedianM2 = lireMontantPublie(v("median_unit_price_numeric"), l.median_unit_price_display ?? "", null, ligne, "median_unit_price_numeric", e);

    const unite = v("price_unit") ? uniteCanonique(v("price_unit")) : null;
    const uniteM2 = v("area_price_unit") ? uniteCanonique(v("area_price_unit")) : null;
    if (v("price_unit") && !unite) e.push({ ligne, colonne: "price_unit", code: "unite-inconnue" });
    if (v("area_price_unit") && !uniteM2) e.push({ ligne, colonne: "area_price_unit", code: "unite-inconnue" });
    if (transaction && unite && unite !== UNITES_ATTENDUES[transaction].unite) e.push({ ligne, colonne: "price_unit", code: "unite-incoherente" });
    if (transaction && uniteM2 && uniteM2 !== UNITES_ATTENDUES[transaction].uniteM2) e.push({ ligne, colonne: "area_price_unit", code: "unite-incoherente" });

    let tendance90j: number | null = null;
    if (v("trend_90d_pct")) {
      if (/^[+-]?\d+(\.\d+)?$/.test(v("trend_90d_pct"))) tendance90j = Number(v("trend_90d_pct"));
      else e.push({ ligne, colonne: "trend_90d_pct", code: "tendance-illisible" });
    }

    const p = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(v("data_period"));
    const periode = p && estDateIso(p[1]) && estDateIso(p[2]) && p[1]! <= p[2]! ? { debut: p[1]!, fin: p[2]! } : null;
    if (v("data_period") && !periode) e.push({ ligne, colonne: "data_period", code: "periode-illisible" });

    const cle = [v("city"), v("geographic_level"), v("zone"), v("property_type"), v("transaction")].join("|");
    if (vues.has(cle)) e.push({ ligne, colonne: null, code: "ligne-en-double" });
    vues.add(cle);

    if (e.length || !niveauGeo || !typeBien || !transaction || !unite || !uniteM2 || !periode || !Number.isInteger(nombreAnnonces)) {
      erreurs.push(...e);
      return;
    }
    agregats.push({
      editeur: meta.editeur ?? v("source"),
      edition: meta.edition,
      ligne,
      ville: v("city"),
      niveauGeo,
      libelleGeo: v("zone"),
      typeBien,
      typeBienOriginal: v("property_type"),
      transaction,
      nombreAnnonces,
      prixMedian,
      prixMedianM2,
      unite,
      uniteM2,
      tendance90j,
      periode,
      source: v("source"),
      sourceUrl: v("source_url"),
      licence: v("license_as_declared"),
    });
  });
  const ordre = new Map(CODES_ERREUR_AGREGAT.map((c, i) => [c, i]));
  erreurs.sort((a, b) => a.ligne - b.ligne || ordre.get(a.code)! - ordre.get(b.code)! || comparerTexte(a.colonne ?? "", b.colonne ?? ""));
  return { agregats, erreurs, lignesLues: lignes.length };
}

/**
 * Valeur de marché comparable (au sens de `comparaison.ts`) d'un agrégat publié, avec **ses propres** dimensions.
 * La base de surface et la méthode de l'éditeur n'étant pas documentées, `baseSurface` vaut `inconnue` et
 * `baseDocumentee` faux, sauf si l'appelant fournit une base revue : la comparaison est alors refusée par défaut.
 */
export function valeurMarcheDepuisAgregat(
  a: AgregatPublie,
  contexte: { readonly territoire: string; readonly autorisee: boolean; readonly baseRevue?: { readonly baseSurface: ValeurMarche["baseSurface"] } },
): ValeurMarche {
  return {
    nature: "agregat-publie",
    territoire: contexte.territoire,
    typeBien: a.typeBien,
    etat: null,
    transaction: a.transaction,
    baseSurface: contexte.baseRevue?.baseSurface ?? "inconnue",
    monnaie: "MAD",
    unite: a.uniteM2,
    etatDonnee: a.prixMedianM2 ? "disponible" : "indisponible",
    mediane: a.prixMedianM2?.valeur ?? null,
    dateDonnees: a.periode.fin,
    autorisee: contexte.autorisee,
    baseDocumentee: !!contexte.baseRevue,
  };
}
