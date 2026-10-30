import { describe, expect, it } from "vitest";
import { deriverEtatCouche, REGLE_FRAICHEUR_V1, type EntreeEtatCouche } from "./etats.js";

const base: EntreeEtatCouche = {
  couche: "annonces", source: { statut: "active" }, edition: { validite: null, dateDonnees: "2026-10-30" }, nombreValeurs: 64, dateReference: "2026-10-31",
};

describe("état d'une couche de prix", () => {
  it("source active, édition récente : disponible", () => {
    expect(deriverEtatCouche(base)).toMatchObject({ etat: "disponible", motif: null, ageJours: 1, regleFraicheur: "fraicheur-v1" });
  });

  it("source bloquée : non autorisé, avec le motif de blocage", () => {
    const r = deriverEtatCouche({ ...base, couche: "officielle", source: { statut: "candidate", motifBlocage: "Aucune déclaration de réutilisation" }, edition: null, nombreValeurs: 0 });
    expect(r).toMatchObject({ etat: "non-autorise", motif: "source-candidate", detail: "Aucune déclaration de réutilisation" });
    expect(deriverEtatCouche({ ...base, source: { statut: "suspendue" } }).motif).toBe("source-suspendue");
  });

  it("aucune édition ou aucune valeur : indisponible ; import échoué : échec", () => {
    expect(deriverEtatCouche({ ...base, edition: null }).motif).toBe("aucune-edition");
    expect(deriverEtatCouche({ ...base, nombreValeurs: 0 })).toMatchObject({ etat: "indisponible", motif: "aucune-donnee" });
    expect(deriverEtatCouche({ ...base, edition: { ...base.edition!, importEchoue: true } }).etat).toBe("echec");
  });

  it("couche officielle : validité non vérifiée ou historique jamais présentée comme courante (PRX08)", () => {
    const off = { ...base, couche: "officielle" as const };
    expect(deriverEtatCouche({ ...off, edition: { validite: "non-verifiee", dateDonnees: "2026-10-01" } }).etat).toBe("validite-non-verifiee");
    expect(deriverEtatCouche({ ...off, edition: { validite: null, dateDonnees: "2026-10-01" } }).etat).toBe("validite-non-verifiee");
    expect(deriverEtatCouche({ ...off, edition: { validite: "historique", dateDonnees: "2015-01-01" } }).etat).toBe("historique");
    expect(deriverEtatCouche({ ...off, edition: { validite: "verifiee", dateDonnees: "2026-10-01" } }).etat).toBe("disponible");
  });

  it("au-delà de la règle de fraîcheur : périmé ; date inconnue : validité non vérifiée", () => {
    // 2026-10-31 − 2026-05-03 = 181 jours > 180.
    expect(deriverEtatCouche({ ...base, edition: { validite: null, dateDonnees: "2026-05-03" } })).toMatchObject({ etat: "perime", ageJours: 181 });
    expect(deriverEtatCouche({ ...base, edition: { validite: null, dateDonnees: "2026-05-04" } }).etat).toBe("disponible");
    expect(deriverEtatCouche({ ...base, edition: { validite: null, dateDonnees: null } }).motif).toBe("date-donnees-inconnue");
    expect(deriverEtatCouche({ ...base, regleFraicheur: { version: "fraicheur-test", joursMaximum: 0 } })).toMatchObject({ etat: "perime", regleFraicheur: "fraicheur-test" });
    expect(REGLE_FRAICHEUR_V1.joursMaximum).toBe(180);
  });
});
