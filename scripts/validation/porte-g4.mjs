#!/usr/bin/env node
/**
 * Porte G4 de Studio — contrôle automatisé de livraison (X.2-04 / BLOC-06, ADR-STUDIO-PILOTE-01 P-12) : la livraison est
 * REFUSÉE si un défaut éliminatoire (BLOC-01 à BLOC-07, Référentiel §7.3) n'est pas vérifié au registre
 * (`docs/workstreams/studio/task-register.json`), ou si sa preuve ne tient pas. Chaque refus nomme le défaut, la preuve
 * en cause et son propriétaire. Aucune mesure de performance n'entre dans la décision : un gain de FPS ou une moyenne
 * favorable ne neutralise jamais un défaut (les mesures fournies sont rapportées, non prises en compte).
 *
 * Une preuve tient si :
 *  - la tâche est « Vérifié » ou « Accepté » ;
 *  - elle cite au moins un test automatisé ou une recette (`test_automatise`, `recette_e2e`) ;
 *  - chaque fichier cité existe ;
 *  - chaque libellé de contrôle cité est écrit dans son fichier (mot pour mot, ou chacun des maillons « bloc > test »).
 *
 * Usage :
 *   node scripts/validation/porte-g4.mjs [--registre <json>] [--rapport <fichier.json>] [--markdown <fichier.md>]
 *        [--mesures <json>] [--avertir]
 * Code de sortie : 0 livraison admise ; 1 livraison refusée (0 avec `--avertir`, rapport inchangé : contrôle signalé en
 * CI sans bloquer les lots en cours) ; 2 registre illisible.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const REGISTRE = "docs/workstreams/studio/task-register.json";
export const ELIMINATOIRES = Object.freeze(["BLOC-01", "BLOC-02", "BLOC-03", "BLOC-04", "BLOC-05", "BLOC-06", "BLOC-07"]);
const STATUTS_VERIFIES = new Set(["Vérifié", "Accepté"]);
const TYPES_PREUVE = new Set(["test_automatise", "recette_e2e"]);

/** Le libellé est-il écrit dans le texte du fichier (mot pour mot, ou chaque maillon « bloc > test ») ? */
export function libelleEcrit(texte, libelle) {
  const variantes = (l) => [l, JSON.stringify(l).slice(1, -1), l.replaceAll("'", "\\'")];
  const present = (l) => variantes(l).some((v) => texte.includes(v));
  if (present(libelle)) return true;
  const maillons = libelle.split(" > ");
  return maillons.length > 1 && maillons.every(present);
}

/** Propriétaire d'une tâche : responsable du blocage, sinon agent, sinon « non désigné ». */
export const proprietaireDe = (t) => t?.blocage?.responsable ?? t?.agent ?? "non désigné";

/**
 * Décision de la porte G4 sur un registre. `lire(fichier)` rend le texte d'un fichier du dépôt ou null s'il manque.
 * Rend `{ decision, defauts, verifies, mesures }` ; `decision` vaut « livraison-admise » ou « livraison-refusee ».
 */
export function evaluerPorteG4(registre, lire, mesures = null) {
  const taches = new Map((registre?.tasks ?? []).map((t) => [t.id, t]));
  const defauts = [], verifies = [];
  for (const id of ELIMINATOIRES) {
    const t = taches.get(id);
    const proprietaire = proprietaireDe(t);
    if (!t) { defauts.push({ id, defaut: "défaut éliminatoire absent du registre", motif: "absent", preuve: null, proprietaire }); continue; }
    const base = { id, defaut: t.description, proprietaire };
    if (!STATUTS_VERIFIES.has(t.statut)) {
      defauts.push({ ...base, motif: "non-verifie", statut: t.statut, preuve: t.suite ?? t.tests?.portee ?? null });
      continue;
    }
    const preuves = (t.preuves ?? []).filter((p) => TYPES_PREUVE.has(p.type));
    if (!preuves.length) { defauts.push({ ...base, motif: "sans-preuve-executable", statut: t.statut, preuve: null }); continue; }
    const ecarts = [];
    for (const p of preuves) {
      const texte = lire(p.fichier);
      if (texte === null) { ecarts.push({ fichier: p.fichier, libelle: null, motif: "fichier-absent" }); continue; }
      const libelles = [...(p.controles ?? []), ...(typeof p.controle === "string" ? [p.controle] : []), ...(typeof p.libelle === "string" ? [p.libelle] : [])];
      for (const l of libelles) if (!libelleEcrit(texte, l)) ecarts.push({ fichier: p.fichier, libelle: l, motif: "libelle-introuvable" });
    }
    if (ecarts.length) defauts.push({ ...base, motif: "preuve-ne-tient-pas", statut: t.statut, preuve: ecarts });
    else verifies.push({ id, proprietaire, preuves: preuves.map((p) => p.fichier) });
  }
  return {
    porte: "G4", decision: defauts.length ? "livraison-refusee" : "livraison-admise", defauts, verifies,
    // Les mesures (FPS, moyennes) sont rapportées pour mémoire : elles n'entrent jamais dans la décision.
    mesures: mesures === null ? null : { fournies: mesures, prises_en_compte: false },
  };
}

/** Rapport lisible (Markdown) : décision, puis chaque défaut avec sa preuve et son propriétaire. */
export function rapportMarkdown(r, commit = null) {
  const l = [`# Porte G4 — ${r.decision === "livraison-admise" ? "livraison admise" : "livraison REFUSÉE"}`, ""];
  if (commit) l.push(`Commit : \`${commit}\``, "");
  l.push(`Défauts éliminatoires contrôlés : ${ELIMINATOIRES.join(", ")}. Vérifiés : ${r.verifies.map((v) => v.id).join(", ") || "aucun"}.`, "");
  if (r.defauts.length) {
    l.push("| Défaut | Motif | Preuve | Propriétaire |", "|---|---|---|---|");
    for (const d of r.defauts) {
      const preuve = Array.isArray(d.preuve) ? d.preuve.map((e) => `${e.fichier}${e.libelle ? ` — « ${e.libelle} »` : ""} (${e.motif})`).join(" ; ") : d.preuve ?? "aucune";
      l.push(`| ${d.id} — ${String(d.defaut).replaceAll("|", "\\|")} | ${d.motif}${d.statut ? ` (statut : ${d.statut})` : ""} | ${String(preuve).replaceAll("|", "\\|").replaceAll("\n", " ")} | ${d.proprietaire} |`);
    }
    l.push("");
  }
  if (r.mesures) l.push("Mesures de performance fournies : rapportées pour mémoire, non prises en compte (un gain ne neutralise aucun défaut).", "");
  return l.join("\n");
}

function arguments_(argv) {
  const o = { avertir: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--avertir") o.avertir = true;
    else if (["--registre", "--rapport", "--markdown", "--mesures"].includes(a)) o[a.slice(2)] = argv[++i];
  }
  return o;
}

export function principal(argv = process.argv.slice(2), sortie = console) {
  const o = arguments_(argv);
  let registre;
  try { registre = JSON.parse(readFileSync(resolve(RACINE, o.registre ?? REGISTRE), "utf8")); }
  catch (e) { sortie.error(`porte G4 : registre illisible — ${e.message}`); return 2; }
  const mesures = o.mesures ? JSON.parse(readFileSync(resolve(o.mesures), "utf8")) : null;
  const lire = (f) => { const p = join(RACINE, f); return existsSync(p) ? readFileSync(p, "utf8") : null; };
  const r = evaluerPorteG4(registre, lire, mesures);
  const commit = process.env.GITHUB_SHA ?? null;
  if (o.rapport) writeFileSync(resolve(o.rapport), `${JSON.stringify({ ...r, commit, date: new Date().toISOString() }, null, 2)}\n`);
  if (o.markdown) writeFileSync(resolve(o.markdown), rapportMarkdown(r, commit));
  sortie.log(rapportMarkdown(r, commit));
  if (r.decision === "livraison-admise") return 0;
  for (const d of r.defauts) sortie.error(`porte G4 : ${d.id} non vérifié (${d.motif}) — propriétaire ${d.proprietaire}`);
  return o.avertir ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(principal());
