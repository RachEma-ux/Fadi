import { describe, expect, it } from "vitest";
import { outilParId } from "../catalogue-outils.js";
import { type Modele, ajouterRectangle, compter, modeleVide } from "../geometrie-libre.js";
import { type Vec3, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Transition } from "./machine.js";
import { CONSIGNE_SEGMENTS, machineMainLevee, reechantillonner } from "./main-levee.js";
import { machineSelection } from "./selection.js";

const TOLE = 0.05;
const vertical = (x: number, y: number): Rayon => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });
const ev = (genre: "appui" | "glisser" | "relache", r: Rayon): EvenementOutil => ({ genre, rayon: r, tolerance: TOLE, ecran: { x: 0, y: 0 } });
const touche = (t: "FlecheDroite" | "FlecheHaut" | "CtrlPlus" | "CtrlMoins"): EvenementOutil => ({ genre: "touche", touche: t, etat: "enfoncee" });

class Pilote<E> {
  etat: E;
  selection: readonly string[] = [];
  historique: Modele[] = [];
  transitions: Transition<E>[] = [];
  constructor(
    readonly machine: MachineOutil<E>,
    public modele: Modele = modeleVide(),
  ) {
    this.etat = machine.initial();
  }
  get ctx(): ContexteOutil {
    return { modele: this.modele, selection: this.selection, separateurDecimal: "," };
  }
  envoyer(...evs: EvenementOutil[]): this {
    for (const e of evs) {
      const t = this.machine.traiter(this.etat, e, this.ctx);
      this.transitions.push(t);
      this.etat = t.etat;
      if (t.modele) {
        if (t.remplaceDernier) this.historique.pop();
        this.historique.push(this.modele);
        this.modele = t.modele;
      }
      if (t.selection) this.selection = t.selection;
    }
    return this;
  }
  get vue() {
    return this.machine.vue(this.etat, this.ctx);
  }
  get compte() {
    return compter(this.modele.racine);
  }
}

const sommets = (m: Modele): Vec3[] => Object.values(m.racine.sommets).map((s) => s.position);
const TRAJET = [vertical(0, 0), vertical(1, 0.5), vertical(2, 0.2), vertical(3, 1), vertical(4, 0)];

describe("Main levée — critères CA-MLV", () => {
  it("CA-MLV-1 : glisser de A à B → une courbe d'au moins 2 arêtes, sélectionnée en entier par un clic", () => {
    const [a, ...reste] = TRAJET as [Rayon, ...Rayon[]];
    const p = new Pilote(machineMainLevee).envoyer(ev("appui", a), ...reste.slice(0, -1).map((r) => ev("glisser", r)), ev("relache", reste.at(-1) as Rayon));
    expect(p.compte.aretes).toBe(4);
    expect(p.compte.faces).toBe(0);
    expect(Object.keys(p.modele.racine.courbes)).toHaveLength(1);
    expect(p.transitions.filter((t) => t.modele)).toHaveLength(1);
    expect(p.transitions.at(-1)?.operation).toBe("Main levée");
    // Le clic émis après le relâchement ne crée rien.
    p.envoyer({ genre: "clic", rayon: vertical(4, 0), tolerance: TOLE });
    expect(p.historique).toHaveLength(1);
    // Sélection : un clic sur un segment prend toute la courbe.
    const s = new Pilote(machineSelection, p.modele).envoyer({ genre: "clic", rayon: vertical(0.5, 0.25), tolerance: TOLE });
    expect(s.selection).toHaveLength(4);
  });

  it("CA-MLV-2 (adapté) : flèche → avant le tracé → tous les points dans un plan vertical x = constante", () => {
    // Rayons obliques (vue de côté) ; → = plan perpendiculaire à l'axe rouge, comme CA-REC-4.
    const oblique = (y: number, z: number): Rayon => ({ origine: v3(10, y, z), direction: v3(-1, 0, -0.5) });
    const p = new Pilote(machineMainLevee).envoyer(
      touche("FlecheDroite"),
      ev("appui", oblique(0, 5)),
      ev("glisser", oblique(1, 6)),
      ev("glisser", oblique(2, 5.5)),
      ev("relache", oblique(3, 7)),
    );
    expect(p.compte.aretes).toBe(3);
    const xs = sommets(p.modele).map((q) => q.x);
    for (const x of xs) expect(x).toBeCloseTo(0, 9);
    expect(Math.max(...sommets(p.modele).map((q) => q.z))).toBeGreaterThan(1);
    // Le verrou est relâché après le tracé.
    expect(p.etat.verrou).toBeNull();
  });
});

describe("Main levée — compléments", () => {
  it("↑ = plan horizontal ; seconde pression = déverrouillé", () => {
    const p = new Pilote(machineMainLevee).envoyer(touche("FlecheHaut"));
    expect(p.etat.verrou?.normale).toEqual(v3(0, 0, 1));
    p.envoyer(touche("FlecheHaut"));
    expect(p.etat.verrou).toBeNull();
  });

  it("sur une face : le tracé suit le plan de la face visée à l'appui", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 2), v3(5, 0, 0), v3(0, 5, 0)).modele;
    const p = new Pilote(machineMainLevee, m).envoyer(ev("appui", vertical(1, 1)), ev("glisser", vertical(2, 1.5)), ev("relache", vertical(3, 1)));
    const nouveaux = sommets(p.modele).filter((q) => q.x > 0.5 && q.x < 3.5 && q.y > 0.5);
    expect(nouveaux.length).toBeGreaterThanOrEqual(3);
    for (const q of nouveaux) expect(q.z).toBeCloseTo(2, 9);
  });

  it("boucle fermée plane → face (doc, nv)", () => {
    const r = [vertical(0, 0), vertical(2, 0), vertical(2, 2), vertical(0, 2), vertical(0.01, 0.01)];
    const p = new Pilote(machineMainLevee).envoyer(ev("appui", r[0] as Rayon), ...r.slice(1, -1).map((x) => ev("glisser", x)), ev("relache", r[4] as Rayon));
    expect(p.compte.faces).toBe(1);
    expect(p.compte.aretes).toBe(4);
  });

  it("Ctrl + / Ctrl − juste après le tracé : ±1 segment, remplace le dernier pas ; consigne enrichie", () => {
    const cat = outilParId("main-levee");
    const [a, ...reste] = TRAJET as [Rayon, ...Rayon[]];
    const p = new Pilote(machineMainLevee);
    expect(p.vue.consigne).toBe(cat?.etapes[0]?.consigne);
    p.envoyer(ev("appui", a), ...reste.slice(0, -1).map((r) => ev("glisser", r)), ev("relache", reste.at(-1) as Rayon));
    expect(p.vue.consigne).toContain(CONSIGNE_SEGMENTS);
    expect(p.vue.consigne.startsWith(cat?.etapes[0]?.consigne?.split(" | ")[0] ?? "?")).toBe(true);
    p.envoyer(touche("CtrlPlus"));
    expect(p.compte.aretes).toBe(5);
    expect(p.transitions.at(-1)?.remplaceDernier).toBe(true);
    expect(p.historique).toHaveLength(1);
    p.envoyer(touche("CtrlMoins"), touche("CtrlMoins"));
    expect(p.compte.aretes).toBe(3);
    // Après une autre action (nouvel appui), Ctrl ± n'agit plus sur l'ancienne courbe.
    p.envoyer(ev("appui", vertical(8, 8)), { genre: "echap" }, touche("CtrlPlus"));
    expect(p.compte.aretes).toBe(3);
    expect(p.vue.consigne).toBe(cat?.etapes[0]?.consigne);
  });

  it("Échap pendant le tracé : rien n'est créé ; appui + relâchement sur place : rien", () => {
    const p = new Pilote(machineMainLevee).envoyer(ev("appui", vertical(0, 0)), ev("glisser", vertical(1, 1)), { genre: "echap" }, ev("relache", vertical(2, 2)));
    expect(p.compte.aretes).toBe(0);
    p.envoyer(ev("appui", vertical(0, 0)), ev("relache", vertical(0, 0)));
    expect(p.compte.aretes).toBe(0);
  });

  it("aperçu pendant le tracé et Mesures inactif", () => {
    const p = new Pilote(machineMainLevee).envoyer(ev("appui", vertical(0, 0)), ev("glisser", vertical(1, 1)));
    expect(p.vue.apercu.lignes[0]).toHaveLength(2);
    expect(p.vue.mesures).toMatchObject({ libelle: "Mesures", valeur: "" });
  });

  it("reechantillonner : n segments de même longueur d'arc, extrémités conservées", () => {
    const r = reechantillonner([v3(0, 0, 0), v3(3, 0, 0), v3(3, 3, 0)], 3);
    expect(r).toHaveLength(4);
    expect(r[0]).toEqual(v3(0, 0, 0));
    expect(r[1]?.x).toBeCloseTo(2, 12);
    expect(r[2]?.y).toBeCloseTo(1, 12);
    expect(r[3]?.y).toBeCloseTo(3, 12);
  });
});
