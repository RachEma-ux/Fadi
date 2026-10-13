import { describe, expect, it } from "vitest";
import type { ParcoursStep, ParcoursStepStatus } from "../../lib/api";
import { COCKPIT_PHASES, cockpitPhaseProgress, cockpitPhaseStatus, cockpitSteps, examplePosition } from "./roadmap";

function steps(defaultStatus: ParcoursStepStatus = "a-faire"): ParcoursStep[] {
  return Array.from({ length: 21 }, (_, index) => ({
    number: index + 1,
    title: `Étape ${index + 1}`,
    phase: COCKPIT_PHASES.find((phase) => index + 1 >= phase.first && index + 1 <= phase.last)!.name,
    status: defaultStatus,
  })) as ParcoursStep[];
}

describe("pilotage natif du projet", () => {
  it("préserve les 21 étapes et six phases sans créer une étape Harmony", () => {
    expect(COCKPIT_PHASES).toHaveLength(6);
    expect(COCKPIT_PHASES[0]).toMatchObject({ first: 1, last: 3 });
    expect(COCKPIT_PHASES[5]).toMatchObject({ first: 20, last: 21 });
    expect(cockpitSteps(steps())).toHaveLength(21);
  });
  it("n’invente aucun avancement pour une lecture incomplète", () => {
    expect(cockpitSteps(steps().slice(1))).toBeNull();
    expect(cockpitPhaseStatus(null, 1, 3)).toBe("unavailable");
    expect(cockpitPhaseProgress(null, 1, 3)).toBeNull();
    expect(cockpitPhaseStatus(steps().slice(1), 1, 3)).toBe("unavailable");
  });
  it("calcule les statuts à partir de la seule source Parcours", () => {
    const data = steps();
    expect(cockpitPhaseStatus(data, 1, 3)).toBe("todo");
    data[0]!.status = "termine";
    data[1]!.status = "en-cours";
    expect(cockpitPhaseStatus(data, 1, 3)).toBe("doing");
    expect(cockpitPhaseProgress(data, 1, 3)).toBe(1);
    data[1]!.status = "termine";
    data[2]!.status = "termine";
    expect(cockpitPhaseStatus(data, 1, 3)).toBe("done");
    expect(cockpitPhaseProgress(data, 1, 3)).toBe(3);
  });
  it("conserve un exemple Gantt de douze semaines explicitement indicatif", () => {
    expect(COCKPIT_PHASES.every((p) => p.start >= 1 && p.end <= 12 && p.end >= p.start)).toBe(true);
    expect(examplePosition(1, 2)).toEqual({ left: "0%", width: "16.666666666666664%" });
    expect(examplePosition(11, 12)).toEqual({ left: "83.33333333333334%", width: "16.666666666666664%" });
  });
});
