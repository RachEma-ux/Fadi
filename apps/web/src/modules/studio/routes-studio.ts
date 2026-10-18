/**
 * Contrat d'adresse de Studio (ADR-STUDIO-NAV-01 §1, porté sur Studio V1) : routes propres sous `/studio`, jamais
 * sous `/projets` (l'entrée Projets ne s'allume pas), identifiants opaques vérifiés par le serveur. Une adresse ou un
 * paramètre inconnu donne un écran explicite, jamais un repli silencieux. Pur : ni React ni DOM.
 *
 * Seul paramètre admis : `revision` sur une variante (une seule fois), qui ouvre cette révision en lecture seule.
 */

export const RACINE_STUDIO = "/studio";

export type RouteStudio =
  | { vue: "accueil" }
  | { vue: "projet"; projectId: string }
  | { vue: "etude"; projectId: string; studyId: string }
  | { vue: "variante"; projectId: string; studyId: string; variantId: string; revisionId: string | null }
  | { vue: "inconnue"; chemin: string };

/** Identifiant opaque admis dans un segment ou un paramètre : jamais interprété comme un nom de fichier. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export const estRouteStudio = (pathname: string): boolean => pathname === RACINE_STUDIO || pathname.startsWith(`${RACINE_STUDIO}/`);

/** Lit l'adresse ; tout ce qui n'est pas reconnu exactement donne la vue « inconnue », jamais une correction. */
export function lireRouteStudio(pathname: string, search = ""): RouteStudio {
  const inconnue: RouteStudio = { vue: "inconnue", chemin: pathname + search };
  if (!estRouteStudio(pathname)) return inconnue;
  const params = new URLSearchParams(search);
  const cles = [...params.keys()];
  const reste = pathname.slice(RACINE_STUDIO.length).replace(/\/+$/, "");
  if (reste === "") return cles.length ? inconnue : { vue: "accueil" };
  let ids: string[];
  try {
    ids = reste.slice(1).split("/").map((x) => decodeURIComponent(x));
  } catch {
    return inconnue;
  }
  const [projets, projectId = "", etudes, studyId = "", variantes, variantId = ""] = ids;
  if (projets !== "projets" || !ID.test(projectId)) return inconnue;
  if (ids.length === 2) return cles.length ? inconnue : { vue: "projet", projectId };
  if (etudes !== "etudes" || !ID.test(studyId)) return inconnue;
  if (ids.length === 4) return cles.length ? inconnue : { vue: "etude", projectId, studyId };
  if (ids.length !== 6 || variantes !== "variantes" || !ID.test(variantId)) return inconnue;
  if (cles.some((k) => k !== "revision")) return inconnue;
  const revisions = params.getAll("revision");
  if (revisions.length > 1) return inconnue;
  const revisionId = revisions[0] ?? null;
  if (revisionId !== null && !ID.test(revisionId)) return inconnue;
  return { vue: "variante", projectId, studyId, variantId, revisionId };
}

export const cheminProjetStudio = (projectId: string): string => `${RACINE_STUDIO}/projets/${encodeURIComponent(projectId)}`;

export const cheminEtudeStudio = (projectId: string, studyId: string): string => `${cheminProjetStudio(projectId)}/etudes/${encodeURIComponent(studyId)}`;

export function cheminVarianteStudio(projectId: string, studyId: string, variantId: string, revisionId: string | null = null): string {
  const base = `${cheminEtudeStudio(projectId, studyId)}/variantes/${encodeURIComponent(variantId)}`;
  return revisionId === null ? base : `${base}?${new URLSearchParams({ revision: revisionId })}`;
}
