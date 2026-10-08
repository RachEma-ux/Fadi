/**
 * Ontologie réseaux (P2-5) contre la vraie base : activation persistée, catalogue de tubes sourcé, spécification
 * pilotée, routage d'une polyligne en tronçons et coudes connectés, équipement et vanne, connectivité vérifiée (refus
 * nommé, problème « reseau » après déplacement), supports, nomenclature CSV, P&ID SVG, IFC MEP réimporté.
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
const P3 = (x: number, y: number, z: number) => ({ x, y, z });
const CSV = "designation;diametre_exterieur_mm;epaisseur_mm;diametre_nominal;fluide;materiau;source;edition;page\nTube 60,3 x 2,9;60,3;2,9;DN 50;eau;acier;Catalogue tubes T;2025;p. 7\n";
const D50 = { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) };

describe("Ontologie réseaux (P2-5)", () => {
  it("routage, spécification, connectivité vérifiée, supports, nomenclature, P&ID, IFC MEP et réimport", async () => {
    const client = await registerAndLogin("reseaux@example.com");
    const pid = (await client.post("/projects").send({ code: "P.R", name: "Réseaux" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }]);
    expect((await client.post(`${base}/commands`).send(enveloppe("r0", rev, [{ type: "segmentReseau.creer", params: { id: "s0", niveauId: "rdc", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50 } }]))).status).toBe(409);
    rev = await post("act", rev, [{ type: "ontologie.activer", params: { nom: "mep" } }]);
    expect((await client.get(`${base}/model`)).body.modele.ontologies).toEqual(["mep"]);
    rev = await post("spec", rev, [
      { type: "catalogue.importer", params: { id: "cat", nom: "Tubes T", ontologie: "mep", csv: CSV } },
      { type: "specification.definir", params: { id: "spec-ef", nom: "Eau froide acier", systeme: "tuyau", fluide: "eau froide", materiau: "acier", catalogueId: "cat", designations: ["Tube 60,3 x 2,9"] } },
    ]);
    // Spécification pilotée : section saisie refusée (400 nommé), section du catalogue admise.
    const refus = await client.post(`${base}/commands`).send(enveloppe("sp", rev, [{ type: "segmentReseau.creer", params: { id: "s0", niveauId: "rdc", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5)], section: D50, specificationId: "spec-ef" } }]));
    expect(refus.status).toBe(409);
    expect(JSON.stringify(refus.body)).toMatch(/à prendre dans son catalogue/);
    rev = await post("route", rev, [
      { type: "reseau.router", params: { id: "ef", niveauId: "rdc", systeme: "tuyau", sommets: [P3(0, 0, 2.5), P3(4, 0, 2.5), P3(4, 3, 2.5)], section: { catalogueId: "cat", designation: "Tube 60,3 x 2,9" }, specificationId: "spec-ef", sens: "a-vers-b", coude: { longueur: m(0.1) }, prefixe: "EF" } },
      { type: "vanne.creer", params: { id: "v1", niveauId: "rdc", nom: "V1", repere: "V-01", type: "anti-retour", position: pt(4, 3.1), z: 2.5, angle: { value: 90, unit: "deg" }, section: D50, longueur: m(0.2), fluide: "eau froide" } },
      { type: "equipementReseau.creer", params: { id: "p1", niveauId: "rdc", nom: "Pompe P1", repere: "P-01", type: "pompe", categorie: "mouvement", position: pt(4, 3.7), z: 2.2, longueur: m(0.6), largeur: m(0.4), hauteur: m(0.6), ports: [{ id: "asp", dy: -0.5, dz: 0.3, sens: "entree", section: D50, systeme: "tuyau", fluide: "eau froide" }, { id: "ref", dy: 0.5, dz: 0.3, sens: "sortie", section: D50, systeme: "tuyau", fluide: "eau froide" }] } },
      { type: "segmentReseau.creer", params: { id: "g1", niveauId: "rdc", nom: "Soufflage", systeme: "gaine", sommets: [P3(0, 5, 2.8), P3(6, 5, 2.8)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.25) }, fluide: "air" } },
      { type: "supportReseau.creer", params: { id: "sp1", porteId: "g1", type: "suspente", position: pt(3, 5), z: 2.8, longueur: m(0.2) } },
      { type: "reseau.connecterProches", params: {} },
    ]);
    let modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["ef-1"].params.fluide).toBe("eau froide");
    expect(modele.objets["ef-1"].params.profil.diametreNominal).toBe("DN 50");
    const connexions = Object.values(modele.relations as Record<string, { kind: string }>).filter((r) => r.kind === "connecte");
    expect(connexions).toHaveLength(4); // ef-1 — coude — ef-2 — V1 — P1 (aspiration)
    // Connexion incompatible refusée (refoulement = sortie, gaine ≠ tuyau), puis déplacement de la pompe : problème « reseau », ramenée : plus rien.
    const inc = await client.post(`${base}/commands`).send(enveloppe("inc", rev, [{ type: "reseau.connecter", params: { a: "g1", portA: "b", b: "p1", portB: "ref" } }]));
    expect(inc.status).toBe(409);
    expect(JSON.stringify(inc.body)).toMatch(/systèmes différents/);
    rev = await post("dep", rev, [{ type: "transformer.deplacer", params: { dx: 0.02, dy: 0 }, cibles: ["p1"] }]);
    let pb = (await client.get(`${base}/problemes`)).body.problemes as { type: string; message: string }[];
    expect(pb.filter((x) => x.type === "reseau").map((x) => x.message)).toEqual([expect.stringMatching(/ports distants de 20 mm/)]);
    rev = await post("ret", rev, [{ type: "transformer.deplacer", params: { dx: -0.02, dy: 0 }, cibles: ["p1"] }]);
    pb = (await client.get(`${base}/problemes`)).body.problemes;
    expect(pb.filter((x) => x.type === "reseau")).toHaveLength(0);
    // Documents : nomenclature de réseau (CSV), P&ID (SVG), IFC MEP ; réimport en représentations importées.
    const docs = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; href: string }[];
    const nomenclature = docs.find((d) => d.kind === "atelier-tableau-reseau")!;
    const pidDoc = docs.find((d) => d.kind === "atelier-pid")!;
    expect(nomenclature && pidDoc).toBeTruthy();
    const csv = (await client.get(nomenclature.href)).text;
    expect(csv).toContain("Tube 60,3 x 2,9 (DN 50)");
    expect(csv).toContain("Catalogue tubes T, 2025, p. 7");
    expect(csv).toContain("Eau froide acier");
    expect(csv).toContain("anti-retour");
    expect(csv).toContain("suspente");
    expect(csv).toContain("non évaluée");
    const svg = await client.get(pidDoc.href);
    expect(svg.status).toBe(200);
    expect(svg.headers["content-type"]).toMatch(/svg/);
    const svgTexte: string = typeof svg.text === "string" && svg.text ? svg.text : Buffer.from(svg.body as Buffer).toString("utf8");
    expect(svgTexte).toContain("data-pid");
    expect((svgTexte.match(/data-segment=/g) ?? []).length).toBe(3);
    expect((svgTexte.match(/data-port-libre=/g) ?? []).length).toBe(4); // ef-1:a, P1 refoulement, gaine a et b
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    for (const cls of ["IFCPIPESEGMENT(", "IFCPIPEFITTING(", ".BEND.", "IFCVALVE(", ".CHECK.", "IFCFLOWMOVINGDEVICE(", "IFCDUCTSEGMENT(", "IFCDISCRETEACCESSORY(", "IFCDISTRIBUTIONPORT(", "IFCRELNESTS(", "IFCRELCONNECTSPORTS(", "IFCDISTRIBUTIONSYSTEM(", "'Fadi_Reseau'"]) expect(ifc.text, cls).toContain(cls);
    expect((ifc.text.match(/IFCRELCONNECTSPORTS\(/g) ?? []).length).toBe(4);
    const copie = (await client.post("/projects").send({ code: "P.R2", name: "Réimport" })).body.id;
    const imp = await client.post(`/projects/${copie}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").set("X-File-Name", "reseaux.ifc").send(Buffer.from(ifc.text));
    expect(imp.status).toBe(200);
    const mImp = (await client.get(`/projects/${copie}/atelier/model`)).body.modele;
    const importes = Object.values(mImp.objets as Record<string, { classe: string; params: { ifcClasse?: string } }>).filter((o) => o.classe === "objet-importe");
    expect(importes.some((o) => o.params.ifcClasse === "IfcPipeSegment")).toBe(true);
    expect(importes.some((o) => o.params.ifcClasse === "IfcValve")).toBe(true);
    // Suppression d'un segment : ses supports et ses connexions disparaissent ; désactivation refusée tant qu'il reste des objets.
    rev = await post("sup", rev, [{ type: "segmentReseau.supprimer", params: { id: "g1" } }]);
    modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["sp1"]).toBeUndefined();
    expect((await client.post(`${base}/commands`).send(enveloppe("des", rev, [{ type: "ontologie.desactiver", params: { nom: "mep" } }]))).status).toBe(409);
  }, 120000);
});
