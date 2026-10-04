/**
 * Tables `atelier_*` et `volumes` contre une vraie base PostgreSQL/PostGIS (CI : fadi_test). Isolé dans un schéma
 * jetable (init.sql y est appliqué deux fois : migration idempotente), pour ne pas croiser les remises à zéro
 * d'app.test.ts qui tourne en parallèle. Ignoré sans DATABASE_URL (poste local sans base).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appliquerLot,
  calculerEmpreinte,
  CONTRAT_COMMANDES,
  importerP118,
  jsonCanonique,
  type Commande,
  type EtatModele,
  type JeuDonneesP118,
} from "@parcours/atelier-model";
import * as schema from "./db/schema.js";
import { chargerEtat, chargerNiveau, CLASSES_SITE, ecrireDiff, ecrireEtat } from "./lib/atelier-rows.js";
import { VolumeStoreBase } from "./lib/volume-store.js";

const URL_BASE = process.env["DATABASE_URL"];
const SCHEMA = `atelier_base_test_${process.pid}_${Date.now()}`;
const INIT_SQL = readFileSync(new URL("./db/init.sql", import.meta.url), "utf8");
const PROJET = "proj_atelier_base";
const SOURCE = JSON.parse(readFileSync(new URL("./data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuDonneesP118;

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let modele: EtatModele;

const ensemble = (rs: readonly unknown[]) => rs.map((r) => jsonCanonique(r)).sort();
const compter = async (table: string, filtre = "true") => Number((await pool.query(`SELECT count(*) AS n FROM ${table} WHERE project_id = $1 AND ${filtre}`, [PROJET])).rows[0].n);

function lot(etat: EtatModele, commands: readonly Commande[], label: string) {
  const r = appliquerLot(etat, { requestId: `req-${label}`, baseRevision: etat.revision, contract: CONTRAT_COMMANDES, label, commands });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r;
}

/** Écrit la différence et avance la révision du projet, comme le fera le service de commandes. */
async function valider(avant: EtatModele, apres: EtatModele) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM projects WHERE id = ${PROJET} FOR UPDATE`);
    await ecrireDiff(tx, avant, apres);
    await tx.execute(sql`UPDATE projects SET model_revision = ${apres.revision} WHERE id = ${PROJET}`);
  });
}

function attendreEgal(relu: EtatModele | null, attendu: EtatModele) {
  expect(relu).not.toBeNull();
  expect(relu!.revision).toBe(attendu.revision);
  expect(relu!.empreinte).toBe(attendu.empreinte);
  expect(calculerEmpreinte(relu!)).toBe(attendu.empreinte);
  expect(relu!.objets).toEqual(attendu.objets);
  expect(ensemble(relu!.relations)).toEqual(ensemble(attendu.relations));
  expect(relu!.catalogue).toEqual(attendu.catalogue);
  expect(relu!.proprietesProjet).toEqual(attendu.proprietesProjet);
  expect(relu!.supprimes).toEqual(attendu.supprimes);
}

describe.skipIf(!URL_BASE)("base de l'Atelier (tables atelier_*, volumes)", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: URL_BASE });
    await admin.query(`CREATE SCHEMA "${SCHEMA}"`);
    await admin.end();
    pool = new Pool({ connectionString: URL_BASE, options: `-c search_path="${SCHEMA}",public` });
    db = drizzle(pool, { schema });
    // Migration idempotente : deux passages sans erreur.
    await pool.query(INIT_SQL);
    await pool.query(INIT_SQL);
    await pool.query("INSERT INTO users (id, email, password_hash) VALUES ('u1', 'base@example.com', 'x')");
    await pool.query("INSERT INTO projects (id, owner_id, code, name) VALUES ($1, 'u1', 'P118', 'P.118')", [PROJET]);
    modele = importerP118(SOURCE, { projetId: PROJET }).modele;
  }, 120_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.end();
    const admin = new Pool({ connectionString: URL_BASE });
    await admin.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await admin.end();
  });

  it("crée toutes les tables de la section atelier, et un troisième passage de init.sql reste sans erreur", async () => {
    await pool.query(INIT_SQL);
    const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND (table_name LIKE 'atelier\\_%' OR table_name = 'volumes')", [SCHEMA]);
    expect(r.rows.map((x: { table_name: string }) => x.table_name).sort()).toEqual(
      [
        "atelier_commands",
        "atelier_definitions",
        "atelier_layers",
        "atelier_models",
        "atelier_objects",
        "atelier_outbox",
        "atelier_properties",
        "atelier_relations",
        "atelier_representations",
        "atelier_site",
        "volumes",
      ].sort(),
    );
  });

  it("projet sans modèle typé ou inconnu : rien à charger", async () => {
    expect(await chargerEtat(db, PROJET)).toBeNull();
    expect(await chargerEtat(db, "inconnu")).toBeNull();
  });

  it("écrit P.118 et le relit sans perte (même empreinte atelier-empreinte/1)", async () => {
    await db.transaction(async (tx) => ecrireEtat(tx, modele));
    const relu = await chargerEtat(db, PROJET, { verifierEmpreinte: true });
    attendreEgal(relu, modele);
    expect(await compter("atelier_layers")).toBe(22);
    expect(await compter("atelier_site")).toBe(Object.values(modele.objets).filter((o) => (CLASSES_SITE as readonly string[]).includes(o.classe)).length);
    expect(await compter("atelier_objects") + (await compter("atelier_layers")) + (await compter("atelier_site"))).toBe(Object.keys(modele.objets).length);
    expect(await compter("atelier_relations")).toBe(modele.relations.length);
    expect(await compter("atelier_properties", "object_id IS NULL")).toBe(modele.proprietesProjet.length);
    expect(await compter("atelier_definitions")).toBe(Object.keys(modele.catalogue.definitions).length);
    const tete = (await pool.query("SELECT * FROM atelier_models WHERE project_id = $1", [PROJET])).rows[0];
    expect(tete).toMatchObject({ fingerprint: modele.empreinte, fingerprint_algorithm: "atelier-empreinte/1", model_revision: 0 });
    // Réécriture complète idempotente.
    await db.transaction(async (tx) => ecrireEtat(tx, modele));
    attendreEgal(await chargerEtat(db, PROJET), modele);
  }, 120_000);

  it("charge un niveau : le niveau, ses objets et leurs relations", async () => {
    const niveau = Object.values(modele.objets).find((o) => o.classe === "niveau" && Object.values(modele.objets).some((x) => x.niveauId === o.id))!;
    const inst = await chargerNiveau(db, PROJET, niveau.id);
    expect(inst).not.toBeNull();
    expect(inst!.niveau).toEqual(niveau);
    const attendus = Object.values(modele.objets).filter((o) => o.niveauId === niveau.id);
    expect(inst!.objets.length).toBe(attendus.length);
    for (const o of inst!.objets) expect(o).toEqual(modele.objets[o.id]);
    expect(inst!.empreinte).toBe(modele.empreinte);
    expect(await chargerNiveau(db, PROJET, "absent")).toBeNull();
  }, 60_000);

  it("écrit des différences : suppression, annulation, création puis suppression dans un lot (trace sans contenu)", async () => {
    const avant = (await chargerEtat(db, PROJET))!;
    const mur = Object.values(avant.objets).find((o) => o.classe === "mur" && avant.relations.some((r) => r.type === "heberge" && r.sourceId === o.id))!;
    const r1 = lot(avant, [{ type: "mur.supprimer", params: {}, cibles: [mur.id] } as Commande], "supprimer");
    await valider(avant, r1.etat);
    attendreEgal(await chargerEtat(db, PROJET, { verifierEmpreinte: true }), r1.etat);
    expect(await compter("atelier_objects", "deleted_at IS NOT NULL")).toBe(r1.etat.supprimes.length);

    const r2 = lot(r1.etat, r1.inverse, "annuler");
    await valider(r1.etat, r2.etat);
    const apresAnnulation = await chargerEtat(db, PROJET, { verifierEmpreinte: true });
    attendreEgal(apresAnnulation, r2.etat);
    expect(apresAnnulation!.empreinte).toBe(modele.empreinte);
    expect(await compter("atelier_objects", "deleted_at IS NOT NULL")).toBe(0);

    const P = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" }) as const;
    const ligne = `${PROJET}_L1`;
    const creer = { type: "esquisse.ligne", params: { id: ligne, niveauId: mur.niveauId, calqueId: mur.calqueId, a: P(0, 0), b: P(1, 0) }, cibles: [] } as unknown as Commande;
    const r3 = lot(r2.etat, [creer, { type: "esquisse.supprimer", params: {}, cibles: [ligne] } as Commande, { type: "mur.supprimer", params: {}, cibles: [mur.id] } as Commande], "creer-supprimer");
    await valider(r2.etat, r3.etat);
    attendreEgal(await chargerEtat(db, PROJET, { verifierEmpreinte: true }), r3.etat);
    const trace = (await pool.query(`SELECT "class", params, deleted_rank FROM atelier_objects WHERE project_id = $1 AND id = $2`, [PROJET, ligne])).rows[0];
    expect(trace).toMatchObject({ class: null, params: null });

    // Annulation d'une création : la ligne disparaît sans trace.
    const r4 = lot(r3.etat, [{ ...creer, params: { ...(creer.params as object), id: `${PROJET}_L2` } } as Commande], "creer");
    await valider(r3.etat, r4.etat);
    const r5 = lot(r4.etat, r4.inverse, "annuler-creation");
    await valider(r4.etat, r5.etat);
    attendreEgal(await chargerEtat(db, PROJET, { verifierEmpreinte: true }), r5.etat);
    expect((await pool.query("SELECT 1 FROM atelier_objects WHERE project_id = $1 AND id = $2", [PROJET, `${PROJET}_L2`])).rowCount).toBe(0);
  }, 180_000);

  it("conserve une valeur de propriété JSON null et les propriétés de projet dans leur ordre", async () => {
    const avant = (await chargerEtat(db, PROJET))!;
    const proprietesProjet = [{ nom: "essai.null", valeur: null, provenance: "saisie", statut: "declaree" } as const, ...avant.proprietesProjet];
    const apres: EtatModele = { ...avant, revision: avant.revision + 1, proprietesProjet, empreinte: calculerEmpreinte({ ...avant, proprietesProjet }) };
    await valider(avant, apres);
    const relu = await chargerEtat(db, PROJET, { verifierEmpreinte: true });
    attendreEgal(relu, apres);
    expect(relu!.proprietesProjet[0]).toEqual({ nom: "essai.null", valeur: null, provenance: "saisie", statut: "declaree" });
  }, 60_000);

  it("refuse un mélange de repères, une classe hors de sa table, une trace incohérente", async () => {
    const local = { x: 0, y: 0, frame: "local", unit: "m" };
    const cadastral = { x: 1, y: 2, frame: "cadastral", unit: "m", crs: "EPSG:26191" };
    const inserer = (table: string, classe: string, params: unknown) =>
      pool.query(
        `INSERT INTO ${table} (project_id, id, ontology, "class", params, provenance, status, model_revision) VALUES ($1, $2, 'projet', $3, $4::jsonb, 'saisie', 'declaree', 0)`,
        [PROJET, `x-${Math.random()}`, classe, JSON.stringify(params)],
      );
    await expect(inserer("atelier_objects", "mur", { axe: { a: local, b: cadastral } })).rejects.toThrow(/check/i);
    await expect(inserer("atelier_objects", "parcelle", { sommetsCadastraux: [cadastral] })).rejects.toThrow(/check/i);
    await expect(inserer("atelier_layers", "mur", {})).rejects.toThrow(/check/i);
    await expect(inserer("atelier_site", "parcelle", { crs: "EPSG:26191", sommetsCadastraux: [cadastral, local] })).rejects.toThrow(/check/i);
    await expect(inserer("atelier_site", "emprise", { sommetsLocaux: [local, { ...local, frame: "geographic" }] })).rejects.toThrow(/check/i);
    await expect(inserer("atelier_site", "parcelle", { crs: "EPSG:26191", sommetsCadastraux: [cadastral], sommetsLocaux: [local] })).resolves.toBeDefined();
    await expect(pool.query("INSERT INTO atelier_objects (project_id, id, model_revision) VALUES ($1, 'sans-contenu', 0)", [PROJET])).rejects.toThrow(/check/i);
    await expect(pool.query("INSERT INTO atelier_objects (project_id, id, model_revision, deleted_at) VALUES ($1, 'sans-rang', 0, now())", [PROJET])).rejects.toThrow(/check/i);
  });

  it("journal : idempotence par request_id, une entrée ne s'inverse qu'une fois, révision +0 ou +1", async () => {
    const empreinte = modele.empreinte;
    const entree = (id: string, requestId: string, extra: { nature?: string; inverseOf?: string | null; base?: number; result?: number } = {}) =>
      pool.query(
        `INSERT INTO atelier_commands (id, project_id, request_id, contract, nature, label, base_revision, result_revision, commands, inverse, effets, response, base_fingerprint, result_fingerprint, author_id, inverse_of)
         VALUES ($1, $2, $3, 'atelier-commands/1', $4, 'essai', $5, $6, '[]', '[]', '{}', '{"revision": 1}', $7, $7, 'u1', $8)`,
        [id, PROJET, requestId, extra.nature ?? "commande", extra.base ?? 0, extra.result ?? 1, empreinte, extra.inverseOf ?? null],
      );
    await entree("j1", "r1");
    await expect(entree("j2", "r1")).rejects.toThrow(/atelier_commands_request_unique/);
    await expect(entree("j3", "r3", { base: 0, result: 2 })).rejects.toThrow(/check/i);
    await expect(entree("j4", "r4", { nature: "annulation" })).rejects.toThrow(/check/i);
    await entree("j5", "r5", { nature: "annulation", inverseOf: "j1", base: 1, result: 2 });
    await expect(entree("j6", "r6", { nature: "annulation", inverseOf: "j1", base: 2, result: 3 })).rejects.toThrow(/atelier_commands_inverse_of_unique/);
    await pool.query("INSERT INTO atelier_outbox (id, project_id, command_id, event, payload) VALUES ('e1', $1, 'j1', 'atelier.commande.validee', '{}')", [PROJET]);
    await expect(pool.query("INSERT INTO atelier_outbox (id, project_id, command_id, event, payload) VALUES ('e2', $1, 'j1', 'atelier.commande.validee', '{}')", [PROJET])).rejects.toThrow(
      /atelier_outbox_command_event_unique/,
    );
    // Un auteur supprimé ne fait pas disparaître l'historique.
    await pool.query("INSERT INTO users (id, email, password_hash) VALUES ('u2', 'autre@example.com', 'x')");
    await pool.query("UPDATE atelier_commands SET author_id = 'u2' WHERE id = 'j1'");
    await pool.query("DELETE FROM users WHERE id = 'u2'");
    expect((await pool.query("SELECT author_id FROM atelier_commands WHERE id = 'j1'")).rows[0]).toEqual({ author_id: null });
  });

  it("VolumeStore (base) : identifiant SHA-256, écriture idempotente, lecture exacte, contenu vérifié par la base", async () => {
    const store = new VolumeStoreBase(db);
    const octets = new Uint8Array([0, 1, 2, 250, 255, 10, 13]);
    const id = await store.put(octets, "application/octet-stream");
    expect(id).toBe(createHash("sha256").update(octets).digest("hex"));
    expect(await store.put(octets, "text/plain")).toBe(id);
    expect(await store.has(id)).toBe(true);
    const v = await store.get(id);
    expect(v).toEqual({ id, mime: "application/octet-stream", size: octets.length, bytes: octets });
    const vide = await store.put(new Uint8Array(), "text/plain");
    expect((await store.get(vide))?.size).toBe(0);
    expect(await store.has("0".repeat(64))).toBe(false);
    expect(await store.get("pas-un-id")).toBeNull();
    await expect(store.put(octets, "")).rejects.toThrow(/MIME/);
    await expect(pool.query("INSERT INTO volumes (id, mime, size, content) VALUES ($1, 'x/y', 3, '\\x010203')", ["0".repeat(64)])).rejects.toThrow(/check/i);
    // Les volumes vivent dans une transaction comme le reste.
    await db.transaction(async (tx) => {
      const id2 = await new VolumeStoreBase(tx).put(new Uint8Array([7]), "x/y");
      expect(await new VolumeStoreBase(tx).has(id2)).toBe(true);
    });
  });
});
