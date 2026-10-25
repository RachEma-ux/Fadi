/**
 * Auto-contrôle (OP-6) : libellés purs de l'interface et leur traduction anglaise (D-163) ; lecture d'un refus 422.
 */
import { describe, expect, it } from "vitest";
import {
  AUCUN_AUTRE_APPROBATEUR, AUTRES_APPROBATEURS, avertissementAutoControle, CONFIRMER_AUTO_CONTROLE, LIBELLE_EVENEMENT_AUTO, LIBELLE_JOURNAL_AUTO,
  MARQUE_AUTO_CONTROLE, motifsAutoControle, refusAutoControle, refusServeur, ROLE_APPROBATEUR, TITRE_MARQUE,
} from "./auto-controle";
import { entryActionLabel } from "./journal-activite";
import { Traducteur } from "./i18n/traduire";
import en from "./i18n/en.json";

const t = new Traducteur(en as Record<string, string>);

describe("auto-contrôle — libellés", () => {
  it("motifs relevés par le serveur, sans rien inventer", () => {
    expect(motifsAutoControle({ revisionsAuteur: 2, soumisParLui: true })).toBe("Vous avez produit 2 révision(s) de ce dossier et vous l’avez soumis");
    expect(motifsAutoControle({ revisionsAuteur: 1, soumisParLui: false })).toBe("Vous avez produit 1 révision(s) de ce dossier");
    expect(motifsAutoControle({ revisionsAuteur: 0, soumisParLui: true })).toBe("Vous avez soumis ce dossier");
    expect(avertissementAutoControle({ revisionsAuteur: 0, soumisParLui: true })).toBe("Vous avez soumis ce dossier : cette approbation sera marquée auto-contrôle.");
  });
  it("chaque texte a sa traduction anglaise", () => {
    for (const c of [{ revisionsAuteur: 3, soumisParLui: true }, { revisionsAuteur: 1, soumisParLui: false }, { revisionsAuteur: 0, soumisParLui: true }]) {
      for (const texte of [avertissementAutoControle(c), refusAutoControle(c)]) {
        const anglais = t.traduire(texte);
        expect(anglais, texte).not.toBe(texte);
        expect(anglais, texte).not.toMatch(/dossier|révision|auto-contrôle/);
      }
    }
    for (const texte of [MARQUE_AUTO_CONTROLE, TITRE_MARQUE, LIBELLE_EVENEMENT_AUTO, LIBELLE_JOURNAL_AUTO, CONFIRMER_AUTO_CONTROLE, AUTRES_APPROBATEURS, AUCUN_AUTRE_APPROBATEUR, ...Object.values(ROLE_APPROBATEUR)]) {
      expect((en as Record<string, string>)[texte], texte).toBeTruthy();
    }
  });
  it("journal : entrée marquée seulement quand le serveur l'a marquée", () => {
    expect(entryActionLabel({ action: "review.approval.recorded", details: { selfControl: true } })).toBe(LIBELLE_JOURNAL_AUTO);
    expect(entryActionLabel({ action: "review.approval.recorded", details: { selfControl: false } })).toBe("Approbation enregistrée");
    expect(entryActionLabel({ action: "review.decision.recorded", details: { selfControl: true } })).toBe("Décision d’approbation enregistrée par la revue (auto-contrôle)");
    expect(entryActionLabel({ action: "review.decision.recorded", details: {} })).toBe("Décision d’approbation enregistrée par la revue");
  });
  it("refus 422 lu depuis le corps de la réponse ; autre refus ignoré", () => {
    expect(refusServeur(422, { error: "self_approval_forbidden", revisionsAuteur: 2, soumisParLui: false, approvers: [{ name: "Ana", role: "proprietaire" }] }))
      .toEqual({ autoControle: true, autorise: false, revisionsAuteur: 2, soumisParLui: false, approvers: [{ name: "Ana", role: "proprietaire" }] });
    expect(refusServeur(422, { error: "self_action" })).toBeNull();
    expect(refusServeur(409, { error: "self_approval_forbidden" })).toBeNull();
  });
});
