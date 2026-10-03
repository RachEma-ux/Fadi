/**
 * Importeur P.118 (cahier §6, D-002, D-021, D-022) : `importerP118(dataset) → { modele, rapport }`.
 *
 * Fonction pure, déterministe, sans E/S. Règles :
 * - rien n'est omis (R7) : chaque champ source non porté par un paramètre canonique est conservé bit à bit en
 *   propriété `import.<champ>` ; un élément inconvertible est conservé brut (`importeur.nonConverti`) et signalé ;
 * - rien n'est inventé (R3) : valeur absente = « non évaluée » ; une valeur de règle (alignement, drapeau)
 *   porte une annotation « à vérifier » et un problème ;
 * - repères jamais mélangés (R5) : `rooms[].polygons` et `label` restent dans le repère de la registration 8.19 ;
 * - hypothèses, structure, sources : jamais des exigences (R4) ;
 * - `ui` et `activeLayer` : états d'affichage, hors modèle (R10), listés au rapport.
 *
 * Propriétés techniques `importeur.*` (rang source, métadonnées de trous, tracés rattachés, champs absents
 * complétés par règle) : elles permettent la projection sans perte vers l'entrée d'analyse (`src/projection`).
 */
import type { EtatModele } from "../contrats/etat.js";
import type { DonneeNonImportee, FamilleImport, ImporterP118, JeuDonneesP118, LigneRapportImport, RapportImport, RoleInconnu } from "../contrats/import.js";
import { FAMILLES_IMPORT } from "../contrats/import.js";
import type { CodeProbleme, GraviteProbleme, Probleme } from "../contrats/probleme.js";
import type { ClasseObjet, IdObjet, ObjetDe, ObjetModele, Ontologie } from "../ontologie/classes.js";
import { MOTIF_COULEUR } from "../ontologie/classes.js";
import { cleDefinition, definitionNonType, ID_NON_TYPE, type CatalogueTypes, type ClasseTypee, type DefinitionType } from "../ontologie/definitions.js";
import { ONTOLOGIE, VERSION_ONTOLOGIE } from "../ontologie/descripteurs.js";
import { CLASSES_IFC } from "../ontologie/ifc.js";
import { nonEvaluee, type Tracabilite } from "../ontologie/provenance.js";
import type { Propriete } from "../ontologie/proprietes.js";
import { pointCadastral, type PointLocal, type PolygoneAvecTrous } from "../ontologie/reperes.js";
import type { Relation } from "../ontologie/relations.js";
import { aire, angle, longueur, type ChargeSurfacique } from "../ontologie/unites.js";
import { validerObjet } from "../ontologie/validation.js";
import { empreinteModele, empreinteSource, jsonCanonique } from "./empreinte.js";
import {
  aireAvecTrous,
  cloner,
  ErreurConversion,
  estListePoints,
  estNombre,
  estObjet,
  estPoint2,
  estTexte,
  exiger,
  pl,
  polygoneAvecTrousSource,
  proprieteImport,
  proprieteImporteur,
  reste,
  sans,
  type Json,
} from "./outils.js";

/** Repère local nommé des `rooms[].polygons` et `rooms[].label` (D-021 : `modelPoints` de la registration 8.19). */
export const REPERE_PIECES_SOURCE = "p118-layoutV819-registration";

/** Écart toléré entre aire déclarée et aire des tracés (m²), proposé par DA-07-15 (§10.2) : outil, pas règle. */
export const TOLERANCE_ECART_AIRE = 0.01;

/** Rôles de tracés connus du §6. Tout autre rôle devient un `solide` et est listé comme rôle inconnu. */
export const ROLES_SOLIDES_CONNUS = ["solid", "clearance", "ramp-retaining-wall", "ramp-guard", "basement-ramp", "ramp-direction", "ramp-drain"] as const;

/** Familles de tableaux portées par `floorDesign.levels[*]`. */
export const FAMILLES_NIVEAU = ["walls", "columns", "doors", "windows", "stairs", "paths", "dims", "texts", "rooms"] as const;
export type FamilleNiveau = (typeof FAMILLES_NIVEAU)[number];

const FAMILLE_RAPPORT: Readonly<Record<FamilleNiveau, FamilleImport>> = {
  walls: "murs",
  columns: "poteaux",
  doors: "portes",
  windows: "fenetres",
  stairs: "escaliers",
  paths: "traces",
  dims: "cotations",
  texts: "textes",
  rooms: "pieces",
};

const KIND_ATTENDU: Readonly<Record<Exclude<FamilleNiveau, "rooms">, string>> = {
  walls: "wall",
  columns: "column",
  doors: "door",
  windows: "window",
  stairs: "stairs",
  paths: "path",
  dims: "dim",
  texts: "text",
};

const TRANSFORMATIONS: Readonly<Record<FamilleImport, readonly string[]>> = {
  niveaux: [
    "`domains.levels[]` → `niveau` (`elevation`, `height` sans arrondi ; `ordre` = ordre source)",
    "`floorDesign.levels[*].areas`, `.meta` et tout champ non canonique → propriétés `import.*` bit à bit",
    "`floorDesign.levels[*].id/name/elevation/height` comparés à `domains.levels` (doublon, non réimporté)",
  ],
  murs: [
    "`a`, `b` → `axe` (repère local du projet) ; `thickness` → `epaisseur` ; `height` → `hauteur`",
    "`type` → définition `cloison` / `mur`, absent → `non-type` ; `exteriorWallIds` → `exterieur`",
    "`lineRef` « axe » → `alignement: axe` ; `lineRef` absent → `axe` « à vérifier » (règle) ; `lineRef`, `color` conservés en `import.*`",
  ],
  portes: ["`hostWallId` → `murHoteId` + relations `heberge-par` / `heberge` ; `t` conservé ; `distance` dérivée = t × longueur de l'axe", "`sill` → `allege` ; `mark` → `repere` ; type `non-type`"],
  fenetres: ["`hostWallId` → `murHoteId` + relations `heberge-par` / `heberge` ; `t` conservé ; `distance` dérivée = t × longueur de l'axe", "`sill` → `allege` ; `mark` → `repere` ; type `non-type`"],
  escaliers: [
    "chaque occurrence conservée (vue par niveau) ; `stairGroup` → `groupe`, sans fusion",
    "`sourceLevel` / `targetLevel` → `niveauDepartId` / `niveauArriveeId` + relation `relie` (rôle `depart` / `arrivee`) ; absents → pas de relation, problème",
    "`risers`, `waistThickness` absents → « non évaluée » ; `planReferenceOnly` absent → `false` « à vérifier » (règle)",
  ],
  poteaux: ["`p` → `point` ; `shapeId` → `formeId` ; `depth` → `profondeur` ; `angle` en degrés ; `designStatus` → `statutConception` (texte)"],
  pieces: [
    "`area` → `aireDeclaree` (provenance `prototype`, « à vérifier » : antérieure à 8.19)",
    "`polygons`, `label` → `polygonesSource`, `etiquette` dans le repère `p118-layoutV819-registration` (jamais mélangés)",
    "géométrie courante `polygones` = tracés `room` de même code ; pièce sans tracé : `polygones` vide + problème",
  ],
  traces: [
    "`floor-slab` → `dalle` : `epaisseur` = `height` 0,25 m « à vérifier », `thickness` 0,10 m en `import.thickness`",
    "`roof-slab` → `toiture` plate : `epaisseur` = `height` « à vérifier », `pente` « non évaluée »",
    "`room` → `piece.polygones` si le code correspond, sinon `espace` ; `core-zone` → `zone` ; `plan-reference` → `reference-plan`",
    "autres rôles → `solide`, `role` conservé tel quel ; `vertexOffsets`, `topOffsets`, hauteurs nulles conservés",
  ],
  cotations: ["`a`, `b`, `offset` → cotation `libre`, sans référence (D-019)"],
  textes: ["`x`, `y` → `position` ; `text` → `texte`"],
  calques: ["union des noms des calques des niveaux, ordre de première apparition (D-021)", "présence par niveau → `niveauxPresence` ; rang par niveau conservé ; `fill` absent → `remplissage` absent"],
  parcelle: ["sommets → `sommetsCadastraux` (CRS déclaré) ; `area`, `officialArea`, `correctedAreaPrinted` séparés ; `setback.distance` / `.envelope` → `recul` / `enveloppeRecul`", "aucune conversion vers le repère local (pas de `sommetsLocaux`)"],
  emprise: ["`vertices` → `sommetsCadastraux` (CRS de la parcelle) ; `architectureRevision` → `revisionArchitecture`"],
  structure: ["`meta.structure` → `structureDeclaree` « à confirmer » ; `loadNature` → hypothèse « à confirmer » (R4)"],
  hypotheses: ["`meta.assumptions` [code, thème, texte] → `hypothese` « à confirmer », codes conservés"],
  sources: ["`meta.sources` → `source` ; identifiants et champs conservés"],
  "proprietes-projet": ["`meta.*` restants, racine du jeu de données → propriétés de projet `import.*`, bit à bit"],
};

interface Compteur {
  source: number;
  cible: number;
  parNiveau: Map<string, { source: number; cible: number }>;
  parClasse: Map<string, number>;
}

interface ElementNonConverti {
  readonly famille: string;
  readonly rang: number;
  readonly motif: string;
  readonly valeur: unknown;
}

/** Contexte d'un import (état mutable local, jamais exposé). */
class Import {
  readonly objets = new Map<IdObjet, ObjetModele>();
  readonly relations: Relation[] = [];
  readonly problemes: Probleme[] = [];
  readonly nonImporte: DonneeNonImportee[] = [];
  readonly questions: string[] = [];
  readonly roles = new Map<string, IdObjet[]>();
  readonly compteurs = new Map<FamilleImport, Compteur>();
  readonly proprietesProjet: Propriete[] = [];
  readonly definitions = new Map<string, DefinitionType>();

  constructor(readonly prefixe: string) {
    for (const f of FAMILLES_IMPORT) this.compteurs.set(f, { source: 0, cible: 0, parNiveau: new Map(), parClasse: new Map() });
  }

  id(x: string): IdObjet {
    return `${this.prefixe}${x}`;
  }

  probleme(code: CodeProbleme, gravite: GraviteProbleme, message: string, objetIds: readonly IdObjet[], extra: { chemin?: string; niveauId?: IdObjet } = {}): void {
    this.problemes.push({ code, gravite, message, objetIds, ...(extra.chemin !== undefined ? { chemin: extra.chemin } : {}), ...(extra.niveauId !== undefined ? { niveauId: extra.niveauId } : {}) });
  }

  source(f: FamilleImport, niveau?: string, n = 1): void {
    const c = this.compteurs.get(f)!;
    c.source += n;
    if (niveau !== undefined) {
      const e = c.parNiveau.get(niveau) ?? { source: 0, cible: 0 };
      e.source += n;
      c.parNiveau.set(niveau, e);
    }
  }

  cible(f: FamilleImport, classe: string, niveau?: string, n = 1): void {
    const c = this.compteurs.get(f)!;
    c.cible += n;
    c.parClasse.set(classe, (c.parClasse.get(classe) ?? 0) + n);
    if (niveau !== undefined) {
      const e = c.parNiveau.get(niveau) ?? { source: 0, cible: 0 };
      e.cible += n;
      c.parNiveau.set(niveau, e);
    }
  }

  ajouter(o: ObjetModele): void {
    if (this.objets.has(o.id)) throw new ErreurConversion(`identifiant « ${o.id} » déjà utilisé`);
    this.objets.set(o.id, o);
  }

  definition(classe: ClasseTypee, id: string): string {
    const cle = cleDefinition(classe, id);
    if (!this.definitions.has(cle)) {
      this.definitions.set(
        cle,
        id === ID_NON_TYPE
          ? definitionNonType(classe, 1)
          : { id, classe, nom: id, classeIfc: CLASSES_IFC[classe]?.entiteType ?? null, proprietes: [], versionCatalogue: 1, provenance: "import", statut: "declaree", note: "créée à partir des valeurs `type` des murs de P.118" },
      );
    }
    return id;
  }
}

const TRACE_IMPORT: Tracabilite = { provenance: "import", statut: "declaree" };

function objet<C extends ClasseObjet>(o: Omit<ObjetDe<C>, "ontologie" | "provenance" | "statut"> & Partial<Tracabilite>): ObjetDe<C> {
  return { ...TRACE_IMPORT, ...o, ontologie: ONTOLOGIE[o.classe].ontologie as Ontologie } as ObjetDe<C>;
}

const kindConsomme = (src: Json, famille: Exclude<FamilleNiveau, "rooms">): string[] => (src.kind === KIND_ATTENDU[famille] ? ["kind"] : []);

/** Niveau du jeu de données en cours d'import. */
interface NiveauSource {
  readonly lid: string;
  readonly id: IdObjet;
  readonly design: Json;
  readonly calques: Set<string>;
}

// ---------------------------------------------------------------------------

export const importerP118: ImporterP118 = (dataset: JeuDonneesP118, options) => {
  const projetId = options?.projetId;
  const ctx = new Import(projetId !== undefined ? `${projetId}_` : "");
  const domains = (estObjet(dataset.domains) ? dataset.domains : {}) as Json;
  const floor = estObjet(domains.floorDesign) ? domains.floorDesign : {};
  const floorLevels = estObjet(floor.levels) ? floor.levels : {};
  const meta = estObjet(floor.meta) ? floor.meta : {};

  // --- Racine, domaines inconnus, ui ---------------------------------------
  for (const k of Object.keys(dataset)) {
    if (k === "domains") continue;
    ctx.proprietesProjet.push(proprieteImport(`racine.${k}`, dataset[k]));
  }
  for (const k of Object.keys(domains)) {
    if (["nativeParcel", "levels", "buildingFootprint", "floorDesign", "ui"].includes(k)) continue;
    ctx.proprietesProjet.push(proprieteImport(`domains.${k}`, domains[k]));
    ctx.probleme("donnee-hors-modele", "information", `Domaine « ${k} » sans destination au §6 : conservé en propriété de projet.`, [], { chemin: `domains.${k}` });
  }
  for (const k of Object.keys(floor)) {
    if (k === "levels" || k === "meta") continue;
    ctx.proprietesProjet.push(proprieteImport(`floorDesign.${k}`, floor[k]));
    ctx.probleme("donnee-hors-modele", "information", `Champ « floorDesign.${k} » sans destination au §6 : conservé en propriété de projet.`, [], { chemin: `floorDesign.${k}` });
  }
  if (estObjet(domains.ui)) {
    for (const k of Object.keys(domains.ui)) ctx.nonImporte.push({ chemin: `domains.ui.${k}`, motif: "état d'affichage local, hors modèle (R10)" });
  } else if (domains.ui !== undefined) ctx.nonImporte.push({ chemin: "domains.ui", motif: "état d'affichage local, hors modèle (R10)" });
  ctx.proprietesProjet.push(proprieteImporteur("prefixe", ctx.prefixe));

  // --- Niveaux ------------------------------------------------------------
  const listeNiveaux = Array.isArray(domains.levels) ? domains.levels : [];
  const niveaux: NiveauSource[] = [];
  listeNiveaux.forEach((l, i) => {
    ctx.source("niveaux");
    try {
      const src = exiger(l, estObjet, `levels[${i}]`);
      const lid = exiger(src.id, estTexte, "id");
      const id = ctx.id(lid);
      const design = estObjet(floorLevels[lid]) ? floorLevels[lid] : {};
      if (!estObjet(floorLevels[lid])) ctx.probleme("donnee-hors-modele", "avertissement", `Niveau « ${lid} » sans entrée dans floorDesign.levels.`, [id], { chemin: `floorDesign.levels.${lid}` });
      const props: Propriete[] = [...reste(src, ["id", "name", "elevation", "height"]).map((p) => ({ ...p, nom: p.nom.replace(/^import\./, "import.levels.") })), proprieteImporteur("rang", i)];
      // Champs du niveau de floorDesign hors familles : `areas`, `meta`, tout champ inconnu → `import.*`.
      for (const k of Object.keys(design)) {
        if ((FAMILLES_NIVEAU as readonly string[]).includes(k) || ["exteriorWallIds", "layers"].includes(k)) continue;
        if (k === "activeLayer") {
          ctx.nonImporte.push({ chemin: `floorDesign.levels.${lid}.activeLayer`, motif: "calque actif de l'outil : état d'affichage, hors modèle (R10)" });
          continue;
        }
        if (["id", "name", "elevation", "height"].includes(k) && design[k] === src[k]) {
          continue;
        }
        if (["id", "name", "elevation", "height"].includes(k)) {
          ctx.probleme("donnee-hors-modele", "avertissement", `floorDesign.levels.${lid}.${k} diffère de domains.levels : valeur conservée en « import.floorDesign.${k} ».`, [id], { chemin: `floorDesign.levels.${lid}.${k}` });
          props.push(proprieteImport(`floorDesign.${k}`, design[k]));
          continue;
        }
        props.push(proprieteImport(k, design[k]));
      }
      for (const k of ["id", "name", "elevation", "height"]) {
        if (design[k] === undefined && estObjet(floorLevels[lid])) props.push(proprieteImporteur(`absent.niveau.${k}`, true));
      }
      ctx.ajouter(
        objet<"niveau">({
          id,
          classe: "niveau",
          params: { nom: exiger(src.name, estTexte, "name"), elevation: longueur(exiger(src.elevation, estNombre, "elevation")), hauteur: longueur(exiger(src.height, estNombre, "height")), ordre: i },
          proprietes: props,
        }),
      );
      niveaux.push({ lid, id, design, calques: new Set(estObjet(design.layers) ? Object.keys(design.layers) : []) });
      ctx.cible("niveaux", "niveau");
    } catch (e) {
      conserverBrut(ctx, "niveaux", `domains.levels[${i}]`, l, e);
    }
  });
  for (const lid of Object.keys(floorLevels)) {
    if (!niveaux.some((n) => n.lid === lid)) {
      ctx.proprietesProjet.push(proprieteImport(`floorDesign.levels.${lid}`, floorLevels[lid]));
      ctx.probleme("donnee-hors-modele", "erreur", `floorDesign.levels.${lid} sans niveau dans domains.levels : conservé brut en propriété de projet.`, [], { chemin: `floorDesign.levels.${lid}` });
    }
  }
  const idNiveau = new Map(niveaux.map((n) => [n.lid, n.id]));

  // --- Calques : union des noms, ordre de première apparition (D-021) ----
  const calques = new Map<string, { def: Json; presence: string[]; rangs: Record<string, number>; divergents: Record<string, Json> }>();
  for (const n of niveaux) {
    if (!estObjet(n.design.layers)) {
      ajouterPropriete(ctx, n.id, proprieteImporteur("absent.layers", true));
      if (n.design.layers !== undefined) {
        ajouterPropriete(ctx, n.id, proprieteImport("floorDesign.layers", n.design.layers));
        ctx.probleme("donnee-hors-modele", "erreur", `floorDesign.levels.${n.lid}.layers mal formé : conservé brut sur le niveau.`, [n.id], { niveauId: n.id });
      }
      continue;
    }
    Object.entries(n.design.layers).forEach(([nom, def], rang) => {
      ctx.source("calques", n.lid);
      const d = estObjet(def) ? def : { valeur: def };
      const c = calques.get(nom);
      if (!c) calques.set(nom, { def: d, presence: [n.lid], rangs: { [n.lid]: rang }, divergents: {} });
      else {
        c.presence.push(n.lid);
        c.rangs[n.lid] = rang;
        if (jsonCanonique(d) !== jsonCanonique(c.def)) c.divergents[n.lid] = d;
      }
    });
  }
  // Effectif source des calques = noms distincts (22 pour P.118) ; le détail par niveau reste dans `parNiveau`.
  ctx.compteurs.get("calques")!.source = calques.size;
  const idCalque = new Map<string, IdObjet>();
  [...calques.entries()].forEach(([nom, c], ordre) => {
    const id = ctx.id(`calque-${nom}`);
    try {
      const d = c.def;
      const props: Propriete[] = [...reste(d, ["color", "fill", "visible", "locked"]), proprieteImporteur("rangParNiveau", c.rangs)];
      if (Object.keys(c.divergents).length) {
        props.push(proprieteImporteur("definitionsNiveau", c.divergents));
        ctx.probleme("calque-divergent", "avertissement", `Calque « ${nom} » défini différemment selon les niveaux (${Object.keys(c.divergents).join(", ")}) : définitions conservées.`, [id]);
        ctx.questions.push(`Calque « ${nom} » : quelle définition retenir pour le calque de projet ?`);
      }
      const couleur = exiger(d.color, (x): x is string => estTexte(x) && MOTIF_COULEUR.test(x), "color");
      ctx.ajouter(
        objet<"calque">({
          id,
          classe: "calque",
          params: {
            nom,
            couleur,
            ...(estTexte(d.fill) && MOTIF_COULEUR.test(d.fill) ? { remplissage: d.fill } : {}),
            visible: exiger(d.visible, (x): x is boolean => typeof x === "boolean", "visible"),
            verrouille: exiger(d.locked, (x): x is boolean => typeof x === "boolean", "locked"),
            ordre,
            niveauxPresence: c.presence.map((l) => idNiveau.get(l)!),
          },
          proprietes: estTexte(d.fill) && !MOTIF_COULEUR.test(d.fill) ? [...props, proprieteImport("fill", d.fill)] : props,
        }),
      );
      idCalque.set(nom, id);
      for (const l of c.presence) ctx.cible("calques", "calque", l);
    } catch (e) {
      conserverBrut(ctx, "calques", `floorDesign.levels.*.layers.${nom}`, { definition: c.def, presence: c.presence, rangs: c.rangs, divergents: c.divergents }, e);
    }
  });

  {
    const c = ctx.compteurs.get("calques")!;
    c.cible = idCalque.size;
    c.parClasse.set("calque", idCalque.size);
  }

  /** Calque d'un objet : `calqueId` et champs consommés ; problème si non déclaré au niveau. */
  const calqueDe = (src: Json, n: NiveauSource, id: IdObjet): { calqueId?: IdObjet; consommes: string[] } => {
    if (!estTexte(src.layer)) return { consommes: [] };
    const cid = idCalque.get(src.layer);
    if (cid === undefined) {
      ctx.probleme("calque-non-declare", "avertissement", `Objet ${id} : calque « ${src.layer} » déclaré sur aucun niveau ; conservé en import.layer.`, [id], { niveauId: n.id });
      return { consommes: [] };
    }
    if (!n.calques.has(src.layer)) ctx.probleme("calque-non-declare", "information", `Objet ${id} : calque « ${src.layer} » non déclaré au niveau ${n.lid} (calque de projet).`, [id], { niveauId: n.id });
    return { calqueId: cid, consommes: ["layer"] };
  };

  // --- Objets des niveaux --------------------------------------------------
  const murs = new Map<IdObjet, { a: PointLocal; b: PointLocal }>();
  for (const n of niveaux) {
    const tab = (f: FamilleNiveau): unknown[] => {
      const v = n.design[f];
      if (v === undefined) return [];
      if (!Array.isArray(v)) {
        ctx.probleme("donnee-hors-modele", "erreur", `floorDesign.levels.${n.lid}.${f} n'est pas un tableau : conservé brut.`, [n.id]);
        ajouterPropriete(ctx, n.id, proprieteImport(f, v));
        return [];
      }
      return v;
    };
    const exterieurs = Array.isArray(n.design.exteriorWallIds) ? n.design.exteriorWallIds.filter(estTexte) : [];
    const nonConvertis: ElementNonConverti[] = [];
    const essayer = (f: FamilleNiveau, rang: number, el: unknown, faire: () => void) => {
      ctx.source(FAMILLE_RAPPORT[f], n.lid);
      try {
        faire();
      } catch (e) {
        const motif = e instanceof Error ? e.message : String(e);
        nonConvertis.push({ famille: f, rang, motif, valeur: el });
        ctx.probleme("parametre-invalide", "erreur", `floorDesign.levels.${n.lid}.${f}[${rang}] non converti (${motif}) : conservé brut sur le niveau.`, [n.id], { chemin: `floorDesign.levels.${n.lid}.${f}[${rang}]`, niveauId: n.id });
      }
    };

    // Murs
    tab("walls").forEach((el, rang) =>
      essayer("walls", rang, el, () => {
        const src = exiger(el, estObjet, "mur");
        const id = ctx.id(exiger(src.id, estTexte, "id"));
        const cal = calqueDe(src, n, id);
        const a = pl(exiger(src.a, estPoint2, "a"));
        const b = pl(exiger(src.b, estPoint2, "b"));
        const typeSource = src.type;
        const typeId = ctx.definition("mur", estTexte(typeSource) && typeSource !== "" ? typeSource : ID_NON_TYPE);
        const consommes = ["id", "a", "b", "thickness", "height", "name", ...(estTexte(typeSource) && typeSource !== "" ? ["type"] : []), ...cal.consommes, ...kindConsomme(src, "walls")];
        const annotations: Record<string, Tracabilite> = {};
        if (src.lineRef !== "axe") {
          annotations.alignement = { provenance: "regle", statut: "a-verifier", note: `lineRef ${src.lineRef === undefined ? "absent" : `« ${String(src.lineRef)} »`} : alignement « axe » retenu par règle (tracé du prototype sur a–b)` };
          ctx.probleme("valeur-a-verifier", "information", `Mur ${id} : lineRef ${src.lineRef === undefined ? "absent" : "inconnu"}, alignement « axe » à vérifier.`, [id], { niveauId: n.id });
        }
        ctx.ajouter(
          objet<"mur">({
            id,
            classe: "mur",
            niveauId: n.id,
            ...(cal.calqueId ? { calqueId: cal.calqueId } : {}),
            definitionId: typeId,
            params: {
              axe: { a, b },
              epaisseur: longueur(exiger(src.thickness, estNombre, "thickness")),
              hauteur: longueur(exiger(src.height, estNombre, "height")),
              alignement: "axe",
              typeId,
              exterieur: exterieurs.includes(src.id as string),
              ...(estTexte(src.name) ? { nom: src.name } : {}),
            },
            ...(Object.keys(annotations).length ? { annotations } : {}),
            proprietes: [...reste(src, consommes), proprieteImporteur("rang", rang)],
          }),
        );
        murs.set(id, { a, b });
        ctx.cible("murs", "mur", n.lid);
      }),
    );
    // Murs extérieurs : ordre et existence vérifiés, sinon la liste source est conservée telle quelle.
    if (n.design.exteriorWallIds !== undefined) {
      const ordreMurs = tab("walls")
        .filter((w) => estObjet(w) && exterieurs.includes(w.id as string))
        .map((w) => (w as Json).id);
      if (!Array.isArray(n.design.exteriorWallIds) || jsonCanonique(ordreMurs) !== jsonCanonique(n.design.exteriorWallIds)) {
        ajouterPropriete(ctx, n.id, proprieteImport("exteriorWallIds", n.design.exteriorWallIds));
        ctx.probleme("hote-introuvable", "avertissement", `Niveau ${n.lid} : exteriorWallIds cite un mur absent ou dans un autre ordre ; liste source conservée.`, [n.id], { niveauId: n.id });
      }
    } else ajouterPropriete(ctx, n.id, proprieteImporteur("absent.exteriorWallIds", true));

    // Poteaux
    tab("columns").forEach((el, rang) =>
      essayer("columns", rang, el, () => {
        const src = exiger(el, estObjet, "poteau");
        const id = ctx.id(exiger(src.id, estTexte, "id"));
        const cal = calqueDe(src, n, id);
        ctx.ajouter(
          objet<"poteau">({
            id,
            classe: "poteau",
            niveauId: n.id,
            ...(cal.calqueId ? { calqueId: cal.calqueId } : {}),
            params: {
              point: pl(exiger(src.p, estPoint2, "p")),
              formeId: exiger(src.shapeId, estTexte, "shapeId"),
              largeur: longueur(exiger(src.width, estNombre, "width")),
              profondeur: longueur(exiger(src.depth, estNombre, "depth")),
              hauteur: longueur(exiger(src.height, estNombre, "height")),
              angle: angle(exiger(src.angle, estNombre, "angle")),
              ...(estTexte(src.name) ? { nom: src.name } : {}),
              ...(estTexte(src.designStatus) ? { statutConception: src.designStatus } : {}),
            },
            proprietes: [
              ...reste(src, ["id", "p", "shapeId", "width", "depth", "height", "angle", "name", "designStatus", ...cal.consommes, ...kindConsomme(src, "columns")]),
              proprieteImporteur("rang", rang),
            ],
          }),
        );
        ctx.cible("poteaux", "poteau", n.lid);
      }),
    );

    // Baies
    for (const [f, classe] of [
      ["doors", "porte"],
      ["windows", "fenetre"],
    ] as const) {
      tab(f).forEach((el, rang) =>
        essayer(f, rang, el, () => {
          const src = exiger(el, estObjet, classe);
          const id = ctx.id(exiger(src.id, estTexte, "id"));
          const cal = calqueDe(src, n, id);
          const hote = ctx.id(exiger(src.hostWallId, estTexte, "hostWallId"));
          const t = exiger(src.t, estNombre, "t");
          const mur = murs.get(hote);
          const objetMur = ctx.objets.get(hote);
          const memeNiveau = objetMur !== undefined && objetMur.niveauId === n.id;
          const distance = mur && memeNiveau ? longueur(t * Math.hypot(mur.b.x - mur.a.x, mur.b.y - mur.a.y)) : undefined;
          const typeId = ctx.definition(classe, ID_NON_TYPE);
          ctx.ajouter(
            objet<typeof classe>({
              id,
              classe,
              niveauId: n.id,
              ...(cal.calqueId ? { calqueId: cal.calqueId } : {}),
              definitionId: typeId,
              params: {
                murHoteId: hote,
                position: distance ? { t, distance } : { t },
                largeur: longueur(exiger(src.width, estNombre, "width")),
                hauteur: longueur(exiger(src.height, estNombre, "height")),
                allege: longueur(exiger(src.sill, estNombre, "sill")),
                ...(estTexte(src.mark) ? { repere: src.mark } : {}),
                typeId,
              },
              ...(distance ? { annotations: { "position.distance": { provenance: "calcul", statut: "declaree", note: "t × longueur de l'axe du mur hôte" } } } : {}),
              proprietes: [...reste(src, ["id", "hostWallId", "t", "width", "height", "sill", "mark", ...cal.consommes, ...kindConsomme(src, f)]), proprieteImporteur("rang", rang)],
            }),
          );
          if (mur && memeNiveau) {
            ctx.relations.push({ type: "heberge-par", sourceId: id, cibleId: hote, derivee: true }, { type: "heberge", sourceId: hote, cibleId: id, derivee: true });
          } else {
            ctx.probleme("hote-introuvable", "erreur", `${classe === "porte" ? "Porte" : "Fenêtre"} ${id} : mur hôte ${hote} introuvable sur le niveau ${n.lid} ; objet conservé sans relation.`, [id], { niveauId: n.id });
          }
          ctx.cible(FAMILLE_RAPPORT[f], classe, n.lid);
        }),
      );
    }

    // Escaliers
    tab("stairs").forEach((el, rang) =>
      essayer("stairs", rang, el, () => {
        const src = exiger(el, estObjet, "escalier");
        const id = ctx.id(exiger(src.id, estTexte, "id"));
        const cal = calqueDe(src, n, id);
        const consommes = ["id", "name", "a", "b", "width", "baseOffset", "stairGroup", "planReferenceOnly", ...cal.consommes, ...kindConsomme(src, "stairs")];
        const absents: string[] = [];
        const evalNombre = (cle: string, entier: boolean) => {
          const v = src[cle];
          if (v === undefined) return nonEvaluee(`« ${cle} » absent de la source`);
          if (entier ? Number.isInteger(v) && (v as number) >= 0 : estNombre(v)) {
            consommes.push(cle);
            return v as number;
          }
          return nonEvaluee(`« ${cle} » mal formé dans la source (conservé en import.${cle})`);
        };
        const hauteurV = evalNombre("height", false);
        const marches = evalNombre("steps", true);
        const contremarches = evalNombre("risers", true);
        const paillasse = evalNombre("waistThickness", false);
        const nonEval = [["height", hauteurV], ["steps", marches], ["risers", contremarches], ["waistThickness", paillasse]].filter(([, v]) => typeof v !== "number").map(([k]) => k);
        if (nonEval.length) ctx.probleme("valeur-non-evaluee", "information", `Escalier ${id} : ${nonEval.join(", ")} absent(s) de la source → « non évaluée ».`, [id], { niveauId: n.id });
        const annotations: Record<string, Tracabilite> = {};
        let refPlan = false;
        if (typeof src.planReferenceOnly === "boolean") refPlan = src.planReferenceOnly;
        else {
          absents.push("planReferenceOnly");
          if (src.planReferenceOnly !== undefined) consommes.splice(consommes.indexOf("planReferenceOnly"), 1);
          annotations.referencePlanSeulement = { provenance: "regle", statut: "a-verifier", note: "planReferenceOnly absent de la source : false par règle" };
          ctx.probleme("valeur-a-verifier", "information", `Escalier ${id} : planReferenceOnly absent, referencePlanSeulement = false à vérifier.`, [id], { niveauId: n.id });
        }
        const niveauLie = (cle: "sourceLevel" | "targetLevel"): IdObjet | undefined => {
          const v = src[cle];
          if (estTexte(v) && idNiveau.has(v)) {
            consommes.push(cle);
            return idNiveau.get(v);
          }
          return undefined;
        };
        const depart = niveauLie("sourceLevel");
        const arrivee = niveauLie("targetLevel");
        if (!depart || !arrivee) {
          const manque = [!depart ? "départ (sourceLevel)" : "", !arrivee ? "arrivée (targetLevel)" : ""].filter(Boolean).join(" et ");
          ctx.probleme("niveaux-relies-absents", depart || arrivee ? "information" : "avertissement", `Escalier ${id} : niveau de ${manque} absent ou inconnu ; pas de relation « relie » correspondante.`, [id], { niveauId: n.id });
        }
        ctx.ajouter(
          objet<"escalier">({
            id,
            classe: "escalier",
            niveauId: n.id,
            ...(cal.calqueId ? { calqueId: cal.calqueId } : {}),
            params: {
              axe: { a: pl(exiger(src.a, estPoint2, "a")), b: pl(exiger(src.b, estPoint2, "b")) },
              largeur: longueur(exiger(src.width, estNombre, "width")),
              hauteurAFranchir: typeof hauteurV === "number" ? longueur(hauteurV) : hauteurV,
              marches,
              contremarches,
              epaisseurPaillasse: typeof paillasse === "number" ? longueur(paillasse) : paillasse,
              decalageBase: longueur(exiger(src.baseOffset, estNombre, "baseOffset")),
              ...(depart ? { niveauDepartId: depart } : {}),
              ...(arrivee ? { niveauArriveeId: arrivee } : {}),
              ...(estTexte(src.stairGroup) ? { groupe: src.stairGroup } : {}),
              referencePlanSeulement: refPlan,
              ...(estTexte(src.name) ? { nom: src.name } : {}),
            },
            ...(Object.keys(annotations).length ? { annotations } : {}),
            proprietes: [
              ...reste(src, consommes.filter((k) => k !== "stairGroup" || estTexte(src.stairGroup)).filter((k) => k !== "name" || estTexte(src.name))),
              proprieteImporteur("rang", rang),
              ...(absents.length ? [proprieteImporteur("absents", absents)] : []),
            ],
          }),
        );
        if (depart) ctx.relations.push({ type: "relie", sourceId: id, cibleId: depart, role: "depart", derivee: true });
        if (arrivee) ctx.relations.push({ type: "relie", sourceId: id, cibleId: arrivee, role: "arrivee", derivee: true });
        ctx.cible("escaliers", "escalier", n.lid);
      }),
    );

    // Pièces (codes du niveau) puis tracés.
    const rooms = tab("rooms");
    const codes = new Map<string, number>();
    rooms.forEach((r, i) => {
      if (estObjet(r) && estTexte(r.code) && !codes.has(r.code)) codes.set(r.code, i);
    });
    const tracesParPiece = new Map<number, { rang: number; src: Json }[]>();

    tab("paths").forEach((el, rang) =>
      essayer("paths", rang, el, () => {
        const src = exiger(el, estObjet, "tracé");
        const sid = exiger(src.id, estTexte, "id");
        const id = ctx.id(sid);
        const role = exiger(src.role, estTexte, "role");
        const base = ["id", "points", "holes", "role", ...kindConsomme(src, "paths")];
        if (role === "room") {
          const code = (estTexte(src.name) ? src.name : "").split(" · ")[0] ?? "";
          const iPiece = codes.get(code);
          if (iPiece !== undefined) {
            polygoneAvecTrousSource(src.points, src.holes); // validation de la géométrie
            const liste = tracesParPiece.get(iPiece) ?? [];
            liste.push({ rang, src });
            tracesParPiece.set(iPiece, liste);
            ctx.cible("traces", "piece.polygones", n.lid);
            return;
          }
        }
        const { poly, meta: metaTrous } = polygoneAvecTrousSource(src.points, src.holes);
        const cal = calqueDe(src, n, id);
        const techniques = [proprieteImporteur("rang", rang), ...(metaTrous ? [proprieteImporteur("trous", metaTrous)] : [])];
        const commun = { id, niveauId: n.id, ...(cal.calqueId ? { calqueId: cal.calqueId } : {}) };
        if (role === "floor-slab" || role === "roof-slab") {
          const epaisseur = exiger(src.height, estNombre, "height");
          const annotations = {
            epaisseur: {
              provenance: "import",
              statut: "a-verifier",
              note: `height ${String(epaisseur)} m retenu pour la représentation (D-021) ; thickness ${String(src.thickness)} m conservé en import.thickness`,
            } satisfies Tracabilite,
          };
          const proprietes = [...reste(src, [...base, "height", "baseOffset", ...cal.consommes]), ...techniques];
          const decalageBase = longueur(exiger(src.baseOffset, estNombre, "baseOffset"));
          if (role === "floor-slab") {
            ctx.ajouter(objet<"dalle">({ ...commun, classe: "dalle", params: { contour: poly.contour, trous: poly.trous, epaisseur: longueur(epaisseur), decalageBase }, annotations, proprietes }));
          } else {
            ctx.ajouter(
              objet<"toiture">({
                ...commun,
                classe: "toiture",
                params: { contour: poly.contour, trous: poly.trous, type: "plate", epaisseur: longueur(epaisseur), pente: nonEvaluee("pente absente de la source"), decalageBase },
                annotations,
                proprietes,
              }),
            );
          }
          ctx.probleme("valeur-a-verifier", "avertissement", `${role === "floor-slab" ? "Dalle" : "Toiture"} ${id} : épaisseur ${String(epaisseur)} m (représentation) à vérifier ; thickness ${String(src.thickness)} m conservé.`, [id], { niveauId: n.id });
          ctx.cible("traces", role === "floor-slab" ? "dalle" : "toiture", n.lid);
        } else if (role === "room" || role === "core-zone") {
          const classe = role === "room" ? "espace" : "zone";
          ctx.ajouter(
            objet<typeof classe>({
              ...commun,
              classe,
              params: { polygones: [poly], nom: exiger(src.name, estTexte, "name") },
              proprietes: [...reste(src, [...base, "name", ...cal.consommes]), ...techniques],
            }),
          );
          if (role === "room") ctx.probleme("trace-piece-sans-code", "information", `Tracé de pièce ${id} « ${String(src.name)} » sans code de pièce du niveau ${n.lid} : importé comme espace.`, [id], { niveauId: n.id });
          ctx.cible("traces", classe, n.lid);
        } else if (role === "plan-reference") {
          ctx.ajouter(
            objet<"reference-plan">({
              ...commun,
              classe: "reference-plan",
              params: { contour: poly, ...(estTexte(src.name) ? { nom: src.name } : {}) },
              proprietes: [...reste(src, [...base, ...(estTexte(src.name) ? ["name"] : []), ...cal.consommes]), ...techniques],
            }),
          );
          ctx.cible("traces", "reference-plan", n.lid);
        } else {
          const couleurOk = estTexte(src.color) && MOTIF_COULEUR.test(src.color);
          ctx.ajouter(
            objet<"solide">({
              ...commun,
              classe: "solide",
              params: {
                contour: poly.contour,
                trous: poly.trous,
                ferme: exiger(src.closed, (x): x is boolean => typeof x === "boolean", "closed"),
                hauteur: longueur(exiger(src.height, estNombre, "height")),
                decalageBase: longueur(exiger(src.baseOffset, estNombre, "baseOffset")),
                ...(estNombre(src.thickness) ? { epaisseur: longueur(src.thickness) } : {}),
                role,
                ...(estTexte(src.name) ? { nom: src.name } : {}),
                ...(couleurOk ? { couleur: src.color as string } : {}),
              },
              proprietes: [
                ...reste(src, [...base, "closed", "height", "baseOffset", ...(estNombre(src.thickness) ? ["thickness"] : []), ...(estTexte(src.name) ? ["name"] : []), ...(couleurOk ? ["color"] : []), ...cal.consommes]),
                ...techniques,
              ],
            }),
          );
          if (!(ROLES_SOLIDES_CONNUS as readonly string[]).includes(role)) {
            ctx.roles.set(role, [...(ctx.roles.get(role) ?? []), id]);
            ctx.probleme("role-inconnu", "avertissement", `Tracé ${id} : rôle « ${role} » inconnu, importé comme solide avec son rôle conservé.`, [id], { niveauId: n.id });
          }
          ctx.cible("traces", "solide", n.lid);
        }
      }),
    );

    rooms.forEach((el, rang) =>
      essayer("rooms", rang, el, () => {
        const src = exiger(el, estObjet, "pièce");
        const code = estTexte(src.code) ? src.code : undefined;
        const id = ctx.id(`piece-${n.lid}-${code !== undefined && codes.get(code) === rang ? code : `rang${rang}`}`);
        const consommes = ["code", "name", "area", "category", "notes"].filter((k) => src[k] !== undefined && (k === "area" ? estNombre(src[k]) : estTexte(src[k])));
        if (src.level === n.lid) consommes.push("level");
        else if (src.level !== undefined) ctx.probleme("donnee-hors-modele", "avertissement", `Pièce ${id} : level « ${String(src.level)} » ≠ niveau porteur ${n.lid} ; conservé en import.level.`, [id], { niveauId: n.id });
        // Polygones source : repère de la registration 8.19, jamais mélangés au repère du projet (R5, D-021).
        let polygonesSource: PolygoneAvecTrous<PointLocal>[] | undefined;
        if (Array.isArray(src.polygons) && src.polygons.every((p) => estObjet(p) && Object.keys(p).every((k) => k === "points" || k === "holes") && (p.holes === undefined || (Array.isArray(p.holes) && p.holes.every(estListePoints))))) {
          try {
            polygonesSource = src.polygons.map((p) => polygoneAvecTrousSource((p as Json).points, (p as Json).holes, REPERE_PIECES_SOURCE).poly);
            consommes.push("polygons");
          } catch {
            polygonesSource = undefined;
          }
        }
        const etiquette = estPoint2(src.label) ? pl(src.label, REPERE_PIECES_SOURCE) : undefined;
        if (etiquette) consommes.push("label");
        const traces = tracesParPiece.get(rang) ?? [];
        const polygones = traces.map((t) => polygoneAvecTrousSource(t.src.points, t.src.holes).poly);
        const tracesMeta = traces.map((t) => ({
          rang: t.rang,
          champs: cloner(sans(t.src, ["points", "holes"])),
          trous: polygoneAvecTrousSource(t.src.points, t.src.holes).meta,
        }));
        const nom = estTexte(src.name) ? src.name : code !== undefined ? code : `Pièce ${rang}`;
        if (!estTexte(src.name)) ctx.probleme("valeur-non-evaluee", "avertissement", `Pièce ${id} : nom absent de la source.`, [id], { niveauId: n.id });
        const props: Propriete[] = [...reste(src, consommes), proprieteImporteur("rang", rang), proprieteImporteur("traces", tracesMeta)];
        if (!estTexte(src.name)) props.push(proprieteImporteur("absents", ["name"]));
        const aireDecl = estNombre(src.area) ? src.area : undefined;
        ctx.ajouter(
          objet<"piece">({
            id,
            classe: "piece",
            niveauId: n.id,
            params: {
              polygones,
              ...(polygonesSource ? { polygonesSource } : {}),
              ...(code !== undefined ? { code } : {}),
              nom,
              ...(estTexte(src.category) ? { categorie: src.category } : {}),
              ...(aireDecl !== undefined ? { aireDeclaree: aire(aireDecl) } : {}),
              ...(estTexte(src.notes) ? { notes: src.notes } : {}),
              ...(etiquette ? { etiquette } : {}),
            },
            ...(aireDecl !== undefined ? { annotations: { aireDeclaree: { provenance: "prototype", statut: "a-verifier", note: "rooms[].area, antérieure à la révision 8.19 (D-021)" } } } : {}),
            proprietes: props,
          }),
        );
        if (traces.length === 0) {
          ctx.probleme("piece-sans-trace", "avertissement", `Pièce ${id} « ${nom} » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).`, [id], { niveauId: n.id });
        } else {
          const calc = polygones.reduce((s, p) => s + aireAvecTrous(p), 0);
          if (aireDecl !== undefined && Math.abs(calc - aireDecl) > TOLERANCE_ECART_AIRE) {
            ctx.probleme("aire-ecart", "information", `Pièce ${id} : aire déclarée ${String(aireDecl)} m², aire des tracés ${calc.toFixed(3)} m² (écart ${(calc - aireDecl).toFixed(3)} m²) ; aucune correction.`, [id], { niveauId: n.id });
          }
          for (const t of traces) {
            const attendu = `${code ?? ""} · ${nom}`;
            if (t.src.name !== attendu) ctx.probleme("piece-libelle-divergent", "information", `Pièce ${id} : libellé du tracé ${String(t.src.id)} « ${String(t.src.name)} » ≠ « ${attendu} » ; les deux sont conservés.`, [id], { niveauId: n.id });
          }
        }
        ctx.cible("pieces", "piece", n.lid);
      }),
    );

    // Cotations
    tab("dims").forEach((el, rang) =>
      essayer("dims", rang, el, () => {
        const src = exiger(el, estObjet, "cotation");
        const id = ctx.id(exiger(src.id, estTexte, "id"));
        const cal = calqueDe(src, n, id);
        ctx.ajouter(
          objet<"cotation">({
            id,
            classe: "cotation",
            niveauId: n.id,
            ...(cal.calqueId ? { calqueId: cal.calqueId } : {}),
            params: { a: pl(exiger(src.a, estPoint2, "a")), b: pl(exiger(src.b, estPoint2, "b")), decalage: longueur(exiger(src.offset, estNombre, "offset")), references: [], etat: "libre" },
            proprietes: [...reste(src, ["id", "a", "b", "offset", ...cal.consommes, ...kindConsomme(src, "dims")]), proprieteImporteur("rang", rang)],
          }),
        );
        ctx.cible("cotations", "cotation", n.lid);
      }),
    );

    // Textes
    tab("texts").forEach((el, rang) =>
      essayer("texts", rang, el, () => {
        const src = exiger(el, estObjet, "texte");
        const id = ctx.id(exiger(src.id, estTexte, "id"));
        const cal = calqueDe(src, n, id);
        ctx.ajouter(
          objet<"texte">({
            id,
            classe: "texte",
            niveauId: n.id,
            ...(cal.calqueId ? { calqueId: cal.calqueId } : {}),
            params: { position: pl([exiger(src.x, estNombre, "x"), exiger(src.y, estNombre, "y")]), texte: exiger(src.text, estTexte, "text") },
            proprietes: [...reste(src, ["id", "x", "y", "text", ...cal.consommes, ...kindConsomme(src, "texts")]), proprieteImporteur("rang", rang)],
          }),
        );
        ctx.cible("textes", "texte", n.lid);
      }),
    );

    // Tableaux de familles absents : marqués pour une projection fidèle.
    const absentes = FAMILLES_NIVEAU.filter((f) => n.design[f] === undefined);
    if (absentes.length) ajouterPropriete(ctx, n.id, proprieteImporteur("absent.familles", absentes));
    if (nonConvertis.length) ajouterPropriete(ctx, n.id, proprieteImporteur("nonConverti", nonConvertis));
  }

  // --- Parcelle -------------------------------------------------------------
  const parcelSrc = domains.nativeParcel;
  let crsParcelle: string | undefined;
  if (parcelSrc !== undefined) {
    ctx.source("parcelle");
    try {
      const src = exiger(parcelSrc, estObjet, "nativeParcel");
      const crs = exiger(src.crs, estTexte, "crs");
      crsParcelle = crs;
      const sommets = exiger(src.vertices, estListePoints, "vertices").map((p) => pointCadastral(p[0], p[1], crs));
      const setback = estObjet(src.setback) ? src.setback : undefined;
      const recul = setback && estNombre(setback.distance) ? setback.distance : undefined;
      const enveloppe = setback && estListePoints(setback.envelope) && setback.envelope.length >= 3 ? setback.envelope : undefined;
      const identifiants = Array.isArray(src.vertexIds) && src.vertexIds.every((x) => estTexte(x) && x.trim() !== "") ? (src.vertexIds as string[]) : undefined;
      const consommes = [
        "crs",
        "vertices",
        ...["parcelNumber", "commune", "sourceCrs"].filter((k) => estTexte(src[k])),
        ...["area", "officialArea", "correctedAreaPrinted"].filter((k) => estNombre(src[k])),
        ...(identifiants ? ["vertexIds"] : []),
        ...(setback ? ["setback"] : []),
      ];
      const props = reste(src, consommes);
      if (setback) props.push(proprieteImport("setback", sans(setback, [...(recul !== undefined ? ["distance"] : []), ...(enveloppe ? ["envelope"] : [])])));
      const id = ctx.id(`parcelle-${estTexte(src.parcelNumber) ? src.parcelNumber : "1"}`);
      ctx.ajouter(
        objet<"parcelle">({
          id,
          classe: "parcelle",
          params: {
            ...(estTexte(src.parcelNumber) ? { numero: src.parcelNumber } : {}),
            ...(estTexte(src.commune) ? { commune: src.commune } : {}),
            crs,
            ...(estTexte(src.sourceCrs) ? { crsSource: src.sourceCrs } : {}),
            sommetsCadastraux: sommets,
            ...(identifiants ? { identifiantsSommets: identifiants } : {}),
            ...(estNombre(src.area) ? { aire: aire(src.area) } : {}),
            ...(estNombre(src.officialArea) ? { aireOfficielle: aire(src.officialArea) } : {}),
            ...(estNombre(src.correctedAreaPrinted) ? { aireCorrigeeImprimee: aire(src.correctedAreaPrinted) } : {}),
            ...(recul !== undefined ? { recul: longueur(recul) } : {}),
            ...(enveloppe ? { enveloppeRecul: enveloppe.map((p) => pointCadastral(p[0], p[1], crs)) } : {}),
          },
          proprietes: props,
        }),
      );
      ctx.cible("parcelle", "parcelle");
    } catch (e) {
      conserverBrut(ctx, "parcelle", "domains.nativeParcel", parcelSrc, e);
    }
  }

  // --- Emprise --------------------------------------------------------------
  const fp = domains.buildingFootprint;
  if (fp !== undefined) {
    ctx.source("emprise");
    try {
      const src = exiger(fp, estObjet, "buildingFootprint");
      const crs = crsParcelle;
      if (crs === undefined) throw new ErreurConversion("CRS de la parcelle inconnu : sommets non tagués");
      const sommets = exiger(src.vertices, estListePoints, "vertices");
      const rev = Number.isInteger(src.architectureRevision) && (src.architectureRevision as number) >= 0 ? (src.architectureRevision as number) : undefined;
      ctx.ajouter(
        objet<"emprise">({
          id: ctx.id("emprise"),
          classe: "emprise",
          params: { sommetsCadastraux: sommets.map((p) => pointCadastral(p[0], p[1], crs)), ...(rev !== undefined ? { revisionArchitecture: rev } : {}) },
          proprietes: reste(src, ["vertices", ...(rev !== undefined ? ["architectureRevision"] : [])]),
        }),
      );
      ctx.cible("emprise", "emprise");
    } catch (e) {
      conserverBrut(ctx, "emprise", "domains.buildingFootprint", fp, e);
    }
  }

  // --- meta : structure, hypothèses, sources, propriétés de projet --------
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    if (k === "structure") {
      ctx.source("structure");
      try {
        const src = exiger(v, estObjet, "meta.structure");
        const charges: ChargeSurfacique[] = [
          ...(estNombre(src.loadKgM2) ? [{ value: src.loadKgM2, unit: "kg/m²" as const }] : []),
          ...(estNombre(src.loadKNM2) ? [{ value: src.loadKNM2, unit: "kN/m²" as const }] : []),
        ];
        const textes: [string, string][] = [
          ["system", "systeme"],
          ["loadNature", "natureCharge"],
          ["columnRule", "reglePoteaux"],
          ["thicknessStatus", "statutEpaisseur"],
          ["designStatus", "statutConception"],
        ];
        const params: Record<string, unknown> = {};
        const consommes: string[] = [];
        for (const [s, c] of textes) if (estTexte(src[s])) (params[c] = src[s]), consommes.push(s);
        if (estNombre(src.requiredSpanM)) (params.porteeRequise = longueur(src.requiredSpanM)), consommes.push("requiredSpanM");
        if (charges.length) params.charges = charges;
        if (estNombre(src.loadKgM2)) consommes.push("loadKgM2");
        if (estNombre(src.loadKNM2)) consommes.push("loadKNM2");
        if (typeof src.selfWeightIncluded === "boolean") (params.poidsPropreInclus = src.selfWeightIncluded), consommes.push("selfWeightIncluded");
        const id = ctx.id("structure");
        ctx.ajouter(objet<"structureDeclaree">({ id, classe: "structureDeclaree", statut: "a-confirmer", params: params as ObjetDe<"structureDeclaree">["params"], proprietes: reste(src, consommes) }));
        ctx.cible("structure", "structureDeclaree");
        if (estTexte(src.loadNature)) {
          ctx.ajouter(
            objet<"hypothese">({
              id: ctx.id("hypothese-structure.loadNature"),
              classe: "hypothese",
              statut: "a-confirmer",
              params: { code: "structure.loadNature", texte: src.loadNature },
              proprietes: [proprieteImporteur("origine", "floorDesign.meta.structure.loadNature")],
            }),
          );
          ctx.cible("structure", "hypothese");
        }
      } catch (e) {
        conserverBrut(ctx, "structure", "floorDesign.meta.structure", v, e);
      }
    } else if (k === "assumptions" && Array.isArray(v)) {
      v.forEach((h, rang) => {
        ctx.source("hypotheses");
        try {
          if (!Array.isArray(h) || h.length !== 3 || !h.every(estTexte)) throw new ErreurConversion("triplet [code, thème, texte] attendu");
          const [code, theme, texte] = h as [string, string, string];
          ctx.ajouter(objet<"hypothese">({ id: ctx.id(`hypothese-${code}`), classe: "hypothese", statut: "a-confirmer", params: { code, theme, texte }, proprietes: [proprieteImporteur("rang", rang)] }));
          ctx.cible("hypotheses", "hypothese");
        } catch (e) {
          conserverBrut(ctx, "hypotheses", `floorDesign.meta.assumptions[${rang}]`, h, e);
        }
      });
    } else if (k === "sources" && Array.isArray(v)) {
      v.forEach((s, rang) => {
        ctx.source("sources");
        try {
          // Forme courte de la source : triplet [identifiant, fichier, note].
          if (Array.isArray(s) && s.length === 3 && s.every(estTexte)) {
            const [code, fichier, note] = s as [string, string, string];
            ctx.ajouter(
              objet<"source">({
                id: ctx.id(`source-${code}`),
                classe: "source",
                params: { code, fichier },
                proprietes: [proprieteImport("note", note), proprieteImporteur("forme", "triplet"), proprieteImporteur("rang", rang)],
              }),
            );
            ctx.cible("sources", "source");
            return;
          }
          const src = exiger(s, estObjet, "source");
          const code = exiger(src.id, estTexte, "id");
          const champs: [string, string][] = [
            ["file", "fichier"],
            ["title", "titre"],
            ["provided", "fourni"],
            ["use", "usage"],
          ];
          const params: Record<string, unknown> = { code };
          const consommes = ["id"];
          for (const [a, b] of champs) if (estTexte(src[a])) (params[b] = src[a]), consommes.push(a);
          if (typeof src.inspected === "boolean") (params.inspectee = src.inspected), consommes.push("inspected");
          ctx.ajouter(objet<"source">({ id: ctx.id(`source-${code}`), classe: "source", params: params as unknown as ObjetDe<"source">["params"], proprietes: [...reste(src, consommes), proprieteImporteur("rang", rang)] }));
          ctx.cible("sources", "source");
        } catch (e) {
          conserverBrut(ctx, "sources", `floorDesign.meta.sources[${rang}]`, s, e);
        }
      });
    } else {
      ctx.source("proprietes-projet");
      ctx.proprietesProjet.push(proprieteImport(`meta.${k}`, v));
      ctx.cible("proprietes-projet", "propriete");
    }
  }
  for (const k of Object.keys(dataset)) {
    if (k === "domains") continue;
    ctx.source("proprietes-projet");
    ctx.cible("proprietes-projet", "propriete");
  }

  // --- Validation de chaque objet contre l'ontologie ----------------------
  for (const o of ctx.objets.values()) {
    for (const e of validerObjet(o)) ctx.probleme("parametre-invalide", "erreur", `Objet ${o.id} : ${e.chemin} — ${e.message}`, [o.id], { chemin: e.chemin });
  }

  // --- Questions ouvertes ---------------------------------------------------
  const toitures = [...ctx.objets.values()].filter((o): o is ObjetDe<"toiture"> => o.classe === "toiture");
  const epaisses = toitures.filter((t) => t.params.epaisseur.value !== 0.25);
  if (epaisses.length) {
    ctx.questions.push(
      `Tracés « roof-slab » importés comme toitures plates dont l'épaisseur (height) n'est pas 0,25 m : ${epaisses.map((t) => `${t.id} « ${String(nomImport(t))} » (${t.params.epaisseur.value} m)`).join(", ")} — un acrotère doit-il rester une toiture ou devenir un solide / un mur ?`,
    );
  }
  const sansTrace = [...ctx.objets.values()].filter((o): o is ObjetDe<"piece"> => o.classe === "piece" && o.params.polygones.length === 0);
  if (sansTrace.length) ctx.questions.push(`Pièces sans tracé courant (${sansTrace.length}) conservées sans géométrie : ${sansTrace.map((p) => p.id).join(", ")} — les garder ou les retirer (§10.1, point 8 du lot 0) ?`);
  const alignes = [...ctx.objets.values()].filter((o) => o.classe === "mur" && o.annotations?.alignement !== undefined);
  if (alignes.length) ctx.questions.push(`${alignes.length} murs sans lineRef (murs de façade) : alignement « axe » retenu par règle, à confirmer.`);
  const sansRef = [...ctx.objets.values()].filter((o) => o.classe === "escalier" && o.annotations?.referencePlanSeulement !== undefined);
  if (sansRef.length) ctx.questions.push(`${sansRef.length} volées sans planReferenceOnly (${sansRef.map((o) => o.id).join(", ")}) : referencePlanSeulement = false retenu par règle, à confirmer.`);

  // --- Assemblage -----------------------------------------------------------
  const ordreFamilles = (FAMILLES_IMPORT as readonly FamilleImport[]).slice();
  const ordreNiveaux = niveaux.map((n) => n.lid);
  const lignes: LigneRapportImport[] = ordreFamilles.map((f) => {
    const c = ctx.compteurs.get(f)!;
    const parNiveau = c.parNiveau.size ? Object.fromEntries(ordreNiveaux.filter((l) => c.parNiveau.has(l)).map((l) => [l, { ...c.parNiveau.get(l)! }])) : undefined;
    const parClasse = c.parClasse.size ? Object.fromEntries([...c.parClasse.entries()]) : undefined;
    return { famille: f, effectifSource: c.source, effectifCible: c.cible, ...(parNiveau ? { parNiveau } : {}), ...(parClasse ? { parClasseCible: parClasse } : {}), transformations: TRANSFORMATIONS[f] };
  });
  const rolesInconnus: RoleInconnu[] = [...ctx.roles.entries()].map(([role, ids]) => ({ role, effectif: ids.length, objetIds: ids }));
  const catalogue: CatalogueTypes = { version: ctx.definitions.size ? 1 : 0, definitions: Object.fromEntries([...ctx.definitions.entries()]) };
  const sansEmpreinte = {
    projetId: projetId ?? (estTexte(dataset.nativeId) ? dataset.nativeId : estTexte(dataset.exampleId) ? dataset.exampleId : "p118"),
    revision: 0,
    versionOntologie: VERSION_ONTOLOGIE,
    objets: Object.fromEntries([...ctx.objets.entries()]),
    relations: ctx.relations,
    catalogue,
    proprietesProjet: ctx.proprietesProjet,
    supprimes: [] as IdObjet[],
  };
  const empreinte = empreinteModele(sansEmpreinte);
  const modele: EtatModele = { ...sansEmpreinte, empreinte };
  const rapport: RapportImport = {
    source: {
      ...(estTexte(dataset.exampleId) ? { exampleId: dataset.exampleId } : {}),
      ...(estTexte(dataset.sourceVersion) ? { sourceVersion: dataset.sourceVersion } : {}),
      empreinteSource: empreinteSource(dataset),
    },
    lignes,
    rolesInconnus,
    nonImporte: ctx.nonImporte,
    problemes: ctx.problemes,
    questions: ctx.questions,
    empreinte,
  };
  return { modele, rapport };
};

function nomImport(o: ObjetModele): unknown {
  return o.proprietes.find((p) => p.nom === "import.name")?.valeur;
}

function ajouterPropriete(ctx: Import, id: IdObjet, p: Propriete): void {
  const o = ctx.objets.get(id);
  if (o) ctx.objets.set(id, { ...o, proprietes: [...o.proprietes, p] } as ObjetModele);
}

/** Élément hors niveau inconvertible : conservé brut en propriété de projet, problème listé. */
function conserverBrut(ctx: Import, famille: FamilleImport, chemin: string, valeur: unknown, e: unknown): void {
  const motif = e instanceof Error ? e.message : String(e);
  ctx.proprietesProjet.push(proprieteImporteur(`nonConverti.${chemin}`, valeur === undefined ? null : valeur));
  ctx.probleme("parametre-invalide", "erreur", `${chemin} (${famille}) non converti : ${motif} ; conservé brut.`, [], { chemin });
}
