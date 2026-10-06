/**
 * Bus de commandes local de l'Atelier typé (cahier des charges §5.7 ; Architecture V4 §2 et §8). Le même
 * réducteur que le serveur donne l'aperçu immédiat ; chaque lot validé localement entre dans une file
 * (Dexie, une entrée par `requestId`) envoyée dans l'ordre dès que le serveur est joignable ; la réponse du
 * serveur fait autorité :
 *
 * - 200 : le lot est « synchronisé », la révision serveur avance (identifiants identiques des deux côtés) ;
 * - 409 révision : l'état serveur est relu, les lots en attente sont rejoués dessus (rebase) puis renvoyés ;
 *   un lot qui ne s'applique plus devient un brouillon « conflit » à traiter explicitement, jamais fusionné ;
 * - 409 précondition / 400 : le lot est « refusé », conservé pour décision, l'état local est réaligné.
 *
 * États visibles par lot : local → synchronisation → synchronisé | conflit | refusé. Les autres membres sont
 * suivis par relecture du journal (`GET /journal?apres=`) ; une entrée d'autrui relit le modèle et rejoue la file.
 */
import {
  appliquerLot,
  cibleAnnulation,
  cibleRetablissement,
  CONTRAT_COMMANDES,
  ErreurCommande,
  modeleVide,
  rejouerLots,
  type Commande,
  type Effets,
  type Enveloppe,
  type EntreeJournal,
  type LotEnAttente,
  type ModeleAtelier,
} from "@parcours/atelier-model";
import { ApiError, api, type AtelierJournalEntry } from "../../../lib/api";
import { localStore, type LotEntry } from "../../../lib/local-store";
import { reachability } from "../../../lib/reachability";

export type EtatChargement = "initial" | "chargement" | "pret" | "aucun-modele" | "erreur";

export interface InstantaneClient {
  etat: ModeleAtelier;
  /** Révision locale = révision serveur + lots locaux non encore validés. */
  revision: number;
  revisionServeur: number;
  nativeId: string;
  chargement: EtatChargement;
  erreur: string | null;
  lots: LotEnAttente[];
  journal: EntreeJournal[];
  /** Dernier résultat d'un lot (effets renvoyés par le serveur ou calculés localement). */
  dernierEffets: Effets | null;
  envoiEnCours: boolean;
  readOnly: boolean;
  /** Ouvert depuis le cache local faute de serveur joignable. */
  horsLigne: boolean;
}

type Ecouteur = () => void;

const nouvelId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

function versEntree(projectId: string, lot: LotEnAttente, ordre: number): LotEntry {
  return { id: `${projectId}|${lot.enveloppe.requestId}`, projectId, requestId: lot.enveloppe.requestId, enveloppe: JSON.stringify(lot.enveloppe), label: lot.enveloppe.label, etat: lot.etat, detail: lot.detail ? JSON.stringify(lot.detail) : null, creeA: lot.creeA, ordre };
}

function depuisEntree(e: LotEntry): LotEnAttente {
  return { enveloppe: JSON.parse(e.enveloppe) as Enveloppe, etat: e.etat, creeA: e.creeA, detail: e.detail ? (JSON.parse(e.detail) as Record<string, unknown>) : null };
}

export class AtelierClient {
  private instantane: InstantaneClient;
  private readonly ecouteurs = new Set<Ecouteur>();
  private ordre = 0;
  private minuterie: ReturnType<typeof setInterval> | null = null;
  private desabonnerJoignabilite: (() => void) | null = null;
  private envoi: Promise<void> | null = null;
  /** Chargement initial (modèle + file locale) ; les décisions venues de l'en-tête l'attendent. */
  demarrage: Promise<void> = Promise.resolve();
  private relancer = false;
  /** Lots retirés de la file par « Annuler » avant d'avoir été envoyés : « Rétablir » les rejoue (pile vidée par toute nouvelle action). */
  private refaireLocal: { commands: Commande[]; label: string }[] = [];

  constructor(
    public readonly projectId: string,
    options: { readOnly?: boolean } = {},
  ) {
    this.instantane = { etat: modeleVide(), revision: 0, revisionServeur: 0, nativeId: "", chargement: "initial", erreur: null, lots: [], journal: [], dernierEffets: null, envoiEnCours: false, readOnly: options.readOnly ?? false, horsLigne: false };
  }

  // --- Abonnement (useSyncExternalStore) ---
  subscribe = (fn: Ecouteur): (() => void) => {
    this.ecouteurs.add(fn);
    return () => this.ecouteurs.delete(fn);
  };
  getSnapshot = (): InstantaneClient => this.instantane;

  private emettre(patch: Partial<InstantaneClient>): void {
    this.instantane = { ...this.instantane, ...patch };
    for (const fn of this.ecouteurs) fn();
  }

  // --- Cycle de vie ---
  async demarrer(): Promise<void> {
    this.emettre({ chargement: "chargement", erreur: null });
    const lotsLocaux = (await localStore.lots(this.projectId)).map(depuisEntree);
    this.ordre = lotsLocaux.length;
    try {
      const reponse = await api.getAtelierModel(this.projectId);
      this.etatServeurCache = reponse.modele;
      void localStore.cacheModel({ projectId: this.projectId, modele: JSON.stringify(reponse.modele), revision: reponse.revision, nativeId: reponse.nativeId, fetchedAt: new Date().toISOString() });
      const rejeu = rejouerLots(reponse.modele, reponse.revision, await this.sansDejaValides(lotsLocaux));
      this.emettre({ etat: rejeu.etat, revisionServeur: reponse.revision, revision: reponse.revision + rejeu.rejoues.length, nativeId: reponse.nativeId, chargement: "pret", lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
      await this.persisterLots();
      await this.chargerJournal();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        const rejeu = rejouerLots(modeleVide(), 0, lotsLocaux);
        this.emettre({ etat: rejeu.etat, revisionServeur: 0, revision: rejeu.rejoues.length, chargement: "aucun-modele", lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
      } else {
        // Serveur injoignable : on part du dernier modèle mis en cache sur cet appareil, la file locale rejouée dessus ;
        // l'envoi reprend au retour du réseau. Sans cache, le modèle reste vide et l'écran le dit.
        const cache = await localStore.readModelCache(this.projectId);
        const base = cache ? (JSON.parse(cache.modele) as ModeleAtelier) : modeleVide();
        const revision = cache?.revision ?? 0;
        if (cache) this.etatServeurCache = base;
        const rejeu = rejouerLots(base, revision, lotsLocaux);
        this.emettre({ etat: rejeu.etat, revisionServeur: revision, revision: revision + rejeu.rejoues.length, nativeId: cache?.nativeId ?? "", chargement: cache ? "pret" : "erreur", horsLigne: true, erreur: err instanceof Error ? err.message : String(err), lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
      }
    }
    this.desabonnerJoignabilite = reachability.subscribe(() => {
      if (reachability.get() !== "reachable") return;
      // Retour du réseau : la file part, puis un modèle ouvert depuis le cache est relu sur le serveur.
      void this.envoyer().then(() => (this.instantane.horsLigne ? this.relireServeur() : undefined));
    });
    this.minuterie = setInterval(() => void this.suivreJournal(), 60_000);
    void this.envoyer();
  }

  arreter(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.minuterie = null;
    this.desabonnerJoignabilite?.();
    this.desabonnerJoignabilite = null;
  }

  // --- Commandes ---
  /**
   * Applique un lot localement (aperçu immédiat, identifiants déterministes) puis le met en file. Une erreur du
   * réducteur est renvoyée telle quelle (objet, cause, action) : rien n'entre dans la file.
   */
  async executer(commands: Commande[], label: string, options: { conserverRefaire?: boolean } = {}): Promise<{ effets: Effets; requestId: string }> {
    if (this.instantane.readOnly) throw new ErreurCommande("precondition", "", "Projet en lecture seule");
    if (!options.conserverRefaire) this.refaireLocal = [];
    const enveloppe: Enveloppe = { requestId: nouvelId(), baseRevision: this.instantane.revision, contract: CONTRAT_COMMANDES, label, commands };
    const r = appliquerLot(this.instantane.etat, enveloppe);
    const lot: LotEnAttente = { enveloppe, etat: "local", creeA: new Date().toISOString(), detail: null };
    this.emettre({ etat: r.etat, revision: this.instantane.revision + 1, lots: [...this.instantane.lots, lot], dernierEffets: r.effets });
    await localStore.putLot(versEntree(this.projectId, lot, this.ordre++));
    void this.envoyer();
    return { effets: r.effets, requestId: enveloppe.requestId };
  }

  /** Exécution à blanc locale (aperçu des effets, sans file). */
  essayer(commands: Commande[], label = "essai"): { ok: true; effets: Effets } | { ok: false; erreur: ErreurCommande } {
    try {
      const r = appliquerLot(this.instantane.etat, { requestId: "essai", baseRevision: this.instantane.revision, contract: CONTRAT_COMMANDES, label, commands });
      return { ok: true, effets: r.effets };
    } catch (err) {
      if (err instanceof ErreurCommande) return { ok: false, erreur: err };
      throw err;
    }
  }

  /** Annuler : si un lot local n'est pas encore parti, il est retiré de la file ; sinon l'inverse de la dernière entrée du journal est demandé au serveur. */
  async annuler(): Promise<boolean> {
    if (this.instantane.readOnly) return false;
    const dernierLocal = [...this.instantane.lots].reverse().find((l) => l.etat === "local");
    if (dernierLocal) {
      // Retrait immédiat (sans attente) : l'envoi en cours ne doit plus pouvoir prendre ce lot.
      const id = dernierLocal.enveloppe.requestId;
      this.emettre({ lots: this.instantane.lots.filter((l) => l.enveloppe.requestId !== id) });
      this.refaireLocal.push({ commands: dernierLocal.enveloppe.commands, label: dernierLocal.enveloppe.label });
      await localStore.removeLot(this.projectId, id);
      const base = await this.etatServeurLocal();
      const rejeu = rejouerLots(base, this.instantane.revisionServeur, this.instantane.lots);
      this.emettre({ etat: rejeu.etat, revision: this.instantane.revisionServeur + rejeu.rejoues.length, lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
      await this.persisterLots();
      return true;
    }
    // Le journal local peut être en retard d'un lot qui vient d'être validé : on finit l'envoi et on le relit
    // avant de choisir la cible, sinon on annulerait une entrée plus ancienne.
    await this.envoyer();
    await this.chargerJournal();
    const cible = cibleAnnulation(this.instantane.journal);
    if (!cible || !cible.inverse) return false;
    return this.inverser("annuler", cible);
  }

  async retablir(): Promise<boolean> {
    if (this.instantane.readOnly) return false;
    const local = this.refaireLocal.pop();
    if (local) {
      try {
        await this.executer(local.commands, local.label, { conserverRefaire: true });
        return true;
      } catch {
        this.refaireLocal = [];
        return false;
      }
    }
    await this.envoyer();
    await this.chargerJournal();
    const cible = cibleRetablissement(this.instantane.journal);
    if (!cible || !cible.inverse) return false;
    return this.inverser("retablir", cible);
  }

  private async inverser(mode: "annuler" | "retablir", cible: EntreeJournal): Promise<boolean> {
    if (this.instantane.lots.some((l) => l.etat === "local" || l.etat === "synchronisation")) {
      await this.envoyer();
      if (this.instantane.lots.some((l) => l.etat === "local" || l.etat === "synchronisation")) return false; // hors ligne : l'inverse attend le serveur
    }
    const requestId = nouvelId();
    try {
      const reponse = mode === "annuler" ? await api.postAtelierAnnuler(this.projectId, { requestId, baseRevision: this.instantane.revisionServeur, journalId: cible.id }) : await api.postAtelierRetablir(this.projectId, { requestId, baseRevision: this.instantane.revisionServeur, journalId: cible.id });
      await this.relireServeur(reponse.revision);
      this.emettre({ dernierEffets: reponse.effets });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await this.relireServeur();
        return false;
      }
      throw err;
    }
  }

  /** Décision explicite sur un lot en conflit ou refusé : le garder en le rejouant, ou l'abandonner. */
  async decider(requestId: string, decision: "rejouer" | "abandonner"): Promise<void> {
    const lot = this.instantane.lots.find((l) => l.enveloppe.requestId === requestId);
    if (!lot) return;
    if (decision === "abandonner") {
      await localStore.removeLot(this.projectId, requestId);
      const base = await this.etatServeurLocal();
      const restants = this.instantane.lots.filter((l) => l.enveloppe.requestId !== requestId);
      const rejeu = rejouerLots(base, this.instantane.revisionServeur, restants);
      this.emettre({ etat: rejeu.etat, revision: this.instantane.revisionServeur + rejeu.rejoues.length, lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
      await this.persisterLots();
      return;
    }
    const base = await this.etatServeurLocal();
    const restants = this.instantane.lots.map((l) => (l.enveloppe.requestId === requestId ? { ...l, etat: "local" as const, detail: null } : l));
    const rejeu = rejouerLots(base, this.instantane.revisionServeur, restants);
    this.emettre({ etat: rejeu.etat, revision: this.instantane.revisionServeur + rejeu.rejoues.length, lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
    await this.persisterLots();
    void this.envoyer();
  }

  // --- Synchronisation ---
  private etatServeurCache: ModeleAtelier | null = null;

  /** L'état serveur tel que connu localement (dernière relecture), sans les lots en attente. */
  private async etatServeurLocal(): Promise<ModeleAtelier> {
    if (this.etatServeurCache) return this.etatServeurCache;
    try {
      const r = await api.getAtelierModel(this.projectId);
      this.etatServeurCache = r.modele;
      void localStore.cacheModel({ projectId: this.projectId, modele: JSON.stringify(r.modele), revision: r.revision, nativeId: r.nativeId, fetchedAt: new Date().toISOString() });
      this.emettre({ revisionServeur: r.revision, nativeId: r.nativeId });
      return r.modele;
    } catch {
      return modeleVide();
    }
  }

  private async persisterLots(): Promise<void> {
    const lots = this.instantane.lots;
    await Promise.all(lots.map((l, i) => localStore.putLot(versEntree(this.projectId, l, i))));
    this.ordre = lots.length;
  }

  async envoyer(): Promise<void> {
    // Un lot ajouté pendant la fin d'une séquence d'envoi ne doit pas attendre le prochain déclencheur : on relance.
    if (this.envoi) {
      this.relancer = true;
      return this.envoi;
    }
    this.envoi = (async () => {
      do {
        this.relancer = false;
        await this.envoyerSequence();
      } while (this.relancer && reachability.get() === "reachable");
    })().finally(() => {
      this.envoi = null;
    });
    return this.envoi;
  }

  private async envoyerSequence(): Promise<void> {
    if (reachability.get() !== "reachable" || this.instantane.readOnly) return;
    this.emettre({ envoiEnCours: true });
    let valides = 0;
    try {
      let garde = 0;
      while (garde++ < 1000) {
        const lot = this.instantane.lots.find((l) => l.etat === "local");
        if (!lot) break;
        this.majLot(lot.enveloppe.requestId, { etat: "synchronisation" });
        const enveloppe: Enveloppe = { ...lot.enveloppe, baseRevision: this.instantane.revisionServeur };
        try {
          const reponse = await api.postAtelierCommands(this.projectId, enveloppe);
          await localStore.removeLot(this.projectId, lot.enveloppe.requestId);
          // L'état serveur local avance du lot validé : on l'applique au cache serveur.
          const base = await this.etatServeurLocal();
          try {
            this.etatServeurCache = appliquerLot(base, enveloppe).etat;
          } catch {
            this.etatServeurCache = null;
          }
          // La file est relue après les attentes : un lot ajouté pendant l'envoi ne doit pas être perdu.
          const restants = this.instantane.lots.filter((l) => l.enveloppe.requestId !== lot.enveloppe.requestId);
          this.emettre({ revisionServeur: reponse.revision, revision: reponse.revision + restants.filter((l) => l.etat === "local").length, lots: restants, dernierEffets: reponse.effets });
          valides += 1;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const corps = err.body as { motif?: string } | null;
            if (corps?.motif === "revision") {
              // Quelqu'un d'autre a validé entre-temps : relire, rejouer la file, réessayer.
              await this.relireServeur();
              continue;
            }
            this.majLot(lot.enveloppe.requestId, { etat: "conflit", detail: (err.body as Record<string, unknown>) ?? { motif: err.serverMessage ?? "conflit" } });
            await this.relireServeur();
            continue;
          }
          // 404 d'une source de référence externe (DA-05-11) : refus définitif, pas une panne réseau.
          const sourceInconnue = err instanceof ApiError && err.status === 404 && ["source-inconnue", "publication-inconnue"].includes(String((err.body as { erreur?: string } | null)?.erreur));
          if (err instanceof ApiError && (err.status === 400 || err.status === 403 || err.status === 423 || sourceInconnue)) {
            this.majLot(lot.enveloppe.requestId, { etat: "refuse", detail: (err.body as Record<string, unknown>) ?? { message: err.serverMessage ?? `refusé (${err.status})` } });
            await this.relireServeur();
            continue;
          }
          // Réseau : le lot repasse « local » et attend la joignabilité.
          this.majLot(lot.enveloppe.requestId, { etat: "local" });
          break;
        }
      }
    } finally {
      await this.persisterLots();
      // Le journal suit les lots validés (annuler / rétablir s'y réfèrent).
      if (valides > 0) await this.chargerJournal();
      this.emettre({ envoiEnCours: false });
    }
  }

  private majLot(requestId: string, patch: Partial<LotEnAttente>): void {
    this.emettre({ lots: this.instantane.lots.map((l) => (l.enveloppe.requestId === requestId ? { ...l, ...patch } : l)) });
  }

  /** Relit l'état serveur et rejoue la file locale dessus (rebase) ; les lots incompatibles deviennent des brouillons « conflit ». */
  async relireServeur(revisionAttendue?: number): Promise<void> {
    try {
      const r = await api.getAtelierModel(this.projectId);
      this.etatServeurCache = r.modele;
      void localStore.cacheModel({ projectId: this.projectId, modele: JSON.stringify(r.modele), revision: r.revision, nativeId: r.nativeId, fetchedAt: new Date().toISOString() });
      const rejeu = rejouerLots(r.modele, r.revision, await this.sansDejaValides(this.instantane.lots));
      this.emettre({ etat: rejeu.etat, revisionServeur: r.revision, revision: r.revision + rejeu.rejoues.length, nativeId: r.nativeId, chargement: "pret", horsLigne: false, lots: [...rejeu.rejoues, ...rejeu.incompatibles.map((i) => i.lot)] });
      await this.persisterLots();
      await this.chargerJournal();
      void revisionAttendue;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) this.emettre({ chargement: "aucun-modele" });
    }
  }

  /**
   * Lots de la file déjà validés par le serveur (D-147) : page fermée ou réseau coupé entre la validation et le retrait
   * de la file. Leur `requestId` figure au journal ; ils sont retirés au lieu d'être rejoués sur un modèle qui les
   * contient déjà (le rejeu échouerait et les ferait passer pour des conflits).
   */
  private async sansDejaValides(lots: LotEnAttente[]): Promise<LotEnAttente[]> {
    if (!lots.length) return lots;
    try {
      const plusAncien = Math.min(...lots.map((l) => l.enveloppe.baseRevision));
      const j = await api.getAtelierJournal(this.projectId, Math.max(0, plusAncien - 50));
      const valides = new Set(j.entrees.map((e) => e.requestId));
      const restants = lots.filter((l) => !valides.has(l.enveloppe.requestId));
      for (const l of lots) if (valides.has(l.enveloppe.requestId)) await localStore.removeLot(this.projectId, l.enveloppe.requestId);
      return restants;
    } catch {
      return lots; // journal illisible : rejeu ordinaire
    }
  }

  private async chargerJournal(): Promise<void> {
    try {
      const j = await api.getAtelierJournal(this.projectId, Math.max(0, this.instantane.revisionServeur - 200));
      this.emettre({ journal: j.entrees.map(versJournal) });
    } catch {
      /* journal indisponible hors ligne : annuler / rétablir attendent */
    }
  }

  /** Relecture périodique : une entrée d'autrui postérieure à la révision connue déclenche une relecture du modèle. */
  private async suivreJournal(): Promise<void> {
    if (reachability.get() !== "reachable") return;
    try {
      const j = await api.getAtelierJournal(this.projectId, this.instantane.revisionServeur);
      if (j.entrees.length > 0) await this.relireServeur();
    } catch {
      /* silencieux : la joignabilité est suivie ailleurs */
    }
  }
}

function versJournal(e: AtelierJournalEntry): EntreeJournal {
  return { id: e.id, kind: e.kind, requestId: e.requestId, label: e.label, baseRevision: e.baseRevision, resultRevision: e.resultRevision, inverseOf: e.inverseOf, inverse: e.inverse };
}

const clients = new Map<string, AtelierClient>();

/** Le client déjà ouvert pour ce projet, sans en créer (en-tête, bandeau des conflits). */
export function atelierClientExistant(projectId: string): AtelierClient | null {
  return clients.get(projectId) ?? null;
}

/** Un client par projet et par onglet (la file locale est partagée par Dexie). */
export function atelierClient(projectId: string, options: { readOnly?: boolean } = {}): AtelierClient {
  let c = clients.get(projectId);
  if (!c) {
    c = new AtelierClient(projectId, options);
    clients.set(projectId, c);
    c.demarrage = c.demarrer();
  }
  return c;
}
