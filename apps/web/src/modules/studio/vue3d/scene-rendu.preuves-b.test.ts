/**
 * C.2-03 — identifiant de sélection juste après la **modification** d'un objet (la suppression est prouvée par
 * `scene-rendu.test.ts`) : trois murs fusionnés dans un seul lot ; un mur est déplacé, un autre change de géométrie (une
 * ouverture ajoutée décale les plages de triangles du lot). Après le remaillage, un clic sur chaque mur rend son propre
 * identifiant, à sa nouvelle place ; l'ancienne place du mur déplacé ne désigne plus rien ; aucun clic ne rend
 * l'identifiant d'un autre objet. Même chemin que la vue 3D (invalidation, maillage des seuls objets invalidés, fusion,
 * assemblage, scène incrémentale, table de désignation).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyStudioCommands, newStudioDocument, projectionsAInvalider, studioAssemblerMaillage, studioFusionnerMorceaux, studioMaillerObjets, validateStudioDocument,
  type StudioCacheMaillage, type StudioDocument, type StudioMesh3d, type StudioWall,
} from "@parcours/atelier-model";
import { designer, idImpact, type Impact } from "./picking";
import { SceneRendu, type DonneesLot, type EntreeRendu } from "./scene-rendu";

const ASPECT = { couleur: 0xd8d2c4, mode: "shaded-edges" as const, apparence: false, double: false };

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

function etape(cache: StudioCacheMaillage | null, doc: StudioDocument) {
  const invalidation = projectionsAInvalider(cache?.doc ?? null, doc);
  const morceaux = studioMaillerObjets(doc, invalidation.complet ? null : invalidation.ids);
  const suivant = studioFusionnerMorceaux(cache, doc, invalidation, morceaux);
  return { remailles: morceaux.map((m) => m.id), cache: suivant, mesh: studioAssemblerMaillage(doc, suivant.morceaux) };
}

describe("C.2-03 — identifiant de sélection juste après la modification d'un objet", () => {
  it("mur déplacé et mur rallongé d'une ouverture (plages du lot décalées) : chaque clic rend son mur, l'ancienne place ne désigne plus rien", () => {
    let d = validateStudioDocument({ ...newStudioDocument("d"), objects: [], architecture: [mur(0), mur(1), mur(2)] });
    let e = etape(null, d);
    const groupe = new THREE.Group();
    const scene = new SceneRendu(groupe, 1);
    scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), "1");
    groupe.updateMatrixWorld(true);
    const rayon = (x: number, y: number) => {
      const r = new THREE.Raycaster(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1));
      return r.intersectObjects(groupe.children, false).filter((h) => h.object instanceof THREE.Mesh).map((h): Impact => {
        const lot = h.object.userData.lot as DonneesLot | undefined;
        return lot ? { distance: h.distance, table: lot.table, triangle: h.faceIndex ?? null } : { distance: h.distance, id: h.object.userData.architecture as string };
      });
    };
    expect(scene.taille).toEqual({ seuls: 0, lots: 1 });
    expect([rayon(2, 0), rayon(2, 2), rayon(2, 4)].map((r) => r.map(idImpact))).toEqual([["m0"], ["m1"], ["m2"]]);
    const trianglesAvant = (e.mesh.architecture ?? []).find((a) => a.id === "m0")!.triangles.length;

    // Modifications : m1 déplacé de y = 2 à y = 7 ; m0 reçoit une ouverture (plus de triangles : les plages de m1, m2 bougent).
    const presents = (doc: StudioDocument) => (id: string) => (doc.architecture ?? []).some((a) => a.id === id);
    const apres = applyStudioCommands(d, [
      { toolId: "studio.architecture.modifier", params: { ...mur(1), axis: [{ x: 0, y: 7 }, { x: 6, y: 7 }] } },
      { toolId: "studio.architecture.ouverture", params: { id: "o0", type: "opening", hostId: "m0", position: 3, width: 1, height: 2.1, sill: 0 } },
    ]);
    // Maillage affiché encore l'ancien : m1 existe toujours (modifié, pas supprimé) — son identifiant reste le sien.
    expect(designer(rayon(2, 2), presents(apres))?.id).toBe("m1");
    d = apres;
    e = etape(e.cache, d);
    expect(e.remailles.sort()).toEqual(["m0", "m1", "o0"]);
    expect((e.mesh.architecture ?? []).find((a) => a.id === "m0")!.triangles.length).toBeGreaterThan(trianglesAvant);
    scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), "2");
    groupe.updateMatrixWorld(true);
    // Nouvelle place de m1 : son identifiant ; ancienne place : rien (ni m1, ni un autre mur).
    expect(designer(rayon(2, 7), presents(d))?.id).toBe("m1");
    expect(rayon(2, 2)).toEqual([]);
    // m0 (hors de l'ouverture) et m2, dont les plages de triangles du lot ont été décalées, gardent leur identifiant.
    expect(designer(rayon(1, 0), presents(d))?.id).toBe("m0");
    expect(designer(rayon(2, 4), presents(d))?.id).toBe("m2");
    // À travers l'ouverture de m0 : l'ouverture (objet seul) ou rien, jamais un autre mur.
    const traverse = rayon(3, 0).map(idImpact);
    expect(traverse.every((id) => id === "o0" || id === "m0")).toBe(true);
    scene.vider();
  });
});
