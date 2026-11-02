/**
 * Ordonnanceur des tâches lourdes de Studio (D.1-01/03, D.2-01…07) : une file à deux classes et une concurrence bornée,
 * au-dessus d'un exécuteur (le groupe de Workers de `pool-studio.ts`, ou un faux exécuteur dans les tests).
 *
 * Classes et priorité
 * - `interactive` (désignation, aperçu : feuille) passe toujours avant `fond` (maillage 3D, quantités, lecture DXF).
 * - Concurrence bornée : `concurrence` emplacements au total (2 par défaut), dont `concurrenceFond` au plus pour le
 *   fond (1 par défaut) : un emplacement reste toujours libre pour une tâche interactive. Ce n'est pas un Worker par
 *   cœur logique : un seul groupe partagé, de taille fixe, choisie par Fadi (borne de sûreté, pas une mesure).
 *
 * Tâche
 * - Clé logique (`cle`, par exemple « studio.maillage-3d ») et empreinte d'entrée (`empreinte.ts` : révision du
 *   document + hachage des paramètres).
 * - État explicite (IF-007) : queued → loading → running → done (`completed` du contrat) | failed | cancelled |
 *   timed-out, avec les branches cancel_requested (demande d'annulation coopérative) et superseded (remplacée par une
 *   tâche plus récente de la même clé) ; stale pour le résultat arrivé après ce remplacement. `loading` n'existe que
 *   si l'exécuteur annonce qu'il doit d'abord charger (`aCharger` : Worker ou noyau pas encore prêt) ; il passe à
 *   `running` quand l'exécuteur le signale (`demarre`), à la première progression, ou à l'issue. Chaque changement
 *   d'état est noté avec la **révision source** de la tâche (`historique`, journal) — table de correspondance avec les
 *   noms du contrat : `STATUTS_IF007`.
 * - Annulation coopérative (IF-007) : `demanderAnnulation()` ne vaut pas arrêt matériel — la tâche passe à
 *   `cancel_requested`, le signal de l'exécuteur est levé, son emplacement reste pris. Si le calcul finit quand même,
 *   son résultat n'est **jamais engagé** : l'issue est `cancelled` avec `nonEngage` (valeur et révision source), que
 *   seule `engagerApresVerification` peut rendre, après une nouvelle vérification de l'appelant.
 *
 * Remplacement et annulation (D.2-03)
 * - Une nouvelle tâche sur la même clé, d'une autre empreinte, remplace la précédente : en file, elle est annulée sans
 *   avoir tourné ; en cours, elle est annulée tout de suite (son issue est `cancelled`) mais son calcul n'est pas
 *   arrêté (un Worker arrêté coûterait un redémarrage à chaque frappe) : s'il rend un résultat, la tâche passe à
 *   `stale` et ce résultat n'est jamais remis à l'interface. Son emplacement reste pris jusque-là (ou jusqu'au délai).
 * - Même clé et même empreinte qu'une tâche en file ou en cours : la même poignée est rendue, aucun doublon.
 * - `annuler()` (bouton « Annuler », signal) arrête vraiment : le calcul est interrompu (signal de l'exécuteur), son
 *   emplacement libéré.
 * - Seule la tâche courante de sa clé remet son résultat (`surResultat`, appelé de façon synchrone, au plus une fois).
 *
 * Délai et échec (D.2-04…07)
 * - Délai par tâche : l'exécuteur reçoit `delaiMs` ; l'ordonnanceur garde en plus une garde (`delaiMs + gardeMs`) pour
 *   un exécuteur qui ne répondrait jamais. Délai dépassé : `timed-out`, le calcul est arrêté.
 * - Plantage du calcul (Worker interrompu, réponse illisible ; `ErreurTache` de code `plantage`) : la tâche est remise
 *   en tête de sa file une fois (`reprisesMax`, 1 par défaut), puis `failed`. L'exécuteur relance le Worker à la
 *   demande suivante. Une reprise réutilise la même tâche (jamais de doublon) et un résultat tardif de la tentative
 *   abandonnée est ignoré (jamais de remise partielle ni double).
 * - Aucune tâche n'est laissée en suspens : chaque issue est résolue, jamais rejetée.
 *
 * Pur : ni React, ni DOM, ni Worker (l'exécuteur est injecté) ; minuteurs `setTimeout` (simulables dans les tests).
 */
import { memeEmpreinte, type Empreinte } from "./empreinte";

export type ClasseTache = "interactive" | "fond";
export type EtatTache = "queued" | "loading" | "running" | "cancel_requested" | "done" | "failed" | "cancelled" | "superseded" | "timed-out" | "stale";

/** Statuts du contrat IF-007 (`queued → loading → running → completed`, branches) pour chaque état de l'ordonnanceur. */
export type StatutIF007 = "queued" | "loading" | "running" | "completed" | "cancel_requested" | "cancelled" | "failed" | "superseded" | "timed_out";
export const STATUTS_IF007: Readonly<Record<EtatTache, StatutIF007>> = Object.freeze({
  queued: "queued", loading: "loading", running: "running", "cancel_requested": "cancel_requested", done: "completed", failed: "failed",
  cancelled: "cancelled", superseded: "superseded", "timed-out": "timed_out",
  // Résultat tardif d'une tâche remplacée : la tâche reste `superseded` au sens du contrat (résultat écarté).
  stale: "superseded",
});
export type CodeEchec = "plantage" | "calcul" | "delai" | "annulee" | "indisponible";

/** Erreur typée d'un exécuteur ; toute autre erreur vaut `calcul`. */
export class ErreurTache extends Error {
  constructor(readonly code: CodeEchec, message: string = code) {
    super(message);
    this.name = "ErreurTache";
  }
}

export interface Progression { etape: string; fait?: number; total?: number }

export interface DemandeTache<C = unknown, R = unknown> {
  cle: string;
  classe: ClasseTache;
  /** Traitement à exécuter (table des traitements du Worker). */
  nature: string;
  charge: C;
  empreinte: Empreinte;
  delaiMs?: number;
  /** Abandon par l'appelant : équivaut à `annuler()`. */
  signal?: AbortSignal;
  surProgression?: (p: Progression) => void;
  /** Appelé une seule fois, de façon synchrone, avec le résultat de la tâche si elle est encore la courante de sa clé. */
  surResultat?: (valeur: R) => void;
  /**
   * Commande qui a produit l'entrée de la tâche (EX-095) : identifiant non sensible (`requestId` du lot de commandes),
   * repris tel quel dans le journal pour corréler commande et tâche. Facultatif.
   */
  commandId?: string;
}

export type IssueTache<R> =
  | { etat: "done"; valeur: R }
  | { etat: "failed"; code: Exclude<CodeEchec, "delai" | "annulee">; message: string }
  /** `nonEngage` : le calcul a fini après une demande d'annulation ; sa valeur n'est engagée qu'après vérification. */
  | { etat: "cancelled"; nonEngage?: ResultatNonEngage<R> }
  | { etat: "superseded" }
  | { etat: "timed-out" };

/** Résultat d'une tâche terminée après une demande d'annulation (IF-007) : jamais remis tel quel. */
export interface ResultatNonEngage<R> { readonly valeur: R; readonly revisionSource: string }

/**
 * Engagement d'un résultat tardif (IF-007) : seulement si la révision source est encore la révision courante et que la
 * vérification de l'appelant l'accepte ; sinon null (rien n'est engagé).
 */
export function engagerApresVerification<R>(r: ResultatNonEngage<R> | undefined, revisionCourante: string, verifier: (valeur: R) => boolean): R | null {
  if (!r || r.revisionSource !== revisionCourante) return null;
  try { return verifier(r.valeur) ? r.valeur : null; } catch { return null; }
}

/** Vue en lecture d'une tâche (diagnostic, tests, interface). */
export interface Tache {
  readonly id: number;
  readonly cle: string;
  readonly classe: ClasseTache;
  readonly nature: string;
  readonly empreinte: Empreinte;
  readonly etat: EtatTache;
  /** Nombre de tentatives démarrées (1 sans reprise, 2 après une reprise). */
  readonly tentatives: number;
  /** Chaque état traversé avec la révision source de la tâche (IF-007). */
  readonly historique: readonly { readonly etat: EtatTache; readonly revision: string }[];
}

export interface PoigneeTache<R> {
  readonly tache: Tache;
  /** Résolue une fois, jamais rejetée. */
  readonly issue: Promise<IssueTache<R>>;
  /** Annulation douce (remplacement, démontage) : le calcul en cours n'est pas arrêté, son résultat sera périmé. */
  abandonner(): void;
  /** Annulation ferme : le calcul en cours est arrêté et son emplacement libéré. */
  annuler(): void;
  /**
   * Demande d'annulation coopérative (IF-007) : en file, annulée tout de suite ; en cours, `cancel_requested` — signal
   * levé, emplacement gardé jusqu'à la fin réelle du calcul ; un résultat tardif reste non engagé (`nonEngage`).
   */
  demanderAnnulation(): void;
}

export interface ExecutionDemandee {
  nature: string;
  charge: unknown;
  /** Emplacement (0 … concurrence − 1) : l'exécuteur y rattache toujours le même Worker (réutilisé). */
  emplacement: number;
  /** Interrompu par `annuler()` ou par la garde du délai. */
  signal: AbortSignal;
  delaiMs: number;
  /** Tentative de reprise après un plantage : son propre échec ne doit pas être compté une seconde fois par l'hôte. */
  reprise: boolean;
  surProgression: (p: Progression) => void;
  /** L'exécuteur a fini de charger et calcule : `loading` → `running` (sans effet hors de `loading`). */
  demarre: () => void;
}
export type Executeur = (e: ExecutionDemandee) => Promise<unknown>;

/** Événement du journal : chaque changement d'état d'une tâche (diagnostic et recette). */
export interface EvenementTache {
  id: number; cle: string; classe: ClasseTache; revision: string; etat: EtatTache | "requeued"; tentative: number;
  /** Identifiant non sensible de la tâche (`job-<id>`), stable d'un état à l'autre (EX-095). */
  jobId: string;
  /** Commande d'origine déclarée par la demande, sinon absent. */
  commandId?: string;
}
/** Identifiant de corrélation d'une tâche : son numéro dans la session, jamais son contenu. */
export const jobIdDe = (id: number): string => `job-${id}`;

export interface OptionsOrdonnanceur {
  executer: Executeur;
  /** Délai par défaut d'une tâche (ms). */
  delaiMs: number;
  /** Emplacements au total (2 par défaut). */
  concurrence?: number;
  /** Emplacements au plus pour la classe `fond` (1 par défaut, borné à 1 … concurrence − 1 ; 1 avec un seul emplacement). */
  concurrenceFond?: number;
  /** Reprises après plantage (1 par défaut). */
  reprisesMax?: number;
  /** Marge de la garde au-delà du délai donné à l'exécuteur (250 ms par défaut). */
  gardeMs?: number;
  surEvenement?: (e: EvenementTache) => void;
  /**
   * L'exécuteur doit-il d'abord charger (Worker pas encore créé, noyau pas prêt) ? Vrai : la tâche passe par `loading`
   * avant `running`. Absent : jamais de `loading`.
   */
  aCharger?: (nature: string, emplacement: number) => boolean;
}

export const CONCURRENCE_DEFAUT = 2;
export const CONCURRENCE_FOND_DEFAUT = 1;

interface Execution {
  job: Job;
  tentative: number;
  emplacement: number;
  ctrl: AbortController;
  minuteur: ReturnType<typeof setTimeout> | undefined;
  /** La tâche a été remplacée pendant le calcul : son résultat sera périmé. */
  perimee: boolean;
  /** Annulation demandée (coopérative) : le résultat éventuel ne sera pas engagé. */
  annulationDemandee: boolean;
}

interface Job {
  vue: { -readonly [K in keyof Tache]: Tache[K] };
  demande: DemandeTache;
  delaiMs: number;
  poignee: PoigneeTache<unknown>;
  resoudre: (i: IssueTache<unknown>) => void;
  rendue: boolean;
  execution: Execution | null;
  detacher: () => void;
}

export class Ordonnanceur {
  private suivant = 1;
  private readonly files: Record<ClasseTache, Job[]> = { interactive: [], fond: [] };
  private readonly emplacements: (Execution | null)[];
  private readonly courantes = new Map<string, Job>();
  private readonly concurrenceFond: number;

  constructor(private readonly options: OptionsOrdonnanceur) {
    const n = Math.max(1, Math.floor(options.concurrence ?? CONCURRENCE_DEFAUT));
    this.emplacements = Array.from({ length: n }, () => null);
    // Un seul emplacement : le fond l'utilise aussi (l'interactive passe en tête de file) ; sinon 1 … n − 1.
    this.concurrenceFond = n === 1 ? 1 : Math.max(1, Math.min(n - 1, Math.floor(options.concurrenceFond ?? CONCURRENCE_FOND_DEFAUT)));
  }

  get concurrence(): number { return this.emplacements.length; }
  /** Tâches en cours de calcul (périmées comprises, tant que leur emplacement est pris). */
  get enCours(): number { return this.emplacements.filter((e) => e !== null).length; }
  get enFile(): number { return this.files.interactive.length + this.files.fond.length; }

  /** Tâche courante d'une clé (en file ou en cours), s'il y en a une. */
  courante(cle: string): Tache | undefined { return this.courantes.get(cle)?.vue; }

  soumettre<C, R>(d: DemandeTache<C, R>): PoigneeTache<R> {
    const existante = this.courantes.get(d.cle);
    if (existante && memeEmpreinte(existante.vue.empreinte, d.empreinte) && (existante.vue.etat === "queued" || existante.vue.etat === "running")) {
      return existante.poignee as PoigneeTache<R>;
    }
    // Une tâche remplacée encore en file cède sa place à la nouvelle (même classe) : sans cela, une clé modifiée à
    // chaque frappe repasserait toujours devant les autres tâches de fond, qui ne tourneraient jamais.
    const place = existante && existante.vue.classe === d.classe ? this.files[d.classe].indexOf(existante) : -1;
    if (existante) this.abandonner(existante, "superseded");
    let resoudre!: (i: IssueTache<unknown>) => void;
    const issue = new Promise<IssueTache<unknown>>((r) => { resoudre = r; });
    const vue = { id: this.suivant++, cle: d.cle, classe: d.classe, nature: d.nature, empreinte: d.empreinte, etat: "queued" as EtatTache, tentatives: 0, historique: [] as { etat: EtatTache; revision: string }[] };
    const job: Job = {
      vue, demande: d as DemandeTache, delaiMs: d.delaiMs ?? this.options.delaiMs, resoudre, rendue: false, execution: null, detacher: () => {},
      poignee: { tache: vue, issue, abandonner: () => this.abandonner(job), annuler: () => this.annuler(job), demanderAnnulation: () => this.demanderAnnulation(job) },
    };
    if (d.signal?.aborted) { this.finir(job, { etat: "cancelled" }); return job.poignee as PoigneeTache<R>; }
    if (d.signal) {
      const surAbandon = () => this.annuler(job);
      d.signal.addEventListener("abort", surAbandon, { once: true });
      job.detacher = () => d.signal?.removeEventListener("abort", surAbandon);
    }
    this.courantes.set(d.cle, job);
    if (place >= 0) this.files[d.classe].splice(place, 0, job); else this.files[d.classe].push(job);
    this.noter(job, "queued");
    this.pomper();
    return job.poignee as PoigneeTache<R>;
  }

  /** Annule tout (fermeture de Studio, tests). */
  toutAnnuler(): void {
    for (const job of [...this.files.interactive, ...this.files.fond]) this.annuler(job);
    for (const e of [...this.emplacements]) if (e) this.annuler(e.job, true);
  }

  private noter(job: Job, etat: EtatTache | "requeued"): void {
    if (etat !== "requeued") (job.vue.historique as { etat: EtatTache; revision: string }[]).push(Object.freeze({ etat, revision: job.vue.empreinte.revision }));
    this.options.surEvenement?.({
      id: job.vue.id, cle: job.vue.cle, classe: job.vue.classe, revision: job.vue.empreinte.revision, etat, tentative: job.vue.tentatives, jobId: jobIdDe(job.vue.id),
      ...(job.demande.commandId ? { commandId: job.demande.commandId } : {}),
    });
  }

  private retirerDeFile(job: Job): boolean {
    const f = this.files[job.vue.classe];
    const i = f.indexOf(job);
    if (i < 0) return false;
    f.splice(i, 1);
    return true;
  }

  /** Issue finale (une seule fois) ; la tâche cesse d'être la courante de sa clé. */
  private finir(job: Job, issue: IssueTache<unknown>): void {
    if (job.rendue) return;
    job.rendue = true;
    job.vue.etat = issue.etat;
    job.detacher();
    if (this.courantes.get(job.vue.cle) === job) this.courantes.delete(job.vue.cle);
    this.noter(job, issue.etat);
    if (issue.etat === "done") {
      try { job.demande.surResultat?.(issue.valeur); } catch { /* une erreur de l'interface ne bloque pas la file */ }
    }
    job.resoudre(issue);
  }

  /** `superseded` : remplacée par une tâche plus récente de la même clé ; sinon abandon (démontage) = `cancelled`. */
  private abandonner(job: Job, etat: "cancelled" | "superseded" = "cancelled"): void {
    if (job.rendue) return;
    if (this.retirerDeFile(job)) { this.finir(job, { etat }); return; }
    if (job.execution) job.execution.perimee = true;
    this.finir(job, { etat });
  }

  /** Annulation coopérative : signal levé, emplacement gardé ; l'issue attend la fin réelle du calcul (IF-007). */
  private demanderAnnulation(job: Job): void {
    if (job.rendue) return;
    if (this.retirerDeFile(job)) { this.finir(job, { etat: "cancelled" }); return; }
    const e = job.execution;
    if (!e || e.annulationDemandee) return;
    e.annulationDemandee = true;
    job.vue.etat = "cancel_requested";
    this.noter(job, "cancel_requested");
    e.ctrl.abort();
  }

  private passerEnCalcul(e: Execution): void {
    if (e.job.vue.etat !== "loading" || e.job.execution !== e || e.job.rendue) return;
    e.job.vue.etat = "running";
    this.noter(e.job, "running");
  }

  /** `forcer` : arrête aussi une exécution déjà périmée (fermeture). */
  private annuler(job: Job, forcer = false): void {
    if (this.retirerDeFile(job)) { this.finir(job, { etat: "cancelled" }); return; }
    const e = job.execution;
    if (!job.rendue) this.finir(job, { etat: "cancelled" });
    else if (!forcer) return;
    if (e && this.emplacements[e.emplacement] === e) { this.liberer(e); e.ctrl.abort(); this.pomper(); }
  }

  private liberer(e: Execution): void {
    clearTimeout(e.minuteur);
    if (this.emplacements[e.emplacement] === e) this.emplacements[e.emplacement] = null;
    if (e.job.execution === e) e.job.execution = null;
  }

  private pomper(): void {
    for (;;) {
      const libre = this.emplacements.indexOf(null);
      if (libre < 0) return;
      const fond = this.emplacements.filter((e) => e?.job.vue.classe === "fond").length;
      const job = this.files.interactive.shift() ?? (fond < this.concurrenceFond ? this.files.fond.shift() : undefined);
      if (!job) return;
      this.demarrer(job, libre);
    }
  }

  private demarrer(job: Job, emplacement: number): void {
    job.vue.tentatives += 1;
    const charger = this.options.aCharger?.(job.demande.nature, emplacement) === true;
    job.vue.etat = charger ? "loading" : "running";
    const e: Execution = { job, tentative: job.vue.tentatives, emplacement, ctrl: new AbortController(), minuteur: undefined, perimee: false, annulationDemandee: false };
    job.execution = e;
    this.emplacements[emplacement] = e;
    this.noter(job, job.vue.etat);
    e.minuteur = setTimeout(() => this.expirer(e), job.delaiMs + (this.options.gardeMs ?? 250));
    let promesse: Promise<unknown>;
    try {
      promesse = Promise.resolve(this.options.executer({
        nature: job.demande.nature, charge: job.demande.charge, emplacement, signal: e.ctrl.signal, delaiMs: job.delaiMs, reprise: e.tentative > 1,
        surProgression: (p) => { if (!e.perimee && !job.rendue && job.execution === e && !e.annulationDemandee) { this.passerEnCalcul(e); job.demande.surProgression?.(p); } },
        demarre: () => this.passerEnCalcul(e),
      }));
    } catch (err) {
      promesse = Promise.reject(err);
    }
    promesse.then((valeur) => this.terminer(e, { ok: true, valeur }), (erreur: unknown) => this.terminer(e, { ok: false, erreur }));
  }

  private expirer(e: Execution): void {
    if (this.emplacements[e.emplacement] !== e) return;
    this.liberer(e);
    e.ctrl.abort();
    // Annulation demandée puis aucune fin dans le délai : l'annulation est acquise (aucune attente laissée en suspens).
    if (!e.perimee) this.finir(e.job, e.annulationDemandee ? { etat: "cancelled" } : { etat: "timed-out" });
    this.pomper();
  }

  private terminer(e: Execution, r: { ok: true; valeur: unknown } | { ok: false; erreur: unknown }): void {
    // Emplacement déjà libéré (délai, annulation ferme, tentative abandonnée) : réponse ignorée.
    if (this.emplacements[e.emplacement] !== e) return;
    this.liberer(e);
    const job = e.job;
    if (e.perimee || job.rendue) {
      if (r.ok) { job.vue.etat = "stale"; this.noter(job, "stale"); }
    } else if (e.annulationDemandee) {
      // Fin réelle après une demande d'annulation : jamais engagé ; une valeur reste disponible pour vérification.
      this.finir(job, r.ok ? { etat: "cancelled", nonEngage: { valeur: r.valeur, revisionSource: job.vue.empreinte.revision } } : { etat: "cancelled" });
    } else if (r.ok) {
      this.finir(job, { etat: "done", valeur: r.valeur });
    } else {
      const code: CodeEchec = r.erreur instanceof ErreurTache ? r.erreur.code : "calcul";
      const message = r.erreur instanceof Error ? r.erreur.message : String(r.erreur);
      if (code === "plantage" && e.tentative <= (this.options.reprisesMax ?? 1)) {
        // Reprise : la même tâche, en tête de sa file (aucun doublon), sur un Worker relancé par l'exécuteur.
        job.vue.etat = "queued";
        this.files[job.vue.classe].unshift(job);
        this.noter(job, "requeued");
      } else if (code === "delai") this.finir(job, { etat: "timed-out" });
      else if (code === "annulee") this.finir(job, { etat: "cancelled" });
      else this.finir(job, { etat: "failed", code, message });
    }
    this.pomper();
  }
}
