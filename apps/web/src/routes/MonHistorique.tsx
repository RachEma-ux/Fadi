/**
 * « Mon historique » (Mon compte, phase 3 bis, tâche 2) : connexions, changements de sécurité, invitations envoyées ou
 * acceptées, accès support accordés ou utilisés sur ses projets. Le serveur ne rend que les entrées de la personne
 * (`GET /auth/me/history`, audience `utilisateur`) : jamais d'adresse IP ni l'identité d'un autre compte, sauf
 * l'administrateur d'un accès support sur son propre projet. Lecture seule, jamais conservée hors ligne.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { journalApi } from "../lib/journal-activite";
import { TableJournal } from "../components/journal/TableJournal";

export function MonHistorique() {
  const q = useInfiniteQuery({
    queryKey: ["account", "history"],
    queryFn: ({ pageParam }) => journalApi.mine(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return (
    <div className="account-subsection" data-account-history>
      <h3 id="account-history">Mon historique</h3>
      <p className="h7-muted">Vos connexions, changements de sécurité, invitations et les accès support accordés ou utilisés sur vos projets, du plus récent au plus ancien.</p>
      {q.isLoading && <p role="status">Chargement…</p>}
      {q.isError && <p role="alert">Historique non disponible sans réseau.</p>}
      {q.data && (
        <>
          <TableJournal pages={q.data.pages} label="Mon historique" showProject empty="Aucune entrée pour le moment." />
          <div className="admin-pager">
            {q.hasNextPage
              ? <button type="button" className="button-secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? "Chargement…" : "Afficher plus"}</button>
              : <span className="h7-muted">Début de votre historique.</span>}
          </div>
        </>
      )}
    </div>
  );
}
