/**
 * Contrats versionnés des routes de l'API Studio : un contrat par constante (`CONTRAT_…`), posé sur sa route par
 * `avecContrat(CONTRAT_…)` (`lib/studio-contrats.ts` : mécanisme, exposition par l'en-tête `X-Studio-Contrat`, règles
 * d'évolution). Chaque schéma de réponse est **strict au premier niveau** (un champ ajouté ou retiré fait échouer le
 * test de contrat de la route, `routes/studio-contrats.test.ts`) et typé en profondeur là où le client lit ; les
 * documents Studio sont relus par le validateur de `studio-document/1`.
 *
 * Une nouvelle route Studio reçoit ici son contrat, `avecContrat(…)` sur sa déclaration et un cas dans
 * `routes/studio-contrats.test.ts` ; sinon l'inventaire (`testing/studio-contrats.test.ts`) échoue.
 */
import { z } from "zod";
import { validateStudioDocument } from "@parcours/atelier-model";
import { contratRoute } from "./studio-contrats.js";

// --- Briques communes -------------------------------------------------------------------------------------------------

const ident = z.string().min(1);
const instant = z.string().min(1);
const qui = z.looseObject({ id: z.string(), email: z.string().nullable() });
const quiOuNull = qui.nullable();
/** Document `studio-document/1` relu par son validateur (jamais une forme approchée). */
const documentStudio = z.custom<unknown>((d) => { try { validateStudioDocument(d); return true; } catch { return false; } }, "document Studio invalide");
/** Provenance d'une dérivation ; `mode: "copie"` et `identites` (nouvel identifiant → source) pour une copie indépendante (TR-EX-013). */
const provenance = z.strictObject({ variantId: ident, revisionId: ident, mode: z.literal("copie").optional(), identites: z.record(z.string(), z.string()).optional() }).nullable();
const phase = z.string().nullable();

const etudeResume = z.strictObject({ id: ident, name: z.string(), projectId: ident });
const varianteContexte = z.strictObject({ id: ident, name: z.string(), studyId: ident, headRevisionId: ident });
const revisionContexte = z.strictObject({ id: ident, parentRevisionId: z.string().nullable(), document: documentStudio });
const varianteResume = z.strictObject({ id: ident, name: z.string(), headRevisionId: ident, archived: z.boolean(), derivedFrom: provenance });
const etudeLue = z.strictObject({
  study: z.strictObject({ id: ident, name: z.string(), projectId: ident, initialVariantId: ident, createdAt: instant, updatedAt: instant.nullable(), archived: z.boolean(), workflowPhase: phase }),
  variants: z.array(varianteResume), canWrite: z.boolean(), canManage: z.boolean(),
});
const contexteLu = z.strictObject({ study: etudeResume, variant: varianteContexte, revision: revisionContexte, canWrite: z.boolean(), archived: z.boolean(), derivedFrom: provenance });
const creation = z.strictObject({ study: etudeResume, variant: varianteContexte, revision: revisionContexte, canWrite: z.boolean(), derivedFrom: provenance.optional(), replayed: z.boolean() });
const cycleVariante = z.strictObject({ variant: varianteResume, studyArchived: z.boolean() });
// Lot CMD : effets d'une commande (EX-010), événement du journal (IF-011), contexte d'étude (IF-001), job (EX-088).
const effets = z.looseObject({ schema: z.literal("studio-effets/1"), crees: z.array(z.string()), modifies: z.array(z.string()), supprimes: z.array(z.string()), domainesInvalides: z.array(z.string()), revisionSortie: z.string() });
const evenementRevision = z.looseObject({ eventId: ident, transactionId: ident, xactId: z.string().nullable(), studyId: ident, variantId: ident, baseRevisionId: z.string().nullable(), revisionId: ident, authorId: ident, effects: effets, jobId: z.string().nullable(), createdAt: instant });
const soumission = z.strictObject({ ...creation.shape, effects: effets.optional(), eventId: z.string().optional() });
const contexteEtude = z.looseObject({ version: z.literal("studio-contexte-etude/1"), site: z.looseObject({ parcelles: z.array(z.unknown()) }), sources: z.array(z.unknown()), validePar: z.string(), valideLe: instant });
const jobStudio = z.strictObject({ id: ident, kind: z.enum(["essai-commandes", "simulation-migration"]), status: z.string(), projectId: ident, studyId: ident, variantId: z.string().nullable(), sourceRevisionId: z.string().nullable(), result: z.unknown(), createdBy: ident, createdAt: instant, finishedAt: instant.nullable() });
const migrationEtude = z.strictObject({ id: ident, studyId: ident, jobId: ident, cible: z.literal("studio-document/2"), statut: z.enum(["simulee", "accordee", "appliquee", "retour-arriere"]), verdict: z.string(), pointRetour: z.array(z.strictObject({ variantId: ident, headRevisionId: ident })), accord: z.strictObject({ par: ident, le: instant }).nullable(), appliqueeLe: instant.nullable(), retourArriereLe: instant.nullable(), documentsMigres: z.number().int(), rapport: z.looseObject({ schema: z.literal("studio-simulation-migration/1") }).nullable() });
const basculeLue = z.strictObject({ projectId: ident, studyId: ident, autorite: z.enum(["atelier", "studio"]), pointRetour: z.unknown(), historique: z.array(z.looseObject({ action: z.string(), autorite: z.string() })), ecriture: z.array(z.string()), lecture: z.array(z.string()) });

const evenementObservation = z.looseObject({ seq: z.number().int(), action: z.string(), fromStatut: z.string().nullable(), toStatut: z.string(), actorId: z.string(), revisionId: z.string().nullable(), at: instant });
const tacheObservation = z.looseObject({ id: ident, libelle: z.string(), assigneeId: z.string(), statut: z.string(), echeance: z.string().nullable(), journal: z.array(z.looseObject({ seq: z.number().int(), action: z.string() })), possibles: z.array(z.string()) });
const champsObservation = {
  id: ident, authorId: z.string(), responsableId: z.string(), responsableEmail: z.string(), echeance: z.string().nullable(), statut: z.string(),
  correctionRevisionId: z.string().nullable(), recontroleRevisionId: z.string().nullable(), createdBy: z.string(), createdAt: instant, updatedAt: instant,
  journal: z.array(evenementObservation), assignedToMe: z.boolean(), possibles: z.array(z.string()),
  vue: z.looseObject({ mode: z.string(), ref: z.string().nullable() }).nullable(),
  liens: z.array(z.looseObject({ id: ident, domaine: z.string(), ref: z.string(), revisionId: z.string().nullable(), controleId: z.string().nullable() })),
  taches: z.array(tacheObservation),
  decisions: z.array(z.looseObject({ seq: z.number().int(), nature: z.string(), portee: z.string(), texte: z.string(), actorId: z.string() })),
  peut: z.strictObject({ lier: z.boolean(), creerTache: z.boolean(), proposer: z.boolean(), decider: z.boolean() }),
};
/** Observation issue d'un commentaire (vue du fil). */
const observationDuFil = z.strictObject({ ...champsObservation, replayed: z.boolean().optional() });
/** Observation lue par ses propres routes (corps du fil, audience et contexte d'ouverture en plus). */
const observation = z.strictObject({
  ...champsObservation, body: z.string().nullable(), authorEmail: z.string(), audience: z.string(),
  contexte: z.looseObject({ projectId: ident, studyId: ident, variantId: ident, revisionId: z.string().nullable(), objectIds: z.array(z.string()) }),
  replayed: z.boolean().optional(),
});
const commentaire = z.strictObject({
  id: ident, variantId: ident, parentId: z.string().nullable(), revisionId: z.string().nullable(), objectIds: z.array(z.string()), authorId: z.string(),
  authorEmail: z.string(), body: z.string().nullable(), createdAt: instant, deletedAt: instant.nullable(), mine: z.boolean(), audience: z.string(),
  reviewPackageId: z.string().nullable(), observation: observationDuFil.nullable(), replayed: z.boolean().optional(),
});
const participants = z.array(z.strictObject({ id: z.string(), email: z.string(), role: z.string(), assignable: z.boolean() }));
const moi = z.strictObject({ id: z.string(), role: z.string() });

const publication = z.strictObject({
  id: ident, projectId: ident, studyId: ident, variantId: ident, variantName: z.string(), title: z.string(), revisionId: ident, documentHash: z.string(),
  contenu: z.string(), status: z.string(), workStatus: z.string(), diffusionStatus: z.string(),
  manifest: z.looseObject({ schema: z.literal("studio-publication-manifest/1") }).nullable(), manifestHash: z.string().nullable(), manifestBuiltAt: instant.nullable(),
  createdBy: qui, createdAt: instant, updatedAt: instant,
  approval: z.looseObject({ revisionId: z.string(), documentHash: z.string(), manifestHash: z.string().nullable(), by: quiOuNull, at: instant.nullable(), delegationId: z.string().nullable() }).nullable(),
  approvedSelfControl: z.boolean().nullable(),
  diffusion: z.looseObject({ by: quiOuNull, at: instant.nullable(), packageHash: z.string(), manifestHash: z.string().nullable(), files: z.array(z.looseObject({ format: z.string() })) }).nullable(),
  headRevisionId: ident, freshness: z.string(), drift: z.array(z.unknown()), documentsCheck: z.string(), replacedBy: z.string().nullable(),
  replacement: z.looseObject({ publicationId: z.string() }).nullable(), withdrawal: z.looseObject({ by: qui, at: instant, comment: z.string().nullable() }).nullable(),
  allowed: z.array(z.string()), delegation: z.looseObject({ id: ident, delegator: qui, endsAt: instant, reason: z.string() }).nullable(),
  events: z.array(z.looseObject({ id: ident, action: z.string(), toStatus: z.string(), author: qui, createdAt: instant })).optional(),
  replayed: z.boolean().optional(),
});
const delegation = z.strictObject({
  id: ident, projectId: ident, delegator: qui, delegate: qui, scope: z.strictObject({ type: z.string(), id: z.string().nullable() }),
  startsAt: instant, endsAt: instant, reason: z.string(), createdAt: instant, state: z.string(),
  revocation: z.looseObject({ by: qui, at: instant, reason: z.string() }).nullable(), canRevoke: z.boolean(),
  events: z.array(z.looseObject({ id: ident, action: z.string(), actor: qui, createdAt: instant })), replayed: z.boolean().optional(),
});
const jeuExigences = z.strictObject({
  studyId: ident, version: z.number().int(), exigences: z.array(z.looseObject({ id: ident, libelle: z.string(), source: z.string() })),
  auteur: z.string(), auteurEmail: z.string().nullable(), creeLe: instant, motif: z.string().optional(), replayed: z.boolean().optional(),
});
const controle = z.strictObject({
  id: ident, studyId: ident, variantId: ident, revisionId: ident, version: z.number().int().nullable(), execution: z.string(), conclusion: z.string().nullable(),
  documentHash: z.string(), auteur: z.string(), auteurEmail: z.string().nullable(), creeLe: instant,
  resultat: z.looseObject({ execution: z.string(), conclusion: z.string().nullable(), ecarts: z.array(z.unknown()) }),
  rapprochements: z.array(z.unknown()).optional(), replayed: z.boolean().optional(),
});
const feuille = z.strictObject({
  id: ident, studyId: ident, variantId: ident, variantName: z.string(), revisionId: ident, headRevisionId: ident, freshness: z.enum(["a-jour", "perimee"]),
  definition: z.looseObject({ numero: z.string(), titre: z.string(), format: z.string(), orientation: z.string(), echelle: z.string() }),
  provenance: z.looseObject({ documentHash: z.string(), empreinte: z.string(), echelle: z.string(), decoupee: z.boolean() }).nullable(),
  error: z.string().nullable(), createdBy: qui, createdAt: instant, updatedAt: instant, files: z.strictObject({ svg: z.string(), pdf: z.string() }),
  replayed: z.boolean().optional(),
});
const dossier = z.strictObject({
  id: ident, studyId: ident, title: z.string(), sheetIds: z.array(ident), quantities: z.strictObject({ variantId: ident, revisionId: ident }).nullable(),
  includeFidelity: z.boolean(), quantitiesAdjustmentSeq: z.number().int().nullable(), createdBy: qui, createdAt: instant, updatedAt: instant,
  files: z.strictObject({ pdf: z.string(), json: z.string() }), replayed: z.boolean().optional(),
  assembly: z.looseObject({ schema: z.literal("studio-dossier-conception/1") }).optional(),
});
const modeleExterne = z.strictObject({
  id: ident, studyId: ident, variantId: ident, reference: z.string(), auteur: z.string(), discipline: z.string(), format: z.string(), version: z.string(),
  uniteDeclaree: z.string().nullable(), transformation: z.unknown().nullable(), nomFichier: z.string(), contentSha256: z.string(), statut: z.string(),
  rapport: z.unknown(), comparaison: z.unknown(), revisionComparee: z.string().nullable(),
  decision: z.looseObject({ par: z.string(), parEmail: z.string().nullable(), le: instant.nullable(), motif: z.string().nullable() }).nullable(),
  recuPar: z.string(), recuParEmail: z.string().nullable(), recuLe: instant,
  journal: z.array(z.looseObject({ seq: z.number().int(), action: z.string(), par: z.string(), le: instant })).optional(),
  replayed: z.boolean().optional(),
});
const etapes = z.strictObject({ steps: z.array(z.strictObject({ number: z.number().int(), createdAt: instant })), available: z.array(z.strictObject({ number: z.number().int(), title: z.string(), phase: z.string() })), canWrite: z.boolean() });
const preferences = z.strictObject({ profil: z.string(), favoris: z.array(z.string()), personnel: z.array(z.unknown()), groupes: z.array(z.unknown()), retires: z.array(z.string()), manifeste: z.literal("studio-tool-manifest/1"), updatedAt: instant.nullable() });

// --- Études et variantes (routes/studio.ts) ---------------------------------------------------------------------------

export const CONTRAT_ETUDES_LISTER = contratRoute({
  id: "studio-api-etudes-lister/1", routes: ["GET /studies"], objet: "Études du projet, et état de l'étude exemple du P.118.",
  entree: "Requête : `archives=1` facultatif (seul paramètre admis).", statuts: [200], corps: "json",
  reponse: z.strictObject({
    studies: z.array(z.strictObject({ id: ident, name: z.string(), initialVariantId: ident, createdAt: instant, updatedAt: instant.nullable(), workflowPhase: phase, archived: z.boolean() })),
    exemple: z.strictObject({ etat: z.enum(["absente", "partielle", "complete"]), studyId: z.string().nullable() }).nullable(),
  }),
});
export const CONTRAT_ETUDE_CREER = contratRoute({
  id: "studio-api-etude-creer/1", routes: ["POST /studies"], objet: "Nouvelle étude et sa variante initiale (rejeu par `requestId`).",
  entree: "Corps : `{ name, requestId?, contexte? }` (schéma `studySchema` ; contexte `studio-contexte-etude/1`, IF-001).", statuts: [201], corps: "json", reponse: z.strictObject({ ...creation.shape, contexte: contexteEtude.nullable() }),
});
export const CONTRAT_ETUDE_LIRE = contratRoute({
  id: "studio-api-etude-lire/1", routes: ["GET /studies/:studyId"], objet: "Étude et ses variantes.",
  entree: "Requête : `archives=1` facultatif.", statuts: [200], corps: "json", reponse: etudeLue,
});
export const CONTRAT_ETUDE_RENOMMER = contratRoute({
  id: "studio-api-etude-renommer/1", routes: ["PATCH /studies/:studyId"], objet: "Renommage de l'étude ; rend l'étude relue.",
  entree: "Corps : `{ name }` (schéma `studioRenameSchema`).", statuts: [200], corps: "json", reponse: etudeLue,
});
export const CONTRAT_ETUDE_PHASE = contratRoute({
  id: "studio-api-etude-phase/1", routes: ["PATCH /studies/:studyId/workflow"], objet: "Phase déclarée du workflow de conception (REF-01 §06).",
  entree: "Corps : `{ phase: cadrer | … | publier | null }` (schéma `studioWorkflowSchema`).", statuts: [200], corps: "json", reponse: etudeLue,
});
export const CONTRAT_EXEMPLE_INSTALLER = contratRoute({
  id: "studio-api-exemple-installer/1", routes: ["POST /exemple"], objet: "Étude exemple du projet P.118 (propriétaire) ; 201 créée ou reprise, 200 déjà complète.",
  entree: "Aucun corps lu.", statuts: [200, 201], corps: "json",
  reponse: z.strictObject({ created: z.boolean(), etude: etudeLue, rapport: z.looseObject({ version: z.number().int(), empreinte: z.string(), niveaux: z.array(z.looseObject({ niveauId: z.string(), variantId: z.string().nullable() })) }) }),
});
export const CONTRAT_ETUDE_ARCHIVAGE = contratRoute({
  id: "studio-api-etude-archivage/1", routes: ["POST /studies/:studyId/archive", "POST /studies/:studyId/unarchive"], objet: "Archivage ou désarchivage de l'étude, sans suppression (idempotent).",
  entree: "Aucun corps lu.", statuts: [200], corps: "json", reponse: etudeLue,
});
export const CONTRAT_VARIANTES_COMPARER = contratRoute({
  id: "studio-api-variantes-comparer/1", routes: ["GET /studies/:studyId/compare"], objet: "Comparaison de deux révisions de l'étude (lecture seule).",
  entree: "Requête : `from` et `to` = `variantId[:revisionId]`, seuls paramètres.", statuts: [200], corps: "json",
  reponse: z.strictObject({ from: z.strictObject({ variantId: ident, revisionId: ident }), to: z.strictObject({ variantId: ident, revisionId: ident }), difference: z.looseObject({ resume: z.unknown(), identiques: z.boolean() }) }),
});
export const CONTRAT_VARIANTES_LISTER = contratRoute({
  id: "studio-api-variantes-lister/1", routes: ["GET /studies/:studyId/variants"], objet: "Variantes de l'étude.",
  entree: "Requête : `archives=1` facultatif.", statuts: [200], corps: "json", reponse: z.strictObject({ variants: z.array(varianteResume) }),
});
export const CONTRAT_VARIANTE_CREER = contratRoute({
  id: "studio-api-variante-creer/1", routes: ["POST /studies/:studyId/variants"], objet: "Nouvelle variante, vide ou dérivée d'une révision de l'étude.",
  entree: "Corps : `{ name, requestId?, fromVariantId?, fromRevisionId?, mode? }` (schéma `variantSchema` ; `mode` : `version` par défaut, ou `copie` — copie indépendante à nouvelles identités).", statuts: [201], corps: "json", reponse: creation,
});
export const CONTRAT_VARIANTE_RENOMMER = contratRoute({
  id: "studio-api-variante-renommer/1", routes: ["PATCH /studies/:studyId/variants/:variantId"], objet: "Renommage de la variante.",
  entree: "Corps : `{ name }` (schéma `studioRenameSchema`).", statuts: [200], corps: "json", reponse: cycleVariante,
});
export const CONTRAT_VARIANTE_ARCHIVAGE = contratRoute({
  id: "studio-api-variante-archivage/1", routes: ["POST /studies/:studyId/variants/:variantId/archive", "POST /studies/:studyId/variants/:variantId/unarchive"],
  objet: "Archivage ou désarchivage d'une variante (la variante initiale n'est pas archivée).", entree: "Aucun corps lu.", statuts: [200], corps: "json", reponse: cycleVariante,
});
export const CONTRAT_VARIANTE_LIRE = contratRoute({
  id: "studio-api-variante-lire/1", routes: ["GET /studies/:studyId/variants/:variantId"], objet: "Variante et document de sa tête.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: contexteLu,
});
export const CONTRAT_REVISIONS_LISTER = contratRoute({
  id: "studio-api-revisions-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/revisions"], objet: "Révisions de la variante.",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ revisions: z.array(z.strictObject({ id: ident, parentRevisionId: z.string().nullable(), source: z.string(), authorId: z.string(), createdAt: instant })) }),
});
export const CONTRAT_REVISION_LIRE = contratRoute({
  id: "studio-api-revision-lire/1", routes: ["GET /studies/:studyId/variants/:variantId/revisions/:revisionId"], objet: "Document d'une révision (lecture seule).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: contexteLu,
});
export const CONTRAT_REVISION_CHANGEMENTS = contratRoute({
  id: "studio-api-revision-changements/1", routes: ["GET /studies/:studyId/variants/:variantId/revisions/:revisionId/changes"], objet: "Commandes enregistrées et delta d'une révision (A.5-07).",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({
    revisionId: ident, parentRevisionId: z.string().nullable(), source: z.string(), authorId: z.string(), createdAt: instant, requestId: z.string().nullable(),
    commands: z.array(z.looseObject({ toolId: z.string() })), changedKeys: z.array(z.string()), summary: z.unknown(), event: evenementRevision.nullable(),
  }),
});
export const CONTRAT_VARIANTE_EXPORTER = contratRoute({
  id: "studio-api-variante-exporter/1", routes: ["GET /studies/:studyId/variants/:variantId/export"], objet: "Fichier SVG, DXF ou IFC d'une révision (tête par défaut) ; en-tête `X-Studio-Revision`.",
  entree: "Requête : `format` (svg | dxf | ifc), `revision` facultative (schéma `exportSchema`).", statuts: [200], corps: "fichier", reponse: null, typeFichier: "image/svg+xml | application/dxf | application/x-step",
});
export const CONTRAT_EXPORT_RAPPORT = contratRoute({
  id: "studio-api-export-rapport/1", routes: ["GET /studies/:studyId/variants/:variantId/export/rapport"], objet: "Rapport de fidélité de l'export (E.6-03), `studio-rapport-fidelite/1`.",
  entree: "Requête : `format`, `revision` facultative (schéma `exportSchema`).", statuts: [200], corps: "json",
  reponse: z.looseObject({ revisionId: ident, schema: z.literal("studio-rapport-fidelite/1"), format: z.string(), totaux: z.looseObject({ elements: z.number() }), lignes: z.array(z.unknown()) }),
});
export const CONTRAT_COMMANDES = contratRoute({
  id: "studio-api-commandes/1", routes: ["POST /studies/:studyId/variants/:variantId/commands"], objet: "Application d'une enveloppe de commandes `studio-commands/1` ; nouvelle révision (rejeu par `requestId`).",
  entree: "Corps : enveloppe `{ contractVersion: studio-commands/1, requestId, baseRevisionId, commands }` (schéma `envelopeSchema`).", statuts: [200], corps: "json", reponse: soumission,
});

// --- Commentaires, observations d'un fil et étapes (routes/studio.ts) -------------------------------------------------

export const CONTRAT_COMMENTAIRES_LISTER = contratRoute({
  id: "studio-api-commentaires-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/comments"], objet: "Commentaires de la variante (audience filtrée par le serveur).",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ comments: z.array(commentaire), participants, archived: z.boolean(), me: moi }),
});
export const CONTRAT_COMMENTAIRE_CREER = contratRoute({
  id: "studio-api-commentaire-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/comments"], objet: "Nouveau commentaire (rejeu par `requestId`).",
  entree: "Corps : schéma `studioCommentSchema`.", statuts: [201], corps: "json", reponse: commentaire,
});
export const CONTRAT_COMMENTAIRE_AUDIENCE = contratRoute({
  id: "studio-api-commentaire-audience/1", routes: ["PATCH /studies/:studyId/variants/:variantId/comments/:commentId"], objet: "Audience du fil (E1), par son auteur ou le propriétaire.",
  entree: "Corps : `{ audience }` (schéma `audienceSchema`).", statuts: [200], corps: "json", reponse: commentaire,
});
export const CONTRAT_COMMENTAIRE_SUPPRIMER = contratRoute({
  id: "studio-api-commentaire-supprimer/1", routes: ["DELETE /studies/:studyId/variants/:variantId/comments/:commentId"], objet: "Suppression douce par l'auteur.",
  entree: "Aucune.", statuts: [204], corps: "vide", reponse: null,
});
export const CONTRAT_COMMENTAIRE_OBSERVATION = contratRoute({
  id: "studio-api-commentaire-observation/1", routes: ["POST /studies/:studyId/variants/:variantId/comments/:commentId/observation"], objet: "Un commentaire devient une observation (E.2).",
  entree: "Corps : schéma `studioObservationSchema`.", statuts: [201], corps: "json", reponse: observationDuFil,
});
export const CONTRAT_COMMENTAIRE_OBSERVATION_TRANSITION = contratRoute({
  id: "studio-api-commentaire-observation-transition/1", routes: ["POST /studies/:studyId/variants/:variantId/comments/:commentId/observation/transitions"],
  objet: "Passage d'une observation de fil (corriger, recontrôler, clôturer, rouvrir, réattribuer).", entree: "Corps : schéma `studioObservationTransitionSchema`.", statuts: [200], corps: "json", reponse: observationDuFil,
});
export const CONTRAT_ETAPES_LIRE = contratRoute({
  id: "studio-api-etapes-lire/1", routes: ["GET /studies/:studyId/steps"], objet: "Étapes du Parcours rattachées à l'étude, et étapes proposées.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: etapes,
});
export const CONTRAT_ETAPES_REMPLACER = contratRoute({
  id: "studio-api-etapes-remplacer/1", routes: ["PUT /studies/:studyId/steps"], objet: "Remplacement de la liste des étapes rattachées (idempotent).",
  entree: "Corps : `{ steps: number[] }` (schéma `studioStudyStepsSchema`).", statuts: [200], corps: "json", reponse: etapes,
});
export const CONTRAT_ETAPE_ETUDES = contratRoute({
  id: "studio-api-etape-etudes/1", routes: ["GET /steps/:stepNumber/studies"], objet: "Études Studio rattachées à une étape du Parcours.",
  entree: "Adresse : `stepNumber` entier positif.", statuts: [200], corps: "json",
  reponse: z.strictObject({ studies: z.array(z.looseObject({ id: ident, name: z.string() })) }),
});

// --- Préférences (routes/studio-preferences.ts) -----------------------------------------------------------------------

export const CONTRAT_PREFERENCES_LIRE = contratRoute({
  id: "studio-api-preferences-lire/1", routes: ["GET /preferences/outils"], objet: "Préférences d'outils du compte (manifeste `studio-tool-manifest/1`).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: preferences,
});
export const CONTRAT_PREFERENCES_ECRIRE = contratRoute({
  id: "studio-api-preferences-ecrire/1", routes: ["PUT /preferences/outils"], objet: "Enregistrement des préférences d'outils du compte (INV-009).",
  entree: "Corps : `{ profil, favoris, personnel, groupes?, retires? }` (schéma `studioToolPreferencesSchema`).", statuts: [200], corps: "json", reponse: preferences,
});
export const CONTRAT_CATALOGUE_OUTILS = contratRoute({
  id: "studio-api-catalogue-outils/1", routes: ["GET /preferences/catalogue"], objet: "Catalogue des outils autorisés pour le rôle du compte dans le projet.",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({
    manifeste: z.literal("studio-tool-manifest/1"), role: z.string(), droits: z.strictObject({ lecture: z.boolean(), ecriture: z.boolean(), motif: z.string().nullable() }),
    entrees: z.array(z.strictObject({ toolId: z.string(), droit: z.string(), autorise: z.boolean() })),
  }),
});

// --- Publications et délégations (routes/studio-publications.ts) ------------------------------------------------------

export const CONTRAT_PAQUETS_LISTER = contratRoute({
  id: "studio-api-paquets-lister/1", routes: ["GET /publications"], objet: "Paquets diffusés ou retirés du projet (module Documents).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ packages: z.array(publication.extend({ studyName: z.string() })) }),
});
export const CONTRAT_PUBLICATIONS_LISTER = contratRoute({
  id: "studio-api-publications-lister/1", routes: ["GET /studies/:studyId/publications"], objet: "Publications de l'étude, tous statuts.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ publications: z.array(publication) }),
});
export const CONTRAT_PUBLICATION_CREER = contratRoute({
  id: "studio-api-publication-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/publications"], objet: "Nouvelle publication `travail` (rejeu par `requestId`).",
  entree: "Corps : schéma `studioPublicationCreateSchema`.", statuts: [201], corps: "json", reponse: publication,
});
export const CONTRAT_PUBLICATION_LIRE = contratRoute({
  id: "studio-api-publication-lire/1", routes: ["GET /studies/:studyId/publications/:publicationId"], objet: "Publication, manifeste et journal.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: publication,
});
export const CONTRAT_PUBLICATION_CONTROLE_APPROBATION = contratRoute({
  id: "studio-api-publication-controle-approbation/1", routes: ["GET /studies/:studyId/publications/:publicationId/controle-approbation"], objet: "Aperçu de l'auto-contrôle avant d'approuver (OP-6).",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ autoControle: z.boolean(), revisionsAuteur: z.number().int(), soumisParLui: z.boolean(), autorise: z.boolean(), approvers: z.array(z.looseObject({ id: ident })) }),
});
export const CONTRAT_PUBLICATION_VERIFICATION = contratRoute({
  id: "studio-api-publication-verification/1", routes: ["GET /studies/:studyId/publications/:publicationId/verification"], objet: "Recalcul déterministe des empreintes du paquet diffusé.",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({
    publicationId: ident, packageHash: z.string(), packageHashRecomputed: z.string(), documentHash: z.string(), manifestHash: z.string().nullable(),
    manifestDocuments: z.boolean().nullable(), files: z.array(z.strictObject({ format: z.string(), stored: z.string(), recomputed: z.string().nullable(), identical: z.boolean() })), identical: z.boolean(),
  }),
});
export const CONTRAT_PUBLICATION_FICHIER = contratRoute({
  id: "studio-api-publication-fichier/1", routes: ["GET /studies/:studyId/publications/:publicationId/files/:format"], objet: "Fichier figé du paquet ; en-têtes `X-Content-SHA256`, `X-Studio-Package`, statuts.",
  entree: "Adresse : `format` (svg | dxf | ifc | pdf).", statuts: [200], corps: "fichier", reponse: null, typeFichier: "type du fichier figé",
});
export const CONTRAT_DELEGATIONS_LISTER = contratRoute({
  id: "studio-api-delegations-lister/1", routes: ["GET /delegations"], objet: "Délégations d'approbation visibles par le compte (EX-085).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ delegations: z.array(delegation) }),
});
export const CONTRAT_DELEGATION_CREER = contratRoute({
  id: "studio-api-delegation-creer/1", routes: ["POST /delegations"], objet: "Nouvelle délégation d'approbation (201 ; rejeu : 200).",
  entree: "Corps : schéma `studioDelegationCreateSchema`.", statuts: [200, 201], corps: "json", reponse: delegation,
});
export const CONTRAT_DELEGATION_REVOQUER = contratRoute({
  id: "studio-api-delegation-revoquer/1", routes: ["POST /delegations/:delegationId/revoquer"], objet: "Révocation motivée d'une délégation.",
  entree: "Corps : `{ reason }` (schéma `studioDelegationRevokeSchema`).", statuts: [200], corps: "json", reponse: delegation,
});
export const CONTRAT_PUBLICATION_TRANSITION = contratRoute({
  id: "studio-api-publication-transition/1", routes: ["POST /studies/:studyId/publications/:publicationId/:action"], objet: "Transition : soumettre, actualiser, approuver, refuser, diffuser, retirer.",
  entree: "Adresse : `action` ; corps : schéma `studioPublicationTransitionSchema`.", statuts: [200], corps: "json", reponse: publication,
});

// --- Exigences et contrôles (routes/studio-exigences.ts) --------------------------------------------------------------

export const CONTRAT_EXIGENCES_LIRE = contratRoute({
  id: "studio-api-exigences-lire/1", routes: ["GET /studies/:studyId/exigences"], objet: "Jeu d'exigences courant et versions de l'étude.",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ studyId: ident, peutAccepter: z.boolean(), courante: jeuExigences.nullable(), versions: z.array(z.looseObject({ version: z.number().int() })) }),
});
export const CONTRAT_EXIGENCES_VERSION = contratRoute({
  id: "studio-api-exigences-version/1", routes: ["GET /studies/:studyId/exigences/versions/:version"], objet: "Une version du jeu d'exigences.",
  entree: "Adresse : `version` entière.", statuts: [200], corps: "json", reponse: jeuExigences,
});
export const CONTRAT_EXIGENCES_ENREGISTRER = contratRoute({
  id: "studio-api-exigences-enregistrer/1", routes: ["POST /studies/:studyId/exigences"], objet: "Nouvelle version du jeu d'exigences (version de base exigée).",
  entree: "Corps : schéma `studioExigencesEditionSchema`.", statuts: [200, 201], corps: "json", reponse: jeuExigences,
});
export const CONTRAT_EXIGENCES_ACCEPTER = contratRoute({
  id: "studio-api-exigences-accepter/1", routes: ["POST /studies/:studyId/exigences/acceptations"], objet: "Acceptation d'une exigence par le propriétaire.",
  entree: "Corps : schéma `studioExigenceAcceptationSchema`.", statuts: [200, 201], corps: "json", reponse: jeuExigences,
});
export const CONTRAT_CONTROLES_LISTER = contratRoute({
  id: "studio-api-controles-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/controles"], objet: "Contrôles d'exigences de la variante.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ controles: z.array(z.looseObject({ id: ident, execution: z.string() })) }),
});
export const CONTRAT_CONTROLE_LIRE = contratRoute({
  id: "studio-api-controle-lire/1", routes: ["GET /studies/:studyId/variants/:variantId/controles/:checkId"], objet: "Un contrôle et son résultat.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: controle,
});
export const CONTRAT_CONTROLE_EXECUTER = contratRoute({
  id: "studio-api-controle-executer/1", routes: ["POST /studies/:studyId/variants/:variantId/controles"], objet: "Exécution d'un contrôle sur la tête (rejeu par `requestId`).",
  entree: "Corps : schéma `studioControleSchema`.", statuts: [200, 201], corps: "json", reponse: controle,
});

// --- Ajustements du métré (routes/studio-quantites.ts) -----------------------------------------------------------------

export const CONTRAT_AJUSTEMENTS_LISTER = contratRoute({
  id: "studio-api-ajustements-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/ajustements-quantites"], objet: "Journal des ajustements du métré et leur état sur la tête.",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ studyId: ident, variantId: ident, headRevisionId: ident, sequence: z.number().int(), peutAjuster: z.boolean(), ajustements: z.array(z.looseObject({ id: ident, sequence: z.number().int() })), statuts: z.array(z.unknown()) }),
});
export const CONTRAT_AJUSTEMENT_CREER = contratRoute({
  id: "studio-api-ajustement-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/ajustements-quantites"], objet: "Nouvel ajustement manuel motivé (E.3-05).",
  entree: "Corps : schéma `studioAjustementSchema`.", statuts: [200, 201], corps: "json",
  reponse: z.strictObject({
    id: ident, sequence: z.number().int(), revisionId: ident, cible: z.looseObject({ type: z.string(), id: z.string() }), grandeur: z.string(), unite: z.string(),
    valeur: z.number().nullable(), motif: z.string(), derivee: z.number().nullable(), etatCible: z.unknown(), auteur: z.string(), auteurEmail: z.string().nullable(), date: instant, replayed: z.boolean().optional(),
  }),
});

// --- Observations (routes/studio-observations.ts) ----------------------------------------------------------------------

export const CONTRAT_OBSERVATIONS_LISTER = contratRoute({
  id: "studio-api-observations-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/observations"], objet: "Observations de la variante.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ observations: z.array(observation), participants, archived: z.boolean(), me: moi }),
});
export const CONTRAT_OBSERVATION_CREER = contratRoute({
  id: "studio-api-observation-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/observations"], objet: "Observation ouverte directement (E.2-01, E.2-02).",
  entree: "Corps : schéma `studioObservationOuvertureSchema`.", statuts: [201], corps: "json", reponse: observation,
});
export const CONTRAT_RAPPROCHEMENTS_LISTER = contratRoute({
  id: "studio-api-rapprochements-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/observations/rapprochements"], objet: "Rapprochements consignés (EX-086).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ rapprochements: z.array(z.looseObject({ observationId: ident })) }),
});
export const CONTRAT_RAPPROCHEMENT_DEMANDER = contratRoute({
  id: "studio-api-rapprochement-demander/1", routes: ["POST /studies/:studyId/variants/:variantId/observations/rapprochements"], objet: "Rapprochement des observations avec la tête, sur demande (EX-086).",
  entree: "Corps : schéma `studioRapprochementSchema`.", statuts: [200], corps: "json",
  reponse: z.strictObject({ revisionId: ident, checkId: z.string().nullable(), resultats: z.array(z.looseObject({ observationId: ident, statut: z.string(), suivi: z.string() })) }),
});
export const CONTRAT_OBSERVATION_LIRE = contratRoute({
  id: "studio-api-observation-lire/1", routes: ["GET /studies/:studyId/variants/:variantId/observations/:observationId"], objet: "Une observation et son contexte.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: observation,
});
export const CONTRAT_OBSERVATION_TRANSITION = contratRoute({
  id: "studio-api-observation-transition/1", routes: ["POST /studies/:studyId/variants/:variantId/observations/:observationId/transitions"], objet: "Passage de l'observation (vue du fil rendue).",
  entree: "Corps : schéma `studioObservationTransitionSchema`.", statuts: [200], corps: "json", reponse: observationDuFil,
});
export const CONTRAT_OBSERVATION_LIER = contratRoute({
  id: "studio-api-observation-lier/1", routes: ["POST /studies/:studyId/variants/:variantId/observations/:observationId/liens"], objet: "Élément d'un domaine suivi par l'observation (E.2-01).",
  entree: "Corps : schéma `studioObservationLienAjoutSchema`.", statuts: [200, 201], corps: "json", reponse: observation,
});
export const CONTRAT_OBSERVATION_TACHE_CREER = contratRoute({
  id: "studio-api-observation-tache-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/observations/:observationId/taches"], objet: "Tâche attribuée (E.2-03).",
  entree: "Corps : schéma `studioObservationTacheSchema`.", statuts: [200, 201], corps: "json", reponse: observation,
});
export const CONTRAT_OBSERVATION_TACHE_TRANSITION = contratRoute({
  id: "studio-api-observation-tache-transition/1", routes: ["POST /studies/:studyId/variants/:variantId/observations/:observationId/taches/:taskId/transitions"], objet: "Passage d'une tâche.",
  entree: "Corps : schéma `studioObservationTacheTransitionSchema`.", statuts: [200], corps: "json", reponse: observation,
});
export const CONTRAT_OBSERVATION_DECISION = contratRoute({
  id: "studio-api-observation-decision/1", routes: ["POST /studies/:studyId/variants/:variantId/observations/:observationId/decisions"], objet: "Proposition ou décision (E.2-03, E.2-04).",
  entree: "Corps : schéma `studioObservationDecisionSchema`.", statuts: [200, 201], corps: "json", reponse: observation,
});

// --- Feuilles et dossiers (routes/studio-dossiers.ts) ------------------------------------------------------------------

export const CONTRAT_DOSSIERS_PROJET = contratRoute({
  id: "studio-api-dossiers-projet/1", routes: ["GET /dossiers"], objet: "Dossiers de conception du projet (module Documents).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ dossiers: z.array(z.looseObject({ id: ident })) }),
});
export const CONTRAT_FEUILLES_LISTER = contratRoute({
  id: "studio-api-feuilles-lister/1", routes: ["GET /studies/:studyId/sheets"], objet: "Feuilles composées de l'étude.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ sheets: z.array(feuille), canWrite: z.boolean() }),
});
export const CONTRAT_FEUILLE_CREER = contratRoute({
  id: "studio-api-feuille-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/sheets"], objet: "Nouvelle feuille composée, épinglée à la tête.",
  entree: "Corps : schéma `studioSheetCreateSchema`.", statuts: [200, 201], corps: "json", reponse: feuille,
});
export const CONTRAT_FEUILLE_MODIFIER = contratRoute({
  id: "studio-api-feuille-modifier/1", routes: ["PATCH /studies/:studyId/sheets/:sheetId"], objet: "Modification ou réépinglage d'une feuille.",
  entree: "Corps : schéma `studioSheetUpdateSchema`.", statuts: [200], corps: "json", reponse: feuille,
});
export const CONTRAT_FEUILLE_SUPPRIMER = contratRoute({
  id: "studio-api-feuille-supprimer/1", routes: ["DELETE /studies/:studyId/sheets/:sheetId"], objet: "Suppression d'une feuille non citée par un dossier.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ deleted: ident }),
});
export const CONTRAT_FEUILLE_FICHIER = contratRoute({
  id: "studio-api-feuille-fichier/1", routes: ["GET /studies/:studyId/sheets/:sheetId/files/:format"], objet: "Fichier SVG ou PDF de la feuille.",
  entree: "Adresse : `format` (svg | pdf).", statuts: [200], corps: "fichier", reponse: null, typeFichier: "image/svg+xml | application/pdf",
});
export const CONTRAT_DOSSIERS_LISTER = contratRoute({
  id: "studio-api-dossiers-lister/1", routes: ["GET /studies/:studyId/dossiers"], objet: "Dossiers de conception de l'étude.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ dossiers: z.array(dossier) }),
});
export const CONTRAT_DOSSIER_CREER = contratRoute({
  id: "studio-api-dossier-creer/1", routes: ["POST /studies/:studyId/dossiers"], objet: "Nouveau dossier de conception (feuilles ordonnées, métré, fidélité).",
  entree: "Corps : schéma `studioDossierCreateSchema`.", statuts: [200, 201], corps: "json", reponse: dossier,
});
export const CONTRAT_DOSSIER_LIRE = contratRoute({
  id: "studio-api-dossier-lire/1", routes: ["GET /studies/:studyId/dossiers/:dossierId"], objet: "Dossier et son assemblage `studio-dossier-conception/1`.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: dossier,
});
export const CONTRAT_DOSSIER_MODIFIER = contratRoute({
  id: "studio-api-dossier-modifier/1", routes: ["PATCH /studies/:studyId/dossiers/:dossierId"], objet: "Modification d'un dossier.",
  entree: "Corps : schéma `studioDossierUpdateSchema`.", statuts: [200], corps: "json", reponse: dossier,
});
export const CONTRAT_DOSSIER_FICHIER = contratRoute({
  id: "studio-api-dossier-fichier/1", routes: ["GET /studies/:studyId/dossiers/:dossierId/files/:format"], objet: "Fichier PDF ou JSON (`studio-dossier-conception/1`) du dossier.",
  entree: "Adresse : `format` (pdf | json).", statuts: [200], corps: "fichier", reponse: null, typeFichier: "application/pdf | application/json",
});

// --- Modèles externes (routes/studio-modeles-externes.ts) --------------------------------------------------------------

export const CONTRAT_MODELES_EXTERNES_LISTER = contratRoute({
  id: "studio-api-modeles-externes-lister/1", routes: ["GET /studies/:studyId/variants/:variantId/modeles-externes"], objet: "Modèles externes reçus pour la variante (lot F3).",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ peutRecevoir: z.boolean(), peutDecider: z.boolean(), teteRevisionId: ident, modeles: z.array(modeleExterne) }),
});
export const CONTRAT_MODELE_EXTERNE_RECEVOIR = contratRoute({
  id: "studio-api-modele-externe-recevoir/1", routes: ["POST /studies/:studyId/variants/:variantId/modeles-externes"], objet: "Réception d'un modèle externe, relu et comparé par le serveur.",
  entree: "Corps : schéma `studioModeleReceptionSchema` (fichier de 5 Mo de texte au plus).", statuts: [200, 201], corps: "json", reponse: modeleExterne,
});
export const CONTRAT_MODELE_EXTERNE_LIRE = contratRoute({
  id: "studio-api-modele-externe-lire/1", routes: ["GET /studies/:studyId/variants/:variantId/modeles-externes/:modelId"], objet: "Un modèle externe et son journal.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: modeleExterne,
});
export const CONTRAT_MODELE_EXTERNE_CONTENU = contratRoute({
  id: "studio-api-modele-externe-contenu/1", routes: ["GET /studies/:studyId/variants/:variantId/modeles-externes/:modelId/contenu"], objet: "Fichier reçu tel quel, avec son empreinte (droit export).",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ id: ident, statut: z.string(), nomFichier: z.string(), contentSha256: z.string(), transformation: z.unknown().nullable(), contenu: z.string() }),
});
export const CONTRAT_MODELE_EXTERNE_ACTION = contratRoute({
  id: "studio-api-modele-externe-action/1", routes: ["POST /studies/:studyId/variants/:variantId/modeles-externes/:modelId/:action"], objet: "Comparer à la tête, accepter ou refuser (motivé).",
  entree: "Adresse : `action` (comparer | accepter | refuser) ; corps : schéma `studioModelePassageSchema`.", statuts: [200], corps: "json", reponse: modeleExterne,
});

// --- Lot F : illustrations, agents (MCP) et extensions (routes/studio-illustrations.ts, routes/studio-agents.ts) -------

const illustration = z.strictObject({
  id: ident, studyId: ident, variantId: ident, revisionId: ident, fournisseur: z.strictObject({ id: z.string(), nature: z.enum(["local-deterministe", "ia-externe"]) }),
  parametres: z.record(z.string(), z.unknown()),
  provenance: z.looseObject({ nature: z.literal("illustration"), modele: z.looseObject({ inchange: z.literal(true) }), verification: z.looseObject({ statut: z.literal("non-verifiee") }), reproductibilite: z.looseObject({ deterministe: z.boolean() }) }),
  largeur: z.number().int(), hauteur: z.number().int(), empreinteImage: z.string(), creePar: z.string(), creeParEmail: z.string().nullable(), creeLe: instant, image: z.string(),
});
const fournisseurIllustration = z.looseObject({ id: z.enum(["local-derive", "externe"]), nom: z.string(), nature: z.string(), version: z.string(), reseau: z.boolean(), disponible: z.boolean(), manque: z.array(z.string()) });
const propositionAgent = z.looseObject({ id: ident, studyId: ident, variantId: ident, requestId: ident, statut: z.enum(["en-attente", "confirmee", "refusee", "expiree", "echec"]), revisionId: z.string().nullable() });
const evaluationExtension = z.looseObject({ etat: z.enum(["refusee", "decouverte", "verifiee", "autorisee"]), chargement: z.literal("aucun"), motifs: z.array(z.string()) });
const IL = "/studies/:studyId/variants/:variantId/illustrations";
const jetonAgent = z.looseObject({ id: ident, nom: z.string(), creeLe: instant, expireLe: instant, revoqueLe: z.string().nullable() });

export const CONTRAT_ILLUSTRATIONS_FOURNISSEURS = contratRoute({
  id: "studio-api-illustrations-fournisseurs/1", routes: [`GET ${IL}/fournisseurs`], objet: "Fournisseurs d'illustration et leur disponibilité réelle (lot F).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ fournisseurs: z.array(fournisseurIllustration) }),
});
export const CONTRAT_ILLUSTRATIONS_LISTER = contratRoute({
  id: "studio-api-illustrations-lister/1", routes: [`GET ${IL}`], objet: "Illustrations archivées de la variante (lot F).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ illustrations: z.array(illustration) }),
});
export const CONTRAT_ILLUSTRATION_CREER = contratRoute({
  id: "studio-api-illustration-creer/1", routes: [`POST ${IL}`], objet: "Illustration depuis le rendu de la vue : image séparée, modèle inchangé, transfert externe contrôlé.",
  entree: "Corps : schéma `studioIllustrationSchema` (rendu PNG en base64, 8 Mo au plus).", statuts: [201], corps: "json", reponse: illustration.extend({ replayed: z.boolean() }),
});
export const CONTRAT_ILLUSTRATION_IMAGE = contratRoute({
  id: "studio-api-illustration-image/1", routes: [`GET ${IL}/:illustrationId/image`], objet: "Image archivée (PNG portant sa provenance fadi:illustration, statut « non vérifiée »).",
  entree: "Aucune.", statuts: [200], corps: "fichier", reponse: null, typeFichier: "image/png",
});
export const CONTRAT_AGENTS_JETONS_LISTER = contratRoute({
  id: "studio-api-agents-jetons-lister/1", routes: ["GET /agents/jetons"], objet: "Jetons d'agent du compte sur le projet (jamais leur valeur).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ jetons: z.array(jetonAgent) }),
});
export const CONTRAT_AGENTS_JETON_CREER = contratRoute({
  id: "studio-api-agents-jeton-creer/1", routes: ["POST /agents/jetons"], objet: "Création d'un jeton d'agent, montré une seule fois.",
  entree: "Corps : schéma `studioJetonSchema` (nom, joursValidite 1 à 90).", statuts: [201], corps: "json", reponse: z.strictObject({ id: ident, nom: z.string(), jeton: z.string().startsWith("fadi_mcp_"), expireLe: instant }),
});
export const CONTRAT_AGENTS_JETON_REVOQUER = contratRoute({
  id: "studio-api-agents-jeton-revoquer/1", routes: ["POST /agents/jetons/:tokenId/revoquer"], objet: "Révocation d'un jeton d'agent du compte.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ id: ident, revoque: z.literal(true) }),
});
export const CONTRAT_AGENTS_PROPOSITIONS = contratRoute({
  id: "studio-api-agents-propositions/1", routes: ["GET /agents/propositions"], objet: "Propositions des agents du compte, à confirmer ou refuser.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ propositions: z.array(propositionAgent) }),
});
export const CONTRAT_AGENTS_PROPOSITION_CONFIRMER = contratRoute({
  id: "studio-api-agents-proposition-confirmer/1", routes: ["POST /agents/propositions/:proposalId/confirmer"], objet: "Confirmation humaine : le point d'entrée commun écrit la révision (source agent-mcp).",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ proposition: propositionAgent, revisionId: ident, replayed: z.boolean() }),
});
export const CONTRAT_AGENTS_PROPOSITION_REFUSER = contratRoute({
  id: "studio-api-agents-proposition-refuser/1", routes: ["POST /agents/propositions/:proposalId/refuser"], objet: "Refus d'une proposition d'agent : rien n'est écrit.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ proposition: propositionAgent }),
});
export const CONTRAT_AGENTS_JOURNAL = contratRoute({
  id: "studio-api-agents-journal/1", routes: ["GET /agents/journal"], objet: "Journal agent / humain du compte sur le projet (INV-010).",
  entree: "Aucune.", statuts: [200], corps: "json",
  reponse: z.strictObject({ evenements: z.array(z.looseObject({ id: ident, acteur: z.enum(["agent", "humain"]), action: z.string(), le: instant })) }),
});
export const CONTRAT_EXTENSIONS_LISTER = contratRoute({
  id: "studio-api-extensions-lister/1", routes: ["GET /extensions"], objet: "Extensions déclarées (adaptateur MCP intégré) et leur évaluation.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ extensions: z.array(z.strictObject({ declaration: z.looseObject({ id: z.string(), version: z.string() }), evaluation: evaluationExtension })) }),
});
export const CONTRAT_EXTENSION_EVALUER = contratRoute({
  id: "studio-api-extension-evaluer/1", routes: ["POST /extensions/evaluer"], objet: "Évaluation d'une déclaration d'extension, sans rien charger ni écrire.",
  entree: "Corps : `{ declaration }`.", statuts: [200], corps: "json", reponse: z.strictObject({ evaluation: evaluationExtension }),
});

// --- Lot CMD : contexte, essais, jobs, journal, migrations, bascule (routes/studio-cmd.ts) ------------------------------

export const CONTRAT_ETUDE_CONTEXTE = contratRoute({
  id: "studio-api-etude-contexte/1", routes: ["GET /studies/:studyId/contexte"], objet: "Contexte validé d'une étude (IF-001) : site, sources, version ; null sans contexte.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ studyId: ident, contexte: contexteEtude.nullable() }),
});
export const CONTRAT_ESSAI_CREER = contratRoute({
  id: "studio-api-essai-creer/1", routes: ["POST /studies/:studyId/variants/:variantId/essais"], objet: "Essai d'une enveloppe à portée de révision (EX-045) : job serveur, aucune révision écrite.",
  entree: "Corps : enveloppe `studio-commands/1` (schéma `envelopeSchema`).", statuts: [201], corps: "json", reponse: jobStudio,
});
export const CONTRAT_ESSAI_ABANDON = contratRoute({
  id: "studio-api-essai-abandon/1", routes: ["POST /studies/:studyId/variants/:variantId/essais/:jobId/abandon"], objet: "Abandon d'un essai (aucun effet), idempotent.",
  entree: "Aucun corps lu.", statuts: [200], corps: "json", reponse: jobStudio,
});
export const CONTRAT_ESSAI_CONFIRMER = contratRoute({
  id: "studio-api-essai-confirmer/1", routes: ["POST /studies/:studyId/variants/:variantId/essais/:jobId/confirmer"], objet: "Confirmation d'un essai sur sa révision (409 `essai_perime` sinon) ; révision reliée au job.",
  entree: "Aucun corps lu.", statuts: [200], corps: "json", reponse: z.strictObject({ ...soumission.shape, jobId: ident }),
});
export const CONTRAT_JOB_LIRE = contratRoute({
  id: "studio-api-job-lire/1", routes: ["GET /jobs/:jobId"], objet: "Résultat d'un job serveur (EX-088) sous l'autorisation de son étude.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: jobStudio,
});
export const CONTRAT_JOURNAL_REVISIONS = contratRoute({
  id: "studio-api-journal-revisions/1", routes: ["GET /studies/:studyId/variants/:variantId/journal"], objet: "Journal des changements de révision (IF-011), du plus ancien au plus récent.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ variantId: ident, headRevisionId: ident, evenements: z.array(evenementRevision) }),
});
export const CONTRAT_MIGRATION_SIMULER = contratRoute({
  id: "studio-api-migration-simuler/1", routes: ["POST /studies/:studyId/migrations"], objet: "Simulation de migration `studio-document/1` → `/2` (EX-091) : job, rapport, point de retour.",
  entree: "Corps : `{ cible: studio-document/2 }`.", statuts: [201], corps: "json", reponse: migrationEtude,
});
export const CONTRAT_MIGRATIONS_LISTER = contratRoute({
  id: "studio-api-migrations-lister/1", routes: ["GET /studies/:studyId/migrations"], objet: "Migrations de schéma de l'étude, plus récente d'abord.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ migrations: z.array(migrationEtude) }),
});
export const CONTRAT_MIGRATION_LIRE = contratRoute({
  id: "studio-api-migration-lire/1", routes: ["GET /studies/:studyId/migrations/:migrationId"], objet: "Une migration de schéma et son rapport.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: migrationEtude,
});
export const CONTRAT_MIGRATION_PASSAGE = contratRoute({
  id: "studio-api-migration-passage/1",
  routes: ["POST /studies/:studyId/migrations/:migrationId/accorder", "POST /studies/:studyId/migrations/:migrationId/appliquer", "POST /studies/:studyId/migrations/:migrationId/retour-arriere"],
  objet: "Procédure d'accord (propriétaire) : accorder, appliquer les copies /2, retour arrière.", entree: "Aucun corps lu.", statuts: [200], corps: "json", reponse: migrationEtude,
});
export const CONTRAT_MIGRATION_DOCUMENT = contratRoute({
  id: "studio-api-migration-document/1", routes: ["GET /studies/:studyId/migrations/:migrationId/documents/:revisionId"], objet: "Copie `studio-document/2` d'une révision dans une migration appliquée.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ revisionId: ident, document: z.looseObject({ schemaVersion: z.literal("studio-document/2") }) }),
});
export const CONTRAT_BASCULE_LIRE = contratRoute({
  id: "studio-api-bascule-lire/1", routes: ["GET /bascule"], objet: "Bascule Atelier → Studio du projet (MIG-COEX-06), ou null.",
  entree: "Aucune.", statuts: [200], corps: "json", reponse: z.strictObject({ bascule: basculeLue.nullable() }),
});
export const CONTRAT_BASCULE_PASSAGE = contratRoute({
  id: "studio-api-bascule-passage/1", routes: ["POST /bascule/preparer", "POST /bascule/basculer", "POST /bascule/retour-arriere"],
  objet: "Préparer (étude désignée), basculer l'autorité d'écriture vers Studio, retour arrière (propriétaire).", entree: "Corps de `preparer` : `{ studyId }` ; aucun pour les autres.", statuts: [200], corps: "json", reponse: basculeLue,
});
