/**
 * Ontologies bois et tôlerie (P2-4) contre la vraie base : activation persistée, mur à ossature généré par le serveur
 * après aperçu, catalogue de sections bois, CLT, assemblage bois–métal avec quincaillerie, tôle pliée avec table de
 * pliage sourcée, nomenclatures CSV (pièces de bois, pliage), IFC réimporté.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";

const app = createApp();
const CONTRAT = "atelier-commands/3";
async function resetDb() {
  await pool.query("TRUNCATE volumes, atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE");
}
beforeAll(resetDb);
beforeEach(resetDb);
afterAll(async () => { await pool.end(); });
async function registerAndLogin(email: string) {
  const client = request.agent(app);
  const res = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return client;
}
const enveloppe = (requestId: string, baseRevision: number, commands: unknown[], label = "test") => ({ requestId, baseRevision, contract: CONTRAT, label, commands });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });
const m = (value: number) => ({ value, unit: "m" });
const CSV_BOIS = "designation;largeur_mm;hauteur_mm;essence;classe_resistance;type;source;edition;page\n45x145;45;145;épicéa;C24;massif;Fournisseur bois Y;2025;p. 4\n";
const TABLE = "materiau;epaisseur_mm;rayon_interieur_mm;facteur_k;angle_deg;deduction_pli_mm;source;edition;page\nacier S235;2;2;0,44;;;Table de pliage atelier W;2025;p. 1\n";

describe("Ontologies bois et tôlerie (P2-4)", () => {
  it("ossature de mur générée, CLT, assemblage, tôle pliée sourcée, nomenclatures CSV, IFC et réimport", async () => {
    const client = await registerAndLogin("bois@example.com");
    const pid = (await client.post("/projects").send({ code: "P.B", name: "Bois" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 2.7 } }, { type: "mur.tracer", params: { id: "m1", niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.145), hauteur: m(2.7) } }, { type: "ouverture.poser", params: { id: "f1", classe: "fenetre", murHoteId: "m1", position: 0.5, largeur: m(1), hauteur: m(1.2), allege: m(0.9) } }]);
    const refus = await client.post(`${base}/commands`).send(enveloppe("r0", rev, [{ type: "ossature.creer", params: { id: "os1", nom: "O", genre: "mur", hoteId: "m1", entraxe: m(0.6), sectionMontant: { largeur: m(0.045), hauteur: m(0.145) } } }]));
    expect(refus.status).toBe(409);
    rev = await post("act", rev, [{ type: "ontologie.activer", params: { nom: "timber" } }, { type: "ontologie.activer", params: { nom: "sheetmetal" } }]);
    expect((await client.get(`${base}/model`)).body.modele.ontologies).toEqual(["timber", "sheetmetal"]);
    rev = await post("oss", rev, [
      { type: "catalogue.importer", params: { id: "cat-bois", nom: "Sections bois Y", ontologie: "timber", csv: CSV_BOIS } },
      { type: "ossature.creer", params: { id: "os1", nom: "Mur ossature", genre: "mur", hoteId: "m1", entraxe: m(0.6), sectionMontant: { catalogueId: "cat-bois", designation: "45x145" } } },
      { type: "ossature.generer", params: { id: "os1" } },
      { type: "panneauClt.creer", params: { id: "c1", niveauId: "rdc", pose: "mur", a: pt(0, 3), b: pt(4, 3), hauteur: m(2.7), epaisseur: m(0.1), couches: 5, essence: "épicéa" } },
    ]);
    let modele = (await client.get(`${base}/model`)).body.modele;
    const pieces = Object.values(modele.objets as Record<string, { classe: string; params: { role?: string; ossatureId?: string } }>).filter((o) => o.classe === "element-bois");
    expect(pieces.length).toBeGreaterThan(8);
    expect(pieces.some((o) => o.params.role === "linteau")).toBe(true);
    expect(modele.objets["os1"].params.generation.elements).toBe(pieces.length);
    const ids = Object.keys(modele.objets).filter((id) => modele.objets[id].classe === "element-bois").sort();
    rev = await post("ass", rev, [
      { type: "assemblageBois.creer", params: { id: "ab1", type: "equerre", a: ids[0], b: "c1", position: pt(0, 0), z: 0.1, platine: { largeur: m(0.06), hauteur: m(0.06), epaisseur: m(0.002) }, quincaillerie: [{ designation: "équerre 60", nombre: 2, source: "Catalogue quincaillerie Z, 2025, p. 8" }] } },
      { type: "catalogue.importer", params: { id: "tab", nom: "Table de pliage W", ontologie: "sheetmetal", csv: TABLE } },
      { type: "tole.creer", params: { id: "t1", niveauId: "rdc", nom: "Capot", repere: "T-01", position: pt(6, 1), longueur: m(0.4), largeur: m(0.3), epaisseur: m(0.002), materiau: "acier S235", rayonInterieur: m(0.002), plis: [{ bord: "x1", angle: { value: 90, unit: "deg" }, longueur: m(0.05) }], pliage: { catalogueId: "tab" } } },
      { type: "tole.creer", params: { id: "t2", niveauId: "rdc", nom: "Sans table", position: pt(7, 1), longueur: m(0.2), largeur: m(0.2), epaisseur: m(0.001), materiau: "aluminium", rayonInterieur: m(0.001), plis: [{ bord: "y1", angle: { value: 90, unit: "deg" }, longueur: m(0.02) }] } },
    ]);
    // Nomenclatures : pièces de bois (essence, source) et table de pliage (K sourcé ; « non évaluée » sans table).
    const docs = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; href: string }[];
    const bois = docs.find((d) => d.kind === "atelier-tableau-bois")!;
    const pliage = docs.find((d) => d.kind === "atelier-tableau-pliage")!;
    expect(bois && pliage).toBeTruthy();
    const csvB = (await client.get(bois.href)).text;
    expect(csvB).toContain("épicéa");
    expect(csvB).toContain("Fournisseur bois Y, 2025, p. 4");
    expect(csvB).toContain("équerre 60");
    expect(csvB).toContain("panneau CLT");
    const csvP = (await client.get(pliage.href)).text;
    expect(csvP).toContain("T-01");
    expect(csvP).toContain("0.44");
    expect(csvP).toContain("Table de pliage atelier W, 2025, p. 1");
    expect(csvP).toContain("non évaluée");
    // IFC et réimport.
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    for (const cls of ["IFCELEMENTASSEMBLY(", ".STUD.", "IFCWALL(", "IFCDISCRETEACCESSORY(", "IFCPLATE(", ".SHEET.", "IFCRELASSOCIATESMATERIAL("]) expect(ifc.text, cls).toContain(cls);
    const copie = (await client.post("/projects").send({ code: "P.B2", name: "Réimport" })).body.id;
    const imp = await client.post(`/projects/${copie}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").set("X-File-Name", "bois.ifc").send(Buffer.from(ifc.text));
    expect(imp.status).toBe(200);
    const mImp = (await client.get(`/projects/${copie}/atelier/model`)).body.modele;
    const importes = Object.values(mImp.objets as Record<string, { classe: string; params: { ifcClasse?: string } }>).filter((o) => o.classe === "objet-importe");
    expect(importes.some((o) => o.params.ifcClasse === "IfcMember")).toBe(true);
    expect(importes.some((o) => o.params.ifcClasse === "IfcPlate")).toBe(true);
    // Désactivation refusée tant que des objets existent.
    expect((await client.post(`${base}/commands`).send(enveloppe("des", rev, [{ type: "ontologie.desactiver", params: { nom: "timber" } }]))).status).toBe(409);
  }, 120000);
});
