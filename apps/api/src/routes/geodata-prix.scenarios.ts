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
import { lireDroits, validerGeoJSON } from "@parcours/geodata-model";
import { codesDesObjets, ecrireVersion } from "../lib/geodata/versions.js";
import { empreinteAttendue } from "../lib/geodata/empreinte-fiche.js";
import { lignesPrixDeLaCouche, lireAnnexePrix } from "../lib/geodata/prix/agregats.js";
import { chargerRegistrePrix } from "../lib/geodata/prix/registre.js";
import type { FicheSource } from "../db/geodata-reference.js";

export interface ContexteEssai { readonly app: Express; readonly pool: Pool }

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
  const { client } = await compte(ctx, "prix-vide@example.com");
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
  assert.equal(cmp.body.ecartPourcent, undefined);
}

export async function registreReel(ctx: ContexteEssai) {
  const b = await chargerRegistre(ctx);
  assert.deepEqual(b, { etat: "charge", sources: 9, ajoutees: 9, modifiees: 0, statutsChanges: 0, retirees: 0 });
  assert.equal((await chargerRegistre(ctx)).etat, "inchange");
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_sources"), 9);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.source.ajoutee'"), 9);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_fichiers WHERE chemin = 'prix/prix-sources.json' AND role = 'prix' AND retire_le IS NULL"), 1);
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
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_lots"), 0);
}

export async function feenwayReel(ctx: ContexteEssai) {
  await chargerRegistre(ctx);
  const { client: admin } = await compte(ctx, "prix-admin@example.com", "administrateur");
  const { client: lecteur } = await compte(ctx, "prix-lecteur@example.com");
  const v = await importerFicheFeenway(ctx);
  assert.equal(v.deja, false);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1", [v.versionId]), 66);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1 AND code_rattache = '6141010' AND niveau_geo = 'ville'", [v.versionId]), 16);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_agregats_publies WHERE version_id = $1 AND code_rattache IS NULL AND etat_rattachement = 'non-rattache' AND niveau_geo = 'quartier-commercial'", [v.versionId]), 50);
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
    prixMedian: { valeur: 3_300_000, approximatif: true, texte: "3,3M DH" }, prixM2: { valeur: 18_548, texte: "18\u00a0548 DH" }, unite: "MAD", uniteM2: "MAD/m2", tendance90j: -4.8,
  });
  // Valeur non publiée (« — ») : null, jamais 0.
  const appartVille = a.lignes.filter((l: { niveauGeo: string; typeBien: string }) => l.niveauGeo === "ville" && l.typeBien === "appartement");
  assert.deepEqual(appartVille.map((l: { transaction: string; prixMedian: unknown; prixM2: unknown; nombreAnnonces: number }) => [l.transaction, l.prixMedian, l.prixM2, l.nombreAnnonces]),
    [["vente", null, { valeur: 14_000, texte: "14 000 DH" }, 16_802], ["location", { valeur: 8_500, approximatif: false, texte: "8 500 DH/mois" }, null, 25_431]]);
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
  assert.ok(["disponible", "perime"].includes(agregat.etat), agregat.etat);
  assert.deepEqual(agregat.versionIds, [v.versionId]);

  // Catalogue : la couche FeenWay (thème prix-immobiliers) a sa catégorie « Prix immobiliers ».
  const cat = (await lecteur.get(`${API}/categories`)).body.categories;
  assert.ok(cat.some((k: { themes: string[]; libelle: string }) => k.themes.includes("prix-immobiliers") && k.libelle === "Prix immobiliers"));

  // PRX13 (agrégats) : la suspension de la source retire les lignes servies ; le rétablissement les rend.
  assert.equal((await lecteur.post(`${API}/prix/sources/feenway-barometre/statut`).send({ statut: "suspendue", motif: "Essai" })).status, 403);
  const sus = await admin.post(`${API}/prix/sources/feenway-barometre/statut`).send({ statut: "suspendue", motif: "Droits à revoir (essai)" });
  assert.equal(sus.status, 200);
  assert.deepEqual([sus.body.avant, sus.body.apres], ["active", "suspendue"]);
  assert.deepEqual((await lecteur.get(`${API}/prix/agregats-publies?code=6141010`)).body, { editions: [], lignes: [] });
  assert.equal((await lecteur.get(`${API}/couches/${v.coucheId}/objets/6141010`)).body.prixPublies, null);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_journal WHERE action = 'prix.source.statut' AND ressource = 'feenway-barometre'"), 1);
  // Un rechargement du registre ne lève pas une suspension décidée par l'administration.
  await ctx.pool.query("UPDATE geodata_prix_sources SET empreinte_registre = NULL WHERE cle = 'feenway-barometre'");
  await chargerRegistre(ctx);
  assert.equal((await ctx.pool.query("SELECT statut FROM geodata_prix_sources WHERE cle = 'feenway-barometre'")).rows[0].statut, "suspendue");
  await admin.post(`${API}/prix/sources/feenway-barometre/statut`).send({ statut: "active", motif: "Droits confirmés (essai)" });
  assert.equal((await lecteur.get(`${API}/prix/agregats-publies?code=6141010`)).body.lignes.length, 66);

  // Export : réservé aux rôles ; attribution CC BY et identifiant d'édition dans chaque ligne.
  assert.equal((await lecteur.get(`${API}/prix/export?format=csv`)).status, 403);
  const ex = await admin.get(`${API}/prix/export?format=csv&versionId=${v.versionId}`);
  assert.equal(ex.status, 200);
  assert.match(String(ex.headers["content-type"]), /text\/csv/);
  const lignesCsv = ex.text.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lignesCsv.length, 67);
  assert.ok(lignesCsv[1]!.startsWith(v.versionId));
  assert.match(lignesCsv[1]!, /Source : FeenWay/);
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
  assert.deepEqual((await ctx.pool.query("SELECT ligne, annonce_id, motifs FROM geodata_prix_quarantaine")).rows, [{ ligne: 8, annonce_id: "A8", motifs: ["prix-non-positif"] }]);
  assert.deepEqual((await ctx.pool.query("SELECT r.resultat, r.territoire_code, r.motif FROM geodata_prix_rattachements r JOIN geodata_prix_observations o ON o.id = r.observation_id WHERE o.annonce_id = 'A9'")).rows,
    [{ resultat: "non-rattache", territoire_code: null, motif: "precision-insuffisante" }]);

  // PRX02 : le même fichier réimporté ne crée rien.
  const deux = await importer(gestion.client, "synthetique-a", FICHIER_A);
  assert.equal(deux.status, 200);
  assert.equal(deux.body.deja, true);
  assert.equal(deux.body.lotId, a.body.lotId);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_observations"), 8);
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_lots"), 1);
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

  // PRX13 : suspension de la source B → publication retirée, plus rien servi ; S1 (qui contient B) non republiable.
  assert.equal((await gestion.client.post(`${API}/prix/sources/synthetique-b/statut`).send({ statut: "suspendue", motif: "Essai" })).status, 403);
  const sus = await admin.client.post(`${API}/prix/sources/synthetique-b/statut`).send({ statut: "suspendue", motif: "Droits suspendus (essai)" });
  assert.deepEqual([sus.status, sus.body.retraits], [200, 1]);
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
}

/** PRX08 / PRX09 : édition officielle de validité non vérifiée, comparaison refusée puis permise une fois vérifiée. */
export async function referenceOfficielle(ctx: ContexteEssai) {
  const { gestion, publication, lecteur } = await preparerObservations(ctx);
  assert.equal((await importer(gestion.client, "synthetique-a", FICHIER_A)).status, 201);
  assert.equal((await importer(gestion.client, "synthetique-b", FICHIER_B)).status, 201);
  const s = await gestion.client.post(`${API}/prix/instantanes`).send({ dateReference: "2026-10-31", seuil: 3 });
  assert.equal((await publication.client.post(`${API}/prix/instantanes/${s.body.id}/publier`).send({ attendu: null, motif: "Publication (essai)" })).status, 200);
  await ctx.pool.query(`INSERT INTO geodata_prix_sources (cle, titre, couche, produit, statut, editeur, derivee) VALUES ('synthetique-officielle', 'Référentiel synthétique (test)', 'officielle', 'valeurs-officielles', 'active', 'Autorité synthétique (test)', false)`);
  await ctx.pool.query(`INSERT INTO geodata_prix_editions (id, source_cle, couche, produit, libelle, date_debut, etat, validite, revue) VALUES ('gdped_synth', 'synthetique-officielle', 'officielle', 'valeurs-officielles', 'Édition synthétique 2026', '2026-01-01', 'active', 'non-verifiee', 'revue')`);
  await ctx.pool.query(`INSERT INTO geodata_prix_zones (id, edition_id, zone_code, libelle, description_textuelle, territoire_code, revue) VALUES ('gdpzo_synth', 'gdped_synth', 'ZS-1', 'Zone synthétique', 'Zone décrite en texte (test)', 'QZ-C1', 'validee')`);
  await ctx.pool.query(`INSERT INTO geodata_prix_valeurs_officielles (id, edition_id, zone_id, categorie_originale, type_bien, etat_bien, transaction, base_surface, forme, valeur, texte_original, monnaie, unite, date_debut, validite)
    VALUES ('gdpvo_synth', 'gdped_synth', 'gdpzo_synth', 'Appartement', 'appartement', NULL, 'vente', 'habitable', 'unique', 10000, '10 000 DH/m²', 'MAD', 'MAD/m2', '2026-01-01', 'non-verifiee')`);
  // Une valeur officielle sous une forme incohérente est refusée par le schéma (fourchette inversée).
  await assert.rejects(ctx.pool.query(`INSERT INTO geodata_prix_valeurs_officielles (id, edition_id, zone_id, categorie_originale, type_bien, transaction, base_surface, forme, valeur_min, valeur_max, texte_original, monnaie, unite, date_debut, validite)
    VALUES ('gdpvo_ko', 'gdped_synth', 'gdpzo_synth', 'X', 'appartement', 'vente', 'habitable', 'fourchette', 9000, 8000, '9000-8000', 'MAD', 'MAD/m2', '2026-01-01', 'non-verifiee')`));
  assert.equal(await compter(ctx, "SELECT count(*) AS n FROM geodata_prix_valeurs_officielles WHERE id = 'gdpvo_ko'"), 0);

  // PRX08 : validité non vérifiée → jamais présentée comme référence en vigueur.
  const officielle = (await lecteur.client.get(`${API}/prix/couches`)).body.couches.find((c: { couche: string }) => c.couche === "officielle");
  assert.equal(officielle.etat, "validite-non-verifiee");
  const k1 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.equal(k1.comparable, false);
  assert.ok(k1.dimensionsIncompatibles.includes("validite-reference"), JSON.stringify(k1));
  assert.equal(k1.ecartPourcent, undefined);
  // PRX09 : dimensions incompatibles (base de surface) → raisons structurées, aucun pourcentage.
  const k2 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente&base=parcelle`)).body;
  assert.equal(k2.comparable, false);
  assert.equal(k2.motif, "aucune-valeur-marche");

  await ctx.pool.query("UPDATE geodata_prix_valeurs_officielles SET validite = 'verifiee' WHERE id = 'gdpvo_synth'");
  await ctx.pool.query("UPDATE geodata_prix_editions SET validite = 'verifiee' WHERE id = 'gdped_synth'");
  const k3 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.deepEqual([k3.comparable, k3.mode, k3.ecartPourcent, k3.valeurReference], [true, "ecart", 20, 10_000]);
  assert.equal(k3.libelle, "Écart du prix affiché par rapport à la référence officielle");
  assert.equal(k3.marche.mediane, 12_000);
  assert.equal((await lecteur.client.get(`${API}/prix/couches`)).body.couches.find((c: { couche: string }) => c.couche === "officielle").etat, "disponible");
  // Une fourchette donne une position, jamais un pourcentage.
  await ctx.pool.query("DELETE FROM geodata_prix_valeurs_officielles WHERE id = 'gdpvo_synth'");
  await ctx.pool.query(`INSERT INTO geodata_prix_valeurs_officielles (id, edition_id, zone_id, categorie_originale, type_bien, transaction, base_surface, forme, valeur_min, valeur_max, texte_original, monnaie, unite, date_debut, validite)
    VALUES ('gdpvo_f', 'gdped_synth', 'gdpzo_synth', 'Appartement', 'appartement', 'vente', 'habitable', 'fourchette', 11000, 13000, '11 000 à 13 000 DH/m²', 'MAD', 'MAD/m2', '2026-01-01', 'verifiee')`);
  const k4 = (await lecteur.client.get(`${API}/prix/comparaison?code=QZ-C1&type=appartement&transaction=vente`)).body;
  assert.deepEqual([k4.comparable, k4.mode, k4.position, k4.ecartPourcent], [true, "position", "dans", undefined]);
}
