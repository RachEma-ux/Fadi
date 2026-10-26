import { describe, expect, it, vi } from "vitest";
/**
 * TR-EX-046 (ADR-STUDIO-PILOTE-01, P-12) : journal d'accès Studio — événements sensibles minimisés, conservés 12 mois
 * (paramétrable), purgés par une tâche datée ; le journal d'audit des publications reste immuable. Logique pure et
 * intergiciel sur un routeur Express réel (puits d'essai) ; la purge sur base réelle jetable est jouée par
 * `routes/studio-journal-acces.test.ts` (DB-3, CI).
 */
vi.mock("../db/client.js", () => ({ db: {} }));

import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import { studioAccessEvents, studioAccessPurges } from "../db/schema.js";
import {
  conservationJournalAccesStudio, genreEvenementAcces, journalAccesStudio, limiteConservation, purgerJournalAccesStudio, routeGenerique,
  STUDIO_ACCES_CONSERVATION_MOIS_DEFAUT, type EvenementAccesStudio,
} from "./studio-journal-acces.js";

const dialecte = new PgDialect();

/** Requêteur d'essai : enregistre les tables visées et la condition de suppression. */
function requeteur(supprimes: number) {
  const appels: { op: string; table: string; sql?: string; params?: unknown[]; valeurs?: unknown }[] = [];
  return {
    appels,
    q: {
      delete: (table: never) => ({ where: (cond: never) => ({ returning: async () => {
        const r = dialecte.sqlToQuery(cond);
        appels.push({ op: "delete", table: getTableName(table), sql: r.sql, params: r.params });
        return Array.from({ length: supprimes }, (_, i) => ({ id: `e${i}` }));
      } }) }),
      insert: (table: never) => ({ values: async (valeurs: unknown) => { appels.push({ op: "insert", table: getTableName(table), valeurs }); } }),
    } as never,
  };
}

describe("TR-EX-046 — journal d'accès Studio : minimisation, conservation 12 mois, purge datée", () => {
  it("TR-EX-046 [+] conservation de 12 mois par défaut, paramétrable par STUDIO_ACCESS_RETENTION_MONTHS (1 à 120), limite en mois civils", () => {
    expect(STUDIO_ACCES_CONSERVATION_MOIS_DEFAUT).toBe(12);
    expect(conservationJournalAccesStudio({})).toEqual({ mois: 12, invalide: false });
    expect(conservationJournalAccesStudio({ STUDIO_ACCESS_RETENTION_MONTHS: "24" })).toEqual({ mois: 24, invalide: false });
    for (const v of ["0", "121", "1.5", "douze"]) expect(conservationJournalAccesStudio({ STUDIO_ACCESS_RETENTION_MONTHS: v })).toEqual({ mois: 12, invalide: true });
    expect(limiteConservation(new Date("2026-10-25T08:30:00.000Z"), 12).toISOString()).toBe("2025-10-25T08:30:00.000Z");
    expect(limiteConservation(new Date("2026-03-31T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(limiteConservation(new Date("2026-01-15T12:00:00.000Z"), 13).toISOString()).toBe("2024-12-15T12:00:00.000Z");
  });

  it("TR-EX-046 [+] purge datée : supprime seulement les événements antérieurs à la limite, puis date la purge (limite, durée, nombre)", async () => {
    const maintenant = new Date("2026-10-25T08:30:00.000Z");
    const { q, appels } = requeteur(3);
    const r = await purgerJournalAccesStudio(q, maintenant, 12);
    expect(r).toEqual({ limite: new Date("2025-10-25T08:30:00.000Z"), supprimes: 3 });
    expect(appels.map((a) => [a.op, a.table])).toEqual([["delete", "studio_access_events"], ["insert", "studio_access_purges"]]);
    expect(appels[0]!.sql).toMatch(/"studio_access_events"\."occurred_at" < \$1/);
    expect(appels[0]!.params).toEqual([new Date("2025-10-25T08:30:00.000Z").toISOString()]);
    expect(appels[1]!.valeurs).toMatchObject({ ranAt: maintenant, cutoff: r.limite, retentionMonths: 12, deleted: 3 });
    // Rien à purger : aucune ligne de purge écrite.
    const vide = requeteur(0);
    expect((await purgerJournalAccesStudio(vide.q, maintenant, 12)).supprimes).toBe(0);
    expect(vide.appels.map((a) => a.op)).toEqual(["delete"]);
    expect(getTableName(studioAccessEvents)).toBe("studio_access_events");
    expect(getTableName(studioAccessPurges)).toBe("studio_access_purges");
  });

  it("TR-EX-046 [−] la purge ne touche jamais le journal d'audit des publications, immuable en base ; une durée invalide est refusée", async () => {
    const { q, appels } = requeteur(1);
    await purgerJournalAccesStudio(q, new Date("2026-10-25T00:00:00.000Z"), 12);
    expect(appels.some((a) => a.table === "studio_publication_events")).toBe(false);
    await expect(purgerJournalAccesStudio(q, new Date(), 0)).rejects.toThrow("studio_access_retention_invalid");
    await expect(purgerJournalAccesStudio(q, new Date(), 121)).rejects.toThrow("studio_access_retention_invalid");
    const init = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
    expect(init).toMatch(/CREATE OR REPLACE TRIGGER studio_publication_events_no_update BEFORE UPDATE ON studio_publication_events/);
    expect(init).toMatch(/CREATE OR REPLACE TRIGGER studio_publication_events_no_delete BEFORE DELETE ON studio_publication_events/);
    expect(init).toMatch(/CREATE OR REPLACE TRIGGER studio_access_events_no_update BEFORE UPDATE ON studio_access_events/);
  });

  it("TR-EX-046 [+] événements sensibles : refus 401/403/404/423 et sorties de contenu, route générique, sans identifiant d'objet", () => {
    for (const s of [401, 403, 404, 423]) expect(genreEvenementAcces("POST", "/studies/:studyId/variants", s)).toBe("refus");
    expect(genreEvenementAcces("GET", "/studies/:studyId/variants/:variantId/export", 200)).toBe("export");
    expect(genreEvenementAcces("GET", "/studies/:studyId/publications/:publicationId/files/:format", 200)).toBe("export");
    expect(genreEvenementAcces("GET", "/studies/:studyId/variants/:variantId", 200)).toBeNull();
    expect(genreEvenementAcces("POST", "/studies/:studyId/variants/:variantId/commands", 409)).toBeNull();
    expect(routeGenerique("/projects/p1/studio/studies/s1/variants/v1/export?format=ifc", { projectId: "p1", studyId: "s1", variantId: "v1" })).toBe("/studies/:studyId/variants/:variantId/export");
    expect(routeGenerique("/projects/p1/studio/studies/studio_study_0f8c2a4e-1b2c-4d5e-8f90-123456789abc/variants", { projectId: "p1" })).toBe("/studies/:id/variants");
  });

  it("TR-EX-046 [+] intergiciel : un refus et un export sont journalisés minimisés (ni IP, ni courriel, ni corps) ; une lecture ordinaire ne l'est pas", async () => {
    const recus: EvenementAccesStudio[] = [];
    const app = express();
    app.use(express.json());
    const studio = express.Router({ mergeParams: true });
    studio.use(journalAccesStudio(async (e) => { recus.push(e); }));
    studio.use((req, _res, next) => { (req as { user?: { id: string } }).user = { id: "u1" }; next(); });
    studio.get("/studies/:studyId/variants/:variantId/export", (_req, res) => { res.send("ISO-10303-21;"); });
    studio.get("/studies/:studyId", (_req, res) => { res.json({ ok: true }); });
    studio.post("/studies/:studyId/variants", (_req, res) => { res.status(403).json({ error: "forbidden" }); });
    app.use("/projects/:projectId/studio", studio);
    await request(app).get("/projects/p1/studio/studies/s1/variants/v1/export?format=ifc").set("x-forwarded-for", "203.0.113.9");
    await request(app).get("/projects/p1/studio/studies/s1");
    await request(app).post("/projects/p1/studio/studies/s1/variants").send({ name: "secret@example.com", geometrie: [1, 2] });
    await vi.waitFor(() => expect(recus).toHaveLength(2));
    expect(recus).toEqual([
      { actorId: "u1", projectId: "p1", method: "GET", route: "/studies/:studyId/variants/:variantId/export", status: 200, kind: "export", motif: "export" },
      { actorId: "u1", projectId: "p1", method: "POST", route: "/studies/:studyId/variants", status: 403, kind: "refus", motif: "droit" },
    ]);
    expect(JSON.stringify(recus)).not.toMatch(/203\.0\.113|example\.com|geometrie|ifc/);
  });

  it("TR-EX-046 [−] sans puits activé (routeur monté seul), rien n'est écrit ; une écriture qui échoue est signalée sans casser la réponse", async () => {
    const lignes: string[] = [];
    const app = express();
    const studio = express.Router({ mergeParams: true });
    studio.use(journalAccesStudio(undefined, (l) => lignes.push(l)));
    studio.get("/x", (_req, res) => { res.status(404).end(); });
    app.use("/projects/:projectId/studio", studio);
    expect((await request(app).get("/projects/p1/studio/x")).status).toBe(404);
    const app2 = express();
    const studio2 = express.Router({ mergeParams: true });
    studio2.use(journalAccesStudio(async () => { throw new Error("base indisponible"); }, (l) => lignes.push(l)));
    studio2.get("/x", (_req, res) => { res.status(404).end(); });
    app2.use("/projects/:projectId/studio", studio2);
    expect((await request(app2).get("/projects/p1/studio/x")).status).toBe(404);
    await vi.waitFor(() => expect(lignes).toHaveLength(1));
    expect(lignes[0]).toMatch(/studio_access_journal.*base indisponible/);
  });
});
