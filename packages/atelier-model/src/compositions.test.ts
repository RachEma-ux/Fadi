import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { compositionMur, separationsCouches } from "./compositions.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { m, pt } from "./unites.js";
import { collisions } from "./versions.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const couches = [
  { materiau: "Enduit", epaisseur: m(0.02), fonction: "parement" },
  { materiau: "Béton", epaisseur: m(0.18), fonction: "porteur" },
  { materiau: "Laine minérale", epaisseur: m(0.16), fonction: "isolant" },
];
const modele = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "type.definir", params: { id: "ext", classe: "mur", nom: "Mur extérieur isolé", params: { couches } } },
    { type: "mur.tracer", params: { id: "w1", niveauId: "n0", a: pt(0, 0), b: pt(6, 0), epaisseur: m(0.36), hauteur: m(3), definitionId: "ext" } },
    { type: "mur.tracer", params: { id: "w2", niveauId: "n0", a: pt(0, 0), b: pt(0, 4), epaisseur: m(0.2), hauteur: m(3), definitionId: "ext" } },
    { type: "ouverture.poser", params: { classe: "porte", murHoteId: "w1", position: 0.5, largeur: m(1), hauteur: m(2.1) } },
  ])).etat;
const VUE: ParamsVue = { type: "plan", titre: "Rez", echelle: 50, niveauId: "n0", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null };

describe("composition des parois (D-026)", () => {
  it("couches validées sur le type ; cohérence avec l'épaisseur du mur ; mur incohérent signalé, jamais corrigé", () => {
    const e = modele();
    const c1 = compositionMur(e, e.objets["w1"] as Occurrence<"mur">)!;
    expect(c1).toMatchObject({ typeId: "ext", total: 0.36, coherente: true });
    expect(c1.couches[1]).toEqual({ materiau: "Béton", epaisseur: { value: 0.18, unit: "m" }, fonction: "porteur" });
    const c2 = compositionMur(e, e.objets["w2"] as Occurrence<"mur">)!;
    expect(c2).toMatchObject({ coherente: false, ecart: -0.16 });
    expect(collisions(e).filter((x) => x.type === "composition-incoherente").map((x) => x.objets[0])).toEqual(["w2"]);
    expect((e.objets["w2"] as Occurrence<"mur">).params.epaisseur.value).toBe(0.2);
    expect(() => appliquerLot(e, lot([{ type: "type.modifier", params: { id: "ext", params: { couches: [{ materiau: "", epaisseur: m(0.1) }] } } }]))).toThrow(/matériau requis/);
    expect(() => appliquerLot(e, lot([{ type: "type.modifier", params: { id: "ext", params: { couches: [{ materiau: "X", epaisseur: m(-1) }] } } }]))).toThrow(/épaisseur/);
    // Retirer les couches : composition « non renseignée ».
    const sans = appliquerLot(e, lot([{ type: "type.modifier", params: { id: "ext", params: { couches: null } } }])).etat;
    expect(compositionMur(sans, sans.objets["w1"] as Occurrence<"mur">)).toBeNull();
  });

  it("plan : séparations des couches en trait fin, interrompues au droit de la porte ; aucune pour un mur incohérent", () => {
    const e = modele();
    const seps = separationsCouches(e, e.objets["w1"] as Occurrence<"mur">);
    expect(seps).toHaveLength(2);
    // Mur w1 en axe, épaisseur 0,36 : face gauche à y = 0,18 ; séparations à 0,16 et −0,02.
    expect(seps.map((x) => Math.round(x.a.y * 1000) / 1000).sort((a, b) => a - b)).toEqual([-0.02, 0.16]);
    expect(separationsCouches(e, e.objets["w2"] as Occurrence<"mur">)).toEqual([]);
    const vue = genererVue(e, VUE);
    const fins = vue.primitives.filter((p) => p.type === "ligne" && p.trait === "fin" && p.objetId === "w1");
    expect(fins).toHaveLength(4); // deux séparations coupées par la baie de la porte
    const sansType = appliquerLot(e, lot([{ type: "type.modifier", params: { id: "ext", params: { couches: null } } }])).etat;
    expect(genererVue(sansType, VUE).empreinte).not.toBe(vue.empreinte);
  });

  it("IFC : un IfcMaterialLayerSet par type composé, associé au type et aux murs cohérents ; le mur incohérent est dit au rapport", () => {
    const e = modele();
    const { contenu, rapport } = exporterIfc(e, { projet: { id: "p", nom: "Essai", code: "E" }, revision: 1, horodatage: "2026-10-04T00:00:00" });
    expect(contenu).toMatch(/IFCMATERIAL\('B\\X2\\00E9\\X0\\ton',\$,\$\)/);
    expect((contenu.match(/IFCMATERIALLAYER\(/g) ?? []).length).toBe(3);
    expect(contenu).toMatch(/IFCMATERIALLAYERSET\(\(#\d+,#\d+,#\d+\),'Mur ext\\X2\\00E9\\X0\\rieur isol\\X2\\00E9\\X0\\',\$\)/);
    const assoc = /IFCRELASSOCIATESMATERIAL\([^;]*,\((#\d+(?:,#\d+)*)\),#\d+\);/.exec(contenu)!;
    expect(assoc[1]!.split(",")).toHaveLength(2); // le type et le mur cohérent
    expect(rapport.remarques.some((r) => /w2 : épaisseur différente/.test(r))).toBe(true);
  });
});
