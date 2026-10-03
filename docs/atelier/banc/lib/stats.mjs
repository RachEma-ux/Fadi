// Statistiques simples sur des échantillons de durées (ms). Percentile par rang le plus proche.
export function percentile(valeurs, p) {
  if (!valeurs.length) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(tri.length - 1, Math.max(0, Math.ceil((p / 100) * tri.length) - 1));
  return tri[rang];
}

export function resume(valeurs, decimales = 2) {
  const r = (x) => (x == null ? null : Number(x.toFixed(decimales)));
  if (!valeurs.length) return { n: 0 };
  const somme = valeurs.reduce((s, v) => s + v, 0);
  return {
    n: valeurs.length,
    min: r(Math.min(...valeurs)),
    p50: r(percentile(valeurs, 50)),
    p95: r(percentile(valeurs, 95)),
    max: r(Math.max(...valeurs)),
    moyenne: r(somme / valeurs.length),
  };
}

export const arrondi = (x, d = 2) => (x == null ? null : Number(x.toFixed(d)));
