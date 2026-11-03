/**
 * BD-2.7 (chantier base-donnees, constats S3 / M7) : écart entre `schema.ts` (Drizzle) et la base réellement migrée.
 *
 * Suite sur base (garde DB-3) : après `db:migrate`, chaque table et colonne déclarée dans Drizzle existe avec la même
 * nullité ; les tables présentes seulement en SQL (GeoData en SQL brut, tables techniques) sont figées ici, pour qu'un
 * ajout de ce côté soit délibéré. `schema.ts` ne décrit pas les CHECK ni toutes les clés étrangères et index : il ne
 * doit donc **jamais** servir à `drizzle-kit push` ou `generate` (destructeur), seulement à typer les requêtes.
 */
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { pool } from "./client.js";
import * as schema from "./schema.js";

/** Tables présentes seulement dans le SQL (relevé du 2026-11-02). */
const TABLES_SQL_SEULEMENT = [
  "public.archive_signing_keys", "public.geodata_analyses", "public.geodata_cartes", "public.geodata_categories",
  "public.geodata_categories_sources", "public.geodata_collection_cartes", "public.geodata_collections",
  "public.geodata_concepts", "public.geodata_couches", "public.geodata_decoupage_imports", "public.geodata_douars",
  "public.geodata_entites_administratives", "public.geodata_espaces", "public.geodata_exports", "public.geodata_fichiers",
  "public.geodata_imports", "public.geodata_indicateurs", "public.geodata_journal", "public.geodata_membres",
  "public.geodata_niveaux_administratifs", "public.geodata_objets", "public.geodata_pays",
  "public.geodata_prix_agregats_publies", "public.geodata_prix_biens", "public.geodata_prix_biens_observations",
  "public.geodata_prix_cellules", "public.geodata_prix_decisions_doublons", "public.geodata_prix_decisions_rattachement",
  "public.geodata_prix_editions", "public.geodata_prix_instantanes", "public.geodata_prix_lots",
  "public.geodata_prix_observations", "public.geodata_prix_publications", "public.geodata_prix_quarantaine",
  "public.geodata_prix_rattachements", "public.geodata_prix_sources", "public.geodata_prix_valeurs_officielles",
  "public.geodata_prix_zones", "public.geodata_rasters", "public.geodata_reglages", "public.geodata_roles",
  "public.geodata_sources", "public.geodata_tableaux_bord", "public.geodata_territoires", "public.geodata_valeurs",
  "public.geodata_versions", "public.geodata_zones", "public.schema_migrations",
  // #379 (BD-5) : journal des applications de la base de départ, écrit par la migration seulement.
  "admin.schema_applications",
  // GeoData terrain (TER-02, #383).
  "public.geodata_terrain_evenements", "public.geodata_terrain_fichiers", "public.geodata_terrain_traitements", "public.geodata_terrain_versions",
];

/** Tables de l'ancien moteur de l'Atelier, recréées un instant par le test de la bascule (atelier-commands.test.ts). */
const TRANSITOIRES = ["public.atelier_store", "public.architectural_objects", "public.levels"];

/** Vues déclarées comme tables dans Drizzle (lecture seule) : la nullité d'une colonne de vue n'est pas tenue. */
const VUES = new Set(["public.project_members"]);

describe("BD-2.7 — schema.ts face à la base migrée", () => {
  const tables = Object.values(schema).filter((t) => is(t, PgTable)).map((t) => getTableConfig(t as PgTable));
  const cle = (s: string | undefined, n: string) => `${s ?? "public"}.${n}`;

  it("chaque table et colonne de Drizzle existe en base, avec la même nullité (hors vues)", async () => {
    const { rows } = await pool.query<{ t: string; c: string; nullable: string }>(
      "SELECT table_schema || '.' || table_name AS t, column_name AS c, is_nullable AS nullable FROM information_schema.columns WHERE table_schema IN ('public', 'auth', 'admin')",
    );
    const colonnes = new Map(rows.map((r) => [`${r.t}.${r.c}`, r.nullable === "NO"]));
    const ecarts: string[] = [];
    for (const t of tables) {
      const nomTable = cle(t.schema, t.name);
      for (const col of t.columns) {
        const k = `${nomTable}.${col.name}`;
        if (!colonnes.has(k)) ecarts.push(`${k} : absente en base`);
        else if (!VUES.has(nomTable) && colonnes.get(k) !== col.notNull) ecarts.push(`${k} : Drizzle ${col.notNull ? "NOT NULL" : "nullable"}, base ${colonnes.get(k) ? "NOT NULL" : "nullable"}`);
      }
    }
    expect(ecarts).toEqual([]);
  });

  it("aucune table propre au SQL hors du relevé", async () => {
    const { rows } = await pool.query<{ t: string }>(
      "SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname IN ('public', 'auth', 'admin') AND tablename <> 'spatial_ref_sys'",
    );
    const drizzle = new Set(tables.map((t) => cle(t.schema, t.name)));
    const connues = new Set([...TABLES_SQL_SEULEMENT, ...TRANSITOIRES]);
    expect(rows.map((r) => r.t).filter((t) => !drizzle.has(t) && !connues.has(t)).sort()).toEqual([]);
  });

  it("les vues déclarées comme tables sont bien des vues", async () => {
    for (const v of VUES) {
      const { rows } = await pool.query<{ k: string }>("SELECT relkind AS k FROM pg_class WHERE oid = to_regclass($1)", [v]);
      expect(rows[0]?.k).toBe("v");
    }
  });
});
