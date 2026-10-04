import { describe, expect, it } from "vitest";
import type { DessinPlan } from "../socle";
import { accrocher, REGLAGES_INITIAUX, type CandidatAccrochage, type ReglagesAccrochage } from "./accrochage";
import { admisParFiltre, basculerGroupe, filtrerParClasse, groupesPresents, lasso, modeClic, objetSousPointeur } from "./choix";
import { arcTrigo, dessinerEsquisse, traitsHachure } from "./dessinateurs";
import { cosSinDeg, courbeSpline, intersectionSegments, polaire, simplifier } from "./geometrie";
import { indicateurProfil, seRecoupe } from "./profil";
import { analyserSaisie, formaterValeur, lireLongueur, ouvreSaisie } from "./saisie";
import { ajusterEmprise, CADRE_INITIAL, deplacerVue, lignesGrille, pixelsEnMetres, rectangleVisible, transformationSvg, versEcran, versMetres, zoomerVue } from "./vue";
import { cmd, deg, etatDeTest, m, P } from "./__tests__/contexte-de-test";

const seg = (id: string, ...p: [number, number][]): CandidatAccrochage => ({ objetId: id, segments: p.slice(1).map((q, i) => ({ a: P(...(p[i] as [number, number])), b: P(...q) })), points: [] });
const demande = (x: number, y: number, o: { ref?: [number, number]; tol?: number; ortho?: boolean } = {}) => ({ point: { x, y }, reference: o.ref ? { x: o.ref[0], y: o.ref[1] } : null, tolerance: o.tol ?? 0.2, orthogonal: o.ortho ?? false });
const sansGrille: ReglagesAccrochage = { ...REGLAGES_INITIAUX, modes: { ...REGLAGES_INITIAUX.modes, grille: false } };

describe("vue : écran ⇄ mètres (y vers le haut), pan, zoom, emprise", () => {
  const c = { zoom: 50, origineX: 10, origineY: 20, largeur: 800, hauteur: 600 };
  it("aller-retour exact, y retourné, tolérance px → m", () => {
    expect(versMetres(c, { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
    expect(versMetres(c, { x: 100, y: 50 })).toEqual({ x: 12, y: 19 });
    expect(versEcran(c, { x: 12, y: 19 })).toEqual({ x: 100, y: 50 });
    expect(pixelsEnMetres(c, 8)).toBe(0.16);
    expect(transformationSvg(c)).toBe("matrix(50 0 0 -50 -500 1000)");
  });
  it("le zoom garde fixe le point sous le pivot ; le pan suit le pointeur", () => {
    const pivot = { x: 320, y: 240 };
    const avant = versMetres(c, pivot);
    const z = zoomerVue(c, 2, pivot);
    expect(z.zoom).toBe(100);
    const apres = versMetres(z, pivot);
    expect(apres.x).toBeCloseTo(avant.x, 12);
    expect(apres.y).toBeCloseTo(avant.y, 12);
    const p = deplacerVue(c, 50, -25);
    expect(versMetres(p, { x: 150, y: 25 })).toEqual(versMetres(c, { x: 100, y: 50 }));
  });
  it("ajuster à l'emprise : toute l'emprise visible, centrée", () => {
    const a = ajusterEmprise({ ...CADRE_INITIAL, largeur: 400, hauteur: 300 }, { minX: 0, minY: 0, maxX: 10, maxY: 5 }, 0);
    expect(a.zoom).toBe(40);
    const v = rectangleVisible(a);
    expect(v.minX).toBeCloseTo(0, 9);
    expect(v.maxX).toBeCloseTo(10, 9);
    expect((v.minY + v.maxY) / 2).toBeCloseTo(2.5, 9);
  });
  it("grille 0,50 m, pas multiplié par 10 quand l'écart devient illisible", () => {
    expect(lignesGrille({ ...c, zoom: 40 }, 0.5).pas).toBe(0.5);
    expect(lignesGrille({ ...c, zoom: 4 }, 0.5).pas).toBe(5);
    const g = lignesGrille({ zoom: 20, origineX: 0, origineY: 1, largeur: 20, hauteur: 20 }, 0.5);
    expect(g.verticales).toEqual([0, 10, 20]);
  });
});

describe("géométrie pure", () => {
  it("angles multiples de 90° exacts (DA-02-16)", () => {
    expect(cosSinDeg(90)).toEqual([0, 1]);
    expect(cosSinDeg(-90)).toEqual([0, -1]);
    expect(polaire({ x: 1, y: 1 }, 4.5, 90)).toMatchObject({ x: 1, y: 5.5 });
    expect(polaire({ x: 0, y: 0 }, 2, 180)).toMatchObject({ x: -2, y: 0 });
  });
  it("intersection de segments ; parallèles → aucune", () => {
    expect(intersectionSegments({ a: { x: 0, y: 0 }, b: { x: 4, y: 4 } }, { a: { x: 0, y: 4 }, b: { x: 4, y: 0 } })).toEqual({ x: 2, y: 2 });
    expect(intersectionSegments({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 1 }, b: { x: 4, y: 1 } })).toBeNull();
    expect(intersectionSegments({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { a: { x: 2, y: -1 }, b: { x: 2, y: 1 } })).toBeNull();
  });
  it("simplification RDP : la ligne droite bruitée devient deux points", () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.1, y: (i % 2) * 0.001 }));
    expect(simplifier(pts, 0.01)).toHaveLength(2);
    const coude = [...Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 })), ...Array.from({ length: 10 }, (_, i) => ({ x: 9, y: i + 1 }))];
    expect(simplifier(coude, 0.01)).toEqual([{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 10 }]);
  });
  it("spline de passage : passe par les points donnés", () => {
    const c = courbeSpline([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], "passage", 3, false, 4);
    expect(c[0]).toEqual({ x: 0, y: 0 });
    expect(c[4]?.x).toBeCloseTo(1, 9);
    expect(c[4]?.y).toBeCloseTo(1, 9);
    expect(c.at(-1)?.x).toBeCloseTo(2, 9);
  });
});

describe("accrochages (DA-02-15)", () => {
  const ligne = seg("L", [0, 0], [4, 0]);
  it("milieu exact de (0;0)–(4;0)", () => {
    const r = accrocher(demande(2.05, 0.05), [ligne], sansGrille);
    expect(r.point).toMatchObject({ x: 2, y: 0, frame: "local", unit: "m" });
    expect(r.accrochage).toEqual({ type: "milieu", objetId: "L", libelle: "Milieu" });
  });
  it("extrémité, intersection, perpendiculaire, sur l'objet", () => {
    expect(accrocher(demande(3.9, 0.1), [ligne], sansGrille).accrochage.type).toBe("extremite");
    const croix = [seg("A", [0, 0], [4, 4]), seg("B", [0, 4], [4, 0])];
    const i = accrocher(demande(2.1, 2.05), croix, sansGrille);
    expect([i.point.x, i.point.y, i.accrochage.type]).toEqual([2, 2, "intersection"]);
    const perp = accrocher(demande(1.05, 0.1, { ref: [1, 3] }), [ligne], { ...sansGrille, modes: { ...sansGrille.modes, objet: false } });
    expect([perp.point.x, perp.point.y, perp.accrochage.type]).toEqual([1, 0, "perpendiculaire"]);
    const sur = accrocher(demande(1.3, 0.1), [ligne], sansGrille);
    expect([sur.point.x, sur.point.y, sur.accrochage.type]).toEqual([1.3, 0, "objet"]);
  });
  it("grille 0,50 : (1,26 ; 0,74) → (1,5 ; 0,5) ; priorité : extrémité à 5 px et grille plus proche → extrémité", () => {
    const g = accrocher(demande(1.26, 0.74), [], REGLAGES_INITIAUX);
    expect([g.point.x, g.point.y, g.accrochage.type]).toEqual([1.5, 0.5, "grille"]);
    // zoom 40 px/m : 5 px = 0,125 m ; tolérance 8 px = 0,2 m.
    const e = accrocher(demande(4.1, 0.075, { tol: 0.2 }), [seg("L", [0, 0.05], [4.0, 0.05])], REGLAGES_INITIAUX);
    expect(e.accrochage.type).toBe("extremite");
  });
  it("orthogonal avec Maj : coordonnée exacte de la référence, l'autre sur la grille", () => {
    const o = accrocher(demande(3.3, 1.2, { ref: [1, 1], ortho: true }), [], REGLAGES_INITIAUX);
    expect([o.point.x, o.point.y, o.accrochage.type]).toEqual([3.5, 1, "orthogonal"]);
    const v = accrocher(demande(1.2, 3.31, { ref: [1, 1], ortho: true }), [], sansGrille);
    expect([v.point.x, v.point.y]).toEqual([1, 3.31]);
  });
  it("désactivé → point brut ; rien dans le rayon → brut ; déterminisme ; point d'un autre repère ignoré", () => {
    expect(accrocher(demande(2.05, 0.05), [ligne], { ...REGLAGES_INITIAUX, actif: false }).accrochage.type).toBe("aucun");
    expect(accrocher(demande(9, 9), [ligne], sansGrille)).toEqual({ point: P(9, 9), accrochage: { type: "aucun", libelle: "" } });
    const deux = [seg("Z", [0, 0], [4, 0]), seg("A", [0, 0], [0, 4])];
    expect(accrocher(demande(0.05, 0.05), deux, sansGrille)).toEqual(accrocher(demande(0.05, 0.05), [...deux].reverse(), sansGrille));
    expect(accrocher(demande(0.05, 0.05), deux, sansGrille).accrochage.objetId).toBe("A");
    const autre: CandidatAccrochage = { objetId: "X", segments: [], points: [P(0, 0, "registration-8.19")] };
    expect(accrocher(demande(0.01, 0.01), [autre], sansGrille).accrochage.type).toBe("aucun");
  });
});

const dessin = (id: string, couche: DessinPlan["couche"], pts: [number, number][], contour = false): DessinPlan => ({
  objetId: id,
  couche,
  formes: [{ forme: "polyligne", points: pts.map((p) => P(...p)), fermee: contour, style: "trait" }],
  segments: pts.slice(1).map((q, i) => ({ a: P(...(pts[i] as [number, number])), b: P(...q) })),
  points: [],
  contour: contour ? pts.map((p) => P(...p)) : null,
});

describe("sélection : clic, lasso, filtre par classe", () => {
  const dalle = dessin("D", "fond", [[0, 0], [10, 0], [10, 10], [0, 10]], true);
  const ligne = dessin("L", "objet", [[2, 2], [4, 2]]);
  const loin = dessin("Z", "objet", [[20, 20], [22, 20]]);
  it("objet sous le pointeur : segment le plus proche, intérieur de contour, couche du dessus", () => {
    expect(objetSousPointeur([dalle, ligne], { x: 3, y: 2.05 }, 0.1)).toBe("L");
    expect(objetSousPointeur([dalle, ligne], { x: 6, y: 6 }, 0.1)).toBe("D");
    expect(objetSousPointeur([dalle, ligne], { x: 30, y: 30 }, 0.1)).toBeNull();
    expect(objetSousPointeur([dalle, ligne], { x: 3, y: 2.05 }, 0.1, (id) => id !== "L")).toBe("D");
  });
  it("lasso de gauche à droite : entièrement inclus ; de droite à gauche : touchés", () => {
    expect(lasso([dalle, ligne, loin], { x: 1, y: 1 }, { x: 5, y: 3 })).toEqual(["L"]);
    expect(lasso([dalle, ligne, loin], { x: 5, y: 3 }, { x: 3, y: 1 })).toEqual(["D", "L"]);
    expect(lasso([dalle, ligne, loin], { x: 25, y: 25 }, { x: 21, y: 19 })).toEqual(["Z"]);
  });
  it("modes de clic : Maj ajoute, Ctrl bascule", () => {
    expect(modeClic({ maj: true, ctrl: false })).toBe("ajouter");
    expect(modeClic({ maj: false, ctrl: true })).toBe("basculer");
    expect(modeClic({ maj: false, ctrl: false })).toBe("remplacer");
  });
  it("filtre par classe : esquisses groupées, bascule, retour à « toutes »", () => {
    const etat = etatDeTest(
      cmd("esquisse.ligne", { id: "L", niveauId: "rdc", calqueId: "C1", a: P(2, 2), b: P(4, 2) }),
      cmd("esquisse.cercle", { id: "C", niveauId: "rdc", calqueId: "C1", centre: P(0, 0), rayon: m(1) }),
      cmd("dalle.creer", { id: "D", niveauId: "rdc", calqueId: "C1", contour: [P(0, 0), P(10, 0), P(10, 10), P(0, 10)], trous: [], epaisseur: m(0.2), decalageBase: m(0) }),
    );
    const d = [dessin("L", "objet", [[0, 0], [1, 0]]), dessin("C", "objet", [[0, 0], [1, 0]]), dessin("D", "fond", [[0, 0], [1, 0]])];
    expect(groupesPresents(d, etat)).toEqual(["dalle", "esquisse"]);
    const f = basculerGroupe(null, "dalle", ["dalle", "esquisse"]);
    expect([...(f ?? [])]).toEqual(["esquisse"]);
    expect(filtrerParClasse(["L", "D", "C"], etat, f)).toEqual(["L", "C"]);
    expect(admisParFiltre(etat, f)("D")).toBe(false);
    expect(basculerGroupe(f, "dalle", ["dalle", "esquisse"])).toBeNull();
  });
});

describe("saisie de précision (DA-01-01, D-022)", () => {
  it("nombres, virgule ou point, unités converties avant envoi", () => {
    expect(analyserSaisie("4,5", "m", null)).toEqual({ genre: "valeur", valeur: 4.5 });
    expect(analyserSaisie("4.5", "m", null)).toEqual({ genre: "valeur", valeur: 4.5 });
    expect(analyserSaisie("450 cm", "m", null)).toEqual({ genre: "valeur", valeur: 4.5 });
    expect(lireLongueur("4500mm")).toBe(4.5);
    expect(analyserSaisie("90°", "°", null)).toEqual({ genre: "valeur", valeur: 90 });
  });
  it("absolu x;y, relatif @dx;dy, polaire @l<a exacts", () => {
    expect(analyserSaisie("2,5;3", "m", null)).toMatchObject({ genre: "point", point: { x: 2.5, y: 3 } });
    expect(analyserSaisie("2.5;3", "m", null)).toMatchObject({ genre: "point", point: { x: 2.5, y: 3 } });
    expect(analyserSaisie("@2;-1", "m", { x: 1, y: 1 })).toMatchObject({ genre: "point", point: { x: 3, y: 0 } });
    expect(analyserSaisie("@4,5<90", "m", { x: 1, y: 1 })).toMatchObject({ genre: "point", point: { x: 1, y: 5.5, frame: "local", unit: "m" } });
  });
  it("erreurs lisibles « objet, cause, action » : vide, non numérique, unité inconnue, sans point de départ", () => {
    const e = (r: ReturnType<typeof analyserSaisie>) => (r.genre === "erreur" ? r.erreur : null);
    expect(e(analyserSaisie("abc", "m", null))?.cause).toBe("nombre attendu");
    expect(e(analyserSaisie("3 pouces", "m", null))?.cause).toMatch(/unité inconnue/);
    expect(e(analyserSaisie("", "m", null))?.cause).toBe("valeur vide");
    expect(e(analyserSaisie("@1<0", "m", null))?.cause).toBe("aucun point de départ");
    expect(e(analyserSaisie("4<5", "m", { x: 0, y: 0 }))?.action).toMatch(/@longueur<angle/);
  });
  it("ouverture par frappe et affichage (m à 2 décimales, ° à 1)", () => {
    expect(["4", "@", "-", ",", "a", "Enter"].map(ouvreSaisie)).toEqual([true, true, true, true, false, false]);
    expect(formaterValeur(4.499999, "m")).toBe("4,50 m");
    expect(formaterValeur(90, "°")).toBe("90,0°");
    expect(formaterValeur(null, "m")).toBe("—");
  });
});

describe("dessinateurs et profils", () => {
  const etat = etatDeTest(
    cmd("esquisse.rectangle", { id: "R", niveauId: "rdc", calqueId: "C1", origine: P(0, 0), largeur: m(4), profondeur: m(3), angle: deg(0) }),
    cmd("esquisse.rectangle", { id: "T", niveauId: "rdc", calqueId: "C1", origine: P(1, 1), largeur: m(1), profondeur: m(1), angle: deg(0) }),
    cmd("esquisse.arc", { id: "A", niveauId: "rdc", calqueId: "C1", centre: P(0, 0), rayon: m(2), angleDebut: deg(0), angleFin: deg(90), sens: "horaire" }),
    cmd("esquisse.polyligne", { id: "N", niveauId: "rdc", calqueId: "C1", points: [P(0, 0), P(2, 2), P(2, 0), P(0, 2)], ferme: true }),
  );
  it("rectangle : 4 segments et contour ; arc horaire ramené au sens trigo ; courbes sans segments d'accrochage", () => {
    const r = dessinerEsquisse(etat.objets.R as never);
    expect(r?.segments).toHaveLength(4);
    expect(r?.contour?.map((p) => [p.x, p.y])).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]]);
    const a = dessinerEsquisse(etat.objets.A as never);
    expect(a?.formes[0]).toMatchObject({ forme: "arc", debut: 90, fin: 0 });
    expect(a?.segments).toEqual([]);
    expect(a?.points.map((p) => [p.x, p.y])).toEqual([[0, 0], [2, 0], [0, 2]]);
    expect(arcTrigo(10, 20, "trigo")).toEqual({ debut: 10, fin: 20 });
  });
  it("traits de hachure découpés par le contour et ses trous", () => {
    const t = traitsHachure([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], [[{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }]], 0, 1);
    const aY2 = t.filter((s) => Math.abs(s.a.y - 2) < 1e-9);
    expect(aY2.map((s) => [s.a.x, s.b.x])).toEqual([[0, 1], [3, 4]]);
  });
  it("indicateur de profil : fermé, auto-intersection, fermé avec trou", () => {
    expect(seRecoupe([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }], true)).toBe(true);
    expect(indicateurProfil(etat, ["N"], [])).toBe("auto-intersection");
    expect(indicateurProfil(etat, ["R"], [])).toBe("fermé");
    const d = ["R", "T"].map((id) => dessinerEsquisse(etat.objets[id] as never) as DessinPlan);
    expect(indicateurProfil(etat, ["R", "T"], d)).toBe("fermé avec 1 trou");
  });
});
