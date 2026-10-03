/**
 * Service de commandes de l'Atelier (lot 2) contre la vraie base `fadi_test` : idempotence (T06), unités (T03),
 * documents périmés (T07), conflits entre deux comptes (T08), droits et réservation (T10), annuler / rétablir,
 * import typé de P.118 et persistance par différentiel.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";

const app = createApp();
const CONTRAT = "atelier-commands/1";
const m = (value: number) => ({ value, unit: "m" });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });

async function resetDb() {
  await pool.query(
    "TRUNCATE atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, architectural_objects, atelier_store, levels, parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE",
  );
}
beforeAll(resetDb);
beforeEach(resetDb);
afterAll(async () => {
  await pool.end();
});

async function registerAndLogin(email: string) {
  const client = request.agent(app);
  const res = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return client;
}

async function projetVide(client: ReturnType<typeof request.agent>) {
  const created = await client.post("/projects").send({ code: "P.1", name: "Atelier test" });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

const enveloppe = (requestId: string, baseRevision: number, commands: unknown[], label = "test") => ({ requestId, baseRevision, contract: CONTRAT, label, commands });
const niveau = { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3.2 } };
const mur = (id: string, dx = 4) => ({ type: "mur.tracer", params: { id, niveauId: "rdc", a: pt(0, 0), b: pt(dx, 0), epaisseur: m(0.2), hauteur: m(3.2) } });

describe("POST /projects/:id/atelier/commands", () => {
  it("valide un lot, avance la révision, journalise, et rejoue une requête répétée sans réappliquer (T06)", async () => {
    const client = await registerAndLogin("cmd@example.com");
    const pid = await projetVide(client);
    const premier = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("r1", 0, [niveau, mur("m1")], "Niveau et mur"));
    expect(premier.status).toBe(200);
    expect(premier.body).toMatchObject({ revision: 1, applique: [{ type: "niveau.creer", objetIds: ["rdc"] }, { type: "mur.tracer", objetIds: ["m1"] }] });
    expect(premier.body.effets.crees.sort()).toEqual(["m1", "rdc"]);
    const rejoue = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("r1", 0, [niveau, mur("m1")], "Niveau et mur"));
    expect(rejoue.status).toBe(200);
    expect(rejoue.body).toMatchObject({ revision: 1, rejouee: true });
    const modele = await client.get(`/projects/${pid}/atelier/model`);
    expect(modele.status).toBe(200);
    expect(modele.body.revision).toBe(1);
    expect(Object.keys(modele.body.modele.objets)).toEqual(["m1"]);
    expect(modele.body.modele.objets.m1.params.a).toEqual(pt(0, 0));
    expect((await client.get(`/projects/${pid}`)).body.modelRevision).toBe(1);
    const journal = await client.get(`/projects/${pid}/atelier/journal?apres=0`);
    expect(journal.body.entrees).toHaveLength(1);
    expect(journal.body.entrees[0]).toMatchObject({ kind: "commande", requestId: "r1", baseRevision: 0, resultRevision: 1, label: "Niveau et mur" });
    const outbox = await pool.query("SELECT event_type, processed_at IS NOT NULL AS done FROM atelier_outbox WHERE project_id = $1", [pid]);
    expect(outbox.rows).toEqual([{ event_type: "atelier.commande.validee", done: true }]);
  });

  it("refuse une grandeur sans unité (400, T03) et une commande inconnue, sans toucher à la révision", async () => {
    const client = await registerAndLogin("units@example.com");
    const pid = await projetVide(client);
    const sansUnite = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("u1", 0, [niveau, { type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: 0.2 } }]));
    expect(sansUnite.status).toBe(400);
    expect(sansUnite.body.erreur).toBe("invalide");
    expect(sansUnite.body.details[0].chemin).toBe("commands[1].epaisseur");
    expect(sansUnite.body.details[0].message).toMatch(/unité incompatible/);
    const inconnue = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("u2", 0, [{ type: "mur.voler", params: {} }]));
    expect(inconnue.status).toBe(400);
    const malForme = await client.post(`/projects/${pid}/atelier/commands`).send({ requestId: "u3", baseRevision: 0, contract: "autre", commands: [] });
    expect(malForme.status).toBe(400);
    expect((await client.get(`/projects/${pid}`)).body.modelRevision).toBe(0);
    expect((await client.get(`/projects/${pid}/atelier/model`)).status).toBe(404);
  });

  it("répond 409 détaillé sur une révision de base dépassée, avec les objets touchés entre-temps (T08)", async () => {
    const owner = await registerAndLogin("owner-conf@example.com");
    const editor = await registerAndLogin("editor-conf@example.com");
    const pid = await projetVide(owner);
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "editor-conf@example.com", role: "editeur" })).status).toBe(201);
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("c1", 0, [niveau, mur("m1")]))).status).toBe(200);
    // Les deux lisent la révision 1 ; le propriétaire modifie m1 d'abord.
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("c2", 1, [{ type: "mur.modifier", params: { id: "m1", params: { epaisseur: m(0.3) } } }], "Épaisseur"))).status).toBe(200);
    const stale = await editor.post(`/projects/${pid}/atelier/commands`).send(enveloppe("c3", 1, [{ type: "mur.modifier", params: { id: "m1", params: { hauteur: m(2.8) } } }]));
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ erreur: "conflit", motif: "revision", baseRevision: 1, revisionCourante: 2 });
    expect(stale.body.conflits).toHaveLength(1);
    expect(stale.body.conflits[0]).toMatchObject({ objetId: "m1", revision: 2 });
    expect(stale.body.conflits[0].etatServeur.params.epaisseur).toEqual(m(0.3));
    // Rebase explicite : même lot sur la révision courante, validé.
    const rebase = await editor.post(`/projects/${pid}/atelier/commands`).send(enveloppe("c3", 2, [{ type: "mur.modifier", params: { id: "m1", params: { hauteur: m(2.8) } } }]));
    expect(rebase.status).toBe(200);
    expect(rebase.body.revision).toBe(3);
    const modele = (await owner.get(`/projects/${pid}/atelier/model`)).body.modele;
    expect(modele.objets.m1.params).toMatchObject({ epaisseur: m(0.3), hauteur: m(2.8) });
    // Un objet supprimé par autrui ne réapparaît pas : précondition → 409.
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("c4", 3, [{ type: "mur.supprimer", params: { id: "m1" } }]))).status).toBe(200);
    const fantome = await editor.post(`/projects/${pid}/atelier/commands`).send(enveloppe("c5", 4, [{ type: "mur.modifier", params: { id: "m1", params: { hauteur: m(3) } } }]));
    expect(fantome.status).toBe(409);
    expect(fantome.body.motif).toBe("precondition");
  });

  it("applique les droits : lecteur refusé (403), étranger introuvable (404), réservation d'autrui (423) (T10)", async () => {
    const owner = await registerAndLogin("owner-rights@example.com");
    const reader = await registerAndLogin("reader-rights@example.com");
    const stranger = await registerAndLogin("stranger-rights@example.com");
    const pid = await projetVide(owner);
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "reader-rights@example.com", role: "lecteur" })).status).toBe(201);
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("d1", 0, [niveau]))).status).toBe(200);
    expect((await reader.get(`/projects/${pid}/atelier/model`)).status).toBe(200);
    expect((await reader.post(`/projects/${pid}/atelier/commands`).send(enveloppe("d2", 1, [mur("m1")]))).status).toBe(403);
    expect((await stranger.get(`/projects/${pid}/atelier/model`)).status).toBe(404);
    expect((await stranger.post(`/projects/${pid}/atelier/commands`).send(enveloppe("d3", 1, [mur("m1")]))).status).toBe(404);
    // Réservation d'édition par le propriétaire : un éditeur est refusé 423.
    const editor = await registerAndLogin("editor-rights@example.com");
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "editor-rights@example.com", role: "editeur" })).status).toBe(201);
    expect((await owner.put(`/projects/${pid}/lock`)).status).toBe(200);
    const locked = await editor.post(`/projects/${pid}/atelier/commands`).send(enveloppe("d4", 1, [mur("m1")]));
    expect(locked.status).toBe(423);
    expect((await owner.get(`/projects/${pid}`)).body.modelRevision).toBe(1);
  });

  it("annule et rétablit par le journal : chaque inverse est une nouvelle microversion, l'état revient exactement", async () => {
    const client = await registerAndLogin("undo@example.com");
    const pid = await projetVide(client);
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("a1", 0, [niveau]))).status).toBe(200);
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("a2", 1, [mur("m1")], "Mur"))).status).toBe(200);
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("a3", 2, [{ type: "ouverture.poser", params: { id: "p1", classe: "porte", murHoteId: "m1", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } }], "Porte"))).status).toBe(200);
    const avant = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    const undo1 = await client.post(`/projects/${pid}/atelier/commands/annuler`).send({ requestId: "undo-1", baseRevision: 3 });
    expect(undo1.status).toBe(200);
    expect(undo1.body.revision).toBe(4);
    expect(undo1.body.effets.supprimes).toEqual(["p1"]);
    let modele = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    expect(Object.keys(modele.objets)).toEqual(["m1"]);
    const undo2 = await client.post(`/projects/${pid}/atelier/commands/annuler`).send({ requestId: "undo-2", baseRevision: 4 });
    expect(undo2.body.revision).toBe(5);
    modele = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    expect(Object.keys(modele.objets)).toEqual([]);
    const redo1 = await client.post(`/projects/${pid}/atelier/commands/retablir`).send({ requestId: "redo-1", baseRevision: 5 });
    expect(redo1.status).toBe(200);
    expect(redo1.body.revision).toBe(6);
    const redo2 = await client.post(`/projects/${pid}/atelier/commands/retablir`).send({ requestId: "redo-2", baseRevision: 6 });
    expect(redo2.body.revision).toBe(7);
    modele = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    expect(JSON.stringify(modele)).toBe(JSON.stringify(avant));
    // Plus rien à rétablir ; une révision de base périmée est refusée aussi pour une annulation.
    expect((await client.post(`/projects/${pid}/atelier/commands/retablir`).send({ requestId: "redo-3", baseRevision: 7 })).status).toBe(409);
    expect((await client.post(`/projects/${pid}/atelier/commands/annuler`).send({ requestId: "undo-3", baseRevision: 6 })).status).toBe(409);
    // Une nouvelle commande après une annulation vide la pile de rétablissement.
    expect((await client.post(`/projects/${pid}/atelier/commands/annuler`).send({ requestId: "undo-4", baseRevision: 7 })).status).toBe(200);
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("a4", 8, [mur("m2", 2)]))).status).toBe(200);
    expect((await client.post(`/projects/${pid}/atelier/commands/retablir`).send({ requestId: "redo-4", baseRevision: 9 })).status).toBe(409);
    const journal = (await client.get(`/projects/${pid}/atelier/journal?apres=0`)).body.entrees as { kind: string; resultRevision: number }[];
    expect(journal.map((e) => e.kind)).toEqual(["commande", "commande", "commande", "annulation", "annulation", "retablissement", "retablissement", "annulation", "commande"]);
    expect(journal.map((e) => e.resultRevision)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("exécute à blanc sans transaction (essai) et liste les problèmes", async () => {
    const client = await registerAndLogin("essai@example.com");
    const pid = await projetVide(client);
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("e1", 0, [niveau, mur("m1"), { type: "ouverture.poser", params: { id: "p1", classe: "porte", murHoteId: "m1", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } }]))).status).toBe(200);
    const essai = await client.post(`/projects/${pid}/atelier/commands/essai`).send(enveloppe("e2", 1, [{ type: "mur.scinder", params: { id: "m1", t: 0.2 } }]));
    expect(essai.status).toBe(200);
    expect(essai.body.ok).toBe(true);
    expect(essai.body.effets.crees).toHaveLength(2);
    expect((await client.get(`/projects/${pid}`)).body.modelRevision).toBe(1);
    const refus = await client.post(`/projects/${pid}/atelier/commands/essai`).send(enveloppe("e3", 1, [{ type: "mur.scinder", params: { id: "m1", t: 0.5 } }]));
    expect(refus.status).toBe(409);
    expect(refus.body.conflits[0].motif).toMatch(/emprise/);
    const problemes = await client.get(`/projects/${pid}/atelier/problemes`);
    expect(problemes.status).toBe(200);
    expect(problemes.body).toMatchObject({ revision: 1, references: [], problemes: [], documentsPerimes: [] });
    expect(problemes.body.bilan).toHaveProperty("reserves");
  });
});

describe("modèle typé de l'exemple P.118 et fraîcheur des documents", () => {
  it("importe P.118 dans le modèle typé à l'import de l'exemple et sert ses niveaux", async () => {
    const client = await registerAndLogin("p118-typed@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    expect(imported.status).toBe(201);
    const pid = imported.body.id as string;
    const modele = await client.get(`/projects/${pid}/atelier/model`);
    expect(modele.status).toBe(200);
    expect(modele.body.revision).toBe(1);
    expect(modele.body.nativeId).toBe("p118-demo-v819");
    expect(Object.keys(modele.body.modele.niveaux)).toHaveLength(6);
    expect(Object.keys(modele.body.modele.objets)).toHaveLength(1753);
    expect(modele.body.modele.site.parcelle.crs).toBe("EPSG:26191");
    const rdc = await client.get(`/projects/${pid}/atelier/model/niveaux/rdc`);
    expect(rdc.status).toBe(200);
    expect(rdc.body.niveau).toMatchObject({ nom: "RDC", elevation: 0, hauteur: 3.2 });
    expect(rdc.body.objets.filter((o: { classe: string }) => o.classe === "mur")).toHaveLength(39);
    const journal = (await client.get(`/projects/${pid}/atelier/journal?apres=0`)).body.entrees;
    expect(journal[0]).toMatchObject({ label: "Import de l'exemple P.118", resultRevision: 1 });
    const problemes = (await client.get(`/projects/${pid}/atelier/problemes`)).body;
    expect(problemes.problemes.length).toBe(37);
  });

  it("périme les documents produits avant une commande validée (T07) et ne réécrit que le différentiel", async () => {
    const client = await registerAndLogin("fresh@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const copy = await client.post(`/projects/${pid}/copies`).send({ name: "Copie de travail" });
    expect(copy.status).toBe(201);
    const wid = copy.body.id as string;
    expect((await client.get(`/projects/${wid}/documents/surfaces`)).status).toBe(200);
    const docsAvant = (await client.get(`/projects/${wid}/documents`)).body.documents as { kind: string; freshness: string | null }[];
    expect(docsAvant.find((d) => d.kind === "tableau-surfaces")?.freshness).toBe("a-jour");
    const revision = (await client.get(`/projects/${wid}`)).body.modelRevision as number;
    const objetsAvant = await pool.query("SELECT id, model_revision FROM atelier_objets WHERE project_id = $1 AND id = 'EX118-mezz-W-009'", [wid]);
    const r = await client.post(`/projects/${wid}/atelier/commands`).send(enveloppe("f1", revision, [{ type: "mur.modifier", params: { id: "EX118-mezz-W-009", params: { hauteur: m(2.9) } } }], "Hauteur mezzanine"));
    expect(r.status).toBe(200);
    expect(r.body.revision).toBe(revision + 1);
    const docsApres = (await client.get(`/projects/${wid}/documents`)).body.documents as { kind: string; freshness: string | null }[];
    expect(docsApres.find((d) => d.kind === "tableau-surfaces")?.freshness).toBe("perime");
    const objetsApres = await pool.query("SELECT id, model_revision FROM atelier_objets WHERE project_id = $1 AND id = 'EX118-mezz-W-009'", [wid]);
    expect(objetsApres.rows[0].model_revision).toBe(objetsAvant.rows[0].model_revision + 1);
    const inchanges = await pool.query("SELECT count(*)::int AS n FROM atelier_objets WHERE project_id = $1 AND model_revision = $2", [wid, revision + 1]);
    expect(inchanges.rows[0].n).toBe(1);
    const problemes = (await client.get(`/projects/${wid}/atelier/problemes`)).body;
    expect(problemes.documentsPerimes.some((d: { kind: string }) => d.kind === "tableau-surfaces")).toBe(true);
  });

  it("importe le magasin natif à la demande (transition), et refuse d'écraser un modèle existant sans l'option", async () => {
    const client = await registerAndLogin("natif@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const refus = await client.post(`/projects/${pid}/atelier/model/importer-natif`).send({});
    expect(refus.status).toBe(409);
    const ok = await client.post(`/projects/${pid}/atelier/model/importer-natif`).send({ remplacer: true });
    expect(ok.status).toBe(200);
    expect(ok.body.revision).toBe(2);
    expect(ok.body.rapport.lignes.find((l: { famille: string }) => l.famille === "walls")).toMatchObject({ source: 220, cible: 220 });
    expect(Object.keys((await client.get(`/projects/${pid}/atelier/model`)).body.modele.objets)).toHaveLength(1753);
  });
});
