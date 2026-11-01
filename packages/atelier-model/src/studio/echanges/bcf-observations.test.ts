/**
 * IF-010 / E.6-04 — échange BCF 2.1 minimal des observations Studio (lot PUB) : export et relecture, identifiants BCF
 * conservés comme références dans leur contexte, jamais assimilés à l'identité interne. Données synthétiques.
 */
import { describe, expect, it } from "vitest";
import { lireZip } from "../../echanges/bcf.js";
import {
  studioContexteBcf, studioExporterBcf, studioGuidBcf, studioLireBcf, studioPlanImportBcf, studioSujetsBcf, type StudioObservationPourBcf,
} from "./bcf-observations.js";

const obs = (issueId: string, over: Partial<StudioObservationPourBcf> = {}): StudioObservationPourBcf => ({
  issueId, titre: "Gaine non réservée", description: "La gaine traverse le mur m1 sans réservation <à vérifier> & recontrôler.", statut: "ouverte",
  categorie: "coordination", gravite: "bloquante", creeLe: "2026-10-25T08:00:00.000Z", auteur: "a@fadi.test", responsable: "b@fadi.test", objets: ["m1"],
  journal: [{ seq: 1, action: "ouvrir", at: "2026-10-25T08:00:00.000Z", acteur: "a@fadi.test", note: "constat sur site" }], ...over,
});

describe("IF-010 — BCF 2.1 minimal des observations", () => {
  it("IF-010 [+] export BCF 2.1 relu à l'identique : Guid stable, catégorie, gravité, statut, objets, commentaires", async () => {
    const octets = studioExporterBcf(studioSujetsBcf([obs("issue_a"), obs("issue_b", { gravite: null, objets: [] })]), { id: "p1", nom: "Projet" });
    const noms = (await lireZip(octets)).map((f) => f.nom);
    expect(noms).toEqual(["bcf.version", "project.bcfp", `${studioGuidBcf("issue_a")}/markup.bcf`, `${studioGuidBcf("issue_b")}/markup.bcf`]);
    const lu = await studioLireBcf(octets);
    expect(lu.version).toBe("2.1");
    expect(lu.projetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lu.sujets[0]).toMatchObject({
      guid: studioGuidBcf("issue_a"), titre: "Gaine non réservée", description: "La gaine traverse le mur m1 sans réservation <à vérifier> & recontrôler.", statut: "ouverte",
      type: "coordination", priorite: "bloquante", auteur: "a@fadi.test", assigneA: "b@fadi.test", objets: ["m1"],
    });
    expect(lu.sujets[0]!.commentaires).toEqual([expect.objectContaining({ auteur: "a@fadi.test", texte: "ouvrir : constat sur site" })]);
    expect(lu.sujets[1]!.priorite).toBeNull();
    // Le Guid est stable et distinct de l'identité interne.
    expect(studioGuidBcf("issue_a")).toBe(studioGuidBcf("issue_a"));
    expect(studioGuidBcf("issue_a")).not.toContain("issue_a");
  });

  it("IF-010 [+] import : sujets nouveaux créés, objets inconnus conservés comme références", async () => {
    const octets = studioExporterBcf(studioSujetsBcf([obs("x1", { objets: ["m1", "absent"] })]), { id: "partenaire", nom: "Partenaire" });
    const lu = await studioLireBcf(octets);
    const plan = studioPlanImportBcf(lu, studioContexteBcf(lu.projetId, "f".repeat(64)), [], new Set(["m1"]));
    expect(plan.nouveaux.map((s) => s.guid)).toEqual([studioGuidBcf("x1")]);
    expect(plan.objetsInconnus).toEqual([{ guid: studioGuidBcf("x1"), objets: ["absent"] }]);
  });

  it("IF-010 [−] même BCF-ID reçu dans un autre contexte : nouvelle observation distincte, l'identité interne n'est ni écrasée ni fusionnée ; un sujet absent ne clôt rien", async () => {
    const guid = studioGuidBcf("x1");
    const lu = await studioLireBcf(studioExporterBcf(studioSujetsBcf([obs("x1")]), { id: "partenaire-B", nom: "B" }));
    const ctxB = studioContexteBcf(lu.projetId, "e".repeat(64));
    const existantes = [{ issueId: "issue_interne_A", guid, contexte: "projet:autre-contexte" }];
    const plan = studioPlanImportBcf(lu, ctxB, existantes, new Set(["m1"]));
    expect(plan.nouveaux.map((s) => s.guid)).toEqual([guid]);
    expect(plan.homonymes).toEqual([{ guid, issueIdsAutresContextes: ["issue_interne_A"] }]);
    expect(plan.reconnus).toEqual([]);
    // Même contexte : reconnu, rien n'est recréé ni réécrit.
    const encore = studioPlanImportBcf(lu, ctxB, [...existantes, { issueId: "issue_B", guid, contexte: ctxB }], new Set(["m1"]));
    expect(encore.nouveaux).toEqual([]);
    expect(encore.reconnus).toEqual([{ guid, issueId: "issue_B" }]);
    // Envoi suivant sans ce sujet : rapporté absent, aucune clôture décidée par l'import.
    const vide = studioPlanImportBcf({ sujets: [] }, ctxB, [{ issueId: "issue_B", guid, contexte: ctxB }], new Set());
    expect(vide.absents).toEqual([{ guid, issueId: "issue_B" }]);
    expect(Object.keys(vide)).not.toContain("clotures");
  });

  it("IF-010 [−] sujet sans Guid valide : non repris, avertissement ; fichier sans sujet signalé", async () => {
    const { zipStocke } = await import("../../echanges/bcf.js");
    const enc = new TextEncoder();
    const octets = zipStocke([{ nom: "bcf.version", octets: enc.encode('<Version VersionId="3.0"/>') }, { nom: "a/markup.bcf", octets: enc.encode('<Markup><Topic Guid="pas-un-guid" TopicStatus="Open"><Title>x</Title></Topic></Markup>') }]);
    const lu = await studioLireBcf(octets);
    expect(lu.sujets).toEqual([]);
    expect(lu.avertissements.join(" ")).toMatch(/Version BCF 3\.0.*sans Guid valide/);
  });
});
