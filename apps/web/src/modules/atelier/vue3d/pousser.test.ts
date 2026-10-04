import { beforeEach, describe, expect, it } from "vitest";
import { appui, banc, cmd, etatDeTest, m, P, saisie, touche } from "../objets/__tests__/banc";
import { oublierParametresObjets } from "../objets/outils/parametres";
import { CHAMP_GLISSER, ID_EXTRUDER, ID_POUSSER, outilExtruder, outilPousser } from "./outils";
import { ciblePoussee, commandesExtrusion, commandesPoussee, contourExtrudable } from "./pousser";

beforeEach(() => oublierParametresObjets());

const mur = cmd("mur.tracer", { id: "M1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(6, 0), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false });
const murLie = cmd("mur.tracer", { id: "M2", niveauId: "rdc", calqueId: "C1", a: P(0, 2), b: P(6, 2), epaisseur: m(0.2), niveauHaut: "r1", alignement: "axe", typeId: "non-type", exterieur: false });
const r1 = cmd("niveau.creer", { id: "r1", nom: "R+1", elevation: m(3), hauteur: m(3), ordre: 1 });
const dalle = cmd("dalle.creer", { id: "D1", niveauId: "rdc", calqueId: "C1", contour: [P(0, 0), P(6, 0), P(6, 4), P(0, 4)], trous: [], epaisseur: m(0.2), decalageBase: m(-0.2) });
const rect = cmd("esquisse.rectangle", { id: "R1", niveauId: "rdc", calqueId: "C1", origine: P(10, 10), largeur: m(2), profondeur: m(1), angle: { value: 0, unit: "°" } });
const ligne = cmd("esquisse.ligne", { id: "L1", niveauId: "rdc", calqueId: "C1", a: P(0, 5), b: P(3, 5) });

const avecOutils = (etat: ReturnType<typeof etatDeTest>) => {
  const b = banc(etat);
  b.registres.outils.enregistrer(outilPousser());
  b.registres.outils.enregistrer(outilExtruder());
  return b;
};

describe("pousser / tirer (DA-04-07) : pur", () => {
  it("grandeur par classe, mur lié au niveau haut refusé, valeur > 0 exigée", () => {
    const etat = etatDeTest(r1, mur, murLie, dalle);
    expect(ciblePoussee(etat.objets.M1)).toEqual({ objetId: "M1", classe: "mur", cle: "hauteur", libelle: "Hauteur", valeur: 2.5 });
    expect(ciblePoussee(etat.objets.D1)).toMatchObject({ cle: "epaisseur", valeur: 0.2 });
    expect(ciblePoussee(etat.objets.M2)).toEqual({ motif: "hauteur liée au niveau haut : la régler dans l'inspecteur" });
    expect(ciblePoussee(etat.objets.rdc)).toHaveProperty("motif");
    const c = ciblePoussee(etat.objets.M1) as Exclude<ReturnType<typeof ciblePoussee>, { motif: string }>;
    expect(commandesPoussee(c, 3.2)).toEqual([cmd("mur.modifier", { modifications: { hauteur: m(3.2) } }, ["M1"])]);
    expect(commandesPoussee(c, 0)).toHaveProperty("motif");
  });

  it("extrusion : contour du rectangle, esquisse consommée sur demande, hauteur > 0 exigée", () => {
    const etat = etatDeTest(rect, ligne);
    expect(contourExtrudable(etat.objets.L1)).toHaveProperty("motif");
    const s = contourExtrudable(etat.objets.R1) as Exclude<ReturnType<typeof contourExtrudable>, { motif: string }>;
    expect(s.contour.map((p) => [p.x, p.y])).toEqual([[10, 10], [12, 10], [12, 11], [10, 11]]);
    const lot = commandesExtrusion(s, { id: "S1", hauteur: 0.9, decalageBase: 0, conserverSource: false }) as readonly { type: string }[];
    expect(lot.map((c) => c.type)).toEqual(["solide.extruder", "esquisse.supprimer"]);
    expect(commandesExtrusion(s, { id: "S1", hauteur: -1, decalageBase: 0, conserverSource: true })).toHaveProperty("motif");
  });
});

describe("outils Pousser / tirer et Extruder : évènements → commandes → réducteur", () => {
  it("pousser : valeur glissée proposée puis Entrée ; valeur tapée validée exactement ; Échap renonce", async () => {
    const b = avecOutils(etatDeTest(mur));
    b.ctx.selection.choisir(["M1"]);
    b.vue.modifier({ vue: "3d" });
    expect(b.pilote.activer(ID_POUSSER)).toEqual({ ok: true });
    expect(b.pilote.apercu().champs).toEqual([{ champ: "hauteur", libelle: "Hauteur", unite: "m", valeur: 2.5 }]);
    await b.jouer(saisie(CHAMP_GLISSER, 3.1));
    expect(b.pilote.apercu().consigne).toContain("2,50 m → 3,10 m");
    expect(b.valides).toHaveLength(0);
    await b.jouer(touche("Enter"));
    expect(b.valides[0]?.commandes).toEqual([cmd("mur.modifier", { modifications: { hauteur: m(3.1) } }, ["M1"])]);
    expect((b.etat().objets.M1?.params as { hauteur: { value: number } }).hauteur.value).toBe(3.1);
    expect(b.pilote.outilActif()).toBeNull();

    b.pilote.activer(ID_POUSSER);
    await b.jouer(saisie("hauteur", 3.25));
    expect((b.etat().objets.M1?.params as { hauteur: { value: number } }).hauteur.value).toBe(3.25);
    b.pilote.activer(ID_POUSSER);
    await b.jouer(saisie(CHAMP_GLISSER, 4), touche("Escape"));
    expect(b.valides).toHaveLength(2);
  });

  it("activation : un mur lié à un niveau haut, ou rien de poussable, est refusé avec son motif", () => {
    const b = avecOutils(etatDeTest(r1, murLie));
    b.ctx.selection.choisir(["M2"]);
    expect(b.pilote.activer(ID_POUSSER)).toEqual({ ok: false, motif: "hauteur liée au niveau haut : la régler dans l'inspecteur" });
  });

  it("extruder : rectangle → solide de 0,90 m, esquisse conservée par défaut ; hauteur mémorisée ; appui = accord", async () => {
    const b = avecOutils(etatDeTest(rect));
    b.ctx.selection.choisir(["R1"]);
    expect(b.pilote.activer(ID_EXTRUDER)).toEqual({ ok: true });
    await b.jouer(saisie("hauteur", 0.9));
    const solide = Object.values(b.etat().objets).find((o) => o.classe === "solide");
    expect(solide?.params).toMatchObject({ hauteur: m(0.9), decalageBase: m(0), ferme: true, role: "solid" });
    expect(b.etat().objets.R1).toBeDefined();
    b.ctx.selection.choisir(["R1"]);
    b.pilote.activer(ID_EXTRUDER);
    expect(b.pilote.apercu().champs[0]).toMatchObject({ champ: "hauteur", valeur: 0.9 });
    await b.jouer({ type: "choix", champ: "conserver", valeur: "non" }, appui(0, 0));
    expect(b.valides[1]?.commandes.map((c) => c.type)).toEqual(["solide.extruder", "esquisse.supprimer"]);
    expect(b.etat().objets.R1).toBeUndefined();
  });
});
