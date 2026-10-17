/**
 * Fadi — contexte de chantier persistant dans GitHub.
 * Exécution locale uniquement. Aucune API, aucune lecture de secrets.
 * Node >=22, sans dépendance NPM.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REQUIRED_FILES = ['CONTEXT.md', 'TASKS.md', 'STATUS.md', 'HANDOFF.md'];

export const HEADINGS = {
  'CONTEXT.md': ['Objectif', 'Périmètre', 'Sources canoniques', 'Contraintes', 'Hypothèses et questions ouvertes'],
  'TASKS.md': ['À faire', 'En cours', 'Terminé', 'Bloqué', 'Critères de sortie'],
  'STATUS.md': ['État', 'Faits vérifiés', 'Points ouverts', 'Liens de suivi', 'Préconditions de clôture'],
  'HANDOFF.md': ['Point de reprise', 'Dernier état vérifié', 'Prochaine action', 'Tests et preuves', 'Risques et blocages', 'Arrêt sûr'],
};

const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const forbidden = [
  { name: 'clé privée', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { name: 'URL de ping secrète', pattern: /https:\/\/hc-ping\.com\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/ },
  { name: 'mot de passe affecté en clair', pattern: /^\s*(?:OS_PASSWORD|RESTIC_PASSWORD|PGPASSWORD)\s*=\s*.+$/m },
];

export function validSlug(slug) {
  return typeof slug === 'string' && slugPattern.test(slug);
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function dateOf(markdown) {
  const match = /^Mis à jour : (\d{4}-\d{2}-\d{2}) \(UTC\)\.$/m.exec(markdown);
  return match?.[1] ?? null;
}

function section(markdown, heading) {
  const chunks = markdown.split(/^## /m);
  const match = chunks.find((s) => s.split('\n', 1)[0].trim() === heading);
  if (!match) return null;
  return match.slice(match.indexOf('\n') + 1).trim();
}

export function validateWorkstream(root, slug) {
  const errors = [];
  if (!validSlug(slug)) return ['Nom de chantier non conforme : ' + slug];
  const dir = path.join(root, 'docs', 'workstreams', slug);
  const contentByFile = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(dir, name);
    const label = relative(root, file);
    if (!fs.existsSync(file)) {
      errors.push(label + ' manquant');
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    contentByFile[name] = content;
    if (content.length < 100) errors.push(label + ' trop court pour permettre une reprise fiable');
    if (/__[A-Z][A-Z0-9_]*__/.test(content)) errors.push(label + ' contient des champs de modèle non renseignés');
    if (/<<<<<{2,}|======={2,}|>>>>>{2,}/.test(content)) errors.push(label + ' contient des marqueurs de conflit Git');
    for (const { name: secretName, pattern } of forbidden) {
      if (pattern.test(content)) errors.push(label + ' semble exposer une ' + secretName);
    }
    for (const heading of HEADINGS[name]) {
      const text = section(content, heading);
      if (text === null) errors.push(label + ' : section « ' + heading + ' » manquante');
      else if (text.length < 10) errors.push(label + ' : section « ' + heading + ' » trop courte');
    }
  }
  const statusDate = dateOf(contentByFile['STATUS.md'] ?? '');
  const handoffDate = dateOf(contentByFile['HANDOFF.md'] ?? '');
  if (!statusDate) errors.push('STATUS.md : date de checkpoint UTC manquante');
  if (!handoffDate) errors.push('HANDOFF.md : date de checkpoint UTC manquante');
  if (statusDate && handoffDate && statusDate !== handoffDate) {
    errors.push('Dates STATUS/HANDOFF différentes : enregistrer le même checkpoint dans les deux fichiers');
  }
  const indexFile = path.join(root, 'docs/workstreams/README.md');
  if (fs.existsSync(indexFile) && !fs.readFileSync(indexFile, 'utf8').includes('(' + slug + '/CONTEXT.md)')) {
    errors.push('docs/workstreams/README.md : chantier ' + slug + ' absent de l’index');
  }
  return errors;
}

export function validateRepository(root = REPO_ROOT) {
  const errors = [];
  for (const required of ['AGENTS.md', 'CLAUDE.md', 'docs/architecture.md', 'docs/continuity/README.md', 'docs/workstreams/README.md']) {
    if (!fs.existsSync(path.join(root, required))) errors.push('Fichier de référence absent : ' + required);
  }
  for (const name of [...REQUIRED_FILES, 'ADR.md']) {
    if (!fs.existsSync(path.join(root, 'docs/continuity/templates', name))) errors.push('Modèle manquant : ' + name);
  }
  const folder = path.join(root, 'docs/workstreams');
  if (!fs.existsSync(folder)) return [...errors, 'Répertoire docs/workstreams absent'];
  const slugs = fs.readdirSync(folder, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name);
  if (slugs.length === 0) errors.push('Aucun chantier documenté');
  for (const slug of slugs) errors.push(...validateWorkstream(root, slug));
  return errors;
}

export function validateChangedPaths(paths) {
  // Oblige un checkpoint double si un document de chantier est changé.
  const changed = new Set(paths.map((s) => s.replaceAll('\\', '/')));
  const slugs = new Set();
  for (const entry of changed) {
    const match = /^docs\/workstreams\/([^/]+)\/.+$/.exec(entry);
    if (match) slugs.add(match[1]);
  }
  const errors = [];
  for (const slug of slugs) {
    for (const name of ['STATUS.md', 'HANDOFF.md']) {
      if (!changed.has('docs/workstreams/' + slug + '/' + name)) {
        errors.push('Le chantier « ' + slug + ' » est modifié sans checkpoint ' + name + ' dans le diff');
      }
    }
  }
  return errors;
}

export function initializeWorkstream(root, slug, issueNumber) {
  if (!validSlug(slug)) throw new Error('Slug invalide : utiliser des minuscules et des tirets.');
  if (!/^[1-9]\d*$/.test(String(issueNumber))) throw new Error('Numéro GitHub Issue positif requis.');
  const dir = path.join(root, 'docs/workstreams', slug);
  if (fs.existsSync(dir)) throw new Error('Chantier existant : refus de remplacer son contexte.');
  const idxPath = path.join(root, 'docs/workstreams/README.md');
  const idx = fs.readFileSync(idxPath, 'utf8');
  const marker = '\n\n## Ouvrir un chantier';
  if (!idx.includes(marker)) throw new Error('Index incompatible : marqueur de tableau introuvable.');
  const title = slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  const issue = 'https://github.com/RachEma-ux/Fadi/issues/' + issueNumber;
  const date = new Date().toISOString().slice(0, 10);
  const values = {
    TITLE: title,
    OBJECTIVE: 'À définir dans l’Issue avant toute implémentation.',
    SCOPE: 'À définir : demande bornée et critères vérifiables.',
    ISSUE: issue,
    REFERENCES: 'À relever à partir des sources existantes du dépôt.',
    OPEN_QUESTIONS: 'Périmètre, critères d’acceptation, risques et dépendances à confirmer.',
    TASK_ID: slug.toUpperCase().replaceAll('-', '_') + '-01',
    TASK_DESCRIPTION: 'Cadrer le chantier et vérifier ses contraintes.',
    DATE: date,
    VERIFIED_FACTS: 'Dossier de continuité initialisé ; aucune implémentation métier n’a été vérifiée.',
    OPEN_ITEMS: 'Cadrage, architecture/contraintes et définition des vérifications.',
    LAST_VERIFIED: 'Seule la création du dossier est acquise ; vérifier le dépôt avant toute intervention.',
    NEXT_ACTION: 'Lire l’Issue, vérifier GitHub puis définir la première tâche autorisée.',
    EVIDENCE: 'Initialisation documentaire locale, aucun test d’application ni déploiement.',
    BLOCKERS: 'Périmètre et décisions encore à confirmer.',
    SLUG: slug,
  };
  const files = REQUIRED_FILES.map((name) => {
    const file = path.join(root, 'docs/continuity/templates', name);
    let body = fs.readFileSync(file, 'utf8');
    body = body.replace(/__([A-Z][A-Z0-9_]*)__/g, (full, key) => {
      if (!(key in values)) throw new Error('Paramètre de modèle manquant : ' + key);
      return values[key];
    });
    return [name, body];
  });
  const row = '| ' + title + ' | À définir | [' + slug + '/](' + slug + '/CONTEXT.md) | [Issue #' + issueNumber + '](' + issue + ') |';
  const newIndex = idx.replace(marker, '\n' + row + marker);
  fs.mkdirSync(dir, { recursive: false });
  for (const [name, body] of files) fs.writeFileSync(path.join(dir, name), body, { flag: 'wx' });
  fs.writeFileSync(idxPath, newIndex);
  return dir;
}

export function statusReport(root, slug) {
  if (!validSlug(slug)) throw new Error('Nom de chantier invalide.');
  const folder = path.join(root, 'docs/workstreams', slug);
  if (!fs.existsSync(folder)) throw new Error('Chantier introuvable : ' + slug);
  return [
    'POINT DE REPRISE LOCAL — vérifier l’état actuel sur GitHub avant d’agir.',
    '=== HANDOFF.md ===',
    fs.readFileSync(path.join(folder, 'HANDOFF.md'), 'utf8'),
    '=== STATUS.md ===',
    fs.readFileSync(path.join(folder, 'STATUS.md'), 'utf8'),
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, slug, issue] = process.argv.slice(2);
    if (command === 'init' && slug && issue) {
      console.log('CHANTIER_CREE : ' + relative(REPO_ROOT, initializeWorkstream(REPO_ROOT, slug, issue)));
      console.log('Vérifier les documents, les adapter, puis ouvrir une PR ; aucune branche distante créée.');
    } else if (command === 'status' && slug) {
      console.log(statusReport(REPO_ROOT, slug));
    } else {
      console.error('Utilisation : node scripts/continuity.mjs init <slug> <issue-number> | status <slug>');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('CONTINUITY_ERROR : ' + error.message);
    process.exitCode = 1;
  }
}
