/**
 * Roue de réglages ⚙ de la barre de l'Atelier (D-195) : ce qui se règle rarement quitte la rangée et se range ici —
 * niveau d'affichage des outils, accrochages (pas polaire, pas de grille), disposition Canevas. Les attributs de
 * test des contrôles sont ceux qu'ils portaient dans la barre (`data-accrochage`, `data-pas-polaire`,
 * `data-disposition-canevas`). Les actions (annuler, cadrer…) n'en font pas partie : une roue règle, elle n'agit pas.
 */
import type { ReactNode } from "react";
import { etatUi, type EtatUi, type NiveauAffichage } from "../etat-ui";
import { t } from "../messages";

const ACCROCHAGES = ["extremite", "milieu", "centre", "perpendiculaire", "intersection", "proche", "parallele", "orthogonal", "grille"] as const;

export interface PropsReglages {
  ui: EtatUi;
  /** Mode Plan ou 3D : affichage des outils et accrochages se règlent. */
  dessin: boolean;
  /** Mode Documents : la disposition Canevas n'a pas de sens. */
  documents: boolean;
  /** Section supplémentaire (barre d'actions, lot B), rendue après les réglages du dessin. */
  supplement?: ReactNode;
}

export function Reglages({ ui, dessin, documents, supplement }: PropsReglages) {
  const libelles: Record<(typeof ACCROCHAGES)[number], string> = {
    extremite: "Extrémité",
    milieu: "Milieu",
    centre: "Centre",
    perpendiculaire: "Perpendiculaire et tangente",
    intersection: "Intersection",
    proche: "Proche (tracés et faces de murs)",
    parallele: "Parallèle (arête survolée)",
    orthogonal: `Polaire (${ui.accrochages.pasPolaire ?? 45}°)`,
    grille: "Grille",
  };
  return (
    <details className="barre-reglages" data-reglages>
      <summary aria-label={t("reglages.titre")} title={t("reglages.titre")}>
        <span aria-hidden="true">⚙</span>
      </summary>
      <div className="exports-liste reglages-liste">
        {dessin && (
          <section className="reglages-section" aria-labelledby="reglages-affichage">
            <h3 id="reglages-affichage">{t("reglages.affichage")}</h3>
            <label className="barre-affichage">
              <span>Affichage</span>
              <select aria-label="Niveau d'affichage des outils" value={ui.affichage} onChange={(e) => etatUi.set({ affichage: e.target.value as NiveauAffichage })}>
                <option value="essentiel">Essentiel</option>
                <option value="contextuel">Contextuel</option>
                <option value="complet">Complet</option>
              </select>
            </label>
          </section>
        )}
        {dessin && (
          <section className="reglages-section" aria-labelledby="reglages-accrochages">
            <h3 id="reglages-accrochages">Accrochages</h3>
            <div className="accrochages-liste">
              {ACCROCHAGES.map((k) => (
                <label key={k}>
                  <input type="checkbox" checked={ui.accrochages[k] === true} data-accrochage={k} onChange={(e) => etatUi.set((u) => ({ accrochages: { ...u.accrochages, [k]: e.target.checked } }))} />
                  {libelles[k]}
                </label>
              ))}
              <label>
                Pas polaire
                <select value={String(ui.accrochages.pasPolaire ?? 45)} data-pas-polaire onChange={(e) => etatUi.set((u) => ({ accrochages: { ...u.accrochages, pasPolaire: Number(e.target.value) } }))}>
                  {[5, 10, 15, 22.5, 30, 45, 90].map((v) => (
                    <option key={v} value={String(v)}>
                      {String(v).replace(".", ",")}°
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pas de grille (m)
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={ui.accrochages.pasGrille}
                  onChange={(e) => Number.isFinite(e.target.valueAsNumber) && e.target.valueAsNumber > 0 && etatUi.set((u) => ({ accrochages: { ...u.accrochages, pasGrille: e.target.valueAsNumber } }))}
                />
              </label>
            </div>
          </section>
        )}
        {!documents && (
          <section className="reglages-section" aria-labelledby="reglages-disposition">
            <h3 id="reglages-disposition">{t("reglages.disposition")}</h3>
            {/* Disposition (D-156) : grille à cinq repères ou canevas plein écran à panneaux flottants. */}
            <button
              type="button"
              aria-pressed={ui.disposition === "canevas"}
              data-disposition-canevas
              onClick={() => etatUi.set((u) => ({ disposition: u.disposition === "canevas" ? "classique" : "canevas", panneauFlottant: null }))}
              title="Canevas plein écran : outils et panneaux flottent sur le dessin"
            >
              Canevas
            </button>
          </section>
        )}
        {supplement}
      </div>
    </details>
  );
}
