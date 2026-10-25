/**
 * Chaîne administrative d'import de référence GeoData (D-GD-04, D-GD-07, plan GD-03) :
 *
 *   npm run geodata:import-reference -- --fiche <fiche.json | nom> [--fichier <données.geojson|.gpkg>] [--table <table>]
 *        --preparateur <courriel> [--publier-par <courriel>]
 *   (image de production : node apps/api/dist/geodata-reference.js --fiche geoboundaries-mar-adm1 --preparateur …)
 *
 * `--fiche` accepte un chemin, ou le nom d'une fiche qualifiée du dépôt (`docs/geodata/sources/<nom>.json`, copiées à
 * côté du bundle dans `dist/geodata-sources/`). Relancée sur une version déjà préparée (même source, même empreinte),
 * la commande ne crée rien ; avec `--publier-par`, elle publie cette version si elle est encore en préparation, aux
 * mêmes conditions (rôle, contrôles réussis, droits de consultation et de tuiles autorisés).
 *
 * Réception (fichier local, ou téléchargement de l'adresse de la fiche) → empreinte SHA-256 comparée à celle de la fiche
 * → lecture (GeoJSON, ou GeoPackage EPSG:4326) → contrôles (validation partagée, codes uniques et présents) →
 * préparation d'une version commune (`preparation`). La publication est un geste séparé du responsable de publication
 * (API `POST /geodata/api/admin/versions/:id/publier`, ou `--publier-par` si ce compte a ce rôle). Un droit inconnu
 * bloque la publication. Le préparateur doit avoir le rôle « gestionnaire-donnees ». Base : `DATABASE_URL`.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { Pool } from "pg";
import { lireDroits, OBJETS_PAR_COUCHE, validerGeoJSON, verifierUsage, type StyleCouche } from "@parcours/geodata-model";
import { lireGeoPackage } from "../lib/geodata/geopackage.js";
import { codesDesObjets, ecrireVersion, type IndicateurDeclare } from "../lib/geodata/versions.js";

export interface FicheSource {
  cle: string; titre: string; producteur: string; theme: string; couverture: string; description: string;
  version: { libelle: string; url: string | null; empreinte: string; periode: string | null; licence: string; attribution: string; droits: Record<string, string>; precision: string | null; synthetique: boolean; conditions?: string };
  couche: { titre: string; description: string; niveau: string | null; champCode: string; champNom: string | null; proprietesExposees: string[]; styleDefaut: StyleCouche };
  indicateurs?: IndicateurDeclare[];
  superficie?: boolean;
}

/** Chemin de la fiche : chemin donné, sinon fiche qualifiée nommée (à côté du bundle, ou dans le dépôt en développement). */
function cheminFiche(valeur: string): string {
  if (existsSync(valeur)) return valeur;
  if (/^[a-z0-9-]{3,80}$/.test(valeur)) {
    for (const base of ["./geodata-sources/", "../../../../docs/geodata/sources/"]) {
      const p = fileURLToPath(new URL(`${base}${valeur}.json`, import.meta.url));
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`Fiche introuvable : ${valeur}`);
}

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const argFiche = argument("fiche");
  const preparateur = argument("preparateur");
  if (!argFiche || !preparateur) throw new Error("Usage : --fiche <fiche.json> --preparateur <courriel> [--fichier <données>] [--table <table>] [--publier-par <courriel>]");
  const fiche = JSON.parse(readFileSync(cheminFiche(argFiche), "utf8")) as FicheSource;
  let octets: Buffer;
  let nomFichier: string;
  const fichier = argument("fichier");
  if (fichier) { octets = readFileSync(fichier); nomFichier = basename(fichier); }
  else {
    if (!fiche.version.url) throw new Error("Ni --fichier ni adresse de téléchargement dans la fiche.");
    const r = await fetch(fiche.version.url);
    if (!r.ok) throw new Error(`Téléchargement refusé (${r.status}) : ${fiche.version.url}`);
    octets = Buffer.from(await r.arrayBuffer());
    nomFichier = basename(new URL(fiche.version.url).pathname);
  }
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const empreinteOk = empreinte === fiche.version.empreinte.toLowerCase();
  let brut: unknown;
  let crsSource = "WGS 84 (CRS84)";
  if (/\.gpkg$/i.test(nomFichier)) {
    if (!fichier) throw new Error("Un GeoPackage se lit depuis un fichier local (--fichier).");
    const g = lireGeoPackage(fichier, argument("table"));
    brut = g.geojson;
    crsSource = `${g.crs} (GeoPackage, table ${g.table})`;
  } else brut = JSON.parse(octets.toString("utf8"));
  // Une couche V1 compte au plus OBJETS_PAR_COUCHE objets : c'est la borne des valeurs d'indicateur servies d'un bloc au
  // navigateur (classification, légende, carte thématique) ; au-delà, la couche est refusée plutôt que tronquée.
  const v = validerGeoJSON(brut, { octets: 200 * 1024 * 1024, objets: OBJETS_PAR_COUCHE, sommets: 20_000_000, proprietes: 200, longueurTexte: 2000 });
  const objets = v.ok ? v.objets : [];
  const { doublons, manquants } = codesDesObjets(objets, fiche.couche.champCode);
  const controles = {
    ok: empreinteOk && v.ok && doublons.length === 0 && manquants === 0,
    empreinte: { attendue: fiche.version.empreinte, calculee: empreinte, conforme: empreinteOk },
    validation: v.rapport, codes: { champ: fiche.couche.champCode, doublons, manquants }, controleLe: new Date().toISOString(),
  };
  console.log(JSON.stringify({ fichier: nomFichier, objets: v.rapport.objets, sommets: v.rapport.sommets, controlesOk: controles.ok, empreinteOk, doublons: doublons.length, manquants, diagnostics: v.rapport.diagnostics.slice(0, 10) }, null, 2));
  if (!v.ok) throw new Error("Validation refusée : aucune version préparée.");
  if (doublons.length) throw new Error(`Codes en double (${doublons.slice(0, 5).join(", ")}) : aucune version préparée.`);
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const client = await pool.connect();
  try {
    const role = async (email: string, r: string) => (await client.query("SELECT u.id FROM users u JOIN geodata_roles g ON g.user_id = u.id AND g.role = $2 WHERE lower(u.email) = lower($1)", [email, r])).rows[0]?.id as string | undefined;
    const [deja] = (await client.query("SELECT v.id, v.etat FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = $1 AND v.empreinte = $2 AND v.espace_id IS NULL", [fiche.cle, empreinte])).rows;
    const publierPar = argument("publier-par");
    const publier = async (versionId: string, controlesOk: boolean) => {
      const publieurId = await role(publierPar!, "responsable-publication");
      if (!publieurId) throw new Error(`${publierPar} n'a pas le rôle GeoData « responsable-publication » : version ${versionId} laissée en préparation.`);
      const droits = lireDroits(fiche.version.droits);
      const bloque = (["consultation", "tuiles"] as const).map((u) => verifierUsage(droits, u)).filter((d) => !d.ok);
      if (bloque.length || !controlesOk) throw new Error(`Publication bloquée (droits ou contrôles) : version ${versionId} laissée en préparation.`);
      await client.query("UPDATE geodata_versions SET etat = 'publiee', publiee_par = $2, publiee_le = now() WHERE id = $1 AND etat = 'preparation'", [versionId, publieurId]);
      await client.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat) VALUES ($1, 'version.publiee', $2, 'succes')", [publieurId, versionId]);
      console.log(`Version ${versionId} publiée par ${publierPar}.`);
    };
    if (deja) {
      console.log(`Version déjà présente (même source, empreinte identique) : ${deja.id} (${deja.etat}) ; aucune nouvelle version.`);
      if (publierPar && deja.etat === "preparation") {
        // Reprise du parcours en deux temps : la version préparée et contrôlée plus tôt est publiée, aux mêmes conditions.
        const [c] = (await client.query("SELECT (controles->>'ok')::boolean AS ok FROM geodata_versions WHERE id = $1", [deja.id])).rows;
        await publier(deja.id, c?.ok === true);
      }
      return;
    }
    const prepareParId = await role(preparateur, "gestionnaire-donnees");
    if (!prepareParId) throw new Error(`${preparateur} n'a pas le rôle GeoData « gestionnaire-donnees ».`);
    await client.query("BEGIN");
    const ecrite = await ecrireVersion(client, {
      source: { cle: fiche.cle, titre: fiche.titre, producteur: fiche.producteur, theme: fiche.theme, couverture: fiche.couverture, description: fiche.description },
      espaceId: null,
      version: {
        libelle: fiche.version.libelle, empreinte, fichierNom: nomFichier, fichierTaille: fichier ? statSync(fichier).size : octets.length, urlSource: fiche.version.url,
        recupereLe: new Date().toISOString(), periode: fiche.version.periode, licence: fiche.version.licence,
        attribution: fiche.version.attribution, droits: lireDroits(fiche.version.droits), crsSource, precision: fiche.version.precision,
        transformations: [`Lecture ${/\.gpkg$/i.test(nomFichier) ? "GeoPackage (WKB → GeoJSON)" : "GeoJSON"} ; géométries conservées en WGS 84 sans reprojection`, ...(fiche.version.conditions ? [`Conditions : ${fiche.version.conditions}`] : [])],
        controles, synthetique: fiche.version.synthetique,
      },
      couche: { ...fiche.couche },
      objets, indicateurs: fiche.indicateurs ?? [], superficie: fiche.superficie !== false, preparePar: prepareParId,
    });
    await client.query("COMMIT");
    console.log(`Version préparée : ${ecrite.versionId} (couche ${ecrite.coucheId}, ${ecrite.objets} objets, ${ecrite.reparees} géométrie(s) réparée(s), ${ecrite.indicateurs.length} indicateur(s)).`);
    if (publierPar) await publier(ecrite.versionId, controles.ok);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
