/**
 * Navigation de l'outil de la Console : rail des panneaux (ordre, icônes existantes, panneaux d'étude marqués
 * indisponibles), panneau montré par défaut et après un choix, raccourcis Ctrl+Maj+chiffre, et rendu (règle d'or : chaque
 * bouton du rail a son icône, son nom accessible et son raccourci ; la recherche d'outil ouvre la palette Ctrl+K).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { panneauxDuDomaine, type FonctionStudio } from "../domaines/domaines";
import { DOMAINES_STUDIO } from "../domaines/definitions";
import { ContexteTiroirPanneaux, PanneauLateral } from "../espace/EspaceStudio";
import { cibleRaccourci } from "../planche2d/raccourcis";
import { ICONES_PANNEAUX, indexRaccourciPanneau, panneauActif, panneauxDuRail, raccourciPanneau, RailPanneaux, RechercheOutil, ReperesCanevas } from "./navigation-console";

const TITRES: Partial<Record<FonctionStudio, string>> = { elements: "Éléments", exigences: "Propriétés et exigences", metre: "Quantités" };
const INDISPONIBLES = new Set<FonctionStudio>(["exigences", "publications", "commentaires-observations", "revisions", "metre"]);
const rail = (d: (typeof DOMAINES_STUDIO)[number]["id"], vue3d = false) =>
  panneauxDuRail(d, { vue3d, titres: TITRES, indisponibles: INDISPONIBLES, panneaux: panneauxDuDomaine(d) });
const touche = (code: string, o: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) =>
  ({ altKey: false, shiftKey: true, ctrlKey: true, metaKey: false, code, ...o });

describe("Console — rail des panneaux", () => {
  it("Dessin : Propriétés, Planche 3D seulement en 3D, puis les panneaux du domaine", () => {
    expect(rail("dessin").map((p) => p.id)).toEqual(["proprietes", "elements"]);
    expect(rail("dessin", true).map((p) => p.id)).toEqual(["proprietes", "volume-3d", "elements"]);
    expect(rail("dessin").find((p) => p.id === "elements")?.titre).toBe("Éléments");
  });

  it("chaque domaine a au moins un panneau, chacun avec une icône du jeu existant", () => {
    for (const d of DOMAINES_STUDIO) {
      const r = rail(d.id, true);
      expect(r.length, d.id).toBeGreaterThan(0);
      for (const p of r) expect(Object.values(ICONES_PANNEAUX), `${d.id}/${p.id}`).toContain(p.icone);
    }
  });

  it("les panneaux qui lisent une étude sont marqués indisponibles, jamais retirés", () => {
    const doc = rail("documentation");
    expect(doc.map((p) => p.id)).toEqual(panneauxDuDomaine("documentation"));
    expect(doc.every((p) => p.indisponible)).toBe(true);
    expect(rail("dessin").some((p) => p.indisponible)).toBe(false);
  });

  it("panneau montré : premier par défaut, choix conservé s'il existe, tiroir fermé sur null", () => {
    const r = rail("dessin", true);
    expect(panneauActif(r, undefined)).toBe("proprietes");
    expect(panneauActif(r, "volume-3d")).toBe("volume-3d");
    expect(panneauActif(rail("dessin"), "volume-3d")).toBe("proprietes");
    expect(panneauActif(r, null)).toBeNull();
    expect(panneauActif([], undefined)).toBeNull();
  });

  it("raccourcis Ctrl+Maj+1 à Ctrl+Maj+9 (Cmd vaut Ctrl), par la touche physique, hors table clavier de Studio", () => {
    expect(raccourciPanneau(0)).toBe("Ctrl+Shift+1");
    expect(raccourciPanneau(8)).toBe("Ctrl+Shift+9");
    for (let i = 0; i < 9; i++) expect(cibleRaccourci(raccourciPanneau(i))).toBeNull();
    expect(indexRaccourciPanneau(touche("Digit2", { ctrlKey: false, metaKey: true }))).toBe(1);
    expect(raccourciPanneau(9)).toBeNull();
    expect(indexRaccourciPanneau(touche("Digit1"))).toBe(0);
    expect(indexRaccourciPanneau(touche("Numpad3"))).toBe(2);
    expect(indexRaccourciPanneau(touche("Digit0"))).toBeNull();
    expect(indexRaccourciPanneau(touche("Digit1", { shiftKey: false }))).toBeNull();
    expect(indexRaccourciPanneau(touche("Digit1", { altKey: true }))).toBeNull();
    expect(indexRaccourciPanneau(touche("Digit1", { ctrlKey: false }))).toBeNull();
    expect(indexRaccourciPanneau(touche("KeyA"))).toBeNull();
  });
});

describe("Console — rendu de la navigation", () => {
  it("rail : un bouton par panneau, icône, nom, raccourci, état enfoncé", () => {
    const html = renderToStaticMarkup(createElement(RailPanneaux, { panneaux: rail("bim"), actif: "exigences", surChoix: () => {} }));
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('data-studio-rail-panneau="exigences"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-keyshortcuts="Control+Shift+1"');
    expect(html).toContain("Ctrl+Maj+1");
    expect(html).toContain("(indisponible dans la Console)");
    expect(html).toContain("<svg");
  });

  it("recherche d'outil : icône, nom et raccourci de la palette de commandes", () => {
    const html = renderToStaticMarkup(createElement(RechercheOutil, { surOuvrir: () => {} }));
    expect(html).toContain('aria-label="Rechercher un outil"');
    expect(html).toContain('aria-keyshortcuts="Control+K"');
    expect(html).toContain("<svg");
  });

  it("repères du canevas : contexte hors projet et outil actif avec son raccourci", () => {
    const html = renderToStaticMarkup(createElement(ReperesCanevas, { planche: "Planche 2D", enAttente: 2, outil: "Ligne", raccourci: "L", aide: "Cliquez le premier point." }));
    expect(html).toContain("Hors projet");
    expect(html).toContain("Planche 2D");
    expect(html).toContain("modifications non enregistrées");
    expect(html).toContain("<strong>Ligne</strong>");
    expect(html).toContain("<kbd>L</kbd>");
    expect(renderToStaticMarkup(createElement(ReperesCanevas, { planche: "Planche 2D", enAttente: 0, outil: "Sélection", raccourci: null, aide: "" }))).toContain("aucune modification");
  });

  it("tiroir : seul le panneau choisi est montré, avec un bouton de fermeture ; sans tiroir, panneau repliable inchangé", () => {
    const panneau = (id: string) => createElement(PanneauLateral, { id, titre: id === "a" ? "Alpha" : "Bêta", children: "contenu" });
    const html = renderToStaticMarkup(createElement(ContexteTiroirPanneaux.Provider, { value: { actif: "a", fermer: () => {} } }, panneau("a"), panneau("b")));
    expect(html).toMatch(/data-studio-panneau="a" data-studio-panneau-ouvert=""[^>]*>/);
    expect(html).toMatch(/data-studio-panneau="b"[^>]*hidden=""/);
    expect(html).toContain('aria-label="Fermer le panneau Alpha"');
    const seul = renderToStaticMarkup(panneau("a"));
    expect(seul).toContain("data-studio-panneau-bascule");
    expect(seul).not.toContain("data-studio-tiroir-fermer");
  });
});
