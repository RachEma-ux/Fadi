import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STUDIO_ARCHIVE_SCHEMA, STUDIO_ARCHIVE_SCHEMA_VERSION, STUDIO_ARCHIVE_TABLES, buildStudioManifest, canonicalJson, checkStudioArchive,
  STUDIO_DOWNGRADE_COMMENT, distrustRequirementSets, distrustStudioPublications, orderPublicationsForInsert, emptyStudioTables, mapStudioAccounts, orderCommentsForInsert, packageVolumeIds, remapStudioJsonAccounts, remapStudioRows, studioAccountIds, studioExportAccountIds, studioJsonAccountIds,
  STUDIO_JSON_ACCOUNT_FIELDS, STUDIO_JSON_FIELDS_WITHOUT_ACCOUNTS, STUDIO_ARCHIVE_LEGACY_TABLES_VERSION, STUDIO_ARCHIVE_PRE_QUANTITES_TABLES_VERSION, STUDIO_ARCHIVE_TABLES_BY_VERSION, STUDIO_ARCHIVE_TABLES_E2,
  studioArchiveDocumentHash, studioTableHash, type StudioArchiveTables,
} from "./studio-archive-manifest.js";

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const doc = (n: number) => ({ id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, type: "line", start: { x: 0, y: 0 }, end: { x: i + 1, y: 1 } })) });
const pdf = Buffer.from("%PDF-1.4 recette");
const pdfId = sha(pdf);
const ACCOUNTS = [{ id: "uEditor", email: "Editeur@example.test" }, { id: "uOwner", email: "owner@example.test" }];
const IDENT = { sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS };

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
  t.studio_publications = [{ id: "p1", project_id: "pA", status: "diffuse", study_id: "s1", variant_id: "v1", revision_id: "r2", document_hash: studioArchiveDocumentHash(doc(1)), package: pkg, package_hash: sha(canonicalJson(pkg)), created_by: "uEditor", approved_by: "uOwner", diffused_by: "uEditor" }];
  t.studio_publication_events = [{ id: "pe1", publication_id: "p1", author_id: "uEditor" }];
  t.project_members = [{ project_id: "pA", user_id: "uEditor", role: "editeur", invited_by: "owner@example.test" }];
  t.studio_tool_preferences = [{ user_id: "uEditor", profile: "standard", favorites: [], personal: [] }];
  const section = {
    schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner",
    accounts: ACCOUNTS,
    tables: t, manifest: buildStudioManifest(t, IDENT),
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
    const m = buildStudioManifest(tables, IDENT);
    expect(m.schema).toBe(STUDIO_ARCHIVE_SCHEMA);
    expect(m.schemaVersion.document).toBe("studio-document/1");
    expect(Object.keys(m.tables)).toEqual([...STUDIO_ARCHIVE_TABLES]);
    expect(m.tables.studio_revisions.count).toBe(3);
    expect(m.tables.studio_comments.count).toBe(2);
    const reversed = { ...tables, studio_revisions: [...tables.studio_revisions].reverse() };
    expect(buildStudioManifest(reversed, IDENT)).toEqual(m);
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
    b.section["manifest"] = buildStudioManifest(b.tables, IDENT);
    expect(errorsOf(clone(b.section)).some((e) => e.includes("contenu différent de son empreinte"))).toBe(true);

    const c = fixture();
    c.tables.studio_publications[0]!["document_hash"] = "f".repeat(64);
    c.section["manifest"] = buildStudioManifest(c.tables, IDENT);
    expect(errorsOf(clone(c.section)).some((e) => e.includes("empreinte du document différente"))).toBe(true);
  });

  it("refuse une référence hors de la section (variante sans étude, parent absent, autre projet, compte sans adresse)", () => {
    const f = fixture();
    f.tables.studio_variants.push({ id: "v9", study_id: "autre", name: "x", head_revision_id: "r1" });
    f.tables.studio_comments.push({ id: "c9", variant_id: "v1", revision_id: null, parent_id: "inconnu", author_id: "uX" });
    f.tables.studio_publications[0]!["project_id"] = "pB";
    f.section["manifest"] = buildStudioManifest(f.tables, IDENT);
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
    expect(errorsOf(clone({ ...d.section, manifest: buildStudioManifest(d.tables, IDENT) }))).toContain("studio_studies : clé en double s1");
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

  it("empreinte globale : couvre les adresses des comptes, le projet et le propriétaire (pas seulement les lignes)", () => {
    const { tables } = fixture();
    const base = buildStudioManifest(tables, IDENT).hash;
    expect(buildStudioManifest(tables, { ...IDENT, accounts: [...ACCOUNTS].reverse() }).hash).toBe(base);
    expect(buildStudioManifest(tables, { ...IDENT, accounts: [{ id: "uEditor", email: "autre@example.test" }, ACCOUNTS[1]!] }).hash).not.toBe(base);
    expect(buildStudioManifest(tables, { ...IDENT, ownerId: "uEditor" }).hash).not.toBe(base);
    expect(buildStudioManifest(tables, { ...IDENT, sourceProjectId: "pZ" }).hash).not.toBe(base);
    // Adresse réécrite sans recalcul du manifeste : refusée (intégrité, 422).
    const s = clone(fixture().section) as { accounts: { id: string; email: string }[] };
    s.accounts[0]!.email = "pirate@example.test";
    expect(errorsOf(s)).toContain("empreinte globale différente du manifeste");
  });

  it("archive non vérifiée, modèle E.4 : travail approuvé → en revue, diffusion en vigueur → non diffusée, statut combiné recalculé, journal complété", () => {
    const { tables } = fixture();
    const mh = "9".repeat(64);
    const pubs: Record<string, unknown>[] = [
      // Ligne E.4 diffusée (fixture) : travail approuvé, diffusion en vigueur.
      ...remapStudioRows("studio_publications", tables.studio_publications, "pB", new Map([["uOwner", "uR"], ["uEditor", "uR"]])).map((p) => ({ ...p, work_status: "approuve", diffusion_status: "diffuse", manifest_hash: mh, approved_manifest_hash: mh })),
      { id: "p2", variant_id: "v1", revision_id: "r2", document_hash: "d".repeat(64), status: "approuve", work_status: "approuve", diffusion_status: "non-diffuse", approved_revision_id: "r2", approved_document_hash: "d".repeat(64), approved_manifest_hash: mh, manifest_hash: mh, approved_by: "uR", approved_at: "2026-10-19T08:00:00+00:00", package: null, package_hash: null },
      { id: "p3", variant_id: "v2", revision_id: "r3", document_hash: "e".repeat(64), status: "soumis", work_status: "en-revue", diffusion_status: "non-diffuse", approved_revision_id: null, package: null },
      // Remplacé : hors vigueur, la diffusion reste « remplace » ; le travail perd son approbation.
      { id: "p4", variant_id: "v1", revision_id: "r2", document_hash: "f".repeat(64), status: "diffuse", work_status: "approuve", diffusion_status: "remplace", approved_revision_id: "r2", approved_manifest_hash: mh, manifest_hash: mh, replaced_by_publication_id: "p1", replaced_at: "2026-10-19T09:00:00+00:00" },
      // Ligne antérieure à E.4 (dimensions déduites du statut combiné) : retirée avec approbation.
      { id: "p5", variant_id: "v1", revision_id: "r2", document_hash: "f".repeat(64), status: "retire", work_status: null, diffusion_status: null, approved_revision_id: "r2", approved_document_hash: "f".repeat(64), approved_by: "uR" },
      { id: "p6", variant_id: "v1", revision_id: "r2", document_hash: "f".repeat(64), status: "refuse", work_status: "refuse", diffusion_status: "non-diffuse", approved_revision_id: null },
    ];
    let n = 0;
    const out = distrustStudioPublications(pubs, tables.studio_variants, "uR", "2026-10-19T10:00:00.000Z", () => `ev${++n}`);
    const dims = out.publications.map((p) => [p["id"], p["work_status"], p["diffusion_status"], p["status"]]);
    expect(dims).toEqual([
      ["p1", "en-revue", "non-diffuse", "soumis"], ["p2", "en-revue", "non-diffuse", "soumis"], ["p3", "en-revue", "non-diffuse", "soumis"],
      ["p4", "en-revue", "remplace", "diffuse"], ["p5", "en-revue", "retire", "retire"], ["p6", "refuse", "non-diffuse", "refuse"],
    ]);
    expect(out.downgraded).toBe(4);
    expect(out.publications.every((p) => p["approved_revision_id"] === null && p["approved_document_hash"] === null && p["approved_manifest_hash"] === null && p["approved_by"] === null && p["approved_at"] === null)).toBe(true);
    // Contenu conservé et lisible : manifeste, paquet et empreintes inchangés ; remplacement conservé.
    expect(out.publications[0]!["package"]).toEqual(tables.studio_publications[0]!["package"]);
    expect(out.publications[0]!["package_hash"]).toBe(tables.studio_publications[0]!["package_hash"]);
    expect(out.publications[0]!["manifest_hash"]).toBe(mh);
    expect(out.publications[3]!["replaced_by_publication_id"]).toBe("p1");
    expect(out.events.map((e) => [e["publication_id"], e["action"], e["from_status"], e["to_status"], e["work_status"], e["diffusion_status"]])).toEqual([
      ["p1", "soumettre", "diffuse", "soumis", "en-revue", "non-diffuse"], ["p2", "soumettre", "approuve", "soumis", "en-revue", "non-diffuse"],
      ["p4", "soumettre", "diffuse", "diffuse", "en-revue", "remplace"], ["p5", "soumettre", "retire", "retire", "en-revue", "retire"],
    ]);
    expect(out.events[0]).toMatchObject({ id: "ev1", author_id: "uR", revision_id: "r2", head_revision_id: "r2", manifest_hash: mh, related_publication_id: null, comment: STUDIO_DOWNGRADE_COMMENT });
    expect(pubs[1]!["status"]).toBe("approuve");
  });

  it("E.4 : manifeste, approbation liée au manifeste et remplacement contrôlés ; dossier remplaçant inséré d'abord", () => {
    const f = fixture();
    const manifest = { schema: "studio-publication-manifest/1", sources: [{ role: "principale", variantId: "v1", revisionId: "r2", documentHash: studioArchiveDocumentHash(doc(1)) }], meta: {}, documents: [] };
    const mh = sha(canonicalJson(manifest));
    f.tables.studio_publications[0] = { ...f.tables.studio_publications[0]!, manifest, manifest_hash: mh, approved_manifest_hash: mh };
    f.tables.studio_publications.push({ ...f.tables.studio_publications[0]!, id: "p0", replaced_by_publication_id: "p1", package: null, package_hash: null });
    f.tables.studio_publication_events.push({ id: "pe2", publication_id: "p0", author_id: "uEditor", related_publication_id: "p1" });
    f.section["manifest"] = buildStudioManifest(f.tables, IDENT);
    expect(errorsOf(clone(f.section))).toEqual([]);
    expect(orderPublicationsForInsert(f.tables.studio_publications).map((p) => p["id"])).toEqual(["p1", "p0"]);

    const bad = fixture();
    bad.tables.studio_publications[0] = { ...bad.tables.studio_publications[0]!, manifest: { ...manifest, sources: [{ ...manifest.sources[0], documentHash: "0".repeat(64) }] }, manifest_hash: "1".repeat(64), approved_manifest_hash: "2".repeat(64), replaced_by_publication_id: "absent" };
    bad.tables.studio_publication_events.push({ id: "pe3", publication_id: "p1", author_id: "uEditor", related_publication_id: "absent" });
    bad.section["manifest"] = buildStudioManifest(bad.tables, IDENT);
    expect(errorsOf(clone(bad.section))).toEqual(expect.arrayContaining([
      "publication p1 : empreinte du manifeste différente", "publication p1 : approbation d'un autre manifeste", "publication p1 : dossier remplaçant absent", "évènement pe3 : dossier lié absent",
    ]));
    const src = fixture();
    const m2 = { ...manifest, sources: [{ ...manifest.sources[0], documentHash: "0".repeat(64) }] };
    src.tables.studio_publications[0] = { ...src.tables.studio_publications[0]!, manifest: m2, manifest_hash: sha(canonicalJson(m2)) };
    src.section["manifest"] = buildStudioManifest(src.tables, IDENT);
    expect(errorsOf(clone(src.section))).toContain("publication p1 : empreinte d'une source du manifeste différente");
  });

  it("E.1 : jeux d'exigences et contrôles archivés, contrôlés ; acceptation partenaire retirée si l'archive n'est pas vérifiée", () => {
    const f = fixture();
    const acceptee = { id: "x1", libelle: "Surface", metrique: { type: "total", grandeur: "surface" }, comparaison: "<=", valeur: 10, unite: "m2", source: "Partenaire", origine: { reference: "R-12", acceptation: { par: "uOwner", parEmail: "owner@example.test", le: "2026-10-19T08:00:00.000Z" } } };
    const simple = { id: "x2", libelle: "Objets", metrique: { type: "nombre" }, comparaison: ">=", valeur: 1, unite: "u", source: "Programme" };
    f.tables.studio_requirement_sets = [
      { id: "rs1", study_id: "s1", version: 1, requirements: [simple], motif: null, author_id: "uEditor", request_id: null, payload_hash: null },
      { id: "rs2", study_id: "s1", version: 2, requirements: [simple, acceptee], motif: "Acceptation", author_id: "uOwner", request_id: null, payload_hash: null },
    ];
    f.tables.studio_requirement_checks = [{ id: "rc1", study_id: "s1", variant_id: "v1", revision_id: "r2", set_version: 2, execution: "execute", conclusion: "satisfaite", result: {}, document_hash: studioArchiveDocumentHash(doc(1)), author_id: "uEditor" }];
    f.section["manifest"] = buildStudioManifest(f.tables, IDENT);
    expect(errorsOf(clone(f.section))).toEqual([]);
    expect(buildStudioManifest(f.tables, IDENT).tables.studio_requirement_sets.count).toBe(2);
    expect(remapStudioRows("studio_requirement_checks", f.tables.studio_requirement_checks, "pB", new Map([["uEditor", "uR"]]))[0]).toMatchObject({ author_id: "uR", document_hash: studioArchiveDocumentHash(doc(1)) });

    const bad = fixture();
    bad.tables.studio_requirement_sets = [{ id: "rs1", study_id: "autre", version: 1, requirements: {}, author_id: "uEditor" }];
    bad.tables.studio_requirement_checks = [{ id: "rc1", study_id: "s1", variant_id: "v1", revision_id: "r2", set_version: 9, document_hash: "0".repeat(64), author_id: "uEditor" }];
    bad.section["manifest"] = buildStudioManifest(bad.tables, IDENT);
    expect(errorsOf(clone(bad.section))).toEqual(expect.arrayContaining([
      "jeu d'exigences rs1 : étude absente", "jeu d'exigences rs1 : exigences illisibles", "contrôle rc1 : empreinte du document différente de la révision", "contrôle rc1 : version du jeu absente",
    ]));

    const { sets, cleared } = distrustRequirementSets(f.tables.studio_requirement_sets);
    expect(cleared).toBe(1);
    expect((sets[1]!["requirements"] as { origine?: Record<string, unknown> }[])[1]!.origine).toEqual({ reference: "R-12" });
    expect((sets[1]!["requirements"] as unknown[])[0]).toEqual(simple);
    expect(sets[0]).toEqual(f.tables.studio_requirement_sets[0]);
    expect((f.tables.studio_requirement_sets[1]!["requirements"] as { origine?: Record<string, unknown> }[])[1]!.origine!["acceptation"]).toBeDefined();
  });

  it("E.1 : comptes des champs JSON (acceptation partenaire) exportés avec leur adresse et réattribués à l'import vérifié", () => {
    const acc = (par: string, parEmail?: string) => ({ id: `x-${par}`, libelle: "Surface", metrique: { type: "total", grandeur: "surface" }, comparaison: "<=", valeur: 10, unite: "m2", source: "Partenaire", origine: { reference: "R-12", acceptation: { par, ...(parEmail ? { parEmail } : {}), le: "2026-10-19T08:00:00.000Z" } } });
    const simple = { id: "x2", libelle: "Objets", metrique: { type: "nombre" }, comparaison: ">=", valeur: 1, unite: "u", source: "Programme" };
    const t = emptyStudioTables();
    t.studio_requirement_sets = [{ id: "rs1", study_id: "s1", version: 1, requirements: [simple, acc("uPartner", "partner@example.test"), acc("uOwner", "owner@example.test"), acc("uGhost")], author_id: "uOwner" }];
    expect(studioJsonAccountIds(t)).toEqual(["uGhost", "uOwner", "uPartner"]);
    // Export : un acceptant cité seulement dans le JSON part avec son adresse ; le contrôle de relecture reste celui des colonnes.
    expect(studioExportAccountIds(t, "uOwner")).toEqual(["uGhost", "uOwner", "uPartner"]);
    expect(studioAccountIds(t, "uOwner")).toEqual(["uOwner"]);
    const before = JSON.stringify(t.studio_requirement_sets);
    // Seul le propriétaire est retrouvé dans la base cible ; le partenaire en est absent ; uGhost est cité sans adresse.
    const found = new Map([["uOwner", { id: "bOwner", email: "Owner@example.test" }]]);
    const r = remapStudioJsonAccounts(t.studio_requirement_sets, found);
    const list = r.sets[0]!["requirements"] as { origine?: { reference: string; acceptation?: Record<string, unknown> } }[];
    expect(list[0]).toEqual(simple);
    expect(list[2]!.origine!.acceptation).toEqual({ par: "bOwner", parEmail: "Owner@example.test", le: "2026-10-19T08:00:00.000Z" });
    // Acceptant non retrouvé (absent ou sans adresse) : acceptation retirée, jamais attribuée à quelqu'un qui n'a pas accepté.
    expect(list[1]!.origine).toEqual({ reference: "R-12" });
    expect(list[3]!.origine).toEqual({ reference: "R-12" });
    expect(r).toMatchObject({ remapped: 1, cleared: 2, clearedAccounts: ["uGhost", "uPartner"] });
    expect(JSON.stringify(t.studio_requirement_sets)).toBe(before);
  });

  it("inventaire : chaque colonne jsonb d'une table archivée est classée (comptes réattribués ou sans compte)", () => {
    const initSql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
    const found = new Set<string>();
    let current = "";
    for (const line of initSql.split("\n")) {
      const create = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(line);
      if (create) current = create[1]!;
      const alter = /ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+) jsonb/.exec(line);
      if (alter) { found.add(`${alter[1]}.${alter[2]}`); continue; }
      const column = /^\s+(\w+) jsonb\b/.exec(line);
      if (column && current) found.add(`${current}.${column[1]}`);
    }
    const archived = [...found].filter((c) => (STUDIO_ARCHIVE_TABLES as readonly string[]).includes(c.split(".")[0]!)).sort();
    const classified = [
      ...Object.entries(STUDIO_JSON_ACCOUNT_FIELDS).flatMap(([t, fields]) => fields!.map((f) => `${t}.${f.split(/[[.]/)[0]}`)),
      ...Object.entries(STUDIO_JSON_FIELDS_WITHOUT_ACCOUNTS).flatMap(([t, fields]) => fields!.map((f) => `${t}.${f}`)),
    ];
    expect(archived.length).toBeGreaterThan(5);
    expect(archived).toEqual([...new Set(classified)].sort());
  });

  it("volumes cités par les paquets", () => {
    expect(packageVolumeIds(fixture().tables.studio_publications)).toEqual([pdfId]);
    expect(packageVolumeIds([{ package: null }])).toEqual([]);
  });
});

describe("section Studio : versions et forme (revue #198)", () => {
  it("une autre version des tables est refusée, jamais devinée", () => {
    const { section } = fixture();
    const autre = clone(section) as unknown as { schemaVersion: { tables: string } };
    autre.schemaVersion.tables = "studio-v1/2099-01-01";
    expect(errorsOf(autre)).toContain("version des tables Studio non prise en charge");
    expect(errorsOf(section)).toEqual([]);
  });
  it("suivi E.2 : liens, tâches, journal des tâches et décisions archivés, leurs comptes réattribués, leurs références contrôlées", () => {
    const f = fixture();
    f.tables.studio_observation_links = [{ id: "l1", observation_id: "c1", variant_id: "v1", domaine: "objet", ref: "l0", revision_id: "r2", controle_id: null, created_by: "uEditor" }];
    f.tables.studio_observation_tasks = [{ id: "t1", observation_id: "c1", libelle: "Reprendre l'about", assignee_id: "uEditor", statut: "a-faire", created_by: "uOwner" }];
    f.tables.studio_observation_task_events = [{ id: "te1", task_id: "t1", seq: 1, action: "creer", actor_id: "uOwner", assignee_id: "uEditor" }];
    f.tables.studio_observation_decisions = [{ id: "d1", observation_id: "c1", seq: 1, nature: "proposition", portee: "cloture", texte: "Clore", actor_id: "uEditor", actor_role: "editeur", revision_id: "r2" }];
    f.section["manifest"] = buildStudioManifest(f.tables, IDENT);
    expect(errorsOf(clone(f.section))).toEqual([]);
    const map = new Map([["uOwner", "uB1"], ["uEditor", "uB2"]]);
    expect(remapStudioRows("studio_observation_tasks", f.tables.studio_observation_tasks, "pB", map)[0]).toMatchObject({ assignee_id: "uB2", created_by: "uB1" });
    expect(remapStudioRows("studio_observation_task_events", f.tables.studio_observation_task_events, "pB", map)[0]).toMatchObject({ actor_id: "uB1", assignee_id: "uB2" });
    expect(remapStudioRows("studio_observation_decisions", f.tables.studio_observation_decisions, "pB", map)[0]).toMatchObject({ actor_id: "uB2", texte: "Clore" });
    expect(remapStudioRows("studio_observation_links", f.tables.studio_observation_links, "pB", map)[0]).toMatchObject({ created_by: "uB2", ref: "l0" });
    // Références hors section : lien d'une autre variante, tâche sans observation, passage sans tâche, décision sur une révision étrangère.
    const g = fixture();
    g.tables.studio_observation_links = [{ id: "l2", observation_id: "c1", variant_id: "v2", domaine: "objet", ref: "x", revision_id: "r3", created_by: "uOwner" }];
    g.tables.studio_observation_tasks = [{ id: "t2", observation_id: "inconnue", libelle: "x", assignee_id: "uOwner", statut: "a-faire", created_by: "uOwner" }];
    g.tables.studio_observation_task_events = [{ id: "te2", task_id: "absente", seq: 1, action: "creer", actor_id: "uOwner" }];
    g.tables.studio_observation_decisions = [{ id: "d2", observation_id: "c1", seq: 1, nature: "decision", portee: "autre", texte: "x", actor_id: "uOwner", actor_role: "proprietaire", revision_id: "r3" }];
    g.section["manifest"] = buildStudioManifest(g.tables, IDENT);
    expect(errorsOf(clone(g.section))).toEqual(expect.arrayContaining([
      "lien l2 : observation absente", "tâche t2 : observation absente", "passage de tâche te2 : tâche absente", "décision d2 : révision absente",
    ]));
  });
  it("version antérieure au suivi E.2 relue telle quelle (tables absentes = aucune ligne) ; une table E.2 y est inattendue", () => {
    const { tables } = fixture();
    const couvertes = STUDIO_ARCHIVE_TABLES_BY_VERSION[STUDIO_ARCHIVE_LEGACY_TABLES_VERSION]!;
    expect(couvertes.some((t) => STUDIO_ARCHIVE_TABLES_E2.includes(t))).toBe(false);
    const legacyTables = Object.fromEntries(Object.entries(clone(tables)).filter(([t]) => couvertes.includes(t as never)));
    const manifest = buildStudioManifest(tables, IDENT, STUDIO_ARCHIVE_LEGACY_TABLES_VERSION);
    expect(Object.keys(manifest.tables)).not.toContain("studio_observation_links");
    const legacy = { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: { document: "studio-document/1", tables: STUDIO_ARCHIVE_LEGACY_TABLES_VERSION }, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables: legacyTables, manifest };
    const r = checkStudioArchive(clone(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.section.tables.studio_observation_tasks).toEqual([]);
    const extra = clone(legacy) as unknown as { tables: Record<string, unknown> };
    extra.tables["studio_observation_tasks"] = [];
    expect(errorsOf(extra)).toContain("table studio_observation_tasks inattendue dans cette version");
    // Section courante : le manifeste couvre toutes les tables, la version antérieure ne remplace pas la courante.
    expect(STUDIO_ARCHIVE_SCHEMA_VERSION.tables).not.toBe(STUDIO_ARCHIVE_LEGACY_TABLES_VERSION);
    expect(Object.keys(buildStudioManifest(tables, IDENT).tables)).toEqual([...STUDIO_ARCHIVE_TABLES]);
  });
  it("une section présente mais mal formée (null, tableau, texte) est refusée", () => {
    for (const v of [null, [], "tronqué"]) expect(errorsOf(v).length).toBeGreaterThan(0);
  });
});

describe("section Studio : ajustements du métré (E.3-05)", () => {
  const avecAjustements = () => {
    const { tables } = fixture();
    tables.studio_quantity_adjustments = [
      { id: "qa1", study_id: "s1", variant_id: "v1", revision_id: "r2", seq: 1, target_kind: "objet", target_id: "l0", quantity: "longueur", value: 1.5, unit: "m", derived_value: 1.4142, target_state: { cible: "objet" }, motif: "Relevé", author_id: "uEditor", request_id: null, payload_hash: "d".repeat(64), created_at: "2026-10-19T09:00:00.000001+00:00" },
      { id: "qa2", study_id: "s1", variant_id: "v1", revision_id: "r2", seq: 2, target_kind: "calque", target_id: "default", quantity: "longueur", value: null, unit: "m", derived_value: 1.4142, target_state: { cible: "calque" }, motif: "Retour", author_id: "uOwner", request_id: null, payload_hash: "e".repeat(64), created_at: "2026-10-19T09:01:00.000001+00:00" },
    ];
    const section = { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables, manifest: buildStudioManifest(tables, IDENT) };
    return { tables, section };
  };

  it("table couverte par le manifeste (effectif, empreinte) et par l'empreinte globale signée", () => {
    const { tables, section } = avecAjustements();
    expect(section.manifest.tables.studio_quantity_adjustments.count).toBe(2);
    expect(section.manifest.hash).not.toBe(buildStudioManifest(fixture().tables, IDENT).hash);
    expect(errorsOf(clone(section))).toEqual([]);
    expect(studioAccountIds(tables, "uOwner")).toEqual(["uEditor", "uOwner"]);
    const altere = clone(section) as { tables: StudioArchiveTables };
    altere.tables.studio_quantity_adjustments[0]!["value"] = 2;
    expect(errorsOf(altere)).toContain("studio_quantity_adjustments : empreinte différente du manifeste");
  });

  it("intégrité : variante de l'étude, révision de la variante, séquence unique, état de la cible et motif", () => {
    const { tables } = avecAjustements();
    tables.studio_quantity_adjustments[0]!["revision_id"] = "r3";
    tables.studio_quantity_adjustments[1]!["seq"] = 1;
    tables.studio_quantity_adjustments[1]!["target_state"] = "x";
    tables.studio_quantity_adjustments[1]!["motif"] = " ";
    const section = { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables, manifest: buildStudioManifest(tables, IDENT) };
    expect(errorsOf(section)).toEqual(expect.arrayContaining([
      "ajustement qa1 : révision absente", "ajustement qa2 : séquence en double", "ajustement qa2 : état de la cible illisible", "ajustement qa2 : motif absent",
    ]));
  });

  it("archive non vérifiée : tout auteur devient le compte qui restaure, contenu inchangé", () => {
    const { tables } = avecAjustements();
    const map = new Map(ACCOUNTS.map((a) => [a.id, "uImporter"]));
    const out = remapStudioRows("studio_quantity_adjustments", tables.studio_quantity_adjustments, "pB", map);
    expect(out.map((r) => r["author_id"])).toEqual(["uImporter", "uImporter"]);
    expect(out.map((r) => ({ ...r, author_id: undefined }))).toEqual(tables.studio_quantity_adjustments.map((r) => ({ ...r, author_id: undefined })));
  });

  it("archive de la version antérieure des tables (sans ajustements) : relue telle quelle, sans la table", () => {
    const { tables } = fixture();
    const anterieures = STUDIO_ARCHIVE_TABLES_BY_VERSION[STUDIO_ARCHIVE_PRE_QUANTITES_TABLES_VERSION]!;
    expect(anterieures).not.toContain("studio_observation_links");
    const rawTables = Object.fromEntries(anterieures.map((t) => [t, tables[t]]));
    const ancienne = {
      schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: { document: "studio-document/1", tables: STUDIO_ARCHIVE_PRE_QUANTITES_TABLES_VERSION }, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS,
      tables: rawTables, manifest: buildStudioManifest(tables, IDENT, STUDIO_ARCHIVE_PRE_QUANTITES_TABLES_VERSION),
    };
    expect(Object.keys(ancienne.manifest.tables)).not.toContain("studio_quantity_adjustments");
    const r = checkStudioArchive(clone(ancienne));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.section.tables.studio_quantity_adjustments).toEqual([]);
    // Une archive de l'ancienne version qui porterait la table nouvelle est refusée (jamais devinée).
    expect(errorsOf({ ...clone(ancienne), tables: { ...rawTables, studio_quantity_adjustments: [] } })).toContain("table studio_quantity_adjustments inattendue dans cette version");
  });
});

describe("section Studio : feuilles composées et dossiers de conception (E.3-02 / E.3-03)", () => {
  const avecDossier = () => {
    const { tables } = fixture();
    const definition = { numero: "A-101", titre: "Plan", format: "A3", orientation: "paysage", echelle: "ajuster", vueSource: { type: "planche-2d" } };
    tables.studio_sheets = [
      { id: "sh1", study_id: "s1", variant_id: "v1", revision_id: "r2", number: "A-101", definition, request_id: null, payload_hash: "f".repeat(64), created_by: "uEditor", created_at: "2026-10-19T10:00:00.000001+00:00", updated_at: "2026-10-19T10:00:00.000001+00:00" },
      { id: "sh2", study_id: "s1", variant_id: "v2", revision_id: "r3", number: "A-102", definition: { ...definition, numero: "A-102" }, request_id: null, payload_hash: null, created_by: "uOwner", created_at: "2026-10-19T10:01:00.000001+00:00", updated_at: "2026-10-19T10:01:00.000001+00:00" },
    ];
    tables.studio_dossiers = [
      { id: "d1", study_id: "s1", title: "Dossier", sheet_ids: ["sh2", "sh1"], quantities_variant_id: "v1", quantities_revision_id: "r2", include_fidelity: true, request_id: null, payload_hash: null, created_by: "uEditor", created_at: "2026-10-19T10:02:00.000001+00:00", updated_at: "2026-10-19T10:02:00.000001+00:00" },
    ];
    return { tables, section: { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables, manifest: buildStudioManifest(tables, IDENT) } };
  };

  it("tables couvertes par le manifeste ; auteurs réattribuables ; contenu inchangé au remappage", () => {
    const { tables, section } = avecDossier();
    expect(errorsOf(clone(section))).toEqual([]);
    expect(section.manifest.tables.studio_sheets.count).toBe(2);
    expect(section.manifest.tables.studio_dossiers.count).toBe(1);
    const map = new Map(ACCOUNTS.map((a) => [a.id, "uImporter"]));
    const out = remapStudioRows("studio_dossiers", tables.studio_dossiers, "pB", map);
    expect(out[0]).toEqual({ ...tables.studio_dossiers[0], created_by: "uImporter" });
    const altere = clone(section) as { tables: StudioArchiveTables };
    altere.tables.studio_dossiers[0]!["sheet_ids"] = ["sh1", "sh2"];
    expect(errorsOf(altere)).toContain("studio_dossiers : empreinte différente du manifeste");
  });

  it("intégrité : révision de la variante, numéro unique, feuilles de l'étude, métré complet", () => {
    const { tables } = avecDossier();
    tables.studio_sheets[1]!["revision_id"] = "r2";
    tables.studio_sheets[1]!["number"] = "A-101";
    tables.studio_dossiers[0]!["sheet_ids"] = ["sh1", "sh9"];
    tables.studio_dossiers[0]!["quantities_revision_id"] = null;
    const section = { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables, manifest: buildStudioManifest(tables, IDENT) };
    expect(errorsOf(section)).toEqual(expect.arrayContaining([
      "feuille sh2 : révision absente", "feuille sh2 : numéro en double", "dossier d1 : feuille sh9 absente", "dossier d1 : métré incomplet",
    ]));
  });

  it("définition de chaque feuille contrôlée par le modèle : refus clair, jamais un échec plus tard (M-5)", () => {
    const { tables } = avecDossier();
    tables.studio_sheets[0]!["definition"] = { ...(tables.studio_sheets[0]!["definition"] as object), format: "A9" };
    tables.studio_sheets[1]!["definition"] = { ...(tables.studio_sheets[1]!["definition"] as object), numero: "B-200" };
    const section = { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables, manifest: buildStudioManifest(tables, IDENT) };
    const errors = errorsOf(section);
    expect(errors.some((e) => e.startsWith("feuille sh1 : définition invalide (feuille.format"))).toBe(true);
    expect(errors).toContain("feuille sh2 : numéro différent de sa définition");
  });

  it("borne des ajustements du métré (I-2) : colonne absente ou nulle acceptée (lignes antérieures) ; entier ≥ 1 avec métré seulement", () => {
    const ok = avecDossier();
    ok.tables.studio_dossiers[0]!["quantities_adjustment_seq"] = 3;
    expect(errorsOf({ ...ok.section, manifest: buildStudioManifest(ok.tables, IDENT) })).toEqual([]);
    ok.tables.studio_dossiers[0]!["quantities_adjustment_seq"] = null;
    expect(errorsOf({ ...ok.section, manifest: buildStudioManifest(ok.tables, IDENT) })).toEqual([]);
    for (const [seq, metre] of [[0, true], [1.5, true], [2, false]] as const) {
      const { tables } = avecDossier();
      tables.studio_dossiers[0]!["quantities_adjustment_seq"] = seq;
      if (!metre) Object.assign(tables.studio_dossiers[0]!, { quantities_variant_id: null, quantities_revision_id: null });
      const section = { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS, tables, manifest: buildStudioManifest(tables, IDENT) };
      expect(errorsOf(section), String(seq)).toContain("dossier d1 : borne des ajustements du métré invalide");
    }
  });

  it("archive de la version précédente (avec ajustements, sans feuilles ni dossiers) : relue sans ces tables", () => {
    const { tables } = fixture();
    const anterieures = STUDIO_ARCHIVE_TABLES_BY_VERSION[STUDIO_ARCHIVE_LEGACY_TABLES_VERSION]!;
    expect(anterieures).toContain("studio_quantity_adjustments");
    expect(anterieures).not.toContain("studio_sheets");
    const rawTables = Object.fromEntries(anterieures.map((t) => [t, tables[t]]));
    const ancienne = {
      schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: { document: "studio-document/1", tables: STUDIO_ARCHIVE_LEGACY_TABLES_VERSION }, sourceProjectId: "pA", ownerId: "uOwner", accounts: ACCOUNTS,
      tables: rawTables, manifest: buildStudioManifest(tables, IDENT, STUDIO_ARCHIVE_LEGACY_TABLES_VERSION),
    };
    const r = checkStudioArchive(clone(ancienne));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.section.tables.studio_sheets).toEqual([]);
    expect(errorsOf({ ...clone(ancienne), tables: { ...rawTables, studio_dossiers: [] } })).toContain("table studio_dossiers inattendue dans cette version");
  });
});
