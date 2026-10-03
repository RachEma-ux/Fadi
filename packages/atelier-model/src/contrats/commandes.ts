/**
 * Commandes du contrat `atelier-commands/1` (cahier §5.3, annexe B) : union discriminée par `type`.
 * Types seulement ; réducteurs dans `src/commandes/**` (L1.2).
 *
 * Conventions :
 * - `cibles` : objets existants visés (modifier, supprimer, transformer…) ; vide pour une création ;
 * - création : `params.id` fourni par le client (identifiant stable, permet l'aperçu hors ligne et
 *   l'idempotence — hypothèse DA-05-12, à confirmer par L1.2), `niveauId` et `calqueId` explicites ;
 * - modification : `params.modifications` = sous-ensemble des paramètres canoniques de la classe ;
 * - toute grandeur `{ value, unit }`, toute coordonnée taguée (`frame: "local"`) ; aucune valeur par défaut
 *   n'est ajoutée par un réducteur (R3).
 * Les noms marqués « proposé » viennent des fiches et ne sont pas dans l'annexe B : D-013, figés en L1.2.
 */
import type {
  ClasseBaie,
  ClasseEsquisse,
  IdObjet,
  ParamsCalque,
  ParamsCotation,
  ParamsDalle,
  ParamsEscalier,
  ParamsEspace,
  ParamsEsquisseArc,
  ParamsEsquisseCercle,
  ParamsEsquisseConstruction,
  ParamsEsquisseHachure,
  ParamsEsquisseLigne,
  ParamsEsquissePolygone,
  ParamsEsquissePolyligne,
  ParamsEsquisseRectangle,
  ParamsEsquisseSpline,
  ParamsEtiquette,
  ParamsMur,
  ParamsBaie,
  ParamsNiveau,
  ParamsPiece,
  ParamsPoteau,
  ParamsSolide,
  ParamsTexte,
  ParamsToiture,
  ParamsZone,
  ParamsParcelle,
  ParamsEmprise,
  ReferenceExtremite,
} from "../ontologie/classes.js";
import type { ClasseTypee, DefinitionType } from "../ontologie/definitions.js";
import type { Tracabilite } from "../ontologie/provenance.js";
import type { Classification, ValeurPropriete } from "../ontologie/proprietes.js";
import type { PointLocal, Polygone } from "../ontologie/reperes.js";
import type { Angle, Longueur, Unite } from "../ontologie/unites.js";
import type { ReferenceTopologique } from "./references.js";

/** Forme commune d'une commande. */
export interface CommandeDe<T extends string, P> {
  readonly type: T;
  readonly params: P;
  readonly cibles: readonly IdObjet[];
}

/** En-tête d'une création d'objet de niveau. */
export interface EnTeteCreation {
  readonly id: IdObjet;
  readonly niveauId: IdObjet;
  readonly calqueId: IdObjet;
}

export interface Modification<P> {
  readonly modifications: Partial<P>;
}

type Vide = Readonly<Record<string, never>>;

// --- Niveaux --------------------------------------------------------------
export type CommandeNiveau =
  | CommandeDe<"niveau.creer", { readonly id: IdObjet } & ParamsNiveau>
  | CommandeDe<"niveau.modifier", Modification<ParamsNiveau>>
  /** Refusée si des objets existent sans destination. */
  | CommandeDe<"niveau.supprimer", { readonly niveauDestinationId?: IdObjet }>;

// --- Murs -----------------------------------------------------------------
export type CommandeMur =
  | CommandeDe<"mur.tracer", EnTeteCreation & Omit<ParamsMur, "axe"> & { readonly a: PointLocal; readonly b: PointLocal }>
  | CommandeDe<"mur.modifier", Modification<ParamsMur>>
  /** Scinde la cible en deux nouveaux murs ; réaffecte les baies ; met les cotations « à réparer ». */
  | CommandeDe<"mur.scinder", { readonly point: PointLocal; readonly nouveauxIds: readonly [IdObjet, IdObjet] }>
  /** Joint deux murs colinéaires et contigus (cibles = 2 murs). */
  | CommandeDe<"mur.joindre", { readonly nouvelId: IdObjet }>
  | CommandeDe<"mur.supprimer", Vide>;

// --- Ouvertures (porte, fenêtre, ouverture) -------------------------------
export type CommandeOuverture =
  | CommandeDe<"ouverture.poser", EnTeteCreation & { readonly classe: ClasseBaie } & ParamsBaie>
  | CommandeDe<"ouverture.modifier", Modification<Omit<ParamsBaie, "murHoteId" | "position">>>
  | CommandeDe<"ouverture.deplacer", { readonly murHoteId?: IdObjet; readonly t?: number; readonly distance?: Longueur }>
  | CommandeDe<"ouverture.supprimer", Vide>;

// --- Dalles, toitures -----------------------------------------------------
export type CommandeDalleToiture =
  | CommandeDe<"dalle.creer", EnTeteCreation & ParamsDalle>
  | CommandeDe<"dalle.modifier", Modification<ParamsDalle>>
  | CommandeDe<"dalle.supprimer", Vide>
  | CommandeDe<"toiture.creer", EnTeteCreation & ParamsToiture>
  | CommandeDe<"toiture.modifier", Modification<ParamsToiture>>
  | CommandeDe<"toiture.supprimer", Vide>;

// --- Escaliers ------------------------------------------------------------
export type CommandeEscalier =
  | CommandeDe<"escalier.creer", EnTeteCreation & ParamsEscalier>
  | CommandeDe<"escalier.modifier", Modification<ParamsEscalier>>
  | CommandeDe<"escalier.supprimer", Vide>;

// --- Pièces, espaces, zones -----------------------------------------------
export type CommandePieceEspaceZone =
  /** Proposition seulement (effets : propositions), jamais imposée. */
  | CommandeDe<"piece.detecter", { readonly niveauId: IdObjet; readonly point?: PointLocal }>
  | CommandeDe<"piece.creer", EnTeteCreation & Omit<ParamsPiece, "aireCalculee">>
  | CommandeDe<"piece.modifier", Modification<Omit<ParamsPiece, "aireCalculee">>>
  | CommandeDe<"piece.supprimer", Vide>
  | CommandeDe<"espace.creer", EnTeteCreation & ParamsEspace>
  | CommandeDe<"espace.modifier", Modification<ParamsEspace>>
  | CommandeDe<"espace.supprimer", Vide>
  | CommandeDe<"zone.creer", EnTeteCreation & ParamsZone & { readonly contenu: readonly IdObjet[] }>
  | CommandeDe<"zone.modifier", Modification<ParamsZone> & { readonly contenu?: readonly IdObjet[] }>
  | CommandeDe<"zone.supprimer", Vide>;

// --- Poteaux, solides -----------------------------------------------------
export type CommandePoteauSolide =
  | CommandeDe<"poteau.creer", EnTeteCreation & ParamsPoteau>
  | CommandeDe<"poteau.modifier", Modification<ParamsPoteau>>
  | CommandeDe<"poteau.supprimer", Vide>
  | CommandeDe<"solide.extruder", EnTeteCreation & ParamsSolide>
  | CommandeDe<"solide.modifier", Modification<ParamsSolide>>
  | CommandeDe<"solide.supprimer", Vide>;

// --- Esquisse -------------------------------------------------------------
export type CommandeEsquisse =
  | CommandeDe<"esquisse.ligne", EnTeteCreation & ParamsEsquisseLigne>
  | CommandeDe<"esquisse.polyligne", EnTeteCreation & ParamsEsquissePolyligne>
  | CommandeDe<"esquisse.arc", EnTeteCreation & ParamsEsquisseArc>
  | CommandeDe<"esquisse.cercle", EnTeteCreation & ParamsEsquisseCercle>
  | CommandeDe<"esquisse.rectangle", EnTeteCreation & ParamsEsquisseRectangle>
  | CommandeDe<"esquisse.polygone", EnTeteCreation & ParamsEsquissePolygone>
  | CommandeDe<"esquisse.spline", EnTeteCreation & ParamsEsquisseSpline>
  | CommandeDe<"esquisse.construction", EnTeteCreation & ParamsEsquisseConstruction>
  | CommandeDe<"esquisse.hachure", EnTeteCreation & ParamsEsquisseHachure>
  | CommandeDe<"esquisse.modifier", { readonly classe: ClasseEsquisse; readonly modifications: Readonly<Record<string, unknown>> }>
  | CommandeDe<"esquisse.supprimer", Vide>;

// --- Transformations (sur une sélection typée : `cibles`) ------------------
export interface Vecteur {
  readonly dx: number;
  readonly dy: number;
  readonly unit: "m";
}

export type CommandeTransformation =
  | CommandeDe<"transformer.deplacer", { readonly vecteur: Vecteur }>
  | CommandeDe<"transformer.copier", { readonly vecteur: Vecteur; readonly nouveauxIds: readonly IdObjet[] }>
  | CommandeDe<"transformer.tourner", { readonly centre: PointLocal; readonly angle: Angle }>
  | CommandeDe<"transformer.miroir", { readonly axe: { readonly a: PointLocal; readonly b: PointLocal }; readonly conserverOriginal: boolean; readonly nouveauxIds?: readonly IdObjet[] }>
  /** Uniforme seulement sur murs, baies, poteaux, escaliers ; ne modifie jamais un paramètre dimensionnel nommé (D-014). */
  | CommandeDe<"transformer.echelle", { readonly centre: PointLocal; readonly facteur: number }>
  | CommandeDe<"transformer.etirer", { readonly fenetre: Polygone<PointLocal>; readonly vecteur: Vecteur }>
  | CommandeDe<"transformer.ajuster", { readonly limiteIds: readonly IdObjet[]; readonly pointChoix: PointLocal }>
  | CommandeDe<"transformer.prolonger", { readonly limiteIds: readonly IdObjet[]; readonly pointChoix: PointLocal }>
  | CommandeDe<"transformer.decaler", { readonly distance: Longueur; readonly cote: PointLocal; readonly nouveauxIds: readonly IdObjet[] }>
  | CommandeDe<"transformer.repeter", { readonly nombre: number; readonly vecteur: Vecteur; readonly nouveauxIds: readonly IdObjet[] }>
  | CommandeDe<"transformer.decomposer", { readonly nouveauxIds: readonly IdObjet[] }>
  | CommandeDe<"transformer.pointsDeControle", { readonly deplacements: readonly { readonly indice: number; readonly point: PointLocal }[] }>;

// --- Annotations ----------------------------------------------------------
export type CommandeAnnotation =
  | CommandeDe<"cotation.creer", EnTeteCreation & Omit<ParamsCotation, "etat">>
  | CommandeDe<"cotation.modifier", Modification<Omit<ParamsCotation, "etat" | "references">>>
  | CommandeDe<"cotation.rattacher", { readonly references: readonly ReferenceExtremite[] }>
  | CommandeDe<"cotation.supprimer", Vide>
  | CommandeDe<"texte.creer", EnTeteCreation & ParamsTexte>
  | CommandeDe<"texte.modifier", Modification<ParamsTexte>>
  | CommandeDe<"texte.supprimer", Vide>
  | CommandeDe<"etiquette.creer", EnTeteCreation & ParamsEtiquette>
  | CommandeDe<"etiquette.modifier", Modification<ParamsEtiquette>>
  | CommandeDe<"etiquette.supprimer", Vide>;

// --- Organisation ---------------------------------------------------------
export type CommandeOrganisation =
  | CommandeDe<"calque.creer", { readonly id: IdObjet } & Omit<ParamsCalque, "niveauxPresence">>
  | CommandeDe<"calque.modifier", Modification<Pick<ParamsCalque, "nom" | "couleur" | "remplissage" | "visible" | "verrouille">>>
  /** Proposé (DA-05-01). */
  | CommandeDe<"calque.reordonner", { readonly ordre: readonly IdObjet[] }>
  /** Proposé (DA-05-01) : cibles = objets. */
  | CommandeDe<"calque.affecter", { readonly calqueId: IdObjet }>
  | CommandeDe<"calque.supprimer", { readonly calqueDestinationId?: IdObjet }>
  | CommandeDe<"groupe.creer", { readonly id: IdObjet; readonly nom?: string }>
  | CommandeDe<"groupe.dissoudre", Vide>
  /** Lot 5. */
  | CommandeDe<"bloc.definir", { readonly id: IdObjet; readonly nom: string; readonly origine: PointLocal }>
  /** Lot 5. */
  | CommandeDe<"bloc.placer", EnTeteCreation & { readonly blocId: IdObjet; readonly position: PointLocal; readonly angle: Angle }>
  | CommandeDe<"type.definir", { readonly definition: Omit<DefinitionType, "versionCatalogue" | "classeIfc"> }>
  | CommandeDe<"type.modifier", { readonly classe: ClasseTypee; readonly id: string; readonly modifications: Partial<Pick<DefinitionType, "nom" | "categorie" | "dimensionsProposees" | "proprietes">> }>
  /** Cibles = objets ; `valeur: undefined` n'existe pas : retirer une propriété = `propriete.definir` avec `retirer: true`. */
  | CommandeDe<
      "propriete.definir",
      Tracabilite & { readonly nom: string; readonly valeur: ValeurPropriete; readonly unite?: Unite; readonly retirer?: boolean }
    >
  | CommandeDe<"classification.affecter", { readonly definitionId?: string; readonly classification: Classification }>;

// --- Références -----------------------------------------------------------
export type CommandeReference = CommandeDe<
  "reference.reparer",
  /** Cible = porteur de la référence ; `nouvelle: null` = détacher. */
  { readonly ancienne: ReferenceTopologique; readonly nouvelle: ReferenceTopologique | null }
>;

// --- Site -----------------------------------------------------------------
export type CommandeSite =
  | CommandeDe<"site.parcelle.definir", { readonly id: IdObjet } & ParamsParcelle>
  | CommandeDe<"site.emprise.definir", { readonly id: IdObjet } & ParamsEmprise>;

/** Toute commande du contrat `atelier-commands/1`. */
export type Commande =
  | CommandeNiveau
  | CommandeMur
  | CommandeOuverture
  | CommandeDalleToiture
  | CommandeEscalier
  | CommandePieceEspaceZone
  | CommandePoteauSolide
  | CommandeEsquisse
  | CommandeTransformation
  | CommandeAnnotation
  | CommandeOrganisation
  | CommandeReference
  | CommandeSite;

export type TypeCommande = Commande["type"];
export type CommandeDeType<T extends TypeCommande> = Extract<Commande, { type: T }>;

/** Famille d'une commande (préfixe), pour le routage et les droits. */
export type FamilleCommande =
  | "niveau"
  | "mur"
  | "ouverture"
  | "dalle"
  | "toiture"
  | "escalier"
  | "piece"
  | "espace"
  | "zone"
  | "poteau"
  | "solide"
  | "esquisse"
  | "transformer"
  | "cotation"
  | "texte"
  | "etiquette"
  | "calque"
  | "groupe"
  | "bloc"
  | "type"
  | "propriete"
  | "classification"
  | "reference"
  | "site";
