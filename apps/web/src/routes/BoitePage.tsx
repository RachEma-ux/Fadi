/**
 * Global > Ma boîte (Communication, COM-4) : ce qui demande votre attention dans tous vos projets — messages directs
 * et de groupe non lus, mentions, accusés de réception attendus, demandes de précision à répondre (en retard
 * signalées) et réponses à clore. Recalculé par le serveur à chaque lecture depuis vos accès courants.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { comApi } from "../lib/api";
import { LOCALE } from "../lib/i18n";
import { LIBELLE_BOITE } from "../modules/collaboration/communication/etats";

export function BoitePage() {
  const q = useQuery({ queryKey: ["com-boite"], queryFn: comApi.boite });
  return (
    <main className="fadi-home">
      <section className="panel" data-com-boite>
        <h2>Ma boîte</h2>
        <p>Messages, mentions, accusés de réception et demandes de précision qui attendent votre attention, dans les projets auxquels vous avez accès.</p>
        {q.isPending && <p role="status">Lecture de votre boîte…</p>}
        {q.isError && <p role="alert">Impossible de lire votre boîte.</p>}
        {q.data && q.data.items.length === 0 && <p className="h7-muted">Rien n’attend votre attention.</p>}
        {q.data && q.data.items.length > 0 && (
          <ul className="notification-list com-boite">
            {q.data.items.map((i) => (
              <li key={i.id} data-com-boite-item={i.kind} className={i.urgent ? "com-urgent" : undefined}>
                <span className="h7-chip">{LIBELLE_BOITE[i.kind]}</span>
                {i.urgent && <span className="h7-chip com-urgent-chip"> Urgent</span>}
                {i.enRetard && <span className="h7-chip com-retard"> En retard</span>}
                {" "}<Link to={`/projets/${i.projectId}?module=collaboration`}><b translate="no">{i.projectCode} · {i.titre}</b></Link>
                <p translate="no">{i.texte}</p>
                <small className="h7-muted">{new Date(i.at).toLocaleString(LOCALE)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
