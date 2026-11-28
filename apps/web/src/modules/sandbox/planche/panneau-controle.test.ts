import { describe, expect, it } from "vitest";
import { v3 } from "@parcours/sandbox-planche-model";
import { disponibiliteControle } from "./commandes-objets";
import { valeurDefaut } from "./panneau-controle";

const base = { aNettoyer: false, dansObjet: false, lecture: false };

describe("Contrôle, cas 2 lot 3 : disponibilités et affichage des défauts", () => {
  it("parcours seulement avec des défauts ; correction seulement si proposée, hors lecture", () => {
    expect(disponibiliteControle("defaut-suivant", { ...base, defauts: 0 }).disponible).toBe(false);
    expect(disponibiliteControle("defaut-precedent", { ...base, defauts: 3, lecture: true }).disponible).toBe(true);
    expect(disponibiliteControle("corriger-defaut", { ...base, corrigeable: true }).disponible).toBe(true);
    expect(disponibiliteControle("corriger-defaut", { ...base, corrigeable: false }).disponible).toBe(false);
    expect(disponibiliteControle("corriger-defaut", { ...base, corrigeable: true, lecture: true }).disponible).toBe(false);
    expect(disponibiliteControle("pieces-permis", { ...base, lecture: true }).disponible).toBe(true);
  });
  it("fond DAO dans l'objet ouvert ou sur un seul import ; fusion à partir de deux volumes, à la racine", () => {
    expect(disponibiliteControle("preparer-fond-dao", { ...base, dansObjet: true }).disponible).toBe(true);
    expect(disponibiliteControle("preparer-fond-dao", { ...base, objetsSelectionnes: 1 }).disponible).toBe(true);
    expect(disponibiliteControle("preparer-fond-dao", { ...base, objetsSelectionnes: 2 }).disponible).toBe(false);
    expect(disponibiliteControle("fusionner-volumes", { ...base, objetsSelectionnes: 2 }).disponible).toBe(true);
    expect(disponibiliteControle("fusionner-volumes", { ...base, objetsSelectionnes: 2, dansObjet: true }).disponible).toBe(false);
  });
  it("mesure d'un défaut dans l'unité de son genre", () => {
    const d = { ids: [], sommets: [], position: v3(0, 0, 0) };
    expect(valeurDefaut({ ...d, genre: "confondus", valeur: 0.0008 }, ",")).toBe("0,8 mm");
    expect(valeurDefaut({ ...d, genre: "angle-droit", valeur: 89.7 }, ",")).toBe("89,7°");
    expect(valeurDefaut({ ...d, genre: "eloignee", valeur: 2001.4 }, ",")).toBe("2001 m");
  });
});
