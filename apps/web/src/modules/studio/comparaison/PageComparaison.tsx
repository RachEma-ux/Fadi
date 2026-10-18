/**
 * Comparaison de deux révisions d'une même étude Studio, en lecture seule : deux sélecteurs (variante + révision), une
 * superposition SVG (avant en gris ; après en couleur : ajouté vert, supprimé rouge pointillé, modifié orange) et la
 * liste des différences. La différence est calculée par le serveur (`comparerDocumentsStudio`), seul juge des droits ;
 * rien n'est écrit. Le choix des côtés vit dans l'adresse (`?de=…&a=…`).
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { StudioCompteDifferences, StudioDeplacement } from "@parcours/atelier-model";
import { LOCALE } from "../../../lib/i18n";
import { api, ApiError, type StudioRevisionSummary, type StudioVariantSummary } from "../../../lib/api";
import { cheminComparaisonStudio, cheminEtudeStudio, valeurCoteStudio, type CoteComparaisonStudio } from "../routes-studio";
import { StudioRefus } from "../studio-ecrans";
import { superposition, type TraceSuperposition } from "./superposition";
import "./comparaison.css";

const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const retry = (n: number, e: unknown) => !refused(e) && n < 1;

const ETATS = { ajoute: "Ajouté", supprime: "Supprimé", modifie: "Modifié", identique: "Identique" } as const;
const PROPRIETES: Record<string, string> = {
  geometrie: "géométrie", calque: "calque", extrusion: "extrusion", nom: "nom", visible: "visibilité", verrouille: "verrou", liens: "liens",
};
const TYPES: Record<string, string> = { line: "Ligne", rectangle: "Rectangle" };
const metres = (v: number) => `${v.toLocaleString(LOCALE, { maximumFractionDigits: 3 })} m`;

export interface PageComparaisonProps { projectId: string; studyId: string; de: CoteComparaisonStudio | null; a: CoteComparaisonStudio | null }

export function PageComparaison({ projectId, studyId, de, a }: PageComparaisonProps) {
  const navigate = useNavigate();
  const etude = useQuery({ queryKey: ["studio-study", projectId, studyId], queryFn: () => api.studioStudy(projectId, studyId), staleTime: 30_000, retry });
  const variants = etude.data?.variants ?? [];
  const initial = etude.data?.study.initialVariantId ?? null;
  // Côtés par défaut : variante initiale à gauche, la suivante (sinon la même) à droite, à leur tête.
  const deEff: CoteComparaisonStudio | null = de ?? (initial ? { variantId: initial, revisionId: null } : null);
  const aEff: CoteComparaisonStudio | null = a ?? (variants.length ? { variantId: (variants.find((v) => v.id !== deEff?.variantId) ?? variants[0]!).id, revisionId: null } : null);
  const comparaison = useQuery({
    queryKey: ["studio-compare", projectId, studyId, deEff && valeurCoteStudio(deEff), aEff && valeurCoteStudio(aEff)],
    queryFn: () => api.studioCompare(projectId, studyId, valeurCoteStudio(deEff!), valeurCoteStudio(aEff!)),
    enabled: !!etude.data && !!deEff && !!aEff, retry,
  });
  if (etude.isPending) return <p role="status">Chargement de l’étude…</p>;
  if (!etude.data || refused(etude.error)) return etude.isError && !refused(etude.error) ? <p role="alert">Étude indisponible. <button type="button" onClick={() => void etude.refetch()}>Réessayer</button></p> : <StudioRefus quoi="etude" />;
  const choisir = (cote: "de" | "a", valeur: CoteComparaisonStudio) =>
    navigate(cheminComparaisonStudio(projectId, studyId, cote === "de" ? valeur : deEff, cote === "a" ? valeur : aEff), { replace: true });
  const nomVariante = (id: string) => variants.find((v) => v.id === id)?.name ?? id;
  const d = comparaison.data?.difference;
  return (
    <section className="studio-welcome studio-comparaison" data-studio-comparaison={studyId}>
      <p className="studio-eyebrow">FADI / STUDIO</p>
      <h1>Comparer deux révisions</h1>
      <p>Étude : <span translate="no">{etude.data.study.name}</span></p>
      <p>Lecture seule : rien n’est modifié.</p>
      <div className="studio-comparaison-cotes">
        {deEff && <SelecteurCote titre="De (avant)" cle="de" projectId={projectId} studyId={studyId} variants={variants} valeur={deEff} onChange={(v) => choisir("de", v)} />}
        {aEff && <SelecteurCote titre="À (après)" cle="a" projectId={projectId} studyId={studyId} variants={variants} valeur={aEff} onChange={(v) => choisir("a", v)} />}
      </div>
      {comparaison.isPending && comparaison.fetchStatus !== "idle" && <p role="status">Comparaison en cours…</p>}
      {comparaison.isError && (refused(comparaison.error)
        ? <p role="alert" data-studio-comparaison-refus>Révision introuvable, ou vous n’y avez pas accès.</p>
        : <p role="alert">Comparaison indisponible. <button type="button" onClick={() => void comparaison.refetch()}>Réessayer</button></p>)}
      {d && comparaison.data && <>
        <p className="studio-comparaison-resolu">
          <span translate="no">{nomVariante(comparaison.data.from.variantId)}</span> · <span>Révision <span translate="no" title={comparaison.data.from.revisionId}>{comparaison.data.from.revisionId.slice(-8)}</span></span>
          {" → "}
          <span translate="no">{nomVariante(comparaison.data.to.variantId)}</span> · <span>Révision <span translate="no" title={comparaison.data.to.revisionId}>{comparaison.data.to.revisionId.slice(-8)}</span></span>
        </p>
        <Resume titre="Objets" c={d.resume.objets} attr="objets" />
        <Resume titre="Calques" c={d.resume.calques} attr="calques" />
        <Resume titre="Cotes" c={d.resume.cotes} attr="cotes" />
        {d.identiques && <p role="status" data-studio-comparaison-identiques>Les deux révisions sont identiques.</p>}
        <Superposer traces={superposition(d)} />
        <Legende />
        <h2>Différences</h2>
        <ul className="studio-comparaison-liste" data-studio-differences>
          {d.objets.filter((o) => o.etat !== "identique").map((o, i) => (
            <li key={`o${i}`} data-etat={o.etat} data-studio-difference={o.id}>
              <strong>{ETATS[o.etat]}</strong> <span>{TYPES[o.type] ?? o.type}</span> <code translate="no">{o.id}</code>
              <Proprietes liste={o.proprietes} />
              {o.deplacement && <Deplacement d={o.deplacement} />}
            </li>
          ))}
          {d.calques.filter((c) => c.etat !== "identique").map((c, i) => (
            <li key={`l${i}`} data-etat={c.etat} data-studio-difference={c.id}>
              <strong>{ETATS[c.etat]}</strong> <span>Calque</span> <code translate="no">{c.id}</code>
              <Proprietes liste={c.proprietes} />
            </li>
          ))}
          {d.cotes.filter((c) => c.etat !== "identique").map((c, i) => (
            <li key={`c${i}`} data-etat={c.etat} data-studio-difference={c.id}>
              <strong>{ETATS[c.etat]}</strong> <span>Cote</span> <code translate="no">{c.id}</code>
              <Proprietes liste={c.proprietes} />
              {c.deplacement && <Deplacement d={c.deplacement} />}
            </li>
          ))}
        </ul>
      </>}
      <Link to={cheminEtudeStudio(projectId, studyId)}>Revenir à l’étude</Link>
    </section>
  );
}

function Proprietes({ liste }: { liste: readonly string[] }) {
  if (!liste.length) return null;
  return <span className="studio-comparaison-proprietes" data-studio-proprietes={liste.join(" ")}>{liste.map((p) => <span key={p}>{PROPRIETES[p] ?? p}</span>)}</span>;
}

function Deplacement({ d }: { d: StudioDeplacement }) {
  return <span data-studio-deplacement>{`déplacé de dx = ${metres(d.dx)}, dy = ${metres(d.dy)}`}</span>;
}

function Resume({ titre, c, attr }: { titre: string; c: StudioCompteDifferences; attr: string }) {
  return (
    <p className="studio-comparaison-resume" data-studio-resume={attr}>
      <strong>{titre}</strong>
      <span data-etat="ajoute">{`${c.ajoute} ajouté(s)`}</span>
      <span data-etat="supprime">{`${c.supprime} supprimé(s)`}</span>
      <span data-etat="modifie">{`${c.modifie} modifié(s)`}</span>
      <span>{`${c.identique} identique(s)`}</span>
      {c.deplace > 0 && <span>{`dont ${c.deplace} déplacé(s)`}</span>}
    </p>
  );
}

function Trace({ t }: { t: TraceSuperposition }) {
  const props = { className: `studio-comparaison-trace is-${t.couche}`, "data-couche": t.couche, "data-id": t.id, vectorEffect: "non-scaling-stroke" as const };
  return t.forme.kind === "ligne"
    ? <line {...props} x1={t.forme.x1} y1={t.forme.y1} x2={t.forme.x2} y2={t.forme.y2} />
    : <rect {...props} x={t.forme.x} y={t.forme.y} width={t.forme.w} height={t.forme.h} />;
}

function Superposer({ traces }: { traces: ReturnType<typeof superposition> }) {
  if (!traces.viewBox) return <p data-studio-superposition-vide>Aucun objet à superposer.</p>;
  return (
    <svg className="studio-comparaison-svg" viewBox={traces.viewBox} role="img" aria-label="Superposition des deux révisions" data-studio-superposition preserveAspectRatio="xMidYMid meet">
      {traces.traces.map((t) => <Trace key={t.cle} t={t} />)}
    </svg>
  );
}

function Legende() {
  return (
    <ul className="studio-comparaison-legende" aria-label="Légende">
      <li><span className="is-avant" aria-hidden="true" />Avant (inchangé ou état d’origine)</li>
      <li><span className="is-ajoute" aria-hidden="true" />Ajouté</li>
      <li><span className="is-supprime" aria-hidden="true" />Supprimé</li>
      <li><span className="is-modifie" aria-hidden="true" />Modifié (état d’arrivée)</li>
    </ul>
  );
}

function SelecteurCote({ titre, cle, projectId, studyId, variants, valeur, onChange }: {
  titre: string; cle: "de" | "a"; projectId: string; studyId: string; variants: StudioVariantSummary[];
  valeur: CoteComparaisonStudio; onChange: (v: CoteComparaisonStudio) => void;
}) {
  const revisions = useQuery({
    queryKey: ["studio-revisions", projectId, studyId, valeur.variantId],
    queryFn: () => api.studioRevisions(projectId, studyId, valeur.variantId), retry,
  });
  const liste: StudioRevisionSummary[] = revisions.data?.revisions ?? [];
  const connue = variants.some((v) => v.id === valeur.variantId);
  return (
    <fieldset className="studio-comparaison-cote" data-studio-cote={cle}>
      <legend>{titre}</legend>
      <label htmlFor={`studio-cmp-${cle}-variante`}>Variante</label>
      <select id={`studio-cmp-${cle}-variante`} value={valeur.variantId} onChange={(e) => onChange({ variantId: e.target.value, revisionId: null })}>
        {!connue && <option value={valeur.variantId}>Variante inconnue</option>}
        {variants.map((v) => <option key={v.id} value={v.id} translate="no">{v.name}</option>)}
      </select>
      <label htmlFor={`studio-cmp-${cle}-revision`}>Révision</label>
      <select id={`studio-cmp-${cle}-revision`} value={valeur.revisionId ?? ""} onChange={(e) => onChange({ variantId: valeur.variantId, revisionId: e.target.value || null })}>
        <option value="">Tête (version courante)</option>
        {valeur.revisionId !== null && !liste.some((r) => r.id === valeur.revisionId) && <option value={valeur.revisionId}>Révision demandée</option>}
        {liste.map((r) => <option key={r.id} value={r.id}>{`Révision ${r.id.slice(-8)} — ${new Date(r.createdAt).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" })}`}</option>)}
      </select>
    </fieldset>
  );
}
