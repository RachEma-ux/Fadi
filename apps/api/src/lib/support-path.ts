/**
 * Accès support (D-2, UM-4) : résolution du projet visé et chemins d'export, purs (revue de sécurité de la PR #255).
 */

/**
 * Chemins d'export ou de téléchargement (défense supplémentaire seulement : la frontière est la capacité `export` déclarée
 * par chaque route, voir `lib/owned-project.ts`). Appliqué au chemin décodé, en minuscules, sans barre oblique finale.
 */
export const EXPORT_PATH = /(\/archive$|\/copies$|\/export(\/|$|\.)|\.(ifc|step|dxf|pdf|zip|svg|json|csv|html)$|^\/files\/[^/]+|\/steps\/[^/]+\/files\/[^/]+$|\/documents\/.+|\/rapport$|\/fichiers\/|\/files\/[^/]+$|\/illustrations\/[^/]+\/image$)/;

/**
 * Le projet visé et le reste du chemin, résolus comme le routeur Express résout `:projectId` (segment décodé par
 * `decodeURIComponent`) ; `null` si le chemin ne vise pas un projet ou si l'encodage est invalide (Express répond alors
 * 400 sans atteindre aucune route de projet). Pur.
 */
export function supportTarget(path: string): { projectId: string; sub: string } | null {
  const match = /^\/([^/]+)(\/.*)?$/.exec(path);
  if (!match) return null;
  let projectId: string;
  let sub: string;
  try {
    projectId = decodeURIComponent(match[1]!);
    sub = decodeURIComponent(match[2] ?? "");
  } catch {
    return null;
  }
  if (!projectId || projectId === "import") return null;
  return { projectId, sub: sub.toLowerCase().replace(/\/+$/, "") };
}
