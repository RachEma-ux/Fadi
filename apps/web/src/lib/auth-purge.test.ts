/**
 * Défaut PR #1 (gestion des comptes, phase 2) : à la déconnexion et sur 401 de `/auth/me`, l'appareil oublie tout ce
 * que le compte précédent y a laissé — cache des requêtes (mémoire et persistance), lots de l'Atelier, modèles,
 * Studio, conflits et `fadi.lastUser`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const calls = vi.hoisted(() => [] as string[]);
vi.mock("./local-store", () => ({
  localStore: {
    setOwner: (id: string | null) => calls.push(`owner:${id}`),
    removeValue: async (k: string) => { calls.push(`remove:${k}`); },
    studioOublierTout: async () => { calls.push("studio"); },
    oublierTout: async () => { calls.push("tout"); },
    quarantaineVider: async () => { calls.push("quarantaine"); },
  },
}));
vi.mock("./mutations", () => ({ conflictsStore: { clearAll: () => calls.push("conflicts") } }));

import { creerGardeSession, forgetDevice, forgetsSession, readLastUser } from "./auth-context";
import { ApiError, ecouterSessionPerdue, estSessionPerdue, request } from "./api";

afterEach(() => { calls.length = 0; vi.unstubAllGlobals(); });

describe("purge de l'appareil", () => {
  it("vide le cache des requêtes, les files locales, Studio, les conflits et l'utilisateur mémorisé", async () => {
    const store = new Map<string, string>([["fadi.lastUser", JSON.stringify({ id: "a", email: "a@x", displayName: null })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    const qc = new QueryClient();
    qc.setQueryData(["project", "p1"], { name: "secret de A" });
    await forgetDevice(qc);
    expect(qc.getQueryData(["project", "p1"])).toBeUndefined();
    expect(readLastUser()).toBeNull();
    expect(calls).toEqual(expect.arrayContaining(["conflicts", "owner:null", "remove:fadi-queries-1", "studio", "tout", "quarantaine"]));
  });
  it("D-BD-12 : sans compte connu de l'appareil, la quarantaine est gardée (consultable après une montée de version)", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    await forgetDevice(new QueryClient());
    expect(calls).toEqual(expect.arrayContaining(["studio", "tout"]));
    expect(calls).not.toContain("quarantaine");
  });
  it("seul un 401 du serveur vaut fin de session (une panne n'efface rien)", () => {
    expect(forgetsSession(new ApiError(401, "authentication_required"))).toBe(true);
    expect(forgetsSession(new ApiError(503, "x"))).toBe(false);
    expect(forgetsSession(new TypeError("réseau"))).toBe(false);
  });
});

describe("BD-7.4 — 401 en cours de session (constat A5)", () => {
  it("seul `authentication_required` vaut session perdue (un échec de connexion n'en est pas une)", () => {
    expect(estSessionPerdue(new ApiError(401, "authentication_required"))).toBe(true);
    expect(estSessionPerdue(new ApiError(401, "invalid_credentials"))).toBe(false);
    expect(estSessionPerdue(new ApiError(401, "invalid_code"))).toBe(false);
    expect(estSessionPerdue(new ApiError(403, "authentication_required"))).toBe(false);
  });
  it("un 401 reçu par n'importe quelle requête prévient les écouteurs, l'erreur reste levée", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { "Content-Type": "application/json" } }));
    const recus: ApiError[] = [];
    const arreter = ecouterSessionPerdue((e) => recus.push(e));
    await expect(request("/projects/p1")).rejects.toMatchObject({ status: 401, code: "authentication_required" });
    expect(recus).toHaveLength(1);
    arreter();
    await expect(request("/projects/p1")).rejects.toBeInstanceOf(ApiError);
    expect(recus).toHaveLength(1);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 }));
    const recus2: ApiError[] = [];
    const arreter2 = ecouterSessionPerdue((e) => recus2.push(e));
    await expect(request("/auth/login")).rejects.toBeInstanceOf(ApiError);
    expect(recus2).toHaveLength(0);
    arreter2();
  });
  it("la garde purge une fois pour une rafale de 401, et seulement si un compte est connecté", async () => {
    let connecte = false;
    const purger = vi.fn(async () => { connecte = false; });
    const garde = creerGardeSession({ connecte: () => connecte, purger });
    await garde();
    expect(purger).not.toHaveBeenCalled();
    connecte = true;
    await Promise.all([garde(), garde(), garde()]);
    expect(purger).toHaveBeenCalledTimes(1);
    await garde();
    expect(purger).toHaveBeenCalledTimes(1);
  });
});
