/**
 * Recette des publications Studio par l'API réelle (base migrée par `npm run db:migrate`) : cycle complet
 * travail → soumis → approuvé / refusé → diffusé → retiré, approbation liée au manifeste examiné, diffusion sous un
 * manifeste changé refusée (409 manifest_mismatch), paquet figé (SVG, DXF, IFC, PDF) vérifié par empreintes,
 * journal append-only, droits (éditeur, lecteur, compte étranger, anonyme). Comptes et projet synthétiques.
 * Lot E.4 : trois dimensions distinctes (travail, diffusion, actualité), manifeste figé multi-sources (variante
 * principale et variante coordonnée), approbation par empreinte du manifeste, nouvelle approbation après modification
 * (actualiser → soumettre → approuver → diffuser), remplacement et retrait journalisés, contenu historique lisible,
 * droits distincts (revue : propriétaire et éditeur ; approbation et publication : propriétaire ; lecteur : lecture).
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
/** JSON canonique (clés triées), comme le serveur : l'empreinte du manifeste se recalcule ici. */
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v) ?? 'null';

const owner = client(), editor = client(), reader = client(), foreign = client(), anonymous = client();
const accounts = { owner: credentials(), editor: credentials(), reader: credentials() };
check('propriétaire inscrit', (await owner('POST', '/auth/register', accounts.owner)).status === 201);
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
check('dimensions distinctes à la préparation : brouillon, non diffusée, à jour', p1.body?.workStatus === 'brouillon' && p1.body?.diffusionStatus === 'non-diffuse' && p1.body?.freshness === 'a-jour', short(p1.body));
check('manifeste figé : empreinte = SHA-256 du JSON canonique, source principale, quatre documents', p1.body?.manifestHash === sha(canonical(p1.body?.manifest)) && p1.body.manifest.sources.length === 1 && p1.body.manifest.sources[0].revisionId === head && p1.body.manifest.sources[0].documentHash === p1.body.documentHash && p1.body.manifest.documents.length === 4, short(p1.body?.manifest));
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
const examined = (p) => ({ manifestHash: p.manifestHash, revisionId: p.revisionId, documentHash: p.documentHash });
check('approbation avant soumission refusée (409 invalid_transition)', (await owner('POST', `${pubs}/${id1}/approuver`, examined(p1.body))).body?.error === 'invalid_transition');
check('lecteur : soumission refusée (403)', (await reader('POST', `${pubs}/${id1}/soumettre`, {})).status === 403);
const s1 = await editor('POST', `${pubs}/${id1}/soumettre`, { comment: 'Pour revue' });
check('éditeur : soumission (soumis, en revue)', s1.status === 200 && s1.body.status === 'soumis' && s1.body.workStatus === 'en-revue', short(s1.body));
check('éditeur : approbation refusée (403, propriétaire seul)', (await editor('POST', `${pubs}/${id1}/approuver`, examined(p1.body))).status === 403);
check('lecteur : approbation refusée (403)', (await reader('POST', `${pubs}/${id1}/approuver`, examined(p1.body))).status === 403);
check('approbation sans empreinte de manifeste refusée (400 examined_set_required)', (await owner('POST', `${pubs}/${id1}/approuver`, { revisionId: p1.body.revisionId, documentHash: p1.body.documentHash })).body?.code === 'examined_set_required');
check('approbation sans ensemble examiné refusée (400)', (await owner('POST', `${pubs}/${id1}/approuver`, {})).status === 400);
const mismatch = await owner('POST', `${pubs}/${id1}/approuver`, { ...examined(p1.body), documentHash: 'b'.repeat(64) });
check('approbation d\'une autre empreinte refusée (409 revision_mismatch)', mismatch.status === 409 && mismatch.body.error === 'revision_mismatch' && mismatch.body.publicationDocumentHash === p1.body.documentHash, short(mismatch.body));
check('refus sans commentaire refusé (400)', (await owner('POST', `${pubs}/${id1}/refuser`, {})).status === 400);
const r1 = await owner('POST', `${pubs}/${id1}/refuser`, { comment: 'Cotes manquantes' });
check('propriétaire : refus (refuse)', r1.status === 200 && r1.body.status === 'refuse' && r1.body.workStatus === 'refuse' && r1.body.approval === null);
check('publication refusée : diffusion impossible (409 invalid_transition)', (await owner('POST', `${pubs}/${id1}/diffuser`, {})).body?.error === 'invalid_transition');

// --- Approbation périmée : la tête a bougé ------------------------------------------------------------------------
const p2 = await editor('POST', `${variantPath}/publications`, { title: 'Dossier B' });
const id2 = p2.body.id;
await editor('POST', `${pubs}/${id2}/soumettre`, {});
const a2 = await owner('POST', `${pubs}/${id2}/approuver`, { ...examined(p2.body), comment: 'Bon pour diffusion' });
check('approbation liée au manifeste, à la révision et à l\'empreinte examinés', a2.status === 200 && a2.body.status === 'approuve' && a2.body.approval.revisionId === p2.body.revisionId && a2.body.approval.documentHash === p2.body.documentHash && a2.body.approval.manifestHash === p2.body.manifestHash, short(a2.body));
const approvedRevision = head;
check('nouvelle révision après approbation', (await draw('l2', 6)).status === 200 && head !== approvedRevision);
check('éditeur : diffusion refusée (403, propriétaire seul)', (await editor('POST', `${pubs}/${id2}/diffuser`, {})).status === 403);
const stale = await owner('POST', `${pubs}/${id2}/diffuser`, {});
check('diffusion sous manifeste changé refusée (409 manifest_mismatch, deux révisions et deux empreintes)', stale.status === 409 && stale.body.error === 'manifest_mismatch' && stale.body.approvedRevisionId === approvedRevision && stale.body.headRevisionId === head && stale.body.approvedManifestHash === p2.body.manifestHash && stale.body.currentManifestHash !== p2.body.manifestHash, short(stale.body));
const still = await owner('GET', `${pubs}/${id2}`);
check('rien n\'est écrit par le refus : publication toujours approuvée, périmée', still.body?.status === 'approuve' && still.body.freshness === 'perimee' && still.body.diffusion === null);

// --- Cycle complet et paquet figé -----------------------------------------------------------------------------------
const p3 = await editor('POST', `${variantPath}/publications`, { title: 'Dossier C' });
const id3 = p3.body.id;
await editor('POST', `${pubs}/${id3}/soumettre`, {});
await owner('POST', `${pubs}/${id3}/approuver`, examined(p3.body));
check('lecteur : diffusion refusée (403)', (await reader('POST', `${pubs}/${id3}/diffuser`, {})).status === 403);
check('éditeur : diffusion refusée (403, propriétaire seul)', (await editor('POST', `${pubs}/${id3}/diffuser`, {})).status === 403);
const d3 = await owner('POST', `${pubs}/${id3}/diffuser`, { comment: 'Diffusion au maître d\'ouvrage' });
const files = d3.body?.diffusion?.files ?? [];
check('propriétaire : diffusion d\'une publication approuvée (diffuse ; travail approuvé conservé)', d3.status === 200 && d3.body.status === 'diffuse' && d3.body.diffusionStatus === 'diffuse' && d3.body.workStatus === 'approuve' && /^[0-9a-f]{64}$/.test(d3.body.diffusion.packageHash), short(d3.body));
check('paquet diffusé = documents du manifeste approuvé', d3.body?.diffusion?.manifestHash === p3.body.manifestHash && files.every((f) => p3.body.manifest.documents.some((d) => d.format === f.format && d.sha256 === f.sha256)));
check('paquet : SVG, DXF, IFC et feuille PDF', JSON.stringify(files.map((f) => f.format)) === JSON.stringify(['svg', 'dxf', 'ifc', 'pdf']));
for (const f of files) {
  const file = await reader('GET', `${pubs}/${id3}/files/${f.format}`, undefined, true);
  check(`lecteur : fichier ${f.format} lisible, empreinte conforme au manifeste`, file.status === 200 && sha(file.bytes) === f.sha256 && file.headers.get('x-content-sha256') === f.sha256 && file.bytes.length === f.size, `${file.status}`);
  if (f.format === 'pdf') check('PDF : en-tête %PDF', file.bytes.subarray(0, 5).toString('latin1') === '%PDF-');
  if (f.format === 'ifc') check('IFC : ISO-10303-21', file.bytes.subarray(0, 13).toString('latin1') === 'ISO-10303-21;');
}
check('compte étranger : fichier refusé (404)', (await foreign('GET', `${pubs}/${id3}/files/pdf`, undefined, true)).status === 404);
const verif = await owner('GET', `${pubs}/${id3}/verification`);
check('paquet recalculé de façon déterministe : empreintes identiques', verif.status === 200 && verif.body.identical === true && verif.body.manifestDocuments === true && verif.body.files.every((f) => f.identical), short(verif.body));
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
await owner('POST', `${pubs}/${id4}/approuver`, examined(p4.body));
check('seconde diffusion de la même révision', (await owner('POST', `${pubs}/${id4}/diffuser`, { comment: 'Remplace le dossier C' })).body?.status === 'diffuse');
const replaced3 = (await owner('GET', `${pubs}/${id3}`)).body;
check('diffusion précédente marquée remplacée (diffusion « remplace », auteur et date)', replaced3?.replacedBy === id4 && replaced3.diffusionStatus === 'remplace' && replaced3.status === 'diffuse' && replaced3.replacement?.publicationId === id4 && replaced3.replacement.by?.email === accounts.owner.email && !Number.isNaN(Date.parse(replaced3.replacement.at)), short(replaced3));
check('remplacement journalisé (qui, quand, pourquoi, par quel dossier)', replaced3?.events?.at(-1)?.action === 'remplacer' && replaced3.events.at(-1).relatedPublicationId === id4 && replaced3.events.at(-1).comment === 'Remplace le dossier C' && replaced3.events.at(-1).author.email === accounts.owner.email);
check('éditeur : retrait refusé (403, propriétaire seul)', (await editor('POST', `${pubs}/${id3}/retirer`, { comment: 'x' })).status === 403);
check('retrait sans commentaire refusé (400)', (await owner('POST', `${pubs}/${id3}/retirer`, {})).status === 400);
const w3 = await owner('POST', `${pubs}/${id3}/retirer`, { comment: 'Remplacée par le dossier D' });
check('propriétaire : retrait (retire), paquet conservé', w3.status === 200 && w3.body.status === 'retire' && w3.body.diffusion?.packageHash === d3.body.diffusion.packageHash);
check('retrait répété refusé (409)', (await owner('POST', `${pubs}/${id3}/retirer`, { comment: 'encore' })).status === 409);
const kept = await reader('GET', `${pubs}/${id3}/files/svg`, undefined, true);
check('paquet retiré toujours lisible (jamais supprimé)', kept.status === 200 && kept.headers.get('x-studio-publication-status') === 'retire' && kept.headers.get('x-studio-diffusion-status') === 'retire' && sha(kept.bytes) === files[0].sha256);
const journal = (await reader('GET', `${pubs}/${id3}`)).body?.events ?? [];
check('journal complet : création, soumission, approbation, diffusion, remplacement, retrait', JSON.stringify(journal.map((e) => e.action)) === JSON.stringify(['creer', 'soumettre', 'approuver', 'diffuser', 'remplacer', 'retirer']), short(journal));
check('journal : auteur, date et commentaire du retrait', journal.at(-1)?.comment === 'Remplacée par le dossier D' && journal.at(-1)?.author?.email && !Number.isNaN(Date.parse(journal.at(-1)?.createdAt)) && journal.at(-1)?.fromStatus === 'diffuse');
check('journal : préparation par l\'éditeur, approbation et diffusion par le propriétaire', journal[0]?.author?.email === accounts.editor.email && journal[2]?.author?.email === accounts.owner.email && journal[3]?.author?.email === accounts.owner.email);
check('journal : dimensions et empreinte du manifeste à chaque évènement', journal.every((e) => e.workStatus && e.diffusionStatus && e.manifestHash === p3.body.manifestHash) && journal.at(-1)?.diffusionStatus === 'retire');
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

// --- Lot E.4 : manifeste multi-sources, nouvelle approbation après modification, retrait, droits ------------------
const st2 = await owner('POST', `${root}/studies`, { name: 'Étude coordonnée' });
check('E.4 : étude coordonnée créée', st2.status === 201, String(st2.status));
const s2 = st2.body.study.id, vA = st2.body.variant.id;
const heads = { [vA]: st2.body.revision.id };
const vb = await owner('POST', `${root}/studies/${s2}/variants`, { name: 'Structure' });
check('E.4 : variante coordonnée créée', vb.status === 201, String(vb.status));
const vB = vb.body.variant.id;
heads[vB] = vb.body.revision.id;
const vpath = (v) => `${root}/studies/${s2}/variants/${v}`;
async function drawOn(v, id, x) {
  const r = await owner('POST', `${vpath(v)}/commands`, { contractVersion: 'studio-commands/1', requestId: `pub-${randomUUID()}`, baseRevisionId: heads[v], commands: [{ toolId: 'studio.dessin.ligne', params: { id, type: 'line', start: { x: 0, y: 0 }, end: { x, y: 3 } } }] });
  if (r.status === 200) heads[v] = r.body.revision.id;
  return r;
}
check('E.4 : révisions dessinées sur les deux variantes', (await drawOn(vA, 'a1', 5)).status === 200 && (await drawOn(vB, 'b1', 7)).status === 200);
const pubs2 = `${root}/studies/${s2}/publications`;
check('E.4 : variante coordonnée inconnue refusée (400)', (await editor('POST', `${vpath(vA)}/publications`, { title: 'X', coordinatedVariantIds: ['studio_variant_inconnue'] })).status === 400);
check('E.4 : variante coordonnée identique à la variante publiée refusée (400)', (await editor('POST', `${vpath(vA)}/publications`, { title: 'X', coordinatedVariantIds: [vA] })).status === 400);
const prepare = async (title) => (await editor('POST', `${vpath(vA)}/publications`, { title, coordinatedVariantIds: [vB] })).body;
const p5 = await prepare('Dossier coordonné E');
check('E.4 : manifeste multi-sources (variante principale et coordonnée, révisions et empreintes)', p5?.manifest?.sources?.length === 2 && p5.manifest.sources[0].role === 'principale' && p5.manifest.sources[0].revisionId === heads[vA] && p5.manifest.sources[1].role === 'coordonnee' && p5.manifest.sources[1].variantId === vB && p5.manifest.sources[1].revisionId === heads[vB] && /^[0-9a-f]{64}$/.test(p5.manifest.sources[1].documentHash) && p5.manifestHash === sha(canonical(p5.manifest)), short(p5?.manifest));
check('E.4 : documents du manifeste (quatre formats, empreintes)', JSON.stringify(p5?.manifest?.documents?.map((d) => d.format)) === JSON.stringify(['dxf', 'ifc', 'pdf', 'svg']) && p5.manifest.documents.every((d) => /^[0-9a-f]{64}$/.test(d.sha256) && d.size > 0));
// 1. Soumettre, approuver, diffuser.
check('E.4 : lecteur ne soumet pas (403)', (await reader('POST', `${pubs2}/${p5.id}/soumettre`, {})).status === 403);
check('E.4 : éditeur soumet (en revue)', (await editor('POST', `${pubs2}/${p5.id}/soumettre`, {})).body?.workStatus === 'en-revue');
const a5 = await owner('POST', `${pubs2}/${p5.id}/approuver`, { manifestHash: p5.manifestHash });
check('E.4 : propriétaire approuve le manifeste examiné (son empreinte)', a5.status === 200 && a5.body.workStatus === 'approuve' && a5.body.approval?.manifestHash === p5.manifestHash, short(a5.body));
check('E.4 : éditeur ne diffuse pas (403)', (await editor('POST', `${pubs2}/${p5.id}/diffuser`, {})).status === 403);
const d5 = await owner('POST', `${pubs2}/${p5.id}/diffuser`, {});
check('E.4 : propriétaire diffuse (diffusée, à jour)', d5.status === 200 && d5.body.diffusionStatus === 'diffuse' && d5.body.freshness === 'a-jour' && d5.body.diffusion?.manifestHash === p5.manifestHash, short(d5.body));
const p6 = await prepare('Dossier coordonné F');
await editor('POST', `${pubs2}/${p6.id}/soumettre`, {});
check('E.4 : second dossier approuvé', (await owner('POST', `${pubs2}/${p6.id}/approuver`, { manifestHash: p6.manifestHash })).body?.workStatus === 'approuve');
// 2. Modifier la variante : diffusion refusée sous l'ancienne approbation, dossier périmé.
const before = heads[vA];
check('E.4 : variante principale modifiée', (await drawOn(vA, 'a2', 9)).status === 200 && heads[vA] !== before);
const refused = await owner('POST', `${pubs2}/${p6.id}/diffuser`, {});
check('E.4 : diffusion refusée sous l\'ancienne approbation (409 manifest_mismatch, écart sur la variante)', refused.status === 409 && refused.body.error === 'manifest_mismatch' && refused.body.approvedManifestHash === p6.manifestHash && refused.body.currentManifestHash !== p6.manifestHash && refused.body.drift?.some((e) => e.type === 'source' && e.role === 'principale' && e.revisionFigee === before && e.revisionCourante === heads[vA]), short(refused.body));
const g6 = (await owner('GET', `${pubs2}/${p6.id}`)).body;
check('E.4 : dossier approuvé affiché périmé, rien n\'est écrit par le refus', g6?.freshness === 'perimee' && g6.workStatus === 'approuve' && g6.diffusionStatus === 'non-diffuse' && g6.diffusion === null && g6.drift?.length === 1 && !g6.allowed.includes('diffuser') && g6.allowed.includes('actualiser'), short(g6));
check('E.4 : paquet diffusé affiché périmé (contenus dérivés)', (await reader('GET', `${pubs2}/${p5.id}`)).body?.freshness === 'perimee');
check('E.4 : nouvelle approbation directe impossible (409 invalid_transition)', (await owner('POST', `${pubs2}/${p6.id}/approuver`, { manifestHash: p6.manifestHash })).body?.error === 'invalid_transition');
// 3. Nouvelle approbation : actualiser, soumettre, approuver, puis diffuser.
check('E.4 : lecteur n\'actualise pas (403)', (await reader('POST', `${pubs2}/${p6.id}/actualiser`, {})).status === 403);
const u6 = await editor('POST', `${pubs2}/${p6.id}/actualiser`, { comment: 'Nouvelle révision' });
check('E.4 : éditeur actualise (brouillon, nouveau manifeste, approbation levée)', u6.status === 200 && u6.body.workStatus === 'brouillon' && u6.body.freshness === 'a-jour' && u6.body.revisionId === heads[vA] && u6.body.manifestHash !== p6.manifestHash && u6.body.approval === null && u6.body.manifestHash === sha(canonical(u6.body.manifest)), short(u6.body));
check('E.4 : actualiser un manifeste à jour refusé (409 manifest_current)', (await editor('POST', `${pubs2}/${p6.id}/actualiser`, {})).body?.error === 'manifest_current');
await editor('POST', `${pubs2}/${p6.id}/soumettre`, {});
check('E.4 : approbation de l\'ancien manifeste refusée (409 revision_mismatch)', (await owner('POST', `${pubs2}/${p6.id}/approuver`, { manifestHash: p6.manifestHash })).body?.error === 'revision_mismatch');
const ra6 = await owner('POST', `${pubs2}/${p6.id}/approuver`, { manifestHash: u6.body.manifestHash, comment: 'Nouvelle approbation' });
check('E.4 : nouvelle approbation du nouveau manifeste', ra6.body?.workStatus === 'approuve' && ra6.body.approval?.manifestHash === u6.body.manifestHash);
const rd6 = await owner('POST', `${pubs2}/${p6.id}/diffuser`, { comment: 'Remplace le dossier E' });
check('E.4 : diffusion après nouvelle approbation', rd6.status === 200 && rd6.body.diffusionStatus === 'diffuse' && rd6.body.diffusion?.manifestHash === u6.body.manifestHash, short(rd6.body));
const g5 = (await reader('GET', `${pubs2}/${p5.id}`)).body;
check('E.4 : dossier E remplacé, journalisé, paquet toujours lisible', g5?.diffusionStatus === 'remplace' && g5.replacement?.publicationId === p6.id && g5.events?.at(-1)?.action === 'remplacer' && (await reader('GET', `${pubs2}/${p5.id}/files/pdf`, undefined, true)).status === 200, short(g5));
const j6 = (await owner('GET', `${pubs2}/${p6.id}`)).body?.events ?? [];
check('E.4 : journal du dossier F (deux approbations, actualisation entre les deux)', JSON.stringify(j6.map((e) => e.action)) === JSON.stringify(['creer', 'soumettre', 'approuver', 'actualiser', 'soumettre', 'approuver', 'diffuser']) && j6[2].manifestHash === p6.manifestHash && j6[5].manifestHash === u6.body.manifestHash, short(j6));
// Actualité multi-sources : la variante coordonnée change.
check('E.4 : variante coordonnée modifiée', (await drawOn(vB, 'b2', 11)).status === 200);
const c6 = (await owner('GET', `${pubs2}/${p6.id}`)).body;
check('E.4 : paquet diffusé périmé par sa source coordonnée', c6?.freshness === 'perimee' && c6.drift?.some((e) => e.role === 'coordonnee' && e.variantId === vB), short(c6?.drift));
// 4. Retrait journalisé, contenu lisible.
check('E.4 : éditeur ne retire pas (403)', (await editor('POST', `${pubs2}/${p6.id}/retirer`, { comment: 'x' })).status === 403);
check('E.4 : retrait sans motif refusé (400)', (await owner('POST', `${pubs2}/${p6.id}/retirer`, {})).status === 400);
const w6 = await owner('POST', `${pubs2}/${p6.id}/retirer`, { comment: 'Erreur de cotation' });
check('E.4 : retrait journalisé (qui, quand, pourquoi)', w6.status === 200 && w6.body.diffusionStatus === 'retire' && w6.body.workStatus === 'approuve' && w6.body.withdrawal?.by?.email === accounts.owner.email && w6.body.withdrawal.comment === 'Erreur de cotation' && !Number.isNaN(Date.parse(w6.body.withdrawal.at)) && w6.body.events?.at(-1)?.action === 'retirer', short(w6.body));
const keptFiles = rd6.body?.diffusion?.files ?? [];
let readable = keptFiles.length === 4;
for (const f of keptFiles) {
  const file = await reader('GET', `${pubs2}/${p6.id}/files/${f.format}`, undefined, true);
  readable &&= file.status === 200 && sha(file.bytes) === f.sha256 && file.headers.get('x-studio-diffusion-status') === 'retire';
}
check('E.4 : contenu retiré toujours lisible par le lecteur (quatre fichiers, empreintes conformes)', readable);
const v6 = await reader('GET', `${pubs2}/${p6.id}/verification`);
check('E.4 : paquet retiré vérifiable (documents du manifeste approuvé)', v6.body?.identical === true && v6.body.manifestDocuments === true && v6.body.manifestHash === u6.body.manifestHash, short(v6.body));
// 5. Un lecteur ne peut pas approuver ; approbation d'un manifeste périmé refusée.
const p7 = await prepare('Dossier coordonné G');
await editor('POST', `${pubs2}/${p7.id}/soumettre`, {});
const ra7 = await reader('POST', `${pubs2}/${p7.id}/approuver`, { manifestHash: p7.manifestHash });
check('E.4 : lecteur ne peut pas approuver (403, style de refus existant)', ra7.status === 403 && ra7.body?.error === 'forbidden' && ra7.body.role === 'lecteur' && typeof ra7.body.message === 'string', short(ra7.body));
check('E.4 : lecteur ne peut pas refuser (403)', (await reader('POST', `${pubs2}/${p7.id}/refuser`, { comment: 'non' })).status === 403);
const g7 = (await reader('GET', `${pubs2}/${p7.id}`)).body;
check('E.4 : dossier inchangé après le refus du lecteur, aucune transition permise au lecteur', g7?.workStatus === 'en-revue' && g7.allowed.length === 0 && g7.events.length === 2);
check('E.4 : propriétaire : approbation et refus permis, actualisation permise à l\'éditeur seulement si périmé', JSON.stringify((await owner('GET', `${pubs2}/${p7.id}`)).body?.allowed) === JSON.stringify(['approuver', 'refuser', 'retirer']));
await drawOn(vB, 'b3', 13);
check('E.4 : approbation d\'un manifeste périmé refusée (409 manifest_outdated)', (await owner('POST', `${pubs2}/${p7.id}/approuver`, { manifestHash: p7.manifestHash })).body?.error === 'manifest_outdated');
// Interface : panneau « Publications » de l'étude, trois dimensions affichées, aucune action pour le lecteur.
if (chromium && /<div id="root"/.test(shell)) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  const ctx = await browser.newContext();
  await ctx.addCookies(reader.cookie().split('; ').filter(Boolean).map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: BASE })));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/studio/projets/${projectId}/etudes/${s2}`);
  const card6 = page.locator(`li[data-studio-publication="${p6.id}"]`);
  const seen = await card6.waitFor({ timeout: 30000 }).then(() => true, () => false);
  const dims = seen ? await card6.evaluate((el) => [el.dataset.travail, el.dataset.diffusion, el.dataset.actualite]) : [];
  const card7 = page.locator(`li[data-studio-publication="${p7.id}"]`);
  check('E.4 (interface) : dossier retiré affiché avec ses trois dimensions et son retrait, aucune action au lecteur',
    seen && JSON.stringify(dims) === JSON.stringify(['approuve', 'retire', 'perimee']) && (await card6.locator('[data-studio-publication-retrait]').count()) === 1
      && (await card6.locator('[data-studio-publication-ecarts] li').count()) >= 1 && (await card7.locator('[data-studio-publication-action]').count()) === 0
      && (await card7.getAttribute('data-actualite')) === 'perimee', JSON.stringify({ seen, dims }));
  await browser.close();
} else console.log(`– E.4 (interface) : non exécuté (${chromium ? "l'API ne sert pas l'application web" : 'Playwright absent'})`);

// --- Jamais de suppression : le projet portant des publications diffusées ou retirées est conservé ----------------
const del = await owner('DELETE', `/projects/${projectId}`);
check('suppression du projet refusée après diffusion (409 publications_diffusees)', del.status === 409 && del.body?.error === 'publications_diffusees' && typeof del.body?.message === 'string', short(del.body));
check('projet, publications et journal intacts après le refus', (await owner('GET', `/projects/${projectId}`)).status === 200 && (await owner('GET', `${pubs}/${id3}`)).body?.events?.length === 6);
const spare = await owner('POST', '/projects', { code: `PUBX_${randomUUID().slice(0, 8)}`, name: 'Projet sans publication diffusée' });
const spareStudy = await owner('POST', `/projects/${spare.body?.id}/studio/studies`, { name: 'Brouillon' });
await owner('POST', `/projects/${spare.body?.id}/studio/studies/${spareStudy.body?.study?.id}/variants/${spareStudy.body?.variant?.id}/publications`, { title: 'En travail seulement' });
check('projet sans publication diffusée : suppression permise (204)', (await owner('DELETE', `/projects/${spare.body?.id}`)).status === 204);

console.log(failures ? `\n${failures} échec(s).` : '\nRecette des publications Studio : tout est conforme.');
process.exit(failures ? 1 : 0);
