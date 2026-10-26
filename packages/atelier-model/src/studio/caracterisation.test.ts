import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as paquet from "../index.js";
import {
  applyStudioCommands, measureStudioDimension, newStudioDocument, selectStudioShape, STUDIO_APPLIED_TOOL_IDS, STUDIO_FIXED_ANCHORS,
  studioAnchorPoint, studioLayerState, validateStudioDocument, type StudioCommand, type StudioDocument,
} from "./document-2d.js";
import { exportStudioDxf, exportStudioSvg, studioDxfLayerNames } from "./export.js";
import { exportStudioIfc, studioIfcSummary } from "./ifc.js";
import { lireDxfStudio } from "./import-dxf.js";
import { dxf, ligne, lwpolyligne, polyligne, table } from "./import-dxf.fixtures.js";
import { studioMesh3d } from "./mesh-3d.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOL_IDS, STUDIO_TOOLS } from "./registry.js";

/**
 * Test de caractérisation (découpage S0, refactorisation sans changement de comportement) : les sorties des exports SVG,
 * DXF, IFC, de la vue 3D, de la validation, de l'application des commandes (refus compris, message exact) et du
 * registre sont comparées octet pour octet à `caracterisation.fixtures.json`, généré AVANT le découpage depuis la base
 * 0f02cb3. Régénérer (`STUDIO_CARACTERISATION_ECRIRE=1 npx vitest run caracterisation`) n'est permis que pour un
 * changement de comportement délibéré, consigné.
 */

const FICHIER = new URL("./caracterisation.fixtures.json", import.meta.url);
const unchecked = (c: unknown) => c as StudioCommand[];

/** Résultat ou refus (classe, chemin, message) : les deux font partie du comportement. */
function capture(f: () => unknown): unknown {
  try {
    return { ok: f() };
  } catch (e) {
    const err = e as { name?: string; message?: string; path?: string; code?: string };
    return { refus: { name: err.name, code: err.code, path: err.path, message: err.message } };
  }
}

const exportSample = (): StudioDocument => ({
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

const ifcSample = (): StudioDocument => applyStudioCommands(newStudioDocument("doc-1"), [
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs extérieurs", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "m1", type: "line", layerId: "murs", start: { x: 1, y: 2 }, end: { x: 4, y: 6 } } },
  { toolId: "studio.dessin.ligne", params: { id: "s1", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 3 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 5, y: 5 }, width: 2, height: 1 } },
  { toolId: "studio.dessin.ligne", params: { id: "plat", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.objet.extruder", params: { ids: ["m1"], base: 0.5, height: 2.5, thickness: 0.2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["s1"], base: 0, height: 3 } },
  { toolId: "studio.objet.extruder", params: { ids: ["r1"], base: -0.2, height: 0.2 } },
  { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs extérieurs", visible: true, locked: true } },
]);

/** Document riche : tous les types, extrusions de toutes sortes, calques masqué / verrouillé / homonymes, cotes liées à tous les sommets. */
const richCommands = (): StudioCommand[] => unchecked([
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs extérieurs", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "murs-2", name: "Murs  extérieurs!", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "zero", name: "0", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "long", name: "Un nom de calque vraiment très long pour le DXF", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "long-2", name: "Un nom de calque vraiment très long pour le DXF R12", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 6, y: 0 }, end: { x: 3.3333333, y: 4.1234567 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l3", type: "line", layerId: "murs-2", start: { x: -1, y: -1 }, end: { x: -1, y: 5 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 1, y: 1 }, width: 2, height: 1.5 } },
  { toolId: "studio.dessin.rectangle", params: { id: "r2", type: "rectangle", layerId: "zero", origin: { x: -4, y: -3 }, width: 1.25, height: 0.75 } },
  { toolId: "studio.dessin.cercle", params: { id: "c1", type: "circle", center: { x: 10, y: 2 }, radius: 1.5 } },
  { toolId: "studio.dessin.cercle", params: { id: "c2", type: "circle", layerId: "long", center: { x: 14, y: 2 }, radius: 0.4 } },
  { toolId: "studio.dessin.arc", params: { id: "a1", type: "arc", center: { x: 0, y: 8 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2 } },
  { toolId: "studio.dessin.arc", params: { id: "a2", type: "arc", layerId: "long-2", center: { x: 5, y: 8 }, radius: 1, startAngle: 5, endAngle: 1 } },
  { toolId: "studio.dessin.arc", params: { id: "a3", type: "arc", center: { x: 9, y: 8 }, radius: 3, startAngle: 1, endAngle: 2.5 } },
  { toolId: "studio.dessin.polyligne", params: { id: "p1", type: "polyline", points: [{ x: 0, y: 12 }, { x: 4, y: 12 }, { x: 4, y: 15 }, { x: 0, y: 15 }], closed: true } },
  { toolId: "studio.dessin.polyligne", params: { id: "p2", type: "polyline", points: [{ x: 6, y: 12 }, { x: 9, y: 12 }, { x: 10, y: 14 }], closed: false, bulges: [0.5, -0.25] } },
  { toolId: "studio.dessin.polyligne", params: { id: "p3", type: "polyline", points: [{ x: 12, y: 12 }, { x: 14, y: 12 }], closed: true, bulges: [1, 1] } },
  { toolId: "studio.dessin.polyligne", params: { id: "p4", type: "polyline", layerId: "murs", points: [{ x: 16, y: 12 }, { x: 18, y: 12 }, { x: 18, y: 14 }, { x: 17, y: 15 }, { x: 16, y: 14 }], closed: true, bulges: [0, 0.3, 0, 0, 0] } },
  { toolId: "studio.dessin.polyligne", params: { id: "p5", type: "polyline", points: [{ x: 20, y: 12 }, { x: 22, y: 13 }, { x: 24, y: 12 }], closed: false } },
  { toolId: "studio.dessin.cote", params: { id: "d1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, offset: -0.75, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d2", type: "dimension", start: { x: 1, y: 1 }, end: { x: 3, y: 2.5 }, offset: 0.4, links: { start: { objectId: "r1", anchor: "corner-origin" }, end: { objectId: "r1", anchor: "corner-opposite" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d3", type: "dimension", start: { x: 11.5, y: 2 }, end: { x: 10, y: 3.5 }, offset: 0.2, links: { start: { objectId: "c1", anchor: "quadrant-0" }, end: { objectId: "c1", anchor: "quadrant-90" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d4", type: "dimension", start: { x: 4, y: 15 }, end: { x: 0, y: 12 }, offset: 0, links: { start: { objectId: "p1", anchor: "vertex-2" }, end: { objectId: "p1", anchor: "vertex-0" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d5", type: "dimension", start: { x: 20, y: 0 }, end: { x: 15, y: -2 }, offset: 1, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d6", type: "dimension", layerId: "murs", start: { x: 6, y: 0 }, end: { x: 3.3333333, y: 4.1234567 }, offset: 0.3, links: { start: { objectId: "l2", anchor: "start" }, end: { objectId: "l2", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d7", type: "dimension", start: { x: 0, y: 6 }, end: { x: 0, y: -5 }, offset: -0.5, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.objet.extruder", params: { ids: ["l1"], base: 0, height: 2.5, thickness: 0.2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["l2"], base: 0.1, height: 2.4 } },
  { toolId: "studio.objet.extruder", params: { ids: ["r1", "c1"], base: -0.2, height: 0.2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["a1"], base: 0, height: 3, thickness: 0.3 } },
  { toolId: "studio.objet.extruder", params: { ids: ["a3", "p1", "p2", "p3", "p4"], base: 1, height: 1.5 } },
  { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs extérieurs", visible: true, locked: true } },
]);
const rich = (): StudioDocument => applyStudioCommands(newStudioDocument("riche"), richCommands());

/** Riche, puis suppression de l'objet coté : cote « à résoudre ». */
const toResolve = (): StudioDocument => applyStudioCommands(rich(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["r1", "p1"] } }]);

const defaultMaterialised = (): StudioDocument => applyStudioCommands(newStudioDocument("defaut"), unchecked([
  { toolId: "studio.calque.creer", params: { id: "a", name: "Âme", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "default", name: "Calque par défaut", visible: false, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "x", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } },
  { toolId: "studio.dessin.ligne", params: { id: "y", type: "line", layerId: "a", start: { x: 0, y: 1 }, end: { x: 1, y: 0 } } },
  { toolId: "studio.objet.extruder", params: { ids: ["x"], base: 0, height: 1 } },
  { toolId: "studio.calque.modifier", params: { id: "default", name: "Calque par défaut", visible: false, locked: true } },
]));

function fromDxf(): StudioDocument {
  const texte = dxf({
    insunits: 6,
    tables: [table([{ nom: "MURS" }, { nom: "Cloisons", couleur: -3 }, { nom: "Gelé", flags: 1 }])],
    entites: [
      ligne(0, 0, 5, 0, "MURS"), ligne(5, 0, 5, 3, "Cloisons"),
      lwpolyligne([[0, 0], [2, 0], [2, 2], [0, 2]], { ferme: true, calque: "MURS", bulges: [0, 0.4, 0, 0] }),
      lwpolyligne([[3, 3], [4, 4], [5, 3]], { bulges: [0.2, -0.2] }),
      polyligne([[7, 0], [9, 0], [9, 2]], { flags: 1 }),
    ],
  });
  const r = lireDxfStudio(texte, {});
  return applyStudioCommands(newStudioDocument("dxf"), r.commandes);
}

const DOCS: Record<string, () => StudioDocument> = {
  vide: () => newStudioDocument("vide"),
  "export-sample": exportSample,
  "ifc-sample": ifcSample,
  riche: rich,
  "a-resoudre": toResolve,
  "defaut-materialise": defaultMaterialised,
  dxf: fromDxf,
};

const META = { studyName: "Étude A — l’été", variantName: "Variante 1 'b'\\", revisionId: "rev-1", timestamp: "2026-10-18T00:00:00" };

function documentOutputs(name: string, make: () => StudioDocument): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const d = capture(make) as { ok?: StudioDocument };
  out[`${name}/document`] = d;
  const doc = d.ok;
  if (!doc) return out;
  out[`${name}/svg`] = capture(() => exportStudioSvg(doc));
  out[`${name}/svg-en`] = capture(() => exportStudioSvg(doc, { locale: "en-US", textHeight: 0.5, margin: 0 }));
  out[`${name}/svg-de`] = capture(() => exportStudioSvg(doc, { locale: "de-CH", margin: 2.5 }));
  out[`${name}/dxf`] = capture(() => exportStudioDxf(doc));
  out[`${name}/dxf-en`] = capture(() => exportStudioDxf(doc, { locale: "en-GB", textHeight: 0.1 }));
  out[`${name}/dxf-layers`] = capture(() => studioDxfLayerNames(doc));
  out[`${name}/ifc`] = capture(() => exportStudioIfc(doc, META));
  out[`${name}/ifc-key`] = capture(() => exportStudioIfc(doc, { studyName: "S", variantName: "V", timestamp: "2020-01-01T00:00:00", key: "cle" }));
  out[`${name}/ifc-summary`] = capture(() => studioIfcSummary(doc));
  out[`${name}/mesh3d`] = capture(() => studioMesh3d(doc));
  out[`${name}/layer-states`] = [undefined, "default", ...(doc.layers ?? []).map((l) => l.id), "inconnu"].map((l) => studioLayerState(doc, l));
  const anchors = [...STUDIO_FIXED_ANCHORS, "vertex-0", "vertex-1", "vertex-2", "vertex-4", "vertex-9", "mid-0", "mid-1", "mid-2", "mid-4", "mid-9"] as const;
  out[`${name}/anchors`] = Object.fromEntries(doc.objects.map((o) => [o.id, Object.fromEntries(anchors.map((a) => [a, studioAnchorPoint(o, a as never)]))]));
  out[`${name}/measures`] = (doc.dimensions ?? []).map((x) => measureStudioDimension(doc, x.id));
  out[`${name}/select`] = doc.objects.map((o) => selectStudioShape(doc, o.id));
  return out;
}

/** Document accepté réduit à son empreinte SHA-256 (forme JSON) ; un refus garde son message en clair. */
function digest(r: unknown): unknown {
  const ok = (r as { ok?: unknown }).ok;
  return ok === undefined ? r : { ok: createHash("sha256").update(JSON.stringify(ok)).digest("hex") };
}

/** Variantes systématiques d'un champ : absence, mauvais type, valeurs limites, champ inconnu. */
const MUTATIONS: [string, (v: unknown) => unknown][] = [
  ["null", () => null], ["texte", () => "x"], ["zero", () => 0], ["negatif", () => -1], ["nan", () => Number.NaN],
  ["infini", () => Number.POSITIVE_INFINITY], ["tableau", () => []], ["objet", () => ({})], ["vrai", () => true],
  ["vide", () => ""], ["deux-pi", () => 2 * Math.PI], ["defaut", () => "default"], ["grand", () => 1e308],
];

function validationOutputs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const base = JSON.parse(JSON.stringify(rich())) as StudioDocument & Record<string, unknown>;
  const visit = (value: unknown, path: (string | number)[]) => {
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      const p = [...path, key];
      const variants: [string, (v: unknown) => unknown][] = [["absent", () => undefined], ...MUTATIONS];
      for (const [m, f] of variants) {
        const copy = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
        let target: Record<string, unknown> = copy;
        for (const k of p.slice(0, -1)) target = target[k as string] as Record<string, unknown>;
        const last = p[p.length - 1] as string;
        if (m === "absent") delete target[last];
        else target[last] = f(target[last]);
        out[`validation/${p.join(".")}/${m}`] = digest(capture(() => validateStudioDocument(copy)));
      }
      visit((value as Record<string, unknown>)[key], p);
    }
    if (!Array.isArray(value)) {
      const copy = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      let target: Record<string, unknown> = copy;
      for (const k of path) target = target[k as string] as Record<string, unknown>;
      target.inconnu = 1;
      out[`validation/${path.join(".")}/champ-inconnu`] = digest(capture(() => validateStudioDocument(copy)));
    }
  };
  visit(base, []);
  return out;
}

function commandOutputs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const r = rich();
  const shapes = r.objects.map((o) => o.id);
  const cases: Record<string, unknown[]> = {
    vide: [],
    "outil-inconnu": [{ toolId: "studio.inconnu", params: {} }],
    "lecture-refusee": [{ toolId: "studio.dessin.selection", params: { id: "l2" } }],
    "commande-champ-inconnu": [{ toolId: "studio.dessin.supprimer", params: { ids: ["l2"] }, autre: 1 }],
    "outil-incompatible": [{ toolId: "studio.dessin.ligne", params: { id: "z", type: "rectangle", origin: { x: 0, y: 0 }, width: 1, height: 1 } }],
    "id-pris": [{ toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }],
    "id-pris-cote": [{ toolId: "studio.dessin.ligne", params: { id: "d1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }],
    "calque-verrouille": [{ toolId: "studio.dessin.ligne", params: { id: "z", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }],
    "calque-inconnu": [{ toolId: "studio.dessin.ligne", params: { id: "z", type: "line", layerId: "nul-part", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }],
    "cote-a-resoudre-saisie": [{ toolId: "studio.dessin.cote", params: { id: "z", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0, links: { start: null, end: null }, toResolve: true } }],
    "cote-lien-faux": [{ toolId: "studio.dessin.cote", params: { id: "z", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0, links: { start: { objectId: "l2", anchor: "start" }, end: null }, toResolve: false } }],
    "cote-lien-ancre": [{ toolId: "studio.dessin.cote", params: { id: "z", type: "dimension", start: { x: 6, y: 0 }, end: { x: 1, y: 0 }, offset: 0, links: { start: { objectId: "l2", anchor: "center" }, end: null }, toResolve: false } }],
    "cote-lien-absent": [{ toolId: "studio.dessin.cote", params: { id: "z", type: "dimension", start: { x: 6, y: 0 }, end: { x: 1, y: 0 }, offset: 0, links: { start: { objectId: "absent", anchor: "start" }, end: null }, toResolve: false } }],
    "cote-arc-mid": [{ toolId: "studio.dessin.cote", params: { id: "z", type: "dimension", ...(() => { const a = studioAnchorPoint(r.objects.find((o) => o.id === "a3")!, "mid")!; const c = studioAnchorPoint(r.objects.find((o) => o.id === "p2")!, "mid-1")!; return { start: a, end: c }; })(), offset: 0.5, links: { start: { objectId: "a3", anchor: "mid" }, end: { objectId: "p2", anchor: "mid-1" } }, toResolve: false } }],
    "deplacer-ligne-liee": [{ toolId: "studio.dessin.deplacer", params: { id: "l2", dx: 0.5, dy: -0.25 } }],
    "deplacer-chaque": shapes.filter((id) => !["l1", "l2", "p4"].includes(id)).map((id) => ({ toolId: "studio.dessin.deplacer", params: { id, dx: 1.5, dy: 2 } })),
    "deplacer-verrouille": [{ toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } }],
    "deplacer-cote-libre": [{ toolId: "studio.dessin.deplacer", params: { id: "d5", dx: 1, dy: 1 } }],
    "deplacer-cote-liee": [{ toolId: "studio.dessin.deplacer", params: { id: "d2", dx: 1, dy: 1 } }],
    "deplacer-introuvable": [{ toolId: "studio.dessin.deplacer", params: { id: "zz", dx: 1, dy: 1 } }],
    "deplacer-debordement": [{ toolId: "studio.dessin.deplacer", params: { id: "c1", dx: 1.7e308, dy: 0 } }],
    "deplacer-cote-nulle": [{ toolId: "studio.dessin.modifier", params: { id: "c1", type: "circle", center: { x: 10, y: 2 }, radius: 1e-300, extrusion: { base: -0.2, height: 0.2 } } }],
    "modifier-rectangle": [{ toolId: "studio.dessin.modifier", params: { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 0, y: 0 }, width: 5, height: 1 } }],
    "modifier-type": [{ toolId: "studio.dessin.modifier", params: { id: "r1", type: "line", layerId: "cache", start: { x: 0, y: 0 }, end: { x: 5, y: 1 } } }],
    "modifier-calque": [{ toolId: "studio.dessin.modifier", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 0 }, width: 5, height: 1 } }],
    "modifier-cote": [{ toolId: "studio.dessin.modifier", params: { ...r.dimensions!.find((x) => x.id === "d5")!, offset: -3 } }],
    "modifier-introuvable": [{ toolId: "studio.dessin.modifier", params: { id: "zz", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 1 } } }],
    "modifier-polyligne": [{ toolId: "studio.dessin.modifier", params: { id: "p1", type: "polyline", points: [{ x: 0, y: 12 }, { x: 4, y: 12 }, { x: 4, y: 15 }, { x: 1, y: 16 }], closed: true } }],
    "modifier-arc-epais": [{ toolId: "studio.dessin.modifier", params: { id: "a1", type: "arc", center: { x: 0, y: 8 }, radius: 0.1, startAngle: 0, endAngle: 1, extrusion: { base: 0, height: 3, thickness: 0.3 } } }],
    ...Object.fromEntries(shapes.flatMap((id) => [1, -0.3, 5].map((dist) => [`decaler-${id}-${dist}`, [{ toolId: "studio.dessin.decaler", params: { id, newId: `${id}-o`, distance: dist } }]]))),
    "decaler-cote": [{ toolId: "studio.dessin.decaler", params: { id: "d1", newId: "n", distance: 1 } }],
    "decaler-zero": [{ toolId: "studio.dessin.decaler", params: { id: "l2", newId: "n", distance: 0 } }],
    "decaler-id-pris": [{ toolId: "studio.dessin.decaler", params: { id: "l2", newId: "l3", distance: 1 } }],
    "supprimer-lies": [{ toolId: "studio.dessin.supprimer", params: { ids: ["l2", "c1", "d5"] } }],
    "supprimer-libre": [{ toolId: "studio.dessin.supprimer", params: { ids: ["c1", "d5", "a3"] } }],
    "supprimer-repete": [{ toolId: "studio.dessin.supprimer", params: { ids: ["l2", "l2"] } }],
    "supprimer-vide": [{ toolId: "studio.dessin.supprimer", params: { ids: [] } }],
    "supprimer-verrouille": [{ toolId: "studio.dessin.supprimer", params: { ids: ["p4"] } }],
    "calque-creer-existant": [{ toolId: "studio.calque.creer", params: { id: "murs", name: "x", visible: true, locked: false } }],
    "calque-creer-nom": [{ toolId: "studio.calque.creer", params: { id: "n", name: " ", visible: true, locked: false } }],
    "calque-modifier-inconnu": [{ toolId: "studio.calque.modifier", params: { id: "n", name: "x", visible: true, locked: false } }],
    "calque-deverrouiller-puis": [
      { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: false, locked: false } },
      { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } },
    ],
    "objet-calque": [{ toolId: "studio.objet.calque", params: { ids: ["l2", "d5", "c2"], layerId: "cache" } }],
    "objet-calque-defaut": [{ toolId: "studio.objet.calque", params: { ids: ["r1", "d6"], layerId: "default" } }],
    "objet-calque-defaut-libre": [{ toolId: "studio.objet.calque", params: { ids: ["r1", "c2"], layerId: "default" } }],
    "objet-calque-cible-verrouillee": [{ toolId: "studio.objet.calque", params: { ids: ["l2"], layerId: "murs" } }],
    "objet-calque-introuvable": [{ toolId: "studio.objet.calque", params: { ids: ["zz"], layerId: "cache" } }],
    "extruder-tous": [{ toolId: "studio.objet.extruder", params: { ids: shapes.filter((id) => !["l1", "p4"].includes(id)), base: 0.5, height: 2 } }],
    "extruder-epaisseur-cercle": [{ toolId: "studio.objet.extruder", params: { ids: ["c1"], base: 0, height: 1, thickness: 0.1 } }],
    "extruder-epaisseur-arc-trop": [{ toolId: "studio.objet.extruder", params: { ids: ["a2"], base: 0, height: 1, thickness: 2 } }],
    "extruder-cote": [{ toolId: "studio.objet.extruder", params: { ids: ["d1"], base: 0, height: 1 } }],
    "extruder-polyligne-croisee": [
      { toolId: "studio.dessin.polyligne", params: { id: "x", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }], closed: true } },
      { toolId: "studio.objet.extruder", params: { ids: ["x"], base: 0, height: 1 } },
    ],
    "aplatir": [{ toolId: "studio.objet.aplatir", params: { ids: ["l2", "r1", "a1"] } }],
    "aplatir-plat": [{ toolId: "studio.objet.aplatir", params: { ids: ["l3"] } }],
    "aplatir-introuvable": [{ toolId: "studio.objet.aplatir", params: { ids: ["d1"] } }],
    "polyligne-fermee-2": [{ toolId: "studio.dessin.polyligne", params: { id: "x", type: "polyline", points: [{ x: 0, y: 0 }, { x: 2, y: 2 }], closed: true } }],
    "polyligne-confondus": [{ toolId: "studio.dessin.polyligne", params: { id: "x", type: "polyline", points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], closed: false } }],
    "polyligne-bulges-nuls": [{ toolId: "studio.dessin.polyligne", params: { id: "x", type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, bulges: [-0] } }],
    "polyligne-bulges-compte": [{ toolId: "studio.dessin.polyligne", params: { id: "x", type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, bulges: [0, 1] } }],
    "arc-angles-egaux": [{ toolId: "studio.dessin.arc", params: { id: "x", type: "arc", center: { x: 0, y: 0 }, radius: 1, startAngle: 1, endAngle: 1 } }],
    "arc-angle-moins-zero": [{ toolId: "studio.dessin.arc", params: { id: "x", type: "arc", center: { x: 0, y: 0 }, radius: 1, startAngle: -0, endAngle: 1 } }],
    "rectangle-nul": [{ toolId: "studio.dessin.rectangle", params: { id: "x", type: "rectangle", origin: { x: 0, y: 0 }, width: 0, height: 1 } }],
    "ligne-confondue": [{ toolId: "studio.dessin.ligne", params: { id: "x", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } }],
    "cercle-rayon": [{ toolId: "studio.dessin.cercle", params: { id: "x", type: "circle", center: { x: 0, y: 0 }, radius: -1 } }],
    "lot-tout-ou-rien": [
      { toolId: "studio.dessin.ligne", params: { id: "ok", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } },
      { toolId: "studio.dessin.ligne", params: { id: "ok", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } },
    ],
  };
  for (const [name, commands] of Object.entries(cases)) out[`commandes/${name}`] = capture(() => applyStudioCommands(rich(), unchecked(commands)));
  out["commandes/document-non-tableau"] = capture(() => applyStudioCommands(rich(), "x" as never));
  return out;
}

/**
 * Ajouts délibérés, postérieurs à la base et consignés — transformations (Copier, Rotation, Symétrie, Échelle :
 * `transformations.test.ts`) et annotations (cote angulaire et texte, champ facultatif `annotations` du document :
 * `annotations.test.ts`) : retirés des sorties du registre et du paquet avant la comparaison, pour que la
 * caractérisation reste exactement celle de la base. Le volume libre est contrôlé plus bas (`ADDITIFS`).
 */
const AJOUTS = {
  outils: new Set([
    "studio.dessin.copier", "studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle",
    "studio.dessin.cote-angulaire", "studio.dessin.texte",
    // Architecture (A.4, extension additive consignée) : murs et ouvertures.
    "studio.architecture.mur", "studio.architecture.ouverture", "studio.architecture.modifier", "studio.architecture.supprimer",
    // Propriétés BIM déclarées (E.1-01, extension additive consignée, champ facultatif `proprietes` du document).
    "studio.propriete.definir", "studio.propriete.retirer",
    // Visualisation (lot E.5, extension additive consignée) : scènes et apparences d'affichage.
    "studio.scene.creer", "studio.scene.modifier", "studio.scene.rappeler", "studio.scene.supprimer", "studio.apparence.definir", "studio.apparence.retirer",
    // Éléments non natifs (lot F3, extension additive consignée, champ facultatif `nonNatifs` du document).
    "studio.nonnatif.conserver", "studio.nonnatif.retirer",
    // Géométrie 3D du lot F1 (extension additive consignée) : édition des faces, rotation, lien des solides à leur profil.
    "studio.solide.face-decaler", "studio.solide.face-diviser", "studio.solide.pivoter", "studio.solide.resoudre",
    // Noyau exact du lot F2 (extension additive consignée) : booléen exact, champ facultatif `exacts` du document.
    "studio.solide.booleen",
  ]),
  types: new Set(["angular-dimension", "text", "wall", "opening", "scene", "appearance", "non-native"]),
  exports: new Set([
    // Dérivation en copie indépendante (TR-EX-013 / TR-INV-003) et tolérance contractuelle des gestes (TR-IF-002), P-12.
    "STUDIO_MODES_DERIVATION", "studioCopieIndependante", "studioIdentitesDocument", "studioIdentitesReutilisees",
    "STUDIO_TOLERANCES_GESTES", "studioDansToleranceGeste",
    "dessinerCoteAngulaire", "formatStudioAngle", "measureStudioAngularDimension", "STUDIO_TEXT_JUSTIFICATIONS", "STUDIO_TEXT_MAX",
    "studioAngularFromSegments", "studioAngularValue", "studioStraightSegment", "studioTextBox", "studioTextRotationDegrees",
    // Architecture (A.4).
    "STUDIO_OPENING_KINDS", "STUDIO_WALL_JUSTIFICATIONS", "SCHEMA_ARCHITECTURE", "SCHEMA_MUR", "SCHEMA_OUVERTURE",
    "controlerArchitecture", "validerElementArchitectural", "validerMur", "validerOuverture", "geometrieMur", "lateraux", "placerOuverture",
    "studioPlanArchitecture", "studioMaillageArchitecture", "studioQuantitesArchitecture",
    // Inventaire de couverture des types 3D (A.3-08, lot F5, `couverture-3d.ts`).
    "STUDIO_COUVERTURE_3D", "STUDIO_COUVERTURE_3D_VERSION", "studioControlerCouverture3d", "studioTypes3dNonDisponibles",
    // Manifeste versionné du catalogue d'outils, chargeurs et alias de migration (B.1, `manifeste-outils.ts`).
    "STUDIO_ALIAS_OUTILS", "STUDIO_CHARGEURS_OUTILS", "STUDIO_CONTEXTES_OUTILS", "STUDIO_MANIFESTE_OUTILS", "STUDIO_MANIFESTE_OUTILS_VERSION",
    "controlerManifesteOutils", "entreeManifeste", "resoudreAliasOutil", "toolIdCanonique",
    // Rapport de fidélité des exports (E.6-03, `echanges/rapport-fidelite.ts`).
    "STUDIO_CAPACITES_EXPORT", "STUDIO_FORMATS_ECHANGE", "STUDIO_LISTES_ECHANGE", "STUDIO_RAISONS_FIDELITE", "STUDIO_RAPPORT_FIDELITE_SCHEMA",
    "STUDIO_STATUTS_FIDELITE", "studioRapportFidelite",
    // Matrice d'échanges versionnée (E.6-01 à E.6-05, `echanges/matrice-echanges.ts`).
    "STUDIO_COUVERTURE_EXPORT", "STUDIO_MATRICE_ECHANGES", "STUDIO_MATRICE_ECHANGES_DATE", "STUDIO_MATRICE_ECHANGES_REVISION", "STUDIO_MATRICE_ECHANGES_SCHEMA",
    "STUDIO_STATUT_DE_RAISON", "STUDIO_STATUTS_ECHANGE", "controlerMatriceEchanges", "studioCouvertureFormat", "studioMatriceEchangesMarkdown",
    "STUDIO_DECISIONS_RENONCEMENT", "studioDeclareConformite", "studioTextesEntree",
    // Propriétés, exigences versionnées et écarts (E.1-01 à E.1-06, `exigences/`).
    "STUDIO_LIMITES_EXIGENCES", "STUDIO_LIMITES_PROPRIETES", "ciblePropriete", "proprietesDe", "validerPropriete", "valeurPropriete",
    "SCHEMA_PROPRIETE", "SCHEMA_RETRAIT_PROPRIETE", "accepterExigence", "COMPARAISONS_EXIGENCE", "exigenceUtilisable", "preparerVersion",
    "UNITE_NOMBRE", "uniteMetrique", "validerExigence", "validerExigences", "validerMetrique", "comparer", "controlerExigences", "mesurerMetrique",
    // Visualisation (lot E.5, `scenes/`).
    "SCHEMA_APPARENCE", "SCHEMA_ELEMENT_VISUALISATION", "SCHEMA_SCENE", "STUDIO_FINITIONS_AFFICHAGE", "STUDIO_FRAME_SCENES", "STUDIO_LIMITES_SCENES",
    "STUDIO_MODES_AFFICHAGE", "STUDIO_PROJECTIONS_SCENE", "validerElementVisualisation", "studioApparenceResolue", "studioApparences", "studioDocumentToutVisible", "studioFiltrerMaillageScene", "studioMeshScene",
    "studioRappelerScene", "studioScenes", "STUDIO_NATURE_RENDU", "STUDIO_RENDU_SCHEMA", "studioNomFichierRendu", "studioProvenanceRendu",
    // Projections versionnées et invalidation minimale (lot C.2, `projections.ts`).
    "STUDIO_PROJECTIONS", "STUDIO_SEUIL_INVALIDATION", "projectionsAInvalider", "studioAssemblerMaillage", "studioClesProjection", "studioEmpreinteContenu",
    "studioFusionnerMorceaux", "studioJsonStable", "studioMaillerObjets", "studioMesh3dIncremental", "studioVersionProjection",
    // Ajustements de quantités enregistrés (E.3-05, `quantites-ajustements.ts`, extension additive).
    "STUDIO_LIMITES_AJUSTEMENTS", "appliquerAjustementsEnregistres", "controlerSaisieAjustement", "etatCibleQuantite", "evaluerAjustementsQuantites", "jsonCanoniqueQuantites",
    // Concurrence des écritures (A.5-06, A.5-08, `concurrence.ts`).
    "studioChevauchements", "studioElementsModifies",
    // Production documentaire (lot E.3 : vues, feuilles composées, dossier de conception, bilan brut / déductions / net).
    "STUDIO_BILAN_QUANTITES_SCHEMA", "bilanQuantitesStudio", "sousTotauxAvecNet", "studioTexteTronque", "largeurHelvetica","studioSha256", "studioSha256Octets", "studioUtf8", "pdfPages",
    "STUDIO_VUE_DOCUMENTAIRE_SCHEMA", "STUDIO_FEUILLE_COMPOSEE_SCHEMA", "STUDIO_DOSSIER_CONCEPTION_SCHEMA", "STUDIO_NON_EVALUE", "STUDIO_LIMITES_DOSSIER",
    "studioDonneesVue", "produireVueDocumentaire", "validerFeuilleComposee", "studioLigneProvenance", "composerFeuilleComposee", "studioFeuilleComposeeSvg",
    "assemblerDossierConception", "pdfDossierConception",
    // Workflow de conception déclaré d'une étude (REF-01 §06, `workflow.ts`, extension additive).
    "STUDIO_PHASES_WORKFLOW", "estPhaseWorkflowStudio",
    // Lot F3 : éléments non natifs, import IFC (lecteur STEP propre), comparaison des éléments hors `objects`, modèles externes.
    "SCHEMA_NON_NATIF", "STUDIO_FORMATS_NON_NATIFS", "STUDIO_LIMITES_NON_NATIFS", "STUDIO_RAISONS_NON_NATIF", "validerNonNatif",
    "STUDIO_IFC_SCHEMAS_LUS", "lireIfcStudio", "nomIfc", "validerTransformation", "comparerElementsStudio",
    "STUDIO_ACTIONS_MODELE_EXTERNE", "STUDIO_FORMATS_MODELE_EXTERNE", "STUDIO_LIMITES_MODELE_EXTERNE", "STUDIO_STATUTS_MODELE_EXTERNE", "STUDIO_UNITES_DECLAREES",
    "comparerModeleExterne", "lireModeleExterne", "passageModeleExterne", "validerMetaModeleExterne",
    // Délégation d'approbation (EX-085, `delegation-approbation.ts`) et rapprochement des observations (EX-086,
    // `rapprochement-observations.ts`), lot F4 : extensions additives.
    "MESSAGES_PROBLEME_DELEGATION", "MESSAGES_REFUS_DELEGATION", "TYPES_PORTEE_DELEGATION", "couvreDelegation", "decisionApprobation", "etatDelegation",
    "problemesNouvelleDelegation", "verifierDelegation", "SUIVIS_RAPPROCHEMENT", "identitesDuDocument", "rapprocherObservations",
    // Géométrie 3D du lot F1 : direction d'extrusion, relation des prismes à leur profil source, faces.
    "STUDIO_DIRECTIONS_EXTRUSION", "studioCotesExtrusion", "directionUnitaire", "estDroit", "estSolideLie", "hauteurPerpendiculaire",
    "STUDIO_RELATIONS_SOURCE", "translationSommet", "validerDirection", "studioEmpriseConforme", "studioLienSolide", "studioLiensSolides",
    "studioProfilDepuisPolyligne",
    // Noyau exact du lot F2 : solides exacts, capture, aperçu provisoire, engagement (`objets-3d/exacts.ts`, `booleens-exacts.ts`).
    "OP_NOYAU", "SCHEMA_RESULTAT_EXACT", "SCHEMA_SOLIDE_EXACT", "STUDIO_LIMITES_EXACTS", "STUDIO_MOTEUR_EXACT", "STUDIO_OPERATIONS_BOOLEENNES",
    "STUDIO_TOLERANCE_APERCU", "studioApercuBooleen", "studioBoiteEnglobante", "studioCaptureBooleen", "studioCommandeBooleen", "studioComparerApercu",
    "studioEmpreinteOperandes", "studioIdsOperandes", "studioMaillageExact", "studioOperandeNoyau", "studioVerifierEngagement", "validerResultatExact",
    "validerSolideExact",
    // Lot PUB : résultats quantitatifs (IF-008), vues de coupe (EX-075), chaîne documentaire (EX-074 / EX-076),
    // conclusions normatives (EX-068), repères des exports (EX-080), BCF des observations (IF-010).
    "STUDIO_BCF_LIMITES", "STUDIO_BCF_LIMITES_EXPORT", "STUDIO_BCF_VERSION", "STUDIO_CONCLUSIONS_NORMATIVES", "STUDIO_HACHURES_COUPE", "STUDIO_LIMITES_VUE_COUPE", "STUDIO_MESSAGES_REFUS_PIECE", "STUDIO_NON_EVALUE_QUANTITE", "STUDIO_PIECES_LIVRABLES_SCHEMA", "STUDIO_PRESENTATIONS_PIECE", "STUDIO_REGLES_METRE", "STUDIO_REPERES_EXPORT", "STUDIO_RESULTAT_QUANTITATIF_SCHEMA", "STUDIO_TRAITS_COUPE", "STUDIO_VUE_COUPE_SCHEMA", "actualiteVueCoupe", "ajusterResultat", "annoterVueCoupe", "chaineDocumentaire", "conclureControle", "conclusionDemande", "controlerPiecesLivrables", "creerVueCoupe", "estConforme", "etatDemandeControle", "executionDe", "fraicheurResultats", "jeuSourcesQuantite", "pageVueCoupe", "piecesDuDossier", "rebaserVueCoupe", "resultatsQuantitatifs", "studioContexteBcf", "studioExporterBcf", "studioGuidBcf", "studioLireBcf", "studioPlanImportBcf", "studioSujetsBcf", "totaliserResultats", "uniteDeGrandeur", "valeurAffichee", "valeurRetenue", "validerVueCoupe", "verifierJustification",
  ]),
};
function sansAjouts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((v) => !(typeof v === "string" && AJOUTS.outils.has(v))
      && !(v && typeof v === "object" && (AJOUTS.outils.has((v as { toolId?: string }).toolId ?? "") || AJOUTS.types.has((v as { properties?: { type?: { const?: string } } }).properties?.type?.const ?? ""))))
      .map(sansAjouts);
  }
  if (!value || typeof value !== "object") return value;
  const out = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sansAjouts(v)]));
  const props = out.properties as Record<string, unknown> | undefined;
  if (props && "schemaVersion" in props) { delete props.annotations; delete props.architecture; delete props.proprietes; delete props.scenes; delete props.nonNatifs; delete props.exacts; }
  // Lot F1 (extension additive consignée) : direction d'extrusion facultative (`extrusion.direction`, `extruder`) et,
  // pour le prisme, direction et source facultatives ; retirées pour comparer à la base.
  if (props && "base" in props && "height" in props) delete props.direction;
  if (props && "profile" in props) { delete props.direction; delete props.source; }
  return out;
}

function registryOutputs(): Record<string, unknown> {
  const deepFrozen = (v: unknown): boolean => !v || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(deepFrozen));
  return {
    "registre/outils": JSON.stringify(sansAjouts(STUDIO_TOOLS)),
    "registre/schema": JSON.stringify(sansAjouts(STUDIO_DOCUMENT_SCHEMA)),
    "registre/ids": sansAjouts([...STUDIO_TOOL_IDS]),
    "registre/mutations": sansAjouts([...STUDIO_COMMAND_TOOL_IDS]),
    "registre/appliques": sansAjouts([...STUDIO_APPLIED_TOOL_IDS]),
    "registre/gele": [deepFrozen(STUDIO_TOOLS), deepFrozen(STUDIO_DOCUMENT_SCHEMA), Object.isFrozen(STUDIO_TOOL_IDS), Object.isFrozen(STUDIO_COMMAND_TOOL_IDS), Object.isFrozen(STUDIO_APPLIED_TOOL_IDS)],
    "paquet/exports": Object.keys(paquet).filter((k) => !AJOUTS.exports.has(k)).sort().map((k) => `${k}:${typeof (paquet as Record<string, unknown>)[k]}`),
  };
}

function allOutputs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, make] of Object.entries(DOCS)) Object.assign(out, documentOutputs(name, make));
  Object.assign(out, validationOutputs(), commandOutputs(), registryOutputs());
  // Forme JSON canonique (NaN, -0 et undefined comme JSON les écrit) : comparaison de texte, octet pour octet.
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}

describe("Studio : caractérisation du découpage (sorties identiques à la base)", () => {
  const actual = allOutputs();
  if (process.env.STUDIO_CARACTERISATION_ECRIRE === "1") writeFileSync(FICHIER, `{\n${Object.entries(actual).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}\n`);
  const expected = JSON.parse(readFileSync(FICHIER, "utf8")) as Record<string, unknown>;

  it("couvre les mêmes cas", () => {
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    expect(Object.keys(actual).length).toBeGreaterThan(500);
  });
  /**
   * Extension additive consignée (volume libre, A.3-02, fixtures inchangées) : le registre et la liste des exports du
   * paquet gardent leurs entrées de référence à l'identique, en tête ; seuls s'y ajoutent les outils `studio.solide.*`,
   * le tableau `solides` du schéma et les exports nommés ici. Tout autre écart reste un échec.
   */
  const AJOUTS_PAQUET = [
    "SCHEMA_BOITE:object", "SCHEMA_PRISME:object", "SCHEMA_SOLIDE:object", "STUDIO_FRAME_SOLIDES:string", "STUDIO_LIMITES_SOLIDES:object",
    "aireProfil:function", "cotesSolide:function", "couperStudio:function", "empriseSolide:function", "profilLocal:function",
    "studioMaillageSolide:function", "studioQuantitesSolides:function", "studioSolideVers3d:function", "studioVolumeSolide:function", "validerSolide:function",
  ];
  const ADDITIFS: Record<string, (a: unknown, e: unknown) => void> = {
    "registre/outils": (a, e) => {
      const [aa, ee] = [JSON.parse(a as string) as { toolId: string; groupe: string; outputSchema: { properties?: Record<string, unknown> } }[], JSON.parse(e as string) as unknown[]];
      // Le schéma de sortie des mutations est le schéma du document : seul son tableau `solides` s'ajoute.
      const reference = aa.slice(0, ee.length).map((t) => {
        if (!t.outputSchema.properties?.solides) return t;
        const { solides: _ajout, ...properties } = t.outputSchema.properties;
        return { ...t, outputSchema: { ...t.outputSchema, properties } };
      });
      expect(reference).toEqual(ee);
      expect(aa.slice(ee.length).map((t) => [t.toolId, t.groupe])).toEqual(["boite", "prisme", "deplacer", "supprimer"].map((x) => [`studio.solide.${x}`, "volume-libre"]));
    },
    "registre/schema": (a, e) => {
      const s = JSON.parse(a as string) as { properties: Record<string, unknown> };
      expect(s.properties.solides).toBeDefined();
      delete s.properties.solides;
      expect(s).toEqual(JSON.parse(e as string));
    },
    "paquet/exports": (a, e) => {
      expect((a as string[]).filter((x) => !(e as string[]).includes(x))).toEqual(AJOUTS_PAQUET);
      expect((e as string[]).filter((x) => !(a as string[]).includes(x))).toEqual([]);
    },
  };
  for (const k of ["registre/ids", "registre/mutations", "registre/appliques"]) {
    ADDITIFS[k] = (a, e) => {
      expect((a as string[]).slice(0, (e as string[]).length)).toEqual(e);
      expect((a as string[]).slice((e as string[]).length)).toEqual(["boite", "prisme", "deplacer", "supprimer"].map((x) => `studio.solide.${x}`));
    };
  }
  const groupes = [...new Set(Object.keys(expected).map((k) => k.split("/")[0]!))];
  it.each(groupes)("%s", (groupe) => {
    if (groupe === "registre" || groupe === "paquet") {
      for (const k of Object.keys(expected).filter((x) => x.split("/")[0] === groupe)) {
        if (ADDITIFS[k]) ADDITIFS[k](actual[k], expected[k]);
        else expect(actual[k], k).toEqual(expected[k]);
      }
      return;
    }
    // Chaînes (SVG, DXF, IFC) : égalité exacte, CRLF compris.
    const pick = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k.split("/")[0] === groupe));
    expect(pick(actual)).toEqual(pick(expected));
  });
});
