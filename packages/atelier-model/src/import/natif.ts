/**
 * Importeur à sens unique du modèle natif du prototype (format `design.v13` : `registry`, `domains.levels`,
 * `domains.floorDesign`, `domains.nativeParcel`, `domains.buildingFootprint`) vers le modèle typé — cahier des
 * charges, section 6, décision D-002. Rien n'est omis (R7) : chaque famille a une destination, aucun arrondi,
 * et le rapport nomme chaque transformation. Fonction pure, idempotente : le même jeu de données donne le même
 * modèle (identifiants natifs conservés).
 */
import type { Calque, CoordonneeCadastrale, Definition, Hypothese, ModeleAtelier, Niveau, Occurrence, OccurrenceQuelconque, Probleme, Propriete, Relation, SourceProjet } from "../modele.js";
import { modeleVide } from "../modele.js";
import { aireNette } from "../geometrie.js";
import { pt, TOLERANCE_AIRE_ABS, TOLERANCE_AIRE_REL, type Point2, type SommetParcelle } from "../unites.js";

type Brut = Record<string, unknown>;
type Paire = [number, number];

export interface JeuNatif {
  registry?: { id?: string; name?: string; parcel?: string; location?: string } & Brut;
  nativeId?: string;
  domains: {
    levels?: unknown;
    floorDesign?: unknown;
    nativeParcel?: unknown;
    buildingFootprint?: unknown;
    ui?: unknown;
  } & Brut;
}

export interface LigneRapport {
  famille: string;
  destination: string;
  source: number;
  cible: number;
  transformations: string[];
}

export interface RapportImport {
  nativeId: string;
  lignes: LigneRapport[];
  problemes: Probleme[];
  rolesInconnus: string[];
  calquesCrees: string[];
}

const ROLES_CONNUS = new Set(["solid", "room", "clearance", "core-zone", "ramp-retaining-wall", "ramp-guard", "floor-slab", "basement-ramp", "ramp-direction", "roof-slab", "plan-reference", "ramp-drain"]);

const estPaire = (v: unknown): v is Paire => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
const point = (v: unknown, chemin: string): Point2 => {
  if (!estPaire(v)) throw new Error(`import : point attendu à ${chemin}`);
  return pt(v[0], v[1]);
};
const points = (v: unknown, chemin: string): Point2[] => (Array.isArray(v) ? v.map((q, i) => point(q, `${chemin}[${i}]`)) : []);
const trous = (v: unknown, chemin: string): Point2[][] => {
  if (!Array.isArray(v)) return [];
  return v.map((h, i) => {
    const poly = Array.isArray(h) ? h : ((h as Brut)["poly"] ?? (h as Brut)["points"]);
    return points(poly, `${chemin}[${i}]`);
  });
};
const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const chaine = (v: unknown): string | null => (typeof v === "string" ? v : null);
const longueur = (v: unknown) => {
  const n = nombre(v);
  return n === null ? null : { value: n, unit: "m" as const };
};
/** Propriété portant le rang d'un objet dans le jeu natif importé. */
export const RANG_NATIF = "natif:rang";
const importee = (valeur: unknown): Propriete => ({ valeur, provenance: "import", statut: "declaree" });

/** Propriétés d'import : tous les champs du natif non consommés par les paramètres canoniques (R7). */
function restes(brut: Brut, consommes: readonly string[]): Record<string, Propriete> {
  const out: Record<string, Propriete> = {};
  for (const [k, v] of Object.entries(brut)) if (!consommes.includes(k) && v !== undefined) out[`natif:${k}`] = importee(v);
  return out;
}

export function importerModeleNatif(jeu: JeuNatif): { modele: ModeleAtelier; rapport: RapportImport } {
  const nativeId = jeu.nativeId ?? jeu.registry?.id ?? "natif";
  const d = jeu.domains;
  const levelsBrut = Array.isArray(d.levels) ? (d.levels as Brut[]) : [];
  const floor = (typeof d.floorDesign === "object" && d.floorDesign ? d.floorDesign : {}) as Brut;
  const floorLevels = (typeof floor["levels"] === "object" && floor["levels"] ? floor["levels"] : {}) as Record<string, Brut>;
  // Calques : déclarés par niveau dans le prototype (`levels[id].layers`), parfois aussi au niveau du dessin.
  const layersBrut: Record<string, Brut> = { ...((typeof floor["layers"] === "object" && floor["layers"] ? floor["layers"] : {}) as Record<string, Brut>) };
  for (const lv of Object.values(floorLevels)) {
    const lay = lv["layers"];
    if (typeof lay === "object" && lay) for (const [nom, c] of Object.entries(lay as Record<string, Brut>)) if (!layersBrut[nom]) layersBrut[nom] = c;
  }
  const meta = (typeof floor["meta"] === "object" && floor["meta"] ? floor["meta"] : {}) as Brut;

  const modele = modeleVide();
  const niveaux: Record<string, Niveau> = {};
  const objets: Record<string, OccurrenceQuelconque> = {};
  const relations: Record<string, Relation> = {};
  const definitions: Record<string, Definition> = {};
  const calques: Record<string, Calque> = {};
  const problemes: Probleme[] = [];
  const rolesInconnus = new Set<string>();
  const calquesCrees: string[] = [];
  const lignes: LigneRapport[] = [];
  let nPb = 0;
  const probleme = (type: Probleme["type"], objetId: string | null, message: string) => problemes.push({ id: `pb-import-${++nPb}`, type, objetId, message });

  // Calques déclarés
  let ordre = 0;
  for (const [nom, c] of Object.entries(layersBrut)) {
    calques[nom] = { id: nom, nom, couleur: chaine(c["color"]), remplissage: chaine(c["fill"]), visible: c["visible"] !== false, verrouille: c["locked"] === true, ordre: ordre++ };
  }
  const calqueDe = (brut: Brut): string | null => {
    const nom = chaine(brut["layer"]);
    if (nom === null) return null;
    if (!calques[nom]) {
      calques[nom] = { id: nom, nom, couleur: null, remplissage: null, visible: true, verrouille: false, ordre: ordre++ };
      calquesCrees.push(nom);
    }
    return nom;
  };

  // Niveaux
  levelsBrut.forEach((l, i) => {
    const id = chaine(l["id"]);
    if (!id) throw new Error(`import : niveau sans identifiant (index ${i})`);
    niveaux[id] = { id, nom: chaine(l["name"]) ?? id, elevation: nombre(l["elevation"]) ?? 0, hauteur: nombre(l["height"]), ordre: i };
  });
  lignes.push({ famille: "levels", destination: "niveau", source: levelsBrut.length, cible: Object.keys(niveaux).length, transformations: ["altitudes et hauteurs conservées à l'identique"] });

  // Définitions de types de murs rencontrés
  const definitionMur = (type: string | null): string => {
    const id = type === "cloison" || type === "mur" ? type : "non-type";
    if (!definitions[id]) definitions[id] = { id, classe: "mur", nom: id === "non-type" ? "Non typé" : id === "cloison" ? "Cloison" : "Mur", params: {}, version: 1 };
    return id;
  };

  const compteurs = { walls: 0, doors: 0, windows: 0, stairs: 0, columns: 0, rooms: 0, dims: 0, texts: 0, paths: 0 };
  const cibles = { mur: 0, porte: 0, fenetre: 0, escalier: 0, poteau: 0, espace: 0, cotation: 0, texte: 0, dalle: 0, toiture: 0, piece: 0, zone: 0, "reference-plan": 0, solide: 0 };
  let niveauArriveeAbsents = 0;
  let hotesIntrouvables = 0;

  for (const niveau of Object.values(niveaux)) {
    const src = floorLevels[niveau.id];
    if (!src) continue;
    const exterieurs = new Set(Array.isArray(src["exteriorWallIds"]) ? (src["exteriorWallIds"] as string[]) : []);
    const liste = (k: string): Brut[] => (Array.isArray(src[k]) ? (src[k] as Brut[]) : []);

    // Murs
    for (const w of liste("walls")) {
      compteurs.walls++;
      const id = chaine(w["id"]) ?? `${niveau.id}-walls-${compteurs.walls}`;
      const typeId = definitionMur(chaine(w["type"]));
      const o: Occurrence<"mur"> = {
        id,
        classe: "mur",
        niveauId: niveau.id,
        definitionId: typeId,
        calqueId: calqueDe(w),
        groupeId: null,
        phase: null,
        params: {
          a: point(w["a"], `${id}.a`),
          b: point(w["b"], `${id}.b`),
          epaisseur: longueur(w["thickness"]) ?? { value: 0, unit: "m" },
          hauteur: (nombre(w["height"]) ?? 0) > 0 ? longueur(w["height"])! : null,
          niveauHautId: null,
          alignement: "axe",
          exterieur: exterieurs.has(id),
          nom: chaine(w["name"]),
        },
        proprietes: restes(w, ["id", "a", "b", "thickness", "height", "type", "layer", "name"]),
      };
      if (o.params.epaisseur.value <= 0) probleme("import", id, `mur ${id} : épaisseur absente ou nulle dans le prototype, conservée telle quelle (non évaluée)`);
      objets[id] = o;
      cibles.mur++;
    }
    // Ouvertures
    for (const [famille, classe] of [["doors", "porte"], ["windows", "fenetre"]] as const) {
      for (const q of liste(famille)) {
        compteurs[famille]++;
        const id = chaine(q["id"]) ?? `${niveau.id}-${famille}-${compteurs[famille]}`;
        const murHoteId = chaine(q["hostWallId"]) ?? "";
        if (!objets[murHoteId] || objets[murHoteId]!.classe !== "mur") {
          hotesIntrouvables++;
          probleme("hote-introuvable", id, `${classe} ${id} : mur hôte « ${murHoteId} » introuvable — objet conservé`);
        }
        const o: Occurrence<"porte" | "fenetre"> = {
          id,
          classe,
          niveauId: niveau.id,
          definitionId: null,
          calqueId: calqueDe(q) ?? objets[murHoteId]?.calqueId ?? null,
          groupeId: null,
          phase: null,
          params: { murHoteId, position: nombre(q["t"]) ?? 0.5, largeur: longueur(q["width"]) ?? { value: 0, unit: "m" }, hauteur: longueur(q["height"]) ?? { value: 0, unit: "m" }, allege: longueur(q["sill"]), repere: chaine(q["mark"]) },
          proprietes: restes(q, ["id", "hostWallId", "t", "width", "height", "sill", "mark", "layer"]),
        };
        objets[id] = o as OccurrenceQuelconque;
        cibles[classe]++;
      }
    }
    // Escaliers
    for (const s of liste("stairs")) {
      compteurs.stairs++;
      const id = chaine(s["id"]) ?? `${niveau.id}-stairs-${compteurs.stairs}`;
      const arrivee = chaine(s["targetLevel"]);
      const niveauArriveeId = arrivee && niveaux[arrivee] ? arrivee : null;
      if (arrivee && !niveauArriveeId) {
        niveauArriveeAbsents++;
        probleme("niveau-arrivee-absent", id, `escalier ${id} : niveau d'arrivée « ${arrivee} » inconnu — occurrence conservée`);
      }
      const depart = chaine(s["sourceLevel"]);
      const o: Occurrence<"escalier"> = {
        id,
        classe: "escalier",
        niveauId: niveau.id,
        definitionId: null,
        calqueId: calqueDe(s),
        groupeId: null,
        phase: null,
        params: {
          a: point(s["a"], `${id}.a`),
          b: point(s["b"], `${id}.b`),
          largeur: longueur(s["width"]) ?? { value: 0, unit: "m" },
          hauteurAFranchir: longueur(s["height"]) ?? { value: 0, unit: "m" },
          marches: nombre(s["steps"]),
          contremarches: nombre(s["risers"]),
          epaisseurPaillasse: longueur(s["waistThickness"]),
          decalageBase: longueur(s["baseOffset"]) ?? { value: 0, unit: "m" },
          niveauDepartId: depart && niveaux[depart] ? depart : niveau.id,
          niveauArriveeId,
          groupe: chaine(s["stairGroup"]),
          referencePlanSeulement: s["planReferenceOnly"] === true,
          nom: chaine(s["name"]),
        },
        proprietes: restes(s, ["id", "a", "b", "width", "height", "steps", "risers", "waistThickness", "baseOffset", "sourceLevel", "targetLevel", "stairGroup", "planReferenceOnly", "name", "layer"]),
      };
      objets[id] = o;
      cibles.escalier++;
      if (niveauArriveeId) relations[`rel-${id}-relie`] = { id: `rel-${id}-relie`, kind: "relie", sourceId: id, targetId: niveauArriveeId, params: { depart: o.params.niveauDepartId } };
    }
    // Poteaux
    for (const c of liste("columns")) {
      compteurs.columns++;
      const id = chaine(c["id"]) ?? `${niveau.id}-columns-${compteurs.columns}`;
      const o: Occurrence<"poteau"> = {
        id,
        classe: "poteau",
        niveauId: niveau.id,
        definitionId: null,
        calqueId: calqueDe(c),
        groupeId: null,
        phase: null,
        params: {
          point: point(c["p"], `${id}.p`),
          formeId: chaine(c["shapeId"]) ?? "basic-square",
          largeur: longueur(c["width"]) ?? { value: 0, unit: "m" },
          profondeur: longueur(c["depth"]) ?? { value: 0, unit: "m" },
          hauteur: longueur(c["height"]),
          angle: { value: nombre(c["angle"]) ?? 0, unit: "deg" },
          nom: chaine(c["name"]),
          statutConception: chaine(c["designStatus"]),
        },
        proprietes: restes(c, ["id", "p", "shapeId", "width", "depth", "height", "angle", "name", "designStatus", "layer"]),
      };
      objets[id] = o;
      cibles.poteau++;
    }
    // Espaces déclarés (métadonnées `rooms`)
    for (const r of liste("rooms")) {
      compteurs.rooms++;
      const code = chaine(r["code"]);
      const id = `${niveau.id}-espace-${code ?? compteurs.rooms}`;
      const polys = Array.isArray(r["polygons"]) ? (r["polygons"] as Brut[]) : [];
      const o: Occurrence<"espace"> = {
        id,
        classe: "espace",
        niveauId: niveau.id,
        definitionId: null,
        calqueId: null,
        groupeId: null,
        phase: null,
        params: {
          polygones: polys.map((pg, i) => ({ contour: points(pg["points"], `${id}.polygons[${i}]`), trous: trous(pg["holes"], `${id}.polygons[${i}].holes`) })),
          code,
          nom: chaine(r["name"]) ?? code ?? "Espace",
          categorie: chaine(r["category"]),
          aireDeclaree: nombre(r["area"]) === null ? null : { value: nombre(r["area"])!, unit: "m2" },
          notes: chaine(r["notes"]),
          etiquette: estPaire(r["label"]) ? point(r["label"], `${id}.label`) : null,
        },
        proprietes: restes(r, ["level", "code", "name", "area", "category", "notes", "polygons", "label"]),
      };
      objets[id] = o;
      cibles.espace++;
    }
    // Tracés par rôle
    for (const p of liste("paths")) {
      compteurs.paths++;
      const id = chaine(p["id"]) ?? `${niveau.id}-paths-${compteurs.paths}`;
      const role = chaine(p["role"]) ?? "solid";
      const contour = points(p["points"], `${id}.points`);
      const trousP = trous(p["holes"], `${id}.holes`);
      const commun = { niveauId: niveau.id, definitionId: null, calqueId: calqueDe(p), groupeId: null, phase: null };
      const consommes = ["id", "kind", "points", "holes", "role", "layer", "name", "closed"];
      if (role === "floor-slab") {
        objets[id] = { id, classe: "dalle", ...commun, params: { contour, trous: trousP, epaisseur: longueur(p["height"]) ?? { value: 0, unit: "m" }, decalageBase: longueur(p["baseOffset"]) ?? { value: 0, unit: "m" }, nom: chaine(p["name"]) }, proprietes: restes(p, [...consommes, "height", "baseOffset"]) };
        cibles.dalle++;
      } else if (role === "roof-slab") {
        objets[id] = { id, classe: "toiture", ...commun, params: { contour, trous: trousP, type: "plate", epaisseur: longueur(p["height"]) ?? { value: 0, unit: "m" }, pente: null, decalageBase: longueur(p["baseOffset"]) ?? { value: 0, unit: "m" }, nom: chaine(p["name"]) }, proprietes: restes(p, [...consommes, "height", "baseOffset"]) };
        cibles.toiture++;
      } else if (role === "room") {
        const nomComplet = chaine(p["name"]) ?? "";
        const [codeBrut, ...reste] = nomComplet.split(" · ");
        const code = reste.length ? (codeBrut ?? null) : null;
        objets[id] = { id, classe: "piece", ...commun, params: { contour, trous: trousP, code, nom: reste.length ? reste.join(" · ") : nomComplet || "Pièce", categorie: null, aireDeclaree: null, notes: null, etiquette: null }, proprietes: { ...restes(p, consommes), "natif:name": importee(nomComplet) } };
        cibles.piece++;
      } else if (role === "core-zone") {
        objets[id] = { id, classe: "zone", ...commun, params: { contour, trous: trousP, nom: chaine(p["name"]) ?? "Zone", categorie: null }, proprietes: restes(p, consommes) };
        cibles.zone++;
      } else if (role === "plan-reference") {
        objets[id] = { id, classe: "reference-plan", ...commun, params: { contour, trous: trousP, source: null, echelle: null, nom: chaine(p["name"]) }, proprietes: restes(p, consommes) };
        cibles["reference-plan"]++;
      } else {
        if (!ROLES_CONNUS.has(role)) rolesInconnus.add(role);
        objets[id] = {
          id,
          classe: "solide",
          ...commun,
          params: { contour, trous: trousP, ferme: p["closed"] !== false, hauteur: longueur(p["height"]), decalageBase: longueur(p["baseOffset"]) ?? { value: 0, unit: "m" }, epaisseur: longueur(p["thickness"]), role, nom: chaine(p["name"]), couleur: chaine(p["color"]) },
          proprietes: restes(p, [...consommes, "height", "baseOffset", "thickness", "color"]),
        };
        cibles.solide++;
      }
    }
    // Cotations (libres : le prototype ne rattache pas ses cotes)
    for (const dm of liste("dims")) {
      compteurs.dims++;
      const id = chaine(dm["id"]) ?? `${niveau.id}-dims-${compteurs.dims}`;
      objets[id] = { id, classe: "cotation", niveauId: niveau.id, definitionId: null, calqueId: calqueDe(dm), groupeId: null, phase: null, params: { a: point(dm["a"], `${id}.a`), b: point(dm["b"], `${id}.b`), decalage: longueur(dm["offset"]) ?? { value: 0, unit: "m" } }, proprietes: restes(dm, ["id", "kind", "a", "b", "offset", "layer"]) };
      cibles.cotation++;
    }
    for (const t of liste("texts")) {
      compteurs.texts++;
      const id = chaine(t["id"]) ?? `${niveau.id}-texts-${compteurs.texts}`;
      objets[id] = { id, classe: "texte", niveauId: niveau.id, definitionId: null, calqueId: calqueDe(t), groupeId: null, phase: null, params: { position: pt(nombre(t["x"]) ?? 0, nombre(t["y"]) ?? 0), texte: chaine(t["text"]) ?? "" }, proprietes: restes(t, ["id", "kind", "x", "y", "text", "layer"]) };
      cibles.texte++;
    }
    // Clés du niveau natif non consommées (hors familles et exteriorWallIds) → propriétés de projet
    for (const [k, v] of Object.entries(src)) {
      if (["walls", "doors", "windows", "stairs", "columns", "rooms", "paths", "dims", "texts", "exteriorWallIds", "layers", "id", "name", "elevation", "height"].includes(k)) continue;
      if (k === "activeLayer") continue; // état d'affichage (R10)
      modele.proprietes[`natif:levels.${niveau.id}.${k}`] = importee(v);
    }
  }

  // Correspondances espace déclaré ↔ pièces dessinées (même niveau, même code) et écarts d'aire
  for (const e of Object.values(objets)) {
    if (e.classe !== "espace" || !e.params.code) continue;
    const pieces = Object.values(objets).filter((o): o is Occurrence<"piece"> => o.classe === "piece" && o.niveauId === e.niveauId && o.params.code === e.params.code);
    if (pieces.length === 0) {
      probleme("sans-correspondance", e.id, `espace déclaré ${e.params.code} (${e.params.nom}) : aucune pièce dessinée de ce code au niveau ${e.niveauId}`);
      continue;
    }
    for (const pc of pieces) relations[`rel-${e.id}-${pc.id}`] = { id: `rel-${e.id}-${pc.id}`, kind: "correspond-a", sourceId: e.id, targetId: pc.id, params: { code: e.params.code } };
    if (e.params.aireDeclaree) {
      const calculee = pieces.reduce((s, pc) => s + aireNette(pc.params.contour, pc.params.trous), 0);
      const declaree = e.params.aireDeclaree.value;
      if (Math.abs(calculee - declaree) > Math.max(TOLERANCE_AIRE_ABS, TOLERANCE_AIRE_REL * Math.max(calculee, declaree))) {
        probleme("aire-ecart", e.id, `espace ${e.params.code} : aire déclarée ${declaree} m², aire dessinée ${calculee.toFixed(3)} m² — écart à examiner`);
      }
    }
  }
  for (const pc of Object.values(objets)) {
    if (pc.classe !== "piece" || !pc.params.code) continue;
    const a = Object.values(objets).some((o) => o.classe === "espace" && o.niveauId === pc.niveauId && o.params.code === pc.params.code);
    if (!a) probleme("sans-correspondance", pc.id, `pièce dessinée ${pc.params.code} (${pc.params.nom}) : aucun espace déclaré de ce code au niveau ${pc.niveauId}`);
  }

  // Site : parcelle, emprise
  const parcel = (typeof d.nativeParcel === "object" && d.nativeParcel ? d.nativeParcel : null) as Brut | null;
  if (parcel) {
    const crs = chaine(parcel["crs"]) ?? "inconnu";
    const centroid = estPaire(parcel["centroid"]) ? (parcel["centroid"] as Paire) : null;
    const vertices = Array.isArray(parcel["vertices"]) ? (parcel["vertices"] as unknown[]) : [];
    const ids = Array.isArray(parcel["vertexIds"]) ? (parcel["vertexIds"] as unknown[]) : [];
    const origine: CoordonneeCadastrale = { x: centroid?.[0] ?? 0, y: centroid?.[1] ?? 0, frame: "cadastral", crs, unit: "m" };
    const sommets: SommetParcelle[] = vertices.map((v, i) => {
      const [x, y] = estPaire(v) ? v : [0, 0];
      return { id: chaine(ids[i]) ?? `S${i + 1}`, cadastral: { x, y, frame: "cadastral", crs, unit: "m" }, local: pt(x - origine.x, y - origine.y) };
    });
    const aire = nombre(parcel["area"]);
    const aireOff = nombre(parcel["officialArea"]);
    modele.site.parcelle = {
      sommets,
      crs,
      sourceCrs: chaine(parcel["sourceCrs"]),
      origineLocale: origine,
      aire: aire === null ? null : { value: aire, unit: "m2" },
      aireOfficielle: aireOff === null ? null : { value: aireOff, unit: "m2" },
      champs: Object.fromEntries(Object.entries(parcel).filter(([k]) => !["vertices", "vertexIds", "crs", "sourceCrs", "area", "officialArea", "centroid"].includes(k))),
    };
    if (!centroid) probleme("import", null, "parcelle : centroïde absent, origine du repère local posée à (0, 0)");
    lignes.push({ famille: "nativeParcel", destination: "site.parcelle", source: 1, cible: 1, transformations: [`sommets cadastraux (${crs}) conservés, locaux = cadastral − centroïde`, `${Object.keys(modele.site.parcelle.champs).length} champs conservés tels quels`] });
  }
  const footprint = (typeof d.buildingFootprint === "object" && d.buildingFootprint ? d.buildingFootprint : null) as Brut | null;
  if (footprint && Array.isArray(footprint["vertices"])) {
    const origine = modele.site.parcelle?.origineLocale ?? { x: 0, y: 0, frame: "cadastral" as const, crs: "inconnu", unit: "m" as const };
    const sommetsCadastraux: CoordonneeCadastrale[] = (footprint["vertices"] as unknown[]).map((v) => {
      const [x, y] = estPaire(v) ? v : [0, 0];
      return { x, y, frame: "cadastral", crs: origine.crs, unit: "m" };
    });
    modele.site.emprise = { sommets: sommetsCadastraux.map((c) => pt(c.x - origine.x, c.y - origine.y)), sommetsCadastraux, champs: Object.fromEntries(Object.entries(footprint).filter(([k]) => k !== "vertices")) };
    lignes.push({ famille: "buildingFootprint", destination: "site.emprise", source: 1, cible: 1, transformations: ["sommets cadastraux conservés, locaux dérivés par la même transformation que la parcelle"] });
  }

  // Méta : structure, hypothèses, sources, reste
  const structure = typeof meta["structure"] === "object" && meta["structure"] ? (meta["structure"] as Brut) : null;
  if (structure) modele.site.structure = { ...structure, statut: "declaree-a-confirmer" };
  const hypotheses: Hypothese[] = [];
  if (Array.isArray(meta["assumptions"])) {
    for (const h of meta["assumptions"] as unknown[]) {
      if (Array.isArray(h) && h.length >= 3) hypotheses.push({ id: String(h[0]), domaine: String(h[1]), texte: String(h[2]), statut: "a-confirmer" });
      else if (typeof h === "object" && h) hypotheses.push({ id: String((h as Brut)["id"] ?? `H${hypotheses.length + 1}`), domaine: String((h as Brut)["domain"] ?? (h as Brut)["domaine"] ?? ""), texte: String((h as Brut)["text"] ?? (h as Brut)["texte"] ?? JSON.stringify(h)), statut: "a-confirmer" });
    }
  }
  if (structure && typeof structure["loadNature"] === "string") hypotheses.push({ id: "H-structure-charge", domaine: "Structure", texte: `${String(structure["loadKgM2"] ?? "?")} kg/m² — ${structure["loadNature"]}`, statut: "a-confirmer" });
  modele.site.hypotheses = hypotheses;
  const sources: SourceProjet[] = [];
  if (Array.isArray(meta["sources"])) for (const s of meta["sources"] as unknown[]) if (typeof s === "object" && s) sources.push({ id: String((s as Brut)["id"] ?? `S${sources.length + 1}`), champs: s as Brut });
  modele.site.sources = sources;
  for (const [k, v] of Object.entries(meta)) if (!["structure", "assumptions", "sources"].includes(k)) modele.proprietes[`natif:meta.${k}`] = importee(v);
  if (jeu.registry) modele.proprietes["natif:registry"] = importee(jeu.registry);
  for (const [k, v] of Object.entries(floor)) if (!["levels", "layers", "meta"].includes(k)) modele.proprietes[`natif:floorDesign.${k}`] = importee(v);
  // Rang dans le jeu natif (ordre des tableaux du prototype, niveau par niveau) : les lectures qui listent les objets
  // (fiches d'espaces, analyses) gardent l'ordre de l'exemple ; un objet créé ensuite n'a pas de rang et vient après.
  let rang = 0;
  for (const o of Object.values(objets)) o.proprietes[RANG_NATIF] = importee(rang++);

  lignes.push(
    { famille: "walls", destination: "mur", source: compteurs.walls, cible: cibles.mur, transformations: ["types cloison / mur / absent → définitions cloison / mur / non-type", "exteriorWallIds → exterieur", "lineRef, color, kind → propriétés natif:*"] },
    { famille: "doors", destination: "porte", source: compteurs.doors, cible: cibles.porte, transformations: ["t → position", "sill → allege", "mark → repere", hotesIntrouvables ? `${hotesIntrouvables} hôte(s) introuvable(s) conservé(s)` : "tous les hôtes trouvés"] },
    { famille: "windows", destination: "fenetre", source: compteurs.windows, cible: cibles.fenetre, transformations: ["t → position", "sill → allege", "mark → repere"] },
    { famille: "stairs", destination: "escalier", source: compteurs.stairs, cible: cibles.escalier, transformations: ["occurrences par niveau conservées, stairGroup → groupe", "sourceLevel / targetLevel → niveaux, relation relie", niveauArriveeAbsents ? `${niveauArriveeAbsents} niveau(x) d'arrivée inconnu(s)` : "tous les niveaux d'arrivée trouvés"] },
    { famille: "columns", destination: "poteau (building.structure)", source: compteurs.columns, cible: cibles.poteau, transformations: ["p → point, shapeId → formeId"] },
    { famille: "rooms", destination: "espace", source: compteurs.rooms, cible: cibles.espace, transformations: ["area → aireDeclaree (provenance prototype)", "relation correspond-a vers les pièces de même code et niveau"] },
    { famille: "paths · room", destination: "piece", source: cibles.piece, cible: cibles.piece, transformations: ["name « CODE · nom » → code, nom"] },
    { famille: "paths · floor-slab", destination: "dalle", source: cibles.dalle, cible: cibles.dalle, transformations: ["height → epaisseur, baseOffset → decalageBase, structural → natif:structural"] },
    { famille: "paths · roof-slab", destination: "toiture (plate)", source: cibles.toiture, cible: cibles.toiture, transformations: [] },
    { famille: "paths · core-zone", destination: "zone", source: cibles.zone, cible: cibles.zone, transformations: [] },
    { famille: "paths · plan-reference", destination: "reference-plan", source: cibles["reference-plan"], cible: cibles["reference-plan"], transformations: [] },
    { famille: "paths · autres rôles", destination: "solide (role conservé)", source: cibles.solide, cible: cibles.solide, transformations: rolesInconnus.size ? [`rôles inconnus : ${[...rolesInconnus].join(", ")}`] : ["rôles connus seulement"] },
    { famille: "dims", destination: "cotation (libre)", source: compteurs.dims, cible: cibles.cotation, transformations: ["offset → decalage ; non rattachées (le prototype ne rattache pas)"] },
    { famille: "texts", destination: "texte", source: compteurs.texts, cible: cibles.texte, transformations: [] },
    { famille: "layers", destination: "calque", source: Object.keys(layersBrut).length, cible: Object.keys(calques).length, transformations: calquesCrees.length ? [`calques créés d'après les objets : ${calquesCrees.join(", ")}`] : [] },
    { famille: "meta", destination: "site.structure, hypothèses, sources, propriétés natif:meta.*", source: Object.keys(meta).length, cible: Object.keys(meta).length, transformations: ["loadNature « supposée, à confirmer » → hypothèse à confirmer"] },
    { famille: "ui, levels[].activeLayer", destination: "— (état d'affichage, hors modèle, R10)", source: d.ui ? 1 : 0, cible: 0, transformations: [] },
  );

  const resultat: ModeleAtelier = { ...modele, niveaux, objets, relations, definitions, calques, problemes: Object.fromEntries(problemes.map((p) => [p.id, p])) };
  return { modele: resultat, rapport: { nativeId, lignes, problemes, rolesInconnus: [...rolesInconnus], calquesCrees } };
}

/**
 * Transmission de la parcelle (étape 01 → modèle, lot 4) : le domaine `nativeParcel` décidé par
 * `acceptParcel` devient `site.parcelle.definir`, l'emprise déclarée `site.emprise.definir`. Les sommets restent
 * cadastraux (R5) ; l'origine du repère local d'une parcelle déjà définie est conservée (les objets dessinés ne
 * bougent pas), sinon elle est posée au centroïde transmis. Les autres champs sont conservés tels quels.
 */
export function commandesParcelleNative(parcelle: Record<string, unknown>, emprise: readonly unknown[] | null, etat: ModeleAtelier): { type: string; params: Record<string, unknown> }[] {
  const crs = chaine(parcelle["crs"]) ?? "inconnu";
  const vertices = Array.isArray(parcelle["vertices"]) ? (parcelle["vertices"] as unknown[]).filter(estPaire) : [];
  const ids = Array.isArray(parcelle["vertexIds"]) ? (parcelle["vertexIds"] as unknown[]) : [];
  const centroid = estPaire(parcelle["centroid"]) ? (parcelle["centroid"] as Paire) : null;
  const existante = etat.site.parcelle;
  const origineLocale: CoordonneeCadastrale = existante && existante.origineLocale.crs === crs ? existante.origineLocale : { x: centroid?.[0] ?? 0, y: centroid?.[1] ?? 0, frame: "cadastral", crs, unit: "m" };
  const sommets = vertices.map((v, i) => ({ id: chaine(ids[i]) ?? `S${i + 1}`, cadastral: { x: v[0], y: v[1], frame: "cadastral", crs, unit: "m" } }));
  const commandes: { type: string; params: Record<string, unknown> }[] = [
    {
      type: "site.parcelle.definir",
      params: {
        crs,
        sourceCrs: chaine(parcelle["sourceCrs"]),
        origineLocale,
        sommets,
        aire: nombre(parcelle["area"]),
        aireOfficielle: nombre(parcelle["officialArea"]),
        champs: Object.fromEntries(Object.entries(parcelle).filter(([k]) => !["vertices", "vertexIds", "crs", "sourceCrs", "area", "officialArea", "centroid"].includes(k))),
      },
    },
  ];
  const sommetsEmprise = (emprise ?? []).filter(estPaire);
  if (sommetsEmprise.length >= 3) commandes.push({ type: "site.emprise.definir", params: { sommetsCadastraux: sommetsEmprise.map((v) => ({ x: v[0], y: v[1], frame: "cadastral", crs, unit: "m" })), champs: {} } });
  return commandes;
}
