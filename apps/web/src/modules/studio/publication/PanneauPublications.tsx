/**
 * Panneau « Publications » d'une étude Studio : préparer un dossier (révision d'une variante, variantes coordonnées
 * facultatives, manifeste figé), le soumettre (propriétaire, éditeur), l'approuver ou le refuser (propriétaire), le
 * diffuser (propriétaire : paquet figé SVG, DXF, IFC, feuille PDF) et le retirer (propriétaire) — chaque transition est
 * journalisée par le serveur, remplacement compris. Trois dimensions distinctes : travail, diffusion, actualité des
 * contenus dérivés. L'approbation envoie l'empreinte du manifeste affiché : c'est l'ensemble examiné. Les boutons
 * suivent les transitions permises renvoyées par le serveur, qui revérifie tout.
 */
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, studioPackageFileUrl, type StudioPublication, type StudioPublicationTransition, type StudioVariantSummary } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import {
  COMMENTAIRE_REQUIS, corpsTransition, court, empreinteCourte, LIBELLE_ACTION, LIBELLE_DIFFUSION, LIBELLE_EVENEMENT, LIBELLE_TRAVAIL,
  libelleActualite, libelleEcart, messageRefus, ORDRE_ACTIONS,
} from "./publication-ui";
import "./publication.css";

export interface PanneauPublicationsProps {
  projectId: string;
  studyId: string;
  variants: StudioVariantSummary[];
  /** Étude active et droit de modification (relu du serveur) : préparation proposée. */
  canWrite: boolean;
}

const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const date = (iso: string | null) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };
const ko = (n: number) => `${Math.max(1, Math.round(n / 1024))} Kio`;

export function PanneauPublications({ projectId, studyId, variants, canWrite }: PanneauPublicationsProps) {
  const cle = ["studio-publications", projectId, studyId];
  const client = useQueryClient();
  const liste = useQuery({ queryKey: cle, queryFn: () => api.studioPublications(projectId, studyId), retry: (n, e) => !refused(e) && n < 1 });
  const relire = () => client.invalidateQueries({ queryKey: cle });
  return (
    <section className="studio-publications" aria-labelledby="studio-publications-titre" data-studio-publications>
      <h2 id="studio-publications-titre">Publications</h2>
      <p className="studio-publications-sub">Une publication porte sur une révision précise d’une variante, figée dans un manifeste. Propriétaire et éditeurs soumettent ; le propriétaire approuve, refuse, diffuse et retire ; un lecteur consulte. Une publication approuvée se diffuse tant que son manifeste n’a pas changé. Rien n’est supprimé : retrait et remplacement sont journalisés.</p>
      {canWrite && variants.length > 0 && <PreparerPublication projectId={projectId} studyId={studyId} variants={variants.filter((v) => !v.archived)} surCree={relire} />}
      {liste.isPending && <p role="status">Chargement des publications…</p>}
      {liste.isError && <p role="alert">Publications indisponibles. <button type="button" onClick={() => void liste.refetch()}>Réessayer</button></p>}
      {liste.data && liste.data.publications.length === 0 && <p data-studio-publications-vide>Aucune publication pour cette étude.</p>}
      {liste.data && liste.data.publications.length > 0 && (
        <ul className="studio-publications-liste">
          {liste.data.publications.map((p) => <CartePublication key={p.id} projectId={projectId} studyId={studyId} publication={p} surChange={relire} />)}
        </ul>
      )}
    </section>
  );
}

function PreparerPublication({ projectId, studyId, variants, surCree }: { projectId: string; studyId: string; variants: StudioVariantSummary[]; surCree: () => Promise<unknown> }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [titre, setTitre] = useState("");
  const [coordonnees, setCoordonnees] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const demande = useRef<{ cle: string; id: string } | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!variantId || enCours) return;
    const variante = variants.find((v) => v.id === variantId);
    const autres = coordonnees.filter((id) => id !== variantId);
    const cle = `${variantId}\u0000${variante?.headRevisionId ?? ""}\u0000${titre.trim()}\u0000${[...autres].sort().join(",")}`;
    if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
    setEnCours(true); setErreur("");
    try {
      await api.createStudioPublication(projectId, studyId, variantId, { ...(titre.trim() ? { title: titre.trim() } : {}), ...(variante ? { revisionId: variante.headRevisionId } : {}), ...(autres.length ? { coordinatedVariantIds: autres } : {}), requestId: demande.current.id });
      demande.current = null; setTitre(""); setCoordonnees([]);
      await surCree();
    } catch (err) {
      setErreur(err instanceof ApiError ? messageRefus(err.status, err.body) : "Préparation non confirmée. Réessayez : la même demande sera rejouée sans doublon.");
    } finally { setEnCours(false); }
  }
  if (!variants.length) return null;
  return (
    <form className="studio-create" onSubmit={(e) => void envoyer(e)} data-studio-publication-preparer>
      <h3>Préparer une publication</h3>
      <label htmlFor="studio-publication-variante">Variante</label>
      <select id="studio-publication-variante" value={variantId} onChange={(e) => setVariantId(e.target.value)} data-studio-publication-variante>
        {variants.map((v) => <option key={v.id} value={v.id} translate="no">{`${v.name} · ${court(v.headRevisionId)}`}</option>)}
      </select>
      <label htmlFor="studio-publication-titre">Titre (facultatif)</label>
      <input id="studio-publication-titre" maxLength={200} value={titre} onChange={(e) => setTitre(e.target.value)} />
      {variants.length > 1 && (
        <fieldset className="studio-publication-coordonnees" data-studio-publication-coordonnees>
          <legend>Variantes coordonnées (facultatif)</legend>
          {variants.filter((v) => v.id !== variantId).map((v) => (
            <label key={v.id}>
              <input type="checkbox" checked={coordonnees.includes(v.id)} onChange={(e) => setCoordonnees(e.target.checked ? [...coordonnees, v.id] : coordonnees.filter((x) => x !== v.id))} data-studio-publication-coordonnee={v.id} />
              <span translate="no">{`${v.name} · ${court(v.headRevisionId)}`}</span>
            </label>
          ))}
        </fieldset>
      )}
      <p>La révision courante de la variante, celle des variantes coordonnées et les empreintes des documents sont figées dans le manifeste.</p>
      {erreur && <p role="alert">{erreur}</p>}
      <button disabled={enCours || !variantId}>Préparer la publication</button>
    </form>
  );
}

function CartePublication({ projectId, studyId, publication: p, surChange }: { projectId: string; studyId: string; publication: StudioPublication; surChange: () => Promise<unknown> }) {
  const [action, setAction] = useState<StudioPublicationTransition | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [journal, setJournal] = useState(false);
  const detail = useQuery({ queryKey: ["studio-publication", projectId, studyId, p.id, p.updatedAt], queryFn: () => api.studioPublication(projectId, studyId, p.id), enabled: journal });
  const actions = ORDRE_ACTIONS.filter((a) => p.allowed.includes(a));
  async function confirmer(e: FormEvent) {
    e.preventDefault();
    if (!action || enCours) return;
    if (COMMENTAIRE_REQUIS.has(action) && !commentaire.trim()) { setErreur("Un commentaire est requis pour cette action."); return; }
    setEnCours(true); setErreur("");
    try {
      await api.transitionStudioPublication(projectId, studyId, p.id, action, corpsTransition(p, action, commentaire));
      setAction(null); setCommentaire("");
      await surChange();
    } catch (err) {
      setErreur(err instanceof ApiError ? messageRefus(err.status, err.body) : "Action non confirmée : rechargez la liste avant de réessayer.");
    } finally { setEnCours(false); }
  }
  return (
    <li className="studio-publication" data-studio-publication={p.id} data-statut={p.status} data-travail={p.workStatus} data-diffusion={p.diffusionStatus} data-actualite={p.freshness} data-documents={p.documentsCheck ?? "non-verifiee"}>
      <div className="studio-publication-tete">
        <strong translate="no">{p.title}</strong>
        <span className={`studio-publication-statut statut-${p.workStatus}`} data-studio-publication-statut title="Travail">{LIBELLE_TRAVAIL[p.workStatus]}</span>
        <span className={`studio-publication-statut statut-${p.diffusionStatus}`} data-studio-publication-diffusion title="Diffusion">{LIBELLE_DIFFUSION[p.diffusionStatus]}</span>
        <span className={`studio-publication-statut ${p.freshness === "perimee" ? "studio-publication-perimee" : ""}`} data-studio-publication-actualite title="Actualité">{libelleActualite(p)}</span>
        {p.freshness === "perimee" && <span className="studio-publication-perimee" data-studio-publication-perimee>Variante modifiée depuis</span>}
        {p.replacedBy && <span className="studio-publication-perimee" data-studio-publication-remplacee>Remplacée par une diffusion plus récente</span>}
      </div>
      <dl className="studio-publication-faits">
        <dt>Variante</dt><dd translate="no">{p.variantName}</dd>
        <dt>Révision</dt><dd translate="no" data-studio-publication-revision>{court(p.revisionId)}</dd>
        <dt>Empreinte</dt><dd translate="no" title={p.documentHash}>{empreinteCourte(p.documentHash)}</dd>
        <dt>Préparée par</dt><dd translate="no">{`${p.createdBy.email} · ${date(p.createdAt)}`}</dd>
        <dt>Manifeste</dt><dd translate="no" data-studio-publication-manifeste title={p.manifestHash ?? ""}>{p.manifestHash ? empreinteCourte(p.manifestHash) : "—"}</dd>
        {p.manifest && p.manifest.sources.length > 1 && <><dt>Sources</dt><dd translate="no">{p.manifest.sources.map((s) => court(s.revisionId)).join(" · ")}</dd></>}
        {p.approval && <><dt>Approuvée par</dt><dd translate="no">{`${p.approval.by?.email ?? "—"} · ${date(p.approval.at)}${p.approval.manifestHash ? ` · ${empreinteCourte(p.approval.manifestHash)}` : ""}`}</dd></>}
        {p.diffusion && <><dt>Diffusée par</dt><dd translate="no">{`${p.diffusion.by?.email ?? "—"} · ${date(p.diffusion.at)}`}</dd></>}
        {p.replacement && <><dt>Remplacée</dt><dd translate="no" data-studio-publication-remplacement>{`${p.replacement.by?.email ?? "—"} · ${date(p.replacement.at)} · ${court(p.replacement.publicationId)}`}</dd></>}
        {p.withdrawal && <><dt>Retirée par</dt><dd translate="no" data-studio-publication-retrait>{`${p.withdrawal.by.email} · ${date(p.withdrawal.at)}${p.withdrawal.comment ? ` · ${p.withdrawal.comment}` : ""}`}</dd></>}
      </dl>
      {p.freshness === "perimee" && p.drift.length > 0 && (
        <ul className="studio-publication-ecarts" data-studio-publication-ecarts>
          {p.drift.map((e, i) => <li key={i}>{libelleEcart(e)}</li>)}
        </ul>
      )}
      {p.diffusion && (
        <div className="studio-publication-paquet" data-studio-publication-paquet>
          <p>Paquet figé <span translate="no" title={p.diffusion.packageHash}>{empreinteCourte(p.diffusion.packageHash)}</span></p>
          <ul>
            {p.diffusion.files.map((f) => (
              <li key={f.format}><a href={studioPackageFileUrl(projectId, studyId, p.id, f.format)} download={f.fileName} translate="no" data-studio-publication-fichier={f.format}>{`${f.format.toUpperCase()} · ${ko(f.size)}`}</a></li>
            ))}
          </ul>
        </div>
      )}
      {actions.length > 0 && (
        <div className="studio-publication-actions">
          {actions.map((a) => <button key={a} type="button" aria-pressed={action === a} onClick={() => { setAction(action === a ? null : a); setErreur(""); }} data-studio-publication-action={a}>{LIBELLE_ACTION[a]}</button>)}
        </div>
      )}
      {action && (
        <form className="studio-publication-confirmer" onSubmit={(e) => void confirmer(e)}>
          {action === "approuver" && <p data-studio-publication-examine>{`Vous approuvez le manifeste ${empreinteCourte(p.manifestHash ?? "")} : révision ${court(p.revisionId)} (empreinte ${empreinteCourte(p.documentHash)}).`}</p>}
          {action === "diffuser" && <p>La diffusion fige un paquet SVG, DXF, IFC et feuille PDF de la révision approuvée.</p>}
          {action === "actualiser" && <p>Le manifeste est reconstruit depuis les révisions courantes ; l’approbation précédente ne vaut plus et le dossier repasse en brouillon.</p>}
          <label htmlFor={`studio-publication-commentaire-${p.id}`}>{COMMENTAIRE_REQUIS.has(action) ? "Commentaire (requis)" : "Commentaire (facultatif)"}</label>
          <textarea id={`studio-publication-commentaire-${p.id}`} maxLength={2000} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          <button disabled={enCours}>Confirmer</button>
          <button type="button" onClick={() => setAction(null)}>Annuler</button>
        </form>
      )}
      {erreur && <p role="alert" data-studio-publication-erreur>{erreur}</p>}
      <button type="button" className="studio-publication-journal-bouton" aria-expanded={journal} onClick={() => setJournal(!journal)}>Journal</button>
      {journal && detail.data?.events && (
        <ol className="studio-publication-journal" data-studio-publication-journal>
          {detail.data.events.map((ev) => (
            <li key={ev.id}>
              <strong>{LIBELLE_EVENEMENT[ev.action]}</strong>{" "}
              <span translate="no">{`${ev.author.email} · ${date(ev.createdAt)} · ${court(ev.revisionId)}`}</span>
              {ev.relatedPublicationId && <span translate="no">{` → ${court(ev.relatedPublicationId)}`}</span>}
              {ev.comment && <q translate="no">{ev.comment}</q>}
            </li>
          ))}
        </ol>
      )}
      {journal && detail.isError && <p role="alert">Journal indisponible.</p>}
    </li>
  );
}
