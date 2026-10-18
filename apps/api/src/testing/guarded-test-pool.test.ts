import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizeTestTarget, SIGNATURE_DOMAIN, type TestTargetDescriptor } from "./test-target.js";
import { createGuardedTestPool, IDENTITY_SQL, resetTestDatabase, type SimulatedClient } from "./guarded-test-pool.js";

const keys = generateKeyPairSync("ed25519");
const pem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
function fixture() {
  let now = 1_900_000_000_000;
  const descriptor: TestTargetDescriptor = {
    schemaVersion: 1, environment: "ephemeral", disposable: true, runId: "unit-run", commitSha: "a".repeat(40),
    issuedAt: now - 1000, expiresAt: now + 60_000,
    transport: { host: "127.0.0.1", port: 55432, database: "unit_test", role: "unit_role" },
    tls: { mode: "disable", ca: "" },
    identity: { serverAddress: "172.18.0.2", serverPort: 5432, serverVersion: "160003", postgisVersion: "3.4.2", markerId: "unit-marker" },
  };
  const payload = JSON.stringify(descriptor);
  const envelope = { keyId: "unit", payload, signature: sign(null, Buffer.from(SIGNATURE_DOMAIN + payload), keys.privateKey).toString("base64") };
  const target = authorizeTestTarget({ TEST_DATABASE_URL: "postgresql://unit_role:synthetic-not-real@127.0.0.1:55432/unit_test", TEST_DATABASE_RUN_ID: descriptor.runId, TEST_DATABASE_COMMIT_SHA: descriptor.commitSha }, envelope, { authorities: { unit: pem }, now: () => now });
  const identity: Record<string, unknown> = {
    database: "unit_test", role: "unit_role", session_role: "unit_role", server_address: "172.18.0.2", server_port: 5432,
    server_version: "160003", postgis_version: "3.4.2", backend_pid: 1234, superuser: false, create_db: false, create_role: false, replication: false, bypass_rls: false,
    marker: { runId: descriptor.runId, markerId: descriptor.identity.markerId, schemaVersion: 1, expiresAt: descriptor.expiresAt },
  };
  const mutations = vi.fn();
  const read = vi.fn(async () => ({ rows: [identity] }));
  const query = vi.fn(async (...args: unknown[]) => {
    if (args[0] === IDENTITY_SQL) return read();
    mutations(...args);
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const client: SimulatedClient = { query, release };
  const connect = vi.fn(async () => client), end = vi.fn(async () => undefined);
  const factory = vi.fn(() => ({ connect, end }));
  const pool = createGuardedTestPool(target, factory);
  return { target, identity, read, mutations, query, release, connect, end, factory, pool, descriptor, setClock: (value: number) => { now = value; } };
}
describe("verified test pool (all SQL is a simulated function call)", () => {
  it("DB-P01 creates no connection or SQL before an operation is requested", () => {
    const f = fixture();
    expect(f.factory).toHaveBeenCalledOnce(); expect(f.connect).not.toHaveBeenCalled(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-P02 performs one qualified allowlisted simulated reset only after same-client verification", async () => {
    const f = fixture();
    await resetTestDatabase(f.pool, ["projects", "sessions", "users"]);
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.mutations).toHaveBeenCalledExactlyOnceWith('TRUNCATE "public"."projects", "public"."sessions", "public"."users" CASCADE');
    expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it.each(["database", "role", "session_role", "server_address", "server_port", "server_version", "postgis_version"])("DB-N07 refuses changed identity %s before any mutation", async (key) => {
    const f = fixture(); f.identity[key] = "wrong";
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("IDENTITY_MISMATCH");
    expect(f.mutations).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledWith(true);
  });
  it.each(["superuser", "create_db", "create_role", "replication", "bypass_rls"])("DB-N08 refuses privileged role %s", async (key) => {
    const f = fixture(); f.identity[key] = true;
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("DISPOSABLE_ATTESTATION_FAILED");
    expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N08 refuses missing provisioning marker", async () => {
    const f = fixture(); f.identity["marker"] = null;
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("DISPOSABLE_ATTESTATION_FAILED"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N09 sanitizes identity errors and never attempts mutation or retry", async () => {
    const f = fixture(); f.read.mockRejectedValue(new Error("postgresql://secret:synthetic-not-real@production/real"));
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow(/^Test database refused: IDENTITY_UNAVAILABLE$/);
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N11 reattests every checkout: an altered reconnected target cannot reset", async () => {
    const f = fixture(); const client = await f.pool.connect(); client.release();
    f.identity["database"] = "unknown";
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("IDENTITY_MISMATCH"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N11 rechecks a checked-out session before each simulated query", async () => {
    const f = fixture(); const client = await f.pool.connect();
    f.identity["role"] = "another_role";
    await expect(client.query("DELETE FROM users")).rejects.toThrow("IDENTITY_MISMATCH"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N11 refuses expired capability before reconnecting", async () => {
    const f = fixture(); f.setClock(f.descriptor.expiresAt);
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("ATTESTATION_REJECTED"); expect(f.connect).not.toHaveBeenCalled(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N11 expiry during identity SELECT cannot carry authority into reset", async () => {
    const f = fixture(); f.read.mockImplementation(async () => { f.setClock(f.descriptor.expiresAt); return { rows: [f.identity] }; });
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("ATTESTATION_REJECTED"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N12 rejects a helper imported with a raw/forged pool", async () => {
    const f = fixture(); await expect(resetTestDatabase({ query: f.query } as unknown as typeof f.pool, ["users"])).rejects.toThrow("SESSION_NOT_VERIFIED"); expect(f.query).not.toHaveBeenCalled();
  });
  it("DB-N12 prevents direct reset SQL bypassing the helper", async () => {
    const f = fixture(); await expect(f.pool.query("TRUNCATE users CASCADE")).rejects.toThrow("RUN_OR_SCOPE_REJECTED"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it.each([[], ["users", "users"], ["users; DROP DATABASE real"], ["unknown"]])("DB-N16 rejects empty/duplicate/unknown reset scope %j", async (...args) => {
    const f = fixture(); const tables = args as unknown as string[];
    await expect(resetTestDatabase(f.pool, tables)).rejects.toThrow("RUN_OR_SCOPE_REJECTED"); expect(f.connect).not.toHaveBeenCalled(); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("DB-N16 refuses marker belonging to another concurrent run", async () => {
    const f = fixture(); (f.identity["marker"] as Record<string, unknown>)["runId"] = "other-run";
    await expect(resetTestDatabase(f.pool, ["users"])).rejects.toThrow("DISPOSABLE_ATTESTATION_FAILED"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("never exposes the raw client or connection options", async () => {
    const f = fixture(); const client = await f.pool.connect();
    expect(Object.keys(f.pool)).toEqual([]); expect(Object.keys(client).sort()).toEqual(["query", "release"]);
    expect(client).not.toHaveProperty("connectionParameters"); expect(f.pool).not.toHaveProperty("options"); client.release();
    await expect(client.query("DELETE FROM users")).rejects.toThrow("SESSION_NOT_VERIFIED"); expect(f.mutations).not.toHaveBeenCalled();
  });
  it("retains normal simulated query results and invalidates a closed pool", async () => {
    const f = fixture(); expect(await f.pool.query("SELECT 1")).toMatchObject({ rowCount: 1 });
    await f.pool.end(); await expect(f.pool.connect()).rejects.toThrow("SESSION_NOT_VERIFIED"); expect(f.end).toHaveBeenCalledOnce();
  });
});
