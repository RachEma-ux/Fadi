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
 * Cycle d'un outil (IF-005) : découvert → résolution des moteurs → chargement → initialisation → prêt → actif →
 * désactivé ; erreurs `echec-chargement`, `hors-ligne` (chargement impossible sans réseau), `inconnu` (barre hors
 * table). Une erreur reste locale au moteur ; l'outil précédent n'est pas perdu.
 *
 * Pur : ni React, ni DOM ; chargeurs, horloge et mesures injectés.
 */
import { fermetureMoteurs, MOTEURS, moteursDeBarre, type IdMoteur } from "./moteurs";

export type PhaseMoteur = "non-charge" | "chargement" | "initialise" | "libere" | "echec";
export type CodeErreurMoteur = "echec-chargement" | "hors-ligne" | "inconnu";

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
  readonly type: "chargement" | "initialise" | "echec" | "usage" | "fin-usage" | "libere" | "outil-actif" | "outil-desactive" | "hors-connexion";
  readonly moteur?: IdMoteur;
  readonly outil?: string;
  readonly detail?: string;
}

export interface ChargeurMoteur {
  /** Charge et initialise le moteur ; absent : moteur « passif », initialisé par signalement (`signalerInitialise`). */
  charger?: () => Promise<unknown>;
  /** Libère les ressources du moteur (Workers, instances) ; absent : le moteur ne se libère pas. */
  liberer?: () => void;
}

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
}

export class ErreurMoteur extends Error {
  constructor(readonly code: CodeErreurMoteur, readonly moteur: IdMoteur | null, message: string) {
    super(message);
    this.name = "ErreurMoteur";
  }
}

export interface ResultatActivation {
  readonly outil: string;
  readonly moteurs: readonly IdMoteur[];
  readonly nature: "simple" | "specialise";
  readonly dureeMs: number;
}

export class GestionnaireRessources {
  private readonly etats = new Map<IdMoteur, Interne>();
  private readonly abonnes = new Set<() => void>();
  private instantane: readonly EtatMoteur[] = [];
  private outilActif: string | null = null;
  private generationOutil = 0;
  readonly journal: EvenementRessource[] = [];

  constructor(private readonly o: OptionsGestionnaire) {
    for (const m of MOTEURS) {
      const deja = o.dejaCharges?.includes(m.id) ?? false;
      this.etats.set(m.id, {
        phase: deja ? "initialise" : "non-charge", telechargeCache: null, horsConnexion: null, usages: new Set(),
        initialisations: deja ? 1 : 0, liberations: 0, erreur: null, promesse: deja ? Promise.resolve(undefined) : null, module: undefined,
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
      e.module = module;
      e.phase = "initialise";
      e.initialisations += 1;
      this.noter({ type: "initialise", moteur: id });
      this.publier();
      return module;
    })().catch((err: unknown) => {
      e.phase = "echec";
      e.erreur = this.o.enLigne && !this.o.enLigne() ? "hors-ligne" : "echec-chargement";
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
    if (!e.usages.has(par)) {
      e.usages.add(par);
      this.noter({ type: "usage", moteur: id, detail: par });
      this.publier();
    }
    let fini = false;
    return () => {
      if (fini) return;
      fini = true;
      if (e.usages.delete(par)) { this.noter({ type: "fin-usage", moteur: id, detail: par }); this.publier(); }
    };
  }

  private libererUsagesOutil(outil: string): void {
    for (const id of fermetureMoteurs(MOTEURS.map((m) => m.id))) {
      const e = this.interne(id);
      if (e.usages.delete(`outil:${outil}`)) this.noter({ type: "fin-usage", moteur: id, detail: `outil:${outil}` });
    }
  }

  /**
   * Active un outil (barre du registre) : ses moteurs sont chargés s'il le faut puis marqués actifs ; l'outil
   * précédent est désactivé (ses moteurs restent initialisés, simplement inactifs). Une activation dépassée par une
   * autre (changement d'outil pendant un chargement) ne marque rien.
   */
  async activerOutil(outil: string, groupe: string): Promise<ResultatActivation> {
    const moteurs = moteursDeBarre(groupe);
    if (!moteurs) throw new ErreurMoteur("inconnu", null, `Barre sans moteur connu : ${groupe}`);
    const debut = this.maintenant();
    const generation = ++this.generationOutil;
    if (this.outilActif && this.outilActif !== outil) {
      this.libererUsagesOutil(this.outilActif);
      this.noter({ type: "outil-desactive", outil: this.outilActif });
    }
    this.outilActif = outil;
    const aCharger = moteurs.filter((id) => this.interne(id).phase !== "initialise" && this.o.chargeurs[id]?.charger);
    await Promise.all(moteurs.map((id) => this.charger(id)));
    const resultat: ResultatActivation = { outil, moteurs, nature: aCharger.length ? "specialise" : "simple", dureeMs: this.maintenant() - debut };
    if (generation !== this.generationOutil) return resultat;
    for (const id of moteurs) this.interne(id).usages.add(`outil:${outil}`);
    this.noter({ type: "outil-actif", outil, detail: `${resultat.nature} ${resultat.dureeMs} ms` });
    this.publier();
    this.o.surActivation?.({ outil, nature: resultat.nature, dureeMs: resultat.dureeMs, moteursCharges: aCharger });
    return resultat;
  }

  /** Désactive l'outil courant (fermeture de la planche) : ses moteurs deviennent inactifs. */
  desactiverOutil(): void {
    if (!this.outilActif) return;
    this.generationOutil += 1;
    this.libererUsagesOutil(this.outilActif);
    this.noter({ type: "outil-desactive", outil: this.outilActif });
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

export const LIBELLES_PHASES: Readonly<Record<PhaseMoteur, string>> = Object.freeze({
  "non-charge": "non chargé",
  chargement: "chargement en cours",
  initialise: "prêt",
  libere: "libéré",
  echec: "échec du chargement",
});

export const MESSAGES_ERREUR_MOTEUR: Readonly<Record<CodeErreurMoteur, string>> = Object.freeze({
  "echec-chargement": "Le moteur n’a pas pu être chargé : réessayez.",
  "hors-ligne": "Hors ligne : ce moteur n’est pas dans le cache de l’appareil.",
  inconnu: "Outil sans moteur connu.",
});
