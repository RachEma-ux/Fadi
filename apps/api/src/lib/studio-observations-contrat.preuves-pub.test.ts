/**
 * IF-010 — contrat d'une observation (lot PUB) : issueId, catégorie, source du contrôle, révisions examinées,
 * objets / vue, auteur, gravité, description et pièces justificatives, responsable, état, journal des décisions,
 * recontrôles, condition de clôture, références BCF. EX-084 — note, observation, tâche et décision sont des objets
 * distincts et reliés : aucune transition implicite (une tâche faite ou une proposition ne résout rien). Règles pures.
 */
import { describe, expect, it } from "vitest";
import { CONDITION_CLOTURE, contratObservation, OBSERVATION_CATEGORIES, OBSERVATION_GRAVITES, resolutionObservation } from "./studio-observations.js";
import { contenuIf010, studioObservationGraviteSchema, studioObservationPiecesSchema, studioObservationCategorieSchema } from "./studio-observations.js";

const vue = {
  id: "studio_comment_1", issueId: "studio_issue_9", categorie: "coordination" as const, gravite: "bloquante" as const,
  pieces: [{ name: "releve.pdf", mime: "application/pdf", size: 1200, sha256: "a".repeat(64) }],
  bcfRefs: [{ guid: "0b0c0d0e-0000-4000-8000-000000000001", contexte: "projet:abc", fichierSha256: "b".repeat(64), importeLe: "2026-10-25T08:00:00.000Z" }],
  authorId: "u_auteur", responsableId: "u_resp", statut: "recontrolee" as const, vue: { mode: "plan", ref: "RDC" },
  liens: [{ controleId: "chk_1", revisionId: "rev_2" }, { controleId: null, revisionId: null }],
  decisions: [{ seq: 1, nature: "proposition", portee: "cloture", at: "2026-10-25T09:00:00.000Z" }],
  journal: [{ action: "ouvrir", revisionId: null }, { action: "corriger", revisionId: "rev_3" }, { action: "recontroler", revisionId: "rev_4" }],
};

describe("IF-010 — contrat d'une observation", () => {
  it("IF-010 [+] l'observation garde issueId, catégorie, source du contrôle, révisions, objets, vue, auteur, gravité, description, pièces, responsable, état, décisions, recontrôles, clôture et références BCF", () => {
    const c = contratObservation(vue, { body: "Gaine non réservée dans le mur m1", revisionId: "rev_1", objectIds: ["m1"] });
    expect(c).toEqual({
      issueId: "studio_issue_9", noteId: "studio_comment_1", categorie: "coordination", sourcesControle: ["chk_1"], revisionsExaminees: ["rev_1", "rev_2"], objets: ["m1"],
      vue: { mode: "plan", ref: "RDC" }, auteur: "u_auteur", gravite: "bloquante", description: "Gaine non réservée dans le mur m1", pieces: vue.pieces, responsable: "u_resp",
      etat: "recontrolee", journalDecisions: [{ seq: 1, nature: "proposition", portee: "cloture", at: "2026-10-25T09:00:00.000Z" }], recontroles: ["rev_4"],
      conditionCloture: CONDITION_CLOTURE, referencesBcf: vue.bcfRefs,
    });
    expect(OBSERVATION_CATEGORIES).toContain("coordination");
    expect(OBSERVATION_GRAVITES).toEqual(["bloquante", "majeure", "mineure", "information"]);
  });

  it("IF-010 [+] catégorie, gravité et pièces se saisissent à l'ouverture ; une gravité ou une pièce hors vocabulaire est refusée ; l'empreinte de rejeu cite les pièces par leur SHA-256", () => {
    expect(studioObservationCategorieSchema.safeParse("conformite").success).toBe(true);
    expect(studioObservationGraviteSchema.safeParse("majeure").success).toBe(true);
    expect(studioObservationPiecesSchema.safeParse([{ name: "a.png", mime: "image/png", contentBase64: "iVBORw0KGgo=" }]).success).toBe(true);
    expect(studioObservationGraviteSchema.safeParse("critique").success).toBe(false);
    expect(studioObservationCategorieSchema.safeParse("divers").success).toBe(false);
    expect(studioObservationPiecesSchema.safeParse([{ name: "a.exe", mime: "application/x-msdownload", contentBase64: "AA==" }]).success).toBe(false);
    expect(studioObservationPiecesSchema.safeParse(Array.from({ length: 6 }, () => ({ name: "a.png", mime: "image/png", contentBase64: "AA==" }))).success).toBe(false);
    expect(contenuIf010({})).toEqual({});
    expect(contenuIf010({ gravite: "mineure", pieces: [{ name: "a.png", mime: "image/png", contentBase64: "aGVsbG8=" }] })).toEqual({
      gravite: "mineure", pieces: [{ name: "a.png", mime: "image/png", sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" }],
    });
  });

  it("IF-010 [−] valeur absente : catégorie et gravité « non évaluées » (null), aucune pièce ni référence BCF inventée", () => {
    const c = contratObservation({ ...vue, categorie: null, gravite: null, pieces: [], bcfRefs: [], liens: [], decisions: [], journal: [] }, { body: null, revisionId: null, objectIds: [] });
    expect([c.categorie, c.gravite, c.description]).toEqual([null, null, null]);
    expect([c.pieces, c.referencesBcf, c.sourcesControle, c.revisionsExaminees, c.recontroles]).toEqual([[], [], [], [], []]);
  });
});

describe("EX-084 — note, observation, tâche, décision : distinctes, reliées, sans transition implicite", () => {
  it("EX-084 [+] l'observation a sa propre identité (issueId) distincte de la note qui la porte (noteId), reliées", () => {
    const c = contratObservation(vue, { body: "note", revisionId: null, objectIds: [] });
    expect(c.issueId).not.toBe(c.noteId);
    expect(c.noteId).toBe("studio_comment_1");
  });

  it("EX-084 [−] une proposition (même de clôture ou de dérogation), une tâche faite ou un commentaire ne résolvent pas l'observation ; seule une décision ou la clôture le font", () => {
    expect(resolutionObservation("recontrolee", [{ nature: "proposition", portee: "cloture", at: "t1" }])).toEqual({ resolution: "ouverte" });
    expect(resolutionObservation("ouverte", [{ nature: "proposition", portee: "derogation", at: "t1" }])).toEqual({ resolution: "ouverte" });
    expect(resolutionObservation("ouverte", [{ nature: "decision", portee: "autre", at: "t1" }])).toEqual({ resolution: "ouverte" });
    expect(resolutionObservation("ouverte", [{ nature: "decision", portee: "derogation", at: "2026-10-25T10:00:00.000Z" }])).toEqual({ resolution: "derogee", derogation: { at: "2026-10-25T10:00:00.000Z" } });
    expect(resolutionObservation("cloturee", [])).toEqual({ resolution: "resolue" });
    // Rouverte après la dérogation : la dérogation ne vaut plus.
    expect(resolutionObservation("rouverte", [{ nature: "decision", portee: "derogation", at: "2026-10-25T10:00:00.000Z" }], [{ action: "rouvrir", at: "2026-10-25T11:00:00.000Z" }])).toEqual({ resolution: "ouverte" });
  });
});
