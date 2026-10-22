/**
 * Administration de la plateforme — utilisateurs (gestion des comptes, phase 5 ; D-2 : comptes seulement, jamais le
 * contenu des projets). Tableau paginé avec recherche et filtres, fiche (projets, sessions, accès support, historique),
 * actions confirmées, invitations. La protection est au serveur : 404 pour un non-administrateur, 403 `mfa_required`
 * sans double authentification. Les mutations exigent le réseau et ne sont jamais mises en file hors ligne.
 */
import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { accountApi, ApiError, ROLE_LABEL, type AdminStatus, type AdminUser, type AdminUsersFilters } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { LOCALE } from "../../lib/i18n";
import { useOnline } from "../../components/SyncIndicator";
import { apiMessage, ConfirmDialog, CopyLink } from "../../components/comptes/ComptesUI";

const STATUS_LABEL: Record<AdminStatus, string> = { active: "actif", suspended: "suspendu", closed: "fermé (anonymisé)", locked: "verrouillé", deletion_pending: "suppression programmée" };
const ROLE_PLATFORM: Record<"user" | "admin", string> = { user: "utilisateur", admin: "administrateur" };
const INVITATION_STATUS: Record<string, string> = { pending: "en attente", accepted: "acceptée", declined: "déclinée", expired: "expirée", cancelled: "annulée" };
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" }) : "—");
const OFFLINE = "Hors connexion : les actions d’administration exigent le réseau (jamais mises en attente).";

type Action = { kind: "suspend" | "reactivate" | "revoke" | "delete" | "role"; user: AdminUser };
const ACTION_TEXT: Record<Action["kind"], { title: string; confirm: string; danger: boolean; consequence: (u: AdminUser) => string }> = {
  suspend: { title: "Suspendre le compte", confirm: "Suspendre", danger: true, consequence: (u) => `${u.email} sera déconnecté de toutes ses sessions et ne pourra plus se connecter ; ses réservations d’édition seront libérées. Un courriel le prévient.` },
  reactivate: { title: "Réactiver le compte", confirm: "Réactiver", danger: false, consequence: (u) => `${u.email} pourra de nouveau se connecter (un verrouillage éventuel est levé).` },
  revoke: { title: "Révoquer les sessions", confirm: "Révoquer", danger: false, consequence: (u) => `Toutes les sessions ouvertes de ${u.email} seront fermées ; il devra se reconnecter.` },
  delete: { title: "Supprimer le compte", confirm: "Programmer la suppression", danger: true, consequence: (u) => `La connexion de ${u.email} est bloquée aussitôt ; ses données personnelles seront anonymisées dans 30 jours, sauf annulation par le lien envoyé. Refusé s’il possède des projets partagés.` },
  role: { title: "Changer le rôle", confirm: "Changer le rôle", danger: false, consequence: (u) => u.platformRole === "admin" ? `${u.email} perdra le rôle administrateur ; ses sessions seront fermées.` : `${u.email} deviendra administrateur de la plateforme (gestion des comptes, jamais le contenu des projets) ; ses sessions seront fermées et la double authentification lui sera exigée.` },
};

function MfaRequired() {
  return (
    <main className="admin-page">
      <h1>Administration</h1>
      <p role="alert" data-admin-mfa-required>La double authentification est obligatoire pour l’administration de la plateforme.</p>
      <Link className="button-primary" to="/parametres#settings-security">Activer la double authentification dans Mon compte</Link>
    </main>
  );
}

function InviteForm() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation({
    mutationFn: () => accountApi.adminInvite(email.trim()),
    onSuccess: (r) => {
      setLink(r.mail.link ?? null);
      setMsg({ ok: true, text: r.mail.queued ? `Invitation ${r.resent ? "renvoyée" : "envoyée"} à ${r.invitation.email}.` : `Invitation ${r.resent ? "renouvelée" : "créée"} pour ${r.invitation.email}.` });
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] });
    },
    onError: (err) => { setLink(null); setMsg({ ok: false, text: apiMessage(err, "L’invitation n’a pas pu être créée.") }); },
  });
  return (
    <section className="panel" aria-labelledby="admin-invite">
      <h2 id="admin-invite">Inviter une personne</h2>
      <form className="admin-filters" onSubmit={(e: FormEvent) => { e.preventDefault(); if (email.trim()) m.mutate(); }}>
        <label>Adresse e-mail<input type="email" name="inviteEmail" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button type="submit" className="button-primary" disabled={!online || m.isPending || !email.trim()}>Envoyer l’invitation</button>
      </form>
      <small>L’invitation est valable 7 jours ; aucun compte n’est créé tant que la personne ne l’a pas acceptée.</small>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "h7-muted" : "form-error"}>{msg.text}</p>}
      {link && <CopyLink link={link} />}
    </section>
  );
}

function Invitations() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "invitations"], queryFn: () => accountApi.adminInvitations("pending") });
  const cancel = useMutation({ mutationFn: accountApi.adminCancelInvitation, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] }) });
  if (!q.data?.invitations.length) return null;
  return (
    <section className="panel" aria-labelledby="admin-invitations">
      <h2 id="admin-invitations">Invitations en attente</h2>
      <ul className="sessions-list">
        {q.data.invitations.map((i) => (
          <li key={i.id} data-invitation={i.email}>
            <span><span translate="no">{i.email}</span> <small>· {i.projectName ? <span translate="no">{i.projectName}</span> : "compte"} · jusqu’au {date(i.expiresAt)} · {INVITATION_STATUS[i.status]}</small></span>
            <button type="button" className="button-secondary" disabled={!online || cancel.isPending} onClick={() => cancel.mutate(i.id)}>Annuler l’invitation</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UserDetail({ id, onAction, onClose }: { id: string; onAction: (a: Action) => void; onClose: () => void }) {
  const online = useOnline();
  const { user: me } = useAuth();
  const q = useQuery({ queryKey: ["admin", "user", id], queryFn: () => accountApi.adminUser(id) });
  if (q.isLoading) return <p role="status">Lecture de la fiche…</p>;
  if (!q.data) return <p role="alert">{apiMessage(q.error, "Fiche indisponible.")}</p>;
  const { user: u, projects, sessions, supportGrants, audit } = q.data;
  const self = u.id === me?.id;
  return (
    <section className="panel admin-detail" aria-labelledby="admin-detail-title" data-admin-detail={u.email}>
      <h2 id="admin-detail-title"><span translate="no">{u.email}</span></h2>
      <p>{u.displayName ? <span translate="no">{u.displayName} · </span> : null}{ROLE_PLATFORM[u.platformRole]} · <span className="admin-status" data-status={u.status}>{STATUS_LABEL[u.status]}</span> · double authentification {u.mfaEnabled ? "active" : "inactive"} · adresse {u.emailVerified ? "confirmée" : "non confirmée"}</p>
      {self ? <p className="h7-muted">Votre propre compte : rôle, suspension et suppression se gèrent dans Mon compte.</p> : (
        <div className="admin-actions">
          {u.status === "active" || u.status === "locked" || u.status === "deletion_pending" ? <button type="button" className="button-secondary" disabled={!online} onClick={() => onAction({ kind: "suspend", user: u })}>Suspendre</button> : null}
          {u.status === "suspended" || u.status === "locked" ? <button type="button" className="button-secondary" disabled={!online} onClick={() => onAction({ kind: "reactivate", user: u })}>Réactiver</button> : null}
          {u.status !== "closed" && <button type="button" className="button-secondary" disabled={!online} onClick={() => onAction({ kind: "role", user: u })}>{u.platformRole === "admin" ? "Retirer le rôle administrateur" : "Nommer administrateur"}</button>}
          <button type="button" className="button-secondary" disabled={!online} onClick={() => onAction({ kind: "revoke", user: u })}>Révoquer les sessions</button>
          {u.status !== "closed" && !u.deletionRequestedAt && <button type="button" className="danger-button" disabled={!online} onClick={() => onAction({ kind: "delete", user: u })}>Supprimer…</button>}
        </div>
      )}
      <div>
        <h3>Projets ({projects.length})</h3>
        {projects.length ? <ul>{projects.map((p) => <li key={p.id}><span translate="no">{p.code} — {p.name}</span> · {ROLE_LABEL[p.role]}</li>)}</ul> : <p className="h7-muted">Aucun projet.</p>}
        <small>Identité et rôle seulement : le contenu des projets n’est pas accessible depuis l’administration.</small>
      </div>
      <div>
        <h3>Sessions ouvertes ({sessions.length})</h3>
        {sessions.length ? <ul>{sessions.map((s) => <li key={s.id}>{date(s.createdAt)} → {date(s.lastSeenAt)} {s.ip ? `· ${s.ip}` : ""} <small>{s.userAgent?.slice(0, 80)}</small></li>)}</ul> : <p className="h7-muted">Aucune.</p>}
      </div>
      {supportGrants.length > 0 && (
        <div>
          <h3>Accès support reçus</h3>
          <ul>{supportGrants.map((g) => <li key={g.id}><span translate="no">{g.code}</span> · jusqu’au {date(g.expiresAt)}{g.revokedAt ? ` · révoqué le ${date(g.revokedAt)}` : ""} · <span translate="no">{g.purpose}</span></li>)}</ul>
        </div>
      )}
      <div>
        <h3>Historique d’audit</h3>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Historique d’audit">
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Action</th><th>Acteur</th><th>Adresse IP</th></tr></thead>
            <tbody>{audit.map((a) => <tr key={a.id}><td data-label="Date">{date(a.createdAt)}</td><td data-label="Action"><code translate="no">{a.action}</code></td><td data-label="Acteur" translate="no">{a.actorId === u.id ? "lui-même" : a.actorId ?? "système"}</td><td data-label="Adresse IP">{a.ip ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <button type="button" className="button-secondary" onClick={onClose}>Fermer la fiche</button>
    </section>
  );
}

export function AdminUsersPage() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Required<Pick<AdminUsersFilters, "q" | "status" | "role" | "page" | "pageSize">>>({ q: "", status: "", role: "", page: 1, pageSize: 25 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = useQuery({ queryKey: ["admin", "users", filters], queryFn: () => accountApi.adminUsers(filters), placeholderData: keepPreviousData, retry: false });
  const act = useMutation({
    mutationFn: async (a: Action) => {
      switch (a.kind) {
        case "suspend": return accountApi.adminSuspend(a.user.id).then(() => "Compte suspendu.");
        case "reactivate": return accountApi.adminReactivate(a.user.id).then(() => "Compte réactivé.");
        case "revoke": return accountApi.adminRevokeSessions(a.user.id).then((r) => `${r.revoked} session(s) révoquée(s).`);
        case "delete": return accountApi.adminDelete(a.user.id).then(() => "Suppression programmée (30 jours).");
        case "role": return accountApi.adminSetRole(a.user.id, a.user.platformRole === "admin" ? "user" : "admin").then(() => "Rôle modifié.");
      }
    },
    onSuccess: (text) => { setAction(null); setMsg({ ok: true, text }); void queryClient.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (err) => { setAction(null); setMsg({ ok: false, text: apiMessage(err, "Action refusée.") }); },
  });
  if (list.error instanceof ApiError && list.error.code === "mfa_required") return <MfaRequired />;
  if (list.error instanceof ApiError && list.error.status === 404) {
    return <main className="admin-page"><h1>Administration</h1><p role="alert">Page introuvable : l’administration est réservée aux administrateurs de la plateforme, ou n’est pas activée sur ce serveur.</p></main>;
  }
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, page: 1, ...patch });
  return (
    <main className="admin-page" data-admin-users>
      <h1>Administration — utilisateurs</h1>
      <p className="panel-sub">Gestion des comptes de la plateforme. Le contenu des projets n’est jamais accessible d’ici : seul un accès support accordé par le propriétaire l’ouvre, en lecture.</p>
      {!online && <p role="status" className="access-banner">{OFFLINE}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "h7-muted" : "form-error"} data-admin-message>{msg.text}</p>}
      <InviteForm />
      <Invitations />
      <section className="panel" aria-labelledby="admin-list">
        <h2 id="admin-list">Comptes</h2>
        <form className="admin-filters" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); set({ q: search.trim() }); }}>
          <label>Recherche (adresse ou nom)<input type="search" name="q" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label>Statut
            <select value={filters.status} onChange={(e) => set({ status: e.target.value as AdminStatus | "" })}>
              <option value="">tous</option>
              {(Object.keys(STATUS_LABEL) as AdminStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label>Rôle
            <select value={filters.role} onChange={(e) => set({ role: e.target.value as "user" | "admin" | "" })}>
              <option value="">tous</option><option value="user">utilisateur</option><option value="admin">administrateur</option>
            </select>
          </label>
          <button type="submit" className="button-secondary">Rechercher</button>
        </form>
        {list.isLoading && <p role="status">Chargement…</p>}
        {list.isError && !(list.error instanceof ApiError) && <p role="alert">Liste indisponible sans réseau.</p>}
        {data && (
          <>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Liste des comptes">
              <table className="admin-table">
                <thead><tr><th>E-mail</th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Projets</th></tr></thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} data-admin-user={u.email}>
                      <td data-label="E-mail"><button type="button" className="link-button" aria-expanded={selected === u.id} onClick={() => setSelected(selected === u.id ? null : u.id)}><span translate="no">{u.email}</span></button></td>
                      <td data-label="Nom" translate="no">{u.displayName ?? "—"}</td>
                      <td data-label="Rôle">{ROLE_PLATFORM[u.platformRole]}</td>
                      <td data-label="Statut"><span className="admin-status" data-status={u.status}>{STATUS_LABEL[u.status]}</span></td>
                      <td data-label="Dernière connexion">{date(u.lastLoginAt)}</td>
                      <td data-label="Projets">{u.projectsCount}</td>
                    </tr>
                  ))}
                  {data.users.length === 0 && <tr><td colSpan={6} className="h7-muted">Aucun compte ne correspond.</td></tr>}
                </tbody>
              </table>
            </div>
            <nav className="admin-pager" aria-label="Pagination">
              <button type="button" className="button-secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Précédent</button>
              <span>Page {filters.page} / {pages} · {data.total} compte(s)</span>
              <button type="button" className="button-secondary" disabled={filters.page >= pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Suivant</button>
            </nav>
          </>
        )}
      </section>
      {selected && <UserDetail id={selected} onClose={() => setSelected(null)} onAction={(a) => { setMsg(null); setAction(a); }} />}
      {action && (
        <ConfirmDialog title={ACTION_TEXT[action.kind].title} confirmLabel={ACTION_TEXT[action.kind].confirm} danger={ACTION_TEXT[action.kind].danger} busy={act.isPending}
          onClose={() => setAction(null)} onConfirm={() => { if (online) act.mutate(action); else setMsg({ ok: false, text: OFFLINE }); }}>
          <p>{ACTION_TEXT[action.kind].consequence(action.user)}</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
