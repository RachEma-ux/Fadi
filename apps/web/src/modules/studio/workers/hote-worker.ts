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
 *   renvoyées au Worker suivant, avec un délai qui repart de zéro. Les charges sont toujours copiées vers le Worker,
 *   jamais transférées : un renvoi retrouve donc des données intactes.
 * - Reprise après échec : une erreur fatale, une réponse illisible ou un délai dépassé arrêtent le Worker ; après
 *   `echecsMax` échecs consécutifs sans réponse réussie, le Worker n'est plus relancé pour la session : les demandes
 *   suivantes passent par l'exécution directe (`direct`, mêmes fonctions, sur le fil principal) — `repli` le signale
 *   pour que l'interface l'annonce — ou, sans `direct`, sont refusées (`indisponible`).
 * - Canal : une nouvelle demande sur le même canal remplace la précédente, dont le résultat sera écarté (`remplacee`) ;
 *   le Worker n'est pas arrêté pour autant (un réglage de feuille change souvent, le calcul suivant est court).
 * - Sans Worker (tests, navigateur ancien) : exécution directe sur le fil principal par la même fonction, mêmes
 *   résultats ; l'annulation et le remplacement écartent alors seulement le résultat.
 *
 * - Validation applicative (EX-063) : chaque message reçu passe par `lireEnveloppe` (forme de l'enveloppe) puis, pour
 *   une valeur, par le validateur de sa nature (`valider`, `validation-messages.ts`). Un message mal formé arrête le
 *   Worker comme une réponse illisible ; une valeur bien formée mais forgée (outil hors registre, indice hors des
 *   sommets…) rejette ses demandes (`invalide`) et arrête le Worker : elle n'est jamais rendue.
 *
 * Ni React ni DOM : seulement l'API Worker (injectée par `creer`).
 */
import { lireEnveloppe } from "./validation-messages";

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

export type CodeErreurHote = "annulee" | "remplacee" | "delai" | "interrompu" | "illisible" | "invalide" | "indisponible" | "calcul";

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
  /**
   * Validation applicative de la valeur rendue par le Worker pour une nature (EX-063) : null = acceptée, sinon motif.
   * Absente : seule l'enveloppe est validée.
   */
  valider?: (nature: string, valeur: unknown) => string | null;
}

export interface OptionsDemande {
  signal?: AbortSignal;
  delaiMs?: number;
  /** Une demande plus récente sur le même canal écarte celle-ci. */
  canal?: string;
  surProgression?: (p: Progression) => void;
  /**
   * Faux : un échec du Worker pendant cette demande ne compte pas dans les `echecsMax` (reprise d'une demande déjà
   * comptée par l'ordonnanceur : un document qui fait toujours planter le Worker ne coûte qu'un échec par soumission).
   */
  compterEchec?: boolean;
}

interface Attente {
  nature: string;
  charge: unknown;
  delai: number;
  canal: string | undefined;
  surProgression: ((p: Progression) => void) | undefined;
  compterEchec: boolean;
  resoudre: (v: unknown) => void;
  rejeter: (e: Error) => void;
  minuteur: ReturnType<typeof setTimeout> | undefined;
  detacher: () => void;
}

const MESSAGES: Record<Exclude<CodeErreurHote, "calcul">, string> = {
  annulee: "Calcul annulé.",
  remplacee: "Calcul remplacé par une demande plus récente.",
  delai: "Le calcul n'a pas répondu à temps ; il sera relancé à la prochaine demande.",
  interrompu: "Calcul interrompu ; il sera relancé à la prochaine demande.",
  illisible: "Réponse illisible du calcul ; il sera relancé à la prochaine demande.",
  invalide: "Réponse du calcul refusée par la validation ; il sera relancé à la prochaine demande.",
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
  /** Messages refusés par la validation applicative (EX-063), avec leur motif (diagnostic, sans contenu). */
  readonly refus: string[] = [];

  constructor(private readonly options: OptionsHote) {}

  /** Demandes en attente d'une réponse. */
  get enCours(): number { return this.enAttente.size; }
  get indisponible(): boolean { return this.fil === null; }
  /** Un Worker vivant est déjà créé : une demande n'a rien à charger (IF-007 : sinon la tâche passe par `loading`). */
  get vivant(): boolean { return this.fil !== undefined && this.fil !== null; }
  /** Les calculs se font sur le fil principal (Worker absent ou abandonné après trop d'échecs) alors qu'un repli existe. */
  get repli(): boolean {
    const disponible = this.options.workerDisponible ?? (() => typeof Worker !== "undefined");
    return this.options.direct !== undefined && (this.fil === null || !disponible());
  }

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
    // Worker abandonné pour la session : repli sur l'exécution directe quand elle existe.
    if (!w) return this.directement<T>(id, nature, charge, o);
    return new Promise<T>((resoudre, rejeter) => {
      const surAbandon = () => this.annuler(id);
      o.signal?.addEventListener("abort", surAbandon, { once: true });
      this.enAttente.set(id, {
        nature, charge, delai: o.delaiMs ?? this.options.delaiMs, canal: o.canal, surProgression: o.surProgression, compterEchec: o.compterEchec !== false,
        resoudre: resoudre as (v: unknown) => void, rejeter, minuteur: undefined, detacher: () => o.signal?.removeEventListener("abort", surAbandon),
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

  /** Envoie (ou renvoie) une demande ; son délai repart de zéro à chaque envoi. Copie seule, jamais de transfert. */
  private poster(w: Worker, id: number): void {
    const a = this.enAttente.get(id)!;
    clearTimeout(a.minuteur);
    a.minuteur = setTimeout(() => { if (this.enAttente.has(id)) this.abandonner("delai"); }, a.delai);
    const message: DemandeWorker = { id, nature: a.nature, charge: a.charge };
    try {
      w.postMessage(message);
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
  private abandonner(code: "delai" | "interrompu" | "illisible" | "invalide"): void {
    // Échec non compté seulement si toutes les demandes touchées sont des reprises (`compterEchec: false`).
    const touchees = [...this.enAttente.values()];
    const compter = touchees.length === 0 || touchees.some((a) => a.compterEchec);
    for (const id of [...this.enAttente.keys()]) this.ecarter(id, erreur(code));
    this.fil?.terminate();
    if (compter) this.echecs += 1;
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
      // EX-063 : l'enveloppe est validée avant toute lecture ; un message mal formé vaut une réponse illisible.
      const d = lireEnveloppe(e.data);
      if (!d.ok) { this.refus.push(d.motif); this.abandonner("illisible"); return; }
      const a = this.enAttente.get(d.id);
      if (!a) return;
      if (d.type === "progression") { a.surProgression?.(d.progression); return; }
      if (d.type === "valeur") {
        const motif = this.options.valider?.(a.nature, d.valeur) ?? null;
        // Valeur forgée : jamais rendue ; le Worker qui l'a produite est arrêté.
        if (motif !== null) { this.refus.push(`${a.nature} : ${motif}`); this.abandonner("invalide"); return; }
      }
      this.enAttente.delete(d.id);
      clearTimeout(a.minuteur);
      a.detacher();
      this.liberer(d.id, a.canal);
      // Une réponse, même une erreur de calcul, prouve que le Worker vit : le compteur d'échecs repart de zéro.
      this.echecs = 0;
      if (d.type === "erreur") a.rejeter(new ErreurHote("calcul", d.erreur));
      else a.resoudre(d.valeur);
    });
    w.addEventListener("error", () => { if (this.fil === w) this.abandonner("interrompu"); });
    w.addEventListener("messageerror", () => { if (this.fil === w) this.abandonner("illisible"); });
    this.fil = w;
    return w;
  }
}
