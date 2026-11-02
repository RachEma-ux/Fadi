/**
 * Subdivision de Loop d'un maillage triangulaire — géométrie pure, **neutre** : aucun import, partagée par l'Atelier
 * (surface libre P2-6, `geometrie-3d.ts` la réexporte) et par Studio (surface de subdivision, X.1-05) sans que l'un
 * importe l'autre. Déplacée telle quelle depuis `geometrie-3d.ts` (W3-C) : mêmes poids, même ordre des sommets.
 */
type V3 = [number, number, number];
export interface MaillageLoop { positions: number[]; indices: number[] }

/**
 * Subdivision de Loop d'un maillage triangulaire (DA-03-05) : chaque triangle devient quatre ; sommets lissés (poids de
 * Loop, bord fixé par la règle 1/8–3/4–1/8 sur les arêtes de bord). Pure et déterministe.
 */
export function subdiviserLoop(positions: readonly number[], triangles: readonly (readonly [number, number, number])[], niveaux: number): MaillageLoop {
  let P: V3[] = []; for (let i = 0; i < positions.length; i += 3) P.push([positions[i]!, positions[i + 1]!, positions[i + 2]!]);
  let T: [number, number, number][] = triangles.map((t) => [t[0], t[1], t[2]]);
  for (let it = 0; it < niveaux; it++) {
    const cle = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const opposes = new Map<string, number[]>();
    const voisins = new Map<number, Set<number>>();
    for (const [a, b, c] of T) {
      for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]] as [number, number, number][]) {
        const k = cle(u, v);
        opposes.set(k, [...(opposes.get(k) ?? []), w]);
        if (!voisins.has(u)) voisins.set(u, new Set()); voisins.get(u)!.add(v);
        if (!voisins.has(v)) voisins.set(v, new Set()); voisins.get(v)!.add(u);
      }
    }
    const bord = new Set<number>();
    for (const [k, op] of opposes) if (op.length === 1) { const [u, v] = k.split("|").map(Number) as [number, number]; bord.add(u); bord.add(v); }
    // Sommets existants déplacés.
    const Q: V3[] = P.map((p, i) => {
      const vs = [...(voisins.get(i) ?? [])];
      if (!vs.length) return p;
      if (bord.has(i)) {
        const vb = vs.filter((v) => bord.has(v) && opposes.get(cle(i, v))!.length === 1);
        if (vb.length !== 2) return p;
        const [a, b] = [P[vb[0]!]!, P[vb[1]!]!];
        return [0.75 * p[0] + 0.125 * (a[0] + b[0]), 0.75 * p[1] + 0.125 * (a[1] + b[1]), 0.75 * p[2] + 0.125 * (a[2] + b[2])];
      }
      const k = vs.length;
      const beta = k === 3 ? 3 / 16 : (1 / k) * (5 / 8 - (3 / 8 + 0.25 * Math.cos((2 * Math.PI) / k)) ** 2);
      const s = vs.reduce<V3>((acc, v) => [acc[0] + P[v]![0], acc[1] + P[v]![1], acc[2] + P[v]![2]], [0, 0, 0]);
      return [(1 - k * beta) * p[0] + beta * s[0], (1 - k * beta) * p[1] + beta * s[1], (1 - k * beta) * p[2] + beta * s[2]];
    });
    // Points d'arête.
    const milieu = new Map<string, number>();
    const pointArete = (u: number, v: number): number => {
      const k = cle(u, v);
      const deja = milieu.get(k);
      if (deja !== undefined) return deja;
      const op = opposes.get(k) ?? [];
      const a = P[u]!, b = P[v]!;
      let q: V3;
      if (op.length === 2) { const c = P[op[0]!]!, d = P[op[1]!]!; q = [0.375 * (a[0] + b[0]) + 0.125 * (c[0] + d[0]), 0.375 * (a[1] + b[1]) + 0.125 * (c[1] + d[1]), 0.375 * (a[2] + b[2]) + 0.125 * (c[2] + d[2])]; }
      else q = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      Q.push(q);
      milieu.set(k, Q.length - 1);
      return Q.length - 1;
    };
    const T2: [number, number, number][] = [];
    for (const [a, b, c] of T) {
      const ab = pointArete(a, b), bc = pointArete(b, c), ca = pointArete(c, a);
      T2.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    P = Q; T = T2;
  }
  return { positions: P.flat(), indices: T.flat() };
}

