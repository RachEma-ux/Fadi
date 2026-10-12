import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useProjectAccess, lockedHint, READ_ONLY_HINT } from "../../lib/access";
import { useOnline, useReachable } from "../../components/SyncIndicator";
import { EditingLockControl } from "../../components/EditingLockControl";
import { ConflictPanel } from "../../components/ConflictPanel";
import { localStore, queuePersistenceStore } from "../../lib/local-store";
import { api } from "../../lib/api";
import { reachability } from "../../lib/reachability";
import { Dialog } from "./Dialog";
import { dateLabel, denied, useDossierQueries } from "./dossier-data";
import { ResourceReadings } from "./DossierDashboard";
import { useDossierSync } from "./use-dossier-sync";

export function DossierStatusDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const queries = useDossierQueries(projectId);
  const sync = useDossierSync(projectId);
  const access = useProjectAccess(projectId);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => unknown | Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { const ok = await action(); if (ok === false) setMessage("L’opération n’a pas abouti. Les modifications restent en attente."); }
    catch { setMessage("La reprise a échoué. Les informations en mémoire restent disponibles ; la conservation locale et l’acceptation serveur se vérifient séparément."); }
    finally { setBusy(false); }
  }
  return <Dialog title="État du Dossier" onClose={onClose}>
    {denied(queries.project.error) ? <p role="alert">Ce dossier est introuvable ou vous n’y avez plus accès.</p> : <>
      <p translate="no">{queries.project.data?.code} — {queries.project.data?.name}</p>
      <p>Les états ci-dessous proviennent des lectures et des opérations de ce dossier.</p>
      <section className="status-section"><h3>Accès au dossier</h3><p>{!access.known ? "Droits à vérifier" : !access.canWrite ? access.lock && !access.holdsLock && access.mayEdit ? lockedHint(access.lock) : READ_ONLY_HINT : "Consultation et modification autorisées"}</p><EditingLockControl projectId={projectId} onMessage={setMessage} /></section>
      <section className="status-section"><h3>Sauvegarde et synchronisation</h3><dl className="status-facts"><div><dt>Connexion du navigateur</dt><dd>{sync.online ? "Réseau disponible" : "Hors ligne"}</dd></div><div><dt>Serveur</dt><dd>{sync.reachable ? "Dernière réponse reçue" : "Injoignable"}</dd></div><div><dt>Conservation locale</dt><dd>{sync.localSaveError ? "Sauvegarde non confirmée" : sync.localStatus === "ready" ? "Stockage local disponible" : sync.localStatus === "loading" ? "Vérification en cours…" : "Stockage local indisponible"}</dd></div><div><dt>Modifications en attente</dt><dd>{sync.pending === null ? "Nombre indisponible" : sync.pending}</dd></div><div><dt>Versions à comparer</dt><dd>{sync.conflicts}</dd></div></dl>
        <p>Un enregistrement local ne vaut pas acceptation par le serveur. Une reconnexion ne remplace aucune version en conflit.</p>
        <div className="status-actions">{sync.localSaveError && access.canWrite && <button type="button" disabled={busy || sync.busy} onClick={() => void run(sync.retryLocal)}>Réessayer la sauvegarde</button>}<button type="button" disabled={busy || !sync.online} onClick={() => void run(sync.reconnect)}>Vérifier la connexion</button>{sync.pending !== null && sync.pending > 0 && <button type="button" disabled={busy || sync.busy || !sync.online || !sync.reachable || !access.canWrite || !!sync.localSaveError || sync.conflicts > 0} onClick={() => void run(sync.synchronize)}>Synchroniser les modifications</button>}</div>
      </section>
      <section className="status-section"><h3>Revue technique</h3><p>{!queries.review.data ? queries.review.isError ? "Revue indisponible" : "Chargement de la revue…" : queries.review.data.reviewStale ? "Revue technique à actualiser" : queries.review.data.reviewedAt ? `Revue enregistrée le ${dateLabel(queries.review.data.reviewedAt)}` : "Revue non établie"}</p><p>L’avancement des 21 étapes et la revue technique sont indépendants. Une revue enregistrée ne constitue pas une approbation technique.</p><Link to={`/projets/${projectId}?module=parcours&etape=11&bilan=1`} onClick={onClose}>Consulter la revue</Link></section>
      <ResourceReadings queries={queries} connected={sync.online && sync.reachable} />
      <ConflictPanel projectId={projectId} />
    </>}
    {busy && <p role="status">Opération en cours…</p>}{message && <p role="alert">{message}</p>}
  </Dialog>;
}

export function PlatformStatusDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const reachable = useReachable();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const local = useQuery({ queryKey: ["local-summary"], queryFn: localStore.summary, networkMode: "always", staleTime: 0 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => queuePersistenceStore.subscribe(() => { void queryClient.invalidateQueries({ queryKey: ["local-summary"] }); }), [queryClient]);
  const unconfirmed = local.data?.unconfirmedProjects.some((id) => projects.data?.some((project) => project.id === id)) ?? false;
  const pending = local.data?.available && projects.data && !denied(projects.error) && !unconfirmed ? projects.data.reduce((sum, project) => sum + (local.data!.pendingByProject[project.id] ?? 0), 0) : null;
  async function probe() { setBusy(true); try { setResult(await reachability.probeNow() ? "Le serveur répond. Les données conservent leurs propres dates de lecture." : "Le serveur reste injoignable. Réessayez lorsque la connexion sera disponible."); } finally { setBusy(false); } }
  return <Dialog title="État de la plateforme" onClose={onClose}><p>État de votre espace de travail dans ce navigateur.</p><dl className="status-facts"><div><dt>Réseau</dt><dd>{online ? "Disponible" : "Hors ligne"}</dd></div><div><dt>Serveur</dt><dd>{reachable ? "Dernière réponse reçue" : "Injoignable"}</dd></div><div><dt>Liste des projets</dt><dd>{projects.isError ? "Actualisation impossible" : projects.data ? `${projects.data.length} projet(s) accessible(s)` : "Chargement…"}{projects.data && projects.dataUpdatedAt > 0 && <small>Dernière lecture : {dateLabel(projects.dataUpdatedAt)}</small>}</dd></div><div><dt>File locale de l’Atelier</dt><dd>{pending === null ? "Nombre indisponible" : `${pending} lot(s) en attente dans vos projets accessibles`}</dd></div></dl><p>Chaque dossier possède son propre état de sauvegarde, de revue et de lecture. Ce panneau ne déclare pas tous les dossiers synchronisés.</p><div className="status-actions"><button type="button" disabled={busy || !online} onClick={() => void probe()}>{busy ? "Vérification…" : "Vérifier la connexion"}</button><button type="button" disabled={projects.isFetching || !online || !reachable} onClick={() => void projects.refetch()}>Actualiser les projets</button></div>{result && <p role="status">{result}</p>}</Dialog>;
}
