import { describe, expect, it } from "vitest";
import type { StudioShapeBase, StudioShapeType } from "../noyau/types.js";
import { STUDIO_TYPES_OBJETS } from "./index.js";
import type { StudioShape } from "./formes.js";

/**
 * Inversion du socle (le noyau ne connaît aucun objet) : les discriminants nommés au socle (`StudioShapeType`) sont
 * exactement ceux de l'union des objets, et chaque forme étend la forme minimale du socle. Contrôles de compilation
 * (`tsc`), doublés d'un contrôle à l'exécution sur la table des types.
 */
type Egal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const discriminantsAccordes: Egal<StudioShape["type"], StudioShapeType> = true;
const formesDuSocle: [StudioShape] extends [StudioShapeBase] ? true : false = true;

describe("objets/formes : accord avec le socle", () => {
  it("discriminants du socle = types de la table des objets", () => {
    expect(discriminantsAccordes && formesDuSocle).toBe(true);
    const socle: Record<StudioShapeType, true> = { line: true, rectangle: true, circle: true, arc: true, polyline: true };
    expect(Object.keys(STUDIO_TYPES_OBJETS).sort()).toEqual(Object.keys(socle).sort());
  });
});
