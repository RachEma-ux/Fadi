// Simulation de migration (MIG-01 à MIG-10, MIG-COEX-03/04/06) : logique pure, sans base ni réseau.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLASSES_ATELIER, FichierIllisible, FORMES_ESQUISSE, HYPOTHESES, REGLES, REQUETES, STATUTS, canonique, controlerEnAttente,
  controlerPublications, nomMasque, planEcriture, rapportMarkdown, recenserFileLocale, sha256, simuler,
} from './migration-lib.mjs';
import { executer, lireArguments } from './simuler-migration.mjs';
import { estCopieMarquee, ouvrirSessionLecture, RefusLecture } from './lecture.mjs';
import { nomBaseSynthetiqueAdmis } from './jeu-synthetique.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pt = (x, y) => ({ x, y, frame: 'local', unit: 'm' });
const m = (value) => ({ value, unit: 'm' });
const esq = (forme, points, extra = {}) => ({ forme, points, ferme: false, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null, ...extra });
const obj = (id, classe, params, extra = {}) => ({ project_id: 'p1', id, classe, niveau_id: 'rdc', definition_id: null, calque_id: null, groupe_id: null, phase: null, params, proprietes: {}, model_revision: 4, verrouille: false, ...extra });
const mur = (extra = {}) => ({ a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(2.5), niveauHautId: null, alignement: 'gauche', exterieur: false, nom: null, ...extra });

function lignes(objets, extra = {}) {
  return {
    projects: [{ id: 'p1', owner_id: 'u-secret', code: 'T-1', name: 'Test', model_revision: 4 }],
    project_members: [{ project_id: 'p1', user_id: 'u-secret', role: 'owner' }],
    atelier_niveaux: [{ project_id: 'p1', id: 'rdc', nom: 'RDC', elevation: 1.5, hauteur: 3, ordre: 0 }],
    atelier_objets: objets,
    atelier_calques: [], atelier_relations: [], atelier_definitions: [], atelier_groupes: [], atelier_references: [], atelier_site: [],
    atelier_commands: [{ project_id: 'p1', n: 2, rmin: 1, rmax: 2, contrats: ['atelier-commands/3'] }],
    atelier_versions: [], atelier_variants: [], atelier_scripts: [], atelier_propositions: [], atelier_outbox: [], project_comments: [],
    users: [{ id: 'u-secret', ensembles: true }], studio_tool_preferences: [], atelier_publications: [], volumes: [], drawing_exports: [],
    produced_documents: [], studio_studies: [], studio_publications: [],
    ...extra,
  };
}
const H = ['repere-local-identite', 'base-elevation-niveau'];
const element = (r, ancienne) => r.projets.flatMap((p) => p.elements).find((e) => e.ancienne === ancienne);

describe('règles de classement (MIG-05)', () => {
  it('chaque règle est sourcée (fichiers et symboles du dépôt) ou marquée non évaluée, jamais convertible sans source', () => {
    for (const [id, r] of Object.entries(REGLES)) {
      assert.ok(STATUTS.includes(r.statut), id);
      if (r.evaluation === 'non évalué') {
        assert.equal(r.sources.length, 0, id);
        assert.equal(r.statut, 'ambigu', `${id} : une règle non évaluée ne convertit rien`);
      } else {
        assert.equal(r.evaluation, 'sourcée', id);
        assert.ok(r.sources.length > 0, id);
        for (const s of r.sources) {
          const texte = fs.readFileSync(path.join(RACINE, s.fichier), 'utf8');
          const symbole = s.symbole.split(/[ ,*.]/).find(Boolean);
          assert.ok(texte.includes(symbole), `${id} : « ${symbole} » absent de ${s.fichier}`);
        }
      }
      for (const h of r.hypotheses ?? []) assert.ok(Object.hasOwn(HYPOTHESES, h), `${id} : hypothèse ${h}`);
    }
  });

  it('formes d\'esquisse relevées dans modele.ts (dérive contrôlée)', () => {
    const src = fs.readFileSync(path.join(RACINE, 'packages/atelier-model/src/modele.ts'), 'utf8');
    const union = src.match(/export type FormeEsquisse = ([^;]+);/)[1];
    assert.deepEqual([...union.matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort(), [...FORMES_ESQUISSE].sort());
    assert.ok(CLASSES_ATELIER.length > 40);
  });

  it('requêtes de lecture : uniquement des SELECT, aucun courriel, mot de passe ni contenu de fichier', () => {
    for (const [t, { sql, mig }] of Object.entries(REQUETES)) {
      assert.match(sql, /^SELECT\s/, t);
      for (const [, nom] of sql.matchAll(/\bFROM\s+([a-z_.]+)/gi)) assert.ok(nom.startsWith('public.'), `${t} : table non qualifiée ${nom}`);
      assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|COPY)\b/i, t);
      assert.doesNotMatch(sql, /email|password|body\b|\bmodele\b/i, t);
      assert.ok(!/\bcontent\b/.test(sql.replace(/octet_length\(content\)|sha256\(content\)/g, '')), `${t} : contenu lu`);
      assert.ok(mig.length > 0, t);
    }
  });
});

describe('simulation : classement, hypothèses et identités', () => {
  const objets = [
    obj('l1', 'esquisse', esq('ligne', [pt(0, 0), pt(4, 0)])),
    obj('a1', 'esquisse', esq('arc', [], { centre: pt(1, 1), rayon: m(1), angleDebut: { value: -90, unit: 'deg' }, angleFin: { value: 90, unit: 'deg' } })),
    obj('r1', 'esquisse', esq('rectangle', [pt(3, 2), pt(1, 1)])),
    obj('r2', 'esquisse', esq('rectangle', [pt(0, 0), pt(1, 1), pt(0, 2), pt(-1, 1)])),
    obj('s1', 'esquisse', esq('spline', [pt(0, 0), pt(1, 1)])),
    obj('w1', 'mur', mur()),
    obj('w2', 'mur', mur({ alignement: 'droite' })),
    obj('w3', 'mur', mur({ alignement: 'axe', renflement: 0.4 })),
    obj('w4', 'mur', mur({ hauteur: null })),
    obj('f1', 'fenetre', { murHoteId: 'w1', position: 0.5, largeur: m(1), hauteur: m(1), allege: m(1), repere: 'F1', menuiserie: { type: 'x' } }),
    obj('t1', 'texte', { position: pt(0, 0), texte: 'contenu privé de l\'annotation' }),
    obj('z1', 'dalle', { contour: [], trous: [] }),
    obj('k0', 'inconnue', {}),
    obj('b0', 'esquisse', { forme: 'ligne' }),
  ];

  it('sans hypothèse déclarée, la géométrie reste ambiguë (hypothèse manquante nommée), rien n\'est converti', () => {
    const r = simuler(lignes(objets), { horodatage: 'fixe' });
    const l1 = element(r, 'atelier_objets:p1/l1');
    assert.equal(l1.statut, 'ambigu');
    assert.deepEqual(l1.hypothesesManquantes, ['repere-local-identite']);
    assert.equal(r.correspondances.filter((c) => c.ancienne.startsWith('atelier_objets')).length, 0);
    assert.equal(r.documentsSimules.length, 0);
    assert.ok(r.hypotheses.find((h) => h.id === 'repere-local-identite').origine === 'non déclarée');
  });

  it('MIG-05 : un même passage classe des éléments dans les quatre catégories — compatible (projet, membre, étude Studio), convertible, ambigu, non convertible — et chacun dans une seule', () => {
    const r = simuler(lignes(objets, { studio_studies: [{ id: 'st1', project_id: 'p1' }] }), { hypotheses: H, horodatage: 'fixe' });
    const els = r.projets.flatMap((p) => p.elements);
    const statutDe = (ancienne) => els.find((e) => e.ancienne === ancienne)?.statut;
    assert.equal(statutDe('projet:p1'), 'compatible');
    assert.equal(els.find((e) => e.ancienne.startsWith('membre:p1/'))?.statut, 'compatible');
    assert.equal(statutDe('studio_studies:st1'), 'compatible');
    assert.equal(statutDe('atelier_objets:p1/l1'), 'convertible');
    assert.equal(statutDe('atelier_objets:p1/r2'), 'ambigu');
    assert.equal(statutDe('atelier_objets:p1/s1'), 'non-convertible');
    assert.deepEqual([...new Set(els.map((e) => e.statut))].sort(), [...STATUTS].sort());
    for (const e of els) assert.ok(STATUTS.includes(e.statut), `${e.ancienne} : ${e.statut}`);
    // Un élément compatible est repris tel quel (même identité), sans conversion ni hypothèse.
    const projet = els.find((e) => e.ancienne === 'projet:p1');
    assert.equal(projet.nouvelle, 'projet:p1');
    assert.equal(REGLES[projet.regle].statut, 'compatible');
  });

  it('sous hypothèses déclarées : conversions sourcées (arc en radians, rectangle aligné, justification, position)', () => {
    const r = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe' });
    const st = (id) => element(r, `atelier_objets:p1/${id}`).statut;
    assert.deepEqual(['l1', 'a1', 'r1', 'w1', 'w2', 'f1'].map(st), Array(6).fill('convertible'));
    assert.equal(st('r2'), 'ambigu');
    assert.equal(st('s1'), 'non-convertible');
    assert.equal(st('w3'), 'non-convertible');
    assert.equal(st('w4'), 'ambigu');
    assert.equal(st('t1'), 'ambigu');
    assert.equal(st('z1'), 'non-convertible');
    const doc = r.documentsSimules[0].document;
    const arc = doc.objects.find((o) => o.type === 'arc');
    assert.ok(Math.abs(arc.startAngle - 1.5 * Math.PI) < 1e-12 && Math.abs(arc.endAngle - Math.PI / 2) < 1e-12);
    assert.deepEqual(doc.objects.find((o) => o.type === 'rectangle'), { id: doc.objects.find((o) => o.type === 'rectangle').id, type: 'rectangle', origin: { x: 1, y: 1 }, width: 2, height: 1 });
    const [w1, w2, f1] = ['w1', 'w2', 'f1'].map((id) => doc.architecture.find((o) => r.correspondances.find((c) => c.ancienne === `atelier_objets:p1/${id}`).nouvelle.endsWith(o.id)));
    assert.equal(w1.justification, 'right');
    assert.equal(w2.justification, 'left');
    assert.equal(w1.base, 1.5, 'base = élévation du niveau, sous hypothèse déclarée');
    assert.equal(f1.hostId, w1.id);
    assert.equal(f1.position, 2, 'centre Atelier 0,5 × 5 = 2,5 → bord de début Studio 2,5 − 1 / 2');
    assert.equal(f1.kind, 'fenetre');
    // Paramètres non portés : pertes listées une à une (repère, menuiserie), jamais silencieuses.
    const pertesF1 = r.pertes.filter((p) => p.element === 'atelier_objets:p1/f1').map((p) => p.perte).join(' ; ');
    assert.match(pertesF1, /menuiserie/);
    assert.match(pertesF1, /repere/);
    assert.match(pertesF1, /élévation du niveau/);
  });

  it('MIG-07 : une correspondance par transformation, nouvelle identité distincte, filiation avec empreinte de la source', () => {
    const r = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe' });
    const convertis = r.projets.flatMap((p) => p.elements).filter((e) => e.statut === 'convertible' && e.ancienne.startsWith('atelier_objets'));
    for (const e of convertis) {
      const c = r.correspondances.filter((x) => x.ancienne === e.ancienne);
      assert.equal(c.length, 1, e.ancienne);
      const id = e.ancienne.split('/').pop();
      assert.ok(!c[0].nouvelle.endsWith(`/${id}`), 'continuité des identifiants non présumée');
      const source = objets.find((o) => o.id === id);
      assert.equal(c[0].filiation.source.empreinteParams, sha256(canonique(source.params)));
      assert.ok(c[0].filiation.hypotheses.includes('correspondance-explicite'));
      assert.ok(c[0].filiation.transformations.length >= 2);
    }
    assert.equal(new Set(r.correspondances.map((c) => c.nouvelle)).size, r.correspondances.length);
  });

  it('MIG-09 : rien n\'est omis — chaque ligne lue a son élément ; chaque non-convertible est conservé et signalé', () => {
    const r = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe' });
    const els = r.projets.flatMap((p) => p.elements).filter((e) => e.ancienne.startsWith('atelier_objets'));
    assert.deepEqual(els.map((e) => e.ancienne.split('/').pop()).sort(), objets.map((o) => o.id).sort());
    const nc = els.filter((e) => e.statut === 'non-convertible');
    assert.ok(nc.length >= 3);
    for (const e of nc) assert.match(r.nonConvertibles.find((x) => x.element === e.ancienne).traitement, /conservé.*jamais supprimé/);
    assert.equal(r.mandat.ecriture, 'aucune');
  });

  it('MIG-10 : erreurs partielles rattachées à leur élément et comptées par projet ; aucun taux global', () => {
    const r = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe' });
    assert.deepEqual(r.erreursPartielles.map((e) => [e.element, e.code]).sort(), [['atelier_objets:p1/b0', 'parametres-illisibles'], ['atelier_objets:p1/k0', 'classe-inconnue']]);
    assert.equal(r.synthese.parProjet[0].erreurs, 2);
    const cles = [];
    const parcourir = (v) => { if (Array.isArray(v)) v.forEach(parcourir); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { cles.push(k); parcourir(x); } };
    parcourir(r);
    assert.deepEqual(cles.filter((k) => /^(taux|reussite|réussite|pourcent|rate|ratio)/i.test(k)), []);
    const md = rapportMarkdown(r);
    for (const e of r.erreursPartielles) assert.ok(md.includes(e.element));
    assert.match(md, /Aucun taux global/);
  });

  it('validateur Studio injecté : un refus reste rattaché à l\'objet, qui sort du document et de la table de correspondance', () => {
    const refuseA1 = (doc) => { if (doc.objects.some((o) => o.type === 'arc')) throw new Error('arc refusé (essai)'); };
    const r = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe', validerDocument: refuseA1 });
    const a1 = element(r, 'atelier_objets:p1/a1');
    assert.equal(a1.statut, 'ambigu');
    assert.equal(a1.rejetStudio, 'arc refusé (essai)');
    assert.ok(r.erreursPartielles.some((e) => e.element === 'atelier_objets:p1/a1' && e.code === 'refus-validateur-studio'));
    assert.ok(!r.correspondances.some((c) => c.ancienne === 'atelier_objets:p1/a1'));
    assert.ok(!r.documentsSimules[0].document.objects.some((o) => o.type === 'arc'));
    assert.equal(r.documentsSimules[0].conformite, 'conforme (validateStudioDocument)');
    const refuseMurs = (doc) => { if (doc.architecture?.some((o) => o.type === 'wall' && o.justification === 'right')) throw new Error('mur refusé'); };
    const r2 = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe', validerDocument: refuseMurs });
    assert.equal(element(r2, 'atelier_objets:p1/f1').statut, 'ambigu', 'l\'ouverture suit son mur refusé');
  });

  it('données privées : ni identifiant de compte, ni texte d\'annotation dans le rapport', () => {
    const r = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe' });
    const sortie = JSON.stringify(r) + rapportMarkdown(r);
    assert.ok(!sortie.includes('u-secret'));
    assert.ok(!sortie.includes('contenu privé'));
  });

  it('reproductible : même entrée, même rapport ; l\'empreinte du corpus suit les données', () => {
    const a = simuler(lignes(objets), { hypotheses: H, horodatage: 'fixe' });
    const b = simuler(structuredClone(lignes(objets)), { hypotheses: [...H].reverse(), horodatage: 'fixe' });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    const c = simuler(lignes(objets.slice(1)), { hypotheses: H, horodatage: 'fixe' });
    assert.notEqual(a.empreinteCorpus, c.empreinteCorpus);
  });

  it('hypothèse inconnue ou non déclarable refusée ; arguments de la ligne de commande contrôlés', () => {
    assert.throws(() => simuler(lignes([]), { hypotheses: ['inventee'] }), /hypothèse inconnue/);
    assert.throws(() => lireArguments(['--sortie', 'x', '--hypothese', 'structure-cible']), /non déclarable/);
    assert.throws(() => lireArguments(['--copie', 'c']), /--sortie/);
    assert.deepEqual(lireArguments(['--sortie', 'x', '--copie', 'c', '--hypothese', 'repere-local-identite']).hypotheses, ['repere-local-identite']);
  });

  it('tables absentes du schéma : notées absentes, la simulation continue, section et alerte au Markdown', () => {
    const l = lignes([]);
    delete l.atelier_outbox;
    const r = simuler(l, { horodatage: 'fixe' });
    assert.equal(r.schema.tables.atelier_outbox, 'absente');
    assert.equal(r.schema.tables.projects, 'lue');
    assert.deepEqual(r.synthese.tablesAbsentes, ['atelier_outbox']);
    const md = rapportMarkdown(r);
    assert.match(md, /## Tables absentes du schéma lu\n\n> \*\*Alerte\*\* : 1 table/);
    assert.match(md, /- `atelier_outbox` \(MIG-03\)/);
    assert.match(rapportMarkdown(simuler(lignes([]), { horodatage: 'fixe' })), /## Tables absentes du schéma lu\n\nAucune/);
  });

  it('M1 : arc à angles égaux ou balayage d\'au moins 360° → ambigu ; arc ordinaire converti', () => {
    const arc = (id, a0, a1) => obj(id, 'esquisse', esq('arc', [], { centre: pt(0, 0), rayon: m(1), angleDebut: { value: a0, unit: 'deg' }, angleFin: { value: a1, unit: 'deg' } }));
    const r = simuler(lignes([arc('egal', 30, 30), arc('tour', 0, 360), arc('plus', -90, 450), arc('ok', 350, 10)]), { hypotheses: H, horodatage: 'fixe' });
    for (const id of ['egal', 'tour', 'plus']) {
      const e = element(r, `atelier_objets:p1/${id}`);
      assert.deepEqual([e.statut, e.regle], ['ambigu', 'R-ARC-AMBIGU'], id);
    }
    assert.match(element(r, 'atelier_objets:p1/egal').manques[0], /égaux/);
    assert.equal(element(r, 'atelier_objets:p1/ok').statut, 'convertible');
  });

  it('M2 : renflements trop courts complétés par des zéros (transformation déclarée) ; en surnombre → ambigu', () => {
    const pl = (id, renflements, ferme = false) => obj(id, 'esquisse', esq('polyligne', [pt(0, 0), pt(2, 0), pt(2, 2)], { renflements, ferme }));
    const r = simuler(lignes([pl('court', [0.5]), pl('ferme', [0.5], true), pl('long', [0, 0, 0.5]), pl('juste', [0, 0.5])]), { hypotheses: H, horodatage: 'fixe' });
    const doc = r.documentsSimules[0].document;
    const v = (id) => doc.objects.find((o) => r.correspondances.find((c) => c.ancienne === `atelier_objets:p1/${id}`).nouvelle.endsWith(o.id));
    assert.deepEqual(v('court').bulges, [0.5, 0]);
    assert.deepEqual(v('ferme').bulges, [0.5, 0, 0]);
    assert.deepEqual(v('juste').bulges, [0, 0.5]);
    const t = (id) => r.correspondances.find((c) => c.ancienne === `atelier_objets:p1/${id}`).filiation.transformations;
    assert.ok(t('court').some((x) => /complétés par 1 zéro/.test(x)));
    assert.ok(t('ferme').some((x) => /complétés par 2 zéro/.test(x)));
    assert.ok(!t('juste').some((x) => /complétés/.test(x)));
    assert.deepEqual([element(r, 'atelier_objets:p1/long').statut, element(r, 'atelier_objets:p1/long').regle], ['ambigu', 'R-POLYLIGNE-RENFLEMENTS']);
  });

  it('M3 : R-HEBERGE exige que la cible soit le mur hôte déclaré (murHoteId) et un mur, sinon ambigu', () => {
    const fen = (id, hote) => obj(id, 'fenetre', { murHoteId: hote, position: 0.5, largeur: m(1), hauteur: m(1), allege: m(1) });
    const objs = [obj('w1', 'mur', mur()), obj('w2', 'mur', mur({ a: pt(0, 3), b: pt(5, 3) })), obj('l1', 'esquisse', esq('ligne', [pt(0, 0), pt(1, 0)])), fen('f1', 'w1')];
    const rel = (id, s, t) => ({ project_id: 'p1', id, kind: 'heberge-par', source_id: s, target_id: t });
    const r = simuler(lignes(objs, { atelier_relations: [rel('bon', 'f1', 'w1'), rel('autre-mur', 'f1', 'w2'), rel('pas-un-mur', 'f1', 'l1')] }), { hypotheses: H, horodatage: 'fixe' });
    const e = (id) => element(r, `atelier_relations:p1/${id}`);
    assert.deepEqual([e('bon').statut, e('bon').regle], ['convertible', 'R-HEBERGE']);
    assert.deepEqual([e('autre-mur').statut, e('autre-mur').regle], ['ambigu', 'R-HEBERGE-INCOHERENT']);
    assert.match(e('autre-mur').manques[0], /≠ mur hôte déclaré w1/);
    assert.deepEqual([e('pas-un-mur').statut, e('pas-un-mur').regle], ['ambigu', 'R-HEBERGE-INCOHERENT']);
    assert.ok(e('pas-un-mur').manques.some((x) => /pas un mur/.test(x)));
    assert.ok(!r.correspondances.some((c) => c.ancienne.endsWith('/autre-mur') || c.ancienne.endsWith('/pas-un-mur')));
  });

  it('I3 : volume non intègre = erreur partielle hors projet, comptée aux totaux, section Volumes au Markdown', () => {
    const vols = [{ id: 'a'.repeat(64), size: 3, taille_reelle: 3, sha256: 'a'.repeat(64) }, { id: 'b'.repeat(64), size: 4, taille_reelle: 3, sha256: 'autre' }];
    const r = simuler(lignes([], { volumes: vols }), { horodatage: 'fixe' });
    const err = r.erreursPartielles.find((e) => e.code === 'volume-non-integre');
    assert.equal(err.element, `volumes:${'b'.repeat(64)}`);
    assert.equal(err.projet, null);
    assert.match(err.message, /empreinte/);
    assert.match(err.message, /taille déclarée 4 ≠ taille réelle 3/);
    assert.equal(r.synthese.horsProjet.erreurs, 1);
    assert.equal(r.synthese.totaux.erreurs, 1);
    const md = rapportMarkdown(r);
    assert.match(md, /## Volumes\n\n2 volume\(s\) lu\(s\), 1 non intègre/);
    assert.match(md, /\| — \(hors projet\) \| volumes:b+ \| volume-non-integre/);
    assert.match(md, /\| hors projet \| — \| — \| — \| — \| — \| 1 \|/);
  });

  it('I3 : erreur de file locale rattachée à son projet, comptée dans projet.erreurs, parProjet et totaux', () => {
    const f = { format: 'fadi-studio-file-locale/1', ligne: { projectId: 'p1', userId: 'u', donnees: '{' } };
    const r = simuler(lignes([]), { filesLocales: [f], horodatage: 'fixe' });
    assert.equal(r.projets[0].erreurs.length, 1);
    assert.equal(r.projets[0].erreurs[0].code, 'file-locale-illisible');
    assert.equal(r.synthese.parProjet[0].erreurs, 1);
    assert.equal(r.synthese.horsProjet.erreurs, 0);
    assert.equal(r.synthese.totaux.erreurs, 1);
  });

  it('M7 : noms de calques et de fichiers de publication jamais en clair (empreinte courte)', () => {
    const calques = [{ project_id: 'p1', id: 'c1', nom: 'Calque secret', parent_id: null, visible: true, verrouille: false, gele: false, ordre: 0, a_proprietes: false }];
    const vol = { id: 'a'.repeat(64), size: 3, taille_reelle: 3, sha256: 'a'.repeat(64) };
    const pubs = [{ id: 'pub', project_id: 'p1', version_id: 'v', documents: [{ fileName: 'plan-secret.pdf', volumeId: vol.id, size: 3 }] }];
    const r = simuler(lignes([obj('l1', 'esquisse', esq('ligne', [pt(0, 0), pt(1, 0)]), { calque_id: 'c1' })], { atelier_calques: calques, atelier_publications: pubs, volumes: [vol] }), { hypotheses: H, horodatage: 'fixe' });
    const sortie = JSON.stringify(r) + rapportMarkdown(r);
    assert.ok(!sortie.includes('Calque secret') && !sortie.includes('plan-secret'));
    assert.equal(r.documentsSimules[0].document.layers[0].name, nomMasque('calque', 'Calque secret'));
    assert.equal(r.controles['MIG-COEX-03'][0].pieces[0].fichier, nomMasque('fichier', 'plan-secret.pdf'));
  });
});

describe('contrôles prévus (MIG-COEX-03/04/06)', () => {
  it('MIG-COEX-03 : publication liée à sa version et à des pièces intègres, sinon lien rompu signalé', () => {
    const vol = (id, ok = true) => ({ id, size: 3, taille_reelle: 3, sha256: ok ? id : 'autre' });
    const volumes = new Map([['a'.repeat(64), vol('a'.repeat(64))], ['b'.repeat(64), vol('b'.repeat(64), false)]]);
    const doc = (v) => ({ fileName: `${v[0]}.pdf`, volumeId: v, size: 3 });
    const res = controlerPublications([
      { id: 'ok', project_id: 'p1', version_id: 'v1', documents: [doc('a'.repeat(64))] },
      { id: 'ko', project_id: 'p1', version_id: 'v-absente', documents: [doc('a'.repeat(64)), doc('b'.repeat(64)), doc('c'.repeat(64))] },
    ], [{ id: 'v1' }], volumes);
    assert.equal(res[0].etat, 'lien intact');
    assert.match(res[1].etat, /lien rompu/);
    assert.equal(res[1].versionPresente, false);
    assert.deepEqual(res[1].pieces.map((p) => p.etat), ['lien intact', 'empreinte divergente', 'pièce absente']);
  });

  it('MIG-COEX-04 : un évènement en attente ou un brouillon local bloque la bascule du projet, rien n\'est supprimé', () => {
    const fichier = { format: 'fadi-studio-file-locale/1', raison: 'x', ligne: { cle: 'k', userId: 'u-secret', projectId: 'p1', stamp: 's', donnees: JSON.stringify({ version: 1, pas: [[{}]], plan: { lots: [[]] } }) } };
    const r = simuler(lignes([], { atelier_outbox: [{ project_id: 'p1', id: 'e1', event_type: 't', version: 1, attempts: 0, en_attente: true }] }), { filesLocales: [fichier], horodatage: 'fixe' });
    const c = r.controles['MIG-COEX-04'];
    assert.deepEqual(c.basculeBloquee, ['p1']);
    assert.equal(c.enAttente.length, 2);
    for (const x of c.enAttente) assert.doesNotMatch(x.traitement, /supprim(é|er)\b(?!.*jamais)/);
    assert.equal(element(r, 'atelier_outbox:e1').statut, 'ambigu');
    assert.ok(!JSON.stringify(r).includes('u-secret'));
  });

  it('M8 : export illisible — chemin et cause au rapport, jamais null dans basculeBloquee, tous les projets bloqués', () => {
    const r = simuler(lignes([]), { filesLocales: [new FichierIllisible('/tmp/export.json', 'JSON invalide (x)')], horodatage: 'fixe' });
    assert.deepEqual([r.filesLocales[0].chemin, r.filesLocales[0].erreur], ['/tmp/export.json', 'fichier d\'export illisible : JSON invalide (x)']);
    const c = r.controles['MIG-COEX-04'];
    assert.ok(!c.basculeBloquee.includes(null));
    assert.equal(c.basculeBloqueeTousProjets, true);
    assert.equal(c.nonRattaches.length, 1);
    assert.equal(r.synthese.horsProjet.erreurs, 1);
    assert.equal(r.synthese.totaux.erreurs, 1);
    assert.ok(r.erreursPartielles[0].message.includes('/tmp/export.json'));
    assert.match(rapportMarkdown(r), /Projets bloqués : TOUS \(1 élément\(s\) sans projet connu\)/);
    assert.deepEqual(controlerEnAttente([], [{ projet: 'p2', reference: 'x', traitement: 't' }]).basculeBloquee, ['p2']);
  });

  it('files locales exportées : format courant à synchroniser, autre format à résoudre, illisible signalé', () => {
    const f = (donnees, format = 'fadi-studio-file-locale/1') => ({ format, ligne: { projectId: 'p1', userId: 'u', donnees } });
    assert.match(recenserFileLocale(f(JSON.stringify({ version: 1 }))).traitement, /synchroniser/);
    assert.match(recenserFileLocale(f(JSON.stringify({ version: 7 }))).traitement, /résoudre/);
    assert.equal(recenserFileLocale(f('{')).erreur, 'données du brouillon illisibles');
    assert.equal(recenserFileLocale(f('{}', 'autre')).erreur, 'format d\'export inconnu');
  });

  it('MIG-COEX-06 : deux chaînes d\'écriture sur une même étude refusées ; consultation historique exigée', () => {
    const deux = planEcriture({ etude: 'e', chaines: [{ chaine: 'atelier', ecriture: true, lecture: true }, { chaine: 'studio', ecriture: true, lecture: true }] });
    assert.equal(deux.verdict, 'refusé');
    assert.match(deux.refus[0], /deux chaînes d'écriture incompatibles/);
    const sansHistorique = planEcriture({ etude: 'e', chaines: [{ chaine: 'atelier', ecriture: false, lecture: false }, { chaine: 'studio', ecriture: true, lecture: true }] });
    assert.equal(sansHistorique.verdict, 'refusé');
    assert.equal(planEcriture({ etude: 'e', chaines: [{ chaine: 'atelier', ecriture: false, lecture: true }, { chaine: 'studio', ecriture: true, lecture: true }] }).verdict, 'une seule chaîne d\'écriture');
    // Simulation : propriété non décidée → aucune chaîne admise à écrire l'étude simulée, bascule bloquée.
    const r = simuler(lignes([obj('l1', 'esquisse', esq('ligne', [pt(0, 0), pt(1, 0)]))]), { horodatage: 'fixe' });
    assert.match(r.controles['MIG-COEX-06'][0].verdict, /bascule bloquée : propriété d'écriture non décidée/);
    assert.deepEqual(r.controles['MIG-COEX-06'][0].ecrivains, []);
    const declare = simuler(lignes([obj('l1', 'esquisse', esq('ligne', [pt(0, 0), pt(1, 0)]))]), { horodatage: 'fixe', autorites: { p1: 'studio' } });
    assert.deepEqual(declare.controles['MIG-COEX-06'][0].ecrivains, ['studio']);
    assert.deepEqual(declare.controles['MIG-COEX-06'][0].lecture, ['atelier', 'studio']);
  });
});

describe('gardes de base (I1, I2)', () => {
  it('I1 : marqueur de copie — suffixe _copie / _mig / _synth ou commentaire fadi-copie-migration, sinon refus', () => {
    for (const nom of ['prod_copie', 'fadi_mig', 'fadi_v9_fxmig_synth']) assert.ok(estCopieMarquee(nom, null), nom);
    for (const nom of ['fadi', 'production', 'fadi_mig_x', '_mig', 'copie', 'fadi-mig']) assert.ok(!estCopieMarquee(nom, null), nom);
    assert.ok(estCopieMarquee('restauration_2026', 'fadi-copie-migration — restaurée le 19/10/2026'));
    assert.ok(!estCopieMarquee('restauration_2026', 'copie de migration'));
  });
  it('I2 : le jeu synthétique n\'écrit que dans une base *_mig ou *_synth', () => {
    for (const nom of ['fadi_mig', 'x_synth']) assert.ok(nomBaseSynthetiqueAdmis(nom), nom);
    for (const nom of ['fadi', 'prod_copie', '_synth', 'fadi_mig2']) assert.ok(!nomBaseSynthetiqueAdmis(nom), nom);
  });
});

describe('lecture : copie déclarée exigée avant toute connexion', () => {
  it('refuse sans base ou sans copie déclarée', async () => {
    await assert.rejects(ouvrirSessionLecture({ connectionString: '', copieDeclaree: 'x' }), (e) => e instanceof RefusLecture && e.code === 'SANS_BASE');
    await assert.rejects(ouvrirSessionLecture({ connectionString: 'postgresql://127.0.0.1:1/x', copieDeclaree: '' }), (e) => e instanceof RefusLecture && e.code === 'COPIE_NON_DECLAREE');
  });
});
