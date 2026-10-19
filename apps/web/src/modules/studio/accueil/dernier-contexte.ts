/**
 * Dernier contexte personnel de Studio (Plan d'implémentation §2.2) : la dernière variante ouverte par ce compte sur cet
 * appareil, et quelques variantes récentes. C'est une **suggestion**, jamais une permission : l'accueil la fait vérifier
 * par le serveur (lecture de l'étude, droits et archivage compris) avant de la rouvrir, et une adresse demandée prime
 * toujours. Rangée dans le stockage local de l'appareil, par compte ; un stockage indisponible ou illisible vaut
 * « aucune suggestion ». Les noms gardés ne servent qu'à l'affichage en attendant la relecture du serveur. Pur (hors
 * `localStorage`) : ni React ni DOM ; lu aussi par la barre latérale de Fadi.
 */
import { estDomaineStudio, estModePlanche, type DomaineStudio, type ModePlanche } from "../domaines/definitions";

export interface ContexteStudio {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Domaine et planche affichés en dernier (rouverts tels quels). */
  domaine: DomaineStudio | null;
  planche: ModePlanche | null;
  /** Noms relus à l'ouverture (affichage seulement ; le serveur fait foi). */
  noms?: { etude?: string; variante?: string; projet?: string };
  /** Horodatage de la dernière ouverture (ms). */
  quand: number;
}

/** Nombre de variantes récentes conservées (la première est la dernière ouverte). */
export const RECENTS_MAX = 6;
export const cleContextes = (compte: string): string => `fadi.studio.contextes.${compte}`;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Relit une liste stockée ; toute entrée mal formée est écartée (jamais corrigée). */
export function lireContextes(brut: string | null): ContexteStudio[] {
  if (!brut) return [];
  let valeur: unknown;
  try { valeur = JSON.parse(brut); } catch { return []; }
  if (!Array.isArray(valeur)) return [];
  const sortie: ContexteStudio[] = [];
  for (const v of valeur) {
    if (!v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    if (![c.projectId, c.studyId, c.variantId].every((x) => typeof x === "string" && ID.test(x))) continue;
    const domaine = typeof c.domaine === "string" && estDomaineStudio(c.domaine) ? c.domaine : null;
    const planche = typeof c.planche === "string" && estModePlanche(c.planche) ? c.planche : null;
    const noms = c.noms && typeof c.noms === "object" ? Object.fromEntries(Object.entries(c.noms as Record<string, unknown>).filter(([k, x]) => ["etude", "variante", "projet"].includes(k) && typeof x === "string").map(([k, x]) => [k, (x as string).slice(0, 200)])) : undefined;
    sortie.push({ projectId: c.projectId as string, studyId: c.studyId as string, variantId: c.variantId as string, domaine, planche, ...(noms ? { noms } : {}), quand: typeof c.quand === "number" ? c.quand : 0 });
    if (sortie.length >= RECENTS_MAX) break;
  }
  return sortie;
}

const memeVariante = (a: Pick<ContexteStudio, "projectId" | "studyId" | "variantId">, b: Pick<ContexteStudio, "projectId" | "studyId" | "variantId">) =>
  a.projectId === b.projectId && a.studyId === b.studyId && a.variantId === b.variantId;

/** Place `c` en tête (une variante n'y figure qu'une fois), au plus `RECENTS_MAX` entrées. */
export function ajouterContexte(liste: readonly ContexteStudio[], c: ContexteStudio): ContexteStudio[] {
  const precedent = liste.find((x) => memeVariante(x, c));
  const fusion: ContexteStudio = { ...precedent, ...c, noms: { ...precedent?.noms, ...c.noms } };
  return [fusion, ...liste.filter((x) => !memeVariante(x, c))].slice(0, RECENTS_MAX);
}

/** Retire une variante (refusée, introuvable ou archivée à la vérification). */
export const retirerContexte = (liste: readonly ContexteStudio[], c: Pick<ContexteStudio, "projectId" | "studyId" | "variantId">): ContexteStudio[] => liste.filter((x) => !memeVariante(x, c));

function stockage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function contextesDuCompte(compte: string | null | undefined): ContexteStudio[] {
  if (!compte) return [];
  try { return lireContextes(stockage()?.getItem(cleContextes(compte)) ?? null); } catch { return []; }
}

function ecrire(compte: string, liste: readonly ContexteStudio[]): void {
  try { stockage()?.setItem(cleContextes(compte), JSON.stringify(liste)); } catch { /* stockage indisponible : aucune suggestion retenue */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENEMENT_CONTEXTE));
}

/** Événement émis à chaque écriture (la barre latérale relit la suggestion). */
export const EVENEMENT_CONTEXTE = "fadi-studio-contexte";

export function memoriserContexte(compte: string | null | undefined, c: Omit<ContexteStudio, "quand">): void {
  if (!compte) return;
  ecrire(compte, ajouterContexte(contextesDuCompte(compte), { ...c, quand: Date.now() }));
}

export function oublierContexte(compte: string | null | undefined, c: Pick<ContexteStudio, "projectId" | "studyId" | "variantId">): void {
  if (!compte) return;
  ecrire(compte, retirerContexte(contextesDuCompte(compte), c));
}
