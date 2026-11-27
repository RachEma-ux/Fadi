/**
 * Panneau « Niveaux » (cas 4 du catalogue des extensions, étape 1 : D4-F5-001 et D4-F5-054 ; maquette validée le
 * 27 novembre 2026, `analyses/catalogue-extensions/cas-4/maquettes/etape-1-niveaux.png`) : niveaux d'étage nommés,
 * altitude relative au ±0,00, hauteur d'étage, altitude NGF calculée depuis le niveau de référence de la Planche
 * (« non évaluée » sans lui), nombre d'objets rattachés ; barre : ajouter, travailler sur ce niveau, rattacher la
 * sélection ; Supprimer ; formulaire du niveau choisi (enregistré par Entrée ou en quittant le champ).
 */
import { type ErreurNiveau, type Id, type Niveau, altitudeNGF, texteAltitude } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_NIVEAUX, type Disponibilite, type IdCommandeNiveau } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

export interface SaisieNiveau {
  readonly nom: string;
  readonly altitude: string;
  readonly hauteur: string;
}

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const nombre = (v: number): string => String(Math.round(v * 1e6) / 1e6).replace(".", separateur());
const deuxDecimales = (v: number): string => v.toFixed(2).replace(".", separateur());
const metres = (v: number): string => `${deuxDecimales(v)} m`;
const saisieDe = (n: Niveau | null): SaisieNiveau => ({ nom: n?.nom ?? "", altitude: n ? nombre(n.altitude) : "", hauteur: n ? nombre(n.hauteur) : "" });
const CHAMPS = ["nom", "altitude", "hauteur"] as const;

export function PanneauNiveaux({
  niveaux,
  objets,
  choisi,
  travail,
  reference,
  lecture,
  onChoisir,
  onModifier,
  onAjouter,
  onSupprimer,
  onReference,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  /** Niveaux du plus haut au plus bas. */
  niveaux: readonly Niveau[];
  /** Nombre d'objets rattachés, par niveau. */
  objets: Readonly<Record<Id, number>>;
  choisi: Id | null;
  /** Niveau de travail (plan de travail à son altitude, nouveaux objets rattachés). */
  travail: Id | null;
  /** Niveau de référence de la Planche : altitude NGF du ±0,00 ; `null` = non déclaré. */
  reference: number | null;
  lecture: boolean;
  onChoisir: (id: Id) => void;
  onModifier: (id: Id, s: SaisieNiveau) => void;
  /** Sans niveau, « Ajouter » prend la saisie du formulaire. */
  onAjouter: (s: SaisieNiveau) => void;
  onSupprimer: (id: Id) => void;
  onReference: (texte: string) => void;
  executer: (id: IdCommandeNiveau) => void;
  disponibilite: (id: IdCommandeNiveau) => Disponibilite;
  erreur: ErreurNiveau | "reference" | null;
  note: string | null;
}) {
  const courant = niveaux.find((n) => n.id === choisi) ?? null;
  const [saisie, setSaisie] = useState<SaisieNiveau>(() => saisieDe(courant));
  const [ref, setRef] = useState(reference === null ? "" : deuxDecimales(reference));
  // Le niveau choisi a changé ailleurs (Annuler, autre choix) : le formulaire le suit.
  useEffect(() => setSaisie(saisieDe(courant)), [courant]);
  useEffect(() => setRef(reference === null ? "" : deuxDecimales(reference)), [reference]);
  const enregistrer = () => {
    if (!courant) return;
    const avant = saisieDe(courant);
    if (CHAMPS.some((c) => saisie[c] !== avant[c])) onModifier(courant.id, saisie);
  };
  const enregistrerRef = () => {
    if (ref !== (reference === null ? "" : deuxDecimales(reference))) onReference(ref);
  };
  return (
    <div className="planche-controle planche-niveaux" data-planche-niveaux={niveaux.length}>
      <p className="inspecteur-aide">{t("planche.niveaux.aide")}</p>
      <div className="planche-niveaux-reference">
        <label>
          <span>{t("planche.niveaux.reference")}</span>
          <input value={ref} disabled={lecture} inputMode="decimal" aria-invalid={erreur === "reference"} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrerRef(); }} onBlur={enregistrerRef} onChange={(e) => setRef(e.target.value)} data-planche-niveaux-reference />
          <span>{t("planche.niveaux.reference.unite")}</span>
        </label>
        <span className="planche-niveaux-reference-aide">{t("planche.niveaux.reference.aide")}</span>
      </div>
      {niveaux.length === 0 ? (
        <p className="inspecteur-aide" data-planche-niveaux-vide>{t("planche.niveaux.vide")}</p>
      ) : (
        <table className="planche-debit-table planche-niveaux-table">
          <thead>
            <tr>
              <th>{t("planche.niveaux.colonne.niveau")}</th>
              <th>{t("planche.niveaux.colonne.altitude")}</th>
              <th>{t("planche.niveaux.colonne.hauteur")}</th>
              <th>{t("planche.niveaux.colonne.ngf")}</th>
              <th>{t("planche.niveaux.colonne.objets")}</th>
            </tr>
          </thead>
          <tbody>
            {niveaux.map((n) => {
              const ngf = altitudeNGF(n.altitude, reference);
              return (
                <tr key={n.id} tabIndex={0} aria-selected={n.id === choisi} className={`${n.id === choisi ? "est-choisi" : ""}${n.id === travail ? " est-travail" : ""}`} onClick={() => onChoisir(n.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onChoisir(n.id))} data-planche-niveau={n.id} data-planche-niveau-travail={n.id === travail ? "" : undefined}>
                  <td translate="no">{n.id === travail && <span className="planche-niveaux-point" aria-hidden="true" />}{n.nom}</td>
                  <td>{texteAltitude(n.altitude, separateur())} m</td>
                  <td>{metres(n.hauteur)}</td>
                  <td data-planche-niveau-ngf={ngf === null ? "non-evaluee" : ngf}>{ngf === null ? t("planche.niveaux.non-evaluee") : metres(ngf)}</td>
                  <td>{objets[n.id] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.niveaux.barre")}>
        {COMMANDES_NIVEAUX.filter((c) => c.id !== "niveaux").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" className={c.id === "ajouter-niveau" ? "est-principal" : undefined} disabled={!d.disponible} aria-pressed={c.id === "travailler-niveau" ? choisi !== null && choisi === travail : undefined} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => (c.id === "ajouter-niveau" && niveaux.length === 0 ? onAjouter(saisie) : executer(c.id))} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} /> {t(c.court)}
            </button>
          );
        })}
        <button type="button" disabled={lecture || !courant} onClick={() => courant && onSupprimer(courant.id)} data-planche-niveaux-supprimer>{t("planche.niveaux.supprimer")}</button>
      </div>
      <div className="planche-debit-reglages planche-niveaux-formulaire">
        {CHAMPS.map((c) => (
          <label key={c} className="planche-debit-champ">
            <span>{t(`planche.niveaux.champ.${c}`)}</span>
            <input value={saisie[c]} disabled={lecture} inputMode={c === "nom" ? "text" : "decimal"} aria-invalid={erreur === c || (c === "nom" && erreur === "nom-pris")} onKeyDown={(e) => { arreter(e); if (e.key === "Enter" && courant) enregistrer(); }} onBlur={enregistrer} onChange={(e) => setSaisie({ ...saisie, [c]: e.target.value })} data-planche-niveau-champ={c} />
          </label>
        ))}
      </div>
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-niveaux-erreur={erreur}>{t(`planche.niveaux.erreur.${erreur}`)}</p>}
      <p className="inspecteur-aide">{t("planche.niveaux.note")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-niveaux-note>{note}</p>}
    </div>
  );
}
