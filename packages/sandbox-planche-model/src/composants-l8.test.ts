/** Cas 2 du catalogue, lot 8 — composants d'agence : fichier, pose dans la baie, ouverture qui suit, remplacement. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, appliquer, contexte, deplacer, effacerEntites, modeleVide, type Modele } from "./geometrie-libre.js";
import { ErreurComposant, composantDe, genreBaie, definitionDepuisFichier, facesComposant, lireFichierComposant, nombreBarreaux, poserComposant, regenererComposant, remplacerOccurrences, suivreOuvertures, type FichierComposant } from "./composants-l8.js";

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
const FENETRE = JSON.stringify({ format: "fadi-composant/1", source: "Agence, détail menuiserie (essai)", nom: "Fenêtre bois", genre: "fenetre", cadre: { largeur: 0.06, profondeur: 0.07 }, vantaux: 2 });
const PORTE = JSON.stringify({ format: "fadi-composant/1", source: "Agence (essai)", nom: "Porte", genre: "porte", main: "gauche", cadre: { largeur: 0.05, profondeur: 0.08 }, vantaux: 1 });
const GARDE_CORPS = JSON.stringify({ format: "fadi-composant/1", source: "Agence (essai)", nom: "Garde-corps", genre: "garde-corps", "garde-corps": { hauteur: 1, barreau: 0.02, lisse: 0.04 } });
const fichier = (t: string): FichierComposant => {
  const l = lireFichierComposant(t);
  if (!l.ok) throw new Error(l.erreur);
  return l.fichier;
};
/** Mur : face verticale 4 × 3 dans le plan y = 0 (normale −y ou +y). */
const mur = (): { m: Modele; face: string } => {
  const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 0, 3)).modele;
  return { m, face: Object.keys(m.racine.faces)[0]! };
};
const trous = (m: Modele): number => Object.values(contexte(m).faces).reduce((s, f) => s + f.trous.length, 0);
const xsTrou = (m: Modele): number[] => {
  const c = contexte(m);
  const f = Object.values(c.faces).find((x) => x.trous.length)!;
  return f.trous[0]!.map((s) => c.sommets[s]!.position.x).sort((a, b) => a - b);
};

describe("fichier fadi-composant/1", () => {
  it("source, nom, genre et section du cadre exigés ; aucune valeur par défaut", () => {
    expect(lireFichierComposant("{").ok).toBe(false);
    expect(lireFichierComposant(JSON.stringify({ format: "fadi-composant/1", nom: "x", genre: "fenetre", cadre: { largeur: 0.06, profondeur: 0.07 } }))).toEqual({ ok: false, erreur: "source" });
    expect(lireFichierComposant(JSON.stringify({ format: "fadi-composant/1", source: "s", nom: "x", genre: "fenetre" }))).toEqual({ ok: false, erreur: "cadre" });
    expect(lireFichierComposant(JSON.stringify({ format: "fadi-composant/1", source: "s", nom: "x", genre: "garde-corps", "garde-corps": { hauteur: 1, barreau: 0.02 } }))).toEqual({ ok: false, erreur: "garde-corps" });
    expect(lireFichierComposant(FENETRE).ok).toBe(true);
    expect(() => facesComposant(fichier(FENETRE), { largeur: 1.6 })).toThrow(ErreurComposant);
  });
  it("n° 61 : barreaux de bout en bout, vide entre barreaux au plus le vide saisi", () => {
    const { nombre, vide } = nombreBarreaux(2, 0.02, 0.11);
    expect(vide).toBeLessThanOrEqual(0.11);
    expect((2 - (nombre - 1) * 0.02) / (nombre - 2)).toBeGreaterThan(0.11); // un barreau de moins dépasserait le vide
    expect(nombre).toBe(17);
  });
});

describe("n° 32, 79, 25 — pose dans la baie, ouverture découpée qui suit", () => {
  it("face de mur : largeur, hauteur et allège saisies, ouverture percée, le trou suit le déplacement et l'effacement", () => {
    const { m, face } = mur();
    const r = poserComposant(m, { fichier: fichier(FENETRE), texte: FENETRE, nomFichier: "fenetre.json", archive: "a1", valeurs: { largeur: 1.6, hauteur: 1.8, allege: 0.9 }, decouper: true }, { face });
    expect(r.baie).toBe("saisie");
    expect(trous(r.modele)).toBe(1);
    expect(xsTrou(r.modele)[0]).toBeCloseTo(1.2, 9);
    const occ = r.modele.racine.occurrences[r.occurrence]!;
    expect(occ.ouverture?.contour).toHaveLength(4);
    expect(composantDe(r.modele, r.occurrence)?.meta.valeurs).toMatchObject({ largeur: 1.6, hauteur: 1.8, allege: 0.9, vantaux: 2 });
    expect(r.modele.definitions[occ.definition]!.composantAgence?.archive).toBe("a1");
    const bouge = deplacer(r.modele, [r.occurrence], v3(1, 0, 0)).modele;
    const suivi = suivreOuvertures(r.modele, bouge);
    expect(trous(suivi)).toBe(1);
    expect(xsTrou(suivi)[0]).toBeCloseTo(2.2, 9);
    const efface = effacerEntites(suivi, [r.occurrence]).modele;
    const apres = suivreOuvertures(suivi, efface);
    expect(trous(apres)).toBe(0);
    expect(Object.keys(contexte(apres).faces)).toHaveLength(1);
  });
  it("baie dessinée dans le mur : dimensions reprises de la baie, la baie devient le trou", () => {
    const { m } = mur();
    const b = ajouterRectangle(m, v3(1, 0, 1), v3(1.2, 0, 0), v3(0, 0, 1.4));
    const baie = b.rapport.crees.find((x) => b.modele.racine.faces[x])!;
    const r = poserComposant(b.modele, { fichier: fichier(FENETRE), texte: FENETRE, nomFichier: "fenetre.json", valeurs: {}, decouper: true }, { face: baie });
    expect(r.baie).toBe("face");
    expect(r.valeurs["largeur"]).toBeCloseTo(1.2, 9);
    expect(r.valeurs["hauteur"]).toBeCloseTo(1.4, 9);
    expect(r.valeurs["allege"]).toBeCloseTo(1, 9);
    expect(trous(r.modele)).toBe(1);
    expect(r.modele.racine.faces[baie]).toBeUndefined();
  });
  it("régénérer : trois vantaux, allège relevée (la menuiserie monte, le trou suit)", () => {
    const { m, face } = mur();
    const r = poserComposant(m, { fichier: fichier(FENETRE), texte: FENETRE, nomFichier: "f.json", valeurs: { largeur: 1.6, hauteur: 1.2, allege: 0.9 }, decouper: true }, { face });
    const def0 = r.modele.racine.occurrences[r.occurrence]!.definition;
    const faces0 = Object.keys(r.modele.definitions[def0]!.contenu.faces).length;
    const g = regenererComposant(r.modele, r.occurrence, { vantaux: 3, allege: 1.1 });
    const def1 = g.racine.occurrences[r.occurrence]!.definition;
    expect(def1).not.toBe(def0);
    expect(g.definitions[def0]).toBeUndefined();
    expect(Object.keys(g.definitions[def1]!.contenu.faces).length).toBe(faces0 + 7);
    expect(g.racine.occurrences[r.occurrence]!.transformation[11]).toBeCloseTo(1.1, 9);
    const s = suivreOuvertures(r.modele, g);
    const c = contexte(s);
    const f = Object.values(c.faces).find((x) => x.trous.length)!;
    expect(Math.min(...f.trous[0]!.map((x) => c.sommets[x]!.position.z))).toBeCloseTo(1.1, 9);
  });
  it("garde-corps posé sur une arête horizontale : longueur reprise, barreaux du vide saisi", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 3), v3(2, 0, 3)).modele;
    const a = Object.keys(m.racine.aretes)[0]!;
    const r = poserComposant(m, { fichier: fichier(GARDE_CORPS), texte: GARDE_CORPS, nomFichier: "gc.json", valeurs: { vide: 0.11 }, decouper: false }, { arete: a });
    expect(r.valeurs["longueur"]).toBeCloseTo(2, 9);
    const def = r.modele.definitions[r.modele.racine.occurrences[r.occurrence]!.definition]!;
    expect(Object.keys(def.contenu.faces)).toHaveLength(6 * 18); // lisse + 17 barreaux
    expect(() => poserComposant(m, { fichier: fichier(GARDE_CORPS), texte: GARDE_CORPS, nomFichier: "gc.json", valeurs: {}, decouper: false }, { arete: a })).toThrow(ErreurComposant);
  });
  it("garde-corps pointé par ses extrémités : longueur des points, ou longueur saisie dans la direction cliquée", () => {
    const pose = { fichier: fichier(GARDE_CORPS), texte: GARDE_CORPS, nomFichier: "gc.json", valeurs: { vide: 0.11 }, decouper: false };
    const r = poserComposant(modeleVide(), pose, { segment: { a: v3(0, 0, 3), b: v3(0, 3, 3) } });
    expect(r.valeurs["longueur"]).toBeCloseTo(3, 9);
    const fin = appliquer(r.modele.racine.occurrences[r.occurrence]!.transformation, v3(3, 0, 0));
    expect(fin.y).toBeCloseTo(3, 9);
    const s = poserComposant(modeleVide(), { ...pose, valeurs: { vide: 0.11, longueur: 2 } }, { segment: { a: v3(0, 0, 3), b: v3(0, 3, 3.4) } });
    expect(s.valeurs["longueur"]).toBe(2);
    expect(() => poserComposant(modeleVide(), pose, { segment: { a: v3(0, 0, 3), b: v3(0, 0, 4) } })).toThrow(ErreurComposant);
  });
  it("baie d'un mur plein placée d'un clic : le point cliqué donne le milieu de la largeur", () => {
    const { m, face } = mur();
    expect(genreBaie(m, face)).toBe("saisie");
    const r = poserComposant(m, { fichier: fichier(FENETRE), texte: FENETRE, nomFichier: "f.json", valeurs: { largeur: 1.6, hauteur: 1.8, allege: 0.9 }, decouper: true }, { face, point: v3(3, 0, 1.5) });
    expect(xsTrou(r.modele)[0]).toBeCloseTo(2.2, 9);
  });
});

describe("n° 88 — remplacer des occurrences", () => {
  it("position, balise, nom et données gardés ; le trou suit le nouveau composant", () => {
    const { m, face } = mur();
    const r = poserComposant(m, { fichier: fichier(FENETRE), texte: FENETRE, nomFichier: "f.json", valeurs: { largeur: 1.6, hauteur: 1.8, allege: 0.9 }, decouper: true }, { face });
    const o = r.modele.racine.occurrences[r.occurrence]!;
    const marque: Modele = { ...r.modele, racine: { ...r.modele.racine, occurrences: { ...r.modele.racine.occurrences, [r.occurrence]: { ...o, balise: "b1", nom: "F1", donnees: { ext: { k: 1 } } } } } };
    const d = definitionDepuisFichier(marque, { fichier: fichier(PORTE), texte: PORTE, nomFichier: "porte.json", valeurs: { largeur: 0.9, hauteur: 1.5 } });
    const rem = remplacerOccurrences(d.modele, [r.occurrence], d.definition);
    expect(rem.remplaces).toBe(1);
    const x = rem.modele.racine.occurrences[r.occurrence]!;
    expect(x.definition).toBe(d.definition);
    expect(x.transformation).toEqual(o.transformation);
    expect([x.balise, x.nom, x.donnees]).toEqual(["b1", "F1", { ext: { k: 1 } }]);
    expect(rem.modele.definitions[o.definition]).toBeUndefined();
    const s = suivreOuvertures(d.modele, rem.modele);
    const xs = xsTrou(s);
    expect(xs[xs.length - 1]! - xs[0]!).toBeCloseTo(0.9, 9);
    expect(() => remplacerOccurrences(rem.modele, [], d.definition)).toThrow(ErreurComposant);
  });
});
