import { describe, expect, it } from "vitest";
import { combinaison, COMMANDES_2D, entreeParRaccourci, OUTILS_2D } from "./outils-2d";

const toutes = [...OUTILS_2D, ...COMMANDES_2D];
const cle = (key: string, m: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...m });

describe("Planche 2D de Studio — règle d'or", () => {
  it("chaque outil et chaque commande a sa propre icône, une barre et un raccourci unique", () => {
    expect(new Set(toutes.map((x) => x.icone)).size).toBe(toutes.length);
    expect(new Set(toutes.flatMap((x) => [x.raccourci, ...(x.autres ?? [])])).size).toBe(toutes.reduce((n, x) => n + 1 + (x.autres?.length ?? 0), 0));
    for (const x of toutes) {
      expect(x.icone.length, x.id).toBeGreaterThan(0);
      expect(["outils", "edition", "vue"], x.id).toContain(x.barre);
      expect(entreeParRaccourci(x.raccourci)?.id, x.id).toBe(x.id);
    }
  });

  it("lecture du clavier : Espace, L, Maj+C, Ctrl+Z, Ctrl+Maj+Z, Suppr ; modificateur seul ignoré", () => {
    expect(combinaison(cle(" "))).toBe("Espace");
    expect(combinaison(cle("l"))).toBe("L");
    expect(combinaison(cle("C", { shiftKey: true }))).toBe("Maj+C");
    expect(combinaison(cle("z", { ctrlKey: true }))).toBe("Ctrl+Z");
    expect(combinaison(cle("Z", { metaKey: true, shiftKey: true }))).toBe("Ctrl+Maj+Z");
    expect(combinaison(cle("Delete"))).toBe("Suppr");
    expect(combinaison(cle("Shift", { shiftKey: true }))).toBeNull();
    expect(entreeParRaccourci("Ctrl+Maj+Z")).toEqual({ type: "commande", id: "retablir" });
    expect(entreeParRaccourci("Q")).toBeNull();
  });
});
