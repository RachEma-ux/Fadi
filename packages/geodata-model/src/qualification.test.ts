import { describe, expect, it } from "vitest";
import { QUALIFIEE, lireQualification, qualificationAdmise, validerQualification } from "./qualification.js";

describe("qualification d'une source (D-GD-54)", () => {
  it("absente ou « qualifiee » : qualifiée", () => {
    expect(validerQualification(undefined)).toEqual({ ok: true, qualification: QUALIFIEE });
    expect(validerQualification({ etat: "qualifiee" })).toEqual({ ok: true, qualification: QUALIFIEE });
  });
  it("provisoire : motif et décision exigés", () => {
    expect(validerQualification({ etat: "provisoire", motif: "Droits du producteur non établis.", decision: "D-GD-54" })).toEqual({ ok: true, qualification: { etat: "provisoire", motif: "Droits du producteur non établis.", decision: "D-GD-54" } });
    expect(validerQualification({ etat: "provisoire", motif: "court", decision: "D-GD-54" }).ok).toBe(false);
    expect(validerQualification({ etat: "provisoire", motif: "Droits du producteur non établis." }).ok).toBe(false);
    expect(validerQualification({ etat: "autre" }).ok).toBe(false);
    expect(validerQualification("provisoire").ok).toBe(false);
  });
  it("lecture en base : tout ce qui n'est pas « provisoire » est qualifié", () => {
    expect(lireQualification("qualifiee", null, null)).toEqual(QUALIFIEE);
    expect(lireQualification(null, "x", "D-GD-1")).toEqual(QUALIFIEE);
    expect(lireQualification("provisoire", "Motif déclaré", "D-GD-54")).toEqual({ etat: "provisoire", motif: "Motif déclaré", decision: "D-GD-54" });
  });
  it("une source provisoire n'est admise que si l'environnement l'admet ; une qualifiée toujours", () => {
    const p = { etat: "provisoire", motif: "Droits non établis", decision: "D-GD-54" } as const;
    expect(qualificationAdmise(QUALIFIEE, false)).toEqual({ ok: true });
    expect(qualificationAdmise(p, true)).toEqual({ ok: true });
    const refus = qualificationAdmise(p, false);
    expect(refus.ok).toBe(false);
    expect(!refus.ok && refus.motif).toMatch(/D-GD-54/);
  });
});
