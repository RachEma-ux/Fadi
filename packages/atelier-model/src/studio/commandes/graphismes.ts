import { editable, freeId, type Etat, type Gestionnaire } from "./etat.js";
import { fail, idList, record } from "../noyau/validation.js";
import { STUDIO_LIMITES_GRAPHISMES, validerGraphisme } from "../graphismes/graphismes.js";
import { STUDIO_LIMITE_VERSIONS_PROJET, validerVersionSystemeProjet } from "../reperes.js";
import { STUDIO_LIMITES_SOURCES, validerSource } from "../sources/sources.js";

/**
 * Commandes des graphismes (EX-055) et du système de projet (EX-023).
 *
 * - `studio.graphisme.creer` : ajoute une spline, une hachure ou un symbole (identifiant libre, calque modifiable) ;
 * - `studio.graphisme.retirer` : retire des graphismes nommés (calque modifiable) ; aucune autre commande ne les
 *   touche (ni déplacement, ni copie, ni extrusion : un graphisme se recrée) ;
 * - `studio.repere.projet` : ajoute la version suivante du système de projet. La version est **saisie** et doit être
 *   exactement la suivante (1 pour la première) : deux définitions concurrentes ne s'écrasent jamais en silence, et
 *   aucune version passée n'est réécrite.
 */

export const creerGraphisme: Gestionnaire = (state, params, path) => {
  const g = validerGraphisme(params, `${path}.params`);
  editable(state, g, path);
  freeId(state, g.id, path);
  if (state.graphismes.length + 1 > STUDIO_LIMITES_GRAPHISMES.graphismes) fail(path, `${STUDIO_LIMITES_GRAPHISMES.graphismes} graphismes au plus`);
  state.graphismes.push(g);
  state.ids.add(g.id);
};

function introuvable(state: Etat, id: string, path: string): never {
  return fail(path, state.ids.has(id) ? `ce n’est pas un graphisme : ${id}` : `graphisme introuvable : ${id}`);
}

export const retirerGraphismes: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = new Set(idList(p.ids, `${path}.params.ids`));
  const index = new Map(state.graphismes.map((g) => [g.id, g]));
  for (const id of ids) {
    const g = index.get(id);
    if (!g) introuvable(state, id, path);
    editable(state, g, path);
  }
  state.graphismes = state.graphismes.filter((g) => !ids.has(g.id));
  for (const id of ids) state.ids.delete(id);
};

export const definirSystemeProjet: Gestionnaire = (state, params, path) => {
  const v = validerVersionSystemeProjet(params, `${path}.params`);
  const versions = state.systemeProjet?.versions ?? [];
  const attendue = versions.length + 1;
  if (v.version !== attendue) fail(`${path}.params.version`, `version ${attendue} attendue (la suivante) : une version existante n’est jamais réécrite`);
  if (attendue > STUDIO_LIMITE_VERSIONS_PROJET) fail(path, `${STUDIO_LIMITE_VERSIONS_PROJET} versions au plus`);
  state.systemeProjet = { versions: [...versions, v] };
};

/** `studio.source.declarer` (EX-014) : ajoute la provenance d'un fichier importé ; identifiant libre dans la liste. */
export const declarerSource: Gestionnaire = (state, params, path) => {
  const s = validerSource(params, `${path}.params`);
  if (state.sources.some((x) => x.id === s.id)) fail(`${path}.params.id`, "identifiant de source déjà utilisé");
  if (state.sources.length + 1 > STUDIO_LIMITES_SOURCES.sources) fail(path, `${STUDIO_LIMITES_SOURCES.sources} sources au plus`);
  state.sources.push(s);
};
