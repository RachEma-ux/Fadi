import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const driver = vi.hoisted(() => ({ construct: vi.fn(), query: vi.fn(), connect: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class Pool {
    query = driver.query;
    connect = driver.connect;
    end = driver.end;
    constructor(options: unknown) { driver.construct(options); }
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: vi.fn(() => ({ simulated: true })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

describe("application DB seam, completely mocked driver", () => {
  it("DB-N01 test mode never falls back to inherited DATABASE_URL", async () => {
    vi.stubEnv("VITEST", "true"); vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://synthetic:sentinel@192.0.2.1:5432/production");
    vi.stubEnv("TEST_DATABASE_URL", "");
    await expect(import("../db/client.js")).rejects.toThrow("TARGET_REQUIRED");
    expect(driver.construct).not.toHaveBeenCalled(); expect(driver.connect).not.toHaveBeenCalled(); expect(driver.query).not.toHaveBeenCalled();
  });
  it("the delivered runtime rejects unknown authorities before constructing even a mock pool", async () => {
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://synthetic:sentinel@127.0.0.1:55432/unit_test");
    const { createRuntimeTestPool } = await import("./test-database.js");
    expect(() => createRuntimeTestPool()).toThrow("ATTESTATION_REJECTED");
    expect(driver.construct).not.toHaveBeenCalled(); expect(driver.connect).not.toHaveBeenCalled(); expect(driver.query).not.toHaveBeenCalled();
  });
  it("NODE_ENV=test alone cannot select the production client", async () => {
    vi.stubEnv("VITEST", "false"); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://synthetic:sentinel@192.0.2.1:5432/production");
    await expect(import("../db/client.js")).rejects.toThrow("TARGET_REQUIRED"); expect(driver.construct).not.toHaveBeenCalled();
  });
  it("normal production configuration remains unchanged, verified with a constructor double only", async () => {
    vi.stubEnv("VITEST", "false"); vi.stubEnv("NODE_ENV", "production");
    const connectionString = "postgresql://synthetic:sentinel@192.0.2.1:5432/never_connected";
    vi.stubEnv("DATABASE_URL", connectionString);
    const { pool, db } = await import("../db/client.js");
    expect(driver.construct).toHaveBeenCalledExactlyOnceWith({ connectionString });
    expect(pool).toBeDefined(); expect(db).toEqual({ simulated: true });
    expect(driver.connect).not.toHaveBeenCalled(); expect(driver.query).not.toHaveBeenCalled();
  });
  it("DB-N13/N14 inherited external launcher variables do not authorize this test client", async () => {
    vi.stubEnv("TEST_DATABASE_URL", ""); vi.stubEnv("BASE_URL", "https://example.invalid"); vi.stubEnv("MIGRATE_ON_START", "1");
    const { createRuntimeTestPool } = await import("./test-database.js");
    expect(() => createRuntimeTestPool()).toThrow("TARGET_REQUIRED");
    expect(driver.construct).not.toHaveBeenCalled(); expect(driver.query).not.toHaveBeenCalled();
    // External E2E, migrations and restore launchers remain DB-3: they are NOT executed/secured by this test.
  });
});

describe("integration inventory (source inspection, no suite import)", () => {
  const suites = ["app", "routes/history", "routes/atelier-mecanique", "routes/atelier-exact", "routes/atelier-structure", "routes/atelier-reseaux", "routes/atelier-documentation", "routes/atelier-planches", "routes/atelier-coordination", "routes/atelier-commands", "routes/atelier-bois-tolerie", "routes/atelier-automatisation-p2"];
  it.each(suites)("DB-N12 %s reset uses the guarded capability", (name) => {
    const source = readFileSync(new URL(`../${name}.test.ts`, import.meta.url), "utf8");
    expect(source).toContain("await resetTestDatabase(pool,");
    expect(source).not.toMatch(/pool\.query\(\s*["'`]TRUNCATE/i);
    expect(source).toContain("guarded-test-pool.js");
  });
});
