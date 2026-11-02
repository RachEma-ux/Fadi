/**
 * TR-EX-023 (cas positif) — repères document / local d'objet / système de projet : conversions explicites par des
 * transformations versionnées, vérifiées et tracées, unités explicites ; jamais de mélange de repères.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, StudioValidationError } from "./document-2d.js";
import {
  studioComposerTransformations, studioConvertirPoint, studioDepuisProjet, studioInverserTransformation, studioTransformationPose, studioTransformationProjet,
  studioTransformationRepere, studioVerifierTransformation, studioVersProjet, type StudioTransformationRepere,
} from "./reperes.js";
import { studioPrimitivesSymbole } from "./graphismes/graphismes.js";

const refus = (f: () => unknown): string => { try { f(); } catch (e) { if (e instanceof StudioValidationError) return e.message; throw e; } return ""; };

describe("TR-EX-023 — système de projet et transformations versionnées document / local / projet", () => {
  it("cas positif : un point du document converti explicitement vers le système de projet (version 1, puis version 2), valeurs et unité comparées, trace de la transformation", () => {
    // Système de projet déclaré : origine du document en (2 600 000 ; 1 200 000) m, rotation 90°.
    let d = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.repere.projet", params: { version: 1, origine: { x: 2_600_000, y: 1_200_000 }, rotation: Math.PI / 2 } }]);
    const p1 = studioVersProjet(d.systemeProjet, { x: 3, y: 1 });
    expect(p1.repere).toBe("projet");
    expect(p1.unite).toBe("m");
    expect(p1.x).toBeCloseTo(2_600_000 - 1, 6);
    expect(p1.y).toBeCloseTo(1_200_000 + 3, 6);
    expect(p1.trace).toEqual({ de: "local-2d", vers: "projet", version: 1, unite: "m" });
    // Version 2 ajoutée (translation seule) : la version 1 reste lisible, aucune n'est réécrite.
    d = applyStudioCommands(d, [{ toolId: "studio.repere.projet", params: { version: 2, origine: { x: 10, y: 20 }, rotation: 0 } }]);
    expect(d.systemeProjet?.versions.map((v) => v.version)).toEqual([1, 2]);
    const p2 = studioVersProjet(d.systemeProjet, { x: 3, y: 1 });
    expect([p2.x, p2.y, p2.trace.version]).toEqual([13, 21, 2]);
    const p1bis = studioVersProjet(d.systemeProjet, { x: 3, y: 1 }, 1);
    expect([p1bis.x, p1bis.y, p1bis.trace.version]).toEqual([p1.x, p1.y, 1]);
    // Retour exact dans le document par l'inverse de la même version.
    const retour = studioDepuisProjet(d.systemeProjet, { x: p1.x, y: p1.y }, 1);
    expect(retour.repere).toBe("local-2d");
    expect(retour.x).toBeCloseTo(3, 6);
    expect(retour.y).toBeCloseTo(1, 6);
    // Le document enregistré se relit tel quel (versions validées).
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d))).systemeProjet).toEqual(d.systemeProjet);
  });

  it("local d'objet → document → projet : la pose d'un symbole (position, rotation, échelle) composée avec le système de projet", () => {
    const pose = studioTransformationPose({ x: 5, y: 5 }, Math.PI, 2);
    expect(pose).toMatchObject({ de: "local-objet", vers: "local-2d", version: 1, echelle: 2 });
    const doc = studioConvertirPoint({ repere: "local-objet", unite: "m", x: 0.5, y: 0 }, pose);
    expect(doc.x).toBeCloseTo(4, 12);
    expect(doc.y).toBeCloseTo(5, 12);
    const projet = studioTransformationProjet({ versions: [{ version: 1, origine: { x: 100, y: 0 }, rotation: 0 }] });
    const compose = studioComposerTransformations(pose, projet);
    expect(compose).toMatchObject({ de: "local-objet", vers: "projet", version: 1 });
    const q = studioConvertirPoint({ repere: "local-objet", unite: "m", x: 0.5, y: 0 }, compose);
    expect(q.x).toBeCloseTo(104, 9);
    expect(q.y).toBeCloseTo(5, 9);
    // Le symbole est tracé par cette même pose : son premier trait part du point converti.
    const s = studioPrimitivesSymbole({ symbole: "croix", position: { x: 5, y: 5 }, rotation: Math.PI, echelle: 2 });
    const trait = s[0]!;
    expect(trait.genre).toBe("segment");
    if (trait.genre === "segment") { expect(trait.b.x).toBeCloseTo(doc.x, 12); expect(trait.a.x).toBeCloseTo(6, 12); }
  });

  it("transformations vérifiées : aller-retour exact, inverse, échelle et unités explicites ; une transformation incohérente est refusée", () => {
    const t: StudioTransformationRepere = { de: "local-2d", vers: "projet", version: 3, rotation: 0.7, echelle: 1, translation: { x: 1e6, y: -2e5 }, unite: "m" };
    expect(studioVerifierTransformation(t).verifiee).toBe(true);
    const inv = studioInverserTransformation(t);
    expect(inv).toMatchObject({ de: "projet", vers: "local-2d", version: 3 });
    const a = studioConvertirPoint({ repere: "local-2d", unite: "m", x: 12.5, y: -4 }, t);
    const b = studioConvertirPoint({ repere: "projet", unite: "m", x: a.x, y: a.y }, inv);
    expect(b.x).toBeCloseTo(12.5, 6);
    expect(b.y).toBeCloseTo(-4, 6);
    expect(refus(() => studioTransformationRepere({ ...t, echelle: 0 }))).toContain("échelle strictement positive");
    expect(refus(() => studioTransformationRepere({ ...t, version: 0 }))).toContain("version entière");
    expect(refus(() => studioTransformationRepere({ ...t, unite: "px" }))).toContain("unité m attendue");
    expect(refus(() => studioTransformationRepere({ ...t, vers: "local-2d" }))).toContain("identiques");
  });

  it("cas négatifs : pixels, repère d'écran, repère géographique ou repère qui ne correspond pas à la transformation — refus explicites, rien n'est converti", () => {
    const t = studioTransformationProjet({ versions: [{ version: 1, origine: { x: 0, y: 0 }, rotation: 0 }] });
    expect(refus(() => studioConvertirPoint({ repere: "local-2d", unite: "px" as "m", x: 1, y: 1 }, t))).toContain("pixels");
    expect(refus(() => studioConvertirPoint({ repere: "ecran" as "local-2d", unite: "m", x: 1, y: 1 }, t))).toContain("repère inconnu");
    expect(refus(() => studioConvertirPoint({ repere: "projet", unite: "m", x: 1, y: 1 }, t))).toContain("jamais mélangés");
    expect(refus(() => studioConvertirPoint({ repere: "geographique", unite: "m", x: 1, y: 1 }, t))).toContain("jamais mélangés");
    expect(refus(() => studioTransformationRepere({ ...t, de: "geographique" }))).toContain("géographique");
    // Sans système déclaré, aucune conversion vers le projet n'est supposée.
    expect(refus(() => studioVersProjet(undefined, { x: 0, y: 0 }))).toContain("non déclaré");
    expect(refus(() => studioVersProjet({ versions: [{ version: 1, origine: { x: 0, y: 0 }, rotation: 0 }] }, { x: 0, y: 0 }, 4))).toContain("version 4 inconnue");
  });

  it("commande studio.repere.projet : version suivante exigée (jamais réécrite), versions sans trou à la validation", () => {
    const d = newStudioDocument("d");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.repere.projet", params: { version: 2, origine: { x: 0, y: 0 }, rotation: 0 } }]))).toContain("version 1 attendue");
    const d1 = applyStudioCommands(d, [{ toolId: "studio.repere.projet", params: { version: 1, origine: { x: 0, y: 0 }, rotation: 0 } }]);
    expect(refus(() => applyStudioCommands(d1, [{ toolId: "studio.repere.projet", params: { version: 1, origine: { x: 5, y: 0 }, rotation: 0 } }]))).toContain("version 2 attendue");
    expect(refus(() => validateStudioDocument({ ...d, systemeProjet: { versions: [{ version: 2, origine: { x: 0, y: 0 }, rotation: 0 }] } }))).toContain("sans trou");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.repere.projet", params: { version: 1, origine: { x: 0, y: 0 }, rotation: 7 } }]))).toContain("rotation");
  });
});
