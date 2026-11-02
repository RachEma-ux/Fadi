/**
 * PR-01 à PR-06 et PR-09 — contrôle automatique du corps et de la branche d'une PR Studio
 * (scripts/registre/controle-pr.mjs), contrôlé par mutation : chaque champ retiré ou vidé fait échouer le contrôle.
 *
 *   node --test scripts/registre/controle-pr.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHAMPS, champ, controlerPr, issuesLiees } from './controle-pr.mjs';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const CORPS = `## Unité de travail
- **Issue de l’unité de travail** : Refs #401
- **Besoin** : contrôler les preuves du registre.
- **Sources** : Checklist V1.0 §X.5 ; Plan §9.2.
- **Identifiants d’exigences** : X.5-02, G2-04
- **Périmètre inclus** : registre Studio.
- **Périmètre exclu** : code produit.
- **Composant** : docs/ai-team/controle_preuves.py
- **Contrats** : Non applicable : aucun contrat d’API.
- **Décisions** : ADR-STUDIO-PILOTE-01 P-04.
- **Migrations** : Non.
- **Scénarios positifs** : registre corrigé conforme.
- **Scénarios négatifs** : preuve sans date refusée.
- **Preuves attendues** : node --test scripts/registre/controle-preuves.test.mjs
- **Retour arrière** : revert du commit.
- **Codé** : oui, commit 0123abc.
- **Testé** : node --test scripts/registre/controle-preuves.test.mjs (10/10) ; https://github.com/RachEma-ux/Fadi/actions/runs/123
- **Déployé** : Non.
- **Accepté** : Non, en attente du maître d’ouvrage.
- **Revalidation à la reprise** : HEAD de main \`c1ddb1c\` revalidé ; CI : https://github.com/RachEma-ux/Fadi/actions/runs/40236971185
`;
const ok = { corps: CORPS, branche: 'chore/401-preuves-registre', fichiers: ['docs/ai-team/controle_preuves.py'] };
const ecarts = (extra) => controlerPr({ ...ok, ...extra }).ecarts;

test('PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue', () => {
  const r = controlerPr(ok);
  assert.equal(r.applicable, true);
  assert.deepEqual(r.ecarts, []);
  assert.deepEqual(r.issues, [401]);
  assert.equal(champ(CORPS, "Identifiants d'exigences"), 'X.5-02, G2-04');
});

test('PR-01 — une Issue propre à l’unité de travail est liée (le programme #156 et le canal #166 ne suffisent pas)', () => {
  assert.match(ecarts({ corps: CORPS.replace('Refs #401', 'Refs #156, #166'), branche: 'chore/156-x' }).join(), /PR-01 : aucune Issue propre/);
  assert.match(ecarts({ corps: CORPS.replace('Refs #401', 'Refs #NN') }).join(), /PR-01/);
  assert.deepEqual(issuesLiees('Closes #12 ; refs #13 ; voir #14'), [12, 13]);
});

test('PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide', () => {
  for (const [id, libelles] of Object.entries(CHAMPS)) {
    for (const l of libelles) {
      const ligne = CORPS.split('\n').find((x) => x.includes(`**${l}**`));
      assert.ok(ligne, l);
      assert.match(ecarts({ corps: CORPS.replace(`${ligne}\n`, '') }).join('\n'), new RegExp(`${id} : champ « ${l} » absent`), l);
      assert.match(ecarts({ corps: CORPS.replace(ligne, `- **${l}** : `) }).join('\n'), new RegExp(`${id} : champ « ${l} » vide`), l);
    }
  }
  assert.match(ecarts({ corps: CORPS.replace('X.5-02, G2-04', 'les preuves') }).join(), /ne cite aucun identifiant du référentiel/);
});

test('PR-05 — branche courte du protocole dont l’Issue est liée ; preuves vérifiables', () => {
  // Nommage conseillé (docs/continuity/README.md, décision P-13) : un autre nom est un avertissement, pas un écart.
  const imposee = controlerPr({ ...ok, branche: 'ccr-187fd2e6-08dk6e' });
  assert.deepEqual(imposee.ecarts, []);
  assert.match(imposee.avertissements.join(), /PR-05 : branche « ccr-187fd2e6-08dk6e » hors du nommage conseillé/);
  assert.match(controlerPr({ ...ok, branche: 'automation/studio-checklist-daily' }).avertissements.join(), /hors du nommage conseillé/);
  assert.match(controlerPr({ ...ok, corps: CORPS.replace('Refs #401', 'Refs #156'), branche: 'ccr-x' }).ecarts.join(), /PR-01 : aucune Issue propre/);
  assert.match(ecarts({ branche: 'feat/402-autre' }).join(), /l’Issue #402 de la branche n’est pas liée/);
  const sansPreuve = CORPS.replace('node --test scripts/registre/controle-preuves.test.mjs\n', 'à voir\n').replace(/- \*\*Testé\*\* : .*\n/, '- **Testé** : vérifié à la main.\n');
  assert.match(ecarts({ corps: sansPreuve }).join(), /PR-05 : aucune preuve vérifiable/);
});

test('PR-06 — « Testé » cite des tests exécutés ; une capture de bouton seule n’est pas une preuve métier', () => {
  const capture = CORPS.replace(/- \*\*Testé\*\* : .*\n/, '- **Testé** : ![bouton](capture-bouton.png)\n');
  assert.match(ecarts({ corps: capture }).join(), /PR-06 : « Testé » ne cite qu’une capture/);
  const avecCapture = CORPS.replace(/- \*\*Testé\*\* : /, '- **Testé** : ![écran](e.png) ; ');
  assert.deepEqual(ecarts({ corps: avecCapture }), []);
});

test('PR-09 — revalidation : le HEAD revalidé est contenu dans la branche et la base, la CI est citée', () => {
  assert.match(ecarts({ contient: () => false }).join(), /PR-09 : le HEAD revalidé c1ddb1c n’est pas contenu/);
  assert.match(ecarts({ corps: CORPS.replace(/HEAD de main `c1ddb1c` revalidé ; CI : \S+/, 'fait') }).join(), /ne cite pas le SHA/);
  assert.match(ecarts({ corps: CORPS.replace(/ ; CI : \S+/, '') }).join(), /ne cite pas la CI revalidée/);
});

test('périmètre — hors Studio non applicable ; PR automatique du bot exemptée ; le modèle de PR porte la section « Unité de travail »', () => {
  assert.equal(controlerPr({ ...ok, fichiers: ['apps/web/src/modules/geodata/x.ts'] }).applicable, false);
  assert.equal(controlerPr({ ...ok, corps: '', branche: 'automation/studio-checklist-2026-10-25', auteur: 'github-actions[bot]', fichiers: ['Studio/x.json'] }).applicable, false);
  assert.ok(controlerPr({ ...ok, corps: '', branche: 'automation/x', auteur: 'quelqu-un', fichiers: ['Studio/x.json'] }).ecarts.length > 0);
  const modele = readFileSync(`${RACINE}.github/PULL_REQUEST_TEMPLATE.md`, 'utf8');
  for (const libelles of Object.values(CHAMPS)) for (const l of libelles) assert.notEqual(champ(modele, l), null, `modèle : ${l}`);
  assert.ok(controlerPr({ ...ok, corps: modele }).ecarts.length >= 19, 'le modèle vierge n’est pas conforme');
});
