import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { controlerManifesteOutils, entreeManifeste, STUDIO_MANIFESTE_OUTILS, type StudioEntreeManifeste } from "./manifeste-outils.js";
import { studioMesh3d } from "./mesh-3d.js";
import { studioMesh3dIncremental } from "./projections.js";
import { STUDIO_TOOLS } from "./registry.js";
import { couperStudio, studioLienSolide, studioProfilDepuisPolyligne, studioQuantitesSolides } from "./solides-libres.js";

/**
 * Preuves du groupe B (modèle pur) :
 * - TR-EX-022 (cas négatif) : éditer un segment d'une coupe dérivée, ou une cote associée sans commande dédiée, ne
 *   modifie pas le volume : la coupe est une donnée dérivée (la modifier ne touche ni le document ni le volume, la
 *   recouper rend l'original) ; une cote liée au profil source d'un prisme lié se modifie (décalage) sans toucher ni la
 *   polyligne ni le prisme, et le déplacement d'un point mesuré par la cote est refusé (seule la commande de la cible
 *   modifie la cible) ;
 * - AC-005 (partie modèle) : poussé / tiré des faces et changement de matériau — maillage incrémental identique au
 *   maillage complet à chaque pas, volumes relus ;
 * - TR-EX-023 (partie unités) : un document en pixels ou en repère d'écran est refusé explicitement ;
 * - TR-EX-027 (cas négatif) : deux entrées de même `toolId` aux libellés distincts sont rejetées par la validation,
 *   sans écrasement : le manifeste soumis et le dictionnaire du manifeste gardent chacun leur contenu.
 */

const appliquer = (d: StudioDocument, ...cs: unknown[]) => applyStudioCommands(d, cs as StudioCommand[]);
const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};

/** Polyligne fermée 4 × 3, prisme de 3 m en référence liée sur son profil, cote liée à deux sommets de la polyligne. */
function etude(): StudioDocument {
  const d = appliquer(newStudioDocument("b-022"), { toolId: "studio.dessin.polyligne", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], closed: true } });
  const p = studioProfilDepuisPolyligne(d.objects[0])!;
  return appliquer(d,
    { toolId: "studio.solide.prisme", params: { id: "S", type: "prism", placement: { origin: { ...p.origin, z: 0 }, rotation: 0 }, profile: p.profile, height: 3, direction: { x: 0, y: 0, z: 1 }, source: { objectId: "P", relation: "reference-liee" } } },
    { toolId: "studio.dessin.cote", params: { id: "k", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: -0.5, links: { start: { objectId: "P", anchor: "vertex-0" }, end: { objectId: "P", anchor: "vertex-1" } }, toResolve: false } },
  );
}

describe("TR-EX-022 (cas négatif) — coupe dérivée et cote associée ne propagent rien au volume", () => {
  it("segments d'une coupe modifiés : document, prisme et volume inchangés ; recouper rend la coupe d'origine", () => {
    const d = etude();
    const avant = JSON.stringify(d);
    const volume = studioQuantitesSolides(d).items[0]!.volume;
    expect(volume).toBe(36);
    const coupe = couperStudio(d, { z: 1.5 });
    expect(coupe.segments.length).toBe(4);
    const reference = JSON.stringify(coupe);
    // « Éditer » un segment de la coupe : la donnée dérivée change, rien d'autre.
    const s0 = coupe.segments[0] as unknown as Record<string, { x: number; y: number }>;
    for (const v of Object.values(s0)) if (v && typeof v === "object" && "x" in v) v.x += 10;
    expect(JSON.stringify(coupe)).not.toBe(reference);
    expect(JSON.stringify(d)).toBe(avant);
    expect(studioQuantitesSolides(d).items[0]!.volume).toBe(volume);
    expect(JSON.stringify(couperStudio(d, { z: 1.5 }))).toBe(reference);
    // Aucune commande ne vise un segment de coupe : son identifiant de provenance n'est pas un objet du document.
    expect(refus(() => appliquer(d, { toolId: "studio.dessin.supprimer", params: { ids: ["coupe-1"] } }))).toMatch(/coupe-1/);
  });

  it("cote liée au profil source : décalage modifié sans toucher polyligne ni prisme ; point mesuré déplacé refusé ; volume inchangé", () => {
    const d = etude();
    const poly = JSON.stringify(d.objects), solides = JSON.stringify(d.solides);
    const cote = d.dimensions!.find((x) => x.id === "k")!;
    const decalee = appliquer(d, { toolId: "studio.dessin.modifier", params: { ...cote, offset: -1.5 } });
    expect(decalee.dimensions!.find((x) => x.id === "k")!.offset).toBe(-1.5);
    expect(JSON.stringify(decalee.objects)).toBe(poly);
    expect(JSON.stringify(decalee.solides)).toBe(solides);
    expect(studioQuantitesSolides(decalee).items[0]!.volume).toBe(36);
    expect(studioLienSolide(decalee, decalee.solides![0]!)!.etat).toBe("a-jour");
    // Tirer l'extrémité de la cote à 5 m sans commande sur la cible : refusé, rien ne bouge.
    refus(() => appliquer(d, { toolId: "studio.dessin.modifier", params: { ...cote, end: { x: 5, y: 0 } } }));
    refus(() => appliquer(d, { toolId: "studio.dessin.deplacer", params: { id: "k", dx: 1, dy: 0 } }));
    // Seule la commande dédiée de la cible (polyligne) change le profil, et le prisme lié suit.
    const cible = appliquer(d, { toolId: "studio.dessin.modifier", params: { id: "P", type: "polyline", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 3 }, { x: 0, y: 3 }], closed: true } });
    expect(studioQuantitesSolides(cible).items[0]!.volume).toBe(45);
    // La cote ne se recale pas en silence : le lien du sommet changé est détaché et la cote passe « à résoudre ».
    expect(cible.dimensions!.find((x) => x.id === "k")).toMatchObject({ end: { x: 4, y: 0 }, links: { end: null }, toResolve: true });
  });
});

describe("AC-005 — poussé / tiré et changement de matériau : fidélité géométrique avant et après l'optimisation (maillage incrémental)", () => {
  it("boîte et prisme poussés / tirés, pivotés, apparence posée puis changée : maillage incrémental = maillage complet à chaque pas, volumes relus", () => {
    const pas: unknown[] = [
      { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 } },
      { toolId: "studio.solide.prisme", params: { id: "p1", type: "prism", placement: { origin: { x: 10, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], height: 2 } },
      { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: 1 } },
      { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "base", distance: 0.5 } },
      { toolId: "studio.solide.face-decaler", params: { id: "p1", face: "sommet", distance: -0.5 } },
      { toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "b1" }, color: "#c0392b", finish: "satin" } },
      { toolId: "studio.apparence.definir", params: { id: "ap1", type: "appearance", target: { kind: "object", id: "b1" }, color: "#2e86c1", finish: "glass" } },
      { toolId: "studio.solide.pivoter", params: { id: "p1", angle: 0.5 } },
    ];
    let d = newStudioDocument("ac-005");
    let cache = null as Parameters<typeof studioMesh3dIncremental>[1];
    const volumes: (number | null)[] = [];
    for (const p of pas) {
      const avant = studioMesh3d(d);
      d = appliquer(d, p);
      const r = studioMesh3dIncremental(d, cache);
      expect(r.mesh, JSON.stringify(p)).toEqual(studioMesh3d(d));
      cache = r.cache;
      volumes.push(studioQuantitesSolides(d).totalVolume);
      // Le pas a réellement changé la projection, sauf le changement de matériau, qui ne touche pas la géométrie.
      const geometrie = (m: ReturnType<typeof studioMesh3d>) => JSON.stringify((m.freeSolids ?? []).map((s) => [s.id, s.vertices]));
      if ((p as { toolId: string }).toolId === "studio.apparence.definir") expect(geometrie(r.mesh)).toBe(geometrie(avant));
    }
    // Boîte 2 × 1 × 3 → sommet tiré de 1 (4) → base tirée de 0,5 vers le bas (4,5) ; prisme 2 × 2 × 2 → sommet poussé de 0,5
    // (1,5) : volumes relus, pas devinés.
    expect(volumes.at(-1)).toBeCloseTo(2 * 1 * 4.5 + 2 * 2 * 1.5, 12);
  });
});

describe("TR-EX-023 (cas négatif, partie unités) — une entrée en pixels n'est jamais lue comme des mètres", () => {
  it("document déclaré en pixels (ou repère d'écran) : refus explicite, aucune conversion implicite", () => {
    const d = newStudioDocument("px");
    expect(refus(() => validateStudioDocument({ ...d, units: "px" }))).toContain("unité m attendue");
    expect(refus(() => validateStudioDocument({ ...d, units: "pixel" }))).toContain("unité m attendue");
    expect(refus(() => validateStudioDocument({ ...d, frame: "screen" }))).toContain("repère local-2d attendu");
    expect(validateStudioDocument(d).units).toBe("m");
  });
});

describe("TR-EX-027 (cas négatif) — toolId en double, libellés distincts : rejet sans écrasement", () => {
  it("deux descripteurs de même toolId (« Ligne » et « Trait ») : « outil cité 2 fois », manifeste soumis et dictionnaire intacts", () => {
    const ligne = STUDIO_TOOLS.find((t) => t.toolId === "studio.dessin.ligne")!;
    const doublon = { ...ligne, libelleFR: "Trait" };
    expect(doublon.libelleFR).not.toBe(ligne.libelleFR);
    // Le second descripteur produit une seconde entrée de même toolId, au contrat différent (propriétaire changé).
    const premiere = entreeManifeste("studio.dessin.ligne")!;
    const seconde: StudioEntreeManifeste = { ...premiere, proprietaire: { id: "studio.autre", module: "ailleurs" }, contextes: ["vue-3d"], chargeur: "vue-3d" };
    const soumis = { version: STUDIO_MANIFESTE_OUTILS.version, entrees: [...STUDIO_MANIFESTE_OUTILS.entrees, seconde] };
    const copie = JSON.stringify(soumis);
    const pbs = controlerManifesteOutils(soumis);
    expect(pbs).toContain("outil cité 2 fois : studio.dessin.ligne");
    // Aucune des deux entrées n'a écrasé l'autre : le manifeste soumis est inchangé, le dictionnaire garde l'original.
    expect(JSON.stringify(soumis)).toBe(copie);
    expect(soumis.entrees.filter((e) => e.toolId === "studio.dessin.ligne").map((e) => e.proprietaire.id)).toEqual([premiere.proprietaire.id, "studio.autre"]);
    expect(entreeManifeste("studio.dessin.ligne")).toBe(premiere);
    expect(entreeManifeste("studio.dessin.ligne")!.contextes).toEqual(["planche-2d"]);
    expect(STUDIO_TOOLS.find((t) => t.toolId === "studio.dessin.ligne")!.libelleFR).toBe(ligne.libelleFR);
    // Le registre réel n'a aucun doublon d'identifiant, même à libellé égal.
    expect(new Set(STUDIO_TOOLS.map((t) => t.toolId)).size).toBe(STUDIO_TOOLS.length);
  });
});
