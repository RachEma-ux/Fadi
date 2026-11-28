/**
 * init.sql est rejoué en entier à chaque migration : une contrainte ajoutée deux fois sous le même nom doit être posée
 * NOT VALID à chaque fois, sinon la version la plus ancienne, rejouée la première, refuse les lignes déjà rangées sous
 * une valeur ajoutée ensuite et arrête la migration (cas des formats archivés des références, étapes 4 à 7b du lot C4).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./init.sql", import.meta.url), "utf8");

describe("init.sql rejouable", () => {
  it("une contrainte ajoutée plusieurs fois sous le même nom l'est toujours NOT VALID", () => {
    const ajouts = [...sql.matchAll(/ADD CONSTRAINT\s+([a-z0-9_]+)([\s\S]*?);/g)].map((m) => ({ nom: m[1]!, nonValide: /\bNOT VALID\s*$/.test(m[2]!.trim()) }));
    const parNom = new Map<string, boolean[]>();
    for (const a of ajouts) parNom.set(a.nom, [...(parNom.get(a.nom) ?? []), a.nonValide]);
    const fautifs = [...parNom].filter(([, v]) => v.length > 1 && v.some((x) => !x)).map(([nom]) => nom);
    expect(fautifs).toEqual([]);
  });

  it("formats des fichiers de référence : une seule liste, qui couvre KML, KMZ et PRJ", () => {
    const listes = [...sql.matchAll(/ADD CONSTRAINT sandbox_references_fichiers_format_check CHECK \(format IN \(([^)]*)\)\)/g)];
    expect(listes).toHaveLength(1);
    for (const f of ["ifczip", "gltf", "kml", "kmz", "prj"]) expect(listes[0]![1]).toContain(`'${f}'`);
  });
});
