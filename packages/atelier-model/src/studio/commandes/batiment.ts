import type { StudioArchitectureItem } from "../architecture/types.js";
import { validerComposant, validerOccurrence, type StudioOccurrence } from "../batiment/composants.js";
import { validerNiveau } from "../batiment/niveaux.js";
import { controlerMurs } from "../architecture/validation.js";
import { fail, idList, record } from "../noyau/validation.js";
import { editable, freeId, type Etat, type Gestionnaire } from "./etat.js";

/**
 * Commandes du bâtiment (lot W3-B, X.1-04) : niveaux comme objets, composants 3D (définition partagée + occurrences).
 * - `studio.niveau.definir` : crée un niveau, ou modifie un niveau existant (même identifiant : nom, cote) ; une cote
 *   changée **translate verticalement** tous les objets rattachés (murs — et leurs ouvertures —, échelles, poteaux,
 *   poutres, dalles, occurrences) du même écart, dans la même commande ; un objet rattaché sur un calque verrouillé
 *   refuse la commande (rien n'est déplacé en partie) ;
 * - `studio.composant.definir` : crée une définition, ou la remplace (même identifiant) — toutes ses occurrences en
 *   dérivent aussitôt leur géométrie (une occurrence sur un calque verrouillé refuse la modification) ;
 * - `studio.composant.placer` : crée une occurrence, ou la replace (même identifiant : placement, définition désignée,
 *   calque, niveau) ; « Rendre unique » = une définition copiée puis l'occurrence replacée sur elle, en un lot ;
 * - Supprimer (`studio.dessin.supprimer`) retire aussi niveaux, définitions et occurrences choisis : un niveau retiré
 *   détache ses objets (géométrie gardée, rien n'est supprimé avec lui) ; une définition encore désignée par une
 *   occurrence non retirée est refusée.
 */

const rattache = (x: StudioArchitectureItem): x is Exclude<StudioArchitectureItem, { type: "opening" }> => x.type !== "opening";
const pur = (v: number) => (Object.is(v, -0) ? 0 : v);

function niveauConnu(state: Etat, niveauId: string | undefined, path: string): void {
  if (niveauId !== undefined && !state.niveaux.some((n) => n.id === niveauId)) fail(`${path}.niveauId`, `niveau introuvable : ${niveauId}`);
}

/** Ce qu'un objet rattaché à `niveauId` deviendrait translaté de `dz` (cote seulement). */
function translaterArchitecture(x: Exclude<StudioArchitectureItem, { type: "opening" }>, dz: number): StudioArchitectureItem {
  return { ...x, base: pur(x.base + dz) };
}

export const definirNiveau: Gestionnaire = (state, params, path) => {
  const n = validerNiveau(params, `${path}.params`);
  const index = state.niveaux.findIndex((x) => x.id === n.id);
  if (index < 0) {
    freeId(state, n.id, path);
    state.niveaux.push(n);
    state.ids.add(n.id);
    return;
  }
  const avant = state.niveaux[index]!;
  state.niveaux[index] = n;
  const dz = n.cote - avant.cote;
  if (dz === 0) return;
  // Déplacement du niveau répercuté : tous ses objets suivent, ou aucun (calque verrouillé : refus du lot).
  const murs: string[] = [];
  state.architecture = state.architecture.map((x) => {
    if (!rattache(x) || x.niveauId !== n.id) return x;
    editable(state, x, `${path} (objet ${x.id} du niveau ${n.id})`);
    if (x.type === "wall") murs.push(x.id);
    return translaterArchitecture(x, dz);
  });
  state.occurrences = state.occurrences.map((o) => {
    if (o.niveauId !== n.id) return o;
    editable(state, o, `${path} (occurrence ${o.id} du niveau ${n.id})`);
    return { ...o, placement: { ...o.placement, origin: { ...o.placement.origin, z: pur(o.placement.origin.z + dz) } } };
  });
  controlerMurs(state.architecture, murs, path);
};

export const definirComposant: Gestionnaire = (state, params, path) => {
  const c = validerComposant(params, `${path}.params`);
  const index = state.composants.findIndex((x) => x.id === c.id);
  if (index < 0) {
    freeId(state, c.id, path);
    state.composants.push(c);
    state.ids.add(c.id);
    return;
  }
  // Modification de la définition : elle s'applique à toutes ses occurrences (géométrie dérivée).
  for (const o of state.occurrences) if (o.composantId === c.id) editable(state, o, `${path} (occurrence ${o.id})`);
  state.composants[index] = c;
};

export const placerOccurrence: Gestionnaire = (state, params, path) => {
  const o = validerOccurrence(params, `${path}.params`);
  if (!state.composants.some((c) => c.id === o.composantId)) fail(`${path}.params.composantId`, state.ids.has(o.composantId) ? `ce n’est pas une définition de composant : ${o.composantId}` : `définition de composant introuvable : ${o.composantId}`);
  niveauConnu(state, o.niveauId, `${path}.params`);
  editable(state, o, path);
  const index = state.occurrences.findIndex((x) => x.id === o.id);
  if (index < 0) {
    freeId(state, o.id, path);
    state.occurrences.push(o);
    state.ids.add(o.id);
    return;
  }
  editable(state, state.occurrences[index]!, path);
  state.occurrences[index] = o;
};

/** Contrôle du niveau désigné par un objet architectural créé ou modifié (refus motivé avant la revalidation finale). */
export function controlerNiveauArchitecture(state: Etat, it: StudioArchitectureItem, path: string): void {
  if (rattache(it)) niveauConnu(state, it.niveauId, `${path}.params`);
}

/**
 * Part « bâtiment » de Supprimer (`studio.dessin.supprimer`) : niveaux, définitions et occurrences choisis sont traités
 * ici, le reste par le gestionnaire d'origine (inchangé quand la sélection n'en contient aucun).
 */
export function avecBatiment(base: Gestionnaire): Gestionnaire {
  return (state, params, path) => {
    if (!state.niveaux.length && !state.composants.length && !state.occurrences.length) return base(state, params, path);
    const brut = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : null;
    const ids = brut && Array.isArray(brut.ids) ? brut.ids : null;
    const niveaux = new Set(state.niveaux.map((n) => n.id)), composants = new Set(state.composants.map((c) => c.id)), occurrences = new Set(state.occurrences.map((o) => o.id));
    const siens = (id: unknown) => typeof id === "string" && (niveaux.has(id) || composants.has(id) || occurrences.has(id));
    if (!ids || !ids.some(siens)) return base(state, params, path);
    const p = record(params, ["ids"], `${path}.params`);
    const liste = idList(p.ids, `${path}.params.ids`);
    const autres = liste.filter((id) => !siens(id)), choisis = new Set(liste.filter(siens));
    if (autres.length) base(state, { ids: autres }, path);
    // Occurrences retirées (calque modifiable).
    const partantes = new Set<string>();
    for (const o of state.occurrences) if (choisis.has(o.id)) { editable(state, o, path); partantes.add(o.id); }
    // Définitions : refus si une occurrence restante la désigne encore.
    for (const c of state.composants) {
      if (!choisis.has(c.id)) continue;
      const restantes = state.occurrences.filter((o: StudioOccurrence) => o.composantId === c.id && !partantes.has(o.id));
      if (restantes.length) fail(path, `le composant ${c.id} a encore ${restantes.length} occurrence(s) (${restantes.slice(0, 5).map((o) => o.id).join(", ")}) : supprimez-les d’abord, ou choisissez-les avec lui`);
    }
    state.occurrences = state.occurrences.filter((o) => !partantes.has(o.id));
    state.composants = state.composants.filter((c) => !choisis.has(c.id));
    // Niveaux retirés : leurs objets sont détachés (géométrie et cotes gardées), jamais supprimés avec eux.
    const niveauxRetires = new Set(state.niveaux.filter((n) => choisis.has(n.id)).map((n) => n.id));
    if (niveauxRetires.size) {
      state.architecture = state.architecture.map((x) => {
        if (!rattache(x) || x.niveauId === undefined || !niveauxRetires.has(x.niveauId)) return x;
        editable(state, x, `${path} (objet ${x.id} détaché)`);
        const { niveauId: _n, ...reste } = x;
        return reste as StudioArchitectureItem;
      });
      state.occurrences = state.occurrences.map((o) => {
        if (o.niveauId === undefined || !niveauxRetires.has(o.niveauId)) return o;
        editable(state, o, `${path} (occurrence ${o.id} détachée)`);
        const { niveauId: _n, ...reste } = o;
        return reste;
      });
      state.niveaux = state.niveaux.filter((n) => !niveauxRetires.has(n.id));
    }
    for (const id of choisis) state.ids.delete(id);
  };
}
