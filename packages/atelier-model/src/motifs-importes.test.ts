import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { commandesImportDxf } from "./echanges/import-dxf.js";
import { modeleVide, objetsDeClasse, type ModeleAtelier, type Occurrence } from "./modele.js";
import { pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const contour = "91\n1\n92\n2\n72\n0\n73\n1\n93\n4\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50";
// ANSI31 (mm) : une ligne à 45°, décalage (−2,245064 ; 2,245064) → traits espacés de 3,175 mm ; ANSI37 : deux lignes, tirets.
const ansi31 = "52\n0\n41\n1\n77\n0\n78\n1\n53\n45\n43\n0\n44\n0\n45\n-2.2450640303\n46\n2.2450640303\n79\n0";
const tirets = "52\n0\n41\n1\n77\n0\n78\n2\n53\n0\n43\n0\n44\n0\n45\n0\n46\n5\n79\n2\n49\n3\n49\n-2\n53\n90\n43\n0\n44\n0\n45\n-5\n46\n0\n79\n0";
const dxf = (nom: string, motif: string) => ["0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC", "0\nSECTION\n2\nENTITIES", `0\nHATCH\n8\nSols\n2\n${nom}\n70\n0\n${contour}\n75\n0\n76\n1\n${motif}`, "0\nENDSEC\n0\nEOF"].join("\n");
const base = () => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "rdc", nom: "R", elevation: 0, hauteur: 3 } }])).etat;
const importer = (texte: string) => {
  const r = commandesImportDxf(base(), texte, { source: "m.dxf", niveauId: "rdc", repere: "local", uniteSiAbsente: "m" });
  let e: ModeleAtelier = base();
  for (const l of r.lots) e = appliquerLot(e, lot(l.commands, l.label)).etat;
  return { e, r, h: objetsDeClasse(e, "esquisse").find((o) => o.params.forme === "hachure")! };
};

describe("motifs DXF nommés importés (D-121, DA-01-11)", () => {
  it("ANSI31 : nom et ligne de définition gardés (45°, pas 3,175 mm en mètres modèle) ; vue dessinée sans avertissement", () => {
    const { e, r, h } = importer(dxf("ANSI31", ansi31));
    expect(h.params.motif).toBe("ANSI31");
    expect(h.params.motifLignes).toHaveLength(1);
    expect(h.params.motifLignes![0]!.angle).toBeCloseTo(45, 6);
    expect(h.params.motifLignes![0]!.pas).toBeCloseTo(0.003175, 9);
    expect(r.rapport.entites.find((x) => x.type === "HATCH")?.remarque).toMatch(/1 ligne\(s\) de définition/);
    const v = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "rdc" } }], "v")).etat;
    const g = genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v");
    expect(g.primitives.filter((p) => p.type === "ligne" && (p as { objetId?: string }).objetId === h.id).length).toBeGreaterThan(20);
    expect(g.avertissements.some((a) => /ANSI31/.test(a))).toBe(false);
  });

  it("deux lignes avec tirets : signalés, rendus en traits continus ; transformations ; saisie validée", () => {
    const { e, r, h } = importer(dxf("GRILLE", tirets));
    expect(h.params.motifLignes!.map((f) => [Math.round(f.angle), f.pas])).toEqual([[0, 0.005], [90, 0.005]]);
    expect(r.rapport.entites.find((x) => x.type === "HATCH")?.remarque).toMatch(/tirets rendus en traits continus/);
    const t = appliquerLot(e, lot([{ type: "transformer.echelle", params: { centre: pt(0, 0), facteur: 2 }, cibles: [h.id] }], "e")).etat;
    expect((t.objets[h.id] as Occurrence<"esquisse">).params.motifLignes![0]!.pas).toBeCloseTo(0.01, 9);
    const rot = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 30, unit: "deg" } }, cibles: [h.id] }], "t")).etat;
    expect((rot.objets[h.id] as Occurrence<"esquisse">).params.motifLignes![1]!.angle).toBeCloseTo(120, 6);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: h.id, params: { motifLignes: [{ angle: 0, pas: 0 }] } } }], "x"))).toThrow();
    const retour = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: h.id, params: { motif: null, motifLignes: null } } }], "c")).etat;
    expect((retour.objets[h.id] as Occurrence<"esquisse">).params.motifLignes).toBeUndefined();
  });
});
