import { describe, expect, it } from "vitest";
import type { ProjectPlanning, ProjectPlanningSteps } from "../../lib/api";
import { phaseBarPosition, phaseDatesLabel, planningTimeline, scheduledStepCount, stepRange } from "./planning-timeline";

const item = (startDate: string | null, endDate: string | null) => ({ startDate, endDate, responsible: "", nextAction: "" });
const project = (steps: ProjectPlanningSteps, baseline: ProjectPlanning["baseline"] = null): ProjectPlanning =>
  ({ projectId: "project-A", revision: 1, updatedAt: null, updatedBy: null, steps, baseline });

describe("calendrier métier R2", () => {
  it("ne présente 12 semaines fictives que quand aucun planning daté n'existe", () => {
    const empty = planningTimeline(project({}));
    expect(empty.mode).toBe("example");
    expect(empty.labels).toEqual(Array.from({ length: 12 }, (_, i) => `S${i + 1}`));
    const real = planningTimeline(project({ "1": item("2026-11-02", "2026-11-10") }));
    expect(real.mode).toBe("draft");
    expect(real.from).toBe("2026-11-02");
    expect(real.labels[0]).not.toBe("S1");
  });
  it("ne compte pas les dates partielles comme échéances complètes", () => {
    const steps = { "1": item("2026-11-02", "2026-11-05"), "2": item("2026-11-08", null), "3": item("2026-11-09", "2026-11-15") };
    expect(scheduledStepCount(steps)).toBe(2);
    expect(stepRange(steps, 1, 3)).toEqual({ start: "2026-11-02", end: "2026-11-15", complete: 2, total: 3 });
    expect(stepRange(steps, 4, 8)).toBeNull();
  });
  it("préserve la référence initiale pendant une modification des prévisions", () => {
    const baselineSteps: ProjectPlanningSteps = { "1": item("2026-11-02", "2026-11-05") };
    const liveSteps: ProjectPlanningSteps = { "1": item("2026-12-07", "2026-12-13") };
    const timeline = planningTimeline(project(liveSteps, { version: 1, steps: baselineSteps, sourceRevision: 21, createdAt: "2026-10-13T12:00:00Z", createdBy: "owner" }));
    expect(timeline.mode).toBe("baseline");
    expect(timeline.reference).toEqual(baselineSteps);
    expect(phaseDatesLabel(stepRange(timeline.reference!, 1, 3))).toContain("nov");
    const baselinePosition = phaseBarPosition(stepRange(baselineSteps, 1, 3), timeline);
    const livePosition = phaseBarPosition(stepRange(liveSteps, 1, 3), timeline);
    expect(baselinePosition?.left).not.toEqual(livePosition?.left);
  });
});
