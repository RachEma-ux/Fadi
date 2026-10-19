/**
 * Hôte générique des Workers de Studio : création paresseuse, identifiants, délai par demande, annulation par
 * AbortSignal, redémarrage après échec, remplacement sur un canal, exécution directe sans Worker.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErreurHote, estEcartee, HoteWorker, type DemandeWorker } from "./hote-worker";

/** Faux Worker : enregistre les messages et laisse le test émettre réponses, progressions et erreurs. */
class FauxWorker {
  static instances: FauxWorker[] = [];
  readonly envoyes: DemandeWorker[] = [];
  termine = false;
  private ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  constructor() { FauxWorker.instances.push(this); }
  addEventListener(type: string, f: (e: unknown) => void) { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  postMessage(m: DemandeWorker) { this.envoyes.push(m); }
  terminate() { this.termine = true; }
  emettre(type: string, data?: unknown) { for (const f of this.ecouteurs.get(type) ?? []) f({ data }); }
  repondre(valeur: unknown, n = this.envoyes.length - 1) { this.emettre("message", { id: this.envoyes[n]!.id, valeur }); }
}

function hote(o: Partial<ConstructorParameters<typeof HoteWorker>[0]> = {}) {
  FauxWorker.instances = [];
  return new HoteWorker({ creer: () => new FauxWorker() as unknown as Worker, delaiMs: 1000, workerDisponible: () => true, ...o });
}
const dernier = () => FauxWorker.instances[FauxWorker.instances.length - 1]!;

afterEach(() => { vi.useRealTimers(); });

describe("hôte des Workers de Studio", () => {
  it("création paresseuse : aucun Worker avant la première demande, un seul ensuite ; réponses rattachées à leur identifiant", async () => {
    const h = hote();
    expect(FauxWorker.instances).toHaveLength(0);
    const a = h.demander("x", 1), b = h.demander("x", 2);
    expect(FauxWorker.instances).toHaveLength(1);
    const w = dernier();
    expect(w.envoyes.map((m) => [m.nature, m.charge])).toEqual([["x", 1], ["x", 2]]);
    expect(w.envoyes[0]!.id).not.toBe(w.envoyes[1]!.id);
    w.repondre("B", 1);
    w.repondre("A", 0);
    await expect(a).resolves.toBe("A");
    await expect(b).resolves.toBe("B");
    // Réponse à un identifiant inconnu : ignorée.
    w.emettre("message", { id: 999, valeur: "?" });
    expect(h.enCours).toBe(0);
  });

  it("progression transmise à la seule demande concernée ; erreur de calcul rejetée sans arrêter le Worker", async () => {
    const h = hote();
    const vus: string[] = [];
    const a = h.demander("x", 1, { surProgression: (p) => vus.push(p.etape) });
    const w = dernier();
    w.emettre("message", { id: w.envoyes[0]!.id, progression: { etape: "lecture" } });
    w.emettre("message", { id: w.envoyes[0]!.id, erreur: "boum" });
    await expect(a).rejects.toMatchObject({ code: "calcul", message: "boum" });
    expect(vus).toEqual(["lecture"]);
    expect(w.termine).toBe(false);
    void h.demander("x", 2);
    expect(FauxWorker.instances).toHaveLength(1);
  });

  it("délai dépassé : toutes les demandes rejetées, Worker arrêté puis recréé ; la réponse tardive de l'ancien est ignorée", async () => {
    vi.useFakeTimers();
    const h = hote();
    const a = h.demander("x", 1, { delaiMs: 50 });
    const b = h.demander("x", 2);
    const w1 = dernier();
    const rejets = Promise.all([expect(a).rejects.toMatchObject({ code: "delai" }), expect(b).rejects.toMatchObject({ code: "delai" })]);
    vi.advanceTimersByTime(50);
    await rejets;
    expect(w1.termine).toBe(true);
    const c = h.demander("x", 3);
    const w2 = dernier();
    expect(w2).not.toBe(w1);
    w1.repondre("tard", 0);
    w2.repondre("ok");
    await expect(c).resolves.toBe("ok");
  });

  it("erreur fatale ou réponse illisible : redémarrage ; trois échecs consécutifs → indisponible pour la session", async () => {
    const h = hote();
    for (const [i, type] of (["error", "messageerror", "error"] as const).entries()) {
      const p = h.demander("x", i);
      dernier().emettre(type);
      await expect(p).rejects.toMatchObject({ code: type === "error" ? "interrompu" : "illisible" });
    }
    expect(FauxWorker.instances).toHaveLength(3);
    expect(h.indisponible).toBe(true);
    await expect(h.demander("x", 4)).rejects.toMatchObject({ code: "indisponible" });
    expect(FauxWorker.instances).toHaveLength(3);
  });

  it("une réponse réussie remet le compteur d'échecs à zéro", async () => {
    const h = hote();
    for (let i = 0; i < 2; i++) { const p = h.demander("x", i); dernier().emettre("error"); await p.catch(() => {}); }
    const ok = h.demander("x", 2); dernier().repondre("ok"); await ok;
    for (let i = 0; i < 2; i++) { const p = h.demander("x", i); dernier().emettre("error"); await p.catch(() => {}); }
    expect(h.indisponible).toBe(false);
  });

  it("annulation (AbortSignal) : demande rejetée « annulee », Worker arrêté sans échec compté, les autres demandes renvoyées au suivant", async () => {
    const h = hote();
    const c = new AbortController();
    const a = h.demander("x", "long", { signal: c.signal });
    const b = h.demander("x", "autre");
    const w1 = dernier();
    c.abort();
    const e = await a.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurHote);
    expect((e as ErreurHote).code).toBe("annulee");
    expect((e as Error).name).toBe("AbortError");
    expect(estEcartee(e)).toBe(true);
    expect(w1.termine).toBe(true);
    const w2 = dernier();
    expect(w2).not.toBe(w1);
    expect(w2.envoyes.map((m) => m.charge)).toEqual(["autre"]);
    w1.repondre("ancien", 1);
    w2.repondre("nouveau");
    await expect(b).resolves.toBe("nouveau");
    // Signal déjà annulé : rejet immédiat, rien n'est envoyé.
    await expect(h.demander("x", 0, { signal: c.signal })).rejects.toMatchObject({ code: "annulee" });
    expect(w2.envoyes).toHaveLength(1);
    // Dix annulations ne rendent jamais l'hôte indisponible.
    for (let i = 0; i < 10; i++) { const k = new AbortController(); const p = h.demander("x", i, { signal: k.signal }); k.abort(); await p.catch(() => {}); }
    expect(h.indisponible).toBe(false);
  });

  it("canal : une demande plus récente écarte la précédente (« remplacee ») sans arrêter le Worker ; son résultat tardif est ignoré", async () => {
    const h = hote();
    const a = h.demander("feuille", "A3", { canal: "feuille" });
    const b = h.demander("feuille", "A4", { canal: "feuille" });
    const autre = h.demander("feuille", "A1", { canal: "autre" });
    await expect(a).rejects.toMatchObject({ code: "remplacee" });
    const w = dernier();
    expect(w.termine).toBe(false);
    w.repondre("feuille A3", 0);
    w.repondre("feuille A4", 1);
    w.repondre("feuille A1", 2);
    await expect(b).resolves.toBe("feuille A4");
    await expect(autre).resolves.toBe("feuille A1");
  });

  it("sans Worker : exécution directe par la même fonction ; annulation et remplacement écartent le résultat", async () => {
    const appels: unknown[] = [];
    const h = new HoteWorker({ creer: () => { throw new Error("jamais"); }, delaiMs: 1000, workerDisponible: () => false, direct: (n, c, progresser) => { appels.push(c); progresser({ etape: "analyse" }); return `${n}:${String(c)}`; } });
    const vus: string[] = [];
    await expect(h.demander("x", 1, { surProgression: (p) => vus.push(p.etape) })).resolves.toBe("x:1");
    expect(vus).toEqual(["analyse"]);
    const a = h.demander("x", 2, { canal: "k" });
    const b = h.demander("x", 3, { canal: "k" });
    await expect(a).rejects.toMatchObject({ code: "remplacee" });
    await expect(b).resolves.toBe("x:3");
    const c = new AbortController();
    const p = h.demander("x", 4, { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ code: "annulee" });
    // Erreur levée par la fonction : rejet « calcul ».
    const h2 = new HoteWorker({ creer: () => { throw new Error("jamais"); }, delaiMs: 1000, workerDisponible: () => false, direct: () => { throw new Error("refus"); } });
    await expect(h2.demander("x", 0)).rejects.toMatchObject({ code: "calcul", message: "refus" });
    // Sans Worker ni exécution directe : indisponible.
    const h3 = new HoteWorker({ creer: () => { throw new Error("jamais"); }, delaiMs: 1000, workerDisponible: () => false });
    await expect(h3.demander("x", 0)).rejects.toMatchObject({ code: "indisponible" });
  });

  it("arrêt explicite : demandes rejetées, Worker arrêté, recréé à la demande suivante", async () => {
    const h = hote();
    const a = h.demander("x", 1);
    const w1 = dernier();
    h.arreter();
    await expect(a).rejects.toMatchObject({ code: "annulee" });
    expect(w1.termine).toBe(true);
    void h.demander("x", 2);
    expect(dernier()).not.toBe(w1);
    expect(h.creations).toBe(2);
  });
});
