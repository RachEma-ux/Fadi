// Simulation de migration confrontée au VRAI modèle (exécuté par tsx) : dérive de la liste des classes, règles du mur
// vérifiées par la géométrie des deux modèles, documents simulés acceptés par validateStudioDocument, contrats.
//   npx tsx --test scripts/migration/simulation-studio.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASSES, CONTRATS_ACCEPTES, facesMur, STUDIO_CONTRACT, validateStudioDocument } from '@parcours/atelier-model';
import { lateraux } from '../../packages/atelier-model/src/studio/architecture/geometrie.ts';
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
