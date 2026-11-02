import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { lireVersion, versionRouter } from "./version.js";

const SHA = "3f643c1100000000000000000000000000000abc";

describe("version construite", () => {
  it("lit le commit et la date fournis à la construction", () => {
    expect(lireVersion({ FADI_COMMIT: SHA, FADI_BUILD_DATE: "2026-10-20T21:30:00Z" })).toEqual({ commit: SHA, buildDate: "2026-10-20T21:30:00Z" });
    expect(lireVersion({ FADI_COMMIT: " 3F643C1 " }).commit).toBe("3f643c1");
  });

  it("répond « inconnu » en développement ou pour une valeur mal formée", () => {
    expect(lireVersion({})).toEqual({ commit: "inconnu", buildDate: "inconnu" });
    expect(lireVersion({ FADI_COMMIT: "inconnu", FADI_BUILD_DATE: "inconnu" })).toEqual({ commit: "inconnu", buildDate: "inconnu" });
    for (const commit of ["", "abc", "main", "g".repeat(40), "a".repeat(41), "$(id)"]) expect(lireVersion({ FADI_COMMIT: commit }).commit).toBe("inconnu");
    for (const date of ["2026-10-20", "hier", "2026-13-45T99:99:99Z", "2026-10-20T21:30:00+02:00", "2026-02-31T21:30:00Z", "2026-01-01T24:00:00Z", "2026-10-20T21:30:60Z"]) expect(lireVersion({ FADI_BUILD_DATE: date }).buildDate).toBe("inconnu");
  });

  it("GET /version renvoie la version en JSON, sans cache", async () => {
    const app = express().use("/version", versionRouter({ FADI_COMMIT: SHA, FADI_BUILD_DATE: "2026-10-20T21:30:00Z" }));
    const res = await request(app).get("/version");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({ commit: SHA, buildDate: "2026-10-20T21:30:00Z" });
    const dev = await request(express().use("/version", versionRouter({}))).get("/version");
    expect(dev.body).toEqual({ commit: "inconnu", buildDate: "inconnu" });
  });

  it("GET /version/donnees : quittance du serveur (commit et état de l'import automatique des données GeoData)", async () => {
    const res = await request(express().use("/version", versionRouter({ FADI_COMMIT: SHA }))).get("/version/donnees");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ commit: SHA, geodata: { etat: "desactive" } });
  });
});
