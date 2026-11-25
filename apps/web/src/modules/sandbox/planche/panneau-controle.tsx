/**
 * Panneau « Contrôle et nettoyage » (extension, 25 novembre 2026) : le relevé de la Planche — objets vides, matières et
 * balises inutilisées, arêtes isolées, solides ouverts — et le nettoyage de ce qui est coché. Le relevé ne modifie
 * rien ; le nettoyage est une seule opération (un seul Annuler). Barre du panneau : Nettoyer.
 */
import { POINTS_NETTOYAGE, type ChoixNettoyage, type RapportControle, rienANettoyer } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_CONTROLE, type Disponibilite, type IdCommandeControle } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export function PanneauControle({
  rapport,
  choix,
  onChoix,
  executer,
  disponibilite,
  onSelectionnerOuverts,
  lecture,
  note,
}: {
  rapport: RapportControle;
  choix: ChoixNettoyage;
  onChoix: (c: ChoixNettoyage) => void;
  executer: (id: IdCommandeControle) => void;
  disponibilite: (id: IdCommandeControle) => Disponibilite;
  /** Sélectionne les objets de la racine qui ne sont pas des solides fermés ; absent hors de la racine. */
  onSelectionnerOuverts: (() => void) | null;
  lecture: boolean;
  note: string | null;
}) {
  const propre = rienANettoyer(rapport, { objetsVides: true, materiauxInutilises: true, balisesInutilisees: true, aretesIsolees: true });
  return (
    <div className="planche-controle" data-planche-controle>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.controle.barre")}>
        {COMMANDES_CONTROLE.filter((c) => c.id !== "controler").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} /> {t(c.court)}
            </button>
          );
        })}
      </div>
      <p className="inspecteur-aide">{t("planche.controle.aide")}</p>
      <h4>{t("planche.controle.a-nettoyer")}</h4>
      <ul className="planche-controle-points">
        {POINTS_NETTOYAGE.map((p) => (
          <li key={p} className="planche-controle-point" data-planche-controle-point={p}>
            <label>
              <input type="checkbox" checked={choix[p]} disabled={lecture} onKeyDown={arreter} onChange={(e) => onChoix({ ...choix, [p]: e.target.checked })} data-planche-controle-choix={p} />
              <span>{t(`planche.controle.point.${p}`)}</span>
              <span className="planche-controle-nombre" data-zero={rapport[p] === 0} data-planche-controle-nombre={p}>{rapport[p]}</span>
            </label>
            {p === "aretesIsolees" && <small>{t("planche.controle.point.aretesIsolees.aide")}</small>}
          </li>
        ))}
      </ul>
      {propre && <p className="inspecteur-aide" data-planche-controle-propre>{t("planche.controle.propre")}</p>}
      <h4>{t("planche.controle.solides")}</h4>
      <p className="inspecteur-aide" data-planche-controle-solides={rapport.objetsNonSolides}>
        {rapport.objets === 0
          ? t("planche.controle.solides.aucun")
          : rapport.objetsNonSolides === 0
            ? t("planche.controle.solides.tous", { objets: String(rapport.objets) })
            : t("planche.controle.solides.ouverts", { ouverts: String(rapport.objetsNonSolides), objets: String(rapport.objets) })}
      </p>
      {rapport.objetsNonSolides > 0 && onSelectionnerOuverts && (
        <div className="planche-debit-barre">
          <button type="button" onClick={onSelectionnerOuverts} data-planche-controle-selectionner>{t("planche.controle.solides.selectionner")}</button>
        </div>
      )}
      {note && <p className="inspecteur-aide" role="status" data-planche-controle-note>{note}</p>}
    </div>
  );
}
