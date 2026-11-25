/**
 * Panneau « Scripts » (extension, 25 novembre 2026 ; d'après la console Ruby et les extensions libres de SketchUp) :
 * la personne écrit ou colle un script JavaScript, le lance, lit ses messages et l'enregistre dans « Mes scripts »
 * (préférences du compte). Le script s'exécute dans un Web Worker isolé (`scripts-execution.ts`) sur une copie du
 * dessin ; ce panneau n'exécute rien lui-même.
 */
import { EXEMPLES_SCRIPTS, MAX_CODE_SCRIPT, MAX_CODE_TOTAL, MAX_NOM_SCRIPT, MAX_SCRIPTS, idScript, normaliserCodeScript, validerScripts, type ErreurExecutionScript, type FonctionScript, type ScriptPersonnel } from "@parcours/sandbox-planche-model";
import { useState } from "react";
import { t, type CleMessage } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_SCRIPTS, type Disponibilite, type IdCommandeScripts } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";
import { DELAI_SCRIPT_MS } from "./scripts-execution";

const arreterTouche = (e: { stopPropagation(): void }) => e.stopPropagation();
const SECONDES = String(DELAI_SCRIPT_MS / 1000);

/** Écriture de chaque fonction de l'objet `planche` (du code, non traduit) ; sa description est dans les messages. */
export const SIGNATURES_SCRIPT: Readonly<Record<FonctionScript, string>> = {
  ligne: "planche.ligne(a, b)",
  rectangle: "planche.rectangle(coin, cote1, cote2)",
  boite: "planche.boite(coin, largeur, profondeur, hauteur)",
  pousser: "planche.pousser(face, distance)",
  deplacer: "planche.deplacer(elements, vecteur)",
  copier: "planche.copier(elements, vecteur, nombre)",
  tourner: "planche.tourner(elements, centre, axe, degres)",
  grouper: "planche.grouper(elements, nom)",
  composant: "planche.composant(elements, nom)",
  effacer: "planche.effacer(elements)",
  selection: "planche.selection()",
  faces: "planche.faces()",
  aretes: "planche.aretes()",
  objets: "planche.objets()",
  genre: "planche.genre(element)",
  aire: "planche.aire(face)",
  longueur: "planche.longueur(arete)",
  points: "planche.points(element)",
  nom: "planche.nom(objet)",
  afficher: "planche.afficher(valeur, ...)",
};

/** Script affiché dans l'éditeur : un de « Mes scripts », un exemple fourni, ou un nouveau texte. */
export interface ScriptEdite {
  readonly source: "personnel" | "exemple" | "nouveau";
  /** Identifiant du script personnel ou de l'exemple ; `null` pour un nouveau. */
  readonly id: string | null;
  readonly nom: string;
  readonly code: string;
}
export const SCRIPT_NOUVEAU: ScriptEdite = { source: "nouveau", id: null, nom: "", code: "" };
export const scriptExemple = (id: string): ScriptEdite | null => {
  const e = EXEMPLES_SCRIPTS.find((x) => x.id === id);
  return e ? { source: "exemple", id: e.id, nom: t(`planche.scripts.exemple.${e.id}` as CleMessage), code: e.code } : null;
};

/** Issue de la dernière exécution, montrée sous l'éditeur. */
export interface IssueAffichee {
  readonly etat: "encours" | "modifie" | "inchange" | "erreur" | "delai" | "arrete" | "panne" | "perime" | "lecture";
  readonly journal: readonly string[];
  readonly erreur: ErreurExecutionScript | null;
}

export type RefusEnregistrement = "nom" | "double" | "nombre" | "long" | "total" | "forme";

/** « Mes scripts » après l'enregistrement de `s`, ou le motif du refus. Pur. */
export function enregistrerScript(scripts: readonly ScriptPersonnel[], s: ScriptEdite): { readonly scripts: readonly ScriptPersonnel[]; readonly id: string } | { readonly refus: RefusEnregistrement } {
  const nom = s.nom.trim();
  const code = normaliserCodeScript(s.code);
  if (nom.length === 0 || nom.length > MAX_NOM_SCRIPT) return { refus: "nom" };
  const existant = s.source === "personnel" ? scripts.find((x) => x.id === s.id) : undefined;
  if (scripts.some((x) => x !== existant && x.nom.toLocaleLowerCase("fr") === nom.toLocaleLowerCase("fr"))) return { refus: "double" };
  if (!existant && scripts.length >= MAX_SCRIPTS) return { refus: "nombre" };
  if (code.length > MAX_CODE_SCRIPT) return { refus: "long" };
  const id = existant?.id ?? idScript(nom, scripts.map((x) => x.id));
  const suite = existant ? scripts.map((x) => (x === existant ? { id, nom, code } : x)) : [...scripts, { id, nom, code }];
  if (suite.reduce((n, x) => n + x.code.length, 0) > MAX_CODE_TOTAL) return { refus: "total" };
  const v = validerScripts(suite);
  return v.ok ? { scripts: v.scripts, id } : { refus: "forme" };
}

const MAX_REFUS: Partial<Record<RefusEnregistrement, number>> = { nombre: MAX_SCRIPTS, long: MAX_CODE_SCRIPT, total: MAX_CODE_TOTAL };

export function PanneauScripts({
  scripts,
  edite,
  onEdite,
  onScripts,
  enAttente,
  enCours,
  issue,
  executer,
  disponibilite,
  onArreter,
}: {
  scripts: readonly ScriptPersonnel[];
  edite: ScriptEdite;
  onEdite: (s: ScriptEdite) => void;
  /** Remplace « Mes scripts » dans les préférences du compte. */
  onScripts: (s: readonly ScriptPersonnel[]) => void;
  /** Les préférences ne sont pas encore enregistrées sur le compte (hors connexion). */
  enAttente: boolean;
  enCours: boolean;
  issue: IssueAffichee | null;
  executer: (id: IdCommandeScripts) => void;
  disponibilite: (id: IdCommandeScripts) => Disponibilite;
  onArreter: () => void;
}) {
  const [refus, setRefus] = useState<RefusEnregistrement | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const valeur = edite.source === "nouveau" ? "nouveau" : `${edite.source}:${edite.id}`;
  const choisir = (v: string) => {
    setRefus(null);
    setNote(null);
    if (v === "nouveau") return onEdite(SCRIPT_NOUVEAU);
    const [source, id] = [v.slice(0, v.indexOf(":")), v.slice(v.indexOf(":") + 1)];
    if (source === "exemple") {
      const e = scriptExemple(id);
      if (e) onEdite(e);
      return;
    }
    const p = scripts.find((x) => x.id === id);
    if (p) onEdite({ source: "personnel", id: p.id, nom: p.nom, code: p.code });
  };
  const enregistrer = () => {
    const r = enregistrerScript(scripts, edite);
    if ("refus" in r) {
      setRefus(r.refus);
      setNote(null);
      return;
    }
    const s = r.scripts.find((x) => x.id === r.id)!;
    setRefus(null);
    setNote(t("planche.scripts.note.enregistre", { nom: s.nom }));
    onScripts(r.scripts);
    onEdite({ source: "personnel", id: s.id, nom: s.nom, code: s.code });
  };
  const supprimer = () => {
    if (edite.source !== "personnel") return;
    setRefus(null);
    setNote(t("planche.scripts.note.supprime", { nom: edite.nom }));
    onScripts(scripts.filter((x) => x.id !== edite.id));
    onEdite(SCRIPT_NOUVEAU);
  };
  const commande = COMMANDES_SCRIPTS.find((c) => c.id === "executer-script")!;
  const d = disponibilite("executer-script");
  // Dans l'éditeur, les touches restent au texte ; seul le raccourci de la commande (lu au registre) lance le script.
  const toucheEditeur = (ev: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; stopPropagation(): void; preventDefault(): void }) => {
    ev.stopPropagation();
    if (ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey && `Maj+${ev.key}` === commande.raccourci) {
      ev.preventDefault();
      executer("executer-script");
    }
  };
  const e = issue?.erreur ?? null;
  const texteErreur = e ? t(`planche.scripts.erreur.${e.cle}` as CleMessage, e.args) : null;
  return (
    <div className="planche-controle planche-scripts" data-planche-scripts={enCours ? "encours" : "pret"}>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.scripts.barre")}>
        <button type="button" disabled={!d.disponible} title={`${t(commande.libelle)} (${afficherRaccourci(commande.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(commande.libelle)} onClick={() => executer("executer-script")} data-planche-commande="executer-script">
          <Pictogramme picto={commande.picto} /> {t(commande.court)}
        </button>
        <button type="button" disabled={!enCours} onClick={onArreter} data-planche-scripts-arreter>{t("planche.scripts.arreter")}</button>
      </div>
      {issue && (
        <div className="planche-scripts-issue" data-planche-scripts-issue={issue.etat}>
          <p className="inspecteur-aide" role={issue.etat === "encours" || issue.etat === "modifie" || issue.etat === "inchange" ? "status" : "alert"}>{t(`planche.scripts.issue.${issue.etat}`, { secondes: SECONDES })}</p>
          {texteErreur && e && <p className="planche-scripts-erreur" role="alert" data-planche-scripts-erreur={e.cle} data-planche-scripts-ligne={e.ligne ?? ""}>{e.ligne === null ? texteErreur : t("planche.scripts.ligne", { ligne: String(e.ligne), message: texteErreur })}</p>}
          {issue.journal.length > 0 && <pre className="planche-scripts-journal" aria-label={t("planche.scripts.journal")} data-planche-scripts-journal>{issue.journal.join("\n")}</pre>}
        </div>
      )}
      <p className="inspecteur-aide">{t("planche.scripts.aide")}</p>
      <div className="planche-debit-reglages">
        <label className="planche-debit-champ">
          <span>{t("planche.scripts.choisir")}</span>
          <select value={valeur} onChange={(ev) => choisir(ev.target.value)} onKeyDown={arreterTouche} data-planche-scripts-choix>
            <option value="nouveau">{t("planche.scripts.nouveau")}</option>
            {scripts.length > 0 && (
              <optgroup label={t("planche.scripts.groupe.personnels")}>
                {scripts.map((s) => <option key={s.id} value={`personnel:${s.id}`}>{s.nom}</option>)}
              </optgroup>
            )}
            <optgroup label={t("planche.scripts.groupe.exemples")}>
              {EXEMPLES_SCRIPTS.map((x) => <option key={x.id} value={`exemple:${x.id}`}>{t(`planche.scripts.exemple.${x.id}` as CleMessage)}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="planche-debit-champ">
          <span>{t("planche.scripts.nom")}</span>
          <input value={edite.nom} maxLength={MAX_NOM_SCRIPT} aria-invalid={refus === "nom" || refus === "double"} onKeyDown={arreterTouche} onChange={(ev) => onEdite({ ...edite, nom: ev.target.value })} data-planche-scripts-nom />
        </label>
      </div>
      <label className="planche-debit-champ">
        <span>{t("planche.scripts.code")}</span>
        <textarea className="planche-scripts-code" value={edite.code} rows={10} maxLength={MAX_CODE_SCRIPT} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" onKeyDown={toucheEditeur} onKeyUp={arreterTouche} onChange={(ev) => onEdite({ ...edite, code: ev.target.value })} data-planche-scripts-code />
      </label>
      <div className="planche-debit-barre">
        <button type="button" onClick={enregistrer} data-planche-scripts-enregistrer>{t("planche.scripts.enregistrer")}</button>
        <button type="button" disabled={edite.source !== "personnel"} onClick={supprimer} data-planche-scripts-supprimer>{t("planche.scripts.supprimer")}</button>
      </div>
      {refus && <p className="inspecteur-aide" role="alert" data-planche-scripts-refus={refus}>{t(`planche.scripts.refus.${refus}`, { max: String(MAX_REFUS[refus] ?? "") })}</p>}
      {note && <p className="inspecteur-aide" role="status" data-planche-scripts-note>{note}</p>}
      <details className="planche-scripts-fonctions" data-planche-scripts-fonctions>
        <summary>{t("planche.scripts.fonctions")}</summary>
        <dl>
          {(Object.keys(SIGNATURES_SCRIPT) as FonctionScript[]).map((f) => (
            <div key={f}>
              <dt><code>{SIGNATURES_SCRIPT[f]}</code></dt>
              <dd>{t(`planche.scripts.fonction.${f}`)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="inspecteur-aide">{t("planche.scripts.surete", { secondes: SECONDES })}</p>
      <p className="inspecteur-aide" role="status" data-planche-scripts-etat={enAttente ? "attente" : "compte"}>{t(enAttente ? "planche.scripts.copie" : "planche.scripts.compte")}</p>
    </div>
  );
}
