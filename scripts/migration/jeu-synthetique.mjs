#!/usr/bin/env node
/**
 * Jeu SYNTHÉTIQUE déclaré pour la recette de la simulation de migration : peuple une base NEUVE (schéma appliqué par
 * `npm run db:migrate`, aucun projet) avec des données inventées pour l'essai, couvrant chaque règle de classement.
 * Ce ne sont pas des données de projet : tous les codes commencent par « SYNTH- », tous les comptes sont
 * `@synthetique.invalid`, et les valeurs (cotes, hauteurs) ne servent qu'à exercer les règles.
 *
 * Gardes (toutes avant la première écriture) :
 * - `FADI_JEU_SYNTHETIQUE` doit être exactement le nom de la base connectée, et ce nom doit se terminer par `_mig` ou
 *   `_synth` (une base de recette nommée comme telle, jamais une base de travail) ;
 * - dans LA transaction d'écriture, après `LOCK TABLE … IN ACCESS EXCLUSIVE MODE` sur toutes les tables du schéma
 *   `public` (hors tables d'extension comme `spatial_ref_sys`), chaque table est recomptée : une seule ligne quelque
 *   part → refus et ROLLBACK. Le verrou interdit qu'une écriture concurrente se glisse entre le contrôle et le jeu.
 *
 *   FADI_JEU_SYNTHETIQUE=fadi_mig DATABASE_URL=postgresql://…/fadi_mig node scripts/migration/jeu-synthetique.mjs [--file-locale <fichier>]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const pt = (x, y) => ({ x, y, frame: 'local', unit: 'm' });
const m = (value) => ({ value, unit: 'm' });
const deg = (value) => ({ value, unit: 'deg' });
const esq = (forme, points, extra = {}) => ({ forme, points, ferme: false, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null, ...extra });
const mur = (a, b, extra = {}) => ({ a, b, epaisseur: m(0.2), hauteur: m(2.7), niveauHautId: null, alignement: 'gauche', exterieur: true, nom: null, ...extra });
const baie = (murHoteId, extra = {}) => ({ murHoteId, position: 0.5, largeur: m(1.2), hauteur: m(1), allege: m(0.9), repere: null, ...extra });

export const PROJETS = Object.freeze({ P1: 'synth-p1', P2: 'synth-p2', P3: 'synth-p3' });
export const COMPTES = Object.freeze({ U1: 'synth-u1', U2: 'synth-u2' });

/** Objets du projet P1 : [id, classe, niveau, params, extra]. Attendus documentés dans recette-simulation.mjs. */
export const OBJETS_P1 = Object.freeze([
  ['l1', 'esquisse', 'rdc', esq('ligne', [pt(0, 0), pt(4, 0)]), { calque_id: 'c-dessin', groupe_id: 'g1' }],
  ['pl1', 'esquisse', 'rdc', esq('polyligne', [pt(0, 1), pt(2, 1), pt(2, 3)], { renflements: [0, 0.5] }), {}],
  ['pg1', 'esquisse', 'rdc', esq('polygone', [pt(5, 0), pt(6, 0), pt(6, 1)]), {}],
  ['c1', 'esquisse', 'rdc', esq('cercle', [], { centre: pt(8, 8), rayon: m(0.5) }), {}],
  ['a1', 'esquisse', 'rdc', esq('arc', [], { centre: pt(9, 9), rayon: m(1), angleDebut: deg(0), angleFin: deg(90) }), {}],
  ['r1', 'esquisse', 'rdc', esq('rectangle', [pt(1, 1), pt(3, 2)]), {}],
  ['r2', 'esquisse', 'rdc', esq('rectangle', [pt(0, 0), pt(1, 1), pt(0, 2), pt(-1, 1)]), {}],
  ['s1', 'esquisse', 'rdc', esq('spline', [pt(0, 0), pt(1, 2), pt(3, 1)]), {}],
  ['e1', 'esquisse', 'rdc', esq('ellipse', [], { centre: pt(0, 0), rayon: m(2), rayonB: m(1), rotation: deg(0) }), {}],
  ['h1', 'esquisse', 'rdc', esq('hachure', [pt(0, 0), pt(1, 0), pt(1, 1)], { ferme: true, motif: 'beton' }), {}],
  ['t1', 'texte', 'rdc', { position: pt(1, 1), texte: 'Texte synthétique' }, {}],
  ['k1', 'cotation', 'rdc', { a: pt(0, 0), b: pt(4, 0), decalage: m(0.5) }, {}],
  ['m1', 'mur', 'rdc', mur(pt(0, 5), pt(5, 5)), { calque_id: 'c-murs' }],
  ['m2', 'mur', 'rdc', mur(pt(0, 6), pt(5, 6), { renflement: 0.3 }), {}],
  ['m3', 'mur', 'rdc', mur(pt(0, 7), pt(5, 7), { hauteur: null }), {}],
  ['m4', 'mur', 'rdc', mur(pt(6, 5), pt(9, 5), { alignement: 'droite' }), {}],
  ['f1', 'fenetre', 'rdc', baie('m1'), {}],
  ['d1', 'porte', 'rdc', baie('m1', { position: 0.1, allege: null }), {}],
  ['o1', 'ouverture', 'rdc', baie('m2'), {}],
  ['dl1', 'dalle', 'rdc', { contour: [pt(0, 0), pt(5, 0), pt(5, 5)], trous: [], epaisseur: m(0.2), decalageBase: m(0), nom: null }, {}],
  ['po1', 'poteau', 'rdc', { centre: pt(2, 2) }, {}],
  ['bo1', 'bloc-occurrence', 'rdc', { definitionId: 'b1', position: pt(3, 3) }, {}],
  ['pm1', 'piece-mecanique', 'rdc', { nom: 'synthétique' }, {}],
  ['x1', 'classe-fantome', 'rdc', { quoi: 'inconnu' }, {}],
  ['bad1', 'esquisse', 'rdc', { forme: 'ligne' }, {}],
  ['deg1', 'esquisse', 'rdc', esq('ligne', [pt(2, 2), pt(2, 2)]), {}],
  ['sn1', 'esquisse', null, esq('ligne', [pt(0, 0), pt(1, 0)]), {}],
  ['pl2', 'esquisse', 'rdc', esq('polyligne', [pt(10, 0), pt(12, 0), pt(12, 2)], { renflements: [0.4] }), {}],
  ['a2', 'esquisse', 'rdc', esq('arc', [], { centre: pt(9, 9), rayon: m(1), angleDebut: deg(30), angleFin: deg(30) }), {}],
  ['l2', 'esquisse', 'r1', esq('ligne', [pt(0, 0), pt(0, 3)]), { proprietes: { usage: 'synthétique' }, phase: 'existant' }],
]);

const sha = (b) => createHash('sha256').update(b).digest('hex');

export const SUFFIXES_BASE_SYNTHETIQUE = Object.freeze(['_mig', '_synth']);
export const nomBaseSynthetiqueAdmis = (nom) => typeof nom === 'string' && SUFFIXES_BASE_SYNTHETIQUE.some((s) => nom.endsWith(s) && nom.length > s.length);

/** Tables du schéma public hors extensions, verrouillées en exclusif puis recomptées (dans la transaction ouverte). */
async function verrouillerEtExigerVide(q) {
  const tables = (await q(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relname`)).rows.map((r) => r.relname);
  if (!tables.length) throw new Error('aucune table dans public : schéma non appliqué (npm run db:migrate) — refus d\'écrire.');
  const noms = tables.map((t) => `public.${pg.escapeIdentifier(t)}`);
  await q(`LOCK TABLE ${noms.join(', ')} IN ACCESS EXCLUSIVE MODE`);
  const pleines = [];
  for (const [i, t] of tables.entries()) {
    const n = (await q(`SELECT count(*)::int AS n FROM ${noms[i]}`)).rows[0].n;
    if (n) pleines.push(`${t} (${n})`);
  }
  if (pleines.length) throw new Error(`Base non neuve : ${pleines.length} table(s) non vide(s) — ${pleines.join(', ')} : refus d'écrire.`);
  return tables.length;
}

export async function peupler(client, { fileLocale } = {}) {
  const base = (await client.query('SELECT current_database() AS nom')).rows[0].nom;
  if (process.env.FADI_JEU_SYNTHETIQUE !== base) throw new Error(`FADI_JEU_SYNTHETIQUE doit nommer la base connectée (${base}) : refus d'écrire.`);
  if (!nomBaseSynthetiqueAdmis(base)) throw new Error(`Le nom de la base (${base}) doit se terminer par ${SUFFIXES_BASE_SYNTHETIQUE.join(' ou ')} : refus d'écrire.`);
  const q = (sql, params) => client.query(sql, params);
  await q('BEGIN');
  try {
    await verrouillerEtExigerVide(q);
    await q('SET CONSTRAINTS ALL DEFERRED');
    for (const [id, n] of [[COMPTES.U1, 1], [COMPTES.U2, 2]]) {
      await q('INSERT INTO public.users (id, email, password_hash, atelier_ensembles) VALUES ($1, $2, $3, $4)', [id, `synth-${n}@synthetique.invalid`, 'synthetique-sans-mot-de-passe', n === 1 ? JSON.stringify([{ nom: 'Ensemble synthétique' }]) : null]);
    }
    await q("INSERT INTO public.studio_tool_preferences (user_id, profile) VALUES ($1, 'standard')", [COMPTES.U1]);
    for (const [id, code] of [[PROJETS.P1, 'SYNTH-1'], [PROJETS.P2, 'SYNTH-2'], [PROJETS.P3, 'SYNTH-3']]) {
      await q('INSERT INTO public.projects (id, owner_id, code, name, model_revision) VALUES ($1, $2, $3, $4, 3)', [id, COMPTES.U1, code, `Projet synthétique ${code}`]);
      await q("INSERT INTO public.project_members (project_id, user_id, role, invited_by) VALUES ($1, $2, 'owner', 'synthetique')", [id, COMPTES.U1]);
    }
    await q("INSERT INTO public.project_members (project_id, user_id, role, invited_by) VALUES ($1, $2, 'editor', 'synthetique')", [PROJETS.P1, COMPTES.U2]);
    const P1 = PROJETS.P1;
    await q("INSERT INTO public.atelier_niveaux (project_id, id, nom, elevation, hauteur, ordre) VALUES ($1, 'rdc', 'RDC', 0, 3, 0), ($1, 'r1', 'R+1', 3, NULL, 1)", [P1]);
    await q("INSERT INTO public.atelier_calques (project_id, id, nom, ordre) VALUES ($1, 'c-murs', 'Murs', 0)", [P1]);
    await q("INSERT INTO public.atelier_calques (project_id, id, nom, ordre, parent_id) VALUES ($1, 'c-dessin', 'Dessin', 1, 'c-murs')", [P1]);
    await q("INSERT INTO public.atelier_calques (project_id, id, nom, ordre, gele) VALUES ($1, 'c-gele', 'Gelé', 2, true)", [P1]);
    await q("INSERT INTO public.atelier_groupes (project_id, id, nom) VALUES ($1, 'g1', 'Groupe synthétique')", [P1]);
    for (const [id, classe, niveau, params, extra] of OBJETS_P1) {
      await q('INSERT INTO public.atelier_objets (project_id, id, classe, niveau_id, calque_id, groupe_id, phase, params, proprietes, model_revision) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 3)',
        [P1, id, classe, niveau, extra.calque_id ?? null, extra.groupe_id ?? null, extra.phase ?? null, JSON.stringify(params), JSON.stringify(extra.proprietes ?? {})]);
    }
    for (const [id, kind, s, t] of [['rel-f1', 'heberge-par', 'f1', 'm1'], ['rel-d1', 'heberge-par', 'd1', 'm1'], ['rel-o1', 'heberge-par', 'o1', 'm2'], ['rel-x', 'heberge-par', 'f1', 'm4'], ['rel-j', 'joint-a', 'm1', 'm3'], ['rel-k', 'reference', 'k1', 'm1']]) {
      await q('INSERT INTO public.atelier_relations (project_id, id, kind, source_id, target_id) VALUES ($1, $2, $3, $4, $5)', [P1, id, kind, s, t]);
    }
    for (const [id, classe] of [['b1', 'bloc'], ['cp1', 'composant'], ['pl-1', 'planche'], ['v1', 'vue'], ['xref1', 'reference-externe']]) {
      await q('INSERT INTO public.atelier_definitions (project_id, id, classe, nom) VALUES ($1, $2, $3, $4)', [P1, id, classe, `Définition ${id}`]);
    }
    await q("INSERT INTO public.atelier_references (project_id, id, proprietaire_id, objet_id, caracteristique, etat) VALUES ($1, 'ref1', 'k1', 'm1', 'face-gauche', 'a-reparer')", [P1]);
    await q("INSERT INTO public.atelier_site (project_id, parcelle, ontologies) VALUES ($1, $2, $3)", [P1, JSON.stringify({ sommets: [{ id: 's1', cadastral: { x: 1, y: 2, frame: 'cadastral', crs: 'synthetique', unit: 'm' }, local: pt(0, 0) }] }), JSON.stringify(['mechanical'])]);
    for (const [n, contract] of [[1, 'atelier-commands/2'], [2, 'atelier-commands/3'], [3, 'atelier-commands/3']]) {
      await q("INSERT INTO public.atelier_commands (id, project_id, request_id, contract, label, base_revision, result_revision, commands, inverse, effets, reponse, author_id) VALUES ($1, $2, $3, $4, 'synthétique', $5, $6, '[]', '{}', '{}', '{}', $7)",
        [`synth-cmd-${n}`, P1, `synth-req-${n}`, contract, n - 1, n, COMPTES.U1]);
    }
    await q("INSERT INTO public.atelier_versions (id, project_id, nom, revision, empreinte, modele, author_id) VALUES ('synth-v1', $1, 'Version synthétique', 2, 'empreinte-synthetique', '{}', $2)", [P1, COMPTES.U1]);
    const intact = Buffer.from('pièce synthétique intacte');
    const altere = Buffer.from('pièce synthétique dont l’empreinte ne correspond pas');
    await q("INSERT INTO public.volumes (id, mime, size, content) VALUES ($1, 'text/plain', $2, $3)", [sha(intact), intact.byteLength, intact]);
    await q("INSERT INTO public.volumes (id, mime, size, content) VALUES ($1, 'text/plain', $2, $3)", ['f'.repeat(64), altere.byteLength, altere]);
    const doc = (fileName, volumeId, size) => ({ kind: 'synthetique', label: fileName, fileName, volumeId, mime: 'text/plain', size, inputHash: 'synthetique' });
    await q("INSERT INTO public.atelier_publications (id, project_id, version_id, nom, revision, empreinte, catalogues, documents, author_id) VALUES ('synth-pub-ok', $1, 'synth-v1', 'Publication intacte', 2, 'e', '{}', $2, $3)", [P1, JSON.stringify([doc('a.txt', sha(intact), intact.byteLength)]), COMPTES.U1]);
    await q("INSERT INTO public.atelier_publications (id, project_id, version_id, nom, revision, empreinte, catalogues, documents, author_id) VALUES ('synth-pub-rompue', $1, 'synth-v1', 'Publication rompue', 2, 'e', '{}', $2, $3)", [P1, JSON.stringify([doc('a.txt', sha(intact), intact.byteLength), doc('absente.txt', '0'.repeat(64), 3), doc('alteree.txt', 'f'.repeat(64), altere.byteLength)]), COMPTES.U1]);
    await q("INSERT INTO public.atelier_outbox (id, project_id, event_type, payload) VALUES ('synth-evt-attente', $1, 'atelier.modele.modifie', '{}')", [P1]);
    await q("INSERT INTO public.atelier_outbox (id, project_id, event_type, payload, processed_at) VALUES ('synth-evt-traite', $1, 'atelier.modele.modifie', '{}', now())", [P1]);
    await q("INSERT INTO public.project_comments (id, project_id, author_id, author_email, body, atelier_revision) VALUES ('synth-com-1', $1, $2, 'synth-1@synthetique.invalid', 'Commentaire synthétique', 2)", [P1, COMPTES.U1]);
    await q("INSERT INTO public.atelier_scripts (project_id, script_id, version, contenu, author_id) VALUES ($1, 'synth-script', 1, '{}', $2)", [P1, COMPTES.U1]);
    await q("INSERT INTO public.atelier_propositions (id, project_id, intention, cle, generateur, explication, commandes, hypotheses, iterations, statut, revision_base, author_id) VALUES ('synth-prop', $1, 'synthétique', 'cle', 'synthetique', 'synthétique', '[]', '[]', '[]', 'proposee', 1, $2)", [P1, COMPTES.U1]);
    const fichier = Buffer.from('export synthétique');
    await q("INSERT INTO public.drawing_exports (id, project_id, kind, file_name, mime, content, size, model_revision, native_hash, created_by) VALUES ('synth-exp', $1, 'svg', 'plan.svg', 'image/svg+xml', $2, $3, 2, 'synthetique', $4)", [P1, fichier, fichier.byteLength, COMPTES.U1]);
    await q("INSERT INTO public.produced_documents (project_id, kind, label, file_name, model_revision, input_hash) VALUES ($1, 'synthetique', 'Document synthétique', 'doc.pdf', 2, 'synthetique')", [P1]);
    // P2 : variante Atelier de P1, un niveau et une ligne, et une étude Studio déjà existante (coexistence).
    const P2 = PROJETS.P2;
    await q("INSERT INTO public.atelier_variants (project_id, parent_id, nom, fork_revision, base_revision, fork_empreinte, author_id) VALUES ($1, $2, 'Variante synthétique', 2, 2, 'e', $3)", [P2, P1, COMPTES.U1]);
    await q("INSERT INTO public.atelier_niveaux (project_id, id, nom, elevation, hauteur, ordre) VALUES ($1, 'rdc', 'RDC', 0, 3, 0)", [P2]);
    await q("INSERT INTO public.atelier_objets (project_id, id, classe, niveau_id, params, model_revision) VALUES ($1, 'l1', 'esquisse', 'rdc', $2, 3)", [P2, JSON.stringify(esq('ligne', [pt(0, 0), pt(1, 1)]))]);
    const document = { id: 'synth-doc', schemaVersion: 'studio-document/1', units: 'm', frame: 'local-2d', objects: [] };
    await q("INSERT INTO public.studio_studies (id, project_id, name, initial_variant_id) VALUES ('synth-etude', $1, 'Étude synthétique', 'synth-variante')", [P2]);
    await q("INSERT INTO public.studio_variants (id, study_id, name, head_revision_id) VALUES ('synth-variante', 'synth-etude', 'Initiale', 'synth-revision')");
    await q("INSERT INTO public.studio_revisions (id, variant_id, parent_revision_id, document, request_id, payload_hash, source, author_id, response) VALUES ('synth-revision', 'synth-variante', NULL, $1, 'synth-init', $2, 'study-initialization', $3, '{}')", [JSON.stringify(document), sha('synth-init'), COMPTES.U1]);
    await q('COMMIT');
  } catch (err) {
    await q('ROLLBACK').catch(() => undefined);
    throw err;
  }
  if (fileLocale) {
    // Export d'un brouillon Studio hors ligne (format de AvisFileLocale.tsx), synthétique lui aussi.
    const donnees = JSON.stringify({ version: 1, userId: COMPTES.U1, pas: [[{ toolId: 'studio.dessin.ligne', params: {} }]], refaire: [], plan: null, conflit: null });
    fs.writeFileSync(fileLocale, JSON.stringify({ format: 'fadi-studio-file-locale/1', raison: 'synthetique', exporteeA: '2026-10-19T00:00:00.000Z', ligne: { cle: `${COMPTES.U1}|${PROJETS.P2}|synth-etude|synth-variante`, userId: COMPTES.U1, projectId: PROJETS.P2, stamp: 'synth', donnees, majA: '2026-10-19T00:00:00.000Z' } }, null, 2));
  }
  return { base, projets: Object.values(PROJETS).length, objets: OBJETS_P1.length + 1 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--file-locale');
  const fileLocale = i > 0 ? process.argv[i + 1] : undefined;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: 'fadi-jeu-synthetique' });
  client.connect()
    .then(() => peupler(client, { fileLocale }))
    .then((r) => console.log(`Jeu synthétique écrit dans ${r.base} : ${r.projets} projets, ${r.objets} objets.`))
    .catch((err) => { console.error(`jeu synthétique refusé : ${err.message}`); process.exitCode = 2; })
    .finally(() => client.end());
}
