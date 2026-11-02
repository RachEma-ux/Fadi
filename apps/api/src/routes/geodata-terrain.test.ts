/**
 * Terrain haute résolution, lot TER-02 (Issue #381) — intégration contre PostgreSQL/PostGIS (suite DB-3) : import
 * contrôlé, quarantaine (datum inconnu ou incompatible), rejet d'un fichier mal formé, idempotence, quota, levée de
 * quarantaine, contenu figé, et import raté préservant la version publiée. Fixtures synthétiques « test seulement ».
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validerDeclarationTerrain, type DeclarationTerrain } from "@parcours/geodata-model";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { StockageTerrain } from "../lib/geodata/terrain/stockage.js";
import { ImportRefuse, importerTerrain, leverQuarantaine } from "../lib/geodata/terrain/import.js";
import { ecrireFixture, ficheSynthetique } from "../lib/geodata/terrain/fixtures-synthetiques.js";
import { newId } from "../lib/ids.js";

let racine: string;
let stockage: StockageTerrain;
const QUOTA = 10_000_000;
beforeEach(async () => {
  await resetTestDatabase(pool, ["projects", "sessions", "users"]);
  racine = mkdtempSync(join(tmpdir(), "fadi-terrain-db-"));
  stockage = new StockageTerrain(racine);
  await stockage.preparer();
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));
afterAll(async () => { await pool.end(); });

async function compte(email: string, role: string): Promise<string> {
  const id = newId("usr");
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x')", [id, email]);
  await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, $2)", [id, role]);
  return id;
}

const fiche = (surcharge: Record<string, unknown> = {}): DeclarationTerrain => {
  const r = validerDeclarationTerrain(ficheSynthetique(surcharge));
  if (!r.ok) throw new Error(r.erreurs.join("; "));
  return r.declaration;
};

async function importer(d: DeclarationTerrain, par: string | null, quota = QUOTA) {
  const c = await pool.connect();
  try { return await importerTerrain(c, stockage, d, { deposePar: par, quotaOctets: quota }); } finally { c.release(); }
}

const versions = async () => (await pool.query("SELECT id, cle, etat, empreinte FROM geodata_terrain_versions ORDER BY depose_le, id")).rows;

/** Fait suivre à une version les transitions du plan jusqu'à « publié » (la publication elle-même vient au lot TER-04). */
async function publier(id: string) {
  for (const e of ["revue", "accepte", "publie"]) await pool.query("UPDATE geodata_terrain_versions SET etat = $2 WHERE id = $1", [id, e]);
}

describe("import contrôlé d'une version d'altitudes (TER-02)", () => {
  it("fixture conforme : déposé → validation → prête au traitement, original archivé par empreinte, dépôt vidé", async () => {
    const gest = await compte("gest@example.test", "gestionnaire-donnees");
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    const r = await importer(fiche(), gest);
    expect(r).toMatchObject({ etat: "traitement", deja: false, motifs: [] });
    const [v] = (await pool.query("SELECT etat, synthetique, etiquette, reference_verticale, nodata, cellules::int AS cellules, crs_horizontal FROM geodata_terrain_versions WHERE id = $1", [r.versionId])).rows;
    expect(v).toMatchObject({ etat: "traitement", synthetique: true, etiquette: "Données synthétiques — test seulement", nodata: -9999, cellules: 1200, crs_horizontal: "EPSG:2056" });
    expect(v.reference_verticale).toMatchObject({ statut: "declaree", code: "EPSG:5728", origine: "documentation" });
    const ev = (await pool.query("SELECT de, vers FROM geodata_terrain_evenements WHERE terrain_version_id = $1 ORDER BY id", [r.versionId])).rows;
    expect(ev).toEqual([{ de: null, vers: "depose" }, { de: "depose", vers: "validation" }, { de: "validation", vers: "traitement" }]);
    const [f] = (await pool.query("SELECT role, cle_stockage, empreinte FROM geodata_terrain_fichiers WHERE terrain_version_id = $1", [r.versionId])).rows;
    expect(f).toEqual({ role: "original", cle_stockage: `originaux/${r.empreinte}`, empreinte: r.empreinte });
    expect(existsSync(stockage.chemin(f.cle_stockage))).toBe(true);
    expect(existsSync(stockage.cheminDepot("plan.tif"))).toBe(false);
    const [t] = (await pool.query("SELECT etat, progression, tentatives FROM geodata_terrain_traitements WHERE id = $1", [r.traitementId])).rows;
    expect(t).toEqual({ etat: "termine", progression: 100, tentatives: 1 });
  });

  it("idempotent : même fichier et même fiche → aucune seconde version, même relancé fichier déjà archivé", async () => {
    const octets = ecrireFixture(stockage.cheminDepot("plan.tif"));
    const r1 = await importer(fiche(), null);
    writeFileSync(stockage.cheminDepot("plan.tif"), octets);
    const r2 = await importer(fiche(), null);
    expect(r2).toMatchObject({ deja: true, versionId: r1.versionId });
    expect(await versions()).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_traitements")).rows[0].n).toBe(1);
  });

  it("référence verticale inconnue → quarantaine, jamais devinée ; levée seulement par une décision sourcée", async () => {
    const pub = await compte("pub@example.test", "responsable-publication");
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    const r = await importer(fiche({ referenceVerticale: { statut: "non-declaree", indice: "nom de fichier (indice de test)" } }), null);
    expect(r.etat).toBe("quarantaine");
    expect(r.motifs.map((m) => m.code)).toEqual(["reference-verticale-inconnue"]);
    const c = await pool.connect();
    try {
      await expect(leverQuarantaine(c, r.versionId, { referenceVerticale: null, motif: "Je décide sans source" }, pub)).rejects.toBeInstanceOf(ImportRefuse);
      const ref = await leverQuarantaine(c, r.versionId, { referenceVerticale: { code: "EPSG:5728", libelle: "Référence de test", source: "document de test n° 1" }, motif: "Référence établie par le document de test" }, pub);
      expect(ref).toEqual({ statut: "declaree", code: "EPSG:5728", libelle: "Référence de test", origine: "decision", source: "document de test n° 1" });
      await expect(leverQuarantaine(c, r.versionId, { referenceVerticale: null, motif: "Deuxième levée refusée" }, pub)).rejects.toThrow(/seule une quarantaine/);
    } finally { c.release(); }
    const [ev] = (await pool.query("SELECT de, vers, decision, acteur_id FROM geodata_terrain_evenements WHERE terrain_version_id = $1 ORDER BY id DESC LIMIT 1", [r.versionId])).rows;
    expect(ev).toMatchObject({ de: "quarantaine", vers: "traitement", acteur_id: pub });
    expect(ev.decision.motif).toBe("Référence établie par le document de test");
  });

  it("datum incompatible entre fichier et fiche → quarantaine, aucune conversion, référence de la fiche conservée", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"), { verticalEpsg: 3855 });
    const r = await importer(fiche(), null);
    expect(r.etat).toBe("quarantaine");
    expect(r.motifs.map((m) => m.code)).toEqual(["datum-incompatible"]);
    const [v] = (await pool.query("SELECT reference_verticale FROM geodata_terrain_versions WHERE id = $1", [r.versionId])).rows;
    expect(v.reference_verticale.code).toBe("EPSG:5728");
  });

  it("NoData : distinct de zéro, conservé ; absent du fichier et de la fiche → quarantaine", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"), { nodata: null });
    const r = await importer(fiche(), null);
    expect(r.motifs.map((m) => m.code)).toEqual(["nodata-inconnu"]);
    ecrireFixture(stockage.cheminDepot("zero.tif"), { nodata: 0, valeur: (c) => (c < 5 ? 0 : 500) });
    const z = await importer(fiche({ cle: "test-nodata-zero", fichier: { nom: "zero.tif", format: "GeoTIFF" } }), null);
    const [v] = (await pool.query("SELECT nodata FROM geodata_terrain_versions WHERE id = $1", [z.versionId])).rows;
    expect(v.nodata).toBe(0);
  });

  it("fichier mal formé → rejeté, jamais archivé, laissé au dépôt pour examen", async () => {
    writeFileSync(stockage.cheminDepot("plan.tif"), "<html>page de boutique, pas un GeoTIFF</html>");
    const r = await importer(fiche(), null);
    expect(r.etat).toBe("rejete");
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_fichiers")).rows[0].n).toBe(0);
    expect(existsSync(stockage.cheminDepot("plan.tif"))).toBe(true);
    expect(existsSync(stockage.chemin(`originaux/${r.empreinte}`))).toBe(false);
  });

  it("import raté ou rejeté : la version publiée reste la même, aucune seconde publiée possible", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    const ok = await importer(fiche(), null);
    await publier(ok.versionId);
    // Nouvelle livraison mal formée du même jeu → rejetée ; la publiée est intacte.
    writeFileSync(stockage.cheminDepot("plan.tif"), "corrompu");
    const ko = await importer(fiche({ version: { libelle: "v2", doi: null, date: null, url: null } }), null);
    expect(ko.etat).toBe("rejete");
    // Import refusé avant écriture (empreinte différente de la fiche) : rien n'est créé.
    ecrireFixture(stockage.cheminDepot("plan.tif"), { valeur: () => 1 });
    await expect(importer(fiche({ version: { libelle: "v3", doi: null, date: null, url: null }, acquisition: { methode: "telechargement", url: "https://exemple.test/a.tif", empreinte: "c".repeat(64) } }), null)).rejects.toBeInstanceOf(ImportRefuse);
    const publiees = (await pool.query("SELECT id, empreinte FROM geodata_terrain_versions WHERE etat = 'publie'")).rows;
    expect(publiees).toEqual([{ id: ok.versionId, empreinte: ok.empreinte }]);
    // Une seconde version du même jeu ne peut pas devenir publiée en même temps.
    ecrireFixture(stockage.cheminDepot("plan.tif"), { valeur: (c) => 600 + c });
    const v4 = await importer(fiche({ version: { libelle: "v4", doi: null, date: null, url: null } }), null);
    expect(v4.etat).toBe("traitement");
    await expect(publier(v4.versionId)).rejects.toThrow();
    expect((await pool.query("SELECT id FROM geodata_terrain_versions WHERE etat = 'publie'")).rows).toEqual([{ id: ok.versionId }]);
  });

  it("quota dépassé ou fichier trop grand → refusé avant toute écriture", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    await expect(importer(fiche(), null, 1000)).rejects.toThrow(/Quota/);
    const c = await pool.connect();
    try {
      await expect(importerTerrain(c, stockage, fiche(), { deposePar: null, quotaOctets: QUOTA, limites: { octetsFichier: 100, cellules: 1e9 } })).rejects.toThrow(/au-delà de la limite/);
    } finally { c.release(); }
    expect(await versions()).toEqual([]);
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_traitements")).rows[0].n).toBe(0);
  });

  it("contenu figé, transitions du plan seulement, ni version ni fichier effaçables", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    const r = await importer(fiche(), null);
    const avant = async () => ({
      v: (await pool.query("SELECT etat, empreinte, reference_verticale FROM geodata_terrain_versions WHERE id = $1", [r.versionId])).rows,
      f: (await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_fichiers")).rows,
      e: (await pool.query("SELECT motif FROM geodata_terrain_evenements ORDER BY id")).rows,
    });
    const etat0 = await avant();
    // La garde de test masque le texte des erreurs SQL : on vérifie le refus, puis que rien n'a changé.
    await expect(pool.query("UPDATE geodata_terrain_versions SET empreinte = $2 WHERE id = $1", [r.versionId, "0".repeat(64)])).rejects.toThrow();
    await expect(pool.query("UPDATE geodata_terrain_versions SET etat = 'publie' WHERE id = $1", [r.versionId])).rejects.toThrow();
    await expect(pool.query("UPDATE geodata_terrain_versions SET reference_verticale = '{}'::jsonb WHERE id = $1", [r.versionId])).rejects.toThrow();
    await expect(pool.query("DELETE FROM geodata_terrain_versions WHERE id = $1", [r.versionId])).rejects.toThrow();
    await expect(pool.query("DELETE FROM geodata_terrain_fichiers")).rejects.toThrow();
    await expect(pool.query("UPDATE geodata_terrain_evenements SET motif = 'x'")).rejects.toThrow();
    expect(await avant()).toEqual(etat0);
    // Transition admise par le plan : acceptée.
    await pool.query("UPDATE geodata_terrain_versions SET etat = 'revue' WHERE id = $1", [r.versionId]);
  });

  it("aucun lien vers les projets dans les tables du terrain (GEO 04, TER-D9)", async () => {
    const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'geodata_terrain_%'")).rows.map((r) => r.column_name as string);
    expect(cols.length).toBeGreaterThan(20);
    expect(cols.filter((c) => /project/i.test(c))).toEqual([]);
  });
});
