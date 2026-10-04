/**
 * Contrats du nouvel Atelier (cahier §5.7–5.8, lot 3a) — **interfaces figées par le chef de projet** avant la
 * distribution des tâches (§9). Les équipiers les consomment ; ils ne les modifient pas : un manque se signale au
 * chef de projet, qui étend le contrat (ajout seulement, jamais de retrait) et le consigne en décision.
 *
 * Propriété (matrice du lot 3a) :
 * - `socle/**` (ce fichier, `selection.ts`, `registre.ts`, `dessin.ts`, `interface.ts`, `pilote.ts`, `contexte.ts`) :
 *   chef de projet ;
 * - `ui/**` : équipier « interface » (L3a.1) — consomme `RegistreOutils`, `SelectionAtelier`, `ContexteAtelier` ;
 * - `plan2d/**` : équipier « 2D » (L3a.2) — produit les `EvenementPlan` (accrochages, saisie de précision),
 *   dessine les `Apercu`, fournit la sélection au clic / lasso / filtre, enregistre ses outils (esquisse,
 *   transformations) ;
 * - `objets/**` : équipier « architecture » (L3a.3) — enregistre les outils murs, ouvertures, dalles, escalier,
 *   pièces ; fournit les descripteurs d'inspecteur des classes d'architecture ;
 * - `documents/**` : équipier « documents simples » (L3a.5) — cotation et texte libres, mètre, métré, exports.
 *
 * Règle d'or (R-commandes) : un outil ne modifie **jamais** l'état directement. Il produit une liste de `Commande`
 * (contrat `atelier-commands/1`), que le socle envoie au bus (`BusAtelier.executer`), lequel applique le même
 * réducteur que le serveur, met en file et synchronise. Annuler / rétablir passent par le serveur (journal).
 */
import type { Commande, EtatModele, IdObjet, ObjetModele, PointLocal } from "@parcours/atelier-model";

// ---------------------------------------------------------------------------------------------------------------
// Familles et niveaux d'affichage (§5.8)
// ---------------------------------------------------------------------------------------------------------------

/** Familles des commandes affichées dans la barre et la palette. */
export const FAMILLES_OUTIL = ["creer", "modifier", "connecter", "analyser", "documenter", "partager"] as const;
export type FamilleOutil = (typeof FAMILLES_OUTIL)[number];

/** Niveaux d'affichage de l'interface : un outil apparaît à partir de son niveau. */
export const NIVEAUX_AFFICHAGE = ["essentiel", "contextuel", "complet"] as const;
export type NiveauAffichage = (typeof NIVEAUX_AFFICHAGE)[number];

/** Vue de la zone de travail. `3d` arrive au lot 3b : au lot 3a, seul `plan` est rendu. */
export type VueTravail = "plan" | "3d";

// ---------------------------------------------------------------------------------------------------------------
// Sélection
// ---------------------------------------------------------------------------------------------------------------

/** Sélection courante : des identifiants d'objets du modèle, dans l'ordre de sélection. */
export interface Selection {
  readonly ids: readonly IdObjet[];
  /** Objet « principal » (dernier ajouté), montré par l'inspecteur ; `null` si la sélection est vide. */
  readonly principal: IdObjet | null;
}

export type ModeSelection = "remplacer" | "ajouter" | "basculer" | "retirer";

/** Magasin de sélection partagé (implémentation : `socle/selection.ts`). */
export interface SelectionAtelier {
  lire(): Selection;
  choisir(ids: readonly IdObjet[], mode?: ModeSelection): void;
  vider(): void;
  /** Rend une fonction de désabonnement ; compatible `useSyncExternalStore`. */
  abonner(ecouteur: () => void): () => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Contexte d'un outil
// ---------------------------------------------------------------------------------------------------------------

/** Ce qu'un outil peut lire et faire. Construit par le socle (`socle/contexte.ts`) ; lecture seule pour l'outil. */
export interface ContexteAtelier {
  readonly projetId: string;
  /** État local du bus (optimiste) ; `null` tant que le modèle n'est pas chargé. */
  etat(): EtatModele | null;
  /** Niveau et calque actifs, lus à l'instant de l'appel (ils changent pendant la session : `EtatInterface`). */
  niveauActif(): IdObjet | null;
  calqueActif(): IdObjet | null;
  readonly selection: SelectionAtelier;
  /** Le projet est-il modifiable par ce compte (rôle, réservation, copie protégée de l'exemple) ? Sinon, motif. */
  readonly ecriture: { readonly permise: true } | { readonly permise: false; readonly motif: string };
  /**
   * Valide une liste de commandes : envoi au bus, application optimiste, synchronisation.
   * Rend les erreurs détaillées « objet, cause, action » en cas de refus local.
   */
  valider(label: string, commandes: readonly Commande[]): Promise<ResultatValidation>;
  /** Essai à blanc local (même réducteur) : sert au contrôle avant validation, sans rien écrire. */
  essayer(commandes: readonly Commande[]): ResultatValidation;
  /**
   * Annuler / rétablir la dernière entrée de l'auteur, **par le serveur** (journal, D-024) : en ligne seulement et
   * file vide ; sinon refus lisible. Le modèle local est relu ensuite (`BusAtelier.rafraichir`).
   */
  annuler(): Promise<ResultatValidation>;
  retablir(): Promise<ResultatValidation>;
  /** Génère un identifiant d'objet neuf, stable pour la session de l'outil (préfixe par classe, ex. `mur`). */
  nouvelId(prefixe: string): IdObjet;
}

/** Erreur lisible « objet, cause, action » (§5.8), alignée sur `DetailErreur` de l'API. */
export interface ErreurLisible {
  readonly objet: string;
  readonly cause: string;
  readonly action: string;
  readonly message: string;
  readonly objetIds?: readonly IdObjet[];
}

export type ResultatValidation = { readonly ok: true; readonly etat: EtatModele } | { readonly ok: false; readonly erreurs: readonly ErreurLisible[] };

// ---------------------------------------------------------------------------------------------------------------
// Évènements de la zone de travail (produits par `plan2d`)
// ---------------------------------------------------------------------------------------------------------------

export const TYPES_ACCROCHAGE = ["extremite", "milieu", "perpendiculaire", "intersection", "orthogonal", "grille", "objet", "aucun"] as const;
export type TypeAccrochage = (typeof TYPES_ACCROCHAGE)[number];

/** Accrochage retenu pour un point : le point brut a déjà été remplacé par `point` accroché. */
export interface Accrochage {
  readonly type: TypeAccrochage;
  /** Objet ou segment ayant donné l'accrochage, s'il y en a un. */
  readonly objetId?: IdObjet;
  /** Libellé court affiché près du curseur (« extrémité », « milieu »…). */
  readonly libelle: string;
}

export interface Modificateurs {
  readonly maj: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
}

/**
 * Évènement de pointeur (souris, stylet, toucher unifiés) ou de clavier dans la zone de travail, **en mètres,
 * repère local du projet**, après accrochage. Les coordonnées écran ne sortent jamais de `plan2d`.
 */
export type EvenementPlan =
  | { readonly type: "survol" | "appui" | "glisse" | "relache"; readonly point: PointLocal; readonly accrochage: Accrochage; readonly modificateurs: Modificateurs; readonly objetSousPointeur: IdObjet | null }
  | { readonly type: "touche"; readonly touche: string; readonly modificateurs: Modificateurs }
  /** Saisie de précision pendant le tracé : longueur en m, angle en degrés (sens trigonométrique, 0 = +x). */
  | { readonly type: "saisie"; readonly champ: "longueur" | "angle" | "x" | "y" | string; readonly valeur: number };

// ---------------------------------------------------------------------------------------------------------------
// Aperçu (dessiné par `plan2d`, jamais écrit dans le modèle)
// ---------------------------------------------------------------------------------------------------------------

export type StyleApercu = "trace" | "fantome" | "erreur" | "cote";

export type FormeApercu =
  | { readonly forme: "segment"; readonly a: PointLocal; readonly b: PointLocal; readonly style: StyleApercu; readonly epaisseur?: number }
  | { readonly forme: "polyligne"; readonly points: readonly PointLocal[]; readonly fermee: boolean; readonly style: StyleApercu }
  | { readonly forme: "polygone"; readonly points: readonly PointLocal[]; readonly style: StyleApercu }
  | { readonly forme: "cercle"; readonly centre: PointLocal; readonly rayon: number; readonly style: StyleApercu }
  | { readonly forme: "cote"; readonly a: PointLocal; readonly b: PointLocal; readonly texte: string }
  | { readonly forme: "texte"; readonly position: PointLocal; readonly texte: string; readonly style: StyleApercu }
  /** Objets du modèle à surligner (cible d'un outil, objet en erreur). */
  | { readonly forme: "surligner"; readonly ids: readonly IdObjet[]; readonly style: StyleApercu };

/** Champ de saisie de précision proposé par l'outil pendant son geste (affiché près du curseur et au clavier). */
export interface ChampSaisie {
  readonly champ: string;
  readonly libelle: string;
  readonly unite: "m" | "°" | "";
  readonly valeur: number | null;
}

export interface Apercu {
  readonly formes: readonly FormeApercu[];
  readonly champs: readonly ChampSaisie[];
  /** Consigne courte de l'étape en cours (« Cliquez le point de fin du mur »), lue par les lecteurs d'écran. */
  readonly consigne: string;
  /** Résultat du contrôle de l'aperçu (essai à blanc) : erreurs à afficher avant validation. */
  readonly erreurs: readonly ErreurLisible[];
}

// ---------------------------------------------------------------------------------------------------------------
// Outil
// ---------------------------------------------------------------------------------------------------------------

/**
 * Réaction d'une session d'outil à un évènement.
 * - `continuer` : redessiner l'aperçu ;
 * - `valider` : le socle valide `commandes` (label) puis, si `terminer`, ferme la session (sinon l'outil
 *   continue, ex. murs enchaînés) ;
 * - `terminer` : fermer sans rien écrire ;
 * - `selectionner` : outil de sélection — le socle applique la sélection.
 */
export type ReactionOutil =
  | { readonly action: "continuer" }
  | { readonly action: "valider"; readonly label: string; readonly commandes: readonly Commande[]; readonly terminer: boolean }
  | { readonly action: "terminer" }
  | { readonly action: "selectionner"; readonly ids: readonly IdObjet[]; readonly mode: ModeSelection };

/** Une utilisation d'un outil, du premier geste à la validation (cycle §5.8 : sélection → paramètres → aperçu → contrôle → validation). */
export interface SessionOutil {
  traiter(evenement: EvenementPlan): ReactionOutil;
  apercu(): Apercu;
  /** Échap ou changement d'outil : abandon sans écriture. */
  abandonner(): void;
}

export type Activation = { readonly ok: true } | { readonly ok: false; readonly motif: string };

/** Aide située (§5.8) : chaque résultat de palette dit l'action, les conditions d'activation et un exemple court. */
export interface AideOutil {
  readonly action: string;
  readonly conditions: string;
  readonly exemple: string;
}

export interface DefinitionOutil {
  /** Identifiant stable, `famille.nom` (ex. `creer.mur`, `modifier.deplacer`). */
  readonly id: string;
  readonly libelle: string;
  readonly famille: FamilleOutil;
  readonly niveau: NiveauAffichage;
  /** Synonymes français et termes d'autres logiciels (« push/pull », « offset », « trim », « décaler »…). */
  readonly synonymes: readonly string[];
  /** Raccourci clavier simple (une lettre ou `Maj+X`), facultatif ; unicité contrôlée par le registre. */
  readonly raccourci?: string;
  /** Fiches de capacité couvertes (ex. `DA-01-01`). */
  readonly fiches: readonly string[];
  readonly aide: AideOutil;
  /** Vues où l'outil est utilisable. */
  readonly vues: readonly VueTravail[];
  /** L'outil modifie-t-il le modèle ? (sinon : mètre, sélection, mesure — permis en lecture seule) */
  readonly ecrit: boolean;
  activation(ctx: ContexteAtelier): Activation;
  commencer(ctx: ContexteAtelier): SessionOutil;
}

/** Registre des outils (implémentation : `socle/registre.ts`). */
export interface RegistreOutils {
  /** Lève si l'identifiant ou le raccourci est déjà pris. */
  enregistrer(outil: DefinitionOutil): void;
  lister(): readonly DefinitionOutil[];
  trouver(id: string): DefinitionOutil | null;
  /** Recherche de palette : libellé, synonymes, aide ; insensible aux accents et à la casse. */
  rechercher(texte: string, niveau: NiveauAffichage): readonly DefinitionOutil[];
}

// ---------------------------------------------------------------------------------------------------------------
// Inspecteur
// ---------------------------------------------------------------------------------------------------------------

/**
 * Champ d'inspecteur typé (avec unité). La modification d'un champ produit des commandes (`commandes(valeur)`),
 * jamais une écriture directe. `controler` rend une erreur lisible avant envoi (bornes, unité).
 */
export interface ChampInspecteur {
  readonly cle: string;
  readonly libelle: string;
  readonly type: "longueur" | "angle" | "aire" | "nombre" | "texte" | "choix" | "booleen";
  readonly unite?: string;
  readonly valeur: unknown;
  readonly choix?: readonly { readonly valeur: string; readonly libelle: string }[];
  readonly lectureSeule: boolean;
  /** Provenance et statut affichés (importé, saisi, calculé ; à vérifier…). */
  readonly provenance?: string;
  controler(valeur: unknown): ErreurLisible | null;
  commandes(valeur: unknown): readonly Commande[];
}

/** Fournisseur de champs pour une ou plusieurs classes d'objets (enregistré par `objets/**`, `documents/**`). */
export interface DescripteurInspecteur {
  readonly classes: readonly string[];
  champs(objet: ObjetModele, ctx: ContexteAtelier): readonly ChampInspecteur[];
}

// ---------------------------------------------------------------------------------------------------------------
// État partagé de l'interface (niveau, calque, vue, outil actif, niveau d'affichage, favoris)
// ---------------------------------------------------------------------------------------------------------------

/** Paramètres d'affichage : jamais dans le modèle du bâtiment (docs/architecture.md). */
export interface EtatVue {
  readonly niveauActifId: IdObjet | null;
  readonly calqueActifId: IdObjet | null;
  readonly vue: VueTravail;
  readonly niveauAffichage: NiveauAffichage;
  /** Identifiant de l'outil actif ; `null` = sélection. */
  readonly outilActif: string | null;
  /** Identifiants d'outils épinglés, dans l'ordre. */
  readonly favoris: readonly string[];
  /** Calques masqués dans la zone de travail. */
  readonly calquesMasques: readonly IdObjet[];
  readonly immersif: boolean;
}

/** Magasin de l'état de vue (implémentation : `socle/interface.ts`), compatible `useSyncExternalStore`. */
export interface EtatInterface {
  lire(): EtatVue;
  modifier(changement: Partial<EtatVue>): void;
  abonner(ecouteur: () => void): () => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Pilote : session d'outil active (implémentation : `socle/pilote.ts`)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Tient la session de l'outil actif, lui transmet les `EvenementPlan` (venus de `plan2d`, ou des champs de saisie
 * de `ui`), applique sa `ReactionOutil` (validation par le contexte, sélection, fermeture) et publie l'aperçu.
 * `plan2d` appelle `traiter` et dessine `apercu()` ; `ui` appelle `activer` (palette, barre, raccourci) et affiche
 * `apercu().consigne`, `apercu().champs` et `derniereErreur()`.
 */
export interface PiloteOutils {
  /** Active un outil (ou la sélection si `null`) ; abandonne la session en cours. Rend le motif si inactivable. */
  activer(id: string | null): Activation;
  outilActif(): DefinitionOutil | null;
  traiter(evenement: EvenementPlan): Promise<void>;
  /** Aperçu de la session courante ; vide sans session. */
  apercu(): Apercu;
  /** Erreurs de la dernière validation refusée (affichées « objet, cause, action ») ; vide si aucune. */
  derniereErreur(): readonly ErreurLisible[];
  abandonner(): void;
  abonner(ecouteur: () => void): () => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Dessin des objets du modèle dans le plan (dessinateurs par classe, implémentation : `socle/dessin.ts`)
// ---------------------------------------------------------------------------------------------------------------

export type StyleDessin = "trait" | "plein" | "hachure" | "fin" | "annotation";

export type FormeDessin =
  | { readonly forme: "polygone"; readonly points: readonly PointLocal[]; readonly style: StyleDessin }
  | { readonly forme: "polyligne"; readonly points: readonly PointLocal[]; readonly fermee: boolean; readonly style: StyleDessin }
  | { readonly forme: "cercle"; readonly centre: PointLocal; readonly rayon: number; readonly style: StyleDessin }
  | { readonly forme: "arc"; readonly centre: PointLocal; readonly rayon: number; readonly debut: number; readonly fin: number; readonly style: StyleDessin }
  | { readonly forme: "texte"; readonly position: PointLocal; readonly texte: string; readonly hauteur: number; readonly style: StyleDessin };

/** Représentation 2D d'un objet au niveau actif : ce que `plan2d` dessine, accroche et touche. */
export interface DessinPlan {
  readonly objetId: IdObjet;
  /** Ordre de dessin : fond (dalles, pièces), objet (murs, baies, escalier), annotation (cotes, textes). */
  readonly couche: "fond" | "objet" | "annotation";
  readonly formes: readonly FormeDessin[];
  /** Segments d'accrochage (extrémité, milieu, perpendiculaire, intersection). */
  readonly segments: readonly { readonly a: PointLocal; readonly b: PointLocal }[];
  /** Points d'accrochage supplémentaires (centre, point d'insertion). */
  readonly points: readonly PointLocal[];
  /** Contour de sélection (clic à l'intérieur ou à moins de la tolérance) ; `null` = segments seulement. */
  readonly contour: readonly PointLocal[] | null;
}

/**
 * Dessinateur d'une ou plusieurs classes : `plan2d` fournit ceux des esquisses et de la référence de plan,
 * `objets` ceux de l'architecture (murs, baies, dalles, escalier, pièces…), `documents` ceux des cotes et textes.
 * Une classe sans dessinateur n'est pas dessinée (et `plan2d` le signale en développement).
 */
export interface DessinateurPlan {
  readonly classes: readonly string[];
  dessiner(objet: ObjetModele, etat: EtatModele): DessinPlan | null;
}

export interface RegistreDessinateurs {
  enregistrer(d: DessinateurPlan): void;
  pour(classe: string): DessinateurPlan | null;
  /** Dessins des objets d'un niveau (calques masqués exclus), triés par couche. */
  dessinerNiveau(etat: EtatModele, niveauId: IdObjet, calquesMasques?: readonly IdObjet[]): readonly DessinPlan[];
}

export interface RegistreInspecteur {
  enregistrer(d: DescripteurInspecteur): void;
  pour(classe: string): DescripteurInspecteur | null;
}

/** Tout ce qu'un module (`plan2d`, `objets`, `documents`) enregistre au démarrage de l'Atelier. */
export interface Registres {
  readonly outils: RegistreOutils;
  readonly dessinateurs: RegistreDessinateurs;
  readonly inspecteur: RegistreInspecteur;
}

/** Point d'entrée d'un module : `export const installer: InstallationModule = (r) => { r.outils.enregistrer(…); … }`. */
export type InstallationModule = (registres: Registres) => void;
