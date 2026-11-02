import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * TR-EX-013 / TR-INV-003 (ADR-STUDIO-PILOTE-01, P-12), côté serveur : routeur Express réel et `lib/studio-*.ts` sur la
 * base simulée (`testing/studio-base-simulee.ts`, même montage que `studio-invariants.preuves-d2.test.ts`). La dérivation
 * d'une variante a deux modes : `version` (défaut, identifiants conservés) et `copie` (copie indépendante : nouvelles
 * identités, provenance par élément, aucune propagation dans un sens ni dans l'autre).
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import express from "express";
import request from "supertest";
import { STUDIO_CONTRACT, studioIdentitesDocument, studioIdentitesReutilisees, type StudioCommand, type StudioEnvelope } from "@parcours/atelier-model";
import { studioRevisions, studioVariants } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use(express.json());
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const enveloppe = (requestId: string, baseRevisionId: string, commands: StudioCommand[]): StudioEnvelope => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands });
const teteDe = (variantId: string) => banc.lignes.get(studioVariants)!.find((v) => v.id === variantId)!.headRevisionId as string;
const cmd = (toolId: string, params: unknown) => ({ toolId, params }) as StudioCommand;
const mur = { id: "m1", type: "wall", axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }], thickness: 0.2, height: 3, base: 0, justification: "center" };
const baie = { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 };

/** Variante source `v` complétée d'un mur et d'une ouverture (commandes réelles). */
async function sourceAvecMur() {
  const r = await post("proprietaire", `${S}/studies/s/variants/v/commands`, enveloppe("src-1", teteDe("v"), [cmd("studio.architecture.mur", mur), cmd("studio.architecture.ouverture", baie)]));
  expect(r.status).toBe(200);
  return (await get("proprietaire", `${S}/studies/s/variants/v`)).body;
}

beforeEach(initialiserProjet);

describe("TR-EX-013 / TR-INV-003 — dérivation de variante en copie indépendante (API)", () => {
  it("TR-EX-013 [+] mode copie : nouvelles identités et provenance par élément ; modifier la copie laisse la source inchangée, et réciproquement", async () => {
    const source = await sourceAvecMur();
    const c = await post("proprietaire", `${S}/studies/s/variants`, { name: "Copie", fromVariantId: "v", mode: "copie" });
    expect(c.status).toBe(201);
    const copie = c.body.revision.document;
    expect(c.body.derivedFrom).toMatchObject({ variantId: "v", revisionId: teteDe("v"), mode: "copie" });
    expect(studioIdentitesReutilisees(source.revision.document, copie)).toEqual([]);
    expect(Object.values(c.body.derivedFrom.identites as Record<string, string>).sort()).toEqual(studioIdentitesDocument(source.revision.document).sort());
    const idMur = Object.entries(c.body.derivedFrom.identites as Record<string, string>).find(([, a]) => a === "m1")![0];
    const idBaie = Object.entries(c.body.derivedFrom.identites as Record<string, string>).find(([, a]) => a === "o1")![0];
    expect(copie.architecture.find((a: { id: string }) => a.id === idBaie)).toMatchObject({ hostId: idMur });
    // La provenance se relit avec la variante ; la liste ne porte que le mode.
    const relue = await get("lecteur", `${S}/studies/s/variants/${c.body.variant.id}`);
    expect(relue.body.derivedFrom).toEqual(c.body.derivedFrom);
    const liste = await get("lecteur", `${S}/studies/s/variants`);
    expect(liste.body.variants.find((v: { id: string }) => v.id === c.body.variant.id).derivedFrom).toEqual({ variantId: "v", revisionId: teteDe("v"), mode: "copie" });
    // Modifier la copie : la source ne bouge pas.
    const avantSource = structuredClone((await get("proprietaire", `${S}/studies/s/variants/v`)).body.revision);
    const m = await post("proprietaire", `${S}/studies/s/variants/${c.body.variant.id}/commands`, enveloppe("copie-1", teteDe(c.body.variant.id), [cmd("studio.architecture.modifier", { ...baie, id: idBaie, hostId: idMur, width: 0.8 })]));
    expect(m.status).toBe(200);
    expect((await get("proprietaire", `${S}/studies/s/variants/v`)).body.revision).toEqual(avantSource);
    // Modifier la source : la copie ne bouge pas.
    const avantCopie = structuredClone((await get("proprietaire", `${S}/studies/s/variants/${c.body.variant.id}`)).body.revision);
    expect((await post("proprietaire", `${S}/studies/s/variants/v/commands`, enveloppe("src-2", teteDe("v"), [cmd("studio.architecture.modifier", { ...baie, width: 1.2 })]))).status).toBe(200);
    expect((await get("proprietaire", `${S}/studies/s/variants/${c.body.variant.id}`)).body.revision).toEqual(avantCopie);
  });

  it("TR-EX-013 [+] mode version (défaut) : la variante dérivée garde les identifiants d'objets, sans mode dans la provenance", async () => {
    const source = await sourceAvecMur();
    const c = await post("proprietaire", `${S}/studies/s/variants`, { name: "Version", fromVariantId: "v" });
    expect(c.status).toBe(201);
    expect(c.body.derivedFrom).toEqual({ variantId: "v", revisionId: teteDe("v") });
    expect(studioIdentitesDocument(c.body.revision.document)).toEqual(studioIdentitesDocument(source.revision.document));
    const v = await post("proprietaire", `${S}/studies/s/variants`, { name: "Version explicite", fromVariantId: "v", mode: "version" });
    expect(v.body.derivedFrom).toEqual({ variantId: "v", revisionId: teteDe("v") });
  });

  it("TR-INV-003 [−] l'ancien identifiant est sans prise sur la copie ; un mode sans source ou inconnu est refusé ; un rejeu d'un autre mode est un conflit, sans écriture", async () => {
    await sourceAvecMur();
    const c = await post("proprietaire", `${S}/studies/s/variants`, { name: "Copie", fromVariantId: "v", mode: "copie", requestId: "deriver-copie-1" });
    expect(c.status).toBe(201);
    const avant = banc.lignes.get(studioRevisions)!.length;
    const vise = await post("proprietaire", `${S}/studies/s/variants/${c.body.variant.id}/commands`, enveloppe("copie-x", teteDe(c.body.variant.id), [cmd("studio.architecture.modifier", { ...baie, width: 0.5 })]));
    expect(vise.status).toBe(400);
    expect((await post("proprietaire", `${S}/studies/s/variants`, { name: "X", mode: "copie" })).status).toBe(400);
    expect((await post("proprietaire", `${S}/studies/s/variants`, { name: "X", fromVariantId: "v", mode: "clone" })).status).toBe(400);
    const rejeu = await post("proprietaire", `${S}/studies/s/variants`, { name: "Copie", fromVariantId: "v", requestId: "deriver-copie-1" });
    expect(rejeu.status).toBe(409);
    const memeRejeu = await post("proprietaire", `${S}/studies/s/variants`, { name: "Copie", fromVariantId: "v", mode: "copie", requestId: "deriver-copie-1" });
    expect(memeRejeu.status).toBe(201);
    expect(memeRejeu.body.variant.id).toBe(c.body.variant.id);
    expect(banc.lignes.get(studioRevisions)!.length).toBe(avant);
  });
});
