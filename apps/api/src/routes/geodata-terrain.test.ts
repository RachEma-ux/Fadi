/**
 * Terrain haute résolution, lot TER-02 (Issue #381) — intégration contre PostgreSQL/PostGIS (suite DB-3) : import
 * contrôlé, quarantaine (datum inconnu ou incompatible), rejet d'un fichier mal formé, idempotence, quota, levée de
 * quarantaine, contenu figé, et import raté préservant la version publiée. Fixtures synthétiques « test seulement ».
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validerDeclarationTerrain, type DeclarationTerrain } from "@parcours/geodata-model";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { StockageTerrain } from "../lib/geodata/terrain/stockage.js";
import { ImportRefuse, importerTerrain, leverQuarantaine } from "../lib/geodata/terrain/import.js";
import { ecrireFixture, ficheSynthetique } from "../lib/geodata/terrain/fixtures-synthetiques.js";
import { controlerQualite, deciderRevue, traiterVersion } from "../lib/geodata/terrain/traitement.js";
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

  it("fiche corrigée sur le même fichier → nouvelle version traçable, l'ancienne intacte", async () => {
    const octets = ecrireFixture(stockage.cheminDepot("plan.tif"));
    const r1 = await importer(fiche(), null);
    writeFileSync(stockage.cheminDepot("plan.tif"), octets);
    const r2 = await importer(fiche({ attribution: "Fixture de test Fadi (attribution corrigée)" }), null);
    expect(r2.deja).toBe(false);
    expect(r2.versionId).not.toBe(r1.versionId);
    expect(r2.empreinte).toBe(r1.empreinte);
    const v = (await pool.query("SELECT id, declaration->>'attribution' AS attribution FROM geodata_terrain_versions ORDER BY depose_le, id")).rows;
    expect(v).toEqual([{ id: r1.versionId, attribution: "Fixture de test Fadi" }, { id: r2.versionId, attribution: "Fixture de test Fadi (attribution corrigée)" }]);
  });

  it("imports simultanés du même fichier et de la même fiche → une seule version, un seul traitement terminé", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    const resultats = await Promise.allSettled([importer(fiche(), null), importer(fiche(), null), importer(fiche(), null)]);
    const reussis = resultats.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    for (const r of resultats) if (r.status === "rejected") expect(String(r.reason)).toMatch(/absent du dépôt/);
    expect(reussis.length).toBeGreaterThanOrEqual(1);
    expect(new Set(reussis.map((r) => r.versionId)).size).toBe(1);
    expect(await versions()).toHaveLength(1);
    expect((await pool.query("SELECT etat FROM geodata_terrain_traitements")).rows).toEqual([{ etat: "termine" }]);
  });

  it("reprise : une version enregistrée dont le traitement a échoué termine ce traitement, sans seconde version", async () => {
    const octets = ecrireFixture(stockage.cheminDepot("plan.tif"));
    const r1 = await importer(fiche(), null);
    await pool.query("UPDATE geodata_terrain_traitements SET etat = 'echec', motif_echec = 'interruption simulée' WHERE id = $1", [r1.traitementId]);
    writeFileSync(stockage.cheminDepot("plan.tif"), octets);
    const r2 = await importer(fiche(), null);
    expect(r2).toMatchObject({ deja: true, versionId: r1.versionId, traitementId: r1.traitementId });
    expect(await versions()).toHaveLength(1);
    const [t] = (await pool.query("SELECT etat, tentatives FROM geodata_terrain_traitements WHERE id = $1", [r1.traitementId])).rows;
    expect(t).toEqual({ etat: "termine", tentatives: 2 });
    expect(existsSync(stockage.cheminDepot("plan.tif"))).toBe(false);
  });

  it("aucun lien vers les projets dans les tables du terrain (GEO 04, TER-D9)", async () => {
    const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'geodata_terrain_%'")).rows.map((r) => r.column_name as string);
    expect(cols.length).toBeGreaterThan(20);
    expect(cols.filter((c) => /project/i.test(c))).toEqual([]);
  });
});

describe("traitement et porte qualité (TER-03)", () => {
  /** Plan z = 500 + 0,5 × colonne (pas 0,25 m), trou NoData de 9 × 9 cellules : relief de 40 m, courbes à 10 m. */
  async function versionPrete(cle = "test-plan-incline") {
    ecrireFixture(stockage.cheminDepot("plan.tif"), { largeur: 80, hauteur: 60, valeur: (c, l) => (l > 25 && l < 35 && c > 30 && c < 40 ? -9999 : 500 + c * 0.5) });
    const r = await importer(fiche({ cle }), null);
    expect(r.etat).toBe("traitement");
    return r.versionId;
  }

  it("dérivés, couverture exacte (trou exclu), courbes, rapport « non évaluée », puis en attente de revue ; idempotent", async () => {
    const id = await versionPrete();
    const c = await pool.connect();
    try {
      const r = await traiterVersion(c, stockage, id);
      expect(r).toMatchObject({ deja: false, equidistance: 10 });
      expect(r.surfaceM2).toBeCloseTo((80 * 60 - 81) * 0.0625, 6);
      const r2 = await traiterVersion(c, stockage, id);
      expect(r2.deja).toBe(true);
    } finally { c.release(); }
    const [v] = (await pool.query("SELECT etat FROM geodata_terrain_versions WHERE id = $1", [id])).rows;
    expect(v.etat).toBe("revue");
    const derives = (await pool.query("SELECT nature, cle_stockage FROM geodata_terrain_fichiers WHERE terrain_version_id = $1 AND role = 'derive' ORDER BY nature", [id])).rows;
    expect(derives.map((d) => d.nature)).toEqual(["altitude", "ombrage", "pente"]);
    for (const d of derives) expect(existsSync(stockage.chemin(d.cle_stockage))).toBe(true);
    const [couv] = (await pool.query("SELECT cellules_valides::int AS v, cellules_total::int AS t, ST_SRID(geom) AS srid, srid_natif FROM geodata_terrain_couvertures WHERE terrain_version_id = $1", [id])).rows;
    expect(couv).toEqual({ v: 4800 - 81, t: 4800, srid: 4326, srid_natif: 2056 });
    const courbes = (await pool.query("SELECT altitude, maitresse, equidistance FROM geodata_terrain_courbes WHERE terrain_version_id = $1 ORDER BY altitude", [id])).rows;
    expect(courbes.map((k) => k.altitude)).toEqual([510, 520, 530]);
    expect(courbes.every((k) => k.equidistance === 10 && k.maitresse === false)).toBe(true);
    const [q] = (await pool.query("SELECT etat_qualite, echantillonnage FROM geodata_terrain_rapports_qualite WHERE terrain_version_id = $1", [id])).rows;
    expect(q).toEqual({ etat_qualite: "non-evaluee", echantillonnage: "aucun" });
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_traitements WHERE type = 'derives'")).rows[0].n).toBe(1);
  });

  it("refuse une version qui n'est pas prête, et un original altéré (rien n'est traité)", async () => {
    ecrireFixture(stockage.cheminDepot("plan.tif"));
    const q = await importer(fiche({ referenceVerticale: { statut: "non-declaree", indice: null } }), null);
    const id = await versionPrete("test-original-altere");
    const [f] = (await pool.query("SELECT cle_stockage FROM geodata_terrain_fichiers WHERE terrain_version_id = $1", [id])).rows;
    chmodSync(stockage.chemin(f.cle_stockage), 0o644);
    writeFileSync(stockage.chemin(f.cle_stockage), "altéré");
    const c = await pool.connect();
    try {
      await expect(traiterVersion(c, stockage, q.versionId)).rejects.toThrow(/quarantaine|prête au traitement/);
      await expect(traiterVersion(c, stockage, id)).rejects.toThrow(/altéré/);
    } finally { c.release(); }
    expect((await pool.query("SELECT etat FROM geodata_terrain_versions WHERE id = $1", [id])).rows[0].etat).toBe("traitement");
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_couvertures")).rows[0].n).toBe(0);
  });

  it("remise en quarantaine puis levée : la version repasse en revue en reprenant ses dérivés, puis s'accepte", async () => {
    const pub = await compte("pub@example.test", "responsable-publication");
    const id = await versionPrete();
    const c = await pool.connect();
    try {
      await traiterVersion(c, stockage, id);
      await deciderRevue(c, id, "quarantaine", "Vérification complémentaire demandée", pub);
      await leverQuarantaine(c, id, { referenceVerticale: null, motif: "Vérification complémentaire faite" }, pub);
      const r = await traiterVersion(c, stockage, id);
      expect(r.deja).toBe(true);
      expect((await pool.query("SELECT etat FROM geodata_terrain_versions WHERE id = $1", [id])).rows[0].etat).toBe("revue");
      expect(await deciderRevue(c, id, "accepte", "Usage exploratoire après vérification", pub)).toBe("non-evaluee");
    } finally { c.release(); }
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_terrain_couvertures WHERE terrain_version_id = $1", [id])).rows[0].n).toBe(1);
  });

  it("erreur mesurée plus grande que la précision déclarée : courbes recalculées à l'équidistance exigée (TER-D17)", async () => {
    const pub = await compte("pub@example.test", "responsable-publication");
    const gest = await compte("gest@example.test", "gestionnaire-donnees");
    ecrireFixture(stockage.cheminDepot("plan.tif"), { largeur: 80, hauteur: 60, valeur: (col) => 500 + col * 0.5 });
    const { versionId: id } = await importer(fiche({ precisionDeclaree: { texte: "± 0,1 m (déclaration de test)", verticaleM: 0.1, source: "fixture de test" } }), null);
    const c = await pool.connect();
    try {
      expect((await traiterVersion(c, stockage, id)).equidistance).toBe(0.25);
      // Garde : un rapport mesurant une erreur de 3 m, inscrit sans recalcul, interdit l'acceptation des courbes à 0,25 m.
      await pool.query(`INSERT INTO geodata_terrain_rapports_qualite (id, terrain_version_id, methode, echantillonnage, points, rapport, etat_qualite)
        VALUES ('gdtq_test', $1, 'test', 'bilineaire', '[]', $2, 'sans-cible')`, [id, JSON.stringify({ methodePercentile: "rang-le-plus-proche", global: { n: 1, biais: 3, rmsez: 3, p95: 3, maxAbs: 3 }, parClasse: {}, exclus: [] })]);
      await expect(deciderRevue(c, id, "accepte", "Acceptation malgré l'erreur mesurée", pub)).rejects.toThrow(/plus fines/);
      // Contrôle réel : l'erreur de 3 m exige 10 m ; les courbes à 10 m sont calculées, l'acceptation devient possible.
      const x = 2662500 + 10.5 * 0.25, y = 1210500 - 10.5 * 0.25;
      const q = await controlerQualite(c, stockage, id, { points: [{ id: "p1", x, y, z: 505 - 3, classe: "sol-nu", incertitude: 0.01 }], methode: "Point synthétique de test, aucune mesure réelle", cibles: null, par: gest });
      expect(q.equidistance).toBe(10);
      expect(await deciderRevue(c, id, "accepte", "Usage exploratoire, courbes à 10 m", pub)).toBe("sans-cible");
    } finally { c.release(); }
    const eq = (await pool.query("SELECT DISTINCT equidistance FROM geodata_terrain_courbes WHERE terrain_version_id = $1 ORDER BY equidistance", [id])).rows.map((r) => r.equidistance);
    expect(eq).toEqual([0.25, 10]);
  });

  it("rapport qualité exactement comme au plan, point hors couverture exclu et listé ; revue par un responsable", async () => {
    const pub = await compte("pub@example.test", "responsable-publication");
    const gest = await compte("gest@example.test", "gestionnaire-donnees");
    const id = await versionPrete();
    const c = await pool.connect();
    try {
      await expect(deciderRevue(c, id, "accepte", "Trop tôt : pas encore traitée", pub)).rejects.toThrow(/attente de revue/);
      await traiterVersion(c, stockage, id);
      // Centre de la cellule (colonne 10, ligne 10) : z modèle = 505 ; points levés à 505,1 et 504,9 ; un point hors grille.
      const x = 2662500 + 10.5 * 0.25, y = 1210500 - 10.5 * 0.25;
      const r = await controlerQualite(c, stockage, id, {
        points: [{ id: "p1", x, y, z: 505.1, classe: "sol-nu", incertitude: 0.01 }, { id: "p2", x, y, z: 504.9, classe: "sol-nu", incertitude: 0.01 }, { id: "p3", x: 0, y: 0, z: 1, classe: "sol-nu", incertitude: null }],
        methode: "Points synthétiques de test, aucune mesure réelle", cibles: { rmsez: 0.2, p95: 0.2, classe: null }, par: gest,
      });
      expect(r.rapport.global!.n).toBe(2);
      expect(r.rapport.global!.biais).toBeCloseTo(0, 4);
      expect(r.rapport.global!.rmsez).toBeCloseTo(0.1, 4);
      expect(r.rapport.global!.p95).toBeCloseTo(0.1, 4);
      expect(r.rapport.exclus.map((e) => e.id)).toEqual(["p3"]);
      expect(r.etat).toBe("conforme");
      await expect(deciderRevue(c, id, "accepte", "court", pub)).rejects.toThrow(/Motif/);
      expect(await deciderRevue(c, id, "accepte", "Usage exploratoire, contrôle de test conforme", pub)).toBe("conforme");
    } finally { c.release(); }
    const [ev] = (await pool.query("SELECT vers, decision FROM geodata_terrain_evenements WHERE terrain_version_id = $1 ORDER BY id DESC LIMIT 1", [id])).rows;
    expect(ev.vers).toBe("accepte");
    expect(ev.decision.etatQualite).toBe("conforme");
  });
});
