import { describe, expect, it } from "vitest";
import { REGLAGES_DEFAUT } from "./annotations.js";
import { appliquerFiche, calageImageDuFond, comparerFiche, ecrireCalageImage, ecrireFicheCalage, ficheDuProjet, lireCalageImage, lireFicheCalage, poseDepuisCalageImage, systemeDuPrj } from "./fiche-calage.js";
import { importerFond, versPlan, type Fond } from "./fonds.js";
import { type Modele, modeleVide, modifierAnnotations } from "./geometrie-libre.js";
import { ajouterNiveau, niveauxTries } from "./niveaux.js";
import type { PointDeBase } from "./point-de-base.js";
import { versProjete } from "./point-de-base.js";

const IMG = "data:image/png;base64,iVBORw0KGgo=";
const PDB: PointDeBase = { e: 652410.25, n: 6862118.4, systeme: "EPSG:2154", systemeVertical: "NGF-IGN69", rotation: 12.5 };
const avecPdb = (m: Modele, p: PointDeBase): Modele => modifierAnnotations(m, (a) => void (a.reglages = { ...(a.reglages ?? REGLAGES_DEFAUT), pointDeBase: p })).modele;
const niveau = (m: Modele, nom: string, altitude: number): Modele => {
  const r = ajouterNiveau(m, { nom, altitude, hauteur: 2.7 });
  if (!r.ok) throw new Error(r.erreur);
  return r.modele;
};
const projet = (): Modele => {
  let m = avecPdb(modeleVide(), PDB);
  m = niveau(m, "RDC", 0);
  m = niveau(m, "R+1", 2.7);
  const f = importerFond(m, { nom: "plan.png", image: IMG, largeurPx: 100, hauteurPx: 50, altitude: 0, original: { id: "sbxfond_123e4567-e89b-12d3-a456-426614174000", empreinte: "b".repeat(64), taille: 99, type: "image/png" } });
  if (!f.ok) throw new Error(f.erreur);
  return f.modele;
};

describe("Fiche de calage du projet", () => {
  it("écrite lisible, relue à l'identique (point de base, systèmes, H, niveaux, fonds avec l'empreinte de l'original)", () => {
    const fiche = ficheDuProjet(projet(), 412.35, "R. Ouali", "2026-11-27");
    const texte = ecrireFicheCalage(fiche);
    expect(texte).toContain("systeme = EPSG:2154");
    expect(texte).toContain("point_de_base_e = 652410.25");
    expect(texte).toContain("niveau = R+1 ; 2.7 ; 2.7");
    expect(texte).toContain(`; non ; ${"b".repeat(64)}`);
    const relue = lireFicheCalage(texte);
    expect(relue).toEqual({ fiche });
  });

  it("refuse une fiche mal formée en nommant la ligne ; un point de base incomplet est refusé, jamais complété", () => {
    expect(lireFicheCalage("bonjour")).toEqual({ erreur: "en-tete", ligne: 1 });
    expect(lireFicheCalage("# Fiche de calage — Fadi 1\ndate = 2026-11-27\nniveau = RDC ; zéro ; 2.7\n")).toEqual({ erreur: "ligne", ligne: 3 });
    expect(lireFicheCalage("# Fiche de calage — Fadi 1\ndate = 2026-11-27\ninconnu = 3\n")).toEqual({ erreur: "ligne", ligne: 3 });
    expect(lireFicheCalage("# Fiche de calage — Fadi 1\ndate = 2026-11-27\nsysteme = EPSG:2154\n")).toEqual({ erreur: "point-de-base", ligne: 0 });
    expect(lireFicheCalage("# Fiche de calage — Fadi 1\n")).toEqual({ erreur: "date", ligne: 0 });
  });

  it("comparée au projet : système, écarts du point de base, du nord, de H et de chaque niveau ; rien n'est modifié", () => {
    const m = projet();
    const recue = { ...ficheDuProjet(m, 412.35, "B. Martin", "2026-11-25"), reference: 412.36 };
    const autre = { ...recue, pointDeBase: { ...PDB, e: PDB.e + 0.02, rotation: 12.4 }, niveaux: [{ nom: "RDC", altitude: 0, hauteur: 2.7 }, { nom: "R+1", altitude: 2.712, hauteur: 2.7 }, { nom: "Combles", altitude: 5.4, hauteur: 2 }] };
    const c = comparerFiche(m, 412.35, autre);
    expect(c.systeme).toBe("identique");
    expect(c.pointDeBase!.de).toBeCloseTo(0.02, 9);
    expect(c.pointDeBase!.rotation).toBeCloseTo(-0.1, 9);
    expect(c.reference).toBeCloseTo(0.01, 9);
    expect(c.niveaux.map((x) => [x.nom, x.ecart === null ? null : Math.round(x.ecart * 1000)])).toEqual([["RDC", 0], ["R+1", 12], ["Combles", null]]);
    expect(c.absentsDeLaFiche).toEqual([]);
    expect(comparerFiche(m, null, { ...autre, pointDeBase: { ...PDB, systeme: "EPSG:2056" } }).systeme).toBe("different");
    expect(comparerFiche(m, null, { ...autre, pointDeBase: { ...PDB, systeme: " epsg:2154 " } }).systeme).toBe("identique");
  });

  it("appliquée en un pas : point de base repris, niveaux absents ajoutés, niveaux existants jamais modifiés ; autre système refusé", () => {
    const m = projet();
    const recue = { ...ficheDuProjet(m, null, "B", "2026-11-25"), pointDeBase: { ...PDB, e: PDB.e + 1 }, niveaux: [{ nom: "R+1", altitude: 2.712, hauteur: 2.7 }, { nom: "Combles", altitude: 5.4, hauteur: 2 }] };
    const r = appliquerFiche(m, recue);
    if (!r.ok) throw new Error(r.erreur);
    expect(r.niveauxAjoutes).toBe(1);
    expect(r.modele.annotations!.reglages!.pointDeBase!.e).toBe(PDB.e + 1);
    expect(niveauxTries(r.modele).map((x) => [x.nom, x.altitude])).toEqual([["Combles", 5.4], ["R+1", 2.7], ["RDC", 0]]);
    expect(appliquerFiche(m, { ...recue, pointDeBase: { ...PDB, systeme: "EPSG:2056" } })).toEqual({ ok: false, erreur: "systeme" });
    expect(appliquerFiche(m, ficheDuProjet(m, null, "", "2026-11-27"))).toEqual({ ok: false, erreur: "vide" });
    // Projet sans point de base ni réglages : la fiche le pose.
    const vide = appliquerFiche(modeleVide(), recue);
    expect(vide.ok && vide.modele.annotations!.reglages!.pointDeBase).toEqual(recue.pointDeBase);
  });
});

describe("Fichier de calage d'image", () => {
  it("lu (six nombres) ; illisible ou dégénéré refusé ; .prj : code du système entier, jamais un code interne", () => {
    expect(lireCalageImage("0.2\n0\n0\n-0.2\n652000.1\n6863000.1\n")).toEqual({ a: 0.2, d: 0, b: 0, e: -0.2, c: 652000.1, f: 6863000.1 });
    expect(lireCalageImage("0.2\n0\n0\n-0.2\n652000.1\n")).toBeNull();
    expect(lireCalageImage("0\n0\n0\n0\n1\n1\n")).toBeNull();
    const wkt1 = 'PROJCS["RGF93 / Lambert-93",GEOGCS["RGF93",DATUM["Reseau_Geodesique_Francais_1993",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6171"]],AUTHORITY["EPSG","4171"]],PROJECTION["Lambert_Conformal_Conic_2SP"],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AUTHORITY["EPSG","2154"]]';
    expect(systemeDuPrj(wkt1)).toEqual({ code: "EPSG:2154", nom: "RGF93 / Lambert-93" });
    expect(systemeDuPrj('PROJCS["RGF93_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]]],UNIT["Meter",1.0]]')).toEqual({ code: null, nom: "RGF93_Lambert_93" });
    expect(systemeDuPrj("n'importe quoi")).toBeNull();
  });

  it("pose d'après le point de base (nord tourné, image réduite) ; aller-retour vers le fichier de calage de l'original", () => {
    const k = { a: 0.2, d: 0, b: 0, e: -0.2, c: 652000.1, f: 6863000.1 };
    const r = poseDepuisCalageImage(k, PDB, 0.5);
    if (!("pose" in r)) throw new Error(r.erreur);
    // Centre du pixel (10 ; 20) de l'original = pixel (10,5 ; 20,5) × 0,5 de l'image réduite.
    const q = versPlan(r.pose, { u: 10.5 * 0.5, v: 20.5 * 0.5 });
    const proj = versProjete(PDB, { x: q.x, y: q.y, z: 0 }, null);
    expect(proj.e).toBeCloseTo(652000.1 + 0.2 * 10, 6);
    expect(proj.n).toBeCloseTo(6863000.1 - 0.2 * 20, 6);
    expect(r.pose.echelle).toBeCloseTo(0.4, 9);
    const fond = { largeurPx: 500, pose: r.pose } as unknown as Fond;
    const retour = calageImageDuFond(fond, PDB, 1000)!;
    for (const c of ["a", "d", "b", "e", "c", "f"] as const) expect(retour[c]).toBeCloseTo(k[c], 6);
    expect(lireCalageImage(ecrireCalageImage(retour))!.c).toBeCloseTo(k.c, 6);
  });

  it("sans point de base, pixels non carrés ou en miroir : refusé avec motif", () => {
    const k = { a: 0.2, d: 0, b: 0, e: -0.2, c: 652000, f: 6863000 };
    expect(poseDepuisCalageImage(k, null, 1)).toEqual({ erreur: "point-de-base" });
    expect(poseDepuisCalageImage({ ...k, e: -0.3 }, PDB, 1)).toEqual({ erreur: "cisaillement" });
    expect(poseDepuisCalageImage({ ...k, e: 0.2 }, PDB, 1)).toEqual({ erreur: "cisaillement" });
    expect(calageImageDuFond({ largeurPx: 1, pose: { echelle: 1, rotation: 0, x: 0, y: 0 } } as unknown as Fond, null)).toBeNull();
  });
});
