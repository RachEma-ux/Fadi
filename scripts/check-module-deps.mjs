#!/usr/bin/env node
/**
 * Contrôle de modularité (cahier des charges, section 5.1, exigence T14).
 *
 * Chaque paquet pur (`packages/*`) porte un `manifest.json` :
 *   { "name", "version", "contracts": {...}, "allowedDependencies": ["@parcours/core-geometry", ...] }
 * Ce script lit chaque fichier `.ts` du paquet (hors tests, qui peuvent importer `vitest` et `node:*`)
 * et refuse tout import d'un module absent de `allowedDependencies` — en particulier `react`, `three`,
 * `express`, `drizzle-orm`, `dexie` et les API navigateur ne doivent jamais entrer dans un paquet pur.
 *
 * Il refuse aussi, dans `apps/web`, tout import pointant vers `apps/api`, et dans `apps/api` tout import
 * pointant vers `apps/web` (pas de dépendance circulaire entre applications).
 *
 * Sortie : code 1 et la liste des violations ; code 0 sinon. Lancé par `npm run typecheck`.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const violations = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiers(source) {
  const found = [];
  for (const m of source.matchAll(IMPORT_RE)) found.push(m[1] ?? m[2] ?? m[3]);
  return found;
}

function bareName(spec) {
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  if (spec.startsWith("node:")) return "node:";
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// 1. Paquets purs : manifeste obligatoire, dépendances fermées.
const packagesDir = join(root, "packages");
for (const pkg of readdirSync(packagesDir)) {
  const dir = join(packagesDir, pkg);
  if (!statSync(dir).isDirectory()) continue;
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    violations.push(`${relative(root, dir)} : manifest.json absent (nom, version, contracts, allowedDependencies)`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const allowed = new Set(manifest.allowedDependencies ?? []);
  for (const file of walk(join(dir, "src"))) {
    const isTest = /\.test\.(ts|tsx|mts)$/.test(file);
    const source = readFileSync(file, "utf8");
    for (const spec of specifiers(source)) {
      const name = bareName(spec);
      if (name === null) {
        if (spec.includes("/apps/") || /(^|\/)\.\.\/\.\.\/apps\//.test(spec)) violations.push(`${relative(root, file)} : import vers apps/ interdit (${spec})`);
        continue;
      }
      if (isTest && (name === "vitest" || name === "node:")) continue;
      if (!allowed.has(name)) violations.push(`${relative(root, file)} : dépendance non déclarée dans manifest.json : ${spec}`);
    }
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    if (!isTest && /\b(document|window|navigator|localStorage|HTMLElement)\b\s*[.(]/.test(code)) {
      violations.push(`${relative(root, file)} : usage d'une API navigateur dans un paquet pur`);
    }
  }
}

// 2. Applications : pas d'import croisé apps/web ↔ apps/api.
for (const [app, forbidden] of [["apps/web", "apps/api"], ["apps/api", "apps/web"]]) {
  const srcDir = join(root, app, "src");
  if (!existsSync(srcDir)) continue;
  for (const file of walk(srcDir)) {
    const source = readFileSync(file, "utf8");
    for (const spec of specifiers(source)) {
      if (spec.includes(forbidden)) violations.push(`${relative(root, file)} : import vers ${forbidden} interdit (${spec})`);
    }
  }
}

if (violations.length > 0) {
  console.error(`check-module-deps : ${violations.length} violation(s)\n- ${violations.join("\n- ")}`);
  process.exit(1);
}
console.log("check-module-deps : dépendances conformes aux manifestes");
