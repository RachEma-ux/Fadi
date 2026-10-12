import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, type ParcoursStep } from "./api";
import { adoptStep, canReplayFieldConflict, conflictsStore, isProjectPendingMutation, MUTATION_KEYS, recordConflict, recordConflictRetryFailure, resumeProjectMutations } from "./mutations";
import { reachability } from "./reachability";

const clients: QueryClient[] = [];
function queryClient(): QueryClient { const client = new QueryClient();clients.push(client);return client; }
const pending = (projectId: string, paused = true) => ({ options: { mutationKey: MUTATION_KEYS.stepPatch }, state: { variables: { projectId }, status: "pending", isPaused: paused }, continue: vi.fn().mockResolvedValue(undefined) });
beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } });
  vi.stubGlobal("navigator", { onLine: true });
  vi.spyOn(reachability, "get").mockReturnValue("reachable");
  conflictsStore.clearAll();
});
afterEach(() => { for (const client of clients.splice(0)) client.clear();vi.restoreAllMocks();vi.unstubAllGlobals(); });

describe("mutations et conflits propres à un dossier", () => {
  it("interdit une reprise dont les valeurs serveur manquent, au lieu d'envoyer une précondition vide", () => {
    const conflict = { stepNumber: 1, attempted: { surface: 20, usage: "atelier" }, current: null };
    expect(canReplayFieldConflict(conflict)).toBe(false);
    expect(canReplayFieldConflict({ ...conflict, current: { surface: 10 } })).toBe(false);
    expect(canReplayFieldConflict({ ...conflict, current: { surface: 10, usage: "logement" } })).toBe(true);
  });
  it("compte uniquement les écritures en cours du projet demandé", () => {
    expect(isProjectPendingMutation(pending("a"), "a")).toBe(true);
    expect(isProjectPendingMutation(pending("b"), "a")).toBe(false);
    expect(isProjectPendingMutation({ ...pending("a"), state: { status: "pending", isPaused: true, variables: {} } }, "a")).toBe(false);
    expect(isProjectPendingMutation({ ...pending("a"), state: { ...pending("a").state, status: "success" } }, "a")).toBe(false);
    expect(isProjectPendingMutation(pending("a", false), "a")).toBe(true);
  });
  it("la synchronisation manuelle ne réveille que les mutations en pause de ce dossier", async () => {
    const a = pending("a"), b = pending("b"), running = pending("a", false);
    const cache = { getMutationCache: () => ({ getAll: () => [a, b, running] }) } as unknown as QueryClient;
    await resumeProjectMutations(cache, "a");
    expect(a.continue).toHaveBeenCalledOnce();
    expect(b.continue).not.toHaveBeenCalled();
    expect(running.continue).not.toHaveBeenCalled();
  });
  it("ne reprend pas une mutation sans réseau du navigateur ou sans réponse du serveur", async () => {
    const a = pending("a"), cache = { getMutationCache: () => ({ getAll: () => [a] }) } as unknown as QueryClient;
    vi.mocked(reachability.get).mockReturnValue("unreachable");await resumeProjectMutations(cache, "a");
    vi.mocked(reachability.get).mockReturnValue("reachable");vi.stubGlobal("navigator", { onLine: false });await resumeProjectMutations(cache, "a");
    expect(a.continue).not.toHaveBeenCalled();
  });
  it("une reprise réseau ou interdite conserve l'ancien conflit et la saisie", () => {
    const client = queryClient();
    recordConflict(client, "a", new ApiError(409, "conflict", "Première version", { current: { surface: 10 } }), "Étape 01", 1, { attempted: { surface: 20 } });
    const previous = conflictsStore.get("a")[0]!;
    expect(recordConflictRetryFailure(client, "a", previous.id, new TypeError("offline"), "Étape 01", 1, { attempted: { surface: 20 } })).toBe(false);
    expect(recordConflictRetryFailure(client, "a", previous.id, new ApiError(403, "forbidden"), "Étape 01", 1, { attempted: { surface: 20 } })).toBe(false);
    expect(conflictsStore.get("a")).toEqual([previous]);
    expect(conflictsStore.get("b")).toEqual([]);
  });
  it("remplace un ancien conflit seulement par un nouveau refus effectivement reçu", () => {
    const client = queryClient();recordConflict(client, "a", new ApiError(409, "conflict"), "Étape 01", 1, { attempted: { surface: 20 } });
    const previousId = conflictsStore.get("a")[0]!.id;
    expect(recordConflictRetryFailure(client, "a", previousId, new ApiError(409, "conflict", "Nouvelle version", { current: { surface: 30 } }), "Étape 01", 1, { attempted: { surface: 20 } })).toBe(true);
    expect(conflictsStore.get("a")).toHaveLength(1);
    expect(conflictsStore.get("a")[0]).toMatchObject({ message: "Nouvelle version", current: { surface: 30 }, attempted: { surface: 20 } });
    expect(conflictsStore.get("a")[0]!.id).not.toBe(previousId);
  });
  it("invalide les lectures dérivées après acceptation et garde l'autre dossier intact", () => {
    const client = queryClient(), updated = { number: 2, status: "en-cours" } as ParcoursStep;
    const resources = ["steps", "design-review-status", "concept-preview", "programme", "documents", "project"];
    for (const resource of resources) for (const projectId of ["a", "b"]) client.setQueryData([resource, projectId], resource === "steps" ? [{ number: 2, status: "a-faire" }] : { projectId });
    client.setQueryData(["history", "user", "a"], []);client.setQueryData(["history", "user", "b"], []);
    expect(client.getQueryState(["design-review-status", "a"])!.isInvalidated).toBe(false);
    adoptStep(client, "a", updated);
    expect(client.getQueryData(["steps", "a"])).toEqual([updated]);
    for (const resource of resources) {
      expect(client.getQueryState([resource, "a"])!.isInvalidated).toBe(true);
      expect(client.getQueryState([resource, "b"])!.isInvalidated).toBe(false);
    }
    expect(client.getQueryState(["history", "user", "a"])!.isInvalidated).toBe(true);
    expect(client.getQueryState(["history", "user", "b"])!.isInvalidated).toBe(false);
  });
});
