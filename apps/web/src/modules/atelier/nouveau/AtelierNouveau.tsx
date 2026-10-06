/**
 * Nouvel Atelier architectural (lot 3a, cahier §5.7 et §7) : cinq repères stables — navigateur du projet, zone de
 * travail, barre de commandes, inspecteur, panneau des modifications et problèmes. Tout ce qui change le modèle
 * passe par le bus de commandes (`atelierClient`) ; tout ce qui ne change que l'affichage reste dans `etatUi`
 * (R10). Clavier : Échap, Entrée, Suppr, Ctrl/⌘ Z / Maj Z / Y, Ctrl/⌘ K, raccourcis d'outil, saisie de précision.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CLASSES, commandesColler, copierSelection, ensemblesPartages, lirePressePapiers, ErreurCommande, exporterBibliotheque, niveauxOrdonnes, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../lib/api";
import { useOnline, useReachable } from "../../../components/SyncIndicator";
import { exporter, type TypeExport } from "./exports";
import { MenuImport, RapportEchangeDialogue, exporterMaquetteIfc, type RapportAffiche } from "./panneaux/Echanges";
import { Versions } from "./panneaux/Versions";
import { Automatisation } from "./panneaux/Automatisation";
import { Reprise } from "./panneaux/Reprise";
import { ReferencesExternes } from "./panneaux/ReferencesExternes";
import { atelierClient } from "../bus/atelier-client";
import { actionImmediate, lotSuppression, OUTILS_IMMEDIATS } from "./actions";
import { etatUi, useEtatUi, visibleSelonFiltres, type NiveauAffichage, type PanneauMobile } from "./etat-ui";
import { FAMILLES, OUTILS_PAR_ID, outilsVisibles, type Famille, type Outil } from "./outils";
import { Inspecteur } from "./panneaux/Inspecteur";
import { Modifications } from "./panneaux/Modifications";
import { Navigateur } from "./panneaux/Navigateur";
import { brancherSyncEnsembles } from "./sync-ensembles";
import { Palette } from "./panneaux/Palette";
import { segmentsDuNiveau } from "./plan2d/accrochage";
import { saisie, terminer, type ResultatClic } from "./plan2d/outils-2d";
import { CadrePanneau, ColonnePanneaux, Instructeur } from "./panneaux/Canevas";
import { outilDeTouche } from "./raccourcis";
import { cadrerNiveau, Plan2D } from "./plan2d/Plan2D";
import "./atelier-nouveau.css";

// three.js n'est chargé qu'à la première ouverture de la vue 3D.
const Vue3D = lazy(() => import("./vue3d/Vue3D").then((m) => ({ default: m.Vue3D })));
// Vues, feuilles et tableaux : chargés à la première ouverture du mode Documents.
const Documents = lazy(() => import("./documents/Documents").then((m) => ({ default: m.Documents })));

export interface PropsAtelierNouveau {
  projectId: string;
  readOnly: boolean;
  /** Référence protégée de l'exemple : la première modification validée ouvre une copie de travail et s'y enregistre. */
  protectedReference?: boolean;
  /** Code du projet (noms des fichiers exportés). */
  code?: string;
  /** Nom du projet (cartouche des feuilles). */
  nomProjet?: string;
  /** Étape 10 : bouton « Harmonie » (sous-page « Harmonie du bâtiment »). */
  harmonie?: boolean;
}

export const READ_ONLY_MESSAGE = "Lecture seule : ce projet vous est partagé en lecture ; vous pouvez explorer le modèle, mais vos modifications dans l’Atelier ne sont pas enregistrées.";

/** Nom de la copie créée automatiquement (prototype : `copy('P.118 — copie de travail · Atelier', …)` ; Fadi affiche « code — nom »). */
export const DRAWING_COPY_NAME = "copie de travail · Atelier";
export const PROTECTED_REFERENCE_MESSAGE = "Exemple protégé : première modification dans une copie automatique.";

const fmt = (v: number) => v.toFixed(2).replace(".", ",");
const ETIQUETTES_MOBILE: Record<PanneauMobile, string> = { travail: "Plan", objets: "Projet", inspecteur: "Inspecteur", problemes: "Modifications" };
const FAMILLES_BARRE: Famille[] = ["creer", "modifier", "documenter", "analyser"];

function champSaisie(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}

const CLE_PRESSE_PAPIERS = "fadi-atelier-presse-papiers";

export function AtelierNouveau({ projectId, readOnly: readOnlyProjet, protectedReference = false, code = "", nomProjet = "", harmonie = false }: PropsAtelierNouveau) {
  const online = useOnline();
  const reachable = useReachable();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const copieEnCours = useRef<Promise<void> | null>(null);
  const client = useMemo(() => atelierClient(projectId, { readOnly: readOnlyProjet }), [projectId, readOnlyProjet]);
  const inst = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const ui = useEtatUi();
  // Consultation d'un état passé (révision ou version, lot 7 / compléments) : affiché en lecture seule, aucune commande.
  const [consultation, setConsultation] = useState<{ libelle: string; etat: ModeleAtelier } | null>(null);
  // Références externes (DA-05-11) : relues quand l'une d'elles change ou que la révision serveur avance.
  const signatureRefs = Object.values(inst.etat.definitions).filter((d) => d.classe === "reference-externe").map((d) => `${d.id}@${d.version}`).join(",");
  const referencesExternes = useQuery({ queryKey: ["atelier-references-externes", projectId, signatureRefs, inst.revisionServeur], queryFn: () => api.getAtelierReferencesExternes(projectId), enabled: !!signatureRefs && !inst.horsLigne, retry: false, staleTime: 60_000 });
  const externes = useMemo(() => (signatureRefs ? referencesExternes.data?.references ?? [] : []).filter((r) => r.representation).map((r) => ({ id: r.id, niveauId: r.params.niveauId, traits: r.representation!.traits, decalage: (r.params as { decalageAltitude?: { value: number } }).decalageAltitude?.value ?? 0 })), [referencesExternes.data, signatureRefs]);
  // Documents : traits des références (null = inaccessible) ; absent tant qu'ils ne sont pas lus.
  const documentsExternes = useMemo(() => (!signatureRefs ? [] : referencesExternes.data ? referencesExternes.data.references.map((r) => ({ id: r.id, traits: r.representation?.traits ?? null })) : undefined), [signatureRefs, referencesExternes.data]);
  const niveauxTries = useMemo(() => Object.values(inst.etat.niveaux).sort((a, b) => a.elevation - b.elevation).map((n) => ({ id: n.id, nom: n.nom })), [inst.etat.niveaux]);
  const readOnly = readOnlyProjet || consultation !== null;
  const etat = consultation?.etat ?? inst.etat;
  // Filtres d'affichage locaux (D-066) : le plan et la vue 3D ne voient que les objets affichés ; le modèle est intact.
  const etatAffiche = useMemo((): ModeleAtelier => {
    const f = ui.filtres;
    const iso = ui.isolement ? new Set(ui.isolement) : null;
    // Calques gelés (D-103) : leurs objets sortent du plan, de la 3D, de l'accrochage et de la sélection.
    const geles = new Set(Object.values(etat.calques).filter((c) => c.gele).map((c) => c.id));
    if (!f.classesMasquees.length && !f.calquesMasques.length && !iso && !geles.size) return etat;
    return { ...etat, objets: Object.fromEntries(Object.entries(etat.objets).filter(([id, o]) => visibleSelonFiltres(o, f) && (!iso || iso.has(id)) && !(o.calqueId && geles.has(o.calqueId)))) };
  }, [etat, ui.filtres, ui.isolement]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mesure, setMesure] = useState<string | null>(null);
  const [rapportEchange, setRapportEchange] = useState<RapportAffiche | null>(null);
  const [precision, setPrecisionEtat] = useState("");
  // Miroir synchrone de la saisie de précision : les touches arrivent parfois avant que le champ ait le focus.
  const precisionRef = useRef("");
  const setPrecision = useCallback((v: string | ((p: string) => string)) => {
    precisionRef.current = typeof v === "function" ? v(precisionRef.current) : v;
    setPrecisionEtat(precisionRef.current);
  }, []);
  const champPrecision = useRef<HTMLInputElement | null>(null);
  const zone = useRef<HTMLDivElement | null>(null);
  const niveaux = niveauxOrdonnes(etat);

  // Niveau actif : le premier niveau tant qu'aucun n'est choisi (ou s'il a disparu).
  useEffect(() => {
    if (niveaux.length && (!ui.niveauId || !etat.niveaux[ui.niveauId])) etatUi.set({ niveauId: niveaux[0]!.id });
  }, [niveaux, ui.niveauId, etat.niveaux]);

  // Ensembles personnels synchronisés entre les appareils du compte (D-118).
  useEffect(() => brancherSyncEnsembles(), []);

  // Ensemble d'affichage associé à l'étage (D-066) : appliqué quand on passe sur cet étage (partagé d'abord).
  const niveauPrecedent = useRef<string | null>(null);
  useEffect(() => {
    if (!ui.niveauId || niveauPrecedent.current === ui.niveauId) return;
    niveauPrecedent.current = ui.niveauId;
    const partage = ensemblesPartages(etat).find((e) => e.params.niveauId === ui.niveauId);
    const local = ui.ensembles.find((e) => e.niveauId === ui.niveauId);
    const choisi = partage ? { classesMasquees: partage.params.classesMasquees, calquesMasques: partage.params.calquesMasques } : local ? { classesMasquees: local.classesMasquees, calquesMasques: local.calquesMasques } : null;
    if (choisi) etatUi.set({ filtres: choisi, aide: `Ensemble d'affichage « ${partage?.params.nom ?? local!.nom} » appliqué (associé à cet étage).` });
  }, [ui.niveauId, etat, ui.ensembles]);

  // La sélection ne garde que les objets encore présents.
  useEffect(() => {
    const restants = ui.selection.filter((id) => etat.objets[id]);
    if (restants.length !== ui.selection.length) etatUi.set({ selection: restants });
  }, [etat.objets, ui.selection]);

  // Grille des outils étendus (D-156) : fermée au clic extérieur et à Échap.
  const [etendus, setEtendus] = useState(false);
  const etenduOuvert = useRef(false);
  etenduOuvert.current = etendus;
  const grilleEtendus = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!etendus) return;
    const surClic = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (grilleEtendus.current && t && !grilleEtendus.current.contains(t) && !(t instanceof Element && t.closest("[data-outils-etendus]"))) setEtendus(false);
    };
    window.addEventListener("pointerdown", surClic);
    return () => window.removeEventListener("pointerdown", surClic);
  }, [etendus]);
  const presseLocal = useRef<string | null>(null);
  const executer = useCallback(
    async (commandes: Commande[], label: string, selectionnerCrees = true) => {
      if (commandes.length === 0) return;
      setErreur(null);
      if (protectedReference) {
        // Exemple protégé (prototype `copy(…, { stayInAtelier: true, automatic: true })`) : la copie de travail est créée à la
        // première modification, le lot y est appliqué, puis l'écran bascule sur elle (même module, même étape) ; la référence reste intacte.
        if (copieEnCours.current) return;
        etatUi.set({ aide: "Exemple protégé : création de la copie de travail…" });
        copieEnCours.current = (async () => {
          try {
            const copie = await api.copyProject(projectId, DRAWING_COPY_NAME);
            const c = atelierClient(copie.id);
            await c.demarrage;
            await c.executer(commandes, label);
            await c.envoyer();
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            etatUi.set({ aide: "" });
            navigate(`/projets/${copie.id}${location.search}`, { state: { notice: "Copie de travail créée automatiquement · exemple original conservé." } });
          } catch (err) {
            setErreur(err instanceof ErreurCommande ? `${label} refusé : ${err.message}` : err instanceof Error ? err.message : String(err));
          } finally {
            copieEnCours.current = null;
          }
        })();
        return;
      }
      try {
        const { effets } = await client.executer(commandes, label);
        const crees = effets.crees.filter((id) => client.getSnapshot().etat.objets[id]);
        if (selectionnerCrees && crees.length) etatUi.selectionner(crees);
        if (effets.referencesAReparer.length) etatUi.set({ aide: `${effets.referencesAReparer.length} référence(s) à réparer : voir le panneau des modifications.` });
      } catch (err) {
        const message = err instanceof ErreurCommande ? `${label} refusé : ${err.message}` : err instanceof Error ? err.message : String(err);
        setErreur(message);
      }
    },
    [client, protectedReference, projectId, navigate, location.search, queryClient],
  );

  const appliquerResultat = useCallback(
    (r: ResultatClic) => {
      etatUi.set({ pointsEnCours: r.pointsEnCours, aide: r.aide, ...(r.repere !== undefined ? { repere: r.repere } : {}) });
      setMesure(r.mesure ?? null);
      setPrecision("");
      if (r.selectionner) etatUi.selectionner(r.selectionner);
      if (r.commandes.length) void executer(r.commandes, r.label);
    },
    [executer],
  );

  const disponibilite = useCallback(
    (o: Outil): string | null => {
      if (readOnly && (o.famille === "creer" || o.famille === "modifier" || o.famille === "documenter")) return "Projet en lecture seule.";
      if (o.condition === "niveau" && !ui.niveauId) return "Créez ou choisissez d'abord un niveau.";
      if ((o.condition === "selection" || o.condition === "selection-mur" || o.condition === "selection-ligne") && ui.selection.length === 0) return `${o.libelle} : sélectionnez d'abord un ou plusieurs objets.`;
      if (o.condition === "selection-mur" && !ui.selection.some((id) => etat.objets[id]?.classe === "mur")) return `${o.libelle} : sélectionnez un mur.`;
      return null;
    },
    [readOnly, ui.niveauId, ui.selection, etat.objets],
  );

  const choisir = useCallback(
    (o: Outil) => {
      const raison = disponibilite(o);
      if (raison) {
        etatUi.set({ aide: raison, paletteOuverte: false });
        return;
      }
      setErreur(null);
      setMesure(null);
      if (OUTILS_IMMEDIATS.has(o.id)) {
        etatUi.set({ paletteOuverte: false });
        const r = actionImmediate(o.id, etat, etatUi.get());
        if ("message" in r) etatUi.set({ aide: r.message });
        else void executer(r.commandes, r.label, o.id !== "supprimer");
        return;
      }
      if (o.id === "calques") {
        etatUi.set({ paletteOuverte: false, panneauMobile: "objets" });
        return;
      }
      etatUi.choisirOutil(o.id, o.aide);
      // Pousser / tirer se fait en 3D ; les outils de tracé, en plan.
      if (o.id === "pousser") etatUi.set({ mode: "3d" });
      // Mesurer reste en 3D quand on y est (mesure entre deux points des surfaces, D-048).
      else if (o.famille === "creer" || o.famille === "documenter" || (o.id === "mesurer" && etatUi.get().mode !== "3d")) etatUi.set({ mode: "2d" });
      if (window.matchMedia?.("(max-width: 760px)").matches) etatUi.set({ panneauMobile: "travail" });
    },
    [disponibilite, etat, executer],
  );

  const centrerSur = useCallback(
    (objetId: string) => {
      const o = etat.objets[objetId];
      if (!o) return;
      const pts = segmentsDuNiveau({ ...etat, objets: { [objetId]: o } }, o.niveauId);
      const tous = [...pts.segments.flatMap((s) => [s.a, s.b]), ...pts.centres.map((c) => c.p)];
      const patch: Partial<ReturnType<typeof etatUi.get>> = {};
      if (o.niveauId && o.niveauId !== ui.niveauId) patch.niveauId = o.niveauId;
      if (tous.length) {
        const cx = tous.reduce((s, p) => s + p.x, 0) / tous.length;
        const cy = tous.reduce((s, p) => s + p.y, 0) / tous.length;
        patch.vue = { ...ui.vue, cx, cy };
      }
      etatUi.set(patch);
    },
    [etat, ui.niveauId, ui.vue],
  );

  const cadrer = useCallback(() => {
    const r = zone.current?.getBoundingClientRect();
    etatUi.set({ vue: cadrerNiveau(etat, ui.niveauId, r?.width ?? 800, r?.height ?? 600) });
  }, [etat, ui.niveauId]);

  const finir = useCallback(() => {
    const u = etatUi.get();
    if (u.pointsEnCours.length === 0) return;
    appliquerResultat(terminer(u.outil, u.pointsEnCours, u, u.niveauId));
  }, [appliquerResultat]);

  const validerPrecision = useCallback(() => {
    const u = etatUi.get();
    // Entrée dans un champ de précision vide : termine le tracé (comme Entrée sur le plan).
    if (!precisionRef.current.trim()) {
      finir();
      return;
    }
    const r = saisie(u.outil, precisionRef.current, u.pointsEnCours, u.curseur, client.getSnapshot().etat, u, { rayon: 12 / u.vue.echelle, objetSous: null });
    if (!r) {
      etatUi.set({ aide: "Saisie non comprise : une longueur (4,5), un déplacement « dx;dy » (3;-1,2), un facteur ou un angle." });
      return;
    }
    appliquerResultat(r);
  }, [client, appliquerResultat, finir]);

  // Clavier global de l'Atelier (hors champs de saisie).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        etatUi.set((u) => ({ paletteOuverte: !u.paletteOuverte }));
        return;
      }
      if (champSaisie(e.target) || etatUi.get().paletteOuverte) return;
      const u = etatUi.get();
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (readOnly) return;
        void (e.shiftKey ? client.retablir() : client.annuler());
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (readOnly) return;
        void client.retablir();
        return;
      }
      // Presse-papiers (D-147) : Ctrl+C copie la sélection (mémorisée dans ce navigateur, et en texte dans le
      // presse-papiers du système) ; Ctrl+V la colle sur le niveau actif, ici ou dans un autre projet.
      if (mod && e.key.toLowerCase() === "c" && u.selection.length) {
        e.preventDefault();
        const pp = copierSelection(client.getSnapshot().etat, u.selection, projectId);
        const texte = JSON.stringify(pp);
        try {
          localStorage.setItem(CLE_PRESSE_PAPIERS, texte);
        } catch {
          /* stockage indisponible : le presse-papiers du système suffit dans cette page */
        }
        presseLocal.current = texte;
        void navigator.clipboard?.writeText(texte).catch(() => {});
        etatUi.set({ aide: `${pp.objets.length} objet(s) copié(s)${pp.remarques.length ? ` (${pp.remarques.join(" ")})` : ""} — Ctrl+V pour coller sur le niveau actif, ici ou dans un autre projet.` });
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (readOnly || !u.niveauId) return;
        let texte: string | null = presseLocal.current;
        try {
          texte = localStorage.getItem(CLE_PRESSE_PAPIERS) ?? texte;
        } catch {
          /* stockage indisponible */
        }
        const pp = lirePressePapiers(texte);
        e.preventDefault();
        if (!pp) {
          etatUi.set({ aide: "Presse-papiers vide : copiez d'abord une sélection (Ctrl+C)." });
          return;
        }
        // Même projet et même niveau : collé décalé de 1 m pour ne pas recouvrir l'original.
        const surPlace = pp.projetId === projectId && pp.objets.some((o) => o.niveauId === u.niveauId);
        const r = commandesColler(client.getSnapshot().etat, pp, u.niveauId, surPlace ? { dx: 1, dy: -1 } : undefined);
        void executer(r.commandes, `Coller ${r.ids.length} objet(s)`).then(() => {
          etatUi.set({ aide: `${r.ids.length} objet(s) collé(s)${surPlace ? " (décalés de 1 m)" : ""}.${r.remarques.length ? ` ${r.remarques.join(" ")}` : ""}` });
        });
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        etatUi.selectionner(Object.values(etat.objets).filter((o) => o.niveauId === u.niveauId).map((o) => o.id));
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setErreur(null);
        setMesure(null);
        if (u.pointsEnCours.length) {
          const r = terminer(u.outil, u.pointsEnCours, u, u.niveauId);
          // Échap termine une chaîne déjà commencée (murs enchaînés) sans créer de contour incomplet.
          if (["polyligne", "spline", "garde-corps"].includes(u.outil) && r.commandes.length) appliquerResultat(r);
          else etatUi.set({ pointsEnCours: [], aide: "" });
        } else if (u.disposition === "canevas" && etenduOuvert.current) setEtendus(false);
        // Disposition Canevas (D-156) : Échap revient à l'outil précédent ; disposition classique : à la Sélection.
        else if (u.outil !== "selection") etatUi.choisirOutil(u.disposition === "canevas" && u.outilPrecedent !== u.outil ? u.outilPrecedent : "selection");
        else etatUi.selectionner([]);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (precisionRef.current) validerPrecision();
        else finir();
        return;
      }
      if (e.key === "Backspace" && precisionRef.current) {
        e.preventDefault();
        setPrecision((p) => p.slice(0, -1));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && u.selection.length && !readOnly) {
        e.preventDefault();
        const r = lotSuppression(etat, u.selection);
        void executer(r.commandes, r.label, false);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        etatUi.set({ vue: { ...u.vue, echelle: Math.min(2000, u.vue.echelle * 1.25) } });
        return;
      }
      if (e.key === "-" && u.pointsEnCours.length === 0) {
        etatUi.set({ vue: { ...u.vue, echelle: Math.max(0.5, u.vue.echelle / 1.25) } });
        return;
      }
      if (e.key === "0") {
        if (u.pointsEnCours.length === 0) {
          cadrer();
          return;
        }
      }
      // Saisie de précision : un chiffre pendant un tracé ouvre le champ de longueur.
      if (/^[0-9.,;-]$/.test(e.key) && (u.pointsEnCours.length > 0 || u.outil === "echelle" || u.outil === "tourner")) {
        e.preventDefault();
        setPrecision((p) => p + e.key);
        requestAnimationFrame(() => champPrecision.current?.focus());
        return;
      }
      if (e.key.length === 1) {
        const o = outilDeTouche(e.key, u.raccourcis);
        if (o) {
          e.preventDefault();
          choisir(o);
        }
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [client, etat, readOnly, projectId, executer, appliquerResultat, choisir, finir, cadrer, validerPrecision, setPrecision]);

  const outilsBarre = useMemo(() => {
    const visibles = outilsVisibles(ui.affichage);
    const favoris = ui.favoris.map((id) => OUTILS_PAR_ID[id]).filter((o): o is Outil => !!o);
    const parFamille = FAMILLES_BARRE.map((f) => [f, visibles.filter((o) => o.famille === f && !ui.favoris.includes(o.id))] as const).filter(([, l]) => l.length);
    return { favoris, parFamille };
  }, [ui.affichage, ui.favoris]);

  const lotsEnDifficulte = inst.lots.filter((l) => l.etat === "conflit" || l.etat === "refuse").length;
  const enAttente = inst.lots.filter((l) => l.etat === "local" || l.etat === "synchronisation").length;
  const selection = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);

  if (inst.chargement === "initial" || inst.chargement === "chargement") {
    return <p role="status" className="atelier-n-chargement">Chargement du modèle…</p>;
  }

  if (niveaux.length === 0) {
    return (
      <div className="atelier-n atelier-n-vide">
        <section className="atelier-n-accueil" aria-labelledby="accueil-titre">
          <h2 id="accueil-titre">Ce projet n'a pas encore de modèle dessiné</h2>
          {inst.chargement === "erreur" && <p role="alert">Serveur injoignable : {inst.erreur}. Les modifications seront envoyées au retour de la connexion.</p>}
          {readOnly ? (
            <p className="atelier-n-lecture-vide" role="note">Lecture seule : ce projet vous est partagé en lecture et n’a pas encore de modèle dessiné ; rien ne peut être créé ici.</p>
          ) : (
            <>
              <p>Créez un premier niveau pour commencer à dessiner. Un dessin du prototype s'importe avec son archive (page Projets, « Importer projet JSON »).</p>
              <PremierNiveau onCreer={(nom, elevation) => void executer([{ type: "niveau.creer", params: { nom, elevation, ordre: 0 } }], `Niveau ${nom}`, false)} />
            </>
          )}
          {erreur && <p role="alert" className="atelier-n-erreur">{erreur}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className={`atelier-n panneau-${ui.panneauMobile}${ui.mode === "documents" ? " mode-documents" : ""} disposition-${ui.disposition}${ui.outilsReplies ? " outils-replies" : ""}`} data-affichage={ui.affichage} data-panneau={ui.disposition === "canevas" ? (ui.panneauFlottant ?? "") : undefined}>
      <header className="atelier-n-barre" aria-label="Barre de l'Atelier">
        <label className="barre-niveau">
          <span className="sr-only">Niveau actif</span>
          <select value={ui.niveauId ?? ""} onChange={(e) => etatUi.set({ niveauId: e.target.value, selection: [], pointsEnCours: [] })}>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom} ({fmt(n.elevation)} m)</option>)}
          </select>
        </label>
        <div className="barre-groupe barre-mode" role="group" aria-label="Plan, 3D ou documents">
          <button type="button" aria-pressed={ui.mode === "2d"} onClick={() => etatUi.set({ mode: "2d" })}>Plan</button>
          <button type="button" aria-pressed={ui.mode === "3d"} onClick={() => etatUi.set({ mode: "3d" })}>3D</button>
          <button type="button" aria-pressed={ui.mode === "documents"} onClick={() => etatUi.set({ mode: "documents", pointsEnCours: [] })}>Documents</button>
        </div>
        <div className="barre-groupe" role="group" aria-label="Annuler et rétablir">
          <button type="button" onClick={() => void client.annuler()} disabled={readOnly} title="Annuler (Ctrl/⌘ Z)">↶<span className="sr-only">Annuler</span></button>
          <button type="button" onClick={() => void client.retablir()} disabled={readOnly} title="Rétablir (Ctrl/⌘ Maj Z)">↷<span className="sr-only">Rétablir</span></button>
        </div>
        <button type="button" className="barre-palette" onClick={() => etatUi.set({ paletteOuverte: true })}>
          <span className="palette-long">Rechercher un outil</span>
          <span className="palette-court" aria-hidden="true">Outils…</span> <kbd>Ctrl K</kbd>
        </button>
        <label className="barre-affichage">
          <span>Affichage</span>
          <select aria-label="Niveau d'affichage des outils" value={ui.affichage} onChange={(e) => etatUi.set({ affichage: e.target.value as NiveauAffichage })}>
            <option value="essentiel">Essentiel</option>
            <option value="contextuel">Contextuel</option>
            <option value="complet">Complet</option>
          </select>
        </label>
        <details className="barre-accrochages">
          <summary>Accrochages</summary>
          <div className="accrochages-liste">
            {(["extremite", "milieu", "centre", "perpendiculaire", "intersection", "proche", "orthogonal", "grille"] as const).map((k) => (
              <label key={k}>
                <input type="checkbox" checked={ui.accrochages[k] === true} data-accrochage={k} onChange={(e) => etatUi.set((u) => ({ accrochages: { ...u.accrochages, [k]: e.target.checked } }))} />
                {{ extremite: "Extrémité", milieu: "Milieu", centre: "Centre", perpendiculaire: "Perpendiculaire et tangente", intersection: "Intersection", proche: "Proche (tracés et faces de murs)", orthogonal: `Polaire (${ui.accrochages.pasPolaire ?? 45}°)`, grille: "Grille" }[k]}
              </label>
            ))}
            <label>
              Pas polaire
              <select value={String(ui.accrochages.pasPolaire ?? 45)} data-pas-polaire onChange={(e) => etatUi.set((u) => ({ accrochages: { ...u.accrochages, pasPolaire: Number(e.target.value) } }))}>
                {[5, 10, 15, 22.5, 30, 45, 90].map((v) => <option key={v} value={String(v)}>{String(v).replace(".", ",")}°</option>)}
              </select>
            </label>
            <label>
              Pas de grille (m)
              <input type="number" min={0.01} step="any" value={ui.accrochages.pasGrille} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && e.target.valueAsNumber > 0 && etatUi.set((u) => ({ accrochages: { ...u.accrochages, pasGrille: e.target.valueAsNumber } }))} />
            </label>
          </div>
        </details>
        <button type="button" onClick={cadrer} title="Cadrer le niveau (0)">Cadrer</button>
        {/* Disposition (D-156) : grille à cinq repères ou canevas plein écran à panneaux flottants. */}
        <button type="button" aria-pressed={ui.disposition === "canevas"} data-disposition-canevas onClick={() => etatUi.set((u) => ({ disposition: u.disposition === "canevas" ? "classique" : "canevas", panneauFlottant: null }))} title="Canevas plein écran : outils et panneaux flottent sur le dessin">
          Canevas
        </button>
        <details
          className="barre-exports"
          onToggle={(e) => {
            // Menu ouvert vers l'intérieur de l'Atelier, même quand la barre passe sur deux lignes.
            const d = e.currentTarget;
            const boite = d.closest(".atelier-n")?.getBoundingClientRect();
            const r = d.getBoundingClientRect();
            d.dataset["cote"] = boite && r.left - boite.left < boite.width / 2 ? "gauche" : "droite";
          }}
        >
          <summary>Exporter</summary>
          <div className="exports-liste">
            {([
              ["dxf", "Plan du niveau · DXF"],
              ["svg", "Plan affiché · SVG"],
              ["csv", "Quantités · CSV"],
              ["json", "Modèle · JSON"],
              ["png", "Vue 3D · PNG"],
              ["bcf", "Vues 3D · BCF"],
            ] as [TypeExport, string][]).map(([t, libelle]) => (
              <button
                key={t}
                type="button"
                data-export={t}
                disabled={readOnly || (t === "png" && ui.mode !== "3d") || (t === "svg" && ui.mode !== "2d")}
                title={t === "png" && ui.mode !== "3d" ? "Passez en 3D pour exporter l'image de la vue" : t === "svg" && ui.mode !== "2d" ? "Passez en Plan pour exporter le dessin" : undefined}
                onClick={(e) => {
                  (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                  void exporter(t, { projectId, code, etat, niveauId: ui.niveauId, mode: ui.mode })
                    .then((nom) => etatUi.set({ aide: `Exporté et enregistré au catalogue des documents : ${nom}` }))
                    .catch((err: unknown) => setErreur(err instanceof Error ? err.message : String(err)));
                }}
              >
                {libelle}
              </button>
            ))}
            <button
              type="button"
              data-export="ifc"
              disabled={readOnly}
              onClick={(e) => {
                (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                etatUi.set({ aide: "Production de la maquette IFC…" });
                void exporterMaquetteIfc(client, { projectId, code, nomProjet })
                  .then((r) => {
                    etatUi.set({ aide: `Maquette IFC produite et inscrite au catalogue des documents : ${r.fichier ?? ""}` });
                    setRapportEchange(r);
                  })
                  .catch((err: unknown) => setErreur(err instanceof Error ? err.message : String(err)));
              }}
            >
              Maquette IFC 4.3 · rapport
            </button>
            <button
              type="button"
              data-export="bibliotheque"
              onClick={(e) => {
                // Fichier de bibliothèque (D-050) : types, blocs et composants du projet, calques de leur contenu.
                (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                const f = exporterBibliotheque(etat, nomProjet);
                const url = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `Bibliotheque_${code.replace(/[^A-Za-z0-9._-]+/g, "_")}.fadi-bibliotheque.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                etatUi.set({ aide: `${f.definitions.length} définition(s) exportée(s) en fichier de bibliothèque.` });
              }}
            >
              Bibliothèque de définitions · fichier
            </button>
          </div>
        </details>
        <MenuImport
          client={client}
          projectId={projectId}
          etat={etat}
          niveauId={ui.niveauId}
          desactive={readOnly || protectedReference}
          motif={readOnly ? "Lecture seule" : protectedReference ? "Exemple protégé : importez dans une copie de travail" : undefined}
          onRapport={setRapportEchange}
          onErreur={setErreur}
          onAide={(aide) => etatUi.set({ aide })}
        />
        {rapportEchange && <RapportEchangeDialogue rapport={rapportEchange} onFermer={() => setRapportEchange(null)} />}
        {harmonie && (
          <button type="button" id="atelier-harmonie-button" className="barre-harmonie" aria-controls="atelier-harmonie-page" aria-expanded="false" onClick={() => window.AtelierHarmonyPage?.open()}>
            ◈ Harmonie
          </button>
        )}
        {consultation && (
          <span className="barre-consultation" role="status" data-consultation={consultation.libelle}>
            Consultation : {consultation.libelle} — lecture seule
            <button type="button" onClick={() => setConsultation(null)}>Revenir à l'état courant</button>
          </span>
        )}
        <span hidden={!!consultation} className={`barre-sync${readOnly ? " sync-lecture" : !online || !reachable ? " sync-attente" : lotsEnDifficulte ? " sync-alerte" : enAttente ? " sync-attente" : ""}`} role="status" data-etat={readOnly ? "lecture" : !online ? "hors-ligne" : !reachable ? "injoignable" : lotsEnDifficulte ? "conflit" : enAttente ? "attente" : inst.horsLigne ? "cache" : "enregistre"}>
          {readOnlyProjet
            ? READ_ONLY_MESSAGE
            : !online
              ? `Hors-ligne · ${enAttente} modification(s) enregistrée(s) localement`
              : !reachable
                ? `Serveur injoignable : les modifications sont enregistrées localement (${enAttente})`
                : lotsEnDifficulte
                  ? `${lotsEnDifficulte} lot(s) à traiter`
                  : enAttente
                    ? `${enAttente} modification(s) en attente`
                    : inst.horsLigne
                      ? "Modèle ouvert depuis le cache local de cet appareil"
                      : `Enregistré · r${inst.revisionServeur}`}
        </span>
      </header>

      <div className="atelier-n-outils" role="toolbar" aria-label="Outils" aria-orientation={ui.disposition === "canevas" ? "vertical" : "horizontal"}>
        {ui.disposition === "canevas" && (
          <>
            <button type="button" className="outil outil-replier" aria-expanded={!ui.outilsReplies} data-replier-outils onClick={() => etatUi.set((u) => ({ outilsReplies: !u.outilsReplies }))} title={ui.outilsReplies ? "Déplier la barre d'outils" : "Replier la barre d'outils"}>
              <span aria-hidden="true">{ui.outilsReplies ? "»" : "«"}</span> <span className="outil-libelle">{ui.outilsReplies ? "Outils" : "Replier"}</span>
            </button>
            <button type="button" className="outil" onClick={() => etatUi.set({ paletteOuverte: true })} title="Rechercher un outil (Ctrl K)">
              <span aria-hidden="true">⌕</span> <span className="outil-libelle">Rechercher</span>
            </button>
          </>
        )}
        <button type="button" className={`outil${ui.outil === "selection" ? " est-actif" : ""}`} aria-pressed={ui.outil === "selection"} onClick={() => etatUi.choisirOutil("selection")} title="Sélection (V)">
          <span aria-hidden="true">↖</span> <span className="outil-libelle">Sélection</span>
        </button>
        {outilsBarre.favoris.filter((o) => o.id !== "selection").map((o) => (
          <BoutonOutil key={o.id} o={o} actif={ui.outil === o.id} raison={disponibilite(o)} onChoisir={choisir} />
        ))}
        {ui.disposition !== "canevas" &&
          outilsBarre.parFamille.map(([f, liste]) => (
            <details key={f} className="outils-famille">
              <summary>{FAMILLES[f]}</summary>
              <div className="outils-famille-liste">
                {liste.map((o) => <BoutonOutil key={o.id} o={o} actif={ui.outil === o.id} raison={disponibilite(o)} onChoisir={choisir} />)}
              </div>
            </details>
          ))}
        {ui.disposition === "canevas" && (
          <button type="button" className="outil" aria-expanded={etendus} aria-controls={etendus ? "canevas-outils-etendus" : undefined} data-outils-etendus onClick={() => setEtendus(!etendus)} title="Outils étendus">
            <span aria-hidden="true">…</span> <span className="outil-libelle">Plus d'outils</span>
          </button>
        )}
      </div>
      {ui.disposition === "canevas" && etendus && (
        <div className="canevas-etendus" id="canevas-outils-etendus" role="dialog" aria-label="Outils étendus" data-grille-outils ref={grilleEtendus}>
          {outilsBarre.parFamille.map(([f, liste]) => (
            <section key={f} aria-label={FAMILLES[f]}>
              <h4>{FAMILLES[f]}</h4>
              <div className="canevas-grille">
                {liste.map((o) => <BoutonOutil key={o.id} o={o} actif={ui.outil === o.id} raison={disponibilite(o)} onChoisir={(x) => { setEtendus(false); choisir(x); }} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <aside className="atelier-n-gauche" aria-label="Navigateur">
        <Navigateur etat={etat} ui={ui} readOnly={readOnly} onCommandes={(c, l) => void executer(c, l, false)} onCentrer={centrerSur} />
      </aside>

      <main className="atelier-n-travail" ref={zone}>
        {ui.mode === "documents" ? (
          <Suspense fallback={<p role="status" className="vue3d-etat">Chargement des documents…</p>}>
            <Documents projectId={projectId} code={code} nomProjet={nomProjet} etat={etat} revision={inst.revisionServeur} readOnly={readOnly} niveauId={ui.niveauId} onCommandes={(c, l) => executer(c, l, false)} externes={documentsExternes} />
          </Suspense>
        ) : ui.mode === "3d" ? (
          <Suspense fallback={<p role="status" className="vue3d-etat">Chargement de la vue 3D…</p>}>
            <Vue3D etat={etatAffiche} ui={ui} readOnly={readOnly} onCommandes={(c, l) => void executer(c, l, false)} externes={consultation ? undefined : externes} />
          </Suspense>
        ) : (
          <Plan2D etat={etatAffiche} ui={ui} readOnly={readOnly} onResultat={appliquerResultat} onTerminer={finir} onCommandes={(c, l) => void executer(c, l, false)} externes={consultation ? [] : externes} />
        )}
        {ui.mode === "2d" && (ui.disposition === "canevas" || ui.pointsEnCours.length > 0 || precision) && (
          <form
            className="saisie-precision"
            onSubmit={(e) => {
              e.preventDefault();
              validerPrecision();
            }}
          >
            <label htmlFor="saisie-precision">{ui.disposition === "canevas" ? "Mesures" : "Longueur ou dx;dy"}</label>
            <input
              id="saisie-precision"
              ref={champPrecision}
              inputMode="decimal"
              autoComplete="off"
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setPrecision("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <button type="submit">OK</button>
          </form>
        )}
      </main>

      <aside className="atelier-n-droite" aria-label="Inspecteur et modifications">
        <div className="droite-inspecteur">
          <Inspecteur etat={etat} ui={ui} readOnly={readOnly} projectId={consultation ? undefined : projectId} onCommandes={(c, l) => void executer(c, l, false)} />
        </div>
        <div className="droite-modifications">
          <Modifications projectId={projectId} instantane={inst} readOnly={readOnly} onDecider={(id, d) => void client.decider(id, d)} onReprendre={(id, commandes, label) => void client.decider(id, "abandonner").then(() => executer(commandes, label, false))} onAller={(id) => { etatUi.selectionner([id]); centrerSur(id); }} onConsulterRevision={(revision) => void api.getAtelierModelARevision(projectId, revision).then((r) => { setConsultation({ libelle: `révision ${revision}`, etat: r.modele }); etatUi.set({ selection: [] }); }).catch((err: unknown) => setErreur(err instanceof ApiError ? (err.serverMessage ?? `Révision ${revision} inaccessible`) : String(err)))} />
        </div>
        <div className="droite-versions">
          <Versions projectId={projectId} client={client} etat={inst.etat} revision={inst.revisionServeur} selection={ui.selection} niveauId={ui.niveauId} readOnly={readOnlyProjet || protectedReference} consultation={consultation?.libelle ?? null} onConsulter={(libelle, e) => { setConsultation({ libelle, etat: e }); etatUi.set({ selection: [] }); }} />
          <Reprise projectId={projectId} client={client} readOnly={readOnlyProjet || protectedReference} />
          <ReferencesExternes projectId={projectId} client={client} niveaux={niveauxTries} niveauId={ui.niveauId} references={signatureRefs ? referencesExternes.data?.references ?? [] : []} readOnly={readOnlyProjet || protectedReference || consultation !== null || inst.horsLigne} horsLigne={inst.horsLigne} />
          <Automatisation projectId={projectId} client={client} etat={inst.etat} revision={inst.revisionServeur} niveauId={ui.niveauId} readOnly={readOnly || protectedReference} />
        </div>
      </aside>

      {ui.disposition === "canevas" && (
        <>
          <ColonnePanneaux ui={ui} alertes={lotsEnDifficulte} />
          {ui.panneauFlottant === "instructeur" && (
            <CadrePanneau id="instructeur" titre="Instructeur">
              <Instructeur ui={ui} />
            </CadrePanneau>
          )}
        </>
      )}
      <footer className="atelier-n-etat" aria-live="polite">
        {ui.disposition === "canevas" && (
          <span className="canevas-bas">
            <button type="button" className="lien" data-aide-instructeur onClick={() => etatUi.basculerPanneau("instructeur")} title="Aide de l'outil actif">?</button>
            <span className="canevas-langue" title="L'interface de Fadi est en français.">Français</span>
          </span>
        )}
        {protectedReference && !readOnly && (
          <span className="atelier-n-reference" role="note" title={`La référence reste intacte : votre première modification validée ouvre une copie de travail (« ${DRAWING_COPY_NAME} ») et s’y enregistre.`}>
            {PROTECTED_REFERENCE_MESSAGE}
          </span>
        )}
        {erreur ? <span className="etat-erreur" role="alert">{erreur}</span> : <span className="etat-aide">{mesure ?? ui.aide}</span>}
        {ui.repere && <button type="button" className="lien" data-repere-global onClick={() => etatUi.set({ repere: null, aide: "Repère global rétabli." })}>Repère global (x′ à {String(Math.round(ui.repere.angle * 100) / 100).replace(".", ",")}°)</button>}
        <span className="etat-selection">{selection.length === 1 ? `${CLASSES[selection[0]!.classe].libelle} ${selection[0]!.id}` : selection.length > 1 ? `${selection.length} objets` : ""}</span>
        {ui.curseur && ui.outil !== "selection" && <span className="etat-curseur">x {fmt(ui.curseur.x)} · y {fmt(ui.curseur.y)} m</span>}
        <span className="etat-echelle">{Math.round(ui.vue.echelle)} px/m</span>
      </footer>

      <nav className="atelier-n-onglets" aria-label="Panneaux">
        {(Object.keys(ETIQUETTES_MOBILE) as PanneauMobile[]).map((p) => (
          <button key={p} type="button" aria-pressed={ui.panneauMobile === p} onClick={() => etatUi.set({ panneauMobile: p })}>
            {ETIQUETTES_MOBILE[p]}
            {p === "problemes" && lotsEnDifficulte > 0 && <span className="pastille">{lotsEnDifficulte}</span>}
          </button>
        ))}
      </nav>

      {ui.paletteOuverte && <Palette ui={ui} disponibilite={disponibilite} onChoisir={choisir} />}
    </div>
  );
}

function BoutonOutil({ o, actif, raison, onChoisir }: { o: Outil; actif: boolean; raison: string | null; onChoisir: (o: Outil) => void }) {
  return (
    <button
      type="button"
      className={`outil${actif ? " est-actif" : ""}${raison ? " est-indisponible" : ""}`}
      aria-pressed={actif}
      aria-disabled={!!raison}
      title={`${o.libelle}${o.raccourci ? ` (${o.raccourci.length === 1 ? o.raccourci.toUpperCase() : o.raccourci})` : ""} — ${raison ?? o.aide}`}
      onClick={() => onChoisir(o)}
    >
      <span aria-hidden="true">{o.picto}</span> <span className="outil-libelle">{o.libelle}</span>
    </button>
  );
}

function PremierNiveau({ onCreer }: { onCreer: (nom: string, elevation: number) => void }) {
  const [nom, setNom] = useState("Rez-de-chaussée");
  const [elevation, setElevation] = useState("");
  const valeur = Number(elevation.replace(",", "."));
  const valide = nom.trim() !== "" && elevation.trim() !== "" && Number.isFinite(valeur);
  return (
    <form
      className="nav-formulaire"
      onSubmit={(e) => {
        e.preventDefault();
        if (valide) onCreer(nom.trim(), valeur);
      }}
    >
      <label>
        Nom du niveau
        <input value={nom} onChange={(e) => setNom(e.target.value)} required />
      </label>
      <label>
        Altitude (m, repère local)
        <input inputMode="decimal" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="à renseigner, ex. 0" required />
      </label>
      <button type="submit" disabled={!valide}>Créer le niveau</button>
    </form>
  );
}
