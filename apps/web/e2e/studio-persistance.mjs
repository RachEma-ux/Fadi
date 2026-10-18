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
    return { status: res.status, body: json, text, headers: res.headers };
  };
}
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** JSON à clés triées : jsonb ne conserve pas l'ordre des clés d'une réponse rejouée. */
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
const count = (text, re) => (typeof text === 'string' ? text.match(re)?.length ?? 0 : 0);
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
  const study = await owner('GET', `/projects/${s.projectId}/studio/studies/${s.studyId}`);
  check('réouverture : étude relue avec ses variantes dans le même ordre', study.status === 200 && JSON.stringify(study.body.variants.map((x) => x.id)) === JSON.stringify(s.variantIds) && study.body.canWrite === true, JSON.stringify(study.body).slice(0, 300));
  const history = await owner('GET', `${variantPath(s)}/revisions`);
  check('réouverture : historique identique, plus récente d\'abord', history.status === 200 && JSON.stringify(history.body.revisions.map((x) => x.id)) === JSON.stringify(s.revisionIds));
  const reExport = await owner('GET', `${variantPath(s)}/export?format=dxf`);
  check('réouverture : export DXF de la tête après redémarrage', reExport.status === 200 && reExport.headers.get('content-type') === 'application/dxf' && count(reExport.text, /\r\nLINE\r\n/g) === 1 && count(reExport.text, /\r\nPOLYLINE\r\n/g) === 1 && reExport.headers.get('content-disposition')?.endsWith(`-${s.headRevisionId.slice(-8)}.dxf"`), `${reExport.status} ${reExport.headers.get('content-disposition')}`);
  if (s.exportStudy) {
    const owner2 = await owner('GET', `/projects/${s.projectId}/studio/studies/${s.exportStudy.studyId}/variants/${s.exportStudy.variantId}/export?format=svg`);
    check('réouverture : export SVG de l\'étude idempotente identique', owner2.status === 200 && digest(owner2.text) === s.exportStudy.svgSha256);
  }
} else {
  const owner = client(), foreign = client(), anonymous = client();
  const ownerCredentials = credentials();
  const ownerUser = await owner('POST', '/auth/register', ownerCredentials);
  check('compte propriétaire créé par l\'API', ownerUser.status === 201);
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

  // Étude, variantes et historique (lecture de l'étude, création de variante, liste des révisions).
  const isIso = (value) => typeof value === 'string' && new Date(value).toISOString() === value;
  const studyPath = `${root}/${s.studyId}`;
  check('liste des études : date de création ISO', listed.body?.studies?.every((x) => isIso(x.createdAt)), JSON.stringify(listed.body).slice(0, 200));
  const study = await owner('GET', studyPath);
  check('étude relue : identité, variante initiale, date ISO et droit d\'écriture', study.status === 200 && study.body.study.id === s.studyId && study.body.study.projectId === projectId && study.body.study.name === 'Étude de recette' && study.body.study.initialVariantId === s.variantId && isIso(study.body.study.createdAt) && study.body.canWrite === true, JSON.stringify(study.body).slice(0, 200));
  check('étude relue : variante initiale seule, tête courante', study.body?.variants?.length === 1 && study.body.variants[0].id === s.variantId && study.body.variants[0].headRevisionId === moved.body.revision.id && study.body.variants[0].name === 'Variante initiale');
  const variantB = await owner('POST', `${studyPath}/variants`, { name: '  Variante B  ' });
  check('variante créée (201) : nom épuré, document vide, sans parent, tête = révision initiale', variantB.status === 201 && variantB.body.variant.name === 'Variante B' && variantB.body.variant.studyId === s.studyId && variantB.body.study.id === s.studyId && variantB.body.revision.parentRevisionId === null && variantB.body.revision.document.objects.length === 0 && variantB.body.variant.headRevisionId === variantB.body.revision.id && variantB.body.canWrite === true, JSON.stringify(variantB.body).slice(0, 200));
  const variantC = await owner('POST', `${studyPath}/variants`, { name: 'Variante C' });
  check('seconde variante créée (201)', variantC.status === 201, String(variantC.status));
  check('nom de variante vide refusé (400)', (await owner('POST', `${studyPath}/variants`, { name: '   ' })).status === 400);
  check('champ inconnu refusé (400, schéma strict)', (await owner('POST', `${studyPath}/variants`, { name: 'X', extra: 1 })).status === 400);
  check('nom de variante trop long refusé (400)', (await owner('POST', `${studyPath}/variants`, { name: 'v'.repeat(201) })).status === 400);
  const expectedOrder = [s.variantId, variantB.body?.variant?.id, variantC.body?.variant?.id];
  const variants = await owner('GET', `${studyPath}/variants`);
  check('variantes listées : initiale d\'abord puis ordre de création', variants.status === 200 && JSON.stringify(variants.body.variants.map((x) => x.id)) === JSON.stringify(expectedOrder), JSON.stringify(variants.body).slice(0, 300));
  check('variantes listées : forme { id, name, headRevisionId }', variants.body?.variants?.every((x) => Object.keys(x).sort().join() === 'headRevisionId,id,name'));
  const studyAgain = await owner('GET', studyPath);
  check('étude relue : même ordre de variantes', JSON.stringify(studyAgain.body?.variants) === JSON.stringify(variants.body?.variants));
  const commandOnB = await owner('POST', `${root}/${s.studyId}/variants/${variantB.body.variant.id}/commands`, { contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: variantB.body.revision.id, commands: [{ toolId: 'studio.dessin.ligne', params: { id: 'ligne-b', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } }] });
  check('variante B : commande acceptée, variante initiale inchangée', commandOnB.status === 200 && (await owner('GET', variantPath(s))).body?.revision?.id === moved.body.revision.id);

  const history = await owner('GET', `${variantPath(s)}/revisions`);
  const ids = history.body?.revisions?.map((x) => x.id);
  check('historique : plus récente d\'abord', history.status === 200 && JSON.stringify(ids) === JSON.stringify([moved.body.revision.id, saved.body.revision.id, created.body.revision.id]), JSON.stringify(history.body).slice(0, 300));
  const revs = history.body?.revisions ?? [];
  check('historique : chaîne des parents', revs[0]?.parentRevisionId === saved.body.revision.id && revs[1]?.parentRevisionId === created.body.revision.id && revs[2]?.parentRevisionId === null);
  check('historique : sources et auteur', revs[0]?.source === 'authenticated-session' && revs[1]?.source === 'authenticated-session' && revs[2]?.source === 'study-initialization' && revs.every((x) => x.authorId === ownerUser.body.id && isIso(x.createdAt)));
  check('historique : aucun document renvoyé', revs.every((x) => Object.keys(x).sort().join() === 'authorId,createdAt,id,parentRevisionId,source'));
  const historyB = await owner('GET', `${studyPath}/variants/${variantB.body.variant.id}/revisions`);
  check('historique de la variante B : commande puis initialisation de variante', historyB.status === 200 && historyB.body.revisions.length === 2 && historyB.body.revisions[0].id === commandOnB.body.revision.id && historyB.body.revisions[1].id === variantB.body.revision.id && historyB.body.revisions[1].source === 'variant-initialization' && historyB.body.revisions[1].parentRevisionId === null && historyB.body.revisions[0].parentRevisionId === variantB.body.revision.id, JSON.stringify(historyB.body).slice(0, 300));

  // Portée : étude d'un autre projet, variante inconnue ou d'une autre étude → 404.
  const foreignProject = await foreign('POST', '/projects', { code: `SF_${randomUUID().slice(0, 8)}`, name: 'Studio — projet étranger synthétique' });
  const foreignStudy = await foreign('POST', `/projects/${foreignProject.body?.id}/studio/studies`, { name: 'Étude étrangère' });
  check('projet et étude du second compte créés', foreignProject.status === 201 && foreignStudy.status === 201);
  const elsewhere = `${root}/${foreignStudy.body?.study?.id}`;
  check('étude d\'un autre projet : lecture 404', (await owner('GET', elsewhere)).status === 404);
  check('étude d\'un autre projet : variantes 404', (await owner('GET', `${elsewhere}/variants`)).status === 404);
  check('étude d\'un autre projet : création de variante 404', (await owner('POST', `${elsewhere}/variants`, { name: 'Intruse' })).status === 404);
  check('étude d\'un autre projet : historique 404', (await owner('GET', `${elsewhere}/variants/${foreignStudy.body?.variant?.id}/revisions`)).status === 404);
  check('étude inconnue : 404', (await owner('GET', `${root}/studio_study_inconnue`)).status === 404);
  check('variante inconnue : historique 404', (await owner('GET', `${studyPath}/variants/studio_variant_inconnue/revisions`)).status === 404);
  const study2 = await owner('POST', root, { name: 'Seconde étude' });
  check('variante d\'une autre étude du même projet : historique 404', study2.status === 201 && (await owner('GET', `${root}/${study2.body.study.id}/variants/${s.variantId}/revisions`)).status === 404);
  const foreignVariants = await foreign('GET', `/projects/${foreignProject.body?.id}/studio/studies/${foreignStudy.body?.study?.id}/variants`);
  check('second compte : ses propres variantes lisibles', foreignVariants.status === 200 && foreignVariants.body.variants.length === 1);

  // Comptes étrangers et anonymes sur les nouvelles routes.
  const newRoutes = [
    ['lecture de l\'étude', 'GET', studyPath], ['liste des variantes', 'GET', `${studyPath}/variants`],
    ['création de variante', 'POST', `${studyPath}/variants`, { name: 'Intruse' }], ['historique', 'GET', `${variantPath(s)}/revisions`],
  ];
  for (const [short, method, path, body] of newRoutes) {
    check(`autre compte refusé : ${short}`, [403, 404].includes((await foreign(method, path, body)).status));
    check(`anonyme 401 : ${short}`, (await anonymous(method, path, body)).status === 401);
  }
  const after = await owner('GET', `${studyPath}/variants`);
  check('aucune variante créée par les requêtes refusées', after.body?.variants?.length === 3);

  // Création idempotente (requestId facultatif) : rejeu du même auteur = réponse 201 d'origine, autre auteur = 409.
  const editor = client();
  const editorCredentials = credentials();
  check('compte éditeur créé', (await editor('POST', '/auth/register', editorCredentials)).status === 201);
  check('éditeur ajouté au projet', (await owner('POST', `/projects/${projectId}/members`, { email: editorCredentials.email, role: 'editeur' })).status === 201);
  const studyRequestId = `creation-${randomUUID()}`;
  const ideal = await owner('POST', root, { name: 'Étude d’export', requestId: studyRequestId });
  check('étude créée avec requestId (201, replayed=false)', ideal.status === 201 && ideal.body.replayed === false && ideal.headers.get('idempotent-replayed') === 'false', JSON.stringify(ideal.body).slice(0, 200));
  const idealAgain = await owner('POST', root, { name: 'Étude d’export', requestId: studyRequestId });
  check('rejeu de création d\'étude : 201, mêmes identifiants, replayed=true', idealAgain.status === 201 && idealAgain.body.replayed === true && idealAgain.headers.get('idempotent-replayed') === 'true' && idealAgain.body.study.id === ideal.body.study.id && idealAgain.body.variant.id === ideal.body.variant.id && idealAgain.body.revision.id === ideal.body.revision.id && canonical({ ...idealAgain.body, replayed: false }) === canonical(ideal.body), JSON.stringify(idealAgain.body).slice(0, 200));
  const studyConflictOther = await editor('POST', root, { name: 'Étude d’export', requestId: studyRequestId });
  check('requestId d\'étude rejoué par un autre auteur : 409 request_conflict', studyConflictOther.status === 409 && studyConflictOther.body.error === 'request_conflict', `${studyConflictOther.status} ${JSON.stringify(studyConflictOther.body)}`);
  const studyConflictName = await owner('POST', root, { name: 'Autre nom', requestId: studyRequestId });
  check('requestId d\'étude rejoué avec un autre nom : 409 request_conflict', studyConflictName.status === 409 && studyConflictName.body.error === 'request_conflict');
  check('requestId d\'étude invalide refusé (400)', (await owner('POST', root, { name: 'X', requestId: 'pas valide !' })).status === 400);
  const studiesAfter = await owner('GET', root);
  check('une seule étude créée par les rejeux', studiesAfter.body?.studies?.filter((x) => x.name === 'Étude d’export').length === 1);
  const idealStudyPath = `${root}/${ideal.body.study.id}`;
  const variantRequestId = `creation-${randomUUID()}`;
  const v1 = await owner('POST', `${idealStudyPath}/variants`, { name: 'Variante idempotente', requestId: variantRequestId });
  const v1Again = await owner('POST', `${idealStudyPath}/variants`, { name: 'Variante idempotente', requestId: variantRequestId });
  check('rejeu de création de variante : 201, mêmes identifiants, replayed=true', v1.status === 201 && v1.body.replayed === false && v1Again.status === 201 && v1Again.body.replayed === true && v1Again.headers.get('idempotent-replayed') === 'true' && v1Again.body.variant.id === v1.body.variant.id && v1Again.body.revision.id === v1.body.revision.id, `${v1.status} ${v1Again.status}`);
  const variantConflict = await editor('POST', `${idealStudyPath}/variants`, { name: 'Variante idempotente', requestId: variantRequestId });
  check('requestId de variante rejoué par un autre auteur : 409 request_conflict', variantConflict.status === 409 && variantConflict.body.error === 'request_conflict', String(variantConflict.status));
  const sameIdOtherStudy = await owner('POST', `${root}/${study2.body.study.id}/variants`, { name: 'Variante idempotente', requestId: variantRequestId });
  check('même requestId de variante dans une autre étude : création distincte (unique par étude)', sameIdOtherStudy.status === 201 && sameIdOtherStudy.body.replayed === false && sameIdOtherStudy.body.variant.id !== v1.body.variant.id);
  const idealVariants = await owner('GET', `${idealStudyPath}/variants`);
  check('variantes de l\'étude idempotente : initiale + une seule créée', idealVariants.body?.variants?.length === 2);

  // Export SVG / DXF après dessin d'une ligne, d'un rectangle sur calque et d'une cote liée.
  const ev = { projectId, studyId: ideal.body.study.id, variantId: ideal.body.variant.id };
  const drawn = await owner('POST', `${variantPath(ev)}/commands`, {
    contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: ideal.body.revision.id,
    commands: [
      { toolId: 'studio.calque.creer', params: { id: 'murs', name: 'Murs', visible: true, locked: false } },
      { toolId: 'studio.dessin.ligne', params: { id: 'l-export', type: 'line', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } } },
      { toolId: 'studio.dessin.rectangle', params: { id: 'r-export', type: 'rectangle', layerId: 'murs', origin: { x: 0, y: 1 }, width: 3, height: 2 } },
      { toolId: 'studio.dessin.cote', params: { id: 'c-export', type: 'dimension', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, offset: -0.5, links: { start: { objectId: 'l-export', anchor: 'start' }, end: { objectId: 'l-export', anchor: 'end' } }, toResolve: false } },
    ],
  });
  check('dessin et cote enregistrés pour l\'export', drawn.status === 200 && drawn.body.revision.document.dimensions?.length === 1, JSON.stringify(drawn.body).slice(0, 300));
  const exportPath = `${variantPath(ev)}/export`;
  const tail = drawn.body?.revision?.id?.slice(-8);
  const svg = await owner('GET', `${exportPath}?format=svg`);
  check('export SVG : 200, image/svg+xml, pièce jointe nommée', svg.status === 200 && svg.headers.get('content-type')?.startsWith('image/svg+xml') && svg.headers.get('content-disposition') === `attachment; filename="etude-d-export-variante-initiale-${tail}.svg"`, `${svg.status} ${svg.headers.get('content-type')} ${svg.headers.get('content-disposition')}`);
  check('export SVG : calques, ligne, rectangle, cote et valeur mesurée', count(svg.text, /<g data-layer=/g) === 2 && count(svg.text, /<line data-id=/g) === 1 && count(svg.text, /<rect data-id=/g) === 1 && count(svg.text, /<g data-dimension=/g) === 1 && svg.text.includes('>5,00 m</text>') && svg.text.includes('data-layer="murs" data-name="Murs"'), String(svg.text).slice(0, 400));
  check('export SVG : en-tête de révision exportée', svg.headers.get('x-studio-revision') === drawn.body?.revision?.id);
  const dxf = await owner('GET', `${exportPath}?format=dxf`);
  check('export DXF : 200, application/dxf, pièce jointe nommée', dxf.status === 200 && dxf.headers.get('content-type') === 'application/dxf' && dxf.headers.get('content-disposition') === `attachment; filename="etude-d-export-variante-initiale-${tail}.dxf"`, `${dxf.status} ${dxf.headers.get('content-type')} ${dxf.headers.get('content-disposition')}`);
  check('export DXF : R12, mètres, entités et calques attendus, valeur mesurée', dxf.text.includes('$ACADVER\r\n1\r\nAC1009') && dxf.text.includes('$INSUNITS\r\n70\r\n6') && count(dxf.text, /\r\nLINE\r\n/g) === 4 && count(dxf.text, /\r\nPOLYLINE\r\n/g) === 1 && count(dxf.text, /\r\nVERTEX\r\n/g) === 4 && count(dxf.text, /\r\nTEXT\r\n/g) === 1 && dxf.text.includes('\r\n1\r\n5,00 m\r\n') && dxf.text.includes('LAYER\r\n2\r\n0\r\n') && dxf.text.includes('LAYER\r\n2\r\nMURS\r\n') && dxf.text.endsWith('EOF\r\n'), String(dxf.text).slice(0, 300));
  const oldSvg = await owner('GET', `${exportPath}?format=svg&revision=${ideal.body.revision.id}`);
  check('export d\'une révision antérieure : document vide, nom suffixé par cette révision', oldSvg.status === 200 && count(oldSvg.text, /<line data-id=/g) === 0 && oldSvg.headers.get('content-disposition')?.endsWith(`-${ideal.body.revision.id.slice(-8)}.svg"`));
  check('export : format inconnu 400', (await owner('GET', `${exportPath}?format=pdf`)).status === 400);
  check('export : format absent 400', (await owner('GET', exportPath)).status === 400);
  check('export : révision inconnue 404', (await owner('GET', `${exportPath}?format=svg&revision=studio_revision_inconnue`)).status === 404);
  check('export : révision d\'une autre variante 404', (await owner('GET', `${exportPath}?format=svg&revision=${created.body.revision.id}`)).status === 404);
  check('export : éditeur membre autorisé en lecture', (await editor('GET', `${exportPath}?format=dxf`)).status === 200);
  check('export : autre compte refusé (403/404)', [403, 404].includes((await foreign('GET', `${exportPath}?format=svg`)).status));
  check('export : anonyme 401', (await anonymous('GET', `${exportPath}?format=svg`)).status === 401);
  check('export : étude d\'un autre projet 404', (await owner('GET', `${elsewhere}/variants/${foreignStudy.body?.variant?.id}/export?format=svg`)).status === 404);

  if (STATE) writeFileSync(STATE, JSON.stringify({ ...s, owner: ownerCredentials, headRevisionId: head.body.revision.id, initialRevisionId: created.body.revision.id, documentSha256: digest(head.body.revision.document), variantIds: expectedOrder, revisionIds: ids, exportStudy: { studyId: ev.studyId, variantId: ev.variantId, svgSha256: digest(svg.text) } }), { mode: 0o600 });
}
if (failures) { console.log(`${failures} vérification(s) en échec`); process.exit(1); }
console.log(`Studio (${PHASE}) : toutes les vérifications réussies.`);
