/**
 * Règle d'or (AGENTS.md, D-202) appliquée à la planche 2D de Studio V1 : chaque outil du registre `STUDIO_TOOLS` et
 * chaque commande de l'éditeur (vue, accrochage, exports, catalogue compris) a sa propre icône (existante dans
 * Icon.tsx, jamais partagée), une place dans une barre appropriée — sa famille de la barre compacte, dans la rangée
 * ou dans le menu « ▾ » de la famille (`barre-compacte.ts`) — et un raccourci unique, jamais réservé par le navigateur ; la table clavier de l'éditeur est exactement celle du registre et des commandes ; le catalogue
 * « Outils » et la palette lisent le registre sans le recopier.
 *
 * Navigation hors règle d'or (I.4, ADR-STUDIO-NAV-01 §1) : les liens des quatre domaines et les deux boutons
 * Planche 2D / Planche 3D sont de la navigation, pas des outils ni des commandes. Ils n'entrent ni dans le registre, ni
 * dans `COMMANDES_EDITEUR`, ni dans la table clavier ; le choix de planche n'annonce que le raccourci de la bascule
 * existante « Vue 3D » (Maj+D), qui a son icône, sa barre et son raccourci. Le dernier test le vérifie.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "@parcours/atelier-model";
import { Icon, type IconName } from "../../../components/Icon";
import { studioExportUrl } from "../../../lib/api";
import { BarreOutils } from "./BarreOutils";
import { ELEMENTS_FAMILLE, familleDe, FAMILLES_STUDIO, TRACE_PLUS } from "./barre-compacte";
import { CATALOGUE, groupesCatalogue, rechercher } from "./catalogue";
import { GestionnaireOutils, PaletteCommandes } from "./CatalogueOutils";
import { NavigationDomaines, SelecteurPlanche } from "../domaines/DomainesStudio";
import { DOMAINES_STUDIO, PLANCHES_STUDIO } from "../domaines/domaines";
import {
  actifDansUnChamp, ariaRaccourci, BARRES_STUDIO, cibleRaccourci, combinaison, COMMANDES_EDITEUR, commandesDeBarre, libelleRaccourci, outilsDeBarre,
  RACCOURCIS_RESERVES, TABLE_CLAVIER,
} from "./raccourcis";

const entrees = [
  ...STUDIO_TOOLS.map((t) => ({ id: t.toolId as string, libelle: t.libelleFR, icone: t.iconeSymbolique as IconName, raccourcis: [t.raccourci], barre: t.groupe as string })),
  ...COMMANDES_EDITEUR.map((c) => ({ id: c.id as string, libelle: c.libelleFR, icone: c.iconeSymbolique as IconName, raccourcis: [c.raccourci, ...(c.autres ?? [])], barre: c.groupe as string })),
];
const trace = (name: IconName) => /<path d="([^"]*)"/.exec(renderToStaticMarkup(createElement(Icon, { name })))?.[1] ?? "";
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Événement clavier qui produit le raccourci (lettre en minuscule sans Maj, comme un vrai clavier). */
function evenement(r: string) {
  // Une touche « + » finale (« + », « Shift++ ») n'est pas un séparateur.
  const parts = r === "-" ? ["-"] : r.endsWith("+") ? [...r.slice(0, -1).split("+").filter(Boolean), "+"] : r.split("+");
  const touche = parts[parts.length - 1]!;
  const shiftKey = parts.includes("Shift");
  const key = touche === "Space" ? " " : touche.length === 1 ? (shiftKey ? touche.toUpperCase() : touche.toLowerCase()) : touche;
  return { key, ctrlKey: parts.includes("Ctrl"), metaKey: false, shiftKey, altKey: false };
}

const LIENS = { "exporter-svg": "/projects/p/studio/studies/s/variants/v/export?format=svg", "exporter-dxf": "/projects/p/studio/studies/s/variants/v/export?format=dxf", "exporter-ifc": "/projects/p/studio/studies/s/variants/v/export?format=ifc" };
const barre = (largeurInitiale?: number) => renderToStaticMarkup(createElement(BarreOutils, {
  largeurInitiale, outil: "studio.dessin.selection", outilDisponible: () => true, commandeDisponible: () => true, surOutil: () => {}, surCommande: () => {},
  basculeActive: { "accrochage-sommets": true, "accrochage-grille": false }, lienCommande: LIENS,
}));

describe("Planche 2D de Studio — règle d'or", () => {
  it("chaque outil et chaque commande a sa propre icône, dessinée dans Icon.tsx", () => {
    const icones = entrees.map((e) => e.icone);
    expect(new Set(icones).size, "nom d'icône partagé").toBe(icones.length);
    const traces = icones.map(trace);
    for (const [i, d] of traces.entries()) expect(d.length, `icône absente : ${icones[i]}`).toBeGreaterThan(0);
    expect(new Set(traces).size, "dessin d'icône partagé").toBe(traces.length);
  });

  it("chaque outil et chaque commande est rangé dans une barre déclarée", () => {
    const barres = new Set(BARRES_STUDIO.map((b) => b.id as string));
    for (const e of entrees) expect(barres.has(e.barre), e.id).toBe(true);
    const ranges = BARRES_STUDIO.flatMap((b) => [...outilsDeBarre(b.id).map((t) => t.toolId as string), ...commandesDeBarre(b.id).map((c) => c.id as string)]);
    expect(ranges.sort()).toEqual(entrees.map((e) => e.id).sort());
    // Aucune barre vide ; les mutations du registre sont exactement les commandes envoyées au serveur.
    for (const b of BARRES_STUDIO) expect(outilsDeBarre(b.id).length + commandesDeBarre(b.id).length, b.id).toBeGreaterThan(0);
    expect(STUDIO_TOOLS.filter((t) => t.nature === "mutation").map((t) => t.toolId)).toEqual([...STUDIO_COMMAND_TOOL_IDS]);
    // Vue, accrochage, exports et catalogue : les commandes livrées avec la sélection multiple et le zoom.
    for (const id of ["tout-selectionner", "zoom-avant", "zoom-arriere", "accrochage-sommets", "accrochage-grille", "importer-dxf", "exporter-svg", "exporter-dxf", "exporter-ifc", "feuille", "outils", "palette"]) {
      expect(COMMANDES_EDITEUR.some((c) => c.id === id), id).toBe(true);
    }
  });

  it("chaque outil et chaque commande a sa famille de la barre compacte ; chaque famille a son bouton « ▾ » à icône propre", () => {
    const ranges = FAMILLES_STUDIO.flatMap((f) => (ELEMENTS_FAMILLE.get(f.id) ?? []).map((e) => e.id as string));
    expect([...ranges].sort()).toEqual(entrees.map((e) => e.id).sort());
    for (const e of entrees) expect(FAMILLES_STUDIO.some((f) => f.id === familleDe(e.id, e.barre as never)), e.id).toBe(true);
    for (const f of FAMILLES_STUDIO) expect(ELEMENTS_FAMILLE.get(f.id)?.length ?? 0, f.id).toBeGreaterThan(0);
    // Familles demandées : Sélection, Dessin, Courbes, Annotation, Modification, Calques, Volume, Vue / Accrochage,
    // Présentation, Importer / Exporter, Édition (et Catalogue, porte du gestionnaire et de la palette).
    expect(FAMILLES_STUDIO.map((f) => f.libelleFR)).toEqual(["Sélection", "Dessin", "Courbes", "Annotation", "Modification", "Calques", "Volume", "Architecture", "Vue / Accrochage", "Présentation", "Importer / Exporter", "Édition", "Catalogue"]);
    const icones = [...FAMILLES_STUDIO.map((f) => f.trace), TRACE_PLUS];
    expect(new Set(icones).size, "icône de famille partagée").toBe(icones.length);
    for (const d of entrees.map((e) => trace(e.icone))) expect(icones, "icône de famille reprise d'un outil").not.toContain(d);
  });

  it("chaque raccourci est unique et la table clavier de l'éditeur est celle du registre", () => {
    const tous = entrees.flatMap((e) => e.raccourcis);
    expect(new Set(tous).size).toBe(tous.length);
    expect(TABLE_CLAVIER.size).toBe(tous.length);
    for (const t of STUDIO_TOOLS) {
      expect(cibleRaccourci(combinaison(evenement(t.raccourci))), t.toolId).toEqual({ type: "outil", toolId: t.toolId });
    }
    for (const c of COMMANDES_EDITEUR) {
      for (const r of [c.raccourci, ...(c.autres ?? [])]) expect(cibleRaccourci(combinaison(evenement(r))), r).toEqual({ type: "commande", id: c.id });
    }
    // Rien dans la table qui ne vienne du registre ou des commandes déclarées.
    for (const [r, cible] of TABLE_CLAVIER) {
      if (cible.type === "outil") expect(STUDIO_TOOLS.find((t) => t.toolId === cible.toolId)?.raccourci).toBe(r);
      else expect(entrees.find((e) => e.id === cible.id)?.raccourcis).toContain(r);
    }
  });

  it("aucun raccourci ne prend une combinaison réservée par le navigateur (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Maj+N, Ctrl+Maj+T…)", () => {
    for (const r of ["Ctrl+N", "Ctrl+T", "Ctrl+W", "Ctrl+Shift+N", "Ctrl+Shift+T"]) expect(RACCOURCIS_RESERVES).toContain(r);
    for (const r of TABLE_CLAVIER.keys()) expect(RACCOURCIS_RESERVES, r).not.toContain(r);
    // Les raccourcis de la palette (Ctrl+K) et de la grille (F9) sont ceux annoncés.
    expect(cibleRaccourci("Ctrl+K")).toEqual({ type: "commande", id: "palette" });
    expect(cibleRaccourci("F9")).toEqual({ type: "commande", id: "accrochage-grille" });
    expect(cibleRaccourci("=")).toEqual({ type: "commande", id: "zoom-avant" });
    expect(cibleRaccourci("-")).toEqual({ type: "commande", id: "zoom-arriere" });
    expect(cibleRaccourci("Ctrl+A")).toEqual({ type: "commande", id: "tout-selectionner" });
    // Volume et vue 3D : Maj+E extrude, Maj+F aplatit, Maj+D bascule la vue 3D (F3, réservé, n'est jamais pris).
    expect(cibleRaccourci("Shift+E")).toEqual({ type: "outil", toolId: "studio.objet.extruder" });
    expect(cibleRaccourci("Shift+F")).toEqual({ type: "outil", toolId: "studio.objet.aplatir" });
    expect(cibleRaccourci("Shift+D")).toEqual({ type: "commande", id: "vue-3d" });
    expect(cibleRaccourci("F3")).toBeNull();
    // Export IFC : Maj+I, Ctrl+Maj+I (outils de développement) reste au navigateur.
    expect(cibleRaccourci("Shift+I")).toEqual({ type: "commande", id: "exporter-ifc" });
    expect(cibleRaccourci("Ctrl+Shift+I")).toBeNull();
    expect(COMMANDES_EDITEUR.find((c) => c.id === "exporter-ifc")).toMatchObject({ groupe: "export", ecrit: false, telechargement: "ifc", iconeSymbolique: "studio-export-ifc" });
    expect(outilsDeBarre("volume").map((t) => t.toolId)).toEqual(["studio.objet.extruder", "studio.objet.aplatir"]);
    expect(COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")).toMatchObject({ groupe: "vue", bascule: true, ecrit: false, iconeSymbolique: "studio-view-3d" });
    // Feuille de présentation : Maj+P, barre Présentation, icône propre ; Ctrl+P (impression) reste au navigateur.
    expect(cibleRaccourci("Shift+P")).toEqual({ type: "commande", id: "feuille" });
    expect(cibleRaccourci("Ctrl+P")).toBeNull();
    expect(RACCOURCIS_RESERVES).toContain("Ctrl+P");
    expect(COMMANDES_EDITEUR.find((c) => c.id === "feuille")).toMatchObject({ groupe: "presentation", ecrit: false, iconeSymbolique: "studio-sheet" });
    // Feuilles composées et dossier de conception (E.3) : Ctrl+Maj+D, même barre, icône propre.
    expect(commandesDeBarre("presentation").map((c) => c.id)).toEqual(["feuille", "dossier"]);
    expect(cibleRaccourci("Ctrl+Shift+D")).toEqual({ type: "commande", id: "dossier" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "dossier")).toMatchObject({ groupe: "presentation", ecrit: false, iconeSymbolique: "studio-dossier" });
    // Import DXF : Maj+U, barre Importer, icône propre, indisponible en lecture seule (commande d'écriture), pas un lien.
    expect(cibleRaccourci("Shift+U")).toEqual({ type: "commande", id: "importer-dxf" });
    expect(cibleRaccourci("Ctrl+U")).toBeNull();
    expect(RACCOURCIS_RESERVES).toContain("Ctrl+U");
    expect(COMMANDES_EDITEUR.find((c) => c.id === "importer-dxf")).toMatchObject({ groupe: "import", ecrit: true, iconeSymbolique: "studio-import-dxf", libelleFR: "Importer DXF" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "importer-dxf")?.telechargement).toBeUndefined();
    expect(commandesDeBarre("import").map((c) => c.id)).toEqual(["importer-dxf", "importer-ifc", "modeles-externes"]);
    expect(BARRES_STUDIO.map((b) => b.id).indexOf("import")).toBe(BARRES_STUDIO.map((b) => b.id).indexOf("export") - 1);
    // Dans un champ de saisie, seuls Enregistrer et la palette restent actifs.
    expect(actifDansUnChamp("Ctrl+S")).toBe(true);
    expect(actifDansUnChamp("Ctrl+K")).toBe(true);
    expect(actifDansUnChamp("Ctrl+A")).toBe(false);
    expect(actifDansUnChamp("L")).toBe(false);
  });

  for (const [cas, largeurInitiale] of [["large", undefined], ["étroite (téléphone)", 300]] as const) it(`la barre rendue (${cas}) montre chaque outil et chaque commande une fois : icône, nom, raccourci, famille`, () => {
    const html = barre(largeurInitiale);
    expect(html).toContain('role="toolbar" aria-label="Outils de dessin"');
    const controle = (attribut: string, id: string, libelle: string, icone: IconName, raccourci: string, barre: string) => {
      const barreId = familleDe(id, barre as never);
      expect(html.split(`${attribut}="${id}"`).length - 1, `${id} rendu une seule fois`).toBe(1);
      const element = new RegExp(`<(button|a)[^>]*aria-label="${echapper(libelle)}"[^>]*aria-keyshortcuts="${echapper(ariaRaccourci(raccourci))}"[^>]*${attribut}="${echapper(id)}"[^>]*>(.*?)</\\1>`).exec(html);
      expect(element, id).not.toBeNull();
      expect(element![2]).toContain(`<path d="${trace(icone)}"`);
      expect(element![2]).toContain(`<span>${libelle}</span>`);
      expect(element![2]).toContain(`<kbd aria-hidden="true">${libelleRaccourci(raccourci)}</kbd>`);
      const groupe = new RegExp(`<div[^>]*data-studio-famille="${barreId}"[^>]*>(?:(?!data-studio-famille=).)*${attribut}="${echapper(id)}"`).exec(html);
      expect(groupe, `${id} dans la famille ${barreId}`).not.toBeNull();
    };
    for (const t of STUDIO_TOOLS) controle("data-studio-outil", t.toolId, t.libelleFR, t.iconeSymbolique, t.raccourci, t.groupe);
    for (const c of COMMANDES_EDITEUR) controle("data-studio-commande", c.id, c.libelleFR, c.iconeSymbolique, c.raccourci, c.groupe);
    if (largeurInitiale === undefined) {
      // Tout tient : une seule rangée, aucune famille repliée, pas de « Plus ».
      expect(html).not.toContain('aria-haspopup="true"');
    } else {
      // Étroite : boutons « ▾ » (menu fermé, contrôlé), menus masqués qui gardent leurs boutons, « Plus » présent.
      const menus = [...html.matchAll(/<button[^>]*aria-haspopup="true"[^>]*>/g)].map((m) => m[0]);
      expect(menus.length).toBeGreaterThan(1);
      for (const m of menus) {
        expect(m).toContain('aria-expanded="false"');
        const id = /aria-controls="([^"]+)"/.exec(m)![1]!;
        expect(html).toMatch(new RegExp(`<div id="${echapper(id)}"[^>]*hidden=""`));
      }
      expect(html).toContain('data-studio-menu="plus"');
      expect(html).toContain('aria-label="Plus d’outils"');
    }
  });

  it("bascules d'accrochage enfoncées ou non ; exports : liens de téléchargement vers l'adresse d'export", () => {
    const html = barre();
    expect(html).toMatch(/aria-pressed="true"[^>]*data-studio-commande="accrochage-sommets"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-studio-commande="accrochage-grille"/);
    for (const [id, href] of Object.entries(LIENS)) {
      expect(html).toMatch(new RegExp(`<a [^>]*href="${echapper(href.replace(/&/g, "&amp;"))}"[^>]*download=""[^>]*data-studio-commande="${id}"`));
    }
    expect(studioExportUrl("p", "s", "v", "svg")).toBe(LIENS["exporter-svg"]);
    expect(studioExportUrl("p", "s", "v", "ifc")).toBe(LIENS["exporter-ifc"]);
    expect(studioExportUrl("p 1", "s", "v", "dxf", "r/1")).toBe("/projects/p%201/studio/studies/s/variants/v/export?format=dxf&revision=r%2F1");
    // Indisponible : ni adresse ni téléchargement.
    const inactif = renderToStaticMarkup(createElement(BarreOutils, { outil: "studio.dessin.selection", outilDisponible: () => true, commandeDisponible: () => false, surOutil: () => {}, surCommande: () => {}, lienCommande: LIENS }));
    expect(inactif).not.toContain("href=");
    expect(inactif).toMatch(/aria-disabled="true"[^>]*data-studio-commande="exporter-svg"/);
  });

  it("accrochage et repérage : chaque mode est une bascule propre (icône, barre, raccourci), boutons visibles", () => {
    const attendus: [string, string, string, string][] = [
      ["accrochage-milieu", "Shift+H", "accrochage", "studio-snap-midpoint"],
      ["accrochage-centre", "Y", "accrochage", "studio-snap-center"],
      ["accrochage-quadrant", "Shift+Q", "accrochage", "studio-snap-quadrant"],
      ["accrochage-intersection", "X", "accrochage", "studio-snap-intersection"],
      ["accrochage-perpendiculaire", "N", "accrochage", "studio-snap-perpendicular"],
      ["accrochage-tangente", "U", "accrochage", "studio-snap-tangent"],
      ["accrochage-parallele", "Shift+F6", "accrochage", "studio-snap-parallel"],
      ["accrochage-proche", "Shift+J", "accrochage", "studio-snap-nearest"],
      ["reperage-orthogonal", "F8", "reperage", "studio-track-ortho"],
      ["reperage-polaire", "F10", "reperage", "studio-track-polar"],
      ["pas-polaire", "Shift+Y", "reperage", "studio-track-polar-step"],
    ];
    for (const [id, raccourci, groupe, icone] of attendus) {
      expect(cibleRaccourci(raccourci), id).toEqual({ type: "commande", id });
      expect(COMMANDES_EDITEUR.find((c) => c.id === id), id).toMatchObject({ groupe, iconeSymbolique: icone, ecrit: false, raccourci });
      expect(RACCOURCIS_RESERVES, id).not.toContain(raccourci);
    }
    // Les modes et le repérage sont des bascules ; le pas polaire est une commande (il fait tourner 15/30/45/90°).
    for (const [id] of attendus) expect(COMMANDES_EDITEUR.find((c) => c.id === id)?.bascule === true, id).toBe(id !== "pas-polaire");
    expect(commandesDeBarre("reperage").map((c) => c.id)).toEqual(["reperage-orthogonal", "reperage-polaire", "pas-polaire"]);
    expect(BARRES_STUDIO.map((b) => b.id).indexOf("reperage")).toBe(BARRES_STUDIO.map((b) => b.id).indexOf("accrochage") + 1);
    // Écrans tactiles : un bouton nommé visible (icône, nom, raccourci affiché) pour chaque bascule, état enfoncé lu.
    const html = renderToStaticMarkup(createElement(BarreOutils, {
      outil: "studio.dessin.ligne", outilDisponible: () => true, commandeDisponible: () => true, surOutil: () => {}, surCommande: () => {},
      basculeActive: { "reperage-polaire": true, "accrochage-proche": false },
    }));
    expect(html).toMatch(/aria-pressed="true"[^>]*data-studio-commande="reperage-polaire"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-studio-commande="accrochage-proche"/);
    expect(html).toContain("<span>Repérage polaire</span>");
  });

  it("lecture du clavier : modificateur seul ou Alt ignorés, Cmd vaut Ctrl", () => {
    expect(combinaison({ key: "Shift", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false })).toBeNull();
    expect(combinaison({ key: "l", ctrlKey: false, metaKey: false, shiftKey: false, altKey: true })).toBeNull();
    expect(combinaison({ key: "z", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })).toBe("Ctrl+Z");
    expect(combinaison({ key: "F9", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe("F9");
    expect(cibleRaccourci("Ctrl+Shift+Z")).toEqual({ type: "commande", id: "retablir" });
    expect(cibleRaccourci("Q")).toEqual({ type: "commande", id: "echanges" });
    expect(cibleRaccourci("Ctrl+Shift+9")).toBeNull();
    expect(libelleRaccourci("Ctrl+Shift+F")).toBe("Ctrl+Maj+F");
    expect(libelleRaccourci("Delete")).toBe("Suppr");
  });
});

describe("Catalogue « Outils » et palette (#166, Registry)", () => {
  it("le catalogue lit le registre sans le recopier : mêmes descripteurs, même ordre, puis les commandes", () => {
    expect(CATALOGUE).toHaveLength(STUDIO_TOOLS.length + COMMANDES_EDITEUR.length);
    STUDIO_TOOLS.forEach((t, i) => {
      const e = CATALOGUE[i]!;
      expect(e.outil).toBe(t);
      expect([e.identifiant, e.libelleFR, e.raccourcis[0], e.icone, e.barre, e.nature, e.agentExposure]).toEqual([t.toolId, t.libelleFR, t.raccourci, t.iconeSymbolique, t.groupe, t.nature, t.agentExposure]);
    });
    COMMANDES_EDITEUR.forEach((c, i) => expect(CATALOGUE[STUDIO_TOOLS.length + i]!.commande).toBe(c));
    expect(groupesCatalogue(CATALOGUE).flatMap((g) => g.entrees)).toHaveLength(CATALOGUE.length);
  });

  it("recherche par nom (sans accents), raccourci (registre ou affiché) et identifiant", () => {
    expect(rechercher("Ligne")[0]?.identifiant).toBe("studio.dessin.ligne");
    expect(rechercher("selection").map((e) => e.identifiant)).toContain("studio.dessin.selection");
    expect(rechercher("Cote").map((e) => e.identifiant)).toEqual(["studio.dessin.cote", "studio.dessin.cote-angulaire"]);
    expect(rechercher("Maj+C")[0]?.identifiant).toBe("studio.dessin.cote");
    expect(rechercher("Shift+C")[0]?.identifiant).toBe("studio.dessin.cote");
    expect(rechercher("studio.calque").map((e) => e.identifiant)).toEqual(["studio.calque.creer", "studio.calque.modifier"]);
    expect(rechercher("objet.calque").map((e) => e.identifiant)).toEqual(["studio.objet.calque"]);
    expect(rechercher("ctrl+k")[0]?.identifiant).toBe("palette");
    expect(rechercher("Line", (e) => (e.identifiant === "studio.dessin.ligne" ? ["Line"] : []))[0]?.identifiant).toBe("studio.dessin.ligne");
    expect(rechercher("zzz-introuvable")).toEqual([]);
    expect(rechercher("")).toHaveLength(CATALOGUE.length);
  });

  it("le gestionnaire montre chaque entrée : icône, nom, raccourci, identifiant, disponibilité et exposition agent", () => {
    const html = renderToStaticMarkup(createElement(GestionnaireOutils, { disponible: (e) => e.nature !== "mutation", surExecuter: () => {}, surFermer: () => {} }));
    expect(html).toContain('role="dialog"');
    for (const e of CATALOGUE) {
      const ligne = new RegExp(`<li data-studio-catalogue-entree="${echapper(e.identifiant)}" data-studio-disponible="(oui|non)"[^>]*>(.*?)</li>`).exec(html);
      expect(ligne, e.identifiant).not.toBeNull();
      // Lecture seule simulée : les mutations sont indisponibles, leur bouton « Utiliser » désactivé.
      expect(ligne![1]).toBe(e.nature === "mutation" ? "non" : "oui");
      expect(ligne![2]).toContain(`<path d="${trace(e.icone as IconName)}"`);
      expect(ligne![2]).toContain(`>${e.libelleFR}</span>`);
      for (const r of e.raccourcis) expect(ligne![2]).toContain(`>${libelleRaccourci(r)}</kbd>`);
      expect(ligne![2]).toContain(`<code translate="no">${e.identifiant}</code>`);
      expect(ligne![2]).toContain(`data-studio-exposition="${e.agentExposure ?? "hors-registre"}"`);
      if (e.nature === "mutation") expect(ligne![2]).toMatch(/<button type="button" disabled=""/);
    }
  });

  it("la palette liste les entrées et marque l'indisponible", () => {
    const html = renderToStaticMarkup(createElement(PaletteCommandes, { disponible: (e) => e.identifiant !== "enregistrer", surExecuter: () => {}, surFermer: () => {} }));
    expect(html).toContain('role="listbox"');
    for (const e of CATALOGUE) expect(html).toContain(`data-studio-palette-entree="${e.identifiant}"`);
    expect(html).toMatch(/aria-disabled="true" data-studio-palette-entree="enregistrer"/);
  });
});

describe("navigation des domaines et choix de planche — déclarés hors règle d'or", () => {
  it("ni outil, ni commande, ni raccourci propre : liens de domaine sans raccourci, planches annonçant seulement Maj+D (Vue 3D)", () => {
    const nav = renderToStaticMarkup(createElement(NavigationDomaines, { actif: "dessin", adresse: (id) => `/v?domaine=${id}`, surChoix: () => {} }));
    const planches = renderToStaticMarkup(createElement(SelecteurPlanche, { active: "2d", surChoix: () => {} }));
    for (const html of [nav, planches]) expect(html).not.toMatch(/data-studio-(outil|commande)=/);
    expect(nav).not.toContain("aria-keyshortcuts");
    expect([...planches.matchAll(/aria-keyshortcuts="([^"]*)"/g)].map((m) => m[1])).toEqual([ariaRaccourci(COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!.raccourci)]);
    // Aucun domaine ni aucune planche n'est un outil ou une commande (donc rien dans la table clavier).
    const ids = new Set(entrees.map((e) => e.id));
    for (const id of [...DOMAINES_STUDIO.map((d) => d.id), ...PLANCHES_STUDIO.map((p) => p.id), "planche-2d", "planche-3d"]) expect(ids.has(id), id).toBe(false);
  });
});
