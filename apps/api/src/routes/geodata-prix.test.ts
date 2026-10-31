/**
 * Prix immobiliers de GeoData (Plan Prix §8) — intégration contre PostgreSQL/PostGIS (suite DB-3) : PRX01 à PRX14 sur la
 * base de test attestée. Fiche FeenWay et registre des sources réels ; sources d'observations, territoires et valeurs
 * officielles SYNTHÉTIQUES, créés dans la base de test seulement (`geodata-prix.scenarios.ts`).
 */
import { afterAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { resetTestDatabase } from "../testing/guarded-test-pool.js";
import { chaineObservations, feenwayReel, prx01BaseVide, referenceOfficielle, registreReel, type ContexteEssai } from "./geodata-prix.scenarios.js";

const ctx: ContexteEssai = { app: createApp(), pool };
// `users` en CASCADE vide aussi toutes les tables geodata_* et geodata_prix_* (sources du registre comprises).
beforeEach(async () => { await resetTestDatabase(pool, ["projects", "sessions", "users"]); });
afterAll(async () => { await pool.end(); });

describe("Prix immobiliers — PRX01 base vide", () => {
  it("aucune donnée en base : états vides explicites, aucun repli (sources, couches, agrégats, cellules, comparaison)", () => prx01BaseVide(ctx));
});

describe("Prix immobiliers — registre des sources réel", () => {
  it("9 sources chargées une fois (même empreinte : inchangé), fichier archivé ; couche officielle non autorisée avec ses motifs ; import d'une source bloquée refusé", () => registreReel(ctx));
});

describe("Prix immobiliers — baromètre FeenWay réel (agrégat publié)", () => {
  it("64 lignes, 14 rattachées à 6141010, 50 quartiers non rattachés ; réimport sans nouvelle version ; fiche d'objet ; catégorie ; suspension (PRX13) ; export attribué", () => feenwayReel(ctx));
});

describe("Prix immobiliers — chaîne des observations (jeux synthétiques)", () => {
  it("PRX02 à PRX07, PRX10 à PRX14 : idempotence, doublons, cohortes, seuil, droits, publication concurrente, retour arrière, suspension", () => chaineObservations(ctx), 60_000);
});

describe("Prix immobiliers — référence officielle (jeu synthétique)", () => {
  it("PRX08 / PRX09 : validité non vérifiée jamais courante, comparaison refusée avec ses raisons, écart puis position une fois vérifiée", () => referenceOfficielle(ctx), 60_000);
});
