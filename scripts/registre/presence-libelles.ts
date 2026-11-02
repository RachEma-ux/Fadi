/**
 * Présence de libellés de contrôle dans des versions de fichiers de test ou de recette, avec la règle exacte de
 * `apps/api/src/testing/libelles-sources.ts` (analyseur TypeScript : littéral exact, gabarit admis, nom complet Vitest
 * « bloc > test » dont chaque maillon est écrit) — celle que contrôle `registre-libelles.test.ts` au HEAD.
 *
 * Sert à `scripts/registre/completer_preuves.py` : retrouver, dans l'historique de `main`, la première version d'un fichier
 * où les libellés cités par une preuve du registre sont écrits. Pur : lecture du fichier JSON passé en argument.
 *
 * Entrée : { "items": [{ "cle": "…", "fichier": "chemin", "contenu": "texte", "libelles": ["…"] }] }
 * Sortie (stdout) : { "<cle>": [true | false, …] } dans l'ordre des libellés.
 *
 *   npx tsx scripts/registre/presence-libelles.ts entree.json
 */
import { readFileSync } from "node:fs";
import { libellesDuFichier, trouverLibelle } from "../../apps/api/src/testing/libelles-sources.js";

interface Item { cle: string; fichier: string; contenu: string; libelles: string[] }

export function presence(item: Item): boolean[] {
  const l = libellesDuFichier(item.fichier, item.contenu);
  return item.libelles.map((libelle) => {
    if (trouverLibelle(l, libelle)) return true;
    const maillons = libelle.split(" > ");
    return maillons.length > 1 && maillons.every((m) => trouverLibelle(l, m) !== null);
  });
}

const chemin = process.argv[2];
if (chemin) {
  const { items } = JSON.parse(readFileSync(chemin, "utf8")) as { items: Item[] };
  const sortie: Record<string, boolean[]> = {};
  for (const item of items) sortie[item.cle] = presence(item);
  process.stdout.write(JSON.stringify(sortie));
}
