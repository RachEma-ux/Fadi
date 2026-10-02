import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { containment, declareSiteObservation, withCenterElevation, designAnalysis, designAudit, designPlanSvg, designReportHtml, designReviewSnapshot, designTraceHtml, toLocal, validPolygon, type DesignReviewInput } from "./design-review";
import { baseStars, compassStatus, harmonyAssess, harmonyDossier, harmonyFullAssessment, harmonyProfile, harmonyRecordStatus, harmonySector, natalStatus, type HarmonyEngineData } from "./harmony-engine";
import type { NativeFloorDesignLike, NativeLevelLike } from "./model-analysis";
import { programmeCaseSums } from "./programme";

const data = (rel: string) => JSON.parse(readFileSync(new URL(`../../../apps/api/src/data/${rel}`, import.meta.url), "utf8"));
const MODEL = data("examples/p118-native-model.json") as { nativeId: string; domains: { levels: NativeLevelLike[]; floorDesign: NativeFloorDesignLike; nativeParcel: Record<string, unknown>; buildingFootprint: { vertices: [number, number][] } } };
const DOSSIER = data("examples/p118-harmony-dossier.json");
const CASE = data("examples/p118-programme-case.json").programme;
const ENGINE = data("harmony-engine.json") as HarmonyEngineData;
const NOW = "2026-10-02T10:00:00.000Z";

function input(over: Partial<DesignReviewInput> = {}): DesignReviewInput {
  const np = MODEL.domains.nativeParcel;
  return {
    projectId: "proj_test",
    projectName: "Escalier B et mezzanine",
    nativeId: MODEL.nativeId,
    levels: MODEL.domains.levels,
    floor: MODEL.domains.floorDesign,
    parcel: { vertices: np["vertices"] as [number, number][], centroid: np["centroid"] as [number, number], crs: String(np["crs"]), officialArea: np["officialArea"] as number, setback: np["setback"] as { envelope?: [number, number][] } },
    footprint: MODEL.domains.buildingFootprint.vertices,
    solarSite: null,
    programmeCase: CASE,
    repartitionCaseTotals: null,
    siteObservations: null,
    siteContext: null,
    business: new Map(),
    generatedTexts: {},
    harmony: harmonyDossier(DOSSIER.harmony, NOW),
    georeference: { ...DOSSIER.georeference, hypothesis: true },
    assumptions: DOSSIER.assumptions,
    example: true,
    parcelTransmission: { status: "linked", reason: "" },
    decision19: "GO sous conditions",
    textConflicts: 0,
    engine: ENGINE,
    now: NOW,
    ...over,
  };
}

describe("moteur Harmony V6 (tables extraites)", () => {
  it("expose 69 règles, 10 types et les directions ; profil, règles applicables et bilan des observations de l'exemple", () => {
    expect(ENGINE.rules).toHaveLength(69);
    expect(Object.keys(ENGINE.types)).toHaveLength(10);
    expect(ENGINE.dirs).toEqual(["N", "NE", "E", "SE", "S", "SO", "O", "NO"]);
    const h = harmonyDossier(DOSSIER.harmony, NOW);
    const profile = harmonyProfile(ENGINE, h, { type: "mixte" }, true);
    expect(profile).toMatchObject({ type: "mixte", parts: ["tertiaire", "enseignement"], label: "Mixte / multi-usages", source: "Répartition programmatique" });
    const a = harmonyAssess(ENGINE, h, { type: "mixte" }, true);
    // Phase 3 du dossier : les règles de phase 4 sont « phase suivante » ; 36 actives, 27 documentées (revue archivée de l'exemple).
    expect(a.phase).toBe(3);
    expect(a.active).toBe(36);
    expect(a.counts.future).toBe(7);
    expect(a.documented).toBe(27);
    expect(a.counts).toMatchObject({ ok: 3, improve: 22, conflict: 2, na: 0, unknown: 9 });
    const full = harmonyFullAssessment(ENGINE, h, { type: "mixte" }, true, "autre-modele");
    expect(full.counts.stale).toBe(27); // toutes les observations documentées sont rattachées à l'ancienne empreinte
    expect(full.label).toBe("Bilan à actualiser");
    expect(harmonyRecordStatus({ state: "ok", note: "x", source: "y", quality: "measured" })).toBe("ok");
    expect(harmonyRecordStatus({ state: "ok", note: "x" })).toBe("unproven");
    expect(harmonyRecordStatus({ state: "na" })).toBe("unproven");
    expect(harmonySector(123.866)).toBe(3);
  });

  it("compass / natal : la référence directionnelle de l'exemple reste conditionnelle (non confirmée, sans date ni incertitude)", () => {
    const h = harmonyDossier(DOSSIER.harmony, NOW);
    const c = compassStatus(ENGINE, h.compass);
    expect(c.ready).toBe(false);
    expect(c.missing).toEqual(expect.arrayContaining(["Déclinaison documentée pour la lecture magnétique", "Date de la mesure", "Incertitude de mesure (0 à 45°)", "Validation de la référence spatiale"]));
    expect(c.facing).toBeCloseTo(123.866, 2);
    expect(c.sitting).toBeCloseTo(303.866, 2);
    expect(c.gua).toMatchObject({ n: 6, name: "Qian", direction: "NO" });
    const ok = compassStatus(ENGINE, { facing: 100, basis: "magnetic", source: "Boussole", date: "2026-10-01", facadeReason: "Façade sur rue", uncertainty: 2, confirmed: true });
    expect(ok.ready).toBe(true);
    expect(ok.gua).toMatchObject({ name: "Dui", direction: "O" });
    const boundary = compassStatus(ENGINE, { facing: 22.5, basis: "magnetic", source: "B", date: "2026-10-01", facadeReason: "F", uncertainty: 3, confirmed: true });
    expect(boundary.missing).toEqual(["Incertitude traversant une limite Ba Zhai : nouvelle mesure nécessaire"]);
    const n = natalStatus(ENGINE, h);
    expect(n.ready).toBe(false);
    expect(n.base).toEqual({ C: 9, NO: 1, O: 2, NE: 3, S: 4, N: 5, SO: 6, E: 7, SE: 8 });
    expect(n.missing).toEqual(expect.arrayContaining(["Confirmation de la période, distincte de la période actuelle", "18 valeurs montagne / eau cohérentes, de 1 à 9 sans doublon par série"]));
    expect(baseStars(ENGINE, 10)).toBeNull();
  });
});

describe("bilan du bâtiment conçu (flow-v62 analyse / audit / plan / rapport)", () => {
  it("lit le modèle P.118 comme le prototype : 6 niveaux, 74 zones (révision 7 du modèle), entrée H-ENTREE à 123,87° géographiques, 7 réserves dans le même ordre", () => {
    const r = designAnalysis(input());
    expect(r.floors).toHaveLength(6);
    expect(r.rooms).toHaveLength(74); // la revue archivée de l'exemple (62 zones) date d'une révision antérieure du modèle
    expect(r.facts.parcelArea).toBeCloseTo(1345.5476, 3);
    expect(r.facts.officialArea).toBe(1346); // contenance source, distincte de l'aire calculée
    expect(r.facts.footprint).toBeGreaterThan(600);
    expect(r.facts.setbacks).toHaveLength(4);
    expect(r.facts.inside).toBe(true);
    expect(r.facts.insideSetback).toBe(true);
    expect(r.facts.height).toBeCloseTo(16.6, 6);
    expect(r.entry).not.toBeNull();
    expect(r.entry!.id).toBe("rdc|EX118-rdc-doors-9");
    expect(r.entry!.width).toBe(1.8);
    expect(r.entry!.trueBearing).toBeCloseTo(123.86605, 4); // = compass.facing du dossier de l'exemple
    expect(r.rooms[0]!.sector).toMatch(/\(hyp\.\)$/);
    expect(r.totals!.programme).toBeCloseTo(2932.26, 1);
    expect(r.issues.map((x) => x.title)).toEqual([
      "Hauteurs : conflit avec la référence du dossier",
      "Densité des postes à éprouver",
      "Mezzanine et RDC : acoustique / transitions",
      "Accès technique et rampe dans le recul",
      "Contexte extérieur non observé",
      "Lecture directionnelle conditionnelle",
      "Étoiles Volantes : carte natale non établie",
    ]);
    expect(r.sourceSummary).toBe(DOSSIER.harmony.designReviewV62.summary);
    expect(r.issues.find((x) => x.id === "RAMP")!.step).toBe(13);
    // La revue archivée de l'exemple porte une autre signature d'entrées (formes d'objets) : à actualiser.
    expect(r.stale).toBe(true);
    expect(r.nativeHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("sans géoréférencement ni exemple : secteurs non référencés, pas de réserve de hauteur, écarts de cibles signalés", () => {
    const r = designAnalysis(input({ georeference: null, example: false }));
    expect(r.rooms.every((x) => x.sector === "Non référencé")).toBe(true);
    expect(r.entry!.trueBearing).toBeNull();
    expect(r.issues.map((x) => x.id)).toEqual(["DENSITY", "MEZZ", "RAMP", "CONTEXT", "COMPASS", "FLYING"]); // cibles = surfaces dessinées dans le cas résolu : pas d'écart
    const off = designAnalysis(input({ example: false, georeference: null, programmeCase: { ...CASE, spaces: CASE.spaces.map((sp: { unitArea: number }) => ({ ...sp, unitArea: sp.unitArea + 1 })) } }));
    expect(off.issues[0]).toMatchObject({ id: "TARGETS", step: 7 });
    expect(off.issues[0]!.refs.length).toBeGreaterThan(0);
    const empty = designAnalysis(input({ levels: [], floor: { levels: {} }, programmeCase: null, example: false, georeference: null }));
    expect(empty.issues[0]).toMatchObject({ id: "NO-MODEL", title: "Modèle non dessiné" });
    expect(empty.rooms).toHaveLength(0);
    expect(empty.facts.height).toBeNull();
  });

  it("observation déclarée du contexte extérieur : règle des 20 caractères, statut du prototype, réserve CONTEXT levée avec un géoréférencement, empreinte des entrées modifiée", () => {
    expect(() => declareSiteObservation("trop court", NOW)).toThrow("Décrivez la source, la date et ce qui a été observé (20 caractères minimum).");
    const declared = declareSiteObservation("  Voie en T au nord-est, masse voisine R+3 à l'ouest ; relevé sur place le 12/09/2026.  ", NOW);
    expect(declared).toEqual({ observation: "Voie en T au nord-est, masse voisine R+3 à l'ouest ; relevé sur place le 12/09/2026.", observationStatus: "Déclaration utilisateur, non contrôle indépendant", observedAt: NOW, satelliteObserved: true, elevation: null });
    // Altitude indicative du centre (collectée à la demande) : posée sur le contexte, l'observation conservée ; valeurs incohérentes refusées.
    const withElevation = withCenterElevation(declared, [-7.3196824, 33.7082212, 42.5], NOW);
    expect(withElevation).toMatchObject({ observation: declared.observation, satelliteObserved: true, elevation: { value: 42.5, unit: "m", coordinates: [-7.3196824, 33.7082212], source: "MapTiler Elevation API", quality: "service numérique, non relevé topographique" } });
    expect(() => withCenterElevation(null, [-7.3, 33.7, Number.NaN], NOW)).toThrow("Coordonnées ou altitude de réponse incohérentes");
    expect(declareSiteObservation("Observation ultérieure, assez longue pour passer.", NOW, withElevation).elevation).toEqual(withElevation.elevation);
    const before = designAnalysis(input({}));
    const after = designAnalysis(input({ siteContext: declared }));
    expect(before.issues.some((x) => x.id === "CONTEXT")).toBe(true);
    expect(after.issues.some((x) => x.id === "CONTEXT")).toBe(false);
    expect(after.inputHash).not.toBe(before.inputHash);
    // Sans géoréférencement, l'observation ne suffit pas : la réserve reste.
    expect(designAnalysis(input({ siteContext: declared, georeference: null })).issues.some((x) => x.id === "CONTEXT")).toBe(true);
    const audit = designAudit(input({ siteContext: declared }), after, "Formation & bureaux");
    expect(audit.find((x) => x.id === "external")).toMatchObject({ status: "OK", detail: expect.stringContaining("consignée par utilisateur") });
  });

  it("audit des transmissions : OK / À documenter / Écart avec les contrôles du prototype", () => {
    const i = input();
    const r = designAnalysis(i);
    const rows = designAudit(i, r, "Mixte / multi-usages");
    const by = Object.fromEntries(rows.map((x) => [x.id, x]));
    expect(rows.map((x) => x.id)).toEqual(["link", "parcel", "parcel-state", "program", "type", "room-links", "targets", "design", "geometry", "review", "text", "decision", "geo", "external"]);
    expect(by["link"]!.status).toBe("OK");
    expect(by["parcel"]!.status).toBe("OK");
    expect(by["parcel"]!.detail.replace(/[\u202f\u00a0]/g, " ")).toBe("4 bornes ; 1 345,548 m² calculés");
    expect(by["program"]!.status).toBe("Écart"); // cas appliqué mais totaux de la répartition absents de l'entrée de test
    const inStep = designAudit(input({ repartitionCaseTotals: programmeCaseSums(CASE.spaces) }), r, "Mixte / multi-usages");
    expect(inStep.find((x) => x.id === "program")!.status).toBe("OK");
    expect(by["room-links"]!.status).toBe("OK");
    // Les fiches de locaux du dossier de l'exemple datent d'une révision antérieure du modèle : écart constaté, comme dans le prototype.
    expect(by["targets"]).toMatchObject({ status: "Écart", detail: "74 cibles de fiches comparées ; pas de redimensionnement du dessin" });
    const roomData = Object.fromEntries(CASE.spaces.flatMap((sp: { id: string; quantity: number; unitArea: number }) => (CASE.roomLinks[sp.id] ?? []).map((rid: string) => [rid, { programmeTargetArea: sp.quantity * sp.unitArea }])));
    const consistent = designAudit(input({ harmony: { ...i.harmony, roomData } }), r, "Mixte / multi-usages");
    expect(consistent.find((x) => x.id === "targets")!.status).toBe("OK");
    expect(by["geometry"]!.detail).toBe("74 polygones ; surfaces calculées, trémies séparées");
    expect(by["review"]).toMatchObject({ status: "À documenter", detail: "Une donnée analysée a changé : revue à actualiser" });
    expect(by["decision"]!.status).toBe("OK");
    expect(by["external"]!.status).toBe("À documenter");
    const conflict = designAudit(input({ parcelTransmission: { status: "conflict", reason: "Les bornes diffèrent" }, textConflicts: 2 }), r, "Mixte / multi-usages");
    expect(conflict.find((x) => x.id === "parcel-state")).toMatchObject({ status: "Écart", detail: "Les bornes diffèrent" });
    expect(conflict.find((x) => x.id === "text")).toMatchObject({ status: "Écart", detail: "2 conflit(s) de texte manuel conservé(s)" });
  });

  it("plan de lecture SVG du RDC : parcelle, recul, emprise, zones, murs, entrée, nord ; repères convertis explicitement", () => {
    const i = input();
    const r = designAnalysis(i);
    const svg = designPlanSvg(i, r, "rdc");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("P.118 · RDC · lecture de conception");
    expect(svg).toContain("Entrée H-ENTREE");
    expect(svg).toContain("Nord géographique calculé (H-GEO)");
    expect(svg).toContain('stroke-dasharray="7 5"'); // recul
    expect((svg.match(/<polygon/g) ?? []).length).toBeGreaterThan(10);
    expect(svg).toContain("R01 · ");
    expect(designPlanSvg(input({ parcel: null, footprint: [] }), designAnalysis(input({ parcel: null, footprint: [] })), "rdc")).toBe("");
    expect(toLocal([[10, 20]], [4, 5])).toEqual([[6, 15]]);
    expect(validPolygon([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
    expect(validPolygon([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(false); // auto-intersecté
    expect(containment([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
    expect(containment([[0.2, 0.2], [1.8, 0.2], [0.8, 0.8]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
  });

  it("revue de conception archivée et rapport HTML autonome", () => {
    const i = input();
    const r = designAnalysis(i);
    const snap = designReviewSnapshot(i.harmony, r, NOW, false);
    expect(snap.designReviewV62).toMatchObject({ version: "6.2.0", name: "Escalier B et mezzanine — bilan du bâtiment conçu", signature: r.inputHash, modelSignature: r.nativeHash, status: "Conception sous hypothèses — réserves non levées", automatic: false, counts: { levels: 6, rooms: 74, issues: 7 } });
    expect(snap.designReviewHistoryV62).toHaveLength(1); // l'ancienne revue de l'exemple est archivée
    const fresh = designAnalysis(input({ harmony: { ...i.harmony, designReviewV62: snap.designReviewV62 } }));
    expect(fresh.stale).toBe(false);
    const html = designReportHtml(i, r, { css: ".v62{}", audit: designAudit(i, r, "Mixte / multi-usages"), designTrace: designTraceHtml([{ originLabel: "07 · Programme", text: "Intention", originStale: false }], []) });
    expect(html).toContain("<title>P.118 — Bilan Harmonie du bâtiment conçu · V7</title>");
    expect(html).toContain("PARCOURS V7 · ANALYSE DOCUMENTAIRE ET GÉOMÉTRIQUE");
    expect(html).toContain("Lecture des 74 zones");
    expect(html).toContain("H-GEO");
    expect(html).toContain("Ba Zhai, scénario uniquement");
    expect(html).toContain("Intentions transmises et propositions de conception");
    expect(html).toContain("Transmission des données");
    expect(html).not.toContain("<button");
    const generic = designReportHtml(input({ example: false, projectName: "Autre" }), designAnalysis(input({ example: false, projectName: "Autre" })), { css: "", audit: [] });
    expect(generic).toContain("<title>Autre — Bilan Harmonie du bâtiment conçu · V7</title>");
    expect(generic).not.toContain("Le scénario de référence réunit formation, bureaux et services");
    expect(generic).not.toContain("Accueil RDC");
  });
});
