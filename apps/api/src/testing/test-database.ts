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
    // Délais bornés mais réalistes sur un banc partagé : la remise à zéro (TRUNCATE … CASCADE) touche environ
    // 150 tables liées et prenait parfois plus de 3 s sur les machines de la CI (QUERY_FAILED aléatoire, à 3,01 s, dans
    // resetTestDatabase). 15 s laisse de la marge et reste sous le délai d'un essai (testTimeout, 20 s) : une requête
    // bloquée est toujours coupée par le serveur avant que l'essai suivant ne démarre.
    const transport = new Pool({ ...options, max: 10, connectionTimeoutMillis: 10_000, query_timeout: 15_000, statement_timeout: 15_000 });
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
