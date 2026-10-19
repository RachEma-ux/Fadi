/**
 * Libération des ressources GPU de la vue 3D de Studio (D.3-02) : géométries, matériaux et textures de three.js sont
 * libérés quand un groupe est reconstruit (changement de scène : nouveau maillage, sélection, coupe) et au démontage.
 * `compteGpu` lit les compteurs `renderer.info.memory` pour la recette (retour à la ligne de base).
 *
 * Ni React ni DOM : three.js seulement (objets de scène, aucun contexte WebGL requis pour libérer).
 */
import * as THREE from "three";

function libererMateriau(m: THREE.Material): void {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
  m.dispose();
}

/** Libère la géométrie, les matériaux et leurs textures de l'objet et de tous ses descendants. */
export function libererObjet(racine: THREE.Object3D): void {
  racine.traverse((o) => {
    const porteur = o as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    porteur.geometry?.dispose();
    const m = porteur.material;
    if (Array.isArray(m)) m.forEach(libererMateriau); else if (m) libererMateriau(m);
  });
}

/** Retire et libère tous les enfants du groupe (le groupe lui-même reste dans la scène). */
export function vider(groupe: THREE.Object3D): void {
  for (const enfant of [...groupe.children]) {
    groupe.remove(enfant);
    libererObjet(enfant);
  }
}

export interface CompteGpu { geometries: number; textures: number }
export const compteGpu = (r: { info: { memory: CompteGpu } }): CompteGpu => ({ geometries: r.info.memory.geometries, textures: r.info.memory.textures });
