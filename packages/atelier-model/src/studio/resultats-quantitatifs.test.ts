/**
 * IF-008 / EX-077 — résultat quantitatif traçable ; EX-078 — cohérence des totaux (lot PUB). Données synthétiques de
 * recette : mur 6 × 3 × 0,2 m, ouverture 1 × 2,1 m, rectangle extrudé 2 × 1 × 3 m, une cote ; aucune valeur de projet.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import {
  ajusterResultat, fraicheurResultats, jeuSourcesQuantite, resultatsQuantitatifs, STUDIO_REGLES_METRE, totaliserResultats, valeurAffichee, valeurRetenue,
  type ResultatQuantitatif, type RevisionSourceQuantite,
} from "./resultats-quantitatifs.js";

const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map((c) => c as StudioCommand));
const pilote = (): StudioDocument => avec(newStudioDocument("pilote"),
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 1 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 3 }, { x: 6, y: 3 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
);
const H = (c: string) => c.repeat(64);
const src = (over: Partial<RevisionSourceQuantite> = {}): RevisionSourceQuantite => ({ studyId: "e1", variantId: "v1", revisionId: "r1", documentHash: H("a"), ...over });
const LE = "2026-10-25T10:00:00.000Z";
const trouve = (rs: ResultatQuantitatif[], portee: "objet" | "total", grandeur: string, objet?: string) =>
  rs.find((r) => r.portee === portee && r.grandeur === grandeur && (objet === undefined || r.sourceObjectIds.includes(objet)))!;

describe("IF-008 / EX-077 — résultat quantitatif traçable", () => {
  it("IF-008 [+] la quantité du mur porte quantityId, sourceRevisionSet, ruleId / ruleVersion, sourceObjectIds, unit, rawValue, deductions, displayValue, freshnessStatus", () => {
    const rs = resultatsQuantitatifs(pilote(), src(), { calculeLe: LE });
    const net = trouve(rs, "objet", "volume-net", "m1");
    expect(net.quantityId).toMatch(/^q_[0-9a-f]{32}$/);
    expect(net.sourceRevisionSet.revisions).toEqual([src()]);
    expect(net.sourceRevisionSet.id).toBe(jeuSourcesQuantite([src()]).id);
    expect(net).toMatchObject({ ruleId: "studio.metre.volume-net", ruleVersion: STUDIO_REGLES_METRE["volume-net"].ruleVersion, unit: "m3", sourceObjectIds: ["m1"], freshnessStatus: "a-jour", computedAt: LE, precisionInterne: "ieee754-binary64" });
    expect(net.rawValue).toBeCloseTo(6 * 3 * 0.2 - 1 * 2.1 * 0.2, 12);
    expect(net.deductions).toEqual([{ sourceId: "o1", sourceType: "opening", valeur: expect.closeTo(0.42, 12) }]);
    expect(net.displayValue).toBe("3,180");
    expect(net.manualAdjustment).toBeUndefined();
  });

  it("EX-077 [+] précision interne pleine, arrondi de présentation déclaré séparé ; exclusions (cote, grandeur non évaluée) listées avec motif ; identité stable", () => {
    const rs = resultatsQuantitatifs(pilote(), src(), { calculeLe: LE, decimales: 1 });
    const total = trouve(rs, "total", "volume");
    expect(total.arrondiPresentation).toEqual({ decimales: 1, mode: "demi-eloigne-de-zero" });
    expect(total.rawValue).toBeCloseTo(6 + 3.6, 12);
    expect(total.displayValue).toBe("9,6");
    expect(total.sourceObjectIds.sort()).toEqual(["m1", "r1"]);
    expect(total.exclusions).toEqual(expect.arrayContaining([{ ref: "c1", motif: "cote-hors-metre" }]));
    const longueur = trouve(rs, "objet", "longueur", "l1");
    expect(longueur.rawValue).toBe(4);
    const encore = resultatsQuantitatifs(pilote(), src(), { calculeLe: "2026-10-26T00:00:00.000Z" });
    expect(trouve(encore, "total", "volume").quantityId).toBe(total.quantityId);
    const autreRevision = resultatsQuantitatifs(pilote(), src({ revisionId: "r2" }), { calculeLe: LE });
    expect(trouve(autreRevision, "total", "volume").quantityId).not.toBe(total.quantityId);
    expect(valeurAffichee(null)).toBe("non évalué");
  });

  it("IF-008 [+] freshnessStatus : à jour sur la tête, périmée après une nouvelle révision, source inconnue si la variante disparaît", () => {
    const rs = resultatsQuantitatifs(pilote(), src(), { calculeLe: LE });
    expect(fraicheurResultats(rs, new Map([["v1", "r1"]])).every((r) => r.freshnessStatus === "a-jour")).toBe(true);
    expect(fraicheurResultats(rs, new Map([["v1", "r2"]])).every((r) => r.freshnessStatus === "perimee")).toBe(true);
    expect(fraicheurResultats(rs, new Map()).every((r) => r.freshnessStatus === "source-inconnue")).toBe(true);
  });

  it("IF-008 [−] ajustement manuel sans motif, sans auteur ou d'une unité incohérente : refusé, rawValue conservée ; recevable, il reste distinct", () => {
    const mur = trouve(resultatsQuantitatifs(pilote(), src(), { calculeLe: LE }), "objet", "volume", "m1");
    const base = { valeur: 3.5, unit: "m3" as const, motif: "relevé sur place", auteur: "u_1", date: LE };
    expect(ajusterResultat(mur, { ...base, motif: "  " })).toEqual({ refus: "motif-obligatoire" });
    expect(ajusterResultat(mur, { ...base, auteur: "" })).toEqual({ refus: "auteur-obligatoire" });
    expect(ajusterResultat(mur, { ...base, unit: "m2" })).toEqual({ refus: "unite-incompatible" });
    expect(ajusterResultat(mur, { ...base, valeur: -1 })).toEqual({ refus: "valeur-invalide" });
    const ok = ajusterResultat(mur, base);
    if (!("ok" in ok)) throw new Error("ajustement refusé");
    expect(ok.ok.rawValue).toBe(mur.rawValue);
    expect(ok.ok.manualAdjustment).toEqual(base);
    expect(valeurRetenue(ok.ok)).toBe(3.5);
    expect(mur.manualAdjustment).toBeUndefined();
  });
});

describe("EX-078 — totaux : aucun mélange de règles, d'unités ni de révisions sans signalement", () => {
  const rs = resultatsQuantitatifs(pilote(), src(), { calculeLe: LE });
  const volumes = ["m1", "r1"].map((id) => trouve(rs, "objet", "volume", id));

  it("EX-078 [+] quantités homogènes : brut, déductions, net, non testées et corrections manuelles distingués", () => {
    const nets = rs.filter((r) => r.portee === "objet" && r.grandeur === "volume-net");
    const t = totaliserResultats(nets);
    expect(t.signalements).toEqual([]);
    expect(t.net).toBeCloseTo(3.18, 12);
    expect(t.deductions).toBeCloseTo(0.42, 12);
    expect(t.brut).toBeCloseTo(3.6, 12);
    const ajuste = ajusterResultat(volumes[0]!, { valeur: 10, unit: "m3", motif: "correction", auteur: "u_1", date: LE });
    if (!("ok" in ajuste)) throw new Error("refus");
    const nonTeste: ResultatQuantitatif = { ...volumes[1]!, rawValue: null, displayValue: "non évalué" };
    const t2 = totaliserResultats([ajuste.ok, nonTeste]);
    expect(t2.nonTestees).toBe(1);
    expect(t2.corrections.nombre).toBe(1);
    expect(t2.brut).toBe(volumes[0]!.rawValue);
    expect(t2.retenu).toBe(10);
    expect(t2.corrections.ecart).toBeCloseTo(10 - volumes[0]!.rawValue!, 12);
  });

  it("EX-078 [−] révisions hétérogènes (jeux de sources distincts) : signalé, aucun total produit", () => {
    const autre = resultatsQuantitatifs(pilote(), src({ revisionId: "r2", documentHash: H("b") }), { calculeLe: LE }).filter((r) => r.portee === "objet" && r.grandeur === "volume" && r.rawValue !== null);
    expect(totaliserResultats(volumes).signalements).toEqual([]);
    const t = totaliserResultats([...volumes, ...autre]);
    expect(t.signalements.map((s) => s.type)).toEqual(["revisions-heterogenes"]);
    expect([t.brut, t.net, t.retenu]).toEqual([null, null, null]);
  });

  it("EX-078 [−] règles incompatibles (autre version) ou unités différentes (m² et m³) : signalé, aucun total produit", () => {
    const v2 = volumes.map((r) => ({ ...r, ruleVersion: "2" }));
    expect(totaliserResultats([volumes[0]!, v2[1]!]).signalements.map((s) => s.type)).toEqual(["regles-incompatibles"]);
    expect(totaliserResultats([volumes[0]!, v2[1]!]).brut).toBeNull();
    const surface = rs.find((r) => r.portee === "objet" && r.grandeur === "surface")!;
    const mix = totaliserResultats([volumes[0]!, surface]);
    expect(mix.signalements.map((s) => s.type)).toEqual(["unites-heterogenes", "grandeurs-heterogenes", "regles-incompatibles"]);
    expect(mix.net).toBeNull();
    const hauteurs = rs.filter((r) => r.grandeur === "hauteur");
    expect(totaliserResultats(hauteurs).signalements).toEqual([{ type: "grandeur-non-cumulable", grandeur: "hauteur" }]);
  });
});
