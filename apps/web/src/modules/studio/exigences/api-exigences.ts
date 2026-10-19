/**
 * Client des routes d'exigences Studio (`/projects/:p/studio/studies/:s/exigences`, `…/variants/:v/controles`). Même
 * origine, cookie de session ; une réponse refusée lève `ErreurExigences` avec le message du serveur.
 */
import type { ExigenceStudio, JeuExigences, ResultatControle } from "@parcours/atelier-model";

export interface JeuLu extends JeuExigences { auteurEmail: string | null }
export interface LectureExigences {
  studyId: string;
  courante: JeuLu | null;
  versions: { version: number; nombre: number; auteur: string; auteurEmail: string | null; creeLe: string; motif: string | null }[];
}
export interface ControleLu {
  id: string; studyId: string; variantId: string; revisionId: string; version: number | null;
  execution: ResultatControle["execution"]; conclusion: ResultatControle["conclusion"]; documentHash: string;
  auteur: string; auteurEmail: string | null; creeLe: string; resultat: ResultatControle;
}

export class ErreurExigences extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const res = await fetch(chemin, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const corps: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const c = (corps ?? {}) as { error?: unknown; message?: unknown };
    throw new ErreurExigences(res.status, typeof c.error === "string" ? c.error : `http_${res.status}`, typeof c.message === "string" ? c.message : `Refus du serveur (${res.status}).`);
  }
  return corps as T;
}
const e = encodeURIComponent;
const etude = (p: string, s: string) => `/projects/${e(p)}/studio/studies/${e(s)}`;

export const apiExigences = {
  lire: (p: string, s: string) => appel<LectureExigences>(`${etude(p, s)}/exigences`),
  enregistrer: (p: string, s: string, corps: { baseVersion: number; exigences: ExigenceStudio[]; motif?: string; requestId: string }) =>
    appel<JeuLu & { replayed: boolean }>(`${etude(p, s)}/exigences`, { method: "POST", body: JSON.stringify(corps) }),
  accepter: (p: string, s: string, corps: { baseVersion: number; exigenceId: string; requestId: string }) =>
    appel<JeuLu & { replayed: boolean }>(`${etude(p, s)}/exigences/acceptations`, { method: "POST", body: JSON.stringify(corps) }),
  controles: (p: string, s: string, v: string) => appel<{ controles: ControleLu[] }>(`${etude(p, s)}/variants/${e(v)}/controles`),
  controler: (p: string, s: string, v: string, corps: { revisionId: string; version?: number; requestId: string }) =>
    appel<ControleLu & { replayed: boolean }>(`${etude(p, s)}/variants/${e(v)}/controles`, { method: "POST", body: JSON.stringify(corps) }),
};
