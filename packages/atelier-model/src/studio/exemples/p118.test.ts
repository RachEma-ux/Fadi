import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyStudioCommands } from "../composition/commandes.js";
import { newStudioDocument, validateStudioDocument } from "../composition/document.js";
import type { StudioCommand, StudioDocument } from "../composition/types.js";
import type { StudioOpening, StudioWall } from "../architecture/types.js";
import { CALQUE_NOMS_LOCAUX_P118, CLES_CONSOMMEES_P118, CONVENTION_HAUTEUR_TEXTE_P118, convertirExempleP118, convertirNiveauP118, FAMILLES_P118, lotsDeCommandes, VERSION_CONVERSION_P118, type ConversionNiveauP118, type FamilleP118 } from "./index.js";

type Brut = Record<string, any>;
const JEU = JSON.parse(readFileSync(new URL("../../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as { domains: Brut };
const NIVEAUX = JEU.domains.floorDesign.levels as Record<string, Brut>;
const conversion = convertirExempleP118({ levels: JEU.domains.levels, floorDesign: JEU.domains.floorDesign });

/** Document obtenu en appliquant les lots comme le serveur (enveloppes de 500 commandes au plus). */
function documentDe(c: ConversionNiveauP118): StudioDocument {
  let doc = newStudioDocument(`doc-${c.niveauId}`);
  for (const lot of lotsDeCommandes(c.commandes)) doc = applyStudioCommands(doc, lot);
  return validateStudioDocument(doc);
}
const DOCS = new Map(conversion.niveaux.map((c) => [c.niveauId, documentDe(c)]));
const de = (c: ConversionNiveauP118, toolId: StudioCommand["toolId"]) => c.commandes.filter((x) => x.toolId === toolId);

describe("Exemple P.118 → commandes Studio (convertisseur pur)", () => {
  it("six niveaux, dans l'ordre de domains.levels, nommés d'après l'exemple, base = altitude déclarée", () => {
    expect(conversion.niveaux.map((c) => [c.niveauId, c.nom, c.elevation])).toEqual(
      (JEU.domains.levels as Brut[]).map((l) => [l.id, l.name, l.elevation]),
    );
    expect(conversion.niveaux.map((c) => c.nom)).toEqual(["Sous-sol technique", "RDC", "Mezzanine", "R+1 · Formation", "R+2 · Bureaux", "R+3 · Direction"]);
  });

  it("chaque niveau donne un document studio-document/1 valide (validateStudioDocument), lots de 500 au plus", () => {
    for (const c of conversion.niveaux) {
      const doc = DOCS.get(c.niveauId)!;
      expect(doc.schemaVersion).toBe("studio-document/1");
      expect(lotsDeCommandes(c.commandes).every((l) => l.length <= 500)).toBe(true);
    }
  });

  it("comptes par niveau : chaque élément de l'exemple est converti ou refusé avec son motif, jamais perdu en silence", () => {
    for (const c of conversion.niveaux) {
      const n = NIVEAUX[c.niveauId]!;
      const doc = DOCS.get(c.niveauId)!;
      const refus = (f: string) => c.rapport.refus.filter((r) => r.famille === f).length;
      const archi = doc.architecture ?? [];
      expect(archi.filter((x) => x.type === "wall").length).toBe(c.comptes.murs);
      expect(c.comptes.murs + refus("walls")).toBe(n.walls.length);
      expect(c.comptes.portes + refus("doors")).toBe(n.doors.length);
      expect(c.comptes.fenetres + refus("windows")).toBe(n.windows.length);
      expect(archi.filter((x) => x.type === "opening").length).toBe(c.comptes.portes + c.comptes.fenetres);
      expect((doc.dimensions ?? []).length).toBe(c.comptes.cotes);
      expect(c.comptes.cotes + refus("dims")).toBe(n.dims.length);
      const textes = (doc.annotations ?? []).filter((a) => a.type === "text");
      expect(textes.length).toBe(c.comptes.textes + c.comptes.nomsLocaux);
      expect(c.comptes.textes + refus("texts")).toBe(n.texts.length);
      const trous = (n.paths as Brut[]).reduce((s, p) => s + (p.holes?.length ?? 0), 0);
      expect(doc.objects.filter((o) => o.type === "polyline").length).toBe(c.comptes.polylignes);
      expect(c.comptes.polylignes + refus("paths") + refus("paths · holes")).toBe(n.paths.length + trous);
      expect((doc.layers ?? []).length).toBe(c.comptes.calques);
      expect(c.comptes.calques).toBe(Object.keys(n.layers).length + (c.comptes.nomsLocaux ? 1 : 0));
    }
    // Comptes du RDC, relevés sur l'exemple : 39 murs, 16 portes, 22 fenêtres, 11 cotes, 18 textes, 162 tracés.
    const rdc = conversion.niveaux.find((c) => c.niveauId === "rdc")!;
    expect(rdc.comptes.murs).toBe(39);
    expect(rdc.comptes.portes + rdc.comptes.fenetres).toBeGreaterThan(30);
    expect(rdc.comptes.cotes).toBe(11);
    expect(rdc.comptes.textes).toBe(18);
  });

  it("position d'une porte = bord de début = t × longueur − largeur / 2 (t = fraction du centre)", () => {
    const n = NIVEAUX["rdc"]!;
    const c = conversion.niveaux.find((x) => x.niveauId === "rdc")!;
    const doc = DOCS.get("rdc")!;
    const porte = (n.doors as Brut[]).find((d) => d.id === "EX118-rdc-D-002")!;
    const mur = (n.walls as Brut[]).find((w) => w.id === porte.hostWallId)!;
    const longueur = Math.hypot(mur.b[0] - mur.a[0], mur.b[1] - mur.a[1]);
    const o = (doc.architecture ?? []).find((x) => x.id === porte.id) as StudioOpening;
    expect(o).toMatchObject({ hostId: mur.id, width: porte.width, height: porte.height, sill: porte.sill, kind: "porte" });
    expect(o.position).toBeCloseTo(porte.t * longueur - porte.width / 2, 12);
    // Le centre de la baie retombe exactement sur t.
    expect((o.position + o.width / 2) / longueur).toBeCloseTo(porte.t, 12);
    // Toutes les ouvertures converties : même règle.
    for (const x of (doc.architecture ?? []).filter((y): y is StudioOpening => y.type === "opening")) {
      const src = [...n.doors, ...n.windows].find((d: Brut) => d.id === x.id)!;
      const w = (n.walls as Brut[]).find((y) => y.id === src.hostWallId)!;
      expect(x.position).toBeCloseTo(src.t * Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) - src.width / 2, 9);
    }
    expect(de(c, "studio.propriete.definir").some((p) => (p.params as Brut).cibleId === porte.id && (p.params as Brut).valeur === porte.mark)).toBe(true);
  });

  it("murs : axe, épaisseur et hauteur de l'exemple, base = altitude du niveau, axe centré", () => {
    for (const c of conversion.niveaux) {
      const n = NIVEAUX[c.niveauId]!;
      for (const w of (DOCS.get(c.niveauId)!.architecture ?? []).filter((x): x is StudioWall => x.type === "wall")) {
        const src = (n.walls as Brut[]).find((y) => y.id === w.id)!;
        expect(w.axis).toEqual([{ x: src.a[0], y: src.a[1] }, { x: src.b[0], y: src.b[1] }]);
        expect(w.thickness).toBe(src.thickness);
        expect(w.height).toBe(src.height);
        expect(w.base).toBe(n.elevation);
        expect(w.justification).toBe("center");
      }
    }
    const epaisseurs = new Set((DOCS.get("rdc")!.architecture ?? []).filter((x): x is StudioWall => x.type === "wall").map((w) => w.thickness));
    expect([...epaisseurs].every((e) => (NIVEAUX["rdc"]!.walls as Brut[]).some((w) => w.thickness === e))).toBe(true);
  });

  it("aucune coordonnée cadastrale : tous les points restent dans le repère local du plan (dizaines de mètres)", () => {
    const parcelle = JEU.domains.nativeParcel as Brut;
    const cadastraux = JSON.stringify(parcelle).match(/-?\d{5,}\.\d+/g) ?? [];
    expect(cadastraux.length).toBeGreaterThan(0);
    for (const c of conversion.niveaux) {
      const texte = JSON.stringify(c.commandes);
      for (const v of cadastraux.slice(0, 50)) expect(texte).not.toContain(v);
      const nombres = (texte.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g) ?? []).map(Number).filter((x) => Number.isFinite(x));
      expect(Math.max(...nombres.map(Math.abs))).toBeLessThan(1000);
    }
  });

  it("uniquement des nombres de l'exemple : chaque coordonnée de mur, cote, texte et polyligne s'y retrouve", () => {
    const n = NIVEAUX["r1"]!;
    const c = conversion.niveaux.find((x) => x.niveauId === "r1")!;
    const source = new Set<number>();
    const collecter = (v: unknown) => { if (typeof v === "number") source.add(v); else if (v && typeof v === "object") for (const x of Object.values(v)) collecter(x); };
    collecter(n);
    const doc = DOCS.get("r1")!;
    for (const o of doc.objects) if (o.type === "polyline") for (const p of o.points) { expect(source.has(p.x)).toBe(true); expect(source.has(p.y)).toBe(true); }
    for (const d of doc.dimensions ?? []) for (const v of [d.start.x, d.start.y, d.end.x, d.end.y, d.offset]) expect(source.has(v)).toBe(true);
    for (const t of de(c, "studio.dessin.texte").map((x) => x.params as Brut).filter((p) => p.layerId !== CALQUE_NOMS_LOCAUX_P118.id)) {
      expect(source.has(t.position.x) && source.has(t.position.y)).toBe(true);
      expect(t.height).toBe(CONVENTION_HAUTEUR_TEXTE_P118);
    }
  });

  it("calques : nom, visibilité, verrou de l'exemple ; couleur en apparence d'affichage ; verrous posés en dernier", () => {
    const n = NIVEAUX["rdc"]!;
    const doc = DOCS.get("rdc")!;
    for (const [nom, l] of Object.entries(n.layers as Record<string, Brut>)) {
      const s = (doc.layers ?? []).find((x) => x.name === nom)!;
      expect(s).toMatchObject({ visible: l.visible, locked: l.locked });
      const app = (doc.scenes ?? []).find((x) => x.type === "appearance" && x.target.kind === "layer" && x.target.id === s.id);
      expect(app && app.type === "appearance" ? app.color : null).toBe(String(l.color).toLowerCase());
    }
    const c = conversion.niveaux.find((x) => x.niveauId === "rdc")!;
    const premierVerrou = c.commandes.findIndex((x) => x.toolId === "studio.calque.modifier");
    expect(c.commandes.slice(premierVerrou).every((x) => x.toolId === "studio.calque.modifier")).toBe(true);
  });

  it("rapport : poteaux, escaliers, métadonnées rooms (autre repère), surfaces déclarés absents, rien de simulé", () => {
    for (const c of conversion.niveaux) {
      const n = NIVEAUX[c.niveauId]!;
      const absent = (f: string) => c.rapport.absents.find((a) => a.famille === f);
      expect(absent("columns")?.nombre).toBe(n.columns.length);
      expect(absent("stairs")?.nombre).toBe(n.stairs.length);
      expect(absent("rooms")?.raison).toMatch(/repère distinct/);
      expect(absent("niveau · areas")).toBeDefined();
      expect(c.rapport.conventions.map((x) => x.nom)).toContain("texte · hauteur");
      // Aucun solide, aucune extrusion, aucun objet hors des familles déclarées.
      const doc = DOCS.get(c.niveauId)!;
      expect(doc.solides ?? []).toEqual([]);
      expect(doc.objects.every((o) => o.type === "polyline" && !("extrusion" in o))).toBe(true);
    }
  });

  it("rapport exhaustif : union des clés du jeu P.118 − clés consommées − clés déclarées absentes = ∅", () => {
    const objets = (n: Brut, f: FamilleP118): Brut[] => f === "niveau" ? [n] : f === "layers" ? Object.values(n.layers ?? {}) as Brut[]
      : f === "paths · holes" ? (n.paths as Brut[]).flatMap((p) => p.holes ?? []) : (n[f] ?? []) as Brut[];
    expect(conversion.version).toBe(VERSION_CONVERSION_P118);
    for (const c of conversion.niveaux) {
      const n = NIVEAUX[c.niveauId]!;
      for (const f of FAMILLES_P118) {
        const presentes = new Map<string, number>();
        for (const o of objets(n, f)) for (const k of Object.keys(o)) presentes.set(k, (presentes.get(k) ?? 0) + 1);
        const declarees = new Set(c.rapport.absents.filter((a) => a.origine?.famille === f).flatMap((a) => a.origine!.cles));
        const reste = [...presentes.keys()].filter((k) => !CLES_CONSOMMEES_P118[f].includes(k) && !declarees.has(k));
        expect(reste, `${c.niveauId} · ${f}`).toEqual([]);
        // Une clé consommée n'est jamais déclarée absente ; chaque clé déclarée porte le compte des éléments qui l'ont.
        if (["rooms", "columns", "stairs"].includes(f)) {
          if (objets(n, f).length) expect(c.rapport.absents.find((a) => a.famille === f)?.nombre).toBe(objets(n, f).length);
          continue;
        }
        for (const a of c.rapport.absents.filter((x) => x.origine?.famille === f)) {
          expect(a.origine!.cles).toHaveLength(1);
          expect(CLES_CONSOMMEES_P118[f]).not.toContain(a.origine!.cles[0]);
          expect(a.nombre).toBe(presentes.get(a.origine!.cles[0]!));
        }
      }
    }
    // Échantillon : clés connues de l'exemple bien déclarées.
    const rdc = conversion.niveaux.find((c) => c.niveauId === "rdc")!;
    for (const f of ["walls · color", "walls · designRevision", "doors · layer", "doors · openingType", "paths · height", "paths · stairGroup", "layers · fill", "niveau · activeLayer", "niveau · exteriorWallIds"]) {
      expect(rdc.rapport.absents.some((a) => a.famille === f), f).toBe(true);
    }
  });

  it("nom d'un tracé hors local déclaré absent ; kind inattendu refusé ; étiquette d'un local jamais dans un trou", () => {
    const rdc = conversion.niveaux.find((c) => c.niveauId === "rdc")!;
    const horsLocaux = (NIVEAUX["rdc"]!.paths as Brut[]).filter((p) => p.name && !(p.role === "room" && p.closed !== false)).length;
    expect(rdc.rapport.absents.find((a) => a.famille === "paths · name (hors locaux)")?.nombre).toBe(horsLocaux);
    const carre = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const c = convertirNiveauP118({
      id: "x", name: "Essai", elevation: 0,
      walls: [{ id: "w1", kind: "door", a: [0, 0], b: [4, 0], thickness: 0.2, height: 3 }],
      paths: [
        { id: "P1", kind: "path", role: "room", name: "Patio", closed: true, points: carre, holes: [{ id: "H1", kind: "poly", poly: [[2, 2], [8, 2], [8, 8], [2, 8]] }] },
        { id: "P2", kind: "path", role: "room", name: "Hall", closed: true, points: carre.map(([x, y]) => [x! + 20, y!]) },
      ],
    });
    expect(c.rapport.refus).toEqual(expect.arrayContaining([
      expect.objectContaining({ famille: "walls", id: "w1" }),
      expect.objectContaining({ famille: "paths · room (nom)", id: "P1", raison: expect.stringMatching(/trou/) }),
    ]));
    expect(c.comptes.nomsLocaux).toBe(1);
    expect(de(c, "studio.dessin.texte").map((x) => (x.params as Brut).content)).toEqual(["Hall"]);
    validateStudioDocument(applyStudioCommands(newStudioDocument("essai-trou"), c.commandes));
  });

  it("noms des locaux : texte sur un calque dédié, à l'intérieur du tracé role = room, contenu = nom de l'exemple", () => {
    const n = NIVEAUX["rdc"]!;
    const c = conversion.niveaux.find((x) => x.niveauId === "rdc")!;
    const noms = de(c, "studio.dessin.texte").map((x) => x.params as Brut).filter((p) => p.layerId === CALQUE_NOMS_LOCAUX_P118.id);
    expect(noms.length).toBe(c.comptes.nomsLocaux);
    expect(noms.length).toBeGreaterThan(0);
    for (const t of noms) expect((n.paths as Brut[]).some((p) => p.role === "room" && `${p.id}-nom` === t.id && p.name === t.content)).toBe(true);
  });

  it("déterministe et pur : deux conversions identiques ; l'entrée n'est pas modifiée", () => {
    const avant = JSON.stringify(NIVEAUX["mezz"]);
    expect(JSON.stringify(convertirNiveauP118(NIVEAUX["mezz"]))).toBe(JSON.stringify(convertirNiveauP118(NIVEAUX["mezz"])));
    expect(JSON.stringify(NIVEAUX["mezz"])).toBe(avant);
  });

  it("refus explicites : mur sans épaisseur, porte hors de son mur, hôte absent", () => {
    const c = convertirNiveauP118({
      id: "x", name: "Essai", elevation: 0,
      layers: { Murs: { color: "#AABBCC", visible: true, locked: false } },
      walls: [
        { id: "w1", a: [0, 0], b: [4, 0], thickness: 0.2, height: 3, layer: "Murs" },
        { id: "w2", a: [0, 0], b: [0, 4], thickness: 0, height: 3, layer: "Murs" },
      ],
      doors: [
        { id: "d1", hostWallId: "w1", t: 0.5, width: 1, height: 2, sill: 0 },
        { id: "d2", hostWallId: "w1", t: 0.05, width: 1, height: 2, sill: 0 },
        { id: "d3", hostWallId: "w9", t: 0.5, width: 1, height: 2, sill: 0 },
      ],
    });
    expect(c.comptes).toMatchObject({ murs: 1, portes: 1, apparences: 1 });
    expect(c.rapport.refus.map((r) => r.id)).toEqual(["w2", "d2", "d3"]);
    const doc = applyStudioCommands(newStudioDocument("essai"), c.commandes);
    expect((doc.architecture ?? []).find((x) => x.id === "d1")).toMatchObject({ position: 1.5 });
    expect((doc.scenes ?? [])[0]).toMatchObject({ color: "#aabbcc" });
  });
});
