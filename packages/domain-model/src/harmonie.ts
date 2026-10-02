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
 * parcelle (zonage A/B/C avec schéma), viennent de `site.ts` et sont passées
 * ici en `HarmonieProposalComputation`. Non porté (documenté dans
 * docs/migration/matrix.md) : les propositions LOCALES par local des étapes
 * 10 et 11 (analyse du modèle natif) et les empreintes de péremption
 * calculées sur les données amont (« À réexaminer »).
 */
import type { SiteZoning } from "@parcours/core-geometry";
import type {
  HarmonieHistoryEntry,
  HarmonieOption,
  HarmonieProposalDecision,
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
  /** Étape 01 : zonage calculé sur le contour de la parcelle (`null` sans contour exploitable). */
  zoning?: SiteZoning | null;
  /** Propositions localisées : le local du modèle (`niveau|objet`) et l'objet natif. */
  roomId?: string;
  objectId?: string;
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
 * fourni (étape 01 : `siteProposalComputation`), les propositions calculées
 * sur les données du projet. Le point de départ privilégié est « A » sauf
 * recommandation calculée (le cas de l'étape 10 — densité d'un local — n'est
 * pas porté).
 */
export function buildHarmonieProposals(
  data: HarmonieProfilesData,
  def: ParcoursStepDefinition,
  profile: HarmonieProfile,
  state: HarmonieStepState,
  computed: HarmonieProposalComputation | null = null,
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
      targets: def.transmitsTo.slice(),
      recommended: key === recommendedKey,
      decision,
      retained: isRetainedStatus(data, decision.status),
      stateLabel: data.states[decision.status],
      ...(opt.zoning !== undefined ? { zoning: opt.zoning } : {}),
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
      roomId: opt.roomId,
      objectId: opt.objectId,
    };
  });
  return [...partis, ...locals];
}

export function retainedCount(data: HarmonieProfilesData, def: ParcoursStepDefinition, state: HarmonieStepState, computed: HarmonieProposalComputation | null = null): number {
  return buildHarmonieProposals(data, def, harmonieProfile(data, null), state, computed).filter((q) => q.retained).length;
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
  options: { now: string; stale?: boolean | undefined; computed?: HarmonieProposalComputation | null | undefined },
): HarmonieDecisionResult {
  if (!(input.status in data.states)) throw new HarmonieError("Statut invalide");
  const proposals = buildHarmonieProposals(data, def, harmonieProfile(data, null), state, options.computed ?? null);
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
  nextProposals[q.id] = {
    ...prev,
    status,
    notes,
    owner,
    proof,
    link,
    adaptedText: status === "adapted" ? notes : prev.adaptedText,
    decisionVersion: prev.decisionVersion + 1,
    updatedAt: options.now,
    history: [...prev.history, historyEntry],
  };
  return {
    state: { ...state, proposals: nextProposals },
    retained: retainedNow,
    dismissed,
    targets: q.targets,
  };
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
}

/**
 * `incoming()` du prototype : les intentions retenues aux étapes amont dont
 * les cibles incluent cette étape, dans l'ordre des étapes.
 */
export function incomingIntentions(
  data: HarmonieProfilesData,
  steps: readonly { def: ParcoursStepDefinition; state: HarmonieStepState; computed?: HarmonieProposalComputation | null }[],
  target: number,
  profile: HarmonieProfile,
): IncomingIntention[] {
  const out: IncomingIntention[] = [];
  for (const { def, state, computed } of [...steps].sort((a, b) => a.def.number - b.def.number)) {
    if (def.number >= target) continue;
    for (const q of buildHarmonieProposals(data, def, profile, state, computed ?? null)) {
      if (!q.retained || !q.targets.includes(target)) continue;
      out.push({ origin: def.number, originLabel: `${pad2(def.number)} · ${def.title}`, id: q.id, ref: q.ref, title: q.title, text: q.text, status: q.decision.status, stateLabel: q.stateLabel });
    }
  }
  return out;
}
