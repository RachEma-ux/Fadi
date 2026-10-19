import { describe, expect, it } from "vitest";
import type { StudioComment, StudioObservation, StudioObservationStatut } from "../../../lib/api";
import { regrouperFils } from "./fils";
import { compterFiltres, enRetard, filtrerFils, passeFiltre } from "./observations";

const obs = (statut: StudioObservationStatut, assignedToMe = false): StudioObservation => ({
  id: "x", authorId: "a", responsableId: "r", responsableEmail: "r@example.test", echeance: null, statut,
  correctionRevisionId: null, recontroleRevisionId: null, createdBy: "a", createdAt: "", updatedAt: "", journal: [], assignedToMe, possibles: [],
});
const c = (id: string, observation: StudioObservation | null, mine = false, parentId: string | null = null): StudioComment => ({
  id, variantId: "v", parentId, revisionId: null, objectIds: [], authorId: "u", authorEmail: "u@example.test", body: id,
  createdAt: "2026-10-18T00:00:00.000Z", deletedAt: null, mine, observation,
});

describe("Observations de Studio — filtres du panneau", () => {
  const fils = regrouperFils([
    c("simple", null), c("ouverte", obs("ouverte", true)), c("rep", null, false, "ouverte"),
    c("corrigee", obs("corrigee"), true), c("rouverte", obs("rouverte")), c("close", obs("cloturee")),
  ]);

  it("« mes observations » : responsable ou auteur", () => {
    expect(filtrerFils(fils, "mes").map((f) => f.origine.id)).toEqual(["ouverte", "corrigee"]);
  });

  it("« ouvertes » : ouverte ou rouverte ; « à recontrôler » : corrigée ; les réponses suivent", () => {
    const ouvertes = filtrerFils(fils, "ouvertes");
    expect(ouvertes.map((f) => f.origine.id)).toEqual(["ouverte", "rouverte"]);
    expect(ouvertes[0]!.reponses.map((r) => r.id)).toEqual(["rep"]);
    expect(filtrerFils(fils, "a-recontroler").map((f) => f.origine.id)).toEqual(["corrigee"]);
  });

  it("un commentaire sans observation n'apparaît que dans « tous »", () => {
    expect(passeFiltre(c("s", null, true), "mes")).toBe(false);
    expect(compterFiltres(fils)).toEqual({ tous: 5, mes: 2, ouvertes: 2, "a-recontroler": 1 });
  });

  it("retard : échéance passée d'une observation non clôturée", () => {
    expect(enRetard("2026-10-01", "ouverte", "2026-10-19")).toBe(true);
    expect(enRetard("2026-10-01", "cloturee", "2026-10-19")).toBe(false);
    expect(enRetard("2026-10-19", "ouverte", "2026-10-19")).toBe(false);
    expect(enRetard(null, "ouverte", "2026-10-19")).toBe(false);
  });
});
