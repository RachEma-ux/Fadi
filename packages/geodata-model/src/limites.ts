/**
 * Limites administratives (D-GD-16) : rang d'une couche dans la hiérarchie Région → Province → Commune, lu de la source
 * (niveau geoBoundaries `ADM1`/`ADM2`/`ADM3`, ou niveau administratif OpenStreetMap déclaré dans le titre : 4 région,
 * 5 province, 8 commune) — jamais deviné ; et ordre d'affichage : en superposition, la région est au-dessus de la
 * province, elle-même au-dessus de la commune, avec un contour plus épais. Pur.
 */

/** 1 = région, 2 = province / préfecture, 3 = commune ; null = couche hors hiérarchie. */
export type RangAdministratif = 1 | 2 | 3;

const OSM: Record<string, RangAdministratif> = { "4": 1, "5": 2, "8": 3 };

export function rangAdministratif(c: { readonly niveau: string | null; readonly titre: string }): RangAdministratif | null {
  const n = c.niveau?.trim().toUpperCase() ?? "";
  const adm = /^ADM([123])$/.exec(n);
  if (adm) return Number(adm[1]) as RangAdministratif;
  const osm = /niveau administratif (\d+)/i.exec(c.titre) ?? /^(?:OSM[- ]?)?(\d+)$/.exec(n);
  return osm ? OSM[osm[1]!] ?? null : null;
}

/** Épaisseur du contour (px) : la région la plus épaisse ; une couche hors hiérarchie garde un contour moyen. */
export const epaisseurContour = (rang: RangAdministratif | null): number => (rang === 1 ? 3.5 : rang === 2 ? 2.2 : rang === 3 ? 1.2 : 1.5);

/**
 * Ordre d'affichage (du dessous vers le dessus) : l'ordre de la composition est gardé, sauf entre couches
 * administratives, qui occupent les mêmes places mais rangées commune → province → région (la région au-dessus).
 */
export function ordreAffichage<T extends { readonly coucheId: string }>(couches: readonly T[], rangs: ReadonlyMap<string, RangAdministratif>): T[] {
  const admin = couches.filter((k) => rangs.has(k.coucheId));
  const triees = [...admin].sort((a, b) => rangs.get(b.coucheId)! - rangs.get(a.coucheId)!);
  let i = 0;
  return couches.map((k) => (rangs.has(k.coucheId) ? triees[i++]! : k));
}
