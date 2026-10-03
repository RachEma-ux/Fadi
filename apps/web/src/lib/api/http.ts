/**
 * Client HTTP minimal vers `apps/api`. Toujours `credentials: "include"`
 * (cookie de session httpOnly) ; jamais de jeton stocké en `localStorage`
 * (surface XSS inutile pour une session qui peut vivre dans un cookie).
 * Code déplacé de `lib/api.ts` (L0.5) : erreur typée et requête commune aux clients par module.
 */
import { GATEWAY_STATUSES, isNetworkError, reachability } from "../reachability";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    /** Message lisible renvoyé par le serveur (règles Harmonie, validation), s'il existe. */
    public readonly serverMessage: string | null = null,
    /** Corps complet de la réponse d'erreur (ex. valeur courante lors d'un conflit 409). */
    public readonly body: unknown = null,
  ) {
    super(serverMessage ?? code);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    // Pas de réponse du tout : le serveur est déclaré injoignable (les écritures passent en attente, une sonde relit /health).
    if (isNetworkError(err)) reachability.markUnreachable();
    throw err;
  }
  if (GATEWAY_STATUSES.has(res.status)) {
    // Un relais répond à la place du serveur (tunnel fermé, API arrêtée) : même traitement qu'une absence de réponse.
    reachability.markUnreachable();
    throw new TypeError(`Serveur injoignable (${res.status})`);
  }
  reachability.markReachable();
  if (res.status === 204) {
    return undefined as T;
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
    const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : null;
    throw new ApiError(res.status, code, message, body);
  }
  return body as T;
}
