/**
 * Motifs de hachure (D-072, fiche DA-01-11) : catalogue intégré de motifs à traits parallèles, définis en unités
 * papier (angle en degrés, pas en millimètres) — une convention graphique, jamais une donnée de projet (R3).
 * Dans une vue à l'échelle 1:E, le pas papier p mm devient p·E/1000 m dans le modèle ; au plan de travail, il suit
 * l'écran. Un motif inconnu (import) est dessiné avec le motif par défaut et signalé.
 */
import { aireSignee, type Vec } from "./geometrie.js";
import { pt, type Point2 } from "./unites.js";

export interface FamilleHachure {
  angle: number;
  pasMm: number;
}

export interface MotifHachure {
  libelle: string;
  familles: FamilleHachure[];
}

export const MOTIF_HACHURE_DEFAUT = "diagonale";

export const MOTIFS_HACHURE: Record<string, MotifHachure> = {
  diagonale: { libelle: "Diagonale 45°", familles: [{ angle: 45, pasMm: 2 }] },
  "diagonale-serree": { libelle: "Diagonale serrée", familles: [{ angle: 45, pasMm: 1 }] },
  "diagonale-inverse": { libelle: "Diagonale 135°", familles: [{ angle: 135, pasMm: 2 }] },
  croisee: { libelle: "Croisée", familles: [{ angle: 45, pasMm: 2 }, { angle: 135, pasMm: 2 }] },
  horizontale: { libelle: "Horizontale", familles: [{ angle: 0, pasMm: 2 }] },
  verticale: { libelle: "Verticale", familles: [{ angle: 90, pasMm: 2 }] },
  quadrillage: { libelle: "Quadrillage", familles: [{ angle: 0, pasMm: 3 }, { angle: 90, pasMm: 3 }] },
};

/** Motif retenu pour un nom (null ou inconnu : le motif par défaut, `connu` à faux pour un nom inconnu). */
export function motifHachure(nom: string | null | undefined): { id: string; motif: MotifHachure; connu: boolean } {
  if (nom && MOTIFS_HACHURE[nom]) return { id: nom, motif: MOTIFS_HACHURE[nom]!, connu: true };
  return { id: MOTIF_HACHURE_DEFAUT, motif: MOTIFS_HACHURE[MOTIF_HACHURE_DEFAUT]!, connu: !nom };
}

/**
 * Traits d'une famille de hachure dans un contour (règle pair-impair, trous compris) : droites d'angle `angleDeg`
 * espacées de `pas` (m), ancrées sur l'origine du repère local (le motif ne glisse pas quand le contour bouge
 * d'un pas entier). Au plus `max` traits.
 */
export function lignesHachure(contours: readonly (readonly Vec[])[], angleDeg: number, pas: number, max = 4000): [Point2, Point2][] {
  if (!(pas > 0)) return [];
  const a = (angleDeg * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const n = { x: -u.y, y: u.x };
  const polys = contours.filter((c) => c.length >= 3 && Math.abs(aireSignee(c)) > 1e-12);
  if (!polys.length) return [];
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const c of polys) for (const p of c) {
    const d = p.x * n.x + p.y * n.y;
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  const out: [Point2, Point2][] = [];
  for (let k = Math.ceil(dMin / pas); k * pas < dMax - 1e-9 && out.length < max; k++) {
    const d = k * pas;
    if (d <= dMin + 1e-9) continue; // droite d'appui du contour : aucun trait
    const ts: number[] = [];
    for (const c of polys) {
      for (let i = 0; i < c.length; i++) {
        const p = c[i]!;
        const q = c[(i + 1) % c.length]!;
        const dp = p.x * n.x + p.y * n.y - d;
        const dq = q.x * n.x + q.y * n.y - d;
        if ((dp < 0) === (dq < 0)) continue; // demi-ouvert : un sommet sur la droite compte une fois
        const s = dp / (dp - dq);
        const x = { x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s };
        ts.push(x.x * u.x + x.y * u.y);
      }
    }
    ts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length && out.length < max; i += 2) {
      if (ts[i + 1]! - ts[i]! < 1e-9) continue;
      const P = (t: number) => pt(Math.round((u.x * t + n.x * d) * 1e9) / 1e9, Math.round((u.y * t + n.y * d) * 1e9) / 1e9);
      out.push([P(ts[i]!), P(ts[i + 1]!)]);
    }
  }
  return out;
}
