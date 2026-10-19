/**
 * Scène de rendu incrémentale (lot C.2) : reconstruction minimale, lots et tables de désignation, libération GPU.
 * Banc : un mur modifié dans un document de 2 000 objets ne remaille que ce mur et ses ouvertures, et ne reconstruit
 * côté GPU que leur lot et leurs objets seuls.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyStudioCommands, newStudioDocument, projectionsAInvalider, studioAssemblerMaillage, studioFusionnerMorceaux, studioMaillerObjets, studioMesh3d, validateStudioDocument,
  type StudioCacheMaillage, type StudioDocument, type StudioMesh3d, type StudioOpening, type StudioWall,
} from "@parcours/atelier-model";
import { designer, idImpact, type Impact } from "./picking";
import { SceneRendu, type DonneesLot, type EntreeRendu } from "./scene-rendu";

const ASPECT = { couleur: 0xd8d2c4, mode: "shaded-edges" as const, apparence: false, double: false };

/** Géométries vivantes (comme `renderer.info.memory.geometries`) : création comptée, `dispose` décompté. */
function suiviGeometries() {
  const vivantes = new Set<THREE.BufferGeometry>();
  const original = THREE.BufferGeometry.prototype.setAttribute;
  THREE.BufferGeometry.prototype.setAttribute = function (this: THREE.BufferGeometry, ...a: Parameters<typeof original>) {
    if (!vivantes.has(this)) { vivantes.add(this); this.addEventListener("dispose", () => vivantes.delete(this)); }
    return original.apply(this, a);
  } as typeof original;
  return { vivantes, restaurer: () => { THREE.BufferGeometry.prototype.setAttribute = original; } };
}

/** Entrées comme la vue 3D : murs en lots, ouvertures seules (désignables par identifiant). */
function entrees(mesh: StudioMesh3d, cle: (id: string) => string): EntreeRendu[] {
  return (mesh.architecture ?? []).map((a): EntreeRendu => a.type === "wall"
    ? { id: a.id, signature: cle(a.id), lot: "mur", geometrie: a, aspect: ASPECT }
    : {
      id: a.id, signature: cle(a.id), construire: () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(a.vertices.flatMap((v) => [v.x, v.y, v.z])), 3));
        g.setIndex(a.triangles.flat());
        const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
        o.userData.architecture = a.id;
        return [o];
      },
    });
}

const mur = (i: number, over: Partial<StudioWall> = {}): StudioWall => ({ id: `m${i}`, type: "wall", axis: [{ x: 0, y: i * 2 }, { x: 6, y: i * 2 }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over });
const ouverture = (id: string, hostId: string, position: number): StudioOpening => ({ id, type: "opening", hostId, position, width: 1, height: 2.1, sill: 0 });

/** 2 000 objets : 500 murs à deux ouvertures (1 500) et 500 lignes, moitié extrudées. */
function grandDocument(): StudioDocument {
  const architecture: (StudioWall | StudioOpening)[] = [];
  for (let i = 0; i < 500; i++) architecture.push(mur(i), ouverture(`m${i}-a`, `m${i}`, 0.5), ouverture(`m${i}-b`, `m${i}`, 3));
  const objects = Array.from({ length: 500 }, (_, i) => ({ id: `l${i}`, type: "line" as const, start: { x: 10, y: i }, end: { x: 14, y: i }, ...(i % 2 ? { extrusion: { base: 0, height: 2, thickness: 0.2 } } : {}) }));
  return validateStudioDocument({ ...newStudioDocument("grand"), objects, architecture });
}

/** Chemin de la vue 3D : plan relatif au cache, maillage des seuls objets invalidés, fusion, assemblage. */
function etape(cache: StudioCacheMaillage | null, doc: StudioDocument) {
  const invalidation = projectionsAInvalider(cache?.doc ?? null, doc);
  const morceaux = studioMaillerObjets(doc, invalidation.complet ? null : invalidation.ids);
  const suivant = studioFusionnerMorceaux(cache, doc, invalidation, morceaux);
  return { invalidation, remailles: morceaux.map((m) => m.id), cache: suivant, mesh: studioAssemblerMaillage(doc, suivant.morceaux) };
}

describe("scène de rendu incrémentale", () => {
  it("banc 2 000 objets : un mur modifié → ce mur et ses ouvertures remaillés, un seul lot reconstruit, le reste conservé", () => {
    const suivi = suiviGeometries();
    try {
      const d0 = grandDocument();
      const groupe = new THREE.Group();
      const scene = new SceneRendu(groupe);
      const t0 = performance.now();
      const e0 = etape(null, d0);
      const b0 = scene.mettreAJour(entrees(e0.mesh, (id) => e0.cache.morceaux.get(id)!.cle), "1");
      const tComplet = performance.now() - t0;
      expect(e0.remailles.length).toBe(2000);
      expect(b0.lotsConstruits).toBeLessThanOrEqual(64);
      expect(b0.construits).toBe(1000);
      const geometriesBase = suivi.vivantes.size;

      const d1 = applyStudioCommands(d0, [{ toolId: "studio.architecture.modifier", params: mur(250, { height: 3.4 }) }]);
      const t1 = performance.now();
      const e1 = etape(e0.cache, d1);
      const b1 = scene.mettreAJour(entrees(e1.mesh, (id) => e1.cache.morceaux.get(id)!.cle), "2");
      const tIncremental = performance.now() - t1;
      expect(e1.invalidation).toEqual({ ids: ["m250", "m250-a", "m250-b"], complet: false, raison: null });
      expect(e1.remailles).toEqual(["m250", "m250-a", "m250-b"]);
      expect(e1.mesh).toEqual(studioMesh3d(d1));
      // GPU : le lot du mur et ses deux ouvertures (seules) reconstruits ; tout le reste conservé ; rien ne s'accumule.
      expect({ lots: b1.lotsConstruits, seuls: b1.construits }).toEqual({ lots: 1, seuls: 2 });
      expect(b1.conserves).toBe(b0.lotsConstruits - 1 + 998);
      expect(suivi.vivantes.size).toBe(geometriesBase);

      // Référence : l'ancienne reconstruction complète (un maillage par objet, tout reconstruit à chaque lot).
      const t2 = performance.now();
      const ancien = new SceneRendu(new THREE.Group(), 1e9);
      ancien.mettreAJour(entrees(studioMesh3d(d1), () => `${Math.random()}`), "3");
      const tAncien = performance.now() - t2;
      ancien.vider();
      console.info(`[banc C.2 vue 3D] 2 000 objets — premier rendu ${tComplet.toFixed(1)} ms ; mur modifié : incrémental ${tIncremental.toFixed(1)} ms (3 remaillés, 1 lot + 2 objets reconstruits) contre reconstruction complète ${tAncien.toFixed(1)} ms ; appels de dessin des murs : ${scene.taille.lots} lots au lieu de 500`);
      scene.vider();
      expect(suivi.vivantes.size).toBe(0);
    } finally { suivi.restaurer(); }
  });

  it("C.2-02 / C.2-03 : un clic sur un mur fusionné rend son identifiant ; supprimé, jamais lui", () => {
    let d = validateStudioDocument({ ...newStudioDocument("d"), objects: [], architecture: [mur(0), mur(1), mur(2)] });
    let e = etape(null, d);
    const groupe = new THREE.Group();
    const scene = new SceneRendu(groupe, 1); // un seul lot : les trois murs fusionnés
    scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), "1");
    groupe.updateMatrixWorld(true);
    const rayon = (y: number) => {
      const r = new THREE.Raycaster(new THREE.Vector3(2, y, 10), new THREE.Vector3(0, 0, -1));
      return r.intersectObjects(groupe.children, false).filter((h) => h.object instanceof THREE.Mesh).map((h): Impact => {
        const lot = h.object.userData.lot as DonneesLot | undefined;
        return lot ? { distance: h.distance, table: lot.table, triangle: h.faceIndex ?? null } : { distance: h.distance, id: h.object.userData.architecture as string };
      });
    };
    expect(scene.taille).toEqual({ seuls: 0, lots: 1 });
    expect(rayon(2).map(idImpact)).toEqual(["m1"]);
    expect(rayon(4).map(idImpact)).toEqual(["m2"]);
    const presents = (doc: StudioDocument) => (id: string) => (doc.architecture ?? []).some((a) => a.id === id);
    // Supprimé dans le document, maillage affiché encore l'ancien : le clic ne rend pas m1.
    const apres = applyStudioCommands(d, [{ toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: false } }]);
    expect(designer(rayon(2), presents(apres))).toBeNull();
    // Puis maillé à nouveau : le lot est reconstruit, sa table ne connaît plus m1, le même rayon ne touche rien.
    d = apres;
    e = etape(e.cache, d);
    expect(e.remailles).toEqual([]);
    scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), "2");
    groupe.updateMatrixWorld(true);
    expect(rayon(2)).toEqual([]);
    expect(rayon(4).map(idImpact)).toEqual(["m2"]);
    scene.vider();
  });

  it("ouverture modifiée (C.2-06) : son mur hôte est remaillé avec elle, le lot du mur et l'ouverture reconstruits", () => {
    const d = validateStudioDocument({ ...newStudioDocument("d"), objects: [], architecture: [mur(0), ouverture("o", "m0", 1), mur(1)] });
    const e = etape(null, d);
    const scene = new SceneRendu(new THREE.Group());
    scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), "1");
    const d2 = applyStudioCommands(d, [{ toolId: "studio.architecture.modifier", params: { ...ouverture("o", "m0", 2), width: 1.5 } }]);
    const e2 = etape(e.cache, d2);
    expect(e2.remailles).toEqual(["m0", "o"]);
    const b = scene.mettreAJour(entrees(e2.mesh, (id) => e2.cache.morceaux.get(id)!.cle), "2");
    expect(b.construits + b.lotsConstruits).toBe(2);
    expect(e2.mesh).toEqual(studioMesh3d(d2));
    scene.vider();
  });
});
