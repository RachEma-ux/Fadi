/**
 * Contrat d'adresse de Studio (ADR-STUDIO-NAV-01 §1, porté sur Studio V1) : routes propres sous `/studio`, jamais
 * sous `/projets` (l'entrée Projets ne s'allume pas), identifiants opaques vérifiés par le serveur. Une adresse ou un
 * paramètre inconnu donne un écran explicite, jamais un repli silencieux. Pur : ni React ni DOM.
 *
 * Paramètres admis : `revision` sur une variante (une seule fois), qui ouvre cette révision en lecture seule ;
 * `commentaires=ouverts` sur une variante (une seule fois, seule valeur admise), qui ouvre son panneau de commentaires ; `de` et
 * `a` sur la comparaison d'une étude (`…/etudes/:s/comparer`), chacun au plus une fois, de la forme
 * `variantId` (tête) ou `variantId:revisionId` ; `archives=1` sur un projet ou une étude (une seule fois, seule valeur
 * admise), qui affiche aussi les études ou les variantes archivées.
 *
 * Domaine et planche actifs (I.4-03, ROUTE-06, NAV-005 ; **proposé, non livré comme contrat** : le contrat d'URL
 * reste « À définir », décision du maître d'ouvrage attendue ; cette lecture rétrocompatible peut être changée ou
 * retirée par cette décision) : sur une variante, `domaine=dessin|bim|visualisation|documentation` (une seule fois) désigne le
 * domaine actif ; `planche=2d|3d` (une seule fois) la planche active, admise **seulement avec `domaine=dessin`**
 * (ADR-STUDIO-NAV-01 §1 : les planches n'existent que dans Dessin et modélisation). Paramètres facultatifs et
 * additifs : une adresse sans eux s'ouvre comme avant (Dessin et modélisation, Planche 2D) ; une valeur inconnue,
 * répétée ou une planche hors de `dessin` donne l'adresse non reconnue. Ils se combinent avec `revision` et
 * `commentaires` ; le contexte projet → étude → variante reste dans le chemin. Ils ne transmettent aucun droit.
 */
import { estDomaineStudio, estPlancheStudio, type DomaineStudio, type PlancheStudio } from "./domaines/domaines";

export const RACINE_STUDIO = "/studio";

/** Un côté de comparaison : une variante, à sa tête (`revisionId` nul) ou à une révision donnée. */
export interface CoteComparaisonStudio { variantId: string; revisionId: string | null }

export type RouteStudio =
  | { vue: "accueil" }
  | { vue: "projet"; projectId: string; archives: boolean }
  | { vue: "etude"; projectId: string; studyId: string; archives: boolean }
  | { vue: "comparer"; projectId: string; studyId: string; de: CoteComparaisonStudio | null; a: CoteComparaisonStudio | null }
  | { vue: "variante"; projectId: string; studyId: string; variantId: string; revisionId: string | null; commentaires: boolean; domaine: DomaineStudio | null; planche: PlancheStudio | null }
  | { vue: "inconnue"; chemin: string };

/** Identifiant opaque admis dans un segment ou un paramètre : jamais interprété comme un nom de fichier. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
/** Seule valeur admise de `commentaires` : ouvre le panneau des commentaires de la variante (lien d'une notification). */
const COMMENTAIRES_OUVERTS = "ouverts";
/** Seule valeur admise de `archives` : affiche aussi les archives (projet : études ; étude : variantes). */
const ARCHIVES_AFFICHEES = "1";

/** `archives` seul admis, au plus une fois, valeur `1` ; `undefined` = adresse non reconnue. */
function lireArchives(params: URLSearchParams): boolean | undefined {
  if ([...params.keys()].some((k) => k !== "archives")) return undefined;
  const valeurs = params.getAll("archives");
  if (valeurs.length === 0) return false;
  return valeurs.length === 1 && valeurs[0] === ARCHIVES_AFFICHEES ? true : undefined;
}

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
  if (ids.length === 2) {
    const archives = lireArchives(params);
    return archives === undefined ? inconnue : { vue: "projet", projectId, archives };
  }
  if (etudes !== "etudes" || !ID.test(studyId)) return inconnue;
  if (ids.length === 4) {
    const archives = lireArchives(params);
    return archives === undefined ? inconnue : { vue: "etude", projectId, studyId, archives };
  }
  if (ids.length === 5 && etudes === "etudes" && ids[4] === "comparer") {
    if (cles.some((k) => k !== "de" && k !== "a")) return inconnue;
    const de = lireCote(params.getAll("de")), a = lireCote(params.getAll("a"));
    if (de === undefined || a === undefined) return inconnue;
    return { vue: "comparer", projectId, studyId, de, a };
  }
  if (ids.length !== 6 || variantes !== "variantes" || !ID.test(variantId)) return inconnue;
  if (cles.some((k) => k !== "revision" && k !== "commentaires" && k !== "domaine" && k !== "planche")) return inconnue;
  const revisions = params.getAll("revision");
  if (revisions.length > 1) return inconnue;
  const revisionId = revisions[0] ?? null;
  if (revisionId !== null && !ID.test(revisionId)) return inconnue;
  const commentaires = params.getAll("commentaires");
  if (commentaires.length > 1 || (commentaires.length === 1 && commentaires[0] !== COMMENTAIRES_OUVERTS)) return inconnue;
  const domaines = params.getAll("domaine"), planches = params.getAll("planche");
  if (domaines.length > 1 || planches.length > 1) return inconnue;
  const domaine = domaines[0] ?? null, planche = planches[0] ?? null;
  if (domaine !== null && !estDomaineStudio(domaine)) return inconnue;
  if (planche !== null && (!estPlancheStudio(planche) || domaine !== "dessin")) return inconnue;
  return { vue: "variante", projectId, studyId, variantId, revisionId, commentaires: commentaires.length === 1, domaine, planche };
}

/** Valeur d'un côté (`undefined` = mal formé ou répété ; `null` = absent). */
function lireCote(valeurs: string[]): CoteComparaisonStudio | null | undefined {
  if (valeurs.length === 0) return null;
  if (valeurs.length > 1) return undefined;
  const parts = valeurs[0]!.split(":");
  if (parts.length > 2 || !parts.every((p) => ID.test(p))) return undefined;
  return { variantId: parts[0]!, revisionId: parts[1] ?? null };
}

/** `variantId` ou `variantId:revisionId` : la forme lue par la page et par l'API de comparaison. */
export const valeurCoteStudio = (c: CoteComparaisonStudio): string => (c.revisionId === null ? c.variantId : `${c.variantId}:${c.revisionId}`);

export function cheminComparaisonStudio(projectId: string, studyId: string, de: CoteComparaisonStudio | null = null, a: CoteComparaisonStudio | null = null): string {
  const base = `${cheminEtudeStudio(projectId, studyId)}/comparer`;
  const q = new URLSearchParams();
  if (de) q.set("de", valeurCoteStudio(de));
  if (a) q.set("a", valeurCoteStudio(a));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

const avecArchives = (base: string, archives: boolean) => (archives ? `${base}?archives=${ARCHIVES_AFFICHEES}` : base);

export const cheminProjetStudio = (projectId: string, options: { archives?: boolean } = {}): string =>
  avecArchives(`${RACINE_STUDIO}/projets/${encodeURIComponent(projectId)}`, !!options.archives);

export const cheminEtudeStudio = (projectId: string, studyId: string, options: { archives?: boolean } = {}): string =>
  avecArchives(`${cheminProjetStudio(projectId)}/etudes/${encodeURIComponent(studyId)}`, !!options.archives);

/** Domaine et planche d'une adresse de variante (I.4-03, proposition). */
export interface OptionsDomaineVariante { domaine?: DomaineStudio | null; planche?: PlancheStudio | null }

/** `planche` n'est écrite qu'avec `domaine: "dessin"` (sinon ignorée : une planche n'existe que dans ce domaine). */
export function cheminVarianteStudio(projectId: string, studyId: string, variantId: string, revisionId: string | null = null, options: { commentaires?: boolean } & OptionsDomaineVariante = {}): string {
  const base = `${cheminEtudeStudio(projectId, studyId)}/variantes/${encodeURIComponent(variantId)}`;
  const q = new URLSearchParams();
  if (revisionId !== null) q.set("revision", revisionId);
  if (options.commentaires) q.set("commentaires", COMMENTAIRES_OUVERTS);
  if (options.domaine) q.set("domaine", options.domaine);
  if (options.domaine === "dessin" && options.planche) q.set("planche", options.planche);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
