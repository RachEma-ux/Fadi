import { editable, freeId, type Gestionnaire } from "./etat.js";
import { fail, identifier, record } from "../noyau/validation.js";
import { validerEpaisseur, validerSens, validerSurfaceLibre } from "../objets-3d/surfaces-libres.js";
import { validerResultatExact, validerSolideExact, type StudioSolideExactEpaissi, type StudioSolideExactSolidifie } from "../objets-3d/exacts.js";
import { studioOperationPolyedre, validerSurfaceSubdivision } from "../objets-3d/subdivisions.js";

/**
 * Commandes des surfaces libres (X.1-05) :
 *
 * - `studio.surface.nurbs` crée une surface NURBS (pôles, degrés, poids saisis ; aucune valeur par défaut) ;
 * - `studio.surface.modifier` remplace la définition d'une surface existante, même identité (édition des points de
 *   contrôle et des poids, changement de degré ou de grille) ;
 * - `studio.surface.epaissir` engage le résultat du noyau exact (opération `nurbs`) : la surface est **retirée** de
 *   `surfaces` et **conservée intacte** dans le solide exact (R15 : conversion explicite, jamais silencieuse), avec son
 *   épaisseur et son côté. Le réducteur ne calcule rien ; le serveur recalcule l'épaississement depuis la surface de
 *   son document et remplace le résultat par le sien (R9).
 *
 * Surfaces de subdivision (X.1-05) :
 * - `studio.subdivision.creer` crée un maillage de contrôle et son niveau de Loop (saisis, rien par défaut) ;
 * - `studio.surface.modifier` modifie aussi une surface de subdivision (même identité : sommets de contrôle, faces, niveau),
 *   reconnue par son type ;
 * - `studio.subdivision.solidifier` engage le solide polyédrique du noyau (maillage subdivisé cousu) d'un maillage
 *   **fermé** et orienté vers l'extérieur ; la surface est retirée de `subdivisions` et conservée dans le solide exact.
 *   Un maillage ouvert est refusé avec sa raison.
 *
 * La suppression passe par `studio.solide.supprimer` (solides libres, solides exacts, cotes de faces et surfaces).
 * Un calque verrouillé est refusé ; le lot entier est abandonné au premier refus.
 */

export const creerSurface: Gestionnaire = (state, params, path) => {
  const s = validerSurfaceLibre(params, `${path}.params`);
  editable(state, s, path);
  freeId(state, s.id, path);
  state.surfaces.push(s);
  state.ids.add(s.id);
};

function introuvable(ids: ReadonlySet<string>, id: string, path: string): never {
  return fail(path, ids.has(id) ? `ce n’est pas une surface libre : ${id}` : `surface introuvable : ${id}`);
}

export const creerSubdivision: Gestionnaire = (state, params, path) => {
  const s = validerSurfaceSubdivision(params, `${path}.params`);
  editable(state, s, path);
  freeId(state, s.id, path);
  state.subdivisions.push(s);
  state.ids.add(s.id);
};

export const modifierSurface: Gestionnaire = (state, params, path) => {
  if (params && typeof params === "object" && (params as { type?: unknown }).type === "surface-subdivision") {
    const s = validerSurfaceSubdivision(params, `${path}.params`);
    const i = state.subdivisions.findIndex((x) => x.id === s.id);
    if (i < 0) introuvable(state.ids, s.id, `${path}.params.id`);
    editable(state, state.subdivisions[i]!, path);
    editable(state, s, path);
    state.subdivisions[i] = s;
    return;
  }
  const s = validerSurfaceLibre(params, `${path}.params`);
  const i = state.surfaces.findIndex((x) => x.id === s.id);
  if (i < 0) introuvable(state.ids, s.id, `${path}.params.id`);
  editable(state, state.surfaces[i]!, path);
  editable(state, s, path);
  state.surfaces[i] = s;
};

export const epaissirSurface: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "surface", "epaisseur", "sens", "resultat"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  freeId(state, id, `${path}.params.id`);
  const surfaceId = identifier(p.surface, `${path}.params.surface`);
  const epaisseur = validerEpaisseur(p.epaisseur, `${path}.params.epaisseur`), sens = validerSens(p.sens, `${path}.params.sens`);
  const resultat = validerResultatExact(p.resultat, `${path}.params.resultat`);
  const i = state.surfaces.findIndex((x) => x.id === surfaceId);
  if (i < 0) introuvable(state.ids, surfaceId, `${path}.params.surface`);
  const surface = state.surfaces[i]!;
  editable(state, surface, path);
  state.surfaces.splice(i, 1);
  const exact = validerSolideExact({
    id, type: "exact", ...(surface.layerId !== undefined ? { layerId: surface.layerId } : {}), operation: "epaississement", surface, epaisseur, sens, resultat,
  } satisfies StudioSolideExactEpaissi, `${path}.params`);
  state.exacts.push(exact);
  state.ids.add(id);
};

export const solidifierSubdivision: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "subdivision", "resultat"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  freeId(state, id, `${path}.params.id`);
  const sid = identifier(p.subdivision, `${path}.params.subdivision`);
  const resultat = validerResultatExact(p.resultat, `${path}.params.resultat`);
  const i = state.subdivisions.findIndex((x) => x.id === sid);
  if (i < 0) fail(`${path}.params.subdivision`, state.ids.has(sid) ? `ce n’est pas une surface de subdivision : ${sid}` : `surface de subdivision introuvable : ${sid}`);
  const subdivision = state.subdivisions[i]!;
  editable(state, subdivision, path);
  const op = studioOperationPolyedre(subdivision);
  if (typeof op === "string") fail(`${path}.params.subdivision`, op);
  state.subdivisions.splice(i, 1);
  const exact = validerSolideExact({
    id, type: "exact", ...(subdivision.layerId !== undefined ? { layerId: subdivision.layerId } : {}), operation: "solidification", subdivision, resultat,
  } satisfies StudioSolideExactSolidifie, `${path}.params`);
  state.exacts.push(exact);
  state.ids.add(id);
};
