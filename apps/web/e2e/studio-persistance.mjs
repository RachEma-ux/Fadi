/**
 * Recette Studio par l'API réelle sur la base migrée par `npm run db:migrate` (schéma Studio dans init.sql, D-A, #166).
 * Aucun pilote de base, aucune troncature : comptes et projet synthétiques créés par les vraies routes.
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/studio-persistance.mjs              (PHASE=initial par défaut)
 *   PHASE=reopen STUDIO_STATE=… node apps/web/e2e/studio-persistance.mjs                (après redémarrage API/base)
 * PHASE=initial écrit l'état de réouverture dans STUDIO_STATE s'il est fourni.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const PHASE = process.env.PHASE ?? 'initial';
const STATE = process.env.STUDIO_STATE;
let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ ${label}`);
  else { failures += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
}
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const credentials = () => ({ email: `studio-${randomUUID().replaceAll('-', '')}@example.test`, password: randomBytes(24).toString('hex') });
const variantPath = (s) => `/projects/${s.projectId}/studio/studies/${s.studyId}/variants/${s.variantId}`;

if (PHASE === 'reopen') {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const owner = client();
  check('réouverture : connexion du propriétaire', (await owner('POST', '/auth/login', s.owner)).status === 200);
  const reopened = await owner('GET', variantPath(s));
  check('réouverture : variante relue après redémarrage', reopened.status === 200, String(reopened.status));
  check('réouverture : même tête de révision', reopened.body?.variant?.headRevisionId === s.headRevisionId);
  check('réouverture : document identique (empreinte)', digest(reopened.body?.revision?.document) === s.documentSha256);
  const first = await owner('GET', `${variantPath(s)}/revisions/${s.initialRevisionId}`);
  check('réouverture : révision initiale toujours lisible, vide et en lecture seule', first.status === 200 && first.body.revision.document.objects.length === 0 && first.body.canWrite === false);
} else {
  const owner = client(), foreign = client(), anonymous = client();
  const ownerCredentials = credentials();
  check('compte propriétaire créé par l\'API', (await owner('POST', '/auth/register', ownerCredentials)).status === 201);
  check('second compte créé par l\'API', (await foreign('POST', '/auth/register', credentials())).status === 201);
  const project = await owner('POST', '/projects', { code: `SP_${randomUUID().slice(0, 8)}`, name: 'Studio — projet de recette synthétique' });
  check('projet créé', project.status === 201, String(project.status));
  const projectId = project.body?.id;
  const root = `/projects/${projectId}/studio/studies`;

  const created = await owner('POST', root, { name: 'Étude de recette' });
  check('étude créée avec sa variante initiale et une révision vide', created.status === 201 && created.body.revision.document.objects.length === 0 && created.body.variant.headRevisionId === created.body.revision.id, JSON.stringify(created.body).slice(0, 200));
  const s = { projectId, studyId: created.body.study.id, variantId: created.body.variant.id };
  const listed = await owner('GET', root);
  check('étude listée', listed.status === 200 && listed.body.studies.some((x) => x.id === s.studyId));

  const envelope = {
    contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: created.body.revision.id,
    commands: [
      { toolId: 'studio.dessin.ligne', params: { id: 'ligne-1', type: 'line', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } } },
      { toolId: 'studio.dessin.rectangle', params: { id: 'rect-1', type: 'rectangle', origin: { x: 1, y: 1 }, width: 3, height: 2 } },
    ],
  };
  const saved = await owner('POST', `${variantPath(s)}/commands`, envelope);
  check('ligne + rectangle enregistrés : nouvelle révision, tête avancée', saved.status === 200 && saved.body.replayed === false && saved.body.revision.document.objects.length === 2 && saved.body.revision.parentRevisionId === created.body.revision.id, JSON.stringify(saved.body).slice(0, 200));
  const replay = await owner('POST', `${variantPath(s)}/commands`, envelope);
  check('rejeu du même requestId idempotent', replay.status === 200 && replay.body.replayed === true && replay.body.revision.id === saved.body.revision.id);
  const stale = await owner('POST', `${variantPath(s)}/commands`, { ...envelope, requestId: `recette-${randomUUID()}`, commands: [{ toolId: 'studio.dessin.deplacer', params: { id: 'ligne-1', dx: 1, dy: 0 } }] });
  check('base périmée refusée sans écrasement (409 stale_revision)', stale.status === 409 && stale.body.error === 'stale_revision', JSON.stringify(stale.body));
  const moved = await owner('POST', `${variantPath(s)}/commands`, { contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: saved.body.revision.id, commands: [{ toolId: 'studio.dessin.deplacer', params: { id: 'ligne-1', dx: 1, dy: 0 } }] });
  const line = moved.body?.revision?.document?.objects?.find((x) => x.id === 'ligne-1');
  check('déplacement exact sur la tête courante', moved.status === 200 && line?.start.x === 1 && line?.end.x === 6);
  const reused = await owner('POST', `${variantPath(s)}/commands`, { ...envelope, baseRevisionId: moved.body.revision.id });
  check('requestId réutilisé avec un autre contenu refusé (409)', reused.status === 409, String(reused.status));
  const invalid = await owner('POST', `${variantPath(s)}/commands`, { contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: moved.body.revision.id, commands: [{ toolId: 'studio.dessin.ligne', params: { id: 'x', type: 'line', start: { x: 0, y: 0 }, end: { x: 'a', y: 0 } } }] });
  check('géométrie invalide refusée (400)', invalid.status === 400, String(invalid.status));

  const head = await owner('GET', variantPath(s));
  check('relecture de la tête', head.status === 200 && head.body.revision.id === moved.body.revision.id && head.body.canWrite === true);
  check('autre compte : accès refusé côté serveur', [403, 404].includes((await foreign('GET', variantPath(s))).status));
  check('autre compte : écriture refusée côté serveur', [403, 404].includes((await foreign('POST', `${variantPath(s)}/commands`, { ...envelope, requestId: `recette-${randomUUID()}`, baseRevisionId: moved.body.revision.id })).status));
  check('anonyme : 401', (await anonymous('GET', variantPath(s))).status === 401);
  const old = await owner('GET', `${variantPath(s)}/revisions/${saved.body.revision.id}`);
  check('historique : révision précédente intacte et en lecture seule', old.status === 200 && old.body.revision.document.objects.find((x) => x.id === 'ligne-1')?.start.x === 0 && old.body.canWrite === false);

  if (STATE) writeFileSync(STATE, JSON.stringify({ ...s, owner: ownerCredentials, headRevisionId: head.body.revision.id, initialRevisionId: created.body.revision.id, documentSha256: digest(head.body.revision.document) }), { mode: 0o600 });
}
if (failures) { console.log(`${failures} vérification(s) en échec`); process.exit(1); }
console.log(`Studio (${PHASE}) : toutes les vérifications réussies.`);
