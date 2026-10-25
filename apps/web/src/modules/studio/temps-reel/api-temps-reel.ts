/**
 * Temps réel — routes HTTP des sessions en direct (`/projects/:id/temps-reel/sessions…`, RTC-1). Tout ce qui est durable
 * passe ici ; le canal n'annonce que des faits enregistrés. `null` : le temps réel n'est pas activé sur ce serveur
 * (drapeau `FADI_TEMPS_REEL` absent) — l'interface n'affiche alors aucune entrée.
 */
import { ApiError, request } from "../../../lib/api";
import type { StudioCameraScene } from "@parcours/atelier-model";
import type { SessionPublique } from "./etat-session";

export interface Personne { userId: string; nom: string }
export interface SessionListee extends SessionPublique {
  hote: Personne;
  presentateur: Personne | null;
  connectes: Personne[];
  hoteAbsent: boolean;
}
export interface EntreeJournalSession { action: string; actorId: string | null; targetId: string | null; revisionId: string | null; createdAt: string; acteur: string | null; cible: string | null }

/** Point de vue d'une annotation (RTC-3) : cadre plan (`local-2d`, m) et / ou caméra (`local-3d`, m). */
export interface PointDeVue { affichage: "2d" | "3d" | "double"; plan?: { x: number; y: number; w: number; h: number }; camera?: StudioCameraScene }
export interface AnnotationSession {
  commentId: string;
  sessionId: string | null;
  sourceRevisionId: string;
  pointDeVue: PointDeVue & { reperes: { plan: "local-2d"; camera: "local-3d" }; unites: "m" };
  body: string | null;
  objectIds: string[];
  audience: "equipe" | "projet";
  auteurId: string;
  auteur: string;
  observation: boolean;
  createdAt: string;
}
export interface SaisieAnnotation { body: string; objectIds?: string[]; audience?: "equipe" | "projet"; requestId: string; vue: PointDeVue }

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
  ouvrir: (projectId: string, p: { studyId: string; variantId: string; revisionId?: string; publicationId?: string; titre?: string; requestId: string }) =>
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
  annoter: (projectId: string, sessionId: string, saisie: SaisieAnnotation) =>
    request<{ annotation: { id: string }; rejoue: boolean }>(`${racine(projectId)}/${encodeURIComponent(sessionId)}/annotations`, corps(saisie)),
  /** Annotations lisibles de la variante (audience E1), d'une session si elle est donnée. */
  annotations: (projectId: string, variantId: string, sessionId?: string) =>
    request<{ annotations: AnnotationSession[] }>(`/projects/${encodeURIComponent(projectId)}/temps-reel/annotations?variantId=${encodeURIComponent(variantId)}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""}`),
};
