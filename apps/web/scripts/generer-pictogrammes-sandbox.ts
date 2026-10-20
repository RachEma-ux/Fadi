/**
 * Génère `apps/web/src/modules/sandbox/pictogrammes/donnees.ts` (lot 3 du Sandbox) : nœuds SVG des seules icônes
 * utilisées, lus dans `@tabler/icons` (version figée) et dans `sur-mesure/*.svg`. À relancer après tout changement de
 * pictogramme au registre ou d'icône de l'interface ; le test `pictogrammes.test.ts` refuse un fichier périmé.
 *
 *   npx tsx apps/web/scripts/generer-pictogrammes-sandbox.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { construirePictogrammes, texteDonnees } from "../src/modules/sandbox/pictogrammes/construction";

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(ICI, "../src/modules/sandbox/pictogrammes");
const exiger = createRequire(import.meta.url);
// Le paquet n'exporte que `icons/*` : sa racine se déduit d'une icône (`icons/outline/x.svg`).
const tabler = join(dirname(exiger.resolve("@tabler/icons/outline/x.svg")), "../..");
const version = (JSON.parse(readFileSync(join(tabler, "package.json"), "utf8")) as { version: string }).version;
const trait = JSON.parse(readFileSync(join(tabler, "tabler-nodes-outline.json"), "utf8"));
const plein = JSON.parse(readFileSync(join(tabler, "tabler-nodes-filled.json"), "utf8"));
const surMesure = Object.fromEntries(
  readdirSync(join(DOSSIER, "sur-mesure"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => [f.slice(0, -4), readFileSync(join(DOSSIER, "sur-mesure", f), "utf8")]),
);
const donnees = construirePictogrammes(trait, plein, surMesure);
writeFileSync(join(DOSSIER, "donnees.ts"), texteDonnees(donnees, version));
console.log(`donnees.ts : ${Object.keys(donnees).length} pictogrammes (Tabler ${version}).`);
