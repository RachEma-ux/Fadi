/**
 * Maintenance des comptes (D-5) : anonymise les comptes dont la suppression a été demandée il y a 30 jours ou plus
 * (la même tâche tourne chaque heure dans le processus API, `lib/account-jobs.ts`), puis efface les contacts sans compte
 * dont tous les projets sont clos depuis 2 ans (Issue #262, OP-2 : `contacts.erased`).
 *   npm run db:account-jobs                              → exécute la tâche, affiche le bilan (JSON)
 *   npm run db:account-jobs -- --now=2026-12-01T00:00:00Z → horloge simulée (recette)
 */
import "dotenv/config";
import { pool } from "./client.js";
import { runDeletionJob } from "../lib/account-jobs.js";
import { runContactRetentionJob } from "../lib/participants-db.js";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--now="));
  const now = arg ? new Date(arg.slice(6)) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now invalide");
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ...(await runDeletionJob(now)), contacts: await runContactRetentionJob(now) }));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error((err as Error).message);
  process.exit(1);
});
