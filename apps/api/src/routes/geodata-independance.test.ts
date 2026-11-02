/**
 * GEO 04 — audit statique du noyau GeoData (ADR-GEODATA-01, INV-02, INV-03) : aucune référence à un projet dans les
 * routes, la bibliothèque serveur, le paquet pur et le schéma SQL de GeoData ; aucun import d'un module de projet.
 * Les commentaires sont retirés avant l'examen (ils peuvent dire « aucun projet »). Aucune base n'est utilisée.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ICI = dirname(fileURLToPath(import.meta.url));
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : [p]; });
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
/** Mot « projet » / « project » (et projectId, project_id…), pas « projection » ni « projeté ». */
const PROJET = /(?<![\wÀ-ÿ])(projets?|projects?|projectIds?|project_ids?|ProjectShell)(?![\wÀ-ÿ])/i;
const noyau = [...fichiers(join(ICI, "geodata")), ...fichiers(resolve(ICI, "../lib/geodata")), ...fichiers(resolve(ICI, "../../../../packages/geodata-model/src")), resolve(ICI, "../db/geodata-reference.ts"), resolve(ICI, "../db/geodata-role.ts")]
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));

describe("GEO 04 — GeoData ne dépend d'aucun projet", () => {
  it("le noyau existe", () => expect(noyau.length).toBeGreaterThanOrEqual(12));
  it("aucun identifiant, table, route ni contrôle de projet dans le code du noyau", () => {
    for (const f of noyau) expect(sansCommentaires(readFileSync(f, "utf8")), f).not.toMatch(PROJET);
  });
  it("aucun import d'un module de projet, d'organisation, de participation ou du schéma Drizzle des projets", () => {
    for (const f of noyau) {
      const imports = [...readFileSync(f, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const i of imports.filter((x) => x !== "@parcours/geodata-model")) expect(i, `${f} → ${i}`).not.toMatch(/project|organi[sz]ation|participa|members|owned|db\/schema|atelier|studio|parcours/i);
    }
  });
  it("schéma SQL : les tables geodata_* ne référencent que users et d'autres tables geodata_*", () => {
    const sql = readFileSync(resolve(ICI, "../db/init.sql"), "utf8");
    const debut = sql.indexOf("CREATE TABLE IF NOT EXISTS geodata_espaces");
    const fin = sql.indexOf("CREATE OR REPLACE FUNCTION geodata_version_immuable");
    expect(debut).toBeGreaterThan(0);
    const section = sansCommentaires(sql.slice(debut, fin));
    expect(section).not.toMatch(PROJET);
    const cibles = [...section.matchAll(/REFERENCES\s+(\w+)/g)].map((m) => m[1]!);
    expect(cibles.length).toBeGreaterThan(10);
    for (const c of cibles) expect(c).toMatch(/^(users|geodata_\w+)$/);
  });
});
