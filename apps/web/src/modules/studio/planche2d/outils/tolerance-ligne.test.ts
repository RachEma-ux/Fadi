/**
 * TR-IF-002 (ADR-STUDIO-PILOTE-01, P-12) : tolérance contractuelle du geste Ligne, déclarée dans le contrat de commandes
 * `studio-commands/1` (`STUDIO_TOLERANCES_GESTES`) — une valeur saisie est engagée exactement ; une valeur pointée est
 * engagée à 1e-9 m près après accrochage. Chaîne réelle : moteur d'accrochage → point posé → outil Ligne → commande →
 * document (applyStudioCommands). Le cas négatif « Échap sur l'aperçu, aucune mutation » est contrôlé par la recette
 * (`apps/web/e2e/studio-preuves-d2.mjs`).
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_CONTRACT, STUDIO_TOLERANCES_GESTES, studioDansToleranceGeste, type StudioLine, type StudioPoint, type StudioShape } from "@parcours/atelier-model";
import { indexLineaire, MODES_ACCROCHAGE, resoudre, type ModeAccrochage, type ReglagesAccrochage } from "../accrochage";
import { pointPose } from "../accrochage/point-pose";
import { soumettre, VALEURS_INITIALES } from "./formulaire";
import { outilPlanche } from "./index";
import type { ActionOutil, ContexteClic } from "./type";

const ligne = (id: string, a: StudioPoint, b: StudioPoint): StudioShape => ({ id, type: "line", start: a, end: b });
const reglages = (o: Partial<ReglagesAccrochage> = {}): ReglagesAccrochage => ({ objets: true, modes: new Set<ModeAccrochage>(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45, ...o });
const contexte: ContexteClic = { nouvelId: () => "l-new", layerId: undefined, decalageCote: 0.5, tolerance: 0.2 };
/** Ligne engagée dans le document par l'action de l'outil. */
function engagee(doc: ReturnType<typeof newStudioDocument>, action: ActionOutil | { type: "decaler"; distance: number }): StudioLine {
  if (action.type !== "commandes") throw new Error(`action ${action.type}`);
  expect(action.commandes.map((c) => c.toolId)).toEqual(["studio.dessin.ligne"]);
  return applyStudioCommands(doc, action.commandes).objects.find((o) => o.id === "l-new") as StudioLine;
}

describe("TR-IF-002 — tolérance contractuelle du geste Ligne (saisie exacte, pointé à 1e-9 m après accrochage)", () => {
  it("TR-IF-002 [+] la tolérance est déclarée dans le contrat de commandes : saisie 0, pointé 1e-9 m", () => {
    expect(STUDIO_CONTRACT).toBe("studio-commands/1");
    expect(STUDIO_TOLERANCES_GESTES["studio.dessin.ligne"]).toEqual({ saisie: 0, pointe: 1e-9 });
    expect(Object.isFrozen(STUDIO_TOLERANCES_GESTES["studio.dessin.ligne"])).toBe(true);
  });

  it("TR-IF-002 [+] valeur saisie : la ligne engagée porte exactement les coordonnées tapées (écart nul)", () => {
    const doc = newStudioDocument("d");
    for (const [x, y, a, b] of [[0.1, 0.2, 1 / 3, 2 / 7], [100000.1, 100000.2, 100003.3, 99999.7], [-12.345678901, 0, 0.000000001, 7]] as const) {
      const action = soumettre({ tool: "studio.dessin.ligne", values: { ...VALEURS_INITIALES, x, y, a, b }, sommetsTexte: "", fermee: false, selected: null, selectionIds: [], drawing: doc, creation: contexte });
      const l = engagee(doc, action);
      expect(l.start).toEqual({ x, y });
      expect(l.end).toEqual({ x: a, y: b });
      expect(studioDansToleranceGeste("studio.dessin.ligne", "saisie", l.end, { x: a, y: b })).toBe(true);
    }
  });

  it("TR-IF-002 [+] valeur pointée : après accrochage (extrémité, intersection, milieu), la ligne engagée est à 1e-9 m au plus du point visé", () => {
    // Deux segments qui se coupent en un point irrationnel : x = y = 10/3 · (1 + 1e-7) n'est pas représentable exactement.
    const a = ligne("a", { x: 0, y: 0 }, { x: 10.000001, y: 10.000001 });
    const b = ligne("b", { x: 0, y: 6.6666673333 }, { x: 6.6666673333, y: 0 });
    const c = ligne("c", { x: 20.1, y: 3.3 }, { x: 25.7, y: 9.9 });
    const doc = applyStudioCommands(newStudioDocument("d"), [a, b, c].map((s) => ({ toolId: "studio.dessin.ligne" as const, params: s as StudioLine })));
    const index = indexLineaire(doc.objects);
    const t = 6.6666673333 / 2;
    const vises: [StudioPoint, StudioPoint, ModeAccrochage][] = [
      [{ x: 25.69, y: 9.91 }, { x: 25.7, y: 9.9 }, "extremite"],
      [{ x: t + 0.03, y: t - 0.02 }, { x: t, y: t }, "intersection"],
      [{ x: 22.93, y: 6.58 }, { x: (20.1 + 25.7) / 2, y: (3.3 + 9.9) / 2 }, "milieu"],
    ];
    const outil = outilPlanche("studio.dessin.ligne")!;
    for (const [curseur, vise, genre] of vises) {
      const repere = resoudre(index, { curseur, tolerance: 0.2, base: { x: -5, y: -5 } }, reglages());
      expect(repere?.genre).toBe(genre);
      const pose = pointPose(repere, curseur, null);
      const action = outil.clic({ outil: "studio.dessin.ligne", trace: { point: { x: -5, y: -5 }, accroche: null }, suite: [], modeArc: "trois-points" }, pose, contexte);
      const l = engagee(doc, action);
      expect(Math.hypot(l.end.x - vise.x, l.end.y - vise.y)).toBeLessThanOrEqual(1e-9);
      expect(studioDansToleranceGeste("studio.dessin.ligne", "pointe", l.end, vise)).toBe(true);
    }
  });

  it("TR-IF-002 [−] sans accrochage, un pointé à côté du point visé est hors tolérance (détecté), et un écart de 2e-9 m l'est aussi", () => {
    const doc = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.dessin.ligne", params: ligne("c", { x: 20.1, y: 3.3 }, { x: 25.7, y: 9.9 }) as StudioLine }]);
    const curseur = { x: 25.6912, y: 9.9087 };
    const sans = resoudre(indexLineaire(doc.objects), { curseur, tolerance: 0.2, base: null }, reglages({ objets: false }));
    expect(sans).toBeNull();
    const pose = pointPose(sans, curseur, null);
    expect(pose.point).toEqual({ x: 25.69, y: 9.91 });
    expect(studioDansToleranceGeste("studio.dessin.ligne", "pointe", pose.point, { x: 25.7, y: 9.9 })).toBe(false);
    expect(studioDansToleranceGeste("studio.dessin.ligne", "pointe", { x: 25.7 + 2e-9, y: 9.9 }, { x: 25.7, y: 9.9 })).toBe(false);
    expect(studioDansToleranceGeste("studio.dessin.ligne", "saisie", { x: 25.7 + 1e-12, y: 9.9 }, { x: 25.7, y: 9.9 })).toBe(false);
    expect(studioDansToleranceGeste("studio.dessin.ligne", "pointe", { x: Number.NaN, y: 9.9 }, { x: 25.7, y: 9.9 })).toBe(false);
  });
});
