import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS, studioScenes, type StudioDocument } from "@parcours/atelier-model";
import dico from "../../../../lib/i18n/en.json";
import { CLE_PROVENANCE_PNG, crc32, insererTextePng, lireTextesPng } from "./png";
import { PanneauVisualisation, type PanneauVisualisationProps } from "./PanneauVisualisation";
import {
  calquesVisualisation, cameraScene, cibleDecodee, commandeApparence, commandeMiseAJourScene, commandeNouvelleScene, commandeRetraitApparence,
  commandeSuppressionScene, hautCamera, LIBELLES_FINITION, LIBELLES_MODE, OUTILS_VISUALISATION, parametresMateriau, prochainNomScene, TYPES_RENDU, versLocal3d,
} from "./scenes-ui";

const en = dico as Record<string, string>;
/** PNG 1×1 minimal (signature, IHDR, IDAT, IEND), CRC exacts. */
const PNG_1X1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const base = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
]);
const camera = cameraScene("perspective", { x: 4.123456, y: -3, z: 2 }, { x: 0, y: 0, z: -0.00001 }, 45);

describe("Provenance PNG (bloc iTXt)", () => {
  it("CRC-32 de référence ; insertion après IHDR, relue à l'identique, pixels intacts", () => {
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
    const texte = JSON.stringify({ nature: "rendu du modèle", scene: "Vue sud-est", revisionId: "r-1" });
    const png = insererTextePng(PNG_1X1, CLE_PROVENANCE_PNG, texte);
    expect(lireTextesPng(png)).toEqual({ [CLE_PROVENANCE_PNG]: texte });
    expect(png.length).toBe(PNG_1X1.length + 12 + CLE_PROVENANCE_PNG.length + 5 + new TextEncoder().encode(texte).length);
    // Avant et après le bloc inséré : les octets d'origine, dans l'ordre.
    expect([...png.subarray(0, 33)]).toEqual([...PNG_1X1.subarray(0, 33)]);
    expect([...png.subarray(png.length - (PNG_1X1.length - 33))]).toEqual([...PNG_1X1.subarray(33)]);
    expect(lireTextesPng(PNG_1X1)).toEqual({});
    expect(() => insererTextePng(new Uint8Array(40), CLE_PROVENANCE_PNG, "x")).toThrow(/PNG attendu/);
    const abime = png.slice(); abime[40]! ^= 1;
    expect(() => lireTextesPng(abime)).toThrow(/CRC invalide/);
  });
});

describe("Réglages de la vue → commandes de visualisation", () => {
  it("repère local-3d déclaré : identité arrondie au dixième de millimètre ; haut de caméra", () => {
    expect(versLocal3d({ x: 1.23456789, y: -0.00001, z: 2 })).toEqual({ x: 1.2346, y: 0, z: 2 });
    expect(camera).toEqual({ projection: "perspective", position: { x: 4.1235, y: -3, z: 2 }, target: { x: 0, y: 0, z: 0 }, fov: 45 });
    expect(cameraScene("orthographic", { x: 1, y: 2, z: 30 }, { x: 1, y: 2, z: 0 }, 12.5)).toMatchObject({ projection: "orthographic", height: 12.5 });
    expect(hautCamera({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
    expect(hautCamera({ x: 5, y: -5, z: 5 }, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("nouvelle scène, mise à jour, suppression : acceptées par le modèle, refus explicites", () => {
    const d = base();
    expect(calquesVisualisation(d).map((c) => [c.id, c.visible, c.implicite])).toEqual([["default", true, true], ["murs", true, false], ["cache", false, false]]);
    expect(prochainNomScene(d)).toBe("Scène 1");
    expect(commandeNouvelleScene("s1", { nom: " ", calques: [], mode: "shaded" }, camera)).toEqual({ erreur: "Saisissez le nom de la scène." });
    const r = commandeNouvelleScene("s1", { nom: " Vue sud ", calques: ["default", "murs", "murs"], mode: "shaded" }, camera);
    if (!("commandes" in r)) throw new Error("refus");
    const d1 = applyStudioCommands(d, r.commandes);
    expect(studioScenes(d1)).toEqual([{ id: "s1", type: "scene", frame: "local-3d", name: "Vue sud", camera, visibleLayers: ["default", "murs"], displayMode: "shaded" }]);
    expect(prochainNomScene(d1)).toBe("Scène 2");
    expect(commandeMiseAJourScene(d1, null, { nom: "x", calques: [], mode: "wireframe" }, camera)).toEqual({ erreur: "Choisissez d’abord la scène à mettre à jour." });
    const m = commandeMiseAJourScene(d1, "s1", { nom: "Vue sud", calques: ["cache"], mode: "wireframe" }, camera);
    if (!("commandes" in m)) throw new Error("refus");
    expect(studioScenes(applyStudioCommands(d1, m.commandes))[0]).toMatchObject({ visibleLayers: ["cache"], displayMode: "wireframe" });
    expect(commandeSuppressionScene(d1, "absente")).toEqual({ erreur: "Choisissez d’abord la scène à supprimer." });
    const s = commandeSuppressionScene(d1, "s1");
    if (!("commandes" in s)) throw new Error("refus");
    expect(applyStudioCommands(d1, s.commandes).scenes).toBeUndefined();
  });

  it("apparence : une par cible (remplacée, jamais doublée), retrait ; finitions d'affichage", () => {
    const d = base();
    expect(cibleDecodee("object:b1")).toEqual({ kind: "object", id: "b1" });
    expect(cibleDecodee("layer:")).toBeNull();
    expect(commandeApparence(d, "", "#ff0000", "", () => "a")).toEqual({ erreur: "Choisissez d’abord le calque ou l’objet à habiller." });
    const a = commandeApparence(d, "object:b1", "#FF0000", "gloss", () => "ap1");
    if (!("commandes" in a)) throw new Error("refus");
    expect(a.commandes).toEqual([{ toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "b1" }, color: "#ff0000", finish: "gloss" } }]);
    const d1 = applyStudioCommands(d, a.commandes);
    const b = commandeApparence(d1, "object:b1", "#00ff00", "", () => "jamais");
    if (!("commandes" in b)) throw new Error("refus");
    const d2 = applyStudioCommands(d1, b.commandes);
    expect(d2.scenes).toEqual([{ id: "ap1", type: "appearance", target: { kind: "object", id: "b1" }, color: "#00ff00" }]);
    expect(commandeRetraitApparence(d, "object:b1")).toEqual({ erreur: "Cette cible n’a pas d’apparence d’affichage à retirer." });
    const c = commandeRetraitApparence(d2, "object:b1");
    if (!("commandes" in c)) throw new Error("refus");
    expect(applyStudioCommands(d2, c.commandes).scenes).toBeUndefined();
    expect(parametresMateriau(undefined)).toEqual({ roughness: 0.85, metalness: 0, opacity: 1, transparent: false });
    expect(parametresMateriau("glass").transparent).toBe(true);
  });

  it("les outils de la vue 3D sont exactement la famille « Visualisation » du registre", () => {
    expect([...OUTILS_VISUALISATION].sort()).toEqual(STUDIO_TOOLS.filter((t) => t.groupe === "visualisation").map((t) => t.toolId).sort());
  });
});

describe("Rendus : seul le rendu du modèle existe", () => {
  const props = (over: Partial<PanneauVisualisationProps> = {}): PanneauVisualisationProps => ({
    doc: base(), modifiable: true, sceneChoisie: null, sceneActive: null, nom: "", calques: ["default"], mode: "shaded-edges", cible: "", couleur: "#888888", finition: "",
    rendu: { possible: true, raison: null }, surChoix: () => {}, surNom: () => {}, surCalques: () => {}, surMode: () => {}, surVueDessin: () => {},
    surCible: () => {}, surCouleur: () => {}, surFinition: () => {}, surAction: () => {}, ...over,
  });
  it("trois types annoncés ; deux indisponibles sans aucun bouton ; un seul bouton d'export", () => {
    expect(TYPES_RENDU.map((t) => [t.id, t.disponible])).toEqual([["rendu-modele", true], ["illustration-ia", false], ["exploration-libre", false]]);
    const html = renderToStaticMarkup(createElement(PanneauVisualisation, props()));
    for (const id of ["illustration-ia", "exploration-libre"]) {
      const li = new RegExp(`<li data-studio-rendu="${id}" data-studio-disponible="non">(.*?)</li>`).exec(html);
      expect(li, id).not.toBeNull();
      expect(li![1]).not.toMatch(/<button|<a /);
      expect(li![1]).toContain("Non disponible");
    }
    expect(html.match(/data-studio-exporter-png/g)).toHaveLength(1);
    expect(html).toMatch(/<li data-studio-rendu="rendu-modele" data-studio-disponible="oui">/);
    // Brouillon non enregistré : bouton désactivé, raison affichée.
    const inactif = renderToStaticMarkup(createElement(PanneauVisualisation, props({ rendu: { possible: false, raison: "Enregistrez d’abord : le rendu porte sur une révision enregistrée, pas sur les modifications non enregistrées." } })));
    expect(inactif).toMatch(/<button type="button" disabled="" data-studio-exporter-png/);
    // Lecture seule : création et apparence désactivées, rappel possible d'une scène choisie.
    const lecture = renderToStaticMarkup(createElement(PanneauVisualisation, props({ modifiable: false })));
    expect(lecture).toMatch(/disabled="" data-studio-scene-action="studio.scene.creer"/);
  });

  it("chaque libellé de la visualisation a sa traduction anglaise", () => {
    const textes = [
      ...TYPES_RENDU.flatMap((t) => [t.libelle, t.description]), ...Object.values(LIBELLES_MODE), ...Object.values(LIBELLES_FINITION),
      ...STUDIO_TOOLS.filter((t) => t.groupe === "visualisation").map((t) => t.libelleFR), "Exporter le rendu PNG", "Visualisation",
      "Scènes", "Rendus", "Apparence d’affichage", "Calques montrés", "Mode d’affichage", "Nom de la scène",
    ];
    for (const t of textes) expect(en[t], t).toBeTruthy();
  });
});
