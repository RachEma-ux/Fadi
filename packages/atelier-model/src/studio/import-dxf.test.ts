import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_LIMITS, StudioValidationError, type StudioDocument, type StudioShape } from "./document-2d.js";
import { exportStudioDxf } from "./export.js";
import { lireDxfStudio, STUDIO_DXF_LIMITES, STUDIO_DXF_UNITES, type StudioDxfResultat } from "./import-dxf.js";
import { dxf, entete, ligne, lwpolyligne, polyligne, table } from "./import-dxf.fixtures.js";

const appliquer = (r: StudioDxfResultat, doc: StudioDocument = newStudioDocument("d")) => applyStudioCommands(doc, r.commandes);
const sansId = (o: StudioShape) => {
  const { id: _id, ...reste } = o;
  return reste;
};

describe("lireDxfStudio — DXF en millimètres", () => {
  const texte = dxf({
    insunits: 4,
    entites: [
      ligne(0, 0, 4000, 0),
      ligne(0, 0, 0, 3000, "MURS"),
      lwpolyligne([[1000, 1000], [3000, 1000], [3000, 2500], [1000, 2500]], { ferme: true }),
      "0\r\nCIRCLE\r\n8\r\n0\r\n10\r\n500\r\n20\r\n500\r\n30\r\n0\r\n40\r\n250",
    ],
  });

  it("convertit mm → m par un facteur explicite, sans bruit flottant", () => {
    const r = lireDxfStudio(texte);
    expect(r.statut).toBe("pret");
    expect(r.rapport.unite).toEqual({ code: 4, valeur: "mm", origine: "fichier" });
    expect(r.rapport.facteur).toBe(0.001);
    expect(r.rapport.entites).toEqual({ lignes: 2, rectangles: 1, segments: 0, total: 3 });
    expect(r.rapport.nonPris).toEqual([{ type: "CIRCLE", nombre: 1 }]);
    expect(r.rapport.bornes).toEqual({ min: { x: 0, y: 0 }, max: { x: 4, y: 3 } });
    expect(r.rapport.bornesFichier).toEqual({ min: { x: 0, y: 0 }, max: { x: 4000, y: 3000 } });
    const doc = appliquer(r);
    expect(doc.objects.map(sansId)).toEqual([
      { type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
      { type: "line", layerId: "dxf-calque-1", start: { x: 0, y: 0 }, end: { x: 0, y: 3 } },
      { type: "rectangle", origin: { x: 1, y: 1 }, width: 2, height: 1.5 },
    ]);
    expect(doc.layers).toEqual([{ id: "dxf-calque-1", name: "MURS", visible: true, locked: false }]);
    expect(r.rapport.calques).toEqual([
      { nom: "0", cible: "implicite", objets: 2 },
      { nom: "MURS", cible: "cree", id: "dxf-calque-1", objets: 1 },
    ]);
  });

  it("CRLF et LF donnent le même résultat ; déterministe", () => {
    const lf = texte.replace(/\r\n/g, "\n");
    expect(lireDxfStudio(lf)).toEqual(lireDxfStudio(texte));
    expect(lireDxfStudio(texte)).toEqual(lireDxfStudio(texte));
    expect(lireDxfStudio(texte.replace(/\r\n/g, "\r"))).toEqual(lireDxfStudio(texte));
  });

  it("chaque unité de $INSUNITS prise a son facteur exact (pouces : 0,0254 m)", () => {
    const pouce = lireDxfStudio(dxf({ insunits: 1, entites: [ligne(0, 0, 100, 0)] }));
    expect(pouce.rapport.unite.valeur).toBe("in");
    expect(appliquer(pouce).objects[0]).toMatchObject({ end: { x: 2.54, y: 0 } });
    const pied = lireDxfStudio(dxf({ insunits: 2, entites: [ligne(0, 0, 10, 0)] }));
    expect(appliquer(pied).objects[0]).toMatchObject({ end: { x: 3.048, y: 0 } });
    const cm = lireDxfStudio(dxf({ insunits: 5, entites: [ligne(0, 0, 123.4, 0)] }));
    expect(appliquer(cm).objects[0]).toMatchObject({ end: { x: 1.234, y: 0 } });
    for (const [nom, u] of Object.entries(STUDIO_DXF_UNITES)) {
      expect(lireDxfStudio(dxf({ insunits: u.insunits, entites: [] })).rapport.unite).toEqual({ code: u.insunits, valeur: nom, origine: "fichier" });
    }
  });
});

describe("lireDxfStudio — unité inconnue", () => {
  const sans = dxf({ entites: [ligne(0, 0, 250, 0), ligne(0, 0, 0, 100)] });

  it("sans $INSUNITS : aucune commande, rapport compté, l'unité doit être choisie", () => {
    const r = lireDxfStudio(sans);
    expect(r.statut).toBe("unite-inconnue");
    expect(r.commandes).toEqual([]);
    expect(r.rapport.unite).toEqual({ code: null, valeur: null, origine: "inconnue" });
    expect(r.rapport.facteur).toBeNull();
    expect(r.rapport.bornes).toBeNull();
    expect(r.rapport.bornesFichier).toEqual({ min: { x: 0, y: 0 }, max: { x: 250, y: 100 } });
    expect(r.rapport.entites.total).toBe(2);
  });

  it("$INSUNITS = 0 (sans unité) ou code non pris en charge : inconnue aussi", () => {
    expect(lireDxfStudio(dxf({ insunits: 0, entites: [ligne(0, 0, 1, 0)] })).statut).toBe("unite-inconnue");
    const parsec = lireDxfStudio(dxf({ insunits: 20, entites: [ligne(0, 0, 1, 0)] }));
    expect(parsec.statut).toBe("unite-inconnue");
    expect(parsec.rapport.unite).toEqual({ code: 20, valeur: null, origine: "inconnue" });
  });

  it("l'unité choisie par l'utilisateur sert seulement quand le fichier n'en déclare pas", () => {
    const r = lireDxfStudio(sans, { unite: "cm" });
    expect(r.statut).toBe("pret");
    expect(r.rapport.unite).toEqual({ code: null, valeur: "cm", origine: "choix" });
    expect(appliquer(r).objects.map((o) => (o.type === "line" ? o.end : null))).toEqual([{ x: 2.5, y: 0 }, { x: 0, y: 1 }]);
    // Le fichier déclare le mètre : le choix ne s'applique pas.
    const declare = lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 2, 0)] }), { unite: "mm" });
    expect(declare.rapport.unite).toEqual({ code: 6, valeur: "m", origine: "fichier" });
    expect(() => lireDxfStudio(sans, { unite: "pouce" as never })).toThrow(StudioValidationError);
  });
});

describe("lireDxfStudio — entités non prises, jamais écartées en silence", () => {
  it("ARC, CIRCLE, TEXT, MTEXT, INSERT, SPLINE, HATCH, DIMENSION, POINT… comptés par type", () => {
    const autres = ["ARC", "CIRCLE", "CIRCLE", "TEXT", "MTEXT", "INSERT", "SPLINE", "HATCH", "DIMENSION", "POINT", "ELLIPSE", "SOLID", "3DFACE"];
    const r = lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0), ...autres.map((t) => `0\r\n${t}\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0`)] }));
    expect(r.rapport.entites.total).toBe(1);
    expect(r.rapport.nonPris).toEqual([
      { type: "3DFACE", nombre: 1 }, { type: "ARC", nombre: 1 }, { type: "CIRCLE", nombre: 2 }, { type: "DIMENSION", nombre: 1 },
      { type: "ELLIPSE", nombre: 1 }, { type: "HATCH", nombre: 1 }, { type: "INSERT", nombre: 1 }, { type: "MTEXT", nombre: 1 },
      { type: "POINT", nombre: 1 }, { type: "SOLID", nombre: 1 }, { type: "SPLINE", nombre: 1 }, { type: "TEXT", nombre: 1 },
    ]);
  });

  it("segments courbes, polylignes 3D ou lissées, espace papier, hors plan XY, longueur nulle : comptés", () => {
    const r = lireDxfStudio(dxf({
      insunits: 6,
      entites: [
        lwpolyligne([[0, 0], [2, 0], [2, 2]], { bulges: [0, 1] }),
        polyligne([[0, 0], [1, 1], [2, 0]], { flags: 8 }),
        polyligne([[0, 0], [1, 1], [2, 0]], { flags: 4 }),
        ligne(0, 0, 1, 0, "0", ["67", "1"]),
        ligne(0, 0, 1, 0, "0", ["210", "0", "220", "0", "230", "-1"]),
        ligne(3, 3, 3, 3),
        lwpolyligne([[0, 0], [0, 0], [1, 0]]),
      ],
    }));
    expect(r.rapport.entites).toEqual({ lignes: 0, rectangles: 0, segments: 2, total: 2 });
    expect(r.rapport.nonPris).toEqual([
      { type: "LINE (espace papier)", nombre: 1 },
      { type: "LINE (hors plan XY)", nombre: 1 },
      { type: "LINE (longueur nulle)", nombre: 1 },
      { type: "LWPOLYLINE (segment courbe)", nombre: 1 },
      { type: "LWPOLYLINE (segment de longueur nulle)", nombre: 1 },
      { type: "POLYLINE (3D)", nombre: 1 },
      { type: "POLYLINE (lissée)", nombre: 1 },
    ]);
  });

  it("Z non nul : projeté sur le plan XY et compté dans zIgnores", () => {
    const r = lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0, "0", ["30", "2.5"]), ligne(0, 1, 1, 1)] }));
    expect(r.rapport.zIgnores).toBe(1);
    expect(r.rapport.entites.total).toBe(2);
  });

  it("les entités des blocs (section BLOCKS) ne sont pas dessinées ; INSERT est compté", () => {
    const blocs = "0\r\nSECTION\r\n2\r\nBLOCKS\r\n0\r\nBLOCK\r\n2\r\nB1\r\n" + ligne(0, 0, 9, 9) + "\r\n0\r\nENDBLK\r\n0\r\nENDSEC";
    const r = lireDxfStudio(dxf({ insunits: 6, avant: [blocs], entites: ["0\r\nINSERT\r\n2\r\nB1\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0"] }));
    expect(r.rapport.entites.total).toBe(0);
    expect(r.rapport.nonPris).toEqual([{ type: "INSERT", nombre: 1 }]);
  });
});

describe("lireDxfStudio — polylignes", () => {
  it("rectangle parallèle aux axes : 4 sommets, ou 5 avec le dernier égal au premier ; POLYLINE R12 aussi", () => {
    const quatre = lireDxfStudio(dxf({ insunits: 6, entites: [lwpolyligne([[2, 1], [2, 3], [0, 3], [0, 1]], { ferme: true })] }));
    expect(appliquer(quatre).objects.map(sansId)).toEqual([{ type: "rectangle", origin: { x: 0, y: 1 }, width: 2, height: 2 }]);
    const cinq = lireDxfStudio(dxf({ insunits: 6, entites: [lwpolyligne([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], { ferme: true })] }));
    expect(cinq.rapport.entites.rectangles).toBe(1);
    const r12 = lireDxfStudio(dxf({ insunits: 6, entites: [polyligne([[0, 0], [1, 0], [1, 1], [0, 1]], { flags: 1 })] }));
    expect(r12.rapport.entites.rectangles).toBe(1);
  });

  it("fermée non rectangulaire → un segment par côté ; ouverte → n − 1 segments ; papillon et losange non pris pour des rectangles", () => {
    const losange = lireDxfStudio(dxf({ insunits: 6, entites: [lwpolyligne([[1, 0], [2, 1], [1, 2], [0, 1]], { ferme: true })] }));
    expect(losange.rapport.entites).toEqual({ lignes: 0, rectangles: 0, segments: 4, total: 4 });
    const papillon = lireDxfStudio(dxf({ insunits: 6, entites: [lwpolyligne([[0, 0], [1, 1], [1, 0], [0, 1]], { ferme: true })] }));
    expect(papillon.rapport.entites.rectangles).toBe(0);
    const croise = lireDxfStudio(dxf({ insunits: 6, entites: [lwpolyligne([[0, 0], [1, 0], [0, 1], [1, 1]], { ferme: true })] }));
    expect(croise.rapport.entites.rectangles).toBe(0);
    const ouverte = lireDxfStudio(dxf({ insunits: 6, entites: [lwpolyligne([[0, 0], [1, 0], [1, 1], [0, 1]])] }));
    expect(ouverte.rapport.entites).toEqual({ lignes: 0, rectangles: 0, segments: 3, total: 3 });
    expect(appliquer(ouverte).objects).toHaveLength(3);
  });
});

describe("lireDxfStudio — identifiants et calques", () => {
  const fichier = dxf({
    insunits: 6,
    tables: [table([{ nom: "Murs" }, { nom: "Éteint", couleur: -3 }, { nom: "Gelé", flags: 1 }, { nom: "Verrou", flags: 4 }, { nom: "Vide" }])],
    entites: [ligne(0, 0, 1, 0, "Murs"), ligne(0, 1, 1, 1, "Éteint"), ligne(0, 2, 1, 2, "Gelé"), ligne(0, 3, 1, 3, "Verrou"), ligne(0, 4, 1, 4, "Hors table")],
  });

  it("calques de la table (visibilité, verrouillage) et noms portés par les entités ; un calque vide est listé, pas créé", () => {
    const r = lireDxfStudio(fichier);
    const doc = appliquer(r);
    expect(doc.layers).toEqual([
      { id: "dxf-calque-1", name: "Murs", visible: true, locked: false },
      { id: "dxf-calque-2", name: "Éteint", visible: false, locked: false },
      { id: "dxf-calque-3", name: "Gelé", visible: false, locked: false },
      { id: "dxf-calque-4", name: "Verrou", visible: true, locked: true },
      { id: "dxf-calque-5", name: "Hors table", visible: true, locked: false },
    ]);
    expect(r.rapport.calques.find((c) => c.nom === "Vide")).toEqual({ nom: "Vide", cible: "sans-objet", objets: 0 });
    // Ordre : calques créés, objets, puis verrouillages (sinon les objets ne pourraient pas y être posés).
    expect(r.commandes.map((c) => c.toolId)).toEqual([...Array(5).fill("studio.calque.creer"), ...Array(5).fill("studio.dessin.ligne"), "studio.calque.modifier"]);
  });

  it("identifiants « dxf-… » déterministes, sans collision avec ceux du document ; un calque de même nom est repris", () => {
    const base = applyStudioCommands(newStudioDocument("d"), [
      { toolId: "studio.calque.creer", params: { id: "dxf-calque-1", name: "Murs", visible: true, locked: false } },
      { toolId: "studio.dessin.ligne", params: { id: "dxf-1", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 5 } } },
      { toolId: "studio.dessin.ligne", params: { id: "dxf-3", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 6 } } },
    ]);
    const r = lireDxfStudio(fichier, { document: base });
    expect(r).toEqual(lireDxfStudio(fichier, { document: base }));
    const ids = r.commandes.flatMap((c) => (c.toolId === "studio.dessin.ligne" ? [c.params.id] : []));
    expect(ids).toEqual(["dxf-2", "dxf-4", "dxf-5", "dxf-6", "dxf-7"]);
    expect(r.rapport.calques[0]).toEqual({ nom: "Murs", cible: "existant", id: "dxf-calque-1", objets: 1 });
    const doc = appliquer(r, base);
    expect(doc.layers?.map((l) => l.id)).toEqual(["dxf-calque-1", "dxf-calque-2", "dxf-calque-3", "dxf-calque-4", "dxf-calque-5"]);
    expect(doc.objects).toHaveLength(7);
    // Le calque « Verrou » est désormais verrouillé dans le document : un second import qui y poserait un objet est refusé.
    expect(() => lireDxfStudio(fichier, { document: doc })).toThrow(/calque verrouillé dans le document : Verrou/);
    // Un second import ne heurte pas les identifiants du premier.
    const second = lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0, "Murs"), ligne(0, 0, 1, 0, "Nouveau")] }), { document: doc });
    expect(second.commandes.map((c) => ("id" in c.params ? c.params.id : null))).toEqual(["dxf-calque-6", "dxf-8", "dxf-9"]);
    expect(appliquer(second, doc).objects).toHaveLength(9);
  });

  it("calque cible verrouillé dans le document (repris par son nom, ou calque implicite) : refus explicite", () => {
    const verrou = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.calque.creer", params: { id: "m", name: "Murs", visible: true, locked: true } }]);
    expect(() => lireDxfStudio(fichier, { document: verrou })).toThrow(/calque verrouillé dans le document : Murs/);
    const implicite = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.calque.creer", params: { id: "default", name: "Calque 0", visible: true, locked: true } }]);
    expect(() => lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0)] }), { document: implicite })).toThrow(/calque implicite/);
  });

  it("nom de calque décodé (\\U+XXXX) et raccourci à la limite du modèle, signalé", () => {
    const long = "C".repeat(STUDIO_LIMITS.layerName + 5);
    const r = lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0, "MURS_EXT\\U+00C9RIEURS"), ligne(0, 0, 2, 0, long)] }));
    expect(appliquer(r).layers?.map((l) => l.name)).toEqual(["MURS_EXTÉRIEURS", "C".repeat(STUDIO_LIMITS.layerName)]);
    expect(r.rapport.calques[1]).toMatchObject({ nomRaccourci: true });
  });
});

describe("lireDxfStudio — aller-retour avec exportStudioDxf", () => {
  it("lignes, rectangles, calques (masqué, verrouillé) relus à l'identique ; cotes rendues en lignes + TEXT non pris", () => {
    const source = applyStudioCommands(newStudioDocument("src"), [
      { toolId: "studio.calque.creer", params: { id: "murs", name: "MURS", visible: true, locked: false } },
      { toolId: "studio.calque.creer", params: { id: "cache", name: "CACHE", visible: true, locked: false } },
      { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4.25, y: 0 } } },
      { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", layerId: "murs", start: { x: -1.5, y: 2 }, end: { x: 3, y: 7.125 } } },
      { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 1, y: 1 }, width: 2, height: 0.5 } },
      { toolId: "studio.calque.modifier", params: { id: "cache", name: "CACHE", visible: false, locked: true } },
    ]);
    const r = lireDxfStudio(exportStudioDxf(source));
    expect(r.rapport.unite).toEqual({ code: 6, valeur: "m", origine: "fichier" });
    expect(r.rapport.nonPris).toEqual([]);
    const relu = appliquer(r);
    const forme = (doc: StudioDocument) => doc.objects.map((o) => ({ ...sansId(o), layerId: doc.layers?.find((l) => l.id === o.layerId)?.name }));
    expect(forme(relu)).toEqual(forme(source));
    expect(relu.layers?.map(({ name, visible, locked }) => ({ name, visible, locked }))).toEqual([{ name: "MURS", visible: true, locked: false }, { name: "CACHE", visible: false, locked: true }]);

    const cote = applyStudioCommands(source, [{ toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4.25, y: 0 }, offset: 0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } }]);
    const avecCote = lireDxfStudio(exportStudioDxf(cote));
    expect(avecCote.rapport.nonPris).toEqual([{ type: "TEXT", nombre: 1 }]);
    expect(avecCote.rapport.entites.lignes).toBe(2 + 3);
  });
});

describe("lireDxfStudio — fichiers refusés et limites", () => {
  it("DXF binaire, code de groupe illisible, nombre invalide, section non terminée : refus explicite", () => {
    expect(() => lireDxfStudio("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(/DXF binaire/);
    expect(() => lireDxfStudio("0\nSECTION\nxx\nHEADER\n")).toThrow(/ligne 3 : code de groupe attendu/);
    expect(() => lireDxfStudio(dxf({ insunits: 6, entites: ["0\r\nLINE\r\n8\r\n0\r\n10\r\nabc\r\n20\r\n0\r\n11\r\n1\r\n21\r\n0"] }))).toThrow(/nombre attendu/);
    expect(() => lireDxfStudio("0\nSECTION\n2\nENTITIES\n0\nLINE\n")).toThrow(/non terminée/);
    expect(() => lireDxfStudio("0\nSECTION\n2")).toThrow(/valeur attendue/);
  });

  it("fichier vide ou sans entité : prêt, rien à ajouter", () => {
    const vide = lireDxfStudio(dxf({ insunits: 6, entites: [] }));
    expect(vide).toMatchObject({ statut: "pret", commandes: [], rapport: { bornes: null, entites: { total: 0 } } });
    expect(lireDxfStudio("").rapport.unite.origine).toBe("inconnue");
  });

  it(`fichier au-delà de ${STUDIO_DXF_LIMITES.octets / 1024 / 1024} Mo : refusé`, () => {
    expect(() => lireDxfStudio(" ".repeat(STUDIO_DXF_LIMITES.octets + 1))).toThrow(/Mo au plus/);
  });

  it("document qui dépasserait STUDIO_LIMITS.objects : refusé, jamais tronqué", () => {
    // Document écrit directement (et non par 19 999 commandes) : le test reste rapide.
    const base: StudioDocument = { ...newStudioDocument("d"), objects: Array.from({ length: STUDIO_LIMITS.objects - 1 }, (_, i) => ({ id: `l${i}`, type: "line" as const, start: { x: 0, y: i }, end: { x: 1, y: i } })) };
    const deux = dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0), ligne(0, 1, 1, 1)] });
    expect(() => lireDxfStudio(deux, { document: base })).toThrow(/20000 objets au plus/);
    expect(lireDxfStudio(dxf({ insunits: 6, entites: [ligne(0, 0, 1, 0)] }), { document: base }).commandes).toHaveLength(1);
  });

  it("en-tête lu même avec d'autres variables autour de $INSUNITS", () => {
    const r = lireDxfStudio(dxf({ insunits: 5, entete: entete({ $ACADVER: [1, "AC1027"], $MEASUREMENT: [70, "1"] }), entites: [ligne(0, 0, 100, 0)] }));
    expect(r.rapport.unite.valeur).toBe("cm");
  });
});
