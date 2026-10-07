/**
 * Mode « Planche » de l'Atelier (cahier-planche MO-1, §3, lot 2) : géométrie libre façon SketchUp pour le Web, en
 * disposition Canevas (D-156) — dessin plein écran, barre d'outils verticale à gauche (outils « barre » du catalogue,
 * outil récent, grille « … »), colonne de panneaux à droite (Instructeur), barre du bas (barre d'état `aria-live`,
 * champ Mesures). Toute la logique des outils est dans les machines d'états pures de `@parcours/planche-model` :
 * cette interface ne fait que traduire pointeur et clavier en `EvenementOutil`, appeler `traiter`, puis afficher
 * `vue()`. Brouillon LOCAL (C6) : aucun envoi au serveur, aucune commande ; annuler / rétablir local.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyserSaisie, machineParId, modeleVide, outilParId, rechercherOutil, type ContexteOutil, type EvenementOutil, type Modele, type Outil, type Touche, type VueOutil } from "@parcours/planche-model";
import { useEtatUi } from "../etat-ui";
import { ChoixPeripherique } from "../panneaux/Navigation";
import { t } from "../messages";
import { ChoixLangue } from "../../../../components/ChoixLangue";
import { annuler, enregistrer, historiqueInitial, operationAAnnuler, operationARetablir, retablir, type Historique } from "./historique";
import { chargerBrouillon, enregistrerBrouillon, stockageDisponible } from "./brouillon";
import { commenceSaisie, disponibilite, estOutilCamera, estRecherche, libelleOutil, lotPrevu, outilDuClavier, outilsBarre, pictoOutil, sectionsGrille, titreOutil, toucheEtat, type OutilCamera } from "./outils-planche";
import { VuePlanche } from "./vue-planche";
import "./planche.css";

declare global {
  interface Window {
    /** Instrumentation de la recette (lecture seule) : modèle du brouillon, outil actif, projection écran. */
    fadiPlanche?: { modele: () => Modele; outil: () => string; etatOutil: () => unknown; pas: () => number; versEcran: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null };
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
  const [vue, setVue] = useState<VueOutil>(() => vueParDefaut(outilRef.current, 35));
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
  const [panneau, setPanneau] = useState<"instructeur" | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [tactile, setTactile] = useState(false);
  const [majVerrouillee, setMajVerrouillee] = useState(false);
  const [webgl, setWebgl] = useState<"ok" | "indisponible">("ok");
  const brouillonCharge = useRef(false);

  const hoteRef = useRef<HTMLDivElement | null>(null);
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

  const contexte = useCallback(
    (): ContexteOutil => ({
      modele: histRef.current.present.modele,
      selection: selectionRef.current,
      separateurDecimal: SEPARATEUR_DECIMAL,
      entitesDansCadre: (de, a, genre) => vueRef.current?.entitesDansCadre(de, a, genre) ?? [],
      entitesDansContour: (contour, genre) => vueRef.current?.entitesDansContour(contour, genre) ?? [],
      ...(dansRef.current !== undefined ? { dans: dansRef.current } : {}),
    }),
    [],
  );

  /** Recalcule la vue de l'outil actif (machine, sinon catalogue) et met les surcouches à jour. */
  const rafraichir = useCallback(() => {
    const m = machineParId(outilRef.current);
    let v: VueOutil;
    try {
      v = m ? m.vue(etatMachineRef.current, contexte()) : vueParDefaut(outilRef.current, vueRef.current?.champDeVision ?? 35);
    } catch (err) {
      v = { ...vueParDefaut(outilRef.current, 35), erreur: `Erreur de l'outil : ${err instanceof Error ? err.message : String(err)}` };
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
      // Un survol ou le simple relâchement d'une touche (Ctrl après Ctrl + Z) n'efface pas le message en cours.
      if (ev.genre !== "survol" && !(ev.genre === "touche" && ev.etat === "relachee")) setMessage(null);
      rafraichir();
      // Outil demandé par la machine (Diviser rend la main à Sélection) : appliqué après la transition.
      if (tr.outil !== undefined && tr.outil !== outilRef.current) {
        demandeOutilRef.current(tr.outil);
        change = true;
      }
      return change;
    },
    [contexte, poserHistorique, poserDans, rafraichir, readOnly, setSelection],
  );

  const demandeOutilRef = useRef<(id: string) => void>(() => undefined);
  const choisirOutil = useCallback(
    (id: string) => {
      const o = outilParId(id);
      if (!o) return;
      const raison = disponibilite(o, { lecture: readOnly });
      if (raison) {
        setMessage(raison);
        return;
      }
      setGrille(false);
      if (id !== outilRef.current) precedentRef.current = outilRef.current;
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
      const precedent = precedentRef.current;
      const o = outilParId(precedent);
      if (precedent !== outilRef.current && o && !disponibilite(o, { lecture: readOnly })) choisirOutil(precedent);
      else choisirOutil("selection");
      return;
    }
    // Outil de dessin, de modification ou Sélection : l'outil reste actif ; la sélection est vidée.
    setSelection([]);
    rafraichir();
  }, [choisirOutil, envoyer, rafraichir, readOnly, setSelection, setTexte]);

  /** Entrée : valide la saisie du champ Mesures (ou transmet Entrée à l'outil quand le champ est vide). */
  const valider = useCallback(() => {
    const saisie = texteRef.current?.texte.trim() ?? "";
    if (!saisie) {
      envoyerTouche("Entree", "enfoncee");
      envoyerTouche("Entree", "relachee");
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
  }, [envoyer, envoyerTouche, rafraichir, setTexte, vue.mesures]);
  const validerRef = useRef(valider);
  validerRef.current = valider;

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
      pas: () => histRef.current.passe.length,
      versEcran: (p) => vueRef.current?.versEcran(p) ?? null,
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
    window.addEventListener("keydown", surTouche);
    window.addEventListener("keyup", surRelache);
    window.addEventListener("blur", surPerte);
    return () => {
      window.removeEventListener("keydown", surTouche);
      window.removeEventListener("keyup", surRelache);
      window.removeEventListener("blur", surPerte);
    };
  }, [annulerPas, retablirPas, envoyerTouche, echap, choisirOutil, setTexte]);

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
  const barre = useMemo(() => outilsBarre(), []);
  const sections = useMemo(() => sectionsGrille(), []);
  const raisonDe = (o: Outil) => disponibilite(o, { lecture: readOnly });
  const etatBarre = vue.erreur ?? message;
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

  return (
    <div className={`planche${tactile ? " planche-tactile" : ""}`} data-planche data-outil-actif={outilId}>
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

      <div className="planche-haut">
        <p className="planche-brouillon" role="note" title={stockageDisponible() ? t("planche.brouillon.aide") : t("planche.brouillon.indisponible")} data-planche-brouillon>
          {t("planche.brouillon")}
        </p>
        <div className="barre-groupe" role="group" aria-label={`${t("planche.annuler")} / ${t("planche.retablir")}`}>
          <button type="button" onClick={annulerPas} disabled={hist.passe.length === 0} title={t("planche.annuler.titre", { operation: operationAAnnuler(hist) ?? "" })} data-planche-annuler>
            ↶<span className="sr-only">{t("planche.annuler")}</span>
          </button>
          <button type="button" onClick={retablirPas} disabled={hist.futur.length === 0} title={t("planche.retablir.titre", { operation: operationARetablir(hist) ?? "" })} data-planche-retablir>
            ↷<span className="sr-only">{t("planche.retablir")}</span>
          </button>
        </div>
      </div>

      <div className="planche-outils" role="toolbar" aria-label={t("planche.outils")} aria-orientation="vertical">
        <button type="button" className="outil" onClick={() => setRecherche(true)} title={t("planche.recherche.titre")} aria-label={t("planche.recherche.titre")} data-planche-recherche>
          <span aria-hidden="true" className="outil-picto">⌕</span>
          <span className="outil-libelle" aria-hidden="true">{t("planche.rechercher")}</span>
        </button>
        {barre.map((o) => boutonOutil(o))}
        {recentOutil && (
          <>
            <span className="planche-separateur" role="separator" />
            {boutonOutil(recentOutil)}
          </>
        )}
        <button type="button" className="outil" aria-expanded={grille} aria-controls={grille ? "planche-grille" : undefined} onClick={() => setGrille(!grille)} title={t("planche.plus")} aria-label={t("planche.plus")} data-planche-plus>
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
        <button type="button" className="canevas-icone" aria-pressed={panneau === "instructeur"} onClick={() => setPanneau(panneau === "instructeur" ? null : "instructeur")} title={t("panneau.instructeur")} data-planche-panneau-icone="instructeur">
          <span aria-hidden="true" className="canevas-picto">?</span>
          <span className="canevas-etiquette">{t("panneau.instructeur")}</span>
        </button>
      </nav>
      {panneau === "instructeur" && (
        <section className="planche-panneau" aria-label={t("panneau.instructeur")} data-planche-panneau="instructeur">
          <header className="canevas-panneau-tete">
            <h3>{t("panneau.instructeur")}</h3>
            <button type="button" className="canevas-fermer" onClick={() => setPanneau(null)} aria-label={t("panneau.fermer", { titre: t("panneau.instructeur") })}>×</button>
          </header>
          <div className="canevas-panneau-corps">
            <InstructeurPlanche outil={outil} raison={outil ? raisonDe(outil) : null} />
          </div>
        </section>
      )}

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
        {(
          [
            ["Ctrl", t("planche.mod.ctrl"), t("planche.mod.ctrl")],
            ["Alt", t("planche.mod.alt"), t("planche.mod.alt")],
            ["FlecheGauche", "←", t("planche.mod.gauche")],
            ["FlecheHaut", "↑", t("planche.mod.haut")],
            ["FlecheDroite", "→", t("planche.mod.droite")],
            ["FlecheBas", "↓", t("planche.mod.bas")],
          ] as [Touche, string, string][]
        ).map(([touche, libelle, aide]) => (
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
        ))}
      </div>

      <footer className="planche-bas">
        <span className="canevas-bas">
          <button type="button" className="lien" onClick={() => setPanneau(panneau === "instructeur" ? null : "instructeur")} title={t("bas.aide")} aria-label={t("bas.aide")}>?</button>
          <ChoixLangue className="canevas-langue" />
          <ChoixPeripherique ui={ui} />
        </span>
        <p className="planche-etat" aria-live="polite" aria-label={t("planche.etat")} data-planche-etat>
          {dans && <span className="planche-contexte" data-planche-contexte>{t("planche.edition", { nom: nomOccurrence(hist.present.modele, dans) })} | </span>}
          <span className="planche-consigne">{vue.consigne}</span>
          {etatBarre && <span className="planche-message" data-planche-message> | {etatBarre}</span>}
        </p>
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
      </footer>

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
function vueParDefaut(id: string, champDeVision: number): VueOutil {
  const o = outilParId(id);
  const etape = o?.etapes[0];
  const mesures =
    id === "zoom" && etape?.libelleMesures
      ? { libelle: etape.libelleMesures, valeur: `${virgule(champDeVision)}°`, saisie: { attendu: "champ-vision" as const, separateurDecimal: SEPARATEUR_DECIMAL } }
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
