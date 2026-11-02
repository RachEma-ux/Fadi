/**
 * Présentation sans anti-crénelage (palier 4 de la dégradation sûre, `qualite-rendu.ts`) : le contexte WebGL de la vue
 * est créé multi-échantillonné (l'anti-crénelage d'un canevas ne se coupe pas sans recréer le contexte) ; quand la
 * politique coupe l'anti-crénelage, la scène est rendue dans une cible **non** multi-échantillonnée à la résolution du
 * canevas, puis recopiée sur le canevas par un seul quadrilatère plein écran. Seule la présentation change : caméra,
 * objets, désignation (lancer de rayons) et document ne sont pas touchés. Créée à la demande et libérée au retour de
 * l'anti-crénelage (ses ressources GPU ne comptent que pendant la dégradation).
 *
 * three.js seulement (aucun DOM) ; construire et libérer ne demandent aucun contexte.
 */
import * as THREE from "three";

export class PresentationSansMsaa {
  private readonly cible: THREE.WebGLRenderTarget;
  private readonly ecran = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly taille = new THREE.Vector2();
  private rendue = false;

  /** Ressources GPU propres à la présentation (cible et quadrilatère), une fois rendue : hors de la ligne de base de la scène. */
  get ressources(): { geometries: number; textures: number } { return this.rendue ? { geometries: 1, textures: 1 } : { geometries: 0, textures: 0 }; }

  constructor() {
    // Demi-flottants : la recopie ne bande pas les dégradés (la cible est en espace linéaire, encodée à l'écran).
    this.cible = new THREE.WebGLRenderTarget(1, 1, { samples: 0, type: THREE.HalfFloatType, depthBuffer: true });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.cible.texture, depthTest: false, depthWrite: false, toneMapped: false }));
    this.quad.frustumCulled = false;
    this.ecran.add(this.quad);
  }

  /** Rend `scene` vue de `camera` dans la cible, puis la recopie sur le canevas de `renderer`. */
  rendre(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.getDrawingBufferSize(this.taille);
    const w = Math.max(1, Math.floor(this.taille.x)), h = Math.max(1, Math.floor(this.taille.y));
    if (this.cible.width !== w || this.cible.height !== h) this.cible.setSize(w, h);
    const avant = renderer.getRenderTarget();
    renderer.setRenderTarget(this.cible);
    renderer.render(scene, camera);
    renderer.setRenderTarget(avant);
    renderer.render(this.ecran, this.camera);
    this.rendue = true;
  }

  liberer(): void {
    this.cible.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
