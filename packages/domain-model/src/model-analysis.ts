/**
 * Lecture du modèle natif de l'Atelier — porté de `flow-v62` (`analyse`) et
 * de `harmony-app-v6` (`context`) du prototype : les locaux du modèle (chemins
 * de rôle « room » par niveau), leur surface calculée sur le polygone, leur
 * usage déduit du nom, la capacité inscrite au nom, le ratio, les ouvertures
 * au contact géométrique, le mobilier contenu, la lecture de conception et
 * le statut sous réserves ; les niveaux (dalles, locaux, poteaux, escaliers)
 * et l'empreinte du modèle (`nativeHash`, FNV-1a du modèle sémantique).
 *
 * Métrés dérivés, jamais recopiés ; les cibles de programme (liens de
 * locaux) restent distinctes. Aucun objet de dessin n'est généré ici ; les
 * repères sont ceux du modèle (local).
 */
import type { Point2 } from "@parcours/core-geometry";
import type { LocalHarmonieOption } from "./harmonie.js";

export interface NativeLevelLike {
  id: string;
  name?: string;
  elevation?: number;
  height?: number;
  [k: string]: unknown;
}

export interface NativePath {
  id: string;
  name?: string;
  role?: string;
  layer?: string;
  points?: Point2[];
  holes?: (Point2[] | { poly?: Point2[]; points?: Point2[] })[];
  [k: string]: unknown;
}

export interface NativeOpening {
  id: string;
  hostWallId?: string;
  t?: number;
  width?: number;
  height?: number;
  [k: string]: unknown;
}

export interface NativeWall {
  id: string;
  a: Point2;
  b: Point2;
  [k: string]: unknown;
}

export interface NativeLevelDesign {
  walls?: NativeWall[];
  doors?: NativeOpening[];
  windows?: NativeOpening[];
  paths?: NativePath[];
  rooms?: { code?: string; name?: string; [k: string]: unknown }[];
  columns?: unknown[];
  stairs?: unknown[];
  [k: string]: unknown;
}

export interface NativeFloorDesignLike {
  levels?: Record<string, NativeLevelDesign>;
  [k: string]: unknown;
}

export type RoomUsage = "reserve" | "circulation" | "sanitaire" | "office" | "technique" | "accueil" | "pause" | "formation" | "reunion" | "direction" | "bureau";

export interface ModelRoom {
  /** `niveau|objet` — identifiant du local dans le modèle. */
  id: string;
  objectId: string;
  level: string;
  levelName: string;
  name: string;
  area: number;
  usage: RoomUsage;
  capacity: number | null;
  ratio: number | null;
  width: number | null;
  doors: number;
  windows: number;
  furniture: number;
  target: number | null;
  delta: number | null;
  reading: string;
  status: string;
}

export interface ModelFloor {
  id: string;
  name: string;
  elevation: number | null;
  height: number | null;
  gross: number | null;
  slabNet: number | null;
  rooms: number;
  count: number;
  columns: number;
  stairs: number;
  voidArea: number | null;
}

export interface ModelAnalysis {
  nativeHash: string;
  floors: ModelFloor[];
  rooms: ModelRoom[];
}

// --- Géométrie (celle du prototype, telle quelle) ---------------------------

const dist = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** `stableArea` : aire non signée, origine relative au premier sommet. */
export function stableArea(poly: readonly Point2[] | undefined): number {
  if (!poly || poly.length < 3) return 0;
  const [ox, oy] = poly[0]!;
  return (
    Math.abs(
      poly.reduce((n, p, i) => {
        const q = poly[(i + 1) % poly.length]!;
        return n + (p[0] - ox) * (q[1] - oy) - (q[0] - ox) * (p[1] - oy);
      }, 0),
    ) / 2
  );
}

const holePoly = (h: Point2[] | { poly?: Point2[]; points?: Point2[] }): Point2[] => (Array.isArray(h) ? h : (h.poly ?? h.points ?? []));

/** `areaOf` : aire du chemin moins ses trous. */
export function pathArea(path: NativePath): number {
  return Math.max(0, stableArea(path.points ?? []) - (path.holes ?? []).reduce((s, h) => s + stableArea(holePoly(h)), 0));
}

export function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const n = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (n || 1)));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function boundaryDistance(p: Point2, poly: readonly Point2[] | undefined): number {
  return poly?.length ? Math.min(...poly.map((q, i) => pointSegmentDistance(p, q, poly[(i + 1) % poly.length]!))) : Infinity;
}

/** `E.pointIn` : point dans le polygone (bord inclus). */
export function pointInPolygon(p: Point2, poly: readonly Point2[]): boolean {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (n || 1)));
    if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 1e-5) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}

/** `E.center` : barycentre de surface (moyenne des sommets si dégénéré). */
export function polygonCenter(p: readonly Point2[]): Point2 {
  if (!p?.length) return [0, 0];
  const o = p[0]!;
  const q = p.map((a): Point2 => [a[0] - o[0], a[1] - o[1]]);
  let cross = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const c = a[0] * b[1] - b[0] * a[1];
    cross += c;
    x += (a[0] + b[0]) * c;
    y += (a[1] + b[1]) * c;
  }
  return Math.abs(cross) < 1e-9 ? [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length] : [o[0] + x / (3 * cross), o[1] + y / (3 * cross)];
}

/** `shortWidth` : petit côté d'un rectangle (quatre sommets, angles droits), sinon `null`. */
export function shortWidth(poly: readonly Point2[]): number | null {
  if (poly.length !== 4) return null;
  const a = poly.map((p, i) => dist(p, poly[(i + 1) % 4]!));
  const dx = poly[1]![0] - poly[0]![0];
  const dy = poly[1]![1] - poly[0]![1];
  const ex = poly[2]![0] - poly[1]![0];
  const ey = poly[2]![1] - poly[1]![1];
  return Math.abs(dx * ex + dy * ey) < 0.001 && Math.abs(a[0]! - a[2]!) < 0.005 && Math.abs(a[1]! - a[3]!) < 0.005 ? Math.min(...a) : null;
}

/** `E.hash` : FNV-1a 32 bits de la sérialisation JSON. */
export function fnv1a(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const VOLATILE_KEYS = new Set(["updated", "created", "updatedAt", "createdAt", "dateSaved", "lastSaved", "savedAt", "ui", "views"]);

/** `semantic` : le modèle sans ses champs volatils (dates, interface). */
export function semantic(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(semantic);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !VOLATILE_KEYS.has(k)).map(([k, x]) => [k, semantic(x)]));
  return v;
}

// --- Usages et lectures (textes du prototype) --------------------------------

/** `usage(r)` : l'usage déduit du nom du local. */
export function roomUsage(name: string): RoomUsage {
  const n = (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/adaptation/.test(n)) return "reserve";
  if (/desserte|distribution|galerie|degagement|liaison/.test(n)) return "circulation";
  if (/sanitaire/.test(n)) return "sanitaire";
  if (/office|cuisine/.test(n)) return "office";
  if (/archives|technique|maintenance|reserve|controle/.test(n)) return "technique";
  if (/accueil/.test(n)) return "accueil";
  if (/pause|salon/.test(n)) return "pause";
  if (/formation|atelier projet|polyvalent/.test(n)) return "formation";
  if (/reunion/.test(n)) return "reunion";
  if (/direction/.test(n)) return "direction";
  return "bureau";
}

export const ROOM_READINGS: Record<RoomUsage, string> = {
  formation: "Placer le formateur et les supports visuels pour percevoir les arrivées sans lumière frontale gênante ; distinguer travail collectif et retrait.",
  direction: "Tester un poste avec appui arrière et perception de l’entrée, sans exposer documents et écrans au passage.",
  bureau: "Conserver une circulation lisible derrière les postes, maîtriser reflets et bruit, alterner concentration et échanges.",
  accueil: "Conserver le seuil lisible et le comptoir identifiable ; placer l’attente hors du flux et éviter un axe traversant non maîtrisé.",
  reunion: "Favoriser visibilité mutuelle et accès non perturbant ; contrôler confidentialité et reflets.",
  pause: "Créer un retrait relatif aux zones actives ; traiter le bruit sans masquer l’accès et les sorties.",
  circulation: "Laisser les cheminements libres, continus et lisibles ; ne pas utiliser les dégagements comme correctifs décoratifs.",
  reserve: "Cette bande géométrique résiduelle n’est pas un poste occupable ; éviter toute capacité fictive.",
  sanitaire: "Examiner accès depuis circulation, intimité et ventilation ; ne pas déplacer ce service sur la seule base d’un secteur symbolique.",
  office: "Distinguer lavage, préparation et cuisson éventuelle ; ventilation, hygiène et sécurité priment sur la lecture Feu/Eau.",
  technique: "Protéger l’usage technique, les accès entretien et les occupants voisins ; aucune qualité du sol, de l’air ou de l’eau déduite de la forme.",
};

// --- Analyse ---------------------------------------------------------------

export interface RoomLinkTargets {
  /** `programmeCase.spaces` + `roomLinks` : cible de surface par local lié. */
  spaces: { id: string; quantity: number; unitArea: number }[];
  roomLinks: Record<string, string[]>;
}

/** `context().rooms` + `analyse().rooms` : les locaux du modèle, lus et qualifiés. */
export function analyseRooms(levels: readonly NativeLevelLike[], floor: NativeFloorDesignLike, programme: RoomLinkTargets | null = null): ModelRoom[] {
  const out: ModelRoom[] = [];
  for (const l of levels) {
    const m = floor.levels?.[l.id] ?? {};
    for (const path of m.paths ?? []) {
      if (path.role !== "room" || !Array.isArray(path.points) || path.points.length < 3) continue;
      const code = (path.name ?? "").split(" · ")[0];
      const meta = (m.rooms ?? []).find((r) => r.code === code);
      const name = path.name || meta?.name || "Espace";
      const area = pathArea(path);
      const u = roomUsage(name);
      const sampleOpen = (q: NativeOpening): Point2 | null => {
        const w = (m.walls ?? []).find((x) => x.id === q.hostWallId);
        return w ? [w.a[0] + (w.b[0] - w.a[0]) * (q.t ?? 0.5), w.a[1] + (w.b[1] - w.a[1]) * (q.t ?? 0.5)] : null;
      };
      const touching = (q: NativeOpening) => {
        const z = sampleOpen(q);
        return !!z && boundaryDistance(z, path.points) < 0.65;
      };
      const doors = (m.doors ?? []).filter(touching).length;
      const windows = (m.windows ?? []).filter(touching).length;
      const holes = (path.holes ?? []).map(holePoly);
      const furniture = (m.paths ?? []).filter((q) => q.role === "solid" && q.layer === "Mobilier" && (q.points?.length ?? 0) >= 3 && pointInPolygon(polygonCenter(q.points!), path.points!) && !holes.some((h) => pointInPolygon(polygonCenter(q.points!), h))).length;
      const capacityMatch = name.match(/(\d+)\s*(postes|places)/i);
      const capacity = capacityMatch ? Number(capacityMatch[1]) : null;
      const id = `${l.id}|${path.id}`;
      const related = programme ? programme.spaces.filter((s) => (programme.roomLinks[s.id] ?? []).includes(id)) : [];
      const target = related.length ? related.reduce((sum, s) => sum + s.quantity * s.unitArea, 0) : null;
      const ratio = capacity ? area / capacity : null;
      out.push({
        id,
        objectId: path.id,
        level: l.id,
        levelName: l.name || l.id,
        name,
        area,
        usage: u,
        capacity,
        ratio,
        width: shortWidth(path.points),
        doors,
        windows,
        furniture,
        target,
        delta: target === null ? null : area - target,
        reading: ROOM_READINGS[u],
        status:
          u === "bureau" && capacity && area / capacity < 6
            ? "Densité à tester (H-MEZZ)"
            : u === "reserve"
              ? "Réserve géométrique, sans capacité"
              : !windows && (u === "formation" || u === "bureau" || u === "direction")
                ? "Apport de lumière à vérifier"
                : "Lecture de conception sous réserves",
      });
    }
  }
  return out;
}

/** `analyse().floors` : niveaux avec dalles (brut, net, vides), locaux, poteaux et escaliers. */
export function analyseFloors(levels: readonly NativeLevelLike[], floor: NativeFloorDesignLike, rooms: readonly ModelRoom[]): ModelFloor[] {
  return levels.map((l) => {
    const m = floor.levels?.[l.id] ?? {};
    const slabs = (m.paths ?? []).filter((q) => q.role === "floor-slab");
    const levelRooms = rooms.filter((r) => r.level === l.id);
    return {
      id: l.id,
      name: l.name || l.id,
      elevation: typeof l.elevation === "number" ? l.elevation : null,
      height: typeof l.height === "number" ? l.height : null,
      gross: slabs.length ? slabs.reduce((s, q) => s + stableArea(q.points ?? []), 0) : null,
      slabNet: slabs.length ? slabs.reduce((s, q) => s + pathArea(q), 0) : null,
      rooms: levelRooms.reduce((s, r) => s + r.area, 0),
      count: levelRooms.length,
      columns: (m.columns ?? []).length,
      stairs: (m.stairs ?? []).length,
      voidArea: slabs.length ? slabs.reduce((s, q) => s + (q.holes ?? []).reduce((n, h) => n + stableArea(holePoly(h)), 0), 0) : null,
    };
  });
}

export interface ModelAnalysisInput {
  nativeId: string;
  levels: readonly NativeLevelLike[];
  floor: NativeFloorDesignLike;
  parcel?: unknown;
  footprint?: unknown;
  programme?: RoomLinkTargets | null;
}

export function analyseModel(input: ModelAnalysisInput): ModelAnalysis {
  const rooms = analyseRooms(input.levels, input.floor, input.programme ?? null);
  return {
    nativeHash: fnv1a(semantic({ id: input.nativeId, parcel: input.parcel ?? null, levels: input.levels, floor: input.floor, footprint: input.footprint ?? [], solarSite: null })),
    floors: analyseFloors(input.levels, input.floor, rooms),
    rooms,
  };
}

// --- Propositions localisées (h7-app `buildProposals`, étapes 10 et 11) ---

const fmtFr2 = (v: number | null, n = 2) => (Number.isFinite(v as number) ? (v as number).toLocaleString("fr-FR", { maximumFractionDigits: n }) : "—");

/**
 * Les propositions localisées d'une étape de conception (10 : Atelier, 11 :
 * Esquisse) : un local par proposition, hors réserves, circulations et
 * techniques, 100 au plus ; un bureau sous 6 m² par poste est un cas de
 * densité à tester.
 */
export function localHarmonieOptions(analysis: ModelAnalysis, stepNumber: 10 | 11, usageText: string): LocalHarmonieOption[] {
  return analysis.rooms
    .filter((r) => !["reserve", "circulation", "technique"].includes(r.usage))
    .slice(0, 100)
    .map((room) => {
      const dense = room.usage === "bureau" && !!room.ratio && room.ratio < 6;
      return {
        key: room.id,
        roomId: room.id,
        objectId: room.objectId,
        title: `${room.levelName} · ${room.name}`,
        text: dense ? `Tester une capacité inférieure aux ${room.capacity} postes indiqués ou transférer une partie de l’activité vers une zone réellement disponible. Aucun déplacement de géométrie n’est imposé.` : room.reading,
        why: `${fmtFr2(room.area)} m² calculés sur le polygone${room.capacity ? ` ; ${room.capacity} postes/places inscrits au nom ; ${fmtFr2(room.ratio)} m² par unité` : ""}. ${usageText}`,
        benefit: dense ? "Comparer une densité et des passages réellement utilisables." : "Rendre l’usage cohérent avec les ouvertures, l’accès et les mouvements.",
        tradeoff: "Ajustement à tester sur plan ; conséquences de capacité et de réseaux à examiner.",
        conditions: "Comptages et proximité aux ouvertures sont des indices géométriques, pas une certification. La capacité du nom doit être confirmée.",
        source: `Modèle ${analysis.nativeHash} · objet ${room.objectId}`,
        targets: stepNumber === 10 ? [11, 13, 16] : [13, 16, 18],
      };
    });
}

/** `recommended(10)` : un cas de densité dans le modèle oriente vers la proposition C. */
export function recommendedDesignOption(analysis: ModelAnalysis | null): { key: string; reason: string } {
  if (analysis?.rooms.some((r) => r.ratio && r.ratio < 6 && r.usage === "bureau")) {
    return { key: "C", reason: "Le modèle comporte un cas de densité à examiner : tester l’usage dans la géométrie conservée avant une intervention lourde." };
  }
  return { key: "A", reason: "Parti de départ visant les intentions documentées et une intervention limitée ; à arbitrer avec les alternatives." };
}
