import { describe, expect, it } from "vitest";
import type { SaisieAjustementQuantite } from "@parcours/atelier-model";
import { apresEnvoi, cleSaisieAjustement, preparerTentative } from "./tentative";

const saisie: SaisieAjustementQuantite = { cible: { type: "objet", id: "l1" }, grandeur: "longueur", unite: "m", valeur: 4.5, motif: "Relevé" };
let n = 0;
const nouvelId = () => `req-${++n}`;

describe("tentative d'ajustement : cycle de vie du requestId (revue Codex #200)", () => {
  it("réponse perdue (issue inconnue) : le nouvel essai renvoie le même corps, même requestId et même base", () => {
    const t1 = preparerTentative(null, saisie, { baseSequence: 2, revisionId: "rev-a" }, nouvelId);
    const conservee = apresEnvoi(t1, { ok: false });
    expect(conservee).toBe(t1);
    // Entre-temps le journal relu a avancé (l'envoi avait été enregistré) : le corps d'origine est renvoyé tel quel.
    const t2 = preparerTentative(conservee, { ...saisie, cible: { ...saisie.cible } }, { baseSequence: 3, revisionId: "rev-a" }, nouvelId);
    expect(t2).toBe(t1);
    expect(t2.corps).toMatchObject({ requestId: t1.corps.requestId, baseSequence: 2, revisionId: "rev-a" });
    // Erreur serveur 5xx : issue inconnue aussi.
    expect(apresEnvoi(t1, { ok: false, status: 503 })).toBe(t1);
  });

  it("contenu changé (cible, grandeur, unité, valeur ou motif) : nouvelle tentative, nouvel identifiant", () => {
    const t1 = preparerTentative(null, saisie, { baseSequence: 0, revisionId: "rev-a" }, nouvelId);
    for (const autre of [
      { ...saisie, valeur: 4.6 }, { ...saisie, motif: "Autre" }, { ...saisie, cible: { type: "calque" as const, id: "l1" } },
      { ...saisie, grandeur: "surface" as const, unite: "m2" as const }, { ...saisie, valeur: null },
    ]) {
      const t = preparerTentative(t1, autre, { baseSequence: 0, revisionId: "rev-a" }, nouvelId);
      expect(t).not.toBe(t1);
      expect(t.corps.requestId).not.toBe(t1.corps.requestId);
    }
    expect(cleSaisieAjustement(saisie)).toBe(cleSaisieAjustement({ motif: "Relevé", valeur: 4.5, unite: "m", grandeur: "longueur", cible: { id: "l1", type: "objet" } }));
  });

  it("issue connue : succès ou refus 4xx (rien d'écrit) closent la tentative ; l'envoi suivant reçoit un nouvel identifiant", () => {
    const t1 = preparerTentative(null, saisie, { baseSequence: 0, revisionId: "rev-a" }, nouvelId);
    expect(apresEnvoi(t1, { ok: true })).toBeNull();
    expect(apresEnvoi(t1, { ok: false, status: 409 })).toBeNull();
    expect(apresEnvoi(t1, { ok: false, status: 400 })).toBeNull();
    const t2 = preparerTentative(null, saisie, { baseSequence: 1, revisionId: "rev-a" }, nouvelId);
    expect(t2.corps.requestId).not.toBe(t1.corps.requestId);
    expect(t2.corps.baseSequence).toBe(1);
  });
});
