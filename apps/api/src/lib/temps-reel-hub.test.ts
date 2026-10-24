/**
 * Temps réel — répartiteur (RTC-1, critères RT-R1, RT-R2, RT-R7 ; tests TR-T01, TR-T02, TR-T07, TR-T09 en version pure) :
 * prises et base simulées, horloge maîtrisée. Les recettes `apps/web/e2e/temps-reel-*.mjs` rejouent ces scénarios sur
 * l'API et une base réelles.
 */
import { describe, expect, it } from "vitest";
import { HubTempsReel, type DependancesHub, type Prise, type SessionConnue } from "./temps-reel-hub.js";
import { BORNES_TEMPS_REEL, FERMETURE, type MessageServeur } from "./temps-reel-protocole.js";
import type { ProjectRole } from "./owned-project.js";

class FaussePrise implements Prise {
  recus: MessageServeur[] = [];
  fermeture: { code: number; raison: string } | null = null;
  attente = 0;
  pings = 0;
  envoyer(t: string) { this.recus.push(JSON.parse(t) as MessageServeur); }
  fermer(code: number, raison: string) { this.fermeture = { code, raison }; }
  enAttente() { return this.attente; }
  ping() { this.pings += 1; }
  de<T extends MessageServeur["type"]>(type: T) { return this.recus.filter((m): m is Extract<MessageServeur, { type: T }> => m.type === type); }
}

function monde() {
  let t = 1_000_000;
  const roles = new Map<string, ProjectRole | null>([["hote", "proprietaire"], ["editeur", "editeur"], ["lecteur", "lecteur"], ["tiers", null], ["support", null]]);
  const comptes = new Map<string, { userId: string; sessionCompteId: string } | null>();
  const session: SessionConnue = {
    id: "rtses_1", projectId: "p1", portee: "studio-revision", titre: "Revue", studyId: "s1", variantId: "v1", revisionId: "r1", publicationId: null,
    hoteId: "hote", presentateurId: "hote", statut: "ouverte", expireLe: new Date(t + 3_600_000).toISOString(),
  };
  const presence: string[] = [];
  const d: DependancesHub = {
    maintenant: () => t,
    verifierCompte: async (jeton) => comptes.get(jeton) ?? null,
    verifierAcces: async (_p, userId) => roles.get(userId) ?? null,
    chargerSession: async (id) => (id === session.id ? { ...session } : null),
    chargerObjets: async () => new Set(["mur-1", "baie-2"]),
    noms: async (ids) => new Map(ids.map((i) => [i, `Nom ${i}`])),
    journaliserPresence: async (_s, userId, action) => { presence.push(`${action}:${userId}`); },
    journal: () => {},
  };
  const hub = new HubTempsReel(d);
  const connecter = (userId: string) => {
    const jeton = `jeton-${userId}-${comptes.size}`;
    comptes.set(jeton, { userId, sessionCompteId: `sc-${jeton}` });
    const prise = new FaussePrise();
    const c = hub.ouvrir(prise, jeton, { userId, sessionCompteId: `sc-${jeton}` })!;
    const envoyer = (m: Record<string, unknown>) => hub.recevoir(c, JSON.stringify({ v: 1, ...m }));
    return { prise, c, jeton, envoyer };
  };
  return { hub, d, session, roles, comptes, presence, connecter, avancer: (ms: number) => { t += ms; } };
}

describe("Temps réel — répartiteur", () => {
  it("TR-T01 : deux personnes autorisées rejoignent ; un tiers et l'accès support reçoivent la même réponse qu'une session inexistante", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur"), t = m.connecter("tiers"), s = m.connecter("support");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await t.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await s.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    const inexistante = m.connecter("tiers");
    await inexistante.envoyer({ type: "rejoindre", sessionId: "rtses_inconnue" });
    expect(h.prise.de("etat")).toHaveLength(1);
    expect(l.prise.de("etat")[0]?.participants.map((p) => p.userId).sort()).toEqual(["hote", "lecteur"]);
    for (const x of [t, s, inexistante]) {
      expect(x.prise.de("etat")).toHaveLength(0);
      expect(x.prise.de("erreur")[0]?.code).toBe("session-indisponible");
    }
    expect(m.presence).toEqual(["rejoindre:hote", "rejoindre:lecteur"]);
  });

  it("vue : seul le présentateur la partage ; le dernier état est remis à qui arrive", async () => {
    const m = monde();
    const h = m.connecter("hote"), e = m.connecter("editeur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await e.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await e.envoyer({ type: "vue", affichage: "2d", plan: { x: 0, y: 0, w: 5, h: 5 } });
    expect(e.prise.de("erreur").map((x) => x.code)).toContain("non-presentateur");
    expect(h.prise.de("vue")).toHaveLength(0);
    await h.envoyer({ type: "vue", affichage: "2d", plan: { x: 1, y: 2, w: 30, h: 20 } });
    expect(e.prise.de("vue")[0]).toMatchObject({ de: "hote", plan: { x: 1, y: 2, w: 30, h: 20 } });
    const l = m.connecter("lecteur");
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    expect(l.prise.de("etat")[0]?.vue).toMatchObject({ de: "hote", affichage: "2d" });
  });

  it("TR-T02 : une sélection forgée ne cite que les objets du document épinglé", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await h.envoyer({ type: "selection", objectIds: ["objet-cache", "mur-1"] });
    expect(l.prise.de("selection")[0]?.objectIds).toEqual(["mur-1"]);
  });

  it("TR-T07 : accès retiré — plus rien n'est diffusé avant la relecture, puis la connexion est fermée (4403)", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.roles.set("lecteur", null);
    m.hub.signal({ type: "acces", projectId: "p1", userId: "lecteur" });
    // Diffusé pendant la relecture : jamais reçu par la connexion à relire.
    await h.envoyer({ type: "pointeur", espace: "plan", x: 1, y: 1 });
    expect(l.prise.de("pointeur")).toHaveLength(0);
    await m.hub.revalider();
    expect(l.prise.fermeture?.code).toBe(FERMETURE.accesRetire);
    expect(m.hub.etat("rtses_1").connectes).toEqual(["hote"]);
    // Un autre participant garde son droit et continue de recevoir.
    const e = m.connecter("editeur");
    await e.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await h.envoyer({ type: "pointeur", espace: "plan", x: 2, y: 2 });
    expect(e.prise.de("pointeur")).toHaveLength(1);
  });

  it("session de compte révoquée : connexion fermée (4401) à la relecture", async () => {
    const m = monde();
    const l = m.connecter("lecteur");
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.comptes.set(l.jeton, null);
    m.hub.signal({ type: "session-compte", sessionId: `sc-${l.jeton}` });
    await m.hub.revalider();
    expect(l.prise.fermeture?.code).toBe(FERMETURE.nonAuthentifie);
  });

  it("droit non relu depuis plus de 3 s (base indisponible) : diffusion suspendue, sans fermeture", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.avancer(BORNES_TEMPS_REEL.fraicheurDroitMs + 1);
    await h.envoyer({ type: "pointeur", espace: "plan", x: 3, y: 3 });
    expect(l.prise.de("pointeur")).toHaveLength(0);
    await m.hub.revalider();
    await h.envoyer({ type: "pointeur", espace: "plan", x: 4, y: 4 });
    expect(l.prise.de("pointeur")).toHaveLength(1);
  });

  it("battement : une connexion muette est coupée au battement suivant (présence retirée)", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.hub.battement();
    m.hub.pong(h.c);
    m.hub.battement();
    expect(l.prise.fermeture?.code).toBe(FERMETURE.battementManque);
    await Promise.resolve();
    expect(m.hub.etat("rtses_1").connectes).toEqual(["hote"]);
    expect(m.presence).toContain("quitter:lecteur");
  });

  it("TR-T09 : file d'envoi saturée — l'éphémère est abandonné, un durable ferme la connexion (resynchronisation)", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    l.prise.attente = BORNES_TEMPS_REEL.fileEnvoiOctets;
    await h.envoyer({ type: "pointeur", espace: "plan", x: 1, y: 1 });
    expect(l.prise.fermeture).toBeNull();
    m.hub.annoncer("rtses_1", { nature: "revision-disponible", variantId: "v1", revisionId: "r2" });
    expect(l.prise.fermeture?.code).toBe(FERMETURE.fileSaturee);
  });

  it("reprise : un client qui revient reçoit les événements manqués, sinon un état resynchronisé", async () => {
    const m = monde();
    const h = m.connecter("hote");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.hub.annoncer("rtses_1", { nature: "revision-disponible", variantId: "v1", revisionId: "r2" });
    m.hub.annoncer("rtses_1", { nature: "revision-disponible", variantId: "v1", revisionId: "r3" });
    const retour = m.connecter("lecteur");
    await retour.envoyer({ type: "rejoindre", sessionId: "rtses_1", depuis: 1 });
    expect(retour.prise.de("evenement").map((e) => e.seq)).toEqual([2]);
    expect(retour.prise.de("etat")[0]?.resynchronise).toBe(false);
    const tard = m.connecter("editeur");
    await tard.envoyer({ type: "rejoindre", sessionId: "rtses_1", depuis: 99 });
    expect(tard.prise.de("etat")[0]?.resynchronise).toBe(true);
  });

  it("nouvelle révision de la variante : annoncée, la session reste sur sa révision (jamais appliquée en silence)", async () => {
    const m = monde();
    const h = m.connecter("hote");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.hub.signal({ type: "studio-revision", projectId: "p1", variantId: "v1", revisionId: "r9" });
    expect(h.prise.de("evenement")[0]?.evenement).toEqual({ nature: "revision-disponible", variantId: "v1", revisionId: "r9" });
    expect(h.prise.de("etat")[0]?.session.revisionId).toBe("r1");
  });

  it("session close : l'événement est annoncé puis les connexions sont fermées (4404)", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    m.session.statut = "close";
    await m.hub.sessionModifiee("rtses_1", { nature: "session-close", statut: "close", par: "hote" });
    expect(l.prise.de("evenement").at(-1)?.evenement.nature).toBe("session-close");
    expect(l.prise.fermeture?.code).toBe(FERMETURE.sessionIndisponible);
  });

  it("vingt connexions au plus par compte ; débit borné ; message illisible signalé sans fermeture", async () => {
    const m = monde();
    const toutes = Array.from({ length: BORNES_TEMPS_REEL.connexionsParCompte }, () => m.connecter("editeur"));
    expect(toutes.every((x) => x.prise.fermeture === null)).toBe(true);
    const prise = new FaussePrise();
    expect(m.hub.ouvrir(prise, "jeton-x", { userId: "editeur", sessionCompteId: "sc" })).toBeNull();
    expect(prise.fermeture?.code).toBe(FERMETURE.tropDeConnexions);
    const h = m.connecter("hote");
    await m.hub.recevoir(h.c, "{");
    expect(h.prise.de("erreur")[0]?.code).toBe("message-invalide");
    expect(h.prise.fermeture).toBeNull();
  });

  it("hôte absent : durée d'absence connue pour la reprise par un responsable", async () => {
    const m = monde();
    const h = m.connecter("hote"), l = m.connecter("lecteur");
    await h.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    await l.envoyer({ type: "rejoindre", sessionId: "rtses_1" });
    expect(m.hub.etat("rtses_1").hoteAbsentDepuisMs).toBeNull();
    await h.envoyer({ type: "quitter" });
    m.avancer(BORNES_TEMPS_REEL.hoteAbsentMs + 5);
    expect(m.hub.etat("rtses_1").hoteAbsentDepuisMs).toBeGreaterThan(BORNES_TEMPS_REEL.hoteAbsentMs);
  });
});
