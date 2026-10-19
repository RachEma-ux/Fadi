/**
 * Client des ajustements du métré Studio (`/projects/:p/studio/studies/:s/variants/:v/ajustements-quantites`, E.3-05).
 * Même origine, cookie de session ; une réponse refusée lève `ErreurQuantites` avec le message du serveur.
 */
import type { AjustementQuantiteEnregistre, SaisieAjustementQuantite } from "@parcours/atelier-model";

export interface LectureAjustements {
  studyId: string;
  variantId: string;
  headRevisionId: string;
  /** Version du journal : dernière séquence (0 = journal vide). */
  sequence: number;
  /** Le compte connecté peut ajuster (droit `modify`, étude et variante actives). */
  peutAjuster: boolean;
  ajustements: AjustementQuantiteEnregistre[];
}

export class ErreurQuantites extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const res = await fetch(chemin, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const corps: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const c = (corps ?? {}) as { error?: unknown; message?: unknown };
    throw new ErreurQuantites(res.status, typeof c.error === "string" ? c.error : `http_${res.status}`, typeof c.message === "string" ? c.message : `Refus du serveur (${res.status}).`);
  }
  return corps as T;
}
const e = encodeURIComponent;
const chemin = (p: string, s: string, v: string) => `/projects/${e(p)}/studio/studies/${e(s)}/variants/${e(v)}/ajustements-quantites`;

export const apiQuantites = {
  lire: (p: string, s: string, v: string) => appel<LectureAjustements>(chemin(p, s, v)),
  ajuster: (p: string, s: string, v: string, corps: SaisieAjustementQuantite & { baseSequence: number; revisionId: string; requestId: string }) =>
    appel<AjustementQuantiteEnregistre & { replayed: boolean }>(chemin(p, s, v), { method: "POST", body: JSON.stringify(corps) }),
};
