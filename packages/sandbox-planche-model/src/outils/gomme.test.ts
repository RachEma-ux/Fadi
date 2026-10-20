import { describe, expect, it } from "vitest";
import { outilParId } from "../catalogue-outils.js";
import {
  type Modele,
  ajouterPolygone,
  ajouterRectangle,
  ajouterSegment,
  compter,
  grouper,
  modeleVide,
} from "../geometrie-libre.js";
import { AXE_Z, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition } from "./machine.js";
import { machineGomme, modeGomme } from "./gomme.js";

const TOLE = 0.05;
const rayon = (x: number, y: number) => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });
const clic = (x: number, y: number): EvenementOutil => ({ genre: "clic", rayon: rayon(x, y), tolerance: TOLE });
const souris = (genre: "appui" | "glisser" | "relache", x: number, y: number): EvenementOutil => ({
  genre,
  rayon: rayon(x, y),
  tolerance: TOLE,
  ecran: { x: x * 100, y: y * 100 },
});
const touche = (t: "Maj" | "Ctrl" | "Alt", etat: "enfoncee" | "relachee" = "enfoncee"): EvenementOutil => ({ genre: "touche", touche: t, etat });

class Pilote<E> {
  etat: E;
  selection: readonly string[] = [];
  pas = 0;
  transitions: Transition<E>[] = [];
  constructor(
    readonly machine: MachineOutil<E>,
    public modele: Modele,
  ) {
    this.etat = machine.initial();
  }
  get ctx(): ContexteOutil {
    return { modele: this.modele, selection: this.selection, separateurDecimal: "," };
  }
  envoyer(...evs: EvenementOutil[]): this {
    for (const ev of evs) {
      const t = this.machine.traiter(this.etat, ev, this.ctx);
      this.transitions.push(t);
      this.etat = t.etat;
      if (t.modele) {
        this.modele = t.modele;
        if (!t.remplaceDernier) this.pas++;
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

const rectangle = (): Modele => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2, 0)).modele;
const aretes = (m: Modele) => Object.values(m.racine.aretes);
/** Milieu de la première arête du modèle. */
function milieu(m: Modele): { x: number; y: number } {
  const a = aretes(m)[0];
  const p = m.racine.sommets[a?.a ?? ""]?.position;
  const q = m.racine.sommets[a?.b ?? ""]?.position;
  return { x: ((p?.x ?? 0) + (q?.x ?? 0)) / 2, y: ((p?.y ?? 0) + (q?.y ?? 0)) / 2 };
}

describe("Gomme — critères CA-GOM", () => {
  it("CA-GOM-1 : effacer une arête d'un rectangle à face → 3 arêtes, 0 face", () => {
    const p = new Pilote(machineGomme, rectangle()).envoyer(clic(2, 0.01));
    expect(p.compte).toMatchObject({ aretes: 3, faces: 0 });
    expect(p.transitions.at(-1)?.operation).toBe("Effacer");
  });

  it("CA-GOM-2 : un clic sur un côté d'un polygone à face → 0 arête, 0 face", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), AXE_Z, 2, 6, { genre: "polygone" }).modele;
    expect(compter(m.racine)).toMatchObject({ aretes: 6, faces: 1 });
    const p = new Pilote(machineGomme, m).envoyer(clic(milieu(m).x, milieu(m).y));
    expect(p.compte).toMatchObject({ aretes: 0, faces: 0 });
  });

  it("CA-GOM-3 : Ctrl + clic sur l'arête entre deux faces → adoucie, entités inchangées, deux faces distinctes", () => {
    const m = ajouterSegment(rectangle(), v3(2, 0, 0), v3(2, 2, 0)).modele;
    expect(compter(m.racine)).toMatchObject({ aretes: 7, faces: 2 });
    const p = new Pilote(machineGomme, m).envoyer(touche("Ctrl"), clic(2.01, 1));
    expect(p.compte).toMatchObject({ aretes: 7, faces: 2 });
    const a = aretes(p.modele).find((x) => x.adoucie);
    expect(a).toBeDefined();
    expect(p.transitions.at(-1)?.operation).toBe("Adoucir");
    // Alt + clic au même endroit : annule le lissage.
    p.envoyer(touche("Ctrl", "relachee"), touche("Alt"), clic(2.01, 1));
    expect(aretes(p.modele).some((x) => x.adoucie)).toBe(false);
  });

  it("CA-GOM-4 : Maj + clic puis Alt + clic au même endroit → masquée puis visible ; deux pas d'annulation", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0)).modele;
    const p = new Pilote(machineGomme, m).envoyer(touche("Maj"), clic(1, 0.01));
    expect(aretes(p.modele)[0]?.masquee).toBe(true);
    expect(p.compte.aretes).toBe(1);
    // Sans Alt, l'arête masquée n'est plus visée.
    p.envoyer(touche("Maj", "relachee"), clic(1, 0.01));
    expect(p.compte.aretes).toBe(1);
    p.envoyer(touche("Alt"), clic(1, 0.01));
    expect(aretes(p.modele)[0]?.masquee).toBeUndefined();
    expect(p.pas).toBe(2);
    expect(p.transitions.filter((t) => t.modele).map((t) => t.operation)).toEqual(["Masquer", "Réafficher"]);
  });

  it("CA-GOM-5 : glisser sur 3 arêtes → rien n'est effacé avant le relâchement ; 3 effacées en UN pas", () => {
    let m = modeleVide();
    for (const y of [0, 1, 2]) m = ajouterSegment(m, v3(0, y, 0), v3(3, y, 0)).modele;
    const p = new Pilote(machineGomme, m).envoyer(souris("appui", 1, 0), souris("glisser", 1, 0.5), souris("glisser", 1, 1), souris("glisser", 1.2, 2));
    expect(p.compte.aretes).toBe(3);
    expect(p.transitions.every((t) => t.modele === undefined)).toBe(true);
    expect(p.vue.survol).toHaveLength(3);
    p.envoyer(souris("relache", 1.2, 2));
    expect(p.compte.aretes).toBe(0);
    expect(p.pas).toBe(1);
    // Le clic qui suit le relâchement est ignoré.
    p.envoyer(clic(1, 0));
    expect(p.pas).toBe(1);
  });
});

describe("Gomme — compléments", () => {
  it("clic dans le vide ou sur une face : rien", () => {
    const p = new Pilote(machineGomme, rectangle()).envoyer(clic(10, 10), clic(2, 1));
    expect(p.compte).toMatchObject({ aretes: 4, faces: 1 });
    expect(p.pas).toBe(0);
  });

  it("appui + relâchement sans glisser : c'est le clic qui efface (une seule fois)", () => {
    const p = new Pilote(machineGomme, rectangle()).envoyer(souris("appui", 2, 0), souris("relache", 2, 0), clic(2, 0));
    expect(p.compte.aretes).toBe(3);
    expect(p.pas).toBe(1);
  });

  it("Maj sur un segment de courbe : la courbe entière est masquée", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), AXE_Z, 2, 6, { genre: "polygone" }).modele;
    const p = new Pilote(machineGomme, m).envoyer(touche("Maj"), clic(milieu(m).x, milieu(m).y));
    expect(aretes(p.modele).every((a) => a.masquee)).toBe(true);
  });

  it("Ctrl + Maj pendant un glisser : retire de la liste en cours", () => {
    let m = modeleVide();
    for (const y of [0, 1]) m = ajouterSegment(m, v3(0, y, 0), v3(3, y, 0)).modele;
    const p = new Pilote(machineGomme, m).envoyer(souris("appui", 1, 0), souris("glisser", 1, 1));
    expect(p.vue.survol).toHaveLength(2);
    p.envoyer(touche("Ctrl"), touche("Maj"), souris("glisser", 1, 1), touche("Ctrl", "relachee"), touche("Maj", "relachee"), souris("relache", 1, 1));
    expect(p.compte.aretes).toBe(1);
  });

  it("un groupe visé est effacé en entier et retiré de la sélection", () => {
    const r = rectangle();
    const g = grouper(r, [...Object.keys(r.racine.faces), ...Object.keys(r.racine.aretes)]);
    const p = new Pilote(machineGomme, g.modele);
    p.selection = [g.occurrence];
    p.envoyer(clic(2, 0));
    expect(Object.keys(p.modele.racine.occurrences)).toHaveLength(0);
    expect(p.selection).toEqual([]);
  });

  it("Échap pendant un glisser : rien n'est effacé", () => {
    const p = new Pilote(machineGomme, rectangle()).envoyer(souris("appui", 2, 0), souris("glisser", 2, 0.01), { genre: "echap" }, souris("relache", 2, 0));
    expect(p.compte.aretes).toBe(4);
  });

  it("consignes : la première phrase suit le modificateur maintenu (catalogue), le reste est gardé", () => {
    const cat = outilParId("gomme");
    const p = new Pilote(machineGomme, rectangle());
    expect(p.vue.consigne).toBe(cat?.etapes[0]?.consigne);
    p.envoyer(touche("Maj"));
    expect(p.vue.consigne.startsWith(cat?.etapes[2]?.consigne ?? "?")).toBe(true);
    expect(p.vue.consigne).toContain("| Ctrl = Adoucir/lisser.");
    p.envoyer(touche("Maj", "relachee"), touche("Ctrl"));
    expect(p.vue.consigne.startsWith(cat?.etapes[1]?.consigne ?? "?")).toBe(true);
    p.envoyer(touche("Ctrl", "relachee"), touche("Alt"));
    expect(p.vue.consigne.startsWith(cat?.etapes[3]?.consigne ?? "?")).toBe(true);
    p.envoyer(touche("Alt", "relachee"));
    expect(p.vue.consigne).toBe(cat?.etapes[0]?.consigne);
    expect(p.vue.mesures).toMatchObject({ libelle: "Mesures", valeur: "" });
  });

  it("modeGomme : priorités des modificateurs", () => {
    expect(modeGomme({ maj: false, ctrl: false, alt: false })).toBe("effacer");
    expect(modeGomme({ maj: true, ctrl: true, alt: false })).toBe("retirer");
    expect(modeGomme({ maj: false, ctrl: true, alt: true })).toBe("adoucir");
    expect(modeGomme({ maj: false, ctrl: false, alt: true })).toBe("reafficher");
  });
});
