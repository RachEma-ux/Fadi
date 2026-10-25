/**
 * Temps réel — canal côté navigateur (RTC-2, Issue #283) : une connexion WebSocket au chemin `/temps-reel` de la même
 * origine, reprise automatique (1 s, 2 s, 4 s… 15 s), retour dans la session avec le dernier numéro d'événement reçu
 * (`depuis`) pour ne recevoir que ce qui a été manqué, et arrêt définitif sur un refus (compte, accès retiré, session
 * close). Les éphémères (vue, pointeur) sont regroupés : 10 par seconde au plus, la dernière valeur seulement.
 *
 * Aucune décision de droit ici : le serveur relit tout (RT-R1) ; l'état affiché est celui qu'il annonce
 * (`etat-session.ts`). La prise WebSocket et les minuteries sont injectables : testé par `canal.test.ts`.
 */
import { delaiReconnexion, ETAT_INITIAL, etatApresFermeture, recevoir, Regroupeur, type EtatSession, type MessageServeur } from "./etat-session";

export interface PriseNavigateur {
  readyState: number;
  send(texte: string): void;
  close(code?: number, raison?: string): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface OptionsCanal {
  /** Adresse du canal (par défaut : même origine, `/temps-reel`). */
  adresse?: string;
  ouvrirPrise?: (adresse: string) => PriseNavigateur;
  maintenant?: () => number;
  attendre?: (f: () => void, ms: number) => unknown;
  annulerAttente?: (id: unknown) => void;
  alea?: () => number;
}

const OUVERT = 1;

export function adresseCanal(loc: { protocol: string; host: string } = window.location): string {
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/temps-reel`;
}

type MessageEphemere =
  | { type: "vue"; affichage: "2d" | "3d" | "double"; camera?: unknown; plan?: { x: number; y: number; w: number; h: number } }
  | { type: "pointeur"; espace: "plan" | "3d"; x: number; y: number; z?: number };

export class CanalTempsReel {
  private prise: PriseNavigateur | null = null;
  private sessionId: string | null = null;
  private tentatives = 0;
  private attente: unknown = null;
  private arrete = true;
  private etatCourant: EtatSession = ETAT_INITIAL;
  private readonly abonnes = new Set<(e: EtatSession) => void>();
  private readonly vues = new Regroupeur<MessageEphemere>();
  private readonly pointeurs = new Regroupeur<MessageEphemere>();
  private tic: unknown = null;
  private suivre = true;
  private derniereSelection: string[] = [];
  private readonly o: Required<OptionsCanal>;

  constructor(options: OptionsCanal = {}) {
    this.o = {
      adresse: options.adresse ?? adresseCanal(),
      ouvrirPrise: options.ouvrirPrise ?? ((a) => new WebSocket(a) as unknown as PriseNavigateur),
      maintenant: options.maintenant ?? (() => Date.now()),
      attendre: options.attendre ?? ((f, ms) => setTimeout(f, ms)),
      annulerAttente: options.annulerAttente ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>)),
      alea: options.alea ?? Math.random,
    };
  }

  get etat(): EtatSession { return this.etatCourant; }

  abonner(f: (e: EtatSession) => void): () => void {
    this.abonnes.add(f);
    f(this.etatCourant);
    return () => this.abonnes.delete(f);
  }

  /** Rejoint une session (et s'y maintient jusqu'à `quitter`, un refus ou la clôture). */
  rejoindre(sessionId: string, suivre = true): void {
    if (this.sessionId === sessionId && !this.arrete) return;
    this.quitter();
    this.sessionId = sessionId;
    this.suivre = suivre;
    this.arrete = false;
    this.tentatives = 0;
    this.poser({ ...ETAT_INITIAL, connexion: "connexion" });
    this.connecter();
    this.tic = this.o.attendre(() => this.vider(), 100);
  }

  quitter(): void {
    this.arrete = true;
    if (this.attente !== null) this.o.annulerAttente(this.attente);
    if (this.tic !== null) this.o.annulerAttente(this.tic);
    this.attente = null;
    this.tic = null;
    if (this.prise) {
      const p = this.prise;
      this.prise = null;
      p.onclose = null;
      if (p.readyState === OUVERT) p.send(JSON.stringify({ v: 1, type: "quitter" }));
      p.close(1000, "quitter");
    }
    this.sessionId = null;
    this.poser(ETAT_INITIAL);
  }

  /** Vue du présentateur (le serveur refuse celle d'un autre). */
  partagerVue(v: Omit<Extract<MessageEphemere, { type: "vue" }>, "type">): void {
    const m = this.vues.proposer({ type: "vue", ...v }, this.o.maintenant());
    if (m) this.envoyer(m);
  }

  pointeur(p: { espace: "plan" | "3d"; x: number; y: number; z?: number } | null): void {
    if (!p) { this.pointeurs.oublier(); this.envoyer({ type: "pointeur-masque" }); return; }
    const m = this.pointeurs.proposer({ type: "pointeur", ...p }, this.o.maintenant());
    if (m) this.envoyer(m);
  }

  selection(ids: readonly string[]): void {
    const liste = [...new Set(ids)].slice(0, 500);
    if (liste.join("\u0000") === this.derniereSelection.join("\u0000")) return;
    this.derniereSelection = liste;
    this.envoyer({ type: "selection", objectIds: liste });
  }

  suivrePresentateur(actif: boolean): void {
    this.suivre = actif;
    this.envoyer({ type: "suivre", actif });
  }

  get suit(): boolean { return this.suivre; }

  // --- interne ---

  private connecter(): void {
    if (this.arrete || !this.sessionId) return;
    let p: PriseNavigateur;
    try { p = this.o.ouvrirPrise(this.o.adresse); }
    catch { return this.reprendrePlusTard(); }
    this.prise = p;
    p.onopen = () => {
      this.tentatives = 0;
      const depuis = this.etatCourant.seq > 0 ? { depuis: this.etatCourant.seq } : {};
      p.send(JSON.stringify({ v: 1, type: "rejoindre", sessionId: this.sessionId, ...depuis }));
    };
    p.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let m: MessageServeur;
      try { m = JSON.parse(e.data) as MessageServeur; } catch { return; }
      this.poser(recevoir(this.etatCourant, m, this.o.maintenant()));
      // L'appartenance n'existe côté serveur qu'une fois l'état reçu : le suivi et la dernière sélection sont rétablis
      // ensuite (envoyés avec « rejoindre », ils arrivaient avant l'entrée et étaient refusés « pas-en-session »).
      if (m.type === "etat" && p.readyState === OUVERT) {
        p.send(JSON.stringify({ v: 1, type: "suivre", actif: this.suivre }));
        if (this.derniereSelection.length) p.send(JSON.stringify({ v: 1, type: "selection", objectIds: this.derniereSelection }));
      }
    };
    p.onerror = () => {};
    p.onclose = (e) => {
      if (this.prise !== p) return;
      this.prise = null;
      const fin = etatApresFermeture(e.code);
      if (fin) {
        this.arrete = true;
        this.poser({ ...this.etatCourant, connexion: fin, pointeurs: {}, selections: {} });
        return;
      }
      this.reprendrePlusTard();
    };
  }

  private reprendrePlusTard(): void {
    if (this.arrete) return;
    this.poser({ ...this.etatCourant, connexion: "reconnexion", pointeurs: {}, selections: {} });
    const ms = delaiReconnexion(this.tentatives, this.o.alea());
    this.tentatives += 1;
    this.attente = this.o.attendre(() => { this.attente = null; this.connecter(); }, ms);
  }

  private vider(): void {
    if (this.arrete) return;
    const maintenant = this.o.maintenant();
    for (const r of [this.vues, this.pointeurs]) {
      const m = r.tic(maintenant);
      if (m) this.envoyer(m);
    }
    this.tic = this.o.attendre(() => this.vider(), 100);
  }

  private envoyer(m: Record<string, unknown>): void {
    const p = this.prise;
    if (!p || p.readyState !== OUVERT || this.etatCourant.connexion !== "connecte") return;
    p.send(JSON.stringify({ v: 1, ...m }));
  }

  private poser(e: EtatSession): void {
    this.etatCourant = e;
    for (const f of this.abonnes) f(e);
  }
}
