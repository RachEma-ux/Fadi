/**
 * Service de commandes de l'Atelier (lot 2) contre la vraie base `fadi_test` : idempotence (T06), unités (T03),
 * documents périmés (T07), conflits entre deux comptes (T08), droits et réservation (T10), annuler / rétablir,
 * import typé de P.118 et persistance par différentiel.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { basculerAncienMoteur } from "../db/bascule.js";

const app = createApp();
const CONTRAT = "atelier-commands/1";
const m = (value: number) => ({ value, unit: "m" });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });

async function resetDb() {
  await pool.query(
    "TRUNCATE volumes, atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE",
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

  it("archive version 2 : le modèle typé fait l'aller-retour à l'identique ; un modèle altéré est refusé en entier", async () => {
    const client = await registerAndLogin("archive-type@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const archive = JSON.parse((await client.get(`/projects/${pid}/archive`)).text);
    expect(archive.version).toBe(2);
    // Manifeste du paquet natif (lot 6) : versions, unités, repères, identités, catalogues.
    expect(archive.manifeste).toMatchObject({ format: "fadi-paquet-natif", version: 1, schemas: { archive: 2, modeleAtelier: 1, contratCommandes: CONTRAT, ifc: "IFC4X3_ADD2" }, unites: { longueur: "m", angle: "deg" }, identites: { revision: 1 } });
    expect(archive.manifeste.identites.empreinteModele).toMatch(/^[0-9a-f]{16}$/);
    expect(archive.manifeste.reperes.cadastral.crs).toBe(archive.modele.etat.site.parcelle.crs);
    const futur = await client.post("/projects/import").set("Content-Type", "application/json").send({ ...archive, manifeste: { ...archive.manifeste, version: 99 } });
    expect(futur.status).toBe(422);
    expect(futur.body.message).toMatch(/version plus récente/);
    const retour = await client.post("/projects/import").set("Content-Type", "application/json").send(archive);
    expect(retour.status).toBe(201);
    const copie = retour.body.projects[0].id as string;
    const avant = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    const apres = (await client.get(`/projects/${copie}/atelier/model`)).body.modele;
    expect(apres).toEqual(avant);
    // Une grandeur sans unité dans l'archive : refus 422, aucun projet créé.
    const murId = Object.keys(archive.modele.etat.objets).find((k) => archive.modele.etat.objets[k].classe === "mur")!;
    archive.modele.etat.objets[murId].params.epaisseur = 0.2;
    const nb = (await client.get("/projects")).body.length;
    const refus = await client.post("/projects/import").set("Content-Type", "application/json").send(archive);
    expect(refus.status).toBe(422);
    expect(refus.body.error).toBe("archive_model");
    expect(refus.body.details.some((d: string) => d.includes(murId))).toBe(true);
    expect((await client.get("/projects")).body.length).toBe(nb);
  });

  it("bascule : un projet resté sur l'ancien magasin du moteur V14 est repris dans le modèle typé, puis les anciennes tables disparaissent", async () => {
    const client = await registerAndLogin("bascule@example.com");
    const pid = (await client.post("/projects").send({ code: "P.OLD", name: "Ancien moteur" })).body.id as string;
    const jeu = JSON.parse(readFileSync(new URL("../data/examples/p118-native-model.json", import.meta.url), "utf8")) as { nativeId: string; registry: unknown; domains: Record<string, unknown> };
    // Base telle qu'avant le lot 4 : la table de l'ancien moteur existe et porte le dessin du projet.
    await pool.query("CREATE TABLE IF NOT EXISTS atelier_store (project_id text NOT NULL REFERENCES projects (id) ON DELETE CASCADE, key text NOT NULL, value jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (project_id, key))");
    const p = "design.v13.";
    const lignes: [string, unknown][] = [[`${p}activeProject`, jeu.nativeId], [`${p}registry`, [jeu.registry]], ...Object.entries(jeu.domains).map(([d, v]) => [`${p}project.${jeu.nativeId}.${d}`, v] as [string, unknown])];
    for (const [key, value] of lignes) await pool.query("INSERT INTO atelier_store (project_id, key, value) VALUES ($1, $2, $3)", [pid, key, JSON.stringify(value)]);
    await pool.query("UPDATE projects SET model_revision = 3 WHERE id = $1", [pid]);
    const r = await basculerAncienMoteur(pool);
    expect(r).toEqual({ convertis: 1, supprimees: true });
    const model = (await client.get(`/projects/${pid}/atelier/model`)).body;
    expect(Object.keys(model.modele.objets)).toHaveLength(1753);
    expect(model.revision).toBe(3);
    const journal = (await client.get(`/projects/${pid}/atelier/journal?apres=0`)).body.entrees;
    expect(journal[0].label).toBe("Reprise du dessin de l'ancien Atelier (bascule)");
    expect((await pool.query("SELECT to_regclass('public.atelier_store') AS t")).rows[0].t).toBeNull();
    // Idempotente : une seconde passe ne fait rien.
    expect(await basculerAncienMoteur(pool)).toEqual({ convertis: 0, supprimees: false });
  });
});

describe("documents dérivés de l'Atelier au catalogue (lot 5)", () => {
  it("vue et feuille produites à la révision courante (PDF, DXF, SVG), à jour puis périmées après une commande ; tableaux identiques d'une génération à l'autre", async () => {
    const client = await registerAndLogin("docs@example.com");
    const pid = await projetVide(client);
    const r = await client.post(`/projects/${pid}/atelier/commands`).send(
      enveloppe("d1", 0, [
        niveau,
        mur("m1", 6),
        { type: "vue.creer", params: { id: "v1", type: "plan", titre: "Plan du RDC", echelle: 50, niveauId: "rdc" } },
        { type: "feuille.creer", params: { id: "f1", titre: "Plans", numero: "A-101", format: "A3", orientation: "paysage", vues: [{ vueId: "v1", x: 150, y: 180 }] } },
      ]),
    );
    expect(r.status).toBe(200);
    const pdf = await client.get(`/projects/${pid}/documents/atelier/feuilles/f1.pdf`).buffer(true).parse((res, cb) => {
      const parts: Buffer[] = [];
      res.on("data", (c: Buffer) => parts.push(c));
      res.on("end", () => cb(null, Buffer.concat(parts)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(pdf.headers["x-model-revision"]).toBe("1");
    const dxf = await client.get(`/projects/${pid}/documents/atelier/vues/v1.dxf`);
    expect(dxf.status).toBe(200);
    expect(dxf.text).toContain("AC1009");
    const svg = await client.get(`/projects/${pid}/documents/atelier/vues/v1.svg`);
    expect(svg.status).toBe(200);
    const csv1 = await client.get(`/projects/${pid}/documents/atelier/tableaux/murs.csv`);
    const csv2 = await client.get(`/projects/${pid}/documents/atelier/tableaux/murs.csv`);
    expect(csv1.status).toBe(200);
    expect(csv1.text).toBe(csv2.text);
    let cat = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; group: string; freshness: string | null }[];
    expect(cat.find((d) => d.kind === "atelier-feuille-f1-pdf")).toMatchObject({ group: "atelier", freshness: "a-jour" });
    expect(cat.find((d) => d.kind === "atelier-vue-v1-dxf")!.freshness).toBe("a-jour");
    expect(cat.find((d) => d.kind === "atelier-vue-v1-pdf")!.freshness).toBeNull();
    await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("d2", 1, [{ type: "objet.modifier", params: { id: "m1", params: { epaisseur: m(0.3) } } }]));
    cat = (await client.get(`/projects/${pid}/documents`)).body.documents;
    expect(cat.find((d) => d.kind === "atelier-feuille-f1-pdf")!.freshness).toBe("perime");
    expect((await client.get(`/projects/${pid}/documents/atelier/feuilles/inconnue.pdf`)).status).toBe(404);
    expect((await client.get(`/projects/${pid}/documents/atelier/tableaux/f1.pdf`)).status).toBe(404);
  });
});

describe("échanges IFC (lot 6)", () => {
  it("P.118 exporté au catalogue (IFC 4.3, reproductible), réimporté dans un autre projet en représentations, avec rapport ; réimport sans doublon", async () => {
    const client = await registerAndLogin("ifc@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const lireTexte = (res: request.Response) => res.text ?? "";
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    expect(ifc.status).toBe(200);
    expect(ifc.headers["content-type"]).toMatch(/application\/x-step/);
    expect(ifc.headers["content-disposition"]).toMatch(/_revision_1\.ifc/);
    const texte = lireTexte(ifc);
    expect(texte).toContain("FILE_SCHEMA(('IFC4X3_ADD2'));");
    expect(lireTexte(await client.get(`/projects/${pid}/documents/atelier/modele.ifc`))).toBe(texte);
    const docs = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; freshness: string | null }[];
    expect(docs.find((d) => d.kind === "atelier-ifc")!.freshness).toBe("a-jour");
    const source = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    const murs = Object.values(source.objets as Record<string, { classe: string }>).filter((o) => o.classe === "mur").length;

    const cible = await projetVide(client);
    const refus = await client.post(`/projects/${cible}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").send(Buffer.from("pas un ifc"));
    expect(refus.status).toBe(400);
    const r = await client.post(`/projects/${cible}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").set("X-File-Name", encodeURIComponent("P118 révision 1.ifc")).send(Buffer.from(texte));
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("P118 révision 1.ifc");
    expect(r.body.lots).toBeGreaterThan(1);
    expect(r.body.revision).toBe(r.body.lots);
    const murIfc = r.body.rapport.classes.find((l: { classe: string }) => l.classe === "IfcWall");
    expect(murIfc).toMatchObject({ source: murs, cible: murs });
    expect(r.body.rapport.remarques.some((t: string) => t.includes("pas de parcelle"))).toBe(true);
    const modele = (await client.get(`/projects/${cible}/atelier/model`)).body.modele;
    const importes = Object.values(modele.objets as Record<string, { classe: string; params: { globalId: string } }>).filter((o) => o.classe === "objet-importe");
    expect(importes.length).toBe(r.body.rapport.classes.reduce((n: number, l: { cible: number }) => n + l.cible, 0));
    expect(Object.keys(modele.niveaux).length).toBe(Object.keys(source.niveaux).length);
    // Le même fichier une seconde fois : aucun objet en double.
    const encore = await client.post(`/projects/${cible}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").send(Buffer.from(texte));
    expect(encore.status).toBe(200);
    expect((await client.get(`/projects/${cible}/atelier/model`)).body.modele.objets).toEqual(modele.objets);
    // Droits : un étranger ne voit ni n'importe rien.
    const etranger = await registerAndLogin("ifc-etranger@example.com");
    expect((await etranger.post(`/projects/${cible}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").send(Buffer.from(texte))).status).toBe(404);
    expect((await etranger.get(`/projects/${pid}/documents/atelier/modele.ifc`)).status).toBe(404);
    // Une commande périme l'export au catalogue.
    expect((await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("apres-ifc", 1, [{ type: "niveau.modifier", params: { id: Object.keys(source.niveaux)[0], nom: "Renommé" } }]))).status).toBe(200);
    const apres = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; freshness: string | null }[];
    expect(apres.find((d) => d.kind === "atelier-ifc")!.freshness).toBe("perime");
  }, 60_000);
});

describe("versions, variantes, publications, verrous (lot 7)", () => {
  const modele = async (client: ReturnType<typeof request.agent>, pid: string, revision?: number) => (await client.get(`/projects/${pid}/atelier/model${revision === undefined ? "" : `?revision=${revision}`}`)).body;
  const envoyer = async (client: ReturnType<typeof request.agent>, pid: string, id: string, base: number, commands: unknown[]) => client.post(`/projects/${pid}/atelier/commands`).send(enveloppe(id, base, commands, id));

  it("révision passée reconstituée exactement ; version nommée immuable, comparée, restaurée en une nouvelle révision", async () => {
    const client = await registerAndLogin("versions@example.com");
    const pid = await projetVide(client);
    expect((await envoyer(client, pid, "v1", 0, [niveau, mur("m1"), mur("m2", 6)])).status).toBe(200);
    const r1 = (await modele(client, pid)).modele;
    expect((await envoyer(client, pid, "v2", 1, [{ type: "objet.modifier", params: { id: "m1", params: { epaisseur: m(0.3) } } }])).status).toBe(200);
    expect((await envoyer(client, pid, "v3", 2, [{ type: "objet.supprimer", params: { id: "m2" } }])).status).toBe(200);
    const passe = await modele(client, pid, 1);
    expect(passe).toMatchObject({ revision: 1, revisionCourante: 3, lectureSeule: true });
    expect(passe.modele).toEqual(r1);
    expect((await modele(client, pid, 0)).modele.objets).toEqual({});
    expect((await client.get(`/projects/${pid}/atelier/model?revision=9`)).status).toBe(404);
    expect((await client.get(`/projects/${pid}/atelier/model?revision=-1`)).status).toBe(400);
    // Version nommée à la révision 1, nom unique (casse ignorée).
    const v = await client.post(`/projects/${pid}/atelier/versions`).send({ nom: "Esquisse", revision: 1 });
    expect(v.status).toBe(201);
    expect(v.body).toMatchObject({ nom: "Esquisse", revision: 1 });
    expect((await client.post(`/projects/${pid}/atelier/versions`).send({ nom: "esquisse" })).status).toBe(409);
    expect((await client.get(`/projects/${pid}/atelier/versions/${v.body.id}`)).body.modele).toEqual(r1);
    const cmp = await client.get(`/projects/${pid}/atelier/comparer?de=v:${v.body.id}&a=courante`);
    expect(cmp.body.difference).toMatchObject({ ajoutes: [], supprimes: [{ id: "m2" }], modifies: [{ id: "m1", champs: ["epaisseur"] }] });
    // Restaurer : nouvelle révision, état identique à la version ; l'historique reste.
    const rest = await client.post(`/projects/${pid}/atelier/versions/${v.body.id}/restaurer`).send({ requestId: "rest-1", baseRevision: 3 });
    expect(rest.status).toBe(200);
    expect(rest.body.revision).toBe(4);
    expect((await modele(client, pid)).modele).toEqual(r1);
    expect((await client.get(`/projects/${pid}/atelier/comparer?de=v:${v.body.id}`)).body.difference.identiques).toBe(true);
    expect((await client.post(`/projects/${pid}/atelier/versions/${v.body.id}/restaurer`).send({ requestId: "rest-2", baseRevision: 4 })).body).toMatchObject({ revision: 4, inchange: true });
    // Lecteur : consulter oui, créer non.
    const lecteur = await registerAndLogin("versions-lecteur@example.com");
    expect((await client.post(`/projects/${pid}/members`).send({ email: "versions-lecteur@example.com", role: "lecteur" })).status).toBe(201);
    expect((await lecteur.get(`/projects/${pid}/atelier/versions`)).body.versions).toHaveLength(1);
    expect((await lecteur.post(`/projects/${pid}/atelier/versions`).send({ nom: "X" })).status).toBe(403);
  });

  it("variante créée, modifiée, fusionnée par rejeu validé ; conflit explicite entre deux comptes, fusion refusée puis acceptée « variante prioritaire »", async () => {
    const owner = await registerAndLogin("variante@example.com");
    const pid = await projetVide(owner);
    expect((await envoyer(owner, pid, "t1", 0, [niveau, mur("m1"), mur("m2", 6)])).status).toBe(200);
    const cree = await owner.post(`/projects/${pid}/atelier/variantes`).send({ nom: "Façade ouverte" });
    expect(cree.status).toBe(201);
    const vid = cree.body.id as string;
    const infos = (await owner.get(`/projects/${vid}/atelier/variantes`)).body;
    expect(infos.tronc).toMatchObject({ id: pid, nom: "Façade ouverte", forkRevision: 1, statut: "ouverte" });
    const base = infos.tronc.baseRevision as number;
    // Dans la variante : une porte sur m1, un nouveau mur créé sans identifiant (identifiant engendré), puis modifié.
    expect((await envoyer(owner, vid, "var-1", base, [{ type: "ouverture.poser", params: { id: "p1", classe: "porte", murHoteId: "m1", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } }, { type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 3), b: pt(4, 3), epaisseur: m(0.2), hauteur: m(3) } }])).status).toBe(200);
    const nouveau = Object.keys((await modele(owner, vid)).modele.objets).find((k) => !["m1", "m2", "p1"].includes(k))!;
    expect((await envoyer(owner, vid, "var-2", base + 1, [{ type: "objet.modifier", params: { id: nouveau, params: { epaisseur: m(0.25) } } }, { type: "objet.modifier", params: { id: "m2", params: { hauteur: m(2.8) } } }])).status).toBe(200);
    let essai = (await owner.get(`/projects/${pid}/atelier/variantes/${vid}/fusion`)).body;
    expect(essai.affectes).toEqual({ crees: [nouveau, "p1"].sort(), modifies: ["m2"], supprimes: [] });
    expect(essai.conflits).toEqual([]);
    expect(essai.rejeu).toEqual({ ok: true });
    // Un second compte modifie m2 dans le tronc : conflit explicite.
    const editeur = await registerAndLogin("variante-editeur@example.com");
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "variante-editeur@example.com", role: "editeur" })).status).toBe(201);
    expect((await envoyer(editeur, pid, "t2", 1, [{ type: "objet.modifier", params: { id: "m2", params: { hauteur: m(3.5) } } }])).status).toBe(200);
    essai = (await owner.get(`/projects/${pid}/atelier/variantes/${vid}/fusion`)).body;
    expect(essai.conflits).toEqual([{ objetId: "m2", tronc: { label: "t2", revision: 2 }, variante: { label: "var-2", revision: base + 2 } }]);
    const refus = await owner.post(`/projects/${pid}/atelier/variantes/${vid}/fusion`).send({ baseRevision: 2 });
    expect(refus.status).toBe(409);
    expect(refus.body).toMatchObject({ motif: "fusion", conflits: [{ objetId: "m2" }] });
    const ok = await owner.post(`/projects/${pid}/atelier/variantes/${vid}/fusion`).send({ baseRevision: 2, strategie: "variante-prioritaire" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ revision: 4, lots: 2 });
    const tronc = (await modele(owner, pid)).modele;
    const variante = (await modele(owner, vid)).modele;
    expect(tronc.objets).toEqual(variante.objets);
    expect((await owner.get(`/projects/${pid}/atelier/variantes`)).body.variantes[0]).toMatchObject({ id: vid, statut: "fusionnee", fusionRevision: 4 });
    expect((await owner.post(`/projects/${pid}/atelier/variantes/${vid}/fusion`).send({ baseRevision: 4 })).status).toBe(409);
    // Un étranger ne voit pas la variante.
    const etranger = await registerAndLogin("variante-etranger@example.com");
    expect((await etranger.get(`/projects/${pid}/atelier/variantes/${vid}/fusion`)).status).toBe(404);
  });

  it("publication figée (T12) : version, catalogues et documents retrouvés exactement ; restaurable après des modifications", async () => {
    const client = await registerAndLogin("publication@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const pid = imported.body.id as string;
    const avant = (await modele(client, pid)).modele;
    const pub = await client.post(`/projects/${pid}/atelier/publications`).send({ nom: "Permis de construire" });
    expect(pub.status).toBe(201);
    expect(pub.body).toMatchObject({ nom: "Permis de construire", revision: 1, catalogues: { contratCommandes: CONTRAT, schemaIfc: "IFC4X3_ADD2" } });
    const kinds = (pub.body.documents as { kind: string }[]).map((d) => d.kind);
    expect(kinds).toEqual(expect.arrayContaining(["atelier-ifc", "atelier-quantites", "atelier-tableau-pieces"]));
    const detail = (await client.get(`/projects/${pid}/atelier/publications/${pub.body.id}`)).body;
    expect(detail).toMatchObject({ revision: 1, version: { revision: 1 }, ecarts: [] });
    // Chaque fichier est restitué tel qu'il a été figé (SHA-256 du contenu = identifiant du volume).
    const crypto = await import("node:crypto");
    for (const d of detail.documents as { volumeId: string; kind: string }[]) {
      const f = await client.get(`/projects/${pid}/atelier/publications/${pub.body.id}/fichiers/${d.volumeId}`).buffer(true).parse((res, cb) => {
        const parts: Buffer[] = [];
        res.on("data", (c: Buffer) => parts.push(c));
        res.on("end", () => cb(null, Buffer.concat(parts)));
      });
      expect(f.status).toBe(200);
      expect(crypto.createHash("sha256").update(f.body as Buffer).digest("hex")).toBe(d.volumeId);
    }
    // Le tableau des pièces publié est celui que le catalogue produit à la même révision.
    const csvPublie = detail.documents.find((d: { kind: string }) => d.kind === "atelier-tableau-pieces");
    const csvCatalogue = await client.get(`/projects/${pid}/documents/atelier/tableaux/pieces.csv`);
    expect(crypto.createHash("sha256").update(csvCatalogue.text).digest("hex")).toBe(csvPublie.volumeId);
    // La conception continue ; la publication se restaure avec sa version.
    const premierMur = Object.keys(avant.objets).find((k) => avant.objets[k].classe === "mur")!;
    expect((await envoyer(client, pid, "apres-pub", 1, [{ type: "objet.supprimer", params: { id: premierMur, avecHeberges: true } }])).status).toBe(200);
    const rest = await client.post(`/projects/${pid}/atelier/publications/${pub.body.id}/restaurer`).send({ requestId: "rest-pub", baseRevision: 2 });
    expect(rest.status).toBe(200);
    expect(rest.body).toMatchObject({ revision: 3, publication: pub.body.id, ecartsCatalogues: [] });
    expect((await modele(client, pid)).modele.objets).toEqual(avant.objets);
    expect((await client.get(`/projects/${pid}/atelier/publications`)).body.publications).toHaveLength(1);
  }, 60_000);

  it("verrous logiques fins : objet et niveau réservés refusent les lots d'un autre compte (423), levés par l'auteur ou le propriétaire", async () => {
    const owner = await registerAndLogin("verrous@example.com");
    const pid = await projetVide(owner);
    expect((await envoyer(owner, pid, "l1", 0, [niveau, mur("m1"), mur("m2", 6)])).status).toBe(200);
    const editeur = await registerAndLogin("verrous-editeur@example.com");
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "verrous-editeur@example.com", role: "editeur" })).status).toBe(201);
    expect((await owner.post(`/projects/${pid}/atelier/verrous`).send({ cles: ["m1"], motif: "Reprise structurelle" })).status).toBe(201);
    expect((await owner.post(`/projects/${pid}/atelier/verrous`).send({ cles: ["inconnu"] })).status).toBe(404);
    const refus = await envoyer(editeur, pid, "e1", 1, [{ type: "objet.modifier", params: { id: "m1", params: { epaisseur: m(0.3) } } }]);
    expect(refus.status).toBe(423);
    expect(refus.body).toMatchObject({ erreur: "verrou", verrous: [{ cle: "m1", auteur: "verrous@example.com", motif: "Reprise structurelle" }] });
    expect((await envoyer(editeur, pid, "e2", 1, [{ type: "objet.modifier", params: { id: "m2", params: { epaisseur: m(0.3) } } }])).status).toBe(200);
    expect((await envoyer(owner, pid, "o1", 2, [{ type: "objet.modifier", params: { id: "m1", params: { epaisseur: m(0.25) } } }])).status).toBe(200);
    expect((await editeur.post(`/projects/${pid}/atelier/verrous`).send({ cles: ["m1"] })).status).toBe(423);
    expect((await editeur.delete(`/projects/${pid}/atelier/verrous/m1`)).status).toBe(403);
    // Niveau entier : aucun objet créé ni modifié dessus par autrui.
    expect((await editeur.post(`/projects/${pid}/atelier/verrous`).send({ cles: ["niveau:rdc"], minutes: 5 })).status).toBe(201);
    expect((await envoyer(owner, pid, "o2", 3, [mur("m3", 12)])).status).toBe(423);
    const liste = (await owner.get(`/projects/${pid}/atelier/verrous`)).body.verrous;
    expect(liste.map((v: { cle: string; moi: boolean }) => [v.cle, v.moi])).toEqual([["m1", true], ["niveau:rdc", false]]);
    expect((await owner.delete(`/projects/${pid}/atelier/verrous/niveau%3Ardc`)).status).toBe(204);
    expect((await envoyer(owner, pid, "o3", 3, [mur("m3", 12)])).status).toBe(200);
    expect((await owner.get(`/projects/${pid}/atelier/collisions`)).body.collisions).toEqual([]);
  });
});

describe("automatisation et assistant (lot 8, T19)", () => {
  const script = (client: ReturnType<typeof request.agent>, pid: string, action: "essai" | "executer", body: Record<string, unknown>) => client.post(`/projects/${pid}/atelier/scripts/trame-poteaux/${action}`).send(body);
  const trame = { niveauId: "rdc", nx: 3, ny: 2, px: 5, py: 4, hauteur: 3 };

  it("un script de trame de poteaux passe par les mêmes commandes et les mêmes refus qu'un utilisateur", async () => {
    const owner = await registerAndLogin("script@example.com");
    const pid = await projetVide(owner);
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("s0", 0, [niveau]))).status).toBe(200);
    // Essai : aperçu, rien d'écrit.
    const essai = await script(owner, pid, "essai", { parametres: trame });
    expect(essai.status).toBe(200);
    expect(essai.body.commandes).toHaveLength(6);
    expect(essai.body.effets.crees).toHaveLength(6);
    expect((await owner.get(`/projects/${pid}`)).body.modelRevision).toBe(1);
    // Exécution : un lot ordinaire, journalisé sous le nom du script.
    const ex = await script(owner, pid, "executer", { parametres: trame, requestId: "trame-1", baseRevision: 1 });
    expect(ex.status).toBe(200);
    expect(ex.body).toMatchObject({ revision: 2, script: { id: "trame-poteaux", version: 1 } });
    const journal = (await owner.get(`/projects/${pid}/atelier/journal`)).body.entrees;
    expect(journal.at(-1)).toMatchObject({ label: "Script « Trame de poteaux » v1", resultRevision: 2 });
    // Les mêmes commandes envoyées à la main (même requestId) donnent exactement les mêmes objets.
    const autre = await projetVide(owner);
    expect((await owner.post(`/projects/${autre}/atelier/commands`).send(enveloppe("s0", 0, [niveau]))).status).toBe(200);
    expect((await owner.post(`/projects/${autre}/atelier/commands`).send(enveloppe("trame-1", 1, essai.body.commandes))).status).toBe(200);
    const objets = async (p: string) => (await owner.get(`/projects/${p}/atelier/model`)).body.modele.objets;
    expect(await objets(autre)).toEqual(await objets(pid));
    // Mêmes refus : révision périmée (409), niveau verrouillé par autrui (423), lecteur (403), paramètre invalide (400).
    expect((await script(owner, pid, "executer", { parametres: trame, requestId: "trame-2", baseRevision: 1 })).status).toBe(409);
    const editeur = await registerAndLogin("script-editeur@example.com");
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "script-editeur@example.com", role: "editeur" })).status).toBe(201);
    expect((await editeur.post(`/projects/${pid}/atelier/verrous`).send({ cles: ["niveau:rdc"] })).status).toBe(201);
    const verrou = await script(owner, pid, "executer", { parametres: { ...trame, ox: 30 }, requestId: "trame-3", baseRevision: 2 });
    expect(verrou.status).toBe(423);
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("main-3", 2, [{ type: "poteau.creer", params: { niveauId: "rdc", point: pt(40, 0), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } }]))).status).toBe(423);
    const lecteur = await registerAndLogin("script-lecteur@example.com");
    expect((await owner.post(`/projects/${pid}/members`).send({ email: "script-lecteur@example.com", role: "lecteur" })).status).toBe(201);
    expect((await script(lecteur, pid, "executer", { parametres: trame, requestId: "trame-4", baseRevision: 2 })).status).toBe(403);
    const sansHauteur = await script(owner, pid, "essai", { parametres: { niveauId: "rdc" } });
    expect(sansHauteur.status).toBe(400);
    expect(sansHauteur.body.details[0].message).toMatch(/Hauteur.*requis/);
  });

  it("bibliothèque versionnée : un script du projet est enregistré en versions immuables ; les identifiants intégrés sont réservés", async () => {
    const owner = await registerAndLogin("biblio@example.com");
    const pid = await projetVide(owner);
    const s = { id: "reperes", nom: "Repères", parametres: [{ nom: "n", type: "entier", min: 1, max: 5 }], pour: [{ variable: "i", de: 1, a: "n" }], commandes: [{ type: "texte.creer", params: { niveauId: "rdc", position: { x: "=i * 2", y: 0, frame: "local", unit: "m" }, texte: "R{i}" } }] };
    expect((await owner.post(`/projects/${pid}/atelier/scripts`).send({ script: s })).body.version).toBe(1);
    expect((await owner.post(`/projects/${pid}/atelier/scripts`).send({ script: { ...s, nom: "Repères numérotés" } })).body.version).toBe(2);
    expect((await owner.get(`/projects/${pid}/atelier/scripts/reperes/versions`)).body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const liste = (await owner.get(`/projects/${pid}/atelier/scripts`)).body;
    expect(liste.integres.map((x: { id: string }) => x.id)).toEqual(["trame-poteaux", "enceinte-rectangulaire", "plans-par-niveau"]);
    expect(liste.projet).toMatchObject([{ id: "reperes", nom: "Repères numérotés", version: 2, versions: 2 }]);
    expect((await owner.post(`/projects/${pid}/atelier/scripts`).send({ script: { ...s, id: "trame-poteaux" } })).status).toBe(409);
    expect((await owner.post(`/projects/${pid}/atelier/scripts`).send({ script: { ...s, commandes: [{ type: "interne.restaurer", params: {} }] } })).status).toBe(400);
    expect((await owner.post(`/projects/${pid}/atelier/commands`).send(enveloppe("b0", 0, [niveau]))).status).toBe(200);
    const ex = await owner.post(`/projects/${pid}/atelier/scripts/reperes/executer`).send({ parametres: { n: 3 }, version: 1, requestId: "rep-1", baseRevision: 1 });
    expect(ex.status).toBe(200);
    expect(Object.values((await owner.get(`/projects/${pid}/atelier/model`)).body.modele.objets as Record<string, { params: { texte: string } }>).map((o) => o.params.texte).sort()).toEqual(["R1", "R2", "R3"]);
  });

  it("assistant : une proposition n'écrit rien sans accord ; accord → exécution validée ; refus ; cache des séquences validées", async () => {
    const client = await registerAndLogin("assistant@example.com");
    const imported = await client.post("/examples/p118-exemple-complet/import");
    const ref = imported.body.id as string;
    const pid = (await client.post(`/projects/${ref}/copies`).send({ name: "Assistant" })).body.id as string;
    const rev0 = (await client.get(`/projects/${pid}`)).body.modelRevision as number;
    const p = await client.post(`/projects/${pid}/atelier/assistant/propositions`).send({ intention: "Feuilles et quantités" });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ statut: "proposee", regle: "feuilles-quantites", generateur: "regles-fadi/1", fournisseur: null, depuisCache: false });
    expect(p.body.hypotheses.length).toBeGreaterThan(0);
    expect(p.body.iterations.length).toBeLessThanOrEqual(3);
    expect((await client.get(`/projects/${pid}`)).body.modelRevision).toBe(rev0);
    const acc = await client.post(`/projects/${pid}/atelier/assistant/propositions/${p.body.id}/accepter`).send({ requestId: "acc-1", baseRevision: rev0 });
    expect(acc.status).toBe(200);
    expect(acc.body.revision).toBe(rev0 + 1);
    const defs = Object.values((await client.get(`/projects/${pid}/atelier/model`)).body.modele.definitions as Record<string, { classe: string }>);
    expect(defs.filter((d) => d.classe === "vue")).toHaveLength(6);
    expect((await client.post(`/projects/${pid}/atelier/assistant/propositions/${p.body.id}/accepter`).send({ requestId: "acc-2", baseRevision: rev0 + 1 })).status).toBe(409);
    // Même intention : la séquence en cache n'est plus applicable (plans déjà créés) ; les règles ne proposent plus rien.
    const p2 = (await client.post(`/projects/${pid}/atelier/assistant/propositions`).send({ intention: "feuilles ET quantites" })).body;
    expect(p2).toMatchObject({ statut: "proposee", depuisCache: false, commandes: [] });
    // Trame de poteaux : refusée, puis acceptée, puis resservie depuis le cache.
    const t1 = (await client.post(`/projects/${pid}/atelier/assistant/propositions`).send({ intention: "trame de poteaux 2 x 2 tous les 4 m hauteur 3", niveauId: "rdc" })).body;
    expect(t1.statut).toBe("proposee");
    expect((await client.post(`/projects/${pid}/atelier/assistant/propositions/${t1.id}/refuser`)).body.statut).toBe("refusee");
    expect((await client.post(`/projects/${pid}/atelier/assistant/propositions/${t1.id}/accepter`).send({ requestId: "acc-3", baseRevision: rev0 + 1 })).status).toBe(409);
    const t2 = (await client.post(`/projects/${pid}/atelier/assistant/propositions`).send({ intention: "trame de poteaux 2 x 2 tous les 4 m hauteur 3", niveauId: "rdc" })).body;
    expect((await client.post(`/projects/${pid}/atelier/assistant/propositions/${t2.id}/accepter`).send({ requestId: "acc-4", baseRevision: rev0 + 1 })).status).toBe(200);
    const t3 = (await client.post(`/projects/${pid}/atelier/assistant/propositions`).send({ intention: "Trame de poteaux 2 × 2 tous les 4 m hauteur 3", niveauId: "rdc" })).body;
    expect(t3).toMatchObject({ statut: "proposee", depuisCache: true });
    expect(t3.commandes).toEqual(t2.commandes);
    expect((await client.get(`/projects/${pid}/atelier/assistant/propositions`)).body.propositions.map((x: { statut: string }) => x.statut)).toEqual(["proposee", "acceptee", "refusee", "proposee", "acceptee"]);
    // Depuis Harmonie, sans fournisseur : les réserves du bilan annotées sur les objets concernés.
    const h = (await client.post(`/projects/${pid}/atelier/assistant/propositions`).send({ intention: "Annoter les réserves Harmonie" })).body;
    expect(h).toMatchObject({ statut: "proposee", regle: "reserves-harmonie" });
    expect(h.explication).toMatch(/réserve/);
  }, 60_000);
});
