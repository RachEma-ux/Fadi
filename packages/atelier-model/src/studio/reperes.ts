import type { StudioPoint } from "./noyau/types.js";
import { array, fail, finite, record } from "./noyau/validation.js";

/**
 * Repères et transformations de Studio (EX-023, TR-EX-023). Toute coordonnée de Studio appartient à un repère nommé,
 * en mètres :
 *
 * - `local-objet` : repère propre d'un objet (symbole d'un graphisme, `graphismes/`), posé dans le document par sa
 *   position, sa rotation et son échelle ;
 * - `local-2d` : repère du document (`StudioDocument.frame`), celui de toutes les données enregistrées ;
 * - `projet` : système de projet de la variante, déclaré explicitement et **versionné** (`StudioSystemeProjet`, commande
 *   `studio.repere.projet`) — origine du document exprimée dans le système de projet et rotation ; aucune valeur n'est
 *   supposée : sans déclaration, la conversion vers le projet est refusée (« système de projet non déclaré ») ;
 * - `geographique` : système géographique référencé. Il se nomme pour être refusé : Studio n'a pas de projection
 *   cartographique, et une similitude ne relie jamais un repère géographique au repère local (jamais mélangés).
 *
 * Une transformation est une similitude **explicite** `p' = translation + échelle × R(rotation) × p`, d'un repère à un
 * autre, avec son unité (`m`) et sa version ; elle est **vérifiée** (valeurs finies, échelle strictement positive,
 * aller-retour exact à la tolérance numérique déclarée) et chaque point converti porte la trace de la transformation
 * employée (repères, version). Un point en pixels, un repère d'écran ou un repère qui ne correspond pas à la
 * transformation est refusé : rien n'est converti en silence. Pur : ni React, ni DOM.
 */

export const STUDIO_REPERES = Object.freeze(["local-objet", "local-2d", "projet", "geographique"] as const);
export type StudioRepere = (typeof STUDIO_REPERES)[number];

/** Unité de toute coordonnée Studio. Les pixels (projection graphique) ne sont jamais une unité de référence. */
export type StudioUniteRepere = "m";

export interface StudioPointRepere {
  repere: StudioRepere;
  unite: StudioUniteRepere;
  x: number;
  y: number;
}

export interface StudioTransformationRepere {
  de: StudioRepere;
  vers: StudioRepere;
  /** Version de la transformation (entier ≥ 1) : celle du système de projet, ou 1 pour la pose d'un objet. */
  version: number;
  /** Rotation en radians, sens trigonométrique. */
  rotation: number;
  /** Facteur d'échelle sans unité, strictement positif (1 : isométrie). */
  echelle: number;
  /** Translation en mètres, exprimée dans le repère d'arrivée. */
  translation: StudioPoint;
  unite: StudioUniteRepere;
}

/** Trace d'une conversion : repères, version et unité de la transformation employée. */
export interface StudioTraceConversion { de: StudioRepere; vers: StudioRepere; version: number; unite: StudioUniteRepere }
export interface StudioPointConverti extends StudioPointRepere { trace: StudioTraceConversion }

/** Tolérance numérique de la vérification d'aller-retour (relative à l'étendue des points de contrôle) : pas une valeur métier. */
export const STUDIO_TOLERANCE_REPERE = 1e-9;

function refuserRepere(r: unknown, path: string): StudioRepere {
  if (!(STUDIO_REPERES as readonly unknown[]).includes(r)) fail(path, "repère inconnu (local-objet, local-2d, projet ou geographique attendu) : un repère d’écran ou en pixels n’est jamais accepté");
  return r as StudioRepere;
}
function refuserUnite(u: unknown, path: string): StudioUniteRepere {
  if (u !== "m") fail(path, "unité m attendue : une projection en pixels n’est jamais une unité de référence");
  return "m";
}

/** Point validé dans son repère (repère connu, unité m, coordonnées finies). */
export function studioPointRepere(value: unknown, path = "point"): StudioPointRepere {
  const o = record(value, ["repere", "unite", "x", "y"], path);
  return { repere: refuserRepere(o.repere, `${path}.repere`), unite: refuserUnite(o.unite, `${path}.unite`), x: finite(o.x, `${path}.x`), y: finite(o.y, `${path}.y`) };
}

/** Transformation validée et vérifiée (aller-retour exact) ; lève `StudioValidationError` sinon. */
export function studioTransformationRepere(value: unknown, path = "transformation"): StudioTransformationRepere {
  const o = record(value, ["de", "vers", "version", "rotation", "echelle", "translation", "unite"], path);
  const de = refuserRepere(o.de, `${path}.de`), vers = refuserRepere(o.vers, `${path}.vers`);
  if (de === vers) fail(path, "repères de départ et d’arrivée identiques");
  if (de === "geographique" || vers === "geographique") fail(path, "repère géographique : aucune projection cartographique dans Studio, jamais mélangé au repère local");
  const version = finite(o.version, `${path}.version`);
  if (!Number.isInteger(version) || version < 1) fail(`${path}.version`, "version entière ≥ 1 attendue");
  const echelle = finite(o.echelle, `${path}.echelle`);
  if (!(echelle > 0)) fail(`${path}.echelle`, "échelle strictement positive attendue");
  const t = record(o.translation, ["x", "y"], `${path}.translation`);
  const out: StudioTransformationRepere = {
    de, vers, version, rotation: finite(o.rotation, `${path}.rotation`), echelle,
    translation: { x: finite(t.x, `${path}.translation.x`), y: finite(t.y, `${path}.translation.y`) },
    unite: refuserUnite(o.unite, `${path}.unite`),
  };
  const v = studioVerifierTransformation(out);
  if (!v.verifiee) fail(path, `transformation non vérifiée (écart d’aller-retour ${v.ecartMax})`);
  return out;
}

const appliquer = (t: StudioTransformationRepere, p: StudioPoint): StudioPoint => {
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  return { x: t.translation.x + t.echelle * (c * p.x - s * p.y), y: t.translation.y + t.echelle * (s * p.x + c * p.y) };
};

/** Coordonnées d'un point (du repère de départ) par une transformation **déjà validée** (`studioTransformationRepere`). */
export const studioAppliquerTransformation = (t: StudioTransformationRepere, p: StudioPoint): StudioPoint => appliquer(t, p);

/** Transformation inverse (même version), d'arrivée vers départ. */
export function studioInverserTransformation(t: StudioTransformationRepere): StudioTransformationRepere {
  const c = Math.cos(-t.rotation), s = Math.sin(-t.rotation), k = 1 / t.echelle;
  // p = R(−θ) (p' − T) / k  ⇒  translation inverse = −R(−θ) T / k.
  return {
    de: t.vers, vers: t.de, version: t.version, rotation: -t.rotation, echelle: k,
    translation: { x: -k * (c * t.translation.x - s * t.translation.y), y: -k * (s * t.translation.x + c * t.translation.y) }, unite: t.unite,
  };
}

/**
 * Vérification d'une transformation : valeurs finies, échelle > 0, et aller-retour (directe puis inverse) sur des points
 * de contrôle (origine, axes, coin éloigné) revenu à `STUDIO_TOLERANCE_REPERE` près de l'étendue. Rien n'est corrigé.
 */
export function studioVerifierTransformation(t: StudioTransformationRepere): { verifiee: boolean; ecartMax: number } {
  const finis = [t.rotation, t.echelle, t.translation.x, t.translation.y].every(Number.isFinite);
  if (!finis || !(t.echelle > 0)) return { verifiee: false, ecartMax: Number.POSITIVE_INFINITY };
  const inv = studioInverserTransformation(t);
  const etendue = Math.max(1, Math.abs(t.translation.x), Math.abs(t.translation.y));
  let ecartMax = 0;
  for (const p of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: etendue, y: -etendue }]) {
    const q = appliquer(inv, appliquer(t, p));
    ecartMax = Math.max(ecartMax, Math.abs(q.x - p.x), Math.abs(q.y - p.y));
  }
  return { verifiee: ecartMax <= STUDIO_TOLERANCE_REPERE * etendue * Math.max(1, t.echelle, 1 / t.echelle), ecartMax };
}

/**
 * Conversion explicite d'un point par une transformation : le point doit être dans le repère de départ de la
 * transformation, en mètres ; le résultat est dans le repère d'arrivée et porte sa trace (repères, version, unité).
 */
export function studioConvertirPoint(point: StudioPointRepere, t: StudioTransformationRepere): StudioPointConverti {
  const p = studioPointRepere(point);
  const tv = studioTransformationRepere(t);
  if (p.repere !== tv.de) fail("point.repere", `point dans le repère ${p.repere}, transformation depuis ${tv.de} : repères jamais mélangés`);
  const q = appliquer(tv, p);
  return { repere: tv.vers, unite: "m", x: q.x, y: q.y, trace: { de: tv.de, vers: tv.vers, version: tv.version, unite: tv.unite } };
}

/** Composition `b ∘ a` (d'abord `a`, puis `b`) : l'arrivée de `a` doit être le départ de `b` ; version = celle de `b`. */
export function studioComposerTransformations(a: StudioTransformationRepere, b: StudioTransformationRepere): StudioTransformationRepere {
  if (a.vers !== b.de) fail("transformation", `composition impossible : ${a.vers} ≠ ${b.de}`);
  const t = appliquer(b, a.translation);
  return { de: a.de, vers: b.vers, version: b.version, rotation: a.rotation + b.rotation, echelle: a.echelle * b.echelle, translation: t, unite: "m" };
}

// ——— Système de projet (document) ———

/** Une version du système de projet : coordonnées, dans le système de projet, de l'origine du document, et rotation. */
export interface StudioVersionSystemeProjet {
  version: number;
  /** Coordonnées (m) dans le système de projet de l'origine (0, 0) du repère `local-2d`. */
  origine: StudioPoint;
  /** Rotation (radians, sens trigonométrique) de l'axe x du document dans le système de projet. */
  rotation: number;
}

/**
 * Système de projet d'un document (extension additive, facultative `StudioDocument.systemeProjet`) : **toutes** ses
 * versions, dans l'ordre (1, 2, 3…), la dernière étant en vigueur. Une nouvelle version s'ajoute, aucune n'est réécrite :
 * un point converti hier reste explicable par sa version. Échelle toujours 1 (les deux repères sont en mètres).
 */
export interface StudioSystemeProjet { versions: StudioVersionSystemeProjet[] }

/** Borne technique du nombre de versions conservées (pas une valeur métier). */
export const STUDIO_LIMITE_VERSIONS_PROJET = 200;

export function validerVersionSystemeProjet(value: unknown, path: string): StudioVersionSystemeProjet {
  const o = record(value, ["version", "origine", "rotation"], path);
  const version = finite(o.version, `${path}.version`);
  if (!Number.isInteger(version) || version < 1) fail(`${path}.version`, "version entière ≥ 1 attendue");
  const org = record(o.origine, ["x", "y"], `${path}.origine`);
  const rotation = finite(o.rotation, `${path}.rotation`);
  if (Math.abs(rotation) > 2 * Math.PI) fail(`${path}.rotation`, "rotation dans [−2π ; 2π] attendue (radians)");
  return { version, origine: { x: finite(org.x, `${path}.origine.x`), y: finite(org.y, `${path}.origine.y`) }, rotation };
}

export function validerSystemeProjet(value: unknown, path: string): StudioSystemeProjet {
  const o = record(value, ["versions"], path);
  const brut = array(o.versions, `${path}.versions`);
  if (brut.length < 1 || brut.length > STUDIO_LIMITE_VERSIONS_PROJET) fail(`${path}.versions`, `de 1 à ${STUDIO_LIMITE_VERSIONS_PROJET} versions`);
  const versions = brut.map((v, i) => validerVersionSystemeProjet(v, `${path}.versions[${i}]`));
  versions.forEach((v, i) => { if (v.version !== i + 1) fail(`${path}.versions[${i}].version`, `version ${i + 1} attendue (suite 1, 2, 3… sans trou)`); });
  return { versions };
}

/** Transformation `local-2d → projet` d'une version (la dernière si `version` est absente) ; refus explicites. */
export function studioTransformationProjet(systeme: StudioSystemeProjet | undefined, version?: number): StudioTransformationRepere {
  if (!systeme?.versions.length) fail("systemeProjet", "système de projet non déclaré : aucune conversion vers le projet n’est supposée");
  const v = version === undefined ? systeme.versions[systeme.versions.length - 1]! : systeme.versions.find((x) => x.version === version);
  if (!v) fail("systemeProjet.version", `version ${version} inconnue`);
  return { de: "local-2d", vers: "projet", version: v.version, rotation: v.rotation, echelle: 1, translation: { ...v.origine }, unite: "m" };
}

/** Point du document (`local-2d`) converti dans le système de projet (version en vigueur, ou celle demandée). */
export function studioVersProjet(systeme: StudioSystemeProjet | undefined, p: StudioPoint, version?: number): StudioPointConverti {
  return studioConvertirPoint({ repere: "local-2d", unite: "m", x: p.x, y: p.y }, studioTransformationProjet(systeme, version));
}

/** Point du système de projet converti dans le document (`local-2d`), par la version demandée (en vigueur par défaut). */
export function studioDepuisProjet(systeme: StudioSystemeProjet | undefined, p: StudioPoint, version?: number): StudioPointConverti {
  return studioConvertirPoint({ repere: "projet", unite: "m", x: p.x, y: p.y }, studioInverserTransformation(studioTransformationProjet(systeme, version)));
}

/** Pose d'un objet : transformation `local-objet → local-2d` (version 1) d'une position, d'une rotation et d'une échelle. */
export function studioTransformationPose(position: StudioPoint, rotation: number, echelle: number): StudioTransformationRepere {
  return studioTransformationRepere({ de: "local-objet", vers: "local-2d", version: 1, rotation, echelle, translation: { x: position.x, y: position.y }, unite: "m" });
}
