/** Cas 2 du catalogue, lot 1 « Cotation et annotations » : modèle des cotes, outil Cotes, Rapporteur, numérotation. */
import { describe, expect, it } from "vitest";
import type { Cote } from "./annotations.js";
import { REGLAGES_DEFAUT } from "./annotations.js";
import {
  chainesDeCotes,
  controlerCotes,
  cotesEnChaine,
  dessinerCote,
  formaterLongueurCote,
  formaterPlage,
  lirePlage,
  nouvellesSortiesDePlage,
  piloterCote,
  pointsCote,
  styleEffectif,
  texteCote,
  valeurCote,
} from "./cotes.js";
import { type Modele, ajouterRectangle, ajouterSegment, deplacer, effacerEntites, grouper, modeleVide, modifierAnnotations, redimensionner } from "./geometrie-libre.js";
import { famillesNumerotation, lirePrefixes, nomsNumerotes, numeroterEnSerie, ordreDeLecture } from "./numerotation.js";
import { machineCotation } from "./outils/cotation.js";
import { clicVers, partie, saisie, survolVers, touche } from "./outils/essais-modification.js";
import { machineRapporteur } from "./outils/rapporteur.js";
import { dist, v3 } from "./vecteur.js";

const sol = (): Modele => ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2.7, 0)).modele;
const cotes = (m: Modele): Cote[] => Object.values(m.annotations?.cotes ?? {});
const sommetEn = (m: Modele, p: ReturnType<typeof v3>): string => Object.values(m.racine.sommets).find((s) => dist(s.position, p) < 1e-9)!.id;
type SansId<C> = C extends Cote ? Omit<C, "id"> : never;
const avecCotes = (m: Modele, liste: SansId<Cote>[]): Modele =>
  modifierAnnotations(m, (a, id) => {
    for (const c of liste) {
      const cid = id("c");
      a.cotes[cid] = { ...c, id: cid } as Cote;
    }
  }).modele;
const avecReglages = (m: Modele, r: Partial<typeof REGLAGES_DEFAUT>): Modele =>
  modifierAnnotations(m, (a) => {
    a.reglages = { ...REGLAGES_DEFAUT, ...a.reglages, ...r };
  }).modele;

describe("Format des valeurs (n° 14, 60)", () => {
  it("mètres à la précision d'affichage ; « ≈ » quand la valeur est arrondie, valeur pleine gardée", () => {
    expect(formaterLongueurCote(4.2, "metres", 2, ",")).toMatchObject({ texte: "4,20", arrondie: false });
    const f = formaterLongueurCote(9.385, "metres", 2, ",");
    expect(f.arrondie).toBe(true);
    expect(f.texte.startsWith("≈ ")).toBe(true);
    expect(f.plein).toBe("9,385 m");
  });
  it("à la française : millimètre en exposant ; centimètres sans unité", () => {
    expect(formaterLongueurCote(9.385, "metres-mm", 2, ",").texte).toBe("9,38⁵");
    expect(formaterLongueurCote(1.2, "metres-mm", 2, ",").texte).toBe("1,20⁰");
    expect(formaterLongueurCote(4.2, "centimetres", 2, ",").texte).toBe("420");
    expect(formaterLongueurCote(4.2057, "centimetres", 2, ",").texte).toBe("≈ 421");
  });
});

describe("Style de cote (n° 57, 81)", () => {
  it("le style nommé de la cote l'emporte, puis le style par défaut, puis l'Info modèle", () => {
    const r = { ...REGLAGES_DEFAUT, extremitesCote: "point" as const, stylesCote: { s1: { id: "s1", nom: "Agence", extremites: "fleche-fermee" as const, aligner: "dessus" as const, format: "metres-mm" as const } } };
    expect(styleEffectif(r)).toMatchObject({ extremites: "point", format: "metres" });
    expect(styleEffectif(r, { style: "s1" })).toMatchObject({ extremites: "fleche-fermee", format: "metres-mm" });
    expect(styleEffectif({ ...r, styleCote: "s1" })).toMatchObject({ aligner: "dessus" });
  });
  it("les extrémités réglées sont dessinées ; une cote trop courte passe à l'extérieur (n° 96)", () => {
    const m = avecCotes(sol(), [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), position: v3(2, -1, 0) }, { genre: "lineaire", a: v3(0, 0, 0), b: v3(0.13, 0, 0), position: v3(0, -1, 0) }]);
    const [longue, courte] = cotes(m);
    const pas = 0.01; // 1 cm par pixel
    const d1 = dessinerCote(m, longue!, pas, 2, ",")!;
    // 2 attaches + ligne + 2 barres
    expect(d1.lignes).toHaveLength(5);
    expect(d1.exterieur).toBe(false);
    const d2 = dessinerCote(m, courte!, pas, 2, ",")!;
    expect(d2.exterieur).toBe(true);
    expect(d2.etiquette.x).toBeGreaterThan(0.13);
    const sans = dessinerCote(avecReglages(m, { extremitesCote: "aucune" }), cotes(m)[0]!, pas, 2, ",")!;
    expect(sans.lignes).toHaveLength(3);
  });
});

describe("Direction mesurée, texte forcé, Info entité (n° 42, 64)", () => {
  it("alignée, horizontale, verticale, selon un axe", () => {
    const base = { genre: "lineaire" as const, a: v3(0, 0, 0), b: v3(3, 4, 12), position: v3(0, 0, 0) };
    const m = avecCotes(modeleVide(), [base, { ...base, direction: "horizontale" }, { ...base, direction: "verticale" }, { ...base, direction: "axe-y" }]);
    expect(cotes(m).map((c) => valeurCote(m, c))).toEqual([13, 5, 12, 4]);
  });
  it("un texte forcé remplace la valeur affichée, la valeur pleine reste", () => {
    const m = avecCotes(modeleVide(), [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(4.2, 0, 0), position: v3(0, -1, 0), texteForce: "4,20 env." }]);
    const t = texteCote(m, cotes(m)[0]!, 2, ",");
    expect(t).toMatchObject({ texte: "4,20 env.", plein: "4,20 m", force: true });
  });
});

describe("Cotes de niveau, de pente, angulaire (n° 3, 30, 107)", () => {
  it("niveau : ±0,00 du projet, NGF depuis l'altitude déclarée, « non évaluable » sans elle", () => {
    let m = avecCotes(modeleVide(), [
      { genre: "niveau", point: v3(0, 0, 0), reference: "projet", position: v3(1, 0, 0) },
      { genre: "niveau", point: v3(0, 0, 6.1), reference: "projet", position: v3(1, 0, 6.1) },
      { genre: "niveau", point: v3(0, 0, 0), reference: "ngf", position: v3(1, 0, 0) },
    ]);
    const [z0, z1, ngf] = cotes(m);
    expect(texteCote(m, z0!, 2, ",").texte).toBe("±0,00");
    expect(texteCote(m, z1!, 2, ",").texte).toBe("+6,10");
    expect(valeurCote(m, ngf!)).toBeNull();
    m = avecReglages(m, { emplacement: { latitude: 46, longitude: 7, nord: 0, altitude: 152.25 } });
    expect(texteCote(m, cotes(m)[2]!, 2, ",").texte).toBe("+152,25 NGF");
  });
  it("pente en % ; flèche vers le point bas", () => {
    const m = avecCotes(modeleVide(), [{ genre: "pente", a: v3(0, 0, 4.2), b: v3(10, 0, 0), position: v3(5, 1, 2) }]);
    const c = cotes(m)[0]!;
    expect(valeurCote(m, c)).toBeCloseTo(42, 9);
    expect(texteCote(m, c, 2, ",").texte).toBe("42 %");
    const d = dessinerCote(m, c, 0.01, 2, ",")!;
    // La flèche va du haut (x = 0) vers le bas (x = 10).
    expect(d.lignes[0]![1]!.x).toBeGreaterThan(d.lignes[0]![0]!.x);
  });
  it("Rapporteur, option « Cote angulaire » (Alt seul) : la mesure devient une cote angulaire", () => {
    const p = partie(machineRapporteur, sol()).seule("Alt").jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(1, 0, 0)), clicVers(v3(1, 0, 0)), survolVers(v3(1, 0.5, 0)), saisie("23"));
    const c = cotes(p.modele).find((x) => x.genre === "angulaire");
    expect(c).toBeDefined();
    expect(valeurCote(p.modele, c!)).toBeCloseTo(23, 6);
    expect(texteCote(p.modele, c!, 2, ",").texte).toBe("23°");
    expect(p.vue().options?.[0]).toMatchObject({ id: "cote", valeur: "oui" });
  });
});

describe("Chaînes de cotes (n° 1, 102)", () => {
  const facade = (format: "metres" | "metres-mm"): Modele => {
    const pts = [0, 1.2, 2.6, 5, 7.5, 9.385].map((x) => ({ p: v3(x, 0, 0) }));
    let n = 0;
    const m = modifierAnnotations(avecReglages(modeleVide(), { formatCote: format }), (a) => {
      for (const c of cotesEnChaine(pts, v3(0, -1, 0), 0.5, () => `c${900 + n++}`)) a.cotes[c.id] = c;
    }).modele;
    return m;
  };
  it("cotesEnChaine : une cote par intervalle et la cote totale décalée", () => {
    const m = facade("metres-mm");
    expect(cotes(m)).toHaveLength(6);
    const total = cotes(m)[5]!;
    expect(valeurCote(m, total)).toBeCloseTo(9.385, 9);
    expect(chainesDeCotes(m, 2)).toHaveLength(1);
  });
  it("au millimètre la chaîne est juste ; au centimètre la somme affichée diffère du total : signalée, rien n'est corrigé", () => {
    expect(controlerCotes(facade("metres-mm"), 2).chaines).toHaveLength(0);
    const m = facade("metres");
    const k = controlerCotes(m, 2).chaines;
    expect(k).toHaveLength(1);
    expect(k[0]!.partielles).toHaveLength(5);
    expect(Math.abs(k[0]!.ecart)).toBeCloseTo(0.01, 6);
  });
  it("outil Cotes, genre « en chaîne » : points, double-clic, placement ou décalage tapé", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(9, 0, 0)).modele;
    const p = partie(machineCotation, m).configurer("genre", "chaine");
    p.jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(4, 0, 0)), clicVers(v3(4, 0, 0)), survolVers(v3(9, 0, 0)), clicVers(v3(9, 0, 0)), touche("Entree"));
    expect(p.etat.etape).toBe(3);
    expect(p.vue().mesures?.libelle).toBe("Décalage");
    p.jouer(survolVers(v3(4, -2, 0)), saisie("0.8"));
    const cs = cotes(p.modele);
    expect(cs).toHaveLength(3);
    const c0 = cs[0]!;
    if (c0.genre !== "lineaire") throw new Error("linéaire attendue");
    expect(c0.position.y).toBeCloseTo(-0.8, 9);
    const total = cs[2]!;
    if (total.genre !== "lineaire") throw new Error("linéaire attendue");
    expect(total.sommets).toBeDefined();
    expect(valeurCote(p.modele, total)).toBeCloseTo(9, 9);
  });
});

describe("Pose de la cote (n° 80, 7)", () => {
  it("le décalage de la ligne de cote se tape au champ Mesures, du côté du curseur", () => {
    const p = partie(machineCotation, sol()).jouer(survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(4, 0, 0)), clicVers(v3(4, 0, 0)), survolVers(v3(2, -3, 0)), saisie("0.8"));
    const c = cotes(p.modele)[0]!;
    if (c.genre !== "lineaire") throw new Error("linéaire attendue");
    expect(c.position.y).toBeCloseTo(-0.8, 9);
  });
  it("Alt seul passe d'un genre à l'autre", () => {
    const p = partie(machineCotation, sol());
    expect(p.seule("Alt").etat.genre).toBe("chaine");
    expect(p.seule("Alt").etat.genre).toBe("niveau");
    expect(p.seule("Alt").etat.genre).toBe("pente");
    expect(p.seule("Alt").etat.genre).toBe("lineaire");
  });
  it("dans un groupe ouvert, la cote est associée aux sommets du groupe et suit son déplacement", () => {
    const m0 = sol();
    const g = grouper(m0, Object.keys(m0.racine.faces));
    const m = g.modele;
    const ctx = { dans: g.occurrence, chemin: [g.occurrence] };
    let modele = m;
    let etat = machineCotation.initial();
    for (const ev of [survolVers(v3(0, 0, 0)), clicVers(v3(0, 0, 0)), survolVers(v3(4, 0, 0)), clicVers(v3(4, 0, 0)), survolVers(v3(2, -1, 0)), clicVers(v3(2, -1, 0))]) {
      const t = machineCotation.traiter(etat, ev, { modele, selection: [], separateurDecimal: ".", ...ctx });
      etat = t.etat;
      if (t.modele) modele = t.modele;
    }
    const c = cotes(modele)[0]!;
    expect(pointsCote(modele, c).association).toBe("associee");
    const bouge = deplacer(modele, [g.occurrence], v3(0, 5, 0)).modele;
    const p = pointsCote(bouge, cotes(bouge)[0]!);
    expect(p.a.y).toBeCloseTo(5, 9);
  });
});

describe("Suivi, orphelines, solides (n° 8, 24, 65)", () => {
  it("une cote dont un sommet a disparu devient orpheline et le contrôle la relève", () => {
    const m0 = sol();
    const a = sommetEn(m0, v3(0, 0, 0));
    const b = sommetEn(m0, v3(4, 0, 0));
    const m = avecCotes(m0, [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), sommets: [a, b], position: v3(2, -1, 0) }]);
    const sans = effacerEntites(m, Object.keys(m.racine.aretes)).modele;
    expect(pointsCote(sans, cotes(sans)[0]!).association).toBe("orpheline");
    expect(controlerCotes(sans).orphelines).toEqual([cotes(sans)[0]!.id]);
  });
  it("un sommet recréé au même endroit par une opération ré-associe la cote", () => {
    const m0 = sol();
    const a = sommetEn(m0, v3(0, 0, 0));
    const b = sommetEn(m0, v3(4, 0, 0));
    const m = avecCotes(m0, [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), sommets: [a, b], position: v3(2, -1, 0) }]);
    const sans = effacerEntites(m, Object.keys(m.racine.aretes)).modele;
    const refait = ajouterRectangle(sans, v3(0, 0, 0), v3(4, 0, 0), v3(0, 2.7, 0)).modele;
    expect(pointsCote(refait, cotes(refait)[0]!).association).toBe("associee");
  });
  it("la dernière position connue est gardée ; l'ancre d'un texte suit son entité", () => {
    const m0 = sol();
    const a = sommetEn(m0, v3(0, 0, 0));
    const b = sommetEn(m0, v3(4, 0, 0));
    const face = Object.keys(m0.racine.faces)[0]!;
    let m = avecCotes(m0, [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), sommets: [a, b], position: v3(2, -1, 0) }]);
    m = modifierAnnotations(m, (an, id) => {
      const t = id("t");
      an.textes[t] = { id: t, genre: "repere", ancre: v3(2, 1, 0), entite: face, position: v3(3, 3, 0), texte: "Séjour" };
    }).modele;
    const bouge = deplacer(m, [face], v3(0, 0, 1)).modele;
    const c = cotes(bouge)[0]!;
    if (c.genre !== "lineaire") throw new Error("linéaire attendue");
    expect(c.a.z).toBeCloseTo(1, 9);
    const t = Object.values(bouge.annotations!.textes)[0]!;
    if (t.genre !== "repere") throw new Error("repère attendu");
    expect(t.ancre.z).toBeCloseTo(1, 9);
    expect(t.position.z).toBeCloseTo(0, 9);
  });
  it("une opération qui déplace déjà l'ancre (Redimensionner) ne la déplace pas une seconde fois", () => {
    const m0 = sol();
    const face = Object.keys(m0.racine.faces)[0]!;
    const m = modifierAnnotations(m0, (an, id) => {
      const t = id("t");
      an.textes[t] = { id: t, genre: "repere", ancre: v3(2, 1, 0), entite: face, position: v3(3, 3, 0), texte: "Séjour" };
    }).modele;
    const r = redimensionner(m, 2).modele;
    const t = Object.values(r.annotations!.textes)[0]!;
    if (t.genre !== "repere") throw new Error("repère attendu");
    expect(t.ancre.x).toBeCloseTo(4, 9);
    expect(t.ancre.y).toBeCloseTo(2, 9);
  });
});

describe("Cote pilotante et plage gardée (n° 97, 31)", () => {
  const mur = (): Modele => {
    const m0 = sol();
    return avecCotes(m0, [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(4, 0, 0), sommets: [sommetEn(m0, v3(0, 0, 0)), sommetEn(m0, v3(4, 0, 0))], position: v3(2, -1, 0), plage: { min: 4 } }]);
  };
  it("saisir 4,35 déplace le second sommet de 15 cm ; une cote libre refuse", () => {
    const m = mur();
    const id = cotes(m)[0]!.id;
    const r = piloterCote(m, id, 4.35).modele;
    expect(valeurCote(r, cotes(r)[0]!)).toBeCloseTo(4.35, 9);
    const libre = avecCotes(modeleVide(), [{ genre: "lineaire", a: v3(0, 0, 0), b: v3(1, 0, 0), position: v3(0, -1, 0) }]);
    expect(() => piloterCote(libre, cotes(libre)[0]!.id, 2)).toThrow(/associée/);
  });
  it("une opération qui sort la cote de sa plage est signalée, pas corrigée", () => {
    const m = mur();
    const r = piloterCote(m, cotes(m)[0]!.id, 3.9).modele;
    expect(valeurCote(r, cotes(r)[0]!)).toBeCloseTo(3.9, 9);
    expect(nouvellesSortiesDePlage(m, r).map((h) => h.id)).toEqual([cotes(m)[0]!.id]);
  });
  it("lecture et écriture d'une plage", () => {
    expect(lirePlage("≥ 4,00")).toEqual({ min: 4 });
    expect(lirePlage("<= 2,5")).toEqual({ max: 2.5 });
    expect(lirePlage("2,40 – 2,60")).toEqual({ min: 2.4, max: 2.6 });
    expect(lirePlage("")).toBeUndefined();
    expect(lirePlage("abc")).toBeNull();
    expect(formaterPlage({ min: 4 }, ",")).toBe("≥ 4,00");
  });
});

describe("Numérotation en série (n° 94)", () => {
  const plan = (): { m: Modele; ids: string[] } => {
    let m = modeleVide();
    const ids: string[] = [];
    const boite = (x: number, y: number, z: number, nom: string) => {
      const r = ajouterRectangle(m, v3(x, y, z), v3(x + 1, y, z), v3(x, y + 1, z));
      const f = r.rapport.crees.filter((id) => id.startsWith("f"));
      const g = grouper(r.modele, f, { genre: "composant", nom });
      m = g.modele;
      ids.push(g.occurrence);
    };
    boite(0, 5, 0, "Local");
    boite(5, 5, 0, "Local");
    boite(0, 0, 0, "Local");
    boite(3, 0.1, 0.9, "Fenêtre");
    boite(0, 5, 3, "Local");
    return { m, ids };
  };
  it("ordre de lecture par niveau : haut → bas, gauche → droite ; l'allège reste au niveau", () => {
    const { m, ids } = plan();
    const n = ordreDeLecture(m, ids);
    expect(n).toHaveLength(2);
    expect(n[0]).toEqual([ids[0], ids[1], ids[2], ids[3]]);
    expect(famillesNumerotation(m, ids).map((f) => f.famille)).toEqual(["Local", "Fenêtre"]);
  });
  it("préfixe par famille, repart à 01 par niveau, une seule opération", () => {
    const { m, ids } = plan();
    const noms = nomsNumerotes(m, ids, { prefixes: lirePrefixes("R. · F."), depart: "01", parNiveau: true });
    expect(noms[ids[0]!]).toBe("R.01 Local");
    expect(noms[ids[2]!]).toBe("R.03 Local");
    expect(noms[ids[3]!]).toBe("F.01 Fenêtre");
    expect(noms[ids[4]!]).toBe("R.01 Local");
    const r = numeroterEnSerie(m, ids, { prefixes: ["R."], depart: "1", parNiveau: false }).modele;
    expect(r.racine.occurrences[ids[4]!]!.nom).toBe("R.4 Local");
    // Renuméroter remplace l'ancien numéro, il ne s'empile pas.
    const r2 = numeroterEnSerie(r, ids, { prefixes: ["R."], depart: "1", parNiveau: false }).modele;
    expect(r2.racine.occurrences[ids[4]!]!.nom).toBe("R.4 Local");
  });
});
