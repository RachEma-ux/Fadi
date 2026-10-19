/**
 * Calques de la planche 2D : liste affichée (calque implicite compris), état visible / verrouillé d'un objet, commande
 * de réglage. Le calque implicite (`default`) n'est matérialisé dans le document que lorsqu'on le règle. Pur.
 */
import { STUDIO_DEFAULT_LAYER_ID, studioLayerState, type StudioCommand, type StudioDocument, type StudioLayer } from "@parcours/atelier-model";

export interface CalqueAffiche extends StudioLayer {
  /** Calque implicite non matérialisé : son nom affiché est celui de l'interface. */
  implicite: boolean;
}

/** Nom enregistré quand le calque implicite est matérialisé (donnée du projet, non traduite ensuite). */
export const NOM_CALQUE_DEFAUT = "Calque par défaut";

export function listeCalques(doc: StudioDocument): CalqueAffiche[] {
  const layers = (doc.layers ?? []).map((l) => ({ ...l, implicite: false }));
  if (layers.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID)) return layers;
  return [{ id: STUDIO_DEFAULT_LAYER_ID, name: NOM_CALQUE_DEFAUT, visible: true, locked: false, implicite: true }, ...layers];
}

/**
 * Calque actif effectif : le calque demandé s'il existe encore, sinon le premier calque de la liste (repli après une
 * annulation, une version serveur rechargée ou un calque disparu). `repli` vrai quand le calque demandé a disparu.
 */
export function calqueActifOuPremier<C extends { id: string }>(calques: readonly C[], demande: string): { calque: C | undefined; repli: boolean } {
  const trouve = calques.find((c) => c.id === demande);
  return trouve ? { calque: trouve, repli: false } : { calque: calques[0], repli: calques.length > 0 };
}

/** Un objet sur un calque inconnu n'est ni affiché ni modifiable (le modèle le refuserait). */
export const estVisible = (doc: StudioDocument, layerId: string | undefined): boolean => studioLayerState(doc, layerId)?.visible ?? false;
export const estVerrouille = (doc: StudioDocument, layerId: string | undefined): boolean => studioLayerState(doc, layerId)?.locked ?? true;
/** Sélectionnable : affiché et déverrouillé. */
export const estSelectionnable = (doc: StudioDocument, layerId: string | undefined): boolean => estVisible(doc, layerId) && !estVerrouille(doc, layerId);

/** `layerId` d'un objet posé sur le calque actif : absent pour le calque implicite. */
export const layerIdPour = (calqueActif: string): string | undefined => (calqueActif === STUDIO_DEFAULT_LAYER_ID ? undefined : calqueActif);

/** Réglage d'un calque : `studio.calque.modifier`, ou `studio.calque.creer` pour matérialiser le calque implicite. */
export function commandeReglage(doc: StudioDocument, calque: StudioLayer): StudioCommand {
  const params: StudioLayer = { id: calque.id, name: calque.name, visible: calque.visible, locked: calque.locked };
  return (doc.layers ?? []).some((l) => l.id === calque.id) ? { toolId: "studio.calque.modifier", params } : { toolId: "studio.calque.creer", params };
}

/** Nom proposé pour un nouveau calque : « Calque n », n premier rang libre. */
export function prochainNomCalque(doc: StudioDocument): string {
  const noms = new Set((doc.layers ?? []).map((l) => l.name));
  let n = (doc.layers ?? []).filter((l) => l.id !== STUDIO_DEFAULT_LAYER_ID).length + 1;
  while (noms.has(`Calque ${n}`)) n++;
  return `Calque ${n}`;
}
