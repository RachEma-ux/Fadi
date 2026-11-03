import { describe, expect, it } from "vitest";
import { optionsPool } from "./pool-options.js";
import { delaiVerrou } from "./appliquer-schema.js";

describe("réglages des connexions à la base (BD-1)", () => {
  it("délais et taille par défaut : aucune requête ni transaction sans limite", () => {
    const o = optionsPool("postgres://h/db", {});
    expect(o).toMatchObject({
      application_name: "fadi-api", max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000,
      statement_timeout: 120_000, idle_in_transaction_session_timeout: 120_000,
    });
  });

  it("valeurs de l'environnement ; 0 désactive un délai ; valeur invalide → défaut ; au moins une connexion", () => {
    const o = optionsPool("postgres://h/db", { DB_POOL_MAX: "20", DB_STATEMENT_TIMEOUT_MS: "0", DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "abc", DB_APPLICATION_NAME: "fadi-outil" });
    expect(o.max).toBe(20);
    expect(o.statement_timeout).toBe(0);
    expect(o.idle_in_transaction_session_timeout).toBe(120_000);
    expect(o.application_name).toBe("fadi-outil");
    expect(optionsPool("postgres://h/db", { DB_POOL_MAX: "0" }).max).toBe(1);
    expect(optionsPool("postgres://h/db", { DB_POOL_MAX: "-3" }).max).toBe(10);
  });

  it("délai de verrou de la migration (BD-5) : forme PostgreSQL seulement, rien d'autre n'entre dans l'instruction SET", () => {
    expect(delaiVerrou(undefined)).toBe("5s");
    expect(delaiVerrou("500ms")).toBe("500ms");
    expect(delaiVerrou(" 2min ")).toBe("2min");
    expect(delaiVerrou("10")).toBe("10");
    expect(delaiVerrou("5s'; DROP TABLE users; --")).toBe("5s");
  });
});
