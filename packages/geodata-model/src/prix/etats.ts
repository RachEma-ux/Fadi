/**
 * État d'une couche de prix (Concept §3, §5, §9) dérivé du statut de sa source et de son édition. Les états manquant,
 * insuffisant, périmé, non autorisé, historique, de validité non vérifiée et en échec restent distincts ; aucun ne
 * devient une valeur 0. Les libellés sont portés par l'interface (`apps/web`) : ce module ne rend que des codes.
 */
import { estDateIso } from "./validation.js";
import type { CouchePrix, EtatDonneePrix, ValiditeEdition } from "./types.js";

/** Statuts d'une source (Concept §2). Seules `autorisee` et `active` permettent l'usage des données. */
export const STATUTS_SOURCE_PRIX = ["candidate", "qualifiee", "autorisee", "active", "bloquee", "suspendue", "retiree"] as const;
export type StatutSourcePrix = (typeof STATUTS_SOURCE_PRIX)[number];

/** Règle de fraîcheur versionnée : au-delà de `joursMaximum` après la date des données, la couche est périmée. */
export interface RegleFraicheur {
  readonly version: string;
  readonly joursMaximum: number;
}

/**
 * Règle de départ : 180 jours (deux fenêtres d'observation de 90 jours). Paramètre d'évaluation consigné avec la méthode,
 * comme la fenêtre et le seuil du pilote, pas une garantie établie.
 */
export const REGLE_FRAICHEUR_V1: RegleFraicheur = { version: "fraicheur-v1", joursMaximum: 180 };

export interface EntreeEtatCouche {
  readonly couche: CouchePrix;
  readonly source: { readonly statut: StatutSourcePrix; readonly motifBlocage?: string | null };
  /** Édition retenue, ou null si aucune édition n'existe. */
  readonly edition: {
    /** Validité déclarée (couche officielle) ; null pour une édition d'annonces ou d'agrégat publié. */
    readonly validite: ValiditeEdition | null;
    /** Date des données (fin de période couverte, AAAA-MM-JJ), ou null si inconnue. */
    readonly dateDonnees: string | null;
    /** Le dernier import de l'édition a-t-il échoué ? */
    readonly importEchoue?: boolean;
  } | null;
  /** Nombre de valeurs publiables de l'édition. */
  readonly nombreValeurs: number;
  /** Date du jour de l'évaluation (AAAA-MM-JJ). */
  readonly dateReference: string;
  readonly regleFraicheur?: RegleFraicheur;
}

/** Codes stables des motifs d'état. */
export type MotifEtatCouche =
  | `source-${Exclude<StatutSourcePrix, "autorisee" | "active">}`
  | "aucune-edition"
  | "aucune-donnee"
  | "import-echoue"
  | "edition-historique"
  | "validite-non-verifiee"
  | "date-donnees-inconnue"
  | "donnees-perimees";

/**
 * Motifs codés « hors chaîne de l'édition » que l'API rend pour un produit ou une couche : aucune source enregistrée
 * pour ce produit, ou aucune publication active (instantané des observations).
 */
export const MOTIFS_PRODUIT_PRIX = ["aucune-source", "aucune-publication"] as const;

/**
 * Liste unique et fermée des codes de motif que l'API des prix peut rendre pour une couche ou un produit
 * (`GET /prix/couches`, `GET /prix/cellules`) : statuts de source non autorisés, motifs de `deriverEtatCouche`, puis
 * `MOTIFS_PRODUIT_PRIX`. L'interface porte un libellé pour chacun (contrôlé par test).
 */
export const MOTIFS_COUCHE_PRIX = [
  ...STATUTS_SOURCE_PRIX.filter((s) => s !== "autorisee" && s !== "active").map((s) => `source-${s}` as const),
  "aucune-edition", "aucune-donnee", "import-echoue", "edition-historique", "validite-non-verifiee", "date-donnees-inconnue", "donnees-perimees",
  ...MOTIFS_PRODUIT_PRIX,
] as readonly (MotifEtatCouche | (typeof MOTIFS_PRODUIT_PRIX)[number])[];
export type MotifCouchePrix = MotifEtatCouche | (typeof MOTIFS_PRODUIT_PRIX)[number];

/** Motifs codés d'une comparaison refusée (`GET /prix/comparaison`, champ `motif`). */
export const MOTIFS_COMPARAISON_PRIX = ["aucune-reference-officielle", "aucune-valeur-marche", "dimensions-incompatibles"] as const;
export type MotifComparaisonPrix = (typeof MOTIFS_COMPARAISON_PRIX)[number];

export interface EtatCouche {
  readonly etat: EtatDonneePrix;
  /** Motif codé ; null si `disponible`. */
  readonly motif: MotifEtatCouche | null;
  /** Motif de blocage enregistré pour la source (texte de la fiche), le cas échéant. */
  readonly detail: string | null;
  /** Âge des données en jours, si calculable. */
  readonly ageJours: number | null;
  /** Version de la règle de fraîcheur appliquée. */
  readonly regleFraicheur: string;
}

const jourUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * Dérive l'état d'une couche, dans cet ordre de priorité : source non autorisée → `non-autorise` (avec le motif de
 * blocage) ; aucune édition ou aucune valeur → `indisponible` ; import en échec → `echec` ; édition historique →
 * `historique` ; validité non vérifiée (couche officielle) → `validite-non-verifiee` ; date des données inconnue →
 * `validite-non-verifiee` ; plus ancienne que la règle de fraîcheur → `perime` ; sinon `disponible`.
 * Une édition n'est jamais présumée en vigueur parce qu'elle est la plus récente.
 */
export function deriverEtatCouche(e: EntreeEtatCouche): EtatCouche {
  const regle = e.regleFraicheur ?? REGLE_FRAICHEUR_V1;
  const r = (etat: EtatDonneePrix, motif: MotifEtatCouche | null, ageJours: number | null = null, detail: string | null = null): EtatCouche =>
    ({ etat, motif, detail, ageJours, regleFraicheur: regle.version });
  if (e.source.statut !== "autorisee" && e.source.statut !== "active") {
    return r("non-autorise", `source-${e.source.statut}`, null, e.source.motifBlocage ?? null);
  }
  if (!e.edition) return r("indisponible", "aucune-edition");
  if (e.edition.importEchoue) return r("echec", "import-echoue");
  if (e.nombreValeurs <= 0) return r("indisponible", "aucune-donnee");
  if (e.edition.validite === "historique") return r("historique", "edition-historique");
  if (e.couche === "officielle" && e.edition.validite !== "verifiee") return r("validite-non-verifiee", "validite-non-verifiee");
  if (!e.edition.dateDonnees || !estDateIso(e.edition.dateDonnees) || !estDateIso(e.dateReference)) return r("validite-non-verifiee", "date-donnees-inconnue");
  const age = jourUtc(e.dateReference) - jourUtc(e.edition.dateDonnees);
  if (age > regle.joursMaximum) return r("perime", "donnees-perimees", age);
  return r("disponible", null, age);
}
