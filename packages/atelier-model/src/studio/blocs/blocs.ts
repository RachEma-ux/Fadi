import { studioAngleNormal, studioShapeBoundPoints } from "../courbes.js";
import type { DxfWriter } from "../exporteurs/dxf.js";
import { nb, xml } from "../exporteurs/texte.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import type { StudioPoint } from "../noyau/types.js";
import { angle, array, boolean, fail, finite, identifier, layerRef, point, record } from "../noyau/validation.js";
import type { StudioShape } from "../objets/formes.js";
import { typeObjet, validerForme } from "../objets/index.js";
import { id, layerId, point as pointSchema, positive, angle as angleSchema } from "../registre/schemas-base.js";
import { SCHEMA_ARC } from "../objets/arc.js";
import { SCHEMA_CERCLE } from "../objets/cercle.js";
import { SCHEMA_LIGNE } from "../objets/ligne.js";
import { SCHEMA_POLYLIGNE } from "../objets/polyligne.js";
import { SCHEMA_RECTANGLE } from "../objets/rectangle.js";
import { studioEchelle, studioRotation, studioSymetrie, studioTransformerForme, studioTranslation, type StudioTransformation } from "../transformations.js";

/**
 * Blocs définis par l'utilisateur (X.1-01, REF-02 §18.2 « blocs ») : une **définition** réutilisable — nom, point de
 * base, éléments (formes 2D de Studio : ligne, rectangle, cercle, arc, polyligne) dans le repère propre du bloc — et
 * ses **insertions**, chacune posée par une position, une rotation, une échelle uniforme et une symétrie facultative.
 * Extensions additives et facultatives du document (`StudioDocument.blocs`, `StudioDocument.insertions`) : un document
 * antérieur reste valide et relu à l'identique ; absentes ou vides, aucun bloc (forme canonique).
 *
 * - La géométrie d'une insertion n'est **jamais stockée** : elle est dérivée de sa définition à chaque lecture
 *   (`studioFormesInsertion`). Modifier la définition (`studio.bloc.definir` avec `redefinir`) se répercute donc sur
 *   toutes ses insertions, sans recopie ni oubli possible.
 * - Transformation d'une insertion, repère du bloc → `local-2d` (mètres) : p ↦ position + R(rotation) · échelle ·
 *   S · (p − base), S = symétrie d'axe vertical du bloc (x ↦ −x) quand `symetrie` est vraie. C'est la convention de
 *   l'entité DXF INSERT (facteur x négatif pour la symétrie), ce qui rend l'échange exact.
 * - Un élément de bloc n'a ni calque ni extrusion : il prend le calque de son insertion (comme les éléments du calque
 *   « 0 » d'un bloc DXF) ; un objet extrudé n'entre pas dans un bloc (refus, jamais une extrusion perdue en silence).
 * - Éclater une insertion (`studio.bloc.eclater`) remplace l'insertion par ses formes, devenues des objets du document
 *   (identifiants `insertion.élément`) ; un rectangle tourné d'un angle quelconque y devient une polyligne fermée,
 *   comme pour la commande Rotation (`transformations.ts`).
 * Pur : ni React, ni DOM.
 */

/** Bornes techniques (pas des valeurs métier). */
export const STUDIO_LIMITES_BLOCS = Object.freeze({ definitions: 1000, elements: 2000, insertions: STUDIO_LIMITS.objects, nom: 128, echelle: 1e6 } as const);

export interface StudioDefinitionBloc {
  id: string;
  type: "bloc";
  /** Nom saisi, unique dans le document (sans casse ni espaces de bord). */
  nom: string;
  /** Point de base, dans le repère du bloc : il vient se poser sur la position de chaque insertion. */
  base: StudioPoint;
  /** Formes du bloc, dans son repère, sans calque ni extrusion ; identifiants uniques dans la définition. */
  elements: StudioShape[];
}

export interface StudioInsertionBloc {
  id: string;
  type: "insertion";
  /** Identifiant de la définition insérée. */
  bloc: string;
  layerId?: string;
  position: StudioPoint;
  /** Radians, dans [0 ; 2π[, sens trigonométrique. */
  rotation: number;
  /** Facteur uniforme strictement positif, sans unité. */
  echelle: number;
  /** Symétrie d'axe vertical du bloc avant la rotation ; absente : aucune (forme canonique). */
  symetrie?: true;
}

// ——— Validation ———

export function validerDefinitionBloc(value: unknown, path: string): StudioDefinitionBloc {
  const o = record(value, ["id", "type", "nom", "base", "elements"], path);
  if (o.type !== "bloc") fail(`${path}.type`, "type « bloc » attendu");
  const nom = typeof o.nom === "string" ? o.nom.trim() : "";
  if (!nom || nom !== o.nom || nom.includes("\0")) fail(`${path}.nom`, "nom non vide attendu, sans espace de bord");
  if (nom.length > STUDIO_LIMITES_BLOCS.nom) fail(`${path}.nom`, `nom de ${STUDIO_LIMITES_BLOCS.nom} caractères au plus`);
  const brut = array(o.elements, `${path}.elements`);
  if (brut.length === 0) fail(`${path}.elements`, "un bloc a au moins un élément");
  if (brut.length > STUDIO_LIMITES_BLOCS.elements) fail(`${path}.elements`, `${STUDIO_LIMITES_BLOCS.elements} éléments au plus`);
  const ids = new Set<string>();
  const elements = brut.map((e, i) => {
    const forme = validerForme(e, `${path}.elements[${i}]`);
    if (forme.layerId !== undefined) fail(`${path}.elements[${i}].layerId`, "un élément de bloc n’a pas de calque : il prend celui de son insertion");
    if (forme.extrusion !== undefined) fail(`${path}.elements[${i}].extrusion`, "un élément de bloc n’est pas extrudé");
    if (ids.has(forme.id)) fail(`${path}.elements`, `identifiant d’élément répété : ${forme.id}`);
    ids.add(forme.id);
    return forme;
  });
  return { id: identifier(o.id, `${path}.id`), type: "bloc", nom, base: point(o.base, `${path}.base`), elements };
}

export function validerInsertionBloc(value: unknown, path: string): StudioInsertionBloc {
  const o = record(value, ["id", "type", "bloc", "position", "rotation", "echelle"], path, ["layerId", "symetrie"]);
  if (o.type !== "insertion") fail(`${path}.type`, "type « insertion » attendu");
  const echelle = finite(o.echelle, `${path}.echelle`);
  if (!(echelle > 0)) fail(`${path}.echelle`, "échelle strictement positive attendue");
  if (echelle > STUDIO_LIMITES_BLOCS.echelle) fail(`${path}.echelle`, `échelle de ${STUDIO_LIMITES_BLOCS.echelle} au plus`);
  const symetrie = Object.hasOwn(o, "symetrie") && boolean(o.symetrie, `${path}.symetrie`);
  return {
    id: identifier(o.id, `${path}.id`), type: "insertion", bloc: identifier(o.bloc, `${path}.bloc`), ...layerRef(o, path),
    position: point(o.position, `${path}.position`), rotation: angle(o.rotation, `${path}.rotation`), echelle, ...(symetrie ? { symetrie: true as const } : {}),
  };
}

/** Clé de comparaison d'un nom de bloc (unicité sans casse). */
export const studioCleNomBloc = (nom: string): string => nom.trim().toLocaleLowerCase("fr-FR");

/**
 * Contrôle d'ensemble des blocs d'un document : noms uniques, chaque insertion vise une définition existante. Les
 * identifiants (définitions et insertions) sont contrôlés uniques dans tout le document par l'appelant.
 */
export function controlerBlocs(blocs: readonly StudioDefinitionBloc[], insertions: readonly StudioInsertionBloc[], path: string): void {
  if (blocs.length > STUDIO_LIMITES_BLOCS.definitions) fail(`${path}.blocs`, `${STUDIO_LIMITES_BLOCS.definitions} définitions de bloc au plus`);
  if (insertions.length > STUDIO_LIMITES_BLOCS.insertions) fail(`${path}.insertions`, `${STUDIO_LIMITES_BLOCS.insertions} insertions au plus`);
  const noms = new Set<string>(), ids = new Set<string>();
  for (const b of blocs) {
    const cle = studioCleNomBloc(b.nom);
    if (noms.has(cle)) fail(`${path}.blocs`, `nom de bloc répété : ${b.nom}`);
    noms.add(cle);
    ids.add(b.id);
  }
  for (const i of insertions) if (!ids.has(i.bloc)) fail(`${path}.insertions`, `définition de bloc introuvable : ${i.bloc} (insertion ${i.id})`);
}

// ——— Géométrie ———

/** Composée de transformations planes, appliquées dans l'ordre donné. */
export function studioComposerTransformationsPlanes(ts: readonly StudioTransformation[]): StudioTransformation {
  return {
    point: (p) => ts.reduce((q, t) => t.point(q), p),
    angle: (a) => ts.reduce((b, t) => t.angle(b), a),
    miroir: ts.reduce((m, t) => m !== t.miroir, false),
    facteur: ts.reduce((f, t) => f * t.facteur, 1),
    gardeAxes: ts.every((t) => t.gardeAxes),
    echangeAxes: ts.reduce((e, t) => e !== t.echangeAxes, false),
    volumes: false,
  };
}

const ORIGINE: StudioPoint = { x: 0, y: 0 };

/** Transformation du repère du bloc vers `local-2d` pour une insertion (voir l'en-tête). */
export function studioTransformationInsertion(base: StudioPoint, pose: Pick<StudioInsertionBloc, "position" | "rotation" | "echelle" | "symetrie">): StudioTransformation {
  const ts: StudioTransformation[] = [studioTranslation(-base.x, -base.y)];
  if (pose.symetrie) ts.push(studioSymetrie(ORIGINE, { x: 0, y: 1 }));
  if (pose.echelle !== 1) ts.push(studioEchelle(ORIGINE, pose.echelle, false));
  if (pose.rotation !== 0) ts.push(studioRotation(ORIGINE, pose.rotation));
  ts.push(studioTranslation(pose.position.x, pose.position.y));
  return studioComposerTransformationsPlanes(ts);
}

/** Identifiant de la forme d'un élément d'une insertion (rendu, éclatement). */
export const studioIdElementInsertion = (insertion: string, element: string): string => `${insertion}.${element}`;

/**
 * Formes d'une insertion dans le document : chaque élément de sa définition transformé par sa pose, sur le calque de
 * l'insertion, identifiant `insertion.élément`. Non revalidées (l'éclatement les valide).
 */
export function studioFormesInsertion(def: Pick<StudioDefinitionBloc, "base" | "elements">, ins: StudioInsertionBloc): StudioShape[] {
  const t = studioTransformationInsertion(def.base, ins);
  const calque = ins.layerId === undefined ? {} : { layerId: ins.layerId };
  return def.elements.map((e) => ({ ...studioTransformerForme(e, t, studioIdElementInsertion(ins.id, e.id)), ...calque }) as StudioShape);
}

/**
 * Pose d'une insertion transformée par une similitude `t` (Déplacer, Rotation, Symétrie, Échelle, Copier) : la
 * nouvelle pose donne exactement t ∘ (ancienne pose). Une symétrie bascule `symetrie` et ajoute π à la rotation
 * (S_φ · R(θ) · S = R(2φ + π − θ)) ; l'échelle se multiplie par le facteur.
 */
export function studioPoseTransformee(ins: StudioInsertionBloc, t: StudioTransformation, id: string = ins.id): StudioInsertionBloc {
  const echelle = ins.echelle * t.facteur;
  const symetrie = !!ins.symetrie !== t.miroir;
  const rotation = studioAngleNormal(t.angle(ins.rotation) + (t.miroir ? Math.PI : 0));
  const { symetrie: _s, ...reste } = ins;
  return { ...reste, id, position: t.point(ins.position), rotation: Object.is(rotation, -0) ? 0 : rotation, echelle, ...(symetrie ? { symetrie: true as const } : {}) };
}

/** Points qui bornent une insertion (export, cadrage, emprise de sélection). */
export function studioPointsInsertion(def: Pick<StudioDefinitionBloc, "base" | "elements">, ins: StudioInsertionBloc): StudioPoint[] {
  return studioFormesInsertion(def, ins).flatMap(studioShapeBoundPoints);
}

/** Nombre d'insertions de chaque définition (affichage, refus de suppression). */
export function studioInsertionsParBloc(insertions: readonly StudioInsertionBloc[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of insertions) m.set(i.bloc, (m.get(i.bloc) ?? 0) + 1);
  return m;
}

// ——— Écritures ———

/** Groupe SVG d'une insertion : `data-insertion`, `data-bloc`, et les formes de sa définition posées. */
export function insertionSvg(def: StudioDefinitionBloc, ins: StudioInsertionBloc): string[] {
  return [`<g data-insertion="${xml(ins.id)}" data-bloc="${xml(def.id)}" data-bloc-nom="${xml(def.nom)}">`, ...studioFormesInsertion(def, ins).map((o) => typeObjet(o).svg(o)), "</g>"];
}

const DXF_NOM_BLOC_MAX = 31;

/** Nom DXF R12 d'un bloc : A–Z, 0–9, `_`, `$`, `-`, 31 caractères au plus, diacritiques retirés ; jamais « * » en tête. */
function dxfNomBlocBase(nom: string): string {
  const ascii = nom.normalize("NFD").replace(/\p{M}+/gu, "").toUpperCase().replace(/[^A-Z0-9_$-]+/g, "_").replace(/^_+|_+$/g, "");
  const base = ascii.slice(0, DXF_NOM_BLOC_MAX);
  return base === "" ? "BLOC" : base;
}

/** Noms DXF des définitions (identifiant → nom), uniques dans l'ordre du document (suffixes `_2`, `_3`…). */
export function studioNomsDxfBlocs(blocs: readonly StudioDefinitionBloc[]): Map<string, string> {
  const out = new Map<string, string>(), pris = new Set<string>();
  for (const b of blocs) {
    const base = dxfNomBlocBase(b.nom);
    let nom = base;
    for (let n = 2; pris.has(nom); n++) {
      const suffixe = `_${n}`;
      nom = base.slice(0, DXF_NOM_BLOC_MAX - suffixe.length) + suffixe;
    }
    pris.add(nom);
    out.set(b.id, nom);
  }
  return out;
}

/** Section BLOCKS (R12) : un BLOCK par définition, ses éléments sur le calque « 0 » (ils prennent le calque de l'INSERT). */
export function blocsDxf(blocs: readonly StudioDefinitionBloc[], noms: ReadonlyMap<string, string>, w: DxfWriter): void {
  w.pair(0, "SECTION");
  w.pair(2, "BLOCKS");
  for (const b of blocs) {
    const nom = noms.get(b.id)!;
    w.pair(0, "BLOCK");
    w.pair(8, "0");
    w.pair(2, nom);
    w.pair(70, 0);
    w.point(10, b.base);
    w.pair(3, nom);
    for (const e of b.elements) typeObjet(e).dxf(e, "0", w);
    w.pair(0, "ENDBLK");
    w.pair(8, "0");
  }
  w.pair(0, "ENDSEC");
}

/** Entité INSERT d'une insertion : facteur x négatif pour la symétrie, rotation en degrés (code 50). */
export function insertionDxf(ins: StudioInsertionBloc, nom: string, layer: string, w: DxfWriter): void {
  w.pair(0, "INSERT");
  w.pair(8, layer);
  w.pair(2, nom);
  w.point(10, ins.position);
  w.pair(41, ins.symetrie ? -ins.echelle : ins.echelle);
  w.pair(42, ins.echelle);
  w.pair(43, ins.echelle);
  w.pair(50, Number(nb((ins.rotation * 180) / Math.PI)));
}

// ——— Schémas ———

const element = { oneOf: [SCHEMA_LIGNE, SCHEMA_RECTANGLE, SCHEMA_CERCLE, SCHEMA_ARC, SCHEMA_POLYLIGNE] } as const;
export const SCHEMA_DEFINITION_BLOC = {
  type: "object", additionalProperties: false, required: ["id", "type", "nom", "base", "elements"],
  properties: { id, type: { const: "bloc" }, nom: { type: "string", minLength: 1, maxLength: STUDIO_LIMITES_BLOCS.nom }, base: pointSchema, elements: { type: "array", minItems: 1, maxItems: STUDIO_LIMITES_BLOCS.elements, items: element } },
} as const;
export const SCHEMA_INSERTION_BLOC = {
  type: "object", additionalProperties: false, required: ["id", "type", "bloc", "position", "rotation", "echelle"],
  properties: { id, type: { const: "insertion" }, bloc: id, layerId, position: pointSchema, rotation: angleSchema, echelle: { ...positive, maximum: STUDIO_LIMITES_BLOCS.echelle }, symetrie: { type: "boolean" } },
} as const;
