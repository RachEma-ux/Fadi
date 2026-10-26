import type { StudioPoint3 } from "../exporteurs/maillage.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import { array, discriminator, fail, identifier, layerRef, record } from "../noyau/validation.js";
import { id as idSchema, layerId as layerIdSchema } from "../registre/schemas-base.js";
import { directionUnitaire, profilLocal, studioVecteurSolide, type StudioFaceSolide, type StudioSolid } from "./solides.js";

/**
 * Cote de face 3D (INV-013, lot G2) : annotation **référencée à deux faces planes d'un solide libre** — distance entre
 * deux faces parallèles (base et sommet : hauteur ; deux faces latérales opposées : épaisseur). Sa valeur est
 * **dérivée** de la géométrie courante du solide : elle suit la face quand celle-ci est poussée / tirée, déplacée ou
 * pivotée (même face, même identité topologique).
 *
 * Correspondance des faces quand le solide change (`suivreCotesFaces`, en fin de lot) :
 * - nombre de faces latérales inchangé : chaque face garde son rang (identité topologique : même arête du profil) ;
 * - nombre changé (face divisée, profil source redécoupé) : une face latérale référencée n'est réattachée que si
 *   **exactement une** face du solide modifié porte le même plan et la même arête (preuve par égalité, à la tolérance
 *   numérique `STUDIO_TOLERANCE_FACES`) ; deux faces voisines coplanaires (les deux moitiés d'une face divisée) sont
 *   deux rattachements plausibles : **aucun** n'est choisi par proximité, la cote passe « à résoudre » ;
 * - solide supprimé ou consommé par un booléen : « à résoudre ».
 * Une cote « à résoudre » est conservée telle quelle (solide, faces) ; sa valeur est « non évaluée ». Elle se résout
 * explicitement : la même commande de création, avec le même identifiant, la rattache aux faces choisies. Pur.
 */
export interface StudioCoteFace {
  id: string;
  type: "face-dimension";
  layerId?: string;
  /** Solide libre (`solides`) qui porte les deux faces. */
  solidId: string;
  faces: [StudioFaceSolide, StudioFaceSolide];
  /** Vrai quand une face référencée n'a plus de correspondance prouvée (jamais saisi à la création). */
  toResolve: boolean;
}

/** Tolérance numérique de comparaison des plans (m ; borne de calcul, pas une valeur métier). */
export const STUDIO_TOLERANCE_FACES = 1e-9;

const face = { type: "string", pattern: "^(base|sommet|lateral-(0|[1-9][0-9]{0,4}))$" } as const;
export const SCHEMA_COTE_FACE = {
  type: "object", additionalProperties: false, required: ["id", "type", "solidId", "faces", "toResolve"],
  properties: { id: idSchema, type: { const: "face-dimension" }, layerId: layerIdSchema, solidId: idSchema, faces: { type: "array", minItems: 2, maxItems: 2, items: face }, toResolve: { type: "boolean" } },
} as const;

const FACE = /^(base|sommet|lateral-(0|[1-9][0-9]{0,4}))$/;

export function validerCoteFace(value: unknown, path: string): StudioCoteFace {
  if (discriminator(value, path) !== "face-dimension") fail(`${path}.type`, "cote de face attendue");
  const o = record(value, ["id", "type", "solidId", "faces", "toResolve"], path, ["layerId"]);
  const faces = array(o.faces, `${path}.faces`);
  if (faces.length !== 2) fail(`${path}.faces`, "deux faces attendues");
  for (const [i, f] of faces.entries()) if (typeof f !== "string" || !FACE.test(f)) fail(`${path}.faces[${i}]`, "face « base », « sommet » ou « lateral-i » attendue");
  if (faces[0] === faces[1]) fail(`${path}.faces`, "deux faces distinctes attendues");
  if (typeof o.toResolve !== "boolean") fail(`${path}.toResolve`, "booléen attendu");
  return { id: identifier(o.id, `${path}.id`), type: "face-dimension", ...layerRef(o, path), solidId: identifier(o.solidId, `${path}.solidId`), faces: [faces[0] as StudioFaceSolide, faces[1] as StudioFaceSolide], toResolve: o.toResolve };
}

// ——— Géométrie des faces ———

const sous = (a: StudioPoint3, b: StudioPoint3): StudioPoint3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const plus = (a: StudioPoint3, b: StudioPoint3): StudioPoint3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vect = (a: StudioPoint3, b: StudioPoint3): StudioPoint3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scal = (a: StudioPoint3, b: StudioPoint3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norme = (a: StudioPoint3): number => Math.hypot(a.x, a.y, a.z);

/** Sommets du profil placés dans `local-3d` (basculement compris), et translation de la face d'arrivée. */
function sommets(s: StudioSolid): { bas: StudioPoint3[]; haut: StudioPoint3 } {
  const o = s.placement.origin;
  const bas = profilLocal(s).map((p) => plus(o, studioVecteurSolide(s.placement, { x: p.x, y: p.y, z: 0 })));
  const u = directionUnitaire(s);
  return { bas, haut: studioVecteurSolide(s.placement, { x: u.x * s.height, y: u.y * s.height, z: u.z * s.height }) };
}

const nombreLaterales = (s: StudioSolid): number => (s.type === "box" ? 4 : s.profile.length);

/** La face existe-t-elle sur ce solide ? */
export function studioFaceExiste(s: StudioSolid, f: StudioFaceSolide): boolean {
  if (f === "base" || f === "sommet") return true;
  const m = /^lateral-(\d+)$/.exec(f);
  return !!m && Number(m[1]) < nombreLaterales(s);
}

/** Plan d'une face : un point, la normale unitaire et, pour une face latérale, son arête de base (deux points). */
export interface StudioPlanFace { point: StudioPoint3; normale: StudioPoint3; arete?: [StudioPoint3, StudioPoint3] }

export function studioPlanFace(s: StudioSolid, f: StudioFaceSolide): StudioPlanFace | null {
  if (!studioFaceExiste(s, f)) return null;
  const { bas, haut } = sommets(s);
  if (f === "base" || f === "sommet") {
    // Normale du plan du profil : le profil est plan (z local = 0), sa normale est l'axe z local placé.
    const n = studioVecteurSolide(s.placement, { x: 0, y: 0, z: 1 });
    return { point: f === "base" ? bas[0]! : plus(bas[0]!, haut), normale: n };
  }
  const i = Number(f.slice("lateral-".length)), n = bas.length;
  const a = bas[i]!, b = bas[(i + 1) % n]!;
  const normale = vect(sous(b, a), haut);
  const l = norme(normale);
  if (!(l > 0)) return null;
  return { point: a, normale: { x: normale.x / l, y: normale.y / l, z: normale.z / l }, arete: [a, b] };
}

/** Distance entre les deux faces parallèles de la cote (m) ; null si elle est à résoudre, ou les faces non parallèles. */
export function studioValeurCoteFace(solides: readonly StudioSolid[], c: StudioCoteFace): number | null {
  if (c.toResolve) return null;
  const s = solides.find((x) => x.id === c.solidId);
  if (!s) return null;
  const p = studioPlanFace(s, c.faces[0]), q = studioPlanFace(s, c.faces[1]);
  if (!p || !q || norme(vect(p.normale, q.normale)) > STUDIO_TOLERANCE_FACES) return null;
  return Math.abs(scal(sous(q.point, p.point), p.normale));
}

/** Contrôle d'une cote rattachée (non « à résoudre ») : solide libre présent, deux faces existantes et parallèles. */
export function controlerCoteFace(c: StudioCoteFace, solides: readonly StudioSolid[], path: string): void {
  if (c.toResolve) return;
  const s = solides.find((x) => x.id === c.solidId);
  if (!s) fail(`${path}.solidId`, `solide libre introuvable : ${c.solidId}`);
  for (const [i, f] of c.faces.entries()) if (!studioFaceExiste(s, f)) fail(`${path}.faces[${i}]`, `face ${f} inexistante sur le solide ${s.id}`);
  if (studioValeurCoteFace(solides, c) === null) fail(`${path}.faces`, "faces non parallèles : la distance n’est pas définie");
}

/** Contrôle de la liste d'un document : identifiants propres, bornes. */
export function validerCotesFaces(value: unknown, path: string): StudioCoteFace[] {
  const raw = array(value, path);
  if (raw.length > STUDIO_LIMITS.objects) fail(path, `${STUDIO_LIMITS.objects} cotes de faces au plus`);
  return raw.map((o, i) => validerCoteFace(o, `${path}[${i}]`));
}

// ——— Correspondance après modification du solide (INV-013) ———

const egal = (a: StudioPoint3, b: StudioPoint3) => Math.abs(a.x - b.x) <= STUDIO_TOLERANCE_FACES && Math.abs(a.y - b.y) <= STUDIO_TOLERANCE_FACES && Math.abs(a.z - b.z) <= STUDIO_TOLERANCE_FACES;
const memePlan = (p: StudioPlanFace, q: StudioPlanFace) => norme(vect(p.normale, q.normale)) <= STUDIO_TOLERANCE_FACES && scal(p.normale, q.normale) > 0
  && Math.abs(scal(sous(q.point, p.point), p.normale)) <= STUDIO_TOLERANCE_FACES;

export type StudioCorrespondanceFace = { etat: "conservee"; face: StudioFaceSolide } | { etat: "reattachee"; face: StudioFaceSolide } | { etat: "ambigue"; candidates: StudioFaceSolide[] } | { etat: "perdue" };

/**
 * Face `f` de `avant` dans `apres` (même solide modifié). Base et sommet gardent leur identité ; une face latérale garde
 * son rang si le nombre de faces latérales est inchangé, sinon elle n'est réattachée qu'à l'unique face de même plan et
 * de même arête ; plusieurs faces coplanaires candidates (face divisée) : ambiguë, rien n'est choisi.
 */
export function studioCorrespondanceFace(avant: StudioSolid, apres: StudioSolid, f: StudioFaceSolide): StudioCorrespondanceFace {
  if (f === "base" || f === "sommet") return { etat: "conservee", face: f };
  if (!studioFaceExiste(avant, f)) return { etat: "perdue" };
  if (nombreLaterales(avant) === nombreLaterales(apres)) return { etat: "conservee", face: f };
  const p = studioPlanFace(avant, f);
  if (!p?.arete) return { etat: "perdue" };
  const coplanaires: StudioFaceSolide[] = [];
  for (let k = 0; k < nombreLaterales(apres); k++) {
    const nom = `lateral-${k}` as StudioFaceSolide;
    const q = studioPlanFace(apres, nom);
    if (q && memePlan(p, q)) coplanaires.push(nom);
  }
  if (coplanaires.length > 1) return { etat: "ambigue", candidates: coplanaires };
  const seule = coplanaires[0];
  if (!seule) return { etat: "perdue" };
  const q = studioPlanFace(apres, seule)!;
  return egal(q.arete![0], p.arete[0]) && egal(q.arete![1], p.arete[1]) ? { etat: "reattachee", face: seule } : { etat: "perdue" };
}
