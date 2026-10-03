/**
 * Connexion MapTiler du prototype (h7-app `getKey` / `showMap` /
 * `collectElevation`, flow-v62 `collectElevation`), appelée depuis le
 * navigateur avec la clé de l'utilisateur, seulement à sa demande :
 *
 * - la clé est celle déjà configurée dans l'outil Parcelle (même origine,
 *   `localStorage["parcelle-maptiler-key-v1"]`) ou une clé de session
 *   saisie dans « Connexion MapTiler » (conservée localement sur demande) ;
 *   elle n'est jamais envoyée à l'API Fadi ni incluse dans un rapport ;
 * - les requêtes vont uniquement vers `https://api.maptiler.com`
 *   (`credentials: omit`, sans référent), avec un délai de 15 s ;
 * - une réponse altimétrique est contrôlée point par point (coordonnées
 *   concordantes à 0,0001°) avant d'être transmise à l'API comme donnée
 *   déclarée « Modèle de terrain · non relevé topographique » ;
 * - aucune image ni altitude n'est inventée : sans clé ou sans
 *   géolocalisation, l'écran le dit.
 */
export const MAPTILER_KEY_STORAGE = "parcelle-maptiler-key-v1";
const SESSION_KEY = "fadi.maptiler.session-key";
const HOST = "api.maptiler.com";

export function maptilerKey(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(MAPTILER_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

/** « Utiliser cette clé » : en mémoire de session, et dans le stockage local du navigateur si demandé (réutilisée par l'outil Parcelle). */
export function useMaptilerKey(key: string, remember: boolean): void {
  const value = key.trim();
  if (value.length < 5) throw new Error("Clé non renseignée");
  try {
    sessionStorage.setItem(SESSION_KEY, value);
    if (remember) localStorage.setItem(MAPTILER_KEY_STORAGE, value);
  } catch {
    /* stockage indisponible : la clé reste en mémoire de session si possible */
  }
}

export function forgetMaptilerKey(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(MAPTILER_KEY_STORAGE);
  } catch {
    /* rien à retirer */
  }
}

function allowed(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== HOST) throw new Error("Adresse de service non autorisée");
  return u;
}

export async function fetchMaptilerJson(url: string, timeoutMs = 15000): Promise<unknown> {
  const u = allowed(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`Service HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("délai dépassé");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type LonLat = [number, number];
export type LonLatZ = [number, number, number];

const inRange = (p: LonLat) => p[0] > -180 && p[0] < 180 && p[1] >= -85 && p[1] <= 85;

/**
 * `collectElevation` de h7-app : le centre puis les sommets (50 positions au
 * plus, échantillonnées comme le prototype), en une requête ; la réponse doit
 * concorder position par position, sinon rien n'est conservé.
 */
export async function collectElevationPoints(center: LonLat, vertices: LonLat[] | null, key: string): Promise<LonLatZ[]> {
  let points: LonLat[] = [center, ...(vertices ?? [])];
  if (points.length > 50 && vertices) points = [center, ...vertices.filter((_, i) => i % Math.ceil(vertices.length / 49) === 0).slice(0, 49)];
  if (!points.every(inRange)) throw new Error("Coordonnées hors plage du service.");
  const list = points.map((p) => p.join(",")).join(";");
  const res = await fetchMaptilerJson(`https://${HOST}/elevation/${list}.json?key=${encodeURIComponent(key)}`);
  if (!Array.isArray(res) || res.length !== points.length) throw new Error("Réponse altimétrique non concordante");
  const out: LonLatZ[] = [];
  res.forEach((q, i) => {
    const p = points[i]!;
    if (!Array.isArray(q) || q.length < 3 || !q.slice(0, 3).every((v) => Number.isFinite(v)) || Math.abs(Number(q[0]) - p[0]) >= 0.0001 || Math.abs(Number(q[1]) - p[1]) >= 0.0001)
      throw new Error("Réponse altimétrique non concordante");
    out.push([Number(q[0]), Number(q[1]), Number(q[2])]);
  });
  return out;
}

/** `collectElevation` de flow-v62 : le centre seulement (1 position). */
export async function collectCenterElevation(center: LonLat, key: string): Promise<LonLatZ> {
  const [point] = await collectElevationPoints(center, null, key);
  return point!;
}

/** Projection Web Mercator en pixels de tuile (256 px) au zoom `z`, comme `mercator(ll, z)` du prototype. */
export function mercator(ll: readonly [number, number], z: number): [number, number] {
  const n = 256 * 2 ** z;
  return [((ll[0] + 180) / 360) * n, ((1 - Math.asinh(Math.tan((ll[1] * Math.PI) / 180)) / Math.PI) / 2) * n];
}

export interface SatellitePreview {
  /** Neuf tuiles (3 × 3) autour du centre, position en px dans un cadre de 768 × 768, adresse signée. */
  tiles: { left: number; top: number; url: string }[];
  /** Position du centre dans le cadre (px). */
  marker: [number, number];
  zoom: number;
  attribution: string;
}

/**
 * `satellite()` du bilan (flow-v62) : les 3 × 3 tuiles satellite autour du
 * centre calculé au zoom min(18, maxzoom), le centre marqué « Centre H-GEO ».
 * Le descripteur et les adresses de tuiles sont vérifiés (service autorisé).
 */
export async function satellitePreview(center: LonLat, key: string): Promise<SatellitePreview> {
  const meta = (await fetchMaptilerJson(`https://${HOST}/maps/satellite/256/tiles.json?key=${encodeURIComponent(key)}`)) as { tiles?: unknown; maxzoom?: unknown; attribution?: unknown };
  const template = Array.isArray(meta.tiles) ? meta.tiles[0] : undefined;
  if (typeof template !== "string") throw new Error("Descripteur sans adresse de tuile");
  const probe = new URL(template.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0"));
  if (probe.protocol !== "https:" || probe.hostname !== HOST) throw new Error("Hôte de tuiles inattendu");
  const z = Math.min(18, Number(meta.maxzoom) || 18);
  const [xf, yf] = mercator(center, z).map((v) => v / 256) as [number, number];
  const cx = Math.floor(xf);
  const cy = Math.floor(yf);
  const tiles: SatellitePreview["tiles"] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const url = allowed(
        template
          .replace("{z}", String(z))
          .replace("{x}", String(cx + dx))
          .replace("{y}", String(cy + dy)),
      );
      url.searchParams.set("key", key);
      tiles.push({ left: (dx + 1) * 256, top: (dy + 1) * 256, url: url.href });
    }
  const tmp = typeof document !== "undefined" ? document.createElement("div") : null;
  if (tmp) tmp.innerHTML = String(meta.attribution ?? "© MapTiler");
  return { tiles, marker: [(1 + xf - cx) * 256, (1 + yf - cy) * 256], zoom: z, attribution: (tmp?.textContent || "© MapTiler").trim() };
}

export interface SatelliteMosaic {
  /** Tuiles à afficher : position et taille en % de la fenêtre 900 × 560, adresse signée. */
  tiles: { left: number; top: number; width: number; height: number; url: string }[];
  /** Sommets du contour dans la fenêtre (px), ou null quand seul le centre est connu. */
  polygon: [number, number][] | null;
  zoom: number;
  /** Origine de la fenêtre en pixels Mercator au zoom retenu (pour projeter d'autres points). */
  origin: [number, number];
  attribution: string;
}

/**
 * `showMap` de h7-app : la mosaïque de tuiles satellite centrée sur le site
 * au zoom qui contient le contour (W 900 × H 560), avec le contour en
 * superposition. Les adresses de tuiles sont vérifiées (service autorisé).
 */
export async function satelliteMosaic(center: LonLat, vertices: LonLat[] | null, key: string): Promise<SatelliteMosaic> {
  const meta = (await fetchMaptilerJson(`https://${HOST}/maps/satellite/256/tiles.json?key=${encodeURIComponent(key)}`)) as { tiles?: unknown; maxzoom?: unknown; attribution?: unknown };
  const template = Array.isArray(meta.tiles) ? meta.tiles[0] : undefined;
  if (typeof template !== "string") throw new Error("Descripteur de carte incomplet");
  allowed(template.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0"));
  const W = 900;
  const H = 560;
  let z = Math.min(19, Number(meta.maxzoom) || 19);
  if (vertices)
    for (; z > 4; z--) {
      const pts = vertices.map((p) => mercator(p, z));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      if (Math.max(...xs) - Math.min(...xs) < W * 0.6 && Math.max(...ys) - Math.min(...ys) < H * 0.62) break;
    }
  const c = mercator(center, z);
  const origin: [number, number] = [c[0] - W / 2, c[1] - H / 2];
  const x0 = Math.floor(origin[0] / 256);
  const y0 = Math.floor(origin[1] / 256);
  const x1 = Math.floor((origin[0] + W) / 256);
  const y1 = Math.floor((origin[1] + H) / 256);
  const tiles: SatelliteMosaic["tiles"] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const url = allowed(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
      url.searchParams.set("key", key);
      tiles.push({ left: ((x * 256 - origin[0]) / W) * 100, top: ((y * 256 - origin[1]) / H) * 100, width: (256 / W) * 100, height: (256 / H) * 100, url: url.href });
    }
  const polygon = vertices
    ? vertices.map((ll) => {
        const pt = mercator(ll, z);
        return [pt[0] - origin[0], pt[1] - origin[1]] as [number, number];
      })
    : null;
  const tmp = typeof document !== "undefined" ? document.createElement("div") : null;
  if (tmp) tmp.innerHTML = String(meta.attribution ?? "© MapTiler");
  return { tiles, polygon, zoom: z, origin, attribution: (tmp?.textContent || "© MapTiler").trim() };
}
