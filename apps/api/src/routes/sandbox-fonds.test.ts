/**
 * Originaux des fonds calés (cas 4, lot C4, étape 1 ; décision du maître d'ouvrage du 27 novembre 2026) — intégration
 * contre PostgreSQL : l'image reçue rangée telle quelle avec son empreinte, relue à l'identique par son compte seul ;
 * type d'après les octets ; même fichier rangé une fois.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { inscrire } from "../test-helpers/inscription.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

async function compte(email: string) {
  const client = request.agent(app);
  const r = await inscrire(client, email, "correct-horse-battery");
  expect(r.status).toBe(201);
  return client;
}
/** Octets d'essai : signature PNG suivie de 400 ko (au-delà de la limite générale de 256 ko). */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400 * 1024, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1000, 3)]);

describe("Originaux des fonds — /sandbox/fonds", () => {
  it("range l'original tel quel, le relit à l'identique ; même fichier rangé une fois", async () => {
    const a = await compte("fonds-a@example.com");
    const r = await a.post("/sandbox/fonds").set("Content-Type", "image/png").set("X-Fadi-Nom", encodeURIComponent("plan reçu.png")).send(PNG);
    expect(r.status).toBe(201);
    const empreinte = createHash("sha256").update(PNG).digest("hex");
    expect(r.body.original).toMatchObject({ nom: "plan reçu.png", type: "image/png", taille: PNG.length, empreinte });
    expect(r.body.original.id).toMatch(/^sbxfond_[0-9a-f-]{36}$/);
    const lu = await a.get(`/sandbox/fonds/${r.body.original.id}`).buffer(true).parse((res, fin) => { const b: Buffer[] = []; res.on("data", (c: Buffer) => b.push(c)); res.on("end", () => fin(null, Buffer.concat(b))); });
    expect(lu.status).toBe(200);
    expect(lu.headers["content-type"]).toBe("image/png");
    expect(lu.headers["cache-control"]).toContain("no-store");
    expect(Buffer.compare(lu.body as Buffer, PNG)).toBe(0);
    const encore = await a.post("/sandbox/fonds").set("Content-Type", "image/png").set("X-Fadi-Nom", "autre.png").send(PNG);
    expect(encore.status).toBe(200);
    expect(encore.body.original.id).toBe(r.body.original.id);
    expect((await pool.query("SELECT count(*)::int AS n FROM sandbox_fonds_originaux")).rows[0].n).toBe(1);
    expect((await a.post("/sandbox/fonds").set("Content-Type", "image/jpeg").set("X-Fadi-Nom", "photo.jpg").send(JPEG)).status).toBe(201);
  });

  it("type d'après les octets, nom exigé, compte exigé, original d'un autre compte introuvable", async () => {
    expect((await request(app).post("/sandbox/fonds").set("Content-Type", "image/png").set("X-Fadi-Nom", "a.png").send(PNG)).status).toBe(401);
    const a = await compte("fonds-b@example.com");
    const b = await compte("fonds-c@example.com");
    expect((await a.post("/sandbox/fonds").set("Content-Type", "image/png").set("X-Fadi-Nom", "a.png").send(JPEG)).status).toBe(415);
    expect((await a.post("/sandbox/fonds").set("Content-Type", "image/gif").set("X-Fadi-Nom", "a.gif").send(Buffer.from("GIF89a"))).status).toBe(415);
    expect((await a.post("/sandbox/fonds").set("Content-Type", "image/png").send(PNG)).body.champs).toEqual(["nom"]);
    expect((await a.post("/sandbox/fonds").set("Content-Type", "image/png").set("X-Fadi-Nom", "dossier%2Fa.png").send(PNG)).status).toBe(400);
    const r = await a.post("/sandbox/fonds").set("Content-Type", "image/png").set("X-Fadi-Nom", "a.png").send(PNG);
    expect((await b.get(`/sandbox/fonds/${r.body.original.id}`)).status).toBe(404);
  });
});
