import { readFileSync } from "node:fs";
import { analyseModel, localHarmonieOptions, type NativeFloorDesignLike, type NativeLevelLike, type RoomLinkTargets } from "@parcours/domain-model";
import { describe, expect, it } from "vitest";
import type { JeuDonneesP118 } from "../contrats/import.js";
import { jsonCanonique } from "../importeur/empreinte.js";
import { importerP118 } from "../importeur/importer-p118.js";
import { projeterDomainesNatifs, projeterEntreeAnalyse } from "./projeter.js";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SOURCE = JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as Json;

/** Domaines source sans les états d'affichage (`ui`, `activeLayer`), seuls exclus du modèle (R10). */
function attendus(): Json {
  const { ui: _ui, ...d } = SOURCE.domains as Json;
  void _ui;
  const levels = Object.fromEntries(Object.entries(d.floorDesign.levels as Json).map(([k, v]) => [k, Object.fromEntries(Object.entries(v as Json).filter(([c]) => c !== "activeLayer"))]));
  return { ...d, floorDesign: { ...d.floorDesign, levels } };
}

const entreeSource = (programme: RoomLinkTargets | null = null) => ({
  nativeId: SOURCE.nativeId as string,
  levels: SOURCE.domains.levels as NativeLevelLike[],
  floor: SOURCE.domains.floorDesign as NativeFloorDesignLike,
  parcel: SOURCE.domains.nativeParcel,
  footprint: SOURCE.domains.buildingFootprint.vertices,
  programme,
});

describe("projection modèle typé → domaines natifs (§5.6)", () => {
  for (const projetId of [undefined, "p118"]) {
    it(`restitue la source bit à bit (valeurs canoniques), identifiants ${projetId ? "préfixés" : "source"}`, () => {
      const { modele } = importerP118(SOURCE as JeuDonneesP118, projetId ? { projetId } : undefined);
      const p = projeterDomainesNatifs(modele);
      expect(jsonCanonique(p.domains)).toBe(jsonCanonique(attendus()));
      expect(p.racine).toEqual(Object.fromEntries(Object.entries(SOURCE).filter(([k]) => k !== "domains")));
      expect(p.nativeId).toBe(SOURCE.nativeId);
      expect(p.omis).toEqual([]);
    });
  }

  it("conserve l'ordre des tableaux (murs, tracés, pièces) et des calques par niveau", () => {
    const p = projeterDomainesNatifs(importerP118(SOURCE as JeuDonneesP118).modele);
    for (const [lid, lv] of Object.entries(SOURCE.domains.floorDesign.levels as Json)) {
      const q = p.domains.floorDesign.levels[lid]!;
      expect((q.paths as Json[]).map((x) => x.id)).toEqual((lv.paths as Json[]).map((x) => x.id));
      expect(Object.keys(q.layers as Json)).toEqual(Object.keys(lv.layers));
      expect(q.exteriorWallIds).toEqual(lv.exteriorWallIds);
    }
  });
});

describe("non-régression de l'analyse (model-analysis) via la projection", () => {
  const { modele } = importerP118(SOURCE as JeuDonneesP118);

  it("donne les mêmes niveaux et les mêmes locaux qu'aujourd'hui", () => {
    const avant = analyseModel(entreeSource());
    const apres = analyseModel(projeterEntreeAnalyse(modele));
    expect(apres.floors).toEqual(avant.floors);
    expect(apres.rooms).toEqual(avant.rooms);
    expect(apres.rooms.length).toBe(74);
    expect(localHarmonieOptions({ ...apres, nativeHash: avant.nativeHash }, 10, "U")).toEqual(localHarmonieOptions(avant, 10, "U"));
  });

  it("conserve les liens de programme (identifiants `niveau|tracé`)", () => {
    const programme: RoomLinkTargets = { spaces: [{ id: "esp-1", quantity: 2, unitArea: 30 }], roomLinks: { "esp-1": ["ss|EX118-ss-P-007", "rdc|EX118-rdc-P-001"] } };
    const avant = analyseModel(entreeSource(programme));
    const apres = analyseModel(projeterEntreeAnalyse(modele, programme));
    expect(apres.rooms.filter((r) => r.target !== null).map((r) => [r.id, r.target, r.delta])).toEqual(avant.rooms.filter((r) => r.target !== null).map((r) => [r.id, r.target, r.delta]));
    expect(apres.rooms.some((r) => r.id === "ss|EX118-ss-P-007" && r.target === 60)).toBe(true);
  });

  it("écart connu et documenté : `nativeHash` (ordre des clés, activeLayer)", () => {
    const avant = analyseModel(entreeSource());
    const apres = analyseModel(projeterEntreeAnalyse(modele));
    expect(apres.nativeHash).toMatch(/^[0-9a-f]{8}$/);
    expect(apres.nativeHash).not.toBe(avant.nativeHash);
    // Déterministe : deux projections du même modèle → même nativeHash.
    expect(analyseModel(projeterEntreeAnalyse(importerP118(SOURCE as JeuDonneesP118).modele)).nativeHash).toBe(apres.nativeHash);
  });
});
