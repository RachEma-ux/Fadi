import "dotenv/config";
import { Pool } from "pg";
import { statistiquesVerrou } from "../lib/atelier-mesures-stats.js";

/**
 * Rapport de la mesure du verrou de projet de l'Atelier (BD-9), en lecture seule :
 *   node apps/api/dist/atelier-mesures.js [jours=28] [seuil_ms=250]
 * Par nature d'écriture : nombre, médiane, 95ᵉ centile et maximum de la tenue du verrou, 95ᵉ centile de l'attente, part
 * des écritures au-delà du seuil. Critère proposé au maître d'ouvrage : modifier l'Atelier seulement si plus de 5 % des
 * écritures tiennent le verrou plus de 250 ms. Rôle de lecture suffisant (DATABASE_URL de l'application ou fadi_backup).
 */
async function main(): Promise<void> {
  const jours = Math.max(1, Math.min(365, Number(process.argv[2] ?? 28) || 28));
  const seuil = Math.max(1, Number(process.argv[3] ?? 250) || 250);
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString, max: 1, application_name: "fadi-atelier-mesures" });
  try {
    const { rows } = await pool.query<{ nature: string; attente_ms: number; tenue_ms: number }>(
      "SELECT nature, attente_ms, tenue_ms FROM admin.atelier_mesures_verrou WHERE mesure_le > now() - make_interval(days => $1)", [jours]);
    const stats = statistiquesVerrou(rows, seuil);
    // eslint-disable-next-line no-console
    console.log(`Verrou de projet de l'Atelier — ${jours} derniers jours, seuil ${seuil} ms : ${rows.length} écriture(s) mesurée(s).`);
    for (const s of stats) {
      // eslint-disable-next-line no-console
      console.log(`${s.nature.padEnd(18)} n=${String(s.n).padStart(6)}  tenue médiane ${s.tenueMedianeMs} ms · p95 ${s.tenueP95Ms} ms · max ${s.tenueMaxMs} ms  attente p95 ${s.attenteP95Ms} ms  au-delà du seuil ${(s.partAuDelaDuSeuil * 100).toFixed(1)} %`);
    }
    const total = rows.length;
    const au = rows.filter((r) => r.tenue_ms > seuil).length;
    // eslint-disable-next-line no-console
    console.log(total ? `Ensemble : ${(au / total * 100).toFixed(1)} % des écritures au-delà de ${seuil} ms (critère proposé : 5 %) → ${au / total > 0.05 ? "gêne mesurée" : "pas de gêne mesurée"}.` : "Aucune mesure : non évalué.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error((err as Error).message);
    process.exit(1);
  });
}
