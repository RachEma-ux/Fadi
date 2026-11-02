/**
 * Corpus de migration du dépôt (P-12, ADR-STUDIO-PILOTE-01 ; REC-A-01) : tous les documents `studio-document/1` du
 * dépôt — fixtures JSON sous `src/studio/` (caractérisation, corpus), corpus S1–S7 générés (taille 100), exemple P.118
 * converti — et le même corpus enrichi de données inconnues (champ futur d'en-tête, champ futur d'un objet, élément d'un
 * type inconnu). Outil d'essai (les fichiers sont lus par l'appelant) : hors de la façade `studio-cmd`, importé par les tests seulement.
 */
import { applyStudioCommands } from "../composition/commandes.js";
import { newStudioDocument, validateStudioDocument } from "../composition/document.js";
import type { StudioDocument } from "../composition/types.js";
import { genererCorpus, SCENES_DOCUMENTS } from "../corpus/index.js";
import { convertirExempleP118, lotsDeCommandes } from "../exemples/index.js";
import { STUDIO_SCHEMA_DOCUMENT_V1, studioMigrerDocumentV1V2, studioMigrerDocumentV2V1, studioRestaurerSourceV1 } from "./migration-document.js";

export type Doc = Record<string, unknown>;
/** Sources du corpus lues par l'appelant (aucun accès fichier ici) : fichiers JSON de `src/studio/` et exemple P.118. */
export interface SourcesCorpusMigration {
  /** Fichiers JSON sous `packages/atelier-model/src/studio/` : chemin relatif (`src/studio/…`) et contenu. */
  fichiersJson: readonly { chemin: string; contenu: string }[];
  /** `apps/api/src/data/examples/p118-native-model.json`, lu tel quel. */
  exempleP118: { domains: Record<string, unknown> };
}
export function documentsJson(fichiers: SourcesCorpusMigration["fichiersJson"]): { origine: string; document: Doc }[] {
  const out: { origine: string; document: Doc }[] = [];
  const visiter = (valeur: unknown, origine: string) => {
    if (Array.isArray(valeur)) { valeur.forEach((v, i) => visiter(v, `${origine}[${i}]`)); return; }
    if (!valeur || typeof valeur !== "object") return;
    const o = valeur as Doc;
    if (o["schemaVersion"] === STUDIO_SCHEMA_DOCUMENT_V1 && "objects" in o) { out.push({ origine, document: o }); return; }
    for (const [k, v] of Object.entries(o)) visiter(v, `${origine}.${k}`);
  };
  for (const f of [...fichiers].sort((x, y) => x.chemin.localeCompare(y.chemin))) visiter(JSON.parse(f.contenu), f.chemin);
  return out;
}
export function corpusMigration(sources: SourcesCorpusMigration): { origine: string; document: Doc }[] {
  const docs = documentsJson(sources.fichiersJson);
  for (const s of SCENES_DOCUMENTS) genererCorpus(s, 100).documents.forEach((d, i) => docs.push({ origine: `corpus ${s} (100) feuillet ${i}`, document: d as unknown as Doc }));
  const jeu = sources.exempleP118;
  for (const n of convertirExempleP118({ levels: jeu.domains["levels"], floorDesign: jeu.domains["floorDesign"] }).niveaux) {
    let d: StudioDocument = newStudioDocument(`p118-${n.niveauId}`);
    for (const lot of lotsDeCommandes(n.commandes)) d = applyStudioCommands(d, lot);
    docs.push({ origine: `exemple P.118 niveau ${n.niveauId}`, document: d as unknown as Doc });
  }
  return docs;
}
/** Données inconnues ajoutées à une copie : champ futur d'en-tête, champ futur d'un objet, élément d'un type inconnu. */
export function avecInconnues(d: Doc): Doc {
  const c = structuredClone(d);
  c["extensionFuture"] = { origine: "client /3", valeur: 42 };
  const objets = c["objects"] as Doc[];
  if (objets.length) objets[0]!["couleurFuture"] = "#ff8800";
  objets.push({ id: "inconnu-1", type: "spline-future", poles: [[0, 0], [1, 1]] });
  return c;
}

const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Doc;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

export interface RapportCorpusMigration {
  documents: number;
  parFamille: Record<string, number>;
  migres: number;
  refusesExplicitement: number;
  allerRetourExacts: number;
  documentsAvecInconnues: number;
  donneesConservees: number;
  donneesRapportees: number;
  recuperationsExactes: number;
}

const famille = (origine: string) => origine.startsWith("src/studio/") ? "fixtures" : origine.startsWith("corpus ") ? `corpus ${origine.split(" ")[1]}` : origine.startsWith("exemple P.118") ? "exemple P.118" : "autre";

/** Migre tout le corpus et rend le rapport (nombre de documents, données inconnues conservées / rapportées). */
export function rapportCorpusMigration(sources: SourcesCorpusMigration): RapportCorpusMigration {
  const corpus = corpusMigration(sources);
  const r: RapportCorpusMigration = { documents: corpus.length, parFamille: {}, migres: 0, refusesExplicitement: 0, allerRetourExacts: 0, documentsAvecInconnues: 0, donneesConservees: 0, donneesRapportees: 0, recuperationsExactes: 0 };
  for (const { origine, document } of corpus) {
    r.parFamille[famille(origine)] = (r.parFamille[famille(origine)] ?? 0) + 1;
    const m = studioMigrerDocumentV1V2(document);
    if (!m.ok) { if (stable(m.source) === stable(document)) r.refusesExplicitement++; continue; }
    r.migres++;
    const restauree = studioRestaurerSourceV1(m.document);
    if (m.document.conserves ? stable(restauree) === stable(document) : stable(restauree) === stable(validateStudioDocument(document))) r.allerRetourExacts++;
    const enrichi = avecInconnues(studioMigrerDocumentV2V1(m.document).document as unknown as Doc);
    const mi = studioMigrerDocumentV1V2(enrichi);
    if (!mi.ok) continue;
    r.documentsAvecInconnues++;
    r.donneesConservees += mi.document.conserves?.length ?? 0;
    r.donneesRapportees += studioMigrerDocumentV2V1(mi.document).rapport.pertes.length;
    if (stable(studioRestaurerSourceV1(mi.document)) === stable(enrichi)) r.recuperationsExactes++;
  }
  return r;
}
