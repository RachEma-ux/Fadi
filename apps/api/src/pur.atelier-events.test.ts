/**
 * Événements du nouvel Atelier (L2.3) — parties pures, sans base : regroupement des notifications, lecture de la
 * marque de péremption du bilan, refus d'une charge utile invalide avant toute écriture.
 */
import { describe, expect, it } from "vitest";
import { EVENEMENT_COMMANDE_VALIDEE, ecrireEvenement, regrouperModifications, revuePerimeeParAtelier, type ChargeCommandeValidee, type EvenementTraite } from "./lib/atelier-events.js";

const charge = (revision: number, auteur: string | null): ChargeCommandeValidee => ({ projectId: "p1", revision, objetIds: ["m1"], types: ["mur.creer"], auteur, nature: "commande" });
const evt = (revision: number, auteur: string | null, at: string, projectId = "p1"): EvenementTraite => ({ projectId, projectCode: projectId.toUpperCase(), projectName: `Projet ${projectId}`, payload: { ...charge(revision, auteur), projectId }, at });
const libelle = (a: string | null) => (a === null ? "Un import" : `${a}@example.com`);

describe("regrouperModifications", () => {
  it("une seule notification par projet, avec la révision la plus haute, les auteurs et le nombre de lots non consultés", () => {
    const n = regrouperModifications(
      [evt(3, "b", "2026-10-04T10:03:00.000Z"), evt(2, "c", "2026-10-04T10:02:00.000Z"), evt(1, "b", "2026-10-04T10:01:00.000Z"), evt(5, "b", "2026-10-04T10:00:00.000Z", "p2")],
      { userId: "a", seenAt: "2026-10-04T10:01:30.000Z" },
      libelle,
    );
    expect(n).toHaveLength(2);
    const p1 = n.find((x) => x.projectId === "p1")!;
    expect(p1).toMatchObject({ id: "modele:p1:3", at: "2026-10-04T10:03:00.000Z", kind: "modele", revision: 3, lots: 2, auteurs: ["b@example.com", "c@example.com"] });
    expect(p1.text).toBe("b@example.com et c@example.com ont modifié le modèle de P1 — Projet p1 dans l’Atelier (2 lots) : révision 3. Les documents produits avant sont périmés.");
    // Projet p2 : rien de nouveau depuis la consultation → le dernier lot seul.
    expect(n.find((x) => x.projectId === "p2")).toMatchObject({ id: "modele:p2:5", revision: 5, lots: 1 });
  });

  it("ignore vos propres lots et les charges illisibles ; auteur absent (import) nommé", () => {
    expect(regrouperModifications([evt(1, "a", "2026-10-04T10:00:00.000Z"), { ...evt(2, "b", "2026-10-04T10:00:00.000Z"), payload: { revision: "x" } }], { userId: "a", seenAt: null }, libelle)).toEqual([]);
    const [n] = regrouperModifications([evt(4, null, "2026-10-04T10:00:00.000Z")], { userId: "a", seenAt: null }, libelle);
    expect(n!.text).toBe("Un import a modifié le modèle de P1 — Projet p1 dans l’Atelier : révision 4. Les documents produits avant sont périmés.");
  });
});

describe("revuePerimeeParAtelier", () => {
  it("lit la marque posée sur la revue archivée, sinon null", () => {
    expect(revuePerimeeParAtelier(null)).toBeNull();
    expect(revuePerimeeParAtelier({ at: "x" })).toBeNull();
    expect(revuePerimeeParAtelier({ perimeeParAtelier: { revision: "1", le: "x" } })).toBeNull();
    const m = { revision: 2, auteur: "u", commandeId: "j", nature: "commande", le: "2026-10-04T10:00:00.000Z" };
    expect(revuePerimeeParAtelier({ at: "x", perimeeParAtelier: m })).toEqual(m);
  });
});

describe("ecrireEvenement (contrôles avant écriture)", () => {
  it("refuse un événement inconnu ou une charge invalide sans toucher la base", async () => {
    const ex = { execute: () => Promise.reject(new Error("ne doit pas être appelé")) } as never;
    await expect(ecrireEvenement(ex, "j1", { event: "autre" as typeof EVENEMENT_COMMANDE_VALIDEE, payload: charge(1, "a") })).rejects.toThrow(/inconnu/);
    await expect(ecrireEvenement(ex, "j1", { event: EVENEMENT_COMMANDE_VALIDEE, payload: { ...charge(1, "a"), revision: -1 } })).rejects.toThrow(/invalide/);
  });
});
