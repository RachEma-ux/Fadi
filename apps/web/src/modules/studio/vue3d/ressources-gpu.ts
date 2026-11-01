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

/** Accès minimal aux propriétés internes du moteur de rendu (`renderer.properties`, publiques dans three.js). */
interface ProprietesRendu { properties: { get(objet: object): unknown } }

/**
 * Textures **partagées entre moteurs de rendu** que l'on trouve dans les uniformes des matériaux de la scène, sans en
 * être la propriété (ni carte ni texture d'un matériau) : three.js crée au niveau de son module une table DFG
 * (`DFG_LUT`) pour les matériaux physiques et chaque moteur s'y abonne (« dispose ») sans jamais s'en désabonner. À
 * relever **avant** de libérer les matériaux (leurs propriétés de rendu disparaissent avec eux).
 */
export function texturesPartagees(renderer: ProprietesRendu, racines: readonly THREE.Object3D[]): THREE.Texture[] {
  const trouvees = new Set<THREE.Texture>();
  for (const racine of racines) racine.traverse((o) => {
    const m = (o as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
    for (const materiau of Array.isArray(m) ? m : m ? [m] : []) {
      const propres = new Set(Object.values(materiau).filter((v): v is THREE.Texture => v instanceof THREE.Texture));
      const proprietes = renderer.properties.get(materiau) as { uniforms?: Record<string, { value?: unknown } | undefined> } | undefined;
      for (const u of Object.values(proprietes?.uniforms ?? {})) {
        if (u?.value instanceof THREE.Texture && !propres.has(u.value) && u.value.name === "DFG_LUT") trouvees.add(u.value);
      }
    }
  });
  return [...trouvees];
}

/**
 * Libère les textures partagées relevées par `texturesPartagees` : leur « dispose » désabonne chaque moteur de rendu
 * qui s'y était abonné (sans quoi chaque fermeture de la vue 3D retiendrait un moteur entier). La texture reste
 * utilisable : le moteur suivant la renvoie au GPU à son premier rendu.
 */
export function libererTexturesPartagees(textures: readonly THREE.Texture[]): void {
  for (const t of textures) t.dispose();
}

export interface CompteGpu { geometries: number; textures: number }
export const compteGpu = (r: { info: { memory: CompteGpu } }): CompteGpu => ({ geometries: r.info.memory.geometries, textures: r.info.memory.textures });
