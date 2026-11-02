/**
 * Évaluation conjointe d'une optimisation (INV-007) : une optimisation n'est acceptée que si elle préserve les résultats
 * métier **dans les tolérances déclarées** ET si sa performance est mesurée avant / après. Les deux implémentations
 * (référence et optimisée) sont jouées sur le même corpus ; pour chaque cas, chaque résultat métier déclaré (cibles
 * d'accrochage, quantités, historique, export…) est comparé selon sa tolérance (`exacte` : égalité du JSON stable ;
 * `absolue` : écart numérique ≤ valeur, champ par champ) ; la durée de chaque appel est relevée pour le p95.
 *
 * Verdict : `rejetee` dès qu'un résultat sort de sa tolérance (quel que soit le gain de p95) ou qu'un résultat déclaré
 * n'a pas de tolérance ; `sans-gain` si les résultats sont préservés mais que le p95 n'est pas meilleur ; `acceptee`
 * sinon. Le p95 mesuré ici est celui du processus qui exécute (banc local ou CI), pas un engagement de capacité. Pur, sauf
 * l'horloge injectée (`maintenant`, par défaut `performance.now`).
 */
export type StudioToleranceOptimisation = { type: "exacte" } | { type: "absolue"; valeur: number };

export interface StudioCritereOptimisation<R> {
  /** Nom du résultat métier (« cibles d'accrochage », « quantités », « historique », « export »…). */
  nom: string;
  extraire: (resultat: R) => unknown;
  tolerance?: StudioToleranceOptimisation;
}

export interface StudioCasOptimisation<E> { nom: string; entree: E }

export interface StudioEvaluationOptimisation {
  schema: "studio-evaluation-optimisation/1";
  cas: number;
  repetitions: number;
  p95: { reference: number; optimisee: number; gain: number };
  criteres: { nom: string; tolerance: StudioToleranceOptimisation | null; conformes: number; ecarts: { cas: string; detail: string }[] }[];
  verdict: "acceptee" | "rejetee" | "sans-gain";
  motifs: string[];
}

const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

/** Écart numérique maximal entre deux valeurs de même forme ; `null` si leurs formes diffèrent. */
function ecartMax(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : a === b ? 0 : Infinity;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return null;
    let m = 0;
    for (let i = 0; i < a.length; i++) { const e = ecartMax(a[i], b[i]); if (e === null) return null; m = Math.max(m, e); }
    return m;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join("|") !== kb.join("|")) return null;
    let m = 0;
    for (const k of ka) { const e = ecartMax((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]); if (e === null) return null; m = Math.max(m, e); }
    return m;
  }
  return stable(a) === stable(b) ? 0 : null;
}

export function studioP95(durees: readonly number[]): number {
  if (!durees.length) return Number.NaN;
  const t = [...durees].sort((x, y) => x - y);
  return t[Math.min(t.length - 1, Math.ceil(0.95 * t.length) - 1)]!;
}

export function studioEvaluerOptimisation<E, R>(o: {
  reference: (e: E) => R;
  optimisee: (e: E) => R;
  corpus: readonly StudioCasOptimisation<E>[];
  criteres: readonly StudioCritereOptimisation<R>[];
  repetitions?: number;
  maintenant?: () => number;
}): StudioEvaluationOptimisation {
  const maintenant = o.maintenant ?? (() => performance.now());
  const repetitions = Math.max(1, o.repetitions ?? 5);
  const dr: number[] = [], dopt: number[] = [];
  const criteres = o.criteres.map((c) => ({ nom: c.nom, tolerance: c.tolerance ?? null, conformes: 0, ecarts: [] as { cas: string; detail: string }[] }));
  const motifs: string[] = [];
  for (const c of o.criteres) if (!c.tolerance) motifs.push(`aucune tolérance déclarée pour « ${c.nom} »`);
  for (const cas of o.corpus) {
    let rRef: R | undefined, rOpt: R | undefined;
    for (let i = 0; i < repetitions; i++) {
      let t = maintenant(); rRef = o.reference(cas.entree); dr.push(maintenant() - t);
      t = maintenant(); rOpt = o.optimisee(cas.entree); dopt.push(maintenant() - t);
    }
    o.criteres.forEach((c, i) => {
      const a = c.extraire(rRef as R), b = c.extraire(rOpt as R);
      const tol = c.tolerance;
      let ok: boolean, detail = "";
      if (!tol) { ok = false; detail = "tolérance non déclarée"; }
      else if (tol.type === "exacte") { ok = stable(a) === stable(b); if (!ok) detail = "résultat différent (égalité exacte exigée)"; }
      else {
        const e = ecartMax(a, b);
        ok = e !== null && e <= tol.valeur;
        if (!ok) detail = e === null ? "formes de résultat différentes" : `écart ${e} > tolérance ${tol.valeur}`;
      }
      if (ok) criteres[i]!.conformes++; else criteres[i]!.ecarts.push({ cas: cas.nom, detail });
    });
  }
  const p95r = studioP95(dr), p95o = studioP95(dopt);
  for (const c of criteres) if (c.ecarts.length) motifs.push(`« ${c.nom} » hors tolérance sur ${c.ecarts.length} cas`);
  const verdict = motifs.length ? "rejetee" : p95o < p95r ? "acceptee" : "sans-gain";
  if (verdict === "sans-gain") motifs.push(`p95 non amélioré (${p95o.toFixed(3)} ms ≥ ${p95r.toFixed(3)} ms)`);
  return { schema: "studio-evaluation-optimisation/1", cas: o.corpus.length, repetitions, p95: { reference: p95r, optimisee: p95o, gain: p95r - p95o }, criteres, verdict, motifs };
}
