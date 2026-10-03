/**
 * Boîte de sortie du nouvel Atelier (L2.3) contre une vraie base PostgreSQL/PostGIS (CI : fadi_test), dans un schéma
 * jetable (comme db.atelier-base.test.ts) : écriture idempotente, traitement unique même en parallèle, échec puis
 * reprise, effets observables (document périmé, bilan périmé, aperçu invalidé, notification regroupée). Les entrées
 * du journal sont insérées directement (le service de commandes est écrit en parallèle, L2.2). Ignoré sans
 * DATABASE_URL (poste local sans base).
 */
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./db/schema.js";
import { EVENEMENT_COMMANDE_VALIDEE, ecrireEvenement, traiterBoiteDeSortie } from "./lib/atelier-events.js";

const URL_BASE = process.env["DATABASE_URL"];
const SCHEMA = `atelier_events_test_${process.pid}_${Date.now()}`;
const INIT_SQL = readFileSync(new URL("./db/init.sql", import.meta.url), "utf8");
const EMPREINTE = `sha256-${"0".repeat(64)}`;

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let numero = 0;

async function projet(id: string): Promise<void> {
  await pool.query("INSERT INTO projects (id, owner_id, code, name, updated_at) VALUES ($1, 'u1', $2, $3, now() - interval '1 hour')", [id, id.toUpperCase(), `Projet ${id}`]);
  await pool.query("INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ($1, 'u2', 'editeur', 'a@example.com')", [id]);
}

/** Entrée du journal (comme l'écrit le service) ; rend son identifiant. */
async function entree(projectId: string, revision: number, auteur = "u2"): Promise<string> {
  const id = `j${++numero}`;
  await pool.query(
    `INSERT INTO atelier_commands (id, project_id, request_id, contract, label, base_revision, result_revision, commands, inverse, effets, response, base_fingerprint, result_fingerprint, author_id)
     VALUES ($1, $2, $3, 'atelier-commands/1', 'Lot de test', $4, $5, '[]', '[]', '{}', '{}', $6, $6, $7)`,
    [id, projectId, `req-${id}`, revision - 1, revision, EMPREINTE, auteur],
  );
  return id;
}

/** Ce que fait le service de commandes dans sa transaction : journal, révision du projet, boîte de sortie. */
async function valider(projectId: string, revision: number, auteur = "u2"): Promise<string> {
  const commandId = await entree(projectId, revision, auteur);
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE projects SET model_revision = ${revision} WHERE id = ${projectId}`);
    await ecrireEvenement(tx, commandId, { event: EVENEMENT_COMMANDE_VALIDEE, payload: { projectId, revision, objetIds: ["mur-1"], types: ["mur.creer"], auteur, nature: "commande" } });
  });
  return commandId;
}

const lignes = async (projectId: string) =>
  (await pool.query("SELECT id, command_id, payload, processed_at, attempts, last_error FROM atelier_outbox WHERE project_id = $1 ORDER BY created_at, id", [projectId])).rows as {
    id: string;
    command_id: string;
    payload: Record<string, unknown>;
    processed_at: Date | null;
    attempts: number;
    last_error: string | null;
  }[];

describe.skipIf(!URL_BASE)("boîte de sortie de l'Atelier (atelier_outbox)", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: URL_BASE });
    await admin.query(`CREATE SCHEMA "${SCHEMA}"`);
    await admin.end();
    pool = new Pool({ connectionString: URL_BASE, options: `-c search_path="${SCHEMA}",public`, max: 12 });
    db = drizzle(pool, { schema });
    await pool.query(INIT_SQL);
    await pool.query("INSERT INTO users (id, email, password_hash) VALUES ('u1', 'a@example.com', 'x'), ('u2', 'b@example.com', 'x'), ('u3', 'c@example.com', 'x')");
  }, 120_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.end();
    const admin = new Pool({ connectionString: URL_BASE });
    await admin.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await admin.end();
  });

  it("écriture idempotente par (entrée du journal, événement), dans la transaction de l'appelant", async () => {
    await projet("pe");
    const j = await valider("pe", 1);
    await ecrireEvenement(db, j, { event: EVENEMENT_COMMANDE_VALIDEE, payload: { projectId: "pe", revision: 1, objetIds: [], types: [], auteur: "u2", nature: "commande" } });
    const [l, ...reste] = await lignes("pe");
    expect(reste).toEqual([]);
    expect(l!.command_id).toBe(j);
    expect(l!.payload).toEqual({ projectId: "pe", revision: 1, objetIds: ["mur-1"], types: ["mur.creer"], auteur: "u2", nature: "commande" });
    expect(l!.processed_at).toBeNull();
    // Transaction annulée : aucun événement.
    const j2 = await entree("pe", 2);
    await expect(
      db.transaction(async (tx) => {
        await ecrireEvenement(tx, j2, { event: EVENEMENT_COMMANDE_VALIDEE, payload: { projectId: "pe", revision: 2, objetIds: [], types: [], auteur: "u2", nature: "commande" } });
        throw new Error("annulée");
      }),
    ).rejects.toThrow("annulée");
    expect(await lignes("pe")).toHaveLength(1);
    expect(await traiterBoiteDeSortie(db, "pe")).toBe(1);
    expect(await traiterBoiteDeSortie(db, "pe")).toBe(0);
  });

  it("traitement unique même appelé plusieurs fois en parallèle", async () => {
    await projet("pp");
    for (let r = 1; r <= 8; r++) await valider("pp", r);
    const avant = (await pool.query("SELECT harmony FROM projects WHERE id = 'pp'")).rows[0];
    const comptes = await Promise.all([traiterBoiteDeSortie(db, "pp"), traiterBoiteDeSortie(db, "pp"), traiterBoiteDeSortie(db, "pp"), traiterBoiteDeSortie(db, "pp")]);
    expect(comptes.reduce((a, b) => a + b, 0)).toBe(8);
    for (const l of await lignes("pp")) {
      expect(l.processed_at).not.toBeNull();
      expect(l.attempts).toBe(1);
      expect(l.last_error).toBeNull();
    }
    expect(await traiterBoiteDeSortie(db, "pp")).toBe(0);
    expect((await pool.query("SELECT harmony FROM projects WHERE id = 'pp'")).rows[0]).toEqual(avant);
  });

  it("échec : attempts + 1, last_error gardé, ligne rejouable ; reprise après correction ; jamais de boucle dans un même appel", async () => {
    await projet("pf");
    const j = await entree("pf", 1);
    await pool.query("INSERT INTO atelier_outbox (id, project_id, command_id, event, payload) VALUES ('evt-casse', 'pf', $1, $2, $3)", [j, EVENEMENT_COMMANDE_VALIDEE, { projectId: "pf", revision: "un" }]);
    const ok = await valider("pf", 2);
    const avant = (await pool.query("SELECT updated_at FROM projects WHERE id = 'pf'")).rows[0].updated_at as Date;
    expect(await traiterBoiteDeSortie(db, "pf")).toBe(1); // l'autre ligne passe malgré l'échec
    let [casse, bonne] = await lignes("pf");
    expect(casse).toMatchObject({ id: "evt-casse", processed_at: null, attempts: 1, last_error: "charge utile invalide" });
    expect(bonne).toMatchObject({ command_id: ok, attempts: 1, last_error: null });
    // Les effets de la ligne en échec sont annulés (point de sauvegarde), ceux de la bonne ligne restent.
    expect(((await pool.query("SELECT updated_at FROM projects WHERE id = 'pf'")).rows[0].updated_at as Date).getTime()).toBeGreaterThan(avant.getTime());
    expect(await traiterBoiteDeSortie(db)).toBe(0); // rejouée (tous projets), échoue encore
    [casse] = await lignes("pf");
    expect(casse).toMatchObject({ processed_at: null, attempts: 2 });
    await pool.query("UPDATE atelier_outbox SET payload = $1 WHERE id = 'evt-casse'", [{ projectId: "pf", revision: 1, objetIds: [], types: [], auteur: "u2", nature: "commande" }]);
    expect(await traiterBoiteDeSortie(db, "pf")).toBe(1);
    [casse] = await lignes("pf");
    expect(casse!.processed_at).not.toBeNull();
    expect(casse).toMatchObject({ attempts: 3, last_error: null });
    expect(await traiterBoiteDeSortie(db, "pf")).toBe(0);
  });

  it("effets d'un lot validé : document périmé, bilan Harmonie périmé, aperçu invalidé, notification regroupée", async () => {
    const { loadDesignContext } = await import("./lib/design-context.js");
    const { documentCatalogue, documentDescriptors, recordProducedDocument } = await import("./lib/documents.js");
    const { notificationsFor } = await import("./routes/notifications.js");
    const { designReviewSnapshot } = await import("@parcours/domain-model");
    await projet("px");
    const charger = async () => {
      const row = (await db.select().from(schema.projects).where(eq(schema.projects.id, "px")))[0]!;
      const project = { ...row, role: "proprietaire" as const };
      return { project, dctx: await loadDesignContext(db, project, new Date().toISOString()) };
    };
    const reviser = async () => {
      const { dctx } = await charger();
      const snap = designReviewSnapshot(dctx.harmony, dctx.analysis, new Date().toISOString(), false);
      await pool.query("UPDATE projects SET harmony = $1 WHERE id = 'px'", [{ ...dctx.harmony, ...snap }]);
    };

    // État initial : bilan revu et produit à la révision 0, à jour.
    await reviser();
    let { project, dctx } = await charger();
    expect(dctx.analysis.stale).toBe(false);
    expect(dctx.audit.find((a) => a.id === "review")?.status).toBe("OK");
    const bilan = documentDescriptors(project, dctx).find((d) => d.kind === "bilan-batiment")!;
    await recordProducedDocument(db, "px", { kind: bilan.kind, label: bilan.label, fileName: bilan.fileName, modelRevision: bilan.current.modelRevision, inputHash: bilan.current.inputHash, stepNumber: bilan.stepNumber }, new Date());
    expect((await documentCatalogue(db, project, dctx)).find((d) => d.kind === "bilan-batiment")!.freshness).toBe("a-jour");
    const majAvant = project.updatedAt;

    // Lot validé par u2 (révision 1), puis traitement.
    const j1 = await valider("px", 1);
    await pool.query("UPDATE projects SET updated_at = $1 WHERE id = 'px'", [majAvant]); // isole l'effet du traitement
    expect(await traiterBoiteDeSortie(db, "px")).toBe(1);
    ({ project, dctx } = await charger());

    // 1. Document dérivé périmé (révision de production ≠ révision courante), toujours listé.
    expect((await documentCatalogue(db, project, dctx)).find((d) => d.kind === "bilan-batiment")).toMatchObject({ freshness: "perime", produced: { modelRevision: 0 }, current: { modelRevision: 1 } });
    // 2. Bilan Harmonie périmé (revue archivée antérieure au lot), avec la révision et l'auteur.
    expect(dctx.analysis.stale).toBe(true);
    expect(dctx.audit.find((a) => a.id === "review")?.status).toBe("À documenter");
    expect((dctx.harmony.designReviewV62 as unknown as Record<string, unknown>)["perimeeParAtelier"]).toMatchObject({ revision: 1, auteur: "u2", commandeId: j1, nature: "commande" });
    // 3. Aperçu conceptuel invalidé : la date de mise à jour (clé de cache client) avance.
    expect(project.updatedAt.getTime()).toBeGreaterThan(majAvant.getTime());
    // 4. Notification aux autres membres (pas à l'auteur), avec révision et auteur.
    let n = (await notificationsFor("u1", "a@example.com", db)).items.filter((i) => i.kind === "modele" && i.projectId === "px");
    expect(n).toEqual([expect.objectContaining({ id: "modele:px:1", projectId: "px", unread: true, text: "b@example.com a modifié le modèle de PX — Projet px dans l’Atelier : révision 1. Les documents produits avant sont périmés." })]);
    expect((await notificationsFor("u2", "b@example.com", db)).items.some((i) => i.kind === "modele")).toBe(false);
    expect((await notificationsFor("u3", "c@example.com", db)).items).toEqual([]); // sans accès au projet

    // Plusieurs lots (deux auteurs) : toujours une seule notification pour le projet.
    await valider("px", 2);
    await valider("px", 3, "u1");
    expect(await traiterBoiteDeSortie(db, "px")).toBe(2);
    n = (await notificationsFor("u1", "a@example.com", db)).items.filter((i) => i.kind === "modele" && i.projectId === "px");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ id: "modele:px:2", text: "b@example.com a modifié le modèle de PX — Projet px dans l’Atelier (2 lots) : révision 2. Les documents produits avant sont périmés." });
    n = (await notificationsFor("u2", "b@example.com", db)).items.filter((i) => i.kind === "modele" && i.projectId === "px");
    expect(n).toEqual([expect.objectContaining({ id: "modele:px:3", text: expect.stringContaining("a@example.com a modifié le modèle de PX") })]);
    // La marque garde la révision la plus haute.
    ({ dctx } = await charger());
    expect((dctx.harmony.designReviewV62 as unknown as Record<string, unknown>)["perimeeParAtelier"]).toMatchObject({ revision: 3, auteur: "u1" });

    // Une nouvelle revue (« Actualiser la revue ») efface la marque ; un événement déjà traité n'est pas rejoué.
    await reviser();
    ({ dctx } = await charger());
    expect(dctx.analysis.stale).toBe(false);
    expect(await traiterBoiteDeSortie(db, "px")).toBe(0);
    ({ dctx } = await charger());
    expect(dctx.analysis.stale).toBe(false);
  });

  it("une revue établie après le lot n'est pas périmée par son traitement tardif", async () => {
    const { loadDesignContext } = await import("./lib/design-context.js");
    const { designReviewSnapshot } = await import("@parcours/domain-model");
    await projet("pt");
    await valider("pt", 1);
    const row = (await db.select().from(schema.projects).where(eq(schema.projects.id, "pt")))[0]!;
    const dctx = await loadDesignContext(db, row, new Date(Date.now() + 1000).toISOString());
    const snap = designReviewSnapshot(dctx.harmony, dctx.analysis, new Date(Date.now() + 1000).toISOString(), false);
    await pool.query("UPDATE projects SET harmony = $1 WHERE id = 'pt'", [{ ...dctx.harmony, ...snap }]);
    expect(await traiterBoiteDeSortie(db, "pt")).toBe(1);
    const h = (await pool.query("SELECT harmony FROM projects WHERE id = 'pt'")).rows[0].harmony as Record<string, Record<string, unknown>>;
    expect(h["designReviewV62"]!["perimeeParAtelier"]).toBeUndefined();
  });
});
