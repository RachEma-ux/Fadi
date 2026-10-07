/**
 * Mode « Planche » de l'Atelier (cahier-planche MO-1, §3, lot 2) : géométrie libre façon SketchUp pour le Web, en
 * disposition Canevas (D-156) — dessin plein écran, barre d'outils verticale à gauche (outils « barre » du catalogue,
 * outil récent, grille « … »), colonne de panneaux à droite (Instructeur), barre du bas (barre d'état `aria-live`,
 * champ Mesures). Toute la logique des outils est dans les machines d'états pures de `@parcours/planche-model` :
 * cette interface ne fait que traduire pointeur et clavier en `EvenementOutil`, appeler `traiter`, puis afficher
 * `vue()`. Brouillon LOCAL (C6) : aucun envoi au serveur, aucune commande ; annuler / rétablir local.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COULEUR_MATERIAU_DEFAUT,
  EXTRUSION_TEXTE_3D,
  HAUTEUR_TEXTE_3D,
  analyserSaisie,
  configurerTexte3D,
  effacerEntites,
  genreAnnotation,
  grouper,
  machineParId,
  modeleVide,
  modifierAnnotations,
  modifierPlanDeCoupe,
  outilParId,
  rechercherOutil,
  type AdaptateurBooleens,
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
import { useEtatUi } from "../etat-ui";
import { ChoixPeripherique } from "../panneaux/Navigation";
import { t } from "../messages";
import { ChoixLangue } from "../../../../components/ChoixLangue";
import { annuler, enregistrer, historiqueInitial, operationAAnnuler, operationARetablir, retablir, type Historique } from "./historique";
import { chargerBrouillon, enregistrerBrouillon, stockageDisponible } from "./brouillon";
import { OUTILS_CAMERA_TEMPORAIRES, OUTILS_SOLIDES, commenceSaisie, disponibilite, estOutilCamera, estRecherche, libelleOutil, lotPrevu, outilDuClavier, outilsBarre, pictoOutil, sectionsGrille, titreOutil, toucheEtat, type OutilCamera } from "./outils-planche";
import { HAUTEUR_OEIL_DEFAUT, VuePlanche } from "./vue-planche";
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
    };
  }
}

export interface PropsPlanche {
  projectId: string;
  readOnly: boolean;
}

/** Locale française du champ Mesures : virgule décimale, point-virgule de liste (proposition P-3, cahier §5.3). */
const SEPARATEUR_DECIMAL = "," as const;

type TexteMesures = { texte: string; statut: "frappe" | "valide" } | null;

function champSaisie(cible: EventTarget | null): boolean {
  return cible instanceof HTMLInputElement || cible instanceof HTMLTextAreaElement || cible instanceof HTMLSelectElement || (cible instanceof HTMLElement && cible.isContentEditable);
}

const virgule = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

export function Planche({ projectId, readOnly }: PropsPlanche) {
  const ui = useEtatUi();
  const navigationRef = useRef(ui.navigation);
  navigationRef.current = ui.navigation;

  // --- État de l'outil et du brouillon (refs = source de vérité synchrone ; états = rendu).
  const histRef = useRef<Historique>(historiqueInitial(modeleVide()));
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
  const [panneau, setPanneau] = useState<"instructeur" | "materiaux" | "balises" | null>(null);
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
  const [recent, setRecent] = useState<string | null>(null);
  const [tactile, setTactile] = useState(false);
  // Téléphone (≤ 760 px) : annuler / rétablir vivent dans le volet bas, l'aide dans la barre du haut.
  const [etroit, setEtroit] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const [majVerrouillee, setMajVerrouillee] = useState(false);
  const [webgl, setWebgl] = useState<"ok" | "indisponible">("ok");
  // Volet bas (téléphone) : replié, la consigne tient sur une ligne ; déployé, consigne complète et flèches.
  const [volet, setVolet] = useState(false);
  // Rail d'outils replié par défaut (pictogrammes seuls, libellés en info-bulle) ; « » » affiche les libellés.
  const [outilsReplies, setOutilsReplies] = useState(true);
  // Colonne de panneaux (droite) : étiquettes affichées par défaut au téléphone, « » » les replie.
  const [colonneRepliee, setColonneRepliee] = useState(false);
  // Plan détaché : fenêtre séparée (Document Picture-in-Picture, bureau) ou plein écran (repli, téléphone).
  const [detache, setDetache] = useState<"non" | "fenetre" | "plein-ecran">("non");
  const fenetreRef = useRef<Window | null>(null);
  const emplacementRef = useRef<HTMLDivElement | null>(null);
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

  const poserHistorique = useCallback((h: Historique) => {
    const changeModele = h.present.modele !== histRef.current.present.modele;
    histRef.current = h;
    setHist(h);
    if (changeModele) vueRef.current?.majModele(h.present.modele);
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
    poserHistorique(h);
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
    poserHistorique(h);
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
    const maj = () => setEtroit(mq.matches);
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
      if (m && histRef.current.passe.length === 0 && histRef.current.futur.length === 0) poserHistorique(historiqueInitial(m));
      brouillonCharge.current = true;
      rafraichir();
    });
    return () => {
      annule = true;
    };
  }, [projectId, poserHistorique, rafraichir]);
  useEffect(() => {
    if (!brouillonCharge.current || readOnly) return;
    const minuterie = window.setTimeout(() => void enregistrerBrouillon(projectId, hist.present.modele), 300);
    return () => window.clearTimeout(minuterie);
  }, [hist.present.modele, projectId, readOnly]);

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
      if ((e.key === "Enter" || e.key === " ") && cible instanceof Element && cible.closest("button, a[href], summary, select") && !texteRef.current) return;
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
  }, [annulerPas, retablirPas, envoyerTouche, echap, choisirOutil, setTexte, grouperSelection]);

  // --- Plan détachable : le nœud de la vue (canvas three.js, surcouches, écouteurs) est DÉPLACÉ dans une fenêtre
  // Document Picture-in-Picture — même contexte JavaScript, donc même brouillon et même historique, sans
  // synchronisation ; la fenêtre principale garde outils, Instructeur et barre d'état. Sans cette API (Firefox,
  // Safari, téléphone), « Détacher » passe la Planche en plein écran.
  const rattacher = useCallback(() => {
    const w = fenetreRef.current;
    if (w) {
      fenetreRef.current = null;
      const hote = hoteRef.current;
      const emplacement = emplacementRef.current;
      if (hote && emplacement && hote.parentNode !== emplacement) emplacement.appendChild(hote);
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
  }, []);

  const detacher = useCallback(async () => {
    const hote = hoteRef.current;
    const racine = racineRef.current;
    if (!hote || !racine) return;
    const dpip = (window as Window & { documentPictureInPicture?: { requestWindow: (options: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (dpip && window.matchMedia("(min-width: 761px)").matches) {
      try {
        const w = await dpip.requestWindow({ width: 1040, height: 700 });
        for (const feuille of Array.from(document.styleSheets)) {
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
        }
        const base = w.document.createElement("style");
        base.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:#f4f6f8}.planche-vue{height:100%}";
        w.document.head.appendChild(base);
        w.document.documentElement.lang = document.documentElement.lang;
        w.document.title = `Fadi · ${t("mode.planche")}`;
        w.document.body.appendChild(hote);
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
  }, [rattacher]);

  useEffect(() => {
    const maj = () => setDetache(document.fullscreenElement === racineRef.current ? "plein-ecran" : fenetreRef.current ? "fenetre" : "non");
    document.addEventListener("fullscreenchange", maj);
    return () => {
      document.removeEventListener("fullscreenchange", maj);
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
      if (grilleDom.current && c && !grilleDom.current.contains(c) && !(c instanceof Element && c.closest("[data-planche-plus]"))) setGrille(false);
    };
    window.addEventListener("pointerdown", surClic);
    return () => window.removeEventListener("pointerdown", surClic);
  }, [grille]);

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
  const fleches = (
    <span className="planche-fleches" role="group" aria-label={t("planche.mod.fleches")}>
      {boutonsTouches([
        ["FlecheGauche", "←", t("planche.mod.gauche")],
        ["FlecheHaut", "↑", t("planche.mod.haut")],
        ["FlecheDroite", "→", t("planche.mod.droite")],
        ["FlecheBas", "↓", t("planche.mod.bas")],
      ])}
    </span>
  );

  /** Annuler / rétablir, dans la barre du haut. */
  const annulerRetablir = (
    <div className="barre-groupe planche-annuler-retablir" role="group" aria-label={`${t("planche.annuler")} / ${t("planche.retablir")}`}>
      <button type="button" onClick={annulerPas} disabled={hist.passe.length === 0} title={t("planche.annuler.titre", { operation: operationAAnnuler(hist) ?? "" })} data-planche-annuler>
        ↶<span className="sr-only">{t("planche.annuler")}</span>
      </button>
      <button type="button" onClick={retablirPas} disabled={hist.futur.length === 0} title={t("planche.retablir.titre", { operation: operationARetablir(hist) ?? "" })} data-planche-retablir>
        ↷<span className="sr-only">{t("planche.retablir")}</span>
      </button>
    </div>
  );

  return (
    <div ref={racineRef} className={`planche${tactile ? " planche-tactile" : ""}${volet ? " volet-ouvert" : ""}${outilsReplies ? " outils-replies" : ""}${colonneRepliee ? " colonne-repliee" : ""}${detache !== "non" ? " est-detache" : ""}`} data-planche data-outil-actif={outilId} data-planche-detache={detache}>
      {/* Le nœud `.planche-vue` est déplacé tel quel dans la fenêtre détachée, puis rendu ici ; la carte d'état
          vient APRÈS lui (React n'insère alors jamais avant un nœud absent du document). */}
      <div ref={emplacementRef} className="planche-vue-cadre" data-planche-cadre>
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
        {detache === "fenetre" && (
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
        )}
      </div>

      <div className="planche-haut">
        <p className="planche-brouillon" role="note" title={`${t("planche.brouillon")} — ${stockageDisponible() ? t("planche.brouillon.aide") : t("planche.brouillon.indisponible")}`} data-planche-brouillon>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
            <path d="M10 13h6M10 17h6" />
          </svg>
          <span className="sr-only">{t("planche.brouillon")}</span>
        </p>
        {annulerRetablir}
        {etroit && <span className="planche-haut-choix">{choix}</span>}
        <button
          type="button"
          className="planche-detacher"
          onClick={() => (detache === "non" ? void detacher() : rattacher())}
          title={detache === "non" ? t("planche.detacher.aide") : detache === "fenetre" ? t("planche.rattacher") : t("planche.plein-ecran.quitter")}
          aria-label={detache === "non" ? t("planche.detacher") : detache === "fenetre" ? t("planche.rattacher") : t("planche.plein-ecran.quitter")}
          data-planche-detacher
        >
          <span aria-hidden="true" className="outil-picto">{detache === "non" ? "⧉" : "⤡"}</span>
          <span className="planche-detacher-libelle" aria-hidden="true">{detache === "non" ? t("planche.detacher.court") : detache === "fenetre" ? t("planche.rattacher.court") : t("planche.plein-ecran.quitter.court")}</span>
        </button>
      </div>

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
            const texte = editionRef.current?.value ?? edition.texte;
            setEdition(null);
            envoyer({ genre: "saisie", texte });
            hoteRef.current?.focus({ preventScroll: true });
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
        {!etroit && fleches}
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

const STATUTS: Record<Outil["statutReleve"], string> = { observe: "observé en direct", instructor: "texte de l'Instructeur, effet non constaté", "non-verifie": "non vérifié" };
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
                {o.raccourci && <kbd>{o.raccourci}</kbd>}
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
