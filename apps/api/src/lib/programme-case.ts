/**
 * Cas de programme appliqué à un projet — `saveProgramme` / `editSpace` /
 * `invalidateDecision` de la bibliothèque des bâtiments du prototype,
 * exécutés par le serveur (propriétaire des données du projet).
 *
 * Effets d'une application : cas de programme versionné (`programme_cases`),
 * répartition chargée depuis les fiches espaces (`programme_repartitions`,
 * mode « cas »), textes métier générés dans les étapes (réponses vides ou
 * précédemment générées seulement, écarts conservés dans
 * `projects.programme_state`), type du profil Harmonie. La parcelle et les
 * objets de l'Atelier restent inchangés. Une adaptation de ligne remet les
 * revues des étapes 06–12 et 16–19 à faire et une décision prise en
 * « À reprendre » (historique conservé).
 */
import { and, desc, eq } from "drizzle-orm";
import {
  PROGRAMME_REVIEW_STEPS,
  applySurfaceTransfer,
  buildProgrammeCase,
  buildingCase,
  buildingScenario,
  draftProgrammeTexts,
  editProgrammeSpace,
  fnv1a,
  harmonyDossier,
  linkProgrammeRoom,
  mergeGeneratedTexts,
  programmeCaseSums,
  repartitionFromCase,
  setProgrammeHypothesis,
  type BuildingScenario,
  type HarmonyRoomRecord,
  type ParcoursFieldValue,
  type ParcoursStepContent,
  type ProgrammeCase,
  type ProgrammeFieldConflict,
  type SurfaceTransfer,
} from "@parcours/domain-model";
import type { db } from "../db/client.js";
import { programmeCases, programmeRepartitions, projects } from "../db/schema.js";
import { BUILDING_LIBRARY, EMPTY_STEP_CONTENT, PARCOURS_STEPS } from "../data/parcours.js";
import { loadStepRows, upsertStep } from "./step-rows.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Querier = Tx | typeof db;

export interface ProgrammeState {
  generated: Record<number, Record<string, string>>;
  conflicts: ProgrammeFieldConflict[];
  decisionReview: { required: boolean; reason: string; at: string } | null;
  decisionHistory: { decision: string; fields: Record<string, ParcoursFieldValue>; date: string; reason: string }[];
  /** « Adopter cette proposition » (`p118FieldHistoryV62` du prototype) : le texte conservé qu'une proposition a remplacé, daté — rien n'est perdu. */
  fieldHistory?: (ProgrammeFieldConflict & { at: string })[];
}

export const EMPTY_PROGRAMME_STATE: ProgrammeState = { generated: {}, conflicts: [], decisionReview: null, decisionHistory: [], fieldHistory: [] };

export function programmeStateOf(project: { programmeState: Record<string, unknown> | null }): ProgrammeState {
  return { ...EMPTY_PROGRAMME_STATE, ...((project.programmeState ?? {}) as Partial<ProgrammeState>) };
}

/** Le cas de programme courant du projet (révision la plus haute), ou `null`. */
export async function loadActiveProgrammeCase(q: Querier, projectId: string): Promise<ProgrammeCase | null> {
  const row = (await q.select().from(programmeCases).where(eq(programmeCases.projectId, projectId)).orderBy(desc(programmeCases.revision)).limit(1))[0];
  return row ? (row.data as unknown as ProgrammeCase) : null;
}

/** Historique des variantes appliquées : les révisions archivées, de la plus récente à la plus ancienne (bornées à 12 comme le prototype). */
export async function loadProgrammeHistory(q: Querier, projectId: string): Promise<{ revision: number; title: string; scenarioLabel: string; updated: string; archived: string }[]> {
  const rows = await q.select().from(programmeCases).where(eq(programmeCases.projectId, projectId)).orderBy(desc(programmeCases.revision));
  return rows.slice(1, 13).map((r) => {
    const a = r.data as unknown as ProgrammeCase;
    return { revision: a.revision, title: a.title, scenarioLabel: a.scenarioLabel, updated: a.updated, archived: r.createdAt.toISOString() };
  });
}

const isTextField = (stage: number, key: string): boolean => {
  const def = PARCOURS_STEPS.find((s) => s.number === stage);
  if (!def) return false;
  if (!def.form) return key === "summary";
  const f = def.form.fields.find((x) => x.key === key);
  return !!f && (f.type === "text" || f.type === "textarea");
};

async function writeStepTexts(tx: Tx, projectId: string, business: Record<number, Record<string, ParcoursFieldValue>>, rows: Awaited<ReturnType<typeof loadStepRows>>) {
  for (const [idStr, fields] of Object.entries(business)) {
    const n = Number(idStr);
    const current = rows.get(n) ?? { status: EMPTY_STEP_CONTENT.status, content: EMPTY_STEP_CONTENT };
    const nextFields = { ...current.content.fields };
    let changed = false;
    for (const [k, v] of Object.entries(fields)) {
      if (nextFields[k] !== v) {
        changed = true;
        if (v === null || v === "") delete nextFields[k];
        else nextFields[k] = v;
      }
    }
    if (!changed) continue;
    const status = current.status === "a-faire" ? "en-cours" : current.status;
    const content: ParcoursStepContent = { ...current.content, status, fields: nextFields };
    await upsertStep(tx, projectId, n, status, content);
    rows.set(n, { status, content });
  }
}

async function storeCase(tx: Tx, projectId: string, a: ProgrammeCase) {
  await tx.insert(programmeCases).values({ projectId, revision: a.revision, caseId: a.caseId, scenarioId: a.scenarioId, data: a as unknown as Record<string, unknown>, createdAt: new Date() });
  // Historique borné à 12 révisions archivées.
  const all = await tx.select({ revision: programmeCases.revision }).from(programmeCases).where(eq(programmeCases.projectId, projectId)).orderBy(desc(programmeCases.revision));
  for (const old of all.slice(13)) await tx.delete(programmeCases).where(and(eq(programmeCases.projectId, projectId), eq(programmeCases.revision, old.revision)));
  const rep = repartitionFromCase(a);
  const existing = (await tx.select().from(programmeRepartitions).where(eq(programmeRepartitions.projectId, projectId)).limit(1))[0];
  const next = {
    projectId,
    type: rep.type,
    baseArea: rep.baseArea,
    mode: rep.mode,
    custom: rep.custom,
    components: existing?.components ?? [],
    updatedAt: new Date(),
  };
  await tx.insert(programmeRepartitions).values(next).onConflictDoUpdate({ target: programmeRepartitions.projectId, set: next });
}

export interface ApplyInput {
  caseId: string;
  scenarioId: string;
  jurisdiction: string;
  replaceText: boolean;
}

/** `saveProgramme` : applique une variante au projet et renvoie le cas, les écarts et les champs générés. */
export async function applyProgrammeCase(
  tx: Tx,
  project: { id: string; programmeState: Record<string, unknown> | null },
  input: ApplyInput,
  now: string,
): Promise<{ programmeCase: ProgrammeCase; conflicts: ProgrammeFieldConflict[] }> {
  const c = buildingCase(BUILDING_LIBRARY, input.caseId);
  if (!c) throw new Error("Cas inconnu");
  const s = buildingScenario(c, input.scenarioId);
  if (!s) throw new Error("Variante inconnue");
  const prev = await loadActiveProgrammeCase(tx, project.id);
  const a = buildProgrammeCase(BUILDING_LIBRARY, c, s, input.jurisdiction, prev, now);
  await storeCase(tx, project.id, a);

  const rows = await loadStepRows(tx, project.id);
  const business: Record<number, Record<string, ParcoursFieldValue>> = {};
  for (const def of PARCOURS_STEPS) business[def.number] = { ...(rows.get(def.number)?.content.fields ?? {}) };
  const state = programmeStateOf(project);
  const merged = mergeGeneratedTexts(business, state.generated, draftProgrammeTexts(BUILDING_LIBRARY, c, s, input.jurisdiction, now), input.replaceText, isTextField);
  await writeStepTexts(tx, project.id, merged.business, rows);

  // Type du profil Harmonie : composantes d'un cas mixte.
  if (c.type === "mixte" && c.components.length) {
    const existing = (await tx.select().from(programmeRepartitions).where(eq(programmeRepartitions.projectId, project.id)).limit(1))[0];
    if (existing && existing.components.length === 0) await tx.update(programmeRepartitions).set({ components: c.components.slice() }).where(eq(programmeRepartitions.projectId, project.id));
  }
  const nextState: ProgrammeState = { ...state, generated: merged.generated, conflicts: merged.conflicts };
  await tx
    .update(projects)
    .set({ programmeState: nextState as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  return { programmeCase: a, conflicts: merged.conflicts };
}

/**
 * « Adopter cette proposition » (flow-v62 `data-v62-accept`) : le champ conservé prend le texte proposé par le programme,
 * l'ancien texte rejoint l'historique daté, l'écart disparaît de la liste. Seul le champ choisi change ; `null` si l'écart
 * n'existe plus (liste déjà arbitrée ou périmée).
 */
export async function adoptProgrammeConflict(tx: Tx, project: { id: string; programmeState: Record<string, unknown> | null }, index: number, now: string): Promise<ProgrammeFieldConflict | null> {
  const state = programmeStateOf(project);
  const conflict = state.conflicts[index];
  if (!conflict) return null;
  const rows = await loadStepRows(tx, project.id);
  await writeStepTexts(tx, project.id, { [conflict.stage]: { [conflict.field]: conflict.proposed } }, rows);
  const generated = { ...state.generated, [conflict.stage]: { ...(state.generated[conflict.stage] ?? {}), [conflict.field]: conflict.proposed } };
  const nextState: ProgrammeState = {
    ...state,
    generated,
    conflicts: state.conflicts.filter((_, i) => i !== index),
    fieldHistory: [...(state.fieldHistory ?? []), { ...conflict, at: now }],
  };
  await tx
    .update(projects)
    .set({ programmeState: nextState as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  return conflict;
}

/** `invalidateDecision` : une décision prise repasse « À reprendre », l'ancienne est archivée ; l'étape 19 n'est plus terminée. */
async function invalidateDecision(tx: Tx, projectId: string, state: ProgrammeState, reason: string, now: string, rows: Awaited<ReturnType<typeof loadStepRows>>): Promise<ProgrammeState> {
  const d19 = rows.get(19) ?? { status: EMPTY_STEP_CONTENT.status, content: EMPTY_STEP_CONTENT };
  const decision = d19.content.fields["decision"];
  const history = [...state.decisionHistory];
  if (decision && decision !== "À reprendre") {
    history.push({ decision: String(decision), fields: { ...d19.content.fields }, date: now, reason });
    if (history.length > 20) history.splice(0, history.length - 20);
  }
  const content: ParcoursStepContent = { ...d19.content, status: "en-cours", fields: { ...d19.content.fields, decision: "À reprendre" } };
  await upsertStep(tx, projectId, 19, "en-cours", content);
  rows.set(19, { status: "en-cours", content });
  return { ...state, decisionReview: { required: true, reason, at: now }, decisionHistory: history };
}

/** `editSpace` : adapte une ligne du programme appliqué ; textes générés actualisés, revues à reprendre, décision à réexaminer. */
export async function editProgrammeCaseSpace(
  tx: Tx,
  project: { id: string; programmeState: Record<string, unknown> | null },
  spaceId: string,
  key: "quantity" | "unitArea",
  value: unknown,
  now: string,
): Promise<ProgrammeCase> {
  const prev = await loadActiveProgrammeCase(tx, project.id);
  if (!prev) throw new Error("Aucun programme appliqué.");
  const a = editProgrammeSpace(prev, spaceId, key, value, now);
  // La révision adaptée remplace la courante (même ligne d'historique : le prototype incrémente en place).
  await tx.delete(programmeCases).where(and(eq(programmeCases.projectId, project.id), eq(programmeCases.revision, prev.revision)));
  await storeCase(tx, project.id, a);

  const c = buildingCase(BUILDING_LIBRARY, a.caseId);
  const rows = await loadStepRows(tx, project.id);
  let state = programmeStateOf(project);
  if (c) {
    const scenario: BuildingScenario = { ...(buildingScenario(c, a.scenarioId) ?? c.scenarios[0]!), label: a.scenarioLabel, spaces: a.spaces };
    const fresh = draftProgrammeTexts(BUILDING_LIBRARY, c, scenario, a.jurisdiction, now);
    const business: Record<number, Record<string, ParcoursFieldValue>> = {};
    const generated = { ...state.generated };
    for (const [idStr, values] of Object.entries(fresh)) {
      const n = Number(idStr);
      const fields = rows.get(n)?.content.fields ?? {};
      for (const [k, v] of Object.entries(values)) {
        if (isTextField(n, k) && fields[k] !== undefined && fields[k] === state.generated[n]?.[k]) {
          business[n] ??= { ...fields };
          business[n]![k] = v;
          generated[n] = { ...(generated[n] ?? {}), [k]: v };
        }
      }
    }
    await writeStepTexts(tx, project.id, business, rows);
    state = { ...state, generated };
  }
  for (const n of PROGRAMME_REVIEW_STEPS) {
    const r = rows.get(n);
    if (r && r.status === "termine") {
      const content: ParcoursStepContent = { ...r.content, status: "en-cours" };
      await upsertStep(tx, project.id, n, "en-cours", content);
      rows.set(n, { status: "en-cours", content });
    }
  }
  state = await invalidateDecision(tx, project.id, state, "Quantités ou surfaces du programme modifiées : décision à réexaminer.", now, rows);
  await tx
    .update(projects)
    .set({ programmeState: state as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  return a;
}

/** Remplace la révision courante en place (même ligne d'historique) : liaison de local, hypothèse. */
async function replaceActiveCase(tx: Tx, projectId: string, prev: ProgrammeCase, next: ProgrammeCase, withRepartition: boolean) {
  await tx.delete(programmeCases).where(and(eq(programmeCases.projectId, projectId), eq(programmeCases.revision, prev.revision)));
  if (withRepartition) await storeCase(tx, projectId, next);
  else
    await tx
      .insert(programmeCases)
      .values({ projectId, revision: next.revision, caseId: next.caseId, scenarioId: next.scenarioId, data: next as unknown as Record<string, unknown>, createdAt: new Date() });
}

/**
 * `linkRoom(spaceId, roomId, remove)` : la liaison par identifiant d'une
 * ligne du programme à une zone dessinée ; la fiche Harmony du local
 * (`harmony.roomData`) reçoit type et cible ; la répartition est recalculée.
 * `rooms` : les zones du modèle courant (`loadModelAnalysis`).
 */
export async function linkProgrammeCaseRoom(
  tx: Tx,
  project: { id: string; harmony: Record<string, unknown> | null },
  spaceId: string,
  roomId: string,
  remove: boolean,
  rooms: readonly { id: string }[],
  now: string,
): Promise<ProgrammeCase> {
  const prev = await loadActiveProgrammeCase(tx, project.id);
  if (!prev) throw new Error("Appliquez d’abord un programme.");
  const dossier = harmonyDossier(project.harmony, now);
  const { programmeCase, roomData } = linkProgrammeRoom(prev, dossier.roomData as Record<string, HarmonyRoomRecord>, spaceId, roomId, { remove, roomExists: rooms.some((r) => r.id === roomId), now });
  await replaceActiveCase(tx, project.id, prev, programmeCase, true);
  const harmony = { ...dossier, roomData, updated: now } as unknown as Record<string, unknown>;
  await tx.update(projects).set({ harmony, updatedAt: new Date() }).where(eq(projects.id, project.id));
  return programmeCase;
}

/** `hypothesisView` : statut, responsable ou preuve d'une hypothèse du cas appliqué (révision inchangée). */
export async function editProgrammeCaseHypothesis(
  tx: Tx,
  projectId: string,
  hypothesisId: string,
  patch: { status?: string | undefined; owner?: string | undefined; proof?: string | undefined },
  now: string,
): Promise<ProgrammeCase> {
  const prev = await loadActiveProgrammeCase(tx, projectId);
  if (!prev) throw new Error("Appliquez d’abord un programme.");
  let next = prev;
  // Responsable et preuve d'abord : un statut qui les exige peut être envoyé dans la même requête.
  for (const key of ["owner", "proof", "status"] as const) {
    const value = patch[key];
    if (value !== undefined) next = setProgrammeHypothesis(next, hypothesisId, key, value, now);
  }
  await replaceActiveCase(tx, projectId, prev, next, false);
  return next;
}

/** `applyTransfer` : deux adaptations de ligne (`editProgrammeCaseSpace`, avec textes, revues et décision), puis le transfert consigné dans l'état du programme. */
export async function applyProgrammeTransfer(
  tx: Tx,
  project: { id: string; programmeState: Record<string, unknown> | null },
  transfer: SurfaceTransfer,
  now: string,
): Promise<{ programmeCase: ProgrammeCase; total: number }> {
  const prev = await loadActiveProgrammeCase(tx, project.id);
  if (!prev) throw new Error("Appliquez d’abord un programme.");
  const { programmeCase } = applySurfaceTransfer(prev, project.id, transfer, fnv1a, now);
  const s = programmeCase.spaces.find((x) => x.id === transfer.from)!;
  const r = programmeCase.spaces.find((x) => x.id === transfer.to)!;
  await editProgrammeCaseSpace(tx, project, s.id, "unitArea", s.unitArea, now);
  const refreshed = (await tx.select().from(projects).where(eq(projects.id, project.id)).limit(1))[0]!;
  const after = await editProgrammeCaseSpace(tx, { id: project.id, programmeState: refreshed.programmeState }, r.id, "unitArea", r.unitArea, now);
  const latest = (await tx.select().from(projects).where(eq(projects.id, project.id)).limit(1))[0]!;
  const state = programmeStateOf(latest) as ProgrammeState & { transfers?: unknown[] };
  const transfers = [...(state.transfers ?? []), { ...transfer, at: now }];
  await tx
    .update(projects)
    .set({ programmeState: { ...state, transfers } as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  return { programmeCase: after, total: programmeCaseSums(after.spaces).total };
}
