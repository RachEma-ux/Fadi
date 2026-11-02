/**
 * Accès IndexedDB du Studio hors ligne (tables `studioBrouillons` et `studioContextes` de `lib/local-store.ts`).
 * Chaque ligne appartient à un utilisateur (clé et champ `userId`) : la lecture d'une ligne d'un autre compte rend
 * « absent ». Les écritures du brouillon sont comparées puis écrites (jeton `stamp`) : si un autre onglet a écrit
 * depuis la dernière lecture de celui-ci, rien n'est écrasé et l'appelant affiche le conflit. Elles sont confirmées
 * ou lèvent `LocalPersistenceError`. La mémoire des dernières versions lues reste facultative.
 * La première écriture d'un brouillon (ligne créée) relance la demande de stockage persistant (`protegerFileLocale`) :
 * une file locale née après l'ouverture de Studio est protégée de l'éviction dès qu'elle existe (EX-044).
 */
import type { StudioContext } from "../../../lib/api";
import { localStore, type StudioBrouillonEntry } from "../../../lib/local-store";
import { protegerFileLocale } from "../chargement/hors-connexion-studio";
import { migrerBrouillon, type RaisonIncompatible } from "./contrats";
import { buildDeLaPage, estErreurQuota, planEviction } from "./quota";
import { horsLigneVide, lireHorsLigne, type BrouillonHorsLigne } from "./persistance";

export interface BrouillonLu {
  brouillon: BrouillonHorsLigne; stamp: string;
  /** Format antérieur migré en mémoire (la ligne reste intacte). */ migreDe?: number;
  /** File écrite par un autre build (mise à jour de l'application) aux contrats compatibles : conservée et rejouable (EX-044). */
  autreBuild?: string;
}

/** File locale conservée mais incompatible avec les contrats de ce build (B.3-11) : rien n'est envoyé ni effacé. */
export class ErreurFileLocale extends Error {
  constructor(readonly raison: RaisonIncompatible, readonly entree: StudioBrouillonEntry) {
    super(raison);
    this.name = "ErreurFileLocale";
  }
}

/**
 * Lit le brouillon conservé : migré au format courant s'il le faut (`contrats.ts`), en mémoire seulement. Lève
 * `ErreurFileLocale` (ligne brute jointe, pour l'export) s'il est incompatible ou illisible.
 */
export async function lireBrouillonHorsLigne(cle: string, userId: string): Promise<BrouillonLu | null> {
  const entree = await localStore.studioBrouillon(cle, userId);
  if (!entree) return null;
  const m = migrerBrouillon(entree.donnees);
  if (m.type === "incompatible") throw new ErreurFileLocale(m.raison, entree);
  try {
    const brouillon = lireHorsLigne(m.json, userId);
    const ecritPar = brouillon.contrats?.build ?? null;
    const courant = buildDeLaPage();
    return { brouillon, stamp: entree.stamp, ...(m.type === "migre" ? { migreDe: m.de } : {}), ...(ecritPar && courant && ecritPar !== courant ? { autreBuild: ecritPar } : {}) };
  } catch {
    throw new ErreurFileLocale("illisible", entree);
  }
}

/** Ligne brute conservée (export explicite de la file locale), ou null. */
export const brouillonBrut = (cle: string, userId: string): Promise<StudioBrouillonEntry | null> => localStore.studioBrouillon(cle, userId);

/** Jeton de la ligne telle qu'elle est maintenant (null si absente), pour reprendre après un conflit d'onglets. */
export async function jetonActuel(cle: string, userId: string): Promise<string | null> {
  return (await localStore.studioBrouillon(cle, userId))?.stamp ?? null;
}

export type Ecriture = { type: "ecrit"; stamp: string; evinces?: number } | { type: "retire" } | { type: "autre-onglet" } | { type: "quota"; evinces: number };

/**
 * Écrit le brouillon (ou le retire quand il n'y a plus rien à conserver) si la ligne porte encore le jeton `attendu`
 * (celui de la dernière lecture ou écriture de cet onglet). Sinon : `autre-onglet`, rien n'est modifié.
 */
export async function ecrireBrouillonHorsLigne(cle: string, h: BrouillonHorsLigne, attendu: string | null): Promise<Ecriture> {
  if (horsLigneVide(h)) return (await localStore.studioSupprimerBrouillonSi(cle, attendu)) ? { type: "retire" } : { type: "autre-onglet" };
  const stamp = crypto.randomUUID();
  const entree = { cle, userId: h.userId, projectId: h.base.study.projectId, stamp, donnees: JSON.stringify(h), majA: new Date().toISOString() };
  let ok: boolean;
  let evinces = 0;
  try {
    ok = await localStore.studioEcrireBrouillonSi(entree, attendu);
  } catch (e) {
    if (!estErreurQuota(e)) throw e;
    // EX-044 : quota atteint — seules les versions lues en cache (régénérables) sont évincées, jamais un brouillon ;
    // la variante ouverte garde la sienne. Un seul nouvel essai ; sinon l'appelant l'annonce (rien n'est purgé).
    const cles = planEviction(await localStore.studioContextesDe(h.userId), new Set([cle]));
    for (const c of cles) if (await localStore.studioSupprimerContexte(c)) evinces += 1;
    try { ok = await localStore.studioEcrireBrouillonSi(entree, attendu); }
    catch (e2) { if (estErreurQuota(e2)) return { type: "quota", evinces }; throw e2; }
  }
  if (ok && attendu === null) void protegerFileLocale(h.userId).catch(() => undefined);
  return ok ? { type: "ecrit", stamp, ...(evinces ? { evinces } : {}) } : { type: "autre-onglet" };
}

/** Retrait après un enregistrement confirmé : seulement si aucun autre onglet n'a écrit depuis. */
export async function retirerBrouillonHorsLigne(cle: string, attendu: string | null): Promise<boolean> {
  return localStore.studioSupprimerBrouillonSi(cle, attendu);
}

/**
 * Abandon explicite, confirmé par l'utilisateur, de la ligne **telle qu'elle a été exportée** (jeton `jetonExporte`) :
 * si un autre onglet l'a réécrite depuis l'export, rien n'est retiré (faux) et un nouvel export est demandé.
 */
export const abandonnerBrouillonHorsLigne = (cle: string, jetonExporte: string): Promise<boolean> => localStore.studioSupprimerBrouillonSi(cle, jetonExporte);

export function memoriserContexte(cle: string, userId: string, c: StudioContext): Promise<void> {
  return localStore.studioMemoriserContexte({ cle, userId, projectId: c.study.projectId, contexte: JSON.stringify(c), luA: new Date().toISOString() });
}

export async function contexteMemorise(cle: string, userId: string): Promise<{ contexte: StudioContext; luA: string } | null> {
  const e = await localStore.studioContexte(cle, userId);
  if (!e) return null;
  try { return { contexte: JSON.parse(e.contexte) as StudioContext, luA: e.luA }; }
  catch { return null; }
}
