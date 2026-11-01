/**
 * Recette du lot PUB par l'API réelle (base PostgreSQL migrée par `npm run db:migrate`) — comptes et projet synthétiques :
 *   - EX-075 : vue de coupe enregistrée (niveau, cadrage, échelle, styles, annotations propres), périmée après une
 *     nouvelle révision, annotation sans écriture du modèle ;
 *   - IF-008 / EX-077 : résultats quantitatifs traçables ;
 *   - IF-010 / EX-084 : observation avec catégorie, gravité, pièce justificative (téléchargée, empreinte vérifiée),
 *     identité propre distincte de la note ; BCF exporté puis réimporté (même contexte : reconnu ; autre contexte :
 *     observation distincte) ;
 *   - IF-009 : publication refusée pour une observation bloquante ouverte, admise une fois l'observation dérogée ;
 *   - EX-074 / EX-076 : dossier de conception (feuille 2D + vue de coupe) publié, approuvé, diffusé ; présentation
 *     « synchronisée » non fondée refusée ;
 *   - TEST-011 : annuler / rétablir après diffusion : aucune perte de publication (fichiers et empreintes identiques) ;
 *   - REC-E-03 : contrôle → écart → correction → nouveau contrôle satisfait → observation clôturée → approbation →
 *     diffusion, sur une même étude.
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/studio-pub.mjs
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { inviterEtAccepter } from './lib-invitations.mjs';

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
const credentials = () => ({ email: `pubx-${randomUUID().replaceAll('-', '')}@example.test`, password: randomBytes(24).toString('hex') });
const short = (x) => JSON.stringify(x).slice(0, 300);

const owner = client(), editor = client(), approver = client();
const accounts = { owner: credentials(), editor: credentials() };
check('propriétaire inscrit', (await owner('POST', '/auth/register', accounts.owner)).status === 201);
check('éditeur inscrit', (await editor('POST', '/auth/register', accounts.editor)).status === 201);
const project = await owner('POST', '/projects', { code: `PUBX_${randomUUID().slice(0, 8)}`, name: 'Studio — lot PUB (recette synthétique)' });
check('projet créé', project.status === 201, String(project.status));
const projectId = project.body?.id;
check('éditeur invité, invitation acceptée', (await inviterEtAccepter(owner, editor, projectId, accounts.editor.email, 'editeur')).ok);
const editorId = (await editor('GET', '/auth/me')).body?.user?.id ?? (await editor('GET', '/auth/me')).body?.id;
void approver;

const root = `/projects/${projectId}/studio`;
const study = await owner('POST', `${root}/studies`, { name: 'Étude PUB' });
check('étude créée', study.status === 201, String(study.status));
const studyId = study.body.study.id, variantId = study.body.variant.id;
const S = `${root}/studies/${studyId}`;
const V = `${S}/variants/${variantId}`;
const PUBS = `${S}/publications`;
let head = study.body.revision.id;
async function commande(commands, qui = owner) {
  const r = await qui('POST', `${V}/commands`, { contractVersion: 'studio-commands/1', requestId: `pubx-${randomUUID()}`, baseRevisionId: head, commands });
  if (r.status === 200) head = r.body.revision.id;
  return r;
}
/** Approbation : l'éditeur soumet, le propriétaire approuve (pas d'auto-contrôle : il n'a pas soumis). */
async function publierJusquA(id, etape = 'diffuser') {
  const s = await editor('POST', `${PUBS}/${id}/soumettre`, {});
  if (s.status !== 200) return s;
  const a = await owner('POST', `${PUBS}/${id}/approuver`, { manifestHash: s.body.manifestHash, revisionId: s.body.revisionId, documentHash: s.body.documentHash });
  if (a.status !== 200 || etape === 'approuver') return a;
  return owner('POST', `${PUBS}/${id}/diffuser`, {});
}

// --- EX-075 : vue de coupe enregistrée ------------------------------------------------------------------------------
check('boîte dessinée (maquette)', (await commande([{ toolId: 'studio.solide.boite', params: { id: 'b1', type: 'box', placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3 } }])).status === 200);
const VUE = { nom: 'Coupe AA', niveau: { repere: 'local-3d', z: 1 }, cadrage: { xMin: -1, yMin: -1, xMax: 5, yMax: 5 }, echelle: 50, styles: { trait: 'fort', hachure: 'diagonale' }, annotations: [{ id: 'a1', type: 'texte', position: { x: 0.5, y: 0.5 }, texte: 'Local technique' }] };
const vue = await owner('POST', `${V}/section-views`, { definition: VUE });
check('EX-075 : vue de coupe enregistrée (révision, niveau, cadrage, échelle, styles, annotations)', vue.status === 201 && vue.body.freshness === 'a-jour' && vue.body.revisionId === head && vue.body.definition.echelle === 50 && vue.body.vue?.coupe?.sources?.[0]?.id === 'b1', short(vue.body));
const docAvant = (await owner('GET', V)).body.revision.document;
const annotee = await owner('PATCH', `${S}/section-views/${vue.body.id}`, { annotation: { op: 'modifier', annotation: { id: 'a1', type: 'texte', position: { x: 0.5, y: 0.5 }, texte: 'largeur 9 m' } } });
const docApres = (await owner('GET', V)).body;
check('EX-075 [−] : l\'annotation modifiée reste à la vue — aucune révision ni paramètre du solide écrits', annotee.status === 200 && docApres.variant.headRevisionId === head && JSON.stringify(docApres.revision.document) === JSON.stringify(docAvant) && annotee.body.vue.empreinteSection === vue.body.vue.empreinteSection, short(annotee.body));
check('déplacement du solide (nouvelle révision)', (await commande([{ toolId: 'studio.solide.deplacer', params: { id: 'b1', dx: 0.5, dy: 0, dz: 0 } }])).status === 200);
const perimee = await owner('GET', `${S}/section-views/${vue.body.id}`);
check('EX-075 : vue dérivée périmée après modification du modèle', perimee.body?.freshness === 'perimee' && perimee.body.headRevisionId === head, short(perimee.body));
const rebasee = await owner('PATCH', `${S}/section-views/${vue.body.id}`, { revisionId: head });
check('EX-075 : vue rebasée explicitement (définition conservée)', rebasee.body?.freshness === 'a-jour' && rebasee.body.definition.annotations[0].texte === 'largeur 9 m', short(rebasee.body));

// --- IF-008 : résultats quantitatifs --------------------------------------------------------------------------------
check('ligne dessinée', (await commande([{ toolId: 'studio.dessin.ligne', params: { id: 'l1', type: 'line', start: { x: 0, y: 6 }, end: { x: 4, y: 6 } } }])).status === 200);
const rq = await owner('GET', `${V}/resultats-quantitatifs`);
const lg = rq.body?.resultats?.find((r) => r.portee === 'objet' && r.grandeur === 'longueur' && r.sourceObjectIds[0] === 'l1');
check('IF-008 : quantité avec quantityId, sourceRevisionSet, ruleId / ruleVersion, unité, valeur, affichage, actualité', lg && /^q_/.test(lg.quantityId) && lg.ruleId === 'studio.metre.longueur' && lg.ruleVersion === '1' && lg.unit === 'm' && lg.rawValue === 4 && lg.displayValue === '4,000' && lg.freshnessStatus === 'a-jour' && lg.sourceRevisionSet.revisions[0].revisionId === head, short(lg));

// --- IF-010 / EX-084 : observation qualifiée, pièce, BCF ------------------------------------------------------------
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const obs = await owner('POST', `${V}/observations`, { body: 'Gaine non réservée dans le mur', responsableId: editorId, categorie: 'coordination', gravite: 'majeure', audience: 'projet', pieces: [{ name: 'releve.png', mime: 'image/png', contentBase64: PNG.toString('base64') }] });
check('IF-010 : observation avec issueId propre, catégorie, gravité, pièce justificative', obs.status === 201 && obs.body.issueId && obs.body.issueId !== obs.body.id && obs.body.categorie === 'coordination' && obs.body.gravite === 'majeure' && obs.body.pieces?.[0]?.sha256 === sha(PNG), short(obs.body));
const piece = await owner('GET', `${V}/observations/${obs.body.id}/pieces/${sha(PNG)}`, undefined, true);
check('IF-010 : pièce justificative téléchargée, empreinte vérifiée', piece.status === 200 && sha(piece.bytes) === sha(PNG) && piece.headers.get('x-content-sha256') === sha(PNG));
const bcf = await owner('GET', `${V}/observations/bcf`, undefined, true);
check('IF-010 : export BCF (.bcfzip) servi', bcf.status === 200 && bcf.bytes.subarray(0, 2).toString() === 'PK' && bcf.headers.get('x-studio-bcf-topics') === '1');
const imp1 = await owner('POST', `${V}/observations/bcf`, { fichierBase64: bcf.bytes.toString('base64') });
check('IF-010 : réimport de notre propre export → sujet nouveau dans ce contexte, identité interne distincte (jamais assimilée)', imp1.status === 200 && imp1.body.crees.length === 1 && imp1.body.crees[0].issueId !== obs.body.issueId, short(imp1.body));
const imp2 = await owner('POST', `${V}/observations/bcf`, { fichierBase64: bcf.bytes.toString('base64') });
check('IF-010 [−] : même BCF-ID, même contexte → reconnu, rien recréé ni réécrit', imp2.status === 200 && imp2.body.crees.length === 0 && imp2.body.reconnus.length === 1, short(imp2.body));
const listeObs = (await owner('GET', `${V}/observations`)).body.observations;
check('EX-084 : la note d\'origine reste un commentaire, l\'observation porte son identité et ses références BCF', listeObs.length === 2 && listeObs.every((o) => o.issueId !== o.id) && listeObs.some((o) => o.bcfRefs?.length === 1));

// --- IF-009 : observation bloquante ---------------------------------------------------------------------------------
const bloq = await owner('POST', `${V}/observations`, { body: 'Issue de secours non conforme', responsableId: editorId, gravite: 'bloquante', audience: 'projet' });
const p1 = await editor('POST', `${V}/publications`, { title: 'Consultation', contenu: 'dessin-2d', usage: 'Consultation des entreprises' });
check('IF-009 : manifeste avec usage et observation bloquante ouverte', p1.status === 201 && p1.body.manifest.usage === 'Consultation des entreprises' && p1.body.manifest.controles?.observations?.[0]?.resolution === 'ouverte', short(p1.body?.manifest));
const refus = await editor('POST', `${PUBS}/${p1.body.id}/soumettre`, {});
check('IF-009 [−] : soumission refusée pour l\'observation bloquante non résolue (409 blocking_observation_open)', refus.status === 409 && refus.body?.error === 'blocking_observation_open' && refus.body.observations?.[0]?.issueId === bloq.body.issueId, short(refus.body));
await owner('POST', `${V}/observations/${bloq.body.id}/decisions`, { nature: 'decision', portee: 'derogation', texte: 'Dérogation : traité au lot suivant' });
check('IF-009 : actualisé après dérogation du propriétaire', (await editor('POST', `${PUBS}/${p1.body.id}/actualiser`, {})).body?.manifest?.controles?.observations?.[0]?.resolution === 'derogee');
const diff1 = await publierJusquA(p1.body.id);
check('IF-009 : publication dérogée approuvée puis diffusée', diff1.status === 200 && diff1.body.diffusionStatus === 'diffuse', short(diff1.body));

// --- TEST-011 : annuler / rétablir, aucune perte de publication -----------------------------------------------------
const ajout = { toolId: 'studio.dessin.ligne', params: { id: 'w', type: 'line', start: { x: 0, y: 9 }, end: { x: 2, y: 9 } } };
await commande([ajout]);
await commande([{ toolId: 'studio.dessin.supprimer', params: { ids: ['w'] } }]);
await commande([ajout]);
const apres = await owner('GET', `${PUBS}/${p1.body.id}`);
const verif = await owner('GET', `${PUBS}/${p1.body.id}/verification`);
check('TEST-011 : après annuler puis rétablir, la publication diffusée reste lisible, son manifeste et ses fichiers inchangés', apres.body?.diffusionStatus === 'diffuse' && apres.body.manifestHash === diff1.body.manifestHash && JSON.stringify(apres.body.diffusion.files) === JSON.stringify(diff1.body.diffusion.files) && verif.body?.identical === true, short(verif.body));
let fichiersOk = true;
for (const f of diff1.body.diffusion.files) { const r = await owner('GET', `${PUBS}/${p1.body.id}/files/${f.format}`, undefined, true); fichiersOk &&= r.status === 200 && sha(r.bytes) === f.sha256; }
check('TEST-011 : chaque fichier du paquet relu à la même empreinte', fichiersOk);

// --- EX-074 / EX-076 : dossier de conception ------------------------------------------------------------------------
const feuille = await owner('POST', `${V}/sheets`, { number: 'D-01', title: 'Détail d\'appui', format: 'A4', orientation: 'portrait', scale: 20, revisionId: study.body.revision.id });
const vue2 = await owner('POST', `${V}/section-views`, { definition: { ...VUE, nom: 'Coupe BB', annotations: [] } });
const dossier = await owner('POST', `${S}/dossiers`, { title: 'Dossier de conception', sheetIds: [feuille.body.id], sectionViewIds: [vue2.body.id] });
check('dossier composé (feuille 2D + vue de coupe)', dossier.status === 201 && dossier.body.sectionViewIds?.[0] === vue2.body.id, short(dossier.body));
const faux = await editor('POST', `${V}/publications`, { title: 'Faux', contenu: 'dossier-conception', dossierId: dossier.body.id, presentations: { [feuille.body.id]: 'extrait-synchronise' } });
check('EX-076 [−] : détail 2D annoncé synchronisé sans association refusé (409 piece_refusee)', faux.status === 409 && faux.body?.refus?.[0]?.code === 'synchronisation_non_fondee', short(faux.body));
const pd = await editor('POST', `${V}/publications`, { title: 'DCE', contenu: 'dossier-conception', dossierId: dossier.body.id, presentations: { [vue2.body.id]: 'extrait-synchronise' } });
const pieces = pd.body?.manifest?.dossier?.pieces ?? [];
check('EX-076 : détail 2D et coupe de maquette réunis, sources distinctes', pd.status === 201 && pieces.length === 2 && pieces[0].origine === 'dessin-2d' && pieces[0].presentation === 'document-independant' && pieces[1].origine === 'derive-maquette' && pieces[0].sources[0].revisionId !== pieces[1].sources[0].revisionId, short(pieces));
const pdDiff = await publierJusquA(pd.body.id);
check('EX-074 : dossier de conception publié (revue, approbation, diffusion) : PDF et JSON', pdDiff.status === 200 && pdDiff.body.diffusion.files.map((f) => f.format).join() === 'pdf,json', short(pdDiff.body));
const json = await owner('GET', `${PUBS}/${pd.body.id}/files/json`, undefined, true);
const contenu = JSON.parse(json.bytes.toString('utf8'));
check('EX-074 : le JSON publié est le dossier, avec sa vue de coupe jointe', contenu.schema === 'studio-dossier-conception/1' && contenu.vuesCoupe?.[0]?.id === vue2.body.id);

// --- REC-E-03 : chaîne contrôlée jusqu'à la diffusion ---------------------------------------------------------------
await owner('POST', `${S}/exigences`, { baseVersion: 0, exigences: [{ id: 'e1', libelle: 'Au plus une ligne', metrique: { type: 'nombre', nature: 'ligne' }, comparaison: '<=', valeur: 1, unite: 'u', source: 'Programme saisi (recette)' }] });
const c1 = await owner('POST', `${V}/controles`, {});
check('REC-E-03 : contrôle exécuté → écart (non satisfaite)', c1.status === 201 && c1.body.execution === 'execute' && c1.body.conclusion === 'non-satisfaite', short(c1.body));
const ecart = await owner('POST', `${V}/observations`, { body: 'Deux lignes pour une exigée', responsableId: editorId, gravite: 'bloquante', audience: 'projet', liens: [{ domaine: 'exigence', ref: 'e1', controleId: c1.body.id }] });
const corr = await commande([{ toolId: 'studio.dessin.supprimer', params: { ids: ['w'] } }], editor);
check('REC-E-03 : correction par l\'éditeur (nouvelle révision)', corr.status === 200);
const c2 = await owner('POST', `${V}/controles`, {});
check('REC-E-03 : nouveau contrôle satisfait sur la révision corrigée', c2.body?.conclusion === 'satisfaite' && c2.body.revisionId === head, short(c2.body));
const t1 = await editor('POST', `${V}/observations/${ecart.body.id}/transitions`, { action: 'corriger', revisionId: head });
const t2 = await owner('POST', `${V}/observations/${ecart.body.id}/transitions`, { action: 'recontroler', revisionId: head });
const t3 = await owner('POST', `${V}/observations/${ecart.body.id}/transitions`, { action: 'cloturer', note: 'Contrôle satisfait' });
check('REC-E-03 : observation corrigée, recontrôlée, clôturée', t1.status === 200 && t2.status === 200 && t3.status === 200 && t3.body.statut === 'cloturee', short([t1.body, t2.body, t3.body].map((x) => x?.error ?? x?.statut)));
const pf = await editor('POST', `${V}/publications`, { title: 'Étude contrôlée', contenu: 'dessin-2d' });
const ctr = pf.body?.manifest?.controles;
check('REC-E-03 : manifeste — règle (jeu v1), rapport conforme de la révision corrigée, observation bloquante résolue', ctr?.regles?.[0]?.version === '1' && ctr.rapports?.[0]?.controleId === c2.body.id && ctr.rapports[0].conclusion === 'conforme' && ctr.observations.find((o) => o.issueId === ecart.body.issueId)?.resolution === 'resolue', short(ctr));
const pfDiff = await publierJusquA(pf.body.id);
check('REC-E-03 : approuvée et diffusée', pfDiff.status === 200 && pfDiff.body.diffusionStatus === 'diffuse', short(pfDiff.body));

// --- Interface : publications affichées après annuler / rétablir (TEST-011), dossier et contrôles (EX-074, IF-009) ----
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* Playwright absent : contrôle d'interface déclaré non exécuté */ }
const shell = await fetch(`${BASE}/projets/${projectId}`).then((r) => r.text()).catch(() => '');
if (chromium && /<div id="root"/.test(shell)) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  const ctx = await browser.newContext();
  await ctx.addCookies(owner.cookie().split('; ').filter(Boolean).map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: BASE })));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/studio/projets/${projectId}/etudes/${studyId}`);
  const carte1 = page.locator(`li[data-studio-publication="${p1.body.id}"]`);
  const vue1 = await carte1.waitFor({ timeout: 30000 }).then(() => true, () => false);
  // Entre-temps, la diffusion de REC-E-03 (même variante, même contenu) l'a remplacée : remplacée n'est pas perdue.
  check('TEST-011 (interface) : après annuler / rétablir (puis remplacement), la publication diffusée reste affichée avec ses fichiers', vue1 && (await carte1.getAttribute('data-diffusion')) === 'remplace'
    && (await carte1.locator('[data-studio-publication-fichier]').count()) === diff1.body.diffusion.files.length, String(vue1));
  check('IF-009 (interface) : contrôles du manifeste affichés, observation bloquante dérogée', (await carte1.locator('[data-studio-publication-observation="derogee"]').count()) === 1);
  const carteD = page.locator(`li[data-studio-publication="${pd.body.id}"]`);
  check('EX-074 / EX-076 (interface) : dossier de conception publié, pièces avec origine et présentation', (await carteD.getAttribute('data-contenu')) === 'dossier-conception'
    && (await carteD.locator('[data-studio-publication-pieces] li[data-origine="dessin-2d"][data-presentation="document-independant"]').count()) === 1
    && (await carteD.locator('[data-studio-publication-pieces] li[data-origine="derive-maquette"][data-presentation="extrait-synchronise"]').count()) === 1
    && (await carteD.locator('[data-studio-publication-fichier="json"]').count()) === 1);
  await browser.close();
} else console.log(`– interface : non exécuté (${chromium ? "l'API ne sert pas l'application web" : 'Playwright absent'})`);

console.log(failures === 0 ? '\nRecette lot PUB : tout est conforme.' : `\nRecette lot PUB : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
