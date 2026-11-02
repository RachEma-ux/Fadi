/**
 * TR-EX-046 (ADR-STUDIO-PILOTE-01, P-12), sur base réelle JETABLE (DB-3) et l'application complète : le journal d'accès
 * Studio enregistre les refus et les exports, minimisés ; la purge datée supprime les événements au-delà de 12 mois et
 * garde les autres ; une ligne du journal n'est jamais modifiée ; le journal d'audit des publications reste immuable.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray, sql } from "drizzle-orm";
import { createApp } from "../app.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { db, pool } from "../db/client.js";
import { studioAccessEvents, studioAccessPurges } from "../db/schema.js";
import { runStudioAccessRetentionJob } from "../lib/studio-journal-acces.js";

const app = createApp();
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

async function compte(email: string) {
  const client = request.agent(app);
  const r = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(r.status).toBe(201);
  return { client, id: r.body.id as string };
}

describe("TR-EX-046 — journal d'accès Studio sur base réelle : enregistrement minimisé, purge datée à 12 mois", () => {
  it("TR-EX-046 [+] base réelle : un refus et un export Studio sont journalisés sans IP ni courriel ; la purge supprime au-delà de 12 mois, garde le reste et se date", async () => {
    const proprietaire = await compte("journal-proprio@example.com");
    const etranger = await compte("journal-etranger@example.com");
    const projet = (await proprietaire.client.post("/projects").send({ code: "P.JRN", name: "Journal" })).body.id as string;
    const etude = await proprietaire.client.post(`/projects/${projet}/studio/studies`).send({ name: "Étude" });
    expect(etude.status).toBe(201);
    const v = `/projects/${projet}/studio/studies/${etude.body.study.id}/variants/${etude.body.variant.id}`;
    expect((await etranger.client.get(v)).status).toBe(404);
    expect((await proprietaire.client.get(`${v}/export?format=svg`)).status).toBe(200);
    await expect.poll(async () => (await db.select().from(studioAccessEvents).where(eq(studioAccessEvents.projectId, projet))).length).toBe(2);
    const lignes = await db.select().from(studioAccessEvents).where(eq(studioAccessEvents.projectId, projet));
    expect(lignes.map((l) => [l.kind, l.status, l.route, l.actorId]).sort()).toEqual([
      ["export", 200, "/studies/:studyId/variants/:variantId/export", proprietaire.id],
      ["refus", 404, "/studies/:studyId/variants/:variantId", etranger.id],
    ].sort());
    expect(JSON.stringify(lignes)).not.toMatch(/example\.com|127\.0\.0\.1|::1/);

    // Événements datés : 13 mois (purgé), 11 mois (gardé).
    const maintenant = new Date();
    const il = (mois: number) => { const d = new Date(maintenant); d.setUTCMonth(d.getUTCMonth() - mois); return d; };
    await db.insert(studioAccessEvents).values([
      { id: "acc-vieux", occurredAt: il(13), actorId: null, projectId: projet, method: "GET", route: "/studies/:studyId", status: 404, kind: "refus", motif: "non-divulgue" },
      { id: "acc-recent", occurredAt: il(11), actorId: null, projectId: projet, method: "GET", route: "/studies/:studyId", status: 404, kind: "refus", motif: "non-divulgue" },
    ]);
    const r = await runStudioAccessRetentionJob(maintenant, {});
    expect(r.supprimes).toBeGreaterThanOrEqual(1);
    const restants = (await db.select({ id: studioAccessEvents.id }).from(studioAccessEvents).where(inArray(studioAccessEvents.id, ["acc-vieux", "acc-recent"]))).map((x) => x.id);
    expect(restants).toEqual(["acc-recent"]);
    const [purge] = await db.select().from(studioAccessPurges).where(eq(studioAccessPurges.cutoff, r.limite));
    expect(purge).toMatchObject({ retentionMonths: 12, deleted: r.supprimes });
    // Durée paramétrée : 6 mois purge aussi l'événement de 11 mois.
    expect((await runStudioAccessRetentionJob(maintenant, { STUDIO_ACCESS_RETENTION_MONTHS: "6" })).supprimes).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(studioAccessEvents).where(eq(studioAccessEvents.id, "acc-recent"))).toEqual([]);
  });

  it("TR-EX-046 [−] base réelle : une ligne du journal d'accès n'est jamais modifiée ; le journal des publications refuse toute modification", async () => {
    await db.insert(studioAccessEvents).values({ id: "acc-fixe", actorId: null, projectId: "p-x", method: "GET", route: "/studies/:studyId", status: 403, kind: "refus", motif: "droit" });
    await expect(db.update(studioAccessEvents).set({ status: 200 }).where(eq(studioAccessEvents.id, "acc-fixe"))).rejects.toThrow();
    const declencheurs = await db.execute(sql`SELECT tgname FROM pg_trigger WHERE tgrelid = 'studio_publication_events'::regclass AND NOT tgisinternal ORDER BY tgname`);
    expect((declencheurs.rows as { tgname: string }[]).map((t) => t.tgname)).toEqual(expect.arrayContaining(["studio_publication_events_no_delete", "studio_publication_events_no_update"]));
    await db.delete(studioAccessEvents).where(eq(studioAccessEvents.id, "acc-fixe"));
  });
});
