/**
 * Assemble le paquet `fadi-addon/1` de l'extension « Trame d'axes » à partir de ses sources (fiche.json,
 * code.js, pages/). Le paquet assemblé est versionné à côté ; un test vérifie qu'il reste identique aux sources.
 *
 *   node apps/web/extensions/trame-axes/assembler.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ici = (chemin) => fileURLToPath(new URL(chemin, import.meta.url));

export function assembler() {
  const pages = {};
  for (const nom of readdirSync(ici("./pages")).sort()) pages[nom] = readFileSync(ici(`./pages/${nom}`), "utf8");
  return { format: "fadi-addon/1", fiche: JSON.parse(readFileSync(ici("./fiche.json"), "utf8")), code: readFileSync(ici("./code.js"), "utf8"), pages };
}

export const texteDuPaquet = () => `${JSON.stringify(assembler(), null, 1)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(ici("./trame-axes.fadi-addon.json"), texteDuPaquet());
  console.log("trame-axes.fadi-addon.json écrit");
}
