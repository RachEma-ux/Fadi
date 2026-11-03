/**
 * Services du terrain haute résolution (plan v1.0, lot TER-04, Issue #381), sous `/geodata/api/terrain/…` : catalogue par
 * emprise, altitude au point, profil, statistiques dans un polygone, tuiles d'altitude / pente / ombrage, courbes en tuiles
 * vectorielles, exports (tâche de fond), publication et retour arrière (responsable de publication).
 *
 * Droits par usage de chaque version : consultation (catalogue), calcul (point, profil, statistiques), tuiles (tuiles,
 * courbes), export et téléchargement (exports) ; un droit inconnu bloque. Une version non publiée n'est jamais révélée
 * (404). Réponses privées (`private`), jamais un cache public. `GEODATA_TERRAIN_ENABLED=false` ferme tout (404).
 * Chaque résultat numérique porte sa source : version, pas, référence verticale, état de qualité, étiquette, attribution.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { PRODUITS_TERRAIN, type ProduitTerrain } from "@parcours/geodata-model";
import { pool } from "../../db/client.js";
import { capacites, erreur, journal } from "../../lib/geodata/acces.js";
import { StockageTerrain } from "../../lib/geodata/terrain/stockage.js";
import {
  altitudePoint, exigerUsage, metadonnees, profilTerrain, publierVersion, ServiceRefuse, sourcePubliee, sourcesPubliees, statistiquesTerrain, terrainActive,
  tuileTerrain, type StyleTuile,
} from "../../lib/geodata/terrain/services.js";
import { demanderExport, equidistanceAdmise, baseCourbes, exportDuDemandeur } from "../../lib/geodata/terrain/exports.js";

export const terrainRouter = Router();

const stockage = (): StockageTerrain => {
  const s = StockageTerrain.depuisEnvironnement();
  if (!s) throw new ServiceRefuse(503, "terrain_indisponible", "Aucun volume terrain configuré sur ce serveur.");
  return s;
};

terrainRouter.use("/terrain", (_req, res, next) => (terrainActive() ? next() : void res.status(404).json({ error: "not_found", message: "Le terrain haute résolution n'est pas activé sur ce serveur." })));

/** Exécute un service ; une `ServiceRefuse` devient une réponse motivée, toute autre erreur une 500 sans détail. */
const service = (f: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await f(req, res);
  } catch (e) {
    if (e instanceof ServiceRefuse) return erreur(res, e.statut, e.code, e.message);
    next(e);
  }
};

const produitDe = (x: unknown): ProduitTerrain => {
  const p = x === undefined ? "MNT" : x;
  if (!(PRODUITS_TERRAIN as readonly unknown[]).includes(p)) throw new ServiceRefuse(400, "invalid_input", "Produit MNT ou MNS attendu (jamais l'un pour l'autre).");
  return p as ProduitTerrain;
};
const nombre = (x: unknown, nom: string, min: number, max: number): number => {
  const n = Number(x);
  if (x === undefined || x === "" || !Number.isFinite(n) || n < min || n > max) throw new ServiceRefuse(400, "invalid_input", `${nom} invalide.`);
  return n;
};
const tuile = (req: Request) => {
  const z = Number(req.params["z"]), x = Number(req.params["x"]), y = Number(String(req.params["y"]).replace(/\.(png|pbf)$/, ""));
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new ServiceRefuse(400, "invalid_input", "Tuile hors limites.");
  return { z, x, y };
};

/** Catalogue : versions publiées consultables qui recoupent l'emprise, avec couverture exacte, qualité, pas, datum. */
terrainRouter.get("/terrain/jeux", service(async (req, res) => {
  const produit = req.query["produit"] === undefined ? undefined : produitDe(req.query["produit"]);
  const e = ["ouest", "sud", "est", "nord"].map((k) => (req.query[k] === undefined ? null : nombre(req.query[k], k, -180, 180)));
  const sources = await sourcesPubliees(pool, produit);
  const filtrees = e.every((v) => v !== null) ? sources.filter((s) => s.emprise[0] <= e[2]! && s.emprise[2] >= e[0]! && s.emprise[1] <= e[3]! && s.emprise[3] >= e[1]!) : sources;
  const couvertures = new Map((await pool.query<{ id: string; g: string }>("SELECT terrain_version_id AS id, ST_AsGeoJSON(geom, 7) AS g FROM geodata_terrain_couvertures WHERE terrain_version_id = ANY($1)", [filtrees.map((s) => s.id)])).rows.map((r) => [r.id, JSON.parse(r.g)]));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ jeux: filtrees.map((s) => ({ ...metadonnees(s), couverture: couvertures.get(s.id) ?? null, droits: s.droits })) });
}));

terrainRouter.get("/terrain/point", service(async (req, res) => {
  const lon = nombre(req.query["lon"], "lon", -180, 180), lat = nombre(req.query["lat"], "lat", -90, 90);
  res.json(await altitudePoint(pool, stockage(), lon, lat, produitDe(req.query["produit"])));
}));

terrainRouter.post("/terrain/profil", service(async (req, res) => {
  const b = (req.body ?? {}) as { ligne?: unknown; pas?: unknown; produit?: unknown };
  if (!Array.isArray(b.ligne) || !b.ligne.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) {
    throw new ServiceRefuse(400, "invalid_input", "Ligne [[lon, lat], …] en WGS 84 attendue.");
  }
  const r = await profilTerrain(pool, stockage(), b.ligne as [number, number][], nombre(b.pas ?? 10, "pas", 0.05, 10_000), produitDe(b.produit));
  res.json({
    points: r.profil.points.map((p, i) => ({ chainage: p.chainage, lon: r.lonLat[i]![0], lat: r.lonLat[i]![1], altitude: p.altitude, source: p.source, interpolee: p.interpolee })),
    transitions: r.profil.transitions, lacunes: r.profil.lacunes, sources: r.sources, referencesEcartees: r.referencesEcartees,
    chainage: "mètres, projection transverse de Mercator locale (WGS 84) centrée sur le premier sommet",
  });
}));

terrainRouter.post("/terrain/statistiques", service(async (req, res) => {
  const b = (req.body ?? {}) as { zone?: { type?: unknown; coordinates?: unknown }; produit?: unknown; versionId?: unknown };
  const anneaux = b.zone?.type === "Polygon" ? b.zone.coordinates : null;
  if (!Array.isArray(anneaux) || !anneaux.length || anneaux.length > 100 || !anneaux.every((a) => Array.isArray(a) && a.length >= 4 && a.length <= 10_000 && a.every((p) => Array.isArray(p) && p.length >= 2 && p.every((v) => typeof v === "number" && Number.isFinite(v))))) {
    throw new ServiceRefuse(400, "invalid_input", "Zone GeoJSON Polygon (WGS 84, anneau extérieur puis trous) attendue.");
  }
  res.json(await statistiquesTerrain(pool, stockage(), anneaux as [number, number][][], produitDe(b.produit), typeof b.versionId === "string" ? b.versionId : null));
}));

const STYLES: readonly StyleTuile[] = ["altitude", "pente", "ombrage"];
terrainRouter.get("/terrain/tuiles/:versionId/:style/:z/:x/:y", service(async (req, res) => {
  const style = req.params["style"] as StyleTuile;
  if (!STYLES.includes(style)) throw new ServiceRefuse(400, "invalid_input", "Style altitude, pente ou ombrage attendu.");
  const { z, x, y } = tuile(req);
  const s = await sourcePubliee(pool, String(req.params["versionId"]));
  exigerUsage(s, "tuiles");
  // Légende adaptative : plage explicite (portée déclarée par le client) ; sinon légende verrouillée sur la version.
  const plage = req.query["min"] !== undefined && req.query["max"] !== undefined ? [nombre(req.query["min"], "min", -12_000, 10_000), nombre(req.query["max"], "max", -12_000, 10_000)] as [number, number] : null;
  const png = await tuileTerrain(pool, stockage(), s, style, z, x, y, plage);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Vary", "Cookie");
  res.send(png);
}));

/** Courbes en tuile vectorielle (MVT, couche « courbes ») à l'équidistance demandée, jamais sous le seuil (TER-D17). */
terrainRouter.get("/terrain/courbes/:versionId/:z/:x/:y", service(async (req, res) => {
  const { z, x, y } = tuile(req);
  const s = await sourcePubliee(pool, String(req.params["versionId"]));
  exigerUsage(s, "tuiles");
  const eq = await equidistanceAdmise(pool as unknown as import("pg").PoolClient, s.id, req.query["equidistance"] === undefined ? null : nombre(req.query["equidistance"], "équidistance", 0.01, 10_000));
  const base = (await baseCourbes(pool, s.id, eq))!;
  const ref = s.referenceVerticale.statut === "declaree" ? `${s.referenceVerticale.libelle}${s.referenceVerticale.code ? ` (${s.referenceVerticale.code})` : ""}` : "non déclarée";
  const [r] = (await pool.query<{ mvt: Buffer }>(
    `WITH b AS (SELECT ST_TileEnvelope($2, $3, $4) AS e),
          m AS (SELECT ST_AsMVTGeom(ST_Transform(c.geom, 3857), b.e, 4096, 64, true) AS geom, c.altitude,
                       abs(c.altitude / ($6 * 5) - round(c.altitude / ($6 * 5))) < 1e-6 AS maitresse, $6::float8 AS equidistance, $7::text AS reference
                  FROM geodata_terrain_courbes c, b
                 WHERE c.terrain_version_id = $1 AND c.equidistance = $5 AND abs(c.altitude / $6 - round(c.altitude / $6)) < 1e-6
                   AND ST_Transform(c.geom, 3857) && b.e)
     SELECT ST_AsMVT(m.*, 'courbes', 4096, 'geom') AS mvt FROM m WHERE m.geom IS NOT NULL`,
    [s.id, z, x, y, base, eq, ref])).rows;
  res.setHeader("Content-Type", "application/vnd.mapbox-vector-tile");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Vary", "Cookie");
  res.send(r?.mvt ?? Buffer.alloc(0));
}));

terrainRouter.post("/terrain/exports", service(async (req, res) => {
  const b = (req.body ?? {}) as { versionId?: unknown; format?: unknown; emprise?: unknown; equidistance?: unknown };
  if (typeof b.versionId !== "string") throw new ServiceRefuse(400, "invalid_input", "versionId attendu.");
  const c = await pool.connect();
  try {
    const r = await demanderExport(c, b.versionId, req.user!.id, b.format, b.emprise, b.equidistance);
    res.status(202).json({ id: r.id, etat: "en_attente", equidistance: r.equidistance, message: "Export préparé en tâche de fond par le travailleur terrain ; disponible 24 h pour vous seul." });
  } finally {
    c.release();
  }
}));

terrainRouter.get("/terrain/exports/:id", service(async (req, res) => {
  const e = await exportDuDemandeur(pool, String(req.params["id"]), req.user!.id);
  res.json({ id: e.id, etat: e.etat, format: e.format, nomFichier: e.nom_fichier, taille: e.taille, empreinte: e.empreinte, motif: e.motif_echec, expireLe: e.expire_le, versionId: e.terrain_version_id });
}));

terrainRouter.get("/terrain/exports/:id/fichier", service(async (req, res) => {
  const e = await exportDuDemandeur(pool, String(req.params["id"]), req.user!.id);
  if (e.etat === "expire") throw new ServiceRefuse(410, "expire", "Export expiré : le demander de nouveau.");
  if (e.etat !== "pret" || !e.cle_stockage) throw new ServiceRefuse(409, "pas_pret", `Export en état « ${e.etat} ».`);
  await journal(req.user!.id, "terrain.export.telechargement", e.id, "succes", { versionId: e.terrain_version_id });
  res.setHeader("Cache-Control", "private, no-store");
  res.download(stockage().chemin(e.cle_stockage), e.nom_fichier ?? "export");
}));

/** Publication d'une version acceptée, ou retour arrière vers une version remplacée (responsable de publication). */
terrainRouter.post("/terrain/versions/:id/publier", service(async (req, res) => {
  const caps = await capacites(req.user!.id);
  if (!caps.has("publier-version")) {
    await journal(req.user!.id, "terrain.publication.refusee", String(req.params["id"]), "refus");
    throw new ServiceRefuse(403, "forbidden", "Rôle GeoData « responsable-publication » requis.");
  }
  const c = await pool.connect();
  try {
    const r = await publierVersion(c, String(req.params["id"]), req.user!.id, String((req.body as { motif?: unknown } | undefined)?.motif ?? ""));
    res.json({ publiee: req.params["id"], remplacee: r.remplacee });
  } finally {
    c.release();
  }
}));
