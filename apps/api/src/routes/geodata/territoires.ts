/**
 * Découpage territorial (lot H, D-GD-28) : lecture seule de `geodata_pays` et `geodata_territoires`, chargés en base par
 * la chaîne d'import depuis des fiches qualifiées. Indépendant des couches et des cartes : la barre territoriale de
 * l'interface s'en sert en permanence. Aucun pays n'est connu du code : seul ce qui est en base est servi.
 *   GET /territoires                         pays chargés et leurs niveaux (nom, nombre d'unités)
 *   GET /territoires/:pays/unites?parent=…   unités du premier niveau, ou enfants d'une unité (triées par nom)
 *   GET /territoires/:pays/unites/:code      une unité : ancêtres, emprise, contour simplifié pour l'affichage, attribution
 */
import { Router } from "express";
import { erreur, requete } from "../../lib/geodata/acces.js";

export const territoiresRouter = Router();

const PAYS = /^[A-Z]{2}$/;
const CODE = /^[A-Za-z0-9:._-]{1,64}$/;

territoiresRouter.get("/territoires", async (_req, res) => {
  const pays = await requete<{ code: string; nom: string; niveaux: Record<string, { singulier: string; pluriel: string }> }>("SELECT code, nom, niveaux FROM geodata_pays ORDER BY nom");
  const comptes = await requete<{ pays: string; rang: number; n: number }>("SELECT pays, rang, count(*)::int AS n FROM geodata_territoires GROUP BY pays, rang");
  res.json({
    pays: pays.map((p) => ({
      code: p.code, nom: p.nom,
      niveaux: Object.entries(p.niveaux).map(([r, n]) => ({ rang: Number(r), singulier: n.singulier, pluriel: n.pluriel, unites: comptes.find((c) => c.pays === p.code && c.rang === Number(r))?.n ?? 0 }))
        .filter((n) => n.unites > 0).sort((a, b) => a.rang - b.rang),
    })).filter((p) => p.niveaux.length > 0),
  });
});

const emprise = "json_build_array(ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e))";

territoiresRouter.get("/territoires/:pays/unites", async (req, res) => {
  const pays = req.params.pays;
  const parent = typeof req.query["parent"] === "string" ? req.query["parent"] : null;
  if (!PAYS.test(pays) || (parent !== null && !CODE.test(parent))) return erreur(res, 400, "invalid_input", "Pays ou unité invalide.");
  const lignes = parent === null
    ? await requete<{ code: string; nom: string; rang: number; emprise: number[] }>(
      `SELECT code, nom, rang, ${emprise} AS emprise FROM (SELECT code, nom, rang, ST_Envelope(geom) AS e FROM geodata_territoires
        WHERE pays = $1 AND rang = (SELECT min(rang) FROM geodata_territoires WHERE pays = $1)) x ORDER BY nom`, [pays])
    : await requete<{ code: string; nom: string; rang: number; emprise: number[] }>(
      `SELECT code, nom, rang, ${emprise} AS emprise FROM (
         SELECT t.code, t.nom, t.rang, ST_Envelope(t.geom) AS e FROM geodata_territoires t
          JOIN geodata_territoires p ON p.pays = t.pays AND p.code = $2 AND p.rang = t.rang - 1
          WHERE t.pays = $1 AND t.parent_code = $2) x ORDER BY nom`, [pays, parent]);
  res.json({ unites: lignes });
});

territoiresRouter.get("/territoires/:pays/unites/:code", async (req, res) => {
  const { pays, code } = req.params;
  if (!PAYS.test(pays) || !CODE.test(code)) return erreur(res, 400, "invalid_input", "Pays ou unité invalide.");
  const rang = typeof req.query["rang"] === "string" && /^[1-4]$/.test(req.query["rang"]) ? Number(req.query["rang"]) : null;
  // Contour simplifié pour l'affichage seulement (tolérance d'environ 1/2000 de l'emprise) ; la géométrie de référence
  // reste intacte en base.
  const [u] = await requete<{ code: string; nom: string; rang: number; parent_code: string | null; emprise: number[]; contour: string; attribution: string }>(
    `SELECT t.code, t.nom, t.rang, t.parent_code, ${emprise} AS emprise,
            ST_AsGeoJSON(ST_SimplifyPreserveTopology(t.geom, greatest(ST_XMax(e) - ST_XMin(e), ST_YMax(e) - ST_YMin(e)) / 2000), 6) AS contour,
            v.attribution
       FROM (SELECT *, ST_Envelope(geom) AS e FROM geodata_territoires WHERE pays = $1 AND code = $2 AND ($3::int IS NULL OR rang = $3) ORDER BY rang LIMIT 1) t
       JOIN geodata_versions v ON v.id = t.version_id`, [pays, code, rang]);
  if (!u) return erreur(res, 404, "not_found", "Unité absente du découpage territorial en base.");
  // Ancêtres : remontée par parent_code, du plus haut au plus proche.
  const ancetres = await requete<{ code: string; nom: string; rang: number }>(
    `WITH RECURSIVE a AS (
       SELECT code, nom, rang, parent_code FROM geodata_territoires WHERE pays = $1 AND rang = $2 - 1 AND code = $3
       UNION ALL
       SELECT t.code, t.nom, t.rang, t.parent_code FROM geodata_territoires t JOIN a ON t.pays = $1 AND t.rang = a.rang - 1 AND t.code = a.parent_code
     ) SELECT code, nom, rang FROM a ORDER BY rang`, [pays, u.rang, u.parent_code]);
  const [enfants] = await requete<{ n: number }>("SELECT count(*)::int AS n FROM geodata_territoires WHERE pays = $1 AND rang = $2 AND parent_code = $3", [pays, u.rang + 1, u.code]);
  res.json({ code: u.code, nom: u.nom, rang: u.rang, emprise: u.emprise, ancetres, enfants: enfants?.n ?? 0, contour: JSON.parse(u.contour), attribution: u.attribution });
});
