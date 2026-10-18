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
  if (s.commentIds) {
    const reComments = await owner('GET', `${variantPath(s)}/comments`);
    check('réouverture : fils de commentaires identiques', reComments.status === 200 && JSON.stringify(reComments.body.comments.map((x) => x.id)) === JSON.stringify(s.commentIds));
  }
  if (s.linkedSteps) {
    const reSteps = await owner('GET', `/projects/${s.projectId}/studio/studies/${s.studyId}/steps`);
    check('réouverture : étapes du Parcours liées identiques', reSteps.status === 200 && JSON.stringify(reSteps.body.steps.map((x) => x.number)) === JSON.stringify(s.linkedSteps));
  }
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

  // Comparaison (lecture seule) : variante B dessinée différemment, comptes exacts, portée et droits.
  const bId = variantB.body.variant.id;
  const drawB = await owner('POST', `${studyPath}/variants/${bId}/commands`, {
    contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: commandOnB.body.revision.id,
    commands: [
      // Même identifiant que la ligne de la variante initiale, autre type : supprimé + ajouté.
      { toolId: 'studio.dessin.rectangle', params: { id: 'ligne-1', type: 'rectangle', origin: { x: 0, y: 5 }, width: 1, height: 1 } },
      // Même rectangle translaté de (1, 2) : modifié, déplacement détecté.
      { toolId: 'studio.dessin.rectangle', params: { id: 'rect-1', type: 'rectangle', origin: { x: 2, y: 3 }, width: 3, height: 2 } },
    ],
  });
  check('variante B : objets différents enregistrés', drawB.status === 200 && drawB.body.revision.document.objects.length === 3, JSON.stringify(drawB.body).slice(0, 200));
  const compare = (who, from, to, path = studyPath) => who('GET', `${path}/compare?${new URLSearchParams({ from, to })}`);
  const cmp = await compare(owner, s.variantId, bId);
  const sum = cmp.body?.difference?.resume;
  check('comparaison A → B : 200, côtés résolus à la tête', cmp.status === 200 && cmp.body.from.variantId === s.variantId && cmp.body.from.revisionId === moved.body.revision.id && cmp.body.to.variantId === bId && cmp.body.to.revisionId === drawB.body?.revision?.id, `${cmp.status} ${JSON.stringify(cmp.body).slice(0, 300)}`);
  check('comparaison A → B : comptes exacts (2 ajoutés, 1 supprimé, 1 modifié dont 1 déplacé, 0 identique)', JSON.stringify(sum?.objets) === JSON.stringify({ ajoute: 2, supprime: 1, modifie: 1, identique: 0, deplace: 1 }) && sum?.calques?.ajoute === 0 && sum?.cotes?.ajoute === 0 && cmp.body.difference.identiques === false, JSON.stringify(sum));
  check('comparaison A → B : identifiant réutilisé avec un autre type, déplacement (1, 2)', JSON.stringify(cmp.body?.difference?.objets?.map((o) => [o.id, o.etat])) === JSON.stringify([['ligne-1', 'supprime'], ['ligne-1', 'ajoute'], ['ligne-b', 'ajoute'], ['rect-1', 'modifie']]) && JSON.stringify(cmp.body.difference.objets[3].deplacement) === JSON.stringify({ dx: 1, dy: 2 }));
  const cmpRev = await compare(owner, `${s.variantId}:${saved.body.revision.id}`, s.variantId);
  check('comparaison révision → tête de la même variante : ligne déplacée de (1, 0), rectangle identique', cmpRev.status === 200 && cmpRev.body.from.revisionId === saved.body.revision.id && JSON.stringify(cmpRev.body.difference.resume.objets) === JSON.stringify({ ajoute: 0, supprime: 0, modifie: 1, identique: 1, deplace: 1 }) && JSON.stringify(cmpRev.body.difference.objets[0].deplacement) === JSON.stringify({ dx: 1, dy: 0 }), JSON.stringify(cmpRev.body).slice(0, 300));
  const cmpSame = await compare(owner, s.variantId, `${s.variantId}:${moved.body.revision.id}`);
  check('comparaison tête → même révision : identiques', cmpSame.status === 200 && cmpSame.body.difference.identiques === true && cmpSame.body.difference.resume.objets.identique === 2);
  check('comparaison : la tête n\'est pas modifiée par la lecture', (await owner('GET', variantPath(s))).body?.revision?.id === moved.body.revision.id);
  for (const [label, query] of [['from absent', `to=${bId}`], ['to absent', `from=${bId}`], ['trois segments', `from=a:b:c&to=${bId}`], ['segment vide', `from=${bId}:&to=${bId}`], ['caractère interdit', `from=a%20b&to=${bId}`], ['paramètre en trop', `from=${bId}&to=${bId}&x=1`], ['paramètre répété', `from=${bId}&from=${bId}&to=${bId}`]]) {
    check(`comparaison : ${label} → 400`, (await owner('GET', `${studyPath}/compare?${query}`)).status === 400);
  }
  check('comparaison : variante inconnue 404', (await compare(owner, 'studio_variant_inconnue', bId)).status === 404);
  check('comparaison : révision d\'une autre variante 404', (await compare(owner, `${s.variantId}:${drawB.body?.revision?.id}`, bId)).status === 404);
  check('comparaison : révision inconnue 404', (await compare(owner, `${s.variantId}:studio_revision_inconnue`, bId)).status === 404);
  check('comparaison : variante d\'une autre étude du même projet 404', (await compare(owner, s.variantId, study2.body.variant.id)).status === 404);
  check('comparaison : étude d\'un autre projet 404', (await compare(owner, foreignStudy.body?.variant?.id, foreignStudy.body?.variant?.id, elsewhere)).status === 404);
  check('comparaison : autre compte refusé (403/404)', [403, 404].includes((await compare(foreign, s.variantId, bId)).status));
  check('comparaison : autre compte sur son étude avec une variante étrangère 404', (await compare(foreign, foreignStudy.body?.variant?.id, s.variantId, `/projects/${foreignProject.body?.id}/studio/studies/${foreignStudy.body?.study?.id}`)).status === 404);
  check('comparaison : anonyme 401', (await compare(anonymous, s.variantId, bId)).status === 401);

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
  check('comparaison : éditeur membre autorisé en lecture', (await editor('GET', `${studyPath}/compare?${new URLSearchParams({ from: s.variantId, to: variantB.body.variant.id })}`)).status === 200);
  check('export : autre compte refusé (403/404)', [403, 404].includes((await foreign('GET', `${exportPath}?format=svg`)).status));
  check('export : anonyme 401', (await anonymous('GET', `${exportPath}?format=svg`)).status === 401);
  check('export : étude d\'un autre projet 404', (await owner('GET', `${elsewhere}/variants/${foreignStudy.body?.variant?.id}/export?format=svg`)).status === 404);

  // Export IFC après extrusion déclarée par commande : la ligne avec épaisseur devient un IfcWall, le rectangle un
  // IfcBuildingElementProxy ; rien d'autre n'est exporté en 3D (la cote est comptée, non exportée).
  const extruded = await owner('POST', `${variantPath(ev)}/commands`, {
    contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: drawn.body.revision.id,
    commands: [
      { toolId: 'studio.objet.extruder', params: { ids: ['l-export'], base: 0, height: 2.5, thickness: 0.2 } },
      { toolId: 'studio.objet.extruder', params: { ids: ['r-export'], base: 0, height: 1 } },
    ],
  });
  check('extrusion enregistrée par commande', extruded.status === 200 && extruded.body.revision.document.objects.find((o) => o.id === 'l-export')?.extrusion?.thickness === 0.2, JSON.stringify(extruded.body).slice(0, 300));
  const ifc = await owner('GET', `${exportPath}?format=ifc`);
  const ifcTail = extruded.body?.revision?.id?.slice(-8);
  check('export IFC : 200, application/x-step, pièce jointe .ifc', ifc.status === 200 && ifc.headers.get('content-type') === 'application/x-step' && ifc.headers.get('content-disposition') === `attachment; filename="etude-d-export-variante-initiale-${ifcTail}.ifc"` && ifc.headers.get('x-studio-revision') === extruded.body?.revision?.id, `${ifc.status} ${ifc.headers.get('content-type')} ${ifc.headers.get('content-disposition')}`);
  check('export IFC : en-tête ISO-10303-21, IFC4X3_ADD2, un IFCWALL, un proxy, calques, rien d\'inventé', ifc.text.startsWith('ISO-10303-21;\nHEADER;') && ifc.text.includes("FILE_SCHEMA(('IFC4X3_ADD2'));") && count(ifc.text, /=IFCWALL\(/g) === 1 && count(ifc.text, /=IFCBUILDINGELEMENTPROXY\(/g) === 1 && count(ifc.text, /=IFCEXTRUDEDAREASOLID\(/g) === 2 && count(ifc.text, /=IFCPRESENTATIONLAYERWITHSTYLE\(/g) === 2 && !ifc.text.includes('IFCMAPCONVERSION') && !ifc.text.includes('IFCPOSTALADDRESS') && ifc.text.includes("IFCPROPERTYSINGLEVALUE('DimensionsNotExported',$,IFCINTEGER(1),$)") && ifc.text.endsWith('END-ISO-10303-21;\n'), String(ifc.text).slice(0, 400));
  const ifcAgain = await owner('GET', `${exportPath}?format=ifc`);
  check('export IFC : déterministe (même révision, même fichier)', ifcAgain.status === 200 && digest(ifcAgain.text) === digest(ifc.text));
  const oldIfc = await owner('GET', `${exportPath}?format=ifc&revision=${drawn.body.revision.id}`);
  check('export IFC d\'une révision sans extrusion : aucun élément 3D', oldIfc.status === 200 && count(oldIfc.text, /=IFCWALL\(/g) === 0 && count(oldIfc.text, /=IFCBUILDINGELEMENTPROXY\(/g) === 0 && oldIfc.text.includes("IFCPROPERTYSINGLEVALUE('NonExtrudedObjects',$,IFCINTEGER(2),$)"));

  // Commentaires d'une variante : règles de la Collaboration (tout membre commente, lecteur compris ; l'auteur seul
  // supprime, ici en suppression douce), ancrage à une révision et à des objets, réponses en fil, rejeu idempotent.
  const commentsPath = `${variantPath(s)}/comments`;
  const reader = client();
  const readerCredentials = credentials();
  check('compte lecteur créé', (await reader('POST', '/auth/register', readerCredentials)).status === 201);
  check('lecteur ajouté au projet', (await owner('POST', `/projects/${projectId}/members`, { email: readerCredentials.email, role: 'lecteur' })).status === 201);
  const emptyComments = await owner('GET', commentsPath);
  check('commentaires : liste vide au départ', emptyComments.status === 200 && Array.isArray(emptyComments.body?.comments) && emptyComments.body.comments.length === 0, JSON.stringify(emptyComments.body));
  const commentRequestId = `commentaire-${randomUUID()}`;
  const anchored = await owner('POST', commentsPath, { body: '  Vérifier la ligne et le rectangle  ', objectIds: ['ligne-1', 'rect-1'], revisionId: saved.body.revision.id, requestId: commentRequestId });
  check('commentaire ancré (201) : texte épuré, révision et objets cités', anchored.status === 201 && anchored.body.replayed === false && anchored.body.body === 'Vérifier la ligne et le rectangle' && anchored.body.revisionId === saved.body.revision.id && JSON.stringify(anchored.body.objectIds) === JSON.stringify(['ligne-1', 'rect-1']) && anchored.body.mine === true && anchored.body.parentId === null && anchored.body.deletedAt === null && isIso(anchored.body.createdAt), `${anchored.status} ${JSON.stringify(anchored.body)}`);
  const anchoredAgain = await owner('POST', commentsPath, { body: '  Vérifier la ligne et le rectangle  ', objectIds: ['ligne-1', 'rect-1'], revisionId: saved.body.revision.id, requestId: commentRequestId });
  check('commentaire : rejeu du même requestId (201, même commentaire, replayed=true)', anchoredAgain.status === 201 && anchoredAgain.body.replayed === true && anchoredAgain.headers.get('idempotent-replayed') === 'true' && anchoredAgain.body.id === anchored.body.id, `${anchoredAgain.status} ${JSON.stringify(anchoredAgain.body)}`);
  check('commentaire : requestId réutilisé avec un autre texte → 409', (await owner('POST', commentsPath, { body: 'Autre texte', requestId: commentRequestId })).body?.error === 'request_conflict');
  check('commentaire : requestId réutilisé par un autre auteur → 409', (await editor('POST', commentsPath, { body: 'Vérifier la ligne et le rectangle', objectIds: ['ligne-1', 'rect-1'], revisionId: saved.body.revision.id, requestId: commentRequestId })).status === 409);
  const headAnchored = await owner('POST', commentsPath, { body: 'Ancré à la tête', objectIds: ['ligne-1'] });
  check('commentaire : objets sans révision ancrés à la tête vérifiée', headAnchored.status === 201 && headAnchored.body.revisionId === moved.body.revision.id, JSON.stringify(headAnchored.body));
  const unknownObjects = await owner('POST', commentsPath, { body: 'Objet inconnu', objectIds: ['ligne-1', 'objet-inconnu'] });
  check('commentaire : objet absent de la tête → 400', unknownObjects.status === 400 && unknownObjects.body?.code === 'unknown_objects' && JSON.stringify(unknownObjects.body.objectIds) === JSON.stringify(['objet-inconnu']), `${unknownObjects.status} ${JSON.stringify(unknownObjects.body)}`);
  check('commentaire : objet absent de la révision citée → 400', (await owner('POST', commentsPath, { body: 'Révision vide', objectIds: ['ligne-1'], revisionId: created.body.revision.id })).status === 400);
  check('commentaire : révision d\'une autre variante → 404', (await owner('POST', commentsPath, { body: 'Ailleurs', revisionId: variantB.body.revision.id })).status === 404);
  check('commentaire : vide → 400', (await owner('POST', commentsPath, { body: '   ' })).status === 400);
  check('commentaire : trop long → 400', (await owner('POST', commentsPath, { body: 'x'.repeat(4001) })).status === 400);
  check('commentaire : objet cité deux fois → 400', (await owner('POST', commentsPath, { body: 'Doublon', objectIds: ['ligne-1', 'ligne-1'] })).status === 400);
  check('commentaire : champ inconnu → 400 (schéma strict)', (await owner('POST', commentsPath, { body: 'X', extra: 1 })).status === 400);
  const readerComment = await reader('POST', commentsPath, { body: 'Remarque du lecteur' });
  check('lecteur : commente (règle de la Collaboration), sans écrire le dessin', readerComment.status === 201 && readerComment.body.mine === true, `${readerComment.status} ${JSON.stringify(readerComment.body)}`);
  check('lecteur : écriture du dessin toujours refusée (403)', (await reader('POST', `${variantPath(s)}/commands`, { contractVersion: 'studio-commands/1', requestId: `recette-${randomUUID()}`, baseRevisionId: moved.body.revision.id, commands: [{ toolId: 'studio.dessin.deplacer', params: { id: 'ligne-1', dx: 1, dy: 0 } }] })).status === 403);
  const reply = await editor('POST', commentsPath, { body: 'Réponse de l’éditeur', parentId: anchored.body.id });
  check('éditeur : répond en fil', reply.status === 201 && reply.body.parentId === anchored.body.id, JSON.stringify(reply.body));
  const replyToReply = await reader('POST', commentsPath, { body: 'Réponse à la réponse', parentId: reply.body?.id });
  check('réponse à une réponse : rattachée au commentaire d\'origine (un seul niveau)', replyToReply.status === 201 && replyToReply.body.parentId === anchored.body.id);
  check('réponse à un commentaire inconnu → 404', (await owner('POST', commentsPath, { body: 'Perdue', parentId: 'studio_comment_inconnu' })).status === 404);
  const otherVariantComment = await owner('POST', `${studyPath}/variants/${bId}/comments`, { body: 'Sur la variante B' });
  check('réponse à un commentaire d\'une autre variante → 404', otherVariantComment.status === 201 && (await owner('POST', commentsPath, { body: 'Croisée', parentId: otherVariantComment.body.id })).status === 404);
  const thread = await reader('GET', commentsPath);
  const threadIds = thread.body?.comments?.map((x) => x.id);
  check('lecture des fils : origine puis ses réponses, dans l\'ordre', thread.status === 200 && JSON.stringify(threadIds) === JSON.stringify([anchored.body.id, reply.body.id, replyToReply.body.id, headAnchored.body.id, readerComment.body.id]), JSON.stringify(threadIds));
  check('lecture des fils : auteur et « mine » relus par le serveur', thread.body?.comments?.[0]?.mine === false && thread.body.comments[0].authorEmail === ownerCredentials.email && thread.body.comments[2].mine === true);
  check('autre compte : commentaires refusés (lecture, écriture, suppression)', [403, 404].includes((await foreign('GET', commentsPath)).status) && [403, 404].includes((await foreign('POST', commentsPath, { body: 'Intrus' })).status) && [403, 404].includes((await foreign('DELETE', `${commentsPath}/${anchored.body.id}`)).status));
  check('anonyme : commentaires 401', (await anonymous('GET', commentsPath)).status === 401 && (await anonymous('POST', commentsPath, { body: 'Anonyme' })).status === 401);
  check('commentaires d\'un autre projet → 404', (await owner('GET', `${elsewhere}/variants/${foreignStudy.body?.variant?.id}/comments`)).status === 404);
  const notMine = await reader('DELETE', `${commentsPath}/${anchored.body.id}`);
  check('suppression du commentaire d\'un autre → 403', notMine.status === 403 && notMine.body?.error === 'forbidden', `${notMine.status} ${JSON.stringify(notMine.body)}`);
  check('suppression par un éditeur du commentaire du propriétaire → 403', (await editor('DELETE', `${commentsPath}/${anchored.body.id}`)).status === 403);
  check('suppression d\'un commentaire inconnu → 404', (await owner('DELETE', `${commentsPath}/studio_comment_inconnu`)).status === 404);
  check('suppression de son propre commentaire → 204', (await owner('DELETE', `${commentsPath}/${anchored.body.id}`)).status === 204);
  check('suppression répétée par l\'auteur → 204 (déjà supprimé)', (await owner('DELETE', `${commentsPath}/${anchored.body.id}`)).status === 204);
  const afterDelete = await owner('GET', commentsPath);
  const deletedView = afterDelete.body?.comments?.find((x) => x.id === anchored.body.id);
  check('suppression douce : fil conservé, texte et objets retirés, date de suppression', deletedView && deletedView.body === null && deletedView.objectIds.length === 0 && isIso(deletedView.deletedAt) && afterDelete.body.comments.length === 5 && afterDelete.body.comments[1].id === reply.body.id, JSON.stringify(deletedView));
  check('réponse à un commentaire supprimé → 404', (await editor('POST', commentsPath, { body: 'Trop tard', parentId: anchored.body.id })).status === 404);
  const deletedReplay = await owner('POST', commentsPath, { body: '  Vérifier la ligne et le rectangle  ', objectIds: ['ligne-1', 'rect-1'], revisionId: saved.body.revision.id, requestId: commentRequestId });
  check('rejeu après suppression : même commentaire, toujours supprimé, aucun doublon', deletedReplay.status === 201 && deletedReplay.body.replayed === true && deletedReplay.body.id === anchored.body.id && deletedReplay.body.deletedAt !== null && (await owner('GET', commentsPath)).body?.comments?.length === 5);
  check('commentaires : la tête du dessin n\'est pas modifiée', (await owner('GET', variantPath(s))).body?.revision?.id === moved.body.revision.id);
  const commentIds = (await owner('GET', commentsPath)).body?.comments?.map((x) => x.id);

  // Notifications : un commentaire de variante est signalé aux autres membres du projet (propriétaire compris), jamais
  // à son auteur ni hors du projet ; un commentaire supprimé n'est plus signalé ; le lien porte l'étude et la variante.
  const studioNotes = async (who) => ((await who('GET', '/notifications')).body?.items ?? []).filter((n) => n.kind === 'commentaire-studio');
  const readerNotes = await studioNotes(reader);
  const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  check('notifications : le lecteur voit les commentaires Studio des autres (propriétaire, éditeur), pas les siens ni le supprimé',
    sameSet(readerNotes.map((n) => n.id), [headAnchored.body.id, reply.body.id, otherVariantComment.body.id].map((id) => `commentaire-studio:${id}`)), JSON.stringify(readerNotes.map((n) => n.id)));
  const noteReply = readerNotes.find((n) => n.id === `commentaire-studio:${reply.body.id}`);
  check('notifications : variante et étude désignées, texte avec auteur et extrait', noteReply?.projectId === projectId && noteReply?.studio?.studyId === s.studyId && noteReply?.studio?.variantId === s.variantId && noteReply.stepNumber === null && noteReply.text.includes(editorCredentials.email) && noteReply.text.includes('« Réponse de l’éditeur »') && isIso(noteReply.at), JSON.stringify(noteReply));
  const ownerNotes = await studioNotes(owner);
  check('notifications : le propriétaire voit ceux du lecteur et de l\'éditeur, pas les siens',
    sameSet(ownerNotes.map((n) => n.id), [reply.body.id, replyToReply.body.id, readerComment.body.id].map((id) => `commentaire-studio:${id}`)), JSON.stringify(ownerNotes.map((n) => n.id)));
  check('notifications : un compte hors du projet ne reçoit rien', (await studioNotes(foreign)).length === 0);

  // Liens étude ↔ étapes du Parcours : lecture `read`, PUT idempotent de la liste complète avec `modify`.
  const stepsPath = `${studyPath}/steps`;
  const noLinks = await owner('GET', stepsPath);
  check('étapes liées : aucune au départ, 21 étapes du projet proposées avec leurs libellés', noLinks.status === 200 && noLinks.body.steps.length === 0 && noLinks.body.available.length === 21 && noLinks.body.available.every((x, i) => x.number === i + 1 && typeof x.title === 'string' && x.title.length > 0 && typeof x.phase === 'string') && noLinks.body.canWrite === true, JSON.stringify(noLinks.body).slice(0, 300));
  const linked = await owner('PUT', stepsPath, { steps: [3, 1] });
  check('étapes liées : PUT [3, 1] → 200, liste triée', linked.status === 200 && JSON.stringify(linked.body.steps.map((x) => x.number)) === '[1,3]' && linked.body.steps.every((x) => isIso(x.createdAt)), JSON.stringify(linked.body).slice(0, 300));
  const linkedAgain = await owner('PUT', stepsPath, { steps: [1, 3] });
  check('étapes liées : même liste rejouée → identique (dates conservées)', linkedAgain.status === 200 && JSON.stringify(linkedAgain.body.steps) === JSON.stringify(linked.body.steps));
  const byEditor = await editor('PUT', stepsPath, { steps: [2, 3] });
  const kept3 = linked.body.steps.find((x) => x.number === 3)?.createdAt;
  check('étapes liées : l\'éditeur remplace la liste (2, 3), le lien conservé garde sa date', byEditor.status === 200 && JSON.stringify(byEditor.body.steps.map((x) => x.number)) === '[2,3]' && byEditor.body.steps.find((x) => x.number === 3)?.createdAt === kept3, JSON.stringify(byEditor.body).slice(0, 300));
  const unknownStep = await owner('PUT', stepsPath, { steps: [2, 99] });
  check('étapes liées : étape inconnue du projet → 400 unknown_steps, rien de modifié', unknownStep.status === 400 && unknownStep.body?.code === 'unknown_steps' && JSON.stringify(unknownStep.body.steps) === '[99]' && JSON.stringify((await owner('GET', stepsPath)).body.steps.map((x) => x.number)) === '[2,3]', `${unknownStep.status} ${JSON.stringify(unknownStep.body)}`);
  check('étapes liées : étape citée deux fois, non entière, zéro, champ inconnu ou liste absente → 400', (await owner('PUT', stepsPath, { steps: [2, 2] })).status === 400 && (await owner('PUT', stepsPath, { steps: [1.5] })).status === 400 && (await owner('PUT', stepsPath, { steps: [0] })).status === 400 && (await owner('PUT', stepsPath, { steps: [], x: 1 })).status === 400 && (await owner('PUT', stepsPath, {})).status === 400);
  const readerSteps = await reader('GET', stepsPath);
  check('étapes liées : le lecteur lit (canWrite faux) et ne peut pas modifier (403)', readerSteps.status === 200 && readerSteps.body.canWrite === false && JSON.stringify(readerSteps.body.steps.map((x) => x.number)) === '[2,3]' && (await reader('PUT', stepsPath, { steps: [] })).status === 403);
  check('étapes liées : autre compte refusé (403/404), anonyme 401', [403, 404].includes((await foreign('GET', stepsPath)).status) && [403, 404].includes((await foreign('PUT', stepsPath, { steps: [1] })).status) && (await anonymous('GET', stepsPath)).status === 401 && (await anonymous('PUT', stepsPath, { steps: [1] })).status === 401);
  check('étapes liées : étude d\'un autre projet → 404 (lecture et écriture)', (await owner('GET', `${root}/${foreignStudy.body?.study?.id}/steps`)).status === 404 && (await owner('PUT', `${root}/${foreignStudy.body?.study?.id}/steps`, { steps: [1] })).status === 404);
  const ofStep = (who, n, pid = projectId) => who('GET', `/projects/${pid}/studio/steps/${n}/studies`);
  const step2 = await ofStep(reader, 2);
  check('étape 02 : l\'étude liée est listée (lecture), nommée', step2.status === 200 && step2.body.studies.length === 1 && step2.body.studies[0].id === s.studyId && step2.body.studies[0].name === 'Étude de recette', JSON.stringify(step2.body));
  check('étape 01 : plus aucune étude liée après remplacement', (await ofStep(owner, 1)).body?.studies?.length === 0);
  check('études d\'une étape : numéro absent du projet ou mal formé → 400', (await ofStep(owner, 99)).status === 400 && (await ofStep(owner, 'abc')).status === 400 && (await ofStep(owner, 0)).status === 400);
  check('études d\'une étape : autre compte refusé (403/404), anonyme 401', [403, 404].includes((await ofStep(foreign, 2)).status) && (await ofStep(anonymous, 2)).status === 401);
  check('études d\'une étape : les liens d\'un projet ne fuient pas dans un autre', (await ofStep(foreign, 2, foreignProject.body?.id)).body?.studies?.length === 0);
  const linkedSteps = (await owner('GET', stepsPath)).body?.steps?.map((x) => x.number);

  if (STATE) writeFileSync(STATE, JSON.stringify({ ...s, commentIds, linkedSteps, owner: ownerCredentials, headRevisionId: head.body.revision.id, initialRevisionId: created.body.revision.id, documentSha256: digest(head.body.revision.document), variantIds: expectedOrder, revisionIds: ids, exportStudy: { studyId: ev.studyId, variantId: ev.variantId, svgSha256: digest(svg.text) } }), { mode: 0o600 });
}
if (failures) { console.log(`${failures} vérification(s) en échec`); process.exit(1); }
console.log(`Studio (${PHASE}) : toutes les vérifications réussies.`);
