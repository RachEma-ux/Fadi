/**
 * Attribution d'un rôle GeoData en ligne de commande (amorçage : le premier administrateur GeoData n'a personne pour le
 * nommer par l'API) :
 *
 *   npm run geodata:role -- --email <courriel> --role <gestionnaire-donnees|responsable-publication|administrateur> [--retirer]
 *
 * Rôles GeoData seulement ; aucun rôle de projet ni de plateforme n'est lu ou modifié. Base : `DATABASE_URL`.
 */
import "dotenv/config";
import { Pool } from "pg";
import { estRoleGeoData } from "@parcours/geodata-model";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const email = arg("email");
  const role = arg("role");
  if (!email || !estRoleGeoData(role)) throw new Error("Usage : --email <courriel> --role <gestionnaire-donnees|responsable-publication|administrateur> [--retirer]");
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    const [u] = (await pool.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email])).rows;
    if (!u) throw new Error(`Compte ${email} introuvable.`);
    if (process.argv.includes("--retirer")) await pool.query("DELETE FROM geodata_roles WHERE user_id = $1 AND role = $2", [u.id, role]);
    else await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [u.id, role]);
    await pool.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES (NULL, $1, $2, 'succes', $3)", [process.argv.includes("--retirer") ? "role.retire" : "role.attribue", u.id, JSON.stringify({ role, par: "ligne-de-commande" })]);
    console.log(`${email} : rôle ${role} ${process.argv.includes("--retirer") ? "retiré" : "attribué"}.`);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
