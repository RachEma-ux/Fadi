#!/usr/bin/env node
/**
 * `tsc` only emits compiled `.ts` → `.js`; it never copies the non-TypeScript
 * files that live alongside the source (the SQL schema, the Parcours example
 * fixtures). Both are read at runtime via `readFileSync`/`import.meta.url`
 * relative to the *compiled* module, so a production build without this step
 * silently serves a `dist/` tree missing `init.sql` and `data/*.json` — it
 * would run, start up, and only fail the moment a route or migration tries
 * to read a file that was never copied. Run after `tsc`, never before.
 */
import { cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = [
  ["src/db/init.sql", "dist/db/init.sql"],
  ["src/data", "dist/data"],
];

for (const [from, to] of assets) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.error(`copy-static-assets: missing source ${src}`);
    process.exit(1);
  }
  cpSync(src, join(root, to), { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
