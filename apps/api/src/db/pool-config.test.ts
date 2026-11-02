import { describe, expect, it } from "vitest";
import { applicationPoolConfig } from "./pool-config.js";

describe("BD-1.2 — pool de l'API aux délais bornés", () => {
  it("valeurs par défaut : connexion, instruction et transaction inactive bornées, nom d'application", () => {
    expect(applicationPoolConfig("postgresql://x", {})).toEqual({
      connectionString: "postgresql://x", max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000,
      statement_timeout: 60_000, idle_in_transaction_session_timeout: 60_000, application_name: "fadi-api",
    });
  });
  it("chaque réglage se change par variable d'environnement ; 0 = pas de délai (retour arrière)", () => {
    const c = applicationPoolConfig("postgresql://x", { PG_POOL_MAX: "20", PG_STATEMENT_TIMEOUT_MS: "0", PG_APP_NAME: "fadi-api-2" });
    expect(c).toMatchObject({ max: 20, statement_timeout: 0, application_name: "fadi-api-2" });
  });
  it("une valeur invalide arrête le démarrage au lieu d'être ignorée", () => {
    expect(() => applicationPoolConfig("postgresql://x", { PG_POOL_MAX: "dix" })).toThrow(/PG_POOL_MAX/);
    expect(() => applicationPoolConfig("postgresql://x", { PG_CONNECTION_TIMEOUT_MS: "-1" })).toThrow(/PG_CONNECTION_TIMEOUT_MS/);
  });
});
