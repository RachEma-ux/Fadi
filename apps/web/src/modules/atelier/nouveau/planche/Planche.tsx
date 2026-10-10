/**
 * Mode « Planche » de l'Atelier (cahier-planche MO-1, §3, lot 2) : géométrie libre façon SketchUp pour le Web, en
 * disposition Canevas (D-156) — dessin plein écran, barre d'outils verticale à gauche (outils « barre » du catalogue,
 * outil récent, grille « … »), colonne de panneaux à droite (Instructeur), barre du bas (barre d'état `aria-live`,
 * champ Mesures). Toute la logique des outils est dans les machines d'états pures de `@parcours/planche-model` :
 * cette interface ne fait que traduire pointeur et clavier en `EvenementOutil`, appeler `traiter`, puis afficher
 * `vue()`. Brouillon LOCAL (C6) : aucun envoi au serveur, aucune commande ; annuler / rétablir local.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  contexte as contexteDe,
  copier,
  cross,
  differencePlanche,
  diviser,
  eclater,
  effacerEntites,
  empreintePlanche,
  etendreSelection,
  exporterObj,
  exporterStl,
  genreAnnotation,
  grouper,
  intersecterAvecModele,
  inverserFaces,
  machineParId,
  masquerEntites,
  matriceMonde,
  modeleVide,
  modifierAnnotations,
  modifierDefinition,
  modifierPlanDeCoupe,
  nombreOccurrences,
  normalize,
  opererSolides,
  orienterFaces,
  outilParId,
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
} from "@parcours/planche-model";
import { etatUi, useEtatUi } from "../etat-ui";
import { planches as planchesDe, type Commande, type ModeleAtelier } from "@parcours/atelier-model";
import { api } from "../../../../lib/api";
import { MenuPlanche } from "./menu-planche";
import { ChoixPeripherique } from "../panneaux/Navigation";
import { CATALOGUE, type CleMessage, t } from "../messages";
import { ChoixLangue } from "../../../../components/ChoixLangue";
import { annuler, enregistrer, historiqueInitial, operationAAnnuler, operationARetablir, retablir, type Historique } from "./historique";
import { chargerBrouillon, enregistrerBrouillon, stockageDisponible } from "./brouillon";
import { OUTILS_CAMERA_TEMPORAIRES, OUTILS_SOLIDES, afficherRaccourci, commenceSaisie, disponibilite, estOutilCamera, estRecherche, libelleOutil, lotPrevu, outilDuClavier, outilsBarre, pictoOutil, raccourciOutil, sectionsGrille, titreOutil, toucheEtat, type OutilCamera } from "./outils-planche";
import { HAUTEUR_OEIL_DEFAUT, OPTIONS_AFFICHAGE_DEFAUT, VuePlanche, type OptionsAffichage, type VueStandard } from "./vue-planche";
import { DialogueComposant, MenuContextuel, NavigateurPlanche, PanneauAdoucir, PanneauAffichage, PanneauComposants, PanneauInfoEntite, PanneauInfoModele, PanneauOmbres, PanneauScenes, PanneauStyles, type EntreeMenu, type ParametresComposant } from "./panneaux-objets";
import { BarreActions } from "../panneaux/BarreActions";
import { BarreOutilsFlottante } from "./BarreOutilsFlottante";
import { BoutonOutils } from "./BoutonOutils";
import { barresRendues, basculerBarre, reinitialiserDisposition } from "./barres-outils-disposition";
import { chargerBooleens } from "./booleens-manifold";
import "./planche.css";

declare global {
  interface Window {
    /** Instrumentation de la recette (lecture seule) : modèle du brouillon, outil actif, projection écran. */
    fadiPlanche?: {
      modele: () => Modele;
      outil: () => string;
      etatOutil: () => unknown;
      selection: () => readonly string[];
      pas: () => number;
      versEcran: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null;
      /** Lots 4 à 6 : matière et balise courantes, hauteur d'œil, moteur booléen chargé, emprise et caméra. */
      materiau: () => string | null;
      balise: () => string | null;
      hauteurOeil: () => number;
      booleens: () => "absent" | "chargement" | "ok" | "echec";
      emprise: () => { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
      camera: () => { position: { x: number; y: number; z: number }; champDeVision: number };
      /** Lot 5 (objets) : contexte d'édition, panneau ouvert, options d'affichage, menu contextuel ouvert, presse-papiers. */
      dans: () => string | undefined;
      panneau: () => string | null;
      options: () => OptionsAffichage;
      menu: () => readonly string[] | null;
      pressePapiers: () => number;
    };
  }
}

export interface PropsPlanche {
  projectId: string;
  readOnly: boolean;
  /** Lot 7 : modèle de l'Atelier (les Planches sont des définitions « planche »), Planche ouverte, envoi des commandes. */
  etat?: ModeleAtelier;
  plancheId?: string | null;
  onCommandes?: (commandes: Commande[], label: string) => Promise<unknown> | void;
}

/** Locale française du champ Mesures : virgule décimale, point-virgule de liste (proposition P-3, cahier §5.3). */
const SEPARATEUR_DECIMAL = "," as const;
/** Téléchargement d'un fichier produit dans la page (IFC de la Planche, PNG de la vue). */
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
type Panneau = "instructeur" | "materiaux" | "balises" | "objets" | "info-entite" | "composants" | "styles" | "ombres" | "scenes" | "affichage" | "adoucir" | "info-modele" | "navigateur";
type PanneauObjets = "info-entite" | "composants" | "styles" | "ombres" | "scenes" | "affichage" | "adoucir" | "info-modele" | "navigateur";
/** Panneaux du lot 5 (§6), derrière une seule icône « Objets » : la colonne reste courte (téléphone, Zoom étendu). */
const LISTE_PANNEAUX_OBJETS: readonly (readonly [PanneauObjets, string])[] = [
  ["info-entite", "ⓘ"],
  ["composants", "❖"],
  ["styles", "◐"],
  ["ombres", "☀"],
  ["scenes", "🎞"],
  ["affichage", "👁"],
  ["adoucir", "◠"],
  ["info-modele", "⚙"],
  ["navigateur", "☰"],
];
const PANNEAUX_OBJETS: ReadonlySet<string> = new Set(LISTE_PANNEAUX_OBJETS.map(([id]) => id));
/** Précision d'affichage (Info modèle) : préférence de l'appareil (R10), jamais une donnée de la Planche. */
const CLE_PRECISION = "fadi.planche.precision";
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

export function Planche({ projectId, readOnly, etat, plancheId = null, onCommandes }: PropsPlanche) {
  const ui = useEtatUi();
  const navigationRef = useRef(ui.navigation);
  navigationRef.current = ui.navigation;

  // --- État de l'outil et du brouillon (refs = source de vérité synchrone ; états = rendu).
  const histRef = useRef<Historique>(historiqueInitial(modeleVide()));
  // Lot 7 : Planche ouverte (définition « planche » du projet) ; null = brouillon local (projet sans Planche).
  const plancheIdRef = useRef<string | null>(null);
  const onCommandesRef = useRef(onCommandes);
  onCommandesRef.current = onCommandes;
  const etatRef = useRef(etat);
  etatRef.current = etat;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const listePlanches = useMemo(() => (etat ? planchesDe(etat) : []), [etat]);
  const plancheCourante = useMemo(() => (plancheId ? listePlanches.find((d) => d.id === plancheId) ?? null : null), [listePlanches, plancheId]);
  const niveauxProjet = useMemo(() => (etat ? Object.values(etat.niveaux).sort((a, b) => a.ordre - b.ordre || (a.id < b.id ? -1 : 1)) : []), [etat]);
  const [hist, setHist] = useState(histRef.current);
  const outilRef = useRef(OUTIL_INITIAL());
  const precedentRef = useRef(outilRef.current);
  const [outilId, setOutilId] = useState(outilRef.current);
  const etatMachineRef = useRef<unknown>(machineParId(outilRef.current)?.initial() ?? null);
  // Contexte d'édition (groupe / composant ouvert, §5.6) : état d'interface, jamais une donnée (R10).
  const dansRef = useRef<string | undefined>(undefined);
  const [dans, setDans] = useState<string | undefined>(undefined);
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
  const setPanneau = useCallback((p: Panneau | null) => {
    panneauRef.current = p;
    setPanneauEtat(p);
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
  const pressePapiers = useRef<{ ids: readonly string[]; dans: string | undefined; source: Modele } | null>(null);
  const derniersMasques = useRef<{ ids: readonly string[]; dans: string | undefined } | null>(null);
  const [precision, setPrecision] = useState(() => lirePrecision());
  const [camera, setCamera] = useState<{ projection: "perspective" | "parallele"; champDeVision: number }>({ projection: "perspective", champDeVision: 35 });
  // Lot 5 : matière et balise courantes (panneaux Matériaux / Balises) ; `null` = matière par défaut / aucune balise.
  const materiauRef = useRef<string | null>(null);
  const [materiau, setMateriauEtat] = useState<string | null>(null);
  const baliseRef = useRef<string | null>(null);
  const [balise, setBaliseEtat] = useState<string | null>(null);
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
  const [majVerrouillee, setMajVerrouillee] = useState(false);
  // Barres d'opérations flottantes (D-198) : haut de la barre rangée en bas au téléphone (la barre d'actions s'en écarte).
  const [hautDocquee, setHautDocquee] = useState<number | null>(null);
  const afficherBarre = useCallback((id: string, afficher: boolean) => etatUi.set((u) => ({ barresOutils: basculerBarre(u.barresOutils, id, afficher) })), []);
  const [webgl, setWebgl] = useState<"ok" | "indisponible">("ok");
  // Volet bas (téléphone) : replié, la consigne tient sur une ligne ; déployé, consigne complète et flèches.
  const [volet, setVolet] = useState(false);
  // Rail d'outils replié par défaut (pictogrammes seuls, libellés en info-bulle) ; « » » affiche les libellés.
  const [outilsReplies, setOutilsReplies] = useState(true);
  // Téléphone : icônes seules au départ (les étiquettes recouvraient le dessin) ; « « » les affiche.
  const [colonneRepliee, setColonneRepliee] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
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
  const clavierRef = useRef<{ touche: (e: KeyboardEvent) => void; relache: (e: KeyboardEvent) => void; perte: () => void } | null>(null);
  const brouillonCharge = useRef(false);

  const hoteRef = useRef<HTMLDivElement | null>(null);
  const racineRef = useRef<HTMLDivElement | null>(null);
  const piedRef = useRef<HTMLDivElement | null>(null);
  const voletRef = useRef<HTMLDivElement | null>(null);
  const vueRef = useRef<VuePlanche | null>(null);
  const champMesures = useRef<HTMLInputElement | null>(null);
  const grilleDom = useRef<HTMLDivElement | null>(null);
  const touchesTenues = useRef(new Set<Touche>());

  const setTexte = useCallback((v: TexteMesures) => {
    texteRef.current = v;
    setTexteEtat(v);
  }, []);
  // La sélection est tenue par l'interface (ContexteOutil.selection) ; son affichage passe par `rafraichir`.
  const setSelection = useCallback((s: readonly string[]) => {
    selectionRef.current = s;
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

  const contexte = useCallback(
    (): ContexteOutil => ({
      modele: histRef.current.present.modele,
      selection: selectionRef.current,
      separateurDecimal: SEPARATEUR_DECIMAL,
      entitesDansCadre: (de, a, genre) => vueRef.current?.entitesDansCadre(de, a, genre) ?? [],
      entitesDansContour: (contour, genre) => vueRef.current?.entitesDansContour(contour, genre) ?? [],
      ...(dansRef.current !== undefined ? { dans: dansRef.current } : {}),
      ...(materiauRef.current ? { materiauCourant: materiauRef.current } : {}),
      ...(baliseRef.current ? { baliseCourante: baliseRef.current } : {}),
      ...(histRef.current.present.modele.annotations?.repere ? { repere: histRef.current.present.modele.annotations.repere } : {}),
      ...(booleensRef.current ? { booleens: booleensRef.current } : {}),
      hauteurOeil: hauteurOeilRef.current,
      lecture: readOnly,
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

  const poserDans = useCallback((id: string | undefined) => {
    dansRef.current = id;
    setDans(id);
  }, []);

  const poserHistorique = useCallback((h: Historique, options: { libelle?: string; envoyer?: boolean } = {}) => {
    const avant = histRef.current.present.modele;
    const changeModele = h.present.modele !== avant;
    histRef.current = h;
    setHist(h);
    if (changeModele) vueRef.current?.majModele(h.present.modele);
    // Lot 7 : chaque pas (opération, annulation, rétablissement) devient une commande `planche.operation` du projet —
    // différence structurelle + empreinte d'arrivée, validée par le serveur avec la même fonction pure (R9).
    const id = plancheIdRef.current;
    const envoyer = onCommandesRef.current;
    if (changeModele && options.envoyer !== false && id && envoyer && !readOnlyRef.current) {
      const delta = differencePlanche(avant, h.present.modele);
      if (delta) {
        const libelle = options.libelle ?? h.present.operation ?? libelleOutil(outilRef.current);
        void Promise.resolve(envoyer([{ type: "planche.operation", params: { id, libelle, delta, empreinteApres: empreintePlanche(h.present.modele) } }], libelle)).catch((err: unknown) => setMessage(t("planche.persistance.refus", { motif: err instanceof Error ? err.message : String(err) })));
      }
    }
  }, []);

  /** Envoie un événement à la machine de l'outil actif ; renvoie `true` si l'état, le modèle ou la sélection a changé. */
  const envoyer = useCallback(
    (ev: EvenementOutil): boolean => {
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
        poserDans(tr.dans ?? undefined);
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
    [contexte, poserHistorique, poserDans, rafraichir, readOnly, setSelection, setMateriau, setBalise],
  );

  /**
   * Lot Planche 8 : choix d'une option de l'outil actif (bouton de la barre d'options, au doigt comme à la souris) — le
   * même chemin `configurer` que les touches Ctrl / Alt / ↓ traitées par la machine. Aucun pas d'historique.
   */
  const configurerOutil = useCallback(
    (option: string, valeur: string) => {
      const m = machineParId(outilRef.current);
      if (!m?.configurer) return;
      etatMachineRef.current = m.configurer(etatMachineRef.current, option, valeur, contexte()).etat;
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


  const demandeOutilRef = useRef<(id: string, options?: { garderPrecedent?: boolean }) => void>(() => undefined);
  const retourOutilRef = useRef<() => void>(() => undefined);
  const choisirOutil = useCallback(
    (id: string, options: { garderPrecedent?: boolean } = {}) => {
      const o = outilParId(id);
      if (!o) return;
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
        if (o.emplacement === "grille") setRecent(id);
        rafraichir();
        return;
      }
      // Lot 6 : le moteur booléen (manifold-3d) est chargé au premier outil de solides, jamais à l'ouverture (MO-4).
      if (OUTILS_SOLIDES.has(id) && !booleensRef.current) {
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
      outilRef.current = id;
      etatMachineRef.current = machineParId(id)?.initial() ?? null;
      setOutilId(id);
      setTexte(null);
      setMessage(null);
      if (o.emplacement === "grille") setRecent(id);
      rafraichir();
    },
    [readOnly, rafraichir, setTexte],
  );

  demandeOutilRef.current = choisirOutil;
  /** Retour à l'outil précédent s'il est disponible, sinon Sélection. */
  const retourOutil = useCallback(() => {
    const precedent = precedentRef.current;
    const o = outilParId(precedent);
    if (precedent !== outilRef.current && o && !disponibilite(o, { lecture: readOnly }) && !OUTILS_CAMERA_TEMPORAIRES.has(precedent)) choisirOutil(precedent);
    else choisirOutil("selection");
  }, [choisirOutil, readOnly]);
  retourOutilRef.current = retourOutil;

  const annulerPas = useCallback(() => {
    const op = operationAAnnuler(histRef.current);
    const h = annuler(histRef.current);
    if (!h) {
      setMessage(t("planche.rien.annuler"));
      return;
    }
    poserHistorique(h, { libelle: t("planche.annule", { operation: op ?? "" }) });
    etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
    setSelection([]);
    poserDans(undefined);
    setMessage(t("planche.annule", { operation: op ?? "" }));
    rafraichir();
  }, [poserDans, poserHistorique, rafraichir, setSelection]);

  const retablirPas = useCallback(() => {
    const op = operationARetablir(histRef.current);
    const h = retablir(histRef.current);
    if (!h) {
      setMessage(t("planche.rien.retablir"));
      return;
    }
    poserHistorique(h, { libelle: t("planche.retabli", { operation: op ?? "" }) });
    etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
    setSelection([]);
    poserDans(undefined);
    setMessage(t("planche.retabli", { operation: op ?? "" }));
    rafraichir();
  }, [poserDans, poserHistorique, rafraichir, setSelection]);

  /** Ctrl + G : la sélection devient un groupe (un pas) ; l'ouverture d'un groupe reste le double-clic de Sélection. */
  const grouperSelection = useCallback(() => {
    if (readOnly) return;
    const sel = selectionRef.current.filter((id) => genreAnnotation(id) === null);
    if (sel.length === 0) {
      setMessage(t("planche.groupe.vide"));
      return;
    }
    try {
      const m = histRef.current.present.modele;
      const n = Object.keys(m.definitions).length + 1;
      const r = grouper(m, sel, { nom: `Groupe ${n}`, ...(dansRef.current !== undefined ? { dans: dansRef.current } : {}) });
      poserHistorique(enregistrer(histRef.current, r.modele, t("planche.groupe.operation"), false));
      setSelection([r.occurrence]);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      setMessage(t("planche.groupe.cree"));
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
      poserDans(id);
      setSelection([]);
      etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
      setMessage(null);
      rafraichir();
    },
    [poserDans, rafraichir, setSelection],
  );
  const eclaterSelection = useCallback(
    () =>
      operer(t("planche.menu.eclater"), (m) => {
        const occs = selectionDe("occurrences", m);
        if (occs.length === 0) return { modele: m, message: t("planche.eclater.objet") };
        let courant = m;
        const crees: string[] = [];
        for (const id of occs) {
          const r = eclater(courant, id);
          courant = r.modele;
          crees.push(...r.rapport.crees);
        }
        return { modele: courant, selection: crees };
      }),
    [operer, selectionDe],
  );
  const rendreUniqueSelection = useCallback(
    () =>
      operer(t("planche.menu.rendre-unique"), (m) => {
        const c = contexteDe(m, dansRef.current);
        const occs = selectionDe("occurrences", m);
        if (occs.every((id) => nombreOccurrences(m, c.occurrences[id]!.definition) <= 1)) return { modele: m, message: t("planche.unique.deja") };
        let courant = m;
        for (const id of occs) courant = rendreUnique(courant, id).modele;
        return { modele: courant };
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
        return { modele: r.modele, selection: [r.occurrence], message: t("planche.composant.cree") };
      });
      hoteRef.current?.focus({ preventScroll: true });
    },
    [operer, o],
  );
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
  const diviserSelection = useCallback(
    () =>
      operer(t("planche.menu.diviser"), (m) => {
        const aretes = selectionDe("aretes", m);
        if (aretes.length === 0) return null;
        let courant = m;
        for (const id of aretes) courant = diviser(courant, id, 2, o()).modele;
        return { modele: courant, selection: [] };
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
    const M = dansRef.current ? matriceMonde(m, dansRef.current) ?? IDENTITE : IDENTITE;
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
    const M = dansRef.current ? matriceMonde(m, dansRef.current) ?? IDENTITE : IDENTITE;
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
  const alignerAxes = useCallback(
    () =>
      operer(t("planche.menu.aligner-axes"), (m) => {
        const f = faceMonde();
        if (!f) return { modele: m, message: t("planche.aligner-axes.face") };
        const z = f.normale;
        const x = normalize(sub(f.u, { x: z.x * (f.u.x * z.x + f.u.y * z.y + f.u.z * z.z), y: z.y * (f.u.x * z.x + f.u.y * z.y + f.u.z * z.z), z: z.z * (f.u.x * z.x + f.u.y * z.y + f.u.z * z.z) }));
        const y = cross(z, x);
        return { modele: modifierAnnotations(m, (a) => void (a.repere = { origine: f.centre, x, y, z })).modele };
      }),
    [operer, faceMonde],
  );
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
        if (faces.length > 0) {
          entrees.push({ id: "aligner-vue", libelle: t("planche.menu.aligner-vue"), separateurAvant: true, action: alignerVue });
          entrees.push({ id: "aligner-axes", libelle: t("planche.menu.aligner-axes"), grise: readOnly, action: alignerAxes });
          entrees.push({ id: "inverser-faces", libelle: t("planche.menu.inverser-faces"), grise: readOnly, action: inverserSelection });
          entrees.push({ id: "orienter-faces", libelle: t("planche.menu.orienter-faces"), grise: readOnly, action: orienterSelection });
          entrees.push({ id: "texture-unique", libelle: t("planche.menu.texture-unique"), grise: true });
        }
        if (aretes.length > 0) {
          entrees.push({ id: adoucies ? "durcir" : "adoucir", libelle: t(adoucies ? "planche.menu.durcir" : "planche.menu.adoucir"), separateurAvant: true, grise: readOnly, action: () => adoucirSelection(!adoucies) });
          entrees.push({ id: "diviser", libelle: t("planche.menu.diviser"), grise: readOnly, action: diviserSelection });
        }
        if (occs.length > 0) {
          const composant = def?.genre === "composant";
          entrees.push({ id: "modifier", libelle: t(composant ? "planche.menu.modifier-composant" : "planche.menu.modifier-groupe"), separateurAvant: true, grise: !unObjet || verrouille, action: () => unObjet && ouvrirOccurrence(unObjet.id) });
          entrees.push({ id: "eclater", libelle: t("planche.menu.eclater"), grise: readOnly || verrouille, action: eclaterSelection });
          entrees.push({ id: "rendre-unique", libelle: t("planche.menu.rendre-unique"), grise: readOnly || !def || nombreOccurrences(m, def.id) <= 1, action: rendreUniqueSelection });
          entrees.push({ id: "coque", libelle: t("planche.menu.coque"), grise: readOnly || occs.length !== 2 || booleensEtatRef.current !== "ok", action: coqueSelection });
          entrees.push({ id: "adoucir-lisser", libelle: t("planche.menu.adoucir-lisser"), grise: readOnly, action: () => setPanneau("adoucir") });
          entrees.push({ id: "reinitialiser-echelle", libelle: t("planche.menu.reinitialiser-echelle"), grise: true });
          entrees.push({ id: "reinitialiser-inclinaison", libelle: t("planche.menu.reinitialiser-inclinaison"), grise: true });
          entrees.push({ id: "changer-axes", libelle: t("planche.menu.changer-axes"), grise: true });
        }
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
      diviserSelection,
      eclaterSelection,
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

  /** Scènes (§6.8) : caméra enregistrée dans la Planche (annotation « v »), un pas chacune. */
  const ajouterScene = useCallback(
    () =>
      operer(t("planche.scenes.ajouter"), (m) => {
        const v = vueRef.current;
        if (!v) return null;
        const cam = v.etatCamera();
        const r = modifierAnnotations(m, (a, id) => {
          const i = id("v");
          a.scenes[i] = { id: i, nom: t("planche.scenes.nom", { numero: String(Object.keys(a.scenes).length + 1) }), position: cam.position, cible: cam.cible, champDeVision: cam.champDeVision, projection: cam.projection, ombres: vueRef.current?.lireOptions().ombres ?? false };
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
        return { modele: modifierAnnotations(m, (a) => void (a.scenes[id] = { ...s, position: cam.position, cible: cam.cible, champDeVision: cam.champDeVision, projection: cam.projection, ombres: v.lireOptions().ombres })).modele };
      }),
    [operer],
  );
  const supprimerScene = useCallback((id: string) => operer(t("planche.scenes.supprimer"), (m) => ({ modele: modifierAnnotations(m, (a) => void delete a.scenes[id]).modele, selection: selectionRef.current.filter((x) => x !== id) })), [operer]);
  const appliquerScene = useCallback(
    (s: Scene) => {
      const v = vueRef.current;
      if (!v) return;
      v.appliquerScene(s);
      if (s.ombres !== undefined) majOptions({ ombres: s.ombres });
      setCamera({ projection: s.projection, champDeVision: s.champDeVision });
      setSelection([s.id]);
      rafraichir();
    },
    [majOptions, rafraichir, setSelection],
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
  const poserReglages = useCallback((r: ReglagesPlanche) => operer(t("planche.infomodele.enregistre"), (m) => ({ modele: modifierAnnotations(m, (a) => void (a.reglages = r)).modele, message: t("planche.infomodele.enregistre") })), [operer]);
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
      renommerPlan: (id: string, nom: string) => operer(t("planche.info.nom"), () => ({ modele: modifierPlanDeCoupe(contexte(), id, { nom }).modele ?? histRef.current.present.modele })),
    }),
    [contexte, o, operer],
  );

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
    const mq = window.matchMedia("(max-width: 760px)");
    // En passant au format téléphone (rotation, fenêtre rétrécie), la colonne se replie aussi en icônes.
    const maj = () => {
      setEtroit(mq.matches);
      if (mq.matches) setColonneRepliee(true);
    };
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);

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
      });
    } catch {
      setWebgl("indisponible");
      return;
    }
    vueRef.current = v;
    v.majModele(histRef.current.present.modele);
    rafraichir();
    window.fadiPlanche = {
      modele: () => histRef.current.present.modele,
      outil: () => outilRef.current,
      etatOutil: () => etatMachineRef.current,
      selection: () => selectionRef.current,
      pas: () => histRef.current.passe.length,
      versEcran: (p) => vueRef.current?.versEcran(p) ?? null,
      materiau: () => materiauRef.current,
      balise: () => baliseRef.current,
      hauteurOeil: () => hauteurOeilRef.current,
      booleens: () => (booleensRef.current ? "ok" : booleensEtatRef.current),
      emprise: () => vueRef.current?.emprise() ?? null,
      camera: () => vueRef.current?.etatCamera() ?? { position: { x: 0, y: 0, z: 0 }, champDeVision: 35 },
      dans: () => dansRef.current,
      panneau: () => panneauRef.current,
      options: () => vueRef.current?.lireOptions() ?? OPTIONS_AFFICHAGE_DEFAUT,
      menu: () => menuRef.current?.entrees.map((e) => e.id) ?? null,
      pressePapiers: () => pressePapiers.current?.ids.length ?? 0,
    };
    return () => {
      v.detruire();
      vueRef.current = null;
      delete window.fadiPlanche;
    };
  }, [envoyer, rafraichir, setTexte]);

  // --- Brouillon local : lu à l'ouverture (s'il n'y a encore rien de dessiné), enregistré après chaque pas.
  useEffect(() => {
    let annule = false;
    brouillonCharge.current = false;
    void chargerBrouillon(projectId).then((m) => {
      if (annule) return;
      if (m && !plancheIdRef.current && histRef.current.passe.length === 0 && histRef.current.futur.length === 0) poserHistorique(historiqueInitial(m), { envoyer: false });
      brouillonCharge.current = true;
      rafraichir();
    });
    return () => {
      annule = true;
    };
  }, [projectId, poserHistorique, rafraichir]);
  useEffect(() => {
    if (!brouillonCharge.current || readOnly || plancheIdRef.current) return;
    const minuterie = window.setTimeout(() => void enregistrerBrouillon(projectId, hist.present.modele), 300);
    return () => window.clearTimeout(minuterie);
  }, [hist.present.modele, projectId, readOnly]);

  // --- Lot 7 : Planche ouverte. Sans Planche dans le projet, le brouillon local reste ; sinon la première s'ouvre.
  useEffect(() => {
    if (!etat) return;
    if (plancheId && listePlanches.some((d) => d.id === plancheId)) return;
    const suivante = listePlanches[0]?.id ?? null;
    if (suivante !== plancheId) etatUi.set({ plancheId: suivante });
  }, [etat, listePlanches, plancheId]);
  // Modèle de la Planche ouverte : adopté à l'ouverture et quand le projet le change (autre poste, lot refusé) ; nos
  // propres pas y sont déjà (le bus les applique localement) et se reconnaissent à l'empreinte.
  useEffect(() => {
    if (!plancheCourante) {
      plancheIdRef.current = null;
      return;
    }
    const changement = plancheIdRef.current !== plancheCourante.id;
    plancheIdRef.current = plancheCourante.id;
    if (!changement && empreintePlanche(histRef.current.present.modele) === plancheCourante.params.empreinte) return;
    poserHistorique(historiqueInitial(plancheCourante.params.modele), { envoyer: false });
    etatMachineRef.current = machineParId(outilRef.current)?.initial() ?? null;
    setSelection([]);
    poserDans(undefined);
    setMessage(changement ? null : t("planche.persistance.maj"));
    rafraichir();
  }, [plancheCourante, poserDans, poserHistorique, rafraichir, setSelection]);
  const commanderPlanche = useCallback((commandes: Commande[], libelle: string, puis?: () => void) => {
    const envoyer = onCommandesRef.current;
    if (!envoyer || readOnlyRef.current) return;
    void Promise.resolve(envoyer(commandes, libelle))
      .then(() => puis?.())
      .catch((err: unknown) => setMessage(t("planche.persistance.refus", { motif: err instanceof Error ? err.message : String(err) })));
  }, []);
  const actionsMenu = useMemo(
    () => ({
      ouvrir: (id: string) => etatUi.set({ plancheId: id }),
      creer: (nom: string, depuisBrouillon: boolean) => {
        const id = `planche-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        const modele = depuisBrouillon ? histRef.current.present.modele : undefined;
        // Le bus signale un refus (nom en double…) sans rejeter la promesse : le rappel vérifie que la Planche existe.
        commanderPlanche([{ type: "planche.creer", params: { id, nom, ...(modele ? { modele } : {}) } }], t("planche.nouvelle"), () => {
          if (!etatRef.current?.definitions[id]) return;
          etatUi.set({ plancheId: id });
          setMessage(t("planche.persistance.enregistree"));
        });
      },
      renommer: (id: string, nom: string, niveauId: string | null) => commanderPlanche([{ type: "planche.renommer", params: { id, nom, niveauId } }], t("planche.renommer")),
      copier: (source: string, nom: string) => {
        const id = `planche-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        commanderPlanche([{ type: "planche.copier", params: { id, source, nom } }], t("planche.enregistrer-sous"), () => {
          if (etatRef.current?.definitions[id]) etatUi.set({ plancheId: id });
        });
      },
      supprimer: (id: string) => commanderPlanche([{ type: "planche.supprimer", params: { id } }], t("planche.supprimer")),
      exporterIfc: async (id: string) => {
        try {
          const { blob, nom } = await api.getPlancheIfc(projectId, id);
          telechargerFichier(blob, nom);
        } catch (err) {
          setMessage(t("planche.export.echec", { motif: err instanceof Error ? err.message : String(err) }));
        }
      },
      exporterMaillage: (format: "obj" | "stl") => {
        const nom = plancheCourante?.params.nom ?? "planche";
        const r = format === "obj" ? exporterObj(histRef.current.present.modele, nom) : exporterStl(histRef.current.present.modele, nom);
        telechargerFichier(new Blob([r.contenu], { type: "text/plain;charset=utf-8" }), `${nom}.${format}`.replace(/[^\w.-]+/g, "_"));
        const omis = r.omis.aretesLibres + r.omis.annotations > 0 ? ` ${t("planche.export.omis", { aretes: String(r.omis.aretesLibres), annotations: String(r.omis.annotations) })}` : "";
        setMessage(t("planche.export.maillage", { format: format.toUpperCase(), objets: String(r.objets), triangles: String(r.triangles) }) + omis);
      },
      telechargerPng: async () => {
        const blob = await vueRef.current?.capture();
        if (blob) telechargerFichier(blob, `${plancheCourante?.params.nom ?? "planche"}.png`.replace(/[^\w.-]+/g, "_"));
      },
    }),
    [commanderPlanche, plancheCourante, projectId],
  );

  // --- Clavier (fenêtre) : touches d'état, annuler / rétablir, Échap, Entrée, frappe au champ Mesures, raccourcis.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
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
      // Ctrl + G (§5.6, lot 5) : créer un groupe de la sélection ; le groupe est ensuite baliser / solide.
      if (mod && !e.altKey && !e.shiftKey && cle === "g") {
        e.preventDefault();
        grouperSelection();
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
        e.preventDefault();
        if (cle === "v") collerSelection();
        else copierSelection(cle === "x");
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
    };
    // §5.5 (choix Fadi) : à la perte du focus, les touches tenues sont relâchées (un Ctrl « collé » bloquerait tout).
    const surPerte = () => {
      for (const touche of [...touchesTenues.current]) envoyerTouche(touche, "relachee");
      setMajVerrouillee(false);
    };
    // Les mêmes écouteurs servent la fenêtre du plan détaché (elle partage l'état : même brouillon, même historique).
    clavierRef.current = { touche: surTouche, relache: surRelache, perte: surPerte };
    const fenetres = [window, ...(fenetreRef.current ? [fenetreRef.current] : [])];
    for (const w of fenetres) {
      w.addEventListener("keydown", surTouche);
      w.addEventListener("keyup", surRelache);
      w.addEventListener("blur", surPerte);
    }
    return () => {
      for (const w of fenetres) {
        w.removeEventListener("keydown", surTouche);
        w.removeEventListener("keyup", surRelache);
        w.removeEventListener("blur", surPerte);
      }
    };
  }, [annulerPas, retablirPas, envoyerTouche, echap, choisirOutil, setTexte, grouperSelection, ouvrirDialogueComposant, majOptions, etendre, collerSelection, copierSelection]);

  // --- Planche détachable : la porte (toute la Planche — dessin, barre d'outils, panneaux, barre d'état, Mesures) est
  // DÉPLACÉE dans une fenêtre Document Picture-in-Picture — même contexte JavaScript, donc même brouillon et même
  // historique, sans synchronisation ; la page garde une carte « Rattacher ». Sans cette API (Firefox, Safari,
  // téléphone), « Détacher » passe la Planche en plein écran.
  useLayoutEffect(() => {
    const emplacement = emplacementRef.current;
    if (emplacement && !fenetreRef.current && porte.parentNode !== emplacement) emplacement.appendChild(porte);
    return () => porte.remove();
  }, [porte]);

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
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [porte]);

  const detacher = useCallback(async () => {
    const hote = hoteRef.current;
    const racine = racineRef.current;
    if (!hote || !racine) return;
    const dpip = (window as Window & { documentPictureInPicture?: { requestWindow: (options: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (dpip && window.matchMedia("(min-width: 761px)").matches) {
      try {
        const w = await dpip.requestWindow({ width: 1040, height: 700 });
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
        }
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
  }, [rattacher, porte]);

  useEffect(() => {
    const maj = () => setDetache(document.fullscreenElement === racineRef.current ? "plein-ecran" : fenetreRef.current ? "fenetre" : "non");
    document.addEventListener("fullscreenchange", maj);
    return () => {
      document.removeEventListener("fullscreenchange", maj);
      stylesObserveur.current?.disconnect();
      const w = fenetreRef.current;
      fenetreRef.current = null;
      try {
        w?.close();
      } catch {
        // déjà fermée
      }
    };
  }, []);

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

  const outil = outilParId(outilId);
  const etatTexte3D = outilId === "texte-3d" ? (etatMachineRef.current as EtatTexte3D | null) : null;
  // Plan de coupe sélectionné seul (§4.28) : barre Inverser / Coupe active / Effacer.
  const planSelectionne = useMemo(() => {
    const sel = vue.selection.length ? vue.selection : selectionRef.current;
    const id = sel.find((x) => genreAnnotation(x) === "plan");
    return id ? hist.present.modele.annotations?.plansDeCoupe[id] ?? null : null;
  }, [vue.selection, hist.present.modele]);
  const barre = useMemo(() => outilsBarre(), []);
  const sections = useMemo(() => sectionsGrille(), []);
  const raisonDe = (o: Outil) => disponibilite(o, { lecture: readOnly });
  const etatBarre = OUTILS_SOLIDES.has(outilId) && booleens === "chargement" ? t("planche.solides.chargement") : vue.erreur ?? message;
  const valeurMesures = texte?.texte ?? vue.mesures?.valeur ?? "";

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
        <span aria-hidden="true" className="outil-picto">{pictoOutil(o.id)}</span>
        <span className="outil-libelle" aria-hidden="true">{o.libelle}</span>
        {raison && dansGrille && <span className="outil-lot" aria-hidden="true">{t("planche.prevu.court", { lot: lotPrevu(o) })}</span>}
      </button>
    );
  };

  const recentOutil = recent ? outilParId(recent) : null;

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
        }}
      >
        {libelle}
      </button>
    ));

  /** Aide « ? » : barre d'état (ordinateur) ou rangée de saisie du volet (téléphone). */
  const aideBouton = <button type="button" className="lien" onClick={() => setPanneau(panneau === "instructeur" ? null : "instructeur")} title={t("bas.aide")} aria-label={t("bas.aide")}>?</button>;
  /** Langue et périphérique : barre d'état (ordinateur) ou barre du haut (téléphone). */
  const choix = (
    <>
      <ChoixLangue className="canevas-langue" />
      <ChoixPeripherique ui={ui} />
    </>
  );
  const canevasBas = (
    <span className="canevas-bas">
      {aideBouton}
      {choix}
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

  /** Barres d'opérations flottantes (D-198) : affichées par la liste « Outils ▾ » ; au téléphone, la dernière seulement, rangée en bas. */
  const barresOutils = barresRendues(ui.barresOutils, etroit)
    .map((id) => outilParId(id))
    .filter((o): o is Outil => o !== null)
    .map((o, rang) => (
      <BarreOutilsFlottante
        key={o.id}
        outil={o}
        rang={rang}
        outilId={outilId}
        telephone={etroit}
        raison={raisonDe}
        onChoisir={choisirOutil}
        onFermer={() => afficherBarre(o.id, false)}
        reference={racineRef}
        fenetreCle={detache}
        onDocquee={setHautDocquee}
      />
    ));
  const boutonOutils = (
    <BoutonOutils
      outilId={outilId}
      raison={raisonDe}
      onChoisir={choisirOutil}
      barres={ui.barresOutils}
      onAfficherBarre={afficherBarre}
      onReinitialiser={() => etatUi.set((u) => ({ barresOutils: reinitialiserDisposition(u.barresOutils) }))}
    />
  );

  /** Barre d'actions flottante (D-195) : annuler / rétablir du brouillon local et Détacher ; elle suit la Planche détachée. */
  const libelleDetacher = detache === "non" ? t("planche.detacher") : detache === "fenetre" ? t("planche.rattacher") : t("planche.plein-ecran.quitter");
  const barreActions = (
    <BarreActions
      annuler={{ id: "annuler", picto: "↶", libelle: t("planche.annuler"), titre: t("planche.annuler.titre", { operation: operationAAnnuler(hist) ?? "" }), onClick: annulerPas, disabled: hist.passe.length === 0, attributs: { "data-planche-annuler": "" } }}
      retablir={{ id: "retablir", picto: "↷", libelle: t("planche.retablir"), titre: t("planche.retablir.titre", { operation: operationARetablir(hist) ?? "" }), onClick: retablirPas, disabled: hist.futur.length === 0, attributs: { "data-planche-retablir": "" } }}
      autres={[
        {
          id: "detacher",
          picto: detache === "non" ? "⧉" : "⤡",
          libelle: libelleDetacher,
          titre: detache === "non" ? t("planche.detacher.aide") : libelleDetacher,
          texte: detache === "non" ? t("planche.detacher.court") : detache === "fenetre" ? t("planche.rattacher.court") : t("planche.plein-ecran.quitter.court"),
          onClick: () => (detache === "non" ? void detacher() : rattacher()),
          attributs: { "data-planche-detacher": "" },
        },
      ]}
      reference={racineRef}
      reserve={{ bas: ".planche-volet, [data-planche-pied], [data-barre-outils-docquee]", droite: ".planche-colonne" }}
      fenetreCle={`${detache}|${hautDocquee ?? ""}`}
    />
  );

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

  // La Planche est rendue dans sa porte (portail) : dans la page, la porte est posée dans `emplacement` ; détachée,
  // elle vit dans la fenêtre séparée et la carte d'état prend sa place ici.
  const planche = (
    <div ref={racineRef} className={`planche${tactile ? " planche-tactile" : ""}${volet ? " volet-ouvert" : ""}${outilsReplies ? " outils-replies" : ""}${colonneRepliee ? " colonne-repliee" : ""}${detache !== "non" ? " est-detache" : ""}`} data-planche data-outil-actif={outilId} data-planche-detache={detache}>
      <div className="planche-vue-cadre" data-planche-cadre>
        <div
          ref={hoteRef}
          className="planche-vue"
          tabIndex={0}
          role="application"
          aria-label={t("planche.vue")}
          aria-roledescription="zone de dessin"
          data-planche-vue
        >
          {webgl === "indisponible" && <p className="planche-webgl" role="alert">{t("planche.webgl")}</p>}
        </div>
      </div>

      <div className="planche-haut">
        {etat && <MenuPlanche planches={listePlanches} courante={plancheCourante} niveaux={niveauxProjet} lecture={readOnly} brouillonNonVide={Object.keys(hist.present.modele.racine.aretes).length + Object.keys(hist.present.modele.racine.occurrences).length > 0} actions={actionsMenu} />}
        {!plancheCourante && <p className="planche-brouillon" role="note" title={`${t("planche.brouillon")} — ${stockageDisponible() ? t("planche.brouillon.aide") : t("planche.brouillon.indisponible")}`} data-planche-brouillon>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
            <path d="M10 13h6M10 17h6" />
          </svg>
          <span className="sr-only">{t("planche.brouillon")}</span>
        </p>}
        {boutonOutils}
        {etroit && <span className="planche-haut-choix">{choix}</span>}
      </div>
      {barresOutils}
      {barreActions}

      {/* Volet : au bureau, `display: contents` (barre d'outils à gauche, pied en bas, comme avant) ; au téléphone,
          un seul volet bas dans le flux — outils en rangée, consigne, touches, Mesures — rien ne recouvre le dessin. */}
      <div className="planche-volet" ref={voletRef} data-planche-volet>
      <div className="planche-poignee" aria-hidden="true">
        <span />
      </div>
      <div className="planche-recherche-carte">
        <button type="button" className="outil" onClick={() => setRecherche(true)} title={t("planche.recherche.titre")} aria-label={t("planche.recherche.titre")} data-planche-recherche>
          <span aria-hidden="true" className="outil-picto">⌕</span>
          <span className="outil-libelle" aria-hidden="true">{t("planche.rechercher")}</span>
        </button>
      </div>
      <div className="planche-outils" role="toolbar" aria-label={t("planche.outils")} aria-orientation="vertical" data-planche-outils-replies={outilsReplies}>
        <button type="button" className="outil outil-fixe-haut planche-outils-bascule" aria-expanded={!outilsReplies} onClick={() => setOutilsReplies(!outilsReplies)} title={outilsReplies ? t("planche.outils.deplier") : t("planche.outils.replier")} aria-label={outilsReplies ? t("planche.outils.deplier") : t("planche.outils.replier")} data-planche-outils-bascule>
          <span aria-hidden="true" className="outil-picto">{outilsReplies ? "»" : "«"}</span>
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
          <span aria-hidden="true" className="outil-picto">⋯</span>
          <span className="outil-libelle" aria-hidden="true">{t("planche.plus")}</span>
        </button>
      </div>

      {grille && (
        <div className="planche-grille" id="planche-grille" role="dialog" aria-label={t("planche.grille")} ref={grilleDom} data-planche-grille>
          {sections.map((s) => (
            <section key={s.libelle} aria-label={s.libelle}>
              <h4>{s.libelle}</h4>
              <div className="canevas-grille">{s.outils.map((o) => boutonOutil(o, true))}</div>
            </section>
          ))}
        </div>
      )}

      <nav className="planche-colonne" aria-label={t("canevas.panneaux")}>
        <button type="button" className="canevas-icone planche-colonne-bascule" aria-expanded={!colonneRepliee} onClick={() => setColonneRepliee(!colonneRepliee)} title={colonneRepliee ? t("planche.colonne.deplier") : t("planche.colonne.replier")} aria-label={colonneRepliee ? t("planche.colonne.deplier") : t("planche.colonne.replier")} data-planche-colonne-bascule>
          <span aria-hidden="true" className="canevas-picto">{colonneRepliee ? "«" : "»"}</span>
        </button>
        <button type="button" className="canevas-icone" aria-pressed={panneau === "instructeur"} onClick={() => setPanneau(panneau === "instructeur" ? null : "instructeur")} title={t("panneau.instructeur")} data-planche-panneau-icone="instructeur">
          <span aria-hidden="true" className="canevas-picto">?</span>
          <span className="canevas-etiquette">{t("panneau.instructeur")}</span>
        </button>
        <button type="button" className="canevas-icone" aria-pressed={panneau === "materiaux"} onClick={() => setPanneau(panneau === "materiaux" ? null : "materiaux")} title={t("panneau.materiaux")} data-planche-panneau-icone="materiaux">
          <span aria-hidden="true" className="canevas-picto">▨</span>
          <span className="canevas-etiquette">{t("panneau.materiaux")}</span>
        </button>
        <button type="button" className="canevas-icone" aria-pressed={panneau === "balises"} onClick={() => setPanneau(panneau === "balises" ? null : "balises")} title={t("panneau.balises")} data-planche-panneau-icone="balises">
          <span aria-hidden="true" className="canevas-picto">⌖</span>
          <span className="canevas-etiquette">{t("panneau.balises")}</span>
        </button>
        <button type="button" className="canevas-icone" aria-pressed={panneau === "objets" || (panneau !== null && PANNEAUX_OBJETS.has(panneau))} onClick={() => setPanneau(panneau === "objets" || (panneau !== null && PANNEAUX_OBJETS.has(panneau)) ? null : "objets")} title={t("panneau.objets")} data-planche-panneau-icone="objets">
          <span aria-hidden="true" className="canevas-picto">▤</span>
          <span className="canevas-etiquette">{t("panneau.objets")}</span>
        </button>
      </nav>
      {panneau === "materiaux" && (
        <section className="planche-panneau" aria-label={t("panneau.materiaux")} data-planche-panneau="materiaux">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.materiaux")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.materiaux") })}>×</button>
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
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.balises") })}>×</button>
          </header>
          <div className="canevas-panneau-corps">
            <PanneauBalises
              modele={hist.present.modele}
              courante={balise}
              lecture={readOnly}
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

      {panneau === "objets" && (
        <section className="planche-panneau" aria-label={t("panneau.objets")} data-planche-panneau="objets">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.objets")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.objets") })}>×</button>
          </header>
          <div className="canevas-panneau-corps planche-choix-panneaux">
            {LISTE_PANNEAUX_OBJETS.map(([id, picto]) => (
              <button key={id} type="button" className="canevas-icone" onClick={() => setPanneau(id)} title={t(`panneau.${id}` as "panneau.info-entite")} data-planche-panneau-icone={id}>
                <span aria-hidden="true" className="canevas-picto">{picto}</span>
                <span className="canevas-etiquette">{t(`panneau.${id}` as "panneau.info-entite")}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {panneau && PANNEAUX_OBJETS.has(panneau) && (
        <section className="planche-panneau" aria-label={t(`panneau.${panneau}` as "panneau.info-entite")} data-planche-panneau={panneau}>
          <header className="canevas-panneau-tete">
            <button type="button" className="lien planche-retour-panneaux" onClick={() => setPanneau("objets")} title={t("panneau.objets")} aria-label={t("panneau.objets")} data-planche-panneaux-retour>◂</button>
            <h3>{t(`panneau.${panneau}` as "panneau.info-entite")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t(`panneau.${panneau}` as "panneau.info-entite") })}>×</button>
          </header>
          <div className="canevas-panneau-corps">
            {panneau === "info-entite" && <PanneauInfoEntite modele={hist.present.modele} selection={vue.selection ?? selectionRef.current} dans={dans} lecture={readOnly} separateur={SEPARATEUR_DECIMAL} actions={actionsInfo} />}
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
            {panneau === "ombres" && <PanneauOmbres options={options} onOptions={majOptions} latitudeParcelle={null} />}
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
              <PanneauScenes modele={hist.present.modele} lecture={readOnly} projection={camera.projection} champDeVision={camera.champDeVision} onAjouter={ajouterScene} onMettreAJour={mettreAJourScene} onAppliquer={appliquerScene} onSupprimer={supprimerScene} onVueStandard={vueStandard} onProjection={poserProjection} onChampDeVision={poserChampDeVision} />
            )}
            {panneau === "adoucir" && <PanneauAdoucir selection={vue.selection ?? selectionRef.current} lecture={readOnly} onAppliquer={adoucirLisserSelection} />}
            {panneau === "info-modele" && <PanneauInfoModele modele={hist.present.modele} lecture={readOnly} precision={precision} onPrecision={poserPrecision} onReglages={poserReglages} />}
            {panneau === "navigateur" && (
              <NavigateurPlanche
                modele={hist.present.modele}
                selection={vue.selection ?? selectionRef.current}
                dans={dans}
                lecture={readOnly}
                onSelectionner={(id, d) => {
                  if (d !== dansRef.current) poserDans(d);
                  setSelection([id]);
                  rafraichir();
                }}
                onEntrer={(id) => {
                  poserDans(id);
                  setSelection([]);
                  rafraichir();
                }}
                onCibler={(id) => {
                  const b = boiteOccurrence(histRef.current.present.modele, id);
                  if (b) vueRef.current?.cadrer(b, margesVue(racineRef.current));
                }}
                onMasquer={(id, d, masquee) => operer(t(masquee ? "planche.menu.masquer" : "planche.menu.afficher"), (m) => ({ modele: masquerEntites(m, [id], d !== undefined ? { dans: d } : {}, masquee).modele }))}
                onSupprimer={(id, d) => operer(t("planche.menu.effacer"), (m) => ({ modele: effacerEntites(m, [id], d !== undefined ? { dans: d } : {}).modele, selection: selectionRef.current.filter((x) => x !== id) }))}
              />
            )}
          </div>
        </section>
      )}
      {menu && <MenuContextuel x={menu.x} y={menu.y} entrees={menu.entrees} onFermer={fermerMenu} />}
      {dialogueComposant && <DialogueComposant nomDefaut={`${t("planche.composant.defaut")} ${Object.values(hist.present.modele.definitions).filter((d) => d.genre === "composant").length + 1}`} onCreer={creerComposant} onAnnuler={() => setDialogueComposant(false)} />}
      {planSelectionne && (
        <div className="planche-coupe-barre" role="toolbar" aria-label={t("planche.coupe.selectionne")} data-planche-coupe>
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
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.instructeur") })}>×</button>
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
      <footer className="planche-bas">
        <p className="planche-etat" aria-live="polite" aria-label={t("planche.etat")} data-planche-etat>
          {dans && <span className="planche-contexte" data-planche-contexte>{t("planche.edition", { nom: nomOccurrence(hist.present.modele, dans) })} | </span>}
          <span className="planche-consigne">{vue.consigne}</span>
          {etatBarre && <span className="planche-message" data-planche-message> | {etatBarre}</span>}
        </p>
        <button type="button" className="planche-volet-bascule" aria-expanded={volet} onClick={() => setVolet(!volet)} title={volet ? t("planche.volet.moins.aide") : t("planche.volet.plus.aide")} data-planche-volet-bascule>
          {volet ? t("planche.volet.moins") : t("planche.volet.plus")}
        </button>
        {!etroit && canevasBas}
      </footer>

      {vue.options && vue.options.length > 0 && (
        <div className="planche-options-outil" role="group" aria-label={t("planche.options")} data-planche-options>
          {/* Écran étroit : seuls les groupes utilisables pour la cible courante (sinon trois rangées au téléphone). */}
          {vue.options.filter((o) => !etroit || o.valeurs.some((v) => v.disponible)).map((o) => (
            <span key={o.id} className="planche-option" role="group" aria-label={libelleOption(outilId, o.id)} data-planche-option={o.id}>
              <span className="planche-option-nom" aria-hidden="true">{libelleOption(outilId, o.id)}</span>
              {o.valeurs.map((v) => {
                const nom = libelleOption(outilId, o.id, v.id);
                const titre = v.disponible ? (v.raccourci ? `${nom} (${v.raccourci})` : nom) : t("planche.option.indisponible", { option: nom });
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
      {etroit && <span className="canevas-bas">{aideBouton}</span>}
      <div className="planche-modificateurs" role="toolbar" aria-label={t("planche.modificateurs")} data-planche-modificateurs>
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
            else envoyerTouche("Maj", "relachee");
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
    if (o) return m.definitions[o.definition]?.nom ?? id;
  }
  return id;
}

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

const STATUTS: Record<Outil["statutReleve"], string> = { observe: "observé en direct", instructor: "texte de l'Instructeur, effet non constaté", "non-verifie": "non vérifié", fadi: "écart propre à Fadi" };
const MODES: Record<string, string> = { bascule: "bascule", maintenu: "maintenu", appui: "à chaque appui" };

/** Instructeur (§6.3) : l'outil actif expliqué depuis le catalogue — étapes, touches modificatrices, suite. */
function InstructeurPlanche({ outil, raison }: { outil: Outil | null; raison: string | null }) {
  if (!outil) return <p className="inspecteur-aide">{t("planche.instructeur.aucun")}</p>;
  const etapes = outil.etapes.filter((e) => e.consigne);
  return (
    <div className="instructeur" data-instructeur={outil.id}>
      <p className="instructeur-outil">
        <span aria-hidden="true" className="canevas-picto">{pictoOutil(outil.id)}</span> <strong>{outil.libelle}</strong>
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
                {m.mode ? ` (${MODES[m.mode] ?? m.mode})` : ""} : {m.effet}
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
      <p className="inspecteur-aide">{t("planche.instructeur.releve", { statut: STATUTS[outil.statutReleve] })}</p>
    </div>
  );
}

/** Recherche d'outil (Maj + -, §4.35) : libellé français ou nom de référence, insensible aux accents. */
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
                <span aria-hidden="true" className="outil-picto">{pictoOutil(o.id)}</span> {o.libelle}
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
  const etroit = window.matchMedia("(max-width: 760px)").matches;
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

/** Panneau Balises (lot 5, P-9 : une balise = un calque) : visibilité, balise courante pour l'outil Balise. */
function PanneauBalises({ modele, courante, lecture, onChoisir, onVisible, onCreer }: { modele: Modele; courante: string | null; lecture: boolean; onChoisir: (id: string) => void; onVisible: (id: string, visible: boolean) => void; onCreer: (nom: string, couleur: string) => void }) {
  const balises = Object.values(modele.annotations?.balises ?? {});
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState("#2f7bd6");
  return (
    <div className="planche-liste-panneau" data-planche-balises>
      <ul role="listbox" aria-label={t("panneau.balises")}>
        {balises.map((b) => (
          <li key={b.id} role="option" aria-selected={courante === b.id} className={courante === b.id ? "est-actif" : undefined} data-planche-balise={b.id}>
            <input type="checkbox" checked={b.visible} disabled={lecture} aria-label={`${t("planche.balise.visible")} — ${b.nom}`} onChange={(e) => onVisible(b.id, e.target.checked)} data-planche-balise-visible />
            <button type="button" className="planche-ligne-choix" onClick={() => onChoisir(b.id)}>
              <span className="planche-pastille" style={{ background: b.couleur }} aria-hidden="true" />
              {b.nom}
            </button>
          </li>
        ))}
      </ul>
      {balises.length === 0 && <p className="inspecteur-aide">{t("planche.balise.aucune")}</p>}
      {!lecture && (
        <form
          className="planche-creation"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nom.trim() || `${t("planche.balise.nouvelle")} ${balises.length + 1}`;
            onCreer(n, couleur);
            setNom("");
          }}
          data-planche-balise-creation
        >
          <h4>{t("planche.balise.nouvelle")}</h4>
          <label>
            {t("planche.materiau.nom")}
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" data-planche-balise-nom />
          </label>
          <label>
            {t("planche.materiau.couleur")}
            <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} data-planche-balise-couleur />
          </label>
          <button type="submit" data-planche-balise-creer>{t("planche.balise.creer")}</button>
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
