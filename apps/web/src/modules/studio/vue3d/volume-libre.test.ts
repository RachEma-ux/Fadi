import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, couperStudio, newStudioDocument, STUDIO_TOOLS, studioIfcSummary, studioLienSolide, studioQuantitesSolides, type StudioDocument } from "@parcours/atelier-model";
import { cibleRaccourci, COMMANDES_EDITEUR, commandesDeBarre, OUTILS_MODES, OUTILS_VOLUME_LIBRE, outilsDeBarre } from "../planche2d/raccourcis";
import {
  auCentimetre, BOITE_VIDE, commandeBoite, commandeDeplacementSolide, commandeDivision, commandeFace, commandePivot, commandePrisme, commandeResolution, DEPLACEMENT_VIDE,
  descriptionLien, descriptionSolide, FACE_VIDE, facesDe, PRISME_VIDE, profilsFermes, radians,
} from "./volume-libre";
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

  it("prisme : contour d'une polyligne fermée, relatif à son premier sommet, posé à la cote saisie ; relation et direction demandées", () => {
    const doc = avecProfil();
    expect(profilsFermes(doc).map((p) => p.id)).toEqual(["pl"]);
    expect(commandePrisme(doc, PRISME_VIDE, "p")).toEqual({ erreur: "Choisissez une polyligne fermée comme profil." });
    expect(commandePrisme(doc, { ...PRISME_VIDE, profil: "ouverte", cote: 0, hauteur: 1 }, "p")).toEqual({ erreur: "Choisissez une polyligne fermée comme profil." });
    expect(commandePrisme(doc, { ...PRISME_VIDE, profil: "pl" }, "p")).toEqual({ erreur: "Saisissez la cote de base et la hauteur, en mètres." });
    const saisi = { ...PRISME_VIDE, profil: "pl", cote: 1, hauteur: 2 };
    // TEST-006 : aucune relation proposée ; TEST-005 : aucune direction proposée.
    expect(commandePrisme(doc, saisi, "p")).toEqual({ erreur: "Choisissez la relation au profil : référence liée, associé ou copie indépendante." });
    expect(commandePrisme(doc, { ...saisi, relation: "copie-independante" }, "p")).toEqual({ erreur: "Choisissez la direction d’extrusion : +Z, −Z ou un vecteur saisi." });
    expect(commandePrisme(doc, { ...saisi, relation: "copie-independante", direction: "vecteur", dx: 1, dy: 0, dz: 0 }, "p")).toHaveProperty("erreur", "La direction doit sortir du plan du profil (dz non nul) : sinon le volume serait nul.");
    expect(commandePrisme(doc, { ...saisi, relation: "copie-independante", direction: "vecteur", dx: 0, dy: 0, dz: 0 }, "p")).toHaveProperty("erreur", "La direction ne peut pas être nulle.");
    expect(commandePrisme(doc, { ...saisi, relation: "reference-liee", direction: "+z", rotation: 30 }, "p")).toHaveProperty("erreur", "Un prisme lié suit la polyligne en plan : sa rotation doit rester 0°.");
    const r = commandePrisme(doc, { ...saisi, relation: "copie-independante", direction: "+z" }, "p");
    expect(r).toEqual({ commandes: [{ toolId: "studio.solide.prisme", params: {
      id: "p", type: "prism", placement: { origin: { x: 5, y: 5, z: 1 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }], height: 2,
      direction: { x: 0, y: 0, z: 1 }, source: { objectId: "pl", relation: "copie-independante" },
    } }] });
    const d = applyStudioCommands(doc, "commandes" in r ? r.commandes : []);
    // Copie indépendante : la polyligne reste un objet 2D intact, le solide n'en suit pas les modifications.
    expect(d.objects).toEqual(doc.objects);
    expect(studioIfcSummary(d).prisms).toBe(1);
    expect(descriptionLien(studioLienSolide(d, d.solides![0]!)!)).toBe("Lien : copie indépendante · aucune propagation");
  });

  it("TEST-006 : référence liée posée depuis le formulaire, suivie par le modèle ; désignation « à résoudre » quand la source disparaît", () => {
    const doc = avecProfil();
    const r = commandePrisme(doc, { ...PRISME_VIDE, profil: "pl", cote: 0, hauteur: 2, relation: "reference-liee", direction: "-z" }, "p");
    const d = applyStudioCommands(doc, "commandes" in r ? r.commandes : []);
    expect(descriptionLien(studioLienSolide(d, d.solides![0]!)!)).toBe("Lien : référence liée · à jour");
    expect(descriptionSolide(d.solides![0]!, String)).toBe("Prisme sur profil de 4 sommets, hauteur 2 m, vers le bas (−Z)");
    const sans = applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["pl"] } }]);
    expect(descriptionLien(studioLienSolide(sans, sans.solides![0]!)!)).toBe("Lien : référence liée · à résoudre : polyligne source supprimée");
    expect(studioQuantitesSolides(sans).items[0]!.volume).toBeNull();
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: sans, modifiable: true, selection: "p" }));
    expect(html).toContain('data-studio-solide-relation="reference-liee" data-studio-solide-lien="a-resoudre"');
    expect(html).toContain("volume non évalué");
    expect(html).toContain('data-studio-lien-etat="a-resoudre"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-studio-lien-mettre-a-jour=/);
  });

  it("TEST-002 / TEST-007 : pousser / tirer, diviser, pivoter et résoudre — valeurs saisies seulement, faces nommées", () => {
    expect(commandeFace(null, { face: "sommet", distance: 1 })).toHaveProperty("erreur");
    expect(commandeFace("b", FACE_VIDE)).toEqual({ erreur: "Choisissez la face à pousser ou à tirer." });
    expect(commandeFace("b", { face: "sommet", distance: 0 })).toHaveProperty("erreur");
    expect(commandeFace("b", { face: "sommet", distance: 1 })).toEqual({ commandes: [{ toolId: "studio.solide.face-decaler", params: { id: "b", face: "sommet", distance: 1 } }] });
    expect(commandeDivision("b", { face: "sommet", distance: 1 })).toEqual({ erreur: "Choisissez la face latérale à diviser." });
    expect(commandeDivision("b", { face: "lateral-0", distance: 0.5 })).toEqual({ commandes: [{ toolId: "studio.solide.face-diviser", params: { id: "b", face: "lateral-0", distance: 0.5 } }] });
    expect(commandePivot("b", Number.NaN)).toHaveProperty("erreur");
    expect(commandePivot("b", 90)).toEqual({ commandes: [{ toolId: "studio.solide.pivoter", params: { id: "b", angle: Math.PI / 2 } }] });
    expect(commandeResolution("b", "detacher")).toEqual({ commandes: [{ toolId: "studio.solide.resoudre", params: { id: "b", action: "detacher" } }] });
    const box = { id: "b", type: "box" as const, placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 };
    expect(facesDe(box).map((f) => f.valeur)).toEqual(["base", "sommet", "lateral-0", "lateral-1", "lateral-2", "lateral-3"]);
    expect(facesDe(box).map((f) => f.libelle)).toContain("Face latérale x−");
    const d = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.solide.boite", params: box }]);
    const r = commandeFace("b", { face: "sommet", distance: 1 });
    const m = applyStudioCommands(d, "commandes" in r ? r.commandes : []);
    expect(studioQuantitesSolides(m).items[0]!.volume).toBe(8);
    const html = renderToStaticMarkup(createElement(Vue3DStudio, { doc: m, modifiable: true, selection: "b" }));
    for (const attr of ["data-studio-face-decaler=\"b\"", "data-studio-face-diviser=\"b\"", "data-studio-pivoter=\"b\""]) expect(html).toContain(attr);
    expect(html).toMatch(/name="face-decaler" required=""[^>]*><option value="" selected="">Choisir la face…<\/option>/);
    expect(html).toMatch(/name="face-distance" value=""/);
    expect(html).not.toContain("data-studio-lien-solide");
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
  it("barre « Volume libre » : Boîte (B), Prisme (Maj+B), Déplacer le solide (Maj+W), Supprimer le solide (Maj+Suppr), puis le lot F1", () => {
    expect(outilsDeBarre("volume-libre").map((t) => [t.toolId, t.raccourci])).toEqual([
      ["studio.solide.boite", "B"], ["studio.solide.prisme", "Shift+B"], ["studio.solide.deplacer", "Shift+W"], ["studio.solide.supprimer", "Shift+Delete"],
      ["studio.solide.face-decaler", "Ctrl+Shift+U"], ["studio.solide.face-diviser", "Ctrl+Shift+V"], ["studio.solide.pivoter", "Ctrl+Shift+H"], ["studio.solide.resoudre", "Ctrl+Shift+G"],
      ["studio.solide.booleen", "Ctrl+Shift+Y"], ["studio.solide.cote-face", "Shift+F12"],
      // X.1-05 : surfaces libres NURBS.
      ["studio.surface.nurbs", "Ctrl+F8"], ["studio.surface.modifier", "Ctrl+F9"], ["studio.surface.epaissir", "Shift+F11"],
      ["studio.subdivision.creer", "Ctrl+F12"], ["studio.subdivision.solidifier", "Ctrl+Shift+End"],
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
