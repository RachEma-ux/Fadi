import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TABLES, canonicalJson, compareTables, integrityAnomalies, normalizeTables, renderReport, revisionDocumentHashes } from './studio-compare-lib.mjs';

const sha = (x) => createHash('sha256').update(x).digest('hex');
const doc = { schemaVersion: 'studio-document/1', units: 'm', frame: 'local-2d', objects: [{ id: 'l1', type: 'line' }] };
const pdf = Buffer.from('%PDF-1.4');
const pkg = { schema: 'studio-publication-package/1', revisionId: 'r1', files: [{ format: 'pdf', sha256: sha(pdf) }] };

function side(projectId, owner, editor) {
  const t = Object.fromEntries(TABLES.map((x) => [x, []]));
  t.studio_studies = [{ id: 's1', project_id: projectId, name: 'Étude', initial_variant_id: 'v1' }];
  t.studio_variants = [{ id: 'v1', study_id: 's1', head_revision_id: 'r1' }];
  t.studio_revisions = [{ id: 'r1', variant_id: 'v1', parent_revision_id: null, document: doc, payload_hash: 'a'.repeat(64), author_id: editor, created_at: '2026-10-19T08:00:00.123456+00:00' }];
  t.studio_comments = [{ id: 'c1', variant_id: 'v1', author_id: owner, body: 'Vu' }];
  t.volumes = [{ id: sha(pdf), content: `\\x${pdf.toString('hex')}` }];
  t.studio_publications = [{ id: 'p1', project_id: projectId, revision_id: 'r1', document_hash: sha(canonicalJson(doc)), package: pkg, package_hash: sha(canonicalJson(pkg)), created_by: editor }];
  t.project_members = [{ project_id: projectId, user_id: editor, role: 'editeur', invited_by: 'owner@x.test' }];
  return t;
}
const emailsA = new Map([['uA1', 'owner@x.test'], ['uA2', 'editor@x.test']]);
const emailsB = new Map([['uB1', 'OWNER@x.test'], ['uB2', 'editor@x.test']]);

test('restauration fidèle par archive : identifiants de projet et de compte différents, 0 anomalie', () => {
  const a = normalizeTables(side('pA', 'uA1', 'uA2'), { projectId: 'pA', emails: emailsA });
  const b = normalizeTables(side('pB', 'uB1', 'uB2'), { projectId: 'pB', emails: emailsB });
  const { anomalies, summary } = compareTables(a, b);
  assert.deepEqual(anomalies, []);
  assert.ok(summary.every((s) => s.identical));
  assert.equal(summary.find((s) => s.table === 'studio_revisions').countB, 1);
});

test('ligne manquante, en trop, colonne différente et effectif signalés', () => {
  const a = normalizeTables(side('pA', 'uA1', 'uA2'), { projectId: 'pA', emails: emailsA });
  const tb = side('pB', 'uB1', 'uB2');
  tb.studio_comments = [{ id: 'c2', variant_id: 'v1', author_id: 'uB1', body: 'Autre' }];
  tb.studio_revisions[0] = { ...tb.studio_revisions[0], created_at: '2026-10-19T08:00:00.123+00:00' };
  tb.studio_publications.push({ id: 'p2' });
  const { anomalies } = compareTables(a, normalizeTables(tb, { projectId: 'pB', emails: emailsB }));
  const kinds = anomalies.map((x) => `${x.kind}:${x.table}:${x.key}`);
  assert.ok(kinds.includes('manquante:studio_comments:c1'));
  assert.ok(kinds.includes('en-trop:studio_comments:c2'));
  assert.ok(kinds.includes('en-trop:studio_publications:p2'));
  assert.ok(kinds.includes('effectif:studio_publications:*'));
  assert.ok(anomalies.some((x) => x.kind === 'differente' && x.table === 'studio_revisions' && x.detail === 'colonnes : created_at'));
});

test('auteur réattribué à un autre compte : différence signalée', () => {
  const a = normalizeTables(side('pA', 'uA1', 'uA2'), { projectId: 'pA', emails: emailsA });
  const b = normalizeTables(side('pB', 'uB1', 'uB1'), { projectId: 'pB', emails: emailsB });
  assert.ok(compareTables(a, b).anomalies.some((x) => x.table === 'studio_revisions' && /author_id/.test(x.detail)));
});

test('intégrité : document, paquet, volume et chaîne des révisions', () => {
  assert.deepEqual(integrityAnomalies(side('pA', 'u1', 'u2'), 'A'), []);
  const t = side('pA', 'u1', 'u2');
  t.studio_revisions[0].document = { ...doc, objects: [] };
  t.studio_revisions.push({ id: 'r2', variant_id: 'v1', parent_revision_id: 'absente', payload_hash: 'b'.repeat(64), document: doc });
  t.volumes[0].content = '\\x00';
  t.studio_variants[0].head_revision_id = 'inconnue';
  const details = integrityAnomalies(t, 'B').map((x) => x.detail);
  assert.ok(details.includes('B : empreinte du document différente de la révision'));
  assert.ok(details.includes('B : révision parente absente de la variante'));
  assert.ok(details.includes('B : contenu différent de son empreinte'));
  assert.ok(details.includes('B : tête absente'));
});

test('empreintes des documents de révision et rapport', () => {
  assert.deepEqual(revisionDocumentHashes(side('pA', 'u1', 'u2')), { r1: sha(canonicalJson(doc)) });
  const md = renderReport({ date: '2026-10-19', commit: 'abc', a: { label: 'A', projectId: 'pA' }, b: { label: 'B', projectId: 'pB' }, summary: [], anomalies: [], triggers: [{ table: 'studio_revisions', trigger: 'studio_revisions_no_update', present: true }], probe: { refused: true, message: 'studio_revision_immutable' } });
  assert.match(md, /Anomalies : \*\*0\*\*/);
  assert.match(md, /refusée \(studio_revision_immutable\)/);
});

test('lot E.4 : colonnes nouvelles comparées, remplaçant compté comme compte, manifeste contrôlé', () => {
  const withE4 = (projectId, owner, editor, work = 'approuve') => {
    const t = side(projectId, owner, editor);
    const manifest = { schema: 'studio-publication-manifest/1', sources: [{ role: 'principale', variantId: 'v1', revisionId: 'r1', documentHash: sha(canonicalJson(doc)) }] };
    t.studio_publications[0] = { ...t.studio_publications[0], work_status: work, diffusion_status: 'diffuse', manifest, manifest_hash: sha(canonicalJson(manifest)), approved_manifest_hash: sha(canonicalJson(manifest)), replaced_by: owner };
    t.studio_publication_events = [{ id: 'e1', publication_id: 'p1', action: 'actualiser', work_status: 'brouillon', manifest_hash: sha(canonicalJson(manifest)), related_publication_id: null, author_id: owner }];
    return t;
  };
  assert.deepEqual(integrityAnomalies(withE4('pA', 'uA1', 'uA2'), 'A'), []);
  const a = normalizeTables(withE4('pA', 'uA1', 'uA2'), { projectId: 'pA', emails: emailsA });
  assert.deepEqual(compareTables(a, normalizeTables(withE4('pB', 'uB1', 'uB2'), { projectId: 'pB', emails: emailsB })).anomalies, []);
  const diff = compareTables(a, normalizeTables(withE4('pB', 'uB1', 'uB2', 'en-revue'), { projectId: 'pB', emails: emailsB })).anomalies;
  assert.ok(diff.some((x) => x.table === 'studio_publications' && /work_status/.test(x.detail)));
  const bad = withE4('pA', 'uA1', 'uA2');
  bad.studio_publications[0].manifest_hash = '0'.repeat(64);
  bad.studio_publications[0].replaced_by_publication_id = 'absent';
  const details = integrityAnomalies(bad, 'B').map((x) => x.detail);
  assert.ok(details.includes('B : empreinte du manifeste différente'));
  assert.ok(details.includes('B : approbation d\'un autre manifeste'));
  assert.ok(details.includes('B : dossier remplaçant absent'));
});

test('lot E.1 : jeux d\'exigences et contrôles comparés et contrôlés', () => {
  const withE1 = (projectId, owner, editor, valeur = 10) => {
    const t = side(projectId, owner, editor);
    t.studio_requirement_sets = [{ id: 'rs1', study_id: 's1', version: 1, requirements: [{ id: 'x1', valeur }], author_id: editor }];
    t.studio_requirement_checks = [{ id: 'rc1', study_id: 's1', variant_id: 'v1', revision_id: 'r1', set_version: 1, document_hash: sha(canonicalJson(doc)), author_id: owner }];
    return t;
  };
  assert.deepEqual(integrityAnomalies(withE1('pA', 'uA1', 'uA2'), 'A'), []);
  const a = normalizeTables(withE1('pA', 'uA1', 'uA2'), { projectId: 'pA', emails: emailsA });
  assert.deepEqual(compareTables(a, normalizeTables(withE1('pB', 'uB1', 'uB2'), { projectId: 'pB', emails: emailsB })).anomalies, []);
  assert.ok(compareTables(a, normalizeTables(withE1('pB', 'uB1', 'uB2', 11), { projectId: 'pB', emails: emailsB })).anomalies.some((x) => x.table === 'studio_requirement_sets' && /requirements/.test(x.detail)));
  const bad = withE1('pA', 'uA1', 'uA2');
  bad.studio_requirement_checks[0].set_version = 7;
  bad.studio_requirement_checks[0].document_hash = '0'.repeat(64);
  const details = integrityAnomalies(bad, 'B').map((x) => x.detail);
  assert.ok(details.includes('B : version du jeu absente'));
  assert.ok(details.includes('B : empreinte du document différente de la révision'));
});
