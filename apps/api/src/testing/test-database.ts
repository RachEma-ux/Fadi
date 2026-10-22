import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { APPROVED_TEST_AUTHORITIES } from "./approved-test-authorities.js";
import { authorizeTestTarget, refuse } from "./test-target.js";
import { createGuardedTestPool, type TestPoolTransport } from "./guarded-test-pool.js";

export function createRuntimeTestPool(): Pool {
  const env = Object.freeze({ ...process.env });
  if (!env["TEST_DATABASE_URL"]) refuse("TARGET_REQUIRED");
  if (!Object.keys(APPROVED_TEST_AUTHORITIES).length) refuse("ATTESTATION_REJECTED");
  let envelope: unknown;
  try {
    const path = env["TEST_DATABASE_ATTESTATION_FILE"];
    if (!path) refuse("ATTESTATION_REJECTED");
    const bytes = readFileSync(path);
    if (bytes.length > 65_536) refuse("ATTESTATION_REJECTED");
    envelope = JSON.parse(bytes.toString("utf8"));
  } catch { return refuse("ATTESTATION_REJECTED"); }
  const target = authorizeTestTarget(env, envelope, { authorities: APPROVED_TEST_AUTHORITIES, now: Date.now });
  return createGuardedTestPool(target, (options) => {
    const transport = new Pool({ ...options, max: 10, connectionTimeoutMillis: 3000, query_timeout: 3000, statement_timeout: 3000 });
    // Avoid emitting raw driver error objects (which can include SQL/connection details).
    transport.on("error", () => undefined);
    return {
      connect: async () => {
        // pg reads some libpq defaults when a new Client is created, including on reconnect.
        // Reject late environment injection immediately before that synchronous construction.
        if (Object.entries(process.env).some(([key, value]) => key.startsWith("PG") && value !== undefined && value !== "")) refuse("TARGET_NOT_ALLOWED");
        return await transport.connect();
      },
      end: () => transport.end(),
    } as unknown as TestPoolTransport;
  });
}
