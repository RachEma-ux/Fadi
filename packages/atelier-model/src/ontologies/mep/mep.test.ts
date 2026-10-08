import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "../../commandes/index.js";
import type { Commande } from "../../commandes/base.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../../modele.js";
import { csvTableau, genererTableau } from "../../documents/tableaux.js";
import { exporterIfc } from "../../echanges/ifc.js";
import { maillageObjet } from "../../projection/maillage.js";
import { volumeMaillage } from "../../geometrie-3d.js";
import { connexions, etatConnexions, incompatibilites, portsDe, portsLibres, reseauxConnexes } from "./connectivite.js";
import { schemaPid, svgPid } from "./pid.js";
import { designationReseau, sectionReseauDepuisCatalogue } from "./sections.js";
import { validerCatalogueCsv } from "../../catalogues/csv-source.js";
import { longueurSegment, maillageRaccordReseau } from "./geometrie.js";

const pt = (x: number, y: number) => ({ x, y, frame: "local" as const, unit: "m" as const });
const m = (value: number) => ({ value, unit: "m" as const });
const P3 = (x: number, y: number, z: number) => ({ x, y, z });
let n = 0;
const lot = (etat: ModeleAtelier, commands: Commande[], label = "lot") => appliquerLot(etat, { requestId: `req-mep-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
const base = () => lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }, { type: "ontologie.activer", params: { nom: "mep" } }]).etat;
const CSV = "designation;diametre_exterieur_mm;epaisseur_mm;diametre_nominal;fluide;materiau;source;edition;page\nTube 60,3 x 2,9;60,3;2,9;DN 50;eau;acier;Catalogue tubes T;2025;p. 7\nTube 33,7 x 2,6;33,7;2,6;DN 25;eau;acier;Catalogue tubes T;2025;p. 7\nTube 100 x 60;100;60;DN 80;;acier;Catalogue tubes T;2025;p. 9\n";
const D50 = { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) };
const D25 = { forme: "circulaire", diametre: m(0.0337), epaisseur: m(0.0026) };
const O = <C extends "segment-reseau" | "raccord-reseau" | "vanne" | "equipement-reseau" | "support-reseau">(etat: ModeleAtelier, id: string) => etat.objets[id] as Occurrence<C>;
const pbReseau = (etat: ModeleAtelier) => Object.values(etat.problemes).filter((p) => p.type === "reseau");

describe("ontologie réseaux (P2-5) : isolation, activation, catalogue sourcé", () => {
  it("aucun module n'importe une autre ontologie ni d'adaptateur ; aucune table de diamètres nominaux ni de débit dans le code", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/from "\.\.\/(mechanical|structure|timber|sheetmetal)/);
      expect(src, f).not.toMatch(/from "react|from "express|document\./);
      expect(src, f).not.toMatch(/\bDN\s?\d{2,3}\b|\b(60\.3|33\.7|48\.3|88\.9|114\.3)\b|\b(debit|pression)\s*[:=]\s*\d/);
    }
  });
  it("les classes de réseau sont refusées tant que l'ontologie n'est pas active ; désactivation refusée tant qu'un objet existe", () => {
    const e0 = lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }]).etat;
    expect(() => lot(e0, [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50 } }])).toThrow(/non activée/);
    const e1 = lot(base(), [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50 } }]).etat;
    expect(e1.ontologies).toEqual(["mep"]);
    expect(() => lot(e1, [{ type: "ontologie.desactiver", params: { nom: "mep" } }])).toThrow(/objet/);
  });
  it("catalogue tubes-raccords.csv sourcé : section, DN, fluide et matériau de la ligne ; épaisseur incompatible et désignation absente refusées", () => {
    const rapport = validerCatalogueCsv(CSV);
    expect(rapport.importable).toBe(true);
    const s = sectionReseauDepuisCatalogue("cat", rapport.retenues[0]!);
    expect(s.section).toEqual({ forme: "circulaire", diametre: { value: 0.0603, unit: "m" }, epaisseur: { value: 0.0029, unit: "m" } });
    expect(s.profil).toEqual({ catalogueId: "cat", designation: "Tube 60,3 x 2,9", source: "Catalogue tubes T, 2025, p. 7", diametreNominal: "DN 50" });
    expect(s.fluide).toBe("eau");
    expect(designationReseau(s.section, s.profil)).toBe("Tube 60,3 x 2,9 (DN 50)");
    expect(() => sectionReseauDepuisCatalogue("cat", rapport.retenues[2]!)).toThrow(/incompatible/);
    const e = lot(base(), [{ type: "catalogue.importer", params: { id: "cat", nom: "Tubes T", ontologie: "mep", csv: CSV } }]).etat;
    const e1 = lot(e, [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { catalogueId: "cat", designation: "tube 60,3 x 2,9" } } }]).etat;
    const seg = O<"segment-reseau">(e1, "s");
    expect(seg.params.profil?.diametreNominal).toBe("DN 50");
    expect(seg.params.fluide).toBe("eau");
    expect(seg.params.materiau).toBe("acier");
    expect(() => lot(e, [{ type: "segmentReseau.creer", params: { id: "s2", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { catalogueId: "cat", designation: "DN 80" } } }])).toThrow(/absent du catalogue/);
    expect(() => lot(e, [{ type: "segmentReseau.creer", params: { id: "s3", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { forme: "rectangulaire", largeur: m(0.3), hauteur: m(0.2) } } }])).toThrow(/circulaire/);
    // Provenance jamais reprise du client : relue dans le catalogue (source et DN recalculés), catalogue inconnu refusé.
    const e2 = lot(e, [{ type: "segmentReseau.creer", params: { id: "s4", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { ...D50, profil: { catalogueId: "cat", designation: "Tube 60,3 x 2,9", source: "source inventée" } } } }]).etat;
    expect(O<"segment-reseau">(e2, "s4").params.profil).toEqual({ catalogueId: "cat", designation: "Tube 60,3 x 2,9", source: "Catalogue tubes T, 2025, p. 7", diametreNominal: "DN 50" });
    expect(() => lot(e, [{ type: "segmentReseau.creer", params: { id: "s5", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { ...D50, profil: { catalogueId: "nope", designation: "x", source: "x" } } } }])).toThrow(/catalogue inconnu/);
  });
});

describe("routage, ports et connectivité", () => {
  it("reseau.router : une polyligne 3D en L devient deux segments et un coude connectés dans une révision ; les bras raccourcissent les segments ; deux ports libres aux extrémités", () => {
    const e = lot(base(), [{ type: "reseau.router", params: { id: "t", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5), P3(4, 3, 2.5)], section: D50, fluide: "eau", sens: "a-vers-b", coude: { longueur: m(0.1) }, prefixe: "Eau froide" } }]).etat;
    const s1 = O<"segment-reseau">(e, "t-1"), s2 = O<"segment-reseau">(e, "t-2"), c = O<"raccord-reseau">(e, "t-c1");
    expect(s1.params.sommets).toEqual([P3(0, 0, 2.5), P3(3.9, 0, 2.5)]);
    expect(s2.params.sommets).toEqual([P3(4, 0.1, 2.5), P3(4, 3, 2.5)]);
    expect(c.params.type).toBe("coude");
    expect(portsDe(c).map((p) => [p.id, p.position])).toEqual([["1", P3(3.9, 0, 2.5)], ["2", P3(4, 0.1, 2.5)]]);
    expect(connexions(e)).toHaveLength(2);
    expect(etatConnexions(e).every((x) => x.motifs.length === 0)).toBe(true);
    expect(portsLibres(e).map((p) => `${p.objetId}:${p.id}`)).toEqual(["t-1:a", "t-2:b"]);
    expect(reseauxConnexes(e)).toEqual([{ id: "reseau:t-1", objets: ["t-1", "t-2", "t-c1"], connexions: expect.any(Array), systemes: ["tuyau"], fluides: ["eau"] }]);
    expect(longueurSegment(s1.params)).toBeCloseTo(3.9, 9);
    expect(pbReseau(e)).toHaveLength(0);
    expect(() => lot(base(), [{ type: "reseau.router", params: { niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(0.08, 0, 2.5), P3(0.08, 3, 2.5)], section: D50, coude: { longueur: m(0.1) } } }])).toThrow(/trop court/);
  });
  it("compatibilité sans table de valeurs : sections, systèmes, fluides, sens et distance des ports ; refus nommés", () => {
    const e = lot(base(), [
      { type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50, fluide: "eau", sens: "a-vers-b" } },
      { type: "equipementReseau.creer", params: { id: "pompe", niveauId: "n1", nom: "Pompe P1", type: "pompe", categorie: "mouvement", position: pt(4.5, 0), z: 2.2, longueur: m(0.6), largeur: m(0.4), hauteur: m(0.6), ports: [{ id: "asp", dx: -0.5, dy: 0, dz: 0.3, sens: "entree", section: D50, systeme: "tuyau", fluide: "eau" }, { id: "ref", dx: 0.5, dy: 0, dz: 0.3, sens: "sortie", section: D25, systeme: "tuyau", fluide: "eau" }, { id: "gaz", dx: 0, dy: 0.5, dz: 0.3, sens: "entree", section: D50, systeme: "tuyau", fluide: "gaz" }] } },
      { type: "segmentReseau.creer", params: { id: "s25", niveauId: "n1", systeme: "tuyau", sommets: [P3(5, 0, 2.5), P3(8, 0, 2.5)], section: D25, sens: "b-vers-a" } },
      { type: "segmentReseau.creer", params: { id: "g", niveauId: "n1", systeme: "gaine", sommets: [P3(4, 0, 2.5), P3(4, 2, 2.5)], section: { forme: "rectangulaire", largeur: m(0.3), hauteur: m(0.2) } } },
    ]).etat;
    const ports = portsDe(O<"equipement-reseau">(e, "pompe"));
    expect(ports.map((p) => [p.id, p.position, p.sens])).toEqual([["asp", P3(4, 0, 2.5), "entree"], ["ref", P3(5, 0, 2.5), "sortie"], ["gaz", P3(4.5, 0.5, 2.5), "entree"]]);
    // Segment s (sortie en b) → aspiration (entrée) : compatible, connexion créée ; rejouée : rien de plus.
    const e1 = lot(e, [{ type: "reseau.connecter", params: { a: "s", portA: "b", b: "pompe", portB: "asp" } }]).etat;
    expect(connexions(e1)).toHaveLength(1);
    expect(connexions(lot(e1, [{ type: "reseau.connecter", params: { a: "pompe", portA: "asp", b: "s", portB: "b" } }]).etat)).toHaveLength(1);
    expect(() => lot(e1, [{ type: "reseau.connecter", params: { a: "s", portA: "b", b: "pompe", portB: "gaz" } }])).toThrow(/déjà connecté/);
    // Sections différentes (D50 / D25), sens contradictoires (deux sorties), fluides différents, ports distants, systèmes différents.
    expect(incompatibilites(portsDe(O<"segment-reseau">(e, "s"))[1]!, ports[1]!)).toEqual(expect.arrayContaining([expect.stringMatching(/sections différentes/), expect.stringMatching(/deux sorties/), expect.stringMatching(/distants de 1000 mm/)]));
    expect(() => lot(e, [{ type: "reseau.connecter", params: { a: "s", portA: "b", b: "pompe", portB: "gaz" } }])).toThrow(/fluides différents \(eau \/ gaz\)/);
    expect(() => lot(e, [{ type: "reseau.connecter", params: { a: "g", portA: "a", b: "pompe", portB: "asp" } }])).toThrow(/systèmes différents/);
    // Refoulement (sortie, D25) → s25 port a (sens b-vers-a : a est une sortie) : deux sorties → refus ; s25 retourné : compatible.
    expect(() => lot(e1, [{ type: "reseau.connecter", params: { a: "pompe", portA: "ref", b: "s25", portB: "a" } }])).toThrow(/deux sorties/);
    const e2 = lot(e1, [{ type: "segmentReseau.modifier", params: { id: "s25", params: { sens: "a-vers-b" } } }, { type: "reseau.connecter", params: { a: "pompe", b: "s25" } }]).etat;
    expect(connexions(e2)).toHaveLength(2);
    expect(connexions(e2)[1]!.params).toEqual({ portA: "ref", portB: "a" });
    // Forcer une connexion incompatible : admise, mais signalée comme problème « reseau » tant qu'elle dure.
    const e3 = lot(e2, [{ type: "reseau.connecter", params: { id: "cx-forcee", a: "g", portA: "b", b: "pompe", portB: "gaz", forcer: true } }]).etat;
    expect(pbReseau(e3).map((p) => p.message)).toEqual([expect.stringMatching(/cx-forcee .*systèmes différents/)]);
    const e4 = lot(e3, [{ type: "reseau.deconnecter", params: { id: "cx-forcee" } }]).etat;
    expect(pbReseau(e4)).toHaveLength(0);
    expect(connexions(e4)).toHaveLength(2);
  });
  it("une connexion est rejugée après chaque commande : l'équipement déplacé rompt ses connexions (problème « reseau »), ramené les répare ; supprimé, elles disparaissent", () => {
    const e = lot(base(), [
      { type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50, fluide: "eau" } },
      { type: "equipementReseau.creer", params: { id: "cta", niveauId: "n1", nom: "CTA", type: "centrale", categorie: "traitement", position: pt(4.5, 0), z: 2.2, longueur: m(1), largeur: m(0.6), hauteur: m(0.6), ports: [{ id: "e", dx: -0.5, dy: 0, dz: 0.3, sens: "entree", section: D50, systeme: "tuyau" }] } },
      { type: "reseau.connecter", params: { a: "s", b: "cta" } },
    ]).etat;
    expect(pbReseau(e)).toHaveLength(0);
    const e1 = lot(e, [{ type: "transformer.deplacer", params: { dx: 0, dy: 0.02 }, cibles: ["cta"] }]).etat;
    expect(pbReseau(e1).map((p) => p.message)).toEqual([expect.stringMatching(/ports distants de 20 mm/)]);
    const e2 = lot(e1, [{ type: "transformer.deplacer", params: { dx: 0, dy: -0.02 }, cibles: ["cta"] }]).etat;
    expect(pbReseau(e2)).toHaveLength(0);
    expect(() => lot(e2, [{ type: "transformer.echelle", params: { facteur: 2, centre: pt(0, 0) }, cibles: ["s"] }])).toThrow(/échelle/);
    const e3 = lot(e2, [{ type: "equipementReseau.supprimer", params: { id: "cta" } }]).etat;
    expect(connexions(e3)).toHaveLength(0);
    expect(portsLibres(e3)).toHaveLength(2);
  });
  it("vanne anti-retour : entrée en 1, sortie en 2 ; vanne trois voies : trois ports ; raccords : nombre de ports par type, réduction avec section propre", () => {
    const e = lot(base(), [
      { type: "vanne.creer", params: { id: "v", niveauId: "n1", nom: "V1", type: "anti-retour", position: pt(2, 0), z: 2.5, section: D50, longueur: m(0.2), fluide: "eau" } },
      { type: "vanne.creer", params: { id: "v3", niveauId: "n1", type: "trois-voies", position: pt(2, 4), z: 2.5, angle: { value: 90, unit: "deg" }, section: D50, longueur: m(0.2) } },
      { type: "raccordReseau.creer", params: { id: "red", niveauId: "n1", type: "reduction", systeme: "tuyau", position: pt(6, 0), z: 2.5, section: D50, ports: [{ id: "1", dx: -0.05, section: D50 }, { id: "2", dx: 0.05, section: D25 }] } },
    ]).etat;
    const pv = portsDe(O<"vanne">(e, "v"));
    expect(pv.map((p) => [p.id, p.sens, p.position.x])).toEqual([["1", "entree", 1.9], ["2", "sortie", 2.1]]);
    const p3 = portsDe(O<"vanne">(e, "v3"));
    expect(p3).toHaveLength(3);
    expect(p3[2]!.position.x).toBeCloseTo(1.9, 9);
    expect(portsDe(O<"raccord-reseau">(e, "red")).map((p) => designationReseau(p.section))).toEqual(["Ø 60 × 2.9 mm", "Ø 34 × 2.6 mm"]);
    expect(() => lot(base(), [{ type: "raccordReseau.creer", params: { id: "te", niveauId: "n1", type: "te", systeme: "tuyau", position: pt(0, 0), section: D50, ports: [{ id: "1", dx: -0.1 }, { id: "2", dx: 0.1 }] } }])).toThrow(/3 port\(s\), 2 donné/);
    expect(() => lot(base(), [{ type: "raccordReseau.creer", params: { id: "r", niveauId: "n1", type: "reduction", systeme: "tuyau", position: pt(0, 0), section: D50, ports: [{ id: "1", dx: -0.1 }, { id: "2", dx: 0.1 }] } }])).toThrow(/section propre/);
    expect(() => lot(base(), [{ type: "vanne.creer", params: { id: "v", niveauId: "n1", type: "arret", position: pt(0, 0), section: D50 } }])).toThrow(/longueur/);
  });
  it("connecterProches relie les ports libres coïncidents et compatibles ; deux tuyaux et un raccord forment un réseau vérifié", () => {
    const e = lot(base(), [
      { type: "segmentReseau.creer", params: { id: "a", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(3.9, 0, 2.5)], section: D50, fluide: "eau", sens: "a-vers-b" } },
      { type: "raccordReseau.creer", params: { id: "c", niveauId: "n1", type: "coude", systeme: "tuyau", position: pt(4, 0), z: 2.5, section: D50, fluide: "eau", ports: [{ id: "1", dx: -0.1 }, { id: "2", dy: 0.1 }] } },
      { type: "segmentReseau.creer", params: { id: "b", niveauId: "n1", systeme: "tuyau", sommets: [P3(4, 0.1, 2.5), P3(4, 3, 2.5)], section: D50, fluide: "eau", sens: "a-vers-b" } },
      { type: "segmentReseau.creer", params: { id: "loin", niveauId: "n1", systeme: "tuyau", sommets: [P3(10, 0, 2.5), P3(12, 0, 2.5)], section: D50 } },
      { type: "reseau.connecterProches", params: {} },
    ]).etat;
    expect(connexions(e).map((c) => [c.sourceId, c.params["portA"], c.targetId, c.params["portB"]])).toEqual([["a", "b", "c", "1"], ["b", "a", "c", "2"]]);
    expect(reseauxConnexes(e).map((r) => r.objets)).toEqual([["a", "b", "c"], ["loin"]]);
    expect(pbReseau(e)).toHaveLength(0);
  });
});

describe("spécifications, supports, géométrie, documents, IFC", () => {
  it("spécification pilotée par un catalogue : désignation admise seule acceptée, fluide et matériau hérités ; suppression refusée tant qu'elle est suivie", () => {
    const e = lot(base(), [
      { type: "catalogue.importer", params: { id: "cat", nom: "Tubes T", ontologie: "mep", csv: CSV } },
      { type: "specification.definir", params: { id: "spec-ef", nom: "Eau froide acier", systeme: "tuyau", fluide: "eau froide", materiau: "acier", catalogueId: "cat", designations: ["Tube 60,3 x 2,9"] } },
      { type: "specification.definir", params: { id: "spec-g", nom: "Gaines", systeme: "gaine" } },
    ]).etat;
    expect(() => lot(e, [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50, specificationId: "spec-ef" } }])).toThrow(/à prendre dans son catalogue/);
    expect(() => lot(e, [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { catalogueId: "cat", designation: "Tube 33,7 x 2,6" }, specificationId: "spec-ef" } }])).toThrow(/non admise/);
    expect(() => lot(e, [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "gaine", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { forme: "rectangulaire", largeur: m(0.3), hauteur: m(0.2) }, specificationId: "spec-ef" } }])).toThrow(/système tuyau, objet gaine/);
    const e1 = lot(e, [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: { catalogueId: "cat", designation: "Tube 60,3 x 2,9" }, specificationId: "spec-ef" } }]).etat;
    expect(O<"segment-reseau">(e1, "s").params.fluide).toBe("eau froide");
    expect(O<"segment-reseau">(e1, "s").params.materiau).toBe("acier");
    expect(() => lot(e1, [{ type: "specification.supprimer", params: { id: "spec-ef" } }])).toThrow(/la suivent encore/);
    expect(lot(e1, [{ type: "specification.supprimer", params: { id: "spec-g" } }]).etat.definitions["spec-g"]).toBeUndefined();
  });
  it("supports : attachés à un segment (suspente avec longueur), supprimés avec lui ; signalés à réparer si le segment disparaît autrement", () => {
    const e = lot(base(), [
      { type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "gaine", sommets: [P3(0, 0, 2.8), P3(6, 0, 2.8)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.25) } } },
      { type: "supportReseau.creer", params: { id: "sp1", porteId: "s", type: "suspente", position: pt(1.5, 0), z: 2.8, longueur: m(0.3) } },
      { type: "supportReseau.creer", params: { id: "sp2", porteId: "s", type: "collier", position: pt(4.5, 0), z: 2.8 } },
    ]).etat;
    expect(O<"support-reseau">(e, "sp1").niveauId).toBe("n1");
    expect(() => lot(e, [{ type: "supportReseau.creer", params: { id: "sp3", porteId: "s", type: "suspente", position: pt(3, 0), z: 2.8 } }])).toThrow(/longueur/);
    expect(() => lot(e, [{ type: "supportReseau.creer", params: { id: "sp3", porteId: "sp1", type: "collier", position: pt(3, 0) } }])).toThrow(/n'est pas un segment/);
    const e1 = lot(e, [{ type: "segmentReseau.supprimer", params: { id: "s" } }]).etat;
    expect(Object.keys(e1.objets)).toEqual([]);
    const e2 = lot(e, [{ type: "objet.supprimer", params: { id: "s" } }]).etat;
    expect(Object.values(e2.problemes).filter((p) => p.type === "reference-a-reparer").map((p) => p.objetId).sort()).toEqual(["sp1", "sp2"]);
  });
  it("géométrie : tube creux (volume = couronne × longueur), gaine rectangulaire (boîte), équipement (boîte), vanne et raccord maillés", () => {
    const e = lot(base(), [
      { type: "segmentReseau.creer", params: { id: "t", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(3, 0, 2.5), P3(3, 0, 1)], section: D50 } },
      { type: "segmentReseau.creer", params: { id: "g", niveauId: "n1", systeme: "gaine", sommets: [P3(0, 2, 2.8), P3(5, 2, 2.8)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.25) } } },
      { type: "equipementReseau.creer", params: { id: "eq", niveauId: "n1", nom: "E", type: "ventilateur", categorie: "mouvement", position: pt(6, 2), z: 0, angle: { value: 30, unit: "deg" }, longueur: m(1), largeur: m(0.5), hauteur: m(0.8), ports: [{ id: "1", dx: 0.5, section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.25) }, systeme: "gaine" }] } },
      { type: "vanne.creer", params: { id: "v", niveauId: "n1", type: "arret", position: pt(1, 0), z: 2.5, section: D50, longueur: m(0.15) } },
      { type: "raccordReseau.creer", params: { id: "c", niveauId: "n1", type: "te", systeme: "tuyau", position: pt(3, 0), z: 2.5, section: D50, ports: [{ id: "1", dx: -0.1 }, { id: "2", dx: 0.1 }, { id: "3", dy: 0.1 }] } },
    ]).etat;
    const r = 0.0603 / 2, ri = r - 0.0029;
    const vTube = volumeMaillage(maillageObjet(e, O<"segment-reseau">(e, "t"))!);
    // Polygone à 16 côtés : aire de la couronne ≈ 0,97 × π(r² − ri²) ; tolérance 5 %.
    expect(Math.abs(vTube - Math.PI * (r * r - ri * ri) * 4.5) / (Math.PI * (r * r - ri * ri) * 4.5)).toBeLessThan(0.05);
    expect(volumeMaillage(maillageObjet(e, O<"segment-reseau">(e, "g"))!)).toBeCloseTo(0.4 * 0.25 * 5, 9);
    expect(volumeMaillage(maillageObjet(e, O<"equipement-reseau">(e, "eq"))!)).toBeCloseTo(1 * 0.5 * 0.8, 9);
    expect(maillageObjet(e, O<"vanne">(e, "v"))!.indices.length).toBeGreaterThan(0);
    expect(maillageObjet(e, O<"raccord-reseau">(e, "c"))!.indices.length).toBeGreaterThan(0);
    expect(portsDe(O<"equipement-reseau">(e, "eq"))[0]!.position.x).toBeCloseTo(6 + 0.5 * Math.cos(Math.PI / 6), 9);
  });
  it("nomenclature de réseau (CSV reproductible), P&ID dérivé (SVG) et IFC MEP (entités, ports emboîtés, connexions, système)", () => {
    const e = lot(base(), [
      { type: "catalogue.importer", params: { id: "cat", nom: "Tubes T", ontologie: "mep", csv: CSV } },
      { type: "reseau.router", params: { id: "ef", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5), P3(4, 3, 2.5)], section: { catalogueId: "cat", designation: "Tube 60,3 x 2,9" }, sens: "a-vers-b", coude: { longueur: m(0.1) }, prefixe: "EF" } },
      { type: "vanne.creer", params: { id: "v", niveauId: "n1", nom: "V1", repere: "V-01", type: "anti-retour", position: pt(4, 3.1), z: 2.5, angle: { value: 90, unit: "deg" }, section: D50, longueur: m(0.2), fluide: "eau" } },
      { type: "equipementReseau.creer", params: { id: "p", niveauId: "n1", nom: "Pompe P1", repere: "P-01", type: "pompe", categorie: "mouvement", position: pt(4, 3.7), z: 2.2, longueur: m(0.6), largeur: m(0.4), hauteur: m(0.6), ports: [{ id: "asp", dy: -0.5, dz: 0.3, sens: "entree", section: D50, systeme: "tuyau", fluide: "eau" }] } },
      { type: "segmentReseau.creer", params: { id: "g", niveauId: "n1", systeme: "gaine", nom: "Soufflage", sommets: [P3(0, 5, 2.8), P3(5, 5, 2.8)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.25) }, fluide: "air" } },
      { type: "segmentReseau.creer", params: { id: "cc", niveauId: "n1", systeme: "chemin-de-cables", sommets: [P3(0, 6, 2.9), P3(5, 6, 2.9)], section: { forme: "rectangulaire", largeur: m(0.2), hauteur: m(0.06) } } },
      { type: "supportReseau.creer", params: { id: "sp", porteId: "g", type: "suspente", position: pt(2.5, 5), z: 2.8, longueur: m(0.2) } },
      { type: "reseau.connecterProches", params: {} },
    ]).etat;
    expect(connexions(e)).toHaveLength(4);
    expect(pbReseau(e)).toHaveLength(0);
    const t = genererTableau(e, "reseau");
    expect(t.lignes.map((l) => l[1])).toEqual(["segment", "segment", "segment", "segment", "raccord", "vanne", "équipement", "support"]);
    const csv = csvTableau(t);
    expect(csv).toContain("Tube 60,3 x 2,9 (DN 50)");
    expect(csv).toContain("Catalogue tubes T, 2025, p. 7");
    expect(csv).toContain("anti-retour");
    expect(csv).toContain("pompe (mouvement)");
    expect(csv).toContain("non évaluée");
    expect(csvTableau(genererTableau(e, "reseau"))).toBe(csv);
    const pid = schemaPid(e);
    expect(pid.aretes.map((a) => a.id)).toEqual(["cc", "ef-1", "ef-2", "g"]);
    expect(pid.noeuds.map((x) => x.classe)).toEqual(["raccord-reseau", "equipement-reseau", "vanne"]);
    expect(pid.portsLibres.map((x) => `${x.objetId}:${x.id}`)).toEqual(["cc:a", "cc:b", "ef-1:a", "g:a", "g:b"]);
    const svg = svgPid(e, 7);
    expect(svg).toContain("data-pid");
    expect((svg.match(/data-segment=/g) ?? []).length).toBe(4);
    expect((svg.match(/data-port-libre=/g) ?? []).length).toBe(5);
    expect(svg).toContain("Pompe P1");
    expect(svgPid(e, 7)).toBe(svg);
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "Réseau", code: "R" }, revision: 7, horodatage: new Date(0).toISOString() });
    for (const a of ["IFCPIPESEGMENT(", ".RIGIDSEGMENT.", "IFCPIPEFITTING(", ".BEND.", "IFCVALVE(", ".CHECK.", "IFCFLOWMOVINGDEVICE(", "IFCDUCTSEGMENT(", "IFCCABLECARRIERSEGMENT(", ".CABLETRAYSEGMENT.", "IFCDISCRETEACCESSORY(", "IFCDISTRIBUTIONPORT(", ".SINK.", ".SOURCE.", ".PIPE.", ".DUCT.", "IFCRELNESTS(", "IFCRELCONNECTSPORTS(", "IFCDISTRIBUTIONSYSTEM(", "'Fadi_Reseau'", "'DiametreNominal'", "IFCRELASSOCIATESMATERIAL("]) expect(ifc.contenu, a).toContain(a);
    expect((ifc.contenu.match(/IFCRELCONNECTSPORTS\(/g) ?? []).length).toBe(4);
    expect((ifc.contenu.match(/IFCDISTRIBUTIONPORT\(/g) ?? []).length).toBe(13);
    expect(ifc.rapport.remarques.some((r: string) => /13 port\(s\) de réseau/.test(r))).toBe(true);
  });
});

describe("relecture Codex de la PR #98 : repère des sommets, système des ports, raccords tournés, flèches du P&ID", () => {
  it("un sommet 3D étiqueté d'un repère autre que local est refusé (jamais réinterprété) ; sans étiquette, repère local du niveau", () => {
    expect(() => lot(base(), [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [{ x: 0, y: 0, z: 2.5, frame: "cadastral" }, P3(4, 0, 2.5)], section: D50 } }])).toThrow(/repère « cadastral » refusé/);
    const e = lot(base(), [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [{ x: 0, y: 0, z: 2.5, frame: "local" }, P3(4, 0, 2.5)], section: D50 } }]).etat;
    expect(O<"segment-reseau">(e, "s").params.sommets[0]).toEqual(P3(0, 0, 2.5));
  });
  it("port d'équipement sans système : refus nommé ; port de raccord sans système : celui du raccord", () => {
    expect(() => lot(base(), [{ type: "equipementReseau.creer", params: { id: "p1", niveauId: "n1", nom: "Pompe", type: "pompe", categorie: "mouvement", position: pt(4, 3.7), z: 2.2, longueur: m(0.6), largeur: m(0.4), hauteur: m(0.6), ports: [{ id: "asp", dy: -0.5, sens: "entree", section: D50 }] } }])).toThrow(/système requis/);
    const e = lot(base(), [{ type: "raccordReseau.creer", params: { id: "r", niveauId: "n1", type: "coude", systeme: "gaine", position: pt(0, 0), z: 2.5, section: { forme: "rectangulaire", largeur: m(0.3), hauteur: m(0.2) }, ports: [{ id: "1", dx: -0.1 }, { id: "2", dy: 0.1 }] } }]).etat;
    expect(O<"raccord-reseau">(e, "r").params.ports.every((p) => p.systeme === "gaine")).toBe(true);
    expect(portsDe(O<"raccord-reseau">(e, "r")).every((p) => p.systeme === "gaine")).toBe(true);
  });
  it("raccord tourné de 90° : les bras maillés suivent les ports (bras de −x vers −y… même rotation que portsDe)", () => {
    const e = lot(base(), [{ type: "raccordReseau.creer", params: { id: "r", niveauId: "n1", type: "coude", systeme: "tuyau", position: pt(0, 0), z: 2.5, angle: { value: 90, unit: "deg" }, section: D50, ports: [{ id: "1", dx: -0.2 }, { id: "2", dy: 0.2 }] } }]).etat;
    const r = O<"raccord-reseau">(e, "r");
    const mm = maillageRaccordReseau(r.params);
    const xs = mm.positions.filter((_, i) => i % 3 === 0), ys = mm.positions.filter((_, i) => i % 3 === 1);
    // Port 1 (dx −0,2) tourné de 90° → (0, −0,2) ; port 2 (dy 0,2) → (−0,2, 0) : le maillage s'étend en y ∈ [−0,2, 0] et x ∈ [−0,2, 0] (jamais x > 0,03 ni y > 0,03).
    expect(Math.min(...ys)).toBeCloseTo(-0.2, 2);
    expect(Math.min(...xs)).toBeCloseTo(-0.2, 2);
    expect(Math.max(...xs)).toBeLessThan(0.04);
    expect(Math.max(...ys)).toBeLessThan(0.04);
    const ports = portsDe(r);
    expect(ports.find((p) => p.id === "1")!.position.y).toBeCloseTo(-0.2, 9);
    expect(ports.find((p) => p.id === "2")!.position.x).toBeCloseTo(-0.2, 9);
  });
  it("P&ID : un segment b-vers-a est fléché du dernier sommet vers le premier", () => {
    const e = lot(base(), [{ type: "segmentReseau.creer", params: { id: "s", niveauId: "n1", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50, sens: "b-vers-a" } }]).etat;
    const svg = svgPid(e, 1);
    const ligne = /<line ([^>]*)data-segment="s"[^>]*>/.exec(svg)![1]!;
    const x1 = Number(/x1="([^"]+)"/.exec(ligne)![1]), x2 = Number(/x2="([^"]+)"/.exec(ligne)![1]);
    expect(svg).toContain('data-sens="b-vers-a"');
    expect(x1).toBeGreaterThan(x2); // de x = 4 (b) vers x = 0 (a)
    expect(ligne).toContain("marker-end");
  });
});
