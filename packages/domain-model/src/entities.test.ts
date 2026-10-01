import { describe, expect, it } from "vitest";
import {
  isCadastralCoordinate,
  isGeographicCoordinate,
  isLocalCoordinate,
  type ArchitecturalObject,
  type BusinessCheck,
  type CalculatedResult,
  type Coordinate,
  type Decision,
  type Hypothesis,
  type ProducedDocument,
  type Recommendation,
  type Requirement,
  type SourceDatum,
} from "./entities";

describe("Coordinate frame guards", () => {
  const cadastral: Coordinate = { frame: "cadastral", x: 10, y: 20 };
  const geographic: Coordinate = { frame: "geographic", lat: 48.85, lon: 2.35 };
  const local: Coordinate = { frame: "local", x: 1, y: 2 };

  it("identifies each frame and rejects the other two", () => {
    expect(isCadastralCoordinate(cadastral)).toBe(true);
    expect(isCadastralCoordinate(geographic)).toBe(false);
    expect(isCadastralCoordinate(local)).toBe(false);

    expect(isGeographicCoordinate(geographic)).toBe(true);
    expect(isGeographicCoordinate(cadastral)).toBe(false);
    expect(isGeographicCoordinate(local)).toBe(false);

    expect(isLocalCoordinate(local)).toBe(true);
    expect(isLocalCoordinate(cadastral)).toBe(false);
    expect(isLocalCoordinate(geographic)).toBe(false);
  });

  it("never classifies a coordinate as more than one frame", () => {
    for (const c of [cadastral, geographic, local]) {
      const matches = [isCadastralCoordinate(c), isGeographicCoordinate(c), isLocalCoordinate(c)].filter(
        Boolean,
      );
      expect(matches).toHaveLength(1);
    }
  });
});

// The remaining tests are compile-time invariant checks: each entity below
// is built to satisfy its interface exactly as the brief's governance table
// describes it. If a required field is dropped (e.g. Requirement.origin,
// CalculatedResult.modelRevision), `npm run typecheck` fails — that failure
// IS the test. The runtime assertions just confirm the values round-trip.

describe("entity shapes carry their governance fields", () => {
  it("ArchitecturalObject has an id, kind, properties and relations", () => {
    const wall: ArchitecturalObject = {
      id: "obj-1",
      kind: "wall",
      properties: { thickness: 0.2 },
      relations: [{ kind: "belongs-to", targetId: "level-1" }],
      modelRevision: 3,
    };
    expect(wall.relations).toHaveLength(1);
    expect(wall.modelRevision).toBe(3);
  });

  it("SourceDatum carries an origin document, date, unit and verification status", () => {
    const datum: SourceDatum = {
      id: "src-1",
      originDocument: "Relevé topographique 2026-03-12",
      date: "2026-03-12",
      unit: "m",
      verificationStatus: "verifiee",
    };
    expect(datum.verificationStatus).toBe("verifiee");
  });

  it("Requirement has an explicit origin and optional source link", () => {
    const req: Requirement = {
      id: "req-1",
      origin: "reglementaire",
      description: "Hauteur sous plafond minimale 2.50 m",
    };
    expect(req.sourceId).toBeUndefined();
  });

  it("Hypothesis is distinct from Requirement: it carries a justification, not an origin", () => {
    const hyp: Hypothesis = {
      id: "hyp-1",
      value: 42,
      justification: "Valeur par défaut du DTU en l'absence de relevé",
      expectedValidation: "À confirmer par étude de sol",
    };
    expect(hyp).not.toHaveProperty("origin");
  });

  it("Recommendation is distinct from both: it carries a rationale, not a justification/origin", () => {
    const rec: Recommendation = {
      id: "rec-1",
      description: "Prévoir un joint de dilatation",
      rationale: "Longueur de façade supérieure au seuil usuel",
    };
    expect(rec).not.toHaveProperty("origin");
    expect(rec).not.toHaveProperty("justification");
  });

  it("CalculatedResult carries its method, inputs and the model revision that produced it", () => {
    const result: CalculatedResult = {
      id: "calc-1",
      method: "surface-utile-SHAB",
      inputIds: ["obj-1", "obj-2"],
      value: 84.5,
      modelRevision: 3,
    };
    expect(result.inputIds).toContain("obj-1");
  });

  it("Decision carries a choice, justification, author and date", () => {
    const decision: Decision = {
      id: "dec-1",
      choice: "Conserver le tracé initial de l'escalier",
      justification: "Modification refusée par le règlement local",
      author: "architecte",
      date: "2026-04-01",
    };
    expect(decision.author).toBe("architecte");
  });

  it("ProducedDocument carries the revision used and its freshness", () => {
    const doc: ProducedDocument = {
      id: "doc-1",
      kind: "plan-niveau",
      freshness: "a-jour",
      modelRevision: 3,
    };
    expect(doc.freshness).toBe("a-jour");
  });

  it("BusinessCheck defaults to non-evalue rather than a silent estimate", () => {
    const check: BusinessCheck = {
      id: "check-1",
      domain: "accessibilite",
      source: "non fournie",
      version: "n/a",
      status: "non-evalue",
    };
    expect(check.status).toBe("non-evalue");
    expect(check.result).toBeUndefined();
  });
});
