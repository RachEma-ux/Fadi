import type { ProjectPlanning, ProjectPlanningStep, ProjectPlanningSteps } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import { COCKPIT_PHASES } from "./roadmap";

const DAY = 86_400_000;
const epoch = (date: string) => Date.parse(date + "T00:00:00Z");
const nonempty = (steps: ProjectPlanningSteps) => Object.values(steps).some((s) => !!s.startDate && !!s.endDate);

export interface PhaseDates {
  start: string;
  end: string;
  complete: number;
  total: number;
}

export interface PlanningTimeline {
  mode: "example" | "draft" | "baseline";
  version: number | null;
  from: string | null;
  days: number;
  labels: string[];
  current: ProjectPlanningSteps;
  reference: ProjectPlanningSteps | null;
}

function isoDay(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function shortDate(date: string) { return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(epoch(date))); }

export function stepRange(steps: ProjectPlanningSteps, first: number, last: number): PhaseDates | null {
  const ranges = Array.from({ length: last - first + 1 }, (_, n) => steps[String(first + n)])
    .filter((v): v is ProjectPlanningStep => Boolean(v && v.startDate && v.endDate && v.endDate >= v.startDate));
  if (!ranges.length) return null;
  const start = ranges.reduce((a, b) => a < b.startDate! ? a : b.startDate!, ranges[0]!.startDate!);
  const end = ranges.reduce((a, b) => a > b.endDate! ? a : b.endDate!, ranges[0]!.endDate!);
  return { start, end, complete: ranges.length, total: last - first + 1 };
}

export function scheduledStepCount(steps: ProjectPlanningSteps) {
  return Array.from({ length: 21 }, (_, n) => steps[String(n + 1)])
    .filter((s) => !!s?.startDate && !!s?.endDate && s.endDate >= s.startDate).length;
}

export function planningTimeline(plan: ProjectPlanning | null | undefined): PlanningTimeline {
  const current = plan?.steps ?? {};
  const reference = plan?.baseline?.steps ?? null;
  const version = plan?.baseline?.version ?? null;
  const valid = nonempty(current) || (reference !== null && nonempty(reference));
  if (!valid) return { mode: "example", version: null, from: null, days: 84, labels: Array.from({ length: 12 }, (_, i) => "S" + (i + 1)), current, reference: null };

  const spans = [...COCKPIT_PHASES.flatMap((p) => [stepRange(current, p.first, p.last), ...(reference ? [stepRange(reference, p.first, p.last)] : [])])]
    .filter((range): range is PhaseDates => range !== null);
  const from = spans.reduce((a, b) => a < b.start ? a : b.start, spans[0]!.start);
  const to = spans.reduce((a, b) => a > b.end ? a : b.end, spans[0]!.end);
  const days = Math.max(7, Math.round((epoch(to) - epoch(from)) / DAY) + 1);
  const labels = Array.from({ length: 12 }, (_, i) => i % 2 === 0 ? shortDate(isoDay(epoch(from) + Math.floor(i * days / 12) * DAY)) : "");
  return { mode: reference ? "baseline" : "draft", version, from, days, labels, current, reference };
}

export function phaseBarPosition(range: PhaseDates | null, timeline: PlanningTimeline): { left: string; width: string } | null {
  if (!range || timeline.from === null) return null;
  const left = Math.max(0, Math.min(100, (epoch(range.start) - epoch(timeline.from)) / DAY / timeline.days * 100));
  const width = Math.max(.25, Math.min(100 - left, ((epoch(range.end) - epoch(range.start)) / DAY + 1) / timeline.days * 100));
  return { left: left + "%", width: width + "%" };
}

export function phaseDatesLabel(range: PhaseDates | null) {
  return range ? shortDate(range.start) + "–" + shortDate(range.end) : "Dates non renseignées";
}
