/**
 * Partie base de la surveillance d'exploitation (R.5-03, OPS-08, `studio-surveillance.ts`) : état des jobs Studio
 * (`studio_jobs`) et de la file des courriels relu à chaque évaluation, évaluation périodique des règles d'alerte et
 * journal structuré des transitions. Comptages seulement : aucune donnée de projet n'est lue.
 */
import { and, count, eq, gte, min } from "drizzle-orm";
import { db } from "../db/client.js";
import { mailOutbox, studioJobs } from "../db/schema.js";
import type { Querier } from "./step-rows.js";
import { evaluerAlertes, journaliserTransitions, surveillanceStudio, type Observation, type ObservationCourriels, type ObservationJobs } from "./studio-surveillance.js";

/** Fenêtre d'observation des échecs de jobs : choix d'affichage (24 h), pas un seuil. */
export const FENETRE_JOBS_MS = 24 * 3_600_000;
/** Période d'évaluation du journal structuré : choix d'exploitation (1 min), pas un seuil. */
export const PERIODE_SURVEILLANCE_MS = 60_000;

export async function observerJobs(q: Querier, maintenant = new Date()): Promise<ObservationJobs> {
  const depuis = new Date(maintenant.getTime() - FENETRE_JOBS_MS);
  const [enCalcul] = await q.select({ n: count() }).from(studioJobs).where(eq(studioJobs.status, "en-calcul"));
  const [echecs] = await q.select({ n: count() }).from(studioJobs).where(and(eq(studioJobs.status, "echec"), gte(studioJobs.createdAt, depuis)));
  const [total] = await q.select({ n: count() }).from(studioJobs).where(gte(studioJobs.createdAt, depuis));
  return { enCalcul: Number(enCalcul?.n ?? 0), echecsFenetre: Number(echecs?.n ?? 0), totalFenetre: Number(total?.n ?? 0), fenetreMs: FENETRE_JOBS_MS };
}

export async function observerCourriels(q: Querier, maintenant = new Date()): Promise<ObservationCourriels> {
  const [r] = await q.select({ n: count(), plusAncien: min(mailOutbox.createdAt) }).from(mailOutbox).where(eq(mailOutbox.status, "pending"));
  const ancien = r?.plusAncien ? new Date(r.plusAncien as unknown as string) : null;
  return { enAttente: Number(r?.n ?? 0), plusAncienMs: ancien ? Math.max(0, maintenant.getTime() - ancien.getTime()) : null };
}

/** Observation complète : compteurs du processus + base. Une lecture de base en échec laisse « sans donnée ». */
export async function observerSurveillance(q: Querier = db, s = surveillanceStudio): Promise<Observation> {
  const [jobs, courriels] = await Promise.all([observerJobs(q).catch(() => null), observerCourriels(q).catch(() => null)]);
  return s.observer({ jobs, courriels });
}

/** Évaluation périodique et journal des transitions (`studio_alerte` / `studio_alerte_levee`) ; renvoie l'arrêt. */
export function startSurveillance(log: (ligne: string) => void = (l) => console.warn(l), periodeMs = PERIODE_SURVEILLANCE_MS): () => void {
  let actives = new Set<string>();
  let occupe = false;
  const tour = async () => {
    if (occupe) return;
    occupe = true;
    try { actives = journaliserTransitions(evaluerAlertes(await observerSurveillance()), actives, log); }
    catch (err) { log(JSON.stringify({ level: "error", message: "studio_surveillance", detail: (err as Error).message })); }
    finally { occupe = false; }
  };
  const t = setInterval(() => void tour(), periodeMs);
  t.unref();
  return () => clearInterval(t);
}
