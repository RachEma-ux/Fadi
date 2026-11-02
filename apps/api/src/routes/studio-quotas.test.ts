import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * TR-EX-028 / EX-028 — validation à deux niveaux : le schéma d'une enveloppe peut être contrôlé au build ; chaque
 * invocation effective subit les contrôles d'exécution — permission, contexte, paramètres, **quotas** et révision.
 * Routeur Studio réel sur la base simulée en mémoire (`testing/studio-base-simulee.ts`, aucune base ni réseau) :
 * une enveloppe au schéma valide est refusée à l'exécution quand le quota du compte est atteint (429), quand le droit a
 * été retiré après coup (403) ou quand sa révision de base est dépassée (409) ; un rejeu idempotent n'est jamais refusé
 * par le quota, et rien n'est écrit pour un refus.
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
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane } from "../testing/studio-base-simulee.js";
import { politiquesParDefaut, QuotaInvocations, quotaCommandesStudio } from "../lib/studio-quotas.js";
import { projectMembers } from "../db/schema.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
const V = "/projects/p/studio/studies/s/variants/v";
const ligne = (id: string, y: number) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } });
const lot = (requestId: string, base: string, y: number) => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId: base, commands: [ligne(`l-${requestId}`, y)] });
const poster = (acteur: string, corps: unknown) => request(app).post(`${V}/commands`).set("x-acteur", acteur).send(corps as object);

let t = 1_000_000;
beforeEach(() => { initialiserProjet(); t = 1_000_000; quotaCommandesStudio.configurer([{ periode: "minute", fenetreMs: 60_000, maxInvocations: 2 }, { periode: "heure", fenetreMs: 3_600_000, maxInvocations: 3 }], () => t); });
afterEach(() => { quotaCommandesStudio.configurer(politiquesParDefaut()); });

describe("TR-EX-028 — quota d'invocation par compte et par période", () => {
  it("compteur glissant : refus au-delà de la limite de la période, délai avant nouvel essai, libéré quand la fenêtre passe", () => {
    let h = 0;
    const q = new QuotaInvocations([{ periode: "minute", fenetreMs: 60_000, maxInvocations: 2 }], () => h);
    q.consommer("a"); h = 10_000; q.consommer("a");
    expect(q.verifier("a")).toEqual({ periode: "minute", limite: 2, fenetreMs: 60_000, reessayerDansMs: 50_000 });
    expect(q.verifier("b")).toBeNull();
    h = 60_000;
    expect(q.verifier("a")).toBeNull();
    expect(q.compte("a")).toEqual({ minute: 1 });
    expect(politiquesParDefaut({ STUDIO_QUOTA_LOTS_MINUTE: "5", STUDIO_QUOTA_LOTS_HEURE: "x" }).map((p) => p.maxInvocations)).toEqual([5, 20_000]);
  });

  it("route réelle : deux lots admis, le troisième au schéma valide refusé à l'exécution (429, Retry-After), rien écrit ; un autre compte n'est pas touché", async () => {
    const r1 = await poster("proprietaire", lot("q-1", "r1", 1));
    expect(r1.status).toBe(200);
    const r2 = await poster("proprietaire", lot("q-2", r1.body.revision.id, 2));
    expect(r2.status).toBe(200);
    const avant = instantane();
    const ecritures = banc.ecritures;
    const r3 = await poster("proprietaire", lot("q-3", r2.body.revision.id, 3));
    expect(r3.status).toBe(429);
    expect(r3.body).toMatchObject({ error: "quota_exceeded", periode: "minute", limite: 2, retryAfterSeconds: 60 });
    expect(r3.headers["retry-after"]).toBe("60");
    expect(instantane()).toBe(avant);
    expect(banc.ecritures).toBe(ecritures);
    // Rejeu idempotent d'un lot déjà accepté : jamais refusé par le quota (travail hors ligne en attente).
    const rejeu = await poster("proprietaire", lot("q-2", r1.body.revision.id, 2));
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.replayed).toBe(true);
    // Autre compte : son propre quota.
    expect((await poster("editeur", lot("e-1", r2.body.revision.id, 4))).status).toBe(200);
    // Une minute plus tard : la période « minute » est libérée, la période « heure » (3) arrête au quatrième lot.
    t += 60_000;
    const r4 = await poster("proprietaire", lot("q-4", (await request(app).get(V).set("x-acteur", "proprietaire")).body.revision.id, 5));
    expect(r4.status).toBe(200);
    const r5 = await poster("proprietaire", lot("q-5", r4.body.revision.id, 6));
    expect(r5.status).toBe(429);
    expect(r5.body).toMatchObject({ periode: "heure", limite: 3 });
  });

  it("un lot refusé pour une autre raison (révision dépassée, droit retiré après coup) ne consomme pas le quota ; le contrôle de droit reste à l'exécution", async () => {
    expect((await poster("editeur", lot("x-1", "r-inconnue", 1))).status).toBe(409);
    expect(quotaCommandesStudio.compte("editeur")).toEqual({ minute: 0, heure: 0 });
    // Droit retiré après coup (l'éditeur devient lecteur) : schéma toujours valide, refus 403 à l'exécution.
    const membres = banc.lignes.get(projectMembers)!;
    membres.find((m) => m["userId"] === "editeur")!["role"] = "lecteur";
    expect((await poster("editeur", lot("x-2", "r1", 1))).status).toBe(403);
    expect(quotaCommandesStudio.compte("editeur")).toEqual({ minute: 0, heure: 0 });
  });
});
