/**
 * TR-EX-005 / EX-005 — Planche 3D : édition de groupe (plusieurs solides libres déplacés, pivotés, mis à l'échelle ou
 * supprimés ensemble, en un seul lot et un seul pas d'annulation), sur une étude neuve sans aucun dessin 2D ; et A.3-03
 * côté interface : pivot autour des axes horizontaux et échelle 3D depuis la vue 3D.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioQuantitesSolides, type StudioBox, type StudioCommand } from "@parcours/atelier-model";
import { annulerBrouillon, appliquerBrouillon, creerBrouillon, documentBrouillon } from "../planche2d/brouillon";
import { basculerMembre, commandeDeplacerGroupe, commandeEchelleGroupe, commandePivoterGroupe, commandeSupprimerGroupe, membresGroupe } from "./groupe-3d";
import { commandeEchelle3d, commandePivot } from "./volume-libre";

const boite = (id: string, x: number): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 2 } });
/** Étude neuve : aucun objet 2D, trois boîtes posées directement dans l'espace. */
const neuf = () => applyStudioCommands(newStudioDocument("g"), [boite("A", 0), boite("B", 3), boite("C", 6)]);
const lot = (r: ReturnType<typeof commandeDeplacerGroupe>) => { if ("erreur" in r) throw new Error(r.erreur); return r.commandes; };

describe("TR-EX-005 — édition de groupe dans la vue 3D", () => {
  it("étude neuve sans dessin 2D : choisir A et C, les déplacer ensemble en un seul lot ; B ne bouge pas ; une annulation rend l'état initial", () => {
    const d = neuf();
    expect(d.objects).toEqual([]);
    let g = basculerMembre(new Set(), "A"); g = basculerMembre(g, "C");
    const ids = membresGroupe(d, g);
    expect(ids).toEqual(["A", "C"]);
    const b0 = creerBrouillon(d);
    const b1 = appliquerBrouillon(b0, lot(commandeDeplacerGroupe(ids, { dx: 1, dy: 2, dz: 0.5 })));
    const doc = documentBrouillon(b1);
    expect(doc.solides!.map((s) => [s.id, s.placement.origin])).toEqual([["A", { x: 1, y: 2, z: 0.5 }], ["B", { x: 3, y: 0, z: 0 }], ["C", { x: 7, y: 2, z: 0.5 }]]);
    // Un seul pas d'annulation pour tout le groupe.
    expect(b1.pas).toHaveLength(1);
    expect(documentBrouillon(annulerBrouillon(b1)).solides).toEqual(d.solides);
  });

  it("pivoter le groupe autour d'un axe vertical, le mettre à l'échelle (volumes compris), puis le supprimer : chaque fois un lot, le reste intact", () => {
    const d = neuf();
    const tourne = applyStudioCommands(d, lot(commandePivoterGroupe(["A", "B"], { x: 0, y: 0 }, 90)));
    expect(tourne.solides!.find((s) => s.id === "B")!.placement.origin).toEqual({ x: 0, y: 3, z: 0 });
    expect(tourne.solides!.find((s) => s.id === "C")).toEqual(d.solides!.find((s) => s.id === "C"));
    const agrandi = applyStudioCommands(d, lot(commandeEchelleGroupe(["A", "B"], { x: 0, y: 0 }, 2)));
    expect(agrandi.solides!.find((s) => s.id === "B")).toMatchObject({ width: 2, height: 4, placement: { origin: { x: 6, y: 0, z: 0 } } });
    expect(studioQuantitesSolides(agrandi).items.map((q) => q.volume)).toEqual([16, 16, 2]);
    const supprime = applyStudioCommands(d, lot(commandeSupprimerGroupe(["A", "C"])));
    expect(supprime.solides!.map((s) => s.id)).toEqual(["B"]);
  });

  it("garde-fous : moins de deux membres, déplacement nul, facteur 1 → refus lisible, aucune commande ; un membre supprimé sort du groupe", () => {
    expect(commandeDeplacerGroupe(["A"], { dx: 1, dy: 0, dz: 0 })).toEqual({ erreur: "Choisissez au moins deux solides pour éditer un groupe." });
    expect(commandeDeplacerGroupe(["A", "B"], { dx: 0, dy: 0, dz: 0 })).toHaveProperty("erreur");
    expect(commandeEchelleGroupe(["A", "B"], { x: 0, y: 0 }, 1)).toHaveProperty("erreur");
    expect(membresGroupe(applyStudioCommands(neuf(), [{ toolId: "studio.solide.supprimer", params: { ids: ["C"] } }]), new Set(["A", "C"]))).toEqual(["A"]);
  });
});

describe("A.3-03 — formulaires de la vue 3D : pivot autour d'un axe horizontal, échelle 3D", () => {
  it("le pivot choisit l'axe (z par défaut) ; l'échelle 3D multiplie dimensions et volume", () => {
    expect(commandePivot("A", 90)).toEqual({ commandes: [{ toolId: "studio.solide.pivoter", params: { id: "A", angle: Math.PI / 2 } }] });
    const r = commandePivot("A", 90, "y");
    expect(r).toEqual({ commandes: [{ toolId: "studio.solide.pivoter", params: { id: "A", angle: Math.PI / 2, axe: "y" } }] });
    const couche = applyStudioCommands(neuf(), lot(r));
    expect(couche.solides![0]!.placement.basculement).toEqual({ x: 0, y: Math.PI / 2 });
    const e = applyStudioCommands(couche, lot(commandeEchelle3d(["A"], { x: 0, y: 0 }, 3)));
    expect(e.solides![0] as StudioBox).toMatchObject({ width: 3, depth: 3, height: 6, placement: { basculement: { x: 0, y: Math.PI / 2 } } });
    expect(commandeEchelle3d([], { x: 0, y: 0 }, 2)).toHaveProperty("erreur");
  });
});
