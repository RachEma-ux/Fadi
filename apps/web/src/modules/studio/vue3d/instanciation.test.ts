/**
 * C.2-02 — tables de désignation conservées après batching ET instanciation : des volumes répétés (même aspect, même
 * forme à une translation près) sont rendus par un seul `THREE.InstancedMesh` ; un clic sur l'exemplaire i se résout en
 * l'identifiant Studio de son objet, jamais en un objet supprimé ; mesuré : un seul objet de rendu pour N exemplaires.
 * Maillage réel du modèle (`studioMesh3d`), scène réelle (`SceneRendu`), rayons three.js réels (aucun WebGL).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyStudioCommands, newStudioDocument, studioMesh3d, type StudioCommand } from "@parcours/atelier-model";
import { designer } from "./picking";
import { cleForme, impactDe, SceneRendu, SEUIL_INSTANCIATION, type EntreeRendu } from "./scene-rendu";

const aspect = { couleur: 0xb9d3cf, mode: "shaded" as const, apparence: false, double: false };
const rect = (id: string, x: number, y: number, w = 1): StudioCommand => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", origin: { x, y }, width: w, height: 1 } });
function scene(ids: { id: string; x: number; y: number; w?: number }[]) {
  const doc = applyStudioCommands(newStudioDocument("d"), [...ids.map((r) => rect(r.id, r.x, r.y, r.w)), { toolId: "studio.objet.extruder", params: { ids: ids.map((r) => r.id), base: 0, height: 3 } }]);
  const mesh = studioMesh3d(doc);
  const entrees: EntreeRendu[] = mesh.solids.map((s) => ({ id: s.id, signature: `${s.id}:${JSON.stringify(s.vertices[0])}`, lot: "contenu", instanciable: true, geometrie: s, aspect }));
  return { mesh, entrees };
}
/** Clic vertical (du dessus) en (x, y). */
function cliquer(groupe: THREE.Group, x: number, y: number, designable: (id: string) => boolean = () => true) {
  groupe.updateMatrixWorld(true);
  const r = new THREE.Raycaster(new THREE.Vector3(x, y, 50), new THREE.Vector3(0, 0, -1));
  return designer(r.intersectObjects(groupe.children, false).map(impactDe), designable)?.id ?? null;
}

describe("C.2-02 — désignation conservée avec l'instanciation", () => {
  it("cinq poteaux identiques et un différent : un InstancedMesh de cinq exemplaires (un objet de rendu), chaque clic rend son poteau", () => {
    const poteaux = [0, 4, 8, 12, 16].map((x, i) => ({ id: `p${i}`, x, y: 0 }));
    const { entrees } = scene([...poteaux, { id: "large", x: 0, y: 10, w: 3 }]);
    expect(new Set(entrees.filter((e) => e.id.startsWith("p")).map((e) => cleForme((e as { geometrie: Parameters<typeof cleForme>[0] }).geometrie))).size).toBe(1);
    const groupe = new THREE.Group();
    const s = new SceneRendu(groupe);
    const bilan = s.mettreAJour(entrees, "r1:c1");
    expect(bilan.instancesConstruites).toBe(1);
    const instancies = groupe.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
    expect(instancies).toHaveLength(1);
    expect(instancies[0]!.count).toBe(5);
    // Mesure : cinq exemplaires portés par un seul objet de rendu (un appel de dessin), sa table compte cinq entrées.
    expect(groupe.children.filter((o) => o instanceof THREE.Mesh)).toHaveLength(2);
    poteaux.forEach((p) => expect(cliquer(groupe, p.x + 0.5, p.y + 0.5)).toBe(p.id));
    expect(cliquer(groupe, 1.5, 10.5)).toBe("large");
    expect(cliquer(groupe, 2.5, 0.5)).toBeNull();
  });

  it("objet supprimé du document : son exemplaire ne désigne jamais lui ; après mise à jour, les autres gardent leur identifiant", () => {
    const poteaux = [0, 4, 8, 12].map((x, i) => ({ id: `p${i}`, x, y: 0 }));
    const { entrees } = scene(poteaux);
    const groupe = new THREE.Group();
    const s = new SceneRendu(groupe);
    s.mettreAJour(entrees, "r1:c1");
    // Maillage affiché encore antérieur au document : p2 supprimé n'est plus désignable.
    expect(cliquer(groupe, 8.5, 0.5, (id) => id !== "p2")).toBeNull();
    const b = s.mettreAJour(entrees.filter((e) => e.id !== "p2"), "r2:c2");
    expect(b.instancesConstruites).toBe(1);
    expect(cliquer(groupe, 8.5, 0.5)).toBeNull();
    expect(cliquer(groupe, 12.5, 0.5)).toBe("p3");
    // Sous le seuil, retour aux lots fusionnés : la table triangle → objet reste juste.
    s.mettreAJour(entrees.filter((e) => e.id === "p0" || e.id === "p1"), "r3:c3");
    expect(groupe.children.some((o) => o instanceof THREE.InstancedMesh)).toBe(false);
    expect(cliquer(groupe, 4.5, 0.5)).toBe("p1");
    expect(SEUIL_INSTANCIATION).toBe(3);
  });
});
