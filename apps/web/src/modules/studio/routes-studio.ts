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
  | { vue: "variante"; projectId: string; etudeId: string; variantId: string; domaine: DomaineStudio; planche: PlancheStudio | null; revision: string | null }
  | { vue: "inconnue"; chemin: string };

/** Domaines d'une variante ; la planche (2D / 3D) n'a de sens que dans le dessin et se choisit explicitement. */
export const DOMAINES_STUDIO = ["dessin", "bim", "visualisation", "documentation"] as const;
export type DomaineStudio = (typeof DOMAINES_STUDIO)[number];
export const PLANCHES_STUDIO = ["2d", "3d"] as const;
export type PlancheStudio = (typeof PLANCHES_STUDIO)[number];

/** Identifiant opaque admis dans un segment : il n'est jamais interprété comme un nom de fichier. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export const estRouteStudio = (pathname: string): boolean => pathname === RACINE_STUDIO || pathname.startsWith(`${RACINE_STUDIO}/`);

/**
 * `search` ne compte que pour une variante : `domaine` absent vaut « dessin » ; une valeur inconnue, répétée, une
 * planche hors du dessin, une révision hors de la Planche 2D ou un paramètre étranger donnent l'écran « adresse non
 * reconnue », jamais une correction. `revision` ouvre une révision passée en lecture seule.
 */
export function lireRouteStudio(pathname: string, search = ""): RouteStudio {
  const reste = pathname.slice(RACINE_STUDIO.length).replace(/\/+$/, "");
  if (!estRouteStudio(pathname) || reste === "") return estRouteStudio(pathname) ? { vue: "accueil" } : { vue: "inconnue", chemin: pathname };
  const segments = reste.slice(1).split("/");
  let ids: string[];
  try {
    ids = segments.map((x) => decodeURIComponent(x));
  } catch {
    return { vue: "inconnue", chemin: pathname };
  }
  const [projets, projectId = "", etudes, etudeId = "", variantes, variantId = ""] = ids;
  const inconnue: RouteStudio = { vue: "inconnue", chemin: pathname + search };
  if (projets !== "projets" || !ID.test(projectId)) return inconnue;
  if (ids.length === 2) return { vue: "projet", projectId };
  if (etudes !== "etudes" || !ID.test(etudeId)) return inconnue;
  if (ids.length === 4) return { vue: "etude", projectId, etudeId };
  if (ids.length !== 6 || variantes !== "variantes" || !ID.test(variantId)) return inconnue;
  const params = new URLSearchParams(search);
  if ([...params.keys()].some((k) => !["domaine", "planche", "revision"].includes(k)) || ["domaine", "planche", "revision"].some((k) => params.getAll(k).length > 1)) return inconnue;
  const domaine = params.get("domaine") ?? "dessin";
  const planche = params.get("planche");
  const revision = params.get("revision");
  if (revision !== null && (planche !== "2d" || !ID.test(revision))) return inconnue;
  if (!(DOMAINES_STUDIO as readonly string[]).includes(domaine)) return inconnue;
  if (planche !== null && (domaine !== "dessin" || !(PLANCHES_STUDIO as readonly string[]).includes(planche))) return inconnue;
  return { vue: "variante", projectId, etudeId, variantId, domaine: domaine as DomaineStudio, planche: planche as PlancheStudio | null, revision };
}

export const cheminProjetStudio = (projectId: string): string => `${RACINE_STUDIO}/projets/${encodeURIComponent(projectId)}`;

export const cheminEtudeStudio = (projectId: string, etudeId: string): string => `${cheminProjetStudio(projectId)}/etudes/${encodeURIComponent(etudeId)}`;

export function cheminVarianteStudio(projectId: string, etudeId: string, variantId: string, domaine: DomaineStudio = "dessin", planche: PlancheStudio | null = null, revision: string | null = null): string {
  const params = new URLSearchParams({ domaine });
  if (domaine === "dessin" && planche) params.set("planche", planche);
  if (domaine === "dessin" && planche === "2d" && revision) params.set("revision", revision);
  return `${cheminEtudeStudio(projectId, etudeId)}/variantes/${encodeURIComponent(variantId)}?${params}`;
}
