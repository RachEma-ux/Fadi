/**
 * GeoData (9ᵉ module, ADR-GEODATA-02) — intégration contre PostgreSQL/PostGIS (suite DB-3) : critères de réception
 * GEO 01, 03, 05 à 10 et 13 du concept, isolation entre espaces, séparation des rôles, immuabilité des versions.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { COMPOSITION_INITIALE, DROITS_IMPORT_PERSONNEL, validerGeoJSON, type DroitsVersion } from "@parcours/geodata-model";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { ecrireVersion } from "../lib/geodata/versions.js";

const app = createApp();
// `users` en CASCADE vide aussi toutes les tables geodata_* (espaces → sources → versions → couches…), liste fermée de la garde inchangée.
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

const PASSWORD = "correct-horse-battery";
const API = "/geodata/api";
async function compte(email: string) {
  const client = request.agent(app);
  const r = await client.post("/auth/register").send({ email, password: PASSWORD });
  expect(r.status).toBe(201);
  return { client, id: r.body.id as string };
}

const carre = (x: number, y: number, d = 0.2) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];
const TOUT: DroitsVersion = { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "autorise", partage: "autorise", telechargement: "autorise", export: "autorise" };

/** Version commune publiée de six unités (codes à zéros initiaux, une valeur zéro, une valeur absente). */
async function publierReference(opts: { cle?: string; libelle?: string; droits?: DroitsVersion; valeurs?: (number | null)[]; publier?: boolean } = {}) {
  const valeurs = opts.valeurs ?? [0, 12, null, 45, 0, 7];
  const fc = { type: "FeatureCollection", features: valeurs.map((v, i) => ({ type: "Feature", properties: { code: `00${i + 1}`, nom: `Unité ${String.fromCharCode(65 + i)}`, effectif: v }, geometry: { type: "Polygon", coordinates: carre(-9 + (i % 3) * 0.2, 30 + Math.floor(i / 3) * 0.2) } })) };
  const v = validerGeoJSON(fc);
  if (!v.ok) throw new Error("jeu de test invalide");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const e = await ecrireVersion(client, {
      source: { cle: opts.cle ?? "test-unites", titre: "Unités de test", producteur: "Test", theme: "test", couverture: "Fictive", description: "Jeu synthétique" },
      espaceId: null,
      version: { libelle: opts.libelle ?? "v1", empreinte: "a".repeat(64), fichierNom: "t.geojson", fichierTaille: 1, urlSource: null, recupereLe: null, periode: null, licence: "Test", attribution: "Attribution de test", droits: opts.droits ?? TOUT, crsSource: "CRS84", precision: null, transformations: [], controles: { ok: true }, synthetique: true },
      couche: { titre: "Unités", description: "", niveau: "TEST", champCode: "code", champNom: "nom", proprietesExposees: ["code", "nom", "effectif"], styleDefaut: { mode: "simple", couleur: "#123456" } },
      objets: v.objets, indicateurs: [{ propriete: "effectif", titre: "Effectif", unite: "u", periode: null, denominateur: null, description: "", motifSiAbsente: "secret-statistique" }], superficie: true, preparePar: null,
    });
    if (opts.publier !== false) await client.query("UPDATE geodata_versions SET etat = 'publiee', publiee_le = clock_timestamp() WHERE id = $1", [e.versionId]);
    await client.query("COMMIT");
    return e;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const composition = (coucheId: string, versionId: string, indicateurId?: string) => ({
  ...COMPOSITION_INITIALE,
  camera: { lon: -8.8, lat: 30.2, zoom: 8, cap: 0 },
  couches: [{ coucheId, versionId, visible: true, opacite: 0.75, filtre: null, style: indicateurId ? { mode: "thematique", indicateurId, methode: "manuel", seuils: [1, 20], couleurs: ["#f1eef6", "#74a9cf", "#045a8d"] } : { mode: "simple", couleur: "#2b8cbe" } }],
});

describe("GEO 01 / GEO 02 — compte sans projet", () => {
  it("espace personnel créé au premier accès, idempotent même pour deux requêtes simultanées ; catalogue consultable", async () => {
    const alice = await compte("gd-alice@example.com");
    expect((await alice.client.get("/projects")).body).toEqual([]);
    const [a, b] = await Promise.all([alice.client.get(`${API}/espace`), alice.client.get(`${API}/espace`)]);
    expect(a.status).toBe(200);
    expect(a.body.espace.id).toBe(b.body.espace.id);
    expect(a.body.capacites).toEqual(["composer", "consulter", "exporter", "importer"]);
    expect(a.body.fonds.map((f: { id: string }) => f.id)).toEqual(["neutre"]);
    await publierReference();
    const cat = await alice.client.get(`${API}/catalogue`);
    expect(cat.body.couches).toHaveLength(1);
    expect(cat.body.couches[0].version).toMatchObject({ licence: "Test", synthetique: true, privee: false });
    expect((await request(app).get(`${API}/espace`)).status).toBe(401);
  });
});

describe("GEO 03 — un projet sans rapport n'affecte rien", () => {
  it("créer puis supprimer un projet laisse cartes et zones intactes", async () => {
    const alice = await compte("gd-p@example.com");
    const ref = await publierReference();
    const carte = await alice.client.post(`${API}/cartes`).send({ nom: "Ma carte", composition: composition(ref.coucheId, ref.versionId) });
    expect(carte.status).toBe(201);
    const p = await alice.client.post("/projects").send({ code: "GD.1", name: "Sans rapport" });
    expect(p.status).toBe(201);
    expect((await alice.client.delete(`/projects/${p.body.id}`)).status).toBeLessThan(300);
    const relue = await alice.client.get(`${API}/cartes/${carte.body.id}`);
    expect(relue.status).toBe(200);
    expect(relue.body.revision).toBe(1);
    expect(relue.body.composition).toEqual(carte.body.composition);
  });
});

describe("GEO 05 / GEO 06 — composition restaurée, absence distincte de zéro", () => {
  it("composition thématique relue à l'identique ; zéro et absence distincts dans valeurs, table et fiche", async () => {
    const alice = await compte("gd-c@example.com");
    const ref = await publierReference();
    const indicateur = ref.indicateurs[0]!;
    const comp = composition(ref.coucheId, ref.versionId, indicateur);
    const c = await alice.client.post(`${API}/cartes`).send({ nom: "Thématique", composition: comp });
    expect(c.status).toBe(201);
    const autre = request.agent(app);
    await autre.post("/auth/login").send({ email: "gd-c@example.com", password: PASSWORD });
    const relue = await autre.get(`${API}/cartes/${c.body.id}`);
    expect(relue.body.composition).toEqual(comp);
    expect(relue.body.disponibilite[ref.coucheId]).toEqual({ etat: "disponible", versionPlusRecente: null });
    const vs = (await alice.client.get(`${API}/indicateurs/${indicateur}/valeurs`)).body.valeurs as { code: string; valeur: number | null; motifAbsence: string | null }[];
    expect(vs.find((v) => v.code === "001")).toEqual({ code: "001", valeur: 0, motifAbsence: null });
    expect(vs.find((v) => v.code === "003")).toEqual({ code: "003", valeur: null, motifAbsence: "secret-statistique" });
    const fiche = await alice.client.get(`${API}/couches/${ref.coucheId}/objets/003`);
    expect(fiche.body.indicateurs.find((i: { id: string }) => i.id === indicateur)).toMatchObject({ valeur: null, motifAbsence: "secret-statistique" });
    const table = await alice.client.get(`${API}/couches/${ref.coucheId}/table?tri=code&taille=2`);
    expect(table.body.total).toBe(6);
    expect(table.body.lignes[0].code).toBe("001");
    expect(table.body.lignes[0].valeurs[indicateur]).toEqual({ valeur: 0, motifAbsence: null });
  });
  it("une composition avec adresse de fournisseur ou une couche inconnue est refusée", async () => {
    const alice = await compte("gd-r@example.com");
    expect((await alice.client.post(`${API}/cartes`).send({ nom: "X", composition: { ...COMPOSITION_INITIALE, fond: "https://x/{z}" } })).status).toBe(400);
    const r = await alice.client.post(`${API}/cartes`).send({ nom: "X", composition: composition("gdcou_inconnue", "gdver_inconnue") });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("couche_inaccessible");
  });
});

describe("GEO 13 — modifications concurrentes", () => {
  it("le second enregistrement périmé est refusé (409) avec l'état courant ; la copie préserve le travail local", async () => {
    const alice = await compte("gd-m@example.com");
    const c = await alice.client.post(`${API}/cartes`).send({ nom: "Partagée entre onglets" });
    const premier = await alice.client.put(`${API}/cartes/${c.body.id}`).send({ revisionAttendue: 1, nom: "Onglet 1" });
    expect(premier.status).toBe(200);
    expect(premier.body.revision).toBe(2);
    const second = await alice.client.put(`${API}/cartes/${c.body.id}`).send({ revisionAttendue: 1, nom: "Onglet 2", composition: { ...COMPOSITION_INITIALE, camera: { lon: 1, lat: 2, zoom: 3, cap: 0 } } });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: "revision_conflict", revisionCourante: 2, carte: { nom: "Onglet 1" } });
    const copie = await alice.client.post(`${API}/cartes/${c.body.id}/dupliquer`).send({ nom: "Onglet 2 (copie)", composition: { ...COMPOSITION_INITIALE, camera: { lon: 1, lat: 2, zoom: 3, cap: 0 } } });
    expect(copie.status).toBe(201);
    expect(copie.body.composition.camera).toEqual({ lon: 1, lat: 2, zoom: 3, cap: 0 });
    expect((await alice.client.put(`${API}/cartes/${c.body.id}`).send({ nom: "sans révision" })).status).toBe(400);
  });
  it("collections : une carte ne se classe que dans une collection de son espace", async () => {
    const alice = await compte("gd-col@example.com");
    const bob = await compte("gd-col-b@example.com");
    const colBob = await bob.client.post(`${API}/collections`).send({ nom: "Bob" });
    const col = await alice.client.post(`${API}/collections`).send({ nom: "Études" });
    expect((await alice.client.post(`${API}/cartes`).send({ nom: "A", collectionId: colBob.body.id })).status).toBe(400);
    const c = await alice.client.post(`${API}/cartes`).send({ nom: "A", collectionId: col.body.id });
    expect(c.body.collectionId).toBe(col.body.id);
    expect((await alice.client.post(`${API}/cartes/${c.body.id}/archiver`)).body.etat).toBe("archivee");
    expect((await alice.client.get(`${API}/cartes?etat=archivee`)).body.cartes).toHaveLength(1);
  });
});

describe("GEO 07 / GEO 08 — import personnel et isolation", () => {
  const fichier = (crs?: string, coords = carre(-7, 33, 0.1)) => JSON.stringify({ type: "FeatureCollection", ...(crs ? { crs: { type: "name", properties: { name: crs } } } : {}), features: [{ type: "Feature", properties: { nom: "Mon secteur" }, geometry: { type: "Polygon", coordinates: coords } }] });
  it("CRS projeté ou coordonnées projetées : rejet motivé, rien de publié ; import valide → couche privée", async () => {
    const alice = await compte("gd-i@example.com");
    const proj = await alice.client.post(`${API}/imports`).send({ requestId: "req-projete-1", nomFichier: "a.geojson", contenu: fichier("urn:ogc:def:crs:EPSG::26191") });
    expect(proj.body.etat).toBe("rejete");
    expect(proj.body.rapport.diagnostics[0].code).toBe("crs-non-pris-en-charge");
    expect((await alice.client.post(`${API}/imports/${proj.body.id}/confirmer`).send({ titre: "x" })).status).toBe(409);
    const metres = await alice.client.post(`${API}/imports`).send({ requestId: "req-metres-1", nomFichier: "b.geojson", contenu: fichier(undefined, [[[350000, 380000], [351000, 380000], [351000, 381000], [350000, 380000]]]) });
    expect(metres.body.rapport.diagnostics.map((d: { code: string }) => d.code)).toContain("hors-plage");
    const ok = await alice.client.post(`${API}/imports`).send({ requestId: "req-valide-1", nomFichier: "c.geojson", contenu: fichier() });
    expect(ok.body.etat).toBe("valide");
    const repete = await alice.client.post(`${API}/imports`).send({ requestId: "req-valide-1", nomFichier: "c.geojson", contenu: fichier() });
    expect(repete.status).toBe(200);
    expect(repete.body.id).toBe(ok.body.id);
    const conf = await alice.client.post(`${API}/imports/${ok.body.id}/confirmer`).send({ titre: "Mon secteur" });
    expect(conf.status).toBe(201);
    expect((await alice.client.post(`${API}/imports/${ok.body.id}/confirmer`).send({ titre: "Mon secteur" })).status).toBe(200);
    const cat = await alice.client.get(`${API}/catalogue`);
    expect(cat.body.couches.map((c: { id: string }) => c.id)).toContain(conf.body.coucheId);
    const bob = await compte("gd-i-bob@example.com");
    expect((await bob.client.get(`${API}/catalogue`)).body.couches.map((c: { id: string }) => c.id)).not.toContain(conf.body.coucheId);
    expect((await bob.client.get(`${API}/couches/${conf.body.coucheId}`)).status).toBe(404);
    expect((await bob.client.get(`${API}/tuiles/${conf.body.coucheId}/8/120/105`)).status).toBe(404);
    expect((await bob.client.get(`${API}/couches/${conf.body.coucheId}/table`)).status).toBe(404);
    expect((await bob.client.post(`${API}/imports/${ok.body.id}/annuler`)).status).toBe(404);
    expect((await bob.client.post(`${API}/cartes`).send({ nom: "Vol", composition: composition(conf.body.coucheId, conf.body.versionId) })).body.error).toBe("couche_inaccessible");
    const tuile = await alice.client.get(`${API}/tuiles/${conf.body.coucheId}/8/122/102`);
    expect(tuile.status).toBe(200);
    expect(tuile.headers["cache-control"]).toBe("private, no-store");
  });
  it("cartes, zones, analyses et fiches d'export d'un tiers : 404, y compris en accès direct", async () => {
    const alice = await compte("gd-a8@example.com");
    const bob = await compte("gd-b8@example.com");
    const ref = await publierReference();
    const carte = await alice.client.post(`${API}/cartes`).send({ nom: "Privée", composition: composition(ref.coucheId, ref.versionId) });
    const zone = await alice.client.post(`${API}/zones`).send({ nature: "zone", nom: "Zone", geometrie: { type: "Polygon", coordinates: carre(-8.9, 30.05, 0.3) } });
    const analyse = await alice.client.post(`${API}/analyses`).send({ zoneId: zone.body.id, coucheId: ref.coucheId });
    const exp = await alice.client.post(`${API}/exports`).send({ carteId: carte.body.id, revisionAttendue: 1 });
    expect(exp.body.etat).toBe("autorise");
    for (const url of [`/cartes/${carte.body.id}`, `/analyses/${analyse.body.id}`, `/exports/${exp.body.id}/fiche`]) expect((await bob.client.get(`${API}${url}`)).status, url).toBe(404);
    expect((await bob.client.put(`${API}/cartes/${carte.body.id}`).send({ revisionAttendue: 1, nom: "x" })).status).toBe(404);
    expect((await bob.client.put(`${API}/zones/${zone.body.id}`).send({ revisionAttendue: 1, nom: "x" })).status).toBe(404);
    expect((await bob.client.post(`${API}/analyses`).send({ zoneId: zone.body.id, coucheId: ref.coucheId })).status).toBe(404);
    expect((await bob.client.post(`${API}/exports`).send({ carteId: carte.body.id, revisionAttendue: 1 })).status).toBe(404);
    expect((await bob.client.get(`${API}/zones`)).body.zones).toEqual([]);
  });
});

describe("Zones et analyses — GEO 10", () => {
  it("analyse figée : superficie, unités intersectées, hors couverture ; nouvelle version → à recalculer, ancien résultat conservé", async () => {
    const alice = await compte("gd-z@example.com");
    const v1 = await publierReference();
    // Zone qui recouvre deux unités et déborde hors de la couverture.
    const zone = await alice.client.post(`${API}/zones`).send({ nature: "zone", nom: "Étude", geometrie: { type: "Polygon", coordinates: [[[-9.1, 30.05], [-8.7, 30.05], [-8.7, 30.15], [-9.1, 30.15], [-9.1, 30.05]]] } });
    expect(zone.status).toBe(201);
    expect(zone.body.aireM2).toBeGreaterThan(0);
    const a1 = await alice.client.post(`${API}/analyses`).send({ zoneId: zone.body.id, coucheId: v1.coucheId });
    expect(a1.status).toBe(201);
    expect(a1.body.resultat.unitesIntersectees).toBe(2);
    expect(a1.body.resultat.aireHorsCouvertureM2).toBeGreaterThan(0);
    expect(a1.body.resultat.unites.map((u: { code: string }) => u.code).sort()).toEqual(["001", "002"]);
    expect(a1.body.resultat.limites).toMatch(/ni population/);
    expect(a1.body.aRecalculer).toBe(false);
    const carte = await alice.client.post(`${API}/cartes`).send({ nom: "Avec v1", composition: composition(v1.coucheId, v1.versionId) });
    const v2 = await publierReference({ libelle: "v2", valeurs: [1, 1, 1, 1, 1, 1] });
    const a1relue = await alice.client.get(`${API}/analyses/${a1.body.id}`);
    expect(a1relue.body.aRecalculer).toBe(true);
    expect(a1relue.body.versionPlusRecente).toBe(v2.versionId);
    expect(a1relue.body.resultat).toEqual(a1.body.resultat);
    expect(a1relue.body.versionId).toBe(v1.versionId);
    expect((await alice.client.get(`${API}/cartes/${carte.body.id}`)).body.disponibilite[v1.coucheId]).toEqual({ etat: "disponible", versionPlusRecente: v2.versionId });
    const modif = await alice.client.put(`${API}/zones/${zone.body.id}`).send({ revisionAttendue: 1, geometrie: { type: "Polygon", coordinates: carre(-9, 30, 0.1) } });
    expect(modif.body.revision).toBe(2);
    expect((await alice.client.put(`${API}/zones/${zone.body.id}`).send({ revisionAttendue: 1, nom: "périmé" })).status).toBe(409);
    expect((await alice.client.get(`${API}/analyses/${a1.body.id}`)).body.motifsRecalcul).toContain("La zone a été modifiée depuis le calcul.");
    // La garde DB-3 masque le texte de l'erreur SQL (QUERY_FAILED) : refus constaté, puis ligne vérifiée intacte.
    await expect(pool.query("UPDATE geodata_analyses SET methode = 'x' WHERE id = $1", [a1.body.id])).rejects.toThrow();
    expect((await pool.query("SELECT methode FROM geodata_analyses WHERE id = $1", [a1.body.id])).rows[0].methode).toBe("geodata-analyse-superficie");
  });
  it("une zone non polygonale et un calcul non autorisé sont refusés", async () => {
    const alice = await compte("gd-z2@example.com");
    expect((await alice.client.post(`${API}/zones`).send({ nature: "zone", nom: "P", geometrie: { type: "Point", coordinates: [-7, 33] } })).status).toBe(400);
    expect((await alice.client.post(`${API}/zones`).send({ nature: "annotation", nom: "Repère", texte: "Note", geometrie: { type: "Point", coordinates: [-7, 33] } })).status).toBe(201);
    const ref = await publierReference({ droits: { ...TOUT, calcul: "inconnu" } });
    const zone = await alice.client.post(`${API}/zones`).send({ nature: "zone", nom: "Z", geometrie: { type: "Polygon", coordinates: carre(-9, 30) } });
    const r = await alice.client.post(`${API}/analyses`).send({ zoneId: zone.body.id, coucheId: ref.coucheId });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: "usage_refuse", usage: "calcul", etat: "inconnu" });
  });
});

describe("GEO 09 — exports", () => {
  it("droit d'export inconnu : refus motivé ; export permis : attributions et fiche de sources", async () => {
    const alice = await compte("gd-e@example.com");
    const libre = await publierReference({ cle: "libre" });
    const fermee = await publierReference({ cle: "fermee", droits: { ...TOUT, export: "inconnu" } });
    const c = await alice.client.post(`${API}/cartes`).send({ nom: "Deux couches", composition: { ...composition(libre.coucheId, libre.versionId), couches: [composition(libre.coucheId, libre.versionId).couches[0], composition(fermee.coucheId, fermee.versionId).couches[0]] } });
    const refus = await alice.client.post(`${API}/exports`).send({ carteId: c.body.id, revisionAttendue: 1 });
    expect(refus.body.etat).toBe("refuse");
    expect(refus.body.refus).toEqual([{ coucheId: fermee.coucheId, titre: "Unités", motif: "Export de composition : droit non qualifié pour cette source" }]);
    expect(refus.body.fiche).toBeNull();
    const seule = await alice.client.put(`${API}/cartes/${c.body.id}`).send({ revisionAttendue: 1, composition: composition(libre.coucheId, libre.versionId) });
    // L'export porte sur la révision affichée : une révision périmée est refusée, sans fiche.
    const perime = await alice.client.post(`${API}/exports`).send({ carteId: c.body.id, revisionAttendue: 1 });
    expect(perime.status).toBe(409);
    expect(perime.body).toMatchObject({ error: "revision_conflict", revisionCourante: seule.body.revision });
    const ok = await alice.client.post(`${API}/exports`).send({ carteId: c.body.id, revisionAttendue: seule.body.revision });
    expect(ok.body).toMatchObject({ etat: "autorise", carteRevision: seule.body.revision, attributions: ["Attribution de test"] });
    const fiche = await alice.client.get(ok.body.fiche);
    expect(fiche.status).toBe(200);
    expect(fiche.headers["content-disposition"]).toMatch(/attachment/);
    expect(fiche.text).toContain("Attribution de test");
    expect(fiche.text).toContain("Jeu synthétique de test");
  });
});

describe("Rôles GeoData, publication et immuabilité (INV-07, INV-08)", () => {
  it("le propriétaire d'un projet n'a aucun droit GeoData ; préparer ≠ publier ; un droit inconnu bloque la publication", async () => {
    const alice = await compte("gd-role@example.com");
    expect((await alice.client.post("/projects").send({ code: "GD.2", name: "Projet" })).status).toBe(201);
    const prep = await publierReference({ publier: false, droits: { ...TOUT, tuiles: "inconnu" } });
    expect((await alice.client.post(`${API}/admin/versions/${prep.versionId}/publier`)).status).toBe(403);
    await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, 'gestionnaire-donnees')", [alice.id]);
    expect((await alice.client.get(`${API}/admin/versions`)).status).toBe(200);
    expect((await alice.client.post(`${API}/admin/versions/${prep.versionId}/publier`)).status).toBe(403);
    await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, 'responsable-publication')", [alice.id]);
    const bloque = await alice.client.post(`${API}/admin/versions/${prep.versionId}/publier`);
    expect(bloque.status).toBe(409);
    expect(bloque.body.motifs).toEqual(["Production de tuiles : droit non qualifié pour cette source"]);
    expect((await alice.client.get(`${API}/admin/roles`)).status).toBe(403);
  });
  it("version publiée immuable et non effaçable ; retrait motivé : la carte garde la référence et l'explique", async () => {
    const alice = await compte("gd-ret@example.com");
    await pool.query("INSERT INTO geodata_roles (user_id, role) VALUES ($1, 'responsable-publication')", [alice.id]);
    const ref = await publierReference();
    // La garde DB-3 masque le texte de l'erreur SQL (QUERY_FAILED) : refus constatés, puis lignes vérifiées intactes.
    await expect(pool.query("UPDATE geodata_versions SET libelle = 'réécrite' WHERE id = $1", [ref.versionId])).rejects.toThrow();
    await expect(pool.query("DELETE FROM geodata_versions WHERE id = $1", [ref.versionId])).rejects.toThrow();
    await expect(pool.query("UPDATE geodata_valeurs SET valeur = 99 WHERE indicateur_id = $1", [ref.indicateurs[0]])).rejects.toThrow();
    expect((await pool.query("SELECT libelle FROM geodata_versions WHERE id = $1", [ref.versionId])).rows).toEqual([{ libelle: "v1" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM geodata_valeurs WHERE indicateur_id = $1 AND valeur = 99", [ref.indicateurs[0]])).rows[0].n).toBe(0);
    const carte = await alice.client.post(`${API}/cartes`).send({ nom: "Référence", composition: composition(ref.coucheId, ref.versionId) });
    expect((await alice.client.post(`${API}/admin/versions/${ref.versionId}/retirer`).send({})).status).toBe(400);
    expect((await alice.client.post(`${API}/admin/versions/${ref.versionId}/retirer`).send({ motif: "Droits retirés par le producteur" })).status).toBe(200);
    const relue = await alice.client.get(`${API}/cartes/${carte.body.id}`);
    expect(relue.body.composition.couches[0].versionId).toBe(ref.versionId);
    expect(relue.body.disponibilite[ref.coucheId]).toEqual({ etat: "retiree", motif: "Version retirée : Droits retirés par le producteur" });
    expect((await alice.client.get(`${API}/tuiles/${ref.coucheId}/8/121/107`)).status).toBe(404);
    expect((await alice.client.get(`${API}/catalogue`)).body.couches).toEqual([]);
    const exp = await alice.client.post(`${API}/exports`).send({ carteId: carte.body.id, revisionAttendue: 1 });
    expect(exp.body.etat).toBe("refuse");
    expect(DROITS_IMPORT_PERSONNEL.partage).toBe("refuse");
  });
});

describe("Recherche", () => {
  it("coordonnées étiquetées, paire nue refusée, unité trouvée par nom ou code à zéro initial", async () => {
    const alice = await compte("gd-s@example.com");
    await publierReference();
    expect((await alice.client.get(`${API}/recherche?q=lon -7.6 lat 33.5`)).body.resultats[0]).toMatchObject({ type: "coordonnees", point: { lon: -7.6, lat: 33.5 } });
    expect((await alice.client.get(`${API}/recherche?q=33.5, -7.6`)).body.avertissement.code).toBe("coordonnees-non-etiquetees");
    expect((await alice.client.get(`${API}/recherche?q=unité b`)).body.resultats[0]).toMatchObject({ type: "unite", code: "002" });
    expect((await alice.client.get(`${API}/recherche?q=004`)).body.resultats[0]).toMatchObject({ code: "004" });
  });
});

describe("Une couleur par entité (style categories)", () => {
  it("six unités : six rangs distincts dans l'ordre des noms ; composition « categories » enregistrée ; couche d'un tiers → 404", async () => {
    const alice = await compte("gd-k@example.com");
    const ref = await publierReference();
    const r = await alice.client.get(`${API}/couches/${ref.coucheId}/categories`);
    expect(r.status).toBe(200);
    const cs = r.body.categories as { code: string; nom: string; rang: number }[];
    expect(cs).toHaveLength(6);
    expect(cs.find((c) => c.code === "001")).toEqual({ code: "001", nom: "Unité A", rang: 0 });
    expect(new Set(cs.map((c) => c.rang)).size).toBe(6);
    // Même résultat au second appel (contenu figé).
    expect((await alice.client.get(`${API}/couches/${ref.coucheId}/categories`)).body.categories).toEqual(cs);
    const comp = { ...composition(ref.coucheId, ref.versionId), couches: [{ ...composition(ref.coucheId, ref.versionId).couches[0]!, style: { mode: "categories" } }] };
    const c = await alice.client.post(`${API}/cartes`).send({ nom: "Par entité", composition: comp });
    expect(c.status).toBe(201);
    expect((await alice.client.get(`${API}/cartes/${c.body.id}`)).body.composition).toEqual(comp);
    expect((await alice.client.get(`${API}/couches/gdcou_inconnue/categories`)).status).toBe(404);
  });
});
