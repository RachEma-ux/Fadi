/**
 * Fonds calés (cas 4 du catalogue des extensions, lot C4, étape 1 : D10-F23a-002 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-1-calage.png`).
 *
 * Un fond est une image (plan scanné, photo : PNG ou JPEG) posée à plat dans le plan horizontal d'une altitude. Sa pose
 * est une similitude : un pixel (u vers la droite, v vers le bas) va en
 *   x = x0 + e·(cos θ · u + sin θ · v),  y = y0 + e·(sin θ · u − cos θ · v)
 * (e = mètres par pixel, θ = rotation). À l'import, la pose est provisoire (1 px = 1 cm, coin haut gauche à l'origine)
 * et le fond est « non calé ». Le calage se fait :
 * - sur deux points de longueur connue (saisie) : l'échelle change, le premier point reste en place, la rotation aussi ;
 * - sur des paires de points (pixel ↔ position saisie) : similitude aux moindres carrés ; à trois paires ou plus,
 *   chaque point a son résidu (distance après calage) et l'écart quadratique moyen est donné ; à deux, ils sont
 *   « non évalués ».
 * Aucune longueur n'est devinée. Un fond verrouillé refuse tout changement de calage. Préfixe d'identifiant « j ».
 */
import type { Id, Modele } from "./geometrie-libre.js";
import { modifierAnnotations } from "./geometrie-libre.js";

export interface PixelFond {
  readonly u: number;
  readonly v: number;
}
export interface PositionPlan {
  readonly x: number;
  readonly y: number;
}
export interface PoseFond {
  /** Mètres par pixel. */
  readonly echelle: number;
  /** Rotation en radians (sens trigonométrique vu de dessus). */
  readonly rotation: number;
  readonly x: number;
  readonly y: number;
}
export interface PointCalage {
  /** « A », « B », … dans l'ordre de pose. */
  readonly id: string;
  readonly pixel: PixelFond;
  /** Position saisie (paires de points) ; null = non saisie. */
  readonly cible: PositionPlan | null;
}
export type MethodeCalage = "longueur" | "paires";

/**
 * Fichier d'origine archivé tel quel en base (décision du maître d'ouvrage du 27 novembre 2026) : l'image du fond n'en
 * est qu'une copie réduite pour l'affichage ; l'original se relit par l'API (`/sandbox/fonds/:id`).
 */
export interface OriginalFond {
  readonly id: string;
  /** SHA-256 des octets d'origine (64 caractères hexadécimaux). */
  readonly empreinte: string;
  /** Octets. */
  readonly taille: number;
  readonly type: "image/png" | "image/jpeg";
  /** Dimensions de l'original (px) ; absentes = non relevées. */
  readonly largeurPx?: number;
  readonly hauteurPx?: number;
}

/** Fond posé d'après un fichier de calage d'image (étape 2) : nom du fichier, système retenu, six coefficients A D B E C F. */
export interface GeoFond {
  readonly fichier: string;
  readonly systeme: string;
  readonly coefficients: readonly [number, number, number, number, number, number];
}

export interface Fond {
  readonly id: Id;
  /** Nom du fichier importé. */
  readonly nom: string;
  /** data:image/jpeg|png;base64,… */
  readonly image: string;
  readonly largeurPx: number;
  readonly hauteurPx: number;
  readonly altitude: number;
  readonly pose: PoseFond;
  readonly cale: boolean;
  readonly verrouille: boolean;
  /** 0,1 à 1. */
  readonly opacite: number;
  readonly methode: MethodeCalage;
  /** Longueur saisie entre les deux premiers points (méthode « longueur ») ; null = non saisie. */
  readonly longueur: number | null;
  readonly points: readonly PointCalage[];
  /** Original archivé en base ; absent = fond antérieur à l'archivage. */
  readonly original?: OriginalFond;
  /** Posé d'après un fichier de calage d'image ; absent = calé à la main (ou non calé). */
  readonly geo?: GeoFond;
}

/** Image encodée : 12 Mo de caractères au plus (un scan A3 réduit à 4 096 px en JPEG reste en deçà). */
export const IMAGE_FOND_MAX = 12_000_000;
export const COTE_FOND_MAX_PX = 4096;
export const POINTS_CALAGE_MAX = 26;
export const NOM_FOND_MAX = 120;
/** Pose provisoire à l'import : 1 px = 1 cm. */
export const ECHELLE_PROVISOIRE = 0.01;

export type ErreurFond = "image" | "nom" | "taille" | "absent" | "verrouille" | "points" | "longueur" | "cibles" | "degenere" | "pixel" | "position" | "opacite";

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const estPixel = (v: unknown, l: number, h: number): v is PixelFond => typeof v === "object" && v !== null && fini((v as PixelFond).u) && fini((v as PixelFond).v) && (v as PixelFond).u >= 0 && (v as PixelFond).v >= 0 && (v as PixelFond).u <= l && (v as PixelFond).v <= h;
const estPosition = (v: unknown): v is PositionPlan => typeof v === "object" && v !== null && fini((v as PositionPlan).x) && fini((v as PositionPlan).y) && Math.abs((v as PositionPlan).x) <= 1e7 && Math.abs((v as PositionPlan).y) <= 1e7;
const estImage = (v: unknown): v is string => typeof v === "string" && v.length <= IMAGE_FOND_MAX && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v);
const estTaille = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= COTE_FOND_MAX_PX;
const estPose = (v: unknown): v is PoseFond => typeof v === "object" && v !== null && fini((v as PoseFond).echelle) && (v as PoseFond).echelle > 0 && fini((v as PoseFond).rotation) && fini((v as PoseFond).x) && fini((v as PoseFond).y);
const LETTRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const estOriginalFond = (v: unknown): v is OriginalFond =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  typeof (v as OriginalFond).id === "string" && /^sbxfond_[0-9a-f-]{36}$/.test((v as OriginalFond).id) &&
  typeof (v as OriginalFond).empreinte === "string" && /^[0-9a-f]{64}$/.test((v as OriginalFond).empreinte) &&
  Number.isInteger((v as OriginalFond).taille) && (v as OriginalFond).taille > 0 &&
  ((v as OriginalFond).type === "image/png" || (v as OriginalFond).type === "image/jpeg") &&
  ((v as OriginalFond).largeurPx === undefined || (Number.isInteger((v as OriginalFond).largeurPx) && (v as OriginalFond).largeurPx! > 0)) &&
  ((v as OriginalFond).hauteurPx === undefined || (Number.isInteger((v as OriginalFond).hauteurPx) && (v as OriginalFond).hauteurPx! > 0));
export const estGeoFond = (v: unknown): v is GeoFond =>
  typeof v === "object" && v !== null && !Array.isArray(v) &&
  typeof (v as GeoFond).fichier === "string" && (v as GeoFond).fichier.length >= 1 && (v as GeoFond).fichier.length <= NOM_FOND_MAX &&
  typeof (v as GeoFond).systeme === "string" && (v as GeoFond).systeme.trim() !== "" && (v as GeoFond).systeme.length <= 200 &&
  Array.isArray((v as GeoFond).coefficients) && (v as GeoFond).coefficients.length === 6 && (v as GeoFond).coefficients.every(fini);

/** Fond reçu (document, delta) : jamais cru sur parole. */
export function estFond(id: Id, v: unknown): v is Fond {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  const l = f["largeurPx"] as number;
  const h = f["hauteurPx"] as number;
  return (
    f["id"] === id &&
    /^j[0-9a-z]+$/.test(id) &&
    typeof f["nom"] === "string" &&
    (f["nom"] as string).length <= NOM_FOND_MAX &&
    estImage(f["image"]) &&
    estTaille(l) &&
    estTaille(h) &&
    fini(f["altitude"]) &&
    estPose(f["pose"]) &&
    typeof f["cale"] === "boolean" &&
    typeof f["verrouille"] === "boolean" &&
    fini(f["opacite"]) &&
    (f["opacite"] as number) >= 0.1 &&
    (f["opacite"] as number) <= 1 &&
    (f["methode"] === "longueur" || f["methode"] === "paires") &&
    (f["longueur"] === null || (fini(f["longueur"]) && (f["longueur"] as number) > 0)) &&
    Array.isArray(f["points"]) &&
    (f["points"] as unknown[]).length <= POINTS_CALAGE_MAX &&
    (f["points"] as unknown[]).every((p, i) => typeof p === "object" && p !== null && (p as PointCalage).id === LETTRES[i] && estPixel((p as PointCalage).pixel, l, h) && ((p as PointCalage).cible === null || estPosition((p as PointCalage).cible))) &&
    (f["original"] === undefined || estOriginalFond(f["original"])) &&
    (f["geo"] === undefined || estGeoFond(f["geo"]))
  );
}

export type ResultatFond = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: ErreurFond };

export const fondsDe = (m: Modele): Fond[] => Object.values(m.annotations?.fonds ?? {}).sort((a, b) => a.id.localeCompare(b.id, "fr", { numeric: true }));

/** Pixel → position dans le plan (m). */
export function versPlan(p: PoseFond, px: PixelFond): PositionPlan {
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  return { x: p.x + p.echelle * (c * px.u + s * px.v), y: p.y + p.echelle * (s * px.u - c * px.v) };
}

/** Position dans le plan → pixel (inverse de `versPlan`). */
export function versPixel(p: PoseFond, q: PositionPlan): PixelFond {
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  const dx = (q.x - p.x) / p.echelle;
  const dy = (q.y - p.y) / p.echelle;
  return { u: c * dx + s * dy, v: s * dx - c * dy };
}

/** Coins du fond dans le plan : haut gauche, haut droit, bas droit, bas gauche. */
export const coinsFond = (f: Fond): PositionPlan[] => [versPlan(f.pose, { u: 0, v: 0 }), versPlan(f.pose, { u: f.largeurPx, v: 0 }), versPlan(f.pose, { u: f.largeurPx, v: f.hauteurPx }), versPlan(f.pose, { u: 0, v: f.hauteurPx })];

const modifierFond = (m: Modele, id: Id, fn: (f: Fond) => Fond | ErreurFond, verrouExige = true): ResultatFond => {
  const f = m.annotations?.fonds?.[id];
  if (!f) return { ok: false, erreur: "absent" };
  if (verrouExige && f.verrouille) return { ok: false, erreur: "verrouille" };
  const r = fn(f);
  if (typeof r === "string") return { ok: false, erreur: r };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.fonds[id] = r)).modele, id };
};

/** Importe un fond (un pas) : pose provisoire 1 px = 1 cm, coin haut gauche à l'origine, à l'altitude donnée. */
export function importerFond(m: Modele, v: { readonly nom: string; readonly image: string; readonly largeurPx: number; readonly hauteurPx: number; readonly altitude: number; readonly original?: OriginalFond; readonly pose?: PoseFond; readonly geo?: GeoFond }): ResultatFond {
  const nom = v.nom.trim().slice(0, NOM_FOND_MAX);
  if (!estImage(v.image)) return { ok: false, erreur: "image" };
  if (!estTaille(v.largeurPx) || !estTaille(v.hauteurPx)) return { ok: false, erreur: "taille" };
  if (!fini(v.altitude)) return { ok: false, erreur: "position" };
  if (v.original !== undefined && !estOriginalFond(v.original)) return { ok: false, erreur: "image" };
  if ((v.pose !== undefined && !estPose(v.pose)) || (v.geo !== undefined && !estGeoFond(v.geo))) return { ok: false, erreur: "position" };
  let id = "" as Id;
  const modele = modifierAnnotations(m, (a, nouvel) => {
    id = nouvel("j");
    a.fonds[id] = { id, nom, image: v.image, largeurPx: v.largeurPx, hauteurPx: v.hauteurPx, altitude: v.altitude, pose: v.pose ?? { echelle: ECHELLE_PROVISOIRE, rotation: 0, x: 0, y: v.hauteurPx * ECHELLE_PROVISOIRE }, cale: v.pose !== undefined, verrouille: v.geo !== undefined, opacite: 0.7, methode: "longueur", longueur: null, points: [], ...(v.original ? { original: v.original } : {}), ...(v.geo ? { geo: v.geo } : {}) };
  }).modele;
  return { ok: true, modele, id };
}

export const supprimerFond = (m: Modele, id: Id): ResultatFond => {
  if (!m.annotations?.fonds?.[id]) return { ok: false, erreur: "absent" };
  return { ok: true, modele: modifierAnnotations(m, (a) => void delete a.fonds[id]).modele, id };
};

export const verrouillerFond = (m: Modele, id: Id, verrouille: boolean): ResultatFond => modifierFond(m, id, (f) => ({ ...f, verrouille }), false);

export const reglerOpacite = (m: Modele, id: Id, opacite: number): ResultatFond => modifierFond(m, id, (f) => (fini(opacite) && opacite >= 0.1 && opacite <= 1 ? { ...f, opacite } : "opacite"), false);

export const choisirMethode = (m: Modele, id: Id, methode: MethodeCalage): ResultatFond => modifierFond(m, id, (f) => ({ ...f, methode }));

export const saisirLongueur = (m: Modele, id: Id, longueur: number | null): ResultatFond => modifierFond(m, id, (f) => (longueur === null || (fini(longueur) && longueur > 0) ? { ...f, longueur } : "longueur"));

/** Ajoute un point de calage au pixel donné ; sa cible est d'abord sa position actuelle (à saisir pour les paires). */
export function ajouterPointCalage(m: Modele, id: Id, pixel: PixelFond): ResultatFond & { readonly point?: string } {
  let point = "";
  const r = modifierFond(m, id, (f) => {
    if (f.points.length >= POINTS_CALAGE_MAX) return "points";
    if (!estPixel(pixel, f.largeurPx, f.hauteurPx)) return "pixel";
    point = LETTRES[f.points.length]!;
    return { ...f, points: [...f.points, { id: point, pixel, cible: versPlan(f.pose, pixel) }] };
  });
  return r.ok ? { ...r, point } : r;
}

export const saisirCible = (m: Modele, id: Id, point: string, cible: PositionPlan | null): ResultatFond =>
  modifierFond(m, id, (f) => {
    if (!f.points.some((p) => p.id === point)) return "absent";
    if (cible !== null && !estPosition(cible)) return "position";
    return { ...f, points: f.points.map((p) => (p.id === point ? { ...p, cible } : p)) };
  });

/** Retire un point ; les suivants sont renommés pour garder A, B, C… */
export const supprimerPointCalage = (m: Modele, id: Id, point: string): ResultatFond =>
  modifierFond(m, id, (f) => {
    if (!f.points.some((p) => p.id === point)) return "absent";
    return { ...f, points: f.points.filter((p) => p.id !== point).map((p, i) => ({ ...p, id: LETTRES[i]! })) };
  });

/** Similitude aux moindres carrés (pixels → plan) ; null si les pixels sont confondus. */
export function similitude(paires: readonly { readonly pixel: PixelFond; readonly cible: PositionPlan }[]): PoseFond | null {
  const n = paires.length;
  if (n < 2) return null;
  // Pixel retourné (u, −v) : repère direct comme le plan ; la pose cherchée est alors une similitude directe.
  const P = paires.map((p) => ({ a: p.pixel.u, b: -p.pixel.v }));
  const Q = paires.map((p) => p.cible);
  const pa = P.reduce((s, p) => s + p.a, 0) / n;
  const pb = P.reduce((s, p) => s + p.b, 0) / n;
  const qx = Q.reduce((s, q) => s + q.x, 0) / n;
  const qy = Q.reduce((s, q) => s + q.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let var_ = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i]!.a - pa;
    const b = P[i]!.b - pb;
    const x = Q[i]!.x - qx;
    const y = Q[i]!.y - qy;
    sxx += a * x + b * y;
    sxy += a * y - b * x;
    var_ += a * a + b * b;
  }
  if (var_ < 1e-9) return null;
  const k = Math.hypot(sxx, sxy) / var_;
  if (!(k > 0)) return null;
  const rot = Math.atan2(sxy, sxx);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // q = t + k·R(rot)·(a, b) ; avec (a, b) = (u, −v), c'est exactement `versPlan` de rotation `rot`.
  return { echelle: k, rotation: rot, x: qx - k * (c * pa - s * pb), y: qy - k * (s * pa + c * pb) };
}

/** Résidus (m) de chaque point après calage par paires, et écart quadratique moyen ; null à moins de trois paires. */
export function residusCalage(f: Fond): { readonly points: Readonly<Record<string, number>>; readonly moyen: number } | null {
  if (f.methode !== "paires" || !f.cale) return null;
  const paires = f.points.filter((p): p is PointCalage & { cible: PositionPlan } => p.cible !== null);
  if (paires.length < 3) return null;
  const points: Record<string, number> = {};
  let s2 = 0;
  for (const p of paires) {
    const q = versPlan(f.pose, p.pixel);
    const d = Math.hypot(q.x - p.cible.x, q.y - p.cible.y);
    points[p.id] = d;
    s2 += d * d;
  }
  return { points, moyen: Math.sqrt(s2 / paires.length) };
}

/** Cale le fond selon sa méthode (un pas) ; les cibles des points suivent la nouvelle pose en méthode « longueur ». */
export const calerFond = (m: Modele, id: Id): ResultatFond =>
  modifierFond(m, id, (f) => {
    if (f.methode === "longueur") {
      if (f.points.length < 2) return "points";
      if (f.longueur === null) return "longueur";
      const [a, b] = f.points as [PointCalage, PointCalage];
      const d = Math.hypot(b.pixel.u - a.pixel.u, b.pixel.v - a.pixel.v);
      if (d < 1) return "degenere";
      const echelle = f.longueur / d;
      // Le point A reste en place.
      const avant = versPlan(f.pose, a.pixel);
      const p0 = { ...f.pose, echelle };
      const apres = versPlan(p0, a.pixel);
      const pose = { ...p0, x: p0.x + avant.x - apres.x, y: p0.y + avant.y - apres.y };
      const { geo: _geo, ...sansGeo } = f;
      return { ...sansGeo, pose, cale: true, points: f.points.map((p) => ({ ...p, cible: versPlan(pose, p.pixel) })) };
    }
    const paires = f.points.filter((p): p is PointCalage & { cible: PositionPlan } => p.cible !== null);
    if (paires.length < 2) return "cibles";
    const pose = similitude(paires);
    if (!pose) return "degenere";
    // Recalé à la main : le fichier de calage d'image ne décrit plus la pose.
    const { geo: _geo, ...sansGeo } = f;
    return { ...sansGeo, pose, cale: true };
  });
