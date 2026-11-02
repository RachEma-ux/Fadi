/**
 * X.1-01 (modèle) — blocs définis par l'utilisateur : définition réutilisable et insertions transformées (position,
 * rotation, échelle, symétrie), redéfinition répercutée sur toutes les insertions, éclatement, commandes générales sur les
 * insertions, refus explicites et rétrocompatibilité de `studio-document/1`.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, StudioValidationError, type StudioCommand, type StudioDocument, type StudioShape } from "../document-2d.js";
import { studioFormesInsertion, studioPoseTransformee, studioTransformationInsertion, type StudioDefinitionBloc, type StudioInsertionBloc } from "./blocs.js";
import { studioRotation, studioSymetrie } from "../transformations.js";
import { exportStudioDxf, exportStudioSvg } from "../export.js";
import { lireDxfStudio } from "../import-dxf.js";
import { studioRapportFidelite } from "../echanges/rapport-fidelite.js";

const refus = (f: () => unknown): string => { try { f(); } catch (e) { if (e instanceof StudioValidationError) return e.message; throw e; } return ""; };
const pres = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12);

/** Bloc « porte » : un rectangle 1 × 2 et un arc d'ouverture, point de base au coin (0, 0). */
const ELEMENTS: StudioShape[] = [
  { id: "cadre", type: "rectangle", origin: { x: 0, y: 0 }, width: 1, height: 2 },
  { id: "battant", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  { id: "ouverture", type: "arc", center: { x: 0, y: 0 }, radius: 1, startAngle: 0, endAngle: Math.PI / 2 },
];
const definir = (params: Record<string, unknown> = {}): StudioCommand => ({ toolId: "studio.bloc.definir", params: { id: "porte", nom: "Porte", base: { x: 0, y: 0 }, elements: ELEMENTS, ...params } as never });
const inserer = (id: string, pose: Partial<StudioInsertionBloc> = {}): StudioCommand => ({ toolId: "studio.bloc.inserer", params: { id, type: "insertion", bloc: "porte", position: { x: 0, y: 0 }, rotation: 0, echelle: 1, ...pose } as never });

function avecInsertions(): StudioDocument {
  return applyStudioCommands(newStudioDocument("b"), [
    definir(),
    inserer("i1", { position: { x: 10, y: 0 } }),
    inserer("i2", { position: { x: 20, y: 5 }, rotation: Math.PI / 2, echelle: 2 }),
    inserer("i3", { position: { x: 30, y: 0 }, symetrie: true }),
  ]);
}
const formesDe = (d: StudioDocument, id: string) => {
  const ins = d.insertions!.find((x) => x.id === id)!;
  return studioFormesInsertion(d.blocs!.find((b) => b.id === ins.bloc)!, ins);
};

describe("X.1-01 — blocs définis par l'utilisateur (studio-document/1)", () => {
  it("X.1-01 blocs : une définition réutilisable et ses insertions transformées (position, rotation, échelle, symétrie) — géométrie dérivée exacte, document relu à l'identique", () => {
    const d = avecInsertions();
    expect(d.blocs).toEqual([{ id: "porte", type: "bloc", nom: "Porte", base: { x: 0, y: 0 }, elements: ELEMENTS }]);
    expect(d.insertions?.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    // La géométrie des insertions n'est jamais stockée : aucun objet n'est créé.
    expect(d.objects).toEqual([]);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
    // i1 : translation (10, 0).
    expect(formesDe(d, "i1")[1]).toMatchObject({ type: "line", start: { x: 10, y: 0 }, end: { x: 11, y: 0 } });
    // i2 : quart de tour exact et échelle 2 — le rectangle reste un rectangle 4 × 2 (largeur et hauteur échangées).
    const [cadre2, battant2, arc2] = formesDe(d, "i2");
    expect(cadre2).toEqual({ id: "i2.cadre", type: "rectangle", origin: { x: 16, y: 5 }, width: 4, height: 2 });
    expect(battant2).toMatchObject({ start: { x: 20, y: 5 }, end: { x: 20, y: 7 } });
    expect(arc2).toMatchObject({ type: "arc", center: { x: 20, y: 5 }, radius: 2 });
    pres((arc2 as { startAngle: number }).startAngle, Math.PI / 2);
    pres((arc2 as { endAngle: number }).endAngle, Math.PI);
    // i3 : symétrie d'axe vertical du bloc (x ↦ −x) : l'arc reste exact, début et fin échangés.
    const [cadre3, battant3, arc3] = formesDe(d, "i3");
    expect(cadre3).toMatchObject({ type: "rectangle", origin: { x: 29, y: 0 }, width: 1, height: 2 });
    expect(battant3).toMatchObject({ start: { x: 30, y: 0 }, end: { x: 29, y: 0 } });
    pres((arc3 as { startAngle: number }).startAngle, Math.PI / 2);
    pres((arc3 as { endAngle: number }).endAngle, Math.PI);
    // Rotation quelconque : un rectangle devient une polyligne fermée (aucun rectangle tourné dans le modèle).
    const t = applyStudioCommands(d, [inserer("i4", { position: { x: 0, y: 40 }, rotation: Math.PI / 6 })]);
    expect(formesDe(t, "i4")[0]!.type).toBe("polyline");
  });

  it("X.1-01 blocs : redéfinir le bloc se répercute sur toutes ses insertions", () => {
    const d = avecInsertions();
    const nouveaux: StudioShape[] = [{ id: "cadre", type: "rectangle", origin: { x: 0, y: 0 }, width: 0.9, height: 2.1 }, { id: "poignee", type: "circle", center: { x: 0.8, y: 1 }, radius: 0.05 }];
    const r = applyStudioCommands(d, [definir({ nom: "Porte 90", elements: nouveaux, redefinir: true })]);
    expect(r.blocs).toEqual([{ id: "porte", type: "bloc", nom: "Porte 90", base: { x: 0, y: 0 }, elements: nouveaux }]);
    // Les insertions sont inchangées (même pose) ; leur géométrie dérivée suit la nouvelle définition, toutes ensemble.
    expect(r.insertions).toEqual(d.insertions);
    for (const id of ["i1", "i2", "i3"]) expect(formesDe(r, id).map((o) => o.id)).toEqual([`${id}.cadre`, `${id}.poignee`]);
    expect(formesDe(r, "i1")[1]).toMatchObject({ type: "circle", center: { x: 10.8, y: 1 }, radius: 0.05 });
    expect(formesDe(r, "i2")[1]).toMatchObject({ type: "circle", center: { x: 18, y: 6.6 }, radius: 0.1 });
    expect(formesDe(r, "i3")[1]).toMatchObject({ type: "circle", center: { x: 29.2, y: 1 } });
    // Sans « redefinir », une définition existante n'est jamais écrasée.
    expect(refus(() => applyStudioCommands(d, [definir({ elements: nouveaux })]))).toContain("identifiant déjà utilisé");
    // Redéfinition refusée si une insertion est sur un calque verrouillé.
    const verrou = applyStudioCommands(newStudioDocument("v"), [
      { toolId: "studio.calque.creer", params: { id: "c", name: "C", visible: true, locked: false } }, definir(), inserer("iv", { layerId: "c" }),
      { toolId: "studio.calque.modifier", params: { id: "c", name: "C", visible: true, locked: true } },
    ]);
    expect(refus(() => applyStudioCommands(verrou, [definir({ elements: nouveaux, redefinir: true })]))).toContain("calque verrouillé");
  });

  it("X.1-01 blocs : éclater une insertion rend ses formes posées, objets du document", () => {
    const d = avecInsertions();
    const e = applyStudioCommands(d, [{ toolId: "studio.bloc.eclater", params: { ids: ["i2"] } }]);
    expect(e.insertions?.map((i) => i.id)).toEqual(["i1", "i3"]);
    expect(e.objects).toEqual(formesDe(d, "i2"));
    expect(e.objects.map((o) => o.id)).toEqual(["i2.cadre", "i2.battant", "i2.ouverture"]);
    // La définition reste (encore insérée par i1 et i3) ; les objets éclatés sont indépendants : une redéfinition ne les touche pas.
    const r = applyStudioCommands(e, [definir({ elements: [ELEMENTS[1]!], redefinir: true })]);
    expect(r.objects).toEqual(e.objects);
    // Éclater ce qui n'est pas une insertion, ou deux fois, est refusé.
    expect(refus(() => applyStudioCommands(e, [{ toolId: "studio.bloc.eclater", params: { ids: ["i2"] } }]))).toContain("insertion introuvable");
    expect(refus(() => applyStudioCommands(e, [{ toolId: "studio.bloc.eclater", params: { ids: ["i2.cadre"] } }]))).toContain("ce n’est pas une insertion");
  });

  it("X.1-01 blocs : définition depuis la sélection, formes remplacées par une insertion au point de base (dessin identique)", () => {
    const base = applyStudioCommands(newStudioDocument("s"), [
      { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 2, y: 2 }, end: { x: 4, y: 2 } } },
      { toolId: "studio.dessin.cercle", params: { id: "c", type: "circle", center: { x: 3, y: 3 }, radius: 0.5 } },
      { toolId: "studio.dessin.cote", params: { id: "k", type: "dimension", start: { x: 2, y: 2 }, end: { x: 4, y: 2 }, offset: 0.3, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false } },
    ]);
    const d = applyStudioCommands(base, [{ toolId: "studio.bloc.definir", params: { id: "b", nom: "Repère", base: { x: 2, y: 2 }, objets: ["l", "c"], insertion: "ib" } }]);
    expect(d.objects).toEqual([]);
    expect(d.insertions).toEqual([{ id: "ib", type: "insertion", bloc: "b", position: { x: 2, y: 2 }, rotation: 0, echelle: 1 }]);
    // Même dessin : les formes de l'insertion sont celles d'origine (identifiants préfixés).
    expect(formesDe(d, "ib").map(({ id: _i, ...g }) => g)).toEqual(base.objects.map(({ id: _i, ...g }) => g));
    // La cote liée aux formes remplacées passe « à résoudre », jamais rattachée en silence.
    expect(d.dimensions?.[0]).toMatchObject({ id: "k", toResolve: true, links: { start: null, end: null } });
    // Sans insertion : les formes restent, le bloc est une copie.
    const copie = applyStudioCommands(base, [{ toolId: "studio.bloc.definir", params: { id: "b", nom: "Repère", base: { x: 0, y: 0 }, objets: ["l"] } }]);
    expect(copie.objects).toEqual(base.objects);
    expect(copie.blocs?.[0]!.elements).toEqual([base.objects[0]]);
  });

  it("X.1-01 blocs : commandes générales sur les insertions (Déplacer, Rotation, Symétrie, Échelle, Copier, calque, Supprimer)", () => {
    const d = avecInsertions();
    const avant = formesDe(d, "i2");
    const centre = { x: 1, y: 1 };
    const r = applyStudioCommands(d, [{ toolId: "studio.dessin.rotation", params: { ids: ["i2"], center: centre, angle: Math.PI / 3 } }]);
    // La pose composée donne exactement l'image par la rotation de chaque forme posée.
    const t = studioRotation(centre, Math.PI / 3);
    const apres = formesDe(r, "i2");
    expect((apres[1] as { start: { x: number } }).start.x).toBeCloseTo(t.point((avant[1] as { start: { x: number; y: number } }).start).x, 12);
    expect((apres[1] as { end: { y: number } }).end.y).toBeCloseTo(t.point((avant[1] as { end: { x: number; y: number } }).end).y, 12);
    // Symétrie : la pose bascule et l'image reste exacte.
    const sym = studioSymetrie({ x: 0, y: 0 }, { x: 1, y: 1 });
    const ins = d.insertions![0]!, image = studioPoseTransformee(ins, sym);
    expect(image.symetrie).toBe(true);
    const def = d.blocs![0]!;
    const tImage = studioTransformationInsertion(def.base, image), tAvant = studioTransformationInsertion(def.base, ins);
    for (const p of [{ x: 0.3, y: 1.7 }, { x: 1, y: 0 }]) { expect(tImage.point(p).x).toBeCloseTo(sym.point(tAvant.point(p)).x, 12); expect(tImage.point(p).y).toBeCloseTo(sym.point(tAvant.point(p)).y, 12); }
    const s = applyStudioCommands(d, [
      { toolId: "studio.dessin.symetrie", params: { ids: ["i1"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: false } },
      { toolId: "studio.dessin.echelle", params: { ids: ["i1"], center: { x: 0, y: 0 }, factor: 3, includeVolumes: false } },
      { toolId: "studio.dessin.deplacer", params: { id: "i3", dx: 1, dy: 2 } },
      { toolId: "studio.dessin.copier", params: { ids: ["i3"], dx: 5, dy: 0, copies: 2, prefix: "cp" } },
      { toolId: "studio.calque.creer", params: { id: "c2", name: "Portes", visible: true, locked: false } },
      { toolId: "studio.objet.calque", params: { ids: ["i2"], layerId: "c2" } },
    ]);
    expect(s.insertions?.find((x) => x.id === "i1")).toEqual({ id: "i1", type: "insertion", bloc: "porte", position: { x: -30, y: 0 }, rotation: 0, echelle: 3, symetrie: true });
    expect(s.insertions?.find((x) => x.id === "i3")?.position).toEqual({ x: 31, y: 2 });
    expect(s.insertions?.filter((x) => x.id.startsWith("cp")).map((x) => [x.id, x.position.x])).toEqual([["cp-1-0", 36], ["cp-2-0", 41]]);
    expect(s.insertions?.find((x) => x.id === "i2")?.layerId).toBe("c2");
    // Supprimer : une insertion se retire ; la définition encore insérée est refusée, puis retirée quand plus rien ne l'insère.
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["porte"] } }]))).toContain("encore inséré");
    const vide = applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["i1", "i2", "i3", "porte"] } }]);
    expect(vide).not.toHaveProperty("blocs");
    expect(vide).not.toHaveProperty("insertions");
    // Nouvelle pose d'une insertion par Insérer (modifier).
    const m = applyStudioCommands(d, [{ toolId: "studio.bloc.inserer", params: { id: "i1", type: "insertion", bloc: "porte", position: { x: 1, y: 1 }, rotation: Math.PI / 2, echelle: 0.5, symetrie: true, modifier: true } }]);
    expect(m.insertions?.[0]).toEqual({ id: "i1", type: "insertion", bloc: "porte", position: { x: 1, y: 1 }, rotation: Math.PI / 2, echelle: 0.5, symetrie: true });
  });

  it("X.1-01 blocs : refus explicites (définition vide, élément extrudé ou sur un calque, nom répété, bloc absent, échelle nulle, rotation hors [0 ; 2π[, insertion inconnue)", () => {
    const d = avecInsertions();
    const essai = (c: StudioCommand) => refus(() => applyStudioCommands(d, [c]));
    expect(essai(definir({ id: "x", nom: "X", elements: [] }))).toContain("au moins un élément");
    expect(essai(definir({ id: "x", nom: "X", elements: [{ ...ELEMENTS[0]!, extrusion: { base: 0, height: 1 } }] }))).toContain("pas extrudé");
    expect(essai(definir({ id: "x", nom: "X", elements: [{ ...ELEMENTS[0]!, layerId: "c" }] }))).toContain("pas de calque");
    expect(essai(definir({ id: "x", nom: " porte " }))).toContain("espace de bord");
    expect(essai(definir({ id: "x", nom: "PORTE" }))).toContain("nom de bloc déjà employé");
    expect(essai(definir({ id: "x", nom: "X", elements: ELEMENTS, objets: ["a"] }))).toContain("l’un ou l’autre");
    expect(essai(definir({ id: "x", nom: "X", redefinir: true }))).toContain("définition de bloc introuvable");
    expect(essai({ toolId: "studio.bloc.inserer", params: { id: "j", type: "insertion", bloc: "absent", position: { x: 0, y: 0 }, rotation: 0, echelle: 1 } })).toContain("définition de bloc introuvable");
    expect(essai(inserer("j", { echelle: 0 }))).toContain("échelle strictement positive");
    expect(essai(inserer("j", { rotation: 7 }))).toContain("[0 ; 2π[");
    expect(essai(inserer("i1"))).toContain("identifiant déjà utilisé");
    expect(essai({ toolId: "studio.bloc.inserer", params: { id: "zz", type: "insertion", bloc: "porte", position: { x: 0, y: 0 }, rotation: 0, echelle: 1, modifier: true } })).toContain("insertion introuvable");
    // Document : insertion orpheline ou nom répété refusés à la lecture.
    expect(refus(() => validateStudioDocument({ ...d, blocs: [] }))).toContain("définition de bloc introuvable");
    expect(refus(() => validateStudioDocument({ ...d, blocs: [d.blocs![0]!, { ...d.blocs![0]!, id: "autre" }] }))).toContain("nom de bloc répété");
  });

  it("X.1-01 blocs : un document antérieur reste valide et relu à l'identique (extension facultative, forme canonique)", () => {
    const ancien = applyStudioCommands(newStudioDocument("a"), [{ toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }]);
    expect(ancien).not.toHaveProperty("blocs");
    expect(JSON.stringify(validateStudioDocument(JSON.parse(JSON.stringify(ancien))))).toBe(JSON.stringify(ancien));
    // Symétrie fausse non stockée (forme canonique).
    const f = applyStudioCommands(newStudioDocument("f"), [definir(), inserer("i", { symetrie: false as never })]);
    expect(f.insertions?.[0]).not.toHaveProperty("symetrie");
    const def: StudioDefinitionBloc = f.blocs![0]!;
    expect(def.type).toBe("bloc");
  });
});

describe("X.1-01 — blocs dans les échanges (SVG, DXF BLOCK / INSERT, rapport de fidélité)", () => {
  it("X.1-01 blocs : DXF écrit BLOCKS / INSERT et relu en définition et insertions identiques (aller-retour), SVG développé", () => {
    const d = avecInsertions();
    const dxf = exportStudioDxf(d);
    expect(dxf).toContain("\r\nBLOCKS\r\n");
    expect(dxf.match(/\r\nINSERT\r\n/g)).toHaveLength(3);
    expect(dxf).toContain("\r\nPORTE\r\n");
    // Symétrie : facteur x négatif (41 = −1, 42 = 1).
    expect(dxf).toMatch(/INSERT\r\n8\r\n0\r\n2\r\nPORTE\r\n10\r\n30\r\n20\r\n0\r\n30\r\n0\r\n41\r\n-1\r\n42\r\n1/);
    const relu = lireDxfStudio(dxf);
    expect(relu.statut).toBe("pret");
    expect(relu.rapport.entites).toMatchObject({ insertions: 3, blocs: 1 });
    const r = applyStudioCommands(newStudioDocument("r"), relu.commandes);
    expect(r.blocs).toHaveLength(1);
    expect(r.blocs![0]!.nom).toBe("PORTE");
    expect(r.blocs![0]!.base).toEqual(d.blocs![0]!.base);
    expect(r.blocs![0]!.elements.map(({ id: _i, ...g }) => g)).toEqual(d.blocs![0]!.elements.map(({ id: _i, ...g }) => g));
    expect(r.insertions!.map(({ id: _i, bloc: _b, ...pose }) => pose)).toEqual(d.insertions!.map(({ id: _i, bloc: _b, ...pose }) => pose));
    // Relire le même fichier dans le document importé reprend la définition (mêmes éléments, même nom) : aucun doublon.
    const encore = lireDxfStudio(dxf, { document: r });
    expect(encore.commandes.filter((c) => c.toolId === "studio.bloc.definir")).toEqual([]);
    // SVG : un groupe par insertion, formes de la définition posées.
    const svg = exportStudioSvg(d);
    expect(svg.match(/data-insertion="/g)).toHaveLength(3);
    expect(svg).toContain('data-bloc="porte" data-bloc-nom="Porte"');
    // Rapport de fidélité : bloc en BLOCK (DXF exact), développé en SVG (approché), hors IFC.
    const ligne = (f: "svg" | "dxf" | "ifc", type: string) => studioRapportFidelite(d, f).lignes.find((l) => l.type === type);
    expect(ligne("dxf", "bloc")).toMatchObject({ statut: "exact", raison: "bloc-en-block", ids: ["porte"] });
    expect(ligne("dxf", "insertion")).toMatchObject({ statut: "exact", raison: "insertion-en-insert", nombre: 3 });
    expect(ligne("svg", "bloc")).toMatchObject({ statut: "approche", raison: "bloc-developpe" });
    expect(ligne("ifc", "insertion")).toMatchObject({ statut: "non-couvert", raison: "bloc-hors-ifc" });
  });

  it("X.1-01 blocs : import DXF — INSERT à attributs, en réseau, à échelle non uniforme ou d'un bloc non représentable compté, jamais deviné", () => {
    const bloc = (nom: string, corps: string) => `0\r\nBLOCK\r\n8\r\n0\r\n2\r\n${nom}\r\n70\r\n0\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n3\r\n${nom}\r\n${corps}0\r\nENDBLK\r\n8\r\n0\r\n`;
    const ligneDxf = "0\r\nLINE\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n11\r\n1\r\n21\r\n0\r\n";
    const texte = (entites: string) => `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$INSUNITS\r\n70\r\n6\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nBLOCKS\r\n${bloc("OK", ligneDxf)}${bloc("TXT", "0\r\nTEXT\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n1\r\n1\r\nA\r\n")}0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n${entites}0\r\nENDSEC\r\n0\r\nEOF\r\n`;
    const ins = (nom: string, extra = "") => `0\r\nINSERT\r\n8\r\n0\r\n2\r\n${nom}\r\n10\r\n5\r\n20\r\n5\r\n${extra}`;
    const r = lireDxfStudio(texte(ins("OK", "41\r\n2\r\n42\r\n2\r\n50\r\n90\r\n") + ins("OK", "41\r\n1\r\n42\r\n2\r\n") + ins("OK", "70\r\n3\r\n") + ins("TXT") + ins("ABSENT")), { conserverNonNatifs: true });
    expect(r.rapport.entites.insertions).toBe(1);
    expect(r.rapport.nonPris).toEqual([{ type: "INSERT", nombre: 4 }]);
    expect(r.rapport.nonNatifs).toBe(4);
    const posee = r.commandes.find((c) => c.toolId === "studio.bloc.inserer")!.params as StudioInsertionBloc;
    expect(posee).toMatchObject({ position: { x: 5, y: 5 }, echelle: 2 });
    expect(posee.rotation).toBeCloseTo(Math.PI / 2, 12);
    const detail = r.commandes.filter((c) => c.toolId === "studio.nonnatif.conserver").map((c) => (c.params as { detail?: string }).detail);
    expect(detail).toEqual(["codes 41 / 42 (échelle nulle ou non uniforme)", "codes 70 / 71 (réseau de blocs)", undefined, undefined]);
  });
});
