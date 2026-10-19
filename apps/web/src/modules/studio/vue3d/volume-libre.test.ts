import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, couperStudio, newStudioDocument, STUDIO_TOOLS, studioIfcSummary, type StudioDocument } from "@parcours/atelier-model";
import { cibleRaccourci, COMMANDES_EDITEUR, commandesDeBarre, OUTILS_MODES, OUTILS_VOLUME_LIBRE, outilsDeBarre } from "../planche2d/raccourcis";
import { auCentimetre, BOITE_VIDE, commandeBoite, commandeDeplacementSolide, commandePrisme, DEPLACEMENT_VIDE, PRISME_VIDE, profilsFermes, radians } from "./volume-libre";
import { Vue3DStudio } from "./Vue3DStudio";

/** Volume libre de la vue 3D : des valeurs saisies aux commandes `studio.solide.*`, barre et raccourcis (règle d'or). */

const avecProfil = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.dessin.polyligne", params: { id: "pl", type: "polyline", points: [{ x: 5, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 7 }, { x: 5, y: 7 }], closed: true } },
  { toolId: "studio.dessin.polyligne", params: { id: "ouverte", type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false } },
]);

describe("Volume libre : commandes depuis les valeurs saisies", () => {
  it("aucune dimension par défaut : origine et dimensions vides bloquent la boîte", () => {
    expect(commandeBoite(BOITE_VIDE, "b")).toEqual({ erreur: "Cliquez sur la grille ou saisissez l’origine (x, y, z), en mètres." });
    expect(commandeBoite({ ...BOITE_VIDE, x: 1, y: 1, z: 0 }, "b")).toEqual({ erreur: "Saisissez la largeur, la profondeur et la hauteur, en mètres." });
    expect(commandeBoite({ x: 1, y: 1, z: 0, rotation: 0, largeur: 0, profondeur: 1, hauteur: 3 }, "b")).toEqual({ erreur: "Les dimensions doivent être strictement positives." });
    expect(commandeBoite({ x: 1, y: 1, z: 0, rotation: Number.NaN, largeur: 2, profondeur: 1, hauteur: 3 }, "b")).toHaveProperty("erreur");
  });

  it("boîte 2 × 1 × 3 en (1, 1, 0) : une commande exacte, calque implicite omis, appliquée par le modèle", () => {
    const r = commandeBoite({ x: 1, y: 1, z: 0, rotation: 0, largeur: 2, profondeur: 1, hauteur: 3 }, "b", "default");
    expect(r).toEqual({ commandes: [{ toolId: "studio.solide.boite", params: { id: "b", type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 } }] });
    const d = applyStudioCommands(newStudioDocument("d"), "commandes" in r ? r.commandes : []);
    expect(d.solides).toHaveLength(1);
    expect(couperStudio(d, { z: 1.5 }).segments.map((s) => s.source)).toEqual(["b", "b", "b", "b"]);
    expect(commandeBoite({ x: 1, y: 1, z: 0, rotation: 0, largeur: 2, profondeur: 1, hauteur: 3 }, "b", "murs")).toMatchObject({ commandes: [{ params: { layerId: "murs" } }] });
  });

  it("prisme : contour copié d'une polyligne fermée, relatif à son premier sommet, posé à la cote saisie", () => {
    const doc = avecProfil();
    expect(profilsFermes(doc).map((p) => p.id)).toEqual(["pl"]);
    expect(commandePrisme(doc, PRISME_VIDE, "p")).toEqual({ erreur: "Choisissez une polyligne fermée comme profil." });
    expect(commandePrisme(doc, { ...PRISME_VIDE, profil: "ouverte", cote: 0, hauteur: 1 }, "p")).toEqual({ erreur: "Choisissez une polyligne fermée comme profil." });
    expect(commandePrisme(doc, { ...PRISME_VIDE, profil: "pl" }, "p")).toEqual({ erreur: "Saisissez la cote de base et la hauteur, en mètres." });
    const r = commandePrisme(doc, { profil: "pl", cote: 1, hauteur: 2, rotation: 0 }, "p");
    expect(r).toEqual({ commandes: [{ toolId: "studio.solide.prisme", params: { id: "p", type: "prism", placement: { origin: { x: 5, y: 5, z: 1 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }], height: 2 } }] });
    const d = applyStudioCommands(doc, "commandes" in r ? r.commandes : []);
    // Le solide n'est pas lié à la polyligne : la polyligne reste un objet 2D intact.
    expect(d.objects).toEqual(doc.objects);
    expect(studioIfcSummary(d).prisms).toBe(1);
  });

  it("déplacer : solide sélectionné et déplacement saisi requis ; rotation en degrés, clic au centimètre", () => {
    expect(commandeDeplacementSolide(null, { dx: 1, dy: 0, dz: 0 })).toHaveProperty("erreur");
    expect(commandeDeplacementSolide("b", DEPLACEMENT_VIDE)).toEqual({ erreur: "Saisissez le déplacement dx, dy, dz, en mètres." });
    expect(commandeDeplacementSolide("b", { dx: 1, dy: -1, dz: 0.5 })).toEqual({ commandes: [{ toolId: "studio.solide.deplacer", params: { id: "b", dx: 1, dy: -1, dz: 0.5 } }] });
    expect([radians(0), radians(360), radians(-90), radians(180)]).toEqual([0, 0, (270 * Math.PI) / 180, Math.PI]);
    expect([auCentimetre(1.004), auCentimetre(-0.001), auCentimetre(2.996)]).toEqual([1, 0, 3]);
  });
});

describe("Volume libre : barre, raccourcis et commandes de la vue 3D (règle d'or)", () => {
  it("barre « Volume libre » : Boîte (B), Prisme (Maj+B), Déplacer le solide (Maj+T), Supprimer le solide (Maj+Suppr)", () => {
    expect(outilsDeBarre("volume-libre").map((t) => [t.toolId, t.raccourci])).toEqual([
      ["studio.solide.boite", "B"], ["studio.solide.prisme", "Shift+B"], ["studio.solide.deplacer", "Shift+T"], ["studio.solide.supprimer", "Shift+Delete"],
    ]);
    for (const t of STUDIO_TOOLS.filter((x) => x.groupe === "volume-libre")) {
      expect(cibleRaccourci(t.raccourci)).toEqual({ type: "outil", toolId: t.toolId });
      expect(OUTILS_VOLUME_LIBRE.has(t.toolId)).toBe(true);
    }
    expect(["studio.solide.boite", "studio.solide.prisme", "studio.solide.deplacer"].every((id) => OUTILS_MODES.has(id as never))).toBe(true);
    expect(OUTILS_MODES.has("studio.solide.supprimer")).toBe(false);
  });

  it("vue 3D : Vue en plan (Maj+G) et Coupe horizontale (Maj+K), bascules de la barre Vue, sans écriture", () => {
    expect(cibleRaccourci("Shift+G")).toEqual({ type: "commande", id: "navigation-3d" });
    expect(cibleRaccourci("Shift+K")).toEqual({ type: "commande", id: "coupe-3d" });
    for (const id of ["navigation-3d", "coupe-3d"]) expect(COMMANDES_EDITEUR.find((c) => c.id === id)).toMatchObject({ groupe: "vue", bascule: true, ecrit: false });
    expect(commandesDeBarre("vue").map((c) => c.id)).toEqual(expect.arrayContaining(["vue-3d", "navigation-3d", "coupe-3d"]));
  });
});

describe("Vue3DStudio : formulaires et liste des solides", () => {
  const avecSolide = () => applyStudioCommands(avecProfil(), [{ toolId: "studio.solide.boite", params: { id: "b", type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 } }]);
  it("outil Boîte : origine et dimensions vides (non proposées), rotation 0 ; lecture seule désactivée", () => {
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: avecProfil(), outil: "studio.solide.boite", modifiable: true }));
    expect(html).toContain("data-studio-boite");
    for (const nom of ["boite-x", "boite-y", "boite-z", "boite-largeur", "boite-profondeur", "boite-hauteur"]) expect(html).toMatch(new RegExp(`name="${nom}" value=""`));
    expect(html).toMatch(/name="boite-rotation" value="0"/);
    expect(renderToStaticMarkup(createElement(Vue3DStudio, { doc: avecProfil(), outil: "studio.solide.boite", modifiable: false }))).toMatch(/<fieldset disabled="">/);
  });

  it("solides listés avec leur volume ; solide sélectionné : déplacer et supprimer ; coupe sans cote proposée", () => {
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: avecSolide(), outil: "studio.solide.prisme", modifiable: true, selection: "b", coupe: true }));
    expect(html).toContain('data-studio-solides-libres="1"');
    expect(html).toContain('data-studio-solide="b"');
    expect(html).toContain("Boîte 2 × 1 × 3 m · 6 m³");
    expect(html).toContain('data-studio-solide-choisi="b"');
    expect(html).toContain('<option value="pl">Polyligne fermée 1 (4 sommets)</option>');
    expect(html).toMatch(/data-studio-coupe="true" data-studio-coupe-z="" data-studio-coupe-segments="0"/);
    expect(html).toContain("Saisissez la cote du plan de coupe : aucune cote n’est proposée.");
  });
});
