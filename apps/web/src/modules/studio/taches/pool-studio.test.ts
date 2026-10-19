/**
 * Ordonnanceur sur un groupe d'hôtes de Worker (faux Workers) : Workers réutilisés (D.3-04), plantage → Worker relancé
 * et tâche reprise une fois puis résolue explicitement, délai de l'hôte → timed-out, transferts sûrs (D.3-01).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoteWorker, type DemandeWorker } from "../workers/hote-worker";
import { brancher, type PorteeWorker } from "../workers/protocole";
import { Ordonnanceur, type DemandeTache } from "./ordonnanceur";
import { executeurHotes, versErreurTache } from "./pool-studio";
import { assurerPossede, ErreurTransfert, estTransfere, posterAvecTransfert, preparerTransfert } from "./transferts";
import { ErreurHote } from "../workers/hote-worker";

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

function groupe(n = 2) {
  FauxWorker.instances = [];
  const hotes = Array.from({ length: n }, () => new HoteWorker({ creer: () => new FauxWorker() as unknown as Worker, delaiMs: 1000, workerDisponible: () => true }));
  const ord = new Ordonnanceur({ executer: executeurHotes(hotes), delaiMs: 1000, concurrence: n });
  return { hotes, ord };
}
const dem = (cle: string, revision = "1", extra: Partial<DemandeTache> = {}): DemandeTache =>
  ({ cle, classe: "fond", nature: "x", charge: revision, empreinte: { revision, parametres: "p" }, ...extra });
const flush = () => new Promise((r) => setTimeout(r, 0));
const dernier = () => FauxWorker.instances[FauxWorker.instances.length - 1]!;

afterEach(() => { vi.useRealTimers(); });

describe("groupe de Workers sous l'ordonnanceur", () => {
  it("Workers réutilisés : tâches successives sur le même emplacement, un seul Worker créé", async () => {
    const { hotes, ord } = groupe();
    for (const r of ["1", "2", "3"]) {
      const p = ord.soumettre(dem("m", r));
      dernier().repondre(`v${r}`);
      await expect(p.issue).resolves.toEqual({ etat: "done", valeur: `v${r}` });
    }
    expect(FauxWorker.instances).toHaveLength(1);
    expect(hotes[0]!.creations).toBe(1);
    expect(hotes[1]!.creations).toBe(0);
  });

  it("plantage du Worker : Worker relancé, la tâche reprise une fois aboutit ; résultat remis une seule fois", async () => {
    const { ord } = groupe(1);
    const remis: unknown[] = [];
    const p = ord.soumettre(dem("m", "1", { surResultat: (v) => remis.push(v) }));
    const w1 = dernier();
    w1.emettre("error");
    await flush();
    expect(w1.termine).toBe(true);
    const w2 = dernier();
    expect(w2).not.toBe(w1);
    expect(w2.envoyes).toHaveLength(1);
    w1.repondre("ancien Worker", 0);
    w2.repondre("ok");
    await expect(p.issue).resolves.toEqual({ etat: "done", valeur: "ok" });
    expect(remis).toEqual(["ok"]);
    expect(p.tache.tentatives).toBe(2);
  });

  it("deux plantages : échec explicite ; la tâche suivante repart sur un Worker neuf", async () => {
    const { ord } = groupe(1);
    const p = ord.soumettre(dem("m"));
    dernier().emettre("error");
    await flush();
    dernier().emettre("messageerror");
    await expect(p.issue).resolves.toMatchObject({ etat: "failed", code: "plantage" });
    const q = ord.soumettre(dem("q"));
    expect(FauxWorker.instances).toHaveLength(3);
    dernier().repondre("q");
    await expect(q.issue).resolves.toEqual({ etat: "done", valeur: "q" });
  });

  it("document qui fait toujours planter le Worker : un seul échec compté par soumission (reprise non comptée), repli seulement à la troisième", async () => {
    const { hotes, ord } = groupe(1);
    const planterDeuxFois = async () => {
      const p = ord.soumettre(dem("m", String(Math.random())));
      dernier().emettre("error");
      await flush();
      dernier().emettre("error");
      await expect(p.issue).resolves.toMatchObject({ etat: "failed", code: "plantage" });
    };
    await planterDeuxFois();
    await planterDeuxFois();
    // Sans la règle, quatre échecs auraient déjà abandonné le Worker (trois au plus).
    expect(hotes[0]!.indisponible).toBe(false);
    const p = ord.soumettre(dem("m", "3"));
    dernier().emettre("error");
    await flush();
    expect(hotes[0]!.indisponible).toBe(true);
    await expect(p.issue).resolves.toMatchObject({ etat: "failed", code: "indisponible" });
  });

  it("un plantage sur un emplacement n'affecte pas la tâche de l'autre emplacement", async () => {
    const { ord } = groupe(2);
    const fond = ord.soumettre(dem("m"));
    const apercu = ord.soumettre({ ...dem("f"), classe: "interactive" });
    const [wFond, wApercu] = FauxWorker.instances;
    wFond!.emettre("error");
    await flush();
    wApercu!.repondre("feuille");
    await expect(apercu.issue).resolves.toEqual({ etat: "done", valeur: "feuille" });
    dernier().repondre("maillage");
    await expect(fond.issue).resolves.toEqual({ etat: "done", valeur: "maillage" });
  });

  it("délai de l'hôte : timed-out, Worker arrêté puis relancé à la tâche suivante", async () => {
    vi.useFakeTimers();
    const { ord } = groupe(1);
    const p = ord.soumettre(dem("m", "1", { delaiMs: 50 }));
    const w1 = dernier();
    await vi.advanceTimersByTimeAsync(50);
    await expect(p.issue).resolves.toEqual({ etat: "timed-out" });
    expect(w1.termine).toBe(true);
    ord.soumettre(dem("m", "2"));
    expect(dernier()).not.toBe(w1);
  });

  it("annulation ferme : le Worker est arrêté (sans compter d'échec) ; remplacement : il continue", async () => {
    const { hotes, ord } = groupe(1);
    const a = ord.soumettre(dem("m", "1"));
    ord.soumettre(dem("m", "2"));
    expect(dernier().termine).toBe(false);
    await expect(a.issue).resolves.toEqual({ etat: "cancelled" });
    const c = new AbortController();
    ord.soumettre(dem("dxf", "1", { signal: c.signal }));
    dernier().repondre("v1 périmé", 0);
    await flush();
    dernier().repondre("v2");
    await flush();
    c.abort();
    expect(dernier().termine).toBe(true);
    expect(hotes[0]!.indisponible).toBe(false);
  });

  it("erreurs de l'hôte converties en codes de tâche", () => {
    expect(versErreurTache(new ErreurHote("interrompu", "x")).code).toBe("plantage");
    expect(versErreurTache(new ErreurHote("illisible", "x")).code).toBe("plantage");
    expect(versErreurTache(new ErreurHote("delai", "x")).code).toBe("delai");
    expect(versErreurTache(new ErreurHote("remplacee", "x")).code).toBe("annulee");
    expect(versErreurTache(new ErreurHote("indisponible", "x")).code).toBe("indisponible");
    expect(versErreurTache(new Error("x")).code).toBe("calcul");
  });
});

describe("tampons transférables (D.3-01)", () => {
  it("propriété affirmée avant le transfert, usage interdit après ; doublons retirés ; tampon détaché refusé", () => {
    const b = new ArrayBuffer(8);
    expect(preparerTransfert([b, b])).toEqual([b]);
    const recus: { m: unknown; t: Transferable[] }[] = [];
    posterAvecTransfert((m, t) => { recus.push({ m: structuredClone(m, { transfer: t }), t }); }, { id: 1 }, [b]);
    expect(recus[0]!.t).toEqual([b]);
    expect(estTransfere(b)).toBe(true);
    expect(b.byteLength).toBe(0);
    expect(() => assurerPossede(b)).toThrow(ErreurTransfert);
    expect(() => preparerTransfert([b])).toThrow(ErreurTransfert);
    expect(() => preparerTransfert([new Uint8Array(2)])).toThrow(ErreurTransfert);
    // Même sans détachement réel (portée simulée), le tampon est marqué transféré.
    const c = new ArrayBuffer(4);
    posterAvecTransfert(() => {}, null, [c]);
    expect(() => assurerPossede(c)).toThrow(ErreurTransfert);
  });

  it("côté Worker : le PDF est transféré une seule fois ; un tampon déjà transféré donne une erreur de calcul, pas un plantage", async () => {
    const recus: unknown[] = [];
    const portee: PorteeWorker = { onmessage: null, postMessage: (m, t) => { recus.push(structuredClone(m, { transfer: t ?? [] })); } };
    const partage = new ArrayBuffer(4);
    brancher(portee, { t: { executer: () => partage, transfert: (v: ArrayBuffer) => [v] } });
    await portee.onmessage!({ data: { id: 1, nature: "t", charge: null } } as MessageEvent<DemandeWorker>);
    expect(recus.at(-1)).toMatchObject({ id: 1 });
    await portee.onmessage!({ data: { id: 2, nature: "t", charge: null } } as MessageEvent<DemandeWorker>);
    expect(recus.at(-1)).toEqual({ id: 2, erreur: "Tampon déjà transféré : il n'appartient plus à ce fil." });
  });
});
