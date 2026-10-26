import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "../document-2d.js";
import { exportStudioIfc } from "../ifc.js";
import { lireDxfStudio, STUDIO_DXF_UNITES } from "../import-dxf.js";
import { dxf, ligne, lwpolyligne } from "../import-dxf.fixtures.js";
import { exactSynthetique } from "../exacts.fixtures.js";
import {
  controlerCapacitesParSens, controlerMatriceEchanges, STUDIO_CAPACITES_PAR_SENS, STUDIO_COUVERTURE_EXPORT, STUDIO_SENS_CAPACITE, STUDIO_DECISIONS_RENONCEMENT, STUDIO_MATRICE_ECHANGES, STUDIO_STATUT_DE_RAISON, studioCouvertureFormat,
  studioDeclareConformite, studioMatriceEchangesMarkdown, studioTextesEntree,
  type StudioEntreeEchange, type StudioPreuveEchange,
} from "./matrice-echanges.js";
import { STUDIO_CAPACITES_EXPORT, STUDIO_FORMATS_ECHANGE, STUDIO_RAISONS_FIDELITE, studioRapportFidelite } from "./rapport-fidelite.js";

/**
 * Matrice d'échanges (E.6-01 à E.6-05) : cohérence interne, recoupement avec le rapport de fidélité et la sortie IFC
 * réelle, empreinte épinglée par révision, et relecture du dépôt — chaque preuve citée existe et est discriminante,
 * chaque écrivain, route de fichier et téléchargement Studio a son entrée.
 * Document généré : `STUDIO_MATRICE_ECRIRE=1 npx vitest run matrice-echanges` le réécrit (changement délibéré).
 */

const RACINE = fileURLToPath(new URL("../../../../../", import.meta.url));
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");
const DOC_MD = "docs/ai-team/reports/claude-v9-e6/MATRICE-ECHANGES.md";
const livrees = STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "livre");
const preuves = (e: StudioEntreeEchange) => [...(e.preuves?.code ?? []), ...(e.preuves?.tests ?? []), ...(e.preuves?.routes ?? []), ...(e.preuves?.interfaces ?? [])];
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const entree = (id: string) => STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.id === id)!;

function fichiers(dossier: string, filtre: (f: string) => boolean): string[] {
  const out: string[] = [];
  const parcourir = (rel: string) => {
    for (const nom of readdirSync(join(RACINE, rel))) {
      const r = `${rel}/${nom}`;
      if (statSync(join(RACINE, r)).isDirectory()) parcourir(r);
      else if (filtre(r)) out.push(r);
    }
  };
  parcourir(dossier);
  return out.sort();
}
const sourcesNonTest = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.fixtures\.ts$/.test(f);
const fonctionsExportees = (texte: string) => [...texte.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]!);
const cites = (type: "code" | "routes" | "interfaces") => livrees.flatMap((e) => e.preuves?.[type] ?? []);

describe("Matrice d'échanges : donnée versionnée et cohérente", () => {
  it("contrôle interne sans problème ; gelée ; schéma et révision", () => {
    expect(controlerMatriceEchanges()).toEqual([]);
    expect(Object.isFrozen(STUDIO_MATRICE_ECHANGES) && Object.isFrozen(STUDIO_MATRICE_ECHANGES.entrees) && Object.isFrozen(STUDIO_MATRICE_ECHANGES.entrees[0])).toBe(true);
    expect(STUDIO_MATRICE_ECHANGES).toMatchObject({ schema: "studio-matrice-echanges/1", conformite: "non-evaluee" });
    expect(STUDIO_MATRICE_ECHANGES.revision).toBeGreaterThanOrEqual(1);
  });

  it("le contrôle relève une conformité déclarée, un livré sans test, un report sans raison, un renoncé sans décision Studio", () => {
    const base = livrees[0]!;
    const m = (entrees: StudioEntreeEchange[]) => ({ ...STUDIO_MATRICE_ECHANGES, entrees: [...STUDIO_MATRICE_ECHANGES.entrees, ...entrees] });
    expect(controlerMatriceEchanges(m([{ ...base, id: "x1", limite: "Fichier conforme à la norme." }]))).toContain("x1 : conformité déclarée");
    expect(controlerMatriceEchanges(m([{ ...base, id: "x2", preuves: { code: base.preuves!.code, tests: [] } }]))).toContain("x2 : entrée livrée sans code ou sans test");
    const report = STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.statut === "non-livre")!;
    expect(controlerMatriceEchanges(m([{ ...report, id: "x3", raison: "" }]))).toContain("x3 : report sans raison");
    // D-179 (Atelier P2) citée en source ou en décision ne vaut pas : seule une décision Studio admise vaut.
    expect(STUDIO_DECISIONS_RENONCEMENT).toEqual([]);
    expect(controlerMatriceEchanges(m([{ ...report, id: "x4", statut: "renonce", sources: [{ reference: "docs/atelier/decisions.md, D-179" }] }]))).toContain("x4 : renoncé sans décision Studio admise");
    expect(controlerMatriceEchanges(m([{ ...report, id: "x5", statut: "renonce", decision: "D-179" }]))).toContain("x5 : renoncé sans décision Studio admise");
  });

  it("conformité déclarée : tous les champs texte relus, proposition par proposition, négation tolérée seulement juste avant le mot", () => {
    for (const piege of ["Conformité IFC4X3 garantie.", "Fichier conforme à IFC4X3 ; jamais certifié.", "Export défini conforme à ISO 10303-21", "Compliant",
      "Certifié IFC", "Homologué par le bureau", "Testé, jamais une fois non audité, mais conforme", "non évalué, conforme à R12", "Conformité non évaluée"]) {
      expect(studioDeclareConformite(piege), piege).toBe(true);
    }
    for (const sain of ["Aucune conformité PDF/A déclarée.", "testé, jamais certifié", "Décrit le fichier (jamais certifié) : exact", "ni conforme ni certifié", "Non conforme", "no compliance claimed", "Plan 2D seulement"]) {
      expect(studioDeclareConformite(sain), sain).toBe(false);
    }
    const base = livrees[0]!;
    const m = (e: StudioEntreeEchange) => controlerMatriceEchanges({ ...STUDIO_MATRICE_ECHANGES, entrees: [...STUDIO_MATRICE_ECHANGES.entrees, e] });
    expect(m({ ...base, id: "y1", versionFormat: "Conformité IFC4X3 garantie." })).toContain("y1 : conformité déclarée");
    expect(m({ ...base, id: "y2", objet: "Export défini conforme à ISO 10303-21" })).toContain("y2 : conformité déclarée");
    expect(m({ ...base, id: "y3", entites: [{ entite: "LINE", couverture: "portee", detail: "Compliant" }] })).toContain("y3 : conformité déclarée");
    expect(m({ ...base, id: "y4", controle: "Fichier conforme à IFC4X3 ; jamais certifié." })).toContain("y4 : conformité déclarée");
    const report = STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.statut === "non-livre")!;
    expect(m({ ...report, id: "y5", raison: "Reporté ; format homologué." })).toContain("y5 : conformité déclarée");
    expect(m({ ...report, id: "y6", sources: [{ reference: "Plan", commentaire: "Conformité garantie" }] })).toContain("y6 : conformité déclarée");
    // Chaque entrée réelle : aucun texte ne déclare de conformité.
    for (const e of STUDIO_MATRICE_ECHANGES.entrees) expect(studioTextesEntree(e).filter(studioDeclareConformite), e.id).toEqual([]);
  });

  it("révision : l'empreinte des entrées est épinglée par révision (modifier une entrée sans incrémenter la révision échoue)", () => {
    /** Empreinte SHA-256 des entrées et de la couverture de chaque révision (ajouter la ligne de la nouvelle révision). */
    const EMPREINTES: Readonly<Record<number, string>> = {
      2: "2be9a875025eda0b2b9a28f5365c2c466d95f0943a2ce7d878499d380c568c92",
      // Lot F3 (2026-10-25) : import IFC et modèle externe livrés, « ifc-lecture » retiré des reports, éléments non natifs à l'import DXF.
      3: "8f2308d0949b5465baeb43d256547d3153874825149e6d9b3e82f0c2b704b7b8",
      // Lot F2 : catégorie « exacts » (solides exacts, non couverts par SVG / DXF / IFC).
      4: "46bee5f95b4b04bd2cd1e24a1b2c7ae00a5cbdcde8d7a687722778d43479f373",
      // Réserve G1 (P-11) : relevé de performances versionné studio-releve-perf/1 (schéma et contrôle controlerRelevePerf).
      5: "4c5677dd684219719e9f56d31c9ef0f53bb8059f12074f66daedba13ab668ec4",
      // Lot F (décision P-12) et lot PUB : illustration archivée depuis une vue (PNG « fadi:illustration », non vérifiée) ;
      // BCF 2.1 minimal des observations livré (import et export), paquet de publication d'un dossier de conception ;
      // lot REND : couverture SVG / DXF / IFC des graphismes (EX-055), provenance des sources et des modèles externes (EX-014).
      6: "eac31b5dcf978f90d43ea3d7a6258164f4535af532e17c08f2c6a749df4e24fa",
      // Lot OUT (EX-034) : profil d’outils exporté et importé (fadi-studio-profil/1).
      7: "da45ee1baee0b0a8b15dad3128d40f9cb5ddc884aea22a36b10ce269176efbe0",
      // Lot G3 (E.6-04, EX-079) : exports OBJ, STL et STEP livrés (lectures non livrées, chacune sa raison), DWG cité par
      // la décision approuvée D-179 et gardé « non livré » ; capacités par sens d'échange (comprises dans l'empreinte).
      8: "1d67801935927a94c7a3bfed825c4cd2e63a08faaada7fd9942d4ca0b27b4dd0",
      // Lot G2 (EX-027, INV-013) : échelle d’accès (architecture.ladder : SVG / DXF en plan, IFC IfcStair .LADDER. exact) ;
      // catégorie « cotesFaces » (cotes de faces 3D, écrites dans aucun format).
      9: "7f7e636bf4c023b2fa10bc992b666b8a76e1e1c10027037abbc52434e125d6ae",
      // Lot W3-A (X.1-01) : blocs définis par l'utilisateur (BLOCK / INSERT en DXF, lus et écrits ; insertions développées
      // en SVG ; hors IFC) et contraintes géométriques (écrites dans aucun format).
      10: "2d49765192412217c8d40b522ae46a6dc855a27aa0627b1d856c0035db7d9d66",
      // Lot W3-B (X.1-04) : poteau, poutre, dalle (architecture : SVG / DXF en plan, IFC IfcColumn / IfcBeam / IfcSlab exacts) ;
      // catégories « niveaux » (IfcBuildingStorey réel), « composants » (type partagé) et « occurrences » (IfcMappedItem).
      11: "80bfbd30d7aebb34f5dc435fccb79a8829b244cd7d45feb83a11eb85eef22805",
    };
    // Depuis la révision 8, l'empreinte couvre aussi les capacités par sens d'échange (EX-079).
    const capacites = STUDIO_MATRICE_ECHANGES.revision >= 8 ? { capacites: STUDIO_CAPACITES_PAR_SENS } : {};
    const empreinte = createHash("sha256").update(JSON.stringify({ entrees: STUDIO_MATRICE_ECHANGES.entrees, couverture: STUDIO_COUVERTURE_EXPORT, statuts: STUDIO_STATUT_DE_RAISON, ...capacites })).digest("hex");
    expect(empreinte, `révision ${STUDIO_MATRICE_ECHANGES.revision} : entrées modifiées sans nouvelle révision ? (empreinte calculée ${empreinte})`).toBe(EMPREINTES[STUDIO_MATRICE_ECHANGES.revision]);
    expect(Math.max(...Object.keys(EMPREINTES).map(Number)), "la révision courante est la dernière épinglée").toBe(STUDIO_MATRICE_ECHANGES.revision);
  });

  // Libellé cité tel quel par le registre (E.6-05) : depuis le lot PUB, BCF est livré (contrat 2.1 minimal) et depuis le
  // lot G3, les exports OBJ, STL et STEP le sont (test « E.6-04 — OBJ, STL et STEP exportés… » plus bas) ; ce contrôle
  // garde les formats et les sens encore reportés. Citation du registre à actualiser par l'orchestrateur.
  it("E.6-04 / E.6-05 : DWG, DGN, BCF, STEP, OBJ, STL inscrits dans les deux sens, glTF en export, jamais livrés ni conformes", () => {
    for (const sens of ["import", "export"]) expect(entree(`bcf-${sens}`).statut, "BCF : qualifié séparément (lot PUB)").toBe("livre");
    const reportes = [...["dwg", "dgn"].flatMap((id) => [`${id}-import`, `${id}-export`]), "step-import", "obj-import", "stl-import"];
    for (const id of reportes) {
      const e = STUDIO_MATRICE_ECHANGES.entrees.find((x) => x.id === id);
      expect(e?.statut, id).toBe("non-livre");
      expect(e?.raison).toBeTruthy();
      expect(e?.preuves).toBeUndefined();
    }
    for (const id of ["maquette-step", "maquette-obj", "maquette-stl"]) expect(entree(id).statut, id).toBe("livre");
    expect(entree("gltf-export").statut).toBe("non-livre");
    // D-179 (décision approuvée) est citée pour DWG, jamais contournée : DWG reste « non livré », jamais « renoncé » sans
    // décision Studio admise, jamais livré.
    const dwg = entree("dwg-export");
    expect(dwg.sources[0]!.reference).toBe("docs/atelier/decisions.md, D-179");
    expect(dwg.raison).toMatch(/décision approuvée D-179/);
    expect(STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "renonce")).toEqual([]);
  });

  it("E.6-04 — OBJ, STL et STEP exportés, chacun son contrat (version, entités portées / partielles / absentes, limite, route, preuves de code, de test et d'interface) ; leurs lectures non livrées, chacune sa raison ; DWG non livré selon D-179", () => {
    const contrats = new Map<string, string>();
    for (const [id, f] of [["maquette-obj", "obj"], ["maquette-stl", "stl"], ["maquette-step", "step"]] as const) {
      const e = entree(id);
      expect(e).toMatchObject({ statut: "livre", sens: "export", export3d: f, route: `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=${f}` });
      expect(e.fidelite).toBeUndefined();
      expect(new Set(e.entites.map((x) => x.couverture)).has("absente"), `${id} : ce qui n'est pas écrit est déclaré`).toBe(true);
      expect(e.preuves!.code.length && e.preuves!.tests.length && e.preuves!.routes?.length && e.preuves!.interfaces?.length).toBeTruthy();
      contrats.set(id, `${e.versionFormat}|${e.limite}`);
      const lecture = entree(`${f}-import`);
      expect(lecture.statut).toBe("non-livre");
      expect(lecture.raison).toMatch(/^Lecture non livrée/);
    }
    expect(new Set(contrats.values()).size, "un contrat propre par format").toBe(3);
    expect(entree("maquette-step").versionFormat).toMatch(/AP214/);
    expect(entree("maquette-step").limite).toMatch(/SI_UNIT \.MILLI\. \.METRE\./);
    expect(entree("maquette-stl").limite).toMatch(/ni unité .*ni identité, ni calque/);
    // Une entrée d'export 3D sans entités, ou liée à un rapport de fidélité, est refusée par le contrôle.
    const sans = { ...STUDIO_MATRICE_ECHANGES, entrees: STUDIO_MATRICE_ECHANGES.entrees.map((e) => (e.id === "maquette-obj" ? { ...e, entites: [] } : e)) };
    expect(controlerMatriceEchanges(sans)).toContain("maquette-obj : export 3D hors d’une entrée d’export livrée avec ses entités");
    const deux = { ...STUDIO_MATRICE_ECHANGES, entrees: STUDIO_MATRICE_ECHANGES.entrees.map((e) => (e.id === "maquette-stl" ? { ...e, export3d: "obj" as const } : e)) };
    expect(controlerMatriceEchanges(deux)).toContain("format obj : 2 entrée(s) d'export 3D (1 attendue)");
    for (const sens of ["import", "export"]) {
      const d = entree(`dwg-${sens}`);
      expect(d.statut).toBe("non-livre");
      expect(d.sources.map((x) => x.reference)).toContain("docs/atelier/decisions.md, D-179");
    }
  });

  it("E.6-04 — chaque format est qualifié séparément selon son propre contrat : BCF livré (contrat 2.1 minimal, preuves de code, de test et de route, dans les deux sens), DWG / STEP / OBJ / STL non livrés chacun avec sa raison et ses sources, aucun déclaré conforme", () => {
    for (const sens of ["import", "export"] as const) {
      const b = entree(`bcf-${sens}`);
      expect(b.statut).toBe("livre");
      expect(b.versionFormat).toMatch(/2\.1/);
      expect(b.limite).toMatch(/contexte|Contrat minimal/);
      expect(b.preuves?.code.length && b.preuves.tests.length && b.preuves.routes?.length).toBeTruthy();
    }
    expect(STUDIO_MATRICE_ECHANGES.entrees.some((e) => e.id === "bcf-import" && e.limite.includes("même Guid venu d’un autre contexte"))).toBe(true);
    const raisons = new Set<string>();
    for (const id of ["dwg", "step", "obj", "stl"]) {
      const e = entree(`${id}-import`);
      expect(e.statut).toBe("non-livre");
      expect(e.sources.length).toBeGreaterThan(0);
      raisons.add(e.raison!);
    }
    expect(raisons.size, "une raison propre par format").toBe(4);
    expect(STUDIO_MATRICE_ECHANGES.conformite).toBe("non-evaluee");
  });

  it("TR-EX-079 : lecture, consultation, édition, export et aller-retour évalués séparément pour chaque format ; chaque entrée rangée sous un format", () => {
    expect(controlerCapacitesParSens()).toEqual([]);
    expect([...STUDIO_SENS_CAPACITE]).toEqual(["lecture", "consultation", "edition", "export", "aller-retour"]);
    for (const c of STUDIO_CAPACITES_PAR_SENS) expect(Object.keys(c.sens).sort(), c.id).toEqual([...STUDIO_SENS_CAPACITE].sort());
    const cap = (id: string) => STUDIO_CAPACITES_PAR_SENS.find((c) => c.id === id)!.sens;
    // Formats distingués : IFC lu, consulté (modèle externe), édité en partie, exporté, aller-retour partiel ; SVG,
    // OBJ, STL, STEP exportés seulement ; DWG rien.
    expect(STUDIO_SENS_CAPACITE.map((x) => cap("ifc")[x].statut)).toEqual(["livre", "livre", "livre", "livre", "livre"]);
    for (const id of ["svg", "obj", "stl", "step"]) expect(STUDIO_SENS_CAPACITE.map((x) => cap(id)[x].statut), id).toEqual(["non-livre", "non-livre", "non-livre", "livre", "non-livre"]);
    expect(STUDIO_SENS_CAPACITE.every((x) => cap("dwg")[x].statut === "non-livre")).toBe(true);
    expect(cap("dwg").export.detail).toMatch(/D-179/);
    // Les sens ne se confondent pas : la lecture d'un profil ou d'une archive est livrée, leur consultation non.
    expect([cap("archive").lecture.statut, cap("archive").consultation.statut]).toEqual(["livre", "non-livre"]);
    expect(cap("commandes").export.statut).toBe("non-livre");
  });

  it("TR-EX-079 [−] : un export syntaxiquement valide ne prouve pas un aller-retour — aller-retour déclaré sans lecture, sans export ou sans test refusé", () => {
    const avec = (id: string, sens: "aller-retour" | "consultation" | "lecture" | "export", ev: { statut: "livre" | "non-livre"; detail: string; preuves?: StudioPreuveEchange[] }) =>
      STUDIO_CAPACITES_PAR_SENS.map((c) => (c.id === id ? { ...c, sens: { ...c.sens, [sens]: ev } } : c));
    const test = { fichier: "packages/atelier-model/src/studio/export-3d.test.ts", motif: "E.6-04 STEP : une pièce nommée par élément solide" };
    // STEP : export valide relu par le noyau, mais aucun lecteur Studio : l'aller-retour est refusé même avec un test.
    expect(controlerCapacitesParSens(STUDIO_MATRICE_ECHANGES, avec("step", "aller-retour", { statut: "livre", detail: "relu par le noyau", preuves: [test] }))).toContain("step : aller-retour livré sans lecture livrée");
    // Aller-retour sans test cité : refusé.
    expect(controlerCapacitesParSens(STUDIO_MATRICE_ECHANGES, avec("dxf", "aller-retour", { statut: "livre", detail: "relu" }))).toContain("dxf : aller-retour livré sans test cité");
    // Lecture ou export déclarés contre la matrice : refusés.
    expect(controlerCapacitesParSens(STUDIO_MATRICE_ECHANGES, avec("svg", "lecture", { statut: "livre", detail: "lu" }))).toContain("svg : lecture livre alors qu’une entrée d’import livrée manque");
    expect(controlerCapacitesParSens(STUDIO_MATRICE_ECHANGES, avec("obj", "export", { statut: "non-livre", detail: "rien" }))).toContain("obj : export non-livre alors qu’une entrée d’export livrée existe");
    // Conformité affirmée dans une évaluation : refusée.
    expect(controlerCapacitesParSens(STUDIO_MATRICE_ECHANGES, avec("ifc", "consultation", { statut: "livre", detail: "Consultation certifiée", preuves: [test] }))).toContain("ifc : consultation déclare une conformité");
    // Entrée de la matrice rangée sous aucun format, ou sous deux.
    const sansIfc = STUDIO_CAPACITES_PAR_SENS.map((c) => (c.id === "ifc" ? { ...c, entrees: c.entrees.filter((e) => e !== "modele-externe-ifc") } : c));
    expect(controlerCapacitesParSens(STUDIO_MATRICE_ECHANGES, sansIfc)).toContain("modele-externe-ifc : rangée sous aucun format");
  });

  it("E.6-02 : natif, vues / feuilles, tableaux, rendus et paquets présents et livrés", () => {
    const familles = new Set(livrees.map((e) => e.famille));
    for (const f of ["natif", "dessin", "maquette", "feuille", "dossier", "tableau", "rendu", "paquet"]) expect(familles.has(f as never), f).toBe(true);
  });

  it("sources : référence (chemin du dépôt existant) séparée du commentaire en prose", () => {
    for (const e of STUDIO_MATRICE_ECHANGES.entrees) for (const s of e.sources) {
      const chemin = s.reference.split(",")[0]!.trim();
      expect(existsSync(join(RACINE, chemin)), `${e.id} : ${s.reference}`).toBe(true);
      expect(s.reference, `${e.id} : la référence ne porte pas de prose entre parenthèses`).not.toMatch(/[()]/);
    }
  });

  it("limites DXF : $INSUNITS hors R12, 16 codes reconnus à l'import, calque verrouillé bloquant", () => {
    expect(entree("dessin-dxf").limite).toMatch(/\$INSUNITS n’appartient pas à R12 \(variable introduite avec AC1015\) : l’unité n’est pas garantie chez un lecteur R12 strict/);
    expect(Object.keys(STUDIO_DXF_UNITES)).toHaveLength(16);
    const imp = entree("dessin-dxf-import").limite;
    expect(imp).toContain("16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue");
    expect(imp).toContain("un calque déjà verrouillé dans le document");
    expect(imp).toContain("fait échouer l’import");
  });
});

/** Document qui fait rendre au juge chaque raison déclarée et écrire chaque entité IFC déclarée. */
const complet = (): StudioDocument => ({
  id: "doc-matrice", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  layers: [{ id: "murs", name: "Murs", visible: true, locked: false }],
  objects: [
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
    { id: "l2", type: "line", start: { x: 0, y: 1 }, end: { x: 4, y: 1 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } },
    { id: "l3", type: "line", start: { x: 0, y: 3 }, end: { x: 4, y: 3 }, extrusion: { base: 0, height: 2.5 } },
    { id: "r1", type: "rectangle", origin: { x: 1, y: 1 }, width: 2, height: 1 },
    { id: "r2", type: "rectangle", origin: { x: 5, y: 1 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } },
    { id: "c1", type: "circle", center: { x: 8, y: 8 }, radius: 1, extrusion: { base: 0, height: 1 } },
    { id: "c2", type: "circle", center: { x: 12, y: 8 }, radius: 1 },
    { id: "a1", type: "arc", center: { x: 0, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5, extrusion: { base: 0, height: 2, thickness: 0.2 } },
    { id: "a2", type: "arc", center: { x: 5, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5 },
    { id: "a3", type: "arc", center: { x: 10, y: 14 }, radius: 2, startAngle: 0, endAngle: 1.5, extrusion: { base: 0, height: 2 } },
    { id: "p1", type: "polyline", points: [{ x: 20, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 3 }], closed: true, extrusion: { base: 0, height: 1 } },
    { id: "p2", type: "polyline", points: [{ x: 30, y: 0 }, { x: 34, y: 0 }, { x: 34, y: 3 }], closed: false, bulges: [0.5, 0], extrusion: { base: 0, height: 1 } },
    { id: "p3", type: "polyline", points: [{ x: 40, y: 0 }, { x: 44, y: 0 }], closed: false, bulges: [0.3] },
    { id: "p4", type: "polyline", points: [{ x: 50, y: 0 }, { x: 54, y: 0 }], closed: false },
    { id: "p5", type: "polyline", points: [{ x: 70, y: 0 }, { x: 74, y: 0 }, { x: 74, y: 2 }], closed: false, extrusion: { base: 0, height: 1 } },
  ],
  dimensions: [{ id: "d1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: -0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false }],
  annotations: [
    { id: "g1", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 3, y: 0 }, second: { x: 0, y: 3 }, radius: 1, links: { first: null, second: null }, toResolve: false },
    { id: "t1", type: "text", position: { x: 1, y: 5 }, height: 0.3, rotation: 0, content: "Plan RDC", justification: "left" },
    { id: "t2", type: "text", position: { x: 1, y: 6 }, height: 0.3, rotation: 0, content: "Séjour", justification: "center" },
    { id: "t3", type: "text", position: { x: 1, y: 7 }, height: 0.3, rotation: 0, content: "é".repeat(40), justification: "right" },
    { id: "t4", type: "text", position: { x: 1, y: 8 }, height: 0.3, rotation: 0, content: "Escalier 🪜", justification: "left" },
  ],
  solides: [
    { id: "s1", type: "box", placement: { origin: { x: 50, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
    { id: "s2", type: "prism", placement: { origin: { x: 60, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 2 },
  ],
  // Lot G2 (INV-013) : une cote de face 3D sur la boîte s1.
  cotesFaces: [{ id: "cf1", type: "face-dimension", solidId: "s1", faces: ["base", "sommet"], toResolve: false }],
  // Lot F2 : un solide exact (résultat SYNTHÉTIQUE, forme seulement) et ses deux opérandes conservés.
  exacts: [exactSynthetique("e1", [
    { id: "e1a", type: "box", placement: { origin: { x: 80, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
    { id: "e1b", type: "box", placement: { origin: { x: 80.5, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
  ])],
  architecture: [
    { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 20 }, { x: 12, y: 20 }], thickness: 0.2, height: 3, base: 0, justification: "center" },
    { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0, kind: "porte" },
    { id: "o2", type: "opening", hostId: "m1", position: 6, width: 1, height: 1, sill: 1, kind: "fenetre" },
    { id: "o3", type: "opening", hostId: "m1", position: 9.5, width: 1, height: 1, sill: 1 },
    // Lot G2 (EX-027) : échelle d’accès.
    { id: "ech1", type: "ladder", position: { x: 14, y: 20 }, rotation: 0, width: 0.5, height: 3, base: 0, rungs: 9, section: 0.04 },
    // Lot W3-B : éléments structurels typés rattachés à un niveau (valeurs SYNTHÉTIQUES).
    { id: "po1", type: "column", niveauId: "niv1", position: { x: 20, y: 20 }, rotation: 0, width: 0.3, depth: 0.3, height: 3, base: 3 },
    { id: "pt1", type: "beam", niveauId: "niv1", start: { x: 20, y: 20 }, end: { x: 26, y: 20 }, width: 0.2, height: 0.4, base: 5.6 },
    { id: "da1", type: "slab", niveauId: "niv1", contour: [{ x: 20, y: 20 }, { x: 26, y: 20 }, { x: 26, y: 26 }, { x: 20, y: 26 }], thickness: 0.2, base: 6 },
  ],
  // Lot W3-B : niveau, définition de composant et occurrence (géométrie SYNTHÉTIQUE).
  niveaux: [{ id: "niv1", nom: "Étage 1", cote: 3 }],
  composants: [{ id: "cp1", nom: "Gaine", solides: [{ id: "g", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.2, depth: 0.2, height: 3 }] }],
  occurrences: [{ id: "oc1", type: "occurrence", composantId: "cp1", niveauId: "niv1", placement: { origin: { x: 30, y: 20, z: 3 }, rotation: 0 } }],
  proprietes: [
    { cibleId: "m1", nom: "Résistance au feu", valeur: "REI 60", source: "Fiche de recette (synthétique)" },
    { cibleId: "m1", nom: "Isolation" },
  ],
  scenes: [
    { id: "sc1", type: "scene", frame: "local-3d", name: "Vue", camera: { projection: "perspective", position: { x: 10, y: -12, z: 8 }, target: { x: 3, y: 1, z: 1.5 }, fov: 45 }, visibleLayers: ["default"], displayMode: "shaded" },
    { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#c0392b" },
  ],
  nonNatifs: [{ id: "nn1", type: "non-native", origine: { format: "ifc", entite: "IfcColumn" }, raison: "type-sans-equivalent" }],
  // Graphismes (EX-055) : spline, hachure opaque et transparente, symbole opaque et transparent.
  graphismes: [
    { id: "gs1", type: "spline", points: [{ x: 0, y: 30 }, { x: 1, y: 31 }, { x: 2, y: 31 }, { x: 3, y: 30 }] },
    { id: "gh1", type: "hachure", contour: [{ x: 0, y: 32 }, { x: 2, y: 32 }, { x: 2, y: 34 }, { x: 0, y: 34 }], angle: Math.PI / 4, espacement: 0.25 },
    { id: "gh2", type: "hachure", contour: [{ x: 3, y: 32 }, { x: 5, y: 32 }, { x: 5, y: 34 }], angle: 0, espacement: 0.5, opacite: 0.5 },
    { id: "gy1", type: "symbole", symbole: "nord", position: { x: 8, y: 32 }, rotation: 0, echelle: 1 },
    { id: "gy2", type: "symbole", symbole: "croix", position: { x: 10, y: 32 }, rotation: 0.3, echelle: 0.5, opacite: 0.4 },
  ],
  // Source importée (EX-014) : provenance déclarée (empreinte SYNTHÉTIQUE).
  sources: [{ id: "src1", type: "source", format: "dxf", versionFormat: "AC1009", nomFichier: "plan.dxf", empreinteSha256: "0".repeat(64), recuLe: "2026-10-25T10:00:00.000Z", auteur: null, uniteLue: "mm", uniteRetenue: "mm", facteur: 0.001, repereSource: null, transformation: "identite", restrictions: null, objets: 3 }],
  // Lot W3-A (X.1-01) : un bloc défini par l'utilisateur, une insertion, une contrainte (ligne l1 horizontale).
  blocs: [{ id: "bl1", type: "bloc", nom: "Repère", base: { x: 0, y: 0 }, elements: [{ id: "e1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] }],
  insertions: [{ id: "in1", type: "insertion", bloc: "bl1", position: { x: 90, y: 0 }, rotation: 0, echelle: 1 }],
  contraintes: [{ id: "ct1", type: "horizontal", cibles: [{ objet: "l1" }] }],
} as StudioDocument);

describe("E.6-03 : sous-ensemble SVG / DXF / IFC = rapport de fidélité", () => {
  it("mêmes catégories et mêmes types que la table des capacités, pour chaque format", () => {
    for (const f of STUDIO_FORMATS_ECHANGE) {
      const cov = STUDIO_COUVERTURE_EXPORT[f] as unknown as Record<string, Record<string, unknown>>;
      const cap = STUDIO_CAPACITES_EXPORT as unknown as Record<string, Record<string, unknown>>;
      expect(Object.keys(cov).sort(), f).toEqual(Object.keys(cap).sort());
      for (const c of Object.keys(cap)) expect(Object.keys(cov[c]!).sort(), `${f}.${c}`).toEqual(Object.keys(cap[c]!).sort());
    }
  });
  it("chaque raison rendue par le juge est déclarée, chaque raison déclarée est rendue, avec son statut", () => {
    const doc = complet();
    for (const f of STUDIO_FORMATS_ECHANGE) {
      const declare = new Set(studioCouvertureFormat(f).flatMap((c) => c.raisons.map((r) => `${c.categorie}.${c.type}:${r.raison}`)));
      const rapport = studioRapportFidelite(doc, f);
      const observe = new Set(rapport.lignes.map((l) => `${l.categorie}.${l.type}:${l.raison}`));
      for (const l of rapport.lignes) expect(STUDIO_STATUT_DE_RAISON[l.raison], `${f} ${l.raison}`).toBe(l.statut);
      expect([...observe].filter((x) => !declare.has(x)), `${f} : raisons non déclarées`).toEqual([]);
      expect([...declare].filter((x) => !observe.has(x)), `${f} : raisons déclarées jamais rendues`).toEqual([]);
    }
  });
  it("toutes les raisons du rapport ont un statut ; seule « type-sans-capacite » n'est déclarée pour aucun type", () => {
    expect(Object.keys(STUDIO_STATUT_DE_RAISON).sort()).toEqual([...STUDIO_RAISONS_FIDELITE].sort());
    const declarees = new Set(STUDIO_FORMATS_ECHANGE.flatMap((f) => studioCouvertureFormat(f).flatMap((c) => c.raisons.map((r) => r.raison))));
    expect(STUDIO_RAISONS_FIDELITE.filter((r) => !declarees.has(r))).toEqual(["type-sans-capacite"]);
  });
  it("IFC : ligne sans épaisseur et polyligne ouverte droite jugées « surface exacte », pas « extrusion exacte »", () => {
    const r = studioRapportFidelite(complet(), "ifc");
    const ids = (type: string, raison: string) => r.lignes.find((l) => l.type === type && l.raison === raison)?.ids;
    expect(ids("line", "extrusion-exacte")).toEqual(["l2"]);
    expect(ids("line", "surface-exacte")).toEqual(["l3"]);
    expect(ids("polyline", "extrusion-exacte")).toEqual(["p1"]);
    expect(ids("polyline", "surface-exacte")).toEqual(["p5"]);
  });

  it("IFC : les entités et jeux de propriétés déclarés sont exactement ceux que exportStudioIfc écrit", () => {
    const sortie = exportStudioIfc(complet(), { studyName: "Étude", variantName: "Variante", timestamp: "2026-10-19T00:00:00" });
    const lignes = new Map([...sortie.matchAll(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/gm)].map((m) => [m[1]!, { type: m[2]!, args: m[3]! }]));
    const ecritureIfc = entree("maquette-ifc").ecritureIfc!;
    const ecrites = new Set([...lignes.values()].map((l) => l.type));
    const declarees = new Set(ecritureIfc.elements.flatMap((x) => x.entites).map((n) => n.toUpperCase()));
    expect([...ecrites].filter((t) => !declarees.has(t)).sort(), "entités écrites absentes de la matrice").toEqual([]);
    expect([...declarees].filter((t) => !ecrites.has(t)).sort(), "entités déclarées jamais écrites").toEqual([]);
    const jeux = new Set([...lignes.values()].filter((l) => l.type === "IFCPROPERTYSET").map((l) => /^'[^']*',\$,'([^']+)'/.exec(l.args)![1]!));
    expect([...jeux].sort()).toEqual(ecritureIfc.jeuxDeProprietes.map((j) => j.nom).sort());

    // Correspondances déclarées : élément écrit par identifiant Studio, représentation et éléments géométriques.
    const element = (id: string) => [...lignes.values()].find((l) => l.args.startsWith("'") && new RegExp(`^'[^']*',\\$,'${id}',`).test(l.args));
    const representation = (id: string) => {
      const e = element(id)!;
      const forme = /,#(\d+),'[^']*',\.[A-Z]+\.$/.exec(e.args)?.[1];
      if (!forme) return { type: e.type, rep: null as string | null, items: [] as string[] };
      const reps = /\(([^)]*)\)$/.exec(lignes.get(forme)!.args)![1]!.split(",").map((r) => lignes.get(r.slice(1))!);
      const corps = reps.find((r) => r.args.includes("'Body'"))!;
      return { type: e.type, rep: /'Body','(\w+)'/.exec(corps.args)![1]!, items: /\(([^)]*)\)$/.exec(corps.args)![1]!.split(",").map((r) => lignes.get(r.slice(1))!.type) };
    };
    expect(representation("m1")).toEqual({ type: "IFCWALL", rep: "SweptSolid", items: ["IFCEXTRUDEDAREASOLID"] });
    expect(representation("l2")).toEqual({ type: "IFCWALL", rep: "SweptSolid", items: ["IFCEXTRUDEDAREASOLID"] });
    expect(representation("a1")).toMatchObject({ type: "IFCWALL", rep: "SweptSolid" });
    for (const id of ["l3", "a3", "p5"]) expect(representation(id), id).toEqual({ type: "IFCBUILDINGELEMENTPROXY", rep: "Tessellation", items: ["IFCTRIANGULATEDFACESET"] });
    for (const id of ["r2", "c1", "p1", "s1", "s2"]) expect(representation(id), id).toEqual({ type: "IFCBUILDINGELEMENTPROXY", rep: "SweptSolid", items: ["IFCEXTRUDEDAREASOLID"] });
    for (const l of lignes.values()) if (l.type === "IFCBUILDINGELEMENTPROXY" || l.type === "IFCWALL") expect(l.args.endsWith(".NOTDEFINED.")).toBe(true);
    // Porte et fenêtre déclarées : sans représentation propre ; baie sans type : ouverture seule.
    expect(element("o1")!.type).toBe("IFCOPENINGELEMENT");
    for (const [type, id] of [["IFCDOOR", "o1"], ["IFCWINDOW", "o2"]] as const) {
      const r = [...lignes.values()].find((l) => l.type === type && new RegExp(`^'[^']*',\\$,'${id}',\\$,\\$,#\\d+,\\$,`).test(l.args));
      expect(r, `${type} ${id} sans représentation`).toBeTruthy();
    }
    expect([...lignes.values()].filter((l) => l.type === "IFCOPENINGELEMENT")).toHaveLength(3);
    expect([...lignes.values()].filter((l) => l.type === "IFCRELVOIDSELEMENT")).toHaveLength(3);
    expect([...lignes.values()].filter((l) => l.type === "IFCRELFILLSELEMENT")).toHaveLength(2);
    // Les entités nommées dans la limite et les détails sont bien déclarées.
    const textes = [entree("maquette-ifc").limite, ...ecritureIfc.elements.map((x) => x.detail)].join(" ");
    for (const n of textes.match(/\bIfc[A-Z]\w+/g) ?? []) expect(declarees.has(n.toUpperCase()), n).toBe(true);
  });

  it("import DXF : entités déclarées portées, les autres comptées par type", () => {
    const texte = dxf({ insunits: 6, entites: [
      ligne(0, 0, 1, 0),
      "0\r\nCIRCLE\r\n8\r\n0\r\n10\r\n5\r\n20\r\n5\r\n40\r\n1",
      "0\r\nARC\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n2\r\n50\r\n0\r\n51\r\n90",
      lwpolyligne([[0, 0], [2, 0], [2, 1], [0, 1]], { ferme: true }),
      lwpolyligne([[10, 0], [12, 0], [12, 2]], { bulges: [0.5, 0] }),
      "0\r\nTEXT\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n1\r\n1\r\nA",
      "0\r\nINSERT\r\n8\r\n0\r\n2\r\nB\r\n10\r\n0\r\n20\r\n0",
    ] });
    const r = lireDxfStudio(texte);
    expect(r.statut).toBe("pret");
    const types = new Set(r.commandes.filter((c) => c.toolId !== "studio.calque.creer").map((c) => (c.params as { type?: string }).type));
    for (const t of ["line", "circle", "arc", "rectangle", "polyline"]) expect(types.has(t), t).toBe(true);
    expect(r.rapport.nonPris.map((n) => n.type)).toEqual(["INSERT", "TEXT"]);
    const e = entree("dessin-dxf-import");
    for (const nom of ["LINE", "CIRCLE", "ARC", "LWPOLYLINE / POLYLINE 2D"]) expect(e.entites.find((x) => x.entite === nom)?.couverture).not.toBe("absente");
    expect(e.entites.some((x) => x.couverture === "absente" && x.entite.includes("TEXT"))).toBe(true);
    // Lot W3-A (X.1-01) : un INSERT d'un bloc représentable devient une insertion ; celui d'un bloc absent reste compté.
    expect(e.entites.find((x) => x.entite === "BLOCK / INSERT")?.couverture).toBe("partielle");
    expect(() => lireDxfStudio("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(/binaire/);
  });
});

/** Mots-clés JavaScript et mots trop généraux pour prouver une étape : jamais admis comme motif de preuve. */
const MOTS_CLES_JS = new Set("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of".split(" "));
const MOTS_FAIBLES = new Set(["archive", "png", "csv", "dossiers", "rapport", "releve", "files/", "download", "download=", "commands", "/commands"]);
/** Identifiants importés par un fichier (`import { a, b as c } from`). */
const importes = (contenu: string) => new Set([...contenu.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)].flatMap((m) => m[1]!.split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())).filter(Boolean));
/**
 * Motif discriminant d'une preuve de test ou d'interface : au moins 12 caractères, ni mot-clé JS ni mot générique, et
 * soit unique dans le fichier (il ne désigne qu'une étape), soit identifiant importé par le fichier (le test exerce ce
 * symbole). Rend la raison du refus, ou null.
 */
function nonDiscriminant(x: StudioPreuveEchange, contenu: string): string | null {
  const m = x.motif.trim();
  if (m.length < 12) return "trop court";
  if (MOTS_CLES_JS.has(m) || MOTS_FAIBLES.has(m.toLowerCase())) return "mot générique";
  const n = contenu.split(x.motif).length - 1;
  if (n === 1) return null;
  if (/^\w+$/.test(m) && importes(contenu).has(m)) return null;
  return `${n} occurrence(s) : ni unique, ni identifiant importé`;
}

describe("Matrice et code réel : relecture du dépôt", () => {
  it("chaque preuve citée existe : symbole exporté (code), motif présent (test, route, interface)", () => {
    // Capacités par sens (EX-079) : chaque test cité existe, discriminant, dans un fichier de test.
    for (const c of STUDIO_CAPACITES_PAR_SENS) for (const sens of STUDIO_SENS_CAPACITE) for (const x of c.sens[sens].preuves ?? []) {
      expect(existsSync(join(RACINE, x.fichier)), `${c.id}/${sens} : ${x.fichier}`).toBe(true);
      expect(lire(x.fichier).includes(x.motif), `${c.id}/${sens} : « ${x.motif} » dans ${x.fichier}`).toBe(true);
      expect(nonDiscriminant(x, lire(x.fichier)), `${c.id}/${sens} : « ${x.motif} »`).toBeNull();
      expect(/\.test\.tsx?$|e2e\/.*\.mjs$/.test(x.fichier), `${c.id}/${sens} : ${x.fichier} n'est pas un test`).toBe(true);
    }
    for (const e of livrees) {
      for (const x of preuves(e)) expect(existsSync(join(RACINE, x.fichier)), `${e.id} : ${x.fichier}`).toBe(true);
      for (const x of e.preuves!.code) {
        const motif = new RegExp(`^export (?:async )?(?:function|const|class) ${echapper(x.motif)}\\b`, "m");
        expect(motif.test(lire(x.fichier)), `${e.id} : ${x.motif} exporté par ${x.fichier}`).toBe(true);
      }
      for (const x of [...e.preuves!.tests, ...(e.preuves!.routes ?? []), ...(e.preuves!.interfaces ?? [])]) {
        expect(lire(x.fichier).includes(x.motif), `${e.id} : « ${x.motif} » dans ${x.fichier}`).toBe(true);
      }
      for (const t of e.preuves!.tests) expect(/\.test\.tsx?$|e2e\/.*\.mjs$|test-corpus\/|\.github\/workflows\//.test(t.fichier), `${e.id} : ${t.fichier} n'est pas un test`).toBe(true);
    }
  });

  it("preuves de test et d'interface discriminantes (ni triviales, ni ambiguës) ; routes ni triviales ni génériques", () => {
    const refus: string[] = [];
    for (const e of livrees) {
      for (const x of [...e.preuves!.tests, ...(e.preuves!.interfaces ?? [])]) {
        const r = nonDiscriminant(x, lire(x.fichier));
        if (r) refus.push(`${e.id} : « ${x.motif} » dans ${x.fichier} — ${r}`);
      }
      for (const x of e.preuves!.routes ?? []) if (x.motif.trim().length < 8 || MOTS_FAIBLES.has(x.motif.toLowerCase())) refus.push(`${e.id} : route « ${x.motif} »`);
    }
    expect(refus).toEqual([]);
    // Les motifs faibles relevés en revue sont refusés.
    const studioDossier = lire("apps/web/e2e/studio-dossier.mjs");
    for (const motif of ["import", "archive", "png", "CSV", "dossiers", "rapport", "releve", "files/", "files/pdf"]) {
      expect(nonDiscriminant({ fichier: "", motif }, studioDossier), motif).not.toBeNull();
    }
  });

  it("aucun écrivain ni lecteur du modèle Studio sans entrée (façades de studio/)", () => {
    const facades = ["export.ts", "export-3d.ts", "ifc.ts", "feuille.ts", "dossier-conception.ts", "import-dxf.ts", "mesh-3d.ts"].map((f) => `packages/atelier-model/src/studio/${f}`);
    const ecrivains = facades.flatMap((f) => fonctionsExportees(lire(f)).filter((n) => /^(export\w+|lire\w+|pdf\w+|\w+(Svg|Pdf|Dxf|Ifc|Csv|Png|Step|Obj|Stl|Gltf))$/.test(n)).map((n) => `${f}#${n}`));
    expect(ecrivains.length).toBeGreaterThan(5);
    const connus = new Set(cites("code").map((x) => `${x.fichier}#${x.motif}`));
    expect(ecrivains.filter((x) => !connus.has(x))).toEqual([]);
  });

  it("aucun fichier servi par l'API Studio sans entrée (bibliothèques et routes)", () => {
    const libs = fichiers("apps/api/src/lib", (f) => /\/studio-[^/]*\.ts$/.test(f) && sourcesNonTest(f));
    const ecrivains = libs.flatMap((f) => fonctionsExportees(lire(f)).filter((n) => /^(export\w+|import\w+Archive|read\w+File|\w+PackageFiles)$/.test(n)).map((n) => `${f}#${n}`));
    const connus = new Set(cites("code").map((x) => `${x.fichier}#${x.motif}`));
    expect(ecrivains.filter((x) => !connus.has(x))).toEqual([]);
    // Routes : toute route Studio qui sert un fichier ou un export (chemin contenant « export » ou « /files/ »).
    const routes = fichiers("apps/api/src/routes", (f) => /\/studio[^/]*\.ts$/.test(f) && sourcesNonTest(f));
    const servies = routes.flatMap((f) => [...lire(f).matchAll(/Router\.(?:get|post)\(\s*(["`])([^"`]+)\1/g)].map((m) => ({ fichier: f, chemin: m[2]! })))
      .filter((r) => /export|\/files\//.test(r.chemin));
    expect(servies.length).toBeGreaterThanOrEqual(5);
    const routesCitees = cites("routes");
    for (const r of servies) expect(routesCitees.some((x) => x.fichier === r.fichier && x.motif === r.chemin), `${r.fichier} ${r.chemin}`).toBe(true);
    // Formats d'export des variantes : exactement les entrées liées au rapport de fidélité et les exports 3D (E.6-04).
    const formats = /STUDIO_EXPORT_FORMATS = \[([^\]]+)\]/.exec(lire("apps/api/src/lib/studio-commands.ts"))![1]!.match(/"(\w+)"/g)!.map((s) => s.slice(1, -1));
    expect(formats.sort()).toEqual(livrees.filter((e) => (e.fidelite || e.export3d) && e.sens === "export").map((e) => e.fidelite ?? e.export3d).sort());
  });

  it("aucun téléchargement de l'interface Studio sans entrée (attribut JSX `download` nu ou valué, propriété `.download`)", () => {
    /** Attribut JSX `download` (nu, `download=`, en fin de balise) ou affectation `x.download = …`. */
    const TELECHARGEMENT = /\sdownload(?=[\s=>/])|\.download\s*=/;
    expect(TELECHARGEMENT.test('<a href={u} download data-x>')).toBe(true);
    expect(TELECHARGEMENT.test('<a href={u}\n  download\n>')).toBe(true);
    expect(TELECHARGEMENT.test('<a download={nom}>')).toBe(true);
    expect(TELECHARGEMENT.test('link.hasAttribute("download")')).toBe(false);
    expect(TELECHARGEMENT.test('<a data-download-x>')).toBe(false);
    // La Planche de Sandbox est un module à part (apps/web/src/modules/sandbox, lot 1) : hors du dossier lu ici.
    const pages = fichiers("apps/web/src/modules/studio", (f) => sourcesNonTest(f)).filter((f) => TELECHARGEMENT.test(lire(f)));
    expect(pages).toContain("apps/web/src/modules/studio/dossier/PanneauDossier.tsx");
    expect(pages.length).toBeGreaterThanOrEqual(7);
    const citees = new Set(cites("interfaces").map((x) => x.fichier));
    expect(pages.filter((f) => !citees.has(f))).toEqual([]);
    // Feuilles composées et dossier : téléchargés depuis le panneau du dossier.
    for (const id of ["feuille-composee-svg", "feuille-composee-pdf", "dossier-pdf", "dossier-json"]) {
      expect(entree(id).preuves!.interfaces?.some((x) => x.fichier.endsWith("dossier/PanneauDossier.tsx")), id).toBe(true);
    }
  });

  it(`document généré à jour (${DOC_MD})`, () => {
    const attendu = studioMatriceEchangesMarkdown();
    if (process.env.STUDIO_MATRICE_ECRIRE === "1") {
      mkdirSync(dirname(join(RACINE, DOC_MD)), { recursive: true });
      writeFileSync(join(RACINE, DOC_MD), attendu);
    }
    expect(lire(DOC_MD), "document périmé : STUDIO_MATRICE_ECRIRE=1 npx vitest run matrice-echanges").toBe(attendu);
  });
});
