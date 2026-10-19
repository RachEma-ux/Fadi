/**
 * Hôte générique des Workers de Studio (calculs lourds hors du fil principal) : mêmes conventions que le noyau exact
 * de l'Atelier (`atelier/nouveau/exact/moteur-exact.ts`), sans en dépendre (ADR-STUDIO-NAV-01).
 *
 * - Création paresseuse : le Worker naît à la première demande, jamais à l'ouverture de Studio.
 * - Demandes numérotées ; chaque réponse est rattachée à son identifiant, une réponse inconnue est ignorée.
 * - Délai par demande : au-delà, toutes les demandes en cours sont rejetées et le Worker est arrêté ; la demande
 *   suivante en crée un nouveau (borne de sûreté choisie par Fadi, pas une mesure de performance).
 * - Annulation par `AbortSignal` : le calcul est synchrone dans le Worker, seul son arrêt le libère. La demande
 *   annulée est rejetée (`annulee`), le Worker est arrêté sans compter d'échec et les autres demandes en cours sont
 *   renvoyées, telles quelles, au Worker suivant.
 * - Reprise après échec : une erreur fatale, une réponse illisible ou un délai dépassé arrêtent le Worker ; après
 *   `echecsMax` échecs consécutifs sans réponse réussie, l'hôte reste indisponible pour la session.
 * - Canal : une nouvelle demande sur le même canal remplace la précédente, dont le résultat sera écarté (`remplacee`) ;
 *   le Worker n'est pas arrêté pour autant (un réglage de feuille change souvent, le calcul suivant est court).
 * - Sans Worker (tests, navigateur ancien) : exécution directe sur le fil principal par la même fonction, mêmes
 *   résultats ; l'annulation et le remplacement écartent alors seulement le résultat.
 *
 * Ni React ni DOM : seulement l'API Worker (injectée par `creer`).
 */

export interface Progression {
  /** Étape en cours (identifiant stable, traduit par l'interface). */
  etape: string;
  fait?: number;
  total?: number;
}

/** Message de l'hôte vers le Worker. */
export interface DemandeWorker {
  id: number;
  nature: string;
  charge: unknown;
}

/** Message du Worker vers l'hôte : progression, valeur ou erreur de calcul. */
export type ReponseWorker =
  | { id: number; progression: Progression }
  | { id: number; valeur: unknown }
  | { id: number; erreur: string };

export type CodeErreurHote = "annulee" | "remplacee" | "delai" | "interrompu" | "illisible" | "indisponible" | "calcul";

export class ErreurHote extends Error {
  constructor(readonly code: CodeErreurHote, message: string) {
    super(message);
    this.name = code === "annulee" ? "AbortError" : "ErreurHote";
  }
}

/** Le résultat de cette demande ne doit pas être affiché (annulée ou remplacée par une plus récente). */
export const estEcartee = (e: unknown): boolean => e instanceof ErreurHote && (e.code === "annulee" || e.code === "remplacee");

/** Exécution directe d'une demande (même fonction que dans le Worker). */
export type ExecutionDirecte = (nature: string, charge: unknown, progresser: (p: Progression) => void) => unknown;

export interface OptionsHote {
  /** Crée le Worker (appelé à la première demande, puis après chaque arrêt). */
  creer: () => Worker;
  /** Délai par défaut d'une demande (ms). */
  delaiMs: number;
  /** Échecs consécutifs tolérés avant l'indisponibilité pour la session (3 par défaut). */
  echecsMax?: number;
  /** Exécution sans Worker (`typeof Worker === "undefined"`). Absente : l'hôte est indisponible sans Worker. */
  direct?: ExecutionDirecte;
  /** Présence de l'API Worker (injectable pour les tests). */
  workerDisponible?: () => boolean;
}

export interface OptionsDemande {
  signal?: AbortSignal;
  delaiMs?: number;
  /** Une demande plus récente sur le même canal écarte celle-ci. */
  canal?: string;
  /** Objets transférés (non copiés) au Worker. */
  transfert?: Transferable[];
  surProgression?: (p: Progression) => void;
}

interface Attente {
  nature: string;
  charge: unknown;
  transfert: Transferable[];
  canal: string | undefined;
  surProgression: ((p: Progression) => void) | undefined;
  resoudre: (v: unknown) => void;
  rejeter: (e: Error) => void;
  minuteur: ReturnType<typeof setTimeout>;
  detacher: () => void;
}

const MESSAGES: Record<Exclude<CodeErreurHote, "calcul">, string> = {
  annulee: "Calcul annulé.",
  remplacee: "Calcul remplacé par une demande plus récente.",
  delai: "Le calcul n'a pas répondu à temps ; il sera relancé à la prochaine demande.",
  interrompu: "Calcul interrompu ; il sera relancé à la prochaine demande.",
  illisible: "Réponse illisible du calcul ; il sera relancé à la prochaine demande.",
  indisponible: "Calcul hors du fil principal indisponible : trois échecs consécutifs ; rechargez la page pour réessayer.",
};
const erreur = (code: Exclude<CodeErreurHote, "calcul">) => new ErreurHote(code, MESSAGES[code]);

export class HoteWorker {
  /** `undefined` : à créer à la prochaine demande ; `null` : indisponible pour la session. */
  private fil: Worker | null | undefined;
  private suivant = 1;
  private echecs = 0;
  private readonly enAttente = new Map<number, Attente>();
  private readonly canaux = new Map<string, number>();
  /** Nombre de Workers créés (diagnostic et tests). */
  creations = 0;

  constructor(private readonly options: OptionsHote) {}

  /** Demandes en attente d'une réponse. */
  get enCours(): number { return this.enAttente.size; }
  get indisponible(): boolean { return this.fil === null; }

  demander<T>(nature: string, charge: unknown, o: OptionsDemande = {}): Promise<T> {
    if (o.signal?.aborted) return Promise.reject(erreur("annulee"));
    const id = this.suivant++;
    if (o.canal !== undefined) {
      const precedente = this.canaux.get(o.canal);
      if (precedente !== undefined) this.ecarter(precedente, erreur("remplacee"));
      this.canaux.set(o.canal, id);
    }
    const disponible = this.options.workerDisponible ?? (() => typeof Worker !== "undefined");
    if (!disponible()) return this.directement<T>(id, nature, charge, o);
    const w = this.obtenirFil();
    if (!w) { this.liberer(id, o.canal); return Promise.reject(erreur("indisponible")); }
    return new Promise<T>((resoudre, rejeter) => {
      const delai = o.delaiMs ?? this.options.delaiMs;
      const minuteur = setTimeout(() => { if (this.enAttente.has(id)) this.abandonner("delai"); }, delai);
      const surAbandon = () => this.annuler(id);
      o.signal?.addEventListener("abort", surAbandon, { once: true });
      this.enAttente.set(id, {
        nature, charge, transfert: o.transfert ?? [], canal: o.canal, surProgression: o.surProgression,
        resoudre: resoudre as (v: unknown) => void, rejeter, minuteur, detacher: () => o.signal?.removeEventListener("abort", surAbandon),
      });
      this.poster(w, id);
    });
  }

  /** Arrête le Worker et rejette toutes les demandes (fermeture, tests). Une demande suivante le recrée. */
  arreter(): void {
    for (const id of [...this.enAttente.keys()]) this.ecarter(id, erreur("annulee"));
    this.fil?.terminate();
    if (this.fil !== null) this.fil = undefined;
  }

  private poster(w: Worker, id: number): void {
    const a = this.enAttente.get(id)!;
    const message: DemandeWorker = { id, nature: a.nature, charge: a.charge };
    try {
      w.postMessage(message, a.transfert);
    } catch {
      // Charge non clonable : erreur de la demande seule, le Worker reste sain.
      this.ecarter(id, new ErreurHote("calcul", "Données du calcul non transmissibles au Worker."));
    }
  }

  private async directement<T>(id: number, nature: string, charge: unknown, o: OptionsDemande): Promise<T> {
    const direct = this.options.direct;
    if (!direct) { this.liberer(id, o.canal); throw erreur("indisponible"); }
    const ecartee = () => o.signal?.aborted === true || (o.canal !== undefined && this.canaux.get(o.canal) !== id);
    // Laisse d'abord l'interface se peindre (état « en cours »), comme avec un Worker.
    await Promise.resolve();
    if (ecartee()) throw erreur(o.signal?.aborted ? "annulee" : "remplacee");
    try {
      const v = await direct(nature, charge, (p) => { if (!ecartee()) o.surProgression?.(p); });
      if (ecartee()) throw erreur(o.signal?.aborted ? "annulee" : "remplacee");
      return v as T;
    } catch (e) {
      if (e instanceof ErreurHote) throw e;
      throw new ErreurHote("calcul", e instanceof Error ? e.message : String(e));
    } finally {
      this.liberer(id, o.canal);
    }
  }

  private liberer(id: number, canal: string | undefined): void {
    if (canal !== undefined && this.canaux.get(canal) === id) this.canaux.delete(canal);
  }

  /** Retire une demande et la rejette ; sa réponse éventuelle sera ignorée (identifiant inconnu). */
  private ecarter(id: number, e: Error): Attente | undefined {
    const a = this.enAttente.get(id);
    if (!a) return undefined;
    this.enAttente.delete(id);
    clearTimeout(a.minuteur);
    a.detacher();
    this.liberer(id, a.canal);
    a.rejeter(e);
    return a;
  }

  /** Annulation : arrêt du Worker (sans échec compté), les autres demandes partent sur un nouveau Worker. */
  private annuler(id: number): void {
    if (!this.ecarter(id, erreur("annulee"))) return;
    if (!this.fil) return;
    this.fil.terminate();
    this.fil = undefined;
    if (this.enAttente.size === 0) return;
    const w = this.obtenirFil();
    if (!w) { for (const autre of [...this.enAttente.keys()]) this.ecarter(autre, erreur("indisponible")); return; }
    for (const autre of [...this.enAttente.keys()]) this.poster(w, autre);
  }

  /** Échec du Worker : toutes les demandes sont rejetées, le Worker est arrêté et recréé à la demande suivante. */
  private abandonner(code: "delai" | "interrompu" | "illisible"): void {
    for (const id of [...this.enAttente.keys()]) this.ecarter(id, erreur(code));
    this.fil?.terminate();
    this.echecs += 1;
    this.fil = this.echecs >= (this.options.echecsMax ?? 3) ? null : undefined;
  }

  private obtenirFil(): Worker | null {
    if (this.fil !== undefined) return this.fil;
    let w: Worker;
    try {
      w = this.options.creer();
      this.creations += 1;
    } catch {
      this.abandonner("interrompu");
      return this.fil ?? null;
    }
    // Un Worker arrêté ne résout plus rien : chaque écouteur vérifie qu'il est toujours le Worker courant.
    w.addEventListener("message", (e: MessageEvent<ReponseWorker>) => {
      if (this.fil !== w) return;
      const d = e.data;
      const a = d && typeof d === "object" ? this.enAttente.get(d.id) : undefined;
      if (!a) return;
      if ("progression" in d) { a.surProgression?.(d.progression); return; }
      this.enAttente.delete(d.id);
      clearTimeout(a.minuteur);
      a.detacher();
      this.liberer(d.id, a.canal);
      // Une réponse, même une erreur de calcul, prouve que le Worker vit : le compteur d'échecs repart de zéro.
      this.echecs = 0;
      if ("erreur" in d) a.rejeter(new ErreurHote("calcul", d.erreur));
      else a.resoudre(d.valeur);
    });
    w.addEventListener("error", () => { if (this.fil === w) this.abandonner("interrompu"); });
    w.addEventListener("messageerror", () => { if (this.fil === w) this.abandonner("illisible"); });
    this.fil = w;
    return w;
  }
}
