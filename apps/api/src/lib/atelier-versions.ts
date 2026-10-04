/**
 * Versions, variantes, publications et verrous de l'Atelier (lot 7, Architecture V4 §4.7) — accès aux données.
 *
 * - l'état à une révision passée est reconstitué depuis l'état courant et les inverses du journal (exacts), jamais
 *   deviné ; une révision antérieure à un import n'est pas reconstituable (dit) ;
 * - une version nommée est un instantané immuable (modèle complet + empreinte) ; une publication fige une version,
 *   les versions des catalogues de règles et les documents produits à sa révision, dont le contenu est rangé dans
 *   des volumes immuables adressés par SHA-256 ;
 * - une variante est un projet bifurqué (copie intégrale) relié à son tronc ; sa fusion rejoue son journal propre
 *   sur le tronc, lot par lot, avec les mêmes réducteurs et les mêmes refus que tout lot.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import {
  CONTRAT_COMMANDES,
  SCHEMA_IFC,
  empreinteDe,
  etatARevision,
  type Commande,
  type EffetsJournal,
  type EntreeJournalLue,
  type ModeleAtelier,
} from "@parcours/atelier-model";
import { BUSINESS_CHECKS_VERSION, DESIGN_REVIEW_VERSION, DOCUMENTS_VERSION } from "@parcours/domain-model";
import { atelierCommands, atelierVersions, volumes, type DocumentPublie } from "../db/schema.js";
import { chargerModele } from "./atelier-modele.js";
import { atelierDocumentDescriptors, rendreDocumentAtelier } from "./atelier-documents.js";
import type { OwnedProject } from "./owned-project.js";
import { APPLICATION_VERSION } from "./project-archive.js";
import type { Querier } from "./step-rows.js";

export interface EntreeJournalComplete extends EntreeJournalLue {
  id: string;
  requestId: string;
  kind: string;
  effets: { crees?: string[]; modifies?: string[]; supprimes?: string[] };
  createdAt: Date;
}

export async function journalDepuis(q: Querier, projectId: string, apres: number): Promise<EntreeJournalComplete[]> {
  const rows = await q.select().from(atelierCommands).where(and(eq(atelierCommands.projectId, projectId), gt(atelierCommands.resultRevision, apres))).orderBy(asc(atelierCommands.resultRevision));
  return rows.map((r) => ({
    id: r.id,
    requestId: r.requestId,
    kind: r.kind,
    resultRevision: r.resultRevision,
    label: r.label,
    commands: r.commands as Commande[],
    inverse: r.inverse as unknown as Commande,
    effets: r.effets as EntreeJournalComplete["effets"],
    createdAt: r.createdAt,
  }));
}

export const effetsJournal = (e: EntreeJournalComplete): EffetsJournal => ({ label: e.label, resultRevision: e.resultRevision, crees: e.effets.crees ?? [], modifies: e.effets.modifies ?? [], supprimes: e.effets.supprimes ?? [] });

/** Modèle à la révision demandée (courante si absente) ; lève `ErreurCommande` (precondition) si hors d'atteinte. */
export async function modeleARevision(q: Querier, projectId: string, revisionCourante: number, revision: number | null): Promise<ModeleAtelier | null> {
  const charge = await chargerModele(q, projectId);
  if (!charge) return null;
  if (revision === null || revision === revisionCourante) return charge.etat;
  const entrees = await journalDepuis(q, projectId, revision);
  return etatARevision(charge.etat, revisionCourante, entrees, revision);
}

/** Versions des catalogues de règles et des contrats dont dépend une publication. */
export function cataloguesActuels(etat: ModeleAtelier | null): Record<string, string> {
  return {
    contratCommandes: CONTRAT_COMMANDES,
    schemaIfc: SCHEMA_IFC,
    modeleAtelier: String(etat?.version ?? 1),
    controlesMetier: BUSINESS_CHECKS_VERSION,
    documents: DOCUMENTS_VERSION,
    revueConception: DESIGN_REVIEW_VERSION,
    application: APPLICATION_VERSION,
  };
}

export async function creerVersion(q: Querier, projectId: string, auteurId: string, nom: string, description: string, revision: number, etat: ModeleAtelier) {
  const row = { id: randomUUID(), projectId, nom, description, revision, empreinte: empreinteDe(etat), modele: etat as unknown as Record<string, unknown>, authorId: auteurId, createdAt: new Date() };
  await q.insert(atelierVersions).values(row);
  return row;
}

/** Range un contenu dans les volumes immuables (idempotent) ; renvoie son identifiant SHA-256. */
export async function rangerVolume(q: Querier, contenu: Buffer, mime: string): Promise<string> {
  const id = createHash("sha256").update(contenu).digest("hex");
  await q.insert(volumes).values({ id, mime, size: contenu.byteLength, content: contenu, createdAt: new Date() }).onConflictDoNothing();
  return id;
}

/**
 * Documents d'une publication : tous les documents de l'Atelier productibles à la révision de la version (vues et
 * feuilles en PDF, tableaux CSV, quantités, maquette IFC), produits depuis l'instantané de la version.
 */
export async function produireDocumentsPublies(q: Querier, project: OwnedProject, etat: ModeleAtelier, revision: number, horodatage: string): Promise<DocumentPublie[]> {
  const fige = { ...project, modelRevision: revision };
  const out: DocumentPublie[] = [];
  for (const d of atelierDocumentDescriptors(fige, etat)) {
    if (/-(dxf|svg)$/.test(d.kind)) continue; // les PDF suffisent à la publication des vues et des feuilles
    const rendu = rendreDocumentAtelier(d.kind, fige, etat, horodatage);
    if (!rendu) continue;
    const contenu = Buffer.isBuffer(rendu.body) ? rendu.body : Buffer.from(rendu.body, "utf8");
    const volumeId = await rangerVolume(q, contenu, rendu.type);
    out.push({ kind: d.kind, label: d.label, fileName: d.fileName, volumeId, mime: rendu.type, size: contenu.byteLength, inputHash: d.current.inputHash });
  }
  return out;
}
