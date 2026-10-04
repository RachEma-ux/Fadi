/**
 * Archive de projet — « Sauvegarder projet JSON » / « Importer projet JSON »
 * (outils du projet et page Projets du prototype : `backup()` et
 * `importBundle()` de harmony-app-v6, repris par h7-app).
 *
 * Le format Fadi (`fadi-project-archive`) réunit tout ce qui appartient au
 * projet : fiche, 21 étapes (réponses, arbitrages Harmonie), répartition
 * programmatique, cas de programme (révisions), fichiers de parcelle, modèle
 * typé de l'Atelier (version 2 ; un modèle du prototype à importer en version
 * 1 ou depuis un export du prototype) et pièces jointes des étapes (base64,
 * 20 Mo cumulés comme le prototype, les autres signalées en réserve).
 *
 * L'import accepte aussi les exports du logiciel existant — `parcours-v6-
 * project` (V6 / V7 : `workflow` + `native` + `stageAttachments`), une base
 * projets V5 (`projects[]`) ou un projet V5 isolé — et les ramène au format
 * Fadi (`normalizeImportedProject`) : c'est la voie de migration des dossiers
 * du prototype. Rien n'est inventé : ce qui n'existe pas dans la source reste
 * vide, et les messages de refus sont ceux du prototype.
 */
import { harmonieVisibleRef } from "./harmonie.js";
import type { HarmonieHistoryEntry, HarmonieProposalDecision, HarmonieProposalStatus, HarmonieStepState, ParcoursFieldValue, ParcoursStepContent, ParcoursStepDefinition, ParcoursStepStatus } from "./parcours.js";
import { EMPTY_PARCOURS_STEP_CONTENT } from "./parcours.js";
import { PROGRAMME_MODES, type ProgrammeMode } from "./programme.js";

export const PROJECT_ARCHIVE_KIND = "fadi-project-archive";
export const PROJECT_ARCHIVE_VERSION = 2;
/** Versions relues : 1 (magasin du moteur V14, modèle importé à sens unique) et 2 (modèle typé). */
export const PROJECT_ARCHIVE_VERSIONS_LUES = [1, 2] as const;
/** Limite du prototype sur les pièces jointes exportées (20 Mo cumulés) et sur le fichier importé (32 Mo). */
export const ARCHIVE_ATTACHMENTS_LIMIT = 20 * 1024 * 1024;
export const ARCHIVE_IMPORT_LIMIT = 32 * 1024 * 1024;

export interface ArchiveStep {
  stepNumber: number;
  status: ParcoursStepStatus;
  content: ParcoursStepContent;
}

export interface ArchiveAttachment {
  stepNumber: number;
  name: string;
  type: string;
  size: number;
  addedAt: string | null;
  /** `data:<type>;base64,…` */
  dataUrl: string;
}

export interface ArchiveRepartition {
  type: string;
  baseArea: number;
  mode: ProgrammeMode | "cas";
  custom: Record<string, number>;
  components: string[];
}

export interface ArchiveProgrammeCase {
  revision: number;
  caseId: string;
  scenarioId: string;
  data: Record<string, unknown>;
}

export interface ArchiveParcelFile {
  id: string;
  number: number;
  name: string;
  crs: string;
  parcelNumber: string;
  data: Record<string, unknown>;
  revision: number;
}

/**
 * Manifeste du paquet natif (lot 6, cahier §5.10) : ce qu'il faut savoir pour relire le paquet sans deviner —
 * versions des schémas et contrats, unités, repères (avec la conversion explicite cadastral ↔ local), identités et
 * empreinte du modèle, versions des catalogues de règles. Écrit à chaque sauvegarde ; contrôlé à l'import.
 */
export const MANIFESTE_PAQUET_FORMAT = "fadi-paquet-natif";
export const MANIFESTE_PAQUET_VERSION = 1;

export interface ManifestePaquet {
  format: typeof MANIFESTE_PAQUET_FORMAT;
  version: number;
  schemas: { archive: number; modeleAtelier: number | null; contratCommandes: string; ifc: string };
  unites: { longueur: "m"; aire: "m2"; volume: "m3"; angle: "deg"; altitudes: string };
  reperes: {
    local: string;
    cadastral: { crs: string; origineLocale: { x: number; y: number }; conversion: string } | null;
    geographique: string;
  };
  identites: { projet: string; revision: number; empreinteModele: string | null; niveaux: number; objets: number; definitions: number; identifiants: string };
  catalogues: Record<string, string>;
}

export interface ProjectArchive {
  kind: typeof PROJECT_ARCHIVE_KIND;
  version: typeof PROJECT_ARCHIVE_VERSION;
  applicationVersion: string;
  /** Version du prototype de référence dont les données et règles sont extraites. */
  sourceVersion: string;
  exported: string;
  stageMapping: { stableId: number; display: string; title: string }[];
  project: {
    code: string;
    name: string;
    modelRevision: number;
    sourceExampleId: string | null;
    /** Exemple résolu : `reference` (présentation protégée du prototype) ou `editable` (copie de travail, `copy()` de p118-resolved-app) ; `null` pour un projet ordinaire. */
    exampleMode: "reference" | "editable" | null;
    sourceAttachment: Record<string, unknown> | null;
    siteObservations: Record<string, unknown> | null;
    /** Contexte extérieur déclaré (`siteContextV62` du prototype : observation, statut, date, `satelliteObserved`). */
    siteContext: Record<string, unknown> | null;
    programmeState: Record<string, unknown> | null;
    parcelTransmission: Record<string, unknown> | null;
    parcelsInitialized: boolean;
    /** Dossier Harmony (`p.data.harmony` du prototype), tel quel. */
    harmony: Record<string, unknown> | null;
  };
  steps: ArchiveStep[];
  programmeRepartition: ArchiveRepartition | null;
  programmeCases: ArchiveProgrammeCase[];
  parcels: ArchiveParcelFile[];
  /** Modèle typé de l'Atelier (`atelier-model`, version 1), opaque ici : revalidé par le serveur à l'import ; `null` sans modèle. */
  modele: { nativeId: string; etat: Record<string, unknown> } | null;
  /** Modèle du prototype (domaines du moteur V14) à importer à sens unique, venu d'un export du prototype ou d'une archive version 1 ; `null` sinon. */
  natif: { nativeId: string; registry: Record<string, unknown> | null; domains: Record<string, unknown> } | null;
  /** Manifeste du paquet natif (archives écrites depuis le lot 6) ; `null` pour une archive plus ancienne ou un export du prototype. */
  manifeste: ManifestePaquet | null;
  stageAttachments: ArchiveAttachment[];
  warnings: string[];
}

export class ArchiveError extends Error {
  override readonly name = "ArchiveError";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `safeName` du prototype : nom de fichier sans accents ni caractères spéciaux. */
export function archiveSafeName(name: string | null | undefined): string {
  return String(name || "Projet")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
}

/** `Parcours_V7_<nom>.json` */
export function archiveFileName(name: string): string {
  return `Parcours_V7_${archiveSafeName(name)}.json`;
}

/** `stageMapping` du prototype : identifiant stable, numéro affiché et titre des 21 étapes. */
export function archiveStageMapping(definitions: readonly ParcoursStepDefinition[]): ProjectArchive["stageMapping"] {
  return definitions.map((d) => ({ stableId: d.number, display: pad2(d.number), title: d.title }));
}

/** `cleanInput` : refuse les clés qui altéreraient les prototypes JavaScript. */
export function cleanArchiveInput<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cleanArchiveInput) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") throw new ArchiveError("Clé de fichier non autorisée");
      out[k] = cleanArchiveInput(v);
    }
    return out as T;
  }
  return value;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const STATUSES: readonly HarmonieProposalStatus[] = ["proposed", "retained", "adapted", "translated", "drawn", "verified", "dismissed"];
const STEP_STATUSES: readonly ParcoursStepStatus[] = ["a-faire", "en-cours", "termine"];
const DATA_URL = /^data:[^,]*;base64,/;
const DOMAIN_NAME = /^[\w-]+$/;

export type ArchiveOrigin = "fadi" | "parcours-v7" | "parcours-v6" | "parcours-v5";

export interface NormalizedImport {
  origin: ArchiveOrigin;
  archive: ProjectArchive;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v === null || v === undefined ? fallback : String(v);
}

function fieldValue(v: unknown): ParcoursFieldValue | undefined {
  if (v === null) return null;
  if (typeof v === "string" || typeof v === "number") return Number.isFinite(v as number) || typeof v === "string" ? v : undefined;
  return undefined;
}

function fieldsOf(raw: unknown): Record<string, ParcoursFieldValue> {
  const out: Record<string, ParcoursFieldValue> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const value = fieldValue(v);
    if (value !== undefined && value !== null && value !== "") out[k] = value;
  }
  return out;
}

function historyOf(raw: unknown): HarmonieHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((h) => ({
    at: str(h["at"]),
    status: STATUSES.includes(h["status"] as HarmonieProposalStatus) ? (h["status"] as HarmonieProposalStatus) : "proposed",
    text: typeof h["text"] === "string" ? h["text"] : null,
    proof: typeof h["proof"] === "string" ? h["proof"] : null,
    owner: typeof h["owner"] === "string" ? h["owner"] : null,
    reason: typeof h["reason"] === "string" ? h["reason"] : null,
  }));
}

/**
 * Les arbitrages d'une étape du prototype (`stages[n].proposals[]`, objets
 * proposition complets) → décisions Fadi par identifiant. Seules les
 * propositions arbitrées (statut ≠ proposée ou version > 0) sont conservées ;
 * leur texte, titre, source et cibles deviennent l'instantané du choix. Les
 * empreintes du prototype ne sont pas reprises : l'API les recalcule sur les
 * données importées.
 */
export function harmonieStateFromPrototype(stepNumber: number, raw: unknown): HarmonieStepState {
  const state: HarmonieStepState = { revision: 0, generatedAt: null, generatedHash: null, proposals: {} };
  if (!isRecord(raw)) return state;
  state.revision = Number.isInteger(raw["revision"]) ? (raw["revision"] as number) : 0;
  state.generatedAt = typeof raw["generatedAt"] === "string" ? raw["generatedAt"] : null;
  const proposals = Array.isArray(raw["proposals"]) ? raw["proposals"].filter(isRecord) : [];
  for (const q of proposals) {
    const id = str(q["id"]);
    if (!id) continue;
    const status = STATUSES.includes(q["status"] as HarmonieProposalStatus) ? (q["status"] as HarmonieProposalStatus) : "proposed";
    const decisionVersion = Number.isInteger(q["decisionVersion"]) ? (q["decisionVersion"] as number) : 0;
    if (status === "proposed" && decisionVersion === 0) continue;
    const group = q["group"] === "local" ? "local" : "parti";
    const key = str(q["key"]) || id.split("-").slice(1).join("-");
    const ref = group === "local" ? `${harmonieVisibleRef(stepNumber, "LOCAL")}-${id.split("LOCAL-").pop() ?? ""}` : harmonieVisibleRef(stepNumber, key);
    const adaptedText = typeof q["adaptedText"] === "string" ? q["adaptedText"] : null;
    const decision: HarmonieProposalDecision = {
      status,
      notes: str(q["notes"]),
      owner: str(q["owner"]),
      proof: str(q["proof"]),
      link: str(q["link"]),
      adaptedText,
      decisionVersion,
      updatedAt: typeof q["updated"] === "string" ? q["updated"] : null,
      history: historyOf(q["history"]),
      acceptedHash: null,
      snapshot: {
        ref,
        key,
        group,
        title: str(q["title"]),
        text: str(q["text"]),
        source: str(q["source"]),
        targets: Array.isArray(q["targets"]) ? q["targets"].filter((t): t is number => Number.isInteger(t)) : [],
        ...(typeof q["roomId"] === "string" ? { roomId: q["roomId"] } : {}),
        ...(typeof q["objectId"] === "string" ? { objectId: q["objectId"] } : {}),
      },
    };
    state.proposals[id] = decision;
  }
  return state;
}

function repartitionOf(raw: unknown, components: string[]): ArchiveRepartition | null {
  if (!isRecord(raw) || typeof raw["type"] !== "string" || !raw["type"]) return null;
  const baseArea = Number(raw["baseArea"]);
  const mode = raw["mode"] === "cas" ? "cas" : (PROGRAMME_MODES as readonly string[]).includes(String(raw["mode"])) ? (raw["mode"] as ProgrammeMode) : "cible";
  const custom: Record<string, number> = {};
  if (isRecord(raw["custom"])) for (const [k, v] of Object.entries(raw["custom"])) if (Number.isFinite(Number(v))) custom[k] = Number(v);
  return { type: raw["type"], baseArea: Number.isFinite(baseArea) && baseArea > 0 ? baseArea : 673, mode, custom, components };
}

function attachmentsOf(raw: unknown, mapStep: (f: Record<string, unknown>) => number | null): ArchiveAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ArchiveAttachment[] = [];
  for (const f of raw) {
    if (!isRecord(f)) continue;
    const stepNumber = mapStep(f);
    const dataUrl = str(f["dataUrl"]);
    if (stepNumber === null || !DATA_URL.test(dataUrl)) continue;
    out.push({
      stepNumber,
      name: str(f["name"], "fichier"),
      type: str(f["type"], "application/octet-stream"),
      size: Number.isFinite(Number(f["size"])) ? Number(f["size"]) : 0,
      addedAt: typeof f["added"] === "string" ? f["added"] : typeof f["addedAt"] === "string" ? f["addedAt"] : null,
      dataUrl,
    });
  }
  return out;
}

/** `demoP118V81.mode` du prototype : la référence protégée de l'exemple résolu, ou sa copie modifiable. */
/** Le contexte extérieur déclaré d'un export (Fadi ou prototype `siteContextV62`) : seule une observation consignée est reprise, jamais une collecte. */
export function siteContextOf(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const observation = typeof raw["observation"] === "string" ? raw["observation"].trim() : "";
  const e = raw["elevation"];
  const elevation =
    isRecord(e) && typeof e["value"] === "number" && Number.isFinite(e["value"]) && Array.isArray(e["coordinates"]) && e["coordinates"].length >= 2 && e["coordinates"].slice(0, 2).every((v) => typeof v === "number")
      ? { value: e["value"], unit: "m", coordinates: [e["coordinates"][0], e["coordinates"][1]], at: typeof e["at"] === "string" ? e["at"] : "", source: typeof e["source"] === "string" ? e["source"] : "MapTiler Elevation API", quality: typeof e["quality"] === "string" ? e["quality"] : "service numérique, non relevé topographique" }
      : null;
  if (!observation && !elevation) return null;
  return {
    observation,
    observationStatus: observation ? (typeof raw["observationStatus"] === "string" ? raw["observationStatus"] : "Déclaration utilisateur, non contrôle indépendant") : "",
    observedAt: observation ? (typeof raw["observedAt"] === "string" ? raw["observedAt"] : "") : "",
    satelliteObserved: !!observation && raw["satelliteObserved"] === true,
    elevation,
  };
}

function exampleModeOf(demo: unknown): "reference" | "editable" | null {
  if (!isRecord(demo)) return null;
  return demo["mode"] === "reference" ? "reference" : "editable";
}

function validStep(n: unknown, count: number): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= count;
}

/** Un projet du prototype (`workflow` V7, ou projet V5/V6) → archive Fadi. */
function fromPrototypeProject(p: unknown, native: unknown, files: unknown, definitions: readonly ParcoursStepDefinition[], now: string, applicationVersion: string, sourceVersion: string): ProjectArchive {
  if (!isRecord(p) || typeof p["name"] !== "string" || !isRecord(p["data"])) throw new ArchiveError("Structure de projet invalide.");
  const data = p["data"];
  const name = `${p["name"]} · import`;
  const business = isRecord(data["business"]) ? data["business"] : {};
  const h7 = isRecord(data["harmonieEtapesV7"]) ? data["harmonieEtapesV7"] : {};
  const stages = isRecord(h7["stages"]) ? h7["stages"] : {};
  const done = isRecord(p["done"]) ? p["done"] : {};
  const steps: ArchiveStep[] = definitions.map((def) => {
    const n = def.number;
    const fields = fieldsOf(business[String(n)]);
    const harmonie = harmonieStateFromPrototype(n, stages[String(n)]);
    const touched = Object.keys(fields).length > 0 || Object.keys(harmonie.proposals).length > 0;
    const status: ParcoursStepStatus = done[String(n)] === true ? "termine" : touched ? "en-cours" : "a-faire";
    return { stepNumber: n, status, content: { ...EMPTY_PARCOURS_STEP_CONTENT, status, fields, harmonie } };
  });
  const components = isRecord(data["harmony"]) && isRecord((data["harmony"] as Record<string, unknown>)["config"]) ? (((data["harmony"] as Record<string, unknown>)["config"] as Record<string, unknown>)["components"] as unknown) : null;
  const componentList = Array.isArray(components) ? components.filter((c): c is string => typeof c === "string") : [];
  const programmeCase = isRecord(data["programmeCase"]) ? data["programmeCase"] : null;
  const programmeCases: ArchiveProgrammeCase[] = programmeCase
    ? [{ revision: Number.isInteger(programmeCase["revision"]) ? (programmeCase["revision"] as number) : 1, caseId: str(programmeCase["caseId"]), scenarioId: str(programmeCase["scenarioId"]), data: programmeCase }]
    : [];
  const site = isRecord(h7["site"]) ? h7["site"] : null;
  let natif: ProjectArchive["natif"] = null;
  if (isRecord(native) && isRecord(native["domains"])) {
    const id = str(native["id"]) || "native-import";
    if (!DOMAIN_NAME.test(id)) throw new ArchiveError("Domaine natif invalide.");
    for (const domain of Object.keys(native["domains"])) if (!DOMAIN_NAME.test(domain)) throw new ArchiveError("Domaine natif invalide.");
    natif = { nativeId: id, registry: { ...(isRecord(native["registry"]) ? native["registry"] : {}), id, name }, domains: { ...native["domains"] } };
  }
  return {
    kind: PROJECT_ARCHIVE_KIND,
    version: PROJECT_ARCHIVE_VERSION,
    applicationVersion,
    sourceVersion,
    exported: now,
    stageMapping: archiveStageMapping(definitions),
    project: {
      code: archiveSafeName(p["name"]).slice(0, 24) || "IMPORT",
      name,
      modelRevision: natif ? 1 : 0,
      sourceExampleId: null,
      exampleMode: exampleModeOf(data["demoP118V81"]),
      sourceAttachment: null,
      siteObservations: site,
      siteContext: siteContextOf(data["siteContextV62"]),
      programmeState: null,
      parcelTransmission: null,
      parcelsInitialized: false,
      harmony: isRecord(data["harmony"]) ? data["harmony"] : null,
    },
    steps,
    programmeRepartition: repartitionOf(data["programmeRepartition"], componentList),
    programmeCases,
    parcels: [],
    modele: null,
    natif,
    manifeste: null,
    stageAttachments: attachmentsOf(files, (f) => (validStep(Number(f["stage"]), definitions.length) ? Number(f["stage"]) : null)),
    warnings: [],
  };
}

/**
 * Manifeste relu : absent (archive antérieure au lot 6) → `null` ; présent, il doit être reconnu — format, version
 * relue, contrat de commandes de la même famille — sinon l'archive est refusée plutôt que lue de travers.
 */
export function manifesteOf(raw: unknown): ManifestePaquet | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw) || raw["format"] !== MANIFESTE_PAQUET_FORMAT) throw new ArchiveError("Manifeste du paquet natif illisible.");
  const version = raw["version"];
  if (!Number.isInteger(version) || (version as number) < 1) throw new ArchiveError("Manifeste du paquet natif : version invalide.");
  if ((version as number) > MANIFESTE_PAQUET_VERSION) throw new ArchiveError(`Paquet écrit par une version plus récente (manifeste ${String(version)}) : mettre l'application à jour avant de l'importer.`);
  const schemas = isRecord(raw["schemas"]) ? raw["schemas"] : {};
  const contrat = str(schemas["contratCommandes"]);
  if (contrat && !contrat.startsWith("atelier-commands/")) throw new ArchiveError(`Manifeste du paquet natif : contrat de commandes inconnu (${contrat}).`);
  return raw as unknown as ManifestePaquet;
}

/** Une archive Fadi relue : structure vérifiée, nom suffixé « · import », étapes bornées aux 21. */
function fromFadiArchive(raw: Record<string, unknown>, definitions: readonly ParcoursStepDefinition[]): ProjectArchive {
  if (!(PROJECT_ARCHIVE_VERSIONS_LUES as readonly unknown[]).includes(raw["version"])) throw new ArchiveError(`Version d'archive non prise en charge : ${String(raw["version"])}.`);
  const project = raw["project"];
  if (!isRecord(project) || typeof project["name"] !== "string" || !project["name"]) throw new ArchiveError("Structure de projet invalide.");
  const rawSteps = Array.isArray(raw["steps"]) ? raw["steps"].filter(isRecord) : [];
  const byNumber = new Map(rawSteps.map((s) => [Number(s["stepNumber"]), s]));
  const steps: ArchiveStep[] = definitions.map((def) => {
    const s = byNumber.get(def.number);
    const content = s && isRecord(s["content"]) ? s["content"] : {};
    const harmonieRaw = isRecord(content["harmonie"]) ? content["harmonie"] : {};
    const proposals: Record<string, HarmonieProposalDecision> = {};
    if (isRecord(harmonieRaw["proposals"])) {
      for (const [id, d] of Object.entries(harmonieRaw["proposals"])) {
        if (!isRecord(d)) continue;
        const status = STATUSES.includes(d["status"] as HarmonieProposalStatus) ? (d["status"] as HarmonieProposalStatus) : "proposed";
        proposals[id] = {
          status,
          notes: str(d["notes"]),
          owner: str(d["owner"]),
          proof: str(d["proof"]),
          link: str(d["link"]),
          adaptedText: typeof d["adaptedText"] === "string" ? d["adaptedText"] : null,
          decisionVersion: Number.isInteger(d["decisionVersion"]) ? (d["decisionVersion"] as number) : 0,
          updatedAt: typeof d["updatedAt"] === "string" ? d["updatedAt"] : null,
          history: historyOf(d["history"]),
          acceptedHash: null,
          snapshot: isRecord(d["snapshot"]) ? (d["snapshot"] as unknown as NonNullable<HarmonieProposalDecision["snapshot"]>) : null,
        };
      }
    }
    const status = STEP_STATUSES.includes(s?.["status"] as ParcoursStepStatus) ? (s!["status"] as ParcoursStepStatus) : "a-faire";
    const r = isRecord(content["result"]) ? content["result"] : null;
    const result: ParcoursStepContent["result"] = r ? { donnee: typeof r["donnee"] === "string" ? r["donnee"] : null, hypothese: typeof r["hypothese"] === "string" ? r["hypothese"] : null, raw: typeof r["raw"] === "string" ? r["raw"] : null } : null;
    return {
      stepNumber: def.number,
      status,
      content: {
        ...EMPTY_PARCOURS_STEP_CONTENT,
        status,
        choice: typeof content["choice"] === "string" ? content["choice"] : null,
        headline: typeof content["headline"] === "string" ? content["headline"] : null,
        decision: typeof content["decision"] === "string" ? content["decision"] : null,
        why: typeof content["why"] === "string" ? content["why"] : null,
        alternatives: typeof content["alternatives"] === "string" ? content["alternatives"] : null,
        owner: typeof content["owner"] === "string" ? content["owner"] : null,
        proof: typeof content["proof"] === "string" ? content["proof"] : null,
        result,
        sourceStatus: typeof content["sourceStatus"] === "string" ? content["sourceStatus"] : null,
        fields: fieldsOf(content["fields"]),
        harmonie: {
          revision: Number.isInteger(harmonieRaw["revision"]) ? (harmonieRaw["revision"] as number) : 0,
          generatedAt: typeof harmonieRaw["generatedAt"] === "string" ? harmonieRaw["generatedAt"] : null,
          generatedHash: null,
          proposals,
        },
      },
    };
  });
  // Version 1 : magasin du moteur V14 ramené au jeu natif (importé à sens unique par le serveur). Version 2 : modèle typé.
  const natif = raw["version"] === 1 ? natifDepuisMagasinV1(raw["native"]) : natifOf(raw["natif"]);
  const modele = raw["version"] === 2 && isRecord(raw["modele"]) && typeof raw["modele"]["nativeId"] === "string" && isRecord(raw["modele"]["etat"]) ? { nativeId: raw["modele"]["nativeId"], etat: raw["modele"]["etat"] } : null;
  const programmeCases = (Array.isArray(raw["programmeCases"]) ? raw["programmeCases"].filter(isRecord) : [])
    .filter((c) => Number.isInteger(c["revision"]) && isRecord(c["data"]))
    .map((c) => ({ revision: c["revision"] as number, caseId: str(c["caseId"]), scenarioId: str(c["scenarioId"]), data: c["data"] as Record<string, unknown> }));
  const parcels = (Array.isArray(raw["parcels"]) ? raw["parcels"].filter(isRecord) : [])
    .filter((f) => typeof f["id"] === "string" && isRecord(f["data"]))
    .map((f, i) => ({ id: f["id"] as string, number: Number.isInteger(f["number"]) ? (f["number"] as number) : i + 1, name: str(f["name"], "Parcelle"), crs: str(f["crs"]), parcelNumber: str(f["parcelNumber"]), data: f["data"] as Record<string, unknown>, revision: Number.isInteger(f["revision"]) ? (f["revision"] as number) : 1 }));
  const components = Array.isArray((raw["programmeRepartition"] as Record<string, unknown> | null)?.["components"]) ? ((raw["programmeRepartition"] as Record<string, unknown>)["components"] as unknown[]).filter((c): c is string => typeof c === "string") : [];
  return {
    kind: PROJECT_ARCHIVE_KIND,
    version: PROJECT_ARCHIVE_VERSION,
    applicationVersion: str(raw["applicationVersion"]),
    sourceVersion: str(raw["sourceVersion"]),
    exported: str(raw["exported"]),
    stageMapping: archiveStageMapping(definitions),
    project: {
      code: /^[A-Za-z0-9._-]{1,64}$/.test(str(project["code"])) ? (project["code"] as string) : archiveSafeName(project["name"] as string).slice(0, 24) || "IMPORT",
      name: `${project["name"]} · import`,
      modelRevision: modele || natif ? 1 : 0,
      sourceExampleId: typeof project["sourceExampleId"] === "string" ? project["sourceExampleId"] : null,
      exampleMode: project["exampleMode"] === "reference" || project["exampleMode"] === "editable" ? project["exampleMode"] : typeof project["sourceExampleId"] === "string" ? "reference" : null,
      sourceAttachment: isRecord(project["sourceAttachment"]) ? project["sourceAttachment"] : null,
      siteObservations: isRecord(project["siteObservations"]) ? project["siteObservations"] : null,
      siteContext: siteContextOf(project["siteContext"]),
      programmeState: isRecord(project["programmeState"]) ? project["programmeState"] : null,
      parcelTransmission: isRecord(project["parcelTransmission"]) ? project["parcelTransmission"] : null,
      parcelsInitialized: project["parcelsInitialized"] === true,
      harmony: isRecord(project["harmony"]) ? project["harmony"] : null,
    },
    steps,
    programmeRepartition: repartitionOf(raw["programmeRepartition"], components),
    programmeCases,
    parcels,
    modele,
    natif,
    manifeste: manifesteOf(raw["manifeste"]),
    stageAttachments: attachmentsOf(raw["stageAttachments"], (f) => (validStep(Number(f["stepNumber"]), definitions.length) ? Number(f["stepNumber"]) : null)),
    warnings: Array.isArray(raw["warnings"]) ? raw["warnings"].filter((w): w is string => typeof w === "string") : [],
  };
}

/**
 * `importBundle(raw)` : reconnaît le fichier (archive Fadi, export Parcours
 * V6 / V7, base projets V5, projet V5 isolé) et le ramène au format Fadi.
 * Une base V5 à plusieurs projets donne plusieurs archives, comme le
 * prototype créait plusieurs dossiers.
 */
export function normalizeImportedProjects(rawInput: unknown, definitions: readonly ParcoursStepDefinition[], options: { now: string; applicationVersion: string; sourceVersion: string }): NormalizedImport[] {
  const raw = cleanArchiveInput(rawInput);
  if (!isRecord(raw)) throw new ArchiveError("Format attendu : export Parcours V6 / V7 ou base projets V5.");
  if (raw["kind"] === PROJECT_ARCHIVE_KIND) return [{ origin: "fadi", archive: fromFadiArchive(raw, definitions) }];
  const convert = (p: unknown, native: unknown, files: unknown): ProjectArchive => fromPrototypeProject(p, native, files, definitions, options.now, options.applicationVersion, options.sourceVersion);
  if (raw["kind"] === "parcours-v6-project") {
    const workflow = raw["workflow"];
    const origin: ArchiveOrigin = Number(raw["version"]) >= 7 ? "parcours-v7" : "parcours-v6";
    const archive = convert(workflow, raw["native"], raw["stageAttachments"] ?? []);
    // Les réserves de l'export (pièces non incluses) restent visibles après import.
    archive.warnings = Array.isArray(raw["warnings"]) ? raw["warnings"].filter((w): w is string => typeof w === "string") : [];
    return [{ origin, archive }];
  }
  if (Array.isArray(raw["projects"])) {
    const list = raw["projects"] as unknown[];
    if (!list.length) throw new ArchiveError("Format attendu : export Parcours V6 / V7 ou base projets V5.");
    return list.map((p) => ({ origin: "parcours-v5" as const, archive: convert(p, nativeOf(p), []) }));
  }
  if (raw["id"] && isRecord(raw["data"])) return [{ origin: "parcours-v5", archive: convert(raw, nativeOf(raw), []) }];
  throw new ArchiveError("Format attendu : export Parcours V6 / V7 ou base projets V5.");
}

/** Jeu natif d'une archive version 2 (`natif`), contrôlé ; `null` sinon. */
function natifOf(v: unknown): ProjectArchive["natif"] {
  if (!isRecord(v) || typeof v["nativeId"] !== "string" || !DOMAIN_NAME.test(v["nativeId"]) || !isRecord(v["domains"])) return null;
  for (const domain of Object.keys(v["domains"])) if (!DOMAIN_NAME.test(domain)) throw new ArchiveError("Domaine natif invalide.");
  return { nativeId: v["nativeId"], registry: isRecord(v["registry"]) ? v["registry"] : null, domains: { ...v["domains"] } };
}

/**
 * Archive version 1 (avant la bascule du lot 4) : le magasin du moteur V14, clés `design.v13.*`, ramené au jeu
 * natif du projet actif. Seule lecture restante de ce format, pour que les archives déjà produites restent
 * importables (cahier §5.6).
 */
const PREFIXE_MAGASIN_V1 = "design.v13.";
function natifDepuisMagasinV1(v: unknown): ProjectArchive["natif"] {
  if (!isRecord(v) || !isRecord(v["entries"])) return null;
  const entries = v["entries"];
  for (const key of Object.keys(entries)) if (!key.startsWith(PREFIXE_MAGASIN_V1) || !/^[\w.-]+$/.test(key)) throw new ArchiveError("Domaine natif invalide.");
  const active = entries[`${PREFIXE_MAGASIN_V1}activeProject`];
  if (typeof active !== "string" || !DOMAIN_NAME.test(active)) return null;
  const registres = entries[`${PREFIXE_MAGASIN_V1}registry`];
  const registry = Array.isArray(registres) ? (registres.find((r) => isRecord(r) && r["id"] === active) as Record<string, unknown> | undefined) ?? null : null;
  const prefixe = `${PREFIXE_MAGASIN_V1}project.${active}.`;
  const domains: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) if (key.startsWith(prefixe)) domains[key.slice(prefixe.length)] = value;
  return { nativeId: active, registry, domains };
}

/** `p.data.architecture.nativeModel` d'un projet V5 : le modèle natif embarqué, s'il existe. */
function nativeOf(p: unknown): unknown {
  if (!isRecord(p) || !isRecord(p["data"])) return null;
  const arch = (p["data"] as Record<string, unknown>)["architecture"];
  return isRecord(arch) && isRecord(arch["nativeModel"]) ? arch["nativeModel"] : null;
}

/** Les octets d'une pièce jointe exportée (`data:…;base64,`), ou `null` si l'encodage est inattendu. */
export function decodeDataUrl(dataUrl: string): { type: string; base64: string } | null {
  const m = /^data:([^;,]*)(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { type: m[1] || "application/octet-stream", base64: m[2] ?? "" };
}
