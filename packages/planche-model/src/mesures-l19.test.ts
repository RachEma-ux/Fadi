/**
 * Lot L19 (cahier V1 EX-PERF-01) : mesures de la famille d'extrusion, noyau seul (Node, sans rendu ni réseau). Lancé à
 * la demande (`MESURES=1 npx vitest run src/mesures-l19.test.ts`), jamais dans la suite ordinaire : les durées dépendent
 * de la machine. Le rapport est consigné dans `docs/planche/mesures/l19-extrusion.md`. Au moins 30 interactions par
 * scénario après 3 échauffements, percentiles p50 / p95.
 */
import { describe, it } from "vitest";
import { type Id, ajouterSegment, contexte, modeleVide, pousserTirer, revolution } from "./geometrie-libre.js";
import { differencePlanche, empreintePlanche } from "./delta.js";
import { machinePousserTirer } from "./outils/pousser-tirer.js";
import { v3 } from "./vecteur.js";

const ACTIF = process.env.MESURES === "1";

function mesurer(nom: string, n: number, f: () => void): { nom: string; n: number; p50: number; p95: number; max: number } {
  for (let i = 0; i < 3; i++) f();
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = performance.now();
    f();
    t.push(performance.now() - d);
  }
  t.sort((a, b) => a - b);
  const q = (p: number) => t[Math.min(t.length - 1, Math.ceil(p * t.length) - 1)] as number;
  const r = { nom, n, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +(t[t.length - 1] as number).toFixed(2) };
  console.log(`MESURE ${JSON.stringify(r)}`);
  return r;
}

/** Polygone régulier fermé de `k` côtés (rayon 1 m) au sol : une face de `k` sommets. */
function polygone(k: number) {
  let m = modeleVide();
  const p = (i: number) => v3(Math.cos((2 * Math.PI * i) / k), Math.sin((2 * Math.PI * i) / k), 0);
  for (let i = 0; i < k; i++) m = ajouterSegment(m, p(i), p(i + 1)).modele;
  return { m, face: Object.keys(contexte(m).faces)[0] as Id };
}

/** Profil polygonal de `k` sommets dans le plan XZ, décalé de l'axe Z (révolution). */
function profilRevolution(k: number) {
  let m = modeleVide();
  const p = (i: number) => v3(2 + 0.5 * Math.cos((2 * Math.PI * i) / k), 0, 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / k));
  for (let i = 0; i < k; i++) m = ajouterSegment(m, p(i), p(i + 1)).modele;
  return { m, face: Object.keys(contexte(m).faces)[0] as Id };
}

describe.skipIf(!ACTIF)("L19 — mesures de la famille d'extrusion (EX-PERF-01)", () => {
  it("option, aperçu d'une extrusion simple, révolutions, application avec delta et empreinte", () => {
    // 1. Réponse à un changement d'option (Pousser/Tirer, noyau seul : configurer + vue).
    const { m: m100, face: f100 } = polygone(100);
    let e = machinePousserTirer.initial();
    const ctx = { modele: m100, selection: [], separateurDecimal: "," as const };
    mesurer("option Pousser/Tirer (configurer + vue)", 60, () => {
      e = machinePousserTirer.configurer!(e, "face", "tube", ctx).etat;
      e = machinePousserTirer.configurer!(e, "face", "normal", ctx).etat;
      machinePousserTirer.vue(e, ctx);
    });
    // 2. Aperçu d'une extrusion simple, face de 100 sommets (même pipeline que la validation : modèle candidat).
    mesurer("extrusion face 100 sommets (candidat)", 30, () => {
      pousserTirer(m100, f100, 1);
    });
    // 3. Révolutions (balayage) : 4 sommets × 48 segments (≈ 400 triangles) et ≈ 10 000 triangles (26 sommets × 192).
    const r4 = profilRevolution(4);
    mesurer("révolution 4 sommets × 48 segments", 30, () => {
      revolution(r4.m, r4.face, { origine: v3(0, 0, 0), direction: v3(0, 0, 1) }, { segments: 48 });
    });
    const r26 = profilRevolution(26);
    mesurer("révolution 26 sommets × 192 segments (≈ 10 000 triangles)", 5, () => {
      revolution(r26.m, r26.face, { origine: v3(0, 0, 0), direction: v3(0, 0, 1) }, { segments: 192 });
    });
    // 4. Application : opération + delta + empreinte (ce que la Planche fait avant d'envoyer `planche.operation`).
    mesurer("application extrusion 100 sommets (opération + delta + empreinte)", 30, () => {
      const apres = pousserTirer(m100, f100, 1).modele;
      differencePlanche(m100, apres);
      empreintePlanche(apres);
    });
  }, 1_800_000);
});
