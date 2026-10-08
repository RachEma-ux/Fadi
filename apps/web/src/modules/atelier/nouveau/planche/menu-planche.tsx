/**
 * Lot 7 — menu principal de la Planche (cahier-planche §7.1, P-1 / D-167) : Planches nommées du projet (ouvrir,
 * nouvelle, renommer, niveau de référence, « Enregistrer sous », supprimer), export IFC de la Planche ouverte,
 * PNG de la vue, reprise du brouillon local dans le projet (proposée, jamais imposée). Composant pur : il reçoit la
 * liste des Planches et des rappels ; la Planche envoie les commandes.
 */
import { useEffect, useRef, useState } from "react";
import type { DefinitionPlanche, Niveau } from "@parcours/atelier-model";
import { t } from "../messages";

export interface ActionsMenuPlanche {
  ouvrir(id: string): void;
  creer(nom: string, depuisBrouillon: boolean): void;
  renommer(id: string, nom: string, niveauId: string | null): void;
  copier(id: string, nom: string): void;
  supprimer(id: string): void;
  exporterIfc(id: string): Promise<void>;
  /** OBJ / STL (P-6, D-173) : maillages de la Planche ouverte, écrits dans la page. */
  exporterMaillage(format: "obj" | "stl"): void;
  telechargerPng(): Promise<void>;
}

type Volet = "nouvelle" | "renommer" | "copier" | "supprimer" | null;

export function MenuPlanche({ planches, courante, niveaux, lecture, brouillonNonVide, actions }: { planches: readonly DefinitionPlanche[]; courante: DefinitionPlanche | null; niveaux: readonly Niveau[]; lecture: boolean; brouillonNonVide: boolean; actions: ActionsMenuPlanche }) {
  const [ouvert, setOuvert] = useState(false);
  const [volet, setVolet] = useState<Volet>(null);
  const [nom, setNom] = useState("");
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [depuisBrouillon, setDepuisBrouillon] = useState(true);
  const [occupe, setOccupe] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOuvert(false);
        setVolet(null);
      }
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOuvert(false);
        setVolet(null);
      }
    };
    window.addEventListener("pointerdown", fermer, true);
    window.addEventListener("keydown", clavier, true);
    return () => {
      window.removeEventListener("pointerdown", fermer, true);
      window.removeEventListener("keydown", clavier, true);
    };
  }, [ouvert]);
  const fermer = () => {
    setOuvert(false);
    setVolet(null);
  };
  const ouvrirVolet = (v: Volet) => {
    setVolet(v);
    if (v === "nouvelle") {
      setNom(t("planche.nom-defaut", { numero: String(planches.length + 1) }));
      setDepuisBrouillon(!courante && brouillonNonVide);
    } else if (v === "renommer" && courante) {
      setNom(courante.params.nom);
      setNiveauId(courante.params.niveauId);
    } else if (v === "copier" && courante) setNom(`${courante.params.nom} (copie)`);
  };
  const action = async (cle: string, fn: () => Promise<void>) => {
    setOccupe(cle);
    try {
      await fn();
    } finally {
      setOccupe(null);
    }
  };
  const titre = courante ? courante.params.nom : t("planche.brouillon");
  return (
    <div className="planche-menu-principal" ref={ref} data-planche-menu-principal>
      <button type="button" className="planche-menu-bouton" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => (ouvert ? fermer() : setOuvert(true))} title={t("planche.menu-principal")} data-planche-menu-ouvrir data-planche-nom={courante?.params.nom ?? ""}>
        <span aria-hidden="true" className="outil-picto">☰</span>
        <span className="planche-menu-titre">{titre}</span>
      </button>
      {ouvert && (
        <div className="planche-menu planche-menu-liste" role="menu" aria-label={t("planche.menu-principal")}>
          <ul role="none">
            <li role="none" className="planche-menu-entete">{t("planche.ouvrir")}</li>
            {planches.length === 0 && <li role="none" className="inspecteur-aide">{t("planche.aucune")}</li>}
            {planches.map((p) => (
              <li key={p.id} role="none">
                <button type="button" role="menuitemradio" aria-checked={p.id === courante?.id} data-planche-ouvrir={p.id} onClick={() => { actions.ouvrir(p.id); fermer(); }}>
                  {p.params.nom}
                  {p.params.niveauId && <small> · {niveaux.find((n) => n.id === p.params.niveauId)?.nom ?? p.params.niveauId}</small>}
                </button>
              </li>
            ))}
            <li role="none" className="avec-separateur">
              <button type="button" role="menuitem" disabled={lecture} data-planche-nouvelle onClick={() => ouvrirVolet("nouvelle")}>{t("planche.nouvelle")}</button>
            </li>
            {!courante && brouillonNonVide && <li role="none" className="inspecteur-aide">{t("planche.brouillon.proposer")}</li>}
            <li role="none"><button type="button" role="menuitem" disabled={lecture || !courante} data-planche-renommer onClick={() => ouvrirVolet("renommer")}>{t("planche.renommer")}</button></li>
            <li role="none"><button type="button" role="menuitem" disabled={lecture || !courante} data-planche-copier onClick={() => ouvrirVolet("copier")}>{t("planche.enregistrer-sous")}</button></li>
            <li role="none"><button type="button" role="menuitem" disabled={lecture || !courante} data-planche-supprimer onClick={() => ouvrirVolet("supprimer")}>{t("planche.supprimer")}</button></li>
            <li role="none" className="avec-separateur">
              <button type="button" role="menuitem" disabled={!courante || occupe !== null} data-planche-exporter-ifc onClick={() => courante && void action("ifc", () => actions.exporterIfc(courante.id)).then(fermer)}>{occupe === "ifc" ? t("planche.export.en-cours") : t("planche.exporter-ifc")}</button>
            </li>
            <li role="none"><button type="button" role="menuitem" disabled={!courante} data-planche-exporter-obj onClick={() => { actions.exporterMaillage("obj"); fermer(); }}>{t("planche.exporter-obj")}</button></li>
            <li role="none"><button type="button" role="menuitem" disabled={!courante} data-planche-exporter-stl onClick={() => { actions.exporterMaillage("stl"); fermer(); }}>{t("planche.exporter-stl")}</button></li>
            <li role="none"><button type="button" role="menuitem" disabled={occupe !== null} data-planche-telecharger-png onClick={() => void action("png", () => actions.telechargerPng()).then(fermer)}>{t("planche.telecharger-png")}</button></li>
          </ul>
          {volet && (
            <form
              className="planche-menu-volet"
              data-planche-menu-volet={volet}
              onSubmit={(e) => {
                e.preventDefault();
                const n = nom.trim();
                if (volet === "nouvelle" && n) actions.creer(n, depuisBrouillon);
                else if (volet === "renommer" && courante && n) actions.renommer(courante.id, n, niveauId);
                else if (volet === "copier" && courante && n) actions.copier(courante.id, n);
                else if (volet === "supprimer" && courante) actions.supprimer(courante.id);
                else return;
                fermer();
              }}
            >
              {volet === "supprimer" ? (
                <p>{t("planche.supprimer.confirmer", { nom: courante?.params.nom ?? "" })}</p>
              ) : (
                <label>
                  {t("planche.nom")}
                  <input value={nom} autoFocus onChange={(e) => setNom(e.target.value)} autoComplete="off" data-planche-volet-nom />
                </label>
              )}
              {volet === "nouvelle" && !courante && brouillonNonVide && (
                <label className="planche-bascule">
                  <input type="checkbox" checked={depuisBrouillon} onChange={(e) => setDepuisBrouillon(e.target.checked)} data-planche-volet-brouillon /> {t("planche.brouillon.enregistrer")}
                </label>
              )}
              {volet === "renommer" && (
                <label>
                  {t("planche.niveau-reference")}
                  <select value={niveauId ?? ""} onChange={(e) => setNiveauId(e.target.value || null)} data-planche-volet-niveau>
                    <option value="">{t("planche.niveau.aucun")}</option>
                    {niveaux.map((n) => (
                      <option key={n.id} value={n.id}>{n.nom}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="barre-groupe">
                <button type="submit" data-planche-volet-valider>{volet === "supprimer" ? t("planche.supprimer") : volet === "nouvelle" ? t("planche.creer") : t("planche.enregistrer")}</button>
                <button type="button" onClick={() => setVolet(null)} data-planche-volet-annuler>{t("planche.composant.annuler")}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
