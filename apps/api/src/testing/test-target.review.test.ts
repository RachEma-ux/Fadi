/** Independent A5 adversarial cases: crypto only, no pg import, socket, DB or SQL. */
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  authorizeTestTarget, capturedTestTarget, parseTestTarget, SIGNATURE_DOMAIN,
  testTargetFingerprint, TestDatabaseRefusal,
  type TestTargetDescriptor, type AuthorizedTestTarget,
} from "./test-target.js";

const pair = generateKeyPairSync("ed25519");
const stranger = generateKeyPairSync("ed25519");
const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const now = 1_900_000_000_000;
const sha = "a".repeat(40);
const sentinel = "synthetic-review-password-never-real";
const url = (host = "127.0.0.1", port = 55432, database = "review_test", role = "review_role") =>
  `postgresql://${role}:${sentinel}@${host}:${port}/${database}`;
function descriptor(): TestTargetDescriptor {
  return {
    schemaVersion: 1, environment: "ephemeral", disposable: true,
    runId: "review-run", commitSha: sha, issuedAt: now - 100, expiresAt: now + 1000,
    transport: { host: "127.0.0.1", port: 55432, database: "review_test", role: "review_role" },
    tls: { mode: "disable", ca: "" },
    identity: { serverAddress: "172.18.0.2", serverPort: 5432, serverVersion: "160003", postgisVersion: "3.4.2", markerId: "review-marker" },
  };
}
function envelope(value: unknown = descriptor(), key = pair.privateKey) {
  const payload = JSON.stringify(value);
  return { keyId: "review-key", payload, signature: sign(null, Buffer.from(SIGNATURE_DOMAIN + payload), key).toString("base64") };
}
const env = () => ({ TEST_DATABASE_URL: url(), TEST_DATABASE_RUN_ID: "review-run", TEST_DATABASE_COMMIT_SHA: sha });
const policy = (clock = () => now) => ({ authorities: { "review-key": publicPem }, now: clock });

/** Calls a stand-in driver only AFTER authorization; the stand-in cannot open a socket. */
function rejectionCase(environment: Record<string, string | undefined>, signed: unknown, code?: string) {
  const driverFactory = vi.fn(() => ({ connect: vi.fn(), query: vi.fn() }));
  const destructiveSql = vi.fn();
  let caught: unknown;
  try {
    const target = authorizeTestTarget(environment, signed, policy());
    driverFactory();
    // A refused authorization must never reach the stand-in reset either.
    destructiveSql(target);
  } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(TestDatabaseRefusal);
  if (code) expect((caught as TestDatabaseRefusal).code).toBe(code);
  expect(driverFactory).not.toHaveBeenCalled();
  expect(destructiveSql).not.toHaveBeenCalled();
  expect(String(caught)).not.toContain(sentinel);
  expect(String(caught)).not.toContain("postgresql:");
}

describe("A5 independent target authorization attacks (entirely pure)", () => {
  it("DB-N01 refuses inherited DATABASE_URL, even with NODE_ENV=test", () => {
    rejectionCase({ DATABASE_URL: url(), NODE_ENV: "test" }, envelope(), "TARGET_REQUIRED");
  });
  it.each([
    ["missing explicit port", `postgresql://review_role:${sentinel}@127.0.0.1/review_test`],
    ["hostname requiring DNS", `postgresql://review_role:${sentinel}@localhost:55432/review_test`],
    ["libpq host override", url() + "?host=127.0.0.2"],
    ["libpq service override", url() + "?service=production"],
    ["duplicate parameters", url() + "?sslmode=require&sslmode=disable"],
    ["fragment", url() + "#ignored"],
    ["encoded path separator", url().replace("review_test", "review_test%2Fother")],
    ["encoded null", url().replace(sentinel, "%00")],
    ["wrong protocol", url().replace("postgresql:", "postgres:")],
    ["whitespace", url() + "\n"],
    ["socket path", `postgresql://review_role:${sentinel}@%2Ftmp:55432/review_test`],
  ])("DB-N02/N06 refuses ambiguous URL: %s", (_name, raw) => {
    rejectionCase({ ...env(), TEST_DATABASE_URL: raw }, envelope(), "TARGET_PARSE_REJECTED");
  });
  it.each([
    ["endpoint", url("127.0.0.2")], ["port", url("127.0.0.1", 55433)],
    ["database", url("127.0.0.1", 55432, "production")],
    ["role", url("127.0.0.1", 55432, "review_test", "postgres")],
  ])("DB-N03/N04 rejects a changed %s despite valid signature", (_name, raw) => {
    rejectionCase({ ...env(), TEST_DATABASE_URL: raw, NODE_ENV: "test", ALLOW_DESTRUCTIVE: "true" }, envelope(), "TARGET_NOT_ALLOWED");
  });
  it.each(["PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGSERVICE", "PGOPTIONS", "PGPASSFILE"])("refuses libpq fallback %s", (key) => {
    rejectionCase({ ...env(), [key]: "untrusted" }, envelope(), "TARGET_NOT_ALLOWED");
  });
  it("DB-N05 rejects a mathematically valid signature from an untrusted key", () => {
    rejectionCase(env(), envelope(descriptor(), stranger.privateKey), "ATTESTATION_REJECTED");
  });
  it("DB-N05 rejects keyId from the object prototype", () => {
    rejectionCase(env(), { ...envelope(), keyId: "toString" }, "ATTESTATION_REJECTED");
  });
  it("DB-N05 rejects edited payload with a stale genuine signature", () => {
    const signed = envelope();
    rejectionCase(env(), { ...signed, payload: JSON.stringify({ ...descriptor(), disposable: false }) }, "ATTESTATION_REJECTED");
  });
  it.each([
    ["expired", { expiresAt: now }], ["future issue", { issuedAt: now + 1 }],
    ["excessive lifetime", { expiresAt: now + 3_600_000 }],
    ["unknown version", { schemaVersion: 2 }], ["non-disposable", { disposable: false }],
    ["not ephemeral", { environment: "production" }], ["unknown field", { fallbackDatabase: "production" }],
  ])("rejects even correctly signed invalid descriptor: %s", (_name, patch) => {
    rejectionCase(env(), envelope({ ...descriptor(), ...patch }), "ATTESTATION_REJECTED");
  });
  it("DB-N05 rejects duplicate JSON properties despite a trusted signature", () => {
    const payload = JSON.stringify(descriptor()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
    rejectionCase(env(), { keyId: "review-key", payload, signature: sign(null, Buffer.from(SIGNATURE_DOMAIN + payload), pair.privateKey).toString("base64") }, "ATTESTATION_REJECTED");
  });
  it.each(["TEST_DATABASE_RUN_ID", "TEST_DATABASE_COMMIT_SHA"])("DB-N16 binds %s to the signed run", (key) => {
    rejectionCase({ ...env(), [key]: key.endsWith("SHA") ? "b".repeat(40) : "other-run" }, envelope(), "RUN_OR_SCOPE_REJECTED");
  });
  it("DB-P01 accepts a signed local target without creating a driver", () => {
    const factory = vi.fn();
    const target = authorizeTestTarget(env(), envelope(), policy());
    expect(target).toEqual({ runId: "review-run", commitSha: sha });
    expect(capturedTestTarget(target).options).toMatchObject({ host: "127.0.0.1", port: 55432, database: "review_test", user: "review_role", ssl: false });
    expect(factory).not.toHaveBeenCalled();
  });
  it("accepts authenticated TLS settings only from the trusted signed descriptor", () => {
    const d = descriptor();
    d.transport.host = "192.0.2.10";
    d.tls = { mode: "verify-full", ca: "-----BEGIN CERTIFICATE-----\nsynthetic-fixture-not-a-real-certificate\n-----END CERTIFICATE-----" };
    const target = authorizeTestTarget({ ...env(), TEST_DATABASE_URL: url("192.0.2.10") }, envelope(d), policy());
    expect(capturedTestTarget(target).options.ssl).toEqual({ rejectUnauthorized: true, ca: d.tls.ca });
    // No TLS handshake, network or DB was attempted; certificate validity is deliberately not asserted.
  });
  it("DB-N11 rejects forged opaque tokens even when their public fields match", () => {
    expect(() => capturedTestTarget({ runId: "review-run", commitSha: sha } as AuthorizedTestTarget)).toThrow("SESSION_NOT_VERIFIED");
  });
  it("DB-N10 captures configuration independently of subsequent environment changes", () => {
    const environment = env(), d = descriptor();
    const target = authorizeTestTarget(environment, envelope(d), policy());
    environment.TEST_DATABASE_URL = url("127.0.0.2");
    d.transport.database = "production";
    expect(capturedTestTarget(target).options.database).toBe("review_test");
    expect(capturedTestTarget(target).options.host).toBe("127.0.0.1");
    expect(testTargetFingerprint(target)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("DB-N11 blocks substitution of options, descriptor AND clock through the internal accessor", () => {
    const target = authorizeTestTarget(env(), envelope(), policy());
    const captured = capturedTestTarget(target);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Reflect.set(captured, "options", { ...captured.options, database: "production" })).toBe(false);
    expect(Reflect.set(captured, "descriptor", descriptor())).toBe(false);
    expect(Reflect.set(captured, "now", () => now - 100)).toBe(false);
    expect(Reflect.set(captured.options, "database", "production")).toBe(false);
    expect(Reflect.set(captured.descriptor.identity, "markerId", "wrong-marker")).toBe(false);
  });
  it("DB-N11 rechecks expiration whenever the capability is dereferenced", () => {
    let clock = now;
    const target = authorizeTestTarget(env(), envelope(), policy(() => clock));
    expect(capturedTestTarget(target)).toBeDefined();
    clock = now + 1000;
    expect(() => capturedTestTarget(target)).toThrow("ATTESTATION_REJECTED");
  });
  it("never includes the secret in parsing failure messages", () => {
    expect(() => parseTestTarget(url() + "?password=" + sentinel)).toThrow("TARGET_PARSE_REJECTED");
    try { parseTestTarget(url() + "?password=" + sentinel); } catch (error) {
      expect(String(error)).not.toContain(sentinel);
      expect(String(error)).not.toContain("postgresql:");
    }
  });
});

// This dependency imports pg TYPES only; all transport operations below are in-memory.
import { createGuardedTestPool, IDENTITY_SQL, resetTestDatabase } from "./guarded-test-pool.js";
function transportFixture(patch: Record<string, unknown> = {}) {
  let identity: Record<string, unknown> = {
    database: "review_test", role: "review_role", session_role: "review_role",
    server_address: "172.18.0.2", server_port: 5432, backend_pid: 42001, server_version: "160003", postgis_version: "3.4.2",
    superuser: false, create_db: false, create_role: false, replication: false, bypass_rls: false,
    marker: { runId: "review-run", markerId: "review-marker", schemaVersion: 1, expiresAt: now + 1000 }, ...patch,
  };
  const mutations = vi.fn();
  const query = vi.fn(async (...args: unknown[]) => {
    if (args[0] === IDENTITY_SQL) return { rows: [identity] };
    mutations(...args); return { rows: [] };
  });
  const release = vi.fn();
  const transport = { connect: vi.fn(async () => ({ query, release })), end: vi.fn(async () => {}) };
  const factory = vi.fn(() => transport);
  const target = authorizeTestTarget(env(), envelope(), policy());
  return { identity, setIdentity: (row: Record<string, unknown>) => { identity = row; }, mutations, query, release, transport, factory, pool: createGuardedTestPool(target, factory) };
}
describe("A5 guarded transport adversarial review, no driver or DB", () => {
  it.each([
    ["database", "production"], ["role", "postgres"], ["session_role", "postgres"],
    ["server_address", "192.0.2.2"], ["server_port", 5433], ["server_version", "170000"], ["postgis_version", "3.5.0"],
  ])("DB-N07 refuses server identity substitution %s", async (key, value) => {
    const f = transportFixture({ [key]: value });
    await expect(f.pool.query("DELETE FROM public.users")).rejects.toThrow("IDENTITY_MISMATCH");
    expect(f.transport.connect).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledTimes(1); expect(f.query).toHaveBeenCalledWith(IDENTITY_SQL);
    expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
  it.each(["superuser", "create_db", "create_role", "replication", "bypass_rls"])("DB-N08 refuses role privilege %s", async (key) => {
    const f = transportFixture({ [key]: true });
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("DISPOSABLE_ATTESTATION_FAILED");
    expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
  it.each([
    null,
    { runId: "other-run", markerId: "review-marker", schemaVersion: 1, expiresAt: now + 1000 },
    { runId: "review-run", markerId: "wrong-marker", schemaVersion: 1, expiresAt: now + 1000 },
    { runId: "review-run", markerId: "review-marker", schemaVersion: 2, expiresAt: now + 1000 },
    { runId: "review-run", markerId: "review-marker", schemaVersion: 1, expiresAt: now + 999 },
  ])("DB-N08 refuses missing or divergent marker %#", async (marker) => {
    const f = transportFixture({ marker });
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("DISPOSABLE_ATTESTATION_FAILED");
    expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
  it("DB-N09/15 expurgates identity-read errors and never mutates", async () => {
    const f = transportFixture(); f.query.mockRejectedValueOnce(new Error(sentinel));
    const error: unknown = await f.pool.query("DELETE FROM public.users").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TestDatabaseRefusal); expect(String(error)).toContain("IDENTITY_UNAVAILABLE");
    expect(String(error)).not.toContain(sentinel); expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
  it("DB-N09 expurgates connection errors before any SQL", async () => {
    const f = transportFixture(); f.transport.connect.mockRejectedValueOnce(new Error(sentinel));
    const error: unknown = await f.pool.query("DELETE FROM public.users").catch((e: unknown) => e);
    expect(String(error)).toContain("IDENTITY_UNAVAILABLE"); expect(String(error)).not.toContain(sentinel);
    expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it.each([[], ["users", "users"], ["pg_authid"], ["users; DROP DATABASE production"], ["fadi_test_meta.provisioning"]].map((tables) => ({ tables })))("DB-N16 rejects reset scope %# BEFORE connecting", async ({ tables }) => {
    const f = transportFixture();
    await expect(resetTestDatabase(f.pool, tables)).rejects.toThrow("RUN_OR_SCOPE_REJECTED");
    expect(f.transport.connect).not.toHaveBeenCalled(); expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N12 refuses a forged raw pool for reset", async () => {
    const f = transportFixture();
    await expect(resetTestDatabase(f.transport as unknown as typeof f.pool, ["users"])).rejects.toThrow("SESSION_NOT_VERIFIED");
    expect(f.transport.connect).not.toHaveBeenCalled(); expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-P02 resets one allowlisted lot on the SAME attested in-memory connection", async () => {
    const f = transportFixture(); await resetTestDatabase(f.pool, ["users", "projects"]);
    expect(f.transport.connect).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenNthCalledWith(1, IDENTITY_SQL); expect(f.query).toHaveBeenNthCalledWith(2, IDENTITY_SQL);
    expect(f.mutations).toHaveBeenCalledTimes(1); expect(f.mutations).toHaveBeenCalledWith('TRUNCATE "public"."users", "public"."projects" CASCADE');
    expect(f.release).toHaveBeenCalledWith(true);
    // A spy recorded a string; there is no SQL engine or real pg driver in this test.
  });
  it("DB-N11 rechecks identity on the SAME connection before the later operation", async () => {
    const f = transportFixture(); const client = await f.pool.connect();
    f.setIdentity({ ...f.identity, database: "production" });
    await expect(client.query("DELETE FROM public.users")).rejects.toThrow("IDENTITY_MISMATCH");
    expect(f.transport.connect).toHaveBeenCalledTimes(1); expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
  it("DB-N11 attests reconnection rather than caching old successful identity", async () => {
    const f = transportFixture(); const client = await f.pool.connect(); client.release();
    f.setIdentity({ ...f.identity, server_address: "192.0.2.2" });
    await expect(f.pool.query("DELETE FROM public.users")).rejects.toThrow("IDENTITY_MISMATCH");
    expect(f.transport.connect).toHaveBeenCalledTimes(2); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N11 refuses a released facade before any later SQL", async () => {
    const f = transportFixture(); const client = await f.pool.connect(); client.release();
    await expect(client.query("DELETE FROM public.users")).rejects.toThrow("SESSION_NOT_VERIFIED");
    expect(f.mutations).not.toHaveBeenCalled();
  });
  it("blocks direct TRUNCATE query-config reset bypass", async () => {
    const f = transportFixture(); const client = await f.pool.connect();
    await expect(client.query({ text: "TRUNCATE public.users CASCADE" })).rejects.toThrow("RUN_OR_SCOPE_REJECTED");
    expect(f.mutations).not.toHaveBeenCalled(); client.release();
  });
  it("expurgates errors from transport factory construction", () => {
    const target = authorizeTestTarget(env(), envelope(), policy()); const factory = vi.fn(() => { throw new Error(sentinel); });
    let error: unknown; try { createGuardedTestPool(target, factory); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(TestDatabaseRefusal); expect(String(error)).not.toContain(sentinel); expect(factory).toHaveBeenCalledTimes(1);
  });
  it("never executes SQL after release during pending attestation (deterministic barrier)", async () => {
    const f = transportFixture(); const client = await f.pool.connect();
    let resume!: (value: { rows: Record<string, unknown>[] }) => void;
    f.query.mockImplementationOnce(async () => new Promise((resolve) => { resume = resolve; }));
    const pending = client.query("DELETE FROM public.users");
    expect(resume).toBeTypeOf("function"); client.release(); resume({ rows: [f.identity] });
    await expect(pending).rejects.toThrow("SESSION_NOT_VERIFIED"); expect(f.mutations).not.toHaveBeenCalled();
  });
});

describe("A5 deterministic TOCTOU barriers", () => {
  it("keeps reset table names captured before asynchronous identity checks", async () => {
    const f = transportFixture();
    let resume!: (value: { rows: Record<string, unknown>[] }) => void;
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => { markReady = resolve; });
    f.query.mockImplementationOnce(async () => new Promise((resolve) => { resume = resolve; markReady(); }));
    const tables = ["users"];
    const pending = resetTestDatabase(f.pool, tables);
    // Explicit barrier, never a timeout: checkout has reached its first attestation.
    await ready;
    expect(resume).toBeTypeOf("function"); tables[0] = "pg_authid"; tables.push("fadi_test_meta.provisioning");
    resume({ rows: [f.identity] }); await pending;
    expect(f.mutations).toHaveBeenCalledTimes(1);
    expect(f.mutations).toHaveBeenCalledWith('TRUNCATE "public"."users" CASCADE');
  });
  it("captures QueryConfig.text before yielding, preventing a post-check TRUNCATE bypass", async () => {
    const f = transportFixture(); const client = await f.pool.connect();
    let resume!: (value: { rows: Record<string, unknown>[] }) => void;
    f.query.mockImplementationOnce(async () => new Promise((resolve) => { resume = resolve; }));
    const config = { text: "SELECT 1" };
    const pending = client.query(config);
    expect(resume).toBeTypeOf("function"); config.text = "TRUNCATE public.users CASCADE";
    resume({ rows: [f.identity] }); await pending;
    expect(f.mutations).toHaveBeenCalledTimes(1);
    expect(f.mutations).toHaveBeenCalledWith({ text: "SELECT 1" }); client.release();
  });
  it("refuses backend PID substitution on the same raw client, with zero mutation", async () => {
    const f = transportFixture(); const client = await f.pool.connect();
    f.setIdentity({ ...f.identity, backend_pid: 42002 });
    await expect(client.query("DELETE FROM public.users")).rejects.toThrow("SESSION_NOT_VERIFIED");
    expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
});

describe("A5 pool lifetime capability", () => {
  it("invalidates an already checked-out facade when its owning pool ends", async () => {
    const f = transportFixture(); const client = await f.pool.connect(); await f.pool.end();
    await expect(client.query("DELETE FROM public.users")).rejects.toThrow("SESSION_NOT_VERIFIED");
    expect(f.mutations).not.toHaveBeenCalled(); client.release();
  });
  it("does not submit caller SQL if pool.end occurs during attestation", async () => {
    const f = transportFixture(); const client = await f.pool.connect();
    let resume!: (value: { rows: Record<string, unknown>[] }) => void;
    f.query.mockImplementationOnce(async () => new Promise((resolve) => { resume = resolve; }));
    const pending = client.query("DELETE FROM public.users");
    expect(resume).toBeTypeOf("function"); await f.pool.end(); resume({ rows: [f.identity] });
    await expect(pending).rejects.toThrow("SESSION_NOT_VERIFIED"); expect(f.mutations).not.toHaveBeenCalled();
    client.release();
  });
});

// Real ORM code, but its pg module is a hoisted sentinel double: a driver can never be created.
const realDriverSentinel = vi.hoisted(() => ({ constructed: vi.fn() }));
vi.mock("pg", () => {
  class Pool {
    constructor() { realDriverSentinel.constructed(); throw new Error("Real driver construction forbidden in pure review"); }
  }
  const types = { getTypeParser: () => (value: unknown) => value };
  return { default: { Pool, types }, Pool, types };
});
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { pgTable, integer } from "drizzle-orm/pg-core";
function submittedSql(f: ReturnType<typeof transportFixture>) {
  return f.mutations.mock.calls.map((call) => typeof call[0] === "string" ? call[0] : (call[0] as { text: string }).text);
}
describe("real Drizzle transaction orchestration over a sentinel-only pg module", () => {
  it("checks out ONE guarded connection and keeps BEGIN/body/COMMIT there", async () => {
    const f = transportFixture(); const db = drizzle(f.pool);
    const result = await db.transaction(async (tx) => { await tx.execute(sql`SELECT 42`); return "simulated-ok"; });
    expect(result).toBe("simulated-ok"); expect(f.transport.connect).toHaveBeenCalledTimes(1);
    expect(submittedSql(f)).toEqual(["begin", "SELECT 42", "commit"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(realDriverSentinel.constructed).not.toHaveBeenCalled();
  });
  it("keeps simulated ROLLBACK on the same connection after an application error", async () => {
    const f = transportFixture(); const db = drizzle(f.pool);
    await expect(db.transaction(async (tx) => { await tx.execute(sql`SELECT 42`); throw new Error("synthetic-business-refusal"); })).rejects.toThrow("synthetic-business-refusal");
    expect(f.transport.connect).toHaveBeenCalledTimes(1);
    expect(submittedSql(f)).toEqual(["begin", "SELECT 42", "rollback"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(realDriverSentinel.constructed).not.toHaveBeenCalled();
  });
});

describe("real Drizzle array rowMode over the same simulated transport", () => {
  it("preserves parameterized QueryConfig rowMode=array inside one transaction", async () => {
    const f = transportFixture(); const db = drizzle(f.pool);
    const table = pgTable("synthetic_numbers", { value: integer("value") });
    const rows = await db.transaction(async (tx) => tx.select({ value: table.value }).from(table));
    expect(rows).toEqual([]); // The fake transport deliberately returns no application rows.
    expect(f.transport.connect).toHaveBeenCalledTimes(1);
    const select = f.mutations.mock.calls.find((call) => typeof call[0] === "object" && (call[0] as { rowMode?: string }).rowMode === "array");
    expect(select).toBeDefined();
    expect(select?.[0]).toMatchObject({ rowMode: "array" });
    expect(submittedSql(f)).toEqual(["begin", 'select "value" from "synthetic_numbers"', "commit"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(realDriverSentinel.constructed).not.toHaveBeenCalled();
  });
});
