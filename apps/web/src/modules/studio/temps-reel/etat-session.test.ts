/**
 * Temps réel — état de session et canal côté navigateur (RTC-2) : réception des messages, fermetures, reprise avec le
 * dernier numéro d'événement, regroupement des éphémères. Pur : prise WebSocket et minuteries simulées.
 */
import { describe, expect, it } from "vitest";
import { CanalTempsReel, type PriseNavigateur } from "./canal";
import { delaiReconnexion, ETAT_INITIAL, etatApresFermeture, pointeursFrais, recevoir, Regroupeur, type MessageServeur } from "./etat-session";

const session = { id: "rtses_1", portee: "studio-revision" as const, titre: "Revue", studyId: "s", variantId: "v", revisionId: "r1", publicationId: null, hoteId: "h", presentateurId: "h", statut: "ouverte" as const, expireLe: "2026-10-25T12:00:00Z" };
const participants = [{ userId: "h", nom: "Hôte", roles: ["hote" as const, "presentateur" as const], suit: false, connexions: 1 }, { userId: "l", nom: "Léa", roles: ["participant" as const], suit: true, connexions: 1 }];

describe("Temps réel — état de session", () => {
  it("état, vue, pointeurs, sélections ; un participant parti disparaît", () => {
    let e = recevoir(ETAT_INITIAL, { v: 1, type: "bienvenue", connexionId: "c", userId: "l", battementMs: 10_000 }, 0);
    e = recevoir(e, { v: 1, type: "etat", session, participants, seq: 3, resynchronise: false, vue: null }, 0);
    expect(e.connexion).toBe("connecte");
    e = recevoir(e, { v: 1, type: "vue", de: "h", affichage: "2d", plan: { x: 0, y: 0, w: 10, h: 5 }, at: "" }, 0);
    expect(e.vue?.plan?.w).toBe(10);
    expect(e.vueN).toBe(1);
    e = recevoir(e, { v: 1, type: "pointeur", de: "h", espace: "plan", x: 1, y: 2 }, 1000);
    e = recevoir(e, { v: 1, type: "selection", de: "h", objectIds: ["mur-1"] }, 1000);
    expect(pointeursFrais(e, 5000).map((p) => p.nom)).toEqual(["Hôte"]);
    expect(pointeursFrais(e, 20_000)).toEqual([]);
    e = recevoir(e, { v: 1, type: "participants", participants: [participants[1]!] }, 2000);
    expect(e.pointeurs).toEqual({});
    expect(e.selections).toEqual({});
  });

  it("une nouvelle révision est annoncée, jamais appliquée ; un changement de révision de session efface l'annonce", () => {
    let e = recevoir(ETAT_INITIAL, { v: 1, type: "etat", session, participants, seq: 0, resynchronise: false, vue: null }, 0);
    e = recevoir(e, { v: 1, type: "evenement", seq: 1, evenement: { nature: "revision-disponible", variantId: "v", revisionId: "r2" }, at: "" }, 0);
    expect(e.revisionDisponible).toBe("r2");
    expect(e.session?.revisionId).toBe("r1");
    e = recevoir(e, { v: 1, type: "evenement", seq: 2, evenement: { nature: "revision-session", revisionId: "r2", par: "h" }, at: "" }, 0);
    expect(e.session?.revisionId).toBe("r2");
    expect(e.revisionDisponible).toBeNull();
    expect(e.seq).toBe(2);
  });

  it("fermetures : refus définitifs et reprises automatiques", () => {
    expect(etatApresFermeture(4403)).toBe("acces-retire");
    expect(etatApresFermeture(4401)).toBe("non-connecte");
    expect(etatApresFermeture(4404)).toBe("session-close");
    expect(etatApresFermeture(1006)).toBeNull();
    expect(etatApresFermeture(4413)).toBeNull();
    expect(delaiReconnexion(0, 0.5)).toBe(1000);
    expect(delaiReconnexion(10, 0.5)).toBe(15_000);
  });

  it("regroupement : une valeur par fenêtre de 100 ms, la dernière seulement", () => {
    const r = new Regroupeur<number>();
    expect(r.proposer(1, 0)).toBe(1);
    expect(r.proposer(2, 20)).toBeNull();
    expect(r.proposer(3, 50)).toBeNull();
    expect(r.tic(60)).toBeNull();
    expect(r.tic(100)).toBe(3);
    expect(r.tic(250)).toBeNull();
  });
});

class FaussePrise implements PriseNavigateur {
  readyState = 0;
  envoyes: Record<string, unknown>[] = [];
  onopen: PriseNavigateur["onopen"] = null;
  onmessage: PriseNavigateur["onmessage"] = null;
  onclose: PriseNavigateur["onclose"] = null;
  onerror: PriseNavigateur["onerror"] = null;
  send(t: string) { this.envoyes.push(JSON.parse(t) as Record<string, unknown>); }
  close() { this.readyState = 3; }
  ouvrir() { this.readyState = 1; this.onopen?.({}); }
  recevoir(m: MessageServeur) { this.onmessage?.({ data: JSON.stringify(m) }); }
  fermer(code: number) { this.readyState = 3; this.onclose?.({ code }); }
}

describe("Temps réel — canal du navigateur", () => {
  function monde() {
    let t = 0;
    const prises: FaussePrise[] = [];
    const attentes: { f: () => void; a: number }[] = [];
    const canal = new CanalTempsReel({
      adresse: "ws://test/temps-reel", maintenant: () => t, alea: () => 0.5,
      ouvrirPrise: () => { const p = new FaussePrise(); prises.push(p); return p; },
      attendre: (f, ms) => { const x = { f, a: t + ms }; attentes.push(x); return x; },
      annulerAttente: (x) => { const i = attentes.indexOf(x as never); if (i >= 0) attentes.splice(i, 1); },
    });
    const avancer = (ms: number) => {
      t += ms;
      for (const x of attentes.filter((y) => y.a <= t)) { attentes.splice(attentes.indexOf(x), 1); x.f(); }
    };
    return { canal, prises, avancer };
  }

  it("rejoint, puis revient après une coupure avec le dernier numéro d'événement reçu", () => {
    const m = monde();
    m.canal.rejoindre("rtses_1");
    const p1 = m.prises[0]!;
    p1.ouvrir();
    expect(p1.envoyes[0]).toEqual({ v: 1, type: "rejoindre", sessionId: "rtses_1" });
    p1.recevoir({ v: 1, type: "etat", session, participants, seq: 4, resynchronise: false, vue: null });
    p1.recevoir({ v: 1, type: "evenement", seq: 5, evenement: { nature: "hote", hoteId: "h", par: "h", reprise: false }, at: "" });
    p1.fermer(1006);
    expect(m.canal.etat.connexion).toBe("reconnexion");
    m.avancer(1000);
    const p2 = m.prises[1]!;
    p2.ouvrir();
    expect(p2.envoyes[0]).toEqual({ v: 1, type: "rejoindre", sessionId: "rtses_1", depuis: 5 });
  });

  it("accès retiré (4403) : arrêt définitif, plus aucune tentative", () => {
    const m = monde();
    m.canal.rejoindre("rtses_1");
    m.prises[0]!.ouvrir();
    m.prises[0]!.fermer(4403);
    expect(m.canal.etat.connexion).toBe("acces-retire");
    m.avancer(60_000);
    expect(m.prises).toHaveLength(1);
  });

  it("les éphémères attendent l'état de la session, puis partent regroupés", () => {
    const m = monde();
    m.canal.rejoindre("rtses_1");
    const p = m.prises[0]!;
    p.ouvrir();
    m.canal.pointeur({ espace: "plan", x: 1, y: 1 });
    expect(p.envoyes.some((e) => e["type"] === "pointeur")).toBe(false);
    p.recevoir({ v: 1, type: "etat", session, participants, seq: 0, resynchronise: false, vue: null });
    m.avancer(100);
    m.canal.pointeur({ espace: "plan", x: 2, y: 2 });
    m.canal.pointeur({ espace: "plan", x: 3, y: 3 });
    m.avancer(100);
    const pointeurs = p.envoyes.filter((e) => e["type"] === "pointeur").map((e) => e["x"]);
    expect(pointeurs).toEqual([2, 3]);
    m.canal.selection(["a", "a", "b"]);
    m.canal.selection(["a", "b"]);
    expect(p.envoyes.filter((e) => e["type"] === "selection")).toHaveLength(1);
  });

  it("quitter : le serveur est prévenu, l'état revient hors session", () => {
    const m = monde();
    m.canal.rejoindre("rtses_1");
    const p = m.prises[0]!;
    p.ouvrir();
    m.canal.quitter();
    expect(p.envoyes.at(-1)).toEqual({ v: 1, type: "quitter" });
    expect(m.canal.etat.connexion).toBe("hors-session");
  });
});
