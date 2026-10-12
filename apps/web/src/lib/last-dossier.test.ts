import { afterEach, describe, expect, it, vi } from "vitest";
import { dossierChoiceIsPersisted, parseDossierVisit, rememberedStep, rememberedWork, rememberDossier } from "./last-dossier";

afterEach(() => vi.unstubAllGlobals());
describe("explicit dossier consultation", () => {
  it("rejects corrupt preferences and invalid identifiers, never inventing a default dossier", () => {
    for (const raw of [null, "{}", "oops", JSON.stringify({ projectId: "../../other", consultedAt: new Date().toISOString() }), JSON.stringify({ projectId: "proj_1", consultedAt: "yesterday" })]) expect(parseDossierVisit(raw)).toBeNull();
    expect(parseDossierVisit(JSON.stringify({ projectId: "proj_1", consultedAt: "2026-10-12T20:00:00Z", step: 22 }))?.step).toBeNull();
  });
  it("retains each dossier’s own step when switching dossiers and keeps accounts isolated", () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    rememberDossier("alice-test", "proj_a", 9);
    rememberDossier("alice-test", "proj_b", 13);
    rememberDossier("alice-test", "proj_a");
    const last = parseDossierVisit(saved.get("fadi.lastDossier.v1:alice-test") ?? null);
    expect(last?.projectId).toBe("proj_a");
    expect(last?.step).toBe(9);
    expect(rememberedStep("alice-test", "proj_b")).toBe(13);
    expect(rememberedStep("bob-test", "proj_a")).toBeNull();
    expect(dossierChoiceIsPersisted("alice-test")).toBe(true);
  });
  it("keeps the current tab usable and discloses an unconfirmed persistence", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } });
    expect(() => rememberDossier("quota-test", "proj_quota", 4)).not.toThrow();
    expect(rememberedStep("quota-test", "proj_quota")).toBe(4);
    expect(dossierChoiceIsPersisted("quota-test")).toBe(false);
  });
  it("resumes only explicitly visited work, retaining it on Home and isolating each dossier and account", () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    rememberDossier("work-alice", "proj_a", undefined, "programme");
    rememberDossier("work-alice", "proj_b", 11, "review");
    rememberDossier("work-alice", "proj_a");
    expect(parseDossierVisit(saved.get("fadi.lastDossier.v1:work-alice") ?? null)?.currentWork).toBe("programme");
    expect(rememberedWork("work-alice", "proj_b")).toBe("review");
    expect(rememberedWork("work-bob", "proj_a")).toBeNull();
    rememberDossier("work-alice", "proj_a", 9, "parcours");
    expect(rememberedWork("work-alice", "proj_a")).toBe("parcours");
    expect(parseDossierVisit(JSON.stringify({ projectId: "proj_a", consultedAt: "2026-10-12T20:00:00Z", currentWork: "https://example.com" }))?.currentWork).toBeNull();
  });
});
