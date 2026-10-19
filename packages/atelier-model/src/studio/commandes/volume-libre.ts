import { editable, freeId, type Etat, type Gestionnaire } from "../noyau/etat.js";
import { fail, finite, identifier, idList, record } from "../noyau/validation.js";
import { validerSolide, type StudioSolid } from "../objets-3d/solides.js";

/**
 * Commandes du volume libre (A.3-02) : créer une boîte ou un prisme sur profil directement dans l'espace, déplacer et
 * supprimer un solide libre. Les valeurs sont celles saisies (aucune dimension par défaut) ; un calque verrouillé est
 * refusé ; le lot entier est abandonné au premier refus.
 */

function creer(type: StudioSolid["type"]): Gestionnaire {
  return (state, params, path) => {
    const s = validerSolide(params, `${path}.params`);
    if (s.type !== type) fail(`${path}.params.type`, "type incompatible avec l’outil");
    editable(state, s, path);
    freeId(state, s.id, path);
    state.solides.push(s);
    state.ids.add(s.id);
  };
}

export const creerBoite = creer("box");
export const creerPrisme = creer("prism");

function introuvable(state: Etat, id: string, path: string): never {
  return fail(path, state.ids.has(id) ? `ce n’est pas un solide libre : ${id}` : `solide introuvable : ${id}`);
}

export const deplacerSolide: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "dx", "dy", "dz"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  const dx = finite(p.dx, `${path}.params.dx`), dy = finite(p.dy, `${path}.params.dy`), dz = finite(p.dz, `${path}.params.dz`);
  const index = state.solides.findIndex((s) => s.id === id);
  const s = state.solides[index];
  if (!s) return introuvable(state, id, path);
  editable(state, s, path);
  const o = s.placement.origin;
  state.solides[index] = validerSolide({ ...s, placement: { ...s.placement, origin: { x: o.x + dx, y: o.y + dy, z: o.z + dz } } }, path);
};

export const supprimerSolides: Gestionnaire = (state, params, path) => {
  const p = record(params, ["ids"], `${path}.params`);
  const ids = new Set(idList(p.ids, `${path}.params.ids`));
  const index = new Map(state.solides.map((s) => [s.id, s]));
  for (const id of ids) {
    const s = index.get(id);
    if (!s) introuvable(state, id, path);
    editable(state, s, path);
  }
  state.solides = state.solides.filter((s) => !ids.has(s.id));
  for (const id of ids) state.ids.delete(id);
};
