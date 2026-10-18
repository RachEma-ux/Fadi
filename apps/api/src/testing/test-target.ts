import { createHash, createPublicKey, verify } from "node:crypto";
import { isIP } from "node:net";

/** This module is pure: no pg import, file access, socket or SQL. */
export class TestDatabaseRefusal extends Error {
  constructor(public readonly code: string) {
    super(`Test database refused: ${code}`);
    this.name = "TestDatabaseRefusal";
  }
}
export function refuse(code: string): never { throw new TestDatabaseRefusal(code); }
export const SIGNATURE_DOMAIN = "FADI-TEST-DATABASE/v1\0";

export interface TestTargetDescriptor {
  schemaVersion: 1;
  environment: "ephemeral";
  disposable: true;
  runId: string;
  commitSha: string;
  issuedAt: number;
  expiresAt: number;
  transport: { host: string; port: number; database: string; role: string };
  tls: { mode: "disable" | "verify-full"; ca: string };
  identity: { serverAddress: string; serverPort: number; serverVersion: string; postgisVersion: string; markerId: string };
}
export interface SignedTestTarget { keyId: string; payload: string; signature: string }
export interface TestTargetPolicy {
  /** Injected only by pure tests; runtime uses the fixed, reviewed repository registry. */
  authorities: Readonly<Record<string, string>>;
  now: () => number;
}
export interface AuthorizedTestTarget { readonly runId: string; readonly commitSha: string }
export interface TestConnectionOptions {
  host: string; port: number; database: string; user: string; password: string;
  ssl: false | { rejectUnauthorized: true; ca: string };
}
interface CapturedTarget { readonly descriptor: TestTargetDescriptor; readonly options: TestConnectionOptions; readonly now: () => number }
const authorized = new WeakMap<AuthorizedTestTarget, CapturedTarget>();
const safeId = /^[a-zA-Z0-9_-]{1,100}$/;
const dbId = /^[a-z][a-z0-9_]{0,62}$/;
const ip = (value: string) => value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
const loopback = (host: string) => host === "127.0.0.1" || host === "::1";
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse("ATTESTATION_REJECTED");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("|") !== [...keys].sort().join("|")) refuse("ATTESTATION_REJECTED");
  if (Object.values(Object.getOwnPropertyDescriptors(record)).some((property) => property.get || property.set)) refuse("ATTESTATION_REJECTED");
  return record;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) refuse("ATTESTATION_REJECTED");
  return value;
}
function port(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 65535) refuse("ATTESTATION_REJECTED");
  return value as number;
}
function parseDescriptor(payload: string): TestTargetDescriptor {
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { refuse("ATTESTATION_REJECTED"); }
  // One canonical JSON representation: rejects duplicate keys, alternate encodings and trailing bytes.
  if (JSON.stringify(parsed) !== payload) refuse("ATTESTATION_REJECTED");
  const root = object(parsed, ["schemaVersion", "environment", "disposable", "runId", "commitSha", "issuedAt", "expiresAt", "transport", "tls", "identity"]);
  if (root["schemaVersion"] !== 1 || root["environment"] !== "ephemeral" || root["disposable"] !== true) refuse("ATTESTATION_REJECTED");
  text(root["runId"], safeId); text(root["commitSha"], /^[a-f0-9]{40}$/);
  if (!Number.isSafeInteger(root["issuedAt"]) || !Number.isSafeInteger(root["expiresAt"])) refuse("ATTESTATION_REJECTED");
  const transport = object(root["transport"], ["host", "port", "database", "role"]);
  if (typeof transport["host"] !== "string" || !isIP(transport["host"])) refuse("ATTESTATION_REJECTED");
  port(transport["port"]); text(transport["database"], dbId); text(transport["role"], dbId);
  const tls = object(root["tls"], ["mode", "ca"]);
  if (tls["mode"] === "disable") {
    if (!loopback(transport["host"]) || tls["ca"] !== "") refuse("ATTESTATION_REJECTED");
  } else if (tls["mode"] !== "verify-full" || typeof tls["ca"] !== "string" || !tls["ca"].includes("-----BEGIN CERTIFICATE-----") || tls["ca"].length > 20_000) {
    refuse("ATTESTATION_REJECTED");
  }
  const identity = object(root["identity"], ["serverAddress", "serverPort", "serverVersion", "postgisVersion", "markerId"]);
  if (typeof identity["serverAddress"] !== "string" || !isIP(identity["serverAddress"])) refuse("ATTESTATION_REJECTED");
  port(identity["serverPort"]); text(identity["serverVersion"], /^\d{6}$/);
  text(identity["postgisVersion"], /^\d+\.\d+\.\d+$/); text(identity["markerId"], safeId);
  return parsed as TestTargetDescriptor;
}
export function parseTestTarget(raw: string): TestConnectionOptions {
  try {
    if (raw.length > 4096 || /[\s\\?#\u0000-\u001f]/.test(raw)) refuse("TARGET_PARSE_REJECTED");
    const url = new URL(raw);
    if (url.protocol !== "postgresql:" || url.search || url.hash || !url.port || !url.username || !url.password) refuse("TARGET_PARSE_REJECTED");
    const host = ip(url.hostname);
    if (!isIP(host)) refuse("TARGET_PARSE_REJECTED");
    const database = decodeURIComponent(url.pathname.slice(1));
    const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
    if (!dbId.test(database) || !dbId.test(user) || !password || /[\u0000-\u001f]/.test(password)) refuse("TARGET_PARSE_REJECTED");
    const parsedPort = Number(url.port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) refuse("TARGET_PARSE_REJECTED");
    return { host, port: parsedPort, database, user, password, ssl: false };
  } catch { return refuse("TARGET_PARSE_REJECTED"); }
}
export function authorizeTestTarget(
  env: Readonly<Record<string, string | undefined>>, envelope: unknown, policy: TestTargetPolicy,
): AuthorizedTestTarget {
  if (!env["TEST_DATABASE_URL"]) refuse("TARGET_REQUIRED");
  // pg must never complete a partially specified target from libpq variables.
  if (Object.entries(env).some(([key, value]) => key.startsWith("PG") && value !== undefined && value !== "")) refuse("TARGET_NOT_ALLOWED");
  const options = parseTestTarget(env["TEST_DATABASE_URL"]);
  const signed = object(envelope, ["keyId", "payload", "signature"]);
  const keyId = text(signed["keyId"], safeId);
  const key = Object.hasOwn(policy.authorities, keyId) ? policy.authorities[keyId] : undefined;
  const payload = signed["payload"], signature = signed["signature"];
  if (!key || typeof payload !== "string" || Buffer.byteLength(payload) > 32_768 || typeof signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) refuse("ATTESTATION_REJECTED");
  try {
    const publicKey = createPublicKey(key);
    if (publicKey.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(SIGNATURE_DOMAIN + payload), publicKey, Buffer.from(signature, "base64"))) refuse("ATTESTATION_REJECTED");
  } catch { refuse("ATTESTATION_REJECTED"); }
  const descriptor = parseDescriptor(payload);
  const now = policy.now();
  if (!Number.isFinite(now) || descriptor.issuedAt > now || descriptor.expiresAt <= now || descriptor.expiresAt <= descriptor.issuedAt || descriptor.expiresAt - descriptor.issuedAt > 3_600_000) refuse("ATTESTATION_REJECTED");
  if (env["TEST_DATABASE_RUN_ID"] !== descriptor.runId || env["TEST_DATABASE_COMMIT_SHA"] !== descriptor.commitSha) refuse("RUN_OR_SCOPE_REJECTED");
  const transport = descriptor.transport;
  if (options.host !== transport.host || options.port !== transport.port || options.database !== transport.database || options.user !== transport.role) refuse("TARGET_NOT_ALLOWED");
  options.ssl = descriptor.tls.mode === "disable" ? false : Object.freeze({ rejectUnauthorized: true, ca: descriptor.tls.ca });
  Object.freeze(options);
  Object.freeze(descriptor.transport); Object.freeze(descriptor.identity); Object.freeze(descriptor.tls); Object.freeze(descriptor);
  const token = Object.freeze({ runId: descriptor.runId, commitSha: descriptor.commitSha });
  let lastTime = now;
  const clock = policy.now;
  const checkedClock = () => {
    const observed = clock();
    if (!Number.isFinite(observed) || observed < lastTime) refuse("ATTESTATION_REJECTED");
    lastTime = observed;
    return observed;
  };
  authorized.set(token, Object.freeze({ options, descriptor, now: checkedClock }));
  return token;
}
/** Internal access is not a capability: only WeakMap-issued tokens resolve. */
export function capturedTestTarget(token: AuthorizedTestTarget): CapturedTarget {
  const result = authorized.get(token);
  if (!result) refuse("SESSION_NOT_VERIFIED");
  const now = result.now();
  if (!Number.isFinite(now) || now < result.descriptor.issuedAt || now >= result.descriptor.expiresAt) refuse("ATTESTATION_REJECTED");
  return result;
}
/** Safe correlation value, never a URL or credential. */
export function testTargetFingerprint(token: AuthorizedTestTarget): string {
  return createHash("sha256").update(JSON.stringify(capturedTestTarget(token).descriptor)).digest("hex");
}
