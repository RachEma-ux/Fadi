/**
 * Ontologie mécanique (P2-2) contre la vraie base : activation persistée, pièces depuis un solide exact calculé par le
 * serveur, assemblage, liaisons résolues, pilotage, numérotation, nomenclature (document CSV), IFC avec
 * IfcElementAssembly, collision pièce × mur dans /problemes, catalogue CSV sourcé, familles et règles.
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
const boite = (dx: number, dy: number, dz: number) => ({ type: "extrusion", extrusion: { profil: [{ x: 0, y: 0 }, { x: dx, y: 0 }, { x: dx, y: dy }, { x: 0, y: dy }], z0: 0, hauteur: dz } });

describe("Ontologie mécanique (P2-2) : activation, assemblage CTA, solveur, documents, IFC, collision", () => {
  it("joue la machine du projet mixte : 3 pièces, encastrement + pivot piloté, numérotation, nomenclature, IFC, collision signalée", async () => {
    const client = await registerAndLogin("meca@example.com");
    const created = await client.post("/projects").send({ code: "P.M", name: "Mécanique" });
    const pid = created.body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }, { type: "mur.tracer", params: { id: "m1", niveauId: "rdc", a: pt(8, 6), b: pt(12, 6), epaisseur: { value: 0.2, unit: "m" }, hauteur: { value: 3, unit: "m" } } }]);

    // Sans activation : refus 400 nommé ; après activation, persistée (relue depuis la base).
    const refus = await client.post(`${base}/commands`).send(enveloppe("a0", rev, [{ type: "assemblage.creer", params: { id: "cta", niveauId: "rdc", nom: "CTA", position: pt(10, 5) } }]));
    expect(refus.status).toBe(409); // précondition : l'ontologie n'est pas active
    expect(JSON.stringify(refus.body)).toMatch(/non activée/);
    rev = await post("act", rev, [{ type: "ontologie.activer", params: { nom: "mechanical" } }], "Activer la mécanique");
    expect((await client.get(`${base}/model`)).body.modele.ontologies).toEqual(["mechanical"]);

    // Solides exacts calculés par le serveur (P2-1), puis pièces (copie de la géométrie) dans l'assemblage posé en (10 ; 5).
    rev = await post("sol", rev, [
      { type: "solideExact.creer", params: { id: "se-socle", niveauId: "rdc", nom: "Socle", operation: { type: "extrusion", sources: [], libelle: "Socle", entrees: boite(2, 1, 0.2) } } },
      { type: "solideExact.creer", params: { id: "se-caisson", niveauId: "rdc", nom: "Caisson", operation: { type: "extrusion", sources: [], libelle: "Caisson", entrees: boite(2.4, 1.6, 1.2) } } },
      { type: "solideExact.creer", params: { id: "se-pale", niveauId: "rdc", nom: "Pale", operation: { type: "extrusion", sources: [], libelle: "Pale", entrees: boite(0.1, 0.5, 0.05) } } },
    ], "Solides de la CTA");
    rev = await post("asm", rev, [
      { type: "assemblage.creer", params: { id: "cta", niveauId: "rdc", nom: "CTA", numero: "CTA", position: pt(10, 5) } },
      { type: "pieceMecanique.creer", params: { id: "p-socle", sourceId: "se-socle", assemblageId: "cta", fixe: true, materiau: "acier (déclaré)" } },
      { type: "pieceMecanique.creer", params: { id: "p-caisson", sourceId: "se-caisson", assemblageId: "cta", pose: { x: 0.5, y: 0.5, z: 1 } } },
      { type: "pieceMecanique.creer", params: { id: "p-pale", sourceId: "se-pale", assemblageId: "cta", pose: { x: 1, y: 1, z: 1 } } },
      { type: "liaison.creer", params: { id: "l-enc", type: "encastrement", a: "p-socle", b: "p-caisson", pa: { x: 0, y: 0, z: 0.2 } } },
      { type: "liaison.creer", params: { id: "l-piv", type: "pivot", a: "p-caisson", b: "p-pale", pa: { x: 1.2, y: 0, z: 0.6 }, da: { x: 0, y: 1, z: 0 }, ea: { x: 1, y: 0, z: 0 }, db: { x: 0, y: 1, z: 0 }, eb: { x: 1, y: 0, z: 0 }, valeur: 45 } },
      { type: "assemblage.numeroter", params: { id: "cta" } },
    ], "Assemblage CTA");
    let modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["p-caisson"].params.volume).toBeCloseTo(2.4 * 1.6 * 1.2, 6);
    expect(modele.objets["p-caisson"].params.pose.z).toBeCloseTo(0.2, 5);
    expect(modele.objets["p-pale"].params.pose.x).toBeCloseTo(1.2, 4);
    expect(modele.objets["cta"].params.diagnostic).toBe("bien contraint");
    expect(modele.objets["p-caisson"].params.reference).toBe("CTA-01");

    // Pilotage 45° → 90° : une révision, la pale tourne ; version nommée avant, comparaison qui nomme la pièce.
    const version = await client.post(`${base}/versions`).send({ nom: "Avant modification" });
    expect(version.status).toBe(201);
    rev = await post("pil", rev, [{ type: "liaison.piloter", params: { id: "l-piv", valeur: 90 } }], "Ventilateur à 90°");
    modele = (await client.get(`${base}/model`)).body.modele;
    const w = modele.objets["p-pale"].params.pose;
    expect((Math.hypot(w.rx, w.ry, w.rz) * 180) / Math.PI).toBeCloseTo(90, 2);
    const cmp = await client.get(`${base}/comparer?de=v:${encodeURIComponent(version.body.id)}&a=courante`);
    expect(cmp.status).toBe(200);
    expect(JSON.stringify(cmp.body.difference)).toContain("p-pale");

    // Nomenclature : tableau du catalogue de documents, CSV reproductible.
    const docs = await client.get(`/projects/${pid}/documents`);
    expect(docs.status).toBe(200);
    const nomenclature = (docs.body.documents as { kind: string; href: string }[]).find((d) => d.kind === "atelier-tableau-nomenclature");
    expect(nomenclature).toBeTruthy();
    const csv = await client.get(nomenclature!.href);
    expect(csv.status, `${nomenclature!.href} → ${JSON.stringify(csv.body)}`).toBe(200);
    expect(csv.text).toContain("CTA-01");
    expect(csv.text).toContain("acier (déclaré)");

    // IFC : un IfcElementAssembly qui agrège trois proxys de pièces.
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    expect(ifc.status).toBe(200);
    expect(ifc.text).toContain("IFCELEMENTASSEMBLY(");
    expect((ifc.text.match(/'piece-mecanique'/g) ?? []).length).toBe(3);

    // Collision : l'assemblage est posé contre le mur m1 (y = 6, de x = 8 à 12) → le caisson (y de 5 à 6,6) le traverse.
    const pb = await client.get(`${base}/problemes`);
    expect(pb.status).toBe(200);
    const collision = (pb.body.collisions as { type: string; objets: string[]; message: string }[]).find((c) => c.type === "piece-batiment");
    expect(collision, JSON.stringify(pb.body.collisions)).toBeTruthy();
    expect(collision!.objets).toContain("m1");

    // Catalogue sourcé, famille et règle (DA-05-17, DA-06-03, DA-06-09).
    rev = await post("cat", rev, [
      { type: "catalogue.importer", params: { id: "cat-vis", nom: "Visserie", ontologie: "mechanical", csv: "designation;diametre_mm;source;edition;page\nM8;8;Catalogue X;2024;p. 3\n" } },
      { type: "famille.definir", params: { id: "fam", nom: "Platine", parametres: { e: { expression: "0.02", unite: "m" }, l: { expression: "e * 12", unite: "m" } } } },
      { type: "regle.definir", params: { id: "reg", nom: "Largeur", expression: "l <= 0.2", message: "largeur bornée", familleId: "fam" } },
      { type: "regles.controler", params: {} },
    ], "Catalogue, famille, règle");
    modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.definitions["cat-vis"].classe).toBe("catalogue");
    expect(Object.values(modele.problemes as Record<string, { type: string }>).filter((p) => p.type === "regle").length).toBe(1);

    // Désactivation refusée tant que des objets existent (précondition nommée).
    const des = await client.post(`${base}/commands`).send(enveloppe("des", rev, [{ type: "ontologie.desactiver", params: { nom: "mechanical" } }]));
    expect(des.status).toBe(409);
    expect(JSON.stringify(des.body)).toMatch(/objet\(s\) de cette ontologie/);
  }, 120000);
});
