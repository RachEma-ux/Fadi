/** Extensions installées dans la Planche (lot 3) : file des avis, règle d'or des commandes du paquet d'essai. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTRE_SANDBOX, jugerImportPaquet, normaliserRaccourci, type PaquetExtension } from "@parcours/sandbox-planche-model";
import { MAX_AVIS_AFFICHES, ajouterAvis, retirerSaisie, type AvisAffiche, type SaisieOuverte } from "./extensions-installees";
import { idBarreCanonique, normaliserBarres } from "./barres-nommees";

describe("avis des extensions", () => {
  it("les trois derniers avis restent affichés, dans l'ordre", () => {
    let liste: readonly AvisAffiche[] = [];
    for (let cle = 1; cle <= 5; cle++) liste = ajouterAvis(liste, { cle, extension: "Essai", texte: `avis ${cle}`, genre: "info" });
    expect(liste.map((a) => a.cle)).toEqual([3, 4, 5]);
    expect(liste).toHaveLength(MAX_AVIS_AFFICHES);
  });
});

describe("fenêtres de saisie de plusieurs extensions", () => {
  it("elles font la file : la première demandée reste affichée, aucune n'est remplacée ni perdue", () => {
    const saisie = (cle: number): SaisieOuverte => ({ cle, extension: `E${cle}`, demande: { titre: "T", champs: [] }, repondre: () => {} });
    const file = [saisie(1), saisie(2), saisie(3)];
    expect(retirerSaisie(file, 2).map((x) => x.cle)).toEqual([1, 3]);
    expect(retirerSaisie(file, 1)[0]!.cle).toBe(2);
    expect(retirerSaisie(file, 9)).toBe(file);
  });
});

describe("règle d'or — commandes d'une extension installée", () => {
  const essai = JSON.parse(readFileSync(new URL("../../../../e2e/donnees/essai-commandes.fadi-addon.json", import.meta.url), "utf8")) as PaquetExtension;

  it("chaque commande a sa propre icône, et aucun raccourci n'est pris par la Planche", () => {
    expect(jugerImportPaquet(essai).ok).toBe(true);
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(new Set(essai.fiche.commandes.map((c) => c.icone)).size).toBe(essai.fiche.commandes.length);
    for (const c of essai.fiche.commandes) {
      expect(pris.has(normaliserRaccourci(c.raccourci)), c.id).toBe(false);
    }
  });

  it("la barre d'une extension garde son identifiant dans l'état mémorisé des barres", () => {
    expect(idBarreCanonique("extension:essai-commandes")).toBe("extension:essai-commandes");
    const etat = { visibles: ["extension:essai-commandes"], positions: { "extension:essai-commandes": { x: 10, y: 20 } } };
    expect(normaliserBarres(etat)).toBe(etat);
  });
});
