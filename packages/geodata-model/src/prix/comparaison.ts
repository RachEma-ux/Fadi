/**
 * Comparaison d'une valeur officielle et d'une valeur de marché (Concept §6, PRX08, PRX09).
 *
 * Une comparaison n'est permise que si toutes les dimensions sont compatibles : territoire (ou attribution spatiale
 * qualifiée), type de bien, état quand la référence le précise, transaction, base de surface, monnaie, unité, dates, et
 * si les deux valeurs sont courantes et autorisées. Sinon le résultat liste les dimensions en cause, sans pourcentage.
 *
 * Selon la forme de la référence :
 * - `unique` (positive) : écart descriptif = 100 × (médiane − référence) / référence, arrondi au centième ;
 * - `fourchette` : position de la médiane (en dessous, dans, au-dessus), **sans** pourcentage ;
 * - `terrain-construction` et `conditionnelle` : non comparables, sauf indication explicite d'applicabilité à la
 *   cohorte (composante retenue pour un couple terrain + construction ; condition remplie pour une valeur conditionnelle).
 * Le résultat n'est ni une surévaluation, ni une assiette fiscale, ni une décote de négociation : il garde les deux
 * valeurs et leurs dates, sans jamais les fondre en un prix composite.
 */
import { arrondirDecimal } from "./montants.js";
import { estDateIso } from "./validation.js";
import type { BaseSurface, EtatBien, EtatDonneePrix, Monnaie, ReferenceOfficielle, TransactionPrix, TypeBien } from "./types.js";

/** Libellé (français, langue source) de l'écart ; sa traduction est portée par le dictionnaire de l'interface. */
export const LIBELLE_ECART_REFERENCE = "Écart du prix affiché par rapport à la référence officielle";

/** Dimensions de compatibilité, dans l'ordre où elles sont rapportées. */
export const DIMENSIONS_COMPARAISON = [
  "territoire",
  "type-bien",
  "etat",
  "transaction",
  "base-surface",
  "base-non-documentee",
  "monnaie",
  "unite",
  "dates",
  "validite-reference",
  "autorisation",
  "etat-valeur-marche",
  "reference-non-positive",
  "forme-non-applicable",
] as const;
export type DimensionComparaison = (typeof DIMENSIONS_COMPARAISON)[number];

/** Valeur de marché comparée : cellule calculée par Fadi ou agrégat publié par un tiers (avec ses propres dimensions). */
export interface ValeurMarche {
  readonly nature: "cellule-fadi" | "agregat-publie";
  readonly territoire: string;
  readonly typeBien: TypeBien;
  readonly etat: EtatBien;
  readonly transaction: TransactionPrix;
  readonly baseSurface: BaseSurface;
  readonly monnaie: Monnaie;
  readonly unite: string;
  readonly etatDonnee: EtatDonneePrix;
  readonly mediane: number | null;
  /** Date des données (fin de fenêtre ou de période publiée, AAAA-MM-JJ). */
  readonly dateDonnees: string;
  readonly autorisee: boolean;
  /** Base de calcul documentée (méthode, surface, unité). Un agrégat publié sans base documentée n'est jamais comparé. */
  readonly baseDocumentee: boolean;
}

export interface OptionsComparaison {
  /** Date à laquelle la comparaison est faite (AAAA-MM-JJ). */
  readonly dateComparaison: string;
  /** Correspondances qualifiées zone officielle → territoire (revues, lues en base). */
  readonly correspondancesQualifiees?: readonly { readonly zone: string; readonly territoire: string }[];
  /**
   * Applicabilité explicite (revue) d'une référence `terrain-construction` ou `conditionnelle` à la cohorte. Pour un
   * couple, `composante` désigne la partie applicable (ex. `terrain` pour une cohorte de parcelles).
   */
  readonly applicabilite?: { readonly applicable: boolean; readonly composante?: "terrain" | "construction" };
}

export type PositionFourchette = "en-dessous" | "dans" | "au-dessus";

interface Rappel {
  readonly reference: { readonly id: string; readonly edition: string; readonly dateDebut: string; readonly dateFin: string | null; readonly texteOriginal: string };
  readonly marche: { readonly nature: ValeurMarche["nature"]; readonly mediane: number; readonly dateDonnees: string };
}

export type ResultatComparaison =
  | { readonly comparable: false; readonly dimensionsIncompatibles: readonly DimensionComparaison[] }
  | (Rappel & {
      readonly comparable: true;
      readonly mode: "ecart";
      readonly libelle: typeof LIBELLE_ECART_REFERENCE;
      readonly valeurReference: number;
      readonly ecartPourcent: number;
      readonly formeReference: "unique" | "terrain-construction" | "conditionnelle";
    })
  | (Rappel & {
      readonly comparable: true;
      readonly mode: "position";
      readonly min: number;
      readonly max: number;
      readonly position: PositionFourchette;
    });

const dansPeriode = (d: string, debut: string, fin: string | null) => d >= debut && (fin === null || d <= fin);

/** Compare une référence officielle et une valeur de marché ; voir l'en-tête du module pour les règles. */
export function comparerAuReferentiel(ref: ReferenceOfficielle, marche: ValeurMarche, options: OptionsComparaison): ResultatComparaison {
  const ko = new Set<DimensionComparaison>();
  const territoireOk = ref.zone === marche.territoire
    || (options.correspondancesQualifiees ?? []).some((c) => c.zone === ref.zone && c.territoire === marche.territoire);
  if (!territoireOk) ko.add("territoire");
  if (ref.typeBien !== marche.typeBien) ko.add("type-bien");
  if (ref.etat !== null && ref.etat !== marche.etat) ko.add("etat");
  if (ref.transaction !== marche.transaction) ko.add("transaction");
  if (ref.baseSurface !== marche.baseSurface || ref.baseSurface === "inconnue") ko.add("base-surface");
  if (!marche.baseDocumentee) ko.add("base-non-documentee");
  if (ref.monnaie !== marche.monnaie) ko.add("monnaie");
  if (ref.unite !== marche.unite) ko.add("unite");
  const datesValides = estDateIso(options.dateComparaison) && estDateIso(marche.dateDonnees)
    && dansPeriode(options.dateComparaison, ref.dateDebut, ref.dateFin) && dansPeriode(marche.dateDonnees, ref.dateDebut, ref.dateFin);
  if (!datesValides || marche.etatDonnee === "perime") ko.add("dates");
  if (ref.validite !== "verifiee") ko.add("validite-reference");
  if (!ref.autorisee || !marche.autorisee) ko.add("autorisation");
  if (marche.etatDonnee !== "disponible" && marche.etatDonnee !== "perime") ko.add("etat-valeur-marche");
  if (marche.mediane === null) ko.add("etat-valeur-marche");

  // Valeur de référence selon la forme.
  const v = ref.valeur;
  let valeurReference: number | null = null;
  if (v.forme === "unique") valeurReference = v.valeur;
  else if (v.forme === "conditionnelle") {
    if (options.applicabilite?.applicable) valeurReference = v.valeur;
    else ko.add("forme-non-applicable");
  } else if (v.forme === "terrain-construction") {
    const c = options.applicabilite?.applicable ? options.applicabilite.composante : undefined;
    if (c) valeurReference = c === "terrain" ? v.terrain : v.construction;
    else ko.add("forme-non-applicable");
  }
  if (valeurReference !== null && !(valeurReference > 0)) ko.add("reference-non-positive");
  if (v.forme === "fourchette" && !(v.min > 0 && v.max >= v.min)) ko.add("reference-non-positive");

  if (ko.size) return { comparable: false, dimensionsIncompatibles: DIMENSIONS_COMPARAISON.filter((d) => ko.has(d)) };

  const m = marche.mediane!;
  const rappel: Rappel = {
    reference: { id: ref.id, edition: ref.edition, dateDebut: ref.dateDebut, dateFin: ref.dateFin, texteOriginal: v.texteOriginal },
    marche: { nature: marche.nature, mediane: m, dateDonnees: marche.dateDonnees },
  };
  if (v.forme === "fourchette") {
    const position: PositionFourchette = m < v.min ? "en-dessous" : m > v.max ? "au-dessus" : "dans";
    return { ...rappel, comparable: true, mode: "position", min: v.min, max: v.max, position };
  }
  const r = valeurReference!;
  return {
    ...rappel,
    comparable: true,
    mode: "ecart",
    libelle: LIBELLE_ECART_REFERENCE,
    valeurReference: r,
    ecartPourcent: arrondirDecimal((100 * (m - r)) / r, 2),
    formeReference: v.forme,
  };
}
