/**
 * SUIVI-10 — analyse de secrets du suivi public (scripts/securite/analyse-secrets.mjs). Les exemples de secrets sont
 * composés à l'exécution (jamais écrits en clair dans ce fichier, que l'analyse lit aussi).
 *
 *   node --test scripts/securite/analyse-secrets.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyserDepot, analyserTexte, correspond, filtrer, masquer } from './analyse-secrets.mjs';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const x = (n, c = 'A') => c.repeat(n);
const EXEMPLES = {
  'cle-aws': `const k = "${'AK' + 'IA'}${x(16, 'Q')}";`,
  'jeton-github': `token: ${'gh' + 'p_'}${x(36, 'a')}`,
  'jeton-slack': `${'xo' + 'xb'}-123456789012-abcdef`,
  'cle-stripe': `${'sk' + '_live_'}${x(24, 'b')}`,
  'cle-google': `${'AI' + 'za'}${x(35, 'c')}`,
  'cle-openai-anthropic': `${'sk-' + 'ant-'}${x(40, 'd')}`,
  'cle-privee': `${'-----BEGIN ' + 'RSA PRIVATE'} KEY-----`,
  jwt: `${'ey' + 'J'}${x(12, 'e')}.${'ey' + 'J'}${x(12, 'f')}.${x(12, 'g')}`,
  'affectation-secrete': `${'pass' + 'word'} = "${x(14, 'h')}"`,
  'url-identifiants': `postgresql://admin:${x(10, 'i')}@db.production.example.net:5432/fadi`,
  'url-signee': `https://bucket.s3.amazonaws.com/f?${'X-Amz-' + 'Signature'}=${x(20, '0')}`,
  webhook: `${'https://hooks.' + 'slack.com/services/'}T000/B000/XXXX`,
};

test('SUIVI-10 — chaque règle détecte son motif ; le constat ne montre jamais le secret', () => {
  for (const [regle, texte] of Object.entries(EXEMPLES)) {
    const c = analyserTexte('f.ts', `ligne 1\n${texte}\n`);
    assert.ok(c.some((k) => k.regle === regle && k.ligne === 2), `${regle} : ${JSON.stringify(c)}`);
    for (const k of c) assert.ok(!k.extrait.includes(texte.slice(8, 30)) || texte.length < 12, 'extrait masqué');
  }
  assert.equal(masquer('abcdefghijkl'), 'abcd… (12 caractères)');
});

test('SUIVI-10 — sans faux positif sur les variables et hôtes locaux', () => {
  for (const t of [
    'postgresql://fadi:${PGPASSWORD}@localhost:5432/fadi',
    'postgresql://$USER:${PGPASSWORD:-}@$HOST:5432/x',
    'DATABASE_URL=postgresql://fadi:fadi_ci_password@127.0.0.1:5432/fadi_test',
    'const password = process.env.PASSWORD;',
    'https://example.org/page?token=court',
  ]) assert.deepEqual(analyserTexte('f.ts', t), [], t);
});

test('SUIVI-10 — géométries de modèle ou de relevé refusées hors autorisation (IFC, DXF, LAS…) ; glob des autorisations', () => {
  const constats = [{ fichier: 'docs/client/plan.dwg', ligne: 0, regle: 'geometrie', extrait: 'plan.dwg' }];
  assert.equal(filtrer(constats, []).restants.length, 1);
  assert.equal(correspond('apps/api/src/**/*.test.ts', 'apps/api/src/app.test.ts'), true);
  assert.equal(correspond('apps/api/src/**/*.test.ts', 'apps/api/src/routes/x.test.ts'), true);
  assert.equal(correspond('apps/web/e2e/*.mjs', 'apps/web/e2e/sous/x.mjs'), false);
});

test('SUIVI-10 — autorisations : motivées (raison ≥ 15 caractères) et jamais dormantes', () => {
  const c = [{ fichier: 'a.test.ts', ligne: 1, regle: 'jwt', extrait: 'eyJh…' }];
  assert.deepEqual(filtrer(c, [{ fichier: '*.test.ts', regle: 'jwt', raison: 'Jeton factice de test du masquage.' }]), { restants: [], erreurs: [] });
  assert.match(filtrer(c, [{ fichier: '*.test.ts', regle: 'jwt', raison: 'court' }]).erreurs[0], /raison/);
  assert.match(filtrer([], [{ fichier: 'x', regle: 'jwt', raison: 'Une raison assez longue.' }]).erreurs[0], /inutilisée/);
});

test('SUIVI-10 — historique : un secret ajouté puis retiré dans la même branche est trouvé', () => {
  const d = mkdtempSync(join(tmpdir(), 'secrets-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.org', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.org' } });
  try {
    g('init', '-q', '-b', 'main');
    mkdirSync(join(d, 'scripts/securite'), { recursive: true });
    writeFileSync(join(d, 'scripts/securite/secrets-autorises.json'), '{"autorisations": []}');
    writeFileSync(join(d, 'a.txt'), 'rien\n');
    g('add', '.'); g('commit', '-q', '-m', 'base');
    const base = g('rev-parse', 'HEAD').toString().trim();
    writeFileSync(join(d, 'a.txt'), `rien\n${EXEMPLES['cle-aws']}\n`);
    g('commit', '-q', '-am', 'ajout');
    writeFileSync(join(d, 'a.txt'), 'rien\n');
    g('commit', '-q', '-am', 'retrait');
    assert.equal(analyserDepot(d).restants.length, 0, 'arbre courant propre');
    const h = analyserDepot(d, { historique: base });
    assert.deepEqual(h.restants.map((c) => [c.fichier, c.regle]), [['a.txt', 'cle-aws']]);
    assert.match(h.restants[0].commit, /^[0-9a-f]{40}$/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('SUIVI-10 — dépôt réel : aucun secret, URL sensible ni géométrie privée non autorisés ; aucune autorisation dormante', () => {
  const r = analyserDepot(RACINE);
  assert.ok(r.analyses > 1000);
  assert.deepEqual(r.restants, []);
  assert.deepEqual(r.erreurs, []);
});

test('autorisation liée à un commit : ne couvre que l’historique de ce commit, jamais déclarée inutilisée', () => {
  const a = [{ fichier: 'x.mjs', regle: 'url-identifiants', commit: '23a4533569c6', raison: 'Exemple de format dans un commentaire, retiré ensuite.' }];
  const historique = { fichier: 'x.mjs', ligne: 0, regle: 'url-identifiants', extrait: 'sche…', commit: '23a4533569c6aa' };
  assert.deepEqual(filtrer([historique], a).restants, []);
  assert.equal(filtrer([{ ...historique, commit: undefined }], a).restants.length, 1);
  assert.equal(filtrer([{ ...historique, commit: 'ffffffffffff' }], a).restants.length, 1);
  assert.deepEqual(filtrer([], a).erreurs, []);
});
