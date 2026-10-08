/**
 * Solides exacts (P2-1, D-177) contre la vraie base : le serveur recalcule l'opération avec le même noyau (occt-wasm en
 * Node), écrit ses résultats, refuse une empreinte d'aperçu différente (409 motif `exact`) et une commande sans
 * opération (400) ; export STEP posé ; import STEP ; essai à blanc ; IFC avec un proxy tessellé et Fadi_SolideExact.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { MoteurExact } from "@parcours/geometry-exact";
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
const carre = (c: number, x0 = 0, y0 = 0) => [{ x: x0, y: y0 }, { x: x0 + c, y: y0 }, { x: x0 + c, y: y0 + c }, { x: x0, y: y0 + c }];

describe("Solides exacts (P2-1) : revalidation par le serveur, STEP, IFC", () => {
  it("créer, 409 sur empreinte d'aperçu fausse, 400 sans opération, essai, STEP export / import, IFC", async () => {
    const client = await registerAndLogin("exact@example.com");
    const pid = (await client.post("/projects").send({ code: "P.21", name: "Exact" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const niv = await client.post(`${base}/commands`).send(enveloppe("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }]));
    expect(niv.status).toBe(200);
    let rev = niv.body.revision as number;

    // Le serveur calcule : brep, maillage, volume écrits par lui.
    const entrees = { type: "extrusion", extrusion: { profil: carre(2), z0: 0, hauteur: 3 } };
    const r1 = await client.post(`${base}/commands`).send(enveloppe("se1", rev, [{ type: "solideExact.creer", params: { id: "se-1", niveauId: "rdc", nom: "Bloc", operation: { type: "extrusion", sources: [], libelle: "Extrusion exacte", entrees } } }]));
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    rev = r1.body.revision;
    const modele = (await client.get(`${base}/model`)).body.modele;
    const o = modele.objets["se-1"];
    expect(o.classe).toBe("solide-exact");
    expect(o.params.volume).toBeCloseTo(12, 9);
    expect(o.params.faces).toBe(6);
    expect(o.params.moteur).toBe("occt-wasm");
    expect(o.params.brep.length).toBeGreaterThan(100);
    expect(o.params.operation).toEqual({ type: "extrusion", sources: [], libelle: "Extrusion exacte" });
    expect(o.params.emprise.length).toBe(4);

    // Même opération dans le navigateur (même noyau) : même empreinte → acceptée ; empreinte fausse → 409 exact.
    const M = await MoteurExact.charger();
    const apercu = M.executer(entrees);
    expect(apercu.empreinte).toBe(o.params.empreinteBrep);
    const r2 = await client.post(`${base}/commands`).send(enveloppe("se2", rev, [{ type: "solideExact.creer", params: { id: "se-2", niveauId: "rdc", empreinteBrep: "0000000000000000", operation: { type: "extrusion", sources: [], libelle: "x", entrees } } }]));
    expect(r2.status).toBe(409);
    expect(r2.body.motif).toBe("exact");
    const r3 = await client.post(`${base}/commands`).send(enveloppe("se3", rev, [{ type: "solideExact.creer", params: { id: "se-3", niveauId: "rdc", operation: { type: "extrusion", sources: [], libelle: "x" } } }]));
    expect(r3.status).toBe(400);
    const r4 = await client.post(`${base}/commands`).send(enveloppe("se4", rev, [{ type: "solideExact.creer", params: { id: "se-4", niveauId: "rdc", operation: { type: "x", sources: [], libelle: "x", entrees: { type: "extrusion", extrusion: { profil: carre(2), z0: 0, hauteur: 0 } } } } }]));
    expect(r4.status).toBe(400);
    expect(JSON.stringify(r4.body)).toMatch(/hauteur/);

    // Essai à blanc : recalcul aussi.
    const essai = await client.post(`${base}/commands/essai`).send(enveloppe("essai", rev, [{ type: "solideExact.creer", params: { id: "se-5", niveauId: "rdc", operation: { type: "booleen", sources: ["se-1"], libelle: "x", entrees: { type: "booleen", op: "soustraction", a: { brep: o.params.brep }, b: { extrusion: { profil: carre(1), z0: 0, hauteur: 3 } } } } } }]));
    expect(essai.status, JSON.stringify(essai.body)).toBe(200);

    // Booléen avec un opérande posé : une soustraction suit la pose.
    const dep = await client.post(`${base}/commands`).send(enveloppe("dep", rev, [{ type: "transformer.deplacer", params: { dx: 10, dy: 0 }, cibles: ["se-1"] }]));
    expect(dep.status).toBe(200);
    rev = dep.body.revision;
    const pose = { x: 10, y: 0, angleDeg: 0 };
    const r5 = await client.post(`${base}/commands`).send(enveloppe("se5", rev, [{ type: "solideExact.creer", params: { id: "se-5", niveauId: "rdc", operation: { type: "booleen", sources: ["se-1"], libelle: "Soustraction", entrees: { type: "booleen", op: "soustraction", a: { brep: o.params.brep, pose }, b: { extrusion: { profil: carre(1, 10, 0), z0: 0, hauteur: 3 } } } } } }]));
    expect(r5.status, JSON.stringify(r5.body)).toBe(200);
    rev = r5.body.revision;
    const m2 = (await client.get(`${base}/model`)).body.modele;
    expect(m2.objets["se-5"].params.volume).toBeCloseTo(12 - 3, 9);

    // STEP : export posé puis import sur le niveau.
    const step = await client.get(`${base}/solides-exacts/se-1/export.step`);
    expect(step.status).toBe(200);
    expect(step.text.startsWith("ISO-10303-21;")).toBe(true);
    expect(step.headers["content-disposition"]).toMatch(/Bloc\.step/);
    const imp = await client.post(`${base}/import-step?niveauId=rdc`).set("X-File-Name", "piece.step").set("Content-Type", "application/octet-stream").send(Buffer.from(step.text));
    expect(imp.status, JSON.stringify(imp.body)).toBe(200);
    const m3 = (await client.get(`${base}/model`)).body.modele;
    const importe = Object.values(m3.objets as Record<string, { classe: string; params: { nom: string; volume: number; operation: { type: string } } }>).find((x) => x.classe === "solide-exact" && x.params.operation.type === "import-step")!;
    expect(importe.params.nom).toBe("piece");
    expect(importe.params.volume).toBeCloseTo(12, 6);
    // Deux solides disjoints dans un seul STEP : deux objets, nommés par leur rang.
    const deux = M.executer({ type: "booleen", op: "union", a: { extrusion: { profil: carre(1, 0, 0), z0: 0, hauteur: 1 } }, b: { extrusion: { profil: carre(2, 5, 0), z0: 0, hauteur: 1 } } });
    const imp2 = await client.post(`${base}/import-step?niveauId=rdc`).set("X-File-Name", "deux.step").set("Content-Type", "application/octet-stream").send(Buffer.from(M.exporterStep(deux.brep)));
    expect(imp2.status, JSON.stringify(imp2.body)).toBe(200);
    expect(imp2.body.solides).toBe(2);
    const m4 = (await client.get(`${base}/model`)).body.modele;
    const parts = Object.values(m4.objets as Record<string, { classe: string; params: { nom: string; volume: number } }>).filter((x) => x.classe === "solide-exact" && /^deux \(/.test(x.params.nom));
    expect(parts.map((x) => x.params.nom).sort()).toEqual(["deux (1/2)", "deux (2/2)"]);
    expect(parts.map((x) => x.params.volume).sort((a, b) => a - b).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 4]);
    expect((await client.post(`${base}/import-step`).send("ISO-10303-21;")).status).toBe(400);
    expect((await client.get(`${base}/solides-exacts/inconnu/export.step`)).status).toBe(404);

    // IFC : un proxy tessellé par solide exact avec Fadi_SolideExact.
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    expect(ifc.status).toBe(200);
    expect(ifc.text).toContain("Fadi_SolideExact");
    expect((ifc.text.match(/'solide-exact'/g) ?? []).length).toBe(5); // se-1, se-5, piece, deux (1/2), deux (2/2)
  }, 120000);
});
