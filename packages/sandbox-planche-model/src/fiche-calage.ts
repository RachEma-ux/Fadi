/**
 * Fiche de calage du projet et fichiers de calage d'image (cas 4 du catalogue des extensions, lot C4, étape 2 :
 * D10-F14-096, D10-F23a-038, D10-S-005 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-2-fiche-calage.png`).
 * Pur : ni React, ni DOM.
 *
 * - La **fiche de calage** est un fichier texte lisible (une ligne « clé = valeur » par donnée, nombres en point décimal) :
 *   point de base (E, N), systèmes déclarés, nord du quadrillage, altitude du ±0,00, niveaux, fonds calés (pose, empreinte
 *   de l'original), auteur, date. Relue, elle est **comparée** au projet (écart du point de base, du nord, de chaque niveau
 *   en millimètres) ; l'appliquer reprend le point de base et ajoute les niveaux absents, en un pas, sans jamais modifier un
 *   niveau existant (rien n'est recalé en silence).
 * - Le **fichier de calage d'image** (.tfw, .jgw, .pgw, .wld : six nombres A, D, B, E, C, F) pose une orthophoto d'après le
 *   point de base ; un système lu dans un .prj est comparé à celui du projet ; aucun système n'est supposé ni converti
 *   (Fadi n'a pas de base de systèmes) : un système différent est refusé avec motif, un système absent est demandé.
 */
import { REGLAGES_DEFAUT } from "./annotations.js";
import { niveauxTries } from "./niveaux.js";
import { type Fond, type PoseFond, fondsDe, versPlan } from "./fonds.js";
import { type Modele, modifierAnnotations } from "./geometrie-libre.js";
import { type PointDeBase, axesQuadrillage, estPointDeBase, versProjete } from "./point-de-base.js";

export const EN_TETE_FICHE = "# Fiche de calage — Fadi 1";
/** Taille maximale d'une fiche lue (caractères) et nombre de niveaux ou de fonds qu'elle peut porter. */
export const FICHE_MAX = 200_000;
export const LIGNES_FICHE_MAX = 500;
export const AUTEUR_MAX = 80;

export interface NiveauFiche {
  readonly nom: string;
  readonly altitude: number;
  readonly hauteur: number;
}
export interface FondFiche {
  readonly nom: string;
  readonly largeurPx: number;
  readonly hauteurPx: number;
  readonly altitude: number;
  readonly echelle: number;
  /** Degrés, sens trigonométrique vu de dessus. */
  readonly rotation: number;
  readonly x: number;
  readonly y: number;
  readonly cale: boolean;
  /** SHA-256 de l'original archivé ; null = fond sans original archivé. */
  readonly empreinte: string | null;
}
export interface FicheCalage {
  readonly auteur: string;
  /** AAAA-MM-JJ. */
  readonly date: string;
  readonly pointDeBase: PointDeBase | null;
  /** Altitude du ±0,00 dans le système vertical (niveau de référence de la Planche) ; null = non déclarée. */
  readonly reference: number | null;
  readonly niveaux: readonly NiveauFiche[];
  readonly fonds: readonly FondFiche[];
}

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Nombre écrit sans perte utile (point décimal, jamais d'exposant pour les coordonnées courantes). */
const n = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(15))));
const texteSur = (s: string): string => s.replace(/[\r\n;=]/g, " ").trim();

/** Fiche du projet : ce que la Planche déclare (rien n'est supposé ; l'absent est absent). */
export function ficheDuProjet(m: Modele, reference: number | null, auteur: string, date: string): FicheCalage {
  return {
    auteur: texteSur(auteur).slice(0, AUTEUR_MAX),
    date,
    pointDeBase: m.annotations?.reglages?.pointDeBase ?? null,
    reference,
    niveaux: niveauxTries(m).map((x) => ({ nom: x.nom, altitude: x.altitude, hauteur: x.hauteur })),
    fonds: fondsDe(m).map((f) => ({ nom: f.nom, largeurPx: f.largeurPx, hauteurPx: f.hauteurPx, altitude: f.altitude, echelle: f.pose.echelle, rotation: (f.pose.rotation * 180) / Math.PI, x: f.pose.x, y: f.pose.y, cale: f.cale, empreinte: f.original?.empreinte ?? null })),
  };
}

/** Texte de la fiche : lisible et relu par `lireFicheCalage`. */
export function ecrireFicheCalage(f: FicheCalage): string {
  const l: string[] = [EN_TETE_FICHE, "# Une ligne par donnée ; nombres en mètres (point décimal), angles en degrés.", `auteur = ${texteSur(f.auteur)}`, `date = ${f.date}`];
  const p = f.pointDeBase;
  if (p) {
    l.push(`systeme = ${texteSur(p.systeme)}`);
    if (p.systemeVertical) l.push(`systeme_vertical = ${texteSur(p.systemeVertical)}`);
    l.push(`point_de_base_e = ${n(p.e)}`, `point_de_base_n = ${n(p.n)}`, `nord_quadrillage_deg = ${n(p.rotation)}`);
  } else l.push("# Point de base : non déclaré.");
  l.push(f.reference === null ? "# Altitude du ±0,00 : non déclarée." : `h_reference = ${n(f.reference)}`);
  l.push("# niveau = nom ; altitude ; hauteur d'étage");
  for (const x of f.niveaux) l.push(`niveau = ${texteSur(x.nom)} ; ${n(x.altitude)} ; ${n(x.hauteur)}`);
  l.push("# fond = nom ; largeur px ; hauteur px ; altitude ; m par px ; rotation deg ; x ; y ; calé (oui/non) ; empreinte de l'original");
  for (const x of f.fonds) l.push(`fond = ${texteSur(x.nom)} ; ${x.largeurPx} ; ${x.hauteurPx} ; ${n(x.altitude)} ; ${n(x.echelle)} ; ${n(x.rotation)} ; ${n(x.x)} ; ${n(x.y)} ; ${x.cale ? "oui" : "non"} ; ${x.empreinte ?? "-"}`);
  return `${l.join("\n")}\n`;
}

export type ErreurFiche = "en-tete" | "taille" | "ligne" | "date" | "point-de-base";

/** Fiche relue : le premier défaut est nommé avec sa ligne ; rien n'est complété en silence. */
export function lireFicheCalage(texte: string): { readonly fiche: FicheCalage } | { readonly erreur: ErreurFiche; readonly ligne: number } {
  if (texte.length > FICHE_MAX) return { erreur: "taille", ligne: 0 };
  const lignes = texte.replace(/^﻿/, "").split(/\r?\n/);
  if (lignes[0]?.trim() !== EN_TETE_FICHE) return { erreur: "en-tete", ligne: 1 };
  if (lignes.length > LIGNES_FICHE_MAX + 20) return { erreur: "taille", ligne: 0 };
  const v: Record<string, string> = {};
  const niveaux: NiveauFiche[] = [];
  const fonds: FondFiche[] = [];
  // Notation écrite par `ecrireFicheCalage`, exposant compris (1e-7) ; jamais une valeur non finie.
  const nombre = (s: string | undefined): number | null => (s !== undefined && /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s.trim()) && Number.isFinite(Number(s.trim())) ? Number(s.trim()) : null);
  for (const [i, brute] of lignes.entries()) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const m = /^([a-z_]+)\s*=\s*(.*)$/.exec(ligne);
    if (!m) return { erreur: "ligne", ligne: i + 1 };
    const [, cle, valeur] = m as unknown as [string, string, string];
    if (cle === "niveau") {
      const [nom, a, h] = valeur.split(";").map((s) => s.trim());
      const altitude = nombre(a);
      const hauteur = nombre(h);
      if (!nom || altitude === null || hauteur === null || hauteur <= 0) return { erreur: "ligne", ligne: i + 1 };
      niveaux.push({ nom, altitude, hauteur });
    } else if (cle === "fond") {
      const c = valeur.split(";").map((s) => s.trim());
      const nums = [1, 2, 3, 4, 5, 6, 7].map((k) => nombre(c[k]));
      const [l, h, alt, e, rot, x, y] = nums;
      if (c.length !== 10 || !c[0] || nums.some((q) => q === null) || !(e! > 0) || !Number.isInteger(l) || !Number.isInteger(h) || (c[8] !== "oui" && c[8] !== "non") || (c[9] !== "-" && !/^[0-9a-f]{64}$/.test(c[9]!))) return { erreur: "ligne", ligne: i + 1 };
      fonds.push({ nom: c[0], largeurPx: l!, hauteurPx: h!, altitude: alt!, echelle: e!, rotation: rot!, x: x!, y: y!, cale: c[8] === "oui", empreinte: c[9] === "-" ? null : c[9]! });
    } else if (["auteur", "date", "systeme", "systeme_vertical", "point_de_base_e", "point_de_base_n", "nord_quadrillage_deg", "h_reference"].includes(cle)) {
      if (cle in v) return { erreur: "ligne", ligne: i + 1 };
      v[cle] = valeur.trim();
    } else return { erreur: "ligne", ligne: i + 1 };
    if (niveaux.length + fonds.length > LIGNES_FICHE_MAX) return { erreur: "taille", ligne: i + 1 };
  }
  const date = v["date"] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erreur: "date", ligne: 0 };
  let pointDeBase: PointDeBase | null = null;
  const declares = ["systeme", "point_de_base_e", "point_de_base_n", "nord_quadrillage_deg"].filter((k) => k in v);
  if (declares.length > 0) {
    const e = nombre(v["point_de_base_e"]);
    const nn = nombre(v["point_de_base_n"]);
    const rot = nombre(v["nord_quadrillage_deg"]);
    const p = { e, n: nn, systeme: v["systeme"] ?? "", ...(v["systeme_vertical"] ? { systemeVertical: v["systeme_vertical"] } : {}), rotation: rot === null ? null : ((rot % 360) + 360) % 360 };
    if (!estPointDeBase(p)) return { erreur: "point-de-base", ligne: 0 };
    pointDeBase = p;
  }
  const reference = v["h_reference"] === undefined ? null : nombre(v["h_reference"]);
  if (v["h_reference"] !== undefined && reference === null) return { erreur: "ligne", ligne: 0 };
  return { fiche: { auteur: (v["auteur"] ?? "").slice(0, AUTEUR_MAX), date, pointDeBase, reference, niveaux, fonds } };
}

/** Système normalisé pour la comparaison (« epsg : 2154 » = « EPSG:2154 ») ; jamais d'équivalence devinée. */
export const normaliserSysteme = (s: string): string => s.replace(/\s+/g, "").toUpperCase();

export type EtatSysteme = "identique" | "different" | "absent-fiche" | "absent-projet";

export interface ComparaisonFiche {
  readonly systeme: EtatSysteme;
  readonly systemeFiche: string | null;
  readonly systemeProjet: string | null;
  /** Écarts du point de base (m) et du nord (degrés) ; null si l'un des deux n'est pas déclaré. */
  readonly pointDeBase: { readonly de: number; readonly dn: number; readonly rotation: number } | null;
  /** Écart de l'altitude du ±0,00 (m) ; null si l'une des deux n'est pas déclarée. */
  readonly reference: number | null;
  /** Niveaux de la fiche, appariés par nom : écart d'altitude (m) ou null (absent du projet). */
  readonly niveaux: readonly { readonly nom: string; readonly ecart: number | null }[];
  /** Niveaux du projet absents de la fiche. */
  readonly absentsDeLaFiche: readonly string[];
}

/** Compare une fiche reçue au projet ; rien n'est modifié. */
export function comparerFiche(m: Modele, reference: number | null, f: FicheCalage): ComparaisonFiche {
  const pp = m.annotations?.reglages?.pointDeBase ?? null;
  const pf = f.pointDeBase;
  const systeme: EtatSysteme = !pf ? "absent-fiche" : !pp ? "absent-projet" : normaliserSysteme(pp.systeme) === normaliserSysteme(pf.systeme) ? "identique" : "different";
  const angle = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
  const niveaux = niveauxTries(m);
  return {
    systeme,
    systemeFiche: pf?.systeme ?? null,
    systemeProjet: pp?.systeme ?? null,
    pointDeBase: pf && pp ? { de: pf.e - pp.e, dn: pf.n - pp.n, rotation: angle(pf.rotation, pp.rotation) } : null,
    reference: f.reference !== null && reference !== null ? f.reference - reference : null,
    niveaux: f.niveaux.map((x) => {
      const p = niveaux.find((y) => y.nom === x.nom);
      return { nom: x.nom, ecart: p ? x.altitude - p.altitude : null };
    }),
    absentsDeLaFiche: niveaux.filter((y) => !f.niveaux.some((x) => x.nom === y.nom)).map((y) => y.nom),
  };
}

export type ResultatFiche = { readonly ok: true; readonly modele: Modele; readonly niveauxAjoutes: number; readonly pointDeBase: boolean } | { readonly ok: false; readonly erreur: "systeme" | "vide" };

/**
 * Applique une fiche reçue, en un pas : reprend son point de base (refusé si les deux systèmes sont déclarés et
 * différents) et ajoute les niveaux absents du projet. Un niveau existant n'est jamais modifié ; l'altitude du ±0,00 se
 * règle avec la Planche (hors du dessin) et n'est que comparée.
 */
export function appliquerFiche(m: Modele, f: FicheCalage): ResultatFiche {
  const c = comparerFiche(m, null, f);
  if (c.systeme === "different") return { ok: false, erreur: "systeme" };
  // Même règle d'unicité que niveaux.ts : nom borné à 60 caractères, comparé sans la casse.
  const cle = (nom: string) => nom.trim().slice(0, 60).toLocaleLowerCase("fr");
  const existants = new Set(niveauxTries(m).map((x) => cle(x.nom)));
  const nouveaux = f.niveaux.filter((x, i) => cle(x.nom) !== "" && !existants.has(cle(x.nom)) && f.niveaux.findIndex((y) => cle(y.nom) === cle(x.nom)) === i);
  const pdb = f.pointDeBase && JSON.stringify(f.pointDeBase) !== JSON.stringify(m.annotations?.reglages?.pointDeBase ?? null) ? f.pointDeBase : null;
  if (!pdb && nouveaux.length === 0) return { ok: false, erreur: "vide" };
  const r = modifierAnnotations(m, (a, id) => {
    if (pdb) a.reglages = { ...(a.reglages ?? REGLAGES_DEFAUT), pointDeBase: pdb };
    for (const x of nouveaux) {
      const k = id("n");
      a.niveaux[k] = { id: k, nom: x.nom.trim().slice(0, 60), altitude: x.altitude, hauteur: x.hauteur };
    }
  });
  return { ok: true, modele: r.modele, niveauxAjoutes: nouveaux.length, pointDeBase: pdb !== null };
}

// --- Fichier de calage d'image (world file) -----------------------------------------------------------------------------

/** Six coefficients : E = C + A·i + B·j, N = F + D·i + E·j, (i ; j) centre du pixel (colonne ; ligne), à partir de 0. */
export interface CalageImage {
  readonly a: number;
  readonly d: number;
  readonly b: number;
  readonly e: number;
  readonly c: number;
  readonly f: number;
}
export const EXTENSIONS_CALAGE_IMAGE = ["tfw", "jgw", "pgw", "wld"] as const;

export function lireCalageImage(texte: string): CalageImage | null {
  const v = texte.trim().split(/\s+/);
  if (v.length !== 6 || v.some((s) => !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s))) return null;
  const [a, d, b, e, c, f] = v.map(Number) as [number, number, number, number, number, number];
  if (![a, d, b, e, c, f].every(fini) || Math.abs(a * e - b * d) < 1e-18) return null;
  return { a, d, b, e, c, f };
}

export const ecrireCalageImage = (k: CalageImage): string => `${[k.a, k.d, k.b, k.e, k.c, k.f].map((x) => x.toFixed(10).replace(/0+$/, "").replace(/\.$/, ".0")).join("\n")}\n`;

/**
 * Système lu dans un .prj (WKT 1 ou 2) : code d'autorité du système entier (« EPSG:2154 ») et son nom ; null si illisible.
 * Le code du système entier est le dernier AUTHORITY / ID du texte, celui qui clôt le bloc de premier niveau ; un code
 * interne (ellipsoïde, unité) n'est jamais pris pour lui.
 */
export function systemeDuPrj(wkt: string): { readonly code: string | null; readonly nom: string | null } | null {
  const t = wkt.trim();
  if (!/^[A-Z_0-9]+\[/.test(t) || t.length > 50_000) return null;
  const autorites = [...t.matchAll(/(?:AUTHORITY|ID)\[\s*"([A-Za-z]+)"\s*,\s*"?(\d+)"?\s*\]/g)];
  const dernier = autorites.at(-1);
  const ferme = dernier ? t.slice((dernier.index ?? 0) + dernier[0].length).replace(/\s/g, "") === "]" : false;
  const code = dernier && ferme ? `${dernier[1]!.toUpperCase()}:${dernier[2]}` : null;
  const nom = /^[A-Z_0-9]+\[\s*"([^"]{1,200})"/.exec(t)?.[1] ?? null;
  return code || nom ? { code, nom } : null;
}

export type ErreurCalageImage = "point-de-base" | "cisaillement";

/**
 * Pose d'un fond d'après son fichier de calage, ramenée au dessin par le point de base. `facteur` = côté de l'image
 * réduite / côté de l'original (le fichier de calage décrit les pixels de l'original). Pixels non carrés, cisaillés ou
 * en miroir : refusés (le fond est une similitude).
 */
export function poseDepuisCalageImage(k: CalageImage, p: PointDeBase | null, facteur: number): { readonly pose: PoseFond } | { readonly erreur: ErreurCalageImage } {
  if (!p) return { erreur: "point-de-base" };
  const { est, nord } = axesQuadrillage(p);
  // Point du dessin du pixel continu (u ; v) de l'image réduite.
  const plan = (u: number, v: number) => {
    const i = u / facteur - 0.5;
    const j = v / facteur - 0.5;
    const de = k.c + k.a * i + k.b * j - p.e;
    const dn = k.f + k.d * i + k.e * j - p.n;
    return { x: est.x * de + nord.x * dn, y: est.y * de + nord.y * dn };
  };
  const o = plan(0, 0);
  const pu = plan(1, 0);
  const pv = plan(0, 1);
  const gu = { x: pu.x - o.x, y: pu.y - o.y };
  const gv = { x: pv.x - o.x, y: pv.y - o.y };
  const echelle = Math.hypot(gu.x, gu.y);
  const c = gu.x / echelle;
  const s = gu.y / echelle;
  // versPlan : ∂/∂v = e·(s ; −c).
  if (!(echelle > 0) || Math.hypot(gv.x - echelle * s, gv.y + echelle * c) > 1e-6 * echelle) return { erreur: "cisaillement" };
  return { pose: { echelle, rotation: Math.atan2(s, c), x: o.x, y: o.y } };
}

/**
 * Fichier de calage d'un fond, pour son original (`largeurOriginal` px de large ; à défaut, l'image affichée), dans le
 * système du point de base ; null sans point de base.
 */
export function calageImageDuFond(f: Fond, p: PointDeBase | null, largeurOriginal?: number): CalageImage | null {
  if (!p) return null;
  const facteur = largeurOriginal ? f.largeurPx / largeurOriginal : 1;
  const proj = (i: number, j: number) => {
    const q = versPlan(f.pose, { u: (i + 0.5) * facteur, v: (j + 0.5) * facteur });
    return versProjete(p, { x: q.x, y: q.y, z: 0 }, null);
  };
  const o = proj(0, 0);
  const i1 = proj(1, 0);
  const j1 = proj(0, 1);
  return { a: i1.e - o.e, d: i1.n - o.n, b: j1.e - o.e, e: j1.n - o.n, c: o.e, f: o.n };
}

