/**
 * Fournisseurs de fonds de carte (D-GD-15) : réglés dans Paramètres, conservés dans le navigateur seulement (les clés ne
 * sont jamais envoyées à l'API Fadi), lus par GeoData pour proposer ses fonds. MapTiler est le fournisseur intégré et
 * par défaut ; sa clé est celle de « Connexion MapTiler ». D'autres fournisseurs se saisissent par un modèle d'adresse
 * de tuiles XYZ en https (`{z}`, `{x}`, `{y}`, et `{cle}` si une clé est exigée) avec une attribution obligatoire.
 * Les conditions d'export d'un fond de fournisseur ne sont pas établies : un tel fond n'est jamais exportable. Pur.
 */

/** Stockage local de ce navigateur (même origine) : réglages des fournisseurs, puis clés MapTiler (Paramètres, Parcelle). */
export const CLE_STOCKAGE_FOURNISSEURS = "fadi.fournisseurs-carte.v1";
export const CLE_SESSION_MAPTILER = "fadi.maptiler.session-key";
export const CLE_LOCALE_MAPTILER = "parcelle-maptiler-key-v1";
/** Préfixe des identifiants de fonds venus d'un fournisseur du navigateur (jamais configurés au serveur). */
export const PREFIXE_FOND_NAVIGATEUR = "navigateur:";

export interface StyleFournisseur { readonly id: string; readonly libelle: string; readonly modele: string }

export interface FournisseurCarte {
  readonly id: string;
  readonly nom: string;
  /** `maptiler` : intégré, clé de « Connexion MapTiler » ; `xyz` : saisi par l'utilisateur. */
  readonly type: "maptiler" | "xyz";
  readonly actif: boolean;
  /** Clé propre d'un fournisseur `xyz` (null si son modèle n'en demande pas). */
  readonly cle: string | null;
  readonly attribution: string;
  readonly zoomMax: number | null;
  readonly styles: readonly StyleFournisseur[];
}

export interface ReglagesFournisseurs { readonly fournisseurs: readonly FournisseurCarte[]; readonly defaut: string | null }

const MT = "https://api.maptiler.com/maps";
/** Fonds raster de MapTiler (adresses publiques de l'API Maps, tuiles 256 px). */
export const FOURNISSEUR_MAPTILER: FournisseurCarte = {
  id: "maptiler", nom: "MapTiler", type: "maptiler", actif: true, cle: null,
  attribution: "© MapTiler © OpenStreetMap contributors", zoomMax: null,
  styles: [
    { id: "satellite", libelle: "Satellite", modele: `${MT}/satellite/256/{z}/{x}/{y}.jpg?key={cle}` },
    { id: "hybride", libelle: "Satellite et noms", modele: `${MT}/hybrid/256/{z}/{x}/{y}.jpg?key={cle}` },
    { id: "plan", libelle: "Plan", modele: `${MT}/streets-v2/256/{z}/{x}/{y}.png?key={cle}` },
    { id: "topographique", libelle: "Topographique", modele: `${MT}/topo-v2/256/{z}/{x}/{y}.png?key={cle}` },
  ],
};

export const REGLAGES_PAR_DEFAUT: ReglagesFournisseurs = { fournisseurs: [FOURNISSEUR_MAPTILER], defaut: FOURNISSEUR_MAPTILER.id };

export type Validation<T> = { readonly ok: true; readonly valeur: T } | { readonly ok: false; readonly erreurs: readonly string[] };

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const texte = (x: unknown) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "");

/** Modèle d'adresse de tuiles : https, `{z}`, `{x}`, `{y}` ; aucun autre jeton que `{cle}`. */
export function validerModele(modele: string): string[] {
  const e: string[] = [];
  let u: URL | null = null;
  try { u = new URL(modele.replace(/\{(z|x|y|cle)\}/g, "0")); } catch { e.push("Adresse de tuiles invalide."); }
  if (u && u.protocol !== "https:") e.push("L'adresse de tuiles doit être en https.");
  for (const j of ["{z}", "{x}", "{y}"]) if (!modele.includes(j)) e.push(`L'adresse de tuiles doit contenir ${j}.`);
  if (/\{(?!(z|x|y|cle)\})[^}]*\}/.test(modele)) e.push("Seuls les jetons {z}, {x}, {y} et {cle} sont admis.");
  return e;
}

/** Saisie d'un fournisseur XYZ (Paramètres) : nom, modèle, clé si `{cle}`, attribution obligatoire, zoom maximal 1–24. */
export function validerFournisseurSaisi(x: { nom: unknown; modele: unknown; cle: unknown; attribution: unknown; zoomMax: unknown }, id: string, autresNoms: readonly string[] = []): Validation<FournisseurCarte> {
  const erreurs: string[] = [];
  const nom = texte(x.nom);
  const modele = typeof x.modele === "string" ? x.modele.trim() : "";
  const cle = typeof x.cle === "string" && x.cle.trim() ? x.cle.trim() : null;
  const attribution = texte(x.attribution);
  const z = x.zoomMax === "" || x.zoomMax === null || x.zoomMax === undefined ? null : Number(x.zoomMax);
  if (!ID.test(id) || id === FOURNISSEUR_MAPTILER.id) erreurs.push("Identifiant de fournisseur invalide.");
  if (nom.length < 2 || nom.length > 60) erreurs.push("Le nom compte de 2 à 60 caractères.");
  else if (autresNoms.some((n) => n.toLowerCase() === nom.toLowerCase())) erreurs.push("Un fournisseur porte déjà ce nom.");
  erreurs.push(...validerModele(modele));
  if (modele.includes("{cle}") && !cle) erreurs.push("Cette adresse demande une clé ({cle}) : saisissez-la.");
  if (cle && cle.length > 300) erreurs.push("Clé trop longue.");
  if (attribution.length < 3 || attribution.length > 200) erreurs.push("Attribution obligatoire (conditions du fournisseur), 3 à 200 caractères.");
  if (z !== null && !(Number.isInteger(z) && z >= 1 && z <= 24)) erreurs.push("Zoom maximal : entier de 1 à 24, ou vide.");
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, valeur: { id, nom, type: "xyz", actif: true, cle, attribution, zoomMax: z, styles: [{ id: "fond", libelle: nom, modele }] } };
}

/**
 * Relit les réglages conservés (JSON du stockage local) : un fournisseur illisible est écarté, MapTiler est toujours
 * présent (désactivable, jamais supprimé) ; sans réglage, MapTiler est le fournisseur par défaut.
 */
export function lireReglagesFournisseurs(brut: unknown): ReglagesFournisseurs {
  let x: unknown = brut;
  if (typeof brut === "string") { try { x = JSON.parse(brut); } catch { x = null; } }
  if (!x || typeof x !== "object") return REGLAGES_PAR_DEFAUT;
  const r = x as { fournisseurs?: unknown; defaut?: unknown };
  const liste: FournisseurCarte[] = [];
  let maptilerActif = true;
  for (const f of Array.isArray(r.fournisseurs) ? r.fournisseurs : []) {
    if (!f || typeof f !== "object") continue;
    const g = f as Record<string, unknown>;
    if (g["type"] === "maptiler") { maptilerActif = g["actif"] !== false; continue; }
    const modele = Array.isArray(g["styles"]) ? (g["styles"][0] as { modele?: unknown } | undefined)?.modele : undefined;
    const v = validerFournisseurSaisi({ nom: g["nom"], modele, cle: g["cle"], attribution: g["attribution"], zoomMax: g["zoomMax"] }, String(g["id"] ?? ""), liste.map((k) => k.nom));
    if (v.ok) liste.push({ ...v.valeur, actif: g["actif"] !== false });
  }
  const fournisseurs = [{ ...FOURNISSEUR_MAPTILER, actif: maptilerActif }, ...liste];
  const defaut = typeof r.defaut === "string" && fournisseurs.some((f) => f.id === r.defaut) ? r.defaut : r.defaut === null ? null : FOURNISSEUR_MAPTILER.id;
  return { fournisseurs, defaut };
}

/** Fond utilisable par GeoData (même forme que les fonds configurés au serveur). */
export interface FondFournisseur {
  readonly id: string; readonly libelle: string; readonly type: "raster"; readonly tuiles: string[]; readonly attribution: string;
  readonly export: false; readonly zoomMax: number | null; readonly fournisseurId: string;
}

/** Fournisseur actif mais inutilisable (clé absente) : signalé, jamais remplacé par un fond inventé. */
export interface FournisseurSansCle { readonly fournisseurId: string; readonly nom: string }

/** Fonds des fournisseurs actifs, clés insérées ; un fournisseur sans la clé qu'il exige ne donne aucun fond. */
export function fondsDesFournisseurs(r: ReglagesFournisseurs, cleMaptiler: string): { fonds: FondFournisseur[]; sansCle: FournisseurSansCle[] } {
  const fonds: FondFournisseur[] = [];
  const sansCle: FournisseurSansCle[] = [];
  for (const f of r.fournisseurs) {
    if (!f.actif) continue;
    const cle = f.type === "maptiler" ? cleMaptiler.trim() : f.cle ?? "";
    if (f.styles.some((s) => s.modele.includes("{cle}")) && !cle) { sansCle.push({ fournisseurId: f.id, nom: f.nom }); continue; }
    for (const s of f.styles) {
      fonds.push({
        id: `${PREFIXE_FOND_NAVIGATEUR}${f.id}:${s.id}`, libelle: f.styles.length > 1 ? `${f.nom} — ${s.libelle}` : f.nom, type: "raster",
        tuiles: [s.modele.replaceAll("{cle}", encodeURIComponent(cle))], attribution: f.attribution, export: false, zoomMax: f.zoomMax, fournisseurId: f.id,
      });
    }
  }
  return { fonds, sansCle };
}

/** Fond par défaut d'une nouvelle carte : premier fond du fournisseur par défaut, s'il est utilisable ; sinon null (fond neutre). */
export function fondParDefaut(r: ReglagesFournisseurs, fonds: readonly FondFournisseur[]): string | null {
  return r.defaut ? fonds.find((f) => f.fournisseurId === r.defaut)?.id ?? null : null;
}
