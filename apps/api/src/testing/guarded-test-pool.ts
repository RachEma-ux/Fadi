import type { Pool, PoolClient } from "pg";
import { capturedTestTarget, refuse, TestDatabaseRefusal, type AuthorizedTestTarget, type TestConnectionOptions } from "./test-target.js";

/** Only SELECTs. Provisioning owns this pre-existing marker; this code never creates it. */
export const IDENTITY_SQL = `SELECT pg_catalog.current_database() AS database, current_user AS role, session_user AS session_role,
  pg_catalog.inet_server_addr()::text AS server_address, pg_catalog.inet_server_port() AS server_port, pg_catalog.pg_backend_pid() AS backend_pid,
  pg_catalog.current_setting('server_version_num') AS server_version, public.postgis_lib_version() AS postgis_version,
  r.rolsuper AS superuser, r.rolcreatedb AS create_db, r.rolcreaterole AS create_role,
  r.rolreplication AS replication, r.rolbypassrls AS bypass_rls,
  (SELECT pg_catalog.jsonb_build_object('runId', run_id, 'markerId', marker_id, 'schemaVersion', schema_version,
    'expiresAt', expires_at_ms) FROM fadi_test_meta.provisioning WHERE singleton = true) AS marker
  FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`;

export interface SimulatedClient {
  query: (...args: unknown[]) => Promise<{ rows: Record<string, unknown>[]; [key: string]: unknown }>;
  release: (destroy?: boolean) => void;
}
export interface TestPoolTransport {
  connect: () => Promise<SimulatedClient>;
  end: () => Promise<void>;
}
export type TestPoolFactory = (options: Readonly<TestConnectionOptions>) => TestPoolTransport;
const resetters = new WeakMap<object, (tables: readonly string[]) => Promise<void>>();

export const RESET_TABLES = Object.freeze([
  "volumes", "atelier_outbox", "atelier_commands", "atelier_site", "atelier_problemes", "atelier_references",
  "atelier_groupes", "atelier_calques", "atelier_definitions", "atelier_relations", "atelier_objets", "atelier_niveaux",
  "parcels", "produced_documents", "project_comments", "project_members", "programme_cases", "programme_repartitions",
  "project_steps", "step_files", "projects", "sessions", "users", "atelier_scripts", "atelier_propositions",
]);
const allowedTables = new Set<string>(RESET_TABLES);
const observedSessions = new WeakMap<SimulatedClient, number>();
function safeFailure(error: unknown, fallback: string): never {
  // Never forward pg errors: they can include credentials, SQL, connection configuration or client data.
  throw error instanceof TestDatabaseRefusal ? error : new TestDatabaseRefusal(fallback);
}
function destroy(client: SimulatedClient): void {
  try { client.release(true); } catch { refuse("SESSION_NOT_VERIFIED"); }
}
async function attest(client: SimulatedClient, target: AuthorizedTestTarget): Promise<void> {
  const { descriptor } = capturedTestTarget(target);
  let rows: Record<string, unknown>[];
  try { ({ rows } = await client.query(IDENTITY_SQL)); } catch { return refuse("IDENTITY_UNAVAILABLE"); }
  capturedTestTarget(target); // A timeout must not carry an expired capability into a mutation.
  const row = rows[0];
  if (rows.length !== 1 || !row || row["database"] !== descriptor.transport.database || row["role"] !== descriptor.transport.role || row["session_role"] !== descriptor.transport.role || row["server_address"] !== descriptor.identity.serverAddress || row["server_port"] !== descriptor.identity.serverPort || row["server_version"] !== descriptor.identity.serverVersion || row["postgis_version"] !== descriptor.identity.postgisVersion) refuse("IDENTITY_MISMATCH");
  const backend = row["backend_pid"];
  if (typeof backend !== "number" || !Number.isSafeInteger(backend) || backend < 1) refuse("IDENTITY_MISMATCH");
  const observed = observedSessions.get(client);
  if (observed !== undefined && observed !== backend) refuse("SESSION_NOT_VERIFIED");
  observedSessions.set(client, backend);
  if (["superuser", "create_db", "create_role", "replication", "bypass_rls"].some((key) => row[key] !== false)) refuse("DISPOSABLE_ATTESTATION_FAILED");
  const marker = row["marker"] as Record<string, unknown> | null;
  if (!marker || marker["runId"] !== descriptor.runId || marker["markerId"] !== descriptor.identity.markerId || marker["schemaVersion"] !== 1 || marker["expiresAt"] !== descriptor.expiresAt) refuse("DISPOSABLE_ATTESTATION_FAILED");
}
function sqlText(args: unknown[]): string {
  const query = args[0];
  if (typeof query === "string") return query;
  if (query && typeof query === "object" && typeof (query as { text?: unknown }).text === "string") return (query as { text: string }).text;
  return refuse("RUN_OR_SCOPE_REJECTED");
}

/** Composition intentionally hides raw transport/client/options. Drizzle detects *Pool for transactions. */
class GuardedTestPool {
  readonly #target: AuthorizedTestTarget;
  readonly #transport: TestPoolTransport;
  #ended = false;
  constructor(target: AuthorizedTestTarget, factory: TestPoolFactory) {
    this.#target = target;
    try { this.#transport = factory(capturedTestTarget(target).options); }
    catch (error) { safeFailure(error, "IDENTITY_UNAVAILABLE"); }
    resetters.set(this, async (tables) => {
      const capturedTables = Object.freeze([...tables]);
      if (!capturedTables.length || new Set(capturedTables).size !== capturedTables.length || capturedTables.some((table) => !allowedTables.has(table))) refuse("RUN_OR_SCOPE_REJECTED");
      const client = await this.#checkout();
      try {
        await attest(client, target);
        if (this.#ended) refuse("SESSION_NOT_VERIFIED");
        // Names come exclusively from the closed set, qualified to avoid search_path surprises.
        await client.query(`TRUNCATE ${capturedTables.map((name) => `"public"."${name}"`).join(", ")} CASCADE`);
      } catch (error) { safeFailure(error, "QUERY_FAILED"); }
      finally { destroy(client); }
    });
    Object.freeze(this);
  }
  async #checkout(): Promise<SimulatedClient> {
    if (this.#ended) refuse("SESSION_NOT_VERIFIED");
    capturedTestTarget(this.#target);
    let client: SimulatedClient;
    try { client = await this.#transport.connect(); } catch (error) { return safeFailure(error, "IDENTITY_UNAVAILABLE"); }
    try {
      await attest(client, this.#target);
      if (this.#ended) refuse("SESSION_NOT_VERIFIED");
      return client;
    }
    catch (error) { destroy(client); return safeFailure(error, "IDENTITY_UNAVAILABLE"); }
  }
  async connect(): Promise<PoolClient> {
    const raw = await this.#checkout();
    let released = false;
    let busy = false;
    const target = this.#target;
    const client = Object.freeze({
      query: async (...args: unknown[]) => {
        if (released || busy || this.#ended) refuse("SESSION_NOT_VERIFIED");
        const capturedArgs = args.map((arg, index) => index === 0 && arg && typeof arg === "object" ? Object.freeze({ ...arg }) : Array.isArray(arg) ? [...arg] : arg);
        if (capturedArgs.some((arg) => typeof arg === "function") || /\bTRUNCATE\b/i.test(sqlText(capturedArgs))) refuse("RUN_OR_SCOPE_REJECTED");
        busy = true;
        try {
          await attest(raw, target); // same connection, rechecked for every operation and expiry.
          if (released || this.#ended) refuse("SESSION_NOT_VERIFIED");
          return await raw.query(...capturedArgs);
        } catch (error) {
          if (!released) { released = true; destroy(raw); }
          return safeFailure(error, "QUERY_FAILED");
        } finally { busy = false; }
      },
      release: () => { if (!released) { released = true; destroy(raw); } },
    });
    return client as unknown as PoolClient;
  }
  async query(...args: unknown[]): Promise<unknown> {
    const client = await this.connect();
    try { return await (client.query as (...parameters: unknown[]) => Promise<unknown>)(...args); }
    finally { client.release(); }
  }
  async end(): Promise<void> {
    this.#ended = true;
    try { await this.#transport.end(); } catch { refuse("SESSION_NOT_VERIFIED"); }
  }
}
export function createGuardedTestPool(target: AuthorizedTestTarget, factory: TestPoolFactory): Pool {
  return new GuardedTestPool(target, factory) as unknown as Pool;
}
/** A raw pg pool, forged object or imported helper cannot provide a reset capability. */
export async function resetTestDatabase(pool: Pool, tables: readonly string[]): Promise<void> {
  const reset = resetters.get(pool);
  if (!reset) refuse("SESSION_NOT_VERIFIED");
  await reset(tables);
}
