/**
 * Lecture de site (feuille de route équipe A, PR P12 ; donnees-1 § 1.1-1.2) : ce que la base sait d'un point, d'une unité
 * ou d'une zone d'étude, rubrique par rubrique. Une rubrique est **soit** une valeur avec sa provenance, **soit**
 * « non évaluée » avec un motif et son libellé : jamais 0, jamais « — », jamais vide (INV-06). Pur, sans React ni réseau ;
 * entrées structurelles (aucun type de l'interface). Aucune catégorie, couche ni valeur n'est écrite ici (D-GD-29).
 */
import { categorieDe, type CoucheRangeable, type RangementCatalogue } from "./catalogue.js";
import type { DroitsVersion } from "./droits.js";
import type { Qualification } from "./qualification.js";
import { libelleAbsence, type MotifAbsence, type ValeurIndicateur } from "./valeurs.js";

/** Provenance d'une valeur lue : une seule forme pour la fiche, le site et la référence. `empreinte` null : non fournie (terrain). */
export interface Provenance {
  readonly versionId: string; readonly libelle: string; readonly empreinte: string | null;
  readonly sourceId: string | null; readonly titre: string; readonly producteur: string | null;
  readonly periode: string | null; readonly publieeLe: string | null;
  readonly licence: string; readonly attribution: string; readonly urlSource: string | null;
  readonly couvertureDeclaree: string | null; readonly precisionDeclaree: string | null;
  readonly qualification: Qualification | null; readonly droits: DroitsVersion | null; readonly privee: boolean;
}

/** Version telle que l'API la rend (`lireVersion`), lue structurellement. */
export interface VersionLue {
  readonly id: string; readonly libelle: string; readonly empreinte: string; readonly periode: string | null; readonly publieeLe: string | null;
  readonly licence: string; readonly attribution: string; readonly urlSource: string | null; readonly precision: string | null;
  readonly qualification?: Qualification; readonly droits: DroitsVersion; readonly privee: boolean;
  readonly source: { readonly id: string; readonly titre: string; readonly producteur: string; readonly couverture: string };
}

export function provenanceDe(v: VersionLue): Provenance {
  return {
    versionId: v.id, libelle: v.libelle, empreinte: v.empreinte, sourceId: v.source.id, titre: v.source.titre, producteur: v.source.producteur,
    periode: v.periode, publieeLe: v.publieeLe, licence: v.licence, attribution: v.attribution, urlSource: v.urlSource,
    couvertureDeclaree: v.source.couverture || null, precisionDeclaree: v.precision, qualification: v.qualification ?? null, droits: v.droits, privee: v.privee,
  };
}

/** Motifs d'une rubrique non évaluée : les 7 motifs d'absence lus en base, et ceux de la lecture de site (liste fermée). */
export type MotifNonEvalue = MotifAbsence
  | "aucune-unite" | "hors-emprise" | "couche-inaccessible" | "aucune-couche-services" | "aucune-source-prix" | "terrain-indisponible"
  | "lecture-impossible" | "source-a-qualifier" | "sans-unite" | "aucune-couche-raster";

const LIBELLES_SITE: Readonly<Record<Exclude<MotifNonEvalue, MotifAbsence>, string>> = {
  "aucune-unite": "Aucune unité du découpage en base à cet endroit",
  "hors-emprise": "Non évaluée (hors emprise ou cellule sans donnée)",
  "couche-inaccessible": "Couche inaccessible",
  "aucune-couche-services": "Non évalué : aucune couche de points affichée sur la carte",
  "aucune-source-prix": "Aucune source de prix publiée pour ce lieu",
  "terrain-indisponible": "Terrain indisponible à cet endroit",
  "lecture-impossible": "Non évalué : lecture impossible pour l'instant",
  "source-a-qualifier": "Non évalué, source à qualifier",
  "sans-unite": "Non évalué : aucune unité du découpage à cet endroit",
  "aucune-couche-raster": "Non évalué : aucune couche de grille affichée sur la carte",
};

/** Libellé d'un motif (français source, traduit par le dictionnaire de l'interface). */
export const libelleNonEvalue = (m: MotifNonEvalue): string => (m in LIBELLES_SITE ? LIBELLES_SITE[m as keyof typeof LIBELLES_SITE] : libelleAbsence(m as MotifAbsence));

export type Rubrique<T> =
  | { readonly etat: "evaluee"; readonly valeur: T; readonly provenance: readonly Provenance[]; readonly nature: "source" | "calcule";
      /** Lecture partielle : couches demandées mais non lues (refusées, retirées), dites avec leur motif, jamais comptées. */
      readonly lacunes?: readonly Lacune[] }
  /** `detail` : texte rendu par le serveur (motif du terrain, message d'erreur), jamais un libellé fixé ici. */
  | { readonly etat: "non-evaluee"; readonly motif: MotifNonEvalue; readonly detail: string | null; readonly provenance: readonly Provenance[] };

export interface Lacune { readonly coucheId: string; readonly titre: string | null; readonly motif: MotifNonEvalue }

export interface EntreeSite {
  readonly nature: "point" | "unite" | "zone"; readonly repere: "geographic"; readonly crs: "EPSG:4326";
  readonly point?: { readonly lon: number; readonly lat: number };
  readonly unite?: { readonly coucheId: string; readonly code: string };
  readonly zoneId?: string; readonly rayonM?: number;
}

export interface UniteLue { readonly code: string; readonly nom: string; readonly rang: number; readonly coucheId: string; readonly versionId: string }
export interface IndicateurLu { readonly titre: string; readonly unite: string | null; readonly periode: string | null; readonly valeur: ValeurIndicateur }
export interface ServiceLu { readonly coucheId: string; readonly titre: string; readonly nombre: number; readonly plusProche: { readonly nom: string; readonly distanceM: number } | null; readonly couvertureDeclaree: string | null }
/** `perimetre` : territoire auquel l'édition est rattachée (le lieu ou un territoire qui le contient), jamais réattribuée. */
export interface EditionLue { readonly versionId: string; readonly libelle: string; readonly editeur: string; readonly periode: string | null; readonly perimetre?: { readonly code: string; readonly nom: string } }
/**
 * I3 / I6 : valeur d'une couche de grille affichée (population carroyée, altitude indicative…) au point. `valeur` null :
 * hors emprise ou cellule sans donnée (« non évaluée », jamais zéro). Grandeur et unité viennent de la base.
 */
export interface ValeurGrilleLue {
  readonly coucheId: string; readonly titre: string; readonly grandeur: string; readonly unite: string | null;
  readonly valeur: number | null; readonly classe: string | null; readonly motif: "hors-emprise" | null;
}
export interface AltitudeLue { readonly altitude: number; readonly produit: string; readonly titreSource: string }

export interface LectureSite {
  readonly entree: EntreeSite;
  /** Instant ISO de la lecture (affiché en heure suisse). */
  readonly lueLe: string;
  /** I1 : unités du découpage qui contiennent le lieu, de la plus fine à la plus globale. */
  readonly unites: Rubrique<readonly UniteLue[]>;
  /** I2 : indicateurs de l'unité la plus fine (valeur absente avec son motif, jamais zéro). */
  readonly indicateurs: Rubrique<readonly IndicateurLu[]>;
  /** I4 : objets des couches de points affichées dans le rayon (comptes calculés, couverture non évaluée). */
  readonly services: Rubrique<readonly ServiceLu[]>;
  /** I5 : éditions de prix publiées rattachées à l'unité. */
  readonly prix: Rubrique<readonly EditionLue[]>;
  /** I3 / I6 : couches de grille affichées, valeur au point (distinctes du terrain I7). */
  readonly grilles: Rubrique<readonly ValeurGrilleLue[]>;
  /** I7 : altitude du terrain haute résolution (MNT par défaut), état rendu par le serveur. */
  readonly terrain: Rubrique<AltitudeLue>;
  /** I9 : parcelle, urbanisme, foncier, risques — aucune source qualifiée en base. */
  readonly parcelle: Rubrique<never>;
}

/** Réponse d'un appel : reçue, en erreur (message), ou non demandée (lieu sans point, par exemple). */
export type Reponse<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly erreur: string } | null;

const nonEvaluee = <T>(motif: MotifNonEvalue, detail: string | null = null, provenance: readonly Provenance[] = []): Rubrique<T> => ({ etat: "non-evaluee", motif, detail, provenance });

/**
 * Assemble la lecture de site à partir des réponses de l'API (≈ 5 appels, aucun envoyé ici). Règles : une liste d'unités
 * vide → `aucune-unite` ; aucune couche de points affichée → `aucune-couche-services` ; une couche inaccessible n'est
 * jamais comptée zéro ; aucune édition de prix → `aucune-source-prix` ; terrain non disponible → motif du serveur.
 */
export function assemblerLectureSite(e: {
  entree: EntreeSite; maintenant: Date;
  unites: Reponse<readonly UniteLue[]>;
  /** Fiche de l'unité la plus fine : indicateurs et version de sa couche. */
  fiche: Reponse<{ indicateurs: readonly IndicateurLu[]; version: VersionLue }>;
  /** Proximité (couches de points affichées) ; `[]` : aucune couche affichée. */
  services: Reponse<readonly ({ coucheId: string; accessible: false; titre?: string } | { coucheId: string; accessible: true; titre: string; nombre: number; plusProche: { nom: string; distanceM: number } | null; version: VersionLue })[]>;
  prix: Reponse<readonly (EditionLue & { attribution: string; licence: string })[]>;
  /** Valeurs au point des couches de grille affichées ; `[]` ou null : aucune couche de grille affichée. */
  grilles?: Reponse<readonly ({ coucheId: string; accessible: false; titre?: string } | { coucheId: string; accessible: true; titre: string; grandeur: string; unite: string | null; valeur: number | null; classe: string | null; version: VersionLue })[]>;
  terrain: Reponse<{ disponible: true; altitude: number; produit: string; source: { versionId: string; titre: string; attribution: string; licence: string; date: string | null } } | { disponible: false; motif: string }>;
}): LectureSite {
  const lacunesDe = (cs: readonly { coucheId: string; accessible: boolean; titre?: string }[]): { lacunes?: readonly Lacune[] } => {
    const l = cs.filter((c) => !c.accessible).map((c) => ({ coucheId: c.coucheId, titre: c.titre ?? null, motif: "couche-inaccessible" as const }));
    return l.length ? { lacunes: l } : {};
  };
  const echec = <T>(r: { ok: false; erreur: string }): Rubrique<T> => nonEvaluee("lecture-impossible", r.erreur);
  const u = e.unites;
  const unites: Rubrique<readonly UniteLue[]> = !u ? nonEvaluee("aucune-unite") : !u.ok ? echec(u)
    : u.valeur.length ? { etat: "evaluee", valeur: [...u.valeur].sort((a, b) => b.rang - a.rang), provenance: [], nature: "source" } : nonEvaluee("aucune-unite");
  const f = e.fiche;
  const indicateurs: Rubrique<readonly IndicateurLu[]> = !f ? nonEvaluee("sans-unite") : !f.ok ? echec(f)
    : f.valeur.indicateurs.length ? { etat: "evaluee", valeur: f.valeur.indicateurs, provenance: [provenanceDe(f.valeur.version)], nature: "source" } : nonEvaluee("non-publiee", null, [provenanceDe(f.valeur.version)]);
  const s = e.services;
  let services: Rubrique<readonly ServiceLu[]>;
  if (!s) services = nonEvaluee("aucune-couche-services");
  else if (!s.ok) services = echec(s);
  else {
    const lues = s.valeur.flatMap((c) => (c.accessible ? [c] : []));
    services = !s.valeur.length ? nonEvaluee("aucune-couche-services") : !lues.length ? nonEvaluee("couche-inaccessible")
      : { etat: "evaluee", nature: "calcule", provenance: lues.map((c) => provenanceDe(c.version)), ...lacunesDe(s.valeur), valeur: lues.map((c) => ({ coucheId: c.coucheId, titre: c.titre, nombre: c.nombre, plusProche: c.plusProche, couvertureDeclaree: c.version.source.couverture || null })) };
  }
  const p = e.prix;
  const prix: Rubrique<readonly EditionLue[]> = !p ? nonEvaluee("sans-unite") : !p.ok ? echec(p)
    : p.valeur.length ? { etat: "evaluee", nature: "source", provenance: [], valeur: p.valeur.map((x) => ({ versionId: x.versionId, libelle: x.libelle, editeur: x.editeur, periode: x.periode, ...(x.perimetre ? { perimetre: x.perimetre } : {}) })) } : nonEvaluee("aucune-source-prix");
  const t = e.terrain;
  let terrain: Rubrique<AltitudeLue>;
  if (!t) terrain = nonEvaluee("terrain-indisponible");
  else if (!t.ok) terrain = echec(t);
  else if (!t.valeur.disponible) terrain = nonEvaluee("terrain-indisponible", t.valeur.motif);
  else {
    const src = t.valeur.source;
    const provenance: Provenance = { versionId: src.versionId, libelle: src.titre, empreinte: null, sourceId: null, titre: src.titre, producteur: null, periode: src.date, publieeLe: null, licence: src.licence, attribution: src.attribution, urlSource: null, couvertureDeclaree: null, precisionDeclaree: null, qualification: null, droits: null, privee: false };
    terrain = { etat: "evaluee", nature: "source", provenance: [provenance], valeur: { altitude: t.valeur.altitude, produit: t.valeur.produit, titreSource: src.titre } };
  }
  const g = e.grilles ?? null;
  let grilles: Rubrique<readonly ValeurGrilleLue[]>;
  if (!g) grilles = nonEvaluee("aucune-couche-raster");
  else if (!g.ok) grilles = echec(g);
  else {
    const lues = g.valeur.flatMap((c) => (c.accessible ? [c] : []));
    const provenance = lues.map((c) => provenanceDe(c.version));
    grilles = !g.valeur.length ? nonEvaluee("aucune-couche-raster") : !lues.length ? nonEvaluee("couche-inaccessible")
      : lues.every((c) => c.valeur === null) ? nonEvaluee("hors-emprise", null, provenance)
      : { etat: "evaluee", nature: "source", provenance, ...lacunesDe(g.valeur), valeur: lues.map((c) => ({ coucheId: c.coucheId, titre: c.titre, grandeur: c.grandeur, unite: c.unite, valeur: c.valeur, classe: c.classe, motif: c.valeur === null ? "hors-emprise" as const : null })) };
  }
  return { entree: e.entree, lueLe: e.maintenant.toISOString(), unites, indicateurs, services, prix, grilles, terrain, parcelle: nonEvaluee("source-a-qualifier") };
}

/** Couches de points (ou mixtes) d'une catégorie du rangement reçu de la base ; aucune clé de catégorie écrite ici. */
export function couchesDeCategorie<C extends CoucheRangeable>(couches: readonly C[], rangement: RangementCatalogue, cle: string): C[] {
  return couches.filter((c) => (c.typeGeometrie === "point" || c.typeGeometrie === "mixte") && categorieDe(c, rangement).cle === cle);
}
