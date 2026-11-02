/**
 * Bascule Atelier → Studio d'un projet (MIG-COEX-06) : une seule chaîne d'écriture à la fois, consultation historique
 * maintenue, retour arrière prévu. Le propriétaire seul passe d'un état à l'autre, sous le verrou du projet (sérialisé
 * avec les lots de commandes des deux chaînes, qui prennent le même verrou) :
 *
 * - `preparer { studyId }` : l'étude Studio qui reçoit le modèle est désignée ; l'Atelier garde l'autorité d'écriture,
 *   l'étude ne peut pas écrire (409 `chemin_ecriture`) ;
 * - `basculer` : l'autorité passe à Studio ; le point de retour (révision du modèle Atelier, têtes des variantes de
 *   l'étude) est figé ; l'Atelier refuse toute écriture de commandes et reste lisible ;
 * - `retour-arriere` : l'autorité revient à l'Atelier (révisions Studio conservées, append-only) ; l'étude redevient
 *   lecture seule.
 *
 * Le refus est porté par l'orchestrateur commun des commandes (`atelier-validation.ts`, `cheminEcriture`). La bascule
 * réelle d'un projet réel reste un acte de production du maître d'ouvrage : ce module en fournit le mécanisme.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects, studioBascules, studioVariants, type StudioAutoriteEcriture, type StudioPassageBascule } from "../db/schema.js";
import { loadProjectAccess } from "./owned-project.js";
import { assertAccess, lockedAccess, StudioRequestError, studyOf } from "./studio-commands.js";

export interface StudioBasculeLue {
  projectId: string;
  studyId: string;
  autorite: StudioAutoriteEcriture;
  pointRetour: unknown;
  historique: StudioPassageBascule[];
  /** Chaînes qui écrivent (toujours une seule) et qui restent lisibles (toujours les deux). */
  ecriture: StudioAutoriteEcriture[];
  lecture: StudioAutoriteEcriture[];
}

const versBascule = (b: typeof studioBascules.$inferSelect): StudioBasculeLue => ({
  projectId: b.projectId, studyId: b.studyId, autorite: b.authority, pointRetour: b.rollbackPoint ?? null, historique: b.history,
  ecriture: [b.authority], lecture: ["atelier", "studio"],
});

export async function lireBascule(projectId: string, actorId: string): Promise<StudioBasculeLue | null> {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const [b] = await db.select().from(studioBascules).where(eq(studioBascules.projectId, projectId)).limit(1);
  return b ? versBascule(b) : null;
}

export type StudioActionBascule = "preparer" | "basculer" | "retour-arriere";

export async function passerBascule(projectId: string, actorId: string, action: StudioActionBascule, studyId?: string): Promise<StudioBasculeLue> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    assertAccess(access, actorId, "owner");
    assertAccess(access, actorId, "write");
    const [b] = await tx.select().from(studioBascules).where(eq(studioBascules.projectId, projectId)).limit(1);
    const le = new Date();
    if (action === "preparer") {
      if (b) throw new StudioRequestError(409, { error: "bascule_existante", autorite: b.authority, studyId: b.studyId, message: "Une bascule est déjà préparée pour ce projet." });
      if (!studyId) throw new StudioRequestError(400, { error: "invalid_input", message: "studyId attendu." });
      const study = await studyOf(tx, projectId, studyId);
      const passage: StudioPassageBascule = { autorite: "atelier", action, par: actorId, le: le.toISOString(), pointRetour: null };
      const [r] = await tx.insert(studioBascules).values({ projectId, studyId: study.id, authority: "atelier", rollbackPoint: null, history: [passage], updatedBy: actorId, updatedAt: le }).returning();
      return versBascule(r!);
    }
    if (!b) throw new StudioRequestError(409, { error: "bascule_absente", message: "Aucune bascule préparée pour ce projet." });
    const attendue: StudioAutoriteEcriture = action === "basculer" ? "atelier" : "studio";
    if (b.authority !== attendue) throw new StudioRequestError(409, { error: "bascule_etat", autorite: b.authority, message: `« ${action} » impossible : l’autorité est déjà « ${b.authority} ».` });
    const [p] = await tx.select({ modelRevision: projects.modelRevision }).from(projects).where(eq(projects.id, projectId)).limit(1);
    const tetes = (await tx.select({ variantId: studioVariants.id, headRevisionId: studioVariants.headRevisionId }).from(studioVariants).where(eq(studioVariants.studyId, b.studyId)))
      .sort((x, y) => x.variantId.localeCompare(y.variantId));
    const pointRetour = { atelierModelRevision: p?.modelRevision ?? null, studio: tetes };
    const autorite: StudioAutoriteEcriture = action === "basculer" ? "studio" : "atelier";
    const passage: StudioPassageBascule = { autorite, action, par: actorId, le: le.toISOString(), pointRetour };
    const [r] = await tx.update(studioBascules).set({ authority: autorite, rollbackPoint: pointRetour, history: [...b.history, passage], updatedBy: actorId, updatedAt: le })
      .where(eq(studioBascules.projectId, projectId)).returning();
    return versBascule(r!);
  });
}
