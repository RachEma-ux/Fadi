/**
 * X.1-01 (modèle) — contraintes géométriques 2D : chaque type résolu (parallélisme, perpendicularité, tangence,
 * coïncidence, horizontal / vertical, égalité de longueur, distance fixée), résolution déterministe, système
 * insatisfaisable ou sur-contraint refusé (jamais résolu en silence), état « à résoudre » quand la géométrie change.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, StudioValidationError, type StudioCommand, type StudioDocument, type StudioShape } from "../document-2d.js";
import { STUDIO_TOLERANCES_CONTRAINTES, studioEvaluerContrainte, type StudioContrainte } from "./contraintes.js";

const refus = (f: () => unknown): string => { try { f(); } catch (e) { if (e instanceof StudioValidationError) return e.message; throw e; } return ""; };

const L = (id: string, a: [number, number], b: [number, number]): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } } });
const C = (id: string, c: [number, number], r: number): StudioCommand => ({ toolId: "studio.dessin.cercle", params: { id, type: "circle", center: { x: c[0], y: c[1] }, radius: r } });
const poser = (...contraintes: StudioContrainte[]): StudioCommand => ({ toolId: "studio.contrainte.poser", params: { contraintes } });
const resoudre = (...ids: string[]): StudioCommand => ({ toolId: "studio.contrainte.poser", params: { resoudre: ids } });

function base(): StudioDocument {
  return applyStudioCommands(newStudioDocument("k"), [
    L("a", [0, 0], [4, 0.3]), L("b", [0, 2], [3, 2.6]), L("v", [6, 0], [6.2, 3]),
    C("c", [2, 5], 1), C("d", [5.5, 5.2], 1.2),
    { toolId: "studio.dessin.polyligne", params: { id: "p", type: "polyline", points: [{ x: 10, y: 0 }, { x: 13, y: 0.4 }, { x: 13.2, y: 3 }], closed: false } },
  ]);
}
const formes = (d: StudioDocument) => new Map(d.objects.map((o) => [o.id, o]));
const ligne = (d: StudioDocument, id: string) => d.objects.find((o) => o.id === id) as Extract<StudioShape, { type: "line" }>;
const satisfaites = (d: StudioDocument) => (d.contraintes ?? []).map((c) => [c.id, studioEvaluerContrainte(c, formes(d)).statut]);

describe("X.1-01 — contraintes géométriques 2D (studio-document/1)", () => {
  it("X.1-01 contraintes : chaque type est résolu — horizontal, vertical, parallélisme, perpendicularité, tangence, coïncidence, égalité de longueur, distance fixée", () => {
    const d = applyStudioCommands(base(), [poser(
      { id: "h", type: "horizontal", cibles: [{ objet: "a" }] },
      { id: "ve", type: "vertical", cibles: [{ objet: "v" }] },
      { id: "pa", type: "parallele", cibles: [{ objet: "a" }, { objet: "b" }] },
      { id: "pe", type: "perpendiculaire", cibles: [{ objet: "p", segment: 0 }, { objet: "p", segment: 1 }] },
      { id: "co", type: "coincidence", cibles: [{ objet: "a", point: "fin" }, { objet: "v", point: "debut" }] },
      { id: "eg", type: "egalite", cibles: [{ objet: "a" }, { objet: "b" }] },
      { id: "di", type: "distance", cibles: [{ objet: "v" }], valeur: 2.5 },
      { id: "tg", type: "tangence", cibles: [{ objet: "c" }, { objet: "d" }] },
      { id: "ts", type: "tangence", cibles: [{ objet: "b" }, { objet: "c" }] },
    )]);
    // Toutes satisfaites dans la tolérance déclarée, aucune « à résoudre ».
    expect(satisfaites(d).every(([, s]) => s === "satisfaite")).toBe(true);
    expect(d.contraintes?.some((c) => c.aResoudre)).toBe(false);
    const a = ligne(d, "a"), b = ligne(d, "b"), v = ligne(d, "v");
    const tol = 1e-8;
    expect(Math.abs(a.end.y - a.start.y)).toBeLessThan(tol);
    expect(Math.abs(v.end.x - v.start.x)).toBeLessThan(tol);
    expect(Math.abs(b.end.y - b.start.y)).toBeLessThan(tol);
    expect(Math.hypot(a.end.x - v.start.x, a.end.y - v.start.y)).toBeLessThan(tol);
    expect(Math.abs(Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) - Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y))).toBeLessThan(tol);
    expect(Math.abs(Math.hypot(v.end.x - v.start.x, v.end.y - v.start.y) - 2.5)).toBeLessThan(tol);
    const c = d.objects.find((o) => o.id === "c") as Extract<StudioShape, { type: "circle" }>, k = d.objects.find((o) => o.id === "d") as Extract<StudioShape, { type: "circle" }>;
    expect(Math.abs(Math.hypot(k.center.x - c.center.x, k.center.y - c.center.y) - (c.radius + k.radius))).toBeLessThan(tol);
    expect(d.contraintes?.find((x) => x.id === "tg")?.tangence).toBe("exterieure");
    // Distance du centre de c à la droite de b égale au rayon.
    const dir = { x: b.end.x - b.start.x, y: b.end.y - b.start.y };
    expect(Math.abs(Math.abs(dir.x * (c.center.y - b.start.y) - dir.y * (c.center.x - b.start.x)) / Math.hypot(dir.x, dir.y) - c.radius)).toBeLessThan(tol);
    const p = d.objects.find((o) => o.id === "p") as Extract<StudioShape, { type: "polyline" }>;
    const [p0, p1, p2] = p.points as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    expect(Math.abs((p1.x - p0.x) * (p2.x - p1.x) + (p1.y - p0.y) * (p2.y - p1.y))).toBeLessThan(1e-7);
    // Tolérances déclarées.
    expect(STUDIO_TOLERANCES_CONTRAINTES).toEqual({ longueur: 1e-9, angle: 1e-9 });
  });

  it("X.1-01 contraintes : résolution déterministe — mêmes formes, mêmes contraintes, même document au bit près ; la géométrie bouge le moins possible", () => {
    const cs = [poser({ id: "h", type: "horizontal", cibles: [{ objet: "a" }] }, { id: "pa", type: "parallele", cibles: [{ objet: "a" }, { objet: "v" }] })];
    const un = applyStudioCommands(base(), cs), deux = applyStudioCommands(base(), cs);
    expect(JSON.stringify(un)).toBe(JSON.stringify(deux));
    // Relu, rejoué : identique.
    expect(JSON.stringify(applyStudioCommands(validateStudioDocument(JSON.parse(JSON.stringify(base()))), cs))).toBe(JSON.stringify(un));
    // Norme minimale : la ligne horizontale garde son milieu (les deux extrémités bougent d'autant).
    const h = applyStudioCommands(base(), [poser({ id: "h", type: "horizontal", cibles: [{ objet: "a" }] })]);
    const a = ligne(h, "a");
    expect(a.start.y).toBeCloseTo(0.15, 12);
    expect(a.end.y).toBeCloseTo(0.15, 12);
    expect([a.start.x, a.end.x]).toEqual([0, 4]);
    // Les objets hors du système ne bougent pas.
    expect(h.objects.filter((o) => o.id !== "a")).toEqual(base().objects.filter((o) => o.id !== "a"));
  });

  it("X.1-01 contraintes : système insatisfaisable refusé, jamais résolu en silence", () => {
    const d = base();
    // Un même segment horizontal et vertical : il devrait être nul.
    expect(refus(() => applyStudioCommands(d, [poser({ id: "h", type: "horizontal", cibles: [{ objet: "a" }] }, { id: "ve", type: "vertical", cibles: [{ objet: "a" }] })]))).toMatch(/insatisfaisable|dégénérée/);
    // Distances contradictoires sur un même segment.
    const r = refus(() => applyStudioCommands(d, [poser({ id: "d1", type: "distance", cibles: [{ objet: "a" }], valeur: 2 }, { id: "d2", type: "distance", cibles: [{ objet: "a" }], valeur: 3 })]));
    expect(r).toMatch(/insatisfaisable|sur-contrainte/);
    // Le document n'est pas modifié : le lot entier est refusé.
    expect(applyStudioCommands(d, [L("z", [0, 9], [1, 9])]).objects.find((o) => o.id === "a")).toEqual(d.objects.find((o) => o.id === "a"));
  });

  it("X.1-01 contraintes : sur-contrainte signalée et refusée, la contrainte redondante nommée", () => {
    const d = applyStudioCommands(base(), [poser({ id: "h1", type: "horizontal", cibles: [{ objet: "a" }] }, { id: "h2", type: "horizontal", cibles: [{ objet: "b" }] })]);
    // Parallélisme de deux segments déjà horizontaux : redondant.
    expect(refus(() => applyStudioCommands(d, [poser({ id: "pa", type: "parallele", cibles: [{ objet: "a" }, { objet: "b" }] })]))).toMatch(/^.*sur-contrainte : pa est redondante/);
    // Même contrainte posée deux fois.
    expect(refus(() => applyStudioCommands(d, [poser({ id: "h3", type: "horizontal", cibles: [{ objet: "a" }] })]))).toContain("sur-contrainte : h3");
    // Deux points d'un objet verrouillé (référence fixe) : aucun degré de liberté.
    const verrou = applyStudioCommands(d, [
      { toolId: "studio.calque.creer", params: { id: "ref", name: "Référence", visible: true, locked: false } },
      { toolId: "studio.objet.calque", params: { ids: ["v"], layerId: "ref" } },
      { toolId: "studio.calque.modifier", params: { id: "ref", name: "Référence", visible: true, locked: true } },
    ]);
    expect(refus(() => applyStudioCommands(verrou, [poser({ id: "x", type: "vertical", cibles: [{ objet: "v" }] })]))).toMatch(/insatisfaisable/);
  });

  it("X.1-01 contraintes : la géométrie change, la contrainte passe « à résoudre » ; résolue sur demande seulement", () => {
    const d = applyStudioCommands(base(), [poser({ id: "pa", type: "parallele", cibles: [{ objet: "a" }, { objet: "b" }] }, { id: "co", type: "coincidence", cibles: [{ objet: "a", point: "fin" }, { objet: "v", point: "debut" }] })]);
    // Translation de tous ses objets ensemble : toujours satisfaite.
    const t = applyStudioCommands(d, [{ toolId: "studio.dessin.copier", params: { ids: ["a"], dx: 0, dy: 30, copies: 1, prefix: "x" } }]);
    expect(t.contraintes?.every((c) => !c.aResoudre)).toBe(true);
    // Une ligne tournée seule : « à résoudre », géométrie gardée telle quelle (rien n'est recalculé).
    const r = applyStudioCommands(d, [{ toolId: "studio.dessin.rotation", params: { ids: ["b"], center: { x: 0, y: 2 }, angle: 0.3 } }]);
    expect(r.contraintes?.find((c) => c.id === "pa")?.aResoudre).toBe(true);
    expect(r.contraintes?.find((c) => c.id === "co")?.aResoudre).toBeUndefined();
    expect(studioEvaluerContrainte(r.contraintes![0]!, formes(r)).statut).toBe("a-resoudre");
    // Toute autre commande laisse l'état « à résoudre » (jamais une résolution en silence).
    const autre = applyStudioCommands(r, [L("z", [0, 9], [1, 9])]);
    expect(autre.contraintes?.find((c) => c.id === "pa")?.aResoudre).toBe(true);
    expect(autre.objects.find((o) => o.id === "b")).toEqual(r.objects.find((o) => o.id === "b"));
    // Poser une contrainte liée sans résoudre la contrainte rompue : refus.
    expect(refus(() => applyStudioCommands(r, [poser({ id: "h", type: "horizontal", cibles: [{ objet: "b" }] })]))).toContain("aussi à résoudre");
    // Résolution explicite : satisfaite, état effacé.
    const s = applyStudioCommands(r, [resoudre("pa")]);
    expect(s.contraintes?.find((c) => c.id === "pa")).not.toHaveProperty("aResoudre");
    expect(satisfaites(s).every(([, x]) => x === "satisfaite")).toBe(true);
    // Objet supprimé : la contrainte garde sa cible, « à résoudre » ; la résolution est refusée, Supprimer la retire.
    const sup = applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["v"] } }]);
    expect(sup.contraintes?.find((c) => c.id === "co")).toMatchObject({ aResoudre: true, cibles: [{ objet: "a", point: "fin" }, { objet: "v", point: "debut" }] });
    expect(validateStudioDocument(JSON.parse(JSON.stringify(sup)))).toEqual(sup);
    expect(refus(() => applyStudioCommands(sup, [resoudre("co")]))).toContain("objet introuvable : v");
    expect(applyStudioCommands(sup, [{ toolId: "studio.dessin.supprimer", params: { ids: ["co"] } }]).contraintes?.map((c) => c.id)).toEqual(["pa"]);
  });

  it("X.1-01 contraintes : les cotes liées suivent la géométrie résolue ; refus explicites des cibles et des valeurs", () => {
    const d = applyStudioCommands(base(), [{ toolId: "studio.dessin.cote", params: { id: "k", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0.3 }, offset: 0.5, links: { start: { objectId: "a", anchor: "start" }, end: { objectId: "a", anchor: "end" } }, toResolve: false } }]);
    const h = applyStudioCommands(d, [poser({ id: "h", type: "horizontal", cibles: [{ objet: "a" }] })]);
    expect(h.dimensions?.[0]).toMatchObject({ start: ligne(h, "a").start, end: ligne(h, "a").end });
    const essai = (c: unknown) => refus(() => applyStudioCommands(d, [poser(c as StudioContrainte)]));
    expect(essai({ id: "x", type: "distance", cibles: [{ objet: "a" }] })).toContain("aucune valeur n’est supposée");
    expect(essai({ id: "x", type: "distance", cibles: [{ objet: "a" }], valeur: -1 })).toContain("strictement positive");
    expect(essai({ id: "x", type: "horizontal", cibles: [{ objet: "c" }] })).toContain("segment droit est attendu");
    expect(essai({ id: "x", type: "horizontal", cibles: [{ objet: "absent" }] })).toContain("objet introuvable");
    expect(essai({ id: "x", type: "coincidence", cibles: [{ objet: "a" }, { objet: "b" }] })).toContain("deux points");
    expect(essai({ id: "x", type: "parallele", cibles: [{ objet: "a" }, { objet: "a" }] })).toContain("confondues");
    expect(essai({ id: "x", type: "horizontal", cibles: [{ objet: "p", segment: 5 }] })).toContain("segment 5 absent");
    expect(essai({ id: "x", type: "inconnu", cibles: [{ objet: "a" }] })).toContain("type de contrainte inconnu");
    expect(essai({ id: "x", type: "horizontal", cibles: [{ objet: "a" }], aResoudre: true })).toContain("jamais saisi");
    expect(essai({ id: "a", type: "horizontal", cibles: [{ objet: "b" }] })).toContain("identifiant déjà utilisé");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.contrainte.poser", params: {} }]))).toContain("au moins une contrainte");
    const rect = applyStudioCommands(d, [{ toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 1, height: 1 } }]);
    expect(refus(() => applyStudioCommands(rect, [poser({ id: "x", type: "horizontal", cibles: [{ objet: "r" }] })]))).toContain("non contraignable");
    // Document : une contrainte non « à résoudre » vers un objet absent est refusée à la lecture.
    expect(refus(() => validateStudioDocument({ ...d, contraintes: [{ id: "x", type: "horizontal", cibles: [{ objet: "absent" }] }] }))).toContain("objet introuvable");
  });
});
