/**
 * Bus local du nouvel Atelier (cahier §5.7, tâche L2.4) — sans interface au lot 2 (le nouvel Atelier arrive
 * au lot 3a ; l'Atelier visible reste l'ancien).
 *
 * Principe :
 * - **état confirmé** = dernier instantané du serveur (`GET /model`), avancé localement par chaque lot accepté
 *   avec le même réducteur que le serveur (`appliquerLot` d'`@parcours/atelier-model`), rechargé en cas de doute ;
 *   mis en cache (rouverture hors ligne) ;
 * - **état local** = état confirmé + lots de la file appliqués dans l'ordre (aperçu optimiste) ;
 * - **file** : une entrée par lot (`requestId` stable, `baseRevision`, enveloppe), persistée avant l'envoi,
 *   envoyée une à une dans l'ordre, rejouée à la reconnexion et après rechargement (une entrée rechargée
 *   « envoyée » repart avec le même `requestId` : le serveur renvoie la réponse enregistrée, T06) ;
 * - **refus** (400, 403, 404) : le lot sort de la file, son effet optimiste est annulé (état local recomposé) ;
 *   les lots suivants, jamais envoyés, sont revalidés et recalés sur la révision confirmée — c'est notre propre
 *   chaîne, sans changement distant — ou refusés à leur tour s'ils dépendaient du lot refusé ;
 * - **conflit** (409, règle stricte D-015) : le lot reste en tête, « en conflit », et bloque la file ; aucune
 *   fusion automatique. Résolution explicite (`resoudreConflit`) : « garder le serveur » abandonne le lot, et
 *   le lot suivant, fondé sur lui, passe à son tour en conflit (détecté localement) ; « rejouer mes commandes » relit le serveur, revalide le lot **et les suivants** sur son état et les renvoie
 *   (nouveau `requestId` pour le lot en conflit, les suivants n'étant jamais partis gardent le leur) ;
 * - **révision distante** (`rafraichir`, `GET /journal?apres=n`) : nouvel état confirmé ; tant qu'un changement
 *   distant n'a pas été traité explicitement, aucune `baseRevision` n'est recalée (les lots en attente iront au
 *   409, puis à la résolution) ;
 * - 423 (réservation d'autrui), coupure, erreur serveur : le lot reste « en attente », l'envoi reprend au
 *   prochain déclencheur (retour de la joignabilité, nouveau lot, `synchroniser()`).
 */
import { appliquerLot, CONTRAT_COMMANDES, type Commande, type EnveloppeCommandes, type EtatModele, type IdObjet, type ObjetModele } from "@parcours/atelier-model";
import type { DetailErreur, EntreeJournal, ReponseCommandes, ReponseConflit, ReponseJournal, ResultatEcriture } from "../../../lib/api/atelier-commandes";
import { donneesConflit, type DonneesConflit } from "./conflits";
import { Emetteur } from "./evenements";
import type { SourceJoignabilite } from "./joignabilite";
import type { StockageFile } from "./stockage";
import type { EntreeFile, EtatEnveloppe, EvenementsBus, Joignabilite, OrigineRefus } from "./types";

/** Ce que le bus attend du serveur (sous-ensemble de `ClientAtelierCommandes`). */
export interface TransportAtelier {
  lireModele(projectId: string): Promise<EtatModele>;
  envoyerCommandes(projectId: string, enveloppe: EnveloppeCommandes): Promise<ResultatEcriture>;
  lireJournal(projectId: string, apres: number): Promise<ReponseJournal>;
}

export interface OptionsBus {
  readonly projectId: string;
  readonly transport: TransportAtelier;
  readonly stockage: StockageFile;
  readonly joignabilite: SourceJoignabilite;
  readonly genererId?: () => string;
  readonly maintenant?: () => string;
}

export type ResultatExecution = { readonly ok: true; readonly requestId: string; readonly etat: EtatModele } | { readonly ok: false; readonly erreurs: readonly DetailErreur[] };

export type ChoixConflit = "garder-serveur" | "rejouer";

export type ResultatResolution = { readonly ok: true; readonly requestId: string | null } | { readonly ok: false; readonly erreurs: readonly DetailErreur[] };

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Repli (contexte non sécurisé) : 122 bits aléatoires au format UUID v4.
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  h[12] = "4";
  h[16] = ((parseInt(h[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const detail = (objet: string, cause: string, action: string, chemin = ""): DetailErreur => ({ chemin, objet, cause, action, message: `${objet} : ${cause}. Action : ${action}.` });

export class BusAtelier {
  readonly projectId: string;
  private readonly transport: TransportAtelier;
  private readonly stockage: StockageFile;
  private readonly source: SourceJoignabilite;
  private readonly genererId: () => string;
  private readonly maintenant: () => string;
  private readonly evenements = new Emetteur<EvenementsBus>();

  private confirme: EtatModele | null = null;
  private local: EtatModele | null = null;
  private file: EntreeFile[] = [];
  private readonly statuts = new Map<string, EtatEnveloppe>();
  /** Lot en conflit rejoué sous un nouveau `requestId` : ancien → nouveau. */
  private readonly remplaces = new Map<string, string>();
  /** Lots gardés dans la file mais absents de l'aperçu local (ne s'appliquent plus sur l'état confirmé). */
  private readonly horsApercu = new Set<string>();
  /** Un changement distant est arrivé depuis la construction de la file : aucun recalage automatique. */
  private distant = false;
  private joignabiliteConnue: Joignabilite;
  private chaine: Promise<unknown> = Promise.resolve();
  private synchro: Promise<void> | null = null;
  private relancer = false;
  private desabonner: (() => void) | null = null;
  /** Dernière erreur de persistance (IndexedDB) ; la file continue en mémoire. */
  erreurPersistance: string | null = null;

  constructor(options: OptionsBus) {
    this.projectId = options.projectId;
    this.transport = options.transport;
    this.stockage = options.stockage;
    this.source = options.joignabilite;
    this.genererId = options.genererId ?? uuid;
    this.maintenant = options.maintenant ?? (() => new Date().toISOString());
    this.joignabiliteConnue = this.source.etat();
  }

  // -------------------------------------------------------------------------
  // Lecture
  // -------------------------------------------------------------------------

  on<K extends keyof EvenementsBus>(nom: K, fn: (v: EvenementsBus[K]) => void): () => void {
    return this.evenements.on(nom, fn);
  }

  /** État local (confirmé + file, optimiste) ; `null` tant qu'aucun modèle n'a été lu ni mis en cache. */
  etatLocal(): EtatModele | null {
    return this.local;
  }

  etatConfirme(): EtatModele | null {
    return this.confirme;
  }

  /** Entrées de la file, dans l'ordre d'envoi. */
  entrees(): readonly EntreeFile[] {
    return [...this.file];
  }

  /** État d'une enveloppe (suit un lot rejoué sous un nouveau `requestId`). */
  etatDe(requestId: string): EtatEnveloppe | null {
    let id = requestId;
    for (let n = 0; n < 16 && this.remplaces.has(id); n++) id = this.remplaces.get(id)!;
    return this.statuts.get(id) ?? null;
  }

  /** Lots gardés dans la file mais qui ne s'appliquent plus sur l'état confirmé (aperçu partiel). */
  lotsHorsApercu(): readonly string[] {
    return [...this.horsApercu];
  }

  joignabilite(): Joignabilite {
    return this.joignabiliteConnue;
  }

  /** Données des conflits pour le panneau (`ConflictPanel` via `adaptateurs.ts`). */
  conflits(): DonneesConflit[] {
    return this.file.flatMap((e, i) => (e.etat === "en-conflit" && e.conflit ? [donneesConflit(e.requestId, e.enveloppe, e.conflit, this.file.length - i - 1)] : []));
  }

  resume(): EvenementsBus["etat"] {
    return {
      enAttente: this.file.filter((e) => e.etat !== "en-conflit").length,
      conflits: this.file.filter((e) => e.etat === "en-conflit").length,
      revisionConfirmee: this.confirme?.revision ?? null,
      revisionLocale: this.local?.revision ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Cycle de vie
  // -------------------------------------------------------------------------

  /** Relit la file et le modèle en cache, puis le serveur s'il répond, et relance l'envoi. */
  async ouvrir(): Promise<void> {
    await this.exclusif(async () => {
      const [entrees, cache] = await Promise.all([this.persister(this.stockage.lister(this.projectId), [] as EntreeFile[]), this.persister(this.stockage.lireModele(this.projectId), null)]);
      // Une entrée « envoyée » au moment de la fermeture repart en attente avec le même requestId (idempotence serveur).
      this.file = entrees.map((e) => (e.etat === "envoyee" ? { ...e, etat: "en-attente" as const } : e));
      for (const e of this.file) this.statuts.set(e.requestId, e.etat);
      if (cache) this.confirme = cache.modele;
      if (this.source.etat() === "en-ligne") {
        const avant = this.confirme?.revision ?? null;
        const lu = await this.recharger();
        // Le serveur a bougé depuis le cache alors que des lots attendaient : changement distant possible.
        if (lu && avant !== null && this.confirme && this.confirme.revision !== avant && this.file.length > 0) this.distant = true;
      }
      this.recomposer();
    });
    if (!this.desabonner) this.desabonner = this.source.subscribe(() => this.joignabiliteChangee());
    this.emettreEtat();
    void this.synchroniser();
  }

  fermer(): void {
    this.desabonner?.();
    this.desabonner = null;
  }

  // -------------------------------------------------------------------------
  // Écriture
  // -------------------------------------------------------------------------

  /**
   * Exécute un lot : validé et appliqué localement (aperçu optimiste), persisté dans la file, puis envoyé.
   * Refus local (réducteur) : rien n'est mis en file.
   */
  async executer(label: string, commands: readonly Commande[]): Promise<ResultatExecution> {
    const base = this.local;
    if (!base) {
      const erreurs = [detail("Modèle", "non chargé (ni serveur ni cache local)", "ouvrir le projet en ligne une première fois")];
      return { ok: false, erreurs };
    }
    const requestId = this.genererId();
    const enveloppe: EnveloppeCommandes = { requestId, baseRevision: base.revision, contract: CONTRAT_COMMANDES, label, commands };
    const r = appliquerLot(base, enveloppe);
    if (!r.ok) {
      this.evenements.emettre("lot-refuse", { requestId, label, origine: "local", http: null, erreurs: r.erreurs });
      return { ok: false, erreurs: r.erreurs };
    }
    const ordre = (this.file[this.file.length - 1]?.ordre ?? 0) + 1;
    const entree: EntreeFile = { requestId, projectId: this.projectId, ordre, enveloppe, etat: "en-attente", tentatives: 0, derniereErreur: null, creeLe: this.maintenant(), conflit: null };
    this.file.push(entree);
    this.statuts.set(requestId, "en-attente");
    this.local = r.etat;
    await this.persister(this.stockage.ecrire(entree), undefined);
    this.emettreEtat();
    void this.synchroniser();
    return { ok: true, requestId, etat: r.etat };
  }

  /** Envoie la file dans l'ordre tant que le serveur répond et qu'aucun conflit ne la bloque. */
  synchroniser(): Promise<void> {
    if (this.synchro) {
      this.relancer = true;
      return this.synchro;
    }
    this.synchro = this.exclusif(async () => {
      do {
        this.relancer = false;
        await this.vider();
      } while (this.relancer);
    }).finally(() => {
      this.synchro = null;
    });
    return this.synchro;
  }

  /**
   * Révisions distantes : `GET /journal?apres=n` ; s'il y a du nouveau, relit le modèle, recompose l'aperçu et
   * émet `revision-distante`. Rend `true` si l'état confirmé a changé.
   */
  rafraichir(): Promise<boolean> {
    return this.exclusif(async () => {
      if (!this.confirme) return this.recharger();
      const de = this.confirme.revision;
      let journal: ReponseJournal;
      try {
        journal = await this.transport.lireJournal(this.projectId, de);
      } catch {
        return false;
      }
      if (journal.revisionCourante <= de && journal.entrees.length === 0) return false;
      if (!(await this.recharger())) return false;
      const nos = new Set(this.file.map((e) => e.requestId));
      if (this.file.length > 0 && journal.entrees.some((e) => !nos.has(e.requestId))) this.distant = true;
      this.recomposer();
      this.emettreDistant(de, journal.entrees);
      this.emettreEtat();
      return true;
    });
  }

  /** Résolution explicite d'un conflit 409 (jamais de fusion automatique). */
  resoudreConflit(requestId: string, choix: ChoixConflit): Promise<ResultatResolution> {
    const resultat = this.exclusif(async (): Promise<ResultatResolution> => {
      const i = this.file.findIndex((e) => e.requestId === requestId);
      const entree = this.file[i];
      if (!entree || entree.etat !== "en-conflit") return { ok: false, erreurs: [detail(`Lot ${requestId}`, "n'est pas en conflit", "recharger la file")] };
      if (choix === "garder-serveur") {
        const localAvant = this.local;
        this.file.splice(i, 1);
        this.statuts.set(requestId, "refusee");
        await this.persister(this.stockage.supprimer(requestId), undefined);
        const de = this.confirme?.revision ?? null;
        if (await this.recharger()) this.emettreDistant(de, []);
        // Le lot suivant était fondé sur le lot abandonné : sa révision de base ne désigne plus l'état sur lequel
        // il a été validé (elle peut coïncider par hasard avec celle du serveur). Il passe à son tour « en
        // conflit », détecté localement, pour une décision explicite — jamais envoyé ni recalé en silence.
        const suivant = this.file[i];
        if (suivant && suivant.etat !== "en-conflit") await this.conflitLocal(i, suivant, localAvant, `fondé sur le lot « ${entree.enveloppe.label} » abandonné au profit du serveur`);
        this.recomposer();
        this.evenements.emettre("lot-refuse", { requestId, label: entree.enveloppe.label, origine: "abandon", http: 409, erreurs: [] });
        this.emettreEtat();
        return { ok: true, requestId: null };
      }
      return this.rejouer(i);
    });
    void resultat.then(() => this.synchroniser());
    return resultat;
  }

  // -------------------------------------------------------------------------
  // Interne
  // -------------------------------------------------------------------------

  /** « Rejouer mes commandes » : relit le serveur, revalide le lot en conflit puis les suivants, et les recale. */
  private async rejouer(i: number): Promise<ResultatResolution> {
    const entree = this.file[i]!;
    const de = this.confirme?.revision ?? null;
    if (!(await this.recharger())) {
      return { ok: false, erreurs: [detail("Serveur", "injoignable : l'état courant n'a pas pu être relu", "réessayer quand le serveur répond")] };
    }
    this.emettreDistant(de, []);
    let etat = this.confirme!;
    // 1. Le lot en conflit, sur l'état courant du serveur, sous un nouveau requestId.
    const nouveau = this.genererId();
    const env: EnveloppeCommandes = { ...entree.enveloppe, requestId: nouveau, baseRevision: etat.revision };
    const r = appliquerLot(etat, env);
    if (!r.ok) {
      const conflit = { ...entree.conflit!, erreursRevalidation: r.erreurs };
      const garde: EntreeFile = { ...entree, conflit };
      this.file[i] = garde;
      await this.persister(this.stockage.ecrire(garde), undefined);
      this.recomposer();
      this.emettreEtat();
      return { ok: false, erreurs: r.erreurs };
    }
    etat = r.etat;
    const rejoue: EntreeFile = { ...entree, requestId: nouveau, enveloppe: env, etat: "en-attente", tentatives: 0, derniereErreur: null, conflit: null };
    this.file[i] = rejoue;
    this.remplaces.set(entree.requestId, nouveau);
    this.statuts.delete(entree.requestId);
    this.statuts.set(nouveau, "en-attente");
    await this.persister(this.stockage.supprimer(entree.requestId), undefined);
    await this.persister(this.stockage.ecrire(rejoue), undefined);
    // 2. Les lots suivants (jamais envoyés) : revalidés dans l'ordre et recalés ; un lot devenu invalide est refusé.
    const suivants = this.file.slice(i + 1);
    const gardes: EntreeFile[] = [];
    for (const s of suivants) {
      const envS: EnveloppeCommandes = { ...s.enveloppe, baseRevision: etat.revision };
      const rs = appliquerLot(etat, envS);
      if (rs.ok) {
        etat = rs.etat;
        const recale: EntreeFile = { ...s, enveloppe: envS };
        gardes.push(recale);
        await this.persister(this.stockage.ecrire(recale), undefined);
      } else {
        await this.refuserSansRecomposer(s, "revalidation", null, rs.erreurs);
      }
    }
    this.file = [...this.file.slice(0, i + 1), ...gardes];
    // La chaîne est désormais fondée sur l'état relu du serveur, par décision explicite.
    this.distant = false;
    this.recomposer();
    this.emettreEtat();
    return { ok: true, requestId: nouveau };
  }

  private async vider(): Promise<void> {
    for (;;) {
      if (this.source.etat() !== "en-ligne") return;
      const tete = this.file[0];
      if (!tete || tete.etat === "en-conflit") return;
      const envoyee: EntreeFile = { ...tete, etat: "envoyee", tentatives: tete.tentatives + 1 };
      this.file[0] = envoyee;
      this.statuts.set(envoyee.requestId, "envoyee");
      await this.persister(this.stockage.ecrire(envoyee), undefined);
      this.emettreEtat();
      let res: ResultatEcriture;
      try {
        res = await this.transport.envoyerCommandes(this.projectId, envoyee.enveloppe);
      } catch (err) {
        res = { statut: "erreur", http: 0, message: err instanceof Error ? err.message : String(err) };
      }
      switch (res.statut) {
        case "accepte":
          await this.accepter(envoyee, res.reponse);
          continue;
        case "invalide":
          await this.refuser(envoyee, "serveur", 400, res.details.length > 0 ? res.details : [detail("Lot", res.message, "corriger la saisie")]);
          continue;
        case "interdit":
          await this.refuser(envoyee, "serveur", res.http, [detail("Projet", res.message, res.http === 404 ? "vérifier l'accès au projet" : "demander le droit d'écriture")]);
          continue;
        case "conflit":
          await this.marquerConflit(envoyee, res.conflit);
          return;
        case "reserve":
          await this.reporter(envoyee, `Réservation d'édition d'autrui : ${res.message}`, 423);
          return;
        case "injoignable":
          await this.reporter(envoyee, `Serveur injoignable : ${res.message}`, null);
          return;
        case "erreur":
          await this.reporter(envoyee, `Erreur du serveur : ${res.message}`, res.http);
          return;
      }
    }
  }

  private async accepter(entree: EntreeFile, reponse: ReponseCommandes): Promise<void> {
    this.file = this.file.filter((e) => e.requestId !== entree.requestId);
    this.statuts.set(entree.requestId, "acceptee");
    await this.persister(this.stockage.supprimer(entree.requestId), undefined);
    let avance = false;
    if (this.confirme && this.confirme.revision === entree.enveloppe.baseRevision) {
      // Même réducteur que le serveur : l'état confirmé avance sans relecture.
      const r = appliquerLot(this.confirme, entree.enveloppe);
      if (r.ok && r.etat.revision === reponse.revision) {
        this.confirme = r.etat;
        avance = true;
        await this.persister(this.stockage.ecrireModele({ projectId: this.projectId, modele: r.etat, lecture: this.maintenant() }), undefined);
      }
    }
    if (!avance) {
      // Réponse rejouée (idempotence) ou écart : on relit le serveur plutôt que de deviner.
      await this.recharger();
      if (this.confirme && this.confirme.revision !== reponse.revision && this.file.length > 0) this.distant = true;
    }
    this.recomposer();
    this.evenements.emettre("lot-accepte", { requestId: entree.requestId, label: entree.enveloppe.label, reponse });
    this.emettreEtat();
  }

  private async refuser(entree: EntreeFile, origine: OrigineRefus, http: number | null, erreurs: readonly DetailErreur[]): Promise<void> {
    this.file = this.file.filter((e) => e.requestId !== entree.requestId);
    await this.refuserSansRecomposer(entree, origine, http, erreurs);
    this.recomposer();
    this.emettreEtat();
  }

  private async refuserSansRecomposer(entree: EntreeFile, origine: OrigineRefus, http: number | null, erreurs: readonly DetailErreur[]): Promise<void> {
    this.statuts.set(entree.requestId, "refusee");
    this.evenements.emettre("lot-refuse", { requestId: entree.requestId, label: entree.enveloppe.label, origine, http, erreurs });
    await this.persister(this.stockage.supprimer(entree.requestId), undefined);
  }

  private async marquerConflit(entree: EntreeFile, reponse: ReponseConflit): Promise<void> {
    const objetsLocaux: Record<IdObjet, ObjetModele | null> = {};
    for (const c of reponse.conflits) objetsLocaux[c.objetId] = this.local?.objets[c.objetId] ?? null;
    const enConflit: EntreeFile = {
      ...entree,
      etat: "en-conflit",
      derniereErreur: `Conflit : révision de base ${reponse.baseRevision}, révision courante ${reponse.revisionCourante}`,
      conflit: { recuLe: this.maintenant(), reponse, objetsLocaux, erreursRevalidation: [] },
    };
    this.file = this.file.map((e) => (e.requestId === entree.requestId ? enConflit : e));
    this.statuts.set(entree.requestId, "en-conflit");
    this.distant = true;
    await this.persister(this.stockage.ecrire(enConflit), undefined);
    const de = this.confirme?.revision ?? null;
    if (await this.recharger()) this.emettreDistant(de, []);
    this.recomposer();
    this.evenements.emettre("conflit", { requestId: entree.requestId, label: entree.enveloppe.label, conflit: enConflit.conflit! });
    this.emettreEtat();
  }

  /** Conflit détecté localement (sans 409) : mêmes données que celles du serveur, objets ciblés par le lot. */
  private async conflitLocal(i: number, entree: EntreeFile, localAvant: EtatModele | null, motif: string): Promise<void> {
    const ids = [...new Set(entree.enveloppe.commands.flatMap((c) => [...c.cibles]))];
    const reponse: ReponseConflit = {
      erreur: "conflit",
      baseRevision: entree.enveloppe.baseRevision,
      revisionCourante: this.confirme?.revision ?? -1,
      conflits: ids.map((objetId) => ({ objetId, motif, etatServeur: this.confirme?.objets[objetId] ?? null })),
    };
    const objetsLocaux: Record<IdObjet, ObjetModele | null> = {};
    for (const id of ids) objetsLocaux[id] = localAvant?.objets[id] ?? null;
    const enConflit: EntreeFile = { ...entree, etat: "en-conflit", derniereErreur: `Conflit : ${motif}`, conflit: { recuLe: this.maintenant(), reponse, objetsLocaux, erreursRevalidation: [] } };
    this.file[i] = enConflit;
    this.statuts.set(entree.requestId, "en-conflit");
    this.distant = true;
    await this.persister(this.stockage.ecrire(enConflit), undefined);
    this.evenements.emettre("conflit", { requestId: entree.requestId, label: entree.enveloppe.label, conflit: enConflit.conflit! });
  }

  private async reporter(entree: EntreeFile, motif: string, http: number | null): Promise<void> {
    const attente: EntreeFile = { ...entree, etat: "en-attente", derniereErreur: motif };
    this.file = this.file.map((e) => (e.requestId === entree.requestId ? attente : e));
    this.statuts.set(entree.requestId, "en-attente");
    await this.persister(this.stockage.ecrire(attente), undefined);
    this.evenements.emettre("lot-reporte", { requestId: entree.requestId, motif, http });
    this.emettreEtat();
  }

  /** Relit le modèle du serveur ; `false` si injoignable ou illisible (l'état confirmé est alors conservé). */
  private async recharger(): Promise<boolean> {
    try {
      const modele = await this.transport.lireModele(this.projectId);
      this.confirme = modele;
      await this.persister(this.stockage.ecrireModele({ projectId: this.projectId, modele, lecture: this.maintenant() }), undefined);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * État local = état confirmé + lots de la file. Sans changement distant non traité, un lot jamais envoyé est
   * recalé sur notre propre chaîne (sa `baseRevision` suit) ou refusé s'il ne s'applique plus ; sinon il est
   * gardé tel quel (il ira au 409) et seulement écarté de l'aperçu.
   */
  private recomposer(): void {
    if (this.file.length === 0) this.distant = false;
    this.horsApercu.clear();
    if (!this.confirme) {
      this.local = null;
      return;
    }
    const recaler = !this.distant;
    let etat = this.confirme;
    const gardes: EntreeFile[] = [];
    const refuses: { entree: EntreeFile; erreurs: readonly DetailErreur[] }[] = [];
    for (const e of this.file) {
      const jamaisParti = e.etat === "en-attente" && e.tentatives === 0;
      const r = appliquerLot(etat, { ...e.enveloppe, baseRevision: etat.revision });
      if (r.ok) {
        if (recaler && jamaisParti && e.enveloppe.baseRevision !== etat.revision) {
          const recale: EntreeFile = { ...e, enveloppe: { ...e.enveloppe, baseRevision: etat.revision } };
          gardes.push(recale);
          void this.persister(this.stockage.ecrire(recale), undefined);
        } else gardes.push(e);
        etat = r.etat;
      } else if (recaler && jamaisParti) {
        refuses.push({ entree: e, erreurs: r.erreurs });
      } else {
        this.horsApercu.add(e.requestId);
        gardes.push(e);
      }
    }
    this.file = gardes;
    this.local = etat;
    for (const { entree, erreurs } of refuses) void this.refuserSansRecomposer(entree, "revalidation", null, erreurs);
  }

  private joignabiliteChangee(): void {
    const etat = this.source.etat();
    if (etat === this.joignabiliteConnue) return;
    this.joignabiliteConnue = etat;
    this.evenements.emettre("joignabilite", { etat });
    if (etat === "en-ligne") void this.synchroniser();
  }

  private emettreEtat(): void {
    this.evenements.emettre("etat", this.resume());
  }

  private emettreDistant(de: number | null, entrees: readonly EntreeJournal[]): void {
    if (this.confirme && this.confirme.revision !== de) this.evenements.emettre("revision-distante", { de, a: this.confirme.revision, entrees });
  }

  private exclusif<T>(fn: () => Promise<T>): Promise<T> {
    const suite = this.chaine.then(fn, fn);
    this.chaine = suite.catch(() => undefined);
    return suite;
  }

  private async persister<T>(p: Promise<T>, defaut: T): Promise<T> {
    try {
      return await p;
    } catch (err) {
      this.erreurPersistance = err instanceof Error ? err.message : String(err);
      return defaut;
    }
  }
}
