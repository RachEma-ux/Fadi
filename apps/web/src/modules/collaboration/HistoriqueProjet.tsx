/**
 * Historique de la participation du projet (Issue #262, phase 3 bis, tâche 3, OP-D13 (a)) : arrivées et départs,
 * changements de rôle et d'export, transfert de propriété, invitations, audience des fils, accès support — et les
 * actions futures des participations, personnes et revues, affichées dès que le serveur les rend.
 *
 * Réservé aux responsables du projet (propriétaire, coordinateur à la portée projet, direction de l'équipe) : le
 * serveur répond 403 à tout autre membre, et la section n'apparaît pas. Lecture seule, jamais conservée hors ligne
 * (`journal-projet` dans `NON_PERSISTED_QUERIES`). Les filtres par famille sont des bascules d'affichage, pas des
 * commandes de collaboration.
 */
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { familyLabel, journalApi } from "../../lib/journal-activite";
import { TableJournal } from "../../components/journal/TableJournal";

const FAMILIES = ["project", "invitation", "comment", "support", "participation", "person", "review"] as const;

export function HistoriqueProjet({ projectId }: { projectId: string }) {
  const [family, setFamily] = useState<string>("");
  const q = useInfiniteQuery({
    queryKey: ["journal-projet", projectId, family],
    queryFn: ({ pageParam }) => journalApi.project(projectId, family || undefined, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: (n, err) => !(err instanceof ApiError) && n < 2,
  });
  // Pas responsable (403) ou plus d'accès (404) : rien à montrer, le serveur n'a rien rendu.
  if (q.error instanceof ApiError && (q.error.status === 403 || q.error.status === 404)) return null;
  return (
    <section className="biz-card" aria-labelledby="collab-historique" data-historique-projet>
      <h2 id="collab-historique">Historique</h2>
      <p className="biz-sub">Historique de la participation au projet, réservé à ses responsables : arrivées et départs, rôles et droits d’export, transfert de propriété, invitations, audience des fils et accès support. Le journal ne contient aucune adresse e-mail ni adresse IP.</p>
      <nav className="h7-tabs" aria-label="Filtrer l’historique">
        <button type="button" className={family === "" ? "sel" : ""} aria-pressed={family === ""} onClick={() => setFamily("")}>Toutes les familles</button>
        {FAMILIES.map((f) => (
          <button key={f} type="button" className={family === f ? "sel" : ""} aria-pressed={family === f} onClick={() => setFamily(f)} data-historique-famille={f}>
            {familyLabel(f)}
          </button>
        ))}
      </nav>
      {q.isLoading && <p role="status">Lecture de l’historique…</p>}
      {q.isError && !(q.error instanceof ApiError) && <p role="alert">Historique non disponible sans réseau.</p>}
      {q.data && (
        <>
          <TableJournal pages={q.data.pages} label="Historique de la participation au projet" showFamily={false} empty="Aucune entrée pour ce filtre." />
          <div className="admin-pager">
            {q.hasNextPage
              ? <button type="button" className="button-secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? "Chargement…" : "Afficher plus"}</button>
              : <span className="h7-muted">Début de l’historique.</span>}
          </div>
        </>
      )}
    </section>
  );
}
