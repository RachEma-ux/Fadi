/**
 * Surveillance d'exploitation (R.5-03, OPS-08) : règles d'alerte des jobs et des workers du serveur, mesure de la
 * consommation des noyaux (exact : OCCT en WebAssembly dans le processus ; rendu : production des illustrations depuis
 * le rendu d'une vue) et exposition — route d'administration `GET /admin/surveillance` (routes/admin/surveillance.ts)
 * et journal structuré (une ligne JSON `studio_alerte` à l'entrée en alerte, `studio_alerte_levee` à la sortie).
 *
 * Décisions (Fadi, réversibles) :
 * - **Seuils** : un seuil n'est chiffré que s'il découle d'une règle écrite (code ou décision versionnée), cité dans
 *   `source`. Faute de valeur fixée (DEC-13 : « pour la géométrie, on exige l'exactitude, pas la vitesse. Aucun autre
 *   seuil chiffré n'est fixé » ; OPS-09 : objectifs de reprise, de conservation et de coûts à fixer par le maître
 *   d'ouvrage), une règle est **« non évaluée »** : sa mesure est relevée et exposée, elle ne déclenche jamais d'alerte.
 * - Les mesures sont **agrégées** (compteurs, durées, mémoire du processus) : aucune donnée de projet, aucun contenu de
 *   commande, aucun identifiant de compte n'y figure (EX-095 : détecter une dégradation sans enregistrer inutilement).
 * - Compteurs **en mémoire du processus** (le serveur Fadi est un monolithe à instance unique), remis à zéro au
 *   redémarrage ; l'état des jobs est relu dans la base à chaque évaluation.
 *
 * L'observation en production (alertes effectivement reçues, consommation réelle) reste à faire après un déploiement :
 * ce module définit, mesure et expose ; il ne prouve rien d'un site déployé.
 */

export type NoyauSurveille = "exact" | "rendu";
export const NOYAUX_SURVEILLES: readonly NoyauSurveille[] = Object.freeze(["exact", "rendu"]);

/** Mémoire du processus Node (octets), relevée par `process.memoryUsage()`. */
export interface MemoireProcessus { rss: number; heapUsed: number; external: number; arrayBuffers: number }

export interface MesuresOperation { executions: number; erreurs: number; dureeTotaleMs: number; dureeMaxMs: number }

export interface MesuresNoyau {
  noyau: NoyauSurveille;
  /** Chargements aboutis (le noyau exact se charge une fois par processus, à la première demande). */
  chargements: number;
  echecsChargement: number;
  dureeDernierChargementMs: number | null;
  /** Mémoire du processus juste avant et juste après le dernier chargement abouti. */
  memoireAvantChargement: MemoireProcessus | null;
  memoireApresChargement: MemoireProcessus | null;
  executions: number;
  erreurs: number;
  dureeTotaleMs: number;
  dureeMaxMs: number;
  derniereDureeMs: number | null;
  derniereErreur: { instant: string; operation: string; message: string } | null;
  parOperation: Record<string, MesuresOperation>;
}

export interface EtatWorker {
  nom: string;
  /** Période déclarée de la boucle (ms), lue dans le code qui la démarre. */
  periodeMs: number;
  executions: number;
  echecs: number;
  echecsConsecutifs: number;
  dernierSucces: string | null;
  dernierEchec: { instant: string; message: string } | null;
}

/** Jobs Studio relus dans la base (`studio_jobs`) au moment de l'évaluation. */
export interface ObservationJobs {
  /** Jobs persistés à l'état `en-calcul`. */
  enCalcul: number;
  /** Jobs terminés en `echec` dans la fenêtre d'observation. */
  echecsFenetre: number;
  /** Jobs créés dans la fenêtre d'observation. */
  totalFenetre: number;
  fenetreMs: number;
}

/** File des courriels (`mail_outbox`) relue dans la base. */
export interface ObservationCourriels { enAttente: number; plusAncienMs: number | null }

export interface Observation {
  instant: string;
  memoire: MemoireProcessus;
  noyaux: MesuresNoyau[];
  workers: EtatWorker[];
  jobs: ObservationJobs | null;
  courriels: ObservationCourriels | null;
  /** Erreurs applicatives non traitées (réponse 500 `internal_error` du gestionnaire final de `app.ts`). */
  erreurs: ObservationErreurs;
}

export interface ObservationErreurs {
  total: number;
  /** Erreurs dans la dernière fenêtre (`FENETRE_ERREURS_MS`). */
  fenetre: number;
  fenetreMs: number;
  derniere: { instant: string; message: string } | null;
}

/** Fenêtre des erreurs applicatives : la période d'évaluation (1 min), choix d'exploitation, pas un seuil. */
export const FENETRE_ERREURS_MS = 60_000;

/** Seuil chiffré, avec la règle écrite dont il découle. */
export interface SeuilSource { readonly valeur: number; readonly unite: string; readonly source: string }
/** Aucun seuil fixé : la mesure est exposée, jamais transformée en alerte. */
export interface SeuilNonEvalue { readonly nonEvalue: string }

export interface RegleAlerte {
  readonly id: string;
  readonly portee: "job" | "worker" | "noyau" | "processus";
  readonly description: string;
  /** Ce qui est mesuré (unité comprise). */
  readonly mesure: string;
  readonly seuil: SeuilSource | SeuilNonEvalue;
  /** Valeurs observées : une par objet surveillé (worker, noyau…) ; null = pas de donnée. */
  readonly observer: (o: Observation) => { objet: string; valeur: number | null }[];
}

export type EtatAlerte = "alerte" | "normal" | "non-evaluee" | "sans-donnee";
export interface ResultatRegle {
  regle: string;
  portee: RegleAlerte["portee"];
  objet: string;
  etat: EtatAlerte;
  valeur: number | null;
  seuil: number | null;
  unite: string | null;
  source: string;
}

const DEC13 = "DEC-13 (ADR-STUDIO-PILOTE-01) : « pour la géométrie, on exige l'exactitude, pas la vitesse. Aucun autre seuil chiffré n'est fixé. »";
const OPS09 = "OPS-09 : objectifs de reprise, de conservation et de coûts à fixer par le maître d'ouvrage, sans valeur inventée";

const parNoyau = (f: (m: MesuresNoyau) => number | null) => (o: Observation) => o.noyaux.map((m) => ({ objet: m.noyau, valeur: f(m) }));

/**
 * Règles d'alerte (R.5-03, OPS-08). Une règle à seuil chiffré passe en alerte quand la valeur observée **atteint** le
 * seuil (≥) ; une règle « non évaluée » relève la valeur sans jamais alerter.
 */
export const REGLES_ALERTE_STUDIO: readonly RegleAlerte[] = Object.freeze([
  {
    id: "api.erreurs-internes", portee: "processus",
    description: "Erreurs applicatives non traitées (réponse 500 internal_error) dans la dernière minute.",
    mesure: "erreurs internes dans la fenêtre d'une minute",
    seuil: { valeur: 1, unite: "erreur", source: "app.ts : le gestionnaire final répond 500 internal_error à toute erreur qu'aucune route n'a traitée ; le contrat d'API ne prévoit aucune erreur interne (refus = 4xx), chacune est un défaut, dès la première" },
    observer: (o) => [{ objet: "api", valeur: o.erreurs.fenetre }],
  },
  {
    id: "job.en-calcul-persistant", portee: "job",
    description: "Job Studio resté à l'état « en-calcul » dans la base.",
    mesure: "nombre de jobs `studio_jobs` à l'état en-calcul",
    seuil: { valeur: 1, unite: "job", source: "studio-jobs.ts et studio-migrations.ts écrivent chaque job déjà terminé (termine ou echec, finishedAt) dans la même insertion (EX-088) : un job « en-calcul » persisté est une anomalie, dès le premier" },
    observer: (o) => [{ objet: "studio_jobs", valeur: o.jobs?.enCalcul ?? null }],
  },
  {
    id: "job.echecs", portee: "job",
    description: "Jobs Studio terminés en échec dans la fenêtre d'observation (essais refusés, simulations de migration en échec).",
    mesure: "nombre de jobs à l'état echec créés dans la fenêtre",
    seuil: { nonEvalue: `un essai refusé (commandes invalides, booléen exact refusé) est une issue normale du job ; aucun taux d'échec admissible n'est fixé (${OPS09})` },
    observer: (o) => [{ objet: "studio_jobs", valeur: o.jobs?.echecsFenetre ?? null }],
  },
  {
    id: "worker.echec", portee: "worker",
    description: "Dernière exécution d'une boucle de fond en échec (courriels, anonymisation des comptes, purge du journal d'accès Studio, effacement des contacts).",
    mesure: "échecs consécutifs de la boucle",
    seuil: { valeur: 1, unite: "échec consécutif", source: "account-jobs.ts : une boucle en échec journalise l'erreur et n'est rejouée qu'à sa période suivante ; un échec est une tâche due (courriel, anonymisation à 30 jours, purge) non faite à son échéance, dès le premier" },
    observer: (o) => o.workers.map((w) => ({ objet: w.nom, valeur: w.echecsConsecutifs })),
  },
  {
    id: "worker.silence", portee: "worker",
    description: "Temps écoulé depuis la dernière exécution réussie d'une boucle de fond.",
    mesure: "ms depuis le dernier succès (null avant le premier)",
    seuil: { nonEvalue: `aucune durée maximale sans succès n'est fixée (${OPS09})` },
    observer: (o) => o.workers.map((w) => ({ objet: w.nom, valeur: w.dernierSucces === null ? null : Math.max(0, Date.parse(o.instant) - Date.parse(w.dernierSucces)) })),
  },
  {
    id: "worker.courriels-en-attente", portee: "worker",
    description: "Courriels en attente d'envoi dans la file (`mail_outbox`).",
    mesure: "nombre de courriels à l'état pending",
    seuil: { nonEvalue: `aucune profondeur de file ni aucun délai d'envoi admissible n'est fixé (${OPS09})` },
    observer: (o) => [{ objet: "mail_outbox", valeur: o.courriels?.enAttente ?? null }],
  },
  {
    id: "noyau.chargement-echec", portee: "noyau",
    description: "Échec du chargement d'un noyau dans le processus du serveur.",
    mesure: "chargements échoués depuis le démarrage",
    seuil: { valeur: 1, unite: "échec", source: "R9 / IF-003 (studio-exact.ts, atelier-exact.ts) : sans noyau chargé, le serveur refuse tout booléen et tout solide exact — jamais un résultat approché ; un échec de chargement est une indisponibilité, dès le premier" },
    observer: parNoyau((m) => m.echecsChargement),
  },
  {
    id: "noyau.erreurs", portee: "noyau",
    description: "Opérations d'un noyau terminées en erreur (opération refusée par OCCT, image illisible, service externe en échec).",
    mesure: "erreurs depuis le démarrage",
    seuil: { nonEvalue: `une opération refusée par le noyau peut venir de l'entrée de l'utilisateur ; aucun taux d'erreur admissible n'est fixé (${DEC13})` },
    observer: parNoyau((m) => m.erreurs),
  },
  {
    id: "noyau.duree-max", portee: "noyau",
    description: "Durée la plus longue d'une opération d'un noyau depuis le démarrage.",
    mesure: "ms",
    seuil: { nonEvalue: DEC13 },
    observer: parNoyau((m) => (m.executions ? m.dureeMaxMs : null)),
  },
  {
    id: "noyau.memoire-chargement", portee: "noyau",
    description: "Mémoire résidente du processus prise par le chargement du noyau (après − avant).",
    mesure: "octets (rss)",
    seuil: { nonEvalue: DEC13 },
    observer: parNoyau((m) => (m.memoireAvantChargement && m.memoireApresChargement ? m.memoireApresChargement.rss - m.memoireAvantChargement.rss : null)),
  },
  {
    id: "processus.memoire", portee: "processus",
    description: "Mémoire résidente du processus de l'API.",
    mesure: "octets (rss)",
    seuil: { nonEvalue: `aucun budget mémoire du serveur n'est fixé (${DEC13} ; ${OPS09})` },
    observer: (o) => [{ objet: "api", valeur: o.memoire.rss }],
  },
] satisfies RegleAlerte[]);

export const estSourcee = (s: RegleAlerte["seuil"]): s is SeuilSource => "valeur" in s;

/** Document versionné des règles (docs/studio/SURVEILLANCE-EXPLOITATION.md), régénéré par test et tenu au code. */
export function documentSurveillance(regles: readonly RegleAlerte[] = REGLES_ALERTE_STUDIO): string {
  const c = (s: string) => s.replace(/\|/g, "\\|");
  return [
    "# Surveillance d'exploitation — règles d'alerte et consommation des noyaux (R.5-03, OPS-08)",
    "",
    "> Document **généré** depuis `apps/api/src/lib/studio-surveillance.ts` (`STUDIO_SURVEILLANCE_ECRIRE=1 npx vitest run --config",
    "> vitest.guard.config.ts src/testing/studio-surveillance.test.ts` dans `apps/api`) ; le test échoue s'il diffère du code.",
    "",
    "Exposition : `GET /admin/surveillance` (administrateur de la plateforme, double authentification ; schéma",
    "`studio-surveillance/1` : observation, règles, résultats, alertes actives) et journal structuré de l'API — une ligne JSON",
    "`studio_alerte` (niveau warn) à l'entrée en alerte, `studio_alerte_levee` (niveau info) au retour, évaluées chaque minute",
    "(`STUDIO_SURVEILLANCE=0` désactive la boucle). Compteurs du processus, remis à zéro au redémarrage ; jobs et file des",
    "courriels relus dans la base ; aucune donnée de projet.",
    "",
    "Un seuil n'est chiffré que s'il découle d'une règle écrite (colonne « Source ») ; sinon la règle est **non évaluée** : sa",
    "mesure est exposée, jamais transformée en alerte.",
    "",
    "| Règle | Portée | Mesure | Seuil | Source ou raison |",
    "|---|---|---|---|---|",
    ...regles.map((r) => `| \`${r.id}\` | ${r.portee} | ${c(r.mesure)} | ${estSourcee(r.seuil) ? `≥ ${r.seuil.valeur} ${c(r.seuil.unite)}` : "non évalué"} | ${c(estSourcee(r.seuil) ? r.seuil.source : r.seuil.nonEvalue)} |`),
    "",
    "## Vérification après déploiement (OPS-08)",
    "",
    "1. Comme administrateur, lire `GET /admin/surveillance` : `alertes` vide, chaque boucle de fond (`observation.workers`)",
    "   avec un `dernierSucces` récent, `observation.jobs.enCalcul` à 0.",
    "2. Déclencher une opération exacte (booléen Studio ou solide exact de l'Atelier) et une illustration : les compteurs",
    "   `observation.noyaux` (exact, rendu) augmentent ; la mémoire du chargement du noyau exact est relevée.",
    "3. Relire le journal de l'API : aucune ligne `studio_alerte` non expliquée.",
    "4. Consigner le relevé (date en heure suisse, build, valeurs) : il ne vaut que pour ce déploiement. Les seuils non",
    "   évalués restent à fixer par le maître d'ouvrage (DEC-13, OPS-09).",
    "",
    "Cette vérification n'a pas encore été faite sur un site déployé : elle demande un déploiement réel.",
    "",
  ].join("\n");
}

/** Évalue chaque règle sur une observation (pur). */
export function evaluerAlertes(o: Observation, regles: readonly RegleAlerte[] = REGLES_ALERTE_STUDIO): ResultatRegle[] {
  const out: ResultatRegle[] = [];
  for (const r of regles) {
    for (const { objet, valeur } of r.observer(o)) {
      const s = r.seuil;
      const etat: EtatAlerte = valeur === null ? "sans-donnee" : !estSourcee(s) ? "non-evaluee" : valeur >= s.valeur ? "alerte" : "normal";
      out.push({ regle: r.id, portee: r.portee, objet, etat, valeur, seuil: estSourcee(s) ? s.valeur : null, unite: estSourcee(s) ? s.unite : null, source: estSourcee(s) ? s.source : s.nonEvalue });
    }
  }
  return out;
}

const memoireDe = (): MemoireProcessus => { const m = process.memoryUsage(); return { rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers }; };
const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

function mesuresVides(n: NoyauSurveille): MesuresNoyau {
  return { noyau: n, chargements: 0, echecsChargement: 0, dureeDernierChargementMs: null, memoireAvantChargement: null, memoireApresChargement: null, executions: 0, erreurs: 0, dureeTotaleMs: 0, dureeMaxMs: 0, derniereDureeMs: null, derniereErreur: null, parOperation: {} };
}

/** Compteurs du processus ; horloges et mémoire injectables (tests). */
export class SurveillanceStudio {
  private readonly noyaux = new Map<NoyauSurveille, MesuresNoyau>(NOYAUX_SURVEILLES.map((n) => [n, mesuresVides(n)]));
  private readonly workers = new Map<string, EtatWorker>();
  constructor(private readonly o: { maintenant?: () => Date; chrono?: () => number; memoire?: () => MemoireProcessus } = {}) {}
  private maintenant = () => (this.o.maintenant ?? (() => new Date()))();
  private chrono = () => (this.o.chrono ?? (() => performance.now()))();
  memoire = (): MemoireProcessus => (this.o.memoire ?? memoireDe)();

  /** Chargement d'un noyau : durée, mémoire avant / après, échec compté (l'erreur est relancée telle quelle). */
  async mesurerChargement<T>(n: NoyauSurveille, f: () => Promise<T>): Promise<T> {
    const m = this.noyaux.get(n)!;
    const avant = this.memoire();
    const t0 = this.chrono();
    try {
      const r = await f();
      m.chargements += 1; m.dureeDernierChargementMs = this.chrono() - t0; m.memoireAvantChargement = avant; m.memoireApresChargement = this.memoire();
      return r;
    } catch (e) {
      m.echecsChargement += 1; m.derniereErreur = { instant: this.maintenant().toISOString(), operation: "chargement", message: messageDe(e) };
      throw e;
    }
  }

  private noter(n: NoyauSurveille, operation: string, duree: number, erreur: unknown | undefined): void {
    const m = this.noyaux.get(n)!;
    const op = (m.parOperation[operation] ??= { executions: 0, erreurs: 0, dureeTotaleMs: 0, dureeMaxMs: 0 });
    m.executions += 1; op.executions += 1;
    m.dureeTotaleMs += duree; op.dureeTotaleMs += duree;
    m.dureeMaxMs = Math.max(m.dureeMaxMs, duree); op.dureeMaxMs = Math.max(op.dureeMaxMs, duree);
    m.derniereDureeMs = duree;
    if (erreur !== undefined) { m.erreurs += 1; op.erreurs += 1; m.derniereErreur = { instant: this.maintenant().toISOString(), operation, message: messageDe(erreur) }; }
  }

  /** Opération synchrone d'un noyau (OCCT calcule de façon synchrone) : durée et erreur comptées, résultat inchangé. */
  mesurer<T>(n: NoyauSurveille, operation: string, f: () => T): T {
    const t0 = this.chrono();
    try { const r = f(); this.noter(n, operation, this.chrono() - t0, undefined); return r; }
    catch (e) { this.noter(n, operation, this.chrono() - t0, e); throw e; }
  }

  async mesurerAsync<T>(n: NoyauSurveille, operation: string, f: () => Promise<T>): Promise<T> {
    const t0 = this.chrono();
    try { const r = await f(); this.noter(n, operation, this.chrono() - t0, undefined); return r; }
    catch (e) { this.noter(n, operation, this.chrono() - t0, e); throw e; }
  }

  /** Déclare une boucle de fond (sa période vient du code qui la démarre). */
  declarerWorker(nom: string, periodeMs: number): void {
    if (!this.workers.has(nom)) this.workers.set(nom, { nom, periodeMs, executions: 0, echecs: 0, echecsConsecutifs: 0, dernierSucces: null, dernierEchec: null });
  }
  workerReussi(nom: string): void {
    const w = this.workers.get(nom); if (!w) return;
    w.executions += 1; w.echecsConsecutifs = 0; w.dernierSucces = this.maintenant().toISOString();
  }
  workerEchoue(nom: string, e: unknown): void {
    const w = this.workers.get(nom); if (!w) return;
    w.executions += 1; w.echecs += 1; w.echecsConsecutifs += 1; w.dernierEchec = { instant: this.maintenant().toISOString(), message: messageDe(e) };
  }

  private erreursTotal = 0;
  private erreursRecentes: number[] = [];
  private derniereErreurApplicative: ObservationErreurs["derniere"] = null;

  /** Erreur applicative non traitée (gestionnaire final de `app.ts`) : comptée, message tronqué, aucune donnée de requête. */
  erreurApplicative(e: unknown): void {
    const t = this.maintenant();
    this.erreursTotal += 1;
    this.erreursRecentes.push(t.getTime());
    if (this.erreursRecentes.length > 1000) this.erreursRecentes.splice(0, this.erreursRecentes.length - 1000);
    this.derniereErreurApplicative = { instant: t.toISOString(), message: messageDe(e) };
  }

  /** Observation agrégée (copie) ; jobs et courriels relus par l'appelant dans la base. */
  observer(base: { jobs: ObservationJobs | null; courriels: ObservationCourriels | null } = { jobs: null, courriels: null }): Observation {
    const maintenant = this.maintenant();
    this.erreursRecentes = this.erreursRecentes.filter((t) => maintenant.getTime() - t < FENETRE_ERREURS_MS);
    return {
      instant: maintenant.toISOString(), memoire: this.memoire(),
      noyaux: [...this.noyaux.values()].map((m) => structuredClone(m)),
      workers: [...this.workers.values()].map((w) => structuredClone(w)),
      ...base,
      erreurs: { total: this.erreursTotal, fenetre: this.erreursRecentes.length, fenetreMs: FENETRE_ERREURS_MS, derniere: this.derniereErreurApplicative },
    };
  }
}

/** Instance du processus. */
export const surveillanceStudio = new SurveillanceStudio();

/**
 * Journal structuré : compare l'évaluation à la précédente et écrit une ligne JSON à chaque entrée en alerte
 * (`studio_alerte`, niveau warn) et à chaque retour à la normale (`studio_alerte_levee`, niveau info). Pur hormis
 * `log` ; renvoie l'ensemble des alertes actives (clé `regle|objet`) à repasser au prochain appel.
 */
export function journaliserTransitions(resultats: readonly ResultatRegle[], actives: ReadonlySet<string>, log: (ligne: string) => void): Set<string> {
  const maintenant = new Set<string>();
  for (const r of resultats) {
    const cle = `${r.regle}|${r.objet}`;
    if (r.etat === "alerte") {
      maintenant.add(cle);
      if (!actives.has(cle)) log(JSON.stringify({ level: "warn", message: "studio_alerte", regle: r.regle, portee: r.portee, objet: r.objet, valeur: r.valeur, seuil: r.seuil, unite: r.unite, source: r.source }));
    }
  }
  for (const cle of actives) {
    if (maintenant.has(cle)) continue;
    const [regle, objet] = cle.split("|");
    log(JSON.stringify({ level: "info", message: "studio_alerte_levee", regle, objet }));
  }
  return maintenant;
}
