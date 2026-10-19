/**
 * Recette des publications Studio par l'API réelle (base migrée par `npm run db:migrate`) : cycle complet
 * travail → soumis → approuvé / refusé → diffusé → retiré, approbation liée à la révision et à l'empreinte examinées,
 * approbation périmée refusée (409 avec les deux révisions), paquet figé (SVG, DXF, IFC, PDF) vérifié par empreintes,
 * journal append-only, droits (éditeur, lecteur, compte étranger, anonyme). Comptes et projet synthétiques.
 * Module Documents : groupe « Studio — paquets diffusés » (API, et interface quand l'API sert l'application web),
 * liens de téléchargement vérifiés par empreinte, paquet retiré listé et marqué.
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/studio-publication.mjs
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`✓ ${label}`);
  else { failures += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function client() {
  let cookie = '';
  const call = async (method, path, body, raw = false) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    if (raw) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  call.cookie = () => cookie;
  return call;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const credentials = () => ({ email: `pub-${randomUUID().replaceAll('-', '')}@example.test`, password: randomBytes(24).toString('hex') });
const short = (x) => JSON.stringify(x).slice(0, 300);

const owner = client(), editor = client(), reader = client(), foreign = client(), anonymous = client();
const accounts = { editor: credentials(), reader: credentials() };
check('propriétaire inscrit', (await owner('POST', '/auth/register', credentials())).status === 201);
check('éditeur inscrit', (await editor('POST', '/auth/register', accounts.editor)).status === 201);
check('lecteur inscrit', (await reader('POST', '/auth/register', accounts.reader)).status === 201);
check('compte étranger inscrit', (await foreign('POST', '/auth/register', credentials())).status === 201);
const project = await owner('POST', '/projects', { code: `PUB_${randomUUID().slice(0, 8)}`, name: 'Studio — publications (recette synthétique)' });
check('projet créé', project.status === 201, String(project.status));
const projectId = project.body?.id;
check('éditeur invité', (await owner('POST', `/projects/${projectId}/members`, { email: accounts.editor.email, role: 'editeur' })).status === 201);
check('lecteur invité', (await owner('POST', `/projects/${projectId}/members`, { email: accounts.reader.email, role: 'lecteur' })).status === 201);

const root = `/projects/${projectId}/studio`;
const study = await owner('POST', `${root}/studies`, { name: 'Étude publiée' });
check('étude créée', study.status === 201, String(study.status));
const studyId = study.body.study.id, variantId = study.body.variant.id;
const variantPath = `${root}/studies/${studyId}/variants/${variantId}`;
const pubs = `${root}/studies/${studyId}/publications`;
let head = study.body.revision.id;
async function draw(id, x) {
  const r = await owner('POST', `${variantPath}/commands`, { contractVersion: 'studio-commands/1', requestId: `pub-${randomUUID()}`, baseRevisionId: head, commands: [{ toolId: 'studio.dessin.ligne', params: { id, type: 'line', start: { x: 0, y: 0 }, end: { x, y: 2 } } }] });
  if (r.status === 200) head = r.body.revision.id;
  return r;
}
check('révision dessinée', (await draw('l1', 4)).status === 200);

// --- Préparation : droits ----------------------------------------------------------------------------------------
const requestId = `pub-${randomUUID()}`;
const p1 = await editor('POST', `${variantPath}/publications`, { title: 'Dossier A', requestId });
check('éditeur : publication préparée (201, travail, révision = tête)', p1.status === 201 && p1.body.status === 'travail' && p1.body.revisionId === head && /^[0-9a-f]{64}$/.test(p1.body.documentHash) && p1.body.replayed === false, short(p1.body));
const p1again = await editor('POST', `${variantPath}/publications`, { title: 'Dossier A', requestId });
check('rejeu du même requestId : même publication, sans doublon', p1again.status === 201 && p1again.body.replayed === true && p1again.body.id === p1.body.id);
check('lecteur : préparation refusée (403)', (await reader('POST', `${variantPath}/publications`, { title: 'X' })).status === 403);
check('compte étranger : préparation refusée sans rien révéler (404)', (await foreign('POST', `${variantPath}/publications`, { title: 'X' })).status === 404);
check('anonyme : 401', (await anonymous('POST', `${variantPath}/publications`, { title: 'X' })).status === 401);
check('champ inconnu refusé (400)', (await editor('POST', `${variantPath}/publications`, { titre: 'X' })).status === 400);
check('compte étranger : liste refusée (404)', (await foreign('GET', pubs)).status === 404);
check('compte étranger : liste du projet refusée (404)', (await foreign('GET', `${root}/publications`)).status === 404);
const id1 = p1.body.id;

// --- Soumission, approbation liée, refus ------------------------------------------------------------------------
check('approbation avant soumission refusée (409 invalid_transition)', (await owner('POST', `${pubs}/${id1}/approuver`, { revisionId: p1.body.revisionId, documentHash: p1.body.documentHash })).body?.error === 'invalid_transition');
check('lecteur : soumission refusée (403)', (await reader('POST', `${pubs}/${id1}/soumettre`, {})).status === 403);
const s1 = await editor('POST', `${pubs}/${id1}/soumettre`, { comment: 'Pour revue' });
check('éditeur : soumission (soumis)', s1.status === 200 && s1.body.status === 'soumis', short(s1.body));
check('éditeur : approbation refusée (403, propriétaire seul)', (await editor('POST', `${pubs}/${id1}/approuver`, { revisionId: p1.body.revisionId, documentHash: p1.body.documentHash })).status === 403);
check('lecteur : approbation refusée (403)', (await reader('POST', `${pubs}/${id1}/approuver`, { revisionId: p1.body.revisionId, documentHash: p1.body.documentHash })).status === 403);
check('approbation sans ensemble examiné refusée (400)', (await owner('POST', `${pubs}/${id1}/approuver`, {})).status === 400);
const mismatch = await owner('POST', `${pubs}/${id1}/approuver`, { revisionId: p1.body.revisionId, documentHash: 'b'.repeat(64) });
check('approbation d\'une autre empreinte refusée (409 revision_mismatch)', mismatch.status === 409 && mismatch.body.error === 'revision_mismatch' && mismatch.body.publicationDocumentHash === p1.body.documentHash, short(mismatch.body));
check('refus sans commentaire refusé (400)', (await owner('POST', `${pubs}/${id1}/refuser`, {})).status === 400);
const r1 = await owner('POST', `${pubs}/${id1}/refuser`, { comment: 'Cotes manquantes' });
check('propriétaire : refus (refuse)', r1.status === 200 && r1.body.status === 'refuse' && r1.body.approval === null);
check('publication refusée : diffusion impossible (409 invalid_transition)', (await editor('POST', `${pubs}/${id1}/diffuser`, {})).body?.error === 'invalid_transition');

// --- Approbation périmée : la tête a bougé ------------------------------------------------------------------------
const p2 = await editor('POST', `${variantPath}/publications`, { title: 'Dossier B' });
const id2 = p2.body.id;
await editor('POST', `${pubs}/${id2}/soumettre`, {});
const a2 = await owner('POST', `${pubs}/${id2}/approuver`, { revisionId: p2.body.revisionId, documentHash: p2.body.documentHash, comment: 'Bon pour diffusion' });
check('approbation liée à la révision et à l\'empreinte examinées', a2.status === 200 && a2.body.status === 'approuve' && a2.body.approval.revisionId === p2.body.revisionId && a2.body.approval.documentHash === p2.body.documentHash, short(a2.body));
const approvedRevision = head;
check('nouvelle révision après approbation', (await draw('l2', 6)).status === 200 && head !== approvedRevision);
const stale = await editor('POST', `${pubs}/${id2}/diffuser`, {});
check('diffusion sous approbation périmée refusée (409 avec les deux révisions)', stale.status === 409 && stale.body.error === 'stale_approval' && stale.body.approvedRevisionId === approvedRevision && stale.body.headRevisionId === head, short(stale.body));
const still = await owner('GET', `${pubs}/${id2}`);
check('rien n\'est écrit par le refus : publication toujours approuvée, périmée', still.body?.status === 'approuve' && still.body.freshness === 'perimee' && still.body.diffusion === null);

// --- Cycle complet et paquet figé -----------------------------------------------------------------------------------
const p3 = await editor('POST', `${variantPath}/publications`, { title: 'Dossier C' });
const id3 = p3.body.id;
await editor('POST', `${pubs}/${id3}/soumettre`, {});
await owner('POST', `${pubs}/${id3}/approuver`, { revisionId: p3.body.revisionId, documentHash: p3.body.documentHash });
check('lecteur : diffusion refusée (403)', (await reader('POST', `${pubs}/${id3}/diffuser`, {})).status === 403);
const d3 = await editor('POST', `${pubs}/${id3}/diffuser`, { comment: 'Diffusion au maître d\'ouvrage' });
const files = d3.body?.diffusion?.files ?? [];
check('éditeur : diffusion d\'une publication approuvée (diffuse)', d3.status === 200 && d3.body.status === 'diffuse' && /^[0-9a-f]{64}$/.test(d3.body.diffusion.packageHash), short(d3.body));
check('paquet : SVG, DXF, IFC et feuille PDF', JSON.stringify(files.map((f) => f.format)) === JSON.stringify(['svg', 'dxf', 'ifc', 'pdf']));
for (const f of files) {
  const file = await reader('GET', `${pubs}/${id3}/files/${f.format}`, undefined, true);
  check(`lecteur : fichier ${f.format} lisible, empreinte conforme au manifeste`, file.status === 200 && sha(file.bytes) === f.sha256 && file.headers.get('x-content-sha256') === f.sha256 && file.bytes.length === f.size, `${file.status}`);
  if (f.format === 'pdf') check('PDF : en-tête %PDF', file.bytes.subarray(0, 5).toString('latin1') === '%PDF-');
  if (f.format === 'ifc') check('IFC : ISO-10303-21', file.bytes.subarray(0, 13).toString('latin1') === 'ISO-10303-21;');
}
check('compte étranger : fichier refusé (404)', (await foreign('GET', `${pubs}/${id3}/files/pdf`, undefined, true)).status === 404);
const verif = await owner('GET', `${pubs}/${id3}/verification`);
check('paquet recalculé de façon déterministe : empreintes identiques', verif.status === 200 && verif.body.identical === true && verif.body.files.every((f) => f.identical), short(verif.body));
const listed = await reader('GET', `${root}/publications`);
check('liste des paquets du projet (module Documents) : paquet diffusé présent', listed.status === 200 && listed.body.packages.some((p) => p.id === id3 && p.status === 'diffuse' && p.studyName === 'Étude publiée'), short(listed.body));
check('liste des paquets : les publications non diffusées n\'y sont pas', !listed.body.packages.some((p) => p.id === id1 || p.id === id2));

// --- Module Documents : groupe « Studio — paquets diffusés » (lecture seule) ---------------------------------------
const docs = await reader('GET', `/projects/${projectId}/documents`);
const docPkg = (docs.body?.studioPackages ?? []).find((p) => p.publicationId === id3);
check('Documents (lecteur) : paquet diffusé listé (étude, variante, révision courte, statut, date, empreintes)', docs.status === 200 && docPkg?.group === 'studio' && docPkg.status === 'diffuse' && docPkg.studyName === 'Étude publiée' && docPkg.variantName === d3.body.variantName && docPkg.revisionShort === d3.body.revisionId.slice(-8) && docPkg.packageHash === d3.body.diffusion.packageHash && docPkg.documentHash === d3.body.documentHash && !Number.isNaN(Date.parse(docPkg.diffusedAt)), short(docPkg ?? docs.body));
check('Documents : paquets hors du catalogue productible (aucune action de production)', !(docs.body?.documents ?? []).some((d) => String(d.kind).startsWith('studio:')) && !(docs.body?.studioPackages ?? []).some((p) => p.publicationId === id1 || p.publicationId === id2));
check('Documents : quatre liens SVG, DXF, IFC, PDF', JSON.stringify((docPkg?.files ?? []).map((f) => f.format)) === JSON.stringify(['svg', 'dxf', 'ifc', 'pdf']));
for (const f of docPkg?.files ?? []) {
  const file = await reader('GET', f.href, undefined, true);
  check(`Documents : lien ${f.format} téléchargeable, empreinte conforme`, file.status === 200 && sha(file.bytes) === f.sha256 && /attachment/.test(file.headers.get('content-disposition') ?? ''), `${file.status}`);
}
check('Documents : compte étranger refusé (404)', (await foreign('GET', `/projects/${projectId}/documents`)).status === 404);
check('Documents : lien de fichier refusé au compte étranger (404)', docPkg ? (await foreign('GET', docPkg.files[0].href, undefined, true)).status === 404 : false);

// --- Remplacement, retrait journalisé, actualité --------------------------------------------------------------------
const p4 = await editor('POST', `${variantPath}/publications`, { title: 'Dossier D' });
const id4 = p4.body.id;
await editor('POST', `${pubs}/${id4}/soumettre`, {});
await owner('POST', `${pubs}/${id4}/approuver`, { revisionId: p4.body.revisionId, documentHash: p4.body.documentHash });
check('seconde diffusion de la même révision', (await editor('POST', `${pubs}/${id4}/diffuser`, {})).body?.status === 'diffuse');
check('diffusion précédente marquée remplacée', (await owner('GET', `${pubs}/${id3}`)).body?.replacedBy === id4);
check('éditeur : retrait refusé (403, propriétaire seul)', (await editor('POST', `${pubs}/${id3}/retirer`, { comment: 'x' })).status === 403);
check('retrait sans commentaire refusé (400)', (await owner('POST', `${pubs}/${id3}/retirer`, {})).status === 400);
const w3 = await owner('POST', `${pubs}/${id3}/retirer`, { comment: 'Remplacée par le dossier D' });
check('propriétaire : retrait (retire), paquet conservé', w3.status === 200 && w3.body.status === 'retire' && w3.body.diffusion?.packageHash === d3.body.diffusion.packageHash);
check('retrait répété refusé (409)', (await owner('POST', `${pubs}/${id3}/retirer`, { comment: 'encore' })).status === 409);
const kept = await reader('GET', `${pubs}/${id3}/files/svg`, undefined, true);
check('paquet retiré toujours lisible (jamais supprimé)', kept.status === 200 && kept.headers.get('x-studio-publication-status') === 'retire' && sha(kept.bytes) === files[0].sha256);
const journal = (await reader('GET', `${pubs}/${id3}`)).body?.events ?? [];
check('journal complet : création, soumission, approbation, diffusion, retrait', JSON.stringify(journal.map((e) => e.action)) === JSON.stringify(['creer', 'soumettre', 'approuver', 'diffuser', 'retirer']), short(journal));
check('journal : auteur, date et commentaire du retrait', journal.at(-1)?.comment === 'Remplacée par le dossier D' && journal.at(-1)?.author?.email && !Number.isNaN(Date.parse(journal.at(-1)?.createdAt)) && journal.at(-1)?.fromStatus === 'diffuse');
check('journal : approbation par le propriétaire, diffusion par l\'éditeur', journal[2]?.author?.id !== journal[3]?.author?.id && journal[3]?.author?.email === accounts.editor.email);
const journal1 = (await owner('GET', `${pubs}/${id1}`)).body?.events ?? [];
check('journal du refus : commentaire conservé', journal1.at(-1)?.action === 'refuser' && journal1.at(-1)?.comment === 'Cotes manquantes');
const listedAfter = await owner('GET', `${root}/publications`);
check('liste du projet : paquet retiré conservé et marqué', listedAfter.body?.packages?.some((p) => p.id === id3 && p.status === 'retire'));
const docsAfter = (await reader('GET', `/projects/${projectId}/documents`)).body?.studioPackages ?? [];
const docRetire = docsAfter.find((p) => p.publicationId === id3);
check('Documents : paquet retiré toujours listé, marqué retiré (date du retrait), jamais masqué', docRetire?.status === 'retire' && !Number.isNaN(Date.parse(docRetire.withdrawnAt)) && docRetire.replacedBy === id4 && docsAfter.some((p) => p.publicationId === id4 && p.status === 'diffuse'), short(docsAfter));
const retireFile = docRetire ? await reader('GET', docRetire.files[3].href, undefined, true) : null;
check('Documents : lien du paquet retiré toujours téléchargeable', retireFile?.status === 200 && sha(retireFile.bytes) === docRetire.files[3].sha256);
// Interface : le module Documents rend le groupe Studio (si l'API sert l'application web et que Playwright est là).
const shell = await fetch(`${BASE}/projets/${projectId}`).then((r) => r.text()).catch(() => '');
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* Playwright absent : contrôle d'interface déclaré non exécuté */ }
if (chromium && /<div id="root"/.test(shell)) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  const ctx = await browser.newContext();
  await ctx.addCookies(reader.cookie().split('; ').filter(Boolean).map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: BASE })));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projets/${projectId}?module=documents`);
  const row = page.locator(`tr[data-studio-package="${id3}"]`);
  const seen = await row.waitFor({ timeout: 30000 }).then(() => true, () => false);
  const links = seen ? await row.locator('a[data-studio-file]').evaluateAll((as) => as.map((a) => a.getAttribute('href'))) : [];
  check('Documents (interface) : groupe « Studio — paquets diffusés », paquet retiré marqué, quatre liens', seen && (await row.getAttribute('data-status')) === 'retire' && (await page.locator('#documents-studio').textContent())?.trim() === 'Studio — paquets diffusés' && JSON.stringify(links) === JSON.stringify(docRetire.files.map((f) => f.href)) && (await page.locator(`tr[data-studio-package="${id4}"][data-status="diffuse"]`).count()) === 1, JSON.stringify({ seen, links }));
  const dl = seen ? await Promise.all([page.waitForEvent('download'), row.locator('a[data-studio-file="pdf"]').click()]).then(([d]) => d) : null;
  const dlPath = dl ? await dl.path() : null;
  check('Documents (interface) : clic sur PDF → fichier figé téléchargé', !!dlPath && sha((await import('node:fs')).readFileSync(dlPath)) === docRetire.files[3].sha256, dl?.suggestedFilename() ?? '');
  await browser.close();
} else console.log(`– Documents (interface) : non exécuté (${chromium ? "l'API ne sert pas l'application web" : 'Playwright absent'})`);
check('actualité : publication diffusée à jour tant que la tête n\'a pas bougé', (await owner('GET', `${pubs}/${id4}`)).body?.freshness === 'a-jour');
await draw('l3', 8);
check('actualité : périmée après une nouvelle révision', (await owner('GET', `${pubs}/${id4}`)).body?.freshness === 'perimee');
const all = await reader('GET', pubs);
check('lecteur : liste de l\'étude (4 publications, sans transition permise)', all.status === 200 && all.body.publications.length === 4 && all.body.publications.every((p) => p.allowed.length === 0), short(all.body));
check('action inconnue : 404', (await owner('POST', `${pubs}/${id4}/effacer`, {})).status === 404);

// --- Jamais de suppression : le projet portant des publications diffusées ou retirées est conservé ----------------
const del = await owner('DELETE', `/projects/${projectId}`);
check('suppression du projet refusée après diffusion (409 publications_diffusees)', del.status === 409 && del.body?.error === 'publications_diffusees' && typeof del.body?.message === 'string', short(del.body));
check('projet, publications et journal intacts après le refus', (await owner('GET', `/projects/${projectId}`)).status === 200 && (await owner('GET', `${pubs}/${id3}`)).body?.events?.length === 5);
const spare = await owner('POST', '/projects', { code: `PUBX_${randomUUID().slice(0, 8)}`, name: 'Projet sans publication diffusée' });
const spareStudy = await owner('POST', `/projects/${spare.body?.id}/studio/studies`, { name: 'Brouillon' });
await owner('POST', `/projects/${spare.body?.id}/studio/studies/${spareStudy.body?.study?.id}/variants/${spareStudy.body?.variant?.id}/publications`, { title: 'En travail seulement' });
check('projet sans publication diffusée : suppression permise (204)', (await owner('DELETE', `/projects/${spare.body?.id}`)).status === 204);

console.log(failures ? `\n${failures} échec(s).` : '\nRecette des publications Studio : tout est conforme.');
process.exit(failures ? 1 : 0);
