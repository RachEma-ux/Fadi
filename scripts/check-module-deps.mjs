#!/usr/bin/env node
/**
 * Contrôle des dépendances entre paquets et modules (cahier des charges §5.1, T14 ; docs/architecture.md).
 * Exécuté par `npm run typecheck` (racine) ; un import interdit fait échouer la commande.
 *
 * Règles :
 * - chaque paquet de `packages/` a un `manifest.json` (`name`, `version`, `contracts`, `allowedDependencies`)
 *   cohérent avec son `package.json` ; `packages/atelier-model` peut ne pas exister encore (créé au lot 1) ;
 * - un paquet pur n'importe que ce que son manifeste autorise (`allowedDependencies`), jamais `react`, `three`,
 *   `express`, `drizzle-orm` (ni leurs voisins d'interface ou de serveur), jamais un fichier hors de son dossier
 *   (donc jamais un module de `apps/web`), jamais une API navigateur (`window`, `document`, `localStorage`…)
 *   ni un module `node:` hors des tests — un paquet pur tourne dans le navigateur comme sur le serveur ;
 * - plafond §5.1 : `atelier-model` → `domain-model`, `core-geometry` seulement ; aucune dépendance circulaire ;
 * - `apps/api` et `apps/web` peuvent dépendre des trois paquets, et seulement de paquets qui existent.
 *
 * Usage : node scripts/check-module-deps.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");

/** Paquets attendus (§5.1). `optional` : peut être absent tant que son lot n'a pas commencé. */
const EXPECTED = [
  { dir: "core-geometry", name: "@parcours/core-geometry", optional: false },
  { dir: "domain-model", name: "@parcours/domain-model", optional: false },
  { dir: "atelier-model", name: "@parcours/atelier-model", optional: true },
];
/** Plafond fixé par le cahier des charges (§5.1) : un manifeste ne peut pas l'élargir. */
const CEILING = {
  "@parcours/atelier-model": ["@parcours/domain-model", "@parcours/core-geometry"],
};
/** Interdits à tout paquet pur, quel que soit son manifeste (préfixes de nom de paquet). */
const FORBIDDEN = ["react", "react-dom", "react/", "three", "three/", "@react-three/", "express", "drizzle-orm", "drizzle-orm/", "pg", "dexie", "@tanstack/", "vite", "playwright"];
/** API navigateur repérées dans le code (commentaires et chaînes exclus). */
const BROWSER_GLOBALS = ["window", "document", "localStorage", "sessionStorage", "indexedDB", "navigator"];
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const isTestFile = (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.split(sep).includes("__tests__");

const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);
const rel = (p) => relative(ROOT, p).split(sep).join("/");

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${rel(file)} : JSON illisible (${err.message})`);
    return null;
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Retire commentaires, chaînes, gabarits et expressions régulières (pour chercher des identifiants dans le code seul). */
function codeOnly(src) {
  let out = "";
  let i = 0;
  let last = ""; // dernier caractère significatif émis
  const regexCanStart = () => last === "" || "(,=:[!&|?{};+-*%<>~^".includes(last) || /\b(return|typeof|case|in|of|void|delete|throw|new)$/.test(out.slice(-12).trimEnd());
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      out += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i++;
      out += '""';
      last = '"';
      continue;
    }
    if (c === "/" && regexCanStart()) {
      i++;
      let inClass = false;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        i++;
      }
      i++;
      while (i < src.length && /[a-z]/i.test(src[i])) i++;
      out += "/r/";
      last = "/";
      continue;
    }
    out += c;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out;
}

/** Spécificateurs importés : import / export … from, import "x", import("x"), require("x"). */
function specifiers(src) {
  const found = new Set();
  const patterns = [
    /^[ \t]*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/gm,
    /^[ \t]*import\s*["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) found.add(m[1]);
  return [...found];
}

const packageNameOf = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
const isForbidden = (spec) => FORBIDDEN.some((f) => (f.endsWith("/") ? spec.startsWith(f) : spec === f || spec.startsWith(`${f}/`)));

// 1. Paquets et manifestes.
const packages = new Map(); // nom → { dir, manifest, pkg }
const present = existsSync(PACKAGES_DIR) ? readdirSync(PACKAGES_DIR).filter((d) => existsSync(join(PACKAGES_DIR, d, "package.json"))) : [];
for (const exp of EXPECTED) {
  if (!present.includes(exp.dir)) {
    if (exp.optional) notes.push(`packages/${exp.dir} absent (accepté : créé à son lot)`);
    else fail(`packages/${exp.dir} absent`);
  }
}
for (const dir of present) {
  const base = join(PACKAGES_DIR, dir);
  const pkg = readJson(join(base, "package.json"));
  const manifestPath = join(base, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail(`packages/${dir}/manifest.json absent (name, version, contracts, allowedDependencies)`);
    continue;
  }
  const manifest = readJson(manifestPath);
  if (!pkg || !manifest) continue;
  const where = `packages/${dir}/manifest.json`;
  if (manifest.name !== pkg.name) fail(`${where} : name « ${manifest.name} » ≠ package.json « ${pkg.name} »`);
  if (manifest.version !== pkg.version) fail(`${where} : version « ${manifest.version} » ≠ package.json « ${pkg.version} »`);
  if (!manifest.contracts || typeof manifest.contracts !== "object" || Array.isArray(manifest.contracts) || !Object.values(manifest.contracts).every((v) => Number.isInteger(v) && v >= 1)) {
    fail(`${where} : contracts doit être un objet { contrat: version entière ≥ 1 } (vide s'il n'y en a pas)`);
  }
  if (!Array.isArray(manifest.allowedDependencies) || !manifest.allowedDependencies.every((d) => typeof d === "string")) {
    fail(`${where} : allowedDependencies doit être une liste de noms de paquets`);
    continue;
  }
  const expected = EXPECTED.find((e) => e.dir === dir);
  if (expected && expected.name !== pkg.name) fail(`packages/${dir} : nom attendu ${expected.name}, trouvé ${pkg.name}`);
  for (const d of manifest.allowedDependencies) {
    if (isForbidden(d)) fail(`${where} : ${d} est interdit à un paquet pur (§5.1)`);
    if (d === pkg.name) fail(`${where} : un paquet ne dépend pas de lui-même`);
  }
  const ceiling = CEILING[pkg.name];
  if (ceiling) for (const d of manifest.allowedDependencies) if (!ceiling.includes(d)) fail(`${where} : ${d} dépasse le plafond du cahier des charges (${ceiling.join(", ")})`);
  for (const d of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    if (!manifest.allowedDependencies.includes(d)) fail(`packages/${dir}/package.json : dépendance ${d} absente de allowedDependencies du manifeste`);
  }
  packages.set(pkg.name, { dir, base, manifest, pkg });
}

// 2. Graphe sans cycle (manifestes).
{
  const state = new Map();
  const visit = (name, path) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "open") {
      fail(`dépendance circulaire : ${[...path, name].join(" → ")}`);
      return;
    }
    state.set(name, "open");
    for (const d of packages.get(name)?.manifest.allowedDependencies ?? []) if (packages.has(d)) visit(d, [...path, name]);
    state.set(name, "done");
  };
  for (const name of packages.keys()) visit(name, []);
}

// 3. Imports réels des paquets purs.
let scanned = 0;
for (const [name, { base, manifest }] of packages) {
  for (const file of walk(join(base, "src"))) {
    scanned++;
    const src = readFileSync(file, "utf8");
    const test = isTestFile(file);
    for (const spec of specifiers(src)) {
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const target = resolve(dirname(file), spec);
        if (target !== base && !target.startsWith(base + sep)) fail(`${rel(file)} : import hors du paquet « ${spec} » (${rel(target)})`);
        continue;
      }
      if (spec.startsWith("node:")) {
        if (!test) fail(`${rel(file)} : « ${spec} » dans un paquet pur (hors tests) — il tourne aussi dans le navigateur`);
        continue;
      }
      if (isForbidden(spec)) {
        fail(`${rel(file)} : import interdit « ${spec} » (§5.1 : ni react, three, express, drizzle-orm, ni interface ou serveur dans un paquet pur)`);
        continue;
      }
      const dep = packageNameOf(spec);
      if (test && dep === "vitest") continue;
      if (!manifest.allowedDependencies.includes(dep)) fail(`${rel(file)} : « ${spec} » n'est pas dans allowedDependencies de ${name}`);
    }
    if (!test) {
      const code = codeOnly(src);
      for (const g of BROWSER_GLOBALS) {
        if (new RegExp(`(?<![\\w.$])${g}\\s*[.[]`).test(code)) fail(`${rel(file)} : API navigateur « ${g} » dans un paquet pur`);
      }
    }
  }
}

// 4. Applications : seulement des paquets qui existent.
for (const app of ["api", "web"]) {
  for (const file of walk(join(ROOT, "apps", app, "src"))) {
    scanned++;
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      if (!spec.startsWith("@parcours/")) continue;
      const dep = packageNameOf(spec);
      if (!EXPECTED.some((e) => e.name === dep)) fail(`${rel(file)} : paquet inconnu « ${spec} » (§5.1 : core-geometry, domain-model, atelier-model)`);
      else if (!packages.has(dep)) fail(`${rel(file)} : « ${spec} » n'existe pas encore dans packages/`);
    }
  }
}

if (errors.length) {
  console.error(`check-module-deps : ${errors.length} violation(s)`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`check-module-deps : ${packages.size} paquet(s) [${[...packages.keys()].join(", ")}], ${scanned} fichier(s) lus, aucune dépendance interdite${notes.length ? ` ; ${notes.join(" ; ")}` : ""}.`);
