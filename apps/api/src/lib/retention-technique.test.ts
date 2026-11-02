import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { configRetention, DUREE_RETENTION_JOURS, PURGES, retentionActive, runRetentionTechnique } from "./retention-technique.js";

describe("BD-6.1 — purge des données techniques", () => {
  it("30 jours par défaut (D-BD-11) ; « desactive » coupe une catégorie, toutes coupées = aucune connexion", async () => {
    expect(DUREE_RETENTION_JOURS).toBe(30);
    expect(configRetention({})).toEqual({ sessionsJours: 30, jetonsJours: 30, courrielsJours: 30 });
    expect(configRetention({ FADI_RETENTION_JETONS_JOURS: "desactive" })).toEqual({ sessionsJours: 30, jetonsJours: null, courrielsJours: 30 });
    const c = configRetention({ FADI_RETENTION_SESSIONS_JOURS: "desactive", FADI_RETENTION_JETONS_JOURS: "desactive", FADI_RETENTION_COURRIELS_JOURS: "desactive" });
    expect(c).toEqual({ sessionsJours: null, jetonsJours: null, courrielsJours: null });
    expect(retentionActive(c)).toBe(false);
    const pool = { connect: vi.fn() } as unknown as Pool;
    await expect(runRetentionTechnique(pool, c)).resolves.toEqual({ sessions: 0, jetons: 0, courriels: 0 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("durées invalides refusées ; les courriels gardent au moins 2 jours (quota glissant de 24 h)", () => {
    expect(() => configRetention({ FADI_RETENTION_SESSIONS_JOURS: "0" })).toThrow(/FADI_RETENTION_SESSIONS_JOURS/);
    expect(() => configRetention({ FADI_RETENTION_COURRIELS_JOURS: "1" })).toThrow(/au moins 2/);
    expect(() => configRetention({ FADI_RETENTION_JETONS_JOURS: "trente" })).toThrow(/FADI_RETENTION_JETONS_JOURS/);
    expect(configRetention({ FADI_RETENTION_SESSIONS_JOURS: "45" })).toMatchObject({ sessionsJours: 45, jetonsJours: 30 });
  });

  it("par lots, seulement les catégories configurées, sous verrou consultatif ; verrou occupé = rien", async () => {
    const appels: string[] = [];
    const lots = [5_000, 12];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("pg_try_advisory_lock")) { appels.push("verrou"); return { rows: [{ ok: true }] }; }
        if (sql.includes("pg_advisory_unlock")) { appels.push("deverrou"); return { rows: [] }; }
        appels.push(sql === PURGES.sessions ? "sessions" : sql === PURGES.courriels ? "courriels" : "autre");
        return { rowCount: sql === PURGES.sessions ? lots.shift() ?? 0 : 3 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client } as unknown as Pool;
    const bilan = await runRetentionTechnique(pool, { sessionsJours: 30, jetonsJours: null, courrielsJours: 90 });
    expect(bilan).toEqual({ sessions: 5_012, jetons: 0, courriels: 3 });
    expect(appels).toEqual(["verrou", "sessions", "sessions", "courriels", "deverrou"]);
    expect(client.release).toHaveBeenCalledOnce();

    const occupe = { query: vi.fn(async () => ({ rows: [{ ok: false }] })), release: vi.fn() };
    await expect(runRetentionTechnique({ connect: async () => occupe } as unknown as Pool, { sessionsJours: 30, jetonsJours: null, courrielsJours: null }))
      .resolves.toMatchObject({ ignore: "verrou-occupe", sessions: 0 });
  });
});
