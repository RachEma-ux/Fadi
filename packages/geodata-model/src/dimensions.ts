/**
 * Dimensions d'un indicateur (D-GD-17, lot A2) : thème, famille (« Taux de chômage (%) »), modalité (« 0-4 ans »,
 * « Célibataire »), milieu de résidence et sexe. Une famille regroupe ses déclinaisons ; la carte choisit une famille
 * puis ses dimensions, la fiche les présente en tableau. Logique pure.
 */

export const MILIEUX = ["ensemble", "urbain", "rural"] as const;
export const SEXES = ["ensemble", "masculin", "feminin"] as const;
export type Milieu = (typeof MILIEUX)[number];
export type Sexe = (typeof SEXES)[number];
export const LIBELLES_MILIEU: Record<Milieu, string> = { ensemble: "Ensemble", urbain: "Urbain", rural: "Rural" };
export const LIBELLES_SEXE: Record<Sexe, string> = { ensemble: "Ensemble", masculin: "Masculin", feminin: "Féminin" };

export interface DimensionsIndicateur {
  readonly theme: string | null;
  readonly famille: string | null;
  readonly modalite: string | null;
  readonly milieu: Milieu | null;
  readonly sexe: Sexe | null;
}

export const estMilieu = (x: unknown): x is Milieu => typeof x === "string" && (MILIEUX as readonly string[]).includes(x);
export const estSexe = (x: unknown): x is Sexe => typeof x === "string" && (SEXES as readonly string[]).includes(x);

export interface IndicateurDimensionne extends DimensionsIndicateur { readonly id: string; readonly titre: string }

export interface FamilleIndicateurs<T extends IndicateurDimensionne> {
  readonly theme: string;
  readonly famille: string;
  readonly indicateurs: readonly T[];
  readonly modalites: readonly (string | null)[];
  readonly milieux: readonly Milieu[];
  readonly sexes: readonly Sexe[];
}

/**
 * Regroupe les indicateurs par thème puis famille, dans l'ordre reçu ; un indicateur sans famille forme sa propre
 * famille (son titre) dans le thème « Autres indicateurs ».
 */
export function grouperIndicateurs<T extends IndicateurDimensionne>(liste: readonly T[]): FamilleIndicateurs<T>[] {
  const familles = new Map<string, { theme: string; famille: string; indicateurs: T[] }>();
  for (const i of liste) {
    const theme = i.theme ?? "Autres indicateurs";
    const famille = i.famille ?? i.titre;
    const cle = `${theme}\u0000${famille}`;
    (familles.get(cle) ?? familles.set(cle, { theme, famille, indicateurs: [] }).get(cle)!).indicateurs.push(i);
  }
  const uniques = <V,>(xs: V[]) => [...new Set(xs)];
  return [...familles.values()].map((f) => ({
    ...f,
    modalites: uniques(f.indicateurs.map((i) => i.modalite)),
    milieux: MILIEUX.filter((m) => f.indicateurs.some((i) => (i.milieu ?? "ensemble") === m)),
    sexes: SEXES.filter((s) => f.indicateurs.some((i) => (i.sexe ?? "ensemble") === s)),
  }));
}

/** Indicateur d'une famille pour une modalité, un milieu et un sexe ; null si cette déclinaison n'existe pas. */
export function choisirDeclinaison<T extends IndicateurDimensionne>(f: FamilleIndicateurs<T>, modalite: string | null, milieu: Milieu, sexe: Sexe): T | null {
  return f.indicateurs.find((i) => i.modalite === modalite && (i.milieu ?? "ensemble") === milieu && (i.sexe ?? "ensemble") === sexe) ?? null;
}

/**
 * Déclinaison la plus proche après le changement d'une dimension : la déclinaison exacte si elle existe, sinon la
 * première de la famille qui garde la valeur que l'utilisateur vient de choisir (les autres dimensions s'adaptent).
 */
export function declinaisonProche<T extends IndicateurDimensionne>(
  f: FamilleIndicateurs<T>, modalite: string | null, milieu: Milieu, sexe: Sexe, change: "modalite" | "milieu" | "sexe",
): T | null {
  const exacte = choisirDeclinaison(f, modalite, milieu, sexe);
  if (exacte) return exacte;
  const garde = (i: T) => (change === "modalite" ? i.modalite === modalite : change === "milieu" ? (i.milieu ?? "ensemble") === milieu : (i.sexe ?? "ensemble") === sexe);
  return f.indicateurs.find(garde) ?? null;
}

/** Déclinaison par défaut d'une famille : ensemble des milieux et des sexes, première modalité ; sinon la première. */
export function declinaisonParDefaut<T extends IndicateurDimensionne>(f: FamilleIndicateurs<T>): T {
  return choisirDeclinaison(f, f.modalites[0] ?? null, "ensemble", "ensemble") ?? f.indicateurs[0]!;
}

/**
 * Indicateurs principaux d'une couche qui en compte beaucoup (table des attributs) : sans modalité, ensemble des
 * milieux et des sexes, dans l'ordre reçu, au plus `max` ; une couche qui en compte `max` ou moins les garde tous.
 */
export function indicateursPrincipaux<T extends IndicateurDimensionne>(liste: readonly T[], max = 24): T[] {
  if (liste.length <= max) return [...liste];
  return liste.filter((i) => i.modalite === null && (i.milieu ?? "ensemble") === "ensemble" && (i.sexe ?? "ensemble") === "ensemble").slice(0, max);
}

/**
 * Tableau de ventilation d'une famille (fiche territoriale, lot E) : une ligne par modalité, une colonne par croisement
 * milieu × sexe présent dans la famille (ensemble, urbain, rural ; puis ensemble, masculin, féminin) ; une cellule sans
 * déclinaison publiée est null (affichée « — », jamais zéro).
 */
export function tableauVentilation<T extends IndicateurDimensionne>(f: FamilleIndicateurs<T>): {
  colonnes: { milieu: Milieu; sexe: Sexe }[];
  lignes: { modalite: string | null; cellules: (T | null)[] }[];
} {
  const colonnes = MILIEUX.flatMap((milieu) => SEXES.map((sexe) => ({ milieu, sexe })))
    .filter((c) => f.indicateurs.some((i) => (i.milieu ?? "ensemble") === c.milieu && (i.sexe ?? "ensemble") === c.sexe));
  return { colonnes, lignes: f.modalites.map((modalite) => ({ modalite, cellules: colonnes.map((c) => choisirDeclinaison(f, modalite, c.milieu, c.sexe)) })) };
}
