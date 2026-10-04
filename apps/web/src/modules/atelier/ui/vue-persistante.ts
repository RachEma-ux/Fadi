/**
 * Persistance de l'état de vue par projet (L3a.1) : niveau et calque actifs, niveau d'affichage, favoris, calques
 * masqués, plein cadre. Confort par navigateur seulement (`localStorage`, protégé par try/catch) : jamais dans le
 * modèle (R10), jamais une donnée de projet. L'outil actif et la vue 3D ne sont pas conservés.
 */
import { NIVEAUX_AFFICHAGE, type EtatVue } from "../socle";

export const VERSION_VUE = 1;
export const cleVue = (projetId: string) => `fadi.atelier.vue.${projetId}`;

export type StockageVue = Pick<Storage, "getItem" | "setItem">;

type VuePersistee = Pick<EtatVue, "niveauActifId" | "calqueActifId" | "niveauAffichage" | "favoris" | "calquesMasques" | "immersif">;

const chaines = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? [...new Set(v as string[])] : null);
const idOuNull = (v: unknown): string | null | undefined => (v === null ? null : typeof v === "string" && v ? v : undefined);

/** Lit la vue enregistrée ; champs invalides ignorés un à un ; `{}` si rien, corrompu ou stockage indisponible. */
export function lireVue(stockage: StockageVue | null, projetId: string): Partial<EtatVue> {
  if (!stockage) return {};
  let brut: unknown;
  try {
    const texte = stockage.getItem(cleVue(projetId));
    if (!texte) return {};
    brut = JSON.parse(texte);
  } catch {
    return {};
  }
  if (typeof brut !== "object" || brut === null || (brut as { version?: unknown }).version !== VERSION_VUE) return {};
  const b = brut as Record<string, unknown>;
  const vue: { -readonly [K in keyof VuePersistee]?: VuePersistee[K] } = {};
  const niveau = idOuNull(b.niveauActifId);
  if (niveau !== undefined) vue.niveauActifId = niveau;
  const calque = idOuNull(b.calqueActifId);
  if (calque !== undefined) vue.calqueActifId = calque;
  if (typeof b.niveauAffichage === "string" && (NIVEAUX_AFFICHAGE as readonly string[]).includes(b.niveauAffichage)) vue.niveauAffichage = b.niveauAffichage as EtatVue["niveauAffichage"];
  const favoris = chaines(b.favoris);
  if (favoris) vue.favoris = favoris;
  const masques = chaines(b.calquesMasques);
  if (masques) vue.calquesMasques = masques;
  if (typeof b.immersif === "boolean") vue.immersif = b.immersif;
  return vue;
}

/** Enregistre la vue ; rend `false` si le stockage refuse (navigation privée, quota), sans lever. */
export function ecrireVue(stockage: StockageVue | null, projetId: string, vue: EtatVue): boolean {
  if (!stockage) return false;
  const donnees = {
    version: VERSION_VUE,
    niveauActifId: vue.niveauActifId,
    calqueActifId: vue.calqueActifId,
    niveauAffichage: vue.niveauAffichage,
    favoris: vue.favoris,
    calquesMasques: vue.calquesMasques,
    immersif: vue.immersif,
  };
  try {
    stockage.setItem(cleVue(projetId), JSON.stringify(donnees));
    return true;
  } catch {
    return false;
  }
}

/** `localStorage` du navigateur s'il est accessible, sinon `null`. */
export function stockageNavigateur(): StockageVue | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Épingle ou retire un outil des favoris (ordre d'épinglage conservé). */
export function basculerFavori(favoris: readonly string[], outilId: string): string[] {
  return favoris.includes(outilId) ? favoris.filter((id) => id !== outilId) : [...favoris, outilId];
}
