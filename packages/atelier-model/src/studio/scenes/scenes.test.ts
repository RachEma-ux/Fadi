import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { studioRapportFidelite, STUDIO_FORMATS_ECHANGE } from "../echanges/rapport-fidelite.js";
import { exportStudioDxf, exportStudioSvg } from "../export.js";
import { exportStudioIfc, studioIfcSummary } from "../ifc.js";
import { studioMesh3d } from "../mesh-3d.js";
import { quantitesStudio } from "../quantites.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOLS } from "../registry.js";
import { studioApparenceResolue, studioMeshScene, studioRappelerScene, studioScenes } from "./affichage.js";
import { studioNomFichierRendu, studioProvenanceRendu } from "./provenance.js";
import type { StudioApparence, StudioScene } from "./scenes.js";

/**
 * Visualisation (lot E.5) : scènes enregistrées (E.5-01), apparence d'affichage séparée des propriétés constructives
 * (E.5-02), provenance d'un rendu du modèle (E.5-03). Dimensions synthétiques de recette, pas des valeurs de projet.
 */

const cmd = (c: unknown) => c as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(cmd));
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "accepté"; };

const scene = (over: Partial<StudioScene> = {}): StudioScene => ({
  id: "sc1", type: "scene", frame: "local-3d", name: "Vue sud-est",
  camera: { projection: "perspective", position: { x: 10, y: -12, z: 8 }, target: { x: 3, y: 1, z: 1.5 }, fov: 45 },
  visibleLayers: ["default", "murs"], displayMode: "shaded-edges", ...over,
});
const apparence = (over: Partial<StudioApparence> = {}): StudioApparence => ({ id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#c0392b", finish: "satin", ...over });

/** Document constructif : calques, ligne extrudée, rectangle plat, mur avec ouverture, solide libre. */
const modele = (): StudioDocument => avec(newStudioDocument("vis"),
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } } },
  { toolId: "studio.objet.extruder", params: { ids: ["l1"], base: 0, height: 2.5, thickness: 0.2 } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 1, y: 1 }, width: 2, height: 1, extrusion: { base: 0, height: 1 } } },
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 4 }, { x: 6, y: 4 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 8, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
);

describe("Scènes enregistrées (E.5-01)", () => {
  it("créer, mettre à jour, rappeler, supprimer : liste additive `scenes`, absente quand vide", () => {
    const d0 = modele();
    expect(d0.scenes).toBeUndefined();
    const d1 = avec(d0, { toolId: "studio.scene.creer", params: scene() });
    expect(d1.scenes).toEqual([scene()]);
    expect(studioRappelerScene(d1, "sc1")).toEqual(scene());
    expect(studioRappelerScene(d1, "absente")).toBeNull();
    const ortho = scene({ name: "Plan", camera: { projection: "orthographic", position: { x: 3, y: 2, z: 50 }, target: { x: 3, y: 2, z: 0 }, height: 12 }, displayMode: "wireframe", visibleLayers: [] });
    const d2 = avec(d1, { toolId: "studio.scene.modifier", params: ortho });
    expect(studioScenes(d2)).toEqual([ortho]);
    // Le reste du document est intact : seule la liste `scenes` change.
    const { scenes: _s, ...reste2 } = d2;
    expect(reste2).toEqual(d0);
    const d3 = avec(d2, { toolId: "studio.scene.supprimer", params: { ids: ["sc1"] } });
    expect(d3).toEqual(d0);
    expect(Object.hasOwn(d3, "scenes")).toBe(false);
    // Relu tel quel par la validation du serveur (même forme canonique).
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d2)))).toEqual(d2);
  });

  it("le serveur valide la liste comme les autres : repère, champs, caméra, calques, identifiants", () => {
    const d = modele();
    const creer = (s: unknown) => refus(() => avec(d, { toolId: "studio.scene.creer", params: s }));
    expect(creer({ ...scene(), frame: "local-2d" })).toMatch(/repère local-3d attendu/);
    expect(creer({ ...scene(), inconnu: 1 })).toMatch(/champs absents ou inconnus/);
    expect(creer(scene({ camera: { projection: "perspective", position: { x: 0, y: 0, z: 0 }, target: { x: 1, y: 0, z: 0 }, fov: 180 } }))).toMatch(/champ de vision/);
    expect(creer(scene({ camera: { projection: "perspective", position: { x: 1, y: 1, z: 1 }, target: { x: 1, y: 1, z: 1 }, fov: 50 } }))).toMatch(/cible distincte/);
    expect(creer(scene({ camera: { projection: "orthographic", position: { x: 0, y: 0, z: 9 }, target: { x: 0, y: 0, z: 0 }, height: 0 } }))).toMatch(/hauteur vue/);
    expect(creer({ ...scene(), camera: { projection: "isometrique", position: { x: 0, y: 0, z: 9 }, target: { x: 0, y: 0, z: 0 } } })).toMatch(/projection perspective ou orthographic/);
    expect(creer(scene({ visibleLayers: ["nul-part"] }))).toMatch(/calque inconnu : nul-part/);
    expect(creer(scene({ visibleLayers: ["murs", "murs"] }))).toMatch(/calque répété/);
    expect(creer({ ...scene(), displayMode: "rendu" })).toMatch(/mode d’affichage : shaded, shaded-edges, wireframe attendu/);
    expect(creer(scene({ name: " " }))).toMatch(/nom non vide/);
    expect(creer(apparence())).toMatch(/type incompatible avec l’outil/);
    const d1 = avec(d, { toolId: "studio.scene.creer", params: scene() });
    expect(refus(() => avec(d1, { toolId: "studio.scene.creer", params: scene() }))).toMatch(/identifiant déjà utilisé/);
    expect(refus(() => avec(d1, { toolId: "studio.scene.modifier", params: scene({ id: "x" }) }))).toMatch(/scène introuvable : x/);
    expect(refus(() => avec(d1, { toolId: "studio.scene.supprimer", params: { ids: ["l1"] } }))).toMatch(/scène introuvable : l1/);
    // Document reçu directement (enregistrement, import) : mêmes contrôles.
    expect(refus(() => validateStudioDocument({ ...d, scenes: [scene(), scene()] }))).toMatch(/studioDocument\.scenes : identifiant dupliqué/);
    expect(refus(() => validateStudioDocument({ ...d, scenes: [{ id: "z", type: "camera" }] }))).toMatch(/type d’élément de visualisation non pris en charge/);
    expect(refus(() => validateStudioDocument({ ...d, scenes: "x" }))).toMatch(/tableau attendu/);
  });

  it("rappeler est une lecture du registre ; les mutations sont celles appliquées", () => {
    const famille = STUDIO_TOOLS.filter((t) => t.groupe === "visualisation");
    expect(famille.map((t) => [t.toolId, t.nature, t.raccourci])).toEqual([
      ["studio.scene.creer", "mutation", "V"], ["studio.scene.modifier", "mutation", "F2"], ["studio.scene.rappeler", "lecture", "F"],
      ["studio.scene.supprimer", "mutation", "Ctrl+Shift+X"], ["studio.apparence.definir", "mutation", "T"], ["studio.apparence.retirer", "mutation", "Ctrl+Shift+L"],
    ]);
    expect(STUDIO_COMMAND_TOOL_IDS).not.toContain("studio.scene.rappeler");
    expect(refus(() => avec(modele(), { toolId: "studio.scene.rappeler", params: { id: "sc1" } }))).toMatch(/outil de mutation non pris en charge/);
    expect(STUDIO_DOCUMENT_SCHEMA.properties.scenes.items.oneOf.map((s) => s.properties.type.const)).toEqual(["scene", "appearance"]);
  });

  it("une scène montre ses calques, quelle que soit leur visibilité enregistrée, sans modifier le document", () => {
    const d = modele();
    const avant = JSON.stringify(d);
    expect(studioMeshScene(d, null)).toEqual(studioMesh3d(d));
    // Calque « cache » masqué dans le document, montré par la scène ; calque implicite et « murs » non montrés.
    const m = studioMeshScene(d, ["cache"]);
    expect(m.solids.map((s) => s.id)).toEqual(["r1"]);
    expect(m.architecture ?? []).toEqual([]);
    expect(m.freeSolids ?? []).toEqual([]);
    expect(m.bounds).toEqual({ min: { x: 1, y: 1, z: 0 }, max: { x: 3, y: 2, z: 1 } });
    const murs = studioMeshScene(d, ["murs"]);
    expect(murs.solids.map((s) => s.id)).toEqual(["l1"]);
    expect(murs.architecture?.map((a) => a.id)).toEqual(["m1", "o1"]);
    expect(studioMeshScene(d, ["default"]).freeSolids?.map((s) => s.id)).toEqual(["b1"]);
    expect(studioMeshScene(d, []).bounds).toBeNull();
    expect(JSON.stringify(d)).toBe(avant);
  });
});

describe("Apparence d'affichage séparée des propriétés constructives (E.5-02)", () => {
  it("ne change ni la géométrie, ni les quantités, ni l'IFC, ni le SVG / DXF", () => {
    const d = modele();
    const v = avec(d,
      { toolId: "studio.apparence.definir", params: apparence() },
      { toolId: "studio.apparence.definir", params: apparence({ id: "ap2", target: { kind: "layer", id: "murs" }, color: "#2e86c1", finish: "glass" }) },
      { toolId: "studio.apparence.definir", params: apparence({ id: "ap3", target: { kind: "object", id: "b1" }, color: "#ffffff" }) },
      { toolId: "studio.scene.creer", params: scene() },
    );
    const meta = { studyName: "Étude", variantName: "Variante", revisionId: "r1", timestamp: "2026-10-19T00:00:00.000Z" };
    expect(studioMesh3d(v)).toEqual(studioMesh3d(d));
    expect(quantitesStudio(v)).toEqual(quantitesStudio(d));
    expect(exportStudioIfc(v, meta)).toBe(exportStudioIfc(d, meta));
    expect(studioIfcSummary(v)).toEqual(studioIfcSummary(d));
    expect(exportStudioSvg(v)).toBe(exportStudioSvg(d));
    expect(exportStudioDxf(v)).toBe(exportStudioDxf(d));
    // Les données constructives (objets, murs, solides, calques) sont strictement celles d'avant.
    const { scenes: _s, ...constructif } = v;
    expect(constructif).toEqual(d);
  });

  it("résolution : l'apparence de l'objet, sinon celle de son calque, sinon aucune", () => {
    const v = avec(modele(),
      { toolId: "studio.apparence.definir", params: apparence() },
      { toolId: "studio.apparence.definir", params: { id: "ap2", type: "appearance", target: { kind: "layer", id: "murs" }, color: "#2e86c1" } },
      { toolId: "studio.apparence.definir", params: apparence({ id: "ap3", target: { kind: "layer", id: "default" }, color: "#00ff00" }) },
    );
    expect(studioApparenceResolue(v, "m1", "murs")).toEqual({ color: "#c0392b", finish: "satin", source: "object", apparenceId: "ap1" });
    expect(studioApparenceResolue(v, "l1", "murs")).toEqual({ color: "#2e86c1", source: "layer", apparenceId: "ap2" });
    expect(studioApparenceResolue(v, "b1", undefined)).toMatchObject({ color: "#00ff00", source: "layer" });
    expect(studioApparenceResolue(v, "r1", "cache")).toBeNull();
    // Définir avec le même identifiant remplace ; retirer l'enlève.
    const r = avec(v, { toolId: "studio.apparence.definir", params: apparence({ color: "#111111" }) }, { toolId: "studio.apparence.retirer", params: { ids: ["ap2"] } });
    expect(studioApparenceResolue(r, "m1", "murs")?.color).toBe("#111111");
    expect(studioApparenceResolue(r, "l1", "murs")).toBeNull();
  });

  it("refus : cible inconnue, cible déjà habillée, couleur, finition ; l'apparence suit l'objet supprimé", () => {
    const d = modele();
    const definir = (a: unknown) => refus(() => avec(d, { toolId: "studio.apparence.definir", params: a }));
    expect(definir(apparence({ target: { kind: "object", id: "zz" } }))).toMatch(/objet introuvable : zz/);
    expect(definir(apparence({ target: { kind: "layer", id: "zz" } }))).toMatch(/calque inconnu : zz/);
    expect(definir(apparence({ color: "#C0392B" }))).toMatch(/couleur #rrggbb/);
    expect(definir({ ...apparence(), finish: "beton" })).toMatch(/finition : matte, satin, gloss, glass attendu/);
    expect(definir({ ...apparence(), material: "béton" })).toMatch(/champs absents ou inconnus/);
    expect(refus(() => avec(d, { toolId: "studio.apparence.definir", params: apparence() }, { toolId: "studio.apparence.definir", params: apparence({ id: "ap9" }) }))).toMatch(/cette cible a déjà une apparence/);
    const avecScene = avec(d, { toolId: "studio.scene.creer", params: scene() });
    expect(refus(() => avec(avecScene, { toolId: "studio.apparence.definir", params: apparence({ id: "sc1" }) }))).toMatch(/identifiant déjà utilisé par une scène/);
    expect(refus(() => avec(avecScene, { toolId: "studio.apparence.retirer", params: { ids: ["sc1"] } }))).toMatch(/apparence introuvable : sc1/);
    // Suppression du mur (cascade) et du solide : leurs apparences disparaissent, celle du calque reste.
    const v = avec(d,
      { toolId: "studio.apparence.definir", params: apparence() },
      { toolId: "studio.apparence.definir", params: apparence({ id: "ap3", target: { kind: "object", id: "b1" } }) },
      { toolId: "studio.apparence.definir", params: apparence({ id: "ap2", target: { kind: "layer", id: "murs" } }) },
    );
    const sans = avec(v, { toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: true } }, { toolId: "studio.solide.supprimer", params: { ids: ["b1"] } });
    expect(sans.scenes?.map((s) => s.id)).toEqual(["ap2"]);
  });
});

describe("Rendu du modèle : provenance et rapport de fidélité (E.5-03)", () => {
  const entree = {
    etude: { id: "e1", nom: "Étude de recette" }, variante: { id: "v1", nom: "Variante B" }, revisionId: "rev-0123456789abcdef",
    scene: { id: "sc1", nom: "Vue sud-est" }, date: new Date("2026-10-19T08:30:00.000Z"), camera: scene().camera,
  };
  it("déclare étude, variante, révision, scène, date et « rendu du modèle »", () => {
    const p = studioProvenanceRendu(entree);
    expect(p).toEqual({
      schema: "studio-rendu/1", nature: "rendu du modèle", etude: entree.etude, variante: entree.variante, revisionId: "rev-0123456789abcdef",
      scene: entree.scene, date: "2026-10-19T08:30:00.000Z", repere: "local-3d", camera: scene().camera,
    });
    expect(studioNomFichierRendu(p)).toBe("rendu-Variante-B-Vue-sud-est-89abcdef.png");
    expect(studioNomFichierRendu(studioProvenanceRendu({ ...entree, scene: null }))).toBe("rendu-Variante-B-vue-89abcdef.png");
    expect(refus(() => studioProvenanceRendu({ ...entree, revisionId: "" }))).toMatch(/provenance\.revisionId : texte non vide attendu/);
    expect(refus(() => studioProvenanceRendu({ ...entree, date: new Date("x") }))).toMatch(/date valide attendue/);
  });

  it("scènes et apparences : non couvertes par SVG, DXF et IFC, raison propre", () => {
    const v = avec(modele(), { toolId: "studio.scene.creer", params: scene() }, { toolId: "studio.apparence.definir", params: apparence() });
    for (const f of STUDIO_FORMATS_ECHANGE) {
      const lignes = studioRapportFidelite(v, f).lignes.filter((l) => l.categorie === "scenes");
      expect(lignes.map((l) => [l.type, l.statut, l.raison, l.ids])).toEqual([
        ["scene", "non-couvert", "visualisation-hors-export", ["sc1"]],
        ["appearance", "non-couvert", "visualisation-hors-export", ["ap1"]],
      ]);
      expect(studioRapportFidelite(v, f).lignes.some((l) => l.raison === "type-sans-capacite")).toBe(false);
    }
  });
});
