/**
 * Chaîne administrative d'import de référence GeoData (D-GD-04, D-GD-07, plan GD-03) :
 *
 *   npm run geodata:import-reference -- --fiche <fiche.json | nom | toutes> [--fichier <données.geojson|.gpkg>] [--table <table>]
 *        --preparateur <courriel> [--publier-par <courriel>]
 *   (image de production : node apps/api/dist/geodata-reference.js --fiche geoboundaries-mar-adm1 --preparateur …)
 *
 * Les données sont lues de `--fichier`, sinon du fichier livré avec la fiche (`version.fichier`, ex. extractions
 * OpenStreetMap de `docs/geodata/sources/osm/`), sinon téléchargées depuis `version.url`.
 *
 * `--fiche toutes` traite une à une toutes les fiches livrées (une déjà importée n'est pas recréée).
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
import { Pool } from "pg";
import { bornesRobustes, estMotifAbsence, lireDroits, type MotifAbsence, MAX_PIXELS_RASTER, OBJETS_PAR_COUCHE, validerDeclarationRaster, validerGeoJSON, verifierUsage, type ClasseRaster, type DescriptionRaster, type ObjetImporte, type PaletteRaster, type StyleCouche } from "@parcours/geodata-model";
import { lireGeoTiff, type GrilleRaster } from "../lib/geodata/raster.js";
import { lireGeoPackage } from "../lib/geodata/geopackage.js";
import { codesDesObjets, ecrireVersion, type IndicateurDeclare } from "../lib/geodata/versions.js";

export interface FicheSource {
  cle: string; titre: string; producteur: string; theme: string; couverture: string; description: string;
  version: {
    libelle: string; url: string | null; /** Fichier livré avec la fiche (chemin relatif au dossier des fiches), à défaut d'adresse. */ fichier?: string; empreinte: string; periode: string | null; licence: string; attribution: string; droits: Record<string, string>; precision: string | null; synthetique: boolean; conditions?: string;
    /**
     * Tableau de valeurs livré avec la fiche (D-GD-17, lot A2) : CSV « code,colonne… », une ligne par objet ; chaque
     * indicateur lit sa colonne (`propriete`). Les signes conventionnels déclarés donnent leur motif d'absence.
     */
    tableau?: { fichier: string; empreinte: string; signes?: Record<string, string> };
  };
  couche: {
    titre: string; description: string; niveau: string | null; champCode: string; champNom: string | null; proprietesExposees: string[]; styleDefaut: StyleCouche;
    /** Couche raster (données GeoTIFF) : symbologie ; bornes absentes = 2ᵉ et 98ᵉ centiles des valeurs. */
    raster?: { unite: string | null; grandeur: string; palette: PaletteRaster; min?: number; max?: number; classes?: ClasseRaster[] | null };
  };
  indicateurs?: IndicateurDeclare[];
  superficie?: boolean;
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

/** Fiches qualifiées livrées (dossier `geodata-sources` du bundle, ou `docs/geodata/sources` en développement). */
function fichesLivrees(): string[] {
  for (const base of ["./geodata-sources/", "../../../../docs/geodata/sources/"]) {
    const dossier = fileURLToPath(new URL(base, import.meta.url));
    if (existsSync(dossier)) return readdirSync(dossier).filter((f) => f.endsWith(".json")).sort().map((f) => join(dossier, f));
  }
  throw new Error("Aucun dossier de fiches qualifiées.");
}

async function main() {
  const argFiche = argument("fiche");
  const preparateur = argument("preparateur");
  if (!argFiche || !preparateur) throw new Error("Usage : --fiche <fiche.json | nom | toutes> --preparateur <courriel> [--fichier <données>] [--table <table>] [--publier-par <courriel>]");
  if (argFiche !== "toutes") return importer(cheminFiche(argFiche), preparateur);
  // Toutes les fiches livrées, une à une (une transaction chacune) : un échec n'arrête pas les suivantes ; bilan final.
  if (argument("fichier")) throw new Error("--fichier ne s'emploie pas avec --fiche toutes.");
  const echecs: string[] = [];
  for (const chemin of fichesLivrees()) {
    console.log(`\n=== ${basename(chemin, ".json")} ===`);
    try { await importer(chemin, preparateur); } catch (e) { echecs.push(basename(chemin, ".json")); console.error(e instanceof Error ? e.message : e); }
  }
  if (echecs.length) throw new Error(`\nÉchec pour ${echecs.length} fiche(s) : ${echecs.join(", ")}.`);
  console.log("\nToutes les fiches livrées ont été traitées.");
}

async function importer(chemin: string, preparateur: string) {
  const fiche = JSON.parse(readFileSync(chemin, "utf8")) as FicheSource;
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
  const empreinte = tableau ? createHash("sha256").update(`${empreinteFichier}:${tableau.empreinte}`).digest("hex") : empreinteFichier;
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
      ok: empreinteOk && v.ok && doublons.length === 0 && manquants === 0 && (!tableau || tableau.ok),
      empreinte: { attendue: fiche.version.empreinte, calculee: empreinteFichier, conforme: empreinteOk },
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
    const publierPar = argument("publier-par");
    // Publication : droits et contrôles relus dans la version ENREGISTRÉE (jamais ceux de la fiche courante), comme la
    // route POST /geodata/api/admin/versions/:id/publier ; une version publiée est immuable, rien n'est corrigé après coup.
    const publier = async (versionId: string) => {
      const publieurId = await role(publierPar!, "responsable-publication");
      if (!publieurId) throw new Error(`${publierPar} n'a pas le rôle GeoData « responsable-publication » : version ${versionId} laissée en préparation.`);
      const [v] = (await client.query("SELECT droits, (controles->>'ok')::boolean AS ok FROM geodata_versions WHERE id = $1 AND etat = 'preparation'", [versionId])).rows;
      if (!v) throw new Error(`Version ${versionId} absente ou déjà hors préparation : rien n'est publié.`);
      const droits = lireDroits(v.droits);
      const bloque = (["consultation", "tuiles"] as const).map((u) => verifierUsage(droits, u)).filter((d) => !d.ok);
      if (bloque.length || v.ok !== true) throw new Error(`Publication bloquée (droits enregistrés ou contrôles) : version ${versionId} laissée en préparation.`);
      await client.query("UPDATE geodata_versions SET etat = 'publiee', publiee_par = $2, publiee_le = now() WHERE id = $1 AND etat = 'preparation'", [versionId, publieurId]);
      await client.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat) VALUES ($1, 'version.publiee', $2, 'succes')", [publieurId, versionId]);
      console.log(`Version ${versionId} publiée par ${publierPar}.`);
    };
    if (deja) {
      console.log(`Version déjà présente (même source, empreinte identique) : ${deja.id} (${deja.etat}) ; aucune nouvelle version.`);
      if (publierPar && deja.etat === "preparation") {
        // Reprise du parcours en deux temps : la version préparée plus tôt est publiée, aux conditions qu'elle porte.
        await publier(deja.id);
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
        transformations: [`Lecture ${lecture}`, ...(fiche.version.conditions ? [`Conditions : ${fiche.version.conditions}`] : [])],
        controles, synthetique: fiche.version.synthetique,
      },
      couche: { ...fiche.couche, styleDefaut: raster ? { mode: "raster" } : fiche.couche.styleDefaut },
      objets, indicateurs: raster ? [] : (fiche.indicateurs ?? []).map((i) => (tableau ? { ...i, valeurs: tableau.colonnes.get(i.propriete) ?? new Map(), signes: tableau.signes } : i)), superficie: !raster && fiche.superficie !== false, preparePar: prepareParId,
      ...(raster ? { raster } : {}),
    });
    await client.query("COMMIT");
    console.log(`Version préparée : ${ecrite.versionId} (couche ${ecrite.coucheId}, ${ecrite.objets} objets, ${ecrite.reparees} géométrie(s) réparée(s), ${ecrite.indicateurs.length} indicateur(s)).`);
    if (publierPar) await publier(ecrite.versionId);
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
