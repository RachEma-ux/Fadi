import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { controlerMigration } from "./migrations-lint.js";
import { empreinte, indexCree, instructions, lireMigrations } from "./schema-migrations.js";

const dossierMigrations = new URL("./migrations/", import.meta.url);
const initSql = readFileSync(new URL("./init.sql", import.meta.url), "utf8");

/**
 * BD-2 : `init.sql` est la base de départ gelée. Toute évolution du schéma passe par un fichier numéroté de
 * `db/migrations/`. Si ce test échoue, ne pas changer l'empreinte : déplacer la modification dans une migration.
 * (Seul un rebasage délibéré de la base de départ, décidé et documenté, change cette valeur.)
 */
const EMPREINTE_BASE = readFileSync(new URL("./migrations/init.sql.sha256", import.meta.url), "utf8").trim();

describe("BD-2 — migrations versionnées", () => {
  it("init.sql est gelé : son empreinte est celle de migrations/init.sql.sha256", () => {
    expect(empreinte(initSql)).toBe(EMPREINTE_BASE);
  });

  it("init.sql crée la table de suivi et la laisse en lecture seule à l'application", () => {
    expect(initSql).toMatch(/CREATE TABLE IF NOT EXISTS schema_migrations \(/);
    expect(initSql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM fadi_app;");
  });

  it("les fichiers du dépôt respectent la convention et le contrôle de sécurité", () => {
    const fichiers = lireMigrations(dossierMigrations);
    const problemes = fichiers.flatMap((f) => controlerMigration(f.fichier, f.sql));
    expect(problemes).toEqual([]);
    // Seuls des .sql numérotés, le guide et l'empreinte de la base dans le dossier.
    for (const n of readdirSync(dossierMigrations)) expect(n).toMatch(/^(\d{4}_[a-z0-9_]+(\.concurrent)?\.sql|README\.md|init\.sql\.sha256)$/);
  });

  it("lecture d'un dossier : tri par version, mode sans transaction, noms et doublons refusés", () => {
    const d = mkdtempSync(join(tmpdir(), "bd2-"));
    try {
      const url = pathToFileURL(d + "/");
      writeFileSync(join(d, "0002_index.concurrent.sql"), "CREATE INDEX CONCURRENTLY IF NOT EXISTS a_idx ON a (x);\n");
      writeFileSync(join(d, "0001_table.sql"), "CREATE TABLE a (x int);\n");
      const f = lireMigrations(url);
      expect(f.map((x) => [x.version, x.nom, x.sansTransaction])).toEqual([["0001", "table", false], ["0002", "index", true]]);
      writeFileSync(join(d, "0001_autre.sql"), "SELECT 1;\n");
      expect(() => lireMigrations(url)).toThrow(/en double/);
      rmSync(join(d, "0001_autre.sql"));
      writeFileSync(join(d, "0000_base.sql"), "SELECT 1;\n");
      expect(() => lireMigrations(url)).toThrow(/réservée/);
      rmSync(join(d, "0000_base.sql"));
      writeFileSync(join(d, "3_mauvais.sql"), "SELECT 1;\n");
      expect(() => lireMigrations(url)).toThrow(/non conforme/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
    expect(lireMigrations(new URL("file:///chemin/inexistant/"))).toEqual([]);
  });

  it("découpage des instructions sans transaction et repérage de l'index créé", () => {
    const sql = "-- commentaire ; ignoré\nCREATE INDEX CONCURRENTLY IF NOT EXISTS a_idx ON a (x);\nCREATE UNIQUE INDEX CONCURRENTLY b_uq ON b (lower(e));\nANALYZE a;";
    expect(instructions(sql)).toEqual(["CREATE INDEX CONCURRENTLY IF NOT EXISTS a_idx ON a (x)", "CREATE UNIQUE INDEX CONCURRENTLY b_uq ON b (lower(e))", "ANALYZE a"]);
    expect(indexCree("CREATE INDEX CONCURRENTLY IF NOT EXISTS a_idx ON a (x)")).toBe("a_idx");
    expect(indexCree("CREATE UNIQUE INDEX CONCURRENTLY b_uq ON b (e)")).toBe("b_uq");
    expect(indexCree("ANALYZE a")).toBeNull();
  });
});

describe("BD-2.5 — contrôle des migrations (règles de sécurité)", () => {
  const regles = (f: string, sql: string) => controlerMigration(f, sql).map((p) => p.regle);

  it("accepte les formes sûres", () => {
    expect(regles("0001_ok.sql", "SET search_path = public;\nCREATE TABLE t (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);\nCREATE INDEX t_idx ON t (id);\nALTER TABLE projects ADD COLUMN note text;\nALTER TABLE projects ADD CONSTRAINT p_ck CHECK (note <> '') NOT VALID;\nALTER TABLE projects VALIDATE CONSTRAINT p_ck;")).toEqual([]);
    expect(regles("0002_idx.concurrent.sql", "CREATE INDEX CONCURRENTLY IF NOT EXISTS p_idx ON projects (code);\nDROP INDEX CONCURRENTLY IF EXISTS old_idx;\nANALYZE projects;")).toEqual([]);
  });

  it("refuse ce qui bloque ou détruit sur une table existante", () => {
    expect(regles("0001_x.sql", "CREATE INDEX p_idx ON projects (code);")).toEqual(["index-bloquant"]);
    expect(regles("0001_x.sql", "ALTER TABLE projects ADD CONSTRAINT p_fk FOREIGN KEY (owner_id) REFERENCES users (id);")).toEqual(["contrainte-validee"]);
    expect(regles("0001_x.sql", "ALTER TABLE projects ALTER COLUMN code TYPE varchar(10);")).toEqual(["type-colonne"]);
    expect(regles("0001_x.sql", "ALTER TABLE projects ALTER COLUMN code SET NOT NULL;")).toEqual(["not-null"]);
    expect(regles("0001_x.sql", "ALTER TABLE projects ADD COLUMN vu_le timestamptz DEFAULT now();")).toEqual(["defaut-volatil"]);
    expect(regles("0001_x.sql", "ALTER TABLE projects DROP COLUMN code;")).toEqual(["contraction"]);
    expect(regles("0001_x.sql", "DROP TABLE vieille;")).toEqual(["contraction"]);
    expect(regles("0001_x.sql", "TRUNCATE projects;")).toEqual(["destruction"]);
    expect(regles("0001_x.sql", "UPDATE projects SET code = 'x';")).toEqual(["reprise"]);
    expect(regles("0001_x.sql", "BEGIN;\nSELECT 1;\nCOMMIT;")).toEqual(["transaction"]);
    expect(regles("0001_x.sql", "CREATE INDEX CONCURRENTLY p_idx ON projects (code);")).toContain("concurrent");
    expect(regles("0002_x.concurrent.sql", "ALTER TABLE projects ADD COLUMN a text;")).toEqual(["concurrent"]);
  });

  it("un marqueur « -- bd: » documenté lève la règle concernée, et elle seule", () => {
    expect(regles("0001_x.sql", "-- bd: contraction (colonne plus lue depuis la Release 2026.11)\nALTER TABLE projects DROP COLUMN code;")).toEqual([]);
    expect(regles("0001_x.sql", "-- bd: not-null-valide (projects_code_nn validée en 0003)\nALTER TABLE projects ALTER COLUMN code SET NOT NULL;")).toEqual([]);
    expect(regles("0001_x.sql", "-- bd: reprise (lot de 5000 lignes)\nUPDATE projects SET code = 'x' WHERE id IN (SELECT id FROM projects WHERE code IS NULL LIMIT 5000);")).toEqual([]);
  });
});
