import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Faux Worker : enregistre les messages envoyés et laisse le test émettre réponses et erreurs. */
class FauxWorker {
  static instances: FauxWorker[] = [];
  readonly envoyes: { id: number; nature: string }[] = [];
  termine = false;
  private ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  constructor() { FauxWorker.instances.push(this); }
  addEventListener(type: string, f: (e: unknown) => void) { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  postMessage(m: { id: number; nature: string }) { this.envoyes.push(m); }
  terminate() { this.termine = true; }
  emettre(type: string, data?: unknown) { for (const f of this.ecouteurs.get(type) ?? []) f({ data }); }
  repondre(valeur: unknown, n = this.envoyes.length - 1) { this.emettre("message", { id: this.envoyes[n]!.id, valeur }); }
}

type Module = typeof import("./moteur-exact");
async function charger(): Promise<Module> {
  vi.resetModules();
  return import("./moteur-exact");
}

beforeEach(() => {
  FauxWorker.instances = [];
  vi.stubGlobal("Worker", FauxWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("noyau exact — reprise après échec du Worker (#173)", () => {
  it("réponse normale : la demande est résolue, aucun Worker supplémentaire", async () => {
    const m = await charger();
    const p = m.apercuExact({ type: "extrusion" });
    FauxWorker.instances[0]!.repondre({ volume: 1 });
    await expect(p).resolves.toEqual({ volume: 1 });
    expect(FauxWorker.instances).toHaveLength(1);
  });

  it("erreur fatale : les demandes en cours sont rejetées, la suivante crée un nouveau Worker et réussit", async () => {
    const m = await charger();
    const a = m.apercuExact({});
    const b = m.stepExact("QlJFUA==");
    const w1 = FauxWorker.instances[0]!;
    w1.emettre("error");
    await expect(a).rejects.toThrow(/interrompu/);
    await expect(b).rejects.toThrow(/interrompu/);
    expect(w1.termine).toBe(true);
    expect(m.etatNoyauExact()).toBe("echec");
    const c = m.apercuExact({});
    expect(FauxWorker.instances).toHaveLength(2);
    FauxWorker.instances[1]!.repondre({ volume: 2 });
    await expect(c).resolves.toEqual({ volume: 2 });
    expect(m.etatNoyauExact()).toBe("ok");
  });

  it("réponse illisible (messageerror) : même traitement qu'une erreur fatale", async () => {
    const m = await charger();
    const a = m.apercuExact({});
    FauxWorker.instances[0]!.emettre("messageerror");
    await expect(a).rejects.toThrow(/illisible/);
    void m.apercuExact({}).catch(() => {});
    expect(FauxWorker.instances).toHaveLength(2);
  });

  it("demande sans réponse : rejet au délai, Worker arrêté puis recréé ; la réponse tardive de l'ancien est ignorée", async () => {
    vi.useFakeTimers();
    const m = await charger();
    const a = m.apercuExact({});
    const w1 = FauxWorker.instances[0]!;
    const rejet = expect(a).rejects.toThrow(/pas répondu à temps/);
    vi.advanceTimersByTime(m.DELAI_OPERATION_MS);
    await rejet;
    expect(w1.termine).toBe(true);
    const b = m.apercuExact({});
    const w2 = FauxWorker.instances[1]!;
    w1.repondre({ volume: 99 }, 0);
    w2.repondre({ volume: 3 });
    await expect(b).resolves.toEqual({ volume: 3 });
  });

  it("une réponse dans le délai n'est jamais rejetée par le minuteur", async () => {
    vi.useFakeTimers();
    const m = await charger();
    const a = m.apercuExact({});
    FauxWorker.instances[0]!.repondre({ volume: 1 });
    await expect(a).resolves.toEqual({ volume: 1 });
    vi.advanceTimersByTime(m.DELAI_OPERATION_MS * 2);
    expect(FauxWorker.instances[0]!.termine).toBe(false);
  });

  it("le chargement a son propre délai, plus long que celui d'une opération", async () => {
    vi.useFakeTimers();
    const m = await charger();
    const p = m.chargerNoyauExact();
    vi.advanceTimersByTime(m.DELAI_OPERATION_MS);
    expect(FauxWorker.instances[0]!.termine).toBe(false);
    const rejet = expect(p).rejects.toThrow(/pas répondu à temps/);
    vi.advanceTimersByTime(m.DELAI_CHARGEMENT_MS - m.DELAI_OPERATION_MS);
    await rejet;
    expect(m.etatNoyauExact()).toBe("echec");
  });

  it(`après ${3} échecs consécutifs : indisponible pour la session, plus aucun Worker créé`, async () => {
    const m = await charger();
    for (let i = 0; i < m.ECHECS_MAX; i++) {
      const p = m.apercuExact({});
      FauxWorker.instances[i]!.emettre("error");
      await expect(p).rejects.toThrow();
    }
    await expect(m.apercuExact({})).rejects.toThrow(/rechargez la page/);
    expect(FauxWorker.instances).toHaveLength(m.ECHECS_MAX);
  });

  it("une réponse réussie remet le compteur d'échecs à zéro", async () => {
    const m = await charger();
    const echouer = async (i: number) => { const p = m.apercuExact({}); FauxWorker.instances[i]!.emettre("error"); await expect(p).rejects.toThrow(); };
    await echouer(0);
    await echouer(1);
    const ok = m.apercuExact({});
    FauxWorker.instances[2]!.repondre({ volume: 1 });
    await ok;
    await echouer(2);
    await echouer(3);
    void m.apercuExact({}).catch(() => {});
    expect(FauxWorker.instances).toHaveLength(5);
  });

  it("erreur de calcul renvoyée par le Worker : seule la demande est rejetée, le Worker reste en service", async () => {
    const m = await charger();
    const a = m.apercuExact({});
    const w = FauxWorker.instances[0]!;
    w.emettre("message", { id: w.envoyes[0]!.id, erreur: "profil non fermé" });
    await expect(a).rejects.toThrow("profil non fermé");
    expect(w.termine).toBe(false);
    void m.apercuExact({}).catch(() => {});
    expect(FauxWorker.instances).toHaveLength(1);
  });

  it("sans Web Worker : message d'origine, aucun essai de création", async () => {
    vi.stubGlobal("Worker", undefined);
    const m = await charger();
    await expect(m.apercuExact({})).rejects.toThrow("Web Worker requis");
    expect(m.etatNoyauExact()).toBe("echec");
  });
});
