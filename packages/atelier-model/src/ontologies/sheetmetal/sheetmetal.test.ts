import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "../../commandes/index.js";
import type { Commande } from "../../commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../../modele.js";
import { genererTableau } from "../../documents/tableaux.js";
import { exporterIfc } from "../../echanges/ifc.js";
import { maillageObjet } from "../../projection/maillage.js";
import { volumeMaillage } from "../../geometrie-3d.js";
import { validerCatalogueCsv } from "../../catalogues/csv-source.js";
import { developpe, parametresPli } from "./pliage.js";
import { developpeTole } from "./index.js";

const pt = (x: number, y: number) => ({ x, y, frame: "local" as const, unit: "m" as const });
const m = (value: number) => ({ value, unit: "m" as const });
const deg = (value: number) => ({ value, unit: "deg" as const });
let n = 0;
const lot = (etat: ModeleAtelier, commands: Commande[], label = "lot") => appliquerLot(etat, { requestId: `req-t-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
const base = () => lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }, { type: "ontologie.activer", params: { nom: "sheetmetal" } }]).etat;
const TABLE = "materiau;epaisseur_mm;rayon_interieur_mm;facteur_k;angle_deg;deduction_pli_mm;source;edition;page\nacier S235;2;2;0,44;;;Table de pliage atelier W;2025;p. 1\nacier S235;2;2;0,44;90;3,6;Table de pliage atelier W;2025;p. 1\n";
const tole = (id: string, extra: Record<string, unknown> = {}) => ({ type: "tole.creer", params: { id, niveauId: "n1", nom: "Capot", position: pt(2, 2), longueur: m(0.4), largeur: m(0.3), epaisseur: m(0.002), materiau: "acier S235", rayonInterieur: m(0.002), plis: [{ bord: "x1", angle: deg(90), longueur: m(0.05) }, { bord: "y0", angle: deg(-45), longueur: m(0.03) }], ...extra } });
const T = (etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<"tole">;

describe("ontologie tôlerie (P2-4) : isolation, pliage sourcé, développé", () => {
  it("aucun module n'importe une autre ontologie ; aucun facteur K ni rayon normatif dans le code", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/from "\.\.\/(mechanical|structure|timber)/);
      expect(src, f).not.toMatch(/\b0\.(33|4|44|5)\b/);
    }
  });
  it("sans table ni facteur déclaré, le développé est « non évalué » ; avec un facteur K déclaré et sourcé, allongement = θ·(r + K·t)", () => {
    const e0 = lot(base(), [tole("t1")]).etat;
    const d0 = developpeTole(e0, T(e0, "t1"));
    expect(d0.nonEvalues).toEqual(["x1", "y0"]);
    const e1 = lot(e0, [{ type: "tole.modifier", params: { id: "t1", params: { pliage: { facteurK: 0.42, source: "Essai interne atelier W, 2025" } } } }]).etat;
    const d1 = developpeTole(e1, T(e1, "t1"));
    expect(d1.nonEvalues).toEqual([]);
    const ba90 = (Math.PI / 2) * (0.002 + 0.42 * 0.002);
    expect(d1.encombrement.longueur).toBeCloseTo(0.4 + ba90 + 0.05, 5);
    const ba45 = (Math.PI / 4) * (0.002 + 0.42 * 0.002);
    expect(d1.encombrement.largeur).toBeCloseTo(0.3 + ba45 + 0.03, 5);
    expect(d1.lignesPli).toHaveLength(4);
    expect(d1.aire).toBeCloseTo(0.4 * 0.3 + (ba90 + 0.05) * 0.3 + (ba45 + 0.03) * 0.4, 7);
    expect(() => lot(e0, [{ type: "tole.modifier", params: { id: "t1", params: { pliage: { facteurK: 0.42 } } } }])).toThrow(/source/);
  });
  it("table de pliage sourcée du projet : ligne de l'angle exact (déduction) sinon ligne générique (K) ; matériau ou épaisseur inconnus → non évalué", () => {
    expect(validerCatalogueCsv(TABLE).importable).toBe(true);
    // Un catalogue d'une autre ontologie n'est pas une table de pliage.
    const eBois = lot(base(), [{ type: "catalogue.importer", params: { id: "bois", nom: "Sections bois", ontologie: "timber", csv: "designation;largeur_mm;hauteur_mm;source;edition;page\n45x145;45;145;Y;2025;p. 4\n" } }]).etat;
    expect(() => lot(eBois, [tole("tx", { pliage: { catalogueId: "bois" } })])).toThrow(/n'est pas une table de pliage/);
    const e0 = lot(base(), [{ type: "catalogue.importer", params: { id: "tab", nom: "Table W", ontologie: "sheetmetal", csv: TABLE } }, tole("t1", { pliage: { catalogueId: "tab" } })]).etat;
    const t = T(e0, "t1");
    const table = (e0.definitions["tab"]!.params["lignes"] as never) as Parameters<typeof parametresPli>[2];
    const p90 = parametresPli(t.params, t.params.plis[0]!, table);
    expect(p90.deduction).toBeCloseTo(0.0036, 9);
    expect(p90.allongement).toBeCloseTo(2 * (0.002 + 0.002) * Math.tan(Math.PI / 4) - 0.0036, 9);
    expect(p90.source).toBe("Table de pliage atelier W, 2025, p. 1");
    const p45 = parametresPli(t.params, t.params.plis[1]!, table);
    expect(p45.deduction).toBeNull();
    expect(p45.allongement).toBeCloseTo((Math.PI / 4) * (0.002 + 0.44 * 0.002), 9);
    const inconnu = developpe({ ...t.params, materiau: "aluminium" }, table);
    expect(inconnu.nonEvalues).toHaveLength(2);
    const tbl = genererTableau(e0, "pliage");
    expect(tbl.lignes).toHaveLength(2);
    expect(tbl.lignes[0]![9]).toBe("Table de pliage atelier W, 2025, p. 1");
  });
  it("tole.plier remplace le pli d'un bord, tole.deplier le retire ; deux plis sur un même bord ou angle nul refusés ; maillage fermé de volume ≈ aire développée × t ; IFC IfcPlate .SHEET.", () => {
    const e0 = lot(base(), [tole("t1", { pliage: { facteurK: 0.42, source: "Essai interne atelier W, 2025" } })]).etat;
    const e1 = lot(e0, [{ type: "tole.plier", params: { id: "t1", pli: { bord: "x1", angle: deg(90), longueur: m(0.08) } } }, { type: "tole.plier", params: { id: "t1", pli: { bord: "y1", angle: deg(90), longueur: m(0.02) } } }]).etat;
    expect(T(e1, "t1").params.plis).toHaveLength(3);
    expect(T(e1, "t1").params.plis.find((p) => p.bord === "x1")?.longueur.value).toBe(0.08);
    const e2 = lot(e1, [{ type: "tole.deplier", params: { id: "t1", bord: "y0" } }]).etat;
    expect(T(e2, "t1").params.plis.map((p) => p.bord).sort()).toEqual(["x1", "y1"]);
    expect(() => lot(e0, [{ type: "tole.modifier", params: { id: "t1", params: { plis: [{ bord: "x1", angle: deg(90), longueur: m(0.05) }, { bord: "x1", angle: deg(45), longueur: m(0.05) }] } } }])).toThrow(/deux plis/);
    expect(() => lot(e0, [{ type: "tole.modifier", params: { id: "t1", params: { plis: [{ bord: "x1", angle: deg(0), longueur: m(0.05) }] } } }])).toThrow(/non nul/);
    const vol = volumeMaillage(maillageObjet(e2, T(e2, "t1"))!);
    const dev = developpeTole(e2, T(e2, "t1"));
    // La zone pliée (arc à épaisseur) a un volume ≈ aire de fibre neutre × t : écart < 5 %.
    expect(Math.abs(vol - dev.aire * 0.002) / (dev.aire * 0.002)).toBeLessThan(0.05);
    const { contenu } = exporterIfc(e2, { projet: { id: "p", code: "P", nom: "Tôle" }, revision: 1, horodatage: "2026-10-08T00:00:00Z" });
    expect(contenu).toContain("IFCPLATE(");
    expect(contenu).toContain(".SHEET.");
    expect(contenu).toContain("Developpe");
  });
});
