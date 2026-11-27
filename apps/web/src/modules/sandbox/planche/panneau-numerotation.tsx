/**
 * Panneau « Numérotation » (cas 2 du catalogue, lot 1, maquette lot1-4 validée le 27 novembre 2026) : numérote en série
 * les groupes et composants sélectionnés — une famille par nom de définition, un préfixe par famille, ordre de lecture du
 * plan, numéros repartant à chaque niveau si demandé. Aperçu avant d'appliquer ; une seule annulation défait la série.
 * Barre du panneau : Numéroter.
 */
import { useState } from "react";
import type { FamilleNumerotation } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_NUMEROTATION, type Disponibilite, type IdCommandeNumerotation } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export interface ReglagesNumerotation {
  readonly prefixes: string;
  readonly depart: string;
  readonly parNiveau: boolean;
}
export const REGLAGES_NUMEROTATION_DEFAUT: ReglagesNumerotation = { prefixes: "", depart: "01", parNiveau: true };

export function PanneauNumerotation({
  familles,
  niveaux,
  apercu,
  reglages,
  onReglages,
  executer,
  disponibilite,
  lecture,
  note,
}: {
  familles: readonly FamilleNumerotation[];
  niveaux: number;
  /** Noms proposés (ancien → nouveau), ou un message d'erreur. */
  apercu: readonly { readonly avant: string; readonly apres: string }[] | string;
  reglages: ReglagesNumerotation;
  onReglages: (r: ReglagesNumerotation) => void;
  executer: (id: IdCommandeNumerotation) => void;
  disponibilite: (id: IdCommandeNumerotation) => Disponibilite;
  lecture: boolean;
  note: string | null;
}) {
  const [voirApercu, setVoirApercu] = useState(false);
  const total = familles.reduce((n, f) => n + f.ids.length, 0);
  return (
    <div className="planche-numerotation" data-planche-numerotation>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.numeroter.barre")}>
        {COMMANDES_NUMEROTATION.filter((c) => c.id !== "numerotation").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} /> {t(c.court)}
            </button>
          );
        })}
        <button type="button" aria-pressed={voirApercu} onClick={() => setVoirApercu((v) => !v)} data-planche-numerotation-apercu-bouton>
          {t("planche.numeroter.apercu")}
        </button>
      </div>
      <p className="inspecteur-aide">{t("planche.numeroter.aide")}</p>
      <dl className="planche-numerotation-champs">
        <dt>{t("planche.numeroter.objets")}</dt>
        <dd data-planche-numerotation-familles>{familles.length === 0 ? t("planche.numeroter.aucun") : familles.map((f) => `${f.famille} (${f.ids.length})`).join(" · ")}</dd>
        <dt><label htmlFor="planche-numerotation-prefixes">{t("planche.numeroter.prefixes")}</label></dt>
        <dd>
          <input
            id="planche-numerotation-prefixes"
            type="text"
            value={reglages.prefixes}
            placeholder={familles.map((f) => `${(f.famille[0] ?? "O").toUpperCase()}.`).join(" · ")}
            disabled={lecture}
            onKeyDown={arreter}
            onChange={(e) => onReglages({ ...reglages, prefixes: e.target.value })}
            data-planche-numerotation-prefixes
          />
        </dd>
        <dt><label htmlFor="planche-numerotation-depart">{t("planche.numeroter.depart")}</label></dt>
        <dd>
          <input id="planche-numerotation-depart" type="text" inputMode="numeric" value={reglages.depart} disabled={lecture} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, depart: e.target.value })} data-planche-numerotation-depart />
        </dd>
        <dt>{t("planche.numeroter.ordre")}</dt>
        <dd>{t("planche.numeroter.ordre.lecture")}</dd>
        <dt><label htmlFor="planche-numerotation-niveau">{t("planche.numeroter.par-niveau")}</label></dt>
        <dd>
          <select id="planche-numerotation-niveau" value={reglages.parNiveau ? "oui" : "non"} disabled={lecture} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, parNiveau: e.target.value === "oui" })} data-planche-numerotation-niveau>
            <option value="oui">{t("planche.numeroter.par-niveau.oui")}</option>
            <option value="non">{t("planche.numeroter.par-niveau.non")}</option>
          </select>
        </dd>
      </dl>
      <p className="inspecteur-aide" data-planche-numerotation-compte>{t("planche.numeroter.compte", { objets: String(total), familles: String(familles.length), niveaux: String(niveaux) })}</p>
      {voirApercu &&
        (typeof apercu === "string" ? (
          <p className="inspecteur-aide" role="alert" data-planche-numerotation-erreur>{apercu}</p>
        ) : (
          <ol className="planche-numerotation-apercu" data-planche-numerotation-apercu>
            {apercu.map((a, i) => (
              <li key={i}>
                <span>{a.avant}</span> <IconeSandbox nom="sousMenu" /> <strong>{a.apres}</strong>
              </li>
            ))}
          </ol>
        ))}
      <p className="inspecteur-aide">{t("planche.numeroter.annulation")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-numerotation-note>{note}</p>}
    </div>
  );
}
