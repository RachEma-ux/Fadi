// Tests de la table des frontières (lot X.4, scripts/frontieres.json) appliquée par check-module-deps.mjs.
// Chaque cas construit un arbre minimal hors du dépôt : aucun mauvais import n'est écrit dans l'arbre réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkModuleDependencies, lireFrontieres } from './check-module-deps.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(ICI, 'check-module-deps.mjs');
const TABLE = lireFrontieres();
const ST = 'packages/atelier-model/src/studio';

function arbre(t, fichiers = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fadi-frontieres-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = {
    'packages/atelier-model/manifest.json': JSON.stringify({ name: '@parcours/atelier-model', allowedDependencies: [] }),
    'packages/atelier-model/package.json': JSON.stringify({ name: '@parcours/atelier-model' }),
    'packages/atelier-model/src/index.ts': 'export const m = 1;\n',
    'apps/web/package.json': '{"name":"@fadi/web"}',
    'apps/web/src/index.ts': 'export const web = 1;\n',
    'apps/api/package.json': '{"name":"@fadi/api"}',
    'apps/api/src/index.ts': 'export const api = 1;\n',
    ...fichiers,
  };
  for (const [nom, corps] of Object.entries(data)) {
    const f = path.join(root, nom); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, corps);
  }
  return root;
}
/** Table réelle, sans les exceptions Studio (elles visent des fichiers du dépôt, absents des fixtures). */
const sansExceptions = () => ({ ...TABLE, studioModele: { ...TABLE.studioModele, exceptions: [] } });
const controler = (t, fichiers, frontieres = sansExceptions()) => checkModuleDependencies(arbre(t, fichiers), { frontieres }).errors;
const avec = (erreurs, code, fragment = '') => erreurs.some((e) => e.includes(code) && e.includes(fragment));

// Couches minimales du modèle Studio, sans aucun import entre elles.
const couches = {
  [`${ST}/noyau/types.ts`]: 'export type P = { x: number };\n',
  [`${ST}/noyau/validation.ts`]: 'export const fail = () => { throw new Error(); };\n',
  [`${ST}/objets/ligne.ts`]: 'export type Ligne = { a: 1 };\nexport const ligne = 1;\n',
  [`${ST}/objets-3d/solides.ts`]: 'export const solide = 1;\n',
  [`${ST}/commandes/dessin.ts`]: 'export const dessiner = 1;\n',
  [`${ST}/registre/schemas-base.ts`]: 'export const id = {};\n',
  [`${ST}/registre/dessin.ts`]: 'export const OUTILS = [];\n',
  [`${ST}/exporteurs/texte.ts`]: 'export const nb = 1;\n',
  [`${ST}/architecture/types.ts`]: 'export type Mur = { m: 1 };\n',
  [`${ST}/echanges/rapport.ts`]: 'export const rapport = 1;\n',
  [`${ST}/composition/document.ts`]: 'export const valider = 1;\n',
};

test('le dépôt réel est conforme à la table (CLI)', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});

test('la table est relisible : motifs, raisons, natures et exceptions rattachées à une règle', () => {
  for (const r of [...TABLE.web.regles, ...TABLE.studioModele.regles]) assert.ok(r.de && r.interdits.length && r.motif, JSON.stringify(r));
  for (const e of TABLE.studioModele.exceptions) {
    assert.ok(['type', 'valeur'].includes(e.nature), JSON.stringify(e));
    assert.ok(e.raison && e.raison.length > 20, `raison absente : ${e.fichier}`);
    const couche = e.fichier.split('/')[0];
    const regle = TABLE.studioModele.regles.find((r) => r.de === couche);
    assert.ok(regle && regle.interdits.includes(e.cible), `exception ${e.fichier} → ${e.cible} sans règle qui l'interdit`);
  }
  // Le noyau est le socle : sa règle couvre toutes les couches que le lot X.4 nomme.
  const noyau = TABLE.studioModele.regles.find((r) => r.de === 'noyau');
  for (const c of ['objets', 'commandes', 'registre', 'exporteurs', 'architecture']) assert.ok(noyau.interdits.includes(c), c);
  for (const p of ['react', 'react-dom', 'three']) assert.ok(TABLE.modelePur.paquetsInterdits.includes(p), p);
});

test('témoin : couches Studio sans import montant, fichiers de la racine de studio/ libres', (t) => {
  const erreurs = controler(t, {
    ...couches,
    [`${ST}/objets/cercle.ts`]: 'import { id } from "../registre/schemas-base.js";\nimport { nb } from "../exporteurs/texte.js";\nimport { fail } from "../noyau/validation.js";\nexport const c = [id, nb, fail];\n',
    [`${ST}/commandes/modif.ts`]: 'import { ligne } from "../objets/ligne.js";\nimport { solide } from "../objets-3d/solides.js";\nexport const m = [ligne, solide];\n',
    [`${ST}/echanges/x.ts`]: 'import { OUTILS } from "../registre/dessin.js";\nexport const x = OUTILS;\n',
    [`${ST}/registry.ts`]: 'import { OUTILS } from "./registre/dessin.js";\nimport { dessiner } from "./commandes/dessin.js";\nimport { rapport } from "./echanges/rapport.js";\nexport const r = [OUTILS, dessiner, rapport];\n',
    [`${ST}/composition/document.ts`]: 'import { ligne } from "../objets/ligne.js";\nimport { solide } from "../objets-3d/solides.js";\nimport type { Mur } from "../architecture/types.js";\nimport { dessiner } from "../commandes/dessin.js";\nimport { fail } from "../noyau/validation.js";\nexport type M = Mur;\nexport const d = [ligne, solide, dessiner, fail];\n',
  });
  assert.deepEqual(erreurs, []);
});

test('témoin : exigences et scenes lisent le socle, les objets et les schémas de base', (t) => {
  const erreurs = controler(t, {
    ...couches,
    [`${ST}/exigences/schemas.ts`]: 'import { id } from "../registre/schemas-base.js";\nimport { ligne } from "../objets/ligne.js";\nimport { fail } from "../noyau/validation.js";\nexport const s = [id, ligne, fail];\n',
    [`${ST}/scenes/scenes.ts`]: 'import { id } from "../registre/schemas-base.js";\nimport { nb } from "../exporteurs/texte.js";\nexport const s = [id, nb];\n',
  });
  assert.deepEqual(erreurs, []);
});

test('cycle entre dossiers Studio refusé, même entre couches sans règle ; un test ne crée pas de cycle', (t) => {
  const cycle = controler(t, {
    ...couches,
    [`${ST}/alpha/a.ts`]: 'import { b } from "../beta/b.js";\nexport const a = b;\n',
    [`${ST}/beta/b.ts`]: 'export const b = 1;\n',
    [`${ST}/beta/c.ts`]: 'import { a } from "../alpha/a.js";\nexport const c = a;\n',
  });
  assert.ok(avec(cycle, 'STUDIO_LAYER_CYCLE', 'alpha → beta → alpha'), JSON.stringify(cycle));
  assert.ok(avec(cycle, 'STUDIO_LAYER_CYCLE', 'beta/c.ts → ../alpha/a.js'), JSON.stringify(cycle));
  const parTest = controler(t, {
    ...couches,
    [`${ST}/alpha/a.ts`]: 'import { b } from "../beta/b.js";\nexport const a = b;\n',
    [`${ST}/beta/b.ts`]: 'export const b = 1;\n',
    [`${ST}/beta/b.test.ts`]: 'import { a } from "../alpha/a.js";\nexport const t = a;\n',
  });
  assert.ok(!avec(parTest, 'STUDIO_LAYER_CYCLE'), JSON.stringify(parTest));
});

test('cycle : une primitive déclarée distincte (registre/schemas-base) forme son propre nœud', (t) => {
  const fichiers = {
    ...couches,
    [`${ST}/objets/arc.ts`]: 'import { id } from "../registre/schemas-base.js";\nexport const arc = id;\n',
    [`${ST}/registre/dessin.ts`]: 'import { arc } from "../objets/arc.js";\nexport const OUTILS = [arc];\n',
  };
  assert.deepEqual(controler(t, fichiers), []);
  const table = sansExceptions();
  table.studioModele = { ...table.studioModele, cycles: { noeudsDistincts: [] } };
  assert.ok(avec(controler(t, fichiers, table), 'STUDIO_LAYER_CYCLE', 'objets → registre → objets'));
});

test('le noyau n\'a plus aucune exception : le socle n\'importe aucune couche supérieure', () => {
  assert.deepEqual(TABLE.studioModele.exceptions.filter((e) => e.fichier.startsWith('noyau/')), []);
  const noyau = TABLE.studioModele.regles.find((r) => r.de === 'noyau');
  for (const c of ['composition', 'exigences', 'scenes']) assert.ok(noyau.interdits.includes(c), c);
  for (const de of ['exigences', 'scenes']) {
    const regle = TABLE.studioModele.regles.find((r) => r.de === de);
    for (const c of ['composition', 'registre', 'echanges']) assert.ok(regle?.interdits.includes(c), `${de} → ${c}`);
  }
  assert.deepEqual(TABLE.studioModele.exceptions, []);
});

for (const [cas, fichier, spec, interdit] of [
  ['noyau → objets (valeur)', 'noyau/etat.ts', '../objets/ligne.js', 'noyau → objets'],
  ['noyau → commandes', 'noyau/commandes.ts', '../commandes/dessin.js', 'noyau → commandes'],
  ['noyau → registre', 'noyau/limites.ts', '../registre/schemas-base.js', 'noyau → registre'],
  ['noyau → exporteurs', 'noyau/doc.ts', '../exporteurs/texte.js', 'noyau → exporteurs'],
  ['exporteurs → objets', 'exporteurs/dxf.ts', '../objets/ligne.js', 'exporteurs → objets'],
  ['objets → commandes', 'objets/arc.ts', '../commandes/dessin.js', 'objets → commandes'],
  ['objets → registre hors schémas de base', 'objets/arc.ts', '../registre/dessin.js', 'objets → registre'],
  ['objets-3d → objets', 'objets-3d/coupe.ts', '../objets/ligne.js', 'objets-3d → objets'],
  ['registre → commandes', 'registre/modif.ts', '../commandes/dessin.js', 'registre → commandes'],
  ['commandes → registre', 'commandes/calques.ts', '../registre/dessin.js', 'commandes → registre'],
  ['objets → echanges (feuille)', 'objets/arc.ts', '../echanges/rapport.js', 'objets → echanges'],
  ['noyau → composition', 'noyau/types.ts', '../composition/document.js', 'noyau → composition'],
  ['objets → composition', 'objets/arc.ts', '../composition/document.js', 'objets → composition'],
  ['commandes → composition', 'commandes/calques.ts', '../composition/document.js', 'commandes → composition'],
  ['composition → registre', 'composition/document.ts', '../registre/dessin.js', 'composition → registre'],
  ['exigences → composition', 'exigences/ecarts.ts', '../composition/document.js', 'exigences → composition'],
  ['exigences → registre hors schémas de base', 'exigences/schemas.ts', '../registre/dessin.js', 'exigences → registre'],
  ['exigences → echanges', 'exigences/proprietes.ts', '../echanges/rapport.js', 'exigences → echanges'],
  ['scenes → composition', 'scenes/affichage.ts', '../composition/document.js', 'scenes → composition'],
  ['scenes → registre hors schémas de base', 'scenes/registre.ts', '../registre/dessin.js', 'scenes → registre'],
  ['scenes → echanges', 'scenes/scenes.ts', '../echanges/rapport.js', 'scenes → echanges'],
  ['scenes → commandes', 'scenes/commandes.ts', '../commandes/dessin.js', 'scenes → commandes'],
]) {
  test(`refusé : couche ${cas}`, (t) => {
    const erreurs = controler(t, { ...couches, [`${ST}/${fichier}`]: `import { x } from "${spec}";\nexport const y = x;\n` });
    assert.ok(avec(erreurs, 'STUDIO_LAYER', `couche ${interdit}`), JSON.stringify(erreurs));
  });
}

test('refusé : import dynamique et réexportation montants depuis le noyau', (t) => {
  const erreurs = controler(t, { ...couches, [`${ST}/noyau/x.ts`]: 'export { ligne } from "../objets/ligne.js";\nexport const m = () => import("../commandes/dessin.js");\n' });
  assert.ok(avec(erreurs, 'STUDIO_LAYER', 'noyau → objets'), JSON.stringify(erreurs));
  assert.ok(avec(erreurs, 'STUDIO_LAYER', 'noyau → commandes'), JSON.stringify(erreurs));
});

test('exception explicite : « type » couvre import type et { type X }, jamais une valeur', (t) => {
  const table = sansExceptions();
  table.studioModele.exceptions = [{ fichier: 'noyau/types.ts', cible: 'objets', nature: 'type', raison: 'union de types seulement, effacée à la compilation' }];
  const permis = controler(t, { ...couches, [`${ST}/noyau/types.ts`]: 'import type { Ligne } from "../objets/ligne.js";\nimport { type Ligne as L2 } from "../objets/ligne.js";\nexport type U = Ligne | L2;\n' }, table);
  assert.deepEqual(permis, []);
  const refuse = controler(t, { ...couches, [`${ST}/noyau/types.ts`]: 'import type { Ligne } from "../objets/ligne.js";\nimport { ligne } from "../objets/ligne.js";\nexport type U = Ligne;\nexport const v = ligne;\n' }, table);
  assert.ok(avec(refuse, 'STUDIO_LAYER', 'noyau → objets interdite (../objets/ligne.js)'), JSON.stringify(refuse));
  // Sans exception, même un import de type est refusé : la règle vaut pour les types.
  const sans = controler(t, { ...couches, [`${ST}/noyau/types.ts`]: 'import type { Ligne } from "../objets/ligne.js";\nexport type U = Ligne;\n' });
  assert.ok(avec(sans, 'STUDIO_LAYER', ', type)'), JSON.stringify(sans));
});

test("exception « valeur » limitée à son fichier et à sa cible", (t) => {
  const table = sansExceptions();
  table.studioModele.exceptions = [{ fichier: 'noyau/document.ts', cible: 'objets', nature: 'valeur', raison: 'agrégateur de validation signalé' }];
  const erreurs = controler(t, {
    ...couches,
    [`${ST}/noyau/document.ts`]: 'import { ligne } from "../objets/ligne.js";\nexport const d = ligne;\n',
    [`${ST}/noyau/etat.ts`]: 'import { ligne } from "../objets/ligne.js";\nexport const e = ligne;\n',
    [`${ST}/noyau/calques.ts`]: 'import { solide } from "../objets-3d/solides.js";\nexport const c = solide;\n',
  }, table);
  assert.equal(erreurs.length, 2, JSON.stringify(erreurs));
  assert.ok(avec(erreurs, 'noyau/etat.ts', 'noyau → objets'));
  assert.ok(avec(erreurs, 'noyau/calques.ts', 'noyau → objets-3d'));
});

test('exception périmée : une exception sans import correspondant fait échouer le contrôle', (t) => {
  const table = sansExceptions();
  table.studioModele.exceptions = [{ fichier: 'noyau/types.ts', cible: 'objets', nature: 'type', raison: 'ne sert plus' }];
  assert.ok(avec(controler(t, couches, table), 'EXCEPTION_PERIMEE', 'noyau/types.ts → objets'));
});

test('les exceptions réelles du dépôt sont toutes utilisées (aucune ne dort)', () => {
  const erreurs = checkModuleDependencies(undefined, { frontieres: TABLE }).errors;
  assert.deepEqual(erreurs.filter((e) => e.includes('EXCEPTION_PERIMEE')), []);
});

test('modèle pur : React, react-dom, three et @react-three refusés même déclarés au manifeste', (t) => {
  const erreurs = controler(t, {
    'packages/atelier-model/manifest.json': JSON.stringify({ name: '@parcours/atelier-model', allowedDependencies: ['react', 'react-dom', 'three', '@react-three/fiber', 'reactive'] }),
    'packages/atelier-model/src/vue.ts': [
      'import React from "react";',
      'import { createRoot } from "react-dom/client";',
      'import { Mesh } from "three";',
      'import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";',
      'import { Canvas } from "@react-three/fiber";',
      'import { flux } from "reactive";',
      'export const v = [React, createRoot, Mesh, OrbitControls, Canvas, flux];',
    ].join('\n') + '\n',
  });
  for (const spec of ['react —', 'react-dom/client', 'three —', 'three/examples', '@react-three/fiber']) assert.ok(avec(erreurs, 'PURE_MODEL', spec), `${spec} : ${JSON.stringify(erreurs)}`);
  assert.ok(!avec(erreurs, 'PURE_MODEL', 'reactive'), 'un nom voisin (« reactive ») n\'est pas visé');
});

test('modèle pur : un fichier de test non plus n\'importe pas React', (t) => {
  const erreurs = controler(t, { 'packages/atelier-model/src/vue.test.ts': 'import { render } from "react-dom";\nexport const r = render;\n' });
  assert.ok(avec(erreurs, 'PURE_MODEL', 'react-dom'), JSON.stringify(erreurs));
});

test('modèle pur : lib DOM refusée dans le tsconfig, sauf exception déclarée, et exception périmée signalée', (t) => {
  const cfg = (lib) => JSON.stringify({ compilerOptions: { lib, module: 'ESNext', moduleResolution: 'Bundler' } });
  const refuse = controler(t, { 'packages/atelier-model/tsconfig.json': cfg(['ES2022', 'DOM']) });
  assert.ok(avec(refuse, 'PURE_MODEL', 'lib DOM'), JSON.stringify(refuse));
  const table = sansExceptions();
  table.modelePur = { ...TABLE.modelePur, libDom: { exceptions: [{ paquet: 'packages/atelier-model', raison: 'essai' }] } };
  assert.deepEqual(controler(t, { 'packages/atelier-model/tsconfig.json': cfg(['ES2022', 'DOM']) }, table), []);
  assert.ok(avec(controler(t, { 'packages/atelier-model/tsconfig.json': cfg(['ES2022']) }, table), 'EXCEPTION_PERIMEE', 'lib DOM'));
});

test('API Studio : ni React, ni three, ni code web ; les autres fichiers de l\'API ne sont pas visés par cette règle', (t) => {
  const erreurs = controler(t, {
    'apps/web/src/modules/studio/contrat.ts': 'export const c = 1;\n',
    'apps/api/src/lib/studio-commands.ts': 'import { c } from "../../../web/src/modules/studio/contrat";\nimport React from "react";\nexport const x = [c, React];\n',
    'apps/api/src/routes/studio.ts': 'import { Mesh } from "three";\nexport const m = Mesh;\n',
    'apps/api/src/lib/autre.ts': 'import React from "react";\nexport const r = React;\n',
  });
  assert.ok(avec(erreurs, 'API_STUDIO_BOUNDARY', 'apps/web'), JSON.stringify(erreurs));
  assert.ok(avec(erreurs, 'lib/studio-commands.ts : API_STUDIO_BOUNDARY', 'react'), JSON.stringify(erreurs));
  assert.ok(avec(erreurs, 'routes/studio.ts : API_STUDIO_BOUNDARY', 'three'), JSON.stringify(erreurs));
  assert.ok(!avec(erreurs, 'lib/autre.ts : API_STUDIO_BOUNDARY'), JSON.stringify(erreurs));
});

test('web : la Planche (modules/atelier/nouveau/planche) et Studio ne se croisent pas, dans les deux sens', (t) => {
  const erreurs = controler(t, {
    'apps/web/src/modules/studio/planche2d/Vue.tsx': 'import { p } from "../../atelier/nouveau/planche/outil";\nexport const v = p;\n',
    'apps/web/src/modules/atelier/nouveau/planche/outil.ts': 'import { e } from "../../../studio/etat";\nexport const p = e;\n',
    'apps/web/src/modules/studio/etat.ts': 'export const e = 1;\n',
  });
  assert.ok(avec(erreurs, 'STUDIO_BOUNDARY', 'modules/studio → modules/atelier'), JSON.stringify(erreurs));
  assert.ok(avec(erreurs, 'STUDIO_BOUNDARY', 'modules/atelier → modules/studio'), JSON.stringify(erreurs));
});

test('web : un point d\'entrée public déclaré dans la table ouvre la frontière, lui seul', (t) => {
  const table = sansExceptions();
  table.web = { ...TABLE.web, interfacesPubliques: { liste: ['modules/atelier/nouveau/planche/public'] } };
  const erreurs = controler(t, {
    'apps/web/src/modules/studio/Vue.tsx': 'import { a } from "../atelier/nouveau/planche/public";\nimport { b } from "../atelier/nouveau/planche/interne";\nexport const v = [a, b];\n',
    'apps/web/src/modules/atelier/nouveau/planche/public.ts': 'export const a = 1;\n',
    'apps/web/src/modules/atelier/nouveau/planche/interne.ts': 'export const b = 1;\n',
  }, table);
  assert.equal(erreurs.length, 1, JSON.stringify(erreurs));
  assert.ok(avec(erreurs, 'STUDIO_BOUNDARY', 'planche/interne'));
});

test('CLI : --root et --frontieres font échouer un mauvais import de fixture (code 1)', (t) => {
  const root = arbre(t, { ...couches, [`${ST}/noyau/etat.ts`]: 'import { ligne } from "../objets/ligne.js";\nexport const e = ligne;\n' });
  const table = path.join(root, 'frontieres.json');
  fs.writeFileSync(table, JSON.stringify(sansExceptions()));
  const r = spawnSync(process.execPath, [SCRIPT, `--root=${root}`, `--frontieres=${table}`], { encoding: 'utf8' });
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /STUDIO_LAYER : couche noyau → objets interdite/);
});
