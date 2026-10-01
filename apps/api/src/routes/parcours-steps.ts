/**
 * Module Parcours — les 21 étapes d'un projet : lecture, formulaire métier,
 * statut (« Marquer terminée »), arbitrages Harmonie. Monté sous
 * `/projects/:projectId/steps` ; l'autorisation par projet est vérifiée ici
 * à chaque appel (jamais seulement « connecté »).
 *
 * Le serveur fait autorité : les clés de formulaire acceptées sont celles
 * du schéma de l'étape, les valeurs sont typées, et les règles Harmonie
 * (`decideHarmonieProposal`) s'exécutent ici, pas seulement dans
 * l'interface.
 */
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  EMPTY_HARMONIE_STEP_STATE,
  HarmonieError,
  buildHarmonieProposals,
  decideHarmonieProposal,
  harmonieProfile,
  incomingIntentions,
  isDecisionChoice,
  type HarmonieProposalStatus,
  type HarmonieStepState,
  type ParcoursFieldValue,
  type ParcoursStepContent,
  type ParcoursStepDefinition,
  type ParcoursStepStatus,
} from "@parcours/domain-model";
import { db } from "../db/client.js";
import { projectSteps } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { EMPTY_STEP_CONTENT, HARMONIE_PROFILES, PARCOURS_STEPS, parcoursStepDefinition } from "../data/parcours.js";
import { loadOwnedProject, type OwnedProject } from "../lib/owned-project.js";
import { loadProgrammeRepartition } from "./programme.js";

export const parcoursStepsRouter = Router({ mergeParams: true });
parcoursStepsRouter.use(requireAuth);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Querier = Tx | typeof db;

/** Les lignes écrites avant l'ajout des champs `fields`/`harmonie` sont lues avec leurs valeurs vides. */
function normalizeContent(raw: Record<string, unknown>): ParcoursStepContent {
  const content = { ...EMPTY_STEP_CONTENT, ...(raw as Partial<ParcoursStepContent>) } as ParcoursStepContent;
  content.fields = { ...(content.fields ?? {}) };
  const harmonie = (content.harmonie ?? EMPTY_HARMONIE_STEP_STATE) as HarmonieStepState;
  content.harmonie = { ...EMPTY_HARMONIE_STEP_STATE, ...harmonie, proposals: { ...(harmonie.proposals ?? {}) } };
  return content;
}

async function loadStepRows(q: Querier, projectId: string) {
  const rows = await q.select().from(projectSteps).where(eq(projectSteps.projectId, projectId));
  const byNumber = new Map<number, { status: ParcoursStepStatus; content: ParcoursStepContent }>();
  for (const r of rows) byNumber.set(r.stepNumber, { status: r.status as ParcoursStepStatus, content: normalizeContent(r.content) });
  return byNumber;
}

/**
 * Profil Harmonie du projet : le type de bâtiment de la répartition
 * programmatique **une fois déclaré**. Tant que personne n'a touché à la
 * répartition, le profil reste « Type à préciser » — c'est ce que le
 * prototype affiche sur un projet vierge (capture new-02-desktop-expanded :
 * « Comparer accueil extérieur, espace ouvert et desserte sans supposer un
 * usage intérieur »), le réglage par défaut « tertiaire » n'y existant
 * qu'après un premier passage par l'étape 06.
 */
async function projectProfile(projectId: string) {
  const rep = await loadProgrammeRepartition(projectId);
  return harmonieProfile(HARMONIE_PROFILES, rep.stored ? rep.type : null, rep.components);
}

/** La vue complète d'une étape telle que le client l'affiche : définition, contenu, propositions Harmonie calculées, intentions reçues. */
function stepView(def: ParcoursStepDefinition, rows: Map<number, { status: ParcoursStepStatus; content: ParcoursStepContent }>, profile: ReturnType<typeof harmonieProfile>) {
  const row = rows.get(def.number);
  const content = row?.content ?? EMPTY_STEP_CONTENT;
  const proposals = buildHarmonieProposals(HARMONIE_PROFILES, def, profile, content.harmonie);
  const incoming = incomingIntentions(
    HARMONIE_PROFILES,
    PARCOURS_STEPS.map((d) => ({ def: d, state: rows.get(d.number)?.content.harmonie ?? EMPTY_HARMONIE_STEP_STATE })),
    def.number,
    profile,
  );
  return {
    ...def,
    status: row?.status ?? EMPTY_STEP_CONTENT.status,
    content,
    proposals,
    incoming,
    retainedCount: proposals.filter((q) => q.retained).length,
    profile,
  };
}

async function ownedProjectOr404(req: Request, res: Response): Promise<OwnedProject | null> {
  const project = await loadOwnedProject((req.params as Record<string, string>)["projectId"] ?? "", req.user!.id);
  if (!project) res.status(404).json({ error: "not_found" });
  return project;
}

function stepOr404(raw: string, res: Response): ParcoursStepDefinition | null {
  const number = Number(raw);
  const def = Number.isInteger(number) ? parcoursStepDefinition(number) : null;
  if (!def) res.status(404).json({ error: "not_found" });
  return def;
}

parcoursStepsRouter.get("/", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const rows = await loadStepRows(db, project.id);
  const profile = await projectProfile(project.id);
  res.json(PARCOURS_STEPS.map((def) => stepView(def, rows, profile)));
});

parcoursStepsRouter.get("/:stepNumber", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const def = stepOr404(req.params["stepNumber"] as string, res);
  if (!def) return;
  const rows = await loadStepRows(db, project.id);
  res.json(stepView(def, rows, await projectProfile(project.id)));
});

// --- Formulaire métier et statut ------------------------------------------

const fieldValueSchema = z.union([z.string().max(10000), z.number().finite(), z.null()]);

const patchSchema = z.object({
  status: z.enum(["a-faire", "en-cours", "termine"]).optional(),
  fields: z.record(z.string().max(32), fieldValueSchema).optional(),
});

/**
 * Valide une réponse contre le champ du formulaire : nombre fini ou null
 * pour `number` (jamais une chaîne vide convertie en zéro), date ISO
 * (AAAA-MM-JJ) ou null pour `date`, texte sinon. `decision` (étape 19)
 * n'admet que les quatre issues du prototype.
 */
function validateField(def: ParcoursStepDefinition, key: string, value: ParcoursFieldValue): { ok: true; value: ParcoursFieldValue } | { ok: false; reason: string } {
  if (key === "decision" && def.number === 19) {
    if (value === null || value === "") return { ok: true, value: null };
    return isDecisionChoice(value) ? { ok: true, value } : { ok: false, reason: "Décision inconnue" };
  }
  const field = def.form?.fields.find((f) => f.key === key);
  if (!field) return { ok: false, reason: `Champ inconnu pour cette étape : ${key}` };
  if (value === null || value === "") return { ok: true, value: null };
  switch (field.type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: `Nombre attendu pour ${field.label}` };
    }
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? { ok: true, value } : { ok: false, reason: `Date (AAAA-MM-JJ) attendue pour ${field.label}` };
    default:
      return typeof value === "string" ? { ok: true, value } : { ok: true, value: String(value) };
  }
}

parcoursStepsRouter.patch("/:stepNumber", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const def = stepOr404(req.params["stepNumber"] as string, res);
  if (!def) return;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const updates: Record<string, ParcoursFieldValue> = {};
  for (const [key, value] of Object.entries(parsed.data.fields ?? {})) {
    const v = validateField(def, key, value);
    if (!v.ok) {
      res.status(400).json({ error: "invalid_input", details: { fields: { [key]: v.reason } } });
      return;
    }
    updates[key] = v.value;
  }

  const result = await db.transaction(async (tx) => {
    const rows = await loadStepRows(tx, project.id);
    const current = rows.get(def.number) ?? { status: EMPTY_STEP_CONTENT.status, content: EMPTY_STEP_CONTENT };
    const fields = { ...current.content.fields };
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) delete fields[k];
      else fields[k] = v;
    }
    // Le statut ne change que sur demande explicite (« Marquer terminée ») ;
    // une saisie fait seulement passer une étape « à faire » en cours — la
    // progression ne se déduit jamais de la seule présence d'un texte.
    let status = parsed.data.status ?? current.status;
    if (!parsed.data.status && status === "a-faire" && Object.keys(updates).length > 0) status = "en-cours";
    const content: ParcoursStepContent = { ...current.content, status, fields };
    await tx
      .insert(projectSteps)
      .values({ projectId: project.id, stepNumber: def.number, status, content: { ...content } })
      .onConflictDoUpdate({ target: [projectSteps.projectId, projectSteps.stepNumber], set: { status, content: { ...content } } });
    rows.set(def.number, { status, content });
    return stepView(def, rows, await projectProfile(project.id));
  });
  res.json(result);
});

// --- Arbitrages Harmonie ---------------------------------------------------

const decisionSchema = z.object({
  status: z.enum(["proposed", "retained", "adapted", "translated", "drawn", "verified", "dismissed"]),
  notes: z.string().max(6000).optional(),
  owner: z.string().max(250).optional(),
  proof: z.string().max(3000).optional(),
  link: z.string().max(500).optional(),
});

parcoursStepsRouter.post("/:stepNumber/harmonie/:proposalId", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const def = stepOr404(req.params["stepNumber"] as string, res);
  if (!def) return;
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const proposalId = req.params["proposalId"] as string;
  const now = new Date().toISOString();

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await loadStepRows(tx, project.id);
      const current = rows.get(def.number) ?? { status: EMPTY_STEP_CONTENT.status, content: EMPTY_STEP_CONTENT };
      const decided = decideHarmonieProposal(HARMONIE_PROFILES, def, current.content.harmonie, proposalId, parsed.data as { status: HarmonieProposalStatus; notes?: string; owner?: string; proof?: string; link?: string }, { now });
      const status: ParcoursStepStatus = current.status === "a-faire" ? "en-cours" : current.status;
      const content: ParcoursStepContent = { ...current.content, status, harmonie: decided.state };
      await upsertStep(tx, project.id, def.number, status, content);
      rows.set(def.number, { status, content });

      if (decided.retained) {
        // Une intention retenue remet à faire les étapes cibles (prototype :
        // `p.done[target]=false`) …
        for (const target of decided.targets) {
          const t = rows.get(target);
          if (t && t.status === "termine") {
            const next: ParcoursStepContent = { ...t.content, status: "en-cours" };
            await upsertStep(tx, project.id, target, "en-cours", next);
            rows.set(target, { status: "en-cours", content: next });
          }
        }
        // … et, avant l'étape 19, rétrograde un GO déjà pris en « À reprendre ».
        if (def.number < 19) {
          const d19 = rows.get(19);
          const decision = d19?.content.fields["decision"];
          if (d19 && (decision === "GO" || decision === "GO sous conditions")) {
            const next: ParcoursStepContent = {
              ...d19.content,
              status: "en-cours",
              fields: { ...d19.content.fields, decision: "À reprendre", decisionHistory: `${d19.content.fields["decisionHistory"] ?? ""}${now} : ${decision} → À reprendre (intention modifiée : ${proposalId})\n` },
            };
            await upsertStep(tx, project.id, 19, "en-cours", next);
            rows.set(19, { status: "en-cours", content: next });
          }
        }
      }
      return stepView(def, rows, await projectProfile(project.id));
    });
    res.json(result);
  } catch (err) {
    if (err instanceof HarmonieError) {
      res.status(422).json({ error: "harmonie_rule", message: err.message });
      return;
    }
    throw err;
  }
});

async function upsertStep(tx: Tx, projectId: string, stepNumber: number, status: ParcoursStepStatus, content: ParcoursStepContent) {
  await tx
    .insert(projectSteps)
    .values({ projectId, stepNumber, status, content: { ...content } })
    .onConflictDoUpdate({ target: [projectSteps.projectId, projectSteps.stepNumber], set: { status, content: { ...content } } });
}

export { normalizeContent };
