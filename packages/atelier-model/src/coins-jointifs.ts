/**
 * Raccord et chanfrein multiples (D-094, DA-02-10, DA-02-11) : coins formés par des lignes et des arcs d'esquisse
 * jointifs (une extrémité de l'un sur une extrémité de l'autre). Chaque extrémité sert à un seul coin ; l'ordre suit
 * la sélection. Pur : la commande reste `transformer.raccorder` ou `transformer.chanfreiner`, une par coin, dans un lot.
 */
import type { ModeleAtelier } from "./modele.js";

type P = { x: number; y: number };

function extremitesEsquisse(etat: ModeleAtelier, id: string): [P, P] | null {
  const o = etat.objets[id];
  if (!o || o.classe !== "esquisse") return null;
  const q = o.params as { forme: string; points: P[]; centre: P | null; rayon: { value: number } | null; angleDebut: { value: number } | null; angleFin: { value: number } | null };
  if (q.forme === "ligne" && q.points.length === 2) return [q.points[0]!, q.points[1]!];
  if (q.forme === "arc" && q.centre && q.rayon) {
    const at = (deg: number): P => ({ x: q.centre!.x + q.rayon!.value * Math.cos((deg * Math.PI) / 180), y: q.centre!.y + q.rayon!.value * Math.sin((deg * Math.PI) / 180) });
    return [at(q.angleDebut?.value ?? 0), at(q.angleFin?.value ?? 360)];
  }
  return null;
}

export function coinsJointifs(etat: ModeleAtelier, ids: readonly string[], tolerance = 1e-6): [string, string][] {
  const elements = ids.map((id) => ({ id, x: extremitesEsquisse(etat, id) })).filter((e): e is { id: string; x: [P, P] } => !!e.x);
  const pris = new Set<string>();
  const coins: [string, string][] = [];
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i]!;
      const b = elements[j]!;
      // Un seul coin par paire (deux arcs fermés l'un sur l'autre n'en donnent qu'un : le plus proche suffit).
      let fait = false;
      for (let k = 0; k < 2 && !fait; k++) for (let l = 0; l < 2 && !fait; l++) {
        if (pris.has(`${a.id}#${k}`) || pris.has(`${b.id}#${l}`)) continue;
        if (Math.hypot(a.x[k]!.x - b.x[l]!.x, a.x[k]!.y - b.x[l]!.y) > tolerance) continue;
        pris.add(`${a.id}#${k}`);
        pris.add(`${b.id}#${l}`);
        coins.push([a.id, b.id]);
        fait = true;
      }
    }
  }
  return coins;
}
