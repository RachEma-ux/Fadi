import { describe, expect, it } from "vitest";
import { ajouterSegment, contexte, etirerAretes, grouper, modeleVide, v3 } from "@parcours/planche-model";
import { COMMANDES_OBJETS, disponibiliteObjet, filAriane, liensRompus } from "./commandes-objets";

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
