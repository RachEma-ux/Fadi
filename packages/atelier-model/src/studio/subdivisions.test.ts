import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioMesh3d } from "./mesh-3d.js";
import { studioAssemblerMaillage, studioMaillerObjets } from "./projections.js";
import { exportStudioObj, exportStudioStl, studioBilanExport3d, studioPiecesStep } from "./export-3d.js";
import { exportStudioIfc } from "./ifc.js";
import { studioRapportFidelite } from "./echanges/rapport-fidelite.js";
import { resultatSynthetique } from "./exacts.fixtures.js";
import { studioCaptureSolidification, studioCommandeSolidification, studioVerifierSolidification } from "./surfaces-exactes.js";
import { studioIdsOperandes, validerSolideExact } from "./objets-3d/exacts.js";
import {
  STUDIO_LIMITES_SUBDIVISION, studioAireSubdivision, studioMaillageSubdivise, studioMaillageSubdivision, studioOperationPolyedre, studioSubdivisionFermee,
  studioVolumeSubdivision, validerSurfaceSubdivision, type StudioSurfaceSubdivision,
} from "./objets-3d/subdivisions.js";
import { subdiviserLoop } from "../subdivision-loop.js";
import { subdiviserLoop as subdiviserLoopAtelier } from "../geometrie-3d.js";

/**
 * X.1-05 — surfaces de subdivision de Studio (modèle pur) : maillage de contrôle triangulaire et niveau de Loop,
 * maillage subdivisé dérivé, commandes (créer, modifier, solidifier, supprimer), solidification polyédrique d'un
 * maillage fermé (surface conservée, R15), échanges. Résultats du noyau SYNTHÉTIQUES ici : le noyau réel est testé par
 * `@parcours/geometry-exact` (opération `polyedre`) et par l'API.
 */

const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};
const appliquer = (d: StudioDocument, ...cs: unknown[]) => applyStudioCommands(d, cs as StudioCommand[]);
const V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as const;
/** Tétraèdre régulier centré à l'origine (sommets s (±1, ±1, ±1)), faces orientées vers l'extérieur. */
const tetra = (id: string, s = 1, niveau = 1, over: Partial<StudioSurfaceSubdivision> = {}): StudioSurfaceSubdivision => ({
  id, type: "surface-subdivision", sommets: V.map(([x, y, z]) => ({ x: s * x, y: s * y, z: s * z })), faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]], niveau, ...over,
});
/** Carré ouvert 2 × 2 en deux triangles (z = 0), sommet central relevé de h dans une version à quatre triangles. */
const ouverte = (id: string, niveau = 1): StudioSurfaceSubdivision => ({
  id, type: "surface-subdivision", niveau,
  sommets: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 1, y: 1, z: 0.5 }],
  faces: [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
});
const creer = (s: StudioSurfaceSubdivision) => ({ toolId: "studio.subdivision.creer", params: s });
const solidifier = (subdivision = "T", over: Record<string, unknown> = {}) => ({ toolId: "studio.subdivision.solidifier", params: { id: "P", subdivision, resultat: resultatSynthetique(0.2), ...over } });

describe("X.1-05 — surface de subdivision : géométrie (Loop), validation", () => {
  it("X.1-05 subdivision : tétraèdre régulier, niveau 1 — sommets a/4 et points d'arête (a + b)/4, aire s² (3√2/4 + √3/2), volume 5 s³ / 24 ; niveau 2 dans l'enveloppe convexe, volume décroissant", () => {
    const s = validerSurfaceSubdivision(tetra("T", 2), "t");
    const m = studioMaillageSubdivise(s);
    const cle = (p: readonly number[]) => p.map((x) => x.toFixed(9)).join(",");
    const attendus = new Set<string>();
    for (let i = 0; i < 4; i++) { attendus.add(cle(V[i]!.map((x) => (2 * x) / 4))); for (let j = i + 1; j < 4; j++) attendus.add(cle(V[i]!.map((x, n) => (2 * (x + V[j]![n]!)) / 4))); }
    const obtenus = new Set<string>();
    for (let i = 0; i < m.positions.length; i += 3) obtenus.add(cle(m.positions.slice(i, i + 3)));
    expect([...obtenus].sort()).toEqual([...attendus].sort());
    expect(m.indices.length / 3).toBe(16);
    expect(studioAireSubdivision(s)).toBeCloseTo(4 * ((3 * Math.SQRT2) / 4 + Math.sqrt(3) / 2), 12);
    expect(studioVolumeSubdivision(s)).toBeCloseTo((5 * 8) / 24, 12);
    // Niveau 2 : dans l'enveloppe convexe (a·x ≤ s pour chaque face), volume strictement plus petit (convergence).
    const s2 = { ...s, niveau: 2 };
    const m2 = studioMaillageSubdivise(s2);
    for (let i = 0; i < m2.positions.length; i += 3) for (const n of [[1, 1, -1], [1, -1, 1], [-1, 1, 1], [-1, -1, -1]]) expect(n[0]! * m2.positions[i]! + n[1]! * m2.positions[i + 1]! + n[2]! * m2.positions[i + 2]!).toBeLessThanOrEqual(2 + 1e-12);
    expect(studioVolumeSubdivision(s2)!).toBeLessThan(studioVolumeSubdivision(s)!);
    expect(studioVolumeSubdivision({ ...s, niveau: 3 })!).toBeLessThan(studioVolumeSubdivision(s2)!);
    // Niveau 0 : le maillage de contrôle lui-même (volume du tétraèdre 8 s³ / 3).
    expect(studioVolumeSubdivision({ ...s, niveau: 0 })).toBeCloseTo((8 * 8) / 3, 12);
    // Géométrie partagée avec l'Atelier : le module neutre est celui que l'Atelier réexporte.
    expect(subdiviserLoopAtelier).toBe(subdiviserLoop);
  });

  it("X.1-05 subdivision validation : face non triangulaire, indice hors sommets, face dégénérée, orientation incohérente, arête non manifold, sommet inutilisé, niveau hors bornes ou trop de triangles — refusés avec leur chemin", () => {
    const t = tetra("T");
    const v = (x: unknown) => refus(() => validerSurfaceSubdivision(x, "s"));
    expect(v({ ...t, faces: [[0, 1, 2, 3]] })).toBe("s.faces[0] : face triangulaire attendue (schéma de Loop : saisissez un quadrilatère en deux triangles)");
    expect(v({ ...t, faces: [...t.faces.slice(0, 3), [1, 3, 9]] })).toBe("s.faces[3][2] : indice de sommet attendu");
    expect(v({ ...t, faces: [...t.faces.slice(0, 3), [1, 3, 3]] })).toBe("s.faces[3] : trois sommets distincts attendus");
    expect(v({ ...t, sommets: [...t.sommets, { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }], faces: [...t.faces, [4, 0, 5]] })).toBe("s.faces[4] : face dégénérée (sommets alignés)");
    expect(v({ ...t, faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 3, 2]] })).toMatch(/^s\.faces\[1\] : orientation incohérente/);
    const papillon = { ...t, sommets: [...t.sommets, { x: 3, y: 0, z: 0 }], faces: [[0, 1, 2], [1, 0, 3], [0, 1, 4]] };
    expect(v(papillon)).toMatch(/^s\.faces\[2\] : (orientation incohérente|arête portée par plus de deux faces)/);
    expect(v({ ...t, sommets: [...t.sommets, { x: 5, y: 5, z: 5 }] })).toBe("s.sommets[4] : sommet utilisé par aucune face");
    expect(v({ ...t, niveau: 5 })).toBe("s.niveau : entier de 0 à 4 attendu");
    expect(v({ ...t, niveau: 1.5 })).toBe("s.niveau : entier de 0 à 4 attendu");
    const grille = (n: number): StudioSurfaceSubdivision => {
      const sommets = [], faces: [number, number, number][] = [];
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) sommets.push({ x: j, y: i, z: 0 });
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j; faces.push([a, a + 1, a + n + 2], [a, a + n + 2, a + n + 1]); }
      return { id: "G", type: "surface-subdivision", sommets, faces, niveau: 4 };
    };
    // 2 × 8² = 128 faces × 4⁴ = 32 768 triangles > 16 384.
    expect(v(grille(8))).toBe(`s.niveau : ${STUDIO_LIMITES_SUBDIVISION.trianglesSubdivises} triangles subdivisés au plus (faces × 4^niveau)`);
    expect(validerSurfaceSubdivision({ ...grille(8), niveau: 3 }, "s").faces).toHaveLength(128);
    expect(v({ ...t, inconnu: 1 })).toBe("s : champs absents ou inconnus");
    expect(studioSubdivisionFermee(t)).toBe(true);
    expect(studioSubdivisionFermee(ouverte("O"))).toBe(false);
    expect(studioVolumeSubdivision(ouverte("O"))).toBeNull();
  });
});

describe("X.1-05 — commandes des surfaces de subdivision", () => {
  it("X.1-05 subdivision commandes : créer, modifier un sommet de contrôle (même identité), solidifier un maillage fermé (surface conservée), supprimer ; maillage ouvert refusé", () => {
    const d = appliquer(newStudioDocument("x105s"), creer(tetra("T")), creer(ouverte("O")));
    expect(d.subdivisions?.map((s) => s.id)).toEqual(["T", "O"]);
    expect(validateStudioDocument(d)).toEqual(d);
    // Modifier : un sommet de contrôle déplacé par « Modifier la surface », même identité, faces et niveau gardés.
    const t = d.subdivisions![0]!;
    const deplace = { ...t, sommets: t.sommets.map((p, k) => (k === 0 ? { x: 1.5, y: 1.5, z: 1.5 } : p)) };
    const m = appliquer(d, { toolId: "studio.surface.modifier", params: deplace });
    expect(m.subdivisions![0]).toEqual(deplace);
    expect(m.subdivisions![1]).toEqual(d.subdivisions![1]);
    // Solidifier : la surface quitte `subdivisions`, conservée intacte dans le solide exact.
    const e = appliquer(m, solidifier());
    expect(e.subdivisions?.map((s) => s.id)).toEqual(["O"]);
    expect(e.exacts).toEqual([{ id: "P", type: "exact", operation: "solidification", subdivision: deplace, resultat: resultatSynthetique(0.2) }]);
    expect(studioIdsOperandes(e.exacts![0]!)).toEqual(["T"]);
    expect(validateStudioDocument(e)).toEqual(e);
    // Maillage ouvert : refusé avec sa raison (rien n'est inventé pour fermer la surface).
    expect(refus(() => appliquer(m, solidifier("O")))).toBe("commands[0].params.subdivision : surface de subdivision ouverte : seul un maillage de contrôle fermé (chaque arête portée par deux faces) devient un solide");
    // Faces orientées vers l'intérieur : refus.
    const inverse = { ...tetra("I"), faces: tetra("I").faces.map(([a, b, c]) => [a, c, b] as [number, number, number]) };
    expect(refus(() => appliquer(appliquer(m, creer(inverse)), solidifier("I")))).toMatch(/orientées vers l’intérieur/);
    // Supprimer.
    expect(appliquer(m, { toolId: "studio.solide.supprimer", params: { ids: ["O"] } }).subdivisions?.map((s) => s.id)).toEqual(["T"]);
    expect(appliquer(e, { toolId: "studio.solide.supprimer", params: { ids: ["P"] } }).exacts).toBeUndefined();
    // Refus nommés, lot entier abandonné.
    const avant = JSON.stringify(m);
    expect(refus(() => appliquer(m, creer(tetra("T"))))).toBe("commands[0] : identifiant déjà utilisé");
    expect(refus(() => appliquer(m, solidifier("Z")))).toBe("commands[0].params.subdivision : surface de subdivision introuvable : Z");
    expect(refus(() => appliquer(e, solidifier("T", { id: "P2" })))).toBe("commands[0].params.subdivision : ce n’est pas une surface de subdivision : T");
    expect(refus(() => appliquer(e, { toolId: "studio.surface.modifier", params: tetra("T") }))).toBe("commands[0].params.id : ce n’est pas une surface libre : T");
    expect(refus(() => appliquer(m, solidifier("T", { resultat: { ...resultatSynthetique(), volume: -1 } })))).toMatch(/volume strictement positif attendu/);
    expect(refus(() => validerSolideExact({ ...e.exacts![0]!, subdivision: ouverte("O2") }, "x"))).toBe("x.subdivision : surface de subdivision ouverte : jamais solidifiée");
    expect(JSON.stringify(m)).toBe(avant);
  });

  it("X.1-05 subdivision calque verrouillé : créer, modifier, solidifier et supprimer sont refusés ; document sans subdivision relu à l'identique", () => {
    const calque = { toolId: "studio.calque.creer", params: { id: "maillages", name: "Maillages", visible: true, locked: false } };
    const d = appliquer(newStudioDocument("x105s"), calque, creer(tetra("T", 1, 1, { layerId: "maillages" })));
    const v = appliquer(d, { toolId: "studio.calque.modifier", params: { id: "maillages", name: "Maillages", visible: true, locked: true } });
    expect(refus(() => appliquer(v, creer(tetra("U", 1, 1, { layerId: "maillages" }))))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => appliquer(v, { toolId: "studio.surface.modifier", params: tetra("T", 2, 1, { layerId: "maillages" }) }))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => appliquer(v, solidifier()))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => appliquer(v, { toolId: "studio.solide.supprimer", params: { ids: ["T"] } }))).toMatch(/calque verrouillé/);
    expect(appliquer(d, solidifier()).exacts![0]!.layerId).toBe("maillages");
    const sans = newStudioDocument("vide");
    expect(validateStudioDocument({ ...sans, subdivisions: [] })).toEqual(sans);
    expect(refus(() => validateStudioDocument({ ...d, subdivisions: [...d.subdivisions!, tetra("T")] }))).toBe("studioDocument.subdivisions : identifiant dupliqué");
  });

  it("X.1-05 subdivision : solidification — capture (entrée polyèdre du maillage subdivisé), maillage ouvert ou orienté vers l'intérieur refusé, résultat périmé, commande d'engagement", () => {
    const d = appliquer(newStudioDocument("x105s"), creer(tetra("T")), creer(ouverte("O")));
    const c = studioCaptureSolidification(d, { subdivision: "T" });
    if (!c.ok) throw new Error(c.message);
    expect(Object.isFrozen(c.capture)).toBe(true);
    const m = studioMaillageSubdivise(d.subdivisions![0]!);
    expect(c.capture.entrees.type).toBe("polyedre");
    expect(c.capture.entrees.sommets.flatMap((p) => [p.x, p.y, p.z])).toEqual(m.positions);
    expect(c.capture.entrees.triangles.flat()).toEqual(m.indices);
    expect(studioCaptureSolidification(d, { subdivision: "" })).toEqual({ ok: false, message: "Choisissez la surface de subdivision à solidifier." });
    expect(studioCaptureSolidification(d, { subdivision: "O" })).toMatchObject({ ok: false, message: expect.stringMatching(/^Solidification impossible : surface de subdivision ouverte/) });
    expect(typeof studioOperationPolyedre(ouverte("O"))).toBe("string");
    expect(studioVerifierSolidification(d, c.capture, true)).toEqual({ ok: true });
    expect(studioVerifierSolidification(d, c.capture, false)).toMatchObject({ ok: false, motif: "droits" });
    const t = d.subdivisions![0]!;
    const changee = appliquer(d, { toolId: "studio.surface.modifier", params: { ...t, niveau: 2 } });
    expect(studioVerifierSolidification(changee, c.capture, true)).toMatchObject({ ok: false, motif: "perime" });
    const cmd = studioCommandeSolidification(c.capture, "P", resultatSynthetique(0.2));
    expect(cmd).toEqual({ toolId: "studio.subdivision.solidifier", params: { id: "P", subdivision: "T", resultat: resultatSynthetique(0.2) } });
    expect(appliquer(d, cmd).exacts).toHaveLength(1);
  });
});

describe("X.1-05 — surfaces de subdivision : vue 3D et échanges", () => {
  it("X.1-05 subdivision vue 3D : maillage subdivisé dérivé, bords libres d'une surface ouverte, aucun bord d'une surface fermée, assemblage par morceaux identique", () => {
    const d = appliquer(newStudioDocument("x105s"), creer(tetra("T")), creer(ouverte("O", 2)));
    const m = studioMesh3d(d);
    expect(m.subdivisions?.map((s) => [s.id, s.fermee, s.triangles.length])).toEqual([["T", true, 16], ["O", false, 64]]);
    expect(m.subdivisions![0]!.edges).toEqual([]);
    // Bord du carré ouvert : 4 côtés × 4 segments au niveau 2.
    expect(m.subdivisions![1]!.edges).toHaveLength(16);
    expect(m.subdivisions![0]).toEqual(studioMaillageSubdivision(d.subdivisions![0]!));
    expect(m.subdivisions![0]!.controle.segments).toHaveLength(6);
    expect(studioAssemblerMaillage(d, new Map(studioMaillerObjets(d, null).map((x) => [x.id, x])))).toEqual(m);
    expect(studioMesh3d(newStudioDocument("v")).subdivisions).toBeUndefined();
  });

  it("X.1-05 subdivision exports : STL écrit la surface fermée, compte la surface ouverte ; OBJ les écrit ; STEP compte la surface non solidifiée, écrit le solide ; IFC et rapport de fidélité la déclarent", () => {
    const d = appliquer(newStudioDocument("x105s"), creer(tetra("T")), creer(ouverte("O")));
    const obj = exportStudioObj(d);
    expect(obj).toContain("o T\n");
    expect(obj).toContain("o O\n");
    expect(studioBilanExport3d(d, "stl")).toMatchObject({ ecrits: 1, nonEcrits: { "surface-subdivision-ouverte": 1 } });
    expect(exportStudioStl(d).match(/facet normal/g)).toHaveLength(16);
    expect(studioPiecesStep(d)).toMatchObject({ pieces: [], bilan: { nonEcrits: { "surface-subdivision-non-solidifiee": 2 } } });
    expect(exportStudioIfc(d, { studyName: "E", variantName: "V", timestamp: "2026-10-26T00:00:00Z" })).toMatch(/'SubdivisionSurfacesNotExported',[^;]*IFCINTEGER\(2\)/);
    for (const f of ["svg", "dxf", "ifc"] as const) {
      expect(studioRapportFidelite(d, f).lignes).toEqual([{ categorie: "subdivisions", type: "surface-subdivision", statut: "non-couvert", raison: "surface-subdivision-hors-export", nombre: 2, ids: ["T", "O"] }]);
    }
    const e = appliquer(d, solidifier());
    expect(studioPiecesStep(e).pieces).toEqual([{ nom: "P", categorie: "exact", solides: [{ brep: resultatSynthetique(0.2).brep }] }]);
    expect(studioPiecesStep(e).bilan.nonEcrits).toEqual({ "surface-subdivision-non-solidifiee": 1 });
  });
});
