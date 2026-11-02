/**
 * TR-IF-007 / IF-007 — « queued → loading → running → completed, avec branches cancel_requested, cancelled, failed,
 * superseded, timed_out. Une demande d'annulation n'équivaut pas immédiatement à un arrêt matériel ; le résultat d'une
 * tâche finalement terminée après annulation ne peut être engagé sans nouvelle vérification. » Ordonnanceur réel, faux
 * exécuteur et faux minuteurs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engagerApresVerification, Ordonnanceur, STATUTS_IF007, type DemandeTache, type EvenementTache, type ExecutionDemandee } from "./ordonnanceur";
import { HoteWorker } from "../workers/hote-worker";
import { executeurHotes } from "./pool-studio";

interface Appel { e: ExecutionDemandee; resoudre: (v: unknown) => void; rejeter: (e: unknown) => void }
function banc(aCharger = false) {
  const appels: Appel[] = [];
  const journal: EvenementTache[] = [];
  const ord = new Ordonnanceur({
    executer: (e) => new Promise((resoudre, rejeter) => { appels.push({ e, resoudre, rejeter }); }),
    delaiMs: 1000, gardeMs: 0, concurrence: 2, surEvenement: (ev) => journal.push(ev), aCharger: () => aCharger,
  });
  return { ord, appels, journal };
}
const dem = (cle: string, revision: string, extra: Partial<DemandeTache> = {}): DemandeTache =>
  ({ cle, classe: "interactive", nature: cle, charge: { revision }, empreinte: { revision, parametres: "p" }, ...extra });
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("TR-IF-007 — statuts des tâches de Studio", () => {
  it("cas positif : queued → loading → running → completed, chaque statut tracé avec sa révision source, résultat remis une fois", async () => {
    const { ord, appels, journal } = banc(true);
    const remis: unknown[] = [];
    const p = ord.soumettre(dem("maillage", "r7", { surResultat: (v) => remis.push(v) }));
    expect(p.tache.etat).toBe("loading");
    appels[0]!.e.demarre();
    expect(p.tache.etat).toBe("running");
    appels[0]!.resoudre("ok");
    await expect(p.issue).resolves.toEqual({ etat: "done", valeur: "ok" });
    expect(p.tache.historique.map((h) => STATUTS_IF007[h.etat])).toEqual(["queued", "loading", "running", "completed"]);
    expect(p.tache.historique.every((h) => h.revision === "r7")).toBe(true);
    expect(journal.filter((e) => e.id === p.tache.id).map((e) => `${e.etat}@${e.revision}`)).toEqual(["queued@r7", "loading@r7", "running@r7", "done@r7"]);
    expect(remis).toEqual(["ok"]);
  });

  it("loading passe à running à la première progression ; sans chargement annoncé, la tâche démarre directement en running", async () => {
    const a = banc(true);
    const p = a.ord.soumettre(dem("m", "1"));
    a.appels[0]!.e.surProgression({ etape: "analyse" });
    expect(p.tache.etat).toBe("running");
    const b = banc(false);
    const q = b.ord.soumettre(dem("m", "1"));
    expect(q.tache.historique.map((h) => h.etat)).toEqual(["queued", "running"]);
  });

  it("cas négatif : cancel_requested n'arrête pas matériellement — emplacement gardé ; le calcul finit quand même : résultat NON engagé, puis seulement après vérification", async () => {
    const { ord, appels } = banc();
    const remis: unknown[] = [];
    const p = ord.soumettre(dem("feuille", "r3", { surResultat: (v) => remis.push(v) }));
    p.demanderAnnulation();
    expect(p.tache.etat).toBe("cancel_requested");
    expect(appels[0]!.e.signal.aborted).toBe(true);
    // L'emplacement reste pris tant que le calcul n'a pas réellement fini : ce n'est pas un arrêt matériel.
    expect(ord.enCours).toBe(1);
    let resolue = false;
    void p.issue.then(() => { resolue = true; });
    await flush();
    expect(resolue).toBe(false);
    appels[0]!.resoudre({ pages: 1 });
    const issue = await p.issue;
    expect(issue).toEqual({ etat: "cancelled", nonEngage: { valeur: { pages: 1 }, revisionSource: "r3" } });
    expect(remis).toEqual([]);
    expect(ord.enCours).toBe(0);
    expect(p.tache.historique.map((h) => STATUTS_IF007[h.etat])).toEqual(["queued", "running", "cancel_requested", "cancelled"]);
    // Engagement : jamais sans nouvelle vérification ; refusé si la révision a changé ou si la vérification échoue.
    const tardif = issue.etat === "cancelled" ? issue.nonEngage : undefined;
    expect(engagerApresVerification(tardif, "r4", () => true)).toBeNull();
    expect(engagerApresVerification(tardif, "r3", () => false)).toBeNull();
    expect(engagerApresVerification(tardif, "r3", (v) => (v as { pages: number }).pages === 1)).toEqual({ pages: 1 });
  });

  it("cancel_requested puis échec ou délai : attente résolue « cancelled », jamais laissée en suspens", async () => {
    const { ord, appels } = banc();
    const a = ord.soumettre(dem("a", "1"));
    a.demanderAnnulation();
    appels[0]!.rejeter(new Error("interrompu"));
    await expect(a.issue).resolves.toEqual({ etat: "cancelled" });
    const b = ord.soumettre(dem("b", "1"));
    b.demanderAnnulation();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(b.issue).resolves.toEqual({ etat: "cancelled" });
    expect(ord.enCours).toBe(0);
  });

  it("superseded : une tâche plus récente de la même clé remplace la précédente ; son résultat tardif est stale, jamais remis ; timed_out nommé", async () => {
    const { ord, appels } = banc();
    const remis: unknown[] = [];
    const a = ord.soumettre(dem("m", "1", { surResultat: (v) => remis.push(v) }));
    const b = ord.soumettre(dem("m", "2", { surResultat: (v) => remis.push(v) }));
    await expect(a.issue).resolves.toEqual({ etat: "superseded" });
    appels[0]!.resoudre("ancien");
    await flush();
    expect(STATUTS_IF007[a.tache.etat]).toBe("superseded");
    appels[1]!.resoudre("nouveau");
    await expect(b.issue).resolves.toEqual({ etat: "done", valeur: "nouveau" });
    expect(remis).toEqual(["nouveau"]);
    const c = ord.soumettre(dem("lent", "1"));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(c.issue).resolves.toEqual({ etat: "timed-out" });
    expect(STATUTS_IF007[c.tache.etat]).toBe("timed_out");
  });

  it("demande d'annulation d'une tâche encore en file : annulée sans avoir tourné", async () => {
    const { ord, appels } = banc();
    ord.soumettre(dem("x", "1")); ord.soumettre(dem("y", "1"));
    const z = ord.soumettre(dem("z", "1"));
    z.demanderAnnulation();
    await expect(z.issue).resolves.toEqual({ etat: "cancelled" });
    expect(z.tache.tentatives).toBe(0);
    expect(appels).toHaveLength(2);
  });
});

describe("TR-IF-007 — statuts sur le groupe de Workers réel (hôtes)", () => {
  it("première tâche : loading tant que le Worker n'a rien répondu, running à sa première progression ; tâche suivante sur le Worker vivant : running directement", async () => {
    vi.useRealTimers();
    const recus: { id: number }[] = [];
    let emettre: (d: unknown) => void = () => {};
    const faux = { addEventListener: (t: string, f: (e: unknown) => void) => { if (t === "message") emettre = (d) => f({ data: d }); }, postMessage: (m: { id: number }) => recus.push(m), terminate: () => {} };
    const hote = new HoteWorker({ creer: () => faux as unknown as Worker, delaiMs: 1000, workerDisponible: () => true });
    const ord = new Ordonnanceur({ executer: executeurHotes([hote]), delaiMs: 1000, concurrence: 1, aCharger: () => !hote.vivant });
    const p = ord.soumettre(dem("m", "1"));
    expect(p.tache.etat).toBe("loading");
    emettre({ id: recus[0]!.id, progression: { etape: "analyse" } });
    expect(p.tache.etat).toBe("running");
    emettre({ id: recus[0]!.id, valeur: 1 });
    await expect(p.issue).resolves.toEqual({ etat: "done", valeur: 1 });
    const q = ord.soumettre(dem("n", "2"));
    expect(q.tache.historique.map((h) => h.etat)).toEqual(["queued", "running"]);
    emettre({ id: recus[1]!.id, valeur: 2 });
    await expect(q.issue).resolves.toEqual({ etat: "done", valeur: 2 });
  });
});
