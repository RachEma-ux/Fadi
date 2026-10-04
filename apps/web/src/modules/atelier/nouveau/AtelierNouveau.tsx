/**
 * Nouvel Atelier architectural (lot 3a, cahier §5.7 et §7) : cinq repères stables — navigateur du projet, zone de
 * travail, barre de commandes, inspecteur, panneau des modifications et problèmes. Tout ce qui change le modèle
 * passe par le bus de commandes (`atelierClient`) ; tout ce qui ne change que l'affichage reste dans `etatUi`
 * (R10). Clavier : Échap, Entrée, Suppr, Ctrl/⌘ Z / Maj Z / Y, Ctrl/⌘ K, raccourcis d'outil, saisie de précision.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CLASSES, ErreurCommande, niveauxOrdonnes, type Commande, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useOnline, useReachable } from "../../../components/SyncIndicator";
import { exporter, type TypeExport } from "./exports";
import { atelierClient } from "../bus/atelier-client";
import { actionImmediate, lotSuppression, OUTILS_IMMEDIATS } from "./actions";
import { etatUi, useEtatUi, type NiveauAffichage, type PanneauMobile } from "./etat-ui";
import { FAMILLES, OUTILS, OUTILS_PAR_ID, outilsVisibles, type Famille, type Outil } from "./outils";
import { Inspecteur } from "./panneaux/Inspecteur";
import { Modifications } from "./panneaux/Modifications";
import { Navigateur } from "./panneaux/Navigateur";
import { Palette } from "./panneaux/Palette";
import { segmentsDuNiveau } from "./plan2d/accrochage";
import { saisie, terminer, type ResultatClic } from "./plan2d/outils-2d";
import { cadrerNiveau, Plan2D } from "./plan2d/Plan2D";
import "./atelier-nouveau.css";

// three.js n'est chargé qu'à la première ouverture de la vue 3D.
const Vue3D = lazy(() => import("./vue3d/Vue3D").then((m) => ({ default: m.Vue3D })));

export interface PropsAtelierNouveau {
  projectId: string;
  readOnly: boolean;
  /** Référence protégée de l'exemple : la première modification validée ouvre une copie de travail et s'y enregistre. */
  protectedReference?: boolean;
  /** Code du projet (noms des fichiers exportés). */
  code?: string;
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

export function AtelierNouveau({ projectId, readOnly, protectedReference = false, code = "", harmonie = false }: PropsAtelierNouveau) {
  const online = useOnline();
  const reachable = useReachable();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const copieEnCours = useRef<Promise<void> | null>(null);
  const client = useMemo(() => atelierClient(projectId, { readOnly }), [projectId, readOnly]);
  const inst = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const ui = useEtatUi();
  const etat = inst.etat;
  const [erreur, setErreur] = useState<string | null>(null);
  const [mesure, setMesure] = useState<string | null>(null);
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

  // La sélection ne garde que les objets encore présents.
  useEffect(() => {
    const restants = ui.selection.filter((id) => etat.objets[id]);
    if (restants.length !== ui.selection.length) etatUi.set({ selection: restants });
  }, [etat.objets, ui.selection]);

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
      etatUi.set({ pointsEnCours: r.pointsEnCours, aide: r.aide });
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
      else if (o.famille === "creer" || o.famille === "documenter" || o.id === "mesurer") etatUi.set({ mode: "2d" });
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
    const r = saisie(u.outil, precisionRef.current, u.pointsEnCours, u.curseur, client.getSnapshot().etat, u, { rayon: 12 / u.vue.echelle, objetSous: null });
    if (!r) {
      etatUi.set({ aide: "Saisie non comprise : une longueur (4,5), un déplacement « dx;dy » (3;-1,2), un facteur ou un angle." });
      return;
    }
    appliquerResultat(r);
  }, [client, appliquerResultat]);

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
        void (e.shiftKey ? client.retablir() : client.annuler());
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void client.retablir();
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
          if (["polyligne", "spline"].includes(u.outil) && r.commandes.length) appliquerResultat(r);
          else etatUi.set({ pointsEnCours: [], aide: "" });
        } else if (u.outil !== "selection") etatUi.choisirOutil("selection");
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
        const o = OUTILS.find((x) => x.raccourci === e.key.toLowerCase());
        if (o) {
          e.preventDefault();
          choisir(o);
        }
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [client, etat, readOnly, executer, appliquerResultat, choisir, finir, cadrer, validerPrecision, setPrecision]);

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
    <div className={`atelier-n panneau-${ui.panneauMobile}`} data-affichage={ui.affichage}>
      <header className="atelier-n-barre" aria-label="Barre de l'Atelier">
        <label className="barre-niveau">
          <span className="sr-only">Niveau actif</span>
          <select value={ui.niveauId ?? ""} onChange={(e) => etatUi.set({ niveauId: e.target.value, selection: [], pointsEnCours: [] })}>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom} ({fmt(n.elevation)} m)</option>)}
          </select>
        </label>
        <div className="barre-groupe barre-mode" role="group" aria-label="Plan ou 3D">
          <button type="button" aria-pressed={ui.mode === "2d"} onClick={() => etatUi.set({ mode: "2d" })}>Plan</button>
          <button type="button" aria-pressed={ui.mode === "3d"} onClick={() => etatUi.set({ mode: "3d" })}>3D</button>
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
            {(["extremite", "milieu", "centre", "perpendiculaire", "intersection", "orthogonal", "grille"] as const).map((k) => (
              <label key={k}>
                <input type="checkbox" checked={ui.accrochages[k]} onChange={(e) => etatUi.set((u) => ({ accrochages: { ...u.accrochages, [k]: e.target.checked } }))} />
                {{ extremite: "Extrémité", milieu: "Milieu", centre: "Centre", perpendiculaire: "Perpendiculaire", intersection: "Intersection", orthogonal: "Orthogonal (45°)", grille: "Grille" }[k]}
              </label>
            ))}
            <label>
              Pas de grille (m)
              <input type="number" min={0.01} step="any" value={ui.accrochages.pasGrille} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && e.target.valueAsNumber > 0 && etatUi.set((u) => ({ accrochages: { ...u.accrochages, pasGrille: e.target.valueAsNumber } }))} />
            </label>
          </div>
        </details>
        <button type="button" onClick={cadrer} title="Cadrer le niveau (0)">Cadrer</button>
        <details className="barre-exports">
          <summary>Exporter</summary>
          <div className="exports-liste">
            {([
              ["dxf", "Plan du niveau · DXF"],
              ["svg", "Plan affiché · SVG"],
              ["csv", "Quantités · CSV"],
              ["json", "Modèle · JSON"],
              ["png", "Vue 3D · PNG"],
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
          </div>
        </details>
        {harmonie && (
          <button type="button" id="atelier-harmonie-button" className="barre-harmonie" aria-controls="atelier-harmonie-page" aria-expanded="false" onClick={() => window.AtelierHarmonyPage?.open()}>
            ◈ Harmonie
          </button>
        )}
        <span className={`barre-sync${readOnly ? " sync-lecture" : !online || !reachable ? " sync-attente" : lotsEnDifficulte ? " sync-alerte" : enAttente ? " sync-attente" : ""}`} role="status" data-etat={readOnly ? "lecture" : !online ? "hors-ligne" : !reachable ? "injoignable" : lotsEnDifficulte ? "conflit" : enAttente ? "attente" : inst.horsLigne ? "cache" : "enregistre"}>
          {readOnly
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

      <div className="atelier-n-outils" role="toolbar" aria-label="Outils">
        <button type="button" className={`outil${ui.outil === "selection" ? " est-actif" : ""}`} aria-pressed={ui.outil === "selection"} onClick={() => etatUi.choisirOutil("selection")} title="Sélection (V)">
          <span aria-hidden="true">↖</span> <span className="outil-libelle">Sélection</span>
        </button>
        {outilsBarre.favoris.filter((o) => o.id !== "selection").map((o) => (
          <BoutonOutil key={o.id} o={o} actif={ui.outil === o.id} raison={disponibilite(o)} onChoisir={choisir} />
        ))}
        {outilsBarre.parFamille.map(([f, liste]) => (
          <details key={f} className="outils-famille">
            <summary>{FAMILLES[f]}</summary>
            <div className="outils-famille-liste">
              {liste.map((o) => <BoutonOutil key={o.id} o={o} actif={ui.outil === o.id} raison={disponibilite(o)} onChoisir={choisir} />)}
            </div>
          </details>
        ))}
      </div>

      <aside className="atelier-n-gauche" aria-label="Navigateur">
        <Navigateur etat={etat} ui={ui} readOnly={readOnly} onCommandes={(c, l) => void executer(c, l, false)} onCentrer={centrerSur} />
      </aside>

      <main className="atelier-n-travail" ref={zone}>
        {ui.mode === "3d" ? (
          <Suspense fallback={<p role="status" className="vue3d-etat">Chargement de la vue 3D…</p>}>
            <Vue3D etat={etat} ui={ui} readOnly={readOnly} onCommandes={(c, l) => void executer(c, l, false)} />
          </Suspense>
        ) : (
          <Plan2D etat={etat} ui={ui} readOnly={readOnly} onResultat={appliquerResultat} onTerminer={finir} onCommandes={(c, l) => void executer(c, l, false)} />
        )}
        {ui.mode === "2d" && (ui.pointsEnCours.length > 0 || precision) && (
          <form
            className="saisie-precision"
            onSubmit={(e) => {
              e.preventDefault();
              validerPrecision();
            }}
          >
            <label htmlFor="saisie-precision">Longueur ou dx;dy</label>
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
          <Inspecteur etat={etat} ui={ui} readOnly={readOnly} onCommandes={(c, l) => void executer(c, l, false)} />
        </div>
        <div className="droite-modifications">
          <Modifications projectId={projectId} instantane={inst} readOnly={readOnly} onDecider={(id, d) => void client.decider(id, d)} onAller={(id) => { etatUi.selectionner([id]); centrerSur(id); }} />
        </div>
      </aside>

      <footer className="atelier-n-etat" aria-live="polite">
        {protectedReference && !readOnly && (
          <span className="atelier-n-reference" role="note" title={`La référence reste intacte : votre première modification validée ouvre une copie de travail (« ${DRAWING_COPY_NAME} ») et s’y enregistre.`}>
            {PROTECTED_REFERENCE_MESSAGE}
          </span>
        )}
        {erreur ? <span className="etat-erreur" role="alert">{erreur}</span> : <span className="etat-aide">{mesure ?? ui.aide}</span>}
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
