import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { planificateurVolumes } from "./volumes-gc-planifie.js";
import type { BilanNettoyageVolumes } from "./volumes-gc.js";

const bilan = (supprimes = 0): BilanNettoyageVolumes => ({ examines: 0, references: 0, orphelins: supprimes, supprimes, octetsOrphelins: 0, essai: false });
const faux = {} as Pool;

afterEach(() => { vi.useRealTimers(); });

describe("BD-1.3 — ramasse-miettes des volumes hors requête", () => {
  it("une demande ne lance rien tout de suite ; le passage a lieu après le délai, une seule fois pour des demandes rapprochées", async () => {
    vi.useFakeTimers();
    const nettoyer = vi.fn(async () => bilan());
    const p = planificateurVolumes(faux, { delaiMs: 1_000, nettoyer, log: () => undefined });
    p.demander(); p.demander(); p.demander();
    expect(nettoyer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(nettoyer).toHaveBeenCalledTimes(1);
    p.arreter();
  });

  it("deux passages ne se chevauchent jamais ; une demande pendant un passage en relance un après", async () => {
    vi.useFakeTimers();
    let liberer: (() => void) | undefined;
    const nettoyer = vi.fn(() => new Promise<BilanNettoyageVolumes>((resolve) => { liberer = () => resolve(bilan()); }));
    const p = planificateurVolumes(faux, { delaiMs: 10, nettoyer, log: () => undefined });
    const premier = p.executerMaintenant();
    const second = p.executerMaintenant();
    expect(nettoyer).toHaveBeenCalledTimes(1);
    liberer!();
    await premier; await second;
    await vi.advanceTimersByTimeAsync(10);
    expect(nettoyer).toHaveBeenCalledTimes(2);
    p.arreter();
  });

  it("un échec est journalisé, ne lève pas et n'empêche pas le passage suivant", async () => {
    const lignes: string[] = [];
    const nettoyer = vi.fn().mockRejectedValueOnce(new Error("verrou occupé")).mockResolvedValueOnce(bilan(2));
    const p = planificateurVolumes(faux, { nettoyer, log: (l) => lignes.push(l) });
    await expect(p.executerMaintenant()).resolves.toBeNull();
    await expect(p.executerMaintenant()).resolves.toMatchObject({ supprimes: 2 });
    expect(lignes.map((l) => JSON.parse(l).message)).toEqual(["volumes-gc : verrou occupé", "volumes-gc"]);
  });

  it("le pool peut être fourni paresseusement et n'est lu qu'au passage", async () => {
    const lecteur = vi.fn(() => faux);
    const nettoyer = vi.fn(async () => bilan());
    const p = planificateurVolumes(lecteur, { nettoyer, log: () => undefined });
    expect(lecteur).not.toHaveBeenCalled();
    await p.executerMaintenant();
    expect(lecteur).toHaveBeenCalledTimes(1);
    expect(nettoyer).toHaveBeenCalledWith(faux);
  });

  it("après arrêt, une demande ne programme plus rien", async () => {
    vi.useFakeTimers();
    const nettoyer = vi.fn(async () => bilan());
    const p = planificateurVolumes(faux, { delaiMs: 10, nettoyer, log: () => undefined });
    p.arreter();
    p.demander();
    await vi.advanceTimersByTimeAsync(100);
    expect(nettoyer).not.toHaveBeenCalled();
  });
});
