/** Fichiers demandés par une extension (protocole 1.0, lot 7) : forme des demandes et du fichier choisi. */
import { describe, expect, it } from "vitest";
import { BORNES_FICHIER, TYPES_FICHIER_EXTENSION, estNomDeFichier, lireDemandeEnregistrement, lireDemandeOuverture, lireFichierChoisi, typeDeFichier } from "./fichiers-extensions.js";
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
    for (const types of [[], [".csv", ".csv"], [".html"], [".exe"], ["csv"], ".csv", [".svg"]]) expect(lireDemandeOuverture({ types }).ok).toBe(false);
  });

  it("enregistrer : un nom simple d'un type admis ; jamais un chemin, une page ou un programme", () => {
    expect(lireDemandeEnregistrement({ nom: "débit des pièces.csv", texte: "a;b\n1;2\n" })).toEqual({ ok: true, demande: { nom: "débit des pièces.csv", texte: "a;b\n1;2\n" } });
    for (const nom of ["../secret.txt", "C:\\x.txt", "dossier/x.csv", "page.html", "outil.js", "image.svg", "sans-type", ".csv", " x.csv", "x.csv ", "a\u0000.txt", "x".repeat(BORNES_FICHIER.nom) + ".txt", 12]) {
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
