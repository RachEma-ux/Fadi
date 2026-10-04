/**
 * Archive de projet côté serveur — « Sauvegarder projet JSON » (export de
 * tout ce qui appartient au projet) et « Importer projet JSON » (création
 * d'un nouveau projet à partir d'une archive Fadi ou d'un export du
 * prototype, voir `@parcours/domain-model` `archive.ts`). L'import est une
 * transaction : rien n'est créé si une partie du fichier est refusée.
 */
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import {
  ARCHIVE_ATTACHMENTS_LIMIT,
  BUSINESS_CHECKS_VERSION,
  DESIGN_REVIEW_VERSION,
  DOCUMENTS_VERSION,
  MANIFESTE_PAQUET_FORMAT,
  MANIFESTE_PAQUET_VERSION,
  PROJECT_ARCHIVE_KIND,
  PROJECT_ARCHIVE_VERSION,
  archiveStageMapping,
  buildHarmonieProposals,
  decodeDataUrl,
  proposalSnapshot,
  PROGRAMME_MODES,
  type ArchiveAttachment,
  type ArchiveRepartition,
  type HarmonieProposalDecision,
  type ManifestePaquet,
  type ProgrammeMode,
  type ProjectArchive,
} from "@parcours/domain-model";
import { atelierCommands, parcels, programmeCases, programmeRepartitions, projects, projectSteps, stepFiles } from "../db/schema.js";
import { CONTRAT_COMMANDES, SCHEMA_IFC, TYPE_RESTAURER, empreinteDe, importerModeleNatif, verifierModele, type ModeleAtelier, type RapportImport } from "@parcours/atelier-model";
import { chargerModele, remplacerModele } from "../lib/atelier-modele.js";
import { EMPTY_STEP_CONTENT, HARMONIE_PROFILES, PARCOURS_STEPS } from "../data/parcours.js";
import { newId } from "./ids.js";
import { computationFor, loadStepContext, type StepContextProject } from "./step-context.js";
import { loadStepRows, upsertStep, type Querier, type Tx } from "./step-rows.js";
import type { SiteContextDeclaration } from "@parcours/domain-model";

/** Modèle typé d'archive refusé par la revalidation : la transaction est annulée, rien n'est créé. */
export class ArchiveModeleError extends Error {
  constructor(public readonly erreurs: string[]) {
    super(`Modèle de l'Atelier refusé : ${erreurs.slice(0, 3).join(" ; ")}${erreurs.length > 3 ? ` (+ ${erreurs.length - 3})` : ""}`);
  }
}

/** Version de l'application écrite dans l'archive (traçabilité, pas une compatibilité). */
export const APPLICATION_VERSION = "fadi 0.1.0";
/** Version du prototype de référence (docs/migration/reference.md). */
export const SOURCE_VERSION = "8.19.0";

type ProjectRow = typeof projects.$inferSelect;

/** Le mode enregistré (« min » / « cible » / « max », ou « cas » quand la répartition vient d'un cas de programme). */
function repartitionMode(mode: string): ArchiveRepartition["mode"] {
  return mode === "cas" ? "cas" : (PROGRAMME_MODES as readonly string[]).includes(mode) ? (mode as ProgrammeMode) : "cible";
}

/** Manifeste du paquet natif : versions, unités, repères, identités et empreinte du modèle (lot 6). */
export function manifestePaquet(project: ProjectRow, etat: ModeleAtelier | null): ManifestePaquet {
  const parcelle = etat?.site.parcelle ?? null;
  return {
    format: MANIFESTE_PAQUET_FORMAT,
    version: MANIFESTE_PAQUET_VERSION,
    schemas: { archive: PROJECT_ARCHIVE_VERSION, modeleAtelier: etat ? etat.version : null, contratCommandes: CONTRAT_COMMANDES, ifc: SCHEMA_IFC },
    unites: { longueur: "m", aire: "m2", volume: "m3", angle: "deg", altitudes: "m, relatives à l'altitude 0 du repère local (aucune altitude absolue)" },
    reperes: {
      local: "repère local du projet (x vers l'est du quadrillage, y vers le nord du quadrillage, mètres)",
      cadastral: parcelle ? { crs: parcelle.crs, origineLocale: { x: parcelle.origineLocale.x, y: parcelle.origineLocale.y }, conversion: "cadastral = local + origineLocale (translation, sans rotation ni échelle)" } : null,
      geographique: "non utilisé dans le modèle (les fonds de carte restent hors du paquet)",
    },
    identites: {
      projet: project.code,
      revision: project.modelRevision,
      // Empreinte du modèle tel qu'il est écrit en JSON (valeurs indéfinies omises), recalculable à la relecture.
      empreinteModele: etat ? empreinteDe(JSON.parse(JSON.stringify(etat))) : null,
      niveaux: etat ? Object.keys(etat.niveaux).length : 0,
      objets: etat ? Object.keys(etat.objets).length : 0,
      definitions: etat ? Object.keys(etat.definitions).length : 0,
      identifiants: "identifiants Fadi stables ; GlobalId IFC dérivés de l'identifiant du projet et de l'objet (export), d'origine (objets importés)",
    },
    catalogues: { controlesMetier: BUSINESS_CHECKS_VERSION, documents: DOCUMENTS_VERSION, revueConception: DESIGN_REVIEW_VERSION, application: APPLICATION_VERSION, prototypeSource: SOURCE_VERSION },
  };
}

/** `backup()` : le projet, ses étapes, son programme, ses parcelles, son modèle typé et ses pièces jointes (20 Mo cumulés) en un seul JSON. */
export async function exportProjectArchive(q: Querier, project: ProjectRow, now: string): Promise<ProjectArchive> {
  const rows = await loadStepRows(q, project.id);
  const [rep] = await q.select().from(programmeRepartitions).where(eq(programmeRepartitions.projectId, project.id)).limit(1);
  const cases = await q.select().from(programmeCases).where(eq(programmeCases.projectId, project.id)).orderBy(asc(programmeCases.revision));
  const parcelRows = await q.select().from(parcels).where(eq(parcels.projectId, project.id)).orderBy(asc(parcels.number));
  const charge = await chargerModele(q, project.id);
  const files = await q.select().from(stepFiles).where(eq(stepFiles.projectId, project.id)).orderBy(asc(stepFiles.addedAt));
  const warnings: string[] = [];
  const stageAttachments: ArchiveAttachment[] = [];
  let bytes = 0;
  for (const f of files) {
    if (bytes + f.size > ARCHIVE_ATTACHMENTS_LIMIT) {
      warnings.push(`Pièce non incluse (limite 20 Mo cumulés) : ${f.name}`);
      continue;
    }
    bytes += f.size;
    stageAttachments.push({ stepNumber: f.stepNumber, name: f.name, type: f.type, size: f.size, addedAt: f.addedAt.toISOString(), dataUrl: `data:${f.type};base64,${f.content.toString("base64")}` });
  }
  return {
    kind: PROJECT_ARCHIVE_KIND,
    version: PROJECT_ARCHIVE_VERSION,
    applicationVersion: APPLICATION_VERSION,
    sourceVersion: SOURCE_VERSION,
    exported: now,
    stageMapping: archiveStageMapping(PARCOURS_STEPS),
    project: {
      code: project.code,
      name: project.name,
      modelRevision: project.modelRevision,
      sourceExampleId: project.sourceExampleId ?? null,
      exampleMode: project.exampleMode ?? null,
      sourceAttachment: project.sourceAttachment ?? null,
      siteObservations: project.siteObservations ?? null,
      siteContext: (project.siteContext as Record<string, unknown> | null) ?? null,
      programmeState: project.programmeState ?? null,
      parcelTransmission: project.parcelTransmission ?? null,
      parcelsInitialized: project.parcelsInitialized,
      harmony: project.harmony ?? null,
    },
    steps: PARCOURS_STEPS.map((def) => {
      const r = rows.get(def.number);
      return { stepNumber: def.number, status: r?.status ?? EMPTY_STEP_CONTENT.status, content: r?.content ?? EMPTY_STEP_CONTENT };
    }),
    programmeRepartition: rep ? { type: rep.type, baseArea: rep.baseArea, mode: repartitionMode(rep.mode), custom: { ...rep.custom }, components: [...rep.components] } : null,
    programmeCases: cases.map((c) => ({ revision: c.revision, caseId: c.caseId, scenarioId: c.scenarioId, data: c.data })),
    parcels: parcelRows.map((p) => ({ id: p.id, number: p.number, name: p.name, crs: p.crs, parcelNumber: p.parcelNumber, data: p.data, revision: p.revision })),
    modele: charge ? { nativeId: charge.nativeId, etat: charge.etat as unknown as Record<string, unknown> } : null,
    natif: null,
    manifeste: manifestePaquet(project, (charge?.etat as ModeleAtelier | undefined) ?? null),
    stageAttachments,
    warnings,
  };
}

/**
 * Pose les empreintes de péremption sur les étapes d'un projet qui vient
 * d'être créé (exemple importé, archive importée) : chaque étape générée
 * (révision > 0) et chaque choix retenu sont datés des données importées —
 * rien n'est « à réexaminer » à l'ouverture, seuls les changements
 * ultérieurs le seront. Les instantanés manquants sont complétés.
 */
export async function stampStepFingerprints(tx: Tx, project: StepContextProject): Promise<void> {
  const rows = await loadStepRows(tx, project.id);
  const ctx = await loadStepContext(tx, project, rows);
  for (const def of PARCOURS_STEPS) {
    const row = rows.get(def.number);
    if (!row) continue;
    const fingerprint = ctx.dependencies.get(def.number)?.fingerprint ?? null;
    const decisions: Record<string, HarmonieProposalDecision> = { ...row.content.harmonie.proposals };
    for (const q of buildHarmonieProposals(HARMONIE_PROFILES, def, ctx.profile, row.content.harmonie, computationFor(ctx, def.number), fingerprint)) {
      const d = decisions[q.id];
      if (q.retained && d) decisions[q.id] = { ...d, acceptedHash: fingerprint, snapshot: q.orphaned && d.snapshot ? d.snapshot : proposalSnapshot(q) };
    }
    const harmonie = { ...row.content.harmonie, generatedHash: row.content.harmonie.revision > 0 ? fingerprint : null, proposals: decisions };
    await upsertStep(tx, project.id, def.number, row.status, { ...row.content, harmonie });
  }
}

/**
 * `importBundle` : crée un NOUVEAU projet appartenant à l'utilisateur à
 * partir d'une archive normalisée. Les projets existants ne sont jamais
 * modifiés. Retourne le projet créé et les réserves (pièces jointes
 * illisibles, modèle non projeté).
 */
export async function importProjectArchive(tx: Tx, ownerId: string, archive: ProjectArchive, now: string): Promise<{ project: ProjectRow; warnings: string[] }> {
  const id = newId("proj");
  const warnings = [...archive.warnings];
  const [project] = await tx
    .insert(projects)
    .values({
      id,
      ownerId,
      code: archive.project.code,
      name: archive.project.name,
      modelRevision: archive.modele || archive.natif ? Math.max(1, archive.project.modelRevision) : 0,
      sourceExampleId: archive.project.sourceExampleId,
      exampleMode: archive.project.exampleMode,
      sourceAttachment: archive.project.sourceAttachment,
      siteObservations: archive.project.siteObservations,
      siteContext: archive.project.siteContext as SiteContextDeclaration | null,
      programmeState: archive.project.programmeState,
      parcelTransmission: archive.project.parcelTransmission,
      parcelsInitialized: archive.project.parcelsInitialized,
      harmony: archive.project.harmony,
    })
    .returning();
  if (!project) throw new Error("project insert returned nothing");

  await tx.insert(projectSteps).values(archive.steps.map((s) => ({ projectId: id, stepNumber: s.stepNumber, status: s.status, content: { ...s.content } as Record<string, unknown> })));

  if (archive.programmeRepartition) {
    const r = archive.programmeRepartition;
    await tx.insert(programmeRepartitions).values({ projectId: id, type: r.type, baseArea: r.baseArea, mode: r.mode, custom: r.custom, components: r.components });
  }
  if (archive.programmeCases.length) {
    await tx.insert(programmeCases).values(archive.programmeCases.map((c) => ({ projectId: id, revision: c.revision, caseId: c.caseId, scenarioId: c.scenarioId, data: c.data })));
  }
  if (archive.parcels.length) {
    await tx.insert(parcels).values(archive.parcels.map((p) => ({ projectId: id, id: p.id, number: p.number, name: p.name, crs: p.crs, parcelNumber: p.parcelNumber, data: p.data, revision: p.revision })));
  }
  // Modèle de l'Atelier : le modèle typé de l'archive (revalidé en entier, refusé à la moindre anomalie), ou le
  // modèle du prototype importé à sens unique (exports du prototype, archives version 1).
  let modele: ModeleAtelier | null = null;
  let nativeId = "";
  let rapport: RapportImport | null = null;
  if (archive.modele) {
    const attendue = archive.manifeste?.identites.empreinteModele;
    if (attendue && empreinteDe(archive.modele.etat) !== attendue) warnings.push("Le modèle de l'archive ne correspond pas à l'empreinte de son manifeste (fichier modifié hors de Fadi) : il a été revalidé objet par objet avant import.");
    const v = verifierModele(archive.modele.etat);
    if (!v.ok) throw new ArchiveModeleError(v.erreurs);
    modele = v.modele;
    nativeId = archive.modele.nativeId;
  } else if (archive.natif) {
    const d = archive.natif.domains;
    const r = importerModeleNatif({ nativeId: archive.natif.nativeId, registry: archive.natif.registry as never, domains: { levels: d["levels"], floorDesign: d["floorDesign"], nativeParcel: d["nativeParcel"], buildingFootprint: d["buildingFootprint"], ui: d["ui"] } });
    modele = r.modele;
    rapport = r.rapport;
    nativeId = archive.natif.nativeId;
    if (!Object.keys(modele.niveaux).length) warnings.push("Modèle du prototype importé sans niveau exploitable.");
  }
  if (modele) {
    await remplacerModele(tx, id, modele, nativeId, project.modelRevision);
    const journalId = randomUUID();
    await tx.insert(atelierCommands).values({ id: journalId, projectId: id, requestId: `import-archive-${journalId}`, kind: "commande", contract: CONTRAT_COMMANDES, label: archive.modele ? "Import du modèle (archive)" : "Import du modèle du prototype (archive)", baseRevision: Math.max(0, project.modelRevision - 1), resultRevision: project.modelRevision, commands: [{ type: archive.modele ? "interne.import-archive" : "interne.import-natif", params: { nativeId } }], inverse: { type: TYPE_RESTAURER, params: { diff: { avant: {}, crees: {} } } }, effets: { crees: Object.keys(modele.objets), modifies: [], supprimes: [], problemes: rapport?.problemes ?? [], referencesAReparer: [], niveauxTouches: Object.keys(modele.niveaux) }, reponse: { revision: project.modelRevision, journalId, ...(rapport ? { rapport } : {}) }, inverseOf: null, authorId: ownerId, createdAt: new Date() });
  }
  for (const f of archive.stageAttachments) {
    const decoded = decodeDataUrl(f.dataUrl);
    if (!decoded) {
      warnings.push(`Pièce jointe non restaurée (encodage inattendu) : ${f.name}`);
      continue;
    }
    const content = Buffer.from(decoded.base64, "base64");
    await tx.insert(stepFiles).values({ id: randomUUID(), projectId: id, stepNumber: f.stepNumber, name: f.name, type: f.type || decoded.type, size: content.length, content, addedAt: f.addedAt ? new Date(f.addedAt) : new Date(now) });
  }

  await stampStepFingerprints(tx, { id, name: project.name, siteObservations: project.siteObservations, harmony: project.harmony });
  return { project, warnings };
}
