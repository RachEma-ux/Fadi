import { describe, expect, it } from "vitest";
import { analyserSaisie, type ContexteSaisie, type ResultatSaisie } from "./saisie-vcb.js";

const PIED = 0.3048;
const POUCE = 0.0254;

const ctx = (attendu: ContexteSaisie["attendu"], extra: Omit<ContexteSaisie, "attendu"> = {}): ContexteSaisie => ({
  attendu,
  ...extra,
});
const FR = { separateurDecimal: "," } as const;

function longueur(r: ResultatSaisie): number {
  if (r.genre !== "longueur") throw new Error(`attendu longueur, reçu ${JSON.stringify(r)}`);
  return r.valeur;
}
function estErreur(r: ResultatSaisie): boolean {
  return r.genre === "erreur";
}

describe("longueurs et unités", () => {
  const L = ctx("longueur");
  it.each([
    ["3", 3],
    ["3m", 3],
    ["3 m", 3],
    ["  2.7m  ", 2.7],
    ["350mm", 0.35],
    ["34cm", 0.34],
    ["1.2km", 1200],
    ["6\"", 6 * POUCE],
    ["6in", 6 * POUCE],
    ["8'", 8 * PIED],
    ["8ft", 8 * PIED],
    ["5'10 3/4\"", 5 * PIED + 10.75 * POUCE],
    ["5' 6\"", 5 * PIED + 6 * POUCE],
    ["5'-6\"", 5 * PIED + 6 * POUCE],
    ["5'6", 5 * PIED + 6 * POUCE],
    ["3/4\"", 0.75 * POUCE],
    ["1 1/2\"", 1.5 * POUCE],
    [".5", 0.5],
    ["2M", 2],
  ])("« %s » → %f m", (texte, attendu) => {
    expect(longueur(analyserSaisie(texte, L))).toBeCloseTo(attendu, 10);
  });

  it("valeur nue = unité du modèle", () => {
    expect(longueur(analyserSaisie("250", ctx("longueur", { uniteModele: "mm" })))).toBeCloseTo(0.25, 12);
    expect(longueur(analyserSaisie("2", ctx("longueur", { uniteModele: "ft" })))).toBeCloseTo(2 * PIED, 12);
    expect(longueur(analyserSaisie("3/4", ctx("longueur", { uniteModele: "in" })))).toBeCloseTo(0.75 * POUCE, 12);
  });

  it("l'unité tapée prime sur l'unité du modèle", () => {
    expect(longueur(analyserSaisie("2m", ctx("longueur", { uniteModele: "mm" })))).toBe(2);
  });

  it("valeurs négatives = sens inverse", () => {
    expect(longueur(analyserSaisie("-3m", L))).toBe(-3);
    expect(longueur(analyserSaisie("- 35mm", L))).toBeCloseTo(-0.035, 12);
    expect(longueur(analyserSaisie("-5'6\"", L))).toBeCloseTo(-(5 * PIED + 6 * POUCE), 12);
  });

  it("virgule décimale en locale française", () => {
    expect(longueur(analyserSaisie("2,5", ctx("longueur", FR)))).toBe(2.5);
    expect(longueur(analyserSaisie("2,5 m", ctx("longueur", FR)))).toBe(2.5);
    expect(longueur(analyserSaisie("2.5", ctx("longueur", FR)))).toBe(2.5);
  });

  it.each(["", "   ", "abc", "3 m m", "1/0", "3 4", "3zz", "5'abc"])("erreur pour « %s »", (texte) => {
    const r = analyserSaisie(texte, L);
    expect(r.genre).toBe("erreur");
    if (r.genre === "erreur") expect(r.message.length).toBeGreaterThan(0);
  });

  it("en locale à point, la virgule n'est pas décimale pour une longueur seule", () => {
    expect(estErreur(analyserSaisie("2,5", L))).toBe(true);
  });
});

describe("dimensions « l,w »", () => {
  it("deux composantes avec unités", () => {
    expect(analyserSaisie("4m,3m", ctx("dimensions2"))).toEqual({ genre: "dimensions", valeurs: [4, 3] });
    expect(analyserSaisie("4 m , 3 m", ctx("dimensions2"))).toEqual({ genre: "dimensions", valeurs: [4, 3] });
  });

  it("pieds de la doc officielle « 8',20' »", () => {
    const r = analyserSaisie("8',20'", ctx("dimensions2"));
    expect(r.genre).toBe("dimensions");
    if (r.genre === "dimensions") {
      expect(r.valeurs[0]).toBeCloseTo(8 * PIED, 12);
      expect(r.valeurs[1]).toBeCloseTo(20 * PIED, 12);
    }
  });

  it("composante vide = inchangée", () => {
    expect(analyserSaisie("3,", ctx("dimensions2"))).toEqual({ genre: "dimensions", valeurs: [3, null] });
    expect(analyserSaisie(",3", ctx("dimensions2"))).toEqual({ genre: "dimensions", valeurs: [null, 3] });
    expect(analyserSaisie("5", ctx("dimensions2"))).toEqual({ genre: "dimensions", valeurs: [5, null] });
  });

  it("négatives", () => {
    expect(analyserSaisie("-24,-24", ctx("dimensions2", { uniteModele: "in" }))).toEqual({
      genre: "dimensions",
      valeurs: [-24 * POUCE, -24 * POUCE],
    });
  });

  it("locale française : « ; » sépare, « , » est décimal", () => {
    expect(analyserSaisie("4,5;3", ctx("dimensions2", FR))).toEqual({ genre: "dimensions", valeurs: [4.5, 3] });
    expect(analyserSaisie("4,5", ctx("dimensions2", FR))).toEqual({ genre: "dimensions", valeurs: [4.5, null] });
  });

  it("locale française : « 4m,3m » est refusé avec un conseil", () => {
    const r = analyserSaisie("4m,3m", ctx("dimensions2", FR));
    expect(r.genre).toBe("erreur");
    if (r.genre === "erreur") expect(r.message).toContain("« ; »");
  });

  it("« ; » est aussi accepté en locale à point", () => {
    expect(analyserSaisie("4;3", ctx("dimensions2"))).toEqual({ genre: "dimensions", valeurs: [4, 3] });
  });

  it("trois composantes", () => {
    expect(analyserSaisie("1,,3", ctx("dimensions3"))).toEqual({ genre: "dimensions", valeurs: [1, null, 3] });
    expect(analyserSaisie("1,2", ctx("dimensions3"))).toEqual({ genre: "dimensions", valeurs: [1, 2, null] });
  });

  it("erreurs : trop de valeurs, tout vide, composante invalide", () => {
    expect(estErreur(analyserSaisie("1,2,3", ctx("dimensions2")))).toBe(true);
    expect(estErreur(analyserSaisie(",", ctx("dimensions2")))).toBe(true);
    expect(estErreur(analyserSaisie("4m,zz", ctx("dimensions2")))).toBe(true);
    expect(estErreur(analyserSaisie("1,2,3,4", ctx("dimensions3")))).toBe(true);
  });
});

describe("coordonnées absolues et relatives", () => {
  it("[x,y,z] absolu", () => {
    expect(analyserSaisie("[1,2,3]", ctx("longueur-ou-point"))).toEqual({
      genre: "point",
      reference: "absolue",
      point: { x: 1, y: 2, z: 3 },
    });
  });

  it("<x,y,z> relatif avec unités et espaces", () => {
    const r = analyserSaisie("< 1m , -50cm , 2' >", ctx("distance-reseau"));
    expect(r.genre).toBe("point");
    if (r.genre === "point") {
      expect(r.reference).toBe("relative");
      expect(r.point.x).toBe(1);
      expect(r.point.y).toBeCloseTo(-0.5, 12);
      expect(r.point.z).toBeCloseTo(2 * PIED, 12);
    }
  });

  it("locale française", () => {
    expect(analyserSaisie("[1,5;2;0]", ctx("longueur-ou-point", FR))).toEqual({
      genre: "point",
      reference: "absolue",
      point: { x: 1.5, y: 2, z: 0 },
    });
  });

  it("erreurs : nombre de coordonnées, crochets mal appariés, coordonnée vide", () => {
    expect(estErreur(analyserSaisie("[1,2]", ctx("longueur-ou-point")))).toBe(true);
    expect(estErreur(analyserSaisie("[1,2,3>", ctx("longueur-ou-point")))).toBe(true);
    expect(estErreur(analyserSaisie("[1,,3]", ctx("longueur-ou-point")))).toBe(true);
  });

  it("un point n'est pas accepté là où seule une longueur est attendue", () => {
    expect(estErreur(analyserSaisie("[1,2,3]", ctx("longueur")))).toBe(true);
  });
});

describe("segments, côtés et rayons", () => {
  it("« 24s » et « 8S »", () => {
    expect(analyserSaisie("24s", ctx("rayon"))).toEqual({ genre: "segments", nombre: 24 });
    expect(analyserSaisie("8S", ctx("arc"))).toEqual({ genre: "segments", nombre: 8 });
    expect(analyserSaisie("10s", ctx("angle-arc"))).toEqual({ genre: "segments", nombre: 10 });
  });

  it("côtés nus avant le 1er clic, bornes 3 à 999", () => {
    expect(analyserSaisie("12", ctx("cotes"))).toEqual({ genre: "segments", nombre: 12 });
    expect(analyserSaisie("6s", ctx("cotes"))).toEqual({ genre: "segments", nombre: 6 });
    expect(analyserSaisie("3", ctx("cotes"))).toEqual({ genre: "segments", nombre: 3 });
    expect(analyserSaisie("999", ctx("cotes"))).toEqual({ genre: "segments", nombre: 999 });
    const r = analyserSaisie("1000", ctx("cotes"));
    expect(r.genre).toBe("erreur");
    if (r.genre === "erreur") expect(r.message).toContain("entre 3 et 999");
    expect(estErreur(analyserSaisie("2s", ctx("rayon")))).toBe(true);
    expect(estErreur(analyserSaisie("4.5", ctx("cotes")))).toBe(true);
  });

  it("Divide : entier de segments", () => {
    expect(analyserSaisie("3", ctx("segments"))).toEqual({ genre: "segments", nombre: 3 });
    expect(estErreur(analyserSaisie("0", ctx("segments")))).toBe(true);
    expect(estErreur(analyserSaisie("2.5", ctx("segments")))).toBe(true);
  });

  it("rayon de cercle", () => {
    expect(analyserSaisie("34cm", ctx("rayon"))).toEqual({ genre: "rayon", valeur: 0.34, mode: null, rayonSommet: 0.34 });
    expect(estErreur(analyserSaisie("-1m", ctx("rayon")))).toBe(true);
    expect(estErreur(analyserSaisie("0", ctx("rayon")))).toBe(true);
  });

  it("polygone inscrit : rayon au sommet", () => {
    expect(analyserSaisie("1m", ctx("rayon", { polygone: { mode: "inscrit", cotes: 6 } }))).toEqual({
      genre: "rayon",
      valeur: 1,
      mode: "inscrit",
      rayonSommet: 1,
    });
  });

  it("polygone circonscrit : rayon = apothème", () => {
    const r = analyserSaisie("1m", ctx("rayon", { polygone: { mode: "circonscrit", cotes: 6 } }));
    expect(r.genre).toBe("rayon");
    if (r.genre === "rayon") {
      expect(r.mode).toBe("circonscrit");
      expect(r.rayonSommet).toBeCloseTo(1 / Math.cos(Math.PI / 6), 12);
    }
    const sansCotes = analyserSaisie("1m", ctx("rayon", { polygone: { mode: "circonscrit", cotes: 1 } }));
    expect(sansCotes.genre === "rayon" && sansCotes.rayonSommet === null).toBe(true);
  });

  it("arc : « 24r » = rayon, longueur nue = corde ou flèche", () => {
    expect(analyserSaisie("24r", ctx("arc", { uniteModele: "in" }))).toEqual({
      genre: "rayon",
      valeur: 24 * POUCE,
      mode: null,
      rayonSommet: 24 * POUCE,
    });
    expect(analyserSaisie("2m R", ctx("arc"))).toEqual({ genre: "rayon", valeur: 2, mode: null, rayonSommet: 2 });
    expect(analyserSaisie("0.5m", ctx("arc"))).toEqual({ genre: "longueur", valeur: 0.5 });
  });
});

describe("angles et pentes", () => {
  it("degrés décimaux", () => {
    const r = analyserSaisie("34.1", ctx("angle"));
    expect(r.genre).toBe("angle");
    if (r.genre === "angle") {
      expect(r.degres).toBe(34.1);
      expect(r.radians).toBeCloseTo((34.1 * Math.PI) / 180, 12);
      expect(r.source).toBe("degres");
    }
  });

  it("négatif = antihoraire, « ° » toléré, virgule française", () => {
    const n = analyserSaisie("-90", ctx("angle-reseau"));
    expect(n.genre === "angle" && n.degres === -90).toBe(true);
    const d = analyserSaisie("45°", ctx("angle"));
    expect(d.genre === "angle" && d.degres === 45).toBe(true);
    const f = analyserSaisie("22,5", ctx("angle", FR));
    expect(f.genre === "angle" && f.degres === 22.5).toBe(true);
  });

  it("pente « 1:2 » → atan(1/2) ≈ 26,57°", () => {
    const r = analyserSaisie("1:2", ctx("angle-reseau"));
    expect(r.genre).toBe("angle");
    if (r.genre === "angle") {
      expect(r.source).toBe("pente");
      expect(r.radians).toBeCloseTo(Math.atan(0.5), 12);
      expect(r.degres).toBeCloseTo(26.565, 3);
    }
    const p = analyserSaisie("8 : 12", ctx("angle"));
    expect(p.genre === "angle" && Math.abs(p.radians - Math.atan(8 / 12)) < 1e-12).toBe(true);
  });

  it("erreurs d'angle", () => {
    expect(estErreur(analyserSaisie("0:0", ctx("angle")))).toBe(true);
    expect(estErreur(analyserSaisie("1:2:3", ctx("angle")))).toBe(true);
    expect(estErreur(analyserSaisie("a:b", ctx("angle")))).toBe(true);
    expect(estErreur(analyserSaisie("3m", ctx("angle")))).toBe(true);
  });

  it("longueur, angle (Rotated Rectangle)", () => {
    expect(analyserSaisie("2 m , 90", ctx("longueur-angle"))).toEqual({
      genre: "longueur-angle",
      longueur: 2,
      angle: { degres: 90, radians: Math.PI / 2 },
    });
    expect(analyserSaisie("3m", ctx("longueur-angle"))).toEqual({ genre: "longueur-angle", longueur: 3, angle: null });
    const a = analyserSaisie(",30", ctx("longueur-angle"));
    expect(a.genre === "longueur-angle" && a.longueur === null && a.angle?.degres === 30).toBe(true);
    expect(estErreur(analyserSaisie("2m,zz", ctx("longueur-angle")))).toBe(true);
    expect(estErreur(analyserSaisie("1,2,3", ctx("longueur-angle")))).toBe(true);
  });
});

describe("réseaux", () => {
  it.each([
    ["x5", "copies", 5],
    ["X5", "copies", 5],
    ["*5", "copies", 5],
    ["5x", "copies", 5],
    ["5*", "copies", 5],
    [" x 3 ", "copies", 3],
    ["/5", "divisions", 5],
    ["5/", "divisions", 5],
  ] as const)("« %s » → %s × %i", (texte, mode, nombre) => {
    const r = analyserSaisie(texte, ctx("distance-reseau"));
    expect(r).toEqual({
      genre: "reseau",
      mode,
      nombre,
      objets: nombre + 1,
      fractionPas: mode === "copies" ? 1 : 1 / nombre,
    });
  });

  it("réseau polaire (Rotate)", () => {
    const r = analyserSaisie("x5", ctx("angle-reseau"));
    expect(r.genre === "reseau" && r.objets === 6).toBe(true);
  });

  it("une fraction n'est pas un réseau", () => {
    expect(analyserSaisie("3/4", ctx("distance-reseau"))).toEqual({ genre: "longueur", valeur: 0.75 });
  });

  it("erreurs de réseau", () => {
    expect(estErreur(analyserSaisie("x0", ctx("distance-reseau")))).toBe(true);
    expect(estErreur(analyserSaisie("x2.5", ctx("distance-reseau")))).toBe(true);
    expect(estErreur(analyserSaisie("x-3", ctx("distance-reseau")))).toBe(true);
    expect(estErreur(analyserSaisie("x5", ctx("longueur")))).toBe(true);
  });

  it("distance simple dans Move", () => {
    expect(analyserSaisie("-35mm", ctx("distance-reseau"))).toEqual({ genre: "longueur", valeur: -0.035 });
  });
});

describe("échelle", () => {
  it("facteur, miroir, facteurs multiples", () => {
    expect(analyserSaisie("1.5", ctx("echelle"))).toEqual({ genre: "echelle", facteurs: [1.5] });
    expect(analyserSaisie("-1", ctx("echelle"))).toEqual({ genre: "echelle", facteurs: [-1] });
    expect(analyserSaisie("2,3", ctx("echelle"))).toEqual({ genre: "echelle", facteurs: [2, 3] });
    expect(analyserSaisie("2,3,4", ctx("echelle"))).toEqual({ genre: "echelle", facteurs: [2, 3, 4] });
    expect(analyserSaisie("2,,4", ctx("echelle"))).toEqual({ genre: "echelle", facteurs: [2, null, 4] });
  });

  it("locale française", () => {
    expect(analyserSaisie("2,5", ctx("echelle", FR))).toEqual({ genre: "echelle", facteurs: [2.5] });
    expect(analyserSaisie("2;3", ctx("echelle", FR))).toEqual({ genre: "echelle", facteurs: [2, 3] });
  });

  it("longueur cible avec unité", () => {
    expect(analyserSaisie("3m", ctx("echelle"))).toEqual({ genre: "echelle-cible", longueurs: [3] });
    const r = analyserSaisie("6'", ctx("echelle"));
    expect(r.genre === "echelle-cible" && Math.abs((r.longueurs[0] ?? 0) - 6 * PIED) < 1e-12).toBe(true);
  });

  it("erreurs d'échelle", () => {
    expect(estErreur(analyserSaisie("0", ctx("echelle")))).toBe(true);
    expect(estErreur(analyserSaisie("2,3m", ctx("echelle")))).toBe(true);
    expect(estErreur(analyserSaisie("1,2,3,4", ctx("echelle")))).toBe(true);
    expect(estErreur(analyserSaisie("deux", ctx("echelle")))).toBe(true);
    expect(estErreur(analyserSaisie("0m", ctx("echelle")))).toBe(true);
  });
});

describe("champ de vision, texte, aucune saisie", () => {
  it("degrés ou focale", () => {
    expect(analyserSaisie("60", ctx("champ-vision"))).toEqual({ genre: "champ-vision", degres: 60 });
    expect(analyserSaisie("35 deg", ctx("champ-vision"))).toEqual({ genre: "champ-vision", degres: 35 });
    expect(analyserSaisie("50mm", ctx("champ-vision"))).toEqual({ genre: "focale", millimetres: 50 });
    expect(estErreur(analyserSaisie("0", ctx("champ-vision")))).toBe(true);
    expect(estErreur(analyserSaisie("200", ctx("champ-vision")))).toBe(true);
  });

  it("texte libre rendu tel quel", () => {
    expect(analyserSaisie("  Façade sud  ", ctx("texte"))).toEqual({ genre: "texte", texte: "Façade sud" });
  });

  it("outil sans saisie", () => {
    expect(estErreur(analyserSaisie("3m", ctx("aucune")))).toBe(true);
  });

  it("ne lève jamais d'exception", () => {
    const bizarres = ["[", "<>", "]", "x", "/", "*", ":", "'", "\"", "-", "1/", "s", "r", "°", "[[1,2,3]]", "1e5", "NaN"];
    for (const attendu of [
      "longueur",
      "longueur-ou-point",
      "distance-reseau",
      "dimensions2",
      "dimensions3",
      "longueur-angle",
      "rayon",
      "arc",
      "cotes",
      "segments",
      "angle",
      "angle-arc",
      "angle-reseau",
      "echelle",
      "champ-vision",
    ] as const) {
      for (const b of bizarres) {
        expect(() => analyserSaisie(b, ctx(attendu))).not.toThrow();
      }
    }
  });
});
