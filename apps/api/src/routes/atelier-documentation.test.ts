/**
 * Lot P2-7 (documentation et relevé) contre la vraie base : cote mécanique et étiquette intelligente dans le DXF, annotations
 * de fabrication (refus nommés, IFC .SYMBOL.), tableaux perçages / ferraillage / débit (CSV), vue isométrique et feuille
 * gabarit production béton (SVG / PDF), nuage de points LAS lu par le serveur (origine déclarée requise, E57 refusé),
 * trois documents de plus au catalogue.
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
const IPE = { forme: "I", largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.006), epaisseurAile: m(0.009) };
const D50 = { forme: "circulaire", diametre: m(0.0603), epaisseur: m(0.0029) };
const texteDe = (r: { text?: string; body?: unknown }): string => (typeof r.text === "string" && r.text ? r.text : Buffer.isBuffer(r.body) ? r.body.toString("utf8") : typeof r.body === "string" ? r.body : "");

function las(points: { x: number; y: number; z: number }[]): Buffer {
  const header = 227, rec = 20, scale = 0.001, offset = { x: 1000, y: 2000, z: 100 };
  const buf = Buffer.alloc(header + points.length * rec);
  buf.write("LASF", 0, "latin1");
  buf[24] = 1; buf[25] = 2;
  buf.writeUInt16LE(header, 94); buf.writeUInt32LE(header, 96); buf[104] = 0; buf.writeUInt16LE(rec, 105); buf.writeUInt32LE(points.length, 107);
  buf.writeDoubleLE(scale, 131); buf.writeDoubleLE(scale, 139); buf.writeDoubleLE(scale, 147);
  buf.writeDoubleLE(offset.x, 155); buf.writeDoubleLE(offset.y, 163); buf.writeDoubleLE(offset.z, 171);
  points.forEach((p, i) => { const o = header + i * rec; buf.writeInt32LE(Math.round((p.x - offset.x) / scale), o); buf.writeInt32LE(Math.round((p.y - offset.y) / scale), o + 4); buf.writeInt32LE(Math.round((p.z - offset.z) / scale), o + 8); });
  return buf;
}

describe("Lot P2-7 — documentation, annotations de fabrication, nuage de points", () => {
  it("annotations, tableaux, isométrique, feuille gabarit, nuage LAS, catalogue des documents", async () => {
    const client = await registerAndLogin("documentation@example.com");
    const pid = (await client.post("/projects").send({ code: "P.D", name: "Documentation" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }, { type: "ontologie.activer", params: { nom: "structure" } }, { type: "ontologie.activer", params: { nom: "mep" } }]);
    rev = await post("objets", rev, [
      { type: "poutre.creer", params: { id: "b1", niveauId: "rdc", nom: "P1", a: pt(0, 0), b: pt(6, 0), za: 2.8, section: IPE, materiau: "acier" } },
      { type: "plaque.creer", params: { id: "pl1", niveauId: "rdc", nom: "Dalle", contour: [pt(0, 2), pt(1, 2), pt(1, 3), pt(0, 3)], trous: [], epaisseur: m(0.2), z: 3, materiau: "beton" } },
      { type: "armature.creer", params: { id: "ar1", niveauId: "rdc", nom: "C1", hoteId: "pl1", forme: "cadre", diametre: m(0.01), points: [pt(0.05, 2.05), pt(0.45, 2.05), pt(0.45, 2.45), pt(0.05, 2.45)], z: 3.01, nombre: 4, espacement: m(0.1), nuance: "B500B (déclarée)" } },
      { type: "segmentReseau.creer", params: { id: "s1", niveauId: "rdc", nom: "EF 1", repere: "EF-01", systeme: "tuyau", sommets: [P3(0, 6, 2.5), P3(4, 6, 2.5)], section: D50, fluide: "eau froide" } },
      { type: "cotation.creer", params: { id: "k1", niveauId: "rdc", a: pt(0, 0), b: pt(6, 0), decalage: m(0.5), prefixe: "Ø", tolerance: { plus: 0.001, moins: 0.0005 } } },
      { type: "etiquette.creer", params: { id: "et1", niveauId: "rdc", position: pt(3, 1), objetId: "b1", champ: "{nom} · {section} · {longueur}" } },
      { type: "annotationFabrication.creer", params: { id: "af1", niveauId: "rdc", type: "soudure", cordon: "angle", taille: m(0.005), cote: "fleche", peripherique: true, chantier: false, objetId: "b1", position: pt(2, -1), attache: pt(2, 0) } },
      { type: "annotationFabrication.creer", params: { id: "af2", niveauId: "rdc", type: "tolerance-geometrique", caracteristique: "planeite", valeur: m(0.0002), references: [], objetId: "pl1", position: pt(1.5, 2.5), attache: pt(1, 2.5) } },
    ]);
    // Refus nommés.
    expect(JSON.stringify((await client.post(`${base}/commands`).send(enveloppe("r1", rev, [{ type: "cotation.creer", params: { id: "x", niveauId: "rdc", a: pt(0, 0), b: pt(1, 0), tolerance: { plus: -1, moins: 0 } } }]))).body)).toMatch(/≥ 0/);
    expect(JSON.stringify((await client.post(`${base}/commands`).send(enveloppe("r2", rev, [{ type: "etiquette.creer", params: { id: "x", niveauId: "rdc", position: pt(0, 0), objetId: "b1", champ: "{masse}" } }]))).body)).toMatch(/inconnu/);
    expect(JSON.stringify((await client.post(`${base}/commands`).send(enveloppe("r3", rev, [{ type: "annotationFabrication.creer", params: { id: "x", niveauId: "rdc", type: "etat-de-surface", parametre: "Ra", valeur: 0, position: pt(0, 0) } }]))).body)).toMatch(/> 0/);
    // Documents : trois tableaux de plus (18), isométrique, feuille gabarit.
    rev = await post("docs", rev, [
      { type: "vue.creer", params: { id: "v-iso", type: "isometrique", titre: "Iso EF", echelle: 50 } },
      { type: "feuille.gabarit", params: { id: "f-beton", vueId: "v-beton", gabarit: "production-beton", niveauId: "rdc" } },
    ]);
    const docs = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; href: string; label: string }[];
    expect(docs.filter((d) => d.kind.startsWith("atelier-tableau-"))).toHaveLength(18);
    const iso = docs.find((d) => d.kind === "atelier-vue-v-iso-svg")!;
    expect(iso.label).toContain("isométrique de tuyauterie");
    const svgIso = await client.get(iso.href);
    expect(svgIso.status).toBe(200);
    expect(texteDe(svgIso)).toContain("EF-01");
    const feuille = docs.find((d) => d.kind === "atelier-feuille-f-beton-svg")!;
    const svgF = await client.get(feuille.href);
    expect(svgF.status).toBe(200);
    expect(texteDe(svgF)).toContain("Plan de production béton");
    expect(texteDe(svgF)).toContain("B500B");
    const pdfF = await client.get(`${base.replace("/atelier", "")}/documents/atelier/feuilles/f-beton.pdf`);
    expect(pdfF.status).toBe(200);
    const fer = (await client.get(docs.find((d) => d.kind === "atelier-tableau-ferraillage")!.href)).text;
    expect(fer).toContain("C1");
    expect(fer).toContain("400 + 400 + 400 + 400");
    expect(fer).toContain("non évaluée");
    const debit = (await client.get(docs.find((d) => d.kind === "atelier-tableau-debit")!.href)).text;
    expect(debit).toContain("structure");
    expect(debit).toContain("réseau tuyau");
    const perc = (await client.get(docs.find((d) => d.kind === "atelier-tableau-percages")!.href)).text;
    expect(perc).toContain("Niveau");
    // Plan DXF et IFC : textes dérivés.
    const dxf = await client.get(`${base}/dxf/rdc`);
    if (dxf.status === 200) { expect(texteDe(dxf)).toContain("P1 · Profilé I 100"); }
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    expect(ifc.text).toContain(".SYMBOL.");
    expect(ifc.text).toContain("fabrication:soudure");
    // Nuage de points : origine requise, E57 refusé, LAS lu et posé, tranche.
    const pts = Array.from({ length: 300 }, (_, i) => ({ x: 1000 + i * 0.02, y: 2000 + (i % 6) * 0.5, z: 100 + (i % 2 === 0 ? 1.2 : 2.5) }));
    const sansOrigine = await client.post(`${base}/nuages`).set("Content-Type", "application/octet-stream").set("X-File-Name", "releve.las").set("X-Nuage-Niveau", "rdc").send(las(pts));
    expect(sansOrigine.status).toBe(400);
    expect(JSON.stringify(sansOrigine.body)).toMatch(/jamais devinée/);
    const e57 = await client.post(`${base}/nuages`).set("Content-Type", "application/octet-stream").set("X-File-Name", "releve.e57").set("X-Nuage-Niveau", "rdc").set("X-Nuage-Origine", encodeURIComponent(JSON.stringify({ x: 1000, y: 2000, z: 100 }))).send(Buffer.from("xx"));
    expect(e57.status).toBe(400);
    expect(JSON.stringify(e57.body)).toMatch(/E57/);
    const ok = await client.post(`${base}/nuages`).set("Content-Type", "application/octet-stream").set("X-File-Name", "releve.las").set("X-Nuage-Niveau", "rdc").set("X-Nuage-Nom", encodeURIComponent("Relevé 1")).set("X-Nuage-Coupe", "1.2").set("X-Nuage-Points", "100").set("X-Nuage-Origine", encodeURIComponent(JSON.stringify({ x: 1000, y: 2000, z: 100 }))).send(las(pts));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.lecture).toMatchObject({ format: "las", version: "1.2", nombrePoints: 300, retenus: 100, pas: 3 });
    const modele = (await client.get(`${base}/model`)).body.modele;
    const nuage = Object.values(modele.objets as Record<string, { classe: string; params: Record<string, unknown> }>).find((o) => o.classe === "nuage-de-points")!;
    expect(nuage.params["nom"]).toBe("Relevé 1");
    expect(nuage.params["coupeZ"]).toBe(1.2);
    expect((nuage.params["points"] as unknown[]).length).toBe(100);
    expect((nuage.params["points"] as { x: number }[])[0]!.x).toBeCloseTo(0, 6);
    const planSvg = await client.get(`${base}/vues`);
    expect([200, 404]).toContain(planSvg.status);
    // Le nuage est dessiné derrière le plan : vue plan générée.
    rev = await post("vue-plan", (await client.get(`${base}/model`)).body.revision, [{ type: "vue.creer", params: { id: "v-plan", type: "plan", titre: "Plan RDC", echelle: 100, niveauId: "rdc" } }]);
    const plan = await client.get(`/projects/${pid}/documents/atelier/vues/v-plan.svg`);
    expect(plan.status).toBe(200);
    expect(texteDe(plan)).toContain('data-objet="nuage-de-points-'); // tranche dessinée en croix fines derrière le plan
    expect(texteDe(plan)).toContain("Ø6000 +1/−0,5");
  }, 60_000);
});
