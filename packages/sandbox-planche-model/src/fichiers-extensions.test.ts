/** Fichiers demandés par une extension (protocole 1.0, lot 7) : forme des demandes et du fichier choisi. */
import { describe, expect, it } from "vitest";
import { BORNES_FICHIER, TYPES_FICHIER_EXTENSION, creerReserveFichiers, estNomDeFichier, lireDemandeEnregistrement, lireDemandeOuverture, lireFichierChoisi, typeDeFichier } from "./fichiers-extensions.js";
import { DEMANDES_EXTENSION, jugerDemandeExtension } from "./protocole-extensions.js";

describe("fichiers d'une extension", () => {
  it("les deux demandes exigent la permission « fichiers »", () => {
    expect(DEMANDES_EXTENSION["fichiers.ouvrir"]).toBe("fichiers");
    expect(DEMANDES_EXTENSION["fichiers.enregistrer"]).toBe("fichiers");
    expect(jugerDemandeExtension({ permissions: ["modele.lire"] }, "fichiers.ouvrir")).toEqual({ ok: false, erreur: "permission_refusee", detail: "fichiers" });
    expect(jugerDemandeExtension({ permissions: ["fichiers"] }, "fichiers.enregistrer")).toEqual({ ok: true });
  });

  it("ouvrir : tous les types admis par défaut ; une liste fermée, sans doublon ni type étranger", () => {
    expect(lireDemandeOuverture(null)).toEqual({ ok: true, demande: { types: TYPES_FICHIER_EXTENSION } });
    expect(lireDemandeOuverture({ types: [".csv", ".txt"] })).toEqual({ ok: true, demande: { types: [".csv", ".txt"] } });
    for (const types of [[], [".csv", ".csv"], [".html"], [".exe"], ["csv"], ".csv", [".js"]]) expect(lireDemandeOuverture({ types }).ok).toBe(false);
  });

  it("enregistrer : un nom simple d'un type admis ; jamais un chemin, une page ou un programme", () => {
    expect(lireDemandeEnregistrement({ nom: "débit des pièces.csv", texte: "a;b\n1;2\n" })).toEqual({ ok: true, demande: { nom: "débit des pièces.csv", texte: "a;b\n1;2\n" } });
    for (const nom of ["../secret.txt", "C:\\x.txt", "dossier/x.csv", "page.html", "outil.js", "page.htm", "sans-type", ".csv", " x.csv", "x.csv ", "a\u0000.txt", "x".repeat(BORNES_FICHIER.nom) + ".txt", 12]) {
      expect(estNomDeFichier(nom), String(nom)).toBe(false);
      expect(lireDemandeEnregistrement({ nom, texte: "" }).ok).toBe(false);
    }
    expect(lireDemandeEnregistrement({ nom: "x.txt", texte: "x".repeat(BORNES_FICHIER.caracteres + 1) }).ok).toBe(false);
    expect(lireDemandeEnregistrement({ nom: "x.txt", texte: 3 }).ok).toBe(false);
    expect(lireDemandeEnregistrement("x.txt").ok).toBe(false);
    expect(typeDeFichier("Plan.CSV")).toBe(".csv");
  });

  it("fichier choisi : renoncement, type hors de la demande, taille, nom sans chemin", () => {
    const demande = { types: [".csv"] as const };
    expect(lireFichierChoisi(null, demande)).toEqual({ ok: true, fichier: null });
    expect(lireFichierChoisi({ nom: "C:\\Users\\moi\\liste.csv", texte: "a" }, demande)).toEqual({ ok: true, fichier: { nom: "liste.csv", texte: "a" } });
    expect(lireFichierChoisi({ nom: "notes.txt", texte: "a" }, demande)).toMatchObject({ ok: false });
    expect(lireFichierChoisi({ nom: "liste.csv", texte: "x".repeat(BORNES_FICHIER.caracteres + 1) }, demande)).toMatchObject({ ok: false });
    expect(lireFichierChoisi({ nom: "liste.csv" }, demande)).toMatchObject({ ok: false });
  });
});

describe("fichiers en flux (protocole 1.1)", () => {
  it("ouvrir en flux : jusqu'à 50 000 000 caractères ; sans flux, la borne de 1.0 reste", () => {
    const flux = lireDemandeOuverture({ types: [".dxf"], flux: true });
    expect(flux).toEqual({ ok: true, demande: { types: [".dxf"], flux: true } });
    expect(lireDemandeOuverture({ flux: "oui" }).ok).toBe(false);
    const gros = { nom: "plan.dxf", texte: "x".repeat(BORNES_FICHIER.caracteres + 1) };
    expect(lireFichierChoisi(gros, { types: [".dxf"] })).toMatchObject({ ok: false, detail: expect.stringMatching(/ouverture en flux/) });
    expect(lireFichierChoisi(gros, { types: [".dxf"], flux: true })).toMatchObject({ ok: true, fichier: { nom: "plan.dxf" } });
    expect(BORNES_FICHIER.flux).toBe(50_000_000);
  });

  it("réserve : un jeton par fichier, lu par morceaux bornés ; oubliée à la fin de la commande", () => {
    const r = creerReserveFichiers();
    const f = r.retenir({ nom: "plan.dxf", texte: "0123456789" })!;
    expect(f).toEqual({ nom: "plan.dxf", taille: 10, jeton: f.jeton });
    expect(r.lire({ jeton: f.jeton, debut: 2, longueur: 3 })).toEqual({ ok: true, valeur: "234" });
    expect(r.lire({ jeton: f.jeton, debut: 8 })).toEqual({ ok: true, valeur: "89" });
    expect(r.lire({ jeton: f.jeton, debut: 11 }).ok).toBe(false);
    expect(r.lire({ jeton: f.jeton, longueur: BORNES_FICHIER.morceau + 1 }).ok).toBe(false);
    expect(r.lire({ jeton: 999 }).ok).toBe(false);
    r.vider();
    expect(r.lire({ jeton: f.jeton }).ok).toBe(false);
  });

  it("enregistrer par morceaux : préparer, ajouter, puis enregistrer par le jeton", () => {
    const r = creerReserveFichiers();
    const p = r.preparer();
    if (!p.ok) throw new Error(p.detail);
    expect(r.ajouter({ jeton: p.valeur, texte: "0\nSECTION\n" })).toEqual({ ok: true, valeur: null });
    expect(r.ajouter({ jeton: p.valeur, texte: "0\nEOF\n" }).ok).toBe(true);
    expect(r.ajouter({ jeton: p.valeur, texte: "x".repeat(BORNES_FICHIER.morceau + 1) }).ok).toBe(false);
    expect(lireDemandeEnregistrement({ nom: "plan.dxf", jeton: p.valeur }, r.texteDe)).toEqual({ ok: true, demande: { nom: "plan.dxf", texte: "0\nSECTION\n0\nEOF\n" } });
    expect(lireDemandeEnregistrement({ nom: "plan.dxf", jeton: p.valeur, texte: "x" }, r.texteDe).ok).toBe(false);
    expect(lireDemandeEnregistrement({ nom: "plan.dxf", jeton: 42 }, r.texteDe).ok).toBe(false);
    // Quatre fichiers en flux à la fois au plus.
    for (let i = 0; i < BORNES_FICHIER.jetons - 1; i++) expect(r.preparer().ok).toBe(true);
    expect(r.preparer().ok).toBe(false);
    expect(r.retenir({ nom: "a.txt", texte: "" })).toBeNull();
  });

  it("le type .svg est admis (plan masse en image vectorielle) ; une page ou un programme ne l'est jamais", () => {
    expect(estNomDeFichier("plan masse.svg")).toBe(true);
    for (const nom of ["page.html", "outil.js", "x.htm"]) expect(estNomDeFichier(nom)).toBe(false);
  });
});
