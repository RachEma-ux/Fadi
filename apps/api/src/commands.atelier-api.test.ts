/**
 * Service de commandes du nouvel Atelier (L2.2) — tests d'API L2.5 : T03 (unité refusée), T06 (idempotence),
 * T07 (documents périmés), T08 (conflit entre deux comptes), T10 (droits, réservation), annuler / rétablir,
 * journal, problèmes, révisions passées, essai à blanc, initialisation (vide, P.118).
 *
 * Vraie base PostgreSQL/PostGIS (CI : fadi_test), dans un schéma jetable : `DATABASE_URL` reçoit un
 * `search_path` propre avant le chargement de l'application, pour ne pas croiser les remises à zéro d'app.test.ts
 * qui tourne en parallèle. Ignoré sans DATABASE_URL (poste local sans base).
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { CONTRAT_COMMANDES, longueur, pointLocal, type Commande } from "@parcours/atelier-model";

type Agent = ReturnType<typeof request.agent>;
const URL_BASE = process.env["DATABASE_URL"];
const SCHEMA = `atelier_api_test_${process.pid}_${Date.now()}`;
const INIT_SQL = readFileSync(new URL("./db/init.sql", import.meta.url), "utf8");

type App = ReturnType<(typeof import("./app.js"))["createApp"]>;
let app: App;
let admin: Pool;
let poolApp: Pool;
let compteur = 0;

const m = longueur;
const P = pointLocal;
const cmd = (type: string, params: Record<string, unknown>, cibles: string[] = []) => ({ type, params, cibles }) as unknown as Commande;

const NIVEAU = cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 });
const CALQUE = cmd("calque.creer", { id: "C1", nom: "Murs", couleur: "#336699", visible: true, verrouille: false, ordre: 0 });
const mur = (id: string, x: number, niveauId = "rdc") =>
  cmd("mur.tracer", { id, niveauId, calqueId: "C1", a: P(x, 0), b: P(x, 6), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true });

const enveloppe = (baseRevision: number, commands: Commande[], label = "Essai", requestId = `req-${process.pid}-${++compteur}`) => ({
  requestId,
  baseRevision,
  contract: CONTRAT_COMMANDES,
  label,
  commands,
});

async function compte(email: string) {
  const a = request.agent(app);
  const r = await a.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(r.status).toBe(201);
  return a;
}

async function projet(a: Agent, code = "AT") {
  const r = await a.post("/projects").send({ code, name: `Projet ${code}` });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

const base = (id: string) => `/projects/${id}/atelier`;

async function modele(a: Agent, id: string, revision?: number) {
  const r = await a.get(`${base(id)}/model${revision === undefined ? "" : `?revision=${revision}`}`);
  expect(r.status).toBe(200);
  return r.body as { revision: number; empreinte: string; objets: Record<string, { id: string; classe: string }> };
}

/** Projet avec niveau `rdc` et calque `C1` (une révision). */
async function projetPret(a: Agent) {
  const id = await projet(a);
  const m0 = await modele(a, id);
  const r = await a.post(`${base(id)}/commands`).send(enveloppe(m0.revision, [NIVEAU, CALQUE], "Préparer"));
  expect(r.status).toBe(200);
  return { id, revision: r.body.revision as number, empreinte: r.body.empreinte as string };
}

describe.skipIf(!URL_BASE)("service de commandes du nouvel Atelier (§5.4, L2.2 / L2.5)", () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: URL_BASE });
    await admin.query(`CREATE SCHEMA "${SCHEMA}"`);
    const local = new Pool({ connectionString: URL_BASE, options: `-c search_path=${SCHEMA},public` });
    await local.query(INIT_SQL);
    await local.end();
    const url = new URL(URL_BASE!);
    url.searchParams.set("options", `-c search_path=${SCHEMA},public`);
    process.env["DATABASE_URL"] = url.toString();
    app = (await import("./app.js")).createApp();
    poolApp = (await import("./db/client.js")).pool;
    const chemin = (await poolApp.query("SHOW search_path")).rows[0].search_path as string;
    expect(chemin).toContain(SCHEMA);
  }, 120_000);

  afterAll(async () => {
    await poolApp?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await admin?.end();
  });

  it("initialise un modèle vide à la première lecture, journalisé (nature import) sans avancer la révision", async () => {
    const a = await compte("init@atelier.test");
    const id = await projet(a);
    const m0 = await modele(a, id);
    expect(m0.revision).toBe(0);
    expect(Object.keys(m0.objets)).toHaveLength(0);
    const j = await a.get(`${base(id)}/journal`);
    expect(j.status).toBe(200);
    expect(j.body.revisionCourante).toBe(0);
    expect(j.body.entrees).toHaveLength(1);
    expect(j.body.entrees[0]).toMatchObject({ nature: "import", revision: 0, baseRevision: 0, inverseDe: null });
  });

  it("T03 : une unité ou une précondition refusée rend 400 détaillé { chemin, objet, cause, action, message }, rien n'est écrit", async () => {
    const a = await compte("t03@atelier.test");
    const { id, revision, empreinte } = await projetPret(a);
    const faux = cmd("mur.tracer", { id: "MX", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(4, 0), epaisseur: { value: 20, unit: "cm" }, hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true });
    const r = await a.post(`${base(id)}/commands`).send(enveloppe(revision, [faux]));
    expect(r.status).toBe(400);
    expect(r.body.erreur).toBe("invalide");
    expect(r.body.details.length).toBeGreaterThan(0);
    for (const d of r.body.details) {
      expect(d).toEqual(expect.objectContaining({ chemin: expect.stringMatching(/^commands\[0\]/), objet: expect.any(String), cause: expect.any(String), action: expect.any(String), message: expect.any(String) }));
    }
    const absent = await a.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("MY", 0, "niveau-inexistant")]));
    expect(absent.status).toBe(400);
    expect(absent.body.details[0].chemin).toMatch(/^commands\[0\]/);
    // Enveloppe mal formée : refusée avant la base.
    const mal = await a.post(`${base(id)}/commands`).send({ requestId: "", baseRevision: -1, contract: "x", label: 3, commands: [] });
    expect(mal.status).toBe(400);
    expect(mal.body.details.map((d: { chemin: string }) => d.chemin)).toEqual(["requestId", "baseRevision", "contract", "label", "commands"]);
    const apres = await modele(a, id);
    expect(apres.revision).toBe(revision);
    expect(apres.empreinte).toBe(empreinte);
  });

  it("refuse une restauration fabriquée par le client (D-024)", async () => {
    const a = await compte("restauration@atelier.test");
    const { id, revision } = await projetPret(a);
    const fabrique = { ...mur("M1", 0), restauration: { version: 1, origine: mur("M1", 0), objets: [], relationsARetirer: [], relationsARajouter: [], supprimesARetirer: [], supprimesARajouter: [] } };
    const r = await a.post(`${base(id)}/commands`).send(enveloppe(revision, [fabrique as unknown as Commande]));
    expect(r.status).toBe(400);
    expect(r.body.details[0].chemin).toBe("commands[0].restauration");
  });

  it("T06 : la même enveloppe envoyée deux fois → une seule révision, la même réponse, une seule entrée et un seul événement", async () => {
    const a = await compte("t06@atelier.test");
    const { id, revision } = await projetPret(a);
    const env = enveloppe(revision, [mur("M1", 0)], "Tracer un mur");
    const r1 = await a.post(`${base(id)}/commands`).send(env);
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ revision: revision + 1, applique: [{ type: "mur.tracer", objetIds: ["M1"] }] });
    expect(typeof r1.body.journalId).toBe("string");
    expect(Object.keys(r1.body.effets).sort()).toEqual(["documents", "problemes", "propositions", "remplacements", "vues"]);
    const r2 = await a.post(`${base(id)}/commands`).send(env);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect((await modele(a, id)).revision).toBe(revision + 1);
    const n = await poolApp.query("SELECT count(*)::int AS n FROM atelier_commands WHERE project_id = $1 AND request_id = $2", [id, env.requestId]);
    expect(n.rows[0].n).toBe(1);
    const evt = await poolApp.query("SELECT count(*)::int AS n FROM atelier_outbox WHERE command_id = $1", [r1.body.journalId]);
    expect(evt.rows[0].n).toBe(1);
    // Renvoi tardif (révision de base dépassée) : toujours la réponse enregistrée, jamais un 409.
    await a.post(`${base(id)}/commands`).send(enveloppe(revision + 1, [mur("M2", 2)]));
    const r3 = await a.post(`${base(id)}/commands`).send(env);
    expect(r3.status).toBe(200);
    expect(r3.body).toEqual(r1.body);
  });

  it("T07 : la commande écrit atelier.commande.validee dans la boîte de sortie et périme les documents produits", async () => {
    const a = await compte("t07@atelier.test");
    const { id, revision } = await projetPret(a);
    await poolApp.query("INSERT INTO produced_documents (project_id, kind, label, file_name, model_revision, input_hash) VALUES ($1, 'bilan-batiment', 'Bilan du bâtiment', 'bilan.html', $2, 'h')", [id, revision]);
    const avant = await a.get(`${base(id)}/problemes`);
    expect(avant.status).toBe(200);
    expect(avant.body.problemes.filter((p: { categorie: string }) => p.categorie === "document")).toHaveLength(0);
    const r = await a.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("M1", 0)]));
    expect(r.status).toBe(200);
    const evt = await poolApp.query("SELECT event, payload FROM atelier_outbox WHERE command_id = $1", [r.body.journalId]);
    expect(evt.rows).toHaveLength(1);
    expect(evt.rows[0].event).toBe("atelier.commande.validee");
    expect(evt.rows[0].payload).toMatchObject({ projectId: id, revision: revision + 1, objetIds: ["M1"], types: ["mur.tracer"], nature: "commande" });
    const apres = await a.get(`${base(id)}/problemes`);
    expect(apres.body.revision).toBe(revision + 1);
    const docs = apres.body.problemes.filter((p: { categorie: string }) => p.categorie === "document");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ code: "document-perime", categorie: "document" });
    expect(docs[0].message).toContain("Bilan du bâtiment");
  });

  it.todo("T07 (L2.3) : le traitement de la boîte de sortie marque vues, bilan Harmonie et aperçu conceptuel périmés");

  it("T08 : conflit entre deux comptes → 409 détaillé { baseRevision, revisionCourante, conflits: [{ objetId, motif, etatServeur }] }", async () => {
    const proprio = await compte("t08-a@atelier.test");
    const editeur = await compte("t08-b@atelier.test");
    const { id, revision } = await projetPret(proprio);
    expect((await proprio.post(`/projects/${id}/members`).send({ email: "t08-b@atelier.test", role: "editeur" })).status).toBe(201);
    const ok = await proprio.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("MA", 0)], "Mur A"));
    expect(ok.status).toBe(200);
    const ko = await editeur.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("MB", 3)], "Mur B"));
    expect(ko.status).toBe(409);
    expect(ko.body).toMatchObject({ erreur: "conflit", baseRevision: revision, revisionCourante: revision + 1 });
    expect(ko.body.conflits).toEqual([expect.objectContaining({ objetId: "MA", motif: expect.stringContaining("Mur A"), etatServeur: expect.objectContaining({ id: "MA", classe: "mur" }) })]);
    // Rien d'écrit : rejoué sur la bonne révision avec un nouveau requestId, le lot passe.
    expect((await modele(editeur, id)).objets["MB"]).toBeUndefined();
    const rejeu = await editeur.post(`${base(id)}/commands`).send(enveloppe(revision + 1, [mur("MB", 3)], "Mur B"));
    expect(rejeu.status).toBe(200);
    // L'essai à blanc applique la même règle.
    const essai = await editeur.post(`${base(id)}/commands/essai`).send(enveloppe(revision, [mur("MC", 5)]));
    expect(essai.status).toBe(409);
  });

  it("T10 : lecteur refusé (403), étranger 404, réservation d'autrui 423 ; lectures permises", async () => {
    const proprio = await compte("t10-a@atelier.test");
    const lecteur = await compte("t10-b@atelier.test");
    const editeur = await compte("t10-c@atelier.test");
    const etranger = await compte("t10-d@atelier.test");
    const { id, revision } = await projetPret(proprio);
    await proprio.post(`/projects/${id}/members`).send({ email: "t10-b@atelier.test", role: "lecteur" });
    await proprio.post(`/projects/${id}/members`).send({ email: "t10-c@atelier.test", role: "editeur" });
    expect((await lecteur.get(`${base(id)}/model`)).status).toBe(200);
    expect((await lecteur.get(`${base(id)}/journal?apres=0`)).status).toBe(200);
    for (const route of ["/commands", "/commands/essai"]) {
      const r = await lecteur.post(`${base(id)}${route}`).send(enveloppe(revision, [mur("ML", 0)]));
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/lecture/);
    }
    expect((await lecteur.post(`${base(id)}/commands/annuler`).send({ requestId: "x", baseRevision: revision })).status).toBe(403);
    expect((await etranger.get(`${base(id)}/model`)).status).toBe(404);
    expect((await etranger.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("ME", 0)]))).status).toBe(404);
    expect((await request(app).get(`${base(id)}/model`)).status).toBe(401);
    // Réservation d'édition par le propriétaire : l'éditeur est refusé (423), le détenteur passe.
    expect((await proprio.put(`/projects/${id}/lock`)).status).toBe(200);
    const bloque = await editeur.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("MR", 0)]));
    expect(bloque.status).toBe(423);
    expect(bloque.body.message).toMatch(/réservée/);
    expect((await editeur.post(`${base(id)}/commands/annuler`).send({ requestId: "y", baseRevision: revision })).status).toBe(423);
    expect((await editeur.get(`${base(id)}/model`)).status).toBe(200);
    expect((await proprio.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("MP", 0)]))).status).toBe(200);
    expect((await proprio.delete(`/projects/${id}/lock`)).status).toBe(204);
    expect((await editeur.post(`${base(id)}/commands`).send(enveloppe(revision + 1, [mur("MR", 2)]))).status).toBe(200);
  });

  it("annuler puis rétablir : nouvelles microversions (inverseDe), empreinte d'origine retrouvée, double annulation refusée", async () => {
    const a = await compte("undo@atelier.test");
    const { id, revision, empreinte: e0 } = await projetPret(a);
    const c = await a.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("M1", 0), mur("M2", 2)], "Deux murs"));
    expect(c.status).toBe(200);
    expect(c.body.applique).toEqual([
      { type: "mur.tracer", objetIds: ["M1"] },
      { type: "mur.tracer", objetIds: ["M2"] },
    ]);
    const e1 = c.body.empreinte as string;
    const demandeA = { requestId: `undo-${compteur++}`, baseRevision: revision + 1 };
    const u = await a.post(`${base(id)}/commands/annuler`).send(demandeA);
    expect(u.status).toBe(200);
    expect(u.body.revision).toBe(revision + 2);
    expect(u.body.empreinte).toBe(e0);
    const m2 = await modele(a, id);
    expect(m2.empreinte).toBe(e0);
    expect(m2.objets["M1"]).toBeUndefined();
    // Idempotence de l'annulation.
    expect((await a.post(`${base(id)}/commands/annuler`).send(demandeA)).body).toEqual(u.body);
    // Double annulation de la même entrée : refusée.
    const double = await a.post(`${base(id)}/commands/annuler`).send({ requestId: `undo-${compteur++}`, baseRevision: revision + 2, journalId: c.body.journalId });
    expect(double.status).toBe(400);
    expect(double.body.details[0].cause).toMatch(/déjà annulée/);
    const redo = await a.post(`${base(id)}/commands/retablir`).send({ requestId: `redo-${compteur++}`, baseRevision: revision + 2 });
    expect(redo.status).toBe(200);
    expect(redo.body.revision).toBe(revision + 3);
    expect(redo.body.empreinte).toBe(e1);
    expect((await modele(a, id)).objets["M2"]).toMatchObject({ id: "M2", classe: "mur" });
    const j = await a.get(`${base(id)}/journal?apres=${revision}`);
    expect(j.body.entrees.map((x: { nature: string }) => x.nature)).toEqual(["commande", "annulation", "retablissement"]);
    expect(j.body.entrees[1].inverseDe).toBe(c.body.journalId);
    expect(j.body.entrees[2].inverseDe).toBe(u.body.journalId);
    expect(j.body.entrees[1].label).toBe("Annuler : Deux murs");
    expect(j.body.entrees[2].label).toBe("Rétablir : Deux murs");
    // Plus rien à rétablir.
    expect((await a.post(`${base(id)}/commands/retablir`).send({ requestId: `redo-${compteur++}`, baseRevision: revision + 3 })).status).toBe(400);
    // Annulation dont l'objet a changé depuis (supprimé par une commande ultérieure) : conflit détaillé.
    const sup = await a.post(`${base(id)}/commands`).send(enveloppe(revision + 3, [cmd("mur.supprimer", {}, ["M1"])], "Supprimer M1"));
    expect(sup.status).toBe(200);
    const vieux = await a.post(`${base(id)}/commands/annuler`).send({ requestId: `undo-${compteur++}`, baseRevision: revision + 4, journalId: redo.body.journalId });
    expect(vieux.status).toBe(409);
    expect(vieux.body.conflits.map((x: { objetId: string }) => x.objetId)).toContain("M1");
  });

  it("GET /journal?apres=n, GET /model?revision=n (reconstruit par les inverses), essai à blanc sans écriture", async () => {
    const a = await compte("journal@atelier.test");
    const { id, revision, empreinte: e0 } = await projetPret(a);
    const r1 = await a.post(`${base(id)}/commands`).send(enveloppe(revision, [mur("M1", 0)], "M1"));
    const r2 = await a.post(`${base(id)}/commands`).send(enveloppe(revision + 1, [mur("M2", 2)], "M2"));
    expect(r2.status).toBe(200);
    const j = await a.get(`${base(id)}/journal?apres=${revision}`);
    expect(j.status).toBe(200);
    expect(j.body.revisionCourante).toBe(revision + 2);
    expect(j.body.entrees).toHaveLength(2);
    expect(j.body.entrees[0]).toMatchObject({ journalId: r1.body.journalId, revision: revision + 1, baseRevision: revision, label: "M1", types: ["mur.tracer"], objetIds: ["M1"], inverseDe: null, auteur: "journal@atelier.test" });
    expect(typeof j.body.entrees[0].creeLe).toBe("string");
    expect((await a.get(`${base(id)}/journal?apres=abc`)).status).toBe(400);
    const passe = await modele(a, id, revision);
    expect(passe.revision).toBe(revision);
    expect(passe.empreinte).toBe(e0);
    expect(passe.objets["M1"]).toBeUndefined();
    const milieu = await modele(a, id, revision + 1);
    expect(milieu.empreinte).toBe(r1.body.empreinte);
    expect(milieu.objets["M1"]).toBeDefined();
    expect(milieu.objets["M2"]).toBeUndefined();
    expect((await a.get(`${base(id)}/model?revision=${revision + 9}`)).status).toBe(404);
    // Essai : réponse de même forme sans journalId, rien d'écrit.
    const essai = await a.post(`${base(id)}/commands/essai`).send(enveloppe(revision + 2, [mur("M3", 4)]));
    expect(essai.status).toBe(200);
    expect(essai.body.revision).toBe(revision + 3);
    expect(essai.body.journalId).toBeUndefined();
    expect(essai.body.applique).toEqual([{ type: "mur.tracer", objetIds: ["M3"] }]);
    const courant = await modele(a, id);
    expect(courant.revision).toBe(revision + 2);
    expect(courant.objets["M3"]).toBeUndefined();
    // Niveau : instantané par niveau.
    const n = await a.get(`${base(id)}/model/niveaux/rdc`);
    expect(n.status).toBe(200);
    expect(n.body).toMatchObject({ revision: revision + 2, niveauId: "rdc", empreinte: courant.empreinte });
    expect(Object.keys(n.body.objets).sort()).toEqual(["M1", "M2", "rdc"]);
    expect((await a.get(`${base(id)}/model/niveaux/absent`)).status).toBe(404);
    const pb = await a.get(`${base(id)}/problemes`);
    expect(pb.status).toBe(200);
    expect(pb.body).toMatchObject({ revision: revision + 2 });
    expect(Array.isArray(pb.body.problemes)).toBe(true);
  });

  it("projet issu de l'exemple P.118 : modèle typé importé à la première lecture (importerP118), nature import", async () => {
    const a = await compte("p118@atelier.test");
    const id = await projet(a, "P118");
    await poolApp.query("UPDATE projects SET source_example_id = 'p118-exemple-complet' WHERE id = $1", [id]);
    const r = await a.get(`${base(id)}/model`);
    expect(r.status).toBe(200);
    const objets = Object.values(r.body.objets as Record<string, { classe: string }>);
    expect(objets.filter((o) => o.classe === "mur")).toHaveLength(220);
    expect(objets.filter((o) => o.classe === "niveau")).toHaveLength(6);
    const j = await a.get(`${base(id)}/journal`);
    expect(j.body.entrees).toHaveLength(1);
    expect(j.body.entrees[0]).toMatchObject({ nature: "import", label: expect.stringContaining("P.118") });
    const niveau = objets.find((o) => o.classe === "niveau") as unknown as { id: string };
    const n = await a.get(`${base(id)}/model/niveaux/${encodeURIComponent(niveau.id)}`);
    expect(n.status).toBe(200);
    expect(Object.keys(n.body.objets).length).toBeGreaterThan(1);
  }, 120_000);
  it("démonstration en ligne de commande (scripts/demo-atelier.mjs) : idempotence et conflit, sortie conforme", async () => {
    const serveur = app.listen(0);
    try {
      const port = (serveur.address() as AddressInfo).port;
      const { stdout } = await promisify(execFile)(process.execPath, [new URL("../scripts/demo-atelier.mjs", import.meta.url).pathname], { env: { ...process.env, API_URL: `http://127.0.0.1:${port}` } }).catch((err: { stdout?: string; stderr?: string }) => {
        // Sortie complète au journal de la CI pour diagnostiquer un échec du script.
        console.log(`demo-atelier.mjs en échec\n${err.stdout ?? ""}\n${err.stderr ?? ""}`);
        throw err;
      });
      // Sortie publiée dans le journal de la CI (preuve du compte rendu).
      console.log(stdout);
      expect(stdout).toContain("Démonstration conforme.");
      expect(stdout).not.toContain("✗");
    } finally {
      await new Promise((r) => serveur.close(r));
    }
  }, 60_000);
});
