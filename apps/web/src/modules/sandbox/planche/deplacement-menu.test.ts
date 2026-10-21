import { describe, expect, it } from "vitest";
import { bornerPosition, coteOuverture, ecrirePositionMenu, lirePositionMenu, type StockageMenu } from "./deplacement-menu";

const zone = { largeur: 800, hauteur: 600 };
const carte = { largeur: 44, hauteur: 44 };
const stockageMemoire = (): StockageMenu & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (c) => m.get(c) ?? null, setItem: (c, v) => void m.set(c, v), removeItem: (c) => void m.delete(c) };
};

describe("déplacement du menu de la Planche", () => {
  it("garde le pictogramme dans la Planche", () => {
    expect(bornerPosition({ x: -20, y: -5 }, carte, zone)).toEqual({ x: 0, y: 0 });
    expect(bornerPosition({ x: 900, y: 700 }, carte, zone)).toEqual({ x: 756, y: 556 });
    expect(bornerPosition({ x: 100, y: 120 }, carte, zone)).toEqual({ x: 100, y: 120 });
  });
  it("ouvre la liste du côté où elle reste visible", () => {
    expect(coteOuverture({ x: 8, y: 8 }, carte, zone)).toEqual({ horizontal: "gauche", vertical: "bas" });
    expect(coteOuverture({ x: 740, y: 500 }, carte, zone)).toEqual({ horizontal: "droite", vertical: "haut" });
  });
  it("mémorise et relit la position, ignore une valeur illisible", () => {
    const s = stockageMemoire();
    expect(lirePositionMenu(s)).toBeNull();
    ecrirePositionMenu(s, { x: 10.4, y: 20.6 });
    expect(lirePositionMenu(s)).toEqual({ x: 10, y: 21 });
    s.setItem("sandbox.planche.menu.position", "{pas du json");
    expect(lirePositionMenu(s)).toBeNull();
    s.setItem("sandbox.planche.menu.position", JSON.stringify({ x: "a", y: 1 }));
    expect(lirePositionMenu(s)).toBeNull();
    ecrirePositionMenu(s, null);
    expect(s.m.size).toBe(0);
    expect(lirePositionMenu(null)).toBeNull();
  });
});
