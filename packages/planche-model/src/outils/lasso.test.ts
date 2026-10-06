import { describe, expect, it } from "vitest";
import { outilParId } from "../catalogue-outils.js";
import { type Modele, ajouterPolygone, ajouterRectangle, ajouterSegment, modeleVide } from "../geometrie-libre.js";
import { AXE_Z, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition } from "./machine.js";
import { aireEcran, genreContour, machineLasso } from "./lasso.js";

const TOLE = 0.05;
const rayon = (x: number, y: number) => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });
const clic = (x: number, y: number, double = false): EvenementOutil => ({
  genre: "clic",
  rayon: rayon(x / 100, y / 100),
  tolerance: TOLE,
  ecran: { x, y },
  ...(double ? { double: true } : {}),
});
const souris = (genre: "appui" | "glisser" | "relache", x: number, y: number): EvenementOutil => ({
  genre,
  rayon: rayon(x / 100, y / 100),
  tolerance: TOLE,
  ecran: { x, y },
});

class Pilote<E> {
  etat: E;
  selection: readonly string[] = [];
  transitions: Transition<E>[] = [];
  constructor(
    readonly machine: MachineOutil<E>,
    public modele: Modele,
    readonly options: Partial<ContexteOutil> = {},
  ) {
    this.etat = machine.initial();
  }
  get ctx(): ContexteOutil {
    return { ...this.options, modele: this.modele, selection: this.selection, separateurDecimal: "," };
  }
  envoyer(...evs: EvenementOutil[]): this {
    for (const ev of evs) {
      const t = this.machine.traiter(this.etat, ev, this.ctx);
      this.transitions.push(t);
      this.etat = t.etat;
      if (t.modele) this.modele = t.modele;
      if (t.selection) this.selection = t.selection;
    }
    return this;
  }
  get vue() {
    return this.machine.vue(this.etat, this.ctx);
  }
}

/** Cercle (courbe à 12 segments) et un segment séparé. */
function scene(): { m: Modele; cercle: string[]; seul: string } {
  const m1 = ajouterPolygone(modeleVide(), v3(0, 0, 0), AXE_Z, 1, 12).modele;
  const cercle = Object.keys(m1.racine.aretes);
  const m = ajouterSegment(m1, v3(5, 0, 0), v3(6, 0, 0)).modele;
  const seul = Object.keys(m.racine.aretes).find((x) => !cercle.includes(x)) as string;
  return { m, cercle, seul };
}

// Contour carré à l'écran, y vers le bas : (0,0) → (100,0) → (100,100) → (0,100) = sens horaire visuel.
const HORAIRE = [clic(0, 0), clic(100, 0), clic(100, 100), clic(0, 100), clic(0, 100, true)];
const ANTIHORAIRE = [clic(0, 0), clic(0, 100), clic(100, 100), clic(100, 0), clic(100, 0, true)];

describe("Lasso — sens du contour", () => {
  it("aire écran > 0 ⇔ sens horaire (y vers le bas) ⇔ fenêtre ; anti-horaire ⇔ croisée", () => {
    const h = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(aireEcran(h)).toBeGreaterThan(0);
    expect(genreContour(h)).toBe("fenetre");
    expect(genreContour([...h].reverse())).toBe("croisee");
  });

  it("CA-LAS-1 : contour horaire autour du cercle entier → la courbe ; anti-horaire qui ne traverse qu'un segment → la courbe entière, le segment séparé non pris", () => {
    const { m, cercle, seul } = scene();
    const appels: { genre: string; n: number }[] = [];
    const entitesDansContour = (pts: readonly { x: number; y: number }[], genre: "fenetre" | "croisee") => {
      appels.push({ genre, n: pts.length });
      return genre === "fenetre" ? cercle : [cercle[0] as string];
    };
    const p = new Pilote(machineLasso, m, { entitesDansContour }).envoyer(...HORAIRE);
    expect(appels[0]).toEqual({ genre: "fenetre", n: 4 });
    expect([...p.selection].sort()).toEqual([...cercle].sort());
    p.envoyer(...ANTIHORAIRE);
    expect(appels[1]?.genre).toBe("croisee");
    expect(p.selection).toHaveLength(12);
    expect(p.selection).not.toContain(seul);
  });

  it("en fenêtre, une courbe partiellement incluse n'est pas prise", () => {
    const { m, cercle, seul } = scene();
    const p = new Pilote(machineLasso, m, { entitesDansContour: () => [...cercle.slice(0, 5), seul] }).envoyer(...HORAIRE);
    expect(p.selection).toEqual([seul]);
  });

  it("CA-LAS-2 : Échap avant fermeture → aucun changement de sélection", () => {
    const { m, seul } = scene();
    const p = new Pilote(machineLasso, m, { entitesDansContour: () => [seul] });
    p.selection = ["x"];
    p.envoyer(clic(0, 0), clic(100, 0), clic(100, 100), { genre: "echap" });
    expect(p.transitions.every((t) => t.selection === undefined)).toBe(true);
    expect(p.etat.points).toHaveLength(0);
    expect(p.vue.consigne).toBe(outilParId("lasso")?.etapes[0]?.consigne);
  });
});

describe("Lasso — étapes, modificateurs, contour libre", () => {
  it("consignes : étape 1 au repos, étape 2 après le premier clic ; aperçu du contour avec élastique", () => {
    const cat = outilParId("lasso");
    const p = new Pilote(machineLasso, modeleVide());
    expect(p.vue.consigne).toBe(cat?.etapes[0]?.consigne);
    expect(p.vue.mesures).toMatchObject({ libelle: "Mesures", valeur: "" });
    p.envoyer(clic(0, 0), { genre: "survol", rayon: rayon(0, 0), tolerance: TOLE, ecran: { x: 50, y: 0 } });
    expect(p.vue.consigne).toBe(cat?.etapes[1]?.consigne);
    expect(p.vue.apercu.contour?.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
  });

  it("Ctrl ajoute, Maj + Ctrl retire", () => {
    const { m, cercle, seul } = scene();
    const p = new Pilote(machineLasso, m, { entitesDansContour: (_p, g) => (g === "fenetre" ? [seul] : cercle) });
    p.envoyer(...HORAIRE);
    expect(p.selection).toEqual([seul]);
    p.envoyer({ genre: "touche", touche: "Ctrl", etat: "enfoncee" }, ...ANTIHORAIRE);
    expect(p.selection).toHaveLength(13);
    p.envoyer({ genre: "touche", touche: "Maj", etat: "enfoncee" }, ...HORAIRE);
    expect(p.selection).toHaveLength(12);
  });

  it("clic simple sur un objet (clic puis double-clic sur place) : comme la Sélection", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const p = new Pilote(machineLasso, m).envoyer(clic(200, 150), clic(200, 150, true));
    expect(p.selection).toEqual(Object.keys(m.racine.faces));
  });

  it("contour libre : appuyer, glisser, relâcher → appliqué ; le clic qui suit est ignoré", () => {
    const { m, seul } = scene();
    const recus: number[] = [];
    const p = new Pilote(machineLasso, m, {
      entitesDansContour: (pts) => {
        recus.push(pts.length);
        return [seul];
      },
    });
    p.envoyer(souris("appui", 0, 0), souris("glisser", 50, 0), souris("glisser", 100, 0), souris("glisser", 100, 100), souris("relache", 0, 100));
    expect(recus).toEqual([5]);
    expect(p.selection).toEqual([seul]);
    p.envoyer(clic(0, 100));
    expect(p.etat.points).toHaveLength(0);
  });
});
