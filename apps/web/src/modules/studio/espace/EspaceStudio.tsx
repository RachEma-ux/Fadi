/**
 * Composants de l'espace de travail d'une variante (logiciel de conception, outils au premier plan) :
 *
 * - `ActionsEspace` : barre du haut, commune aux quatre domaines — Annuler, Rétablir, Enregistrer, Outils (Tool
 *   Manager) et la palette (Ctrl+K). Ce sont les commandes existantes de l'éditeur, avec leur icône, leur nom accessible et
 *   leur raccourci (règle d'or) ; elles ne sont rendues qu'ici (la palette d'outils du domaine les exclut).
 * - `PastilleWorkflow` : phase DÉCLARÉE de l'étude dans le workflow de conception (REF-01 §06), « non déclarée » par
 *   défaut ; un menu permet au propriétaire ou à un éditeur de la déclarer et propose, par de simples liens, les domaines
 *   concernés par la phase. Aucun effet métier, aucune phase déduite, aucun lien avec les 21 étapes du Parcours.
 * - `BarreEtat` : barre d'état fine sous le canevas — aide de l'outil, coordonnées du pointeur, accrochages, grille et
 *   échelle, planche affichée, commandes en attente, état d'enregistrement et de connexion.
 * - `PanneauLateral` : panneau repliable de la colonne de droite (propriétés, éléments, exigences, métré…).
 */
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { STUDIO_PHASES_WORKFLOW, type StudioPhaseWorkflow } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { ariaRaccourci, COMMANDES_EDITEUR, libelleRaccourci, type CommandeEditeur, type IdCommandeEditeur } from "../planche2d/raccourcis";
import { LIBELLES_RAISON, type RaisonIndisponible } from "../variante/droits";
import { ACTIONS_ESPACE, definitionDomaine, type DomaineStudio } from "../domaines/domaines";
import { clicSimple } from "../domaines/DomainesStudio";
import "./espace.css";

/** Actions de l'espace (barre du haut) : mêmes commandes, icônes et raccourcis que le registre de l'éditeur. */
export function ActionsEspace({ disponible, raison, libelle, surCommande }: {
  disponible: (c: CommandeEditeur) => boolean;
  raison?: (id: IdCommandeEditeur) => RaisonIndisponible | null;
  /** Libellé courant d'une commande quand il change (« Réessayer la sauvegarde »). */
  libelle?: Partial<Record<IdCommandeEditeur, string>>;
  surCommande: (id: IdCommandeEditeur) => void;
}) {
  return <div className="studio-actions-espace" role="toolbar" aria-label="Actions de l’espace" data-studio-actions-espace
    onKeyDown={(e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const i = items.indexOf(e.target as HTMLButtonElement);
      if (i < 0) return;
      e.preventDefault();
      items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]?.focus();
    }}>
    {ACTIONS_ESPACE.map((id) => {
      const c = COMMANDES_EDITEUR.find((x) => x.id === id)!;
      const nom = libelle?.[id] ?? c.libelleFR;
      const actif = disponible(c);
      const r = actif ? null : raison?.(id) ?? null;
      return <button key={id} type="button" aria-label={nom} aria-keyshortcuts={ariaRaccourci(c.raccourci)} disabled={!actif}
        title={`${nom} — ${libelleRaccourci(c.raccourci)}${r ? ` — ${LIBELLES_RAISON[r]}` : ""}`} data-studio-commande={id} data-studio-raison={r ?? undefined}
        data-studio-action-libelle={id === "enregistrer" || id === "outils" ? "" : undefined} onClick={() => surCommande(id)}>
        <Icon name={c.iconeSymbolique} size={18} /><span>{nom}</span><kbd aria-hidden="true">{libelleRaccourci(c.raccourci)}</kbd>
      </button>;
    })}
  </div>;
}

/**
 * Domaines suggérés après la phase déclarée (liens, sans effet) — LECTURE PROPOSÉE, À VALIDER par le maître d'ouvrage
 * (ADR-STUDIO-NAV-01) : REF-01 ne relie pas les phases du §06 aux domaines du §02 ; cette table est une interprétation.
 * Cadrer : l'étude (cadrage, sources, variantes) ; Explorer : comparer les variantes ; Concevoir : Dessin et
 * modélisation ; Contrôler : BIM et coordination ; Coordonner et corriger : BIM puis Documentation (observations,
 * revues) ; Approuver et Publier : Documentation, métrés et collaboration (revues, publications).
 */
export type SuggestionPhase = { type: "domaine"; domaine: DomaineStudio } | { type: "etude" } | { type: "comparer" };
export const SUGGESTIONS_PHASE: Readonly<Record<StudioPhaseWorkflow, readonly SuggestionPhase[]>> = Object.freeze({
  cadrer: [{ type: "etude" }],
  explorer: [{ type: "comparer" }, { type: "domaine", domaine: "dessin" }],
  concevoir: [{ type: "domaine", domaine: "dessin" }],
  controler: [{ type: "domaine", domaine: "bim" }],
  coordonner: [{ type: "domaine", domaine: "bim" }, { type: "domaine", domaine: "documentation" }],
  approuver: [{ type: "domaine", domaine: "documentation" }],
  publier: [{ type: "domaine", domaine: "documentation" }],
});

export const libellePhase = (p: StudioPhaseWorkflow | null | undefined): string =>
  (p ? STUDIO_PHASES_WORKFLOW.find((x) => x.id === p)?.libelleFR : undefined) ?? "Non déclarée";

/**
 * Pastille de la phase déclarée (barre du haut) et son menu. `phase` : `undefined` tant que l'étude n'est pas lue.
 * `declarer` absent : lecture seule (lecteur, étude archivée, révision historique). Les suggestions sont des liens.
 */
export function PastilleWorkflow({ phase, declarer, adresses, surDomaine }: {
  phase: StudioPhaseWorkflow | null | undefined;
  declarer?: (p: StudioPhaseWorkflow | null) => Promise<unknown>;
  adresses: { domaine: (d: DomaineStudio) => string; etude: string; comparer: string };
  surDomaine: (d: DomaineStudio) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const id = useId();
  const racine = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => { if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors, true);
    return () => document.removeEventListener("pointerdown", dehors, true);
  }, [ouvert]);
  async function choisir(p: StudioPhaseWorkflow | null) {
    if (!declarer || enCours) return;
    setEnCours(true); setErreur("");
    try { await declarer(p); } catch { setErreur("Déclaration refusée ou non confirmée."); } finally { setEnCours(false); }
  }
  const suggestions = phase ? SUGGESTIONS_PHASE[phase] : [];
  const lien = (s: SuggestionPhase, i: number) => {
    if (s.type === "domaine") {
      const d = definitionDomaine(s.domaine);
      return <li key={i}><a href={adresses.domaine(s.domaine)} data-studio-sans-garde="" data-studio-suggestion-domaine={s.domaine}
        onClick={(e: MouseEvent) => { if (!clicSimple(e)) return; e.preventDefault(); setOuvert(false); surDomaine(s.domaine); }}>{`${d.numero} · ${d.libelleFR}`}</a></li>;
    }
    return <li key={i}><a href={s.type === "etude" ? adresses.etude : adresses.comparer} data-studio-suggestion={s.type}>{s.type === "etude" ? "Cadrage de l’étude" : "Comparer les variantes"}</a></li>;
  };
  return <div className="studio-workflow" ref={racine} data-studio-workflow data-studio-workflow-phase={phase ?? (phase === null ? "non-declaree" : "")}
    onKeyDown={(e) => { if (e.key === "Escape" && ouvert) { e.stopPropagation(); setOuvert(false); racine.current?.querySelector<HTMLButtonElement>("[data-studio-workflow-bouton]")?.focus(); } }}>
    <button type="button" className="studio-workflow-pastille" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert((o) => !o)} data-studio-workflow-bouton
      aria-label={`Phase de l’étude : ${libellePhase(phase)}`} title="Workflow de conception de l’étude">
      <span className="studio-workflow-point" aria-hidden="true" />{phase === undefined ? "Phase…" : libellePhase(phase)}<span className="studio-chevron" aria-hidden="true">▾</span>
    </button>
    <div id={id} className="studio-workflow-menu" hidden={!ouvert} role="group" aria-label="Workflow de conception de l’étude" data-studio-workflow-menu>
      <ol className="studio-workflow-phases">
        {STUDIO_PHASES_WORKFLOW.map((p) => <li key={p.id} aria-current={p.id === phase ? "step" : undefined} data-studio-phase={p.id}>
          {declarer
            ? <button type="button" aria-pressed={p.id === phase} disabled={enCours} onClick={() => void choisir(p.id === phase ? null : p.id)} data-studio-declarer-phase={p.id}><span aria-hidden="true">{p.rang}</span> {p.libelleFR}</button>
            : <span><span aria-hidden="true">{p.rang}</span> {p.libelleFR}</span>}
        </li>)}
      </ol>
      {declarer && phase && <button type="button" className="studio-workflow-retirer" disabled={enCours} onClick={() => void choisir(null)} data-studio-declarer-phase="aucune">Retirer la déclaration</button>}
      {!declarer && <p className="studio-workflow-note" data-studio-workflow-lecture>Déclaration réservée au propriétaire et aux éditeurs.</p>}
      {erreur && <p role="alert">{erreur}</p>}
      {suggestions.length > 0 && <div className="studio-workflow-suggestions" data-studio-workflow-suggestions>
        <p>Ouvrir ensuite</p>
        <ul>{suggestions.map(lien)}</ul>
      </div>}
    </div>
  </div>;
}

/** Coordonnées affichées (mètres, repère local), ou un tiret sans pointeur sur le canevas. */
export const texteCoordonnees = (p: { x: number; y: number } | null | undefined): string => {
  if (!p) return "X — · Y —";
  const n = (v: number) => v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `X ${n(p.x)} · Y ${n(p.y)}`;
};

export interface PropsBarreEtat {
  aide: string;
  coordonnees: { x: number; y: number } | null;
  accrochages: readonly string[];
  pas: number;
  pasAffiche: string;
  planche: string;
  sousTitre: string;
  enAttente: number;
  etat: string;
  connexion?: ReactNode;
  lectureSeule: boolean;
  /** Révision affichée (tête ou révision historique), identifiant complet en infobulle. */
  revision: string;
}

/** Barre d'état fine sous le canevas (une rangée ; défilante au téléphone). */
export function BarreEtat(p: PropsBarreEtat) {
  // Défilante au téléphone : focalisable au clavier pour être parcourue (axe : scrollable-region-focusable).
  return <footer className="studio-barre-etat" aria-label="Barre d’état" tabIndex={0} data-studio-barre-etat>
    <span className="studio-etat-aide" data-studio-aide>{p.aide}</span>
    <span data-studio-coordonnees translate="no">{texteCoordonnees(p.coordonnees)}</span>
    <span data-studio-accrochages={p.accrochages.length} title={p.accrochages.join(" · ") || undefined}>{p.accrochages.length ? `Accrochages : ${p.accrochages.length}` : "Accrochages : aucun"}</span>
    <span data-studio-pas-grille={p.pas}>{`Grille ${p.pasAffiche} m`}</span>
    <span>1 unité = 1 m</span>
    <span data-studio-revision-affichee={p.revision} title={p.revision}>Révision <span translate="no">{p.revision.slice(-8)}</span></span>
    <span data-studio-planche-active>{p.planche}</span>
    <span className="studio-masque" data-studio-sous-titre>{p.sousTitre}</span>
    <span data-studio-annuler-portee data-studio-en-attente-nombre={p.enAttente} title="Annuler et Rétablir ne portent que sur les modifications non enregistrées ; une révision enregistrée ne s’annule pas ici.">{`${p.enAttente} commande(s) en attente`}</span>
    {p.lectureSeule && <span role="status" data-studio-lecture-seule>Lecture seule</span>}
    <span role="status" data-studio-etat>{p.etat}</span>
    {p.connexion}
  </footer>;
}

/** Panneau latéral repliable : un en-tête (bouton) et son contenu ; replié, seul l'en-tête reste. */
export function PanneauLateral({ id, titre, ouvertInitial = true, children }: { id: string; titre: string; ouvertInitial?: boolean; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(ouvertInitial);
  const corps = `studio-panneau-${id}`;
  return <section className="studio-panneau" data-studio-panneau={id} data-studio-panneau-ouvert={ouvert ? "" : undefined} aria-label={titre}>
    <button type="button" className="studio-panneau-tete" aria-expanded={ouvert} aria-controls={corps} onClick={() => setOuvert((o) => !o)} data-studio-panneau-bascule={id}>
      <Icon name="chevron-down" size={14} /><span>{titre}</span>
    </button>
    <div id={corps} className="studio-panneau-corps" hidden={!ouvert}>{children}</div>
  </section>;
}
