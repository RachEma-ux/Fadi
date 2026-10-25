/**
 * Client du noyau exact de Studio (lot F2, IF-003 ④, TEST-015, EX-062) : un Worker dédié (`noyau-exact.worker.ts`),
 * créé à la première demande — l'activation de l'outil « Booléen exact » —, jamais à l'ouverture de Studio. Pur côté
 * logique : la fabrique du Worker est injectée (les tests passent un faux Worker), sans React ni DOM.
 *
 * États : `absent` (aucun Worker), `chargement` (téléchargement et compilation du `.wasm`), `pret`, `echec` (le Worker
 * s'est interrompu, ou son chargement a échoué). Une seule instance du noyau : un seul Worker à la fois, réutilisé
 * d'une opération à l'autre et d'une ouverture de l'outil à l'autre (le coût de maintien est celui d'un Worker inactif).
 *
 * Panne (TEST-015) : une erreur fatale du Worker, une réponse illisible, un délai dépassé ou une coupure arrêtent ce
 * Worker et rejettent **toutes** ses demandes en cours (aucune attente laissée en suspens) avec une `ErreurTache`
 * (`plantage`, `delai`) ; le noyau passe à `echec` et n'est **pas** relancé en silence : la demande suivante est refusée
 * (`indisponible`) jusqu'à la relance explicite (`relancer`, bouton « Relancer le noyau exact »). Le document n'est
 * jamais touché ici : seul un résultat rendu peut, plus tard, être engagé par une commande explicite.
 */
import { ErreurTache } from "../taches/ordonnanceur";
import type { DemandeNoyauExact, ReponseNoyauExact, SuiviWasm } from "./noyau-exact.worker";

export const CLE_WASM_OCCT = "fadi.occt.wasm";
/** Version du noyau distribué (occt-wasm) : contrôlée par test contre `@parcours/geometry-exact` et le paquet installé. */
export const VERSION_OCCT_DISTRIBUEE = "5.6.1";
/** Notice de licence et de provenance du `.wasm` distribué, écrite au build (`vite.config.ts`). */
export const NOTICE_LICENCE_OCCT = "/licences/occt-wasm/NOTICE.txt";
/** Délai d'un premier chargement (téléchargement et compilation du `.wasm`) — borne de sûreté choisie par Fadi. */
export const DELAI_CHARGEMENT_EXACT_MS = 300_000;
/** Délai d'une opération — borne de sûreté choisie par Fadi, pas une mesure de performance. */
export const DELAI_OPERATION_EXACT_MS = 120_000;

export type EtatNoyauExact = "absent" | "chargement" | "pret" | "echec";

/** Sous-ensemble du Worker utilisé (les tests en fournissent un faux). */
export interface WorkerExact {
  postMessage(m: unknown): void;
  terminate(): void;
  addEventListener(type: "message" | "error" | "messageerror", f: (e: MessageEvent | Event) => void): void;
}

export interface MetriquesNoyauExact {
  readonly etat: EtatNoyauExact;
  /** Workers créés depuis l'ouverture de la page (1 tant qu'aucune panne ni libération n'a eu lieu). */
  readonly workersCrees: number;
  /** Workers vivants (0 ou 1 : jamais deux noyaux en même temps). */
  readonly workersVivants: number;
  /** Chargements aboutis du noyau. */
  readonly chargements: number;
  /** Pannes du Worker (interruption, réponse illisible, délai). */
  readonly pannes: number;
  /** Relances explicites. */
  readonly relances: number;
  /** Demandes en attente d'une réponse. */
  readonly enAttente: number;
  /** Dernier suivi transmis par le Worker (instances compilées, tailles du `.wasm`, durée de chargement). */
  readonly suivi: SuiviWasm | null;
  /** Dernière erreur annoncée (français source), ou null. */
  readonly erreur: string | null;
}

export const MESSAGES_NOYAU_EXACT = Object.freeze({
  interrompu: "Le noyau exact s’est interrompu : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact.",
  illisible: "Réponse illisible du noyau exact : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact.",
  delai: "Le noyau exact n’a pas répondu à temps : le calcul est abandonné, le document n’a pas été modifié. Relancez le noyau exact.",
  demarrage: "Le noyau exact n’a pas pu démarrer dans ce navigateur (Web Worker requis).",
  aRelancer: "Noyau exact en échec : relancez-le avant un nouveau calcul.",
  annule: "Calcul exact annulé.",
});

interface Attente { resoudre: (v: unknown) => void; rejeter: (e: Error) => void; minuteur: ReturnType<typeof setTimeout> }

export class NoyauExactStudio {
  private fil: WorkerExact | null = null;
  private suivant = 1;
  private readonly attentes = new Map<number, Attente>();
  private chargement: Promise<void> | null = null;
  private readonly abonnes = new Set<() => void>();
  private m: { -readonly [K in keyof MetriquesNoyauExact]: MetriquesNoyauExact[K] } = { etat: "absent", workersCrees: 0, workersVivants: 0, chargements: 0, pannes: 0, relances: 0, enAttente: 0, suivi: null, erreur: null };
  private instantane: MetriquesNoyauExact = Object.freeze({ ...this.m });

  constructor(private readonly o: { creerWorker: () => WorkerExact; wasm?: () => string | undefined; delaiChargementMs?: number }) {}

  readonly metriques = (): MetriquesNoyauExact => this.instantane;
  readonly abonner = (f: () => void): (() => void) => { this.abonnes.add(f); return () => { this.abonnes.delete(f); }; };
  private publier(): void {
    this.m.enAttente = this.attentes.size;
    this.instantane = Object.freeze({ ...this.m });
    for (const f of this.abonnes) f();
  }

  /** Arrête le Worker courant et rejette toutes ses demandes (aucune attente laissée en suspens). */
  private couper(code: "plantage" | "delai" | "annulee", message: string, etat: EtatNoyauExact): void {
    const f = this.fil;
    this.fil = null;
    this.chargement = null;
    try { f?.terminate(); } catch { /* déjà arrêté */ }
    if (f) this.m.workersVivants = Math.max(0, this.m.workersVivants - 1);
    for (const [, a] of this.attentes) { clearTimeout(a.minuteur); a.rejeter(new ErreurTache(code, message)); }
    this.attentes.clear();
    this.m.etat = etat;
    if (code !== "annulee") { this.m.pannes += 1; this.m.erreur = message; }
    this.publier();
  }

  private obtenirFil(): WorkerExact {
    if (this.fil) return this.fil;
    if (this.m.etat === "echec") throw new ErreurTache("indisponible", MESSAGES_NOYAU_EXACT.aRelancer);
    let w: WorkerExact;
    try { w = this.o.creerWorker(); } catch {
      this.m.etat = "echec"; this.m.erreur = MESSAGES_NOYAU_EXACT.demarrage; this.publier();
      throw new ErreurTache("indisponible", MESSAGES_NOYAU_EXACT.demarrage);
    }
    this.m.workersCrees += 1;
    this.m.workersVivants += 1;
    // Un Worker arrêté ne résout ni ne rejette plus rien : chaque écouteur vérifie qu'il est toujours le Worker courant.
    w.addEventListener("message", (e) => {
      if (this.fil !== w) return;
      const r = (e as MessageEvent<ReponseNoyauExact>).data;
      const a = this.attentes.get(r.id);
      if (r.suivi) this.m.suivi = r.suivi;
      if (!a) { this.publier(); return; }
      this.attentes.delete(r.id);
      clearTimeout(a.minuteur);
      if (r.erreur !== undefined) a.rejeter(new ErreurTache("calcul", r.erreur)); else a.resoudre(r.valeur);
      this.publier();
    });
    w.addEventListener("error", () => { if (this.fil === w) this.couper("plantage", MESSAGES_NOYAU_EXACT.interrompu, "echec"); });
    w.addEventListener("messageerror", () => { if (this.fil === w) this.couper("plantage", MESSAGES_NOYAU_EXACT.illisible, "echec"); });
    this.fil = w;
    this.publier();
    return w;
  }

  private demander<T>(d: Omit<DemandeNoyauExact, "id" | "wasm"> & { op?: unknown }, delaiMs: number, signal?: AbortSignal): Promise<T> {
    let w: WorkerExact;
    try { w = this.obtenirFil(); } catch (e) { return Promise.reject(e); }
    if (signal?.aborted) return Promise.reject(new ErreurTache("annulee", MESSAGES_NOYAU_EXACT.annule));
    const id = this.suivant++;
    return new Promise<T>((resoudre, rejeter) => {
      const minuteur = setTimeout(() => { if (this.fil === w && this.attentes.has(id)) this.couper("delai", MESSAGES_NOYAU_EXACT.delai, "echec"); }, delaiMs);
      this.attentes.set(id, { resoudre: resoudre as (v: unknown) => void, rejeter, minuteur });
      // OCCT calcule de façon synchrone dans le Worker : seule son arrêt libère un calcul abandonné (le noyau sera
      // rechargé à la demande suivante, sans panne comptée).
      signal?.addEventListener("abort", () => { if (this.fil === w && this.attentes.has(id)) this.couper("annulee", MESSAGES_NOYAU_EXACT.annule, "absent"); }, { once: true });
      this.publier();
      w.postMessage({ ...d, id, wasm: this.o.wasm?.() } as DemandeNoyauExact);
    });
  }

  /** Charge le noyau (une fois) : appelé à l'activation de l'outil « Booléen exact », jamais à l'ouverture de Studio. */
  charger(): Promise<void> {
    if (this.m.etat === "pret" && this.fil) return Promise.resolve();
    if (this.chargement) return this.chargement;
    if (this.m.etat === "echec") return Promise.reject(new ErreurTache("indisponible", MESSAGES_NOYAU_EXACT.aRelancer));
    this.m.etat = "chargement";
    this.m.erreur = null;
    this.publier();
    const p = this.demander<{ pret: boolean }>({ nature: "charger" }, this.o.delaiChargementMs ?? DELAI_CHARGEMENT_EXACT_MS).then(() => {
      if (this.chargement !== p) return;
      this.m.etat = "pret"; this.m.chargements += 1; this.publier();
    }, (e: unknown) => {
      if (this.chargement === p) { this.chargement = null; this.couper("plantage", e instanceof Error ? e.message : String(e), "echec"); }
      throw e;
    });
    this.chargement = p;
    return p;
  }

  /** Exécute une opération du noyau (le Worker est chargé d'abord s'il ne l'est pas). */
  async executer<T = unknown>(op: unknown, o: { signal?: AbortSignal; delaiMs?: number } = {}): Promise<T> {
    await this.charger();
    return this.demander<T>({ nature: "operation", op }, o.delaiMs ?? DELAI_OPERATION_EXACT_MS, o.signal);
  }

  /** Relance contrôlée (TEST-015) : un nouveau Worker, un nouveau chargement ; seulement à la demande de l'utilisateur. */
  relancer(): Promise<void> {
    if (this.fil) this.couper("annulee", MESSAGES_NOYAU_EXACT.annule, "absent");
    this.m.etat = "absent";
    this.m.erreur = null;
    this.m.relances += 1;
    this.publier();
    return this.charger();
  }

  /** Coupure du Worker comme le ferait une panne (diagnostic de recette, TEST-015) : rien n'est relancé. */
  interrompre(): void {
    if (this.fil) this.couper("plantage", MESSAGES_NOYAU_EXACT.interrompu, "echec");
  }

  /** Libération (moteur inactif, gestionnaire des ressources) : le Worker est arrêté, rechargé à la prochaine demande. */
  arreter(): void {
    if (this.fil) this.couper("annulee", MESSAGES_NOYAU_EXACT.annule, "absent");
  }
}
