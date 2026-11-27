import { describe, expect, it } from "vitest";
import type { PlanDeCoupe } from "./annotations.js";
import {
  ajouterScenes,
  appliquerEtatScene,
  appliquerVueEtat,
  baliserNouveautes,
  capturerEtatScene,
  classerSelection,
  compterSelection,
  creerBalisesPhase,
  dateDuJour,
  decalerPlan,
  distancePlan,
  gabaritDeLaPlanche,
  jourDeLAnnee,
  limiterProfondeur,
  lireEchelle,
  lireGabarit,
  modeleDepuisGabarit,
  modifierBalise,
  modifierScene,
  placerPlan,
  poserBalisesReservees,
  resumeGabarit,
  sceneFaceCoupe,
  scenesTypes,
  tiretsDuTrait,
  vueEtatCourante,
} from "./balises-l4.js";
import { type Modele, ajouterSegments, grouper, modeleVide, modifierAnnotations } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { ajouterNiveau } from "./niveaux.js";
import { viser, viserAnnotation } from "./outils/selection.js";
import { projeterPlan, svgPlan } from "./plan-vectoriel.js";
import { v3 } from "./vecteur.js";

const COULEURS = { existant: "#1d2a25", demolir: "#8f6a1f", projete: "#b3261e" };
const carre = (m: Modele, x = 0, z = 0) => ajouterSegments(m, [[v3(x, 0, z), v3(x + 4, 0, z)], [v3(x + 4, 0, z), v3(x + 4, 3, z)], [v3(x + 4, 3, z), v3(x, 3, z)], [v3(x, 3, z), v3(x, 0, z)]]).modele;
const balise = (m: Modele, nom: string) => {
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("b");
    a.balises[k] = { id: k, nom, couleur: "#2f7bd6", visible: true };
    return k;
  });
  return { m: r.modele, id: r.extra };
};
const avecCote = (m: Modele) => {
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("c");
    a.cotes[k] = { id: k, genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), position: v3(2, -1, 0) };
    return k;
  });
  return { m: r.modele, id: r.extra };
};
const avecPlan = (m: Modele, p: Partial<PlanDeCoupe> = {}) => {
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("p");
    a.plansDeCoupe[k] = { id: k, origine: v3(0, 1.5, 0), normale: v3(0, 1, 0), u: v3(1, 0, 0), w: v3(0, 0, 1), demiU: 3, demiW: 3, actif: true, inverse: false, nom: "A-A", ...p };
    return k;
  });
  return { m: r.modele, id: r.extra };
};

describe("Cas 2, lot 4 : balises", () => {
  it("épaisseur, trait, verrou et phase saisis ; valeurs invalides refusées ; tirets proportionnels à l'épaisseur", () => {
    const { m, id } = balise(modeleVide(), "Projeté");
    const r = modifierBalise(m, id, { epaisseur: 0.5, trait: "tirets", verrouillee: true, phase: "projete" }).modele;
    expect(r.annotations!.balises[id]).toMatchObject({ epaisseur: 0.5, trait: "tirets", verrouillee: true, phase: "projete" });
    const sans = modifierBalise(r, id, { epaisseur: null, trait: null, verrouillee: false, phase: null }).modele.annotations!.balises[id]!;
    expect(sans).toEqual({ id, nom: "Projeté", couleur: "#2f7bd6", visible: true });
    expect(() => modifierBalise(m, id, { epaisseur: 0 })).toThrow(/Épaisseur/);
    expect(() => modifierBalise(m, id, { couleur: "rouge" })).toThrow(/Couleur/);
    expect(tiretsDuTrait("continu", 0.5)).toEqual([]);
    expect(tiretsDuTrait("tirets", 0.5)).toEqual([6, 3]);
  });

  it("balises de phase créées en un pas ; vues d'état existant / projeté ; une balise du même nom reçoit sa phase", () => {
    const { m: m0, id: existante } = balise(modeleVide(), "Existant");
    const r = creerBalisesPhase(m0, COULEURS);
    expect(r.extra.existant).toBe(existante);
    expect(Object.values(r.modele.annotations!.balises).map((b) => [b.nom, b.phase])).toEqual([["Existant", "existant"], ["À démolir", "demolir"], ["Projeté", "projete"]]);
    expect(vueEtatCourante(r.modele)).toBe("tout");
    const ex = appliquerVueEtat(r.modele, "existant").modele;
    expect(ex.annotations!.balises[r.extra.projete]!.visible).toBe(false);
    expect(vueEtatCourante(ex)).toBe("existant");
    const pj = appliquerVueEtat(r.modele, "projet").modele;
    expect(pj.annotations!.balises[r.extra.demolir]!.visible).toBe(false);
    expect(vueEtatCourante(pj)).toBe("projet");
  });

  it("géométrie nue et cotes classées en un pas ; balise masquée : rien n'est rendu ; verrouillée : rendue mais jamais visée", () => {
    const base = carre(modeleVide());
    const { m: m1, id: b } = balise(base, "Fond de plan");
    const { m: m2, id: cote } = avecCote(m1);
    const ids = [...Object.keys(m2.racine.aretes), ...Object.keys(m2.racine.faces), cote];
    expect(compterSelection(m2, ids)).toEqual({ aretes: 4, faces: 1, objets: 0, cotes: 1, textes: 0, plans: 0 });
    const r = classerSelection(m2, ids, b);
    expect(r.extra).toBe(6);
    expect(Object.values(r.modele.racine.aretes).every((a) => a.balise === b)).toBe(true);
    expect(r.modele.annotations!.cotes[cote]!.balise).toBe(b);
    const masquee = modifierAnnotations(r.modele, (a) => void (a.balises[b] = { ...a.balises[b]!, visible: false })).modele;
    expect(geometrieVisible(masquee).aretes).toHaveLength(0);
    expect(viserAnnotation(masquee, { origine: v3(2, -1, 10), direction: v3(0, 0, -1) }, 0.1)).toBeNull();
    const verrou = modifierBalise(r.modele, b, { verrouillee: true }).modele;
    expect(geometrieVisible(verrou).aretes.every((a) => a.verrouillee)).toBe(true);
    expect(viser(verrou, { origine: v3(2, 1.5, 10), direction: v3(0, 0, -1) }, 0.05)).toBeNull();
    expect(viser(r.modele, { origine: v3(2, 1.5, 10), direction: v3(0, 0, -1) }, 0.05)).not.toBeNull();
    // Un objet d'une balise verrouillée n'est pas visé non plus.
    const g = grouper(base, [...Object.keys(base.racine.aretes), ...Object.keys(base.racine.faces)]).modele;
    const { m: g1, id: bg } = balise(g, "Géomètre");
    const objet = Object.keys(g1.racine.occurrences)[0]!;
    const g2 = modifierBalise(classerSelection(g1, [objet], bg).modele, bg, { verrouillee: true }).modele;
    expect(viser(g2, { origine: v3(2, 1.5, 10), direction: v3(0, 0, -1) }, 0.05)).toBeNull();
  });

  it("balise courante posée sur ce qui est créé ; balise réservée aux cotes prioritaire ; ce qui a déjà une balise la garde", () => {
    const { m: m1, id: courante } = balise(modeleVide(), "Projeté");
    const { m: m2, id: cotes } = balise(m1, "Cotes");
    const m3 = poserBalisesReservees(m2, { cotes }).modele;
    expect(m3.annotations!.reglages!.balisesReservees).toEqual({ cotes });
    const dessine = carre(m3);
    const apres = baliserNouveautes(m3, dessine, courante);
    expect(Object.values(apres.racine.aretes).every((a) => a.balise === courante)).toBe(true);
    expect(Object.values(apres.racine.faces).every((f) => f.balise === courante)).toBe(true);
    const { m: avecC, id: c } = avecCote(apres);
    expect(baliserNouveautes(apres, avecC, courante).annotations!.cotes[c]!.balise).toBe(cotes);
    // Sans balise courante, la balise réservée s'applique encore ; sans rien, le modèle est rendu tel quel.
    expect(baliserNouveautes(apres, avecC, null).annotations!.cotes[c]!.balise).toBe(cotes);
    const nu = carre(modeleVide());
    expect(baliserNouveautes(modeleVide(), nu, null)).toBe(nu);
    expect(() => poserBalisesReservees(m2, { textes: "b-absente" })).toThrow(/introuvable/);
  });
});

describe("Cas 2, lot 4 : plans de coupe", () => {
  it("distance le long de la normale, pas, profondeur vue limitée (vue et plan vectoriel)", () => {
    // Deux carrés verticaux à y = 0 et y = -5 (devant / loin derrière la coupe à y = 1,5, côté gardé y < 1,5).
    let m = ajouterSegments(modeleVide(), [[v3(0, 0, 0), v3(4, 0, 0)], [v3(0, -5, 0), v3(4, -5, 0)]]).modele;
    const { m: mp, id } = avecPlan(m);
    m = mp;
    expect(distancePlan(m.annotations!.plansDeCoupe[id]!)).toBeCloseTo(1.5, 9);
    m = placerPlan(m, id, 2.4).modele;
    expect(m.annotations!.plansDeCoupe[id]!.origine.y).toBeCloseTo(2.4, 9);
    m = decalerPlan(m, id, -0.3).modele;
    expect(distancePlan(m.annotations!.plansDeCoupe[id]!)).toBeCloseTo(2.1, 9);
    const vue = { direction: v3(0, 0, -1), haut: v3(0, 1, 0) };
    expect(projeterPlan(m, vue).traits.filter((t) => t.classe !== "coupe")).toHaveLength(2);
    const limite = limiterProfondeur(m, id, 3).modele;
    expect(limite.annotations!.plansDeCoupe[id]!.profondeur).toBe(3);
    expect(projeterPlan(limite, vue).traits.filter((t) => t.classe !== "coupe")).toHaveLength(1);
    expect(limiterProfondeur(limite, id, null).modele.annotations!.plansDeCoupe[id]!.profondeur).toBeUndefined();
    expect(() => limiterProfondeur(m, id, 0)).toThrow(/positive/);
  });

  it("sorties : épaisseur et type de trait d'une balise repris au SVG ; sans valeur saisie, l'épaisseur de la classe", () => {
    const m0 = carre(modeleVide());
    const { m: m1, id: b } = balise(m0, "Projeté");
    const ids = Object.keys(m1.racine.aretes);
    const m2 = modifierBalise(classerSelection(m1, ids, b).modele, b, { epaisseur: 0.5, trait: "tirets" }).modele;
    const plan = projeterPlan(m2, { direction: v3(0, 0, -1), haut: v3(0, 1, 0) });
    const svg = svgPlan(plan, m2, { echelle: 100, traits: { coupe: 0.5, vu: 0.25, cache: 0.18 }, cachees: "pointille" });
    expect(svg).toContain(`<g id="vu-${b}" fill="none" stroke="rgb(0,0,0)" stroke-width="0.5" stroke-linecap="round" stroke-dasharray="6 3">`);
    const brut = svgPlan(projeterPlan(m1, { direction: v3(0, 0, -1), haut: v3(0, 1, 0) }), m1, { echelle: 100, traits: { coupe: 0.5, vu: 0.25, cache: 0.18 }, cachees: "pointille" });
    expect(brut).not.toContain("vu-");
  });
});

describe("Cas 2, lot 4 : scènes", () => {
  it("état mémorisé : balises visibles, plan actif, objets masqués ; rappelé en un modèle", () => {
    const base = carre(modeleVide());
    const g = grouper(base, [...Object.keys(base.racine.aretes), ...Object.keys(base.racine.faces)]).modele;
    const { m: m1, id: b } = balise(g, "Existant");
    const { m: m2, id: p } = avecPlan(m1);
    const etat = capturerEtatScene(m2, "lignes-cachees");
    expect(etat).toEqual({ balisesVisibles: [b], plansActifs: [p], masques: [], style: "lignes-cachees" });
    const objet = Object.keys(m2.racine.occurrences)[0]!;
    const change = modifierAnnotations(m2, (a) => {
      a.balises[b] = { ...a.balises[b]!, visible: false };
      a.plansDeCoupe[p] = { ...a.plansDeCoupe[p]!, actif: false };
    }).modele;
    const masque = { ...change, racine: { ...change.racine, occurrences: { [objet]: { ...change.racine.occurrences[objet]!, masquee: true } } } };
    const rappel = appliquerEtatScene(masque, etat);
    expect(rappel.annotations!.balises[b]!.visible).toBe(true);
    expect(rappel.annotations!.plansDeCoupe[p]!.actif).toBe(true);
    expect(rappel.racine.occurrences[objet]!.masquee).toBeUndefined();
  });

  it("échelle nominale et soleil de la scène ; échelle et date lues ; valeurs invalides refusées", () => {
    const r = ajouterScenes(modeleVide(), [{ nom: "Façade sud", position: v3(0, -10, 0), cible: v3(0, 0, 0), champDeVision: 35, projection: "parallele" }]);
    const id = r.extra[0]!;
    const m = modifierScene(r.modele, id, { echelle: 100, soleil: { jour: 172, heure: 14 } }).modele;
    expect(m.annotations!.scenes![id]).toMatchObject({ echelle: 100, soleil: { jour: 172, heure: 14 } });
    expect(modifierScene(m, id, { echelle: null }).modele.annotations!.scenes![id]!.echelle).toBeUndefined();
    expect(() => modifierScene(m, id, { echelle: 0 })).toThrow(/Échelle/);
    expect(lireEchelle("1:100")).toBe(100);
    expect(lireEchelle("1/50")).toBe(50);
    expect(lireEchelle("200")).toBe(200);
    expect(lireEchelle("1:")).toBeNull();
    expect(jourDeLAnnee("2026-06-21")).toBe(172);
    expect(dateDuJour(172, 2026)).toBe("2026-06-21");
  });

  it("scène face à la coupe : caméra parallèle du côté caché, coupe seule active, échelle demandée", () => {
    const { m: m1, id: p } = avecPlan(carre(modeleVide()));
    const { m: m2, id: q } = avecPlan(m1, { nom: "B-B", actif: true });
    const s = sceneFaceCoupe(m2, p, 50);
    expect(s.projection).toBe("parallele");
    expect(s.position.y).toBeGreaterThan(1.5);
    expect(s.cible).toEqual(v3(0, 1.5, 0));
    expect(s.etat!.plansActifs).toEqual([p]);
    expect(s.echelle).toBe(50);
    expect(q).not.toBe(p);
  });

  it("scènes types du gabarit : plans par niveau, quatre façades, une par coupe, existant / démoli et projeté", () => {
    let m = carre(modeleVide());
    for (const n of [{ nom: "RDC", altitude: 0, hauteur: 2.7 }, { nom: "R+1", altitude: 2.7, hauteur: 2.7 }]) {
      const r = ajouterNiveau(m, n);
      if (!r.ok) throw new Error(r.erreur);
      m = r.modele;
    }
    m = avecPlan(m).m;
    m = creerBalisesPhase(m, COULEURS).modele;
    const s = scenesTypes(m, [{ genre: "plans-niveaux", echelle: 50 }, { genre: "facades", echelle: 100 }, { genre: "coupes", echelle: 50 }, { genre: "existant-demoli" }, { genre: "projete" }]);
    expect(s.map((x) => x.nom)).toEqual(["Plan RDC 1:50", "Plan R+1 1:50", "Façade sud 1:100", "Façade est 1:100", "Façade nord 1:100", "Façade ouest 1:100", "Coupe A-A 1:50", "Existant et démoli", "Projeté"]);
    expect(s[0]!.cible.z).toBe(0);
    expect(s[1]!.cible.z).toBe(2.7);
    const projete = Object.values(m.annotations!.balises).find((b) => b.phase === "projete")!.id;
    expect(s[7]!.etat!.balisesVisibles).not.toContain(projete);
    expect(scenesTypes(modeleVide(), [{ genre: "facades" }])).toEqual([]);
    expect(ajouterScenes(m, s).extra).toHaveLength(9);
  });
});

describe("Cas 2, lot 4 : gabarit d'agence", () => {
  const gabarit = {
    format: "fadi-gabarit/1",
    nom: "Agence · Logement",
    source: "Agence, charte graphique 2026 (fichier d'essai)",
    unite: "m",
    pas: 0.001,
    balises: [
      { nom: "Existant", couleur: "#1D2A25", epaisseur: 0.35, phase: "existant" },
      { nom: "Projeté", couleur: "#b3261e", epaisseur: 0.5, phase: "projete" },
      { nom: "Cotes", couleur: "#2f6fd6", epaisseur: 0.18 },
      { nom: "Fond de plan", couleur: "#9aa59f", verrouillee: true },
    ],
    reservees: { cotes: "Cotes" },
    scenesTypes: [{ genre: "facades", echelle: 100 }],
    stylesCote: [{ nom: "Agence", extremites: "barre", aligner: "dessus", format: "metres-mm" }],
    parametres: [{ nom: "epaisseur_mur", valeur: 0.2 }],
  };
  const texte = JSON.stringify(gabarit);

  it("lu, résumé ; refusé sans source, sans balise, avec une balise réservée inconnue", () => {
    const r = lireGabarit(texte);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(resumeGabarit(r.gabarit)).toEqual({ unite: "m", pas: 0.001, balises: 4, reservees: 1, scenesTypes: 1 });
    expect(lireGabarit(JSON.stringify({ ...gabarit, source: " " }))).toMatchObject({ ok: false, erreur: expect.stringMatching(/source/) });
    expect(lireGabarit(JSON.stringify({ ...gabarit, balises: [] }))).toMatchObject({ ok: false });
    expect(lireGabarit(JSON.stringify({ ...gabarit, reservees: { cotes: "Absente" } }))).toMatchObject({ ok: false });
    expect(lireGabarit(JSON.stringify({ ...gabarit, format: "autre" }))).toMatchObject({ ok: false });
    expect(lireGabarit("{")).toMatchObject({ ok: false });
  });

  it("nouvelle Planche depuis le gabarit : unité, pas, balises, réservées, styles, paramètres ; fichier gardé tel quel", () => {
    const r = lireGabarit(texte);
    if (!r.ok) throw new Error("gabarit");
    const m = modeleDepuisGabarit(r.gabarit, { nom: "logement.fadi-gabarit.json", texte });
    const reg = m.annotations!.reglages!;
    expect(reg.uniteSaisie).toBe("m");
    expect(reg.accrochageLongueur).toBe(0.001);
    const bal = Object.values(m.annotations!.balises);
    expect(bal.map((b) => b.nom)).toEqual(["Existant", "Projeté", "Cotes", "Fond de plan"]);
    expect(bal[0]).toMatchObject({ couleur: "#1d2a25", epaisseur: 0.35, phase: "existant" });
    expect(bal[3]!.verrouillee).toBe(true);
    expect(m.annotations!.balises[reg.balisesReservees!.cotes!]!.nom).toBe("Cotes");
    expect(Object.values(reg.stylesCote!)[0]).toMatchObject({ nom: "Agence", format: "metres-mm" });
    expect(Object.values(reg.parametres!)[0]).toMatchObject({ nom: "epaisseur_mur", valeur: 0.2 });
    expect(reg.gabarit).toMatchObject({ nom: "Agence · Logement", nomFichier: "logement.fadi-gabarit.json", texte, scenesTypes: [{ genre: "facades", echelle: 100 }] });
    // Enregistrer la Planche comme gabarit : relu à l'identique (hors format JSON).
    const g = gabaritDeLaPlanche(m, "Agence · Logement", gabarit.source);
    const relu = lireGabarit(JSON.stringify(g));
    expect(relu.ok && relu.gabarit).toEqual(r.gabarit);
    expect(() => gabaritDeLaPlanche(modeleVide(), "x", "y")).toThrow(/aucune balise/);
  });
});
