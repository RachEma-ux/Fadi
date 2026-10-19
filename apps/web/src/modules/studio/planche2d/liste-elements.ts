/**
 * « Éléments du dessin » : liste des objets et des cotes du document, groupés par calque (ordre des calques, puis ordre
 * du document), et logique du clavier de la liste (déplacement, plage, focus après suppression). Pur : aucun DOM ni
 * React. Les noms de calques et les identifiants sont des données du projet ; seuls les libellés de type sont de
 * l'interface. Une extrusion n'est affichée que si elle a été saisie (jamais proposée).
 */
import type { StudioDimension, StudioDocument, StudioShape } from "@parcours/atelier-model";
import { estSelectionnable, listeCalques } from "./calques";

/** Libellé de type affiché (interface, traduit par le dictionnaire anglais). */
export const TYPES_ELEMENT: Record<StudioShape["type"] | "dimension", string> = {
  line: "Ligne", rectangle: "Rectangle", circle: "Cercle", arc: "Arc", polyline: "Polyligne", dimension: "Cote",
};

export interface ElementListe {
  id: string;
  /** Identifiant court (8 premiers caractères), affiché ; l'identifiant complet reste dans `id`. */
  court: string;
  type: string;
  layerId: string;
  /** Hauteur et base saisies, ou null (objet plat, ou cote). */
  extrusion: { base: number; height: number; thickness?: number } | null;
  /** Cote dont l'objet coté a été supprimé. */
  aResoudre: boolean;
  selectionnable: boolean;
}

export interface GroupeListe {
  layerId: string;
  /** Nom du calque (donnée du projet), ou null pour un calque absent de la liste des calques. */
  nom: string | null;
  /** Calque implicite : son nom est celui de l'interface. */
  implicite: boolean;
  visible: boolean;
  locked: boolean;
  elements: ElementListe[];
}

export const idCourt = (id: string): string => (id.length > 8 ? id.slice(0, 8) : id);

function element(doc: StudioDocument, o: StudioShape | StudioDimension, layerId: string): ElementListe {
  const ex: { base: number; height: number; thickness?: number } | undefined = o.type === "dimension" ? undefined : o.extrusion;
  return {
    id: o.id, court: idCourt(o.id), type: o.type, layerId,
    extrusion: ex ? { base: ex.base, height: ex.height, ...(ex.thickness !== undefined ? { thickness: ex.thickness } : {}) } : null,
    aResoudre: o.type === "dimension" && o.toResolve === true,
    selectionnable: estSelectionnable(doc, o.layerId),
  };
}

/**
 * Groupes de la liste : un par calque portant au moins un élément, dans l'ordre des calques. Un élément sur un calque
 * inconnu n'est pas omis : il forme un groupe à part, à la fin.
 */
export function groupesElements(doc: StudioDocument): GroupeListe[] {
  const calques = listeCalques(doc);
  const parCalque = new Map<string, ElementListe[]>();
  for (const o of [...doc.objects, ...(doc.dimensions ?? [])]) {
    const layerId = o.layerId ?? "default";
    const liste = parCalque.get(layerId) ?? [];
    liste.push(element(doc, o, layerId));
    parCalque.set(layerId, liste);
  }
  const groupes: GroupeListe[] = [];
  for (const c of calques) {
    const elements = parCalque.get(c.id);
    if (!elements?.length) continue;
    groupes.push({ layerId: c.id, nom: c.name, implicite: c.implicite, visible: c.visible, locked: c.locked, elements });
    parCalque.delete(c.id);
  }
  for (const [layerId, elements] of parCalque) groupes.push({ layerId, nom: null, implicite: false, visible: false, locked: true, elements });
  return groupes;
}

/** Ordre de navigation : les éléments de tous les groupes, à plat. */
export const ordreElements = (groupes: readonly GroupeListe[]): string[] => groupes.flatMap((g) => g.elements.map((e) => e.id));

export type ToucheListe = "suivant" | "precedent" | "premier" | "dernier";

/** Élément atteint par une touche de déplacement depuis `courant` (bornes sans boucle). */
export function deplacer(ordre: readonly string[], courant: string | null, touche: ToucheListe): string | null {
  if (!ordre.length) return null;
  const i = courant === null ? -1 : ordre.indexOf(courant);
  switch (touche) {
    case "premier": return ordre[0]!;
    case "dernier": return ordre[ordre.length - 1]!;
    case "suivant": return ordre[i < 0 ? 0 : Math.min(i + 1, ordre.length - 1)]!;
    case "precedent": return ordre[i < 0 ? 0 : Math.max(i - 1, 0)]!;
  }
}

/** Plage de l'ancre à la cible (incluses), dans l'ordre de la liste, restreinte aux éléments sélectionnables. */
export function plage(ordre: readonly string[], ancre: string | null, cible: string, selectionnables: ReadonlySet<string>): string[] {
  const j = ordre.indexOf(cible);
  if (j < 0) return [];
  const i = ancre === null ? -1 : ordre.indexOf(ancre);
  const [a, b] = i < 0 ? [j, j] : [Math.min(i, j), Math.max(i, j)];
  return ordre.slice(a, b + 1).filter((id) => selectionnables.has(id));
}

/** Après suppression de `supprimes` : l'élément suivant le courant qui reste, sinon le précédent, sinon null. */
export function focusApresSuppression(ordre: readonly string[], supprimes: readonly string[], courant: string | null): string | null {
  const retires = new Set(supprimes);
  const i = courant === null ? -1 : ordre.indexOf(courant);
  if (i >= 0 && !retires.has(courant!)) return courant;
  const debut = Math.max(i, 0);
  for (let k = debut; k < ordre.length; k++) if (!retires.has(ordre[k]!)) return ordre[k]!;
  for (let k = debut - 1; k >= 0; k--) if (!retires.has(ordre[k]!)) return ordre[k]!;
  return null;
}

/** Annonce de la région vivante après un changement de sélection ou du nombre d'éléments ; null si rien à dire. */
export function annonce(avant: { selection: number; total: number } | null, apres: { selection: number; total: number }): string | null {
  if (!avant) return null;
  const morceaux: string[] = [];
  if (apres.total < avant.total) morceaux.push(`${avant.total - apres.total} élément(s) retiré(s) du dessin`);
  else if (apres.total > avant.total) morceaux.push(`${apres.total - avant.total} élément(s) ajouté(s) au dessin`);
  if (apres.selection !== avant.selection || morceaux.length) morceaux.push(apres.selection === 0 ? "Aucun élément sélectionné" : `${apres.selection} élément(s) sélectionné(s)`);
  return morceaux.length ? `${morceaux.join(" ; ")}.` : null;
}
