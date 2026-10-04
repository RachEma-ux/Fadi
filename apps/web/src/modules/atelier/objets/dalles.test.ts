import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetDalle, ObjetEscalier } from "@parcours/atelier-model";
import { oublierParametres } from "../plan2d/outils/commun";
import { appui, banc, choix, cmd, dernier, etatDeTest, m, P, saisie, survol, touche } from "./__tests__/banc";
import { dessinerEscalier, dessinerSurface } from "./dessinateurs";
import { indicesEscalier } from "./outils/escalier";
import { oublierParametresObjets } from "./outils/parametres";

beforeEach(() => {
  oublierParametres();
  oublierParametresObjets();
});

const mur = (id: string, a: [number, number], b: [number, number]) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false });
const quatreMurs = () => [mur("M1", [0, 0], [4, 0]), mur("M2", [4, 0], [4, 3]), mur("M3", [4, 3], [0, 3]), mur("M4", [0, 3], [0, 0])];
const etage = () => cmd("niveau.creer", { id: "r1", nom: "Étage 1", elevation: m(3), hauteur: m(3), ordre: 1 });

describe("creer.dalle", () => {
  it("raccourci S ; refuse sans épaisseur (R3), puis crée la dalle par contour fermé sur le premier point", async () => {
    const b = banc();
    expect(b.registres.outils.trouver("creer.dalle")?.raccourci).toBe("S");
    b.pilote.activer("creer.dalle");
    await b.jouer(appui(0, 0), appui(5, 0), appui(5, 4), survol(0, 4));
    expect(b.pilote.apercu().formes.some((f) => f.forme === "texte" && f.texte.endsWith("m²"))).toBe(true);
    await b.jouer(appui(0, 4), appui(0, 0));
    expect(b.pilote.apercu().erreurs[0]).toMatchObject({ objet: "Dalle", cause: "épaisseur non renseignée" });
    expect(b.valides).toHaveLength(0);
    await b.jouer(saisie("epaisseur", 0.2), saisie("decalageBase", -0.2), appui(0, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "dalle.creer", params: { niveauId: "rdc", calqueId: "C1", epaisseur: m(0.2), decalageBase: m(-0.2), trous: [] } });
    const d = dernier(b.etat(), "dalle") as ObjetDalle;
    expect(d.params.contour).toHaveLength(4);
    const dessin = dessinerSurface(d);
    expect(dessin?.segments).toHaveLength(4);
    expect(dessin?.contour).toHaveLength(4);
  });

  it("mode « depuis une pièce » : reprend le contour de la pièce sous le pointeur", async () => {
    const b = banc(etatDeTest(...quatreMurs()));
    b.pilote.activer("creer.piece");
    await b.jouer(appui(2, 1.5));
    b.pilote.activer("creer.dalle");
    await b.jouer(saisie("epaisseur", 0.25), saisie("decalageBase", 0), choix("mode", "piece"), appui(10, 10));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("aucune pièce sous le pointeur");
    await b.jouer(survol(2, 1.5));
    expect(b.pilote.apercu().consigne).toMatch(/Pièce 1/);
    await b.jouer(appui(2, 1.5));
    expect(b.valides.at(-1)?.label).toBe("Créer une dalle depuis la pièce Pièce 1");
    const d = dernier(b.etat(), "dalle") as ObjetDalle;
    expect(d.params.contour).toHaveLength(4);
    await b.jouer(choix("mode", "inconnu"));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/inconnu/);
  });

  it("Entrée ferme dès trois sommets ; retour arrière retire le dernier", async () => {
    const b = banc();
    b.pilote.activer("creer.dalle");
    await b.jouer(saisie("epaisseur", 0.2), saisie("decalageBase", 0), appui(0, 0), appui(3, 0), appui(9, 9), touche("Backspace"), appui(3, 3), touche("Enter"));
    expect((dernier(b.etat(), "dalle") as ObjetDalle).params.contour).toHaveLength(3);
  });
});

describe("creer.escalier : escalier droit paramétrique", () => {
  it("niveau d'arrivée : hauteur dérivée, giron verrouillant la longueur, 2h + g calculé à titre indicatif (D-039)", async () => {
    const b = banc(etatDeTest(etage()));
    expect(b.registres.outils.trouver("creer.escalier")?.raccourci).toBe("E");
    b.pilote.activer("creer.escalier");
    await b.jouer(choix("arrivee", "r1"), saisie("largeur", 1.2), saisie("contremarches", 18), saisie("marches", 17), saisie("giron", 0.28), appui(0, 0), survol(6, 0));
    const ap = b.pilote.apercu();
    expect(ap.champs.find((c) => c.champ === "hauteurAFranchir")?.valeur).toBe(3);
    expect(ap.consigne).toMatch(/2h \+ g = .*\(indicatif\)/);
    await b.jouer(appui(6, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "escalier.creer", params: { niveauDepartId: "rdc", niveauArriveeId: "r1", hauteurAFranchir: m(3), marches: 17, contremarches: 18, decalageBase: m(0) } });
    const e = dernier(b.etat(), "escalier") as ObjetEscalier;
    expect(e.params.axe.b.x).toBeCloseTo(17 * 0.28, 9);
    const i = indicesEscalier(e, b.etat());
    expect(i.hauteur).toBeCloseTo(3 / 18, 9);
    expect(i.giron).toBeCloseTo(0.28, 9);
    expect(i.blondel).toBeCloseTo(2 * (3 / 18) + 0.28, 9);
    const d = dessinerEscalier(e);
    expect(d?.contour).toHaveLength(4);
    expect(d?.points).toHaveLength(2);
    expect(d?.segments.length).toBeGreaterThanOrEqual(5);
    // 16 nez de marche intermédiaires dessinés.
    expect(d?.formes.filter((f) => f.style === "fin").length).toBeGreaterThanOrEqual(16);
  });

  it("2h + g très éloigné de l'usage : aucune borne, l'escalier est créé et la valeur affichée (D-039)", async () => {
    const b = banc(etatDeTest(etage()));
    b.pilote.activer("creer.escalier");
    await b.jouer(choix("arrivee", "r1"), saisie("largeur", 1), saisie("contremarches", 5), saisie("marches", 4), saisie("giron", 0.6), appui(0, 0), appui(3, 0));
    const e = dernier(b.etat(), "escalier") as ObjetEscalier;
    expect(indicesEscalier(e, b.etat()).blondel).toBeCloseTo(2 * 0.6 + 0.6, 9);
  });

  it("volée partielle : hauteur à franchir et décalage exigés, puis volée sans niveau d'arrivée", async () => {
    const b = banc();
    b.pilote.activer("creer.escalier");
    await b.jouer(saisie("largeur", 1), saisie("contremarches", 6), saisie("marches", 5), appui(0, 0), appui(0, 1.5));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/hauteur à franchir/);
    await b.jouer(saisie("hauteurAFranchir", 1), appui(0, 1.5));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/décalage de départ/);
    await b.jouer(saisie("decalageBase", 0.5), appui(0, 1.5));
    const e = dernier(b.etat(), "escalier") as ObjetEscalier;
    expect(e.params.niveauArriveeId).toBeUndefined();
    expect(indicesEscalier(e, b.etat()).giron).toBeCloseTo(0.3, 9);
    await b.jouer(saisie("contremarches", 2.5));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/entier attendu/);
  });
});
