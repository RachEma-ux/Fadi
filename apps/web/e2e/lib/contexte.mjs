/**
 * Utilitaires partagés du scénario de bout en bout (déplacés de l'ancien `parcours-scenario.mjs`, L0.5) :
 * adresse de l'application, dossier des captures, `check`, `measure`, `axeCheck`, et comptage des contrôles
 * (total et par fichier de `scenarios/`) que `run.mjs` compare à `attendu.json`.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE = process.env.BASE_URL ?? "http://localhost:4173";
export const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/migration/captures/webapp");
mkdirSync(OUT, { recursive: true });
export const launch = { executablePath: process.env.CHROMIUM_PATH ?? undefined };
export const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/** Comptage des contrôles : total, échecs et répartition par fichier de scénario (renseigné par `run.mjs`). */
export const bilan = { total: 0, failures: 0, fichierCourant: "", parFichier: {} };

export function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) bilan.failures++;
  bilan.total++;
  bilan.parFichier[bilan.fichierCourant] = (bilan.parFichier[bilan.fichierCourant] ?? 0) + 1;
}
/** Mesures indicatives (cible d'acceptation : ouverture, modification, enregistrement) — relevées, jamais des seuils ; elles dépendent de la machine. */
export const measures = [];
export async function measure(label, fn) {
  const t0 = Date.now();
  const out = await fn();
  const ms = Date.now() - t0;
  measures.push({ label, ms });
  console.log(`⏱ ${label} : ${ms} ms`);
  return out;
}

/**
 * Accessibilité (WCAG 2.2 AA, règles axe-core des balises wcag2a/aa,
 * wcag21a/aa, wcag22aa) sur le document courant, cadres exclus : l'outil
 * Parcelle est le document du prototype, conservé tel quel. Aucune
 * violation critique ni sérieuse n'est tolérée ; les autres sont listées.
 */
export async function axeCheck(target, label) {
  await target.addScriptTag({ path: AXE_SCRIPT });
  const violations = await target.evaluate(async () => {
    const r = await window.axe.run(document, { iframes: false, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ") }));
  });
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  const describe = (v) => `${v.impact} ${v.id} ×${v.nodes} (${v.sample})`;
  check(`accessibilité · ${label} : aucune violation critique ou sérieuse`, blocking.length === 0, violations.map(describe).join(" ; "));
}
