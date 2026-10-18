import { describe, expect, it } from "vitest";
import { studioRegistre } from "@parcours/domain-model";
import { combinaison, COMMANDES_2D, entreeParRaccourci, OUTILS_2D, raccourciIgnore } from "./outils-2d";

const toutes = [...OUTILS_2D, ...COMMANDES_2D];
const cle = (key: string, m: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...m });

describe("Planche 2D de Studio — règle d'or", () => {
  it("chaque outil et chaque commande a sa propre icône, une barre et un raccourci unique", () => {
    expect(new Set(toutes.map((x) => x.icone)).size).toBe(toutes.length);
    expect(new Set(toutes.flatMap((x) => [x.raccourci, ...(x.autres ?? [])])).size).toBe(toutes.reduce((n, x) => n + 1 + (x.autres?.length ?? 0), 0));
    for (const x of toutes) {
      expect(x.icone.length, x.id).toBeGreaterThan(0);
      expect(["outils", "edition", "vue"], x.id).toContain(x.barre);
      expect(entreeParRaccourci(x.raccourci)?.id, x.id).toBe(x.id);
    }
  });

  it("Rectangle (R) et Déplacer (M) : leur propre icône, la barre Outils, leur raccourci", () => {
    expect(OUTILS_2D.map((x) => x.id)).toEqual(["selection", "ligne", "rectangle", "cote", "deplacer"]);
    expect(entreeParRaccourci("R")).toEqual({ type: "outil", id: "rectangle" });
    expect(entreeParRaccourci("M")).toEqual({ type: "outil", id: "deplacer" });
    for (const id of ["rectangle", "deplacer"]) expect(OUTILS_2D.find((x) => x.id === id)).toMatchObject({ barre: "outils", ecrit: true });
  });

  it("lecture du clavier : Espace, L, Maj+C, Ctrl+Z, Ctrl+Maj+Z, Suppr ; modificateur seul ignoré", () => {
    expect(combinaison(cle(" "))).toBe("Espace");
    expect(combinaison(cle("l"))).toBe("L");
    expect(combinaison(cle("r"))).toBe("R");
    expect(combinaison(cle("m"))).toBe("M");
    expect(combinaison(cle("C", { shiftKey: true }))).toBe("Maj+C");
    expect(combinaison(cle("z", { ctrlKey: true }))).toBe("Ctrl+Z");
    expect(combinaison(cle("Z", { metaKey: true, shiftKey: true }))).toBe("Ctrl+Maj+Z");
    expect(combinaison(cle("Delete"))).toBe("Suppr");
    expect(combinaison(cle("Shift", { shiftKey: true }))).toBeNull();
    expect(entreeParRaccourci("Ctrl+Maj+Z")).toEqual({ type: "commande", id: "retablir" });
    expect(entreeParRaccourci("Q")).toBeNull();
  });

  it("un raccourci global ne détourne ni la saisie ni l'activation d'un bouton ou d'un lien", () => {
    expect(raccourciIgnore(null, "Espace")).toBe(false);
    expect(raccourciIgnore({ tagName: "BODY" }, "Espace")).toBe(false);
    expect(raccourciIgnore({ tagName: "INPUT" }, "Ctrl+Z")).toBe(true);
    expect(raccourciIgnore({ tagName: "DIV", isContentEditable: true }, "L")).toBe(true);
    for (const cible of [{ tagName: "BUTTON" }, { tagName: "A" }, { tagName: "DIV", role: "button" }]) {
      expect(raccourciIgnore(cible, "Espace")).toBe(true);
      expect(raccourciIgnore(cible, "Retour")).toBe(true);
      expect(raccourciIgnore(cible, "L")).toBe(true);
      expect(raccourciIgnore(cible, "Ctrl+S")).toBe(false);
      expect(raccourciIgnore(cible, "Échap")).toBe(false);
    }
  });
});

describe("Planche 2D de Studio — registre unique des outils", () => {
  const registre = studioRegistre.REGISTRE_OUTILS_STUDIO.filter((o) => o.domaine === "dessin");

  it("chaque outil de l'éditeur correspond à exactement une entrée du registre, et réciproquement", () => {
    for (const x of OUTILS_2D) expect(registre.filter((o) => o.id === x.registre), x.id).toHaveLength(1);
    for (const o of registre) expect(OUTILS_2D.filter((x) => x.registre === o.id), o.id).toHaveLength(1);
    expect(new Set(OUTILS_2D.map((x) => x.registre)).size).toBe(OUTILS_2D.length);
  });

  it("identifiant, libellé et raccourci viennent du registre ; aucune exposition aux agents", () => {
    for (const x of OUTILS_2D) {
      const o = studioRegistre.outilStudio(x.registre!)!;
      expect(x.libelle).toBe(o.libelle);
      expect(x.raccourci).toBe(o.raccourci);
      expect(o.agentExposure).toBe("none");
      expect(o.id).toBe(`studio.dessin.${x.id}`);
    }
  });
});
