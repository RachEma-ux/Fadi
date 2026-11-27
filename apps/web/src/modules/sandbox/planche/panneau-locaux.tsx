/**
 * Panneau « Locaux » (cas 4 du catalogue des extensions, étape 3 : D9-F10-016 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-3-locaux.png`) : tableau des locaux (numéro, nom, usage, niveau,
 * surface, périmètre, hauteur sous plafond, volume) calculé depuis la géométrie, total des seuls locaux évalués ; barre :
 * créer un local sur la face choisie, supprimer ; formulaire du local choisi (enregistré par Entrée ou en quittant le
 * champ). Un contour ouvert est signalé, jamais compté.
 */
import type { ErreurLocal, Id, MesureLocal, SaisieLocal } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_LOCAUX, type Disponibilite, type IdCommandeLocal } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const deux = (v: number): string => v.toFixed(2).replace(".", separateur());
const saisieDe = (l: MesureLocal | null): SaisieLocal => ({ numero: l?.local.numero ?? "", nom: l?.local.nom ?? "", usage: l?.local.usage ?? "", hauteur: l?.local.hauteur === undefined ? "" : String(l.local.hauteur).replace(".", separateur()) });
const CHAMPS = ["numero", "nom", "usage", "hauteur"] as const;

export function PanneauLocaux({
  lignes,
  total,
  evalues,
  choisi,
  lecture,
  onChoisir,
  onModifier,
  onSupprimer,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  lignes: readonly MesureLocal[];
  total: number;
  evalues: number;
  choisi: Id | null;
  lecture: boolean;
  onChoisir: (id: Id) => void;
  onModifier: (id: Id, s: SaisieLocal) => void;
  onSupprimer: (id: Id) => void;
  executer: (id: IdCommandeLocal) => void;
  disponibilite: (id: IdCommandeLocal) => Disponibilite;
  erreur: ErreurLocal | null;
  note: string | null;
}) {
  const courant = lignes.find((l) => l.local.id === choisi) ?? null;
  const [saisie, setSaisie] = useState<SaisieLocal>(() => saisieDe(courant));
  // Le local choisi a changé ailleurs (Annuler, autre choix) : le formulaire le suit.
  const cle = courant ? JSON.stringify(courant.local) : "";
  useEffect(() => setSaisie(saisieDe(courant)), [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const enregistrer = () => {
    if (!courant) return;
    const avant = saisieDe(courant);
    if (CHAMPS.some((c) => saisie[c] !== avant[c])) onModifier(courant.local.id, saisie);
  };
  const m2 = (v: number) => `${deux(v)} m²`;
  return (
    <div className="planche-controle planche-locaux" data-planche-locaux={lignes.length}>
      <p className="inspecteur-aide">{t("planche.locaux.aide")}</p>
      {lignes.length === 0 ? (
        <p className="inspecteur-aide" data-planche-locaux-vide>{t("planche.locaux.vide")}</p>
      ) : (
        <table className="planche-debit-table planche-locaux-table">
          <thead>
            <tr>
              {(["numero", "nom", "usage", "niveau"] as const).map((c) => <th key={c}>{t(`planche.locaux.colonne.${c}`)}</th>)}
              {(["surface", "perimetre", "hauteur", "volume"] as const).map((c) => <th key={c} className="planche-locaux-n">{t(`planche.locaux.colonne.${c}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.local.id} tabIndex={0} aria-selected={l.local.id === choisi} className={`${l.local.id === choisi ? "est-choisi" : ""}${l.etat !== "ferme" ? " est-ouvert" : ""}`} onClick={() => onChoisir(l.local.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onChoisir(l.local.id))} data-planche-local={l.local.id} data-planche-local-etat={l.etat}>
                <td translate="no">{l.local.numero}</td>
                <td translate="no">{l.local.nom}</td>
                <td translate="no">{l.local.usage ?? ""}</td>
                <td translate="no">{l.niveau?.nom ?? ""}</td>
                {l.surface === null ? (
                  <td className="planche-locaux-n" colSpan={4}>{t(l.etat === "non-horizontal" ? "planche.locaux.non-horizontal" : "planche.locaux.contour-ouvert")}</td>
                ) : (
                  <>
                    <td className="planche-locaux-n" data-planche-local-surface={l.surface}>{m2(l.surface)}</td>
                    <td className="planche-locaux-n">{`${deux(l.perimetre ?? 0)} m`}</td>
                    <td className="planche-locaux-n" data-planche-local-hauteur={l.origineHauteur ?? "non-evaluee"}>{l.hauteur === null ? t("planche.locaux.non-evaluee") : `${deux(l.hauteur)} m`}</td>
                    <td className="planche-locaux-n">{l.volume === null ? t("planche.locaux.non-evalue") : `${deux(l.volume)} m³`}</td>
                  </>
                )}
              </tr>
            ))}
            <tr className="planche-locaux-total">
              <td colSpan={4}>{t("planche.locaux.total", { evalues: String(evalues), nombre: String(lignes.length) })}</td>
              <td className="planche-locaux-n" data-planche-locaux-total={total}>{m2(total)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.locaux.barre")}>
        {COMMANDES_LOCAUX.filter((c) => c.id !== "locaux").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" className="est-principal" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} /> {t(c.court)}
            </button>
          );
        })}
        <button type="button" disabled={lecture || !courant} onClick={() => courant && onSupprimer(courant.local.id)} data-planche-locaux-supprimer>{t("planche.locaux.supprimer")}</button>
      </div>
      {courant && (
        <div className="planche-debit-reglages planche-locaux-formulaire">
          {CHAMPS.map((c) => (
            <label key={c} className="planche-debit-champ">
              <span>{t(`planche.locaux.champ.${c}`)}</span>
              <input
                value={saisie[c]}
                disabled={lecture}
                inputMode={c === "hauteur" ? "decimal" : "text"}
                placeholder={c === "hauteur" && courant.origineHauteur === "mesuree" && courant.hauteur !== null ? t("planche.locaux.mesuree", { valeur: deux(courant.hauteur) }) : undefined}
                aria-invalid={erreur === c || (c === "numero" && erreur === "numero-pris")}
                onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrer(); }}
                onBlur={enregistrer}
                onChange={(e) => setSaisie({ ...saisie, [c]: e.target.value })}
                data-planche-local-champ={c}
              />
            </label>
          ))}
        </div>
      )}
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-locaux-erreur={erreur}>{t(`planche.locaux.erreur.${erreur}`)}</p>}
      <p className="inspecteur-aide">{t("planche.locaux.note")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-locaux-note>{note}</p>}
    </div>
  );
}
