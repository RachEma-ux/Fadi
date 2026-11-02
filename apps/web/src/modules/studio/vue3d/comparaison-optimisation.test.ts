/**
 * AC-005 / MES-03 — fidélité avant / après optimisation de la vue 3D (sélection, orbite, zoom, pousser / tirer,
 * changement de matériau), postes mesurés séparément. Ici, dans Node, le rendu CPU est un substitut (mise à jour des
 * matrices de la scène) ; la recette `apps/web/e2e/studio-g4.mjs` rejoue la même comparaison dans Chromium avec le vrai
 * `renderer.render()`. Le GPU n'est mesuré nulle part (« non évalué »).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { studioJugerOptimisation } from "@parcours/atelier-model/studio-mesures";
import { comparerOptimisation, sceneComparaison, trianglesDe, type Instruments } from "./comparaison-optimisation";

const instruments = (): Instruments => ({
  maintenant: () => performance.now(),
  rendre: (s) => s.updateMatrixWorld(true),
  memoire: () => process.memoryUsage().heapUsed,
});
const ENV = { etiquette: "Node (Vitest) — aucun rendu WebGL, GPU non évalué", renduLogiciel: true };

describe("AC-005 / MES-03 — avant / après optimisation de la vue 3D", () => {
  it("sélection, orbite, zoom, pousser / tirer et matériau : mêmes objets désignés, mêmes distances, mêmes aspects, mêmes triangles ; verdict « fidèle », GPU non évalué", () => {
    const { initial, scenario } = sceneComparaison(2);
    const r = comparerOptimisation(initial, scenario, instruments, ENV);
    expect(r.operations.map((o) => o.operation)).toEqual(["selection", "orbite", "zoom", "pousser-tirer", "materiau"]);
    for (const o of r.operations) {
      expect(o.fidelite.divergences, o.operation).toBe(0);
      expect(o.fidelite.aspectsDivergents, o.operation).toBe(0);
      expect(o.fidelite.ecartDistanceMax, o.operation).toBeLessThanOrEqual(1e-6);
      expect(o.fidelite.trianglesOptimise, o.operation).toBe(o.fidelite.trianglesReference);
      expect(o.fidelite.rayons).toBe(1200);
    }
    // La grille touche bien la scène (le test n'est pas vide) : plus de la moitié des rayons touchent un objet.
    expect(r.operations[0]!.fidelite.trianglesReference).toBeGreaterThan(200);
    const v = studioJugerOptimisation(r);
    expect(v).toMatchObject({ verdict: "fidele", gpu: "non évalué", infideles: [], postesManquants: [], refus: [] });
  });

  it("l'optimisation est réellement active : rien de reconstruit pour orbite et zoom, seul l'objet touché pour sélection, pousser / tirer et matériau ; la référence reconstruit tout", () => {
    const { initial, scenario } = sceneComparaison(2);
    const r = comparerOptimisation(initial, scenario, instruments, ENV);
    const par = Object.fromEntries(r.operations.map((o) => [o.operation, o]));
    expect(par.orbite!.optimise.invalidation).toMatchObject({ objets: 0, complet: false, reconstruits: 0 });
    expect(par.zoom!.optimise.invalidation).toMatchObject({ objets: 0, complet: false, reconstruits: 0 });
    expect(par.orbite!.optimise.transfertOctets).toBe(0);
    expect(par.selection!.optimise.invalidation).toMatchObject({ objets: 0, reconstruits: 1 });
    expect(par["pousser-tirer"]!.optimise.invalidation).toMatchObject({ objets: 1, complet: false, reconstruits: 1 });
    expect(par.materiau!.optimise.invalidation!.complet).toBe(false);
    expect(par.materiau!.optimise.invalidation!.reconstruits).toBeLessThanOrEqual(2);
    const total = par.orbite!.reference.invalidation!.reconstruits;
    expect(total).toBeGreaterThan(15);
    for (const o of r.operations) expect(o.reference.invalidation).toMatchObject({ complet: true, reconstruits: total });
  });

  it("MES-03 : transfert (durée et octets), activation, calcul, rendu CPU, invalidation et mémoire résiduelle relevés séparément sur les deux chemins ; rendu GPU jamais rempli", () => {
    const { initial, scenario } = sceneComparaison(1);
    const r = comparerOptimisation(initial, scenario, instruments, ENV);
    for (const o of r.operations) {
      for (const m of [o.reference, o.optimise]) {
        for (const p of ["transfertMs", "transfertOctets", "activationMs", "calculMs", "renduCpuMs", "memoireResiduelleOctets"] as const) expect(Number.isFinite(m[p]), `${o.operation} ${p}`).toBe(true);
        expect(m.invalidation).not.toBeNull();
        expect(m.renduGpuMs).toBeNull();
      }
      expect(o.reference.transfertOctets!).toBeGreaterThan(1000);
    }
  });

  it("contrôle par mutation : objet périmé après pousser / tirer, ou couleur d'aspect faussée après le matériau → « infidèle »", () => {
    const { initial, scenario } = sceneComparaison(1);
    // Optimisation fautive simulée : le solide poussé / tiré est retiré de la scène optimisée (géométrie sacrifiée).
    const perime = comparerOptimisation(initial, scenario, instruments, ENV, {
      alterer: (op, scene) => {
        if (op !== "pousser-tirer") return;
        const cible: THREE.Object3D[] = [];
        scene.traverse((o) => { if (o.userData.solide === "boite-1") cible.push(o); });
        for (const o of cible) o.removeFromParent();
      },
    });
    const v1 = studioJugerOptimisation(perime);
    expect(v1.verdict).toBe("infidele");
    // Fidèle jusqu'à l'opération fautive ; l'objet retiré reste absent ensuite (la scène incrémentale ne le reconstruit pas).
    expect(v1.infideles[0]!.operation).toBe("pousser-tirer");
    expect(new Set(v1.infideles.map((i) => i.operation))).toEqual(new Set(["pousser-tirer", "materiau"]));
    expect(trianglesDe(new THREE.Scene())).toBe(0);
    // Aspect faussé : toutes les surfaces optimisées repeintes après le changement de matériau.
    const teinte = comparerOptimisation(initial, scenario, instruments, ENV, {
      alterer: (op, scene) => {
        if (op !== "materiau") return;
        scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (o instanceof THREE.Mesh && m?.color) m.color.setHex(0x123456); });
      },
    });
    const v2 = studioJugerOptimisation(teinte);
    expect(v2.verdict).toBe("infidele");
    expect(teinte.operations.find((o) => o.operation === "materiau")!.fidelite.aspectsDivergents).toBeGreaterThan(0);
  });
});
