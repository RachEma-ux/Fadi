import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Lot CMD — routes Studio réelles (Express), base simulée en mémoire (`testing/studio-base-simulee.ts`) : effets d'une
 * commande acceptée (EX-010), journal des changements de révision et notification après engagement seulement
 * (IF-011), essais à portée de révision (EX-045), résultat de job sous l'autorisation de l'étude source (EX-088),
 * contrat d'étude avec site / sources / version (IF-001), migration simulée / accordée / appliquée / retirée (EX-091),
 * chemin d'écriture unique d'une bascule (MIG-COEX-06), périmètre exclu (EX-002).
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
import { parcels, stepFiles, studioJobs, studioRevisionEvents, studioRevisions, studioStudies, studioStudyContexts, studioVariants } from "../db/schema.js";
import { abonnerSignaux, type SignalTempsReel } from "../lib/temps-reel-signaux.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});
const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const lignes = (t: unknown) => banc.lignes.get(t) ?? [];
const tete = () => lignes(studioVariants).find((x) => x["id"] === "v")!["headRevisionId"] as string;
let n = 0;
const enveloppe = (commands: unknown[], base = tete()) => ({ contractVersion: STUDIO_CONTRACT, requestId: `q-${++n}`, baseRevisionId: base, commands });
const rectangle = (id: string, x = 8) => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", origin: { x, y: 0 }, width: 2, height: 1 } });
const cote = { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 1, links: { start: { objectId: "a", anchor: "start" }, end: { objectId: "a", anchor: "end" } }, toResolve: false } };

beforeEach(initialiserProjet);

describe("TR-EX-010 / TR-IF-011 — effets d'une commande et journal des changements de révision", () => {
  it("IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur", async () => {
    const r = await post("editeur", `${V}/commands`, enveloppe([cote, rectangle("r1")]));
    expect(r.status).toBe(200);
    expect(r.body.effects).toMatchObject({ crees: ["c1", "r1"], revisionBase: "r1", revisionSortie: r.body.revision.id, origine: { auteurId: "editeur", source: "authenticated-session" } });
    expect(r.body.effects.references.ajoutees).toEqual([{ de: "c1", vers: "a", nature: "cote-liee" }]);
    const j = await get("lecteur", `${V}/journal`);
    expect(j.status).toBe(200);
    expect(j.body.evenements).toHaveLength(1);
    const e = j.body.evenements[0];
    expect(e).toMatchObject({ eventId: r.body.eventId, studyId: "s", variantId: "v", baseRevisionId: "r1", revisionId: r.body.revision.id, authorId: "editeur", jobId: null });
    expect(e.transactionId).toMatch(/^studio_tx_/);
    expect(Date.parse(e.createdAt)).not.toBeNaN();
    expect(e.effects.domainesInvalides).toEqual(["plan-2d", "maillage-3d", "quantites", "exports", "publications"]);
    // L'historique hybride d'une révision relit le même événement.
    const ch = await get("lecteur", `${V}/revisions/${r.body.revision.id}/changes`);
    expect(ch.body.event.eventId).toBe(r.body.eventId);
    expect((await get("lecteur", `${V}/revisions/r1/changes`)).body.event).toBeNull();
  });

  it("EX-010 [−] : suppression d'un objet portant une cote liée — relation retirée et cote « à résoudre » décrites dans l'effet", async () => {
    await post("editeur", `${V}/commands`, enveloppe([cote]));
    const r = await post("editeur", `${V}/commands`, enveloppe([{ toolId: "studio.dessin.supprimer", params: { ids: ["a"] } }]));
    expect(r.status).toBe(200);
    expect(r.body.effects.supprimes).toEqual(["a"]);
    expect(r.body.effects.references.retirees).toEqual([{ de: "c1", vers: "a", nature: "cote-liee" }]);
    expect(r.body.effects.contraintes).toEqual([{ id: "c1", contrainte: "a-resoudre", avant: false, apres: true }]);
    expect(r.body.effects.domainesInvalides).toContain("publications");
  });

  it("IF-011 [−] : transaction échouée — aucun événement, aucune révision, aucune notification ; la notification suit l'engagement", async () => {
    const recus: { s: SignalTempsReel; validees: number }[] = [];
    const fin = abonnerSignaux((s) => recus.push({ s, validees: banc.transactions.validees }));
    try {
      banc.panneSur = studioVariants;
      const avant = instantane();
      const echec = await post("editeur", `${V}/commands`, enveloppe([rectangle("r1")]));
      expect(echec.status).toBe(500);
      expect(instantane()).toBe(avant);
      expect(lignes(studioRevisionEvents)).toEqual([]);
      expect(recus).toEqual([]);
      banc.panneSur = null;
      const validees = banc.transactions.validees;
      const ok = await post("editeur", `${V}/commands`, enveloppe([rectangle("r1")]));
      expect(ok.status).toBe(200);
      expect(recus).toHaveLength(1);
      expect(recus[0]!.s).toEqual({ type: "studio-revision", projectId: "p", variantId: "v", revisionId: ok.body.revision.id });
      // Notifiée seulement une fois la transaction validée.
      expect(recus[0]!.validees).toBe(validees + 1);
      // Un rejeu (même requestId) ne notifie rien de nouveau.
      const rejeu = await post("editeur", `${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: `q-${n}`, baseRevisionId: "r1", commands: [rectangle("r1")] });
      expect(rejeu.body.replayed).toBe(true);
      expect(recus).toHaveLength(1);
    } finally { fin(); banc.panneSur = null; }
  });
});

describe("TR-EX-045 — appel d'essai serveur à portée de révision", () => {
  it("EX-045 [+] : prévisualisation sur R1 sans mutation permanente, puis confirmation sur base valide (journal relié au job)", async () => {
    const avant = lignes(studioRevisions).length;
    const e = await post("editeur", `${V}/essais`, enveloppe([rectangle("r9")]));
    expect(e.status).toBe(201);
    expect(e.body).toMatchObject({ kind: "essai-commandes", status: "termine", sourceRevisionId: "r1" });
    expect(e.body.result.valideSur).toBe("r1");
    expect(e.body.result.geometrie.r9).toMatchObject({ type: "rectangle", width: 2 });
    expect(lignes(studioRevisions).length).toBe(avant);
    expect(tete()).toBe("r1");
    const c = await post("editeur", `${V}/essais/${e.body.id}/confirmer`);
    expect(c.status).toBe(200);
    expect(c.body.revision.parentRevisionId).toBe("r1");
    expect(lignes(studioRevisionEvents)[0]!["jobId"]).toBe(e.body.id);
    expect(lignes(studioJobs).find((j) => j["id"] === e.body.id)!["status"]).toBe("confirme");
  });

  it("EX-045 [−] : essai R1 confirmé après R2, essai abandonné, base périmée : refusés, aucun engagement", async () => {
    const e = await post("editeur", `${V}/essais`, enveloppe([rectangle("r9")]));
    await post("proprietaire", `${V}/commands`, enveloppe([rectangle("autre", 20)]));
    const avant = instantane();
    const c = await post("editeur", `${V}/essais/${e.body.id}/confirmer`);
    expect(c.status).toBe(409);
    expect(c.body).toMatchObject({ error: "essai_perime", baseRevisionId: "r1" });
    expect(instantane()).toBe(avant);
    const e2 = await post("editeur", `${V}/essais`, enveloppe([rectangle("r8")]));
    expect((await post("editeur", `${V}/essais/${e2.body.id}/abandon`)).body.status).toBe("abandonne");
    const c2 = await post("editeur", `${V}/essais/${e2.body.id}/confirmer`);
    expect(c2.status).toBe(409);
    expect(c2.body.error).toBe("essai_abandonne");
    expect((await post("editeur", `${V}/essais`, enveloppe([rectangle("r7")], "r1"))).status).toBe(409);
    expect((await post("lecteur", `${V}/essais`, enveloppe([rectangle("r7")]))).status).toBe(403);
  });
});

describe("TR-EX-088 — résultat de job côté serveur soumis à l'autorisation de l'objet source", () => {
  it("EX-088 [+] / [−] : job lu avec l'autorisation de son étude ; copié vers un autre projet ou par un non-membre, refus sans métadonnée", async () => {
    const e = await post("editeur", `${V}/essais`, enveloppe([rectangle("r9")]));
    const lu = await get("lecteur", `${S}/jobs/${e.body.id}`);
    expect(lu.status).toBe(200);
    expect(lu.body).toMatchObject({ id: e.body.id, studyId: "s", variantId: "v", status: "termine", createdBy: "editeur" });
    const autre = await get("autre" as Acteur, `/projects/q/studio/jobs/${e.body.id}`);
    expect(autre.status).toBe(404);
    expect(autre.body).toEqual({ error: "not_found" });
    const etranger = await get("etranger", `${S}/jobs/${e.body.id}`);
    expect(etranger.status).toBeGreaterThanOrEqual(403);
    expect(JSON.stringify(etranger.body)).not.toContain(e.body.id);
  });
});

describe("TR-IF-001 — contrat d'étude : site, sources, version", () => {
  const contexte = (revision = 3, idParcelle = "parc-1", idSource = "f-1") => ({ version: "studio-contexte-etude/1", site: { parcelles: [{ id: idParcelle, revision }] }, sources: [{ type: "piece-etape", id: idSource }] });
  beforeEach(() => {
    banc.lignes.set(parcels, [{ projectId: "p", id: "parc-1", number: 1, name: "Parcelle 1", crs: "EPSG:2056", parcelNumber: "", data: {}, revision: 3, updatedAt: new Date() }]);
    banc.lignes.set(stepFiles, [{ id: "f-1", projectId: "p", stepNumber: 2, name: "releve.pdf", type: "application/pdf", size: 1, content: Buffer.from("x"), addedAt: new Date() }]);
  });
  it("IF-001 [+] : rattacher une étude à un projet autorisé avec site, sources et version — contexte validé, identifiant stable", async () => {
    const r = await post("editeur", `${S}/studies`, { name: "Étude site", requestId: "etude-site", contexte: contexte() });
    expect(r.status).toBe(201);
    expect(r.body.contexte).toMatchObject({ version: "studio-contexte-etude/1", site: { parcelles: [{ id: "parc-1", revision: 3, numero: 1, nom: "Parcelle 1" }] }, sources: [{ type: "piece-etape", id: "f-1", etape: 2, nom: "releve.pdf" }], validePar: "editeur" });
    const relu = await get("lecteur", `${S}/studies/${r.body.study.id}/contexte`);
    expect(relu.body.contexte.site).toEqual(r.body.contexte.site);
    const rejeu = await post("editeur", `${S}/studies`, { name: "Étude site", requestId: "etude-site", contexte: contexte() });
    expect(rejeu.body.study.id).toBe(r.body.study.id);
    expect(rejeu.body.replayed).toBe(true);
  });
  it("IF-001 [−] : source indisponible, conflit de version, droits insuffisants — erreur explicite sans création partielle", async () => {
    const etudes = lignes(studioStudies).length;
    const s1 = await post("editeur", `${S}/studies`, { name: "X", contexte: contexte(3, "parc-absente") });
    expect(s1.status).toBe(409);
    expect(s1.body).toMatchObject({ error: "source_indisponible", manquantes: [{ type: "parcelle", id: "parc-absente" }] });
    const s2 = await post("editeur", `${S}/studies`, { name: "X", contexte: contexte(3, "parc-1", "f-absente") });
    expect(s2.body.error).toBe("source_indisponible");
    const v = await post("editeur", `${S}/studies`, { name: "X", contexte: contexte(2) });
    expect(v.status).toBe(409);
    expect(v.body).toMatchObject({ error: "conflit_version", conflits: [{ id: "parc-1", declaree: 2, courante: 3 }] });
    expect((await post("lecteur", `${S}/studies`, { name: "X", contexte: contexte() })).status).toBe(403);
    expect((await post("autre" as Acteur, `${S}/studies`, { name: "X", contexte: contexte() })).status).toBe(404);
    expect(lignes(studioStudies).length).toBe(etudes);
    expect(lignes(studioStudyContexts)).toEqual([]);
  });
});

describe("TR-EX-091 / TR-EX-019 — migration de schéma simulée, accordée, appliquée, retirée", () => {
  it("EX-091 [+] : simulation (job) puis accord du propriétaire, application des copies /2 et point de retour arrière", async () => {
    await post("editeur", `${V}/commands`, enveloppe([cote]));
    const sim = await post("editeur", `${S}/studies/s/migrations`, { cible: "studio-document/2" });
    expect(sim.status).toBe(201);
    expect(sim.body).toMatchObject({ statut: "simulee", verdict: "sans-perte", pointRetour: [{ variantId: "v", headRevisionId: tete() }] });
    expect(sim.body.rapport.comptes.cotes.compares).toBeGreaterThan(0);
    expect((await get("lecteur", `${S}/jobs/${sim.body.jobId}`)).body.kind).toBe("simulation-migration");
    const liste = await get("lecteur", `${S}/studies/s/migrations`);
    expect(liste.body.migrations.map((m: { id: string }) => m.id)).toEqual([sim.body.id]);
    const relue = await get("lecteur", `${S}/studies/s/migrations/${sim.body.id}`);
    expect(relue.body).toMatchObject({ statut: "simulee", rapport: { schema: "studio-simulation-migration/1" } });
    expect((await post("editeur", `${S}/studies/s/migrations/${sim.body.id}/accorder`)).status).toBe(403);
    expect((await post("proprietaire", `${S}/studies/s/migrations/${sim.body.id}/appliquer`)).body.error).toBe("migration_etat");
    expect((await post("proprietaire", `${S}/studies/s/migrations/${sim.body.id}/accorder`)).body).toMatchObject({ statut: "accordee", accord: { par: "proprietaire" } });
    const revisionsAvant = JSON.stringify(lignes(studioRevisions));
    const ap = await post("proprietaire", `${S}/studies/s/migrations/${sim.body.id}/appliquer`);
    expect(ap.body).toMatchObject({ statut: "appliquee", documentsMigres: 2 });
    expect(JSON.stringify(lignes(studioRevisions))).toBe(revisionsAvant);
    const doc = await get("lecteur", `${S}/studies/s/migrations/${sim.body.id}/documents/${tete()}`);
    expect(doc.body.document.schemaVersion).toBe("studio-document/2");
    const rb = await post("proprietaire", `${S}/studies/s/migrations/${sim.body.id}/retour-arriere`);
    expect(rb.body).toMatchObject({ statut: "retour-arriere", documentsMigres: 0 });
    expect((await get("lecteur", `${S}/studies/s/migrations/${sim.body.id}/documents/${tete()}`)).status).toBe(404);
    expect(JSON.stringify(lignes(studioRevisions))).toBe(revisionsAvant);
  });
  it("EX-091 [−] : étude changée après la simulation, ou révision non migrable — application et accord refusés, rien n'est supprimé", async () => {
    const sim = await post("editeur", `${S}/studies/s/migrations`, { cible: "studio-document/2" });
    await post("proprietaire", `${S}/studies/s/migrations/${sim.body.id}/accorder`);
    await post("editeur", `${V}/commands`, enveloppe([rectangle("r1")]));
    const ap = await post("proprietaire", `${S}/studies/s/migrations/${sim.body.id}/appliquer`);
    expect(ap.status).toBe(409);
    expect(ap.body.error).toBe("migration_perimee");
    // Révision non migrable (repère inconnu) : verdict « refusee », accord impossible, la révision reste.
    const r1 = lignes(studioRevisions).find((x) => x["id"] === "r1")!;
    r1["document"] = { ...(r1["document"] as object), frame: "local-3d" };
    const sim2 = await post("editeur", `${S}/studies/s/migrations`, { cible: "studio-document/2" });
    expect(sim2.body.verdict).toBe("refusee");
    expect(sim2.body.rapport.revisions.find((x: { id: string }) => x.id === "r1")).toMatchObject({ migree: false });
    expect((await post("proprietaire", `${S}/studies/s/migrations/${sim2.body.id}/accorder`)).body.error).toBe("migration_refusee");
    expect(lignes(studioRevisions).some((x) => x["id"] === "r1")).toBe(true);
  });
});

describe("MIG-COEX-06 — un seul chemin d'écriture à la fois sur l'étude basculée", () => {
  it("MIG-COEX-06 : préparée, l'étude n'écrit pas ; basculée, elle écrit ; retour arrière, elle n'écrit plus — lecture toujours ouverte", async () => {
    expect((await post("editeur", `${S}/bascule/preparer`, { studyId: "s" })).status).toBe(403);
    const p = await post("proprietaire", `${S}/bascule/preparer`, { studyId: "s" });
    expect(p.body).toMatchObject({ autorite: "atelier", ecriture: ["atelier"], lecture: ["atelier", "studio"] });
    const refus = await post("editeur", `${V}/commands`, enveloppe([rectangle("r1")]));
    expect(refus.status).toBe(409);
    expect(refus.body).toMatchObject({ error: "chemin_ecriture", autorite: "atelier" });
    expect((await get("lecteur", V)).status).toBe(200);
    const b = await post("proprietaire", `${S}/bascule/basculer`);
    expect(b.body).toMatchObject({ autorite: "studio", ecriture: ["studio"], pointRetour: { studio: [{ variantId: "v", headRevisionId: "r1" }] } });
    expect((await post("editeur", `${V}/commands`, enveloppe([rectangle("r1")]))).status).toBe(200);
    expect((await post("proprietaire", `${S}/bascule/basculer`)).body.error).toBe("bascule_etat");
    const rb = await post("proprietaire", `${S}/bascule/retour-arriere`);
    expect(rb.body.autorite).toBe("atelier");
    expect(rb.body.historique.map((h: { action: string }) => h.action)).toEqual(["preparer", "basculer", "retour-arriere"]);
    expect((await post("editeur", `${V}/commands`, enveloppe([rectangle("r2", 30)]))).body.error).toBe("chemin_ecriture");
    expect((await get("lecteur", `${S}/bascule`)).body.bascule.autorite).toBe("atelier");
  });
});

describe("TR-EX-002 — périmètre exclu par un motif nommé", () => {
  it("EX-002 [−] : une commande de comptabilité ou de gestion RH est refusée « hors_perimetre », rien n'est écrit", async () => {
    const avant = instantane();
    for (const toolId of ["studio.comptabilite.facture", "studio.rh.conges"]) {
      const r = await post("editeur", `${V}/commands`, enveloppe([{ toolId, params: {} }]));
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: "hors_perimetre", code: "hors-perimetre" });
    }
    expect(instantane()).toBe(avant);
  });
});
