/**
 * Espace d'organisation (organisations, phase 5 — concept partie 5, « Organization workspace »). Distinct de l'annuaire
 * du projet (Collaboration) : équipe interne, groupes, gabarits d'équipe versionnés, représentations dans les projets.
 * Une adhésion, un groupe, un gabarit ou un mandat n'ouvre AUCUN projet ; l'interface le dit à chaque action concernée.
 * La protection est au serveur (404 sans adhésion, 403 avec motif) ; les actions exigent le réseau, jamais en file.
 */
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError, organizationsApi, type ApplicationLine, type BusinessRole, type DepartureImpact, type DirectoryMember, type Organization, type OrganizationDetail,
  type OrganizationGroup, type OrganizationMandate, type OrganizationRole, type OrganizationStatus, type OrganizationTemplate, type TeamResponsibility, type TemplateEntry,
} from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import { useOnline } from "../../components/SyncIndicator";
import { apiMessage, ConfirmDialog, CopyLink } from "../../components/comptes/ComptesUI";
import {
  ISSUE_APPLICATION, ONGLETS, ongletDuClavier, RESPONSABILITE, RESPONSABILITES, ROLE_METIER, ROLE_ORGANISATION, ROLES_METIER, STATUT_ADHESION, STATUT_MANDAT,
  STATUT_ORGANISATION, type Onglet,
} from "./libelles";
import "./organisations.css";

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const OFFLINE = "Hors connexion : les actions de l’organisation exigent le réseau (jamais mises en attente).";
const PROJET_MASQUE = "Projet non accessible (nom masqué)";
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

type Msg = { ok: boolean; text: string } | null;
function Message({ msg }: { msg: Msg }) {
  return msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "h7-muted" : "form-error"}>{msg.text}</p> : null;
}
function Statut({ value, label }: { value: string; label: string }) {
  return <span className="admin-status org-status" data-status={value}>{label}</span>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Liste : mes organisations, mandats à accepter, création
// ---------------------------------------------------------------------------------------------------------------------

export function OrganisationsPage() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["organisations"], queryFn: organizationsApi.mine });
  const [msg, setMsg] = useState<Msg>(null);
  const answer = useMutation({
    mutationFn: ({ id, how }: { id: string; how: "accept" | "decline" | "resign" }) =>
      how === "accept" ? organizationsApi.acceptMandate(id) : how === "decline" ? organizationsApi.declineMandate(id) : organizationsApi.resignMandate(id),
    onSuccess: (r) => { setMsg({ ok: true, text: r.status === "actif" ? "Mandat accepté : vous représentez l’organisation dans ce projet. Votre accès au projet reste celui que le projet vous accorde." : r.status === "refuse" ? "Mandat refusé." : "Vous ne représentez plus l’organisation dans ce projet." }); void queryClient.invalidateQueries({ queryKey: ["organisations"] }); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "La réponse n’a pas pu être enregistrée.") }),
  });
  const current = q.data?.memberships.filter((m) => m.membership.status !== "terminee") ?? [];
  const past = q.data?.memberships.filter((m) => m.membership.status === "terminee") ?? [];
  const mandates = q.data?.mandates ?? [];
  return (
    <main className="admin-page org-page" data-organisations>
      <h1>Organisations</h1>
      <p className="h7-muted">Votre espace d’organisation : équipe interne, groupes de travail, gabarits d’équipe et représentations dans les projets. Une adhésion n’ouvre aucun projet : chaque projet donne ses accès séparément.</p>
      {!online && <p role="status" className="h7-muted">{OFFLINE}</p>}
      {q.isPending && <p role="status">Chargement des organisations…</p>}
      {q.isError && <p role="alert" className="form-error">Impossible de charger vos organisations.</p>}
      {mandates.length > 0 && (
        <section className="panel" aria-labelledby="org-mandats">
          <h2 id="org-mandats">Mes mandats de représentation</h2>
          <ul className="org-list">
            {mandates.map((m) => (
              <li key={m.id} data-mandate={m.id}>
                <div>
                  <strong translate="no">{m.organizationName}</strong> · {m.projectName ? <span translate="no">{m.projectName}</span> : PROJET_MASQUE} · <Statut value={m.status} label={STATUT_MANDAT[m.status]} />
                  {m.note && <p className="h7-muted" translate="no">{m.note}</p>}
                  {m.responsibilities.length > 0 && <small>Responsabilités : {m.responsibilities.map((r) => RESPONSABILITE[r]).join(", ")}</small>}
                  {m.replacesMandateId && <small className="org-block">Remplace le représentant actuel, dont le mandat prendra fin à votre acceptation.</small>}
                </div>
                <div className="admin-actions">
                  {m.status === "propose" && <>
                    <button type="button" className="button-primary" disabled={!online || answer.isPending} onClick={() => answer.mutate({ id: m.id, how: "accept" })} data-accept-mandate>Accepter le mandat</button>
                    <button type="button" className="button-secondary" disabled={!online || answer.isPending} onClick={() => answer.mutate({ id: m.id, how: "decline" })}>Refuser</button>
                  </>}
                  {m.status === "actif" && <button type="button" className="button-secondary" disabled={!online || answer.isPending} onClick={() => answer.mutate({ id: m.id, how: "resign" })}>Renoncer au mandat</button>}
                </div>
              </li>
            ))}
          </ul>
          <Message msg={msg} />
        </section>
      )}
      <section className="panel" aria-labelledby="org-miennes">
        <h2 id="org-miennes">Mes organisations</h2>
        {q.data && current.length === 0 && <p>Vous n’êtes membre d’aucune organisation. Créez-en une, ou acceptez l’invitation d’un administrateur.</p>}
        <ul className="org-list">
          {current.map(({ organization: o, membership: m }) => (
            <li key={m.membershipId} data-organisation={o.id}>
              <Link to={`/organisations/${o.id}`}><strong translate="no">{o.name}</strong></Link>
              <span>{ROLE_ORGANISATION[m.role]} · <Statut value={m.status} label={STATUT_ADHESION[m.status]} /> · <Statut value={o.status} label={STATUT_ORGANISATION[o.status]} /></span>
            </li>
          ))}
        </ul>
        {past.length > 0 && (
          <details>
            <summary>Adhésions passées</summary>
            <ul className="org-list">
              {past.map(({ organization: o, membership: m }) => (
                <li key={m.membershipId}><span translate="no">{o.name}</span><span>{date(m.startsOn)} → {date(m.endsOn)}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <CreateOrganisation />
    </main>
  );
}

function CreateOrganisation() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [details, setDetails] = useState("");
  // Clé de création : une double soumission (réseau lent, double clic) rend la même organisation.
  const [key, setKey] = useState(newKey);
  const [created, setCreated] = useState<Organization | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const m = useMutation({
    mutationFn: () => organizationsApi.create({ name: name.trim(), kind: kind.trim() || null, details: details.trim() || null, creationKey: key }),
    onSuccess: (r) => { setCreated(r.organization); setMsg({ ok: true, text: "Organisation créée : vous en êtes administrateur." }); setName(""); setKind(""); setDetails(""); setKey(newKey()); void queryClient.invalidateQueries({ queryKey: ["organisations"] }); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "L’organisation n’a pas pu être créée.") }),
  });
  return (
    <section className="panel" aria-labelledby="org-creer">
      <h2 id="org-creer">Créer une organisation</h2>
      <form className="account-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) m.mutate(); }}>
        <label>Nom de l’organisation<input name="orgName" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Type déclaré (saisie libre)<input name="orgKind" maxLength={120} value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Agence d’architecture, bureau d’études, maître d’ouvrage…" /></label>
        <label>Coordonnées professionnelles (facultatif)<textarea name="orgDetails" maxLength={2000} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        <small>Les types d’organisation sont en saisie libre en attendant la liste du maître d’ouvrage (OP-D4).</small>
        <button type="submit" className="button-primary" disabled={!online || m.isPending || !name.trim()} data-create-organisation>Créer l’organisation</button>
      </form>
      <Message msg={msg} />
      {created && <p><Link to={`/organisations/${created.id}`}>Ouvrir l’espace de l’organisation</Link></p>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Espace d'une organisation
// ---------------------------------------------------------------------------------------------------------------------

export function OrganisationPage() {
  const { orgId = "" } = useParams();
  const q = useQuery({ queryKey: ["organisation", orgId], queryFn: () => organizationsApi.get(orgId), retry: false });
  const [onglet, setOnglet] = useState<Onglet>("fiche");
  if (q.isPending) return <main className="admin-page org-page"><p role="status">Chargement de l’organisation…</p></main>;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <main className="admin-page org-page">
        <h1>Organisation</h1>
        <p role="alert" className="form-error">{notFound ? "Organisation introuvable, ou vous n’en êtes pas membre." : apiMessage(q.error, "Impossible de charger l’organisation.")}</p>
        <Link to="/organisations">Retour aux organisations</Link>
      </main>
    );
  }
  const d = q.data;
  const can = d.you.can;
  return (
    <main className="admin-page org-page" data-organisation-page={orgId}>
      <p><Link to="/organisations">← Organisations</Link></p>
      <h1 translate="no">{d.organization.name}</h1>
      <p><Statut value={d.organization.status} label={STATUT_ORGANISATION[d.organization.status]} /> · Votre rôle : {ROLE_ORGANISATION[d.you.role]} · <Statut value={d.you.status} label={STATUT_ADHESION[d.you.status]} /></p>
      {!can.read ? (
        <p role="status" data-organisation-summary>{d.you.status === "terminee" ? "Votre adhésion a pris fin : seul ce résumé reste visible." : "Votre adhésion est suspendue : l’espace de l’organisation n’est pas accessible."}</p>
      ) : (
        <>
          {d.organization.status === "suspendue" && <p role="status" className="support-banner">Organisation suspendue : seules la réactivation et la clôture restent possibles.</p>}
          <div className="org-tabs" role="tablist" aria-label="Rubriques de l’organisation">
            {ONGLETS.map((o) => (
              <button key={o.id} type="button" role="tab" id={`org-tab-${o.id}`} aria-selected={onglet === o.id} aria-controls={`org-panel-${o.id}`} tabIndex={onglet === o.id ? 0 : -1}
                onClick={() => setOnglet(o.id)}
                onKeyDown={(e) => { const n = ongletDuClavier(onglet, e.key); if (n) { e.preventDefault(); setOnglet(n); document.getElementById(`org-tab-${n}`)?.focus(); } }}>
                {o.libelle}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`org-panel-${onglet}`} aria-labelledby={`org-tab-${onglet}`} className="org-panel">
            {onglet === "fiche" && <Fiche d={d} />}
            {onglet === "membres" && <Membres d={d} />}
            {onglet === "groupes" && <Groupes d={d} />}
            {onglet === "gabarits" && <Gabarits d={d} />}
            {onglet === "projets" && <Projets d={d} />}
          </div>
        </>
      )}
    </main>
  );
}

function useInvalidate(orgId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["organisation", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["organisation-data", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["organisations"] });
  };
}

// --- Fiche -----------------------------------------------------------------------------------------------------------

function Fiche({ d }: { d: OrganizationDetail }) {
  const online = useOnline();
  const org = d.organization;
  const refresh = useInvalidate(org.id);
  const [name, setName] = useState(org.name);
  const [kind, setKind] = useState(org.kind ?? "");
  const [details, setDetails] = useState(org.details ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [confirm, setConfirm] = useState<OrganizationStatus | null>(null);
  const [typed, setTyped] = useState("");
  const save = useMutation({
    mutationFn: () => organizationsApi.update(org.id, { name: name.trim(), kind: kind.trim() || null, details: details.trim() || null }),
    onSuccess: () => { setMsg({ ok: true, text: "Fiche enregistrée." }); refresh(); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "La fiche n’a pas pu être enregistrée.") }),
  });
  const status = useMutation({
    mutationFn: (to: OrganizationStatus) => organizationsApi.setStatus(org.id, to, to === "close" ? typed : undefined),
    onSuccess: () => { setConfirm(null); setTyped(""); setMsg({ ok: true, text: "Statut de l’organisation changé." }); refresh(); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Le statut n’a pas pu être changé.") }),
  });
  return (
    <section aria-labelledby="org-fiche">
      <h2 id="org-fiche">Fiche de l’organisation</h2>
      <dl className="org-dl">
        <dt>Type déclaré</dt><dd translate="no">{org.kind || "—"}</dd>
        <dt>Coordonnées professionnelles</dt><dd translate="no" className="org-pre">{org.details || "—"}</dd>
        <dt>Administrateurs</dt><dd translate="no">{d.administrators.map((a) => a.name ?? "—").join(", ") || "—"}</dd>
        <dt>Créée le</dt><dd>{date(org.createdAt)}</dd>
      </dl>
      {d.you.can.manage && (
        <form className="account-form account-subsection" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) save.mutate(); }}>
          <h3>Modifier la fiche</h3>
          <label>Nom de l’organisation<input name="editName" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Type déclaré (saisie libre)<input name="editKind" maxLength={120} value={kind} onChange={(e) => setKind(e.target.value)} /></label>
          <label>Coordonnées professionnelles<textarea name="editDetails" maxLength={2000} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
          <button type="submit" className="button-primary" disabled={!online || save.isPending || !name.trim()}>Enregistrer la fiche</button>
        </form>
      )}
      {d.you.can.changeStatus && (
        <div className="account-subsection">
          <h3>Statut de l’organisation</h3>
          <p className="h7-muted">La suspension bloque toutes les opérations sauf la réactivation et la clôture. La clôture est définitive : elle termine toutes les adhésions et tous les mandats ; l’historique et les participations aux projets restent.</p>
          <div className="admin-actions">
            {org.status === "active" && <button type="button" className="button-secondary" disabled={!online} onClick={() => setConfirm("suspendue")}>Suspendre l’organisation</button>}
            {org.status === "suspendue" && <button type="button" className="button-secondary" disabled={!online} onClick={() => setConfirm("active")}>Réactiver l’organisation</button>}
            {org.status !== "close" && <button type="button" className="danger-button" disabled={!online} onClick={() => setConfirm("close")} data-close-organisation>Clore l’organisation</button>}
          </div>
        </div>
      )}
      <Message msg={msg} />
      {confirm && (
        <ConfirmDialog title={confirm === "close" ? "Clore l’organisation" : confirm === "suspendue" ? "Suspendre l’organisation" : "Réactiver l’organisation"}
          confirmLabel={confirm === "close" ? "Clore définitivement" : confirm === "suspendue" ? "Suspendre" : "Réactiver"} danger={confirm !== "active"} busy={status.isPending}
          confirmDisabled={confirm === "close" && typed.trim() !== org.name} onConfirm={() => status.mutate(confirm)} onClose={() => { setConfirm(null); setTyped(""); }}>
          {confirm === "close" ? (
            <>
              <p>Toutes les adhésions et tous les mandats prendront fin, définitivement ; les invitations en attente seront annulées. Les projets dont l’organisation est la partie propriétaire garderont cette déclaration : leur continuité reste à décider par leur propriétaire.</p>
              <label className="account-form">Saisissez le nom de l’organisation pour confirmer<input name="confirmName" value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
            </>
          ) : confirm === "suspendue" ? <p>Plus aucune opération ne sera possible dans l’organisation, sauf la réactivation et la clôture.</p> : <p>Les opérations de l’organisation redeviendront possibles.</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}

// --- Membres : annuaire interne, invitations, départ -------------------------------------------------------------------

function Membres({ d }: { d: OrganizationDetail }) {
  const online = useOnline();
  const orgId = d.organization.id;
  const refresh = useInvalidate(orgId);
  const q = useQuery({ queryKey: ["organisation-data", orgId, "directory"], queryFn: () => organizationsApi.directory(orgId) });
  const [msg, setMsg] = useState<Msg>(null);
  const [leaving, setLeaving] = useState<{ member: DirectoryMember; impact: DepartureImpact } | null>(null);
  const change = useMutation({
    mutationFn: ({ m, input }: { m: DirectoryMember; input: { role?: OrganizationRole; status?: "active" | "suspendue" } }) => organizationsApi.updateMembership(orgId, m.membershipId, input),
    onSuccess: () => { setMsg({ ok: true, text: "Adhésion modifiée." }); refresh(); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "L’adhésion n’a pas pu être modifiée.") }),
  });
  const preview = useMutation({
    mutationFn: async (m: DirectoryMember) => ({ member: m, impact: (await organizationsApi.departure(orgId, m.membershipId)).impact }),
    onSuccess: (r) => setLeaving(r),
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Les conséquences du départ n’ont pas pu être lues.") }),
  });
  const end = useMutation({
    mutationFn: (m: DirectoryMember) => organizationsApi.endMembership(orgId, m.membershipId),
    onSuccess: () => { setLeaving(null); setMsg({ ok: true, text: "Départ enregistré : groupes quittés, mandats terminés ; les participations aux projets restent à revoir par chaque projet." }); refresh(); },
    onError: (err) => { setLeaving(null); setMsg({ ok: false, text: apiMessage(err, "Le départ n’a pas pu être enregistré.") }); },
  });
  const manage = d.you.can.manage;
  const members = q.data?.members ?? [];
  const active = members.filter((m) => m.status !== "terminee");
  const ended = members.filter((m) => m.status === "terminee");
  return (
    <section aria-labelledby="org-annuaire">
      <h2 id="org-annuaire">Annuaire interne</h2>
      <p className="h7-muted">L’annuaire interne de l’organisation est distinct de l’annuaire d’un projet : les participants d’un projet n’y ont pas accès.</p>
      {q.isPending && <p role="status">Chargement de l’annuaire…</p>}
      <ul className="org-list" data-directory>
        {active.map((m) => (
          <li key={m.membershipId} data-member={m.membershipId}>
            <div>
              <strong translate="no">{m.name ?? "—"}</strong>{m.you && <> (vous)</>}
              {m.email && <> · <span translate="no">{m.email}</span></>}
              <span className="org-block">{ROLE_ORGANISATION[m.role]}{m.jobTitle ? <> · <span translate="no">{m.jobTitle}</span></> : null} · <Statut value={m.status} label={STATUT_ADHESION[m.status]} /> · depuis le {date(m.startsOn)}</span>
              {m.groups.length > 0 && <small className="org-block">Groupes : <span translate="no">{m.groups.map((g) => g.name).join(", ")}</span></small>}
            </div>
            <div className="admin-actions">
              {manage && !m.you && <button type="button" className="button-secondary" disabled={!online || change.isPending} onClick={() => change.mutate({ m, input: { role: m.role === "administrateur" ? "membre" : "administrateur" } })}>{m.role === "administrateur" ? "Retirer le rôle d’administrateur" : "Nommer administrateur"}</button>}
              {manage && !m.you && <button type="button" className="button-secondary" disabled={!online || change.isPending} onClick={() => change.mutate({ m, input: { status: m.status === "active" ? "suspendue" : "active" } })}>{m.status === "active" ? "Suspendre l’adhésion" : "Réactiver l’adhésion"}</button>}
              {(manage || m.you) && <button type="button" className="danger-button" disabled={!online || preview.isPending} onClick={() => preview.mutate(m)} data-end-membership={m.membershipId}>{m.you ? "Quitter l’organisation" : "Mettre fin à l’adhésion"}</button>}
            </div>
          </li>
        ))}
      </ul>
      {ended.length > 0 && (
        <details>
          <summary>Anciens membres</summary>
          <ul className="org-list">{ended.map((m) => <li key={m.membershipId}><span translate="no">{m.name ?? "—"}</span><span>{date(m.startsOn)} → {date(m.endsOn)}</span></li>)}</ul>
        </details>
      )}
      <Message msg={msg} />
      {manage && <Invitations orgId={orgId} />}
      {leaving && (
        <ConfirmDialog title={leaving.member.you ? "Quitter l’organisation" : "Mettre fin à l’adhésion"} confirmLabel="Confirmer le départ" danger busy={end.isPending}
          onConfirm={() => end.mutate(leaving.member)} onClose={() => setLeaving(null)}>
          <DepartureConsequences impact={leaving.impact} />
        </ConfirmDialog>
      )}
    </section>
  );
}

function DepartureConsequences({ impact }: { impact: DepartureImpact }) {
  return (
    <div data-departure-impact>
      <p>Conséquences du départ :</p>
      <ul>
        <li>Groupes quittés : {impact.groups.length ? <span translate="no">{impact.groups.map((g) => g.name).join(", ")}</span> : "aucun"}</li>
        <li>Mandats de représentation : {impact.mandates.length ? impact.mandates.map((m) => <span key={m.id} className="org-block">{m.projectName ? <span translate="no">{m.projectName}</span> : PROJET_MASQUE} — {m.consequence === "termine" ? "mandat terminé : l’organisation devra mandater un nouveau représentant" : "proposition annulée"}</span>) : "aucun"}</li>
        <li>Participations aux projets au nom de l’organisation : {impact.representations.length ? `${impact.representations.length} à revoir par chaque projet (inchangées ici)` : "aucune"}</li>
      </ul>
      <p className="h7-muted">Aucun accès de projet n’est modifié par ce départ : les accès accordés par un projet suivent leurs propres règles.</p>
    </div>
  );
}

function Invitations({ orgId }: { orgId: string }) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["organisation-data", orgId, "invitations"], queryFn: () => organizationsApi.invitations(orgId) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("membre");
  const [jobTitle, setJobTitle] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const invite = useMutation({
    mutationFn: () => organizationsApi.invite(orgId, { email: email.trim(), role, jobTitle: jobTitle.trim() || null }),
    onSuccess: (r) => {
      setLink(r.mail.link ?? null);
      setMsg({ ok: true, text: r.resent ? "Invitation renouvelée : l’ancien lien ne fonctionne plus." : "Invitation créée : l’adhésion naîtra de son acceptation." });
      setEmail(""); setJobTitle("");
      void queryClient.invalidateQueries({ queryKey: ["organisation-data", orgId, "invitations"] });
    },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "L’invitation n’a pas pu être créée.") }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => organizationsApi.cancelInvitation(orgId, id),
    onSuccess: () => { setLink(null); void queryClient.invalidateQueries({ queryKey: ["organisation-data", orgId, "invitations"] }); },
  });
  return (
    <div className="account-subsection" aria-labelledby="org-inviter">
      <h3 id="org-inviter">Inviter un membre</h3>
      <form className="admin-filters" onSubmit={(e: FormEvent) => { e.preventDefault(); if (email.trim()) invite.mutate(); }}>
        <label>Adresse e-mail<input type="email" name="memberEmail" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Rôle dans l’organisation<select name="memberRole" value={role} onChange={(e) => setRole(e.target.value === "administrateur" ? "administrateur" : "membre")}>
          <option value="membre">Membre</option><option value="administrateur">Administrateur</option>
        </select></label>
        <label>Fonction (saisie libre)<input name="memberJobTitle" maxLength={120} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label>
        <button type="submit" className="button-primary" disabled={!online || invite.isPending || !email.trim()} data-invite-member>Envoyer l’invitation</button>
      </form>
      <small>L’invitation est nominative et valable 7 jours ; seule l’adresse invitée peut l’accepter. Elle ne donne accès à aucun projet.</small>
      <Message msg={msg} />
      {link && <CopyLink link={link} />}
      {(q.data?.invitations.length ?? 0) > 0 && (
        <ul className="sessions-list" data-org-invitations>
          {q.data!.invitations.map((i) => (
            <li key={i.id}>
              <span><span translate="no">{i.email}</span> <small>· {i.organizationRole ? ROLE_ORGANISATION[i.organizationRole] : "—"} · valable jusqu’au {date(i.expiresAt)}</small></span>
              <button type="button" className="link-button" disabled={!online || cancel.isPending} onClick={() => cancel.mutate(i.id)}>Annuler l’invitation</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Groupes -----------------------------------------------------------------------------------------------------------

function Groupes({ d }: { d: OrganizationDetail }) {
  const online = useOnline();
  const orgId = d.organization.id;
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["organisation-data", orgId, "groups"], queryFn: () => organizationsApi.groups(orgId) });
  const directory = useQuery({ queryKey: ["organisation-data", orgId, "directory"], queryFn: () => organizationsApi.directory(orgId) });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const done = (text: string) => { setMsg({ ok: true, text }); void queryClient.invalidateQueries({ queryKey: ["organisation-data", orgId] }); };
  const fail = (fallback: string) => (err: unknown) => setMsg({ ok: false, text: apiMessage(err, fallback) });
  const create = useMutation({ mutationFn: () => organizationsApi.createGroup(orgId, { name: name.trim(), description: description.trim() || null }), onSuccess: () => { setName(""); setDescription(""); done("Groupe créé. Un groupe n’ouvre aucun projet."); }, onError: fail("Le groupe n’a pas pu être créé.") });
  const add = useMutation({ mutationFn: ({ g, m }: { g: string; m: string }) => organizationsApi.addToGroup(orgId, g, m), onSuccess: () => done("Membre ajouté au groupe : aucun accès de projet n’est accordé."), onError: fail("Le membre n’a pas pu être ajouté.") });
  const remove = useMutation({ mutationFn: ({ g, m }: { g: string; m: string }) => organizationsApi.removeFromGroup(orgId, g, m), onSuccess: () => done("Membre retiré du groupe : aucun accès de projet n’est retiré."), onError: fail("Le membre n’a pas pu être retiré.") });
  const archive = useMutation({ mutationFn: (g: OrganizationGroup) => organizationsApi.updateGroup(orgId, g.id, { status: g.status === "active" ? "archive" : "active" }), onSuccess: () => done("Groupe mis à jour."), onError: fail("Le groupe n’a pas pu être modifié.") });
  const manage = d.you.can.manage;
  const people = (directory.data?.members ?? []).filter((m) => m.status !== "terminee");
  const nameOf = (id: string) => people.find((p) => p.membershipId === id)?.name ?? "—";
  return (
    <section aria-labelledby="org-groupes">
      <h2 id="org-groupes">Groupes de travail</h2>
      <p className="support-banner">Un groupe sert à sélectionner des personnes (discipline, service…). Il n’ouvre aucun projet : aucun accès n’est accordé ni retiré par un groupe.</p>
      {groups.isPending && <p role="status">Chargement des groupes…</p>}
      <ul className="org-list" data-groups>
        {(groups.data?.groups ?? []).map((g) => (
          <li key={g.id} data-group={g.id}>
            <div>
              <strong translate="no">{g.name}</strong> · <Statut value={g.status} label={g.status === "active" ? "Actif" : "Archivé"} />
              {g.description && <p className="h7-muted" translate="no">{g.description}</p>}
              <ul className="org-chips">
                {g.members.map((m) => (
                  <li key={m}><span translate="no">{nameOf(m)}</span>{manage && <button type="button" className="link-button" aria-label="Retirer du groupe" title="Retirer du groupe" disabled={!online} onClick={() => remove.mutate({ g: g.id, m })}>×</button>}</li>
                ))}
                {g.members.length === 0 && <li>Aucun membre</li>}
              </ul>
            </div>
            {manage && (
              <div className="admin-actions">
                {g.status === "active" && <AddToGroup people={people.filter((p) => !g.members.includes(p.membershipId))} disabled={!online || add.isPending} onAdd={(m) => add.mutate({ g: g.id, m })} />}
                <button type="button" className="button-secondary" disabled={!online || archive.isPending} onClick={() => archive.mutate(g)}>{g.status === "active" ? "Archiver le groupe" : "Réactiver le groupe"}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {groups.data && groups.data.groups.length === 0 && <p>Aucun groupe pour l’instant.</p>}
      {manage && (
        <form className="account-form account-subsection" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <h3>Créer un groupe</h3>
          <label>Nom du groupe<input name="groupName" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Description (facultatif)<input name="groupDescription" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <button type="submit" className="button-primary" disabled={!online || create.isPending || !name.trim()} data-create-group>Créer le groupe</button>
        </form>
      )}
      <Message msg={msg} />
    </section>
  );
}

function AddToGroup({ people, disabled, onAdd }: { people: DirectoryMember[]; disabled: boolean; onAdd: (membershipId: string) => void }) {
  const [choice, setChoice] = useState("");
  if (!people.length) return null;
  return (
    <form className="admin-filters org-inline" onSubmit={(e: FormEvent) => { e.preventDefault(); if (choice) { onAdd(choice); setChoice(""); } }}>
      <label>Ajouter un membre<select name="groupMember" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">Choisir…</option>
        {people.map((p) => <option key={p.membershipId} value={p.membershipId} translate="no">{p.name ?? "—"}</option>)}
      </select></label>
      <button type="submit" className="button-secondary" disabled={disabled || !choice}>Ajouter au groupe</button>
    </form>
  );
}

// --- Gabarits ----------------------------------------------------------------------------------------------------------

const blankEntry = (): TemplateEntry => ({ label: "", businessRole: null, responsibilities: [], proposedRoles: [], groupId: null });

function EntriesEditor({ entries, onChange, groups }: { entries: TemplateEntry[]; onChange: (e: TemplateEntry[]) => void; groups: OrganizationGroup[] }) {
  const set = (i: number, patch: Partial<TemplateEntry>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="org-entries">
      {entries.map((e, i) => (
        <fieldset key={i} className="org-entry">
          <legend>Ligne {i + 1}</legend>
          <label>Intitulé<input name={`entryLabel${i}`} required maxLength={120} value={e.label} onChange={(ev) => set(i, { label: ev.target.value })} /></label>
          <label>Rôle métier (saisie libre)<input name={`entryRole${i}`} maxLength={120} value={e.businessRole ?? ""} onChange={(ev) => set(i, { businessRole: ev.target.value || null })} /></label>
          <div role="group" aria-label="Responsabilités" className="org-checks">
            <span>Responsabilités</span>
            {RESPONSABILITES.map((r) => <label key={r} className="h7-checkbox"><input type="checkbox" checked={e.responsibilities.includes(r)} onChange={() => set(i, { responsibilities: toggle<TeamResponsibility>(e.responsibilities, r) })} />{RESPONSABILITE[r]}</label>)}
          </div>
          <div role="group" aria-label="Rôles proposés (jamais accordés par le gabarit)" className="org-checks">
            <span>Rôles proposés (jamais accordés par le gabarit)</span>
            {ROLES_METIER.map((r) => <label key={r} className="h7-checkbox"><input type="checkbox" checked={e.proposedRoles.includes(r)} onChange={() => set(i, { proposedRoles: toggle<BusinessRole>(e.proposedRoles, r) })} />{ROLE_METIER[r]}</label>)}
          </div>
          {groups.length > 0 && (
            <label>Groupe où choisir la personne<select name={`entryGroup${i}`} value={e.groupId ?? ""} onChange={(ev) => set(i, { groupId: ev.target.value || null })}>
              <option value="">Aucun</option>
              {groups.map((g) => <option key={g.id} value={g.id} translate="no">{g.name}</option>)}
            </select></label>
          )}
          {entries.length > 1 && <button type="button" className="link-button" onClick={() => onChange(entries.filter((_x, j) => j !== i))}>Retirer la ligne</button>}
        </fieldset>
      ))}
      <button type="button" className="button-secondary" onClick={() => onChange([...entries, blankEntry()])}>Ajouter une ligne</button>
    </div>
  );
}

function Gabarits({ d }: { d: OrganizationDetail }) {
  const online = useOnline();
  const orgId = d.organization.id;
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["organisation-data", orgId, "templates"], queryFn: () => organizationsApi.templates(orgId) });
  const groups = useQuery({ queryKey: ["organisation-data", orgId, "groups"], queryFn: () => organizationsApi.groups(orgId) });
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<TemplateEntry[]>([blankEntry()]);
  const [editing, setEditing] = useState<{ template: OrganizationTemplate; entries: TemplateEntry[] } | null>(null);
  const [applying, setApplying] = useState<{ template: OrganizationTemplate; version: number } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["organisation-data", orgId, "templates"] });
  const create = useMutation({
    mutationFn: () => organizationsApi.createTemplate(orgId, { name: name.trim(), entries }),
    onSuccess: () => { setName(""); setEntries([blankEntry()]); setMsg({ ok: true, text: "Gabarit créé (version 1)." }); refresh(); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Le gabarit n’a pas pu être créé.") }),
  });
  const version = useMutation({
    mutationFn: (e: { template: OrganizationTemplate; entries: TemplateEntry[] }) => organizationsApi.createVersion(orgId, e.template.id, { entries: e.entries }),
    onSuccess: () => { setEditing(null); setMsg({ ok: true, text: "Nouvelle version enregistrée. Les projets où une version antérieure a été appliquée ne changent pas." }); refresh(); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "La version n’a pas pu être enregistrée.") }),
  });
  const manage = d.you.can.manage;
  const groupList = groups.data?.groups.filter((g) => g.status === "active") ?? [];
  return (
    <section aria-labelledby="org-gabarits">
      <h2 id="org-gabarits">Gabarits d’équipe</h2>
      <p className="h7-muted">Un gabarit est une configuration de départ versionnée. Une version ne se modifie jamais : un changement crée une nouvelle version, sans effet sur les projets existants tant qu’elle n’y est pas appliquée.</p>
      {templates.isPending && <p role="status">Chargement des gabarits…</p>}
      {(templates.data?.templates ?? []).map((t) => {
        const last = t.versions[t.versions.length - 1];
        return (
          <article key={t.id} className="panel org-template" data-template={t.id}>
            <h3 translate="no">{t.name}</h3>
            {t.versions.map((v) => (
              <details key={v.id} open={v === last}>
                <summary>Version {v.version} · {date(v.createdAt)}{v.applications.length ? ` · appliquée à ${v.applications.length} projet(s)` : ""}</summary>
                <ul className="org-list">
                  {v.entries.map((e, i) => (
                    <li key={i}>
                      <span><strong translate="no">{e.label}</strong>{e.businessRole ? <> · <span translate="no">{e.businessRole}</span></> : null}</span>
                      <small>{e.responsibilities.map((r) => RESPONSABILITE[r]).join(", ") || "—"} · rôles proposés : {e.proposedRoles.map((r) => ROLE_METIER[r]).join(", ") || "aucun"}</small>
                    </li>
                  ))}
                </ul>
                {manage && <button type="button" className="button-secondary" disabled={!online} onClick={() => setApplying({ template: t, version: v.version })} data-apply-version={v.version}>Appliquer la version {v.version} à un projet</button>}
              </details>
            ))}
            {manage && last && <button type="button" className="button-secondary" disabled={!online} onClick={() => setEditing({ template: t, entries: last.entries.map((e) => ({ ...e })) })} data-new-version>Créer une nouvelle version</button>}
            {editing?.template.id === t.id && (
              <form className="account-subsection" onSubmit={(e: FormEvent) => { e.preventDefault(); version.mutate(editing); }}>
                <EntriesEditor entries={editing.entries} onChange={(es) => setEditing({ ...editing, entries: es })} groups={groupList} />
                <div className="admin-actions">
                  <button type="submit" className="button-primary" disabled={!online || version.isPending} data-save-version>Enregistrer la nouvelle version</button>
                  <button type="button" className="button-secondary" onClick={() => setEditing(null)}>Annuler</button>
                </div>
              </form>
            )}
            {applying?.template.id === t.id && <ApplyTemplate orgId={orgId} template={t} version={applying.version} onClose={() => { setApplying(null); refresh(); }} />}
          </article>
        );
      })}
      {templates.data && templates.data.templates.length === 0 && <p>Aucun gabarit pour l’instant.</p>}
      {manage && (
        <form className="account-subsection" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <h3>Créer un gabarit</h3>
          <label className="account-form">Nom du gabarit<input name="templateName" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <EntriesEditor entries={entries} onChange={setEntries} groups={groupList} />
          <button type="submit" className="button-primary" disabled={!online || create.isPending || !name.trim()} data-create-template>Créer le gabarit</button>
        </form>
      )}
      <Message msg={msg} />
    </section>
  );
}

function ApplyTemplate({ orgId, template, version, onClose }: { orgId: string; template: OrganizationTemplate; version: number; onClose: () => void }) {
  const online = useOnline();
  const projects = useQuery({ queryKey: ["organisation-data", orgId, "projects"], queryFn: () => organizationsApi.projects(orgId) });
  const directory = useQuery({ queryKey: ["organisation-data", orgId, "directory"], queryFn: () => organizationsApi.directory(orgId) });
  const groups = useQuery({ queryKey: ["organisation-data", orgId, "groups"], queryFn: () => organizationsApi.groups(orgId) });
  const entries = template.versions.find((v) => v.version === version)?.entries ?? [];
  const [projectId, setProjectId] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [plan, setPlan] = useState<ApplicationLine[] | null>(null);
  const [already, setAlready] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const preview = useMutation({
    mutationFn: () => organizationsApi.previewTemplate(orgId, template.id, version, { projectId, assignments }),
    onSuccess: (r) => { setPlan(r.plan); setAlready(r.alreadyApplied); setMsg(null); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "L’aperçu n’a pas pu être calculé.") }),
  });
  const apply = useMutation({
    mutationFn: () => organizationsApi.applyTemplate(orgId, template.id, version, { projectId, assignments }),
    onSuccess: (r) => { setPlan(r.application.plan); setMsg({ ok: true, text: r.replayed ? "Cette version était déjà appliquée à ce projet : rien n’a été ajouté." : "Gabarit appliqué : fiches contact ajoutées, aucun accès accordé." }); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Le gabarit n’a pas pu être appliqué.") }),
  });
  const members = (directory.data?.members ?? []).filter((m) => m.status === "active");
  const owned = projects.data?.yourProjects ?? [];
  const nameOfPerson = (id: string | null) => members.find((m) => m.personId === id)?.name ?? "—";
  return (
    <div className="account-subsection" data-apply-template>
      <h4>Appliquer la version {version}</h4>
      <p className="h7-muted">L’application ajoute au projet des fiches « contact » pour les personnes choisies, sans aucun accès : les rôles proposés restent à accorder explicitement par le projet. Aucune participation existante n’est modifiée.</p>
      {owned.length === 0 ? <p>Vous ne possédez aucun projet : seul le propriétaire d’un projet peut y appliquer un gabarit.</p> : (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (projectId) preview.mutate(); }}>
          <label className="account-form">Projet<select name="applyProject" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPlan(null); }}>
            <option value="">Choisir…</option>
            {owned.map((p) => <option key={p.projectId} value={p.projectId} translate="no">{p.name}</option>)}
          </select></label>
          {entries.map((e, i) => {
            const group = e.groupId ? groups.data?.groups.find((g) => g.id === e.groupId) : null;
            const pool = group ? members.filter((m) => group.members.includes(m.membershipId)) : members;
            return (
              <label key={i} className="account-form"><span><span translate="no">{e.label}</span>{group ? <> — groupe <span translate="no">{group.name}</span></> : null}</span>
                <select name={`assign${i}`} value={assignments[String(i)] ?? ""} onChange={(ev) => { setAssignments({ ...assignments, [String(i)]: ev.target.value || null }); setPlan(null); }}>
                  <option value="">Personne non choisie</option>
                  {pool.map((m) => <option key={m.personId} value={m.personId} translate="no">{m.name ?? "—"}</option>)}
                </select>
              </label>
            );
          })}
          <div className="admin-actions">
            <button type="submit" className="button-secondary" disabled={!online || !projectId || preview.isPending} data-preview-template>Aperçu</button>
            <button type="button" className="link-button" onClick={onClose}>Fermer</button>
          </div>
        </form>
      )}
      {plan && (
        <>
          {already && <p role="status">Cette version a déjà été appliquée à ce projet le {date(already)} : la confirmer ne change rien.</p>}
          <ul className="org-list" data-template-plan>
            {plan.map((l) => <li key={l.index} data-outcome={l.outcome}><span><span translate="no">{l.label}</span> · <span translate="no">{nameOfPerson(l.personId)}</span></span><small>{ISSUE_APPLICATION[l.outcome]}{l.proposedRoles.length ? ` · rôles proposés, non accordés : ${l.proposedRoles.map((r) => ROLE_METIER[r]).join(", ")}` : ""}</small></li>)}
          </ul>
          {!apply.isSuccess && <button type="button" className="button-primary" disabled={!online || apply.isPending} onClick={() => apply.mutate()} data-confirm-apply>Confirmer l’application</button>}
        </>
      )}
      <Message msg={msg} />
    </div>
  );
}

// --- Projets : vue transversale, partie propriétaire, mandats -------------------------------------------------------------
/** État côté projet d'un mandat (reliquat de la phase 5), lu par les administrateurs. */
const ETAT_COTE_PROJET: Record<NonNullable<OrganizationMandate["projectSide"]>, string> = {
  non_invite: "non invité", invitation_en_attente: "invitation en attente", participation_active: "participation active", terminee: "participation terminée",
};

function Projets({ d }: { d: OrganizationDetail }) {
  const online = useOnline();
  const orgId = d.organization.id;
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["organisation-data", orgId, "projects"], queryFn: () => organizationsApi.projects(orgId) });
  const directory = useQuery({ queryKey: ["organisation-data", orgId, "directory"], queryFn: () => organizationsApi.directory(orgId) });
  const [msg, setMsg] = useState<Msg>(null);
  const [proposing, setProposing] = useState<{ projectId: string; replaces: OrganizationMandate | null } | null>(null);
  const done = (text: string) => { setMsg({ ok: true, text }); void queryClient.invalidateQueries({ queryKey: ["organisation-data", orgId] }); };
  const fail = (fallback: string) => (err: unknown) => setMsg({ ok: false, text: apiMessage(err, fallback) });
  const record = useMutation({ mutationFn: (p: string) => organizationsApi.recordParticipation(orgId, p), onSuccess: () => done("L’organisation est enregistrée comme partie au projet. Aucun accès n’est accordé."), onError: fail("L’organisation n’a pas pu être enregistrée.") });
  const owner = useMutation({ mutationFn: ({ p, on }: { p: string; on: boolean }) => (on ? organizationsApi.declareOwner(orgId, p) : organizationsApi.clearOwner(orgId, p)), onSuccess: (_r, v) => done(v.on ? "Partie propriétaire déclarée. Aucun droit ne change : vous restez le gardien du projet." : "Déclaration retirée. Aucun droit ne change."), onError: fail("La partie propriétaire n’a pas pu être changée.") });
  const mandate = useMutation({
    mutationFn: ({ id, how }: { id: string; how: "cancel" | "end" }) => (how === "cancel" ? organizationsApi.cancelMandate(orgId, id) : organizationsApi.endMandate(orgId, id)),
    onSuccess: (_r, v) => done(v.how === "cancel" ? "Proposition de mandat annulée." : "Mandat terminé : l’organisation n’a plus de représentant dans ce projet."), onError: fail("Le mandat n’a pas pu être changé."),
  });
  const manage = d.you.can.manage;
  const rows = q.data?.projects ?? [];
  return (
    <section aria-labelledby="org-projets">
      <h2 id="org-projets">Projets de l’organisation</h2>
      <p className="h7-muted">Projets dont l’organisation est la partie propriétaire ou une partie participante, et ses représentants. Le nom d’un projet reste masqué si vous n’y avez pas accès.</p>
      {q.isPending && <p role="status">Chargement des projets…</p>}
      {q.data && rows.length === 0 && <p>Aucun projet associé à l’organisation.</p>}
      <ul className="org-list" data-org-projects>
        {rows.map((p) => {
          const active = p.mandates.find((m) => m.status === "actif") ?? null;
          return (
            <li key={p.projectId} data-org-project={p.projectId}>
              <div>
                <strong>{p.name ? <span translate="no">{p.name}</span> : PROJET_MASQUE}</strong>
                <span className="org-block">{p.owned ? "Partie propriétaire" : null}{p.owned && p.participation ? " · " : null}{p.participation ? "Partie participante" : null}</span>
                {p.mandates.map((m) => (
                  <span key={m.id} className="org-block" data-org-mandate={m.id}>Représentant : <span translate="no">{m.representativeName ?? "—"}</span> · <Statut value={m.status} label={STATUT_MANDAT[m.status]} />
                    {m.projectSide && (
                      // État côté projet (lecture seule) : l'invitation et l'accès restent décidés par le propriétaire du projet.
                      <span className="h7-chip" data-org-mandate-side={m.projectSide} title="Côté projet : décidé par le propriétaire du projet ; un mandat n’ouvre aucun accès.">{`Côté projet : ${ETAT_COTE_PROJET[m.projectSide]}`}</span>
                    )}
                    {manage && m.status === "propose" && <button type="button" className="link-button" disabled={!online} onClick={() => mandate.mutate({ id: m.id, how: "cancel" })}>Annuler la proposition</button>}
                    {manage && m.status === "actif" && <button type="button" className="link-button" disabled={!online} onClick={() => mandate.mutate({ id: m.id, how: "end" })}>Mettre fin au mandat</button>}
                  </span>
                ))}
              </div>
              {manage && p.participation && (
                <div className="admin-actions">
                  <button type="button" className="button-secondary" disabled={!online} onClick={() => setProposing({ projectId: p.projectId, replaces: active })} data-propose-mandate={p.projectId}>{active ? "Remplacer le représentant" : "Mandater un représentant"}</button>
                </div>
              )}
              {proposing?.projectId === p.projectId && (
                <ProposeMandate orgId={orgId} projectId={p.projectId} replaces={proposing.replaces} members={(directory.data?.members ?? []).filter((m) => m.status === "active")}
                  onDone={(text) => { setProposing(null); if (text) done(text); }} />
              )}
            </li>
          );
        })}
      </ul>
      {manage && (q.data?.yourProjects.length ?? 0) > 0 && (
        <div className="account-subsection">
          <h3>Vos projets</h3>
          <p className="h7-muted">Comme propriétaire d’un projet, vous pouvez y enregistrer l’organisation comme partie, ou la déclarer partie propriétaire (facultatif, OP-D1). Aucun droit ne change : vous restez le gardien du projet.</p>
          <ul className="org-list">
            {q.data!.yourProjects.map((p) => {
              const row = rows.find((r) => r.projectId === p.projectId);
              return (
                <li key={p.projectId} data-your-project={p.projectId}>
                  <span translate="no">{p.name}</span>
                  <div className="admin-actions">
                    {!row?.participation && <button type="button" className="button-secondary" disabled={!online || record.isPending} onClick={() => record.mutate(p.projectId)} data-record-participation={p.projectId}>Enregistrer l’organisation comme partie</button>}
                    <button type="button" className="button-secondary" disabled={!online || owner.isPending} onClick={() => owner.mutate({ p: p.projectId, on: !p.owningIsThis })} data-declare-owner={p.projectId}>{p.owningIsThis ? "Retirer la partie propriétaire" : "Déclarer partie propriétaire"}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Message msg={msg} />
    </section>
  );
}

function ProposeMandate({ orgId, projectId, replaces, members, onDone }: { orgId: string; projectId: string; replaces: OrganizationMandate | null; members: DirectoryMember[]; onDone: (text: string | null) => void }) {
  const online = useOnline();
  const [membershipId, setMembershipId] = useState("");
  const [note, setNote] = useState("");
  const [responsibilities, setResponsibilities] = useState<TeamResponsibility[]>(replaces?.responsibilities ?? []);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => organizationsApi.proposeMandate(orgId, { projectId, membershipId, responsibilities, note: note.trim() || null, ...(replaces ? { replacesMandateId: replaces.id } : {}) }),
    onSuccess: () => onDone(replaces ? "Remplacement proposé : il prendra effet quand le nouveau représentant l’acceptera ; l’actuel reste mandaté d’ici là." : "Mandat proposé : il prendra effet quand le représentant l’acceptera."),
    onError: (err) => setError(apiMessage(err, "Le mandat n’a pas pu être proposé.")),
  });
  const candidates = members.filter((x) => x.membershipId !== replaces?.membershipId);
  return (
    <form className="account-form account-subsection" onSubmit={(e: FormEvent) => { e.preventDefault(); if (membershipId) m.mutate(); }} data-mandate-form>
      <h4>{replaces ? "Remplacer le représentant" : "Mandater un représentant"}</h4>
      <p className="h7-muted">Le mandat ne prend effet qu’à l’acceptation de la personne mandatée ; il ne donne aucun accès au projet. Les décisions déjà enregistrées gardent leur auteur.</p>
      <label>Représentant<select name="mandateMember" value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
        <option value="">Choisir…</option>
        {candidates.map((x) => <option key={x.membershipId} value={x.membershipId} translate="no">{x.name ?? "—"}</option>)}
      </select></label>
      <div role="group" aria-label="Responsabilités reprises" className="org-checks">
        <span>Responsabilités reprises</span>
        {RESPONSABILITES.map((r) => <label key={r} className="h7-checkbox"><input type="checkbox" checked={responsibilities.includes(r)} onChange={() => setResponsibilities(responsibilities.includes(r) ? responsibilities.filter((x) => x !== r) : [...responsibilities, r])} />{RESPONSABILITE[r]}</label>)}
      </div>
      <label>Note au représentant (facultatif)<input name="mandateNote" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="admin-actions">
        <button type="submit" className="button-primary" disabled={!online || !membershipId || m.isPending} data-submit-mandate>Proposer le mandat</button>
        <button type="button" className="button-secondary" onClick={() => onDone(null)}>Annuler</button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  );
}
