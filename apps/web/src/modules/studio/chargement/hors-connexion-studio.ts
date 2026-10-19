/**
 * État hors connexion de la session Studio (B.3-09, B.3-10, PERF-10) : vérification du cache de ce build, préparation
 * du profil hors ligne, protection de la file locale pendant une mise à jour du service worker.
 *
 * - `verifier()` lit la carte du build et le cache (`cache-hors-ligne.ts`), pose le résultat dans le gestionnaire
 *   des ressources et relève PERF-10 (durée de la vérification, outils disponibles / indisponibles) ;
 * - `preparer()` range dans le cache les fichiers manquants des moteurs du profil, puis revérifie ;
 * - `protegerFileLocale()` : quand des commandes non synchronisées sont conservées sur l'appareil, demande au
 *   navigateur un stockage persistant (`navigator.storage.persist`) pour qu'une éviction sous pression de quota ne
 *   les emporte pas (EX-044) ; le refus est affiché tel quel ;
 * - une mise à jour du service worker (`fadi-sw-active`, `controllerchange`) est notée et affichée : la page ne se
 *   recharge pas d'elle-même, la file locale (IndexedDB) reste intacte — le service worker n'y touche jamais. Chaque
 *   activation ou changement de contrôleur relance `verifier()` : si le cache du build de la page a été purgé (vu puis
 *   disparu), la disponibilité hors connexion passe à « non » (`cache-purge`) et le Tool Manager l'annonce.
 */
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { localStore } from "../../../lib/local-store";
import { cacheDuBuildPresent, envNavigateur, lireCarte, outilsHorsConnexion, preparerHorsConnexion, verifierHorsConnexion, type EnvCache, type ResultatPreparation, type VerificationHorsConnexion } from "./cache-hors-ligne";
import { MOTEURS, type IdMoteur } from "./moteurs";
import { perfStudio } from "./perf";
import { ressourcesStudio } from "./ressources-studio";

export type Persistance = "persistant" | "non-persistant" | "refuse" | "non-evalue";

export interface MiseAJourSw { readonly build: string | null; readonly ancienGarde: string | null; readonly a: string }

export interface EtatHorsConnexion {
  readonly verification: VerificationHorsConnexion | null;
  readonly indisponibles: readonly string[] | null;
  readonly enCours: "aucun" | "verification" | "preparation";
  readonly preparation: ResultatPreparation | null;
  readonly persistance: Persistance;
  /** Commandes locales non synchronisées conservées (brouillons) ; null = non évalué. */
  readonly fileLocale: number | null;
  readonly miseAJour: MiseAJourSw | null;
}

let etat: EtatHorsConnexion = { verification: null, indisponibles: null, enCours: "aucun", preparation: null, persistance: "non-evalue", fileLocale: null, miseAJour: null };
const abonnes = new Set<() => void>();
const publier = (s: Partial<EtatHorsConnexion>) => { etat = { ...etat, ...s }; for (const f of abonnes) f(); };
export const lireHorsConnexion = (): EtatHorsConnexion => etat;
export const abonnerHorsConnexion = (f: () => void): (() => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

let env: EnvCache | null = null;
const environnement = () => (env ??= envNavigateur());

/** Le cache du build de la page a été vu depuis l'ouverture de la page (sa disparition ensuite est une purge). */
let cacheVu = false;
/**
 * Purge constatée : elle reste annoncée tant que la coquille n'est pas de nouveau entière dans le cache (un service
 * worker encore actif peut recréer un cache vide du même nom, ce qui n'est pas une restauration).
 */
let purgeConstatee = false;

export async function verifier(): Promise<VerificationHorsConnexion> {
  publier({ enCours: "verification" });
  const mesure = perfStudio.debut("PERF-10", { operation: "verification-cache" });
  const e = environnement();
  // Présence relevée avant la carte : sa lecture passe par le service worker, qui peut recréer le cache vide.
  const present = cacheVu ? await cacheDuBuildPresent(e) : null;
  let v = await verifierHorsConnexion(e, await lireCarte(e), { cacheConnu: cacheVu, ...(present === null ? {} : { cachePresent: present }) });
  if (v.raison === "cache-purge") purgeConstatee = true;
  else if (purgeConstatee && v.raison === "evalue" && v.coquille === false) {
    v = { ...v, moteurs: Object.fromEntries(Object.keys(v.moteurs).map((k) => [k, false])) as VerificationHorsConnexion["moteurs"], raison: "cache-purge" };
  } else if (v.raison === "evalue") purgeConstatee = false;
  if (v.raison === "evalue") cacheVu = true;
  ressourcesStudio.poserHorsConnexion(v.moteurs);
  const outils = outilsHorsConnexion(STUDIO_TOOLS, v);
  mesure.fin({ raison: v.raison, disponibles: outils?.disponibles.length ?? -1, indisponibles: outils?.indisponibles.length ?? -1 });
  publier({ verification: v, indisponibles: outils ? outils.indisponibles.map((t) => t.toolId) : null, enCours: "aucun" });
  return v;
}

/** Profil hors ligne : tous les moteurs des outils du registre (le profil des barres ne retire aucun outil du catalogue). */
export const MOTEURS_PROFIL: readonly IdMoteur[] = MOTEURS.map((m) => m.id);

export async function preparer(ids: readonly IdMoteur[] = MOTEURS_PROFIL): Promise<ResultatPreparation> {
  publier({ enCours: "preparation" });
  const r = await preparerHorsConnexion(environnement(), await lireCarte(environnement()), ids);
  publier({ preparation: r });
  await verifier();
  return r;
}

export async function protegerFileLocale(userId: string | null): Promise<Persistance> {
  const n = userId ? await localStore.studioCompterBrouillons(userId) : null;
  const storage = typeof navigator !== "undefined" ? (navigator.storage as StorageManager | undefined) : undefined;
  let p: Persistance = "non-evalue";
  try {
    if (storage?.persisted) {
      p = (await storage.persisted()) ? "persistant" : "non-persistant";
      if (p === "non-persistant" && (n ?? 0) > 0 && storage.persist) p = (await storage.persist()) ? "persistant" : "refuse";
    }
  } catch { p = "non-evalue"; }
  publier({ fileLocale: n, persistance: p });
  return p;
}

let ecoute = false;
/** Écoute des mises à jour du service worker (une fois par page). */
export function ecouterMisesAJour(): void {
  if (ecoute || typeof navigator === "undefined" || !navigator.serviceWorker) return;
  ecoute = true;
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    const d = e.data as { type?: string; build?: string; ancienGarde?: string | null; precedents?: number } | null;
    // Première installation (aucun build précédent) : ce n'est pas une mise à jour.
    if (d?.type !== "fadi-sw-active") return;
    if ((d.precedents ?? 0) > 0) publier({ miseAJour: { build: d.build ?? null, ancienGarde: d.ancienGarde ?? null, a: new Date().toISOString() } });
    // L'activation a pu purger le cache du build de cette page : la disponibilité hors connexion est relue.
    void verifier();
  });
  // Un changement de contrôleur alors qu'un service worker contrôlait déjà la page : mise à jour.
  let controleur = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controleur && !etat.miseAJour) publier({ miseAJour: { build: null, ancienGarde: null, a: new Date().toISOString() } });
    controleur = navigator.serviceWorker.controller;
    void verifier();
  });
}

/** Pour les tests : environnement injecté et état remis à zéro. */
export function _reinitialiser(e: EnvCache | null): void {
  env = e;
  cacheVu = false;
  purgeConstatee = false;
  ecoute = false;
  etat = { verification: null, indisponibles: null, enCours: "aucun", preparation: null, persistance: "non-evalue", fileLocale: null, miseAJour: null };
}
