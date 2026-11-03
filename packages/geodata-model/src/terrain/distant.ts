/**
 * Fond mondial à la demande (TER-09, Issue #381) — logique pure : adresses fermées des sources distantes, dalles 1° × 1°,
 * blocs du cache local, éviction LRU bornée par un quota, budget de requêtes distantes. Aucun accès au disque, au réseau ni
 * au DOM ; le temps est fourni par l'appelant.
 *
 * Règles :
 *  - une adresse distante n'est jamais libre : elle est **construite** depuis le modèle d'une fiche livrée (hôte déclaré,
 *    `{lat}` / `{lon}` seulement), puis revérifiée (hôte, schéma, chemin exact) avant toute lecture ;
 *  - hors de l'emprise déclarée : aucune adresse (« indisponible »), jamais une valeur inventée ;
 *  - le cache est borné (quota) et évincé du moins récemment utilisé ; l'en-tête d'une source (épinglage : ETag,
 *    Last-Modified, taille) n'est jamais évincé tant que ses blocs existent.
 */
import { DALLE, type AcquisitionDistante } from "./catalogue.js";

/** Nom de la dalle 1° × 1° qui contient le point (coin sud-ouest), p. ex. (−7,1 ; 33,5) → N33W008. */
export function nomDalle(lon: number, lat: number): string {
  if (!(Number.isFinite(lon) && Number.isFinite(lat)) || lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error("Coordonnées WGS 84 hors limites.");
  const la = Math.min(89, Math.floor(lat));
  const lo = Math.min(179, Math.floor(lon));
  return `${la < 0 ? "S" : "N"}${String(Math.abs(la)).padStart(2, "0")}${lo < 0 ? "W" : "E"}${String(Math.abs(lo)).padStart(3, "0")}`;
}

/** Emprise [ouest, sud, est, nord] d'une dalle « N33W008 ». */
export function empriseDalle(nom: string): [number, number, number, number] {
  const m = DALLE.exec(nom);
  if (!m) throw new Error(`Dalle invalide : ${nom}`);
  const lat = (m[1] === "S" ? -1 : 1) * Number(m[2]);
  const lon = (m[3] === "W" ? -1 : 1) * Number(m[4]);
  if (lat < -90 || lat > 89 || lon < -180 || lon > 179) throw new Error(`Dalle hors limites : ${nom}`);
  return [lon, lat, lon + 1, lat + 1];
}

const dansEmprise = (a: AcquisitionDistante, o: number, s: number, e: number, n: number) => e > a.emprise.ouest && o < a.emprise.est && n > a.emprise.sud && s < a.emprise.nord;

/**
 * Adresse de la source pour une dalle (modèle à dalles) ou de l'adresse unique (`dalle` null) ; null hors de l'emprise
 * déclarée. L'adresse est construite, jamais reçue.
 */
export function adresseDistante(a: AcquisitionDistante, dalle: string | null): string | null {
  if (a.dalles === null) return dalle === null ? a.modele : null;
  if (dalle === null) return null;
  const [o, s, e, n] = empriseDalle(dalle);
  if (!dansEmprise(a, o, s, e, n)) return null;
  const m = DALLE.exec(dalle)!;
  return a.modele.replaceAll("{lat}", `${m[1]}${m[2]}`).replaceAll("{lon}", `${m[3]}${m[4]}`);
}

/** Dalles (ou l'adresse unique, `[null]`) qui recoupent une emprise WGS 84 ; refus au-delà de `max` (budget). */
export function dallesEmprise(a: AcquisitionDistante, emprise: readonly [number, number, number, number], max: number): (string | null)[] {
  const [o, s, e, n] = [Math.max(emprise[0], a.emprise.ouest), Math.max(emprise[1], a.emprise.sud), Math.min(emprise[2], a.emprise.est), Math.min(emprise[3], a.emprise.nord)];
  if (!(e > o && n > s)) return [];
  if (a.dalles === null) return [null];
  const noms: string[] = [];
  for (let la = Math.floor(s); la < Math.ceil(n); la++) {
    for (let lo = Math.floor(o); lo < Math.ceil(e); lo++) {
      if (la < -90 || la > 89 || lo < -180 || lo > 179) continue;
      noms.push(nomDalle(lo + 0.5, la + 0.5));
      if (noms.length > max) throw new Error(`Emprise de plus de ${max} dalles distantes : au-delà du budget d'une requête.`);
    }
  }
  return noms;
}

/**
 * Vérifie qu'une adresse appartient à la liste fermée des sources distantes : égale, caractère pour caractère, à l'adresse
 * construite depuis une fiche (hôte déclaré, https, aucun port ni requête). Renvoie la fiche et la dalle, sinon null.
 */
export function adresseAutorisee(sources: readonly { readonly cle: string; readonly acquisition: AcquisitionDistante }[], url: string): { cle: string; dalle: string | null } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash) return null;
  for (const f of sources) {
    if (u.hostname !== f.acquisition.hote) continue;
    if (f.acquisition.dalles === null) { if (url === f.acquisition.modele) return { cle: f.cle, dalle: null }; continue; }
    const m = motifModele(f.acquisition.modele).exec(url);
    const dalle = m?.groups ? `${m.groups["lat"]}${m.groups["lon"]}` : null;
    if (dalle && DALLE.test(dalle) && adresseDistante(f.acquisition, dalle) === url) return { cle: f.cle, dalle };
  }
  return null;
}

/** Expression exacte d'un modèle à dalles : le modèle échappé, `{lat}` et `{lon}` seuls variables (répétitions identiques). */
function motifModele(modele: string): RegExp {
  let vu = { lat: false, lon: false };
  const parties = modele.split(/(\{lat\}|\{lon\})/).map((p) => {
    if (p === "{lat}") { const r = vu.lat ? "\\k<lat>" : "(?<lat>[NS]\\d{2})"; vu = { ...vu, lat: true }; return r; }
    if (p === "{lon}") { const r = vu.lon ? "\\k<lon>" : "(?<lon>[EW]\\d{3})"; vu = { ...vu, lon: true }; return r; }
    return p.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  });
  return new RegExp(`^${parties.join("")}$`);
}

/** Une redirection n'est jamais suivie ; un hôte différent de celui de la fiche est refusé. */
export const redirectionRefusee = (statut: number) => statut >= 300 && statut < 400;

// ——— Plages HTTP et blocs du cache ———

/** Plage `bytes=a-b` (une seule, bornes incluses) ; null si absente ou invalide (plusieurs plages refusées). */
export function lirePlage(entete: string | undefined): { debut: number; fin: number } | null {
  const m = /^bytes=(\d{1,15})-(\d{1,15})$/.exec((entete ?? "").trim());
  if (!m) return null;
  const debut = Number(m[1]), fin = Number(m[2]);
  return fin >= debut ? { debut, fin } : null;
}

/** `Content-Range: bytes a-b/total` → total (null si illisible ou incohérent avec la plage demandée). */
export function lireContentRange(entete: string | null | undefined, attendu: { debut: number; fin: number }): { fin: number; total: number } | null {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec((entete ?? "").trim());
  if (!m) return null;
  const [a, b, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a !== attendu.debut || b < a || b > attendu.fin || b >= t) return null;
  return { fin: b, total: t };
}

/** Indices des blocs (taille fixe) couvrant une plage ; la plage est bornée par la taille du fichier si elle est connue. */
export function blocsDePlage(debut: number, fin: number, tailleBloc: number, tailleFichier: number | null): number[] {
  const f = tailleFichier === null ? fin : Math.min(fin, tailleFichier - 1);
  if (f < debut) return [];
  const blocs: number[] = [];
  for (let b = Math.floor(debut / tailleBloc); b <= Math.floor(f / tailleBloc); b++) blocs.push(b);
  return blocs;
}

/** Suites contiguës d'indices manquants (une requête distante par suite, au plus `maxBlocs` blocs chacune). */
export function suitesContigues(indices: readonly number[], maxBlocs: number): [number, number][] {
  const tries = [...new Set(indices)].sort((a, b) => a - b);
  const suites: [number, number][] = [];
  for (const i of tries) {
    const d = suites[suites.length - 1];
    if (d && i === d[1] + 1 && i - d[0] + 1 <= maxBlocs) d[1] = i;
    else suites.push([i, i]);
  }
  return suites;
}

/** Empreinte d'épinglage d'une source distante : ce qui doit rester identique pour qu'une version reste la même. */
export interface EpinglageDistant { readonly etag: string | null; readonly lastModified: string | null; readonly taille: number }
export const memeSource = (a: EpinglageDistant, b: EpinglageDistant) => a.taille === b.taille && a.etag === b.etag && a.lastModified === b.lastModified;

// ——— Éviction LRU ———

export interface EntreeCache { readonly cle: string; readonly taille: number; readonly utiliseLe: number }

/**
 * Entrées à évincer pour revenir sous `cible` octets (du moins récemment utilisé au plus récent), si le total dépasse le
 * `quota`. Une entrée protégée (en cours d'écriture ou de lecture) n'est jamais évincée.
 */
export function planEviction(entrees: readonly EntreeCache[], quota: number, cible: number, protegees: ReadonlySet<string> = new Set()): string[] {
  let total = entrees.reduce((t, e) => t + e.taille, 0);
  if (total <= quota) return [];
  const ordre = [...entrees].filter((e) => !protegees.has(e.cle)).sort((a, b) => a.utiliseLe - b.utiliseLe || a.cle.localeCompare(b.cle));
  const sortie: string[] = [];
  for (const e of ordre) {
    if (total <= cible) break;
    sortie.push(e.cle);
    total -= e.taille;
  }
  return sortie;
}

// ——— Budget des requêtes distantes ———

export interface BudgetDistant {
  /** Requêtes distantes simultanées. */
  readonly simultanees: number;
  /** Requêtes distantes par minute glissante. */
  readonly parMinute: number;
  /** Octets reçus de l'extérieur par jour glissant. */
  readonly octetsParJour: number;
  /** Octets d'une seule requête distante. */
  readonly octetsParRequete: number;
  /** Délai d'une requête distante (ms). */
  readonly delaiMs: number;
}

/**
 * Compteur du budget (fenêtres glissantes). `reserver` dit si une requête de `octets` peut partir maintenant ; `liberer`
 * la termine. Pur : l'appelant fournit l'instant.
 */
export class CompteurBudget {
  private enCours = 0;
  private readonly departs: number[] = [];
  private readonly recus: { t: number; n: number }[] = [];
  constructor(readonly budget: BudgetDistant) {}

  private purger(maintenant: number) {
    while (this.departs.length && this.departs[0]! <= maintenant - 60_000) this.departs.shift();
    while (this.recus.length && this.recus[0]!.t <= maintenant - 86_400_000) this.recus.shift();
  }

  /** null si admise (la requête est comptée), sinon le motif du refus. */
  reserver(octets: number, maintenant: number): string | null {
    this.purger(maintenant);
    if (octets > this.budget.octetsParRequete) return `Requête distante de ${octets} octets : au-delà de ${this.budget.octetsParRequete} par requête.`;
    if (this.enCours >= this.budget.simultanees) return `Requêtes distantes simultanées : ${this.budget.simultanees} au plus.`;
    if (this.departs.length >= this.budget.parMinute) return `Budget de ${this.budget.parMinute} requêtes distantes par minute atteint.`;
    const jour = this.recus.reduce((t, r) => t + r.n, 0);
    if (jour + octets > this.budget.octetsParJour) return `Budget de ${this.budget.octetsParJour} octets distants par jour atteint.`;
    this.enCours++;
    this.departs.push(maintenant);
    this.recus.push({ t: maintenant, n: octets });
    return null;
  }

  liberer(): void { this.enCours = Math.max(0, this.enCours - 1); }

  etat(maintenant: number) {
    this.purger(maintenant);
    return { enCours: this.enCours, minute: this.departs.length, octetsJour: this.recus.reduce((t, r) => t + r.n, 0) };
  }
}

/** Mosaïque lon/lat : pas (degrés) et dimensions d'une grille couvrant une emprise, bornée en cellules. */
export function grilleMosaique(emprise: readonly [number, number, number, number], pasDeg: number, maxCellules: number): { largeur: number; hauteur: number } {
  const largeur = Math.max(1, Math.ceil((emprise[2] - emprise[0]) / pasDeg - 1e-9));
  const hauteur = Math.max(1, Math.ceil((emprise[3] - emprise[1]) / pasDeg - 1e-9));
  if (largeur * hauteur > maxCellules) throw new Error(`Mosaïque de ${largeur * hauteur} cellules : au-delà de ${maxCellules}.`);
  return { largeur, hauteur };
}

/** Web Mercator → latitude (degrés) d'une ordonnée normalisée de tuile (0 en haut, 1 en bas). */
export const latitudeMercator = (yNorm: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI;

/**
 * Limites du fond mondial lu à la demande (TER-D23, TER-D24 : à confirmer par le maître d'ouvrage). Sous `zoomMinTuiles`,
 * aucune tuile n'est lue (une vue de continent coûterait des centaines de requêtes) ; sous `zoomMinCourbes`, aucune courbe
 * (elles seraient calculées sur un aperçu, pas sur la grille numérique).
 */
export const LIMITES_FOND_MONDIAL = Object.freeze({
  zoomMinTuiles: 8,
  zoomMinCourbes: 12,
  /** Dalles distantes lues pour une seule requête (tuile, point, profil, statistiques). */
  dallesParRequete: 4,
  /** Cellules lues à la demande pour des statistiques de zone (au-delà : zone à réduire). */
  cellulesStatistiques: 4_000_000,
  /** Délais d'attente de l'API (ms) : au-delà, « chargement » (le service continue de remplir le cache). */
  delaiTuileMs: 15_000,
  delaiPointMs: 12_000,
  delaiCalculMs: 25_000,
});
