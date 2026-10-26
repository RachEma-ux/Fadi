import {
  STUDIO_LIMITES_BLOCS, studioCleNomBloc, studioFormesInsertion, studioPoseTransformee, validerDefinitionBloc, validerInsertionBloc,
  type StudioDefinitionBloc, type StudioInsertionBloc,
} from "../blocs/blocs.js";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS } from "../noyau/limites.js";
import { boolean, fail, finite, identifier, idList, point, record, same } from "../noyau/validation.js";
import type { StudioShape } from "../objets/formes.js";
import { validerForme } from "../objets/index.js";
import { studioEchelle, studioRotation, studioSymetrie, studioTranslation, type StudioTransformation } from "../transformations.js";
import { calqueEtat, editable, freeId, type Etat, type Gestionnaire } from "./etat.js";
import { studioIdCopie, STUDIO_COPIES_MAX, supprimer } from "./modification.js";

/**
 * Commandes des blocs définis par l'utilisateur (X.1-01, `blocs/blocs.ts`) :
 * - `studio.bloc.definir` : définit un bloc — éléments saisis (`elements`) ou formes du dessin (`objets`, copiées dans
 *   le repère du bloc, mêmes coordonnées) ; avec `insertion`, les formes d'origine sont remplacées par une insertion du
 *   bloc à son point de base (même dessin, même calque). Avec `redefinir: true`, la définition existante de même
 *   identifiant est remplacée : **toutes ses insertions suivent** (leur géométrie est dérivée de la définition) ;
 * - `studio.bloc.inserer` : pose une insertion (position, rotation, échelle, symétrie), ou, avec `modifier: true`,
 *   change la pose (ou le bloc) d'une insertion existante ;
 * - `studio.bloc.eclater` : remplace des insertions par leurs formes, objets du document (`insertion.élément`).
 * Les commandes générales (Déplacer, Copier, Rotation, Symétrie, Échelle, Placer sur le calque, Supprimer) agissent
 * aussi sur les insertions (`avecBlocs`, `deplacerAvecBlocs`) ; Supprimer retire aussi une définition qui n'est plus
 * insérée (refus sinon : jamais une insertion orpheline ni un retrait en cascade implicite).
 */

const indexInsertion = (state: Etat, id: string) => state.insertions.findIndex((i) => i.id === id);

function nomLibre(state: Etat, nom: string, sauf: string | undefined, path: string): void {
  const cle = studioCleNomBloc(nom);
  const autre = state.blocs.find((b) => b.id !== sauf && studioCleNomBloc(b.nom) === cle);
  if (autre) fail(`${path}.params.nom`, `nom de bloc déjà employé : ${autre.nom}`);
}

/** Formes du dessin copiées comme éléments : formes seulement, non extrudées, sur un même calque (rendu). */
function elementsDepuisObjets(state: Etat, ids: readonly string[], path: string): { elements: StudioShape[]; layerId?: string } {
  const formes = new Map(state.objects.map((o) => [o.id, o]));
  let calque: string | undefined | null = null;
  const elements = ids.map((id) => {
    const o = formes.get(id);
    if (!o) fail(`${path}.params.objets`, state.ids.has(id) ? `seules les formes (ligne, rectangle, cercle, arc, polyligne) entrent dans un bloc : ${id}` : `objet introuvable : ${id}`);
    if (o.extrusion) fail(`${path}.params.objets`, `un objet extrudé n’entre pas dans un bloc : ${id}`);
    if (calque !== null && calque !== o.layerId) fail(`${path}.params.objets`, "les objets d’un bloc sont sur un même calque (celui de son insertion)");
    calque = o.layerId;
    const { layerId: _c, ...sans } = o;
    return sans as StudioShape;
  });
  return { elements, ...(calque ? { layerId: calque } : {}) };
}

export const definirBloc: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "nom", "base"], `${path}.params`, ["elements", "objets", "insertion", "redefinir"]);
  if (Object.hasOwn(p, "elements") === Object.hasOwn(p, "objets")) fail(`${path}.params`, "éléments saisis (elements) ou formes du dessin (objets) attendus, l’un ou l’autre");
  const redefinir = Object.hasOwn(p, "redefinir") && boolean(p.redefinir, `${path}.params.redefinir`);
  const id = identifier(p.id, `${path}.params.id`);
  const objets = Object.hasOwn(p, "objets") ? idList(p.objets, `${path}.params.objets`) : null;
  if (objets && objets.length > STUDIO_LIMITES_BLOCS.elements) fail(`${path}.params.objets`, `${STUDIO_LIMITES_BLOCS.elements} éléments au plus`);
  const depuis = objets ? elementsDepuisObjets(state, objets, path) : null;
  const def: StudioDefinitionBloc = validerDefinitionBloc({ id, type: "bloc", nom: p.nom, base: p.base, elements: depuis ? depuis.elements : p.elements }, `${path}.params`);
  const index = state.blocs.findIndex((b) => b.id === id);
  if (redefinir) {
    if (index < 0) fail(`${path}.params.id`, `définition de bloc introuvable : ${id}`);
    // Une redéfinition change le dessin de chaque insertion : aucune ne doit être sur un calque verrouillé.
    for (const ins of state.insertions) if (ins.bloc === id) editable(state, ins, `${path} (insertion ${ins.id})`);
    nomLibre(state, def.nom, id, path);
    state.blocs[index] = def;
  } else {
    freeId(state, id, path);
    nomLibre(state, def.nom, undefined, path);
    if (state.blocs.length + 1 > STUDIO_LIMITES_BLOCS.definitions) fail(path, `${STUDIO_LIMITES_BLOCS.definitions} définitions de bloc au plus`);
    state.blocs.push(def);
    state.ids.add(id);
  }
  if (!Object.hasOwn(p, "insertion")) return;
  // Remplacement des formes d'origine par une insertion au point de base : le dessin reste identique.
  if (!objets || !depuis) fail(`${path}.params.insertion`, "une insertion de remplacement suppose des formes du dessin (objets)");
  const insertionId = identifier(p.insertion, `${path}.params.insertion`);
  for (const o of objets) editable(state, state.objects.find((x) => x.id === o)!, path);
  supprimer(state, { ids: [...objets] }, path);
  poserInsertion(state, validerInsertionBloc({ id: insertionId, type: "insertion", bloc: id, ...(depuis.layerId ? { layerId: depuis.layerId } : {}), position: def.base, rotation: 0, echelle: 1 }, `${path}.params`), path);
};

function poserInsertion(state: Etat, ins: StudioInsertionBloc, path: string): void {
  if (!state.blocs.some((b) => b.id === ins.bloc)) fail(`${path}.params.bloc`, `définition de bloc introuvable : ${ins.bloc}`);
  editable(state, ins, path);
  freeId(state, ins.id, path);
  if (state.insertions.length + 1 > STUDIO_LIMITES_BLOCS.insertions) fail(path, `${STUDIO_LIMITES_BLOCS.insertions} insertions au plus`);
  state.insertions.push(ins);
  state.ids.add(ins.id);
}

export const insererBloc: Gestionnaire = (state, params, path) => {
  const brut = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : null;
  const modifier = !!brut && Object.hasOwn(brut, "modifier");
  const { modifier: m, ...reste } = (brut ?? {}) as Record<string, unknown>;
  if (modifier && !boolean(m, `${path}.params.modifier`)) fail(`${path}.params.modifier`, "absent ou vrai");
  const ins = validerInsertionBloc(brut ? reste : params, `${path}.params`);
  if (!modifier) return poserInsertion(state, ins, path);
  const i = indexInsertion(state, ins.id);
  if (i < 0) fail(`${path}.params.id`, state.ids.has(ins.id) ? `ce n’est pas une insertion : ${ins.id}` : `insertion introuvable : ${ins.id}`);
  if (!state.blocs.some((b) => b.id === ins.bloc)) fail(`${path}.params.bloc`, `définition de bloc introuvable : ${ins.bloc}`);
  if (state.insertions[i]!.layerId !== ins.layerId) fail(path, "le calque se change par studio.objet.calque");
  editable(state, ins, path);
  state.insertions[i] = ins;
};

/** Éclatement : chaque insertion devient les formes de sa définition posées, objets du document. */
export const eclaterBloc: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = idList(p.ids, `${path}.params.ids`);
  const defs = new Map(state.blocs.map((b) => [b.id, b]));
  const ajout: StudioShape[] = [];
  for (const id of ids) {
    const i = indexInsertion(state, id);
    if (i < 0) fail(path, state.ids.has(id) ? `ce n’est pas une insertion : ${id}` : `insertion introuvable : ${id}`);
    const ins = state.insertions[i]!;
    editable(state, ins, path);
    for (const o of studioFormesInsertion(defs.get(ins.bloc)!, ins)) {
      identifier(o.id, `${path} (élément ${o.id})`);
      freeId(state, o.id, path);
      ajout.push(validerForme(o, `${path} (élément ${o.id})`));
      state.ids.add(o.id);
    }
  }
  if (state.objects.length + ajout.length > STUDIO_LIMITS.objects) fail(path, `${STUDIO_LIMITS.objects} objets au plus`);
  const retires = new Set(ids);
  state.insertions = state.insertions.filter((x) => !retires.has(x.id));
  for (const id of ids) state.ids.delete(id);
  state.objects.push(...ajout);
};

// ——— Commandes générales sur les insertions ———

type PartBlocs = (state: Etat, ids: readonly string[], p: Record<string, unknown>, path: string, autres: number) => void;

function transformerInsertions(state: Etat, ids: readonly string[], t: StudioTransformation, path: string): void {
  const choisis = new Set(ids);
  state.insertions = state.insertions.map((ins) => {
    if (!choisis.has(ins.id)) return ins;
    editable(state, ins, path);
    return validerInsertionBloc(studioPoseTransformee(ins, t), path);
  });
}

function copierInsertions(state: Etat, ids: readonly string[], ts: readonly StudioTransformation[], prefixe: string, autres: number, path: string): void {
  const index = new Map(state.insertions.map((i) => [i.id, i]));
  if (state.insertions.length + ts.length * ids.length > STUDIO_LIMITES_BLOCS.insertions) fail(`${path}.params.copies`, `${STUDIO_LIMITES_BLOCS.insertions} insertions au plus, copies comprises`);
  ts.forEach((t, k) => ids.forEach((id, j) => {
    const nouvel = identifier(studioIdCopie(prefixe, k + 1, autres + j), `${path}.params.prefix`);
    freeId(state, nouvel, path);
    state.insertions.push(validerInsertionBloc(studioPoseTransformee(index.get(id)!, t, nouvel), path));
    state.ids.add(nouvel);
  }));
}

const PARTS: Record<"supprimer" | "copier" | "rotation" | "symetrie" | "echelle" | "calque", PartBlocs> = {
  supprimer: (state, ids, _p, path) => {
    const choisis = new Set(ids);
    for (const ins of state.insertions) if (choisis.has(ins.id)) editable(state, ins, path);
    state.insertions = state.insertions.filter((x) => !choisis.has(x.id));
    // Une définition se retire seulement quand plus aucune insertion ne la vise (celles retirées ici comprises).
    for (const b of state.blocs) {
      if (!choisis.has(b.id)) continue;
      const restante = state.insertions.find((x) => x.bloc === b.id);
      if (restante) fail(path, `le bloc ${b.nom} est encore inséré (${restante.id}) : retirez ou éclatez d’abord ses insertions`);
    }
    state.blocs = state.blocs.filter((b) => !choisis.has(b.id));
    state.contraintes = state.contraintes.filter((c) => !choisis.has(c.id));
    for (const id of ids) state.ids.delete(id);
  },
  copier: (state, ids, p, path, autres) => {
    const dx = finite(p.dx, `${path}.params.dx`), dy = finite(p.dy, `${path}.params.dy`);
    if (dx === 0 && dy === 0) fail(`${path}.params`, "déplacement non nul attendu");
    const n = finite(p.copies, `${path}.params.copies`);
    if (!Number.isInteger(n) || n < 1 || n > STUDIO_COPIES_MAX) fail(`${path}.params.copies`, `nombre entier de copies de 1 à ${STUDIO_COPIES_MAX} attendu`);
    copierInsertions(state, ids, Array.from({ length: n }, (_, k) => studioTranslation((k + 1) * dx, (k + 1) * dy)), identifier(p.prefix, `${path}.params.prefix`), autres, path);
  },
  rotation: (state, ids, p, path) => {
    const angle = finite(p.angle, `${path}.params.angle`);
    if (angle === 0) fail(`${path}.params.angle`, "angle non nul attendu");
    transformerInsertions(state, ids, studioRotation(point(p.center, `${path}.params.center`), angle), path);
  },
  symetrie: (state, ids, p, path, autres) => {
    const a = point(p.axisStart, `${path}.params.axisStart`), b = point(p.axisEnd, `${path}.params.axisEnd`);
    if (same(a, b)) fail(`${path}.params`, "axe de symétrie de deux points distincts attendu");
    const t = studioSymetrie(a, b);
    if (boolean(p.keepSource, `${path}.params.keepSource`)) {
      if (!Object.hasOwn(p, "prefix")) fail(`${path}.params.prefix`, "préfixe de copie attendu quand la source est conservée");
      copierInsertions(state, ids, [t], identifier(p.prefix, `${path}.params.prefix`), autres, path);
      return;
    }
    transformerInsertions(state, ids, t, path);
  },
  echelle: (state, ids, p, path) => {
    const k = finite(p.factor, `${path}.params.factor`);
    if (k <= 0) fail(`${path}.params.factor`, "facteur strictement positif attendu");
    boolean(p.includeVolumes, `${path}.params.includeVolumes`);
    transformerInsertions(state, ids, studioEchelle(point(p.center, `${path}.params.center`), k, false), path);
  },
  calque: (state, ids, p, path) => {
    const layerId = identifier(p.layerId, `${path}.params.layerId`);
    const cible = layerId === STUDIO_DEFAULT_LAYER_ID ? undefined : layerId;
    if (calqueEtat(state, cible, path).locked) fail(path, "calque cible verrouillé");
    const choisis = new Set(ids);
    state.insertions = state.insertions.map((ins) => {
      if (!choisis.has(ins.id)) return ins;
      editable(state, ins, path);
      const { layerId: _a, ...reste } = ins;
      return cible === undefined ? reste : { ...reste, layerId: cible };
    });
  },
};

/**
 * Part des blocs d'une commande générale à sélection (`ids`) : insertions (et, pour Supprimer, définitions et
 * contraintes) traitées ici, le reste par le gestionnaire d'origine (inchangé quand la sélection n'en contient aucun).
 * Les copies d'insertions prennent les indices qui suivent ceux des autres éléments : aucune collision.
 */
export function avecBlocs(base: Gestionnaire, part: keyof typeof PARTS): Gestionnaire {
  return (state, params, path) => {
    if (!state.insertions.length && (part !== "supprimer" || (!state.blocs.length && !state.contraintes.length))) return base(state, params, path);
    const brut = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : null;
    const ids = brut && Array.isArray(brut.ids) ? brut.ids : null;
    const propres = new Set([...state.insertions.map((x) => x.id), ...(part === "supprimer" ? [...state.blocs.map((b) => b.id), ...state.contraintes.map((c) => c.id)] : [])]);
    if (!ids || !ids.some((id) => typeof id === "string" && propres.has(id))) return base(state, params, path);
    const liste = idList(ids, `${path}.params.ids`);
    const autres = liste.filter((id) => !propres.has(id)), siens = liste.filter((id) => propres.has(id));
    if (autres.length) base(state, { ...brut, ids: autres }, path);
    else record(params, Object.keys(brut!), `${path}.params`);
    PARTS[part](state, siens, brut!, path, autres.length);
  };
}

/** Déplacer (un identifiant) : une insertion se translate (position seulement). */
export function deplacerAvecBlocs(base: Gestionnaire): Gestionnaire {
  return (state, params, path) => {
    if (!state.insertions.length) return base(state, params, path);
    const brut = params && typeof params === "object" ? (params as Record<string, unknown>) : null;
    const i = brut && typeof brut.id === "string" ? indexInsertion(state, brut.id) : -1;
    if (i < 0) return base(state, params, path);
    const p = record(params, ["id", "dx", "dy"], `${path}.params`);
    const t = studioTranslation(finite(p.dx, `${path}.params.dx`), finite(p.dy, `${path}.params.dy`));
    transformerInsertions(state, [state.insertions[i]!.id], t, path);
  };
}
