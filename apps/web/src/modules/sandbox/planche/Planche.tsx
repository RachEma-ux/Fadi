/**
 * Mode « Planche » de l'Atelier (cahier-planche MO-1, §3, lot 2) : géométrie libre façon SketchUp pour le Web, en
 * disposition Canevas (D-156) — dessin plein écran, barre d'outils verticale à gauche (outils « barre » du catalogue,
 * outil récent, grille « … »), colonne de panneaux à droite (Instructeur), barre du bas (barre d'état `aria-live`,
 * champ Mesures). Toute la logique des outils est dans les machines d'états pures de `@parcours/sandbox-planche-model` :
 * cette interface ne fait que traduire pointeur et clavier en `EvenementOutil`, appeler `traiter`, puis afficher
 * `vue()`. Brouillon LOCAL (C6) : aucun envoi au serveur, aucune commande ; annuler / rétablir local.
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COULEUR_MATERIAU_DEFAUT,
  EXTRUSION_TEXTE_3D,
  HAUTEUR_TEXTE_3D,
  IDENTITE,
  adoucirAretes,
  adoucirLisser,
  afficherTout,
  appliquerDeltaPlanche,
  aire,
  analyserSaisie,
  appliquer as appliquerMatrice,
  baliserOccurrences,
  boiteOccurrence,
  cibleDans,
  configurerTexte3D,
  lireAlignementTexte3D,
  contexte as contexteDe,
  famillesNumerotation,
  lirePrefixes,
  nomsNumerotes,
  numeroterEnSerie,
  ordreDeLecture,
  piloterCote,
  nouvellesSortiesDePlage,
  type Cote,
  type DirectionCote,
  cheminOccurrence,
  detacherLiens,
  liensDesFaces,
  copier,
  differencePlanche,
  diviserCourbes,
  eclater,
  effacerEntites,
  etendreSelection,
  exporterObj,
  exporterStl,
  aretesCollees,
  donneesIfcDe,
  empreinteCourte,
  enveloppeNatif,
  importerIfc,
  inverserMatrice,
  lireEchelleColle,
  lireIfcComplet,
  lireTraceColle,
  METRES_PAR_UNITE_COLLE,
  REPERE_DU_MODELE,
  objetsNonAffiches,
  ouvrirEnveloppeNatif,
  poserTraces,
  preparerExport,
  rapportExport,
  rapportImportMaillages,
  sommetsColles,
  texteCoordonnee,
  texteRapport,
  EXTENSION_NATIF,
  type BrancheEtage,
  type LectureColle,
  type RapportEchange,
  type UniteColle,
  genreAnnotation,
  grouper,
  grouperVide,
  deplacerVersContexte,
  intersecterAvecModele,
  inverserFaces,
  machineParId,
  masquerEntites,
  matriceChemin,
  modeleVide,
  modifierAnnotations,
  modifierDefinition,
  modifierPlanDeCoupe,
  nombreOccurrences,
  normalize,
  opererSolides,
  orienterFaces,
  outilParId,
  OUTILS,
  barreGaucheSandbox,
  basculerExtension,
  BORNES_EXTENSION,
  normaliserRaccourci,
  ENTREE_DEUX_TEMPS,
  secondTemps,
  choixEffectif,
  cleCommandeExtension,
  clesMasquees,
  idBarreExtension,
  imageIcone,
  nomAppelPanneau,
  BORNES_OUTIL,
  MACHINE_OUTIL_EXTENSION,
  avecDescription,
  cleOutilExtension,
  lireCleOutilExtension,
  lireDescriptionOutil,
  nomAppelOutil,
  type CurseurOutil,
  type EtatOutilExtension,
  type EvenementOutilExtension,
  nomAppelCommande,
  destinatairesEvenement,
  resumerChangement,
  type CauseEvenement,
  type EvenementExtension,
  type AccesPlanche,
  type FichierLu,
  type EntreeDeclaree,
  type PaquetExtension,
  type ValeursSaisie,
  contenuExtension,
  entreeDeCle,
  extensionActive,
  extensionDeCle,
  EXTENSIONS_SANDBOX,
  entreeOutil,
  entreePanneau,
  entreesSandbox,
  type Pictogramme as DescriptionPictogramme,
  peindreFacesCote,
  peindreOccurrences,
  rechercherOutil,
  rendreUnique,
  renommerOccurrence,
  sub,
  verrouillerOccurrences,
  viser,
  viserAnnotation,
  type AdaptateurBooleens,
  type MetadonneesDefinition,
  type ReglagesPlanche,
  type Scene,
  type Vec3,
  type ContexteOutil,
  type EtatTexte3D,
  type EvenementOutil,
  type Modele,
  type Outil,
  type ParametresTexte3D,
  type Touche,
  type Transition,
  type VueOutil,
  FRAPPE_SEULE_VIDE,
  appuiFrappe,
  consommerFrappe,
  oublierFrappe,
  relacheFrappe,
  type EtatFrappeSeule,
  type ModificateurSeul,
  type SectionCourante,
  csvDebit,
  effacerEtiquettesPieces,
  CHOIX_NETTOYAGE_DEFAUT,
  type Emplacement,
  type PointDeBase,
  nordDepuisArete,
  annotationsDe,
  REGLAGES_DEFAUT,
  matriceMonde,
  type ComposantDynamique,
  definirDynamique,
  definirParametre,
  redessinerDynamique,
  type ChoixNettoyage,
  controlerModele,
  releverDefauts,
  compterDefauts,
  corrigerDefaut,
  indiceDefaut,
  reglagesControle,
  changerReglagesControle,
  preparerFondDao,
  fusionnerVolumes,
  lireReglesPieces,
  poserReglesPieces,
  evaluerPieces,
  controlerSite,
  type OptionsFondDao,
  type ReglagesControle,
  type EtatSite,
  nettoyerModele,
  objetsNonSolides,
  rienANettoyer,
  listeDebit,
  numeroterPieces,
  etiquettesDebit,
  poserEtiquettesPieces,
  reperesRenumerotes,
  trierDebit,
  type LigneDebit,
  axesDesPieces,
  separerDiagnostic,
  changerSectionPiece,
  tournerPieceAxe,
  CLES_PERSONNALISABLES,
  MAX_NOM_REGROUPEMENT,
  MAX_REGROUPEMENTS,
  idRegroupement,
  changerLongueurArete,
  changerUnite,
  exclureDeLAccrochage,
  formaterLongueurUnite,
  placerSommet,
  poserParametre,
  remettreAEchelleImport,
  repartir,
  repeterGuide,
  supprimerParametre,
  type GenreAccrochage,
  type UniteSaisie,
} from "@parcours/sandbox-planche-model";
import { etatUi, useEtatUi } from "../etat-ui";
import { FilArianePlanche } from "../fil-ariane-planche";
import { MenuPlanche, ECHELLE_UNITE, nomAffiche, type ActionsMenuPlanche, type ExtensionsMenu, type FormatEchange, type UniteFichier } from "./menu-planche";
import {
  type ContexteTravail,
  type HistoriqueContextes,
  contexteDepuisDocument,
  CONTEXTE_MODELE,
  contextePrecedent,
  contexteTemporaire,
  contexteDuModele,
  ajouterNiveau,
  lireSaisieNiveau,
  modifierNiveau,
  niveauSuivant,
  niveauxTries,
  tableauLocaux,
  ajouterMotifs,
  associerMotif,
  familleSimple,
  lirePat,
  modifierMotif,
  planDeCoupeActif,
  projeterPlan,
  supprimerMotif,
  svgPlan,
  type ResultatMotif,
  poserMurs,
  chainesDAretes,
  lireNombreSaisi,
  type JonctionMur,
  type ReferenceMur,
  localDeLaFace,
  numeroSuivant,
  creerLocal,
  modifierLocal,
  supprimerLocal,
  lireSaisieLocal,
  type SaisieLocal,
  type ErreurLocal,
  rattacherAuNiveau,
  rattacherNouveauxObjets,
  repereDuNiveau,
  supprimerNiveau,
  texteAltitude,
  type ErreurNiveau,
  deplacerOrigine,
  pivoterRepere,
  type BaseAxe,
  type NomAxe,
  type PlanRepere,
  historiqueInitial as historiqueContextes,
  planDuContexte,
  pousserContexte,
  repereDepuisFace,
  repereDuContexte,
} from "@parcours/sandbox-planche-model";
import { contexteMemorise, memoriserContexte } from "./contexte-travail";
import { BarreReperes, libellePlan } from "./BarreReperes";
import { PanneauReperes } from "./PanneauReperes";
import { PanneauOrigineComposant } from "./PanneauOrigineComposant";
import { type OptionsOrigine, changerOrigineLot, detacherRepereLie, enregistrerRepereLie, mettreAJourDepuisSource, modeleAExporter } from "@parcours/sandbox-planche-model";
import {
  captureDuContexte,
  contexteDeScene,
  contexteEnregistre,
  dupliquerRepere,
  enregistrerRepere,
  etatRepereActif,
  mettreAJourRepere,
  renommerRepere,
  reperesEnregistres,
  supprimerRepere,
} from "@parcours/sandbox-planche-model";
import { COMMANDES_REPERES, type IdCommandeRepere, disponibiliteRepere, nomRepereActif, planSuivant, verrouApplicable } from "./commandes-reperes";
import { ErreurImport, compter as compterContexte, exporterIfc, importerMaillages, lireMaillages, maillagesPlanche, nonEtanchesDe, omisExport } from "@parcours/sandbox-planche-model";
import { ajouterEntree, chargerJournal, dernieresEntrees, enregistrerJournal, supprimerJournal, type EntreeJournal } from "./journal-planche";
import { avecCourante, avecInfo, avecNouvelle, chargerIndex, enVariante, enregistrerIndex, indexInitial, nouvelId, planche as plancheDe, sansPlanche, supprimerDocument, variantesDe, type IndexPlanches, type InfoPlanche } from "./registre-planches";
import { ChoixPeripherique } from "../panneaux/Navigation";
import { CATALOGUE, LANGUE_INTERFACE, type CleMessage, t } from "../messages";
import { AvisExtensions, CadrePanneauExtension, DialogueFichierExtension, DialogueSaisieExtension, IconeExtension, ajouterAvis, clePanneauExtension, retirerFichier, retirerSaisie, texteFiche, useExtensionsInstallees, type AvisAffiche, type FichierDemande, type ReponseActionPanneau, type SaisieOuverte } from "./extensions-installees";
import { creerHoteExtension, type HoteExtension, type IssueAppelExtension } from "./hote-extensions";
import { ChoixLangue } from "../../../components/ChoixLangue";
import { annuler, enregistrer, historiqueInitial, operationAAnnuler, operationARetablir, retablir, type Historique } from "./historique";
import { chargerBrouillon, enregistrerBrouillon, lireBrouillon, serialiserBrouillon } from "./brouillon";
import { creerSauvegardeBrouillon, type EtatSauvegarde } from "./sauvegarde-brouillon";
import { OUTILS_BOOLEENS, OUTILS_CAMERA_TEMPORAIRES, afficherRaccourci, commenceSaisie, disponibilite, estOutilCamera, estRecherche, libelleOutil, lotPrevu, nomOutil, outilDuClavier, outilsDeBarre, pictoOutil, raccourciClavier, raccourciOutil, sectionsGrille, titreOutil, toucheEtat, type OutilCamera } from "./outils-planche";
import { HAUTEUR_OEIL_DEFAUT, OPTIONS_AFFICHAGE_DEFAUT, VuePlanche, type OptionsAffichage, type VueStandard } from "./vue-planche";
import { DialogueComposant, DialogueDeplacer, MenuContextuel, NavigateurPlanche, PanneauAdoucir, PanneauAffichage, PanneauComposants, PanneauInfoEntite, PanneauInfoModele, PanneauOmbres, PanneauScenes, PanneauStyles, type EntreeMenu, type ParametresComposant } from "./panneaux-objets";
import { type ActionBarre, BarreActions } from "../panneaux/BarreActions";
import { ActionsBandeau, BoutonBandeau } from "../panneaux/ActionsBandeau";
import { MenusBandeau, type EntreeMenuBandeau, type MenuBandeau } from "../panneaux/MenusBandeau";
import { tailleFenetreDetachee } from "./taille-fenetre-detachee";
import { largeurVueEcranLarge } from "./ecran-large";
import { COMMANDES_DEUX_TEMPS, commandeDuClavier, commandeDuSecondTemps, estEntreeDeuxTemps, routeeParLeRegistre, type EntreeRegistre } from "./registre-commandes";
import { useNavigationBarre } from "../navigation-barre";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { curseurOutil } from "../pictogrammes/curseur";
import { usePreferencesSandbox } from "../preferences/usePreferencesSandbox";
import { PanneauPersonnaliser } from "../preferences/PanneauPersonnaliser";
import { COMMANDES_CONTROLE, disponibiliteControle, type IdCommandeControle, COMMANDES_DYNAMIQUE, disponibiliteDynamique, type IdCommandeDynamique, COMMANDES_EMPLACEMENT, disponibiliteEmplacement, type IdCommandeEmplacement, COMMANDES_SCRIPTS, disponibiliteScripts, type IdCommandeScripts, COMMANDES_NUMEROTATION, disponibiliteNumerotation, type IdCommandeNumerotation, COMMANDES_NIVEAUX, disponibiliteNiveau, type IdCommandeNiveau, COMMANDES_LOCAUX, disponibiliteLocal, type IdCommandeLocal, COMMANDES_MUR, disponibiliteMur, type IdCommandeMur, COMMANDES_PLAN, disponibilitePlan, type IdCommandePlan, COMMANDES_ACCROCHAGE, GENRE_FORCE, disponibiliteAccrochage, type IdCommandeAccrochage, disponibiliteDebit, type IdCommandeDebit, COMMANDES_PIECE, disponibilitePiece, type IdCommandePiece, COMMANDES_CONTEXTE, COMMANDES_DEBIT, COMMANDES_NAVIGATEUR, COMMANDES_OBJETS, COMMANDES_VUE, COMMANDE_DETACHER_LIEN, PAS_ZOOM, ciblesDeplacement, disponibiliteNavigateur, disponibiliteObjet, disponibiliteVue, type IdCommandeVue, filAriane, liensRompus, type EtatSelectionObjets, type IdCommandeContexte, type IdCommandeNavigateur, type IdCommandeObjet } from "./commandes-objets";
import { BarreOutilsFlottante, type BoutonBarre } from "./BarreOutilsFlottante";
import { barreDeLOutil, barresLivrees, barresPersonnelles, entreesDe, extensionDeLaCommande, groupeDeCommande, idBarreGroupe, nomDeCopie, normaliserBarres, type BarreNommee } from "./barres-nommees";
import { SECTIONS } from "./barres-outils";
import { PanneauProfiles, type ChoixSection } from "./panneau-profiles";
import { PanneauDebit, REGLAGES_DEBIT_DEFAUT, type ReglagesDebit } from "./panneau-debit";
import { PanneauControle, type VueControle } from "./panneau-controle";
import { PanneauDynamique } from "./panneau-dynamique";
import { PanneauEmplacement } from "./panneau-emplacement";
import { SectionPointDeBase } from "./panneau-point-de-base";
import { PanneauLocaux } from "./panneau-locaux";
import { type ApercuPlan, type OptionsPlan, PanneauPlanVectoriel, type SaisieMotif, type SourcePlan, TRAITS_PLAN } from "./panneau-plan-vectoriel";
import { BarreMur } from "./barre-mur";
import { PanneauNiveaux, type SaisieNiveau } from "./panneau-niveaux";
import { emplacementDepuisSite, ORDRE_ARTICLES, useSitesProjet, type ArticleSites } from "../../../lib/sites/menu-sites";
import { ErreurEmplacementsGeoData, lireEmplacementGeoDataParId, listerEmplacementsGeoData, PARAMETRE_EMPLACEMENT_GEODATA, type EmplacementGeoDataLu } from "./emplacements-geodata";
import { PanneauNumerotation, REGLAGES_NUMEROTATION_DEFAUT, type ReglagesNumerotation } from "./panneau-numerotation";
import { PanneauAccrochage, PanneauMetreMesure, REGLAGES_METRE_DEFAUT, type ReglagesMetre, SectionParametres, SectionRemiseEchelle, SectionUnites, lireNombre, resultatRepartition } from "./panneau-accrochage";
import { PanneauScripts, scriptExemple, SCRIPT_NOUVEAU, type IssueAffichee, type ScriptEdite } from "./panneau-scripts";
import { lancerScript, type ExecutionScript } from "./scripts-execution";
import { LOCALE } from "../../../lib/i18n";
import { sectionDepuisFace, sectionSaisie } from "./sections-planche";
import { BoutonOutils, titreOperation, type CommandeListe, type FamilleExtension, type LigneBarre } from "./BoutonOutils";
import { archiverFichierExtension, listerFichiersArchives, lireFichierArchive } from "../preferences/client";
import {
  EXTENSION_GABARIT,
  NOMS_PHASES,
  VUES_ETAT,
  ajouterScenes,
  appliquerEtatScene,
  appliquerVueEtat,
  baliserNouveautes,
  capturerEtatScene,
  classerSelection,
  compterSelection,
  creerBalisesPhase,
  decalerPlan,
  gabaritDeLaPlanche,
  limiterProfondeur,
  lireGabarit,
  modeleDepuisGabarit,
  modifierBalise,
  modifierScene,
  placerPlan,
  sceneFaceCoupe,
  scenesTypes,
  vueEtatCourante,
  type ChangementBalise,
} from "@parcours/sandbox-planche-model";
import { COMMANDES_BALISE, COMMANDES_ECHANGE, COMMANDES_GABARIT, COMMANDES_SCENE, COMMANDES_VERSION, disponibiliteBalise, disponibiliteEchange, disponibiliteGabarit, disponibiliteScene, disponibiliteVersion, type IdCommandeBalise, type IdCommandeEchange, type IdCommandeGabarit, type IdCommandeScene, type IdCommandeVersion } from "./commandes-objets";
import {
  comparerModeles,
  declarerDestinataire,
  empreinteModele,
  ficheDe,
  lignesFiche,
  noterEmission,
  poserFiche,
  poserJalon,
  poserRevision,
  registreVide,
  revisionDe,
  segmentsDifferences,
  statutsProposes,
  texteRevision,
  type Comparaison,
  type FicheProjet,
  type Jalon,
  type RegistreVersions,
  type Revision,
} from "@parcours/sandbox-planche-model";
import { PanneauBrouillon, PanneauComparer, PanneauFicheProjet, PanneauVersions, RACCOURCI_PANNEAU_L7, type ChoixComparaison, type VarianteAffichee } from "./panneaux-l7";
import { chargerJalon, chargerRegistre, enregistrerContenuJalon, enregistrerRegistre, supprimerVersions } from "./versions-stockage";
import { PanneauBalises, PanneauGabarit, SectionPlanCoupe, SectionScenesL4, type GabaritDisponible } from "./panneaux-l4";
import { PanneauCollerTrace, PanneauExportEchange, PanneauImportEchange, PanneauNatifImage, type EcritExport, type PoserSur } from "./panneaux-l6";
import { barresRendues, basculerBarre, reinitialiserDisposition } from "./barres-outils-disposition";
import { chargerBooleens } from "./booleens-manifold";
import "../sandbox.css";

/**
 * Instrumentation de la recette (lecture seule) : modèle du brouillon, outil actif, projection écran. Posée sur
 * `window.fadiPlanche` sans déclaration globale : la Planche de l'Atelier en déclare une avec son propre modèle
 * (`@parcours/planche-model`), que celui du Sandbox ne recouvre plus depuis les repères enregistrés (chantier Axes).
 */
interface CrochetRecette {
      modele: () => Modele;
      outil: () => string;
      etatOutil: () => unknown;
      selection: () => readonly string[];
      pas: () => number;
      versEcran: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null;
      /** Lots 4 à 6 : matière et balise courantes, hauteur d'œil, moteur booléen chargé, emprise et caméra. */
      materiau: () => string | null;
      balise: () => string | null;
      echelleRendue: () => number | null;
      plansRognage: () => number;
      hauteurOeil: () => number;
      booleens: () => "absent" | "chargement" | "ok" | "echec";
      emprise: () => { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
      camera: () => { position: { x: number; y: number; z: number }; champDeVision: number };
      /** Lot 5 (objets) : contexte d'édition, panneau ouvert, options d'affichage, menu contextuel ouvert, presse-papiers. */
      dans: () => string | undefined;
      panneau: () => string | null;
      options: () => OptionsAffichage;
      menu: () => readonly string[] | null;
      /** Objets O-5 : nombre de faces rendues par la vue (isolement, masquer le reste). */
      facesRendues: () => number;
      pressePapiers: () => number;
      /** Chantier Axes (AX-1) : contexte de travail courant (repère, plan, verrou) et nombre de contextes précédents. */
      contexteTravail: () => { contexte: ContexteTravail; precedents: number };
      differences: () => { readonly ajoutes: number; readonly modifies: number; readonly supprimes: number } | null;
      consultation: () => string | null;
}
const fenetreRecette = (): { fadiPlanche?: CrochetRecette } => window as unknown as { fadiPlanche?: CrochetRecette };

export interface PropsPlanche {
  /** Lecture seule (jamais en Sandbox : la Planche y est entièrement à soi). */
  readOnly?: boolean;
}

/** Locale française du champ Mesures : virgule décimale, point-virgule de liste (proposition P-3, cahier §5.3). */
const SEPARATEUR_DECIMAL = "," as const;
/** Pictogramme de repli d'une commande d'extension installée (son icône est une image du paquet). */
const PICTO_EXTENSION_INSTALLEE: DescriptionPictogramme = { source: "tabler", nom: "puzzle", teinte: "objets" };
/** Téléchargement d'un fichier produit dans la page (IFC de la Planche, PNG de la vue). */
/** Cas 2, lot 6 : date et heure locales du rapport d'échange (« 27.11.2026 19:40 »). */
function horodatage(d = new Date()): string {
  const n = (x: number) => String(x).padStart(2, "0");
  return `${n(d.getDate())}.${n(d.getMonth() + 1)}.${d.getFullYear()} ${n(d.getHours())}:${n(d.getMinutes())}`;
}

/** Cas 2, lot 7 (n° 109) : fiche du projet et révision reprises dans le rapport d'une pièce émise (document produit, non traduit). */
function pieceEmise(m: Modele): { readonly projet: readonly (readonly [string, string])[]; readonly revision: string | null } {
  return { projet: lignesFiche(ficheDe(m)), revision: texteRevision(revisionDe(m)) };
}

function telechargerFichier(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
type Panneau = "personnaliser" | "instructeur" | "materiaux" | "balises" | "info-entite" | "composants" | "styles" | "ombres" | "scenes" | "affichage" | "adoucir" | "info-modele" | "navigateur" | "debit" | "reperes" | "controle" | "dynamique" | "emplacement" | "scripts" | "niveaux" | "locaux" | "numerotation" | "plan-vectoriel" | "accrochage" | "metre-mesure" | "gabarit" | "echange-import" | "echange-export" | "natif-image" | "coller-trace" | "versions-jalons" | "comparer" | "brouillon" | "fiche-projet";
/**
 * Colonne de droite (lot 4, comme le plateau de SketchUp) : chaque panneau à un clic, dans l'ordre du registre, Info
 * modèle en bas (emplacement « colonne-bas ») ; la sous-liste « Objets et vue » a disparu.
 */
const COLONNE: readonly { readonly id: Panneau; readonly picto: DescriptionPictogramme; readonly bas: boolean }[] = entreesSandbox("panneau").map((e) => ({
  id: e.id as Panneau,
  picto: e.pictogramme,
  bas: e.emplacement === "colonne-bas",
}));
/** Pictogramme d'un panneau, lu au registre. */
const pictoPanneau = (id: Panneau): DescriptionPictogramme => entreePanneau(id).pictogramme;
/** Panneaux au cadre commun (titre, fermer) ; Instructeur, Matériaux et Balises ont le leur. */
const PANNEAUX_COMMUNS: ReadonlySet<string> = new Set([...COLONNE.map((p) => p.id).filter((id) => id !== "instructeur" && id !== "materiaux" && id !== "balises"), "accrochage", "metre-mesure", "gabarit", "echange-import", "echange-export", "natif-image", "coller-trace", "versions-jalons", "comparer", "brouillon", "fiche-projet"]);
/** Précision d'affichage (Info modèle) : préférence de l'appareil (R10), jamais une donnée de la Planche. */
/** Longueurs en mètres d'un texte d'outil (« 2.40 m », « ~ 1,5 m ») réécrites dans l'unité du projet ; mètres : inchangé. */
export function convertirLongueursAffichees(texte: string, unite: UniteSaisie | undefined, sep: "." | ","): string {
  if (!unite || unite === "m") return texte;
  return texte.replace(/(-?\d+(?:[.,]\d+)?) m(?![²³\w])/g, (_, n: string) => formaterLongueurUnite(Number(n.replace(",", ".")), unite, sep, 3));
}
const CLE_PRECISION = "fadi.sandbox.planche.precision";
function lirePrecision(): number {
  try {
    const v = Number(window.localStorage.getItem(CLE_PRECISION));
    return Number.isInteger(v) && v >= 0 && v <= 6 ? v : 2;
  } catch {
    return 2;
  }
}

type TexteMesures = { texte: string; statut: "frappe" | "valide" } | null;

/** Champ de saisie, dans la page comme dans la fenêtre détachée (autre document : `instanceof` n'y vaut rien). */
function champSaisie(cible: EventTarget | null): boolean {
  const el = cible as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

/**
 * Élément DOM sans `instanceof` : la Planche détachée vit dans une autre fenêtre (Document Picture-in-Picture), dont les
 * nœuds ne sont pas des `Element` de la page (autre « realm ») — `instanceof Element` y serait toujours faux.
 */
function commeElement(x: EventTarget | null): Element | null {
  return x !== null && typeof (x as Element).closest === "function" ? (x as Element) : null;
}

const virgule = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

export function Planche({ readOnly: lectureProp = false }: PropsPlanche) {
  // Cas 2, lot 7 (n° 86) : consultation seule — la Planche courante, ou un jalon figé dont le modèle remplace un moment
  // l'historique (`retour` le rend à la sortie). Lecture seule : aucun outil de modification, aucun enregistrement.
  const [consultation, setConsultation] = useState<{ readonly jalon: Jalon | null; readonly retour: Historique | null } | null>(null);
  const consultationRef = useRef(consultation);
  consultationRef.current = consultation;
  const readOnly = lectureProp || consultation !== null;
  const ui = useEtatUi();
  const navigationRef = useRef(ui.navigation);
  navigationRef.current = ui.navigation;

  // --- État de l'outil et du brouillon (refs = source de vérité synchrone ; états = rendu).
  const histRef = useRef<Historique>(historiqueInitial(modeleVide()));
  // Lot 7 : Planche ouverte (définition « planche » du projet) ; null = brouillon local (projet sans Planche).
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const [hist, setHist] = useState(histRef.current);
  // Chantier Axes (AX-1, AX-D3) : contexte de travail personnel — repère, plan, verrou — et son historique de session
  // (« Repère précédent »), hors de l'historique de géométrie ; mémorisé par Planche dans ce navigateur.
  const histContexteRef = useRef<HistoriqueContextes>(historiqueContextes());
  const [histContexte, setHistContexte] = useState(histContexteRef.current);
  const poserContextes = useCallback((h: HistoriqueContextes) => {
    histContexteRef.current = h;
    setHistContexte(h);
    memoriserContexte(indexRef.current.courante, h.courant);
  }, []);
  const changerContexte = useCallback((c: ContexteTravail) => poserContextes(pousserContexte(histContexteRef.current, c)), [poserContextes]);
  useEffect(() => vueRef.current?.poserRepereTravail(histContexte.courant.repere), [histContexte]);
  // Chantier Axes (AX-3) : triade d'orientation (préférence de l'appareil) et sa légende.
  const triadeUi = useEtatUi().triade;
  useEffect(() => {
    vueRef.current?.poserTriade(triadeUi, t("planche.reperes.triade", { repere: t(triadeUi.represente === "modele" ? "planche.reperes.affichage.represente.modele" : "planche.reperes.affichage.represente.travail") }));
  }, [triadeUi, histContexte]);
  const outilRef = useRef(OUTIL_INITIAL());
  const precedentRef = useRef(outilRef.current);
  const [outilId, setOutilId] = useState(outilRef.current);
  const etatMachineRef = useRef<unknown>(machineParId(outilRef.current)?.initial() ?? null);
  // Contexte d'édition (groupe / composant ouvert, §5.6) : état d'interface, jamais une donnée (R10).
  const dansRef = useRef<string | undefined>(undefined);
  const [dans, setDans] = useState<string | undefined>(undefined);
  // Objets O-2 (revue) : chemin complet du contexte ouvert (racine → dans) ; dans un composant à plusieurs occurrences,
  // l'identifiant d'un objet imbriqué ne dit pas sous laquelle on l'a ouvert.
  const cheminRef = useRef<readonly string[]>([]);
  const [chemin, setChemin] = useState<readonly string[]>([]);
  const selectionRef = useRef<readonly string[]>([]);
  const [vue, setVue] = useState<VueOutil>(() => vueParDefaut(outilRef.current, 35, HAUTEUR_OEIL_DEFAUT));
  const texteRef = useRef<TexteMesures>(null);
  const [texte, setTexteEtat] = useState<TexteMesures>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [grille, setGrille] = useState(false);
  const grilleRef = useRef(false);
  grilleRef.current = grille;
  const [recherche, setRecherche] = useState(false);
  const rechercheRef = useRef(false);
  rechercheRef.current = recherche;
  // Panneaux exclusifs, fermés à l'ouverture (comme le Canevas, D-156) : le dessin reste dégagé.
  const [panneau, setPanneauEtat] = useState<Panneau | null>(null);
  const panneauRef = useRef<Panneau | null>(null);
  /** Panneau d'une extension installée (lot 4) : exclusif des panneaux de la Planche, dans la même colonne. */
  const [panneauExtension, setPanneauExtensionEtat] = useState<{ readonly extension: string; readonly panneau: string } | null>(null);
  const panneauExtensionRef = useRef<{ readonly extension: string; readonly panneau: string } | null>(null);
  const setPanneau = useCallback((p: Panneau | null) => {
    panneauRef.current = p;
    setPanneauEtat(p);
    if (p !== null) {
      panneauExtensionRef.current = null;
      setPanneauExtensionEtat(null);
    }
  }, []);
  const setPanneauExtension = useCallback((x: { readonly extension: string; readonly panneau: string } | null) => {
    if (x !== null) {
      panneauRef.current = null;
      setPanneauEtat(null);
    }
    panneauExtensionRef.current = x;
    setPanneauExtensionEtat(x);
  }, []);
  /** Ce que l'extension envoie à la page de son panneau ouvert. */
  const canalPanneauRef = useRef<((donnees: unknown) => void) | null>(null);
  const brancherPanneau = useCallback((recevoir: (donnees: unknown) => void) => {
    canalPanneauRef.current = recevoir;
    return () => {
      if (canalPanneauRef.current === recevoir) canalPanneauRef.current = null;
    };
  }, []);
  // Lot 5 (objets, §5.8 / §6) : options d'affichage de la vue (R10 : jamais écrites dans la Planche), menu contextuel,
  // boîte « Créer un composant », presse-papiers (ids + contexte), dernières entités masquées (« Réafficher ▸ Dernier »).
  const [options, setOptionsEtat] = useState<OptionsAffichage>(OPTIONS_AFFICHAGE_DEFAUT);
  const [menu, setMenuEtat] = useState<{ x: number; y: number; entrees: EntreeMenu[] } | null>(null);
  const menuRef = useRef<{ x: number; y: number; entrees: EntreeMenu[] } | null>(null);
  const setMenu = useCallback((m: { x: number; y: number; entrees: EntreeMenu[] } | null) => {
    menuRef.current = m;
    setMenuEtat(m);
  }, []);
  const [dialogueComposant, setDialogueComposant] = useState(false);
  // Objets O-4 : « Déplacer vers un groupe… » (objets à ranger et contexte d'où ils partent) et renommage au Navigateur.
  const [dialogueDeplacer, setDialogueDeplacer] = useState<{ ids: readonly string[]; dans: string | undefined } | null>(null);
  const [renommage, setRenommage] = useState<readonly string[] | null>(null);
  // Objets O-5 : isolement de la vue (contexte et entités isolés) ; jamais écrit dans le modèle, levé par la même commande.
  const [isolement, setIsolementEtat] = useState<{ chemin: readonly string[]; ids: readonly string[] } | null>(null);
  const isolementRef = useRef<{ chemin: readonly string[]; ids: readonly string[] } | null>(null);
  const pressePapiers = useRef<{ ids: readonly string[]; dans: string | undefined; source: Modele } | null>(null);
  const derniersMasques = useRef<{ ids: readonly string[]; dans: string | undefined } | null>(null);
  const [precision, setPrecision] = useState(() => lirePrecision());
  const [camera, setCamera] = useState<{ projection: "perspective" | "parallele"; champDeVision: number }>({ projection: "perspective", champDeVision: 35 });
  // Cas 2, lot 4 : scène rappelée, pas et échelle de la coupe, gabarits d'agence du compte (lus en base à l'ouverture du
  // panneau « Nouvelle Planche »), gabarit choisi. État d'interface.
  const [sceneActive, setSceneActive] = useState<string | null>(null);
  const [pasCoupe, setPasCoupe] = useState(0.1);
  const [echelleCoupe, setEchelleCoupe] = useState<number | null>(null);
  const [gabarits, setGabarits] = useState<readonly GabaritDisponible[]>([]);
  const [gabaritChoisi, setGabaritChoisi] = useState("");
  const [noteGabarit, setNoteGabarit] = useState<string | null>(null);
  const fichierGabaritRef = useRef<HTMLInputElement | null>(null);
  // Cas 2, lot 6 : échanges (rapport du dernier import, export préparé, fichier natif et image, collage d'un tracé).
  const [rapportImport, setRapportImport] = useState<{ readonly rapport: RapportEchange; readonly arbre: readonly BrancheEtage[] } | null>(null);
  const [archiveImport, setArchiveImport] = useState<string | null>(null);
  const [formatExport, setFormatExport] = useState<FormatEchange>("ifc");
  const [inclureMasques, setInclureMasques] = useState(false);
  const [balisesIncluses, setBalisesIncluses] = useState<ReadonlySet<string>>(new Set());
  const [dernierNatif, setDernierNatif] = useState<{ readonly date: string; readonly empreinte: string } | null>(null);
  const [reimportNatif, setReimportNatif] = useState<"conforme" | "refuse" | null>(null);
  const [noteNatif, setNoteNatif] = useState<string | null>(null);
  const [tailleImage, setTailleImage] = useState({ largeur: 3840, hauteur: 2160 });
  const [imageTransparente, setImageTransparente] = useState(true);
  const fichierNatifRef = useRef<HTMLInputElement | null>(null);
  const [colle, setColle] = useState<LectureColle | null>(null);
  const [uniteColle, setUniteColle] = useState<UniteColle | "">("");
  const [echelleColle, setEchelleColle] = useState("1:1");
  const [poserColle, setPoserColle] = useState<PoserSur>("travail");
  const attenteCollerRef = useRef(0);
  const ouvrirCollageRef = useRef<(l: LectureColle) => void>(() => {});
  // Lot 5 : matière et balise courantes (panneaux Matériaux / Balises) ; `null` = matière par défaut / aucune balise.
  const materiauRef = useRef<string | null>(null);
  const [materiau, setMateriauEtat] = useState<string | null>(null);
  const baliseRef = useRef<string | null>(null);
  const [balise, setBaliseEtat] = useState<string | null>(null);
  // Lot L12 : section des outils Profilé (catalogue sourcé du projet, dimensions saisies ou face), passée aux machines.
  const sectionRef = useRef<SectionCourante | null>(null);
  // Cas 4, étape 4 : épaisseur et hauteur de l'outil Mur (barre d'options), relues par la machine dans son contexte.
  const murRef = useRef<{ epaisseur: number; hauteur: number } | null>({ epaisseur: 0.2, hauteur: 2.5 });
  const [choixSection, setChoixSection] = useState<ChoixSection>({ mode: "saisie", dimensions: { forme: "rectangle", largeur: "", hauteur: "", epaisseur: "", epaisseurAile: "", segments: "" } });
  const [angleRotation, setAngleRotation] = useState("90");
  const [erreurFace, setErreurFace] = useState<string | null>(null);
  // Lot L14 : réglages de la liste de débit (portée, renumérotation, masse volumique déclarée avec sa source, tri).
  const [reglagesDebit, setReglagesDebit] = useState<ReglagesDebit>(REGLAGES_DEBIT_DEFAUT);
  const [noteDebit, setNoteDebit] = useState<string | null>(null);
  // Extension « Contrôle et nettoyage » : ce que le nettoyage retire (choix de la séance) et le dernier résultat.
  const [choixNettoyage, setChoixNettoyage] = useState<ChoixNettoyage>(CHOIX_NETTOYAGE_DEFAUT);
  const [noteControle, setNoteControle] = useState<string | null>(null);
  // Cas 2, lot 3 : vue du panneau Contrôle, défaut courant, options du fond DAO.
  const [vueControle, setVueControle] = useState<VueControle>("releve");
  const [indiceControle, setIndiceControle] = useState(-1);
  const [optionsFondDao, setOptionsFondDao] = useState<OptionsFondDao>({ aplatir: true, souder: 0.005, faces: true });
  // Le panneau rouvert (colonne) montre le relevé ; la vue choisie par une commande ne survit pas à sa fermeture.
  useEffect(() => {
    if (panneau !== "controle") setVueControle("releve");
  }, [panneau]);
  // Lot 6 : moteur booléen (manifold-3d) chargé à la demande, au premier choix d'un outil de solides.
  const booleensRef = useRef<AdaptateurBooleens | null>(null);
  const [booleens, setBooleens] = useState<"absent" | "chargement" | "ok" | "echec">("absent");
  const booleensEtatRef = useRef(booleens);
  booleensEtatRef.current = booleens;
  // Lot 4 : hauteur d'œil (Positionner la caméra, Regarder autour, Marcher), réglable au champ Mesures.
  const hauteurOeilRef = useRef(HAUTEUR_OEIL_DEFAUT);
  const [, setHauteurOeilEtat] = useState(HAUTEUR_OEIL_DEFAUT);
  // Lot 4 : texte d'annotation en cours de saisie (outil Texte) : l'interface tient le champ, la machine reçoit `saisie`.
  const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  const editionRef = useRef<HTMLTextAreaElement | null>(null);
  const validerEditionRef = useRef<() => void>(() => undefined);
  const [recent, setRecent] = useState<string | null>(null);
  const [tactile, setTactile] = useState(false);
  // Téléphone (≤ 760 px) : annuler / rétablir vivent dans le volet bas, l'aide dans la barre du haut.
  const [etroit, setEtroit] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const etroitRef = useRef(etroit);
  etroitRef.current = etroit;
  // Écran tactile dès l'ouverture (un pointeur grossier, même secondaire, ou des points de contact) : les boutons zoom + / −
  // sont visibles sans attendre un premier toucher, y compris sur un portable à écran tactile piloté à la souris.
  const [pointeurGrossier] = useState(() => typeof window !== "undefined" && (window.matchMedia("(any-pointer: coarse)").matches || (navigator.maxTouchPoints ?? 0) > 0));
  const [majVerrouillee, setMajVerrouillee] = useState(false);
  // Barres d'opérations flottantes (D-198) : haut de la barre rangée en bas au téléphone (la barre d'actions s'en écarte).
  const [hautDocquee, setHautDocquee] = useState<number | null>(null);
  const afficherBarre = useCallback((id: string, afficher: boolean) => etatUi.set((u) => ({ barresOutils: basculerBarre(normaliserBarres(u.barresOutils), id, afficher) })), []);
  // Barres nommées (25 novembre 2026) : un état mémorisé avant cette date retenait des identifiants d'outil ; il est
  // ramené une fois aux identifiants de barre (la barre de l'objet de chaque outil, sans doublon).
  useEffect(() => {
    const e = etatUi.get().barresOutils;
    const n = normaliserBarres(e);
    if (n !== e) etatUi.set({ barresOutils: n });
  }, []);
  /** Barre personnelle ouverte dans « Personnaliser » par « Modifier », « Dupliquer » ou « Nouvelle barre… ». */
  const [barreEditee, setBarreEditee] = useState<{ groupe: string | null; jeton: number }>({ groupe: null, jeton: 0 });
  const [webgl, setWebgl] = useState<"ok" | "indisponible">("ok");
  // Volet bas (téléphone) : replié, la consigne tient sur une ligne ; déployé, consigne complète et flèches.
  const [volet, setVolet] = useState(false);
  // Rail d'outils replié par défaut (pictogrammes seuls, libellés en info-bulle) ; « » » affiche les libellés.
  const [outilsReplies, setOutilsReplies] = useState(true);
  // Téléphone : icônes seules au départ (les étiquettes recouvraient le dessin) ; « « » les affiche.
  const [colonneRepliee, setColonneRepliee] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const colonneRef = useRef<HTMLElement | null>(null);
  // Lot 5 : préférences d'outils du compte (profil, barre gauche, favoris, regroupements), copie locale hors connexion.
  const prefsSandbox = usePreferencesSandbox();
  // Barre gauche affichée (profil) : un outil choisi hors d'elle devient l'« outil récent » sous la barre.
  // Catalogue de la plateforme (25 novembre 2026) : ce qui est actif pour le compte = son choix dans ce que la
  // plateforme propose (extension retirée : jamais active ; rien de choisi : réglage d'origine de la plateforme). Le
  // choix enregistré (`prefsSandbox.preferences.extensions`) reste celui du compte.
  const extensionsEffectives = useMemo(() => choixEffectif(prefsSandbox.preferences.extensions, prefsSandbox.catalogue), [prefsSandbox.preferences.extensions, prefsSandbox.catalogue]);
  const prefsEffectives = useMemo(() => ({ ...prefsSandbox.preferences, extensions: extensionsEffectives }), [prefsSandbox.preferences, extensionsEffectives]);
  const idsBarreRef = useRef<readonly string[]>(barreGaucheSandbox(prefsEffectives));
  idsBarreRef.current = barreGaucheSandbox(prefsEffectives);
  // Extensions (25 novembre 2026) : les entrées d'une extension désactivée quittent barres, listes, colonne et clavier ;
  // le dessin n'est jamais touché.
  const masquees = useMemo(() => clesMasquees(extensionsEffectives), [extensionsEffectives]);
  const masqueesRef = useRef(masquees);
  masqueesRef.current = masquees;
  const outilsOfferts = useMemo(() => (masquees.size === 0 ? OUTILS : OUTILS.filter((o) => !masquees.has(`outil:${o.id}`))), [masquees]);
  // Plan détaché : fenêtre séparée (Document Picture-in-Picture, bureau) ou plein écran (repli, téléphone).
  const [detache, setDetache] = useState<"non" | "fenetre" | "plein-ecran">("non");
  const fenetreRef = useRef<Window | null>(null);
  const emplacementRef = useRef<HTMLDivElement | null>(null);
  // Porte de la Planche : nœud stable où React rend TOUTE la Planche (dessin, barre d'outils, panneaux, pied). Le
  // détachement déplace ce nœud dans la fenêtre séparée ; React y a posé ses écouteurs (portail), donc chaque bouton
  // continue de répondre là-bas, sans remontage (même canvas, même brouillon, même historique).
  const [porte] = useState(() => {
    const d = document.createElement("div");
    d.className = "planche-porte";
    d.setAttribute("data-planche-porte", "");
    return d;
  });
  const stylesObserveur = useRef<MutationObserver | null>(null);
  // Téléphone détaché : largeur de mise en page imposée (balise viewport) et Planche posée sur toute la page, avec les
  // valeurs d'avant à rétablir.
  const vueLargeRef = useRef<{ meta: HTMLMetaElement; avant: string; style: string; racine: HTMLElement; maj: () => void } | null>(null);
  const clavierRef = useRef<{ touche: (e: KeyboardEvent) => void; relache: (e: KeyboardEvent) => void; perte: () => void; pointeur: () => void } | null>(null);
  const [brouillonCharge, setBrouillonCharge] = useState(false);
  const [etatSauvegarde, setEtatSauvegarde] = useState<EtatSauvegarde>("chargement");
  // Planches nommées de ce navigateur (menu de la Planche) : l'index dit laquelle est ouverte ; l'enregistrement
  // automatique écrit toujours dans la Planche courante et met sa date à jour.
  const [indexPlanches, setIndexPlanches] = useState<IndexPlanches>(() => indexInitial());
  // Nom de la Planche ouverte (26 novembre 2026, maquette validée) : dans le fil d'Ariane de la page tant que la Planche
  // y est rattachée, le bandeau ne portant alors que « Planche » ; détachée (fenêtre ou plein écran), le nom revient
  // dans le bandeau. Sans fil d'Ariane fourni par la page, le nom reste dans le bandeau.
  const signalerNomFil = useContext(FilArianePlanche);
  const nomCourant = nomAffiche(plancheDe(indexPlanches));
  const nomDansFil = signalerNomFil !== null && detache === "non";
  useEffect(() => {
    signalerNomFil?.(nomDansFil ? nomCourant : null);
  }, [signalerNomFil, nomDansFil, nomCourant]);
  useEffect(() => () => signalerNomFil?.(null), [signalerNomFil]);
  const indexRef = useRef<IndexPlanches>(indexPlanches);
  /** Le prochain chargement remplace le dessin et l'historique (changement de Planche), au lieu de reprendre le brouillon. */
  const remplacerRef = useRef(false);
  /** Cas 2, lot 7 : modèle du brouillon à appliquer à l'original dès qu'il est rechargé. */
  const appliquerApresRef = useRef<Modele | null>(null);
  /** Cas 2, lot 7 (n° 62) : note chaque fichier émis ou partagé au registre de la Planche (posé plus bas). */
  const noterEmissionRef = useRef<(format: string, fichier: string, genre: "emission" | "partage") => void>(() => undefined);
  /** Journal des modifications de la Planche courante (page Informations) ; écrit avec le dessin. */
  const journalRef = useRef<EntreeJournal[]>([]);
  const [chargeId, setChargeId] = useState(0);
  /** Avance à la fin de chaque chargement de dessin (annonce « projet.ouvert » aux extensions). */
  const [dessinCharge, setDessinCharge] = useState(0);
  const [sauvegarde] = useState(() =>
    creerSauvegardeBrouillon(setEtatSauvegarde, async (modele) => {
      const id = indexRef.current.courante;
      await enregistrerBrouillon(modele, id);
      void enregistrerJournal(id, journalRef.current).catch(() => undefined);
      const idx = avecInfo(indexRef.current, id, { modifieA: new Date().toISOString() });
      indexRef.current = idx;
      setIndexPlanches(idx);
      // Date de modification : informative ; son échec n'invalide pas l'enregistrement du dessin.
      void enregistrerIndex(idx).catch(() => undefined);
    }),
  );
  const [essaiSauvegarde, setEssaiSauvegarde] = useState(0);
  const [essaiLecture, setEssaiLecture] = useState(0);

  const hoteRef = useRef<HTMLDivElement | null>(null);
  const racineRef = useRef<HTMLDivElement | null>(null);
  const piedRef = useRef<HTMLDivElement | null>(null);
  const voletRef = useRef<HTMLDivElement | null>(null);
  const vueRef = useRef<VuePlanche | null>(null);
  const champMesures = useRef<HTMLInputElement | null>(null);
  const grilleDom = useRef<HTMLDivElement | null>(null);
  // Lot 9 (EX-CMD-04) : frappe seule d'un modificateur en attente ; envoi par référence (écouteurs posés une fois).
  const frappeRef = useRef<EtatFrappeSeule>(FRAPPE_SEULE_VIDE);
  // Lot 9 (EX-CMD-06) : barres de la Planche au clavier — une halte de tabulation chacune, flèches entre les boutons.
  const railRef = useRef<HTMLDivElement | null>(null);
  const modificateursRef = useRef<HTMLDivElement | null>(null);
  const coupeRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const naviguerRail = useNavigationBarre(railRef, "vertical");
  const naviguerModificateurs = useNavigationBarre(modificateursRef);
  const naviguerCoupe = useNavigationBarre(coupeRef);
  const naviguerOptions = useNavigationBarre(optionsRef);
  const envoyerSeuleRef = useRef<(t: ModificateurSeul) => void>(() => {});
  const touchesTenues = useRef(new Set<Touche>());

  const setTexte = useCallback((v: TexteMesures) => {
    texteRef.current = v;
    setTexteEtat(v);
  }, []);
  // La sélection est tenue par l'interface (ContexteOutil.selection) ; son affichage passe par `rafraichir`.
  /** Extensions (protocole, lot 7) : annonces du dessin et de la sélection, branchées plus bas, une fois les hôtes connus. */
  const signalerModeleRef = useRef<(avant: Historique, apres: Historique) => void>(() => {});
  const signalerSelectionRef = useRef<() => void>(() => {});
  const setSelection = useCallback((s: readonly string[]) => {
    const avant = selectionRef.current;
    selectionRef.current = s;
    if (avant !== s && (avant.length !== s.length || avant.some((id, i) => id !== s[i]))) signalerSelectionRef.current();
  }, []);
  const setMateriau = useCallback((id: string | null) => {
    materiauRef.current = id;
    setMateriauEtat(id);
  }, []);
  const setBalise = useCallback((id: string | null) => {
    baliseRef.current = id;
    setBaliseEtat(id);
  }, []);
  const setHauteurOeil = useCallback((h: number) => {
    hauteurOeilRef.current = h;
    setHauteurOeilEtat(h);
    if (vueRef.current) vueRef.current.hauteurOeil = h;
  }, []);

  // Cas 2, lot 2 : accrochage — genre forcé pour le prochain point (Alt + 1 à 6, effacé après le clic) et seuil du
  // « presque accroché » (mm), réglages de l'interface ; le pas de longueur vient de l'Info modèle.
  const [forceAccrochage, setForceAccrochageEtat] = useState<GenreAccrochage | null>(null);
  const forceAccrochageRef = useRef<GenreAccrochage | null>(null);
  const setForceAccrochage = useCallback((g: GenreAccrochage | null) => {
    forceAccrochageRef.current = g;
    setForceAccrochageEtat(g);
  }, []);
  const [presqueMm, setPresqueMmEtat] = useState(10);
  const presqueMmRef = useRef(10);
  const setPresqueMm = useCallback((v: number) => {
    presqueMmRef.current = v;
    setPresqueMmEtat(v);
  }, []);

  const contexte = useCallback(
    (): ContexteOutil => ({
      modele: histRef.current.present.modele,
      selection: selectionRef.current,
      separateurDecimal: SEPARATEUR_DECIMAL,
      entitesDansCadre: (de, a, genre) => vueRef.current?.entitesDansCadre(de, a, genre) ?? [],
      entitesDansContour: (contour, genre) => vueRef.current?.entitesDansContour(contour, genre) ?? [],
      ...(dansRef.current !== undefined ? { dans: dansRef.current, chemin: cheminRef.current } : {}),
      ...(materiauRef.current ? { materiauCourant: materiauRef.current } : {}),
      ...(baliseRef.current ? { baliseCourante: baliseRef.current } : {}),
      ...(sectionRef.current ? { sectionCourante: sectionRef.current } : {}),
      ...(murRef.current ? { parametresMur: murRef.current } : {}),
      ...(histContexteRef.current.courant.repere ? { repere: histContexteRef.current.courant.repere } : {}),
      planDeTravail: planDuContexte(histContexteRef.current.courant),
      ...(booleensRef.current ? { booleens: booleensRef.current } : {}),
      hauteurOeil: hauteurOeilRef.current,
      lecture: readOnly,
      accrochage: {
        ...(forceAccrochageRef.current ? { force: forceAccrochageRef.current } : {}),
        presque: presqueMmRef.current / 1000,
        pasLongueur: histRef.current.present.modele.annotations?.reglages?.accrochageLongueur ?? null,
      },
    }),
    [readOnly],
  );

  /** Recalcule la vue de l'outil actif (machine, sinon catalogue) et met les surcouches à jour. */
  const rafraichir = useCallback(() => {
    const m = machineParId(outilRef.current);
    let v: VueOutil;
    try {
      v = m ? m.vue(etatMachineRef.current, contexte()) : vueParDefaut(outilRef.current, vueRef.current?.champDeVision ?? 35, hauteurOeilRef.current);
    } catch (err) {
      v = { ...vueParDefaut(outilRef.current, 35, hauteurOeilRef.current), erreur: `Erreur de l'outil : ${err instanceof Error ? err.message : String(err)}` };
    }
    setVue(v);
    vueRef.current?.majSurcouche(m ? v : null, selectionRef.current);
  }, [contexte]);

  const poserDans = useCallback((id: string | undefined, ch?: readonly string[]) => {
    const c = id === undefined ? [] : ch && ch[ch.length - 1] === id ? [...ch] : cheminOccurrence(histRef.current.present.modele, id);
    dansRef.current = id;
    cheminRef.current = c;
    setDans(id);
    setChemin(c);
  }, []);
  // Objets O-2 : ouvrir ou fermer un contexte redessine le modèle (reste délavé, boîte pointillée de l'objet ouvert).
  useEffect(() => {
    vueRef.current?.majModele(histRef.current.present.modele);
  }, [dans]);

  /** Niveaux d'étage (cas 4) : niveau de travail, auquel les objets créés à la racine sont rattachés. État d'interface. */
  const niveauTravailRef = useRef<string | null>(null);
  const poserHistorique = useCallback((h0: Historique, _options: { libelle?: string; envoyer?: boolean } = {}) => {
    const avantHist = histRef.current;
    // Niveau de travail : une opération nouvelle (ni annulation ni rétablissement, ni chargement) rattache les objets
    // qu'elle crée à la racine au niveau de travail, dans le même pas d'historique.
    let h = h0;
    const niveau = niveauTravailRef.current;
    if (niveau && h0.present.operation !== null && h0.futur.length === 0 && h0.present !== avantHist.futur[0] && h0.present.modele !== avantHist.present.modele) {
      const rattache = rattacherNouveauxObjets(avantHist.present.modele, h0.present.modele, niveau);
      if (rattache !== h0.present.modele) h = { ...h0, present: { ...h0.present, modele: rattache } };
    }
    // Cas 2, lot 4 (n° 74, n° 63) : la balise courante et les balises réservées sont posées sur ce que l'opération crée.
    if (h.present.operation !== null && h.futur.length === 0 && h.present !== avantHist.futur[0] && h.present.modele !== avantHist.present.modele) {
      const balise = baliserNouveautes(avantHist.present.modele, h.present.modele, baliseRef.current, dansRef.current);
      if (balise !== h.present.modele) h = { ...h, present: { ...h.present, modele: balise } };
    }
    const changeModele = h.present.modele !== avantHist.present.modele;
    histRef.current = h;
    setHist(h);
    if (changeModele) {
      vueRef.current?.majModele(h.present.modele);
      // Journal : opération faite, annulée ou rétablie (jamais le chargement du dessin, qui n'a pas d'opération).
      const description = _options.libelle ?? h.present.operation;
      if (description) journalRef.current = ajouterEntree(journalRef.current, { a: new Date().toISOString(), auteur: t("planche.sb.auteur"), description });
      signalerModeleRef.current(avantHist, h);
    }
  }, []);

  /** Envoie un événement à la machine de l'outil actif ; renvoie `true` si l'état, le modèle ou la sélection a changé. */
  const envoyer = useCallback(
    (ev: EvenementOutil): boolean => {
      // Lot 9 (EX-CMD-04) : un geste du pointeur pendant qu'un modificateur est tenu s'en sert — pas de frappe seule.
      if (ev.genre === "clic" || ev.genre === "appui" || ev.genre === "glisser" || ev.genre === "relache") frappeRef.current = consommerFrappe(frappeRef.current);
      const m = machineParId(outilRef.current);
      if (!m) return false;
      const ctx = contexte();
      const avant = etatMachineRef.current;
      let tr;
      try {
        tr = m.traiter(avant, ev, ctx);
      } catch (err) {
        setMessage(`Erreur de l'outil : ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
      etatMachineRef.current = tr.etat;
      // Cas 2, lot 2 (n° 111) : le genre forcé ne vaut que pour le prochain point.
      if (ev.genre === "clic" && forceAccrochageRef.current) setForceAccrochage(null);
      if (m === MACHINE_OUTIL_EXTENSION) {
        // L'événement préparé par la machine part vers l'extension ; sa description reviendra plus tard.
        const emis = (tr.etat as EtatOutilExtension).emis;
        if (emis && emis !== (avant as EtatOutilExtension | null)?.emis) transmettreOutilRef.current(outilRef.current, emis.nom, emis.donnees);
      }
      let change = tr.etat !== avant;
      if (tr.modele && tr.modele !== ctx.modele && !readOnly) {
        poserHistorique(enregistrer(histRef.current, tr.modele, tr.operation ?? libelleOutil(outilRef.current), tr.remplaceDernier === true));
        change = true;
      }
      if (tr.selection) {
        setSelection(tr.selection);
        change = true;
      }
      if (tr.dans !== undefined) {
        poserDans(tr.dans ?? undefined, tr.chemin);
        change = true;
      }
      if (tr.materiauCourant !== undefined) {
        setMateriau(tr.materiauCourant);
        change = true;
      }
      if (tr.baliseCourante !== undefined) {
        setBalise(tr.baliseCourante);
        change = true;
      }
      if (tr.editerTexte) {
        setEdition({ id: tr.editerTexte.id, texte: tr.editerTexte.texte });
        change = true;
      }
      // Chantier Axes (AX-1) : l'outil Axes pose le repère de travail, sans pas d'historique de géométrie (AX-D3).
      if (tr.repereTravail) {
        changerContexte(contexteTemporaire(histContexteRef.current.courant, tr.repereTravail));
        change = true;
      }
      // Un survol ou le simple relâchement d'une touche (Ctrl après Ctrl + Z) n'efface pas le message en cours.
      if (ev.genre !== "survol" && !(ev.genre === "touche" && ev.etat === "relachee")) setMessage(null);
      rafraichir();
      // Outil demandé par la machine (Diviser rend la main à Sélection) : appliqué après la transition.
      if (tr.outil !== undefined && tr.outil !== outilRef.current) {
        demandeOutilRef.current(tr.outil);
        change = true;
      } else if (tr.outilPrecedent) {
        // Axes et outils temporaires : retour à l'outil précédent (Sélection à défaut).
        retourOutilRef.current();
        change = true;
      }
      return change;
    },
    [contexte, poserHistorique, poserDans, rafraichir, readOnly, setSelection, setMateriau, setBalise, changerContexte, setForceAccrochage],
  );

  /**
   * Lot Planche 8 : choix d'une option de l'outil actif (bouton de la barre d'options, au doigt comme à la souris) — le
   * même chemin `configurer` que les touches Ctrl / Alt / ↓ traitées par la machine. Aucun pas d'historique.
   */
  /**
   * Lot 10a (EX-STATE-03, A-11) : remet l'outil à zéro quand le modèle change sous lui (annuler, rétablir, mise à jour
   * venue du serveur) et dit si une opération était en cours — son aperçu, périmé, ne peut plus être validé.
   */
  const abandonnerOperation = useCallback((): boolean => {
    const m = machineParId(outilRef.current);
    const avant = etatMachineRef.current as { etape?: unknown } | null;
    const initial = m?.initial() as { etape?: unknown } | undefined;
    etatMachineRef.current = initial ?? null;
    return typeof avant?.etape === "number" && avant.etape !== initial?.etape;
  }, []);
  /**
   * Lot 9 (EX-CMD-04) : touche de modification frappée seule — même chemin que les boutons d'options pour les outils qui
   * la déclarent (Pousser/Tirer) ; aucun pas d'historique, la vue annonce le mode ou le refus.
   */
  const envoyerSeule = useCallback(
    (touche: ModificateurSeul) => {
      const m = machineParId(outilRef.current);
      if (!m?.modificateurSeul) return;
      etatMachineRef.current = m.modificateurSeul(etatMachineRef.current, touche, contexte()).etat;
      setMessage(null);
      rafraichir();
    },
    [contexte, rafraichir],
  );
  envoyerSeuleRef.current = envoyerSeule;
  const configurerOutil = useCallback(
    (option: string, valeur: string) => {
      const m = machineParId(outilRef.current);
      if (!m?.configurer) return;
      etatMachineRef.current = m.configurer(etatMachineRef.current, option, valeur, contexte()).etat;
      if (outilRef.current === "texte-3d" && option === "alignement") etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, alignementTexte3D: lireAlignementTexte3D(valeur) } }));
      rafraichir();
      hoteRef.current?.focus({ preventScroll: true });
    },
    [contexte, rafraichir],
  );

  /** Applique une transition produite hors machine (barre du plan de coupe, panneaux) : un pas d'historique. */
  const appliquer = useCallback(
    (tr: Transition<unknown>, operation: string) => {
      if (tr.modele && tr.modele !== histRef.current.present.modele && !readOnly) poserHistorique(enregistrer(histRef.current, tr.modele, tr.operation ?? operation, tr.remplaceDernier === true));
      if (tr.selection) setSelection(tr.selection);
      setMessage(null);
      rafraichir();
    },
    [poserHistorique, rafraichir, readOnly, setSelection],
  );


  // Outils des extensions installées (lot 6) : déclarés plus bas, une fois les extensions et leurs hôtes connus.
  const outilExtensionDeclareRef = useRef<(cle: string) => boolean>(() => false);
  /** Changement d'outil : prévient l'outil d'extension quitté (désactivation, pause) et celui qui arrive (activation, reprise). */
  const passerOutilExtensionRef = useRef<(avant: string, apres: string, etatQuitte?: unknown) => void>(() => undefined);
  const transmettreOutilRef = useRef<(cle: string, nom: EvenementOutilExtension, donnees: Readonly<Record<string, unknown>>) => void>(() => undefined);
  /** Outil d'extension mis en pause par un outil de caméra : son état est gardé pour la reprise. */
  const outilEnPauseRef = useRef<{ readonly cle: string; readonly etat: unknown } | null>(null);
  const demandeOutilRef = useRef<(id: string, options?: { garderPrecedent?: boolean }) => void>(() => undefined);
  const retourOutilRef = useRef<() => void>(() => undefined);
  const choisirOutil = useCallback(
    (id: string, options: { garderPrecedent?: boolean } = {}) => {
      frappeRef.current = consommerFrappe(frappeRef.current);
      // Outil d'une extension installée (lot 6) : il n'est pas au catalogue, sa machine fait le lien avec l'extension.
      if (lireCleOutilExtension(id)) {
        if (!outilExtensionDeclareRef.current(id)) return;
        // Rechoisir l'outil déjà actif ne change rien : son état ici et celui de l'extension restent accordés.
        if (id === outilRef.current) return;
        setGrille(false);
        setEdition(null);
        const avant = outilRef.current;
        if (id !== avant && !options.garderPrecedent) precedentRef.current = avant;
        const reprise = outilEnPauseRef.current?.cle === id ? outilEnPauseRef.current.etat : null;
        outilRef.current = id;
        etatMachineRef.current = reprise ?? machineParId(id)?.initial() ?? null;
        setOutilId(id);
        setTexte(null);
        setMessage(null);
        passerOutilExtensionRef.current(avant, id);
        rafraichir();
        return;
      }
      const o = outilParId(id);
      if (!o) return;
      // Outil d'une extension désactivée (raccourci clavier, favori ancien) : il dit où l'activer, rien d'autre ne change.
      const extension = masqueesRef.current.has(`outil:${id}`) ? extensionDeCle(`outil:${id}`) : undefined;
      if (extension) {
        setMessage(t("extensions.inactive", { nom: nomOutil(o), extension: t(`extension.${extension.id}` as "extension.bois") }));
        return;
      }
      const raison = disponibilite(o, { lecture: readOnly });
      if (raison) {
        setMessage(raison);
        return;
      }
      setGrille(false);
      setEdition(null);
      // Zoom étendu (§4.30) : action immédiate, l'outil actif ne change pas.
      if (id === "zoom-etendu") {
        const v = vueRef.current;
        const boite = v?.emprise();
        if (v && boite) v.cadrer(boite, margesVue(racineRef.current));
        setMessage(boite ? null : t("planche.zoom-etendu.vide"));
        if (!idsBarreRef.current.includes(id)) setRecent(id);
        rafraichir();
        return;
      }
      // Lot 6 : le moteur booléen (manifold-3d) est chargé au premier outil qui le demande, jamais à l'ouverture (MO-4).
      if (OUTILS_BOOLEENS.has(id) && !booleensRef.current) {
        setBooleens("chargement");
        void chargerBooleens().then(
          (b) => {
            booleensRef.current = b;
            setBooleens("ok");
            rafraichir();
          },
          (err: unknown) => {
            setBooleens("echec");
            setMessage(t("planche.solides.echec", { motif: err instanceof Error ? err.message : String(err) }));
          },
        );
      }
      if (id !== outilRef.current && !options.garderPrecedent) precedentRef.current = outilRef.current;
      const etatQuitte = etatMachineRef.current;
      const quitte = outilRef.current;
      outilRef.current = id;
      etatMachineRef.current = machineParId(id)?.initial() ?? null;
      passerOutilExtensionRef.current(quitte, id, etatQuitte);
      // Revue de #129 : l'alignement du Texte 3D survit à la réactivation (préférence d'interface, pas d'état d'outil).
      if (id === "texte-3d") {
        const m = machineParId(id);
        const alignement = lireAlignementTexte3D(etatUi.get().parametresOutil["alignementTexte3D"]);
        if (m?.configurer && etatMachineRef.current) etatMachineRef.current = m.configurer(etatMachineRef.current, "alignement", alignement, contexte()).etat;
      }
      setOutilId(id);
      setTexte(null);
      setMessage(null);
      // Chantier Axes (AX-2) : Placer les axes montre la barre « Axes et repères » (repère courant et aperçu distincts).
      if (id === "axes" && !etatUi.get().barreReperes.visible) etatUi.set((u) => ({ barreReperes: { ...u.barreReperes, visible: true } }));
      if (!idsBarreRef.current.includes(id)) setRecent(id);
      rafraichir();
    },
    [readOnly, rafraichir, setTexte],
  );

  demandeOutilRef.current = choisirOutil;
  /** Retour à l'outil précédent s'il est disponible, sinon Sélection. */
  const retourOutil = useCallback(() => {
    const precedent = precedentRef.current;
    // Retour à l'outil d'extension mis en pause par un outil de caméra.
    if (precedent !== outilRef.current && lireCleOutilExtension(precedent) && outilExtensionDeclareRef.current(precedent)) return choisirOutil(precedent);
    const o = outilParId(precedent);
    if (precedent !== outilRef.current && o && !disponibilite(o, { lecture: readOnly }) && !OUTILS_CAMERA_TEMPORAIRES.has(precedent)) choisirOutil(precedent);
    else choisirOutil("selection");
  }, [choisirOutil, readOnly]);
  retourOutilRef.current = retourOutil;

  const annulerPas = useCallback(() => {
    if (consultationRef.current) return setMessage(t("planche.lecture.message"));
    const op = operationAAnnuler(histRef.current);
    const h = annuler(histRef.current);
    if (!h) {
      setMessage(t("planche.rien.annuler"));
      return;
    }
    poserHistorique(h, { libelle: t("planche.annule", { operation: op ?? "" }) });
    const perime = abandonnerOperation();
    setSelection([]);
    poserDans(undefined);
    setMessage(`${t("planche.annule", { operation: op ?? "" })}${perime ? ` ${t("planche.apercu.perime")}` : ""}`);
    rafraichir();
  }, [poserDans, poserHistorique, rafraichir, setSelection]);

  const retablirPas = useCallback(() => {
    if (consultationRef.current) return setMessage(t("planche.lecture.message"));
    const op = operationARetablir(histRef.current);
    const h = retablir(histRef.current);
    if (!h) {
      setMessage(t("planche.rien.retablir"));
      return;
    }
    poserHistorique(h, { libelle: t("planche.retabli", { operation: op ?? "" }) });
    const perime = abandonnerOperation();
    setSelection([]);
    poserDans(undefined);
    setMessage(`${t("planche.retabli", { operation: op ?? "" })}${perime ? ` ${t("planche.apercu.perime")}` : ""}`);
    rafraichir();
  }, [poserDans, poserHistorique, rafraichir, setSelection]);

  /** Ctrl + G : la sélection devient un groupe (un pas) ; l'ouverture d'un groupe reste le double-clic de Sélection. */
  const grouperSelection = useCallback(() => {
    if (readOnly) return;
    const sel = selectionRef.current.filter((id) => genreAnnotation(id) === null);
    // Objets O-1 (D-203) : Control, appuyé avant G, est aussi parvenu à l'outil (Pousser/Tirer : « Nouvelle face ») ;
    // la machine est remise à zéro que le groupement réussisse ou non (le registre du lot 9 lira les modificateurs au relâchement).
    etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
    if (sel.length === 0) {
      setMessage(t("planche.groupe.vide"));
      rafraichir();
      return;
    }
    try {
      const m = histRef.current.present.modele;
      const n = Object.keys(m.definitions).length + 1;
      // Objets O-6 : origine du groupe au coin de sa boîte englobante (axes parallèles à ceux du contexte).
      const r = grouper(m, sel, { nom: `Groupe ${n}`, origine: "coin", ...(dansRef.current !== undefined ? { dans: dansRef.current } : {}) });
      poserHistorique(enregistrer(histRef.current, r.modele, t("planche.groupe.operation"), false));
      setSelection([r.occurrence]);
      const rompus = liensRompus(m, r.modele);
      setMessage(rompus > 0 ? `${t("planche.groupe.cree")} ${t("planche.objets.liens-rompus", { nombre: String(rompus) })}` : t("planche.groupe.cree"));
      rafraichir();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [poserHistorique, rafraichir, readOnly, setSelection]);

  /** Options d'affichage (Styles, Ombres, Affichage, touche K) : la vue d'abord, l'état ensuite ; rien dans le modèle (R10). */
  const majOptions = useCallback((o: Partial<OptionsAffichage>) => {
    vueRef.current?.majOptions(o);
    setOptionsEtat((prev) => ({ ...prev, ...o }));
  }, []);

  /** Opération sur les objets hors machine (menu contextuel, panneaux) : un pas d'historique, machine réinitialisée. */
  const operer = useCallback(
    (nom: string, fn: (m: Modele, dans: string | undefined) => { modele: Modele; selection?: readonly string[]; message?: string | null } | null) => {
      if (readOnly) return;
      try {
        const r = fn(histRef.current.present.modele, dansRef.current);
        if (!r) return;
        if (r.modele !== histRef.current.present.modele) poserHistorique(enregistrer(histRef.current, r.modele, nom, false));
        if (r.selection) setSelection(r.selection);
        etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
        setMessage(r.message ?? null);
        rafraichir();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [poserHistorique, rafraichir, readOnly, setSelection],
  );
  const o = useCallback(() => (dansRef.current !== undefined ? { dans: dansRef.current } : {}), []);
  // Objets O-3 : le clavier (Alt + Maj + U / D / C) lit la même disponibilité que la barre et le menu, posée au rendu.
  const etatSelectionObjetsRef = useRef<() => EtatSelectionObjets>(() => ({ lecture: true, entites: 0, objets: 0, verrouilles: false }));
  const executerObjetRef = useRef<(id: IdCommandeObjet) => void>(() => {});
  const executerNavigateurRef = useRef<(id: IdCommandeNavigateur) => void>(() => {});
  const executerVueRef = useRef<(id: IdCommandeVue) => void>(() => {});
  const executerCommandeRef = useRef<(c: EntreeRegistre) => void>(() => {});
  const commandeExtensionDuClavierRef = useRef<(e: KeyboardEvent) => CommandeListe | null>(() => null);
  /** Chantier Axes (AX-4) : ouverture de l'édition d'origine du composant (menu contextuel, barre, Maj + F4). */
  const ouvrirOrigineRef = useRef<() => void>(() => {});
  const etatVueRef = useRef<() => { entites: number; isole: boolean; dansObjet: boolean }>(() => ({ entites: 0, isole: false, dansObjet: false }));
  const selectionDe = useCallback((genre: "faces" | "aretes" | "occurrences", m = histRef.current.present.modele) => {
    const c = contexteDe(m, dansRef.current);
    return selectionRef.current.filter((id) => c[genre][id]);
  }, []);

  const effacerSelection = useCallback(() => operer(t("planche.menu.effacer"), (m) => ({ modele: effacerEntites(m, selectionRef.current, o()).modele, selection: [] })), [operer, o]);
  const masquerSelection = useCallback(
    () =>
      operer(t("planche.menu.masquer"), (m, dans) => {
        const ids = selectionRef.current.filter((id) => genreAnnotation(id) === null);
        derniersMasques.current = { ids, dans };
        return { modele: masquerEntites(m, ids, o()).modele, selection: [] };
      }),
    [operer, o],
  );
  const reafficher = useCallback(
    (quoi: "tout" | "selection" | "dernier") =>
      operer(t("planche.affichage.reafficher"), (m) => {
        const r =
          quoi === "tout"
            ? afficherTout(m)
            : quoi === "selection"
              ? masquerEntites(m, selectionRef.current, o(), false)
              : derniersMasques.current
                ? masquerEntites(m, derniersMasques.current.ids, derniersMasques.current.dans !== undefined ? { dans: derniersMasques.current.dans } : {}, false)
                : null;
        if (!r || r.rapport.modifies.length === 0) return { modele: m, message: t("planche.affichage.rien-masque") };
        if (quoi === "dernier") derniersMasques.current = null;
        return { modele: r.modele, message: t("planche.affichage.reaffiche", { nombre: String(r.rapport.modifies.length) }) };
      }),
    [operer, o],
  );
  const verrouillerSelection = useCallback((verrou: boolean) => operer(t(verrou ? "planche.menu.verrouiller" : "planche.menu.deverrouiller"), (m) => ({ modele: verrouillerOccurrences(m, selectionDe("occurrences", m), verrou, o()).modele })), [operer, o, selectionDe]);
  const ouvrirOccurrence = useCallback(
    (id: string) => {
      const ici = contexteDe(histRef.current.present.modele, dansRef.current).occurrences[id];
      poserDans(id, ici ? [...cheminRef.current, id] : undefined);
      setSelection([]);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      setMessage(null);
      rafraichir();
    },
    [poserDans, rafraichir, setSelection],
  );
  /** Objets O-2 : Fermer (un niveau) et Fermer tout (racine), avec n'importe quel outil ; la machine repart de zéro. */
  const fermerContexte = useCallback(
    (id: IdCommandeContexte) => {
      if (dansRef.current === undefined) return;
      const ch = cheminRef.current;
      poserDans(id === "fermer-tout" || ch.length < 2 ? undefined : ch[ch.length - 2], ch.slice(0, -1));
      setSelection([]);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      setMessage(null);
      rafraichir();
    },
    [poserDans, rafraichir, setSelection],
  );
  const allerAuContexte = useCallback(
    (id: string | undefined) => {
      poserDans(id, id === undefined ? [] : cheminRef.current.slice(0, cheminRef.current.indexOf(id) + 1));
      setSelection([]);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      rafraichir();
    },
    [poserDans, rafraichir, setSelection],
  );
  const detacherLienSelection = useCallback(
    () =>
      operer(t("planche.lien.detacher"), (m) => {
        const liens = liensDesFaces(m, selectionDe("faces", m));
        if (liens.length === 0) return null;
        return { modele: detacherLiens(m, liens).modele, message: t("planche.lien.detache") };
      }),
    [operer, selectionDe],
  );
  const eclaterSelection = useCallback(
    () =>
      operer(t("planche.menu.eclater"), (m) => {
        const occs = selectionDe("occurrences", m);
        if (occs.length === 0) return { modele: m, message: t("planche.eclater.objet") };
        let courant = m;
        const crees: string[] = [];
        // Objets O-3 : éclater dans le contexte réellement ouvert, et annoncer ce qui a été transmis.
        const total = { faces: 0, objets: 0, balises: 0, perdue: false };
        for (const id of occs) {
          const r = eclater(courant, id, o());
          courant = r.modele;
          crees.push(...r.rapport.crees);
          total.faces += r.extra.materiauFaces;
          total.objets += r.extra.materiauObjets;
          total.balises += r.extra.baliseObjets;
          total.perdue ||= r.extra.baliseNonPortee;
        }
        const transferts = total.faces + total.objets + total.balises > 0 ? t("planche.eclater.transferts", { faces: String(total.faces), objets: String(total.objets), balises: String(total.balises) }) : "";
        const message = [transferts, total.perdue ? t("planche.eclater.balise-perdue") : ""].filter(Boolean).join(" ");
        return { modele: courant, selection: crees, message: message || null };
      }),
    [operer, o, selectionDe],
  );
  const rendreUniqueSelection = useCallback(
    () =>
      operer(t("planche.menu.rendre-unique"), (m) => {
        const c = contexteDe(m, dansRef.current);
        const occs = selectionDe("occurrences", m);
        if (occs.every((id) => nombreOccurrences(m, c.occurrences[id]!.definition) <= 1)) return { modele: m, message: t("planche.unique.deja") };
        let courant = m;
        for (const id of occs) courant = rendreUnique(courant, id).modele;
        // Objets O-3 : le nom « #k » de la copie est annoncé.
        const c2 = contexteDe(courant, dansRef.current);
        const noms = occs.map((id) => courant.definitions[c2.occurrences[id]!.definition]?.nom).filter((n) => n !== undefined);
        return { modele: courant, message: noms.length ? t("planche.unique.fait", { nom: noms.join(", ") }) : null };
      }),
    [operer, selectionDe],
  );
  const creerComposant = useCallback(
    (p: ParametresComposant) => {
      setDialogueComposant(false);
      operer(t("planche.menu.composant"), (m) => {
        const sel = selectionRef.current.filter((id) => genreAnnotation(id) === null);
        if (sel.length === 0) return { modele: m, message: t("planche.composant.vide") };
        const { nom, ...meta } = p;
        const r = grouper(m, sel, { genre: "composant", nom, ...meta, ...o() });
        const rompus = liensRompus(m, r.modele);
        return { modele: r.modele, selection: [r.occurrence], message: rompus > 0 ? `${t("planche.composant.cree")} ${t("planche.objets.liens-rompus", { nombre: String(rompus) })}` : t("planche.composant.cree") };
      });
      hoteRef.current?.focus({ preventScroll: true });
    },
    [operer, o],
  );
  /** Objets O-5 : Isoler / Quitter l'isolement — la vue seule change, l'état de masquage du modèle est intact. */
  const basculerIsolement = useCallback(() => {
    const m = histRef.current.present.modele;
    let suivant: { chemin: readonly string[]; ids: readonly string[] } | null = null;
    if (!isolementRef.current) {
      const ids = selectionRef.current.filter((id) => genreAnnotation(id) === null);
      if (ids.length === 0) return;
      suivant = { chemin: [...cheminRef.current], ids };
    }
    isolementRef.current = suivant;
    setIsolementEtat(suivant);
    vueRef.current?.majModele(m);
    setMessage(t(suivant ? "planche.isolement.fait" : "planche.isolement.fin"));
    rafraichir();
  }, [rafraichir]);
  const basculerMasquerReste = useCallback(() => {
    majOptions({ masquerReste: !(vueRef.current?.lireOptions().masquerReste ?? false) });
  }, [majOptions]);
  /** Objets O-4 : nouveau groupe vide, ouvert aussitôt pour y dessiner (écart Fadi déclaré). */
  const creerGroupeVide = useCallback(() => {
    if (readOnly) return;
    try {
      const m = histRef.current.present.modele;
      const r = grouperVide(m, { nom: `Groupe ${Object.keys(m.definitions).length + 1}`, ...o() });
      poserHistorique(enregistrer(histRef.current, r.modele, t("planche.menu.groupe-vide"), false));
      poserDans(r.occurrence, [...cheminRef.current, r.occurrence]);
      setSelection([]);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      setMessage(t("planche.groupe-vide.cree"));
      rafraichir();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [o, poserDans, poserHistorique, rafraichir, readOnly, setSelection]);
  /** Objets O-4 : ranger des objets dans un autre groupe (ou à la racine), sans qu'ils bougent à l'écran. */
  const deplacerObjets = useCallback(
    (ids: readonly string[], de: string | undefined, vers: string | undefined) =>
      operer(t("planche.menu.deplacer-vers"), (m) => {
        const r = deplacerVersContexte(m, ids, vers, de !== undefined ? { dans: de } : {});
        const nomCible = vers === undefined ? t("planche.contexte.racine") : nomOccurrence(r.modele, vers);
        const message = r.extra.composantPartage > 1 ? t("planche.deplacer.partage", { nom: nomCible, nombre: String(r.extra.composantPartage) }) : t("planche.deplacer.fait", { nom: nomCible });
        return { modele: r.modele, selection: [], message };
      }),
    [operer],
  );
  const ouvrirDeplacer = useCallback(() => {
    const m = histRef.current.present.modele;
    const c = contexteDe(m, dansRef.current);
    const ids = selectionRef.current.filter((id) => c.occurrences[id]);
    if (ids.length === 0 || readOnly) return;
    setDialogueDeplacer({ ids, dans: dansRef.current });
  }, [readOnly]);
  const ouvrirRenommage = useCallback(() => {
    const c = contexteDe(histRef.current.present.modele, dansRef.current);
    const ids = selectionRef.current.filter((id) => c.occurrences[id]);
    if (ids.length !== 1 || readOnly) return;
    setPanneau("navigateur");
    // Revue O-4 : la ligne visée par son chemin complet (contexte ouvert + objet), pas par son seul identifiant.
    setRenommage([...cheminRef.current, ids[0]!]);
  }, [readOnly]);
  const ouvrirDialogueComposant = useCallback(() => {
    if (readOnly) return;
    if (selectionRef.current.filter((id) => genreAnnotation(id) === null).length === 0) {
      setMessage(t("planche.composant.vide"));
      return;
    }
    setDialogueComposant(true);
  }, [readOnly]);
  const intersecterSelection = useCallback(
    () =>
      operer(t("planche.menu.intersection"), (m) => {
        const r = intersecterAvecModele(m, selectionRef.current, o());
        return { modele: r.modele, message: r.extra > 0 ? t("planche.intersection.resultat", { nombre: String(r.extra) }) : t("planche.intersection.aucune") };
      }),
    [operer, o],
  );
  const inverserSelection = useCallback(() => operer(t("planche.menu.inverser-faces"), (m) => ({ modele: inverserFaces(m, selectionDe("faces", m), o()).modele })), [operer, o, selectionDe]);
  const orienterSelection = useCallback(
    () =>
      operer(t("planche.menu.orienter-faces"), (m) => {
        const faces = selectionDe("faces", m);
        if (faces.length === 0) return null;
        const r = orienterFaces(m, faces[0]!, o());
        return { modele: r.modele, message: t("planche.orienter.resultat", { nombre: String(r.extra) }) };
      }),
    [operer, o, selectionDe],
  );
  const adoucirSelection = useCallback((adoucie: boolean) => operer(t(adoucie ? "planche.menu.adoucir" : "planche.menu.durcir"), (m) => ({ modele: adoucirAretes(m, selectionRef.current, adoucie, o()).modele })), [operer, o]);
  const adoucirLisserSelection = useCallback(
    (angle: number, coplanaires: boolean) =>
      operer(t("planche.menu.adoucir-lisser"), (m) => {
        const r = adoucirLisser(m, selectionRef.current, angle, coplanaires, o());
        return { modele: r.modele, message: t("planche.adoucir.resultat", { nombre: String(r.extra) }) };
      }),
    [operer, o],
  );
  /** Objets O-3 : Diviser en segments (Explode Curve) — les courbes touchées par la sélection redeviennent des segments. */
  const diviserCourbeSelection = useCallback(
    () =>
      operer(t("planche.menu.diviser-courbe"), (m) => {
        const aretes = selectionDe("aretes", m);
        if (aretes.length === 0) return null;
        const r = diviserCourbes(m, aretes, o());
        return { modele: r.modele, message: t("planche.courbe.divisee", { nombre: String(r.extra) }) };
      }),
    [operer, o, selectionDe],
  );
  const coqueSelection = useCallback(
    () =>
      operer(t("planche.menu.coque"), (m) => {
        const occs = selectionDe("occurrences", m);
        if (occs.length !== 2) return { modele: m, message: t("planche.coque.deux") };
        const r = opererSolides(contexte(), "enveloppe-exterieure", occs[0]!, occs[1]!);
        return { modele: r.modele, selection: r.crees };
      }),
    [operer, contexte, selectionDe],
  );
  const etendre = useCallback(
    (mode: Parameters<typeof etendreSelection>[2]) => {
      const ids = etendreSelection(histRef.current.present.modele, selectionRef.current, mode, dansRef.current);
      setSelection(ids);
      setMessage(mode === "tout" ? t("planche.selection.tout", { nombre: String(ids.length) }) : null);
      rafraichir();
    },
    [rafraichir, setSelection],
  );
  /** Points monde de la sélection (sommets des arêtes et faces, boîtes des objets) : Zoom sur la sélection. */
  const boiteSelection = useCallback((): { min: Vec3; max: Vec3 } | null => {
    const m = histRef.current.present.modele;
    const c = contexteDe(m, dansRef.current);
    const M = dansRef.current ? matriceChemin(m, cheminRef.current) ?? IDENTITE : IDENTITE;
    const pts: Vec3[] = [];
    const sommet = (id: string) => {
      const sm = c.sommets[id];
      if (sm) pts.push(appliquerMatrice(M, sm.position));
    };
    for (const id of selectionRef.current) {
      const a = c.aretes[id];
      const f = c.faces[id];
      if (a) {
        sommet(a.a);
        sommet(a.b);
      } else if (f) {
        for (const sid of f.exterieur) sommet(sid);
      } else if (c.occurrences[id]) {
        const b = boiteOccurrence(m, id);
        if (b) pts.push(b.min, b.max);
      }
    }
    if (pts.length === 0) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of pts) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
    return { min, max };
  }, []);
  const zoomSelection = useCallback(() => {
    const b = boiteSelection();
    if (b) vueRef.current?.cadrer(b, margesVue(racineRef.current));
  }, [boiteSelection]);
  /** Face de la sélection en coordonnées monde : centre et normale (Aligner la vue, Aligner les axes). */
  const faceMonde = useCallback((): { centre: Vec3; normale: Vec3; u: Vec3 } | null => {
    const m = histRef.current.present.modele;
    const c = contexteDe(m, dansRef.current);
    const id = selectionRef.current.find((x) => c.faces[x]);
    if (!id) return null;
    const f = c.faces[id]!;
    const M = dansRef.current ? matriceChemin(m, cheminRef.current) ?? IDENTITE : IDENTITE;
    const pts: Vec3[] = [];
    for (const sid of f.exterieur) {
      const sm = c.sommets[sid];
      if (sm) pts.push(appliquerMatrice(M, sm.position));
    }
    if (pts.length < 2) return null;
    const centre = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length, z: acc.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
    const origine = appliquerMatrice(M, { x: 0, y: 0, z: 0 });
    const normale = normalize(sub(appliquerMatrice(M, f.normale), origine));
    const u = normalize(sub(pts[1]!, pts[0]!));
    return { centre, normale, u };
  }, []);
  const alignerVue = useCallback(() => {
    const f = faceMonde();
    if (!f) {
      setMessage(t("planche.aligner-vue.face"));
      return;
    }
    const v = vueRef.current;
    if (!v) return;
    const etat = v.etatCamera();
    const d = Math.max(3, Math.hypot(etat.position.x - etat.cible.x, etat.position.y - etat.cible.y, etat.position.z - etat.cible.z));
    v.appliquerScene({ position: { x: f.centre.x + f.normale.x * d, y: f.centre.y + f.normale.y * d, z: f.centre.z + f.normale.z * d }, cible: f.centre, champDeVision: etat.champDeVision, projection: etat.projection });
  }, [faceMonde]);
  // Chantier Axes (AX-1) : aligner sur la face = repère de travail (instantané, AX-D7), contrôlé — jamais de pas de
  // géométrie ni de repli silencieux.
  const alignerAxes = useCallback(() => {
    const f = faceMonde();
    if (!f) {
      setMessage(t("planche.aligner-axes.face"));
      return;
    }
    const r = repereDepuisFace(f.centre, f.normale, f.u);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    changerContexte(contexteTemporaire(histContexteRef.current.courant, r.repere));
  }, [faceMonde, changerContexte]);
  const aireDe = useCallback(
    (quoi: "selection" | "balise" | "materiau") => {
      const m = histRef.current.present.modele;
      const c = contexteDe(m, dansRef.current);
      let faces = selectionDe("faces", m);
      if (quoi !== "selection") {
        const occ = dansRef.current ? Object.values(m.definitions).flatMap((d) => Object.values(d.contenu.occurrences)).find((x) => x.id === dansRef.current) ?? m.racine.occurrences[dansRef.current] : undefined;
        const ref = faces[0] ? (quoi === "materiau" ? c.faces[faces[0]]?.materiauRecto ?? occ?.materiau : occ?.balise) : undefined;
        faces = Object.values(c.faces)
          .filter((f) => (quoi === "materiau" ? (f.materiauRecto ?? occ?.materiau) === ref : (occ?.balise ?? undefined) === ref))
          .map((f) => f.id);
      }
      if (faces.length === 0) {
        setMessage(t("planche.aire.aucune"));
        return;
      }
      const total = faces.reduce((acc, id) => acc + aire(m, id, o()), 0);
      setMessage(t("planche.aire.resultat", { valeur: `${total.toFixed(precision).replace(".", SEPARATEUR_DECIMAL)} m²`, nombre: String(faces.length) }));
    },
    [o, precision, selectionDe],
  );
  const copierSelection = useCallback(
    (couper: boolean) => {
      const ids = selectionRef.current.filter((id) => genreAnnotation(id) === null);
      if (ids.length === 0) {
        setMessage(t("planche.presse-papiers.vide"));
        return;
      }
      // Le modèle d'avant l'effacement est gardé : un Ctrl + X puis Ctrl + V recolle bien la géométrie coupée.
      pressePapiers.current = { ids, dans: dansRef.current, source: histRef.current.present.modele };
      if (couper) effacerSelection();
      else setMessage(t("planche.presse-papiers.copie", { nombre: String(ids.length) }));
    },
    [effacerSelection],
  );
  const collerSelection = useCallback(
    () =>
      operer(t("planche.presse-papiers.colle"), (m, dans) => {
        const pp = pressePapiers.current;
        if (!pp || pp.dans !== dans) return { modele: m, message: t("planche.presse-papiers.vide") };
        const c = contexteDe(m, dans);
        const presentes = pp.ids.every((id) => c.sommets[id] || c.aretes[id] || c.faces[id] || c.courbes[id] || c.occurrences[id]);
        if (presentes) {
          const r = copier(m, pp.ids, { x: 1, y: 0, z: 0 }, { copies: 1 }, o());
          return { modele: r.modele, selection: r.rapport.crees, message: t("planche.presse-papiers.colle") };
        }
        // Entités coupées (ou effacées depuis) : copiées dans l'instantané d'origine avec des identifiants frais pour les
        // deux modèles, puis la différence (les seules créations) est reportée dans le modèle courant.
        const source: Modele = { ...pp.source, prochainId: Math.max(pp.source.prochainId, m.prochainId) };
        const r = copier(source, pp.ids, { x: 1, y: 0, z: 0 }, { copies: 1 }, o());
        const delta = differencePlanche(source, r.modele);
        if (!delta) return { modele: m, message: t("planche.presse-papiers.vide") };
        const defs: Record<string, (typeof m.definitions)[string]> = {};
        for (const id of r.rapport.crees) {
          const occ = contexteDe(r.modele, dans).occurrences[id];
          if (occ && !m.definitions[occ.definition] && r.modele.definitions[occ.definition]) defs[occ.definition] = r.modele.definitions[occ.definition]!;
        }
        const colle = appliquerDeltaPlanche(m, { ...delta, definitions: { ...(delta.definitions ?? {}), ...defs } });
        return { modele: colle, selection: r.rapport.crees, message: t("planche.presse-papiers.colle") };
      }),
    [operer, o],
  );

  /** Clic droit dans le dessin (§5.8) : l'entité visée rejoint la sélection si elle n'y est pas ; menu de Sélection. */
  const ouvrirMenuContextuel = useCallback(
    (p: { x: number; y: number }, rayon: Parameters<typeof viser>[1], tolerance: number) => {
      const m = histRef.current.present.modele;
      const dans = dansRef.current;
      const annotation = viserAnnotation(m, rayon, tolerance, p);
      const el = annotation ? null : viser(m, rayon, tolerance);
      const cible = el ? cibleDans(el, dans) : null;
      const vise = annotation ?? cible?.id ?? null;
      if (vise && !selectionRef.current.includes(vise)) {
        setSelection([vise]);
        rafraichir();
      }
      const sel = vise ? (selectionRef.current.includes(vise) ? selectionRef.current : [vise]) : selectionRef.current;
      const c = contexteDe(m, dans);
      const faces = sel.filter((id) => c.faces[id]);
      const aretes = sel.filter((id) => c.aretes[id]);
      const occs = sel.filter((id) => c.occurrences[id]);
      const geometrie = faces.length + aretes.length + occs.length > 0;
      const verrouille = occs.length > 0 && occs.every((id) => c.occurrences[id]!.verrouille);
      const unObjet = occs.length === 1 ? c.occurrences[occs[0]!]! : null;
      const def = unObjet ? m.definitions[unObjet.definition] : undefined;
      const adoucies = aretes.length > 0 && aretes.every((id) => c.aretes[id]!.adoucie);
      const rect = hoteRef.current?.getBoundingClientRect();
      const x = p.x + (rect?.left ?? 0);
      const y = p.y + (rect?.top ?? 0);
      const entrees: EntreeMenu[] = [];
      if (sel.length === 0) {
        entrees.push({ id: "rien", libelle: t("planche.menu.rien"), grise: true });
        entrees.push({ id: "coller", libelle: t("planche.menu.coller"), grise: !pressePapiers.current || readOnly, action: collerSelection });
        entrees.push({ id: "afficher-tout", libelle: t("planche.menu.afficher"), grise: readOnly, action: () => reafficher("tout") });
        entrees.push({ id: "groupe-vide", libelle: t("planche.menu.groupe-vide"), separateurAvant: true, grise: readOnly, action: creerGroupeVide });
        setMenu({ x, y, entrees });
        return;
      }
      entrees.push({ id: "info", libelle: t("planche.menu.info"), action: () => setPanneau("info-entite") });
      entrees.push({ id: "effacer", libelle: t("planche.menu.effacer"), grise: readOnly || verrouille, action: effacerSelection });
      if (geometrie) {
        entrees.push({ id: "masquer", libelle: t("planche.menu.masquer"), grise: readOnly, action: masquerSelection });
        if (occs.length > 0) entrees.push({ id: verrouille ? "deverrouiller" : "verrouiller", libelle: t(verrouille ? "planche.menu.deverrouiller" : "planche.menu.verrouiller"), grise: readOnly, action: () => verrouillerSelection(!verrouille) });
        entrees.push({
          id: "selectionner",
          libelle: t("planche.menu.selectionner"),
          separateurAvant: true,
          sous: [
            { id: "sel-aretes", libelle: t("planche.menu.sel.aretes"), grise: faces.length === 0, action: () => etendre("aretes-bordantes") },
            { id: "sel-faces", libelle: t("planche.menu.sel.faces"), grise: aretes.length === 0 && faces.length === 0, action: () => etendre("faces-connectees") },
            { id: "sel-tout", libelle: t("planche.menu.sel.tout"), action: () => etendre("tout-connecte") },
            { id: "sel-balise", libelle: t("planche.menu.sel.balise"), grise: occs.length === 0, action: () => etendre("meme-balise") },
            { id: "sel-materiau", libelle: t("planche.menu.sel.materiau"), action: () => etendre("meme-materiau") },
            { id: "sel-deselectionner", libelle: t("planche.menu.sel.deselectionner"), grise: faces.length === 0, action: () => etendre("deselectionner-faces") },
            { id: "sel-inverser", libelle: t("planche.menu.sel.inverser"), action: () => etendre("inverser") },
          ],
        });
        entrees.push({
          id: "aire",
          libelle: t("planche.menu.aire"),
          grise: faces.length === 0,
          sous: [
            { id: "aire-selection", libelle: t("planche.menu.aire.selection"), action: () => aireDe("selection") },
            { id: "aire-balise", libelle: t("planche.menu.aire.balise"), action: () => aireDe("balise") },
            { id: "aire-materiau", libelle: t("planche.menu.aire.materiau"), action: () => aireDe("materiau") },
          ],
        });
        entrees.push({ id: "composant", libelle: t("planche.menu.composant"), separateurAvant: true, grise: readOnly, action: ouvrirDialogueComposant });
        entrees.push({ id: "groupe", libelle: t("planche.menu.groupe"), grise: readOnly, action: grouperSelection });
        entrees.push({ id: "intersection", libelle: t("planche.menu.intersection"), grise: readOnly || (faces.length === 0 && occs.length === 0), sous: [{ id: "intersection-modele", libelle: t("planche.menu.intersection.modele"), action: intersecterSelection }] });
        // Objets O-2 (EX-UI-06) : surface liée à ses arêtes sources (racine seulement) → « Détacher le lien ».
        if (dans === undefined && faces.length > 0 && liensDesFaces(m, faces).length > 0) entrees.push({ id: "detacher-lien", libelle: t("planche.lien.detacher"), separateurAvant: true, grise: readOnly, action: detacherLienSelection });
        if (faces.length > 0) {
          entrees.push({ id: "aligner-vue", libelle: t("planche.menu.aligner-vue"), separateurAvant: true, action: alignerVue });
          entrees.push({ id: "aligner-repere", libelle: t("planche.menu.aligner-axes"), grise: false, action: alignerAxes });
          entrees.push({ id: "inverser-faces", libelle: t("planche.menu.inverser-faces"), grise: readOnly, action: inverserSelection });
          entrees.push({ id: "orienter-faces", libelle: t("planche.menu.orienter-faces"), grise: readOnly, action: orienterSelection });
          entrees.push({ id: "texture-unique", libelle: t("planche.menu.texture-unique"), grise: true });
        }
        if (aretes.length > 0) {
          entrees.push({ id: adoucies ? "durcir" : "adoucir", libelle: t(adoucies ? "planche.menu.durcir" : "planche.menu.adoucir"), separateurAvant: true, grise: readOnly, action: () => adoucirSelection(!adoucies) });
          // Lot 6 : « Diviser » lance l'outil Diviser sur l'arête choisie (nombre de segments), comme SketchUp.
          entrees.push({ id: "diviser", libelle: t("planche.menu.diviser"), grise: readOnly, action: () => choisirOutil("diviser") });
          if (aretes.some((id) => c.aretes[id]?.courbe)) entrees.push({ id: "diviser-courbe", libelle: t("planche.menu.diviser-courbe"), grise: readOnly, action: diviserCourbeSelection });
        }
        if (occs.length > 0) {
          const composant = def?.genre === "composant";
          entrees.push({ id: "modifier", libelle: t(composant ? "planche.menu.modifier-composant" : "planche.menu.modifier-groupe"), separateurAvant: true, grise: !unObjet || verrouille, action: () => unObjet && ouvrirOccurrence(unObjet.id) });
          entrees.push({ id: "eclater", libelle: t("planche.menu.eclater"), grise: readOnly || verrouille, action: eclaterSelection });
          entrees.push({ id: "renommer", libelle: t("planche.menu.renommer"), grise: readOnly || !unObjet, action: ouvrirRenommage });
          entrees.push({ id: "deplacer-vers", libelle: t("planche.menu.deplacer-vers"), grise: readOnly || verrouille || faces.length + aretes.length > 0, action: ouvrirDeplacer });
          entrees.push({ id: "rendre-unique", libelle: t("planche.menu.rendre-unique"), grise: readOnly || !def || nombreOccurrences(m, def.id) <= 1, action: rendreUniqueSelection });
          entrees.push({ id: "coque", libelle: t("planche.menu.coque"), grise: readOnly || occs.length !== 2 || booleensEtatRef.current !== "ok", action: coqueSelection });
          entrees.push({ id: "adoucir-lisser", libelle: t("planche.menu.adoucir-lisser"), grise: readOnly, action: () => setPanneau("adoucir") });
          entrees.push({ id: "reinitialiser-echelle", libelle: t("planche.menu.reinitialiser-echelle"), grise: true });
          entrees.push({ id: "reinitialiser-inclinaison", libelle: t("planche.menu.reinitialiser-inclinaison"), grise: true });
          // Chantier Axes (AX-4) : « Changer les axes » ouvre l'édition d'origine et d'axes du composant (Maj + F4).
          entrees.push({ id: "origine-composant", libelle: t("planche.menu.changer-axes"), grise: readOnly, action: () => ouvrirOrigineRef.current() });
        }
        // Objets O-1 : Éclater reste visible, grisé, quand la sélection ne contient aucun objet (comme SketchUp).
        if (occs.length === 0) entrees.push({ id: "eclater", libelle: t("planche.menu.eclater"), separateurAvant: true, grise: true });
        entrees.push({ id: "zoom-selection", libelle: t("planche.menu.zoom-selection"), separateurAvant: true, action: zoomSelection });
      }
      setMenu({ x, y, entrees });
    },
    [
      adoucirSelection,
      aireDe,
      alignerAxes,
      alignerVue,
      collerSelection,
      coqueSelection,
      choisirOutil,
      diviserCourbeSelection,
      creerGroupeVide,
      ouvrirRenommage,
      ouvrirDeplacer,
      eclaterSelection,
      detacherLienSelection,
      effacerSelection,
      etendre,
      grouperSelection,
      intersecterSelection,
      inverserSelection,
      masquerSelection,
      orienterSelection,
      ouvrirDialogueComposant,
      ouvrirOccurrence,
      rafraichir,
      readOnly,
      reafficher,
      rendreUniqueSelection,
      setMenu,
      setPanneau,
      setSelection,
      verrouillerSelection,
      zoomSelection,
    ],
  );
  const fermerMenu = useCallback(() => {
    setMenu(null);
    hoteRef.current?.focus({ preventScroll: true });
  }, [setMenu]);
  const menuRappel = useRef(ouvrirMenuContextuel);
  menuRappel.current = ouvrirMenuContextuel;

  /** Chantier Axes (AX-3) : capture du contexte de travail pour une scène, seulement si l'option est cochée. */
  const captureScene = (): { repere?: ReturnType<typeof captureDuContexte> } => {
    if (!etatUi.get().rappelerRepereScene) return {};
    const c = histContexteRef.current.courant;
    return { repere: captureDuContexte(c, repereDuContexte(c)) };
  };
  /**
   * Cas 2, lot 4 (n° 11, n° 108) : état de la vue mémorisé avec la scène (balises visibles, plans actifs, objets masqués,
   * style des faces) et date et heure du soleil de la vue.
   */
  const captureEtatL4 = (m: Modele): Pick<Scene, "etat" | "soleil"> => {
    const o = vueRef.current?.lireOptions();
    return { etat: capturerEtatScene(m, o?.modeFace), ...(o ? { soleil: { jour: o.jour, heure: o.heure } } : {}) };
  };
  /** Scènes (§6.8) : caméra enregistrée dans la Planche (annotation « v »), un pas chacune. */
  const ajouterScene = useCallback(
    () =>
      operer(t("planche.scenes.ajouter"), (m) => {
        const v = vueRef.current;
        if (!v) return null;
        const cam = v.etatCamera();
        const r = modifierAnnotations(m, (a, id) => {
          const i = id("v");
          a.scenes[i] = { id: i, nom: t("planche.scenes.nom", { numero: String(Object.keys(a.scenes).length + 1) }), position: cam.position, cible: cam.cible, champDeVision: cam.champDeVision, projection: cam.projection, ombres: vueRef.current?.lireOptions().ombres ?? false, ...captureScene(), ...captureEtatL4(m) };
          return i;
        });
        return { modele: r.modele, selection: [r.extra] };
      }),
    [operer],
  );
  const mettreAJourScene = useCallback(
    (id: string) =>
      operer(t("planche.scenes.mettre-a-jour"), (m) => {
        const v = vueRef.current;
        const s = m.annotations?.scenes?.[id];
        if (!v || !s) return null;
        const cam = v.etatCamera();
        // Chantier Axes (AX-3) : la capture de repère suit l'option ; décochée, la scène ne rappelle plus que la caméra.
        const { repere: _ancien, ...sansRepere } = s;
        return { modele: modifierAnnotations(m, (a) => void (a.scenes[id] = { ...sansRepere, position: cam.position, cible: cam.cible, champDeVision: cam.champDeVision, projection: cam.projection, ombres: v.lireOptions().ombres, ...captureScene(), ...captureEtatL4(m) })).modele };
      }),
    [operer],
  );
  const supprimerScene = useCallback((id: string) => operer(t("planche.scenes.supprimer"), (m) => ({ modele: modifierAnnotations(m, (a) => void delete a.scenes[id]).modele, selection: selectionRef.current.filter((x) => x !== id) })), [operer]);
  const appliquerScene = useCallback(
    (s: Scene) => {
      const v = vueRef.current;
      if (!v) return;
      v.appliquerScene(s);
      // Cas 2, lot 4 : échelle nominale (n° 43) en projection parallèle, soleil (n° 108), état mémorisé (n° 11).
      if (s.projection === "parallele" && s.echelle) v.poserEchelleNominale(s.echelle);
      const style = s.etat?.style as OptionsAffichage["modeFace"] | undefined;
      majOptions({ ...(s.ombres !== undefined ? { ombres: s.ombres } : {}), ...(s.soleil ? { jour: s.soleil.jour, heure: s.soleil.heure } : {}), ...(style ? { modeFace: style } : {}) });
      setSceneActive(s.id);
      if (s.etat) {
        const m0 = histRef.current.present.modele;
        const cle = (e: { balisesVisibles: readonly string[]; plansActifs: readonly string[]; masques: readonly string[] }) => JSON.stringify([[...e.balisesVisibles].sort(), [...e.plansActifs].sort(), [...e.masques].sort()]);
        const m1 = cle(capturerEtatScene(m0)) === cle(s.etat) ? m0 : appliquerEtatScene(m0, s.etat);
        if (m1 !== m0 && !readOnly) poserHistorique(enregistrer(histRef.current, m1, t("planche.scene.rappel", { nom: s.nom })));
      }
      // Chantier Axes (AX-3, AX14) : une scène qui capture un repère le rappelle ; sinon le contexte reste tel quel.
      if (s.repere) {
        const r = contexteDeScene(histContexteRef.current.courant, s.repere, histRef.current.present.modele);
        if (!r) setMessage(t("planche.scenes.repere-invalide"));
        else {
          changerContexte(r.contexte);
          if (r.perime) setMessage(t("planche.scenes.repere-perime"));
        }
      }
      setCamera({ projection: s.projection, champDeVision: s.champDeVision });
      setSelection([s.id]);
      rafraichir();
    },
    [majOptions, rafraichir, setSelection, changerContexte, readOnly, poserHistorique],
  );
  const vueStandard = useCallback((nom: VueStandard) => {
    vueRef.current?.vueStandard(nom);
    if (vueRef.current) setCamera({ projection: vueRef.current.projection, champDeVision: vueRef.current.champDeVision });
  }, []);
  const poserProjection = useCallback((p: "perspective" | "parallele") => {
    if (vueRef.current) vueRef.current.projection = p;
    setCamera((c) => ({ ...c, projection: p }));
  }, []);
  const poserChampDeVision = useCallback(
    (deg: number) => {
      if (vueRef.current) vueRef.current.champDeVision = deg;
      setCamera((c) => ({ ...c, champDeVision: deg }));
      rafraichir();
    },
    [rafraichir],
  );
  const poserPrecision = useCallback((d: number) => {
    setPrecision(d);
    try {
      window.localStorage.setItem(CLE_PRECISION, String(d));
    } catch {
      /* stockage indisponible : la préférence ne survit pas à la session */
    }
  }, []);
  const poserReglages = useCallback((r: ReglagesPlanche) => operer(t("planche.infomodele.enregistre"), (m) => ({ modele: modifierAnnotations(m, (a) => void (a.reglages = { ...r, ...(a.reglages?.emplacement && !r.emplacement ? { emplacement: a.reglages.emplacement } : {}), ...(a.reglages?.pointDeBase && !r.pointDeBase ? { pointDeBase: a.reglages.pointDeBase } : {}) })).modele, message: t("planche.infomodele.enregistre") })), [operer]);
  /** Cas 2, lot 1 : applique un style nommé à toutes les cotes du modèle (absent = chaque cote suit le style par défaut). */
  const appliquerStyleCotes = useCallback(
    (style: string | null) =>
      operer(t("planche.infomodele.style-cote.appliquer-court"), (m) => ({
        modele: modifierAnnotations(m, (a) => {
          for (const [id, c] of Object.entries(a.cotes)) {
            const { style: _s, ...reste } = c;
            a.cotes[id] = (style ? { ...reste, style } : reste) as Cote;
          }
        }).modele,
      })),
    [operer],
  );
  const actionsInfo = useMemo(
    () => ({
      renommerOccurrence: (id: string, nom: string) => operer(t("planche.info.nom"), (m) => ({ modele: renommerOccurrence(m, id, nom, o()).modele })),
      modifierDefinition: (def: string, meta: MetadonneesDefinition & { nom?: string }) => operer(t("planche.composants.modifier"), (m) => ({ modele: modifierDefinition(m, def, meta).modele })),
      verrouiller: (id: string, verrou: boolean) => operer(t(verrou ? "planche.menu.verrouiller" : "planche.menu.deverrouiller"), (m) => ({ modele: verrouillerOccurrences(m, [id], verrou, o()).modele })),
      masquer: (ids: string[], masquee: boolean) => operer(t(masquee ? "planche.menu.masquer" : "planche.menu.afficher"), (m, dans) => {
        if (masquee) derniersMasques.current = { ids, dans };
        return { modele: masquerEntites(m, ids, o(), masquee).modele, ...(masquee ? { selection: [] as string[] } : {}) };
      }),
      materiauFace: (id: string, cote: "recto" | "verso", materiau: string | null) => operer(t("planche.info.materiau"), (m) => ({ modele: peindreFacesCote(m, [id], cote, materiau, o()).modele })),
      materiauObjet: (id: string, materiau: string | null) => operer(t("planche.info.materiau"), (m) => ({ modele: peindreOccurrences(m, [id], materiau, o()).modele })),
      balise: (id: string, balise: string | null) => operer(t("planche.info.balise"), (m) => ({ modele: baliserOccurrences(m, [id], balise, o()).modele })),
      niveau: (id: string, niveau: string | null) =>
        operer(t("planche.info.niveau"), (m) => {
          const r = rattacherAuNiveau(m, [id], niveau);
          return "erreur" in r ? null : { modele: r.modele };
        }),
      renommerPlan: (id: string, nom: string) => operer(t("planche.info.nom"), () => ({ modele: modifierPlanDeCoupe(contexte(), id, { nom }).modele ?? histRef.current.present.modele })),
      // Cas 2, lot 1 : texte forcé, style, direction, plage gardée d'une cote ; cote pilotante ; cotes orphelines.
      modifierCote: (id: string, patch: { texteForce?: string | null; style?: string | null; direction?: DirectionCote; plage?: { min?: number; max?: number } | null }) =>
        operer(t("planche.info.cote"), (m) => ({
          modele: modifierAnnotations(m, (a) => {
            const c = a.cotes[id];
            if (!c) return;
            const n: Record<string, unknown> = { ...c };
            for (const [k, v] of Object.entries(patch)) {
              if (v === null || v === undefined || (k === "direction" && v === "alignee")) delete n[k];
              else n[k] = v;
            }
            if (c.genre !== "lineaire") {
              delete n.direction;
              delete n.plage;
            }
            a.cotes[id] = n as unknown as Cote;
          }).modele,
        })),
      piloterCote: (id: string, valeur: number) => operer(t("planche.cote.pilote"), (m) => ({ modele: piloterCote(m, id, valeur).modele })),
      // Cas 2, lot 2 : longueur d'une arête, coordonnées d'un sommet (racine), objet ou balise exclu de l'accrochage.
      longueurArete: (id: string, longueur: number) => operer(t("planche.info.longueur"), (m) => ({ modele: changerLongueurArete(m, id, longueur).modele })),
      placerSommet: (id: string, position: Vec3) => operer(t("planche.arete.sommets"), (m) => ({ modele: placerSommet(m, id, position).modele })),
      exclureAccrochage: (id: string, exclu: boolean) => operer(t("planche.accrochage.titre"), (m) => ({ modele: exclureDeLAccrochage(m, [id], exclu, o()).modele })),
      exclureBalise: (id: string, exclue: boolean) =>
        operer(t("planche.accrochage.titre"), (m) => ({
          modele: modifierAnnotations(m, (a) => {
            const b = a.balises[id];
            if (!b) return;
            const { horsAccrochage: _h, ...reste } = b;
            a.balises[id] = exclue ? { ...reste, horsAccrochage: true } : reste;
          }).modele,
        })),
      selectionnerCotes: (ids: readonly string[]) => setSelection(ids),
    }),
    [contexte, o, operer, setSelection],
  );

  // Cas 2, lot 1 : une opération qui sort une cote de sa plage gardée est signalée, jamais corrigée.
  const modelePrecedentPlage = useRef<Modele | null>(null);
  useEffect(() => {
    const avant = modelePrecedentPlage.current;
    const apres = hist.present.modele;
    modelePrecedentPlage.current = apres;
    if (!avant || avant === apres) return;
    const hors = nouvellesSortiesDePlage(avant, apres);
    if (hors.length > 0) setMessage(t("planche.cote.sortie-plage", { nombre: String(hors.length) }));
  }, [hist.present.modele]);

  /** Fin de la saisie d'un texte (Entrée, bouton, clic dans le dessin) : le texte tapé remplace la proposition, zone fermée. */
  const validerEdition = useCallback(() => {
    const texte = editionRef.current?.value;
    setEdition(null);
    if (texte !== undefined) envoyer({ genre: "saisie", texte });
    hoteRef.current?.focus({ preventScroll: true });
  }, [envoyer]);
  validerEditionRef.current = validerEdition;

  const envoyerTouche = useCallback(
    (touche: Touche, etat: "enfoncee" | "relachee") => {
      if (etat === "enfoncee") touchesTenues.current.add(touche);
      else touchesTenues.current.delete(touche);
      envoyer({ genre: "touche", touche, etat });
    },
    [envoyer],
  );

  /**
   * Échap (décision P-5, comportement relevé C23) : annule l'opération en cours et GARDE l'outil ; sans opération en
   * cours, un outil de dessin ou de modification reste actif, Sélection vide la sélection, et seuls les outils de caméra
   * (Orbite, Panoramique, Zoom) rendent l'outil précédent. D-156 reste inchangé pour Plan / 3D.
   */
  const echap = useCallback(() => {
    frappeRef.current = consommerFrappe(frappeRef.current);
    if (grilleRef.current) {
      setGrille(false);
      return;
    }
    setTexte(null);
    if (edition) {
      // Échap pendant la saisie d'un texte : le texte proposé reste (§4.26).
      setEdition(null);
      envoyer({ genre: "echap" });
      hoteRef.current?.focus({ preventScroll: true });
      return;
    }
    const m = machineParId(outilRef.current);
    let enCours = false;
    if (m) {
      const avant = JSON.stringify(etatMachineRef.current);
      const dansAvant = dansRef.current;
      const change = envoyer({ genre: "echap" });
      // « En cours » : l'état de l'outil a changé, ou l'on sort d'un groupe ; une sélection vidée ne compte pas.
      enCours = change && (JSON.stringify(etatMachineRef.current) !== avant || dansRef.current !== dansAvant);
    }
    if (enCours) return;
    if (estOutilCamera(outilRef.current)) {
      retourOutil();
      return;
    }
    // Texte 3D : Échap sur la boîte de dialogue rend l'outil précédent (CA-T3D-3).
    if (outilRef.current === "texte-3d" && (etatMachineRef.current as EtatTexte3D | null)?.boite) {
      retourOutil();
      return;
    }
    // Outil de dessin, de modification ou Sélection : l'outil reste actif ; la sélection est vidée.
    setSelection([]);
    rafraichir();
  }, [edition, envoyer, rafraichir, retourOutil, setSelection, setTexte]);

  /** Entrée : valide la saisie du champ Mesures (ou transmet Entrée à l'outil quand le champ est vide). */
  const valider = useCallback(() => {
    // Une saisie déjà validée n'est pas renvoyée : Entrée seule va à l'outil (confirmation du Mètre, fin de chaîne).
    const saisie = texteRef.current?.statut === "frappe" ? texteRef.current.texte.trim() : "";
    if (!saisie) {
      envoyerTouche("Entree", "enfoncee");
      envoyerTouche("Entree", "relachee");
      return;
    }
    if (outilRef.current === "positionner-camera" || outilRef.current === "regarder-autour" || outilRef.current === "marcher") {
      const r = analyserSaisie(saisie, { attendu: "longueur", separateurDecimal: SEPARATEUR_DECIMAL });
      if (r.genre === "longueur" && r.valeur > 0) {
        setHauteurOeil(r.valeur);
        setMessage(t("planche.camera.hauteur", { valeur: virgule(r.valeur) }));
        setTexte({ texte: saisie, statut: "valide" });
        rafraichir();
      } else setMessage(r.genre === "erreur" ? r.message : t("planche.saisie.refusee", { texte: saisie }));
      return;
    }
    if (outilRef.current === "zoom") {
      const r = analyserSaisie(saisie, { attendu: "champ-vision", separateurDecimal: SEPARATEUR_DECIMAL });
      if (r.genre === "champ-vision" && vueRef.current) {
        vueRef.current.champDeVision = r.degres;
        setMessage(t("planche.camera.fov", { valeur: virgule(vueRef.current.champDeVision) }));
        setTexte({ texte: saisie, statut: "valide" });
        rafraichir();
      } else setMessage(r.genre === "erreur" ? r.message : t("planche.saisie.refusee", { texte: saisie }));
      return;
    }
    const m = machineParId(outilRef.current);
    if (!m || !vue.mesures) {
      setMessage(t("planche.saisie.inactive"));
      return;
    }
    envoyer({ genre: "saisie", texte: saisie });
    setTexte({ texte: saisie, statut: "valide" });
  }, [envoyer, envoyerTouche, rafraichir, setHauteurOeil, setTexte, vue.mesures]);
  const validerRef = useRef(valider);
  validerRef.current = valider;

  // --- Hauteur réelle du pied (barre de modificateurs + barre d'état) : la barre d'outils et les panneaux s'arrêtent au-dessus,
  // sans jamais passer sous lui ni le recouvrir (téléphone : la barre d'état tient sur plusieurs lignes).
  useEffect(() => {
    const racine = racineRef.current;
    const pied = piedRef.current;
    if (!racine || !pied) return;
    const volet = voletRef.current;
    const mesurer = () => {
      racine.style.setProperty("--pied-h", `${Math.ceil(pied.getBoundingClientRect().height)}px`);
      // Téléphone : le volet entier (outils + pied) ; au bureau il n'a pas de boîte (`display: contents`) → 0.
      racine.style.setProperty("--volet-h", `${Math.ceil(volet?.getBoundingClientRect().height ?? 0)}px`);
    };
    mesurer();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(mesurer);
    o.observe(pied);
    if (volet) o.observe(volet);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    // Largeur de la fenêtre qui porte la Planche (page, ou fenêtre détachée redimensionnée) : barre d'actions du bandeau
    // ou barre flottante selon ELLE, jamais selon la page restée derrière.
    const hote = racineRef.current?.ownerDocument.defaultView ?? window;
    const mq = hote.matchMedia("(max-width: 760px)");
    // En passant au format téléphone (rotation, fenêtre rétrécie), la colonne se replie aussi en icônes.
    const maj = () => {
      setEtroit(mq.matches);
      if (mq.matches) setColonneRepliee(true);
    };
    if (mq.matches !== etroitRef.current) maj();
    mq.addEventListener("change", maj);
    return () => {
      mq.removeEventListener("change", maj);
    };
  }, [detache]);

  // --- Vue three.js : créée une fois, détruite au démontage.
  useEffect(() => {
    const hote = hoteRef.current;
    if (!hote) return;
    let v: VuePlanche;
    try {
      v = new VuePlanche(hote, {
        evenement: (ev) => {
          if (ev.genre === "survol" && texteRef.current?.statut === "valide") setTexte(null);
          // Saisie de texte ouverte (§4.31) : un clic dans le dessin valide le texte tapé et ferme la zone ; ce clic ne va pas
          // à l'outil (il « termine », il ne commence pas une autre annotation).
          if (editionRef.current && (ev.genre === "clic" || ev.genre === "appui")) {
            if (ev.genre === "clic") validerEditionRef.current();
            return;
          }
          envoyer(ev);
        },
        outilCamera: () => (estOutilCamera(outilRef.current) ? (outilRef.current as OutilCamera) : null),
        loupe: () => outilRef.current === "cotation" || outilRef.current === "texte",
        navigation: () => navigationRef.current,
        tactile: () => setTactile(true),
        // Outils de caméra temporaires (§4.34) : Zoom fenêtre rend l'outil précédent, Positionner la caméra enchaîne
        // sur Regarder autour (l'outil précédent reste celui d'avant Positionner).
        finOutilCamera: (id) => {
          if (id === "positionner-camera") demandeOutilRef.current("regarder-autour", { garderPrecedent: true });
          else retourOutilRef.current();
        },
        hauteurOeil: () => hauteurOeilRef.current,
        menuContextuel: (p, rayon, tolerance) => menuRappel.current(p, rayon, tolerance),
        dans: () => dansRef.current,
        isolement: () => isolementRef.current,
        chemin: () => cheminRef.current,
      });
    } catch {
      setWebgl("indisponible");
      return;
    }
    vueRef.current = v;
    v.poserRepereTravail(histContexteRef.current.courant.repere);
    v.poserTriade(etatUi.get().triade, t("planche.reperes.triade", { repere: t(etatUi.get().triade.represente === "modele" ? "planche.reperes.affichage.represente.modele" : "planche.reperes.affichage.represente.travail") }));
    v.majModele(histRef.current.present.modele);
    rafraichir();
    fenetreRecette().fadiPlanche = {
      modele: () => histRef.current.present.modele,
      outil: () => outilRef.current,
      etatOutil: () => etatMachineRef.current,
      selection: () => selectionRef.current,
      pas: () => histRef.current.passe.length,
      versEcran: (p) => vueRef.current?.versEcran(p) ?? null,
      materiau: () => materiauRef.current,
      balise: () => baliseRef.current,
      // Cas 2, lot 4 : échelle nominale rendue et plans de rognage de la vue (recette).
      echelleRendue: () => vueRef.current?.echelleRendue() ?? null,
      plansRognage: () => vueRef.current?.plansRognage() ?? 0,
      hauteurOeil: () => hauteurOeilRef.current,
      booleens: () => (booleensRef.current ? "ok" : booleensEtatRef.current),
      emprise: () => vueRef.current?.emprise() ?? null,
      camera: () => vueRef.current?.etatCamera() ?? { position: { x: 0, y: 0, z: 0 }, champDeVision: 35 },
      dans: () => dansRef.current,
      panneau: () => panneauRef.current,
      options: () => vueRef.current?.lireOptions() ?? OPTIONS_AFFICHAGE_DEFAUT,
      menu: () => menuRef.current?.entrees.map((e) => e.id) ?? null,
      pressePapiers: () => pressePapiers.current?.ids.length ?? 0,
      facesRendues: () => vueRef.current?.facesRendues() ?? 0,
      contexteTravail: () => ({ contexte: histContexteRef.current.courant, precedents: histContexteRef.current.precedents.length }),
      // Cas 2, lot 7 : traits de différence surlignés et consultation en cours (recette).
      differences: () => vueRef.current?.differencesAffichees() ?? null,
      consultation: () => (consultationRef.current ? (consultationRef.current.jalon?.id ?? "courante") : null),
    };
    return () => {
      v.detruire();
      vueRef.current = null;
      delete fenetreRecette().fadiPlanche;
    };
  }, [envoyer, rafraichir, setTexte]);
  // Cas 2, lot 1 : format des cotes dans la vue (précision de l'Info modèle, séparateur décimal de la Planche), déclaré après la
  // création de la vue pour que la précision enregistrée s'applique dès l'ouverture.
  useEffect(() => {
    vueRef.current?.majFormatCotes(precision, SEPARATEUR_DECIMAL);
    rafraichir();
  }, [precision, rafraichir, envoyer, setTexte]);

  // --- Brouillon propre à Sandbox : lu à l'ouverture (s'il n'y a encore rien de dessiné), enregistré après chaque pas.
  useEffect(() => {
    let annule = false;
    setBrouillonCharge(false);
    void (async () => {
      try {
        const idx = await chargerIndex();
        if (annule) return;
        indexRef.current = idx;
        setIndexPlanches(idx);
        const m = await chargerBrouillon(idx.courante);
        const journal = await chargerJournal(idx.courante);
        if (annule) return;
        journalRef.current = journal;
        if (remplacerRef.current) {
          // Changement de Planche : le dessin, l'historique, la sélection et l'objet ouvert sont ceux de la nouvelle Planche.
          remplacerRef.current = false;
          poserDans(undefined);
          setSelection([]);
          consultationRef.current = null;
          setConsultation(null);
          poserHistorique(historiqueInitial(m ?? modeleVide()), { envoyer: false });
          // Cas 2, lot 7 (n° 73) : brouillon appliqué à l'original, en un seul pas d'historique (annulable).
          const applique = appliquerApresRef.current;
          appliquerApresRef.current = null;
          if (applique) poserHistorique(enregistrer(histRef.current, applique, t("planche.brouillon.operation"), false));
        } else if (m && !consultationRef.current && histRef.current.passe.length === 0 && histRef.current.futur.length === 0) poserHistorique(historiqueInitial(m), { envoyer: false });
        // Contexte de travail de cette Planche : celui de ce navigateur, sinon l'ancien repère du document (AX-D4).
        poserContextes(historiqueContextes(contexteMemorise(idx.courante) ?? contexteDepuisDocument(histRef.current.present.modele.annotations?.repere)));
        setBrouillonCharge(true);
        setDessinCharge((n) => n + 1);
        rafraichir();
      } catch {
        if (!annule) setEtatSauvegarde("erreur");
      }
    })();
    return () => {
      annule = true;
    };
  }, [poserHistorique, rafraichir, essaiLecture, chargeId, poserDans, setSelection, poserContextes]);
  useEffect(() => {
    if (!brouillonCharge || readOnly) return;
    const ticket = sauvegarde.modifier();
    const minuterie = window.setTimeout(() => void sauvegarde.sauver(hist.present.modele, ticket), 300);
    return () => { window.clearTimeout(minuterie); sauvegarde.invalider(); };
  }, [hist.present.modele, readOnly, brouillonCharge, sauvegarde, essaiSauvegarde]);
  useEffect(() => {
    if (readOnly || etatSauvegarde === "enregistre" || etatSauvegarde === "chargement") return;
    const prevenir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", prevenir);
    return () => window.removeEventListener("beforeunload", prevenir);
  }, [etatSauvegarde, readOnly]);
  const actionsMenu = useMemo<ActionsMenuPlanche>(() => {
    const courante = () => plancheDe(indexRef.current);
    const poserIndex = async (idx: IndexPlanches) => {
      indexRef.current = idx;
      setIndexPlanches(idx);
      await enregistrerIndex(idx);
    };
    const motif = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const echec = (e: unknown) => setMessage(t("planche.sb.echec", { motif: motif(e) }));
    const nomFichier = () => (nomAffiche(courante()).replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "planche");
    /** Cas 2, lot 6 : le fichier importé et son rapport sont archivés tels quels en base (D-GD-29). */
    /** Fichier importé rangé tel quel en base (octets d'origine pour un STL, binaire ou ASCII), puis son rapport. */
    const archiverEchange = async (nom: string, contenu: string | Uint8Array, rapport: RapportEchange) => {
      const a = typeof contenu === "string" ? await archiverFichierExtension("planche-echange", { nom, texte: contenu }) : await archiverFichierExtension("planche-echange", { nom, texte: "" }, contenu);
      const b = a.ok ? await archiverFichierExtension("planche-echange", { nom: `${nom}.rapport.txt`, texte: texteRapport(rapport) }) : a;
      if (a.ok && b.ok) setArchiveImport(t("planche.echange.archive.ok", { empreinte: empreinteCourte(a.archive.empreinte) }));
      else setArchiveImport(t("planche.echange.archive.refus", { motif: t(`planche.pieces.motif.${(!a.ok ? a : b as { motif: string }).motif}` as "planche.pieces.motif.reseau") }));
    };
    /** Écrit la Planche courante sans attendre l'enregistrement automatique. */
    const ecrireCourante = async () => {
      sauvegarde.invalider();
      const id = indexRef.current.courante;
      // Consultation d'un jalon : c'est l'état courant mis de côté qui est écrit, jamais le jalon affiché.
      await enregistrerBrouillon(consultationRef.current?.retour?.present.modele ?? histRef.current.present.modele, id);
      await enregistrerJournal(id, journalRef.current).catch(() => undefined);
      await poserIndex(avecInfo(indexRef.current, id, { modifieA: new Date().toISOString() }));
    };
    const noter = (description: string) => {
      journalRef.current = ajouterEntree(journalRef.current, { a: new Date().toISOString(), auteur: t("planche.sb.auteur"), description });
    };
    /** Ouvre la Planche `idx.courante` : l'ancienne a déjà été écrite, le dessin est relu. */
    const basculerVers = async (idx: IndexPlanches) => {
      sauvegarde.invalider();
      remplacerRef.current = true;
      await poserIndex(idx);
      setChargeId((n) => n + 1);
    };
    return {
      ouvrir: async (id) => {
        try {
          if (id === indexRef.current.courante) return;
          await ecrireCourante();
          const idx = avecCourante(indexRef.current, id);
          await basculerVers(idx);
          setMessage(t("planche.sb.ouverte", { nom: nomAffiche(plancheDe(idx)) }));
        } catch (e) {
          echec(e);
        }
      },
      creer: async (nom, altitude, modele) => {
        try {
          await ecrireCourante();
          const maintenant = new Date().toISOString();
          const idx = avecNouvelle(indexRef.current, { id: nouvelId(indexRef.current), nom, altitudeRef: altitude, creeA: maintenant, modifieA: maintenant });
          await enregistrerBrouillon(modele ?? modeleVide(), idx.courante);
          await enregistrerJournal(idx.courante, ajouterEntree([], { a: maintenant, auteur: t("planche.sb.auteur"), description: t("planche.sb.journal.creee") })).catch(() => undefined);
          await basculerVers(idx);
          setMessage(t("planche.sb.creee", { nom }));
        } catch (e) {
          if (e instanceof RangeError) setMessage(t("planche.sb.max", { n: "50" }));
          else echec(e);
        }
      },
      enregistrer: async () => {
        try {
          noter(t("planche.sb.journal.enregistree"));
          await ecrireCourante();
          setEtatSauvegarde("enregistre");
          setMessage(t("planche.sb.enregistree", { nom: nomAffiche(courante()) }));
        } catch (e) {
          setEtatSauvegarde("erreur");
          echec(e);
        }
      },
      enregistrerSous: async (nom) => {
        try {
          await ecrireCourante();
          const maintenant = new Date().toISOString();
          const idx = avecNouvelle(indexRef.current, { id: nouvelId(indexRef.current), nom, altitudeRef: courante().altitudeRef, creeA: maintenant, modifieA: maintenant });
          await enregistrerBrouillon(histRef.current.present.modele, idx.courante);
          // Chantier Axes (revue Codex de #298) : la copie garde le contexte de travail affiché — il est personnel et
          // hors du document, donc mémorisé sous l'identifiant de la nouvelle Planche.
          memoriserContexte(idx.courante, histContexteRef.current.courant);
          // Le journal de la copie reprend celui de l'original, puis note la copie.
          journalRef.current = ajouterEntree(journalRef.current, { a: maintenant, auteur: t("planche.sb.auteur"), description: t("planche.sb.journal.copiee", { nom }) });
          await enregistrerJournal(idx.courante, journalRef.current).catch(() => undefined);
          // Copie : le dessin et son historique restent à l'écran, l'enregistrement suit désormais la nouvelle Planche.
          await poserIndex(idx);
          setMessage(t("planche.sb.copiee", { nom }));
        } catch (e) {
          if (e instanceof RangeError) setMessage(t("planche.sb.max", { n: "50" }));
          else echec(e);
        }
      },
      renommer: async (nom, altitude) => {
        try {
          noter(t("planche.sb.journal.renommee", { nom }));
          await enregistrerJournal(indexRef.current.courante, journalRef.current).catch(() => undefined);
          await poserIndex(avecInfo(indexRef.current, indexRef.current.courante, { nom, altitudeRef: altitude, modifieA: new Date().toISOString() }));
          setMessage(t("planche.sb.renommee", { nom }));
        } catch (e) {
          echec(e);
        }
      },
      supprimer: async () => {
        try {
          const id = indexRef.current.courante;
          const nom = nomAffiche(courante());
          sauvegarde.invalider();
          await supprimerDocument(id);
          await supprimerJournal(id).catch(() => undefined);
          await supprimerVersions(id);
          await basculerVers(sansPlanche(indexRef.current, id));
          setMessage(t("planche.sb.supprimee", { nom }));
        } catch (e) {
          echec(e);
        }
      },
      partager: async () => {
        try {
          const nom = nomFichier();
          const r = exporterIfc(histRef.current.present.modele, nomAffiche(courante()));
          const fichier = new File([r.contenu], `${nom}.ifc`, { type: "application/x-step" });
          if (typeof navigator.canShare === "function" && navigator.canShare({ files: [fichier] })) {
            try {
              await navigator.share({ files: [fichier], title: nomAffiche(courante()) });
              noterEmissionRef.current("IFC", fichier.name, "partage");
              setMessage(t("planche.sb.partage.ok"));
            } catch (e) {
              if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
            }
          } else {
            telechargerFichier(fichier, fichier.name);
            noterEmissionRef.current("IFC", fichier.name, "emission");
            setMessage(t("planche.sb.partage.fichier"));
          }
        } catch (e) {
          echec(e);
        }
      },
      // Cas 2, lot 6 (n° 90, 95, 6) : Fichier > Exporter ouvre le panneau « Exporter » (ce qui sera écrit, objets non
      // affichés, rapport prévu) ; le téléchargement part de son bouton, avec le rapport joint.
      exporter: async (format) => {
        setFormatExport(format);
        setPanneau("echange-export");
        setMessage(t("planche.echange.export.consigne", { format: format.toUpperCase() }));
      },
      importer: async (format: FormatEchange, fichier: File, unite: UniteFichier) => {
        try {
          const date = horodatage();
          if (format === "ifc") {
            // Cas 2, lot 6 (n° 2, 22, 91) : lecture complète, objets posés à leur place, rangés par étage et par classe.
            const texte = await fichier.text();
            const lu = lireIfcComplet(texte);
            if (lu.objets.length === 0) throw new ErreurImport("vide", "Aucun objet avec une représentation dans ce fichier IFC.");
            const r = importerIfc(histRef.current.present.modele, lu, fichier.name, date);
            if (r.occurrence !== null) {
              poserHistorique(enregistrer(histRef.current, r.modele, t("planche.sb.import.operation", { format: "IFC" }), false));
              rafraichir();
            }
            const total = r.rapport.lignes[0]!;
            setRapportImport({ rapport: r.rapport, arbre: r.arbre });
            setArchiveImport(null);
            setPanneau("echange-import");
            setMessage(t("planche.echange.import.ok", { format: "IFC", objets: String((total.ecrits ?? 0) + (total.approches ?? 0)) }));
            void archiverEchange(fichier.name, texte, r.rapport);
            return;
          }
          const donnees = format === "stl" ? new Uint8Array(await fichier.arrayBuffer()) : await fichier.text();
          const lu = lireMaillages(format, donnees);
          const echelle = lu.echelleFichier ?? ECHELLE_UNITE[unite];
          const r = importerMaillages(histRef.current.present.modele, lu.maillages, echelle, fichier.name.replace(/\.[^.]+$/, ""), { format, fichier: fichier.name });
          poserHistorique(enregistrer(histRef.current, r.modele, t("planche.sb.import.operation", { format: format.toUpperCase() }), false));
          rafraichir();
          const u = echelle === 1 ? "m" : echelle === 0.01 ? "cm" : echelle === 0.001 ? "mm" : `×${echelle}`;
          setMessage(`${t("planche.sb.import.ok", { format: format.toUpperCase(), objets: String(r.objets), triangles: String(r.triangles), unite: u })}${r.ignores > 0 ? ` ${t("planche.sb.import.ignores", { n: String(r.ignores) })}` : ""}`);
          // Cas 2, lot 6 (n° 6) : rapport chiffré de l'import OBJ / STL aussi, archivé avec le fichier tel quel.
          const rapport = rapportImportMaillages(format, fichier.name, r, date);
          setRapportImport({ rapport, arbre: [] });
          setArchiveImport(null);
          setPanneau("echange-import");
          void archiverEchange(fichier.name, donnees, rapport);
        } catch (e) {
          setMessage(t("planche.sb.import.erreur", { motif: e instanceof ErreurImport || e instanceof Error ? e.message : String(e) }));
        }
      },
      telechargerPng: async () => {
        const blob = await vueRef.current?.capture();
        if (blob) {
          telechargerFichier(blob, `${nomFichier()}.png`);
          noterEmissionRef.current("PNG", `${nomFichier()}.png`, "emission");
        }
      },
      informations: () => {
        const m = histRef.current.present.modele;
        const racine = compterContexte(m.racine);
        const faces = Object.values(m.definitions).reduce((n, d) => n + compterContexte(d.contenu).faces, racine.faces);
        const aretes = Object.values(m.definitions).reduce((n, d) => n + compterContexte(d.contenu).aretes, racine.aretes);
        const omis = omisExport(m);
        return {
          octets: new TextEncoder().encode(serialiserBrouillon(m)).length,
          objets: racine.occurrences,
          faces,
          aretes,
          annotations: omis.annotations,
          aretesLibres: omis.aretesLibres,
          nonEtanches: nonEtanchesDe(maillagesPlanche(m)),
          pasAnnulables: histRef.current.passe.length,
          chronologie: dernieresEntrees(journalRef.current),
        };
      },
    };
  }, [poserHistorique, rafraichir, sauvegarde]);

  // Raccourcis en deux temps : encadré ouvert après la touche d'entrée, refermé à la touche suivante ou après 5 s.
  const [deuxTemps, setDeuxTemps] = useState(false);
  const deuxTempsRef = useRef(false);
  const minuteurDeuxTemps = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finirDeuxTempsRef = useRef(() => {});
  const ouvrirDeuxTempsRef = useRef(() => {});
  finirDeuxTempsRef.current = () => {
    deuxTempsRef.current = false;
    if (minuteurDeuxTemps.current) clearTimeout(minuteurDeuxTemps.current);
    minuteurDeuxTemps.current = null;
    setDeuxTemps(false);
  };
  ouvrirDeuxTempsRef.current = () => {
    deuxTempsRef.current = true;
    if (minuteurDeuxTemps.current) clearTimeout(minuteurDeuxTemps.current);
    minuteurDeuxTemps.current = setTimeout(() => finirDeuxTempsRef.current(), 5000);
    setDeuxTemps(true);
  };
  useEffect(() => () => void (minuteurDeuxTemps.current && clearTimeout(minuteurDeuxTemps.current)), []);

  // --- Clavier (fenêtre) : touches d'état, annuler / rétablir, Échap, Entrée, frappe au champ Mesures, raccourcis.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      // Lot 9 (EX-CMD-04) : toute touche passe par le suivi des frappes seules, même dans un champ (elle consomme alors).
      const modif = toucheEtat(e.key);
      frappeRef.current = appuiFrappe(frappeRef.current, modif === "Maj" || modif === "Ctrl" || modif === "Alt" ? modif : e.key || "?", e.repeat);
      const cible = e.target;
      const dansMesures = cible === champMesures.current;
      // C19 : jamais de capture quand le focus est dans un autre champ (recherche, réglages…).
      if ((champSaisie(cible) && !dansMesures) || rechercheRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      const cle = e.key.toLowerCase();
      if (mod && !e.altKey && cle === "z") {
        e.preventDefault();
        if (e.shiftKey) retablirPas();
        else annulerPas();
        return;
      }
      if (mod && !e.altKey && cle === "y") {
        e.preventDefault();
        retablirPas();
        return;
      }
      // Lot 9 (EX-CMD-01) : registre unique — Ctrl + G (Grouper), Ctrl + Maj + G (Éclater), Alt + Maj + lettre (objets,
      // Navigateur, vue, lien) et F2, une seule résolution (touche physique sous Alt pour macOS), la disponibilité de la
      // famille fait foi (un objet verrouillé n'est pas éclaté).
      // Raccourcis en deux temps (décision du 27 novembre 2026) : la touche d'entrée ouvre l'encadré des secondes
      // touches ; la touche suivante exécute la commande (Échap, ou une touche sans commande, annule).
      if (deuxTempsRef.current && !dansMesures) {
        if (modif === "Maj" || modif === "Ctrl" || modif === "Alt" || e.key === "Meta") return;
        e.preventDefault();
        finirDeuxTempsRef.current();
        if (e.key === "Escape") return;
        const seconde = commandeDuSecondTemps(e) ?? commandeDuSecondTemps({ key: e.key, code: e.code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: e.shiftKey });
        if (seconde) executerCommandeRef.current(seconde);
        return;
      }
      if (estEntreeDeuxTemps(e) && !dansMesures) {
        e.preventDefault();
        ouvrirDeuxTempsRef.current();
        return;
      }
      const commande = commandeDuClavier(e);
      if (commande && routeeParLeRegistre(commande) && !dansMesures) {
        e.preventDefault();
        executerCommandeRef.current(commande);
        return;
      }
      // Protocole des extensions, lot 3 : raccourci d'une commande d'extension installée, après ceux de la Planche.
      const commandeExtension = dansMesures ? null : commandeExtensionDuClavierRef.current(e);
      if (commandeExtension) {
        e.preventDefault();
        if (!commandeExtension.motif) commandeExtension.executer();
        return;
      }
      // Lot 5 (objets) : G composant, K arêtes arrière, Ctrl + A tout, Ctrl + Maj + I inverser, Ctrl + C / X / V presse-papiers.
      if (!mod && !e.altKey && !e.shiftKey && cle === "g" && !dansMesures && !texteRef.current) {
        e.preventDefault();
        ouvrirDialogueComposant();
        return;
      }
      if (!mod && !e.altKey && !e.shiftKey && cle === "k" && !dansMesures && !texteRef.current) {
        e.preventDefault();
        majOptions({ aretesArriere: !(vueRef.current?.lireOptions().aretesArriere ?? false) });
        return;
      }
      if (mod && !e.altKey && !dansMesures && cle === "a") {
        e.preventDefault();
        etendre("tout");
        return;
      }
      if (mod && !e.altKey && e.shiftKey && !dansMesures && cle === "i") {
        e.preventDefault();
        etendre("inverser");
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && !dansMesures && (cle === "c" || cle === "x" || cle === "v")) {
        if (cle === "v") {
          // Cas 2, lot 6 (n° 112) : l'événement « paste » qui suit lit le presse-papiers du système (tracé SVG, DXF ou
          // sommets) ; s'il n'en apporte pas, la copie interne est collée comme avant.
          window.clearTimeout(attenteCollerRef.current);
          attenteCollerRef.current = window.setTimeout(() => {
            attenteCollerRef.current = 0;
            collerSelection();
          }, 120);
          return;
        }
        e.preventDefault();
        copierSelection(cle === "x");
        return;
      }
      const etat = toucheEtat(e.key);
      if (etat) {
        if (etat.startsWith("Fleche") || etat === "Alt") e.preventDefault();
        if (!e.repeat) envoyerTouche(etat, "enfoncee");
        return;
      }
      if (mod && (e.key === "+" || e.key === "=" || e.key === "-")) {
        e.preventDefault();
        const t2: Touche = e.key === "-" ? "CtrlMoins" : "CtrlPlus";
        envoyerTouche(t2, "enfoncee");
        envoyerTouche(t2, "relachee");
        return;
      }
      if (estRecherche(e)) {
        e.preventDefault();
        setRecherche(true);
        return;
      }
      // Objets O-2 : Maj + Échap ferme le groupe ouvert, Maj + Origine revient à la racine (avec n'importe quel outil).
      if (e.key === "Escape" && e.shiftKey && dansRef.current !== undefined) {
        e.preventDefault();
        fermerContexte("fermer");
        return;
      }
      if (e.key === "Home" && e.shiftKey && !mod && dansRef.current !== undefined && !dansMesures) {
        e.preventDefault();
        fermerContexte("fermer-tout");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        echap();
        return;
      }
      // Entrée ou Espace sur un bouton, un lien ou une liste : l'élément garde son action (clavier, D-161).
      if ((e.key === "Enter" || e.key === " ") && commeElement(cible)?.closest("button, a[href], summary, select") && !texteRef.current) return;
      if (e.key === "Enter") {
        e.preventDefault();
        validerRef.current();
        return;
      }
      const enFrappe = texteRef.current?.statut === "frappe" && texteRef.current.texte !== "";
      if (e.key === "Backspace" && !dansMesures && enFrappe) {
        e.preventDefault();
        const reste = texteRef.current!.texte.slice(0, -1);
        setTexte(reste ? { texte: reste, statut: "frappe" } : null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !dansMesures) {
        e.preventDefault();
        envoyerTouche("Suppr", "enfoncee");
        envoyerTouche("Suppr", "relachee");
        return;
      }
      if (dansMesures) return; // le champ reçoit sa frappe lui-même
      if (!mod && !e.altKey && e.key.length === 1 && (enFrappe || commenceSaisie(e.key))) {
        e.preventDefault();
        setTexte({ texte: (enFrappe ? texteRef.current!.texte : "") + e.key, statut: "frappe" });
        return;
      }
      const o = outilDuClavier(e);
      if (o) {
        e.preventDefault();
        choisirOutil(o.id);
      }
    };
    const surRelache = (e: KeyboardEvent) => {
      const etat = toucheEtat(e.key);
      if (etat && touchesTenues.current.has(etat)) envoyerTouche(etat, "relachee");
      const r = relacheFrappe(frappeRef.current, etat ?? e.key);
      frappeRef.current = r.etat;
      // Jamais dans un champ (Mesures, recherche, dialogue) ni pendant une frappe de valeur : le texte garde ses touches.
      // Ni depuis une barre (A-08 : Maj + flèches sur la poignée déplace la barre, ses flèches ne passent pas ici).
      // (`closest` plutôt qu'`instanceof Element` : la fenêtre du plan détaché a ses propres constructeurs.)
      const el = e.target as { closest?: (s: string) => unknown } | null;
      const dansBarre = typeof el?.closest === "function" && el.closest('[role="toolbar"]') !== null;
      if (r.seule && !dansBarre && !champSaisie(e.target) && !rechercheRef.current && texteRef.current?.statut !== "frappe") envoyerSeuleRef.current(r.seule);
    };
    // §5.5 (choix Fadi) : à la perte du focus, les touches tenues sont relâchées (un Ctrl « collé » bloquerait tout).
    const surPerte = () => {
      frappeRef.current = oublierFrappe();
      for (const touche of [...touchesTenues.current]) envoyerTouche(touche, "relachee");
      setMajVerrouillee(false);
    };
    // Les mêmes écouteurs servent la fenêtre du plan détaché (elle partage l'état : même brouillon, même historique).
    // Revue #120 : tout geste du pointeur, où qu'il tombe (bouton, panneau, barre), consomme la frappe en attente.
    const surPointeur = () => {
      frappeRef.current = consommerFrappe(frappeRef.current);
    };
    clavierRef.current = { touche: surTouche, relache: surRelache, perte: surPerte, pointeur: surPointeur };
    /** Cas 2, lot 6 (n° 112) : un tracé collé depuis une autre application ouvre « Coller un tracé ». */
    const surColler = (e: ClipboardEvent) => {
      if (champSaisie(e.target) || rechercheRef.current) return;
      const donnees = e.clipboardData;
      const texte = donnees ? donnees.getData("text/plain") || donnees.getData("image/svg+xml") : "";
      const l = texte ? lireTraceColle(texte) : null;
      if (!l) return;
      e.preventDefault();
      window.clearTimeout(attenteCollerRef.current);
      attenteCollerRef.current = 0;
      ouvrirCollageRef.current(l);
    };
    const fenetres = [window, ...(fenetreRef.current ? [fenetreRef.current] : [])];
    for (const w of fenetres) {
      w.addEventListener("paste", surColler);
      w.addEventListener("keydown", surTouche);
      w.addEventListener("keyup", surRelache);
      w.addEventListener("blur", surPerte);
      w.addEventListener("pointerdown", surPointeur, true);
    }
    return () => {
      for (const w of fenetres) {
        w.removeEventListener("paste", surColler);
        w.removeEventListener("keydown", surTouche);
        w.removeEventListener("keyup", surRelache);
        w.removeEventListener("blur", surPerte);
        w.removeEventListener("pointerdown", surPointeur, true);
      }
    };
  }, [annulerPas, retablirPas, envoyerTouche, echap, choisirOutil, setTexte, grouperSelection, eclaterSelection, fermerContexte, ouvrirDialogueComposant, majOptions, etendre, collerSelection, copierSelection]);

  // --- Planche détachable : la porte (toute la Planche — dessin, barre d'outils, panneaux, barre d'état, Mesures) est
  // DÉPLACÉE dans une fenêtre Document Picture-in-Picture — même contexte JavaScript, donc même brouillon et même
  // historique, sans synchronisation ; la page garde une carte « Rattacher ». Sans cette API (Firefox, Safari,
  // téléphone), « Détacher » passe la Planche en plein écran.
  useLayoutEffect(() => {
    const emplacement = emplacementRef.current;
    if (emplacement && !fenetreRef.current && porte.parentNode !== emplacement) emplacement.appendChild(porte);
    return () => porte.remove();
  }, [porte]);

  // Téléphone détaché : rétablit la balise viewport et la place de la Planche ; vrai si ce mode était actif.
  const restaurerVue = useCallback(() => {
    const v = vueLargeRef.current;
    if (!v) return false;
    vueLargeRef.current = null;
    window.removeEventListener("resize", v.maj);
    v.meta.setAttribute("content", v.avant);
    v.racine.setAttribute("style", v.style);
    if (!v.style) v.racine.removeAttribute("style");
    return true;
  }, []);

  const rattacher = useCallback(() => {
    const w = fenetreRef.current;
    if (w) {
      fenetreRef.current = null;
      stylesObserveur.current?.disconnect();
      stylesObserveur.current = null;
      const hote = hoteRef.current;
      const emplacement = emplacementRef.current;
      if (emplacement && porte.parentNode !== emplacement) emplacement.appendChild(porte);
      const c = clavierRef.current;
      if (c) {
        w.removeEventListener("keydown", c.touche);
        w.removeEventListener("keyup", c.relache);
        w.removeEventListener("blur", c.perte);
        w.removeEventListener("pointerdown", c.pointeur, true);
      }
      try {
        w.close();
      } catch {
        // déjà fermée par le navigateur
      }
      setDetache("non");
      setMessage(t("planche.rattache"));
      hote?.focus({ preventScroll: true });
      return;
    }
    if (restaurerVue()) {
      setDetache("non");
      setMessage(t("planche.rattache"));
      hoteRef.current?.focus({ preventScroll: true });
      return;
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [porte, restaurerVue]);

  // Pose la porte dans un autre document (fenêtre séparée ou cadre du téléphone) : mêmes feuilles de style, mêmes attributs
  // de document, même chaîne de classes ancêtres, mêmes écouteurs du clavier.
  const installerPorte = useCallback((w: Window) => {
    const copierFeuille = (feuille: CSSStyleSheet) => {
      try {
        const style = w.document.createElement("style");
        style.textContent = Array.from(feuille.cssRules)
          .map((r) => r.cssText)
          .join("\n");
        w.document.head.appendChild(style);
      } catch {
        if (feuille.href) {
          const lien = w.document.createElement("link");
          lien.rel = "stylesheet";
          lien.href = feuille.href;
          w.document.head.appendChild(lien);
        }
      }
    };
    for (const feuille of Array.from(document.styleSheets)) copierFeuille(feuille);
    // Feuilles chargées plus tard (panneaux chargés à la demande) : recopiées dès leur arrivée.
    const observeur = new MutationObserver((mutations) => {
      for (const m of mutations)
        for (const n of Array.from(m.addedNodes)) {
          if (n instanceof HTMLStyleElement && n.sheet) copierFeuille(n.sheet);
          else if (n instanceof HTMLLinkElement && n.rel === "stylesheet") {
            const lien = w.document.createElement("link");
            lien.rel = "stylesheet";
            lien.href = n.href;
            w.document.head.appendChild(lien);
          }
        }
    });
    observeur.observe(document.head, { childList: true });
    stylesObserveur.current = observeur;
    const base = w.document.createElement("style");
    base.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:#f4f6f8}.planche-chaine{display:contents!important}.planche-porte>.planche{height:100vh}";
    w.document.head.appendChild(base);
    // Mêmes attributs de document (langue, thème) et même chaîne de classes ancêtres que dans la page : les
    // variables et règles de l'Atelier (`.atelier-n …`) s'appliquent à l'identique ; chaque maillon est transparent.
    for (const a of Array.from(document.documentElement.attributes)) w.document.documentElement.setAttribute(a.name, a.value);
    w.document.body.className = document.body.className;
    w.document.title = `Fadi · ${t("mode.planche")}`;
    let parent: HTMLElement = w.document.body;
    const ancetres: string[] = [];
    for (let n = emplacementRef.current?.parentElement ?? null; n && n !== document.body; n = n.parentElement) ancetres.unshift(n.className);
    for (const classe of ancetres) {
      const maillon = w.document.createElement("div");
      maillon.className = `${classe} planche-chaine`.trim();
      parent.appendChild(maillon);
      parent = maillon;
    }
    parent.appendChild(porte);
    const c = clavierRef.current;
    if (c) {
      w.addEventListener("keydown", c.touche);
      w.addEventListener("keyup", c.relache);
      w.addEventListener("blur", c.perte);
      w.addEventListener("pointerdown", c.pointeur, true);
    }
  }, [porte]);

  // Téléphone (aucune fenêtre séparée) : la Planche couvre tout l'écran du navigateur avec la mise en page large, comme la
  // « version ordinateur » — la balise viewport impose une largeur de mise en page (au moins 980 px, plus en position
  // couchée : ecran-large.ts) que le navigateur réduit à l'écran ; les règles « écran large » s'appliquent (bandeau,
  // colonne et libellés, bande du bas) et rien ne déborde. Pas de plein écran du navigateur : il rétablirait la largeur
  // de l'appareil (donc la mise en page téléphone). « Quitter » rétablit la balise et la Planche dans la page.
  const detacherEcranLarge = useCallback((racine: HTMLElement): boolean => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return false;
    const avant = meta.getAttribute("content") ?? "width=device-width, initial-scale=1.0";
    const maj = () => {
      const l = Math.max(1, window.screen?.width ?? 0);
      const h = Math.max(1, window.screen?.height ?? 0);
      const couche = window.matchMedia("(orientation: landscape)").matches;
      const contenu = `width=${largeurVueEcranLarge({ largeur: couche ? Math.max(l, h) : Math.min(l, h), hauteur: couche ? Math.min(l, h) : Math.max(l, h) })}`;
      if (meta.getAttribute("content") !== contenu) meta.setAttribute("content", contenu);
    };
    vueLargeRef.current = { meta, avant, style: racine.getAttribute("style") ?? "", racine, maj };
    maj();
    window.addEventListener("resize", maj);
    // Styles en ligne : la même Planche sert le Sandbox et l'Atelier (feuilles différentes).
    racine.style.cssText += ";position:fixed;inset:0;z-index:2147483000;width:auto;height:auto;margin:0;border-radius:0";
    setColonneRepliee(false);
    setDetache("plein-ecran");
    setMessage(null);
    return true;
  }, []);

  const detacher = useCallback(async () => {
    const hote = hoteRef.current;
    const racine = racineRef.current;
    if (!hote || !racine) return;
    const dpip = (window as Window & { documentPictureInPicture?: { requestWindow: (options: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    // Téléphone (écran étroit, ou écran tactile sans survol : debout comme couché, « version ordinateur » comprise) :
    // plein écran en mise en page large réduite à l'écran. Ailleurs : fenêtre séparée, sinon plein écran simple.
    const telephone = window.matchMedia("(max-width: 760px)").matches || window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (telephone && detacherEcranLarge(racine)) return;
    if (dpip && window.matchMedia("(min-width: 761px)").matches) {
      try {
        const w = await dpip.requestWindow(tailleFenetreDetachee(window.screen));
        installerPorte(w);
        w.addEventListener("pagehide", () => {
          if (fenetreRef.current === w) rattacher();
        });
        fenetreRef.current = w;
        setDetache("fenetre");
        setMessage(null);
        hote.focus({ preventScroll: true });
        return;
      } catch {
        // fenêtre refusée (geste requis, politique) : plein écran ci-dessous
      }
    }
    try {
      await racine.requestFullscreen();
    } catch {
      setMessage(t("planche.detacher.impossible"));
    }
  }, [rattacher, installerPorte, detacherEcranLarge]);

  useEffect(() => {
    const maj = () => {
      if (vueLargeRef.current) return;
      setDetache(document.fullscreenElement === racineRef.current ? "plein-ecran" : fenetreRef.current ? "fenetre" : "non");
    };
    document.addEventListener("fullscreenchange", maj);
    return () => {
      document.removeEventListener("fullscreenchange", maj);
      stylesObserveur.current?.disconnect();
      const w = fenetreRef.current;
      fenetreRef.current = null;
      restaurerVue();
      try {
        w?.close();
      } catch {
        // déjà fermée
      }
    };
  }, [restaurerVue]);

  // Grille « … » fermée au clic extérieur.
  useEffect(() => {
    if (!grille) return;
    const surClic = (e: PointerEvent) => {
      const c = e.target as Node | null;
      if (grilleDom.current && c && !grilleDom.current.contains(c) && !commeElement(c)?.closest("[data-planche-plus]")) setGrille(false);
    };
    // Fenêtre où vit la Planche (page ou fenêtre détachée).
    const w = racineRef.current?.ownerDocument.defaultView ?? window;
    w.addEventListener("pointerdown", surClic);
    return () => w.removeEventListener("pointerdown", surClic);
  }, [grille, detache]);

  // Lot L12 : section courante des outils Profilé (dimensions saisies ou face ; aucun catalogue en Sandbox).
  const { section: sectionCourante, erreur: erreurSection } = useMemo((): { section: SectionCourante | null; erreur: string | null } => {
    try {
      if (choixSection.mode === "face") return { section: choixSection.section, erreur: erreurFace };
      if (choixSection.mode === "saisie") return { section: sectionSaisie(choixSection.dimensions), erreur: null };
      return { section: null, erreur: null };
    } catch (err) {
      return { section: null, erreur: err instanceof Error ? err.message : String(err) };
    }
  }, [choixSection, erreurFace]);
  useEffect(() => {
    sectionRef.current = sectionCourante;
    rafraichir();
  }, [sectionCourante, rafraichir]);
  const sectionDeLaFace = useCallback(() => {
    const m = histRef.current.present.modele;
    const c = contexteDe(m, dansRef.current);
    const face = selectionRef.current.find((id) => c.faces[id]);
    try {
      if (!face) throw new Error(t("planche.profiles.face.aucune"));
      setErreurFace(null);
      setChoixSection({ mode: "face", section: sectionDepuisFace(m, face, dansRef.current) });
    } catch (err) {
      setErreurFace(err instanceof Error ? err.message : String(err));
      setChoixSection({ mode: "face", section: null });
    }
  }, []);
  const lignesDebit = useMemo((): LigneDebit[] => {
    const m = hist.present.modele;
    const rho = Number(reglagesDebit.masseVolumique.replace(",", "."));
    const masseVolumique = Number.isFinite(rho) && rho > 0 && reglagesDebit.sourceMasse.trim() ? { valeur: rho, source: reglagesDebit.sourceMasse.trim() } : null;
    // Portée « sélection » : les objets de la racine choisis ; dans un objet ouvert, l'objet de la racine qui le contient.
    const racine = dans === undefined ? (vue.selection ?? []).filter((id) => m.racine.occurrences[id]) : cheminRef.current.slice(0, 1);
    const l = listeDebit(m, { portee: reglagesDebit.portee, selection: racine, masseVolumique });
    return reglagesDebit.tri ? trierDebit(l, reglagesDebit.tri.colonne, reglagesDebit.tri.sens) : l;
  }, [hist.present.modele, reglagesDebit, dans, vue.selection]);
  const etiquettesPosees = useMemo(() => Object.values(hist.present.modele.annotations?.textes ?? {}).filter((x) => x.genre === "repere" && x.etiquettePiece).length, [hist.present.modele]);
  const disponibiliteCommandeDebit = (id: IdCommandeDebit) => disponibiliteDebit(id, { lignes: lignesDebit.length, etiquettes: etiquettesPosees, lecture: readOnly });
  /** Lot L14 : un clic sur une ligne sélectionne exactement ses occurrences du contexte ouvert (aucune extension). */
  const selectionnerLigneDebit = (l: LigneDebit) => {
    const chemin = cheminRef.current;
    const ids: string[] = [];
    let ailleurs = 0;
    for (const c of l.chemins) {
      const dedans = c.length === chemin.length + 1 && chemin.every((id, i) => c[i] === id);
      if (dedans) ids.push(c[c.length - 1]!);
      else ailleurs++;
    }
    setSelection(ids);
    setNoteDebit(ailleurs > 0 ? t("planche.debit.note.ailleurs", { nombre: String(ailleurs) }) : null);
    rafraichir();
  };
  const executerDebit = (id: IdCommandeDebit) => {
    if (!disponibiliteCommandeDebit(id).disponible) return;
    if (id === "liste-debit") {
      setPanneau("debit");
      return;
    }
    if (id === "exporter-debit") {
      telechargerFichier(new Blob([csvDebit(lignesDebit)], { type: "text/csv;charset=utf-8" }), `${"planche"}-debit.csv`);
      setNoteDebit(t("planche.debit.note.exporte", { lignes: String(lignesDebit.length) }));
      return;
    }
    if (id === "renumeroter") {
      const depart = Number.parseInt(reglagesDebit.depart, 10);
      if (!Number.isInteger(depart) || depart < 0) {
        setNoteDebit(t("planche.debit.note.depart"));
        return;
      }
      operer(t("planche.debit.renumeroter"), (m) => ({ modele: numeroterPieces(m, reperesRenumerotes(lignesDebit, reglagesDebit.prefixe.trim(), depart)).modele, message: t("planche.debit.note.renumerote", { lignes: String(lignesDebit.length) }) }));
      return;
    }
    if (id === "etiquettes") {
      operer(t("planche.debit.etiquettes"), (m) => {
        // Revue de #128 : une étiquette par pièce physique, retrouvée par son chemin (instances d'un même composant).
        const etiquettes = etiquettesDebit(m, lignesDebit);
        return { modele: poserEtiquettesPieces(m, etiquettes).modele, message: t("planche.debit.note.etiquettes", { nombre: String(etiquettes.length) }) };
      });
      return;
    }
    operer(t("planche.debit.effacer-etiquettes"), (m) => ({ modele: effacerEtiquettesPieces(m).modele }));
  };
  /** Extension « Contrôle et nettoyage » : relevé de la Planche entière (calculé panneau ouvert, ou à la demande). */
  const rapportControle = useMemo(() => (panneau === "controle" ? controlerModele(hist.present.modele) : null), [panneau, hist.present.modele]);
  // Panneau fermé : le relevé n'est calculé que si l'extension est active, et une fois par modèle (pas à chaque rendu).
  const controleOffert = !masquees.has("commande:nettoyer");
  const rapportNettoyage = useMemo(() => rapportControle ?? (controleOffert ? controlerModele(hist.present.modele) : null), [rapportControle, controleOffert, hist.present.modele]);
  // Cas 2, lot 3 : défauts de la racine, relevés panneau ouvert (ou à la demande d'un parcours).
  const defautsControle = useMemo(() => (panneau === "controle" ? releverDefauts(hist.present.modele) : []), [panneau, hist.present.modele]);
  const compteControle = useMemo(() => compterDefauts(defautsControle), [defautsControle]);
  const defautCourant = indiceControle >= 0 ? defautsControle[indiceControle] : undefined;
  const objetsSelectionnes = dans === undefined ? (vue.selection ?? []).filter((id) => hist.present.modele.racine.occurrences[id]) : [];
  const cibleFondDao: string | undefined = dans ?? (objetsSelectionnes.length === 1 ? objetsSelectionnes[0] : undefined);
  const apercuFondDao = useMemo(() => {
    if (panneau !== "controle" || vueControle !== "fond-dao" || cibleFondDao === undefined) return null;
    try {
      return preparerFondDao(hist.present.modele, optionsFondDao, cibleFondDao).bilan;
    } catch {
      return null;
    }
  }, [panneau, vueControle, cibleFondDao, optionsFondDao, hist.present.modele]);
  const apercuVolumes = useMemo(() => {
    if (panneau !== "controle" || vueControle !== "fond-dao") return null;
    if (objetsSelectionnes.length < 2) return { selectionnes: objetsSelectionnes.length, interieures: 0, cloisons: 0 };
    try {
      const r = fusionnerVolumes(hist.present.modele, objetsSelectionnes);
      return { selectionnes: objetsSelectionnes.length, interieures: r.faces, cloisons: r.aretes };
    } catch {
      return { selectionnes: objetsSelectionnes.length, interieures: 0, cloisons: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panneau, vueControle, objetsSelectionnes.join("|"), hist.present.modele]);
  const disponibiliteCommandeControle = (id: IdCommandeControle) =>
    disponibiliteControle(id, {
      aNettoyer: id === "nettoyer" && rapportNettoyage !== null && !rienANettoyer(rapportNettoyage, choixNettoyage),
      dansObjet: dans !== undefined,
      lecture: readOnly,
      // Panneau fermé : le relevé est fait à la demande du parcours.
      defauts: panneau === "controle" ? defautsControle.length : 1,
      corrigeable: dans === undefined && defautCourant?.correction !== undefined,
      objetsSelectionnes: objetsSelectionnes.length,
    });
  /** Cadre la vue sur un défaut et sélectionne ce qui le porte. */
  const montrerDefaut = (i: number, liste = defautsControle) => {
    const d = liste[i];
    setIndiceControle(i);
    if (!d) return;
    setSelection([...d.ids]);
    const r = 0.6;
    vueRef.current?.cadrer({ min: { x: d.position.x - r, y: d.position.y - r, z: d.position.z - r }, max: { x: d.position.x + r, y: d.position.y + r, z: d.position.z + r } }, margesVue(racineRef.current));
    setNoteControle(null);
    rafraichir();
  };
  const changerSeuilsControle = (r: Partial<ReglagesControle>) => operer(t("planche.controle.seuils"), (m) => ({ modele: changerReglagesControle(m, r).modele }));
  const executerControle = (id: IdCommandeControle) => {
    if (!disponibiliteCommandeControle(id).disponible) return;
    if (id === "controler") {
      setNoteControle(null);
      setVueControle("releve");
      setPanneau("controle");
      return;
    }
    if (id === "defaut-suivant" || id === "defaut-precedent") {
      setVueControle("releve");
      setPanneau("controle");
      const liste = panneau === "controle" ? defautsControle : releverDefauts(histRef.current.present.modele);
      const i = indiceDefaut(liste.length, indiceControle, id === "defaut-suivant" ? 1 : -1);
      if (i < 0) setNoteControle(t("planche.controle.aucun-defaut"));
      montrerDefaut(i, liste);
      return;
    }
    if (id === "corriger-defaut") {
      const d = defautCourant;
      if (!d) return;
      operer(t("planche.controle.corriger-defaut"), (m) => {
        const r = corrigerDefaut(m, d);
        const message = t("planche.controle.note.corrige");
        setNoteControle(message);
        return { modele: r.modele, selection: [], message };
      });
      // Le relevé change : le défaut suivant prend la même place dans la liste.
      setIndiceControle((i) => Math.min(i, Math.max(-1, defautsControle.length - 2)));
      return;
    }
    if (id === "pieces-permis") {
      setNoteControle(null);
      setVueControle("pieces");
      setPanneau("controle");
      return;
    }
    if (id === "preparer-fond-dao" || id === "fusionner-volumes") {
      if (panneau !== "controle" || vueControle !== "fond-dao") {
        setNoteControle(null);
        setVueControle("fond-dao");
        setPanneau("controle");
        return;
      }
      if (id === "preparer-fond-dao") {
        const cible = cibleFondDao;
        operer(t("planche.controle.preparer-fond-dao"), (m) => {
          const r = preparerFondDao(m, optionsFondDao, cible);
          const message = t("planche.fond-dao.note", { aplatis: String(r.bilan.aplatis), soudures: String(r.bilan.soudures), faces: String(r.bilan.faces) });
          setNoteControle(message);
          return { modele: r.modele, message };
        });
        return;
      }
      const objets = objetsSelectionnes;
      operer(t("planche.controle.fusionner-volumes"), (m) => {
        const r = fusionnerVolumes(m, objets);
        const message = t("planche.volumes.note", { faces: String(r.faces) });
        setNoteControle(message);
        return { modele: r.modele, selection: [r.occurrence], message };
      });
      return;
    }
    operer(t("planche.controle.nettoyer"), (m) => {
      const n = nettoyerModele(m, choixNettoyage);
      const total = Object.values(n.retires).reduce((a, b) => a + b, 0);
      const message = t("planche.controle.note.nettoye", { total: String(total) });
      setNoteControle(message);
      return { modele: n.modele, selection: [], message };
    });
  };
  const selectionnerNonSolides = () => {
    const ids = objetsNonSolides(histRef.current.present.modele);
    setSelection(ids);
    setNoteControle(t("planche.controle.note.selection", { nombre: String(ids.length) }));
    rafraichir();
  };
  /** Extension « Emplacement » : position saisie de la Planche (réglage enregistré avec elle) ; les ombres la suivent. */
  const emplacement: Emplacement | null = annotationsDe(hist.present.modele.annotations).reglages?.emplacement ?? null;
  // L'emplacement ne pilote les ombres que si son extension est active ; la réactiver réapplique latitude et nord.
  const emplacementActif = emplacement && !masquees.has("panneau:emplacement") ? emplacement : null;
  const [noteEmplacement, setNoteEmplacement] = useState<string | null>(null);
  useEffect(() => {
    majOptions(emplacementActif ? { latitude: emplacementActif.latitude, nord: emplacementActif.nord } : { nord: 0 });
  }, [emplacementActif?.latitude, emplacementActif?.nord, emplacementActif === null, majOptions]);
  const poserEmplacement = (e: Emplacement | null, message: string) =>
    operer(t("planche.emplacement.ouvrir"), (m) => {
      setNoteEmplacement(message);
      return {
        modele: modifierAnnotations(m, (a) => {
          const { emplacement: _ancien, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
          a.reglages = e ? { ...reste, emplacement: e } : reste;
        }).modele,
        message,
      };
    });
  // Point de base du projet (cas 4 du catalogue, étape 2) : coordonnées projetées déclarées de l'origine, un pas d'historique.
  const pointDeBase = annotationsDe(hist.present.modele.annotations).reglages?.pointDeBase ?? null;
  const [notePointDeBase, setNotePointDeBase] = useState<string | null>(null);
  const poserPointDeBase = (p: PointDeBase | null) => {
    const message = t(p ? "planche.point-de-base.note.enregistre" : "planche.point-de-base.note.retire");
    operer(t("planche.point-de-base.ouvrir"), (m) => {
      setNotePointDeBase(message);
      return {
        modele: modifierAnnotations(m, (a) => {
          const { pointDeBase: _ancien, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
          a.reglages = p ? { ...reste, pointDeBase: p } : reste;
        }).modele,
        message,
      };
    });
  };
  // Menu « Sites » (27 novembre 2026) : site de projet de la base dédiée, rattaché à la Planche courante. Sauvegarder y
  // écrit l'Emplacement (position, nord, altitude, lieu, source « Emplacement de la Planche ») ; Ouvrir et Importer posent
  // la position du site comme Emplacement (un pas d'historique : Annuler le retire) et activent l'extension au besoin.
  const SOURCE_EMPLACEMENT = "Emplacement de la Planche";
  // Nord non évalué : un site sans nord ouvert dans la Planche lui laisse 0° pour ses ombres, mais ce 0° n'est pas une
  // déclaration. Tant que la personne n'a pas enregistré l'Emplacement elle-même, Sauvegarder n'écrit pas un nord de 0°
  // dans un site qui n'en a pas : il y reste « non évalué » (réouverture de la Planche comprise).
  const nordSaisiRef = useRef(false);
  const nordSuppose = (nord: number) => !nordSaisiRef.current && nord === 0 && (sitesProjetRef.current?.site?.observations.nord ?? null) === null;
  const sitesProjetRef = useRef<{ site: { observations: { nord: unknown } } | null } | null>(null);
  const sitesProjet = useSitesProjet({
    lien: readOnly ? null : { genre: "planche", cible: indexPlanches.courante },
    etatModule: () => {
      if (!emplacement) return {};
      return {
        observations: {
          geographic: { longitude: emplacement.longitude, latitude: emplacement.latitude, source: SOURCE_EMPLACEMENT },
          ...(nordSuppose(emplacement.nord) ? {} : { nord: { valeur: emplacement.nord, source: SOURCE_EMPLACEMENT } }),
          ...(emplacement.altitude !== undefined ? { altitudeReference: { valeur: emplacement.altitude, source: SOURCE_EMPLACEMENT } } : {}),
        },
        ...(emplacement.lieu ? { lieu: emplacement.lieu } : {}),
      };
    },
    onOuvert: (site) => {
      const e = emplacementDepuisSite(site, site.position);
      if (!e) {
        setMessage(t("planche.sites.note.sans-position", { nom: site.fiche.nom }));
        return;
      }
      const { nordEvalue, lieu, ...reste } = e;
      if (readOnly) return;
      if (!nordEvalue) nordSaisiRef.current = false;
      poserEmplacement({ ...reste, ...(lieu ? { lieu } : {}) }, t(nordEvalue ? "planche.sites.note.ouvert" : "planche.sites.note.nord-non-evalue", { nom: site.fiche.nom }));
      if (masquees.has("panneau:emplacement")) prefsSandbox.modifier({ ...prefsSandbox.preferences, extensions: basculerExtension(prefsSandbox.preferences.extensions, "emplacement", true) });
      setPanneau("emplacement");
    },
  });
  sitesProjetRef.current = sitesProjet;
  // Cas 2, lot 3 : pièces du permis et site avant émission (le site rattaché est lu dans la base dédiée par le menu Sites).
  const siteRattache = sitesProjet.site;
  const etatSite: EtatSite | null = useMemo(
    () => (siteRattache ? { rattache: true, parcelle: siteRattache.parcelle !== null, nord: siteRattache.observations.nord !== undefined, altitude: siteRattache.observations.altitudeReference !== undefined } : null),
    [siteRattache],
  );
  const reglesPieces = annotationsDe(hist.present.modele.annotations).reglages?.reglesPieces ?? null;
  const bilanPieces = useMemo(() => (panneau === "controle" && vueControle === "pieces" ? evaluerPieces(hist.present.modele, etatSite) : null), [panneau, vueControle, hist.present.modele, etatSite]);
  const lignesSite = useMemo(() => (panneau === "controle" && vueControle === "pieces" ? controlerSite(hist.present.modele, etatSite) : []), [panneau, vueControle, hist.present.modele, etatSite]);
  const chargerReglesPieces = (f: File) => {
    void f.text().then((texte) => {
      const lu = lireReglesPieces(texte, f.name);
      if ("erreur" in lu) {
        setNoteControle(lu.erreur);
        return;
      }
      // Interface ≠ base de données (D-GD-29) : le fichier est archivé tel quel en base (extension « Contrôle et nettoyage »)
      // avant d'être posé avec le modèle ; un refus d'archivage est montré, le fichier reste lisible.
      void archiverFichierExtension("controle", { nom: f.name, texte }).then((issue) => {
        const regles = issue.ok ? { ...lu.regles, archive: issue.archive } : { ...lu.regles, refusArchive: issue.motif };
        operer(t("planche.pieces.charger"), (m) => {
          const message = issue.ok ? t("planche.pieces.note.charge", { nom: f.name }) : t("planche.pieces.note.charge-sans-base", { nom: f.name, motif: t(`planche.pieces.motif.${issue.motif}` as "planche.pieces.motif.impossible") });
          setNoteControle(message);
          return { modele: poserReglesPieces(m, regles).modele, message };
        });
      });
    });
  };
  const localiserManqueSite = () => {
    const manque = lignesSite.find((l) => l.etat !== "present");
    if (!manque) {
      setNoteControle(t("planche.pieces.note.complet"));
      return;
    }
    if (manque.ligne === "nord" || manque.ligne === "altitude") {
      if (masquees.has("panneau:emplacement")) prefsSandbox.modifier({ ...prefsSandbox.preferences, extensions: basculerExtension(prefsSandbox.preferences.extensions, "emplacement", true) });
      setPanneau("emplacement");
      return;
    }
    setNoteControle(t(`planche.pieces.note.manque.${manque.ligne}` as "planche.pieces.note.manque.rattache"));
  };
  useEffect(() => {
    if (sitesProjet.note) setMessage(sitesProjet.note.texte);
  }, [sitesProjet.note]);
  // « Emplacements Projets » (27 novembre 2026) : emplacements enregistrés dans GeoData, lus à la demande, posés comme
  // Emplacement de la Planche (un pas d'historique : Annuler le retire).
  const [geodataListe, setGeodataListe] = useState<readonly EmplacementGeoDataLu[] | null>(null);
  const [geodataChargement, setGeodataChargement] = useState(false);
  const [geodataErreur, setGeodataErreur] = useState<string | null>(null);
  const chargerEmplacementsGeoData = () => {
    setGeodataChargement(true);
    setGeodataErreur(null);
    listerEmplacementsGeoData()
      .then(setGeodataListe, () => setGeodataErreur(t("planche.emplacement.geodata.erreur")))
      .finally(() => setGeodataChargement(false));
  };
  const appliquerEmplacementGeoData = (g: EmplacementGeoDataLu) => poserEmplacement(g.emplacement, t("planche.emplacement.note.geodata", { lieu: g.emplacement.lieu ?? `${g.emplacement.latitude} ; ${g.emplacement.longitude}` }));
  const appliquerGeoDataRef = useRef(appliquerEmplacementGeoData);
  appliquerGeoDataRef.current = appliquerEmplacementGeoData;
  // Adresse `/sandbox?emplacement-geodata=<id>` (bouton « Ouvrir dans Planche » de GeoData) : une fois le brouillon chargé,
  // l'emplacement est lu, posé et le panneau Emplacement s'ouvre ; le paramètre est retiré de l'adresse.
  const geodataAOuvrir = useRef(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(PARAMETRE_EMPLACEMENT_GEODATA));
  useEffect(() => {
    const id = geodataAOuvrir.current;
    if (!brouillonCharge || readOnly || !id) return;
    geodataAOuvrir.current = null;
    const adresse = new URL(window.location.href);
    adresse.searchParams.delete(PARAMETRE_EMPLACEMENT_GEODATA);
    window.history.replaceState(window.history.state, "", `${adresse.pathname}${adresse.search}${adresse.hash}`);
    setNoteEmplacement(null);
    setGeodataErreur(null);
    setOuvrirEmplacementGeoData(true);
    lireEmplacementGeoDataParId(id).then(
      (g) => appliquerGeoDataRef.current(g),
      (e: unknown) => setGeodataErreur(t(e instanceof ErreurEmplacementsGeoData && e.statut === 404 ? "planche.emplacement.geodata.introuvable" : "planche.emplacement.geodata.erreur")),
    );
  }, [brouillonCharge, readOnly]);
  // Ouverture depuis GeoData : l'extension « Emplacement » est activée si elle ne l'est pas (choix explicite de la personne,
  // réversible dans Personnaliser), une fois les préférences du compte lues, puis son panneau s'ouvre.
  const [ouvrirEmplacementGeoData, setOuvrirEmplacementGeoData] = useState(false);
  useEffect(() => {
    if (!ouvrirEmplacementGeoData || prefsSandbox.etat === "chargement") return;
    setOuvrirEmplacementGeoData(false);
    if (masquees.has("panneau:emplacement")) prefsSandbox.modifier({ ...prefsSandbox.preferences, extensions: basculerExtension(prefsSandbox.preferences.extensions, "emplacement", true) });
    setPanneau("emplacement");
  }, [ouvrirEmplacementGeoData, prefsSandbox, masquees]);
  /** Arête sélectionnée seule et non verticale : l'angle du nord qu'elle donnerait, sinon `null`. */
  const nordDeLaSelection = (): number | null => {
    const sel = vue.selection ?? selectionRef.current;
    if (sel.length !== 1) return null;
    const c = contexteDe(hist.present.modele, dans);
    const a = c.aretes[sel[0]!];
    const p = a ? c.sommets[a.a]?.position : undefined;
    const q = a ? c.sommets[a.b]?.position : undefined;
    if (!p || !q) return null;
    const M = dans !== undefined ? matriceMonde(hist.present.modele, dans) : null;
    return nordDepuisArete(M ? appliquerMatrice(M, p) : p, M ? appliquerMatrice(M, q) : q, emplacement?.nord ?? 0);
  };
  const disponibiliteCommandeEmplacement = (id: IdCommandeEmplacement) => disponibiliteEmplacement(id, { arete: id === "nord-arete" && nordDeLaSelection() !== null, position: emplacement !== null, lecture: readOnly });
  const executerEmplacement = (id: IdCommandeEmplacement) => {
    if (!disponibiliteCommandeEmplacement(id).disponible) return;
    if (id === "emplacement") {
      setNoteEmplacement(null);
      setPanneau("emplacement");
    } else if (id === "afficher-nord") majOptions({ flecheNord: !options.flecheNord });
    else if (id === "point-de-base") {
      setNotePointDeBase(null);
      setPanneau("emplacement");
      // La section est en bas du panneau : elle est amenée à la vue et son premier champ reçoit le focus.
      window.setTimeout(() => {
        const champ = document.querySelector<HTMLInputElement>("[data-planche-point-de-base-champ='e']");
        champ?.scrollIntoView({ block: "nearest" });
        champ?.focus();
      }, 0);
    }
    else {
      const nord = nordDeLaSelection();
      if (nord === null) return;
      // Aucune coordonnée n'est inventée : le nord ne s'enregistre que sur une position déjà saisie.
      if (!emplacement) return;
      poserEmplacement({ ...emplacement, nord }, t("planche.emplacement.note.nord", { angle: nord.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) }));
      majOptions({ flecheNord: true });
    }
  };
  /**
   * Niveaux d'étage (cas 4 du catalogue, étape 1) : niveaux du document, niveau choisi dans le panneau, niveau de
   * travail (plan de travail à son altitude, nouveaux objets rattachés : `niveauTravailRef`, lu par `poserHistorique`).
   * Le niveau de référence est celui de la Planche (index des Planches) : l'altitude NGF du ±0,00.
   */
  const niveaux = niveauxTries(hist.present.modele);
  const objetsParNiveau: Record<string, number> = {};
  for (const occ of Object.values(hist.present.modele.racine.occurrences)) if (occ.niveau) objetsParNiveau[occ.niveau] = (objetsParNiveau[occ.niveau] ?? 0) + 1;
  const [niveauChoisiEtat, setNiveauChoisi] = useState<string | null>(null);
  const niveauChoisi = niveaux.some((n) => n.id === niveauChoisiEtat) ? niveauChoisiEtat : (niveaux[0]?.id ?? null);
  const [niveauTravail, setNiveauTravailEtat] = useState<string | null>(null);
  const niveauTravailValide = niveaux.some((n) => n.id === niveauTravail) ? niveauTravail : null;
  niveauTravailRef.current = niveauTravailValide;
  // Le niveau de travail appartient à la Planche ouverte : changer de Planche l'abandonne (les identifiants de niveau
  // sont propres à chaque document).
  useEffect(() => {
    setNiveauTravailEtat(null);
    niveauTravailRef.current = null;
  }, [indexPlanches.courante]);
  // Le plan de travail suit l'altitude du niveau de travail, quelle qu'en soit la cause : modification, Annuler, Rétablir.
  const niveauDeTravail = niveaux.find((n) => n.id === niveauTravailValide) ?? null;
  const altitudeSuivieRef = useRef<{ id: string; altitude: number } | null>(null);
  useEffect(() => {
    const n = niveauDeTravail;
    const avant = altitudeSuivieRef.current;
    altitudeSuivieRef.current = n ? { id: n.id, altitude: n.altitude } : null;
    if (!n || !avant || avant.id !== n.id || avant.altitude === n.altitude) return;
    changerContexte({ ...contexteTemporaire(histContexteRef.current.courant, repereDuNiveau(n)), plan: "xy" });
  }, [niveauDeTravail?.id, niveauDeTravail?.altitude]); // eslint-disable-line react-hooks/exhaustive-deps
  const [erreurNiveau, setErreurNiveau] = useState<ErreurNiveau | "reference" | null>(null);
  const [noteNiveau, setNoteNiveau] = useState<string | null>(null);
  const referenceNiveaux = plancheDe(indexPlanches).altitudeRef;
  const nomNiveau = (id: string): string => niveaux.find((n) => n.id === id)?.nom ?? "";
  const ajouterUnNiveau = (saisie: SaisieNiveau | null) => {
    const v = saisie ? lireSaisieNiveau(saisie) : null;
    if (v && "erreur" in v) return setErreurNiveau(v.erreur);
    const valeurs = v ? v.valeurs : niveauSuivant(hist.present.modele);
    if (!valeurs) return setErreurNiveau("hauteur");
    const r = ajouterNiveau(hist.present.modele, valeurs);
    if (!r.ok) return setErreurNiveau(r.erreur);
    setErreurNiveau(null);
    setNoteNiveau(t("planche.niveaux.note.ajoute", { nom: valeurs.nom }));
    operer(t("planche.niveaux.ajouter"), () => ({ modele: r.modele }));
    setNiveauChoisi(r.id);
  };
  const modifierUnNiveau = (id: string, saisie: SaisieNiveau) => {
    const v = lireSaisieNiveau(saisie);
    if ("erreur" in v) return setErreurNiveau(v.erreur);
    const r = modifierNiveau(hist.present.modele, id, v.valeurs);
    if (!r.ok) return setErreurNiveau(r.erreur);
    setErreurNiveau(null);
    setNoteNiveau(t("planche.niveaux.note.modifie", { nom: v.valeurs.nom }));
    operer(t("planche.niveaux.ouvrir"), () => ({ modele: r.modele }));
  };
  const supprimerUnNiveau = (id: string) => {
    const nom = nomNiveau(id);
    const nombre = objetsParNiveau[id] ?? 0;
    const r = supprimerNiveau(hist.present.modele, id);
    if (!r.ok) return setErreurNiveau(r.erreur);
    setErreurNiveau(null);
    setNoteNiveau(t("planche.niveaux.note.supprime", { nom, nombre: String(nombre) }));
    if (id === niveauTravailValide) {
      setNiveauTravailEtat(null);
      niveauTravailRef.current = null;
      changerContexte(contexteDuModele());
    }
    operer(t("planche.niveaux.supprimer"), () => ({ modele: r.modele }));
  };
  const poserReferenceNiveaux = (texte: string) => {
    const brut = texte.trim().replace(/\s/g, "").replace(",", ".");
    const valeur = brut === "" ? null : Number(brut);
    if (valeur !== null && !Number.isFinite(valeur)) return setErreurNiveau("reference");
    setErreurNiveau(null);
    const idx = avecInfo(indexRef.current, indexRef.current.courante, { altitudeRef: valeur, modifieA: new Date().toISOString() });
    indexRef.current = idx;
    setIndexPlanches(idx);
    void enregistrerIndex(idx).catch(() => undefined);
    setNoteNiveau(t("planche.niveaux.note.reference"));
  };
  /**
   * Locaux (cas 4 du catalogue, étape 3) : pièces appuyées sur une face de sol de la racine ; mesures recalculées depuis
   * la géométrie à chaque rendu (elles suivent les parois). Créer prend la face choisie seule.
   */
  const tableLocaux = tableauLocaux(hist.present.modele);
  const [localChoisiEtat, setLocalChoisi] = useState<string | null>(null);
  const localChoisi = tableLocaux.lignes.some((l) => l.local.id === localChoisiEtat) ? localChoisiEtat : (tableLocaux.lignes[0]?.local.id ?? null);
  const [erreurLocal, setErreurLocal] = useState<ErreurLocal | null>(null);
  const [noteLocal, setNoteLocal] = useState<string | null>(null);
  const faceDeLocal = (): { face: string | null; etat: "aucune" | "horizontale" | "inclinee" | "prise" } => {
    const faces = selectionRef.current.filter((x) => hist.present.modele.racine.faces[x]);
    if (faces.length !== 1) return { face: null, etat: "aucune" };
    const f = hist.present.modele.racine.faces[faces[0]!]!;
    if (Math.abs(f.normale.z) < 1 - 1e-6) return { face: f.id, etat: "inclinee" };
    return { face: f.id, etat: localDeLaFace(hist.present.modele, f.id) ? "prise" : "horizontale" };
  };
  const disponibiliteCommandeLocal = (id: IdCommandeLocal) => disponibiliteLocal(id, { face: faceDeLocal().etat, dansObjet: dans !== undefined, lecture: readOnly, choisi: localChoisi !== null });
  const executerLocal = (id: IdCommandeLocal) => {
    if (id === "locaux") {
      setPanneau("locaux");
      return;
    }
    if (!disponibiliteCommandeLocal(id).disponible) return;
    if (id === "supprimer-local") return localChoisi ? supprimerUnLocal(localChoisi) : undefined;
    const { face } = faceDeLocal();
    if (!face) return;
    const numero = numeroSuivant(hist.present.modele);
    const r = creerLocal(hist.present.modele, face, { numero, nom: t("planche.locaux.nom-defaut", { numero }) });
    if (!r.ok) return setErreurLocal(r.erreur);
    setErreurLocal(null);
    setLocalChoisi(r.id);
    setPanneau("locaux");
    const message = t("planche.locaux.note.cree", { numero });
    setNoteLocal(message);
    operer(t("planche.locaux.creer"), () => ({ modele: r.modele, message }));
  };
  const modifierUnLocal = (id: string, saisie: SaisieLocal) => {
    const v = lireSaisieLocal(saisie);
    if ("erreur" in v) return setErreurLocal(v.erreur);
    const r = modifierLocal(hist.present.modele, id, v.valeurs);
    if (!r.ok) return setErreurLocal(r.erreur);
    setErreurLocal(null);
    setNoteLocal(null);
    operer(t("planche.locaux.ouvrir"), () => ({ modele: r.modele }));
  };
  const supprimerUnLocal = (id: string) => {
    const numero = hist.present.modele.annotations?.locaux?.[id]?.numero ?? "";
    const r = supprimerLocal(hist.present.modele, id);
    if (!r.ok) return setErreurLocal(r.erreur);
    setErreurLocal(null);
    const message = t("planche.locaux.note.supprime", { numero });
    setNoteLocal(message);
    operer(t("planche.locaux.supprimer"), () => ({ modele: r.modele, message }));
  };
  /**
   * Plan vectoriel (cas 4 du catalogue, étape 5) : projection de la vue en dessin 2D (lignes cachées, coupe pochée),
   * recalculée à l'ouverture, à chaque réglage et à chaque changement du modèle ; Rafraîchir reprend la caméra courante.
   * Motifs de hachure : saisis ou lus d'un fichier .pat, jamais fournis.
   */
  const [optionsPlan, setOptionsPlan] = useState<OptionsPlan>({ source: "courante", echelle: 50, coupe: null, cachees: "pointille" });
  const [apercuPlan, setApercuPlan] = useState<ApercuPlan | null>(null);
  const [motifChoisiEtat, setMotifChoisi] = useState<string | null>(null);
  const [erreurPlan, setErreurPlan] = useState<string | null>(null);
  const [notePlan, setNotePlan] = useState<string | null>(null);
  const [tourPlan, setTourPlan] = useState(0);
  const titreMotifsRef = useRef<HTMLHeadingElement | null>(null);
  const importMotifRef = useRef<HTMLInputElement | null>(null);
  const motifsPlan = Object.values(hist.present.modele.annotations?.motifs ?? {});
  const motifChoisi = motifsPlan.some((x) => x.id === motifChoisiEtat) ? motifChoisiEtat : (motifsPlan[0]?.id ?? null);
  const calculerPlan = (o: OptionsPlan = optionsPlan): ApercuPlan => {
    const m = hist.present.modele;
    const DIRECTIONS: Record<Exclude<SourcePlan, "courante">, { direction: Vec3; haut?: Vec3 }> = {
      dessus: { direction: { x: 0, y: 0, z: -1 }, haut: { x: 0, y: 1, z: 0 } },
      avant: { direction: { x: 0, y: 1, z: 0 } },
      droite: { direction: { x: -1, y: 0, z: 0 } },
      arriere: { direction: { x: 0, y: -1, z: 0 } },
      gauche: { direction: { x: 1, y: 0, z: 0 } },
    };
    const cam = vueRef.current?.etatCamera();
    const vueP = o.source === "courante" ? (cam ? { direction: { x: cam.cible.x - cam.position.x, y: cam.cible.y - cam.position.y, z: cam.cible.z - cam.position.z } } : DIRECTIONS.dessus) : DIRECTIONS[o.source];
    const plan = o.coupe === "aucune" ? null : o.coupe === null ? planDeCoupeActif(m) : (m.annotations?.plansDeCoupe[o.coupe] ?? planDeCoupeActif(m));
    const projete = projeterPlan(m, vueP, { plan });
    const svg = svgPlan(projete, m, { echelle: o.echelle, traits: TRAITS_PLAN, cachees: o.cachees });
    const classes = new Set(projete.traits.filter((x) => x.classe !== "cache" || o.cachees === "pointille").map((x) => x.classe)).size;
    const utilises = new Set(projete.poches.map((x) => (x.materiau ? m.annotations?.materiaux[x.materiau]?.motif : undefined)).filter((x) => x !== undefined)).size;
    return { svg, classes, motifs: utilises, vide: projete.traits.length === 0 };
  };
  useEffect(() => {
    if (panneau !== "plan-vectoriel") return;
    const minuterie = window.setTimeout(() => setApercuPlan(calculerPlan()), 120);
    return () => window.clearTimeout(minuterie);
  }, [panneau, optionsPlan, hist.present.modele, tourPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  const disponibiliteCommandePlan = (id: IdCommandePlan) => disponibilitePlan(id, { dessin: !(apercuPlan?.vide ?? false), motifChoisi: motifChoisi !== null, lecture: readOnly });
  const operationMotif = (r: ResultatMotif, libelle: string, message: string | null) => {
    if (!r.ok) return setErreurPlan(t(`planche.plan.erreur.${r.erreur === "fichier" ? "absent" : r.erreur}`));
    setErreurPlan(null);
    setNotePlan(message);
    operer(libelle, () => ({ modele: r.modele, ...(message ? { message } : {}) }));
    return r;
  };
  const executerPlan = (id: IdCommandePlan) => {
    if (id === "plan-vectoriel") return setPanneau("plan-vectoriel");
    if (!disponibiliteCommandePlan(id).disponible) return;
    if (id === "rafraichir-plan") {
      setPanneau("plan-vectoriel");
      return setTourPlan((n) => n + 1);
    }
    if (id === "motifs-hachure") {
      setPanneau("plan-vectoriel");
      window.setTimeout(() => titreMotifsRef.current?.focus(), 0);
      return;
    }
    if (id === "exporter-plan-svg") {
      const a = calculerPlan();
      setApercuPlan(a);
      if (a.vide) return;
      const fichier = `${nomCourant.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "planche"}-1-${optionsPlan.echelle}.svg`;
      telechargerFichier(new Blob([a.svg], { type: "image/svg+xml;charset=utf-8" }), fichier);
      noterEmissionRef.current("SVG", fichier, "emission");
      setNotePlan(t("planche.plan.note.exporte", { fichier }));
      return;
    }
    setPanneau("plan-vectoriel");
    if (id === "importer-motif") return importMotifRef.current?.click();
    if (id === "nouveau-motif") {
      const nom = t("planche.plan.motif.nom-defaut", { numero: String(motifsPlan.length + 1) });
      const r = operationMotif(ajouterMotifs(hist.present.modele, [{ nom, familles: [familleSimple(45, 2)], source: { genre: "saisie" } }]), t("planche.plan.nouveau-motif"), t("planche.plan.note.cree", { nom }));
      if (r) setMotifChoisi(r.ids[0] ?? null);
      return;
    }
    if (id === "supprimer-motif" && motifChoisi) {
      const nom = hist.present.modele.annotations?.motifs?.[motifChoisi]?.nom ?? "";
      operationMotif(supprimerMotif(hist.present.modele, motifChoisi), t("planche.plan.supprimer-motif"), t("planche.plan.note.supprime", { nom }));
    }
  };
  const importerMotifs = async (f: File) => {
    const texte = await f.text();
    const lu = lirePat(texte);
    if (!lu.ok) return setErreurPlan(t("planche.plan.erreur.fichier", { ligne: String(lu.ligne) }));
    const r = operationMotif(ajouterMotifs(hist.present.modele, lu.motifs.map((x) => ({ nom: x.nom, familles: x.familles, source: { genre: "pat" as const, fichier: f.name.slice(0, 200) } }))), t("planche.plan.importer-motif"), t("planche.plan.note.importe", { nombre: String(lu.motifs.length), fichier: f.name }));
    if (r) setMotifChoisi(r.ids[0] ?? null);
  };
  const modifierUnMotif = (id: string, v: SaisieMotif) => {
    const angle = lireNombreSaisi(v.angle);
    const pas = lireNombreSaisi(v.pas);
    if (angle === null) return setErreurPlan(t("planche.plan.erreur.angle"));
    if (pas === null) return setErreurPlan(t("planche.plan.erreur.pas"));
    operationMotif(modifierMotif(hist.present.modele, id, { nom: v.nom, angle, pas }), t("planche.plan.motifs-hachure"), null);
  };
  const associerUnMotif = (materiau: string, motif: string | null) => operationMotif(associerMotif(hist.present.modele, materiau, motif), t("planche.plan.motifs-hachure"), null);
  /**
   * Murs à épaisseur (cas 4 du catalogue, étape 4) : épaisseur et hauteur saisies dans la barre d'options de l'outil Mur
   * (valeurs de départ de l'outil, jamais une donnée du projet) ; « Murs depuis les arêtes » pose un mur par chaîne
   * d'arêtes horizontales choisies, en un pas. Jonctions non raccordées signalées, jamais corrigées.
   */
  const [saisieMur, setSaisieMur] = useState({ epaisseur: "0,20", hauteur: "2,50" });
  const [noteMur, setNoteMur] = useState<string | null>(null);
  const parametresMur = (() => {
    const e = lireNombreSaisi(saisieMur.epaisseur);
    const h = lireNombreSaisi(saisieMur.hauteur);
    return e !== null && e > 0 && h !== null && h > 0 ? { epaisseur: e, hauteur: h } : null;
  })();
  useEffect(() => {
    murRef.current = parametresMur;
    rafraichir();
  }, [parametresMur?.epaisseur, parametresMur?.hauteur, rafraichir]); // eslint-disable-line react-hooks/exhaustive-deps
  const aretesDeMur = (): string[] => {
    const c = hist.present.modele.racine;
    return selectionRef.current.filter((x) => c.aretes[x] && Math.abs(c.sommets[c.aretes[x]!.a]!.position.z - c.sommets[c.aretes[x]!.b]!.position.z) < 1e-6);
  };
  const referenceMur = (): ReferenceMur => (outilRef.current === "mur" ? ((etatMachineRef.current as { reference?: ReferenceMur } | null)?.reference ?? "axe") : "axe");
  const disponibiliteCommandeMur = (id: IdCommandeMur) => disponibiliteMur(id, { aretes: aretesDeMur().length, parametres: parametresMur !== null, dansObjet: dans !== undefined, lecture: readOnly });
  const noteJonctions = (n: number, j: readonly JonctionMur[]): string =>
    [t("planche.mur.note.poses", { nombre: String(n) }), ...(j.includes("croisement") ? [t("planche.mur.note.croisement")] : []), ...(j.includes("voisin-modifie") ? [t("planche.mur.note.voisin-modifie")] : [])].join(" ");
  const executerMur = (id: IdCommandeMur) => {
    if (!disponibiliteCommandeMur(id).disponible || !parametresMur) return;
    const reference = referenceMur();
    const traces = chainesDAretes(hist.present.modele, aretesDeMur());
    const r = poserMurs(hist.present.modele, traces, { ...parametresMur, reference });
    if (!r.ok) return setNoteMur(t(`planche.mur.erreur.${r.erreur}`));
    const message = noteJonctions(r.ids.length, r.jonctions);
    setNoteMur(message);
    const occ = r.ids.map((w) => r.modele.annotations?.murs?.[w]?.occurrence).filter((x): x is string => !!x);
    operer(t("planche.mur.depuis-aretes"), () => ({ modele: r.modele, selection: occ, message }));
    if (outilRef.current === "mur") configurerOutil("reference", reference);
  };
  const disponibiliteCommandeNiveau = (id: IdCommandeNiveau) => {
    const s = etatSelectionObjets();
    return disponibiliteNiveau(id, { choisi: niveauChoisi !== null, objets: s.objets, dansObjet: dans !== undefined, lecture: readOnly });
  };
  const executerNiveau = (id: IdCommandeNiveau) => {
    if (!disponibiliteCommandeNiveau(id).disponible) return;
    if (id === "niveaux") {
      setPanneau("niveaux");
      return;
    }
    if (id === "ajouter-niveau") {
      if (niveaux.length === 0) setPanneau("niveaux");
      else ajouterUnNiveau(null);
      return;
    }
    const n = niveaux.find((x) => x.id === niveauChoisi);
    if (!n) return;
    if (id === "supprimer-niveau") return supprimerUnNiveau(n.id);
    if (id === "travailler-niveau") {
      if (niveauTravailValide === n.id) {
        setNiveauTravailEtat(null);
        niveauTravailRef.current = null;
        changerContexte(contexteDuModele());
        setNoteNiveau(t("planche.niveaux.note.travail.fin"));
      } else {
        setNiveauTravailEtat(n.id);
        niveauTravailRef.current = n.id;
        changerContexte({ ...contexteTemporaire(histContexte.courant, repereDuNiveau(n)), plan: "xy" });
        setNoteNiveau(t("planche.niveaux.note.travail", { nom: n.nom, altitude: texteAltitude(n.altitude, SEPARATEUR_DECIMAL) }));
      }
      return;
    }
    const objets = selectionRef.current.filter((x) => hist.present.modele.racine.occurrences[x]);
    const r = rattacherAuNiveau(hist.present.modele, objets, n.id);
    if ("erreur" in r) return setErreurNiveau(r.erreur);
    setErreurNiveau(null);
    setNoteNiveau(t("planche.niveaux.note.rattache", { nombre: String(r.nombre), nom: n.nom }));
    operer(t("planche.niveaux.rattacher"), () => ({ modele: r.modele }));
  };
  /**
   * Extension « Scripts » : le script affiché (gardé quand le panneau se ferme), l'exécution en cours et sa dernière
   * issue. Le script tourne dans un Web Worker sur une copie du modèle ; son résultat n'est appliqué que si le dessin
   * n'a pas changé entre-temps, en un seul pas d'historique.
   */
  const [scriptEdite, setScriptEdite] = useState<ScriptEdite>(() => scriptExemple("rangee-poteaux") ?? SCRIPT_NOUVEAU);
  const [issueScript, setIssueScript] = useState<IssueAffichee | null>(null);
  const executionScript = useRef<ExecutionScript | null>(null);
  const [scriptEnCours, setScriptEnCours] = useState(false);
  useEffect(() => () => executionScript.current?.arreter(), []);
  const disponibiliteCommandeScripts = (id: IdCommandeScripts) => disponibiliteScripts(id, { vide: scriptEdite.code.trim().length === 0, enCours: scriptEnCours });
  const executerScripts = (id: IdCommandeScripts) => {
    if (!disponibiliteCommandeScripts(id).disponible) return;
    setPanneau("scripts");
    if (id === "scripts") return;
    const depart = histRef.current.present.modele;
    const dansDepart = dansRef.current;
    const x = lancerScript({ code: scriptEdite.code, modele: depart, selection: [...selectionRef.current], ...(dansDepart !== undefined ? { dans: dansDepart } : {}) });
    executionScript.current = x;
    setScriptEnCours(true);
    setIssueScript({ etat: "encours", journal: [], erreur: null });
    void x.issue.then((i) => {
      if (executionScript.current !== x) return;
      executionScript.current = null;
      setScriptEnCours(false);
      if (i.genre !== "fini") return setIssueScript({ etat: i.genre, journal: [], erreur: null });
      const fin = (etat: IssueAffichee["etat"]) => setIssueScript({ etat, journal: i.journal, erreur: i.erreur });
      if (i.erreur) return fin("erreur");
      if (!i.modele) return fin("inchange");
      if (readOnly) return fin("lecture");
      if (histRef.current.present.modele !== depart || dansRef.current !== dansDepart) return fin("perime");
      const modele = i.modele;
      operer(t("planche.scripts.executer"), () => ({ modele, selection: i.crees, message: t("planche.scripts.issue.modifie") }));
      fin("modifie");
    });
  };

  // ——— Numérotation en série (cas 2 du catalogue, lot 1) : familles de la sélection, aperçu, une seule opération.
  const [reglagesNumerotation, setReglagesNumerotation] = useState<ReglagesNumerotation>(REGLAGES_NUMEROTATION_DEFAUT);
  const [noteNumerotation, setNoteNumerotation] = useState<string | null>(null);
  const selectionNumerotee = vue.selection ?? selectionRef.current;
  const optionsLecture = dans !== undefined ? { dans, chemin } : {};
  const famillesNumerotees = useMemo(
    () => (panneau === "numerotation" || selectionNumerotee.length > 0 ? famillesNumerotation(hist.present.modele, selectionNumerotee, optionsLecture) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panneau, hist.present.modele, selectionNumerotee, dans, chemin],
  );
  const optionsNumerotation = () => ({
    prefixes: lirePrefixes(reglagesNumerotation.prefixes),
    depart: reglagesNumerotation.depart,
    parNiveau: reglagesNumerotation.parNiveau,
    ...optionsLecture,
  });
  const apercuNumerotation = useMemo((): readonly { avant: string; apres: string }[] | string => {
    if (panneau !== "numerotation") return [];
    const m = hist.present.modele;
    try {
      const noms = nomsNumerotes(m, selectionNumerotee, optionsNumerotation());
      const c = contexteDe(m, dans);
      return Object.entries(noms).map(([id, apres]) => {
        const occ = c.occurrences[id];
        return { avant: occ?.nom ?? m.definitions[occ?.definition ?? ""]?.nom ?? id, apres };
      });
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panneau, hist.present.modele, selectionNumerotee, reglagesNumerotation, dans, chemin]);
  const niveauxNumerotation = useMemo(
    () => (panneau === "numerotation" ? ordreDeLecture(hist.present.modele, famillesNumerotees.flatMap((f) => f.ids), optionsLecture).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panneau, hist.present.modele, famillesNumerotees],
  );
  const disponibiliteCommandeNumerotation = (id: IdCommandeNumerotation) =>
    disponibiliteNumerotation(id, { objets: famillesNumerotees.reduce((n, f) => n + f.ids.length, 0), lecture: readOnly });
  const executerNumerotation = (id: IdCommandeNumerotation) => {
    if (!disponibiliteCommandeNumerotation(id).disponible) return;
    setPanneau("numerotation");
    if (id === "numerotation") return;
    const ids = famillesNumerotees.flatMap((f) => f.ids);
    try {
      nomsNumerotes(histRef.current.present.modele, ids, optionsNumerotation());
    } catch (e) {
      setNoteNumerotation(e instanceof Error ? e.message : String(e));
      return;
    }
    setNoteNumerotation(t("planche.numeroter.note", { objets: String(ids.length) }));
    operer(t("planche.numeroter.serie"), (m) => ({ modele: numeroterEnSerie(m, ids, optionsNumerotation()).modele, selection: ids }));
  };

  /**
   * Cas 2 du catalogue, lot 2 « Accrochage et saisie » : panneaux « Accrochage » et « Mètre · Mesure » (contextuels,
   * ouverts par leur commande), genre forcé, guide en réseau, répartition, remise à l'échelle d'un import.
   */
  const [metreMemo, setMetreMemo] = useState<NonNullable<VueOutil["metre"]>>({ derniere: null, guide: null });
  useEffect(() => {
    if (vue.metre && (vue.metre.derniere !== metreMemo.derniere || vue.metre.guide !== metreMemo.guide)) setMetreMemo(vue.metre);
  }, [vue.metre]);
  const [reglagesMetre, setReglagesMetre] = useState<ReglagesMetre>(REGLAGES_METRE_DEFAUT);
  const [noteMetre, setNoteMetre] = useState<string | null>(null);
  const [echelleMesuree, setEchelleMesuree] = useState("");
  const [echelleReelle, setEchelleReelle] = useState("");
  const [noteEchelle, setNoteEchelle] = useState<string | null>(null);
  const uniteProjet: UniteSaisie | undefined = hist.present.modele.annotations?.reglages?.uniteSaisie;
  const longueurMesure = metreMemo.derniere ? Math.hypot(metreMemo.derniere.b.x - metreMemo.derniere.a.x, metreMemo.derniere.b.y - metreMemo.derniere.a.y, metreMemo.derniere.b.z - metreMemo.derniere.a.z) : null;
  /** Objet de la racine choisi seul (remise à l'échelle d'un import). */
  const objetSeul = (): string | null => {
    const sel = selectionRef.current;
    return dans === undefined && sel.length === 1 && hist.present.modele.racine.occurrences[sel[0]!] ? sel[0]! : null;
  };
  const distancesEchelle = () => ({ mesuree: lireNombre(echelleMesuree) ?? longueurMesure, reelle: lireNombre(echelleReelle) });
  const disponibiliteCommandeAccrochage = (id: IdCommandeAccrochage) => {
    const d = distancesEchelle();
    return disponibiliteAccrochage(id, {
      lecture: readOnly,
      guide: metreMemo.guide !== null && hist.present.modele.annotations?.guides[metreMemo.guide.id] !== undefined,
      mesure: metreMemo.derniere !== null,
      selection: selectionRef.current.length,
      echelle: objetSeul() !== null && d.mesuree !== null && d.mesuree > 0 && d.reelle !== null && d.reelle > 0,
    });
  };
  // Info modèle : unité (contrôle d'écart nul exigé), paramètres du projet — chacun un pas d'historique.
  const changerUniteProjet = (u: UniteSaisie) =>
    operer(t("planche.unites.affichage"), (m) => {
      const r = changerUnite(m, u);
      return { modele: r.modele, message: t("planche.unites.note", { unite: t(`planche.unites.${u}`), valeurs: r.controle.valeurs.toLocaleString("fr-CH") }) };
    });
  const poserParametreProjet = (p: { id?: string; nom: string; valeur: number }) => operer(t("planche.parametres.titre"), (m) => ({ modele: poserParametre(m, p).modele }));
  const supprimerParametreProjet = (id: string) => operer(t("planche.parametres.supprimer"), (m) => ({ modele: supprimerParametre(m, id).modele }));
  const executerAccrochage = (id: IdCommandeAccrochage) => {
    if (!disponibiliteCommandeAccrochage(id).disponible) return;
    const genre = GENRE_FORCE[id];
    if (genre) {
      setForceAccrochage(forceAccrochageRef.current === genre ? null : genre);
      setMessage(t("planche.accrochage.force", { genre: t(`planche.accrochage.court.${id}` as "planche.accrochage.court.forcer-sommet") }));
      rafraichir();
      return;
    }
    if (id === "accrochage") return setPanneau("accrochage");
    if (id === "metre-mesure") return setPanneau("metre-mesure");
    if (id === "guide-reseau") {
      const g = metreMemo.guide!;
      const pas0 = Math.hypot(g.pas.x, g.pas.y, g.pas.z);
      const entraxe = lireNombre(reglagesMetre.entraxe) ?? pas0;
      const nombre = Number(reglagesMetre.nombre);
      if (!(entraxe > 0) || !Number.isInteger(nombre) || nombre < 1 || pas0 <= 0) return setNoteMetre(t("planche.metre.reseau.invalide"));
      const pas = { x: (g.pas.x / pas0) * entraxe, y: (g.pas.y / pas0) * entraxe, z: (g.pas.z / pas0) * entraxe };
      setNoteMetre(t("planche.metre.reseau.note", { nombre: String(nombre) }));
      return operer(t("planche.accrochage.guide-reseau"), (m) => ({ modele: repeterGuide(m, g.id, pas, { copies: nombre }).modele }));
    }
    if (id === "repartir") {
      const b = metreMemo.derniere!;
      const res = resultatRepartition(b, reglagesMetre);
      if (typeof res === "string") return setNoteMetre(res);
      const ids = [...selectionRef.current];
      setNoteMetre(t("planche.metre.repartir.note", { elements: String(res.elements) }));
      return operer(t("planche.accrochage.repartir"), (m, d) => ({ modele: repartir(m, ids, b.a, b.b, reglagesMetre.regle, lireNombre(reglagesMetre.valeur)!, 0, d !== undefined ? { dans: d } : {}).modele }));
    }
    // Remise à l'échelle d'un seul import : autour du premier point mesuré, sinon de l'origine de l'objet.
    const occ = objetSeul()!;
    const d = distancesEchelle();
    const T = hist.present.modele.racine.occurrences[occ]!.transformation;
    const origine = metreMemo.derniere?.a ?? { x: T[12] ?? 0, y: T[13] ?? 0, z: T[14] ?? 0 };
    operer(t("planche.accrochage.remettre-echelle"), (m) => {
      const r = remettreAEchelleImport(m, occ, d.mesuree!, d.reelle!, origine);
      setNoteEchelle(t("planche.echelle.note", { facteur: r.facteur.toFixed(5).replace(".", SEPARATEUR_DECIMAL) }));
      return { modele: r.modele };
    });
  };

  // ——— Cas 2, lot 4 : balises, scènes et plans de coupe, gabarit d'agence (maquettes lot4-1 à lot4-4).
  const planChoisi = (): string | null => {
    const sel = selectionRef.current;
    return sel.length === 1 && hist.present.modele.annotations?.plansDeCoupe[sel[0]!] ? sel[0]! : null;
  };
  const disponibiliteCommandeBalise = (id: IdCommandeBalise) =>
    disponibiliteBalise(id, {
      lecture: readOnly,
      courante: balise !== null && hist.present.modele.annotations?.balises[balise] !== undefined,
      selection: selectionRef.current.length,
      phases: Object.values(hist.present.modele.annotations?.balises ?? {}).some((b) => b.phase !== undefined),
    });
  const disponibiliteCommandeScene = (id: IdCommandeScene) => disponibiliteScene(id, { lecture: readOnly, typesGabarit: hist.present.modele.annotations?.reglages?.gabarit?.scenesTypes.length ?? 0, plan: planChoisi() !== null });
  const disponibiliteCommandeGabarit = (id: IdCommandeGabarit) => disponibiliteGabarit(id, { balises: Object.keys(hist.present.modele.annotations?.balises ?? {}).length, choisi: gabaritChoisi !== "" });
  const modifierBaliseL4 = (id: string, v: ChangementBalise): boolean => {
    try {
      const r = modifierBalise(histRef.current.present.modele, id, v);
      operer(t("planche.balise.modifier"), () => ({ modele: r.modele }));
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const classerSelectionL4 = (b: string | null) => {
    const ids = [...selectionRef.current];
    operer(t("planche.balise.classer-selection"), (m, d) => {
      const r = classerSelection(m, ids, b, d);
      const nom = b ? m.annotations?.balises[b]?.nom ?? "" : t("planche.info.sans-balise");
      return { modele: r.modele, message: t("planche.balise.classee", { nombre: String(r.extra), nom }) };
    });
  };
  const executerBalise = (id: IdCommandeBalise) => {
    if (!disponibiliteCommandeBalise(id).disponible) return;
    if (id === "classer-selection") {
      setPanneau("balises");
      return classerSelectionL4(baliseRef.current);
    }
    if (id === "verrouiller-balise") {
      const b = histRef.current.present.modele.annotations?.balises[baliseRef.current!];
      if (!b) return;
      // Verrouiller retire de la sélection ce que porte la balise (revue de #507) : plus rien ne la vise ni ne la modifie.
      const garder = (m: Modele, d: string | undefined) => {
        const c = contexteDe(m, d);
        const a = m.annotations;
        return selectionRef.current.filter((id) => ((c.faces[id] ?? c.aretes[id] ?? c.occurrences[id] ?? a?.cotes[id] ?? a?.textes[id] ?? a?.plansDeCoupe[id]) as { balise?: string } | undefined)?.balise !== b.id);
      };
      return operer(t(b.verrouillee ? "planche.balise.deverrouiller" : "planche.balise.verrouiller-balise"), (m, d) => ({ modele: modifierBalise(m, b.id, { verrouillee: !b.verrouillee }).modele, ...(b.verrouillee ? {} : { selection: garder(m, d) }), message: t(b.verrouillee ? "planche.balise.note.deverrouillee" : "planche.balise.note.verrouillee", { nom: b.nom }) }));
    }
    if (id === "balises-phase") {
      // Couleurs de départ des balises de phase, modifiables ensuite ; une balise de phase existante garde la sienne.
      return operer(t("planche.balise.balises-phase"), (m) => ({ modele: creerBalisesPhase(m, { existant: "#333333", demolir: "#8f6a1f", projete: "#b3261e" }).modele, message: t("planche.balise.note.phases", { noms: Object.values(NOMS_PHASES).join(", ") }) }));
    }
    // Vue d'état : tout, puis existant, puis projeté (n° 116).
    const actuelle = vueEtatCourante(histRef.current.present.modele);
    const suivante = VUES_ETAT[(VUES_ETAT.indexOf(actuelle ?? "projet") + 1) % VUES_ETAT.length]!;
    operer(t("planche.balise.vue-etat"), (m) => ({ modele: appliquerVueEtat(m, suivante).modele, message: t("planche.balise.note.vue-etat", { vue: t(`planche.balise.vue.${suivante}` as CleMessage) }) }));
  };
  const modifierSceneL4 = (id: string, v: { echelle?: number | null; soleil?: { jour: number; heure: number } | null }): boolean => {
    try {
      const r = modifierScene(histRef.current.present.modele, id, v);
      operer(t("planche.scene.modifier"), () => ({ modele: r.modele }));
      if (v.soleil) majOptions({ jour: v.soleil.jour, heure: v.soleil.heure });
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const creerScenesTypes = (genres: readonly string[] | null) =>
    operer(t("planche.scene.scenes-types"), (m) => {
      const types = (m.annotations?.reglages?.gabarit?.scenesTypes ?? []).filter((x) => genres === null || genres.includes(x.genre));
      const scenes = scenesTypes(m, types);
      if (!scenes.length) return { modele: m, message: t("planche.scene.note.aucune") };
      const r = ajouterScenes(m, scenes);
      return { modele: r.modele, message: t("planche.scene.note.creees", { nombre: String(r.extra.length) }) };
    });
  const executerScene = (id: IdCommandeScene) => {
    if (!disponibiliteCommandeScene(id).disponible) return;
    if (id === "scenes-types") {
      setPanneau("scenes");
      return creerScenesTypes(null);
    }
    const plan = planChoisi()!;
    if (id === "avancer-coupe" || id === "reculer-coupe") return operer(t(`planche.scene.${id}`), (m) => ({ modele: decalerPlan(m, plan, id === "avancer-coupe" ? pasCoupe : -pasCoupe).modele }));
    operer(t("planche.scene.scene-face-coupe"), (m) => {
      const r = ajouterScenes(m, [sceneFaceCoupe(m, plan, echelleCoupe, vueRef.current?.lireOptions().modeFace)]);
      const sc = r.modele.annotations?.scenes?.[r.extra[0]!];
      if (sc) window.setTimeout(() => appliquerScene(sc), 0);
      return { modele: r.modele, message: t("planche.scene.note.face-coupe", { nom: sc?.nom ?? "" }) };
    });
  };
  const actionPlan = (fn: (m: Modele) => Modele, libelle: string): boolean => {
    try {
      const m1 = fn(histRef.current.present.modele);
      operer(libelle, () => ({ modele: m1 }));
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const chargerGabarits = useCallback(async () => {
    const liste = await listerFichiersArchives("planche-gabarit");
    const lus: GabaritDisponible[] = [];
    for (const a of liste) {
      const texte = await lireFichierArchive(a.id);
      const g = texte !== null ? lireGabarit(texte) : null;
      if (g?.ok) lus.push({ id: a.id, nomFichier: a.nom, gabarit: g.gabarit, texte: texte!, archive: { id: a.id, empreinte: a.empreinte, ajouteLe: a.ajouteLe } });
    }
    setGabarits((avant) => [...lus, ...avant.filter((x) => x.id.startsWith("local:") && !lus.some((l) => l.nomFichier === x.nomFichier))]);
  }, []);
  useEffect(() => {
    if (panneau === "gabarit") void chargerGabarits();
  }, [panneau, chargerGabarits]);
  const importerGabarit = (f: File) => {
    void f.text().then((texte) => {
      const lu = lireGabarit(texte);
      if (!lu.ok) return setNoteGabarit(lu.erreur);
      // Interface ≠ base de données (D-GD-29) : le gabarit est rangé tel quel en base pour le compte avant d'être proposé.
      void archiverFichierExtension("planche-gabarit", { nom: f.name, texte }).then((issue) => {
        const id = issue.ok ? issue.archive.id : `local:${f.name}`;
        const g: GabaritDisponible = { id, nomFichier: f.name, gabarit: lu.gabarit, texte, ...(issue.ok ? { archive: issue.archive } : { refusArchive: issue.motif }) };
        setGabarits((avant) => [...avant.filter((x) => x.id !== id), g]);
        setGabaritChoisi(id);
        setNoteGabarit(issue.ok ? t("planche.gabarit.note.importe", { nom: lu.gabarit.nom }) : t("planche.gabarit.note.importe-sans-base", { nom: lu.gabarit.nom, motif: t(`planche.pieces.motif.${issue.motif}` as "planche.pieces.motif.impossible") }));
      });
    });
  };
  // ——— Cas 2, lot 6 : échanges (export préparé, fichier natif et image, collage d'un tracé).
  const nomFichierPlanche = () => nomCourant.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "planche";
  const exportPrepare = useMemo(() => {
    if (panneau !== "echange-export") return null;
    const m = hist.present.modele;
    const nonAffiches = objetsNonAffiches(m);
    const choix = ui.coordonneesExport;
    const c = modeleAExporter(m, choix, formatExport, histContexte.courant.repere, referenceNiveaux);
    if (!c.ok) return { nonAffiches, motif: c.motif, ecrit: null, prevu: null, contenu: null, fichier: "" } as const;
    const p = preparerExport(c.modele, { masques: inclureMasques, balises: [...balisesIncluses] });
    const nom = nomFichierPlanche();
    const o = c.repere?.origine;
    const pb = m.annotations?.reglages?.pointDeBase;
    const coordonnees =
      choix === "travail" && o
        ? t("planche.export.coordonnees.travail", { origine: `(${o.x.toFixed(3)} ; ${o.y.toFixed(3)} ; ${o.z.toFixed(3)})` })
        : choix === "source"
          ? t("planche.export.coordonnees.source", { unite: c.unite })
          : choix === "projete"
            ? t("planche.export.coordonnees.projete", { systeme: [pb?.systeme, pb?.systemeVertical].filter(Boolean).join(" / ") })
            : t("planche.export.coordonnees.modele");
    const r = formatExport === "ifc" ? exporterIfc(p.modele, nomCourant) : formatExport === "obj" ? exporterObj(p.modele, nom, choix === "modele" ? undefined : `unités : ${c.unite}, ${coordonnees}`) : exporterStl(p.modele, nom);
    const unite = c.unite === "m" || c.unite === "cm" || c.unite === "mm" ? t(`planche.echange.unite.${c.unite}`) : c.unite;
    const ecrit: EcritExport =
      choix === "projete" && pb
        ? { unite, repere: [pb.systeme, pb.systemeVertical].filter(Boolean).join(" / ") || t("planche.echange.repere.non-declare"), origine: `${texteCoordonnee(pb.e)} ; ${texteCoordonnee(pb.n)} ; ${texteCoordonnee(referenceNiveaux ?? 0)}` }
        : choix === "travail" && o
          ? { unite, repere: t("planche.echange.repere.travail"), origine: `${texteCoordonnee(o.x)} ; ${texteCoordonnee(o.y)} ; ${texteCoordonnee(o.z)}` }
          : { unite, repere: t(choix === "source" ? "planche.echange.repere.source" : "planche.echange.repere.modele"), origine: null };
    const fichier = `${nom}.${formatExport}`;
    return { nonAffiches, motif: null, ecrit, prevu: rapportExport(formatExport, fichier, r, p.omis, horodatage(), { unite: ecrit.unite, repere: ecrit.origine ? `${ecrit.repere} (origine ${ecrit.origine})` : ecrit.repere }, pieceEmise(m)), contenu: r.contenu, fichier } as const;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panneau, hist.present.modele, formatExport, ui.coordonneesExport, inclureMasques, balisesIncluses, histContexte, referenceNiveaux, nomCourant]);
  const exporterEchange = () => {
    const x = exportPrepare;
    if (!x || !x.contenu || !x.prevu || !x.ecrit) return;
    const base = x.fichier.replace(/\.[^.]+$/, "");
    telechargerFichier(new Blob([x.contenu], { type: "text/plain;charset=utf-8" }), x.fichier);
    telechargerFichier(new Blob([texteRapport(x.prevu)], { type: "text/plain;charset=utf-8" }), `${base}.rapport.txt`);
    noterEmissionRef.current(formatExport.toUpperCase(), x.fichier, "emission");
    const l = x.prevu.lignes[0]!;
    setMessage(t("planche.echange.export.ok", { format: formatExport.toUpperCase(), objets: String(l.ecrits ?? 0), omis: String(l.omis ?? 0), unite: x.ecrit.unite, repere: x.ecrit.origine ? `${x.ecrit.repere} (${x.ecrit.origine})` : x.ecrit.repere, fichier: `${base}.rapport.txt` }));
  };
  const exporterNatif = () => {
    const e = enveloppeNatif(serialiserBrouillon(histRef.current.present.modele), nomCourant, new Date());
    const fichier = `${nomFichierPlanche()}${EXTENSION_NATIF}`;
    telechargerFichier(new Blob([e.contenu], { type: "application/json;charset=utf-8" }), fichier);
    noterEmissionRef.current(EXTENSION_NATIF, fichier, "emission");
    setDernierNatif({ date: horodatage(), empreinte: e.empreinte });
    setReimportNatif(null);
    const note = t("planche.echange.natif.exporte", { fichier, empreinte: empreinteCourte(e.empreinte) });
    setNoteNatif(note);
    setMessage(note);
  };
  const importerNatif = async (f: File) => {
    const r = ouvrirEnveloppeNatif(await f.text());
    const m = r.ok ? lireBrouillon(r.texteModele) : null;
    if (!r.ok || !m) {
      const note = t(`planche.echange.natif.refus.${r.ok ? "illisible" : r.motif}`);
      setReimportNatif("refuse");
      setNoteNatif(note);
      setMessage(note);
      return;
    }
    // La Planche courante n'est jamais écrasée : le réimport ouvre une nouvelle Planche.
    await actionsMenu.creer(r.nom || f.name.replace(/\.planche$/i, ""), referenceNiveaux ?? null, m);
    const note = t("planche.echange.natif.ouverte");
    setReimportNatif("conforme");
    setNoteNatif(note);
    setMessage(note);
  };
  const exporterImage = async () => {
    const { largeur, hauteur } = tailleImage;
    const blob = await vueRef.current?.captureDefinition(largeur, hauteur, imageTransparente);
    if (!blob) {
      setNoteNatif(t("planche.echange.image.echec", { largeur: String(largeur), hauteur: String(hauteur) }));
      return;
    }
    telechargerFichier(blob, `${nomFichierPlanche()}-${largeur}x${hauteur}.png`);
    noterEmissionRef.current("PNG", `${nomFichierPlanche()}-${largeur}x${hauteur}.png`, "emission");
    const note = t("planche.echange.image.ok", { largeur: String(largeur), hauteur: String(hauteur), fond: imageTransparente ? t("planche.echange.image.fond") : "" });
    setNoteNatif(note);
    setMessage(note);
  };
  const executerEchange = (id: IdCommandeEchange) => {
    if (id === "natif-image") setPanneau(panneauRef.current === "natif-image" ? null : "natif-image");
  };
  ouvrirCollageRef.current = (l: LectureColle) => {
    if (readOnly) return;
    setColle(l);
    setUniteColle(l.unite ?? "");
    setEchelleColle("1:1");
    setPanneau("coller-trace");
    setMessage(t("planche.echange.coller.consigne"));
  };
  /** Édition > Coller : la copie interne d'abord ; sinon le presse-papiers du système, s'il contient un tracé. */
  const collerDepuisMenu = () => {
    if (pressePapiers.current) return collerSelection();
    void (async () => {
      try {
        const l = lireTraceColle(await navigator.clipboard.readText());
        if (l) return ouvrirCollageRef.current(l);
      } catch {
        // Lecture refusée par le navigateur : rien n'est collé.
      }
      setMessage(t("planche.presse-papiers.vide"));
    })();
  };
  const echelleColleLue = lireEchelleColle(echelleColle);
  const collerTrace = () => {
    const l = colle;
    if (!l || uniteColle === "" || echelleColleLue === null) return;
    const unite = uniteColle;
    const sol = poserColle === "sol";
    operer(t("planche.echange.coller.operation"), (m, d) => {
      const monde = sol ? REPERE_DU_MODELE : (histContexteRef.current.courant.repere ?? REPERE_DU_MODELE);
      // Dans un groupe ouvert, le plan (monde) est ramené aux coordonnées du groupe.
      const M = d !== undefined ? matriceMonde(m, d) : null;
      const I = M ? inverserMatrice(M) : null;
      const vers = (p: { x: number; y: number; z: number }, translation: boolean) => {
        if (!I) return p;
        const g = (k: number) => I[k] ?? 0;
        const w = translation ? 1 : 0;
        return { x: g(0) * p.x + g(1) * p.y + g(2) * p.z + g(3) * w, y: g(4) * p.x + g(5) * p.y + g(6) * p.z + g(7) * w, z: g(8) * p.x + g(9) * p.y + g(10) * p.z + g(11) * w };
      };
      const repere = { origine: vers(monde.origine, true), x: vers(monde.x, false), y: vers(monde.y, false), z: vers(monde.z, false) };
      const r = poserTraces(m, l, { metresParUnite: METRES_PAR_UNITE_COLLE[unite], echelle: echelleColleLue, repere, ...(d !== undefined ? { dans: d } : {}) });
      return {
        modele: r.modele,
        selection: r.rapport.crees,
        message: t("planche.echange.coller.ok", { traces: String(l.traces.length), type: t(`planche.echange.coller.type.${l.type}`), sommets: String(sommetsColles(l)), aretes: String(aretesCollees(l)), plan: t(sol ? "planche.echange.coller.plan.sol" : "planche.echange.coller.plan.travail") }),
      };
    });
    setPanneau(null);
    setColle(null);
  };
  const objetIfcChoisi = (() => {
    if (panneau !== "echange-import") return null;
    const m = hist.present.modele;
    const c = contexteDe(m, dans);
    for (const id of selectionRef.current) {
      const occ = c.occurrences[id];
      const d = donneesIfcDe(m, occ);
      if (occ && d) return { nom: occ.nom ?? m.definitions[occ.definition]?.nom ?? id, donnees: d };
    }
    return null;
  })();
  const cadreImage = panneau === "natif-image" ? (vueRef.current?.cadreImage(tailleImage.largeur, tailleImage.hauteur) ?? null) : null;

  const executerGabarit = (id: IdCommandeGabarit) => {
    if (!disponibiliteCommandeGabarit(id).disponible) return;
    if (id === "gabarit") return setPanneau("gabarit");
    if (id === "importer-gabarit") {
      setPanneau("gabarit");
      return fichierGabaritRef.current?.click();
    }
    if (id === "enregistrer-gabarit") {
      try {
        const nom = nomAffiche(plancheDe(indexRef.current));
        const g = gabaritDeLaPlanche(histRef.current.present.modele, nom, t("planche.gabarit.source-planche", { nom }));
        const texte = JSON.stringify(g, null, 2);
        const fichier = `${nom.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "gabarit"}${EXTENSION_GABARIT}`;
        telechargerFichier(new Blob([texte], { type: "application/json;charset=utf-8" }), fichier);
        void archiverFichierExtension("planche-gabarit", { nom: fichier, texte }).then((issue) => {
          const ident = issue.ok ? issue.archive.id : `local:${fichier}`;
          setGabarits((avant) => [...avant.filter((x) => x.id !== ident), { id: ident, nomFichier: fichier, gabarit: g, texte, ...(issue.ok ? { archive: issue.archive } : { refusArchive: issue.motif }) }]);
          setNoteGabarit(issue.ok ? t("planche.gabarit.note.enregistre", { nom: fichier }) : t("planche.gabarit.note.enregistre-sans-base", { nom: fichier, motif: t(`planche.pieces.motif.${issue.motif}` as "planche.pieces.motif.impossible") }));
        });
      } catch (err) {
        setNoteGabarit(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    // Créer la Planche : depuis le gabarit choisi, sinon une Planche vide.
    const g = gabarits.find((x) => x.id === gabaritChoisi);
    const nom = g ? `${g.gabarit.nom} ${indexRef.current.planches.length + 1}` : `${t("planche.gabarit.vide")} ${indexRef.current.planches.length + 1}`;
    const modele = g ? modeleDepuisGabarit(g.gabarit, { nom: g.nomFichier, texte: g.texte }, { ...(g.archive ? { archive: g.archive } : {}), ...(g.refusArchive ? { refusArchive: g.refusArchive } : {}) }) : undefined;
    void actionsMenu.creer(nom, null, modele).then(() => setPanneau(null));
  };

  // ——— Cas 2, lot 7 : versions et jalons, registre des émissions, consultation seule, comparaison, brouillon, fiche.
  const plancheCourante = indexPlanches.courante;
  const infoCourante = plancheDe(indexPlanches);
  const [registre, setRegistre] = useState<RegistreVersions>(() => registreVide());
  const registreRef = useRef(registre);
  registreRef.current = registre;
  const [jalonChoisi, setJalonChoisi] = useState<string | null>(null);
  useEffect(() => {
    let annule = false;
    const lu = (r: RegistreVersions) => {
      if (annule) return;
      registreRef.current = r;
      setRegistre(r);
      setJalonChoisi(null);
    };
    chargerRegistre(plancheCourante).then(lu, () => lu(registreVide()));
    return () => {
      annule = true;
    };
  }, [plancheCourante]);
  /** Registre de la Planche courante : à l'écran et dans ce navigateur. */
  const poserRegistre = (r: RegistreVersions) => {
    registreRef.current = r;
    setRegistre(r);
    enregistrerRegistre(indexRef.current.courante, r).catch((e: unknown) => setMessage(t("planche.sb.echec", { motif: e instanceof Error ? e.message : String(e) })));
  };
  const idVersion = (prefixe: string) => `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  // n° 62 : chaque fichier émis ou partagé est noté ; la pièce est le jalon dont l'empreinte est celle du modèle émis,
  // sinon « état courant » ; le destinataire n'est jamais deviné (déclaré ensuite, sinon « non renseigné »).
  noterEmissionRef.current = (format, fichier, genre) => {
    const m = histRef.current.present.modele;
    const empreinte = empreinteModele(m);
    const r = registreRef.current;
    const jalon = r.jalons.find((j) => j.empreinte === empreinte) ?? null;
    poserRegistre(noterEmission(r, { id: idVersion("e"), date: new Date().toISOString(), jalon: jalon?.nom ?? null, indice: revisionDe(m)?.indice ?? "", format, fichier, genre }));
  };

  /** Changements de Planche propres au lot 7 (variante, brouillon) : mêmes écritures que le menu Fichier. */
  const actionsVersions = useMemo(() => {
    const poserIndex = async (idx: IndexPlanches) => {
      indexRef.current = idx;
      setIndexPlanches(idx);
      await enregistrerIndex(idx);
    };
    const basculerVers = async (idx: IndexPlanches) => {
      sauvegarde.invalider();
      remplacerRef.current = true;
      await poserIndex(idx);
      setChargeId((n) => n + 1);
    };
    const ecrire = async () => {
      sauvegarde.invalider();
      const id = indexRef.current.courante;
      await enregistrerBrouillon(consultationRef.current?.retour?.present.modele ?? histRef.current.present.modele, id);
      await enregistrerJournal(id, journalRef.current).catch(() => undefined);
      await poserIndex(avecInfo(indexRef.current, id, { modifieA: new Date().toISOString() }));
    };
    const nouvelle = async (nom: string, modele: Modele, extra: Partial<Pick<InfoPlanche, "origine" | "brouillonDe">>) => {
      await ecrire();
      const maintenant = new Date().toISOString();
      const idx = avecNouvelle(indexRef.current, { id: nouvelId(indexRef.current), nom, altitudeRef: plancheDe(indexRef.current).altitudeRef, creeA: maintenant, modifieA: maintenant, ...extra });
      await enregistrerBrouillon(modele, idx.courante);
      memoriserContexte(idx.courante, histContexteRef.current.courant);
      await enregistrerJournal(idx.courante, ajouterEntree([], { a: maintenant, auteur: t("planche.sb.auteur"), description: t("planche.sb.journal.creee") })).catch(() => undefined);
      await basculerVers(idx);
    };
    const retirer = async (id: string) => {
      await supprimerDocument(id);
      await supprimerJournal(id).catch(() => undefined);
      await supprimerVersions(id);
    };
    const echec = (e: unknown) => setMessage(e instanceof RangeError ? t("planche.sb.max", { n: "50" }) : t("planche.sb.echec", { motif: e instanceof Error ? e.message : String(e) }));
    /** Brouillon ouvert et son original (encore présent), sinon `null`. */
    const brouillonOuvert = () => {
      const b = plancheDe(indexRef.current);
      const orig = b.brouillonDe;
      return orig && indexRef.current.planches.some((p) => p.id === orig) ? { b, orig, nom: nomAffiche(plancheDe(indexRef.current, orig)) } : null;
    };
    return {
      ecrire,
      deriver: async (jalon: Jalon) => {
        try {
          const planche = indexRef.current.courante;
          const m = await chargerJalon(planche, jalon);
          if (!m) return setMessage(t("planche.version.jalon-refuse", { nom: jalon.nom }));
          const nomPlanche = nomAffiche(plancheDe(indexRef.current));
          const nom = t("planche.version.variante-nom", { nom: nomPlanche });
          await nouvelle(nom, m, { origine: { planche, nomPlanche, jalon: jalon.id, nomJalon: jalon.nom } });
          setMessage(t("planche.version.variante-creee", { nom, jalon: jalon.nom }));
        } catch (e) {
          echec(e);
        }
      },
      essayer: async () => {
        try {
          const info = plancheDe(indexRef.current);
          const nomPlanche = nomAffiche(info);
          await nouvelle(t("planche.brouillon.nom", { nom: nomPlanche }), histRef.current.present.modele, { brouillonDe: info.id });
          setMessage(t("planche.brouillon.ouvert", { nom: nomPlanche }));
        } catch (e) {
          echec(e);
        }
      },
      appliquer: async () => {
        const o = brouillonOuvert();
        if (!o) return;
        try {
          sauvegarde.invalider();
          appliquerApresRef.current = histRef.current.present.modele;
          await retirer(o.b.id);
          await basculerVers(avecCourante(sansPlanche(indexRef.current, o.b.id), o.orig));
          setMessage(t("planche.brouillon.applique", { nom: o.nom }));
        } catch (e) {
          appliquerApresRef.current = null;
          echec(e);
        }
      },
      garder: async () => {
        const o = brouillonOuvert();
        if (!o) return;
        try {
          const nom = t("planche.version.variante-nom", { nom: o.nom });
          await ecrire();
          await poserIndex(enVariante(indexRef.current, o.b.id, nom, { planche: o.orig, nomPlanche: o.nom }));
          setMessage(t("planche.brouillon.garde", { nom }));
        } catch (e) {
          echec(e);
        }
      },
      abandonner: async () => {
        const o = brouillonOuvert();
        if (!o) return;
        try {
          sauvegarde.invalider();
          await retirer(o.b.id);
          await basculerVers(avecCourante(sansPlanche(indexRef.current, o.b.id), o.orig));
          setMessage(t("planche.brouillon.abandonne", { nom: o.nom }));
        } catch (e) {
          echec(e);
        }
      },
    };
  }, [sauvegarde]);

  // n° 86 : consultation seule, de la Planche courante ou d'un jalon (son contenu relu contre son empreinte).
  const entrerConsultation = async (jalon: Jalon | null) => {
    if (lectureProp) return;
    if (!jalon) {
      if (consultationRef.current) return;
      // L'état courant est écrit d'abord (revue de #514) : rien de ce qui était en cours n'est perdu en consultation.
      try {
        await actionsVersions.ecrire();
      } catch (e) {
        setMessage(t("planche.sb.echec", { motif: e instanceof Error ? e.message : String(e) }));
        return;
      }
      const c = { jalon: null, retour: null };
      consultationRef.current = c;
      setConsultation(c);
      setMessage(t("planche.lecture.message"));
      return;
    }
    const m = await chargerJalon(indexRef.current.courante, jalon);
    if (!m) return setMessage(t("planche.version.jalon-refuse", { nom: jalon.nom }));
    // L'état courant est écrit avant d'être mis de côté : rien de ce qui était en cours n'est perdu.
    if (!consultationRef.current) {
      try {
        await actionsVersions.ecrire();
      } catch (e) {
        setMessage(t("planche.sb.echec", { motif: e instanceof Error ? e.message : String(e) }));
        return;
      }
    }
    const c = { jalon, retour: consultationRef.current?.retour ?? histRef.current };
    consultationRef.current = c;
    setConsultation(c);
    etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
    poserDans(undefined);
    setSelection([]);
    poserHistorique(historiqueInitial(m), { envoyer: false });
    rafraichir();
    setMessage(t("planche.lecture.message"));
  };
  const quitterConsultation = () => {
    const c = consultationRef.current;
    if (!c) return;
    consultationRef.current = null;
    setConsultation(null);
    if (c.retour) {
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      poserDans(undefined);
      setSelection([]);
      poserHistorique(c.retour, { envoyer: false });
      rafraichir();
    }
    setMessage(t("planche.lecture.fin"));
  };

  const poserUnJalon = (nom: string) => {
    if (readOnly) return setMessage(t("planche.lecture.message"));
    if (!nom.trim()) return setMessage(t("planche.version.jalon-nom-requis"));
    const planche = indexRef.current.courante;
    try {
      const r = poserJalon(registreRef.current, histRef.current.present.modele, { nom, date: new Date().toISOString(), id: idVersion("j") });
      enregistrerContenuJalon(planche, r.jalon.id, r.contenu).then(
        () => {
          if (indexRef.current.courante !== planche) return;
          poserRegistre(r.registre);
          setJalonChoisi(r.jalon.id);
          setMessage(t("planche.version.jalon-pose", { nom: r.jalon.nom, indice: r.jalon.indice ? t("planche.version.jalon-indice", { indice: r.jalon.indice }) : "", empreinte: empreinteCourte(r.jalon.empreinte) }));
        },
        (e: unknown) => setMessage(t("planche.sb.echec", { motif: e instanceof Error ? e.message : String(e) })),
      );
    } catch (e) {
      setMessage(e instanceof RangeError ? t("planche.version.jalon-nom-requis") : String(e));
    }
  };
  const poserUneRevision = (r: Revision) => operer(t("planche.version.operation-revision"), (m) => ({ modele: poserRevision(m, r).modele }));
  const poserUneFiche = (f: FicheProjet) => operer(t("planche.fiche.operation"), (m) => ({ modele: poserFiche(m, f).modele }));
  const gabaritApplique = hist.present.modele.annotations?.reglages?.gabarit;
  const statutsVersion = useMemo(() => {
    const lu = gabaritApplique ? lireGabarit(gabaritApplique.texte) : null;
    return statutsProposes(lu?.ok ? lu.gabarit.statuts : undefined, registre);
  }, [gabaritApplique, registre]);
  const varianteAffichee = (p: InfoPlanche): VarianteAffichee => ({ id: p.id, nom: nomAffiche(p), jalon: p.origine?.jalon ?? null, creeA: p.creeA });
  const originalBrouillon = infoCourante.brouillonDe ? (indexPlanches.planches.find((p) => p.id === infoCourante.brouillonDe) ?? null) : null;
  const brouillonEnCours = indexPlanches.planches.find((p) => p.brouillonDe === plancheCourante) ?? null;
  const origineCourante = infoCourante.origine ?? null;

  // n° 73 : changements du brouillon par rapport à l'original (relu dans ce navigateur).
  const [modeleOriginal, setModeleOriginal] = useState<Modele | null>(null);
  const idOriginal = originalBrouillon?.id ?? null;
  useEffect(() => {
    setModeleOriginal(null);
    if (!idOriginal) return;
    let annule = false;
    chargerBrouillon(idOriginal).then(
      (m) => !annule && setModeleOriginal(m ?? modeleVide()),
      () => undefined,
    );
    return () => {
      annule = true;
    };
  }, [idOriginal, chargeId]);
  const changementsBrouillon = useMemo(() => (modeleOriginal && panneau === "brouillon" ? comparerModeles(modeleOriginal, hist.present.modele) : null), [modeleOriginal, panneau, hist.present.modele]);

  // n° 33, 41, 48 : comparaison de deux états, surlignée dans la vue 3D.
  const [comparerDepuis, setComparerDepuis] = useState("");
  const [comparerVers, setComparerVers] = useState("courant");
  const [surlignerDifferences, setSurlignerDifferences] = useState(true);
  const [comparaison, setComparaison] = useState<{ readonly c: Comparaison; readonly a: Modele; readonly b: Modele } | null>(null);
  const [refusComparaison, setRefusComparaison] = useState<string | null>(null);
  const choixComparaison: ChoixComparaison[] = [
    { id: "courant", libelle: t("planche.comparer.courant") },
    ...registre.jalons.map((j) => ({ id: `j:${j.id}`, libelle: `${j.nom}${j.indice ? ` (${j.indice})` : ""}` })),
    ...(originalBrouillon ? [{ id: `p:${originalBrouillon.id}`, libelle: t("planche.comparer.original", { nom: nomAffiche(originalBrouillon) }) }] : []),
    ...(brouillonEnCours ? [{ id: `p:${brouillonEnCours.id}`, libelle: t("planche.comparer.brouillon") }] : []),
  ];
  const defautDepuis = registre.jalons[0] ? `j:${registre.jalons[0].id}` : originalBrouillon ? `p:${originalBrouillon.id}` : "courant";
  const depuisEffectif = choixComparaison.some((c) => c.id === comparerDepuis) ? comparerDepuis : defautDepuis;
  const versEffectif = choixComparaison.some((c) => c.id === comparerVers) ? comparerVers : "courant";
  const libelleChoix = (id: string) => choixComparaison.find((c) => c.id === id)?.libelle ?? id;
  useEffect(() => {
    if (panneau !== "comparer") {
      setComparaison(null);
      setRefusComparaison(null);
      return;
    }
    let annule = false;
    const lire = async (id: string): Promise<Modele | string> => {
      if (id === "courant") return consultationRef.current?.retour?.present.modele ?? histRef.current.present.modele;
      if (id.startsWith("j:")) {
        const j = registreRef.current.jalons.find((x) => `j:${x.id}` === id);
        if (!j) return id;
        return (await chargerJalon(indexRef.current.courante, j)) ?? t("planche.version.jalon-refuse", { nom: j.nom });
      }
      return (await chargerBrouillon(id.slice(2)).catch(() => null)) ?? modeleVide();
    };
    const minuterie = window.setTimeout(() => {
      void (async () => {
        const a = await lire(depuisEffectif);
        const b = await lire(versEffectif);
        if (annule) return;
        if (typeof a === "string" || typeof b === "string") {
          setComparaison(null);
          setRefusComparaison(typeof a === "string" ? a : (b as string));
          return;
        }
        const c = comparerModeles(a, b);
        setRefusComparaison(null);
        setComparaison({ c, a, b });
        setMessage(t("planche.comparer.message", { depuis: libelleChoix(depuisEffectif), vers: libelleChoix(versEffectif), ajoutes: String(c.ajoutes.length), supprimes: String(c.supprimes.length), modifies: String(c.modifies.length) }));
      })();
    }, 120);
    return () => {
      annule = true;
      window.clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panneau, depuisEffectif, versEffectif, hist.present.modele, registre]);
  useEffect(() => {
    const v = vueRef.current;
    if (!v) return;
    v.poserDifferences(panneau === "comparer" && comparaison && surlignerDifferences ? segmentsDifferences(comparaison.a, comparaison.b, comparaison.c) : null);
    rafraichir();
  }, [panneau, comparaison, surlignerDifferences, rafraichir]);

  const disponibiliteCommandeVersion = (id: IdCommandeVersion) => disponibiliteVersion(id, { lecture: readOnly, brouillon: originalBrouillon !== null });
  const executerVersion = (id: IdCommandeVersion) => {
    const d = disponibiliteCommandeVersion(id);
    if (!d.disponible) return setMessage(t(d.motif ?? "planche.lecture.message"));
    const basculer = (p: Panneau) => setPanneau(panneauRef.current === p ? null : p);
    if (id === "versions") return basculer("versions-jalons");
    if (id === "poser-jalon") {
      setPanneau("versions-jalons");
      return setMessage(t("planche.version.jalon-nom-requis"));
    }
    // Consultation : du jalon choisi quand « Versions et jalons » est ouvert, sinon de la Planche courante ; de nouveau : sortie.
    if (id === "consultation") {
      if (consultationRef.current) return quitterConsultation();
      const jalon = panneauRef.current === "versions-jalons" ? (registreRef.current.jalons.find((j) => j.id === jalonChoisi) ?? registreRef.current.jalons[0] ?? null) : null;
      return void entrerConsultation(jalon);
    }
    if (id === "comparer") return basculer("comparer");
    if (id === "brouillon") return basculer("brouillon");
    if (id === "appliquer-brouillon") return void actionsVersions.appliquer();
    if (id === "garder-brouillon") return void actionsVersions.garder();
    if (id === "abandonner-brouillon") return void actionsVersions.abandonner();
    basculer("fiche-projet");
  };
  const raccourciConsultation = COMMANDES_VERSION.find((c) => c.id === "consultation")!.raccourci;

  /**
   * Extensions installées sur la plateforme (protocole des extensions 1.0, lot 3). Chaque extension a son hôte
   * (`creerHoteExtension`), créé à sa première commande : son code tourne dans un Web Worker isolé et ne touche le
   * dessin que par les services de la Planche — une opération est appliquée d'un bloc, en un seul pas d'historique.
   * Une commande à la fois par extension ; un avis dit ce qui s'est passé quand elle échoue ou ne répond plus.
   */
  const paquetsInstalles = useExtensionsInstallees();
  const [avisExtensions, setAvisExtensions] = useState<readonly AvisAffiche[]>([]);
  // File des fenêtres de saisie : deux extensions peuvent en demander une en même temps ; la première demandée est
  // affichée, les suivantes attendent leur tour (leur commande reste suspendue, jamais oubliée).
  const [saisiesExtensions, setSaisiesExtensions] = useState<readonly SaisieOuverte[]>([]);
  const [fichiersExtensions, setFichiersExtensions] = useState<readonly FichierDemande[]>([]);
  const [extensionsEnCours, setExtensionsEnCours] = useState<ReadonlySet<string>>(() => new Set());
  const extensionsEnCoursRef = useRef<Set<string>>(new Set());
  const hotesExtensions = useRef(new Map<string, { readonly paquet: PaquetExtension; readonly hote: HoteExtension }>());
  /** Opérations appliquées au dessin par chaque extension : sert à dire, après un échec, si quelque chose a été gardé. */
  const applicationsExtensions = useRef(new Map<string, number>());
  const cleExtensions = useRef(0);
  const plancheMontee = useRef(true);
  useEffect(() => {
    plancheMontee.current = true;
    const hotes = hotesExtensions.current;
    return () => {
      plancheMontee.current = false;
      for (const { hote } of hotes.values()) hote.arreter();
      hotes.clear();
    };
  }, []);
  const poserAvisExtension = (extension: string, texte: string, genre: AvisAffiche["genre"]) => setAvisExtensions((liste) => ajouterAvis(liste, { cle: ++cleExtensions.current, extension, texte, genre }));
  // ——— Événements adressés aux extensions (lot 7) : dessin, sélection, projet.
  const paquetsRef = useRef(paquetsInstalles);
  paquetsRef.current = paquetsInstalles;
  /** Extension à l'origine du changement en cours d'application, et son rang dans la chaîne de réactions. */
  const causeChangementRef = useRef<CauseEvenement | null>(null);
  /** Cause du dernier changement du dessin : l'enregistrement qu'il déclenche est annoncé avec elle (pas de boucle). */
  const causeDernierChangementRef = useRef<CauseEvenement | null>(null);
  /** Vrai pendant une annulation ou un rétablissement. */
  const gesteFigeRef = useRef(false);
  const emettreEvenementRef = useRef<(nom: EvenementExtension, donnees: unknown, cause?: CauseEvenement, fige?: boolean) => void>(() => {});
  signalerModeleRef.current = (avant, apres) => {
    // Chargement d'un dessin (historique neuf) : annoncé par « projet.ouvert », pas comme un changement.
    if (apres.passe.length === 0 && apres.futur.length === 0 && apres.present.operation === null) return;
    const cause = causeChangementRef.current;
    const origine = cause ? "extension" : apres.futur.length > avant.futur.length ? "annulation" : avant.futur[0] === apres.present && apres.passe.length > avant.passe.length ? "retablissement" : "utilisateur";
    causeDernierChangementRef.current = cause;
    const fige = origine === "annulation" || origine === "retablissement";
    if (fige) {
      // La sélection vidée par le même geste est annoncée avec la même réserve.
      gesteFigeRef.current = true;
      window.setTimeout(() => (gesteFigeRef.current = false), 0);
    }
    const changement = resumerChangement(avant.present.modele, apres.present.modele, origine);
    // Après une annulation ou un rétablissement, une réaction ne modifie pas le dessin : elle déferait le geste.
    if (changement) emettreEvenementRef.current("modele.change", changement, cause ?? { rebond: 0 }, fige);
  };
  const selectionAnnoncee = useRef<readonly string[]>([]);
  const causeSelectionRef = useRef<CauseEvenement | null>(null);
  signalerSelectionRef.current = () => {
    // Plusieurs changements dans le même geste : un seul événement, avec la sélection finale.
    const cause = causeSelectionRef.current ?? causeChangementRef.current;
    const fige = gesteFigeRef.current;
    window.setTimeout(() => {
      const s = selectionRef.current;
      const a = selectionAnnoncee.current;
      if (!plancheMontee.current || (a.length === s.length && a.every((id, i) => id === s[i]))) return;
      selectionAnnoncee.current = s;
      emettreEvenementRef.current("selection.change", { selection: [...s] }, cause ?? { rebond: 0 }, fige);
    }, 0);
  };
  /** Ce que la Planche prête à une extension : lu à chaque appel, pour suivre le dessin, la sélection et le contexte courants. */
  const accesExtensionRef = useRef<(id: string) => AccesPlanche>(() => ({ modele: () => histRef.current.present.modele, selection: () => [], dans: () => undefined, appliquer: () => false, selectionner: () => {} }));
  accesExtensionRef.current = (id) => ({
    modele: () => histRef.current.present.modele,
    selection: () => selectionRef.current,
    dans: () => dansRef.current,
    separateur: () => (LANGUE_INTERFACE === "en" ? "." : ","),
    appliquer: (travail, nom, _crees, contexteAppel) => {
      if (readOnly) return false;
      const marque = contexteAppel?.marque as { rebond?: unknown; fige?: unknown } | undefined;
      // Réaction à une annulation ou à un rétablissement, ou tant qu'il reste un pas à rétablir : elle déferait le geste.
      if (contexteAppel?.discrete === true && (marque?.fige === true || histRef.current.futur.length > 0)) return false;
      causeChangementRef.current = { extension: id, rebond: typeof marque?.rebond === "number" ? marque.rebond : 0 };
      // Opération discrète (réaction à un événement) : rattachée au pas d'annulation de l'utilisateur, qui garde son nom.
      const h0 = histRef.current;
      const discrete = contexteAppel?.discrete === true && h0.passe.length > 0;
      poserHistorique(enregistrer(h0, travail, discrete ? (h0.present.operation ?? nom) : nom, discrete));
      causeChangementRef.current = null;
      applicationsExtensions.current.set(id, (applicationsExtensions.current.get(id) ?? 0) + 1);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      rafraichir();
      return true;
    },
    selectionner: (ids, contexteAppel) => {
      const marque = contexteAppel?.marque as { rebond?: unknown } | undefined;
      causeSelectionRef.current = { extension: id, rebond: typeof marque?.rebond === "number" ? marque.rebond : 0 };
      setSelection(ids);
      causeSelectionRef.current = null;
      rafraichir();
    },
  });
  /** Ouvre une fenêtre de fichier pour une extension ; `fermer` la retire si l'appel prend fin avant la réponse. */
  const fenetreFichier = <T,>(creer: (cle: number, repondre: (v: T) => void) => FichierDemande) => {
    const cle = ++cleExtensions.current;
    let close = false;
    const retirer = () => setFichiersExtensions((file) => retirerFichier(file, cle));
    const reponse = new Promise<T>((resolve) => {
      const fenetre = creer(cle, (v) => {
        if (close) return;
        close = true;
        retirer();
        resolve(v);
      });
      setFichiersExtensions((file) => [...file, fenetre]);
    });
    return {
      reponse,
      fermer: () => {
        close = true;
        if (plancheMontee.current) retirer();
      },
    };
  };
  const hoteExtension = (p: PaquetExtension): HoteExtension => {
    const id = p.fiche.id;
    const connu = hotesExtensions.current.get(id);
    if (connu?.paquet === p) return connu.hote;
    connu?.hote.arreter();
    const nom = texteFiche(p.fiche.nom);
    const acces = (): AccesPlanche => accesExtensionRef.current(id);
    const hote = creerHoteExtension(p, {
      acces: { modele: () => acces().modele(), selection: () => acces().selection(), dans: () => acces().dans(), appliquer: (...a) => acces().appliquer(...a), selectionner: (...a) => acces().selectionner(...a), separateur: () => acces().separateur?.() ?? "," },
      surEcheance: (i) => plancheMontee.current && signalerArretReaction(nom, i),
      libelleEcheance: t("extensions.installee.reaction", { extension: nom }),
      surAvis: (a) => plancheMontee.current && poserAvisExtension(nom, a.texte, a.genre),
      panneau: {
        // Données remises à la page du panneau s'il est ouvert ; sinon l'extension apprend qu'elles sont perdues.
        envoyer: (panneauId, donnees) => {
          const ouvert = panneauExtensionRef.current;
          if (!plancheMontee.current || !canalPanneauRef.current || ouvert?.extension !== id || ouvert.panneau !== panneauId) return false;
          canalPanneauRef.current(donnees);
          return true;
        },
        ouvrir: (panneauId) => {
          if (!plancheMontee.current) return false;
          setPanneauExtension({ extension: id, panneau: panneauId });
          return true;
        },
      },
      fichiers: {
        ouvrir: (demande) => fenetreFichier<(FichierLu & { readonly octets?: Uint8Array }) | null>((cle, repondre) => ({ cle, extension: nom, sorte: "ouvrir", demande, repondre })),
        enregistrer: (demande) =>
          fenetreFichier<boolean>(
            (cle, repondre) => ({
              cle,
              extension: nom,
              sorte: "enregistrer",
              demande,
              repondre: (accepte) => {
                // Le fichier part dans les téléchargements de l'utilisateur, au moment où il l'accepte.
                if (accepte) telechargerFichier(new Blob([demande.texte], { type: "text/plain;charset=utf-8" }), demande.nom);
                repondre(accepte);
              },
            }),
          ),        // (Protocole 1.2) Fichier de données ouvert avec « archiver » : rangé tel quel en base, au nom du compte.
        archiver: (fichier, octets) => archiverFichierExtension(id, fichier, octets),
      },
      saisir: (demande) => {
        const cle = ++cleExtensions.current;
        let close = false;
        const retirer = () => setSaisiesExtensions((file) => retirerSaisie(file, cle));
        const reponse = new Promise<ValeursSaisie | null>((resolve) => {
          const saisie: SaisieOuverte = {
            cle,
            extension: nom,
            demande,
            repondre: (valeurs) => {
              if (close) return;
              close = true;
              retirer();
              resolve(valeurs);
            },
          };
          setSaisiesExtensions((file) => [...file, saisie]);
        });
        return {
          reponse,
          fermer: () => {
            close = true;
            if (plancheMontee.current) retirer();
          },
        };
      },
    });
    hotesExtensions.current.set(id, { paquet: p, hote });
    return hote;
  };
  /** Une réaction (événement, minuterie) arrêtée d'office ou en panne est dite à l'utilisateur ; une erreur ordinaire reste au journal de l'extension. */
  const signalerArretReaction = (nom: string, i: IssueAppelExtension) => {
    if (i.genre === "delai") poserAvisExtension(nom, t("extensions.avis.reaction.delai", { secondes: String(Math.round(BORNES_EXTENSION.delaiEvenementMs / 1000)) }), "arret");
    else if (i.genre === "panne") poserAvisExtension(nom, t("extensions.avis.panne"), "arret");
  };
  emettreEvenementRef.current = (evenement, donnees, cause = { rebond: 0 }, fige = false) => {
    for (const p of destinatairesEvenement(paquetsRef.current, evenement, cause)) {
      const nom = texteFiche(p.fiche.nom);
      void hoteExtension(p)
        .appeler("evenement", evenement, donnees, t("extensions.installee.reaction", { extension: nom }), { rebond: cause.rebond + 1, fige })
        .then((i) => plancheMontee.current && signalerArretReaction(nom, i));
    }
  };
  // « projet.ouvert » : à chaque dessin chargé, une fois les extensions connues ; « projet.enregistre » : après chaque
  // enregistrement du dessin.
  const ouvertureAnnoncee = useRef(0);
  useEffect(() => {
    // `dessinCharge` avance à la fin de chaque chargement : jamais avant que le nouveau dessin soit en place, et une
    // seule annonce par dessin chargé, même si la liste des extensions arrive après.
    if (dessinCharge === 0 || paquetsInstalles.length === 0 || ouvertureAnnoncee.current === dessinCharge) return;
    ouvertureAnnoncee.current = dessinCharge;
    causeDernierChangementRef.current = null;
    emettreEvenementRef.current("projet.ouvert", { nom: nomAffiche(plancheDe(indexRef.current)) });
  }, [dessinCharge, paquetsInstalles]);
  const sauvegardeVue = useRef<EtatSauvegarde>(etatSauvegarde);
  useEffect(() => {
    const avant = sauvegardeVue.current;
    sauvegardeVue.current = etatSauvegarde;
    if (etatSauvegarde === "enregistre" && (avant === "enregistrement" || avant === "attente")) emettreEvenementRef.current("projet.enregistre", null, causeDernierChangementRef.current ?? { rebond: 0 });
  }, [etatSauvegarde]);
  const lancerCommandeExtension = (p: PaquetExtension, c: EntreeDeclaree) => {
    const id = p.fiche.id;
    if (extensionsEnCoursRef.current.has(id)) return;
    const marquer = (enCours: boolean) => {
      if (enCours) extensionsEnCoursRef.current.add(id);
      else extensionsEnCoursRef.current.delete(id);
      if (plancheMontee.current) setExtensionsEnCours(new Set(extensionsEnCoursRef.current));
    };
    marquer(true);
    const nom = texteFiche(p.fiche.nom);
    const commande = texteFiche(c.libelle);
    const appliqueesAvant = applicationsExtensions.current.get(id) ?? 0;
    void hoteExtension(p)
      .appeler("demande", nomAppelCommande(c.id), { langue: LANGUE_INTERFACE }, t("extensions.installee.operation", { extension: nom, commande }))
      .then((i) => {
        marquer(false);
        if (!plancheMontee.current || i.genre === "fini" || i.genre === "arrete") return;
        // Un échec n'applique jamais une opération à moitié ; ce que la commande avait validé avant reste, et se défait.
        const suite = t((applicationsExtensions.current.get(id) ?? 0) === appliqueesAvant ? "extensions.avis.intact" : "extensions.avis.partiel");
        const phrase = (x: string) => `${x.trim().replace(/[.!?…]+$/, "")}.`;
        let texte: string;
        if (i.genre === "delai") texte = t("extensions.avis.delai", { secondes: String(Math.round(BORNES_EXTENSION.delaiCommandeMs / 1000)) });
        else if (i.genre === "panne") texte = t("extensions.avis.panne");
        else if (i.genre === "demarrage") texte = i.erreur.genre === "import" ? t("extensions.avis.demarrage.import") : phrase(t("extensions.avis.demarrage", { detail: i.erreur.texte }));
        else if (i.nom === "operation_refusee") texte = t(readOnly ? "extensions.avis.lecture" : "extensions.avis.refusee", { commande });
        else texte = phrase(t("extensions.avis.erreur", { commande, detail: i.detail || i.nom }));
        poserAvisExtension(nom, `${texte} ${suite}`, "arret");
      });
  };
  // ——— Outils interactifs des extensions (lot 6).
  const outilExtensionDe = (cle: string) => {
    const lu = lireCleOutilExtension(cle);
    const paquet = lu ? paquetsRef.current.find((x) => x.fiche.id === lu.extension) : undefined;
    const declare = paquet?.fiche.outils.find((x) => x.id === lu!.outil);
    return paquet && declare ? { paquet, declare } : null;
  };
  outilExtensionDeclareRef.current = (cle) => outilExtensionDe(cle) !== null;
  /**
   * Déplacements : un seul en vol par outil, on ne garde que le dernier — la file ne peut pas enfler. Un autre événement
   * (clic, saisie…) fait d'abord partir le déplacement gardé, pour que l'extension reçoive tout dans l'ordre.
   */
  const deplacementOutilRef = useRef<{ enVol: number; suivant: Readonly<Record<string, unknown>> | null }>({ enVol: 0, suivant: null });
  transmettreOutilRef.current = (cle, nom, donnees) => {
    const x = outilExtensionDe(cle);
    if (!x) return;
    const file = deplacementOutilRef.current;
    if (nom === "deplacement") {
      if (file.enVol > 0) return void (file.suivant = donnees);
      file.enVol++;
    } else if (file.suivant) {
      const garde = file.suivant;
      file.suivant = null;
      const enVol = file.enVol;
      file.enVol = 0;
      transmettreOutilRef.current(cle, "deplacement", garde);
      file.enVol += enVol;
    }
    const extension = texteFiche(x.paquet.fiche.nom);
    const outilNom = texteFiche(x.declare.libelle);
    void hoteExtension(x.paquet)
      .appeler("demande", nomAppelOutil(x.declare.id, nom), { ...donnees, langue: LANGUE_INTERFACE }, t("extensions.installee.operation", { extension, commande: outilNom }), undefined, BORNES_OUTIL.delaiMs)
      .then((i) => {
        if (nom === "deplacement") {
          file.enVol = Math.max(0, file.enVol - 1);
          if (file.enVol === 0) {
            const suivant = file.suivant;
            file.suivant = null;
            if (suivant && outilRef.current === cle) transmettreOutilRef.current(cle, "deplacement", suivant);
          }
        }
        if (!plancheMontee.current || outilRef.current !== cle) return;
        // Un événement que l'outil ne traite pas est simplement sans effet.
        if (i.genre === "arrete" || (i.genre === "erreur" && i.nom === "demande_inconnue")) return;
        if (i.genre === "fini") {
          const lu = lireDescriptionOutil(i.resultat);
          if (lu.ok) {
            etatMachineRef.current = avecDescription(etatMachineRef.current as EtatOutilExtension, lu.description);
            return rafraichir();
          }
          poserAvisExtension(extension, t("extensions.outil.avis.description", { outil: outilNom, detail: lu.detail }), "arret");
        } else if (i.genre === "delai") poserAvisExtension(extension, t("extensions.outil.avis.delai", { outil: outilNom }), "arret");
        else if (i.genre === "panne") poserAvisExtension(extension, t("extensions.avis.panne"), "arret");
        else if (i.genre === "demarrage") poserAvisExtension(extension, i.erreur.genre === "import" ? t("extensions.avis.demarrage.import") : t("extensions.avis.demarrage", { detail: i.erreur.texte }), "arret");
        else if (i.nom === "operation_refusee") poserAvisExtension(extension, t(readOnly ? "extensions.avis.lecture" : "extensions.avis.refusee", { commande: outilNom }), "arret");
        else poserAvisExtension(extension, t("extensions.avis.erreur", { commande: outilNom, detail: i.detail || i.nom }), "arret");
        // L'outil qui échoue rend la main : la Planche revient à Sélection, un seul avis le dit.
        demandeOutilRef.current("selection");
      });
  };
  passerOutilExtensionRef.current = (avant, apres, etatQuitte) => {
    if (avant === apres) return;
    const pause = outilEnPauseRef.current;
    if (lireCleOutilExtension(avant)) {
      // Un outil de caméra ne fait que suspendre l'outil : son état est gardé pour la reprise.
      if (estOutilCamera(apres)) {
        outilEnPauseRef.current = { cle: avant, etat: etatQuitte ?? null };
        transmettreOutilRef.current(avant, "pause", {});
      } else {
        outilEnPauseRef.current = null;
        transmettreOutilRef.current(avant, "desactivation", {});
      }
    } else if (pause && pause.cle !== apres && !estOutilCamera(apres)) {
      outilEnPauseRef.current = null;
      transmettreOutilRef.current(pause.cle, "desactivation", {});
    }
    if (lireCleOutilExtension(apres)) {
      const reprise = pause?.cle === apres;
      if (reprise) outilEnPauseRef.current = null;
      transmettreOutilRef.current(apres, reprise ? "reprise" : "activation", {});
    }
  };
  /** Outil d'extension actif : son nom en tête de la barre d'état, son curseur. */
  const outilExtensionActif = (() => {
    const x = outilExtensionDe(outilId);
    if (!x) return null;
    const d = (etatMachineRef.current as EtatOutilExtension | null)?.description;
    return { nom: texteFiche(x.declare.libelle), curseur: CURSEURS_CSS[d?.curseur ?? x.declare.curseur ?? "croix"] };
  })();
  // L'extension de l'outil actif n'est plus installée : la Planche revient à Sélection.
  useEffect(() => {
    if (lireCleOutilExtension(outilId) && !paquetsInstalles.some((p) => p.fiche.outils.some((o) => cleOutilExtension(p.fiche.id, o.id) === outilId))) demandeOutilRef.current("selection");
  }, [outilId, paquetsInstalles]);
  /** Action nommée appelée par la page d'un panneau : une demande adressée à l'extension, comme une commande. */
  const appelerPanneauExtension = (p: PaquetExtension, panneauId: string, titre: string, action: string, donnees: unknown): Promise<ReponseActionPanneau> => {
    const nomAppel = nomAppelPanneau(panneauId, action);
    if (nomAppel === null) return Promise.resolve({ ok: false, erreur: "argument_invalide", detail: "action" });
    const nom = texteFiche(p.fiche.nom);
    return hoteExtension(p)
      .appeler("demande", nomAppel, donnees, t("extensions.panneau.operation", { extension: nom, panneau: titre }))
      .then((i): ReponseActionPanneau => {
        if (i.genre === "fini") return { ok: true, resultat: i.resultat };
        if (plancheMontee.current) {
          // L'extension arrêtée d'office ou en panne est dite à l'utilisateur ; une erreur ordinaire revient à la page.
          if (i.genre === "delai") poserAvisExtension(nom, `${t("extensions.avis.delai", { secondes: String(Math.round(BORNES_EXTENSION.delaiCommandeMs / 1000)) })} ${t("extensions.avis.intact")}`, "arret");
          else if (i.genre === "panne") poserAvisExtension(nom, t("extensions.avis.panne"), "arret");
        }
        return i.genre === "erreur" ? { ok: false, erreur: i.nom, detail: i.detail } : { ok: false, erreur: i.genre, detail: "" };
      });
  };
  /** Panneaux des extensions installées, à la suite de ceux de la Planche dans la colonne. */
  const panneauxInstalles = paquetsInstalles.flatMap((p) => p.fiche.panneaux.map((x) => ({ paquet: p, id: x.id, cle: clePanneauExtension(p.fiche.id, x.id), titre: texteFiche(x.titre), image: imageIcone(p, x.icone) })));
  const panneauExtensionOuvert = panneauExtension ? (panneauxInstalles.find((x) => x.paquet.fiche.id === panneauExtension.extension && x.id === panneauExtension.panneau) ?? null) : null;
  /** Familles des extensions installées (liste « Outils ») : une par extension qui déclare des commandes. */
  const famillesInstallees: FamilleExtension[] = paquetsInstalles
    .filter((p) => p.fiche.commandes.length + p.fiche.outils.length > 0)
    .map((p) => ({
      id: p.fiche.id,
      nom: texteFiche(p.fiche.nom),
      barre: idBarreExtension(p.fiche.id),
      commandes: p.fiche.commandes.map((c): CommandeListe => {
        const image = imageIcone(p, c.icone);
        return {
          id: cleCommandeExtension(p.fiche.id, c.id),
          picto: PICTO_EXTENSION_INSTALLEE,
          ...(image ? { image } : {}),
          nom: texteFiche(c.libelle),
          raccourci: c.raccourci,
          motif: extensionsEnCours.has(p.fiche.id) ? t("extensions.installee.encours") : null,
          executer: () => lancerCommandeExtension(p, c),
        };
      }).concat(
        // Outils interactifs (lot 6) : dans la même famille, ils s'activent comme un outil de la Planche.
        p.fiche.outils.map((o): CommandeListe => {
          const image = imageIcone(p, o.icone);
          return { id: cleOutilExtension(p.fiche.id, o.id), picto: PICTO_EXTENSION_INSTALLEE, ...(image ? { image } : {}), nom: texteFiche(o.libelle), raccourci: o.raccourci, motif: null, executer: () => choisirOutil(cleOutilExtension(p.fiche.id, o.id)) };
        }),
      ),
    }));
  const commandesInstallees = famillesInstallees.flatMap((f) => f.commandes);
  /** Raccourci d'une commande d'extension : résolu après ceux de la Planche (refusés à l'import s'ils se recouvrent). */
  commandeExtensionDuClavierRef.current = (e) => {
    const r = raccourciClavier(e);
    return (r && commandesInstallees.find((c) => normaliserRaccourci(c.raccourci) === r)) || null;
  };

  /** Extension « Composants dynamiques » : définition du composant sélectionné seul dans le contexte ouvert, ou `null`. */
  const composantSelectionne = (): string | null => {
    const sel = vue.selection ?? selectionRef.current;
    if (sel.length !== 1) return null;
    const m = hist.present.modele;
    const occ = contexteDe(m, dans).occurrences[sel[0]!];
    const d = occ ? m.definitions[occ.definition] : undefined;
    return d?.genre === "composant" ? d.id : null;
  };
  const definitionDynamique = panneau === "dynamique" ? composantSelectionne() : null;
  const erreursDynamique = useMemo(() => (definitionDynamique ? redessinerDynamique(hist.present.modele, definitionDynamique).erreurs : []), [definitionDynamique, hist.present.modele]);
  const disponibiliteCommandeDynamique = (id: IdCommandeDynamique) => {
    const d = id === "redessiner-composant" ? composantSelectionne() : null;
    return disponibiliteDynamique(id, { dynamique: d !== null && hist.present.modele.definitions[d]?.dynamique !== undefined, lecture: readOnly });
  };
  const executerDynamique = (id: IdCommandeDynamique) => {
    if (!disponibiliteCommandeDynamique(id).disponible) return;
    if (id === "composant-dynamique") {
      setPanneau("dynamique");
      return;
    }
    const d = composantSelectionne();
    if (d) operer(t("planche.dynamique.redessiner"), (m) => ({ modele: redessinerDynamique(m, d).modele, message: t("planche.dynamique.note.redessine") }));
  };
  const definirComposantDynamique = (dyn: ComposantDynamique | null) => {
    const d = composantSelectionne();
    if (d) operer(t("planche.dynamique.ouvrir"), (m) => ({ modele: definirDynamique(m, d, dyn).modele }));
  };
  const choisirOptionDynamique = (nom: string, valeur: string) => {
    const d = composantSelectionne();
    if (d) operer(t("planche.dynamique.options"), (m) => ({ modele: definirParametre(m, d, nom, valeur).modele }));
  };
  /** Lot L17 : pièce de profilé sélectionnée seule dans le contexte ouvert (bloc d'édition sous l'Info entité). */
  const pieceSelectionnee = (): string | null => {
    const sel = selectionRef.current;
    if (sel.length !== 1) return null;
    return axesDesPieces(hist.present.modele, dans !== undefined ? { dans } : {}).some((p) => p.occurrence === sel[0]) ? sel[0]! : null;
  };
  const disponibiliteCommandePiece = (id: IdCommandePiece) => disponibilitePiece(id, { piece: pieceSelectionnee() !== null, section: sectionCourante !== null, lecture: readOnly });
  const executerPiece = (id: IdCommandePiece) => {
    const piece = pieceSelectionnee();
    if (!piece || !disponibiliteCommandePiece(id).disponible) return;
    if (id === "piece-section") {
      const s = sectionCourante!;
      operer(t("planche.piece.section"), (m, d) => ({ modele: changerSectionPiece(m, piece, s.section, s.source, s.designation, d !== undefined ? { dans: d } : {}).modele, selection: [piece], message: t("planche.piece.applique", { designation: s.designation }) }));
      return;
    }
    const angle = Number(angleRotation.replace(",", "."));
    if (!Number.isFinite(angle) || angle === 0) {
      setMessage(t("planche.piece.angle-invalide"));
      return;
    }
    operer(t("planche.piece.rotation"), (m, d) => ({ modele: tournerPieceAxe(m, piece, angle, d !== undefined ? { dans: d } : {}).modele, selection: [piece], message: t("planche.piece.tournee", { angle: String(angle) }) }));
  };
  const outil = outilParId(outilId);
  const etatTexte3D = outilId === "texte-3d" ? (etatMachineRef.current as EtatTexte3D | null) : null;
  // Plan de coupe sélectionné seul (§4.28) : barre Inverser / Coupe active / Effacer.
  const planSelectionne = useMemo(() => {
    const sel = vue.selection.length ? vue.selection : selectionRef.current;
    const id = sel.find((x) => genreAnnotation(x) === "plan");
    return id ? hist.present.modele.annotations?.plansDeCoupe[id] ?? null : null;
  }, [vue.selection, hist.present.modele]);
  const idsBarre = useMemo(() => barreGaucheSandbox(prefsEffectives), [prefsEffectives]);
  const barre = useMemo(() => outilsDeBarre(idsBarre), [idsBarre]);
  const sections = useMemo(() => sectionsGrille(outilsOfferts, undefined, idsBarre), [outilsOfferts, idsBarre]);
  const raisonDe = (o: Outil) => disponibilite(o, { lecture: readOnly });
  const etatBarre = OUTILS_BOOLEENS.has(outilId) && booleens === "chargement" ? t("planche.solides.chargement") : vue.erreur ?? vue.note ?? message;
  // Cas 2, lot 2 (n° 21) : les longueurs proposées par l'outil (« 2.40 m ») s'affichent dans l'unité du projet ; une
  // saisie tapée reste telle quelle. Les valeurs stockées ne changent jamais (mètres).
  const valeurMesures = texte?.texte ?? (vue.mesures?.valeur !== undefined ? convertirLongueursAffichees(vue.mesures.valeur, uniteProjet, SEPARATEUR_DECIMAL) : "");

  const boutonOutil = (o: Outil, dansGrille = false) => {
    const raison = raisonDe(o);
    const actif = outilId === o.id;
    return (
      <button
        key={o.id}
        type="button"
        className={`outil${actif ? " est-actif" : ""}${raison ? " est-indisponible" : ""}`}
        aria-pressed={actif}
        aria-disabled={raison ? true : undefined}
        title={titreOutil(o, raison)}
        aria-label={titreOutil(o, raison)}
        data-planche-outil={o.id}
        data-raccourci={o.raccourci ?? undefined}
        onClick={() => choisirOutil(o.id)}
      >
        <Pictogramme picto={pictoOutil(o.id)} actif={actif} className="outil-picto" />
        <span className="outil-libelle" aria-hidden="true">{o.libelle}</span>
        {raison && dansGrille && <span className="outil-lot" aria-hidden="true">{t("planche.prevu.court", { lot: lotPrevu(o) })}</span>}
      </button>
    );
  };

  // Un outil récent que le profil a mis dans la barre gauche n'est pas répété sous le séparateur.
  const recentOutil = recent && !idsBarre.includes(recent) && !masquees.has(`outil:${recent}`) ? outilParId(recent) : null;

  /** Touches d'état à l'écran (tactile) : un appui = enfoncée puis relâchée. */
  const boutonsTouches = (touches: [Touche, string, string][]) =>
    touches.map(([touche, libelle, aide]) => (
      <button
        key={touche}
        type="button"
        title={aide}
        aria-label={aide}
        data-planche-mod={touche}
        onClick={() => {
          envoyerTouche(touche, "enfoncee");
          envoyerTouche(touche, "relachee");
          // Lot 9 : le bouton Ctrl / Alt au toucher vaut une frappe seule (bascule de Pousser/Tirer).
          if (touche === "Ctrl" || touche === "Alt") envoyerSeule(touche);
        }}
      >
        {libelle}
      </button>
    ));

  /** Aide « ? » : barre d'état (ordinateur) ou rangée de saisie du volet (téléphone). */
  const aideBouton = <button type="button" className="lien" onClick={() => setPanneau(panneau === "instructeur" ? null : "instructeur")} title={t("bas.aide")} aria-label={t("bas.aide")}><Pictogramme picto={pictoPanneau("instructeur")} /></button>;
  /** Langue et périphérique : barre d'état (ordinateur) ou barre du haut (téléphone). */
  const choix = (
    <>
      <ChoixLangue className="canevas-langue" />
      <ChoixPeripherique ui={ui} />
    </>
  );
  /**
   * Ordinateur : langue et périphérique en icônes (globe, souris) à gauche de la barre d'état, comme SketchUp ; la liste
   * native reste dessous, transparente, et s'ouvre au clic (clavier et lecteur d'écran inchangés).
   */
  const canevasBas = (
    <span className="canevas-bas">
      <span className="planche-choix-icone" title={t("bas.langue")} data-planche-choix="langue">
        <IconeSandbox nom="langue" />
        <ChoixLangue className="canevas-langue" />
      </span>
      <span className="planche-choix-icone" title={t("bas.peripherique")} data-planche-choix="peripherique">
        <IconeSandbox nom="peripherique" />
        <ChoixPeripherique ui={ui} />
      </span>
    </span>
  );
  /** Flèches de direction : touches modificatrices (ordinateur tactile) ou panneau Instructeur (téléphone). */
  // Tirage d'arête (D-197) : au téléphone, les flèches (verrou d'axe, ↓ = allonger) entrent dans la barre de modificateurs
  // au lieu du seul panneau Instructeur, pour que le geste se fasse au doigt sans détour.
  const etatTirage = etatMachineRef.current as { readonly etape?: number; readonly aretes?: readonly unknown[] } | null;
  const flechesAuToucher = outilId === "pousser-tirer" && etatTirage?.etape === 2 && (etatTirage.aretes?.length ?? 0) > 0;
  const boutonsFleches = () =>
    boutonsTouches([
      ["FlecheGauche", "←", t("planche.mod.gauche")],
      ["FlecheHaut", "↑", t("planche.mod.haut")],
      ["FlecheDroite", "→", t("planche.mod.droite")],
      ["FlecheBas", "↓", t("planche.mod.bas")],
    ]);
  const fleches = (
    <span className="planche-fleches" role="group" aria-label={t("planche.mod.fleches")}>
      {boutonsFleches()}
    </span>
  );

  /** Objets O-2 : une surface liée à ses arêtes sources est sélectionnée (à la racine, seul endroit des liens). */
  const lienSelectionne = () => !readOnly && dans === undefined && liensDesFaces(hist.present.modele, selectionRef.current).length > 0;
  /** Objets O-1 (D-203) : état de la sélection pour la disponibilité commune au menu, à la barre et au clavier. */
  const etatSelectionObjets = (): EtatSelectionObjets => {
    const m = hist.present.modele;
    const c = contexteDe(m, dans);
    const entites = selectionRef.current.filter((id) => genreAnnotation(id) === null);
    const objets = entites.filter((id) => c.occurrences[id]);
    const aretes = entites.filter((id) => c.aretes[id]);
    return {
      lecture: readOnly,
      entites: entites.length,
      objets: objets.length,
      verrouilles: objets.length > 0 && objets.every((id) => c.occurrences[id]!.verrouille),
      partages: objets.filter((id) => nombreOccurrences(m, c.occurrences[id]!.definition) > 1).length,
      aretes: aretes.length,
      courbes: new Set(aretes.map((id) => c.aretes[id]!.courbe).filter(Boolean)).size,
    };
  };
  const executerObjet = (id: IdCommandeObjet) => {
    if (id === "groupe") grouperSelection();
    else if (id === "composant") ouvrirDialogueComposant();
    else if (id === "eclater") eclaterSelection();
    else if (id === "rendre-unique") rendreUniqueSelection();
    else diviserCourbeSelection();
  };
  const executerNavigateur = (id: IdCommandeNavigateur) => (id === "groupe-vide" ? creerGroupeVide() : id === "deplacer-vers" ? ouvrirDeplacer() : ouvrirRenommage());
  /** Commandes du Navigateur avec leur disponibilité : barre du Navigateur et « Outils ▾ ». */
  const commandesNavigateur = () =>
    COMMANDES_NAVIGATEUR.map((c) => {
      const d = disponibiliteNavigateur(c.id, etatSelectionObjets());
      return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.objets.motif.vide"), executer: () => executerNavigateur(c.id) };
    });
  executerNavigateurRef.current = executerNavigateur;
  const etatVue = () => ({ entites: etatSelectionObjets().entites, isole: isolement !== null, dansObjet: dans !== undefined });
  const executerVue = (id: IdCommandeVue) => (id === "zoom-plus" || id === "zoom-moins" ? vueRef.current?.zoomer(PAS_ZOOM[id]) : id === "isoler" ? basculerIsolement() : basculerMasquerReste());
  const commandesVue = () =>
    COMMANDES_VUE.map((c) => {
      const d = disponibiliteVue(c.id, etatVue());
      const nom = c.id === "isoler" && isolement ? t("planche.menu.quitter-isolement") : t(c.libelle);
      return { id: c.id, picto: c.picto, nom, raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.objets.motif.vide"), executer: () => executerVue(c.id) };
    });
  executerVueRef.current = executerVue;
  // ——— Chantier Axes (AX-2) : barre « Axes et repères ». Le contexte de travail change ; le document jamais (AX-D3).
  const [demandeListeReperes, setDemandeListeReperes] = useState(0);
  const [demandeInspecteurReperes, setDemandeInspecteurReperes] = useState(0);
  const afficherBarreReperes = (visible: boolean) => etatUi.set((u) => ({ barreReperes: { ...u.barreReperes, visible } }));
  const occurrencesSelectionnees = () => {
    const c = contexteDe(hist.present.modele, dans);
    return selectionRef.current.filter((id) => c.occurrences[id] !== undefined);
  };
  const etatReperes = () => ({ contexte: histContexte.courant, precedents: histContexte.precedents.length, face: faceMonde() !== null, objet: occurrencesSelectionnees().length > 0, lecture: readOnly });
  const [origineOuverte, setOrigineOuverte] = useState(false);
  /** Revue Codex de #303 : chemin complet de chaque objet sélectionné (l'instance ouverte, pas la première rencontrée). */
  const cheminsSelection = (): Record<string, string[]> => Object.fromEntries(occurrencesSelectionnees().map((id) => [id, [...cheminRef.current, id]]));
  ouvrirOrigineRef.current = () => {
    setPanneau(null);
    setOrigineOuverte(true);
  };
  const apercuOrigine = useCallback((r: { origine: Vec3; x: Vec3; y: Vec3; z: Vec3 } | null) => vueRef.current?.poserApercuRepere(r), []);
  const appliquerOrigine = (opts: OptionsOrigine) => {
    const { resultat } = changerOrigineLot(histRef.current.present.modele, occurrencesSelectionnees(), opts, cheminsSelection());
    if (!resultat.ok) {
      setMessage(resultat.motif);
      return;
    }
    appliquer({ etat: null, modele: resultat.modele }, t("planche.origine.operation"));
    setMessage(t("planche.origine.fait", { touchees: String(resultat.apercus.reduce((n, a) => n + a.touchees, 0)) }));
    setOrigineOuverte(false);
  };
  const vueNormaleAuPlan = () => {
    const v = vueRef.current;
    if (!v) return;
    const pl = planDuContexte(histContexteRef.current.courant);
    const etat = v.etatCamera();
    const d = Math.max(3, Math.hypot(etat.position.x - etat.cible.x, etat.position.y - etat.cible.y, etat.position.z - etat.cible.z));
    // Cible ramenée sur le plan (la vue reste sur ce que l'on regardait) ; la caméra seule bouge (§ 4.2).
    const k = (etat.cible.x - pl.origine.x) * pl.normale.x + (etat.cible.y - pl.origine.y) * pl.normale.y + (etat.cible.z - pl.origine.z) * pl.normale.z;
    const cible = { x: etat.cible.x - pl.normale.x * k, y: etat.cible.y - pl.normale.y * k, z: etat.cible.z - pl.normale.z * k };
    v.appliquerScene({ position: { x: cible.x + pl.normale.x * d, y: cible.y + pl.normale.y * d, z: cible.z + pl.normale.z * d }, cible, champDeVision: etat.champDeVision, projection: etat.projection });
    setMessage(t("planche.reperes.vue-normale.fait"));
  };
  const executerRepere = (id: IdCommandeRepere) => {
    const d = disponibiliteRepere(id, etatReperes());
    if (!d.disponible) {
      setMessage(t(d.motif ?? "planche.reperes.motif.face"));
      return;
    }
    const courant = histContexteRef.current.courant;
    if (id === "choisir-repere") {
      afficherBarreReperes(true);
      setDemandeListeReperes((n) => n + 1);
    } else if (id === "aligner-repere") alignerAxes();
    else if (id === "pivoter-repere") {
      afficherBarreReperes(true);
      setDemandeInspecteurReperes((n) => n + 1);
    } else if (id === "plan-de-travail") changerContexte({ ...courant, plan: planSuivant(courant.plan) });
    else if (id === "verrouiller-plan") changerContexte({ ...courant, verrou: !courant.verrou });
    else if (id === "vue-normale-plan") vueNormaleAuPlan();
    else if (id === "repere-precedent") {
      const h = contextePrecedent(histContexteRef.current);
      if (h) poserContextes(h);
    } else if (id === "repere-modele") changerContexte(CONTEXTE_MODELE);
    else if (id === "affichage-axes") majOptions({ axes: !(vueRef.current?.lireOptions().axes ?? true) });
    else if (id === "enregistrer-repere") {
      setPanneau("reperes");
      setDemandeEnregistrerRepere((n) => n + 1);
    } else if (id === "gerer-reperes") setPanneau("reperes");
    else if (id === "origine-composant") ouvrirOrigineRef.current();
    rafraichir();
  };
  // ——— Chantier Axes (AX-3) : repères enregistrés — mutations du document (un pas d'historique chacune).
  const [demandeEnregistrerRepere, setDemandeEnregistrerRepere] = useState(0);
  const muterReperes = (r: { ok: true; modele: typeof hist.present.modele; id: string } | { ok: false; erreur: string }, operation: CleMessage): string | null => {
    if (!r.ok) return r.erreur;
    if (readOnly) return null;
    appliquer({ etat: null, modele: r.modele }, t(operation));
    return null;
  };
  const activerRepereEnregistre = (id: string) => {
    const r = histRef.current.present.modele.annotations?.reperes?.[id];
    if (r) changerContexte(contexteEnregistre(histContexteRef.current.courant, r));
  };
  const enregistrerRepereNouveau = (nom: string): string | null => {
    const c = histContexteRef.current.courant;
    const r = enregistrerRepere(histRef.current.present.modele, nom, repereDuContexte(c));
    const e = muterReperes(r, "planche.reperes.operation.enregistrer");
    if (!e && r.ok) activerRepereEnregistre(r.id);
    return e;
  };
  const enregistrerModificationsRepere = (): string | null => {
    const c = histContexteRef.current.courant;
    if (c.source.genre !== "temporaire" || !c.source.depuis) return null;
    const r = mettreAJourRepere(histRef.current.present.modele, c.source.depuis.id, repereDuContexte(c));
    const e = muterReperes(r, "planche.reperes.operation.maj");
    if (!e && r.ok) activerRepereEnregistre(r.id);
    return e;
  };
  const etatRepere = etatRepereActif(histContexte.courant, hist.present.modele);
  const nomActifRepere = nomRepereActif(histContexte.courant, hist.present.modele.annotations?.reperes ?? {}, t);
  const origineReperes = (o: Vec3): string | null => {
    const courant = histContexteRef.current.courant;
    const r = deplacerOrigine(repereDuContexte(courant), o);
    if (!r.ok) return r.message;
    changerContexte(contexteTemporaire(courant, r.repere));
    return null;
  };
  const pivoterReperes = (axe: NomAxe, base: BaseAxe, degres: number): string | null => {
    const courant = histContexteRef.current.courant;
    const r = pivoterRepere(repereDuContexte(courant), axe, base, (degres * Math.PI) / 180);
    if (!r.ok) return r.message;
    changerContexte(contexteTemporaire(courant, r.repere));
    return null;
  };
  /** Ligne d'état du contexte de travail (§ 4.1) : décrit l'état réel, mise à jour avant la saisie suivante. */
  const ligneReperes = t("planche.reperes.etat", {
    repere: `${nomActifRepere}${etatRepere === "modifie" ? ` (${t("planche.reperes.modifie")})` : ""}`,
    plan: libellePlan(histContexte.courant),
    portee: t(histContexte.courant.source.genre === "modele" ? "planche.reperes.portee.modele" : "planche.reperes.portee.travail"),
    unite: "m",
  });
  const verrouInapplicable = histContexte.courant.verrou && !verrouApplicable(outilId) ? t("planche.reperes.verrou.inapplicable", { outil: libelleOutil(outilId) }) : null;

  /** Lot 9 : exécution d'une entrée du registre au clavier, après la disponibilité de sa famille (mêmes motifs qu'ailleurs). */
  executerCommandeRef.current = (c: EntreeRegistre) => {
    if (masqueesRef.current.has(`commande:${c.id}`)) return;
    const s = etatSelectionObjets();
    if (c.famille === "repere") {
      executerRepere(c.id as IdCommandeRepere);
      return;
    }
    if (c.famille === "objet") {
      const id = c.id as IdCommandeObjet;
      if (disponibiliteObjet(id, s).disponible) executerObjet(id);
    } else if (c.famille === "navigateur") {
      const id = c.id as IdCommandeNavigateur;
      if (disponibiliteNavigateur(id, s).disponible) executerNavigateur(id);
    } else if (c.famille === "vue") {
      const id = c.id as IdCommandeVue;
      if (disponibiliteVue(id, etatVue()).disponible) executerVue(id);
    } else if (c.famille === "debit") executerDebit(c.id as IdCommandeDebit);
    else if (c.famille === "piece") executerPiece(c.id as IdCommandePiece);
    else if (c.famille === "controle") executerControle(c.id as IdCommandeControle);
    else if (c.famille === "dynamique") executerDynamique(c.id as IdCommandeDynamique);
    else if (c.famille === "emplacement") executerEmplacement(c.id as IdCommandeEmplacement);
    else if (c.famille === "scripts") executerScripts(c.id as IdCommandeScripts);
    else if (c.famille === "numerotation") executerNumerotation(c.id as IdCommandeNumerotation);
    else if (c.famille === "niveau") executerNiveau(c.id as IdCommandeNiveau);
    else if (c.famille === "local") executerLocal(c.id as IdCommandeLocal);
    else if (c.famille === "plan") executerPlan(c.id as IdCommandePlan);
    else if (c.famille === "mur") executerMur(c.id as IdCommandeMur);
    else if (c.famille === "accrochage") executerAccrochage(c.id as IdCommandeAccrochage);
    else if (c.famille === "balise") executerBalise(c.id as IdCommandeBalise);
    else if (c.famille === "scene") executerScene(c.id as IdCommandeScene);
    else if (c.famille === "gabarit") executerGabarit(c.id as IdCommandeGabarit);
    else if (c.famille === "echange") executerEchange(c.id as IdCommandeEchange);
    else if (c.famille === "version") executerVersion(c.id as IdCommandeVersion);
    else if (c.famille === "lien") detacherLienSelection();
    else if (dans !== undefined) fermerContexte(c.id as IdCommandeContexte);
  };
  etatVueRef.current = etatVue;
  etatSelectionObjetsRef.current = etatSelectionObjets;
  executerObjetRef.current = executerObjet;

  /** Commandes livrées (« Outils ▾ », favoris et regroupements de la grille) : disponibilité et exécution de leur famille. */
  const commandesListe = [
        ...COMMANDES_OBJETS.map((c) => {
          const d = disponibiliteObjet(c.id, etatSelectionObjets());
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.objets.motif.vide"), executer: () => executerObjet(c.id) };
        }),
        // Objets O-2 : Fermer / Fermer tout, grisés hors d'un groupe ou d'un composant.
        ...COMMANDES_CONTEXTE.map((c) => ({ id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: dans === undefined ? t("planche.contexte.motif") : null, executer: () => fermerContexte(c.id) })),
        // Objets O-2 : Détacher le lien (EX-UI-06), grisé sans surface liée sélectionnée.
        { id: COMMANDE_DETACHER_LIEN.id, picto: COMMANDE_DETACHER_LIEN.picto, nom: t(COMMANDE_DETACHER_LIEN.libelle), raccourci: COMMANDE_DETACHER_LIEN.raccourci, motif: lienSelectionne() ? null : t("planche.lien.motif"), executer: detacherLienSelection },
        // Objets O-4 : Nouveau groupe vide, Déplacer vers un groupe…, Renommer.
        ...commandesNavigateur(),
        // Objets O-5 : Isoler, Masquer le reste du modèle.
        ...commandesVue(),
        // Lot L17 (revue de #130) : les commandes de la pièce, mêmes disponibilités et exécution que le bloc de la pièce.
        ...COMMANDES_PIECE.map((c) => {
          const d = disponibiliteCommandePiece(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.piece.motif.piece"), executer: () => executerPiece(c.id) };
        }),
        // Lot L14 (revue de #128) : les cinq commandes de débit, mêmes disponibilités et exécution que le panneau.
        ...COMMANDES_DEBIT.map((c) => {
          const d = disponibiliteCommandeDebit(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.debit.motif.vide"), executer: () => executerDebit(c.id) };
        }),
        // Extension « Contrôle et nettoyage » : mêmes disponibilités et exécution que la barre de son panneau.
        ...COMMANDES_CONTROLE.map((c) => {
          const d = disponibiliteCommandeControle(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.controle.motif.rien"), executer: () => executerControle(c.id) };
        }),
        // Extension « Composants dynamiques » : mêmes disponibilités et exécution que la barre de son panneau.
        ...COMMANDES_DYNAMIQUE.map((c) => {
          const d = disponibiliteCommandeDynamique(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.dynamique.motif.selection"), executer: () => executerDynamique(c.id) };
        }),
        // Extension « Emplacement » : mêmes disponibilités et exécution que la barre de son panneau.
        ...COMMANDES_EMPLACEMENT.map((c) => {
          const d = disponibiliteCommandeEmplacement(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.emplacement.motif.arete"), executer: () => executerEmplacement(c.id) };
        }),
        // Extension « Scripts » : mêmes disponibilités et exécution que la barre de son panneau.
        ...COMMANDES_SCRIPTS.map((c) => {
          const d = disponibiliteCommandeScripts(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.scripts.motif.vide"), executer: () => executerScripts(c.id) };
        }),
        // Cas 2, lot 1 : numérotation en série, mêmes disponibilités et exécution que la barre de son panneau.
        ...COMMANDES_NUMEROTATION.map((c) => {
          const d = disponibiliteCommandeNumerotation(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.numeroter.motif.selection"), executer: () => executerNumerotation(c.id) };
        }),
        // Niveaux d'étage (cas 4) : mêmes disponibilités et exécution que la barre du panneau Niveaux.
        ...COMMANDES_NIVEAUX.map((c) => {
          const d = disponibiliteCommandeNiveau(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.niveaux.motif.choisi"), executer: () => executerNiveau(c.id) };
        }),
        ...COMMANDES_PLAN.map((c) => {
          const d = disponibiliteCommandePlan(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.plan.motif.vide"), executer: () => executerPlan(c.id) };
        }),
        ...COMMANDES_LOCAUX.map((c) => {
          const d = disponibiliteCommandeLocal(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.locaux.motif.face"), executer: () => executerLocal(c.id) };
        }),
        ...COMMANDES_MUR.map((c) => {
          const d = disponibiliteCommandeMur(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.mur.motif.aretes"), executer: () => executerMur(c.id) };
        }),
        // Cas 2, lot 2 : accrochage et saisie, mêmes disponibilités et exécution que les barres de leurs panneaux.
        ...COMMANDES_ACCROCHAGE.map((c) => {
          const d = disponibiliteCommandeAccrochage(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.accrochage.motif.mesure"), executer: () => executerAccrochage(c.id) };
        }),
        // Cas 2, lot 4 : balises, scènes et plans de coupe, gabarit d'agence.
        ...COMMANDES_BALISE.map((c) => {
          const d = disponibiliteCommandeBalise(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.balise.motif.courante"), executer: () => executerBalise(c.id) };
        }),
        ...COMMANDES_SCENE.map((c) => {
          const d = disponibiliteCommandeScene(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.scene.motif.plan"), executer: () => executerScene(c.id) };
        }),
        ...COMMANDES_GABARIT.map((c) => {
          const d = disponibiliteCommandeGabarit(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.gabarit.motif.choix"), executer: () => executerGabarit(c.id) };
        }),
        // Cas 2, lot 6 : panneau « Fichier natif et image ».
        ...COMMANDES_ECHANGE.map((c) => ({ id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: null, executer: () => executerEchange(c.id) })),
        // Cas 2, lot 7 : versions, jalons, comparaison, brouillon, fiche du projet.
        ...COMMANDES_VERSION.map((c) => {
          const d = disponibiliteCommandeVersion(c.id);
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.debit.motif.lecture"), executer: () => executerVersion(c.id) };
        }),
        // Chantier Axes (AX-2) : les commandes de la barre « Axes et repères », mêmes disponibilités et exécution.
        ...COMMANDES_REPERES.map((c) => {
          const d = disponibiliteRepere(c.id, etatReperes());
          return { id: c.id, picto: c.picto, nom: t(c.libelle), raccourci: c.raccourci, motif: d.disponible ? null : t(d.motif ?? "planche.reperes.motif.face"), executer: () => executerRepere(c.id) };
        }),
  ]
    .filter((c) => !masquees.has(`commande:${c.id}`))
    .map((c) => {
      const extension = extensionDeLaCommande(c.id);
      return { ...c, groupe: groupeDeCommande(c.id), ...(extension ? { extension } : {}) };
    });

  // ——— Barres d'outils nommées (25 novembre 2026, `barres-nommees.ts`) : livrées et personnelles, chacune une fois.
  const regroupements = prefsSandbox.preferences.regroupements;
  const barresNommees: BarreNommee[] = [
    ...barresLivrees(masquees),
    // Une barre par extension installée, à son nom : ses commandes, dans l'ordre de sa fiche.
    ...famillesInstallees.map((f): BarreNommee => ({ id: f.barre, origine: "extension", nom: f.nom, sections: [{ cle: "commandes", entrees: f.commandes.map((c) => c.id) }] })),
    ...barresPersonnelles(regroupements, masquees),
  ];
  const nomBarre = (b: BarreNommee) => b.nom ?? (b.nomCle ? t(b.nomCle) : b.id);
  const etatBarres = normaliserBarres(ui.barresOutils);
  /** Bouton d'une entrée de barre : outil du catalogue offert ou commande livrée ; une entrée inconnue n'est pas rendue. */
  const boutonDeBarre = (cle: string): BoutonBarre | null => {
    if (cle.startsWith("outil:")) {
      const o = outilsOfferts.find((x) => x.id === cle.slice(6));
      if (!o) return null;
      const r = raisonDe(o);
      return { cle, picto: pictoOutil(o.id), titre: titreOperation(o, r), actif: o.id === outilId, indisponible: r !== null, executer: () => choisirOutil(o.id) };
    }
    const c: CommandeListe | undefined = cle.startsWith("commande:") ? commandesListe.find((x) => x.id === cle.slice(9)) : cle.startsWith("extension:") ? commandesInstallees.find((x) => x.id === cle) : undefined;
    if (!c) return null;
    return { cle, picto: c.picto, ...(c.image ? { image: c.image } : {}), titre: c.motif ? `${c.nom} — ${c.motif}` : `${c.nom} (${afficherRaccourci(c.raccourci)})`, actif: false, indisponible: c.motif !== null, executer: () => { if (!c.motif) c.executer(); } };
  };
  /** Barres flottantes : affichées par leur interrupteur de la liste « Outils » ; au téléphone, la dernière seulement, rangée en bas. */
  // Seules les barres qui existent encore et portent au moins un bouton sont montées : une barre supprimée dont
  // l'identifiant est resté dans l'état ne prend pas la place de la dernière barre au téléphone, et une barre vide est
  // montée (donc placée) au moment où elle reçoit sa première entrée.
  const barresMontables = new Set(barresNommees.filter((b) => entreesDe(b).some((c) => boutonDeBarre(c) !== null)).map((b) => b.id));
  const barresOutils = barresRendues({ ...etatBarres, visibles: etatBarres.visibles.filter((id) => barresMontables.has(id)) }, etroit)
    .map((id) => barresNommees.find((b) => b.id === id))
    .filter((b): b is BarreNommee => b !== undefined)
    .map((b, rang) => (
      <BarreOutilsFlottante
        key={b.id}
        id={b.id}
        nom={nomBarre(b)}
        sections={b.sections.map((x) => {
          const section = x.section ? SECTIONS.find((y) => y.cle === x.section) : undefined;
          return { cle: x.cle, ...(section ? { numero: section.numero, libelle: t(section.message) } : {}), boutons: x.entrees.map(boutonDeBarre).filter((y): y is BoutonBarre => y !== null) };
        })}
        rang={rang}
        telephone={etroit}
        onFermer={() => afficherBarre(b.id, false)}
        reference={racineRef}
        fenetreCle={detache}
        onDocquee={setHautDocquee}
      />
    ));
  /** Lignes de la section « Barres d'outils » : nom, aperçu des icônes, interrupteur. */
  const lignesBarres: LigneBarre[] = barresNommees.map((b) => ({
    id: b.id,
    nom: nomBarre(b),
    origine: b.origine,
    ...(b.groupe ? { groupe: b.groupe } : {}),
    affichee: etatBarres.visibles.includes(b.id),
    apercu: entreesDe(b)
      .map(boutonDeBarre)
      .filter((x): x is BoutonBarre => x !== null)
      .map((x) => ({ cle: x.cle, picto: x.picto, nom: x.titre, ...(x.image ? { image: x.image } : {}) })),
  }));
  const etiquetteOutil = (id: string) => {
    const b = barresNommees.find((x) => x.id === barreDeLOutil(id));
    return b ? { id: b.id, nom: nomBarre(b) } : null;
  };
  const ouvrirBarreEditee = (groupe: string | null) => {
    setBarreEditee((e) => ({ groupe, jeton: e.jeton + 1 }));
    setPanneau("personnaliser");
  };
  /** « Dupliquer » : la barre livrée devient une barre personnelle (regroupement du compte), affichée et ouverte à la modification. */
  const dupliquerBarre = (id: string) => {
    const b = barresNommees.find((x) => x.id === id);
    if (!b || regroupements.length >= MAX_REGROUPEMENTS) return;
    const nom = nomDeCopie(nomBarre(b), regroupements.map((g) => g.nom), MAX_NOM_REGROUPEMENT);
    const groupe = idRegroupement(nom, regroupements.map((g) => g.id));
    const entrees = [...new Set(entreesDe(b))].filter((c) => CLES_PERSONNALISABLES.includes(c));
    prefsSandbox.modifier({ ...prefsSandbox.preferences, regroupements: [...regroupements, { id: groupe, nom, entrees }] });
    afficherBarre(idBarreGroupe(groupe), true);
    ouvrirBarreEditee(groupe);
  };
  /**
   * Fenêtre « Extensions » du menu ☰ : une carte par extension livrée, pictogramme repris de l'une de ses entrées ; la
   * bascule s'applique tout de suite et rejoint les préférences du compte.
   */
  // Une extension vient d'être désactivée : son panneau ouvert se ferme et son outil actif rend la main à Sélectionner.
  useEffect(() => {
    if (masquees.size === 0) return;
    if (panneau && masquees.has(`panneau:${panneau}`)) setPanneau(null);
    if (masquees.has(`outil:${outilId}`)) demandeOutilRef.current("selection");
  }, [masquees, panneau, outilId, setPanneau]);
  const pluriel = (n: number, un: "extensions.contenu.outil" | "extensions.contenu.commande" | "extensions.contenu.panneau", plusieurs: "extensions.contenu.outils" | "extensions.contenu.commandes" | "extensions.contenu.panneaux") =>
    n === 0 ? null : n === 1 ? t(un) : t(plusieurs, { n: String(n) });
  const extensionsMenu: ExtensionsMenu = {
    // Une extension retirée par la plateforme n'est plus proposée : elle quitte la fenêtre.
    liste: EXTENSIONS_SANDBOX.filter((x) => prefsSandbox.catalogue.find((f) => f.id === x.id)?.etat !== "retiree").map((x) => {
      const n = contenuExtension(x);
      return {
        id: x.id,
        nom: t(`extension.${x.id}` as "extension.bois"),
        description: t(`extension.${x.id}.description` as "extension.bois.description"),
        picto: entreeDeCle(x.pictogramme)!.pictogramme,
        contenu: [pluriel(n.outil, "extensions.contenu.outil", "extensions.contenu.outils"), pluriel(n.commande, "extensions.contenu.commande", "extensions.contenu.commandes"), pluriel(n.panneau, "extensions.contenu.panneau", "extensions.contenu.panneaux")].filter(Boolean).join(" · "),
        active: extensionActive(x.id, extensionsEffectives),
      };
    }),
    basculer: (id, active) => prefsSandbox.modifier({ ...prefsSandbox.preferences, extensions: basculerExtension(prefsSandbox.preferences.extensions, id, active) }),
    enAttente: prefsSandbox.etat === "copie" || prefsSandbox.etat === "defaut",
  };

  /** Même liste « Outils », deux déclencheurs indépendants : le bouton de la barre du haut et la loupe de la barre verticale. */
  const listeOutils = (variante: "outils" | "loupe") => (
    <BoutonOutils
      variante={variante}
      catalogue={outilsOfferts}
      commandes={commandesListe}
      famillesExtensions={famillesInstallees}
      outilId={outilId}
      raison={raisonDe}
      onChoisir={choisirOutil}
      barres={lignesBarres}
      etiquette={etiquetteOutil}
      onAfficherBarre={afficherBarre}
      extensions={extensionsMenu.liste.map((x) => ({ id: x.id, nom: x.nom, picto: x.picto, active: x.active }))}
      onBasculerExtension={extensionsMenu.basculer}
      onReinitialiser={() => etatUi.set((u) => ({ barresOutils: reinitialiserDisposition(normaliserBarres(u.barresOutils)) }))}
      reinitialisable={Object.keys(etatBarres.positions).length > 0}
      onNouvelleBarre={() => ouvrirBarreEditee(null)}
      onDupliquerBarre={regroupements.length < MAX_REGROUPEMENTS ? dupliquerBarre : undefined}
      onModifierBarre={ouvrirBarreEditee}
    />
  );

  /**
   * Commandes de la barre d'actions (D-195). À l'ordinateur, le centre du bandeau d'en-tête ne porte que ce qui sert quel
   * que soit l'outil (26 novembre 2026, maquette validée par le maître d'ouvrage) : Annuler · Rétablir | Cadrer · Zoom ;
   * les commandes de groupe (Grouper, Composant, Éclater, Unique, Diviser, Isoler) restent dans la barre « Groupe » de la
   * liste Outils, au clic droit et au clavier. « Détacher » à droite du bandeau. Au téléphone, la barre flottante est
   * inchangée (Cadrer, zoom − / +, commandes de groupe, Détacher).
   */
  const libelleDetacher = detache === "non" ? t("planche.detacher") : detache === "fenetre" ? t("planche.rattacher") : t("planche.plein-ecran.quitter");
  const actionCadrer: ActionBarre = { id: "cadrer", picto: entreeOutil("zoom-etendu").pictogramme, libelle: t("actions.cadrer"), texte: t("actions.cadrer"), titre: `${t("actions.cadrer")} (${afficherRaccourci(raccourciOutil(outilParId("zoom-etendu")!)!)})`, onClick: () => choisirOutil("zoom-etendu"), attributs: { "data-planche-cadrer": "" } };
  // Bandeau (26 novembre 2026) : Annuler / Rétablir du brouillon (Ctrl Z / Ctrl Y), grisés quand il n'y a rien à faire ;
  // l'infobulle nomme l'opération ; l'outil Zoom (Z) à côté de Cadrer, enfoncé quand il est l'outil courant.
  const opAnnuler = operationAAnnuler(histRef.current);
  const opRetablir = operationARetablir(histRef.current);
  const groupeHistorique: ActionBarre[] = [
    { id: "annuler", picto: "annuler" as const, libelle: t("planche.annuler"), texte: t("planche.annuler"), titre: opAnnuler ? t("planche.annuler.titre", { operation: opAnnuler }) : `${t("planche.annuler")} — ${t("planche.rien.annuler")}`, onClick: annulerPas, disabled: readOnly || opAnnuler === null, attributs: { "data-planche-annuler": "" } },
    { id: "retablir", picto: "retablir" as const, libelle: t("planche.retablir"), texte: t("planche.retablir"), titre: opRetablir ? t("planche.retablir.titre", { operation: opRetablir }) : `${t("planche.retablir")} — ${t("planche.rien.retablir")}`, onClick: retablirPas, disabled: readOnly || opRetablir === null, attributs: { "data-planche-retablir": "" } },
  ];
  const actionZoom: ActionBarre[] = ((o) =>
    o ? [{ id: "zoom", picto: pictoOutil(o.id), libelle: nomOutil(o), texte: nomOutil(o), titre: `${nomOutil(o)} (${afficherRaccourci(raccourciOutil(o)!)})`, onClick: () => choisirOutil(o.id), pressed: outilId === o.id, attributs: { "data-planche-action-outil": o.id } }] : [])(outilParId("zoom"));
  const zoomPas: ActionBarre[] = [
    ...(tactile || etroit || pointeurGrossier
      ? (["zoom-moins", "zoom-plus"] as const)
          .map((id) => COMMANDES_VUE.find((c) => c.id === id)!)
          .map((c) => ({ id: c.id, picto: c.picto, libelle: t(c.libelle), titre: `${t(c.libelle)} (${afficherRaccourci(c.raccourci)})`, onClick: () => executerVue(c.id), attributs: { "data-planche-zoom": c.id === "zoom-plus" ? "plus" : "moins" } }))
      : []),
  ];
  // Maquette validée : Cadrer · Zoom seulement ; zoom − / + restent dans la barre flottante du téléphone.
  const groupeVue: ActionBarre[] = [actionCadrer, ...actionZoom];
  const commandeObjet = (c: (typeof COMMANDES_OBJETS)[number]): ActionBarre[] => {
    const d = disponibiliteObjet(c.id, etatSelectionObjets());
    // Commandes d'arête (O-3) : présentes dans la barre seulement quand elles s'appliquent.
    if (c.contextuelle && !d.disponible) return [];
    const nom = t(c.libelle);
    return [{
      id: c.id,
      picto: c.picto,
      libelle: nom,
      // Nom visible sous l'icône (règle d'or : bouton nommé au toucher, pas seulement un pictogramme).
      texte: t(c.court),
      titre: d.disponible ? `${nom} (${afficherRaccourci(c.raccourci)})` : `${nom} — ${t(d.motif ?? "planche.objets.motif.vide")}`,
      onClick: () => executerObjet(c.id),
      disabled: !d.disponible,
      attributs: { "data-planche-commande": c.id },
    }];
  };
  const actionDiviser: ActionBarre[] = [
    // Lot 6 : arête sélectionnée → l'outil Diviser (Maj+D), qui remplace la commande en double du même nom.
    ...(((o) => {
      if (!o || (etatSelectionObjets().aretes ?? 0) === 0) return [];
      const raison = raisonDe(o);
      const nom = nomOutil(o);
      const titre = raison ? `${nom} — ${raison}` : `${nom} (${afficherRaccourci(raccourciOutil(o)!)})`;
      return [{ id: "diviser", picto: pictoOutil(o.id), libelle: nom, texte: t("planche.objets.court.diviser"), titre, onClick: () => choisirOutil(o.id), disabled: raison !== null, attributs: { "data-planche-action-outil": o.id } }];
    })(outilParId("diviser"))),
  ];
  const actionIsoler: ActionBarre[] = [
    // Objets O-5 : Isoler, présent avec une sélection ou pendant l'isolement (enfoncé), qui le lève.
    ...commandesVue()
      .filter((c) => c.id === "isoler" && c.motif === null)
      .map((c) => ({
        id: c.id,
        picto: c.picto,
        libelle: c.nom,
        texte: t("planche.objets.court.isoler"),
        titre: `${c.nom} (${afficherRaccourci(c.raccourci)})`,
        onClick: c.executer,
        pressed: isolement !== null,
        attributs: { "data-planche-commande": c.id },
      })),
  ];
  const actionDetacher: ActionBarre = {
    id: "detacher",
    picto: detache === "non" ? "detacher" : "rattacher",
    libelle: libelleDetacher,
    titre: detache === "non" ? t("planche.detacher.aide") : libelleDetacher,
    texte: detache === "non" ? t("planche.detacher.court") : detache === "fenetre" ? t("planche.rattacher.court") : t("planche.plein-ecran.quitter.court"),
    onClick: () => (detache === "non" ? void detacher() : rattacher()),
    attributs: { "data-planche-detacher": "" },
  };
  // Droite du bandeau : « Détacher » dans la page ; ✕ « Fermer et rattacher » dans la fenêtre détachée (plus de
  // « Rattacher ») ; « Quitter le plein écran » quand la Planche a été mise en plein écran faute de fenêtre.
  const actionBandeauDroite: ActionBarre =
    detache === "fenetre"
      ? { id: "fermer-rattacher", picto: "fermer" as const, libelle: t("planche.fermer-rattacher"), titre: t("planche.fermer-rattacher"), onClick: rattacher, attributs: { "data-planche-detacher": "", "data-planche-fermer-rattacher": "" } }
      : actionDetacher;
  /**
   * Menus du bandeau (26 novembre 2026, ordinateur) : Édition, Affichage, Caméra, Fenêtres. Chaque entrée appelle une
   * fonction que la Planche offre déjà (raccourci, clic droit, panneaux Styles / Affichage / Scènes, colonne) ; rien de
   * nouveau n'est écrit dans la Planche par Affichage et Caméra (R10).
   */
  const nbSelection = selectionRef.current.length;
  const occsSelection = selectionDe("occurrences").length;
  const cmd = (id: string, libelle: string, onClick: () => void, extra: { raccourci?: string; disabled?: boolean; coche?: boolean } = {}): EntreeMenuBandeau => ({ genre: "commande", id, libelle, onClick, ...extra });
  const caseAffichage = (id: string, libelle: string, cle: "aretes" | "aretesArriere" | "rayonsX" | "sol" | "axes" | "guides" | "plansDeCoupe" | "couleurParBalise" | "objetsMasques"): EntreeMenuBandeau => ({ genre: "case", id, libelle, coche: options[cle], onClick: () => majOptions({ [cle]: !options[cle] }) });
  const scenesModele = Object.values(hist.present.modele.annotations?.scenes ?? {});
  const outilZoomEtendu = outilParId("zoom-etendu");
  const menusBandeau: readonly MenuBandeau[] = [
    {
      id: "edition",
      libelle: t("planche.menus.edition"),
      entrees: [
        cmd("annuler", t("planche.annuler"), annulerPas, { raccourci: afficherRaccourci("Ctrl+Z"), disabled: readOnly || opAnnuler === null }),
        cmd("retablir", t("planche.retablir"), retablirPas, { raccourci: afficherRaccourci("Ctrl+Y"), disabled: readOnly || opRetablir === null }),
        { genre: "separateur" },
        cmd("couper", t("planche.menus.couper"), () => copierSelection(true), { raccourci: afficherRaccourci("Ctrl+X"), disabled: readOnly || nbSelection === 0 }),
        cmd("copier", t("planche.menus.copier"), () => copierSelection(false), { raccourci: afficherRaccourci("Ctrl+C"), disabled: nbSelection === 0 }),
        cmd("coller", t("planche.menu.coller"), collerDepuisMenu, { raccourci: afficherRaccourci("Ctrl+V"), disabled: readOnly }),
        { genre: "separateur" },
        cmd("tout-selectionner", t("planche.menus.tout-selectionner"), () => etendre("tout"), { raccourci: afficherRaccourci("Ctrl+A") }),
        cmd("inverser-selection", t("planche.menu.sel.inverser"), () => etendre("inverser"), { raccourci: afficherRaccourci("Ctrl+Maj+I") }),
        cmd("meme-balise", t("planche.menu.sel.balise"), () => etendre("meme-balise"), { disabled: occsSelection === 0 }),
        cmd("meme-materiau", t("planche.menu.sel.materiau"), () => etendre("meme-materiau"), { disabled: nbSelection === 0 }),
        { genre: "separateur" },
        cmd("effacer", t("planche.menu.effacer"), effacerSelection, { disabled: readOnly || nbSelection === 0 }),
        cmd("masquer", t("planche.menu.masquer"), masquerSelection, { disabled: readOnly || nbSelection === 0 }),
        cmd("verrouiller", t("planche.menu.verrouiller"), () => verrouillerSelection(true), { disabled: readOnly || occsSelection === 0 }),
        cmd("deverrouiller", t("planche.menu.deverrouiller"), () => verrouillerSelection(false), { disabled: readOnly || occsSelection === 0 }),
      ],
    },
    {
      id: "affichage",
      libelle: t("planche.menus.affichage"),
      entrees: [
        { genre: "titre", libelle: t("planche.styles.mode") },
        ...(["ombre", "monochrome", "filaire", "lignes-cachees"] as const).map((m): EntreeMenuBandeau => ({ genre: "radio", id: `mode-${m}`, libelle: t(`planche.styles.mode.${m}`), coche: options.modeFace === m, onClick: () => majOptions({ modeFace: m }) })),
        { genre: "separateur" },
        caseAffichage("aretes", t("planche.styles.aretes"), "aretes"),
        caseAffichage("aretes-arriere", t("planche.styles.aretes-arriere"), "aretesArriere"),
        caseAffichage("rayons-x", t("planche.styles.rayons-x"), "rayonsX"),
        caseAffichage("sol", t("planche.styles.sol"), "sol"),
        { genre: "separateur" },
        caseAffichage("axes", t("planche.affichage.axes"), "axes"),
        caseAffichage("guides", t("planche.affichage.guides"), "guides"),
        caseAffichage("plans", t("planche.affichage.plans"), "plansDeCoupe"),
        caseAffichage("couleur-balise", t("planche.affichage.couleur-balise"), "couleurParBalise"),
        caseAffichage("objets-masques", t("planche.affichage.objets-masques"), "objetsMasques"),
        { genre: "separateur" },
        cmd("reafficher-tout", t("planche.menus.reafficher-tout"), () => reafficher("tout"), { disabled: readOnly }),
        cmd("plus-affichage", t("planche.menus.plus-options"), () => setPanneau("affichage")),
      ],
    },
    {
      id: "camera",
      libelle: t("planche.menus.camera"),
      entrees: [
        { genre: "titre", libelle: t("planche.scenes.vues") },
        ...(["dessus", "sud", "est", "nord", "ouest", "dessous", "iso"] as const).map((v) => cmd(`vue-${v}`, t(`planche.scenes.vue.${v}`), () => vueStandard(v))),
        { genre: "separateur" },
        { genre: "radio", id: "perspective", libelle: t("planche.scenes.perspective"), coche: camera.projection === "perspective", onClick: () => poserProjection("perspective") },
        { genre: "radio", id: "parallele", libelle: t("planche.scenes.parallele"), coche: camera.projection === "parallele", onClick: () => poserProjection("parallele") },
        cmd("champ", `${t("planche.scenes.champ")}…`, () => setPanneau("scenes")),
        { genre: "separateur" },
        cmd("zoom-selection", t("planche.menu.zoom-selection"), zoomSelection, { disabled: nbSelection === 0 }),
        ...(outilZoomEtendu ? [cmd("zoom-etendu", nomOutil(outilZoomEtendu), () => choisirOutil("zoom-etendu"), { raccourci: afficherRaccourci(raccourciOutil(outilZoomEtendu)!) })] : []),
        ...(scenesModele.length > 0 ? [{ genre: "separateur" } as const, { genre: "titre", libelle: t("planche.scenes.mes") } as const, ...scenesModele.map((sc) => cmd(`scene-${sc.id}`, sc.nom, () => appliquerScene(sc)))] : []),
      ],
    },
    {
      id: "fenetres",
      libelle: t("planche.menus.fenetres"),
      entrees: [
        ...COLONNE.filter(({ id }) => !masquees.has(`panneau:${id}`)).map(({ id }) => cmd(`panneau-${id}`, t(`panneau.${id}` as "panneau.info-entite"), () => setPanneau(panneau === id ? null : id), { coche: panneau === id })),
        ...(panneauxInstalles.length > 0
          ? [{ genre: "titre", libelle: t("planche.menus.extensions") } as const, ...panneauxInstalles.map((x) => cmd(`panneau-${x.cle}`, x.titre, () => setPanneauExtension(panneauExtensionOuvert?.cle === x.cle ? null : { extension: x.paquet.fiche.id, panneau: x.id }), { coche: panneauExtensionOuvert?.cle === x.cle }))]
          : []),
      ],
    },
    {
      id: "sites",
      libelle: t("planche.menus.sites"),
      entrees: ORDRE_ARTICLES.map((a): EntreeMenuBandeau =>
        a === "separateur" ? { genre: "separateur" } : cmd(`sites-${a}`, t(`planche.sites.${a}` as "planche.sites.nouveau"), sitesProjet.actions[a as ArticleSites], { disabled: !sitesProjet.disponible[a as ArticleSites] || sitesProjet.occupe || (readOnly && a !== "exporter") }),
      ),
    },
  ];
  const barreActions = etroit ? (
    <BarreActions
      // Téléphone : même barre flottante, même ordre qu'avant.
      autres={[actionCadrer, ...zoomPas, ...actionDiviser, ...COMMANDES_OBJETS.flatMap(commandeObjet), ...actionIsoler, actionDetacher]}
      reference={racineRef}
      reserve={{ bas: ".planche-volet, [data-planche-pied], [data-barre-outils-docquee]", droite: ".planche-colonne", gauche: ".planche-outils, .planche-recherche-carte, [data-planche-menu-principal]" }}
      fenetreCle={`${detache}|${hautDocquee ?? ""}`}
    />
  ) : null;

  const carteDetache =
    detache === "fenetre" ? (
      <div className="planche-detache-fond" data-planche-detache-fond>
        <div className="planche-detache" role="status" data-planche-detache-carte>
          <h3>{t("planche.detache.titre")}</h3>
          <p>{t("planche.detache.texte")}</p>
          <div className="barre-groupe">
            <button type="button" className="planche-detache-afficher" onClick={() => fenetreRef.current?.focus()}>
              {t("planche.detache.afficher")}
            </button>
            <button type="button" onClick={rattacher} data-planche-rattacher>
              {t("planche.rattacher")}
            </button>
          </div>
          <p className="inspecteur-aide">{t("planche.detache.aide")}</p>
        </div>
      </div>
    ) : null;

  // Écran tactile : l'équivalent du survol de la colonne — un toucher sur elle (ou sur le chevron) fait paraître le chevron
  // pendant DUREE_COLONNE_TOUCHEE ms, puis il disparaît ; chaque nouveau toucher relance le délai.
  const [colonneTouchee, setColonneTouchee] = useState(false);
  const colonneToucheeMinuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toucherColonne = useCallback((e: { pointerType: string }) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if (colonneToucheeMinuterie.current) clearTimeout(colonneToucheeMinuterie.current);
    setColonneTouchee(true);
    colonneToucheeMinuterie.current = setTimeout(() => setColonneTouchee(false), DUREE_COLONNE_TOUCHEE);
  }, []);
  useEffect(() => () => {
    if (colonneToucheeMinuterie.current) clearTimeout(colonneToucheeMinuterie.current);
  }, []);

  // Chevron de la colonne : centré sur sa hauteur et collé à son bord gauche, recalculé quand elle change de taille.
  useLayoutEffect(() => {
    const n = colonneRef.current;
    const r = racineRef.current;
    if (!n || !r) return;
    const placer = () => {
      const a = n.getBoundingClientRect();
      // Mesuré depuis la zone « vue » (sous le bandeau d'en-tête), qui est le bloc conteneur du chevron.
      const b = (r.querySelector("[data-planche-cadre]") ?? r).getBoundingClientRect();
      r.style.setProperty("--colonne-bascule-droite", `${Math.round(b.right - a.left)}px`);
      r.style.setProperty("--colonne-bascule-haut", `${Math.round(a.top - b.top + a.height / 2)}px`);
      // Triade d'orientation : sur l'axe vertical des boutons de la colonne, juste au-dessus d'elle (coin haut droit).
      const picto = n.querySelector("[data-planche-panneau-icone] .canevas-picto")?.getBoundingClientRect();
      const vue = hoteRef.current?.getBoundingClientRect();
      vueRef.current?.ancrerTriade(picto && vue && picto.width > 0 ? { x: picto.left + picto.width / 2 - vue.left, bas: a.top - vue.top } : null);
    };
    placer();
    const Observateur = (n.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver ?? globalThis.ResizeObserver;
    const obs = Observateur ? new Observateur(placer) : null;
    obs?.observe(n);
    obs?.observe(r);
    return () => obs?.disconnect();
  }, [colonneRepliee, detache]);

  // La Planche est rendue dans sa porte (portail) : dans la page, la porte est posée dans `emplacement` ; détachée,
  // elle vit dans la fenêtre séparée et la carte d'état prend sa place ici.
  const planche = (
    <div ref={racineRef} className={`planche${tactile ? " planche-tactile" : ""}${volet ? " volet-ouvert" : ""}${outilsReplies ? " outils-replies" : ""}${colonneRepliee ? " colonne-repliee" : ""}${colonneTouchee ? " colonne-touchee" : ""}${detache !== "non" ? " est-detache" : ""}${dans !== undefined ? " dans-contexte" : ""}${isolement ? " est-isole" : ""}`} data-planche data-outil-actif={outilId} data-planche-detache={detache}>
      <div className="planche-vue-cadre" data-planche-cadre>
        <div
          ref={hoteRef}
          className="planche-vue"
          tabIndex={0}
          role="application"
          aria-label={t("planche.vue")}
          aria-roledescription="zone de dessin"
          // Lot 4 : curseur propre à l'outil actif (pictogramme et croix au point actif).
          style={{ cursor: outilExtensionActif ? outilExtensionActif.curseur : lireCleOutilExtension(outilId) ? "crosshair" : curseurOutil(outilId, pictoOutil(outilId)) }}
          data-planche-vue
          data-planche-curseur={outilId}
        >
          {webgl === "indisponible" && <p className="planche-webgl" role="alert">{t("planche.webgl")}</p>}
          {cadreImage && (
            <div className="planche-cadre-image" style={{ left: cadreImage.x, top: cadreImage.y, width: cadreImage.l, height: cadreImage.h }} aria-hidden="true" data-planche-cadre-image>
              <span>{t("planche.echange.image.cadre", { largeur: String(tailleImage.largeur), hauteur: String(tailleImage.hauteur) })}{imageTransparente ? t("planche.echange.image.fond") : ""}</span>
            </div>
          )}
        </div>
        <AvisExtensions avis={avisExtensions} onFermer={(cle) => setAvisExtensions((liste) => liste.filter((a) => a.cle !== cle))} />
        {consultation ? (
          <div className="planche-bandeau-version planche-bandeau-consultation" role="status" data-planche-consultation={consultation.jalon?.id ?? "courante"}>
            {t("planche.lecture.bandeau", { quoi: consultation.jalon ? t("planche.lecture.jalon", { nom: consultation.jalon.nom, indice: consultation.jalon.indice ? ` (${consultation.jalon.indice})` : "" }) : `« ${nomCourant} »` })} · {afficherRaccourci(raccourciConsultation)}
          </div>
        ) : (
          originalBrouillon && (
            <div className="planche-bandeau-version planche-bandeau-brouillon" role="status" data-planche-brouillon-bandeau>
              {t("planche.brouillon.bandeau", { nom: nomAffiche(originalBrouillon) })}
            </div>
          )
        )}
        {deuxTemps && (
          <div className="planche-deux-temps" role="status" aria-live="polite" data-planche-deux-temps>
            <p>
              <b>{afficherRaccourci(ENTREE_DEUX_TEMPS)}…</b> {t("planche.deux-temps.puis")}
            </p>
            <ul>
              {COMMANDES_DEUX_TEMPS.map((c) => (
                <li key={c.id} data-planche-deux-temps-commande={c.id}>
                  <kbd>{afficherRaccourci(secondTemps(c.raccourci) ?? "")}</kbd> {t(c.libelle)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Bandeau d'en-tête (24 novembre 2026, à la manière de l'UI Shell de Carbon, sans logo ni marque) : 48 px sombres en
          haut de la Planche, le menu dans le carré gauche, puis « Planche » et le nom de la Planche ouverte ; même bandeau dans
          la page et en fenêtre détachée. Au téléphone, le bandeau s'efface (display: contents) et le menu reste une carte
          flottante déplaçable (appui de 2 s), comme avant. L'état d'enregistrement reste annoncé aux lecteurs d'écran ;
          seule une erreur d'enregistrement s'affiche. */}
      <div className="planche-bandeau" role="group" aria-label={t("planche.bandeau")} data-planche-bandeau>
        <MenuPlanche planches={indexPlanches.planches} courante={plancheDe(indexPlanches)} etat={etatSauvegarde} actions={actionsMenu} extensions={extensionsMenu} deplacable={etroit} />
        <p className="planche-bandeau-nom" data-planche-bandeau-nom>
          <span className="planche-bandeau-prefixe" translate="no">{t("planche.bandeau.prefixe")}</span>{!nomDansFil && <> <span>{nomCourant}</span></>}
        </p>
        {!etroit && <MenusBandeau menus={menusBandeau} />}
        {!etroit && <ActionsBandeau groupes={[groupeHistorique, groupeVue]} />}
        {!etroit && (
          <div className="planche-bandeau-droite" data-planche-bandeau-droite>
            <BoutonBandeau a={actionBandeauDroite} />
          </div>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-planche-brouillon data-sauvegarde={etatSauvegarde}>
        {t(`planche.sauvegarde.${etatSauvegarde}`)}
      </p>
      {etatSauvegarde === "erreur" && (
        <p className="planche-sauvegarde-erreur" role="alert" data-planche-sauvegarde-erreur>
          <span>{t("planche.sauvegarde.erreur")}</span>
          <button type="button" onClick={() => (brouillonCharge ? setEssaiSauvegarde((n) => n + 1) : setEssaiLecture((n) => n + 1))}>{t("planche.sauvegarde.reessayer")}</button>
        </p>
      )}
      {barresOutils}
      {origineOuverte && (
        <PanneauOrigineComposant
          modele={hist.present.modele}
          occurrences={occurrencesSelectionnees()}
          chemins={cheminsSelection()}
          contexte={histContexte.courant}
          lecture={readOnly}
          separateurDecimal={SEPARATEUR_DECIMAL}
          onApercu={apercuOrigine}
          onAppliquer={appliquerOrigine}
          onFermer={() => setOrigineOuverte(false)}
        />
      )}
      {ui.barreReperes.visible && (
        <BarreReperes
          contexte={histContexte.courant}
          precedents={histContexte.precedents.length}
          face={faceMonde() !== null}
          outilId={outilId}
          telephone={etroit}
          separateurDecimal={SEPARATEUR_DECIMAL}
          reference={racineRef}
          fenetreCle={detache}
          demandeListe={demandeListeReperes}
          demandeInspecteur={demandeInspecteurReperes}
          enregistres={reperesEnregistres(hist.present.modele)}
          nomActif={nomActifRepere}
          modifie={etatRepere === "modifie"}
          onActiverEnregistre={activerRepereEnregistre}
          onCommande={executerRepere}
          onPlacer={() => choisirOutil("axes")}
          onOrigine={origineReperes}
          onPivoter={pivoterReperes}
          onPlan={(pl: PlanRepere) => changerContexte({ ...histContexteRef.current.courant, plan: pl })}
          onVerrou={(v: boolean) => changerContexte({ ...histContexteRef.current.courant, verrou: v })}
          onFermer={() => afficherBarreReperes(false)}
        />
      )}
      {barreActions}

      {/* Volet : au bureau, `display: contents` (barre d'outils à gauche, pied en bas, comme avant) ; au téléphone,
          un seul volet bas dans le flux — outils en rangée, consigne, touches, Mesures — rien ne recouvre le dessin. */}
      <div className="planche-volet" ref={voletRef} data-planche-volet>
      <div className="planche-poignee" aria-hidden="true">
        <span />
      </div>
      <div className="planche-recherche-carte">
        {listeOutils("loupe")}
      </div>
      <div ref={railRef} onKeyDown={naviguerRail} className="planche-outils" role="toolbar" aria-label={t("planche.outils")} aria-orientation="vertical" data-planche-outils-replies={outilsReplies}>
        <button type="button" className="outil outil-fixe-haut planche-outils-bascule" aria-expanded={!outilsReplies} onClick={() => setOutilsReplies(!outilsReplies)} title={outilsReplies ? t("planche.outils.deplier") : t("planche.outils.replier")} aria-label={outilsReplies ? t("planche.outils.deplier") : t("planche.outils.replier")} data-planche-outils-bascule>
          <IconeSandbox nom={outilsReplies ? "deplier" : "replier"} className="outil-picto" />
          <span className="outil-libelle" aria-hidden="true">{t("planche.outils.replier")}</span>
        </button>
        {barre.map((o) => boutonOutil(o))}
        {recentOutil && (
          <>
            <span className="planche-separateur" role="separator" />
            {boutonOutil(recentOutil)}
          </>
        )}
        <button type="button" className="outil outil-fixe-bas" aria-expanded={grille} aria-controls={grille ? "planche-grille" : undefined} onClick={() => setGrille(!grille)} title={t("planche.plus")} aria-label={t("planche.plus")} data-planche-plus>
          <IconeSandbox nom="plusOutils" className="outil-picto" />
          <span className="outil-libelle" aria-hidden="true">{t("planche.plus")}</span>
        </button>
      </div>

      {grille && (
        <div className="planche-grille" id="planche-grille" role="dialog" aria-label={t("planche.grille")} ref={grilleDom} data-planche-grille>
          {/* Favoris et regroupements avant les familles ; une ligne de séparation entre sections (comme SketchUp). */}
          {[
            { cle: "favoris", libelle: t("planche.grille.favoris"), entrees: prefsSandbox.preferences.favoris },
            ...prefsSandbox.preferences.regroupements.map((g) => ({ cle: `groupe-${g.id}`, libelle: g.nom, entrees: g.entrees })),
          ]
            .filter((x) => x.entrees.length > 0)
            .map((x) => (
              <section key={x.cle} aria-label={x.libelle} data-planche-grille-section={x.cle}>
                <h4 className="sr-only">{x.libelle}</h4>
                <div className="planche-grille-tuiles">
                  {x.entrees.map((cle) => {
                    if (masquees.has(cle)) return null;
                    const e = entreeDeCle(cle);
                    if (e?.nature === "outil") {
                      const o = outilParId(e.id);
                      return o ? <span key={cle} style={{ display: "contents" }}>{boutonOutil(o, true)}</span> : null;
                    }
                    const c = e?.nature === "commande" ? commandesListe.find((x) => x.id === e.id) : undefined;
                    if (!c) return null;
                    return (
                      <button key={cle} type="button" className={`outil${c.motif ? " est-indisponible" : ""}`} aria-disabled={c.motif ? true : undefined} title={c.motif ? `${c.nom} — ${c.motif}` : `${c.nom} (${afficherRaccourci(c.raccourci)})`} aria-label={c.nom} onClick={() => { if (!c.motif) { setGrille(false); c.executer(); } }} data-planche-commande={c.id}>
                        <Pictogramme picto={c.picto} className="outil-picto" />
                        <span className="outil-libelle" aria-hidden="true">{c.nom}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          {sections.map((s) => (
            <section key={s.libelle} aria-label={s.libelle}>
              <h4 className="sr-only">{s.libelle}</h4>
              <div className="planche-grille-tuiles">{s.outils.map((o) => boutonOutil(o, true))}</div>
            </section>
          ))}
          <div className="planche-grille-pied">
            <button type="button" className="planche-grille-modifier" onClick={() => { setGrille(false); setPanneau("personnaliser"); }} title={t("planche.grille.modifier.aide")} data-planche-grille-modifier>
              {t("planche.grille.modifier")}
            </button>
          </div>
        </div>
      )}

      <nav ref={colonneRef} className="planche-colonne" aria-label={t("canevas.panneaux")} onPointerDown={toucherColonne}>
        {COLONNE.map(({ id, picto, bas }) => (
          // Extensions : le panneau d'une extension désactivée n'est pas offert.
          masquees.has(`panneau:${id}`) ? null : <button key={id} type="button" className={`canevas-icone${bas ? " planche-colonne-bas" : ""}`} aria-pressed={panneau === id} onClick={() => setPanneau(panneau === id ? null : id)} title={t(`panneau.${id}` as "panneau.info-entite")} data-planche-panneau-icone={id}>
            <Pictogramme className="canevas-picto" picto={picto} />
            <span className="canevas-etiquette">{t(`panneau.${id}` as "panneau.info-entite")}</span>
          </button>
        ))}
        {panneauxInstalles.map((x) => (
          <button key={x.cle} type="button" className="canevas-icone planche-colonne-bas" aria-pressed={panneauExtensionOuvert?.cle === x.cle} onClick={() => setPanneauExtension(panneauExtensionOuvert?.cle === x.cle ? null : { extension: x.paquet.fiche.id, panneau: x.id })} title={x.titre} data-planche-panneau-icone={x.cle}>
            {x.image ? <IconeExtension image={x.image} className="canevas-picto" /> : <Pictogramme className="canevas-picto" picto={PICTO_EXTENSION_INSTALLEE} />}
            <span className="canevas-etiquette">{x.titre}</span>
          </button>
        ))}
      </nav>
      {/* Chevron plier / déplier (comme SketchUp) : à mi-hauteur, au bord gauche de la colonne ; avec une souris, il apparaît
          au survol de la colonne ou du chevron et au clavier (focus) ; sur écran tactile (pas de survol), un toucher sur la
          colonne ou sur lui le fait paraître environ 3 s (`colonne-touchee`). */}
      <button type="button" className="planche-colonne-bascule" onPointerDown={toucherColonne} aria-expanded={!colonneRepliee} onClick={() => setColonneRepliee(!colonneRepliee)} title={colonneRepliee ? t("planche.colonne.deplier") : t("planche.colonne.replier")} aria-label={colonneRepliee ? t("planche.colonne.deplier") : t("planche.colonne.replier")} data-planche-colonne-bascule>
        <IconeSandbox nom={colonneRepliee ? "replier" : "deplier"} />
      </button>
      {panneau === "personnaliser" && (
        <section className="planche-panneau" aria-label={t("panneau.personnaliser")} data-planche-panneau="personnaliser">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.personnaliser")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.personnaliser") })}><IconeSandbox nom="fermer" /></button>
          </header>
          <div className="canevas-panneau-corps">
            <PanneauPersonnaliser
              key={barreEditee.jeton}
              groupeInitial={barreEditee.groupe}
              preferences={prefsSandbox.preferences}
              extensionsEffectives={extensionsEffectives}
              etat={prefsSandbox.etat}
              outils={outilsOfferts}
              commandes={commandesListe.filter((c) => CLES_PERSONNALISABLES.includes(`commande:${c.id}`)).map((c) => ({ id: c.id, picto: c.picto, nom: c.nom }))}
              modifier={prefsSandbox.modifier}
              reinitialiser={prefsSandbox.reinitialiser}
            />
          </div>
        </section>
      )}
      {panneau === "materiaux" && (
        <section className="planche-panneau" aria-label={t("panneau.materiaux")} data-planche-panneau="materiaux">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.materiaux")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.materiaux") })}><IconeSandbox nom="fermer" /></button>
          </header>
          <div className="canevas-panneau-corps">
            <PanneauMateriaux
              modele={hist.present.modele}
              courant={materiau}
              lecture={readOnly}
              onChoisir={(id) => {
                setMateriau(id);
                if (!readOnly) choisirOutil("peinture");
              }}
              onCreer={(nom, couleur) => {
                const r = modifierAnnotations(histRef.current.present.modele, (a, id) => {
                  const k = id("m");
                  a.materiaux[k] = { id: k, nom, couleur };
                  return k;
                });
                appliquer({ etat: null, modele: r.modele }, t("planche.materiau.nouveau"));
                setMateriau(r.extra);
              }}
            />
          </div>
        </section>
      )}
      {panneau === "balises" && (
        <section className="planche-panneau" aria-label={t("panneau.balises")} data-planche-panneau="balises">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.balises")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.balises") })}><IconeSandbox nom="fermer" /></button>
          </header>
          <div className="canevas-panneau-corps">
            <PanneauBalises
              modele={hist.present.modele}
              courante={balise}
              lecture={readOnly}
              separateur={SEPARATEUR_DECIMAL}
              compte={compterSelection(hist.present.modele, vue.selection ?? selectionRef.current, dans)}
              onCourante={(id) => {
                setBalise(id);
                const b = id ? histRef.current.present.modele.annotations?.balises[id] : undefined;
                setMessage(b ? t("planche.balise.note.courante", { nom: b.nom }) : t("planche.balise.note.sans-courante"));
              }}
              onModifier={modifierBaliseL4}
              onClasser={classerSelectionL4}
              executer={executerBalise}
              disponibilite={disponibiliteCommandeBalise}
              onChoisir={(id) => {
                setBalise(id);
                if (!readOnly) choisirOutil("balise");
              }}
              onVisible={(id, visible) => {
                const b = histRef.current.present.modele.annotations?.balises[id];
                if (!b) return;
                const r = modifierAnnotations(histRef.current.present.modele, (a) => {
                  a.balises[id] = { ...b, visible };
                });
                appliquer({ etat: null, modele: r.modele }, t("planche.balise.visible"));
              }}
              onCreer={(nom, couleur) => {
                const r = modifierAnnotations(histRef.current.present.modele, (a, id) => {
                  const k = id("b");
                  a.balises[k] = { id: k, nom, couleur, visible: true };
                  return k;
                });
                appliquer({ etat: null, modele: r.modele }, t("planche.balise.nouvelle"));
                setBalise(r.extra);
              }}
            />
          </div>
        </section>
      )}

      {panneauExtensionOuvert && (
        <section className="planche-panneau" aria-label={panneauExtensionOuvert.titre} data-planche-panneau={panneauExtensionOuvert.cle}>
          <header className="canevas-panneau-tete planche-panneau-extension-tete">
            <h3 className="planche-panneau-extension-titre"><span>{panneauExtensionOuvert.titre}</span><span className="planche-outils-pastille-extension" data-planche-panneau-pastille>{t("extensions.panneau.pastille")}</span></h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneauExtension(null)} aria-label={t("panneau.fermer", { titre: panneauExtensionOuvert.titre })}><IconeSandbox nom="fermer" /></button>
          </header>
          <div className="canevas-panneau-corps">
            <CadrePanneauExtension
              key={panneauExtensionOuvert.cle}
              paquet={panneauExtensionOuvert.paquet}
              panneau={panneauExtensionOuvert.id}
              titre={panneauExtensionOuvert.titre}
              appeler={(action, donnees) => appelerPanneauExtension(panneauExtensionOuvert.paquet, panneauExtensionOuvert.id, panneauExtensionOuvert.titre, action, donnees)}
              brancher={brancherPanneau}
            />
          </div>
        </section>
      )}

      {/* Fichier .pat : monté hors du panneau pour que « Importer » (Ctrl+F11, menu Outils) ouvre le sélecteur même panneau fermé. */}
      <input
        ref={importMotifRef}
        type="file"
        accept=".pat,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importerMotifs(f);
        }}
        data-planche-motif-fichier
      />
      <input
        ref={fichierGabaritRef}
        type="file"
        accept={`${EXTENSION_GABARIT},.json,application/json`}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) importerGabarit(f);
        }}
        data-planche-gabarit-fichier
      />
      <input
        ref={fichierNatifRef}
        type="file"
        accept={`${EXTENSION_NATIF},application/json`}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importerNatif(f);
        }}
        data-planche-natif-fichier
      />
      {panneau && PANNEAUX_COMMUNS.has(panneau) && (
        <section className="planche-panneau" aria-label={t(`panneau.${panneau}` as "panneau.info-entite")} data-planche-panneau={panneau}>
          <header className="canevas-panneau-tete">
            <h3>
              {panneau === "echange-import" && rapportImport ? t("planche.echange.titre-import", { format: rapportImport.rapport.format.toUpperCase() }) : t(`panneau.${panneau}` as "panneau.info-entite")}
              {panneau === "controle" && vueControle !== "releve" ? ` · ${t(`planche.controle.vue.${vueControle}`)}` : ""}
              {panneau === "info-entite" && planChoisi() ? ` · ${t("planche.info.plan")}` : ""}
              {RACCOURCI_PANNEAU_L7[panneau] && <small className="planche-versions-raccourci"> {afficherRaccourci(RACCOURCI_PANNEAU_L7[panneau]!)}</small>}
            </h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t(`panneau.${panneau}` as "panneau.info-entite") })}><IconeSandbox nom="fermer" /></button>
          </header>
          <div className="canevas-panneau-corps">
            {panneau === "debit" && (
              <PanneauDebit lignes={lignesDebit} reglages={reglagesDebit} onReglages={setReglagesDebit} onLigne={selectionnerLigneDebit} executer={executerDebit} disponibilite={disponibiliteCommandeDebit} lecture={readOnly} note={noteDebit} />
            )}
            {panneau === "emplacement" && (
              <PanneauEmplacement emplacement={emplacement} lecture={readOnly} flecheNord={options.flecheNord} onEnregistrer={(e) => { nordSaisiRef.current = true; poserEmplacement(e, t(e ? "planche.emplacement.note.enregistre" : "planche.emplacement.note.retire")); }} executer={executerEmplacement} disponibilite={disponibiliteCommandeEmplacement} note={noteEmplacement}
                geodata={{ liste: geodataListe, chargement: geodataChargement, erreur: geodataErreur, onCharger: chargerEmplacementsGeoData, onAppliquer: appliquerEmplacementGeoData }} />
            )}
            {panneau === "emplacement" && <SectionPointDeBase point={pointDeBase} reference={referenceNiveaux} lecture={readOnly} onEnregistrer={poserPointDeBase} note={notePointDeBase} />}
            {panneau === "niveaux" && (
              <PanneauNiveaux
                niveaux={niveaux}
                objets={objetsParNiveau}
                choisi={niveauChoisi}
                travail={niveauTravailValide}
                reference={referenceNiveaux}
                lecture={readOnly}
                onChoisir={(id) => { setNiveauChoisi(id); setErreurNiveau(null); }}
                onModifier={modifierUnNiveau}
                onAjouter={ajouterUnNiveau}
                onReference={poserReferenceNiveaux}
                executer={executerNiveau}
                disponibilite={disponibiliteCommandeNiveau}
                erreur={erreurNiveau}
                note={noteNiveau}
              />
            )}
            {panneau === "plan-vectoriel" && (
              <>
                <PanneauPlanVectoriel
                  options={optionsPlan}
                  plans={Object.values(hist.present.modele.annotations?.plansDeCoupe ?? {})}
                  apercu={apercuPlan}
                  motifs={motifsPlan}
                  matieres={Object.values(hist.present.modele.annotations?.materiaux ?? {})}
                  choisi={motifChoisi}
                  lecture={readOnly}
                  onOptions={setOptionsPlan}
                  onChoisir={(id) => { setMotifChoisi(id); setErreurPlan(null); }}
                  onModifierMotif={modifierUnMotif}
                  onAssocier={associerUnMotif}
                  executer={executerPlan}
                  disponibilite={disponibiliteCommandePlan}
                  refMotifs={titreMotifsRef}
                  erreur={erreurPlan}
                  note={notePlan}
                />
              </>
            )}
            {panneau === "locaux" && (
              <PanneauLocaux
                lignes={tableLocaux.lignes}
                total={tableLocaux.total}
                evalues={tableLocaux.evalues}
                choisi={localChoisi}
                lecture={readOnly}
                onChoisir={(id) => { setLocalChoisi(id); setErreurLocal(null); }}
                onModifier={modifierUnLocal}
                executer={executerLocal}
                disponibilite={disponibiliteCommandeLocal}
                erreur={erreurLocal}
                note={noteLocal}
              />
            )}
            {panneau === "scripts" && (
              <PanneauScripts
                scripts={prefsSandbox.preferences.scripts}
                edite={scriptEdite}
                onEdite={setScriptEdite}
                onScripts={(scripts) => prefsSandbox.modifier({ ...prefsSandbox.preferences, scripts })}
                enAttente={prefsSandbox.etat === "copie" || prefsSandbox.etat === "defaut"}
                enCours={scriptEnCours}
                issue={issueScript}
                executer={executerScripts}
                disponibilite={disponibiliteCommandeScripts}
                onArreter={() => executionScript.current?.arreter()}
              />
            )}
            {panneau === "dynamique" && (
              <PanneauDynamique modele={hist.present.modele} definition={definitionDynamique} erreurs={erreursDynamique} lecture={readOnly} onDefinir={definirComposantDynamique} onOption={choisirOptionDynamique} executer={executerDynamique} disponibilite={disponibiliteCommandeDynamique} />
            )}
            {panneau === "echange-import" && <PanneauImportEchange rapport={rapportImport?.rapport ?? null} arbre={rapportImport?.arbre ?? []} objet={objetIfcChoisi} separateur={SEPARATEUR_DECIMAL} archive={archiveImport} />}
            {panneau === "echange-export" && exportPrepare && (
              <PanneauExportEchange
                modele={hist.present.modele}
                format={formatExport}
                onFormat={setFormatExport}
                coordonnees={ui.coordonneesExport}
                onCoordonnees={(c) => etatUi.set({ coordonneesExport: c })}
                reference={referenceNiveaux ?? null}
                ecrit={exportPrepare.ecrit}
                motif={exportPrepare.motif}
                nonAffiches={exportPrepare.nonAffiches}
                inclureMasques={inclureMasques}
                onInclureMasques={setInclureMasques}
                balisesIncluses={balisesIncluses}
                onBaliseIncluse={(id, v) => setBalisesIncluses((avant) => (v ? new Set([...avant, id]) : new Set([...avant].filter((x) => x !== id))))}
                prevu={exportPrepare.prevu}
                onExporter={exporterEchange}
                onAnnuler={() => setPanneau(null)}
              />
            )}
            {panneau === "natif-image" && (
              <PanneauNatifImage
                dernierExport={dernierNatif}
                reimport={reimportNatif}
                onExporterNatif={exporterNatif}
                onImporterNatif={() => fichierNatifRef.current?.click()}
                largeur={tailleImage.largeur}
                hauteur={tailleImage.hauteur}
                onTaille={(largeur, hauteur) => setTailleImage({ largeur, hauteur })}
                transparent={imageTransparente}
                onTransparent={setImageTransparente}
                onExporterImage={() => void exporterImage()}
                note={noteNatif}
                disponibilite={disponibiliteEchange}
              />
            )}
            {panneau === "coller-trace" && (
              <PanneauCollerTrace
                lecture={colle}
                unite={uniteColle}
                onUnite={setUniteColle}
                echelle={echelleColle}
                onEchelle={setEchelleColle}
                poserSur={poserColle}
                onPoserSur={setPoserColle}
                onColler={collerTrace}
                onAnnuler={() => { setPanneau(null); setColle(null); }}
                echelleValide={echelleColleLue !== null}
              />
            )}
            {panneau === "gabarit" && <PanneauGabarit gabarits={gabarits} choisi={gabaritChoisi} onChoisir={setGabaritChoisi} separateur={SEPARATEUR_DECIMAL} note={noteGabarit} executer={executerGabarit} disponibilite={disponibiliteCommandeGabarit} />}
            {panneau === "versions-jalons" && (
              <PanneauVersions
                revision={revisionDe(hist.present.modele)}
                statuts={statutsVersion}
                onRevision={poserUneRevision}
                lecture={readOnly}
                jalons={registre.jalons}
                choisi={jalonChoisi}
                onChoisir={setJalonChoisi}
                onPoserJalon={poserUnJalon}
                onDeriver={(j) => void actionsVersions.deriver(j)}
                variantes={variantesDe(indexPlanches, plancheCourante).map(varianteAffichee)}
                emissions={registre.emissions}
                onDestinataire={(id, d) => poserRegistre(declarerDestinataire(registreRef.current, id, d))}
                origine={origineCourante ? (origineCourante.nomJalon ? t("planche.version.origine-jalon", { planche: origineCourante.nomPlanche, jalon: origineCourante.nomJalon }) : t("planche.version.origine", { planche: origineCourante.nomPlanche })) : null}
                onOuvrirOrigine={origineCourante && indexPlanches.planches.some((p) => p.id === origineCourante.planche) ? () => void actionsMenu.ouvrir(origineCourante.planche) : null}
                disponibilite={disponibiliteCommandeVersion}
              />
            )}
            {panneau === "comparer" && (
              <PanneauComparer
                choix={choixComparaison}
                depuis={depuisEffectif}
                vers={versEffectif}
                onDepuis={setComparerDepuis}
                onVers={setComparerVers}
                comparaison={comparaison?.c ?? null}
                refus={refusComparaison}
                surligner={surlignerDifferences}
                onSurligner={setSurlignerDifferences}
              />
            )}
            {panneau === "brouillon" && (
              <PanneauBrouillon
                brouillon={
                  originalBrouillon
                    ? { original: nomAffiche(originalBrouillon), commence: infoCourante.creeA, ajoutes: changementsBrouillon?.ajoutes.length ?? 0, modifies: changementsBrouillon?.modifies.length ?? 0, supprimes: changementsBrouillon?.supprimes.length ?? 0 }
                    : null
                }
                nomPlanche={nomCourant}
                lecture={readOnly}
                onEssayer={() => void actionsVersions.essayer()}
                onAppliquer={() => void actionsVersions.appliquer()}
                onGarder={() => void actionsVersions.garder()}
                onAbandonner={() => void actionsVersions.abandonner()}
                variantes={variantesDe(indexPlanches, originalBrouillon?.id ?? plancheCourante).map(varianteAffichee)}
                nomJalon={(id) => registre.jalons.find((j) => j.id === id)?.nom ?? id}
                onOuvrir={(id) => void actionsMenu.ouvrir(id)}
                disponibilite={disponibiliteCommandeVersion}
              />
            )}
            {panneau === "fiche-projet" && <PanneauFicheProjet fiche={ficheDe(hist.present.modele)} lecture={readOnly} onFiche={poserUneFiche} />}
            {panneau === "accrochage" && <PanneauAccrochage force={forceAccrochage} presqueMm={presqueMm} onPresque={setPresqueMm} executer={executerAccrochage} disponibilite={disponibiliteCommandeAccrochage} />}
            {panneau === "metre-mesure" && (
              <PanneauMetreMesure
                derniere={metreMemo.derniere}
                zeroNgf={referenceNiveaux}
                unite={uniteProjet}
                separateur={SEPARATEUR_DECIMAL}
                guidePas={metreMemo.guide ? Math.hypot(metreMemo.guide.pas.x, metreMemo.guide.pas.y, metreMemo.guide.pas.z) : null}
                reglages={reglagesMetre}
                onReglages={setReglagesMetre}
                executer={executerAccrochage}
                disponibilite={disponibiliteCommandeAccrochage}
                note={noteMetre}
              />
            )}
            {panneau === "numerotation" && (
              <PanneauNumerotation familles={famillesNumerotees} niveaux={niveauxNumerotation} apercu={apercuNumerotation} reglages={reglagesNumerotation} onReglages={setReglagesNumerotation} executer={executerNumerotation} disponibilite={disponibiliteCommandeNumerotation} lecture={readOnly} note={noteNumerotation} />
            )}
            {panneau === "controle" && rapportControle && (
              <PanneauControle
                rapport={rapportControle}
                choix={choixNettoyage}
                onChoix={setChoixNettoyage}
                executer={executerControle}
                disponibilite={disponibiliteCommandeControle}
                onSelectionnerOuverts={dans === undefined ? selectionnerNonSolides : null}
                lecture={readOnly}
                note={noteControle}
                vue={vueControle}
                separateur={SEPARATEUR_DECIMAL}
                defauts={defautsControle}
                compte={compteControle}
                reglages={reglagesControle(hist.present.modele)}
                onReglages={changerSeuilsControle}
                indice={indiceControle}
                nomObjet={(id) => hist.present.modele.racine.occurrences[id]?.nom ?? t("planche.controle.objet")}
                onIgnorer={() => montrerDefaut(indiceDefaut(defautsControle.length, indiceControle, 1))}
                onSelectionnerDefaut={defautCourant ? () => montrerDefaut(indiceControle) : undefined}
                optionsFondDao={optionsFondDao}
                onOptionsFondDao={setOptionsFondDao}
                apercuFondDao={apercuFondDao}
                volumes={apercuVolumes}
                regles={reglesPieces}
                pieces={bilanPieces}
                site={lignesSite}
                onChargerRegles={chargerReglesPieces}
                onRetirerRegles={() => operer(t("planche.pieces.retirer"), (m) => ({ modele: poserReglesPieces(m, null).modele }))}
                onOuvrirEmplacement={() => {
                  if (masquees.has("panneau:emplacement")) prefsSandbox.modifier({ ...prefsSandbox.preferences, extensions: basculerExtension(prefsSandbox.preferences.extensions, "emplacement", true) });
                  setPanneau("emplacement");
                }}
                onLocaliserManque={localiserManqueSite}
              />
            )}
            {panneau === "info-entite" && <PanneauInfoEntite modele={hist.present.modele} selection={vue.selection ?? selectionRef.current} dans={dans} lecture={readOnly} separateur={SEPARATEUR_DECIMAL} precision={precision} actions={actionsInfo} referenceNiveaux={plancheDe(indexPlanches).altitudeRef}
              coupe={(planId) => {
                const plan = hist.present.modele.annotations?.plansDeCoupe[planId];
                return plan ? (
                  <SectionPlanCoupe
                    modele={hist.present.modele}
                    plan={plan}
                    lecture={readOnly}
                    separateur={SEPARATEUR_DECIMAL}
                    pas={pasCoupe}
                    onPas={setPasCoupe}
                    echelle={echelleCoupe}
                    onEchelle={setEchelleCoupe}
                    onPlacer={(d) => actionPlan((m) => placerPlan(m, planId, d).modele, t("planche.coupe.distance"))}
                    onDecaler={(d) => actionPlan((m) => decalerPlan(m, planId, d).modele, t("planche.coupe.deplacer"))}
                    onProfondeur={(x) => actionPlan((m) => limiterProfondeur(m, planId, x).modele, t("planche.coupe.profondeur"))}
                    executer={executerScene}
                    disponibilite={disponibiliteCommandeScene}
                  />
                ) : null;
              }}
              echelle={<SectionRemiseEchelle mesureeDefaut={longueurMesure} separateur={SEPARATEUR_DECIMAL} mesuree={echelleMesuree} reelle={echelleReelle} onMesuree={setEchelleMesuree} onReelle={setEchelleReelle} executer={executerAccrochage} disponibilite={disponibiliteCommandeAccrochage} note={noteEchelle} />} />}
            {panneau === "composants" && (
              <PanneauComposants
                modele={hist.present.modele}
                lecture={readOnly}
                onModifier={actionsInfo.modifierDefinition}
                onSelectionner={(def) => {
                  const m = histRef.current.present.modele;
                  const c = contexteDe(m, dansRef.current);
                  setSelection(Object.values(c.occurrences).filter((occ) => occ.definition === def && !occ.masquee).map((occ) => occ.id));
                  rafraichir();
                }}
              />
            )}
            {panneau === "styles" && <PanneauStyles options={options} onOptions={majOptions} />}
            {panneau === "ombres" && <PanneauOmbres options={options} onOptions={majOptions} latitudeParcelle={emplacementActif ? emplacementActif.latitude : null} />}
            {panneau === "affichage" && (
              <PanneauAffichage
                options={options}
                onOptions={majOptions}
                onReafficher={reafficher}
                onSupprimerGuides={() => operer(t("planche.affichage.supprimer-guides"), (m) => ({ modele: modifierAnnotations(m, (a) => void (a.guides = {})).modele, selection: selectionRef.current.filter((id) => genreAnnotation(id) !== "guide") }))}
                lecture={readOnly}
              />
            )}
            {panneau === "scenes" && (
              <SectionScenesL4
                modele={hist.present.modele}
                active={sceneActive}
                lecture={readOnly}
                onAppliquer={appliquerScene}
                onMettreAJour={mettreAJourScene}
                onModifier={modifierSceneL4}
                onScenesTypes={(genres) => creerScenesTypes(genres)}
                executer={executerScene}
                disponibilite={disponibiliteCommandeScene}
              />
            )}
            {panneau === "scenes" && (
              <PanneauScenes modele={hist.present.modele} lecture={readOnly} projection={camera.projection} champDeVision={camera.champDeVision} onAjouter={ajouterScene} onMettreAJour={mettreAJourScene} onAppliquer={appliquerScene} onSupprimer={supprimerScene} onVueStandard={vueStandard} onProjection={poserProjection} onChampDeVision={poserChampDeVision} rappelerRepere={ui.rappelerRepereScene} onRappelerRepere={(v) => etatUi.set({ rappelerRepereScene: v })} />
            )}
            {panneau === "reperes" && (
              <PanneauReperes
                modele={hist.present.modele}
                contexte={histContexte.courant}
                etat={etatRepere}
                nomActif={nomActifRepere}
                lecture={readOnly}
                demandeEnregistrer={demandeEnregistrerRepere}
                axesVisibles={options.axes}
                triade={ui.triade}
                onActiver={activerRepereEnregistre}
                onEnregistrerNouveau={enregistrerRepereNouveau}
                onEnregistrerModifications={enregistrerModificationsRepere}
                onRenommer={(id, nom) => muterReperes(renommerRepere(histRef.current.present.modele, id, nom), "planche.reperes.operation.renommer")}
                onDupliquer={(id, nom) => muterReperes(dupliquerRepere(histRef.current.present.modele, id, nom), "planche.reperes.operation.dupliquer")}
                onSupprimer={(id, detacher) => muterReperes(supprimerRepere(histRef.current.present.modele, id, detacher ? "detacher" : "refuser"), "planche.reperes.operation.supprimer")}
                onAxes={(v) => majOptions({ axes: v })}
                onTriade={(triade) => etatUi.set({ triade })}
                faceLiable={dans === undefined ? (selectionRef.current.find((id) => hist.present.modele.racine.faces[id] !== undefined) ?? null) : null}
                onEnregistrerLie={(nom) => {
                  const face = selectionRef.current.find((id) => histRef.current.present.modele.racine.faces[id] !== undefined);
                  const r = enregistrerRepereLie(histRef.current.present.modele, nom, face ?? "");
                  const e = muterReperes(r, "planche.reperes.operation.lier");
                  if (!e && r.ok) activerRepereEnregistre(r.id);
                  return e;
                }}
                onMajSource={(id) => {
                  const r = mettreAJourDepuisSource(histRef.current.present.modele, id);
                  const e = muterReperes(r, "planche.reperes.operation.maj-source");
                  const c = histContexteRef.current.courant;
                  if (!e && r.ok && c.source.genre === "enregistre" && c.source.id === id) activerRepereEnregistre(id);
                  return e;
                }}
                onDetacherLien={(id) => muterReperes(detacherRepereLie(histRef.current.present.modele, id), "planche.reperes.operation.detacher")}
                coordonneesExport={ui.coordonneesExport}
                referenceAltitude={referenceNiveaux}
                onCoordonneesExport={(c) => etatUi.set({ coordonneesExport: c })}
              />
            )}
            {panneau === "adoucir" && <PanneauAdoucir selection={vue.selection ?? selectionRef.current} lecture={readOnly} onAppliquer={adoucirLisserSelection} />}
            {panneau === "info-modele" && (
              <PanneauInfoModele
                modele={hist.present.modele}
                lecture={readOnly}
                precision={precision}
                onPrecision={poserPrecision}
                onReglages={poserReglages}
                onAppliquerStyle={appliquerStyleCotes}
                unites={<SectionUnites modele={hist.present.modele} lecture={readOnly} onUnite={changerUniteProjet} />}
                parametres={<SectionParametres modele={hist.present.modele} lecture={readOnly} separateur={SEPARATEUR_DECIMAL} onParametre={poserParametreProjet} onSupprimerParametre={supprimerParametreProjet} />}
              />
            )}
            {panneau === "navigateur" && (
              <NavigateurPlanche
                modele={hist.present.modele}
                selection={vue.selection ?? selectionRef.current}
                dans={dans}
                lecture={readOnly}
                onSelectionner={(id, d, ch) => {
                  if (d !== dansRef.current || (ch ?? []).join("/") !== cheminRef.current.join("/")) poserDans(d, ch);
                  setSelection([id]);
                  rafraichir();
                }}
                onEntrer={(id, ch) => {
                  poserDans(id, ch);
                  setSelection([]);
                  rafraichir();
                }}
                onCibler={(id) => {
                  const b = boiteOccurrence(histRef.current.present.modele, id);
                  if (b) vueRef.current?.cadrer(b, margesVue(racineRef.current));
                }}
                onMasquer={(id, d, masquee) => operer(t(masquee ? "planche.menu.masquer" : "planche.menu.afficher"), (m) => ({ modele: masquerEntites(m, [id], d !== undefined ? { dans: d } : {}, masquee).modele }))}
                onSupprimer={(id, d) => operer(t("planche.menu.effacer"), (m) => ({ modele: effacerEntites(m, [id], d !== undefined ? { dans: d } : {}).modele, selection: selectionRef.current.filter((x) => x !== id) }))}
                commandes={commandesNavigateur()}
                renommage={renommage}
                onRenommer={(id, d, nom) => operer(t("planche.menu.renommer"), (m) => ({ modele: renommerOccurrence(m, id, nom, d !== undefined ? { dans: d } : {}).modele }))}
                onFinRenommage={() => setRenommage(null)}
                onDeplacer={(id, de, vers) => deplacerObjets([id], de, vers)}
              />
            )}
          </div>
        </section>
      )}
      {menu && <MenuContextuel x={menu.x} y={menu.y} entrees={menu.entrees} onFermer={fermerMenu} />}
      {dialogueDeplacer && (
        <DialogueDeplacer
          cibles={ciblesDeplacement(hist.present.modele, dialogueDeplacer.ids, dialogueDeplacer.dans, (id) => nomOccurrence(hist.present.modele, id), t("planche.contexte.racine"))}
          onChoisir={(vers) => {
            const d = dialogueDeplacer;
            setDialogueDeplacer(null);
            deplacerObjets(d.ids, d.dans, vers);
          }}
          onAnnuler={() => setDialogueDeplacer(null)}
        />
      )}
      {saisiesExtensions[0] && <DialogueSaisieExtension key={saisiesExtensions[0].cle} saisie={saisiesExtensions[0]} />}
      {!saisiesExtensions[0] && fichiersExtensions[0] && <DialogueFichierExtension key={fichiersExtensions[0].cle} fichier={fichiersExtensions[0]} />}
      {dialogueComposant && <DialogueComposant nomDefaut={`${t("planche.composant.defaut")} ${Object.values(hist.present.modele.definitions).filter((d) => d.genre === "composant").length + 1}`} onCreer={creerComposant} onAnnuler={() => setDialogueComposant(false)} />}
      {planSelectionne && (
        <div ref={coupeRef} onKeyDown={naviguerCoupe} className="planche-coupe-barre" role="toolbar" aria-label={t("planche.coupe.selectionne")} data-planche-coupe>
          <span>{t("planche.coupe.selectionne")}</span>
          <button type="button" onClick={() => appliquer(modifierPlanDeCoupe(contexte(), planSelectionne.id, { inverse: !planSelectionne.inverse }), t("planche.coupe.inverser"))} data-planche-coupe-inverser>
            {t("planche.coupe.inverser")}
          </button>
          <button type="button" aria-pressed={planSelectionne.actif} onClick={() => appliquer(modifierPlanDeCoupe(contexte(), planSelectionne.id, { actif: !planSelectionne.actif }), t("planche.coupe.active"))} data-planche-coupe-active>
            {t("planche.coupe.active")}
          </button>
          <button
            type="button"
            onClick={() => {
              const r = effacerEntites(histRef.current.present.modele, [planSelectionne.id]);
              appliquer({ etat: null, modele: r.modele, selection: [] }, t("planche.coupe.effacer"));
            }}
            data-planche-coupe-effacer
          >
            {t("planche.coupe.effacer")}
          </button>
        </div>
      )}
      {edition && (
        <form
          className="planche-texte-edition"
          data-planche-texte-edition
          onSubmit={(e) => {
            e.preventDefault();
            validerEdition();
          }}
        >
          <label htmlFor="planche-texte-edition">{t("planche.texte.aide")}</label>
          <textarea
            id="planche-texte-edition"
            ref={editionRef}
            defaultValue={edition.texte}
            rows={2}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                echap();
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" className="planche-ok">{t("planche.texte.valider")}</button>
        </form>
      )}
      {outilId === "texte-3d" && etatTexte3D?.boite && (
        <DialogueTexte3D
          etat={etatTexte3D}
          onOk={(p) => {
            const e = configurerTexte3D(etatTexte3D, p);
            etatMachineRef.current = e;
            rafraichir();
            if (!e.boite) hoteRef.current?.focus({ preventScroll: true });
          }}
          onAnnuler={retourOutil}
        />
      )}
      {panneau === "instructeur" && (
        <section className="planche-panneau" aria-label={t("panneau.instructeur")} data-planche-panneau="instructeur">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.instructeur")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.instructeur") })}><IconeSandbox nom="fermer" /></button>
          </header>
          <div className="canevas-panneau-corps">
            {etroit && (
              <div className="planche-panneau-consigne" data-planche-panneau-consigne>
                <p>
                  {dans && <span className="planche-contexte">{t("planche.edition", { nom: nomOccurrence(hist.present.modele, dans) })} | </span>}
                  {vue.consigne}
                </p>
                {etatBarre && <p className="planche-message">{etatBarre}</p>}
                {fleches}
              </div>
            )}
            <InstructeurPlanche outil={outil} raison={outil ? raisonDe(outil) : null} />
          </div>
        </section>
      )}

      <div className="planche-pied" ref={piedRef} data-planche-pied>
      {dans !== undefined && (
        <nav className="planche-fil" aria-label={t("planche.contexte.fil")} data-planche-fil>
          <ol>
            {filAriane(chemin, (id) => nomOccurrence(hist.present.modele, id), t("planche.contexte.racine")).map((etape, i, tout) => (
              <li key={etape.id ?? "racine"}>
                {i === tout.length - 1 ? (
                  <span aria-current="page" data-planche-fil-etape={etape.id ?? "racine"}>{etape.nom}</span>
                ) : (
                  <button type="button" onClick={() => allerAuContexte(etape.id)} data-planche-fil-etape={etape.id ?? "racine"}>{etape.nom}</button>
                )}
              </li>
            ))}
          </ol>
          {COMMANDES_CONTEXTE.map((c) => (
            <button key={c.id} type="button" className="planche-fil-commande" title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})`} aria-label={t(c.libelle)} onClick={() => fermerContexte(c.id)} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} />
            </button>
          ))}
          {COMMANDES_VUE.filter((c) => c.id === "masquer-reste").map((c) => (
            <button key={c.id} type="button" className="planche-fil-commande" aria-pressed={options.masquerReste} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})`} aria-label={t(c.libelle)} onClick={basculerMasquerReste} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} />
            </button>
          ))}
        </nav>
      )}
      {isolement && (
        <div className="planche-fil planche-isolement" role="status" data-planche-isolement>
          <span>{t("planche.isolement.etat", { nombre: String(isolement.ids.length) })}</span>
          <button type="button" className="planche-fil-commande" title={`${t("planche.menu.quitter-isolement")} (${afficherRaccourci(COMMANDES_VUE[0]!.raccourci)})`} aria-label={t("planche.menu.quitter-isolement")} onClick={basculerIsolement} data-planche-isolement-quitter>
            <Pictogramme picto={COMMANDES_VUE[0]!.picto} />
          </button>
        </div>
      )}
      <footer className="planche-bas">
        {/* Pied façon SketchUp : aide, langue et périphérique à gauche, puis la consigne, puis Mesures à droite. */}
        {!etroit && <span className="planche-bas-aide">{aideBouton}</span>}
        {!etroit && canevasBas}
        <p className="planche-etat" aria-live="polite" aria-label={t("planche.etat")} data-planche-etat>
          {dans && <span className="planche-contexte" data-planche-contexte>{t("planche.edition", { nom: nomOccurrence(hist.present.modele, dans) })} | </span>}
          <span className="planche-consigne">
            {outilExtensionActif && <strong className="planche-consigne-outil-extension" data-planche-outil-extension={outilId}>{outilExtensionActif.nom}</strong>}
            {outilExtensionActif && vue.consigne ? " — " : ""}
            {vue.consigne}
          </span>
          {panneau === "plan-vectoriel" && apercuPlan && <span className="planche-plan-etat" data-planche-plan-etat>{vue.consigne ? " | " : ""}{t("planche.plan.etat", { echelle: String(optionsPlan.echelle), traits: String(apercuPlan.classes), motifs: String(apercuPlan.motifs) })}</span>}
          {verrouInapplicable && <span className="planche-reperes-avertissement" data-reperes-verrou-inapplicable> | {verrouInapplicable}</span>}
          {dans === undefined && liensDesFaces(hist.present.modele, selectionRef.current).length > 0 && <span className="planche-lien" data-planche-lien> | {t("planche.lien.lie")}</span>}
          {etatBarre && (() => {
            // Lot L19 (EX-ERR-01) : un refus codé montre son message, puis son recours traduit ; le code reste lisible.
            const d = separerDiagnostic(etatBarre);
            return (
              <span className="planche-message" data-planche-message {...(d.code ? { "data-diagnostic": d.code } : {})}>
                {" | "}
                <span>{d.message}</span>
                {d.code && <span className="planche-diagnostic"> — {t(`planche.diag.${d.code}` as CleMessage)} ({d.code})</span>}
              </span>
            );
          })()}
        </p>
        {/* Chantier Axes (AX-2) : le contexte de travail n'est plus affiché dans le pied (maître d'ouvrage, 24 novembre 2026,
            pied façon SketchUp) ; il reste annoncé au lecteur d'écran, et la barre « Axes et repères » s'ouvre par l'outil
            Axes (Maj + Y) ou Alt + Maj + 1. */}
        <span className="planche-annonce-reperes" aria-live="polite" data-reperes-etat>{ligneReperes}</span>
        {lienSelectionne() && (
          <button type="button" className="planche-lien-detacher" title={`${t(COMMANDE_DETACHER_LIEN.libelle)} (${afficherRaccourci(COMMANDE_DETACHER_LIEN.raccourci)})`} aria-label={t(COMMANDE_DETACHER_LIEN.libelle)} onClick={detacherLienSelection} data-planche-commande={COMMANDE_DETACHER_LIEN.id}>
            <Pictogramme picto={COMMANDE_DETACHER_LIEN.picto} /> {t(COMMANDE_DETACHER_LIEN.court)}
          </button>
        )}
        <button type="button" className="planche-volet-bascule" aria-expanded={volet} onClick={() => setVolet(!volet)} title={volet ? t("planche.volet.moins.aide") : t("planche.volet.plus.aide")} data-planche-volet-bascule>
          {volet ? t("planche.volet.moins") : t("planche.volet.plus")}
        </button>
      </footer>

      {(outilId === "profile" || outilId === "profiles-aretes") && (
        <PanneauProfiles
          choix={choixSection}
          onChoix={(c) => {
            setErreurFace(null);
            setChoixSection(c);
          }}
          section={sectionCourante}
          erreur={erreurSection}
          onFace={sectionDeLaFace}
          lecture={readOnly}
          {...(outilId === "profiles-aretes" ? { onPoser: () => void envoyer({ genre: "saisie", texte: "" }) } : {})}
        />
      )}
      {outilId !== "profile" && outilId !== "profiles-aretes" && pieceSelectionnee() !== null && (
        <div className="planche-piece-edition" role="group" aria-label={t("planche.piece.titre")} data-planche-piece-edition>
          <div className="planche-piece-commandes" role="toolbar" aria-label={t("planche.piece.titre")}>
            <span className="planche-piece-titre">{t("planche.piece.titre")}</span>
            {COMMANDES_PIECE.map((c) => {
              const d = disponibiliteCommandePiece(c.id);
              const nom = t(c.libelle);
              return (
                <button key={c.id} type="button" disabled={!d.disponible} title={d.disponible ? `${nom} (${afficherRaccourci(c.raccourci)})` : `${nom} — ${t(d.motif ?? "planche.piece.motif.piece")}`} aria-label={nom} onClick={() => executerPiece(c.id)} data-planche-commande={c.id}>
                  <Pictogramme picto={c.picto} /> {t(c.court)}
                </button>
              );
            })}
            <label className="planche-piece-angle">
              <span>{t("planche.piece.angle")}</span>
              <input inputMode="decimal" value={angleRotation} disabled={readOnly} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setAngleRotation(e.target.value)} data-planche-piece-angle />
            </label>
          </div>
          <PanneauProfiles
              choix={choixSection}
            onChoix={(c) => {
              setErreurFace(null);
              setChoixSection(c);
            }}
            section={sectionCourante}
            erreur={erreurSection}
            onFace={sectionDeLaFace}
            lecture={readOnly}
          />
        </div>
      )}
      {outilId === "mur" && (
        <BarreMur
          saisie={saisieMur}
          onSaisie={setSaisieMur}
          valide={parametresMur !== null}
          reference={referenceMur()}
          onReference={(v) => configurerOutil("reference", v)}
          lecture={readOnly}
          disponibilite={disponibiliteCommandeMur}
          executer={executerMur}
          note={noteMur}
        />
      )}
      {outilId !== "mur" && vue.options && vue.options.length > 0 && (
        <div ref={optionsRef} onKeyDown={naviguerOptions} className="planche-options-outil" role="toolbar" aria-label={t("planche.options")} data-planche-options>
          {/* Écran étroit : seuls les groupes utilisables pour la cible courante (sinon trois rangées au téléphone). */}
          {vue.options.filter((o) => !etroit || o.valeurs.some((v) => v.disponible)).map((o) => (
            <span key={o.id} className="planche-option" role="group" aria-label={libelleOption(outilId, o.id)} data-planche-option={o.id}>
              <span className="planche-option-nom" aria-hidden="true">{libelleOption(outilId, o.id)}</span>
              {o.valeurs.map((v) => {
                const nom = libelleOption(outilId, o.id, v.id);
                const titre = v.disponible ? (v.raccourci ? `${nom} (${afficherRaccourci(v.raccourci)})` : nom) : t("planche.option.indisponible", { option: nom });
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={o.valeur === v.id}
                    disabled={!v.disponible}
                    title={titre}
                    data-planche-option-valeur={`${o.id}:${v.id}`}
                    onClick={() => configurerOutil(o.id, v.id)}
                  >
                    {nom}
                  </button>
                );
              })}
            </span>
          ))}
        </div>
      )}
      <div className="planche-saisie">
      {etroit && <span className="canevas-bas">{aideBouton}{choix}</span>}
      <div ref={modificateursRef} onKeyDown={naviguerModificateurs} className="planche-modificateurs" role="toolbar" aria-label={t("planche.modificateurs")} data-planche-modificateurs>
        <button
          type="button"
          aria-pressed={majVerrouillee}
          title={t("planche.mod.maj.aide")}
          data-planche-mod="Maj"
          onPointerDown={(e) => {
            e.currentTarget.dataset["appui"] = String(performance.now());
            if (!majVerrouillee) envoyerTouche("Maj", "enfoncee");
          }}
          onPointerUp={(e) => {
            const debut = Number(e.currentTarget.dataset["appui"] ?? 0);
            if (majVerrouillee) {
              setMajVerrouillee(false);
              envoyerTouche("Maj", "relachee");
            } else if (performance.now() - debut >= 500) setMajVerrouillee(true);
            else {
              envoyerTouche("Maj", "relachee");
              // Lot 9 : un appui bref sur Maj au toucher vaut une frappe seule (Surface ouverte dans Pousser/Tirer).
              envoyerSeule("Maj");
            }
          }}
          onKeyDown={(e) => {
            // Au clavier, le bouton bascule le verrouillage de Maj.
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            const v = !majVerrouillee;
            setMajVerrouillee(v);
            envoyerTouche("Maj", v ? "enfoncee" : "relachee");
          }}
        >
          {t("planche.mod.maj")}
        </button>
        {boutonsTouches([
          ["Ctrl", t("planche.mod.ctrl"), t("planche.mod.ctrl")],
          ["Alt", t("planche.mod.alt"), t("planche.mod.alt")],
        ])}
        {!etroit ? fleches : flechesAuToucher && <span className="planche-fleches au-toucher" role="group" aria-label={t("planche.mod.fleches")}>{boutonsFleches()}</span>}
      </div>

        {tactile && outilId === "cotation" && vue.mesures && (
          // Cas 2, lot 1 (maquette lot1-3) : pavé numérique au toucher, qui écrit dans le champ Mesures sans clavier système.
          <div className="planche-pave" role="group" aria-label={t("planche.pave")} data-planche-pave>
            {["7", "8", "9", "effacer", "4", "5", "6", ";", "1", "2", "3", "m", "0", ",", "±", "OK"].map((k) => (
              <button
                key={k}
                type="button"
                className={k === "OK" ? "planche-pave-ok" : undefined}
                aria-label={k === "effacer" ? t("planche.pave.effacer") : k === "±" ? t("planche.pave.signe") : k}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (k === "OK") return valider();
                  const actuel = texteRef.current?.statut === "frappe" ? texteRef.current.texte : "";
                  const suivant = k === "effacer" ? actuel.slice(0, -1) : k === "±" ? (actuel.startsWith("-") ? actuel.slice(1) : `-${actuel}`) : actuel + k;
                  setTexte(suivant ? { texte: suivant, statut: "frappe" } : null);
                }}
                data-planche-pave-touche={k}
              >
                {k === "effacer" ? <IconeSandbox nom="effacerSaisie" /> : k}
              </button>
            ))}
          </div>
        )}
        <form
          className="planche-mesures"
          onSubmit={(e) => {
            e.preventDefault();
            valider();
          }}
        >
          <label htmlFor="planche-mesures">{vue.mesures?.libelle ?? t("planche.mesures")}</label>
          <input
            id="planche-mesures"
            ref={champMesures}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={valeurMesures}
            title={t("planche.mesures.aide")}
            aria-describedby="planche-mesures-aide"
            data-planche-mesures
            onChange={(e) => setTexte(e.target.value ? { texte: e.target.value, statut: "frappe" } : null)}
          />
          <span id="planche-mesures-aide" className="sr-only">{t("planche.mesures.aide")}</span>
          <button type="submit" className="planche-ok">OK</button>
        </form>
      </div>
      </div>
      </div>

      {recherche && (
        <RechercheOutil
          lecture={readOnly}
          onFermer={() => {
            setRecherche(false);
            requestAnimationFrame(() => hoteRef.current?.focus({ preventScroll: true }));
          }}
          onChoisir={(id) => {
            setRecherche(false);
            choisirOutil(id);
            requestAnimationFrame(() => hoteRef.current?.focus({ preventScroll: true }));
          }}
        />
      )}
      {sitesProjet.fenetres}
    </div>
  );

  return (
    <>
      <div ref={emplacementRef} className="planche-emplacement" data-planche-emplacement />
      {carteDetache}
      {createPortal(planche, porte)}
    </>
  );
}

/** Outil de départ : Sélection si sa machine est livrée, sinon Orbite (navigation toujours disponible). */
const OUTIL_INITIAL = (): string => (machineParId("selection") ? "selection" : "orbite");

/** Nom de la définition d'une occurrence (groupe / composant), cherchée à la racine et dans les définitions. */
function nomOccurrence(m: Modele, id: string): string {
  const contextes = [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)];
  for (const c of contextes) {
    const o = c.occurrences[id];
    if (o) return o.nom ?? m.definitions[o.definition]?.nom ?? id;
  }
  return id;
}

/** Curseurs qu'un outil d'extension peut demander (liste fermée du protocole) et leur valeur CSS. */
const CURSEURS_CSS: Readonly<Record<CurseurOutil, string>> = { croix: "crosshair", fleche: "default", main: "pointer", cible: "cell" };

/** Vue d'un outil sans machine d'états (caméra) : consigne et champ Mesures relevés dans le catalogue. */
function vueParDefaut(id: string, champDeVision: number, hauteurOeil: number): VueOutil {
  const o = outilParId(id);
  const etape = o?.etapes[0];
  const mesures =
    id === "zoom" && etape?.libelleMesures
      ? { libelle: etape.libelleMesures, valeur: `${virgule(champDeVision)}°`, saisie: { attendu: "champ-vision" as const, separateurDecimal: SEPARATEUR_DECIMAL } }
      : (id === "positionner-camera" || id === "regarder-autour" || id === "marcher") && etape?.libelleMesures
        ? { libelle: id === "positionner-camera" ? t("planche.camera.decalage") : t("planche.camera.oeil"), valeur: `${virgule(hauteurOeil)} m`, saisie: { attendu: "longueur" as const, separateurDecimal: SEPARATEUR_DECIMAL } }
        : null;
  return { consigne: etape?.consigne ?? o?.libelle ?? "", mesures, inference: null, apercu: { lignes: [], faces: [] }, selection: [], survol: [], erreur: null };
}

/** Libellé d'une option d'outil (ou d'une de ses valeurs) au catalogue de messages ; repli sur l'identifiant. */
function libelleOption(outil: string, option: string, valeur?: string): string {
  const cle = `planche.option.${outil}.${option}${valeur ? `.${valeur}` : ""}`;
  return cle in CATALOGUE.fr ? t(cle as CleMessage) : (valeur ?? option);
}

const STATUTS: Record<Outil["statutReleve"], CleMessage> = { observe: "planche.instructeur.statut.observe", instructor: "planche.instructeur.statut.instructor", "non-verifie": "planche.instructeur.statut.non-verifie", fadi: "planche.instructeur.statut.fadi" };
const MODES: Record<string, string> = { bascule: "bascule", maintenu: "maintenu", appui: "à chaque appui" };

/** Instructeur (§6.3) : l'outil actif expliqué depuis le catalogue — étapes, touches modificatrices, suite. */
function InstructeurPlanche({ outil, raison }: { outil: Outil | null; raison: string | null }) {
  if (!outil) return <p className="inspecteur-aide">{t("planche.instructeur.aucun")}</p>;
  const etapes = outil.etapes.filter((e) => e.consigne);
  return (
    <div className="instructeur" data-instructeur={outil.id}>
      <p className="instructeur-outil">
        <Pictogramme picto={pictoOutil(outil.id)} className="canevas-picto" /> <strong>{outil.libelle}</strong>
        {outil.raccourci && <kbd>{outil.raccourci}</kbd>}
      </p>
      {raison && <p className="planche-instructeur-lot" role="note">{raison}</p>}
      {etapes.length > 0 && (
        <>
          <h4>{t("planche.instructeur.etapes")}</h4>
          <ol>
            {etapes.map((e, i) => (
              <li key={i}>
                {e.condition && <em>{e.condition} : </em>}
                {e.consigne}
              </li>
            ))}
          </ol>
        </>
      )}
      {outil.modificateurs.length > 0 && (
        <>
          <h4>{t("planche.instructeur.modificateurs")}</h4>
          <ul>
            {outil.modificateurs.map((m, i) => (
              <li key={i}>
                <kbd>{m.touche}</kbd>
                {m.mode ? ` (${MODES[m.mode] ?? m.mode})` : ""} : {m.effet}{" "}
                <span className="inspecteur-statut" data-statut-modificateur={m.statutReleve}>({t("planche.instructeur.statut-modificateur", { statut: t(STATUTS[m.statutReleve]) })})</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {outil.apresFin && (
        <>
          <h4>{t("planche.instructeur.apres")}</h4>
          <p>{outil.apresFin}</p>
        </>
      )}
      <p className="inspecteur-aide">{t("planche.instructeur.echap")}</p>
      <p className="inspecteur-aide">{t("planche.instructeur.releve", { statut: t(STATUTS[outil.statutReleve]) })}</p>
    </div>
  );
}

/** Recherche d'outil (Maj + S depuis le lot 6, §4.35) : libellé français ou nom de référence, insensible aux accents. */
function RechercheOutil({ lecture, onFermer, onChoisir }: { lecture: boolean; onFermer: () => void; onChoisir: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rang, setRang] = useState(0);
  const resultats = useMemo(() => rechercherOutil(q).slice(0, 12), [q]);
  const champ = useRef<HTMLInputElement | null>(null);
  useEffect(() => champ.current?.focus(), []);
  const choisir = (o: Outil | undefined) => {
    if (!o) return;
    onChoisir(o.id);
  };
  return (
    <div className="planche-recherche-fond" onPointerDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="planche-recherche" role="dialog" aria-modal="true" aria-label={t("planche.recherche.titre")} data-planche-recherche-dialogue>
        <label htmlFor="planche-recherche-champ" className="sr-only">{t("planche.recherche.champ")}</label>
        <input
          id="planche-recherche-champ"
          ref={champ}
          value={q}
          placeholder={t("planche.recherche.champ")}
          autoComplete="off"
          role="combobox"
          aria-expanded={resultats.length > 0}
          aria-controls="planche-recherche-liste"
          aria-activedescendant={resultats[rang] ? `planche-recherche-${resultats[rang]!.id}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setRang(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onFermer();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setRang((r) => Math.min(resultats.length - 1, r + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setRang((r) => Math.max(0, r - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choisir(resultats[rang]);
            }
          }}
        />
        <ul id="planche-recherche-liste" role="listbox" aria-label={t("planche.rechercher")}>
          {q && resultats.length === 0 && <li className="inspecteur-aide">{t("planche.recherche.vide")}</li>}
          {resultats.map((o, i) => {
            const raison = disponibilite(o, { lecture });
            return (
              <li key={o.id} id={`planche-recherche-${o.id}`} role="option" aria-selected={i === rang} aria-disabled={raison ? true : undefined} className={i === rang ? "est-actif" : undefined} onPointerDown={(e) => e.preventDefault()} onClick={() => choisir(o)} title={titreOutil(o, raison)}>
                <Pictogramme picto={pictoOutil(o.id)} className="outil-picto" /> {o.libelle}
                {raccourciOutil(o) && <kbd>{afficherRaccourci(raccourciOutil(o)!)}</kbd>}
                {raison && <span className="outil-lot">{t("planche.prevu.court", { lot: lotPrevu(o) })}</span>}
              </li>
            );
          })}
        </ul>
        <button type="button" className="planche-recherche-fermer" onClick={onFermer}>{t("planche.fermer")}</button>
      </div>
    </div>
  );
}

/** Écran tactile : durée (ms) pendant laquelle un toucher sur la colonne de droite affiche son chevron. */
const DUREE_COLONNE_TOUCHEE = 3000;

/** Marges (px) occupées par la barre d'outils et la colonne de droite : Zoom étendu cadre la zone restante. */
function margesVue(racine: HTMLElement | null): { gauche: number; droite: number; haut: number; bas: number } {
  if (!racine) return { gauche: 0, droite: 0, haut: 0, bas: 0 };
  const r = racine.getBoundingClientRect();
  const boite = (sel: string) => racine.querySelector(sel)?.getBoundingClientRect() ?? null;
  const outils = boite(".planche-outils");
  const colonne = boite(".planche-colonne");
  const panneau = boite(".planche-panneau");
  const haut = boite(".planche-haut");
  const pied = boite(".planche-pied");
  const etroit = (racine.ownerDocument.defaultView ?? window).matchMedia("(max-width: 760px)").matches;
  return {
    gauche: etroit || !outils ? 0 : Math.max(0, outils.right - r.left),
    droite: etroit ? 0 : Math.max(colonne ? r.right - colonne.left : 0, panneau ? r.right - panneau.left : 0),
    haut: haut ? Math.max(0, haut.bottom - r.top) : 0,
    bas: pied ? Math.max(0, r.bottom - pied.top) : 0,
  };
}

/** Panneau Matériaux (lot 5, P-8) : couleurs unies de la Planche ; un clic choisit la matière et active le Pot de peinture. */
function PanneauMateriaux({ modele, courant, lecture, onChoisir, onCreer }: { modele: Modele; courant: string | null; lecture: boolean; onChoisir: (id: string | null) => void; onCreer: (nom: string, couleur: string) => void }) {
  const materiaux = Object.values(modele.annotations?.materiaux ?? {});
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState("#c8a060");
  return (
    <div className="planche-liste-panneau" data-planche-materiaux>
      <ul role="listbox" aria-label={t("panneau.materiaux")}>
        <li role="option" aria-selected={courant === null} className={courant === null ? "est-actif" : undefined} onClick={() => onChoisir(null)} data-planche-materiau="">
          <span className="planche-pastille" style={{ background: COULEUR_MATERIAU_DEFAUT }} aria-hidden="true" />
          {t("planche.materiau.defaut")}
        </li>
        {materiaux.map((m) => (
          <li key={m.id} role="option" aria-selected={courant === m.id} className={courant === m.id ? "est-actif" : undefined} onClick={() => onChoisir(m.id)} data-planche-materiau={m.id}>
            <span className="planche-pastille" style={{ background: m.couleur }} aria-hidden="true" />
            {m.nom}
          </li>
        ))}
      </ul>
      {materiaux.length === 0 && <p className="inspecteur-aide">{t("planche.materiau.aucun")}</p>}
      {!lecture && (
        <form
          className="planche-creation"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nom.trim() || `${t("planche.materiau.nouveau")} ${materiaux.length + 1}`;
            onCreer(n, couleur);
            setNom("");
          }}
          data-planche-materiau-creation
        >
          <h4>{t("planche.materiau.nouveau")}</h4>
          <label>
            {t("planche.materiau.nom")}
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" data-planche-materiau-nom />
          </label>
          <label>
            {t("planche.materiau.couleur")}
            <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} data-planche-materiau-couleur />
          </label>
          <button type="submit" data-planche-materiau-creer>{t("planche.materiau.creer")}</button>
        </form>
      )}
    </div>
  );
}

/** Boîte Texte 3D (§4.14, P-7 : police géométrique intégrée) : texte, hauteur, plein, extrusion ; OK place au curseur. */
function DialogueTexte3D({ etat, onOk, onAnnuler }: { etat: EtatTexte3D; onOk: (p: ParametresTexte3D) => void; onAnnuler: () => void }) {
  const [texte, setTexteLocal] = useState(etat.texte);
  const [hauteur, setHauteur] = useState(virgule(etat.hauteur || HAUTEUR_TEXTE_3D));
  const [plein, setPlein] = useState(etat.plein);
  const [extrusion, setExtrusion] = useState(virgule(etat.extrusion ?? EXTRUSION_TEXTE_3D));
  const champ = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => champ.current?.focus(), []);
  const nombre = (v: string) => Number(v.replace(",", ".").trim());
  return (
    <div className="planche-recherche-fond" onPointerDown={(e) => e.target === e.currentTarget && onAnnuler()}>
      <form
        className="planche-recherche planche-texte3d"
        role="dialog"
        aria-modal="true"
        aria-label={t("planche.texte3d.titre")}
        data-planche-texte3d
        onSubmit={(e) => {
          e.preventDefault();
          onOk({ texte, hauteur: nombre(hauteur), plein, extrusion: nombre(extrusion) });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onAnnuler();
          }
        }}
      >
        <h3>{t("planche.texte3d.titre")}</h3>
        <label htmlFor="planche-texte3d-texte" className="sr-only">{t("planche.texte3d.texte")}</label>
        <textarea id="planche-texte3d-texte" ref={champ} value={texte} placeholder={t("planche.texte3d.texte")} rows={2} onChange={(e) => setTexteLocal(e.target.value)} data-planche-texte3d-texte />
        <div className="planche-texte3d-champs">
          <label>
            {t("planche.texte3d.hauteur")}
            <input inputMode="decimal" value={hauteur} onChange={(e) => setHauteur(e.target.value)} data-planche-texte3d-hauteur />
          </label>
          <label>
            <input type="checkbox" checked={plein} onChange={(e) => setPlein(e.target.checked)} data-planche-texte3d-plein /> {t("planche.texte3d.plein")}
          </label>
          <label>
            {t("planche.texte3d.extrusion")}
            <input inputMode="decimal" value={extrusion} onChange={(e) => setExtrusion(e.target.value)} data-planche-texte3d-extrusion />
          </label>
        </div>
        <p className="inspecteur-aide">{t("planche.texte3d.police")}</p>
        {etat.erreur && <p className="planche-message" role="alert">{etat.erreur}</p>}
        <div className="barre-groupe">
          <button type="submit" data-planche-texte3d-ok>{t("planche.texte3d.ok")}</button>
          <button type="button" onClick={onAnnuler} data-planche-texte3d-annuler>{t("planche.texte3d.annuler")}</button>
        </div>
      </form>
    </div>
  );
}
