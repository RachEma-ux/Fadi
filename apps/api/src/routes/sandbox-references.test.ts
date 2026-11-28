/**
 * Fichiers des références verrouillées (cas 4, lot C4, étape 3) — intégration contre PostgreSQL : le fichier reçu rangé
 * tel quel avec son empreinte, relu à l'identique par son compte seul ; contenu conforme au format annoncé ; même
 * fichier rangé une fois.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { inscrire } from "../test-helpers/inscription.js";
import { contenuConforme } from "./sandbox-references.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

async function compte(email: string) {
  const client = request.agent(app);
  const r = await inscrire(client, email, "correct-horse-battery");
  expect(r.status).toBe(201);
  return client;
}
/** OBJ d'essai au-delà de la limite générale de 256 ko. */
const OBJ = Buffer.from(`# relevé\n${"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n".repeat(12000)}`);
const IFC = Buffer.from("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n");
const STL = (() => {
  const b = Buffer.alloc(84 + 50);
  b.writeUInt32LE(1, 80);
  return b;
})();

describe("Fichiers des références — /sandbox/references", () => {
  it("range le fichier tel quel, le relit à l'identique ; même fichier rangé une fois", async () => {
    const a = await compte("references-a@example.com");
    const r = await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "obj").set("X-Fadi-Nom", encodeURIComponent("relevé.obj")).send(OBJ);
    expect(r.status).toBe(201);
    expect(r.body.fichier).toMatchObject({ nom: "relevé.obj", format: "obj", taille: OBJ.length, empreinte: createHash("sha256").update(OBJ).digest("hex") });
    expect(r.body.fichier.id).toMatch(/^sbxref_[0-9a-f-]{36}$/);
    const lu = await a.get(`/sandbox/references/${r.body.fichier.id}`).buffer(true).parse((res, fin) => { const b: Buffer[] = []; res.on("data", (c: Buffer) => b.push(c)); res.on("end", () => fin(null, Buffer.concat(b))); });
    expect(lu.status).toBe(200);
    expect(lu.headers["cache-control"]).toContain("no-store");
    expect(Buffer.compare(lu.body as Buffer, OBJ)).toBe(0);
    const encore = await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "obj").set("X-Fadi-Nom", "autre.obj").send(OBJ);
    expect(encore.status).toBe(200);
    expect(encore.body.fichier.id).toBe(r.body.fichier.id);
    expect((await pool.query("SELECT count(*)::int AS n FROM sandbox_references_fichiers")).rows[0].n).toBe(1);
    expect((await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "ifc").set("X-Fadi-Nom", "a.ifc").send(IFC)).status).toBe(201);
    expect((await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "stl").set("X-Fadi-Nom", "a.stl").send(STL)).status).toBe(201);
  });

  it("format conforme, nom exigé, compte exigé, fichier d'un autre compte introuvable", async () => {
    expect((await request(app).post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "obj").set("X-Fadi-Nom", "a.obj").send(OBJ)).status).toBe(401);
    const a = await compte("references-b@example.com");
    const b = await compte("references-c@example.com");
    expect((await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "ifc").set("X-Fadi-Nom", "a.ifc").send(OBJ)).status).toBe(415);
    expect((await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "dwg").set("X-Fadi-Nom", "a.dwg").send(OBJ)).status).toBe(415);
    expect((await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "obj").send(OBJ)).body.champs).toEqual(["nom"]);
    const r = await a.post("/sandbox/references").set("Content-Type", "application/octet-stream").set("X-Fadi-Format", "obj").set("X-Fadi-Nom", "a.obj").send(OBJ);
    expect((await b.get(`/sandbox/references/${r.body.fichier.id}`)).status).toBe(404);
  });

  it("signatures : IFC, STL ASCII et binaire, OBJ texte, PDF", () => {
    expect(contenuConforme("ifc", IFC)).toBe(true);
    expect(contenuConforme("stl", STL)).toBe(true);
    expect(contenuConforme("stl", Buffer.from("solid x\nfacet normal 0 0 1\n"))).toBe(true);
    expect(contenuConforme("obj", Buffer.from("o a\nv 1 2 3\n"))).toBe(true);
    expect(contenuConforme("obj", Buffer.from([0, 1, 2]))).toBe(false);
    expect(contenuConforme("stl", Buffer.alloc(100))).toBe(false);
    expect(contenuConforme("ifczip", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(contenuConforme("ifczip", IFC)).toBe(false);
    // PDF reçu (lot C4, étape 4).
    expect(contenuConforme("pdf", Buffer.from("%PDF-1.7\n%\xe2\xe3\n1 0 obj"))).toBe(true);
    expect(contenuConforme("pdf", Buffer.from("PDF ou pas"))).toBe(false);
  });
});
