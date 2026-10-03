#!/usr/bin/env node
/**
 * Build de production de l'API : un seul bundle ESM `dist/server.js`.
 *
 * Pourquoi un bundle et non `tsc` seul : `@parcours/domain-model` expose ses
 * sources TypeScript (`exports: "./src/index.ts"`), ce que `tsx`, Vite et
 * vitest chargent sans problème mais que `node dist/server.js` ne sait pas
 * résoudre. Jusqu'ici l'API se limitait donc à `import type` depuis le
 * modèle de domaine. Le moteur Harmonie, les KPI et la répartition
 * programmatique sont du code exécuté côté serveur (c'est lui qui fait
 * autorité) : on l'intègre au bundle, en laissant les dépendances npm
 * externes. `tsc --noEmit` reste la vérification de types (npm run
 * typecheck).
 */
import { build } from "esbuild";
import { readFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => !name.startsWith("@parcours/"));

mkdirSync(join(root, "dist"), { recursive: true });
await build({
  entryPoints: [join(root, "src/server.ts")],
  outfile: join(root, "dist/server.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external,
  // Les paquets de l'espace de travail sont des sources TypeScript : on les
  // résout vers leur fichier d'entrée pour qu'esbuild les compile.
  alias: {
    "@parcours/domain-model": join(root, "../../packages/domain-model/src/index.ts"),
    "@parcours/core-geometry": join(root, "../../packages/core-geometry/src/index.ts"),
  },
  logLevel: "info",
});

// Les fichiers lus à l'exécution (schéma SQL, données du Parcours) ne sont
// pas des modules : copie à côté du bundle, aux chemins que
// `src/runtime-paths.ts` attend (dist/db/init.sql, dist/data/**).
for (const [from, to] of [
  ["src/db/init.sql", "dist/db/init.sql"],
  ["src/data", "dist/data"],
]) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.error(`build: source manquante ${src}`);
    process.exit(1);
  }
  cpSync(src, join(root, to), { recursive: true });
  console.log(`copié ${from} -> ${to}`);
}
