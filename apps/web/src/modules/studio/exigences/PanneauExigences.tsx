/**
 * Panneau « Propriétés et exigences » de Studio (E.1-01 à E.1-06).
 *
 * - Propriétés BIM de l'objet choisi (mur, ouverture, objet extrudé) : liste des propriétés déclarées, saisie (nom,
 *   valeur nombre / texte / non évaluée, unité, source) par `studio.propriete.definir` (K), retrait par
 *   `studio.propriete.retirer` (G) ; ajoutées au brouillon comme toute commande, enregistrées avec la révision.
 * - Exigences de l'étude : jeu versionné rangé par le serveur, à part du dessin ; toute modification crée la version
 *   suivante (les versions passées restent lisibles). Aucune exigence n'est fournie. Une exigence reprise d'une
 *   référence partenaire n'est utilisée qu'acceptée (qui, quand), par le propriétaire du projet.
 * - Contrôles : « Contrôler la révision affichée » enregistre le résultat calculé, lié à la révision et à la version
 *   examinées ; l'état d'exécution (exécuté / non exécuté / erreur) est affiché à part de la conclusion. Un aperçu sur le
 *   brouillon (non enregistré) est calculé localement. Rien n'est jamais réécrit dans l'exigence ni dans le dessin.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { controlerExigences, proprietesDe, type EcartExigence, type ExigenceStudio, type ResultatControle, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { LIBELLE_GRANDEUR, LIBELLE_NATURE } from "../quantites/quantites-vue";
import { apiExigences, type ControleLu } from "./api-exigences";
import {
  COMPARAISONS, commandePropriete, commandeRetrait, exigenceDe, GRANDEURS, LIBELLE_COMPARAISON, LIBELLE_CONCLUSION, LIBELLE_EXECUTION, LIBELLE_MOTIF_EXECUTION,
  LIBELLE_MOTIF_EXIGENCE, LIBELLE_STATUT, LIBELLE_TYPE_METRIQUE, libelleMetrique, listeSans, listeSuivante, NON_EVALUEE, SAISIE_EXIGENCE_VIDE, SAISIE_PROPRIETE_VIDE,
  saisieDe, uniteAffichee, uniteImposee, valeurAffichee, type SaisieExigence, type SaisiePropriete, type TypeValeur,
} from "./exigences-ui";
import "./exigences.css";

export interface PanneauExigencesProps {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Révision affichée (celle qu'un contrôle examine). */
  revisionId: string;
  /** Brouillon courant (propriétés et aperçu). */
  doc: StudioDocument;
  /** Objet porteur de propriétés choisi, ou null. */
  cibleId: string | null;
  /** Brouillon modifiable (propriétés). */
  modifiable: boolean;
  /** Droit d'écriture du serveur sur la variante affichée (exigences et contrôles) ; faux sur une révision historique. */
  ecriture: boolean;
  /** Des modifications ne sont pas enregistrées : un contrôle porte sur la révision enregistrée. */
  nonEnregistre: boolean;
  surCommandes: (cs: StudioCommand[]) => boolean;
  surErreur: (message: string) => void;
}

const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const court = (id: string) => id.slice(-8);
const date = (iso: string) => new Date(iso).toLocaleString(LOCALE);

function TableEcarts({ ecarts, exigences }: { ecarts: readonly EcartExigence[]; exigences: readonly ExigenceStudio[] }) {
  if (!ecarts.length) return null;
  return <div className="studio-exigences-defile" tabIndex={0} role="region" aria-label="Tableau défilant des écarts">
    <table data-studio-ecarts>
      <thead><tr><th scope="col">Exigence</th><th scope="col">Exigé</th><th scope="col">Mesuré</th><th scope="col">Écart</th><th scope="col">Statut</th></tr></thead>
      <tbody>{ecarts.map((x) => {
        const e = exigences.find((y) => y.id === x.exigenceId);
        return <tr key={x.exigenceId} data-studio-ecart={x.exigenceId} data-statut={x.statut}>
          <th scope="row">{e ? <span translate="no">{e.libelle}</span> : <code translate="no">{x.exigenceId}</code>}</th>
          <td>{`${LIBELLE_COMPARAISON[x.comparaison]} `}<span translate="no">{nombre(x.valeurExigee)}</span>{` ${uniteAffichee(x.unite)}`}</td>
          <td>{x.mesure?.valeur === null || x.mesure === undefined
            ? <span className="studio-exigences-ne">{NON_EVALUEE}{x.mesure?.motif ? ` (${LIBELLE_MOTIF_EXIGENCE[x.mesure.motif]})` : ""}</span>
            : <><span translate="no">{nombre(x.mesure.valeur)}</span>{` ${uniteAffichee(x.mesure.unite)}`}</>}</td>
          <td>{x.ecart === undefined || x.ecart === null ? "—" : <span translate="no">{`${x.ecart > 0 ? "+" : ""}${nombre(x.ecart)}`}</span>}</td>
          <td><strong>{LIBELLE_STATUT[x.statut]}</strong></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/** État d'exécution puis, seulement s'il a tourné, conclusion : deux informations distinctes. */
function EtatControle({ r }: { r: Pick<ResultatControle, "execution" | "conclusion" | "motifExecution" | "messageErreur"> }) {
  return <p className="studio-exigences-etat">
    <span data-studio-execution={r.execution}>{`Exécution : ${LIBELLE_EXECUTION[r.execution]}`}</span>
    {r.motifExecution && <>{" — "}<span>{LIBELLE_MOTIF_EXECUTION[r.motifExecution]}</span></>}
    {r.messageErreur && <>{" — "}<code translate="no">{r.messageErreur}</code></>}
    {" · "}
    <span data-studio-conclusion={r.conclusion ?? "aucune"}>{r.conclusion ? `Conclusion : ${LIBELLE_CONCLUSION[r.conclusion]}` : "Aucune conclusion (contrôle non exécuté)"}</span>
  </p>;
}

function Proprietes({ doc, cibleId, modifiable, surCommandes, surErreur }: Pick<PanneauExigencesProps, "doc" | "cibleId" | "modifiable" | "surCommandes" | "surErreur">) {
  const [saisie, setSaisie] = useState<SaisiePropriete>(SAISIE_PROPRIETE_VIDE);
  const liste = cibleId ? proprietesDe(doc.proprietes, cibleId) : [];
  const maj = (k: keyof SaisiePropriete, v: string) => setSaisie((s) => ({ ...s, [k]: v }));
  function declarer(e?: FormEvent) {
    e?.preventDefault();
    const r = commandePropriete(cibleId, saisie);
    if ("erreur" in r) { surErreur(r.erreur); return; }
    if (surCommandes(r.commandes)) setSaisie(SAISIE_PROPRIETE_VIDE);
  }
  function retirer(nom: string) {
    const r = commandeRetrait(cibleId, nom, doc);
    if ("erreur" in r) { surErreur(r.erreur); return; }
    surCommandes(r.commandes);
  }
  return <div className="studio-exigences-bloc" data-studio-proprietes-bim={cibleId ?? ""}>
    <h3>Propriétés BIM</h3>
    {!cibleId ? <p>Sélectionnez un mur, une ouverture ou un objet extrudé pour voir ou déclarer ses propriétés.</p> : <>
      <p>{"Objet "}<code translate="no">{cibleId}</code>{" — une valeur absente reste « non évaluée » ; rien n’est rempli à votre place."}</p>
      {liste.length === 0 ? <p data-studio-proprietes-vide>Aucune propriété déclarée.</p>
        : <ul className="studio-exigences-liste" data-studio-proprietes-liste>{liste.map((p) => <li key={p.nom} data-studio-propriete={p.nom}>
          <strong translate="no">{p.nom}</strong>{" : "}
          {p.valeur === undefined ? <span className="studio-exigences-ne">{NON_EVALUEE}</span> : <span translate="no">{valeurAffichee(p, LOCALE)}</span>}
          {p.source && <>{" — source : "}<span translate="no">{p.source}</span></>}
          {modifiable && <> <button type="button" className="studio-exigences-bouton" onClick={() => retirer(p.nom)} data-studio-propriete-retirer={p.nom}>Retirer</button></>}
        </li>)}</ul>}
      {modifiable && <form className="studio-exigences-formulaire" onSubmit={declarer} data-studio-propriete-formulaire>
        <label>Nom de la propriété<input value={saisie.nom} onChange={(e) => maj("nom", e.target.value)} data-studio-champ-propriete="nom" /></label>
        <label>Valeur<select value={saisie.type} onChange={(e) => maj("type", e.target.value as TypeValeur)} data-studio-champ-propriete="type">
          <option value="non-evaluee">Non évaluée</option><option value="nombre">Nombre</option><option value="texte">Texte</option>
        </select></label>
        {saisie.type !== "non-evaluee" && <label>Valeur saisie<input value={saisie.valeur} onChange={(e) => maj("valeur", e.target.value)} inputMode={saisie.type === "nombre" ? "decimal" : undefined} data-studio-champ-propriete="valeur" /></label>}
        <label>Unité<input value={saisie.unite} onChange={(e) => maj("unite", e.target.value)} data-studio-champ-propriete="unite" /></label>
        <label>Source (facultative)<input value={saisie.source} onChange={(e) => maj("source", e.target.value)} data-studio-champ-propriete="source" /></label>
        <div className="studio-exigences-actions">
          <button type="submit" className="studio-exigences-bouton" data-studio-propriete-action="studio.propriete.definir"><Icon name="studio-property-set" size={16} /> Déclarer la propriété</button>
          <button type="button" className="studio-exigences-bouton" onClick={() => retirer(saisie.nom)} data-studio-propriete-action="studio.propriete.retirer"><Icon name="studio-property-remove" size={16} /> Retirer la propriété nommée</button>
        </div>
      </form>}
    </>}
  </div>;
}

function FormulaireExigence({ saisie, setSaisie, surValider, surAnnuler, edition }: { saisie: SaisieExigence; setSaisie: (f: (s: SaisieExigence) => SaisieExigence) => void; surValider: (e: FormEvent) => void; surAnnuler: () => void; edition: boolean }) {
  const maj = (k: keyof SaisieExigence, v: string) => setSaisie((s) => ({ ...s, [k]: v }));
  const imposee = uniteImposee(saisie);
  return <form className="studio-exigences-formulaire" onSubmit={surValider} data-studio-exigence-formulaire={edition ? "edition" : "creation"}>
    <label>Libellé<input value={saisie.libelle} onChange={(e) => maj("libelle", e.target.value)} data-studio-champ-exigence="libelle" /></label>
    <label>Métrique<select value={saisie.type} onChange={(e) => maj("type", e.target.value)} data-studio-champ-exigence="type">
      {(Object.keys(LIBELLE_TYPE_METRIQUE) as (keyof typeof LIBELLE_TYPE_METRIQUE)[]).map((t) => <option key={t} value={t}>{LIBELLE_TYPE_METRIQUE[t]}</option>)}
    </select></label>
    {(saisie.type === "total" || saisie.type === "objet") && <label>Grandeur<select value={saisie.grandeur} onChange={(e) => maj("grandeur", e.target.value)} data-studio-champ-exigence="grandeur">
      <option value="">Choisir…</option>{GRANDEURS.map((g) => <option key={g} value={g}>{LIBELLE_GRANDEUR[g]}</option>)}
    </select></label>}
    {saisie.type === "objet" && <label>Objet (identifiant)<input value={saisie.objetId} onChange={(e) => maj("objetId", e.target.value)} data-studio-champ-exigence="objetId" /></label>}
    {saisie.type === "nombre" && <label>Nature (facultative)<select value={saisie.nature} onChange={(e) => maj("nature", e.target.value)} data-studio-champ-exigence="nature">
      <option value="">Tous les objets métrés</option>{(Object.keys(LIBELLE_NATURE) as (keyof typeof LIBELLE_NATURE)[]).map((n) => <option key={n} value={n}>{LIBELLE_NATURE[n]}</option>)}
    </select></label>}
    {(saisie.type === "total" || saisie.type === "nombre") && <label>Calque (identifiant, facultatif)<input value={saisie.calqueId} onChange={(e) => maj("calqueId", e.target.value)} data-studio-champ-exigence="calqueId" /></label>}
    {saisie.type === "propriete" && <>
      <label>Objet (identifiant)<input value={saisie.cibleId} onChange={(e) => maj("cibleId", e.target.value)} data-studio-champ-exigence="cibleId" /></label>
      <label>Nom de la propriété<input value={saisie.nom} onChange={(e) => maj("nom", e.target.value)} data-studio-champ-exigence="nom" /></label>
    </>}
    <label>Comparaison<select value={saisie.comparaison} onChange={(e) => maj("comparaison", e.target.value)} data-studio-champ-exigence="comparaison">
      <option value="">Choisir…</option>{COMPARAISONS.map((c) => <option key={c} value={c}>{LIBELLE_COMPARAISON[c]}</option>)}
    </select></label>
    <label>Valeur exigée<input value={saisie.valeur} inputMode="decimal" onChange={(e) => maj("valeur", e.target.value)} data-studio-champ-exigence="valeur" /></label>
    {saisie.comparaison === "=" && <label>Tolérance (facultative)<input value={saisie.tolerance} inputMode="decimal" onChange={(e) => maj("tolerance", e.target.value)} data-studio-champ-exigence="tolerance" /></label>}
    {imposee !== null ? <p className="studio-exigences-unite">{"Unité de la métrique : "}<strong>{uniteAffichee(imposee)}</strong></p>
      : <label>Unité<input value={saisie.unite} onChange={(e) => maj("unite", e.target.value)} data-studio-champ-exigence="unite" /></label>}
    <label>Source déclarée<input value={saisie.source} onChange={(e) => maj("source", e.target.value)} data-studio-champ-exigence="source" /></label>
    <label>Référence partenaire (facultative)<input value={saisie.reference} onChange={(e) => maj("reference", e.target.value)} data-studio-champ-exigence="reference" /></label>
    <div className="studio-exigences-actions">
      <button type="submit" className="studio-exigences-bouton" data-studio-exigence-valider>{edition ? "Enregistrer une nouvelle version" : "Ajouter l’exigence (nouvelle version)"}</button>
      {edition && <button type="button" className="studio-exigences-bouton" onClick={surAnnuler}>Annuler la modification</button>}
    </div>
  </form>;
}

function Controle({ c, exigences, ouvert }: { c: ControleLu; exigences: readonly ExigenceStudio[]; ouvert: boolean }) {
  return <li data-studio-controle={c.id} data-studio-controle-version={c.version ?? "aucune"} data-studio-controle-revision={c.revisionId}>
    <details open={ouvert}>
      <summary>
        {"Révision "}<code translate="no">{court(c.revisionId)}</code>{" · "}
        {c.version === null ? "aucun jeu" : `exigences v${c.version}`}{" · "}{date(c.creeLe)}{c.auteurEmail ? <>{" · "}<span translate="no">{c.auteurEmail}</span></> : null}
      </summary>
      <EtatControle r={c.resultat} />
      <TableEcarts ecarts={c.resultat.ecarts} exigences={exigences} />
    </details>
  </li>;
}

export function PanneauExigences(props: PanneauExigencesProps) {
  const { projectId, studyId, variantId, revisionId, doc, ecriture, nonEnregistre, surErreur } = props;
  const client = useQueryClient();
  const cleJeu = ["studio-exigences", projectId, studyId] as const;
  const cleControles = ["studio-controles", projectId, studyId, variantId] as const;
  const jeu = useQuery({ queryKey: cleJeu, queryFn: () => apiExigences.lire(projectId, studyId), retry: false });
  const controles = useQuery({ queryKey: cleControles, queryFn: () => apiExigences.controles(projectId, studyId, variantId), retry: false });
  const [saisie, setSaisie] = useState<SaisieExigence>(SAISIE_EXIGENCE_VIDE);
  const [editee, setEditee] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState("");
  const courante = jeu.data?.courante ?? null;
  const exigences = courante?.exigences ?? [];
  const apercu = useMemo(() => (courante ? controlerExigences(studyId, "brouillon", doc, courante) : null), [courante, doc, studyId]);

  async function envoyer<T>(action: () => Promise<T>, ok: string): Promise<T | null> {
    setOccupe(true); setMessage("");
    try {
      const r = await action();
      setMessage(ok);
      return r;
    } catch (e) {
      surErreur(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setOccupe(false);
      await client.invalidateQueries({ queryKey: cleJeu });
      await client.invalidateQueries({ queryKey: cleControles });
    }
  }
  async function enregistrer(liste: ExigenceStudio[], ok: string) {
    const r = await envoyer(() => apiExigences.enregistrer(projectId, studyId, { baseVersion: courante?.version ?? 0, exigences: liste, requestId: crypto.randomUUID() }), ok);
    if (r) { setSaisie(SAISIE_EXIGENCE_VIDE); setEditee(null); }
  }
  function valider(e: FormEvent) {
    e.preventDefault();
    const r = exigenceDe(saisie, editee ?? `exigence-${crypto.randomUUID()}`);
    if ("erreur" in r) { surErreur(r.erreur); return; }
    void enregistrer(listeSuivante(exigences, r.exigence), "Nouvelle version du jeu d’exigences enregistrée.");
  }
  const versionSuivante = (courante?.version ?? 0) + 1;

  return <section className="studio-exigences" aria-labelledby="studio-exigences-titre" data-studio-exigences={studyId} tabIndex={-1}>
    <h2 id="studio-exigences-titre"><Icon name="studio-requirements" size={18} /> Propriétés et exigences</h2>
    <Proprietes {...props} />

    <div className="studio-exigences-bloc">
      <h3>Exigences de l’étude</h3>
      <p>Les exigences sont rangées à part du dessin et versionnées : chaque modification crée une nouvelle version, les précédentes restent consultables. Aucune exigence n’est fournie par Fadi.</p>
      {jeu.isLoading && <p role="status">Chargement des exigences…</p>}
      {jeu.isError && <p className="studio-exigences-ne" role="status">Exigences indisponibles.</p>}
      {jeu.data && (courante === null
        ? <p data-studio-exigences-vide>Aucun jeu d’exigences : saisissez la première exigence pour créer la version 1.</p>
        : <>
          <p data-studio-exigences-version={courante.version}>{`Version courante : v${courante.version} — ${date(courante.creeLe)}`}{courante.auteurEmail ? <>{" · "}<span translate="no">{courante.auteurEmail}</span></> : null}</p>
          {exigences.length === 0 ? <p>Cette version ne contient aucune exigence.</p>
            : <ul className="studio-exigences-liste" data-studio-exigences-liste>{exigences.map((x) => <li key={x.id} data-studio-exigence={x.id}>
              <strong translate="no">{x.libelle}</strong>{" — "}<span>{libelleMetrique(x.metrique)}</span>{` ${LIBELLE_COMPARAISON[x.comparaison]} `}<span translate="no">{nombre(x.valeur)}</span>{` ${uniteAffichee(x.unite)}`}
              {x.tolerance !== undefined && <>{" ± "}<span translate="no">{nombre(x.tolerance)}</span></>}
              <br /><small>{"Source : "}<span translate="no">{x.source}</span></small>
              {x.origine && <><br /><small data-studio-exigence-reference={x.origine.acceptation ? "acceptee" : "non-acceptee"}>{"Référence partenaire : "}<span translate="no">{x.origine.reference}</span>{" — "}
                {x.origine.acceptation ? `acceptée par ${x.origine.acceptation.parEmail ?? x.origine.acceptation.par} le ${date(x.origine.acceptation.le)}` : "non acceptée : non utilisée par les contrôles"}</small></>}
              {ecriture && <div className="studio-exigences-actions">
                <button type="button" className="studio-exigences-bouton" disabled={occupe} onClick={() => { setEditee(x.id); setSaisie(saisieDe(x)); }} data-studio-exigence-modifier={x.id}>Modifier</button>
                <button type="button" className="studio-exigences-bouton" disabled={occupe} onClick={() => void enregistrer(listeSans(exigences, x.id), "Exigence retirée : nouvelle version enregistrée.")} data-studio-exigence-retirer={x.id}>Retirer</button>
                {x.origine && !x.origine.acceptation && jeu.data.peutAccepter === true && <button type="button" className="studio-exigences-bouton" disabled={occupe}
                  onClick={() => void envoyer(() => apiExigences.accepter(projectId, studyId, { baseVersion: courante.version, exigenceId: x.id, requestId: crypto.randomUUID() }), "Référence partenaire acceptée : nouvelle version enregistrée.")}
                  data-studio-exigence-accepter={x.id}>Accepter la référence (propriétaire)</button>}
              </div>}
            </li>)}</ul>}
          {jeu.data.versions.length > 1 && <details data-studio-exigences-versions><summary>{`Versions (${jeu.data.versions.length})`}</summary>
            <ol reversed>{jeu.data.versions.map((v) => <li key={v.version}>{`v${v.version} — ${v.nombre} exigence(s) — ${date(v.creeLe)}`}{v.motif ? <>{" — "}<span translate="no">{v.motif}</span></> : null}</li>)}</ol>
          </details>}
        </>)}
      {ecriture && jeu.data && <FormulaireExigence saisie={saisie} setSaisie={setSaisie} surValider={valider} edition={editee !== null} surAnnuler={() => { setEditee(null); setSaisie(SAISIE_EXIGENCE_VIDE); }} />}
      {ecriture && jeu.data && <p className="studio-exigences-unite">{`L’enregistrement créera la version v${versionSuivante}.`}</p>}
    </div>

    <div className="studio-exigences-bloc">
      <h3>Écarts</h3>
      {apercu && <div data-studio-ecarts-apercu>
        <h4>Aperçu sur le brouillon (non enregistré)</h4>
        <EtatControle r={apercu} />
        <TableEcarts ecarts={apercu.ecarts} exigences={exigences} />
      </div>}
      {ecriture && <div className="studio-exigences-actions">
        <button type="button" className="studio-exigences-bouton" disabled={occupe}
          onClick={() => void envoyer(() => apiExigences.controler(projectId, studyId, variantId, { revisionId, ...(courante ? { version: courante.version } : {}), requestId: crypto.randomUUID() }), "Contrôle enregistré.")}
          data-studio-controler>{`Contrôler la révision affichée${courante ? ` (exigences v${courante.version})` : ""}`}</button>
      </div>}
      {nonEnregistre && <p className="studio-exigences-unite">Le contrôle porte sur la révision enregistrée affichée, pas sur les modifications non enregistrées.</p>}
      {message && <p role="status" className="studio-exigences-message">{message}</p>}
      <h4>Contrôles enregistrés</h4>
      {controles.data && (controles.data.controles.length === 0 ? <p data-studio-controles-vide>Aucun contrôle enregistré.</p>
        : <ol className="studio-exigences-controles" data-studio-controles>{controles.data.controles.map((c, i) => <Controle key={c.id} c={c} ouvert={i === 0}
          exigences={c.version === courante?.version ? exigences : []} />)}</ol>)}
    </div>
  </section>;
}
