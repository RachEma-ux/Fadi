import { describe, expect, it } from "vitest";
import { dossierAlerts, type DossierAlertFacts } from "./dossier-alerts";

function facts(overrides: Partial<DossierAlertFacts> = {}): DossierAlertFacts {
  return {
    projectId: "proj_123", code: "P.118", projectAvailable: true,
    accessKnown: true, canWrite: true, projectReadFailed: false,
    localSaveFailed: false, connected: true, online: true, conflicts: 0,
    stepsReadFailed: false, hasSteps: true, programmeReadFailed: false,
    hasProgramme: true, reviewReadFailed: false, hasReview: true,
    reviewStale: false, ...overrides,
  };
}

describe("active dossier alerts", () => {
  it("has no alert for a healthy loaded dossier", () => {
    expect(dossierAlerts(facts())).toEqual([]);
  });
  it("does not leak a previously cached dossier after an access denial", () => {
    expect(dossierAlerts(facts({ projectAvailable: false, conflicts: 1, reviewStale: true }))).toEqual([]);
  });
  it("counts concurrent independent problems without combining them", () => {
    const alerts = dossierAlerts(facts({
      projectReadFailed: true, projectLastRead: "13 oct., 08:42",
      stepsReadFailed: true, programmeReadFailed: true,
      reviewReadFailed: true, reviewStale: true,
    }));
    expect(alerts).toHaveLength(5);
    expect(new Set(alerts.map((a) => a.id)).size).toBe(5);
    expect(alerts.every((a) => a.title.startsWith("P.118 · "))).toBe(true);
    expect(alerts.find((a) => a.id === "project-read")?.text).toContain("08:42");
  });
  it("keeps unsaved work and conflicts separate from connectivity", () => {
    const alerts = dossierAlerts(facts({ localSaveFailed: true, conflicts: 2, connected: false, online: false }));
    expect(alerts.map((a) => a.id)).toEqual(["local-save", "connection", "conflicts"]);
    expect(alerts.find((a) => a.id === "connection")?.action).toBeUndefined();
    expect(alerts.find((a) => a.id === "local-save")?.action).toEqual({ label: "Réessayer la sauvegarde", command: "retry-local" });
    expect(alerts.find((a) => a.id === "conflicts")?.action).toEqual({ label: "Comparer les versions", href: "/projets/proj_123?conflits=1" });
  });
  it("links retained choices and the review to the same dossier", () => {
    const alerts = dossierAlerts(facts({ staleStep: 9, reviewStale: true }));
    expect(alerts.map((a) => a.action)).toEqual([
      { label: "Consulter la revue", href: "/projets/proj_123?module=parcours&etape=11&bilan=1" },
      { label: "Ouvrir l’étape", href: "/projets/proj_123?module=parcours&etape=9" },
    ]);
  });
  it("does not offer writing actions to a read-only user", () => {
    const alerts = dossierAlerts(facts({ canWrite: false, localSaveFailed: true, accessReason: "Lecture seule" }));
    expect(alerts.map((a) => a.id)).toEqual(["read-only", "local-save"]);
    expect(alerts.find((a) => a.id === "local-save")?.action).toBeUndefined();
  });
});
