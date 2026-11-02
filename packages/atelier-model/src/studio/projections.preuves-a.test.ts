import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioMesh3d } from "./mesh-3d.js";
import {
  projectionsAInvalider, studioAssemblerMaillage, studioFusionnerMorceaux, studioMaillerObjets, studioMesh3dIncremental,
  type StudioCacheMaillage, type StudioInvalidation, type StudioMorceauMaillage,
} from "./projections.js";

/**
 * EX-011 — actualisation : les projections consomment les effets pour régénérer la portée minimale correcte ; une
 * actualisation partielle erronée n'est jamais acceptée au nom des performances. Oracle « incrémental = complet » :
 * le cache obtenu par une invalidation (règle de `projectionsAInvalider`, ou règle fautive injectée) est comparé,
 * morceau par morceau, à la reconstruction complète du même document. Mur 6 × 3 × 0,2 m et porte 1 × 2,1 m (cas
 * d'essai géométrique de REF-02 §4.5, pas une méthode de métré).
 */
const avec = (d: StudioDocument, ...c: unknown[]) => applyStudioCommands(d, c as StudioCommand[]);
const mur = { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" };
const porte = { id: "p1", type: "opening", hostId: "m1", position: 1, width: 1, height: 2.1, sill: 0 };
const depart = () => avec(newStudioDocument("ex011"),
  { toolId: "studio.architecture.mur", params: mur }, { toolId: "studio.architecture.ouverture", params: porte },
  { toolId: "studio.architecture.mur", params: { ...mur, id: "m2", axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }] } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 9 }, end: { x: 4, y: 9 } } });
/** La porte est déplacée de 1 m à 3,5 m le long de son mur hôte. */
const deplacee = (d: StudioDocument) => avec(d, { toolId: "studio.architecture.modifier", params: { ...porte, position: 3.5 } });

type Invalider = (avant: StudioDocument | null, apres: StudioDocument) => StudioInvalidation;
/** Règle fautive injectée : l'invalidation du mur hôte d'une ouverture modifiée est omise. */
const sansMurHote: Invalider = (avant, apres) => {
  const r = projectionsAInvalider(avant, apres);
  return { ...r, ids: r.ids.filter((id) => id !== "m1") };
};
/** Actualisation incrémentale avec la règle donnée : seuls les morceaux invalidés sont remaillés. */
function actualiser(cache: StudioCacheMaillage | null, doc: StudioDocument, invalider: Invalider): StudioCacheMaillage {
  const inv = invalider(cache?.doc ?? null, doc);
  return studioFusionnerMorceaux(cache, doc, inv, studioMaillerObjets(doc, inv.complet ? null : inv.ids));
}
/** Oracle : les morceaux gardés en cache sont exactement ceux d'une reconstruction complète (écarts nommés). */
function oracle(cache: StudioCacheMaillage, doc: StudioDocument): string[] {
  const complet = new Map(studioMaillerObjets(doc, null).map((m) => [m.id, m]));
  const ids = new Set([...complet.keys(), ...cache.morceaux.keys()]);
  return [...ids].filter((id) => JSON.stringify(cache.morceaux.get(id)) !== JSON.stringify(complet.get(id))).sort();
}
/** Assemblage naïf (cache cru sans contrôle de clé) : ce que produirait l'optimisation fautive si on la laissait passer. */
function assemblageNaif(doc: StudioDocument, morceaux: ReadonlyMap<string, StudioMorceauMaillage>) {
  return (doc.architecture ?? []).map((a) => morceaux.get(a.id)?.architecture ?? null);
}

describe("EX-011 — actualisation incrémentale vérifiée par l'oracle « incrémental = complet »", () => {
  it("EX-011 [+] porte déplacée : portée minimale (porte et mur hôte seulement), scène incrémentale identique à la reconstruction complète", () => {
    const d0 = depart(), d1 = deplacee(d0);
    const inv = projectionsAInvalider(d0, d1);
    expect(inv).toEqual({ ids: ["m1", "p1"], complet: false, raison: null });
    const cache = actualiser(actualiser(null, d0, projectionsAInvalider), d1, projectionsAInvalider);
    expect(oracle(cache, d1)).toEqual([]);
    const r = studioMesh3dIncremental(d1, studioMesh3dIncremental(d0, null).cache);
    expect(r.remailles).toEqual(["m1", "p1"]);
    expect(r.mesh).toEqual(studioMesh3d(d1));
  });
  it("EX-011 [+] repli conservateur : une reconstruction complète (premier calcul) donne le même résultat", () => {
    const d1 = deplacee(depart());
    expect(studioMesh3dIncremental(d1, null)).toMatchObject({ invalidation: { complet: true, raison: "premier" } });
    expect(studioMesh3dIncremental(d1, null).mesh).toEqual(studioMesh3d(d1));
  });
  it("EX-011 [−] invalidation du mur hôte omise : l'oracle révèle l'incohérence (mur m1 périmé) et l'optimisation fautive est rejetée", () => {
    const d0 = depart(), d1 = deplacee(d0);
    const fautif = actualiser(actualiser(null, d0, sansMurHote), d1, sansMurHote);
    // L'oracle nomme exactement le morceau périmé : le mur hôte, dont le vide est resté à l'ancienne position.
    expect(oracle(fautif, d1)).toEqual(["m1"]);
    // Crue telle quelle, cette actualisation partielle donnerait une scène fausse (mur m1 de l'ancien document).
    const naif = assemblageNaif(d1, fautif.morceaux);
    const juste = studioMesh3d(d1).architecture ?? [];
    expect(naif).not.toEqual(juste);
    expect(naif[0]).toEqual(studioMesh3d(d0).architecture?.[0]);
    // Le chemin de production ne l'accepte jamais : la clé du morceau périmé ne correspond plus, il est remaillé.
    expect(studioAssemblerMaillage(d1, fautif.morceaux)).toEqual(studioMesh3d(d1));
    // Témoin : la même règle fautive est inoffensive quand le mur hôte n'est pas concerné (ligne déplacée).
    const d2 = avec(d0, { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } });
    expect(oracle(actualiser(actualiser(null, d0, sansMurHote), d2, sansMurHote), d2)).toEqual([]);
  });
});
