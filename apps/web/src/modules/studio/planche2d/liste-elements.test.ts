/**
 * Accessibilité de la planche 2D (I.5-02) : liste « Éléments du dessin » (groupes par calque, clavier, plage, focus
 * après suppression, annonces), repli du calque actif, piège du focus des boîtes de dialogue, avis de révision plus
 * récente.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { calqueActifOuPremier, listeCalques } from "./calques";
import { annonce, deplacer, focusApresSuppression, groupesElements, idCourt, ordreElements, plage } from "./liste-elements";
import { ListeElements } from "./ListeElements";
import { appartientAuDialogue, ATTRIBUT_PORTAIL, suivantDansLePiege } from "../variante/piege-focus";
import { teteDepassee } from "../variante/AvisRevision";
import { selectionValide, toutSelectionnable } from "./selection";

const ligne = (id: string, layerId?: string): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", ...(layerId ? { layerId } : {}), start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } });
const rect = (id: string, layerId?: string): StudioCommand => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", ...(layerId ? { layerId } : {}), origin: { x: 0, y: 0 }, width: 2, height: 1 } });

function dessin(): StudioDocument {
  return applyStudioCommands(newStudioDocument("d"), [
    ligne("l-0123456789"),
    { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
    { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
    rect("r1", "murs"),
    ligne("l2", "murs"),
    rect("r2", "cache"),
    { toolId: "studio.objet.extruder", params: { ids: ["l2"], base: 0, height: 2.5, thickness: 0.2 } },
    { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false } },
  ]);
}

describe("Éléments du dessin : groupes et ordre", () => {
  it("un groupe par calque non vide, dans l'ordre des calques, objets puis cotes", () => {
    const g = groupesElements(dessin());
    expect(g.map((x) => x.layerId)).toEqual(["default", "murs", "cache"]);
    expect(g[0]!.elements.map((e) => e.id)).toEqual(["l-0123456789", "c1"]);
    expect(g[0]!.implicite).toBe(true);
    expect(g[1]!.nom).toBe("Murs");
    expect(ordreElements(g)).toEqual(["l-0123456789", "c1", "r1", "l2", "r2"]);
  });

  it("type, identifiant court, extrusion saisie seulement, sélectionnable selon le calque", () => {
    const parId = new Map(groupesElements(dessin()).flatMap((g) => g.elements).map((e) => [e.id, e]));
    expect(parId.get("l-0123456789")!.court).toBe("l-012345");
    expect(idCourt("r1")).toBe("r1");
    expect(parId.get("l2")!.extrusion).toEqual({ base: 0, height: 2.5, thickness: 0.2 });
    expect(parId.get("r1")!.extrusion).toBeNull();
    expect(parId.get("c1")!.type).toBe("dimension");
    expect(parId.get("r2")!.selectionnable).toBe(false);
    expect(parId.get("r1")!.selectionnable).toBe(true);
  });

  it("aucun élément omis : un calque inconnu forme son propre groupe", () => {
    const doc = dessin();
    const bancal = { ...doc, objects: [...doc.objects, { id: "x", type: "line", layerId: "fantome", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }] } as StudioDocument;
    const g = groupesElements(bancal);
    expect(g[g.length - 1]).toMatchObject({ layerId: "fantome", nom: null });
    expect(ordreElements(g)).toContain("x");
  });
});

describe("Éléments du dessin : clavier", () => {
  const ordre = ["a", "b", "c", "d"];
  it("flèches, Début et Fin, bornées sans boucle", () => {
    expect(deplacer(ordre, "b", "suivant")).toBe("c");
    expect(deplacer(ordre, "d", "suivant")).toBe("d");
    expect(deplacer(ordre, "a", "precedent")).toBe("a");
    expect(deplacer(ordre, "c", "premier")).toBe("a");
    expect(deplacer(ordre, "a", "dernier")).toBe("d");
    expect(deplacer(ordre, null, "suivant")).toBe("a");
    expect(deplacer([], "a", "suivant")).toBeNull();
  });
  it("plage de l'ancre à la cible, dans les deux sens, sans élément non sélectionnable", () => {
    const ok = new Set(["a", "b", "d"]);
    expect(plage(ordre, "a", "d", ok)).toEqual(["a", "b", "d"]);
    expect(plage(ordre, "d", "b", ok)).toEqual(["b", "d"]);
    expect(plage(ordre, null, "b", ok)).toEqual(["b"]);
    expect(plage(ordre, "a", "z", ok)).toEqual([]);
  });
  it("après suppression, le focus passe à l'élément suivant, sinon au précédent", () => {
    expect(focusApresSuppression(ordre, ["b"], "b")).toBe("c");
    expect(focusApresSuppression(ordre, ["b", "c"], "b")).toBe("d");
    expect(focusApresSuppression(ordre, ["c", "d"], "d")).toBe("b");
    expect(focusApresSuppression(ordre, ["a"], "c")).toBe("c");
    expect(focusApresSuppression(ordre, ordre, "a")).toBeNull();
  });
  it("Ctrl+A de la liste = Ctrl+A de la planche (affiché et déverrouillé)", () => {
    const doc = dessin();
    const g = groupesElements(doc);
    const tous = ordreElements(g).filter((id) => g.flatMap((x) => x.elements).find((e) => e.id === id)!.selectionnable);
    expect(new Set(tous)).toEqual(new Set(toutSelectionnable(doc)));
    expect(selectionValide(doc, tous)).toEqual(tous);
  });
});

describe("Éléments du dessin : région vivante", () => {
  it("annonce la sélection et les changements du dessin, rien au premier rendu ni sans changement", () => {
    expect(annonce(null, { selection: 1, total: 3 })).toBeNull();
    expect(annonce({ selection: 0, total: 3 }, { selection: 0, total: 3 })).toBeNull();
    expect(annonce({ selection: 0, total: 3 }, { selection: 2, total: 3 })).toBe("2 élément(s) sélectionné(s).");
    expect(annonce({ selection: 2, total: 3 }, { selection: 0, total: 1 })).toBe("2 élément(s) retiré(s) du dessin ; Aucun élément sélectionné.");
    expect(annonce({ selection: 0, total: 1 }, { selection: 0, total: 2 })).toBe("1 élément(s) ajouté(s) au dessin ; Aucun élément sélectionné.");
  });
});

describe("Éléments du dessin : rendu accessible", () => {
  const rendu = (selection: string[], modifiable = true) => renderToStaticMarkup(createElement(ListeElements, { doc: dessin(), selection, modifiable, surSelection: () => {}, surSupprimer: () => {} }));
  it("liste à choix multiple, groupes nommés par leur calque, focus itinérant (une seule ligne tabulable)", () => {
    const html = rendu(["r1"]);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect((html.match(/role="group"/g) ?? []).length).toBe(3);
    expect((html.match(/role="option"/g) ?? []).length).toBe(5);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-selected="true"[^>]*data-studio-element="r1"/);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("extrudé : hauteur 2,5 m, base 0 m");
    expect(html).toContain('translate="no">Murs');
  });
  it("au toucher : boutons visibles et nommés, Supprimer désactivé sans sélection ou en lecture seule", () => {
    expect(rendu([])).toMatch(/<button[^>]*disabled=""[^>]*data-studio-elements-supprimer/);
    expect(rendu(["r1"], false)).toMatch(/<button[^>]*disabled=""[^>]*data-studio-elements-supprimer/);
    expect(rendu(["r1"])).not.toMatch(/<button[^>]*disabled=""[^>]*data-studio-elements-supprimer/);
    expect(rendu([])).toContain("Tout sélectionner");
    expect(rendu([])).toContain("Supprimer la sélection");
  });
  it("dessin vide : message explicite, aucune liste vide", () => {
    const html = renderToStaticMarkup(createElement(ListeElements, { doc: newStudioDocument("d"), selection: [], modifiable: true, surSelection: () => {}, surSupprimer: () => {} }));
    expect(html).toContain("Aucun élément dans le dessin.");
    expect(html).not.toContain('role="listbox"');
  });
});

describe("calque actif : repli sur le premier calque", () => {
  it("garde le calque demandé s'il existe, sinon le premier, en le signalant", () => {
    const calques = listeCalques(dessin());
    expect(calqueActifOuPremier(calques, "murs")).toEqual({ calque: calques[1], repli: false });
    expect(calqueActifOuPremier(calques, "disparu")).toEqual({ calque: calques[0], repli: true });
    expect(calqueActifOuPremier([], "disparu")).toEqual({ calque: undefined, repli: false });
  });
});

describe("boîtes de dialogue : focus dans un portail de la boîte", () => {
  // Éléments factices : `dans` est contenu par la boîte, `portail` est rendu ailleurs mais marqué, `dehors` ne l'est pas.
  type Faux = { nom: string; marque: boolean; closest(s: string): unknown };
  const el = (nom: string, marque = false) => ({ nom, marque, closest: (s: string) => (marque && s === `[${ATTRIBUT_PORTAIL}]` ? {} : null) } as Faux as unknown as Element);
  const dans = el("dans"), portail = el("portail", true), dehors = el("dehors");
  const boite = { contains: (n: Node | null) => n === dans };
  it("dedans ou dans un portail marqué : le piège laisse le focus ; dehors : il le reprend", () => {
    expect(appartientAuDialogue(dans, boite)).toBe(true);
    expect(appartientAuDialogue(portail, boite)).toBe(true);
    expect(appartientAuDialogue(dehors, boite)).toBe(false);
    expect(appartientAuDialogue(null, boite)).toBe(false);
    expect(appartientAuDialogue(dans, null)).toBe(false);
  });
});

describe("boîtes de dialogue : piège du focus", () => {
  it("Tab boucle du dernier au premier, Maj+Tab du premier au dernier, un focus extérieur revient dedans", () => {
    expect(suivantDansLePiege(3, 2, false)).toBe(0);
    expect(suivantDansLePiege(3, 0, true)).toBe(2);
    expect(suivantDansLePiege(3, 1, false)).toBeNull();
    expect(suivantDansLePiege(3, -1, false)).toBe(0);
    expect(suivantDansLePiege(3, -1, true)).toBe(2);
    expect(suivantDansLePiege(0, -1, false)).toBeNull();
  });
});

describe("avis de révision plus récente", () => {
  it("seulement quand la tête lue diffère de celle affichée", () => {
    expect(teteDepassee(null, "r1")).toBe(false);
    expect(teteDepassee("r1", "r1")).toBe(false);
    expect(teteDepassee("r2", "r1")).toBe(true);
  });
});
