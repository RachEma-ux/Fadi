import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioMesh3d } from "./mesh-3d.js";
import { studioAssemblerMaillage, studioMaillerObjets } from "./projections.js";
import { exportStudioObj, exportStudioStl, studioBilanExport3d, studioPiecesStep } from "./export-3d.js";
import { exportStudioIfc } from "./ifc.js";
import { studioRapportFidelite } from "./echanges/rapport-fidelite.js";
import { resultatSynthetique } from "./exacts.fixtures.js";
import { studioCaptureEpaississement, studioCommandeEpaississement, studioVerifierEpaississement } from "./surfaces-exactes.js";
import { STUDIO_LIMITES_EXACTS, studioIdsOperandes, validerSolideExact } from "./objets-3d/exacts.js";
import {
  STUDIO_LIMITES_SURFACES, studioAireApprocheeSurface, studioMaillageSurface, studioNoeudsUniformes, studioOperationNurbs, studioPointSurface,
  validerSurfaceLibre, type StudioSurfaceLibre,
} from "./objets-3d/surfaces-libres.js";

/**
 * X.1-05 — surfaces libres NURBS de Studio (modèle pur) : définition par pôles, degrés et poids, évaluation rationnelle
 * (Cox–de Boor), maillage d'affichage dérivé, commandes (créer, modifier, épaissir, supprimer), conversion explicite en
 * solide exact (surface conservée, R15), échanges. Les résultats du noyau sont SYNTHÉTIQUES ici (forme seulement) : le
 * noyau réel est testé par `@parcours/geometry-exact` (opération `nurbs`) et par l'API (recalcul du serveur).
 */

const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};
const appliquer = (d: StudioDocument, ...cs: unknown[]) => applyStudioCommands(d, cs as StudioCommand[]);

/** Quart de cylindre rationnel vertical de rayon R, hauteur L, axe en (0, 0) : arc de degré 2 (poids 1, √2/2, 1) × segment. */
function quartCylindre(id: string, R = 2, L = 3, over: Partial<StudioSurfaceLibre> = {}): StudioSurfaceLibre {
  const arc = [{ x: R, y: 0 }, { x: R, y: R }, { x: 0, y: R }], w = [1, Math.SQRT1_2, 1];
  const controle = [], poids = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { controle.push({ x: arc[i]!.x, y: arc[i]!.y, z: k * L }); poids.push(w[i]!); }
  return { id, type: "surface-libre", degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle, poids, ...over };
}
/** Bosse B-spline 3 × 3 de degré 2 × 2 : pôle central relevé de `h`, sans poids (non rationnelle). */
const bosse = (id: string, h = 1): StudioSurfaceLibre => ({
  id, type: "surface-libre", degreU: 2, degreV: 2, lignes: 3, colonnes: 3,
  controle: Array.from({ length: 9 }, (_, k) => ({ x: k % 3, y: Math.floor(k / 3), z: k === 4 ? h : 0 })),
});
const creer = (s: StudioSurfaceLibre) => ({ toolId: "studio.surface.nurbs", params: s });
const epaissir = (surface = "S", over: Record<string, unknown> = {}) => ({ toolId: "studio.surface.epaissir", params: { id: "E", surface, epaisseur: 0.1, sens: "normale", resultat: resultatSynthetique(0.2), ...over } });

describe("X.1-05 — surface NURBS : définition, évaluation, maillage dérivé", () => {
  it("X.1-05 NURBS : quart de cylindre rationnel (poids 1, √2/2, 1) — chaque point évalué est à la distance R de l'axe, aire approchée → π R L / 2", () => {
    const s = validerSurfaceLibre(quartCylindre("S", 2, 3), "s");
    for (const u of [0, 0.05, 0.25, 0.5, 0.71, 1]) for (const v of [0, 0.3, 1]) {
      const P = studioPointSurface(s, u, v);
      expect(Math.hypot(P.x, P.y)).toBeCloseTo(2, 12);
      expect(P.z).toBeCloseTo(3 * v, 12);
    }
    // Les extrémités de l'arc sont les pôles de bord ; le milieu (u = 1/2) est à 45° exactement.
    expect(studioPointSurface(s, 0.5, 0)).toMatchObject({ x: expect.closeTo(Math.SQRT2, 12), y: expect.closeTo(Math.SQRT2, 12) });
    const aire = studioAireApprocheeSurface(s), exacte = (Math.PI * 2 * 3) / 2;
    expect(aire).toBeLessThan(exacte);
    expect((exacte - aire) / exacte).toBeLessThan(1e-3);
    // Sans les poids (B-spline non rationnelle), la nappe n'est plus un cylindre : le milieu s'écarte du rayon.
    const { poids: _, ...sansPoids } = s;
    expect(Math.abs(Math.hypot(studioPointSurface(sansPoids, 0.5, 0).x, studioPointSurface(sansPoids, 0.5, 0).y) - 2)).toBeGreaterThan(0.05);
  });

  it("X.1-05 NURBS : les pôles ne sont pas des points de passage — la nappe passe par ses quatre coins ; nœuds uniformes bornés dérivés", () => {
    const s = validerSurfaceLibre(bosse("B", 1), "b");
    // Bézier biquadratique : le pôle central relevé de 1 relève le centre de (1/2)² · (1/2)² · 4 = 0,25.
    expect(studioPointSurface(s, 0.5, 0.5).z).toBeCloseTo(0.25, 12);
    for (const [u, v, x, y] of [[0, 0, 0, 0], [0, 1, 2, 0], [1, 0, 0, 2], [1, 1, 2, 2]] as const) expect(studioPointSurface(s, u, v)).toEqual({ x, y, z: 0 });
    expect(studioNoeudsUniformes(3, 2)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(studioNoeudsUniformes(5, 3)).toEqual([0, 0, 0, 0, 0.5, 1, 1, 1, 1]);
    expect(studioNoeudsUniformes(4, 1)).toEqual([0, 0, 1 / 3, 2 / 3, 1, 1]);
    // Maillage d'affichage : grille régulière (16 échantillons par travée), bords et polygone de contrôle.
    const m = studioMaillageSurface(s);
    expect(m).toMatchObject({ id: "B", type: "surface-libre", kind: "surface" });
    expect(m.vertices).toHaveLength(17 * 17);
    expect(m.triangles).toHaveLength(2 * 16 * 16);
    expect(m.edges).toHaveLength(4 * 16);
    expect(m.controle.points).toEqual(s.controle);
    expect(m.controle.segments).toHaveLength(12);
    // Borne du maillage d'affichage : 64 échantillons par sens au plus.
    const grande = validerSurfaceLibre({ ...bosse("G"), lignes: 12, colonnes: 2, degreU: 1, degreV: 1, controle: Array.from({ length: 24 }, (_, k) => ({ x: k % 2, y: Math.floor(k / 2), z: 0 })) }, "g");
    expect(studioMaillageSurface(grande).vertices).toHaveLength((STUDIO_LIMITES_SURFACES.echantillonsMax + 1) * 17);
  });

  it("X.1-05 validation : degré > lignes − 1, pôles ou poids en nombre faux, poids ≤ 0, bord réduit à un point, coins confondus, champ inconnu — refusés avec leur chemin", () => {
    const q = quartCylindre("S");
    const v = (x: unknown) => refus(() => validerSurfaceLibre(x, "s"));
    expect(v({ ...q, degreU: 3 })).toBe("s.degreU : entier de 1 à 2 attendu");
    expect(v({ ...q, degreV: 0 })).toBe("s.degreV : entier de 1 à 1 attendu");
    expect(v({ ...q, lignes: 65 })).toBe("s.lignes : entier de 2 à 64 attendu");
    expect(v({ ...q, controle: q.controle.slice(1) })).toBe("s.controle : 6 pôles attendus (lignes × colonnes)");
    expect(v({ ...q, poids: q.poids!.slice(1) })).toBe("s.poids : 6 poids attendus (un par pôle)");
    expect(v({ ...q, poids: q.poids!.map((w, i) => (i === 2 ? 0 : w)) })).toBe("s.poids[2] : poids strictement positif attendu");
    expect(v({ ...q, controle: q.controle.map((p, k) => (k === 0 ? { ...p, z: Number.NaN } : p)) })).toBe("s.controle[0].z : nombre fini attendu");
    expect(v({ ...q, controle: q.controle.map((p, k) => (k === 0 ? { ...p, x: 2e9 } : p)) })).toBe("s.controle[0].x : coordonnée de ±1000000000 m au plus");
    // Toute une ligne de pôles au même point (cône) : bord dégénéré, refusé (le noyau ne le prend pas non plus).
    expect(v({ ...q, controle: q.controle.map((p, k) => (k % 2 === 1 ? { x: 0, y: 0, z: 3 } : p)) })).toBe("s.controle : bord v = 1 réduit à un point (surface dégénérée non prise en charge)");
    expect(v({ ...bosse("B"), controle: bosse("B").controle.map((p, k) => (k === 8 ? { x: 0, y: 0, z: 0 } : p)) })).toBe("s.controle : deux coins de la surface confondus");
    expect(v({ ...q, noeuds: [0, 1] })).toBe("s : champs absents ou inconnus");
    expect(v({ ...q, type: "surface" })).toBe("s.type : type « surface-libre » attendu");
  });
});

describe("X.1-05 — commandes des surfaces libres", () => {
  it("X.1-05 commandes : créer, modifier un pôle et son poids (même identité), épaissir (surface conservée dans le solide exact), supprimer ; refus nommés", () => {
    const d = appliquer(newStudioDocument("x105"), creer(quartCylindre("S")));
    expect(d.surfaces).toEqual([quartCylindre("S")]);
    expect(validateStudioDocument(d)).toEqual(d);
    // Modifier : un pôle déplacé et son poids changé, même identité ; les autres pôles inchangés.
    const s = d.surfaces![0]!;
    const modifiee = { ...s, controle: s.controle.map((p, k) => (k === 2 ? { ...p, x: 2.5 } : p)), poids: s.poids!.map((w, k) => (k === 2 ? 0.5 : w)) };
    const m = appliquer(d, { toolId: "studio.surface.modifier", params: modifiee });
    expect(m.surfaces).toEqual([modifiee]);
    expect(m.surfaces![0]!.controle.filter((p, k) => p !== s.controle[k] && JSON.stringify(p) !== JSON.stringify(s.controle[k]))).toHaveLength(1);
    // Épaissir : la surface quitte `surfaces`, conservée intacte dans le solide exact, avec épaisseur et côté.
    const e = appliquer(m, epaissir());
    expect(e.surfaces).toBeUndefined();
    expect(e.exacts).toEqual([{ id: "E", type: "exact", operation: "epaississement", surface: modifiee, epaisseur: 0.1, sens: "normale", resultat: resultatSynthetique(0.2) }]);
    expect(studioIdsOperandes(e.exacts![0]!)).toEqual(["S"]);
    expect(validateStudioDocument(e)).toEqual(e);
    // Supprimer : une surface par `studio.solide.supprimer` ; le solide épaissi part avec sa surface conservée.
    expect(appliquer(m, { toolId: "studio.solide.supprimer", params: { ids: ["S"] } }).surfaces).toBeUndefined();
    const vide = appliquer(e, { toolId: "studio.solide.supprimer", params: { ids: ["E"] } });
    expect(vide.exacts).toBeUndefined();
    expect(appliquer(vide, creer(quartCylindre("S"))).surfaces).toHaveLength(1);
    // Refus nommés (lot entier abandonné, document intact).
    const avant = JSON.stringify(m);
    expect(refus(() => appliquer(m, creer(quartCylindre("S"))))).toBe("commands[0] : identifiant déjà utilisé");
    expect(refus(() => appliquer(m, { toolId: "studio.surface.modifier", params: quartCylindre("Z") }))).toBe("commands[0].params.id : surface introuvable : Z");
    expect(refus(() => appliquer(e, { toolId: "studio.surface.modifier", params: quartCylindre("S") }))).toBe("commands[0].params.id : ce n’est pas une surface libre : S");
    expect(refus(() => appliquer(m, epaissir("Z")))).toBe("commands[0].params.surface : surface introuvable : Z");
    expect(refus(() => appliquer(m, epaissir("S", { epaisseur: 0 })))).toBe("commands[0].params.epaisseur : épaisseur de 1e-6 à 1e6 m attendue");
    expect(refus(() => appliquer(m, epaissir("S", { sens: "dessus" })))).toBe("commands[0].params.sens : sens « normale » ou « inverse » attendu");
    expect(refus(() => appliquer(m, epaissir("S", { id: "S" })))).toBe("commands[0].params.id : identifiant déjà utilisé");
    expect(refus(() => appliquer(m, epaissir("S", { resultat: { ...resultatSynthetique(), volume: 0 } })))).toMatch(/volume strictement positif attendu/);
    expect(refus(() => appliquer(m, epaissir("S", { inconnu: 1 })))).toBe("commands[0].params : champs absents ou inconnus");
    expect(refus(() => appliquer(m, epaissir(), epaissir("S", { id: "E2" })))).toBe("commands[1].params.surface : ce n’est pas une surface libre : S");
    expect(JSON.stringify(m)).toBe(avant);
  });

  it("X.1-05 calque verrouillé : créer, modifier, épaissir et supprimer une surface sont refusés", () => {
    const calque = { toolId: "studio.calque.creer", params: { id: "nappes", name: "Nappes", visible: true, locked: false } };
    const d = appliquer(newStudioDocument("x105"), calque, creer(quartCylindre("S", 2, 3, { layerId: "nappes" })));
    const v = appliquer(d, { toolId: "studio.calque.modifier", params: { id: "nappes", name: "Nappes", visible: true, locked: true } });
    expect(refus(() => appliquer(v, creer(quartCylindre("T", 2, 3, { layerId: "nappes" }))))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => appliquer(v, { toolId: "studio.surface.modifier", params: quartCylindre("S", 3, 3, { layerId: "nappes" }) }))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => appliquer(v, epaissir()))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => appliquer(v, { toolId: "studio.solide.supprimer", params: { ids: ["S"] } }))).toMatch(/calque verrouillé/);
    // Une surface d'un calque libre ne passe pas non plus sur le calque verrouillé.
    const libre = appliquer(v, creer(quartCylindre("L")));
    expect(refus(() => appliquer(libre, { toolId: "studio.surface.modifier", params: quartCylindre("L", 2, 3, { layerId: "nappes" }) }))).toBe("commands[0] : calque verrouillé");
    // Le solide épaissi prend le calque de la surface.
    expect(appliquer(d, epaissir()).exacts![0]!.layerId).toBe("nappes");
  });

  it("X.1-05 document : extension additive de studio-document/1 — un document sans surface est relu à l'identique ; identifiants uniques dans tout le document", () => {
    const sans = appliquer(newStudioDocument("x105"), { toolId: "studio.solide.boite", params: { id: "B", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } });
    expect(Object.keys(sans)).not.toContain("surfaces");
    expect(validateStudioDocument(sans)).toEqual(sans);
    expect(validateStudioDocument({ ...sans, surfaces: [] })).toEqual(sans);
    expect(refus(() => validateStudioDocument({ ...sans, surfaces: [quartCylindre("B")] }))).toBe("studioDocument.surfaces : identifiant dupliqué");
    expect(refus(() => validateStudioDocument({ ...sans, surfaces: [quartCylindre("S", 2, 3, { layerId: "absent" })] }))).toBe("studioDocument.surfaces : calque inconnu");
    const e = appliquer(appliquer(newStudioDocument("x105"), creer(quartCylindre("S"))), epaissir());
    // La surface conservée garde son identifiant réservé : une nouvelle surface « S » est refusée.
    expect(refus(() => validateStudioDocument({ ...e, surfaces: [quartCylindre("S")] }))).toBe("studioDocument.surfaces : identifiant dupliqué");
    expect(refus(() => validerSolideExact({ ...e.exacts![0]!, surface: quartCylindre("E") }, "x"))).toBe("x.surface : la surface conservée a son propre identifiant");
  });

  it("X.1-05 limites : résultat de l'épaississement borné par STUDIO_LIMITES_EXACTS (triangles, brep), grille de 64 × 64 pôles au plus", () => {
    const d = appliquer(newStudioDocument("x105"), creer(quartCylindre("S")));
    const r = resultatSynthetique(0.2);
    const trop = { ...r, maillage: { positions: r.maillage.positions, indices: Array.from({ length: 3 * (STUDIO_LIMITES_EXACTS.triangles + 1) }, () => 0) } };
    expect(refus(() => appliquer(d, epaissir("S", { resultat: trop })))).toBe(`commands[0].params.resultat.maillage.indices : ${STUDIO_LIMITES_EXACTS.triangles} triangles au plus`);
    expect(refus(() => appliquer(d, epaissir("S", { resultat: { ...r, brep: "A".repeat(STUDIO_LIMITES_EXACTS.brep + 4) } })))).toBe(`commands[0].params.resultat.brep : ${STUDIO_LIMITES_EXACTS.brep} caractères au plus`);
    const plan = (n: number): StudioSurfaceLibre => ({ id: "P", type: "surface-libre", degreU: 1, degreV: 1, lignes: n, colonnes: n, controle: Array.from({ length: n * n }, (_, k) => ({ x: k % n, y: Math.floor(k / n), z: 0 })) });
    expect(validerSurfaceLibre(plan(64), "p").controle).toHaveLength(4096);
    expect(refus(() => validerSurfaceLibre(plan(65), "p"))).toBe("p.lignes : entier de 2 à 64 attendu");
  });
});

describe("X.1-05 — épaississement exact : capture, entrée du noyau, résultat périmé, engagement", () => {
  it("X.1-05 épaississement : capture immuable (entrée nurbs du noyau, épaisseur signée selon le côté), refus nommés, résultat périmé si la surface change, commande d'engagement", () => {
    const d = appliquer(newStudioDocument("x105"), creer(quartCylindre("S")));
    const c = studioCaptureEpaississement(d, { surface: "S", epaisseur: 0.1, sens: "normale" });
    if (!c.ok) throw new Error(c.message);
    expect(Object.isFrozen(c.capture)).toBe(true);
    expect(c.capture.entrees).toEqual({ type: "nurbs", nurbs: { degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle: quartCylindre("S").controle, poids: quartCylindre("S").poids }, epaisseur: 0.1 });
    expect(studioOperationNurbs(d.surfaces![0]!, 0.1, "inverse").epaisseur).toBe(-0.1);
    // Côté « inverse » : l'entrée du noyau porte l'épaisseur négative (à l'opposé de la normale).
    const inverse = studioCaptureEpaississement(d, { surface: "S", epaisseur: 0.1, sens: "inverse" });
    expect(inverse.ok && inverse.capture.entrees.epaisseur).toBe(-0.1);
    expect(studioCaptureEpaississement(d, { surface: "", epaisseur: 0.1, sens: "normale" })).toEqual({ ok: false, message: "Choisissez la surface à épaissir." });
    expect(studioCaptureEpaississement(d, { surface: "Z", epaisseur: 0.1, sens: "normale" })).toEqual({ ok: false, message: "Surface introuvable : Z." });
    expect(studioCaptureEpaississement(d, { surface: "S", epaisseur: null, sens: "normale" })).toMatchObject({ ok: false, message: expect.stringMatching(/Saisissez l’épaisseur/) });
    expect(studioCaptureEpaississement(d, { surface: "S", epaisseur: 0.1, sens: "" })).toMatchObject({ ok: false, message: expect.stringMatching(/Choisissez le côté/) });
    expect(studioVerifierEpaississement(d, c.capture, true)).toEqual({ ok: true });
    expect(studioVerifierEpaississement(d, c.capture, false)).toMatchObject({ ok: false, motif: "droits" });
    // La surface change après la capture : le résultat est périmé, jamais engagé.
    const s = d.surfaces![0]!;
    const changee = appliquer(d, { toolId: "studio.surface.modifier", params: { ...s, controle: s.controle.map((p, k) => (k === 0 ? { ...p, z: 0.5 } : p)) } });
    expect(studioVerifierEpaississement(changee, c.capture, true)).toMatchObject({ ok: false, motif: "perime" });
    const cmd = studioCommandeEpaississement(c.capture, "E", resultatSynthetique(0.2));
    expect(cmd).toEqual({ toolId: "studio.surface.epaissir", params: { id: "E", surface: "S", epaisseur: 0.1, sens: "normale", resultat: resultatSynthetique(0.2) } });
    expect(appliquer(d, cmd).exacts).toHaveLength(1);
  });
});

describe("X.1-05 — vue 3D et échanges", () => {
  it("X.1-05 vue 3D : maillage d'affichage dérivé (calque masqué non rendu), assemblage par morceaux identique à studioMesh3d", () => {
    const calque = { toolId: "studio.calque.creer", params: { id: "nappes", name: "Nappes", visible: true, locked: false } };
    const d = appliquer(newStudioDocument("x105"), calque, creer(quartCylindre("S")), creer(bosse("B")), { toolId: "studio.surface.modifier", params: { ...bosse("B"), layerId: "nappes" } });
    const m = studioMesh3d(d);
    expect(m.surfaces?.map((s) => s.id)).toEqual(["S", "B"]);
    expect(m.surfaces![0]).toEqual(studioMaillageSurface(d.surfaces![0]!));
    expect(m.bounds?.max.z).toBeCloseTo(3, 12);
    const morceaux = new Map(studioMaillerObjets(d, null).map((x) => [x.id, x]));
    expect(studioAssemblerMaillage(d, morceaux)).toEqual(m);
    const masque = appliquer(d, { toolId: "studio.calque.modifier", params: { id: "nappes", name: "Nappes", visible: false, locked: false } });
    const mm = studioMesh3d(masque);
    expect(mm.surfaces?.map((s) => s.id)).toEqual(["S"]);
    expect(mm.hidden).toBe(1);
    expect(studioMesh3d(newStudioDocument("vide")).surfaces).toBeUndefined();
  });

  it("X.1-05 exports : OBJ écrit la nappe ; STL et STEP la comptent « surface-libre-non-epaissie » ; épaissie, elle est un solide exact écrit en STL et STEP ; IFC et rapport de fidélité la déclarent", () => {
    const d = appliquer(newStudioDocument("x105"), creer(quartCylindre("S")));
    const obj = exportStudioObj(d);
    expect(obj).toContain("o S\n");
    const nappe = studioMaillageSurface(d.surfaces![0]!);
    expect(obj.split("\n").filter((l) => l.startsWith("v ")).length).toBe(nappe.vertices.length);
    expect(obj.split("\n").filter((l) => l.startsWith("f ")).length).toBe(nappe.triangles.length);
    expect(studioBilanExport3d(d, "obj")).toMatchObject({ ecrits: 1, nonEcrits: {} });
    expect(studioBilanExport3d(d, "stl")).toMatchObject({ ecrits: 0, nonEcrits: { "surface-libre-non-epaissie": 1 } });
    expect(exportStudioStl(d)).not.toContain("facet");
    expect(studioPiecesStep(d)).toMatchObject({ pieces: [], bilan: { ecrits: 0, nonEcrits: { "surface-libre-non-epaissie": 1 } } });
    expect(exportStudioIfc(d, { studyName: "E", variantName: "V", timestamp: "2026-10-26T00:00:00Z" })).toMatch(/'FreeSurfacesNotExported',[^;]*IFCINTEGER\(1\)/);
    for (const f of ["svg", "dxf", "ifc"] as const) {
      expect(studioRapportFidelite(d, f).lignes).toEqual([{ categorie: "surfaces", type: "surface-libre", statut: "non-couvert", raison: "surface-libre-hors-export", nombre: 1, ids: ["S"] }]);
    }
    // Épaissie : un solide exact (brep du noyau) — pièce STEP nommée, facettes STL ; la surface conservée n'est plus comptée.
    const e = appliquer(d, epaissir());
    expect(studioPiecesStep(e).pieces).toEqual([{ nom: "E", categorie: "exact", solides: [{ brep: resultatSynthetique(0.2).brep }] }]);
    expect(studioPiecesStep(e).bilan.nonEcrits).toEqual({});
    expect(exportStudioStl(e).match(/facet normal/g)).toHaveLength(4);
    expect(exportStudioObj(e)).toContain("o E\n");
  });
});
