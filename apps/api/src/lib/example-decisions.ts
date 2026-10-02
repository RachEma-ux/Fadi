/**
 * Arbitrages Harmonie de l'exemple résolu — `makeProject` de
 * p118-resolved-app (Parcours V8.19) rejoué sur le projet qui vient d'être
 * importé : à chaque étape, le parti illustré (`choice`) est « adapté » avec
 * la décision du récit comme texte transmis (`adaptedText`), le responsable,
 * la preuve et la fiche de décision `EX-P118-NN` ; les autres partis sont
 * « écartés » avec les alternatives comme motif ; aux étapes 10 / 11, chaque
 * proposition localisée est « adaptée » avec la réponse retenue pour ce
 * local (`roomResponses`), le rôle de démonstration et la référence du
 * local ; le choix du site (01) est aussi transmis à l'étape 03
 * (`q.targets.push(3)`). Rien n'est généré : sans récit pour l'étape, rien
 * n'est arbitré ; sans réponse pour un local, la phrase générique du
 * prototype est reprise telle quelle.
 */
import { buildHarmonieProposals, EMPTY_HARMONIE_DECISION, type HarmonieProposalDecision } from "@parcours/domain-model";
import { exampleDecisionSources, HARMONIE_PROFILES, PARCOURS_STEPS } from "../data/parcours.js";
import { computationFor, loadStepContext, type StepContextProject } from "./step-context.js";
import { loadStepRows, upsertStep, type Tx } from "./step-rows.js";

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Date des arbitrages de l'exemple (celle de ses propositions générées). */
const EXAMPLE_DECISION_AT = "2026-09-30T00:00:00.000Z";
const LOCAL_PROOF = "Réponse d’exemple localisée ; modèle source + objectifs V8.1 ; pas de constat réel.";

export async function applyExampleDecisions(tx: Tx, project: StepContextProject, exampleId: string): Promise<void> {
  const src = exampleDecisionSources(exampleId);
  if (!src) return;
  const rows = await loadStepRows(tx, project.id);
  const ctx = await loadStepContext(tx, project, rows);
  for (const def of PARCOURS_STEPS) {
    const row = rows.get(def.number);
    const v = src.steps[String(def.number)];
    if (!row || !v) continue;
    const link = `EX-P118-${pad2(def.number)}`;
    const base: HarmonieProposalDecision = { ...EMPTY_HARMONIE_DECISION, owner: v.owner ?? "", proof: v.proof ?? "", link, decisionVersion: 1, updatedAt: EXAMPLE_DECISION_AT, history: [] };
    const decisions: Record<string, HarmonieProposalDecision> = {};
    for (const q of buildHarmonieProposals(HARMONIE_PROFILES, def, ctx.profile, row.content.harmonie, computationFor(ctx, def.number))) {
      if (q.group === "parti") {
        if (v.choice && q.key === v.choice) {
          const decision = v.decision ?? "";
          decisions[q.id] = { ...base, status: "adapted", notes: decision, adaptedText: decision, ...(def.number === 1 && !q.targets.includes(3) ? { targets: [...q.targets, 3] } : {}) };
        } else if (v.choice) {
          decisions[q.id] = { ...base, status: "dismissed", notes: `Alternative non retenue dans ce scénario. ${v.alternatives ?? ""}`.trim() };
        }
      } else if (q.group === "local") {
        const room = src.roomResponses.find((r) => r.id === q.roomId || r.id === q.objectId) ?? src.roomResponses.find((r) => q.id.endsWith(`-LOCAL-${r.id}`)) ?? null;
        const answer = room ? `${room.decision} ${q.originalText}` : `Intention retenue : ${q.originalText || "Traiter cet usage selon sa fonction"} ; traitement par l’architecte, lié au modèle source ; aucune conformité déclarée.`;
        decisions[q.id] = { ...base, status: "adapted", notes: answer, adaptedText: answer, owner: src.role, proof: LOCAL_PROOF, link: room?.id ?? q.objectId ?? q.roomId ?? "Modèle / niveau de la proposition" };
      }
    }
    await upsertStep(tx, project.id, def.number, row.status, { ...row.content, harmonie: { ...row.content.harmonie, proposals: decisions } });
  }
}
