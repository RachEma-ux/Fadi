/**
 * Panneau « Enveloppe » (cas 4 du catalogue des extensions, étape 7c : D6-F20b-004 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7c) : l'enveloppe est un objet fermé du
 * modèle désigné par la personne ; les seuils de hauteur sont saisis avec leur source. Tableau Règle / Valeur / Seuil /
 * Marge / État (vérifiée, écart, non évaluée) ; un clic sur une ligne cadre la vue sur son point le plus défavorable.
 * Écart déclaré à la maquette : la fiche de la règle choisie (libellé, seuil, source) et les commandes Ajouter /
 * Supprimer une règle, sans lesquelles aucun seuil ne pourrait être saisi.
 */
import type { LigneControle, ReglagesEnveloppe, RegleHauteur, ResultatControleEnveloppe } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_ENVELOPPE, type Disponibilite, type IdCommandeEnveloppe } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const nombre = (v: number): string => v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metres = (v: number | null): string => (v === null ? "—" : `${nombre(v)} m`);
/** Marge signée : « +0,42 m », « −0,42 m » (signe moins typographique). */
const marge = (v: number | null): string => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nombre(Math.abs(v))} m`);
type Champs = { libelle: string; seuil: string; source: string };
const champsDe = (r: RegleHauteur | null): Champs => ({ libelle: r?.libelle ?? "", seuil: r?.seuil === null || r === null ? "" : String(r.seuil).replace(".", LOCALE.startsWith("fr") ? "," : "."), source: r?.source ?? "" });

export function PanneauEnveloppe({
  reglages,
  resultat,
  calcul,
  nomEnveloppe,
  choisie,
  lecture,
  onChoisir,
  onCadrer,
  onModifier,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  reglages: ReglagesEnveloppe;
  resultat: ResultatControleEnveloppe | null;
  /** Calcul en cours dans le travailleur. */
  calcul: boolean;
  nomEnveloppe: string | null;
  choisie: RegleHauteur | null;
  lecture: boolean;
  onChoisir: (id: string | null) => void;
  onCadrer: (l: LigneControle) => void;
  onModifier: (v: { libelle?: string; seuil?: number | null; source?: string }) => void;
  executer: (id: IdCommandeEnveloppe) => void;
  disponibilite: (id: IdCommandeEnveloppe) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const [champs, setChamps] = useState<Champs>(() => champsDe(choisie));
  const cle = choisie ? JSON.stringify(choisie) : "";
  useEffect(() => setChamps(champsDe(choisie)), [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const enregistrer = (c: keyof Champs) => {
    if (!choisie || champs[c] === champsDe(choisie)[c]) return;
    if (c === "seuil") {
      const brut = champs.seuil.trim().replace(",", ".");
      onModifier({ seuil: brut === "" ? null : Number(brut) });
    } else onModifier({ [c]: champs[c] });
  };
  const bouton = (id: IdCommandeEnveloppe, classe = "") => {
    const c = COMMANDES_ENVELOPPE.find((x) => x.id === id)!;
    const d = disponibilite(id);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} aria-pressed={id === "controler-enveloppe" ? reglages.controle : undefined} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
      </button>
    );
  };
  const libelleLigne = (l: LigneControle): string => (l.genre === "contenu" ? (nomEnveloppe ? t("planche.enveloppe.ligne.contenu", { nom: nomEnveloppe }) : t("planche.enveloppe.ligne.contenu-sans")) : l.source ? `${l.libelle} (${l.source})` : l.libelle);
  const valeur = (l: LigneControle): string => (l.valeur === null ? "—" : l.genre === "contenu" ? t("planche.enveloppe.hors", { valeur: metres(l.valeur) }) : metres(l.valeur));
  const contenu = resultat?.lignes.find((l) => l.genre === "contenu");
  const pire = contenu?.point ?? null;
  const champ = (c: keyof Champs) => (
    <label className="planche-reserves-champ" data-champ={c}>
      <span>{t(`planche.enveloppe.champ.${c}`)}</span>
      <input type="text" inputMode={c === "seuil" ? "decimal" : undefined} value={champs[c]} disabled={lecture} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrer(c); }} onBlur={() => enregistrer(c)} onChange={(e) => setChamps({ ...champs, [c]: e.target.value })} data-planche-enveloppe-champ={c} />
    </label>
  );
  return (
    <div className="planche-controle planche-reserves planche-enveloppe" data-planche-enveloppe={reglages.controle ? "actif" : "inactif"}>
      <p className="planche-reserves-compte" data-planche-enveloppe-etat>{t(reglages.controle ? "planche.enveloppe.actif" : "planche.enveloppe.inactif")}</p>
      <p className="inspecteur-aide">{t("planche.enveloppe.intro")}</p>
      <div className="planche-enveloppe-actions">
        {bouton("definir-enveloppe")}
        {bouton("controler-enveloppe", reglages.controle ? "est-principal" : "")}
      </div>
      {!reglages.controle ? (
        <p className="inspecteur-aide" data-planche-enveloppe-vide>{t("planche.enveloppe.vide")}</p>
      ) : !resultat ? (
        <p className="inspecteur-aide" data-planche-enveloppe-calcul>{t("planche.enveloppe.calcul")}</p>
      ) : (
        <table className="planche-reserves-table planche-enveloppe-table" data-planche-enveloppe-table={calcul ? "calcul" : "pret"}>
          <thead>
            <tr><th>{t("planche.enveloppe.col.regle")}</th><th>{t("planche.enveloppe.col.valeur")}</th><th>{t("planche.enveloppe.col.seuil")}</th><th>{t("planche.enveloppe.col.marge")}</th><th>{t("planche.enveloppe.col.etat")}</th></tr>
          </thead>
          <tbody>
            {resultat.lignes.map((l) => (
              <tr
                key={l.id}
                className={l.genre === "hauteur" && l.id === choisie?.id ? "est-choisi" : ""}
                onClick={() => { onChoisir(l.genre === "hauteur" ? l.id : null); onCadrer(l); }}
                data-planche-enveloppe-ligne={l.id}
                data-etat={l.etat}
              >
                <td>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onChoisir(l.genre === "hauteur" ? l.id : null); onCadrer(l); }} aria-pressed={l.genre === "hauteur" && l.id === choisie?.id}>{libelleLigne(l)}</button>
                  {l.motif && <em className="planche-enveloppe-motif" data-planche-enveloppe-motif={l.motif}>{t(`planche.enveloppe.motif-ne.${l.motif}`)}</em>}
                </td>
                <td>{valeur(l)}</td>
                <td>{metres(l.seuil)}</td>
                <td>{marge(l.marge)}</td>
                <td><span className={`planche-reserves-etat planche-enveloppe-etat est-${l.etat}`}>{t(`planche.enveloppe.etat.${l.etat}`)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {choisie && (
        <div className="planche-reserves-fiche" data-planche-enveloppe-fiche={choisie.id}>
          {champ("libelle")}
          {champ("seuil")}
          {champ("source")}
        </div>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.enveloppe.barre")}>
        {bouton("ajouter-regle-hauteur")}
        {bouton("supprimer-regle-hauteur")}
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-enveloppe-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-enveloppe-note>{note}</p>}
      {reglages.controle && resultat && (
        <p className="inspecteur-aide" data-planche-enveloppe-pire>
          {pire ? t("planche.enveloppe.pire", { x: nombre(pire.x), y: nombre(pire.y), z: nombre(pire.z) }) : ""} {t("planche.enveloppe.aide")}
        </p>
      )}
    </div>
  );
}
