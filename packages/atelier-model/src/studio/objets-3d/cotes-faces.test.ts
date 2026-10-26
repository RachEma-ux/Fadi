import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { studioEffetsCommande } from "../cmd/effets.js";
import { studioCopieIndependante } from "../copie-independante.js";
import { studioRapportFidelite } from "../echanges/rapport-fidelite.js";
import { exactSynthetique } from "../exacts.fixtures.js";
import { studioValeurCoteFace, type StudioCoteFace } from "./cotes-faces.js";

/**
 * INV-013 (lot G2) — une annotation référencée à une face 3D d'un solide est conservée avec une correspondance
 * vérifiée, ou marquée « à résoudre » : la cote de face (`studio.solide.cote-face`) suit la face poussée / tirée,
 * déplacée ou pivotée ; une face divisée qui portait la cote donne deux faces voisines plausibles — aucun rattachement
 * automatique par proximité ; une face renumérotée par la division d'une autre est réattachée par preuve (même plan,
 * même arête). Dimensions de test synthétiques (boîte 4 × 2 × 3 m).
 */
const cmd = (c: unknown) => c as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(cmd));
const boite = { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 4, depth: 2, height: 3 } };
const cote = (id: string, faces: [string, string], over: Partial<StudioCoteFace> = {}) => ({ toolId: "studio.solide.cote-face", params: { id, type: "face-dimension", solidId: "b1", faces, toResolve: false, ...over } });
const base = () => avec(newStudioDocument("inv013"), boite, cote("h", ["base", "sommet"]), cote("l", ["lateral-1", "lateral-3"]), cote("p", ["lateral-0", "lateral-2"]));
const valeur = (d: StudioDocument, id: string) => studioValeurCoteFace(d.solides ?? [], d.cotesFaces!.find((c) => c.id === id)!);
const coteDe = (d: StudioDocument, id: string) => d.cotesFaces!.find((c) => c.id === id)!;
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "accepté"; };

describe("INV-013 [+] — cote de face 3D : la cote suit la face modifiée, correspondance vérifiée (lot G2)", () => {
  it("création : hauteur (base / sommet), largeur et profondeur (faces latérales opposées), valeurs dérivées ; document valide", () => {
    const d = base();
    expect(valeur(d, "h")).toBeCloseTo(3, 12);
    expect(valeur(d, "l")).toBeCloseTo(4, 12);
    expect(valeur(d, "p")).toBeCloseTo(2, 12);
    expect(validateStudioDocument(d)).toEqual(d);
    expect(d.cotesFaces!.every((c) => !c.toResolve)).toBe(true);
  });

  it("pousser / tirer la face référencée : même cote, même face, valeur suivie ; déplacer, pivoter (z et basculement) : inchangée", () => {
    let d = avec(base(), { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "sommet", distance: 0.5 } }, { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-1", distance: 1 } });
    expect(coteDe(d, "h")).toMatchObject({ faces: ["base", "sommet"], toResolve: false });
    expect(valeur(d, "h")).toBeCloseTo(3.5, 12);
    expect(valeur(d, "l")).toBeCloseTo(5, 12);
    d = avec(d, { toolId: "studio.solide.deplacer", params: { id: "b1", dx: 3, dy: -1, dz: 2 } }, { toolId: "studio.solide.pivoter", params: { id: "b1", angle: 0.7 } }, { toolId: "studio.solide.pivoter", params: { id: "b1", angle: 0.4, axe: "x" } });
    expect(valeur(d, "h")).toBeCloseTo(3.5, 9);
    expect(valeur(d, "l")).toBeCloseTo(5, 9);
    expect(valeur(d, "p")).toBeCloseTo(2, 9);
    expect(d.cotesFaces!.every((c) => !c.toResolve)).toBe(true);
  });

  it("diviser une autre face : les faces latérales suivantes sont renumérotées et la cote réattachée par preuve (même plan, même arête)", () => {
    const d = avec(base(), { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 1 } });
    // La boîte devient un prisme de 5 faces latérales : x+ passe de lateral-1 à lateral-2, x− de lateral-3 à lateral-4.
    expect(coteDe(d, "l")).toMatchObject({ faces: ["lateral-2", "lateral-4"], toResolve: false });
    expect(valeur(d, "l")).toBeCloseTo(4, 12);
    expect(coteDe(d, "h")).toMatchObject({ faces: ["base", "sommet"], toResolve: false });
  });

  it("résolution explicite : la même commande, sur la cote « à résoudre », la rattache aux faces choisies par la personne", () => {
    const d = avec(base(), { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 1 } });
    expect(coteDe(d, "p").toResolve).toBe(true);
    const r = avec(d, cote("p", ["lateral-1", "lateral-3"]));
    expect(coteDe(r, "p")).toMatchObject({ faces: ["lateral-1", "lateral-3"], toResolve: false });
    expect(valeur(r, "p")).toBeCloseTo(2, 12);
    // Dans un seul lot (brouillon enregistré d'un coup) : chaque commande est suivie à son tour — la cote créée, la
    // face divisée, puis la cote rattachée aux faces du solide tel qu'il est alors ; une face renumérotée puis tirée suit.
    const lot = avec(newStudioDocument("lot"), boite, cote("p", ["lateral-0", "lateral-2"]), cote("l", ["lateral-1", "lateral-3"]),
      { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 1 } }, cote("p", ["lateral-1", "lateral-3"]),
      { toolId: "studio.solide.face-decaler", params: { id: "b1", face: "lateral-2", distance: 0.5 } });
    expect(coteDe(lot, "p")).toMatchObject({ faces: ["lateral-1", "lateral-3"], toResolve: false });
    expect(coteDe(lot, "l")).toMatchObject({ faces: ["lateral-2", "lateral-4"], toResolve: false });
    expect(valeur(lot, "l")).toBeCloseTo(4.5, 12);
  });

  it("effets de la commande : la cote est une référence du solide ; la contrainte « à résoudre » apparaît quand la face divisée la portait ; copie indépendante : références reportées", () => {
    const d = base();
    const c: StudioCommand[] = [cmd({ toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 1 } })];
    const apres = applyStudioCommands(d, c);
    const e = studioEffetsCommande(d, apres, c, { revisionBase: "R12", revisionSortie: "R13", source: "authenticated-session", auteurId: "u", requestId: "q" });
    expect(e.contraintes).toContainEqual({ id: "p", contrainte: "a-resoudre", avant: false, apres: true });
    expect(e.modifies).toEqual(expect.arrayContaining(["b1", "l", "p"]));
    const copie = studioCopieIndependante(d, "copie", "c1").document;
    expect(copie.cotesFaces!.map((x) => x.solidId)).toEqual(["b1~c1", "b1~c1", "b1~c1"]);
    expect(studioRapportFidelite(d, "ifc").lignes).toContainEqual(expect.objectContaining({ categorie: "cotesFaces", type: "face-dimension", statut: "non-couvert", nombre: 3 }));
  });
});

describe("INV-013 [−] — aucun rattachement automatique par proximité ; cote conservée « à résoudre » (lot G2)", () => {
  it("diviser la face qui porte la cote : deux faces voisines coplanaires plausibles — la cote est conservée, marquée « à résoudre », valeur non évaluée, faces inchangées", () => {
    const d = avec(base(), { toolId: "studio.solide.face-diviser", params: { id: "b1", face: "lateral-0", distance: 1 } });
    expect(coteDe(d, "p")).toEqual({ id: "p", type: "face-dimension", solidId: "b1", faces: ["lateral-0", "lateral-2"], toResolve: true });
    expect(valeur(d, "p")).toBeNull();
    // Rattacher par proximité aurait donné l'une des deux moitiés (lateral-0 ou lateral-1) : rien n'est choisi.
    expect(d.solides![0]).toMatchObject({ type: "prism" });
  });

  it("solide supprimé ou consommé par un booléen : cote conservée « à résoudre » ; un calque de cote verrouillé refuse le lot", () => {
    const sup = avec(base(), { toolId: "studio.solide.supprimer", params: { ids: ["b1"] } });
    expect(sup.cotesFaces!.map((c) => c.toResolve)).toEqual([true, true, true]);
    const deux = avec(base(), { toolId: "studio.solide.boite", params: { id: "b2", type: "box", placement: { origin: { x: 1, y: 0, z: 0 }, rotation: 0 }, width: 4, depth: 2, height: 3 } });
    const op = (id: string) => structuredClone(deux.solides!.find((s) => s.id === id)!);
    const exact = exactSynthetique("e1", [op("b1"), op("b2")]);
    const bool = avec(deux, { toolId: "studio.solide.booleen", params: { id: "e1", operation: "union", operandes: ["b1", "b2"], resultat: exact.resultat } });
    expect(bool.cotesFaces!.every((c) => c.toResolve)).toBe(true);
    const verrou = avec(newStudioDocument("v"), { toolId: "studio.calque.creer", params: { id: "k", name: "K", visible: true, locked: false } }, boite, cote("h", ["base", "sommet"], { layerId: "k" }),
      { toolId: "studio.calque.modifier", params: { id: "k", name: "K", visible: true, locked: true } });
    expect(refus(() => avec(verrou, { toolId: "studio.solide.supprimer", params: { ids: ["b1"] } }))).toMatch(/verrouill/);
  });

  it("création refusée : faces non parallèles, face inexistante, solide absent, état « à résoudre » saisi, faces identiques, champ inconnu", () => {
    const d = avec(newStudioDocument("x"), boite);
    expect(refus(() => avec(d, cote("c", ["base", "lateral-0"])))).toMatch(/non parallèles/);
    expect(refus(() => avec(d, cote("c", ["lateral-0", "lateral-1"])))).toMatch(/non parallèles/);
    expect(refus(() => avec(d, cote("c", ["lateral-0", "lateral-7"])))).toMatch(/inexistante/);
    expect(refus(() => avec(d, cote("c", ["base", "sommet"], { solidId: "absent" })))).toMatch(/introuvable/);
    expect(refus(() => avec(d, cote("c", ["base", "sommet"], { toResolve: true })))).toMatch(/jamais saisi/);
    expect(refus(() => avec(d, cote("c", ["base", "base"])))).toMatch(/distinctes/);
    expect(refus(() => avec(d, { toolId: "studio.solide.cote-face", params: { id: "c", type: "face-dimension", solidId: "b1", faces: ["base", "sommet"], toResolve: false, valeur: 3 } }))).not.toBe("accepté");
    expect(refus(() => validateStudioDocument({ ...d, cotesFaces: [{ id: "c", type: "face-dimension", solidId: "b1", faces: ["base", "lateral-0"], toResolve: false }] }))).toMatch(/non parallèles/);
  });
});
