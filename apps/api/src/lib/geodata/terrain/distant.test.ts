// Fond mondial à la demande (TER-09) — service terrain-distant et lecture par l'API, sans base ni réseau : l'origine est
// simulée (transport de test) et sert des dalles synthétiques « test seulement » ; aucune donnée réelle.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompteurBudget, type DeclarationTerrain } from "@parcours/geodata-model";
import { BUDGET_DISTANT_DEFAUT, ErreurDistante, lirePlageOrigine, ServiceDistant, sourcesDistantes, TAILLE_BLOC } from "./distant.js";
import { oublierDistants, valeursDistantes } from "./fond-mondial.js";
import { invaliderCaches, tuileTerrain, type Executeur, type SourceTerrain } from "./services.js";
import { ACQ_TEST, ficheDistanteTest, HOTE_TEST, MODELE_TEST, origineTest } from "./fixtures-distantes.js";
import { pngTransparent } from "../raster.js";

const FICHE: DeclarationTerrain = ficheDistanteTest();
const SOURCES = sourcesDistantes([FICHE]);
const ACQ = ACQ_TEST;
const MODELE = MODELE_TEST;
const HOTE = HOTE_TEST;
const { fichiers: ORIGINE, etat: origine, transport } = origineTest();

/** Connexion simulée : seulement l'épinglage par version (INSERT … ON CONFLICT DO NOTHING, puis SELECT). */
function executeur(): Executeur {
  const pins = new Map<string, { etag: string | null; last_modified: string | null; taille: string }>();
  return {
    query: (async (sql: string, p: unknown[]) => {
      const k = `${p[0]}|${p[1]}`;
      if (sql.includes("INSERT INTO geodata_terrain_sources_distantes")) { if (!pins.has(k)) pins.set(k, { etag: p[3] as string | null, last_modified: p[4] as string | null, taille: String(p[5]) }); return { rows: [] }; }
      if (sql.includes("FROM geodata_terrain_sources_distantes")) return { rows: pins.has(k) ? [pins.get(k)] : [] };
      throw new Error(`requête inattendue : ${sql}`);
    }) as unknown as Executeur["query"],
  };
}

const source = (id = "gdtv_test"): SourceTerrain => ({
  id, cle: FICHE.cle, titre: FICHE.titre, produit: "MNT", niveau: "mondial", etat: "publie", etiquette: FICHE.etiquette, attribution: FICHE.attribution, licence: FICHE.licence,
  droits: FICHE.droits, srid: 4326, geographique: true, pas: 600, pasDeclare: FICHE.pasNatif, referenceVerticale: FICHE.referenceVerticale, precisionDeclaree: null, precisionMesuree: null,
  qualite: { etat: "non-evaluee", rmsez: null, p95: null, n: 0 }, date: null, publieeLe: new Date(0).toISOString(), doi: null, altitude: null, pente: null, ombrage: null, nodata: -9999,
  emprise: [-180, -90, 180, 90], distant: ACQ,
});

let racine: string;
let service: ServiceDistant;
let serveur: Server;
const demarrer = async (o: { quotaCache?: number; budget?: Partial<typeof BUDGET_DISTANT_DEFAUT> } = {}) => {
  service = new ServiceDistant({ racine, sources: SOURCES, quotaCache: o.quotaCache ?? 1e9, quotaVolume: 2e9, budget: { ...BUDGET_DISTANT_DEFAUT, ...o.budget }, transport });
  await service.demarrer();
  serveur = service.serveur();
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  process.env["GEODATA_TERRAIN_DISTANT_URL"] = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
};
const arreter = () => new Promise<void>((ok) => { serveur.closeAllConnections(); serveur.close(() => ok()); });

beforeAll(() => { invaliderCaches(); });
beforeEach(() => { racine = mkdtempSync(join(tmpdir(), "fadi-terrain-distant-")); origine.mode = "normal"; origine.requetes = 0; oublierDistants(); invaliderCaches(); });
afterEach(async () => { await arreter().catch(() => undefined); rmSync(racine, { recursive: true, force: true }); delete process.env["GEODATA_TERRAIN_DISTANT_URL"]; });
afterAll(() => { oublierDistants(); });

describe("fond mondial à la demande : zone hors Benslimane", () => {
  it("altitude au point sur une dalle de Lucerne, lue par plages et servie ensuite depuis le cache", async () => {
    await demarrer();
    const ex = executeur();
    // Centre de la cellule (colonne 30, ligne 60) : lon = 8 + 30,5 / 120, lat = 48 − 60,5 / 120 → z = 400 + 30 + 120.
    const [v] = await valeursDistantes(ex, source(), [[8 + 30.5 / 120, 48 - 60.5 / 120]]);
    expect(v?.methode).toBe("bilineaire");
    expect(v?.valeur).toBeCloseTo(550, 6);
    const avant = origine.requetes;
    oublierDistants();
    const [w] = await valeursDistantes(ex, source(), [[8 + 30.5 / 120, 48 - 60.5 / 120]]);
    expect(w?.valeur).toBeCloseTo(550, 6);
    expect(origine.requetes).toBe(avant);
    expect(service.etat().compteurs.depuisCache).toBeGreaterThan(0);
    // Deux dalles voisines : chacune sa valeur ; dalle absente (océan, non publiée) : null, jamais 0.
    const [a, b, c] = await valeursDistantes(ex, source(), [[8.5, 47.5], [9.5, 47.5], [-30.5, 33.5]]);
    expect(a?.valeur).toBeCloseTo(400 + 59.5 + 119, 6);
    expect(b?.valeur).toBe(900);
    expect(c).toBeNull();
  });

  it("tuile d'altitude au zoom 12 sur Lucerne : pixels colorés ; sous le zoom minimal : transparente sans aucune lecture", async () => {
    await demarrer();
    const ex = executeur();
    // z 12, tuile qui contient (8,3 ; 47,05).
    const z = 12, x = Math.floor(((8.3 + 180) / 360) * 2 ** z), y = Math.floor(((1 - Math.log(Math.tan((47.05 * Math.PI) / 180) + 1 / Math.cos((47.05 * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
    const png = await tuileTerrain(ex, null, source(), "altitude", z, x, y, [400, 700]);
    expect(png.length).toBeGreaterThan(500);
    const avant = origine.requetes;
    const vide = await tuileTerrain(ex, null, source(), "altitude", 6, 33, 22, [400, 700]);
    expect(vide.equals(pngTransparent())).toBe(true);
    expect(origine.requetes).toBe(avant);
  });
});

describe("cache borné, évincé du moins récemment utilisé", () => {
  it("le cache ne dépasse jamais son quota ; un bloc évincé est relu à l'origine", async () => {
    // Chaque dalle synthétique (≈ 58 Ko) tient dans un bloc ; quota d'une dalle et demie : jamais deux gardées.
    const n = ORIGINE.values().next().value!.octets.length;
    expect(n).toBeLessThan(TAILLE_BLOC);
    await demarrer({ quotaCache: 1.5 * n });
    await service.lire(FICHE.cle, "N47E008", 0, 1023);
    await service.lire(FICHE.cle, "N47E009", 0, 1023);
    await service.evincer();
    expect(service.etat().cache.octets).toBeLessThanOrEqual(1.5 * n);
    expect(service.etat().compteurs.evinces).toBeGreaterThan(0);
    const avant = origine.requetes;
    await service.lire(FICHE.cle, "N47E008", 0, 1023);
    expect(origine.requetes).toBe(avant + 1);
    await service.evincer();
    const blocs = readdirSync(join(racine, "cache-distant", FICHE.cle), { recursive: true }).filter((f) => /(^|\/)b\d+$/.test(String(f)));
    expect(blocs.length).toBeLessThanOrEqual(1);
  });

  it("le quota du cache doit tenir dans celui du volume terrain", () => {
    expect(() => new ServiceDistant({ racine, sources: SOURCES, quotaCache: 3e9, quotaVolume: 2e9, budget: BUDGET_DISTANT_DEFAUT })).toThrow(/quota/i);
  });
});

describe("liste fermée, redirections, indisponibilité", () => {
  it("refuse un hôte ou un chemin hors fiche, une source inconnue, une redirection, une origine qui ignore les plages", async () => {
    const budget = new CompteurBudget(BUDGET_DISTANT_DEFAUT);
    await expect(lirePlageOrigine(SOURCES, "https://autre.exemple.test/DEM_N47_E008/DEM_N47_E008.tif", 0, 10, { budget, transport })).rejects.toMatchObject({ etat: "refuse" });
    await expect(lirePlageOrigine(SOURCES, `https://${HOTE}/DEM_N47_E008/autre.tif`, 0, 10, { budget, transport })).rejects.toMatchObject({ etat: "refuse" });
    expect(origine.requetes).toBe(0);
    await demarrer();
    const inconnue = await fetch(`${process.env["GEODATA_TERRAIN_DISTANT_URL"]}/source/autre-source/N47E008`, { headers: { Range: "bytes=0-9" } });
    expect(inconnue.status).toBe(403);
    origine.mode = "redirection";
    await expect(service.lire(FICHE.cle, "N47E008", 0, 10)).rejects.toMatchObject({ etat: "refuse" });
    origine.mode = "ignore-plage";
    await expect(lirePlageOrigine(SOURCES, MODELE.replaceAll("{lat}", "N47").replaceAll("{lon}", "E008"), 100, 200, { budget, transport })).rejects.toMatchObject({ etat: "indisponible" });
  });

  it("origine en panne ou trop lente : « indisponible », jamais une valeur ; dalle absente : hors couverture", async () => {
    await demarrer({ budget: { delaiMs: 200 } });
    const ex = executeur();
    origine.mode = "panne";
    await expect(valeursDistantes(ex, source(), [[8.5, 47.5]])).rejects.toBeInstanceOf(ErreurDistante);
    await expect(valeursDistantes(ex, source(), [[8.5, 47.5]])).rejects.toMatchObject({ etat: "indisponible" });
    origine.mode = "lent";
    oublierDistants();
    await expect(service.lire(FICHE.cle, "N47E008", 0, 10)).rejects.toMatchObject({ etat: "indisponible" });
    origine.mode = "normal";
    await expect(service.lire(FICHE.cle, "S35W059", 0, 10)).rejects.toMatchObject({ etat: "hors-couverture" });
  });

  it("budget de requêtes distantes atteint : refus motivé (429), sans requête vers l'origine", async () => {
    await demarrer({ budget: { parMinute: 1 } });
    await service.lire(FICHE.cle, "N47E008", 0, 10);
    const avant = origine.requetes;
    const r = await fetch(`${process.env["GEODATA_TERRAIN_DISTANT_URL"]}/source/${FICHE.cle}/N47E009`, { headers: { Range: "bytes=0-9" } });
    expect(r.status).toBe(429);
    expect(r.headers.get("x-terrain-etat")).toBe("budget");
    expect(origine.requetes).toBe(avant);
  });

  it("source modifiée depuis sa première lecture (ETag) : refusée, rien n'est mélangé", async () => {
    await demarrer();
    const ex = executeur();
    await valeursDistantes(ex, source(), [[8.5, 47.5]]);
    const url = MODELE.replaceAll("{lat}", "N47").replaceAll("{lon}", "E008");
    const ancien = ORIGINE.get(url)!;
    ORIGINE.set(url, { ...ancien, etag: "\"a2\"" });
    try {
      rmSync(join(racine, "cache-distant"), { recursive: true, force: true });
      await arreter();
      await demarrer();
      oublierDistants();
      // Le service n'a plus d'épinglage local (cache vidé) mais la version en a un : la nouvelle source est refusée.
      await expect(valeursDistantes(ex, source(), [[8.5, 47.5]])).rejects.toMatchObject({ etat: "source-modifiee" });
    } finally {
      ORIGINE.set(url, ancien);
    }
  });
});
