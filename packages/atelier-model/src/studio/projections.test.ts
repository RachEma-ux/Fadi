import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioMesh3d } from "./mesh-3d.js";
import {
  projectionsAInvalider, STUDIO_SEUIL_INVALIDATION, studioAssemblerMaillage, studioClesProjection, studioMaillerObjets, studioMesh3dIncremental, studioVersionProjection,
  type StudioCacheMaillage,
} from "./projections.js";
import type { StudioOpening, StudioWall } from "./architecture/types.js";
import type { StudioApparence } from "./scenes/scenes.js";

const avec = (d: StudioDocument, ...c: StudioCommand[]) => applyStudioCommands(d, c);
const mur = (id: string, y: number, over: Partial<StudioWall> = {}): StudioWall => ({ id, type: "wall", axis: [{ x: 0, y }, { x: 6, y }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over });
const ouverture = (id: string, hostId: string, position: number, over: Partial<StudioOpening> = {}): StudioOpening => ({ id, type: "opening", hostId, position, width: 1, height: 2.1, sill: 0, ...over });

/** Petit modèle : calque, deux murs (deux ouvertures sur m1), ligne extrudée liée par une cote, rectangle plat, boîte. */
const modele = (): StudioDocument => avec(newStudioDocument("proj"),
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: -2 }, end: { x: 5, y: -2 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 8, y: 0 }, width: 2, height: 1 } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: -2 }, end: { x: 5, y: -2 }, offset: 1, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.architecture.mur", params: mur("m1", 4, { layerId: "murs" }) },
  { toolId: "studio.architecture.mur", params: mur("m2", 8) },
  { toolId: "studio.architecture.ouverture", params: ouverture("o1", "m1", 1) },
  { toolId: "studio.architecture.ouverture", params: ouverture("o2", "m1", 4) },
  { toolId: "studio.architecture.ouverture", params: ouverture("o3", "m2", 2) },
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 12, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
);

describe("Projections versionnées (C.2-01)", () => {
  it("clé de version : révision plus empreinte des seules entrées lues", () => {
    const d = modele();
    const v = studioVersionProjection(d, "maillage-3d", "r1");
    expect(v).toEqual({ projection: "maillage-3d", revision: "r1", contenu: expect.stringMatching(/^[0-9a-f]{16}$/) });
    // Même contenu, copie distincte : même empreinte ; autre révision : seule la révision change.
    expect(studioVersionProjection(validateStudioDocument(JSON.parse(JSON.stringify(d))), "maillage-3d", "r2").contenu).toBe(v.contenu);
    // Une scène ne change aucune géométrie ; un solide libre ne paraît pas sur le plan 2D ; une cote pas en 3D.
    const scene = avec(d, { toolId: "studio.scene.creer", params: { id: "sc1", type: "scene", frame: "local-3d", name: "S", camera: { projection: "perspective", position: { x: 9, y: -9, z: 9 }, target: { x: 0, y: 0, z: 0 }, fov: 45 }, visibleLayers: ["default"], displayMode: "shaded" } });
    expect(studioVersionProjection(scene, "maillage-3d", "x").contenu).toBe(v.contenu);
    expect(studioVersionProjection(scene, "plan-2d", "x").contenu).toBe(studioVersionProjection(d, "plan-2d", "x").contenu);
    const boite = avec(d, { toolId: "studio.solide.deplacer", params: { id: "b1", dx: 1, dy: 0, dz: 0 } });
    expect(studioVersionProjection(boite, "plan-2d", "x").contenu).toBe(studioVersionProjection(d, "plan-2d", "x").contenu);
    expect(studioVersionProjection(boite, "maillage-3d", "x").contenu).not.toBe(v.contenu);
    const cote = avec(d, { toolId: "studio.dessin.modifier", params: { id: "c1", type: "dimension", start: { x: 0, y: -2 }, end: { x: 5, y: -2 }, offset: 2, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } });
    expect(studioVersionProjection(cote, "maillage-3d", "x").contenu).toBe(v.contenu);
    expect(studioVersionProjection(cote, "plan-2d", "x").contenu).not.toBe(studioVersionProjection(d, "plan-2d", "x").contenu);
  });
});

describe("projectionsAInvalider (C.2-05, C.2-06)", () => {
  it("même document : rien ; premier calcul : complet", () => {
    const d = modele();
    expect(projectionsAInvalider(d, d)).toEqual({ ids: [], complet: false, raison: null });
    expect(projectionsAInvalider(null, d)).toMatchObject({ complet: true, raison: "premier" });
  });
  it("mur modifié : le mur et ses ouvertures, rien d'autre", () => {
    const d = modele();
    const r = projectionsAInvalider(d, avec(d, { toolId: "studio.architecture.modifier", params: mur("m1", 4, { layerId: "murs", height: 3.2 }) }));
    expect(r).toEqual({ ids: ["m1", "o1", "o2"], complet: false, raison: null });
  });
  it("ouverture modifiée : l'ouverture et son mur hôte (pas les ouvertures sœurs, pas les autres murs)", () => {
    const d = modele();
    const r = projectionsAInvalider(d, avec(d, { toolId: "studio.architecture.modifier", params: ouverture("o1", "m1", 1, { width: 1.2 }) }));
    expect(r).toEqual({ ids: ["m1", "o1"], complet: false, raison: null });
  });
  it("ouverture supprimée ou déplacée vers un autre mur : ancien et nouvel hôte", () => {
    const d = modele();
    expect(projectionsAInvalider(d, avec(d, { toolId: "studio.architecture.supprimer", params: { ids: ["o3"], cascade: false } })).ids).toEqual(["m2", "o3"]);
    expect(projectionsAInvalider(d, avec(d, { toolId: "studio.architecture.modifier", params: ouverture("o3", "m1", 2.5, { width: 0.5 }) })).ids).toEqual(["m1", "m2", "o3"]);
  });
  it("objet déplacé : l'objet et ses cotes liées", () => {
    const d = modele();
    expect(projectionsAInvalider(d, avec(d, { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 0, dy: 1 } })).ids).toEqual(["c1", "l1"]);
    expect(projectionsAInvalider(d, avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["r1"] } })).ids).toEqual(["r1"]);
  });
  it("apparence d'un objet : cet objet ; apparence d'un calque : les objets du calque (ouvertures comprises)", () => {
    const d = modele();
    const app: StudioApparence = { id: "ap1", type: "appearance", target: { kind: "object", id: "b1" }, color: "#c0392b" };
    const d1 = avec(d, { toolId: "studio.apparence.definir", params: app });
    expect(projectionsAInvalider(d, d1)).toEqual({ ids: ["b1"], complet: false, raison: null });
    expect(projectionsAInvalider(d1, avec(d1, { toolId: "studio.apparence.retirer", params: { ids: ["ap1"] } })).ids).toEqual(["b1"]);
    const d2 = avec(d, { toolId: "studio.apparence.definir", params: { ...app, target: { kind: "layer", id: "murs" } } });
    expect(projectionsAInvalider(d, d2).ids).toEqual(["m1", "o1", "o2"]);
  });
  it("calques modifiés (visibilité) ou autre document : reconstruction complète", () => {
    const d = modele();
    expect(projectionsAInvalider(d, avec(d, { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: false, locked: false } }))).toMatchObject({ complet: true, raison: "calques" });
    expect(projectionsAInvalider(d, { ...d, id: "autre" })).toMatchObject({ complet: true, raison: "document" });
  });
  it("apparence touchant beaucoup d'objets : reconstruction complète (ampleur)", () => {
    let d = newStudioDocument("n");
    const lignes = Array.from({ length: 80 }, (_, i): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id: `l${i}`, type: "line", start: { x: i, y: 0 }, end: { x: i, y: 1 } } }));
    d = avec(d, ...lignes);
    const r = projectionsAInvalider(d, avec(d, { toolId: "studio.apparence.definir", params: { id: "ap", type: "appearance", target: { kind: "layer", id: "default" }, color: "#000000" } }));
    expect(r.ids.length).toBe(80);
    expect(r).toMatchObject({ complet: true, raison: "ampleur" });
    expect(80).toBeGreaterThan(STUDIO_SEUIL_INVALIDATION.min);
  });
});

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function hasard(graine: number) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("Maillage par morceaux : identique à studioMesh3d", () => {
  it("assemblage de tous les morceaux = studioMesh3d", () => {
    const d = modele();
    expect(studioAssemblerMaillage(d, new Map(studioMaillerObjets(d, null).map((m) => [m.id, m])))).toEqual(studioMesh3d(d));
    // Sans aucun morceau : tout est remaillé sur place, même résultat.
    expect(studioAssemblerMaillage(d, new Map())).toEqual(studioMesh3d(d));
  });

  it("cache périmé après un calque masqué ou réaffiché : l'assemblage direct rend quand même le maillage complet", () => {
    const d = modele();
    const perime = new Map(studioMaillerObjets(d, null).map((m) => [m.id, m]));
    const masque = avec(d, { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: false, locked: false } });
    // Aucune invalidation consultée : seul l'assemblage décide de ce qu'il reprend du cache.
    expect(studioAssemblerMaillage(masque, perime)).toEqual(studioMesh3d(masque));
    expect(studioMesh3d(masque).architecture!.map((a) => a.id)).toEqual(["m2", "o3"]);
    const perimeMasque = new Map(studioMaillerObjets(masque, null).map((m) => [m.id, m]));
    const reaffiche = avec(masque, { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: true, locked: false } });
    expect(studioAssemblerMaillage(reaffiche, perimeMasque)).toEqual(studioMesh3d(reaffiche));
    // La clé des morceaux des calques inchangés ne change pas : ils restent repris.
    expect(studioMaillerObjets(masque, null).find((m) => m.id === "m2")!.cle).toBe(perime.get("m2")!.cle);
  });

  it("propriété : une suite aléatoire de lots, maillage incrémental toujours égal au maillage complet", () => {
    for (let graine = 1; graine <= 12; graine++) {
      const r = hasard(graine);
      let d = modele();
      let cache: StudioCacheMaillage | null = null;
      for (let pas = 0; pas < 25; pas++) {
        const choix = Math.floor(r() * 9);
        const n = `x${graine}-${pas}`;
        const c = ([
          [{ toolId: "studio.dessin.deplacer", params: { id: "l1", dx: r() - 0.5, dy: 0 } }],
          [{ toolId: "studio.architecture.modifier", params: mur("m2", 8, { height: 3 + r() }) }],
          [{ toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: r() < 0.5, locked: false } }],
          [{ toolId: "studio.dessin.ligne", params: { id: n, type: "line", start: { x: r() * 9, y: r() * 9 }, end: { x: 10 + r(), y: 10 }, ...(r() < 0.5 ? { extrusion: { base: 0, height: 1 + r(), thickness: 0.1 } } : {}) } }],
          [{ toolId: "studio.solide.deplacer", params: { id: "b1", dx: 0, dy: 0, dz: r() } }],
          [{ toolId: "studio.objet.extruder", params: { ids: ["r1"], base: 0, height: 1 + r() } }],
          [{ toolId: "studio.architecture.modifier", params: ouverture("o3", "m2", 1 + r() * 2, { width: 0.5 + r() * 0.5 }) }],
          [{ toolId: "studio.dessin.deplacer", params: { id: "m1", dx: r(), dy: 0 } }],
          [{ toolId: "studio.objet.aplatir", params: { ids: ["r1"] } }],
        ] as StudioCommand[][])[choix]!;
        try { d = avec(d, ...c); } catch { continue; }
        const inc = studioMesh3dIncremental(d, cache);
        expect(inc.mesh).toEqual(studioMesh3d(d));
        cache = inc.cache;
      }
    }
  });
});

/** Document de 2 000 objets : 500 murs avec deux ouvertures chacun (1 500), 500 lignes (moitié extrudées). */
function grandDocument(): StudioDocument {
  const architecture: (StudioWall | StudioOpening)[] = [];
  for (let i = 0; i < 500; i++) {
    architecture.push(mur(`m${i}`, i * 2));
    architecture.push(ouverture(`m${i}-a`, `m${i}`, 0.5), ouverture(`m${i}-b`, `m${i}`, 3));
  }
  const objects = Array.from({ length: 500 }, (_, i) => ({ id: `l${i}`, type: "line" as const, start: { x: 10, y: i }, end: { x: 14, y: i }, ...(i % 2 ? { extrusion: { base: 0, height: 2, thickness: 0.2 } } : {}) }));
  return validateStudioDocument({ ...newStudioDocument("grand"), objects, architecture });
}

describe("Banc C.2 : un mur modifié dans un document de 2 000 objets", () => {
  it("ne remaille que ce mur et ses ouvertures, résultat identique au maillage complet", () => {
    const d = grandDocument();
    expect(d.objects.length + d.architecture!.length).toBe(2000);
    const t0 = performance.now();
    const complet = studioMesh3dIncremental(d, null);
    const tComplet = performance.now() - t0;
    expect(complet.remailles.length).toBe(2000);
    const d2 = avec(d, { toolId: "studio.architecture.modifier", params: mur("m250", 500, { height: 3.4 }) });
    const t1 = performance.now();
    const inc = studioMesh3dIncremental(d2, complet.cache);
    const tInc = performance.now() - t1;
    expect(inc.invalidation).toEqual({ ids: ["m250", "m250-a", "m250-b"], complet: false, raison: null });
    expect(inc.remailles).toEqual(["m250", "m250-a", "m250-b"]);
    expect(inc.mesh).toEqual(studioMesh3d(d2));
    // Les morceaux non touchés sont repris tels quels (même objet), pas recopiés.
    expect(inc.cache.morceaux.get("m249")).toBe(complet.cache.morceaux.get("m249"));
    expect(inc.cache.morceaux.get("m250")).not.toBe(complet.cache.morceaux.get("m250"));
    // Mesure indicative (non bloquante, dépend de la machine) : complet vs incrémental, clés de contenu comprises.
    console.info(`[banc C.2] 2 000 objets — maillage complet ${tComplet.toFixed(1)} ms, incrémental (1 mur + 2 ouvertures) ${tInc.toFixed(1)} ms`);
    expect(studioClesProjection(d2).size).toBe(2000);
  });
});
