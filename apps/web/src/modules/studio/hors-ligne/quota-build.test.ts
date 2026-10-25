/**
 * TR-EX-044 / EX-044 — versions du cache : correspondance buildId ↔ contrat des commandes ↔ schéma enregistrée dans la
 * file locale ; mise à jour du build avec une file en attente (conservée, rejouable, signalée) ; contrat incompatible :
 * résolution explicite, aucune purge silencieuse ; quota atteint : éviction des seules versions lues en cache (jamais
 * un brouillon non synchronisé), erreur annoncée si la place manque encore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newStudioDocument, STUDIO_CONTRACT, STUDIO_MANIFESTE_OUTILS_VERSION, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { localStore, type StudioBrouillonEntry } from "../../../lib/local-store";
import { appliquerBrouillon, creerBrouillon } from "../planche2d/brouillon";
import { migrerBrouillon } from "./contrats";
import { cleVariante, versHorsLigne } from "./persistance";
import { estErreurQuota, planEviction } from "./quota";
import { ecrireBrouillonHorsLigne, ErreurFileLocale, lireBrouillonHorsLigne } from "./stockage";

const ligne = (id: string): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } });
const ctx: StudioContext = { study: { id: "s", name: "É", projectId: "p" }, variant: { id: "v", name: "V", studyId: "s", headRevisionId: "r1" }, revision: { id: "r1", parentRevisionId: null, document: newStudioDocument("d") }, canWrite: true };
const cle = cleVariante("A", "p", "s", "v");
const pageDuBuild = (build: string) => vi.stubGlobal("document", { querySelector: () => ({ getAttribute: () => build }) });
const quota = () => Object.assign(new Error("plein"), { name: "QuotaExceededError" });

const disque = new Map<string, StudioBrouillonEntry>();
beforeEach(() => {
  disque.clear();
  vi.spyOn(localStore, "studioBrouillon").mockImplementation(async (k, u) => { const e = disque.get(k); return e && e.userId === u ? e : null; });
  vi.spyOn(localStore, "studioEcrireBrouillonSi").mockImplementation(async (e) => { disque.set(e.cle, e); return true; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("TR-EX-044 — buildId de la file locale et mise à jour du build", () => {
  it("la file enregistre build, contrat des commandes, schéma du document et manifeste ; relue par le même build, rien n'est signalé", async () => {
    pageDuBuild("build-A");
    const h = versHorsLigne("A", ctx, appliquerBrouillon(creerBrouillon(ctx.revision.document), [ligne("l1")]), null, 0, null);
    expect(h.contrats).toEqual({ build: "build-A", commandes: STUDIO_CONTRACT, document: "studio-document/1", manifeste: STUDIO_MANIFESTE_OUTILS_VERSION });
    await ecrireBrouillonHorsLigne(cle, h, null);
    expect(JSON.parse(disque.get(cle)!.donnees).contrats.build).toBe("build-A");
    const lu = await lireBrouillonHorsLigne(cle, "A");
    expect(lu?.autreBuild).toBeUndefined();
    expect(lu?.brouillon.contrats?.build).toBe("build-A");
  });

  it("mise à jour du build avec une file en attente : relue par le nouveau build, conservée intacte et rejouable, l'ancien build signalé", async () => {
    pageDuBuild("build-A");
    await ecrireBrouillonHorsLigne(cle, versHorsLigne("A", ctx, appliquerBrouillon(creerBrouillon(ctx.revision.document), [ligne("l1"), ligne("l2")]), null, 0, null), null);
    const ligneAvant = disque.get(cle)!.donnees;
    pageDuBuild("build-B");
    const lu = await lireBrouillonHorsLigne(cle, "A");
    expect(lu?.autreBuild).toBe("build-A");
    expect(lu?.brouillon.pas.flat().map((c) => (c.params as { id: string }).id)).toEqual(["l1", "l2"]);
    expect(disque.get(cle)!.donnees).toBe(ligneAvant);
  });

  it("cas négatif : ancien contrat incompatible (format futur, outil hors contrat) — résolution explicite, la ligne n'est jamais purgée", async () => {
    pageDuBuild("build-B");
    disque.set(cle, { cle, userId: "A", projectId: "p", stamp: "s1", donnees: JSON.stringify({ version: 99 }), majA: "t" });
    await expect(lireBrouillonHorsLigne(cle, "A")).rejects.toBeInstanceOf(ErreurFileLocale);
    expect(disque.has(cle)).toBe(true);
    expect(migrerBrouillon(JSON.stringify({ version: 99 }))).toMatchObject({ type: "incompatible", raison: "version-future" });
  });
});

describe("TR-EX-044 — quota de stockage : éviction et erreur traitées", () => {
  it("quota atteint : les versions lues en cache (sauf celle de la variante ouverte) sont évincées, les plus anciennes d'abord, puis le brouillon est écrit", async () => {
    pageDuBuild("build-A");
    let essais = 0;
    vi.spyOn(localStore, "studioEcrireBrouillonSi").mockImplementation(async (e) => { if (essais++ === 0) throw new Error("persistance", { cause: { name: "DexieError", inner: quota() } }); disque.set(e.cle, e); return true; });
    vi.spyOn(localStore, "studioContextesDe").mockResolvedValue([{ cle: "A|p|s|x", luA: "2026-10-02" }, { cle, luA: "2026-10-01" }, { cle: "A|p|s|w", luA: "2026-10-01" }]);
    const evinces: string[] = [];
    vi.spyOn(localStore, "studioSupprimerContexte").mockImplementation(async (k) => { evinces.push(k); return true; });
    const r = await ecrireBrouillonHorsLigne(cle, versHorsLigne("A", ctx, appliquerBrouillon(creerBrouillon(ctx.revision.document), [ligne("l1")]), null, 0, null), null);
    expect(r).toMatchObject({ type: "ecrit", evinces: 2 });
    expect(evinces).toEqual(["A|p|s|w", "A|p|s|x"]);
    expect(disque.has(cle)).toBe(true);
  });

  it("quota toujours atteint après l'éviction : erreur « quota » rendue à l'interface, aucun brouillon effacé, rien d'autre que les versions lues touché", async () => {
    pageDuBuild("build-A");
    disque.set("A|p|s|autre", { cle: "A|p|s|autre", userId: "A", projectId: "p", stamp: "s", donnees: "{}", majA: "t" });
    vi.spyOn(localStore, "studioEcrireBrouillonSi").mockRejectedValue(quota());
    vi.spyOn(localStore, "studioContextesDe").mockResolvedValue([{ cle: "A|p|s|x", luA: "2026-10-02" }]);
    vi.spyOn(localStore, "studioSupprimerContexte").mockResolvedValue(true);
    const supprimerBrouillon = vi.spyOn(localStore, "studioSupprimerBrouillonSi");
    expect(await ecrireBrouillonHorsLigne(cle, versHorsLigne("A", ctx, appliquerBrouillon(creerBrouillon(ctx.revision.document), [ligne("l1")]), null, 0, null), null)).toEqual({ type: "quota", evinces: 1 });
    expect(supprimerBrouillon).not.toHaveBeenCalled();
    expect(disque.has("A|p|s|autre")).toBe(true);
    // Une autre erreur que le quota n'est pas déguisée.
    vi.spyOn(localStore, "studioEcrireBrouillonSi").mockRejectedValue(new Error("disque"));
    await expect(ecrireBrouillonHorsLigne(cle, versHorsLigne("A", ctx, creerBrouillon(ctx.revision.document), null, 0, { headRevisionId: null, at: "t" }), null)).rejects.toThrow("disque");
  });

  it("politique : jamais la variante ouverte ; reconnaissance du dépassement enveloppé", () => {
    expect(planEviction([{ cle: "a", luA: "2" }, { cle: "b", luA: "1" }, { cle: "c", luA: "0" }], new Set(["c"]))).toEqual(["b", "a"]);
    expect(estErreurQuota({ name: "AbortError", inner: { name: "QuotaExceededError" } })).toBe(true);
    expect(estErreurQuota({ code: 22 })).toBe(true);
    expect(estErreurQuota(new Error("x"))).toBe(false);
  });
});
