/**
 * Module Documents — ce qui se produit à partir du modèle et du dossier,
 * en fonctions pures : le tableau des surfaces par niveau et par zone
 * (métrés dérivés du modèle courant), les fiches d'espaces de l'exemple
 * résolu (`csv` de p118-resolved-app), et la règle d'actualité d'un
 * document produit : à jour si la révision du modèle et l'empreinte de ses
 * entrées sont celles du moment de la production, périmé sinon
 * (docs/architecture.md, « Document produit »).
 */
import type { DesignAnalysis } from "./design-review.js";
import type { DocumentFreshness } from "./entities.js";

export const DOCUMENTS_VERSION = "1.0.0";

/** Cellule CSV : guillemets doublés, formules neutralisées (comme `csv` du prototype). */
export function csvCell(x: unknown): string {
  let v = String(x ?? "");
  if (/^[=+@-]/.test(v)) v = "'" + v;
  return `"${v.replace(/"/g, '""')}"`;
}

/** Fichier CSV lisible par un tableur francophone : BOM, séparateur « ; », fins de ligne CRLF. */
export function csvFile(rows: readonly (readonly unknown[])[]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

const num = (v: number | null | undefined, digits = 3): string => (Number.isFinite(v as number) ? (v as number).toFixed(digits) : "");

/**
 * Tableau des surfaces : une ligne par zone du modèle courant (surface du
 * polygone, usage lu, capacité au nom, cible du programme, écart, lecture),
 * puis une ligne de total par niveau (dalle brute, dalle nette, zones).
 */
export function surfacesCsv(r: DesignAnalysis): string {
  const rows: unknown[][] = [["Niveau", "Zone", "Identifiant", "Surface_zone_m2", "Usage", "Capacité_indiquée", "Cible_programme_m2", "Écart_m2", "Statut", "Lecture"]];
  for (const f of r.floors) {
    const rooms = r.rooms.filter((x) => x.level === f.id);
    for (const x of rooms) rows.push([f.name, x.name, x.objectId, num(x.area), x.usage, x.capacity ?? "", num(x.target), num(x.delta), x.status, x.reading]);
    rows.push([
      f.name,
      "TOTAL NIVEAU",
      f.id,
      num(rooms.reduce((n, x) => n + x.area, 0)),
      `${rooms.length} zone(s)`,
      "",
      `dalle brute ${num(f.gross)} m²`,
      `dalle nette ${num(f.slabNet)} m²`,
      "",
      f.voidArea ? `vides ${num(f.voidArea)} m²` : "",
    ]);
  }
  rows.push([
    "TOTAL",
    "",
    "",
    num(r.facts.roomArea),
    `${r.facts.roomCount} zone(s)`,
    "",
    `dalles brutes ${num(r.facts.gross)} m²`,
    `dalles nettes ${num(r.facts.net)} m²`,
    "",
    `emprise ${num(r.facts.footprint)} m²`,
  ]);
  return csvFile(rows);
}

/** `csv` de p118-resolved-app : les fiches d'espaces de l'exemple résolu (ID ; niveau ; espace ; surface ; capacité cible ; source ; statut). */
export function resolvedSpacesCsv(spaces: readonly Record<string, unknown>[]): string {
  return csvFile([
    ["ID", "Niveau", "Espace", "Surface m2", "Capacité cible", "Source capacité", "Statut"],
    ...spaces.map((s) => [s["id"], s["level"], s["name"], s["unitArea"], s["capacityNumeric"], s["sourceCapacity"] ?? "Non mentionnée", "Capacité hypothétique ; surface calculée"]),
  ]);
}

/** Nom du fichier des fiches de l'exemple : `P118_Programme_Resolu_V8_19.csv` pour P.118 (prototype), dérivé du cas sinon. */
export function resolvedSpacesFileName(caseId: string | null | undefined): string {
  if (!caseId || caseId === "parcours_lot118") return "P118_Programme_Resolu_V8_19.csv";
  return `${caseId.replace(/[^A-Za-z0-9]+/g, "_")}_Programme_Resolu_V8_19.csv`;
}

export interface DocumentProduction {
  producedAt: string;
  modelRevision: number;
  inputHash: string;
  count: number;
}

/** À jour si la dernière production porte la révision du modèle et l'empreinte courantes ; périmé sinon ; `null` sans production. */
export function documentFreshness(current: { modelRevision: number; inputHash: string }, produced: DocumentProduction | null): DocumentFreshness | null {
  if (!produced) return null;
  return produced.modelRevision === current.modelRevision && produced.inputHash === current.inputHash ? "a-jour" : "perime";
}
