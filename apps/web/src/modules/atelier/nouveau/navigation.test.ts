import { describe, expect, it } from "vitest";
import { NAVIGATION_DEFAUT } from "./etat-ui";
import { borneSensibilite, facteurPan, interpreterMolette, lireReglagesNavigation, reglagesOrbite } from "./navigation";

const m = (p: Partial<{ deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; shiftKey: boolean }>) => ({ deltaX: 0, deltaY: 0, ctrlKey: false, shiftKey: false, ...p });

describe("navigation configurable (D-157)", () => {
  it("souris : molette = zoom (vers le haut rapproche), Maj = panoramique en plan, inversion et sensibilité", () => {
    const g = interpreterMolette(m({ deltaY: -100 }), NAVIGATION_DEFAUT);
    expect(g.type).toBe("zoom");
    expect(g.type === "zoom" && g.facteur).toBeGreaterThan(1);
    const inv = interpreterMolette(m({ deltaY: -100 }), { ...NAVIGATION_DEFAUT, inverserZoom: true });
    expect(inv.type === "zoom" && inv.facteur).toBeLessThan(1);
    const fort = interpreterMolette(m({ deltaY: -100 }), { ...NAVIGATION_DEFAUT, sensibiliteZoom: 2 });
    expect(fort.type === "zoom" && g.type === "zoom" && Math.log(fort.facteur) / Math.log(g.facteur)).toBeCloseTo(2);
    expect(interpreterMolette(m({ deltaY: 50, shiftKey: true }), NAVIGATION_DEFAUT)).toEqual({ type: "pan", dx: -50, dy: 0 });
    // Lignes converties en pixels.
    const lignes = interpreterMolette(m({ deltaY: -3, deltaMode: 1 }), NAVIGATION_DEFAUT);
    expect(lignes.type === "zoom" && lignes.facteur).toBeCloseTo(Math.exp(48 * 0.0015));
  });

  it("trackpad : pincement (Ctrl) = zoom, deux doigts = panoramique en plan, orbite en 3D, Maj = panoramique en 3D", () => {
    const t = { ...NAVIGATION_DEFAUT, peripherique: "trackpad" as const };
    expect(interpreterMolette(m({ deltaY: -10, ctrlKey: true }), t).type).toBe("zoom");
    expect(interpreterMolette(m({ deltaX: 4, deltaY: 6 }), t)).toEqual({ type: "pan", dx: -4, dy: -6 });
    expect(interpreterMolette(m({ deltaX: 4, deltaY: 6 }), t, true)).toEqual({ type: "orbite", dx: 4, dy: 6 });
    expect(interpreterMolette(m({ deltaX: 4, deltaY: 6, shiftKey: true }), t, true)).toEqual({ type: "pan", dx: -4, dy: -6 });
    expect(interpreterMolette(m({ deltaX: 4 }), { ...t, inverserPan: true, sensibilitePan: 2 })).toEqual({ type: "pan", dx: 8, dy: 0 });
  });

  it("bornes, OrbitControls et lecture tolérante des préférences enregistrées", () => {
    expect(borneSensibilite(10)).toBe(4);
    expect(borneSensibilite(0)).toBe(0.25);
    expect(borneSensibilite("x")).toBe(1);
    expect(facteurPan({ ...NAVIGATION_DEFAUT, inverserPan: true })).toBe(-1);
    expect(reglagesOrbite({ ...NAVIGATION_DEFAUT, inverserOrbite: true, sensibiliteZoom: 0.5, deuxDoigts: "orbite" })).toEqual({ vitesseZoom: 0.5, vitessePan: 1, vitesseOrbite: -1, boutonMilieu: "orbite", deuxDoigts: "orbite" });
    expect(lireReglagesNavigation(null, NAVIGATION_DEFAUT)).toEqual(NAVIGATION_DEFAUT);
    expect(lireReglagesNavigation({ peripherique: "joystick", sensibilitePan: 99, inverserZoom: "oui", inconnu: 1 }, NAVIGATION_DEFAUT)).toEqual({ ...NAVIGATION_DEFAUT, sensibilitePan: 4 });
    // Par défaut, le geste à deux doigts reste le panoramique (comportement antérieur conservé).
    expect(NAVIGATION_DEFAUT.deuxDoigts).toBe("pan");
  });
});
