/**
 * Module Collaboration — monté sous `/projects/:projectId/collaboration` :
 *   GET    /                   → accès (propriétaire, votre rôle, membres), état de synchronisation, journal des révisions, commentaires
 *   GET    /comments[?step=N]  → commentaires du projet (ou d'une étape)
 *   POST   /comments           → { body, stepNumber?, parentId?, audience? } : nouveau commentaire (ou réponse en fil) de l'utilisateur connecté
 *   PATCH  /comments/:id       → { audience } : audience du fil, par son auteur ou le propriétaire (journalisé)
 *   DELETE /comments/:id       → suppression par son auteur seulement
 *
 * Audience (écart E1, `lib/audience.ts`) : un commentaire `equipe` (défaut d'un nouveau commentaire) n'est lu que par le
 * propriétaire et les éditeurs ; `projet` (« Visible par les lecteurs ») par tous les membres. Le serveur filtre chaque
 * lecture — liste, fil d'une étape ou d'une révision, réponse, journal des révisions, notifications : un lecteur ne reçoit
 * jamais un commentaire réservé à l'équipe, pas même son existence.
 *
 * Le journal des révisions n'invente rien : il relit les dates portées par
 * les données elles-mêmes (arbitrages Harmonie et leurs historiques,
 * actualisations, variantes de programme, transferts, revues de conception,
 * écritures du modèle natif et des parcelles, productions de documents,
 * commentaires). Le partage (membres et rôles) est dans `members.ts` ; tout
 * membre peut commenter, un lecteur ne peut rien modifier d'autre.
 */
import { Router, type Response } from "express";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PARCOURS_STEPS } from "../data/parcours.js";
import { db } from "../db/client.js";
import { atelierCommands, parcels, producedDocuments, programmeCases, projectComments, projectMembers, users } from "../db/schema.js";
import { audit, clientIp } from "../lib/audit.js";
import { AudienceError, audienceChangeRefusal, audienceOfNew, audienceSchema, seesTeam } from "../lib/audience.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { activeLock, projectOr404, type OwnedProject, type ProjectRole } from "../lib/owned-project.js";
import { loadStepRows } from "../lib/step-rows.js";
import { listMembers, ownerEmailOf } from "./members.js";
import { contentOf } from "../lib/step-context.js";
import { HISTORY_COMMAND_LIMIT, HISTORY_LIMIT, historyEvent, latestHistory, type RevisionEvent } from "../lib/history.js";

export const collaborationRouter = Router({ mergeParams: true });
collaborationRouter.use(requireAuth);

export type { RevisionEvent } from "../lib/history.js";

const STATUS_LABEL: Record<string, string> = {
  proposed: "proposée",
  retained: "retenue",
  adapted: "adaptée et retenue",
  dismissed: "écartée avec motif",
  translated: "traduite au programme",
  drawn: "dessinée",
  verified: "vérifiée",
};

/** Commentaires du projet lisibles par ce rôle (E1) : l'équipe lit tout, les autres l'audience `projet` seulement. */
export function visibleComments(projectId: string, role: ProjectRole, extra?: SQL): SQL {
  const audience = seesTeam(role) ? undefined : eq(projectComments.audience, "projet");
  return and(eq(projectComments.projectId, projectId), audience, extra)!;
}

/** Le journal des révisions du projet, relu depuis les dates que les données portent (commentaires filtrés par audience). */
export async function revisionJournalSnapshot(project: OwnedProject) {
  const events: RevisionEvent[] = [];
  const pad2 = (n: number) => String(n).padStart(2, "0");
  events.push({
    at: project.createdAt.toISOString(),
    kind: "projet",
    label: project.sourceExampleId ? `Projet créé depuis l'exemple ${project.sourceExampleId}${project.exampleMode === "editable" ? " (copie de travail)" : ""}` : "Projet créé",
    detail: `${project.code} — ${project.name}`,
    stepNumber: null,
    revision: null,
    id: "created",
    source: "record",
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

  const cases = await db.select().from(programmeCases).where(eq(programmeCases.projectId, project.id)).orderBy(desc(programmeCases.createdAt), desc(programmeCases.revision)).limit(HISTORY_LIMIT + 1);
  for (const row of cases.slice(0, HISTORY_LIMIT)) {
    const a = row.data as { title?: string; scenarioLabel?: string; revision?: number; spaces?: unknown[] };
    events.push({
      at: row.createdAt.toISOString(),
      kind: "programme",
      label: `Programme · révision ${a.revision ?? row.revision}`,
      detail: `${a.title ?? row.caseId} · ${a.scenarioLabel ?? row.scenarioId} · ${Array.isArray(a.spaces) ? a.spaces.length : 0} fiches`,
      stepNumber: 7,
      revision: a.revision ?? row.revision,
      id: `programme:${row.revision}`,
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
        label: "Revue de conception conservée",
        detail: `${r.name ?? "Revue"} · modèle ${r.modelSignature ?? "?"}`,
        stepNumber: 10,
        revision: null,
      });
  }

  // Journal des commandes de l'Atelier : chaque lot validé est une entrée de l'historique (50 dernières).
  const journal = await db.select({ id: atelierCommands.id, label: atelierCommands.label, kind: atelierCommands.kind, resultRevision: atelierCommands.resultRevision, createdAt: atelierCommands.createdAt, authorId: atelierCommands.authorId, authorLabel: users.email }).from(atelierCommands).leftJoin(users, eq(users.id, atelierCommands.authorId)).where(eq(atelierCommands.projectId, project.id)).orderBy(desc(atelierCommands.resultRevision)).limit(HISTORY_COMMAND_LIMIT + 1);
  for (const r of journal.slice(0, HISTORY_COMMAND_LIMIT)) {
    const verbe = r.kind === "annulation" ? "Annulé" : r.kind === "retablissement" ? "Rétabli" : "Modèle";
    events.push({ id: `atelier:${r.id}`, at: r.createdAt.toISOString(), kind: "modele", label: `${verbe} · ${r.label || "lot de commandes"}`, detail: `Atelier · révision ${r.resultRevision}`, stepNumber: 10, revision: r.resultRevision, authorId: r.authorId, authorLabel: r.authorLabel, source: "ledger" });
  }
  const parcelRows = await db.select({ id: parcels.id, name: parcels.name, revision: parcels.revision, updatedAt: parcels.updatedAt }).from(parcels).where(eq(parcels.projectId, project.id)).orderBy(desc(parcels.updatedAt), asc(parcels.id)).limit(HISTORY_LIMIT + 1);
  for (const p of parcelRows.slice(0, HISTORY_LIMIT))
    events.push({ id: `parcelle:${p.id}:${p.revision}`, at: p.updatedAt.toISOString(), kind: "parcelle", label: `Parcelle · ${p.name}`, detail: `Fichier ${p.id} · révision ${p.revision}`, stepNumber: 1, revision: p.revision });

  const docs = await db.select().from(producedDocuments).where(eq(producedDocuments.projectId, project.id)).orderBy(desc(producedDocuments.producedAt), asc(producedDocuments.kind)).limit(HISTORY_LIMIT + 1);
  for (const d of docs.slice(0, HISTORY_LIMIT))
    events.push({
      at: d.producedAt.toISOString(),
      kind: "document",
      label: `Document produit · ${d.label}`,
      detail: `${d.fileName} · révision du modèle ${d.modelRevision} · ${d.count} production(s)`,
      stepNumber: d.stepNumber,
      revision: d.modelRevision,
      id: `document:${d.kind}:${d.producedAt.toISOString()}`,
    });

  // Collectes et observations du contexte (flow-v62 : `log(p,'MapTiler',…)`, `site-note`) : datées par les données déclarées elles-mêmes.
  const siteElevation = (project.siteObservations as { elevation?: { at?: string; points?: unknown[]; range?: number } | null } | null)?.elevation ?? null;
  if (siteElevation?.at)
    events.push({
      at: siteElevation.at,
      kind: "maptiler",
      label: "Altimétrie du site collectée (service MapTiler)",
      detail: `${Array.isArray(siteElevation.points) ? siteElevation.points.length : 0} point(s) de modèle de terrain · amplitude ${Number(siteElevation.range ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m · non relevé topographique`,
      stepNumber: 1,
      revision: null,
    });
  const siteContext = (project.siteContext ?? null) as { elevation?: { at?: string; value?: number } | null; observedAt?: string | null; observationStatus?: string } | null;
  if (siteContext?.elevation?.at)
    events.push({
      at: siteContext.elevation.at,
      kind: "maptiler",
      label: "Altitude indicative du centre collectée (service MapTiler)",
      detail: `${Number(siteContext.elevation.value ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m · service numérique, non relevé topographique`,
      stepNumber: 10,
      revision: null,
    });
  if (siteContext?.observedAt)
    events.push({
      at: siteContext.observedAt,
      kind: "revue",
      label: "Observation déclarée du contexte extérieur",
      detail: siteContext.observationStatus ?? "Déclaration utilisateur, non contrôle indépendant",
      stepNumber: 10,
      revision: null,
    });

  const comments = await db.select().from(projectComments).where(visibleComments(project.id, project.role)).orderBy(desc(projectComments.createdAt), asc(projectComments.id)).limit(HISTORY_LIMIT + 1);
  for (const c of comments.slice(0, HISTORY_LIMIT))
    events.push({
      at: c.createdAt.toISOString(),
      kind: "commentaire",
      label: `Commentaire · ${c.authorEmail}`,
      detail: c.body,
      stepNumber: c.stepNumber,
      revision: c.atelierRevision,
      id: `commentaire:${c.id}`,
      authorId: c.authorId,
      authorLabel: c.authorEmail,
      source: "record",
    });

  const normalized = events.flatMap((event) => {
    const normalizedEvent = historyEvent(event, project);
    return normalizedEvent ? [normalizedEvent] : [];
  });
  const latest = latestHistory(normalized);
  return {
    ...latest,
    truncated: latest.truncated || journal.length > HISTORY_COMMAND_LIMIT || [cases, parcelRows, docs, comments].some((rows) => rows.length > HISTORY_LIMIT),
    omittedInvalidDates: events.length - normalized.length,
  };
}

/** Contrat historique conservé pour les modules Collaboration et Transmission. */
export async function revisionJournal(project: OwnedProject): Promise<RevisionEvent[]> {
  return (await revisionJournalSnapshot(project)).events;
}

function commentView(c: typeof projectComments.$inferSelect, userId: string) {
  return { id: c.id, stepNumber: c.stepNumber, parentId: c.parentId ?? null, atelierRevision: c.atelierRevision ?? null, authorEmail: c.authorEmail, body: c.body, audience: c.audience, createdAt: c.createdAt.toISOString(), mine: c.authorId === userId };
}

const audienceRefusal = (res: Response, e: AudienceError) => void res.status(e.status).json(e.body);

collaborationRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const [dernier] = await db.select({ createdAt: atelierCommands.createdAt }).from(atelierCommands).where(eq(atelierCommands.projectId, project.id)).orderBy(desc(atelierCommands.resultRevision)).limit(1);
  const [{ n: entreesJournal } = { n: 0 }] = await db.select({ n: count() }).from(atelierCommands).where(eq(atelierCommands.projectId, project.id));
  const lastWrite = dernier ? dernier.createdAt.toISOString() : null;
  const comments = await db.select().from(projectComments).where(visibleComments(project.id, project.role)).orderBy(desc(projectComments.createdAt));
  res.json({
    access: {
      ownerEmail: await ownerEmailOf(project.ownerId),
      you: req.user!.email,
      /** Votre rôle sur ce projet, vérifié par le serveur à chaque requête. */
      role: project.role,
      /** Vous pouvez exporter (propriétaire, éditeur, ou lecteur à qui le propriétaire l'a accordé — E2). */
      canExport: project.canExport,
      members: await listMembers(project.id),
      /** Réservation d'édition en cours (verrou optionnel), null si libre. */
      lock: activeLock(project),
      /** Partage par le propriétaire (lecteur : lit et commente ; éditeur : modifie) ; verrou d'édition optionnel (« un seul éditeur actif »), sinon contrôle de version (409). */
      sharing: {
        available: true,
        reason:
          "Le propriétaire invite des comptes existants par leur adresse : un lecteur lit le dossier et les commentaires visibles par les lecteurs, et commente ; il n'exporte que si le propriétaire le lui accorde ; un éditeur modifie aussi (saisies, arbitrages, programme, Atelier, sources). Les droits sont vérifiés par le serveur à chaque requête. Un éditeur peut réserver l'édition (30 minutes, prolongeables) : les autres lisent et commentent jusqu'à ce qu'il rende la main ; sans réservation, les écritures simultanées sont sérialisées puis départagées par le contrôle de version (409).",
      },
    },
    sync: {
      modelRevision: project.modelRevision,
      journalEntries: entreesJournal,
      lastModelWrite: lastWrite,
      /** File locale de l'Atelier (IndexedDB), file des saisies / arbitrages / commentaires (cache persistant) et cache de lecture : disponibles. */
      offline: {
        available: true,
        reason:
          "Les modifications de l'Atelier sont enregistrées localement (IndexedDB) par lot de commandes avec la révision lue, puis envoyées dans l'ordre au retour du réseau (409 : rejeu sur la version serveur, ou brouillon « conflit » à trancher, jamais fusionné) ; les saisies, arbitrages et commentaires faits sans réseau attendent sur l'appareil, même après rechargement, et sont rejoués avec la valeur ou la version lue (refus 409 si le serveur a avancé, jamais écrasé) ; les pages déjà lues se relisent sans réseau. Les autres actions (programme, liaisons, sources…) exigent le réseau.",
      },
    },
    journal: await revisionJournal(project),
    comments: comments.map((c) => commentView(c, req.user!.id)),
  });
});

collaborationRouter.get("/comments", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const step = typeof req.query["step"] === "string" ? Number(req.query["step"]) : null;
  // Fil d'une entrée du journal de l'Atelier (D-055) : `?revision=` (révision résultante de l'entrée).
  const revision = typeof req.query["revision"] === "string" ? Number(req.query["revision"]) : null;
  const where =
    revision !== null && Number.isInteger(revision)
      ? visibleComments(project.id, project.role, eq(projectComments.atelierRevision, revision))
      : step !== null && Number.isInteger(step)
        ? visibleComments(project.id, project.role, eq(projectComments.stepNumber, step))
        : visibleComments(project.id, project.role);
  const rows = await db.select().from(projectComments).where(where).orderBy(asc(projectComments.createdAt));
  res.json(rows.map((c) => commentView(c, req.user!.id)));
});

const commentSchema = z.object({
  body: z.string().trim().min(1, "Commentaire vide").max(4000),
  stepNumber: z.number().int().min(1).max(21).nullable().optional(),
  /** Réponse en fil : le commentaire auquel on répond (même projet) ; l'étape de la réponse est celle du commentaire parent. */
  parentId: z.string().min(1).max(64).nullable().optional(),
  /** Entrée du journal de l'Atelier commentée (D-055) : sa révision résultante ; elle doit exister. */
  atelierRevision: z.number().int().min(1).nullable().optional(),
  /** Audience (E1) : `equipe` par défaut, `projet` = « Visible par les lecteurs » ; une réponse suit son fil. */
  audience: audienceSchema.optional(),
});

collaborationRouter.post("/comments", async (req, res) => {
  const project = await projectOr404(req, res, "comment");
  if (!project) return;
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  let stepNumber = parsed.data.stepNumber ?? null;
  let atelierRevision = parsed.data.atelierRevision ?? null;
  if (atelierRevision !== null) {
    const [entree] = await db.select({ id: atelierCommands.id }).from(atelierCommands).where(and(eq(atelierCommands.projectId, project.id), eq(atelierCommands.resultRevision, atelierRevision))).limit(1);
    if (!entree) {
      res.status(404).json({ error: "not_found", message: `Aucune entrée du journal de l'Atelier à la révision ${atelierRevision}.` });
      return;
    }
    stepNumber = null;
  }
  let parentId: string | null = null;
  let threadAudience: typeof projectComments.$inferSelect.audience | undefined;
  if (parsed.data.parentId) {
    // Un fil réservé à l'équipe n'existe pas pour un lecteur : même 404 qu'un commentaire supprimé.
    const [parent] = await db
      .select({ id: projectComments.id, stepNumber: projectComments.stepNumber, parentId: projectComments.parentId, atelierRevision: projectComments.atelierRevision, audience: projectComments.audience })
      .from(projectComments)
      .where(visibleComments(project.id, project.role, eq(projectComments.id, parsed.data.parentId)))
      .limit(1);
    if (!parent) {
      res.status(404).json({ error: "not_found", message: "Le commentaire auquel vous répondez n'existe plus." });
      return;
    }
    // Un seul niveau de fil (comme un fil de discussion lisible) : répondre à une réponse rattache au commentaire d'origine.
    parentId = parent.parentId ?? parent.id;
    stepNumber = parent.stepNumber;
    atelierRevision = parent.atelierRevision ?? null;
    threadAudience = parent.audience;
  }
  let audience;
  try {
    audience = audienceOfNew(project.role, parsed.data.audience, threadAudience);
  } catch (e) {
    if (e instanceof AudienceError) return audienceRefusal(res, e);
    throw e;
  }
  const [created] = await db
    .insert(projectComments)
    .values({ id: newId("com"), projectId: project.id, stepNumber, parentId, atelierRevision, authorId: req.user!.id, authorEmail: req.user!.email, body: parsed.data.body, audience })
    .returning();
  res.status(201).json(commentView(created!, req.user!.id));
});

const audienceBody = z.object({ audience: audienceSchema }).strict();

/**
 * Audience d'un fil (E1) : le commentaire d'origine et ses réponses ensemble, par son auteur ou le propriétaire (tous
 * deux de l'équipe), journalisée dans la même transaction (`comment.audience_changed`). Une réponse ne change pas seule.
 */
collaborationRouter.patch("/comments/:commentId", async (req, res) => {
  const project = await projectOr404(req, res, "comment");
  if (!project) return;
  const parsed = audienceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const id = req.params["commentId"] as string;
  const next = parsed.data.audience;
  const outcome = await db.transaction(async (tx) => {
    const [root] = await tx.select().from(projectComments).where(visibleComments(project.id, project.role, eq(projectComments.id, id))).limit(1).for("update");
    if (!root) return { status: 404, body: { error: "not_found" } };
    if (root.parentId) return { status: 422, body: { error: "audience_du_fil", message: "Une réponse suit l'audience de son fil : changez celle du commentaire d'origine." } };
    const thread = await tx.select({ authorId: projectComments.authorId }).from(projectComments).where(and(eq(projectComments.projectId, project.id), eq(projectComments.parentId, root.id)));
    const authors = [...new Set([root.authorId, ...thread.map((t) => t.authorId)])];
    const readers = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.role, "lecteur"), inArray(projectMembers.userId, authors)));
    const refusal = audienceChangeRefusal({ role: project.role, isAuthor: root.authorId === req.user!.id }, next, readers.length > 0);
    if (refusal) return { status: refusal.status, body: refusal.body };
    if (root.audience !== next) {
      await tx.update(projectComments).set({ audience: next }).where(and(eq(projectComments.projectId, project.id), eq(projectComments.id, root.id)));
      await tx.update(projectComments).set({ audience: next }).where(and(eq(projectComments.projectId, project.id), eq(projectComments.parentId, root.id)));
      await audit(tx, { actorId: req.user!.id, action: "comment.audience_changed", target: { type: "project", id: project.id }, metadata: { commentId: root.id, module: "collaboration", audienceBefore: root.audience, audienceAfter: next, replies: thread.length }, ip: clientIp(req) });
    }
    return { status: 200, body: commentView({ ...root, audience: next }, req.user!.id) };
  });
  res.status(outcome.status).json(outcome.body);
});

collaborationRouter.delete("/comments/:commentId", async (req, res) => {
  const project = await projectOr404(req, res, "comment");
  if (!project) return;
  const id = req.params["commentId"] as string;
  const [existing] = await db
    .select()
    .from(projectComments)
    .where(visibleComments(project.id, project.role, eq(projectComments.id, id)))
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
