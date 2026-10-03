/**
 * Aperçu conceptuel du bâtiment conçu : une axonométrie éclatée dessinée
 * depuis les polygones réels du modèle (parcelle, recul, emprise, locaux de
 * chaque niveau colorés par usage, murs extrudés à la hauteur du niveau,
 * nord). Proportions calculées, jamais un rendu : aucun arbre, aucune façade,
 * aucun élément qui ne vienne des données du projet. Vide tant que rien
 * n'est dessiné.
 *
 * Pure (SVG en chaîne), indépendante de React, même entrée que les plans de
 * lecture (`designPlanSvg`).
 */
import type { Point2 } from "@parcours/core-geometry";
import { toLocal, type DesignAnalysis, type DesignReviewInput } from "./design-review.js";
import type { NativeWall } from "./model-analysis.js";

export interface ConceptPreview {
  /** SVG complet (`viewBox`, sans dimensions fixes) ; `null` sans emprise ni local dessiné. */
  svg: string | null;
  /** Plan compact (sans texte) du niveau de référence : le RDC s'il existe, sinon le premier niveau ; `null` sans modèle. */
  plan: string | null;
  planLevel: string | null;
  levels: number;
  rooms: number;
  walls: number;
  nativeHash: string;
}

const ROOM_FILL: Record<string, string> = { formation: "#cfe3e6", bureau: "#e4e6c0", direction: "#d9ccb2", accueil: "#ecd9b3", pause: "#e6d6bf", reunion: "#cfdfc8", circulation: "#efe9d2", sanitaire: "#d2e2e1", office: "#d2e2e1", technique: "#d9dbdf", reserve: "#f0efe4" };

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
/** Décalage vertical supplémentaire entre deux niveaux (m), pour la lecture éclatée. */
const EXPLODE = 2.2;
const DEFAULT_HEIGHT = 3;
/** Les murs sont coupés à hauteur d'appui (convention de l'axonométrie de plan) : les locaux restent lisibles. */
const WALL_CUT = 1.5;

type P3 = [number, number, number];

/** Projection isométrique : +x vers la droite et le haut, +y vers la gauche et le haut, z vers le haut (observateur au sud-ouest). */
const project = (p: P3): Point2 => [(p[0] - p[1]) * COS30, -(p[0] + p[1]) * SIN30 - p[2]];

const depth = (p: Point2): number => p[0] + p[1];

const area = (pol: readonly Point2[]): number => Math.abs(pol.reduce((acc, p, i) => acc + (p[0] * pol[(i + 1) % pol.length]![1] - pol[(i + 1) % pol.length]![0] * p[1]), 0)) / 2;

export function conceptAxonometricSvg(input: DesignReviewInput, r: DesignAnalysis): ConceptPreview {
  const parcel = toLocal(input.parcel?.vertices ?? [], r.origin);
  const envelope = toLocal(input.parcel?.setback?.envelope ?? [], r.origin);
  const footprint = toLocal(input.footprint, r.origin);
  const levels = [...r.floors].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
  const roomsByLevel = new Map<string, typeof r.rooms>();
  for (const room of r.rooms) roomsByLevel.set(room.level, [...(roomsByLevel.get(room.level) ?? []), room]);
  const wallsByLevel = new Map<string, NativeWall[]>();
  let wallCount = 0;
  for (const f of levels) {
    const walls = (input.floor.levels?.[f.id]?.walls ?? []).filter((w) => Array.isArray(w.a) && Array.isArray(w.b));
    wallsByLevel.set(f.id, walls);
    wallCount += walls.length;
  }
  const planLevel = levels.find((f) => f.id === "rdc") ?? levels.find((f) => (roomsByLevel.get(f.id) ?? []).length > 0) ?? levels[0] ?? null;
  const plan = planLevel ? conceptPlanSvg(parcel, envelope, footprint, roomsByLevel.get(planLevel.id) ?? [], wallsByLevel.get(planLevel.id) ?? []) : null;
  const empty: ConceptPreview = { svg: null, plan, planLevel: planLevel?.name ?? planLevel?.id ?? null, levels: levels.length, rooms: r.rooms.length, walls: wallCount, nativeHash: r.nativeHash };
  if (!footprint.length && !r.rooms.length) return empty;

  // Niveaux : altitude réelle + éclatement progressif ; hauteur réelle ou 3 m.
  const base = levels[0]?.elevation ?? 0;
  const footprintArea = area(footprint);
  // Dalle à l'emprise seulement quand le niveau l'occupe (une mezzanine partielle n'est dessinée que par ses locaux).
  const slabOf = (index: number): boolean => footprint.length > 0 && !(levels[index]?.gross && footprintArea > 0 && levels[index]!.gross! < 0.8 * footprintArea);
  const zOf = (index: number): number => ((levels[index]?.elevation ?? base) - base) + index * EXPLODE;
  const hOf = (index: number): number => Math.min(WALL_CUT, levels[index]?.height ?? DEFAULT_HEIGHT);

  // Points projetés pour le cadrage.
  const projected: Point2[] = [];
  const lift = (pol: readonly Point2[], z: number): Point2[] => pol.map((p) => project([p[0], p[1], z]));
  const pushAll = (pts: Point2[]) => projected.push(...pts);
  pushAll(lift(parcel, 0));
  pushAll(lift(envelope, 0));
  pushAll(lift(footprint, 0));
  levels.forEach((f, i) => {
    if (slabOf(i)) pushAll(lift(footprint, zOf(i)));
    for (const room of roomsByLevel.get(f.id) ?? []) pushAll(lift(room.points, zOf(i)));
    for (const w of wallsByLevel.get(f.id) ?? []) pushAll(lift([w.a, w.b], zOf(i) + hOf(i)));
  });
  if (!projected.length) return empty;
  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const W = 960;
  const pad = 36;
  const labelRoom = 150;
  const k = (W - 2 * pad - labelRoom) / Math.max(1e-6, xmax - xmin);
  const H = Math.max(420, Math.min(760, Math.round((ymax - ymin) * k + 2 * pad)));
  const kk = Math.min(k, (H - 2 * pad) / Math.max(1e-6, ymax - ymin));
  const ox = pad + ((W - 2 * pad - labelRoom) - (xmax - xmin) * kk) / 2;
  const oy = pad + ((H - 2 * pad) - (ymax - ymin) * kk) / 2;
  const sx = (p: Point2): number => ox + (p[0] - xmin) * kk;
  const sy = (p: Point2): number => oy + (p[1] - ymin) * kk;
  const path = (pol: readonly Point2[], z: number): string =>
    pol
      .map((p) => {
        const q = project([p[0], p[1], z]);
        return `${sx(q).toFixed(1)},${sy(q).toFixed(1)}`;
      })
      .join(" ");

  const parts: string[] = [];
  // Sol : parcelle, recul, ombre de l'emprise.
  if (parcel.length) parts.push(`<polygon points="${path(parcel, 0)}" fill="#e6ede4" stroke="#9db3a4" stroke-width="1.2"/>`);
  if (envelope.length) parts.push(`<polygon points="${path(envelope, 0)}" fill="none" stroke="#a89262" stroke-width="1" stroke-dasharray="6 4"/>`);
  if (footprint.length) parts.push(`<polygon points="${path(footprint, 0)}" fill="#cbd6cc" stroke="#8fa497" stroke-width="1"/>`);

  // Niveaux, du bas vers le haut (peintre).
  levels.forEach((f, i) => {
    const z = zOf(i);
    const h = hOf(i);
    const rooms = roomsByLevel.get(f.id) ?? [];
    const walls = [...(wallsByLevel.get(f.id) ?? [])].sort((a, b) => depth([(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2]) - depth([(a.a[0] + a.b[0]) / 2, (a.a[1] + a.b[1]) / 2]));
    parts.push(`<g data-level="${esc(f.id)}">`);
    if (slabOf(i)) {
      // Épaisseur de dalle : face inférieure décalée, puis dessus.
      parts.push(`<polygon points="${path(footprint, z - 0.3)}" fill="#b9c6bb" stroke="#7f968a" stroke-width=".8"/>`);
      parts.push(`<polygon points="${path(footprint, z)}" fill="#f7f5ec" stroke="#2f4a40" stroke-width="1.4"/>`);
    }
    for (const room of rooms) {
      parts.push(`<polygon points="${path(room.points, z)}" fill="${ROOM_FILL[room.usage] ?? "#f0efe4"}" stroke="#7b8d84" stroke-width=".7"/>`);
      for (const hole of room.holes) parts.push(`<polygon points="${path(hole, z)}" fill="#f7f5ec" stroke="#9aa9a2" stroke-width=".6"/>`);
    }
    for (const w of walls) {
      const quad: string = [project([w.a[0], w.a[1], z]), project([w.b[0], w.b[1], z]), project([w.b[0], w.b[1], z + h]), project([w.a[0], w.a[1], z + h])].map((q) => `${sx(q).toFixed(1)},${sy(q).toFixed(1)}`).join(" ");
      parts.push(`<polygon points="${quad}" fill="rgba(47,74,64,0.16)" stroke="#2f4a40" stroke-width=".7" stroke-linejoin="round"/>`);
    }
    // Étiquette du niveau à droite de la dalle (coin est : x − y maximal).
    const anchor = (footprint.length ? footprint : rooms.flatMap((q) => q.points)).reduce<Point2 | null>((best, p) => (!best || p[0] - p[1] > best[0] - best[1] ? p : best), null);
    if (anchor) {
      const q = project([anchor[0], anchor[1], z]);
      const label = `${f.name || f.id}${f.gross ? ` · ${Math.round(f.gross)} m²` : ""}`;
      parts.push(`<line x1="${sx(q).toFixed(1)}" y1="${sy(q).toFixed(1)}" x2="${(sx(q) + 22).toFixed(1)}" y2="${sy(q).toFixed(1)}" stroke="#41584f" stroke-width=".8"/><text x="${(sx(q) + 27).toFixed(1)}" y="${(sy(q) + 4).toFixed(1)}" font-size="12" fill="#41584f">${esc(label)}</text>`);
    }
    parts.push("</g>");
  });

  // Nord : géographique si géoréférencé (H-GEO), sinon nord de grille ; vecteur projeté comme le reste.
  const north = r.geo?.projectNorth ?? 0;
  const rad = (north * Math.PI) / 180;
  const nv: Point2 = [Math.sin(rad), Math.cos(rad)];
  const n0 = project([0, 0, 0]);
  const n1 = project([nv[0] * 6, nv[1] * 6, 0]);
  const dx = (n1[0] - n0[0]) * kk;
  const dy = (n1[1] - n0[1]) * kk;
  const len = Math.hypot(dx, dy) || 1;
  const ax = W - 60;
  const ay = 70;
  const ux = (dx / len) * 34;
  const uy = (dy / len) * 34;
  parts.push(`<g><line x1="${ax}" y1="${ay}" x2="${(ax + ux).toFixed(1)}" y2="${(ay + uy).toFixed(1)}" stroke="#294b3d" stroke-width="1.6"/><circle cx="${ax}" cy="${ay}" r="2.2" fill="#294b3d"/><text x="${(ax + ux * 1.35).toFixed(1)}" y="${(ay + uy * 1.35 + 4).toFixed(1)}" font-size="13" text-anchor="middle" fill="#294b3d">N</text><text x="${ax}" y="${ay + 52}" font-size="10" text-anchor="middle" fill="#5c6f6b">${r.geo ? "nord géographique (H-GEO)" : "nord de grille"}</text></g>`);

  const title = `Aperçu conceptuel · axonométrie éclatée des ${levels.length} niveau(x) du modèle ${r.nativeHash} — proportions calculées, pas un rendu`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><rect width="${W}" height="${H}" fill="#f6f8f3"/>${parts.join("")}</svg>`;
  return { svg, plan, planLevel: planLevel?.name ?? planLevel?.id ?? null, levels: levels.length, rooms: r.rooms.length, walls: wallCount, nativeHash: r.nativeHash };
}

/** Plan compact d'un niveau (vignette) : parcelle, recul, emprise, locaux par usage, murs — aucun texte. Repère local, y vers le haut. */
export function conceptPlanSvg(parcel: readonly Point2[], envelope: readonly Point2[], footprint: readonly Point2[], rooms: readonly { points: Point2[]; holes: Point2[][]; usage: string }[], walls: readonly NativeWall[]): string | null {
  const all = [...parcel, ...footprint, ...rooms.flatMap((q) => q.points)];
  if (!all.length) return null;
  const xmin = Math.min(...all.map((p) => p[0]));
  const xmax = Math.max(...all.map((p) => p[0]));
  const ymin = Math.min(...all.map((p) => p[1]));
  const ymax = Math.max(...all.map((p) => p[1]));
  const W = 320;
  const H = 240;
  const pad = 12;
  const k = Math.min((W - 2 * pad) / Math.max(1e-6, xmax - xmin), (H - 2 * pad) / Math.max(1e-6, ymax - ymin));
  const ox = pad + ((W - 2 * pad) - (xmax - xmin) * k) / 2;
  const oy = pad + ((H - 2 * pad) - (ymax - ymin) * k) / 2;
  const pt = (p: Point2): string => `${(ox + (p[0] - xmin) * k).toFixed(1)},${(H - oy - (p[1] - ymin) * k).toFixed(1)}`;
  const ps = (pol: readonly Point2[]): string => pol.map(pt).join(" ");
  const parts: string[] = [];
  if (parcel.length) parts.push(`<polygon points="${ps(parcel)}" fill="#e6ede4" stroke="#9db3a4" stroke-width="1"/>`);
  if (envelope.length) parts.push(`<polygon points="${ps(envelope)}" fill="none" stroke="#a89262" stroke-width=".8" stroke-dasharray="4 3"/>`);
  if (footprint.length) parts.push(`<polygon points="${ps(footprint)}" fill="#f7f5ec" stroke="#2f4a40" stroke-width="1.2"/>`);
  for (const q of rooms) {
    parts.push(`<polygon points="${ps(q.points)}" fill="${ROOM_FILL[q.usage] ?? "#f0efe4"}" stroke="#7b8d84" stroke-width=".6"/>`);
    for (const hole of q.holes) parts.push(`<polygon points="${ps(hole)}" fill="#f7f5ec" stroke="#9aa9a2" stroke-width=".5"/>`);
  }
  for (const w of walls) parts.push(`<line x1="${pt(w.a).split(",")[0]}" y1="${pt(w.a).split(",")[1]}" x2="${pt(w.b).split(",")[0]}" y2="${pt(w.b).split(",")[1]}" stroke="#2f4a40" stroke-width="1.1"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plan du niveau de référence, depuis les polygones réels"><rect width="${W}" height="${H}" fill="#f6f8f3"/>${parts.join("")}</svg>`;
}
