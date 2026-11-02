import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { applySchema, isLockTimeout } from "./apply-schema.js";

const verrou = () => Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });

/** Faux pool : la requête de surveillance des transactions longues, puis l'exécution du schéma. */
function fauxPool(schema: Array<() => unknown>, longues = 0) {
  const appels: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("pg_stat_activity")) { appels.push("controle"); return { rows: [{ n: String(longues) }] }; }
    appels.push("schema");
    const etape = schema.shift();
    if (!etape) throw new Error("appel inattendu");
    return etape();
  });
  return { pool: { query } as unknown as Pool, appels };
}

describe("BD-1.1 — application du schéma sans geler le trafic", () => {
  it("init.sql fixe lock_timeout et statement_timeout en tête, puis les rend à la session à la fin", () => {
    const sql = readFileSync(new URL("./init.sql", import.meta.url), "utf8");
    const premiere = sql.indexOf("CREATE EXTENSION");
    expect(sql.indexOf("SET lock_timeout = '3s';")).toBeGreaterThan(-1);
    expect(sql.indexOf("SET lock_timeout = '3s';")).toBeLessThan(premiere);
    expect(sql.indexOf("SET statement_timeout = '10min';")).toBeLessThan(premiere);
    expect(sql.trimEnd().endsWith("RESET lock_timeout;\nRESET statement_timeout;")).toBe(true);
  });

  it("relance après un délai de verrou, puis réussit", async () => {
    const { pool, appels } = fauxPool([() => { throw verrou(); }, () => ({ rows: [] })]);
    const sleep = vi.fn(async () => undefined);
    const log = vi.fn();
    await expect(applySchema(pool, "SELECT 1", { sleep, log })).resolves.toEqual({ attempts: 2 });
    expect(appels).toEqual(["controle", "schema", "controle", "schema"]);
    expect(sleep).toHaveBeenCalledWith(5_000);
    expect(log.mock.calls[0]![0]).toMatchObject({ level: "warn", attempt: 1 });
  });

  it("abandonne après le nombre d'essais et propage l'erreur de verrou", async () => {
    const { pool } = fauxPool([() => { throw verrou(); }, () => { throw verrou(); }]);
    await expect(applySchema(pool, "SELECT 1", { attempts: 2, sleep: async () => undefined, log: () => undefined })).rejects.toMatchObject({ code: "55P03" });
  });

  it("toute autre erreur est propagée sans nouvel essai", async () => {
    const { pool, appels } = fauxPool([() => { throw Object.assign(new Error("syntax"), { code: "42601" }); }]);
    await expect(applySchema(pool, "SELECT 1", { sleep: async () => undefined, log: () => undefined })).rejects.toMatchObject({ code: "42601" });
    expect(appels.filter((a) => a === "schema")).toHaveLength(1);
  });

  it("signale les transactions longues en cours avant de migrer", async () => {
    const { pool } = fauxPool([() => ({ rows: [] })], 2);
    const log = vi.fn();
    await applySchema(pool, "SELECT 1", { log, sleep: async () => undefined });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: "migration: transactions longues en cours", count: 2 }));
  });

  it("reconnaît le code 55P03 seulement", () => {
    expect(isLockTimeout(verrou())).toBe(true);
    expect(isLockTimeout(new Error("x"))).toBe(false);
    expect(isLockTimeout(null)).toBe(false);
  });
});
