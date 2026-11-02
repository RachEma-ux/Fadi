/**
 * Journal d'accès Studio et sa politique de conservation (TR-EX-046, ADR-STUDIO-PILOTE-01 P-12 ; EX-046 : « les
 * événements sensibles suivent une politique de minimisation et de conservation explicite »).
 *
 * Événements sensibles retenus, sur les routes Studio d'un projet (`/projects/:projectId/studio/…`) :
 *  - `refus` : réponse 401, 403, 404 ou 423 (session absente, rôle insuffisant, ressource non divulguée, verrou) ;
 *  - `export` : sortie de contenu réussie (export SVG / DXF / IFC, rapport, fichier publié, modèle externe reçu).
 * Minimisation : compte (identifiant seulement), projet, méthode, route **générique** (`/studies/:studyId/…`, aucun
 * identifiant d'objet), statut, motif court ; jamais d'adresse IP, de courriel, de corps, de requête ni de géométrie.
 *
 * Conservation : 12 mois par défaut, paramétrable (`STUDIO_ACCESS_RETENTION_MONTHS`, 1 à 120 mois), puis purge par la
 * tâche horaire de l'API (`runStudioAccessRetentionJob`) ; chaque purge qui supprime des lignes est datée dans
 * `studio_access_purges` (date, limite, durée, nombre). Le journal d'audit des publications (`studio_publication_events`)
 * reste immuable : la purge ne le touche jamais.
 *
 * L'écriture est activée par l'application (`activerJournalAccesStudio`, app.ts) ; un routeur monté seul (tests sur base
 * simulée) n'écrit rien. Une écriture qui échoue est signalée dans le journal du processus, jamais à l'utilisateur.
 */
import type { NextFunction, Request, Response } from "express";
import { lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { studioAccessEvents, studioAccessPurges } from "../db/schema.js";
import { newId } from "./ids.js";

export const STUDIO_ACCES_CONSERVATION_MOIS_DEFAUT = 12;
export const STUDIO_ACCES_CONSERVATION_MOIS_MAX = 120;

/** Durée de conservation (mois) : `STUDIO_ACCESS_RETENTION_MONTHS` entier de 1 à 120, sinon 12 (valeur invalide signalée). */
export function conservationJournalAccesStudio(env: Record<string, string | undefined> = process.env): { mois: number; invalide: boolean } {
  const brut = env["STUDIO_ACCESS_RETENTION_MONTHS"];
  if (brut === undefined || brut.trim() === "") return { mois: STUDIO_ACCES_CONSERVATION_MOIS_DEFAUT, invalide: false };
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 1 || n > STUDIO_ACCES_CONSERVATION_MOIS_MAX) return { mois: STUDIO_ACCES_CONSERVATION_MOIS_DEFAUT, invalide: true };
  return { mois: n, invalide: false };
}

/** Limite de conservation : `maintenant` moins `mois` mois civils (UTC ; fin de mois bornée au dernier jour). */
export function limiteConservation(maintenant: Date, mois: number): Date {
  const a = maintenant.getUTCFullYear(), m = maintenant.getUTCMonth() - mois;
  const cible = new Date(Date.UTC(a, m, 1, maintenant.getUTCHours(), maintenant.getUTCMinutes(), maintenant.getUTCSeconds(), maintenant.getUTCMilliseconds()));
  const dernierJour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(maintenant.getUTCDate(), dernierJour));
  return cible;
}

export type GenreEvenementAcces = "refus" | "export";
const REFUS = new Set([401, 403, 404, 423]);
/** Routes génériques qui sortent du contenu (GET réussi). */
const SORTIES = [/\/export$/, /\/export\/rapport$/, /\/files\/:format$/, /\/contenu$/, /\/illustrations\/:illustrationId\/image$/];

/** Genre d'un événement sensible, ou null (événement ordinaire, non journalisé). */
export function genreEvenementAcces(method: string, route: string, status: number): GenreEvenementAcces | null {
  if (REFUS.has(status)) return "refus";
  if (method === "GET" && status >= 200 && status < 300 && SORTIES.some((r) => r.test(route))) return "export";
  return null;
}

/** Route générique : préfixe du projet retiré, chaque valeur de paramètre remplacée par son nom ; requête et fragment exclus. */
export function routeGenerique(cheminComplet: string, params: Record<string, string | undefined>): string {
  let chemin = cheminComplet.split("?")[0]!.split("#")[0]!;
  chemin = chemin.replace(/^\/projects\/[^/]+\/studio/, "");
  const segments = chemin.split("/").map((s) => {
    let d: string;
    try { d = decodeURIComponent(s); } catch { d = s; }
    const nom = Object.entries(params).find(([k, v]) => k !== "projectId" && v !== undefined && v !== "" && v === d)?.[0];
    // Paramètre non encore résolu (refus avant la route, 401) : un identifiant généré n'est jamais recopié.
    return nom ? `:${nom}` : /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(d) ? ":id" : s;
  });
  return (segments.join("/") || "/").slice(0, 300);
}

export interface EvenementAccesStudio {
  actorId: string | null;
  projectId: string;
  method: string;
  route: string;
  status: number;
  kind: GenreEvenementAcces;
  motif: string | null;
}
export type PuitsJournalAcces = (e: EvenementAccesStudio) => Promise<void>;

/** Puits par défaut : une ligne `studio_access_events`. */
export const ecrireEvenementAcces: PuitsJournalAcces = async (e) => {
  await db.insert(studioAccessEvents).values({ id: newId("studio_access"), ...e });
};

let puitsActif: PuitsJournalAcces | null = null;
/** Active l'écriture du journal (application) ; `null` la coupe. */
export function activerJournalAccesStudio(puits: PuitsJournalAcces | null = ecrireEvenementAcces): void {
  puitsActif = puits;
}

/** Intergiciel du routeur Studio : à la fin de la réponse, journalise un événement sensible (minimisé). */
export function journalAccesStudio(puits?: PuitsJournalAcces, log: (ligne: string) => void = (l) => console.error(l)) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on("finish", () => {
      const cible = puits ?? puitsActif;
      if (!cible) return;
      const params = req.params as Record<string, string | undefined>;
      const projectId = params["projectId"] ?? /^\/projects\/([^/?#]+)\/studio/.exec(req.originalUrl)?.[1];
      if (!projectId) return;
      const route = routeGenerique(req.originalUrl, params);
      const kind = genreEvenementAcces(req.method, route, res.statusCode);
      if (!kind) return;
      const motif = kind === "export" ? "export" : ({ 401: "session", 403: "droit", 404: "non-divulgue", 423: "verrou" } as Record<number, string>)[res.statusCode] ?? null;
      const evenement: EvenementAccesStudio = { actorId: req.user?.id ?? null, projectId: decodeURIComponent(projectId), method: req.method, route, status: res.statusCode, kind, motif };
      try {
        cible(evenement).catch((err: unknown) => log(JSON.stringify({ level: "error", message: "studio_access_journal", detail: (err as Error).message })));
      } catch (err) { log(JSON.stringify({ level: "error", message: "studio_access_journal", detail: (err as Error).message })); }
    });
    next();
  };
}

/** Requêteur minimal de la purge (base réelle ou transaction). */
type Requeteur = Pick<typeof db, "delete" | "insert">;

/**
 * Purge datée : supprime les événements antérieurs à la limite de conservation et, s'il y en avait, date la purge dans
 * `studio_access_purges`. Ne touche aucune autre table (le journal des publications reste immuable).
 */
export async function purgerJournalAccesStudio(q: Requeteur, maintenant: Date, mois: number): Promise<{ limite: Date; supprimes: number }> {
  if (!Number.isInteger(mois) || mois < 1 || mois > STUDIO_ACCES_CONSERVATION_MOIS_MAX) throw new Error("studio_access_retention_invalid");
  const limite = limiteConservation(maintenant, mois);
  const supprimes = (await q.delete(studioAccessEvents).where(lt(studioAccessEvents.occurredAt, limite)).returning({ id: studioAccessEvents.id })).length;
  if (supprimes > 0) await q.insert(studioAccessPurges).values({ id: newId("studio_access_purge"), ranAt: maintenant, cutoff: limite, retentionMonths: mois, deleted: supprimes });
  return { limite, supprimes };
}

/** Tâche horaire : purge selon la durée configurée (une durée invalide retombe à 12 mois, signalée). */
export async function runStudioAccessRetentionJob(maintenant = new Date(), env: Record<string, string | undefined> = process.env, log: (ligne: string) => void = (l) => console.log(l)) {
  const { mois, invalide } = conservationJournalAccesStudio(env);
  if (invalide) log(JSON.stringify({ level: "warn", message: "studio_access_retention", detail: "STUDIO_ACCESS_RETENTION_MONTHS invalide : 12 mois appliqués" }));
  return db.transaction((tx) => purgerJournalAccesStudio(tx, maintenant, mois));
}
