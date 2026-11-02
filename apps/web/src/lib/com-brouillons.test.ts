import { beforeEach, describe, expect, it } from "vitest";
import { cleBrouillon, ecrireBrouillon, lireBrouillon, oublierBrouillons } from "./com-brouillons";

class Memoire {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe("brouillons COM : propres au compte, oubliés avec l'appareil ou le projet", () => {
  beforeEach(() => { (globalThis as { localStorage: unknown }).localStorage = new Memoire(); });
  it("un autre compte ne relit pas le brouillon d'un autre", () => {
    ecrireBrouillon(cleBrouillon("a", "p1", "c1"), "privé de A");
    expect(lireBrouillon(cleBrouillon("b", "p1", "c1"))).toBe("");
    expect(lireBrouillon(cleBrouillon("a", "p1", "c1"))).toBe("privé de A");
  });
  it("oubli d'un projet : ses brouillons seulement ; oubli de l'appareil : tous", () => {
    ecrireBrouillon(cleBrouillon("a", "p1", "c1"), "x");
    ecrireBrouillon(cleBrouillon("a", "p2", "c2"), "y");
    localStorage.setItem("autre.cle", "z");
    oublierBrouillons("p1");
    expect(lireBrouillon(cleBrouillon("a", "p1", "c1"))).toBe("");
    expect(lireBrouillon(cleBrouillon("a", "p2", "c2"))).toBe("y");
    oublierBrouillons();
    expect(lireBrouillon(cleBrouillon("a", "p2", "c2"))).toBe("");
    expect(localStorage.getItem("autre.cle")).toBe("z");
  });
  it("texte vide : clé retirée", () => {
    const k = cleBrouillon("a", "p1", "c1");
    ecrireBrouillon(k, "x");
    ecrireBrouillon(k, "");
    expect(localStorage.length).toBe(0);
  });
});
