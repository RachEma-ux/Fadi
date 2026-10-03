/**
 * Répartition programmatique (étapes 06 et 07) et sommes d'un cas de
 * programme — portées depuis `programmeStore()` / `programmeRatio()` /
 * `programmeTotal()` / `programmeContent()` (app hôte) et `sums()` de la
 * bibliothèque des bâtiments (`building-library-app`) du prototype.
 * Fonctions pures ; les fourchettes par type viennent de
 * `apps/api/src/data/programme-repartition.json`.
 */

export type ProgrammeMode = "min" | "cible" | "max";
export const PROGRAMME_MODES: readonly ProgrammeMode[] = ["min", "cible", "max"];

export interface ProgrammeFamily {
  key: string;
  label: string;
}

/** Forme de `programme-repartition.json`. */
export interface ProgrammeRepartitionData {
  defaults: { type: string; baseArea: number; mode: ProgrammeMode };
  modes: { key: ProgrammeMode; label: string }[];
  families: ProgrammeFamily[];
  /** Par type : libellé et fourchette [basse, cible, haute] en % par famille. */
  types: Record<string, { label: string; ratios: Record<string, [number, number, number]> }>;
  adjacency: [string, string][];
  statusNote: string;
  subtitle: string;
  transfer: { title: string; rules: string; control: string };
}

/** Réglage d'un projet : type, surface de référence, position dans la fourchette et ratios forcés à la main. */
export interface ProgrammeRepartition {
  type: string;
  baseArea: number;
  mode: ProgrammeMode;
  custom: Record<string, number>;
}

export function defaultProgrammeRepartition(data: ProgrammeRepartitionData): ProgrammeRepartition {
  return { type: data.defaults.type, baseArea: data.defaults.baseArea, mode: data.defaults.mode, custom: {} };
}

const MODE_INDEX: Record<ProgrammeMode, 0 | 1 | 2> = { min: 0, cible: 1, max: 2 };

/** Ratio (%) retenu pour une famille : valeur forcée si elle existe, sinon la fourchette du type à la position choisie. */
export function programmeRatio(data: ProgrammeRepartitionData, rep: ProgrammeRepartition, family: string): number {
  const custom = rep.custom[family];
  if (custom !== undefined && Number.isFinite(custom)) return custom;
  const range = data.types[rep.type]?.ratios[family] ?? [0, 0, 0];
  return range[MODE_INDEX[rep.mode]];
}

export interface ProgrammeRow {
  key: string;
  label: string;
  range: [number, number];
  ratio: number;
  area: number;
}

export function programmeRows(data: ProgrammeRepartitionData, rep: ProgrammeRepartition): ProgrammeRow[] {
  return data.families.map((f) => {
    const range = data.types[rep.type]?.ratios[f.key] ?? [0, 0, 0];
    const ratio = programmeRatio(data, rep, f.key);
    return { key: f.key, label: f.label, range: [range[0], range[2]], ratio, area: (rep.baseArea * ratio) / 100 };
  });
}

export interface ProgrammeTotals {
  baseArea: number;
  /** Somme des ratios des fonctions support (%). */
  supportPercent: number;
  supportArea: number;
  /** Solde programmable (%), jamais négatif. */
  netPercent: number;
  netArea: number;
}

export function programmeTotals(data: ProgrammeRepartitionData, rep: ProgrammeRepartition): ProgrammeTotals {
  const supportPercent = data.families.reduce((a, f) => a + programmeRatio(data, rep, f.key), 0);
  const netPercent = Math.max(0, 100 - supportPercent);
  return {
    baseArea: rep.baseArea,
    supportPercent,
    supportArea: (rep.baseArea * supportPercent) / 100,
    netPercent,
    netArea: (rep.baseArea * netPercent) / 100,
  };
}

// ---------------------------------------------------------------------------
// Cas de programme (bibliothèque des bâtiments) — sommes par famille
// ---------------------------------------------------------------------------

export const PROGRAMME_BUCKETS = ["principal", "circulation", "technique", "sanitaires", "convivialite", "supportAutres", "parois"] as const;
export type ProgrammeBucket = (typeof PROGRAMME_BUCKETS)[number];

/** Libellés des familles d'un cas de programme (`labels` de building-library-app). */
export const PROGRAMME_BUCKET_LABELS: Record<ProgrammeBucket, string> = {
  principal: "Espaces principaux",
  circulation: "Circulations / noyaux alloués",
  technique: "Technique",
  sanitaires: "Sanitaires",
  convivialite: "Accueil / convivialité",
  supportAutres: "Autres supports",
  parois: "Provision parois / gaines",
};

export interface ProgrammeSpace {
  name: string;
  quantity: number;
  unitArea: number;
  bucket?: string | undefined;
}

export interface ProgrammeSums extends Record<ProgrammeBucket, number> {
  support: number;
  programme: number;
  total: number;
}

/** `sums()` du prototype : surfaces par famille (quantité × surface unitaire), support, programme, total. Rejette une ligne invalide plutôt que de la compter zéro. */
export function programmeCaseSums(spaces: readonly ProgrammeSpace[]): ProgrammeSums {
  const out = Object.fromEntries(PROGRAMME_BUCKETS.map((k) => [k, 0])) as Record<ProgrammeBucket, number>;
  for (const s of spaces) {
    const q = Number(s.quantity);
    const a = Number(s.unitArea);
    if (!Number.isFinite(q) || !Number.isFinite(a) || q < 0 || a < 0) throw new Error("Surface ou quantité invalide : " + s.name);
    const bucket = (PROGRAMME_BUCKETS as readonly string[]).includes(s.bucket ?? "") ? (s.bucket as ProgrammeBucket) : "supportAutres";
    out[bucket] += q * a;
  }
  const support = out.circulation + out.technique + out.sanitaires + out.convivialite + out.supportAutres;
  const programme = out.principal + support;
  return { ...out, support, programme, total: programme + out.parois };
}
