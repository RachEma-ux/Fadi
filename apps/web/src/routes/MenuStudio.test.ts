/**
 * Menu « Studio » de la barre latérale : Console, quatre domaines exacts (REF-01 §02, format « 01 · … »), choix d'une
 * étude, dans l'ordre de la capture de référence du 26-11-2026 ; cibles dérivées de l'adresse (même lecture que l'espace : aucun état parallèle).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { choixEtudesStudio, cibleDomaineStudio, domaineAfficheStudio, MenuStudio } from "./MenuStudio";

const V = "/studio/projets/p/etudes/s/variantes/v";
const rendre = (adresse: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [adresse] }, createElement(MenuStudio)));

describe("menu « Studio » de la barre latérale", () => {
  it("quatre entrées de domaine, dans l'ordre officiel et sous leur libellé exact ; Console avant, choix d'une étude après", () => {
    const html = rendre(V);
    const libelles = [...html.matchAll(/data-studio-menu-domaine="[^"]+"[^>]*>|aria-label="([^"]+)"[^>]*data-studio-menu-domaine/g)].map((m) => m[1]).filter(Boolean);
    expect(libelles).toEqual(["01 · Dessin et modélisation", "02 · BIM et coordination", "03 · Visualisation, rendu et immersion", "04 · Documentation, métrés et collaboration"]);
    expect(html.match(/data-studio-menu-domaine=/g)).toHaveLength(4);
    // Ordre du sous-menu : Console, 01 à 04, Choisir une étude ; l'accueil de Studio est l'entrée « Studio » elle-même.
    const ordre = [...html.matchAll(/data-studio-menu-(console|domaine="[a-z]+"|etudes)/g)].map((m) => m[1]);
    expect(ordre).toEqual(["console", 'domaine="dessin"', 'domaine="bim"', 'domaine="visualisation"', 'domaine="documentation"', "etudes"]);
    expect(html).not.toContain("data-studio-menu-accueil");
    expect(/<a [^>]*data-nav-studio[^>]*>/.exec(html)?.[0]).toContain('href="/studio"');
    // Les planches ne sont pas des entrées du menu.
    expect(html).not.toMatch(/Planche 2D|Planche 3D|Double vue/);
    // Déplié sur une route Studio ; le chevron porte aria-expanded.
    expect(html).toMatch(/aria-expanded="true"[^>]*data-studio-menu-lateral-bascule/);
  });

  it("dans une variante : chaque domaine vise la même variante (révision, commentaires et planche gardés), sans garde ; l'affiché est marqué", () => {
    expect(cibleDomaineStudio(V, "?revision=r1&domaine=dessin&planche=3d", "bim")).toEqual({ href: `${V}?revision=r1&domaine=bim`, memeVariante: true });
    expect(cibleDomaineStudio(V, "?domaine=dessin&planche=double", "dessin").href).toBe(`${V}?domaine=dessin&planche=double`);
    expect(domaineAfficheStudio(V, "")).toBe("dessin");
    expect(domaineAfficheStudio(V, "?commentaires=ouverts")).toBe("documentation");
    expect(domaineAfficheStudio(V, "?domaine=visualisation")).toBe("visualisation");
    const html = rendre(`${V}?domaine=bim`);
    expect(html).toMatch(/aria-current="page"[^>]*data-studio-menu-domaine="bim" data-studio-sans-garde=""/);
    expect(html.match(/aria-current="page"[^>]*data-studio-menu-domaine/g)).toHaveLength(1);
  });

  it("hors d'une variante : l'accueil ouvre le domaine (aucune redirection, aucun domaine marqué affiché)", () => {
    expect(cibleDomaineStudio("/studio", "", "documentation")).toEqual({ href: "/studio?domaine=documentation", memeVariante: false });
    expect(domaineAfficheStudio("/studio/projets/p", "")).toBeNull();
    expect(choixEtudesStudio("/studio/projets/p/etudes/s", "")).toEqual({ href: "/studio/projets/p", courant: false });
    expect(choixEtudesStudio("/studio/projets/p", "")).toEqual({ href: "/studio/projets/p", courant: true });
    expect(choixEtudesStudio("/accueil", "")).toEqual({ href: "/studio", courant: false });
    const html = rendre("/accueil");
    expect(html).not.toContain('aria-current="page"');
    expect(html).toMatch(/aria-expanded="false"[^>]*data-studio-menu-lateral-bascule/);
  });

  it("« Console » : un accès permanent vers /studio/console, marqué sur toute adresse de la Console, sans projet", () => {
    const entree = (html: string) => /<a [^>]*data-studio-menu-console[^>]*>/.exec(html)?.[0] ?? "";
    const html = rendre("/studio");
    expect(entree(html)).toContain('href="/studio/console"');
    expect(entree(html)).not.toContain("aria-current");
    // Nom exact et non traduit (« Console » est traduit ailleurs en « Bracket » par le dictionnaire).
    expect(entree(html)).toContain('aria-label="Console"');
    expect(entree(html)).toContain('translate="no"');
    // Première entrée du sous-menu (capture de référence du 26-11-2026), avant les quatre domaines.
    const h0 = rendre("/studio");
    expect(h0.indexOf("data-studio-menu-console")).toBeGreaterThan(h0.indexOf('id="studio-menu-domaines"'));
    expect(h0.indexOf("data-studio-menu-console")).toBeLessThan(h0.indexOf("data-studio-menu-domaine="));
    // `/sandbox` (module Sandbox, lot 1) garde « Console » marqué et le menu déplié, comme l'ancienne adresse.
    for (const adresse of ["/studio/console", "/studio/console/sandbox", "/studio/console/outil?domaine=bim", "/sandbox"]) {
      const h = rendre(adresse);
      expect(entree(h), adresse).toContain('aria-current="page"');
      // Les quatre domaines restent, inchangés.
      expect(h.match(/data-studio-menu-domaine=/g)).toHaveLength(4);
      expect(h, adresse).toMatch(/aria-expanded="true"[^>]*data-studio-menu-lateral-bascule/);
    }
  });
});
