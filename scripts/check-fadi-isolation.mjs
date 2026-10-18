#!/usr/bin/env node
/** Isolation nominale Fadi. Ne prouve ni l'origine d'une fonction, ni le contenu des dépendances téléchargées. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', '.next', 'build', 'test-results', 'playwright-report']);
const ROOT_CONFIG = /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|bun\.lockb?|\.gitmodules|\.npmrc|\.yarnrc(?:\.yml)?|Dockerfile(?:\..+)?|docker-compose.*\.ya?ml|compose.*\.ya?ml|.*\.(?:[cm]?[jt]s|json|ya?ml|toml))$/i;
const FORBIDDEN = /draw[\s_-]?all|docs[\\/]drawall/i;

export function checkIsolation(root = ROOT) {
  const errors = [], binaryFiles = [], excludedDocs = [];
  let filesChecked = 0;
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  function scan(file) {
    const p = rel(file);
    if (/\.(?:md|mdx|rst)$/i.test(file)) { excludedDocs.push(p); return; }
    const st = fs.statSync(file);
    if (st.size > 64 * 1024 * 1024) { errors.push(`${p} : fichier > 64 Mio, analyse explicite requise`); return; }
    const data = fs.readFileSync(file);
    filesChecked++;
    // Les binaires sont examinés pour des marqueurs ASCII, sans prétendre décompresser les archives.
    const binary = data.includes(0);
    if (binary) binaryFiles.push(p);
    const text = data.toString(binary ? 'latin1' : 'utf8');
    if (FORBIDDEN.test(p)) errors.push(`${p} : référence nominale dans le chemin`);
    text.split(/\r?\n/).forEach((line, i) => {
      if (FORBIDDEN.test(line)) errors.push(`${p}:${i + 1} : référence nominale externe`);
    });
  }
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(e.name)) continue;
      const file = path.join(dir, e.name);
      if (e.isSymbolicLink()) { errors.push(`${rel(file)} : lien symbolique non couvert, examen explicite requis`); continue; }
      if (e.isDirectory()) walk(file);
      else if (e.isFile()) scan(file);
    }
  }
  for (const dir of ['apps', 'packages', 'ops', 'infra', 'deploy', 'config']) walk(path.join(root, dir));
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ROOT_CONFIG.test(e.name)) continue;
    if (e.isSymbolicLink()) errors.push(`${e.name} : configuration symbolique non couverte`);
    else if (e.isFile()) scan(path.join(root, e.name));
  }
  if (!filesChecked) errors.push('Aucun fichier contrôlé : périmètre vide');
  return { filesChecked, binaryFiles, excludedDocs, errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = checkIsolation();
    console.log(`Isolation : ${r.filesChecked} fichiers ; ${r.binaryFiles.length} binaires (marqueurs ASCII seulement) ; ${r.excludedDocs.length} documents exclus.`);
    if (r.errors.length) { console.error('FADI_EXTERNAL_APP_REFERENCE_FAILED\n - ' + r.errors.join('\n - ')); process.exitCode = 1; }
    else console.log('FADI_EXTERNAL_APP_REFERENCE_OK : aucune référence nominale interdite dans le périmètre contrôlé.');
  } catch (error) { console.error('FADI_EXTERNAL_APP_REFERENCE_ERROR : ' + error.message); process.exitCode = 2; }
}
