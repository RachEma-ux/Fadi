// Simulation de migration confrontée au VRAI modèle (exécuté par tsx) : dérive de la liste des classes, règles du mur
// vérifiées par la géométrie des deux modèles, documents simulés acceptés par validateStudioDocument, contrats.
//   npx tsx --test scripts/migration/simulation-studio.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASSES, collisions, CONTRATS_ACCEPTES, facesMur, modeleVide, STUDIO_CONTRACT, validateStudioDocument } from '@parcours/atelier-model';
import { geometrieMur, lateraux, ouverturesSeChevauchent, placerOuverture } from '../../packages/atelier-model/src/studio/architecture/geometrie.ts';
import { CLASSES_ATELIER, simuler } from './migration-lib.mjs';
import { OBJETS_P1 } from './jeu-synthetique.mjs';

describe('simulation de migration face au modèle réel', () => {
  it('la liste des classes Atelier de la simulation est celle de l\'ontologie', () => {
    assert.deepEqual([...CLASSES_ATELIER].sort(), Object.keys(CLASSES).sort());
  });

  it('R-MUR : la justification Studio retenue redonne exactement les faces du mur Atelier', () => {
    const correspondance = { gauche: 'right', axe: 'center', droite: 'left' };
    const a = { x: 0, y: 0 }, b = { x: 4, y: 0 };
    for (const [alignement, justification] of Object.entries(correspondance)) {
      const f = facesMur(a, b, 0.3, alignement);
      const l = lateraux({ thickness: 0.3, justification });
      // Axe sur x, normale à gauche = +y : la face gauche Atelier est à y = l.gauche, la face droite à y = l.droite.
      assert.ok(Math.abs(f.gauche[0].y - l.gauche) < 1e-12 && Math.abs(f.droite[0].y - l.droite) < 1e-12, alignement);
    }
  });

  it('R-OUVERTURE : l\'intervalle [début, fin] de chaque baie le long de l\'axe est le même dans les deux modèles', () => {
    // Atelier : position = paramètre du CENTRE (versions.ts collisions : [c − w/2, c + w/2]) ; Studio : bord de début.
    const pt = (x, y) => ({ x, y, frame: 'local', unit: 'm' });
    const m = (value) => ({ value, unit: 'm' });
    const occ = (id, classe, params) => ({ id, classe, niveauId: 'rdc', definitionId: null, calqueId: null, groupeId: null, phase: null, params, proprietes: {} });
    const murP = { a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(2.7), niveauHautId: null, alignement: 'axe', exterieur: true, nom: null };
    const baie = (position) => ({ murHoteId: 'w', position, largeur: m(1.2), hauteur: m(1), allege: m(0.9), repere: null });
    const cas = { debut: 0.12, chevauche: 0.3, fin: 0.88, dehors: 0.11 }; // L = 5 : [0 ; 1,2], [0,9 ; 2,1], [3,8 ; 5], [−0,05 ; 1,15]
    const atelier = (ids) => collisions({ ...modeleVide(), objets: Object.fromEntries([['w', occ('w', 'mur', murP)], ...ids.map((k) => [k, occ(k, 'fenetre', baie(cas[k]))])]) })
      .filter((c) => c.type.startsWith('ouverture'));
    const r = simuler({
      projects: [{ id: 'p', owner_id: 'u', code: 'T', name: 'x', model_revision: 1 }],
      atelier_niveaux: [{ project_id: 'p', id: 'rdc', nom: 'RDC', elevation: 0, hauteur: 3, ordre: 0 }],
      atelier_objets: [['w', 'mur', murP], ...Object.keys(cas).map((k) => [k, 'fenetre', baie(cas[k])])].map(([id, classe, params]) => ({ project_id: 'p', id, classe, niveau_id: 'rdc', definition_id: null, calque_id: null, groupe_id: null, phase: null, params, proprietes: {}, model_revision: 1, verrouille: false })),
    }, { hypotheses: ['repere-local-identite', 'base-elevation-niveau'], horodatage: 'fixe' });
    const arch = r.documentsSimules[0].document.architecture;
    const vers = (k) => arch.find((x) => r.correspondances.find((c) => c.ancienne === `atelier_objets:p/${k}`).nouvelle.endsWith(`/${x.id}`));
    const w = vers('w'), g = geometrieMur(w);
    assert.ok(g.ok);
    const intervalle = (k) => { const pl = placerOuverture(w, g.valeur, vers(k)); return pl.ok ? [pl.valeur.segment.debut + pl.valeur.s0, pl.valeur.segment.debut + pl.valeur.s1] : pl.raison; };
    const proche = (a, b) => Math.abs(a - b) < 1e-9;
    // Baie affleurant le début, la fin : aucune collision Atelier, intervalle Studio [0 ; 1,2] et [3,8 ; 5].
    assert.deepEqual(atelier(['debut', 'fin']), []);
    const [d0, d1] = intervalle('debut'), [f0, f1] = intervalle('fin');
    assert.ok(proche(d0, 0) && proche(d1, 1.2) && proche(f0, 3.8) && proche(f1, 5), `${d0} ${d1} ${f0} ${f1}`);
    // Chevauchement : même recouvrement (0,3 m) dans les deux modèles.
    const chev = atelier(['debut', 'chevauche']);
    assert.deepEqual(chev.map((c) => c.type), ['ouvertures-chevauchantes']);
    assert.match(chev[0].message, /\(0\.3 m\)/);
    assert.ok(ouverturesSeChevauchent(vers('debut'), vers('chevauche'), 1e-9));
    const [c0] = intervalle('chevauche');
    assert.ok(proche(d1 - c0, 0.3));
    assert.ok(!ouverturesSeChevauchent(vers('chevauche'), vers('fin'), 1e-9));
    // Un cheveu avant le début : hors du mur dans les deux modèles, du même dépassement (0,05 m).
    const dehors = atelier(['dehors']);
    assert.deepEqual(dehors.map((c) => c.type), ['ouverture-hors-mur']);
    assert.match(dehors[0].message, /de 0\.05 m/);
    assert.ok(proche(vers('dehors').position, -0.05));
    assert.match(intervalle('dehors'), /hors du mur hôte/);
  });

  it('R-HISTORIQUE : aucun contrat du journal Atelier n\'est le contrat des commandes Studio', () => {
    assert.ok(!CONTRATS_ACCEPTES.includes(STUDIO_CONTRACT));
  });

  it('jeu synthétique : documents simulés conformes à validateStudioDocument, le refus du validateur est rattaché', () => {
    const lignes = {
      projects: [{ id: 'synth-p1', owner_id: 'u', code: 'SYNTH-1', name: 'x', model_revision: 3 }],
      atelier_niveaux: [{ project_id: 'synth-p1', id: 'rdc', nom: 'RDC', elevation: 0, hauteur: 3, ordre: 0 }, { project_id: 'synth-p1', id: 'r1', nom: 'R+1', elevation: 3, hauteur: null, ordre: 1 }],
      atelier_calques: [{ project_id: 'synth-p1', id: 'c-murs', nom: 'Murs', parent_id: null, visible: true, verrouille: false, gele: false, ordre: 0, a_proprietes: false }, { project_id: 'synth-p1', id: 'c-dessin', nom: 'Dessin', parent_id: 'c-murs', visible: true, verrouille: false, gele: false, ordre: 1, a_proprietes: false }],
      atelier_objets: OBJETS_P1.map(([id, classe, niveau, params, extra]) => ({ project_id: 'synth-p1', id, classe, niveau_id: niveau, definition_id: null, calque_id: extra.calque_id ?? null, groupe_id: extra.groupe_id ?? null, phase: extra.phase ?? null, params, proprietes: extra.proprietes ?? {}, model_revision: 3, verrouille: false })),
    };
    const r = simuler(lignes, { hypotheses: ['repere-local-identite', 'base-elevation-niveau'], horodatage: 'fixe', validerDocument: validateStudioDocument });
    assert.ok(r.documentsSimules.length >= 2);
    for (const d of r.documentsSimules) {
      assert.equal(d.conformite, 'conforme (validateStudioDocument)', d.niveau);
      validateStudioDocument(d.document);
    }
    const types = r.documentsSimules.flatMap((d) => [...d.document.objects, ...(d.document.architecture ?? [])].map((o) => o.type));
    for (const t of ['line', 'polyline', 'circle', 'arc', 'rectangle', 'wall', 'opening']) assert.ok(types.includes(t), t);
    const deg1 = r.erreursPartielles.find((e) => e.element === 'atelier_objets:synth-p1/deg1');
    assert.equal(deg1?.code, 'refus-validateur-studio');
  });
});
