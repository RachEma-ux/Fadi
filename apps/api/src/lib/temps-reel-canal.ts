/**
 * Temps réel — canal WebSocket attaché au serveur HTTP de l'API (RTC-1, Issue #283, RT-D5 § 1, essai RTC-0.3).
 *
 * La montée de protocole n'est acceptée que sur `/temps-reel`, drapeau actif, depuis une origine de l'application
 * (`WEB_ORIGIN`) et avec une session de compte valable (lue par `sessionTokenFrom` puis `resolveSession`, comme toute
 * requête) ; sinon une réponse HTTP 404 / 403 / 401 est écrite et la prise détruite **avant** toute ouverture. La garde
 * CSRF des requêtes HTTP ne couvre pas l'upgrade : ce contrôle d'origine la remplace ici.
 *
 * Chaque prise a son gestionnaire d'erreur : sans lui, un message trop gros arrête tout le processus Node (constat de
 * l'essai RTC-0.3).
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { parse } from "cookie";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveSession, sessionTokenFrom } from "./auth.js";
import { accessAllows, loadProjectAccess } from "./owned-project.js";
import { HubTempsReel, type DependancesHub, type SessionConnue } from "./temps-reel-hub.js";
import { BORNES_TEMPS_REEL, CHEMIN_CANAL } from "./temps-reel-protocole.js";
import { abonnerSignaux } from "./temps-reel-signaux.js";
import { documentRevision, expirer, journaliserPresence, lireSessionParId, nomsDe, objetsDuDocument, sessionPublique, sessionsAExpirer, tempsReelActif, toucherActivite } from "./temps-reel-sessions.js";

const journal: DependancesHub["journal"] = (niveau, message, details = {}) => {
  // eslint-disable-next-line no-console
  console[niveau === "info" ? "log" : niveau](JSON.stringify({ level: niveau, message, ...details }));
};

/** Dépendances réelles du répartiteur : la base, l'horloge, le journal structuré (jamais de contenu de message). */
export const dependancesServeur: DependancesHub = {
  maintenant: () => Date.now(),
  async verifierCompte(jeton) {
    const u = await resolveSession(jeton);
    return u ? { userId: u.id, sessionCompteId: u.sessionId } : null;
  },
  async verifierAcces(projectId, userId) {
    const access = await loadProjectAccess(projectId, userId);
    return access && access.role !== "support" && accessAllows(access, "comment") ? access.role : null;
  },
  async chargerSession(sessionId) {
    const s = await lireSessionParId(sessionId);
    return s ? { ...sessionPublique(s), projectId: s.projectId } satisfies SessionConnue : null;
  },
  async chargerObjets(variantId, revisionId) {
    const doc = await documentRevision(variantId, revisionId);
    return doc ? objetsDuDocument(doc) : null;
  },
  noms: (ids) => nomsDe(ids),
  journaliserPresence: (sessionId, userId, action) => journaliserPresence(sessionId, userId, action),
  journal,
};

let hubCourant: HubTempsReel | null = null;
/** Le répartiteur du processus, s'il est démarré (les routes HTTP y annoncent leurs faits). */
export function hubTempsReel(): HubTempsReel | null { return hubCourant; }

function refuser(socket: Duplex, statut: 401 | 403 | 404, texte: string): void {
  socket.write(`HTTP/1.1 ${statut} ${texte}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/**
 * Attache le canal au serveur HTTP. Sans le drapeau, toute montée de protocole est refusée (404) et rien n'est démarré.
 * Renvoie une fonction d'arrêt (minuteries, connexions, abonnement aux signaux).
 */
export function attacherTempsReel(server: Server, options: { origines: readonly string[]; dependances?: DependancesHub }): () => void {
  if (!tempsReelActif()) {
    server.on("upgrade", (_req: IncomingMessage, socket: Duplex) => refuser(socket, 404, "Not Found"));
    return () => {};
  }
  const d = options.dependances ?? dependancesServeur;
  const hub = new HubTempsReel(d);
  hubCourant = hub;
  const origines = new Set(options.origines.map((o) => o.trim()).filter(Boolean));
  const wss = new WebSocketServer({ noServer: true, maxPayload: BORNES_TEMPS_REEL.octetsParMessage, perMessageDeflate: false });

  const refus: Record<number, number> = {};
  const refuserCompte = (socket: Duplex, code: 401 | 403 | 404, texte: string) => { refus[code] = (refus[code] ?? 0) + 1; refuser(socket, code, texte); };
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    void (async () => {
      const chemin = new URL(req.url ?? "/", "http://fadi.invalid").pathname;
      if (chemin !== CHEMIN_CANAL) return refuserCompte(socket, 404, "Not Found");
      if (!req.headers.origin || !origines.has(req.headers.origin)) return refuserCompte(socket, 403, "Forbidden");
      const presente = sessionTokenFrom(req.headers.cookie ? parse(req.headers.cookie) : {});
      const compte = presente ? await d.verifierCompte(presente.token).catch(() => null) : null;
      if (!presente || !compte) return refuserCompte(socket, 401, "Unauthorized");
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        const c = hub.ouvrir({
          envoyer: (t) => ws.send(t),
          fermer: (code, raison) => ws.close(code, raison),
          enAttente: () => ws.bufferedAmount,
          ping: () => ws.ping(),
        }, presente.token, compte);
        if (!c) return;
        ws.on("error", () => ws.terminate());
        ws.on("pong", () => hub.pong(c));
        ws.on("message", (data, binaire) => { if (!binaire) void hub.recevoir(c, data as Buffer); });
        ws.on("close", () => void hub.fermee(c));
      });
    })().catch((e: unknown) => {
      journal("error", "temps-reel : montée de protocole en échec", { erreur: (e as Error).message });
      refuserCompte(socket, 401, "Unauthorized");
    });
  });

  const desabonner = abonnerSignaux((s) => hub.signal(s));
  const minuteries = [
    setInterval(() => hub.battement(), BORNES_TEMPS_REEL.battementMs),
    setInterval(() => void hub.revalider(), BORNES_TEMPS_REEL.revalidationMs),
    setInterval(() => void (async () => {
      // Supervision (RTC-5) : une ligne de mesures par minute, agrégée, sans contenu ni identifiant.
      journal("info", "temps-reel : mesures", { ...hub.mesures(), refusMontee: { ...refus } });
      hub.purger();
      await toucherActivite(hub.sallesActives());
      for (const id of await sessionsAExpirer((sid) => hub.sansConnexion(sid))) {
        if (await expirer(id)) await hub.sessionModifiee(id, { nature: "session-close", statut: "expiree", par: null });
      }
    })().catch((e: unknown) => journal("warn", "temps-reel : tâche périodique en échec", { erreur: (e as Error).message })), 60_000),
  ];
  for (const m of minuteries) m.unref();
  journal("info", "temps-reel : canal actif", { chemin: CHEMIN_CANAL });
  return () => {
    for (const m of minuteries) clearInterval(m);
    desabonner();
    hub.arreter();
    wss.close();
    if (hubCourant === hub) hubCourant = null;
  };
}
