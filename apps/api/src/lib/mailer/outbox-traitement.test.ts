import { describe, expect, it, vi } from "vitest";
vi.mock("../../db/client.js", () => ({ db: {} }));
import { traiterFile, type OperationsFile } from "./outbox.js";

type Ligne = Parameters<OperationsFile["envoyer"]>[0];
const ligne = (id: string) => ({ id, attempts: 0 }) as unknown as Ligne;

function file(ids: string[], echecs: Set<string> = new Set()) {
  const journal: string[] = [];
  const restantes = [...ids];
  let enTransaction = false;
  const ops: OperationsFile = {
    reclamer: async () => { enTransaction = true; journal.push("reclamer"); const id = restantes.shift(); enTransaction = false; return id ? ligne(id) : null; },
    envoyer: async (r) => { journal.push(`envoyer:${r.id}:${enTransaction ? "en-transaction" : "hors-transaction"}`); if (echecs.has(r.id)) throw new Error("smtp injoignable"); },
    marquerEnvoye: async (r) => { journal.push(`envoye:${r.id}`); },
    marquerEchec: async (r, e) => { journal.push(`echec:${r.id}:${(e as Error).message}`); },
  };
  return { ops, journal };
}

describe("BD-4.7 — file de courriels : envoi hors transaction", () => {
  it("réclame, envoie hors transaction, puis enregistre ; s'arrête quand la file est vide", async () => {
    const { ops, journal } = file(["m1", "m2"]);
    await expect(traiterFile(ops)).resolves.toBe(2);
    expect(journal).toEqual(["reclamer", "envoyer:m1:hors-transaction", "envoye:m1", "reclamer", "envoyer:m2:hors-transaction", "envoye:m2", "reclamer"]);
  });
  it("un échec d'envoi est enregistré et n'arrête pas les messages suivants", async () => {
    const { ops, journal } = file(["m1", "m2"], new Set(["m1"]));
    await expect(traiterFile(ops)).resolves.toBe(2);
    expect(journal).toContain("echec:m1:smtp injoignable");
    expect(journal).toContain("envoye:m2");
    expect(journal).not.toContain("envoye:m1");
  });
  it("respecte la limite par passage", async () => {
    const { ops } = file(["a", "b", "c"]);
    await expect(traiterFile(ops, 2)).resolves.toBe(2);
  });
});
