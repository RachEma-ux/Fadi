import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { configRetention, PURGES, retentionActive, runRetentionTechnique } from "./retention-technique.js";

describe("BD-6.1 — purge des données techniques", () => {
  it("désactivée tant qu'aucune durée n'est fournie (registre de traitement, D-BD-11)", async () => {
    const c = configRetention({});
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
    expect(configRetention({ FADI_RETENTION_SESSIONS_JOURS: "30" })).toMatchObject({ sessionsJours: 30, jetonsJours: null });
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
