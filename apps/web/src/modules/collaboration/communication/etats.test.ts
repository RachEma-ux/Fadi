import { describe, expect, it } from "vitest";
import { etatEnvoi, LIBELLE_ETAT, libelleJournal, mentionsSansAcces, raisonBlocage, URGENT_HORS_LIGNE } from "./etats";

describe("COM — états d'envoi (COM-6)", () => {
  it("file rejouable : en attente si la mutation est en pause, envoi sinon", () => {
    expect(etatEnvoi({ status: "pending", isPaused: true }, "")).toBe("en-attente");
    expect(etatEnvoi({ status: "pending", isPaused: false }, "")).toBe("envoi");
    expect(etatEnvoi({ status: "error", isPaused: false }, "x")).toBe("bloque");
    expect(etatEnvoi({ status: "success", isPaused: false }, "")).toBe("accepte");
    expect(etatEnvoi(null, "brouillon")).toBe("brouillon");
    expect(etatEnvoi(null, "  ")).toBeNull();
  });
  it("libellés du concept, jamais une fausse remise", () => {
    expect(LIBELLE_ETAT.accepte).toBe("Accepté par Fadi");
    expect(URGENT_HORS_LIGNE).toContain("Non envoyé");
  });
  it("blocage après révocation : rien n'est publié, le brouillon reste", () => {
    expect(raisonBlocage(404, null)).toContain("rien n’a été publié");
    expect(raisonBlocage(500, null)).toContain("réessayez");
  });
});

describe("COM — mentions sans accès (COM-R3)", () => {
  const membres = [{ id: "p", email: "p@x", role: "proprietaire" as const }, { id: "l", email: "l@x", role: "lecteur" as const }, { id: "e", email: "e@x", role: "editeur" as const }];
  it("équipe : le lecteur mentionné ne lira pas", () => {
    expect(mentionsSansAcces("equipe", ["l", "e"], membres, []).map((m) => m.id)).toEqual(["l"]);
  });
  it("participants : seul un participant lit, même le propriétaire", () => {
    expect(mentionsSansAcces("participants", ["p", "l"], membres, ["l"]).map((m) => m.id)).toEqual(["p"]);
  });
  it("projet : tous les membres lisent", () => {
    expect(mentionsSansAcces("projet", ["p", "l", "e"], membres, [])).toEqual([]);
  });
});

describe("COM — journal", () => {
  it("changement d'audience et ajout avec historique", () => {
    expect(libelleJournal({ action: "audience", acteur: "a@x", detail: { avant: "equipe", apres: "projet" } })).toBe("a@x a changé l’audience : équipe → tout le projet");
    expect(libelleJournal({ action: "participant-ajoute", acteur: "a@x", detail: { email: "b@x", historique: "depuis-ajout" } })).toContain("à partir de l’ajout");
  });
});
