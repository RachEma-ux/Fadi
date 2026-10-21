/**
 * Journal des modifications d'une Planche de Sandbox (page Informations, carte « Historique ») : une entrée par
 * modification (date, auteur, description), conservée avec la Planche dans ce navigateur. Les 200 dernières sont gardées ;
 * la page n'en affiche que les 5 plus récentes. Deux entrées identiques à moins d'une minute d'écart n'en font qu'une
 * (un tracé de vingt segments n'inonde pas la chronologie). Partie pure séparée des écritures locales.
 * Auteur : le Sandbox n'a ni projet ni compte lu (aucune relation avec le client d'API) ; l'auteur est donc « Vous »,
 * la personne qui utilise ce navigateur.
 */
import { localStore } from "../../../lib/local-store";
import { cleDe } from "./brouillon";

export const FORMAT_JOURNAL = "sandbox-planche-journal/1";
export const JOURNAL_MAX = 200;
export const JOURNAL_AFFICHE = 5;
const FUSION_MS = 60_000;

export interface EntreeJournal {
  /** Date ISO de la modification. */
  readonly a: string;
  readonly auteur: string;
  readonly description: string;
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function lireJournal(texte: string | null): EntreeJournal[] {
  if (!texte) return [];
  try {
    const brut: unknown = JSON.parse(texte);
    if (!estObjet(brut) || brut["format"] !== FORMAT_JOURNAL || !Array.isArray(brut["entrees"])) return [];
    return brut["entrees"].filter((e): e is EntreeJournal => estObjet(e) && typeof e["a"] === "string" && typeof e["auteur"] === "string" && typeof e["description"] === "string" && !Number.isNaN(Date.parse(e["a"] as string))).slice(-JOURNAL_MAX);
  } catch {
    return [];
  }
}

export const serialiserJournal = (j: readonly EntreeJournal[]): string => JSON.stringify({ format: FORMAT_JOURNAL, entrees: j.slice(-JOURNAL_MAX) });

/** Journal avec la nouvelle entrée en queue ; fusionnée avec la dernière si même description, même auteur, moins d'une minute. */
export function ajouterEntree(j: readonly EntreeJournal[], e: EntreeJournal): EntreeJournal[] {
  const derniere = j[j.length - 1];
  if (derniere && derniere.description === e.description && derniere.auteur === e.auteur && Date.parse(e.a) - Date.parse(derniere.a) < FUSION_MS) return [...j.slice(0, -1), e].slice(-JOURNAL_MAX);
  return [...j, e].slice(-JOURNAL_MAX);
}

/** Les `n` plus récentes, la plus récente d'abord. */
export const dernieresEntrees = (j: readonly EntreeJournal[], n = JOURNAL_AFFICHE): EntreeJournal[] => j.slice(-n).reverse();

/** « jj.mm.aaaa hh.mm » (heure locale). */
export function formaterDateJournal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

const cleJournal = (id: string): string => `${cleDe(id)}/journal`;

export async function chargerJournal(id: string): Promise<EntreeJournal[]> {
  try {
    return lireJournal(await localStore.getValueChecked(cleJournal(id)));
  } catch {
    return [];
  }
}
export async function enregistrerJournal(id: string, j: readonly EntreeJournal[]): Promise<void> {
  await localStore.setValueChecked(cleJournal(id), serialiserJournal(j));
}
export async function supprimerJournal(id: string): Promise<void> {
  await localStore.removeValue(cleJournal(id));
}
