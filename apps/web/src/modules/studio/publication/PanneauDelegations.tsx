/**
 * Délégations d'approbation (EX-085) dans le panneau Publications : le propriétaire délègue l'approbation à un autre
 * participant pour une portée (projet, étude, variante, publication), une période (début inclus, fin exclue) et un
 * motif ; le délégant ou le propriétaire révoque, motif à l'appui. Chaque création, emploi et révocation est journalisé
 * par le serveur, qui revérifie tout (portée, période, droit actuel du délégant). Une délégation n'approuve rien par
 * elle-même : l'absence d'un approbateur ne vaut jamais accord.
 *
 * Règle d'or : « Déléguer l'approbation » (barre du panneau) et « Révoquer la délégation » (ligne de la délégation)
 * ont chacune leur icône, leur raccourci affiché et déclaré, et un gestionnaire clavier (`commandes-collaboration.ts`).
 */
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type StudioDelegation, type StudioDelegationScopeType, type StudioPublication, type StudioVariantSummary } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { declenche, propsRaccourci } from "../../collaboration/commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "../../collaboration/IconeCollaboration";
import { court, LIBELLE_ETAT_DELEGATION, LIBELLE_PORTEE_DELEGATION, messageRefus } from "./publication-ui";

const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };
/** Valeur d'un champ `datetime-local` (heure locale) pour un instant. */
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function PanneauDelegations({ projectId, studyId, variants, publications }: { projectId: string; studyId: string; variants: StudioVariantSummary[]; publications: StudioPublication[] }) {
  const cle = ["studio-delegations", projectId];
  const client = useQueryClient();
  const liste = useQuery({ queryKey: cle, queryFn: () => api.studioDelegations(projectId), retry: false });
  const membres = useQuery({ queryKey: ["studio-delegations-membres", projectId], queryFn: () => api.listMembers(projectId), retry: false });
  const [ouvert, setOuvert] = useState(false);
  const relire = async () => { await client.invalidateQueries({ queryKey: cle }); await client.invalidateQueries({ queryKey: ["studio-publications", projectId, studyId] }); };
  const proprietaire = membres.data?.you.role === "proprietaire";
  const delegations = liste.data?.delegations ?? [];
  if (!proprietaire && delegations.length === 0) return null;
  return (
    <section className="studio-delegations" aria-labelledby="studio-delegations-titre" data-studio-delegations
      onKeyDown={(e) => { if (proprietaire && declenche(e, "deleguer-approbation")) { e.preventDefault(); setOuvert(true); } }}>
      <h3 id="studio-delegations-titre">Délégations d’approbation</h3>
      <p className="studio-publications-sub">Une délégation porte une portée, une période, un délégant, un délégué et un motif ; elle ne transmet que l’approbation et le refus, jamais la diffusion. L’absence de l’approbateur ne vaut jamais accord.</p>
      {proprietaire && (
        <div className="studio-publication-actions">
          <button type="button" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)} data-studio-delegation-ouvrir {...propsRaccourci("deleguer-approbation")}>
            <IconeCollaboration commande="deleguer-approbation" /> Déléguer l’approbation <RaccourciCollaboration commande="deleguer-approbation" />
          </button>
        </div>
      )}
      {proprietaire && ouvert && membres.data && (
        <FormulaireDelegation projectId={projectId} studyId={studyId} variants={variants} publications={publications}
          candidats={membres.data.members.filter((m) => !m.accessExpired && m.userId !== membres.data!.you.userId)} surCree={async () => { setOuvert(false); await relire(); }} surFermer={() => setOuvert(false)} />
      )}
      {liste.isError && <p role="alert">Délégations indisponibles.</p>}
      {delegations.length > 0 && (
        <ul className="studio-publications-liste" data-studio-delegations-liste>
          {delegations.map((d) => <LigneDelegation key={d.id} projectId={projectId} d={d} surChange={relire} />)}
        </ul>
      )}
    </section>
  );
}

function FormulaireDelegation({ projectId, studyId, variants, publications, candidats, surCree, surFermer }: {
  projectId: string; studyId: string; variants: StudioVariantSummary[]; publications: StudioPublication[];
  candidats: { userId: string; email: string }[]; surCree: () => Promise<void>; surFermer: () => void;
}) {
  const maintenant = new Date();
  const [delegue, setDelegue] = useState(candidats[0]?.userId ?? "");
  const [portee, setPortee] = useState<StudioDelegationScopeType>("etude");
  const [cible, setCible] = useState("");
  const [debut, setDebut] = useState(local(maintenant));
  const [fin, setFin] = useState(local(new Date(maintenant.getTime() + 7 * 86_400_000)));
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const demande = useRef<{ cle: string; id: string } | null>(null);
  const choix = portee === "variante" ? variants.map((v) => ({ id: v.id, libelle: v.name })) : portee === "publication" ? publications.map((p) => ({ id: p.id, libelle: `${p.title} · ${court(p.id)}` })) : [];
  const scopeId = portee === "etude" ? studyId : portee === "projet" ? undefined : (cible || choix[0]?.id);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (enCours || !delegue || !motif.trim()) return;
    const input = { delegateId: delegue, scopeType: portee, ...(scopeId ? { scopeId } : {}), startsAt: new Date(debut).toISOString(), endsAt: new Date(fin).toISOString(), reason: motif.trim() };
    const cle = JSON.stringify(input);
    if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
    setEnCours(true); setErreur("");
    try {
      await api.createStudioDelegation(projectId, { ...input, requestId: demande.current.id });
      demande.current = null; setMotif("");
      await surCree();
    } catch (err) {
      setErreur(err instanceof ApiError ? messageRefus(err.status, err.body) : "Délégation non confirmée. Réessayez : la même demande sera rejouée sans doublon.");
    } finally { setEnCours(false); }
  }
  return (
    <form className="studio-create" onSubmit={(e) => void envoyer(e)} data-studio-delegation-formulaire>
      <label htmlFor="studio-delegation-delegue">Délégué</label>
      <select id="studio-delegation-delegue" value={delegue} onChange={(e) => setDelegue(e.target.value)} data-studio-delegation-delegue>
        {candidats.map((m) => <option key={m.userId} value={m.userId} translate="no">{m.email}</option>)}
      </select>
      {candidats.length === 0 && <p className="studio-info">Aucun autre participant ne lit ce projet.</p>}
      <label htmlFor="studio-delegation-portee">Portée</label>
      <select id="studio-delegation-portee" value={portee} onChange={(e) => { setPortee(e.target.value as StudioDelegationScopeType); setCible(""); }} data-studio-delegation-portee>
        {(["etude", "variante", "publication", "projet"] as const).map((t) => <option key={t} value={t}>{LIBELLE_PORTEE_DELEGATION[t]}</option>)}
      </select>
      {choix.length > 0 && (
        <select aria-label="Élément de la portée" value={cible || choix[0]!.id} onChange={(e) => setCible(e.target.value)} data-studio-delegation-cible>
          {choix.map((c) => <option key={c.id} value={c.id} translate="no">{c.libelle}</option>)}
        </select>
      )}
      <label htmlFor="studio-delegation-debut">Début</label>
      <input id="studio-delegation-debut" type="datetime-local" required value={debut} onChange={(e) => setDebut(e.target.value)} data-studio-delegation-debut />
      <label htmlFor="studio-delegation-fin">Fin (exclue)</label>
      <input id="studio-delegation-fin" type="datetime-local" required value={fin} onChange={(e) => setFin(e.target.value)} data-studio-delegation-fin />
      <label htmlFor="studio-delegation-motif">Motif (requis)</label>
      <textarea id="studio-delegation-motif" required maxLength={2000} value={motif} onChange={(e) => setMotif(e.target.value)} data-studio-delegation-motif />
      {erreur && <p role="alert" data-studio-delegation-erreur>{erreur}</p>}
      <div className="studio-publication-actions">
        <button disabled={enCours || !delegue || !motif.trim() || (portee !== "projet" && portee !== "etude" && !scopeId)} data-studio-delegation-creer>Créer la délégation</button>
        <button type="button" onClick={surFermer}>Annuler</button>
      </div>
    </form>
  );
}

function LigneDelegation({ projectId, d, surChange }: { projectId: string; d: StudioDelegation; surChange: () => Promise<void> }) {
  const [revoquer, setRevoquer] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  async function confirmer(e: FormEvent) {
    e.preventDefault();
    if (enCours || !motif.trim()) return;
    setEnCours(true); setErreur("");
    try { await api.revokeStudioDelegation(projectId, d.id, motif.trim()); setRevoquer(false); setMotif(""); await surChange(); }
    catch (err) { setErreur(err instanceof ApiError ? messageRefus(err.status, err.body) : "Révocation non confirmée : rechargez avant de réessayer."); }
    finally { setEnCours(false); }
  }
  return (
    <li className="studio-publication" data-studio-delegation={d.id} data-etat={d.state} tabIndex={-1}
      onKeyDown={(e) => { if (d.canRevoke && declenche(e, "revoquer-delegation")) { e.preventDefault(); setRevoquer(true); } }}>
      <div className="studio-publication-tete">
        <strong translate="no">{`${d.delegator.email} → ${d.delegate.email}`}</strong>
        <span className="studio-publication-statut" data-studio-delegation-etat>{LIBELLE_ETAT_DELEGATION[d.state]}</span>
      </div>
      <dl className="studio-publication-faits">
        <dt>Portée</dt><dd>{LIBELLE_PORTEE_DELEGATION[d.scope.type]}{d.scope.id ? <span translate="no">{` · ${court(d.scope.id)}`}</span> : null}</dd>
        <dt>Période</dt><dd translate="no">{`${date(d.startsAt)} → ${date(d.endsAt)}`}</dd>
        <dt>Motif</dt><dd translate="no">{d.reason}</dd>
        {d.revocation && <><dt>Révoquée par</dt><dd translate="no" data-studio-delegation-revocation>{`${d.revocation.by.email} · ${date(d.revocation.at)} · ${d.revocation.reason}`}</dd></>}
      </dl>
      <ol className="studio-publication-journal" data-studio-delegation-journal>
        {d.events.map((ev) => (
          <li key={ev.id}>
            <strong>{ev.action === "creer" ? "Création" : ev.action === "revoquer" ? "Révocation" : ev.publicationAction === "refuser" ? "Refus par délégation" : "Approbation par délégation"}</strong>{" "}
            <span translate="no">{`${ev.actor.email} · ${date(ev.createdAt)}${ev.publicationId ? ` · ${court(ev.publicationId)}` : ""}`}</span>
          </li>
        ))}
      </ol>
      {d.canRevoke && (
        <div className="studio-publication-actions">
          <button type="button" aria-pressed={revoquer} onClick={() => setRevoquer(!revoquer)} data-studio-delegation-revoquer {...propsRaccourci("revoquer-delegation")}>
            <IconeCollaboration commande="revoquer-delegation" /> Révoquer la délégation <RaccourciCollaboration commande="revoquer-delegation" />
          </button>
        </div>
      )}
      {revoquer && (
        <form className="studio-publication-confirmer" onSubmit={(e) => void confirmer(e)}>
          <label htmlFor={`studio-delegation-revocation-${d.id}`}>Motif de la révocation (requis)</label>
          <textarea id={`studio-delegation-revocation-${d.id}`} required maxLength={2000} value={motif} onChange={(e) => setMotif(e.target.value)} data-studio-delegation-revocation-motif />
          <button disabled={enCours || !motif.trim()} data-studio-delegation-revoquer-confirmer>Confirmer</button>
          <button type="button" onClick={() => setRevoquer(false)}>Annuler</button>
        </form>
      )}
      {erreur && <p role="alert">{erreur}</p>}
    </li>
  );
}
