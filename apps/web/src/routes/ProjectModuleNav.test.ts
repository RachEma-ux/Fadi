import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProjectModuleNav } from "./ProjectModuleNav";
import { MODULES } from "../modules/module-registry";
import { IMMERSIVE_CLASS } from "../lib/use-immersive";

const entries = [
  ["accueil", "Accueil du projet"],
  ["pilotage", "Feuille de route"],
  ...MODULES.map((module) => [module.id, module.label]),
];
function render(activeModule: string) {
  return renderToStaticMarkup(createElement(MemoryRouter, {},
    createElement(ProjectModuleNav, {
      projectId: "proj-layout-test", activeModule, onHome: () => undefined, onModule: () => undefined,
    })));
}

describe("Navigation commune des pages du projet", () => {
  it("conserve neuf entrées dans l'ordre approuvé et une seule navigation", () => {
    const html = render("accueil");
    expect((html.match(/<nav\b/g) ?? []).length).toBe(1);
    expect((html.match(/<(?:button|a)\b/g) ?? []).length).toBe(9);
    const offsets = entries.map(([, label]) => html.indexOf(`>${label}</`));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(html).toContain('href="/projets/proj-layout-test/pilotage"');
  });
  it.each(entries)("marque uniquement %s comme page courante", (id, label) => {
    const html = render(id!);
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    const current = html.match(/<(?:button|a)\b[^>]*aria-current="page"[^>]*>([^<]*)<\//);
    expect(current?.[1]).toBe(label);
  });
  it("l'ouverture de l'Atelier n'active plus la classe qui masque Fadi", () => {
    expect(IMMERSIVE_CLASS).toBe("atelier-workspace");
    expect(IMMERSIVE_CLASS).not.toBe("atelier-immersive");
  });
});
