/**
 * Repères de travail (chantier Axes, lot AX-1 ; concept `Fadi Concept - Axes.md` 1.0, § 3 et § 5 ; décisions AX-D3 à
 * AX-D5). Pur : ni React, ni DOM.
 *
 * Invariant directeur : changer de repère de travail ne déplace JAMAIS la géométrie. Un repère de travail ne sert qu'à
 * la saisie (inférence, plan de dessin, champ Mesures) ; les coordonnées stockées restent celles du repère du modèle.
 *
 * - **Repère valide** : origine et axes finis, axes unitaires, orthogonaux, main droite (`validerRepere`). Une saisie
 *   confondue ou presque colinéaire est refusée avec une erreur nommée : aucun repli silencieux (AX02).
 * - **Contexte de travail** : repère actif (ou repère du modèle), plan de travail XY / XZ / YZ de ce repère, verrou du
 *   plan. Personnel, hors de l'historique de géométrie ; « Précédent » parcourt un historique de contextes (AX07).
 * - **Repères enregistrés** (`annotations.reperes`, phase B) : définitions nommées, révisées, versionnées.
 */
import type { Repere } from "./annotations.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, ORIGINE, add, cross, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

/** Tolérances du chantier Axes, en un seul endroit (AX-D5). Relatives aux directions : indépendantes de l'échelle. */
export const TOLERANCES_REPERE = Object.freeze({
  /** Longueur minimale d'une direction saisie (m). */
  norme: 1e-9,
  /** Sinus minimal de l'angle entre deux directions pour qu'elles définissent un plan. */
  colinearite: 1e-6,
  /** Écart admis sur ‖axe‖ = 1 et sur les produits scalaires croisés d'une base. */
  base: 1e-9,
});

/** Repère du modèle : origine et axes canoniques. */
export const REPERE_DU_MODELE: Repere = Object.freeze({ origine: ORIGINE, x: AXE_X, y: AXE_Y, z: AXE_Z });

export type ErreurRepere = "non-fini" | "direction-nulle" | "colineaires" | "base-non-unitaire" | "base-non-orthogonale" | "main-gauche";

/** Explications affichées (français, langue source ; l'anglais vient du dictionnaire de l'interface). */
export const MESSAGES_REPERE: Readonly<Record<ErreurRepere, string>> = Object.freeze({
  "non-fini": "Repère refusé : une coordonnée n'est pas un nombre fini.",
  "direction-nulle": "Repère refusé : le point d'axe est confondu avec l'origine. Choisissez un point distinct.",
  colineaires: "Repère refusé : les points sont alignés, ils ne définissent pas de plan. Choisissez un point hors de l'axe rouge.",
  "base-non-unitaire": "Repère refusé : un axe n'est pas unitaire.",
  "base-non-orthogonale": "Repère refusé : les axes ne sont pas perpendiculaires.",
  "main-gauche": "Repère refusé : les axes ne forment pas un repère direct (main droite).",
});

export type ResultatRepere = { readonly ok: true; readonly repere: Repere } | { readonly ok: false; readonly erreur: ErreurRepere; readonly message: string };

const refus = (erreur: ErreurRepere): ResultatRepere => ({ ok: false, erreur, message: MESSAGES_REPERE[erreur] });
/**
 * Vecteur fini, contrôlé avant tout accès : un document ancien ou altéré peut porter un axe absent ou nul (revue Codex
 * de #298) — il est refusé, jamais déréférencé.
 */
const fini = (v: unknown): v is Vec3 => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["x"] === "number" && typeof o["y"] === "number" && typeof o["z"] === "number" && Number.isFinite(o["x"]) && Number.isFinite(o["y"]) && Number.isFinite(o["z"]);
};

/** Contrôle complet d'un repère (création, lecture d'un document, frontière d'une commande). */
export function validerRepere(r: Repere): ResultatRepere {
  if (![r.origine, r.x, r.y, r.z].every(fini)) return refus("non-fini");
  const t = TOLERANCES_REPERE.base;
  if ([r.x, r.y, r.z].some((a) => Math.abs(len(a) - 1) > t)) return refus("base-non-unitaire");
  if (Math.abs(dot(r.x, r.y)) > t || Math.abs(dot(r.y, r.z)) > t || Math.abs(dot(r.z, r.x)) > t) return refus("base-non-orthogonale");
  if (dot(cross(r.x, r.y), r.z) <= 0) return refus("main-gauche");
  return { ok: true, repere: r };
}

/**
 * Repère depuis une origine, une direction X et une direction qui indique le côté Y du plan XY. Y est la composante de
 * `versY` perpendiculaire à X ; Z = X × Y. Directions nulles ou colinéaires : refus nommé (jamais de repli, AX02).
 * `inverserY` donne l'autre orientation (Y opposé, donc Z opposé : le repère reste direct).
 */
export function repereDepuisDirections(origine: Vec3, versX: Vec3, versY: Vec3, inverserY = false): ResultatRepere {
  if (![origine, versX, versY].every(fini)) return refus("non-fini");
  if (len(versX) < TOLERANCES_REPERE.norme || len(versY) < TOLERANCES_REPERE.norme) return refus("direction-nulle");
  const x = normalize(versX);
  const yn = normalize(versY);
  if (len(cross(x, yn)) < TOLERANCES_REPERE.colinearite) return refus("colineaires");
  let y = normalize(sub(yn, scale(x, dot(yn, x))));
  if (inverserY) y = scale(y, -1);
  const z = normalize(cross(x, y));
  // Ré-orthogonalisation finale : Y = Z × X, exact à la précision machine.
  return validerRepere({ origine, x, y: normalize(cross(z, x)), z });
}

/** Repère par trois points : origine, point sur X positif, point du côté Y positif (concept § 5.1). */
export function repereDepuisPoints(origine: Vec3, pointX: Vec3, pointY: Vec3, inverserY = false): ResultatRepere {
  if (![origine, pointX, pointY].every(fini)) return refus("non-fini");
  return repereDepuisDirections(origine, sub(pointX, origine), sub(pointY, origine), inverserY);
}

/**
 * Repère aligné sur une face : Z = normale (inversée sur demande), X = direction donnée projetée dans le plan de la face
 * (le côté d'une arête, par exemple), éventuellement inversée. Une normale seule ne suffit pas (§ 5.2).
 */
export function repereDepuisFace(centre: Vec3, normale: Vec3, directionX: Vec3, options: { inverserNormale?: boolean; inverserX?: boolean } = {}): ResultatRepere {
  if (![centre, normale, directionX].every(fini)) return refus("non-fini");
  if (len(normale) < TOLERANCES_REPERE.norme || len(directionX) < TOLERANCES_REPERE.norme) return refus("direction-nulle");
  const z = scale(normalize(normale), options.inverserNormale ? -1 : 1);
  const dx = normalize(directionX);
  if (len(cross(z, dx)) < TOLERANCES_REPERE.colinearite) return refus("colineaires");
  let x = normalize(sub(dx, scale(z, dot(dx, z))));
  if (options.inverserX) x = scale(x, -1);
  return validerRepere({ origine: centre, x, y: normalize(cross(z, x)), z });
}

/** Repère aligné sur une arête (X = A → B) et un plan donné par sa normale : l'arête seule est sous-déterminée (§ 5.2). */
export function repereDepuisArete(a: Vec3, b: Vec3, normalePlan: Vec3): ResultatRepere {
  if (![a, b, normalePlan].every(fini)) return refus("non-fini");
  return repereDepuisDirections(a, sub(b, a), cross(normalePlan, sub(b, a)));
}

/** Déplace l'origine seule : l'orientation est conservée (AX03). */
export function deplacerOrigine(r: Repere, origine: Vec3): ResultatRepere {
  if (!fini(origine)) return refus("non-fini");
  return validerRepere({ ...r, origine });
}

export type NomAxe = "x" | "y" | "z";
/** Base d'un axe de rotation : axe du repère courant (local) ou du modèle — l'inspecteur le dit (§ 5.1). */
export type BaseAxe = "local" | "modele";

const tournerVecteur = (v: Vec3, axe: Vec3, angle: number): Vec3 => {
  const k = normalize(axe);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
};

/** Fait pivoter le repère d'un angle signé (radians, règle de la main droite) autour d'un axe nommé passant par son origine. */
export function pivoterRepere(r: Repere, axe: NomAxe, base: BaseAxe, angle: number): ResultatRepere {
  if (!Number.isFinite(angle)) return refus("non-fini");
  const direction = base === "local" ? r[axe] : REPERE_DU_MODELE[axe];
  const x = normalize(tournerVecteur(r.x, direction, angle));
  const z0 = normalize(tournerVecteur(r.z, direction, angle));
  const y = normalize(cross(z0, x));
  return validerRepere({ origine: r.origine, x, y, z: normalize(cross(x, y)) });
}

/** Point du modèle exprimé dans le repère (coordonnées locales). */
export const versRepereLocal = (p: Vec3, r: Repere): Vec3 => {
  const d = sub(p, r.origine);
  return v3(dot(d, r.x), dot(d, r.y), dot(d, r.z));
};
/** Point local du repère exprimé dans le modèle. */
export const depuisRepereLocal = (p: Vec3, r: Repere): Vec3 => add(r.origine, add(add(scale(r.x, p.x), scale(r.y, p.y)), scale(r.z, p.z)));
/** Direction locale → modèle (sans l'origine). */
export const directionVersModele = (d: Vec3, r: Repere): Vec3 => add(add(scale(r.x, d.x), scale(r.y, d.y)), scale(r.z, d.z));

/** Repères égaux à la tolérance du chantier (positions relatives à l'échelle de l'origine). */
export function memeRepere(a: Repere, b: Repere): boolean {
  const t = TOLERANCES_REPERE.base * 10;
  const echelle = Math.max(1, len(a.origine), len(b.origine));
  return len(sub(a.origine, b.origine)) <= t * echelle && (["x", "y", "z"] as const).every((k) => len(sub(a[k], b[k])) <= t);
}

// ————————————————————————————————————————————————————————————— Plan de travail

export type PlanRepere = "xy" | "xz" | "yz";
export const PLANS_REPERE: readonly PlanRepere[] = Object.freeze(["xy", "xz", "yz"]);

/** Plan de dessin dérivé : origine, normale et deux axes dans le plan (u, w) — même forme que le plan des outils. */
export interface PlanDeTravail {
  readonly origine: Vec3;
  readonly normale: Vec3;
  readonly u: Vec3;
  readonly w: Vec3;
  /** Verrou du plan (§ 5.3) : contraint les saisies des outils éligibles ; ni droit d'objet, ni verrou du modèle. */
  readonly verrouille: boolean;
}

/** Plan XY, XZ ou YZ d'un repère, axes dans l'ordre « R puis V, R puis B, V puis B » ; normale = troisième axe direct. */
export function planDuRepere(r: Repere, plan: PlanRepere, verrouille = false): PlanDeTravail {
  if (plan === "xy") return { origine: r.origine, normale: r.z, u: r.x, w: r.y, verrouille };
  if (plan === "xz") return { origine: r.origine, normale: scale(r.y, -1), u: r.x, w: r.z, verrouille };
  return { origine: r.origine, normale: r.x, u: r.y, w: r.z, verrouille };
}

/** Intersection d'une droite (origine, direction) avec un plan ; `null` si parallèle ou derrière l'origine. */
export function intersectionPlanDeTravail(origine: Vec3, direction: Vec3, pl: Pick<PlanDeTravail, "origine" | "normale">): Vec3 | null {
  const V = normalize(direction);
  const den = dot(pl.normale, V);
  if (Math.abs(den) < 1e-12) return null;
  const t = dot(pl.normale, sub(pl.origine, origine)) / den;
  if (t < 0) return null;
  return add(origine, scale(V, t));
}

/** Projection orthogonale d'un point sur le plan. */
export const projeterSurPlanDeTravail = (p: Vec3, pl: Pick<PlanDeTravail, "origine" | "normale">): Vec3 => sub(p, scale(pl.normale, dot(pl.normale, sub(p, pl.origine))));

// ————————————————————————————————————————————————————————————— Contexte de travail

/** D'où vient le repère actif : le modèle, un repère temporaire (placé, aligné, pivoté) ou un repère enregistré. */
export type SourceContexte =
  | { readonly genre: "modele" }
  /** `depuis` : repère enregistré dont ce repère temporaire est une modification (« Modifié », AX-3). */
  | { readonly genre: "temporaire"; readonly depuis?: { readonly id: string; readonly revision: number } }
  | { readonly genre: "enregistre"; readonly id: string; readonly revision: number };

/**
 * Contexte de travail (personnel, AX-D3) : repère actif, plan de travail de ce repère, verrou. `repere` vaut `null` pour
 * le repère du modèle. Jamais dans l'historique de géométrie.
 */
export interface ContexteTravail {
  readonly repere: Repere | null;
  readonly source: SourceContexte;
  readonly plan: PlanRepere;
  readonly verrou: boolean;
}

export const CONTEXTE_MODELE: ContexteTravail = Object.freeze({ repere: null, source: Object.freeze({ genre: "modele" as const }), plan: "xy" as const, verrou: false });

/** Repère effectif du contexte (le repère du modèle quand `repere` est nul). */
export const repereDuContexte = (c: ContexteTravail): Repere => c.repere ?? REPERE_DU_MODELE;
/** Plan de travail effectif du contexte. */
export const planDuContexte = (c: ContexteTravail): PlanDeTravail => planDuRepere(repereDuContexte(c), c.plan, c.verrou);

/**
 * Contexte temporaire à partir d'un repère validé ; le plan et le verrou sont conservés. Modifier un repère enregistré
 * garde la trace de son origine (`depuis`) : l'interface affiche « Modifié » et offre « Enregistrer les modifications »
 * ou « Enregistrer comme nouveau » ; la définition enregistrée n'est jamais réécrite en silence (AX-3).
 */
export function contexteTemporaire(c: ContexteTravail, repere: Repere): ContexteTravail {
  const depuis = c.source.genre === "enregistre" ? { id: c.source.id, revision: c.source.revision } : c.source.genre === "temporaire" ? c.source.depuis : undefined;
  return { ...c, repere, source: depuis ? { genre: "temporaire", depuis } : { genre: "temporaire" } };
}

/** Retour au repère du modèle et au plan par défaut (XY, non verrouillé) ; caméra et géométrie inchangées. */
export const contexteDuModele = (): ContexteTravail => CONTEXTE_MODELE;

export const memesContextes = (a: ContexteTravail, b: ContexteTravail): boolean =>
  a.plan === b.plan &&
  a.verrou === b.verrou &&
  a.source.genre === b.source.genre &&
  (a.source.genre !== "enregistre" || (b.source.genre === "enregistre" && a.source.id === b.source.id && a.source.revision === b.source.revision)) &&
  memeRepere(repereDuContexte(a), repereDuContexte(b));

/** Historique de session des contextes de travail (« Repère précédent »), distinct de l'historique de géométrie. */
export interface HistoriqueContextes {
  readonly courant: ContexteTravail;
  /** Contextes antérieurs, le plus récent en dernier ; au plus `HISTORIQUE_CONTEXTES_MAX`. */
  readonly precedents: readonly ContexteTravail[];
}
export const HISTORIQUE_CONTEXTES_MAX = 20;

export const historiqueInitial = (courant: ContexteTravail = CONTEXTE_MODELE): HistoriqueContextes => ({ courant, precedents: [] });

/** Change de contexte ; un contexte identique au courant ne crée pas d'entrée (une annulation d'aperçu n'en crée pas non plus : rien n'est poussé). */
export function pousserContexte(h: HistoriqueContextes, suivant: ContexteTravail): HistoriqueContextes {
  if (memesContextes(h.courant, suivant)) return h;
  const precedents = [...h.precedents, h.courant].slice(-HISTORIQUE_CONTEXTES_MAX);
  return { courant: suivant, precedents };
}

/** Revient au contexte précédent (`null` s'il n'y en a pas). Ne touche jamais la géométrie. */
export function contextePrecedent(h: HistoriqueContextes): HistoriqueContextes | null {
  const p = h.precedents[h.precedents.length - 1];
  if (!p) return null;
  return { courant: p, precedents: h.precedents.slice(0, -1) };
}

// ————————————————————————————————————————————————————————————— Repères enregistrés

export const VERSION_SCHEMA_REPERE = 1;

/** Repère enregistré (§ 8.1) : identifiant stable, nom, base, révision, version de schéma, source (instantané en AX-1). */
export interface RepereEnregistre extends Repere {
  readonly id: string;
  readonly nom: string;
  readonly revision: number;
  readonly version: number;
  readonly source: SourceRepere;
}

/**
 * Source d'un repère enregistré : instantané (défaut, AX-D7) ou lien typé vers une face (AX-5) avec l'instantané de la
 * face au moment du lien, qui sert à juger sa santé (jamais de rattachement deviné, AX13).
 */
export type SourceRepere =
  | { readonly mode: "instantane" }
  | { readonly mode: "lie"; readonly face: string; readonly controle: { readonly centre: Vec3; readonly normale: Vec3 } };

/**
 * Migration (AX-D4, AX09) : le repère unique d'un document ancien devient le contexte de travail initial, sans
 * réécrire le document ni une coordonnée. Un repère illisible (non fini, base invalide) est ignoré, jamais « réparé ».
 */
export function contexteDepuisDocument(repere: Repere | undefined): ContexteTravail {
  if (!repere) return CONTEXTE_MODELE;
  const v = validerRepere(repere);
  return v.ok ? { ...CONTEXTE_MODELE, repere: v.repere, source: { genre: "temporaire" } } : CONTEXTE_MODELE;
}

/** Contrôle d'un repère enregistré lu dans un document (frontière de désérialisation). */
export function repereEnregistreValide(x: unknown): x is RepereEnregistre {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<RepereEnregistre>;
  if (typeof r.id !== "string" || r.id === "" || typeof r.nom !== "string" || typeof r.revision !== "number" || typeof r.version !== "number") return false;
  if (!r.source || (r.source.mode !== "instantane" && r.source.mode !== "lie")) return false;
  const estV = (v: unknown): v is Vec3 => !!v && typeof v === "object" && ["x", "y", "z"].every((k) => typeof (v as Record<string, unknown>)[k] === "number");
  if (![r.origine, r.x, r.y, r.z].every(estV)) return false;
  return validerRepere(r as Repere).ok;
}
