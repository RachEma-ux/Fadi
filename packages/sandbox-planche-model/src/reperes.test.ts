/**
 * Chantier Axes, lot AX-1 (concept Axes 1.0, § 3.2 et § 11) : repère strict, plan de travail, verrou, contexte de
 * travail et son historique, migration, grandes coordonnées. Les identifiants AXnn renvoient aux scénarios du concept.
 */
import { describe, expect, it } from "vitest";
import type { Repere } from "./annotations.js";
import { appliquerDeltaPlanche, differencePlanche, lireModelePlanche } from "./delta.js";
import { ajouterRectangle, modeleVide, modifierAnnotations, type Modele } from "./geometrie-libre.js";
import { machineAxes } from "./outils/axes.js";
import { OUTILS_PLAN_VERROUILLABLE, axesDuPlan } from "./outils/commun-formes.js";
import { clicVers, echap, partie, saisie, survolVers } from "./outils/essais-modification.js";
import { machineLigne } from "./outils/ligne.js";
import { MACHINE_RECTANGLE } from "./outils/rectangle.js";
import {
  CONTEXTE_MODELE,
  HISTORIQUE_CONTEXTES_MAX,
  REPERE_DU_MODELE,
  TOLERANCES_REPERE,
  type RepereEnregistre,
  contexteDepuisDocument,
  contextePrecedent,
  contexteTemporaire,
  deplacerOrigine,
  historiqueInitial,
  pivoterRepere,
  planDuRepere,
  pousserContexte,
  repereDepuisArete,
  repereDepuisDirections,
  repereDepuisFace,
  repereDepuisPoints,
  repereEnregistreValide,
  validerRepere,
  versRepereLocal,
  depuisRepereLocal,
} from "./reperes.js";
import { analyserSaisie } from "./saisie-vcb.js";
import { type Vec3, add, cross, dot, len, scale, sub, v3 } from "./vecteur.js";

const deg = (d: number) => (d * Math.PI) / 180;
const proche = (a: Vec3, b: Vec3, tol = 1e-9) => expect(len(sub(a, b))).toBeLessThanOrEqual(tol);
const valide = (r: Repere) => expect(validerRepere(r).ok).toBe(true);
const sommetsDe = (m: Modele) => Object.values(m.racine.sommets).map((s) => s.position);

/** Repère d'une aile tournée de 27° autour de Z, origine (5 ; 2 ; 0). */
const aile = (): Repere => {
  const r = repereDepuisDirections(v3(5, 2, 0), v3(Math.cos(deg(27)), Math.sin(deg(27)), 0), v3(-Math.sin(deg(27)), Math.cos(deg(27)), 0));
  if (!r.ok) throw new Error(r.message);
  return r.repere;
};
/** Repère d'un pan de toiture : X horizontal, Y monte à 30°, origine (0 ; 0 ; 3). */
const toiture = (): Repere => {
  const r = repereDepuisDirections(v3(0, 0, 3), v3(1, 0, 0), v3(0, Math.cos(deg(30)), Math.sin(deg(30))));
  if (!r.ok) throw new Error(r.message);
  return r.repere;
};

describe("AX-1 — repère valide (invariant 1)", () => {
  it("le repère du modèle est valide ; un repère gauche, non unitaire, non orthogonal ou non fini est refusé avec son motif", () => {
    valide(REPERE_DU_MODELE);
    expect(validerRepere({ ...REPERE_DU_MODELE, z: v3(0, 0, -1) })).toMatchObject({ ok: false, erreur: "main-gauche" });
    expect(validerRepere({ ...REPERE_DU_MODELE, x: v3(2, 0, 0) })).toMatchObject({ ok: false, erreur: "base-non-unitaire" });
    expect(validerRepere({ ...REPERE_DU_MODELE, y: v3(Math.SQRT1_2, Math.SQRT1_2, 0) })).toMatchObject({ ok: false, erreur: "base-non-orthogonale" });
    expect(validerRepere({ ...REPERE_DU_MODELE, origine: v3(Number.NaN, 0, 0) })).toMatchObject({ ok: false, erreur: "non-fini" });
    expect(validerRepere({ ...REPERE_DU_MODELE, origine: v3(Infinity, 0, 0) })).toMatchObject({ ok: false, erreur: "non-fini" });
  });

  it("trois points : base orthonormée directe, Y projeté perpendiculairement à X, inversion explicite", () => {
    const r = repereDepuisPoints(v3(1, 1, 0), v3(3, 1, 0), v3(2, 5, 0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    proche(r.repere.x, v3(1, 0, 0));
    proche(r.repere.y, v3(0, 1, 0));
    proche(r.repere.z, v3(0, 0, 1));
    const inv = repereDepuisPoints(v3(1, 1, 0), v3(3, 1, 0), v3(2, 5, 0), true);
    if (!inv.ok) throw new Error();
    proche(inv.repere.y, v3(0, -1, 0));
    proche(inv.repere.z, v3(0, 0, -1));
    valide(inv.repere);
  });
});

describe("AX02 — points confondus ou presque alignés : refus clair, rien de posé, aucun repli", () => {
  it("modèle pur : direction nulle et colinéarité refusées, y compris presque alignées (sinus < 1e-6)", () => {
    expect(repereDepuisPoints(v3(1, 1, 1), v3(1, 1, 1), v3(2, 2, 2))).toMatchObject({ ok: false, erreur: "direction-nulle" });
    expect(repereDepuisPoints(v3(0, 0, 0), v3(1, 0, 0), v3(5, 0, 0))).toMatchObject({ ok: false, erreur: "colineaires" });
    expect(repereDepuisPoints(v3(0, 0, 0), v3(1, 0, 0), v3(5, 5e-7, 0))).toMatchObject({ ok: false, erreur: "colineaires" });
    expect(repereDepuisPoints(v3(0, 0, 0), v3(1, 0, 0), v3(5, 5e-5, 0)).ok).toBe(true);
    // Le refus porte une explication, jamais une orientation arbitraire.
    const r = repereDepuisPoints(v3(0, 0, 0), v3(0, 0, 1), v3(0, 0, 3));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/alignés/);
  });

  it("outil Axes : troisième point aligné → erreur affichée, l'étape reste ouverte, aucun repère ni opération", () => {
    const p = partie(machineAxes).jouer(clicVers(v3(1, 1, 0)), clicVers(v3(3, 1, 0)), survolVers(v3(5, 1, 0)), clicVers(v3(5, 1, 0)));
    expect(p.repere).toBeUndefined();
    expect(p.operations).toEqual([]);
    expect((p.etat as { etape: number }).etape).toBe(3);
    expect(p.vue().erreur).toMatch(/Repère refusé/);
    // Échap annule tout l'aperçu, sans rien poser.
    p.jouer(echap);
    expect((p.etat as { etape: number }).etape).toBe(1);
    expect(p.repere).toBeUndefined();
  });

  it("outil Axes : point d'axe confondu avec l'origine → refus, étape 2 conservée", () => {
    const p = partie(machineAxes).jouer(clicVers(v3(1, 1, 0)), clicVers(v3(1, 1, 0)));
    expect((p.etat as { etape: number }).etape).toBe(2);
    expect(p.vue().erreur).toMatch(/confondu/);
  });
});

describe("AX01 — repère le long d'une aile tournée de 27°", () => {
  it("le rectangle suit les directions locales ; la géométrie existante et le document ne bougent pas", () => {
    const existant = ajouterRectangle(modeleVide(), v3(-4, -4, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const avant = sommetsDe(existant);
    const r = aile();
    const p = partie(MACHINE_RECTANGLE, existant);
    p.repere = r;
    const a = depuisRepereLocal(v3(1, 1, 0), r);
    const b = depuisRepereLocal(v3(4, 2.5, 0), r);
    p.jouer(survolVers(a), clicVers(a), survolVers(b), clicVers(b));
    // Les anciens sommets sont intacts (aucun déplacement de géométrie par un changement de repère).
    for (const s of avant) expect(sommetsDe(p.modele).some((q) => len(sub(q, s)) < 1e-12)).toBe(true);
    const nouveaux = sommetsDe(p.modele).filter((q) => !avant.some((s) => len(sub(q, s)) < 1e-12));
    expect(nouveaux).toHaveLength(4);
    // Chaque côté du rectangle est parallèle à X ou à Y du repère de l'aile.
    const locaux = nouveaux.map((q) => versRepereLocal(q, r));
    const xs = new Set(locaux.map((q) => q.x.toFixed(6)));
    const ys = new Set(locaux.map((q) => q.y.toFixed(6)));
    expect([...xs].sort()).toEqual(["1.000000", "4.000000"]);
    expect([...ys].sort()).toEqual(["1.000000", "2.500000"]);
    expect(p.modele.annotations?.repere).toBeUndefined();
  });
});

describe("AX03 — origine saisie au clavier, orientation et géométrie inchangées", () => {
  it("[x;y;z] absolu dans le repère courant, <dx;dy;dz> décalé ; la base ne change pas", () => {
    const r = aile();
    const p = partie(machineAxes);
    p.repere = r;
    p.jouer(saisie("[2;3;0]"));
    proche(p.repere!.origine, depuisRepereLocal(v3(2, 3, 0), r));
    proche(p.repere!.x, r.x);
    proche(p.repere!.y, r.y);
    proche(p.repere!.z, r.z);
    expect(p.outilDemande).toBeUndefined();
    const q = partie(machineAxes);
    q.repere = r;
    q.jouer(saisie("<1;0;0>"));
    proche(q.repere!.origine, add(r.origine, r.x));
    expect(q.operations).toEqual([]);
  });

  it("unités explicites : « [250cm;0;0] » donne 2,5 m le long de X", () => {
    const p = partie(machineAxes);
    p.jouer(saisie("[250cm;0;0]"));
    proche(p.repere!.origine, v3(2.5, 0, 0));
  });

  it("saisie refusée (une longueur seule) : message, rien de posé", () => {
    const p = partie(machineAxes).jouer(saisie("3"));
    expect(p.repere).toBeUndefined();
    expect(p.vue().erreur).not.toBeNull();
  });

  it("aux étapes 2 et 3, la saisie donne les points d'axe (relatif : depuis l'origine choisie)", () => {
    const p = partie(machineAxes).jouer(clicVers(v3(1, 1, 0)), saisie("<0;2;0>"), saisie("<-1;0;0>"));
    proche(p.repere!.x, v3(0, 1, 0));
    proche(p.repere!.y, v3(-1, 0, 0));
    proche(p.repere!.z, v3(0, 0, 1));
  });
});

describe("AX04 — coordonnées absolues et relatives dans un repère tourné, locale à virgule", () => {
  it("[1;0;0] = origine + X ; <0;1;0> = Y seul ; séparateur « ; » avec la virgule décimale", () => {
    const r = aile();
    const abs = analyserSaisie("[1;0;0]", { attendu: "point", separateurDecimal: ",", repere: r });
    const rel = analyserSaisie("<0;1,5;0>", { attendu: "point", separateurDecimal: ",", repere: r });
    expect(abs.genre).toBe("point");
    expect(rel.genre).toBe("point");
    if (abs.genre === "point") proche(abs.point, add(r.origine, r.x));
    if (rel.genre === "point") {
      expect(rel.reference).toBe("relative");
      proche(rel.point, scale(r.y, 1.5));
    }
  });
});

describe("AX05 — dessin sur un pan de toiture incliné", () => {
  it("hors face, le plan de dessin est le plan XY du repère (plus de Z du monde) : rectangle dans le plan, côtés selon X et Y locaux", () => {
    const r = toiture();
    const p = partie(MACHINE_RECTANGLE);
    p.repere = r;
    const a = depuisRepereLocal(v3(1, 1, 0), r);
    const b = depuisRepereLocal(v3(3, 2, 0), r);
    p.jouer(survolVers(a), clicVers(a), survolVers(b), clicVers(b));
    const pts = sommetsDe(p.modele);
    expect(pts).toHaveLength(4);
    for (const q of pts) expect(Math.abs(versRepereLocal(q, r).z)).toBeLessThan(1e-9);
    const face = Object.values(p.modele.racine.faces)[0]!;
    expect(Math.abs(Math.abs(dot(face.normale, r.z)) - 1)).toBeLessThan(1e-9);
  });

  it("les axes d'un plan suivent le repère : normale = Z local → (X, Y) locaux", () => {
    const r = toiture();
    const { u, w } = axesDuPlan(r.z, r);
    proche(u, r.x);
    proche(w, r.y);
    // Sans repère : comportement historique (axes du modèle).
    const m = axesDuPlan(v3(0, 0, 1));
    proche(m.u, v3(1, 0, 0));
  });
});

describe("AX06 (modèle) — plan de travail et verrou", () => {
  it("plans XY, XZ, YZ d'un repère : origine, normale = u × w (direct)", () => {
    const r = aile();
    for (const plan of ["xy", "xz", "yz"] as const) {
      const pl = planDuRepere(r, plan);
      proche(cross(pl.u, pl.w), pl.normale);
      proche(pl.origine, r.origine);
    }
    proche(planDuRepere(r, "xz").normale, scale(r.y, -1));
    proche(planDuRepere(r, "yz").normale, r.x);
  });

  it("plan XZ non verrouillé : hors face, le rectangle tombe dans le plan vertical y = 0", () => {
    const p = partie(MACHINE_RECTANGLE);
    const pl = planDuRepere(REPERE_DU_MODELE, "xz");
    p.ctx = () => ({ modele: p.modele, selection: p.selection, separateurDecimal: ".", planDeTravail: pl });
    const depuis = v3(0.3, -1, 0.2);
    p.jouer(survolVers(v3(1, 0, 1), depuis), clicVers(v3(1, 0, 1), depuis), survolVers(v3(3, 0, 2), depuis), clicVers(v3(3, 0, 2), depuis));
    const pts = sommetsDe(p.modele);
    expect(pts).toHaveLength(4);
    for (const q of pts) expect(Math.abs(q.y)).toBeLessThan(1e-9);
  });

  it("plan verrouillé : une face survolée hors du plan ne change ni le plan ni la normale", () => {
    // Une face horizontale à z = 1 sous le rayon ; plan de travail vertical y = 0 verrouillé.
    const base = ajouterRectangle(modeleVide(), v3(-10, -10, 1), v3(20, 0, 0), v3(0, 20, 0)).modele;
    const pl = planDuRepere(REPERE_DU_MODELE, "xz", true);
    const p = partie(MACHINE_RECTANGLE, base);
    p.ctx = () => ({ modele: p.modele, selection: p.selection, separateurDecimal: ".", planDeTravail: pl });
    const depuis = v3(0, -1, 0.5);
    p.jouer(survolVers(v3(1, 0, 2), depuis), clicVers(v3(1, 0, 2), depuis), survolVers(v3(2, 0, 3), depuis), clicVers(v3(2, 0, 3), depuis));
    const nouveaux = sommetsDe(p.modele).filter((q) => Math.abs(q.z - 1) > 1e-9);
    expect(nouveaux).toHaveLength(4);
    for (const q of nouveaux) expect(Math.abs(q.y)).toBeLessThan(1e-9);
  });

  it("Ligne : plan verrouillé — les extrémités restent sur le plan, même au-dessus d'une face", () => {
    const base = ajouterRectangle(modeleVide(), v3(-10, -10, 1), v3(20, 0, 0), v3(0, 20, 0)).modele;
    const pl = planDuRepere(REPERE_DU_MODELE, "xz", true);
    const p = partie(machineLigne, base);
    p.ctx = () => ({ modele: p.modele, selection: p.selection, separateurDecimal: ".", planDeTravail: pl });
    const depuis = v3(0.2, -1, 0.4);
    p.jouer(survolVers(v3(1, 0, 2), depuis), clicVers(v3(1, 0, 2), depuis), survolVers(v3(4, 0, 3), depuis), clicVers(v3(4, 0, 3), depuis));
    const nouveaux = sommetsDe(p.modele).filter((q) => Math.abs(q.z - 1) > 1e-9);
    expect(nouveaux.length).toBeGreaterThanOrEqual(2);
    for (const q of nouveaux) expect(Math.abs(q.y)).toBeLessThan(1e-9);
  });

  it("outils qui respectent le verrou : formes planes, Ligne, Main levée (liste lue par l'interface)", () => {
    expect(OUTILS_PLAN_VERROUILLABLE).toEqual(expect.arrayContaining(["ligne", "rectangle", "cercle", "polygone", "arc"]));
    expect(OUTILS_PLAN_VERROUILLABLE).not.toContain("pousser-tirer");
  });
});

describe("AX07 (modèle) — historique des contextes, distinct de la géométrie", () => {
  it("Précédent revient au contexte antérieur ; un contexte identique ne crée pas d'entrée ; au plus 20 entrées", () => {
    let h = historiqueInitial();
    const t1 = contexteTemporaire(h.courant, aile());
    h = pousserContexte(h, t1);
    h = pousserContexte(h, t1);
    expect(h.precedents).toHaveLength(1);
    const t2 = { ...t1, plan: "yz" as const, verrou: true };
    h = pousserContexte(h, t2);
    expect(h.precedents).toHaveLength(2);
    const p1 = contextePrecedent(h)!;
    expect(p1.courant).toBe(t1);
    const p2 = contextePrecedent(p1)!;
    expect(p2.courant).toBe(CONTEXTE_MODELE);
    expect(contextePrecedent(p2)).toBeNull();
    let long = historiqueInitial();
    for (let i = 0; i < 30; i++) long = pousserContexte(long, contexteTemporaire(long.courant, deplacerOrigineOk(aile(), v3(i, 0, 0))));
    expect(long.precedents).toHaveLength(HISTORIQUE_CONTEXTES_MAX);
  });

  it("l'outil Axes ne crée aucun pas de géométrie : Annuler reste à la géométrie", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const p = partie(machineAxes, m).jouer(clicVers(v3(5, 5, 0)), clicVers(v3(6, 5, 0)), clicVers(v3(5, 7, 0)));
    expect(p.repere).toBeDefined();
    expect(p.historique).toHaveLength(1);
    expect(p.modele).toBe(m);
  });
});

function deplacerOrigineOk(r: Repere, o: Vec3): Repere {
  const d = deplacerOrigine(r, o);
  if (!d.ok) throw new Error(d.message);
  return d.repere;
}

describe("Alignement et rotation", () => {
  it("face : Z = normale, X = côté projeté dans le plan ; inversions explicites ; côté parallèle à la normale refusé", () => {
    const r = repereDepuisFace(v3(0, 0, 3), v3(0, 0, 2), v3(1, 0, 0.5));
    if (!r.ok) throw new Error();
    proche(r.repere.z, v3(0, 0, 1));
    proche(r.repere.x, v3(1, 0, 0));
    const inv = repereDepuisFace(v3(0, 0, 3), v3(0, 0, 1), v3(1, 0, 0), { inverserNormale: true, inverserX: true });
    if (!inv.ok) throw new Error();
    proche(inv.repere.z, v3(0, 0, -1));
    proche(inv.repere.x, v3(-1, 0, 0));
    valide(inv.repere);
    expect(repereDepuisFace(v3(0, 0, 0), v3(0, 0, 1), v3(0, 0, 5))).toMatchObject({ ok: false, erreur: "colineaires" });
  });

  it("arête + plan : X le long de l'arête, Z = normale du plan ; arête dans la normale refusée", () => {
    const r = repereDepuisArete(v3(1, 0, 0), v3(1, 3, 0), v3(0, 0, 1));
    if (!r.ok) throw new Error();
    proche(r.repere.x, v3(0, 1, 0));
    proche(r.repere.z, v3(0, 0, 1));
    expect(repereDepuisArete(v3(0, 0, 0), v3(0, 0, 1), v3(0, 0, 1)).ok).toBe(false);
  });

  it("rotation d'un angle signé autour d'un axe nommé : local ou du modèle", () => {
    const r = pivoterRepere(REPERE_DU_MODELE, "z", "local", deg(90));
    if (!r.ok) throw new Error();
    proche(r.repere.x, v3(0, 1, 0));
    proche(r.repere.y, v3(-1, 0, 0));
    const t = toiture();
    const loc = pivoterRepere(t, "z", "local", deg(90));
    const mod = pivoterRepere(t, "z", "modele", deg(90));
    if (!loc.ok || !mod.ok) throw new Error();
    proche(loc.repere.z, t.z);
    proche(mod.repere.x, v3(0, 1, 0));
    expect(Math.abs(dot(mod.repere.z, t.z) - 1)).toBeGreaterThan(1e-3);
    valide(loc.repere);
    valide(mod.repere);
  });
});

describe("AX09 (modèle) — migration et persistance", () => {
  it("l'ancien repère unique devient le contexte de travail initial ; absent → modèle ; illisible → modèle (jamais réparé)", () => {
    expect(contexteDepuisDocument(undefined)).toBe(CONTEXTE_MODELE);
    const c = contexteDepuisDocument(aile());
    expect(c.source.genre).toBe("temporaire");
    expect(c.repere).toEqual(aile());
    expect(contexteDepuisDocument({ ...aile(), x: v3(3, 0, 0) })).toBe(CONTEXTE_MODELE);
  });

  it("repères enregistrés : lus et écrits par le delta, contrôlés à la lecture du document", () => {
    const enr: RepereEnregistre = { ...aile(), id: "r1", nom: "Aile est", revision: 1, version: 1, source: { mode: "instantane" } };
    expect(repereEnregistreValide(enr)).toBe(true);
    expect(repereEnregistreValide({ ...enr, x: v3(0, 0, 1) })).toBe(false);
    const avant = modeleVide();
    const apres = modifierAnnotations(avant, (a) => {
      a.reperes["r1"] = enr;
    }).modele;
    expect(apres.annotations?.reperes?.["r1"]?.nom).toBe("Aile est");
    const d = differencePlanche(avant, apres);
    expect(d?.annotations?.reperes).toBeDefined();
    expect(appliquerDeltaPlanche(avant, d!).annotations?.reperes?.["r1"]).toEqual(enr);
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(apres)));
    expect(relu?.annotations?.reperes?.["r1"]?.id).toBe("r1");
    const casse = JSON.parse(JSON.stringify(apres));
    casse.annotations.reperes.r1.x = { x: 0, y: 0, z: 1 };
    expect(lireModelePlanche(casse)).toBeNull();
    // Un document ancien (repère unique, aucun repère enregistré) se relit sans perte.
    const ancien = modifierAnnotations(modeleVide(), (a) => {
      a.repere = aile();
    }).modele;
    const relu2 = lireModelePlanche(JSON.parse(JSON.stringify(ancien)));
    expect(relu2?.annotations?.repere).toEqual(JSON.parse(JSON.stringify(aile())));
    expect(relu2?.annotations?.reperes).toBeUndefined();
  });
});

describe("AX20 (modèle) — petites et grandes coordonnées", () => {
  it("tolérances relatives aux directions : repère valide de 1e-6 m à 1e7 m d'origine, colinéarité jugée à l'identique", () => {
    for (const k of [1e-6, 1, 1e4, 1e7]) {
      const o = v3(k, -k, k / 2);
      const r = repereDepuisPoints(o, add(o, v3(k * 1e-3, 0, 0)), add(o, v3(0, k * 1e-3, 0)));
      expect(r.ok, String(k)).toBe(true);
      if (r.ok) {
        valide(r.repere);
        proche(versRepereLocal(depuisRepereLocal(v3(1, 2, 3), r.repere), r.repere), v3(1, 2, 3), 1e-9 * Math.max(1, k));
      }
      const mauvais = repereDepuisPoints(o, add(o, v3(k * 1e-3, 0, 0)), add(o, v3(k * 2e-3, k * 1e-12, 0)));
      expect(mauvais.ok, String(k)).toBe(false);
    }
    expect(TOLERANCES_REPERE.colinearite).toBe(1e-6);
  });
});
