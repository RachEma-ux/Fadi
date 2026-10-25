/**
 * I.1-01 — descripteur Studio selon la relation validée (ADR-STUDIO-NAV-01, option A acceptée, E-B (a)) : Studio est une
 * entrée GLOBALE distincte de `MODULES` (registre des modules du projet). Contrôlé ici : `MODULES` ne contient aucun
 * descripteur Studio (sinon Studio passerait par ProjectShell, ProjectModuleNav et SearchDialog) ; la barre latérale ne
 * pose qu'une seule entrée « Studio » (un seul `MenuStudio`, un seul lien `/studio` marqué `data-nav-studio`) ; aucun
 * second descripteur Studio n'est déclaré ailleurs dans les consommateurs de `MODULES`.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MODULES } from "../modules/module-registry";
import { MenuStudio } from "./MenuStudio";

const lire = (nom: string) => readFileSync(new URL(nom, import.meta.url), "utf8");
const rendre = (adresse: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [adresse] }, createElement(MenuStudio)));

describe("I.1-01 : descripteur Studio global, distinct des modules du projet, sans duplication", () => {
  it("MODULES (modules du projet) ne porte aucun descripteur Studio, et ses identifiants sont uniques", () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODULES.filter((m) => /studio/i.test(m.id) || /^studio$/i.test(m.label.trim()))).toEqual([]);
  });

  it("la barre latérale monte un seul MenuStudio ; il rend une seule entrée « Studio » vers /studio, sur toute adresse", () => {
    const shell = lire("./AppShell.tsx");
    expect(shell.match(/<MenuStudio\b/g)).toHaveLength(1);
    // Aucune autre entrée « Studio » codée en dur dans la barre (le descripteur vit dans MenuStudio seulement).
    expect(shell.match(/aria-label="Studio"/g)).toBeNull();
    for (const adresse of ["/accueil", "/studio", "/studio/projets/p/etudes/s/variantes/v?domaine=bim", "/projets/p?module=atelier"]) {
      const html = rendre(adresse);
      expect(html.match(/data-nav-studio/g), adresse).toHaveLength(1);
      expect(html.match(/<a [^>]*aria-label="Studio"[^>]*>/g), adresse).toHaveLength(1);
      const entree = /<a [^>]*data-nav-studio[^>]*>/.exec(html)?.[0] ?? "";
      expect(entree, adresse).toContain('href="/studio"');
      expect(entree, adresse).toContain('aria-label="Studio"');
    }
  });

  it("les consommateurs de MODULES (ProjectShell, ProjectModuleNav, SearchDialog) ne déclarent aucun descripteur Studio de plus", () => {
    for (const fichier of ["./ProjectShell.tsx", "./ProjectModuleNav.tsx", "../modules/accueil/SearchDialog.tsx"]) {
      const source = lire(fichier);
      expect(source, fichier).not.toMatch(/id:\s*["']studio["']/);
      expect(source, fichier).not.toMatch(/module=studio/);
    }
  });
});
