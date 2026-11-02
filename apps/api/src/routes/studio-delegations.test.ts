import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * EX-085 — délégation contrôlée de l'approbation (REF-02 w:p 816), côté serveur : routeur Express réel, `lib/studio-*.ts`,
 * base simulée en mémoire (`testing/studio-base-simulee.ts` : aucune base, aucun serveur). « L'absence d'un approbateur
 * ne vaut pas accord. Une délégation, si permise, possède portée, période, délégant/délégué, justification et événement
 * d'audit. » Le temps est simulé par `vi.setSystemTime` (seule l'horloge `Date` est remplacée).
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
import { studioApprovalDelegationEvents, studioApprovalDelegations, studioPublicationEvents, studioPublications } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const post = (a: Acteur | "autre", url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const H = 3_600_000;
const T0 = new Date("2026-10-25T08:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const pub = (id: string) => banc.lignes.get(studioPublications)!.find((r) => r.id === id)!;

async function soumise(titre = "Dossier d'essai"): Promise<Record<string, any>> {
  const c = await post("proprietaire", `${V}/publications`, { title: titre, contenu: "dessin-2d" });
  expect(c.status).toBe(201);
  const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
  expect(s.status).toBe(200);
  return s.body;
}
const presente = (v: Record<string, any>) => ({ manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash });
const deleguer = (body: Record<string, unknown>, a: Acteur = "proprietaire") => post(a, `${S}/delegations`, {
  delegateId: "editeur", scopeType: "etude", scopeId: "s", startsAt: at(-H), endsAt: at(8 * H), reason: "Congés du propriétaire", ...body,
});

beforeEach(() => { initialiserProjet(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe("EX-085 — délégation d'approbation (serveur)", () => {
  it("EX-085 [+] une délégation valide (portée, période, délégant, délégué, motif) permet au délégué d'approuver ; l'emploi est audité", async () => {
    const v = await soumise();
    const d = await deleguer({});
    expect(d.status).toBe(201);
    expect(d.body).toMatchObject({ delegator: { id: "proprietaire" }, delegate: { id: "editeur" }, scope: { type: "etude", id: "s" }, reason: "Congés du propriétaire", state: "active", revocation: null });
    // La création n'approuve rien.
    expect(pub(v.id)).toMatchObject({ workStatus: "en-revue", approvedBy: null });
    // Vue du délégué : la délégation lui est proposée, approuver et refuser sont permis, diffuser ne l'est pas.
    const vue = await get("editeur", `${S}/studies/s/publications/${v.id}`);
    expect(vue.body.delegation).toMatchObject({ id: d.body.id, delegator: { id: "proprietaire" }, reason: "Congés du propriétaire" });
    expect(vue.body.allowed).toEqual(expect.arrayContaining(["approuver", "refuser"]));
    const ok = await post("editeur", `${S}/studies/s/publications/${v.id}/approuver`, { ...presente(v), delegationId: d.body.id, comment: "Par délégation" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ workStatus: "approuve", approval: { by: { id: "editeur" }, delegationId: d.body.id, manifestHash: v.manifestHash } });
    const evt = banc.lignes.get(studioPublicationEvents)!.filter((e) => e.publicationId === v.id && e.action === "approuver");
    expect(evt).toHaveLength(1);
    expect(evt[0]).toMatchObject({ authorId: "editeur", delegationId: d.body.id, comment: "Par délégation" });
    // Journal de la délégation : création puis emploi (publication, transition).
    const journal = banc.lignes.get(studioApprovalDelegationEvents)!.filter((e) => e.delegationId === d.body.id);
    expect(journal.map((e) => [e.action, e.actorId, e.publicationId ?? null, e.publicationAction ?? null])).toEqual([
      ["creer", "proprietaire", null, null], ["employer", "editeur", v.id, "approuver"],
    ]);
    const liste = await get("proprietaire", `${S}/delegations`);
    expect(liste.body.delegations[0].events.map((e: { action: string }) => e.action)).toEqual(["creer", "employer"]);
    // Le délégué ne diffuse pas : la délégation ne transmet que l'approbation.
    expect((await get("editeur", `${S}/studies/s/publications/${v.id}`)).body.allowed).not.toContain("diffuser");
    expect((await post("editeur", `${S}/studies/s/publications/${v.id}/diffuser`)).status).toBe(403);
    expect((await post("editeur", `${S}/studies/s/publications/${v.id}/diffuser`, { delegationId: d.body.id })).body).toMatchObject({ code: "delegation_non_applicable" });
  });

  it("EX-085 [−] l'absence de l'approbateur ne vaut pas accord : sans décision, la publication reste en revue, même longtemps après", async () => {
    const v = await soumise();
    expect((await post("editeur", `${S}/studies/s/publications/${v.id}/approuver`, presente(v))).status).toBe(403);
    vi.setSystemTime(new Date(T0.getTime() + 90 * 24 * H));
    const vue = await get("proprietaire", `${S}/studies/s/publications/${v.id}`);
    expect(vue.body).toMatchObject({ workStatus: "en-revue", approval: null });
    // Aucune diffusion sans approbation enregistrée.
    expect((await post("proprietaire", `${S}/studies/s/publications/${v.id}/diffuser`)).status).toBe(409);
    expect(pub(v.id)).toMatchObject({ workStatus: "en-revue", approvedBy: null, packageHash: null });
  });

  it("EX-085 [−] hors période (à venir, expirée) ou révoquée : refus nommé, rien n'est approuvé ; l'expiration n'approuve rien", async () => {
    const v = await soumise();
    const d = await deleguer({ startsAt: at(2 * H), endsAt: at(4 * H) });
    expect(d.status).toBe(201);
    const avant = instantane();
    const essai = () => post("editeur", `${S}/studies/s/publications/${v.id}/approuver`, { ...presente(v), delegationId: d.body.id });
    expect((await essai()).body).toMatchObject({ error: "forbidden", code: "delegation_a_venir" });
    expect((await get("editeur", `${S}/studies/s/publications/${v.id}`)).body).toMatchObject({ delegation: null });
    vi.setSystemTime(new Date(T0.getTime() + 5 * H));
    expect((await essai()).body).toMatchObject({ code: "delegation_expiree" });
    expect(instantane()).toBe(avant);
    expect(pub(v.id)).toMatchObject({ workStatus: "en-revue", approvedBy: null });
    // Révoquée pendant sa période : refus.
    vi.setSystemTime(T0);
    const d2 = await deleguer({ requestId: "d-2" });
    const rv = await post("proprietaire", `${S}/delegations/${d2.body.id}/revoquer`, { reason: "Retour du propriétaire" });
    expect(rv.status).toBe(200);
    expect(rv.body).toMatchObject({ state: "revoquee", revocation: { by: { id: "proprietaire" }, reason: "Retour du propriétaire" } });
    expect((await post("editeur", `${S}/studies/s/publications/${v.id}/approuver`, { ...presente(v), delegationId: d2.body.id })).body).toMatchObject({ code: "delegation_revoquee" });
    expect((await post("proprietaire", `${S}/delegations/${d2.body.id}/revoquer`, { reason: "Encore" })).status).toBe(409);
    expect((await post("proprietaire", `${S}/delegations/${d2.body.id}/revoquer`, {})).status).toBe(400);
    expect(banc.lignes.get(studioApprovalDelegationEvents)!.filter((e) => e.delegationId === d2.body.id).map((e) => e.action)).toEqual(["creer", "revoquer"]);
    expect(pub(v.id)).toMatchObject({ workStatus: "en-revue", approvedBy: null });
  });

  it("EX-085 [−] hors portée ou employée par un autre compte : refus nommé", async () => {
    const a = await soumise("A");
    const b = await soumise("B");
    const d = await deleguer({ scopeType: "publication", scopeId: a.id });
    expect(d.status).toBe(201);
    expect((await post("editeur", `${S}/studies/s/publications/${b.id}/approuver`, { ...presente(b), delegationId: d.body.id })).body).toMatchObject({ code: "delegation_hors_portee" });
    expect((await get("editeur", `${S}/studies/s/publications/${b.id}`)).body.delegation).toBeNull();
    expect((await post("lecteur", `${S}/studies/s/publications/${a.id}/approuver`, { ...presente(a), delegationId: d.body.id })).body).toMatchObject({ code: "delegation_autre_delegue" });
    expect((await post("editeur", `${S}/studies/s/publications/${a.id}/approuver`, { ...presente(a), delegationId: "inconnue" })).status).toBe(404);
    // Dans sa portée : admise.
    expect((await post("editeur", `${S}/studies/s/publications/${a.id}/refuser`, { delegationId: d.body.id, comment: "Manque la cote" })).body).toMatchObject({ workStatus: "refuse" });
    expect(pub(b.id)).toMatchObject({ workStatus: "en-revue" });
  });

  it("EX-085 [−] une délégation ne se crée que par qui détient le droit, pour un autre participant, bornée et motivée", async () => {
    // L'éditeur n'approuve pas : il ne peut pas déléguer ce droit.
    expect((await deleguer({ delegateId: "lecteur" }, "editeur")).body).toMatchObject({ code: "delegation_sans_droit" });
    expect((await deleguer({ delegateId: "proprietaire" })).body).toMatchObject({ code: "delegation_delegue_identique" });
    expect((await deleguer({ delegateId: "etranger" })).body).toMatchObject({ code: "delegue_inconnu" });
    expect((await deleguer({ endsAt: at(-2 * H) })).body).toMatchObject({ code: "delegation_periode_invalide" });
    expect((await deleguer({ startsAt: at(-5 * H), endsAt: at(-2 * H) })).body).toMatchObject({ code: "delegation_periode_terminee" });
    expect((await deleguer({ reason: "" })).status).toBe(400);
    expect((await deleguer({ scopeType: "etude", scopeId: "sq" })).body).toMatchObject({ code: "portee_inconnue" });
    expect((await deleguer({ scopeType: "projet" })).body).toMatchObject({ code: "portee_invalide" });
    expect(banc.lignes.get(studioApprovalDelegations) ?? []).toEqual([]);
    // Portée projet, sans identifiant : admise ; rejeu par requestId sans doublon.
    const p1 = await deleguer({ scopeType: "projet", scopeId: undefined, requestId: "d-projet" });
    expect(p1.status).toBe(201);
    const p2 = await deleguer({ scopeType: "projet", scopeId: undefined, requestId: "d-projet" });
    expect(p2.status).toBe(200);
    expect(p2.headers["idempotent-replayed"]).toBe("true");
    expect((await deleguer({ scopeType: "projet", scopeId: undefined, requestId: "d-projet", reason: "Autre" })).status).toBe(409);
    expect(banc.lignes.get(studioApprovalDelegations)!).toHaveLength(1);
    // Révocation : par le délégant ou le propriétaire seulement.
    expect((await post("editeur", `${S}/delegations/${p1.body.id}/revoquer`, { reason: "Non" })).status).toBe(403);
    // Visibilité : le lecteur, ni délégant ni délégué, ne voit aucune délégation.
    expect((await get("lecteur", `${S}/delegations`)).body.delegations).toEqual([]);
    expect((await get("editeur", `${S}/delegations`)).body.delegations).toHaveLength(1);
  });
});
