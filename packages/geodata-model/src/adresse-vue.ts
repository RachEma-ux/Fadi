/**
 * État de la carte dans l'adresse (D-GD-40) : la vue courante s'écrit dans le fragment de l'adresse (`#…`), pour être
 * rouverte telle quelle par un lien. Le fragment ne quitte jamais le navigateur (il n'est pas envoyé au serveur) et ne
 * contient ni donnée, ni adresse, ni clé : seulement des identifiants que le serveur contrôle à la lecture (une couche
 * privée d'un autre espace reste refusée). Logique pure.
 *
 * Forme : `v=lon,lat,zoom,cap` ; `carte=<id>` (carte enregistrée ouverte) ; `c=<couche>~<version>[~m][~g],…` (couches,
 * de bas en haut ; `m` masquée, `g` points regroupés) ; `i=<clé de l'indicateur actif en JSON>` ; `z=<zone d'étude qui
 * filtre>` (D-GD-41 ; une zone est propre à son espace : ailleurs, elle est refusée par le serveur et ignorée).
 */
import type { Camera } from "./composition.js";
import { MILIEUX, SEXES, type Milieu, type Sexe } from "./dimensions.js";
import type { CleIndicateur } from "./indicateur-actif.js";

export interface CoucheAdresse {
  readonly coucheId: string;
  readonly versionId: string;
  readonly visible: boolean;
  readonly regrouper: boolean;
}

export interface EtatAdresse {
  readonly camera: Camera | null;
  readonly carteId: string | null;
  readonly couches: readonly CoucheAdresse[];
  readonly indicateur: CleIndicateur | null;
  /** Zone d'étude qui filtre la carte, la table et la synthèse (D-GD-41) ; absente = aucun filtre de zone. */
  readonly zoneId?: string | null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_COUCHES_ADRESSE = 20;
const arrondi = (x: number, n: number) => Number(x.toFixed(n));

export function ecrireAdresseVue(e: EtatAdresse): string {
  const p = new URLSearchParams();
  if (e.camera) p.set("v", [arrondi(e.camera.lon, 5), arrondi(e.camera.lat, 5), arrondi(e.camera.zoom, 2), arrondi(e.camera.cap, 1)].join(","));
  if (e.carteId) p.set("carte", e.carteId);
  if (e.couches.length) p.set("c", e.couches.map((k) => [k.coucheId, k.versionId, ...(k.visible ? [] : ["m"]), ...(k.regrouper ? ["g"] : [])].join("~")).join(","));
  if (e.indicateur) p.set("i", JSON.stringify(e.indicateur));
  if (e.zoneId) p.set("z", e.zoneId);
  return p.toString();
}

function lireCamera(v: string | null): Camera | null {
  if (!v) return null;
  const n = v.split(",").map(Number);
  if (n.length !== 4 || !n.every(Number.isFinite)) return null;
  const [lon, lat, zoom, cap] = n as [number, number, number, number];
  if (lon < -180 || lon > 180 || lat < -85.05 || lat > 85.05 || zoom < 0 || zoom > 18) return null;
  return { lon, lat, zoom, cap: ((cap % 360) + 360) % 360 };
}

function lireCouches(c: string | null): CoucheAdresse[] {
  const couches: CoucheAdresse[] = [];
  for (const morceau of (c ?? "").split(",").slice(0, MAX_COUCHES_ADRESSE)) {
    const [coucheId, versionId, ...options] = morceau.split("~");
    if (!coucheId || !versionId || !ID.test(coucheId) || !ID.test(versionId) || couches.some((k) => k.coucheId === coucheId)) continue;
    couches.push({ coucheId, versionId, visible: !options.includes("m"), regrouper: options.includes("g") });
  }
  return couches;
}

function lireIndicateur(i: string | null): CleIndicateur | null {
  if (!i) return null;
  try {
    const x = JSON.parse(i) as Record<string, unknown>;
    const texte = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;
    if (!x || typeof x !== "object" || !texte(x["famille"])) return null;
    if (!(x["theme"] === null || texte(x["theme"])) || !(x["modalite"] === null || texte(x["modalite"]))) return null;
    if (!MILIEUX.includes(x["milieu"] as Milieu) || !SEXES.includes(x["sexe"] as Sexe)) return null;
    return { theme: x["theme"] as string | null, famille: x["famille"] as string, modalite: x["modalite"] as string | null, milieu: x["milieu"] as Milieu, sexe: x["sexe"] as Sexe };
  } catch {
    return null;
  }
}

/** Lit un fragment d'adresse (avec ou sans `#`) ; null s'il ne décrit aucune vue. Les parties mal formées sont ignorées. */
export function lireAdresseVue(fragment: string): EtatAdresse | null {
  const p = new URLSearchParams(fragment.replace(/^#/, ""));
  const camera = lireCamera(p.get("v"));
  const carte = p.get("carte");
  const carteId = carte && ID.test(carte) ? carte : null;
  const couches = lireCouches(p.get("c"));
  const indicateur = lireIndicateur(p.get("i"));
  const z = p.get("z");
  const zoneId = z && ID.test(z) ? z : null;
  if (!camera && !carteId && !couches.length && !indicateur && !zoneId) return null;
  return { camera, carteId, couches, indicateur, ...(zoneId ? { zoneId } : {}) };
}
