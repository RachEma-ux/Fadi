import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Adaptateur d'agents MCP de Studio (lot F, décision P-12) — routeurs Express réels (`/mcp/studio` par jeton d'agent,
 * routes Studio par session simulée), base simulée en mémoire, aucun réseau. TEST-033 (appel MCP sur commande protégée :
 * même schéma, droits, confirmation et idempotence que l'interface humaine), F.3-02, TR-INV-010 (action d'agent
 * distinguée dans l'historique et le journal), TR-EX-031 / F.3-01 (extensions), transport stdio.
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
import { STUDIO_CONTRACT, type StudioCommand } from "@parcours/atelier-model";
import { studioAgentEvents, studioAgentProposals, studioAgentTokens, studioRevisions, studioVariants } from "../db/schema.js";
import { studioMcpRouter } from "./mcp-studio.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use(express.json());
app.use("/mcp/studio", studioMcpRouter(["http://localhost:5173"]));
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => { res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) }); });

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } });
const humain = (a: Acteur) => ({ post: (url: string, b: unknown = {}) => request(app).post(url).set("x-acteur", a).send(b as object), get: (url: string) => request(app).get(url).set("x-acteur", a) });
const nbRevisions = () => banc.lignes.get(studioRevisions)!.length;
const tete = () => banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!["headRevisionId"] as string;

async function jeton(a: Acteur): Promise<string> {
  const r = await humain(a).post(`${S}/agents/jetons`, { nom: "Agent d’essai" });
  expect(r.status).toBe(201);
  return r.body.jeton as string;
}
let n = 0;
const mcp = (j: string, method: string, params?: unknown, extra: Record<string, string> = {}) => request(app).post("/mcp/studio").set({ Authorization: `Bearer ${j}`, ...extra }).send({ jsonrpc: "2.0", id: ++n, method, ...(params === undefined ? {} : { params }) });
const outil = async (j: string, name: string, args: Record<string, unknown>) => (await mcp(j, "tools/call", { name, arguments: args })).body.result as { isError: boolean; structuredContent: Record<string, any> };
const proposition = (requestId: string, commands: StudioCommand[] = [ligne("agent-l", 3)], baseRevisionId = "r1") => ({ studyId: "s", variantId: "v", requestId, baseRevisionId, commands });

beforeEach(() => { initialiserProjet(); n = 0; });
afterEach(() => vi.unstubAllEnvs());

describe("TEST-033 — appel MCP sur une commande protégée : même schéma, mêmes droits, confirmation et idempotence que l'interface humaine", () => {
  it("TEST-033 [+] F.3-02 [+] l'agent propose, rien n'est écrit ; la personne confirme dans Studio ; la révision est celle que la route humaine écrit pour la même enveloppe", async () => {
    // Référence : la même enveloppe enregistrée par l'interface humaine.
    const enveloppe = { contractVersion: STUDIO_CONTRACT, requestId: "q-1", baseRevisionId: "r1", commands: [ligne("agent-l", 3)] };
    const parHumain = await humain("editeur").post(`${V}/commands`, enveloppe);
    expect(parHumain.status).toBe(200);
    initialiserProjet();

    const j = await jeton("editeur");
    expect((await mcp(j, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "essai", version: "1" } })).body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "fadi-studio" } });
    const lu = await outil(j, "studio_lire_variante", { studyId: "s", variantId: "v" });
    expect(lu).toMatchObject({ isError: false, structuredContent: { variant: { headRevisionId: "r1" }, canWrite: true } });
    const avant = nbRevisions();
    const p = await outil(j, "studio_proposer_commandes", proposition("q-1"));
    expect(p).toMatchObject({ isError: false, structuredContent: { etat: "confirmation-requise", proposition: { statut: "en-attente", apercu: { commandes: 1, outils: ["studio.dessin.ligne"] } } } });
    expect(nbRevisions()).toBe(avant);
    expect(tete()).toBe("r1");
    const id = p.structuredContent.proposition.id as string;
    // La personne voit la proposition, puis confirme (session humaine).
    expect((await humain("editeur").get(`${S}/agents/propositions`)).body.propositions.map((x: { id: string; statut: string }) => [x.id, x.statut])).toEqual([[id, "en-attente"]]);
    const c = await humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ replayed: false, proposition: { statut: "confirmee", revisionId: c.body.revisionId } });
    expect(nbRevisions()).toBe(avant + 1);
    const ecrite = banc.lignes.get(studioRevisions)!.at(-1)!;
    expect(ecrite).toMatchObject({ id: tete(), authorId: "editeur", requestId: "q-1", source: "agent-mcp" });
    expect(ecrite["document"]).toEqual(parHumain.body.revision.document);
    expect(ecrite["payloadHash"]).toBe(banc.lignes.get(studioRevisions)!.at(-1)!["payloadHash"]);
    expect(await outil(j, "studio_etat_proposition", { propositionId: id })).toMatchObject({ structuredContent: { proposition: { statut: "confirmee", revisionId: tete() } } });
  });
  it("TEST-033 [+] idempotence : proposer à nouveau le même requestId rend la même proposition ; confirmer deux fois n'écrit qu'une révision (rejeu du point d'entrée commun)", async () => {
    const j = await jeton("editeur");
    const a = await outil(j, "studio_proposer_commandes", proposition("q-2"));
    const b = await outil(j, "studio_proposer_commandes", proposition("q-2"));
    expect(b.structuredContent).toMatchObject({ rejouee: true, proposition: { id: a.structuredContent.proposition.id } });
    expect(banc.lignes.get(studioAgentProposals)).toHaveLength(1);
    const id = a.structuredContent.proposition.id as string;
    const avant = nbRevisions();
    const c1 = await humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`);
    const c2 = await humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`);
    expect([c1.body.replayed, c2.body.replayed]).toEqual([false, true]);
    expect(c2.body.revisionId).toBe(c1.body.revisionId);
    expect(nbRevisions()).toBe(avant + 1);
    // Même requestId, autre contenu : refus, comme sur la route humaine.
    expect(await outil(j, "studio_proposer_commandes", proposition("q-2", [ligne("autre", 9)]))).toMatchObject({ isError: true, structuredContent: { status: 409, error: "request_conflict" } });
  });
  it("TEST-033 [−] commande protégée sans permission (jeton d'un lecteur), schéma étranger, champ forgé ou révision périmée : refus sans effet, aucune voie privilégiée", async () => {
    const lecteur = await jeton("lecteur");
    const avant = nbRevisions();
    expect(await outil(lecteur, "studio_proposer_commandes", proposition("q-3"))).toMatchObject({ isError: true, structuredContent: { status: 403 } });
    expect(banc.lignes.get(studioAgentProposals) ?? []).toHaveLength(0);
    const j = await jeton("editeur");
    expect(await outil(j, "studio_proposer_commandes", proposition("q-4", [{ toolId: "studio.inconnu", params: {} } as never]))).toMatchObject({ isError: true, structuredContent: { status: 400, error: "invalid_input" } });
    expect(await outil(j, "studio_proposer_commandes", proposition("q-5", [{ toolId: "studio.dessin.ligne", params: { id: "x", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } }]))).toMatchObject({ isError: true, structuredContent: { status: 400, error: "invalid_commands" } });
    expect((await mcp(j, "tools/call", { name: "studio_proposer_commandes", arguments: { ...proposition("q-6"), authorId: "proprietaire" } })).body.error.code).toBe(-32602);
    expect(await outil(j, "studio_proposer_commandes", proposition("q-7", [ligne("z", 1)], "r0"))).toMatchObject({ isError: true, structuredContent: { status: 409, error: "stale_revision", headRevisionId: "r1" } });
    expect(nbRevisions()).toBe(avant);
    expect(banc.lignes.get(studioAgentProposals) ?? []).toHaveLength(0);
  });
  it("F.3-02 [−] l'agent ne confirme jamais : un jeton n'ouvre aucune route Studio ; un autre compte ne voit ni ne confirme la proposition ; proposition refusée, expirée ou périmée : rien n'est écrit", async () => {
    const j = await jeton("editeur");
    const p = await outil(j, "studio_proposer_commandes", proposition("q-8"));
    const id = p.structuredContent.proposition.id as string;
    const avant = nbRevisions();
    // Jeton présenté à la route de confirmation, sans session : 401 (un jeton n'est pas une session).
    expect((await request(app).post(`${S}/agents/propositions/${id}/confirmer`).set("Authorization", `Bearer ${j}`)).status).toBe(401);
    expect((await humain("proprietaire").post(`${S}/agents/propositions/${id}/confirmer`)).status).toBe(404);
    expect((await humain("proprietaire").get(`${S}/agents/propositions`)).body.propositions).toEqual([]);
    // Session sans jeton, à la route MCP : 401 (la session ne vaut rien ici) ; origine étrangère : 403.
    expect((await request(app).post("/mcp/studio").set("x-acteur", "editeur").send({ jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await mcp(j, "ping", undefined, { Origin: "https://site-tiers.exemple" })).status).toBe(403);
    expect((await request(app).get("/mcp/studio").set("Authorization", `Bearer ${j}`)).status).toBe(405);
    expect((await humain("editeur").post(`${S}/agents/propositions/${id}/refuser`)).body).toMatchObject({ proposition: { statut: "refusee" } });
    expect((await humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`)).body).toMatchObject({ error: "proposition_close", statut: "refusee" });
    // Périmée : la tête a bougé (enregistrement humain) entre la proposition et la confirmation.
    const p2 = await outil(j, "studio_proposer_commandes", proposition("q-9"));
    await humain("editeur").post(`${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: "h-1", baseRevisionId: "r1", commands: [ligne("h", 5)] });
    const apresHumain = nbRevisions();
    const c = await humain("editeur").post(`${S}/agents/propositions/${p2.structuredContent.proposition.id}/confirmer`);
    expect(c.status).toBe(409);
    expect(c.body.error).toBe("stale_revision");
    expect(nbRevisions()).toBe(apresHumain);
    expect(banc.lignes.get(studioAgentProposals)!.find((x) => x.id === p2.structuredContent.proposition.id)).toMatchObject({ status: "echec" });
    // Expirée.
    const p3 = await outil(j, "studio_proposer_commandes", proposition("q-10", [ligne("e", 7)], tete()));
    banc.lignes.get(studioAgentProposals)!.find((x) => x.id === p3.structuredContent.proposition.id)!["expiresAt"] = new Date(Date.now() - 1000);
    expect((await humain("editeur").post(`${S}/agents/propositions/${p3.structuredContent.proposition.id}/confirmer`)).body).toMatchObject({ error: "proposition_close", statut: "expiree" });
    expect(nbRevisions()).toBe(apresHumain);
    expect(avant).toBeLessThan(apresHumain);
  });
  it("TEST-033 [−] jeton révoqué, expiré, inconnu ou d'un compte suspendu : 401", async () => {
    const j = await jeton("editeur");
    expect((await mcp(j, "ping")).status).toBe(200);
    expect((await mcp("fadi_mcp_inconnu", "ping")).status).toBe(401);
    const row = banc.lignes.get(studioAgentTokens)![0]!;
    row["expiresAt"] = new Date(Date.now() - 1000);
    expect((await mcp(j, "ping")).status).toBe(401);
    row["expiresAt"] = new Date(Date.now() + 86_400_000);
    const users = [...banc.lignes.entries()].find(([, ls]) => ls.some((l) => l["email"] === "editeur@exemple.test"))![1];
    users.find((u) => u["id"] === "editeur")!["status"] = "suspended";
    expect((await mcp(j, "ping")).status).toBe(401);
    users.find((u) => u["id"] === "editeur")!["status"] = "active";
    expect((await humain("editeur").post(`${S}/agents/jetons/${row["id"]}/revoquer`)).body).toEqual({ id: row["id"], revoque: true });
    // La liste des jetons ne montre jamais leur valeur ni leur empreinte ; un autre compte ne voit pas ceux de l'éditeur.
    const jetons = (await request(app).get(`${S}/agents/jetons`).set("x-acteur", "editeur")).body.jetons as Record<string, unknown>[];
    expect(jetons).toHaveLength(1);
    expect(jetons[0]).toMatchObject({ id: row["id"], nom: "Agent d’essai" });
    expect(jetons[0]!["revoqueLe"]).not.toBeNull();
    expect(JSON.stringify(jetons)).not.toMatch(/fadi_mcp_|tokenHash|[0-9a-f]{64}/);
    expect((await request(app).get(`${S}/agents/jetons`).set("x-acteur", "proprietaire")).body.jetons).toEqual([]);
    expect((await mcp(j, "ping")).status).toBe(401);
  });
});

describe("TR-INV-010 — une action d'agent est distinguée d'une action humaine dans l'historique et le journal", () => {
  it("TR-INV-010 [+] historique des révisions : source « agent-mcp » pour la proposition confirmée, « authenticated-session » pour l'enregistrement humain ; journal : appels de l'agent (jeton) et décisions de la personne", async () => {
    const j = await jeton("editeur");
    await humain("editeur").post(`${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: "h-1", baseRevisionId: "r1", commands: [ligne("h", 5)] });
    await outil(j, "studio_lire_variante", { studyId: "s", variantId: "v" });
    const p = await outil(j, "studio_proposer_commandes", proposition("q-11", [ligne("agent-a", 6)], tete()));
    const c = await humain("editeur").post(`${S}/agents/propositions/${p.structuredContent.proposition.id}/confirmer`);
    const hist = (await humain("lecteur").get(`${V}/revisions`)).body.revisions as { id: string; source: string; authorId: string }[];
    expect(hist.find((r) => r.id === c.body.revisionId)).toMatchObject({ source: "agent-mcp", authorId: "editeur" });
    expect(hist.filter((r) => r.source === "authenticated-session")).toHaveLength(1);
    const journal = (await humain("editeur").get(`${S}/agents/journal`)).body.evenements as { acteur: string; action: string; outil: string | null; jetonId: string | null; revisionId: string | null }[];
    const tokenId = banc.lignes.get(studioAgentTokens)![0]!["id"];
    expect(journal.map((e) => [e.acteur, e.action]).sort()).toEqual([["agent", "outil.appeler"], ["agent", "proposition.creer"], ["humain", "jeton.creer"], ["humain", "proposition.confirmer"]]);
    expect(journal.filter((e) => e.acteur === "agent").every((e) => e.jetonId === tokenId)).toBe(true);
    expect(journal.find((e) => e.action === "proposition.confirmer")!.revisionId).toBe(c.body.revisionId);
  });
  it("TR-INV-010 [−] un corps qui se déclare « agent » ou une source ne change rien : la route humaine écrit « authenticated-session », le journal reste en ajout seul", async () => {
    expect((await humain("editeur").post(`${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: "h-2", baseRevisionId: "r1", commands: [ligne("h", 5)], source: "agent-mcp" })).status).toBe(400);
    await humain("editeur").post(`${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: "h-2", baseRevisionId: "r1", commands: [ligne("h", 5)] });
    expect(banc.lignes.get(studioRevisions)!.at(-1)).toMatchObject({ source: "authenticated-session" });
    await jeton("editeur");
    const { db } = await import("../db/client.js");
    const { eq } = await import("drizzle-orm");
    await expect(db.update(studioAgentEvents).set({ action: "outil.appeler" }).where(eq(studioAgentEvents.actorId, "editeur"))).rejects.toThrow(/studio_agent_event_immutable/);
  });
});

describe("TR-EX-031 / F.3-01 — l'adaptateur MCP est une extension déclarée ; une extension trouvée n'est pas autorisée", () => {
  it("F.3-01 [+] déclaration de l'adaptateur (provenance intégrée, permissions, mises à jour) autorisée par défaut ; tools/list expose ses outils", async () => {
    const r = await humain("lecteur").get(`${S}/extensions`);
    expect(r.body.extensions[0]).toMatchObject({ declaration: { id: "fadi.studio.mcp", provenance: { source: "fadi:integre" }, misesAJour: { politique: "avec-fadi" } }, evaluation: { etat: "autorisee", chargement: "aucun" } });
    const j = await jeton("lecteur");
    expect((await mcp(j, "tools/list")).body.result.tools).toHaveLength(5);
  });
  it("F.3-01 [−] adaptateur désactivé par l'administrateur : plus aucun outil n'agit ; déclaration avec script : refusée, rien n'est chargé ni écrit", async () => {
    vi.stubEnv("STUDIO_MCP_ACTIF", "0");
    const j = await jeton("editeur");
    expect((await mcp(j, "tools/call", { name: "studio_lister_etudes", arguments: {} })).body.error.code).toBe(-32602);
    const e = await humain("editeur").post(`${S}/extensions/evaluer`, { declaration: { schema: "studio-extension/1", id: "x", script: "https://exemple.test/x.js" } });
    expect(e.body.evaluation).toMatchObject({ etat: "refusee", chargement: "aucun" });
  });
});

describe("Transport stdio — relais des messages MCP vers /mcp/studio", () => {
  it("TEST-033 [+] le relais stdio transmet initialize et tools/list avec le jeton, n'émet rien pour une notification et signale un refus du serveur", async () => {
    const j = await jeton("editeur");
    // @ts-ignore — script Node sans déclaration de types (transport stdio livré tel quel).
    const { creerRelais } = (await import("../../scripts/studio-mcp-stdio.mjs")) as { creerRelais: (o: unknown) => (l: string) => Promise<void> };
    const sorties: string[] = [];
    const fetchImpl = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      const r = await request(app).post("/mcp/studio").set({ Authorization: init.headers["Authorization"]! }).send(JSON.parse(init.body));
      return new Response(r.status === 202 ? null : JSON.stringify(r.body), { status: r.status });
    };
    const relayer = creerRelais({ url: "http://localhost:3001/mcp/studio", jeton: j, fetchImpl, ecrire: (l: string) => sorties.push(l), journal: () => undefined });
    await relayer(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }));
    await relayer(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    await relayer(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    expect(sorties.map((s) => JSON.parse(s).id)).toEqual([1, 2]);
    expect(JSON.parse(sorties[1]!).result.tools.map((t: { name: string }) => t.name)).toContain("studio_proposer_commandes");
    const refus = creerRelais({ url: "http://localhost:3001/mcp/studio", jeton: "fadi_mcp_revoque", fetchImpl, ecrire: (l: string) => sorties.push(l), journal: () => undefined });
    await refus(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }));
    expect(JSON.parse(sorties.at(-1)!)).toMatchObject({ id: 3, error: { code: -32001 } });
    expect(() => creerRelais({ url: "http://x/mcp/studio", jeton: "cookie-de-session" })).toThrow();
  });
});

describe("Revue de la PR #328 — décision sur une proposition engagée avec sa révision, tout ou rien", () => {
  it("F.3-02 [−] confirmation et refus simultanés : une seule décision l'emporte ; l'autre reçoit 409 ; statut, révision et journal concordent", async () => {
    const j = await jeton("editeur");
    const p = await outil(j, "studio_proposer_commandes", proposition("q-concur"));
    const id = p.structuredContent.proposition.id as string;
    const avant = nbRevisions();
    const [c, r] = await Promise.all([humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`), humain("editeur").post(`${S}/agents/propositions/${id}/refuser`)]);
    expect([c.status, r.status].sort()).toEqual([200, 409]);
    const ligneP = banc.lignes.get(studioAgentProposals)!.find((x) => x.id === id)!;
    const decisions = banc.lignes.get(studioAgentEvents)!.filter((e) => e["proposalId"] === id && String(e["action"]).match(/confirmer|refuser/));
    expect(decisions).toHaveLength(1);
    if (c.status === 200) {
      expect(ligneP).toMatchObject({ status: "confirmee", revisionId: c.body.revisionId });
      expect(nbRevisions()).toBe(avant + 1);
      expect(decisions[0]!["action"]).toBe("proposition.confirmer");
    } else {
      expect(ligneP["status"]).toBe("refusee");
      expect(nbRevisions()).toBe(avant);
      expect(decisions[0]!["action"]).toBe("proposition.refuser");
    }
  });
  it("F.3-02 [−] une panne entre l'écriture de la révision et la décision annule les deux : aucune révision, proposition toujours en attente, aucun journal de décision", async () => {
    const j = await jeton("editeur");
    const p = await outil(j, "studio_proposer_commandes", proposition("q-panne"));
    const id = p.structuredContent.proposition.id as string;
    const avant = nbRevisions();
    banc.panneSur = studioAgentProposals;
    try { expect((await humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`)).status).toBe(500); }
    finally { banc.panneSur = null; }
    expect(nbRevisions()).toBe(avant);
    expect(tete()).toBe("r1");
    expect(banc.lignes.get(studioAgentProposals)!.find((x) => x.id === id)!["status"]).toBe("en-attente");
    expect(banc.lignes.get(studioAgentEvents)!.filter((e) => e["proposalId"] === id && e["action"] === "proposition.confirmer")).toHaveLength(0);
    // La personne peut ensuite confirmer normalement.
    expect((await humain("editeur").post(`${S}/agents/propositions/${id}/confirmer`)).status).toBe(200);
  });
});
