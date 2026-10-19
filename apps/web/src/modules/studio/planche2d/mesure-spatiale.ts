/**
 * Mesure des recherches spatiales actuelles de la planche 2D (C.1-01, PERF-04) sur les corpus de qualification S1–S7
 * (`@parcours/atelier-model/studio-corpus`) : index spatial C.1 en place (grille uniforme, `index-spatial.ts`) contre le
 * parcours linéaire, pour les deux usages qui l'emploient — la sélection par rectangle (`selection.ts`) et la collecte des
 * candidats d'accrochage (`accrochage/entites.ts`).
 *
 * **Mesure seulement** : ni seuil, ni verdict, ni gain annoncé (les budgets relèvent de DEC-13). Chaque requête est
 * jouée par les deux chemins et leurs résultats sont comparés (EX-098 : même sélection, mêmes candidats) ; une
 * divergence est comptée et rapportée, jamais masquée. Les tailles (100 / 10 000 / 100 000 primitives) sont
 * illustratives (X.1-10). Au-delà de 20 000 primitives, les feuillets du corpus sont réunis en un seul document de
 * mesure, non validé (un document `studio-document/1` en refuse autant) : il ne sert qu'aux recherches.
 * Pur (pas de React, pas de DOM) ; l'horloge est injectée.
 */
import type { StudioDocument, StudioLayer, StudioPoint } from "@parcours/atelier-model";
import { alea, genererCorpus, type SceneDocuments } from "@parcours/atelier-model/studio-corpus";
import { boiteAutour, indexAccrochage, indexLineaire } from "./accrochage/entites";
import { SEUIL_INDEX_SPATIAL } from "./index-spatial";
import { contoursMurs } from "./architecture/architecture-ui";
import { estVisible } from "./calques";
import { elements, murs, segments, selectionParRectangle, selectionParRectangleLineaire } from "./selection";

export interface Statistiques { n: number; min: number; p50: number; p95: number; p99: number; max: number; moyenne: number }

export function statistiques(valeurs: readonly number[]): Statistiques {
  const t = [...valeurs].sort((a, b) => a - b), n = t.length;
  if (!n) return { n: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, moyenne: 0 };
  // Rang le plus proche (nearest-rank) : une valeur effectivement mesurée.
  const q = (p: number) => t[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]!;
  return { n, min: t[0]!, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: t[n - 1]!, moyenne: t.reduce((s, v) => s + v, 0) / n };
}

/** Réunit les feuillets d'un corpus en un document de mesure (non validé au-delà de la borne). */
export function documentDeMesure(documents: readonly StudioDocument[]): StudioDocument {
  if (documents.length === 1) return documents[0]!;
  const calques = new Map<string, StudioLayer>();
  for (const d of documents) for (const l of d.layers ?? []) if (!calques.has(l.id)) calques.set(l.id, l);
  return {
    id: `${documents[0]!.id}-mesure`, schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
    objects: documents.flatMap((d) => d.objects),
    layers: [...calques.values()],
    dimensions: documents.flatMap((d) => d.dimensions ?? []),
    annotations: documents.flatMap((d) => d.annotations ?? []),
    architecture: documents.flatMap((d) => d.architecture ?? []),
  };
}

/** Emprise des tracés de la planche (objets, cotes, annotations, murs). */
function emprise(doc: StudioDocument): { min: StudioPoint; max: StudioPoint } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of [...elements(doc), ...murs(doc)]) {
    for (const [a, b] of segments(e)) for (const p of [a, b]) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  }
  return Number.isFinite(x0) ? { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } } : { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
}

export interface OptionsMesure {
  /** Requêtes par opération (mêmes requêtes pour les deux chemins). */
  requetes: number;
  /** Requêtes d'échauffement, non comptées. */
  echauffement: number;
  /** Graine des requêtes (reproductibles). */
  graine: number;
  /** Horloge en millisecondes (`performance.now`). */
  maintenant: () => number;
}

export interface MesureOperation {
  /** Parcours linéaire (référence). */
  lineaire: Statistiques;
  /** Index spatial C.1 (grille), forcé quelle que soit la taille. */
  indexe: Statistiques;
  /** Construction : première requête indexée (construction comprise) pour la sélection ; index seul pour l'accrochage. */
  constructionIndexMs: number;
  constructionLineaireMs: number;
  /** Requêtes dont les deux chemins ne rendent pas le même résultat (EX-098) : attendu 0, rapporté tel quel. */
  divergences: number;
  /** Éléments rendus en moyenne par requête (densité de la réponse). */
  resultatsMoyens: number;
}

export interface MesureCorpus {
  scene: SceneDocuments;
  taille: number;
  feuillets: number;
  elementsPlanche: number;
  formesAccrochables: number;
  emprise: { min: StudioPoint; max: StudioPoint };
  /** Chemin pris aujourd'hui à cette taille (seuil en vigueur `SEUIL_INDEX_SPATIAL`). */
  cheminActuel: { selection: "lineaire" | "index"; accrochage: "lineaire" | "index"; seuil: number };
  selection: MesureOperation;
  accrochage: MesureOperation;
}

function mesurer<T>(opts: OptionsMesure, requetes: readonly T[], f: (q: T) => unknown): { temps: number[]; resultats: unknown[] } {
  for (let i = 0; i < Math.min(opts.echauffement, requetes.length); i++) f(requetes[i]!);
  const temps: number[] = [], resultats: unknown[] = [];
  for (const q of requetes) {
    const t0 = opts.maintenant();
    const r = f(q);
    temps.push(opts.maintenant() - t0);
    resultats.push(r);
  }
  return { temps, resultats };
}

const memes = (a: readonly unknown[], b: readonly unknown[]): number => a.reduce<number>((n, x, i) => n + (JSON.stringify(x) === JSON.stringify(b[i]) ? 0 : 1), 0);

/** Mesure les deux recherches spatiales sur le corpus `scene` de `taille` primitives. */
export function mesurerCorpus(scene: SceneDocuments, taille: number, opts: OptionsMesure): MesureCorpus {
  const corpus = genererCorpus(scene, taille);
  const doc = documentDeMesure(corpus.documents);
  const zone = emprise(doc), w = zone.max.x - zone.min.x, h = zone.max.y - zone.min.y, etendue = Math.max(w, h, 1e-9);
  const r = alea(opts.graine);
  const point = (): StudioPoint => ({ x: zone.min.x + r.reel() * w, y: zone.min.y + r.reel() * h });
  // Rectangles de 1 % à 5 % de l'étendue ; un sur deux tracé vers la gauche (capture), l'autre vers la droite (fenêtre).
  const rectangles = Array.from({ length: opts.requetes }, (_, i) => {
    const a = point(), c = (0.01 + r.reel() * 0.04) * etendue;
    const b = { x: a.x + c, y: a.y + c * (0.5 + r.reel()) };
    return i % 2 === 0 ? [a, b] as const : [b, a] as const;
  });
  // Zones de survol d'accrochage : tolérance de 0,5 % de l'étendue autour d'un point tiré.
  const survols = Array.from({ length: opts.requetes }, () => boiteAutour(point(), etendue * 0.005));

  // Sélection par rectangle : référence linéaire, puis index forcé (seuil 0 ; première requête = construction).
  const t0 = opts.maintenant();
  selectionParRectangleLineaire(doc, rectangles[0]![0], rectangles[0]![1]);
  const constructionLineaireSel = opts.maintenant() - t0;
  const t1 = opts.maintenant();
  selectionParRectangle(doc, rectangles[0]![0], rectangles[0]![1], 0);
  const constructionIndexSel = opts.maintenant() - t1;
  const selLin = mesurer(opts, rectangles, ([a, b]) => selectionParRectangleLineaire(doc, a, b));
  const selIdx = mesurer(opts, rectangles, ([a, b]) => selectionParRectangle(doc, a, b, 0));

  // Accrochage : mêmes formes que l'éditeur (`outils/gestes.ts`) — objets visibles et contours des murs visibles (revue
  // Codex #204) ; index linéaire et grille construits chacun une fois, puis mêmes zones.
  const formesAccrochage = [...doc.objects.filter((x) => estVisible(doc, x.layerId)), ...contoursMurs(doc, (l) => estVisible(doc, l))];
  const t2 = opts.maintenant();
  const lin = indexLineaire(formesAccrochage);
  const constructionLineaireAcc = opts.maintenant() - t2;
  const t3 = opts.maintenant();
  const idx = indexAccrochage(formesAccrochage, 0);
  const constructionIndexAcc = opts.maintenant() - t3;
  const ids = (z: Parameters<typeof lin.formes>[0], i: typeof lin) => i.formes(z).map((f) => f.forme.id);
  const accLin = mesurer(opts, survols, (z) => ids(z, lin));
  const accIdx = mesurer(opts, survols, (z) => ids(z, idx));

  const n = elements(doc).length + murs(doc).length;
  const moyenne = (rs: unknown[]) => rs.reduce<number>((s, x) => s + (x as unknown[]).length, 0) / Math.max(1, rs.length);
  return {
    scene, taille, feuillets: corpus.documents.length, elementsPlanche: n, formesAccrochables: formesAccrochage.length, emprise: zone,
    cheminActuel: { selection: n >= SEUIL_INDEX_SPATIAL ? "index" : "lineaire", accrochage: formesAccrochage.length >= SEUIL_INDEX_SPATIAL ? "index" : "lineaire", seuil: SEUIL_INDEX_SPATIAL },
    selection: {
      lineaire: statistiques(selLin.temps), indexe: statistiques(selIdx.temps), constructionIndexMs: constructionIndexSel, constructionLineaireMs: constructionLineaireSel,
      divergences: memes(selLin.resultats, selIdx.resultats), resultatsMoyens: moyenne(selLin.resultats),
    },
    accrochage: {
      lineaire: statistiques(accLin.temps), indexe: statistiques(accIdx.temps), constructionIndexMs: constructionIndexAcc, constructionLineaireMs: constructionLineaireAcc,
      divergences: memes(accLin.resultats, accIdx.resultats), resultatsMoyens: moyenne(accLin.resultats),
    },
  };
}

const ms = (v: number) => v.toFixed(3);
const ligneStats = (s: Statistiques) => `${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.max)}`;

/** Rapport lisible (Markdown) : tableaux de mesures, environnement, avertissement ; aucun seuil ni verdict. */
export function rapportMarkdown(mesures: readonly MesureCorpus[], environnement: Record<string, string | number>): string {
  const out = [
    "# Mesure des recherches spatiales (C.1-01, PERF-04)", "",
    "Mesure seulement : aucun seuil, aucun verdict, aucun gain annoncé (DEC-13). Tailles illustratives (X.1-10). Corpus synthétiques S1–S7.",
    "Chaque requête est jouée par le parcours linéaire et par l'index C.1 ; « divergences » compte les résultats différents (EX-098).", "",
    "## Environnement", "", ...Object.entries(environnement).map(([k, v]) => `- ${k} : ${v}`), "",
  ];
  for (const op of ["selection", "accrochage"] as const) {
    out.push(`## ${op === "selection" ? "Sélection par rectangle" : "Candidats d'accrochage"} (ms)`, "",
      "| Scène | Primitives | Éléments | Chemin actuel | Linéaire p50 | p95 | p99 | max | Index p50 | p95 | p99 | max | Construction index | Divergences | Résultats moyens |",
      "|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const m of mesures) {
      const o = m[op];
      out.push(`| ${m.scene} | ${m.taille} | ${op === "selection" ? m.elementsPlanche : m.formesAccrochables} | ${m.cheminActuel[op]} | ${ligneStats(o.lineaire)} | ${ligneStats(o.indexe)} | ${ms(o.constructionIndexMs)} | ${o.divergences} | ${o.resultatsMoyens.toFixed(1)} |`);
    }
    out.push("");
  }
  return out.join("\n");
}
