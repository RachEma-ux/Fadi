/**
 * Temps réel — routes HTTP des sessions en direct (`/projects/:id/temps-reel/sessions…`, RTC-1). Tout ce qui est durable
 * passe ici ; le canal n'annonce que des faits enregistrés. `null` : le temps réel n'est pas activé sur ce serveur
 * (drapeau `FADI_TEMPS_REEL` absent) — l'interface n'affiche alors aucune entrée.
 */
import { ApiError, request } from "../../../lib/api";
import type { SessionPublique } from "./etat-session";

export interface Personne { userId: string; nom: string }
export interface SessionListee extends SessionPublique {
  hote: Personne;
  presentateur: Personne | null;
  connectes: Personne[];
  hoteAbsent: boolean;
}
export interface EntreeJournalSession { action: string; actorId: string | null; targetId: string | null; revisionId: string | null; createdAt: string; acteur: string | null; cible: string | null }

const racine = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/temps-reel/sessions`;
const corps = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const desactive = (e: unknown) => e instanceof ApiError && e.status === 404 && e.code === "temps_reel_desactive";

export const apiTempsReel = {
  /** Sessions ouvertes de la variante ; `null` si le temps réel n'est pas activé. */
  async sessions(projectId: string, variantId: string): Promise<SessionListee[] | null> {
    try {
      const r = await request<{ sessions: SessionListee[]; actif?: false }>(`${racine(projectId)}?variantId=${encodeURIComponent(variantId)}`);
      return r.actif === false ? null : r.sessions;
    } catch (e) {
      if (desactive(e)) return null;
      throw e;
    }
  },
  ouvrir: (projectId: string, p: { studyId: string; variantId: string; revisionId?: string; titre?: string; requestId: string }) =>
    request<{ session: SessionListee; rejoue: boolean }>(racine(projectId), corps(p)),
  detail: (projectId: string, sessionId: string) =>
    request<{ session: SessionListee; journal: EntreeJournalSession[] }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}`),
  presentateur: (projectId: string, sessionId: string, userId: string | null) =>
    request<{ session: SessionListee }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}/presentateur`, corps({ userId })),
  hote: (projectId: string, sessionId: string, userId: string) =>
    request<{ session: SessionListee }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}/hote`, corps({ userId })),
  reprendre: (projectId: string, sessionId: string) =>
    request<{ session: SessionListee }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}/reprendre`, corps({})),
  revision: (projectId: string, sessionId: string, revisionId: string) =>
    request<{ session: SessionListee }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}/revision`, corps({ revisionId })),
  clore: (projectId: string, sessionId: string) =>
    request<{ session: SessionListee }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}/clore`, corps({})),
};
