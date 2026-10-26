/**
 * Espace de travail d'une variante (Studio V1) : planche 2D construite depuis `STUDIO_TOOLS`, brouillon local
 * (commandes appliquées aussitôt par `applyStudioCommands`, annuler / rétablir sur instantanés locaux), enregistrement
 * explicite par enveloppe de commandes (`studio-commands/1`) sur la révision de tête, garde de navigation, plein écran.
 * Vue : zoom à la molette centré sur le pointeur, boutons et touches de zoom, panoramique (bouton du milieu, Espace +
 * glisser, deux doigts). Sélection multiple : clic, Maj + clic, rectangle fenêtre / capture, Ctrl+A, Échap ; glisser la
 * sélection produit une commande `studio.dessin.deplacer` par objet au relâchement (aperçu pendant le geste), accrochage
 * aux sommets et à la grille. Catalogue « Outils » et palette (Ctrl+K) lus dans le registre ; exports SVG / DXF / IFC par
 * lien de téléchargement. Monté par `StudioShell` ; une révision historique (`?revision=`) s'ouvre en lecture seule.
 * Le serveur reste seul juge du droit d'écriture (`canWrite`). Annuler ne porte que sur les modifications non
 * enregistrées : aucune annulation côté serveur n'est simulée. La vue n'est jamais une donnée du document.
 * Volume : extrusion déclarée de la sélection (`studio.objet.extruder` / `studio.objet.aplatir`, valeurs saisies
 * seulement) et « Vue 3D » (Maj+D), chargée à la demande, du brouillon courant.
 * Présentation : « Feuille » (Maj+P) compose la révision affichée sur une feuille ISO (format, échelle, cartouche
 * prérempli par les données réelles), l'imprime à sa taille réelle ou la télécharge en SVG / PDF ; lecture seule admise.
 * Import : « Importer DXF » (Maj+U) ajoute au brouillon, en un lot annulable, les commandes lues par `lireDxfStudio` ;
 * l'enregistrement découpe les commandes en attente en enveloppes de 500 commandes au plus (`import/envoi.ts`).
 * Courbes : Cercle (C : centre puis un point du cercle), Arc (A : trois points, ou centre, début et fin selon le mode
 * choisi dans le panneau), Polyligne (P : sommets successifs ; Entrée la termine, Maj+Entrée ou un clic sur le premier
 * sommet la ferme) ; Décaler (O) crée, pour chaque objet sélectionné, son décalé à la distance saisie (`studio.dessin.decaler`).
 * Les constructions par points sont pures (`studioArcFromThreePoints`, `studioArcFromCenter`) ; l'aperçu n'est jamais
 * une donnée du document.
 *
 * Mode autonome (`autonome`, Console de Studio, `console/`) : l'outil d'un domaine ouvert INDÉPENDAMMENT DE TOUT PROJET.
 * Le contexte est local (document vide, `console/contexte-console.ts`) ; aucune lecture ni aucun enregistrement
 * (`useChargementVariante` inactif, `useEnregistrement` autonome), aucun brouillon conservé sur l'appareil, aucune requête
 * de projet, d'étude ou de variante. « Enregistrer » y devient « Enregistrer dans un projet » (`console/
 * DialogueEnregistrerConsole.tsx`) : il crée une NOUVELLE étude avec le dessin, jamais dans une étude existante. Les autres
 * commandes et panneaux qui lisent ou écrivent dans une étude (exports du serveur, feuilles et dossier, exigences,
 * commentaires, historique, quantités) sont indisponibles et le disent.
 *
 * Mise en page (logiciel de conception, outils au premier plan) : un domaine affiché à la fois. Barre du haut
 * persistante (domaines, mode des planches 2D / 3D / Double vue, phase déclarée du workflow, Annuler / Rétablir /
 * Enregistrer / Outils / palette, commentaires), palette d'outils du domaine (verticale à gauche ; barre inférieure
 * défilante au téléphone), canevas plein espace (Planche 2D, Planche 3D ou les deux), panneaux latéraux repliables du
 * domaine à droite (sous le canevas au téléphone), barre d'état fine (aide, coordonnées, accrochages, échelle, état).
 *
 * Composition : outils au pointeur (`planche2d/outils/`, un module par famille, table `OUTILS_PLANCHE`), gestes et vue
 * (`planche2d/outils/gestes.ts`), saisie numérique (`planche2d/outils/formulaire.ts`), enregistrement
 * (`variante/useEnregistrement.ts`), clavier (`variante/useClavierStudio.ts`), garde de navigation
 * (`variante/useGardeNavigation.ts`), panneaux (`variante/`).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../components/Icon";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_RAPPORTS_ACCELERATION, STUDIO_TOOLS, studioVersionProjection, studioVueNiveau, type StudioCameraScene, type StudioCommand, type StudioDocument, type StudioLayer, type StudioPoint, type StudioRapportAcceleration, type StudioLadder, type StudioWall } from "@parcours/atelier-model";
import { moteurPlanche, texteMoteurPlanche } from "./planche2d/rendus/moteur-canvas";
import { useNavigate } from "react-router-dom";
import { BandeauSession } from "./temps-reel/BandeauSession";
import { Superposition2D } from "./temps-reel/Superposition2D";
import { estPresentateur, pointeursFrais } from "./temps-reel/etat-session";
import { useSessionTempsReel } from "./temps-reel/useSessionTempsReel";
import type { AnnotationSession, PointDeVue } from "./temps-reel/api-temps-reel";
import { api, studioExportUrl, type StudioContext } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { LOCALE } from "../../lib/i18n";
import { StudioRefus } from "./studio-ecrans";
import { BarreOutils } from "./planche2d/BarreOutils";
import { useProfilOutils } from "./planche2d/CatalogueOutils";
import { tableRaccourcisPersonnels } from "./planche2d/profils";
import { annulerBrouillon, apercuBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, messageRefus, pasHorsHistorique, peutAnnuler, peutRetablir, retablirBrouillon, type Brouillon } from "./planche2d/brouillon";
import { commandeDisponible, outilDisponible } from "./variante/disponibilite";
import { calqueActifOuPremier, commandeReglage, estVisible, layerIdPour, listeCalques, prochainNomCalque } from "./planche2d/calques";
import { ListeElements } from "./planche2d/ListeElements";
import { AvisRevision } from "./variante/AvisRevision";
import { useFocusConserve } from "./variante/useFocusConserve";
import { CATALOGUE, type EntreeCatalogue } from "./planche2d/catalogue";
import { raisonEntree, type EtatDroit } from "./variante/droits";
import { Dessin2D, type PointPose } from "./planche2d/Dessin2D";
import { cadrer, emprise } from "./planche2d/geometrie-2d";
import { PanneauCalques } from "./planche2d/PanneauCalques";
import { COMMANDES_EDITEUR, OUTILS_BATIMENT, OUTILS_MODES, OUTILS_VOLUME_LIBRE, OUTILS_TRACE, type CibleRaccourci, type CommandeEditeur, type IdCommandeEditeur, type StudioToolEntry, type StudioToolId } from "./planche2d/raccourcis";
import { basculer, commandesDeplacement, elements, estForme, selectionValide, toutSelectionnable, type Element2D } from "./planche2d/selection";
import { zoomerAuCentre } from "./planche2d/vue";
import { aidePlanche, apercuPlanche, outilPlanche } from "./planche2d/outils";
import { traceGeste } from "./taches/trace-geste";
import { CONTENU_INITIAL, formulaireInactif, SOMMETS_INITIAUX, soumettre, VALEURS_INITIALES, valeursObjet, type Valeurs } from "./planche2d/outils/formulaire";
import { useGestesPlanche } from "./planche2d/outils/gestes";
import { ChampMesures } from "./planche2d/accrochage/ChampMesures";
import { estTransformation, optionsDeSaisie } from "./planche2d/outils/modification";
import { commandePolyligne } from "./planche2d/outils/courbes";
import type { ContexteCreation, ModeArc } from "./planche2d/outils/type";
import { commandesAplatir, commandesExtrusion, formesSelectionnees, valeursDe, VALEURS_VIDES, type ValeursExtrusion } from "./vue3d/extrusion";
import { cartoucheInitial } from "./feuille/feuille-ui";
import { revisionDocument } from "./taches/empreinte";
import { PanneauCommentaires } from "./commentaires/PanneauCommentaires";
import { PanneauObservations } from "./observations/PanneauObservations";
import { PanneauQuantites } from "./quantites/PanneauQuantites";
import { PanneauExigences } from "./exigences/PanneauExigences";
import { cibleSelection } from "./exigences/exigences-ui";
import { PanneauArchitecture } from "./planche2d/architecture/PanneauArchitecture";
import { PanneauBatiment } from "./batiment/PanneauBatiment";
import { choixVueValide, type ChoixVueNiveau } from "./batiment/batiment-ui";
import { elementArchitectural, PARAMETRES_ARCHITECTURE_VIDES, type ParametresArchitecture } from "./planche2d/architecture/architecture-ui";
import { CopieDeTravail } from "./variante/CopieDeTravail";
import { AlerteStudio, BandeauHistorique, ChoixConflitStudio, EtatConnexionStudio, libelleModePlanche, SOUS_TITRE_PLANCHE, TitreEspace } from "./variante/BandeauVariante";
import { commandeEclater } from "./blocs/blocs-ui";
import { DialoguesStudio, type DialogueStudio } from "./variante/DialoguesStudio";
import { refused } from "./variante/etat-variante";
import { FormulaireValeurs } from "./variante/FormulaireValeurs";
import { PanneauProprietes } from "./variante/PanneauProprietes";
import { RevisionsPanel } from "./variante/PanneauRevisions";
import { useClavierStudio } from "./variante/useClavierStudio";
import { useEnregistrement } from "./variante/useEnregistrement";
import { lectureApplicable } from "./variante/revision-courante";
import { useChargementVariante } from "./hors-ligne/useChargementVariante";
import { useGardeNavigation } from "./variante/useGardeNavigation";
import { Vue3D } from "./variante/Vue3D";
import { RapportExport } from "./variante/RapportExport";
import { FORMATS_RAPPORT } from "./variante/rapport-export";
import { OUTILS_VISUALISATION, type DemandeVue3d } from "./vue3d/scenes/scenes-ui";
import { useCycleOutils } from "./chargement/useRessources";
import { AvisFileLocale } from "./hors-ligne/AvisFileLocale";
import { cleVariante } from "./hors-ligne/persistance";
import { mesurerCommandes } from "./chargement/mesures-studio";
import { cheminEtudeStudio, cheminOutilConsoleStudio, cheminVarianteStudio, type OptionsDomaineVariante } from "./routes-studio";
import { contexteConsole } from "./console/contexte-console";
import { cibleFocusBascule, deplacerFocusBascule } from "./variante/focus-bascule";
import { panoramiqueClavier } from "./planche2d/vue-clavier";
import {
  dansPaletteDuDomaine, definitionDomaine, DOMAINES_STUDIO, domaineDeLAdresse, domaineExecution, montre2d, montre3d, panneauxDuDomaine, PLANCHE_PAR_DEFAUT,
  type DomaineStudio, type FonctionStudio, type ModePlanche,
} from "./domaines/domaines";
import { LienPublications, NavigationDomaines, SectionDomaine, SelecteurPlanche, useEcranTelephone } from "./domaines/DomainesStudio";
import type { ElementBarre } from "./planche2d/barre-compacte";
import { ActionsEspace, BarreEtat, PanneauLateral } from "./espace/EspaceStudio";
import { memoriserContexte } from "./accueil/dernier-contexte";
import "./studio.css";
import "./planche2d/planche2d.css";

/** Clé de version de la projection du plan 2D du brouillon (lot C.2) : révision de session et empreinte du contenu lu (les aperçus de geste, transitoires, ne sont pas versionnés). */
function versionPlan(doc: StudioDocument): string {
  const v = studioVersionProjection(doc, "plan-2d", String(revisionDocument(doc)));
  return `${v.revision}:${v.contenu}`;
}

/**
 * `commentairesOuverts` : panneau des commentaires ouvert à l'arrivée (adresse `?commentaires=ouverts`, lien de notification).
 * `domaine`, `planche` : domaine et planche actifs lus dans l'adresse (I.4-03, proposition, `routes-studio.ts`), `null`
 * s'ils n'y figurent pas ; `surAdresse` réécrit l'adresse (remplacement, sans entrée d'historique) quand ils changent,
 * avec l'état réel du panneau des commentaires.
 */
export interface VariantWorkspaceProps {
  projectId: string; studyId: string; variantId: string; revisionId: string | null; commentairesOuverts?: boolean;
  domaine?: DomaineStudio | null; planche?: ModePlanche | null;
  /** Console : outil ouvert sans projet (les identifiants ci-dessus sont alors vides et jamais lus). */
  autonome?: boolean;
  /** Console : l'étude créée par « Enregistrer dans un projet » est prête ; ouvre sa variante dans le même domaine. */
  surEnregistreVersProjet?: (c: { projectId: string; studyId: string; variantId: string }, o: { domaine: DomaineStudio; planche: ModePlanche | null }) => void;
  surAdresse?: (a: { domaine: DomaineStudio; planche: ModePlanche | null; commentaires: boolean }, options: { remplacer: boolean }) => void;
}

/** Palette d'un domaine : filtre stable par domaine (la barre ne recalcule pas ses familles à chaque rendu). */
const FILTRES_PALETTE: Readonly<Record<DomaineStudio, (e: ElementBarre) => boolean>> = Object.freeze(Object.fromEntries(
  DOMAINES_STUDIO.map((d) => [d.id, (e: ElementBarre) => dansPaletteDuDomaine(e, d.id)]),
) as Record<DomaineStudio, (e: ElementBarre) => boolean>);

/** Titre du panneau latéral de chaque fonction (les blocs de la référence, `FONCTIONS_STUDIO`). */
const TITRES_PANNEAUX: Readonly<Partial<Record<FonctionStudio, string>>> = Object.freeze({
  elements: "Éléments", exigences: "Propriétés et exigences", "scenes-rendus": "Scènes, apparence et rendus", publications: "Publications",
  "commentaires-observations": "Commentaires et observations", revisions: "Historique des révisions", metre: "Quantités",
});

/**
 * Hauteur disponible sous le haut de l'élément jusqu'au bas de la fenêtre (l'espace remplit l'écran dans l'enveloppe de
 * Fadi, barre latérale et en-tête conservés), relue au redimensionnement ; jamais moins de `minimum`.
 */
function useHauteurDisponible(ref: { current: HTMLElement | null }, minimum: number, actif: boolean): number | undefined {
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!actif) return;
    const lire = () => {
      const el = ref.current;
      if (!el) return;
      const haut = el.getBoundingClientRect().top + window.scrollY;
      setH(Math.max(minimum, Math.floor(window.innerHeight - haut - 6)));
    };
    lire();
    window.addEventListener("resize", lire);
    return () => window.removeEventListener("resize", lire);
  });
  return actif ? h : undefined;
}

/** Panneaux latéraux qui lisent ou écrivent dans une étude : indisponibles dans la Console (aucun projet). */
const PANNEAUX_D_ETUDE: ReadonlySet<FonctionStudio> = new Set<FonctionStudio>(["exigences", "publications", "commentaires-observations", "revisions", "metre"]);
/** Commandes qui passent par le serveur (exports de la révision enregistrée, feuilles du dossier) : indisponibles dans la Console. */
const COMMANDES_D_ETUDE: ReadonlySet<IdCommandeEditeur> = new Set<IdCommandeEditeur>(["exporter-svg", "exporter-dxf", "exporter-ifc", "exporter-obj", "exporter-stl", "exporter-step", "dossier", "modeles-externes", "illustration", "agents", "approuver", "fusionner-variantes", "annuler-fusion"]);

export function VariantWorkspace({ projectId, studyId, variantId, revisionId, commentairesOuverts = false, domaine = null, planche = null, autonome = false, surEnregistreVersProjet, surAdresse }: VariantWorkspaceProps) {
  const [context, setContext] = useState<StudioContext | null>(() => (autonome ? contexteConsole() : null));
  const [brouillon, setBrouillon] = useState<Brouillon | null>(() => (autonome ? creerBrouillon(contexteConsole().revision.document) : null));
  const [tool, setTool] = useState<StudioToolId>("studio.dessin.selection");
  const [selection, setSelection] = useState<string[]>([]);
  const [trace, setTrace] = useState<PointPose | null>(null);
  // Points posés après le premier : passage ou début d'un arc, sommets suivants d'une polyligne.
  const [suite, setSuite] = useState<StudioPoint[]>([]);
  const [modeArc, setModeArc] = useState<ModeArc>("trois-points");
  const [sommetsTexte, setSommetsTexte] = useState(SOMMETS_INITIAUX);
  const [fermee, setFermee] = useState(false);
  // Texte saisi pour l'outil Texte (contenu du projet, jamais traduit) et sa justification.
  const [texteSaisi, setTexteSaisi] = useState(CONTENU_INITIAL);
  const [accrocheSommets, setAccrocheSommets] = useState(true);
  const [accrocheGrille, setAccrocheGrille] = useState(false);
  const [dialogue, setDialogue] = useState<DialogueStudio>(null);
  // Lot F : rendu du modèle capturé par la vue 3D pour l'illustration (ouvre la boîte « Illustration depuis la vue »).
  const [captureIllustration, setCaptureIllustration] = useState<{ png: Uint8Array; provenance: { revisionId: string; scene: { nom: string } | null } } | null>(null);
  // Rapport de fidélité du dernier export lancé (E.6-03) : boîte non modale, fermée à la demande.
  const [rapportExport, setRapportExport] = useState<"exporter-svg" | "exporter-dxf" | "exporter-ifc" | null>(null);
  // Compteur des lancements d'export : chaque export a son propre rapport (jamais celui d'une révision précédente).
  const [exportsLances, setExportsLances] = useState(0);
  const { user } = useAuth();
  const [calqueActif, setCalqueActif] = useState<string>(STUDIO_DEFAULT_LAYER_ID);
  // Moteur de la planche (F.1-02) : Canvas seulement avec un rapport de comparaison qualifiant (règle F.1-01) — rapport
  // versionné du dépôt, ou proposé par une recette (`__fadiStudioRendu.proposer`) ; SVG sinon (DEC-08).
  const [rapportCanvas, setRapportCanvas] = useState<StudioRapportAcceleration | null>(() => STUDIO_RAPPORTS_ACCELERATION.find((r) => r.acceleration === "rendu-canvas-planche") ?? null);
  const moteur2d = useMemo(() => moteurPlanche(rapportCanvas), [rapportCanvas]);
  useEffect(() => {
    const crochet = { proposer: (r: StudioRapportAcceleration | null) => setRapportCanvas(r), moteur: () => moteur2d };
    (globalThis as { __fadiStudioRendu?: unknown }).__fadiStudioRendu = crochet;
    return () => { if ((globalThis as { __fadiStudioRendu?: unknown }).__fadiStudioRendu === crochet) delete (globalThis as { __fadiStudioRendu?: unknown }).__fadiStudioRendu; };
  }, [moteur2d]);
  const [nomCalque, setNomCalque] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!autonome);
  const [values, setValues] = useState<Valeurs>(VALEURS_INITIALES);
  const [extrusion, setExtrusion] = useState<ValeursExtrusion>(VALEURS_VIDES);
  // Mode des planches de Dessin et modélisation (I.4-02) : Planche 2D, Planche 3D (vue 3D du modèle) ou Double vue ;
  // `?domaine=dessin&planche=3d|double` l'ouvre à l'arrivée.
  // État d'affichage DÉRIVÉ DE L'ADRESSE (une seule source, partagée avec le menu « Studio » de la barre latérale) :
  // domaine, planche et commentaires. Seule une adresse antérieure sans domaine garde la planche en mémoire locale
  // (bascule Maj+D sans réécriture de l'adresse, comportement antérieur conservé).
  const [plancheLocale, setPlancheLocale] = useState<ModePlanche>(PLANCHE_PAR_DEFAUT);
  const modePlanche: ModePlanche = domaine !== null ? planche ?? PLANCHE_PAR_DEFAUT : plancheLocale;
  // Domaine affiché (I.4-01) : celui de l'adresse ; sinon Documentation pour une adresse qui ouvre les commentaires ;
  // sinon Dessin et modélisation.
  const domaineActif: DomaineStudio = domaineDeLAdresse(domaine, commentairesOuverts);
  /** Ce que montre le canevas : la planche choisie en Dessin, la vue 3D en Visualisation, le plan ailleurs. */
  const affichage: ModePlanche = domaineActif === "dessin" ? modePlanche : domaineActif === "visualisation" ? "3d" : "2d";
  const vue3d = montre3d(affichage), plan2d = montre2d(affichage);
  /** Planche affichée avant une bascule demandée par l'utilisateur (Maj+D, sélecteur de planche) ; null sinon. */
  const basculeDemandee = useRef<ModePlanche | null>(null);
  useEffect(() => {
    const avant = basculeDemandee.current;
    if (avant === null) return;
    basculeDemandee.current = null;
    const cible = cibleFocusBascule(avant, affichage);
    return cible && shell.current ? deplacerFocusBascule(shell.current, cible) : undefined;
  }, [affichage]);
  // Vue 3D : navigation (orbite ou plan), coupe horizontale affichée, solide libre sélectionné.
  const [navigation3d, setNavigation3d] = useState<"orbite" | "plan">("orbite");
  const [coupe3d, setCoupe3d] = useState(false);
  const [solide3d, setSolide3d] = useState<string | null>(null);
  // Visualisation (lot E.5) : outil de scène / d'apparence ou export PNG demandé à la vue 3D, qui l'ouvre.
  const [demande3d, setDemande3d] = useState<DemandeVue3d | null>(null);
  const demander3d = (action: string) => { ouvrir3d(true); setDemande3d(d => ({ action, n: (d?.n ?? 0) + 1 })); };
  const commentaires = commentairesOuverts;
  // Panneaux de la vue 3D (portail) : dans Dessin et modélisation (Planche 3D) ou dans Visualisation (scènes, rendus).
  const [hote3dDessin, setHote3dDessin] = useState<HTMLElement | null>(null);
  const [hoteVisualisation, setHoteVisualisation] = useState<HTMLElement | null>(null);
  // Colonne des panneaux latéraux : repliable (bureau) ; au téléphone, les panneaux passent sous l'écran de travail.
  const [panneauxOuverts, setPanneauxOuverts] = useState(true);
  // Vue par niveau (lot W3-B) : la planche et la vue 3D montrent les objets d'un niveau ; les commandes visent le document entier.
  const [vueNiveau, setVueNiveau] = useState<ChoixVueNiveau>(null);
  const [masquerLibres, setMasquerLibres] = useState(false);
  const ecran = useRef<HTMLDivElement>(null);
  // Architecture (A.4) : paramètres saisis des outils Mur / Ouverture et objet architectural sélectionné (2D ou 3D).
  const [parametresArchi, setParametresArchi] = useState<ParametresArchitecture>(PARAMETRES_ARCHITECTURE_VIDES);
  const [selectionArchi, setSelectionArchi] = useState<string | null>(null);
  const alive = useRef(true), dirty = useRef(false);
  /** Contexte et brouillon du dernier rendu (comparés par les lectures asynchrones avant de s'appliquer, A.5-10). */
  const affiche = useRef({ context, brouillon });
  affiche.current = { context, brouillon };
  const shell = useRef<HTMLElement>(null), nomRef = useRef<HTMLInputElement>(null);
  const historical = revisionId !== null;
  const drawing = brouillon ? documentBrouillon(brouillon) : null;
  const commands = brouillon ? commandesEnAttente(brouillon) : [];
  const enr = useEnregistrement({
    projectId, studyId, variantId, historical, autonome, context, brouillon, alive, setError, setInfo,
    surVersionServeur: (current) => {
      setContext(current); setBrouillon(creerBrouillon(current.revision.document)); cancelTrace();
      const doc = current.revision.document;
      const restants = selectionIds.filter(id => elements(doc).some(e => e.id === id));
      setSelection(restants);
      const seul = restants.length === 1 ? elements(doc).find(e => e.id === restants[0]) : undefined;
      if (seul) properties(seul);
    },
    surRebase: (accuse, rebase) => { setContext(accuse); setBrouillon(rebase); cancelTrace(); },
  });
  const { pending, uncertain, blocked } = enr;
  useFocusConserve(pending);
  dirty.current = commands.length > 0 || !!trace || pending || uncertain;
  // Hors ligne, derrière une enveloppe en attente, le dessin reste permis (`enr.dessinHorsLigne`).
  const writable = !historical && !!context?.canWrite && !pending && (!uncertain || enr.dessinHorsLigne) && !blocked;
  // Données réelles du cartouche de la feuille (mêmes clés que le fil d'Ariane et l'historique : cache partagé).
  const projet = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry: (n, e) => !refused(e) && n < 1, enabled: !!context && !autonome });
  // Catalogue autorisé (B.2-06) : motif réel d'un refus d'écriture (rôle, référence protégée, verrou), lecture seule.
  const catalogueAutorise = useQuery({ queryKey: ["studio-catalogue-outils", projectId], queryFn: () => api.studioCatalogueOutils(projectId), staleTime: 30_000, retry: (n, e) => !refused(e) && n < 1, enabled: !!context && !autonome });
  const revisionsFeuille = useQuery({ queryKey: ["studio-revisions", projectId, studyId, variantId], queryFn: () => api.studioRevisions(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1, enabled: dialogue === "feuille" && !autonome });
  const revisionAffichee = revisionsFeuille.data?.revisions.find(r => r.id === context?.revision.id);

  // Lecture de la variante, avec reprise du brouillon hors ligne conservé sur l'appareil (`hors-ligne/`).
  useChargementVariante({ projectId, studyId, variantId, revisionId, alive, setContext, setBrouillon, setLoadError, setError, setLoading, reprendre: enr.reprendre, inactif: autonome });
  // Console : ce qui est dessiné n'existe que dans la page ; la quitter (lien, retour, fermeture) demande confirmation.
  useGardeNavigation(dirty, { chemin: autonome ? cheminOutilConsoleStudio("dessin").split("?")[0]! : cheminVarianteStudio(projectId, studyId, variantId), revision: revisionId });

  // ——— Domaines et planche (I.4) : l'adresse fait foi ———
  // Historique (ADR-STUDIO-NAV-01) : changer de domaine AJOUTE une entrée (le retour arrière revient au domaine
  // précédent, sans quitter la variante ni décharger son état : la clé de la planche ne dépend pas du domaine) ;
  // changer de planche ou ouvrir / fermer les commentaires dans le même domaine la REMPLACE. Une adresse sans domaine
  // (adresses antérieures) n'est réécrite qu'au premier choix explicite.
  const plancheActive: ModePlanche = modePlanche;
  const telephone = useEcranTelephone();
  const adresseSuivie = domaine !== null;
  function ecrireAdresse(a: { domaine: DomaineStudio; planche: ModePlanche | null; commentaires: boolean }, remplacer: boolean) {
    surAdresse?.({ ...a, planche: a.domaine === "dessin" ? a.planche ?? modePlanche : null }, { remplacer });
  }
  /** Domaine et planche inscrits dans l'adresse, repris par les liens vers une autre révision de la variante. */
  const adresseDomaine: OptionsDomaineVariante = adresseSuivie ? { domaine: domaineActif, planche: domaineActif === "dessin" ? plancheActive : null } : {};
  function choisirDomaine(id: DomaineStudio, planchePour: ModePlanche | null = null) {
    if (id === domaineActif && adresseSuivie && planchePour === null) return;
    // Les commentaires appartiennent à Documentation : les quitter les referme dans l'adresse.
    ecrireAdresse({ domaine: id, planche: planchePour, commentaires: id === "documentation" && commentaires }, id === domaineActif);
  }
  function choisirPlanche(p: ModePlanche) {
    if (domaineActif !== "dessin") { choisirDomaine("dessin", p); return; }
    ecrireAdresse({ domaine: "dessin", planche: p, commentaires: false }, true);
  }
  /** Mode des planches de Dessin et modélisation : dans l'adresse si elle porte le domaine, sinon en mémoire locale. */
  function poserPlanche(p: ModePlanche) {
    if (domaineActif !== "dessin") { choisirDomaine("dessin", p); return; }
    // TR-EX-036 : la bascule demandée déplace le focus, de façon visible, vers la planche qui apparaît.
    basculeDemandee.current = modePlanche;
    if (adresseSuivie) ecrireAdresse({ domaine: "dessin", planche: p, commentaires: false }, true);
    else setPlancheLocale(p);
  }
  /**
   * Montre la vue 3D : en Dessin et modélisation, la Planche 3D (la Double vue reste) ; en Visualisation, elle y est
   * déjà ; ailleurs, Dessin et modélisation en Planche 3D — ou, pour une demande de rendu (`rendu`), Visualisation.
   */
  function ouvrir3d(rendu = false) {
    if (domaineActif === "visualisation") return;
    if (domaineActif !== "dessin") { if (rendu) choisirDomaine("visualisation"); else choisirDomaine("dessin", "3d"); return; }
    if (modePlanche === "2d") poserPlanche("3d");
  }
  /** Commentaires : leur panneau appartient à Documentation, métrés et collaboration ; l'ouvrir y conduit. */
  function basculerCommentaires() {
    if (commentaires && domaineActif === "documentation") { ecrireAdresse({ domaine: "documentation", planche: null, commentaires: false }, true); return; }
    ecrireAdresse({ domaine: "documentation", planche: null, commentaires: true }, domaineActif === "documentation");
  }
  /** Adresse d'un lien de domaine : celle de la variante (révision et commentaires compris) avec ce domaine. */
  const adresseDuDomaine = (id: DomaineStudio) => autonome
    ? cheminOutilConsoleStudio(id, { planche: id === "dessin" ? plancheActive : null })
    : cheminVarianteStudio(projectId, studyId, variantId, revisionId, { commentaires, domaine: id, planche: id === "dessin" ? plancheActive : null });
  // Fil d'Ariane (NAV-006) : la révision nommée suit la révision affichée — l'étude est relue à chaque nouvelle tête.
  const client = useQueryClient();
  useEffect(() => { if (context && !autonome) void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] }); }, [context?.revision.id]);
  // Dernier contexte personnel (suggestion de reprise de l'accueil, vérifiée par le serveur à la reprise).
  const { user: compte } = useAuth();
  useEffect(() => {
    if (!context || historical || autonome) return;
    memoriserContexte(compte?.id, { projectId, studyId, variantId, domaine: domaineActif, planche: domaineActif === "dessin" ? modePlanche : null, noms: { etude: context.study.name, variante: context.variant.name, ...(projet.data ? { projet: projet.data.code } : {}) } });
  }, [context?.variant.id, context?.study.name, context?.variant.name, domaineActif, modePlanche, historical, compte?.id, projet.data?.code]);

  // ——— Sélection et calques (lectures dérivées du brouillon) ———
  const selectionIds = drawing ? selectionValide(drawing, selection) : [];
  const selectionSet = new Set(selectionIds);
  const itemDe = (id: string | undefined) => (id && drawing ? elements(drawing).find(e => e.id === id) ?? null : null);
  // Calque d'un élément choisi, murs (A.4) compris : `elements` ne parcourt pas `architecture`.
  const calqueDe = (id: string): string => itemDe(id)?.layerId ?? drawing?.architecture?.find((a): a is StudioWall | StudioLadder => a.id === id && a.type !== "opening")?.layerId ?? STUDIO_DEFAULT_LAYER_ID;
  const selected = selectionIds.length === 1 ? itemDe(selectionIds[0]) : null;
  // Objet du panneau Architecture : l'ouverture ou le mur désigné, ou le seul mur de la sélection.
  const panneauArchi = elementArchitectural(drawing, selectionArchi) ? selectionArchi
    : selectionIds.length === 1 && (elementArchitectural(drawing, selectionIds[0]!)?.type ?? "opening") !== "opening" ? selectionIds[0]! : null;
  const calques = drawing ? listeCalques(drawing) : [];
  const { calque: actif, repli: calqueReplie } = calqueActifOuPremier(calques, calqueActif);
  // Le calque actif a disparu : le premier calque devient réellement actif (il ne reviendra pas seul après un rétablir).
  useEffect(() => { if (calqueReplie && actif) setCalqueActif(actif.id); }, [calqueReplie, actif?.id]);
  // Le champ de renommage reprend le nom du calque actif quand celui-ci change (choix, création, annulation).
  useEffect(() => { if (actif) setNomCalque(actif.name); }, [actif?.id, actif?.name]);

  // ——— Planche : outil au pointeur, gestes et vue ———
  const moveWithPointer = (tool === "studio.dessin.deplacer" || estTransformation(tool)) && selectionIds.length > 0;
  const pointsActifs = OUTILS_TRACE.has(tool) || moveWithPointer;
  const outil = outilPlanche(tool);
  const gestes = useGestesPlanche({
    drawing, outil: tool, writable, selectionIds, selectionSet, accrocheSommets, accrocheGrille, pointsActifs,
    exclureAuSurvol: outil?.horsSelection && trace ? selectionSet : undefined, select, moveSelection,
    base: suite[suite.length - 1] ?? trace?.point ?? null,
  });
  const { cadre, pas, survol, poserCadre, cadreRef } = gestes;
  /** TR-EX-036 : la planche 2D ayant le focus, les flèches déplacent la vue (Maj : d'une demi-vue), sans glisser. */
  function panoramiquePlanche(e: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; target: EventTarget; preventDefault: () => void }) {
    if (e.altKey || e.ctrlKey || e.metaKey || !(e.target instanceof SVGSVGElement)) return;
    const suivant = panoramiqueClavier(cadreRef.current, e.key, e.shiftKey);
    if (!suivant) return;
    e.preventDefault();
    poserCadre(suivant);
  }

  // ——— Session en direct (Issue #283, RTC-2) : présence, vue du présentateur, pointeurs et sélections partagés ———
  const navigate = useNavigate();
  const tr = useSessionTempsReel(projectId, studyId, variantId, !autonome && !!context);
  const enDirect = tr.etat.connexion === "connecte";
  const presenteEnDirect = enDirect && estPresentateur(tr.etat);
  const [cameraPartagee, setCameraPartagee] = useState<{ camera: StudioCameraScene; n: number } | null>(null);
  const derniereCamera = useRef<StudioCameraScene | undefined>(undefined);
  // Suivi : la vue du présentateur est posée (cadre du plan, caméra 3D), jamais la sélection, le brouillon ni la révision.
  useEffect(() => {
    const v = tr.etat.vue;
    if (!enDirect || presenteEnDirect || !tr.suit || !v) return;
    if (v.plan && plan2d) poserCadre(v.plan);
    // La caméra posée par le suivi devient la vue courante (point de vue d'une annotation), sans être rediffusée.
    if (v.camera && vue3d) { derniereCamera.current = v.camera as StudioCameraScene; setCameraPartagee({ camera: v.camera as StudioCameraScene, n: tr.etat.vueN }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr.etat.vueN, tr.suit, enDirect, presenteEnDirect]);
  // Présentateur : sa vue part à chaque changement (le canal regroupe : 10 par seconde au plus).
  useEffect(() => {
    if (!presenteEnDirect) return;
    tr.canal.partagerVue({ affichage, ...(plan2d ? { plan: cadre } : {}), ...(vue3d && derniereCamera.current ? { camera: derniereCamera.current } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenteEnDirect, cadre, affichage]);
  const partagerCamera = (c: StudioCameraScene) => {
    derniereCamera.current = c;
    if (presenteEnDirect) tr.canal.partagerVue({ affichage, camera: c, ...(plan2d ? { plan: cadreRef.current } : {}) });
  };
  // Pointeur (planche 2D) de chacun, montré aux autres avec son nom : position écran ramenée au repère `local-2d`.
  const pointeurSession = (e: { clientX: number; clientY: number; currentTarget: EventTarget } | null) => {
    if (!enDirect) return;
    const svg = e && (e.currentTarget as HTMLElement).querySelector<SVGSVGElement>(":scope > svg");
    const m = svg?.getScreenCTM();
    if (!e || !m) { tr.canal.pointeur(null); return; }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    tr.canal.pointeur({ espace: "plan", x: p.x, y: p.y });
  };
  useEffect(() => {
    if (enDirect) tr.canal.selection(selectionIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enDirect, selectionIds.join("\u0000")]);
  const nomsSession = Object.fromEntries(tr.etat.participants.map((p) => [p.userId, p.nom]));
  // Pointeurs distants : relus chaque seconde tant qu'il y en a, pour qu'un pointeur périmé (10 s) disparaisse même
  // sans autre rendu.
  const [, setHorlogePointeurs] = useState(0);
  const pointeursEnCours = enDirect && Object.keys(tr.etat.pointeurs).length > 0;
  useEffect(() => {
    if (!pointeursEnCours) return;
    const t = setInterval(() => setHorlogePointeurs((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pointeursEnCours]);
  // Annotations (RTC-3) : la vue de cet écran devient le point de vue enregistré ; revoir un point de vue libère du suivi.
  const vueCourante = (): PointDeVue => ({ affichage, ...(plan2d ? { plan: cadreRef.current } : {}), ...(vue3d && derniereCamera.current ? { camera: derniereCamera.current } : {}) });
  const [cameraAnnotation, setCameraAnnotation] = useState<{ camera: StudioCameraScene; n: number } | null>(null);
  // Reprendre le suivi oublie la caméra d'annotation : elle ne doit pas revenir au prochain passage en navigation libre.
  useEffect(() => { if (tr.suit) setCameraAnnotation(null); }, [tr.suit]);
  const voirPointDeVue = (a: AnnotationSession) => {
    if (tr.suit && !presenteEnDirect) tr.actions.suivre(false);
    const v = a.pointDeVue;
    if (v.plan && plan2d) poserCadre(v.plan);
    if (v.camera && vue3d) { derniereCamera.current = v.camera; setCameraAnnotation((c) => ({ camera: v.camera!, n: (c?.n ?? 1_000_000) + 1 })); }
  };
  // Aperçu du glisser : le document tel que le relâchement le donnerait (les cotes liées suivent).
  const apercuDoc = useMemo(() => {
    if (!drawing || !gestes.apercu) return null;
    return apercuBrouillon(drawing, commandesDeplacement(drawing, gestes.apercu.ids, gestes.apercu.dx, gestes.apercu.dy).commandes);
  }, [drawing, gestes.apercu]);

  function properties(o: Element2D) {
    // Les valeurs d'extrusion affichées sont celles que l'utilisateur a saisies pour cet objet, jamais une proposition.
    const saisies = estForme(o) ? valeursDe(o) : null;
    setExtrusion(saisies ?? VALEURS_VIDES);
    const r = valeursObjet(o);
    if (r.maj) setValues(r.maj);
    if (r.sommets) { setSommetsTexte(r.sommets.texte); setFermee(r.sommets.fermee); }
    if (r.texte) setTexteSaisi(r.texte);
  }
  function select(ids: string[]) {
    setSelection(ids);
    setSelectionArchi(null);
    const o = ids.length === 1 ? itemDe(ids[0]) : null;
    if (o) properties(o);
    else if (ids.length > 1) {
      // Sélection multiple : des valeurs d'extrusion ne s'affichent que si tous les objets ont exactement les mêmes.
      const valeurs = ids.map((id) => { const x = itemDe(id); return x && estForme(x) ? JSON.stringify(valeursDe(x)) : "null"; });
      setExtrusion(new Set(valeurs).size === 1 && valeurs[0] !== "null" ? JSON.parse(valeurs[0]!) as ValeursExtrusion : VALEURS_VIDES);
    }
  }

  /**
   * Désignation d'un mur ou d'une ouverture (planche, vue 3D, panneau) : un mur entre dans la sélection de la planche
   * (transformations, suppression, calque) ; une ouverture, qui suit son mur, n'est désignée que pour être modifiée.
   */
  function choisirArchitecture(id: string, ajouter: boolean) {
    const it = elementArchitectural(drawing, id);
    if (!it) return;
    if (it.type !== "opening") select(ajouter ? basculer(selectionIds, id) : [id]);
    else select([]);
    if (!ajouter) setSelectionArchi(id);
  }

  /** Applique un lot localement (un pas d'historique) ; rien n'est envoyé avant « Enregistrer ». */
  function apply(cs: StudioCommand[]): boolean {
    if (!brouillon || !writable) return false;
    // EX-008 : l'intention (outil du geste) précède la commande appliquée au brouillon par le modèle.
    traceGeste.noter("intention", { outil: tool ? String(tool) : cs[0]?.toolId });
    try {
      const next = mesurerCommandes(cs, () => appliquerBrouillon(brouillon, cs));
      setBrouillon(next);
      traceGeste.noter("commande", { outil: cs.map((c) => c.toolId).join(" ") });
      const doc = documentBrouillon(next);
      const seul = selectionIds.length === 1 ? selectionIds[0] : undefined;
      const updated = seul ? elements(doc).find(e => e.id === seul) : undefined;
      if (updated) properties(updated);
      enr.setSaved(false); setError(""); setInfo("");
      return true;
    } catch (e) { setError(messageRefus(e)); return false; }
  }
  const layerId = () => layerIdPour(actif?.id ?? STUDIO_DEFAULT_LAYER_ID);
  const creation = (): ContexteCreation => ({
    nouvelId: () => crypto.randomUUID(), layerId: layerId(), decalageCote: values.offset, rayonAngulaire: values.ra,
    texte: { contenu: texteSaisi.contenu, hauteur: values.h, rotation: values.rot, justification: texteSaisi.justification },
    architecture: parametresArchi,
  });
  const contexteClic = () => ({ ...creation(), tolerance: gestes.tolerance(), selection: selectionIds, options: optionsDeSaisie(values), document: drawing });
  /** Termine la polyligne en cours (ouverte, ou fermée sur son premier sommet). */
  function finishPolyline(closed: boolean) {
    if (tool !== "studio.dessin.polyligne" || !trace) return;
    const points = [trace.point, ...suite];
    if (points.length < (closed ? 3 : 2)) { setError(closed ? "Une polyligne fermée a trois sommets au moins." : "Une polyligne a deux sommets au moins."); return; }
    const r = commandePolyligne(creation(), points, closed);
    if (r.type === "commandes" && apply(r.commandes)) cancelTrace();
  }
  /** Décalage de chaque objet sélectionné (les cotes ne se décalent pas) ; les nouveaux objets deviennent la sélection. */
  function offsetSelection(distance: number) {
    if (!drawing) return;
    const formes = formesSelectionnees(drawing, selectionIds);
    if (!formes.length) { setInfo("Sélectionnez d’abord l’objet à décaler."); return; }
    if (!(Number.isFinite(distance) && distance !== 0)) { setError("Saisissez une distance non nulle, en mètres."); return; }
    const nouveaux = formes.map(() => crypto.randomUUID());
    if (apply(formes.map((o, i) => ({ toolId: "studio.dessin.decaler", params: { id: o.id, newId: nouveaux[i]!, distance } })))) setSelection(nouveaux);
  }
  /** Déplacement de toute la sélection : une commande par objet, un seul pas d'historique. */
  function moveSelection(ids: readonly string[], dx: number, dy: number): boolean {
    if (!drawing) return false;
    const { commandes, cotesLiees } = commandesDeplacement(drawing, ids, dx, dy);
    if (!commandes.length) { if (cotesLiees.length) setInfo("Les cotes liées suivent leurs objets : elles ne se déplacent pas seules."); return cotesLiees.length === 0; }
    const ok = apply(commandes);
    if (ok && cotesLiees.length) setInfo("Les cotes liées suivent leurs objets : elles ne se déplacent pas seules.");
    return ok;
  }
  /** Clic sur la planche : le premier pose le point de départ, les suivants sont interprétés par l'outil actif. */
  function board(e: MouseEvent<SVGSVGElement>) {
    if (!pointsActifs) { if (tool === "studio.dessin.selection" && !e.shiftKey) { select([]); setSelectionArchi(null); } return; }
    if (!writable || !outil) return;
    const p = gestes.pose(e, outil.horsSelection && trace ? selectionSet : undefined); if (!p) return;
    poser(p);
  }
  /** Point posé (clic ou saisie directe du champ « Mesures ») : premier point, ou point interprété par l'outil actif. */
  function poser(p: PointPose) {
    if (!writable || !outil) return;
    const contexte = contexteClic();
    // Outil à un clic (Texte) : le premier clic agit aussitôt.
    if (!trace && !outil.premierClic) { setTrace(p); setSuite([]); return; }
    const action = !trace ? outil.premierClic!(p, contexte) : outil.clic({ outil: tool, trace, suite, modeArc }, p, contexte);
    switch (action.type) {
      case "deplacer": if (moveSelection(selectionIds, action.dx, action.dy)) { setTrace(null); gestes.setSurvol(null); } return;
      case "sommet": setSuite(action.suite); setError(""); return;
      case "terminer-polyligne": return finishPolyline(action.fermee);
      case "erreur": setError(action.message); return;
      case "commandes": if (apply(action.commandes)) { if (action.apres === "annuler-trace") cancelTrace(); else setTrace(null); } return;
    }
  }
  /** Saisie numérique : mêmes commandes que le pointeur. */
  function numeric(e: FormEvent) {
    e.preventDefault();
    const a = soumettre({ tool, values, sommetsTexte, fermee, selected, selectionIds, drawing, creation: creation(), texte: texteSaisi });
    if (a.type === "erreur") setError(a.message);
    else if (a.type === "deplacer") moveSelection(selectionIds, a.dx, a.dy);
    else if (a.type === "decaler") offsetSelection(a.distance);
    else if (a.type === "commandes") apply(a.commandes);
  }

  // ——— Outils et commandes ———
  // Un outil actif absent de la palette du domaine affiché (Ligne puis BIM, par l'onglet, le menu ou l'historique)
  // n'agirait plus sur le canevas sans être montré : on revient à Sélection (revue #207).
  useEffect(() => {
    if (tool !== "studio.dessin.selection" && !dansPaletteDuDomaine({ type: "outil", id: tool }, domaineActif)) { setTool("studio.dessin.selection"); cancelTrace(); }
  }, [domaineActif]);
  function cancelTrace() { setTrace(null); setSuite([]); gestes.setSurvol(null); }
  function runTool(toolId: StudioToolId) {
    // Les outils du volume libre agissent dans la vue 3D : ils l'ouvrent.
    if (OUTILS_VOLUME_LIBRE.has(toolId)) ouvrir3d();
    if (OUTILS_VISUALISATION.has(toolId)) { demander3d(toolId); return; }
    if (OUTILS_MODES.has(toolId)) { setTool(toolId); cancelTrace(); setInfo(""); return; }
    if (!writable || !drawing) return;
    // Propriétés BIM (E.1) : le formulaire du panneau « Propriétés et exigences » porte la saisie.
    if (toolId === "studio.propriete.definir" || toolId === "studio.propriete.retirer") {
      const b = shell.current?.querySelector<HTMLButtonElement>(`[data-studio-propriete-action="${toolId}"]`);
      if (b) b.click(); else setInfo("Sélectionnez d’abord un mur, une ouverture ou un objet extrudé.");
      return;
    }
    // Graphismes (EX-055) et système de projet (EX-023) : saisis dans leur boîte ; un graphisme sélectionné se retire aussitôt.
    if (toolId === "studio.graphisme.creer") { setDialogue("graphismes"); return; }
    if (toolId === "studio.repere.projet") { setDialogue("systeme-projet"); return; }
    // Blocs définis par l'utilisateur et contraintes (X.1-01) : saisis dans leur boîte ; une insertion sélectionnée s'éclate aussitôt.
    if (toolId === "studio.bloc.definir" || toolId === "studio.bloc.inserer") { setDialogue("blocs"); return; }
    if (toolId === "studio.contrainte.poser") { setDialogue("contraintes"); return; }
    if (toolId === "studio.bloc.eclater") {
      const r = commandeEclater(drawing, selectionIds);
      if ("erreur" in r) { setInfo(r.erreur); return; }
      if (apply(r.commandes)) select(selectionIds.filter((id) => !r.commandes.some((c) => (c.params as { ids: string[] }).ids.includes(id))));
      return;
    }
    // Source importée (EX-014) : elle accompagne un import DXF ; le raccourci ouvre « Importer DXF ».
    if (toolId === "studio.source.declarer") { setDialogue("import-dxf"); setInfo("Une source se déclare avec son import : choisissez le fichier DXF."); return; }
    if (toolId === "studio.graphisme.retirer") {
      const ids = selectionIds.filter((id) => drawing.graphismes?.some((g) => g.id === id));
      if (ids.length) { if (apply([{ toolId: "studio.graphisme.retirer", params: { ids } }])) select(selectionIds.filter((id) => !ids.includes(id))); }
      else setDialogue("graphismes");
      return;
    }
    if (toolId === "studio.dessin.supprimer" && selectionIds.length && selectionIds.every((id) => drawing.graphismes?.some((g) => g.id === id))) {
      if (apply([{ toolId: "studio.graphisme.retirer", params: { ids: selectionIds } }])) setSelection([]);
      return;
    }
    // Éléments non natifs (lot F3) : ils naissent d'un import (Importer IFC) ; on les retire depuis « Éléments du dessin ».
    if (toolId === "studio.nonnatif.conserver") { setDialogue("import-ifc"); setInfo("Un élément non natif naît d’un import : choisissez le fichier IFC."); return; }
    if (toolId === "studio.nonnatif.retirer") {
      const b = shell.current?.querySelector<HTMLButtonElement>("[data-studio-nonnatif-retirer]");
      if (b && !b.disabled) b.click(); else setInfo("Cochez d’abord, dans « Éléments du dessin », l’élément non natif à retirer.");
      return;
    }
    if (toolId === "studio.solide.supprimer") {
      if (!solide3d || !drawing.solides?.some(s => s.id === solide3d)) { setInfo("Sélectionnez d’abord, dans la vue 3D, le solide à supprimer."); return; }
      if (apply([{ toolId: "studio.solide.supprimer", params: { ids: [solide3d] } }])) setSolide3d(null);
      return;
    }
    if (toolId === "studio.architecture.modifier") {
      if (!panneauArchi) { setInfo("Sélectionnez d’abord, sur la planche ou dans la vue 3D, le mur ou l’ouverture à modifier."); return; }
      shell.current?.querySelector<HTMLButtonElement>("[data-studio-modifier-architecture]")?.click();
      return;
    }
    if (toolId === "studio.architecture.supprimer") {
      const ids = [...new Set([...selectionIds, ...(panneauArchi ? [panneauArchi] : [])])].filter((id) => elementArchitectural(drawing, id)?.type === "wall");
      if (!ids.length) { setInfo("Sélectionnez d’abord le mur à supprimer avec ses ouvertures."); return; }
      if (apply([{ toolId: "studio.architecture.supprimer", params: { ids, cascade: true } }])) select([]);
      return;
    }
    if (toolId === "studio.dessin.supprimer" && !selectionIds.length && elementArchitectural(drawing, selectionArchi)) {
      if (apply([{ toolId: "studio.dessin.supprimer", params: { ids: [selectionArchi!] } }])) setSelectionArchi(null);
      return;
    }
    if (toolId === "studio.dessin.supprimer") {
      if (!selectionIds.length) { setInfo("Sélectionnez d’abord l’objet à supprimer."); return; }
      if (apply([{ toolId: "studio.dessin.supprimer", params: { ids: selectionIds } }])) setSelection([]);
      return;
    }
    if (toolId === "studio.calque.creer") {
      const layer: StudioLayer = { id: crypto.randomUUID(), name: prochainNomCalque(drawing), visible: true, locked: false };
      if (apply([{ toolId: "studio.calque.creer", params: layer }])) { setCalqueActif(layer.id); setNomCalque(layer.name); }
      return;
    }
    if (toolId === "studio.calque.modifier") { renameLayer(); return; }
    if (toolId === "studio.objet.extruder") { extrude(); return; }
    if (toolId === "studio.objet.aplatir") {
      const cs = commandesAplatir(drawing, selectionIds);
      if (!cs.length) { setInfo("Aucun objet extrudé dans la sélection."); return; }
      apply(cs);
      return;
    }
    if (toolId === "studio.objet.calque") {
      if (!selectionIds.length || !actif) { setInfo("Sélectionnez d’abord l’objet à placer sur le calque actif."); return; }
      const ids = selectionIds.filter(id => calqueDe(id) !== actif.id);
      if (!ids.length) { setInfo("L’objet est déjà sur le calque actif."); return; }
      apply([{ toolId: "studio.objet.calque", params: { ids, layerId: actif.id } }]);
    }
  }
  function extrude() {
    if (!drawing || !writable) return;
    const r = commandesExtrusion(drawing, selectionIds, extrusion);
    if ("erreur" in r) { setError(r.erreur); return; }
    if (apply(r.commandes) && r.info) setInfo(r.info);
  }
  function setLayer(layer: StudioLayer) {
    if (!drawing) return;
    apply([commandeReglage(drawing, layer)]);
  }
  function renameLayer() {
    if (!drawing || !actif || !writable) return;
    const name = nomCalque.trim();
    if (!name || name === actif.name) { setInfo("Saisissez le nouveau nom du calque actif, puis validez."); nomRef.current?.focus(); return; }
    setLayer({ ...actif, name });
  }
  function undo() { if (brouillon && peutAnnuler(brouillon) && writable) { cancelTrace(); setBrouillon(annulerBrouillon(brouillon)); setError(""); } }
  function redo() { if (brouillon && peutRetablir(brouillon) && writable) { cancelTrace(); setBrouillon(retablirBrouillon(brouillon)); setError(""); } }
  function fullscreen() { if (!document.fullscreenElement) void shell.current?.requestFullscreen().catch(() => setError("Plein écran indisponible. La planche reste accessible.")); else void document.exitFullscreen(); }
  // Plein écran (ADR-STUDIO-NAV-01, E-C ; I.5-03) : tant que l'espace est en plein écran, une sortie reste visible dans
  // la barre de l'espace (la commande « Plein écran / Quitter » peut être rangée dans un menu replié de la barre d'outils).
  const [pleinEcran, setPleinEcran] = useState(false);
  useEffect(() => {
    const suivre = () => setPleinEcran(!!shell.current && document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);
  // Console : « Enregistrer » crée, dans un projet choisi, une étude avec ce qui a été dessiné (boîte `console/`).
  const canSave = autonome ? commands.length > 0 : !historical && !!context?.canWrite && !pending && (uncertain || (commands.length > 0 && !blocked));
  const liens: Partial<Record<IdCommandeEditeur, string>> = autonome ? {} : {
    "exporter-svg": studioExportUrl(projectId, studyId, variantId, "svg", revisionId),
    "exporter-dxf": studioExportUrl(projectId, studyId, variantId, "dxf", revisionId),
    "exporter-ifc": studioExportUrl(projectId, studyId, variantId, "ifc", revisionId),
    "exporter-obj": studioExportUrl(projectId, studyId, variantId, "obj", revisionId),
    "exporter-stl": studioExportUrl(projectId, studyId, variantId, "stl", revisionId),
    "exporter-step": studioExportUrl(projectId, studyId, variantId, "step", revisionId),
  };
  function runCommand(id: CommandeEditeur["id"]) {
    switch (id) {
      case "annuler": return undo();
      case "retablir": return redo();
      case "annuler-trace":
        if (gestes.enGeste()) gestes.annulerGeste();
        else if (trace) cancelTrace();
        else if (selectionIds.length) select([]);
        else setTool("studio.dessin.selection");
        return;
      case "enregistrer": if (canSave) { if (autonome) setDialogue("enregistrer-console"); else void enr.save(); } return;
      case "tout-selectionner": if (drawing) select(toutSelectionnable(drawing)); return;
      case "terminer-polyligne": return finishPolyline(false);
      case "fermer-polyligne": return finishPolyline(true);
      case "zoom-avant": return poserCadre(zoomerAuCentre(cadreRef.current, true));
      case "zoom-arriere": return poserCadre(zoomerAuCentre(cadreRef.current, false));
      case "cadrer": if (drawing) poserCadre(cadrer(emprise(drawing, l => estVisible(drawing, l)))); return;
      case "plein-ecran": return fullscreen();
      case "vue-3d":
        // Bascule Planche 2D ⇄ Planche 3D de Dessin et modélisation, à partir de ce que montre le canevas.
        return poserPlanche(montre3d(domaineActif === "dessin" ? modePlanche : affichage) ? "2d" : "3d");
      case "navigation-3d": ouvrir3d(); return setNavigation3d(n => (vue3d && n === "plan" ? "orbite" : "plan"));
      case "coupe-3d": ouvrir3d(); return setCoupe3d(v => !(vue3d && v));
      case "accrochage-sommets": return setAccrocheSommets(v => !v);
      case "accrochage-grille": return setAccrocheGrille(v => !v);
      case "exporter-svg": case "exporter-dxf": case "exporter-ifc": case "exporter-obj": case "exporter-stl": case "exporter-step":
        // Le lien de la barre télécharge (même origine, cookie de session) : le raccourci le suit.
        shell.current?.querySelector<HTMLAnchorElement>(`a[data-studio-commande="${id}"][href]`)?.click();
        return;
      case "exporter-png": return demander3d("exporter-png");
      case "illustration": return demander3d("illustration");
      case "agents": return setDialogue("agents");
      case "importer-dxf": return setDialogue("import-dxf");
      case "importer-ifc": return setDialogue("import-ifc");
      case "modeles-externes": return setDialogue("modeles-externes");
      case "feuille": return setDialogue("feuille");
      case "dossier": return setDialogue("dossier");
      case "echanges": return setDialogue("echanges");
      case "approuver": return setDialogue("approbation");
      case "fusionner-variantes": return setDialogue("fusion");
      case "annuler-fusion": return setDialogue("annulation-fusion");
      case "outils": return setDialogue("outils");
      case "palette": return setDialogue("palette");
      case "exigences": {
        const amener = () => { const s = shell.current?.querySelector<HTMLElement>("[data-studio-exigences]"); s?.scrollIntoView({ block: "nearest" }); s?.focus(); };
        // Déjà dans BIM et coordination : le panneau est visible, le focus y va aussitôt ; sinon, après l'affichage du domaine.
        if (domaineActif === "bim") amener(); else { choisirDomaine("bim"); requestAnimationFrame(() => requestAnimationFrame(amener)); }
        return;
      }
      // Modes d'accrochage et repérage (orthogonal, polaire, pas) : état de la planche (`planche2d/accrochage/`).
      default: gestes.commandeAccrochage(id); return;
    }
  }
  function surLien(id: IdCommandeEditeur) {
    if (id === "exporter-obj" || id === "exporter-stl" || id === "exporter-step") {
      // Exports 3D (E.6-04) : la géométrie 3D seulement ; leur bilan est dans la matrice d’échanges (rien n’est écarté en silence).
      setInfo("L’export 3D porte sur la révision enregistrée affichée ; cotes, textes et graphismes, qui ne sont pas des géométries 3D, n’y sont pas écrits (matrice d’échanges).");
      setExportsLances((n) => n + 1);
      return;
    }
    if (id !== "exporter-svg" && id !== "exporter-dxf" && id !== "exporter-ifc") return;
    if (commands.length) setInfo("L’export porte sur la révision enregistrée affichée, pas sur les modifications non enregistrées.");
    setExportsLances((n) => n + 1);
    setRapportExport(id);
  }
  const formesChoisies = drawing ? formesSelectionnees(drawing, selectionIds) : [];
  const toolAvailable = (t: StudioToolEntry) => outilDisponible(t, { writable, selectionIds, formesChoisies });
  const commandAvailable = (c: CommandeEditeur) => !(autonome && COMMANDES_D_ETUDE.has(c.id)) && commandeDisponible(c, { writable, brouillon, drawing, trace, suite, selectionIds, tool, canSave, largeurVue: cadre.w });
  /** Lance un outil ou une commande (raccourci, palette, gestionnaire) ; `verifier` : refuse une commande indisponible. */
  function executer(cible: CibleRaccourci, verifier: boolean) {
    // Un outil ou une commande d'un autre domaine (raccourci, palette, Tool Manager) ouvre son domaine.
    const vers = domaineExecution(cible.type === "outil" ? { type: "outil", id: cible.toolId } : { type: "commande", id: cible.id }, domaineActif);
    const outilCible = cible.type === "outil" ? STUDIO_TOOLS.find(x => x.toolId === cible.toolId) : undefined;
    // Outils de la vue 3D (volume libre, visualisation) : `runTool` ouvre lui-même leur domaine et leur planche
    // (`ouvrir3d`, `demander3d`) ; naviguer ici d'abord ajouterait une seconde entrée d'historique (revue #207).
    const navigueSeul = cible.type === "outil" && (OUTILS_VOLUME_LIBRE.has(cible.toolId) || OUTILS_VISUALISATION.has(cible.toolId));
    if (!navigueSeul && vers !== domaineActif && (cible.type === "commande" || (!!outilCible && toolAvailable(outilCible)))) choisirDomaine(vers);
    if (cible.type === "outil") {
      const t = STUDIO_TOOLS.find(x => x.toolId === cible.toolId);
      if (t && toolAvailable(t)) runTool(cible.toolId);
      return;
    }
    const c = COMMANDES_EDITEUR.find(x => x.id === cible.id);
    if (c && (!verifier || commandAvailable(c))) runCommand(cible.id);
  }
  const entreeDisponible = (e: EntreeCatalogue) => (e.outil ? toolAvailable(e.outil) : e.commande ? commandAvailable(e.commande) : false);
  // Visibilité (profil), disponibilité (contexte) et droit réel (serveur) restent trois choses : la raison d'un refus
  // ne lit jamais les préférences d'outils (`variante/droits.ts`).
  const etatDroit: EtatDroit = {
    canWrite: context ? context.canWrite : null, historique: historical, suspendue: pending || blocked || (uncertain && !enr.dessinHorsLigne),
    ...(catalogueAutorise.data ? { motif: catalogueAutorise.data.droits.motif } : {}),
  };
  const raisonDe = (e: EntreeCatalogue) => raisonEntree(e.droit, entreeDisponible(e), etatDroit);
  const raisonCible = (c: CibleRaccourci) => {
    const e = CATALOGUE.find(x => (c.type === "outil" ? x.outil?.toolId === c.toolId : x.commande?.id === c.id));
    return e ? raisonDe(e) : null;
  };
  function executerEntree(e: EntreeCatalogue) {
    setDialogue(null);
    executer(e.cible, true);
  }
  // Raccourcis personnels du profil (EX-034) : appliqués après la table native, jamais une combinaison en conflit.
  const prefsOutils = useProfilOutils(projectId).preferences;
  const raccourcisPersonnels = useMemo(() => tableRaccourcisPersonnels(prefsOutils), [prefsOutils]);
  useClavierStudio({ dialogue: !!dialogue, pret: !!context && !!drawing, commandeDisponible: commandAvailable, executer, espace: gestes.espace, personnels: raccourcisPersonnels });
  // Cycle des outils (B.3-01) : moteurs de l'outil chargés au besoin puis actifs ; première planche prête (PERF-01).
  useCycleOutils({ outil: tool, pret: !loading && !!context && !!drawing, objets: drawing?.objects.length ?? 0 });

  // L'écran de travail (barre, palette, canevas, panneaux, barre d'état) remplit la hauteur sous l'en-tête de Fadi.
  const hauteur = useHauteurDisponible(ecran, telephone ? 560 : 480, !!context && !!drawing && !document.fullscreenElement);
  // EX-049 : un tracé commencé est une prévisualisation, notée avec le brouillon conservé (abandonnée si la session s'interrompt).
  const outilApercu = trace && tool ? String(tool) : null;
  useEffect(() => { enr.noterApercu(outilApercu); }, [outilApercu]);
  // Document affiché par la planche et la vue 3D : le document entier, ou sa vue par niveau (dérivée, jamais enregistrée).
  const choixNiveau = choixVueValide(drawing ?? null, vueNiveau);
  const docVue = (() => {
    if (!drawing || choixNiveau === null) return drawing;
    try { return studioVueNiveau(drawing, choixNiveau, { libres: masquerLibres ? "masquer" : "garder" }); } catch { return drawing; }
  })();
  if (!loading && refused(loadError)) return <StudioRefus quoi={historical ? "revision" : "variante"} />;
  const toolEntry = STUDIO_TOOLS.find(t => t.toolId === tool);
  const toResolve = drawing?.dimensions?.filter(d => d.toResolve).length ?? 0;
  const angulairesAResoudre = drawing?.annotations?.filter(a => a.type === "angular-dimension" && a.toResolve).length ?? 0;
  const etatTrace = { outil: tool, trace, suite, modeArc };
  const apercuForme = apercuPlanche(etatTrace, survol?.point);
  // Aperçu d'une transformation (Copier, Rotation, Symétrie, Échelle) : le brouillon tel que le clic le donnerait.
  const apercuTransformation = (() => {
    const cs = drawing && trace && survol && writable ? outil?.apercuCommandes?.({ ...etatTrace, trace }, survol.point, contexteClic()) : null;
    return cs ? apercuBrouillon(drawing!, cs) : null;
  })();
  const hint = aidePlanche({ ...etatTrace, moveWithPointer, lectureSeule: !writable && !historical && context?.canWrite === false });
  const pasAffiche = pas.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
  const etat = autonome ? (commands.length ? "Hors projet : modifications non enregistrées" : "Hors projet : aucun projet chargé") : historical ? "Révision historique" : pending ? "Sauvegarde en cours…" : uncertain ? "Sauvegarde non confirmée" : commands.length ? "Brouillon non enregistré" : enr.saved ? "Enregistré sur le serveur" : "Version serveur chargée";
  const basculeActive = { ...gestes.basculesActives, "accrochage-sommets": accrocheSommets, "accrochage-grille": accrocheGrille, "vue-3d": vue3d, "navigation-3d": vue3d && navigation3d === "plan", "coupe-3d": vue3d && coupe3d };
  // Accrochages et repérages actifs (barre d'état) : les bascules de ces barres, nommées par leur commande.
  const accrochagesActifs = COMMANDES_EDITEUR.filter(c => (c.groupe === "accrochage" || c.groupe === "reperage") && c.bascule && (basculeActive as Partial<Record<IdCommandeEditeur, boolean>>)[c.id]).map(c => c.libelleFR);
  const domaine01 = definitionDomaine(domaineActif);
  const libelleSave = uncertain ? { enregistrer: "Réessayer la sauvegarde" } : autonome ? { enregistrer: "Enregistrer dans un projet" } : undefined;
  /** Palette d'outils du domaine affiché : verticale à gauche du canevas ; au téléphone, barre inférieure défilante. */
  const palette = context && drawing ? <div className="studio-palette" data-studio-palette-outils={domaineActif}>
    <BarreOutils outil={tool} outilDisponible={toolAvailable} commandeDisponible={commandAvailable} raison={raisonCible} libelleCommande={libelleSave}
      basculeActive={basculeActive} lienCommande={liens} surOutil={runTool} surCommande={runCommand} surLien={surLien}
      filtre={FILTRES_PALETTE[domaineActif]} orientation={telephone ? "horizontale" : "verticale"} libelle={domaineActif === "dessin" ? "Outils de dessin" : `Outils — ${domaine01.libelleFR}`} />
  </div> : null;
  /** Bloc d'une fonction de l'espace (`FONCTIONS_STUDIO`), rendu dans un panneau latéral de son domaine. */
  function bloc(f: FonctionStudio): ReactNode {
    if (!context || !drawing) return null;
    if (autonome && PANNEAUX_D_ETUDE.has(f)) return <p className="studio-info" data-studio-console-indisponible={f}>Ce panneau lit et écrit dans une étude de projet : il n’est pas disponible dans la Console.</p>;
    switch (f) {
      case "outils": case "planches": case "portee-annuler": return null;
      case "elements": return <ListeElements doc={drawing} selection={selectionIds} modifiable={writable} surSelection={select} surSupprimer={() => runTool("studio.dessin.supprimer")}
        surRetirerNonNatifs={(ids) => apply([{ toolId: "studio.nonnatif.retirer", params: { ids } }])} />;
      case "exigences": return <PanneauExigences projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} doc={drawing} cibleId={cibleSelection(drawing, selectionArchi, selectionIds)}
        modifiable={writable} ecriture={!historical && context.canWrite} nonEnregistre={commands.length > 0} surCommandes={apply} surErreur={setError} />;
      // Scènes, apparence et rendus : les panneaux de la vue 3D (même moteur), rendus ici par un portail.
      case "scenes-rendus": return <div className="studio-hote-3d" ref={setHoteVisualisation} data-studio-visualisation-panneaux />;
      case "publications": return <LienPublications adresse={cheminEtudeStudio(projectId, studyId)} />;
      case "commentaires-observations": return <div id="studio-commentaires"><PanneauCommentaires projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} revision={context.revision.document} dessin={drawing}
        selection={selectionIds} canWrite={!historical && context.canWrite} surSelection={ids => { setTool("studio.dessin.selection"); cancelTrace(); select(ids); }} />
        <PanneauObservations projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} revision={context.revision.document} selection={selectionIds}
          vue={vue3d ? "3d" : "plan"} surSelection={ids => { setTool("studio.dessin.selection"); cancelTrace(); select(ids); }} /></div>;
      case "revisions": return <RevisionsPanel projectId={projectId} studyId={studyId} variantId={variantId} headRevisionId={context.variant.headRevisionId} shownRevisionId={context.revision.id} adresse={adresseDomaine} />;
      case "metre": return <PanneauQuantites projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} doc={drawing} lectureSeule={!writable || historical} nonEnregistre={commands.length > 0} />;
    }
  }
  /** Canevas : Planche 2D, Planche 3D ou les deux (Double vue) ; la vue 3D garde sa place (même moteur d'un domaine à l'autre). */
  const canevas = context && drawing ? <div className="studio-canevas" data-studio-canevas={affichage} data-studio-domaine-canevas={domaineActif}>
    <div className="studio-canevas-vues">
    {plan2d && <div className="studio-sheet" data-studio-moteur-planche={moteur2d.moteur} onKeyDown={panoramiquePlanche} onPointerMove={enDirect ? pointeurSession : undefined} onPointerLeave={enDirect ? () => pointeurSession(null) : undefined} data-studio-projection-plan={versionPlan(drawing)} title="Molette : zoom sur le pointeur ; bouton du milieu, Espace + glisser ou deux doigts : déplacer la vue." data-studio-aide-vue>
      <Dessin2D svgRef={gestes.refPlanche} doc={apercuDoc ?? apercuTransformation ?? docVue ?? drawing} cadre={cadre} pas={pas} outil={tool} selection={selectionSet} trace={trace} survol={survol} rectangle={gestes.rectangle} glissement={!!gestes.apercu}
        apercuForme={apercuForme} sommetsPoses={suite}
        clicsVersPlanche={o => OUTILS_TRACE.has(tool) || (moveWithPointer && (!!trace || selectionSet.has(o.id)))}
        surPlanche={board} surSurvol={gestes.pointerMove} surPointeurBas={gestes.pointerDown} surPointeurHaut={gestes.pointerUp} surClicCapture={gestes.clickCapture} surSelection={(id, plus) => select(plus ? basculer(selectionIds, id) : [id])}
        architecture={{ selection: new Set([...selectionIds, ...(selectionArchi ? [selectionArchi] : [])]), surSelection: choisirArchitecture, versPlanche: OUTILS_TRACE.has(tool) }}
        superposition={enDirect ? <Superposition2D doc={drawing} cadre={cadre} pointeurs={pointeursFrais(tr.etat, Date.now())} selections={tr.etat.selections} noms={nomsSession} /> : undefined}
        moteur={moteur2d.moteur} />
      {moteur2d.verdict && <p className="studio-moteur-planche" role="status" data-studio-moteur-etat={moteur2d.moteur}>{texteMoteurPlanche(moteur2d)}</p>}
    </div>}
    {vue3d && <div className="studio-canevas-3d" data-studio-vue-niveau-active={choixNiveau ?? ""}><Vue3D doc={docVue ?? drawing} outil={tool} modifiable={writable} navigation={navigation3d} coupe={coupe3d} selection={solide3d} layerId={actif?.id ?? STUDIO_DEFAULT_LAYER_ID}
      surSelection={setSolide3d} surCommandes={apply} selectionArchitecture={panneauArchi} surSelectionArchitecture={(id) => (id ? choisirArchitecture(id, false) : setSelectionArchi(null))}
      demande={demande3d} surDemandeTraitee={() => setDemande3d(null)} surNavigation={setNavigation3d} remplir
      cameraPartagee={enDirect && tr.suit && !presenteEnDirect ? cameraPartagee : cameraAnnotation} surCameraLocale={partagerCamera}
      surPointeur3d={enDirect ? (p) => tr.canal.pointeur(p ? { espace: "3d", ...p } : null) : undefined}
      pointeurs3d={enDirect ? pointeursFrais(tr.etat, Date.now()).filter((p) => p.espace === "3d").map((p) => ({ userId: p.userId, nom: p.nom || nomsSession[p.userId] || "", x: p.x, y: p.y, z: p.z ?? 0 })) : undefined}
      hotePanneaux={domaineActif === "visualisation" ? hoteVisualisation : hote3dDessin} visualisation={domaineActif === "visualisation"}
      provenance={{ etude: { id: context.study.id, nom: context.study.name }, variante: { id: context.variant.id, nom: context.variant.name }, revisionId: context.revision.id, nonEnregistre: commands.length > 0, auteur: user ? { id: user.id, email: user.email } : null }}
      surIllustration={(c) => { setCaptureIllustration(c); setDialogue("illustration"); }} /></div>}
    </div>
    {/* Saisie des mesures et avis : sous les vues (jamais par-dessus le dessin, où ils intercepteraient les clics). */}
    <div className="studio-canevas-avis">
      {plan2d && trace && pointsActifs && <ChampMesures base={suite[suite.length - 1] ?? trace.point} survol={survol?.point ?? null} direction={gestes.directionCourante()} verrou={gestes.verrouAngle}
        pasPolaire={gestes.bascules.pasPolaire} surPasPolaire={gestes.poserPasPolaire} desactive={!writable}
        surSaisie={(texte) => { const r = gestes.saisir(texte); if (r.type === "erreur") return r.message; if (r.type === "point") poser({ point: r.point, accroche: null }); return null; }} />}
      {toResolve > 0 && <p className="studio-alert" role="status" data-studio-cotes-a-resoudre={toResolve}>{`${toResolve} cote(s) à résoudre : un objet coté a été supprimé.`}</p>}
      {angulairesAResoudre > 0 && <p className="studio-alert" role="status" data-studio-cotes-angulaires-a-resoudre={angulairesAResoudre}>{`${angulairesAResoudre} cote(s) angulaire(s) à résoudre : un segment lié a été supprimé.`}</p>}
      {info && <p className="studio-info" role="status">{info}</p>}
      {actif && !actif.visible && OUTILS_TRACE.has(tool) && <p className="studio-info">Le calque actif est masqué : ce que vous dessinez n’apparaîtra pas.</p>}
    </div>
  </div> : null;
  /** Panneaux latéraux du domaine affiché (les autres domaines restent montés, masqués). */
  const panneaux = context && drawing ? <aside className="studio-panneaux" aria-label="Panneaux du domaine" data-studio-panneaux data-studio-panneaux-replies={panneauxOuverts ? undefined : ""}>
    {!telephone && <button type="button" className="studio-panneaux-repli" aria-expanded={panneauxOuverts} onClick={() => setPanneauxOuverts(o => !o)} data-studio-replier-panneaux
      aria-label={panneauxOuverts ? "Replier les panneaux" : "Déplier les panneaux"} title={panneauxOuverts ? "Replier les panneaux" : "Déplier les panneaux"}><Icon name="chevron-right" size={16} /></button>}
    <div className="studio-panneaux-corps" hidden={!panneauxOuverts && !telephone}>
      {DOMAINES_STUDIO.map((d) => <SectionDomaine key={d.id} id={d.id} actif={domaineActif === d.id}>
        {d.id === "dessin" && <PanneauLateral id="proprietes" titre="Propriétés">
          <PanneauProprietes titre={toolEntry?.libelleFR} drawing={drawing} selectionIds={selectionIds} selected={selected} writable={writable} formesChoisies={formesChoisies} extrusion={extrusion}
            surExtrusion={setExtrusion} surExtruder={extrude} surAplatir={() => runTool("studio.objet.aplatir")} surSupprimer={() => runTool("studio.dessin.supprimer")}
            architecture={<><PanneauArchitecture doc={drawing} outil={tool} selection={panneauArchi} modifiable={writable} parametres={parametresArchi} surParametres={setParametresArchi}
              contexte={() => ({ nouvelId: () => crypto.randomUUID(), layerId: layerId() })} surCommandes={apply} surErreur={setError} surSelection={(id) => (id ? choisirArchitecture(id, false) : select([]))} />
              {OUTILS_BATIMENT.has(tool) && <PanneauBatiment doc={drawing} outil={tool} modifiable={writable} contexte={() => ({ nouvelId: () => crypto.randomUUID(), layerId: layerId() })}
                surCommandes={apply} surErreur={setError} vueNiveau={choixNiveau} surVueNiveau={setVueNiveau} masquerLibres={masquerLibres} surMasquerLibres={setMasquerLibres} />}</>}
            formulaire={tool !== "studio.dessin.selection" && !OUTILS_VOLUME_LIBRE.has(tool) && !OUTILS_BATIMENT.has(tool) && !tool.startsWith("studio.architecture.") && <FormulaireValeurs tool={tool} selected={selected} desactive={!writable || formulaireInactif(tool, selectionIds, selected) || (tool === "studio.dessin.modifier" && (selected?.type === "dimension" || selected?.type === "angular-dimension") && selected.toResolve)}
              values={values} surValeur={(k, v) => setValues(x => ({ ...x, [k]: v }))} modeArc={modeArc} surModeArc={m => { setModeArc(m); cancelTrace(); }}
              sommetsTexte={sommetsTexte} surSommets={setSommetsTexte} fermee={fermee} surFermee={setFermee} surSoumettre={numeric} texte={texteSaisi} surTexte={setTexteSaisi} />}
            calques={<PanneauCalques doc={drawing} actif={actif?.id ?? STUDIO_DEFAULT_LAYER_ID} modifiable={writable} nom={nomCalque} nomRef={nomRef} surActif={id => setCalqueActif(id)} surNom={setNomCalque} surReglage={setLayer} surRenommer={renameLayer} />} />
        </PanneauLateral>}
        {d.id === "dessin" && <div hidden={!vue3d}><PanneauLateral id="volume-3d" titre="Planche 3D"><div className="studio-hote-3d" ref={setHote3dDessin} data-studio-planche3d-panneaux /></PanneauLateral></div>}
        {panneauxDuDomaine(d.id).filter((f) => f !== "commentaires-observations" || commentaires).map((f) => <PanneauLateral key={f} id={f} titre={TITRES_PANNEAUX[f] ?? f}>{bloc(f)}</PanneauLateral>)}
      </SectionDomaine>)}
    </div>
  </aside> : null;
  const barreEtat = context && drawing ? <BarreEtat aide={hint} coordonnees={plan2d ? survol?.point ?? null : null} accrochages={accrochagesActifs} pas={pas} pasAffiche={pasAffiche}
    planche={libelleModePlanche(affichage)} sousTitre={SOUS_TITRE_PLANCHE[affichage]} enAttente={commands.length} horsHistorique={brouillon ? pasHorsHistorique(brouillon) : 0} etat={etat} lectureSeule={!context.canWrite} revision={context.revision.id}
    connexion={!historical && !autonome ? <EtatConnexionStudio etat={enr.horsLigne} /> : undefined} /> : null;
  /**
   * Session en direct : afficher la révision qu'elle montre, sur demande explicite. Tête de la variante : relue sur place
   * (jamais par-dessus un brouillon non enregistré) ; révision antérieure : ouverte en lecture, la session reste rejointe.
   */
  async function afficherRevisionSession(r: string) {
    // Le brouillon n'est jamais remplacé ni déchargé : la protection précède les deux voies (rechargement sur place, ou
    // navigation qui démonte l'espace de travail sans passer par la garde de navigation) et se relit après la lecture.
    const brouillonNonVide = () => !!affiche.current.brouillon && commandesEnAttente(affiche.current.brouillon).length > 0;
    const refuser = () => setInfo("Enregistrez ou abandonnez votre brouillon avant d’afficher la révision de la session : il n’est jamais remplacé.");
    if (brouillonNonVide()) { refuser(); return; }
    const depart = affiche.current.context?.revision.id ?? "", brouillonDepart = affiche.current.brouillon;
    try {
      const c = await api.studioContext(projectId, studyId, variantId);
      if (!alive.current) return;
      // Une saisie ou un enregistrement survenu pendant la lecture la rend caduque (même règle que l'avis de révision).
      if (brouillonNonVide() || !lectureApplicable(depart, affiche.current.context, affiche.current.brouillon, brouillonDepart)) { refuser(); return; }
      if (c.revision.id === r && !historical) {
        setContext(c); setBrouillon(creerBrouillon(c.revision.document)); cancelTrace(); enr.setSaved(false); setError("");
        return;
      }
      navigate(cheminVarianteStudio(projectId, studyId, variantId, r === c.variant.headRevisionId ? null : r, adresseDomaine));
    } catch {
      setError("Serveur injoignable : réessayez.");
    }
  }
  return <section className="studio-workspace" ref={shell} aria-label="Studio" data-studio-variante={autonome ? undefined : variantId} data-studio-console-outil={autonome ? "" : undefined} data-studio-revision-vue={historical ? revisionId : undefined}
    data-studio-domaine-affiche={domaineActif} data-studio-affichage={affichage} data-studio-telephone={telephone ? "" : undefined}>
    <TitreEspace context={context} />
    <div className="studio-ecran" ref={ecran} style={hauteur ? { height: hauteur } : undefined}>
      {/* Barre de l'espace, persistante en haut quel que soit le domaine (téléphone compris) : domaines, planches, phase,
          actions de l'espace et commentaires. */}
      <div className="studio-barre-espace" data-studio-barre-espace>
        <NavigationDomaines actif={domaineActif} adresse={adresseDuDomaine} surChoix={choisirDomaine} compacte={telephone} />
        {domaineActif === "dessin" && <SelecteurPlanche active={plancheActive} surChoix={choisirPlanche} />}
        <span className="studio-barre-espace-vide" />
        {context && drawing && <ActionsEspace disponible={commandAvailable} raison={(id) => raisonCible({ type: "commande", id })} libelle={libelleSave} surCommande={(id) => executer({ type: "commande", id }, true)} />}
        {context && drawing && !autonome && <BandeauSession emplacement="barre" tr={tr} revisionAffichee={context.revision.id} teteVariante={context.variant.headRevisionId} nomVariante={context.variant.name} affichageLocal={affichage}
          surAfficherRevision={(r) => void afficherRevisionSession(r)} vueCourante={vueCourante} selectionIds={selectionIds} surVoirPointDeVue={voirPointDeVue} />}
        {pleinEcran && <button type="button" className="studio-bouton-commentaires" aria-label="Quitter le plein écran" title="Quitter le plein écran" aria-keyshortcuts="Control+Shift+F Escape"
          onClick={() => void document.exitFullscreen()} data-studio-quitter-plein-ecran><Icon name="studio-fullscreen" size={18} /></button>}
        {context && drawing && !autonome && <button type="button" className="studio-bouton-commentaires" aria-pressed={commentaires} aria-label="Commentaires" title="Commentaires" onClick={basculerCommentaires} data-studio-basculer-commentaires><Icon name="studio-comments" size={18} /></button>}
      </div>
      <AlerteStudio error={error} blocked={blocked && !enr.horsLigne.conflit} surRecharger={() => void enr.rechargerServeur()} />
      {context && drawing && !autonome && <BandeauSession emplacement="bandeau" tr={tr} revisionAffichee={context.revision.id} teteVariante={context.variant.headRevisionId} nomVariante={context.variant.name} affichageLocal={affichage}
        surAfficherRevision={(r) => void afficherRevisionSession(r)} vueCourante={vueCourante} selectionIds={selectionIds} surVoirPointDeVue={voirPointDeVue} />}
      <AvisFileLocale cle={user && !historical && !autonome ? cleVariante(user.id, projectId, studyId, variantId) : null} />
      {loading && <p role="status">Chargement de la planche…</p>}
      {context && drawing && !historical && !autonome && <AvisRevision projectId={projectId} studyId={studyId} variantId={variantId} teteAffichee={context.variant.headRevisionId} actif={!pending && !blocked && !uncertain && !enr.horsLigne.conflit} nonEnregistre={commands.length > 0}
        surRecharger={async () => {
          const depart = context.revision.id, brouillonDepart = brouillon;
          const c = await api.studioContext(projectId, studyId, variantId);
          // A.5-10 : une lecture dépassée par un enregistrement ou un rechargement survenu entre-temps n'est pas appliquée.
          if (!alive.current) return;
          if (!lectureApplicable(depart, affiche.current.context, affiche.current.brouillon, brouillonDepart)) throw new Error("lecture dépassée");
          setContext(c); setBrouillon(creerBrouillon(c.revision.document)); cancelTrace(); enr.setSaved(false); setError(""); }} />}
      {historical && <BandeauHistorique projectId={projectId} studyId={studyId} variantId={variantId} adresse={adresseDomaine} />}
      {/* Exemple protégé : par le mode du projet (un lecteur reçoit le motif « role », mais peut copier — revue #208). */}
      {!historical && !autonome && context && (projet.data?.exampleMode === "reference" || catalogueAutorise.data?.droits.motif === "reference-protegee") && <CopieDeTravail projectId={projectId} nomVariante={context.variant.name} adresse={adresseDomaine} />}
      {!historical && !autonome && <ChoixConflitStudio etat={enr.horsLigne} surRecharger={() => void enr.rechargerServeur()} surReporter={() => void enr.reporter()} surAcquitter={() => enr.acquitterReprise()} />}
      {context && drawing && <div className="studio-corps" data-studio-corps>
        {!telephone && palette}
        {canevas}
        {!telephone && panneaux}
      </div>}
      {telephone && palette}
      {barreEtat}
    </div>
    {telephone && panneaux}
    {context && drawing && <>
    <DialoguesStudio dialogue={dialogue} surFermer={() => setDialogue(null)} disponible={entreeDisponible} raison={raisonDe} surExecuter={executerEntree} drawing={drawing} modifiable={writable}
      surImporter={(cs, r) => { if (!apply(cs)) return false; setDialogue(null); setInfo(`Import DXF ajouté au brouillon : ${r.rapport.entites.total} objet(s). Enregistrez pour l’envoyer au serveur.`); return true; }}
      surImporterIfc={(cs, r) => { if (!apply(cs)) return false; setDialogue(null); setInfo(`Import IFC ajouté au brouillon : ${r.rapport.entites.total} objet(s) natif(s), ${r.rapport.nonNatifsTotal} élément(s) non natif(s). Enregistrez pour l’envoyer au serveur.`); return true; }}
      ecritureServeur={!historical && context.canWrite}
      revision={context.revision.document} brouillonNonEnregistre={commands.length > 0}
      cartouche={() => cartoucheInitial({ projet: projet.data, etude: context.study, variante: context.variant, revision: { id: context.revision.id, ...revisionAffichee }, utilisateur: user })}
      portee={{ projectId, studyId, variantId, revisionId: context.revision.id }}
      captureIllustration={captureIllustration}
      enregistrementConsole={autonome ? { commandes: commands, surEnregistre: (c) => { dirty.current = false; surEnregistreVersProjet?.(c, { domaine: domaineActif, planche: domaineActif === "dessin" ? modePlanche : null }); } } : undefined}
      surAppliquer={writable ? (cs) => apply(cs) : undefined} calqueActif={actif?.id} selection={selectionIds} />
    {rapportExport && liens[rapportExport] && <RapportExport format={FORMATS_RAPPORT[rapportExport]!} urlExport={liens[rapportExport]!} exportId={`${context?.revision.id ?? ""}#${exportsLances}`} surFermer={() => setRapportExport(null)} />}</>}
  </section>;
}
