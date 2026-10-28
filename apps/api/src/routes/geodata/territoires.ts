/**
 * Découpage territorial (lot H, D-GD-28) : lecture seule de `geodata_pays` et `geodata_territoires`, chargés en base par
 * la chaîne d'import depuis des fiches qualifiées. Indépendant des couches et des cartes : la barre territoriale de
 * l'interface s'en sert en permanence. Aucun pays n'est connu du code : seul ce qui est en base est servi.
 *   GET /territoires                         pays chargés et leurs niveaux (nom, nombre d'unités)
 *   GET /territoires/:pays/unites?parent=…   unités du premier niveau, ou enfants d'une unité (triées par nom)
 *   GET /territoires/:pays/unites/:code      une unité : ancêtres, emprise, contour simplifié pour l'affichage, attribution
 *   GET /territoires/version/:versionId/unites/:code   la même, retrouvée par la version de sa couche (pays déduit)
 *   GET /territoires/:pays/point?lon=&lat=   unités du pays qui contiennent un point, de la plus élémentaire à la plus
 *                                            globale (sélection par nombre de clics sur une carte vierge, D-GD-34)
 *   GET /territoires/:pays/decoupage         découpage administratif en base (D-GD-35) : niveaux (rang, noms, couche) et
 *                                            liens parent → enfant de toutes les entités, pour l'interface
 * Seules les unités d'une version de référence **publiée** et consultable sont servies : une version retirée disparaît
 * de la navigation sans attendre un nouveau chargement.
 */
import { Router } from "express";
import { erreur, requete } from "../../lib/geodata/acces.js";

export const territoiresRouter = Router();

const PAYS = /^[A-Z]{2}$/;
const CODE = /^[A-Za-z0-9:._-]{1,64}$/;
const VERSION = /^[A-Za-z0-9_-]{1,80}$/;
/** Unités servies : version de référence publiée, consultation autorisée (comme `VERSION_CONSULTABLE` sans espace). */
const T = `(SELECT t.* FROM geodata_territoires t JOIN geodata_versions v ON v.id = t.version_id
  WHERE v.etat = 'publiee' AND v.espace_id IS NULL AND v.droits->>'consultation' = 'autorise')`;

territoiresRouter.get("/territoires", async (_req, res) => {
  const pays = await requete<{ code: string; nom: string; niveaux: Record<string, { singulier: string; pluriel: string }> }>("SELECT code, nom, niveaux FROM geodata_pays ORDER BY nom");
  const comptes = await requete<{ pays: string; rang: number; n: number; versions: string[] }>(`SELECT pays, rang, count(*)::int AS n, array_agg(DISTINCT version_id) AS versions FROM ${T} x GROUP BY pays, rang`);
  res.json({
    pays: pays.map((p) => ({
      code: p.code, nom: p.nom,
      niveaux: Object.entries(p.niveaux).map(([r, n]) => ({ rang: Number(r), singulier: n.singulier, pluriel: n.pluriel, unites: comptes.find((c) => c.pays === p.code && c.rang === Number(r))?.n ?? 0 }))
        .filter((n) => n.unites > 0).sort((a, b) => a.rang - b.rang),
      versions: [...new Set(comptes.filter((c) => c.pays === p.code).flatMap((c) => c.versions))].sort(),
    })).filter((p) => p.niveaux.length > 0),
  });
});

const emprise = "json_build_array(ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e))";

/**
 * Unités du pays contenant un point (D-GD-34), de la plus élémentaire (rang le plus grand) à la plus globale, avec la
 * couche de leur version (fiche d'objet). Un point hors du découpage du pays rend une liste vide : aucune sélection.
 */
territoiresRouter.get("/territoires/:pays/point", async (req, res) => {
  const pays = req.params.pays;
  const lon = Number(req.query["lon"]), lat = Number(req.query["lat"]);
  if (!PAYS.test(pays)) return erreur(res, 400, "invalid_input", "Pays invalide.");
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return erreur(res, 400, "invalid_input", "Coordonnées lon / lat attendues (WGS 84).");
  const unites = await requete<{ pays: string; code: string; nom: string; rang: number; versionId: string; coucheId: string }>(
    `SELECT t.pays, t.code, t.nom, t.rang, t.version_id AS "versionId", c.id AS "coucheId"
       FROM ${T} t JOIN geodata_couches c ON c.version_id = t.version_id
      WHERE t.pays = $1 AND ST_Intersects(t.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))
      ORDER BY t.rang DESC, t.code`, [pays, lon, lat]);
  res.json({ unites });
});

territoiresRouter.get("/territoires/:pays/unites", async (req, res) => {
  const pays = req.params.pays;
  const parent = typeof req.query["parent"] === "string" ? req.query["parent"] : null;
  if (!PAYS.test(pays) || (parent !== null && !CODE.test(parent))) return erreur(res, 400, "invalid_input", "Pays ou unité invalide.");
  const lignes = parent === null
    ? await requete<{ code: string; nom: string; rang: number; emprise: number[] }>(
      `SELECT code, nom, rang, ${emprise} AS emprise FROM (SELECT code, nom, rang, ST_Envelope(geom) AS e FROM ${T} t
        WHERE pays = $1 AND rang = (SELECT min(rang) FROM ${T} m WHERE pays = $1)) x ORDER BY nom`, [pays])
    : await requete<{ code: string; nom: string; rang: number; emprise: number[] }>(
      `SELECT code, nom, rang, ${emprise} AS emprise FROM (
         SELECT t.code, t.nom, t.rang, ST_Envelope(t.geom) AS e FROM ${T} t
          JOIN ${T} p ON p.pays = t.pays AND p.code = $2 AND p.rang < t.rang
          WHERE t.pays = $1 AND t.parent_code = $2) x ORDER BY rang, nom`, [pays, parent]);
  res.json({ unites: lignes });
});

/** Détail d'une unité (pays connu, ou retrouvé par la version de sa couche). */
async function unite(res: import("express").Response, filtre: { pays: string } | { versionId: string }, code: string, rang: number | null) {
  // Contour tel qu'en base (D-GD-33 : aucune simplification propre, pour qu'il se superpose exactement aux tuiles des
  // couches de limites, qui partagent la même topologie) ; la géométrie de référence reste intacte.
  const [u] = await requete<{ pays: string; code: string; nom: string; rang: number; parent_code: string | null; emprise: number[]; contour: string; attribution: string; versionId: string; coucheId: string }>(
    `SELECT t.pays, t.code, t.nom, t.rang, t.parent_code, ${emprise} AS emprise,
            ST_AsGeoJSON(t.geom, 6) AS contour,
            v.attribution, v.id AS "versionId", c.id AS "coucheId"
       FROM (SELECT *, ST_Envelope(geom) AS e FROM ${T} x
              WHERE ${"pays" in filtre ? "pays = $1" : "version_id = $1"} AND code = $2 AND ($3::int IS NULL OR rang = $3) ORDER BY rang LIMIT 1) t
       JOIN geodata_versions v ON v.id = t.version_id JOIN geodata_couches c ON c.version_id = v.id`, ["pays" in filtre ? filtre.pays : filtre.versionId, code, rang]);
  if (!u) return erreur(res, 404, "not_found", "Unité absente du découpage territorial en base.");
  // Ancêtres : remontée par le lien parent → enfant (D-GD-35 : la profondeur varie selon l'endroit), du plus haut au plus
  // proche ; un parent d'un rang qui n'est pas plus global arrête la remontée (jamais de boucle).
  const ancetres = await requete<{ code: string; nom: string; rang: number }>(
    `WITH RECURSIVE a AS (
       SELECT code, nom, rang, parent_code FROM ${T} t0 WHERE pays = $1 AND rang < $2 AND code = $3
       UNION ALL
       SELECT t.code, t.nom, t.rang, t.parent_code FROM ${T} t JOIN a ON t.pays = $1 AND t.rang < a.rang AND t.code = a.parent_code
     ) SELECT code, nom, rang FROM a ORDER BY rang`, [u.pays, u.rang, u.parent_code]);
  const [enfants] = await requete<{ n: number }>(`SELECT count(*)::int AS n FROM ${T} t WHERE pays = $1 AND rang > $2 AND parent_code = $3`, [u.pays, u.rang, u.code]);
  res.json({ pays: u.pays, code: u.code, nom: u.nom, rang: u.rang, emprise: u.emprise, ancetres, enfants: enfants?.n ?? 0, contour: JSON.parse(u.contour), attribution: u.attribution, versionId: u.versionId, coucheId: u.coucheId });
}
const rangDemande = (q: unknown) => (typeof q === "string" && /^[1-9]\d{0,2}$/.test(q) ? Number(q) : null);

territoiresRouter.get("/territoires/version/:versionId/unites/:code", async (req, res) => {
  const { versionId, code } = req.params;
  if (!VERSION.test(versionId) || !CODE.test(code)) return erreur(res, 400, "invalid_input", "Version ou unité invalide.");
  await unite(res, { versionId }, code, rangDemande(req.query["rang"]));
});

territoiresRouter.get("/territoires/:pays/unites/:code", async (req, res) => {
  const { pays, code } = req.params;
  if (!PAYS.test(pays) || !CODE.test(code)) return erreur(res, 400, "invalid_input", "Pays ou unité invalide.");
  await unite(res, { pays }, code, rangDemande(req.query["rang"]));
});

/**
 * Découpage administratif en base (D-GD-35) : niveaux (du plus global au plus fin, avec la couche publiée de leur fiche)
 * et liens parent → enfant des entités non retirées. L'interface en tire rangs, parents et niveaux réels d'un endroit,
 * sans aucune règle écrite dans son code. Un pays sans découpage importé rend des listes vides.
 */
territoiresRouter.get("/territoires/:pays/decoupage", async (req, res) => {
  const pays = req.params.pays;
  if (!PAYS.test(pays)) return erreur(res, 400, "invalid_input", "Pays invalide.");
  const niveaux = await requete<{ code: string; rang: number; singulier: string; pluriel: string; fiche: string | null; coucheId: string | null }>(
    `SELECT n.code, n.rang, n.singulier, n.pluriel, n.fiche_cle AS fiche,
            (SELECT c.id FROM geodata_sources s JOIN geodata_versions v ON v.source_id = s.id JOIN geodata_couches c ON c.version_id = v.id
              WHERE s.cle = n.fiche_cle AND s.espace_id IS NULL AND v.espace_id IS NULL AND v.etat = 'publiee' AND v.droits->>'consultation' = 'autorise'
              ORDER BY v.publiee_le DESC NULLS LAST LIMIT 1) AS "coucheId"
       FROM geodata_niveaux_administratifs n WHERE n.pays = $1 ORDER BY n.rang`, [pays]);
  const entites = await requete<{ code: string; parent: string | null; niveau: string }>(
    "SELECT code, parent_code AS parent, niveau FROM geodata_entites_administratives WHERE pays = $1 AND retire_le IS NULL ORDER BY code", [pays]);
  res.json({ pays, niveaux, entites });
});
