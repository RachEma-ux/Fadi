/**
 * EX-008 (sens de dépendance), cas négatif : modifier directement une coordonnée de la scène GPU (tampon de sommets
 * three.js) ne crée aucun changement métier — ni le document canonique, ni le brouillon (aucune commande en attente,
 * donc rien à enregistrer), ni le maillage dérivé du document ne changent ; la scène reconstruite depuis le document
 * retrouve la géométrie canonique. Mur 6 × 3 × 0,2 m (cas d'essai géométrique de REF-02 §4.5).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { newStudioDocument, studioMesh3d, validateStudioDocument, type StudioMesh3d } from "@parcours/atelier-model";
import { commandesEnAttente, creerBrouillon, documentBrouillon } from "../planche2d/brouillon";
import { SceneRendu, type EntreeRendu } from "./scene-rendu";

function entrees(mesh: StudioMesh3d): EntreeRendu[] {
  return (mesh.architecture ?? []).map((a): EntreeRendu => ({
    id: a.id, signature: `${a.id}-1`, construire: () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(a.vertices.flatMap((v) => [v.x, v.y, v.z])), 3));
      g.setIndex(a.triangles.flat());
      const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      o.userData.architecture = a.id;
      return [o];
    },
  }));
}
const positions = (g: THREE.Group) => g.children.flatMap((o) => [...((o as THREE.Mesh).geometry.getAttribute("position").array as Float32Array)]);

describe("EX-008 — une modification de la scène graphique ne crée pas de changement métier sans commande", () => {
  it("EX-008 [−] coordonnée GPU modifiée directement : document, brouillon et maillage canonique inchangés, rien à enregistrer", () => {
    const doc = validateStudioDocument({ ...newStudioDocument("ex008"), objects: [], architecture: [{ id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" }] });
    const docAvant = JSON.stringify(doc), meshAvant = studioMesh3d(doc);
    const brouillon = creerBrouillon(doc);
    const groupe = new THREE.Group();
    const scene = new SceneRendu(groupe);
    scene.mettreAJour(entrees(meshAvant), "1");
    const gpuAvant = positions(groupe);
    // Altération directe de la scène : premier sommet du mur déplacé de 10 m en x dans le tampon GPU.
    const attribut = (groupe.children[0] as THREE.Mesh).geometry.getAttribute("position") as THREE.BufferAttribute;
    attribut.setX(0, attribut.getX(0) + 10);
    attribut.needsUpdate = true;
    expect(positions(groupe)).not.toEqual(gpuAvant);
    // Aucun effet métier : le document canonique et le brouillon ne bougent pas, aucune commande n'attend un envoi.
    expect(JSON.stringify(doc)).toBe(docAvant);
    expect(JSON.stringify(documentBrouillon(brouillon))).toBe(docAvant);
    expect(commandesEnAttente(brouillon)).toEqual([]);
    expect(studioMesh3d(doc)).toEqual(meshAvant);
    // La scène n'est qu'une projection : reconstruite depuis le document, elle retrouve la géométrie canonique.
    const reconstruite = new THREE.Group();
    new SceneRendu(reconstruite).mettreAJour(entrees(studioMesh3d(doc)), "2");
    expect(positions(reconstruite)).toEqual(gpuAvant);
    scene.vider();
  });
});
