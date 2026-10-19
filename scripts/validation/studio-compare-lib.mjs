/**
 * Comparaison avant / après restauration des données Studio d'un projet (R.1-03) — logique PURE : normalisation des
 * lignes (projet et comptes rendus comparables d'une base à l'autre), comparaison ligne à ligne par clé, contrôles
 * d'intégrité (empreintes de documents, de paquets et de volumes, chaîne des révisions), rapport. Aucune base ici :
 * la lecture est dans `studio-compare-restore.mjs`. Les tables, clés et colonnes de compte sont celles de la section
 * Studio de l'archive (`apps/api/src/lib/studio-archive-manifest.ts`).
 */
import { createHash } from 'node:crypto';

export const TABLES = Object.freeze([
  'studio_studies', 'studio_variants', 'studio_revisions', 'studio_comments', 'studio_observations',
  'studio_observation_events', 'studio_study_steps', 'volumes', 'studio_publications', 'studio_publication_events',
  'project_members', 'studio_tool_preferences',
]);
export const KEYS = Object.freeze({
  studio_studies: ['id'], studio_variants: ['id'], studio_revisions: ['id'], studio_comments: ['id'],
  studio_observations: ['comment_id'], studio_observation_events: ['id'], studio_study_steps: ['study_id', 'step_number'],
  volumes: ['id'], studio_publications: ['id'], studio_publication_events: ['id'], project_members: ['project_id', 'user_id'],
  studio_tool_preferences: ['user_id'],
});
export const USER_COLUMNS = Object.freeze({
  studio_studies: [], studio_variants: [], studio_revisions: ['author_id'], studio_comments: ['author_id'],
  studio_observations: ['responsable_id', 'created_by'], studio_observation_events: ['actor_id', 'responsable_id'],
  studio_study_steps: ['created_by'], volumes: [], studio_publications: ['approved_by', 'diffused_by', 'created_by', 'replaced_by'],
  // `invited_by` est l'adresse de l'invitant (texte), comparée telle quelle.
  studio_publication_events: ['author_id'], project_members: ['user_id'], studio_tool_preferences: ['user_id'],
});
export const PROJECT_COLUMNS = Object.freeze({ studio_studies: ['project_id'], studio_publications: ['project_id'], project_members: ['project_id'] });
/** Déclencheurs d'immuabilité qui doivent exister (et être actifs) après restauration. */
export const IMMUTABILITY_TRIGGERS = Object.freeze([
  { table: 'studio_revisions', trigger: 'studio_revisions_no_update' },
  { table: 'studio_observation_events', trigger: 'studio_observation_events_no_update' },
  { table: 'studio_publication_events', trigger: 'studio_publication_events_no_update' },
  { table: 'studio_publication_events', trigger: 'studio_publication_events_no_delete' },
  { table: 'studio_publications', trigger: 'studio_publications_no_delete' },
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export const keyOf = (table, row) => KEYS[table].map((k) => String(row[k] ?? '')).join('|');

/**
 * Lignes comparables : identifiant du projet remplacé par `<projet>`, comptes par `<compte:adresse>` (l'identifiant
 * d'un compte diffère d'une base à l'autre quand la restauration passe par l'archive). Le reste est inchangé.
 */
export function normalizeTables(tables, { projectId, emails }) {
  const out = {};
  const account = (id) => (typeof id === 'string' && id ? `<compte:${(emails.get(id) ?? `?${id}`).toLowerCase()}>` : id);
  for (const t of TABLES) {
    out[t] = (tables[t] ?? []).map((row) => {
      const r = { ...row };
      for (const c of PROJECT_COLUMNS[t] ?? []) if (r[c] === projectId) r[c] = '<projet>';
      for (const c of USER_COLUMNS[t]) r[c] = account(r[c]);
      return r;
    }).sort((a, b) => (keyOf(t, a) < keyOf(t, b) ? -1 : keyOf(t, a) > keyOf(t, b) ? 1 : 0));
  }
  return out;
}

/** Comparaison ligne à ligne : lignes manquantes, en trop, colonnes différentes ; effectifs et empreintes par table. */
export function compareTables(a, b, { ignoreColumns = {} } = {}) {
  const anomalies = [];
  const summary = [];
  for (const t of TABLES) {
    const ignored = new Set(ignoreColumns[t] ?? []);
    const strip = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !ignored.has(k)));
    const ra = (a[t] ?? []).map(strip), rb = (b[t] ?? []).map(strip);
    const ma = new Map(ra.map((r) => [keyOf(t, r), r])), mb = new Map(rb.map((r) => [keyOf(t, r), r]));
    for (const [k, row] of ma) {
      const other = mb.get(k);
      if (!other) { anomalies.push({ table: t, key: k, kind: 'manquante', detail: 'ligne absente après restauration' }); continue; }
      const cols = [...new Set([...Object.keys(row), ...Object.keys(other)])].sort().filter((c) => canonicalJson(row[c] ?? null) !== canonicalJson(other[c] ?? null));
      if (cols.length) anomalies.push({ table: t, key: k, kind: 'differente', detail: `colonnes : ${cols.join(', ')}` });
    }
    for (const k of mb.keys()) if (!ma.has(k)) anomalies.push({ table: t, key: k, kind: 'en-trop', detail: 'ligne absente avant restauration' });
    const ha = sha256(canonicalJson(ra)), hb = sha256(canonicalJson(rb));
    summary.push({ table: t, countA: ra.length, countB: rb.length, hashA: ha, hashB: hb, identical: ha === hb });
    if (ra.length !== rb.length) anomalies.push({ table: t, key: '*', kind: 'effectif', detail: `${ra.length} avant, ${rb.length} après` });
  }
  return { anomalies, summary };
}

/** Contrôles d'intégrité d'un jeu de lignes Studio (lu dans une base) : empreintes et chaîne des révisions. */
export function integrityAnomalies(tables, side) {
  const anomalies = [];
  const push = (table, key, detail) => anomalies.push({ table, key, kind: 'integrite', detail: `${side} : ${detail}` });
  const revisions = new Map((tables.studio_revisions ?? []).map((r) => [r.id, r]));
  for (const r of revisions.values()) {
    if (r.parent_revision_id && revisions.get(r.parent_revision_id)?.variant_id !== r.variant_id) push('studio_revisions', r.id, 'révision parente absente de la variante');
    if (!/^[0-9a-f]{64}$/.test(String(r.payload_hash))) push('studio_revisions', r.id, 'empreinte de requête invalide');
  }
  for (const v of tables.studio_variants ?? []) if (revisions.get(v.head_revision_id)?.variant_id !== v.id) push('studio_variants', v.id, 'tête absente');
  const vols = new Map((tables.volumes ?? []).map((v) => [v.id, v]));
  for (const v of vols.values()) {
    const hex = typeof v.content === 'string' && v.content.startsWith('\\x') ? v.content.slice(2) : null;
    if (hex === null || sha256(Buffer.from(hex, 'hex')) !== v.id) push('volumes', v.id, 'contenu différent de son empreinte');
  }
  for (const p of tables.studio_publications ?? []) {
    const rev = revisions.get(p.revision_id);
    if (!rev) push('studio_publications', p.id, 'révision publiée absente');
    else if (sha256(canonicalJson(rev.document)) !== p.document_hash) push('studio_publications', p.id, 'empreinte du document différente de la révision');
    if (p.package) {
      if (sha256(canonicalJson(p.package)) !== p.package_hash) push('studio_publications', p.id, 'empreinte du paquet différente');
      for (const f of p.package.files ?? []) if (!vols.has(f.sha256)) push('studio_publications', p.id, `fichier ${f.format} absent (${f.sha256})`);
    }
    // Lot E.4 : manifeste figé (empreinte, sources), approbation liée au manifeste, dossier remplaçant présent.
    if (p.manifest) {
      if (sha256(canonicalJson(p.manifest)) !== p.manifest_hash) push('studio_publications', p.id, 'empreinte du manifeste différente');
      for (const s of p.manifest.sources ?? []) {
        const src = revisions.get(s.revisionId);
        if (!src || src.variant_id !== s.variantId) push('studio_publications', p.id, `source ${s.variantId} absente`);
        else if (sha256(canonicalJson(src.document)) !== s.documentHash) push('studio_publications', p.id, `empreinte de la source ${s.variantId} différente`);
      }
    }
    if (p.approved_manifest_hash && p.approved_manifest_hash !== p.manifest_hash) push('studio_publications', p.id, 'approbation d\'un autre manifeste');
    if (p.replaced_by_publication_id && !(tables.studio_publications ?? []).some((x) => x.id === p.replaced_by_publication_id)) push('studio_publications', p.id, 'dossier remplaçant absent');
  }
  return anomalies;
}

/** Empreintes de contenu de chaque révision (document) : la preuve « octet pour octet » du JSON canonique. */
export function revisionDocumentHashes(tables) {
  return Object.fromEntries((tables.studio_revisions ?? []).map((r) => [r.id, sha256(canonicalJson(r.document))]).sort());
}

export function renderReport({ date, commit, a, b, summary, anomalies, triggers, probe }) {
  const lines = [
    '# Comparaison Studio avant / après restauration (R.1-03)', '',
    `- Date : ${date}`, `- Commit : ${commit}`,
    `- Base A : ${a.label} — projet \`${a.projectId}\``, `- Base B : ${b.label} — projet \`${b.projectId}\``,
    `- Anomalies : **${anomalies.length}**`, '',
    '| Table | Lignes A | Lignes B | Empreinte A | Empreinte B | Identiques |', '|---|---:|---:|---|---|---|',
    ...summary.map((s) => `| ${s.table} | ${s.countA} | ${s.countB} | \`${s.hashA.slice(0, 16)}\` | \`${s.hashB.slice(0, 16)}\` | ${s.identical ? 'oui' : 'NON'} |`),
    '',
  ];
  if (triggers) lines.push('## Déclencheurs d\'immuabilité (base B)', '', ...triggers.map((t) => `- ${t.table}.${t.trigger} : ${t.present ? 'présent' : 'ABSENT'}`), '');
  if (probe) lines.push('## Sonde d\'immuabilité (base B, transaction annulée)', '', `- UPDATE d'une révision : ${probe.refused ? `refusée (${probe.message})` : `ACCEPTÉE — ${probe.message}`}`, '');
  lines.push('## Anomalies', '', ...(anomalies.length ? anomalies.map((x) => `- [${x.kind}] ${x.table} \`${x.key}\` : ${x.detail}`) : ['Aucune.']), '');
  return lines.join('\n');
}
