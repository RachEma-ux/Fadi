/**
 * BD-4.9 (chantier base-donnees, constat Q14) : les fichiers du build sont servis sans lecture de session, donc sans
 * requête à la base, même avec un cookie de session. Base simulée : toute requête est comptée.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const requetes = vi.hoisted(() => ({ n: 0 }));
vi.mock("./db/client.js", () => {
  const compter = () => { requetes.n++; return Promise.reject(new Error("aucune base dans ce test")); };
  const db: unknown = new Proxy(() => undefined, { get: () => db, apply: compter });
  return { pool: { query: compter, connect: compter }, db };
});

let dist = "";
const precedent = process.env["WEB_DIST"];
beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "fadi-statique-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Fadi</title>");
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(dist, "sw.js"), "self.addEventListener('install', () => {})");
  process.env["WEB_DIST"] = dist;
});
afterAll(() => {
  if (precedent === undefined) delete process.env["WEB_DIST"];
  else process.env["WEB_DIST"] = precedent;
});

describe("BD-4.9 — fichiers du build servis avant la lecture de session", () => {
  it("un fichier empreint et le service worker sont servis sans aucune requête à la base, cookie compris", async () => {
    const { createApp } = await import("./app.js");
    const app = createApp();
    requetes.n = 0;
    const asset = await request(app).get("/assets/index-abc123.js").set("Cookie", "fadi_session=jeton-quelconque");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const sw = await request(app).get("/sw.js").set("Cookie", "fadi_session=jeton-quelconque");
    expect(sw.status).toBe(200);
    expect(sw.headers["cache-control"]).toBe("no-cache");
    expect(requetes.n).toBe(0);
  });
});
