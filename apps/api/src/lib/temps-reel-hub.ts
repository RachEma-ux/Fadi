/**
 * Temps réel — répartiteur en mémoire des connexions et des salles (RTC-1, Issue #283, RT-D5). Une instance d'API
 * (RT-D2) : la table des connexions n'est jamais une autorisation — chaque connexion relit son droit (compte, session de
 * compte, accès `comment` au projet) toutes les `revalidationMs`, et ne reçoit rien tant que ce droit n'est pas frais
 * (`temps-reel-projection.ts`). Les dépendances (base, horloge, prises réseau) sont injectées : testé sans base ni réseau
 * par `temps-reel-hub.test.ts`.
 */
import { randomUUID } from "node:crypto";
import type { ProjectRole } from "./owned-project.js";
import { projeter, type Destinataire } from "./temps-reel-projection.js";
import {
  BORNES_TEMPS_REEL, estEphemere, FERMETURE, JournalReprise, LimiteurDebit, lireMessage, MESSAGES_ERREUR,
  type CodeErreur, type EvenementDurable, type MessageClient, type MessageServeur, type ParticipantPublic, type RoleSession,
  type SessionPublique, type VuePresentateur,
} from "./temps-reel-protocole.js";
import type { SignalTempsReel } from "./temps-reel-signaux.js";

/** Ce que le canal sait d'une session (ligne `rt_sessions` réduite à ce qui sert au relais). */
export interface SessionConnue extends SessionPublique { projectId: string }

export interface DependancesHub {
  maintenant(): number;
  /** Session de compte encore valable (compte actif, session non révoquée ni échue) : l'utilisateur, sinon null. */
  verifierCompte(jeton: string): Promise<{ userId: string; sessionCompteId: string } | null>;
  /** Rôle de l'utilisateur sur le projet s'il a le droit `comment`, sinon null (support compris). */
  verifierAcces(projectId: string, userId: string): Promise<ProjectRole | null>;
  chargerSession(sessionId: string): Promise<SessionConnue | null>;
  chargerObjets(variantId: string, revisionId: string): Promise<Set<string> | null>;
  noms(ids: readonly string[]): Promise<Map<string, string>>;
  journaliserPresence(sessionId: string, userId: string, action: "rejoindre" | "quitter"): Promise<void>;
  journal(niveau: "info" | "warn" | "error", message: string, details?: Record<string, unknown>): void;
}

/** Prise réseau d'une connexion (adaptateur `ws` en production, faux objet en test). */
export interface Prise {
  envoyer(texte: string): void;
  fermer(code: number, raison: string): void;
  /** Octets en attente d'envoi (`bufferedAmount`). */
  enAttente(): number;
  ping(): void;
}

interface Connexion extends Destinataire {
  id: string;
  prise: Prise;
  jeton: string;
  sessionCompteId: string;
  salle: Salle | null;
  suit: boolean;
  vivant: boolean;
  limiteur: LimiteurDebit;
  fermee: boolean;
  revalidation: Promise<void> | null;
}

interface Salle {
  session: SessionConnue;
  objets: Set<string>;
  connexions: Set<Connexion>;
  journal: JournalReprise;
  vue: VuePresentateur | null;
  hotePresentDepuis: number | null;
  hoteVuA: number;
  videDepuis: number | null;
}

const message = (m: Record<string, unknown>) => JSON.stringify({ v: 1, ...m });

export class HubTempsReel {
  private readonly connexions = new Set<Connexion>();
  private readonly salles = new Map<string, Salle>();
  private readonly demarrage: number;

  constructor(private readonly d: DependancesHub) {
    this.demarrage = d.maintenant();
  }

  /** Nombre de connexions actives (supervision, tests). */
  get taille(): number { return this.connexions.size; }

  /** Nouvelle connexion déjà authentifiée par la montée de protocole ; refusée au-delà de 20 par compte. */
  ouvrir(prise: Prise, jeton: string, compte: { userId: string; sessionCompteId: string }): Connexion | null {
    const duCompte = [...this.connexions].filter((c) => c.userId === compte.userId).length;
    if (duCompte >= BORNES_TEMPS_REEL.connexionsParCompte) {
      prise.fermer(FERMETURE.tropDeConnexions, "trop-de-connexions");
      return null;
    }
    const c: Connexion = {
      id: randomUUID(), prise, jeton, sessionCompteId: compte.sessionCompteId, userId: compte.userId, role: "lecteur", droitRelu: 0,
      salle: null, suit: false, vivant: true, limiteur: new LimiteurDebit(), fermee: false, revalidation: null,
    };
    this.connexions.add(c);
    this.envoyerBrut(c, message({ type: "bienvenue", connexionId: c.id, userId: c.userId, battementMs: BORNES_TEMPS_REEL.battementMs }), false);
    return c;
  }

  /** Message reçu d'une connexion. Une erreur de traitement ferme la connexion, jamais le processus. */
  async recevoir(c: Connexion, brut: string | Buffer): Promise<void> {
    if (c.fermee) return;
    const lu = lireMessage(brut);
    if (!lu.ok) {
      if (lu.motif === "trop-gros") return this.fermer(c, FERMETURE.fileSaturee, "message-trop-gros");
      return this.erreur(c, "message-invalide");
    }
    const m = lu.message;
    if (estEphemere(m) || m.type === "ping") {
      if (!c.limiteur.accepter(this.d.maintenant())) return;
    }
    try {
      switch (m.type) {
        case "rejoindre": return await this.rejoindre(c, m.sessionId, m.depuis);
        case "quitter": return await this.quitter(c);
        case "ping": return this.envoyerBrut(c, message({ type: "pong" }), true);
        default: return this.ephemere(c, m);
      }
    } catch (e) {
      this.d.journal("error", "temps-reel : message non traité", { erreur: (e as Error).message, type: m.type });
      this.fermer(c, FERMETURE.protocole, "erreur-serveur");
    }
  }

  /** Prise fermée par le réseau ou le client. */
  async fermee(c: Connexion): Promise<void> {
    if (!this.connexions.has(c)) return;
    c.fermee = true;
    this.connexions.delete(c);
    await this.sortirDeSalle(c);
  }

  /** Battement (RT-D5 § 6) : une connexion qui n'a pas répondu au précédent est coupée. */
  battement(): void {
    for (const c of this.connexions) {
      if (!c.vivant) { this.fermer(c, FERMETURE.battementManque, "battement-manque"); continue; }
      c.vivant = false;
      try { c.prise.ping(); } catch { this.fermer(c, FERMETURE.battementManque, "battement-manque"); }
    }
  }

  pong(c: Connexion): void { c.vivant = true; }

  /** Relecture des droits de toutes les connexions (ou de celles désignées) ; échec de lecture = refus. */
  async revalider(filtre: (c: Connexion) => boolean = () => true): Promise<void> {
    await Promise.all([...this.connexions].filter(filtre).map((c) => this.revaliderUne(c)));
  }

  /** Signal d'une route après validation (`temps-reel-signaux.ts`). */
  signal(s: SignalTempsReel): void {
    const cibles = (f: (c: Connexion) => boolean) => {
      // Plus rien n'est diffusé à ces connexions avant la relecture de leur droit (RT-R1).
      for (const c of this.connexions) if (f(c)) c.droitRelu = 0;
      void this.revalider(f);
    };
    switch (s.type) {
      case "acces": return cibles((c) => c.salle?.session.projectId === s.projectId && (!s.userId || c.userId === s.userId));
      case "compte": return cibles((c) => c.userId === s.userId);
      case "session-compte": return cibles((c) => c.sessionCompteId === s.sessionId);
      case "studio-revision":
        for (const salle of this.salles.values()) {
          if (salle.session.projectId === s.projectId && salle.session.variantId === s.variantId && salle.session.portee === "studio-revision") {
            this.diffuserDurable(salle, { nature: "revision-disponible", variantId: s.variantId, revisionId: s.revisionId });
          }
        }
        return;
    }
  }

  /**
   * Fait déjà enregistré par une route HTTP (présentateur, hôte, révision, clôture, annotation) : la salle relit la
   * session et annonce l'événement, projeté pour chaque destinataire. Une session close ferme ses connexions.
   */
  async sessionModifiee(sessionId: string, evenement: EvenementDurable): Promise<void> {
    const salle = this.salles.get(sessionId);
    if (!salle) return;
    const session = await this.d.chargerSession(sessionId);
    if (session) {
      if (session.revisionId !== salle.session.revisionId) {
        const objets = await this.d.chargerObjets(session.variantId, session.revisionId);
        if (objets) salle.objets = objets;
        salle.vue = null;
      }
      if (session.presentateurId !== salle.session.presentateurId) salle.vue = null;
      salle.session = session;
      this.suivreHote(salle);
    }
    this.diffuserDurable(salle, evenement);
    if (evenement.nature === "session-close" || !session || session.statut !== "ouverte") {
      for (const c of [...salle.connexions]) this.fermer(c, FERMETURE.sessionIndisponible, "session-close");
      this.salles.delete(sessionId);
    } else {
      await this.diffuserParticipants(salle);
    }
  }

  /** Annonce durable sans relecture de la session (annotation, nouvelle révision disponible). */
  annoncer(sessionId: string, evenement: EvenementDurable): void {
    const salle = this.salles.get(sessionId);
    if (salle) this.diffuserDurable(salle, evenement);
  }

  /** Salles d'une variante (annonce d'une annotation à toutes les sessions qui la montrent). */
  sallesDeVariante(projectId: string, variantId: string): string[] {
    return [...this.salles.values()].filter((s) => s.session.projectId === projectId && s.session.variantId === variantId).map((s) => s.session.id);
  }

  /** Personnes connectées à une session (liste HTTP) et absence de l'hôte (reprise, RT-D5 § 5). */
  etat(sessionId: string): { connectes: string[]; hoteAbsentDepuisMs: number | null } {
    const salle = this.salles.get(sessionId);
    const maintenant = this.d.maintenant();
    if (!salle) return { connectes: [], hoteAbsentDepuisMs: maintenant - this.demarrage };
    const connectes = [...new Set([...salle.connexions].map((c) => c.userId))];
    return { connectes, hoteAbsentDepuisMs: connectes.includes(salle.session.hoteId) ? null : maintenant - salle.hoteVuA };
  }

  sansConnexion(sessionId: string): boolean {
    return !(this.salles.get(sessionId)?.connexions.size);
  }

  sallesActives(): string[] {
    return [...this.salles.values()].filter((s) => s.connexions.size > 0).map((s) => s.session.id);
  }

  /** Salles vides depuis plus que la durée de rejeu : oubliées (le journal de reprise ne sert plus). */
  purger(): void {
    const maintenant = this.d.maintenant();
    for (const [id, s] of this.salles) if (s.videDepuis !== null && maintenant - s.videDepuis > BORNES_TEMPS_REEL.rejeuMs) this.salles.delete(id);
  }

  /** Arrêt du serveur : chaque client est prévenu et se reconnectera. */
  arreter(): void {
    for (const c of [...this.connexions]) this.fermer(c, FERMETURE.arretServeur, "arret-serveur");
  }

  // --- interne ---

  private async revaliderUne(c: Connexion): Promise<void> {
    if (c.revalidation) return c.revalidation;
    c.revalidation = (async () => {
      try {
        const compte = await this.d.verifierCompte(c.jeton);
        if (!compte || compte.userId !== c.userId) return this.fermer(c, FERMETURE.nonAuthentifie, "session-expiree");
        if (c.salle) {
          const role = await this.d.verifierAcces(c.salle.session.projectId, c.userId);
          if (!role) return this.fermer(c, FERMETURE.accesRetire, "acces-retire");
          c.role = role;
        }
        if (!c.fermee) c.droitRelu = this.d.maintenant();
      } catch (e) {
        c.droitRelu = 0;
        this.d.journal("warn", "temps-reel : relecture des droits impossible", { erreur: (e as Error).message });
      } finally {
        c.revalidation = null;
      }
    })();
    return c.revalidation;
  }

  private async rejoindre(c: Connexion, sessionId: string, depuis: number | undefined): Promise<void> {
    if (c.salle) return this.erreur(c, "deja-en-session");
    const maintenant = this.d.maintenant();
    const session = await this.d.chargerSession(sessionId);
    const role = session && session.statut === "ouverte" && Date.parse(session.expireLe) > maintenant ? await this.d.verifierAcces(session.projectId, c.userId) : null;
    // Même réponse pour une session inexistante, close ou d'un projet sans accès : rien ne révèle son existence.
    if (!session || !role) return this.erreur(c, "session-indisponible");
    let salle = this.salles.get(sessionId);
    if (!salle) {
      const objets = await this.d.chargerObjets(session.variantId, session.revisionId);
      if (!objets) return this.erreur(c, "session-indisponible");
      salle = { session, objets, connexions: new Set(), journal: new JournalReprise(), vue: null, hotePresentDepuis: null, hoteVuA: this.demarrage, videDepuis: null };
      this.salles.set(sessionId, salle);
    } else {
      salle.session = session;
    }
    if (c.fermee) return;
    const personnes = new Set([...salle.connexions].map((x) => x.userId));
    if (!personnes.has(c.userId) && personnes.size >= BORNES_TEMPS_REEL.participantsParSession) return this.erreur(c, "session-pleine");
    c.role = role;
    c.droitRelu = maintenant;
    c.salle = salle;
    salle.connexions.add(c);
    salle.videDepuis = null;
    this.suivreHote(salle);
    if (!personnes.has(c.userId)) await this.d.journaliserPresence(sessionId, c.userId, "rejoindre");
    const rejeu = depuis === undefined ? null : salle.journal.depuis(depuis, maintenant);
    const participants = await this.participants(salle);
    this.envoyer(c, { v: 1, type: "etat", session: salle.session, participants, seq: salle.journal.seq, resynchronise: depuis !== undefined && rejeu === null, vue: salle.vue }, false);
    for (const e of rejeu ?? []) {
      const p = projeter(e, c, this.d.maintenant(), salle.objets);
      if (p) this.envoyer(c, p, false);
    }
    await this.diffuserParticipants(salle, c);
  }

  private async quitter(c: Connexion): Promise<void> {
    await this.sortirDeSalle(c);
  }

  private async sortirDeSalle(c: Connexion): Promise<void> {
    const salle = c.salle;
    if (!salle) return;
    c.salle = null;
    salle.connexions.delete(c);
    const encore = [...salle.connexions].some((x) => x.userId === c.userId);
    if (salle.vue?.de === c.userId && !encore) salle.vue = null;
    if (!encore) {
      this.diffuser(salle, { v: 1, type: "pointeur-masque", de: c.userId }, true);
      try { await this.d.journaliserPresence(salle.session.id, c.userId, "quitter"); }
      catch (e) { this.d.journal("warn", "temps-reel : sortie non journalisée", { erreur: (e as Error).message }); }
    }
    this.suivreHote(salle);
    if (!salle.connexions.size) salle.videDepuis = this.d.maintenant();
    else await this.diffuserParticipants(salle);
  }

  private ephemere(c: Connexion, m: Exclude<MessageClient, { type: "rejoindre" | "quitter" | "ping" }>): void {
    const salle = c.salle;
    if (!salle) return this.erreur(c, "pas-en-session");
    const at = new Date(this.d.maintenant()).toISOString();
    switch (m.type) {
      case "vue": {
        if (salle.session.presentateurId !== c.userId) return this.erreur(c, "non-presentateur");
        const vue: VuePresentateur = { de: c.userId, affichage: m.affichage, ...(m.camera ? { camera: m.camera } : {}), ...(m.plan ? { plan: m.plan } : {}), at };
        salle.vue = vue;
        return this.diffuser(salle, { v: 1, type: "vue", ...vue }, true);
      }
      case "pointeur":
        return this.diffuser(salle, { v: 1, type: "pointeur", de: c.userId, espace: m.espace, x: m.x, y: m.y, ...(m.z !== undefined ? { z: m.z } : {}) }, true);
      case "pointeur-masque":
        return this.diffuser(salle, { v: 1, type: "pointeur-masque", de: c.userId }, true);
      case "selection":
        return this.diffuser(salle, { v: 1, type: "selection", de: c.userId, objectIds: m.objectIds }, true);
      case "suivre":
        c.suit = m.actif;
        void this.diffuserParticipants(salle);
        return;
    }
  }

  private suivreHote(salle: Salle): void {
    const present = [...salle.connexions].some((c) => c.userId === salle.session.hoteId);
    const maintenant = this.d.maintenant();
    if (present) { salle.hoteVuA = maintenant; salle.hotePresentDepuis ??= maintenant; }
    else salle.hotePresentDepuis = null;
  }

  private async participants(salle: Salle): Promise<ParticipantPublic[]> {
    const parPersonne = new Map<string, { suit: boolean; connexions: number }>();
    for (const c of salle.connexions) {
      const p = parPersonne.get(c.userId) ?? { suit: false, connexions: 0 };
      p.connexions += 1;
      p.suit ||= c.suit;
      parPersonne.set(c.userId, p);
    }
    const noms = await this.d.noms([...parPersonne.keys()]);
    return [...parPersonne.entries()].map(([userId, p]) => {
      const roles: RoleSession[] = [];
      if (userId === salle.session.hoteId) roles.push("hote");
      if (userId === salle.session.presentateurId) roles.push("presentateur");
      if (!roles.length) roles.push("participant");
      return { userId, nom: noms.get(userId) ?? "", roles, suit: p.suit, connexions: p.connexions };
    }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }

  private async diffuserParticipants(salle: Salle, sauf?: Connexion): Promise<void> {
    const participants = await this.participants(salle);
    for (const c of salle.connexions) if (c !== sauf) this.envoyer(c, { v: 1, type: "participants", participants }, false);
  }

  private diffuserDurable(salle: Salle, e: EvenementDurable): void {
    const m = salle.journal.ajouter(e, this.d.maintenant());
    this.diffuser(salle, m, false);
  }

  private diffuser(salle: Salle, m: MessageServeur, ephemere: boolean): void {
    const maintenant = this.d.maintenant();
    for (const c of salle.connexions) {
      const p = projeter(m, c, maintenant, salle.objets);
      if (p) this.envoyer(c, p, ephemere);
    }
  }

  private envoyer(c: Connexion, m: MessageServeur, ephemere: boolean): void {
    this.envoyerBrut(c, JSON.stringify(m), ephemere);
  }

  /** File d'envoi bornée (RT-D5 § 6) : au-delà, l'éphémère est abandonné ; un durable ferme la connexion (resynchronisation). */
  private envoyerBrut(c: Connexion, texte: string, ephemere: boolean): void {
    if (c.fermee) return;
    if (c.prise.enAttente() + texte.length > BORNES_TEMPS_REEL.fileEnvoiOctets) {
      if (ephemere) return;
      return this.fermer(c, FERMETURE.fileSaturee, "file-saturee");
    }
    try { c.prise.envoyer(texte); } catch { this.fermer(c, FERMETURE.fileSaturee, "envoi-impossible"); }
  }

  private erreur(c: Connexion, code: CodeErreur): void {
    this.envoyerBrut(c, message({ type: "erreur", code, message: MESSAGES_ERREUR[code] }), false);
  }

  private fermer(c: Connexion, code: number, raison: string): void {
    if (c.fermee) return;
    c.fermee = true;
    c.droitRelu = 0;
    try { c.prise.fermer(code, raison); } catch { /* prise déjà fermée */ }
    void this.fermee(c);
  }
}

export type { Connexion };
