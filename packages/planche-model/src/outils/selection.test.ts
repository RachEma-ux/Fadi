import { describe, expect, it } from "vitest";
import { outilParId } from "../catalogue-outils.js";
import {
  type Modele,
  ajouterPolygone,
  ajouterRectangle,
  compter,
  grouper,
  modeleVide,
  pousserTirer,
} from "../geometrie-libre.js";
import { type Vec3, AXE_Z, lerp, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition } from "./machine.js";
import { combiner, machineSelection, viser } from "./selection.js";

const TOLE = 0.05;
const rayon = (x: number, y: number) => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });
const clic = (x: number, y: number, n: 1 | 2 | 3 = 1): EvenementOutil => ({
  genre: "clic",
  rayon: rayon(x, y),
  tolerance: TOLE,
  ...(n === 2 ? { double: true } : {}),
  ...(n === 3 ? { triple: true } : {}),
});
const touche = (t: "Maj" | "Ctrl" | "Suppr", etat: "enfoncee" | "relachee" = "enfoncee"): EvenementOutil => ({ genre: "touche", touche: t, etat });
// Hors de tout sommet du rectangle de test : un appui sur une extrémité sélectionnée saisirait sa poignée.
const ecran = (genre: "appui" | "glisser" | "relache", x: number, y: number): EvenementOutil => ({
  genre,
  rayon: rayon(-5, -5),
  tolerance: TOLE,
  ecran: { x, y },
});

class Pilote<E> {
  etat: E;
  selection: readonly string[] = [];
  dans: string | undefined;
  transitions: Transition<E>[] = [];
  constructor(
    readonly machine: MachineOutil<E>,
    public modele: Modele,
    readonly options: Partial<ContexteOutil> = {},
  ) {
    this.etat = machine.initial();
  }
  get ctx(): ContexteOutil {
    return {
      ...this.options,
      modele: this.modele,
      selection: this.selection,
      separateurDecimal: ",",
      ...(this.dans !== undefined ? { dans: this.dans } : {}),
    };
  }
  envoyer(...evs: EvenementOutil[]): this {
    for (const ev of evs) {
      const t = this.machine.traiter(this.etat, ev, this.ctx);
      this.transitions.push(t);
      this.etat = t.etat;
      if (t.modele) this.modele = t.modele;
      if (t.selection) this.selection = t.selection;
      if (t.dans !== undefined) this.dans = t.dans ?? undefined;
    }
    return this;
  }
  get vue() {
    return this.machine.vue(this.etat, this.ctx);
  }
}

const rectangle = (): Modele => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
const ids = (m: Modele, k: "aretes" | "faces") => Object.keys(m.racine[k]);
const trie = (x: readonly string[]) => [...x].sort();

describe("Sélection — critères CA-SEL", () => {
  it("CA-SEL-1 : clic sur une face → la face seule, aucune arête", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 1.5));
    expect(p.selection).toEqual(ids(m, "faces"));
  });

  it("CA-SEL-2 : double-clic sur une face → la face et ses 4 arêtes", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 1.5), clic(2, 1.5, 2));
    expect(trie(p.selection)).toEqual(trie([...ids(m, "faces"), ...ids(m, "aretes")]));
  });

  it("double-clic sur une arête → l'arête et les faces qui la partagent", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 0, 2));
    expect(p.selection).toHaveLength(2);
    expect(p.selection).toContain(ids(m, "faces")[0]);
  });

  it("CA-SEL-3 : triple-clic sur une boîte libre → 6 faces et 12 arêtes", () => {
    const r = rectangle();
    const m = pousserTirer(r, ids(r, "faces")[0] as string, 1).modele;
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 1.5, 3));
    const c = compter(m.racine);
    expect(c).toMatchObject({ faces: 6, aretes: 12 });
    expect(p.selection).toHaveLength(18);
  });

  it("CA-SEL-4 : clic sur un segment d'un polygone à 6 côtés → les 6 arêtes de la courbe", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), AXE_Z, 2, 6, { genre: "polygone" }).modele;
    const a = Object.values(m.racine.aretes)[0];
    const pa = m.racine.sommets[a?.a ?? ""]?.position as Vec3;
    const pb = m.racine.sommets[a?.b ?? ""]?.position as Vec3;
    const mil = lerp(pa, pb, 0.5);
    const p = new Pilote(machineSelection, m).envoyer(clic(mil.x, mil.y));
    expect(trie(p.selection)).toEqual(trie(ids(m, "aretes")));
    expect(p.selection).toHaveLength(6);
  });

  it("CA-SEL-5 : fenêtre gauche → droite qui coupe une face → face non prise ; croisée droite → gauche → prise", () => {
    const m = rectangle();
    const [face] = ids(m, "faces");
    const arete = ids(m, "aretes")[0] as string;
    const appels: string[] = [];
    const entitesDansCadre = (_de: unknown, _a: unknown, genre: "fenetre" | "croisee") => {
      appels.push(genre);
      return genre === "fenetre" ? [arete] : [arete, face as string];
    };
    const p = new Pilote(machineSelection, m, { entitesDansCadre });
    p.envoyer(ecran("appui", 10, 10), ecran("glisser", 50, 60));
    expect(p.vue.apercu.cadre).toEqual({ de: { x: 10, y: 10 }, a: { x: 50, y: 60 }, genre: "fenetre" });
    p.envoyer(ecran("relache", 100, 100));
    expect(appels).toEqual(["fenetre"]);
    expect(p.selection).toEqual([arete]);
    // Le clic émis par le navigateur après le relâchement est ignoré.
    p.envoyer(clic(20, 20));
    expect(p.selection).toEqual([arete]);
    p.envoyer(ecran("appui", 100, 10), ecran("glisser", 40, 60), ecran("relache", 20, 80));
    expect(appels).toEqual(["fenetre", "croisee"]);
    expect(p.selection).toContain(face);
  });

  it("courbe au cadre : en fenêtre seulement si toutes ses arêtes sont dedans ; en croisée dès qu'une est touchée", () => {
    const m = ajouterPolygone(modeleVide(), v3(0, 0, 0), AXE_Z, 2, 6, { genre: "polygone" }).modele;
    const aretes = ids(m, "aretes");
    const entitesDansCadre = () => aretes.slice(0, 3);
    const p = new Pilote(machineSelection, m, { entitesDansCadre });
    p.envoyer(ecran("appui", 0, 0), ecran("glisser", 50, 50), ecran("relache", 50, 50));
    expect(p.selection.filter((x) => aretes.includes(x))).toHaveLength(0);
    p.envoyer(ecran("appui", 50, 0), ecran("glisser", 0, 50), ecran("relache", 0, 50));
    expect(p.selection.filter((x) => aretes.includes(x))).toHaveLength(6);
  });

  it("CA-SEL-6 : Maj + clic ×2 → absente ; Ctrl + clic ×2 → présente ; Maj + Ctrl + clic → absente", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m);
    p.envoyer(touche("Maj"), clic(2, 0), clic(2, 0));
    expect(p.selection).toHaveLength(0);
    p.envoyer(touche("Maj", "relachee"), touche("Ctrl"), clic(2, 0), clic(2, 0));
    expect(p.selection).toHaveLength(1);
    p.envoyer(touche("Maj"), clic(2, 0));
    expect(p.selection).toHaveLength(0);
    // Ctrl ajoute à l'existant, sans remplacer.
    p.envoyer(touche("Maj", "relachee"), clic(2, 0), clic(2, 1.5));
    expect(p.selection).toHaveLength(2);
  });

  it("CA-SEL-7 : la sélection ne change jamais le modèle", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m, { entitesDansCadre: () => ids(m, "aretes") });
    p.envoyer(clic(2, 1.5), clic(2, 1.5, 2), clic(2, 1.5, 3), ecran("appui", 0, 0), ecran("glisser", 9, 9), ecran("relache", 9, 9), { genre: "echap" });
    expect(p.transitions.every((t) => t.modele === undefined)).toBe(true);
    expect(p.modele).toBe(m);
  });
});

describe("Sélection — vide, Échap, Suppr, groupes", () => {
  it("clic dans le vide : tout désélectionner (sans modificateur) ; avec Ctrl : inchangé", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 1.5), touche("Ctrl"), clic(20, 20));
    expect(p.selection).toHaveLength(1);
    p.envoyer(touche("Ctrl", "relachee"), clic(20, 20));
    expect(p.selection).toHaveLength(0);
  });

  it("Échap vide la sélection ; pendant un cadre, l'annule seulement", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 1.5), ecran("appui", 0, 0), ecran("glisser", 20, 20), { genre: "echap" });
    expect(p.selection).toHaveLength(1);
    expect(p.vue.apercu.cadre).toBeUndefined();
    p.envoyer({ genre: "echap" });
    expect(p.selection).toHaveLength(0);
  });

  it("Suppr efface la sélection en un pas (face seule : ses arêtes restent)", () => {
    const m = rectangle();
    const p = new Pilote(machineSelection, m).envoyer(clic(2, 1.5), touche("Suppr"));
    expect(compter(p.modele.racine)).toMatchObject({ faces: 0, aretes: 4 });
    expect(p.selection).toHaveLength(0);
    expect(p.transitions.at(-1)?.operation).toBe("Effacer");
    // Sans sélection : rien.
    p.envoyer(touche("Suppr"));
    expect(p.transitions.at(-1)?.modele).toBeUndefined();
  });

  it("groupe : clic → l'occurrence entière ; double-clic → contexte d'édition ; Échap → en sort", () => {
    const r = rectangle();
    const g = grouper(r, [...ids(r, "faces"), ...ids(r, "aretes")]);
    const p = new Pilote(machineSelection, g.modele).envoyer(clic(2, 1.5));
    expect(p.selection).toEqual([g.occurrence]);
    p.envoyer(clic(2, 1.5, 2));
    expect(p.dans).toBe(g.occurrence);
    expect(p.selection).toHaveLength(0);
    p.envoyer(clic(2, 1.5));
    const def = g.modele.definitions[g.definition];
    expect(Object.keys(def?.contenu.faces ?? {})).toContain(p.selection[0]);
    p.envoyer({ genre: "echap" });
    expect(p.dans).toBeUndefined();
    expect(p.transitions.at(-1)?.dans).toBeNull();
    // Clic dans le vide hors du groupe : sort aussi du contexte.
    p.envoyer(clic(2, 1.5, 2), clic(30, 30));
    expect(p.dans).toBeUndefined();
  });

  it("vue : consigne et Mesures du catalogue, aucune pré-surbrillance", () => {
    const p = new Pilote(machineSelection, rectangle());
    expect(p.vue.consigne).toBe(outilParId("selection")?.etapes[0]?.consigne);
    expect(p.vue.mesures).toMatchObject({ libelle: "Mesures", valeur: "" });
    p.envoyer({ genre: "survol", rayon: rayon(2, 1.5), tolerance: TOLE });
    expect(p.vue.survol).toEqual([]);
  });

  it("combiner : remplace, ajoute, bascule (unité), retire", () => {
    expect(combiner(["a"], ["b"], { maj: false, ctrl: false })).toEqual(["b"]);
    expect(combiner(["a"], ["a", "b"], { maj: false, ctrl: true })).toEqual(["a", "b"]);
    expect(combiner(["a", "b"], ["a", "b"], { maj: true, ctrl: false })).toEqual([]);
    expect(combiner(["a"], ["a", "b"], { maj: true, ctrl: false })).toEqual(["a", "b"]);
    expect(combiner(["a", "b"], ["b"], { maj: true, ctrl: true })).toEqual(["a"]);
  });

  it("viser : une face devant une arête la masque", () => {
    const r = rectangle();
    // Arête sous la face, à z = −1, visée à travers la face.
    const m = ajouterRectangle(r, v3(1, 1, -1), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const el = viser(m, rayon(1.5, 1), TOLE);
    expect(el?.genre).toBe("face");
    expect(el && "normale" in el ? el.exterieur.every((p) => p.z === 0) : false).toBe(true);
  });
});

describe("Registre des machines de tracé", () => {
  it("MACHINES_TRACE : 5 machines, ids du catalogue, accessibles par machineParId", async () => {
    const { MACHINES_TRACE } = await import("./registre-trace.js");
    const { machineParId } = await import("./index.js");
    const ids = MACHINES_TRACE.map((m) => m.id);
    expect(ids).toEqual(["selection", "lasso", "gomme", "ligne", "main-levee"]);
    for (const id of ids) {
      expect(outilParId(id)).not.toBeNull();
      expect(machineParId(id)?.id).toBe(id);
    }
  });
});

describe("Sélection — poignées d'extrémité d'une arête", () => {
  const monde = (genre: "appui" | "glisser" | "relache", x: number, y: number): EvenementOutil => ({ genre, rayon: rayon(x, y), tolerance: TOLE, ecran: { x: x * 100, y: y * 100 } });
  const areteEn = (m: Modele, x: number, y: number) => {
    const p = new Pilote(machineSelection, m).envoyer(clic(x, y));
    return p;
  };

  it("une arête sélectionnée montre ses deux extrémités ; une face seule n'en montre aucune", () => {
    const m = rectangle();
    const p = areteEn(m, 2, 0); // arête basse (0;0) → (4;0)
    expect(p.selection).toHaveLength(1);
    expect(trie((p.vue.apercu.points ?? []).map((q) => `${q.x};${q.y}`))).toEqual(["0;0", "4;0"]);
    const f = new Pilote(machineSelection, m).envoyer(clic(2, 1.5));
    expect(f.vue.apercu.points ?? []).toHaveLength(0);
  });

  it("glisser une extrémité : l'arête reste sélectionnée et l'aperçu suit le curseur ; relâcher déplace le sommet", () => {
    const m = rectangle();
    const p = areteEn(m, 2, 0);
    const [arete] = p.selection;
    p.envoyer(monde("appui", 4, 0), monde("glisser", 5, -1));
    expect(p.selection).toEqual([arete]);
    const v = p.vue;
    expect(v.apercu.lignes.length).toBeGreaterThanOrEqual(2); // les deux arêtes du coin suivent le point
    expect(v.apercu.lignes.every((l) => Math.abs((l[1] as Vec3).x - 5) < 1e-6 && Math.abs((l[1] as Vec3).y + 1) < 1e-6)).toBe(true);
    expect(v.consigne).toMatch(/Glissez/);
    // L'inférence part de l'autre extrémité (0;0) : glissé en (6;0), le segment futur est sur l'axe rouge.
    p.envoyer(monde("glisser", 6, 0));
    expect(p.vue.inference?.type).toBe("axe-x");
    expect(p.vue.inference?.origineLigne).toEqual(v3(0, 0, 0));
    p.envoyer(monde("glisser", 5, -1));
    p.envoyer(monde("relache", 5, -1));
    const t = p.transitions[p.transitions.length - 1] as Transition<unknown>;
    expect(t.operation).toBe("Déplacer un point");
    expect(p.selection).toEqual([arete]);
    const positions = Object.values(p.modele.racine.sommets).map((s) => `${s.position.x};${s.position.y}`);
    expect(positions).toContain("5;-1");
    expect(positions).not.toContain("4;0");
    expect(compter(p.modele.racine).aretes).toBe(4);
    // Le clic émis par le navigateur après le relâchement ne change pas la sélection.
    p.envoyer(clic(2, 1.5));
    expect(p.selection).toEqual([arete]);
  });

  it("un appui loin des extrémités reste un cadre ; Échap annule un glisser de poignée", () => {
    const m = rectangle();
    const p = areteEn(m, 2, 0);
    const avant = p.modele;
    p.envoyer(monde("appui", 4, 0), monde("glisser", 6, 2), { genre: "echap" }, monde("relache", 6, 2));
    expect(p.modele).toBe(avant);
    const q = areteEn(m, 2, 0);
    q.envoyer(monde("appui", 2, 0.5), monde("glisser", 3, 1));
    expect(q.vue.apercu.cadre).toBeDefined();
    expect(q.vue.apercu.lignes).toHaveLength(0);
  });
});
