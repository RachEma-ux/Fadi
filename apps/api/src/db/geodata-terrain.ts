/**
 * Commande d'administration du terrain haute résolution (plan v1.0, lot TER-02, Issue #381) :
 *
 *   npm run geodata:terrain -- --telecharger <fiche>                      dépose l'original d'une fiche livrée dans depot/
 *   npm run geodata:terrain -- --importer <fiche> --par <courriel>         importe depot/<fichier> (rôle gestionnaire-donnees)
 *   npm run geodata:terrain -- --lever <id> --par <courriel> --motif "…"  lève une quarantaine (rôle responsable-publication)
 *        [--reference-libelle "…" --reference-source "…" [--reference-code EPSG:nnnn]]
 *   npm run geodata:terrain -- --etat                                     liste les versions et leur état
 *   (image : node apps/api/dist/geodata-terrain.js …)
 *
 * Fiches : `docs/geodata/terrain/<cle>.json` (copiées dans `dist/geodata-terrain/`). `--telecharger` n'accepte qu'une fiche
 * **livrée** (nom, jamais un chemin) : seules les adresses relues et versées au dépôt sont lues (TER-D10). Volume :
 * `GEODATA_TERRAIN_DIR` ; quota `GEODATA_TERRAIN_QUOTA_GO` (60 par défaut, TER-D7). Base : `DATABASE_URL`.
 */
import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Pool } from "pg";
import { LIBELLES_ETATS_TERRAIN, LIMITES_TERRAIN, validerDeclarationTerrain, type DeclarationTerrain, type EtatTerrain } from "@parcours/geodata-model";
import { StockageTerrain } from "../lib/geodata/terrain/stockage.js";
import { importerTerrain, leverQuarantaine } from "../lib/geodata/terrain/import.js";
import { acquerir } from "../lib/geodata/terrain/acquisition.js";

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Dossier des fiches de terrain livrées (à côté du bundle, ou dans le dépôt en développement). */
function dossierFiches(): string {
  for (const base of ["./geodata-terrain/", "../../../../docs/geodata/terrain/"]) {
    const d = fileURLToPath(new URL(base, import.meta.url));
    if (existsSync(d)) return d;
  }
  throw new Error("Aucun dossier de fiches de terrain.");
}

/** Fiche livrée par son nom, ou (import seulement) fiche donnée par un chemin. */
function lireFiche(valeur: string, livreeSeulement: boolean): DeclarationTerrain {
  let chemin: string;
  if (/^[a-z0-9][a-z0-9-]{2,79}$/.test(valeur)) chemin = join(dossierFiches(), `${valeur}.json`);
  else if (!livreeSeulement && existsSync(valeur)) chemin = valeur;
  else throw new Error(livreeSeulement ? `Fiche livrée attendue (nom, pas un chemin) : ${valeur}` : `Fiche introuvable : ${valeur}`);
  if (!existsSync(chemin)) throw new Error(`Fiche introuvable : ${valeur}`);
  const r = validerDeclarationTerrain(JSON.parse(readFileSync(chemin, "utf8")));
  if (!r.ok) throw new Error(`Fiche ${valeur} invalide :\n  - ${r.erreurs.join("\n  - ")}`);
  return r.declaration;
}

function stockage(): StockageTerrain {
  const s = StockageTerrain.depuisEnvironnement();
  if (!s) throw new Error("GEODATA_TERRAIN_DIR absent : aucun volume terrain configuré.");
  return s;
}

function quotaOctets(): number {
  const go = process.env["GEODATA_TERRAIN_QUOTA_GO"];
  if (go === undefined || go === "") return LIMITES_TERRAIN.quotaOctets;
  const n = Number(go);
  if (!(n > 0)) throw new Error(`GEODATA_TERRAIN_QUOTA_GO invalide : ${go}`);
  return n * 1000 ** 3;
}

async function compte(pool: Pool, email: string | undefined, role: string): Promise<string> {
  if (!email) throw new Error(`--par <courriel> requis (rôle GeoData « ${role} »).`);
  const id = (await pool.query("SELECT u.id FROM users u JOIN geodata_roles g ON g.user_id = u.id AND g.role = $2 WHERE lower(u.email) = lower($1)", [email, role])).rows[0]?.id as string | undefined;
  if (!id) throw new Error(`${email} n'a pas le rôle GeoData « ${role} ».`);
  return id;
}

async function principal(): Promise<void> {
  if (argument("telecharger")) {
    const d = lireFiche(argument("telecharger")!, true);
    const r = await acquerir(stockage(), d);
    console.log(`Déposé : depot/${d.fichier.nom} (${r.taille} octets, SHA-256 ${r.empreinte}).`);
    return;
  }
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    if (argument("importer")) {
      const d = lireFiche(argument("importer")!, false);
      const par = await compte(pool, argument("par"), "gestionnaire-donnees");
      const client = await pool.connect();
      try {
        const r = await importerTerrain(client, stockage(), d, { deposePar: par, quotaOctets: quotaOctets() });
        console.log(`${r.deja ? "Déjà importée" : "Importée"} : ${r.versionId} — ${LIBELLES_ETATS_TERRAIN[r.etat]} (SHA-256 ${r.empreinte}).`);
        for (const m of r.motifs) console.log(`  - [${m.gravite}] ${m.code} : ${m.message}`);
      } finally {
        client.release();
      }
      return;
    }
    if (argument("lever")) {
      const par = await compte(pool, argument("par"), "responsable-publication");
      const libelle = argument("reference-libelle");
      const client = await pool.connect();
      try {
        const ref = await leverQuarantaine(client, argument("lever")!, {
          motif: argument("motif") ?? "",
          referenceVerticale: libelle ? { code: argument("reference-code") ?? null, libelle, source: argument("reference-source") ?? "" } : null,
        }, par);
        console.log(`Quarantaine levée : ${argument("lever")} — référence verticale ${ref.statut === "declaree" ? `${ref.libelle} (${ref.origine})` : "non déclarée"}.`);
      } finally {
        client.release();
      }
      return;
    }
    if (process.argv.includes("--etat")) {
      const lignes = (await pool.query<{ id: string; cle: string; produit: string; etat: EtatTerrain; motifs: { code: string }[]; etiquette: string | null }>(
        "SELECT id, cle, produit, etat, motifs, etiquette FROM geodata_terrain_versions ORDER BY depose_le")).rows;
      if (!lignes.length) console.log("Aucune version de terrain.");
      for (const l of lignes) console.log(`${l.id}  ${l.cle}  ${l.produit}  ${LIBELLES_ETATS_TERRAIN[l.etat]}${l.motifs.length ? `  [${l.motifs.map((m) => m.code).join(", ")}]` : ""}${l.etiquette ? `  — ${l.etiquette}` : ""}`);
      return;
    }
    const fiches = existsSync(dossierFiches()) ? readdirSync(dossierFiches()).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
    console.log("Usage : --telecharger <fiche> | --importer <fiche> --par <courriel> | --lever <id> --par <courriel> --motif … | --etat");
    console.log(`Fiches livrées : ${fiches.join(", ") || "aucune"}`);
  } finally {
    await pool.end();
  }
}

principal().catch((e) => {
  console.error(`geodata-terrain : ${(e as Error).message}`);
  process.exit(1);
});
