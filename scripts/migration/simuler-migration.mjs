#!/usr/bin/env node
/**
 * Simulation de migration vers Studio V1 sur une COPIE de base, en lecture seule (MIG-01 à MIG-10).
 *
 *   DATABASE_URL=postgresql://lecteur@hote/copie \
 *     npx tsx scripts/migration/simuler-migration.mjs --copie copie --sortie rapport-migration \
 *       [--hypothese repere-local-identite] [--hypothese base-elevation-niveau] [--file-locale export.json] \
 *       [--valider-studio] [--build <sha>] [--horodatage <ISO>]
 *
 * Écrit `<sortie>/simulation-migration.json` et `<sortie>/simulation-migration.md` (fichiers locaux seulement ; rien
 * n'est écrit dans la base). `--valider-studio` passe chaque document simulé au validateur de Studio
 * (`validateStudioDocument`, exécuté par tsx) ; sans lui, leur conformité est « non évaluée ».
 * Code de sortie : 0 rapport produit (même avec ambiguïtés, pertes, erreurs partielles : elles sont dans le rapport),
 * 2 usage ou lecture refusée, 1 échec inattendu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireBase, RefusLecture } from './lecture.mjs';
import { HYPOTHESES, rapportMarkdown, simuler } from './migration-lib.mjs';

export function lireArguments(argv) {
  const a = { hypotheses: [], filesLocales: [], validerStudio: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const valeur = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`valeur attendue après ${k}`); return v; };
    if (k === '--copie') a.copie = valeur();
    else if (k === '--sortie') a.sortie = valeur();
    else if (k === '--hypothese') { const h = valeur(); if (!Object.hasOwn(HYPOTHESES, h) || HYPOTHESES[h].toujours) throw new Error(`hypothèse non déclarable : ${h}`); a.hypotheses.push(h); }
    else if (k === '--file-locale') a.filesLocales.push(valeur());
    else if (k === '--valider-studio') a.validerStudio = true;
    else if (k === '--build') a.build = valeur();
    else if (k === '--horodatage') a.horodatage = valeur();
    else throw new Error(`argument inconnu : ${k}`);
  }
  if (!a.sortie) throw new Error('--sortie <dossier> attendu');
  return a;
}

export async function executer(argv, env = process.env) {
  const a = lireArguments(argv);
  const { lignes, base, lecture } = await lireBase({ connectionString: env.DATABASE_URL, copieDeclaree: a.copie });
  let validerDocument;
  if (a.validerStudio) {
    const modele = await import('@parcours/atelier-model').catch((err) => { throw new Error(`validateur Studio indisponible (lancer avec tsx) : ${err.message}`); });
    validerDocument = modele.validateStudioDocument;
  }
  const filesLocales = a.filesLocales.map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { format: null }; } });
  const rapport = simuler(lignes, {
    hypotheses: a.hypotheses, filesLocales, validerDocument, lecture,
    base: { nom: base.nom, role: base.role, serveur: base.serveur },
    sourceBuild: a.build ?? env.GITHUB_SHA ?? 'non renseigné',
    horodatage: a.horodatage ?? new Date().toISOString(),
  });
  fs.mkdirSync(a.sortie, { recursive: true });
  fs.writeFileSync(path.join(a.sortie, 'simulation-migration.json'), `${JSON.stringify(rapport, null, 2)}\n`);
  fs.writeFileSync(path.join(a.sortie, 'simulation-migration.md'), `${rapportMarkdown(rapport)}\n`);
  return rapport;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  executer(process.argv.slice(2)).then((r) => {
    const t = r.synthese.totaux;
    console.log(`Simulation : ${r.projets.length} projet(s) — compatibles ${t.compatible}, convertibles ${t.convertible}, ambigus ${t.ambigu}, non convertibles ${t['non-convertible']} (conservés), erreurs partielles ${t.erreurs}.`);
    for (const p of r.synthese.parProjet) console.log(`  ${p.code} : ${p.compatible} / ${p.convertible} / ${p.ambigu} / ${p['non-convertible']} ; erreurs ${p.erreurs}`);
    for (const e of r.erreursPartielles) console.log(`  erreur partielle — ${e.element} : ${e.code} (${e.message})`);
  }).catch((err) => {
    console.error(`simulation refusée : ${err.message}`);
    process.exit(err instanceof RefusLecture || /attendu|inconnu|déclarable/.test(err.message) ? 2 : 1);
  });
}
