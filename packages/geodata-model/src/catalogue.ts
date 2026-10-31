/**
 * Rangement du catalogue GeoData par catégorie (D-GD-14, organisation inspirée de Kharita : sections repliables comptant
 * les couches actives, bascule Vecteurs / Imagerie). Les catégories sont gérées (créer, renommer, ordonner, supprimer)
 * par un gestionnaire de données ; une source y est rangée explicitement (affectation), sinon par le thème déclaré dans
 * sa fiche ; à défaut elle tombe dans « Autres », jamais dans une catégorie devinée. Logique pure.
 */

export type TypeCatalogue = "vecteurs" | "imagerie";

export interface CategorieCatalogue { readonly cle: string; readonly libelle: string; readonly themes: readonly string[] }

/** Catégories gérées et affectations explicites (identifiant de source → clé de catégorie). */
export interface RangementCatalogue { readonly categories: readonly CategorieCatalogue[]; readonly affectations: ReadonlyMap<string, string> }

/** Catégories initiales (semées une fois en base, puis gérées), dans l'ordre d'affichage ; un thème par catégorie. */
export const CATEGORIES_CATALOGUE: readonly CategorieCatalogue[] = [
  { cle: "limites", libelle: "Limites administratives", themes: ["limites-administratives"] },
  { cle: "population", libelle: "Population et démographie", themes: ["population"] },
  { cle: "agriculture", libelle: "Agriculture et irrigation", themes: ["agriculture"] },
  { cle: "hydrologie", libelle: "Eau et hydrologie", themes: ["hydrologie"] },
  { cle: "infrastructures", libelle: "Infrastructures et transport", themes: ["infrastructures"] },
  { cle: "energie", libelle: "Énergie et mines", themes: ["energie"] },
  { cle: "equipements", libelle: "Équipements et services", themes: ["equipements"] },
  { cle: "tourisme", libelle: "Tourisme et patrimoine", themes: ["tourisme", "patrimoine"] },
  { cle: "relief", libelle: "Altitude et relief", themes: ["relief"] },
  { cle: "climat", libelle: "Climat et précipitations", themes: ["climat"] },
  { cle: "occupation-sol", libelle: "Occupation du sol", themes: ["occupation-sol"] },
  { cle: "sols", libelle: "Sols et pédologie", themes: ["sols"] },
  { cle: "geologie", libelle: "Géologie", themes: ["geologie"] },
  // Prix immobiliers (Concept Prix v1.1, §5) : entrée propre du catalogue (agrégats publiés, couches de prix).
  { cle: "prix-immobiliers", libelle: "Prix immobiliers", themes: ["prix-immobiliers"] },
  { cle: "personnelles", libelle: "Mes données importées", themes: ["donnees-personnelles"] },
  { cle: "test", libelle: "Jeux de test", themes: ["test"] },
];
export const CATEGORIE_AUTRES: CategorieCatalogue = { cle: "autres", libelle: "Autres", themes: [] };

export const RANGEMENT_PAR_DEFAUT: RangementCatalogue = { categories: CATEGORIES_CATALOGUE, affectations: new Map() };

/** Catégorie d'un thème de fiche (première catégorie qui le déclare, « Autres » sinon). */
export const categorieDuTheme = (theme: string, categories: readonly CategorieCatalogue[] = CATEGORIES_CATALOGUE): CategorieCatalogue =>
  categories.find((c) => c.themes.includes(theme)) ?? CATEGORIE_AUTRES;

/** Catégorie d'une couche : affectation explicite de sa source, sinon thème, sinon « Autres ». */
export function categorieDe(c: CoucheRangeable, r: RangementCatalogue = RANGEMENT_PAR_DEFAUT): CategorieCatalogue {
  const affectee = c.version.source.id ? r.affectations.get(c.version.source.id) : undefined;
  return (affectee && r.categories.find((k) => k.cle === affectee)) || categorieDuTheme(c.version.source.theme, r.categories);
}

/** Libellé d'une catégorie : 2 à 80 caractères, sans doublon (casse ignorée). */
export function validerLibelleCategorie(x: unknown, existants: readonly string[] = []): { ok: true; libelle: string } | { ok: false; erreur: string } {
  if (typeof x !== "string") return { ok: false, erreur: "Libellé attendu." };
  const l = x.replace(/\s+/g, " ").trim();
  if (l.length < 2 || l.length > 80) return { ok: false, erreur: "Le libellé compte de 2 à 80 caractères." };
  if (l.toLowerCase() === CATEGORIE_AUTRES.libelle.toLowerCase() || existants.some((e) => e.toLowerCase() === l.toLowerCase())) return { ok: false, erreur: "Une catégorie porte déjà ce libellé." };
  return { ok: true, libelle: l };
}

/** Une couche raster relève de l'imagerie ; points, lignes et polygones des vecteurs. */
export const typeCatalogue = (typeGeometrie: string): TypeCatalogue => (typeGeometrie === "raster" ? "imagerie" : "vecteurs");

export interface CoucheRangeable {
  readonly id: string; readonly titre: string; readonly typeGeometrie: string; readonly version: { readonly source: { readonly id?: string; readonly theme: string } };
  /** Niveau administratif lu dans la table des niveaux en base (D-GD-42) : les couches de limites suivent l'ordre des niveaux. */
  readonly niveauAdministratif?: { readonly rang: number } | null;
}

export interface GroupeCatalogue<T> { readonly categorie: CategorieCatalogue; readonly couches: readonly T[]; readonly actives: number }

/**
 * Regroupe les couches d'un type (vecteurs ou imagerie) par catégorie, dans l'ordre des catégories ; les couches d'un
 * niveau administratif d'abord, dans l'ordre de la table des niveaux (du plus global au plus fin), puis les autres par
 * titre ; `actives` compte celles déjà présentes sur la carte. Les catégories vides ne sont pas rendues.
 */
export function regrouperCatalogue<T extends CoucheRangeable>(couches: readonly T[], type: TypeCatalogue, actives: ReadonlySet<string>, r: RangementCatalogue = RANGEMENT_PAR_DEFAUT): GroupeCatalogue<T>[] {
  const groupes = new Map<string, T[]>();
  for (const c of couches) {
    if (typeCatalogue(c.typeGeometrie) !== type) continue;
    const k = categorieDe(c, r).cle;
    (groupes.get(k) ?? groupes.set(k, []).get(k)!).push(c);
  }
  return [...r.categories, CATEGORIE_AUTRES]
    .filter((cat) => groupes.has(cat.cle))
    .map((cat) => {
      const rang = (c: T) => c.niveauAdministratif?.rang ?? Number.POSITIVE_INFINITY;
      const cs = groupes.get(cat.cle)!.sort((a, b) => rang(a) - rang(b) || a.titre.localeCompare(b.titre, "fr"));
      return { categorie: cat, couches: cs, actives: cs.filter((c) => actives.has(c.id)).length };
    });
}

/** Nombre de couches de chaque type (libellés des bascules Vecteurs / Imagerie). */
export function compterParType(couches: readonly CoucheRangeable[]): Record<TypeCatalogue, number> {
  const n = { vecteurs: 0, imagerie: 0 };
  for (const c of couches) n[typeCatalogue(c.typeGeometrie)]++;
  return n;
}
