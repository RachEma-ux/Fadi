/**
 * Espaces en volume et sur plusieurs niveaux (D-142, DA-07-16) : un espace a une étendue verticale quand sa
 * hauteur propre est déclarée (D-059) ou quand il monte jusqu'à un niveau haut (`niveauHautId` : double hauteur,
 * vide, gaine). Les niveaux dont l'altitude tombe strictement dans cette étendue sont « traversés » : l'espace y
 * est signalé (plans, quantités), sans aucune déduction de surface — la règle de mesure n'est pas fournie.
 * Sans hauteur ni niveau haut : étendue non évaluée. Pur (ni React ni DOM).
 */
import { aireNette } from "./geometrie.js";
import type { ModeleAtelier, Occurrence } from "./modele.js";
import { niveauxOrdonnes } from "./modele.js";

/** Étendue verticale [bas, haut] d'un espace, ou null (non évaluée, ou niveau haut qui n'est pas au-dessus). */
export function etendueEspace(etat: ModeleAtelier, e: Occurrence<"espace">): [number, number] | null {
  const z0 = e.niveauId ? etat.niveaux[e.niveauId]?.elevation : undefined;
  if (z0 === undefined) return null;
  if (e.params.niveauHautId) {
    const z1 = etat.niveaux[e.params.niveauHautId]?.elevation;
    return z1 !== undefined && z1 > z0 ? [z0, z1] : null;
  }
  return e.params.hauteur ? [z0, z0 + e.params.hauteur.value] : null;
}

export interface EspaceTraversant {
  id: string;
  nom: string;
  /** Niveau de l'espace (son plancher). */
  niveauOrigineId: string;
  aire: number;
}

/** Espaces d'autres niveaux qui traversent ce niveau (altitude du niveau strictement dans leur étendue). */
export function espacesTraversant(etat: ModeleAtelier, niveauId: string): EspaceTraversant[] {
  const n = etat.niveaux[niveauId];
  if (!n) return [];
  const out: EspaceTraversant[] = [];
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "espace" || o.niveauId === niveauId || !o.niveauId) continue;
    const ext = etendueEspace(etat, o as Occurrence<"espace">);
    if (!ext || !(n.elevation > ext[0] + 1e-9 && n.elevation < ext[1] - 1e-9)) continue;
    const p = (o as Occurrence<"espace">).params;
    out.push({ id: o.id, nom: p.nom, niveauOrigineId: o.niveauId, aire: Math.round(p.polygones.reduce((s, c) => s + aireNette(c.contour, c.trous), 0) * 1e6) / 1e6 });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Noms des niveaux traversés par un espace, dans l'ordre des altitudes. */
export function niveauxTraverses(etat: ModeleAtelier, e: Occurrence<"espace">): string[] {
  const ext = etendueEspace(etat, e);
  if (!ext) return [];
  return niveauxOrdonnes(etat).filter((n) => n.id !== e.niveauId && n.elevation > ext[0] + 1e-9 && n.elevation < ext[1] - 1e-9).map((n) => n.id);
}
