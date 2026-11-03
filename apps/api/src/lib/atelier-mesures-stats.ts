/** Statistiques de la mesure du verrou de projet de l'Atelier (BD-9) — logique pure. */
export interface StatistiquesVerrou {
  readonly nature: string;
  readonly n: number;
  readonly tenueMedianeMs: number;
  readonly tenueP95Ms: number;
  readonly tenueMaxMs: number;
  readonly attenteP95Ms: number;
  /** Part des écritures dont la tenue dépasse le seuil (critère proposé : plus de 5 % au-delà de 250 ms). */
  readonly partAuDelaDuSeuil: number;
}

/** Centile par rang le plus proche (valeurs triées ou non) ; null sans valeur. */
export function centile(valeurs: readonly number[], p: number): number | null {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))]!;
}

/** Statistiques par nature d'écriture (fonction pure, testée). */
export function statistiquesVerrou(lignes: readonly { nature: string; attente_ms: number; tenue_ms: number }[], seuilMs = 250): StatistiquesVerrou[] {
  const parNature = new Map<string, { a: number[]; t: number[] }>();
  for (const l of lignes) {
    const g = parNature.get(l.nature) ?? { a: [], t: [] };
    g.a.push(l.attente_ms); g.t.push(l.tenue_ms);
    parNature.set(l.nature, g);
  }
  return [...parNature.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([nature, g]) => ({
    nature, n: g.t.length,
    tenueMedianeMs: centile(g.t, 50)!, tenueP95Ms: centile(g.t, 95)!, tenueMaxMs: Math.max(...g.t), attenteP95Ms: centile(g.a, 95)!,
    partAuDelaDuSeuil: g.t.filter((x) => x > seuilMs).length / g.t.length,
  }));
}
