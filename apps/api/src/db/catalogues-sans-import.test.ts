/**
 * BD-9.6 (D-GD-29, D-BD-6) : les catalogues de données sont lus en base, jamais depuis les fichiers du dépôt.
 * Seule la chaîne de chargement (`db/catalogues-chargement.ts`) nomme les fichiers sources ; tout autre code d'exécution
 * (API, application web, paquets, configuration Vite) qui les importe ou les lit fait échouer ce test. Les commentaires
 * et les tests (qui vérifient les fonctions pures sur la source qualifiée) ne sont pas visés.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SOURCES_CATALOGUES } from "./catalogues-chargement.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const AUTORISES = new Set(["apps/api/src/db/catalogues-chargement.ts"]);
const FICHIERS = Object.values(SOURCES_CATALOGUES).map((s) => s.fichier);

function sources(dossier: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    if (nom === "node_modules" || nom === "dist") continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sources(chemin, out);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(nom) && !/\.test\.(ts|tsx|mjs)$/.test(nom)) out.push(chemin);
  }
  return out;
}

/** Le code sans commentaires (`//`, `/* … *\/`) : une mention dans un commentaire n'est pas un import. */
const sansCommentaires = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("BD-9.6 — aucun code d'exécution n'importe les catalogues de données", () => {
  it("les quatre fichiers sources sont nommés par la seule chaîne de chargement", () => {
    expect(FICHIERS.sort()).toEqual(["building-library.json", "harmonie-profiles.json", "harmony-engine.json", "programme-repartition.json"]);
    const dossiers = [join(RACINE, "apps/api/src"), join(RACINE, "apps/web/src"), join(RACINE, "packages")];
    const configs = readdirSync(join(RACINE, "apps/web")).filter((n) => /^vite.*\.(ts|mjs|js)$/.test(n)).map((n) => join(RACINE, "apps/web", n));
    const fautifs: string[] = [];
    for (const chemin of [...dossiers.flatMap((d) => sources(d)), ...configs]) {
      const rel = relative(RACINE, chemin).replaceAll("\\", "/");
      if (AUTORISES.has(rel)) continue;
      const code = sansCommentaires(readFileSync(chemin, "utf8"));
      // Toute chaîne littérale qui contient le nom du fichier (import, `readFileSync`, `new URL`, `?raw`, alias Vite…).
      for (const f of FICHIERS) if (new RegExp(`["'\`][^"'\`\\n]*${f.replace(/[-.]/g, "\\$&")}`).test(code)) fautifs.push(`${rel} : ${f}`);
    }
    expect(fautifs).toEqual([]);
  });

  it("le module des données du Parcours n'expose plus aucun catalogue", () => {
    const code = readFileSync(join(RACINE, "apps/api/src/data/parcours.ts"), "utf8");
    for (const nom of ["BUILDING_LIBRARY", "HARMONIE_PROFILES", "HARMONY_ENGINE", "PROGRAMME_REPARTITION"]) expect(code).not.toContain(nom);
  });
});
