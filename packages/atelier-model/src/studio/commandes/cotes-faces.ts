import { controlerCoteFace, studioCorrespondanceFace, validerCoteFace, type StudioCoteFace } from "../objets-3d/cotes-faces.js";
import type { StudioFaceSolide, StudioSolid } from "../objets-3d/solides.js";
import { fail } from "../noyau/validation.js";
import { editable, freeId, type Etat, type Gestionnaire } from "./etat.js";

/**
 * Commande « Cote de face 3D » (`studio.solide.cote-face`, INV-013, lot G2) : crée la cote entre deux faces parallèles
 * d'un solide libre ; avec l'identifiant d'une cote existante, la **rattache explicitement** aux faces choisies (c'est
 * ainsi qu'une cote « à résoudre » se résout : jamais par proximité, toujours par la personne). L'état « à résoudre »
 * n'est jamais saisi. Calque de la cote modifiable ; le solide doit être un solide libre présent.
 */
export const creerCoteFace: Gestionnaire = (state, params, path) => {
  const c = validerCoteFace(params, `${path}.params`);
  if (c.toResolve) fail(`${path}.params.toResolve`, "l’état à résoudre naît d’une modification du solide, il n’est jamais saisi");
  editable(state, c, path);
  controlerCoteFace(c, state.solides, `${path}.params`);
  const s = state.solides.find((x) => x.id === c.solidId)!;
  editable(state, s, `${path} (solide ${s.id})`);
  const i = state.cotesFaces.findIndex((x) => x.id === c.id);
  if (i >= 0) {
    const avant = state.cotesFaces[i]!;
    editable(state, avant, path);
    if (avant.layerId !== c.layerId) fail(path, "le calque se change par studio.objet.calque");
    state.cotesFaces[i] = c;
    return;
  }
  freeId(state, c.id, path);
  state.cotesFaces.push(c);
  state.ids.add(c.id);
};

/**
 * Fin de lot (INV-013) : chaque cote de face rattachée est confrontée à son solide tel que le lot le laisse. Solide
 * inchangé : rien. Solide absent (supprimé, consommé par un booléen) : « à résoudre ». Solide modifié : chaque face
 * suit `studioCorrespondanceFace` — conservée ou réattachée (prouvée) ; ambiguë ou perdue : « à résoudre », faces
 * gardées telles quelles. Une cote d'un calque verrouillé qui devrait changer refuse le lot (comme une cote liée 2D).
 */
export function suivreCotesFaces(state: Etat, avant: ReadonlyMap<string, StudioSolid>, path: string): void {
  if (!state.cotesFaces.length) return;
  const apres = new Map(state.solides.map((s) => [s.id, s]));
  state.cotesFaces = state.cotesFaces.map((c): StudioCoteFace => {
    if (c.toResolve) return c;
    const s = apres.get(c.solidId), prec = avant.get(c.solidId);
    if (s && prec === s) return c;
    if (!s) { editable(state, c, `${path} (cote de face ${c.id})`); return { ...c, toResolve: true }; }
    if (!prec) return c;
    const faces = c.faces.map((f) => studioCorrespondanceFace(prec, s, f));
    if (faces.every((r) => r.etat === "conservee" || r.etat === "reattachee")) {
      const nouvelles = faces.map((r) => (r as { face: StudioFaceSolide }).face) as [StudioFaceSolide, StudioFaceSolide];
      if (nouvelles[0] === c.faces[0] && nouvelles[1] === c.faces[1]) return c;
      editable(state, c, `${path} (cote de face ${c.id})`);
      return { ...c, faces: nouvelles };
    }
    editable(state, c, `${path} (cote de face ${c.id})`);
    return { ...c, toResolve: true };
  });
}
