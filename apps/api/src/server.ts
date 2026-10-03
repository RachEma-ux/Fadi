import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { pool } from "./db/client.js";
import { rattraperBoiteDeSortie } from "./lib/atelier-events.js";

const port = Number(process.env["PORT"] ?? 3001);

/**
 * `MIGRATE_ON_START=1` (conteneur, hébergement durable) : le schéma idempotent (`db/init.sql`, CREATE … IF NOT EXISTS /
 * ADD COLUMN IF NOT EXISTS) est appliqué avant d'écouter — la même chose que `npm run db:migrate`, sans outil de
 * développement dans l'image.
 */
async function migrateOnStart(): Promise<void> {
  if (process.env["MIGRATE_ON_START"] !== "1") return;
  const sql = readFileSync(fileURLToPath(new URL("./db/init.sql", import.meta.url)), "utf8");
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log("Schema applied (init.sql).");
}

migrateOnStart()
  .then(() => {
    const app = createApp();
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Fadi API listening on :${port}${process.env["WEB_DIST"] ? " (sert aussi l'application)" : ""}`);
      // Événements du nouvel Atelier restés non traités (arrêt pendant un traitement, échec) : rattrapés au démarrage.
      rattraperBoiteDeSortie();
    });
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: (err as Error).message }));
    process.exit(1);
  });
