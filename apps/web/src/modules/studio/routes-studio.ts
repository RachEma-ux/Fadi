/**
 * Contrat d'adresse de Studio (lot I, ADR-STUDIO-NAV-01 §1) : routes propres sous `/studio`, jamais sous
 * `/projets` (l'entrée Projets ne s'allume pas), identifiants opaques et vérifiés par le serveur. Une adresse
 * inconnue donne un écran explicite, jamais le repli silencieux vers l'accueil. Pur : ni React ni DOM.
 */

export const RACINE_STUDIO = "/studio";

export type RouteStudio =
  | { vue: "accueil" }
  | { vue: "projet"; projectId: string }
  | { vue: "etude"; projectId: string; etudeId: string }
  | { vue: "inconnue"; chemin: string };

/** Identifiant opaque admis dans un segment : il n'est jamais interprété comme un nom de fichier. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export const estRouteStudio = (pathname: string): boolean => pathname === RACINE_STUDIO || pathname.startsWith(`${RACINE_STUDIO}/`);

export function lireRouteStudio(pathname: string): RouteStudio {
  const reste = pathname.slice(RACINE_STUDIO.length).replace(/\/+$/, "");
  if (!estRouteStudio(pathname) || reste === "") return estRouteStudio(pathname) ? { vue: "accueil" } : { vue: "inconnue", chemin: pathname };
  const segments = reste.slice(1).split("/");
  let ids: string[];
  try {
    ids = segments.map((x) => decodeURIComponent(x));
  } catch {
    return { vue: "inconnue", chemin: pathname };
  }
  const [projets, projectId = "", etudes, etudeId = ""] = ids;
  if (projets !== "projets" || !ID.test(projectId)) return { vue: "inconnue", chemin: pathname };
  if (ids.length === 2) return { vue: "projet", projectId };
  if (ids.length === 4 && etudes === "etudes" && ID.test(etudeId)) return { vue: "etude", projectId, etudeId };
  return { vue: "inconnue", chemin: pathname };
}

export const cheminProjetStudio = (projectId: string): string => `${RACINE_STUDIO}/projets/${encodeURIComponent(projectId)}`;

export const cheminEtudeStudio = (projectId: string, etudeId: string): string => `${cheminProjetStudio(projectId)}/etudes/${encodeURIComponent(etudeId)}`;
