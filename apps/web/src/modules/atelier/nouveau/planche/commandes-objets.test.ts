import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, contexte, copier, etirerAretes, grouper, grouperVide, modeleVide, v3 } from "@parcours/planche-model";
import { COMMANDES_OBJETS, ciblesDeplacement, disponibiliteNavigateur, disponibiliteObjet, disponibiliteVue, filAriane, liensRompus } from "./commandes-objets";

const base = { lecture: false, entites: 0, objets: 0, verrouilles: false };

describe("Commandes d'objet (Objets O-1, D-203)", () => {
  it("disponibilité commune au menu, à la barre et au clavier, avec un motif quand c'est grisé", () => {
    expect(disponibiliteObjet("groupe", base)).toEqual({ disponible: false, motif: "planche.objets.motif.vide" });
    expect(disponibiliteObjet("composant", { ...base, entites: 2 }).disponible).toBe(true);
    expect(disponibiliteObjet("eclater", { ...base, entites: 3 })).toEqual({ disponible: false, motif: "planche.objets.motif.eclater" });
    expect(disponibiliteObjet("eclater", { ...base, entites: 1, objets: 1 }).disponible).toBe(true);
    expect(disponibiliteObjet("eclater", { ...base, entites: 1, objets: 1, verrouilles: true }).motif).toBe("planche.objets.motif.verrouille");
    for (const c of COMMANDES_OBJETS) expect(disponibiliteObjet(c.id, { ...base, lecture: true, entites: 1, objets: 1 }).motif).toBe("planche.objets.motif.lecture");
  });
  it("Objets O-3 : Rendre unique demande un objet partagé ; Diviser une arête ; Diviser en segments une courbe", () => {
    expect(disponibiliteObjet("rendre-unique", { ...base, entites: 1, objets: 1, partages: 0 }).motif).toBe("planche.objets.motif.unique");
    expect(disponibiliteObjet("rendre-unique", { ...base, entites: 1, objets: 1, partages: 1 }).disponible).toBe(true);
    expect(disponibiliteObjet("diviser", { ...base, entites: 1 }).motif).toBe("planche.objets.motif.arete");
    expect(disponibiliteObjet("diviser", { ...base, entites: 1, aretes: 1 }).disponible).toBe(true);
    expect(disponibiliteObjet("diviser-courbe", { ...base, entites: 1, aretes: 1 }).motif).toBe("planche.objets.motif.courbe");
    expect(disponibiliteObjet("diviser-courbe", { ...base, entites: 1, aretes: 1, courbes: 1 }).disponible).toBe(true);
    // Les commandes d'arête sont contextuelles (barre d'actions), les commandes d'objet toujours présentes.
    expect(COMMANDES_OBJETS.filter((c) => c.contextuelle).map((c) => c.id)).toEqual(["diviser", "diviser-courbe"]);
  });

  it("grouper une surface liée à son arête rompt le lien, et le nombre de liens rompus est compté", () => {
    const ligne = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const a = Object.keys(contexte(ligne).aretes)[0]!;
    const tiree = etirerAretes(ligne, [a], v3(0, 0, 2)).modele;
    expect(Object.keys(tiree.annotations?.extrusions ?? {})).toHaveLength(1);
    const c = contexte(tiree);
    const g = grouper(tiree, [...Object.keys(c.faces), ...Object.keys(c.aretes)]);
    expect(liensRompus(tiree, g.modele)).toBe(1);
    expect(liensRompus(ligne, tiree)).toBe(0);
  });
});

describe("Fil d'Ariane (Objets O-2)", () => {
  it("racine, puis chaque objet du chemin dans l'ordre", () => {
    const noms: Record<string, string> = { a: "Établi", b: "Cadre" };
    expect(filAriane(["a", "b"], (id) => noms[id]!, "Planche")).toEqual([
      { id: undefined, nom: "Planche" },
      { id: "a", nom: "Établi" },
      { id: "b", nom: "Cadre" },
    ]);
    expect(filAriane([], (id) => id, "Planche")).toEqual([{ id: undefined, nom: "Planche" }]);
  });
});

describe("Commandes du Navigateur (Objets O-4)", () => {
  it("disponibilités : groupe vide toujours (hors lecture), déplacer des objets seuls et non verrouillés, renommer un seul objet", () => {
    expect(disponibiliteNavigateur("groupe-vide", base).disponible).toBe(true);
    expect(disponibiliteNavigateur("groupe-vide", { ...base, lecture: true }).motif).toBe("planche.objets.motif.lecture");
    expect(disponibiliteNavigateur("deplacer-vers", { ...base, entites: 2, objets: 1 }).motif).toBe("planche.objets.motif.deplacer");
    expect(disponibiliteNavigateur("deplacer-vers", { ...base, entites: 1, objets: 1, verrouilles: true }).motif).toBe("planche.objets.motif.verrouille");
    expect(disponibiliteNavigateur("deplacer-vers", { ...base, entites: 2, objets: 2 }).disponible).toBe(true);
    expect(disponibiliteNavigateur("renommer", { ...base, entites: 2, objets: 2 }).motif).toBe("planche.objets.motif.renommer");
    expect(disponibiliteNavigateur("renommer", { ...base, entites: 1, objets: 1 }).disponible).toBe(true);
  });
  it("cibles de « Déplacer vers… » : ni l'objet déplacé, ni son contenu, ni le contexte de départ ; la racine si l'on part d'un groupe", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const c0 = contexte(m0);
    const a = grouper(m0, [...Object.keys(c0.faces), ...Object.keys(c0.aretes)]);
    const b = grouper(a.modele, [a.occurrence]);
    const vide = grouperVide(b.modele);
    const nom = (id: string) => id;
    expect(ciblesDeplacement(vide.modele, [b.occurrence], undefined, nom, "Planche").map((c) => c.id)).toEqual([vide.occurrence]);
    expect(ciblesDeplacement(vide.modele, [a.occurrence], b.occurrence, nom, "Planche").map((c) => c.id)).toEqual([undefined, vide.occurrence]);
  });
});

describe("Commandes de vue (Objets O-5)", () => {
  it("Isoler : avec une sélection ou pour lever l'isolement ; Masquer le reste : dans un objet ouvert", () => {
    expect(disponibiliteVue("isoler", { entites: 0, isole: false, dansObjet: false }).motif).toBe("planche.objets.motif.isoler");
    expect(disponibiliteVue("isoler", { entites: 2, isole: false, dansObjet: false }).disponible).toBe(true);
    expect(disponibiliteVue("isoler", { entites: 0, isole: true, dansObjet: false }).disponible).toBe(true);
    expect(disponibiliteVue("masquer-reste", { entites: 0, isole: false, dansObjet: false }).motif).toBe("planche.contexte.motif");
    expect(disponibiliteVue("masquer-reste", { entites: 0, isole: false, dansObjet: true }).disponible).toBe(true);
  });
});

describe("Cibles de « Déplacer vers… » — revue de la PR (O-4)", () => {
  it("ni l'autre occurrence du composant ouvert, ni une définition contenue par l'objet déplacé", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const c0 = contexte(m0);
    const x = grouper(m0, [...Object.keys(c0.faces), ...Object.keys(c0.aretes)]);
    const k = grouper(x.modele, [x.occurrence], { genre: "composant" });
    const m = copier(k.modele, [k.occurrence], v3(5, 0, 0)).modele;
    const k2 = Object.keys(contexte(m).occurrences).find((id) => id !== k.occurrence)!;
    const nom = (id: string) => id;
    expect(ciblesDeplacement(m, [x.occurrence], k.occurrence, nom, "Planche").map((c) => c.id)).toEqual([undefined]);
    // Depuis la racine, ranger le composant K dans sa copie (même définition, donc cycle) n'est pas proposé.
    expect(ciblesDeplacement(m, [k.occurrence], undefined, nom, "Planche").map((c) => c.id)).not.toContain(k2);
  });
});
