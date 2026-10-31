/**
 * Prix immobiliers (Concept Prix v1.1 §4–§6, lot P7) : interface propre aux deux couches de prix, au-dessus de
 * l'affichage générique des couches et des indicateurs.
 *
 * - `PanneauPrix` (catalogue) : état des deux couches et de leurs produits, motifs de blocage et prochaines actions,
 *   registre des sources (« Sources et dossiers ») avec leur statut.
 * - `SectionPrixFiche` (fiche d'information) : agrégat publié par un tiers rattaché à l'objet (en-tête d'édition,
 *   tableaux de la commune, quartiers commerciaux non rattachés, triables et filtrables), carte de comparaison à la
 *   référence officielle et instantané des médianes calculées par Fadi.
 *
 * Tout est lu par l'API dans la base (D-GD-29) ; les noms, libellés et textes des sources sont des données
 * (`translate="no"`). Une valeur absente porte un libellé (« non publié », « non publiée »…), jamais 0. Chaque état est
 * signalé par une icône et un texte, jamais par la couleur seule.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { LIBELLE_ECART_REFERENCE } from "@parcours/geodata-model";
import { adresseExportPrix, api, type CellulesPrixRecues, type ComparaisonPrixRecue, type CouchePrixRecue, type CoucheRecue, type EditionPrixRecue, type FicheRecue, type LignePrixRecue, type PrixPubliesRecus, type SourcePrixRecue } from "../client";
import {
  choixComparaison, filtrerLignesPrix, formaterDatePrix, formaterEcartPrix, formaterMontantPrix, formaterNombrePrix, formaterPeriodePrix, formaterTendancePrix, formaterUnitePrix,
  libelleCohorte, libelleDimension, libelleEtatPrix, libelleMotifComparaison, libelleMotifPrix, libelleProduitPrix, libelleStatutSource, libelleTypeBien, LIBELLES_COUCHE_PRIX,
  LIBELLES_POSITION_FOURCHETTE, LIBELLES_TRANSACTION_PRIX, lignesVillePrix, peutExporterPrix, quartiersParTransaction, statutSourceUtilisable, symboleEtatPrix, tonEtatPrix,
  totalExclusions, trierLignesPrix, triSuivant,
  type CleTriPrix, type OrdreTri,
} from "./prix-ops";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** État d'une couche, d'un produit ou d'une cellule : icône + libellé (repère non coloré), ton par la palette partagée. */
export function EtatPrix({ etat }: { etat: string }) {
  return (
    <span className={`gd-etat-prix gd-etat-prix-${tonEtatPrix(etat)}`} data-gd-etat-prix={etat}>
      <span aria-hidden="true" className="gd-etat-prix-icone">{symboleEtatPrix(etat)}</span>
      <span>{libelleEtatPrix(etat)}</span>
    </span>
  );
}

/** Motif : libellé d'interface s'il est codé, texte du registre sinon (donnée, non traduite). */
function Motif({ m }: { m: string }) {
  const l = libelleMotifPrix(m);
  return l.code ? <span data-gd-prix-motif={m}>{l.texte}</span> : <span translate="no" data-gd-prix-motif="">{l.texte}</span>;
}

// ——— Catalogue ———

interface EtatPanneau { couches?: CouchePrixRecue[]; erreurCouches?: string; sources?: SourcePrixRecue[]; dossier?: string | null; erreurSources?: string }

/**
 * Panneau « Prix immobiliers » du catalogue : les deux couches et leurs produits, avec leur état lu sur le serveur ; les
 * éditions publiées sont reliées aux couches du catalogue (éditeur, édition, période, attribution).
 */
export function PanneauPrix(p: { catalogue: readonly CoucheRecue[] }) {
  const [etat, setEtat] = useState<EtatPanneau | null>(null);
  const [voirSources, setVoirSources] = useState(false);
  const [essai, setEssai] = useState(0);
  const idSources = useId();
  useEffect(() => {
    let vivant = true;
    setEtat(null);
    void Promise.allSettled([api.prixCouches(), api.prixSources()]).then(([c, s]) => {
      if (!vivant) return;
      setEtat({
        ...(c.status === "fulfilled" ? { couches: c.value.couches } : { erreurCouches: message(c.reason) }),
        ...(s.status === "fulfilled" ? { sources: s.value.sources, dossier: s.value.dossier } : { erreurSources: message(s.reason) }),
      });
    });
    return () => { vivant = false; };
  }, [essai]);
  if (!etat) return <p role="status" className="gd-discret" data-gd-prix-panneau="chargement"><EtatPrix etat="chargement" /> <span>Lecture de l'état des prix immobiliers…</span></p>;
  const sources = etat.sources ?? [];
  return (
    <section className="gd-prix" aria-label="Prix immobiliers" data-gd-prix-panneau="pret">
      <p className="gd-discret">Deux couches indépendantes : un prix affiché dans une annonce n'est pas un prix de transaction ; une valeur de référence officielle n'est pas un impôt.</p>
      {etat.erreurCouches && (
        <div role="alert" className="gd-alerte" data-gd-prix-erreur>
          <p><EtatPrix etat="erreur" /> <span>L'état des couches de prix n'a pas pu être lu :</span> <span>{etat.erreurCouches}</span></p>
          <button type="button" onClick={() => setEssai((n) => n + 1)}>Réessayer</button>
        </div>
      )}
      {etat.couches && (["annonces", "officielle"] as const).map((k) => (
        <CoucheDePrix key={k} cle={k} couche={etat.couches!.find((c) => c.couche === k) ?? null} sources={sources.filter((s) => s.couche === k)} catalogue={p.catalogue} />
      ))}
      <button type="button" className="gd-lien" aria-expanded={voirSources} aria-controls={idSources} onClick={() => setVoirSources((v) => !v)} data-gd-prix-sources-bouton>Sources et dossiers</button>
      {voirSources && (
        <div id={idSources} className="gd-prix-sources" data-gd-prix-sources={sources.length}>
          {etat.erreurSources && <p role="alert" className="gd-alerte"><EtatPrix etat="erreur" /> <span>Le registre des sources n'a pas pu être lu :</span> <span>{etat.erreurSources}</span></p>}
          {etat.sources && sources.length === 0 && <p className="gd-discret">Aucune source n'est enregistrée en base.</p>}
          {sources.length > 0 && <RegistreSources sources={sources} />}
          {etat.dossier && <p className="gd-discret"><span>Dossier de qualification :</span> <span translate="no">{etat.dossier}</span></p>}
        </div>
      )}
    </section>
  );
}

/** Une couche de prix : état, motifs, produits (agrégat publié, observations, valeurs officielles) et sources bloquées. */
function CoucheDePrix(p: { cle: "annonces" | "officielle"; couche: CouchePrixRecue | null; sources: readonly SourcePrixRecue[]; catalogue: readonly CoucheRecue[] }) {
  const titreId = useId();
  const bloquees = p.sources.filter((s) => !statutSourceUtilisable(s.statut));
  return (
    <article className="gd-prix-couche" aria-labelledby={titreId} data-gd-prix-couche={p.cle} data-gd-prix-couche-etat={p.couche?.etat ?? "indisponible"}>
      <h5 id={titreId}>{LIBELLES_COUCHE_PRIX[p.cle]}</h5>
      <EtatPrix etat={p.couche?.etat ?? "indisponible"} />
      {!p.couche && <p className="gd-discret">Couche non déclarée par le serveur.</p>}
      {p.couche && p.couche.motifs.length > 0 && (
        <ul className="gd-prix-motifs" aria-label="Motifs de l'état">{p.couche.motifs.map((m, i) => <li key={i}><Motif m={m} /></li>)}</ul>
      )}
      {p.couche && p.couche.produits.length > 0 && (
        <ul className="gd-prix-produits">
          {p.couche.produits.map((x) => {
            const editions = p.catalogue.filter((c) => x.versionIds?.includes(c.version.id));
            const editeur = p.sources.find((s) => s.produit === x.produit && statutSourceUtilisable(s.statut))?.editeur ?? null;
            return (
              <li key={x.produit} data-gd-prix-produit={x.produit} data-gd-prix-produit-etat={x.etat}>
                <div className="gd-ligne-titre"><strong>{libelleProduitPrix(x.produit)}</strong><EtatPrix etat={x.etat} /></div>
                {x.motif && <p className="gd-discret"><span>Motif :</span> <Motif m={x.motif} /></p>}
                {editions.map((c) => (
                  <dl key={c.id} className="gd-fiche-version gd-prix-edition-catalogue" data-gd-prix-edition={c.version.id}>
                    {editeur && <><dt>Éditeur</dt><dd translate="no">{editeur}</dd></>}
                    <dt>Édition</dt><dd translate="no">{c.version.libelle}</dd>
                    <dt>Période</dt><dd>{c.version.periode ? <span translate="no">{c.version.periode}</span> : <span>Non évaluée</span>}</dd>
                    <dt>Publiée le</dt><dd>{c.version.publieeLe ? <span translate="no">{formaterDatePrix(c.version.publieeLe)}</span> : <span>Non évaluée</span>}</dd>
                    <dt>Attribution</dt><dd translate="no">{c.version.attribution}</dd>
                  </dl>
                ))}
                {x.versionIds && x.versionIds.length > 0 && editions.length === 0 && <p className="gd-discret">Édition publiée, absente du catalogue de ce compte.</p>}
              </li>
            );
          })}
        </ul>
      )}
      {bloquees.length > 0 && (
        <details className="gd-prix-blocages" open={p.couche?.etat !== "disponible"}>
          <summary>{`Sources non utilisables (${bloquees.length})`}</summary>
          <ul>
            {bloquees.map((s) => (
              <li key={s.cle} data-gd-prix-blocage={s.cle}>
                <div className="gd-ligne-titre"><strong translate="no">{s.titre}</strong><StatutSource statut={s.statut} /></div>
                <p><span>Motif :</span> {s.motif ? <span translate="no">{s.motif}</span> : <span>non renseigné</span>}</p>
                <p><span>Prochaine action :</span> {s.prochaineAction ? <span translate="no">{s.prochaineAction}</span> : <span>non renseignée</span>}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function StatutSource({ statut }: { statut: string }) {
  const ok = statutSourceUtilisable(statut);
  return (
    <span className={`gd-badge${ok ? "" : " gd-badge-alerte"}`} data-gd-prix-statut={statut}>
      <span aria-hidden="true">{ok ? "✓ " : "⊘ "}</span><span>{libelleStatutSource(statut)}</span>
    </span>
  );
}

/** Registre des sources de prix (dossier de qualification) : statut, couche, produit, éditeur, licence, revue. */
function RegistreSources({ sources }: { sources: readonly SourcePrixRecue[] }) {
  return (
    <ul className="gd-liste gd-prix-registre">
      {sources.map((s) => (
        <li key={s.cle} data-gd-prix-source={s.cle} data-gd-prix-source-statut={s.statut}>
          <div className="gd-ligne-titre">
            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" translate="no">{s.titre}</a> : <strong translate="no">{s.titre}</strong>}
            <StatutSource statut={s.statut} />
          </div>
          <p className="gd-discret"><span>{LIBELLES_COUCHE_PRIX[s.couche] ?? s.couche}</span><span> · </span><span>{libelleProduitPrix(s.produit)}</span>{s.derivee && <><span> · </span><span>Source dérivée (agrégateur)</span></>}</p>
          {s.editeur && <p className="gd-discret"><span>Éditeur :</span> <span translate="no">{s.editeur}</span></p>}
          <p className="gd-discret"><span>Licence :</span> {s.licence ? <span translate="no">{s.licence}</span> : <span>aucune licence de réutilisation établie</span>}</p>
          {s.motif && <p className="gd-discret"><span>Motif :</span> <span translate="no">{s.motif}</span></p>}
          {s.prochaineAction && <p className="gd-discret"><span>Prochaine action :</span> <span translate="no">{s.prochaineAction}</span></p>}
          {(s.revueLe || s.revueAvant) && <p className="gd-discret"><span>Revue le</span> <span translate="no">{formaterDatePrix(s.revueLe) ?? "—"}</span><span> · </span><span>à revoir avant le</span> <span translate="no">{formaterDatePrix(s.revueAvant) ?? "—"}</span></p>}
        </li>
      ))}
    </ul>
  );
}

// ——— Fiche d'information ———

/** Montant publié dans une cellule : ≈ quand l'éditeur l'abrège (texte d'origine au survol), « non publié » sinon. */
function CelluleMontant({ m }: { m: LignePrixRecue["prixMedian"] }) {
  const a = formaterMontantPrix(m);
  if (a.absent) return <td data-absente="" className="gd-prix-absent">{a.texte}</td>;
  return (
    <td data-gd-prix-approximatif={a.approximatif ? "" : undefined}>
      {a.approximatif
        ? <abbr title={a.original ? `Montant abrégé par l'éditeur : ${a.original}` : "Montant abrégé par l'éditeur"} translate="no">{a.texte}</abbr>
        : <span translate="no">{a.texte}</span>}
    </td>
  );
}
function CelluleTendance({ v }: { v: number | null }) {
  return v === null ? <td data-absente="" className="gd-prix-absent">{formaterTendancePrix(v)}</td> : <td translate="no">{formaterTendancePrix(v)}</td>;
}

/** En-têtes d'unité : libellé, puis l'unité publiée entre parenthèses (traduite à part). */
function EnteteUnite({ libelle, unite }: { libelle: string; unite: string | undefined }) {
  return <><span>{libelle}</span> <span className="gd-prix-unite">(<span>{formaterUnitePrix(unite)}</span>)</span></>;
}

/** Tableau de la commune pour une transaction : une ligne par type de bien. */
function TableauVille({ lignes, transaction }: { lignes: LignePrixRecue[]; transaction: "vente" | "location" }) {
  if (!lignes.length) return null;
  const vente = transaction === "vente";
  return (
    <div className="gd-ventilation-bloc gd-prix-bloc">
      <table className="gd-ventilation gd-prix-table" data-gd-prix-ville={transaction}>
        <caption><span>{LIBELLES_TRANSACTION_PRIX[transaction]}</span><span> — </span><span>niveau de la commune</span></caption>
        <thead><tr>
          <th scope="col">Type de bien</th>
          <th scope="col">Annonces</th>
          <th scope="col"><EnteteUnite libelle={vente ? "Prix médian" : "Loyer médian"} unite={lignes[0]?.unite} /></th>
          <th scope="col"><EnteteUnite libelle={vente ? "Prix médian au m²" : "Loyer au m²"} unite={lignes[0]?.uniteM2} /></th>
          <th scope="col">Tendance 3 mois</th>
        </tr></thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={`${l.typeBien}|${l.libelleGeo}`} data-gd-prix-ligne={`${transaction}|${l.typeBien}`}>
              <th scope="row">{libelleTypeBien(l.typeBien)}</th>
              <td translate="no">{formaterNombrePrix(l.nombreAnnonces)}</td>
              <CelluleMontant m={l.prixMedian} />
              <CelluleMontant m={l.prixM2} />
              <CelluleTendance v={l.tendance90j} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLONNES_QUARTIERS: readonly { cle: CleTriPrix; vente: string; location: string; unite?: "unite" | "uniteM2" }[] = [
  { cle: "libelleGeo", vente: "Quartier", location: "Quartier" },
  { cle: "nombreAnnonces", vente: "Annonces", location: "Annonces" },
  { cle: "prixMedian", vente: "Prix médian", location: "Loyer médian", unite: "unite" },
  { cle: "prixM2", vente: "Prix médian au m²", location: "Loyer au m²", unite: "uniteM2" },
  { cle: "tendance90j", vente: "Tendance 3 mois", location: "Tendance 3 mois" },
];

/** Tableau des quartiers commerciaux d'une transaction, triable par colonne (aria-sort), filtré par le texte commun. */
function TableauQuartiers(p: { lignes: LignePrixRecue[]; transaction: "vente" | "location"; filtre: string }) {
  const [tri, setTri] = useState<{ cle: CleTriPrix; ordre: OrdreTri }>({ cle: "nombreAnnonces", ordre: "desc" });
  const vues = useMemo(() => trierLignesPrix(filtrerLignesPrix(p.lignes, p.filtre), tri.cle, tri.ordre), [p.lignes, p.filtre, tri]);
  if (!p.lignes.length) return null;
  const vente = p.transaction === "vente";
  const types = new Set(p.lignes.map((l) => l.typeBien));
  return (
    <div className="gd-ventilation-bloc gd-prix-bloc">
      <table className="gd-ventilation gd-prix-table" data-gd-prix-quartiers={p.transaction} data-gd-prix-quartiers-lignes={vues.length}>
        <caption>
          <span>{LIBELLES_TRANSACTION_PRIX[p.transaction]}</span>
          {types.size === 1 && <><span> — </span><span>{libelleTypeBien([...types][0]!)}</span></>}
          <span className="gd-discret">{` (${vues.length}/${p.lignes.length})`}</span>
        </caption>
        <thead><tr>
          {COLONNES_QUARTIERS.map((c) => {
            const actif = tri.cle === c.cle;
            return (
              <th key={c.cle} scope="col" aria-sort={actif ? (tri.ordre === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="gd-prix-tri" onClick={() => setTri((t) => triSuivant(t, c.cle))} data-gd-prix-tri={c.cle}>
                  {c.unite ? <EnteteUnite libelle={vente ? c.vente : c.location} unite={p.lignes[0]?.[c.unite]} /> : <span>{vente ? c.vente : c.location}</span>}
                  <span aria-hidden="true" className="gd-prix-tri-sens">{actif ? (tri.ordre === "asc" ? " ▲" : " ▼") : " ↕"}</span>
                </button>
              </th>
            );
          })}
          {types.size > 1 && <th scope="col">Type de bien</th>}
        </tr></thead>
        <tbody>
          {vues.map((l) => (
            <tr key={`${l.libelleGeo}|${l.typeBien}`} data-gd-prix-quartier={l.libelleGeo}>
              <th scope="row" translate="no">{l.libelleGeo}</th>
              <td translate="no">{formaterNombrePrix(l.nombreAnnonces)}</td>
              <CelluleMontant m={l.prixMedian} />
              <CelluleMontant m={l.prixM2} />
              <CelluleTendance v={l.tendance90j} />
              {types.size > 1 && <td>{libelleTypeBien(l.typeBien)}</td>}
            </tr>
          ))}
          {vues.length === 0 && <tr><td colSpan={COLONNES_QUARTIERS.length + (types.size > 1 ? 1 : 0)} className="gd-discret">Aucun quartier ne correspond au filtre.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** En-tête d'une édition publiée : éditeur, édition, période, publication, licence, attribution avec lien, export. */
function EnteteEdition({ e, peutExporter }: { e: EditionPrixRecue; peutExporter: boolean }) {
  const periode = formaterPeriodePrix(e.periode);
  return (
    <div className="gd-prix-edition" data-gd-prix-edition={e.versionId}>
      <dl className="gd-fiche-version">
        <dt>Éditeur</dt><dd translate="no">{e.editeur}</dd>
        <dt>Édition</dt><dd translate="no">{e.libelle}</dd>
        <dt>Période</dt><dd>{periode ? <span translate="no">{periode}</span> : <span>Non évaluée</span>}</dd>
        <dt>Publiée le</dt><dd>{e.publieeLe ? <span translate="no">{formaterDatePrix(e.publieeLe)}</span> : <span>Non évaluée</span>}</dd>
        <dt>Licence</dt><dd translate="no">{e.licence}</dd>
        <dt>Attribution</dt>
        <dd data-gd-prix-attribution>{e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" translate="no">{e.attribution}</a> : <span translate="no">{e.attribution}</span>}</dd>
      </dl>
      {peutExporter
        ? <p className="gd-actions gd-ecran-seulement"><a className="gd-bouton-lien" href={adresseExportPrix(e.versionId)} download data-gd-prix-export={e.versionId}>Exporter l'agrégat publié (CSV, attribution incluse)</a></p>
        : <p className="gd-discret gd-ecran-seulement">Export réservé aux comptes autorisés à exporter.</p>}
    </div>
  );
}

/**
 * Section « Prix immobiliers affichés » de la fiche : rien si la fiche ne porte pas de prix publiés. Les valeurs sont
 * celles de l'éditeur, sans recalcul ni fusion avec les médianes calculées par Fadi. Le lien d'export suit la capacité
 * `prix-exporter` rendue par le serveur (`GET /prix/couches`), jamais une autre capacité GeoData.
 */
export function SectionPrixFiche(p: { fiche: FicheRecue }) {
  const prix: PrixPubliesRecus | null | undefined = p.fiche.prixPublies;
  const [filtre, setFiltre] = useState("");
  const [capacites, setCapacites] = useState<string[] | null>(null);
  const titreId = useId();
  const avecPrix = !!prix;
  useEffect(() => {
    if (!avecPrix) return;
    let vivant = true;
    api.prixCouches().then((r) => vivant && setCapacites(r.capacites ?? [])).catch(() => vivant && setCapacites([]));
    return () => { vivant = false; };
  }, [avecPrix]);
  if (!prix) return null;
  const peutExporter = peutExporterPrix(capacites);
  const vente = lignesVillePrix(prix.lignes, "vente");
  const location = lignesVillePrix(prix.lignes, "location");
  const quartiers = quartiersParTransaction(prix.nonRattaches.length ? prix.nonRattaches : prix.lignes);
  const nQuartiers = quartiers.vente.length + quartiers.location.length;
  const editeurs = [...new Set(prix.editions.map((e) => e.editeur))].join(", ");
  return (
    <section className="gd-prix-fiche" aria-labelledby={titreId} data-gd-prix-section={p.fiche.code}>
      <h4 id={titreId}>Prix immobiliers affichés</h4>
      {prix.editions.map((e) => <EnteteEdition key={e.versionId} e={e} peutExporter={peutExporter} />)}
      <ul className="gd-prix-avertissements">
        <li>Prix demandés dans les annonces, pas des prix de transaction.</li>
        <li>Effectifs = annonces, pas des biens distincts (doublons possibles).</li>
        <li>Agrégat publié par une source unique dérivée (agrégateur), repris tel quel, sans recalcul.</li>
        <li>≈ : montant abrégé par l'éditeur, valeur approximative (texte d'origine au survol).</li>
      </ul>
      {vente.length + location.length === 0 && <p className="gd-discret" data-gd-prix-ville-vide>Aucune valeur publiée au niveau de la commune.</p>}
      <TableauVille lignes={vente} transaction="vente" />
      <TableauVille lignes={location} transaction="location" />
      {nQuartiers > 0 && (
        <section className="gd-prix-quartiers" aria-label="Quartiers commerciaux" data-gd-prix-quartiers-section={nQuartiers}>
          <h5>{`Quartiers commerciaux ${editeurs} (sans limites publiées, non rattachés à une unité administrative)`}</h5>
          <p className="gd-discret">Noms de quartiers tels que publiés par l'éditeur : ce ne sont pas des unités administratives et ils n'ont pas de limites officielles ; aucun polygone n'est dessiné.</p>
          <label className="gd-champ">Filtrer les quartiers<input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} data-gd-prix-filtre /></label>
          <TableauQuartiers lignes={quartiers.vente} transaction="vente" filtre={filtre} />
          <TableauQuartiers lignes={quartiers.location} transaction="location" filtre={filtre} />
        </section>
      )}
      <CarteComparaison code={p.fiche.code} lignes={prix.lignes} />
      <CellulesObservations />
    </section>
  );
}

/**
 * Carte de comparaison (Concept §6, PRX08/PRX09) : écart descriptif ou position dans la fourchette quand toutes les
 * dimensions sont compatibles ; sinon « Comparaison impossible » et la liste des dimensions en cause.
 */
function CarteComparaison(p: { code: string; lignes: readonly LignePrixRecue[] }) {
  const choix = useMemo(() => choixComparaison(p.lignes), [p.lignes]);
  const [rang, setRang] = useState(0);
  const [etat, setEtat] = useState<{ cle: string; r?: ComparaisonPrixRecue; erreur?: string } | null>(null);
  const courant = choix[rang] ?? null;
  const cle = courant ? `${p.code}|${courant.type}|${courant.transaction}` : "";
  useEffect(() => {
    if (!courant) return;
    let vivant = true;
    setEtat({ cle });
    api.prixComparaison(p.code, courant.type, courant.transaction)
      .then((r) => vivant && setEtat({ cle, r }))
      .catch((e: unknown) => vivant && setEtat({ cle, erreur: message(e) }));
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  if (!courant) return null;
  const r = etat?.cle === cle ? etat.r : undefined;
  return (
    <section className="gd-prix-carte" aria-label="Comparaison à la référence officielle" data-gd-prix-comparaison={r ? (r.comparable ? "comparable" : "impossible") : etat?.erreur ? "erreur" : "chargement"}>
      <h5>Comparaison à la référence officielle</h5>
      <label className="gd-champ">Cohorte comparée<select value={rang} onChange={(e) => setRang(Number(e.target.value))} data-gd-prix-comparaison-choix>
        {choix.map((c, i) => <option key={`${c.type}|${c.transaction}`} value={i}>{`${libelleTypeBien(c.type)} — ${LIBELLES_TRANSACTION_PRIX[c.transaction]}`}</option>)}
      </select></label>
      {!r && !etat?.erreur && <p role="status" className="gd-discret"><EtatPrix etat="chargement" /></p>}
      {etat?.cle === cle && etat.erreur && <p role="status" className="gd-alerte"><EtatPrix etat="erreur" /> <span>La comparaison n'a pas pu être lue :</span> <span>{etat.erreur}</span></p>}
      {r && r.comparable && (
        <div role="status" data-gd-prix-comparaison-resultat>
          {r.position
            ? <p><strong>{LIBELLES_POSITION_FOURCHETTE[r.position]}</strong></p>
            : r.ecartPourcent !== null && r.ecartPourcent !== undefined
              ? <p><span>{LIBELLE_ECART_REFERENCE}</span><span> : </span><strong translate="no">{formaterEcartPrix(r.ecartPourcent)}</strong></p>
              : <p>Comparaison sans valeur rendue par le serveur.</p>}
          <p className="gd-discret">Écart descriptif : ni surévaluation, ni assiette fiscale, ni décote de négociation. Les deux valeurs et leurs dates restent distinctes.</p>
        </div>
      )}
      {r && !r.comparable && (
        <div role="status" data-gd-prix-comparaison-impossible data-gd-prix-comparaison-motif={r.motif ?? ""}>
          <p><span aria-hidden="true">⊘ </span><strong>Comparaison impossible</strong></p>
          <p data-gd-prix-comparaison-raison>{libelleMotifComparaison(r.motif)}</p>
          {r.coucheEnCause && (
            <p className="gd-discret" data-gd-prix-comparaison-couche={r.coucheEnCause.couche}>
              <span>{LIBELLES_COUCHE_PRIX[r.coucheEnCause.couche]}</span><span> : </span><EtatPrix etat={r.coucheEnCause.etat} />
              {r.coucheEnCause.motif && <><span> — </span><Motif m={r.coucheEnCause.motif} /></>}
            </p>
          )}
          {r.coucheEnCause?.detail && <p className="gd-discret"><span>Motif enregistré :</span> <span translate="no">{r.coucheEnCause.detail}</span></p>}
          {r.dimensionsIncompatibles && r.dimensionsIncompatibles.length > 0
            ? <><p className="gd-discret">Dimensions qui empêchent la comparaison :</p><ul>{r.dimensionsIncompatibles.map((d) => <li key={d} data-gd-prix-dimension={d}>{libelleDimension(d)}</li>)}</ul></>
            : r.motif === "dimensions-incompatibles" ? <p className="gd-discret">Aucune dimension précisée par le serveur.</p> : null}
        </div>
      )}
    </section>
  );
}

/** Instantané des médianes calculées par Fadi sur les observations d'annonces (PRX07 : échantillon insuffisant explicite). */
function CellulesObservations() {
  const [etat, setEtat] = useState<{ r?: CellulesPrixRecues; erreur?: string } | null>(null);
  useEffect(() => {
    let vivant = true;
    api.prixCellules().then((r) => vivant && setEtat({ r })).catch((e: unknown) => vivant && setEtat({ erreur: message(e) }));
    return () => { vivant = false; };
  }, []);
  const r = etat?.r;
  return (
    <section className="gd-prix-carte" aria-label="Médianes calculées par Fadi" data-gd-prix-cellules={r ? (r.instantane ? "instantane" : "aucun") : etat?.erreur ? "erreur" : "chargement"}>
      <h5>Médianes calculées par Fadi sur les observations d'annonces</h5>
      <p className="gd-discret">Produit distinct de l'agrégat publié : jamais fusionné avec lui.</p>
      {!etat && <p role="status" className="gd-discret"><EtatPrix etat="chargement" /></p>}
      {etat?.erreur && <p role="status" className="gd-alerte"><EtatPrix etat="erreur" /> <span>L'instantané n'a pas pu être lu :</span> <span>{etat.erreur}</span></p>}
      {r && !r.instantane && (
        <div data-gd-prix-sans-instantane>
          <p><strong>Aucun instantané publié</strong></p>
          <p><span>État :</span> <EtatPrix etat={r.etat} /></p>
          {r.motif && <p className="gd-discret"><span>Motif :</span> <Motif m={r.motif} /></p>}
        </div>
      )}
      {r && r.instantane && (
        <>
          <p className="gd-discret"><span>Méthode :</span> <span translate="no">{r.instantane.methode}</span><span> · </span><span>publié le</span> <span translate="no">{formaterDatePrix(r.instantane.publieLe)}</span></p>
          {r.cellules.length === 0
            ? <p className="gd-discret">Aucune cellule dans l'instantané publié.</p>
            : (
              <div className="gd-ventilation-bloc gd-prix-bloc">
                <table className="gd-ventilation gd-prix-table" data-gd-prix-cellules-table={r.cellules.length}>
                  <caption>Cellules de l'instantané</caption>
                  <thead><tr>
                    <th scope="col">Cohorte</th><th scope="col">État</th><th scope="col">Médiane</th><th scope="col">Q1</th><th scope="col">Q3</th>
                    <th scope="col">Biens distincts</th><th scope="col">Observations éligibles / brutes</th><th scope="col">Exclusions</th><th scope="col">Dernière observation</th>
                  </tr></thead>
                  <tbody>
                    {r.cellules.map((c, i) => {
                      const insuffisant = c.etat === "echantillon-insuffisant";
                      const absent = insuffisant ? libelleEtatPrix(c.etat) : "non publiée";
                      return (
                        <tr key={i} data-gd-prix-cellule={c.etat}>
                          <th scope="row" translate="no">{libelleCohorte(c.cohorte)}</th>
                          <td><EtatPrix etat={c.etat} /></td>
                          <td className={c.mediane === null ? "gd-prix-absent" : undefined}>{c.mediane === null ? absent : <span translate="no">{formaterNombrePrix(c.mediane)}</span>}</td>
                          <td className={c.q1 === null ? "gd-prix-absent" : undefined}>{c.q1 === null ? "non publié" : <span translate="no">{formaterNombrePrix(c.q1)}</span>}</td>
                          <td className={c.q3 === null ? "gd-prix-absent" : undefined}>{c.q3 === null ? "non publié" : <span translate="no">{formaterNombrePrix(c.q3)}</span>}</td>
                          <td translate="no">{formaterNombrePrix(c.nombres.distinctes, "—")}</td>
                          <td translate="no">{`${formaterNombrePrix(c.nombres.eligibles, "—")} / ${formaterNombrePrix(c.nombres.brutes, "—")}`}</td>
                          <td translate="no">{formaterNombrePrix(totalExclusions(c.exclusions), "—")}</td>
                          <td translate="no">{formaterDatePrix(c.derniereObservation) ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </>
      )}
    </section>
  );
}
