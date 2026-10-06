import { describe, expect, it } from "vitest";
import { ANNEXE_C, classesIfcAttendues, controleClassesIfc } from "./annexe-c.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide } from "./modele.js";
import { CLASSES, type Classe } from "./ontologie.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

describe("contrôle croisé classe Fadi / classe IFC (D-111, annexe C)", () => {
  it("la classe de l'ontologie fait toujours partie de l'annexe C", () => {
    for (const c of Object.keys(CLASSES) as Classe[]) expect(classesIfcAttendues(c)).toContain(CLASSES[c].ifc);
    expect(ANNEXE_C.toiture).toEqual(["IfcSlab", "IfcRoof"]);
  });

  it("classe IFC déclarée incohérente : signalée (problèmes, rapport IFC), jamais corrigée ; cohérente ou classée par la règle : rien", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w1", niveauId: "n", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "n", a: pt(0, 3), b: pt(4, 3), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "propriete.definir", params: { id: "w1", nom: "classeIfc", valeur: "IfcDoor" } },
      { type: "propriete.definir", params: { id: "w2", nom: "classeIfc", valeur: "ifcwall" } },
    ])).etat;
    const x = controleClassesIfc(e);
    expect(x.map((i) => [i.objetId, i.declaree, i.attendues])).toEqual([["w1", "IfcDoor", ["IfcWall"]]]);
    expect(e.objets["w1"]!.proprietes["classeIfc"]!.valeur).toBe("IfcDoor");
    const r = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" });
    expect(r.rapport.remarques.some((t) => /w1 : classe IFC déclarée IfcDoor, annexe C : IfcWall/.test(t))).toBe(true);
    expect(r.contenu).toMatch(/IFCWALL\(/);
  });
});

describe("classification en lot par règle (D-112)", () => {
  it("proposition par classe, type et niveau ; déjà classés et verrouillés écartés ; un seul lot, inverse exact", async () => {
    const { proposerClassification } = await import("./classification-regle.js");
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "niveau.creer", params: { id: "n2", nom: "R+1", elevation: 3, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w1", niveauId: "n", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "n", a: pt(0, 3), b: pt(4, 3), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "w3", niveauId: "n2", a: pt(0, 3), b: pt(4, 3), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "w4", niveauId: "n", a: pt(9, 3), b: pt(9, 5), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "classification.affecter", params: { id: "w2", systeme: "CFC", code: "211" } },
      { type: "objet.verrouiller", params: { ids: ["w4"], verrouille: true } },
    ])).etat;
    const p = proposerClassification(e, { classe: "mur", systeme: "CFC", code: "214", niveauId: "n" });
    expect(p.cibles).toEqual(["w1"]);
    expect(p.dejaClasses).toEqual(["w2"]);
    expect(p.verrouilles).toEqual(["w4"]);
    expect(p.commandes).toEqual([{ type: "classification.affecter", params: { ids: ["w1"], systeme: "CFC", code: "214" } }]);
    expect(e.objets["w1"]!.proprietes["classification:CFC"]).toBeUndefined();
    const tous = proposerClassification(e, { classe: "mur", systeme: "CFC", code: "214", remplacer: true });
    expect(tous.cibles).toEqual(["w1", "w2", "w3"]);
    const r = appliquerLot(e, lot(tous.commandes, "a"));
    expect(["w1", "w2", "w3"].map((id) => r.etat.objets[id]!.proprietes["classification:CFC"]!.valeur)).toEqual(["214", "214", "214"]);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    expect(proposerClassification(e, { classe: "mur", systeme: "CFC", code: "" }).commandes).toEqual([]);
  });
});
