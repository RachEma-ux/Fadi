import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { studioAncetreCommun, studioFusionnerVariantes, type StudioCoteFusion } from "./fusion-variantes.js";
import { exactSynthetique } from "./exacts.fixtures.js";
import type { StudioBox } from "./objets-3d/solides.js";

/** Fusion de variantes (X.1-06) : modèle pur, trois voies, conflits explicites. Géométrie synthétique. */

const ligne = (id: string, y: number, x = 1): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x, y } } });
const mur = (id: string, y: number): StudioCommand => ({ toolId: "studio.architecture.mur", params: { id, type: "wall", axis: [{ x: 0, y }, { x: 6, y }], thickness: 0.2, height: 3, base: 0, justification: "center" } });
const fenetre = (id: string, hostId: string, position = 2.5, width = 1): StudioCommand => ({ toolId: "studio.architecture.ouverture", params: { id, type: "opening", hostId, position, width, height: 1.2, sill: 0.9, kind: "fenetre" } });
const appliquer = (doc: StudioDocument, ...cs: StudioCommand[]) => applyStudioCommands(doc, cs);
const BASE = appliquer(newStudioDocument("doc-fusion"), ligne("l1", 0), ligne("l2", 1), mur("m1", 4), fenetre("o1", "m1"));
const cles = (r: ReturnType<typeof studioFusionnerVariantes>) => r.appliques.map((a) => `${a.etat}:${a.cle}`);
const objet = (d: StudioDocument | null, id: string) => d?.objects.find((o) => o.id === id) as { start: { x: number; y: number }; end: { x: number; y: number }; layerId?: string } | undefined;

describe("Fusion de variantes — trois voies par objet et par propriété", () => {
  it("fusion sans conflit : changements de la source repris, ceux de la cible conservés, ancêtre respecté", () => {
    const source = appliquer(BASE, ligne("s1", 5), { toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } });
    const cible = appliquer(BASE, ligne("c1", 6), { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 0, dy: 0.5 } });
    const r = studioFusionnerVariantes(BASE, source, cible);
    expect(r.conflits).toEqual([]);
    expect(r.valide && r.aFusionner && !r.provisoire).toBe(true);
    expect(cles(r)).toEqual(["supprime:objects:l2", "ajoute:objects:s1"]);
    expect(r.document!.objects.map((o) => o.id)).toEqual(["l1", "c1", "s1"]);
    // Le déplacement de l1 dans la cible n'est pas défait (la source ne l'a pas touché depuis l'ancêtre).
    expect(objet(r.document, "l1")!.start.y).toBe(0.5);
    expect(r.changementsSource.map((c) => `${c.etat}:${c.cle}`)).toEqual(["supprime:objects:l2", "ajoute:objects:s1"]);
    expect(r.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("par propriété : deux propriétés différentes du même objet modifiées de chaque côté sont fusionnées sans conflit", () => {
    const calque: StudioCommand = { toolId: "studio.calque.creer", params: { id: "axes", name: "Axes", visible: true, locked: false } };
    const base = appliquer(BASE, calque);
    // Source : géométrie de l1 ; cible : calque de l1.
    const source = appliquer(base, { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 0, dy: 2 } });
    const cible = appliquer(base, { toolId: "studio.objet.calque", params: { ids: ["l1"], layerId: "axes" } });
    const r = studioFusionnerVariantes(base, source, cible);
    expect(r.conflits).toEqual([]);
    const l1 = objet(r.document, "l1")!;
    expect([l1.start.y, l1.layerId]).toEqual([2, "axes"]);
    expect(r.appliques).toEqual([{ cle: "objects:l1", etat: "modifie", origine: "mixte" }]);
  });

  it("même objet modifié des deux côtés : conflit par propriété, provisoire (cible gardée) jusqu'à la résolution explicite", () => {
    const source = appliquer(BASE, { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } });
    const cible = appliquer(BASE, { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 0, dy: 3 } });
    const r = studioFusionnerVariantes(BASE, source, cible);
    expect(r.conflits.map((c) => [c.id, c.type, c.propriete])).toEqual([["modification:objects:l1/end", "modification-concurrente", "end"], ["modification:objects:l1/start", "modification-concurrente", "start"]]);
    expect(r.nonResolus).toEqual(["modification:objects:l1/end", "modification:objects:l1/start"]);
    expect(r.provisoire).toBe(true);
    // Jamais tranché en silence : le document provisoire garde la cible, rien n'est à fusionner.
    expect(objet(r.document, "l1")!.start).toEqual({ x: 0, y: 3 });
    expect(r.aFusionner).toBe(false);
    expect(r.conflits[1]!.valeurs).toEqual({ base: { x: 0, y: 0 }, source: { x: 1, y: 0 }, cible: { x: 0, y: 3 } });
    const choix = (cote: StudioCoteFusion) => studioFusionnerVariantes(BASE, source, cible, { "modification:objects:l1/end": cote, "modification:objects:l1/start": cote });
    expect(objet(choix("source").document, "l1")!.start).toEqual({ x: 1, y: 0 });
    expect(choix("source").nonResolus).toEqual([]);
    expect(choix("source").appliques).toEqual([{ cle: "objects:l1", etat: "modifie", origine: "resolution" }]);
    expect(objet(choix("cible").document, "l1")!.start).toEqual({ x: 0, y: 3 });
    expect(choix("cible").aFusionner).toBe(false);
  });

  it("le même changement fait des deux côtés n'est pas un conflit", () => {
    const deplace: StudioCommand = { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 1 } };
    const r = studioFusionnerVariantes(BASE, appliquer(BASE, deplace), appliquer(BASE, deplace));
    expect(r.conflits).toEqual([]);
    expect(r.aFusionner).toBe(false);
  });

  it("supprimé d'un côté, modifié de l'autre : conflit « suppression-modification », dans les deux sens", () => {
    const supprime = appliquer(BASE, { toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } });
    const modifie = appliquer(BASE, { toolId: "studio.dessin.deplacer", params: { id: "l2", dx: 0, dy: 1 } });
    const a = studioFusionnerVariantes(BASE, supprime, modifie);
    expect(a.conflits.map((c) => [c.id, c.type, c.supprimeDans])).toEqual([["suppression:objects:l2", "suppression-modification", "source"]]);
    expect(a.conflits[0]!.etats).toEqual({ base: "line", source: null, cible: "line" });
    expect(objet(studioFusionnerVariantes(BASE, supprime, modifie, { "suppression:objects:l2": "source" }).document, "l2")).toBeUndefined();
    expect(objet(studioFusionnerVariantes(BASE, supprime, modifie, { "suppression:objects:l2": "cible" }).document, "l2")).toBeDefined();
    const b = studioFusionnerVariantes(BASE, modifie, supprime);
    expect(b.conflits.map((c) => [c.id, c.supprimeDans])).toEqual([["suppression:objects:l2", "cible"]]);
    expect(objet(studioFusionnerVariantes(BASE, modifie, supprime, { "suppression:objects:l2": "source" }).document, "l2")!.start.y).toBe(2);
  });

  it("identifiants en collision : même identifiant ajouté des deux côtés avec des contenus différents", () => {
    const source = appliquer(BASE, ligne("n1", 8, 2)), cible = appliquer(BASE, ligne("n1", 9, 3));
    const r = studioFusionnerVariantes(BASE, source, cible);
    expect(r.conflits.map((c) => [c.id, c.type])).toEqual([["collision:objects:n1", "collision-identifiant"]]);
    expect(r.conflits[0]!.etats).toEqual({ base: null, source: "line", cible: "line" });
    expect(objet(studioFusionnerVariantes(BASE, source, cible, { "collision:objects:n1": "source" }).document, "n1")!.end.x).toBe(2);
    // Même contenu ajouté des deux côtés : aucun conflit.
    expect(studioFusionnerVariantes(BASE, source, appliquer(BASE, ligne("n1", 8, 2))).conflits).toEqual([]);
  });

  it("référence cassée : ouverture ajoutée dans la cible sur un mur supprimé par la source", () => {
    const source = appliquer(BASE, { toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: true } });
    const cible = appliquer(BASE, fenetre("o2", "m1", 4.5, 0.8));
    const r = studioFusionnerVariantes(BASE, source, cible);
    const ref = r.conflits.find((c) => c.type === "reference-cassee")!;
    expect(ref).toMatchObject({ id: "reference:hote:architecture:o2>architecture:m1", cles: ["architecture:o2", "architecture:m1"], reference: { nature: "hote", de: "architecture:o2", vers: "architecture:m1" } });
    expect(r.nonResolus).toContain(ref.id);
    // Source : le mur part, l'ouverture ajoutée dans la cible aussi (cohérent) ; cible : le mur et ses deux ouvertures restent.
    const s = studioFusionnerVariantes(BASE, source, cible, { [ref.id]: "source" });
    expect(s.valide && s.nonResolus.length === 0).toBe(true);
    expect((s.document!.architecture ?? []).map((a) => a.id)).toEqual([]);
    const c = studioFusionnerVariantes(BASE, source, cible, { [ref.id]: "cible" });
    // La fenêtre o1, supprimée par la source et intacte dans la cible, part avec la cascade de la source (sans conflit).
    expect((c.document!.architecture ?? []).map((a) => a.id).sort()).toEqual(["m1", "o2"]);
  });

  it("référence cassée : cote associative ajoutée sur une ligne supprimée de l'autre côté", () => {
    const source = appliquer(BASE, { toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } });
    const cible = appliquer(BASE, { toolId: "studio.dessin.cote", params: { id: "d1", type: "dimension", start: { x: 0, y: 1 }, end: { x: 1, y: 1 }, offset: 0.5, links: { start: { objectId: "l2", anchor: "start" }, end: { objectId: "l2", anchor: "end" } }, toResolve: false } });
    const r = studioFusionnerVariantes(BASE, source, cible);
    expect(r.conflits.map((c) => c.id)).toEqual(["reference:cote-liee:dimensions:d1>objects:l2"]);
    const s = studioFusionnerVariantes(BASE, source, cible, { "reference:cote-liee:dimensions:d1>objects:l2": "source" });
    expect([s.valide, objet(s.document, "l2"), s.document!.dimensions ?? []]).toEqual([true, undefined, []]);
    const c = studioFusionnerVariantes(BASE, source, cible, { "reference:cote-liee:dimensions:d1>objects:l2": "cible" });
    expect([c.valide, !!objet(c.document, "l2"), (c.document!.dimensions ?? []).length, c.aFusionner]).toEqual([true, true, 1, false]);
  });

  it("référence cassée : objet placé dans la cible sur un calque supprimé par la source", () => {
    const base = appliquer(BASE, { toolId: "studio.calque.creer", params: { id: "notes", name: "Notes", visible: true, locked: false } });
    const source = validateStudioDocument({ ...base, layers: [] });
    const cible = appliquer(base, { toolId: "studio.objet.calque", params: { ids: ["l1"], layerId: "notes" } });
    const r = studioFusionnerVariantes(base, source, cible);
    expect(r.conflits.map((c) => [c.id, c.reference?.nature])).toEqual([["reference:calque:objects:l1>layers:notes", "calque"]]);
    expect(studioFusionnerVariantes(base, source, cible, { "reference:calque:objects:l1>layers:notes": "source" }).document!.layers ?? []).toEqual([]);
  });

  it("opérandes exacts : solide consommé par un booléen dans la source, modifié dans la cible (suppression + opérande en double)", () => {
    const boite = (id: string, x: number, width = 1): StudioBox => ({ id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width, depth: 1, height: 1 });
    const base = validateStudioDocument({ ...newStudioDocument("doc-exact"), solides: [boite("b1", 0), boite("b2", 0.5)] });
    const source = validateStudioDocument({ ...base, solides: [], exacts: [exactSynthetique("e1", [boite("b1", 0), boite("b2", 0.5)])] });
    const cible = validateStudioDocument({ ...base, solides: [boite("b1", 0, 2), boite("b2", 0.5)] });
    const r = studioFusionnerVariantes(base, source, cible);
    expect(r.conflits.map((c) => [c.id, c.type])).toEqual([
      ["reference:operande-doublon:exacts:e1>solides:b1", "reference-cassee"],
      ["suppression:solides:b1", "suppression-modification"],
    ]);
    // Garder la cible pour b1 sans trancher l'opérande donnerait un identifiant en double : le document n'est pas proposé.
    const partiel = studioFusionnerVariantes(base, source, cible, { "suppression:solides:b1": "cible" });
    expect(partiel.nonResolus).toEqual(["reference:operande-doublon:exacts:e1>solides:b1"]);
    expect(partiel.valide).toBe(false);
    expect(partiel.erreur?.message).toMatch(/identifiant dupliqué/);
    const s = studioFusionnerVariantes(base, source, cible, { "suppression:solides:b1": "source", "reference:operande-doublon:exacts:e1>solides:b1": "source" });
    expect([s.valide, s.nonResolus, (s.document!.exacts ?? []).map((e) => e.id), s.document!.solides ?? []]).toEqual([true, [], ["e1"], []]);
    const c = studioFusionnerVariantes(base, source, cible, { "suppression:solides:b1": "cible", "reference:operande-doublon:exacts:e1>solides:b1": "cible" });
    expect([c.valide, c.document!.exacts ?? [], (c.document!.solides ?? []).map((x) => x.id)]).toEqual([true, [], ["b1"]]);
  });

  it("combinaison invalide : propriétés reprises des deux côtés dont l'assemblage est refusé (ouverture hors du mur)", () => {
    // Source : la fenêtre o1 glisse (position 2,5 → 4,8) ; cible : elle s'élargit (largeur 1 → 3 m). Chacun est valide,
    // l'assemblage (4,8 + 3 = 7,8 m sur un mur de 6 m) ne l'est pas.
    const source = appliquer(BASE, { toolId: "studio.architecture.modifier", params: { id: "o1", type: "opening", hostId: "m1", position: 4.8, width: 1, height: 1.2, sill: 0.9, kind: "fenetre" } });
    const cible = appliquer(BASE, { toolId: "studio.architecture.modifier", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 3, height: 1.2, sill: 0.9, kind: "fenetre" } });
    const r = studioFusionnerVariantes(BASE, source, cible);
    expect(r.conflits.map((c) => [c.id, c.type])).toEqual([["combinaison:architecture:o1", "combinaison-invalide"]]);
    expect(r.valide).toBe(true);
    const s = studioFusionnerVariantes(BASE, source, cible, { "combinaison:architecture:o1": "source" });
    expect((s.document!.architecture ?? []).find((a) => a.id === "o1")).toMatchObject({ position: 4.8, width: 1 });
  });

  it("résolution inconnue rapportée, côté invalide refusé ; entrées jamais modifiées", () => {
    const source = appliquer(BASE, ligne("s1", 5));
    const avant = JSON.stringify([BASE, source]);
    const r = studioFusionnerVariantes(BASE, source, BASE, { "modification:objects:zz/start": "source" });
    expect(r.resolutionsInconnues).toEqual(["modification:objects:zz/start"]);
    expect(() => studioFusionnerVariantes(BASE, source, BASE, { x: "gauche" as StudioCoteFusion })).toThrow(/source.*cible/);
    expect(JSON.stringify([BASE, source])).toBe(avant);
    // Déterministe : même entrée, même empreinte.
    expect(studioFusionnerVariantes(BASE, source, BASE).empreinte).toBe(r.empreinte);
  });
});

describe("Fusion de variantes — ancêtre commun", () => {
  // A0 → A1 → A2 (variante A) ; B0 dérivée de A1 → B1 ; C0 dérivée de A2.
  const graphe = [
    { id: "A0", parents: [] }, { id: "A1", parents: ["A0"] }, { id: "A2", parents: ["A1"] },
    { id: "B0", parents: ["A1"] }, { id: "B1", parents: ["B0"] }, { id: "C0", parents: ["A2"] },
  ];
  it("révision de dérivation la plus proche ; une fusion déplace l'ancêtre ; aucune histoire commune ; ambiguïté refusée", () => {
    expect(studioAncetreCommun(graphe, "B1", "C0")).toEqual({ ancetre: "A1" });
    expect(studioAncetreCommun(graphe, "A2", "B1")).toEqual({ ancetre: "A1" });
    expect(studioAncetreCommun(graphe, "C0", "A2")).toEqual({ ancetre: "A2" });
    // Après la fusion de B1 dans C (révision C1 aux deux parents), l'ancêtre d'une nouvelle fusion de B est B1.
    const apres = [...graphe, { id: "C1", parents: ["C0", "B1"] }, { id: "B2", parents: ["B1"] }];
    expect(studioAncetreCommun(apres, "B2", "C1")).toEqual({ ancetre: "B1" });
    expect(studioAncetreCommun([{ id: "X0", parents: [] }, ...graphe], "X0", "B1")).toEqual({ ancetre: null, motif: "aucun", candidats: [] });
    const croise = [...graphe, { id: "B2", parents: ["B1", "A2"] }, { id: "A3", parents: ["A2", "B1"] }];
    expect(studioAncetreCommun(croise, "B2", "A3")).toEqual({ ancetre: null, motif: "ambigu", candidats: ["A2", "B1"] });
  });
});
