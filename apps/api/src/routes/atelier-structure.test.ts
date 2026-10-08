/**
 * Ontologie structure (P2-3) contre la vraie base : activation persistée, trame générée par le serveur (poteaux du
 * socle + poutres), catalogue CSV sourcé → poutre par désignation, plaque, assemblage paramétrique, soudures, armature,
 * coulage, nomenclatures (documents CSV), IFC structure, réimport en lecture, interférence poutre × pièce mécanique.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";

const app = createApp();
const CONTRAT = "atelier-commands/3";

async function resetDb() {
  await pool.query(
    "TRUNCATE volumes, atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE",
  );
}
beforeAll(resetDb);
beforeEach(resetDb);
afterAll(async () => {
  await pool.end();
});

async function registerAndLogin(email: string) {
  const client = request.agent(app);
  const res = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return client;
}
const enveloppe = (requestId: string, baseRevision: number, commands: unknown[], label = "test") => ({ requestId, baseRevision, contract: CONTRAT, label, commands });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });
const m = (value: number) => ({ value, unit: "m" });
const IPE = { forme: "I", largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.006), epaisseurAile: m(0.009) };
const CSV = "designation;hauteur_mm;largeur_mm;epaisseur_ame_mm;epaisseur_aile_mm;masse_kg_m;source;edition;page\nIPE 200;200;100;5,6;8,5;22,4;Catalogue producteur X;2024;p. 12\n";

describe("Ontologie structure (P2-3) : trame, catalogue sourcé, assemblages, armatures, coulage, nomenclatures, IFC", () => {
  it("activation, génération d'une trame, poutre de catalogue, nomenclatures CSV, IFC structure et réimport", async () => {
    const client = await registerAndLogin("structure@example.com");
    const created = await client.post("/projects").send({ code: "P.S", name: "Structure" });
    const pid = created.body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }]);

    // Sans activation : refus 409 nommé ; après activation, persistée (relue depuis la base).
    const refus = await client.post(`${base}/commands`).send(enveloppe("t0", rev, [{ type: "trame.creer", params: { id: "t1", niveauId: "rdc", nom: "T", origine: pt(0, 0), files: [{ nom: "A", position: 0 }], rangs: [{ nom: "1", position: 0 }] } }]));
    expect(refus.status).toBe(409);
    expect(JSON.stringify(refus.body)).toMatch(/non activée/);
    rev = await post("act", rev, [{ type: "ontologie.activer", params: { nom: "structure" } }], "Activer la structure");
    expect((await client.get(`${base}/model`)).body.modele.ontologies).toEqual(["structure"]);

    // Trame 3 × 2 générée par le serveur : 6 poteaux (socle) et 7 poutres, en tête ; rejouée : aucun doublon.
    const gen = { type: "trame.generer", params: { id: "t1", hauteur: m(3), materiau: "beton", materiauNom: "C30/37 (déclaré)", sectionPoteau: { formeId: "I", largeur: m(0.2), profondeur: m(0.2), epaisseurProfil: m(0.01) }, sectionPoutre: IPE } };
    rev = await post("trame", rev, [{ type: "trame.creer", params: { id: "t1", niveauId: "rdc", nom: "T", origine: pt(10, 10), files: [{ nom: "A", position: 0 }, { nom: "B", position: 6 }, { nom: "C", position: 12 }], rangs: [{ nom: "1", position: 0 }, { nom: "2", position: 5 }] } }, gen], "Trame et génération");
    let modele = (await client.get(`${base}/model`)).body.modele;
    const classes = () => Object.values(modele.objets as Record<string, { classe: string }>).map((o) => o.classe);
    expect(classes().filter((c) => c === "poteau")).toHaveLength(6);
    expect(classes().filter((c) => c === "poutre")).toHaveLength(7);
    expect(modele.objets["t1"].params.generation).toEqual({ poteaux: 6, poutres: 7, hauteur: 3 });
    rev = await post("regen", rev, [gen], "Génération rejouée");
    modele = (await client.get(`${base}/model`)).body.modele;
    expect(classes().filter((c) => c === "poutre")).toHaveLength(7);

    // Catalogue sourcé → poutre par désignation (section et masse linéique du catalogue) ; désignation inconnue : 409.
    rev = await post("cat", rev, [
      { type: "catalogue.importer", params: { id: "cat-acier", nom: "Profilés X", ontologie: "structure", csv: CSV } },
      { type: "poutre.creer", params: { id: "b-cat", niveauId: "rdc", nom: "Poutre catalogue", a: pt(10, 10), b: pt(10, 15), za: 2.9, section: { catalogueId: "cat-acier", designation: "IPE 200" }, materiau: "acier" } },
    ], "Catalogue et poutre");
    modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["b-cat"].params.section.masseLineique).toBe(22.4);
    expect(modele.objets["b-cat"].params.section.profil.source).toBe("Catalogue producteur X, 2024, p. 12");
    const inconnue = await client.post(`${base}/commands`).send(enveloppe("inc", rev, [{ type: "poutre.creer", params: { id: "b-x", niveauId: "rdc", a: pt(0, 0), b: pt(1, 0), section: { catalogueId: "cat-acier", designation: "IPE 999" }, materiau: "acier" } }]));
    expect(inconnue.status).toBe(409);

    // Plaque, assemblage paramétrique, soudures, armature, coulage.
    const poteaux = Object.keys(modele.objets).filter((id) => modele.objets[id].classe === "poteau").sort();
    const poutres = Object.keys(modele.objets).filter((id) => modele.objets[id].classe === "poutre" && modele.objets[id].params.trameId === "t1").sort();
    rev = await post("ass", rev, [
      { type: "plaque.creer", params: { id: "pl1", niveauId: "rdc", nom: "Platine A1", contour: [pt(9.75, 9.75), pt(10.25, 9.75), pt(10.25, 10.25), pt(9.75, 10.25)], epaisseur: m(0.02), z: 3, materiau: "acier" } },
      { type: "assemblageStructurel.creer", params: { id: "as1", niveauId: "rdc", type: "platine-about", elements: [poutres[0], poteaux[0]], position: pt(10, 10), z: 2.9, platine: { largeur: m(0.2), hauteur: m(0.3), epaisseur: m(0.015) }, boulons: { rangees: 2, parRangee: 2, diametre: m(0.016), entraxe: m(0.08), longueur: m(0.06) } } },
      { type: "soudure.creer", params: { id: "w1", type: "angle", a: poutres[0], b: "pl1", gorge: m(0.005), longueur: m(0.3), position: pt(10, 10), z: 2.9 } },
      { type: "armature.creer", params: { id: "ar1", niveauId: "rdc", hoteId: "pl1", forme: "cadre", diametre: m(0.01), points: [pt(9.8, 9.8), pt(10.2, 9.8), pt(10.2, 10.2), pt(9.8, 10.2)], z: 3.01, nombre: 3, espacement: m(0.1), nuance: "B500B (déclarée)" } },
      { type: "coulage.creer", params: { id: "co1", niveauId: "rdc", nom: "Coulage 1", elements: [poteaux[0], poteaux[1]] } },
    ], "Assemblages et coulage");

    // Nomenclatures : trois tableaux du catalogue de documents, CSV reproductibles, masse sourcée et « non évaluée ».
    const docs = await client.get(`/projects/${pid}/documents`);
    expect(docs.status).toBe(200);
    const liste = docs.body.documents as { kind: string; href: string }[];
    const structure = liste.find((d) => d.kind === "atelier-tableau-structure");
    const armatures = liste.find((d) => d.kind === "atelier-tableau-armatures");
    const assemblages = liste.find((d) => d.kind === "atelier-tableau-assemblagesStructure");
    expect(structure && armatures && assemblages).toBeTruthy();
    const csv = await client.get(structure!.href);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("IPE 200");
    expect(csv.text).toContain("Catalogue producteur X, 2024, p. 12");
    expect(csv.text).toContain("112"); // 22,4 kg/m × 5 m
    expect(csv.text).toContain("non évaluée");
    expect(csv.text).toContain("Coulage 1");
    expect((await client.get(armatures!.href)).text).toContain("B500B");
    const csvAs = (await client.get(assemblages!.href)).text;
    expect(csvAs).toContain("paramétrique");
    expect(csvAs).toContain("soudé");

    // IFC : classes de structure présentes ; réimport dans une copie en représentations importées (R16).
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    expect(ifc.status).toBe(200);
    for (const cls of ["IFCGRID(", "IFCCOLUMN(", "IFCBEAM(", "IFCPLATE(", "IFCREINFORCINGBAR(", "IFCFASTENER(", "IFCELEMENTASSEMBLY(", "IFCGROUP("]) expect(ifc.text, cls).toContain(cls);
    expect((ifc.text.match(/IFCBEAM\(/g) ?? []).length).toBe(8);
    const copie = await client.post("/projects").send({ code: "P.S2", name: "Réimport" });
    const imp = await client.post(`/projects/${copie.body.id}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").set("X-File-Name", "structure.ifc").send(Buffer.from(ifc.text));
    expect(imp.status, JSON.stringify(imp.body).slice(0, 300)).toBe(200);
    const mImp = (await client.get(`/projects/${copie.body.id}/atelier/model`)).body.modele;
    const importes = Object.values(mImp.objets as Record<string, { classe: string; params: { ifcClasse?: string } }>).filter((o) => o.classe === "objet-importe");
    expect(importes.length).toBeGreaterThanOrEqual(8);
    expect(importes.some((o) => o.params.ifcClasse === "IfcBeam")).toBe(true);

    // Coordination : une pièce mécanique dans le volume d'une poutre → collision signalée dans /problemes.
    rev = await post("mec", rev, [
      { type: "ontologie.activer", params: { nom: "mechanical" } },
      { type: "solide.extruder", params: { id: "s1", niveauId: "rdc", contour: [pt(12.5, 9.5), pt(13.5, 9.5), pt(13.5, 10.5), pt(12.5, 10.5)], ferme: true, hauteur: m(3.5), decalageBase: m(0), epaisseur: null, role: "solid", nom: "machine", couleur: null } },
      { type: "pieceMecanique.creer", params: { id: "p1", sourceId: "s1" } },
    ], "Machine sous la poutre");
    const pb = await client.get(`${base}/problemes`);
    expect(pb.status).toBe(200);
    const collision = (pb.body.collisions as { type: string; objets: string[] }[]).find((c) => c.type === "piece-batiment" && c.objets.includes("p1"));
    expect(collision, JSON.stringify(pb.body.collisions).slice(0, 300)).toBeTruthy();

    // Désactivation refusée tant que des objets existent.
    const des = await client.post(`${base}/commands`).send(enveloppe("des", rev, [{ type: "ontologie.desactiver", params: { nom: "structure" } }]));
    expect(des.status).toBe(409);
  }, 120000);
});
