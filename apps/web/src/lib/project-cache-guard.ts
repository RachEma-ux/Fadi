/**
 * Politique hors ligne après retrait d'accès ou changement d'audience (écart E7, décision CR-D5 (a) ; CR-C1).
 *
 * Le serveur filtre déjà chaque réponse ; ce garde fait que l'appareil ne garde pas plus que ce que le compte peut lire
 * maintenant :
 *  1. Accès perdu (retrait, départ, projet supprimé, accès support échu) : au premier refus 404 du projet reçu du
 *     serveur, ou quand la liste des projets relue ne le contient plus, tout ce que l'appareil garde de ce projet est
 *     oublié — requêtes en cache (mémoire et IndexedDB), modèle de l'Atelier, lots en attente, brouillons et contextes
 *     Studio. Limite déclarée : un fichier déjà téléchargé hors de l'application reste hors de portée.
 *  2. Rôle hors de l'équipe (lecteur, accès support) confirmé par le serveur : à la première lecture du projet de la
 *     session, puis à chaque changement de rôle, les commentaires, observations, journal et notifications en cache sont
 *     relus, y compris ceux qu'aucun écran n'affiche : un fil réservé depuis à l'équipe ou lu avant une rétrogradation
 *     disparaît du cache hors ligne dès la première connexion.
 *  3. Une lecture de ces éléments refusée (404) retire aussitôt sa copie en cache (fil devenu invisible).
 */
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import { ApiError } from "./api";
import { localStore } from "./local-store";
import { oublierBrouillons } from "./com-brouillons";

export const TEAM_ROLES: readonly string[] = ["proprietaire", "editeur"];
/**
 * Requêtes qui portent des éléments à audience (commentaires, fils et observations Studio, journal, historique ;
 * Communication : conversations, messages, demandes, activité).
 */
export const AUDIENCE_QUERIES: readonly string[] = ["comments", "collaboration", "studio-comments", "studio-observations", "history", "com"];

export const touchesProject = (key: QueryKey, projectId: string): boolean => Array.isArray(key) && key.some((k) => k === projectId);
const head = (key: QueryKey): string => String(Array.isArray(key) ? key[0] : "");
export const isAudienceQuery = (key: QueryKey, projectId: string): boolean => AUDIENCE_QUERIES.includes(head(key)) && touchesProject(key, projectId);

/** Oublie tout ce que l'appareil garde d'un projet devenu inaccessible. */
export async function forgetProject(queryClient: QueryClient, projectId: string): Promise<void> {
  queryClient.removeQueries({ predicate: (q) => touchesProject(q.queryKey, projectId) && !(head(q.queryKey) === "project" && q.state.status === "error") });
  await localStore.oublierProjet(projectId).catch(() => undefined);
  oublierBrouillons(projectId);
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  void queryClient.invalidateQueries({ queryKey: ["com-boite"] });
}

/** Relit (même hors écran) les éléments à audience d'un projet et les notifications. */
export function refreshAudience(queryClient: QueryClient, projectId: string): void {
  void queryClient.invalidateQueries({ predicate: (q) => isAudienceQuery(q.queryKey, projectId), refetchType: "all" });
  void queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "all" });
}

/** Décision pure : que faire d'un évènement de cache ? (testée sans DOM) */
export type GuardAction = { kind: "forget"; projectId: string } | { kind: "refresh"; projectId: string } | { kind: "drop"; key: QueryKey } | null;

export function decide(
  event: { status: "success" | "error"; key: QueryKey; data?: unknown; error?: unknown },
  seenRoles: Map<string, string>,
): GuardAction {
  const key = event.key;
  if (event.status === "error") {
    if (!(event.error instanceof ApiError) || event.error.status !== 404) return null;
    if (head(key) === "project" && typeof key[1] === "string") return { kind: "forget", projectId: key[1] };
    if (AUDIENCE_QUERIES.includes(head(key))) return { kind: "drop", key };
    return null;
  }
  if (head(key) === "project" && typeof key[1] === "string" && key.length === 2) {
    const role = (event.data as { role?: unknown } | undefined)?.role;
    if (typeof role !== "string") return null;
    const before = seenRoles.get(key[1]);
    seenRoles.set(key[1], role);
    if (!TEAM_ROLES.includes(role) && before !== role) return { kind: "refresh", projectId: key[1] };
  }
  return null;
}

/** Projets encore en cache absents de la liste relue du serveur : à oublier. */
export function missingProjects(cachedProjectIds: readonly string[], listed: unknown): string[] {
  if (!Array.isArray(listed)) return [];
  const ids = new Set(listed.map((p) => (p as { id?: unknown }).id).filter((id): id is string => typeof id === "string"));
  return cachedProjectIds.filter((id) => !ids.has(id));
}

/**
 * Copie d'une lecture refusée (404) : retirée si aucun écran ne l'affiche ; sinon ses données sont effacées sans
 * relecture (retirer une requête affichée la relirait aussitôt : nouveau 404, en boucle).
 */
function dropCopy(queryClient: QueryClient, q: Query): void {
  if (q.getObserversCount() === 0) queryClient.getQueryCache().remove(q);
  else if (q.state.data !== undefined) q.setState({ ...q.state, data: undefined, dataUpdatedAt: 0 });
}

/** Branche le garde sur le cache des requêtes ; renvoie la fonction de désinscription. */
export function installProjectCacheGuard(queryClient: QueryClient): () => void {
  const seenRoles = new Map<string, string>();
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const q = event.query as Query;
    const status = event.action.type === "success" ? "success" : event.action.type === "error" ? "error" : null;
    if (!status) return;
    const action = decide({ status, key: q.queryKey, data: q.state.data, error: q.state.error }, seenRoles);
    if (action?.kind === "forget") void forgetProject(queryClient, action.projectId);
    else if (action?.kind === "refresh") refreshAudience(queryClient, action.projectId);
    else if (action?.kind === "drop") dropCopy(queryClient, q);
    if (status === "success" && head(q.queryKey) === "projects" && q.queryKey.length === 1) {
      const cached = queryClient.getQueryCache().findAll({ queryKey: ["project"] }).map((p) => p.queryKey[1]).filter((id): id is string => typeof id === "string");
      for (const id of missingProjects(cached, q.state.data)) void forgetProject(queryClient, id);
    }
  });
}
