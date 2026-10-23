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
  },
}));
vi.mock("./mutations", () => ({ conflictsStore: { clearAll: () => calls.push("conflicts") } }));

import { forgetDevice, forgetsSession, readLastUser } from "./auth-context";
import { ApiError } from "./api";

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
    expect(calls).toEqual(expect.arrayContaining(["conflicts", "owner:null", "remove:fadi-queries-1", "studio", "tout"]));
  });
  it("seul un 401 du serveur vaut fin de session (une panne n'efface rien)", () => {
    expect(forgetsSession(new ApiError(401, "authentication_required"))).toBe(true);
    expect(forgetsSession(new ApiError(503, "x"))).toBe(false);
    expect(forgetsSession(new TypeError("réseau"))).toBe(false);
  });
});
