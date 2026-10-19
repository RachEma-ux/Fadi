/**
 * I.4-01 / I.4-02 (NAV-005) : les quatre domaines affichés sont exactement ceux de la référence — Définition
 * officielle du Studio V2.1 (REF-01 §02, « Organisation fonctionnelle »), lue ici dans sa carte interactive versionnée
 * `Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html` — et les deux planches n'existent que dans « Dessin et
 * modélisation ». Aucune commande nouvelle : le choix de planche reprend le raccourci de la bascule « Vue 3D ».
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { AccesDocumentation, NavigationDomaines, SectionDomaine, SelecteurPlanche } from "./DomainesStudio";
import { domaineDeFonction, DOMAINES_STUDIO, estDomaineStudio, estPlancheStudio, FONCTIONS_STUDIO, PLANCHES_STUDIO } from "./domaines";

const REFERENCE = readFileSync(new URL("../../../../../../Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html", import.meta.url), "utf8");

describe("domaines fonctionnels du Studio (REF-01 §02)", () => {
  it("quatre domaines, dans l'ordre, nommés et décrits mot pour mot comme la référence", () => {
    expect(DOMAINES_STUDIO.map((d) => d.numero)).toEqual(["01", "02", "03", "04"]);
    expect(REFERENCE).toContain("L’organisation de référence comprend quatre domaines fonctionnels");
    for (const d of DOMAINES_STUDIO) {
      expect(REFERENCE, d.libelleFR).toContain(`"label":"${d.numero} · ${d.libelleFR}"`);
      expect(REFERENCE, d.responsabiliteFR).toContain(`RESPONSABILITÉ : ${d.responsabiliteFR}`);
    }
    // Aucun cinquième domaine : la référence n'en numérote pas d'autre.
    expect(REFERENCE).not.toMatch(/"label":"05 · /);
  });

  it("les deux planches (Planche 2D, Planche 3D) appartiennent seulement à Dessin et modélisation", () => {
    expect(REFERENCE).toContain("deux planches de travail complètes : Planche 2D et Planche 3D");
    expect(PLANCHES_STUDIO.map((p) => p.libelleFR)).toEqual(["Planche 2D", "Planche 3D"]);
    expect(new Set(PLANCHES_STUDIO.map((p) => p.domaine))).toEqual(new Set(["dessin"]));
    expect(DOMAINES_STUDIO.find((d) => d.id === "dessin")?.libelleFR).toBe("Dessin et modélisation");
    expect(domaineDeFonction("planche-2d")).toBe("dessin");
    expect(domaineDeFonction("planche-3d")).toBe("dessin");
    // Aucune autre fonction n'est une planche.
    expect(Object.entries(FONCTIONS_STUDIO).filter(([f]) => f.startsWith("planche")).map(([, d]) => d)).toEqual(["dessin", "dessin"]);
  });

  it("chaque fonction livrée est rangée sous son domaine", () => {
    expect(domaineDeFonction("exigences")).toBe("bim");
    expect(domaineDeFonction("scenes")).toBe("visualisation");
    for (const f of ["feuilles", "dossiers", "metre", "commentaires", "observations", "revisions", "publications"] as const) expect(domaineDeFonction(f), f).toBe("documentation");
    for (const d of Object.values(FONCTIONS_STUDIO)) expect(estDomaineStudio(d)).toBe(true);
    // Chaque domaine porte au moins une fonction.
    for (const d of DOMAINES_STUDIO) expect(Object.values(FONCTIONS_STUDIO), d.id).toContain(d.id);
  });

  it("identifiants d'adresse : seuls les quatre domaines et les deux planches sont reconnus", () => {
    expect(DOMAINES_STUDIO.map((d) => d.id)).toEqual(["dessin", "bim", "visualisation", "documentation"]);
    for (const x of ["", "Dessin", "dessin ", "atelier", "parcours"]) expect(estDomaineStudio(x), x).toBe(false);
    expect(["2d", "3d"].every(estPlancheStudio)).toBe(true);
    for (const x of ["", "2D", "4d"]) expect(estPlancheStudio(x), x).toBe(false);
  });
});

describe("présentation des domaines", () => {
  it("navigation : quatre liens internes nommés par la référence, l'actif marqué aria-current", () => {
    const html = renderToStaticMarkup(createElement(NavigationDomaines, { actif: "bim", surChoix: () => {} }));
    expect(html).toContain('aria-label="Domaines du Studio"');
    expect(html.match(/<a /g)).toHaveLength(4);
    for (const d of DOMAINES_STUDIO) {
      expect(html).toContain(`href="#studio-domaine-${d.id}"`);
      expect(html).toContain(`<span>${d.libelleFR}</span>`);
    }
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*data-studio-domaine-lien="bim"/);
  });

  it("section : titre du domaine (visible ou réservé aux technologies d'assistance) et responsabilité", () => {
    const visible = renderToStaticMarkup(createElement(SectionDomaine, { id: "documentation", actif: true, children: null }));
    expect(visible).toContain('aria-labelledby="studio-domaine-documentation-titre"');
    expect(visible).toContain("data-studio-domaine-actif");
    expect(visible).toContain("Produire les documents, quantités, observations, revues et publications.");
    const dessin = renderToStaticMarkup(createElement(SectionDomaine, { id: "dessin", actif: false, titreVisible: false, children: null }));
    expect(dessin).toContain('<h2 id="studio-domaine-dessin-titre" class="sr-only" tabindex="-1">Dessin et modélisation</h2>');
    // Le titre (et non la section) reçoit le focus quand le domaine est choisi.
    expect(visible).toMatch(/<h2 id="studio-domaine-documentation-titre" tabindex="-1">/);
    expect(visible).not.toMatch(/<section[^>]*tabindex/);
    expect(dessin).not.toContain("data-studio-domaine-actif");
  });

  it("choix de planche : deux boutons enfoncés ou non, raccourci de la bascule existante « Vue 3D » (aucune commande nouvelle)", () => {
    const html = renderToStaticMarkup(createElement(SelecteurPlanche, { active: "3d", surChoix: () => {} }));
    const bascule = COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!;
    expect(bascule.raccourci).toBe("Shift+D");
    expect(html.match(/aria-keyshortcuts="Shift\+D"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-studio-planche="3d"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-studio-planche="2d"/);
  });

  it("documentation : les accès lancent les commandes existantes, avec leur icône et leur raccourci", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AccesDocumentation, {
      commandes: ["feuille", "dossier"], disponible: (c) => c.id === "feuille", surCommande: () => {}, publications: "/studio/projets/p/etudes/s",
    })));
    expect(html).toMatch(/aria-keyshortcuts="Shift\+P"[^>]*data-studio-domaine-commande="feuille"/);
    expect(html).toMatch(/disabled=""[^>]*aria-keyshortcuts="Control\+Shift\+D"[^>]*data-studio-domaine-commande="dossier"/);
    expect(html.match(/<svg/g)?.length).toBe(2);
    expect(html).toContain('href="/studio/projets/p/etudes/s"');
  });
});
