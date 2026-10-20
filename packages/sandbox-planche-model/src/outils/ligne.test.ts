import { describe, expect, it } from "vitest";
import { outilParId } from "../catalogue-outils.js";
import { type Modele, aire, ajouterRectangle, compter, deplacer, grouper, modeleVide } from "../geometrie-libre.js";
import { type Vec3, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition } from "./machine.js";
import { type EtatLigne, formaterLongueur, machineLigne } from "./ligne.js";

const TOLE = 0.1;
const rayon = (x: number, y: number) => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });
const survol = (x: number, y: number): EvenementOutil => ({ genre: "survol", rayon: rayon(x, y), tolerance: TOLE });
const clic = (x: number, y: number): EvenementOutil => ({ genre: "clic", rayon: rayon(x, y), tolerance: TOLE });
const saisie = (texte: string): EvenementOutil => ({ genre: "saisie", texte });
const touche = (t: Extract<EvenementOutil, { genre: "touche" }>["touche"], etat: "enfoncee" | "relachee" = "enfoncee"): EvenementOutil => ({
  genre: "touche",
  touche: t,
  etat,
});

/** Pilote : applique les événements, tient le modèle, la sélection et l'historique (remplaceDernier compris). */
class Pilote<E> {
  etat: E;
  modele: Modele;
  selection: readonly string[] = [];
  historique: Modele[] = [];
  transitions: Transition<E>[] = [];
  constructor(
    readonly machine: MachineOutil<E>,
    modele: Modele = modeleVide(),
  ) {
    this.etat = machine.initial();
    this.modele = modele;
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

const proche = (a: Vec3, b: Vec3) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

function extremites(m: Modele): [Vec3, Vec3][] {
  const c = m.racine;
  return Object.values(c.aretes).map((a) => [(c.sommets[a.a] as { position: Vec3 }).position, (c.sommets[a.b] as { position: Vec3 }).position]);
}

describe("Ligne — critère du lot 2", () => {
  it("Ligne, puis « 4 » Entrée ×4 en tournant → une face de 16 m², chaîne terminée", () => {
    const p = new Pilote(machineLigne);
    p.envoyer(clic(0, 0), survol(2, 0.03), saisie("4"), survol(4.02, 2), saisie("4"), survol(2, 4.01), saisie("4"), survol(0.01, 2), saisie("4"));
    expect(p.compte.aretes).toBe(4);
    expect(p.compte.faces).toBe(1);
    const f = Object.keys(p.modele.racine.faces)[0] as string;
    expect(aire(p.modele, f)).toBeCloseTo(16, 9);
    expect(p.etat.etape).toBe(1);
    expect(p.historique).toHaveLength(4);
    expect(p.vue.mesures?.valeur).toBe("4");
  });
});

describe("Ligne — critères CA-LIG", () => {
  it("CA-LIG-1 : clic (0;0;0), curseur vers +x, « 3 » Entrée → arête exacte (0;0;0)–(3;0;0), étape 2 depuis (3;0;0)", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), survol(5, 0.02), saisie("3"));
    const [[a, b]] = extremites(p.modele) as [[Vec3, Vec3]];
    expect([a, b].some((x) => x.x === 0 && x.y === 0 && x.z === 0)).toBe(true);
    expect([a, b].some((x) => x.x === 3 && x.y === 0 && x.z === 0)).toBe(true);
    expect(p.etat.etape).toBe(2);
    proche(p.etat.depart as Vec3, v3(3, 0, 0));
    expect(p.transitions.at(-1)?.operation).toBe("Ligne");
  });

  it("CA-LIG-2 : quatre segments fermant un carré plan (clics) → 4 arêtes, 1 face, retour à l'étape 1", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), clic(4, 0), clic(4, 4), clic(0, 4));
    expect(p.etat.etape).toBe(2);
    expect(p.compte.faces).toBe(0);
    p.envoyer(clic(0, 0));
    expect(p.compte).toMatchObject({ aretes: 4, faces: 1 });
    expect(p.etat.etape).toBe(1);
    expect(p.vue.consigne).toBe(outilParId("ligne")?.etapes[0]?.consigne);
  });

  it("CA-LIG-3 : ligne d'un milieu à l'autre d'une face rectangulaire → 2 faces, chaîne terminée", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2, 0)).modele;
    const p = new Pilote(machineLigne, m0).envoyer(survol(2.03, 0.02));
    expect(p.etat.inference?.type).toBe("milieu");
    p.envoyer(clic(2.03, 0.02), clic(1.98, 2.02));
    expect(p.compte.faces).toBe(2);
    expect(p.etat.etape).toBe(1);
  });

  it("CA-LIG-4 : → puis curseur hors axe → point projeté sur l'axe rouge, Mesures « ~ » ; seconde pression → déverrouillé", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), touche("FlecheDroite"), survol(2, 1.5));
    proche(p.etat.inference?.point as Vec3, v3(2, 0, 0));
    expect(p.etat.inference?.verrouillee).toBe(true);
    expect(p.etat.inference?.libelle.en).toBe("Constrained on Line");
    expect(p.vue.mesures?.valeur).toBe("~ 2,00 m");
    p.envoyer(touche("FlecheDroite", "relachee"), touche("FlecheDroite"));
    expect(p.etat.fleche).toBeNull();
    proche(p.etat.inference?.point as Vec3, v3(2, 1.5, 0));
    expect(p.vue.mesures?.valeur).toBe("2,50 m");
  });

  it("← et ↑ verrouillent sur les axes vert et bleu", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), touche("FlecheGauche"), survol(1, 3));
    proche(p.etat.inference?.point as Vec3, v3(0, 3, 0));
    p.envoyer(touche("FlecheHaut"));
    expect(p.etat.inference?.type).toBe("axe-z");
  });

  it("CA-LIG-5 : Alt au relâchement, cycle de 3 ; en « toutes coupées » aucune inférence d'axe", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), survol(2, 0.03));
    expect(p.etat.inference?.type).toBe("axe-x");
    expect(p.vue.consigne).toContain("(toutes actives)");
    p.envoyer(touche("Alt", "enfoncee"));
    expect(p.etat.modeAlt).toBe("tout");
    p.envoyer(touche("Alt", "relachee"));
    expect(p.etat.modeAlt).toBe("aucune");
    expect(p.etat.inference?.type).not.toBe("axe-x");
    proche(p.etat.inference?.point as Vec3, v3(2, 0.03, 0));
    expect(p.vue.consigne).toContain("(toutes coupées)");
    p.envoyer(touche("Alt", "relachee"));
    expect(p.etat.modeAlt).toBe("parallele-perpendiculaire");
    expect(p.vue.consigne).toContain("(parallèle/perpendiculaire seulement)");
    p.envoyer(touche("Alt", "relachee"));
    expect(p.etat.modeAlt).toBe("tout");
    expect(p.etat.inference?.type).toBe("axe-x");
  });

  it("CA-LIG-6 : Échap à l'étape 2 → aucune entité créée, Mesures vidé, outil gardé à l'étape 1", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), survol(2, 1), { genre: "echap" });
    expect(p.compte.aretes).toBe(0);
    expect(p.etat.etape).toBe(1);
    expect(p.vue.mesures?.valeur).toBe("");
    expect(p.vue.apercu.lignes).toHaveLength(0);
  });
});

describe("Ligne — modificateurs et saisies", () => {
  it("Maj maintenue verrouille l'inférence courante ; le segment « Alt = … » disparaît ; relâcher libère", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), survol(2, 0.03), touche("Maj"), survol(3, 1));
    proche(p.etat.inference?.point as Vec3, v3(3, 0, 0));
    expect(p.etat.inference?.verrouillee).toBe(true);
    expect(p.vue.consigne).not.toContain("Alt =");
    expect(p.vue.mesures?.valeur.startsWith("~ ")).toBe(true);
    p.envoyer(touche("Maj", "relachee"));
    proche(p.etat.inference?.point as Vec3, v3(3, 1, 0));
    expect(p.vue.consigne).toContain("Alt =");
  });

  it("↓ sans arête de référence : longueur bloquée à 0,00 m ; avec référence : parallèle à l'arête survolée", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), touche("FlecheBas"), survol(3, 2));
    proche(p.etat.inference?.point as Vec3, v3(0, 0, 0));
    expect(p.vue.mesures?.valeur).toBe("~ 0,00 m");
    p.envoyer(touche("FlecheBas"));
    expect(p.etat.fleche).toBeNull();

    // Arête diagonale de référence (5;5)–(7;7), survolée puis ↓.
    const m0 = new Pilote(machineLigne).envoyer(clic(5, 5), clic(7, 7), { genre: "echap" }).modele;
    const q = new Pilote(machineLigne, m0).envoyer(clic(0, 0), survol(6.5, 6.5), survol(1, 1.2), touche("FlecheBas"), survol(3, 1));
    expect(q.etat.inference?.type).toBe("parallele");
    proche(q.etat.inference?.point as Vec3, v3(2, 2, 0));
  });

  it("coordonnées absolues [x;y;z] à l'étape 1 et relatives <dx;dy;dz> à l'étape 2 (locale française)", () => {
    const p = new Pilote(machineLigne).envoyer(saisie("[1;2;0]"));
    expect(p.etat.etape).toBe(2);
    proche(p.etat.depart as Vec3, v3(1, 2, 0));
    p.envoyer(saisie("<2,5;0;0>"));
    const [[a, b]] = extremites(p.modele) as [[Vec3, Vec3]];
    expect(Math.max(a.x, b.x)).toBeCloseTo(3.5, 12);
    p.envoyer(saisie("[3,5;4;0]"));
    expect(p.compte.aretes).toBe(2);
  });

  it("longueur négative = sens inverse ; décimale à virgule", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), survol(2, 0.02), saisie("-1,5"));
    proche(p.etat.depart as Vec3, v3(-1.5, 0, 0));
  });

  it("saisie refusée : erreur annoncée, rien n'est modifié, le champ garde le texte", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), survol(2, 0.02), saisie("abc"));
    expect(p.compte.aretes).toBe(0);
    expect(p.vue.erreur).not.toBeNull();
    expect(p.vue.mesures?.valeur).toBe("abc");
    p.envoyer(survol(2, 0.03));
    expect(p.vue.erreur).toBeNull();
    // Longueur sans direction (curseur sur le départ) : refusée.
    const q = new Pilote(machineLigne).envoyer(clic(0, 0), saisie("3"));
    expect(q.compte.aretes).toBe(0);
    expect(q.vue.erreur).not.toBeNull();
    // Étape 1 sans segment précédent : refusée.
    expect(new Pilote(machineLigne).envoyer(saisie("3")).vue.erreur).not.toBeNull();
  });

  it("correction après coup : à l'étape 1, une longueur remplace le dernier segment (remplaceDernier)", () => {
    const p = new Pilote(machineLigne).envoyer(clic(0, 0), clic(4, 0), clic(4, 3), clic(0, 0));
    expect(p.compte.faces).toBe(1);
    expect(p.etat.etape).toBe(1);
    const avant = p.historique.length;
    p.envoyer(saisie("2"));
    const t = p.transitions.at(-1);
    expect(t?.remplaceDernier).toBe(true);
    expect(p.historique.length).toBe(avant);
    expect(p.compte.faces).toBe(0);
    const bouts = extremites(p.modele).flat();
    expect(bouts.some((x) => Math.abs(x.x - 2.4) < 1e-9 && Math.abs(x.y - 1.8) < 1e-9)).toBe(true);
    // Échap efface la mémoire de correction.
    p.envoyer({ genre: "echap" }, saisie("2"));
    expect(p.vue.erreur).not.toBeNull();
  });

  it("vue : consignes et libellés du catalogue, Mesures « Longueur », aperçu élastique", () => {
    const cat = outilParId("ligne");
    const p = new Pilote(machineLigne);
    expect(p.vue.consigne).toBe(cat?.etapes[0]?.consigne);
    expect(p.vue.mesures?.libelle).toBe("Longueur");
    expect(p.vue.mesures?.valeur).toBe("");
    p.envoyer(clic(0, 0), survol(2.64, 0.01));
    expect(p.vue.consigne).toBe(cat?.etapes[1]?.consigne);
    expect(p.vue.mesures?.valeur).toBe("2,64 m");
    expect(p.vue.apercu.lignes).toHaveLength(1);
    expect(p.vue.mesures?.saisie.attendu).toBe("longueur-ou-point");
  });

  it("clic au même point que le départ : ignoré ; le double-clic n'ajoute pas de segment nul", () => {
    const p = new Pilote(machineLigne).envoyer(clic(1, 1), { genre: "clic", rayon: rayon(1, 1), tolerance: TOLE, double: true });
    expect(p.compte.aretes).toBe(0);
    expect(p.etat.etape).toBe(2);
  });

  it("formaterLongueur : précision 0,00, « ~ » si arrondie ou verrouillée", () => {
    expect(formaterLongueur(4, ",", false)).toBe("4,00 m");
    expect(formaterLongueur(8.2512, ".", false)).toBe("~ 8.25 m");
    expect(formaterLongueur(1, ",", true)).toBe("~ 1,00 m");
  });

  it("état initial immuable : traiter ne modifie pas l'état reçu", () => {
    const e0: EtatLigne = machineLigne.initial();
    const copie = JSON.stringify(e0);
    machineLigne.traiter(e0, clic(0, 0), { modele: modeleVide(), selection: [], separateurDecimal: "," });
    expect(JSON.stringify(e0)).toBe(copie);
  });

  it("contexte d'édition : les points monde sont ramenés dans le repère du groupe (ctx.dans)", () => {
    const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(r, [...Object.keys(r.racine.faces), ...Object.keys(r.racine.aretes)]);
    const m = deplacer(g.modele, [g.occurrence], v3(10, 0, 0)).modele;
    let etat = machineLigne.initial();
    let modele = m;
    for (const ev of [clic(10, 3), survol(12, 3.02), saisie("3")]) {
      const t = machineLigne.traiter(etat, ev, { modele, selection: [], separateurDecimal: ",", dans: g.occurrence });
      etat = t.etat;
      if (t.modele) modele = t.modele;
    }
    const def = modele.definitions[g.definition];
    const pts = Object.values(def?.contenu.sommets ?? {}).map((s) => s.position);
    expect(pts.some((q) => Math.abs(q.x - 3) < 1e-9 && Math.abs(q.y - 3) < 1e-9)).toBe(true);
    expect(Object.keys(modele.racine.aretes)).toHaveLength(0);
  });
});
