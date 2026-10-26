/**
 * I.4-01 / I.4-02 (NAV-005) : les quatre domaines affichés sont exactement ceux de la référence — Définition
 * officielle du Studio V2.1 (REF-01 §02, « Organisation fonctionnelle »), lue ici dans le document versionné
 * `Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx` (tableau DOMAINE / RESPONSABILITÉ, ligne par ligne) et
 * dans sa carte interactive `Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html` — et les deux planches
 * n'existent que dans « Dessin et modélisation ». Chaque commande de l'éditeur et chaque entrée du catalogue a un
 * domaine (ou « à définir », signalé dans ADR-STUDIO-NAV-01) ; la mise en page des sections est dérivée de ces tables.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { CATALOGUE } from "../planche2d/catalogue";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { STUDIO_PHASES_WORKFLOW, STUDIO_TOOLS } from "@parcours/atelier-model";
import { BarreOutils } from "../planche2d/BarreOutils";
import { ariaRaccourci } from "../planche2d/raccourcis";
import { BandeauHistorique, libelleModePlanche, SOUS_TITRE_PLANCHE, TitreEspace } from "../variante/BandeauVariante";
import { ActionsEspace, libellePhase, PastilleWorkflow, SUGGESTIONS_PHASE } from "../espace/EspaceStudio";
import { ATTRIBUT_SANS_GARDE, lienQuitteLaVariante, resteDansLaVariante } from "../variante/useGardeNavigation";
import { clicSimple, NavigationDomaines, SectionDomaine, SelecteurPlanche } from "./DomainesStudio";
import {
  A_DEFINIR, ACTIONS_ESPACE, commandesDuDomaine, dansPaletteDuDomaine, domaineDeFonction, domaineDeLAdresse, domaineElement, domaineEntree, domaineExecution, DOMAINES_COMMANDES,
  DOMAINES_FAMILLES_OUTILS, DOMAINES_STUDIO, ELEMENTS_COMMUNS, EXTENSIONS_PROPOSEES, estDomaineStudio, estModePlanche, estPlancheStudio, FONCTIONS_STUDIO, fonctionsDuDomaine, MODES_PLANCHE, panneauxDuDomaine, PLANCHES_STUDIO,
} from "./domaines";

const studioDocumentVide = (): StudioDocument => ({ id: "d1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] });
const racine = (chemin: string) => new URL(`../../../../../../${chemin}`, import.meta.url);
const CARTE = readFileSync(racine("Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html"), "utf8");
const ADR = readFileSync(racine("docs/continuity/decisions/ADR-STUDIO-NAV-01.md"), "utf8");
const ESPACE = readFileSync(new URL("../VariantWorkspace.tsx", import.meta.url), "utf8");

/** Lit une entrée d'une archive ZIP (.docx) sans bibliothèque : répertoire central, puis données compressées (deflate). */
function lireZip(fichier: Buffer, nom: string): string {
  const fin = fichier.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = fichier.readUInt32LE(fin + 16);
  for (let n = fichier.readUInt16LE(fin + 10); n > 0; n--) {
    const methode = fichier.readUInt16LE(p + 10), taille = fichier.readUInt32LE(p + 20), lNom = fichier.readUInt16LE(p + 28), lExtra = fichier.readUInt16LE(p + 30), lCom = fichier.readUInt16LE(p + 32);
    const local = fichier.readUInt32LE(p + 42);
    if (fichier.toString("utf8", p + 46, p + 46 + lNom) === nom) {
      const debut = local + 30 + fichier.readUInt16LE(local + 26) + fichier.readUInt16LE(local + 28);
      const donnees = fichier.subarray(debut, debut + taille);
      return (methode === 8 ? inflateRawSync(donnees) : donnees).toString("utf8");
    }
    p += 46 + lNom + lExtra + lCom;
  }
  throw new Error(`${nom} absent de l'archive`);
}
/** Lignes des tableaux du document Word : texte de chaque cellule (runs concaténés, espaces normalisés). */
function lignesTableaux(xml: string): string[][] {
  const texte = (x: string) => [...x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").replace(/\s+/g, " ").trim();
  return [...xml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((tr) => [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((tc) => texte(tc[0])));
}
const DOCX = lireZip(readFileSync(racine("Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx")), "word/document.xml");
const LIGNES = lignesTableaux(DOCX);

describe("domaines fonctionnels du Studio (REF-01 §02)", () => {
  it("document de référence (.docx) : tableau DOMAINE / RESPONSABILITÉ, chaque ligne exactement « numéro · domaine » | responsabilité", () => {
    const entete = LIGNES.findIndex((l) => l.length === 2 && l[0] === "DOMAINE" && l[1] === "RESPONSABILITÉ");
    expect(entete, "en-tête du tableau").toBeGreaterThanOrEqual(0);
    const lignes = LIGNES.slice(entete + 1, entete + 1 + DOMAINES_STUDIO.length);
    expect(lignes).toEqual(DOMAINES_STUDIO.map((d) => [`${d.numero} · ${d.libelleFR}`, d.responsabiliteFR]));
    // Le tableau n'a pas de cinquième domaine (la ligne suivante, s'il y en a une, n'est pas numérotée « 05 · »).
    expect(LIGNES[entete + 1 + DOMAINES_STUDIO.length]?.[0] ?? "").not.toMatch(/^05 · /);
  });

  it("carte interactive : même ligne de tableau, domaine et responsabilité appariés, délimiteurs compris", () => {
    expect(DOMAINES_STUDIO.map((d) => d.numero)).toEqual(["01", "02", "03", "04"]);
    expect(CARTE).toContain("L’organisation de référence comprend quatre domaines fonctionnels");
    for (const d of DOMAINES_STUDIO) {
      const ligne = `{"label":"${d.numero} · ${d.libelleFR}","children":[{"label":"RESPONSABILITÉ : ${d.responsabiliteFR}","kind":"text",`;
      expect(CARTE.split(ligne).length - 1, d.libelleFR).toBe(1);
    }
    expect(CARTE).not.toMatch(/"label":"05 · /);
  });

  it("les deux planches (Planche 2D, Planche 3D) appartiennent seulement à Dessin et modélisation", () => {
    expect(DOCX.replace(/<[^>]+>/g, "")).toContain("deux planches de travail complètes : Planche 2D et Planche 3D");
    expect(PLANCHES_STUDIO.map((p) => p.libelleFR)).toEqual(["Planche 2D", "Planche 3D"]);
    expect(new Set(PLANCHES_STUDIO.map((p) => p.domaine))).toEqual(new Set(["dessin"]));
    expect(domaineDeFonction("planches")).toBe("dessin");
  });

  it("identifiants d'adresse : seuls les quatre domaines et les deux planches sont reconnus", () => {
    expect(DOMAINES_STUDIO.map((d) => d.id)).toEqual(["dessin", "bim", "visualisation", "documentation"]);
    for (const x of ["", "Dessin", "dessin ", "atelier", "parcours", A_DEFINIR]) expect(estDomaineStudio(x), x).toBe(false);
    expect(["2d", "3d"].every(estPlancheStudio)).toBe(true);
    for (const x of ["", "2D", "4d"]) expect(estPlancheStudio(x), x).toBe(false);
  });
});

describe("rattachement exhaustif aux domaines (I-1)", () => {
  const valeurs = new Set<string>([...DOMAINES_STUDIO.map((d) => d.id), A_DEFINIR]);

  it("chaque commande de COMMANDES_EDITEUR a exactement une entrée de domaine, et aucune entrée n'est orpheline", () => {
    expect(Object.keys(DOMAINES_COMMANDES).sort()).toEqual(COMMANDES_EDITEUR.map((c) => c.id).sort());
    for (const [id, d] of Object.entries(DOMAINES_COMMANDES)) expect(valeurs.has(d), id).toBe(true);
  });

  it("chaque entrée du CATALOGUE (outils du registre et commandes) a un domaine", () => {
    expect(CATALOGUE.length).toBeGreaterThan(COMMANDES_EDITEUR.length);
    for (const e of CATALOGUE) expect(valeurs.has(domaineEntree(e)), e.identifiant).toBe(true);
    const familles = new Set(CATALOGUE.flatMap((e) => (e.outil ? [e.outil.groupe] : [])));
    expect(Object.keys(DOMAINES_FAMILLES_OUTILS).sort()).toEqual([...familles].sort());
  });

  it("domaines fixés par la lecture de REF-01 ; ce qu'elle ne fixe pas reste « à définir » (exports, import, matrice d'échanges, système d'outils)", () => {
    const aDefinir = COMMANDES_EDITEUR.filter((c) => DOMAINES_COMMANDES[c.id] === A_DEFINIR).map((c) => c.id);
    expect(aDefinir.sort()).toEqual(["echanges", "exporter-dxf", "exporter-ifc", "exporter-png", "exporter-svg", "importer-dxf", "importer-ifc", "modeles-externes", "outils", "palette"]);
    expect(commandesDuDomaine("documentation")).toEqual(["agents", "feuille", "dossier", "approuver"]);
    expect(commandesDuDomaine("bim")).toEqual(["exigences"]);
    expect(commandesDuDomaine("visualisation")).toEqual(["illustration"]);
    expect(DOMAINES_COMMANDES["vue-3d"]).toBe("dessin");
    expect(DOMAINES_FAMILLES_OUTILS.proprietes).toBe("bim");
    expect(DOMAINES_FAMILLES_OUTILS.visualisation).toBe("visualisation");
    // Chaque domaine « à définir » est posé en question au maître d'ouvrage dans l'ADR, par son nom.
    const question = ADR.slice(ADR.indexOf("Domaine « à définir »"));
    expect(question.length).toBeLessThan(ADR.length);
    for (const id of aDefinir) expect(question, id).toContain(COMMANDES_EDITEUR.find((c) => c.id === id)!.libelleFR);
  });

  it("chaque bloc de l'espace est rangé sous un domaine ; chaque domaine en porte au moins un ; la mise en page lit ces tables", () => {
    for (const d of Object.values(FONCTIONS_STUDIO)) expect(estDomaineStudio(d)).toBe(true);
    for (const d of DOMAINES_STUDIO) expect(fonctionsDuDomaine(d.id).length, d.id).toBeGreaterThan(0);
    expect(fonctionsDuDomaine("dessin")).toEqual(["outils", "planches", "portee-annuler", "elements"]);
    expect(fonctionsDuDomaine("bim")).toEqual(["exigences"]);
    expect(fonctionsDuDomaine("visualisation")).toEqual(["scenes-rendus"]);
    expect(fonctionsDuDomaine("documentation")).toEqual(["publications", "commentaires-observations", "revisions", "metre"]);
    // Panneaux latéraux : tous les blocs sauf la palette, le canevas et la barre d'état.
    expect(panneauxDuDomaine("dessin")).toEqual(["elements"]);
    expect(panneauxDuDomaine("documentation")).toEqual(["publications", "commentaires-observations", "revisions", "metre"]);
    // L'espace rend panneaux et palette depuis ces tables, sans liste manuelle de commandes.
    expect(ESPACE).toContain("panneauxDuDomaine(d.id)");
    expect(ESPACE).toContain("FILTRES_PALETTE[domaineActif]");
    expect(ESPACE).not.toMatch(/commandes=\{\[/);
    for (const f of Object.keys(FONCTIONS_STUDIO)) expect(ESPACE, f).toContain(`case "${f}":`);
  });
});

describe("palette d'un domaine et actions de l'espace", () => {
  const elementsRegistre = [
    ...STUDIO_TOOLS.map((t) => ({ type: "outil" as const, id: t.toolId as string })),
    ...COMMANDES_EDITEUR.map((c) => ({ type: "commande" as const, id: c.id as string })),
  ];

  it("les actions de l'espace (Annuler, Rétablir, Enregistrer, Outils, palette) ne sont dans aucune palette", () => {
    expect([...ACTIONS_ESPACE]).toEqual(["annuler", "retablir", "enregistrer", "outils", "palette"]);
    for (const d of DOMAINES_STUDIO) for (const id of ACTIONS_ESPACE) expect(dansPaletteDuDomaine({ type: "commande", id }, d.id), `${d.id}:${id}`).toBe(false);
  });

  it("chaque outil et chaque commande est atteignable depuis son domaine (palette ou barre de l'espace)", () => {
    for (const e of elementsRegistre) {
      const d = domaineElement(e);
      if (d === A_DEFINIR) {
        // « À définir » : proposé dans chaque domaine (ou dans la barre de l'espace pour Outils et la palette).
        for (const x of DOMAINES_STUDIO) expect(dansPaletteDuDomaine(e, x.id) || ACTIONS_ESPACE.includes(e.id as never), `${x.id}:${e.id}`).toBe(true);
      } else {
        expect(dansPaletteDuDomaine(e, d) || ACTIONS_ESPACE.includes(e.id as never), e.id).toBe(true);
      }
    }
  });

  it("une palette ne montre que son domaine, les éléments communs (sélection, vue) et ceux « à définir »", () => {
    expect(dansPaletteDuDomaine({ type: "outil", id: "studio.dessin.ligne" }, "bim")).toBe(false);
    expect(dansPaletteDuDomaine({ type: "outil", id: "studio.propriete.definir" }, "bim")).toBe(true);
    expect(dansPaletteDuDomaine({ type: "outil", id: "studio.propriete.definir" }, "dessin")).toBe(false);
    expect(dansPaletteDuDomaine({ type: "outil", id: "studio.scene.creer" }, "visualisation")).toBe(true);
    expect(dansPaletteDuDomaine({ type: "outil", id: "studio.scene.creer" }, "dessin")).toBe(false);
    expect(dansPaletteDuDomaine({ type: "commande", id: "feuille" }, "documentation")).toBe(true);
    expect(dansPaletteDuDomaine({ type: "commande", id: "feuille" }, "dessin")).toBe(false);
    for (const d of DOMAINES_STUDIO) {
      for (const id of ELEMENTS_COMMUNS) expect(dansPaletteDuDomaine({ type: id.startsWith("studio.") ? "outil" : "commande", id }, d.id), `${d.id}:${id}`).toBe(true);
      expect(dansPaletteDuDomaine({ type: "commande", id: "exporter-ifc" }, d.id)).toBe(true);
    }
  });

  it("un outil d'un autre domaine (raccourci, palette) ouvre son domaine ; un élément de la palette active reste sur place", () => {
    expect(domaineExecution({ type: "outil", id: "studio.dessin.ligne" }, "bim")).toBe("dessin");
    expect(domaineExecution({ type: "outil", id: "studio.scene.creer" }, "dessin")).toBe("visualisation");
    expect(domaineExecution({ type: "commande", id: "exigences" }, "dessin")).toBe("bim");
    // Boîtes de dialogue : ouvertes par-dessus le domaine affiché (le focus revient à son origine).
    expect(domaineExecution({ type: "commande", id: "feuille" }, "bim")).toBe("bim");
    expect(domaineExecution({ type: "commande", id: "dossier" }, "dessin")).toBe("dessin");
    expect(domaineExecution({ type: "commande", id: "zoom-avant" }, "documentation")).toBe("documentation");
    expect(domaineExecution({ type: "commande", id: "exporter-svg" }, "visualisation")).toBe("visualisation");
    expect(domaineExecution({ type: "commande", id: "navigation-3d" }, "visualisation")).toBe("visualisation");
    expect(domaineExecution({ type: "commande", id: "palette" }, "bim")).toBe("bim");
    // Commandes d'état du canevas (Échap, accrochages, repérages, fin de polyligne) : sur place, jamais de changement de domaine.
    for (const id of ["annuler-trace", "accrochage-grille", "reperage-polaire", "pas-polaire", "terminer-polyligne"]) expect(domaineExecution({ type: "commande", id }, "documentation"), id).toBe("documentation");
  });

  it("barre de l'espace : chaque action une fois, icône, nom, raccourci ; palette du domaine sans ces actions (règle d'or)", () => {
    const actions = renderToStaticMarkup(createElement(ActionsEspace, { disponible: () => true, surCommande: () => {} }));
    expect(actions).toContain('role="toolbar" aria-label="Actions de l’espace"');
    for (const id of ACTIONS_ESPACE) {
      const c = COMMANDES_EDITEUR.find((x) => x.id === id)!;
      expect(actions.split(`data-studio-commande="${id}"`).length - 1, id).toBe(1);
      expect(actions).toMatch(new RegExp(`aria-label="${c.libelleFR}" aria-keyshortcuts="${ariaRaccourci(c.raccourci).replace(/[+]/g, "\\+")}"`));
    }
    for (const d of DOMAINES_STUDIO) {
      const html = renderToStaticMarkup(createElement(BarreOutils, {
        outil: "studio.dessin.selection", outilDisponible: () => true, commandeDisponible: () => true, surOutil: () => {}, surCommande: () => {},
        filtre: (e) => dansPaletteDuDomaine(e, d.id), orientation: "verticale", libelle: `Outils — ${d.libelleFR}`,
      }));
      expect(html).toContain('aria-orientation="vertical"');
      for (const e of elementsRegistre) {
        const attribut = e.type === "outil" ? "data-studio-outil" : "data-studio-commande";
        expect(html.split(`${attribut}="${e.id}"`).length - 1, `${d.id}:${e.id}`).toBe(dansPaletteDuDomaine(e, d.id) ? 1 : 0);
      }
    }
  });
});

const CONTEXTE: StudioContext = {
  study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: "r2" },
  revision: { id: "r1", parentRevisionId: null, document: studioDocumentVide() }, canWrite: false,
};

describe("présentation des domaines", () => {
  const adresse = (id: string) => `/studio/projets/p/etudes/s/variantes/v?domaine=${id}`;

  it("navigation : quatre liens vers l'adresse de la variante avec leur domaine, exemptés de la garde, l'affiché marqué aria-current", () => {
    const html = renderToStaticMarkup(createElement(NavigationDomaines, { actif: "bim", adresse, surChoix: () => {} }));
    expect(html).toContain('aria-label="Domaines du Studio"');
    expect(html.match(/<a /g)).toHaveLength(4);
    for (const d of DOMAINES_STUDIO) {
      expect(html).toContain(`href="${adresse(d.id)}"`);
      expect(html).toContain(`<span>${d.libelleFR}</span>`);
    }
    expect(html.match(new RegExp(`${ATTRIBUT_SANS_GARDE}=""`, "g"))).toHaveLength(4);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*data-studio-domaine-lien="bim"/);
    expect(html).not.toContain("data-studio-domaines-menu");
  });

  it("navigation compacte (téléphone) : un bouton nomme le domaine affiché et déplie les quatre liens", () => {
    const html = renderToStaticMarkup(createElement(NavigationDomaines, { actif: "documentation", adresse, surChoix: () => {}, compacte: true }));
    expect(html).toMatch(/<button type="button" class="studio-domaines-menu" aria-expanded="false" aria-controls="([^"]+)"[^>]*>.*Documentation, métrés et collaboration/);
    const id = /aria-controls="([^"]+)"/.exec(html)![1]!;
    expect(html).toMatch(new RegExp(`<ol id="${id.replace(/[:]/g, "\\:")}" hidden="">`));
    expect(html.match(/<a /g)).toHaveLength(4);
    // Le bouton précède la liste ; la barre est en haut de l'espace (ordre du document).
    expect(html.indexOf("data-studio-domaines-menu")).toBeLessThan(html.indexOf("<ol"));
  });

  it("liens de domaine : seul le clic simple est traité sur place ; Ctrl, Cmd, Maj, Alt ou un autre bouton suivent l'adresse", () => {
    const base = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    expect(clicSimple(base)).toBe(true);
    for (const autre of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) expect(clicSimple({ ...base, ...autre }), JSON.stringify(autre)).toBe(false);
  });

  it("garde de navigation : un lien de domaine, une ancre ou un téléchargement ne quittent pas la variante ; un autre lien si", () => {
    const lien = (attrs: Record<string, string>) => ({ hasAttribute: (n: string) => n in attrs, getAttribute: (n: string) => attrs[n] ?? null });
    expect(lienQuitteLaVariante(lien({ href: adresse("bim"), [ATTRIBUT_SANS_GARDE]: "" }))).toBe(false);
    expect(lienQuitteLaVariante(lien({ href: "#x" }))).toBe(false);
    expect(lienQuitteLaVariante(lien({ href: "/export", download: "" }))).toBe(false);
    expect(lienQuitteLaVariante(lien({ href: adresse("bim") }))).toBe(true);
  });

  it("historique : un retour qui reste dans la variante et la révision (changement de domaine) n'est pas une sortie", () => {
    const v = { chemin: "/studio/projets/p/etudes/s/variantes/v", revision: null };
    expect(resteDansLaVariante({ pathname: "/studio/projets/p/etudes/s/variantes/v", search: "?domaine=bim" }, v)).toBe(true);
    expect(resteDansLaVariante({ pathname: "/studio/projets/p/etudes/s/variantes/v/", search: "" }, v)).toBe(true);
    expect(resteDansLaVariante({ pathname: "/studio/projets/p/etudes/s/variantes/v", search: "?revision=r1&domaine=bim" }, v)).toBe(false);
    expect(resteDansLaVariante({ pathname: "/studio/projets/p/etudes/s/variantes/w", search: "?domaine=bim" }, v)).toBe(false);
    expect(resteDansLaVariante({ pathname: "/studio/projets/p", search: "" }, v)).toBe(false);
    expect(resteDansLaVariante({ pathname: "/studio/projets/p/etudes/s/variantes/v", search: "?revision=r1" }, { ...v, revision: "r1" })).toBe(true);
  });

  it("section : région nommée par le nom exact du domaine ; un seul domaine affiché, les autres masqués (montés)", () => {
    const affiche = renderToStaticMarkup(createElement(SectionDomaine, { id: "documentation", actif: true, children: null }));
    expect(affiche).toContain('aria-labelledby="studio-domaine-documentation-titre"');
    expect(affiche).toContain("data-studio-domaine-actif");
    expect(affiche).toMatch(/<h2 id="studio-domaine-documentation-titre" class="studio-masque" tabindex="-1">Documentation, métrés et collaboration<\/h2>/);
    expect(affiche).not.toContain("hidden");
    const masque = renderToStaticMarkup(createElement(SectionDomaine, { id: "dessin", actif: false, children: null }));
    expect(masque).toMatch(/<section[^>]*hidden=""/);
    expect(masque).not.toContain("data-studio-domaine-actif");
  });

  it("mode des planches : 2D, 3D, Double vue ; le raccourci de « Vue 3D » n'est annoncé que sur le bouton qu'il activerait", () => {
    const bascule = COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!;
    expect(bascule.raccourci).toBe("Shift+D");
    expect(MODES_PLANCHE.map((m) => m.libelleFR)).toEqual(["Planche 2D", "Planche 3D", "Double vue"]);
    for (const [active, annonce] of [["2d", "3d"], ["3d", "2d"], ["double", "2d"]] as const) {
      const html = renderToStaticMarkup(createElement(SelecteurPlanche, { active, surChoix: () => {} }));
      expect(html.match(/aria-keyshortcuts=/g), active).toHaveLength(1);
      expect(html).toMatch(new RegExp(`aria-keyshortcuts="Shift\\+D"[^>]*data-studio-planche="${annonce}"`));
      expect(html).toMatch(new RegExp(`aria-pressed="true" aria-label="[^"]*"[^>]*data-studio-planche="${active}"`));
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    }
    expect(["2d", "3d", "double"].every(estModePlanche)).toBe(true);
    expect(estModePlanche("triple")).toBe(false);
    // Double vue : extension PROPOSÉE (hors références), étiquetée comme telle et désactivable.
    expect(EXTENSIONS_PROPOSEES.doubleVue).toBe(true);
    expect(MODES_PLANCHE.filter((m) => m.extension).map((m) => m.id)).toEqual(["double"]);
    const html = renderToStaticMarkup(createElement(SelecteurPlanche, { active: "2d", surChoix: () => {} }));
    expect(html).toMatch(/aria-label="Double vue \(extension proposée\)"[^>]*data-studio-planche="double" data-studio-extension-proposee=""/);
    expect(html).toContain('<span class="studio-extension" aria-hidden="true">proposée</span>');
  });

  it("titre de l'espace et sous-titre de la planche affichée (2D, 3D, Double vue)", () => {
    expect(renderToStaticMarkup(createElement(TitreEspace, { context: CONTEXTE }))).toBe('<h1 class="studio-masque" data-studio-titre-espace="true"><span translate="no">Étude</span></h1>');
    expect(SOUS_TITRE_PLANCHE["2d"]).toBe("Dessin 2D · Repère local · Mètres");
    expect(SOUS_TITRE_PLANCHE["3d"]).toBe("Vue 3D · Repère local · Mètres");
    expect(libelleModePlanche("double")).toBe("Double vue");
  });

  it("adresse : commentaires ouverts sans domaine → Documentation ; sinon le domaine de l'adresse ou Dessin", () => {
    expect(domaineDeLAdresse(null, false)).toBe("dessin");
    expect(domaineDeLAdresse(null, true)).toBe("documentation");
    expect(domaineDeLAdresse("bim", true)).toBe("bim");
  });

  it("révision historique : « Revenir à la version courante » garde le domaine et la planche de l'adresse", () => {
    const rendre = (adresse?: { domaine: "dessin" | "bim"; planche: "3d" | "double" | null }) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BandeauHistorique, {
      projectId: "p", studyId: "s", variantId: "v", adresse,
    })));
    const lien = (html: string) => /data-studio-version-courante="true" href="([^"]*)"/.exec(html)?.[1];
    expect(lien(rendre())).toBe("/studio/projets/p/etudes/s/variantes/v");
    expect(lien(rendre({ domaine: "dessin", planche: "3d" }))).toBe("/studio/projets/p/etudes/s/variantes/v?domaine=dessin&amp;planche=3d");
    expect(lien(rendre({ domaine: "dessin", planche: "double" }))).toBe("/studio/projets/p/etudes/s/variantes/v?domaine=dessin&amp;planche=double");
    expect(lien(rendre({ domaine: "bim", planche: null }))).toBe("/studio/projets/p/etudes/s/variantes/v?domaine=bim");
  });
});

describe("workflow de conception déclaré (REF-01 §06)", () => {
  it("les sept phases sont celles du document de référence, dans l'ordre", () => {
    const texte = DOCX.replace(/<[^>]+>/g, "");
    expect(texte).toContain(`Le workflow de conception est : ${STUDIO_PHASES_WORKFLOW.map((p) => p.libelleFR).join(" → ")}.`);
    expect(texte).toContain("ne remplace pas la méthode des 21 étapes du Parcours");
  });

  it("pastille : « Non déclarée » par défaut ; menu des phases ; suggestions = liens vers les domaines concernés", () => {
    const adresses = { domaine: (d: string) => `/v?domaine=${d}`, etude: "/e", comparer: "/c" };
    const vide = renderToStaticMarkup(createElement(PastilleWorkflow, { phase: null, adresses, surDomaine: () => {} }));
    expect(vide).toContain(">Non déclarée<");
    expect(vide).toContain('data-studio-workflow-phase="non-declaree"');
    expect(vide).toContain("data-studio-workflow-lecture");
    expect(vide).not.toContain("data-studio-declarer-phase");
    const controle = renderToStaticMarkup(createElement(PastilleWorkflow, { phase: "controler", declarer: async () => {}, adresses, surDomaine: () => {} }));
    expect(controle).toContain(">Contrôler<");
    expect(controle.match(/data-studio-declarer-phase="/g)).toHaveLength(8);
    expect(controle).toMatch(/<li aria-current="step" data-studio-phase="controler">/);
    expect(controle).toMatch(/href="\/v\?domaine=bim" data-studio-sans-garde="" data-studio-suggestion-domaine="bim">02 · BIM et coordination</);
    expect(SUGGESTIONS_PHASE.publier).toEqual([{ type: "domaine", domaine: "documentation" }]);
    expect(SUGGESTIONS_PHASE.concevoir).toEqual([{ type: "domaine", domaine: "dessin" }]);
    expect(libellePhase(undefined)).toBe("Non déclarée");
    // Aucun cinquième domaine : les suggestions ne désignent que les quatre domaines, l'étude ou la comparaison.
    for (const s of Object.values(SUGGESTIONS_PHASE).flat()) if (s.type === "domaine") expect(estDomaineStudio(s.domaine)).toBe(true);
  });
});
