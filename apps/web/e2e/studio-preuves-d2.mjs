/**
 * Recette des preuves du groupe D2 (point 2 du rapprochement Studio), sur l'API réelle et PostgreSQL migré
 * (`npm run db:migrate`) :
 * - INV-012 [−] : le contenu d'une publication diffusée (paquet, manifeste, révision, empreinte, approbation) est
 *   refusé explicitement par la base à toute réécriture directe (déclencheur `studio_publication_package_frozen`), même
 *   par le rôle applicatif ; seules les dimensions restent modifiables ;
 * - INV-014 [−] : hors connexion, une approbation ou une diffusion tentée dans l'interface n'est jamais montrée
 *   approuvée ou diffusée (« Action non confirmée »), et le serveur n'a rien approuvé ni diffusé ; au retour du réseau, le dossier
 *   est relu dans son état serveur.
 * Comptes et projet synthétiques.
 *   BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://… node apps/web/e2e/studio-preuves-d2.mjs
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { inviterEtAccepter } from './lib-invitations.mjs';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const DB = process.env.DATABASE_URL;
if (!DB) { console.error('DATABASE_URL est requis (rôle applicatif de la base de recette).'); process.exit(2); }
let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ ${label}`);
  else { failures += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
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
  call.cookie = () => cookie;
  return call;
}
const credentials = () => ({ email: `d2-${randomUUID().replaceAll('-', '')}@example.test`, password: randomBytes(24).toString('hex') });
const short = (x) => JSON.stringify(x).slice(0, 300);

const owner = client(), editor = client();
const comptes = { owner: credentials(), editor: credentials() };
check('propriétaire inscrit', (await owner('POST', '/auth/register', comptes.owner)).status === 201);
check('éditeur inscrit', (await editor('POST', '/auth/register', comptes.editor)).status === 201);
const project = await owner('POST', '/projects', { code: `D2_${randomUUID().slice(0, 8)}`, name: 'Studio — preuves D2 (recette synthétique)' });
check('projet créé', project.status === 201, String(project.status));
const projectId = project.body?.id;
check('éditeur invité, invitation acceptée', (await inviterEtAccepter(owner, editor, projectId, comptes.editor.email, 'editeur')).ok);
const root = `/projects/${projectId}/studio`;
const study = await owner('POST', `${root}/studies`, { name: 'Étude des preuves D2' });
check('étude créée', study.status === 201, String(study.status));
const studyId = study.body.study.id, variantId = study.body.variant.id;
const variantPath = `${root}/studies/${studyId}/variants/${variantId}`;
const pubs = `${root}/studies/${studyId}/publications`;
const ligne = await editor('POST', `${variantPath}/commands`, { contractVersion: 'studio-commands/1', requestId: `d2-${randomUUID()}`, baseRevisionId: study.body.revision.id, commands: [{ toolId: 'studio.dessin.ligne', params: { id: 'l1', type: 'line', start: { x: 0, y: 0 }, end: { x: 4, y: 2 } } }] });
check('révision dessinée', ligne.status === 200, String(ligne.status));
const ensemble = (p) => ({ manifestHash: p.manifestHash, revisionId: p.revisionId, documentHash: p.documentHash });
/** Dossier dessin 2D préparé et soumis par l'éditeur (le propriétaire n'en est pas l'auteur). */
async function soumis(titre) {
  const c = await editor('POST', `${variantPath}/publications`, { title: titre, contenu: 'dessin-2d' });
  const s = await editor('POST', `${pubs}/${c.body?.id}/soumettre`, {});
  return s.status === 200 ? s.body : null;
}

// --- INV-012 : contenu d'une publication diffusée figé par la base -------------------------------------------------
const p1 = await soumis('Dossier diffusé');
check('INV-012 : dossier soumis', !!p1);
check('INV-012 : dossier approuvé par le propriétaire', (await owner('POST', `${pubs}/${p1.id}/approuver`, ensemble(p1))).status === 200);
const d1 = await owner('POST', `${pubs}/${p1.id}/diffuser`, {});
check('INV-012 : dossier diffusé (paquet figé)', d1.status === 200 && d1.body?.diffusionStatus === 'diffuse' && /^[0-9a-f]{64}$/.test(d1.body?.diffusion?.packageHash ?? ''), short(d1.body));
const base = new pg.Client({ connectionString: DB });
await base.connect();
const role = (await base.query('select current_user as u')).rows[0].u;
const tentatives = [
  ['paquet', "UPDATE studio_publications SET package = jsonb_set(package, '{revisionId}', '\"autre\"') WHERE id = $1"],
  ['empreinte du paquet', "UPDATE studio_publications SET package_hash = repeat('f', 64) WHERE id = $1"],
  ['manifeste', "UPDATE studio_publications SET manifest = jsonb_set(manifest, '{documents}', '[]') WHERE id = $1"],
  ['empreinte du manifeste', "UPDATE studio_publications SET manifest_hash = repeat('e', 64) WHERE id = $1"],
  ['révision examinée', "UPDATE studio_publications SET revision_id = $2 WHERE id = $1"],
  ['empreinte du document', "UPDATE studio_publications SET document_hash = repeat('d', 64) WHERE id = $1"],
  ["approbation", "UPDATE studio_publications SET approved_manifest_hash = repeat('c', 64) WHERE id = $1"],
];
for (const [nom, sql] of tentatives) {
  const params = sql.includes('$2') ? [p1.id, study.body.revision.id] : [p1.id];
  const err = await base.query(sql, params).then(() => null, (e) => e.message);
  check(`INV-012 [−] : publication diffusée, réécriture directe refusée par la base (${nom}, rôle ${role})`, err === 'studio_publication_package_immutable', String(err));
}
// Les dimensions restent modifiables (vérifié dans une transaction annulée : rien n'est gardé).
await base.query('BEGIN');
const dim = await base.query("UPDATE studio_publications SET updated_at = now() WHERE id = $1", [p1.id]).then((r) => r.rowCount, (e) => e.message);
await base.query('ROLLBACK');
check('INV-012 : une mise à jour qui ne touche pas le contenu figé reste admise (transaction annulée)', dim === 1, String(dim));
await base.end();
const relu = (await owner('GET', `${pubs}/${p1.id}`)).body;
check('INV-012 : publication relue identique (paquet, manifeste, révision, approbation)',
  relu?.diffusion?.packageHash === d1.body.diffusion.packageHash && relu.manifestHash === p1.manifestHash && relu.revisionId === p1.revisionId && relu.approval?.manifestHash === p1.manifestHash, short(relu));
const verif = (await owner('GET', `${pubs}/${p1.id}/verification`)).body;
check('INV-012 : paquet toujours vérifiable (documents identiques au manifeste approuvé)', verif?.identical === true && verif.manifestHash === p1.manifestHash, short(verif));

// --- INV-014 : hors connexion, ni approbation ni diffusion n'est montrée faite ---------------------------------------
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* Playwright absent */ }
const shell = await fetch(`${BASE}/projets/${projectId}`).then((r) => r.text()).catch(() => '');
if (chromium && /<div id="root"/.test(shell)) {
  const p2 = await soumis('Dossier à approuver hors ligne');
  const p3 = await soumis('Dossier à diffuser hors ligne');
  check('INV-014 : deux dossiers soumis', !!p2 && !!p3);
  check('INV-014 : le second est approuvé (en ligne, par l\'API)', (await owner('POST', `${pubs}/${p3.id}/approuver`, ensemble(p3))).status === 200);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  const ctx = await browser.newContext();
  await ctx.addCookies(owner.cookie().split('; ').filter(Boolean).map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: BASE })));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(`${BASE}/studio/projets/${projectId}/etudes/${studyId}`);
  /** Tente une transition hors connexion depuis la carte du dossier : rend le message affiché et l'état de la carte. */
  async function horsLigne(id, action) {
    const carte = page.locator(`li[data-studio-publication="${id}"]`);
    await carte.waitFor({ timeout: 30000 });
    await carte.locator(`[data-studio-publication-action="${action}"]`).click();
    const confirmer = carte.getByRole('button', { name: 'Confirmer', exact: true });
    await page.waitForFunction((sel) => { const b = [...document.querySelectorAll(`${sel} form button`)].find((x) => x.textContent === 'Confirmer'); return !!b && !b.disabled; }, `li[data-studio-publication="${id}"]`, { timeout: 30000 });
    await ctx.setOffline(true);
    await confirmer.click();
    const alerte = carte.locator('[data-studio-publication-erreur]');
    await alerte.waitFor({ timeout: 30000 });
    const etat = { message: await alerte.textContent(), travail: await carte.getAttribute('data-travail'), diffusion: await carte.getAttribute('data-diffusion'), paquet: await carte.locator('[data-studio-publication-paquet]').count() };
    await ctx.setOffline(false);
    return etat;
  }
  const a = await horsLigne(p2.id, 'approuver');
  check('INV-014 [−] : approbation tentée hors connexion — « Action non confirmée », la carte reste « en revue », non diffusée',
    /Action non confirmée/.test(a.message ?? '') && a.travail === 'en-revue' && a.diffusion === 'non-diffuse', short(a));
  const s2 = (await owner('GET', `${pubs}/${p2.id}`)).body;
  check('INV-014 [−] : le serveur garde le dossier en revue, sans approbation', s2?.workStatus === 'en-revue' && !s2.approval && s2.events?.length === 2, short(s2));
  const d = await horsLigne(p3.id, 'diffuser');
  check('INV-014 [−] : diffusion tentée hors connexion — « Action non confirmée », la carte reste non diffusée, aucun paquet affiché',
    /Action non confirmée/.test(d.message ?? '') && d.travail === 'approuve' && d.diffusion === 'non-diffuse' && d.paquet === 0, short(d));
  const s3 = (await owner('GET', `${pubs}/${p3.id}`)).body;
  check('INV-014 [−] : le serveur n\'a rien diffusé (aucun paquet)', s3?.diffusionStatus === 'non-diffuse' && s3.diffusion === null, short(s3));
  // Retour du réseau : rechargée, la liste montre l'état serveur (rien d'approuvé ni de diffusé par la tentative).
  await page.reload();
  const c2 = page.locator(`li[data-studio-publication="${p2.id}"]`);
  await c2.waitFor({ timeout: 30000 });
  const c3 = page.locator(`li[data-studio-publication="${p3.id}"]`);
  check('INV-014 : au retour du réseau, les cartes relues portent l\'état serveur (en revue ; approuvé non diffusé)',
    (await c2.getAttribute('data-travail')) === 'en-revue' && (await c3.getAttribute('data-diffusion')) === 'non-diffuse' && (await c3.locator('[data-studio-publication-paquet]').count()) === 0);
  check('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
  await browser.close();
} else console.log(`– INV-014 (interface) : non exécuté (${chromium ? "l'API ne sert pas l'application web" : 'Playwright absent'})`);

console.log(failures ? `\n${failures} échec(s)` : '\nToutes les vérifications passent.');
process.exit(failures ? 1 : 0);
