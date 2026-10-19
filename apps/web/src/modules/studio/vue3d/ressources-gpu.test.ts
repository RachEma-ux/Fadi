/**
 * Libération GPU de la vue 3D (D.3-02) : chaque géométrie, matériau et texture créés pour une scène est libéré à la
 * reconstruction et au démontage ; le compte des ressources vivantes revient à sa ligne de base après des cycles.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { compteGpu, libererObjet, vider } from "./ressources-gpu";

/** Suit les ressources vivantes comme `renderer.info.memory` (incrément à la création, décrément à `dispose`). */
function suivi() {
  const vivantes = new Set<{ dispose(): void }>();
  const suivre = <T extends THREE.EventDispatcher<{ dispose: object }> & { dispose(): void }>(r: T): T => {
    vivantes.add(r);
    r.addEventListener("dispose", () => vivantes.delete(r));
    return r;
  };
  return { vivantes, suivre };
}

function scene(groupe: THREE.Group, suivre: ReturnType<typeof suivi>["suivre"]) {
  const texture = suivre(new THREE.Texture());
  groupe.add(new THREE.Mesh(suivre(new THREE.BoxGeometry()), suivre(new THREE.MeshStandardMaterial({ map: texture }))));
  groupe.add(new THREE.LineSegments(suivre(new THREE.BufferGeometry()), suivre(new THREE.LineBasicMaterial())));
  const imbrique = new THREE.Group();
  imbrique.add(new THREE.Mesh(suivre(new THREE.BufferGeometry()), [suivre(new THREE.MeshBasicMaterial()), suivre(new THREE.MeshBasicMaterial())]));
  groupe.add(imbrique);
}

describe("ressources GPU de la vue 3D", () => {
  it("reconstruction répétée (changement de scène) : rien ne s'accumule", () => {
    const { vivantes, suivre } = suivi();
    const g = new THREE.Group();
    scene(g, suivre);
    const base = vivantes.size;
    expect(base).toBe(8);
    for (let i = 0; i < 10; i++) { vider(g); scene(g, suivre); }
    expect(vivantes.size).toBe(base);
    vider(g);
    expect(vivantes.size).toBe(0);
    expect(g.children).toHaveLength(0);
  });

  it("démontage : libererObjet libère la grille et tous les descendants, textures comprises", () => {
    const { vivantes, suivre } = suivi();
    const racine = new THREE.Group();
    scene(racine, suivre);
    const grille = new THREE.GridHelper(4, 4);
    suivre(grille.geometry); suivre(grille.material as THREE.Material);
    racine.add(grille);
    libererObjet(racine);
    expect(vivantes.size).toBe(0);
  });

  it("compteGpu lit renderer.info.memory", () => {
    expect(compteGpu({ info: { memory: { geometries: 3, textures: 1 } } })).toEqual({ geometries: 3, textures: 1 });
  });
});
