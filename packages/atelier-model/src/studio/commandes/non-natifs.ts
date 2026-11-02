import { editable, freeId, type Etat, type Gestionnaire } from "./etat.js";
import { fail, idList, record } from "../noyau/validation.js";
import { validerNonNatif } from "../non-natifs/non-natifs.js";

/**
 * Commandes des éléments non natifs (lot F3) : **conserver** un élément qu'un import n'a pas pu traduire (avec son
 * origine et sa raison), **retirer** explicitement des éléments conservés. Aucune autre commande ne les modifie : ils ne
 * se déplacent, ne se copient ni ne s'extrudent (non éditables comme un objet natif). Un calque verrouillé est refusé.
 */

export const conserverNonNatif: Gestionnaire = (state, params, path) => {
  const n = validerNonNatif(params, `${path}.params`);
  editable(state, n, path);
  freeId(state, n.id, path);
  state.nonNatifs.push(n);
  state.ids.add(n.id);
};

function introuvable(state: Etat, id: string, path: string): never {
  return fail(path, state.ids.has(id) ? `ce n’est pas un élément non natif : ${id}` : `élément non natif introuvable : ${id}`);
}

export const retirerNonNatifs: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = new Set(idList(p.ids, `${path}.params.ids`));
  const index = new Map(state.nonNatifs.map((n) => [n.id, n]));
  for (const id of ids) {
    const n = index.get(id);
    if (!n) introuvable(state, id, path);
    editable(state, n, path);
  }
  state.nonNatifs = state.nonNatifs.filter((n) => !ids.has(n.id));
  for (const id of ids) state.ids.delete(id);
};
