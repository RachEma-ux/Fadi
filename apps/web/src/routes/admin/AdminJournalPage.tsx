/**
 * Administration de la plateforme — journal d'activité (Issue #262, phase 3 bis, tâche 1, OP-D13 (a)). Consultation en
 * lecture seule de `admin.audit_log` : filtres acteur (adresse, nom ou identifiant), famille et action, cible, période ;
 * pagination par curseur (« Afficher plus »), récent d'abord. La protection est au serveur (404 pour un
 * non-administrateur, 403 sans double authentification prouvée par la session, UM-18). Aucun export : aucune capacité
 * d'export d'administration n'existe (UM-20), la limite est affichée telle quelle.
 */
import { useState, type FormEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { ACTION_LABEL, actionLabel, familyLabel, journalApi, type AdminJournalFilters } from "../../lib/journal-activite";
import { TableJournal } from "../../components/journal/TableJournal";
import { MfaRequired, MfaSessionRequired } from "./AdminUsersPage";
import { AdminNav } from "./AdminNav";

const FAMILIES = ["auth", "account", "admin", "invitation", "support", "project", "comment", "mail", "participation", "person", "review"];
const TARGET_TYPES: Record<string, string> = { user: "compte", project: "projet", invitation: "invitation", support_grant: "accès support", session: "session", mail: "courriel" };

const EMPTY: Required<AdminJournalFilters> = { actor: "", action: "", family: "", targetType: "", targetId: "", from: "", to: "" };

export function AdminJournalPage() {
  const [draft, setDraft] = useState<Required<AdminJournalFilters>>(EMPTY);
  const [filters, setFilters] = useState<Required<AdminJournalFilters>>(EMPTY);
  const q = useInfiniteQuery({
    queryKey: ["admin", "journal", filters],
    queryFn: ({ pageParam }) => journalApi.admin(filters, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
  if (q.error instanceof ApiError && q.error.code === "mfa_required") return <MfaRequired />;
  if (q.error instanceof ApiError && q.error.code === "mfa_session_required") return <MfaSessionRequired />;
  if (q.error instanceof ApiError && q.error.status === 404) {
    return <main className="admin-page"><h1>Administration</h1><p role="alert">Page introuvable : l’administration est réservée aux administrateurs de la plateforme, ou n’est pas activée sur ce serveur.</p></main>;
  }
  const set = (patch: Partial<AdminJournalFilters>) => setDraft({ ...draft, ...patch });
  const actions = Object.keys(ACTION_LABEL).filter((a) => !draft.family || a.startsWith(`${draft.family}.`));
  const exportInfo = q.data?.pages[0]?.export;
  return (
    <main className="admin-page" data-admin-journal>
      <h1>Administration — journal d’activité</h1>
      <AdminNav />
      <p className="panel-sub">Consultation en lecture seule du journal de la plateforme : connexions, sécurité, invitations, administration, accès support et participation aux projets. Le journal ne contient aucune adresse e-mail ; l’identité des comptes vient de la table des comptes.</p>
      <section className="panel" aria-labelledby="admin-journal-filters">
        <h2 id="admin-journal-filters">Filtres</h2>
        <form className="admin-filters" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); setFilters({ ...draft, actor: draft.actor.trim(), targetId: draft.targetId.trim() }); }}>
          <label>Acteur (adresse, nom ou identifiant)<input type="search" name="actor" maxLength={254} value={draft.actor} onChange={(e) => set({ actor: e.target.value })} /></label>
          <label>Famille
            <select name="family" value={draft.family} onChange={(e) => set({ family: e.target.value, action: "" })}>
              <option value="">toutes</option>
              {FAMILIES.map((f) => <option key={f} value={f}>{familyLabel(f)}</option>)}
            </select>
          </label>
          <label>Action
            <select name="action" value={draft.action} onChange={(e) => set({ action: e.target.value })}>
              <option value="">toutes</option>
              {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </select>
          </label>
          <label>Type de cible
            <select name="targetType" value={draft.targetType} onChange={(e) => set({ targetType: e.target.value })}>
              <option value="">tous</option>
              {Object.entries(TARGET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Identifiant de la cible<input type="search" name="targetId" maxLength={120} value={draft.targetId} onChange={(e) => set({ targetId: e.target.value })} /></label>
          <label>Du<input type="date" name="from" value={draft.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label>Au<input type="date" name="to" value={draft.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <button type="submit" className="button-primary">Filtrer</button>
          <button type="button" className="button-secondary" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); }}>Réinitialiser</button>
        </form>
        {exportInfo && !exportInfo.available && <p className="h7-muted" data-journal-export="indisponible">{`Export non disponible : ${exportInfo.reason}`}</p>}
      </section>
      <section className="panel" aria-labelledby="admin-journal-list">
        <h2 id="admin-journal-list">Entrées du journal</h2>
        {q.isLoading && <p role="status">Chargement…</p>}
        {q.isError && !(q.error instanceof ApiError) && <p role="alert">Journal indisponible sans réseau.</p>}
        {q.error instanceof ApiError && q.error.status === 400 && <p role="alert">Filtres invalides : vérifiez les dates.</p>}
        {q.data && (
          <>
            <TableJournal pages={q.data.pages} label="Journal d’activité de la plateforme" showProject projectLinks={false} showIp empty="Aucune entrée ne correspond." />
            <div className="admin-pager">
              {q.hasNextPage
                ? <button type="button" className="button-secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? "Chargement…" : "Afficher plus"}</button>
                : <span className="h7-muted">Fin du journal pour ces filtres.</span>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
