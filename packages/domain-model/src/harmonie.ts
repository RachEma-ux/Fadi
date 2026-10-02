/**
 * Harmonie par étape — moteur pur, porté depuis `h7-app` (Parcours V7.1) du
 * prototype : propositions A/B/C par étape, arbitrages (retenir, adapter,
 * écarter, traduire, dessiner, vérifier) et intentions transmises aux étapes
 * aval. Aucune dépendance au DOM ni au stockage : l'API l'exécute côté
 * serveur (autorité), le client l'utilise pour l'affichage.
 *
 * Les textes (états, profils, messages d'erreur) sont ceux du prototype,
 * extraits dans `apps/api/src/data/harmonie-profiles.json` et passés en
 * paramètre — ce module ne les invente pas.
 *
 * Les propositions de site de l'étape 01, calculées sur la géométrie de la
 * parcelle (zonage A/B/C avec schéma), viennent de `site.ts` ; les
 * propositions localisées des étapes 10 et 11, de `model-analysis.ts`. Les
 * deux sont passées ici en `HarmonieProposalComputation`. La péremption
 * (« À réexaminer » : empreintes par étape, `acceptedHash` par choix) est
 * calculée dans `dependencies.ts` et reçue ici sous forme d'empreinte.
 */
import type { SiteZoning } from "@parcours/core-geometry";
import type { SiteZoningGeographic } from "./site.js";
import type {
  HarmonieHistoryEntry,
  HarmonieOption,
  HarmonieProposalDecision,
  HarmonieProposalSnapshot,
  HarmonieProposalStatus,
  HarmonieStepState,
  ParcoursStepDefinition,
} from "./parcours.js";

export interface HarmonieProfileText {
  label: string;
  site: string;
  usage: string;
  decor: string;
}

/** Forme de `apps/api/src/data/harmonie-profiles.json`. */
export interface HarmonieProfilesData {
  states: Record<HarmonieProposalStatus, string>;
  retainedStates: HarmonieProposalStatus[];
  aliases: Record<string, string>;
  defaultProfile: HarmonieProfileText;
  mixedTrainingOffices: { requires: string[]; label: string; site: string; usage: string };
  profiles: Record<string, HarmonieProfileText>;
}

export interface HarmonieProfile extends HarmonieProfileText {
  /** Clé normalisée (`tertiaire`, `mixte`…) ou `unknown`. */
  key: string;
  /** Le type tel qu'il a été saisi, avant normalisation. */
  sourceType: string;
}

/**
 * Profil Harmonie d'un projet à partir de son type de bâtiment (`profile()`
 * du prototype) : alias normalisés, profil par défaut « Type à préciser »,
 * et le cas mixte formation + bureaux reconnu quand ses composantes sont
 * déclarées.
 */
export function harmonieProfile(data: HarmonieProfilesData, type: string | null | undefined, components: readonly string[] = []): HarmonieProfile {
  const raw = (type ?? "").trim();
  const key = data.aliases[raw] ?? raw;
  const base = data.profiles[key];
  let text: HarmonieProfileText = base ?? data.defaultProfile;
  if (key === "mixte" && data.mixedTrainingOffices.requires.every((c) => components.includes(c))) {
    text = { ...text, label: data.mixedTrainingOffices.label, site: data.mixedTrainingOffices.site, usage: data.mixedTrainingOffices.usage };
  }
  return { key: key || "unknown", sourceType: raw, ...text };
}

export const EMPTY_HARMONIE_DECISION: HarmonieProposalDecision = {
  status: "proposed",
  notes: "",
  owner: "",
  proof: "",
  link: "",
  adaptedText: null,
  decisionVersion: 0,
  updatedAt: null,
  history: [],
};

export function isRetainedStatus(data: HarmonieProfilesData, status: HarmonieProposalStatus): boolean {
  return data.retainedStates.includes(status);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Identifiant persistant d'une proposition : `H` + numéro d'étape − 1 (convention du prototype) + clé. */
export function harmonieProposalId(stepNumber: number, key: string): string {
  return `H${pad2(stepNumber - 1)}-${key}`;
}

/** Référence affichée : `H` + numéro d'étape affiché (01–21) + clé. */
export function harmonieVisibleRef(stepNumber: number, key: string): string {
  return `H${pad2(stepNumber)}-${key}`;
}

export interface HarmonieProposal {
  id: string;
  ref: string;
  key: string;
  stage: number;
  scope: string;
  /** « parti » : A/B/C de l'étape ; « local » : proposition localisée sur un local du modèle (étapes 10/11). */
  group: "parti" | "local";
  title: string;
  /** Texte affiché : l'adaptation retenue si elle existe, sinon la proposition d'origine. */
  text: string;
  originalText: string;
  benefit: string;
  tradeoff: string;
  conditions: string;
  why: string;
  source: string;
  targets: number[];
  recommended: boolean;
  decision: HarmonieProposalDecision;
  retained: boolean;
  stateLabel: string;
  /**
   * « À réexaminer · choix conservé » : le choix a été retenu sur des données
   * (`acceptedHash`) qui ne sont plus celles de l'étape (`proposalStale` du
   * prototype), ou la proposition a disparu des données courantes (`orphaned`).
   */
  stale: boolean;
  /** Proposition absente des données courantes mais dont le choix retenu est conservé (local disparu du modèle). */
  orphaned: boolean;
  /** Étape 01 : zonage calculé sur le contour de la parcelle (`null` sans contour exploitable). */
  zoning?: SiteZoning | null;
  /** Étape 01 : le zonage en WGS84 quand la parcelle est géoréférencée (superposition sur le fond MapTiler). */
  zoningGeographic?: SiteZoningGeographic | null;
  /** Propositions localisées : le local du modèle (`niveau|objet`) et l'objet natif. */
  roomId?: string;
  objectId?: string;
}

/** `proposalStale` du prototype : un choix pris sur une empreinte qui n'est plus l'empreinte courante. Sans empreinte courante, rien n'est signalé. */
export function isProposalStale(decision: Pick<HarmonieProposalDecision, "acceptedHash">, fingerprint: string | null): boolean {
  return !!decision.acceptedHash && fingerprint !== null && decision.acceptedHash !== fingerprint;
}

/** `isStageStale` du prototype : l'étape a été générée (`generatedHash`) sur des données qui ne sont plus les courantes. */
export function isStageStale(state: Pick<HarmonieStepState, "generatedHash">, fingerprint: string | null): boolean {
  return !!state.generatedHash && fingerprint !== null && state.generatedHash !== fingerprint;
}

/** Une proposition localisée sur un local du modèle courant (étapes 10/11, `buildProposals` de h7-app). */
export interface LocalHarmonieOption {
  key: string;
  roomId: string;
  objectId: string;
  title: string;
  text: string;
  why: string;
  benefit: string;
  tradeoff: string;
  conditions: string;
  source: string;
  targets: number[];
}

/**
 * Une proposition calculée sur les données du projet (étape 01 : `siteOptions`)
 * plutôt que lue dans la définition de l'étape : elle apporte son propre
 * « pourquoi ici », sa source et, le cas échéant, son zonage.
 */
export interface ComputedHarmonieOption extends HarmonieOption {
  key: string;
  why: string;
  source: string;
  zoning?: SiteZoning | null;
  zoningGeographic?: SiteZoningGeographic | null;
}

export interface HarmonieProposalComputation {
  /** Propositions de parti calculées ; `null` pour garder celles de la définition de l'étape. */
  options: ComputedHarmonieOption[] | null;
  /** Proposition de départ (`recommended()` du prototype) ; « A » par défaut. */
  recommendedKey: string;
  /** Propositions localisées (groupe « local »), ajoutées après les partis. */
  locals?: LocalHarmonieOption[];
}

/** « Pourquoi ici » : la phrase du profil choisie par position de l'étape (règle de `buildProposals`). */
export function harmonieWhy(stepNumber: number, profile: HarmonieProfile): string {
  if (stepNumber <= 4) return profile.site;
  if (stepNumber < 12) return profile.usage;
  if (stepNumber === 21) return profile.decor;
  return "Préserver les intentions retenues tout en explicitant les réserves et responsabilités.";
}

/**
 * Les propositions d'une étape pour un projet : définition de l'étape ×
 * profil du projet × arbitrages déjà pris — ou, quand `computed` est
 * fourni (étape 01 : `siteProposalComputation` ; étapes 10/11 : locaux du
 * modèle), les propositions calculées sur les données du projet. Le point
 * de départ privilégié est « A » sauf recommandation calculée.
 *
 * `fingerprint` est l'empreinte courante des données pertinentes de l'étape
 * (`dependencies.ts`) : elle marque « à réexaminer » les choix pris sur
 * d'autres données. Un choix retenu dont la proposition n'existe plus (local
 * disparu du modèle) est conservé en proposition orpheline, à réexaminer —
 * comme `generate()` du prototype, qui ne perd aucun choix.
 */
export function buildHarmonieProposals(
  data: HarmonieProfilesData,
  def: ParcoursStepDefinition,
  profile: HarmonieProfile,
  state: HarmonieStepState,
  computed: HarmonieProposalComputation | null = null,
  fingerprint: string | null = null,
): HarmonieProposal[] {
  const options: (HarmonieOption & Partial<ComputedHarmonieOption>)[] = computed?.options ?? def.harmonieOptions;
  const recommendedKey = computed?.recommendedKey ?? "A";
  const partis: HarmonieProposal[] = options.map((opt, i) => {
    const key = opt.key ?? "ABC"[i] ?? String.fromCharCode(65 + i);
    const id = harmonieProposalId(def.number, key);
    const decision = { ...EMPTY_HARMONIE_DECISION, ...(state.proposals[id] ?? {}) };
    return {
      id,
      ref: harmonieVisibleRef(def.number, key),
      key,
      stage: def.number,
      scope: def.scope ?? "",
      group: "parti",
      title: opt.title,
      text: decision.adaptedText ?? opt.proposal,
      originalText: opt.proposal,
      benefit: opt.benefit,
      tradeoff: opt.tradeoff,
      conditions: opt.validation,
      why: opt.why ?? harmonieWhy(def.number, profile),
      source: opt.source ?? def.inputs ?? "",
      targets: decision.targets?.slice() ?? def.transmitsTo.slice(),
      recommended: key === recommendedKey,
      decision,
      retained: isRetainedStatus(data, decision.status),
      stateLabel: data.states[decision.status],
      stale: isProposalStale(decision, fingerprint),
      orphaned: false,
      ...(opt.zoning !== undefined ? { zoning: opt.zoning } : {}),
      ...(opt.zoningGeographic !== undefined ? { zoningGeographic: opt.zoningGeographic } : {}),
    };
  });
  const locals: HarmonieProposal[] = (computed?.locals ?? []).map((opt) => {
    const id = `${harmonieProposalId(def.number, "LOCAL")}-${opt.roomId}`;
    const decision = { ...EMPTY_HARMONIE_DECISION, ...(state.proposals[id] ?? {}) };
    return {
      id,
      ref: `${harmonieVisibleRef(def.number, "LOCAL")}-${opt.roomId}`,
      key: opt.key,
      stage: def.number,
      scope: "Local du modèle courant",
      group: "local",
      title: opt.title,
      text: decision.adaptedText ?? opt.text,
      originalText: opt.text,
      benefit: opt.benefit,
      tradeoff: opt.tradeoff,
      conditions: opt.conditions,
      why: opt.why,
      source: opt.source,
      targets: opt.targets.slice(),
      recommended: false,
      decision,
      retained: isRetainedStatus(data, decision.status),
      stateLabel: data.states[decision.status],
      stale: isProposalStale(decision, fingerprint),
      orphaned: false,
      roomId: opt.roomId,
      objectId: opt.objectId,
    };
  });
  const known = new Set([...partis, ...locals].map((q) => q.id));
  const orphans: HarmonieProposal[] = [];
  for (const [id, stored] of Object.entries(state.proposals)) {
    if (known.has(id) || !isRetainedStatus(data, stored.status)) continue;
    const decision = { ...EMPTY_HARMONIE_DECISION, ...stored };
    const snap = decision.snapshot ?? null;
    const lastText = decision.adaptedText ?? snap?.text ?? [...decision.history].reverse().find((h) => h.text)?.text ?? "";
    orphans.push({
      id,
      ref: snap?.ref ?? id,
      key: snap?.key ?? id.split("-").slice(1).join("-"),
      stage: def.number,
      scope: snap?.group === "local" ? "Local du modèle courant" : (def.scope ?? ""),
      group: snap?.group ?? "local",
      title: snap?.title ?? `Proposition ${id}`,
      text: lastText,
      originalText: snap?.text ?? lastText,
      benefit: "",
      tradeoff: "",
      conditions: "",
      why: "Proposition absente des données courantes : son choix est conservé tel qu'il a été pris.",
      source: snap?.source ?? "",
      targets: snap?.targets?.slice() ?? def.transmitsTo.slice(),
      recommended: false,
      decision,
      retained: true,
      stateLabel: data.states[decision.status],
      stale: true,
      orphaned: true,
      ...(snap?.roomId ? { roomId: snap.roomId } : {}),
      ...(snap?.objectId ? { objectId: snap.objectId } : {}),
    });
  }
  return [...partis, ...locals, ...orphans];
}

export function retainedCount(data: HarmonieProfilesData, def: ParcoursStepDefinition, state: HarmonieStepState, computed: HarmonieProposalComputation | null = null): number {
  return buildHarmonieProposals(data, def, harmonieProfile(data, null), state, computed).filter((q) => q.retained).length;
}

/** L'instantané conservé avec un arbitrage : ce que la proposition disait quand le choix a été pris. */
export function proposalSnapshot(q: HarmonieProposal): HarmonieProposalSnapshot {
  return {
    ref: q.ref,
    key: q.key,
    group: q.group,
    title: q.title,
    text: q.text,
    source: q.source,
    targets: q.targets.slice(),
    ...(q.roomId ? { roomId: q.roomId } : {}),
    ...(q.objectId ? { objectId: q.objectId } : {}),
  };
}

export class HarmonieError extends Error {
  override readonly name = "HarmonieError";
}

export interface HarmonieDecisionInput {
  status: HarmonieProposalStatus;
  notes?: string | undefined;
  owner?: string | undefined;
  proof?: string | undefined;
  link?: string | undefined;
}

export interface HarmonieDecisionResult {
  state: HarmonieStepState;
  /** La proposition arbitrée est-elle (désormais) retenue ? Déclenche la remise à faire des étapes cibles côté API. */
  retained: boolean;
  /** Propositions de parti écartées automatiquement (« Variante remplacée par … »). */
  dismissed: string[];
  targets: number[];
}

/**
 * `decide()` du prototype, sans effet de bord hors de l'étape : les règles
 * de validation, le remplacement de variante, l'historique et la version de
 * décision. L'API applique ensuite les effets amont/aval (étapes cibles à
 * refaire, décision GO rétrogradée) à partir du résultat.
 */
export function decideHarmonieProposal(
  data: HarmonieProfilesData,
  def: ParcoursStepDefinition,
  state: HarmonieStepState,
  proposalId: string,
  input: HarmonieDecisionInput,
  options: {
    now: string;
    /** `isStageStale` : une vérification est refusée tant que les propositions ne sont pas actualisées. */
    stale?: boolean | undefined;
    computed?: HarmonieProposalComputation | null | undefined;
    /** Empreinte courante de l'étape, enregistrée comme `acceptedHash` du choix retenu. */
    fingerprint?: string | null | undefined;
  },
): HarmonieDecisionResult {
  if (!(input.status in data.states)) throw new HarmonieError("Statut invalide");
  const fingerprint = options.fingerprint ?? null;
  const proposals = buildHarmonieProposals(data, def, harmonieProfile(data, null), state, options.computed ?? null, fingerprint);
  const q = proposals.find((p) => p.id === proposalId);
  if (!q) throw new HarmonieError("Proposition absente");
  const status = input.status;
  const prev = q.decision;
  const notes = String(input.notes ?? prev.notes ?? "").trim();
  const owner = String(input.owner ?? prev.owner ?? "").trim();
  const proof = String(input.proof ?? prev.proof ?? "").trim();
  // Une proposition localisée référence son local par défaut (`link: room.id` du prototype).
  const link = String(input.link ?? (prev.link || (q.group === "local" ? (q.roomId ?? "") : ""))).trim();
  if ((status === "adapted" || status === "dismissed") && notes.length < 8) {
    throw new HarmonieError("Décrivez votre adaptation ou votre motif (8 caractères minimum).");
  }
  if ((status === "translated" || status === "drawn" || status === "verified") && (!owner || proof.length < 8)) {
    throw new HarmonieError("Responsable et référence / preuve sont requis pour ce statut.");
  }
  if (status === "drawn" && def.number < 10) {
    throw new HarmonieError("L’état dessiné se renseigne dans l’Atelier ou dans l’Esquisse.");
  }
  if (status === "verified" && options.stale) {
    throw new HarmonieError("Actualisez d’abord les propositions sur les données courantes.");
  }

  const nextProposals: Record<string, HarmonieProposalDecision> = { ...state.proposals };
  const dismissed: string[] = [];
  const retainedNow = isRetainedStatus(data, status);
  // Retenir un parti écarte les autres partis retenus ; les propositions localisées sont indépendantes.
  if (retainedNow && q.group === "parti") {
    for (const other of proposals) {
      if (other.id === q.id || other.group !== "parti" || !other.retained) continue;
      const od = other.decision;
      const entry: HarmonieHistoryEntry = { at: options.now, status: od.status, text: other.text, proof: od.proof, owner: od.owner, reason: `Variante remplacée par ${q.id}` };
      nextProposals[other.id] = {
        ...od,
        status: "dismissed",
        notes: `Remplacée par ${q.id}`,
        decisionVersion: od.decisionVersion + 1,
        updatedAt: options.now,
        history: [...od.history, entry],
      };
      dismissed.push(other.id);
    }
  }
  const historyEntry: HarmonieHistoryEntry = { at: options.now, status: prev.status, text: q.text, proof: prev.proof, owner: prev.owner, reason: null };
  const adaptedText = status === "adapted" ? notes : prev.adaptedText;
  nextProposals[q.id] = {
    ...prev,
    status,
    notes,
    owner,
    proof,
    link,
    adaptedText,
    decisionVersion: prev.decisionVersion + 1,
    updatedAt: options.now,
    history: [...prev.history, historyEntry],
    // `if(retained(q)) q.acceptedHash = fingerprint(id,p)` : un choix retenu
    // est daté des données sur lesquelles il a été pris ; un choix écarté ou
    // remis à « proposée » n'a plus d'empreinte à réexaminer.
    acceptedHash: retainedNow ? fingerprint : null,
    snapshot: retainedNow ? proposalSnapshot({ ...q, text: adaptedText ?? q.originalText }) : (prev.snapshot ?? null),
  };
  return {
    state: { ...state, proposals: nextProposals },
    retained: retainedNow,
    dismissed,
    targets: q.targets,
  };
}

/**
 * « Actualiser les propositions » (`generate(id, p, true)` du prototype) :
 * la révision avance, l'empreinte de génération devient l'empreinte
 * courante ; les arbitrages — et leurs `acceptedHash` — sont conservés, donc
 * un choix pris sur d'autres données reste « à réexaminer » jusqu'à ce qu'il
 * soit confirmé.
 */
export function regenerateHarmonieStep(state: HarmonieStepState, fingerprint: string | null, now: string): HarmonieStepState {
  return { ...state, revision: state.revision + 1, generatedAt: now, generatedHash: fingerprint };
}

export interface IncomingIntention {
  origin: number;
  originLabel: string;
  id: string;
  ref: string;
  title: string;
  text: string;
  status: HarmonieProposalStatus;
  stateLabel: string;
  /** Version de l'arbitrage à l'origine (entre dans l'empreinte des étapes cibles). */
  decisionVersion: number;
  /** « Source à réexaminer » : l'étape d'origine est elle-même périmée (`originStale` du prototype). */
  originStale: boolean;
}

/**
 * `incoming()` du prototype : les intentions retenues aux étapes amont dont
 * les cibles incluent cette étape, dans l'ordre des étapes. `staleOf` dit si
 * une étape amont est périmée (calculé par `dependencies.ts`) ; sans lui,
 * aucune origine n'est signalée.
 */
export function incomingIntentions(
  data: HarmonieProfilesData,
  steps: readonly { def: ParcoursStepDefinition; state: HarmonieStepState; computed?: HarmonieProposalComputation | null }[],
  target: number,
  profile: HarmonieProfile,
  staleOf: ((stepNumber: number) => boolean) | null = null,
): IncomingIntention[] {
  const out: IncomingIntention[] = [];
  for (const { def, state, computed } of [...steps].sort((a, b) => a.def.number - b.def.number)) {
    if (def.number >= target) continue;
    const originStale = staleOf ? staleOf(def.number) : false;
    for (const q of buildHarmonieProposals(data, def, profile, state, computed ?? null)) {
      if (!q.retained || !q.targets.includes(target)) continue;
      out.push({
        origin: def.number,
        originLabel: `${pad2(def.number)} · ${def.title}`,
        id: q.id,
        ref: q.ref,
        title: q.title,
        text: q.text,
        status: q.decision.status,
        stateLabel: q.stateLabel,
        decisionVersion: q.decision.decisionVersion,
        originStale,
      });
    }
  }
  return out;
}
