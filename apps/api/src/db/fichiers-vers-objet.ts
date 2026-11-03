/**
 * BD-9.1 (chantier base-donnees, D-BD-8) : reprise unique des fichiers `bytea` vers le stockage objet S3, et balayage
 * des objets orphelins. **Essai par défaut** : rien n'est écrit sans `--appliquer`.
 *
 *   npm run db:fichiers-vers-objet                                   → bilan (lignes et octets à déplacer), accès au compartiment
 *   npm run db:fichiers-vers-objet -- --appliquer [--lot 50] [--max N] [--table step_files]
 *                                                                    → déplace par lots, vérifie chaque objet avant de vider le bytea
 *   npm run db:fichiers-vers-objet -- --orphelins [--age-heures 24]  → compte les objets qu'aucune ligne ne cite
 *   npm run db:fichiers-vers-objet -- --orphelins --appliquer        → les supprime (plus anciens que l'âge minimal)
 *
 * Image de production : `node apps/api/dist/fichiers-vers-objet.js …` (mêmes options). Variables : DATABASE_URL (rôle
 * applicatif) et FADI_S3_* (docs/deploiement.md, « Stockage des fichiers »). Idempotent : relancer reprend où la
 * précédente exécution s'est arrêtée. `geodata_fichiers` n'est jamais concerné (D-GD-29).
 */
import "dotenv/config";
import { Pool } from "pg";
import { lireConfigStockage } from "../lib/stockage-objet/config.js";
import { ESPACES_FICHIERS, type EspaceFichiers } from "../lib/stockage-objet/index.js";
import { nettoyerObjetsOrphelins, reprendreFichiers } from "../lib/stockage-objet/reprise.js";
import { creerClientS3, piloteS3 } from "../lib/stockage-objet/s3.js";

const args = process.argv.slice(2);
const option = (nom: string) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const entier = (nom: string): number | undefined => {
  const v = option(nom);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${nom} : entier positif attendu.`);
  return n;
};

async function main() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const config = lireConfigStockage(process.env);
  if (!config.s3) throw new Error("Stockage objet non configuré : renseigner FADI_S3_ENDPOINT, FADI_S3_REGION, FADI_S3_BUCKET, FADI_S3_ACCESS_KEY_ID, FADI_S3_SECRET_ACCESS_KEY.");
  const appliquer = args.includes("--appliquer");
  const table = option("--table");
  if (table !== undefined && !(ESPACES_FICHIERS as readonly string[]).includes(table)) throw new Error(`--table : ${ESPACES_FICHIERS.join(", ")} attendu.`);
  const tables = table ? [table as EspaceFichiers] : undefined;

  const pilote = piloteS3(creerClientS3(config.s3), config.s3.bucket);
  await pilote.verifierAcces();
  const pool = new Pool({ connectionString, max: 1, application_name: "fadi-fichiers-vers-objet" });
  try {
    // eslint-disable-next-line no-console
    const journal = (l: string) => console.error(l);
    const bilan = args.includes("--orphelins")
      ? await nettoyerObjetsOrphelins(pool, pilote, { appliquer, ageMinHeures: entier("--age-heures"), tables })
      : await reprendreFichiers(pool, pilote, { appliquer, lot: entier("--lot"), max: entier("--max"), tables, journal });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ mode: appliquer ? "applique" : "essai", bilan }, null, 2));
    if (!appliquer) journal("Essai : rien n'a été modifié. Relancer avec --appliquer.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
