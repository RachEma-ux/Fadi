import { describe, expect, it } from "vitest";
import type { ObjetPiece } from "@parcours/atelier-model";
import { appui, banc, cmd, etatDeTest, m, P, saisieTexte, survol, touche } from "./__tests__/banc";
import { dessinerPiece } from "./dessinateurs";

const mur = (id: string, a: [number, number], b: [number, number]) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false });
/** Quatre murs fermés 4 × 3 m, plus un mur de refend à x = 6 formant une seconde pièce 2 × 3 m. */
const quatreMurs = () => [mur("M1", [0, 0], [4, 0]), mur("M2", [4, 0], [4, 3]), mur("M3", [4, 3], [0, 3]), mur("M4", [0, 3], [0, 0])];
const pieces = (b: ReturnType<typeof banc>) => Object.values(b.etat().objets).filter((o): o is ObjetPiece => o.classe === "piece");

describe("pièces : proposition puis création", () => {
  it("quatre murs fermés : contour proposé au survol avec sa surface, pièce de 12 m² créée au clic", async () => {
    const b = banc(etatDeTest(...quatreMurs()));
    b.pilote.activer("creer.piece");
    await b.jouer(survol(2, 1.5));
    const ap = b.pilote.apercu();
    expect(ap.formes.some((f) => f.forme === "polygone" && f.points.length === 4)).toBe(true);
    expect(ap.formes.some((f) => f.forme === "texte" && f.texte === "Proposition — 12,00 m²")).toBe(true);
    expect(b.valides).toHaveLength(0);
    await b.jouer(appui(2, 1.5));
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "piece.creer", params: { niveauId: "rdc", calqueId: "C1", nom: "Pièce 1" } });
    const p = pieces(b)[0] as ObjetPiece;
    const d = dessinerPiece(p, b.etat());
    expect(d).toMatchObject({ couche: "annotation", segments: [] });
    expect(d?.contour).toHaveLength(4);
    expect(d?.formes.some((f) => f.forme === "texte" && f.texte === "Pièce 1 — 12,00 m²")).toBe(true);
    // Deuxième clic : la pièce existe déjà, rien n'est créé.
    await b.jouer(appui(2, 1.5));
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/correspond déjà à la pièce Pièce 1/);
    await b.jouer(appui(10, 10));
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("aucune boucle de murs fermée autour du point");
    expect(pieces(b)).toHaveLength(1);
  });

  it("nom saisi dans le champ texte (D-038) : la pièce le reçoit", async () => {
    const b = banc(etatDeTest(...quatreMurs()));
    b.pilote.activer("creer.piece");
    expect(b.pilote.apercu().champs[0]).toMatchObject({ champ: "nom", genre: "texte" });
    await b.jouer(saisieTexte("nom", "  Séjour "), survol(2, 1.5));
    expect(b.pilote.apercu().formes.some((f) => f.forme === "texte" && f.texte === "Séjour — 12,00 m²")).toBe(true);
    await b.jouer(appui(2, 1.5));
    expect(pieces(b)[0]?.params.nom).toBe("Séjour");
  });

  it("détection du niveau : deux contours, seule la nouvelle pièce est créée à la validation", async () => {
    const b = banc(etatDeTest(...quatreMurs(), mur("M5", [4, 0], [6, 0]), mur("M6", [6, 0], [6, 3]), mur("M7", [6, 3], [4, 3])));
    b.pilote.activer("creer.piece");
    await b.jouer(appui(1, 1));
    b.pilote.activer("analyser.pieces");
    const ap = b.pilote.apercu();
    expect(ap.consigne).toMatch(/2 contour\(s\) proposé\(s\), dont 1 nouveau/);
    expect(ap.formes.some((f) => f.forme === "texte" && f.texte === "nouvelle — 6,00 m²")).toBe(true);
    await b.jouer(touche("Enter"));
    expect(b.valides[1]?.commandes.map((c) => c.type)).toEqual(["piece.creer"]);
    expect(pieces(b).map((p) => p.params.nom).sort()).toEqual(["Pièce 1", "Pièce 2"]);
    expect(b.pilote.outilActif()).toBeNull();
  });
});
