import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Preuves du groupe E (point 2) côté serveur, sans base : routeur Express réel et `lib/studio-*.ts`, base simulée en
 * mémoire (`testing/studio-base-simulee.ts`, déclencheurs relus dans `db/init.sql`).
 *  - EX-082 : une publication diffusée n'est pas réécrite — toute UPDATE de son paquet, de son manifeste ou de ce qui
 *    les couvre est refusée par le déclencheur `studio_publications_package_frozen` ; retrait et remplacement restent
 *    possibles, comme de nouveaux évènements.
 *  - EX-093 : la commande vérifie types, unités et appartenance ; une ouverture rattachée au mur d'une AUTRE variante
 *    (hôte d'autrui), une coordonnée non finie, un type inconnu ou une épaisseur négative : zéro mutation canonique.
 *  - EX-090 : une sauvegarde à laquelle manque une pièce publiée, ou qui ne porte pas le modèle canonique, est déclarée
 *    incomplète (refus nommé), jamais une réussite.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { STUDIO_CONTRACT, type StudioCommand } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioPublicationEvents, studioPublications, studioRevisions, studioVariants } from "../db/schema.js";
import { buildStudioManifest, canonicalJson, checkStudioArchive, emptyStudioTables, studioArchiveDocumentHash, STUDIO_ARCHIVE_SCHEMA, STUDIO_ARCHIVE_SCHEMA_VERSION, type StudioArchiveTables } from "../lib/studio-archive-manifest.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const vp = (v: string) => `${S}/studies/s/variants/${v}`;
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const tete = (v = "v") => banc.lignes.get(studioVariants)!.find((x) => x.id === v)!.headRevisionId as string;
const pub = (id: string) => banc.lignes.get(studioPublications)!.find((r) => r.id === id)!;
let n = 0;
const commander = (v: string, commands: StudioCommand[]) =>
  post("editeur", `${vp(v)}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: `pe-${++n}`, baseRevisionId: tete(v), commands });
const mur = (id: string, extra: Record<string, unknown> = {}): StudioCommand =>
  ({ toolId: "studio.architecture.mur", params: { id, type: "wall", axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thickness: 0.2, height: 2.5, base: 0, justification: "center", ...extra } } as StudioCommand);
const ouverture = (id: string, hostId: string, extra: Record<string, unknown> = {}): StudioCommand =>
  ({ toolId: "studio.architecture.ouverture", params: { id, type: "opening", hostId, position: 2, width: 0.9, height: 2.1, sill: 0, ...extra } } as StudioCommand);

beforeEach(() => { initialiserProjet(); n = 0; });

/** Publication (dessin 2D) soumise, approuvée sur son ensemble examiné, puis diffusée par le propriétaire. */
async function diffusee(): Promise<Record<string, any>> {
  const c = await post("proprietaire", `${vp("v")}/publications`, { title: "Dossier d'essai", contenu: "dessin-2d" });
  expect(c.status).toBe(201);
  const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
  expect(s.status).toBe(200);
  const v = s.body;
  expect((await post("proprietaire", `${S}/studies/s/publications/${v.id}/approuver`, { manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash })).status).toBe(200);
  const d = await post("proprietaire", `${S}/studies/s/publications/${v.id}/diffuser`);
  expect(d.status).toBe(200);
  return d.body;
}

describe("EX-082 — publication non réécrite", () => {
  it("EX-082 [−] réécrire le paquet, le manifeste, la révision ou la diffusion d'une publication diffusée : refusé par le déclencheur, rien ne change", async () => {
    const d = await diffusee();
    const figee = structuredClone(pub(d.id));
    const tentatives: Record<string, unknown>[] = [
      { packageHash: "f".repeat(64) },
      { package: { ...(figee.package as object), files: [] } },
      { manifest: { ...(figee.manifest as object), meta: {} }, manifestHash: "e".repeat(64) },
      { approvedManifestHash: "d".repeat(64) },
      { revisionId: "r0" },
      { diffusedAt: new Date(0) },
    ];
    for (const t of tentatives) {
      await expect(db.update(studioPublications).set(t as never).where(eq(studioPublications.id, d.id)), JSON.stringify(Object.keys(t))).rejects.toThrow("studio_publication_package_immutable");
    }
    expect(pub(d.id)).toEqual(figee);
  });

  it("EX-082 [+] retrait et remplacement restent de nouveaux évènements journalisés ; paquet et manifeste antérieurs identiques", async () => {
    const d1 = await diffusee();
    const figee = structuredClone({ package: pub(d1.id).package, packageHash: pub(d1.id).packageHash, manifest: pub(d1.id).manifest, manifestHash: pub(d1.id).manifestHash });
    const d2 = await diffusee();
    expect(pub(d1.id)).toMatchObject({ ...figee, diffusionStatus: "remplace", replacedByPublicationId: d2.id });
    const w = await post("proprietaire", `${S}/studies/s/publications/${d1.id}/retirer`, { comment: "Retrait d'essai" });
    expect(w.status).toBe(200);
    expect(pub(d1.id)).toMatchObject({ ...figee, diffusionStatus: "retire" });
    expect(banc.lignes.get(studioPublicationEvents)!.filter((e) => e.publicationId === d1.id).map((e) => e.action)).toEqual(["creer", "soumettre", "approuver", "diffuser", "remplacer", "retirer"]);
    // Une publication non diffusée garde son cycle normal : son manifeste se réécrit (actualisation), hors du déclencheur.
    const c = await post("proprietaire", `${vp("v")}/publications`, { title: "Brouillon", contenu: "dessin-2d" });
    await expect(db.update(studioPublications).set({ manifestHash: "c".repeat(64) }).where(eq(studioPublications.id, c.body.id))).resolves.toBeDefined();
    // Publication restaurée d'une archive non vérifiée, remise « non diffusée » à relire (paquet conservé) : elle n'est la
    // diffusion de personne et repasse par le circuit complet (actualiser, approuver, diffuser) — hors du déclencheur.
    const d3 = await diffusee();
    Object.assign(pub(d3.id), { diffusionStatus: "non-diffuse", workStatus: "en-revue", status: "soumis" });
    await expect(db.update(studioPublications).set({ manifestHash: "b".repeat(64) }).where(eq(studioPublications.id, d3.id))).resolves.toBeDefined();
  });
});

describe("EX-093 — intégrité des modèles vérifiée par le serveur", () => {
  it("EX-093 [+] mur et ouverture valides (types, unités, hôte de la même variante) : état cohérent écrit par le serveur", async () => {
    const r = await commander("v", [mur("m1"), ouverture("o1", "m1")]);
    expect(r.status).toBe(200);
    const doc = r.body.revision.document as { architecture: { id: string; type: string; hostId?: string }[] };
    expect(doc.architecture.filter((o) => o.id === "m1" || o.id === "o1").map((o) => [o.id, o.type, o.hostId ?? null])).toEqual([["m1", "wall", null], ["o1", "opening", "m1"]]);
  });

  it("EX-093 [−] hôte d'autrui (mur d'une autre variante), coordonnée non finie, type inconnu, épaisseur négative : 400, zéro mutation canonique", async () => {
    const v2 = await post("proprietaire", `${S}/studies/s/variants`, { name: "Autre variante" });
    expect(v2.status).toBe(201);
    const autre = v2.body.variant.id as string;
    expect((await commander(autre, [mur("m-autre")])).status).toBe(200);
    expect((await commander("v", [mur("m1")])).status).toBe(200);
    const avant = instantane();
    const revisions = banc.lignes.get(studioRevisions)!.length;
    const refus = [
      [ouverture("o1", "m-autre")],
      [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: Number.NaN, y: 0 }, end: { x: 1, y: 0 } } } as StudioCommand],
      [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "inconnu", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } } as unknown as StudioCommand],
      [mur("m2", { thickness: -0.2 })],
    ];
    for (const lot of refus) {
      const r = await commander("v", lot);
      expect(r.status, JSON.stringify(lot)).toBe(400);
    }
    expect(banc.lignes.get(studioRevisions)!.length).toBe(revisions);
    expect(instantane()).toBe(avant);
    // L'ouverture visant le mur de l'autre variante est refusée pour hôte introuvable dans SA variante.
    const r = await commander("v", [ouverture("o1", "m-autre")]);
    expect(JSON.stringify(r.body)).toContain("m-autre");
  });
});

describe("EX-090 — reconstruction : une sauvegarde incomplète n'est jamais une réussite", () => {
  const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
  const ACCOUNTS = [{ id: "uOwner", email: "owner@example.test" }];
  const IDENT = { sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS };
  const doc = { id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [{ id: "l0", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }] };
  const pdf = Buffer.from("%PDF-1.4 piece publiee");
  const pdfId = sha(pdf);
  function section(modifier: (t: StudioArchiveTables) => void = () => {}): unknown {
    const t = emptyStudioTables();
    t.studio_studies = [{ id: "s1", project_id: "pA", name: "Étude", initial_variant_id: "v1" }];
    t.studio_variants = [{ id: "v1", study_id: "s1", name: "Initiale", head_revision_id: "r1", derived_from_variant_id: null, derived_from_revision_id: null }];
    t.studio_revisions = [{ id: "r1", variant_id: "v1", parent_revision_id: null, document: doc, payload_hash: "a".repeat(64), author_id: "uOwner" }];
    t.volumes = [{ id: pdfId, mime: "application/pdf", size: pdf.length, content: `\\x${pdf.toString("hex")}` }];
    const pkg = { schema: "studio-publication-package/1", revisionId: "r1", documentHash: studioArchiveDocumentHash(doc), files: [{ format: "pdf", sha256: pdfId }] };
    t.studio_publications = [{ id: "p1", project_id: "pA", status: "diffuse", study_id: "s1", variant_id: "v1", revision_id: "r1", document_hash: studioArchiveDocumentHash(doc), package: pkg, package_hash: sha(canonicalJson(pkg)), created_by: "uOwner", approved_by: "uOwner", diffused_by: "uOwner" }];
    t.studio_publication_events = [{ id: "pe1", publication_id: "p1", author_id: "uOwner" }];
    modifier(t);
    return JSON.parse(JSON.stringify({ schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables: t, manifest: buildStudioManifest(t, IDENT) }));
  }
  const erreurs = (raw: unknown) => { const r = checkStudioArchive(raw); return r.ok ? [] : r.errors; };

  it("EX-090 [+] sauvegarde complète (canonique, manifeste, pièce publiée, droits) : acceptée", () => {
    expect(checkStudioArchive(section()).ok).toBe(true);
  });
  it("EX-090 [−] pièce publiée absente de la sauvegarde (manifeste recalculé, donc cohérent) : restauration refusée, pièce nommée", () => {
    const r = checkStudioArchive(section((t) => { t.volumes = []; }));
    expect(r.ok).toBe(false);
    expect(erreurs(section((t) => { t.volumes = []; }))).toContain(`publication p1 : fichier ${pdfId} absent`);
  });
  it("EX-090 [−] sauvegarde sans le modèle canonique (pièces seules, révisions absentes) : restauration refusée, jamais une réussite globale", () => {
    const e = erreurs(section((t) => { t.studio_revisions = []; }));
    expect(e.length).toBeGreaterThan(0);
    expect(e).toEqual(expect.arrayContaining(["publication p1 : révision absente"]));
  });
});
