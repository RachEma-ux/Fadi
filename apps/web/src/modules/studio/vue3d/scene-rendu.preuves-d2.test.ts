/**
 * Preuves du groupe D2 (point 2 du rapprochement Studio) — INV-008 : un cache, un index ou une projection est
 * reconstruisible depuis la donnée de référence. Cas prescrits (fiche M004 INV-008) :
 * - [+] détruire le cache de la scène et l'index puis reconstruire depuis le modèle, et vérifier la table
 *   triangle → objectId ;
 * - [−] lot de plusieurs objets ou objet supprimé : aucun triangle sélectionnable avec un identifiant obsolète.
 *
 * Chemin de la vue 3D (`Vue3DStudio.tsx`) rejoué sans DOM : plan relatif au cache (`projectionsAInvalider`), maillage
 * des seuls objets invalidés, fusion, assemblage, puis scène incrémentale (`SceneRendu`) dont chaque lot porte sa table
 * de désignation (`tablePicking`).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyStudioCommands, newStudioDocument, projectionsAInvalider, studioAssemblerMaillage, studioFusionnerMorceaux, studioMaillerObjets, studioMesh3d, validateStudioDocument,
  type StudioCacheMaillage, type StudioCommand, type StudioDocument, type StudioMesh3d, type StudioOpening, type StudioWall,
} from "@parcours/atelier-model";
import { SceneRendu, type DonneesLot, type EntreeRendu } from "./scene-rendu";

const ASPECT = { couleur: 0xd8d2c4, mode: "shaded-edges" as const, apparence: false, double: false };
const mur = (i: number, over: Partial<StudioWall> = {}): StudioWall => ({ id: `m${i}`, type: "wall", axis: [{ x: 0, y: i * 2 }, { x: 6, y: i * 2 }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over });
const ouverture = (id: string, hostId: string, position: number): StudioOpening => ({ id, type: "opening", hostId, position, width: 1, height: 2.1, sill: 0 });

/** Entrées comme la vue 3D : tous les murs et ouvertures en lots (désignés par la table triangle → objectId). */
function entrees(mesh: StudioMesh3d, cle: (id: string) => string): EntreeRendu[] {
  return (mesh.architecture ?? []).map((a): EntreeRendu => ({ id: a.id, signature: cle(a.id), lot: a.type, geometrie: a, aspect: ASPECT }));
}
function etape(cache: StudioCacheMaillage | null, doc: StudioDocument) {
  const invalidation = projectionsAInvalider(cache?.doc ?? null, doc);
  const morceaux = studioMaillerObjets(doc, invalidation.complet ? null : invalidation.ids);
  const suivant = studioFusionnerMorceaux(cache, doc, invalidation, morceaux);
  return { invalidation, cache: suivant, mesh: studioAssemblerMaillage(doc, suivant.morceaux) };
}
/** Tables de désignation de la scène, par lot (nom), sous forme comparable : pour chaque triangle, l'objet désigné. */
function tables(groupe: THREE.Group): Record<string, (string | null)[]> {
  const out: Record<string, (string | null)[]> = {};
  for (const o of groupe.children) {
    const lot = o.userData.lot as DonneesLot | undefined;
    if (!lot) continue;
    out[o.name] = Array.from({ length: lot.table.triangles }, (_, t) => lot.table.resoudre(t));
  }
  return out;
}
const idsDe = (doc: StudioDocument) => new Set((doc.architecture ?? []).map((a) => a.id));

function documents(): StudioDocument[] {
  const architecture: (StudioWall | StudioOpening)[] = [];
  for (let i = 0; i < 12; i++) architecture.push(mur(i), ouverture(`m${i}-a`, `m${i}`, 1));
  const d0 = validateStudioDocument({ ...newStudioDocument("inv-008"), objects: [], architecture });
  // Lot de plusieurs objets en une révision : deux murs modifiés, un mur supprimé avec son ouverture, une ouverture élargie.
  const lot: StudioCommand[] = [
    { toolId: "studio.architecture.modifier", params: mur(3, { height: 3.4 }) } as StudioCommand,
    { toolId: "studio.architecture.modifier", params: mur(7, { thickness: 0.25 }) } as StudioCommand,
    { toolId: "studio.architecture.supprimer", params: { ids: ["m5"], cascade: true } } as StudioCommand,
    { toolId: "studio.architecture.modifier", params: { ...ouverture("m9-a", "m9", 1), width: 1.4 } } as StudioCommand,
  ];
  const d1 = applyStudioCommands(d0, lot);
  const d2 = applyStudioCommands(d1, [{ toolId: "studio.architecture.supprimer", params: { ids: ["m10-a"], cascade: false } } as StudioCommand]);
  return [d0, d1, d2];
}

describe("INV-008 — un cache, un index ou une projection est reconstruisible depuis la donnée de référence (preuves D2)", () => {
  it("INV-008 [+] cache de maillage et scène (index de désignation) détruits puis reconstruits depuis le document : même maillage, même table triangle → objectId", () => {
    const docs = documents();
    // Session ordinaire : cache et scène tenus d'une révision à l'autre.
    const groupe = new THREE.Group();
    const scene = new SceneRendu(groupe, 4);
    let cache: StudioCacheMaillage | null = null;
    let v = 0;
    for (const d of docs) {
      const e = etape(cache, d);
      cache = e.cache;
      scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), String(++v));
    }
    const doc = docs.at(-1)!;
    const avant = tables(groupe);
    expect(Object.keys(avant).length).toBeGreaterThan(1);
    expect(cache).not.toBeNull();
    // Destruction : cache de maillage et scène (lots et tables de désignation) jetés.
    scene.vider();
    expect(groupe.children).toHaveLength(0);
    cache = null;
    // Reconstruction depuis la seule donnée de référence (le document).
    const reconstruit = etape(cache, doc);
    expect(reconstruit.invalidation).toMatchObject({ complet: true, raison: "premier" });
    expect(reconstruit.mesh).toEqual(studioMesh3d(doc));
    const groupe2 = new THREE.Group();
    const scene2 = new SceneRendu(groupe2, 4);
    scene2.mettreAJour(entrees(reconstruit.mesh, (id) => reconstruit.cache.morceaux.get(id)!.cle), "reconstruit");
    const apres = tables(groupe2);
    // Table triangle → objectId : identique à celle de la session, triangle pour triangle, et chaque objet du document y a sa plage.
    expect(apres).toEqual(avant);
    const designes = new Set(Object.values(apres).flat());
    expect(designes).toEqual(idsDe(doc));
    for (const o of groupe2.children) {
      const lot = o.userData.lot as DonneesLot | undefined;
      if (!lot) continue;
      for (const id of lot.table.ids) {
        const plage = lot.table.plage(id)!;
        const m = reconstruit.mesh.architecture!.find((a) => a.id === id)!;
        // La plage d'un objet couvre exactement ses triangles dans le maillage reconstruit.
        expect(plage[1] - plage[0]).toBe(m.triangles.length);
        expect(lot.table.resoudre(plage[0])).toBe(id);
        expect(lot.table.resoudre(plage[1] - 1)).toBe(id);
      }
    }
    scene2.vider();
  });

  it("INV-008 [−] lot de plusieurs objets puis objet supprimé : aucun triangle de la scène ne désigne un identifiant obsolète", () => {
    const docs = documents();
    const groupe = new THREE.Group();
    const scene = new SceneRendu(groupe, 4);
    let cache: StudioCacheMaillage | null = null;
    let v = 0;
    const supprimes = ["m5", "m5-a", "m10-a"];
    for (const [i, d] of docs.entries()) {
      const e = etape(cache, d);
      cache = e.cache;
      scene.mettreAJour(entrees(e.mesh, (id) => e.cache.morceaux.get(id)!.cle), String(++v));
      const presents = idsDe(d);
      const designes = Object.values(tables(groupe)).flat();
      // Chaque triangle désigne un objet du document courant ; aucun n'est hors table.
      expect(designes.every((id) => id !== null && presents.has(id))).toBe(true);
      expect(new Set(designes)).toEqual(presents);
      if (i > 0) {
        for (const id of supprimes.slice(0, i === 1 ? 2 : 3)) {
          expect(designes).not.toContain(id);
          for (const o of groupe.children) expect((o.userData.lot as DonneesLot | undefined)?.table.plage(id) ?? null).toBeNull();
        }
      }
    }
    scene.vider();
  });
});
