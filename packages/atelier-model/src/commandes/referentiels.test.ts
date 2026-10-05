import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2) } },
  ])).etat;
const charger: Commande = { type: "referentiel.charger", params: { id: "ref-cfc", systeme: "CFC", edition: "2017", source: "fichier cfc.csv (saisi par l'utilisateur)", codes: [{ code: "211", libelle: "Travaux de l'entreprise de maçonnerie" }, { code: "211.1", libelle: "Échafaudages" }, { code: "214" }] } };

describe("référentiels de classification chargés explicitement (D-065)", () => {
  it("sans référentiel : code texte, « déclaré » ; avec : code vérifié, libellé noté ; code absent refusé avec codes proches", () => {
    const e = base();
    const libre = appliquerLot(e, lot([{ type: "classification.affecter", params: { id: "w", systeme: "CFC", code: "999" } }], "l")).etat;
    expect(libre.objets["w"]!.proprietes["classification:CFC"]).toMatchObject({ valeur: "999", statut: "declaree" });
    const r = appliquerLot(e, lot([charger, { type: "classification.affecter", params: { id: "w", systeme: "CFC", code: "211.1" } }], "c")).etat;
    expect(r.objets["w"]!.proprietes["classification:CFC"]).toMatchObject({ valeur: "211.1", statut: "verifiee" });
    expect(r.objets["w"]!.proprietes["classification:CFC:libelle"]).toMatchObject({ valeur: "Échafaudages" });
    expect(() => appliquerLot(r, lot([{ type: "classification.affecter", params: { id: "w", systeme: "CFC", code: "212" } }]))).toThrow(/absent du référentiel CFC \(2017\).*codes proches : 211, 211\.1, 214/);
    // Retrait : code et libellé disparaissent.
    const x = appliquerLot(r, lot([{ type: "classification.affecter", params: { id: "w", systeme: "CFC", code: null } }], "x")).etat;
    expect(Object.keys(x.objets["w"]!.proprietes).filter((k) => k.startsWith("classification:"))).toEqual([]);
  });

  it("recharger le même système remplace (version suivante) ; retirer ; archive ; refus de doublons et de liste vide", () => {
    const e = appliquerLot(base(), lot([charger], "c")).etat;
    const r2 = appliquerLot(e, lot([{ type: "referentiel.charger", params: { systeme: "CFC", edition: "2020", source: "cfc-2020.csv", codes: { "211": "Maçonnerie" } } }], "c2")).etat;
    expect(r2.definitions["ref-cfc"]).toMatchObject({ nom: "CFC (2020)", version: 2 });
    expect(verifierModele(JSON.parse(JSON.stringify(r2))).ok).toBe(true);
    expect(Object.keys(appliquerLot(r2, lot([{ type: "referentiel.retirer", params: { id: "ref-cfc" } }], "x")).etat.definitions)).toEqual([]);
    expect(() => appliquerLot(base(), lot([{ type: "referentiel.charger", params: { systeme: "CFC", source: "x", codes: [{ code: "1" }, { code: "1" }] } }]))).toThrow(/double/);
    expect(() => appliquerLot(base(), lot([{ type: "referentiel.charger", params: { systeme: "CFC", source: "x", codes: [] } }]))).toThrow(/codes/);
    expect(() => appliquerLot(e, lot([{ type: "definition.supprimer", params: { id: "ref-cfc" } }]))).toThrow(/referentiel\.retirer/);
  });
});

describe("référentiel en CSV (D-065)", () => {
  it("en-tête ignoré, séparateur détecté, guillemets, ligne sans code refusée", async () => {
    const { lireReferentielCsv } = await import("./referentiels.js");
    const r = lireReferentielCsv('Code;Libellé\n211;Maçonnerie\n"211.1";"Échafaudages; location"\n;sans code\n\n');
    expect(r.codes).toEqual([{ code: "211", libelle: "Maçonnerie" }, { code: "211.1", libelle: "Échafaudages; location" }]);
    expect(r.refus).toEqual([{ ligne: 4, motif: "code vide" }]);
    expect(lireReferentielCsv("A1,Mur extérieur\nA2,Mur intérieur").codes).toHaveLength(2);
  });
});

describe("classification à l'export IFC (D-065)", () => {
  it("IfcClassification (source, édition), IfcClassificationReference (code, libellé), association à l'objet", async () => {
    const { exporterIfc } = await import("../echanges/ifc.js");
    const e = appliquerLot(base(), lot([charger, { type: "classification.affecter", params: { id: "w", systeme: "CFC", code: "211.1" } }], "c")).etat;
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "Essai", code: "E" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu;
    expect(ifc).toMatch(/IFCCLASSIFICATION\('fichier cfc\.csv \(saisi par l\\X2\\[0-9A-F]+\\X0\\utilisateur\)'|IFCCLASSIFICATION\('fichier cfc\.csv/);
    expect(ifc).toMatch(/IFCCLASSIFICATIONREFERENCE\(\$,'211\.1',/);
    expect(ifc).toMatch(/IFCRELASSOCIATESCLASSIFICATION\(/);
    const sans = exporterIfc(base(), { projet: { id: "p", nom: "Essai", code: "E" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu;
    expect(sans).not.toMatch(/IFCCLASSIFICATION/);
  });
});
