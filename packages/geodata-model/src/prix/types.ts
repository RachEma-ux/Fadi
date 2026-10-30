/**
 * Prix immobiliers (Fadi Concept Prix v1.1, lots P3/P5) — types du domaine. Logique pure : aucun DOM, aucune donnée.
 *
 * Deux couches indépendantes : les valeurs immobilières de référence officielles (`officielle`) et les prix affichés dans
 * les annonces (`annonces`). Une valeur absente porte un état explicite (`EtatDonneePrix`), jamais zéro.
 * Tous les montants sont exprimés dans leur monnaie d'origine (code ISO 4217) ; seule `MAD` est admise dans les
 * statistiques (une conversion exigerait une source datée et une méthode explicite, Concept §4).
 */

/** Couche de prix : référence officielle ou prix affichés dans les annonces. */
export const COUCHES_PRIX = ["officielle", "annonces"] as const;
export type CouchePrix = (typeof COUCHES_PRIX)[number];

/** Nature de la transaction annoncée ou de la référence. */
export const TRANSACTIONS_PRIX = ["vente", "location"] as const;
export type TransactionPrix = (typeof TRANSACTIONS_PRIX)[number];

/** Types de biens retenus (Concept §4) ; `autre` reçoit une catégorie d'origine sans correspondance revue. */
export const TYPES_BIEN = [
  "appartement", "maison", "villa", "terrain", "bureau", "local-commercial", "studio", "immeuble", "ferme", "autre",
] as const;
export type TypeBien = (typeof TYPES_BIEN)[number];

/** État du bien quand la source le précise (ancien, récent, neuf) ; `null` = non précisé. */
export const ETATS_BIEN = ["ancien", "recent", "neuf"] as const;
export type EtatBien = (typeof ETATS_BIEN)[number] | null;

/** Base de la surface déclarée. La surface de parcelle n'est jamais mélangée avec une surface de plancher. */
export const BASES_SURFACE = ["habitable", "construite", "vendable", "parcelle", "inconnue"] as const;
export type BaseSurface = (typeof BASES_SURFACE)[number];

/** Période à laquelle se rapporte un prix : `total` (prix de vente) ou période d'un loyer. */
export const PERIODES_PRIX = ["total", "jour", "semaine", "mois", "an"] as const;
export type PeriodePrix = (typeof PERIODES_PRIX)[number];

/** Code de monnaie ISO 4217 (trois lettres majuscules), tel que déclaré par la source. */
export type Monnaie = string;
/** Seules monnaies admises dans les statistiques (aucune conversion n'est faite). */
export const MONNAIES_ADMISES: readonly Monnaie[] = ["MAD"];

/**
 * État d'une valeur, d'une cellule ou d'une couche. Une valeur manquante n'est jamais zéro : elle porte l'un de ces
 * états, avec une valeur `null`.
 */
export const ETATS_DONNEE_PRIX = [
  "disponible", "echantillon-insuffisant", "non-autorise", "indisponible", "perime", "historique", "validite-non-verifiee", "echec",
] as const;
export type EtatDonneePrix = (typeof ETATS_DONNEE_PRIX)[number];

/** Niveau géographique d'un territoire (identifiant du niveau tel qu'enregistré en base, ex. `commune`, `arrondissement`). */
export type NiveauTerritoire = string;

/** Rattachement territorial retenu pour une observation ou une valeur : code et niveau du territoire en base. */
export interface TerritoirePrix {
  readonly code: string;
  readonly niveau: NiveauTerritoire;
}

// ——— Valeurs officielles (Concept §3) ———

/**
 * Formes d'une valeur officielle, enregistrées sans transformation : valeur unique, fourchette, couple terrain +
 * construction (référentiel DGI des villas et maisons), valeur conditionnelle (applicable sous une condition énoncée).
 */
export type FormeValeurOfficielle =
  | { readonly forme: "unique"; readonly valeur: number }
  | { readonly forme: "fourchette"; readonly min: number; readonly max: number }
  | { readonly forme: "terrain-construction"; readonly terrain: number; readonly construction: number }
  | { readonly forme: "conditionnelle"; readonly condition: string; readonly valeur: number };

/** Valeur officielle sous l'une de ses formes, toujours accompagnée du texte d'origine. */
export type ValeurOfficielle = FormeValeurOfficielle & { readonly texteOriginal: string };

/** Statut de validité d'une édition officielle : jamais présumée en vigueur parce qu'elle est la dernière importée. */
export const VALIDITES_EDITION = ["verifiee", "non-verifiee", "historique"] as const;
export type ValiditeEdition = (typeof VALIDITES_EDITION)[number];

/** Référence officielle complète (une ligne de `geodata_prix_valeurs_officielles` avec son édition). */
export interface ReferenceOfficielle {
  readonly id: string;
  readonly edition: string;
  /** Zone officielle ou territoire de la référence (identifiant d'origine). */
  readonly zone: string;
  readonly categorieOriginale: string;
  readonly typeBien: TypeBien;
  readonly etat: EtatBien;
  readonly transaction: TransactionPrix;
  readonly baseSurface: BaseSurface;
  readonly monnaie: Monnaie;
  /** Unité canonique (voir `uniteCanonique` dans `montants.ts`), ex. `MAD/m2`. */
  readonly unite: string;
  readonly valeur: ValeurOfficielle;
  /** Date de début d'effet (AAAA-MM-JJ). */
  readonly dateDebut: string;
  /** Date de fin d'effet (AAAA-MM-JJ) ou null si ouverte. */
  readonly dateFin: string | null;
  readonly validite: ValiditeEdition;
  /** L'édition est-elle autorisée (droits de réutilisation établis) ? */
  readonly autorisee: boolean;
}

// ——— Observations d'annonces (Concept §4) ———

/**
 * Observation d'une annonce, normalisée (montant en nombre décimal, unités canoniques) mais pas encore validée.
 * Aucune donnée personnelle (vendeur, téléphone) n'y figure.
 */
export interface ObservationAnnonce {
  /** Clé de la source (ex. `source-synthetique-A`). */
  readonly source: string;
  /** Identifiant de l'annonce dans la source. */
  readonly idAnnonce: string;
  /** Date d'observation (AAAA-MM-JJ). */
  readonly dateObservation: string;
  readonly transaction: TransactionPrix | null;
  readonly typeBien: TypeBien | null;
  readonly etat: EtatBien;
  /** Prix affiché (total pour une vente, loyer par période pour une location) ; null si absent. */
  readonly prix: number | null;
  readonly monnaie: Monnaie | null;
  readonly periode: PeriodePrix | null;
  /** Surface déclarée en m² ; null si absente. */
  readonly surface: number | null;
  readonly baseSurface: BaseSurface;
  /** Libellé de localité de la source, conservé tel quel. */
  readonly libelleLocalite: string;
  /** Rattachement retenu (jamais plus fin que la précision de la source) ; null si non rattachée. */
  readonly territoire: TerritoirePrix | null;
  /** Empreinte de contenu autorisée (ex. hachage du descriptif), pour la déduplication inter-sources. */
  readonly empreinte?: string | null;
}

/** Clé d'une annonce : source + identifiant d'annonce. */
export const cleAnnonce = (o: Pick<ObservationAnnonce, "source" | "idAnnonce">): string => `${o.source}|${o.idAnnonce}`;
/** Clé d'une observation : source + identifiant d'annonce + date d'observation (unicité, Plan §4). */
export const cleObservation = (o: Pick<ObservationAnnonce, "source" | "idAnnonce" | "dateObservation">): string =>
  `${o.source}|${o.idAnnonce}|${o.dateObservation}`;

/** Comparaison de chaînes indépendante de la langue (ordre des points de code), pour un tri déterministe. */
export const comparerTexte = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const estTypeBien = (x: unknown): x is TypeBien => typeof x === "string" && (TYPES_BIEN as readonly string[]).includes(x);
export const estTransactionPrix = (x: unknown): x is TransactionPrix => typeof x === "string" && (TRANSACTIONS_PRIX as readonly string[]).includes(x);
export const estPeriodePrix = (x: unknown): x is PeriodePrix => typeof x === "string" && (PERIODES_PRIX as readonly string[]).includes(x);
export const estBaseSurface = (x: unknown): x is BaseSurface => typeof x === "string" && (BASES_SURFACE as readonly string[]).includes(x);
