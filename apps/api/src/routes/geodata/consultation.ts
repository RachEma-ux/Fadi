/**
 * Consultation GeoData (plan GD-04) : catalogue, couche, recherche, tuiles vectorielles, table paginée, fiche d'objet et
 * valeurs d'indicateur. Toute lecture passe par `VERSION_CONSULTABLE` : une version privée d'un autre espace, retirée ou en
 * préparation n'est jamais servie (GEO 08) ; réponses bornées (pagination, plafond d'objets).
 */
import { Router, type Request } from "express";
import { attribuerCategories, lireCoordonnees, lireDroits, OBJETS_PAR_COUCHE, verifierUsage } from "@parcours/geodata-model";
import { erreur, espacePersonnel, introuvable, requete, VERSION_CONSULTABLE } from "../../lib/geodata/acces.js";
import { decompresser, pngTransparent, tuileRaster, valeurAuPoint, type GrilleRaster } from "../../lib/geodata/raster.js";
import type { DescriptionRaster } from "@parcours/geodata-model";

export const consultationRouter = Router();

const espaceDe = async (req: Request) => (await espacePersonnel(req.user!.id)).id;

/** Description publique d'une version (fiche obligatoire, concept § 7.2) ; jamais de chemin de fichier interne. */
export const COLONNES_VERSION = `v.id AS version_id, v.libelle, v.empreinte, v.url_source, v.recupere_le, v.periode, v.licence, v.attribution, v.droits,
  v.crs_source, v.precision_donnees, v.transformations, v.controles, v.synthetique, v.etat, v.publiee_le, v.motif_retrait, (v.espace_id IS NOT NULL) AS privee,
  s.id AS source_id, s.titre AS source_titre, s.producteur, s.theme, s.couverture, s.description AS source_description`;

/**
 * Catalogue et recherche présentent, pour chaque source, sa version publiée la plus récente ; les versions précédentes
 * restent servies (tuiles, table, fiches) aux cartes et analyses qui les référencent (INV-07).
 */
const DERNIERE_VERSION = (alias: string, parametreEspace: string) =>
  `NOT EXISTS (SELECT 1 FROM geodata_versions vr WHERE vr.source_id = ${alias}.source_id AND ${VERSION_CONSULTABLE("vr", parametreEspace)} AND vr.publiee_le > ${alias}.publiee_le)`;

export function lireVersion(r: Record<string, unknown>) {
  return {
    id: r["version_id"], libelle: r["libelle"], empreinte: r["empreinte"], urlSource: r["url_source"], recupereLe: r["recupere_le"], periode: r["periode"],
    licence: r["licence"], attribution: r["attribution"], droits: lireDroits(r["droits"]), crsSource: r["crs_source"], precision: r["precision_donnees"],
    transformations: r["transformations"], controles: r["controles"], synthetique: r["synthetique"], etat: r["etat"], publieeLe: r["publiee_le"],
    motifRetrait: r["motif_retrait"], privee: r["privee"],
    source: { id: r["source_id"], titre: r["source_titre"], producteur: r["producteur"], theme: r["theme"], couverture: r["couverture"], description: r["source_description"] },
  };
}

/** Dimensions d'un indicateur (D-GD-17, lot A2) ; nulles pour les indicateurs sans déclinaison. */
const dimensions = (l: Record<string, unknown>) => ({ theme: l["theme"] ?? null, famille: l["famille"] ?? null, modalite: l["modalite"] ?? null, milieu: l["milieu"] ?? null, sexe: l["sexe"] ?? null });

async function indicateursDe(coucheIds: string[]) {
  if (!coucheIds.length) return new Map<string, unknown[]>();
  const lignes = await requete(
    // Comptes d'absences enregistrés à l'import (lot A2 : des centaines d'indicateurs par couche), sinon recomptés.
    `SELECT i.id, i.couche_id, i.titre, i.unite, i.periode, i.nature, i.methode, i.denominateur, i.description,
            i.theme, i.famille, i.modalite, i.milieu, i.sexe,
            coalesce(i.nb_absentes, (SELECT count(*) FROM geodata_valeurs va WHERE va.indicateur_id = i.id AND va.valeur IS NULL)) AS absentes,
            coalesce(i.nb_total, (SELECT count(*) FROM geodata_valeurs va WHERE va.indicateur_id = i.id)) AS total
       FROM geodata_indicateurs i
      WHERE i.couche_id = ANY($1) ORDER BY i.nature DESC, i.ordre, i.titre`,
    [coucheIds],
  );
  const m = new Map<string, unknown[]>();
  for (const l of lignes) {
    const liste = m.get(l["couche_id"] as string) ?? [];
    liste.push({ id: l["id"], titre: l["titre"], unite: l["unite"], periode: l["periode"], nature: l["nature"], methode: l["methode"], denominateur: l["denominateur"], description: l["description"], absentes: Number(l["absentes"]), total: Number(l["total"]), ...dimensions(l) });
    m.set(l["couche_id"] as string, liste);
  }
  return m;
}

export function lireCouche(r: Record<string, unknown>, indicateurs: unknown[]) {
  return {
    id: r["couche_id"], titre: r["couche_titre"], description: r["couche_description"], typeGeometrie: r["type_geometrie"], niveau: r["niveau"],
    proprietesExposees: r["proprietes_exposees"], styleDefaut: r["style_defaut"], nombreObjets: r["nombre_objets"],
    emprise: r["emprise"] ? JSON.parse(r["emprise"] as string) : null, indicateurs, version: lireVersion(r), raster: r["raster"] ?? null,
  };
}

const COLONNES_COUCHE = `c.id AS couche_id, c.titre AS couche_titre, c.description AS couche_description, c.type_geometrie, c.niveau, c.proprietes_exposees,
  c.style_defaut, c.nombre_objets, ST_AsGeoJSON(c.emprise, 6) AS emprise, (SELECT ra.description FROM geodata_rasters ra WHERE ra.couche_id = c.id) AS raster, ${COLONNES_VERSION}`;

/** Couche consultable par l'espace, sinon `null` (absente, privée d'un tiers, retirée : même réponse). */
export async function coucheConsultable(espaceId: string, coucheId: string) {
  const [r] = await requete(`SELECT ${COLONNES_COUCHE} FROM geodata_couches c JOIN geodata_versions v ON v.id = c.version_id JOIN geodata_sources s ON s.id = v.source_id
    WHERE c.id = $2 AND ${VERSION_CONSULTABLE("v", "$1")}`, [espaceId, coucheId]);
  return r ?? null;
}

consultationRouter.get("/catalogue", async (req, res) => {
  const espaceId = await espaceDe(req);
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim().slice(0, 80).toLowerCase() : "";
  const lignes = await requete(
    `SELECT ${COLONNES_COUCHE} FROM geodata_couches c JOIN geodata_versions v ON v.id = c.version_id JOIN geodata_sources s ON s.id = v.source_id
      WHERE ${VERSION_CONSULTABLE("v", "$1")}
        AND ${DERNIERE_VERSION("v", "$1")}
        AND ($2 = '' OR lower(c.titre || ' ' || s.titre || ' ' || s.theme || ' ' || s.producteur) LIKE '%' || $2 || '%')
      ORDER BY (v.espace_id IS NOT NULL), s.theme, c.titre LIMIT 200`,
    [espaceId, q],
  );
  const ind = await indicateursDe(lignes.map((l) => l["couche_id"] as string));
  // Versions plus récentes publiées pour une même source : signalées, jamais substituées (INV-07).
  res.json({ couches: lignes.map((l) => lireCouche(l, ind.get(l["couche_id"] as string) ?? [])) });
});

consultationRouter.get("/couches/:id", async (req, res) => {
  const r = await coucheConsultable(await espaceDe(req), req.params.id);
  if (!r) return introuvable(res);
  const ind = await indicateursDe([r["couche_id"] as string]);
  res.json(lireCouche(r, ind.get(r["couche_id"] as string) ?? []));
});

/** Recherche : coordonnées étiquetées, sinon unités par nom ou code dans les couches consultables (20 résultats au plus). */
// Recherche : les unités du HCP d'abord (D-GD-18, priorité HCP quand une donnée existe aussi dans OpenStreetMap).
consultationRouter.get("/recherche", async (req, res) => {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim().slice(0, 120) : "";
  if (q.length < 2) return erreur(res, 400, "invalid_input", "Saisissez au moins deux caractères.", { champs: ["q"] });
  const c = lireCoordonnees(q);
  if (c.ok) return void res.json({ resultats: [{ type: "coordonnees", libelle: `lon ${c.point.lon} · lat ${c.point.lat}`, point: c.point, provenance: "Saisie de l'utilisateur (WGS 84, longitude puis latitude)" }] });
  if (c.refus !== "pas-de-coordonnees") return void res.json({ resultats: [], avertissement: { code: `coordonnees-${c.refus}`, message: c.message } });
  const espaceId = await espaceDe(req);
  const t = q.toLowerCase();
  const lignes = await requete(
    `SELECT o.code, o.nom, o.niveau, c.id AS couche_id, c.titre AS couche_titre, v.libelle, s.titre AS source_titre,
            ST_AsGeoJSON(ST_Envelope(o.geom), 6) AS emprise, ST_AsGeoJSON(ST_PointOnSurface(o.geom), 6) AS centre
       FROM geodata_objets o JOIN geodata_couches c ON c.id = o.couche_id JOIN geodata_versions v ON v.id = c.version_id JOIN geodata_sources s ON s.id = v.source_id
      WHERE ${VERSION_CONSULTABLE("v", "$1")} AND ${DERNIERE_VERSION("v", "$1")} AND (lower(o.nom) LIKE '%' || $2 || '%' OR lower(o.code) = $2)
      ORDER BY (s.producteur LIKE 'Haut-Commissariat au Plan%') DESC, (lower(o.nom) LIKE $2 || '%') DESC, length(o.nom), o.nom LIMIT 20`,
    [espaceId, t],
  );
  res.json({
    resultats: lignes.map((l) => ({
      type: "unite", code: l["code"], libelle: l["nom"] ?? l["code"], niveau: l["niveau"], coucheId: l["couche_id"], coucheTitre: l["couche_titre"],
      emprise: JSON.parse(l["emprise"] as string), centre: JSON.parse(l["centre"] as string), provenance: `${l["source_titre"]} — ${l["libelle"]}`,
    })),
  });
});

/**
 * Tuiles vectorielles (MVT) d'une couche consultable : autorisation vérifiée AVANT toute lecture ; la simplification est
 * propre à l'affichage (tolérance d'un demi-pixel au zoom demandé), la géométrie de référence n'est pas modifiée (INV-09).
 * Cache : `private` (jamais un cache partagé) ; versions privées `no-store`.
 */
consultationRouter.get("/tuiles/:coucheId/:z/:x/:y", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(String(req.params.y).replace(/\.pbf$|\.mvt$/, ""));
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 18 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return erreur(res, 400, "invalid_input", "Tuile hors limites.");
  const couche = await coucheConsultable(await espaceDe(req), req.params.coucheId);
  if (!couche) return introuvable(res);
  const droit = verifierUsage(lireDroits(couche["droits"]), "tuiles");
  if (!droit.ok) return erreur(res, 403, "usage_refuse", droit.motif, { usage: "tuiles", etat: droit.etat });
  const tolerance = 40_075_016.7 / (256 * 2 ** z) / 2;
  const [r] = await requete<{ mvt: Buffer | null }>(
    `WITH b AS (SELECT ST_TileEnvelope($2, $3, $4) AS e),
     m AS (
       SELECT ST_AsMVTGeom(ST_SimplifyPreserveTopology(ST_Transform(ST_ClipByBox2D(o.geom, ST_MakeEnvelope(-180, -85.05, 180, 85.05, 4326)), 3857), $5), b.e, 4096, 64, true) AS geom,
              o.code, coalesce(o.nom, o.code) AS nom
         FROM geodata_objets o, b
        WHERE o.couche_id = $1 AND o.geom && ST_Transform(b.e, 4326)
     )
     SELECT ST_AsMVT(m.*, 'objets', 4096, 'geom') AS mvt FROM m WHERE m.geom IS NOT NULL`,
    [req.params.coucheId, z, x, y, tolerance],
  );
  res.setHeader("Content-Type", "application/vnd.mapbox-vector-tile");
  res.setHeader("Cache-Control", couche["privee"] ? "private, no-store" : "private, max-age=300");
  res.send(r?.mvt ?? Buffer.alloc(0));
});

/**
 * Couches raster (D-GD-13) : grille figée lue une fois puis gardée en mémoire (au plus 12 grilles), tuiles PNG et valeur
 * en un point. Mêmes règles d'accès que les tuiles vectorielles (couche consultable, droit « tuiles »).
 */
const grilles = new Map<string, { grille: GrilleRaster; description: DescriptionRaster }>();
async function grilleDe(coucheId: string) {
  const deja = grilles.get(coucheId);
  if (deja) return deja;
  const [r] = await requete<{ largeur: number; hauteur: number; ouest: number; sud: number; est: number; nord: number; nodata: number | null; valeurs: Buffer; description: DescriptionRaster }>(
    `SELECT largeur, hauteur, ouest, sud, est, nord, nodata, valeurs, description FROM geodata_rasters WHERE couche_id = $1`, [coucheId]);
  if (!r) return null;
  const g = { grille: { largeur: r.largeur, hauteur: r.hauteur, emprise: [r.ouest, r.sud, r.est, r.nord] as const, nodata: r.nodata, valeurs: decompresser(r.valeurs, r.largeur * r.hauteur) }, description: r.description };
  if (grilles.size >= 12) grilles.delete(grilles.keys().next().value!);
  grilles.set(coucheId, g);
  return g;
}

consultationRouter.get("/raster/:coucheId/:z/:x/:y", async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(String(req.params.y).replace(/\.png$/, ""));
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 18 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return erreur(res, 400, "invalid_input", "Tuile hors limites.");
  const couche = await coucheConsultable(await espaceDe(req), req.params.coucheId);
  if (!couche) return introuvable(res);
  const droit = verifierUsage(lireDroits(couche["droits"]), "tuiles");
  if (!droit.ok) return erreur(res, 403, "usage_refuse", droit.motif, { usage: "tuiles", etat: droit.etat });
  const g = await grilleDe(req.params.coucheId);
  if (!g) return introuvable(res);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", couche["privee"] ? "private, no-store" : "private, max-age=3600");
  res.send(tuileRaster(g.grille, g.description, z, x, y) ?? pngTransparent());
});

/** Valeur d'une couche raster au point (lon, lat WGS 84) ; hors emprise ou nodata : `null` (« non évaluée »). */
consultationRouter.get("/raster/:coucheId/valeur", async (req, res) => {
  const lon = Number(req.query["lon"]);
  const lat = Number(req.query["lat"]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return erreur(res, 400, "invalid_input", "Point lon/lat attendu.", { champs: ["lon", "lat"] });
  const couche = await coucheConsultable(await espaceDe(req), req.params.coucheId);
  if (!couche) return introuvable(res);
  const g = await grilleDe(req.params.coucheId);
  if (!g) return introuvable(res);
  const v = valeurAuPoint(g.grille, lon, lat);
  const classe = v !== null && g.description.classes ? g.description.classes.find((c) => c.valeur === v) ?? null : null;
  res.json({ lon, lat, valeur: v, classe: classe?.libelle ?? null, unite: g.description.unite, grandeur: g.description.grandeur });
});

/** Table paginée des objets d'une couche (sans géométrie), filtre et tri sur liste autorisée. */
consultationRouter.get("/couches/:id/table", async (req, res) => {
  const espaceId = await espaceDe(req);
  const couche = await coucheConsultable(espaceId, req.params.id);
  if (!couche) return introuvable(res);
  const page = Math.max(1, Math.min(10_000, Number(req.query["page"]) || 1));
  const taille = Math.max(1, Math.min(200, Number(req.query["taille"]) || 50));
  const tri = req.query["tri"] === "code" ? "o.code" : "coalesce(o.nom, o.code)";
  const ordre = req.query["ordre"] === "desc" ? "DESC" : "ASC";
  const exposees = (couche["proprietes_exposees"] as string[]) ?? [];
  const prop = typeof req.query["propriete"] === "string" ? req.query["propriete"] : "";
  const val = typeof req.query["valeur"] === "string" ? req.query["valeur"].slice(0, 200) : "";
  const op = req.query["operateur"] === "egal" ? "egal" : "contient";
  if (prop && !["nom", "code", ...exposees].includes(prop)) return erreur(res, 400, "invalid_input", "Propriété de filtre non autorisée.", { champs: ["propriete"] });
  const expr = prop === "nom" ? "coalesce(o.nom, '')" : prop === "code" ? "o.code" : "coalesce(o.proprietes ->> $5, '')";
  const filtre = prop ? (op === "egal" ? `AND lower(${expr}) = lower($4)` : `AND lower(${expr}) LIKE '%' || lower($4) || '%'`) : "";
  const params: unknown[] = [req.params.id, taille, (page - 1) * taille];
  if (prop) params.push(val);
  if (prop && prop !== "nom" && prop !== "code") params.push(prop);
  const lignes = await requete(
    `SELECT o.code, o.nom, o.niveau, o.proprietes, o.geometrie_reparee, count(*) OVER () AS total FROM geodata_objets o
      WHERE o.couche_id = $1 ${filtre} ORDER BY ${tri} ${ordre}, o.code LIMIT $2 OFFSET $3`,
    params,
  );
  const codes = lignes.map((l) => l["code"] as string);
  const valeurs = codes.length ? await requete(
    `SELECT va.indicateur_id, va.code, va.valeur, va.motif_absence FROM geodata_valeurs va JOIN geodata_indicateurs i ON i.id = va.indicateur_id
      WHERE i.couche_id = $1 AND va.code = ANY($2)`, [req.params.id, codes]) : [];
  res.json({
    page, taille, total: Number(lignes[0]?.["total"] ?? 0),
    lignes: lignes.map((l) => ({
      code: l["code"], nom: l["nom"], niveau: l["niveau"], geometrieReparee: l["geometrie_reparee"],
      proprietes: Object.fromEntries(exposees.filter((p) => Object.hasOwn(l["proprietes"] as object, p)).map((p) => [p, (l["proprietes"] as Record<string, unknown>)[p]])),
      valeurs: Object.fromEntries(valeurs.filter((v) => v["code"] === l["code"]).map((v) => [v["indicateur_id"], { valeur: v["valeur"], motifAbsence: v["motif_absence"] }])),
    })),
  });
});

/** Codes des objets qui passent un filtre (pour filtrer la carte), bornés à 5 000. */
consultationRouter.get("/couches/:id/codes", async (req, res) => {
  const couche = await coucheConsultable(await espaceDe(req), req.params.id);
  if (!couche) return introuvable(res);
  const exposees = (couche["proprietes_exposees"] as string[]) ?? [];
  const prop = typeof req.query["propriete"] === "string" ? req.query["propriete"] : "";
  const val = typeof req.query["valeur"] === "string" ? req.query["valeur"].slice(0, 200) : "";
  if (!["nom", "code", ...exposees].includes(prop)) return erreur(res, 400, "invalid_input", "Propriété de filtre non autorisée.", { champs: ["propriete"] });
  const expr = prop === "nom" ? "coalesce(o.nom, '')" : prop === "code" ? "o.code" : "coalesce(o.proprietes ->> $3, '')";
  const cond = req.query["operateur"] === "egal" ? `lower(${expr}) = lower($2)` : `lower(${expr}) LIKE '%' || lower($2) || '%'`;
  const lignes = await requete<{ code: string }>(`SELECT o.code FROM geodata_objets o WHERE o.couche_id = $1 AND ${cond} LIMIT 5000`, prop === "nom" || prop === "code" ? [req.params.id, val] : [req.params.id, val, prop]);
  res.json({ codes: lignes.map((l) => l.code) });
});

/**
 * Couleur par entité (style `categories`) : rang de couleur de chaque unité, calculé sur la géométrie de référence (unités
 * qui se touchent ou se recouvrent = voisines). Le contenu d'une couche est figé : le résultat est conservé en mémoire par
 * couche (au plus 50 couches).
 */
const cacheCategories = new Map<string, { code: string; nom: string | null; rang: number }[]>();
/** Borne des paires de voisins lues : au-delà (objets superposés en masse), couleurs attribuées sans voisinage. */
const PAIRES_MAX = 50_000;
consultationRouter.get("/couches/:id/categories", async (req, res) => {
  const couche = await coucheConsultable(await espaceDe(req), req.params.id);
  if (!couche) return introuvable(res);
  let categories = cacheCategories.get(req.params.id);
  if (!categories) {
    const objets = await requete<{ code: string; nom: string | null }>(`SELECT o.code, o.nom FROM geodata_objets o WHERE o.couche_id = $1 ORDER BY o.code LIMIT $2`, [req.params.id, OBJETS_PAR_COUCHE]);
    const paires = await requete<{ a: string; b: string }>(
      `SELECT a.code AS a, b.code AS b FROM geodata_objets a JOIN geodata_objets b ON b.couche_id = a.couche_id AND a.code < b.code AND a.geom && b.geom AND ST_Intersects(a.geom, b.geom)
        WHERE a.couche_id = $1 LIMIT $2`, [req.params.id, PAIRES_MAX + 1]);
    // Mémoire bornée : un graphe trop dense n'est pas construit, les couleurs suivent alors l'ordre des noms.
    const rangs = attribuerCategories(objets, paires.length > PAIRES_MAX ? [] : paires.map((p) => [p.a, p.b] as const));
    categories = objets.map((o) => ({ code: o.code, nom: o.nom, rang: rangs.get(o.code) ?? 0 }));
    if (cacheCategories.size >= 50) cacheCategories.delete(cacheCategories.keys().next().value!);
    cacheCategories.set(req.params.id, categories);
  }
  res.json({ categories });
});

/** Fiche d'un objet : attributs exposés, valeurs d'indicateurs (absence avec motif), source et qualité. */
consultationRouter.get("/couches/:id/objets/:code", async (req, res) => {
  const couche = await coucheConsultable(await espaceDe(req), req.params.id);
  if (!couche) return introuvable(res);
  const [o] = await requete(
    `SELECT o.code, o.nom, o.niveau, o.proprietes, o.geometrie_reparee, ST_AsGeoJSON(ST_Envelope(o.geom), 6) AS emprise, ST_AsGeoJSON(ST_PointOnSurface(o.geom), 6) AS centre
       FROM geodata_objets o WHERE o.couche_id = $1 AND o.code = $2`, [req.params.id, req.params.code]);
  if (!o) return introuvable(res);
  const valeurs = await requete(
    `SELECT i.id, i.titre, i.unite, i.periode, i.nature, i.methode, i.denominateur, i.theme, i.famille, i.modalite, i.milieu, i.sexe, va.valeur, va.motif_absence
       FROM geodata_indicateurs i LEFT JOIN geodata_valeurs va ON va.indicateur_id = i.id AND va.code = $2 WHERE i.couche_id = $1 ORDER BY i.nature DESC, i.ordre, i.titre`,
    [req.params.id, req.params.code],
  );
  const exposees = (couche["proprietes_exposees"] as string[]) ?? [];
  const ind = await indicateursDe([req.params.id]);
  // Douars de la commune rurale (lot E) : annexe de la même version, tels que publiés (noms en arabe, D-GD-21).
  const douars = await requete(
    `SELECT code, fraction, nom, type, menages, population, masculin, feminin, moins_15, de_15_a_59, plus_60, secret
       FROM geodata_douars WHERE version_id = $1 AND commune = $2 ORDER BY code LIMIT 5000`,
    [couche["version_id"], req.params.code],
  );
  res.json({
    code: o["code"], nom: o["nom"], niveau: o["niveau"], geometrieReparee: o["geometrie_reparee"],
    emprise: JSON.parse(o["emprise"] as string), centre: JSON.parse(o["centre"] as string),
    proprietes: Object.fromEntries(exposees.filter((p) => Object.hasOwn(o["proprietes"] as object, p)).map((p) => [p, (o["proprietes"] as Record<string, unknown>)[p]])),
    indicateurs: valeurs.map((v) => ({
      id: v["id"], titre: v["titre"], unite: v["unite"], periode: v["periode"], nature: v["nature"], methode: v["methode"], denominateur: v["denominateur"], ...dimensions(v),
      // Ligne de valeur absente pour cette unité : « non appariée », jamais zéro.
      valeur: v["valeur"] ?? null, motifAbsence: v["valeur"] === null || v["valeur"] === undefined ? (v["motif_absence"] ?? "non-appariee") : null,
    })),
    couche: lireCouche(couche, ind.get(req.params.id) ?? []),
    douars: douars.map((d) => ({
      code: d["code"], fraction: d["fraction"], nom: d["nom"], type: d["type"], menages: d["menages"], population: d["population"], secret: d["secret"],
      pourcentages: { masculin: d["masculin"], feminin: d["feminin"], moins15: d["moins_15"], de15a59: d["de_15_a_59"], plus60: d["plus_60"] },
    })),
  });
});

/** Valeurs d'un indicateur d'une couche consultable : toutes, une couche comptant au plus OBJETS_PAR_COUCHE objets (refus à l'ingestion au-delà). */
consultationRouter.get("/indicateurs/:id/valeurs", async (req, res) => {
  const espaceId = await espaceDe(req);
  const [i] = await requete(`SELECT i.id, i.couche_id, i.titre, i.unite, i.periode, i.nature, i.methode, i.denominateur FROM geodata_indicateurs i
    JOIN geodata_couches c ON c.id = i.couche_id JOIN geodata_versions v ON v.id = c.version_id WHERE i.id = $2 AND ${VERSION_CONSULTABLE("v", "$1")}`, [espaceId, req.params.id]);
  if (!i) return introuvable(res);
  const vs = await requete(`SELECT o.code, va.valeur, va.motif_absence FROM geodata_objets o LEFT JOIN geodata_valeurs va ON va.indicateur_id = $2 AND va.code = o.code
    WHERE o.couche_id = $1 ORDER BY o.code LIMIT $3`, [i["couche_id"], req.params.id, OBJETS_PAR_COUCHE]);
  res.json({
    indicateur: { id: i["id"], coucheId: i["couche_id"], titre: i["titre"], unite: i["unite"], periode: i["periode"], nature: i["nature"], methode: i["methode"], denominateur: i["denominateur"] },
    valeurs: vs.map((v) => ({ code: v["code"], valeur: v["valeur"], motifAbsence: v["valeur"] === null ? (v["motif_absence"] ?? "non-appariee") : null })),
  });
});
