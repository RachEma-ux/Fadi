/**
 * EX-054 — maintien de l'index 2D : cas nommés. Un index tenu à jour (incrémental, construit sur la révision A) puis
 * interrogé sur la révision B rend exactement la reconstruction de B : un objet supprimé, caché (calque masqué),
 * verrouillé (non sélectionnable) ou déplacé n'est jamais rendu d'après la révision A ; l'index n'a pas été reconstruit
 * (éléments conservés, seuls les changés réinsérés). Même chose pour les candidats d'accrochage.
 */
import { describe, expect, it } from "vitest";
import type { StudioDocument, StudioShape } from "@parcours/atelier-model";
import { candidatsObjets, indexLineaire, MODES_ACCROCHAGE, suiviAccrochage, type ReglagesAccrochage } from "./accrochage";
import { bilanIndexSelection, selectionParRectangle, selectionParRectangleLineaire } from "./selection";

const ligne = (id: string, x: number, y: number, layerId?: string): StudioShape => ({ id, type: "line", ...(layerId ? { layerId } : {}), start: { x, y }, end: { x: x + 1, y } });
const docA = (): StudioDocument => ({
  id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", dimensions: [], annotations: [],
  layers: [{ id: "L", name: "L", visible: true, locked: false }, { id: "V", name: "V", visible: true, locked: false }],
  objects: [ligne("a", 0, 0), ligne("b", 2, 0, "L"), ligne("c", 4, 0), ligne("v", 6, 0, "V"), ...Array.from({ length: 40 }, (_, i) => ligne(`f${i}`, 50 + i, 50))],
});
/** Révision B : c supprimé, b sur un calque masqué, v sur un calque verrouillé, a déplacé hors du rectangle, d ajouté dedans. */
const docB = (a: StudioDocument): StudioDocument => ({
  ...a,
  layers: [{ id: "L", name: "L", visible: false, locked: false }, { id: "V", name: "V", visible: true, locked: true }],
  objects: a.objects.filter((o) => o.id !== "c").map((o) => (o.id === "a" ? ligne("a", 20, 20) : o)).concat([ligne("d", 1, 1)]),
});
const P = { x: -1, y: -1 }, Q = { x: 8, y: 2 };

describe("index 2D cohérent avec la révision source, les calques et la sélection autorisée (EX-054)", () => {
  it("sélection : index de la révision A interrogé sur B = reconstruction de B ; supprimé, masqué, verrouillé, déplacé jamais rendus", () => {
    const a = docA();
    expect(selectionParRectangle(a, P, Q, 0).sort()).toEqual(["a", "b", "c", "v"]);
    const b = docB(a);
    const rendu = selectionParRectangle(b, P, Q, 0);
    expect(rendu).toEqual(selectionParRectangleLineaire(b, P, Q));
    expect(rendu).toEqual(["d"]);
    const bilan = bilanIndexSelection()!;
    // Maintien ciblé, pas une reconstruction : les 41 éléments inchangés sont conservés, seuls a (déplacé) et d sont insérés.
    expect(bilan.conserves).toBe(42);
    expect(bilan.inseres).toBe(2);
    expect(bilan.supprimes).toBe(2);
    // Retour à des calques visibles et déverrouillés : b et v reviennent, toujours sans reconstruction.
    const c = { ...b, layers: [{ id: "L", name: "L", visible: true, locked: false }, { id: "V", name: "V", visible: true, locked: false }] };
    expect(selectionParRectangle(c, P, Q, 0).sort()).toEqual(selectionParRectangleLineaire(c, P, Q).sort());
    expect(selectionParRectangle(c, P, Q, 0).sort()).toEqual(["b", "d", "v"]);
    expect(bilanIndexSelection()!.inseres).toBe(0);
  });

  it("accrochage : l'index suivi depuis A rend sur B les candidats de la reconstruction ; aucun point de l'objet supprimé ni de l'ancienne position", () => {
    const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
    const a = docA(), b = docB(a);
    const suivi = suiviAccrochage(0);
    suivi.indexer(a.objects);
    const idx = suivi.indexer(b.objects);
    expect(suivi.dernierBilan!.inseres).toBe(2);
    for (const curseur of [{ x: 4, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 20 }, { x: 1, y: 1 }]) {
      const requete = { curseur, tolerance: 0.6, base: null };
      const attendu = candidatsObjets(indexLineaire(b.objects), requete, reglages);
      const obtenu = candidatsObjets(idx, requete, reglages);
      expect(obtenu).toEqual(attendu);
      expect(JSON.stringify(obtenu)).not.toMatch(/"c"/);
    }
    expect(candidatsObjets(idx, { curseur: { x: 4.5, y: 0 }, tolerance: 0.3, base: null }, reglages)).toEqual([]);
  });
});
