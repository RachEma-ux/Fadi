/**
 * Panneau « Liste de débit » de la Planche (lot L14, D-217) : les pièces de profilé groupées par section (source
 * complète), longueur et angles ; tri par colonne ; portée tout / sélection ; un clic sur une ligne sélectionne
 * exactement ses occurrences. Masse seulement avec une masse linéique sourcée ou une masse volumique déclarée avec sa
 * source ; sinon « non évaluée ». Barre du panneau : Renuméroter, Étiquettes, Effacer les étiquettes, Exporter le CSV.
 */
import { type ColonneDebit, type LigneDebit, texteSourceDebit } from "@parcours/planche-model";
import { LOCALE } from "../../../../lib/i18n";
import { type CleMessage, t } from "../messages";
import { COMMANDES_DEBIT, type Disponibilite, type IdCommandeDebit } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const nombre = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });

export interface ReglagesDebit {
  readonly portee: "tout" | "selection";
  readonly prefixe: string;
  readonly depart: string;
  readonly masseVolumique: string;
  readonly sourceMasse: string;
  readonly tri: { readonly colonne: ColonneDebit; readonly sens: 1 | -1 } | null;
}
export const REGLAGES_DEBIT_DEFAUT: ReglagesDebit = { portee: "tout", prefixe: "P", depart: "1", masseVolumique: "", sourceMasse: "", tri: null };

const COLONNES: readonly { id: ColonneDebit; cle: CleMessage }[] = [
  { id: "reperes", cle: "planche.debit.col.reperes" },
  { id: "designation", cle: "planche.debit.col.designation" },
  { id: "nombre", cle: "planche.debit.col.nombre" },
  { id: "longueurUnitaire", cle: "planche.debit.col.longueur-unitaire" },
  { id: "longueurTotale", cle: "planche.debit.col.longueur-totale" },
  { id: "angles", cle: "planche.debit.col.angles" },
  { id: "source", cle: "planche.debit.col.source" },
  { id: "masse", cle: "planche.debit.col.masse" },
];

export function PanneauDebit({
  lignes,
  reglages,
  onReglages,
  onLigne,
  executer,
  disponibilite,
  lecture,
  note,
}: {
  lignes: readonly LigneDebit[];
  reglages: ReglagesDebit;
  onReglages: (r: ReglagesDebit) => void;
  onLigne: (l: LigneDebit) => void;
  executer: (id: IdCommandeDebit) => void;
  disponibilite: (id: IdCommandeDebit) => Disponibilite;
  lecture: boolean;
  note: string | null;
}) {
  const champ = (cle: keyof ReglagesDebit, libelle: string, attrs: Record<string, string> = {}) => (
    <label className="planche-debit-champ">
      <span>{libelle}</span>
      <input value={String(reglages[cle] ?? "")} disabled={lecture && cle !== "masseVolumique" && cle !== "sourceMasse"} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, [cle]: e.target.value })} {...attrs} />
    </label>
  );
  const totalL = lignes.reduce((s, l) => s + l.longueurTotale, 0);
  const totalN = lignes.reduce((s, l) => s + l.nombre, 0);
  return (
    <div className="planche-debit" data-planche-debit>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.debit.barre")}>
        {COMMANDES_DEBIT.filter((c) => c.id !== "liste-debit").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
              <span aria-hidden="true">{c.picto}</span> {t(c.court)}
            </button>
          );
        })}
      </div>
      <div className="planche-debit-reglages">
        <label className="planche-debit-champ">
          <span>{t("planche.debit.portee")}</span>
          <select value={reglages.portee} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, portee: e.target.value === "selection" ? "selection" : "tout" })} data-planche-debit-portee>
            <option value="tout">{t("planche.debit.portee.tout")}</option>
            <option value="selection">{t("planche.debit.portee.selection")}</option>
          </select>
        </label>
        {champ("prefixe", t("planche.debit.prefixe"), { "data-planche-debit-prefixe": "", maxLength: "12" })}
        {champ("depart", t("planche.debit.depart"), { "data-planche-debit-depart": "", inputMode: "numeric" })}
        {champ("masseVolumique", t("planche.debit.masse-volumique"), { "data-planche-debit-rho": "", inputMode: "decimal" })}
        {champ("sourceMasse", t("planche.debit.source-masse"), { "data-planche-debit-rho-source": "", placeholder: t("planche.debit.source-masse.aide") })}
      </div>
      {lignes.length === 0 ? (
        <p className="inspecteur-aide" data-planche-debit-vide>{t("planche.debit.vide")}</p>
      ) : (
        <table className="planche-debit-table">
          <thead>
            <tr>
              {COLONNES.map((c) => {
                const actif = reglages.tri?.colonne === c.id;
                return (
                  <th key={c.id} aria-sort={actif ? (reglages.tri!.sens === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => onReglages({ ...reglages, tri: { colonne: c.id, sens: actif && reglages.tri!.sens === 1 ? -1 : 1 } })} data-planche-debit-tri={c.id}>
                      {t(c.cle)}
                      {actif ? (reglages.tri!.sens === 1 ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.cle} tabIndex={0} onClick={() => onLigne(l)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onLigne(l))} title={t("planche.debit.ligne.aide")} data-planche-debit-ligne={i}>
                <td>{l.reperes.join(", ")}</td>
                <td>{l.designation}</td>
                <td>{l.nombre}</td>
                <td>{nombre(l.longueurUnitaire)} m</td>
                <td>{nombre(l.longueurTotale)} m</td>
                <td>{`${nombre(l.angles[0], 1)}° / ${nombre(l.angles[1], 1)}°`}</td>
                <td>{l.source.genre === "saisie" ? t("planche.info.piece.saisie") : texteSourceDebit(l.source)}</td>
                <td title={l.origineMasse} data-planche-debit-masse>{l.masse === null ? t("planche.debit.non-evaluee") : `${nombre(l.masse, 2)} kg`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{t("planche.debit.total", { lignes: String(lignes.length) })}</td>
              <td>{totalN}</td>
              <td />
              <td data-planche-debit-total>{nombre(totalL)} m</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      )}
      {note && <p className="inspecteur-aide" role="status" data-planche-debit-note>{note}</p>}
    </div>
  );
}
