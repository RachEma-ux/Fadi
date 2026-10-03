import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseModel } from "@parcours/domain-model";
import { objetsDeClasse, ouverturesDuMur } from "../modele.js";
import { projeterPourAnalyse } from "../projection/analyse.js";
import { quantites } from "../quantites.js";
import { importerModeleNatif, type JeuNatif } from "./natif.js";

const JEU = JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif;

describe("importeur P.118 (section 6, R7 : rien d'omis, aucun arrondi)", () => {
  const { modele, rapport } = importerModeleNatif(JEU);

  it("conserve les six niveaux avec leurs altitudes décimales", () => {
    expect(Object.keys(modele.niveaux)).toHaveLength(6);
    expect(modele.niveaux["ss"]).toMatchObject({ nom: "Sous-sol technique", elevation: -3.2, hauteur: 3.2, ordre: 0 });
    expect(modele.niveaux["r3"]).toMatchObject({ elevation: 13.2, hauteur: 3.4, ordre: 5 });
  });

  it("donne une destination à chaque famille, avec les effectifs de la règle R7", () => {
    const effectifs = (classe: Parameters<typeof objetsDeClasse>[1]) => objetsDeClasse(modele, classe).length;
    expect(effectifs("mur")).toBe(220);
    expect(effectifs("porte")).toBe(84);
    expect(effectifs("fenetre")).toBe(126);
    expect(effectifs("escalier")).toBe(32);
    expect(effectifs("poteau")).toBe(120);
    expect(effectifs("espace")).toBe(45);
    expect(effectifs("cotation")).toBe(64);
    expect(effectifs("texte")).toBe(95);
    // 967 tracés : 74 pièces, 6 dalles, 2 toitures, 13 zones, 2 références de plan, 870 solides
    expect(effectifs("piece")).toBe(74);
    expect(effectifs("dalle")).toBe(6);
    expect(effectifs("toiture")).toBe(2);
    expect(effectifs("zone")).toBe(13);
    expect(effectifs("reference-plan")).toBe(2);
    expect(effectifs("solide")).toBe(870);
    expect(effectifs("piece") + effectifs("dalle") + effectifs("toiture") + effectifs("zone") + effectifs("reference-plan") + effectifs("solide")).toBe(967);
    expect(Object.keys(modele.calques)).toHaveLength(22); // union des calques déclarés par niveau
    expect(rapport.rolesInconnus).toEqual([]);
    expect(rapport.calquesCrees).toEqual([]);
  });

  it("conserve les coordonnées et dimensions bit à bit", () => {
    const natif = (JEU.domains.floorDesign as { levels: Record<string, { walls: { id: string; a: [number, number]; b: [number, number]; thickness: number; height: number }[] }> }).levels["rdc"]!.walls[0]!;
    const mur = modele.objets[natif.id]!;
    expect(mur.classe).toBe("mur");
    if (mur.classe !== "mur") return;
    expect(mur.params.a).toEqual({ x: natif.a[0], y: natif.a[1], frame: "local", unit: "m" });
    expect(mur.params.b.x).toBe(natif.b[0]);
    expect(mur.params.epaisseur.value).toBe(natif.thickness);
    expect(mur.params.hauteur?.value).toBe(natif.height);
    expect(mur.niveauId).toBe("rdc");
  });

  it("relie toutes les ouvertures à leur mur hôte et marque les murs extérieurs", () => {
    const sansHote = rapport.problemes.filter((p) => p.type === "hote-introuvable");
    expect(sansHote).toHaveLength(0);
    const exterieurs = objetsDeClasse(modele, "mur", "rdc").filter((m) => m.params.exterieur);
    expect(exterieurs.map((m) => m.id).sort()).toEqual(["EX118-rdc-EXT-0", "EX118-rdc-EXT-1", "EX118-rdc-EXT-2", "EX118-rdc-EXT-3"]);
    const hebergees = objetsDeClasse(modele, "mur").reduce((s, m) => s + ouverturesDuMur(modele, m.id).length, 0);
    expect(hebergees).toBe(210);
  });

  it("garde les escaliers par niveau avec leur groupe et leur niveau d'arrivée", () => {
    const s1 = modele.objets["EX118-rdc-V818-A-S1"];
    expect(s1?.classe).toBe("escalier");
    if (s1?.classe !== "escalier") return;
    expect(s1.params).toMatchObject({ largeur: { value: 1.3, unit: "m" }, marches: 7, contremarches: 7, groupe: "A", niveauDepartId: "rdc", niveauArriveeId: "mezz", referencePlanSeulement: false });
    expect(s1.params.hauteurAFranchir.value).toBe(0.9739130434782609);
    expect(modele.relations["rel-EX118-rdc-V818-A-S1-relie"]).toMatchObject({ kind: "relie", targetId: "mezz" });
  });

  it("sépare espaces déclarés et pièces dessinées, liés par le code, sans fusion silencieuse", () => {
    const espace = modele.objets["rdc-espace-R01"];
    expect(espace?.classe).toBe("espace");
    if (espace?.classe !== "espace") return;
    expect(espace.params.aireDeclaree).toEqual({ value: 160.649, unit: "m2" });
    expect(espace.params.categorie).toBe("Accueil");
    const piece = modele.objets["EX118-rdc-P-007"];
    expect(piece?.classe).toBe("piece");
    if (piece?.classe !== "piece") return;
    expect(piece.params.code).toBe("R01");
    expect(piece.params.nom).toBe("Accueil, attente et hall");
    expect(piece.params.trous).toHaveLength(1);
    expect(modele.relations["rel-rdc-espace-R01-EX118-rdc-P-007"]).toMatchObject({ kind: "correspond-a" });
    expect(rapport.problemes.some((p) => p.type === "sans-correspondance" && p.objetId === "rdc-espace-R05")).toBe(true);
  });

  it("importe la parcelle et l'emprise avec la transformation cadastral → local explicite", () => {
    const parcelle = modele.site.parcelle!;
    expect(parcelle.crs).toBe("EPSG:26191");
    expect(parcelle.sommets).toHaveLength(4);
    expect(parcelle.sommets[0]).toMatchObject({ id: "B.266", cadastral: { x: 321946.82, y: 347183.88, frame: "cadastral", crs: "EPSG:26191" } });
    expect(parcelle.sommets[0]!.local.x).toBeCloseTo(321946.82 - parcelle.origineLocale.x, 9);
    expect(parcelle.aire?.value).toBe(1345.5475500009647);
    expect(parcelle.aireOfficielle?.value).toBe(1346);
    expect(parcelle.champs["parcelNumber"]).toBe("118");
    expect(modele.site.emprise?.sommetsCadastraux).toHaveLength(4);
    expect(modele.site.emprise?.champs["architectureRevision"]).toBe(3);
  });

  it("transforme la structure, les hypothèses et les sources en données déclarées, jamais en exigences", () => {
    expect(modele.site.structure?.["system"]).toBe("Dalles en béton post-tendu");
    expect(modele.site.structure?.["statut"]).toBe("declaree-a-confirmer");
    expect(modele.site.hypotheses.find((h) => h.id === "H01")?.domaine).toBe("Implantation");
    expect(modele.site.hypotheses.every((h) => h.statut === "a-confirmer")).toBe(true);
    expect(modele.site.hypotheses.some((h) => h.id === "H-structure-charge")).toBe(true);
    expect(modele.site.sources.some((s) => s.id === "CAD-S01")).toBe(true);
    expect(modele.proprietes["natif:meta.layoutV819"]).toBeDefined();
    expect(modele.proprietes["natif:registry"]?.valeur).toMatchObject({ id: "p118-demo-v819" });
  });

  it("est idempotent : deux imports donnent le même modèle", () => {
    const second = importerModeleNatif(JEU).modele;
    expect(JSON.stringify(second)).toBe(JSON.stringify(modele));
  });

  it("produit un rapport nominatif par famille", () => {
    const murs = rapport.lignes.find((l) => l.famille === "walls")!;
    expect(murs).toMatchObject({ destination: "mur", source: 220, cible: 220 });
    expect(rapport.lignes.find((l) => l.famille.startsWith("ui"))?.cible).toBe(0);
    expect(rapport.lignes.find((l) => l.famille === "paths · autres rôles")?.cible).toBe(870);
  });

  it("donne des quantités reproductibles", () => {
    const q1 = quantites(modele);
    const q2 = quantites(importerModeleNatif(JEU).modele);
    expect(q1).toEqual(q2);
    expect(q1.totaux.murs).toBe(220);
    expect(q1.totaux.pieces).toBe(74);
    expect(q1.niveaux[1]?.dalles.nombre).toBe(1);
    expect(q1.totaux.aireDalles).toBeGreaterThan(0);
  });

  it("projette vers l'entrée d'analyse : même analyse que le modèle natif (pièces, niveaux, effectifs)", () => {
    const natif = analyseModel({
      nativeId: "p118-demo-v819",
      levels: JEU.domains.levels as Parameters<typeof analyseModel>[0]["levels"],
      floor: JEU.domains.floorDesign as Parameters<typeof analyseModel>[0]["floor"],
      parcel: JEU.domains.nativeParcel,
      footprint: (JEU.domains.buildingFootprint as { vertices: [number, number][] }).vertices,
      programme: null,
    });
    const projection = projeterPourAnalyse(modele, "p118-demo-v819");
    const type = analyseModel({ nativeId: projection.nativeId, levels: projection.levels, floor: projection.floor, parcel: projection.parcel, footprint: projection.footprint, programme: null });
    expect(type.rooms.map((r) => r.id).sort()).toEqual(natif.rooms.map((r) => r.id).sort());
    for (const r of natif.rooms) {
      const t = type.rooms.find((x) => x.id === r.id)!;
      expect(t.area).toBeCloseTo(r.area, 9);
      expect(t.doors).toBe(r.doors);
      expect(t.windows).toBe(r.windows);
      expect(t.furniture).toBe(r.furniture);
      expect(t.name).toBe(r.name);
    }
    expect(type.floors.map((f) => [f.id, f.gross, f.slabNet, f.columns, f.stairs, f.count])).toEqual(natif.floors.map((f) => [f.id, f.gross, f.slabNet, f.columns, f.stairs, f.count]));
  });
});
