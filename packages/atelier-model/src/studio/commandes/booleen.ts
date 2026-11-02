import { editable, freeId, type Etat, type Gestionnaire } from "./etat.js";
import { array, fail, identifier, record } from "../noyau/validation.js";
import {
  STUDIO_OPERATIONS_BOOLEENNES, studioIdsOperandes, validerResultatExact, validerSolideExact, type StudioOperandeExact, type StudioOperationBooleenne, type StudioSolideExact,
} from "../objets-3d/exacts.js";
import { studioLienSolide } from "./liens-solides.js";

/**
 * Commande `studio.solide.booleen` (lot F2, IF-003 ⑦ : engagement transactionnel explicite) : engage dans le document le
 * résultat d'une opération booléenne calculée par le noyau exact. Paramètres : identifiant du nouveau solide exact,
 * opération (`union`, `difference`, `intersection`), identifiants des deux opérandes (solides libres ou solides exacts
 * du document) et résultat du noyau (brep, maillage, mesures, empreinte).
 *
 * Le réducteur ne calcule rien : il vérifie que les deux opérandes existent, sont distincts, modifiables et à jour (un
 * prisme lié « à résoudre » est refusé), puis les **retire** de `solides` / `exacts` et les **conserve intacts** dans le
 * solide exact (R15 : aucun objet paramétrique n'est converti en silence ; la commande est l'acte explicite). Le
 * serveur recalcule l'opération depuis ces mêmes opérandes et remplace le résultat par le sien (R9). Le résultat prend
 * le calque du premier opérande. Annuler / rétablir passent par l'historique des lots, comme toute commande.
 */

function retirer(state: Etat, id: string, path: string): StudioOperandeExact {
  const i = state.solides.findIndex((s) => s.id === id);
  if (i >= 0) {
    const s = state.solides[i]!;
    editable(state, s, path);
    if (studioLienSolide(state, s)?.etat === "a-resoudre") fail(path, `le prisme ${id} est lié à une polyligne et « à résoudre » : résolvez son lien avant le booléen`);
    state.solides.splice(i, 1);
    return s;
  }
  const j = state.exacts.findIndex((s) => s.id === id);
  if (j >= 0) {
    const s = state.exacts[j]!;
    editable(state, s, path);
    state.exacts.splice(j, 1);
    return s;
  }
  return fail(path, state.ids.has(id) ? `ce n’est pas un solide : ${id}` : `solide introuvable : ${id}`);
}

export const creerBooleen: Gestionnaire = (state, params, path) => {
  const p = record(params, ["id", "operation", "operandes", "resultat"], `${path}.params`);
  const id = identifier(p.id, `${path}.params.id`);
  freeId(state, id, `${path}.params.id`);
  if (typeof p.operation !== "string" || !(STUDIO_OPERATIONS_BOOLEENNES as readonly string[]).includes(p.operation)) fail(`${path}.params.operation`, "opération « union », « difference » ou « intersection » attendue");
  const ids = array(p.operandes, `${path}.params.operandes`).map((x, i) => identifier(x, `${path}.params.operandes[${i}]`));
  if (ids.length !== 2) fail(`${path}.params.operandes`, "deux opérandes attendus");
  if (ids[0] === ids[1]) fail(`${path}.params.operandes`, "deux opérandes distincts attendus");
  const resultat = validerResultatExact(p.resultat, `${path}.params.resultat`);
  const a = retirer(state, ids[0]!, `${path}.params.operandes[0]`), b = retirer(state, ids[1]!, `${path}.params.operandes[1]`);
  const exact: StudioSolideExact = validerSolideExact({
    id, type: "exact", ...(a.layerId !== undefined ? { layerId: a.layerId } : {}), operation: p.operation as StudioOperationBooleenne, operandes: [a, b], resultat,
  }, `${path}.params`);
  state.exacts.push(exact);
  state.ids.add(id);
};

/** Identifiants réservés par un solide exact : le sien et ceux de ses opérandes conservés. */
export const idsReserves = (s: StudioSolideExact): string[] => [s.id, ...studioIdsOperandes(s)];
