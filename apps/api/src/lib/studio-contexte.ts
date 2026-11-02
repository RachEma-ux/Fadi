/**
 * Contrat de rattachement d'une étude à son projet (IF-001) : entrée = projet autorisé (droits vérifiés par la
 * création), site / sources / version, acteur ; sortie = contexte d'étude validé et identifiant stable de l'étude.
 *
 * Contrat physique choisi (lot CMD) : `contexte` facultatif du corps de `POST /projects/:p/studio/studies`,
 * `{ version: "studio-contexte-etude/1", site: { parcelles: [{ id, revision }] }, sources: [{ type: "piece-etape", id }] }`.
 * - une parcelle ou une pièce d'étape absente du projet → 409 `source_indisponible` (liste des manquantes) ;
 * - une parcelle dont la révision déclarée n'est pas la révision courante → 409 `conflit_version` (déclarée / courante) ;
 * - projet inaccessible (404) et droits insuffisants (403) : refus communs de la création.
 * Le contrôle est fait sous le verrou du projet, AVANT toute insertion : un refus ne laisse aucune création partielle.
 * Le contexte validé (révisions résolues, nom et étape des sources) est enregistré avec l'étude (`studio_study_contexts`).
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { parcels, stepFiles, studioStudyContexts } from "../db/schema.js";
import { StudioRequestError } from "./studio-commands.js";
import type { Querier } from "./step-rows.js";

export const STUDIO_CONTEXTE_VERSION = "studio-contexte-etude/1";
const id = z.string().min(1).max(128);
export const studioContexteSchema = z.object({
  version: z.literal(STUDIO_CONTEXTE_VERSION),
  site: z.object({ parcelles: z.array(z.object({ id, revision: z.number().int().min(0) }).strict()).max(200) }).strict(),
  sources: z.array(z.object({ type: z.literal("piece-etape"), id }).strict()).max(200),
}).strict();
export type StudioContexteDeclare = z.infer<typeof studioContexteSchema>;

export interface StudioContexteValide {
  version: typeof STUDIO_CONTEXTE_VERSION;
  site: { parcelles: { id: string; revision: number; numero: number; nom: string }[] };
  sources: { type: "piece-etape"; id: string; etape: number; nom: string }[];
}

/** Résout le contexte déclaré dans le projet ; lève 409 `source_indisponible` ou `conflit_version`, sinon le rend validé. */
export async function validerContexteEtude(q: Querier, projectId: string, c: StudioContexteDeclare): Promise<StudioContexteValide> {
  const idsParcelles = [...new Set(c.site.parcelles.map((p) => p.id))];
  const idsSources = [...new Set(c.sources.map((s) => s.id))];
  const lignesParcelles = idsParcelles.length ? await q.select({ id: parcels.id, revision: parcels.revision, number: parcels.number, name: parcels.name }).from(parcels)
    .where(and(eq(parcels.projectId, projectId), inArray(parcels.id, idsParcelles))) : [];
  const lignesSources = idsSources.length ? await q.select({ id: stepFiles.id, stepNumber: stepFiles.stepNumber, name: stepFiles.name }).from(stepFiles)
    .where(and(eq(stepFiles.projectId, projectId), inArray(stepFiles.id, idsSources))) : [];
  const parcellesConnues = new Map(lignesParcelles.map((p) => [p.id, p]));
  const sourcesConnues = new Map(lignesSources.map((s) => [s.id, s]));
  const manquantes = [
    ...idsParcelles.filter((x) => !parcellesConnues.has(x)).map((x) => ({ type: "parcelle", id: x })),
    ...idsSources.filter((x) => !sourcesConnues.has(x)).map((x) => ({ type: "piece-etape", id: x })),
  ];
  if (manquantes.length) throw new StudioRequestError(409, { error: "source_indisponible", manquantes, message: "Source non disponible dans ce projet : aucune étude n’a été créée." });
  const conflits = c.site.parcelles.filter((p) => parcellesConnues.get(p.id)!.revision !== p.revision)
    .map((p) => ({ type: "parcelle", id: p.id, declaree: p.revision, courante: parcellesConnues.get(p.id)!.revision }));
  if (conflits.length) throw new StudioRequestError(409, { error: "conflit_version", conflits, message: "Conflit de version : une source a changé depuis sa lecture ; aucune étude n’a été créée." });
  return {
    version: STUDIO_CONTEXTE_VERSION,
    site: { parcelles: c.site.parcelles.map((p) => { const l = parcellesConnues.get(p.id)!; return { id: p.id, revision: l.revision, numero: l.number, nom: l.name }; }) },
    sources: c.sources.map((s) => { const l = sourcesConnues.get(s.id)!; return { type: "piece-etape" as const, id: s.id, etape: l.stepNumber, nom: l.name }; }),
  };
}

export async function lireContexteEtude(q: Querier, studyId: string): Promise<(StudioContexteValide & { validePar: string; valideLe: string }) | null> {
  const [r] = await q.select().from(studioStudyContexts).where(eq(studioStudyContexts.studyId, studyId)).limit(1);
  return r ? { ...(r.context as unknown as StudioContexteValide), validePar: r.validatedBy, valideLe: r.validatedAt.toISOString() } : null;
}
