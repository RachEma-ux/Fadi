/** BD-7.2 (chantier base-donnees, constat A3) : persistance du stockage demandée une fois, échec toléré. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { demanderPersistanceStockage, reinitialiserPersistanceStockage } from "./persistance-stockage";

afterEach(() => reinitialiserPersistanceStockage());

describe("BD-7.2 — demanderPersistanceStockage", () => {
  it("demande la persistance une seule fois (idempotent)", async () => {
    const persist = vi.fn(async () => true);
    const storage = { persisted: async () => false, persist };
    expect(await demanderPersistanceStockage(storage)).toBe(true);
    expect(await demanderPersistanceStockage(storage)).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it("ne redemande pas un stockage déjà persistant", async () => {
    const persist = vi.fn(async () => true);
    expect(await demanderPersistanceStockage({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
  it("un refus, une erreur ou une API absente rendent faux sans lever", async () => {
    expect(await demanderPersistanceStockage({ persisted: async () => false, persist: async () => false })).toBe(false);
    reinitialiserPersistanceStockage();
    expect(await demanderPersistanceStockage({ persist: async () => { throw new Error("refus"); } })).toBe(false);
    reinitialiserPersistanceStockage();
    expect(await demanderPersistanceStockage(undefined)).toBe(false);
  });
});
