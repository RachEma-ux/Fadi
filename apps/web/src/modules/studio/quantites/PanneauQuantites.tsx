/**
 * Panneau de quantités Studio (E.3-04 / E.3-05) : métré brut du dessin par calque et par objet, totaux, filtres, export
 * CSV, et journal d'ajustements manuels. La valeur dérivée n'est jamais effacée : une valeur ajustée s'affiche à côté,
 * avec son motif (obligatoire), son auteur et sa date. Les ajustements vivent dans l'état du panneau (aucune API
 * encore) : ils ne sont pas enregistrés avec la révision, et le panneau le dit.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  appliquerAjustementsQuantites, controlerAjustementQuantite, GRANDEURS_QUANTITE, quantitesStudio, UNITE_GRANDEUR,
  type AjustementQuantite, type GrandeurQuantite, type NatureQuantite, type StudioDocument, type TotalAjuste, type ValeurAjustee,
} from "@parcours/atelier-model";
import { LOCALE } from "../../../lib/i18n";
import { useAuth } from "../../../lib/auth-context";
import { csvQuantites, nomFichierCsvQuantites, type SeparateurDecimal } from "./csv-quantites";
import {
  FILTRE_INITIAL, filtrerQuantites, formaterQuantite, LIBELLE_GRANDEUR, LIBELLE_MOTIF, LIBELLE_NATURE, LIBELLE_REFUS, lireNombre, NON_EVALUE, SYMBOLE_UNITE,
  type FiltreQuantites,
} from "./quantites-vue";
import "./quantites.css";

export interface PanneauQuantitesProps {
  doc: StudioDocument;
  /** Lecture seule : métré et export restent disponibles, la saisie d'ajustements est fermée. */
  lectureSeule: boolean;
  /** Journal initial et suivi des changements, pour un futur enregistrement (facultatifs). */
  ajustementsInitiaux?: readonly AjustementQuantite[];
  surAjustements?: (ajustements: readonly AjustementQuantite[]) => void;
}

const fmt = (v: number) => formaterQuantite(v, LOCALE);
const NATURES = Object.keys(LIBELLE_NATURE) as NatureQuantite[];

function Cellule({ v }: { v: ValeurAjustee | undefined }) {
  if (!v) return <td className="studio-quantites-sans" aria-label="sans objet">—</td>;
  const derivee = v.derivee === null
    ? <span className="studio-quantites-ne" title={v.motif ? LIBELLE_MOTIF[v.motif] : undefined} data-non-evalue>{NON_EVALUE}</span>
    : <span translate="no">{fmt(v.derivee)}</span>;
  if (v.ajustee === undefined) return <td data-grandeur={v.grandeur}>{derivee}</td>;
  return <td data-grandeur={v.grandeur} data-ajustee title={v.ajustement?.motif}>
    <span className="studio-quantites-derivee">dérivée {derivee}</span><br /><strong>ajustée <span translate="no">{fmt(v.ajustee)}</span></strong>
  </td>;
}

function CelluleTotal({ t }: { t: TotalAjuste | undefined }) {
  if (!t) return <td className="studio-quantites-sans">—</td>;
  return <td data-grandeur={t.grandeur}>
    {t.retenue === null ? <span className="studio-quantites-ne">{NON_EVALUE}</span> : <strong translate="no">{fmt(t.retenue)}</strong>}
    {t.ajustes > 0 && <><br /><small>dérivé {t.valeur === null ? NON_EVALUE : <span translate="no">{fmt(t.valeur)}</span>}</small></>}
    {t.nonEvalues > 0 && <><br /><small className="studio-quantites-ne">{`partiel : ${t.nonEvalues} non évalué(s)`}</small></>}
  </td>;
}

function useLienCsv(contenu: string): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return;
    const u = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
    setHref(u);
    return () => URL.revokeObjectURL(u);
  }, [contenu]);
  return href;
}

export function PanneauQuantites({ doc, lectureSeule, ajustementsInitiaux, surAjustements }: PanneauQuantitesProps) {
  const { user } = useAuth();
  const auteur = user ? (user.displayName?.trim() || user.email) : "";
  const [ajustements, setAjustements] = useState<readonly AjustementQuantite[]>(ajustementsInitiaux ?? []);
  const [filtre, setFiltre] = useState<FiltreQuantites>(FILTRE_INITIAL);
  const [decimal, setDecimal] = useState<SeparateurDecimal>(",");
  const brut = useMemo(() => quantitesStudio(doc), [doc]);
  const complet = useMemo(() => appliquerAjustementsQuantites(brut, ajustements), [brut, ajustements]);
  const vue = useMemo(() => appliquerAjustementsQuantites(filtrerQuantites(brut, filtre), ajustements), [brut, filtre, ajustements]);
  const csv = useMemo(() => csvQuantites(vue, { decimal }), [vue, decimal]);
  const lienCsv = useLienCsv(csv);
  const grandeurs = GRANDEURS_QUANTITE.filter((g) => brut.objets.some((o) => o.valeurs.some((v) => v.grandeur === g)));

  // Formulaire d'ajustement.
  const [objetId, setObjetId] = useState("");
  const [grandeur, setGrandeur] = useState<GrandeurQuantite | "">("");
  const [saisie, setSaisie] = useState("");
  const [retour, setRetour] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const objetChoisi = brut.objets.find((o) => o.objetId === objetId);
  const grandeursObjet = objetChoisi?.valeurs.map((v) => v.grandeur) ?? [];
  const ajouter = (e: FormEvent) => {
    e.preventDefault();
    const valeur = retour ? null : lireNombre(saisie);
    if (!retour && valeur === null) { setErreur(LIBELLE_REFUS["valeur-invalide"]); return; }
    if (!grandeur) return;
    const a: AjustementQuantite = { objetId, grandeur, valeur, motif: motif.trim(), auteur, date: new Date().toISOString() };
    const refus = controlerAjustementQuantite(brut, a);
    if (refus) { setErreur(LIBELLE_REFUS[refus]); return; }
    const suivant = [...ajustements, a];
    setAjustements(suivant);
    surAjustements?.(suivant);
    setErreur(null); setSaisie(""); setMotif(""); setRetour(false);
  };

  return <section className="studio-quantites" aria-labelledby="studio-quantites-titre" data-studio-quantites={doc.id}>
    <h2 id="studio-quantites-titre">Quantités</h2>
    <p>Quantités brutes dérivées du dessin, en mètres (repère local). Arrondi à l’affichage seulement.</p>
    <p data-studio-quantites-deductions><strong>Déductions : non déclarées</strong> — aucune ouverture n’est déduite d’un recouvrement ; les quantités nettes ne sont pas évaluées.</p>
    {brut.cotesExclues > 0 && <p>{`${brut.cotesExclues} cote(s) exclue(s) du métré.`}</p>}
    {brut.nonPrisEnCharge > 0 && <p role="note" data-studio-quantites-inconnus>{`${brut.nonPrisEnCharge} objet(s) d’un type non pris en charge : non évalué(s).`}</p>}

    <div className="studio-quantites-filtres">
      <label>Calque
        <select value={filtre.calqueId ?? ""} onChange={(e) => setFiltre((f) => ({ ...f, calqueId: e.target.value || null }))} data-studio-quantites-filtre-calque>
          <option value="">Tous les calques</option>
          {brut.calques.map((c) => <option key={c.calqueId} value={c.calqueId} translate={c.implicite ? undefined : "no"}>{c.implicite ? "Calque par défaut" : c.nom}</option>)}
        </select>
      </label>
      <label>Nature
        <select value={filtre.nature ?? ""} onChange={(e) => setFiltre((f) => ({ ...f, nature: (e.target.value || null) as NatureQuantite | null }))} data-studio-quantites-filtre-nature>
          <option value="">Toutes les natures</option>
          {NATURES.map((n) => <option key={n} value={n}>{LIBELLE_NATURE[n]}</option>)}
        </select>
      </label>
      <label className="studio-quantites-case"><input type="checkbox" checked={filtre.masques} onChange={(e) => setFiltre((f) => ({ ...f, masques: e.target.checked }))} data-studio-quantites-filtre-masques /> Inclure les calques masqués</label>
      <label>Séparateur décimal (CSV)
        <select value={decimal} onChange={(e) => setDecimal(e.target.value as SeparateurDecimal)} data-studio-quantites-decimal>
          <option value=",">Virgule (,)</option>
          <option value=".">Point (.)</option>
        </select>
      </label>
      <a className="studio-quantites-bouton" href={lienCsv ?? undefined} aria-disabled={lienCsv ? undefined : true} download={nomFichierCsvQuantites(doc.id)} data-studio-quantites-csv>Exporter en CSV</a>
    </div>

    {vue.calques.length === 0 && <p role="status">Aucun objet à métrer.</p>}
    {vue.calques.map((c) => <div key={c.calqueId} className="studio-quantites-calque" data-studio-quantites-calque={c.calqueId} data-masque={c.masque || undefined}>
      <h3>{c.implicite ? "Calque par défaut" : <span translate="no">{c.nom}</span>}{c.masque && <> <span className="studio-quantites-masque">(calque masqué : compté)</span></>}</h3>
      <div className="studio-quantites-defile" tabIndex={0} role="region" aria-label="Tableau défilant des quantités">
        <table>
          <thead><tr><th scope="col">Objet</th><th scope="col">Nature</th>{grandeurs.map((g) => <th key={g} scope="col">{LIBELLE_GRANDEUR[g]} <span translate="no">({SYMBOLE_UNITE[UNITE_GRANDEUR[g]]})</span></th>)}</tr></thead>
          <tbody>
            {c.objets.length === 0 && <tr><td colSpan={2 + grandeurs.length}>Aucun objet.</td></tr>}
            {c.objets.map((o) => <tr key={o.objetId} data-studio-quantites-objet={o.objetId}>
              <th scope="row"><code translate="no">{o.objetId}</code></th>
              <td>{LIBELLE_NATURE[o.nature]}{o.nature === "non-pris-en-charge" && <> (<code translate="no">{o.type}</code>)</>}</td>
              {o.nature === "non-pris-en-charge"
                ? grandeurs.map((g) => <td key={g}><span className="studio-quantites-ne" data-non-evalue>{NON_EVALUE}</span></td>)
                : grandeurs.map((g) => <Cellule key={g} v={o.valeurs.find((v) => v.grandeur === g)} />)}
            </tr>)}
          </tbody>
          <tfoot><tr><th scope="row" colSpan={2}>Total du calque</th>{grandeurs.map((g) => <CelluleTotal key={g} t={c.totaux.find((t) => t.grandeur === g)} />)}</tr></tfoot>
        </table>
      </div>
    </div>)}
    {vue.calques.length > 0 && <div className="studio-quantites-defile" tabIndex={0} role="region" aria-label="Tableau défilant du total général" data-studio-quantites-total>
      <table>
        <thead><tr><td />{grandeurs.map((g) => <th key={g} scope="col">{LIBELLE_GRANDEUR[g]} <span translate="no">({SYMBOLE_UNITE[UNITE_GRANDEUR[g]]})</span></th>)}</tr></thead>
        <tbody><tr><th scope="row">Total général</th>{grandeurs.map((g) => <CelluleTotal key={g} t={vue.totaux.find((t) => t.grandeur === g)} />)}</tr></tbody>
      </table>
    </div>}

    <h3>Ajustements manuels</h3>
    <p>La valeur dérivée reste affichée ; l’ajustement s’y ajoute avec son motif, son auteur et sa date. Ajustements conservés dans cette session seulement : ils ne sont pas enregistrés avec la révision.</p>
    {!lectureSeule && <form className="studio-quantites-ajustement" onSubmit={ajouter} data-studio-quantites-ajustement>
      <fieldset disabled={!auteur || brut.objets.length === 0}>
        <legend>Nouvel ajustement</legend>
        <label>Objet
          <select required value={objetId} onChange={(e) => { setObjetId(e.target.value); setGrandeur(""); }}>
            <option value="">Choisir un objet</option>
            {brut.objets.filter((o) => o.valeurs.length).map((o) => <option key={o.objetId} value={o.objetId} translate="no">{o.objetId}</option>)}
          </select>
        </label>
        <label>Grandeur
          <select required value={grandeur} onChange={(e) => setGrandeur(e.target.value as GrandeurQuantite)}>
            <option value="">Choisir une grandeur</option>
            {grandeursObjet.map((g) => <option key={g} value={g}>{LIBELLE_GRANDEUR[g]}</option>)}
          </select>
        </label>
        <label className="studio-quantites-case"><input type="checkbox" checked={retour} onChange={(e) => setRetour(e.target.checked)} /> Revenir à la valeur dérivée</label>
        {!retour && <label>Valeur ajustée
          <input inputMode="decimal" required value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </label>}
        <label>Motif (obligatoire)
          <textarea required value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} />
        </label>
        {auteur ? <p>Auteur : <span translate="no">{auteur}</span></p> : <p role="note">Connectez-vous pour ajuster une quantité.</p>}
        {erreur && <p role="alert">{erreur}</p>}
        <button type="submit">Ajouter l’ajustement</button>
      </fieldset>
    </form>}
    {complet.journal.length === 0 ? <p>Aucun ajustement.</p>
      : <ol className="studio-quantites-journal" data-studio-quantites-journal>
        {complet.journal.map(({ ajustement: a, refus, enVigueur }, i) => <li key={i} data-en-vigueur={enVigueur || undefined}>
          <span translate="no">{new Date(a.date).toLocaleString(LOCALE)}</span> · <span translate="no">{a.auteur}</span> · <code translate="no">{a.objetId}</code> · {LIBELLE_GRANDEUR[a.grandeur]} · {a.valeur === null ? "retour à la valeur dérivée" : <span translate="no">{fmt(a.valeur)}</span>}
          {" · "}<em translate="no">{a.motif}</em>{" · "}{refus ? <span role="note">{`refusé : ${LIBELLE_REFUS[refus]}`}</span> : enVigueur ? "en vigueur" : "remplacé"}
        </li>)}
      </ol>}
  </section>;
}
