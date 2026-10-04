import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetMur } from "@parcours/atelier-model";
import { oublierParametres } from "../plan2d/outils/commun";
import { appui, banc, choix, cmd, etatDeTest, m, P, saisie, survol, touche } from "./__tests__/banc";
import { dessinerMur } from "./dessinateurs";
import { oublierParametresObjets } from "./outils/parametres";

beforeEach(() => {
  oublierParametres();
  oublierParametresObjets();
});

const murs = (b: ReturnType<typeof banc>) => Object.values(b.etat().objets).filter((o): o is ObjetMur => o.classe === "mur");
const mur = (id: string, a: [number, number], b: [number, number], extra: Record<string, unknown> = {}) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false, ...extra });

describe("installation du module architecture", () => {
  it("outils des murs, raccourci M, dessinateurs de toutes les classes d'architecture", () => {
    const b = banc();
    const ids = b.registres.outils.lister().map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(["creer.mur", "connecter.scinder-mur", "connecter.joindre-murs"]));
    expect(b.registres.outils.trouver("creer.mur")?.raccourci).toBe("M");
    for (const c of ["mur", "porte", "fenetre", "ouverture", "dalle", "toiture", "escalier", "poteau", "piece", "espace", "zone", "solide"]) expect(b.registres.dessinateurs.pour(c), c).not.toBeNull();
    expect(b.registres.outils.rechercher("wall", "complet").map((o) => o.id)).toContain("creer.mur");
  });
});

describe("creer.mur : tracé chaîné", () => {
  it("refuse sans épaisseur ni hauteur (R3 : aucune valeur par défaut), message objet / cause / action", async () => {
    const b = banc();
    b.pilote.activer("creer.mur");
    await b.jouer(appui(0, 0), appui(4, 0));
    expect(b.valides).toHaveLength(0);
    expect(b.pilote.apercu().erreurs[0]).toMatchObject({ objet: "Mur", cause: "épaisseur non renseignée" });
  });

  it("trace quatre murs enchaînés et ferme sur le premier point ; aperçu d'épaisseur et champs de précision", async () => {
    const b = banc();
    b.pilote.activer("creer.mur");
    await b.jouer(saisie("epaisseur", 0.2), saisie("hauteur", 2.5), appui(0, 0), survol(4, 0.1));
    const ap = b.pilote.apercu();
    expect(ap.champs.map((c) => c.champ)).toEqual(["longueur", "angle", "epaisseur", "hauteur", "alignement", "type"]);
    expect(ap.formes.some((f) => f.forme === "polygone")).toBe(true);
    expect(ap.formes.some((f) => f.forme === "cote")).toBe(true);
    await b.jouer(appui(4, 0), appui(4, 3), appui(0, 3), appui(0, 0));
    expect(b.valides.map((v) => v.label)).toEqual(["Tracer un mur", "Tracer un mur", "Tracer un mur", "Tracer un mur"]);
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "mur.tracer", params: { niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(4, 0), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type" } });
    expect(murs(b)).toHaveLength(4);
    // Chaîne fermée : le clic suivant recommence un nouveau mur, rien n'est validé.
    await b.jouer(appui(10, 10));
    expect(b.valides).toHaveLength(4);
    expect(b.pilote.outilActif()?.id).toBe("creer.mur");
  });

  it("longueur et angle saisis : valeurs exactes ; double-clic termine la chaîne", async () => {
    const b = banc();
    b.pilote.activer("creer.mur");
    await b.jouer(saisie("epaisseur", 0.15), saisie("hauteur", 2.6), appui(1, 1), survol(2, 2), saisie("longueur", 4.5), saisie("angle", 90), appui(2, 2));
    expect(murs(b)[0]?.params.axe).toEqual({ a: P(1, 1), b: P(1, 5.5) });
    await b.jouer(appui(1, 5.5), appui(3, 3));
    expect(b.valides).toHaveLength(1);
  });

  it("jonction automatique : un mur qui prolonge exactement un autre est joint dans le même lot", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [2, 0])));
    b.pilote.activer("creer.mur");
    await b.jouer(saisie("epaisseur", 0.2), saisie("hauteur", 2.5), appui(2, 0), appui(5, 0));
    expect(b.valides[0]?.commandes.map((c) => c.type)).toEqual(["mur.tracer", "mur.joindre"]);
    expect(murs(b)).toHaveLength(1);
    expect(murs(b)[0]?.params.axe).toEqual({ a: P(0, 0), b: P(5, 0) });
    // Épaisseur différente : pas de jonction (mur.joindre exige des paramètres identiques).
    await b.jouer(touche("Enter"), saisie("epaisseur", 0.3), appui(5, 0), appui(7, 0));
    expect(b.valides[1]?.commandes.map((c) => c.type)).toEqual(["mur.tracer"]);
    expect(murs(b)).toHaveLength(2);
  });

  it("alignement et type choisis dans une liste (D-038) ; choix inconnu refusé", async () => {
    const b = banc(etatDeTest(cmd("type.definir", { definition: { id: "beton-20", classe: "mur", nom: "Béton 20", dimensionsProposees: { epaisseur: m(0.2), hauteur: m(2.6) }, proprietes: [], provenance: "saisie", statut: "declaree" } })));
    b.pilote.activer("creer.mur");
    const champ = (c: string) => b.pilote.apercu().champs.find((x) => x.champ === c);
    expect(champ("type")?.choix?.map((c) => c.valeur)).toEqual(["non-type", "beton-20"]);
    expect(champ("alignement")?.valeurChoisie).toBe("axe");
    await b.jouer(choix("alignement", "oblique"));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/alignement « oblique » inconnu/);
    await b.jouer(choix("alignement", "droite"), choix("type", "beton-20"));
    expect(champ("type")?.valeurChoisie).toBe("beton-20");
    // Épaisseur et hauteur proposées par le type (DA-05-14).
    expect(champ("epaisseur")?.valeur).toBe(0.2);
    await b.jouer(appui(0, 0), appui(3, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ params: { epaisseur: m(0.2), hauteur: m(2.6), alignement: "droite", typeId: "beton-20" } });
  });

  it("pipette : un mur sélectionné donne épaisseur, hauteur, alignement et type courants", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [2, 0], { epaisseur: m(0.3), alignement: "gauche" })));
    b.ctx.selection.choisir(["M1"]);
    b.pilote.activer("creer.mur");
    await b.jouer(appui(0, 5), appui(3, 5));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ params: { epaisseur: m(0.3), hauteur: m(2.5), alignement: "gauche" } });
  });
});

describe("scinder et joindre", () => {
  it("scinde un mur au point cliqué puis rejoint les deux moitiés", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0])));
    b.pilote.activer("connecter.scinder-mur");
    await b.jouer(survol(2, 0.05), appui(2, 0.05));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "mur.scinder", cibles: ["M1"], params: { point: P(2, 0) } });
    expect(murs(b).map((x) => x.params.axe)).toEqual([
      { a: P(0, 0), b: P(2, 0) },
      { a: P(2, 0), b: P(6, 0) },
    ]);
    const [g, d] = murs(b);
    b.pilote.activer("connecter.joindre-murs");
    await b.jouer(appui(1, 0), appui(4, 0));
    expect(b.valides[1]?.commandes[0]).toMatchObject({ type: "mur.joindre", cibles: [g?.id, d?.id] });
    expect(murs(b)).toHaveLength(1);
    expect(murs(b)[0]?.params.axe).toEqual({ a: P(0, 0), b: P(6, 0) });
  });

  it("scission hors d'un mur : erreur lisible, rien n'est validé", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0])));
    b.pilote.activer("connecter.scinder-mur");
    await b.jouer(appui(3, 4));
    expect(b.valides).toHaveLength(0);
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("aucun mur sous le pointeur");
  });
});

describe("dessinateur des murs", () => {
  it("contour d'épaisseur, faces et axe en segments, extrémités en points ; alignement gauche", () => {
    const e = etatDeTest(mur("M1", [0, 0], [4, 0]), mur("M2", [0, 2], [4, 2], { alignement: "gauche" }));
    const d1 = dessinerMur(e.objets.M1 as ObjetMur, e);
    expect(d1).toMatchObject({ objetId: "M1", couche: "objet", points: [P(0, 0), P(4, 0)] });
    expect(d1?.segments).toHaveLength(3);
    expect(d1?.contour).toEqual([P(0, 0.1), P(4, 0.1), P(4, -0.1), P(0, -0.1)]);
    const d2 = dessinerMur(e.objets.M2 as ObjetMur, e);
    // « gauche » : l'axe tracé est la face gauche, le corps est du côté −n (ici vers −y).
    expect(d2?.contour).toEqual([P(0, 2), P(4, 2), P(4, 1.8), P(0, 1.8)]);
  });

  it("la zone de plan dessine les murs du niveau par le registre", () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [4, 0])));
    const dessins = b.registres.dessinateurs.dessinerNiveau(b.etat(), "rdc");
    expect(dessins.map((d) => d.objetId)).toEqual(["M1"]);
  });
});
