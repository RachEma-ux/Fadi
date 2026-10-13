import type { ParcoursStep } from "../../lib/api";
import { completeParcoursList } from "../accueil/dossier-state";

/**
 * Six stable business phases. The time windows reproduce the validated
 * twelve-week design EXAMPLE; they are never presented as project dates.
 */
export const COCKPIT_PHASES = [
  { name: "Comprendre le site", first: 1, last: 3, start: 1, end: 2, color: "#d5a16c", soft: "#fcf2e6" },
  { name: "Programmer", first: 4, last: 8, start: 2, end: 5, color: "#8fa76e", soft: "#f2f6e9" },
  { name: "Concevoir / Tester", first: 9, last: 12, start: 5, end: 8, color: "#71aab1", soft: "#edf8f7" },
  { name: "Prouver la faisabilité", first: 13, last: 16, start: 8, end: 10, color: "#9ca9ce", soft: "#f0f2fb" },
  { name: "Arbitrer", first: 17, last: 19, start: 10, end: 11, color: "#b799b8", soft: "#f7eff8" },
  { name: "Engager", first: 20, last: 21, start: 11, end: 12, color: "#86a7a3", soft: "#edf5f3" },
] as const;

export type CockpitStatus = "done" | "doing" | "todo" | "unavailable";

export const COCKPIT_STATUS_LABEL: Record<CockpitStatus, string> = {
  done: "Terminé",
  doing: "En cours",
  todo: "À faire",
  unavailable: "Non évalué",
};

export function cockpitPhaseStatus(steps: readonly ParcoursStep[] | null, first: number, last: number): CockpitStatus {
  if (!steps || !completeParcoursList(steps)) return "unavailable";
  const own = steps.filter((step) => step.number >= first && step.number <= last);
  if (own.length !== last - first + 1) return "unavailable";
  if (own.every((step) => step.status === "termine")) return "done";
  if (own.some((step) => step.status === "termine" || step.status === "en-cours")) return "doing";
  return "todo";
}

export function cockpitPhaseProgress(steps: readonly ParcoursStep[] | null, first: number, last: number): number | null {
  if (!steps || !completeParcoursList(steps)) return null;
  return steps.filter((step) => step.number >= first && step.number <= last && step.status === "termine").length;
}

export function cockpitStepStatus(status: ParcoursStep["status"]): CockpitStatus {
  return status === "termine" ? "done" : status === "en-cours" ? "doing" : "todo";
}

/** Returns null if the authoritative twenty-one-step list is incomplete. */
export function cockpitSteps(steps: readonly ParcoursStep[] | undefined): readonly ParcoursStep[] | null {
  return completeParcoursList(steps) ? [...steps].sort((a, b) => a.number - b.number) : null;
}

export function examplePosition(start: number, end: number) {
  return { left: `${((start - 1) / 12) * 100}%`, width: `${((end - start + 1) / 12) * 100}%` };
}
