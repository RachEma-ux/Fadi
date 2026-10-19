import { describe, expect, it } from "vitest";
import { comparerDocumentsStudio } from "./comparaison.js";
import {
  applyStudioCommands, formatStudioAngle, measureStudioAngularDimension, newStudioDocument, studioAngularFromSegments, studioAngularValue, studioStraightSegment,
  StudioValidationError, validateStudioDocument, type StudioAngularDimension, type StudioCommand, type StudioDocument, type StudioText,
} from "./document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "./export.js";
import { composerFeuilleStudio, studioSheetPrimitives } from "./feuille.js";
import { exportStudioIfc, studioIfcSummary } from "./ifc.js";
import { STUDIO_TOOLS } from "./registry.js";

/** Annotations de Studio : cote angulaire (libre ou liée à deux segments) et texte. */

const lignes = (): StudioDocument => applyStudioCommands(newStudioDocument("doc"), [
  { toolId: "studio.calque.creer", params: { id: "notes", name: "Notes", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 3 } } },
]);
const liee = (over: Partial<StudioAngularDimension> = {}): StudioAngularDimension => ({
  id: "ang", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 4, y: 0 }, second: { x: 0, y: 3 }, radius: 1,
  links: { first: { objectId: "l1", segment: 0 }, second: { objectId: "l2", segment: 0 } }, toResolve: false, ...over,
});
const libre = (over: Partial<StudioAngularDimension> = {}): StudioAngularDimension => ({
  id: "libre", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 2, y: 0 }, second: { x: 0, y: 2 }, radius: 1,
  links: { first: null, second: null }, toResolve: false, ...over,
});
const texte = (over: Partial<StudioText> = {}): StudioText => ({
  id: "t1", type: "text", layerId: "notes", position: { x: 1, y: 2 }, height: 0.5, rotation: Math.PI / 2, content: "Séjour <nord>", justification: "center", ...over,
});
const apply = (doc: StudioDocument, commands: unknown[]) => applyStudioCommands(doc, commands as StudioCommand[]);
const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};
const avecLiee = () => apply(lignes(), [{ toolId: "studio.dessin.cote-angulaire", params: liee() }]);
const ann = (doc: StudioDocument, id: string) => doc.annotations!.find((a) => a.id === id)!;

describe("Annotations — registre", () => {
  it("Cote angulaire (Maj+A) et Texte (Maj+T) : barre Dessin, icônes et raccourcis propres", () => {
    const t = (id: string) => STUDIO_TOOLS.find((x) => x.toolId === id)!;
    expect([t("studio.dessin.cote-angulaire").raccourci, t("studio.dessin.cote-angulaire").iconeSymbolique, t("studio.dessin.cote-angulaire").groupe]).toEqual(["Shift+A", "studio-angular-dimension", "dessin"]);
    expect([t("studio.dessin.texte").raccourci, t("studio.dessin.texte").iconeSymbolique, t("studio.dessin.texte").groupe]).toEqual(["Shift+T", "studio-text", "dessin"]);
  });
});

describe("Annotations — document", () => {
  it("forme canonique : sans annotation, le champ est omis ; un document antérieur reste identique", () => {
    const d = lignes();
    expect("annotations" in d).toBe(false);
    expect(validateStudioDocument({ ...d, annotations: [] })).toEqual(d);
  });

  it("identifiants uniques entre objets, cotes et annotations ; calque connu", () => {
    expect(refus(() => apply(lignes(), [{ toolId: "studio.dessin.texte", params: texte({ id: "l1" }) }]))).toBe("commands[0] : identifiant déjà utilisé");
    expect(refus(() => validateStudioDocument({ ...lignes(), annotations: [texte({ layerId: "inconnu" })] }))).toBe("studioDocument.annotations : calque inconnu");
    expect(refus(() => validateStudioDocument({ ...lignes(), annotations: [{ ...texte(), type: "note" }] }))).toBe("studioDocument.annotations[0].type : type d’annotation non pris en charge");
  });
});

describe("Annotations — texte", () => {
  it("créé sur son calque, contenu gardé tel quel (donnée du projet, jamais traduite), relu à l'identique", () => {
    const d = apply(lignes(), [{ toolId: "studio.dessin.texte", params: texte() }]);
    expect(d.annotations).toEqual([texte()]);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("refus : contenu vide, multiligne, de plus de 500 caractères ; hauteur, rotation, justification", () => {
    const creer = (o: Partial<StudioText> | Record<string, unknown>) => () => apply(lignes(), [{ toolId: "studio.dessin.texte", params: { ...texte(), ...o } }]);
    expect(refus(creer({ content: "  " }))).toBe("commands[0].params.content : texte non vide attendu");
    expect(refus(creer({ content: "a\nb" }))).toBe("commands[0].params.content : une seule ligne, sans caractère de contrôle");
    expect(refus(creer({ content: "é".repeat(501) }))).toBe("commands[0].params.content : 500 caractères au plus");
    expect(apply(lignes(), [{ toolId: "studio.dessin.texte", params: texte({ content: "😀".repeat(500) }) }]).annotations).toHaveLength(1);
    expect(refus(creer({ height: 0 }))).toBe("commands[0].params.height : hauteur strictement positive attendue");
    expect(refus(creer({ rotation: 7 }))).toBe("commands[0].params.rotation : angle en radians dans [0 ; 2π[ attendu");
    expect(refus(creer({ justification: "justify" }))).toBe("commands[0].params.justification : justification left, center ou right attendue");
    expect(refus(creer({ police: "Arial" }))).toBe("commands[0].params : champs absents ou inconnus");
  });

  it("modifié par studio.dessin.modifier, déplacé, placé sur un autre calque, supprimé ; calque verrouillé refusé", () => {
    let d = apply(lignes(), [{ toolId: "studio.dessin.texte", params: texte() }]);
    d = apply(d, [{ toolId: "studio.dessin.modifier", params: texte({ content: "Chambre 2", justification: "left", height: 0.3 }) }]);
    expect(ann(d, "t1")).toEqual(texte({ content: "Chambre 2", justification: "left", height: 0.3 }));
    d = apply(d, [{ toolId: "studio.dessin.deplacer", params: { id: "t1", dx: 1, dy: -0.5 } }]);
    expect((ann(d, "t1") as StudioText).position).toEqual({ x: 2, y: 1.5 });
    const { layerId: _calque, ...surImplicite } = texte();
    expect(refus(() => apply(d, [{ toolId: "studio.dessin.modifier", params: surImplicite }]))).toBe("commands[0] : le calque se change par studio.objet.calque");
    expect(refus(() => apply(d, [{ toolId: "studio.dessin.modifier", params: { id: "t1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }]))).toBe("commands[0] : objet introuvable");
    expect(refus(() => apply(d, [{ toolId: "studio.dessin.modifier", params: liee({ id: "t1" }) }]))).toBe("commands[0] : le type de l’objet ne peut pas changer");
    const surDefaut = apply(d, [{ toolId: "studio.objet.calque", params: { ids: ["t1"], layerId: "default" } }]);
    expect(ann(surDefaut, "t1").layerId).toBeUndefined();
    const verrouille = apply(d, [{ toolId: "studio.calque.modifier", params: { id: "notes", name: "Notes", visible: true, locked: true } }]);
    expect(refus(() => apply(verrouille, [{ toolId: "studio.dessin.deplacer", params: { id: "t1", dx: 1, dy: 0 } }]))).toBe("commands[0] : calque verrouillé");
    expect(apply(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["t1"] } }]).annotations).toBeUndefined();
  });
});

describe("Annotations — cote angulaire", () => {
  it("libre : angle dérivé du premier rayon au second (sens trigonométrique), jamais stocké", () => {
    const d = apply(lignes(), [{ toolId: "studio.dessin.cote-angulaire", params: libre() }]);
    expect(ann(d, "libre")).toEqual(libre());
    expect(measureStudioAngularDimension(d, "libre")).toEqual({ id: "libre", status: "resolved", value: 90, unit: "deg", frame: "local-2d" });
    expect(studioAngularValue(libre({ first: { x: 0, y: 2 }, second: { x: 2, y: 0 } }))).toBe(270);
    expect(studioAngularValue(libre({ second: { x: -2, y: 0 } }))).toBe(180);
    expect(measureStudioAngularDimension(d, "l1")).toBeNull();
  });

  it("formatage des degrés selon la langue", () => {
    expect(formatStudioAngle(90)).toBe("90,00°");
    expect(formatStudioAngle(33.6900675, "en-US")).toBe("33.69°");
    expect(formatStudioAngle(1234.5)).toBe("1234,50°");
  });

  it("refus : rayon nul, rayons confondus, lien partiel, état à résoudre saisi, rayon d'arc", () => {
    const creer = (p: unknown) => () => apply(lignes(), [{ toolId: "studio.dessin.cote-angulaire", params: p }]);
    expect(refus(creer(libre({ first: { x: 0, y: 0 } })))).toBe("commands[0].params : chaque rayon doit partir du sommet vers un point distinct");
    expect(refus(creer(libre({ second: { x: 5, y: 0 } })))).toBe("commands[0].params : les deux rayons sont confondus : angle nul");
    expect(refus(creer(libre({ radius: 0 })))).toBe("commands[0].params.radius : rayon strictement positif attendu");
    expect(refus(creer(liee({ links: { first: { objectId: "l1", segment: 0 }, second: null } })))).toBe("commands[0].params.links : une cote angulaire liée l’est à deux segments");
    expect(refus(creer(liee({ links: { first: { objectId: "l1", segment: 0 }, second: null }, toResolve: true })))).toBe("commands[0].params.toResolve : l’état à résoudre naît d’une suppression, il n’est jamais saisi");
    expect(refus(creer(liee({ links: { first: { objectId: "l1", segment: 1 }, second: { objectId: "l2", segment: 0 } } })))).toBe("commands[0].params.links.first.segment : segment droit introuvable sur l’objet lié");
    expect(refus(creer(liee({ links: { first: { objectId: "l1", segment: 1.5 }, second: { objectId: "l2", segment: 0 } } })))).toBe("commands[0].params.links.first.segment : index de segment entier positif attendu");
    expect(refus(creer(liee({ second: { x: 0, y: 2 } })))).toBe("commands[0].params : géométrie différente des segments liés");
    expect(refus(creer(liee({ links: { first: { objectId: "absent", segment: 0 }, second: { objectId: "l2", segment: 0 } } })))).toBe("commands[0].params.links.first : objet lié introuvable");
  });

  it("liée à deux lignes : sommet à l'intersection, extrémités les plus éloignées, 90°", () => {
    const g = studioAngularFromSegments({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 3 } });
    expect(g).toEqual({ vertex: { x: 0, y: 0 }, first: { x: 4, y: 0 }, second: { x: 0, y: 3 } });
    expect(studioAngularFromSegments({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 1 }, b: { x: 4, y: 1 } })).toBeNull();
    const d = avecLiee();
    expect(measureStudioAngularDimension(d, "ang")!.value).toBe(90);
  });

  it("la ligne liée bouge : la cote suit (translation : sommet déplacé ; modification : angle mis à jour)", () => {
    let d = avecLiee();
    d = apply(d, [{ toolId: "studio.dessin.deplacer", params: { id: "l2", dx: 1, dy: 0 } }]);
    expect(ann(d, "ang")).toMatchObject({ vertex: { x: 1, y: 0 }, first: { x: 4, y: 0 }, second: { x: 1, y: 3 }, toResolve: false });
    expect(measureStudioAngularDimension(d, "ang")!.value).toBe(90);
    d = apply(d, [{ toolId: "studio.dessin.modifier", params: { id: "l2", type: "line", start: { x: 1, y: 0 }, end: { x: 4, y: 3 } } }]);
    expect(ann(d, "ang")).toMatchObject({ vertex: { x: 1, y: 0 }, first: { x: 4, y: 0 }, second: { x: 4, y: 3 } });
    expect(measureStudioAngularDimension(d, "ang")!.value).toBeCloseTo(45, 12);
    expect(refus(() => apply(d, [{ toolId: "studio.dessin.modifier", params: { id: "l2", type: "line", start: { x: 0, y: 1 }, end: { x: 4, y: 1 } } }])))
      .toBe("commands[0] : la cote angulaire liée ang deviendrait indéterminée (segments parallèles)");
    expect(refus(() => apply(d, [{ toolId: "studio.dessin.deplacer", params: { id: "ang", dx: 1, dy: 0 } }]))).toBe("commands[0] : une cote angulaire liée suit ses segments et ne se déplace pas seule");
  });

  it("intégration avec les transformations : Rotation, Symétrie et Échelle sur place font suivre la cote liée", () => {
    const d = avecLiee();
    const tourne = apply(d, [{ toolId: "studio.dessin.rotation", params: { ids: ["l2"], center: { x: 0, y: 0 }, angle: -Math.PI / 4 } }]);
    expect(measureStudioAngularDimension(tourne, "ang")!.value).toBeCloseTo(45, 9);
    const miroir = apply(d, [{ toolId: "studio.dessin.symetrie", params: { ids: ["l1", "l2"], axisStart: { x: 5, y: 0 }, axisEnd: { x: 5, y: 1 }, keepSource: false } }]);
    expect(ann(miroir, "ang")).toMatchObject({ vertex: { x: 10, y: 0 } });
    expect(measureStudioAngularDimension(miroir, "ang")!.value).toBeCloseTo(90, 9);
    const agrandi = apply(d, [{ toolId: "studio.dessin.echelle", params: { ids: ["l1", "l2"], center: { x: 1, y: 1 }, factor: 2, includeVolumes: false } }]);
    expect(ann(agrandi, "ang")).toMatchObject({ vertex: { x: -1, y: -1 } });
    expect(validateStudioDocument(JSON.parse(JSON.stringify(agrandi)))).toEqual(agrandi);
  });

  it("la ligne liée est supprimée : la cote passe « à résoudre », garde sa géométrie, valeur non évaluée", () => {
    const avant = avecLiee();
    const d = apply(avant, [{ toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } }]);
    expect(ann(d, "ang")).toEqual({ ...liee(), links: { first: { objectId: "l1", segment: 0 }, second: null }, toResolve: true });
    expect(measureStudioAngularDimension(d, "ang")).toEqual({ id: "ang", status: "to-resolve", value: null, unit: "deg", frame: "local-2d" });
    // Figée : la ligne restante peut bouger, la cote à résoudre ne la suit plus ; supprimée ensuite, l'autre lien se rompt.
    const bouge = apply(d, [{ toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 0, dy: 1 } }]);
    expect(ann(bouge, "ang")).toEqual(ann(d, "ang"));
    expect((ann(apply(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }]), "ang") as StudioAngularDimension).links).toEqual({ first: null, second: null });
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("liée à un segment de polyligne ; segment courbe refusé", () => {
    const poly = apply(lignes(), [{ toolId: "studio.dessin.polyligne", params: { id: "p", type: "polyline", points: [{ x: 5, y: 0 }, { x: 5, y: 2 }, { x: 7, y: 2 }], closed: false, bulges: [0, 0.5] } }]);
    const pObj = poly.objects.find((o) => o.id === "p")!;
    expect(studioStraightSegment(pObj, 1)).toBeNull();
    const g = studioAngularFromSegments(studioStraightSegment(poly.objects[0]!, 0)!, studioStraightSegment(pObj, 0)!)!;
    expect(g).toEqual({ vertex: { x: 5, y: 0 }, first: { x: 0, y: 0 }, second: { x: 5, y: 2 } });
    const d = apply(poly, [{ toolId: "studio.dessin.cote-angulaire", params: { ...liee({ ...g, links: { first: { objectId: "l1", segment: 0 }, second: { objectId: "p", segment: 0 } } }) } }]);
    expect(measureStudioAngularDimension(d, "ang")!.value).toBe(270);
  });
});

describe("Annotations — exports", () => {
  const doc = () => apply(avecLiee(), [
    { toolId: "studio.dessin.cote-angulaire", params: libre() },
    { toolId: "studio.dessin.texte", params: texte() },
  ]);

  it("SVG : arc et libellé de la cote angulaire, texte tel quel sur son calque", () => {
    const svg = exportStudioSvg(doc());
    expect(svg).toContain('<g data-angular-dimension="libre" data-status="resolved" data-value="90">\n<path d="M 1 0 A 1 1 0 0 0 0 -1" vector-effect="non-scaling-stroke"/>\n<text x="0.848528" y="-0.848528" font-size="0.25" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="none" transform="rotate(45 0.848528 -0.848528)">90,00°</text>\n</g>');
    expect(svg).toContain('<g data-layer="notes" data-name="Notes" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke">\n<text data-text="t1" data-justification="center" x="1" y="-2" font-size="0.5" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="none" transform="rotate(-90 1 -2)">Séjour &lt;nord&gt;</text>\n</g>');
    expect(exportStudioSvg(doc(), { locale: "en-US" })).toContain(">90.00°</text>");
  });

  it("DXF : TEXT justifié et tourné ; cote angulaire en ARC + TEXT ; « à résoudre » après suppression", () => {
    const dxf = exportStudioDxf(doc());
    expect(dxf).toContain(["0", "TEXT", "8", "NOTES", "10", "1", "20", "2", "30", "0", "40", "0.5", "1", "S\\U+00E9jour <nord>", "50", "90", "72", "1", "11", "1", "21", "2", "31", "0"].join("\r\n"));
    expect(dxf).toContain(["0", "ARC", "8", "0", "10", "0", "20", "0", "30", "0", "40", "1", "50", "0", "51", "90"].join("\r\n"));
    expect(dxf).toContain(["1", "90,00\\U+00B0"].join("\r\n"));
    const gauche = exportStudioDxf(apply(doc(), [{ toolId: "studio.dessin.modifier", params: texte({ justification: "left", rotation: 0 }) }]));
    // Justifié à gauche, sans rotation : ni 50, ni 72, ni point d'alignement 11.
    expect(gauche).toContain(["40", "0.5", "1", "S\\U+00E9jour <nord>", "0", "ENDSEC"].join("\r\n"));
    const resoudre = exportStudioDxf(apply(doc(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }]));
    expect(resoudre).toContain("\\U+00E0 r\\U+00E9soudre");
    expect(exportStudioSvg(apply(doc(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }]))).toContain('<g data-angular-dimension="ang" data-status="to-resolve">');
  });

  it("IFC : annotations non exportées, comptées explicitement", () => {
    expect(studioIfcSummary(doc()).annotations).toBe(3);
    expect(studioIfcSummary(lignes()).annotations).toBeUndefined();
    expect(exportStudioIfc(doc(), { studyName: "S", variantName: "V", timestamp: "2026-10-19T00:00:00" })).toContain("IFCPROPERTYSINGLEVALUE('AnnotationsNotExported',$,IFCINTEGER(3),$)");
  });

  it("feuille : texte à sa hauteur réelle à l'échelle, libellé de la cote angulaire", () => {
    const sheet = composerFeuilleStudio(doc(), { format: "A3", orientation: "paysage", scale: 50 });
    const prims = studioSheetPrimitives(sheet).filter((p) => p.type === "texte");
    expect(prims.find((p) => p.objetId === "t1")).toMatchObject({ texte: "Séjour <nord>", hauteurMm: 10, ancre: "milieu", angle: 90 });
    expect(prims.find((p) => p.objetId === "libre")).toMatchObject({ texte: "90,00°", angle: -45 });
    // Arc discrétisé (64 segments par tour : 16 pour un quart), découpé en traits.
    expect(studioSheetPrimitives(sheet).filter((p) => p.type === "ligne" && p.objetId === "ang")).toHaveLength(16);
  });

  it("comparaison : famille « annotations » présente seulement quand l'un des documents en a", () => {
    expect("annotations" in comparerDocumentsStudio(lignes(), lignes())).toBe(false);
    const a = doc();
    const b = apply(a, [
      { toolId: "studio.dessin.modifier", params: texte({ content: "Salon" }) },
      { toolId: "studio.dessin.deplacer", params: { id: "libre", dx: 1, dy: 2 } },
      { toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } },
    ]);
    const d = comparerDocumentsStudio(a, b);
    expect(d.annotations!.map((x) => [x.id, x.etat, x.proprietes, x.deplacement])).toEqual([
      ["ang", "modifie", ["liens"], null], ["libre", "modifie", ["geometrie"], { dx: 1, dy: 2 }], ["t1", "modifie", ["contenu"], null],
    ]);
    expect(d.resume.annotations).toEqual({ ajoute: 0, supprime: 0, modifie: 3, identique: 0, deplace: 1 });
    expect(d.identiques).toBe(false);
    expect(comparerDocumentsStudio(a, a).identiques).toBe(true);
  });
});
