// Versions effectivement installées des paquets du banc (lues dans node_modules, pas dans package.json).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const racineBanc = join(dirname(fileURLToPath(import.meta.url)), "..");

export function versionPaquet(nom) {
  try {
    return JSON.parse(readFileSync(join(racineBanc, "node_modules", nom, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}
