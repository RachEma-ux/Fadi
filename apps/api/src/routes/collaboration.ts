/**
 * Module Collaboration — monté sous `/projects/:projectId/collaboration` :
 *   GET    /                   → accès (propriétaire, partage non disponible), état de synchronisation, journal des révisions, commentaires
 *   GET    /comments[?step=N]  → commentaires du projet (ou d'une étape)
 *   POST   /comments           → { body, stepNumber? } : nouveau commentaire de l'utilisateur connecté
 *   DELETE /comments/:id       → suppression par son auteur seulement
 *
 * Le journal des révisions n'invente rien : il relit les dates portées par
 * les données elles-mêmes (arbitrages Harmonie et leurs historiques,
 * actualisations, variantes de programme, transferts, revues de conception,
 * écritures du modèle natif et des parcelles, productions de documents,
 * commentaires). Le partage multi-utilisateur, les droits et la
 * synchronisation hors-ligne ne sont pas disponibles : l'écran le dit.
 */
import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { PARCOURS_STEPS } from "../data/parcours.js";
import { db } from "../db/client.js";
import { atelierStore, parcels, producedDocuments, programmeCases, projectComments, users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { loadOwnedProject, type OwnedProject } from "../lib/owned-project.js";
import { loadStepRows } from "../lib/step-rows.js";
import { contentOf } from "../lib/step-context.js";

export const collaborationRouter = Router({ mergeParams: true });
collaborationRouter.use(requireAuth);

async function ownedProjectOr404(req: Request, res: Response): Promise<OwnedProject | null> {
  const project = await loadOwnedProject((req.params as Record<string, string>)["projectId"] ?? "", req.user!.id);
  if (!project) res.status(404).json({ error: "not_found" });
  return project;
}

export interface RevisionEvent {
  at: string;
  /** `harmonie` · `programme` · `modele` · `parcelle` · `revue` · `document` · `commentaire` · `projet` */
  kind: string;
  label: string;
  detail: string;
  stepNumber: number | null;
  revision: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "proposée",
  retained: "retenue",
  adapted: "adaptée et retenue",
  dismissed: "écartée avec motif",
  translated: "traduite au programme",
  drawn: "dessinée",
  verified: "vérifiée",
};

/** Le journal des révisions du projet, relu depuis les dates que les données portent. */
export async function revisionJournal(project: OwnedProject): Promise<RevisionEvent[]> {
  const events: RevisionEvent[] = [];
  const pad2 = (n: number) => String(n).padStart(2, "0");
  events.push({
    at: project.createdAt.toISOString(),
    kind: "projet",
    label: project.sourceExampleId ? `Projet créé depuis l'exemple ${project.sourceExampleId}${project.exampleMode === "editable" ? " (copie de travail)" : ""}` : "Projet créé",
    detail: `${project.code} — ${project.name}`,
    stepNumber: null,
    revision: null,
  });

  const rows = await loadStepRows(db, project.id);
  for (const def of PARCOURS_STEPS) {
    const c = contentOf(rows, def.number);
    if (c.harmonie.generatedAt && c.harmonie.revision > 0) {
      events.push({
        at: c.harmonie.generatedAt,
        kind: "harmonie",
        label: `Étape ${pad2(def.number)} · propositions Harmonie générées`,
        detail: `Révision ${c.harmonie.revision} · ${def.title}`,
        stepNumber: def.number,
        revision: c.harmonie.revision,
      });
    }
    for (const [proposalId, d] of Object.entries(c.harmonie.proposals)) {
      // L'arbitrage courant est daté de `updatedAt` ; chaque entrée d'historique conserve l'état remplacé à cette date.
      if (d.updatedAt) {
        events.push({
          at: d.updatedAt,
          kind: "harmonie",
          label: `Étape ${pad2(def.number)} · proposition ${proposalId} ${STATUS_LABEL[d.status] ?? d.status}`,
          detail: [`version d'arbitrage ${d.decisionVersion}`, d.owner ? `responsable ${d.owner}` : null, d.notes ? `motif / adaptation : ${d.notes}` : null, d.proof ? `preuve : ${d.proof}` : null]
            .filter(Boolean)
            .join(" · "),
          stepNumber: def.number,
          revision: d.decisionVersion,
        });
      }
      for (const h of d.history) {
        if (h.status === "proposed" && !h.reason) continue; // état initial, sans arbitrage
        events.push({
          at: h.at,
          kind: "harmonie",
          label: `Étape ${pad2(def.number)} · proposition ${proposalId} · état antérieur conservé (${STATUS_LABEL[h.status] ?? h.status})`,
          detail: [h.owner ? `responsable ${h.owner}` : null, h.reason ? h.reason : null, h.proof ? `preuve : ${h.proof}` : null].filter(Boolean).join(" · ") || def.title,
          stepNumber: def.number,
          revision: null,
        });
      }
    }
  }

  const cases = await db.select().from(programmeCases).where(eq(programmeCases.projectId, project.id)).orderBy(asc(programmeCases.revision));
  for (const row of cases) {
    const a = row.data as { title?: string; scenarioLabel?: string; revision?: number; spaces?: unknown[] };
    events.push({
      at: row.createdAt.toISOString(),
      kind: "programme",
      label: `Programme · révision ${a.revision ?? row.revision}`,
      detail: `${a.title ?? row.caseId} · ${a.scenarioLabel ?? row.scenarioId} · ${Array.isArray(a.spaces) ? a.spaces.length : 0} fiches`,
      stepNumber: 7,
      revision: a.revision ?? row.revision,
    });
  }
  const transfers = (project.programmeState as { transfers?: { at?: string; from?: string; to?: string; amount?: number; reason?: string }[] } | null)?.transfers ?? [];
  for (const t of transfers) {
    if (t.at)
      events.push({
        at: t.at,
        kind: "programme",
        label: "Transfert surfacique à total constant",
        detail: `${t.amount ?? "?"} m² : ${t.from ?? "?"} → ${t.to ?? "?"}${t.reason ? ` · ${t.reason}` : ""}`,
        stepNumber: 7,
        revision: null,
      });
  }

  const harmony = (project.harmony ?? {}) as {
    designReviewV62?: { at?: string; name?: string; modelSignature?: string } | null;
    designReviewHistoryV62?: { at?: string; name?: string; modelSignature?: string }[];
  };
  for (const r of [harmony.designReviewV62, ...(harmony.designReviewHistoryV62 ?? [])]) {
    if (r?.at)
      events.push({
        at: r.at,
        kind: "revue",
        label: "Revue de conception rattachée aux entrées courantes",
        detail: `${r.name ?? "Revue"} · modèle ${r.modelSignature ?? "?"}`,
        stepNumber: 10,
        revision: null,
      });
  }

  const store = await db.select({ key: atelierStore.key, revision: atelierStore.revision, updatedAt: atelierStore.updatedAt }).from(atelierStore).where(eq(atelierStore.projectId, project.id));
  for (const r of store) {
    const domain = r.key.split(".").pop() ?? r.key;
    if (domain === "ui" || r.key === "design.v13.activeProject" || r.key === "design.v13.registry") continue;
    events.push({ at: r.updatedAt.toISOString(), kind: "modele", label: `Modèle natif · ${domain}`, detail: `Clé ${r.key} · révision ${r.revision}`, stepNumber: 10, revision: r.revision });
  }
  const parcelRows = await db.select({ id: parcels.id, name: parcels.name, revision: parcels.revision, updatedAt: parcels.updatedAt }).from(parcels).where(eq(parcels.projectId, project.id));
  for (const p of parcelRows)
    events.push({ at: p.updatedAt.toISOString(), kind: "parcelle", label: `Parcelle · ${p.name}`, detail: `Fichier ${p.id} · révision ${p.revision}`, stepNumber: 1, revision: p.revision });

  const docs = await db.select().from(producedDocuments).where(eq(producedDocuments.projectId, project.id));
  for (const d of docs)
    events.push({
      at: d.producedAt.toISOString(),
      kind: "document",
      label: `Document produit · ${d.label}`,
      detail: `${d.fileName} · révision du modèle ${d.modelRevision} · ${d.count} production(s)`,
      stepNumber: d.stepNumber,
      revision: d.modelRevision,
    });

  const comments = await db.select().from(projectComments).where(eq(projectComments.projectId, project.id));
  for (const c of comments)
    events.push({
      at: c.createdAt.toISOString(),
      kind: "commentaire",
      label: `Commentaire · ${c.authorEmail}`,
      detail: c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
      stepNumber: c.stepNumber,
      revision: null,
    });

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 300);
}

function commentView(c: typeof projectComments.$inferSelect, userId: string) {
  return { id: c.id, stepNumber: c.stepNumber, authorEmail: c.authorEmail, body: c.body, createdAt: c.createdAt.toISOString(), mine: c.authorId === userId };
}

collaborationRouter.get("/", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, project.ownerId)).limit(1);
  const store = await db.select({ key: atelierStore.key, revision: atelierStore.revision, updatedAt: atelierStore.updatedAt }).from(atelierStore).where(eq(atelierStore.projectId, project.id));
  const lastWrite = store.reduce<string | null>((acc, r) => (acc === null || r.updatedAt.toISOString() > acc ? r.updatedAt.toISOString() : acc), null);
  const comments = await db.select().from(projectComments).where(eq(projectComments.projectId, project.id)).orderBy(desc(projectComments.createdAt));
  res.json({
    access: {
      ownerEmail: owner?.email ?? "",
      you: req.user!.email,
      /** Partage, droits et édition concurrente : non disponibles (Lot 4) ; l'écran le dit au lieu de le simuler. */
      sharing: {
        available: false,
        reason: "Le partage du projet (lecture, commentaires, édition) n'est pas encore disponible : un seul propriétaire par projet, chaque requête vérifie la propriété côté serveur.",
      },
    },
    sync: {
      modelRevision: project.modelRevision,
      nativeKeys: store.length,
      lastModelWrite: lastWrite,
      /** File locale de l'Atelier (IndexedDB), file des saisies / arbitrages / commentaires (cache persistant) et cache de lecture : disponibles. */
      offline: {
        available: true,
        reason:
          "Les écritures de l'Atelier sont enregistrées localement (IndexedDB) avec leur révision, puis synchronisées au retour du réseau (409 en cas de conflit, copie de secours conservée) ; les saisies, arbitrages et commentaires faits sans réseau attendent sur l'appareil, même après rechargement, et sont rejoués avec la valeur ou la version lue (refus 409 si le serveur a avancé, jamais écrasé) ; les pages déjà lues se relisent sans réseau. Les autres actions (programme, liaisons, sources…) exigent le réseau.",
      },
    },
    journal: await revisionJournal(project),
    comments: comments.map((c) => commentView(c, req.user!.id)),
  });
});

collaborationRouter.get("/comments", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const step = typeof req.query["step"] === "string" ? Number(req.query["step"]) : null;
  const where = step !== null && Number.isInteger(step) ? and(eq(projectComments.projectId, project.id), eq(projectComments.stepNumber, step)) : eq(projectComments.projectId, project.id);
  const rows = await db.select().from(projectComments).where(where).orderBy(asc(projectComments.createdAt));
  res.json(rows.map((c) => commentView(c, req.user!.id)));
});

const commentSchema = z.object({ body: z.string().trim().min(1, "Commentaire vide").max(4000), stepNumber: z.number().int().min(1).max(21).nullable().optional() });

collaborationRouter.post("/comments", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const [created] = await db
    .insert(projectComments)
    .values({ id: newId("com"), projectId: project.id, stepNumber: parsed.data.stepNumber ?? null, authorId: req.user!.id, authorEmail: req.user!.email, body: parsed.data.body })
    .returning();
  res.status(201).json(commentView(created!, req.user!.id));
});

collaborationRouter.delete("/comments/:commentId", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const id = req.params["commentId"] as string;
  const [existing] = await db
    .select()
    .from(projectComments)
    .where(and(eq(projectComments.projectId, project.id), eq(projectComments.id, id)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.authorId !== req.user!.id) {
    res.status(403).json({ error: "forbidden", message: "Seul l'auteur peut supprimer son commentaire." });
    return;
  }
  await db.delete(projectComments).where(eq(projectComments.id, id));
  res.status(204).end();
});
