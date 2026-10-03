/**
 * Moteur Harmony V6 (`harmony-engine-v6` du prototype), fonctions pures :
 * profil par type, règles applicables, statut d'une observation, bilan des
 * observations (`assess`), références directionnelles (`compass`) et carte
 * temporelle (`natal`). Les tables (types, phases, 69 règles, directions,
 * Gua, sources) sont extraites telles quelles dans
 * `apps/api/src/data/harmony-engine.json` et passées en paramètre.
 *
 * Ce que le moteur dit et ne dit pas est conservé : une lecture
 * traditionnelle n'est ni une mesure physique ni une garantie ; une
 * référence directionnelle non confirmée suspend les calculs ; aucune carte
 * natale complète n'est inventée.
 */
import { fnv1a } from "./model-analysis.js";

export interface HarmonyRule {
  id: string;
  phase: number;
  section: "site" | "building" | "usage" | "decor" | string;
  types: string[];
  reading: string;
  title: string;
  prompt: string;
  advice: string;
  guard: string;
  step: number;
}

export interface HarmonyEngineData {
  version: string;
  ruleVersion: string;
  types: Record<string, { label: string; focus: string; yin: string }>;
  phases: Record<string, string>;
  readings: Record<string, string>;
  rules: HarmonyRule[];
  dirs: string[];
  gua: { n: number; name: string; element: string; group: string }[];
  sources: { id: string; title: string; url: string; scope: string }[];
  flight: string[];
}

/** Une observation du dossier Harmony pour une règle (`h.observations[ruleId]`). */
export interface HarmonyObservation {
  state?: string;
  note?: string;
  source?: string;
  quality?: string;
  date?: string;
  owner?: string;
  modelSignature?: string;
  origin?: string;
  updated?: string;
  [k: string]: unknown;
}

export interface HarmonyCompass {
  basis?: string;
  centerMethod?: string;
  scope?: string;
  entryId?: string;
  facing?: number | string | null;
  source?: string;
  facadeReason?: string;
  confirmed?: boolean;
  date?: string;
  uncertainty?: number | string | null;
  declination?: number | string | null;
  declinationSource?: string;
  [k: string]: unknown;
}

export interface HarmonyTimeline {
  period?: number | string | null;
  referenceDate?: string;
  construction?: string;
  occupation?: string;
  source?: string;
  basis?: string;
  confirmed?: boolean;
  [k: string]: unknown;
}

export interface HarmonyChart {
  mountain?: Record<string, unknown>;
  water?: Record<string, unknown>;
  source?: string;
  reviewer?: string;
  inputSignature?: string;
  [k: string]: unknown;
}

/** `p.data.harmony` du prototype (`Parcours.Harmony`, schéma 1) — le dossier Harmony d'un projet, conservé tel quel. */
export interface HarmonyDossier {
  schema?: string;
  version?: number;
  created?: string;
  updated?: string;
  config: { type?: string; phase?: number | string; components?: string[]; [k: string]: unknown };
  observations: Record<string, HarmonyObservation>;
  compass: HarmonyCompass;
  timeline: HarmonyTimeline;
  chart: HarmonyChart;
  roomData: Record<string, Record<string, unknown>>;
  ambiences: Record<string, Record<string, unknown>>;
  actions: unknown[];
  candidates: unknown[];
  reviews: Record<string, unknown>[];
  people: unknown[];
  ui?: Record<string, unknown>;
  programmeBrief?: Record<string, unknown>;
  designReviewV62?: DesignReviewSnapshot | null;
  designReviewHistoryV62?: DesignReviewSnapshot[];
  workingAssumptionsV62?: unknown;
  [k: string]: unknown;
}

/** `designReviewV62` : la revue de conception archivée (bilan du bâtiment conçu). */
export interface DesignReviewSnapshot {
  version: string;
  name: string;
  at: string;
  signature: string;
  modelSignature: string;
  status: string;
  automatic: boolean;
  summary: string;
  counts: { levels: number; rooms: number; issues: number };
}

/** `hdata(p)` : le dossier avec ses collections garanties (sans rien inventer d'autre). */
export function harmonyDossier(raw: unknown, now: string): HarmonyDossier {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const obj = (v: unknown): Record<string, never> | Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const base: HarmonyDossier = Object.keys(r).length
    ? ({ ...r } as HarmonyDossier)
    : { schema: "Parcours.Harmony", version: 1, created: now, config: { type: "auto", phase: 1 }, observations: {}, compass: { basis: "magnetic" }, timeline: {}, chart: { mountain: {}, water: {} }, roomData: {}, ambiences: {}, actions: [], candidates: [], reviews: [], people: [], ui: { tab: "summary", filter: "all" } };
  base.config = obj(base.config) as HarmonyDossier["config"];
  base.observations = obj(base.observations) as HarmonyDossier["observations"];
  base.compass = obj(base.compass) as HarmonyCompass;
  base.timeline = obj(base.timeline) as HarmonyTimeline;
  base.chart = obj(base.chart) as HarmonyChart;
  base.chart.mountain = obj(base.chart.mountain);
  base.chart.water = obj(base.chart.water);
  base.roomData = obj(base.roomData) as HarmonyDossier["roomData"];
  base.ambiences = obj(base.ambiences) as HarmonyDossier["ambiences"];
  base.actions = arr(base.actions);
  base.candidates = arr(base.candidates);
  base.reviews = arr(base.reviews) as Record<string, unknown>[];
  base.people = arr(base.people);
  return base;
}

/** `number(v)` : nombre fini ou `null` (jamais zéro par défaut). */
export function harmonyNumber(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

export const normDeg = (v: number): number => ((v % 360) + 360) % 360;

/** Secteur de 45° (0 = N … 7 = NO) d'un azimut, ou `null`. */
export function harmonySector(v: unknown): number | null {
  const n = harmonyNumber(v);
  return n === null ? null : Math.floor(((normDeg(n) + 22.5) % 360) / 45);
}

export function cardinalOf(data: HarmonyEngineData, v: number): string {
  return data.dirs[harmonySector(v) ?? 0] ?? "";
}

export interface HarmonyProfile {
  type: string;
  parts: string[];
  label: string;
  all: string[];
  source: string;
}

/** `profile(h, programme, example)` : le type retenu (choix Harmony, sinon répartition, sinon composantes de l'exemple). */
export function harmonyProfile(data: HarmonyEngineData, h: Pick<HarmonyDossier, "config">, programme: { type?: string } | null, example = false): HarmonyProfile {
  let type = String(h.config?.type ?? "auto");
  if (type === "auto") type = programme?.type && data.types[programme.type] ? programme.type : example ? "mixte" : "";
  const parts = type === "mixte" ? ((h.config?.components as string[] | undefined) ?? (example ? ["tertiaire", "enseignement"] : [])).filter((t) => !!data.types[t] && t !== "mixte") : [];
  return {
    type,
    parts,
    label: data.types[type]?.label ?? "Type à préciser",
    all: type ? [type, ...parts] : [],
    source: h.config?.type && h.config.type !== "auto" ? "Choix Harmony" : programme?.type ? "Répartition programmatique" : example ? "Composantes proposées depuis l’exemple" : "Non renseigné",
  };
}

export function applicableRules(data: HarmonyEngineData, h: Pick<HarmonyDossier, "config">, programme: { type?: string } | null, example = false): HarmonyRule[] {
  const p = harmonyProfile(data, h, programme, example);
  return data.rules.filter((r) => !r.types.length || r.types.some((t) => p.all.includes(t)));
}

export type HarmonyRecordStatus = "unknown" | "unproven" | "na" | "ok" | "improve" | "conflict";

/** `recordStatus(r)` : une observation sans note, source ou qualité reste « à documenter ». */
export function harmonyRecordStatus(r: HarmonyObservation = {}): HarmonyRecordStatus {
  if (!r.state || r.state === "unknown") return "unknown";
  if (r.state === "na") return r.note?.trim() ? "na" : "unproven";
  if (!r.note?.trim() || !r.source?.trim() || !r.quality || r.quality === "unknown") return "unproven";
  return r.state === "ok" || r.state === "improve" || r.state === "conflict" ? r.state : "unknown";
}

export type HarmonyAssessStatus = HarmonyRecordStatus | "future" | "stale";

export interface HarmonyAssessment {
  all: { rule: HarmonyRule; record: HarmonyObservation; status: HarmonyAssessStatus }[];
  counts: Record<HarmonyAssessStatus, number>;
  active: number;
  documented: number;
  phase: number;
  profile: HarmonyProfile;
}

/** `assess(h, programme, example)` : chaque règle applicable avec son observation et son statut (« phase suivante » au-delà de la phase courante). */
export function harmonyAssess(data: HarmonyEngineData, h: Pick<HarmonyDossier, "config" | "observations">, programme: { type?: string } | null, example = false): HarmonyAssessment {
  const phase = Number(h.config?.phase) || 1;
  const all = applicableRules(data, h, programme, example).map((rule) => {
    const record = h.observations?.[rule.id] ?? {};
    return { rule, record, status: (rule.phase > phase ? "future" : harmonyRecordStatus(record)) as HarmonyAssessStatus };
  });
  const counts: Record<HarmonyAssessStatus, number> = { ok: 0, improve: 0, conflict: 0, na: 0, unknown: 0, unproven: 0, future: 0, stale: 0 };
  for (const x of all) counts[x.status]++;
  return { all, counts, active: all.filter((x) => x.status !== "future").length, documented: counts.ok + counts.improve + counts.conflict + counts.na, phase, profile: harmonyProfile(data, h, programme, example) };
}

/**
 * `assessment(context)` de harmony-app-v6 : une observation rattachée à une
 * autre empreinte de modèle devient « À revoir · données modifiées » ;
 * `fullHash` date le bilan ; la dernière revue dit s'il est à actualiser.
 */
export function harmonyFullAssessment(data: HarmonyEngineData, h: HarmonyDossier, programme: { type?: string } | null, example: boolean, sourceHash: string): HarmonyAssessment & { fullHash: string; last: Record<string, unknown> | null; stale: boolean; label: string } {
  const a = harmonyAssess(data, h, programme, example);
  for (const x of a.all) {
    if (x.status !== "unknown" && x.status !== "future" && x.record.modelSignature && x.record.modelSignature !== sourceHash) {
      a.counts[x.status]--;
      x.status = "stale";
      a.counts.stale++;
    }
  }
  a.documented = a.counts.ok + a.counts.improve + a.counts.conflict + a.counts.na;
  const fullHash = fnv1a({ source: sourceHash, phase: h.config.phase, observations: h.observations, chart: h.chart, rooms: h.roomData, ambiences: h.ambiences, candidates: h.candidates });
  const last = h.reviews[h.reviews.length - 1] ?? null;
  const stale = !!last && last["signature"] !== fullHash;
  const label = stale ? "Bilan à actualiser" : !last ? "Prédiagnostic ouvert" : a.counts.conflict ? "Revue avec conflits" : a.documented < a.active ? "Revue avec données manquantes" : "Revue documentaire enregistrée";
  return { ...a, fullHash, last, stale, label };
}

export interface CompassStatus {
  ready: boolean;
  missing: string[];
  facing: number | null;
  sitting: number | null;
  gua: { n: number; name: string; element: string; group: string; direction: string } | null;
  mountainBoundary: number | null;
  uncertainty: number | null;
}

/** `compass(c)` : la référence directionnelle du bâtiment n'est exploitable que complète, sourcée, datée, confirmée et sans limite de secteur dans l'incertitude. */
export function compassStatus(data: HarmonyEngineData, c: HarmonyCompass = {}): CompassStatus {
  const missing: string[] = [];
  const raw = harmonyNumber(c.facing);
  const unc = harmonyNumber(c.uncertainty);
  const dec = harmonyNumber(c.declination);
  if (raw === null || raw < 0 || raw >= 360) missing.push("Azimut de façade entre 0° inclus et 360° exclus");
  if (c.basis !== "magnetic" && c.basis !== "geographic") missing.push("Référence magnétique ou géographique");
  if (c.basis === "geographic" && dec === null) missing.push("Déclinaison documentée pour la lecture magnétique");
  if (!c.source?.trim()) missing.push("Source de la mesure");
  if (!c.date) missing.push("Date de la mesure");
  if (!c.facadeReason?.trim()) missing.push("Justification de la façade de référence");
  if (unc === null || unc < 0 || unc > 45) missing.push("Incertitude de mesure (0 à 45°)");
  if (c.basis === "geographic" && !c.declinationSource?.trim()) missing.push("Source / époque de la déclinaison");
  if (!c.confirmed) missing.push("Validation de la référence spatiale");
  const facing = raw === null ? null : normDeg(raw - (c.basis === "geographic" ? dec || 0 : 0));
  const sitting = facing === null ? null : normDeg(facing + 180);
  const dir = harmonySector(sitting);
  const boundary = facing === null ? null : Math.min((facing + 22.5) % 45, 45 - ((facing + 22.5) % 45));
  const mountainBoundary = facing === null ? null : Math.min((facing + 7.5) % 15, 15 - ((facing + 7.5) % 15));
  if (!missing.length && boundary !== null && unc !== null && boundary <= unc) missing.push("Incertitude traversant une limite Ba Zhai : nouvelle mesure nécessaire");
  const g = dir === null ? null : data.gua[dir];
  return { ready: !missing.length, missing, facing, sitting, gua: g ? { ...g, direction: data.dirs[dir!] ?? "" } : null, mountainBoundary, uncertainty: unc };
}

/** `baseStars(period)` : la trame de période (1–9) sur les neuf palais, ou `null`. */
export function baseStars(data: HarmonyEngineData, period: unknown): Record<string, number> | null {
  const p = Number(period);
  if (!Number.isInteger(p) || p < 1 || p > 9) return null;
  return Object.fromEntries(data.flight.map((d, i) => [d, ((p + i - 1) % 9) + 1]));
}

export interface NatalStatus {
  ready: boolean;
  missing: string[];
  base: Record<string, number> | null;
  signature: string;
  series: boolean;
  compass: CompassStatus;
}

/** `natal(h)` : la carte temporelle n'est établie qu'avec références directionnelles, période confirmée et 18 valeurs montagne / eau relues. */
export function natalStatus(data: HarmonyEngineData, h: Pick<HarmonyDossier, "compass" | "timeline" | "chart">): NatalStatus {
  const c = compassStatus(data, h.compass);
  const t = h.timeline ?? {};
  const missing = [...c.missing];
  if (!baseStars(data, t.period)) missing.push("Période natale retenue (1 à 9)");
  if (!t.basis?.trim()) missing.push("Convention temporelle");
  if (!t.source?.trim()) missing.push("Source des dates et justification de période");
  if (!t.referenceDate) missing.push("Date de référence retenue");
  if (!t.confirmed) missing.push("Confirmation de la période, distincte de la période actuelle");
  if (c.mountainBoundary !== null && c.mountainBoundary <= Math.max(3, c.uncertainty ?? 0)) missing.push("Mesure proche d’une limite des 24 montagnes : expertise spécifique requise");
  const chart = h.chart ?? {};
  const validSeries = (k: "mountain" | "water") => {
    const s = (chart[k] ?? {}) as Record<string, unknown>;
    return data.flight.every((d) => Number.isInteger(harmonyNumber(s[d])) && (harmonyNumber(s[d]) as number) >= 1 && (harmonyNumber(s[d]) as number) <= 9) && new Set(data.flight.map((d) => Number(s[d]))).size === 9;
  };
  const series = validSeries("mountain") && validSeries("water");
  if (!series) missing.push("18 valeurs montagne / eau cohérentes, de 1 à 9 sans doublon par série");
  if (!chart.source?.trim() || !chart.reviewer?.trim()) missing.push("Source et relecteur de la carte");
  const signature = fnv1a({ facing: h.compass ?? {}, timeline: h.timeline ?? {} });
  if (chart.inputSignature !== signature) missing.push("Carte à rattacher aux références actuelles par une nouvelle revue");
  return { ready: !missing.length, missing, base: baseStars(data, t.period), signature, series, compass: c };
}
