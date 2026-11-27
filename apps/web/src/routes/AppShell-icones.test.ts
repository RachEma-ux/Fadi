/**
 * Barre latérale : chaque entrée (navigation principale, menu « Studio », navigation secondaire, Administration
 * comprise quand elle est visible) a sa propre icône — deux entrées ne partagent jamais la même (règle d'or étendue).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (nom: string) => readFileSync(new URL(nom, import.meta.url), "utf8");
// Icône immédiatement suivie du libellé : une entrée de la barre, sous-menu Studio compris (Console, Choisir une étude).
const ENTREE = /<Icon name="([^"]+)"(?: size=\{\d+\})? \/><span className="sidebar-label">([^<]+)<\/span>/g;
const entrees = (source: string) => [...source.matchAll(ENTREE)].map((m) => ({ icone: m[1]!, libelle: m[2]! }));

describe("icônes de la barre latérale", () => {
  const shell = lire("./AppShell.tsx");
  const debut = shell.indexOf('<nav id="workspace-navigation"');
  const fin = shell.indexOf('<div className="app-user"');
  const barre = shell.slice(debut, fin);
  const liste = [...entrees(barre), ...(barre.includes("<MenuStudio") ? entrees(lire("./MenuStudio.tsx")) : [])];

  it("relève toutes les entrées, Administration comprise", () => {
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
    expect(liste.map((e) => e.libelle).sort()).toEqual(
      ["Accueil", "Administration", "Bibliothèque", "Choisir une étude", "Collaboration", "Console", "Extensions", "Harmonie", "Organisations", "Paramètres", "Projets", "Revues externes", "Studio"].sort());
  });

  it("donne à chaque entrée une icône qui n'appartient qu'à elle", () => {
    const parIcone = new Map<string, string[]>();
    for (const e of liste) parIcone.set(e.icone, [...(parIcone.get(e.icone) ?? []), e.libelle]);
    expect([...parIcone.values()].filter((l) => l.length > 1)).toEqual([]);
    expect(liste.find((e) => e.libelle === "Administration")?.icone).toBe("admin");
    expect(liste.find((e) => e.libelle === "Collaboration")?.icone).toBe("people");
    expect(liste.find((e) => e.libelle === "Organisations")?.icone).toBe("organization");
    expect(liste.find((e) => e.libelle === "Extensions")?.icone).toBe("puzzle");
    expect(liste.find((e) => e.libelle === "Harmonie")?.icone).toBe("sparkle");
  });
});
