import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

async function main() {
  const sqlPath = fileURLToPath(new URL("./init.sql", import.meta.url));
  const sql = readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString });
  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log("Schema applied (init.sql).");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
