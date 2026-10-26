/**
 * Inventaire de couverture des types 3D de Studio (A.3-08 : « Maintenir les types avancés dans l'inventaire de
 * couverture sans les annoncer disponibles avant test »). Il range chaque type de géométrie 3D cité par le référentiel
 * (REF-02, STUDIO-RT-001 V1.0) avec sa source exacte, son état et les tests qui le prouvent :
 *
 * - un type `disponible` cite au moins un test du dépôt (fichier et libellé exact du `it(...)`) — contrôlé par
 *   `couverture-3d.test.ts`, qui échoue si un type est annoncé disponible sans test associé existant ;
 * - un type `non-disponible` n'a ni outil du registre ni test : il reste dans l'inventaire, jamais proposé comme
 *   disponible par l'interface (contrôle d'interface : `apps/web/src/modules/studio/vue3d/couverture-3d.test.ts`).
 *
 * Les types avancés viennent du référentiel : objets primaires de la Planche 3D (§ 4.1 : « Sommets, arêtes, faces,
 * volumes, groupes, composants. ») et scène S5 (§ 18.2 : « géométrie 3D libre avec booléens, courbes exactes et surfaces
 * complexes »), profils du booléen exact (PERF-07 : « Formes simples, cas dégénérés, BRep fournisseurs »). Aucun type
 * n'est inventé hors de ces citations. Pur : ni React, ni DOM.
 */
import { STUDIO_TOOL_IDS, type StudioToolId } from "./registry.js";

export const STUDIO_COUVERTURE_3D_VERSION = "studio-couverture-3d/1" as const;

export type StudioEtatType3d = "disponible" | "non-disponible";

export interface StudioSourceType3d {
  /** Document du référentiel. */
  readonly document: "STUDIO-RT-001 V1.0";
  /** Section ou identifiant cité. */
  readonly reference: string;
  /** Texte exact cité. */
  readonly texte: string;
}

export interface StudioTestType3d {
  /** Fichier de test du dépôt (chemin depuis la racine). */
  readonly fichier: string;
  /** Libellé exact du test (`it(...)`). */
  readonly libelle: string;
}

export interface StudioTypeCouverture3d {
  readonly id: string;
  /** Libellé français (interface). */
  readonly libelle: string;
  readonly source: StudioSourceType3d;
  readonly etat: StudioEtatType3d;
  /** Tests qui prouvent la capacité (au moins un pour un type disponible ; aucun pour un type non disponible). */
  readonly tests: readonly StudioTestType3d[];
  /** Outils du registre qui l'offrent (aucun pour un type non disponible). */
  readonly outils: readonly StudioToolId[];
  /** Ce qui manque, pour un type non disponible. */
  readonly manque?: string;
}

const OBJETS_PRIMAIRES: StudioSourceType3d = { document: "STUDIO-RT-001 V1.0", reference: "§ 4.1 — Planche 3D, objets primaires", texte: "Sommets, arêtes, faces, volumes, groupes, composants." };
const SCENE_S5: StudioSourceType3d = { document: "STUDIO-RT-001 V1.0", reference: "§ 18.2 — scène S5", texte: "S5 : géométrie 3D libre avec booléens, courbes exactes et surfaces complexes." };
const PERF_07: StudioSourceType3d = { document: "STUDIO-RT-001 V1.0", reference: "§ 18.1 — PERF-07 (booléen exact), profils", texte: "Formes simples, cas dégénérés, BRep fournisseurs." };

const OBJETS_3D_TEST = "packages/atelier-model/src/studio/objets-3d/objets-3d.test.ts";
const F1_TEST = "packages/atelier-model/src/studio/composition/f1-geometrie.test.ts";
const F2_TEST = "packages/atelier-model/src/studio/f2-booleen.test.ts";
const EXACT_TEST = "packages/geometry-exact/src/index.test.ts";
const SERVEUR_TEST = "apps/api/src/lib/studio-exact.test.ts";
const BATIMENT_TEST = "packages/atelier-model/src/studio/batiment/batiment.test.ts";

const TYPES = [
  // ——— Types livrés : chacun cite ses tests ———
  {
    id: "volume-boite", libelle: "Volume : boîte", source: OBJETS_PRIMAIRES, etat: "disponible", outils: ["studio.solide.boite"],
    tests: [{ fichier: OBJETS_3D_TEST, libelle: "une boîte 2 × 1 × 3 en (1, 1, 0) et un prisme sur profil fermé, rangés dans `solides`, jamais dans `objects`" },
      { fichier: OBJETS_3D_TEST, libelle: "maillage exact de la boîte, présent seulement si le document a des solides ; emprise comprise" }],
  },
  {
    id: "volume-prisme", libelle: "Volume : prisme sur profil", source: OBJETS_PRIMAIRES, etat: "disponible", outils: ["studio.solide.prisme"],
    tests: [{ fichier: OBJETS_3D_TEST, libelle: "validation du profil : fermé, trois sommets au moins, sans sommets confondus ni croisement" },
      { fichier: F1_TEST, libelle: "prisme : direction saisie validée (non nulle, hors du plan du profil), portée par le maillage, les quantités et la coupe" }],
  },
  {
    id: "faces", libelle: "Faces : pousser / tirer, diviser", source: OBJETS_PRIMAIRES, etat: "disponible", outils: ["studio.solide.face-decaler", "studio.solide.face-diviser"],
    tests: [{ fichier: F1_TEST, libelle: "pousser / tirer le sommet et la base d'une boîte : hauteur et cote recalculées, identité stable, volume relu" },
      { fichier: F1_TEST, libelle: "face latérale d'une boîte : elle devient un prisme de même identité, même placement, même volume" }],
  },
  {
    // Lot F2 : booléen exact calculé par le noyau OCCT (Worker à la demande), recalculé par le serveur.
    id: "booleen", libelle: "Booléen (union, différence, intersection)", source: SCENE_S5, etat: "disponible", outils: ["studio.solide.booleen"],
    tests: [{ fichier: F2_TEST, libelle: "le booléen retire les deux opérandes de `solides` et les conserve intacts dans le solide exact ; le résultat est celui fourni" },
      { fichier: EXACT_TEST, libelle: "union, soustraction, intersection de deux extrusions (boîtes Studio 2 × 2 × 2 décalées de 1 m) : 12, 4, 4 m³ ; empreinte reproductible" },
      { fichier: SERVEUR_TEST, libelle: "même empreinte : le résultat du serveur remplace celui du client (un maillage altéré par le client est corrigé)" }],
  },
  {
    // Lot W3-B (X.1-04) : définition partagée et occurrences placées, géométrie dérivée de la définition.
    id: "composant-3d", libelle: "Composant 3D", source: OBJETS_PRIMAIRES, etat: "disponible", outils: ["studio.composant.definir", "studio.composant.placer"],
    tests: [{ fichier: BATIMENT_TEST, libelle: "chaque occurrence dérive sa géométrie de la définition placée ; modifier la définition change toutes ses occurrences dans la même révision" },
      { fichier: BATIMENT_TEST, libelle: "rendre unique : l'occurrence désigne une copie de la définition ; la définition d'origine modifiée ne la touche plus" },
      { fichier: BATIMENT_TEST, libelle: "table d'instanciation : une géométrie par définition, l'indice d'instance désigne son occurrence (désignation conservée après instanciation)" }],
  },
  // ——— Types avancés : non disponibles tant qu'ils n'ont pas de test ———
  {
    id: "sommets-aretes", libelle: "Sommets et arêtes éditables", source: OBJETS_PRIMAIRES, etat: "non-disponible", outils: [], tests: [],
    manque: "Les sommets et arêtes des solides sont dérivés (maillage) : aucune commande ne les édite directement.",
  },
  {
    id: "groupe-3d", libelle: "Groupe 3D", source: OBJETS_PRIMAIRES, etat: "non-disponible", outils: [], tests: [],
    manque: "studio-document/1 n'a pas de groupe de solides.",
  },
  {
    id: "courbe-exacte-3d", libelle: "Courbe exacte 3D", source: SCENE_S5, etat: "non-disponible", outils: [], tests: [],
    manque: "Les courbes exactes de Studio sont planes (arcs, renflements du dessin 2D) ; aucune courbe spatiale.",
  },
  {
    id: "surface-complexe", libelle: "Surface complexe (NURBS, subdivision)", source: SCENE_S5, etat: "non-disponible", outils: [], tests: [],
    manque: "Aucun type de surface libre dans studio-document/1 ; profils polygonaux seulement.",
  },
  {
    id: "brep-fournisseur", libelle: "BRep fournisseur (import)", source: PERF_07, etat: "non-disponible", outils: [], tests: [],
    manque: "Aucun import de BRep dans Studio.",
  },
] as const satisfies readonly StudioTypeCouverture3d[];

function geler<T extends object>(o: T): T {
  for (const v of Object.values(o)) if (v && typeof v === "object") geler(v as object);
  return Object.freeze(o);
}

/** Inventaire de couverture des types 3D (A.3-08), dans l'ordre : types livrés, puis types avancés. */
export const STUDIO_COUVERTURE_3D: readonly StudioTypeCouverture3d[] = geler(TYPES.map((t) => ({ ...t })) as StudioTypeCouverture3d[]);

/** Types avancés (non disponibles) : ce que l'interface ne propose jamais comme disponible. */
export const studioTypes3dNonDisponibles = (): StudioTypeCouverture3d[] => STUDIO_COUVERTURE_3D.filter((t) => t.etat === "non-disponible");

/**
 * Incohérences de l'inventaire (vide si tout va bien) : type disponible sans test, type non disponible qui cite un test
 * ou un outil, outil inconnu du registre, identifiant en double. `testExiste` dit si un test cité existe (le test du
 * modèle lit les fichiers du dépôt).
 */
export function studioControlerCouverture3d(types: readonly StudioTypeCouverture3d[], testExiste: (t: StudioTestType3d) => boolean): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const outilsConnus = new Set<string>(STUDIO_TOOL_IDS);
  for (const t of types) {
    if (ids.has(t.id)) out.push(`${t.id} : identifiant en double`);
    ids.add(t.id);
    if (t.etat === "disponible") {
      if (!t.tests.length) out.push(`${t.id} : annoncé disponible sans test associé`);
      for (const x of t.tests) if (!testExiste(x)) out.push(`${t.id} : test introuvable « ${x.libelle} » (${x.fichier})`);
    } else {
      if (t.tests.length) out.push(`${t.id} : non disponible mais cite un test (à passer disponible après revue)`);
      if (t.outils.length) out.push(`${t.id} : non disponible mais offert par un outil du registre`);
      if (!t.manque) out.push(`${t.id} : non disponible sans dire ce qui manque`);
    }
    for (const o of t.outils) if (!outilsConnus.has(o)) out.push(`${t.id} : outil inconnu du registre ${o}`);
  }
  return out;
}
