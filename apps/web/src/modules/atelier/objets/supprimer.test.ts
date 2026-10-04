import { beforeEach, describe, expect, it } from "vitest";
import { planSuppression } from "../plan2d/outils/supprimer";
import { appui, banc, cmd, etatDeTest, m, P, touche } from "./__tests__/banc";
import { oublierParametresObjets } from "./outils/parametres";

beforeEach(() => oublierParametresObjets());

const mur = (id: string, a: [number, number], b: [number, number]) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false });
const porte = (id: string, hote: string, t: number) =>
  cmd("ouverture.poser", { id, niveauId: "rdc", calqueId: "C1", classe: "porte", murHoteId: hote, position: { t }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" });
const cote = cmd("cotation.creer", { id: "K1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(6, 0), decalage: m(0.5), references: [{ extremite: "a", objetId: "M1", caracteristique: "mur:arete-debut" }] });
const ligne = cmd("esquisse.ligne", { id: "L1", niveauId: "rdc", calqueId: "C1", a: P(0, 5), b: P(3, 5) });

describe("outil Supprimer (L3b.0, D-045)", () => {
  it("plan : une commande par type, annotations d'abord, baies hébergées entraînées, références à réparer", () => {
    const etat = etatDeTest(mur("M1", [0, 0], [6, 0]), porte("P1", "M1", 0.5), cote, ligne);
    const p = planSuppression(etat, ["M1", "L1"]);
    expect(p.commandes).toEqual([cmd("mur.supprimer", {}, ["M1"]), cmd("esquisse.supprimer", {}, ["L1"])]);
    expect(p.baiesEntrainees).toEqual(["P1"]);
    expect(p.aReparer).toEqual(["K1"]);
    // Baie sélectionnée avec son mur : elle n'est pas ciblée deux fois ; cotation sélectionnée : pas « à réparer ».
    const q = planSuppression(etat, ["P1", "M1", "K1", "rdc"]);
    expect(q.commandes).toEqual([cmd("cotation.supprimer", {}, ["K1"]), cmd("mur.supprimer", {}, ["M1"])]);
    expect(q.baiesEntrainees).toEqual([]);
    expect(q.aReparer).toEqual([]);
    expect(q.ignores).toEqual(["rdc"]);
  });

  it("geste : liste avant accord, Échap renonce sans écrire, Entrée supprime ; la baie part avec le mur", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0]), porte("P1", "M1", 0.5), cote));
    expect(b.pilote.activer("modifier.supprimer")).toEqual({ ok: false, motif: "sélectionner d'abord au moins un objet" });
    b.ctx.selection.choisir(["M1"]);
    expect(b.pilote.activer("modifier.supprimer")).toEqual({ ok: true });
    const consigne = b.pilote.apercu().consigne;
    expect(consigne).toContain("Supprimer 1 objet(s) : Mur M1.");
    expect(consigne).toMatch(/Baies hébergées supprimées avec leur mur : \S+ P1\./);
    expect(consigne).toMatch(/Références à réparer ensuite : \S+ K1\./);
    expect(b.pilote.apercu().formes[0]).toEqual({ forme: "surligner", ids: ["M1", "P1"], style: "erreur" });
    await b.jouer(touche("Escape"));
    expect(b.pilote.outilActif()).toBeNull();
    expect(b.valides).toHaveLength(0);

    b.pilote.activer("modifier.supprimer");
    await b.jouer(touche("Enter"));
    expect(b.valides[0]).toEqual({ label: "Supprimer Mur M1", commandes: [cmd("mur.supprimer", {}, ["M1"])] });
    expect(b.etat().objets.M1).toBeUndefined();
    expect(b.etat().objets.P1).toBeUndefined();
    expect((b.etat().objets.K1?.params as { etat?: string }).etat).toBe("a-reparer");
    expect(b.pilote.outilActif()).toBeNull();
  });

  it("un appui dans le plan vaut accord ; sélection sans objet supprimable : refus lisible, rien d'écrit", async () => {
    const b = banc(etatDeTest(ligne));
    b.ctx.selection.choisir(["L1"]);
    b.pilote.activer("modifier.supprimer");
    await b.jouer(appui(10, 10));
    expect(b.valides[0]?.commandes).toEqual([cmd("esquisse.supprimer", {}, ["L1"])]);
    b.ctx.selection.choisir(["rdc"]);
    b.pilote.activer("modifier.supprimer");
    await b.jouer(touche("Enter"));
    expect(b.valides).toHaveLength(1);
    expect(b.pilote.apercu().erreurs[0]?.cause).toBe("aucun objet supprimable dans la sélection");
  });
});
