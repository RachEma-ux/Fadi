import { describe, expect, it } from "vitest";
import { applyStudioCommands, measureStudioDimension, newStudioDocument, StudioValidationError, type StudioDocument } from "./document-2d.js";
import { exportStudioDxf, exportStudioSvg, formatStudioLength, studioDxfLayerNames } from "./export.js";

/** Petit document : une ligne (calque implicite), un rectangle sur « Murs extérieurs », une cote liée à la ligne. */
const small = (): StudioDocument => ({
  id: "doc-1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  objects: [
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
    { id: "r1", type: "rectangle", layerId: "murs", origin: { x: 1, y: 1 }, width: 2, height: 1 },
  ],
  layers: [{ id: "murs", name: "Murs extérieurs", visible: true, locked: false }],
  dimensions: [{
    id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: -0.5,
    links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false,
  }],
});

const count = (text: string, needle: RegExp): number => text.match(needle)?.length ?? 0;
/** Paires (code, valeur) d'un DXF ASCII. */
function pairs(dxf: string): [number, string][] {
  const lines = dxf.split("\r\n");
  expect(lines.pop()).toBe("");
  expect(lines.length % 2).toBe(0);
  const out: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) out.push([Number(lines[i]), lines[i + 1]!]);
  return out;
}
const entities = (dxf: string): string[] => {
  const p = pairs(dxf);
  const start = p.findIndex(([c, v], i) => c === 2 && v === "ENTITIES" && p[i - 1]?.[1] === "SECTION");
  const end = p.findIndex(([c, v], i) => i > start && c === 0 && v === "ENDSEC");
  return p.slice(start + 1, end).filter(([c]) => c === 0).map(([, v]) => v);
};
const layerTable = (dxf: string): { name: string; flags: string; color: string }[] => {
  const p = pairs(dxf);
  const out: { name: string; flags: string; color: string }[] = [];
  p.forEach(([c, v], i) => {
    if (c === 0 && v === "LAYER") out.push({ name: p[i + 1]![1], flags: p[i + 2]![1], color: p[i + 3]![1] });
  });
  return out;
};

describe("Studio : export SVG", () => {
  it("instantané exact d'un petit document", () => {
    expect(exportStudioSvg(small())).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -2.5 5 3.5" data-schema="studio-document/1" data-document="doc-1" data-units="m" data-frame="local-2d">
      <g data-layer="default" data-name="0" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke">
      <line data-id="l1" x1="0" y1="0" x2="4" y2="0" vector-effect="non-scaling-stroke"/>
      <g data-dimension="c1" data-status="resolved" data-value="4">
      <line x1="0" y1="0.5" x2="4" y2="0.5" vector-effect="non-scaling-stroke"/>
      <line x1="0" y1="0" x2="0" y2="0.5" vector-effect="non-scaling-stroke"/>
      <line x1="4" y1="0" x2="4" y2="0.5" vector-effect="non-scaling-stroke"/>
      <text x="2" y="0.425" font-size="0.25" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="none">4,00 m</text>
      </g>
      </g>
      <g data-layer="murs" data-name="Murs extérieurs" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke">
      <rect data-id="r1" x="1" y="-2" width="2" height="1" vector-effect="non-scaling-stroke"/>
      </g>
      </svg>
      "
    `);
  });

  it("est déterministe et n'altère pas le document", () => {
    const doc = small();
    const before = JSON.stringify(doc);
    expect(exportStudioSvg(doc)).toBe(exportStudioSvg(JSON.parse(before)));
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("valeur mesurée identique à measureStudioDimension, formatée selon la langue", () => {
    const doc = small();
    const measure = measureStudioDimension(doc, "c1");
    expect(measure?.value).toBe(4);
    expect(exportStudioSvg(doc)).toContain(`>${formatStudioLength(4)}</text>`);
    expect(formatStudioLength(4)).toBe("4,00 m");
    expect(formatStudioLength(1234.5678)).toBe("1234,568 m");
    expect(exportStudioSvg(doc, { locale: "en-GB" })).toContain(">4.00 m</text>");
    expect(() => exportStudioSvg(doc, { locale: "pas une langue !" })).toThrow(StudioValidationError);
  });

  it("calques en <g data-layer>, calque masqué sous display=none et hors des bornes", () => {
    const doc = small();
    doc.layers![0]!.visible = false;
    doc.objects[1] = { id: "r1", type: "rectangle", layerId: "murs", origin: { x: 100, y: 100 }, width: 2, height: 1 };
    const svg = exportStudioSvg(doc, { margin: 0 });
    expect(count(svg, /<g data-layer=/g)).toBe(2);
    expect(svg).toContain('<g data-layer="murs" data-name="Murs extérieurs" display="none"');
    expect(svg).toContain('<rect data-id="r1"');
    // Bornes des seuls éléments visibles : ligne et cote (texte compris), pas le rectangle masqué à (100 ; 100).
    expect(svg).toMatch(/viewBox="0 0 4 0\.5"/);
  });

  it("cote à résoudre marquée, sans valeur", () => {
    const doc = applyStudioCommands(small(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }]);
    const svg = exportStudioSvg(doc);
    expect(svg).toContain('<g data-dimension="c1" data-status="to-resolve">');
    expect(svg).toContain(">à résoudre</text>");
    expect(svg).not.toContain("data-value");
  });

  it("échappe identifiants et noms", () => {
    const doc = small();
    doc.id = `a"<&>'b`;
    doc.layers![0]!.name = `<script>&"x"`;
    const svg = exportStudioSvg(doc);
    expect(svg).toContain('data-document="a&quot;&lt;&amp;&gt;&apos;b"');
    expect(svg).toContain('data-name="&lt;script&gt;&amp;&quot;x&quot;"');
    expect(svg).not.toContain("<script>");
  });

  it("document vide : vue de la marge seule autour de l'origine", () => {
    expect(exportStudioSvg(newStudioDocument("vide"))).toContain('viewBox="-0.5 -0.5 1 1"');
  });

  it("refuse un document invalide", () => {
    expect(() => exportStudioSvg({ ...small(), units: "mm" } as unknown as StudioDocument)).toThrow(StudioValidationError);
  });
});

describe("Studio : export DXF R12", () => {
  it("instantané exact d'un petit document", () => {
    expect(exportStudioDxf(small()).split("\r\n")).toMatchInlineSnapshot(`
      [
        "999",
        "Fadi Studio - document doc-1",
        "999",
        "studio-document/1 - repere local-2d, metres",
        "0",
        "SECTION",
        "2",
        "HEADER",
        "9",
        "$ACADVER",
        "1",
        "AC1009",
        "9",
        "$INSUNITS",
        "70",
        "6",
        "0",
        "ENDSEC",
        "0",
        "SECTION",
        "2",
        "TABLES",
        "0",
        "TABLE",
        "2",
        "LTYPE",
        "70",
        "1",
        "0",
        "LTYPE",
        "2",
        "CONTINUOUS",
        "70",
        "0",
        "3",
        "Solid line",
        "72",
        "65",
        "73",
        "0",
        "40",
        "0",
        "0",
        "ENDTAB",
        "0",
        "TABLE",
        "2",
        "LAYER",
        "70",
        "2",
        "0",
        "LAYER",
        "2",
        "0",
        "70",
        "0",
        "62",
        "7",
        "6",
        "CONTINUOUS",
        "0",
        "LAYER",
        "2",
        "MURS_EXTERIEURS",
        "70",
        "0",
        "62",
        "7",
        "6",
        "CONTINUOUS",
        "0",
        "ENDTAB",
        "0",
        "ENDSEC",
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LINE",
        "8",
        "0",
        "10",
        "0",
        "20",
        "0",
        "30",
        "0",
        "11",
        "4",
        "21",
        "0",
        "31",
        "0",
        "0",
        "POLYLINE",
        "8",
        "MURS_EXTERIEURS",
        "66",
        "1",
        "10",
        "0",
        "20",
        "0",
        "30",
        "0",
        "70",
        "1",
        "0",
        "VERTEX",
        "8",
        "MURS_EXTERIEURS",
        "10",
        "1",
        "20",
        "1",
        "30",
        "0",
        "0",
        "VERTEX",
        "8",
        "MURS_EXTERIEURS",
        "10",
        "3",
        "20",
        "1",
        "30",
        "0",
        "0",
        "VERTEX",
        "8",
        "MURS_EXTERIEURS",
        "10",
        "3",
        "20",
        "2",
        "30",
        "0",
        "0",
        "VERTEX",
        "8",
        "MURS_EXTERIEURS",
        "10",
        "1",
        "20",
        "2",
        "30",
        "0",
        "0",
        "SEQEND",
        "8",
        "MURS_EXTERIEURS",
        "0",
        "LINE",
        "8",
        "0",
        "10",
        "0",
        "20",
        "-0.5",
        "30",
        "0",
        "11",
        "4",
        "21",
        "-0.5",
        "31",
        "0",
        "0",
        "LINE",
        "8",
        "0",
        "10",
        "0",
        "20",
        "0",
        "30",
        "0",
        "11",
        "0",
        "21",
        "-0.5",
        "31",
        "0",
        "0",
        "LINE",
        "8",
        "0",
        "10",
        "4",
        "20",
        "0",
        "30",
        "0",
        "11",
        "4",
        "21",
        "-0.5",
        "31",
        "0",
        "0",
        "TEXT",
        "8",
        "0",
        "10",
        "2",
        "20",
        "-0.425",
        "30",
        "0",
        "40",
        "0.25",
        "1",
        "4,00 m",
        "72",
        "1",
        "11",
        "2",
        "21",
        "-0.425",
        "31",
        "0",
        "0",
        "ENDSEC",
        "0",
        "EOF",
        "",
      ]
    `);
  });

  it("structure : en-tête, unités, entités et calques", () => {
    const dxf = exportStudioDxf(small());
    expect(dxf).toBe(exportStudioDxf(small()));
    expect(dxf.endsWith("0\r\nEOF\r\n")).toBe(true);
    expect(dxf).toContain("$ACADVER\r\n1\r\nAC1009\r\n");
    expect(dxf).toContain("$INSUNITS\r\n70\r\n6\r\n");
    expect(/^[\x00-\x7F]*$/.test(dxf)).toBe(true);
    const e = entities(dxf);
    // Ligne, rectangle (POLYLINE + 4 VERTEX + SEQEND), cote : ligne de cote + 2 attaches + TEXT.
    expect(e).toEqual(["LINE", "POLYLINE", "VERTEX", "VERTEX", "VERTEX", "VERTEX", "SEQEND", "LINE", "LINE", "LINE", "TEXT"]);
    expect(layerTable(dxf)).toEqual([{ name: "0", flags: "0", color: "7" }, { name: "MURS_EXTERIEURS", flags: "0", color: "7" }]);
    expect(dxf).toContain("TEXT\r\n8\r\n0\r\n");
    expect(dxf).toContain("\r\n1\r\n4,00 m\r\n");
  });

  it("calque masqué éteint, verrouillé drapeau 4, calque implicite matérialisé = 0", () => {
    const doc = small();
    doc.layers = [{ id: "default", name: "Défaut", visible: false, locked: true }, { id: "murs", name: "Murs extérieurs", visible: false, locked: true }];
    expect(layerTable(exportStudioDxf(doc))).toEqual([{ name: "0", flags: "4", color: "-7" }, { name: "MURS_EXTERIEURS", flags: "4", color: "-7" }]);
  });

  it("noms de calque : ASCII R12, 31 caractères, collisions suffixées, échappement des textes", () => {
    const doc = small();
    doc.id = "étude\r\n«x»";
    doc.layers = [
      { id: "a", name: "Murs extérieurs", visible: true, locked: false },
      { id: "b", name: "murs-exterieurs".replace("-", " "), visible: true, locked: false },
      { id: "c", name: "0", visible: true, locked: false },
      { id: "d", name: "x".repeat(40), visible: true, locked: false },
      { id: "e", name: "X".repeat(40), visible: true, locked: false },
      { id: "f", name: "!!!", visible: true, locked: false },
    ];
    doc.objects[1] = { ...doc.objects[1]!, layerId: "a" };
    expect(studioDxfLayerNames(doc)).toEqual({
      default: "0", a: "MURS_EXTERIEURS", b: "MURS_EXTERIEURS_2", c: "L", d: "X".repeat(31), e: `${"X".repeat(29)}_2`, f: "L_2",
    });
    const dxf = exportStudioDxf(doc);
    expect(/^[\x00-\x7F]*$/.test(dxf)).toBe(true);
    expect(dxf).toContain("999\r\nFadi Studio - document \\U+00E9tude \\U+00ABx\\U+00BB\r\n");
    expect(layerTable(dxf).map((l) => l.name)).toEqual(["0", "MURS_EXTERIEURS", "MURS_EXTERIEURS_2", "L", "X".repeat(31), `${"X".repeat(29)}_2`, "L_2"]);
  });

  it("cote à résoudre : mention échappée en ASCII", () => {
    const doc = applyStudioCommands(small(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } }]);
    const dxf = exportStudioDxf(doc);
    expect(dxf).toContain("\r\n1\r\n\\U+00E0 r\\U+00E9soudre\r\n");
    expect(entities(dxf)).toEqual(["POLYLINE", "VERTEX", "VERTEX", "VERTEX", "VERTEX", "SEQEND", "LINE", "LINE", "LINE", "TEXT"]);
  });

  it("cote verticale : texte tourné de 90°, lisible", () => {
    const doc: StudioDocument = { ...newStudioDocument("v"), dimensions: [{ id: "c", type: "dimension", start: { x: 0, y: 3 }, end: { x: 0, y: 0 }, offset: 0, links: { start: null, end: null }, toResolve: false }] };
    const dxf = exportStudioDxf(doc);
    expect(entities(dxf)).toEqual(["LINE", "TEXT"]);
    expect(dxf).toContain("\r\n50\r\n90\r\n");
    expect(exportStudioSvg(doc)).toContain("rotate(-90 ");
  });
});
