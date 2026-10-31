/**
 * Scénarios d'intégration des prix immobiliers de GeoData (Plan Prix §8, PRX01 à PRX14), écrits une fois et joués par
 * `geodata-prix.test.ts` contre la base de test attestée (garde DB-3). Ils ne dépendent que de l'application Express et
 * d'un exécuteur SQL : aucune base n'est choisie ici.
 *
 * Données : la fiche FeenWay et le registre des sources RÉELS du dépôt ; tout le reste est SYNTHÉTIQUE et n'existe que
 * dans la base de test — sources « synthetique-* » marquées actives ici seulement, pays « QZ », territoires
 * « Commune synthétique ». Ces jeux ne sont jamais livrés comme des prix.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Express } from "express";
import type { Pool } from "pg";
import request from "supertest";
import { COMPOSITION_INITIALE, lireDroits, validerGeoJSON } from "@parcours/geodata-model";
import { codesDesObjets, ecrireVersion } from "../lib/geodata/versions.js";
import { empreinteAttendue } from "../lib/geodata/empreinte-fiche.js";
import { lignesPrixDeLaCouche, lireAnnexePrix } from "../lib/geodata/prix/agregats.js";
import { changerStatutSource } from "../lib/geodata/prix/pipeline.js";
import { chargerRegistrePrix } from "../lib/geodata/prix/registre.js";
import { restaurerPrix, sauvegarderPrix, TABLES_PRIX_SAUVEGARDEES } from "../lib/geodata/prix/sauvegarde.js";
import { horlogePrix } from "./geodata/prix.js";
import type { FicheSource } from "../db/geodata-reference.js";

export interface ContexteEssai { readonly app: Express; readonly pool: Pool }

/**
 * Date d'essai figée : l'horloge des prix (`horlogePrix`) est fixée au 31 octobre 2026 à midi (UTC) pour chaque
 * scénario ; fraîcheur, comparaisons et dates de référence ne dépendent jamais de la date réelle d'exécution.
 */
export const DATE_ESSAI = "2026-10-31";
export function figerHorloge(): void {
  horlogePrix.maintenant = () => new Date(`${DATE_ESSAI}T12:00:00Z`);
}

const API = "/geodata/api";
const PASSWORD = "correct-horse-battery";
export const DOSSIER_SOURCES = fileURLToPath(new URL("../../../../docs/geodata/sources/", import.meta.url));

type Agent = ReturnType<typeof request.agent>;

async function compte(ctx: ContexteEssai, email: string, ...roles: string[]): Promise<{ client: Agent; id: string }> {
  const client = request.agent(ctx.app);
  const r = await client.post("/auth/register").send({ email, password: PASSWORD });
  assert.equal(r.status, 201, `inscription ${email}`);
  for (const role of roles) await ctx.pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, $2)", [r.body.id, role]);
  return { client, id: r.body.id as string };
}

async function enTransaction<T>(ctx: ContexteEssai, f: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const c = await ctx.pool.connect();
  try {
    await c.query("BEGIN");
    const r = await f(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally { c.release(); }
}

export const chargerRegistre = (ctx: ContexteEssai) => enTransaction(ctx, (c) => chargerRegistrePrix(c, DOSSIER_SOURCES));

/** Version de la fiche FeenWay réelle, écrite comme la chaîne d'import (`geodata-reference.ts`) puis publiée. */
export async function importerFicheFeenway(ctx: ContexteEssai) {
  const fiche = JSON.parse(readFileSync(join(DOSSIER_SOURCES, "feenway-barometre-casablanca.json"), "utf8")) as FicheSource;
  const prix = lireAnnexePrix(fiche.version.annexes!.prixPublies!, DOSSIER_SOURCES, fiche.version.libelle);
  assert.equal(prix.ok, true, "empreinte de l'annexe conforme à la fiche");
  assert.deepEqual(prix.lecture.erreurs, []);
  const v = validerGeoJSON(JSON.parse(readFileSync(join(DOSSIER_SOURCES, fiche.version.fichier!), "utf8")));
  assert.ok(v.ok);
  const objets = v.ok ? [...v.objets] : [];
  const lignes = lignesPrixDeLaCouche(prix.lecture, objets, codesDesObjets(objets, fiche.couche.champCode).codes);
  const empreinte = empreinteAttendue(fiche);
  const e = await enTransaction(ctx, async (c) => {
    // Même contrôle que la chaîne d'import : une version de même source et de même empreinte n'est jamais recréée.
    const [deja] = (await c.query("SELECT v.id FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = $1 AND v.empreinte = $2 AND v.espace_id IS NULL", [fiche.cle, empreinte])).rows;
    if (deja) return { versionId: deja.id as string, coucheId: (await c.query("SELECT id FROM geodata_couches WHERE version_id = $1", [deja.id])).rows[0].id as string, deja: true };
    const w = await ecrireVersion(c, {
      source: { cle: fiche.cle, titre: fiche.titre, producteur: fiche.producteur, theme: fiche.theme, couverture: fiche.couverture, description: fiche.description },
      espaceId: null,
      version: {
        libelle: fiche.version.libelle, empreinte, fichierNom: "feenway-barometre-casablanca.geojson", fichierTaille: 1, urlSource: null, recupereLe: null, periode: fiche.version.periode,
        licence: fiche.version.licence, attribution: fiche.version.attribution, droits: lireDroits(fiche.version.droits), crsSource: "WGS 84 (CRS84)", precision: fiche.version.precision,
        transformations: [], controles: { ok: true, prixPublies: { conforme: prix.ok, retenues: lignes.length } }, synthetique: false,
      },
      couche: fiche.couche, objets, indicateurs: [], superficie: false, preparePar: null, prixPublies: lignes,
    });
    await c.query("UPDATE geodata_versions SET etat = 'publiee', publiee_le = clock_timestamp() WHERE id = $1", [w.versionId]);
    return { versionId: w.versionId, coucheId: w.coucheId, deja: false };
  });
  return { ...e, fiche, lignes };
}

// ——— Jeux synthétiques ———

/** Pays « QZ » synthétique : une commune et un arrondissement (rangs 3 et 5), tables du découpage administratif. */
export async function territoiresSynthetiques(ctx: ContexteEssai) {
  await ctx.pool.query("INSERT INTO geodata_pays (code, nom) VALUES ('QZ', 'Pays synthétique (test)') ON CONFLICT DO NOTHING");
  await ctx.pool.query(`INSERT INTO geodata_niveaux_administratifs (pays, code, rang, singulier, pluriel) VALUES ('QZ', 'commune', 3, 'commune', 'communes'), ('QZ', 'arrondissement', 5, 'arrondissement', 'arrondissements') ON CONFLICT DO NOTHING`);
  await ctx.pool.query(`INSERT INTO geodata_entites_administratives (pays, code, niveau, parent_code, nom, source) VALUES
    ('QZ', 'QZ-C1', 'commune', NULL, 'Commune synthétique', 'test synthétique'),
    ('QZ', 'QZ-A1', 'arrondissement', 'QZ-C1', 'Arrondissement synthétique', 'test synthétique') ON CONFLICT DO NOTHING`);
}

/** Source synthétique d'observations, active dans la base de test SEULEMENT. */
export async function sourceSynthetique(ctx: ContexteEssai, cle: string, statut = "active") {
  await ctx.pool.query(
    `INSERT INTO geodata_prix_sources (cle, titre, couche, produit, statut, editeur, derivee, motif) VALUES ($1, $2, 'annonces', 'observations', $3, 'Éditeur synthétique (test)', false, $4)`,
    [cle, `Source synthétique ${cle} (test)`, statut, statut === "active" ? null : "Source synthétique non autorisée (test)"],
  );
}

const ENTETE = ["annonce_id", "observe_le", "transaction", "type_bien", "etat_bien", "prix", "monnaie", "periode", "surface", "base_surface", "localite", "precision", "empreinte"] as const;
type Ligne = Partial<Record<(typeof ENTETE)[number], string | number>>;
const ligne = (id: string, jour: number, prix: number, surface: number, autre: Ligne = {}): Ligne => ({
  annonce_id: id, observe_le: `2026-10-${String(jour).padStart(2, "0")}`, transaction: "vente", type_bien: "appartement", etat_bien: "", prix, monnaie: "MAD", periode: "total",
  surface, base_surface: "habitable", localite: "Commune synthétique", precision: "commune", empreinte: `h-${id}`, ...autre,
});
const versCsv = (lignes: readonly Ligne[]) => [ENTETE.join(","), ...lignes.map((l) => ENTETE.map((k) => String(l[k] ?? "")).join(","))].join("\n");

/**
 * Fichier A (source synthetique-a) : 4 appartements en vente dans la commune (A1 porte une empreinte partagée avec B1),
 * un terrain à la parcelle, un loyer journalier, un loyer mensuel, un prix nul (quarantaine), une localité plus fine que
 * la précision déclarée (non rattachée).
 */
export const FICHIER_A = versCsv([
  ligne("A1", 10, 1_000_000, 100, { empreinte: "commun-1" }),
  ligne("A2", 11, 1_200_000, 100),
  ligne("A3", 12, 900_000, 90),
  ligne("A4", 13, 1_500_000, 100),
  ligne("A5", 14, 500_000, 250, { type_bien: "terrain", base_surface: "parcelle" }),
  ligne("A6", 15, 500, 50, { transaction: "location", periode: "jour" }),
  ligne("A7", 16, 6000, 60, { transaction: "location", periode: "mois" }),
  ligne("A8", 17, 0, 80),
  ligne("A9", 18, 1_100_000, 100, { localite: "Arrondissement synthétique" }),
]);
/** Fichier B (source synthetique-b) : B1 = même bien que A1 (empreinte égale, ±1 %) ; B2 ressemble à A2 (empreinte différente). */
export const FICHIER_B = versCsv([
  ligne("B1", 20, 1_010_000, 101, { empreinte: "commun-1" }),
  ligne("B2", 21, 1_210_000, 100),
]);

async function importer(client: Agent, source: string, contenu: string, edition = "Édition synthétique 1") {
  const a = await client.post(`${API}/prix/imports`).send({ source, pays: "QZ", edition: { libelle: edition }, format: "csv", contenu, mode: "apercu" });
  if (a.status !== 200) return a;
  return client.post(`${API}/prix/imports`).send({ source, pays: "QZ", edition: { libelle: edition }, format: "csv", contenu, mode: "valider", cleIdempotence: a.body.rapport.cleIdempotence });
}

const compter = async (ctx: ContexteEssai, sql: string, v: unknown[] = []) => Number((await ctx.pool.query(sql, v)).rows[0].n);

// ——— Scénarios ———

export async function prx01BaseVide(ctx: ContexteEssai) {
  figerHorloge();
  const { client } = await compte(ctx, "prix-vide@example.com");
  // Réponses privées jamais mises en cache (PRX10, PRX13) : un retrait se voit à la requête suivante.
  for (const chemin of ["/prix/sources", "/prix/couches", "/prix/agregats-publies", "/prix/cellules", "/prix/comparaison?code=X&type=appartement&transaction=vente", "/prix/officielles/zones/inconnue"]) {
    assert.equal((await client.get(`${API}${chemin}`)).headers["cache-control"], "private, no-store", chemin);
  }
  const s = await client.get(`${API}/prix/sources`);
  assert.equal(s.status, 200);
  assert.deepEqual(s.body, { sources: [], dossier: null, version: null, responsable: null, chargeLe: null });
  const c = await client.get(`${API}/prix/couches`);
  assert.deepEqual(c.body.couches.map((x: { couche: string; etat: string; motifs: string[]; details: string[] }) => [x.couche, x.etat, x.motifs, x.details]),
    [["officielle", "indisponible", ["aucune-source"], []], ["annonces", "indisponible", ["aucune-source"], []]]);
  assert.deepEqual(c.body.couches[1].produits.map((p: { produit: string; etat: string; motif: string }) => [p.produit, p.etat, p.motif]), [["agregat-publie", "indisponible", "aucune-source"], ["observations", "indisponible", "aucune-source"]]);
  assert.deepEqual((await client.get(`${API}/prix/agregats-publies?code=6141010`)).body, { editions: [], lignes: [] });
  const cel = await client.get(`${API}/prix/cellules`);
  assert.equal(cel.body.instantane, null);
  assert.deepEqual(cel.body.cellules, []);
  const cmp = await client.get(`${API}/prix/comparaison?code=6141010&type=appartement&transaction=vente`);
  assert.equal(cmp.body.comparable, false);
  assert.equal(cmp.body.motif, "aucune-reference-officielle");
  assert.deepEqual(cmp.body.coucheEnCause, { couche: "officielle", etat: "indisponible", motif: "aucune-source", detail: null });
  assert.equal(cmp.body.ecartPourcent, undefined);
}

export async function registreReel(ctx: ContexteEssai) {
  figerHorloge();
  const b = await chargerRegistre(ctx);
  assert.deepEqual(b, { etat: "charge", sources: 9, ajoutees: 9, modifiees: 0, statutsChanges: 0, retirees: 0 });
  assert.equal((await chargerRegistre(ctx)).etat, "inchange");
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_sources"), 9);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.source.ajoutee'"), 9);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_fichiers WHERE chemin = 'prix/prix-sources.json' AND role = 'prix' AND retire_le IS NULL"), 1);
  // Sources amont d'une source dérivée (agrégateur FeenWay), lues du registre.
  assert.deepEqual((await ctx.pool.query("SELECT amont FROM geodata_prix_sources WHERE cle = 'feenway-barometre'")).rows[0].amont, ["avito", "mubawab", "portails-candidats"]);
  const { client } = await compte(ctx, "prix-registre@example.com", "gestionnaire-donnees");
  const s = (await client.get(`${API}/prix/sources`)).body;
  assert.equal(s.sources.length, 9);
  assert.equal(s.dossier, "docs/workstreams/geodata/PRIX-SOURCES.md");
  const feenway = s.sources.find((x: { cle: string }) => x.cle === "feenway-barometre");
  assert.deepEqual([feenway.statut, feenway.couche, feenway.produit, feenway.ficheGeodata, feenway.revueLe, feenway.revueAvant], ["active", "annonces", "agregat-publie", "feenway-barometre-casablanca", "2026-10-31", "2027-01-31"]);
  const c = (await client.get(`${API}/prix/couches`)).body;
  const officielle = c.couches.find((x: { couche: string }) => x.couche === "officielle");
  assert.equal(officielle.etat, "non-autorise");
  assert.deepEqual(officielle.motifs, ["source-bloquee"]);
  assert.ok(officielle.details.some((m: string) => m.includes("DGI")), "motif de blocage de la DGI affiché");
  const annonces = c.couches.find((x: { couche: string }) => x.couche === "annonces");
  assert.deepEqual(annonces.produits.map((p: { produit: string; etat: string }) => [p.produit, p.etat]), [["agregat-publie", "indisponible"], ["observations", "non-autorise"]]);
  // Aucune source réelle d'observations n'est autorisée : l'import est refusé avec le motif enregistré au registre.
  const r = await client.post(`${API}/prix/imports`).send({ source: "mubawab", pays: "MA", edition: { libelle: "Essai refusé" }, format: "csv", contenu: FICHIER_A, mode: "apercu" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "source_non_autorisee");
  assert.match(r.body.message, /Conditions d'utilisation/);
  // Aucune édition officielle n'est autorisée : l'import de valeurs officielles est refusé avec le motif du registre.
  const o = await client.post(`${API}/prix/officielles/imports`).send({ source: "dgi-referentiel-casablanca", edition: { libelle: "Essai refusé", validite: "non-verifiee" }, format: "csv", contenu: FICHIER_OFFICIEL([ligneOfficielle()]), mode: "apercu" });
  assert.equal(o.status, 409);
  assert.equal(o.body.error, "source_non_autorisee");
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_lots"), 0);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.officielles.import.refuse'"), 1);
}

export async function feenwayReel(ctx: ContexteEssai) {
  figerHorloge();
  await chargerRegistre(ctx);
  const { client: admin } = await compte(ctx, "prix-admin@example.com", "administrateur");
  const { client: lecteur } = await compte(ctx, "prix-lecteur@example.com");
  const { client: gestion } = await compte(ctx, "prix-gestion-fw@example.com", "gestionnaire-donnees");
  const v = await importerFicheFeenway(ctx);
  assert.equal(v.deja, false);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1", [v.versionId]), 66);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1 AND code_rattache = '6141010' AND niveau_geo = 'ville'", [v.versionId]), 16);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1 AND code_rattache IS NULL AND etat_rattachement = 'non-rattache' AND niveau_geo = 'quartier-commercial'", [v.versionId]), 50);
  // Indicateur d'abréviation du prix au m² conservé comme celui du prix médian (≈) ; NULL quand rien n'est publié.
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1 AND (prix_m2 IS NULL) <> (prix_m2_approximatif IS NULL)", [v.versionId]), 0);
  // Réimport : même source, même empreinte → aucune nouvelle version (« Version déjà présente »).
  const again = await importerFicheFeenway(ctx);
  assert.equal(again.deja, true);
  assert.equal(again.versionId, v.versionId);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE s.cle = 'feenway-barometre-casablanca'"), 1);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies"), 66);
  // Contenu figé avec la version publiée.
  // La garde DB-3 masque le texte de l'erreur SQL : refus constaté, puis ligne vérifiée intacte.
  await assert.rejects(ctx.pool.query("UPDATE geodata_prix_agregats_publies SET nombre_annonces = 0 WHERE version_id = $1", [v.versionId]));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1 AND nombre_annonces = 0", [v.versionId]), 0);

  const a = (await lecteur.get(`${API}/prix/agregats-publies?code=6141010`)).body;
  assert.equal(a.editions.length, 1);
  assert.equal(a.editions[0].versionId, v.versionId);
  assert.equal(a.editions[0].coucheId, v.coucheId);
  assert.equal(a.editions[0].editeur, "FeenWay");
  assert.match(a.editions[0].attribution, /^Source : FeenWay/);
  assert.equal(a.lignes.length, 66);
  const racine = a.lignes.find((l: { libelleGeo: string; transaction: string }) => l.libelleGeo === "Racine" && l.transaction === "vente");
  assert.deepEqual(racine, {
    versionId: v.versionId, ordre: 1, niveauGeo: "quartier-commercial", libelleGeo: "Racine", ville: "Casablanca", codeRattache: null, etatRattachement: "non-rattache",
    typeBien: "appartement", typeBienOriginal: "APPARTEMENT", transaction: "vente", nombreAnnonces: 764,
    prixMedian: { valeur: 3_300_000, approximatif: true, texte: "3,3M DH" }, prixM2: { valeur: 18_548, approximatif: false, texte: "18\u00a0548 DH" }, unite: "MAD", uniteM2: "MAD/m2", tendance90j: -4.8,
    correspondance: null,
  });
  // Valeur non publiée (« — ») : null, jamais 0.
  const appartVille = a.lignes.filter((l: { niveauGeo: string; typeBien: string }) => l.niveauGeo === "ville" && l.typeBien === "appartement");
  assert.deepEqual(appartVille.map((l: { transaction: string; prixMedian: unknown; prixM2: unknown; nombreAnnonces: number }) => [l.transaction, l.prixMedian, l.prixM2, l.nombreAnnonces]),
    [["vente", null, { valeur: 14_000, approximatif: false, texte: "14 000 DH" }, 16_802], ["location", { valeur: 8_500, approximatif: false, texte: "8 500 DH/mois" }, null, 25_431]]);
  const villasLocation = (await lecteur.get(`${API}/prix/agregats-publies?code=6141010&transaction=location&type=villa`)).body.lignes;
  assert.equal(villasLocation.length, 1);
  assert.equal(villasLocation[0].codeRattache, "6141010");

  // Fiche d'objet : champs existants inchangés, agrégats rattachés à la commune et quartiers de la même édition.
  const f = (await lecteur.get(`${API}/couches/${v.coucheId}/objets/6141010`)).body;
  assert.equal(f.code, "6141010");
  assert.ok(Array.isArray(f.indicateurs) && Array.isArray(f.douars) && f.couche && f.proprietes);
  assert.equal(f.prixPublies.editions[0].versionId, v.versionId);
  assert.equal(f.prixPublies.lignes.length, 16);
  assert.ok(f.prixPublies.lignes.every((l: { codeRattache: string }) => l.codeRattache === "6141010"));
  assert.equal(f.prixPublies.nonRattaches.length, 50);

  const c = (await lecteur.get(`${API}/prix/couches`)).body.couches.find((x: { couche: string }) => x.couche === "annonces");
  const agregat = c.produits.find((p: { produit: string }) => p.produit === "agregat-publie");
  // Date figée (31 octobre 2026), période publiée jusqu'au 30 octobre : disponible, sans dépendre de la date réelle.
  assert.equal(agregat.etat, "disponible");
  assert.deepEqual(agregat.versionIds, [v.versionId]);

  // Catalogue : la couche FeenWay (thème prix-immobiliers) a sa catégorie « Prix immobiliers ».
  const cat = (await lecteur.get(`${API}/categories`)).body.categories;
  assert.ok(cat.some((k: { themes: string[]; libelle: string }) => k.themes.includes("prix-immobiliers") && k.libelle === "Prix immobiliers"));

  // Fail closed : une fiche que le registre des prix ne déclare plus n'est jamais servie comme agrégat publié (la
  // couche GeoData générique, elle, reste consultable : elle n'est alors liée à aucune source de prix).
  await ctx.pool.query("UPDATE geodata_prix_sources SET fiche_geodata = NULL WHERE cle = 'feenway-barometre'");
  assert.deepEqual((await lecteur.get(`${API}/prix/agregats-publies?code=6141010`)).body, { editions: [], lignes: [] });
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}/objets/6141010`)).body.prixPublies, null);
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}/objets/6141010`)).status, 200);
  await ctx.pool.query("UPDATE geodata_prix_sources SET fiche_geodata = 'feenway-barometre-casablanca' WHERE cle = 'feenway-barometre'");

  // Revue des libellés publiés non rattachés (quartiers commerciaux) : jamais de correspondance automatique.
  await territoiresSynthetiques(ctx);
  assert.equal((await lecteur.get(`${API}/prix/rattachements`)).status, 403);
  const file = (await gestion.get(`${API}/prix/rattachements?etat=a-revoir`)).body;
  const quartiers = new Set(v.lignes.filter((l) => l.niveauGeo === "quartier-commercial").map((l) => l.libelleGeo));
  assert.equal(file.libelles.length, quartiers.size);
  assert.ok(file.libelles.every((l: { cible: string; source: string; motif: string }) => l.cible === "libelle" && l.source === "feenway-barometre" && l.motif === "libelle-source-sans-correspondance"));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_decisions_rattachement"), 0);
  const gauthier = file.libelles.find((l: { libelle: string }) => l.libelle === "Gauthier");
  assert.ok(gauthier, "Gauthier dans la file de revue");
  assert.equal((await lecteur.post(`${API}/prix/rattachements/${encodeURIComponent(gauthier.id)}/decision`).send({ decision: "validee", territoire: { pays: "QZ", code: "QZ-A1" }, motif: "Essai interdit" })).status, 403);
  assert.equal((await gestion.post(`${API}/prix/rattachements/${encodeURIComponent(gauthier.id)}/decision`).send({ decision: "validee", motif: "Sans territoire" })).status, 400);
  assert.equal((await gestion.post(`${API}/prix/rattachements/${encodeURIComponent(gauthier.id)}/decision`).send({ decision: "validee", territoire: { pays: "QZ", code: "QZ-INCONNU" }, motif: "Territoire absent" })).status, 404);
  // Correspondance revue (territoire SYNTHÉTIQUE QZ-A1 de la base de test : mécanisme seulement, aucune vraie correspondance).
  const dec = await gestion.post(`${API}/prix/rattachements/${encodeURIComponent(gauthier.id)}/decision`).send({ decision: "validee", territoire: { pays: "QZ", code: "QZ-A1" }, motif: "Correspondance revue (essai synthétique)" });
  assert.equal(dec.status, 201);
  assert.deepEqual(dec.body.territoire, { pays: "QZ", code: "QZ-A1", niveau: "arrondissement" });
  const apres = (await gestion.get(`${API}/prix/rattachements?etat=a-revoir`)).body;
  assert.equal(apres.libelles.length, quartiers.size - 1);
  // La ligne publiée reste telle quelle (code nul) ; la correspondance revue est servie à côté, et retrouvée par son code.
  const parCorrespondance = (await lecteur.get(`${API}/prix/agregats-publies?code=QZ-A1`)).body.lignes;
  assert.ok(parCorrespondance.length >= 1 && parCorrespondance.every((l: { libelleGeo: string; codeRattache: null; correspondance: { code: string } }) => l.libelleGeo === "Gauthier" && l.codeRattache === null && l.correspondance.code === "QZ-A1"));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE libelle_geo = 'Gauthier' AND code_rattache IS NOT NULL"), 0);
  assert.equal((await gestion.get(`${API}/prix/rattachements?etat=revus`)).body.decisions[0].decision, "validee");
  await assert.rejects(ctx.pool.query("DELETE FROM geodata_prix_decisions_rattachement"));

  // Carte enregistrée avec la couche FeenWay (avant toute suspension) : export de carte soumis au même droit que
  // l'export des prix (`prix-exporter`) — refusé à la consultation seule, autorisé à un rôle GeoData.
  const comp = { ...COMPOSITION_INITIALE, couches: [{ coucheId: v.coucheId, versionId: v.versionId, visible: true, opacite: 0.75, filtre: null, style: { mode: "simple", couleur: "#2b8cbe" } }] };
  const carteLecteur = await lecteur.post(`${API}/cartes`).send({ nom: "Prix (lecteur)", composition: comp });
  const carteAdmin = await admin.post(`${API}/cartes`).send({ nom: "Prix (admin)", composition: comp });
  assert.equal(carteLecteur.status, 201);
  const refusLecteur = (await lecteur.post(`${API}/exports`).send({ carteId: carteLecteur.body.id, revisionAttendue: 1 })).body;
  assert.equal(refusLecteur.etat, "refuse");
  assert.match(refusLecteur.refus[0].motif, /prix immobiliers/);
  assert.equal((await admin.post(`${API}/exports`).send({ carteId: carteAdmin.body.id, revisionAttendue: 1 })).body.etat, "autorise");

  // PRX13 : la suspension de la source retire les agrégats ET la couche GeoData générique (catalogue, tuiles, fiche,
  // export de carte) ; le rétablissement les rend ; retrait et rétablissement journalisés avec la version.
  assert.ok((await lecteur.get(`${API}/catalogue`)).body.couches.some((k: { id: string }) => k.id === v.coucheId));
  assert.equal((await lecteur.get(`${API}/tuiles/${v.coucheId}/0/0/0`)).status === 404, false);
  assert.equal((await lecteur.post(`${API}/prix/sources/feenway-barometre/statut`).send({ statut: "suspendue", motif: "Essai" })).status, 403);
  const sus = await admin.post(`${API}/prix/sources/feenway-barometre/statut`).send({ statut: "suspendue", motif: "Droits à revoir (essai)" });
  assert.equal(sus.status, 200);
  assert.deepEqual([sus.body.avant, sus.body.apres], ["active", "suspendue"]);
  assert.deepEqual((await lecteur.get(`${API}/prix/agregats-publies?code=6141010`)).body, { editions: [], lignes: [] });
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}/objets/6141010`)).status, 404);
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}`)).status, 404);
  assert.equal((await lecteur.get(`${API}/tuiles/${v.coucheId}/0/0/0`)).status, 404);
  assert.equal((await lecteur.get(`${API}/catalogue`)).body.couches.some((k: { id: string }) => k.id === v.coucheId), false);
  const exportSuspendu = (await admin.post(`${API}/exports`).send({ carteId: carteAdmin.body.id, revisionAttendue: 1 })).body;
  assert.equal(exportSuspendu.etat, "refuse");
  assert.equal((await admin.get(`${API}/prix/export?format=csv&versionId=${v.versionId}`)).status, 404);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.source.statut' AND ressource = 'feenway-barometre'"), 1);
  assert.deepEqual((await ctx.pool.query("SELECT details->'versions' AS v FROM geodata_journal WHERE action = 'prix.fiche.retrait' AND ressource = 'feenway-barometre'")).rows.map((x) => x.v), [[v.versionId]]);
  // La version publiée n'est pas modifiée (immuable) : seul le filtre de consultation la retire.
  assert.equal((await ctx.pool.query("SELECT etat FROM geodata_versions WHERE id = $1", [v.versionId])).rows[0].etat, "publiee");
  // Un rechargement du registre ne lève pas une suspension décidée par l'administration.
  await ctx.pool.query("UPDATE geodata_prix_sources SET empreinte_registre = NULL WHERE cle = 'feenway-barometre'");
  await chargerRegistre(ctx);
  assert.equal((await ctx.pool.query("SELECT statut FROM geodata_prix_sources WHERE cle = 'feenway-barometre'")).rows[0].statut, "suspendue");
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}`)).status, 404);
  await admin.post(`${API}/prix/sources/feenway-barometre/statut`).send({ statut: "active", motif: "Droits confirmés (essai)" });
  assert.equal((await lecteur.get(`${API}/prix/agregats-publies?code=6141010`)).body.lignes.length, 66);
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}/objets/6141010`)).status, 200);
  assert.ok((await lecteur.get(`${API}/catalogue`)).body.couches.some((k: { id: string }) => k.id === v.coucheId));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.fiche.retablissement' AND ressource = 'feenway-barometre'"), 1);
  assert.equal((await admin.post(`${API}/exports`).send({ carteId: carteAdmin.body.id, revisionAttendue: 1 })).body.etat, "autorise");

  // Export : réservé aux rôles ; attribution CC BY et identifiant d'édition dans chaque ligne ; aucune cellule n'est
  // une formule de tableur.
  assert.equal((await lecteur.get(`${API}/prix/export?format=csv`)).status, 403);
  const ex = await admin.get(`${API}/prix/export?format=csv&versionId=${v.versionId}`);
  assert.equal(ex.status, 200);
  assert.match(String(ex.headers["content-type"]), /text\/csv/);
  assert.equal(ex.headers["cache-control"], "private, no-store");
  const lignesCsv = ex.text.replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.equal(lignesCsv.length, 67);
  assert.ok(lignesCsv[0]!.includes("prix_m2_approximatif"));
  assert.ok(lignesCsv[1]!.startsWith(v.versionId));
  assert.match(lignesCsv[1]!, /Source : FeenWay/);
  assert.match(lignesCsv[1]!, /,-4\.8,/, "tendance négative restée numérique");
  assert.ok(lignesCsv.every((l) => !/(^|,)"?[=+@]/.test(l)), "aucune cellule ne commence par = + @");
}

/** Import des deux fichiers synthétiques par un gestionnaire ; renvoie les comptes. */
async function preparerObservations(ctx: ContexteEssai) {
  await territoiresSynthetiques(ctx);
  await sourceSynthetique(ctx, "synthetique-a");
  await sourceSynthetique(ctx, "synthetique-b");
  const gestion = await compte(ctx, "prix-gestion@example.com", "gestionnaire-donnees");
  const publication = await compte(ctx, "prix-publication@example.com", "responsable-publication");
  const admin = await compte(ctx, "prix-admin-obs@example.com", "administrateur");
  const lecteur = await compte(ctx, "prix-lecteur-obs@example.com");
  return { gestion, publication, admin, lecteur };
}

type CelluleVue = { cohorte: Record<string, unknown> } & Record<string, unknown>;
const cellule = (cellules: CelluleVue[], f: Record<string, unknown>) =>
  cellules.find((c) => Object.entries(f).every(([k, v]) => c.cohorte[k] === v));

export async function chaineObservations(ctx: ContexteEssai) {
  figerHorloge();
  const { gestion, publication, admin, lecteur } = await preparerObservations(ctx);

  // Import A : aperçu sans écriture, puis validation.
  const apercu = await gestion.client.post(`${API}/prix/imports`).send({ source: "synthetique-a", pays: "QZ", edition: { libelle: "Édition synthétique 1" }, format: "csv", contenu: FICHIER_A, mode: "apercu" });
  assert.equal(apercu.status, 200);
  assert.deepEqual([apercu.body.rapport.lignesLues, apercu.body.rapport.admises, apercu.body.rapport.quarantaine, apercu.body.rapport.rattachees], [9, 8, 1, 7]);
  assert.deepEqual(apercu.body.rapport.parMotif, { "prix-non-positif": 1 });
  assert.deepEqual(apercu.body.rapport.nonRattachees, { "precision-insuffisante": 1 });
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_observations"), 0);
  const a = await gestion.client.post(`${API}/prix/imports`).send({ source: "synthetique-a", pays: "QZ", edition: { libelle: "Édition synthétique 1" }, format: "csv", contenu: FICHIER_A, mode: "valider", cleIdempotence: apercu.body.rapport.cleIdempotence });
  assert.equal(a.status, 201);
  assert.equal(a.body.nouvelles, 8);
  // Fichier archivé tel quel ; quarantaine avec ses motifs ; PRX06 : localité plus fine que la précision non rattachée.
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_fichiers f JOIN geodata_prix_lots l ON l.fichier_chemin = f.chemin WHERE l.id = $1 AND f.role = 'import-prix' AND convert_from(f.contenu, 'UTF8') = $2", [a.body.lotId, FICHIER_A]), 1);
  // Numéro de ligne réel du fichier (en-tête = ligne 1) : A8 est la 9e ligne du CSV.
  assert.deepEqual((await ctx.pool.query("SELECT ligne, annonce_id, motifs FROM geodata_prix_quarantaine")).rows, [{ ligne: 9, annonce_id: "A8", motifs: ["prix-non-positif"] }]);
  assert.deepEqual((await ctx.pool.query("SELECT r.resultat, r.territoire_code, r.motif FROM geodata_prix_rattachements r JOIN geodata_prix_observations o ON o.id = r.observation_id WHERE o.annonce_id = 'A9'")).rows,
    [{ resultat: "non-rattache", territoire_code: null, motif: "precision-insuffisante" }]);

  // PRX02 : le même fichier réimporté ne crée rien.
  const deux = await importer(gestion.client, "synthetique-a", FICHIER_A);
  assert.equal(deux.status, 200);
  assert.equal(deux.body.deja, true);
  assert.equal(deux.body.lotId, a.body.lotId);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_observations"), 8);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_lots"), 1);
  // Réimport d'une même observation (source, annonce, date) au contenu différent : conflit consigné en quarantaine,
  // jamais ignoré en silence ; la première version reste. Une observation identique est seulement « déjà présente ».
  const conflit = await importer(gestion.client, "synthetique-a", versCsv([ligne("A2", 11, 1_200_000, 100), ligne("A1", 10, 1_050_000, 100, { empreinte: "commun-1" })]));
  assert.equal(conflit.status, 201);
  assert.deepEqual([conflit.body.nouvelles, conflit.body.rapport.dejaPresentes, conflit.body.rapport.quarantaine, conflit.body.rapport.parMotif], [0, 1, 1, { "conflit-reimport": 1 }]);
  assert.deepEqual((await ctx.pool.query("SELECT ligne, annonce_id, motifs FROM geodata_prix_quarantaine WHERE lot_id = $1", [conflit.body.lotId])).rows, [{ ligne: 3, annonce_id: "A1", motifs: ["conflit-reimport"] }]);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_observations WHERE annonce_id = 'A1' AND prix = 1000000"), 1);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_observations"), 8);
  const b = await importer(gestion.client, "synthetique-b", FICHIER_B);
  assert.equal(b.status, 201);
  assert.equal(b.body.nouvelles, 2);

  // PRX10 : la consultation seule ne lit aucune donnée brute et ne fait aucun geste réservé.
  for (const [methode, chemin] of [["get", "/prix/observations"], ["get", "/prix/lots"], ["get", `/prix/lots/${a.body.lotId}/quarantaine`], ["get", "/prix/instantanes"], ["post", "/prix/instantanes"], ["post", "/prix/imports"], ["get", "/prix/export?format=csv"], ["get", "/prix/publications/annonces"]] as const) {
    const r = methode === "get" ? await lecteur.client.get(`${API}${chemin}`) : await lecteur.client.post(`${API}${chemin}`).send({});
    assert.equal(r.status, 403, `${methode} ${chemin}`);
  }
  assert.equal((await gestion.client.get(`${API}/prix/observations?source=synthetique-a`)).body.observations.length, 8);

  // Instantané candidat (seuil 3 pour un petit jeu) ; reconstruit à l'identique (PRX12).
  const s1 = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: "2026-10-31", seuil: 3 });
  assert.equal(s1.status, 201);
  assert.equal(s1.body.rapport.biensMultiples, 1, "PRX03 : A1 et B1 forment un seul bien");
  assert.deepEqual(s1.body.rapport.aRevoir.map((p: { a: string; b: string }) => [p.a, p.b]), [["synthetique-a|A2", "synthetique-b|B2"]], "PRX04 : sosie à revoir, jamais fusionné d'office");
  const s1bis = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: "2026-10-31", seuil: 3 });
  assert.equal(s1bis.status, 200);
  assert.deepEqual([s1bis.body.id, s1bis.body.empreinte, s1bis.body.deja], [s1.body.id, s1.body.empreinte, true]);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_instantanes"), 1);
  const [manifeste] = (await ctx.pool.query("SELECT manifeste, empreinte_manifeste FROM geodata_prix_instantanes WHERE id = $1", [s1.body.id])).rows;
  assert.equal(manifeste.manifeste.entrees.length, 10);
  assert.equal(manifeste.manifeste.versionMethode, "prix-methode-1");
  // Liens bien ↔ observation (Plan §4) : chaque observation lue liée à son bien ; A1 et B1 par empreinte égale.
  assert.deepEqual((await ctx.pool.query("SELECT methode, confiance, count(*)::int AS n FROM geodata_prix_biens_observations WHERE instantane_id = $1 GROUP BY 1, 2 ORDER BY 1", [s1.body.id])).rows,
    [{ methode: "empreinte", confiance: "forte", n: 2 }, { methode: "identifiant", confiance: "certaine", n: 8 }]);
  assert.equal(await compter(ctx, "SELECT count(DISTINCT bien_id) AS n FROM geodata_prix_biens_observations WHERE instantane_id = $1 AND annonce IN ('synthetique-a|A1', 'synthetique-b|B1')", [s1.body.id]), 1);
  await assert.rejects(ctx.pool.query("DELETE FROM geodata_prix_biens_observations WHERE instantane_id = $1", [s1.body.id]));
  await assert.rejects(ctx.pool.query("UPDATE geodata_prix_instantanes SET empreinte = $2 WHERE id = $1", [s1.body.id, "0".repeat(64)]));
  await assert.rejects(ctx.pool.query("DELETE FROM geodata_prix_cellules WHERE instantane_id = $1", [s1.body.id]));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_instantanes WHERE id = $1 AND empreinte = $2", [s1.body.id, s1.body.empreinte]), 1);

  // Rien n'est servi avant publication ; le gestionnaire ne publie pas.
  assert.equal((await lecteur.client.get(`${API}/prix/cellules`)).body.instantane, null);
  assert.equal((await gestion.client.post(`${API}/prix/instantanes/${s1.body.id}/publier`).send({ attendu: null, motif: "Essai" })).status, 403);
  const p1 = await publication.client.post(`${API}/prix/instantanes/${s1.body.id}/publier`).send({ attendu: null, motif: "Première publication (essai synthétique)" });
  assert.equal(p1.status, 200);

  const vue = (await lecteur.client.get(`${API}/prix/cellules?code=QZ-C1`)).body;
  assert.equal(vue.instantane.id, s1.body.id);
  assert.equal(vue.instantane.empreinte, s1.body.empreinte);
  assert.equal(vue.instantane.methode, "prix-methode-1");
  const appart = cellule(vue.cellules, { typeBien: "appartement", transaction: "vente", baseSurface: "habitable", periode: "total" })!;
  assert.deepEqual({ etat: appart.etat, mediane: appart.mediane, q1: appart.q1, q3: appart.q3, nombres: appart.nombres, contributionSources: appart.contributionSources },
    { etat: "disponible", mediane: 12_000, q1: 10_000, q3: 12_100, nombres: { brutes: 6, eligibles: 6, distinctes: 5 }, contributionSources: { "synthetique-a": 3, "synthetique-b": 2 } });
  assert.equal((appart.exclusions as Record<string, number>)["doublon-inter-sources"], 1);
  assert.equal(JSON.stringify(vue).includes("clesRetenues") || JSON.stringify(vue).includes("synthetique-a|A1"), false, "PRX10 : aucune lignée servie à la consultation");
  // PRX05 / PRX07 : parcelle, loyer journalier, loyer mensuel : cohortes séparées, sous le seuil → sans valeur.
  for (const f of [{ typeBien: "terrain", baseSurface: "parcelle" }, { transaction: "location", periode: "jour" }, { transaction: "location", periode: "mois" }]) {
    const c = cellule(vue.cellules, f)!;
    assert.ok(c, JSON.stringify(f));
    assert.deepEqual([c.etat, c.mediane, c.q1, c.q3], ["echantillon-insuffisant", null, null, null]);
  }
  assert.equal(vue.cellules.length, 4);
  assert.ok(vue.cellules.every((c: { cohorte: { territoire: string } }) => c.cohorte.territoire === "QZ-C1"), "PRX06 : aucune cellule plus fine que la commune");

  // Revue : fusion décidée A2 ~ B2 → nouvel instantané S2 (le précédent n'est jamais modifié).
  assert.equal((await gestion.client.post(`${API}/prix/doublons/decisions`).send({ a: "synthetique-b|B2", b: "synthetique-a|A2", decision: "fusion", motif: "Même bien vérifié (essai)" })).status, 201);
  const s2 = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: "2026-10-31", seuil: 3 });
  assert.equal(s2.status, 201);
  assert.notEqual(s2.body.empreinte, s1.body.empreinte);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_biens_observations WHERE instantane_id = $1 AND methode = 'decision' AND confiance = 'revue'", [s2.body.id]), 2);

  // PRX11 : deux publications concurrentes attendant S1 → une seule passe, l'autre 409 ; une demande périmée → 409.
  const [x, y] = await Promise.all([1, 2].map(() => publication.client.post(`${API}/prix/instantanes/${s2.body.id}/publier`).send({ attendu: s1.body.id, motif: "Publication concurrente (essai)" })));
  assert.deepEqual([x!.status, y!.status].sort(), [200, 409]);
  const perimee = await publication.client.post(`${API}/prix/instantanes/${s1.body.id}/publier`).send({ attendu: s1.body.id, motif: "Demande périmée (essai)" });
  assert.equal(perimee.status, 409);
  assert.equal(perimee.body.error, "conflit_publication");
  assert.equal(perimee.body.actuel, s2.body.id);
  assert.ok(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.publication.refusee'") >= 2);
  assert.equal((await lecteur.client.get(`${API}/prix/cellules`)).body.instantane.id, s2.body.id);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_publications WHERE active"), 1);

  // PRX14 : retour arrière vers S1 ; l'historique garde chaque étape ; lignée et empreinte de S1 intactes.
  const retour = await publication.client.post(`${API}/prix/publications/annonces/retour`).send({ attendu: s2.body.id, motif: "Retour à l'instantané validé précédent (essai)" });
  assert.equal(retour.status, 200);
  assert.equal(retour.body.instantaneId, s1.body.id);
  assert.equal((await lecteur.client.get(`${API}/prix/cellules`)).body.instantane.empreinte, s1.body.empreinte);
  const hist = (await publication.client.get(`${API}/prix/publications/annonces`)).body.publications;
  assert.deepEqual(hist.map((h: { action: string; instantaneId: string; active: boolean }) => [h.action, h.instantaneId, h.active]),
    [["retour", s1.body.id, true], ["publication", s2.body.id, false], ["publication", s1.body.id, false]]);
  const [apres] = (await ctx.pool.query("SELECT manifeste, empreinte_manifeste FROM geodata_prix_instantanes WHERE id = $1", [s1.body.id])).rows;
  assert.deepEqual(apres, manifeste);
  await assert.rejects(ctx.pool.query("DELETE FROM geodata_prix_publications"));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_publications"), 3);

  // Export des cellules publiées : identifiant et empreinte de l'instantané, aucune clé d'annonce.
  const ex = await gestion.client.get(`${API}/prix/export?format=csv&produit=cellules`);
  assert.equal(ex.status, 200);
  assert.ok(ex.text.includes(s1.body.id) && ex.text.includes(s1.body.empreinte));
  assert.equal(ex.text.includes("A1"), false);

  // PRX13 et concurrence : une suspension (transaction tenue ouverte) et une publication simultanée. La publication
  // attend le verrou unique des sources, puis voit la source suspendue : refusée ; la suspension retire S1.
  assert.equal((await gestion.client.post(`${API}/prix/sources/synthetique-b/statut`).send({ statut: "suspendue", motif: "Essai" })).status, 403);
  const tx = await ctx.pool.connect();
  let retraits = -1;
  try {
    await tx.query("BEGIN");
    retraits = (await changerStatutSource(tx, "synthetique-b", "suspendue", "Droits suspendus (essai concurrent)", admin.id)).retraits;
    const concurrente = publication.client.post(`${API}/prix/instantanes/${s2.body.id}/publier`).send({ attendu: s1.body.id, motif: "Publication concurrente d'une suspension (essai)" }).then((r) => r);
    // La publication est bloquée sur le verrou des sources tant que la suspension n'est pas validée.
    for (let i = 0; i < 100 && (await compter(ctx, "SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted")) === 0; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await compter(ctx, "SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"), 1, "publication en attente du verrou des sources");
    await tx.query("COMMIT");
    const r = await concurrente;
    // Sérialisée après la suspension : la publication voit le pointeur retiré (plus rien d'actif) et est refusée.
    assert.equal(r.status, 409);
    assert.deepEqual([r.body.error, r.body.actuel], ["conflit_publication", null]);
  } finally { tx.release(); }
  assert.equal(retraits, 1);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_publications WHERE active"), 0);
  // Même demande, état à jour (aucune publication attendue) : la source suspendue bloque la publication de S2.
  const s2Refus = await publication.client.post(`${API}/prix/instantanes/${s2.body.id}/publier`).send({ attendu: null, motif: "Publication après suspension (essai)" });
  assert.deepEqual([s2Refus.status, s2Refus.body.error], [409, "source_non_autorisee"]);
  const vide = (await lecteur.client.get(`${API}/prix/cellules`)).body;
  assert.deepEqual([vide.instantane, vide.cellules, vide.etat, vide.motif], [null, [], "indisponible", "aucune-publication"]);
  const hist2 = (await publication.client.get(`${API}/prix/publications/annonces`)).body.publications;
  assert.deepEqual([hist2[0].action, hist2[0].precedentId, hist2[0].active], ["retrait", s1.body.id, false]);
  const refus = await publication.client.post(`${API}/prix/publications/annonces/retour`).send({ attendu: null, instantaneId: s1.body.id, motif: "Essai interdit" });
  assert.equal(refus.status, 409);
  assert.equal(refus.body.error, "source_non_autorisee");
  // Un nouvel instantané ne lit plus la source suspendue.
  const s3 = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: "2026-10-31", seuil: 3 });
  assert.equal(s3.status, 201);
  assert.deepEqual(s3.body.rapport.totaux.observations, 8);
  assert.equal((await ctx.pool.query("SELECT sources FROM geodata_prix_instantanes WHERE id = $1", [s3.body.id])).rows[0].sources.join(","), "synthetique-a");
  assert.equal((await importer(gestion.client, "synthetique-b", FICHIER_B.replace("B2,", "B3,"))).status, 409);

  // Source dérivée (agrégateur) : jamais combinée avec une autre source dans un instantané (Concept §2).
  await ctx.pool.query(`INSERT INTO geodata_prix_sources (cle, titre, couche, produit, statut, editeur, derivee, amont) VALUES ('synthetique-agregateur', 'Agrégateur synthétique (test)', 'annonces', 'observations', 'active', 'Éditeur synthétique (test)', true, '{synthetique-a}')`);
  assert.equal((await importer(gestion.client, "synthetique-agregateur", versCsv([ligne("D1", 20, 1_000_000, 100)]))).status, 201);
  const melange = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: DATE_ESSAI, seuil: 3 });
  assert.equal(melange.status, 409);
  assert.equal(melange.body.error, "source_derivee_combinee");
  assert.deepEqual(melange.body.derivees, [{ cle: "synthetique-agregateur", amont: ["synthetique-a"] }]);
}

// ——— Valeurs officielles (jeux SYNTHÉTIQUES) ———

const ENTETE_OFFICIEL = ["zone_code", "zone_libelle", "zone_description", "territoire", "categorie_originale", "type_bien", "etat_bien", "transaction", "base_surface", "forme",
  "valeur", "valeur_min", "valeur_max", "texte_original", "monnaie", "unite", "date_debut", "date_fin", "page_ou_ligne"] as const;
type LigneOfficielle = Partial<Record<(typeof ENTETE_OFFICIEL)[number], string>>;
export const ligneOfficielle = (autre: LigneOfficielle = {}): LigneOfficielle => ({
  zone_code: "ZS-1", zone_libelle: "Zone synthétique", zone_description: "Zone décrite en texte (test)", territoire: "QZ-C1", categorie_originale: "Appartement",
  type_bien: "appartement", transaction: "vente", base_surface: "habitable", forme: "unique", valeur: "10 000", texte_original: "10 000 DH/m²", monnaie: "MAD", unite: "MAD/m2",
  date_debut: "2026-01-01", ...autre,
});
export const FICHIER_OFFICIEL = (lignes: readonly LigneOfficielle[]) =>
  [ENTETE_OFFICIEL.join(","), ...lignes.map((l) => ENTETE_OFFICIEL.map((k) => { const v = l[k] ?? ""; return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(","))].join("\n");

/** Aperçu puis validation d'un fichier de valeurs officielles. */
async function importerOfficiel(client: Agent, source: string, edition: string, validite: string, contenu: string) {
  const a = await client.post(`${API}/prix/officielles/imports`).send({ source, edition: { libelle: edition, validite }, format: "csv", contenu, mode: "apercu" });
  if (a.status !== 200) return a;
  return client.post(`${API}/prix/officielles/imports`).send({ source, edition: { libelle: edition, validite }, format: "csv", contenu, mode: "valider", cleIdempotence: a.body.rapport.cleIdempotence });
}

/** Revue de l'attribution d'une zone officielle d'une édition (jamais d'office) vers la commune synthétique. */
async function validerZone(ctx: ContexteEssai, client: Agent, edition: string, code = "QZ-C1") {
  const [z] = (await ctx.pool.query("SELECT z.id FROM geodata_prix_zones z JOIN geodata_prix_editions e ON e.id = z.edition_id WHERE e.libelle = $1", [edition])).rows;
  const r = await client.post(`${API}/prix/rattachements/zone:${z.id}/decision`).send({ decision: "validee", territoire: { pays: "QZ", code }, motif: "Interprétation spatiale revue (essai)" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return z.id as string;
}

/**
 * Valeurs officielles (jeux synthétiques) : import par la route (aperçu, validation, idempotence, quarantaine,
 * archive), zone revue avant toute comparaison, PRX08 (validité non vérifiée jamais courante), PRX09 (dimension
 * réellement incompatible, sans pourcentage), écart puis position une fois vérifiée ; zone consultable ; suspension.
 */
export async function referenceOfficielle(ctx: ContexteEssai) {
  figerHorloge();
  const { gestion, publication, admin, lecteur } = await preparerObservations(ctx);
  assert.equal((await importer(gestion.client, "synthetique-a", FICHIER_A)).status, 201);
  assert.equal((await importer(gestion.client, "synthetique-b", FICHIER_B)).status, 201);
  const s = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: DATE_ESSAI, seuil: 3 });
  assert.equal((await publication.client.post(`${API}/prix/instantanes/${s.body.id}/publier`).send({ attendu: null, motif: "Publication (essai)" })).status, 200);
  await ctx.pool.query(`INSERT INTO geodata_prix_sources (cle, titre, couche, produit, statut, editeur, derivee) VALUES ('synthetique-officielle', 'Référentiel synthétique (test)', 'officielle', 'valeurs-officielles', 'active', 'Autorité synthétique (test)', false)`);

  // Import refusé à la consultation seule ; aperçu sans écriture ; validation ; réimport identique sans effet.
  assert.equal((await lecteur.client.post(`${API}/prix/officielles/imports`).send({})).status, 403);
  const fichier1 = FICHIER_OFFICIEL([
    ligneOfficielle(),
    ligneOfficielle({ zone_code: "ZS-2", forme: "fourchette", valeur: "", valeur_min: "13000", valeur_max: "11000", texte_original: "13 000 à 11 000" }),
    ligneOfficielle({ zone_code: "ZS-1", zone_description: "Autre description (test)", type_bien: "villa" }),
  ]);
  const apercu = await gestion.client.post(`${API}/prix/officielles/imports`).send({ source: "synthetique-officielle", edition: { libelle: "Édition synthétique non vérifiée", validite: "non-verifiee" }, format: "csv", contenu: fichier1, mode: "apercu" });
  assert.equal(apercu.status, 200, JSON.stringify(apercu.body));
  assert.deepEqual([apercu.body.rapport.lignesLues, apercu.body.rapport.admises, apercu.body.rapport.quarantaine, apercu.body.rapport.parMotif], [3, 1, 2, { "fourchette-inversee": 1, "zone-incoherente": 1 }]);
  assert.deepEqual(apercu.body.rapport.exemplesQuarantaine.map((q: { ligne: number }) => q.ligne), [3, 4]);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_valeurs_officielles"), 0);
  const v1 = await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique non vérifiée", "non-verifiee", fichier1);
  assert.equal(v1.status, 201);
  assert.equal(v1.body.nouvelles, 1);
  const bis = await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique non vérifiée", "non-verifiee", fichier1);
  assert.deepEqual([bis.status, bis.body.deja, bis.body.lotId], [200, true, v1.body.lotId]);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_valeurs_officielles"), 1);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_quarantaine WHERE lot_id = $1", [v1.body.lotId]), 2);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_fichiers f JOIN geodata_prix_lots l ON l.fichier_chemin = f.chemin WHERE l.id = $1 AND f.role = 'import-prix'", [v1.body.lotId]), 1);
  // La validité d'une édition existante ne change jamais par un nouveau lot.
  assert.equal((await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique non vérifiée", "verifiee", FICHIER_OFFICIEL([ligneOfficielle({ type_bien: "maison" })]))).body.error, "validite_differente");
  // Valeur gardée sous sa forme, texte d'origine, ligne du fichier ; zone à revoir (territoire proposé jamais retenu d'office).
  assert.deepEqual((await ctx.pool.query("SELECT forme, valeur::text AS valeur, texte_original, page_ou_ligne, validite FROM geodata_prix_valeurs_officielles")).rows,
    [{ forme: "unique", valeur: "10000", texte_original: "10 000 DH/m²", page_ou_ligne: "ligne 2", validite: "non-verifiee" }]);
  assert.deepEqual((await ctx.pool.query("SELECT revue, territoire_code, territoire_propose FROM geodata_prix_zones")).rows, [{ revue: "a-revoir", territoire_code: null, territoire_propose: "QZ-C1" }]);
  const fileZones = (await gestion.client.get(`${API}/prix/rattachements`)).body.zones;
  assert.deepEqual(fileZones.map((z: { zone: string; territoirePropose: string }) => [z.zone, z.territoirePropose]), [["ZS-1", "QZ-C1"]]);

  // Zone non revue : aucune référence pour ce territoire ; la carte dit pourquoi (couche officielle et son état).
  const k0 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.deepEqual([k0.comparable, k0.motif, k0.coucheEnCause.couche, k0.coucheEnCause.etat], [false, "aucune-reference-officielle", "officielle", "validite-non-verifiee"]);
  const zoneId = await validerZone(ctx, gestion.client, "Édition synthétique non vérifiée");

  // PRX08 : validité non vérifiée → jamais présentée comme référence en vigueur.
  const officielle = (await lecteur.client.get(`${API}/prix/couches`)).body.couches.find((c: { couche: string }) => c.couche === "officielle");
  assert.equal(officielle.etat, "validite-non-verifiee");
  const k1 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.equal(k1.comparable, false);
  assert.deepEqual(k1.dimensionsIncompatibles, ["validite-reference"]);
  assert.equal(k1.ecartPourcent, undefined);
  // Sans valeur de marché pour la cohorte demandée : motif structuré, couche des annonces en cause.
  const k2 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente&base=parcelle`)).body;
  assert.deepEqual([k2.comparable, k2.motif, k2.coucheEnCause.couche], [false, "aucune-valeur-marche", "annonces"]);

  // PRX09 : édition vérifiée dont la valeur porte sur une autre base de surface → refus, dimension nommée, sans pourcentage.
  assert.equal((await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique vérifiée A", "verifiee",
    FICHIER_OFFICIEL([ligneOfficielle({ base_surface: "construite", date_debut: "2026-02-01", texte_original: "10 000 DH/m² construit" })]))).status, 201);
  await validerZone(ctx, gestion.client, "Édition synthétique vérifiée A");
  const k3 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.deepEqual([k3.comparable, k3.motif, k3.dimensionsIncompatibles, k3.ecartPourcent], [false, "dimensions-incompatibles", ["base-surface"], undefined]);
  assert.equal(k3.reference.baseSurface, "construite");

  // Édition vérifiée compatible : écart descriptif.
  assert.equal((await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique vérifiée B", "verifiee",
    FICHIER_OFFICIEL([ligneOfficielle({ date_debut: "2026-03-01" })]))).status, 201);
  await validerZone(ctx, gestion.client, "Édition synthétique vérifiée B");
  const k4 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.deepEqual([k4.comparable, k4.mode, k4.ecartPourcent, k4.valeurReference], [true, "ecart", 20, 10_000]);
  assert.equal(k4.libelle, "Écart du prix affiché par rapport à la référence officielle");
  assert.equal(k4.marche.mediane, 12_000);
  assert.equal((await lecteur.client.get(`${API}/prix/couches`)).body.couches.find((c: { couche: string }) => c.couche === "officielle").etat, "disponible");
  // Une fourchette donne une position, jamais un pourcentage.
  assert.equal((await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique vérifiée C", "verifiee",
    FICHIER_OFFICIEL([ligneOfficielle({ forme: "fourchette", valeur: "", valeur_min: "11 000", valeur_max: "13 000", texte_original: "11 000 à 13 000 DH/m²", date_debut: "2026-04-01" })]))).status, 201);
  await validerZone(ctx, gestion.client, "Édition synthétique vérifiée C");
  const k5 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.deepEqual([k5.comparable, k5.mode, k5.position, k5.ecartPourcent], [true, "position", "dans", undefined]);

  // Zone officielle consultable : identifiant et forme d'origine, édition et validité, revue ; rien d'une source suspendue.
  const z = await lecteur.client.get(`${API}/prix/officielles/zones/${zoneId}`);
  assert.equal(z.status, 200);
  assert.deepEqual([z.body.zone.code, z.body.zone.revue, z.body.zone.territoire, z.body.edition.validite, z.body.valeurs.length, z.body.valeurs[0].texteOriginal],
    ["ZS-1", "validee", "QZ-C1", "non-verifiee", 1, "10 000 DH/m²"]);
  assert.equal((await lecteur.client.get(`${API}/prix/officielles/zones/gdpzo_inconnue`)).status, 404);
  assert.equal((await admin.client.post(`${API}/prix/sources/synthetique-officielle/statut`).send({ statut: "suspendue", motif: "Droits suspendus (essai)" })).status, 200);
  const zs = await lecteur.client.get(`${API}/prix/officielles/zones/${zoneId}`);
  assert.deepEqual([zs.status, zs.body.error, zs.body.valeurs], [409, "source_non_autorisee", undefined]);
  const k6 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.equal(k6.comparable, false);
  assert.equal((await importerOfficiel(gestion.client, "synthetique-officielle", "Édition synthétique D", "verifiee", FICHIER_OFFICIEL([ligneOfficielle()]))).status, 409);
}

/**
 * PRX14 « restauration de la base » : sauvegarde logique des tables des prix (`sauvegarderPrix`), tables vidées comme
 * après une perte, restauration (`restaurerPrix`) dans une seule transaction. L'instantané publié revient avec le même
 * identifiant, la même empreinte, le même manifeste et la même lignée (lots, liens bien ↔ observation, historique des
 * publications) ; reconstruit sur les entrées restaurées avec les mêmes paramètres, il redonne la même empreinte.
 */
export async function restaurationBase(ctx: ContexteEssai) {
  figerHorloge();
  // Registre réel chargé d'abord (un rechargement retirerait les sources synthétiques, absentes du registre livré).
  await chargerRegistre(ctx);
  const { gestion, publication, lecteur } = await preparerObservations(ctx);
  assert.equal((await importer(gestion.client, "synthetique-a", FICHIER_A)).status, 201);
  assert.equal((await importer(gestion.client, "synthetique-b", FICHIER_B)).status, 201);
  const s1 = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: DATE_ESSAI, seuil: 3 });
  assert.equal((await publication.client.post(`${API}/prix/instantanes/${s1.body.id}/publier`).send({ attendu: null, motif: "Publication (essai)" })).status, 200);
  assert.equal((await gestion.client.post(`${API}/prix/doublons/decisions`).send({ a: "synthetique-a|A2", b: "synthetique-b|B2", decision: "fusion", motif: "Même bien vérifié (essai)" })).status, 201);
  const s2 = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: DATE_ESSAI, seuil: 3 });
  assert.equal((await publication.client.post(`${API}/prix/instantanes/${s2.body.id}/publier`).send({ attendu: s1.body.id, motif: "Seconde publication (essai)" })).status, 200);
  const avant = {
    cellules: (await lecteur.client.get(`${API}/prix/cellules`)).body,
    historique: (await publication.client.get(`${API}/prix/publications/annonces`)).body.publications,
    lignee: (await ctx.pool.query("SELECT instantane_id, bien_id, annonce, methode, confiance FROM geodata_prix_biens_observations ORDER BY 1, 3, 2")).rows,
    manifestes: (await ctx.pool.query("SELECT id, empreinte, empreinte_manifeste, manifeste, lots, sources FROM geodata_prix_instantanes ORDER BY id")).rows,
  };

  const c = await ctx.pool.connect();
  let sauvegarde: Awaited<ReturnType<typeof sauvegarderPrix>>;
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    sauvegarde = await sauvegarderPrix(c);
    await c.query("COMMIT");
  } finally { c.release(); }
  assert.match(sauvegarde.empreinte, /^[0-9a-f]{64}$/);
  // Perte simulée des tables des prix (base jetable de test).
  await ctx.pool.query(`TRUNCATE ${TABLES_PRIX_SAUVEGARDEES.join(", ")}`);
  assert.equal((await lecteur.client.get(`${API}/prix/cellules`)).body.instantane, null);
  // Une sauvegarde altérée est refusée avant toute écriture.
  const alteree = { ...sauvegarde, tables: { ...sauvegarde.tables, geodata_prix_cellules: [] } };
  await assert.rejects(enTransaction(ctx, (x) => restaurerPrix(x, alteree)), /altérée/);
  const bilan = await enTransaction(ctx, (x) => restaurerPrix(x, sauvegarde));
  assert.equal(bilan.geodata_prix_instantanes, 2);
  assert.equal(bilan.geodata_prix_observations, 10);
  // Restaurer par-dessus des données existantes est refusé : une restauration ne fusionne jamais.
  await assert.rejects(enTransaction(ctx, (x) => restaurerPrix(x, sauvegarde)), /n'est pas vide/);

  assert.deepEqual((await lecteur.client.get(`${API}/prix/cellules`)).body, avant.cellules);
  assert.deepEqual((await publication.client.get(`${API}/prix/publications/annonces`)).body.publications, avant.historique);
  assert.deepEqual((await ctx.pool.query("SELECT instantane_id, bien_id, annonce, methode, confiance FROM geodata_prix_biens_observations ORDER BY 1, 3, 2")).rows, avant.lignee);
  assert.deepEqual((await ctx.pool.query("SELECT id, empreinte, empreinte_manifeste, manifeste, lots, sources FROM geodata_prix_instantanes ORDER BY id")).rows, avant.manifestes);
  // Reconstruction sur les entrées restaurées : même empreinte, donc le même instantané (aucun nouveau).
  const r2 = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: DATE_ESSAI, seuil: 3 });
  assert.deepEqual([r2.status, r2.body.id, r2.body.empreinte, r2.body.deja], [200, s2.body.id, s2.body.empreinte, true]);
  // Retour arrière après restauration : l'instantané validé précédent et sa lignée reviennent.
  const retour = await publication.client.post(`${API}/prix/publications/annonces/retour`).send({ attendu: s2.body.id, motif: "Retour après restauration (essai)" });
  assert.deepEqual([retour.status, retour.body.instantaneId], [200, s1.body.id]);
  // Séquences recalées : de nouvelles lignes s'ajoutent après les identifiants restaurés.
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_publications"), avant.historique.length + 1);
  assert.equal((await importer(gestion.client, "synthetique-a", versCsv([ligne("A20", 25, 1_000_000, 100)]))).status, 201);
}
