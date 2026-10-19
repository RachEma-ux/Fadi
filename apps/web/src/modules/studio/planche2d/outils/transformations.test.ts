/**
 * Outils de transformation de la planche (Copier, Rotation, Symétrie, Échelle) : clics au pointeur, aperçu, saisie
 * numérique (degrés convertis en radians), refus affichés, aides ; barre Modification, icône et raccourci propres.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS, type StudioCommand } from "@parcours/atelier-model";
import type { PointPose } from "../Dessin2D";
import { cibleRaccourci, OUTILS_MODES, outilsDeBarre } from "../raccourcis";
import { champsFormulaire, formulaireInactif, soumettre, VALEURS_INITIALES } from "./formulaire";
import { aidePlanche, outilPlanche } from "./index";
import { angleDegres, facteurPoints, OUTILS_TRANSFORMATION } from "./modification";
import type { ContexteClic } from "./type";

const pp = (x: number, y: number): PointPose => ({ point: { x, y }, accroche: null });
const ctx = (selection: string[] = ["l", "r"], options = { copies: 3, garder: true, volumes: false }): ContexteClic => {
  let n = 0;
  return { nouvelId: () => `id-${++n}`, layerId: undefined, decalageCote: 0.5, tolerance: 0.1, selection, options };
};
const etat = (outil: (typeof STUDIO_TOOLS)[number]["toolId"], suite: { x: number; y: number }[] = []) => ({ outil, trace: pp(0, 0), suite, modeArc: "trois-points" as const });
const commandes = (a: ReturnType<NonNullable<ReturnType<typeof outilPlanche>>["clic"]>): StudioCommand[] => (a.type === "commandes" ? a.commandes : []);

const doc = () => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 0 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 1, y: 1 }, width: 2, height: 1 } },
]);

describe("Transformations au pointeur", () => {
  it("Copier : base puis destination, nombre de copies saisi, identifiants dérivés d'un préfixe neuf", () => {
    const a = outilPlanche("studio.dessin.copier")!.clic(etat("studio.dessin.copier"), pp(0.1 + 0.2, 1), ctx());
    expect(a).toEqual({ type: "commandes", apres: "annuler-trace", commandes: [{ toolId: "studio.dessin.copier", params: { ids: ["l", "r"], dx: 0.3, dy: 1, copies: 3, prefix: "id-1" } }] });
    const d = applyStudioCommands(doc(), commandes(a));
    expect(d.objects.map((o) => o.id)).toEqual(["l", "r", "id-1-1-0", "id-1-1-1", "id-1-2-0", "id-1-2-1", "id-1-3-0", "id-1-3-1"]);
    expect(outilPlanche("studio.dessin.copier")!.horsSelection).toBe(true);
    expect(outilPlanche("studio.dessin.copier")!.clic(etat("studio.dessin.copier"), pp(1, 0), ctx([]))).toEqual({ type: "erreur", message: "Sélectionnez d’abord les objets à transformer." });
  });

  it("Rotation : centre, référence, cible ; l'angle passe des degrés aux radians", () => {
    const o = outilPlanche("studio.dessin.rotation")!;
    expect(o.clic(etat("studio.dessin.rotation"), pp(1, 0), ctx())).toEqual({ type: "sommet", suite: [{ x: 1, y: 0 }] });
    const a = o.clic(etat("studio.dessin.rotation", [{ x: 1, y: 0 }]), pp(0, 3), ctx());
    expect(a).toEqual({ type: "commandes", apres: "annuler-trace", commandes: [{ toolId: "studio.dessin.rotation", params: { ids: ["l", "r"], center: { x: 0, y: 0 }, angle: Math.PI / 2 } }] });
    expect(applyStudioCommands(doc(), commandes(a)).objects[1]).toEqual({ id: "r", type: "rectangle", origin: { x: -2, y: 1 }, width: 1, height: 2 });
    expect(o.clic(etat("studio.dessin.rotation"), pp(0, 0), ctx())).toEqual({ type: "erreur", message: "Le point doit être distinct du centre." });
    expect(angleDegres({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 })).toBe(-90);
    expect(angleDegres({ x: 0, y: 0 }, { x: -1, y: 0.0001 }, { x: -1, y: -0.0001 })).toBeCloseTo(0.011459, 6);
    // Aperçu : les commandes du clic, rien tant que la référence n'est pas posée.
    expect(o.apercuCommandes!(etat("studio.dessin.rotation"), { x: 2, y: 2 }, ctx())).toBeNull();
    expect(o.apercuCommandes!(etat("studio.dessin.rotation", [{ x: 1, y: 0 }]), { x: 0, y: 3 }, ctx())).toEqual(commandes(a));
  });

  it("Symétrie : deux points de l'axe ; source gardée (préfixe) ou transformée", () => {
    const o = outilPlanche("studio.dessin.symetrie")!;
    expect(o.clic(etat("studio.dessin.symetrie"), pp(0, 1), ctx())).toEqual({ type: "commandes", apres: "annuler-trace", commandes: [{ toolId: "studio.dessin.symetrie", params: { ids: ["l", "r"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: true, prefix: "id-1" } }] });
    const sans = o.clic(etat("studio.dessin.symetrie"), pp(0, 1), ctx(["l"], { copies: 1, garder: false, volumes: false }));
    expect(commandes(sans)[0]!.params).toEqual({ ids: ["l"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: false });
    expect(applyStudioCommands(doc(), commandes(sans)).objects[0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: -2, y: 0 } });
  });

  it("Échelle : centre, référence, cible ; facteur = rapport des distances ; « volumes aussi » transmis", () => {
    const o = outilPlanche("studio.dessin.echelle")!;
    const a = o.clic(etat("studio.dessin.echelle", [{ x: 1, y: 0 }]), pp(0, 2), ctx(["l"], { copies: 1, garder: true, volumes: true }));
    expect(commandes(a)).toEqual([{ toolId: "studio.dessin.echelle", params: { ids: ["l"], center: { x: 0, y: 0 }, factor: 2, includeVolumes: true } }]);
    expect(facteurPoints({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 0 })).toBe(0.333333);
  });
});

describe("Transformations par la saisie numérique", () => {
  const saisie = (tool: (typeof STUDIO_TOOLS)[number]["toolId"], v = {}, selectionIds = ["l"]) => soumettre({
    tool, values: { ...VALEURS_INITIALES, ...v }, sommetsTexte: "", fermee: false, selected: null, selectionIds, drawing: doc(), creation: { nouvelId: () => "p", layerId: undefined, decalageCote: 0.5 },
  });
  it("champs, libellés, boutons et sélection requise", () => {
    expect(champsFormulaire("studio.dessin.copier", null).fields).toEqual(["dx", "dy", "copies"]);
    expect(champsFormulaire("studio.dessin.rotation", null).fields).toEqual(["x", "y", "angle"]);
    expect(champsFormulaire("studio.dessin.symetrie", null).fields).toEqual(["x", "y", "a", "b", "garder"]);
    expect(champsFormulaire("studio.dessin.echelle", null).fields).toEqual(["x", "y", "facteur", "volumes"]);
    expect(champsFormulaire("studio.dessin.rotation", null).label("angle")).toBe("Angle (°)");
    expect(champsFormulaire("studio.dessin.echelle", null).bouton).toBe("Mettre la sélection à l’échelle");
    for (const t of OUTILS_TRANSFORMATION) {
      expect(formulaireInactif(t, [], null)).toBe(true);
      expect(formulaireInactif(t, ["l"], null)).toBe(false);
    }
  });
  it("commandes produites, degrés en radians, refus affichés", () => {
    expect(saisie("studio.dessin.rotation", { x: 1, y: 2, angle: 90 })).toMatchObject({ type: "commandes", commandes: [{ toolId: "studio.dessin.rotation", params: { center: { x: 1, y: 2 }, angle: Math.PI / 2 } }] });
    expect(saisie("studio.dessin.rotation", { angle: 360 })).toEqual({ type: "erreur", message: "Saisissez un angle non nul (hors multiple de 360°), en degrés." });
    expect(saisie("studio.dessin.copier", { dx: 2, dy: 0, copies: 3 })).toMatchObject({ commandes: [{ params: { ids: ["l"], dx: 2, dy: 0, copies: 3, prefix: "p" } }] });
    expect(saisie("studio.dessin.copier", { copies: 2.5 })).toEqual({ type: "erreur", message: "Le nombre de copies est un entier de 1 à 1000." });
    expect(saisie("studio.dessin.symetrie", { x: 0, y: 0, a: 0, b: 0 })).toEqual({ type: "erreur", message: "Les deux points de l’axe doivent être distincts." });
    expect(saisie("studio.dessin.symetrie", { garder: 0 })).toMatchObject({ commandes: [{ params: { keepSource: false } }] });
    expect(saisie("studio.dessin.echelle", { facteur: 0 })).toEqual({ type: "erreur", message: "Le facteur doit être strictement positif." });
    expect(saisie("studio.dessin.echelle", { facteur: 0.5, volumes: 1 })).toMatchObject({ commandes: [{ params: { factor: 0.5, includeVolumes: true } }] });
    expect(saisie("studio.dessin.echelle", {}, [])).toEqual({ type: "erreur", message: "Sélectionnez d’abord les objets à transformer." });
  });
});

describe("Transformations : règle d'or et aides", () => {
  it("outils « mode » de la barre Modification, raccourcis propres", () => {
    expect(outilsDeBarre("modification").map((t) => t.toolId)).toEqual(["studio.dessin.deplacer", "studio.dessin.modifier", "studio.dessin.decaler", "studio.dessin.supprimer", ...OUTILS_TRANSFORMATION]);
    for (const t of OUTILS_TRANSFORMATION) expect(OUTILS_MODES.has(t)).toBe(true);
    expect(cibleRaccourci("D")).toEqual({ type: "outil", toolId: "studio.dessin.copier" });
    expect(cibleRaccourci("Shift+R")).toEqual({ type: "outil", toolId: "studio.dessin.rotation" });
    expect(cibleRaccourci("I")).toEqual({ type: "outil", toolId: "studio.dessin.symetrie" });
    expect(cibleRaccourci("S")).toEqual({ type: "outil", toolId: "studio.dessin.echelle" });
    // Maj+S reste l'accrochage aux sommets.
    expect(cibleRaccourci("Shift+S")).toEqual({ type: "commande", id: "accrochage-sommets" });
  });
  it("aides : sélection requise au repos, étapes pendant le tracé", () => {
    const e = { trace: null, suite: [], modeArc: "trois-points" as const, lectureSeule: false };
    expect(aidePlanche({ ...e, outil: "studio.dessin.rotation", moveWithPointer: false })).toBe("Sélectionnez d’abord les objets à transformer (clic, Maj + clic ou rectangle).");
    expect(aidePlanche({ ...e, outil: "studio.dessin.echelle", moveWithPointer: true })).toContain("le centre et le facteur");
    expect(aidePlanche({ ...e, outil: "studio.dessin.rotation", trace: pp(0, 0), moveWithPointer: true })).toBe("Centre placé. Cliquez un point de référence.");
    expect(aidePlanche({ ...e, outil: "studio.dessin.symetrie", trace: pp(0, 0), moveWithPointer: true })).toContain("second point de l’axe");
  });
});
