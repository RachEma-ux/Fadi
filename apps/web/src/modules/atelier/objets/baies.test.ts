import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetBaie } from "@parcours/atelier-model";
import { appui, banc, cmd, etatDeTest, m, P, saisie, survol } from "./__tests__/banc";
import { dessinerBaie, dessinerMur } from "./dessinateurs";
import { oublierParametresObjets } from "./outils/parametres";

beforeEach(() => oublierParametresObjets());

const mur = (id: string, a: [number, number], b: [number, number]) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false });
const porte = (id: string, t: number, extra: Record<string, unknown> = {}) =>
  cmd("ouverture.poser", { id, niveauId: "rdc", calqueId: "C1", classe: "porte", murHoteId: "M1", position: { t }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type", ...extra });
const baies = (b: ReturnType<typeof banc>) => Object.values(b.etat().objets).filter((o): o is ObjetBaie => ["porte", "fenetre", "ouverture"].includes(o.classe));

describe("baies hébergées : poser, déplacer, emprise", () => {
  it("porte posée sur le mur sous le pointeur (hôte trouvé dans l'état), puis déplacée le long du mur", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0])));
    expect(b.registres.outils.trouver("creer.porte")?.raccourci).toBe("P");
    b.pilote.activer("creer.porte");
    await b.jouer(saisie("largeur", 0.9), saisie("hauteur", 2.1), survol(3, 0.05));
    expect(b.pilote.apercu().formes.some((f) => f.forme === "polygone" && f.style === "trace")).toBe(true);
    expect(b.pilote.apercu().formes.filter((f) => f.forme === "cote")).toHaveLength(2);
    await b.jouer(appui(2, 0.05));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "ouverture.poser", params: { classe: "porte", murHoteId: "M1", position: { t: 2 / 6 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" } });
    const p = baies(b)[0] as ObjetBaie;
    b.pilote.activer(null);
    b.ctx.selection.choisir([p.id]);
    expect(b.pilote.activer("modifier.deplacer-baie")).toEqual({ ok: true });
    await b.jouer(survol(4, 0), appui(4, 0));
    expect(b.valides[1]?.commandes[0]).toMatchObject({ type: "ouverture.deplacer", cibles: [p.id], params: { t: 4 / 6 } });
    expect(baies(b)[0]?.params.position.t).toBeCloseTo(4 / 6, 12);
    expect(b.pilote.outilActif()).toBeNull();
  });

  it("emprise refusée : hors du mur, chevauchement, trop près d'une jonction, hors d'un mur", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0]), mur("M2", [6, 0], [6, 4]), porte("P1", 0.5)));
    b.pilote.activer("creer.porte");
    await b.jouer(saisie("largeur", 0.9), saisie("hauteur", 2.1));
    await b.jouer(survol(0.2, 0));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("sort du mur hôte");
    expect(b.pilote.apercu().formes.some((f) => f.forme === "polygone" && f.style === "erreur")).toBe(true);
    await b.jouer(appui(0.2, 0));
    await b.jouer(appui(3.5, 0));
    expect(b.pilote.apercu().erreurs[0]).toMatchObject({ objet: "Porte", cause: "chevauche P1", action: "déplacer la baie ou réduire sa largeur" });
    await b.jouer(appui(5.5, 0));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("trop près de la jonction avec M2");
    await b.jouer(appui(3, 2));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("le pointeur n'est sur aucun mur du niveau actif");
    expect(b.valides).toHaveLength(0);
    await b.jouer(appui(5.4, 0));
    expect(b.valides).toHaveLength(1);
  });

  it("fenêtre : allège obligatoire (aucune valeur proposée) ; distance au centre saisie", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0])));
    b.pilote.activer("creer.fenetre");
    await b.jouer(saisie("largeur", 1.2), saisie("hauteur", 1.2), appui(3, 0));
    expect(b.pilote.apercu().erreurs[0]).toMatchObject({ objet: "Fenêtre", cause: "allège non renseignée" });
    await b.jouer(saisie("allege", 0.9), survol(3, 0), saisie("distance", 1.5), appui(3, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ params: { classe: "fenetre", position: { t: 0.25 }, allege: m(0.9) } });
  });

  it("ouverture (O) : la baie coupe le mur dans le dessin", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0])));
    b.pilote.activer("creer.ouverture");
    await b.jouer(saisie("largeur", 1), saisie("hauteur", 2), appui(3, 0));
    expect(b.valides).toHaveLength(1);
    const d = dessinerMur(b.etat().objets.M1 as never, b.etat());
    expect(d?.formes.filter((f) => f.forme === "polygone")).toHaveLength(2);
  });
});

describe("dessinateurs des baies", () => {
  it("porte : battant et arc seulement si le type d'ouverture est déclaré « hinged »", () => {
    const e = etatDeTest(mur("M1", [0, 0], [6, 0]), porte("P1", 0.5), porte("P2", 0.2, { largeur: m(0.8) }), cmd("propriete.definir", { nom: "openingType", valeur: "hinged", provenance: "saisie", statut: "declaree" }, ["P2"]));
    const neutre = dessinerBaie(e.objets.P1 as ObjetBaie, e);
    expect(neutre?.formes.some((f) => f.forme === "arc")).toBe(false);
    expect(neutre?.formes.some((f) => f.forme === "texte" && f.texte === "type d'ouverture non renseigné")).toBe(true);
    const battante = dessinerBaie(e.objets.P2 as ObjetBaie, e);
    expect(battante?.formes.some((f) => f.forme === "arc" && f.rayon === 0.8)).toBe(true);
    expect(battante?.segments.length).toBeGreaterThan(0);
    expect(battante?.points).toHaveLength(1);
    expect(battante?.contour).toHaveLength(4);
  });

  it("fenêtre : tableaux, cadre et vitrage", () => {
    const e = etatDeTest(mur("M1", [0, 0], [6, 0]), cmd("ouverture.poser", { id: "F1", niveauId: "rdc", calqueId: "C1", classe: "fenetre", murHoteId: "M1", position: { t: 0.5 }, largeur: m(1.2), hauteur: m(1.2), allege: m(0.9), typeId: "non-type" }));
    const d = dessinerBaie(e.objets.F1 as ObjetBaie, e);
    expect(d?.formes.filter((f) => f.forme === "polyligne")).toHaveLength(6);
    expect(d?.contour).toHaveLength(4);
  });
});
