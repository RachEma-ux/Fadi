import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { exportStudioIfc } from "./ifc.js";
import { studioMesh3d } from "./mesh-3d.js";
import { createStudioHistory, recordStudioHistory, redoStudioHistory, undoStudioHistory } from "./history.js";
import { studioAssemblerMaillage, studioMaillerObjets, projectionsAInvalider } from "./projections.js";
import { studioRapportFidelite } from "./echanges/rapport-fidelite.js";
import { couperStudio, studioQuantitesSolides, type StudioBox, type StudioProfilePrism } from "./solides-libres.js";
import {
  studioApercuBooleen, studioCaptureBooleen, studioCommandeBooleen, studioComparerApercu, studioVerifierEngagement, STUDIO_TOLERANCE_APERCU,
} from "./booleens-exacts.js";
import { studioMaillageExact, studioOperandeNoyau, validerSolideExact, type StudioSolideExactBooleen } from "./objets-3d/exacts.js";
import { exactSynthetique, resultatSynthetique } from "./exacts.fixtures.js";

/**
 * Lot F2 — noyau exact dans Studio, la part du modèle (pure) : solide exact (résultat du noyau, opérandes conservés,
 * R15), commande d'engagement explicite `studio.solide.booleen` (IF-003 ⑦), capture immuable (IF-003 ②), aperçu
 * provisoire jamais engagé et refusé au-delà de la tolérance (TR-EX-058), résultat périmé non engagé (TEST-014).
 * Les résultats sont SYNTHÉTIQUES ici (forme seulement) : le noyau réel est testé par `@parcours/geometry-exact` et l'API.
 */

const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};
const appliquer = (d: StudioDocument, ...cs: unknown[]) => applyStudioCommands(d, cs as StudioCommand[]);
const boite = (id: string, x: number, over: Partial<StudioBox> = {}): StudioBox => ({ id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2, ...over });
const deuxBoites = (over: Partial<StudioBox> = {}) => appliquer(newStudioDocument("f2"),
  { toolId: "studio.solide.boite", params: boite("A", 0) }, { toolId: "studio.solide.boite", params: boite("B", 1, over) });
const booleen = (operation = "union", operandes: unknown = ["A", "B"], resultat: unknown = resultatSynthetique(12), id = "E") =>
  ({ toolId: "studio.solide.booleen", params: { id, operation, operandes, resultat } });

describe("IF-003 / R15 — solide exact : commande d'engagement explicite, opérandes conservés", () => {
  it("le booléen retire les deux opérandes de `solides` et les conserve intacts dans le solide exact ; le résultat est celui fourni", () => {
    const d = deuxBoites();
    const [a, b] = d.solides!;
    const e = appliquer(d, booleen());
    expect(e.solides ?? []).toEqual([]);
    expect(e.exacts).toHaveLength(1);
    const x = e.exacts![0]! as StudioSolideExactBooleen;
    expect(x).toMatchObject({ id: "E", type: "exact", operation: "union" });
    expect(x.operandes).toEqual([a, b]);
    expect(x.resultat).toEqual(resultatSynthetique(12));
    // Forme canonique : relu par la validation à l'identique.
    expect(validateStudioDocument(e)).toEqual(e);
  });

  it("refus explicites : opérande absent, répété, oblique accepté par la commande mais résultat mal formé refusé, champ inconnu ; le lot entier est abandonné", () => {
    const d = deuxBoites();
    const avant = JSON.stringify(d);
    expect(refus(() => appliquer(d, booleen("union", ["A", "Z"])))).toBe("commands[0].params.operandes[1] : solide introuvable : Z");
    expect(refus(() => appliquer(d, booleen("union", ["A", "A"])))).toBe("commands[0].params.operandes : deux opérandes distincts attendus");
    expect(refus(() => appliquer(d, booleen("fusion")))).toMatch(/opération « union », « difference » ou « intersection » attendue/);
    expect(refus(() => appliquer(d, booleen("union", ["A", "B"], { ...resultatSynthetique(), brep: "pas du base64 !" })))).toMatch(/brep base64 attendu/);
    expect(refus(() => appliquer(d, booleen("union", ["A", "B"], { ...resultatSynthetique(), moteur: "autre" })))).toMatch(/moteur « occt-wasm » attendu/);
    expect(refus(() => appliquer(d, booleen("union", ["A", "B"], { ...resultatSynthetique(), empreinte: "XYZ" })))).toMatch(/empreinte de 16 caractères/);
    expect(refus(() => appliquer(d, booleen("union", ["A", "B"], { ...resultatSynthetique(), maillage: { positions: [0, 0, 0], indices: [0, 0, 1] } })))).toMatch(/indice de sommet attendu/);
    expect(refus(() => appliquer(d, booleen("union", ["A", "B"], { ...resultatSynthetique(), inconnu: 1 })))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => appliquer(d, booleen(), booleen("union", ["A", "B"], resultatSynthetique(), "E2")))).toBe("commands[1].params.operandes[0] : ce n’est pas un solide : A");
    expect(JSON.stringify(d)).toBe(avant);
  });

  it("calque verrouillé refusé ; le résultat prend le calque du premier opérande", () => {
    let d = appliquer(newStudioDocument("c"), { toolId: "studio.calque.creer", params: { id: "S", name: "Solides", visible: true, locked: false } },
      { toolId: "studio.solide.boite", params: { ...boite("A", 0), layerId: "S" } }, { toolId: "studio.solide.boite", params: boite("B", 1) });
    expect(appliquer(d, booleen()).exacts![0]!.layerId).toBe("S");
    d = appliquer(d, { toolId: "studio.calque.modifier", params: { id: "S", name: "Solides", visible: true, locked: true } });
    expect(refus(() => appliquer(d, booleen()))).toMatch(/calque verrouillé/);
  });

  it("identifiants des opérandes conservés réservés (aucune réutilisation) ; supprimer le solide exact les libère ; un solide exact peut être opérande", () => {
    const e = appliquer(deuxBoites(), booleen());
    expect(refus(() => appliquer(e, { toolId: "studio.solide.boite", params: boite("A", 5) }))).toMatch(/identifiant déjà utilisé/);
    expect(refus(() => appliquer(e, { toolId: "studio.solide.deplacer", params: { id: "E", dx: 1, dy: 0, dz: 0 } }))).toBe("commands[0] : ce n’est pas un solide libre : E");
    const chaine = appliquer(e, { toolId: "studio.solide.boite", params: boite("C", 4) }, booleen("difference", ["E", "C"], resultatSynthetique(3), "E2"));
    expect(chaine.exacts!.map((x) => x.id)).toEqual(["E2"]);
    expect((chaine.exacts![0]! as StudioSolideExactBooleen).operandes.map((o) => o.id)).toEqual(["E", "C"]);
    const vide = appliquer(chaine, { toolId: "studio.solide.supprimer", params: { ids: ["E2"] } });
    expect(vide.exacts ?? []).toEqual([]);
    expect(appliquer(vide, { toolId: "studio.solide.boite", params: boite("A", 5) }).solides!.map((s) => s.id)).toEqual(["A"]);
  });

  it("document : identifiant d'opérande en double refusé, profondeur bornée, champ inconnu refusé", () => {
    const e = appliquer(deuxBoites(), booleen());
    expect(refus(() => validateStudioDocument({ ...e, solides: [boite("A", 9)] }))).toBe("studioDocument.exacts : identifiant dupliqué");
    expect(refus(() => validateStudioDocument({ ...e, exacts: [{ ...e.exacts![0]!, couleur: "rouge" }] }))).toMatch(/champs absents ou inconnus/);
    let x = exactSynthetique("n0", [boite("a0", 0), boite("b0", 1)]);
    for (let i = 1; i <= 8; i++) x = exactSynthetique(`n${i}`, [x, boite(`b${i}`, 1)]);
    expect(refus(() => validerSolideExact(x, "x"))).toMatch(/8 niveaux au plus/);
  });

  it("coupe horizontale : le solide exact est coupé par son maillage (provenance), jamais omis ; face dans le plan : comptée non dérivée", () => {
    const e = appliquer(deuxBoites(), booleen());
    // Maillage synthétique : tétraèdre unité. À z = 0,5 : trois côtés du triangle (0,5 ; 0,5) traversés.
    const c = couperStudio(e, { z: 0.5 });
    expect(c.sources).toEqual([{ id: "E", segments: 3 }]);
    expect(c.segments.every((g) => g.source === "E")).toBe(true);
    const xs = c.segments.flatMap((g) => [g.start.x + g.start.y, g.end.x + g.end.y]);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 12);
    expect(c.exactsNonCoupes).toEqual([]);
    // À z = 0 la base est dans le plan : section non dérivée, nommée.
    const base = couperStudio(e, { z: 0 });
    expect(base.exactsNonCoupes).toEqual(["E"]);
    expect(base.sources).toEqual([]);
    // Hors du solide : rien, sans signalement.
    expect(couperStudio(e, { z: 2 })).toMatchObject({ segments: [], sources: [], exactsNonCoupes: [] });
  });

  it("annuler / rétablir : le booléen se défait (opérandes rendus) et se rejoue, comme toute commande", () => {
    const d = deuxBoites();
    const e = appliquer(d, booleen());
    let h = recordStudioHistory(createStudioHistory(d), e);
    h = undoStudioHistory(h);
    expect(h.present).toEqual(d);
    h = redoStudioHistory(h);
    expect(h.present).toEqual(e);
  });
});

describe("Solide exact : maillage d'affichage, quantités, échanges (sans noyau)", () => {
  it("vue 3D : maillage du noyau conservé dans le document, arêtes vives dérivées ; assemblage par morceaux identique à studioMesh3d", () => {
    const e = appliquer(deuxBoites(), booleen());
    const m = studioMesh3d(e);
    expect(m.freeSolids).toBeUndefined();
    expect(m.exacts).toHaveLength(1);
    expect(m.exacts![0]!.vertices).toHaveLength(12);
    expect(m.exacts![0]!.triangles).toHaveLength(4);
    // Tétraèdre : 6 arêtes, toutes vives.
    expect(m.exacts![0]!.edges).toHaveLength(6);
    expect(m.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } });
    const morceaux = new Map(studioMaillerObjets(e, null).map((x) => [x.id, x]));
    expect(studioAssemblerMaillage(e, morceaux)).toEqual(m);
    expect(projectionsAInvalider(deuxBoites(), e).ids).toEqual(["A", "B", "E"]);
  });

  it("quantités : volume du noyau (jamais estimé), emprise non évaluée ; IFC : compté « non exporté » ; rapport de fidélité : non couvert, jamais omis", () => {
    const e = appliquer(deuxBoites(), booleen());
    const q = studioQuantitesSolides(e);
    expect(q.items).toEqual([{ id: "E", type: "exact", footprint: null, volume: 12 }]);
    expect(q.totalVolume).toBe(12);
    expect(exportStudioIfc(e, { studyName: "E", variantName: "V", timestamp: "2026-10-25T00:00:00Z" })).toContain("'ExactSolidsNotExported'");
    for (const f of ["svg", "dxf", "ifc"] as const) {
      const l = studioRapportFidelite(e, f).lignes.find((x) => x.categorie === "exacts")!;
      expect(l).toMatchObject({ type: "exact", statut: "non-couvert", nombre: 1, ids: ["E"] });
    }
  });

  it("maillage exact : un sommet partagé par des faces coplanaires ne donne pas d'arête (seuil d'angle dièdre)", () => {
    // Carré plat en deux triangles (sommets dupliqués) : seule la diagonale est intérieure, donc non dessinée.
    const r = { ...resultatSynthetique(), maillage: { positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0], indices: [0, 1, 2, 3, 4, 5] } };
    const m = studioMaillageExact({ ...exactSynthetique("q", [boite("a", 0), boite("b", 1)]), resultat: r });
    expect(m.edges).toHaveLength(4);
  });
});

describe("IF-003 ② — capture immuable des entrées du noyau", () => {
  it("boîte et prisme droits : extrusion de l'emprise placée (repère local-3d) entre leurs cotes ; solide exact : son brep", () => {
    const d = appliquer(newStudioDocument("c"),
      { toolId: "studio.solide.boite", params: boite("A", 1, { placement: { origin: { x: 1, y: 2, z: 0.5 }, rotation: Math.PI / 2 }, width: 2, depth: 1, height: 3 }) },
      { toolId: "studio.solide.prisme", params: { id: "P", type: "prism", placement: { origin: { x: 0, y: 0, z: 2 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 1, direction: { x: 0, y: 0, z: -1 } } satisfies StudioProfilePrism });
    const c = studioCaptureBooleen(d, { operation: "difference", operandes: ["A", "P"] });
    if (!c.ok) throw new Error(c.message);
    expect(c.capture.entrees.op).toBe("soustraction");
    const a = c.capture.entrees.a as { extrusion: { profil: { x: number; y: number }[]; z0: number; hauteur: number } };
    expect(a.extrusion.z0).toBe(0.5);
    expect(a.extrusion.hauteur).toBe(3);
    expect(a.extrusion.profil.map((p) => [Math.round(p.x * 1e9) / 1e9, Math.round(p.y * 1e9) / 1e9])).toEqual([[1, 2], [1, 4], [0, 4], [0, 2]]);
    expect(c.capture.entrees.b).toEqual({ extrusion: { profil: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], z0: 1, hauteur: 1 } });
    expect(Object.isFrozen(c.capture)).toBe(true);
    const e = appliquer(deuxBoites(), booleen());
    expect(studioOperandeNoyau(e.exacts![0]!)).toEqual({ brep: resultatSynthetique().brep });
  });

  it("refus explicites : opération non choisie, opérande manquant ou répété, prisme oblique, prisme lié à résoudre, calque verrouillé — rien n'est choisi d'office", () => {
    const d = deuxBoites();
    expect(studioCaptureBooleen(d, { operation: "", operandes: ["A", "B"] })).toEqual({ ok: false, message: "Choisissez l’opération : union, différence ou intersection." });
    expect(studioCaptureBooleen(d, { operation: "union", operandes: ["A"] })).toEqual({ ok: false, message: "Choisissez les deux solides (A et B)." });
    expect(studioCaptureBooleen(d, { operation: "union", operandes: ["A", "A"] })).toEqual({ ok: false, message: "Choisissez deux solides différents." });
    const oblique = appliquer(d, { toolId: "studio.solide.prisme", params: { id: "O", type: "prism", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 1, direction: { x: 1, y: 0, z: 1 } } });
    const r = studioCaptureBooleen(oblique, { operation: "union", operandes: ["A", "O"] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/prisme oblique/);
    const lie = appliquer(newStudioDocument("l"), { toolId: "studio.dessin.polyligne", params: { id: "PL", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], closed: true } },
      { toolId: "studio.solide.prisme", params: { id: "S", type: "prism", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], height: 1, direction: { x: 0, y: 0, z: 1 }, source: { objectId: "PL", relation: "associe" } } },
      { toolId: "studio.solide.boite", params: boite("B", 1) });
    const modifie = appliquer(lie, { toolId: "studio.dessin.modifier", params: { id: "PL", type: "polyline", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }], closed: true } });
    const rl = studioCaptureBooleen(modifie, { operation: "union", operandes: ["S", "B"] });
    expect(!rl.ok && rl.message).toMatch(/« à résoudre »/);
    expect(refus(() => appliquer(modifie, booleen("union", ["S", "B"])))).toMatch(/« à résoudre »/);
    // À jour, le même prisme lié est un opérande accepté.
    expect(studioCaptureBooleen(lie, { operation: "union", operandes: ["S", "B"] }).ok).toBe(true);
  });
});

describe("TR-EX-058 — aperçu provisoire, jamais engagé ; refusé au-delà de la tolérance", () => {
  it("l'aperçu est marqué provisoire et estimé par les emprises : exact pour des boîtes non tournées (union 8 + 8 − 4 = 12 m³)", () => {
    const d = deuxBoites();
    const c = studioCaptureBooleen(d, { operation: "union", operandes: ["A", "B"] });
    if (!c.ok) throw new Error(c.message);
    expect(c.capture.apercu).toEqual({ nature: "provisoire", methode: "emprises-englobantes", volume: 12, boite: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 2, z: 2 } } });
    const [a, b] = d.solides!;
    expect(studioApercuBooleen("intersection", a!, b!).volume).toBe(4);
    expect(studioApercuBooleen("difference", a!, b!).volume).toBe(4);
  });

  it("écart aperçu / exact dans la tolérance : conforme ; au-delà : aperçu refusé, écart et limite dits", () => {
    const apercu = { nature: "provisoire" as const, methode: "emprises-englobantes" as const, volume: 12, boite: null };
    expect(studioComparerApercu(apercu, { volume: 12 + 1e-12 })).toMatchObject({ conforme: true });
    const r = studioComparerApercu(apercu, { volume: 11.5 });
    expect(r.conforme).toBe(false);
    expect(r.ecart).toBeCloseTo(0.5, 12);
    expect(r.limite).toBeCloseTo(STUDIO_TOLERANCE_APERCU.absolue + STUDIO_TOLERANCE_APERCU.relative * 12, 15);
  });

  it("boîte tournée de 45° : l'emprise englobante surestime, l'aperçu sera refusé face au résultat exact", () => {
    const d = deuxBoites({ placement: { origin: { x: 1, y: 0, z: 0 }, rotation: Math.PI / 4 } });
    const c = studioCaptureBooleen(d, { operation: "intersection", operandes: ["A", "B"] });
    if (!c.ok) throw new Error(c.message);
    // Le vrai volume d'intersection est inférieur à l'estimation par emprises : refus attendu avec un résultat exact.
    expect(studioComparerApercu(c.capture.apercu, { volume: c.capture.apercu.volume * 0.8 }).conforme).toBe(false);
  });

  it("seul un résultat exact s'engage : la commande d'engagement ne porte jamais l'aperçu", () => {
    const c = studioCaptureBooleen(deuxBoites(), { operation: "union", operandes: ["A", "B"] });
    if (!c.ok) throw new Error(c.message);
    const cmd = studioCommandeBooleen(c.capture, "E", resultatSynthetique(12));
    expect(JSON.stringify(cmd)).not.toContain("provisoire");
    expect(cmd).toEqual(booleen());
    // Un « résultat » fabriqué depuis l'aperçu (sans brep ni empreinte) est refusé par le modèle.
    expect(refus(() => appliquer(deuxBoites(), { toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat: c.capture.apercu } }))).toMatch(/champs absents ou inconnus/);
  });
});

describe("TEST-014 — résultat d'une ancienne révision : périmé, non engagé", () => {
  it("opérandes inchangés : engageable ; opérande déplacé, supprimé ou remplacé depuis la capture : périmé ; lecture seule : refus de droits", () => {
    const d = deuxBoites();
    const c = studioCaptureBooleen(d, { operation: "union", operandes: ["A", "B"] });
    if (!c.ok) throw new Error(c.message);
    expect(studioVerifierEngagement(d, c.capture, true)).toEqual({ ok: true });
    // Un changement ailleurs dans le document ne périme pas le résultat (ses entrées n'ont pas changé).
    const ailleurs = appliquer(d, { toolId: "studio.solide.boite", params: boite("Z", 10) });
    expect(studioVerifierEngagement(ailleurs, c.capture, true)).toEqual({ ok: true });
    const deplace = appliquer(d, { toolId: "studio.solide.deplacer", params: { id: "B", dx: 0.5, dy: 0, dz: 0 } });
    expect(studioVerifierEngagement(deplace, c.capture, true)).toEqual({ ok: false, motif: "perime", message: "Résultat périmé : les solides ont changé depuis le calcul ; il n’est pas engagé." });
    const supprime = appliquer(d, { toolId: "studio.solide.supprimer", params: { ids: ["B"] } });
    expect(studioVerifierEngagement(supprime, c.capture, true)).toMatchObject({ ok: false, motif: "perime" });
    expect(studioVerifierEngagement(d, c.capture, false)).toMatchObject({ ok: false, motif: "droits" });
    // Le modèle courant n'a pas bougé : rien n'a été engagé.
    expect(deplace.exacts).toBeUndefined();
  });
});
