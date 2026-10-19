/** Bornes techniques des propriétés déclarées et des exigences (pas des valeurs métier). Module sans dépendance. */
export const STUDIO_LIMITES_PROPRIETES = Object.freeze({ proprietes: 20_000, parCible: 200, nom: 120, texte: 500, unite: 32, source: 500 } as const);
export const STUDIO_LIMITES_EXIGENCES = Object.freeze({ exigences: 500, libelle: 200, source: 500, reference: 200, auteur: 200, motif: 2000 } as const);
