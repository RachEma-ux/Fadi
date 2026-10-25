/**
 * Disponibilité hors connexion véridique et préparation du profil hors ligne (B.3-09, EX-043, PERF-10).
 *
 * Un moteur n'est annoncé « disponible hors connexion » que si **chacun** de ses fichiers (carte du build,
 * `chargement.json`) est dans le cache de CE build (`fadi-shell-<build>`) — lu fichier par fichier, jamais supposé.
 * Sans service worker, sans cache de ce build ou sans carte : « non évalué » (null), jamais « disponible ». Un cache de
 * ce build déjà vu par la page puis disparu (purgé) : « non » pour chaque moteur (`cache-purge`).
 * Un outil est disponible hors connexion si tous les moteurs de sa barre le sont (dépendances comprises).
 *
 * « Préparer le profil hors ligne » télécharge les fichiers manquants des moteurs du profil et les range dans le
 * cache de ce build — seulement des fichiers de la carte (empreints `/assets/…`, ou la carte elle-même), jamais une
 * réponse de l'API.
 *
 * Accès au navigateur injecté (`caches`, `fetch`, identifiant du build) : testable sans navigateur.
 */
import { FICHIER_CARTE, fermetureMoteurs, MOTEURS, moteursDeOutil, type IdMoteur } from "./moteurs";
import type { CarteChargement } from "./carte-morceaux";

export interface CacheLike { match(req: string): Promise<unknown>; put(req: string, res: Response): Promise<void> }
export interface CachesLike { has(nom: string): Promise<boolean>; open(nom: string): Promise<CacheLike> }
export interface EnvCache {
  caches: CachesLike | null;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Identifiant du build de la page (`<meta name="fadi-build">`) ; null hors production. */
  build: string | null;
}

export interface VerificationHorsConnexion {
  /** null : non évalué (raison donnée). */
  readonly moteurs: Readonly<Record<IdMoteur, boolean | null>>;
  /** Fichiers absents du cache, par moteur. */
  readonly manquants: Readonly<Record<IdMoteur, readonly string[]>>;
  readonly coquille: boolean | null;
  readonly raison: "evalue" | "sans-service-worker" | "sans-carte" | "sans-cache-du-build" | "cache-purge";
}

export interface OptionsVerification {
  /**
   * Le cache de ce build a déjà été vu sur cet appareil depuis l'ouverture de la page : s'il manque maintenant, il a
   * été purgé (mise à jour du service worker, nettoyage du navigateur) et rien n'est disponible hors connexion
   * (« non », pas « non évalué »).
   */
  readonly cacheConnu?: boolean;
  /**
   * Présence du cache constatée par l'appelant **avant** de lire la carte : la lecture de la carte passe par le
   * service worker, qui peut recréer un cache vide du même nom.
   */
  readonly cachePresent?: boolean;
}

/** Le cache de ce build existe-t-il ? null : non évaluable (sans service worker ou hors production). */
export async function cacheDuBuildPresent(env: EnvCache): Promise<boolean | null> {
  if (!env.caches || !env.build) return null;
  try { return await env.caches.has(`${PREFIXE_CACHE}${env.build}`); } catch { return null; }
}

export const PREFIXE_CACHE = "fadi-shell-";

const vide = <T,>(v: T) => Object.fromEntries(MOTEURS.map((m) => [m.id, v])) as Record<IdMoteur, T>;
const nonEvalue = (raison: VerificationHorsConnexion["raison"]): VerificationHorsConnexion => ({ moteurs: vide(null), manquants: vide([]), coquille: null, raison });

/** Lit la carte du build (servie par le réseau, sinon par le service worker depuis le cache). */
export async function lireCarte(env: Pick<EnvCache, "fetch">): Promise<CarteChargement | null> {
  try {
    const r = await env.fetch(FICHIER_CARTE, { cache: "no-cache" });
    if (!r.ok) return null;
    const c = (await r.json()) as CarteChargement;
    return c && c.version === 1 && c.moteurs ? c : null;
  } catch {
    return null;
  }
}

export async function verifierHorsConnexion(env: EnvCache, carte: CarteChargement | null, o: OptionsVerification = {}): Promise<VerificationHorsConnexion> {
  if (!env.caches || !env.build) return nonEvalue("sans-service-worker");
  // Cache de ce build vu puis disparu : purgé. Constaté avant la carte (le réseau peut déjà servir celle d'un autre build).
  if (o.cacheConnu && !(o.cachePresent ?? (await env.caches.has(`${PREFIXE_CACHE}${env.build}`)))) {
    const fichiers = (id: IdMoteur): readonly string[] => (carte && carte.build === env.build ? carte.moteurs[id]?.fichiers ?? [] : []);
    const manquants = Object.fromEntries(MOTEURS.map((m) => [m.id, fichiers(m.id)])) as Record<IdMoteur, readonly string[]>;
    return { moteurs: vide(false), manquants, coquille: false, raison: "cache-purge" };
  }
  // Carte d'un autre build (page plus ancienne ou plus récente que le cache) : rien n'est déduit.
  if (!carte || carte.build !== env.build) return nonEvalue("sans-carte");
  const nom = `${PREFIXE_CACHE}${env.build}`;
  // `has` d'abord : ouvrir un cache absent le créerait vide.
  if (!(await env.caches.has(nom))) return nonEvalue("sans-cache-du-build");
  const cache = await env.caches.open(nom);
  const absents = async (fichiers: readonly string[]) => {
    const r: string[] = [];
    for (const f of fichiers) if (!(await cache.match(f))) r.push(f);
    return r;
  };
  const manquantsCoquille = await absents(["/index.html", ...carte.initial]);
  const moteurs = vide<boolean | null>(null);
  const manquants = vide<readonly string[]>([]);
  for (const m of MOTEURS) {
    const fichiers = carte.moteurs[m.id]?.fichiers ?? [];
    if (!fichiers.length) continue; // moteur absent de la carte : non évalué
    manquants[m.id] = await absents(fichiers);
  }
  for (const m of MOTEURS) {
    if (!(carte.moteurs[m.id]?.fichiers.length)) continue;
    // Un moteur n'est disponible que si ses dépendances le sont aussi, et la coquille avec.
    moteurs[m.id] = manquantsCoquille.length === 0 && fermetureMoteurs([m.id]).every((d) => (carte.moteurs[d]?.fichiers.length ?? 0) > 0 && manquants[d].length === 0);
  }
  return { moteurs, manquants, coquille: manquantsCoquille.length === 0, raison: "evalue" };
}

/** Outils disponibles / indisponibles hors connexion d'après la vérification ; null si non évalué (cache purgé : aucun). */
export function outilsHorsConnexion<T extends { toolId: string; groupe: string }>(outils: readonly T[], v: VerificationHorsConnexion): { disponibles: T[]; indisponibles: T[] } | null {
  if (v.raison === "cache-purge") return { disponibles: [], indisponibles: [...outils] };
  if (v.raison !== "evalue") return null;
  // Moteurs de l'outil (barre et moteurs propres, lot F2 : le booléen exact demande aussi le noyau exact).
  const ok = (t: T) => { const m = moteursDeOutil(t.toolId, t.groupe); return m !== null && m.every((id) => v.moteurs[id] === true); };
  return { disponibles: outils.filter(ok), indisponibles: outils.filter((t) => !ok(t)) };
}

export interface ResultatPreparation {
  readonly ranges: readonly string[];
  readonly echecs: readonly string[];
  readonly raison: VerificationHorsConnexion["raison"];
}

const ADMIS = /^\/assets\/[^?#]+$/;

/**
 * Télécharge et range dans le cache de ce build les fichiers manquants des moteurs demandés (dépendances et carte
 * comprises). Un fichier hors carte, hors `/assets/` ou en échec n'est jamais rangé ; l'échec est rendu.
 */
export async function preparerHorsConnexion(env: EnvCache, carte: CarteChargement | null, ids: readonly IdMoteur[]): Promise<ResultatPreparation> {
  if (!env.caches || !env.build) return { ranges: [], echecs: [], raison: "sans-service-worker" };
  if (!carte || carte.build !== env.build) return { ranges: [], echecs: [], raison: "sans-carte" };
  const nom = `${PREFIXE_CACHE}${env.build}`;
  if (!(await env.caches.has(nom))) return { ranges: [], echecs: [], raison: "sans-cache-du-build" };
  const cache = await env.caches.open(nom);
  const voulus = new Set<string>([FICHIER_CARTE, ...carte.initial, ...fermetureMoteurs(ids).flatMap((id) => carte.moteurs[id]?.fichiers ?? [])]);
  const ranges: string[] = [], echecs: string[] = [];
  for (const f of voulus) {
    if (f !== FICHIER_CARTE && !ADMIS.test(f)) continue;
    if (await cache.match(f)) continue;
    try {
      const r = await env.fetch(f, { cache: f === FICHIER_CARTE ? "reload" : "default" });
      if (!r.ok) { echecs.push(f); continue; }
      // La carte reçue doit être celle de ce build (un déploiement plus récent servirait la sienne) : sinon, échec.
      if (f === FICHIER_CARTE && ((await r.clone().json().catch(() => null)) as { build?: unknown } | null)?.build !== env.build) { echecs.push(f); continue; }
      await cache.put(f, r);
      ranges.push(f);
    } catch {
      echecs.push(f);
    }
  }
  return { ranges, echecs, raison: "evalue" };
}

/** Environnement réel du navigateur. */
export function envNavigateur(): EnvCache {
  const build = typeof document !== "undefined" ? document.querySelector('meta[name="fadi-build"]')?.getAttribute("content") ?? null : null;
  return {
    caches: typeof caches !== "undefined" ? (caches as unknown as CachesLike) : null,
    fetch: (u, i) => fetch(u, i),
    build,
  };
}
