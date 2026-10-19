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
 * Outils livrés après le découpage S0, absents de la base caractérisée : le registre de base est comparé sans eux
 * (ordre et descripteurs inchangés) ; leurs propres tests les contrôlent (`transformations.test.ts`).
 */
const OUTILS_APRES_S0: ReadonlySet<string> = new Set(["studio.dessin.copier", "studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle"]);
const deBase = (id: string) => !OUTILS_APRES_S0.has(id);

function registryOutputs(): Record<string, unknown> {
  const deepFrozen = (v: unknown): boolean => !v || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(deepFrozen));
  return {
    "registre/outils": JSON.stringify(STUDIO_TOOLS.filter((t) => deBase(t.toolId))),
    "registre/schema": JSON.stringify(STUDIO_DOCUMENT_SCHEMA),
    "registre/ids": [...STUDIO_TOOL_IDS].filter(deBase),
    "registre/mutations": [...STUDIO_COMMAND_TOOL_IDS].filter(deBase),
    "registre/appliques": [...STUDIO_APPLIED_TOOL_IDS].filter(deBase),
    "registre/gele": [deepFrozen(STUDIO_TOOLS), deepFrozen(STUDIO_DOCUMENT_SCHEMA), Object.isFrozen(STUDIO_TOOL_IDS), Object.isFrozen(STUDIO_COMMAND_TOOL_IDS), Object.isFrozen(STUDIO_APPLIED_TOOL_IDS)],
    "paquet/exports": Object.keys(paquet).sort().map((k) => `${k}:${typeof (paquet as Record<string, unknown>)[k]}`),
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
  const groupes = [...new Set(Object.keys(expected).map((k) => k.split("/")[0]!))];
  it.each(groupes)("%s", (groupe) => {
    // Chaînes (SVG, DXF, IFC) : égalité exacte, CRLF compris.
    const pick = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k.split("/")[0] === groupe));
    expect(pick(actual)).toEqual(pick(expected));
  });
});
