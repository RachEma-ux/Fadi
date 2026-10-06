import { describe, expect, it } from "vitest";
import { contoursArchitecture } from "./blocs-places.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { commandesImportDxf } from "./echanges/import-dxf.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const miroirX = (cibles: string[]) => ({ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(0, 1) }, cibles }); // axe vertical x = 0

/** Contour d'un poteau ramené à un ensemble de sommets arrondis (ordre indifférent). */
const sommets = (e: ModeleAtelier, id: string) =>
  new Set(contoursArchitecture("poteau", e.objets[id]!.params as unknown as Record<string, unknown>)!.contour.map((q) => `${Math.round(q.x * 1e6) / 1e6};${Math.round(q.y * 1e6) / 1e6}`));
const reflet = (e: ModeleAtelier, id: string) => new Set([...sommets(e, id)].map((s) => { const [x, y] = s.split(";").map(Number); return `${Math.round(-x! * 1e6) / 1e6 || 0};${y}`; }));

describe("symétrie des poteaux profilés et orientation des textes (D-146, DA-02-04)", () => {
  const base = appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    ...(["I", "T", "L", "U"] as const).map((f, k) => ({ type: "poteau.creer", params: { id: f, niveauId: "n", point: pt(2 + k, 1), formeId: f, epaisseurProfil: m(0.02), largeur: m(0.2), profondeur: m(0.3), hauteur: m(3), angle: { value: 30, unit: "deg" } } })),
    { type: "texte.creer", params: { id: "t", niveauId: "n", position: pt(1, 1), texte: "Hall", angle: { value: 30, unit: "deg" } } },
  ])).etat;

  it("le contour symétrisé de chaque profilé est exactement le reflet du contour d'origine", () => {
    const e = appliquerLot(base, lot([miroirX(["I", "T", "L", "U"])])).etat;
    for (const f of ["I", "T", "L", "U"]) expect(sommets(e, f)).toEqual(reflet(base, f));
    expect((e.objets["L"] as Occurrence<"poteau">).params.miroir).toBe(true);
    expect((e.objets["T"] as Occurrence<"poteau">).params.miroir).toBeUndefined();
    // Deux symétries : retour à l'identité.
    const ee = appliquerLot(e, lot([miroirX(["L"])], "b")).etat;
    expect(sommets(ee, "L")).toEqual(sommets(base, "L"));
    expect((ee.objets["L"] as Occurrence<"poteau">).params.miroir).toBeUndefined();
  });

  it("texte : orientation suivie par la rotation, réfléchie lisible au miroir, dessinée et relue du DXF", () => {
    const r = appliquerLot(base, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 200, unit: "deg" } }, cibles: ["t"] }])).etat;
    expect((r.objets["t"] as Occurrence<"texte">).params.angle!.value).toBe(-130);
    const s = appliquerLot(base, lot([miroirX(["t"])], "s")).etat;
    expect((s.objets["t"] as Occurrence<"texte">).params.angle!.value).toBe(-30); // 2·90 − 30 = 150 → ramené lisible
    const v = appliquerLot(base, lot([{ type: "vue.creer", params: { id: "v", titre: "R", type: "plan", niveauId: "n", echelle: 50 } }], "v")).etat;
    const plan = genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v");
    expect(plan.primitives.find((p) => p.type === "texte" && (p as { texte: string }).texte === "Hall")).toMatchObject({ angle: 30 });
    const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "TEXT", "8", "0", "10", "1", "20", "2", "40", "0.25", "1", "Nord", "50", "45", "0", "ENDSEC", "0", "EOF"].join("\n");
    const imp = commandesImportDxf(base, dxf, { source: "t.dxf", niveauId: "n", repere: "local", uniteSiAbsente: "m" });
    const cmd = imp.lots.flatMap((l) => l.commands).find((c) => c.type === "texte.creer")!;
    expect((cmd.params as { angle?: { value: number } }).angle?.value).toBe(45);
  });
});
