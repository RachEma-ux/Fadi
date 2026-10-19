/**
 * Ordonnanceur des tâches de Studio (D.1-01/03, D.2-01…07) : priorité interactive, concurrence bornée, remplacement
 * et résultat périmé jamais remis, délai, plantage puis reprise unique, aucun doublon. Faux exécuteur, faux minuteurs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { empreinteDe, hacher, jsonStable, revisionDocument, type Empreinte } from "./empreinte";
import { MESSAGES_TACHE, messageTache } from "./messages";
import { ErreurTache, Ordonnanceur, type DemandeTache, type EvenementTache, type ExecutionDemandee } from "./ordonnanceur";

interface Appel { e: ExecutionDemandee; resoudre: (v: unknown) => void; rejeter: (e: unknown) => void }

function banc(o: { concurrence?: number; concurrenceFond?: number; delaiMs?: number } = {}) {
  const appels: Appel[] = [];
  const journal: EvenementTache[] = [];
  const ord = new Ordonnanceur({
    executer: (e) => new Promise((resoudre, rejeter) => { appels.push({ e, resoudre, rejeter }); }),
    delaiMs: o.delaiMs ?? 1000, gardeMs: 0, concurrence: o.concurrence, concurrenceFond: o.concurrenceFond,
    surEvenement: (ev) => journal.push(ev),
  });
  return { ord, appels, journal };
}
const emp = (revision: string, parametres = "p"): Empreinte => ({ revision, parametres });
const dem = (cle: string, classe: "interactive" | "fond", revision = "1", extra: Partial<DemandeTache> = {}): DemandeTache =>
  ({ cle, classe, nature: cle, charge: { revision }, empreinte: emp(revision), ...extra });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

describe("ordonnanceur : classes et priorité", () => {
  it("l'interactive passe avant le fond en file ; un emplacement reste toujours libre pour l'interactive", async () => {
    const { ord, appels } = banc(); // 2 emplacements, 1 au plus pour le fond
    ord.soumettre(dem("fond-a", "fond"));
    ord.soumettre(dem("fond-b", "fond"));
    ord.soumettre(dem("fond-c", "fond"));
    expect(appels.map((a) => a.e.nature)).toEqual(["fond-a"]);
    // Le second emplacement n'est jamais pris par le fond : l'interactive démarre aussitôt.
    ord.soumettre(dem("apercu", "interactive"));
    expect(appels.map((a) => a.e.nature)).toEqual(["fond-a", "apercu"]);
    expect(ord.enCours).toBe(2);
    expect(ord.enFile).toBe(2);
    appels[0]!.resoudre("A");
    await flush();
    expect(appels.map((a) => a.e.nature)).toEqual(["fond-a", "apercu", "fond-b"]);
  });

  it("un seul emplacement : l'interactive arrivée après passe devant le fond en file", async () => {
    const { ord, appels } = banc({ concurrence: 1 });
    ord.soumettre(dem("fond-a", "fond"));
    ord.soumettre(dem("fond-b", "fond"));
    ord.soumettre(dem("apercu", "interactive"));
    appels[0]!.resoudre(1);
    await flush();
    expect(appels.map((a) => a.e.nature)).toEqual(["fond-a", "apercu"]);
    appels[1]!.resoudre(2);
    await flush();
    expect(appels.map((a) => a.e.nature)).toEqual(["fond-a", "apercu", "fond-b"]);
  });

  it("concurrence bornée : jamais plus d'exécutions que d'emplacements ; emplacements réutilisés", async () => {
    const { ord, appels } = banc({ concurrence: 2 });
    for (let i = 0; i < 5; i++) ord.soumettre(dem(`i${i}`, "interactive"));
    expect(appels).toHaveLength(2);
    expect(new Set(appels.map((a) => a.e.emplacement))).toEqual(new Set([0, 1]));
    appels[1]!.resoudre(null);
    await flush();
    expect(appels).toHaveLength(3);
    expect(appels[2]!.e.emplacement).toBe(1);
  });
});

describe("ordonnanceur : empreinte, remplacement et résultat périmé (D.2-03)", () => {
  it("même clé, même empreinte : la même poignée, aucun calcul en double", () => {
    const { ord, appels } = banc();
    const a = ord.soumettre(dem("m", "fond", "1"));
    const b = ord.soumettre(dem("m", "fond", "1"));
    expect(b).toBe(a);
    expect(appels).toHaveLength(1);
  });

  it("une nouvelle révision annule la tâche en cours ; son résultat tardif est périmé et jamais remis", async () => {
    const { ord, appels, journal } = banc();
    const remis: unknown[] = [];
    const a = ord.soumettre(dem("m", "fond", "1", { surResultat: (v) => remis.push(v) }));
    const b = ord.soumettre(dem("m", "fond", "2", { surResultat: (v) => remis.push(v) }));
    await expect(a.issue).resolves.toEqual({ etat: "cancelled" });
    // L'ancienne tâche tourne encore (pas d'arrêt du Worker) ; la nouvelle attend l'emplacement de fond.
    expect(appels).toHaveLength(1);
    expect(appels[0]!.e.signal.aborted).toBe(false);
    appels[0]!.resoudre("ancien");
    await flush();
    expect(a.tache.etat).toBe("stale");
    expect(journal.some((e) => e.id === a.tache.id && e.etat === "stale")).toBe(true);
    expect(remis).toEqual([]);
    expect(appels).toHaveLength(2);
    appels[1]!.resoudre("nouveau");
    await expect(b.issue).resolves.toEqual({ etat: "done", valeur: "nouveau" });
    expect(remis).toEqual(["nouveau"]);
    expect(ord.courante("m")).toBeUndefined();
  });

  it("résultat ancien arrivé APRÈS le nouveau : jamais remis par-dessus", async () => {
    const { ord, appels } = banc({ concurrence: 3, concurrenceFond: 2 });
    const remis: unknown[] = [];
    ord.soumettre(dem("m", "fond", "1", { surResultat: (v) => remis.push(v) }));
    const b = ord.soumettre(dem("m", "fond", "2", { surResultat: (v) => remis.push(v) }));
    expect(appels).toHaveLength(2);
    appels[1]!.resoudre("r2");
    await flush();
    appels[0]!.resoudre("r1");
    await flush();
    expect(remis).toEqual(["r2"]);
    expect(b.tache.etat).toBe("done");
  });

  it("tâche remplacée encore en file : annulée sans avoir tourné", async () => {
    const { ord, appels } = banc({ concurrence: 1 });
    ord.soumettre(dem("x", "fond"));
    const a = ord.soumettre(dem("m", "fond", "1"));
    ord.soumettre(dem("m", "fond", "2"));
    await expect(a.issue).resolves.toEqual({ etat: "cancelled" });
    expect(a.tache.tentatives).toBe(0);
    appels[0]!.resoudre(0);
    await flush();
    // La révision 1 n'a jamais tourné : seule la révision 2 de « m » est calculée.
    expect(appels.map((x) => `${x.e.nature}@${(x.e.charge as { revision: string }).revision}`)).toEqual(["x@1", "m@2"]);
  });

  it("annulation ferme (signal) : calcul interrompu, emplacement libéré, réponse tardive ignorée", async () => {
    const { ord, appels } = banc({ concurrence: 1 });
    const c = new AbortController();
    const remis: unknown[] = [];
    const a = ord.soumettre(dem("dxf", "fond", "1", { signal: c.signal, surResultat: (v) => remis.push(v) }));
    const suivante = ord.soumettre(dem("autre", "fond"));
    c.abort();
    await expect(a.issue).resolves.toEqual({ etat: "cancelled" });
    expect(appels[0]!.e.signal.aborted).toBe(true);
    expect(appels).toHaveLength(2);
    appels[0]!.resoudre("tard");
    appels[1]!.resoudre("ok");
    await expect(suivante.issue).resolves.toEqual({ etat: "done", valeur: "ok" });
    expect(remis).toEqual([]);
    expect(a.tache.etat).toBe("cancelled");
  });

  it("édition continue : une tâche remplacée en file garde sa place, le fond ne s'affame pas (maillage puis métré)", async () => {
    const { ord, appels } = banc(); // un seul emplacement de fond
    ord.soumettre(dem("maillage", "fond", "1"));
    ord.soumettre(dem("quantites", "fond", "1"));
    // Chaque frappe soumet d'abord le maillage, puis le métré.
    for (let r = 2; r <= 6; r++) { ord.soumettre(dem("maillage", "fond", String(r))); ord.soumettre(dem("quantites", "fond", String(r))); }
    expect(appels.map((a) => a.e.nature)).toEqual(["maillage"]);
    appels[0]!.resoudre("périmé");
    await flush();
    // Le métré, en file depuis le début, passe avant le maillage soumis plus tard.
    expect(appels.map((a) => `${a.e.nature}@${(a.e.charge as { revision: string }).revision}`)).toEqual(["maillage@1", "quantites@6"]);
    appels[1]!.resoudre("q");
    await flush();
    expect(appels[2]!.e.nature).toBe("maillage");
  });

  it("reprise après plantage : l'exécuteur est prévenu (son échec n'est pas compté deux fois)", async () => {
    const { ord, appels } = banc();
    ord.soumettre(dem("m", "fond"));
    expect(appels[0]!.e.reprise).toBe(false);
    appels[0]!.rejeter(new ErreurTache("plantage"));
    await flush();
    expect(appels[1]!.e.reprise).toBe(true);
  });

  it("signal déjà abandonné : annulée tout de suite, rien n'est exécuté", async () => {
    const { ord, appels } = banc();
    const c = new AbortController(); c.abort();
    await expect(ord.soumettre(dem("m", "fond", "1", { signal: c.signal })).issue).resolves.toEqual({ etat: "cancelled" });
    expect(appels).toHaveLength(0);
  });
});

describe("ordonnanceur : délai, plantage, reprise", () => {
  it("délai dépassé : timed-out, calcul arrêté, emplacement libéré ; la réponse tardive est ignorée", async () => {
    const { ord, appels } = banc({ concurrence: 1, delaiMs: 50 });
    const remis: unknown[] = [];
    const a = ord.soumettre(dem("m", "fond", "1", { surResultat: (v) => remis.push(v) }));
    const b = ord.soumettre(dem("q", "fond"));
    expect(appels[0]!.e.delaiMs).toBe(50);
    await vi.advanceTimersByTimeAsync(49);
    expect(a.tache.etat).toBe("running");
    await vi.advanceTimersByTimeAsync(1);
    await expect(a.issue).resolves.toEqual({ etat: "timed-out" });
    expect(appels[0]!.e.signal.aborted).toBe(true);
    expect(appels).toHaveLength(2);
    appels[0]!.resoudre("tard");
    await flush();
    expect(remis).toEqual([]);
    expect(a.tache.etat).toBe("timed-out");
    appels[1]!.resoudre("q");
    await expect(b.issue).resolves.toMatchObject({ etat: "done" });
    expect(messageTache({ etat: "timed-out" })).toBe(MESSAGES_TACHE.delai);
  });

  it("délai signalé par l'exécuteur (hôte du Worker) : timed-out, sans reprise", async () => {
    const { ord, appels } = banc();
    const a = ord.soumettre(dem("m", "fond"));
    appels[0]!.rejeter(new ErreurTache("delai"));
    await expect(a.issue).resolves.toEqual({ etat: "timed-out" });
    expect(appels).toHaveLength(1);
  });

  it("plantage : la même tâche est remise en tête une fois, puis réussit ; un seul résultat remis, pas de doublon", async () => {
    const { ord, appels, journal } = banc({ concurrence: 1 });
    const remis: unknown[] = [];
    const a = ord.soumettre(dem("m", "fond", "1", { surResultat: (v) => remis.push(v) }));
    ord.soumettre(dem("autre", "fond"));
    appels[0]!.rejeter(new ErreurTache("plantage", "Worker interrompu"));
    await flush();
    // Reprise en tête de file, avant « autre » ; même tâche (même identifiant), deuxième tentative.
    expect(appels).toHaveLength(2);
    expect(appels[1]!.e.nature).toBe("m");
    expect(a.tache.tentatives).toBe(2);
    expect(journal.filter((e) => e.id === a.tache.id && e.etat === "requeued")).toHaveLength(1);
    // Réponse tardive de la première tentative : ignorée (jamais de remise partielle ni double).
    appels[0]!.resoudre("tentative-1");
    appels[1]!.resoudre("tentative-2");
    await expect(a.issue).resolves.toEqual({ etat: "done", valeur: "tentative-2" });
    appels[1]!.resoudre("encore");
    await flush();
    expect(remis).toEqual(["tentative-2"]);
    expect(journal.filter((e) => e.id === a.tache.id && e.etat === "done")).toHaveLength(1);
  });

  it("deux plantages : échec explicite (jamais en suspens), message en français ; les autres tâches continuent", async () => {
    const { ord, appels } = banc();
    const a = ord.soumettre(dem("m", "fond"));
    const i = ord.soumettre(dem("apercu", "interactive"));
    appels[0]!.rejeter(new ErreurTache("plantage"));
    await flush();
    const reprise = appels.find((x, n) => n > 1 && x.e.nature === "m")!;
    reprise.rejeter(new ErreurTache("plantage"));
    const issue = await a.issue;
    expect(issue).toMatchObject({ etat: "failed", code: "plantage" });
    expect(messageTache(issue)).toBe(MESSAGES_TACHE.plantage);
    appels[1]!.resoudre("apercu");
    await expect(i.issue).resolves.toEqual({ etat: "done", valeur: "apercu" });
    expect(ord.enCours).toBe(0);
  });

  it("erreur de calcul ou exécuteur qui lève : failed sans reprise", async () => {
    const ord = new Ordonnanceur({ executer: () => { throw new Error("boum"); }, delaiMs: 10 });
    await expect(ord.soumettre(dem("m", "fond")).issue).resolves.toEqual({ etat: "failed", code: "calcul", message: "boum" });
    expect(messageTache({ etat: "failed", code: "calcul", message: "boum" })).toBe(MESSAGES_TACHE.calcul);
  });

  it("toutAnnuler : file vidée, calculs arrêtés, chaque issue résolue", async () => {
    const { ord, appels } = banc();
    const p = [ord.soumettre(dem("a", "fond")), ord.soumettre(dem("b", "fond")), ord.soumettre(dem("c", "interactive"))];
    ord.toutAnnuler();
    expect((await Promise.all(p.map((x) => x.issue))).map((x) => x.etat)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(appels.every((a) => a.e.signal.aborted)).toBe(true);
    expect(ord.enCours + ord.enFile).toBe(0);
  });
});

describe("empreinte d'entrée et messages", () => {
  it("révision de session : stable pour un même document, croissante pour un nouveau ; hachage des paramètres stable", () => {
    const d1 = { id: "d" }, d2 = { id: "d" };
    expect(revisionDocument(d1)).toBe(revisionDocument(d1));
    expect(revisionDocument(d2)).toBeGreaterThan(revisionDocument(d1));
    expect(jsonStable({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(hacher({ a: 1, b: 2 })).toBe(hacher({ b: 2, a: 1 }));
    expect(hacher({ a: 1 })).not.toBe(hacher({ a: 2 }));
    expect(empreinteDe(d1, { f: "A3" })).toEqual({ revision: String(revisionDocument(d1)), parametres: hacher({ f: "A3" }) });
  });

  it("messages d'interface traduits dans en.json", () => {
    const en = JSON.parse(readFileSync(new URL("../../../lib/i18n/en.json", import.meta.url), "utf8")) as Record<string, string>;
    for (const m of Object.values(MESSAGES_TACHE)) expect(en[m], m).toBeTruthy();
  });
});
