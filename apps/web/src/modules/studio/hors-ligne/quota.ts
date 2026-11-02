/**
 * Quota de stockage et version du build de la file locale de Studio (EX-044, TR-EX-044).
 *
 * EX-044 : « Le système conserve la correspondance buildId ↔ toolContractVersion ↔ schemaVersion, protège les commandes
 * en attente et évite qu'une mise à jour invalide une opération locale sans explication. Les politiques d'éviction
 * doivent respecter les limites de quota et préserver prioritairement les données non synchronisées. »
 *
 * - `contratsLocaux()` : la correspondance écrite avec chaque brouillon (build de la page, contrat des commandes,
 *   schéma du document, version du manifeste des outils) ; relue, elle dit quel build a écrit la file.
 * - `planEviction` : sur un dépassement de quota, seules les **versions lues mises en cache** (`studioContextes`,
 *   régénérables depuis le serveur) sont évincées, les plus anciennes d'abord, jamais celle de la variante ouverte ;
 *   les brouillons (commandes non synchronisées) ne sont **jamais** évincés.
 * - `estErreurQuota` : reconnaît le dépassement (`QuotaExceededError`, y compris enveloppé par Dexie ou par
 *   `LocalPersistenceError`).
 *
 * Pur : ni React, ni DOM, ni IndexedDB.
 */
import { STUDIO_CONTRACT, STUDIO_MANIFESTE_OUTILS_VERSION } from "@parcours/atelier-model";

export const SCHEMA_DOCUMENT_FILE = "studio-document/1";

export interface ContratsFileLocale {
  /** Build qui a écrit la file (balise `fadi-build` de la page, sinon l'identifiant du build) ; null hors build. */
  readonly build: string | null;
  readonly commandes: string;
  readonly document: string;
  readonly manifeste: string;
}

/** Build de la page courante. */
export function buildDeLaPage(): string | null {
  if (typeof document !== "undefined") {
    const m = document.querySelector('meta[name="fadi-build"]')?.getAttribute("content");
    if (m) return m;
  }
  return typeof __FADI_BUILD__ !== "undefined" ? __FADI_BUILD__ : null;
}

export const contratsLocaux = (build: string | null = buildDeLaPage()): ContratsFileLocale =>
  ({ build, commandes: STUDIO_CONTRACT, document: SCHEMA_DOCUMENT_FILE, manifeste: STUDIO_MANIFESTE_OUTILS_VERSION });

/** Lit la correspondance enregistrée avec un brouillon (null pour une file écrite avant EX-044). */
export function lireContrats(v: unknown): ContratsFileLocale | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if ((c.build !== null && typeof c.build !== "string") || typeof c.commandes !== "string" || typeof c.document !== "string" || typeof c.manifeste !== "string") return null;
  return { build: c.build as string | null, commandes: c.commandes, document: c.document, manifeste: c.manifeste };
}

/** Le dépassement de quota du stockage, éventuellement enveloppé (Dexie `inner`, `cause`). */
export function estErreurQuota(e: unknown, profondeur = 0): boolean {
  if (!e || typeof e !== "object" || profondeur > 4) return false;
  const x = e as { name?: unknown; code?: unknown; inner?: unknown; cause?: unknown };
  if (x.name === "QuotaExceededError" || x.code === 22) return true;
  return estErreurQuota(x.inner, profondeur + 1) || estErreurQuota(x.cause, profondeur + 1);
}

export interface EntreeEvincable { readonly cle: string; readonly luA: string }

/**
 * Clés des versions lues à évincer pour libérer de la place : les plus anciennes d'abord, jamais `garder` (variante
 * ouverte). Les brouillons ne figurent jamais dans les entrées : ils ne sont pas évincables.
 */
export function planEviction(contextes: readonly EntreeEvincable[], garder: ReadonlySet<string>): string[] {
  return [...contextes].filter((c) => !garder.has(c.cle)).sort((a, b) => a.luA.localeCompare(b.luA) || a.cle.localeCompare(b.cle)).map((c) => c.cle);
}

export const MESSAGE_QUOTA = "Espace de stockage de l’appareil plein : les versions lues en cache ont été libérées, mais le brouillon n’a pas pu être conservé. Il reste dans cette page : enregistrez dès que possible, ne fermez pas la page.";
