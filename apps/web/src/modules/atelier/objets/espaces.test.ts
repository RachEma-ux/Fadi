import { beforeEach, describe, expect, it } from "vitest";
import type { ObjetEspace, ObjetNiveau, ObjetZone } from "@parcours/atelier-model";
import type { ChampInspecteur } from "../socle";
import { oublierParametres } from "../plan2d/outils/commun";
import { appui, banc, cmd, dernier, etatDeTest, m, P, saisie, saisieTexte, survol, touche } from "./__tests__/banc";
import { dessinerPiece } from "./dessinateurs";
import { DESCRIPTEUR_ARCHITECTURE } from "./inspecteur";
import { oublierParametresObjets } from "./outils/parametres";

beforeEach(() => {
  oublierParametres();
  oublierParametresObjets();
});

const carre = (x0: number, y0: number, c: number) => [P(x0, y0), P(x0 + c, y0), P(x0 + c, y0 + c), P(x0, y0 + c)];
const piece = (id: string, nom: string, x0: number) => cmd("piece.creer", { id, niveauId: "rdc", calqueId: "C1", polygones: [{ contour: carre(x0, 0, 3), trous: [] }], nom });
const espace = (id: string, nom: string, x0: number) => cmd("espace.creer", { id, niveauId: "rdc", calqueId: "C1", polygones: [{ contour: carre(x0, 0, 2), trous: [] }], nom });
const champ = (b: ReturnType<typeof banc>, id: string, cle: string) => DESCRIPTEUR_ARCHITECTURE.champs(b.etat().objets[id] as never, b.ctx).find((c) => c.cle === cle) as ChampInspecteur;

describe("creer.espace", () => {
  it("contour fermé sur le premier point, nom et catégorie saisis en texte (D-038)", async () => {
    const b = banc();
    b.pilote.activer("creer.espace");
    expect(b.pilote.apercu().champs.filter((c) => c.genre === "texte").map((c) => c.champ)).toEqual(["nom", "categorie"]);
    await b.jouer(saisieTexte("nom", "Terrasse"), saisieTexte("categorie", "extérieur"), appui(0, 0), appui(4, 0), survol(4, 2));
    await b.jouer(saisie("longueur", 2.5), appui(4, 9), appui(0, 2.5), appui(0, 0));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "espace.creer", params: { nom: "Terrasse", categorie: "extérieur", niveauId: "rdc" } });
    const e = dernier(b.etat(), "espace") as ObjetEspace;
    expect(e.params.polygones[0]?.contour).toHaveLength(4);
    expect(e.params.polygones[0]?.contour[2]).toMatchObject({ x: 4, y: 2.5 });
    expect(champ(b, e.id, "aire").valeur).toEqual({ value: 10, unit: "m²" });
    const d = dessinerPiece(e, b.etat());
    expect(d?.contour).toHaveLength(4);
    expect(d?.points).toHaveLength(1);
  });

  it("sans nom : « Espace n » libre du niveau ; moins de trois sommets : rien n'est créé", async () => {
    const b = banc(etatDeTest(espace("E1", "Espace 1", 10)));
    b.pilote.activer("creer.espace");
    await b.jouer(appui(0, 0), appui(2, 0), touche("Enter"));
    expect(b.valides).toHaveLength(0);
    await b.jouer(appui(2, 2), touche("Enter"));
    expect((dernier(b.etat(), "espace") as ObjetEspace).params.nom).toBe("Espace 2");
  });
});

describe("creer.zone", () => {
  it("clic sur une pièce et un espace, Entrée : zone avec relations « contient », dessinée depuis son contenu", async () => {
    const b = banc(etatDeTest(piece("R1", "Chambre", 0), espace("S1", "Loggia", 5)));
    b.pilote.activer("creer.zone");
    await b.jouer(touche("Enter"));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("aucune pièce ni aucun espace choisi");
    await b.jouer(appui(20, 20));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/sous le pointeur/);
    await b.jouer(saisieTexte("nom", "Logement A"), appui(1, 1), appui(6, 1), appui(9, 9), survol(1, 1));
    expect(b.pilote.apercu().formes[0]).toMatchObject({ forme: "surligner", ids: ["R1", "S1"] });
    // Second clic sur la pièce : retirée, puis remise.
    await b.jouer(appui(1, 1), appui(1, 1, {}, "R1"), touche("Enter"));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "zone.creer", params: { nom: "Logement A", polygones: [], contenu: ["S1", "R1"] } });
    const z = dernier(b.etat(), "zone") as ObjetZone;
    expect(b.etat().relations.filter((r) => r.type === "contient" && r.sourceId === z.id).map((r) => r.cibleId).sort()).toEqual(["R1", "S1"]);
    const d = dessinerPiece(z, b.etat());
    expect(d?.contour).toHaveLength(4);
    expect(champ(b, z.id, "contenu").valeur).toBe("Loggia, Chambre");
    expect(champ(b, z.id, "aire").valeur).toEqual({ value: 13, unit: "m²" });
    expect(champ(b, z.id, "contenu").lectureSeule).toBe(true);
  });
});

describe("creer.niveau", () => {
  it("activable sans niveau actif ; champs exigés (R3), ordre déjà pris refusé, puis niveau créé", async () => {
    const b = banc();
    b.vue.modifier({ niveauActifId: null });
    expect(b.registres.outils.trouver("creer.niveau")?.activation(b.ctx)).toEqual({ ok: true });
    expect(b.registres.outils.trouver("creer.espace")?.activation(b.ctx).ok).toBe(false);
    b.pilote.activer("creer.niveau");
    await b.jouer(touche("Enter"));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("nom non renseigné");
    await b.jouer(saisieTexte("nom", "Étage 1"), saisie("elevation", 3), saisie("hauteur", 2.8), touche("Enter"));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/ordre non renseigné/);
    await b.jouer(saisie("ordre", 1.5));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/entier positif ou nul/);
    await b.jouer(saisie("ordre", 0), touche("Enter"));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/ordre 0 déjà pris/);
    expect(b.valides).toHaveLength(0);
    await b.jouer(saisie("ordre", 1), touche("Enter"));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "niveau.creer", params: { nom: "Étage 1", elevation: m(3), hauteur: m(2.8), ordre: 1 } });
    const n = dernier(b.etat(), "niveau") as ObjetNiveau;
    expect(n.params.nom).toBe("Étage 1");
    expect(b.pilote.outilActif()).toBeNull();
  });

  it("inspecteur du niveau : renommage par niveau.modifier", async () => {
    const b = banc();
    const c = champ(b, "rdc", "nom");
    expect(c.controler("Rez-de-chaussée")).toBeNull();
    const r = await b.ctx.valider("Renommer", c.commandes("Rez-de-chaussée"));
    expect(r.ok).toBe(true);
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "niveau.modifier", cibles: ["rdc"] });
    expect((b.etat().objets.rdc as ObjetNiveau).params.nom).toBe("Rez-de-chaussée");
  });
});
