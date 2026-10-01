/**
 * Emplacement des fichiers lus à l'exécution (données du Parcours, schéma
 * SQL). Ce module vit à la racine de `src/` à dessein : `import.meta.url`
 * vaut `src/runtime-paths.ts` en développement (tsx, vitest) et
 * `dist/server.js` une fois le bundle construit (scripts/build.mjs copie
 * `src/data` → `dist/data`). Dans les deux cas, `./data/…` est juste à côté.
 */
export function dataFileUrl(relativeName: string): URL {
  return new URL(`./data/${relativeName}`, import.meta.url);
}
