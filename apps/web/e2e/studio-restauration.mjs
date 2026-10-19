/**
 * Recette de restauration des données Studio (R.1-02 / R.2-01) par le chemin de restauration existant : « Sauvegarder
 * projet JSON » (GET /projects/:id/archive) dans la base A, puis « Importer projet JSON » (POST /projects/import) dans
 * une base B neuve servie par une seconde API. Projet synthétique : une étude, deux variantes (la seconde dérivée),
 * plusieurs révisions (mur avec ouverture, ouverture modifiée, ligne et rectangle), commentaire et réponse, observation
 * et son journal, lien vers des étapes du Parcours, publication diffusée (paquet SVG / DXF / IFC / PDF), membre éditeur,
 * préférences d'outils. Vérifie : manifeste de la section Studio, chaque document de révision identique octet pour
 * octet (JSON canonique et texte jsonb), historique et journaux intacts, fichiers du paquet identiques, droits repris,
 * déclencheur d'immuabilité toujours actif dans B, réouverture dans le navigateur ; puis lance l'outil de comparaison
 * (scripts/validation/studio-compare-restore.mjs) et exige 0 anomalie. Contrôles négatifs : archive altérée refusée
 * sans rien créer (422 archive_studio), réimport dans la base d'origine sans écrasement (réserve).
 * Signature (décision du développeur principal) : archive intacte signée par la clé partagée → auteurs et approbations
 * conservés ; archive d'un second projet falsifiée avec manifeste recalculé, importée par l'éditeur depuis la page
 * Projets → import permis, réserve affichée, tout acteur = compte qui restaure, publication diffusée remise « à relire »,
 * droits non repris, nouvelle approbation exigée ; API B relancée sans clé d'environnement → clé propre à la base,
 * archive de A « clé inconnue ». Comptes cités dans les champs JSON : un troisième projet (référence partenaire
 * acceptée) restauré par son archive signée → l'acceptant (`par`) désigne le compte de B retrouvé par son adresse.
 *
 *   ARCHIVE_SIGNING_KEY=… (la même que l'API A) BASE_URL=http://localhost:3001 DATABASE_URL_A=postgresql://… DATABASE_URL_B=postgresql://… \
 *   [RESTORE_PORT=3002] [WEB_DIST=apps/web/dist] [OUT=dossier] node apps/web/e2e/studio-restauration.mjs
 * La base B doit être migrée (npm run db:migrate) et vide de comptes de la recette ; l'API B est démarrée puis arrêtée
 * par la recette (par son PID), deux fois (avec puis sans ARCHIVE_SIGNING_KEY).
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright';
import { TABLES, canonicalJson, keyOf, sha256 } from '../../../scripts/validation/studio-compare-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const DB_A = process.env.DATABASE_URL_A ?? process.env.DATABASE_URL;
const DB_B = process.env.DATABASE_URL_B;
const OUT = process.env.OUT ?? path.join(ROOT, 'atelier-captures', 'studio-restauration');
if (!DB_A || !DB_B) { console.error('DATABASE_URL_A (ou DATABASE_URL) et DATABASE_URL_B sont requis.'); process.exit(2); }
// Même clé de signature pour l'API A (lancée hors de la recette) et l'API B (lancée ici) : « ce serveur » au sens de
// la vérification. Jamais affichée.
const SIGNING_KEY = process.env.ARCHIVE_SIGNING_KEY ?? '';
if (!SIGNING_KEY) { console.error('ARCHIVE_SIGNING_KEY est requise (la même que celle de l\'API A).'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ ${label}`);
  else { failures += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function client(base) {
  let cookie = '';
  const call = async (method, p, body, raw = false) => {
    const res = await fetch(`${base}${p}`, {
      method, headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    if (raw) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  return call;
}
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const short = (x) => JSON.stringify(x).slice(0, 300);
const credentials = (role) => ({ email: `restauration-${role}-${randomUUID().replaceAll('-', '').slice(0, 16)}@example.test`, password: randomBytes(18).toString('hex') });

// --- Base A : projet Studio synthétique -------------------------------------------------------------------------
const accounts = { owner: credentials('proprietaire'), editor: credentials('editeur') };
const ownerA = client(BASE), editorA = client(BASE);
check('A : propriétaire inscrit', (await ownerA('POST', '/auth/register', accounts.owner)).status === 201);
check('A : éditeur inscrit', (await editorA('POST', '/auth/register', accounts.editor)).status === 201);
const project = await ownerA('POST', '/projects', { code: `RST_${randomUUID().slice(0, 8)}`, name: 'Studio — restauration (recette synthétique)' });
check('A : projet créé', project.status === 201, String(project.status));
const pA = project.body.id;
check('A : éditeur invité (droits)', (await ownerA('POST', `/projects/${pA}/members`, { email: accounts.editor.email, role: 'editeur' })).status === 201);
check('A : préférences d\'outils du propriétaire', (await ownerA('PUT', `/projects/${pA}/studio/preferences/outils`, { profil: 'metier:cotation', favoris: ['studio.dessin.cote', 'studio.dessin.ligne'], personnel: ['studio.dessin.arc'] })).status === 200);

const root = `/projects/${pA}/studio`;
const study = await ownerA('POST', `${root}/studies`, { name: 'Étude restaurée' });
check('A : étude créée', study.status === 201, String(study.status));
const studyId = study.body.study.id, v1 = study.body.variant.id;
const vPath = (v) => `${root}/studies/${studyId}/variants/${v}`;
const heads = { [v1]: study.body.revision.id };
async function send(who, v, commands) {
  const r = await who('POST', `${vPath(v)}/commands`, { contractVersion: 'studio-commands/1', requestId: `rst-${randomUUID()}`, baseRevisionId: heads[v], commands });
  if (r.status === 200) heads[v] = r.body.revision.id;
  return r;
}
const mur = { id: 'mur-rst', type: 'wall', axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: 'center' };
const ouverture = { id: 'ouv-rst', type: 'opening', hostId: 'mur-rst', position: 2.5, width: 1, height: 2.1, sill: 0 };
const r1 = await send(ownerA, v1, [{ toolId: 'studio.architecture.mur', params: mur }, { toolId: 'studio.architecture.ouverture', params: ouverture }]);
check('A : révision 1 — mur et ouverture', r1.status === 200 && r1.body.revision.document.architecture?.length === 2, short(r1.body));
const r2 = await send(editorA, v1, [{ toolId: 'studio.architecture.modifier', params: { ...ouverture, width: 1.2 } }]);
check('A : révision 2 — ouverture élargie par l\'éditeur', r2.status === 200, short(r2.body));
const r3 = await send(ownerA, v1, [
  { toolId: 'studio.dessin.ligne', params: { id: 'ligne-rst', type: 'line', start: { x: 0, y: 2 }, end: { x: 6, y: 2 } } },
  { toolId: 'studio.dessin.rectangle', params: { id: 'rect-rst', type: 'rectangle', origin: { x: 1, y: 3 }, width: 2, height: 1 } },
]);
check('A : révision 3 — ligne et rectangle', r3.status === 200 && r3.body.revision.document.objects.length === 2, short(r3.body));
const v2r = await ownerA('POST', `${root}/studies/${studyId}/variants`, { name: 'Variante dérivée', fromVariantId: v1, fromRevisionId: r2.body.revision.id });
check('A : seconde variante dérivée de la révision 2', v2r.status === 201, short(v2r.body));
const v2 = v2r.body.variant.id;
heads[v2] = v2r.body.revision.id;
const r4 = await send(editorA, v2, [{ toolId: 'studio.dessin.rectangle', params: { id: 'rect-b', type: 'rectangle', origin: { x: 0, y: 4 }, width: 3, height: 1.5 } }]);
check('A : révision sur la seconde variante', r4.status === 200, short(r4.body));

const comments = `${vPath(v1)}/comments`;
const remark = await editorA('POST', comments, { body: 'Rectangle à décaler', objectIds: ['rect-rst'], revisionId: r3.body.revision.id });
const reply = await ownerA('POST', comments, { body: 'Vu, à reprendre', parentId: remark.body?.id });
check('A : commentaire ancré et réponse', remark.status === 201 && reply.status === 201, short([remark.body, reply.body]));
const participants = (await ownerA('GET', comments)).body?.participants ?? [];
const editorIdA = participants.find((p) => p.email === accounts.editor.email)?.id;
const promoted = await editorA('POST', `${comments}/${remark.body.id}/observation`, { responsableId: editorIdA, echeance: '2026-12-31', note: 'À corriger avant diffusion' });
check('A : commentaire promu en observation (responsable : éditeur)', promoted.status === 201, short(promoted.body));
const r5 = await send(editorA, v1, [{ toolId: 'studio.dessin.deplacer', params: { id: 'rect-rst', dx: 0.5, dy: 0 } }]);
check('A : révision 4 de la variante initiale — rectangle décalé', r5.status === 200, short(r5.body));
const fixed = await editorA('POST', `${comments}/${remark.body.id}/observation/transitions`, { action: 'corriger', revisionId: r5.body.revision.id, note: 'Corrigé' });
check('A : observation corrigée (journal à deux passages)', fixed.status === 200 && fixed.body.journal?.length === 2, short(fixed.body));
// Lot E.1 : un jeu d'exigences (version 1, saisi et sourcé pour la recette) et un contrôle de la tête de la variante.
const exigenceObjets = { id: 'ex-objets', libelle: 'Nombre d\'objets dessinés', metrique: { type: 'nombre' }, comparaison: '>=', valeur: 1, unite: 'u', source: 'Programme de recette, saisi' };
const setA = await ownerA('POST', `${root}/studies/${studyId}/exigences`, { baseVersion: 0, exigences: [exigenceObjets], motif: 'Jeu de recette' });
const checkA = await editorA('POST', `${vPath(v1)}/controles`, {});
check('A : jeu d\'exigences (version 1) et contrôle de la tête enregistrés', setA.status === 201 && setA.body.version === 1 && checkA.status === 201 && checkA.body.version === 1 && checkA.body.revisionId === heads[v1] && /^[0-9a-f]{64}$/.test(checkA.body.documentHash ?? ''), short([setA.body, checkA.body]));
check('A : étude liée aux étapes 3 et 7 du Parcours',(await ownerA('PUT', `${root}/studies/${studyId}/steps`, { steps: [3, 7] })).status === 200);

const pubs = `${root}/studies/${studyId}/publications`;
const pub = await editorA('POST', `${vPath(v1)}/publications`, { title: 'Dossier restauré' });
await editorA('POST', `${pubs}/${pub.body.id}/soumettre`, { comment: 'Pour revue' });
// Lot E.4 : l'éditeur prépare et soumet, le propriétaire approuve (empreinte du manifeste examiné) et diffuse.
await ownerA('POST', `${pubs}/${pub.body.id}/approuver`, { manifestHash: pub.body.manifestHash });
const diffused = await ownerA('POST', `${pubs}/${pub.body.id}/diffuser`, { comment: 'Diffusion' });
check('A : publication diffusée, paquet de quatre fichiers', diffused.status === 200 && diffused.body.diffusion?.files?.length === 4, short(diffused.body));
const filesA = {};
for (const f of diffused.body.diffusion.files) filesA[f.format] = (await ownerA('GET', `${pubs}/${pub.body.id}/files/${f.format}`, undefined, true)).bytes;
// Lot E.4 : remplacement (action « remplacer », dossier lié) et actualisation du manifeste (action « actualiser »).
const pubR = await editorA('POST', `${vPath(v1)}/publications`, { title: 'Dossier remplaçant' });
await editorA('POST', `${pubs}/${pubR.body.id}/soumettre`, {});
await ownerA('POST', `${pubs}/${pubR.body.id}/approuver`, { manifestHash: pubR.body.manifestHash });
const diffR = await ownerA('POST', `${pubs}/${pubR.body.id}/diffuser`, { comment: 'Remplace le dossier restauré' });
const replacedA = (await ownerA('GET', `${pubs}/${pub.body.id}`)).body;
check('A : seconde diffusion — premier dossier remplacé (diffusion « remplace », action « remplacer », dossier lié)', diffR.body?.diffusionStatus === 'diffuse' && replacedA?.diffusionStatus === 'remplace' && replacedA.replacedBy === pubR.body.id && replacedA.events?.at(-1)?.action === 'remplacer' && replacedA.events.at(-1).relatedPublicationId === pubR.body.id, short(replacedA));
const pubU = await editorA('POST', `${vPath(v1)}/publications`, { title: 'Dossier à actualiser' });
check('A : étude renommée (manifeste du brouillon périmé)', (await ownerA('PATCH', `${root}/studies/${studyId}`, { name: 'Étude restaurée (renommée)' })).status === 200);
const updU = await editorA('POST', `${pubs}/${pubU.body.id}/actualiser`, { comment: 'Nom de l\'étude changé' });
check('A : manifeste actualisé (action « actualiser », nouvelle empreinte)', updU.status === 200 && updU.body.manifestHash !== pubU.body.manifestHash && updU.body.events?.at(-1)?.action === 'actualiser', short(updU.body));

// Second projet (archive falsifiée plus bas) : révision et commentaire de l'éditeur, observation confiée à l'éditeur,
// publication préparée par l'éditeur, approuvée par le propriétaire, diffusée par le propriétaire (lot E.4).
const project2 = await ownerA('POST', '/projects', { code: `RSF_${randomUUID().slice(0, 8)}`, name: 'Studio — archive falsifiée (recette synthétique)' });
const p2 = project2.body?.id;
await ownerA('POST', `/projects/${p2}/members`, { email: accounts.editor.email, role: 'editeur' });
const study2 = await ownerA('POST', `/projects/${p2}/studio/studies`, { name: 'Étude falsifiée' });
const s2 = study2.body?.study?.id, w2 = study2.body?.variant?.id;
const v2Path = `/projects/${p2}/studio/studies/${s2}/variants/${w2}`;
const f1 = await editorA('POST', `${v2Path}/commands`, { contractVersion: 'studio-commands/1', requestId: `rst-${randomUUID()}`, baseRevisionId: study2.body?.revision?.id, commands: [{ toolId: 'studio.architecture.mur', params: mur }, { toolId: 'studio.dessin.ligne', params: { id: 'ligne-f', type: 'line', start: { x: 0, y: 2 }, end: { x: 3, y: 2 } } }] });
const fRemark = await editorA('POST', `${v2Path}/comments`, { body: 'Remarque de l\'éditeur', objectIds: ['ligne-f'], revisionId: f1.body?.revision?.id });
const editorIdA2 = ((await ownerA('GET', `${v2Path}/comments`)).body?.participants ?? []).find((p) => p.email === accounts.editor.email)?.id;
const fObs = await editorA('POST', `${v2Path}/comments/${fRemark.body?.id}/observation`, { responsableId: editorIdA2 });
// Exigence reprise d'une référence partenaire, acceptée par le propriétaire (qui, quand : version 2), puis contrôlée.
const set2 = await ownerA('POST', `/projects/${p2}/studio/studies/${s2}/exigences`, { baseVersion: 0, exigences: [{ ...exigenceObjets, id: 'ex-partenaire', source: 'Référence partenaire de recette', origine: { reference: 'Partenaire R-12' } }] });
const acc2 = await ownerA('POST', `/projects/${p2}/studio/studies/${s2}/exigences/acceptations`, { baseVersion: 1, exigenceId: 'ex-partenaire' });
const check2 = await editorA('POST', `${v2Path}/controles`, {});
check('A : second projet — référence partenaire acceptée (version 2, qui et quand) et contrôlée', set2.status === 201 && acc2.status === 201 && acc2.body.version === 2 && acc2.body.exigences?.[0]?.origine?.acceptation?.parEmail === accounts.owner.email && check2.status === 201 && check2.body.version === 2, short([set2.body, acc2.body, check2.body]));
const pubs2 = `/projects/${p2}/studio/studies/${s2}/publications`;
const fPub = await editorA('POST', `${v2Path}/publications`, { title: 'Dossier falsifié' });
await editorA('POST', `${pubs2}/${fPub.body?.id}/soumettre`, {});
await ownerA('POST', `${pubs2}/${fPub.body?.id}/approuver`, { manifestHash: fPub.body?.manifestHash });
const fDiff = await ownerA('POST', `${pubs2}/${fPub.body?.id}/diffuser`, {});
check('A : second projet — révision, commentaire et observation de l\'éditeur, publication approuvée par le propriétaire et diffusée', f1.status === 200 && fRemark.status === 201 && fObs.status === 201 && fDiff.status === 200 && fDiff.body.status === 'diffuse', short([f1.status, fRemark.status, fObs.status, fDiff.body]));
const files2 = {};
for (const f of fDiff.body?.diffusion?.files ?? []) files2[f.format] = (await ownerA('GET', `${pubs2}/${fPub.body.id}/files/${f.format}`, undefined, true)).bytes;
const archive2 = (await ownerA('GET', `/projects/${p2}/archive`)).body;

// Troisième projet (archive intacte, signée) : référence partenaire acceptée par le propriétaire. Après restauration
// vérifiée dans B, l'acceptant (`par`, champ JSON du jeu d'exigences) doit désigner le compte de B, pas celui de A.
const project3 = await ownerA('POST', '/projects', { code: `RSJ_${randomUUID().slice(0, 8)}`, name: 'Studio — acceptation restaurée (recette synthétique)' });
const p3 = project3.body?.id;
const study3 = await ownerA('POST', `/projects/${p3}/studio/studies`, { name: 'Étude acceptation' });
const s3 = study3.body?.study?.id;
await ownerA('POST', `/projects/${p3}/studio/studies/${s3}/exigences`, { baseVersion: 0, exigences: [{ ...exigenceObjets, id: 'ex-partenaire-3', source: 'Référence partenaire de recette', origine: { reference: 'Partenaire R-13' } }] });
const acc3 = await ownerA('POST', `/projects/${p3}/studio/studies/${s3}/exigences/acceptations`, { baseVersion: 1, exigenceId: 'ex-partenaire-3' });
const parA3 = acc3.body?.exigences?.[0]?.origine?.acceptation?.par;
check('A : troisième projet — référence partenaire acceptée par le propriétaire (par = compte de A)', acc3.status === 201 && typeof parA3 === 'string' && acc3.body.exigences[0].origine.acceptation.parEmail === accounts.owner.email, short(acc3.body));
const archive3 = (await ownerA('GET', `/projects/${p3}/archive`)).body;
check('sauvegarde (troisième projet) : l\'acceptant figure parmi les comptes cités, avec son adresse', archive3?.studio?.accounts?.some((a) => a.id === parA3 && a.email === accounts.owner.email), short(archive3?.studio?.accounts));

/**
 * Archive falsifiée « proprement » : contenu modifié (texte d'un commentaire, auteur de la révision attribué au
 * propriétaire) puis manifeste recalculé selon la règle publique — l'intégrité passe, seule la signature échoue.
 */
function forge(raw) {
  const a = JSON.parse(JSON.stringify(raw));
  const t = a.studio.tables;
  t.studio_comments[0].body = 'Remarque réécrite hors de Fadi';
  for (const r of t.studio_revisions) r.author_id = a.studio.ownerId;
  const sorted = (name) => [...t[name]].sort((x, y) => (keyOf(name, x) < keyOf(name, y) ? -1 : keyOf(name, x) > keyOf(name, y) ? 1 : 0));
  const perTable = Object.fromEntries(TABLES.map((name) => [name, { count: t[name].length, hash: sha256(canonicalJson(sorted(name))) }]));
  const accountsSorted = [...a.studio.accounts].map((x) => ({ id: x.id, email: x.email })).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  a.studio.manifest.tables = perTable;
  a.studio.manifest.hash = sha256(canonicalJson({ tables: perTable, sourceProjectId: a.studio.sourceProjectId, ownerId: a.studio.ownerId, accounts: accountsSorted }));
  return a;
}
const forged = forge(archive2);
fs.writeFileSync(path.join(OUT, 'archive-falsifiee.json'), JSON.stringify(forged));

// --- Sauvegarde ------------------------------------------------------------------------------------------------
const archiveRes = await ownerA('GET', `/projects/${pA}/archive`, undefined, true);
const archiveText = archiveRes.bytes.toString('utf8');
const archive = JSON.parse(archiveText);
fs.writeFileSync(path.join(OUT, 'archive.json'), archiveText);
const st = archive.studio;
const counts = st ? Object.fromEntries(Object.entries(st.manifest.tables).map(([t, m]) => [t, m.count])) : {};
check('sauvegarde : section Studio présente (schéma, version, manifeste)', archiveRes.status === 200 && st?.schema === 'fadi-studio-archive/1' && st.schemaVersion?.document === 'studio-document/1' && /^[0-9a-f]{64}$/.test(st.manifest?.hash ?? ''), short(st?.manifest ?? archive).slice(0, 200));
check('sauvegarde : effectifs du manifeste (1 étude, 2 variantes, 7 révisions, 2 commentaires, 1 observation, 2 passages, 2 liens, 3 publications, 11 évènements, au moins 4 volumes, 1 jeu d\x27exigences, 1 contrôle, 1 membre, 1 préférence)',
  counts.studio_studies === 1 && counts.studio_variants === 2 && counts.studio_revisions === 7 && counts.studio_comments === 2 && counts.studio_observations === 1 && counts.studio_observation_events === 2
  && counts.studio_study_steps === 2 && counts.studio_requirement_sets === 1 && counts.studio_requirement_checks === 1 && counts.studio_publications === 3 && counts.studio_publication_events === 11 && counts.volumes >= 4 && counts.project_members === 1 && counts.studio_tool_preferences === 1, JSON.stringify(counts));
// Chaque dossier est retrouvé par son identifiant : les lignes de l'archive sont triées par identifiant (aléatoire), la
// position d'un dossier parmi les trois n'a aucun sens.
{
  const rowOf = (id) => st?.tables.studio_publications.find((p) => p.id === id);
  const expected = [
    { id: pub.body.id, documentHash: pub.body.documentHash, manifestHash: pub.body.manifestHash, packageHash: diffused.body.diffusion.packageHash },
    { id: pubR.body.id, documentHash: pubR.body.documentHash, manifestHash: pubR.body.manifestHash, packageHash: diffR.body.diffusion.packageHash },
    { id: pubU.body.id, documentHash: updU.body.documentHash, manifestHash: updU.body.manifestHash, packageHash: null },
  ];
  const got = expected.map((e) => { const r = rowOf(e.id); return { id: e.id, documentHash: r?.document_hash, manifestHash: r?.manifest_hash, packageHash: r?.package_hash ?? null }; });
  check('sauvegarde : empreintes du document, du manifeste et du paquet de chacun des trois dossiers conformes', st?.tables.studio_publications.length === 3 && JSON.stringify(got) === JSON.stringify(expected), short({ expected, got }));
}

check('sauvegarde : archive signée (HMAC-SHA256, clé de l\'environnement désignée par son identifiant, clé absente du fichier)', st?.signature?.algorithm === 'HMAC-SHA256' && /^env-[0-9a-f]{16}$/.test(st.signature.keyId ?? '') && /^[0-9a-f]{64}$/.test(st.signature.value ?? '') && !archiveText.includes(SIGNING_KEY), short(st?.signature));

// --- Base B : API neuve, comptes recréés, restauration --------------------------------------------------------
const RESTORE_PORT = Number(process.env.RESTORE_PORT ?? 3002);
const BASE_B = `http://localhost:${RESTORE_PORT}`;
let apiB = null;
/** API B sur la base B, avec la clé partagée (même « serveur » que A) ou sans (clé propre à la base B). */
async function startB(withKey) {
  const log = fs.openSync(path.join(OUT, withKey ? 'api-b.log' : 'api-b-sans-cle.log'), 'w');
  const env = { ...process.env, PORT: String(RESTORE_PORT), DATABASE_URL: DB_B, WEB_ORIGIN: BASE_B, AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT ?? '500', API_RATE_LIMIT: process.env.API_RATE_LIMIT ?? '5000' };
  if (!withKey) delete env.ARCHIVE_SIGNING_KEY;
  apiB = spawn(process.execPath, [path.join(ROOT, 'apps/api/dist/server.js')], { cwd: ROOT, stdio: ['ignore', log, log], env });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    ready = await fetch(`${BASE_B}/health`).then((r) => r.ok, () => false);
  }
  check(`B : API de restauration démarrée ${withKey ? 'avec la clé partagée' : 'sans ARCHIVE_SIGNING_KEY'} (PID ${apiB.pid}, port ${RESTORE_PORT})`, ready);
}
async function stopB() {
  if (!apiB || apiB.exitCode !== null) return;
  const exited = new Promise((r) => apiB.once('exit', r));
  process.kill(apiB.pid, 'SIGTERM');
  await exited;
}
await startB(true);

const pgA = new pg.Client({ connectionString: DB_A });
const pgB = new pg.Client({ connectionString: DB_B });
await pgA.connect(); await pgB.connect();
let pB = null;
let pForged = null;
let compareExit = null;
try {
  const ownerB = client(BASE_B), editorB = client(BASE_B);
  check('B : propriétaire réinscrit (même adresse)', (await ownerB('POST', '/auth/register', accounts.owner)).status === 201);
  check('B : éditeur réinscrit (même adresse)', (await editorB('POST', '/auth/register', accounts.editor)).status === 201);

  // Contrôle négatif : section Studio altérée (document d'une révision modifié) → refus, rien n'est créé.
  const tampered = JSON.parse(archiveText);
  tampered.studio.tables.studio_revisions[0].document.objects = [{ id: 'intrus', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }];
  const before = (await ownerB('GET', '/projects')).body;
  const refused = await ownerB('POST', '/projects/import', JSON.stringify(tampered));
  const after = (await ownerB('GET', '/projects')).body;
  check('B : archive altérée refusée (422 archive_studio), aucun projet créé', refused.status === 422 && refused.body?.error === 'archive_studio' && JSON.stringify(before) === JSON.stringify(after), `${refused.status} ${short(refused.body)}`);

  const imported = await ownerB('POST', '/projects/import', archiveText);
  check('B : restauration par « Importer projet JSON » (201)', imported.status === 201 && imported.body.projects?.length === 1, `${imported.status} ${short(imported.body)}`);
  pB = imported.body.projects?.[0]?.id;
  const warnings = imported.body.projects?.[0]?.warnings ?? [];
  check('B : aucune réserve Studio (comptes retrouvés par adresse, aucun écrasement)', !warnings.some((w) => /Studio|Droits|rien n'en est cru/.test(w)), JSON.stringify(warnings));
  check('B : archive intacte signée par la clé partagée → signature vérifiée', imported.body.projects?.[0]?.studio?.trust === 'verifiee' && imported.body.projects[0].studio.restored === true && imported.body.projects[0].studio.downgraded === 0, short(imported.body.projects?.[0]?.studio));
  // Archive signée du troisième projet : l'acceptation partenaire (`par`, dans le JSON du jeu) désigne un compte de B.
  {
    const imp3 = await ownerB('POST', '/projects/import', JSON.stringify(archive3));
    const p3B = imp3.body?.projects?.[0]?.id;
    const ex3 = (await ownerB('GET', `/projects/${p3B}/studio/studies/${s3}/exigences`)).body;
    const a3 = ex3?.courante?.exigences?.[0]?.origine?.acceptation;
    const userB = a3?.par ? (await pgB.query('SELECT id, email FROM users WHERE id = $1', [a3.par])).rows[0] : null;
    const ownerIdB = (await pgB.query('SELECT id FROM users WHERE lower(email) = lower($1)', [accounts.owner.email])).rows[0]?.id;
    const dbSets = (await pgB.query("SELECT version, requirements::text AS r FROM studio_requirement_sets WHERE study_id = $1 ORDER BY version", [s3])).rows;
    check('B (signée) : acceptation partenaire restaurée — `par` désigne un compte existant de B (le propriétaire), plus le compte de A ; adresse conservée ; aucune réserve',
      imp3.status === 201 && imp3.body.projects[0].studio?.trust === 'verifiee' && imp3.body.projects[0].studio.restored === true
      && a3?.par === ownerIdB && userB?.id === ownerIdB && a3.par !== parA3 && a3.parEmail === accounts.owner.email
      && dbSets.length === 2 && dbSets.every((x) => !x.r.includes(parA3)) && !(imp3.body.projects[0].warnings ?? []).some((w) => /Exigences|Studio|rien n'en est cru/.test(w)),
      short({ status: imp3.status, studio: imp3.body?.projects?.[0]?.studio, warnings: imp3.body?.projects?.[0]?.warnings, a3, ownerIdB, parA3 }));
    const ctl3 = await ownerB('POST', `/projects/${p3B}/studio/studies/${s3}/variants/${study3.body?.variant?.id}/controles`, {});
    check('B (signée) : la référence acceptée reste utilisée par un nouveau contrôle (version 2)', ctl3.status === 201 && ctl3.body.version === 2 && ['satisfaite', 'non-satisfaite'].includes(ctl3.body.resultat?.ecarts?.[0]?.statut), short(ctl3.body));
  }
  {
    const histB = (await ownerB('GET', `/projects/${pB}/studio/studies/${studyId}/variants/${v1}/revisions`)).body?.revisions ?? [];
    const partsB = (await ownerB('GET', `/projects/${pB}/studio/studies/${studyId}/variants/${v1}/comments`)).body?.participants ?? [];
    const idB = (email) => partsB.find((p) => p.email === email)?.id;
    const authorOf = (id) => histB.find((x) => x.id === id)?.authorId;
    const pubB = (await ownerB('GET', `/projects/${pB}/studio/studies/${studyId}/publications/${pub.body.id}`)).body;
    check('B (signée) : auteurs conservés — révision 1 du propriétaire, révision 2 de l\'éditeur ; dossier préparé par l\'éditeur, approuvé (manifeste) et diffusé par le propriétaire',
      authorOf(r1.body.revision.id) === idB(accounts.owner.email) && authorOf(r2.body.revision.id) === idB(accounts.editor.email) && idB(accounts.owner.email) !== idB(accounts.editor.email)
      && pubB?.status === 'diffuse' && pubB.workStatus === 'approuve' && pubB.diffusionStatus === 'remplace' && pubB.replacedBy === pubR.body.id && pubB.approval?.by?.email === accounts.owner.email && pubB.approval?.manifestHash === pub.body.manifestHash
      && pubB.diffusion?.by?.email === accounts.owner.email && pubB.createdBy?.email === accounts.editor.email, short({ histB, pub: pubB?.approval }));
  }

  // Documents de révision : identiques octet pour octet (JSON canonique via l'API, texte jsonb dans la base).
  const rootB = `/projects/${pB}/studio`;
  const vPathB = (v) => `${rootB}/studies/${studyId}/variants/${v}`;
  for (const v of [v1, v2]) {
    const ha = (await ownerA('GET', `${vPath(v)}/revisions`)).body?.revisions ?? [];
    const hb = (await ownerB('GET', `${vPathB(v)}/revisions`)).body?.revisions ?? [];
    const strip = (list) => list.map((x) => ({ id: x.id, parentRevisionId: x.parentRevisionId, source: x.source, createdAt: x.createdAt }));
    check(`historique de la variante ${v === v1 ? 'initiale' : 'dérivée'} intact (identifiants, parents, sources, dates : ${ha.length} révisions)`, ha.length > 1 && JSON.stringify(strip(ha)) === JSON.stringify(strip(hb)), short({ a: strip(ha), b: strip(hb) }));
    let same = 0;
    for (const rev of ha) {
      const da = (await ownerA('GET', `${vPath(v)}/revisions/${rev.id}`)).body?.revision?.document;
      const db = (await ownerB('GET', `${vPathB(v)}/revisions/${rev.id}`)).body?.revision?.document;
      if (da && db && canonical(da) === canonical(db) && sha(canonical(da)) === sha(canonical(db))) same += 1;
    }
    check(`documents de révision identiques (variante ${v === v1 ? 'initiale' : 'dérivée'}) : ${same}/${ha.length}`, same === ha.length);
  }
  const textA = (await pgA.query("SELECT id, document::text AS doc, payload_hash, request_id FROM studio_revisions WHERE variant_id = ANY($1) ORDER BY id", [[v1, v2]])).rows;
  const textB = (await pgB.query("SELECT id, document::text AS doc, payload_hash, request_id FROM studio_revisions WHERE variant_id = ANY($1) ORDER BY id", [[v1, v2]])).rows;
  check(`base : texte jsonb des documents, empreintes et requestId identiques (${textA.length} révisions)`, textA.length === 7 && JSON.stringify(textA) === JSON.stringify(textB));

  // Commentaires, observation, liens d'étapes, publication, fichiers, droits.
  const ca = (await ownerA('GET', comments)).body?.comments ?? [];
  const cb = (await ownerB('GET', `${vPathB(v1)}/comments`)).body?.comments ?? [];
  const cview = (list) => list.map((c) => ({ id: c.id, body: c.body, parentId: c.parentId, revisionId: c.revisionId, objectIds: c.objectIds, createdAt: c.createdAt, author: c.authorEmail, journal: c.observation?.journal?.map((j) => [j.action, j.revisionId, j.note, j.at]) ?? null, statut: c.observation?.statut ?? null }));
  check('commentaires, réponse et journal d\'observation identiques', ca.length === 2 && JSON.stringify(cview(ca)) === JSON.stringify(cview(cb)), short({ a: cview(ca), b: cview(cb) }));
  const sb = (await ownerB('GET', `${rootB}/studies/${studyId}/steps`)).body;
  check('liens vers les étapes 3 et 7 du Parcours repris', JSON.stringify(sb?.steps?.map((x) => x.number)) === '[3,7]', short(sb));
  {
    const ea = (await ownerA('GET', `${root}/studies/${studyId}/exigences`)).body;
    const eb = (await ownerB('GET', `${rootB}/studies/${studyId}/exigences`)).body;
    const ca1 = (await ownerA('GET', `${vPath(v1)}/controles`)).body?.controles ?? [];
    const cb1 = (await ownerB('GET', `${vPathB(v1)}/controles`)).body?.controles ?? [];
    const strip = (x) => ({ ...x, studyId: undefined, auteur: undefined });
    check('exigences (version, contenu, auteur, date) et contrôle (révision, version, conclusion, empreinte, résultat) identiques',
      ea?.courante?.version === 1 && JSON.stringify(strip(ea.courante)) === JSON.stringify(strip(eb?.courante ?? {})) && ca1.length === 1 && JSON.stringify(ca1.map(strip)) === JSON.stringify(cb1.map(strip)), short({ ea: ea?.courante, eb: eb?.courante, ca1, cb1 }));
  }
  const pa = (await ownerA('GET', `${pubs}/${pub.body.id}`)).body;
  const pbv = (await ownerB('GET', `${rootB}/studies/${studyId}/publications/${pub.body.id}`)).body;
  const pview = (p) => ({ status: p?.status, workStatus: p?.workStatus, diffusionStatus: p?.diffusionStatus, manifestHash: p?.manifestHash, manifest: p?.manifest,
    approval: p?.approval && { ...p.approval, by: p.approval.by?.email }, replacement: p?.replacement && { ...p.replacement, by: p.replacement.by?.email },
    revisionId: p?.revisionId, documentHash: p?.documentHash, packageHash: p?.diffusion?.packageHash, files: p?.diffusion?.files,
    events: p?.events?.map((e) => [e.id, e.action, e.toStatus, e.workStatus, e.diffusionStatus, e.manifestHash, e.relatedPublicationId, e.author.email, e.comment, e.createdAt]) });
  check('publication, approbation, paquet et journal de publication identiques', JSON.stringify(pview(pa)) === JSON.stringify(pview(pbv)) && pbv?.events?.length === 5, short({ a: pview(pa), b: pview(pbv) }));
  let filesOk = 0;
  for (const f of diffused.body.diffusion.files) {
    const got = await ownerB('GET', `${rootB}/studies/${studyId}/publications/${pub.body.id}/files/${f.format}`, undefined, true);
    if (got.status === 200 && Buffer.compare(got.bytes, filesA[f.format]) === 0 && sha(got.bytes) === f.sha256) filesOk += 1;
  }
  check('fichiers figés du paquet identiques octet pour octet (SVG, DXF, IFC, PDF)', filesOk === 4, `${filesOk}/4`);
  const verif = (await ownerB('GET', `${rootB}/studies/${studyId}/publications/${pub.body.id}/verification`)).body;
  check('paquet recalculé dans B : empreintes identiques', verif?.identical === true, short(verif));
  const membersB = (await ownerB('GET', `/projects/${pB}/members`)).body;
  check('droits : l\'éditeur est membre éditeur du projet restauré', JSON.stringify(membersB).includes(accounts.editor.email) && /editeur/.test(JSON.stringify(membersB)), short(membersB));
  check('droits : l\'éditeur ouvre la variante dérivée du projet restauré', (await editorB('GET', `${vPathB(v2)}`)).status === 200);
  const prefsB = (await ownerB('GET', `${rootB}/preferences/outils`)).body;
  check('préférences d\'outils reprises', prefsB?.profil === 'metier:cotation' && JSON.stringify(prefsB.favoris) === '["studio.dessin.cote","studio.dessin.ligne"]', short(prefsB));


  // Immuabilité dans B : toute UPDATE d'une révision restaurée est refusée par le déclencheur.
  let immutable = '';
  try { await pgB.query('UPDATE studio_revisions SET request_id = request_id WHERE id = $1', [r1.body.revision.id]); immutable = 'acceptée'; } catch (e) { immutable = e.message; }
  check('immuabilité : UPDATE d\'une révision restaurée refusée (studio_revision_immutable)', /studio_revision_immutable/.test(immutable), immutable);

  // Outil de comparaison (R.1-03), avant toute écriture dans B : 0 anomalie exigée.
  const reportMd = path.join(OUT, 'studio-compare-restore.md');
  const reportJson = path.join(OUT, 'studio-compare-restore.json');
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/validation/studio-compare-restore.mjs'), '--a', DB_A, '--b', DB_B, '--project-a', pA, '--project-b', pB, '--out', reportMd, '--json', reportJson], { cwd: ROOT, encoding: 'utf8' });
    process.stdout.write(out.split('\n').map((l) => (l ? `   ${l}` : l)).join('\n'));
    compareExit = 0;
  } catch (e) {
    process.stdout.write(String(e.stdout ?? ''));
    compareExit = e.status ?? 1;
  }
  const report = fs.existsSync(reportJson) ? JSON.parse(fs.readFileSync(reportJson, 'utf8')) : null;
  check('outil de comparaison A / B : 0 anomalie (identifiants, empreintes, effectifs, déclencheurs, sonde d\'immuabilité)', compareExit === 0 && report?.anomalies === 0 && report.reports[0].probe?.refused === true, `sortie ${compareExit}, ${report?.anomalies} anomalie(s)`);

  // Après restauration, le travail reprend : nouvelle révision sur la tête restaurée.
  const afterRestore = await ownerB('POST', `${vPathB(v1)}/commands`, { contractVersion: 'studio-commands/1', requestId: `rst-${randomUUID()}`, baseRevisionId: r5.body.revision.id, commands: [{ toolId: 'studio.dessin.ligne', params: { id: 'apres', type: 'line', start: { x: 0, y: 6 }, end: { x: 1, y: 6 } } }] });
  check('B : nouvelle révision possible après restauration (parent = tête restaurée)', afterRestore.status === 200 && afterRestore.body.revision.parentRevisionId === r5.body.revision.id, short(afterRestore.body));
  // L'outil voit exactement cette écriture comme la seule différence (la comparaison n'est pas aveugle).
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/validation/studio-compare-restore.mjs'), '--a', DB_A, '--b', DB_B, '--project-a', pA, '--project-b', pB, '--json', path.join(OUT, 'studio-compare-apres-ecriture.json'), '--no-probe'], { cwd: ROOT, encoding: 'utf8' });
    check('outil de comparaison : la révision ajoutée dans B est signalée', false, 'aucune anomalie détectée');
  } catch {
    const after = JSON.parse(fs.readFileSync(path.join(OUT, 'studio-compare-apres-ecriture.json'), 'utf8'));
    const kinds = after.reports[0].anomalies.map((x) => `${x.kind}:${x.table}`);
    check('outil de comparaison : la révision ajoutée dans B est signalée (en trop, tête différente)', kinds.includes('en-trop:studio_revisions') && kinds.includes('differente:studio_variants'), JSON.stringify(kinds));
  }

  // Réouverture dans le navigateur (base B).
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE_B}/connexion`);
    await page.fill('input[name="email"]', accounts.owner.email);
    await page.fill('input[name="password"]', accounts.owner.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(accueil|projets)$/);
    await page.goto(`${BASE_B}/studio/projets/${pB}/etudes/${studyId}/variantes/${v1}`);
    await page.getByRole('toolbar', { name: 'Outils de dessin' }).waitFor();
    const wall = page.locator('svg [data-studio-architecture][data-studio-type="wall"]');
    await wall.first().waitFor({ state: 'attached' });
    const drawn = { wall: await wall.count(), opening: await page.locator('svg [data-studio-architecture][data-studio-type="opening"]').count(), objects: await page.locator('svg [data-studio-objet]').count() };
    check('navigateur : variante restaurée rouverte — mur, ouverture, ligne, rectangle et la ligne ajoutée', drawn.wall === 1 && drawn.opening === 1 && drawn.objects === 3, JSON.stringify(drawn));
    await page.screenshot({ path: path.join(OUT, 'variante-restauree.png') });
    await page.goto(`${BASE_B}/studio/projets/${pB}/etudes/${studyId}`);
    await page.locator(`[data-studio-etude="${studyId}"]`).waitFor();
    check('navigateur : page de l\'étude restaurée, deux variantes', (await page.locator('[data-studio-variantes] li').count()) === 2);
    check('navigateur : aucune erreur de page', errors.length === 0, errors.join(' | '));

    // Archive falsifiée (manifeste recalculé) importée par l'éditeur, depuis la page Projets : import permis, réserve
    // affichée, rien n'est cru.
    const ctxE = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageE = await ctxE.newPage();
    pageE.setDefaultTimeout(20000);
    await pageE.goto(`${BASE_B}/connexion`);
    await pageE.fill('input[name="email"]', accounts.editor.email);
    await pageE.fill('input[name="password"]', accounts.editor.password);
    await pageE.click('button[type="submit"]');
    await pageE.waitForURL(/\/(accueil|projets)$/);
    await pageE.goto(`${BASE_B}/projets`);
    await pageE.locator('.projects-heading input[type="file"]').setInputFiles({ name: 'archive-falsifiee.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)) });
    await pageE.waitForURL(/\/projets\/proj_[^/?]+\?module=parcours/);
    pForged = new URL(pageE.url()).pathname.split('/').pop();
    const toast = (await pageE.locator('.h7-toast').first().textContent({ timeout: 10000 }).catch(() => '')) ?? '';
    check('navigateur : archive falsifiée importée, réserve claire affichée (signature invalide, rien n\'en est cru, « à relire », auteurs d\'origine déclarés)',
      /Signature de l'archive invalide/.test(toast) && /rien n'en est cru/.test(toast) && /« à relire »/.test(toast) && /acceptation\(s\) de référence partenaire non reprise/.test(toast) && toast.includes(accounts.owner.email), toast.slice(0, 400));
    await pageE.screenshot({ path: path.join(OUT, 'import-archive-falsifiee.png') });
    await ctxE.close();
  } finally {
    await browser.close();
  }

  // Archive falsifiée restaurée : tout acteur est le compte qui restaure (l'éditeur), approbations retirées.
  {
    check('archive falsifiée : un projet restauré', typeof pForged === 'string' && pForged.startsWith('proj_'), String(pForged));
    const rootF = `/projects/${pForged}/studio/studies/${s2}`;
    const vF = `${rootF}/variants/${w2}`;
    const partsF = (await editorB('GET', `${vF}/comments`)).body;
    const editorIdB = partsF?.me?.id;
    const histF = (await editorB('GET', `${vF}/revisions`)).body?.revisions ?? [];
    check('archive falsifiée : toutes les révisions attribuées au compte qui restaure (y compris la révision « attribuée » au propriétaire par la falsification)', histF.length === 2 && histF.every((x) => x.authorId === editorIdB), short(histF));
    const commentsF = partsF?.comments ?? [];
    check('archive falsifiée : commentaire restauré (contenu tel quel), auteur = compte qui restaure, observation confiée au compte qui restaure', commentsF.length === 1 && commentsF[0].body === 'Remarque réécrite hors de Fadi' && commentsF.every((c) => c.authorEmail === accounts.editor.email) && commentsF[0].observation?.responsableId === editorIdB && commentsF[0].observation.journal.every((j) => j.actorId === editorIdB), short(commentsF));
    const pubF = (await editorB('GET', `${rootF}/publications/${fPub.body.id}`)).body;
    const evF = pubF?.events ?? [];
    check('archive falsifiée : publication diffusée remise « à relire » (soumise), approbation retirée, journal complété d\'un passage daté de la restauration',
      pubF?.status === 'soumis' && pubF.workStatus === 'en-revue' && pubF.diffusionStatus === 'non-diffuse' && pubF.approval === null && pubF.manifestHash === fPub.body.manifestHash && pubF.manifest !== null
      && evF.at(-1)?.workStatus === 'en-revue' && evF.at(-1)?.diffusionStatus === 'non-diffuse' && evF.at(-1)?.manifestHash === fPub.body.manifestHash && evF.length === 5 && evF.every((e) => e.author.email === accounts.editor.email) && evF.at(-1)?.action === 'soumettre' && evF.at(-1)?.fromStatus === 'diffuse' && /archive non vérifiée/.test(evF.at(-1)?.comment ?? ''), short({ status: pubF?.status, approval: pubF?.approval, ev: evF.map((e) => [e.action, e.fromStatus, e.toStatus, e.author.email]) }));
    let readable = 0;
    for (const f of fDiff.body.diffusion.files) {
      const got = await editorB('GET', `${rootF}/publications/${fPub.body.id}/files/${f.format}`, undefined, true);
      if (got.status === 200 && Buffer.compare(got.bytes, files2[f.format]) === 0) readable += 1;
    }
    check('archive falsifiée : contenu du paquet conservé et lisible (4/4 fichiers identiques)', readable === 4, `${readable}/4`);
    const membersF = (await editorB('GET', `/projects/${pForged}/members`)).body;
    {
      const exF = (await editorB('GET', `/projects/${pForged}/studio/studies/${s2}/exigences`)).body;
      const v1F = (await editorB('GET', `/projects/${pForged}/studio/studies/${s2}/exigences/versions/1`)).body;
      const ctlF = (await editorB('GET', `${vF}/controles`)).body?.controles ?? [];
      const ref = exF?.courante?.exigences?.[0];
      check('archive falsifiée : exigences reprises (2 versions, auteur = compte qui restaure), acceptation partenaire retirée (référence « non acceptée »), contrôle attribué au compte qui restaure',
        exF?.courante?.version === 2 && exF.versions.length === 2 && exF.versions.every((v) => v.auteurEmail === accounts.editor.email) && ref?.origine?.reference === 'Partenaire R-12' && ref.origine.acceptation === undefined
        && v1F?.version === 1 && ctlF.length === 1 && ctlF[0].auteurEmail === accounts.editor.email && ctlF[0].version === 2, short({ exF, ctlF }));
      const reaccept = await editorB('POST', `/projects/${pForged}/studio/studies/${s2}/exigences/acceptations`, { baseVersion: 2, exigenceId: 'ex-partenaire' });
      check('archive falsifiée : la référence est acceptée à nouveau par le propriétaire du projet restauré (version 3, qui et quand)', reaccept.status === 201 && reaccept.body.version === 3 && reaccept.body.exigences?.[0]?.origine?.acceptation?.parEmail === accounts.editor.email, short(reaccept.body));
      let immutableSet = '';
      try { await pgB.query('UPDATE studio_requirement_sets SET motif = motif WHERE study_id = $1', [s2]); immutableSet = 'acceptée'; } catch (e) { immutableSet = e.message; }
      check('archive falsifiée : versions du jeu restaurées toujours immuables (studio_requirement_set_immutable)', /studio_requirement_set_immutable/.test(immutableSet), immutableSet);
    }
    check('archive falsifiée : droits non repris (aucun membre ; le propriétaire d\'origine n\'a pas accès)', !JSON.stringify(membersF).includes(accounts.owner.email) && [403, 404].includes((await ownerB('GET', `/projects/${pForged}`)).status), short(membersF));
    check('archive falsifiée : diffusion refusée tant qu\'une nouvelle approbation manque (409 invalid_transition)', (await editorB('POST', `${rootF}/publications/${fPub.body.id}/diffuser`, {})).body?.error === 'invalid_transition');
    // Le nom du projet restauré (« · import ») périme le manifeste figé : le circuit E.4 complet est exigé.
    let cur = pubF;
    if (cur?.freshness === 'perimee') {
      cur = (await editorB('POST', `${rootF}/publications/${fPub.body.id}/actualiser`, { comment: 'Manifeste actualisé après restauration' })).body;
      cur = (await editorB('POST', `${rootF}/publications/${fPub.body.id}/soumettre`, {})).body;
    }
    const reapproved = await editorB('POST', `${rootF}/publications/${fPub.body.id}/approuver`, { manifestHash: cur?.manifestHash, comment: 'Relue après restauration' });
    const rediffused = await editorB('POST', `${rootF}/publications/${fPub.body.id}/diffuser`, {});
    check('archive falsifiée : nouvelle approbation (manifeste examiné) par le propriétaire du projet restauré, puis nouvelle diffusion', reapproved.status === 200 && reapproved.body.workStatus === 'approuve' && reapproved.body.approval?.by?.email === accounts.editor.email && rediffused.status === 200 && rediffused.body.diffusionStatus === 'diffuse' && rediffused.body.status === 'diffuse', short([reapproved.body, rediffused.body]));
  }

  // Contrôle négatif : réimport dans la base d'origine (identifiants déjà présents) → Studio non écrasé, réserve.
  const again = await ownerA('POST', '/projects/import', archiveText);
  const againWarnings = again.body?.projects?.[0]?.warnings ?? [];
  const copyId = again.body?.projects?.[0]?.id;
  const studiesOfCopy = copyId ? (await ownerA('GET', `/projects/${copyId}/studio/studies`)).body?.studies ?? null : null;
  check('A : réimport dans la base d\'origine — projet créé sans Studio, réserve explicite, original intact', again.status === 201 && againWarnings.some((w) => /Données Studio non restaurées/.test(w)) && Array.isArray(studiesOfCopy) && studiesOfCopy.length === 0 && (await ownerA('GET', vPath(v1))).body?.revision?.id === r5.body.revision.id, short(again.body));
  check('A : son propre export y est vérifié (même clé)', again.body?.projects?.[0]?.studio?.trust === 'verifiee', short(again.body?.projects?.[0]?.studio));

  // Sans ARCHIVE_SIGNING_KEY : clé propre à la base B, créée à la première signature ; une archive signée par la clé
  // de l'environnement y devient « clé inconnue », une archive signée par la base B y est vérifiée.
  await stopB();
  check('B : clé propre à la base absente avant le premier export sans clé d\'environnement', (await pgB.query('SELECT count(*)::int AS n FROM archive_signing_keys')).rows[0].n === 0);
  await startB(false);
  const archiveB = (await ownerB('GET', `/projects/${pB}/archive`)).body;
  const keyRows = (await pgB.query('SELECT id, length(secret) AS n FROM archive_signing_keys')).rows;
  const logB = fs.readFileSync(path.join(OUT, 'api-b-sans-cle.log'), 'utf8');
  const secretB = (await pgB.query('SELECT secret FROM archive_signing_keys')).rows[0]?.secret ?? '';
  check('B sans clé d\'environnement : archive signée par une clé propre à la base (identifiant db-…), clé créée une fois, jamais écrite dans l\'archive ni dans le journal',
    /^db-[0-9a-f]{16}$/.test(archiveB?.studio?.signature?.keyId ?? '') && keyRows.length === 1 && keyRows[0].n === 64 && !JSON.stringify(archiveB).includes(secretB) && !logB.includes(secretB) && !logB.includes(SIGNING_KEY), short({ keyId: archiveB?.studio?.signature?.keyId, keyRows }));
  const withDbKey = await ownerB('POST', '/projects/import', JSON.stringify(archiveB));
  check('B sans clé d\'environnement : sa propre archive est vérifiée (Studio non réimporté : identifiants présents)', withDbKey.status === 201 && withDbKey.body.projects[0].studio?.trust === 'verifiee' && withDbKey.body.projects[0].studio.restored === false, short(withDbKey.body));
  const withEnvKey = await ownerB('POST', '/projects/import', archiveText);
  check('B sans clé d\'environnement : l\'archive signée par la clé de A y est « clé inconnue » — rien n\'en est cru', withEnvKey.status === 201 && withEnvKey.body.projects[0].studio?.trust === 'inconnue' && withEnvKey.body.projects[0].warnings.some((w) => /clé inconnue de ce serveur/.test(w)), short(withEnvKey.body));
} finally {
  await pgA.end(); await pgB.end();
  await stopB();
}

fs.writeFileSync(path.join(OUT, 'resume.json'), JSON.stringify({ date: new Date().toISOString(), projetA: pA, projetB: pB, etude: studyId, variantes: [v1, v2], comparaison: compareExit, echecs: failures }, null, 2));
console.log(failures ? `❌ ${failures} contrôle(s) en échec` : '✅ restauration Studio vérifiée');
process.exit(failures ? 1 : 0);
