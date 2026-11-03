/**
 * BD-2.5 (chantier base-donnees, constat Q13) : garde contre l'injection SQL par interpolation.
 *
 * Les requêtes passent par des paramètres (`$1`, gabarits `sql\`…\`` de Drizzle). L'audit du 2026-11-02 a relu chaque
 * interpolation directe restante (`sql.raw(…)`, `.query(\`…${…}…\`)`, `requete(\`…${…}…\`)`) : toutes portent sur des
 * constantes, des listes blanches ou des noms lus dans le catalogue. Elles sont figées ici, fichier par fichier.
 * Une nouvelle interpolation fait échouer ce test : passer la valeur en paramètre ; si c'est un identifiant, le
 * vérifier contre une liste blanche, puis mettre à jour ce relevé dans la même PR avec la justification en revue.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Relevé accepté (revue de l'audit, 2026-11-02 ; ajouts BD-2 : noms de contraintes et d'index lus dans le catalogue). */
const ACCEPTE: Record<string, number> = {
  // #379 (BD-5) : délai de verrou validé par `delaiVerrou` (motif numérique + unité) avant interpolation.
  "db/appliquer-schema.ts": 1,
  "db/schema-migrations.ts": 1,
  "db/valider-contraintes.ts": 1,
  "lib/fin-participation.ts": 1,
  "lib/geodata/prix/sauvegarde.ts": 1,
  "lib/organizations.ts": 1,
  "lib/project-access-db.ts": 1,
  // BD-9.1 : noms de tables de la liste blanche `TABLES_FICHIERS` (quatre tables de fichiers fixes), jamais une saisie.
  "lib/stockage-objet/reprise.ts": 3,
  "lib/studio-archive.ts": 2,
  "lib/volumes-gc.ts": 1,
  "routes/geodata/admin.ts": 1,
  "routes/geodata/cartes.ts": 2,
  "routes/geodata/consultation.ts": 7,
  "routes/geodata/etudes.ts": 4,
  "routes/geodata/exports.ts": 1,
  "routes/geodata/prix.ts": 4,
  "routes/geodata/territoires.ts": 8,
  "testing/guarded-test-pool.ts": 1,
};

const fichiers = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });

export function interpolations(source: string): number {
  let n = (source.match(/sql\.raw\(/g) ?? []).length;
  for (const m of source.matchAll(/(?:\.query|\brequete(?:<[^>]*>)?)\(\s*`([^`]*)`/g)) if (m[1]!.includes("${")) n++;
  return n;
}

describe("BD-2.5 — interpolations SQL directes", () => {
  it("le relevé du code correspond exactement au relevé accepté", () => {
    const releve: Record<string, number> = {};
    for (const f of fichiers(SRC).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("scenarios"))) {
      const n = interpolations(readFileSync(f, "utf8"));
      if (n) releve[relative(SRC, f).split("\\").join("/")] = n;
    }
    expect(releve).toEqual(ACCEPTE);
  });

  it("le détecteur repère sql.raw et les gabarits interpolés, pas les paramètres", () => {
    expect(interpolations("db.execute(sql.raw(x))")).toBe(1);
    expect(interpolations("await pool.query(`SELECT * FROM t WHERE id = ${id}`)")).toBe(1);
    expect(interpolations("await requete<{ a: 1 }>(`SELECT ${col} FROM t`, [])")).toBe(1);
    expect(interpolations("await pool.query(`SELECT * FROM t WHERE id = $1`, [id])")).toBe(0);
    expect(interpolations("await db.execute(sql`SELECT ${id}`)")).toBe(0);
  });
});
