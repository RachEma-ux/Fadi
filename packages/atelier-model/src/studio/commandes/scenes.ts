import type { Etat, Gestionnaire } from "./etat.js";
import { fail, idList, record } from "../noyau/validation.js";
import { validerElementVisualisation, type StudioApparence, type StudioElementVisualisation, type StudioScene } from "../scenes/scenes.js";

/**
 * Commandes de la visualisation (lot E.5) : créer, mettre à jour et supprimer une scène ; définir (créer ou remplacer)
 * et retirer une apparence d'affichage. Elles n'écrivent que la liste `scenes` du document : aucune géométrie, aucun
 * calque, aucun objet n'est touché. Rappeler une scène est une lecture (`studioRappelerScene`), jamais une commande.
 * Le contrôle final (calques et objets connus, une apparence par cible, bornes) est celui du document entier.
 */

function lire<T extends StudioElementVisualisation["type"]>(params: unknown, type: T, path: string): Extract<StudioElementVisualisation, { type: T }> {
  const it = validerElementVisualisation(params, `${path}.params`);
  if (it.type !== type) fail(`${path}.params.type`, "type incompatible avec l’outil");
  return it as Extract<StudioElementVisualisation, { type: T }>;
}

const index = (state: Etat, id: string) => state.scenes.findIndex((s) => s.id === id);
/** Objets qu'une apparence peut habiller : formes, solides libres, murs et ouvertures (ce que la vue 3D rend). */
const objetsRendus = (state: Etat) => new Set([...state.objects.map((o) => o.id), ...state.solides.map((s) => s.id), ...state.architecture.map((a) => a.id), ...state.occurrences.map((o) => o.id)]);

export const creerScene: Gestionnaire = (state, params, path) => {
  const s: StudioScene = lire(params, "scene", path);
  if (index(state, s.id) >= 0) fail(path, "identifiant déjà utilisé");
  state.scenes.push(s);
};

export const modifierScene: Gestionnaire = (state, params, path) => {
  const s: StudioScene = lire(params, "scene", path);
  const i = index(state, s.id);
  if (i < 0 || state.scenes[i]!.type !== "scene") fail(path, `scène introuvable : ${s.id}`);
  state.scenes[i] = s;
};

function supprimerType(type: StudioElementVisualisation["type"], quoi: string): Gestionnaire {
  return (state, params, path) => {
    const p = record(params, ["ids"], `${path}.params`);
    const ids = new Set(idList(p.ids, `${path}.params.ids`));
    for (const id of ids) if (!state.scenes.some((s) => s.id === id && s.type === type)) fail(path, `${quoi} introuvable : ${id}`);
    state.scenes = state.scenes.filter((s) => !ids.has(s.id));
  };
}
export const supprimerScenes = supprimerType("scene", "scène");
export const retirerApparences = supprimerType("appearance", "apparence");

/** Crée l'apparence, ou remplace celle de même identifiant (même rang dans la liste). */
export const definirApparence: Gestionnaire = (state, params, path) => {
  const a: StudioApparence = lire(params, "appearance", path);
  // Cible présente au moment de l'écriture (le retrait des apparences orphelines ne vaut que pour un objet supprimé).
  if (a.target.kind === "object" && !objetsRendus(state).has(a.target.id)) fail(`${path}.params.target`, `objet introuvable : ${a.target.id}`);
  const i = index(state, a.id);
  if (i >= 0 && state.scenes[i]!.type !== "appearance") fail(path, "identifiant déjà utilisé par une scène");
  if (i >= 0) state.scenes[i] = a;
  else state.scenes.push(a);
};

/**
 * Une apparence suit l'objet qu'elle habille : l'objet supprimé (ou retiré par une suppression en cascade), elle
 * disparaît avec lui, comme une ouverture avec son mur. Appliqué à la fin d'un lot, avant le contrôle final.
 */
export function retirerApparencesOrphelines(state: Etat): void {
  if (!state.scenes.some((s) => s.type === "appearance" && s.target.kind === "object")) return;
  const objets = objetsRendus(state);
  state.scenes = state.scenes.filter((s) => s.type !== "appearance" || s.target.kind !== "object" || objets.has(s.target.id));
}
