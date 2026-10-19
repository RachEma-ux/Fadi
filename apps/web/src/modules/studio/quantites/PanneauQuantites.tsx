/**
 * Panneau de quantités Studio (E.3-04 / E.3-05) : métré brut du dessin par calque et par objet, totaux, filtres, export
 * CSV, et journal des ajustements manuels. Les ajustements sont ENREGISTRÉS avec la variante (journal en ajout seul,
 * versionné, `api-quantites.ts`) : chacun garde sa cible (objet ou total d'un calque), sa valeur et son unité, son motif
 * (obligatoire), son auteur, sa date et la révision sur laquelle il a été saisi. La valeur brute n'est jamais effacée :
 * brute, ajustement (écart) et ajustée s'affichent ensemble. Un ajustement dont la cible a changé depuis sa révision est
 * « à revoir » : il n'est jamais appliqué en silence (`evaluerAjustementsQuantites`, modèle pur).
 * Le métré est une tâche de fond (`taches/`, D.1-01) : le métré précédent reste affiché pendant le calcul suivant ; la
 * saisie d'un ajustement attend le métré de la révision affichée, enregistrée et de tête.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appliquerAjustementsEnregistres, controlerSaisieAjustement, evaluerAjustementsQuantites, GRANDEUR_CUMULABLE, GRANDEURS_QUANTITE, quantitesStudio, UNITE_GRANDEUR,
  type AjustementQuantiteEnregistre, type EvaluationAjustementsQuantites, type GrandeurQuantite, type NatureQuantite, type QuantitesStudio, type StudioDocument,
  type TotalAjusteEnregistre, type ValeurAjusteeEnregistree,
} from "@parcours/atelier-model";
import { empreinteDe } from "../taches/empreinte";
import { MESSAGES_TACHE } from "../taches/messages";
import { useTache } from "../taches/useTache";
import { LOCALE } from "../../../lib/i18n";
import { useAuth } from "../../../lib/auth-context";
import { apiQuantites } from "./api-quantites";
import { csvQuantites, nomFichierCsvQuantites, type SeparateurDecimal } from "./csv-quantites";
import {
  FILTRE_INITIAL, filtrerQuantites, lienCsvExportable, formaterQuantite, LIBELLE_GRANDEUR, LIBELLE_MOTIF, LIBELLE_NATURE, LIBELLE_REFUS_ENREGISTRE, LIBELLE_REVUE,
  LIBELLE_STATUT_AJUSTEMENT, lireNombre, NON_EVALUE, SYMBOLE_UNITE, type FiltreQuantites,
} from "./quantites-vue";
import "./quantites.css";

export interface PanneauQuantitesProps {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Révision affichée (celle sur laquelle un ajustement est saisi). */
  revisionId: string;
  /** Brouillon courant : métré et statut des ajustements. */
  doc: StudioDocument;
  /** Lecture seule : métré, journal et export restent disponibles, la saisie d'ajustements est fermée. */
  lectureSeule: boolean;
  /** Des modifications ne sont pas enregistrées : un ajustement porte sur la révision enregistrée. */
  nonEnregistre: boolean;
}

const fmt = (v: number) => formaterQuantite(v, LOCALE);
const fmtEcart = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmt(Math.abs(v))}`;
const NATURES = Object.keys(LIBELLE_NATURE) as NatureQuantite[];
const auteurDe = (a: AjustementQuantiteEnregistre) => a.auteurEmail || a.auteur;

function Brute({ v }: { v: number | null }) {
  return v === null ? <span className="studio-quantites-ne" data-non-evalue>{NON_EVALUE}</span> : <span translate="no">{fmt(v)}</span>;
}

function Cellule({ v }: { v: ValeurAjusteeEnregistree | undefined }) {
  if (!v) return <td className="studio-quantites-sans" aria-label="sans objet">—</td>;
  const brute = v.derivee === null
    ? <span className="studio-quantites-ne" title={v.motif ? LIBELLE_MOTIF[v.motif] : undefined} data-non-evalue>{NON_EVALUE}</span>
    : <span translate="no">{fmt(v.derivee)}</span>;
  const revoir = v.aRevoir && <><br /><small className="studio-quantites-revoir" data-a-revoir={v.aRevoir.id} title={v.aRevoir.motif}>
    {v.aRevoir.valeur === null ? "à revoir : retour à la valeur brute proposé, non appliqué" : `à revoir : ${fmt(v.aRevoir.valeur)} proposé, non appliqué`}
  </small></>;
  if (v.ajustee === undefined) return <td data-grandeur={v.grandeur} data-retour={v.enregistre ? true : undefined}>{brute}{revoir}</td>;
  return <td data-grandeur={v.grandeur} data-ajustee title={v.ajustement?.motif}>
    <span className="studio-quantites-derivee">brute {brute}</span>
    <br /><span className="studio-quantites-ecart" data-ecart>ajustement {v.ecart === null || v.ecart === undefined ? <span className="studio-quantites-ne">{NON_EVALUE}</span> : <span translate="no">{fmtEcart(v.ecart)}</span>}</span>
    <br /><strong>ajustée <span translate="no">{fmt(v.ajustee)}</span></strong>{revoir}
  </td>;
}

function CelluleTotal({ t }: { t: TotalAjusteEnregistre | undefined }) {
  if (!t) return <td className="studio-quantites-sans">—</td>;
  return <td data-grandeur={t.grandeur} data-total-ajuste={t.ajusteeCalque !== undefined || undefined}>
    {t.retenue === null ? <span className="studio-quantites-ne">{NON_EVALUE}</span> : <strong translate="no">{fmt(t.retenue)}</strong>}
    {t.ajustes > 0 && <><br /><small>brute <Brute v={t.valeur} /></small></>}
    {t.ecart !== undefined && t.ecart !== null && t.ecart !== 0 && <><br /><small data-ecart>ajustement <span translate="no">{fmtEcart(t.ecart)}</span></small></>}
    {t.ajusteeCalque !== undefined && <><br /><small title={t.ajustementCalque?.motif}>total du calque ajusté</small></>}
    {t.aRevoirCalque && <><br /><small className="studio-quantites-revoir" data-a-revoir={t.aRevoirCalque.id} title={t.aRevoirCalque.motif}>à revoir : total du calque proposé, non appliqué</small></>}
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

const EVALUATION_VIDE: EvaluationAjustementsQuantites = { journal: [], objets: [], calques: [], aRevoir: [] };

export function PanneauQuantites({ projectId, studyId, variantId, revisionId, doc, lectureSeule, nonEnregistre }: PanneauQuantitesProps) {
  const { user } = useAuth();
  const auteur = user ? (user.displayName?.trim() || user.email) : "";
  const client = useQueryClient();
  const cle = ["studio-ajustements-quantites", projectId, studyId, variantId] as const;
  const lecture = useQuery({ queryKey: cle, queryFn: () => apiQuantites.lire(projectId, studyId, variantId), retry: false });
  const journal = useMemo(() => lecture.data?.ajustements ?? [], [lecture.data]);
  const [filtre, setFiltre] = useState<FiltreQuantites>(FILTRE_INITIAL);
  const [decimal, setDecimal] = useState<SeparateurDecimal>(",");
  const empreinte = empreinteDe(doc);
  const metre = useTache<{ document: StudioDocument }, QuantitesStudio>(
    { cle: "studio.quantites", classe: "fond", nature: "quantites.calculer", charge: { document: doc }, empreinte },
    { initial: () => quantitesStudio(doc) },
  );
  const brut = useMemo<QuantitesStudio>(() => metre.valeur ?? {
    documentId: doc.id, unites: "m", repere: "local-2d", deductions: "non-declarees", calques: [], objets: [], totaux: [], cotesExclues: 0, nonPrisEnCharge: 0,
  }, [metre.valeur, doc.id]);
  const aJour = metre.valeur !== undefined && metre.revision === empreinte.revision;
  // Statuts évalués sur le document dont le métré est issu : pendant un calcul, l'évaluation précédente reste affichée.
  const derniere = useRef<EvaluationAjustementsQuantites>(EVALUATION_VIDE);
  const evaluation = useMemo(() => {
    if (aJour) derniere.current = evaluerAjustementsQuantites(doc, brut, journal);
    return derniere.current;
  }, [aJour, doc, brut, journal]);
  const vue = useMemo(() => appliquerAjustementsEnregistres(filtrerQuantites(brut, filtre), evaluation, { calques: filtre.nature === null }), [brut, filtre, evaluation]);
  const csv = useMemo(() => csvQuantites(vue, { decimal }), [vue, decimal]);
  const lienCsv = lienCsvExportable(useLienCsv(csv), aJour);
  const grandeurs = GRANDEURS_QUANTITE.filter((g) => brut.objets.some((o) => o.valeurs.some((v) => v.grandeur === g)));

  // Formulaire d'ajustement.
  const [typeCible, setTypeCible] = useState<"objet" | "calque">("objet");
  const [cibleId, setCibleId] = useState("");
  const [grandeur, setGrandeur] = useState<GrandeurQuantite | "">("");
  const [saisie, setSaisie] = useState("");
  const [retour, setRetour] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [occupe, setOccupe] = useState(false);
  const grandeursCible = typeCible === "objet"
    ? brut.objets.find((o) => o.objetId === cibleId)?.valeurs.map((v) => v.grandeur) ?? []
    : brut.calques.find((c) => c.calqueId === cibleId)?.totaux.map((t) => t.grandeur).filter((g) => GRANDEUR_CUMULABLE[g]) ?? [];
  const tete = lecture.data?.headRevisionId;
  const peutSaisir = !!auteur && aJour && !nonEnregistre && !!lecture.data?.peutAjuster && tete === revisionId && brut.objets.length > 0 && !occupe;
  const ajouter = async (e: FormEvent) => {
    e.preventDefault();
    if (!grandeur || !lecture.data) return;
    const valeur = retour ? null : lireNombre(saisie);
    if (!retour && valeur === null) { setErreur(LIBELLE_REFUS_ENREGISTRE["valeur-invalide"]); return; }
    const s = { cible: { type: typeCible, id: cibleId }, grandeur, unite: UNITE_GRANDEUR[grandeur], valeur, motif: motif.trim() };
    const refus = controlerSaisieAjustement(doc, brut, s);
    if (refus) { setErreur(LIBELLE_REFUS_ENREGISTRE[refus]); return; }
    setOccupe(true); setErreur(null); setMessage("");
    try {
      await apiQuantites.ajuster(projectId, studyId, variantId, { ...s, baseSequence: lecture.data.sequence, revisionId, requestId: crypto.randomUUID() });
      setSaisie(""); setMotif(""); setRetour(false);
      setMessage("Ajustement enregistré.");
    } catch (x) {
      setErreur(x instanceof Error ? x.message : String(x));
    } finally {
      setOccupe(false);
      await client.invalidateQueries({ queryKey: cle });
    }
  };

  return <section className="studio-quantites" aria-labelledby="studio-quantites-titre" data-studio-quantites={doc.id} data-studio-quantites-etat={metre.etat}>
    <h2 id="studio-quantites-titre">Quantités</h2>
    <p>Quantités brutes dérivées du dessin, en mètres (repère local). Arrondi à l’affichage seulement.</p>
    {metre.message && <p role="alert" data-studio-quantites-erreur>{metre.message}</p>}
    {metre.valeur === undefined ? <p role="status">{MESSAGES_TACHE.enCours}</p> : brut.deductions === "ouvertures-declarees"
      ? <p data-studio-quantites-deductions="ouvertures-declarees"><strong>Déductions : ouvertures déclarées seulement</strong> — chaque mur architectural déduit les ouvertures créées dans ce mur (volume net) ; rien n’est déduit d’un recouvrement.</p>
      : <p data-studio-quantites-deductions><strong>Déductions : non déclarées</strong> — aucune ouverture n’est déduite d’un recouvrement ; les quantités nettes ne sont pas évaluées.</p>}
    {brut.cotesExclues > 0 && <p>{`${brut.cotesExclues} cote(s) exclue(s) du métré.`}</p>}
    {brut.nonPrisEnCharge > 0 && <p role="note" data-studio-quantites-inconnus>{`${brut.nonPrisEnCharge} objet(s) d’un type non pris en charge : non évalué(s).`}</p>}
    {evaluation.aRevoir.length > 0 && <p role="note" className="studio-quantites-revoir" data-studio-quantites-a-revoir={evaluation.aRevoir.length}>
      {`${evaluation.aRevoir.length} ajustement(s) à revoir : leur cible a changé depuis leur révision ; ils ne sont pas appliqués.`}
    </p>}

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
    {!vue.calquesAppliques && evaluation.calques.length > 0 && <p role="note">Filtre par nature : les totaux de calque ajustés ne s’appliquent qu’au calque entier ; ils ne sont pas repris dans cette vue.</p>}

    {metre.valeur !== undefined && vue.calques.length === 0 && <p role="status">Aucun objet à métrer.</p>}
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
          <tfoot><tr data-studio-quantites-total-calque={c.calqueId}><th scope="row" colSpan={2}>Total du calque</th>{grandeurs.map((g) => <CelluleTotal key={g} t={c.totaux.find((t) => t.grandeur === g)} />)}</tr></tfoot>
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
    <p>La quantité brute n’est jamais remplacée : brute, ajustement et ajustée s’affichent ensemble. Chaque ajustement est enregistré avec la variante (journal versionné, jamais réécrit), avec son motif, son auteur, sa date et sa révision ; si sa cible change ensuite, il est « à revoir » et n’est plus appliqué.</p>
    {lecture.isError && <p role="alert">{lecture.error instanceof Error ? lecture.error.message : String(lecture.error)}</p>}
    {!lectureSeule && <form className="studio-quantites-ajustement" onSubmit={(e) => void ajouter(e)} data-studio-quantites-ajustement>
      <fieldset disabled={!peutSaisir}>
        <legend>Nouvel ajustement</legend>
        {nonEnregistre && <p role="note">Enregistrez d’abord les modifications : un ajustement porte sur la révision enregistrée.</p>}
        {lecture.data && !lecture.data.peutAjuster && <p role="note">Ajustements réservés aux personnes qui peuvent modifier cette variante active.</p>}
        <label>Cible
          <select value={typeCible} onChange={(e) => { setTypeCible(e.target.value as "objet" | "calque"); setCibleId(""); setGrandeur(""); }} data-studio-quantites-type-cible>
            <option value="objet">Un objet</option>
            <option value="calque">Le total d’un calque</option>
          </select>
        </label>
        {typeCible === "objet" ? <label>Objet
          <select required value={cibleId} onChange={(e) => { setCibleId(e.target.value); setGrandeur(""); }} data-studio-quantites-cible>
            <option value="">Choisir un objet</option>
            {brut.objets.filter((o) => o.valeurs.length).map((o) => <option key={o.objetId} value={o.objetId} translate="no">{o.objetId}</option>)}
          </select>
        </label> : <label>Calque
          <select required value={cibleId} onChange={(e) => { setCibleId(e.target.value); setGrandeur(""); }} data-studio-quantites-cible>
            <option value="">Choisir un calque</option>
            {brut.calques.filter((c) => c.totaux.length).map((c) => <option key={c.calqueId} value={c.calqueId} translate={c.implicite ? undefined : "no"}>{c.implicite ? "Calque par défaut" : c.nom}</option>)}
          </select>
        </label>}
        <label>Grandeur
          <select required value={grandeur} onChange={(e) => setGrandeur(e.target.value as GrandeurQuantite)} data-studio-quantites-grandeur>
            <option value="">Choisir une grandeur</option>
            {grandeursCible.map((g) => <option key={g} value={g}>{LIBELLE_GRANDEUR[g]}</option>)}
          </select>
        </label>
        <label className="studio-quantites-case"><input type="checkbox" checked={retour} onChange={(e) => setRetour(e.target.checked)} /> Revenir à la valeur brute</label>
        {!retour && <label>{"Valeur ajustée"}{grandeur && <> <span translate="no">({SYMBOLE_UNITE[UNITE_GRANDEUR[grandeur]]})</span></>}
          <input inputMode="decimal" required value={saisie} onChange={(e) => setSaisie(e.target.value)} data-studio-quantites-valeur />
        </label>}
        <label>Motif (obligatoire)
          <textarea required value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} data-studio-quantites-motif />
        </label>
        {auteur ? <p>Auteur : <span translate="no">{auteur}</span></p> : <p role="note">Connectez-vous pour ajuster une quantité.</p>}
        {erreur && <p role="alert">{erreur}</p>}
        {message && <p role="status">{message}</p>}
        <button type="submit" data-studio-quantites-ajouter>Enregistrer l’ajustement</button>
      </fieldset>
    </form>}
    {lecture.isPending ? <p role="status">Chargement du journal des ajustements…</p> : evaluation.journal.length === 0 ? <p>Aucun ajustement.</p>
      : <ol className="studio-quantites-journal" data-studio-quantites-journal>
        {evaluation.journal.map(({ ajustement: a, statut, revue }) => <li key={a.id} data-sequence={a.sequence} data-statut={statut} data-en-vigueur={statut === "en-vigueur" || undefined}>
          <span translate="no">{`n° ${a.sequence}`}</span> · <span translate="no">{new Date(a.date).toLocaleString(LOCALE)}</span> · <span translate="no">{auteurDe(a)}</span>
          {" · "}{a.cible.type === "objet" ? <code translate="no">{a.cible.id}</code> : <>{"total du calque "}<code translate="no">{a.cible.id}</code></>}
          {" · "}{LIBELLE_GRANDEUR[a.grandeur]}
          {" · brute "}{a.derivee === null ? NON_EVALUE : <span translate="no">{fmt(a.derivee)}</span>}
          {" → "}{a.valeur === null ? "retour à la valeur brute" : <span translate="no">{`${fmt(a.valeur)} ${SYMBOLE_UNITE[a.unite]}`}</span>}
          {" · "}<em translate="no">{a.motif}</em>
          {" · révision "}<code translate="no">{a.revisionId}</code>
          {" · "}<strong className={statut === "a-revoir" ? "studio-quantites-revoir" : undefined}>{LIBELLE_STATUT_AJUSTEMENT[statut]}</strong>
          {revue && <>{" — "}<span role="note">{LIBELLE_REVUE[revue]}</span></>}
        </li>)}
      </ol>}
  </section>;
}
