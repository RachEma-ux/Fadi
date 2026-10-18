import { describe, expect, it, vi } from "vitest";
// Aucun client, serveur, moteur exact ou SQL réel chargé par ces tests d'ordre/refus.
vi.mock("../db/client.js", () => ({ db: {} }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));
import { orchestrerCommandesDansTransaction, type CommandExecutionScope, type ScopedCommandHandler, type Tx } from "../lib/atelier-validation.js";

const tx = Object.freeze({}) as Tx;
const scopes: CommandExecutionScope[] = [{ kind: "atelier", projectId: "p" }, { kind: "studio", projectId: "p", studyId: "s", variantId: "v" }];
for (const scope of scopes) describe(`orchestrateur commun ${scope.kind}, transport simulé`, () => {
  function handler(replay: string | undefined) {
    return {
      prepare: vi.fn(async () => undefined), replay: vi.fn(async () => replay), execute: vi.fn(async () => "created"),
    } satisfies ScopedCommandHandler<string>;
  }
  it("vérifie droits/verrous avant rejeu et ne réexécute pas une demande confirmée", async () => {
    const h = handler("historical");
    await expect(orchestrerCommandesDansTransaction(tx, scope, h)).resolves.toBe("historical");
    expect(h.prepare.mock.invocationCallOrder[0]).toBeLessThan(h.replay.mock.invocationCallOrder[0]!);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("une nouvelle demande exécute seulement après droits et recherche de rejeu", async () => {
    const h = handler(undefined);
    await expect(orchestrerCommandesDansTransaction(tx, scope, h)).resolves.toBe("created");
    expect(h.prepare.mock.invocationCallOrder[0]).toBeLessThan(h.replay.mock.invocationCallOrder[0]!);
    expect(h.replay.mock.invocationCallOrder[0]).toBeLessThan(h.execute.mock.invocationCallOrder[0]!);
  });
  it("refuse avant toute recherche de rejeu ou écriture si les droits ne passent pas", async () => {
    const h = handler("historical"); h.prepare.mockRejectedValueOnce(new Error("denied"));
    await expect(orchestrerCommandesDansTransaction(tx, scope, h)).rejects.toThrow("denied");
    expect(h.replay).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled();
  });
  it("ne modifie rien si le requestId est divergent", async () => {
    const h = handler(undefined); h.replay.mockRejectedValueOnce(new Error("request_conflict"));
    await expect(orchestrerCommandesDansTransaction(tx, scope, h)).rejects.toThrow("request_conflict");
    expect(h.execute).not.toHaveBeenCalled();
  });
});
it("capture et fige le scope avant l'attente des droits", async () => {
  const mutable: CommandExecutionScope = { kind: "studio", projectId: "p", studyId: "s", variantId: "v" };
  await orchestrerCommandesDansTransaction(tx, mutable, {
    prepare: async (_tx, captured) => { mutable.projectId = "other"; expect(Reflect.set(captured, "projectId", "forged")).toBe(false); },
    replay: async (_tx, captured) => { expect(captured.projectId).toBe("p"); return undefined; },
    execute: async (_tx, captured) => { expect(captured.projectId).toBe("p"); return "ok"; },
  });
});
