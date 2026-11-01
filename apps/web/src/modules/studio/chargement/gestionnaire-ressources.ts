/**
 * Cycle d'activation et de désactivation des outils et des moteurs d'exécution de Studio (B.3-01 à B.3-05, B.3-08,
 * D.3-02, D.3-04 ; REF-02 IF-005, EX-032, EX-038 à EX-041, §7.3). Proposition d'API soumise à DEC-06.
 *
 * Le gestionnaire résout les moteurs d'un outil (par sa barre, `moteurs.ts`), les charge **une seule fois** pour la
 * session (une promesse partagée par moteur : deux outils qui demandent le même moteur au même instant attendent le
 * même chargement ; un moteur initialisé n'est jamais réinitialisé sans raison), compte ses usages et le libère quand
 * plus rien ne l'emploie et qu'il sait se libérer. Il n'exécute lui-même aucun calcul (EX-032).
 *
 * États techniques distincts (B.3-08), jamais confondus :
 * - **téléchargé** : le code du moteur est présent sur l'appareil (chargé dans la page, ou trouvé dans le cache du
 *   service worker) ;
 * - **initialisé** : le module est évalué et le moteur prêt (Worker créé, rendu monté…) ;
 * - **actif** : au moins un outil actif ou un usage en cours l'emploie ;
 * - **disponible hors connexion** : tous ses fichiers sont dans le cache de ce build (lu, jamais supposé, EX-043) ;
 *   `null` = non évalué (pas de service worker, carte absente).
 *
 * Cycle d'un outil (IF-005, `EtatActivation`) : découvert → vérification de contexte / droits (`verifier`, injecté par
 * l'appelant) → résolution des dépendances (moteurs de la barre et de l'outil) → chargement du code → initialisation
 * (`initialiser` du chargeur : noyau, Worker…) → prêt → actif → suspendu / désactivé ; erreurs `incompatible`,
 * `permission-refusee` (vérification), `hors-ligne`, `echec-chargement` (code), `echec-noyau` (initialisation),
 * `inconnu` (barre hors table). Une erreur reste locale : l'outil précédent reste actif tant que la vérification n'est
 * pas passée, et un **geste inachevé** remis à l'activation (`geste`) est conservé et rendu visible (`gesteConserve`,
 * journal `geste-conserve`), jamais perdu en silence ; en cas d'erreur, il est rendu avec l'erreur (`ErreurMoteur.geste`).
 *
 * Politique de libération (D.3-02, EX-040, `politiques`) : un moteur libérable resté inactif `inactiviteMs` est libéré
 * (Workers arrêtés, instance WebAssembly relâchée) ; tout nouvel usage avant l'échéance l'annule. Un moteur initialisé
 * et compatible n'est jamais réinitialisé sans raison : il ne l'est qu'après une libération ou un échec.
 *
 * Pur : ni React, ni DOM ; chargeurs, horloge et mesures injectés.
 */
import { fermetureMoteurs, MOTEURS, moteursDeOutil, type IdMoteur } from "./moteurs";

export type PhaseMoteur = "non-charge" | "chargement" | "initialise" | "libere" | "echec";
export type CodeErreurMoteur = "echec-chargement" | "echec-noyau" | "hors-ligne" | "inconnu" | "incompatible" | "permission-refusee";

/** Phases du cycle d'activation d'un outil (IF-005). */
export type PhaseActivation = "decouvert" | "verification" | "resolution" | "chargement" | "initialisation" | "pret" | "actif" | "suspendu" | "desactive" | "erreur";

/** Geste inachevé d'un outil au moment d'une transition (tracé commencé, saisie en cours) : conservé, jamais perdu. */
export interface GesteInacheve {
  readonly outil: string;
  /** Description visible (français source). */
  readonly libelleFR: string;
  readonly donnees: unknown;
}

export interface EtatActivation {
  readonly outil: string | null;
  readonly phase: PhaseActivation;
  readonly erreur: CodeErreurMoteur | null;
  /** Phases traversées par la dernière activation (trace, IF-005). */
  readonly trace: readonly PhaseActivation[];
  /** Geste inachevé conservé pendant la dernière transition (rendu visible), ou null. */
  readonly gesteConserve: GesteInacheve | null;
}

export interface OptionsActivation {
  /** Vérification du contexte et des droits avant tout chargement ; un code = refus (rien n'est chargé). */
  readonly verifier?: () => "incompatible" | "permission-refusee" | null;
  /** Geste inachevé de l'outil courant, à conserver pendant la transition. */
  readonly geste?: GesteInacheve | null;
}

export interface EtatMoteur {
  readonly id: IdMoteur;
  readonly phase: PhaseMoteur;
  /** Code présent sur l'appareil (chargé dans la page ou en cache) ; null = non évalué. */
  readonly telecharge: boolean | null;
  readonly initialise: boolean;
  readonly actif: boolean;
  /** Tous les fichiers du moteur sont dans le cache de ce build ; null = non évalué. */
  readonly horsConnexion: boolean | null;
  /** Usages en cours (outil actif, vue montée, tâche). */
  readonly usages: readonly string[];
  /** Nombre d'initialisations depuis l'ouverture de la page (réutilisation : 1 attendu, D.3-04). */
  readonly initialisations: number;
  /** Nombre de libérations. */
  readonly liberations: number;
  readonly erreur: CodeErreurMoteur | null;
}

export interface EvenementRessource {
  readonly t: number;
  readonly type: "chargement" | "initialise" | "echec" | "usage" | "fin-usage" | "libere" | "outil-actif" | "outil-desactive" | "hors-connexion" | "outil-phase" | "geste-conserve" | "liberation-planifiee";
  readonly moteur?: IdMoteur;
  readonly outil?: string;
  readonly detail?: string;
}

export interface ChargeurMoteur {
  /** Charge et initialise le moteur ; absent : moteur « passif », initialisé par signalement (`signalerInitialise`). */
  charger?: () => Promise<unknown>;
  /** Libère les ressources du moteur (Workers, instances) ; absent : le moteur ne se libère pas. */
  liberer?: () => void;
  /**
   * Initialisation après le chargement du code (noyau WebAssembly, Worker…) : son échec est un « échec du noyau »
   * (`echec-noyau`), distinct d'un échec de chargement du code.
   */
  initialiser?: (module: unknown) => Promise<unknown>;
}

/** Politique de libération d'un moteur (D.3-02) : libéré après `inactiviteMs` sans aucun usage. */
export interface PolitiqueLiberation { readonly inactiviteMs: number; readonly motif: string }

export interface OptionsGestionnaire {
  chargeurs: Partial<Record<IdMoteur, ChargeurMoteur>>;
  /** Moteurs déjà présents à la création (le code qui crée le gestionnaire les porte). */
  dejaCharges?: readonly IdMoteur[];
  maintenant?: () => number;
  /** Réseau joignable (un chargement manqué hors connexion devient `hors-ligne`). */
  enLigne?: () => boolean;
  /** Mesure d'une activation d'outil (PERF-02). */
  surActivation?: (m: { outil: string; nature: "simple" | "specialise"; dureeMs: number; moteursCharges: readonly IdMoteur[] }) => void;
  tailleJournal?: number;
  /** Politiques de libération par moteur (D.3-02) ; absent : aucune libération automatique. */
  politiques?: Partial<Record<IdMoteur, PolitiqueLiberation>>;
  /** Minuteur injectable (tests) ; rend la fonction d'annulation. Défaut : `setTimeout`. */
  planifier?: (f: () => void, ms: number) => () => void;
}

interface Interne {
  phase: PhaseMoteur;
  telechargeCache: boolean | null;
  horsConnexion: boolean | null;
  usages: Set<string>;
  initialisations: number;
  liberations: number;
  erreur: CodeErreurMoteur | null;
  promesse: Promise<unknown> | null;
  module: unknown;
  /** Libération planifiée (politique) : fonction d'annulation. */
  annulerLiberation: (() => void) | null;
}

export class ErreurMoteur extends Error {
  constructor(readonly code: CodeErreurMoteur, readonly moteur: IdMoteur | null, message: string, readonly geste: GesteInacheve | null = null) {
    super(message);
    this.name = "ErreurMoteur";
  }
}

export interface ResultatActivation {
  readonly outil: string;
  readonly moteurs: readonly IdMoteur[];
  readonly nature: "simple" | "specialise";
  readonly dureeMs: number;
  /** Geste inachevé de l'outil précédent, conservé pendant la transition (IF-005), ou null. */
  readonly gesteConserve: GesteInacheve | null;
}

export class GestionnaireRessources {
  private readonly etats = new Map<IdMoteur, Interne>();
  private readonly abonnes = new Set<() => void>();
  private instantane: readonly EtatMoteur[] = [];
  private outilActif: string | null = null;
  private generationOutil = 0;
  private activation: EtatActivation = Object.freeze({ outil: null, phase: "decouvert", erreur: null, trace: Object.freeze([]), gesteConserve: null });
  readonly journal: EvenementRessource[] = [];

  constructor(private readonly o: OptionsGestionnaire) {
    for (const m of MOTEURS) {
      const deja = o.dejaCharges?.includes(m.id) ?? false;
      this.etats.set(m.id, {
        phase: deja ? "initialise" : "non-charge", telechargeCache: null, horsConnexion: null, usages: new Set(),
        initialisations: deja ? 1 : 0, liberations: 0, erreur: null, promesse: deja ? Promise.resolve(undefined) : null, module: undefined,
        annulerLiberation: null,
      });
    }
    this.publier();
  }

  private maintenant(): number { return this.o.maintenant?.() ?? Date.now(); }
  private noter(e: Omit<EvenementRessource, "t">): void {
    this.journal.push({ t: this.maintenant(), ...e });
    const max = this.o.tailleJournal ?? 200;
    if (this.journal.length > max) this.journal.splice(0, this.journal.length - max);
  }
  private publier(): void {
    this.instantane = Object.freeze(MOTEURS.map((m) => this.lire(m.id)));
    for (const f of this.abonnes) f();
  }
  private interne(id: IdMoteur): Interne { return this.etats.get(id)!; }

  /** État d'un moteur (copie figée). */
  lire(id: IdMoteur): EtatMoteur {
    const e = this.interne(id);
    const initialise = e.phase === "initialise";
    // Chargé dans la page (initialisé, même libéré ensuite : le code reste en mémoire) ou trouvé en cache.
    const charge = initialise || e.phase === "libere" || e.initialisations > 0;
    return Object.freeze({
      id, phase: e.phase, initialise, actif: e.usages.size > 0, usages: Object.freeze([...e.usages]),
      telecharge: charge ? true : e.telechargeCache, horsConnexion: e.horsConnexion,
      initialisations: e.initialisations, liberations: e.liberations, erreur: e.erreur,
    });
  }
  /** Instantané stable de tous les moteurs (même référence tant que rien ne change). */
  readonly instantaneEtats = (): readonly EtatMoteur[] => this.instantane;
  readonly abonner = (f: () => void): (() => void) => { this.abonnes.add(f); return () => { this.abonnes.delete(f); }; };
  get outilCourant(): string | null { return this.outilActif; }
  /** Cycle d'activation de l'outil courant (IF-005). */
  readonly etatActivation = (): EtatActivation => this.activation;

  private phaseOutil(outil: string, phase: PhaseActivation, maj: Partial<Pick<EtatActivation, "erreur" | "gesteConserve">> = {}, nouvelle = false): void {
    const trace = nouvelle ? [phase] : [...this.activation.trace, phase];
    this.activation = Object.freeze({
      outil, phase, erreur: maj.erreur ?? (phase === "erreur" ? this.activation.erreur : null), trace: Object.freeze(trace),
      gesteConserve: maj.gesteConserve !== undefined ? maj.gesteConserve : this.activation.gesteConserve,
    });
    this.noter({ type: "outil-phase", outil, detail: phase });
  }

  /** Libération planifiée selon la politique du moteur (D.3-02), si rien ne l'emploie. */
  private planifierLiberation(id: IdMoteur): void {
    const politique = this.o.politiques?.[id];
    const e = this.interne(id);
    if (!politique || e.annulerLiberation || !this.peutLiberer(id)) return;
    const planifier = this.o.planifier ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
    this.noter({ type: "liberation-planifiee", moteur: id, detail: `${politique.inactiviteMs} ms` });
    e.annulerLiberation = planifier(() => { e.annulerLiberation = null; this.liberer(id); }, politique.inactiviteMs);
  }
  private annulerLiberationPlanifiee(id: IdMoteur): void {
    const e = this.interne(id);
    e.annulerLiberation?.();
    e.annulerLiberation = null;
  }

  /**
   * Charge un moteur et ses dépendances (une seule fois). Le module chargé est rendu à l'appelant ; un moteur passif
   * (sans `charger`) se résout tout de suite : il s'initialise de lui-même au premier calcul.
   */
  charger(id: IdMoteur): Promise<unknown> {
    const e = this.interne(id);
    if (e.promesse && e.phase !== "echec") return e.promesse;
    const chargeur = this.o.chargeurs[id];
    const deps = fermetureMoteurs([id]).filter((d) => d !== id);
    const avant = e.phase;
    e.phase = "chargement";
    e.erreur = null;
    this.noter({ type: "chargement", moteur: id });
    this.publier();
    e.promesse = (async () => {
      for (const d of deps) await this.charger(d);
      if (!chargeur?.charger) {
        // Moteur passif : rien à charger ici ; il reste « non initialisé » tant qu'il ne l'a pas signalé.
        if (e.phase === "chargement") e.phase = avant === "echec" || avant === "chargement" ? "non-charge" : avant;
        this.publier();
        return undefined;
      }
      const module = await chargeur.charger();
      if (chargeur.initialiser) {
        try { await chargeur.initialiser(module); } catch (err) { throw new ErreurMoteur("echec-noyau", id, err instanceof Error ? err.message : String(err)); }
      }
      e.module = module;
      e.phase = "initialise";
      e.initialisations += 1;
      this.noter({ type: "initialise", moteur: id });
      this.publier();
      return module;
    })().catch((err: unknown) => {
      e.phase = "echec";
      e.erreur = err instanceof ErreurMoteur && err.code === "echec-noyau" ? "echec-noyau" : this.o.enLigne && !this.o.enLigne() ? "hors-ligne" : "echec-chargement";
      e.promesse = null;
      this.noter({ type: "echec", moteur: id, detail: err instanceof Error ? err.message : String(err) });
      this.publier();
      throw new ErreurMoteur(e.erreur, id, `Chargement du moteur ${id} impossible.`);
    });
    return e.promesse;
  }

  /** Un moteur passif s'est initialisé de lui-même (Worker créé…) ; idempotent tant qu'il n'a pas été libéré. */
  signalerInitialise(id: IdMoteur): void {
    const e = this.interne(id);
    if (e.phase === "initialise") return;
    e.phase = "initialise";
    e.erreur = null;
    e.initialisations += 1;
    if (!e.promesse) e.promesse = Promise.resolve(undefined);
    this.noter({ type: "initialise", moteur: id });
    this.publier();
  }

  /** Déclare un usage (outil actif, vue montée) ; la fonction rendue y met fin. */
  utiliser(id: IdMoteur, par: string): () => void {
    const e = this.interne(id);
    this.annulerLiberationPlanifiee(id);
    if (!e.usages.has(par)) {
      e.usages.add(par);
      this.noter({ type: "usage", moteur: id, detail: par });
      this.publier();
    }
    let fini = false;
    return () => {
      if (fini) return;
      fini = true;
      if (e.usages.delete(par)) { this.noter({ type: "fin-usage", moteur: id, detail: par }); this.planifierLiberation(id); this.publier(); }
    };
  }

  private libererUsagesOutil(outil: string): void {
    for (const id of fermetureMoteurs(MOTEURS.map((m) => m.id))) {
      const e = this.interne(id);
      if (e.usages.delete(`outil:${outil}`)) { this.noter({ type: "fin-usage", moteur: id, detail: `outil:${outil}` }); this.planifierLiberation(id); }
    }
  }

  /**
   * Active un outil (barre du registre) selon le cycle IF-005 : vérification du contexte et des droits (rien n'est
   * chargé si elle refuse ; l'outil précédent reste actif), résolution des moteurs, chargement et initialisation au
   * besoin, puis prêt et actif ; l'outil précédent est alors désactivé (ses moteurs restent initialisés). Un geste
   * inachevé remis (`geste`) est conservé et rendu visible. Une activation dépassée par une autre ne marque rien.
   */
  async activerOutil(outil: string, groupe: string, o: OptionsActivation = {}): Promise<ResultatActivation> {
    const geste = o.geste ?? null;
    this.phaseOutil(outil, "decouvert", { gesteConserve: geste }, true);
    if (geste) this.noter({ type: "geste-conserve", outil: geste.outil, detail: geste.libelleFR });
    const refuser = (code: CodeErreurMoteur, message: string, moteur: IdMoteur | null = null): never => {
      this.phaseOutil(outil, "erreur", { erreur: code });
      this.publier();
      throw new ErreurMoteur(code, moteur, message, geste);
    };
    this.phaseOutil(outil, "verification");
    const refus = o.verifier?.() ?? null;
    if (refus) refuser(refus, refus === "incompatible" ? `Outil incompatible avec ce contexte : ${outil}` : `Permission refusée : ${outil}`);
    this.phaseOutil(outil, "resolution");
    const moteurs = moteursDeOutil(outil, groupe);
    if (!moteurs) return refuser("inconnu", `Barre sans moteur connu : ${groupe}`);
    const debut = this.maintenant();
    const generation = ++this.generationOutil;
    if (this.outilActif && this.outilActif !== outil) {
      this.libererUsagesOutil(this.outilActif);
      this.noter({ type: "outil-desactive", outil: this.outilActif });
    }
    this.outilActif = outil;
    for (const id of moteurs) this.annulerLiberationPlanifiee(id);
    const aCharger = moteurs.filter((id) => this.interne(id).phase !== "initialise" && this.o.chargeurs[id]?.charger);
    if (aCharger.length) this.phaseOutil(outil, "chargement");
    try {
      await Promise.all(moteurs.map((id) => this.charger(id)));
    } catch (err) {
      if (generation === this.generationOutil) {
        const code = err instanceof ErreurMoteur ? err.code : "echec-chargement";
        return refuser(code, err instanceof Error ? err.message : String(err), err instanceof ErreurMoteur ? err.moteur : null);
      }
      throw err;
    }
    const resultat: ResultatActivation = { outil, moteurs, nature: aCharger.length ? "specialise" : "simple", dureeMs: this.maintenant() - debut, gesteConserve: geste };
    if (generation !== this.generationOutil) return resultat;
    if (aCharger.length) this.phaseOutil(outil, "initialisation");
    this.phaseOutil(outil, "pret");
    for (const id of moteurs) this.interne(id).usages.add(`outil:${outil}`);
    this.phaseOutil(outil, "actif");
    this.noter({ type: "outil-actif", outil, detail: `${resultat.nature} ${resultat.dureeMs} ms` });
    this.publier();
    this.o.surActivation?.({ outil, nature: resultat.nature, dureeMs: resultat.dureeMs, moteursCharges: aCharger });
    return resultat;
  }

  /** Suspend l'outil courant (dialogue, autre mode) : ses moteurs deviennent inactifs, l'outil reste le courant. */
  suspendreOutil(): void {
    if (!this.outilActif || this.activation.phase !== "actif") return;
    this.libererUsagesOutil(this.outilActif);
    this.phaseOutil(this.outilActif, "suspendu");
    this.publier();
  }

  /** Reprend l'outil suspendu : ses moteurs (toujours initialisés, ou rechargés après une libération) redeviennent actifs. */
  async reprendreOutil(groupe: string): Promise<ResultatActivation | null> {
    if (!this.outilActif || this.activation.phase !== "suspendu") return null;
    return this.activerOutil(this.outilActif, groupe, { geste: this.activation.gesteConserve });
  }

  /** Désactive l'outil courant (fermeture de la planche) : ses moteurs deviennent inactifs. */
  desactiverOutil(): void {
    if (!this.outilActif) return;
    this.generationOutil += 1;
    this.libererUsagesOutil(this.outilActif);
    this.noter({ type: "outil-desactive", outil: this.outilActif });
    this.phaseOutil(this.outilActif, "desactive");
    this.outilActif = null;
    this.publier();
  }

  /** Libérable : initialisé, inactif, et sachant se libérer. */
  peutLiberer(id: IdMoteur): boolean {
    const e = this.interne(id);
    return e.phase === "initialise" && e.usages.size === 0 && !!this.o.chargeurs[id]?.liberer;
  }

  /**
   * Libère un moteur inactif (Workers arrêtés, instances relâchées) : il sera réinitialisé à sa prochaine demande.
   * Refusé (false) s'il est encore employé ou s'il ne sait pas se libérer.
   */
  liberer(id: IdMoteur): boolean {
    if (!this.peutLiberer(id)) return false;
    const e = this.interne(id);
    this.annulerLiberationPlanifiee(id);
    this.o.chargeurs[id]!.liberer!();
    e.phase = "libere";
    e.promesse = null;
    e.liberations += 1;
    this.noter({ type: "libere", moteur: id });
    this.publier();
    return true;
  }

  /** Résultat de la vérification du cache (`cache-hors-ligne.ts`) ; null = non évalué. */
  poserHorsConnexion(etats: Partial<Record<IdMoteur, boolean | null>>): void {
    for (const [id, v] of Object.entries(etats) as [IdMoteur, boolean | null][]) {
      const e = this.interne(id);
      e.horsConnexion = v;
      e.telechargeCache = v;
    }
    this.noter({ type: "hors-connexion", detail: JSON.stringify(etats) });
    this.publier();
  }
}

/** Libellés des états (français source, traduits dans en.json). */
export const LIBELLES_ETATS = Object.freeze({
  oui: "oui",
  non: "non",
  nonEvalue: "non évalué",
  telecharge: "Téléchargé",
  initialise: "Initialisé",
  actif: "Actif",
  horsConnexion: "Disponible hors connexion",
});

/** Libellés des phases du cycle d'activation d'un outil (IF-005 ; français source, traduits dans en.json). */
export const LIBELLES_PHASES_ACTIVATION: Readonly<Record<PhaseActivation, string>> = Object.freeze({
  decouvert: "découvert",
  verification: "vérification du contexte et des droits",
  resolution: "résolution des dépendances",
  chargement: "chargement du code",
  initialisation: "initialisation",
  pret: "prêt",
  actif: "actif",
  suspendu: "suspendu",
  desactive: "désactivé",
  erreur: "erreur",
});

export const LIBELLES_PHASES: Readonly<Record<PhaseMoteur, string>> = Object.freeze({
  "non-charge": "non chargé",
  chargement: "chargement en cours",
  initialise: "prêt",
  libere: "libéré",
  echec: "échec du chargement",
});

export const MESSAGES_ERREUR_MOTEUR: Readonly<Record<CodeErreurMoteur, string>> = Object.freeze({
  "echec-chargement": "Le moteur n’a pas pu être chargé : réessayez.",
  "echec-noyau": "Le noyau de calcul n’a pas pu démarrer : réessayez.",
  incompatible: "Outil incompatible avec ce contexte.",
  "permission-refusee": "Permission refusée pour cet outil.",
  "hors-ligne": "Hors ligne : ce moteur n’est pas dans le cache de l’appareil.",
  inconnu: "Outil sans moteur connu.",
});
