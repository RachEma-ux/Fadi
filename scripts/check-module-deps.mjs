#!/usr/bin/env node
/** Frontières Fadi (T14) : analyse AST et résolution TypeScript, sans exécuter le code audité. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/;
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', 'build']);
const inside = (base, file) => file === base || file.startsWith(base + path.sep);
const bare = (s) => s.startsWith('node:') ? 'node:' : s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
const literal = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

/**
 * Table des frontières (lot X.4) : `scripts/frontieres.json`, seule source des règles Studio ↔ Atelier (web), des couches
 * du modèle Studio, du modèle pur et du Studio de l'API. Le contrôle applique la table ; il n'en contient aucune.
 */
const DEFAULT_FRONTIERES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frontieres.json');
export function lireFrontieres(fichier = DEFAULT_FRONTIERES) { return JSON.parse(fs.readFileSync(fichier, 'utf8')); }
const sous = (chemin, prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`) || chemin.startsWith(`${prefixe}.`);
// `paquet/*` couvre les sous-chemins (et, pour un scope `@x/*`, tous ses paquets) ; sinon nom de paquet exact.
const paquetVise = (spec, motifs) => motifs.find((m) => m.endsWith('/*') ? spec.startsWith(m.slice(0, -1)) || (!m.startsWith('@') && spec === m.slice(0, -2)) : bare(spec) === m && (spec === m || !m.includes('/')));
const local = (spec) => spec.startsWith('.') || path.isAbsolute(spec) || spec.startsWith('#');

export function checkModuleDependencies(root = DEFAULT_ROOT, { frontieres = lireFrontieres() } = {}) {
  root = fs.realpathSync(root);
  const FRONTIERES_WEB = frontieres.web?.regles ?? [];
  const INTERFACES_PUBLIQUES = frontieres.web?.interfacesPubliques?.liste ?? [];
  const STUDIO = frontieres.studioModele ?? null;
  const PUR = frontieres.modelePur ?? null;
  const API_STUDIO = frontieres.apiStudio ?? null;
  const exceptionsUtilisees = new Set();
  const errors = [], units = [], optionsCache = new Map(), graph = new Map();
  let filesChecked = 0, importsChecked = 0;
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const fail = (file, rule, detail) => errors.push(`${relative(file)} : ${rule} : ${detail}`);
  const readJson = (file, fallback = {}) => {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { fail(file, 'CONFIG_INVALID', 'JSON illisible'); return fallback; }
  };
  function directories(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).filter(e => {
      if (e.isSymbolicLink()) fail(path.join(dir, e.name), 'SYMLINK', 'répertoire audité symbolique interdit');
      return e.isDirectory() && !SKIP.has(e.name);
    }).map(e => path.join(dir, e.name));
  }
  for (const kind of ['packages', 'apps']) {
    for (const dir of directories(path.join(root, kind))) {
      const pkg = readJson(path.join(dir, 'package.json'));
      const mf = path.join(dir, 'manifest.json');
      const manifest = readJson(mf);
      if (kind === 'packages' && (!fs.existsSync(mf) || !manifest.name || !Array.isArray(manifest.allowedDependencies))) {
        fail(mf, 'MANIFEST_INVALID', 'name et allowedDependencies requis');
      }
      const name = manifest.name || pkg.name || relative(dir);
      if (units.some(u => u.name === name)) fail(dir, 'DUPLICATE_UNIT', name);
      if (manifest.name && pkg.name && manifest.name !== pkg.name) fail(mf, 'MANIFEST_NAME', 'nom différent du package.json');
      units.push({ kind, dir, name, pkg, allowed: new Set(manifest.allowedDependencies || []) });
      graph.set(name, new Set());
    }
  }
  if (!units.some(u => u.kind === 'packages')) fail(root, 'EMPTY_SCOPE', 'aucun paquet à contrôler');
  const byName = new Map(units.map(u => [u.name, u]));
  const owner = (file) => units.find(u => inside(u.dir, file));
  function edge(a, b) { if (a !== b) graph.get(a)?.add(b); }
  for (const u of units) {
    const names = u.kind === 'packages' ? [...u.allowed, ...Object.keys(u.pkg.dependencies || {})] : Object.keys(u.pkg.dependencies || {});
    for (const name of names) if (byName.has(name)) {
      if (u.name === name) fail(u.dir, 'DEPENDENCY_CYCLE', `${name} -> ${name}`);
      else edge(u.name, name);
      const v = byName.get(name);
      if ((u.kind === 'packages' && v.kind === 'apps') || (u.kind === 'apps' && v.kind === 'apps')) fail(u.dir, 'FORBIDDEN_BOUNDARY', name);
      if (u.kind === 'packages' && !u.allowed.has(name)) fail(u.dir, 'UNDECLARED_PACKAGE', name);
    }
  }
  function options(file, unit) {
    const config = ts.findConfigFile(path.dirname(file), ts.sys.fileExists);
    if (config && inside(root, config)) {
      if (!optionsCache.has(config)) {
        const loaded = ts.readConfigFile(config, ts.sys.readFile);
        if (loaded.error) fail(config, 'TSCONFIG_INVALID', ts.flattenDiagnosticMessageText(loaded.error.messageText, ' '));
        const parsed = ts.parseJsonConfigFileContent(loaded.config || {}, ts.sys, path.dirname(config));
        for (const e of parsed.errors.filter(e => e.code !== 18003)) fail(config, 'TSCONFIG_INVALID', ts.flattenDiagnosticMessageText(e.messageText, ' '));
        optionsCache.set(config, parsed.options);
      }
      return optionsCache.get(config);
    }
    return { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, allowJs: true };
  }
  function resolveFile(spec, file, unit) {
    const clean = spec.startsWith('#') ? spec : spec.split(/[?#]/)[0];
    const result = ts.resolveModuleName(clean, file, options(file, unit), ts.sys).resolvedModule;
    let target = result?.resolvedFileName;
    if (!target && (clean.startsWith('.') || path.isAbsolute(clean))) {
      const candidate = path.resolve(path.dirname(file), clean);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) target = candidate;
    }
    // Les fixtures sans node_modules restent testables ; pas de substitution aux alias tsconfig.
    if (!target && byName.has(bare(clean))) {
      const peer = byName.get(bare(clean));
      const tail = clean.slice(peer.name.length).replace(/^\//, '');
      target = path.join(peer.dir, tail || 'src/index.ts');
    }
    if (!target) return null;
    return fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
  }
  const ontology = (file) => /\/src\/ontologies\/([^/]+)\//.exec(relative(file))?.[1];
  const apiStudio = (file) => {
    if (!API_STUDIO) return false;
    const depuis = path.relative(path.join(root, API_STUDIO.racine), file).split(path.sep).join('/');
    return !depuis.startsWith('..') && API_STUDIO.de.some((p) => depuis.startsWith(p));
  };
  // Graphe des dossiers du modèle Studio (hors tests, hors fichiers de la racine de studio/, qui sont des façades) :
  // un nœud par dossier de premier niveau, sauf les primitives déclarées distinctes (`cycles.noeudsDistincts`, par
  // exemple registre/schemas-base), qui forment leur propre nœud. Tout cycle entre dossiers est refusé.
  const grapheStudio = new Map();
  const noeudStudio = (rel) => {
    const distinct = (STUDIO?.cycles?.noeudsDistincts ?? []).find((n) => sous(rel, n));
    if (distinct) return distinct;
    const i = rel.indexOf('/');
    return i < 0 ? null : rel.slice(0, i);
  };
  function couchesStudio(file, target, spec, typeOnly, test) {
    const base = path.join(root, STUDIO.racine);
    if (!inside(base, file) || !inside(base, target)) return;
    const depuis = path.relative(base, file).split(path.sep).join('/');
    const cible = path.relative(base, target).split(path.sep).join('/');
    const [na, nb] = [noeudStudio(depuis), noeudStudio(cible)];
    if (!test && na && nb && na !== nb) {
      if (!grapheStudio.has(na)) grapheStudio.set(na, new Map());
      if (!grapheStudio.get(na).has(nb)) grapheStudio.get(na).set(nb, `${depuis} → ${spec}`);
    }
    for (const regle of STUDIO.regles.filter((r) => sous(depuis, r.de))) {
      const interdit = regle.interdits.find((x) => sous(cible, x));
      if (!interdit || (regle.sauf ?? []).some((x) => sous(cible, x))) continue;
      const exception = (STUDIO.exceptions ?? []).findIndex((e) => e.fichier === depuis && sous(cible, e.cible) && (e.nature === 'valeur' || typeOnly));
      if (exception >= 0) { exceptionsUtilisees.add(exception); continue; }
      fail(file, 'STUDIO_LAYER', `couche ${regle.de} → ${interdit} interdite (${spec}${typeOnly ? ', type' : ''}) — ${regle.motif}`);
    }
  }
  function examine(spec, file, unit, test, typeOnly = false) {
    importsChecked++;
    if (/^(?:https?:|data:|file:)/i.test(spec)) { fail(file, 'REMOTE_IMPORT', spec); return; }
    if (!local(spec)) {
      const pur = unit.kind === 'packages' && PUR ? paquetVise(spec, PUR.paquetsInterdits) : null;
      if (pur) fail(file, 'PURE_MODEL', `${spec} — ${PUR.motif}`);
      const api = apiStudio(file) ? paquetVise(spec, API_STUDIO.paquetsInterdits) : null;
      if (api) fail(file, 'API_STUDIO_BOUNDARY', `${spec} — ${API_STUDIO.motif}`);
    }
    const target = resolveFile(spec, file, unit);
    const peer = target && !target.includes(path.sep + 'node_modules' + path.sep) ? owner(target) : null;
    if (target && target.includes(path.sep + 'node_modules' + path.sep) && !peer) {
      // Paquet tiers : son contenu transitoire n'est pas analysé par ce contrôle de frontières.
    } else if (target && !inside(root, target)) {
      fail(file, 'OUTSIDE_REPOSITORY', spec); return;
    } else if (peer) {
      if (peer !== unit) {
        if (!test) edge(unit.name, peer.name);
        if (peer.kind === 'apps') fail(file, 'FORBIDDEN_BOUNDARY', `${unit.name} -> ${peer.name} (${spec})`);
        const cheminCible = relative(target);
        const viseApi = apiStudio(file) ? API_STUDIO.cheminsInterdits.find((c) => sous(cheminCible, c)) : null;
        if (viseApi) fail(file, 'API_STUDIO_BOUNDARY', `${viseApi} (${spec}) — ${API_STUDIO.motif}`);
        if (unit.kind === 'packages' && !unit.allowed.has(peer.name)) fail(file, 'UNDECLARED_PACKAGE', `${peer.name} (${spec})`);
      }
      if (STUDIO && peer === unit) couchesStudio(file, target, spec, typeOnly, test);
      const a = ontology(file), b = ontology(target);
      if (a && b && a !== b) fail(file, 'ONTOLOGY_BOUNDARY', `${a} -> ${b} (${spec})`);
      const webSrc = path.join(root, 'apps', 'web', 'src');
      if (inside(webSrc, file) && inside(webSrc, target)) {
        const depuis = path.relative(webSrc, file).split(path.sep).join('/');
        const cible = path.relative(webSrc, target).split(path.sep).join('/');
        if (!INTERFACES_PUBLIQUES.some((i) => sous(cible, i))) {
          for (const regle of FRONTIERES_WEB.filter((f) => sous(depuis, f.de))) {
            const interdit = regle.interdits.find((x) => sous(cible, x));
            if (interdit) fail(file, 'STUDIO_BOUNDARY', `frontière ${regle.de} → ${interdit} interdite (${spec}) — ${regle.motif}`);
          }
        }
      }
      return;
    } else if (target && inside(root, target) && !target.includes(path.sep + 'node_modules' + path.sep)) {
      fail(file, 'UNMANAGED_SOURCE', spec); return;
    }
    if (local(spec)) {
      fail(file, 'UNRESOLVED_LOCAL_IMPORT', spec); return;
    }
    const name = bare(spec);
    if (unit.kind === 'packages' && !(test && (name === 'vitest' || name === 'node:')) && !unit.allowed.has(name)) {
      fail(file, 'UNDECLARED_PACKAGE', name);
    }
  }
  function scan(file, unit) {
    filesChecked++;
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const test = TEST.test(file);
    for (const d of sf.parseDiagnostics) fail(file, 'PARSE_ERROR', ts.flattenDiagnosticMessageText(d.messageText, ' '));
    function typeSeulement(n) {
      if (ts.isImportTypeNode(n)) return true;
      if (ts.isImportDeclaration(n)) {
        const c = n.importClause;
        if (!c) return false;
        if (c.isTypeOnly) return true;
        return !c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly);
      }
      if (ts.isExportDeclaration(n)) {
        if (n.isTypeOnly) return true;
        return !!n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every((e) => e.isTypeOnly);
      }
      return false;
    }
    function importNode(n, arg) {
      const value = literal(arg);
      if (value === null) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        fail(file, 'NON_LITERAL_IMPORT', `ligne ${line + 1} : cible calculée non analysable ; utiliser des imports littéraux explicites`);
      } else examine(value, file, unit, test, typeSeulement(n));
    }
    function visit(n) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) importNode(n, n.moduleSpecifier);
      else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) importNode(n, n.moduleReference.expression);
      else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) importNode(n, n.argument.literal);
      else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) importNode(n, n.arguments[0]);
      else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(sf) === 'import.meta' && /^glob/.test(n.expression.name.text)) fail(file, 'NON_LITERAL_IMPORT', 'import.meta.glob doit être remplacé par des imports explicites ou audité séparément');
      if (unit.kind === 'packages' && !test && (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n))) {
        const receiver = n.expression;
        if (ts.isIdentifier(receiver) && /^(document|window|navigator|localStorage|HTMLElement)$/.test(receiver.text)) fail(file, 'BROWSER_API', receiver.text);
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
  }
  function walk(dir, unit) {
    if (!fs.existsSync(dir)) { fail(dir, 'MISSING_SOURCE', 'src absent'); return; }
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(e.name)) continue;
      const file = path.join(dir, e.name);
      if (e.isSymbolicLink()) { fail(file, 'SYMLINK', 'source symbolique à examiner explicitement'); continue; }
      if (e.isDirectory()) walk(file, unit);
      else if (e.isFile() && CODE.test(e.name)) scan(file, unit);
    }
  }
  for (const u of units) if (u.kind === 'packages' || fs.existsSync(path.join(u.dir, 'src'))) walk(path.join(u.dir, 'src'), u);
  if (STUDIO && fs.existsSync(path.join(root, STUDIO.racine))) {
    (STUDIO.exceptions ?? []).forEach((e, i) => {
      if (!exceptionsUtilisees.has(i)) fail(path.join(root, STUDIO.racine, e.fichier), 'EXCEPTION_PERIMEE', `exception ${e.fichier} → ${e.cible} (${e.nature}) sans import correspondant : la retirer de scripts/frontieres.json`);
    });
    // Cycles entre dossiers Studio : chaque cycle est signalé une fois, avec un import témoin par arête.
    const fini = new Set(), enCours = [], vus = new Set();
    const parcourir = (n) => {
      if (fini.has(n)) return;
      const k = enCours.indexOf(n);
      if (k >= 0) {
        const boucle = [...enCours.slice(k), n];
        const cle = [...boucle.slice(0, -1)].sort().join(',');
        if (!vus.has(cle)) {
          vus.add(cle);
          const temoins = boucle.slice(0, -1).map((x, i) => grapheStudio.get(x).get(boucle[i + 1]));
          fail(path.join(root, STUDIO.racine), 'STUDIO_LAYER_CYCLE', `cycle entre dossiers ${boucle.join(' → ')} (${temoins.join(' ; ')})`);
        }
        return;
      }
      enCours.push(n);
      for (const m of [...(grapheStudio.get(n)?.keys() ?? [])].sort()) parcourir(m);
      enCours.pop();
      fini.add(n);
    };
    for (const n of [...grapheStudio.keys()].sort()) parcourir(n);
  }
  if (PUR?.libDom) {
    const permis = new Set((PUR.libDom.exceptions ?? []).map((e) => e.paquet));
    for (const u of units.filter((x) => x.kind === 'packages')) {
      const config = path.join(u.dir, 'tsconfig.json');
      if (!fs.existsSync(config)) continue;
      // Options résolues (héritage `extends` compris) : `lib` y figure sous la forme `lib.dom.d.ts`.
      const loaded = ts.readConfigFile(config, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(loaded.config || {}, ts.sys, path.dirname(config));
      const libs = (parsed.options.lib ?? []).map((l) => String(l).toLowerCase().replace(/^lib\./, '').replace(/\.d\.ts$/, ''));
      const rel = relative(u.dir);
      if (libs.some((l) => l === 'dom' || l.startsWith('dom.'))) { if (!permis.has(rel)) fail(config, 'PURE_MODEL', `lib DOM déclarée dans le tsconfig d'un paquet pur — ${PUR.motif}`); }
      else if (permis.has(rel)) fail(config, 'EXCEPTION_PERIMEE', `exception lib DOM de ${rel} sans objet : la retirer de scripts/frontieres.json`);
    }
  }
  const done = new Set(), visiting = new Set();
  function cycles(name, chain = []) {
    if (visiting.has(name)) { fail(root, 'DEPENDENCY_CYCLE', [...chain.slice(chain.indexOf(name)), name].join(' -> ')); return; }
    if (done.has(name)) return;
    visiting.add(name);
    for (const next of graph.get(name) || []) cycles(next, [...chain, name]);
    visiting.delete(name); done.add(name);
  }
  for (const name of graph.keys()) cycles(name);
  return { filesChecked, importsChecked, errors: [...new Set(errors)].sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // `--root=<dossier>` contrôle un autre arbre (tests du script) ; par défaut, le dépôt qui contient ce script.
    const optionRacine = process.argv.find((a) => a.startsWith('--root='));
    const optionFrontieres = process.argv.find((a) => a.startsWith('--frontieres='));
    const frontieres = lireFrontieres(optionFrontieres ? path.resolve(optionFrontieres.slice('--frontieres='.length)) : undefined);
    const result = checkModuleDependencies(optionRacine ? path.resolve(optionRacine.slice('--root='.length)) : undefined, { frontieres });
    if (result.errors.length) { console.error(`check-module-deps : ${result.errors.length} violation(s)\n- ${result.errors.join('\n- ')}`); process.exitCode = 1; }
    else console.log(`check-module-deps : ${result.filesChecked} fichiers, ${result.importsChecked} imports ; frontières et graphes de paquets conformes.`);
  } catch (error) { console.error('check-module-deps : audit impossible : ' + error.message); process.exitCode = 2; }
}
