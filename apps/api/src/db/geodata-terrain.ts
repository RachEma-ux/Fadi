/**
 * Commande d'administration du terrain haute résolution (plan v1.0, lot TER-02, Issue #381) :
 *
 *   npm run geodata:terrain -- --telecharger <fiche>                      dépose l'original d'une fiche livrée dans depot/
 *   npm run geodata:terrain -- --importer <fiche> --par <courriel>         importe depot/<fichier> (rôle gestionnaire-donnees)
 *   npm run geodata:terrain -- --lever <id> --par <courriel> --motif "…"  lève une quarantaine (rôle responsable-publication)
 *        [--reference-libelle "…" --reference-source "…" [--reference-code EPSG:nnnn]]
 *   npm run geodata:terrain -- --etat                                     liste les versions et leur état
 *   npm run geodata:terrain -- --traiter [<id>] [--par <courriel>]        dérivés et courbes (travailleur GDAL, TER-03)
 *   npm run geodata:terrain -- --controler <id> --points <csv> --methode "…" --par <courriel>
 *        [--cible-rmsez 0.10 --cible-p95 0.20 [--cible-classe sol-nu]]     rapport qualité (rôle gestionnaire-donnees)
 *   npm run geodata:terrain -- --decider <id> --decision accepte|quarantaine|retire --motif "…" --par <courriel>
 *                                                                         revue (rôle responsable-publication)
 *   npm run geodata:terrain -- --publier <id> --motif "…" --par <courriel>  publication ou retour arrière (TER-04)
 *   npm run geodata:terrain -- --exports                                  prépare les exports en attente, efface les expirés
 *   npm run geodata:terrain -- --continu [secondes]                       travailleur : traitements et exports en boucle
 *   npm run geodata:terrain -- --essai-gdal                              essai du travailleur sur une fixture « test seulement »
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
import { controlerQualite, deciderRevue, traiterVersion, versionsATraiter } from "../lib/geodata/terrain/traitement.js";
import { expirerExports, traiterUnExport } from "../lib/geodata/terrain/exports.js";
import { publierVersion } from "../lib/geodata/terrain/services.js";
import { calculerDerives } from "../lib/geodata/terrain/derives.js";
import { ecrireFixture } from "../lib/geodata/terrain/fixtures-synthetiques.js";
import { lirePointsControle } from "@parcours/geodata-model";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

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
  if (process.argv.includes("--essai-gdal")) {
    // Essai du travailleur, sans base : fixture synthétique « test seulement », COG vérifié, pente, ombrage, courbes.
    const d = mkdtempSync(join(tmpdir(), "terrain-essai-"));
    try {
      ecrireFixture(join(d, "plan.tif"), { valeur: (c) => 500 + c });
      const r = await calculerDerives(join(d, "plan.tif"), join(d, "derives"), { geographique: false, nodata: -9999, equidistance: 10 });
      console.log(`Essai GDAL réussi (${r.logiciels.gdal}) : ${r.fichiers.map((f) => f.nature).join(", ")} ; ${r.courbes.length} niveau(x) de courbes ; ${r.cellulesValides} cellules valides.`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
    return;
  }
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
    if (process.argv.includes("--traiter")) {
      const par = argument("par") ? await compte(pool, argument("par"), "gestionnaire-donnees") : null;
      const client = await pool.connect();
      try {
        const cible = argument("traiter");
        const ids = cible && !cible.startsWith("--") ? [cible] : await versionsATraiter(client);
        if (!ids.length) console.log("Aucune version prête au traitement.");
        let echecs = 0;
        for (const id of ids) {
          try {
            const r = await traiterVersion(client, stockage(), id, par);
            console.log(`${r.deja ? "Déjà traitée" : "Traitée"} : ${id} — en attente de revue ; courbes à ${r.equidistance} m (${r.courbes} lignes) ; couverture ${Math.round(r.surfaceM2)} m².`);
          } catch (e) {
            echecs++;
            console.error(`Échec : ${id} — ${(e as Error).message}`);
          }
        }
        if (echecs) process.exitCode = 1;
      } finally {
        client.release();
      }
      return;
    }
    if (argument("controler")) {
      const par = await compte(pool, argument("par"), "gestionnaire-donnees");
      const fichier = argument("points");
      if (!fichier) throw new Error("--points <fichier CSV> requis (id;x;y;z;classe;incertitude, repère natif de la version).");
      const rm = argument("cible-rmsez"), p95 = argument("cible-p95");
      const cibles = rm && p95 ? { rmsez: Number(rm), p95: Number(p95), classe: argument("cible-classe") ?? null } : null;
      const client = await pool.connect();
      try {
        const r = await controlerQualite(client, stockage(), argument("controler")!, { points: lirePointsControle(readFileSync(fichier, "utf8")), methode: argument("methode") ?? "", cibles, par });
        const g = r.rapport.global;
        console.log(`Rapport qualité : ${r.etat}${g ? ` — n ${g.n}, biais ${g.biais.toFixed(3)} m, RMSEz ${g.rmsez.toFixed(3)} m, P95 ${g.p95.toFixed(3)} m` : ""} ; ${r.rapport.exclus.length} point(s) exclu(s).`);
      } finally {
        client.release();
      }
      return;
    }
    if (argument("publier")) {
      const par = await compte(pool, argument("par"), "responsable-publication");
      const client = await pool.connect();
      try {
        const r = await publierVersion(client, argument("publier")!, par, argument("motif") ?? "");
        console.log(`Publiée : ${argument("publier")}${r.remplacee ? ` (remplace ${r.remplacee})` : ""}.`);
      } finally {
        client.release();
      }
      return;
    }
    if (process.argv.includes("--exports") || process.argv.includes("--continu")) {
      const pause = Number(argument("continu") ?? 30);
      const continu = process.argv.includes("--continu");
      const client = await pool.connect();
      try {
        do {
          let n = 0;
          if (continu) for (const id of await versionsATraiter(client)) {
            try { await traiterVersion(client, stockage(), id, null); console.log(`Traitée : ${id}`); } catch (e) { console.error(`Échec du traitement ${id} : ${(e as Error).message}`); }
          }
          while (await traiterUnExport(client, stockage())) n++;
          const expires = await expirerExports(client, stockage());
          if (n || expires) console.log(`Exports préparés : ${n} ; expirés effacés : ${expires}.`);
          if (continu) await new Promise((r) => setTimeout(r, Math.max(5, Number.isFinite(pause) ? pause : 30) * 1000));
        } while (continu);
      } finally {
        client.release();
      }
      return;
    }
    if (argument("decider")) {
      const par = await compte(pool, argument("par"), "responsable-publication");
      const decision = argument("decision");
      if (decision !== "accepte" && decision !== "quarantaine" && decision !== "retire") throw new Error("--decision accepte | quarantaine | retire");
      const client = await pool.connect();
      try {
        const q = await deciderRevue(client, argument("decider")!, decision, argument("motif") ?? "", par);
        console.log(`Décision consignée : ${argument("decider")} → ${LIBELLES_ETATS_TERRAIN[decision]} (qualité : ${q}).`);
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
    console.log("Usage : --telecharger <fiche> | --importer <fiche> --par <courriel> | --lever <id> --par <courriel> --motif … | --traiter [<id>] | --controler <id> --points <csv> --methode … --par <courriel> | --decider <id> --decision … --motif … --par <courriel> | --etat | --essai-gdal");
    console.log(`Fiches livrées : ${fiches.join(", ") || "aucune"}`);
  } finally {
    await pool.end();
  }
}

principal().catch((e) => {
  console.error(`geodata-terrain : ${(e as Error).message}`);
  process.exit(1);
});
