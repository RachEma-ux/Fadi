/**
 * Chaîne administrative d'import de référence GeoData (D-GD-04, D-GD-07, plan GD-03) :
 *
 *   npm run geodata:import-reference -- --fiche <fiche.json | nom | toutes> [--fichier <données.geojson|.gpkg>] [--table <table>]
 *        --preparateur <courriel> [--publier-par <courriel>]
 *   (image de production : node apps/api/dist/geodata-reference.js --fiche hcp-rgph2024-population-regions --preparateur …)
 *
 * Les données sont lues de `--fichier`, sinon du fichier livré avec la fiche (`version.fichier`, ex. extractions
 * OpenStreetMap de `docs/geodata/sources/osm/`), sinon téléchargées depuis `version.url`.
 *
 * `--decoupage [pays]` (D-GD-35) : import **unique** du découpage administratif (niveaux, entités, liens parent → enfant)
 * depuis `decoupage/<pays>.json`, lancé une fois par l'exploitant sur le serveur — jamais au démarrage de l'API ; relancé
 * sur le même fichier, il ne fait rien ; bilan affiché (ajoutées, modifiées, retirées, sans parent).
 * `--archiver` (seul, ou avec `--fiche toutes`) copie d'abord en base tous les fichiers livrés, tels quels (`geodata_fichiers`,
 * D-GD-29 : l'interface ne garde aucune donnée) ; aucun compte n'est requis.
 * `--livraison` (D-GD-29, à la place de `--preparateur` / `--publier-par`) : les fiches livrées sont préparées et publiées
 * par la chaîne de livraison elle-même, sans compte (`preparee_par` et `publiee_par` nuls, journal « livraison ») — c'est
 * le mode du démarrage de l'API sans `GEODATA_IMPORT_AUTO_PAR` ; la responsabilité est celle du dépôt (fiche relue,
 * empreinte contrôlée, CI).
 * `--fiche toutes` traite une à une toutes les fiches livrées (une déjà importée n'est pas recréée, ni relue ni
 * retéléchargée : l'empreinte attendue se lit dans la fiche), puis applique, avec `--publier-par`, les retraits déclarés
 * dans `donnees/retraits-sources.json` (D-GD-23 : import automatique au déploiement, `lib/geodata/import-auto.ts`).
 *
 * `--fiche` accepte un chemin, ou le nom d'une fiche qualifiée du dépôt (`docs/geodata/sources/<nom>.json`, copiées à
 * côté du bundle dans `dist/geodata-sources/`). Relancée sur une version déjà préparée (même source, même empreinte),
 * la commande ne crée rien ; avec `--publier-par`, elle publie cette version si elle est encore en préparation, aux
 * mêmes conditions (rôle, contrôles réussis, droits de consultation et de tuiles autorisés), lues dans la version
 * enregistrée et non dans la fiche.
 *
 * Réception (fichier local, ou téléchargement de l'adresse de la fiche) → empreinte SHA-256 comparée à celle de la fiche
 * → lecture (GeoJSON, GeoPackage EPSG:4326, ou GeoTIFF EPSG:4326 pour une couche raster, D-GD-13) → contrôles (validation partagée, codes uniques et présents) →
 * préparation d'une version commune (`preparation`). La publication est un geste séparé du responsable de publication
 * (API `POST /geodata/api/admin/versions/:id/publier`, ou `--publier-par` si ce compte a ce rôle). Un droit inconnu
 * bloque la publication. Le préparateur doit avoir le rôle « gestionnaire-donnees ». Base : `DATABASE_URL`.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { validerDeclarationTerritoire, bornesRobustes, estMotifAbsence, lireDroits, type MotifAbsence, MAX_PIXELS_RASTER, OBJETS_PAR_COUCHE, validerDeclarationRaster, validerGeoJSON, verifierUsage, type ClasseRaster, type DescriptionRaster, type ObjetImporte, type PaletteRaster, type StyleCouche } from "@parcours/geodata-model";
import { lireGeoTiff, type GrilleRaster } from "../lib/geodata/raster.js";
import { lireGeoPackage } from "../lib/geodata/geopackage.js";
import { empreinteAttendue } from "../lib/geodata/empreinte-fiche.js";
import { codesDesObjets, ecrireVersion, type IndicateurDeclare, type LigneDouar } from "../lib/geodata/versions.js";
import { chargerTerritoires, NiveauAbsent } from "../lib/geodata/territoires.js";
import { archiverFichiers, ligneBilanArchive } from "../lib/geodata/archive-fichiers.js";
import { importerDecoupage, ligneBilanDecoupage } from "../lib/geodata/decoupage.js";

export interface FicheSource {
  cle: string; titre: string; producteur: string; theme: string; couverture: string; description: string;
  version: {
    libelle: string; url: string | null; /** Fichier livré avec la fiche (chemin relatif au dossier des fiches), à défaut d'adresse. */ fichier?: string; empreinte: string; periode: string | null; licence: string; attribution: string; droits: Record<string, string>; precision: string | null; synthetique: boolean; conditions?: string;
    /**
     * Tableau de valeurs livré avec la fiche (D-GD-17, lot A2) : CSV « code,colonne… », une ligne par objet ; chaque
     * indicateur lit sa colonne (`propriete`). Les signes conventionnels déclarés donnent leur motif d'absence.
     */
    tableau?: { fichier: string; empreinte: string; signes?: Record<string, string> };
    /** Annexes sans géométrie (lot E) : douars du RGPH 2024, TSV d'empreinte contrôlée, rangés sous leur commune. */
    annexes?: { douars?: { fichier: string; empreinte: string; description?: string } };
  };
  couche: {
    titre: string; description: string; niveau: string | null; champCode: string; champNom: string | null; proprietesExposees: string[]; styleDefaut: StyleCouche;
    /** Couche raster (données GeoTIFF) : symbologie ; bornes absentes = 2ᵉ et 98ᵉ centiles des valeurs. */
    raster?: { unite: string | null; grandeur: string; palette: PaletteRaster; min?: number; max?: number; classes?: ClasseRaster[] | null };
  };
  indicateurs?: IndicateurDeclare[];
  superficie?: boolean;
  /**
   * Place de la couche dans le découpage territorial d'un pays (lot H, D-GD-28) : une fois la version publiée, ses unités
   * sont chargées dans `geodata_territoires` (barre territoriale de l'interface, indépendante des couches affichées).
   */
  territoire?: unknown;
}

/**
 * Découpage territorial de la fiche (lot H) : chargé depuis la version publiée de cette source et de cette empreinte ;
 * rien si la fiche ne déclare pas `territoire`. Une déclaration invalide est une erreur (jamais ignorée en silence).
 */
async function assurerTerritoires(ex: Pool | PoolClient, fiche: FicheSource, empreinte: string) {
  if (fiche.territoire === undefined) return;
  const d = validerDeclarationTerritoire(fiche.territoire);
  if (!d.ok) throw new Error(`Fiche ${fiche.cle} : ${d.erreurs.join(" ; ")}`);
  const [v] = (await ex.query("SELECT v.id FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = $1 AND v.empreinte = $2 AND v.espace_id IS NULL AND v.etat = 'publiee'", [fiche.cle, empreinte])).rows as { id: string }[];
  if (!v) { console.log(`Découpage territorial ${d.declaration.pays} (${fiche.cle}) : version non publiée, rien de chargé.`); return; }
  // Une transaction propre (client dédié si l'appelant donne un pool) : le remplacement du rang et le recalcul des parents
  // sont atomiques ; en cas d'échec, l'ancien découpage reste servi.
  const client = ex instanceof Pool ? await ex.connect() : ex;
  try {
    await client.query("BEGIN");
    const b = await chargerTerritoires(client, v.id, d.declaration);
    await client.query("COMMIT");
    console.log(`Découpage territorial ${b.pays} (rang ${b.rang}, ${b.niveau}) : ${b.unites} unité(s) ${b.deja ? "déjà chargée(s)" : "chargée(s)"}.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    // Découpage pas encore importé (import unique, D-GD-35) : la couche reste publiée, ses unités attendent cet import.
    if (e instanceof NiveauAbsent) { console.log(`Découpage territorial ${d.declaration.pays} (${fiche.cle}) : ${e.message}`); return; }
    throw e;
  } finally {
    if (ex instanceof Pool) (client as PoolClient).release();
  }
}

/**
 * Tableau de valeurs livré avec une fiche : CSV simple (séparateur virgule, sans guillemets), première colonne = code.
 * Une cellule numérique devient un nombre ; un signe conventionnel reste un texte (motif à la lecture) ; vide = absent.
 */
function lireTableau(fiche: FicheSource, chemin: string) {
  const t = fiche.version.tableau;
  if (!t) return null;
  if (!/^[a-z0-9/_.-]+\.csv$/.test(t.fichier) || t.fichier.includes("..")) throw new Error(`Tableau de valeurs refusé : ${t.fichier}`);
  const octets = readFileSync(join(dirname(chemin), t.fichier));
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const [entete, ...lignes] = octets.toString("utf8").split(/\r?\n/).filter((l) => l.length);
  const noms = entete!.split(",");
  const colonnes = new Map<string, Map<string, number | string | null>>(noms.slice(1).map((n) => [n, new Map()]));
  for (const l of lignes) {
    const cellules = l.split(",");
    const code = cellules[0]!;
    for (let j = 1; j < noms.length; j++) {
      const brut = (cellules[j] ?? "").trim();
      colonnes.get(noms[j]!)!.set(code, brut === "" ? null : /^-?\d+(\.\d+)?$/.test(brut) ? Number(brut) : brut);
    }
  }
  const signes = Object.fromEntries(Object.entries(t.signes ?? {}).filter(([, m]) => estMotifAbsence(m))) as Record<string, MotifAbsence>;
  return { ok: empreinte === t.empreinte.toLowerCase(), empreinte, lignes: lignes.length, colonnes, signes };
}

/** Douars en annexe (TSV : code, commune, fraction, nom, type, ménages, population, %) ; « X » = secret statistique. */
function lireDouars(fiche: FicheSource, chemin: string): { ok: boolean; empreinte: string; lignes: LigneDouar[] } | null {
  const a = fiche.version.annexes?.douars;
  if (!a) return null;
  if (!/^donnees\/[a-z0-9-]+\.tsv$/.test(a.fichier)) throw new Error(`Annexe des douars refusée : ${a.fichier}`);
  const octets = readFileSync(join(dirname(chemin), a.fichier));
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const [entete, ...corps] = octets.toString("utf8").split("\n").filter((l) => l.length);
  const noms = entete!.split("\t");
  const nombre = (x: string | undefined) => (x && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : null);
  const lignes = corps.map((l) => {
    const c = Object.fromEntries(l.split("\t").map((x, i) => [noms[i]!, x]));
    const type = ["groupé", "éclaté", "dispersé"].includes(c["type"] ?? "") ? (c["type"] as LigneDouar["type"]) : null;
    return {
      code: c["code"]!, commune: c["commune"]!, fraction: c["fraction"] ?? "", nom: c["nom"] ?? "", type,
      menages: nombre(c["menages"]), population: nombre(c["population"]), masculin: nombre(c["masculin"]), feminin: nombre(c["feminin"]),
      moins_15: nombre(c["moins_15"]), de_15_a_59: nombre(c["de_15_a_59"]), plus_60: nombre(c["plus_60"]),
      secret: ["masculin", "feminin", "moins_15", "de_15_a_59", "plus_60"].some((k) => c[k] === "X"),
    };
  });
  return { ok: empreinte === a.empreinte.toLowerCase(), empreinte, lignes };
}

/**
 * Les métadonnées d'une source (titre, producteur, thème, couverture, description) suivent toujours la fiche, même sans
 * nouvelle version : une fiche corrigée range la source au bon endroit du catalogue au redéploiement.
 */
async function assurerSource(ex: Pool | PoolClient, fiche: FicheSource) {
  await ex.query(
    "UPDATE geodata_sources SET titre = $2, producteur = $3, theme = $4, couverture = $5, description = $6 WHERE cle = $1 AND espace_id IS NULL AND (titre, producteur, theme, couverture, description) IS DISTINCT FROM ($2, $3, $4, $5, $6)",
    [fiche.cle, fiche.titre, fiche.producteur, fiche.theme, fiche.couverture, fiche.description],
  );
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

/** Dossier des fiches qualifiées livrées (`geodata-sources` du bundle, ou `docs/geodata/sources` en développement). */
function dossierFiches(): string {
  for (const base of ["./geodata-sources/", "../../../../docs/geodata/sources/"]) {
    const dossier = fileURLToPath(new URL(base, import.meta.url));
    if (existsSync(dossier)) return dossier;
  }
  throw new Error("Aucun dossier de fiches qualifiées.");
}

function fichesLivrees(): string[] {
  const dossier = dossierFiches();
  return readdirSync(dossier).filter((f) => f.endsWith(".json")).sort().map((f) => join(dossier, f));
}

/**
 * Retraits déclarés (D-GD-23) : sources de référence remplacées, retirées du catalogue avec leur motif — seulement quand
 * leur remplaçante (`remplacePar`) a une version de référence publiée ; sinon l'ancienne source reste consultable.
 */
interface RetraitDeclare { cle: string; remplacePar: string; motif: string; decision: string }

function lireRetraits(): RetraitDeclare[] {
  const chemin = join(dossierFiches(), "donnees", "retraits-sources.json");
  if (!existsSync(chemin)) return [];
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  if (!Array.isArray(brut) || !brut.every((r) => r && typeof r.cle === "string" && typeof r.remplacePar === "string" && r.remplacePar !== r.cle && typeof r.motif === "string" && r.motif.trim().length >= 3 && typeof r.decision === "string")) {
    throw new Error("retraits-sources.json : liste de { cle, remplacePar, motif (3 caractères au moins), decision } attendue.");
  }
  return brut as RetraitDeclare[];
}

/** Retire les versions de référence publiées des sources déclarées, par le responsable de publication ; journalisé. */
async function appliquerRetraits(retraits: readonly RetraitDeclare[], publierPar: string | null) {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    // Sans compte (`--livraison`) : acteur nul, journal « livraison ».
    const publieur = publierPar === null ? null : ((await pool.query("SELECT u.id FROM users u JOIN geodata_roles g ON g.user_id = u.id AND g.role = 'responsable-publication' WHERE lower(u.email) = lower($1)", [publierPar])).rows[0]?.id as string | undefined);
    if (publieur === undefined) throw new Error(`${publierPar} n'a pas le rôle GeoData « responsable-publication » : aucun retrait appliqué.`);
    for (const r of retraits) {
      // Jamais de couche retirée sans sa remplaçante publiée (import ou publication échoués : l'ancienne reste).
      const remplacante = (await pool.query("SELECT 1 FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = $1 AND v.espace_id IS NULL AND v.etat = 'publiee' LIMIT 1", [r.remplacePar])).rows.length > 0;
      if (!remplacante) {
        console.error(`Retrait refusé : ${r.cle} reste consultable, sa remplaçante ${r.remplacePar} n'a pas de version publiée.`);
        continue;
      }
      const ids = (await pool.query(
        `UPDATE geodata_versions v SET etat = 'retiree', retiree_le = now(), motif_retrait = $2 FROM geodata_sources s
          WHERE s.id = v.source_id AND s.cle = $1 AND v.espace_id IS NULL AND v.etat = 'publiee' RETURNING v.id`,
        [r.cle, `${r.motif.trim()} (${r.decision})`.slice(0, 500)],
      )).rows.map((x) => x.id as string);
      for (const id of ids) {
        await pool.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'version.retiree', $2, 'succes', $3)", [publieur, id, JSON.stringify(publieur ? {} : { par: "livraison" })]);
        console.log(`Retrait : ${r.cle} (${id}) — ${r.motif}`);
      }
    }
  } finally {
    await pool.end();
  }
}

/**
 * Archive en base de tous les fichiers livrés (D-GD-29), puis découpage territorial (D-GD-28) chargé depuis les versions
 * **déjà publiées** des fiches qui le déclarent : rien n'est publié ici, aucun compte n'est requis ; idempotent.
 */
async function archiver() {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    console.log(ligneBilanArchive(await archiverFichiers(pool, dossierFiches())));
    for (const chemin of fichesLivrees()) {
      try {
        const fiche = JSON.parse(readFileSync(chemin, "utf8")) as FicheSource;
        if (fiche.territoire !== undefined) await assurerTerritoires(pool, fiche, empreinteAttendue(fiche));
      } catch (e) {
        console.error(`Découpage territorial non chargé (${basename(chemin, ".json")}) : ${e instanceof Error ? e.message : e}`);
      }
    }
  } finally {
    await pool.end();
  }
}

/**
 * `--decoupage [pays]` (D-GD-35) : import **unique** du découpage administratif en base, lancé une fois par l'exploitant
 * sur le serveur (jamais au démarrage de l'API). Relancé sur le même fichier : « déjà importé », rien n'est fait ; un
 * nouveau fichier met à jour les entités par leur code, sans doublon, et affiche le bilan. Les unités du découpage
 * territorial déjà publiées sont ensuite (re)chargées depuis leurs fiches, pour que la barre suive sans redémarrage.
 */
async function decoupage(pays: string | undefined, dossierDonne: string | undefined) {
  const dossier = dossierDonne ?? dossierFiches();
  const dossierDecoupage = join(dossier, "decoupage");
  const declarations = existsSync(dossierDecoupage)
    ? readdirSync(dossierDecoupage).filter((f) => /^[a-z]{2}\.json$/.test(f) && (!pays || f === `${pays.toLowerCase()}.json`)).sort()
    : [];
  if (!declarations.length) throw new Error(`Aucune déclaration de découpage${pays ? ` pour ${pays}` : ""} (decoupage/<pays>.json).`);
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const client = await pool.connect();
  try {
    for (const f of declarations) console.log(ligneBilanDecoupage(await importerDecoupage(client, dossier, `decoupage/${f}`)));
  } finally {
    client.release();
  }
  try {
    for (const chemin of dossierDonne ? readdirSync(dossier).filter((f) => f.endsWith(".json")).map((f) => join(dossier, f)) : fichesLivrees()) {
      const fiche = JSON.parse(readFileSync(chemin, "utf8")) as FicheSource;
      if (fiche.territoire === undefined) continue;
      try { await assurerTerritoires(pool, fiche, empreinteAttendue(fiche)); }
      catch (e) { console.error(`Découpage territorial non chargé (${fiche.cle}) : ${e instanceof Error ? e.message : e}`); }
    }
  } finally {
    await pool.end();
  }
}

/** `--livraison` : préparation et publication par la chaîne de livraison, sans compte (D-GD-29). */
const LIVRAISON = process.argv.includes("--livraison");
/** Publication demandée : par un compte (`--publier-par`) ou par la livraison. */
const publicationDemandee = () => LIVRAISON || argument("publier-par") !== undefined;

async function main() {
  const argFiche = argument("fiche");
  const preparateur = argument("preparateur") ?? null;
  if (process.argv.includes("--decoupage")) {
    const p = argument("decoupage");
    // `--dossier <chemin>` : autre dossier de sources (jeu synthétique de la recette) ; sinon les fiches livrées.
    await decoupage(p && /^[A-Za-z]{2}$/.test(p) ? p.toUpperCase() : undefined, argument("dossier"));
    return;
  }
  if (process.argv.includes("--archiver")) {
    await archiver();
    if (!argFiche) return;
  }
  if (LIVRAISON && (preparateur || argument("publier-par"))) throw new Error("--livraison ne se combine pas avec --preparateur ni --publier-par.");
  if (!argFiche || (!preparateur && !LIVRAISON)) throw new Error("Usage : --fiche <fiche.json | nom | toutes> (--preparateur <courriel> [--publier-par <courriel>] | --livraison) [--fichier <données>] [--table <table>] [--archiver]");
  if (argFiche !== "toutes") return importer(cheminFiche(argFiche), preparateur);
  // Toutes les fiches livrées, une à une (une transaction chacune) : un échec n'arrête pas les suivantes ; bilan final.
  if (argument("fichier")) throw new Error("--fichier ne s'emploie pas avec --fiche toutes.");
  const echecs: string[] = [];
  for (const chemin of fichesLivrees()) {
    console.log(`\n=== ${basename(chemin, ".json")} ===`);
    try { await importer(chemin, preparateur); } catch (e) { echecs.push(basename(chemin, ".json")); console.error(e instanceof Error ? e.message : e); }
  }
  const retraits = lireRetraits();
  const publierPar = argument("publier-par") ?? null;
  if (retraits.length && (publierPar || LIVRAISON)) await appliquerRetraits(retraits, publierPar);
  else if (retraits.length) console.log(`${retraits.length} retrait(s) déclaré(s), non appliqué(s) sans --publier-par ni --livraison.`);
  if (echecs.length) throw new Error(`\nÉchec pour ${echecs.length} fiche(s) : ${echecs.join(", ")}.`);
  console.log("\nToutes les fiches livrées ont été traitées.");
}

async function importer(chemin: string, preparateur: string | null) {
  const fiche = JSON.parse(readFileSync(chemin, "utf8")) as FicheSource;
  if (!argument("fichier")) {
    // Version déjà en base (empreinte attendue, lue dans la fiche) : ni lecture ni téléchargement ; une version encore en
    // préparation suit le chemin normal si --publier-par est donné (reprise de la publication).
    const pre = new Pool({ connectionString: process.env["DATABASE_URL"] });
    try {
      const [deja] = (await pre.query("SELECT v.id, v.etat FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = $1 AND v.empreinte = $2 AND v.espace_id IS NULL", [fiche.cle, empreinteAttendue(fiche)])).rows;
      if (deja && !(publicationDemandee() && deja.etat === "preparation")) {
        console.log(`Version déjà présente (même source, empreinte identique) : ${deja.id} (${deja.etat}) ; aucune nouvelle version.`);
        await assurerSource(pre, fiche);
        await assurerTerritoires(pre, fiche, empreinteAttendue(fiche));
        return;
      }
    } finally {
      await pre.end();
    }
  }
  let octets: Buffer;
  let nomFichier: string;
  // Fichier : --fichier, sinon celui livré avec la fiche (`version.fichier`, sans remontée de dossier), sinon l'adresse.
  const livre = fiche.version.fichier && /^[a-z0-9/_.-]+$/.test(fiche.version.fichier) && !fiche.version.fichier.includes("..") ? join(dirname(chemin), fiche.version.fichier) : undefined;
  const fichier = argument("fichier") ?? livre;
  if (fichier) { octets = readFileSync(fichier); nomFichier = basename(fichier); }
  else {
    if (!fiche.version.url) throw new Error("Ni --fichier ni adresse de téléchargement dans la fiche.");
    const r = await fetch(fiche.version.url);
    if (!r.ok) throw new Error(`Téléchargement refusé (${r.status}) : ${fiche.version.url}`);
    octets = Buffer.from(await r.arrayBuffer());
    nomFichier = basename(new URL(fiche.version.url).pathname);
  }
  const empreinteFichier = createHash("sha256").update(octets).digest("hex");
  const empreinteOk = empreinteFichier === fiche.version.empreinte.toLowerCase();
  // Tableau de valeurs (lot A2) : empreinte contrôlée ; l'empreinte de la version couvre le fichier ET le tableau.
  const tableau = lireTableau(fiche, chemin);
  const douars = lireDouars(fiche, chemin);
  const empreinte = tableau ? createHash("sha256").update(`${empreinteFichier}:${tableau.empreinte}${douars ? `:${douars.empreinte}` : ""}`).digest("hex") : empreinteFichier;
  let crsSource = "WGS 84 (CRS84)";
  let objets: ObjetImporte[] = [];
  let controles: Record<string, unknown> & { ok: boolean };
  let raster: { grille: GrilleRaster; description: DescriptionRaster } | undefined;
  let lecture = "GeoJSON ; géométries conservées en WGS 84 sans reprojection";
  if (/\.tiff?$/i.test(nomFichier)) {
    // Couche raster (D-GD-13) : GeoTIFF EPSG:4326, symbologie déclarée par la fiche (couche.raster).
    const decl = fiche.couche.raster;
    const d = validerDeclarationRaster(decl);
    if (!d.ok || !decl) throw new Error(`Fiche raster incomplète : ${d.ok ? "couche.raster absent" : d.erreurs.join(" ; ")}`);
    const r = await lireGeoTiff(octets);
    const bornes = decl.min !== undefined && decl.max !== undefined ? { min: decl.min, max: decl.max } : bornesRobustes(r.grille.valeurs, r.grille.nodata);
    const valides = r.grille.valeurs.reduce((n, x) => n + (Number.isFinite(x) && x !== r.grille.nodata ? 1 : 0), 0);
    crsSource = r.crs;
    raster = {
      grille: r.grille,
      description: { unite: decl.unite, grandeur: decl.grandeur, palette: decl.palette, min: bornes?.min ?? 0, max: bornes?.max ?? 1, classes: decl.classes ?? null, largeur: r.grille.largeur, hauteur: r.grille.hauteur, emprise: r.grille.emprise },
    };
    lecture = `GeoTIFF ${r.tailleSource[0]} × ${r.tailleSource[1]} pixels, première bande, EPSG:4326 sans reprojection${r.reechantillonne ? ` ; grille ramenée à ${r.grille.largeur} × ${r.grille.hauteur} cellules (plus proche voisin, au plus ${MAX_PIXELS_RASTER} cellules)` : ""}${decl.min === undefined ? " ; bornes de la palette = 2ᵉ et 98ᵉ centiles des valeurs présentes" : ""}`;
    controles = { ok: empreinteOk && valides > 0, empreinte: { attendue: fiche.version.empreinte, calculee: empreinte, conforme: empreinteOk }, raster: { largeur: r.grille.largeur, hauteur: r.grille.hauteur, cellulesValides: valides, nodata: r.grille.nodata, emprise: r.grille.emprise }, controleLe: new Date().toISOString() };
    console.log(JSON.stringify({ fichier: nomFichier, raster: controles["raster"], controlesOk: controles.ok, empreinteOk }, null, 2));
    if (!valides) throw new Error("Aucune cellule valide dans le raster : aucune version préparée.");
  } else {
    let brut: unknown;
    if (/\.gpkg$/i.test(nomFichier)) {
      if (!fichier) throw new Error("Un GeoPackage se lit depuis un fichier local (--fichier).");
      const g = lireGeoPackage(fichier, argument("table"));
      brut = g.geojson;
      crsSource = `${g.crs} (GeoPackage, table ${g.table})`;
      lecture = "GeoPackage (WKB → GeoJSON) ; géométries conservées en WGS 84 sans reprojection";
    } else brut = JSON.parse(octets.toString("utf8"));
    // Une couche V1 compte au plus OBJETS_PAR_COUCHE objets : c'est la borne des valeurs d'indicateur servies d'un bloc au
    // navigateur (classification, légende, carte thématique) ; au-delà, la couche est refusée plutôt que tronquée.
    const v = validerGeoJSON(brut, { octets: 200 * 1024 * 1024, objets: OBJETS_PAR_COUCHE, sommets: 20_000_000, proprietes: 200, longueurTexte: 2000 });
    objets = v.ok ? [...v.objets] : [];
    const { doublons, manquants } = codesDesObjets(objets, fiche.couche.champCode);
    controles = {
      ok: empreinteOk && v.ok && doublons.length === 0 && manquants === 0 && (!tableau || tableau.ok) && (!douars || douars.ok),
      empreinte: { attendue: fiche.version.empreinte, calculee: empreinteFichier, conforme: empreinteOk },
      ...(douars ? { douars: { fichier: fiche.version.annexes!.douars!.fichier, empreinte: douars.empreinte, conforme: douars.ok, lignes: douars.lignes.length } } : {}),
      ...(tableau ? { tableau: { fichier: fiche.version.tableau!.fichier, empreinte: tableau.empreinte, conforme: tableau.ok, lignes: tableau.lignes, colonnes: tableau.colonnes.size } } : {}),
      validation: v.rapport, codes: { champ: fiche.couche.champCode, doublons, manquants }, controleLe: new Date().toISOString(),
    };
    console.log(JSON.stringify({ fichier: nomFichier, objets: v.rapport.objets, sommets: v.rapport.sommets, controlesOk: controles.ok, empreinteOk, doublons: doublons.length, manquants, diagnostics: v.rapport.diagnostics.slice(0, 10) }, null, 2));
    if (!v.ok) throw new Error("Validation refusée : aucune version préparée.");
    if (doublons.length) throw new Error(`Codes en double (${doublons.slice(0, 5).join(", ")}) : aucune version préparée.`);
  }
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const client = await pool.connect();
  try {
    const role = async (email: string, r: string) => (await client.query("SELECT u.id FROM users u JOIN geodata_roles g ON g.user_id = u.id AND g.role = $2 WHERE lower(u.email) = lower($1)", [email, r])).rows[0]?.id as string | undefined;
    const [deja] = (await client.query("SELECT v.id, v.etat FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = $1 AND v.empreinte = $2 AND v.espace_id IS NULL", [fiche.cle, empreinte])).rows;
    const publierPar = argument("publier-par") ?? null;
    // Publication : droits et contrôles relus dans la version ENREGISTRÉE (jamais ceux de la fiche courante), comme la
    // route POST /geodata/api/admin/versions/:id/publier ; une version publiée est immuable, rien n'est corrigé après coup.
    // Par un compte (`--publier-par`, rôle « responsable-publication »), ou par la livraison (`--livraison`, acteur nul).
    const publier = async (versionId: string) => {
      const publieurId = publierPar === null ? null : await role(publierPar, "responsable-publication");
      if (publieurId === undefined) throw new Error(`${publierPar} n'a pas le rôle GeoData « responsable-publication » : version ${versionId} laissée en préparation.`);
      const [v] = (await client.query("SELECT droits, (controles->>'ok')::boolean AS ok FROM geodata_versions WHERE id = $1 AND etat = 'preparation'", [versionId])).rows;
      if (!v) throw new Error(`Version ${versionId} absente ou déjà hors préparation : rien n'est publié.`);
      const droits = lireDroits(v.droits);
      const bloque = (["consultation", "tuiles"] as const).map((u) => verifierUsage(droits, u)).filter((d) => !d.ok);
      if (bloque.length || v.ok !== true) throw new Error(`Publication bloquée (droits enregistrés ou contrôles) : version ${versionId} laissée en préparation.`);
      await client.query("UPDATE geodata_versions SET etat = 'publiee', publiee_par = $2, publiee_le = now() WHERE id = $1 AND etat = 'preparation'", [versionId, publieurId]);
      await client.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'version.publiee', $2, 'succes', $3)", [publieurId, versionId, JSON.stringify(publieurId ? {} : { par: "livraison" })]);
      console.log(`Version ${versionId} publiée par ${publierPar ?? "la livraison"}.`);
    };
    if (deja) {
      console.log(`Version déjà présente (même source, empreinte identique) : ${deja.id} (${deja.etat}) ; aucune nouvelle version.`);
      await assurerSource(client, fiche);
      if (publicationDemandee() && deja.etat === "preparation") {
        // Reprise du parcours en deux temps : la version préparée plus tôt est publiée, aux conditions qu'elle porte.
        await publier(deja.id);
      }
      await assurerTerritoires(client, fiche, empreinte);
      return;
    }
    const prepareParId = preparateur === null ? null : await role(preparateur, "gestionnaire-donnees");
    if (prepareParId === undefined) throw new Error(`${preparateur} n'a pas le rôle GeoData « gestionnaire-donnees ».`);
    await client.query("BEGIN");
    const ecrite = await ecrireVersion(client, {
      source: { cle: fiche.cle, titre: fiche.titre, producteur: fiche.producteur, theme: fiche.theme, couverture: fiche.couverture, description: fiche.description },
      espaceId: null,
      version: {
        libelle: fiche.version.libelle, empreinte, fichierNom: nomFichier, fichierTaille: fichier ? statSync(fichier).size : octets.length, urlSource: fiche.version.url,
        recupereLe: new Date().toISOString(), periode: fiche.version.periode, licence: fiche.version.licence,
        attribution: fiche.version.attribution, droits: lireDroits(fiche.version.droits), crsSource, precision: fiche.version.precision,
        transformations: [`Lecture ${lecture}`, ...(fiche.version.conditions ? [`Conditions : ${fiche.version.conditions}`] : [])],
        controles, synthetique: fiche.version.synthetique,
      },
      couche: { ...fiche.couche, styleDefaut: raster ? { mode: "raster" } : fiche.couche.styleDefaut },
      objets, indicateurs: raster ? [] : (fiche.indicateurs ?? []).map((i) => (tableau ? { ...i, valeurs: tableau.colonnes.get(i.propriete) ?? new Map(), signes: tableau.signes } : i)), superficie: !raster && fiche.superficie !== false, preparePar: prepareParId,
      ...(douars ? { douars: douars.lignes } : {}),
      ...(raster ? { raster } : {}),
    });
    await client.query("COMMIT");
    console.log(`Version préparée : ${ecrite.versionId} (couche ${ecrite.coucheId}, ${ecrite.objets} objets, ${ecrite.reparees} géométrie(s) réparée(s), ${ecrite.indicateurs.length} indicateur(s)).`);
    if (publicationDemandee()) { await publier(ecrite.versionId); await assurerTerritoires(client, fiche, empreinte); }
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
