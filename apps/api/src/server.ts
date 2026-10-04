import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { pool } from "./db/client.js";
import { basculerAncienMoteur } from "./db/bascule.js";

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
  const b = await basculerAncienMoteur(pool);
  // eslint-disable-next-line no-console
  if (b.supprimees) console.log(`Bascule de l'Atelier : ${b.convertis} projet(s) repris dans le modèle typé.`);
}

migrateOnStart()
  .then(() => {
    const app = createApp();
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Fadi API listening on :${port}${process.env["WEB_DIST"] ? " (sert aussi l'application)" : ""}`);
    });
    // Connexions persistantes gardées plus longtemps que celles des relais et des clients (60 s) : un client qui
    // réutilise une connexion au moment où le serveur la ferme recevrait sinon un ECONNRESET.
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", message: (err as Error).message }));
    process.exit(1);
  });
