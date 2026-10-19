import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  STUDIO_ARCHIVE_SCHEMA, STUDIO_ARCHIVE_SCHEMA_VERSION, STUDIO_ARCHIVE_TABLES, buildStudioManifest, canonicalJson, checkStudioArchive,
  emptyStudioTables, mapStudioAccounts, orderCommentsForInsert, packageVolumeIds, remapStudioRows, studioAccountIds,
  studioArchiveDocumentHash, studioTableHash, type StudioArchiveTables,
} from "./studio-archive-manifest.js";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const doc = (n: number) => ({ id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, type: "line", start: { x: 0, y: 0 }, end: { x: i + 1, y: 1 } })) });
const pdf = Buffer.from("%PDF-1.4 recette");
const pdfId = sha(pdf);

/** Petit projet Studio cohérent : une étude, deux variantes, trois révisions, un fil de commentaires, une observation, un lien d'étape, une publication diffusée. */
function fixture(): { tables: StudioArchiveTables; section: Record<string, unknown> } {
  const t = emptyStudioTables();
  t.studio_studies = [{ id: "s1", project_id: "pA", name: "Étude", initial_variant_id: "v1", created_at: "2026-10-19T08:00:00.123456+00:00" }];
  t.studio_variants = [
    { id: "v1", study_id: "s1", name: "Initiale", head_revision_id: "r2", derived_from_variant_id: null, derived_from_revision_id: null },
    { id: "v2", study_id: "s1", name: "Dérivée", head_revision_id: "r3", derived_from_variant_id: "v1", derived_from_revision_id: "r1" },
  ];
  t.studio_revisions = [
    { id: "r1", variant_id: "v1", parent_revision_id: null, document: doc(0), payload_hash: "a".repeat(64), author_id: "uOwner" },
    { id: "r2", variant_id: "v1", parent_revision_id: "r1", document: doc(1), payload_hash: "b".repeat(64), author_id: "uEditor" },
    { id: "r3", variant_id: "v2", parent_revision_id: null, document: doc(0), payload_hash: "c".repeat(64), author_id: "uOwner" },
  ];
  t.studio_comments = [
    { id: "c2", variant_id: "v1", revision_id: "r2", parent_id: "c1", author_id: "uOwner", body: "Réponse" },
    { id: "c1", variant_id: "v1", revision_id: "r2", parent_id: null, author_id: "uEditor", body: "Remarque" },
  ];
  t.studio_observations = [{ comment_id: "c1", variant_id: "v1", responsable_id: "uEditor", created_by: "uEditor", statut: "ouverte", correction_revision_id: null, recontrole_revision_id: null }];
  t.studio_observation_events = [{ id: "e1", observation_id: "c1", seq: 1, actor_id: "uEditor", responsable_id: "uEditor" }];
  t.studio_study_steps = [{ study_id: "s1", step_number: 3, created_by: "uOwner" }];
  t.volumes = [{ id: pdfId, mime: "application/pdf", size: pdf.length, content: `\\x${pdf.toString("hex")}` }];
  const pkg = { schema: "studio-publication-package/1", revisionId: "r2", documentHash: studioArchiveDocumentHash(doc(1)), files: [{ format: "pdf", sha256: pdfId }] };
  t.studio_publications = [{ id: "p1", project_id: "pA", study_id: "s1", variant_id: "v1", revision_id: "r2", document_hash: studioArchiveDocumentHash(doc(1)), package: pkg, package_hash: sha(canonicalJson(pkg)), created_by: "uEditor", approved_by: "uOwner", diffused_by: "uEditor" }];
  t.studio_publication_events = [{ id: "pe1", publication_id: "p1", author_id: "uEditor" }];
  t.project_members = [{ project_id: "pA", user_id: "uEditor", role: "editeur", invited_by: "owner@example.test" }];
  t.studio_tool_preferences = [{ user_id: "uEditor", profile: "standard", favorites: [], personal: [] }];
  const section = {
    schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner",
    accounts: [{ id: "uEditor", email: "Editeur@example.test" }, { id: "uOwner", email: "owner@example.test" }],
    tables: t, manifest: buildStudioManifest(t),
  };
  return { tables: t, section };
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const errorsOf = (raw: unknown) => { const r = checkStudioArchive(raw); return r.ok ? [] : r.errors; };

describe("section Studio de l'archive (logique pure)", () => {
  it("JSON canonique : clés triées, ordre des tableaux conservé, indéfinis omis", () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }], u: undefined })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
    expect(studioArchiveDocumentHash({ b: 1, a: 2 })).toBe(sha('{"a":2,"b":1}'));
  });

  it("manifeste : version de schéma, effectif et empreinte par table, indépendants de l'ordre de lecture", () => {
    const { tables } = fixture();
    const m = buildStudioManifest(tables);
    expect(m.schema).toBe(STUDIO_ARCHIVE_SCHEMA);
    expect(m.schemaVersion.document).toBe("studio-document/1");
    expect(Object.keys(m.tables)).toEqual([...STUDIO_ARCHIVE_TABLES]);
    expect(m.tables.studio_revisions.count).toBe(3);
    expect(m.tables.studio_comments.count).toBe(2);
    const reversed = { ...tables, studio_revisions: [...tables.studio_revisions].reverse() };
    expect(buildStudioManifest(reversed)).toEqual(m);
    expect(studioTableHash("studio_revisions", tables.studio_revisions)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("section cohérente acceptée après un aller-retour JSON", () => {
    expect(errorsOf(clone(fixture().section))).toEqual([]);
  });

  it("refuse une révision altérée (empreinte du manifeste), un volume altéré, une empreinte de document fausse", () => {
    const a = clone(fixture().section) as { tables: StudioArchiveTables };
    (a.tables.studio_revisions[1]!["document"] as { objects: unknown[] }).objects = [];
    expect(errorsOf(a)).toEqual(expect.arrayContaining(["studio_revisions : empreinte différente du manifeste"]));

    const b = fixture();
    b.tables.volumes[0]!["content"] = `\\x${Buffer.from("autre").toString("hex")}`;
    b.section["manifest"] = buildStudioManifest(b.tables);
    expect(errorsOf(clone(b.section)).some((e) => e.includes("contenu différent de son empreinte"))).toBe(true);

    const c = fixture();
    c.tables.studio_publications[0]!["document_hash"] = "f".repeat(64);
    c.section["manifest"] = buildStudioManifest(c.tables);
    expect(errorsOf(clone(c.section)).some((e) => e.includes("empreinte du document différente"))).toBe(true);
  });

  it("refuse une référence hors de la section (variante sans étude, parent absent, autre projet, compte sans adresse)", () => {
    const f = fixture();
    f.tables.studio_variants.push({ id: "v9", study_id: "autre", name: "x", head_revision_id: "r1" });
    f.tables.studio_comments.push({ id: "c9", variant_id: "v1", revision_id: null, parent_id: "inconnu", author_id: "uX" });
    f.tables.studio_publications[0]!["project_id"] = "pB";
    f.section["manifest"] = buildStudioManifest(f.tables);
    const errors = errorsOf(clone(f.section));
    expect(errors).toEqual(expect.arrayContaining([
      "variante v9 : étude absente", "variante v9 : tête absente", "commentaire c9 : parent absent", "publication p1 : autre projet", "compte uX cité sans adresse",
    ]));
  });

  it("refuse un schéma inconnu, une table absente ou une clé en double", () => {
    expect(errorsOf({ ...fixture().section, schema: "autre/1" })[0]).toMatch(/non pris en charge/);
    const t = clone(fixture().section) as { tables: Record<string, unknown> };
    delete t.tables["studio_comments"];
    expect(errorsOf(t)).toContain("table studio_comments illisible");
    const d = fixture();
    d.tables.studio_studies.push({ ...d.tables.studio_studies[0]! });
    expect(errorsOf(clone({ ...d.section, manifest: buildStudioManifest(d.tables) }))).toContain("studio_studies : clé en double s1");
  });

  it("commentaires insérés parent d'abord ; lignes remappées sans toucher au contenu ni aux empreintes", () => {
    const { tables } = fixture();
    expect(orderCommentsForInsert(tables.studio_comments).map((c) => c["id"])).toEqual(["c1", "c2"]);
    const map = new Map([["uOwner", "uB1"], ["uEditor", "uB2"]]);
    const revs = remapStudioRows("studio_revisions", tables.studio_revisions, "pB", map);
    expect(revs.map((r) => r["author_id"])).toEqual(["uB1", "uB2", "uB1"]);
    expect(revs.map((r) => r["payload_hash"])).toEqual(tables.studio_revisions.map((r) => r["payload_hash"]));
    expect(revs.map((r) => r["document"])).toEqual(tables.studio_revisions.map((r) => r["document"]));
    const pubs = remapStudioRows("studio_publications", tables.studio_publications, "pB", map);
    expect(pubs[0]).toMatchObject({ project_id: "pB", created_by: "uB2", approved_by: "uB1", document_hash: tables.studio_publications[0]!["document_hash"], package_hash: tables.studio_publications[0]!["package_hash"] });
    expect(tables.studio_publications[0]!["project_id"]).toBe("pA");
  });

  it("comptes : retrouvés par adresse (casse ignorée), sinon réattribués au compte qui restaure et déclarés", () => {
    const { section, tables } = fixture();
    expect(studioAccountIds(tables, "uOwner")).toEqual(["uEditor", "uOwner"]);
    const { map, reassigned } = mapStudioAccounts(section["accounts"] as { id: string; email: string }[], new Map([["owner@example.test", "uB1"]]), "uB1");
    expect(map.get("uOwner")).toBe("uB1");
    expect(map.get("uEditor")).toBe("uB1");
    expect(reassigned).toEqual(["Editeur@example.test"]);
    expect(mapStudioAccounts([{ id: "uEditor", email: "Editeur@example.test" }], new Map([["editeur@example.test", "uB2"]]), "uB1").map.get("uEditor")).toBe("uB2");
  });

  it("volumes cités par les paquets", () => {
    expect(packageVolumeIds(fixture().tables.studio_publications)).toEqual([pdfId]);
    expect(packageVolumeIds([{ package: null }])).toEqual([]);
  });
});
