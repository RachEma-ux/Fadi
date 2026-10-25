import { describe, expect, it } from "vitest";
import { applyStudioCommands, evaluerAjustementsQuantites, newStudioDocument, quantitesStudio, validateStudioDocument } from "@parcours/atelier-model";
import { ajustementDe, deciderAjustement, empreinteAjustement, resultatsDeRevision, studioAjustementSchema, type LigneAjustement, type StudioAjustementSaisi } from "./studio-quantites.js";

const docA = applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 3 } },
]);
// La tête suivante : l1 allongée, r1 inchangé.
const docB = applyStudioCommands(docA, [{ toolId: "studio.dessin.modifier", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } } }]);
const saisie = (patch: Partial<StudioAjustementSaisi> = {}): StudioAjustementSaisi => ({
  baseSequence: 0, revisionId: "rev-a", cible: { type: "objet", id: "l1" }, grandeur: "longueur", unite: "m", valeur: 4.2, motif: "Relevé sur site", ...patch,
});
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe("ajustements du métré Studio — règles du serveur (E.3-05)", () => {
  it("schéma : motif obligatoire et épuré, valeur positive ou null, cible objet ou calque, champs inconnus refusés", () => {
    expect(studioAjustementSchema.safeParse(saisie()).success).toBe(true);
    expect(studioAjustementSchema.safeParse(saisie({ valeur: null })).success).toBe(true);
    expect(studioAjustementSchema.safeParse(saisie({ motif: "   " })).success).toBe(false);
    expect(studioAjustementSchema.safeParse({ ...saisie(), motif: undefined }).success).toBe(false);
    expect(studioAjustementSchema.safeParse(saisie({ valeur: -1 })).success).toBe(false);
    expect(studioAjustementSchema.safeParse({ ...saisie(), valeur: "4" }).success).toBe(false);
    expect(studioAjustementSchema.safeParse({ ...saisie(), cible: { type: "piece", id: "x" } }).success).toBe(false);
    expect(studioAjustementSchema.safeParse({ ...saisie(), auteur: "quelqu'un d'autre" }).success).toBe(false);
    expect(studioAjustementSchema.safeParse({ ...saisie(), date: "2020-01-01T00:00:00Z" }).success).toBe(false);
    expect(studioAjustementSchema.safeParse(saisie({ grandeur: "masse" as never })).success).toBe(false);
  });

  it("décision : journal à jour, tête exigée, brute et état de la cible calculés par le serveur", () => {
    const ctx = { derniereSequence: 0, headRevisionId: "rev-a", document: json(docA) };
    const d = deciderAjustement(saisie(), ctx);
    if ("refus" in d) throw new Error(JSON.stringify(d.refus));
    expect(d.ok).toMatchObject({ seq: 1, targetKind: "objet", targetId: "l1", quantity: "longueur", value: 4.2, unit: "m", derivedValue: 4, motif: "Relevé sur site" });
    expect(d.ok.targetState).toMatchObject({ cible: "objet", nature: "ligne" });
    expect(deciderAjustement(saisie({ baseSequence: 3 }), ctx)).toMatchObject({ refus: { status: 409, body: { error: "journal_perime", currentSequence: 0 } } });
    expect(deciderAjustement(saisie({ revisionId: "rev-ancienne" }), ctx)).toMatchObject({ refus: { status: 409, body: { error: "revision_perimee", headRevisionId: "rev-a" } } });
    expect(deciderAjustement(saisie({ unite: "m2" }), ctx)).toMatchObject({ refus: { status: 400, body: { error: "unite_incoherente" } } });
    expect(deciderAjustement(saisie({ cible: { type: "objet", id: "absent" } }), ctx)).toMatchObject({ refus: { status: 400, body: { error: "objet_inconnu" } } });
    expect(deciderAjustement(saisie({ grandeur: "surface", unite: "m2" }), ctx)).toMatchObject({ refus: { status: 400, body: { error: "grandeur_non_applicable" } } });
    const calque = deciderAjustement(saisie({ cible: { type: "calque", id: "default" }, grandeur: "surface", unite: "m2", valeur: 6.5 }), ctx);
    expect(calque).toMatchObject({ ok: { targetKind: "calque", derivedValue: 6 } });
  });

  it("aller-retour du journal : ligne rendue au modèle, en vigueur sur sa révision, « à revoir » quand la cible change", () => {
    const d = deciderAjustement(saisie(), { derniereSequence: 0, headRevisionId: "rev-a", document: json(docA) });
    if ("refus" in d) throw new Error("refus");
    // Ce que la base rend : jsonb relu (clés réordonnées) et horodatage du serveur.
    const row: LigneAjustement = { id: "qa1", studyId: "s", variantId: "v", revisionId: "rev-a", ...d.ok, targetState: json(d.ok.targetState) as Record<string, unknown>, authorId: "u1", requestId: null, payloadHash: empreinteAjustement(saisie()), createdAt: new Date("2026-10-19T08:00:00Z") };
    const a = ajustementDe(row, new Map([["u1", "editeur@example.test"]]));
    expect(a).toMatchObject({ id: "qa1", sequence: 1, revisionId: "rev-a", cible: { type: "objet", id: "l1" }, valeur: 4.2, derivee: 4, auteur: "u1", auteurEmail: "editeur@example.test", date: "2026-10-19T08:00:00.000Z" });
    const surA = validateStudioDocument(json(docA));
    expect(evaluerAjustementsQuantites(surA, quantitesStudio(surA), [a]).journal[0]!.statut).toBe("en-vigueur");
    const surB = validateStudioDocument(json(docB));
    expect(evaluerAjustementsQuantites(surB, quantitesStudio(surB), [a]).journal[0]).toMatchObject({ statut: "a-revoir", revue: "cible-modifiee" });
  });

  it("journal borné : au-delà de la limite, 409 journal_plein (message en français)", () => {
    const ctx = { derniereSequence: 5000, headRevisionId: "rev-a", document: json(docA) };
    expect(deciderAjustement(saisie({ baseSequence: 5000 }), ctx)).toMatchObject({ refus: { status: 409, body: { error: "journal_plein", limite: 5000 } } });
    expect(deciderAjustement(saisie({ baseSequence: 4999 }), { ...ctx, derniereSequence: 4999 })).toMatchObject({ ok: { seq: 5000 } });
  });

  it("total de calque : son état comprend les ajustements d'objets en vigueur sur la tête (journal évalué par le serveur)", () => {
    const ctx = { derniereSequence: 0, headRevisionId: "rev-a", document: json(docA) };
    const d1 = deciderAjustement(saisie(), ctx);
    if ("refus" in d1) throw new Error("refus");
    const row: LigneAjustement = { id: "qa1", studyId: "s", variantId: "v", revisionId: "rev-a", ...d1.ok, authorId: "u1", requestId: null, payloadHash: null, createdAt: new Date() };
    const journal = [ajustementDe(row, new Map())];
    const d2 = deciderAjustement(saisie({ baseSequence: 1, cible: { type: "calque", id: "default" }, valeur: 5 }), { ...ctx, derniereSequence: 1, journal });
    if ("refus" in d2) throw new Error("refus");
    expect(JSON.stringify(d2.ok.targetState)).toContain('"ajustement":{"id":"qa1","valeur":4.2}');
    const sansJournal = deciderAjustement(saisie({ baseSequence: 1, cible: { type: "calque", id: "default" }, valeur: 5 }), { ...ctx, derniereSequence: 1 });
    expect(JSON.stringify("ok" in sansJournal && sansJournal.ok.targetState)).not.toContain("ajustement");
  });

  it("empreinte de la saisie : stable, sensible au contenu (rejeu par requestId)", () => {
    expect(empreinteAjustement(saisie())).toBe(empreinteAjustement({ ...saisie(), requestId: "autre" }));
    expect(empreinteAjustement(saisie())).not.toBe(empreinteAjustement(saisie({ valeur: 4.3 })));
    expect(empreinteAjustement(saisie())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("IF-008 — résultats quantitatifs servis par l'API (journal des ajustements compris)", () => {
  const ligne = (seq: number, revisionId: string, value: number | null, document: unknown): LigneAjustement => {
    const d = deciderAjustement(saisie({ baseSequence: seq - 1, revisionId, valeur: value }), { derniereSequence: seq - 1, headRevisionId: revisionId, document });
    if ("refus" in d) throw new Error(JSON.stringify(d.refus));
    return { id: `aj${seq}`, studyId: "e", variantId: "v", revisionId, ...d.ok, authorId: "u_1", requestId: null, payloadHash: null, createdAt: new Date("2026-10-25T08:00:00Z") };
  };
  const source = (revisionId: string) => ({ studyId: "e", variantId: "v", revisionId, documentHash: "a".repeat(64) });

  it("IF-008 [+] l'ajustement en vigueur est porté à part (motif, auteur, date), rawValue intacte, freshnessStatus contre la tête", () => {
    const journal = [ajustementDe(ligne(1, "rev-a", 4.2, json(docA)), new Map([["u_1", "a@x"]]))];
    const rs = resultatsDeRevision(json(docA), source("rev-a"), "rev-a", journal, new Date("2026-10-25T09:00:00Z"));
    const l1 = rs.find((r) => r.portee === "objet" && r.grandeur === "longueur" && r.sourceObjectIds[0] === "l1")!;
    expect(l1).toMatchObject({ rawValue: 4, ruleId: "studio.metre.longueur", freshnessStatus: "a-jour", manualAdjustment: { valeur: 4.2, unit: "m", motif: "Relevé sur site", auteur: "u_1", date: "2026-10-25T08:00:00.000Z" } });
    expect(rs.find((r) => r.sourceObjectIds[0] === "r1")?.manualAdjustment).toBeUndefined();
    const perimes = resultatsDeRevision(json(docA), source("rev-a"), "rev-b", journal, new Date());
    expect(perimes.every((r) => r.freshnessStatus === "perimee")).toBe(true);
  });

  it("IF-008 [−] un ajustement dont la cible a changé (à revoir) n'est pas porté comme correction : la valeur calculée seule fait foi", () => {
    const journal = [ajustementDe(ligne(1, "rev-a", 4.2, json(docA)), new Map())];
    const rs = resultatsDeRevision(json(docB), source("rev-b"), "rev-b", journal, new Date());
    const l1 = rs.find((r) => r.portee === "objet" && r.grandeur === "longueur" && r.sourceObjectIds[0] === "l1")!;
    expect(l1.rawValue).toBe(5);
    expect(l1.manualAdjustment).toBeUndefined();
  });
});
