/**
 * Zones d'étude, annotations et analyses (plan GD-08). Une zone porte sa provenance, son système (EPSG:4326 seul), sa
 * révision ; elle reste indicative et ne devient jamais une parcelle cadastrale. L'analyse V1 « superficie et unités
 * intersectées » fige ses entrées (géométrie copiée, révision de la zone, version de la couche, méthode) ; elle est
 * immuable — recalculer crée un nouveau résultat — et elle est signalée « à recalculer » si la zone a changé ou si une
 * version plus récente de la source est publiée (GEO 10). Les surfaces d'intersection sont géométriques : aucune
 * population ni aucun pourcentage n'en est déduit.
 */
import { Router, type Request } from "express";
import { lireDroits, validerGeoJSON, verifierUsage } from "@parcours/geodata-model";
import { erreur, espacePersonnel, introuvable, journal, requete, transaction, VERSION_CONSULTABLE } from "../../lib/geodata/acces.js";
import { newId } from "../../lib/ids.js";
import { coucheConsultable } from "./consultation.js";

export const etudesRouter = Router();

const espaceDe = async (req: Request) => (await espacePersonnel(req.user!.id)).id;

export const METHODE_ANALYSE = "geodata-analyse-superficie";
export const VERSION_METHODE_ANALYSE = "1";
export const DESCRIPTION_METHODE = "Aire ellipsoïdale WGS 84 (PostGIS ST_Area sur geography) de la zone figée et de son intersection avec chaque unité de la couche (géométries de référence, non simplifiées). Résultat géométrique : ni population, ni estimation statistique.";

type NatureZone = "zone" | "annotation";

/** Valide une géométrie reçue : GeoJSON WGS 84 (mêmes contrôles qu'un import) ; une zone est un polygone. */
function lireGeometrie(nature: NatureZone, geometrie: unknown) {
  const v = validerGeoJSON({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geometrie }] }, { octets: 1_000_000, objets: 1, sommets: 10_000, proprietes: 0, longueurTexte: 0 });
  if (!v.ok) return { ok: false as const, diagnostics: v.rapport.diagnostics };
  const type = v.objets[0]!.geometrie.type;
  if (nature === "zone" && type !== "Polygon" && type !== "MultiPolygon") return { ok: false as const, diagnostics: [{ niveau: "erreur", code: "zone-polygone", message: "Une zone d'étude est un polygone." }] };
  return { ok: true as const, geometrie: v.objets[0]!.geometrie };
}

const COLONNES_ZONE = `id, nature, nom, texte, provenance, provenance_detail, crs, revision, etat, geometrie_reparee, cree_le, modifie_le, ST_AsGeoJSON(geom, 7) AS geometrie,
  CASE WHEN ST_Dimension(geom) = 2 THEN ST_Area(geom::geography) END AS aire_m2`;
const vueZone = (z: Record<string, unknown>) => ({
  id: z["id"], nature: z["nature"], nom: z["nom"], texte: z["texte"], provenance: z["provenance"], provenanceDetail: z["provenance_detail"], crs: z["crs"],
  revision: z["revision"], etat: z["etat"], geometrieReparee: z["geometrie_reparee"], creeLe: z["cree_le"], modifieLe: z["modifie_le"],
  geometrie: JSON.parse(z["geometrie"] as string), aireM2: z["aire_m2"] ?? null,
  avertissement: "Zone indicative dessinée ou importée dans GeoData : elle n'a aucune valeur cadastrale ni réglementaire.",
});

etudesRouter.get("/zones", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`SELECT ${COLONNES_ZONE} FROM geodata_zones WHERE espace_id = $1 AND etat = 'active' ORDER BY cree_le DESC LIMIT 500`, [espaceId]);
  res.json({ zones: lignes.map(vueZone) });
});

etudesRouter.post("/zones", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { nature, nom, texte, geometrie, provenance, provenanceDetail } = (req.body ?? {}) as Record<string, unknown>;
  if (nature !== "zone" && nature !== "annotation") return erreur(res, 400, "invalid_input", "Nature : zone ou annotation.", { champs: ["nature"] });
  if (typeof nom !== "string" || nom.trim().length < 1 || nom.trim().length > 120) return erreur(res, 400, "invalid_input", "Nom de 1 à 120 caractères.", { champs: ["nom"] });
  if (texte !== undefined && (typeof texte !== "string" || texte.length > 2000)) return erreur(res, 400, "invalid_input", "Texte de 2 000 caractères au plus.", { champs: ["texte"] });
  const prov = provenance ?? "dessin";
  if (prov !== "dessin" && prov !== "import" && prov !== "coordonnees") return erreur(res, 400, "invalid_input", "Provenance : dessin, import ou coordonnees.", { champs: ["provenance"] });
  const g = lireGeometrie(nature, geometrie);
  if (!g.ok) return erreur(res, 400, "geometrie_invalide", "Géométrie refusée.", { champs: ["geometrie"], diagnostics: g.diagnostics });
  const id = newId("gdzone");
  const [z] = await requete(
    `WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($8), 4326) AS g)
     INSERT INTO geodata_zones (id, espace_id, auteur_id, nature, nom, texte, provenance, provenance_detail, geom, geometrie_reparee)
     SELECT $1, $2, $3, $4, $5, $6, $7, $9, CASE WHEN ST_IsValid(g) THEN g ELSE ST_MakeValid(g) END, NOT ST_IsValid(g) FROM g RETURNING ${COLONNES_ZONE}`,
    [id, espaceId, req.user!.id, nature, nom.trim(), texte ?? "", prov, JSON.stringify(g.geometrie), typeof provenanceDetail === "string" ? provenanceDetail.slice(0, 200) : null],
  );
  await journal(req.user!.id, "zone.creee", id, "succes", { nature });
  res.status(201).json(vueZone(z!));
});

etudesRouter.put("/zones/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { revisionAttendue, nom, texte, geometrie } = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(revisionAttendue)) return erreur(res, 400, "invalid_input", "Révision attendue obligatoire.", { champs: ["revisionAttendue"] });
  const [actuelle] = await requete(`SELECT nature, revision FROM geodata_zones WHERE id = $1 AND espace_id = $2 AND etat = 'active'`, [req.params.id, espaceId]);
  if (!actuelle) return introuvable(res);
  if (nom !== undefined && (typeof nom !== "string" || nom.trim().length < 1 || nom.trim().length > 120)) return erreur(res, 400, "invalid_input", "Nom de 1 à 120 caractères.", { champs: ["nom"] });
  if (texte !== undefined && (typeof texte !== "string" || texte.length > 2000)) return erreur(res, 400, "invalid_input", "Texte de 2 000 caractères au plus.", { champs: ["texte"] });
  let geo: string | null = null;
  if (geometrie !== undefined) {
    const g = lireGeometrie(actuelle["nature"] as NatureZone, geometrie);
    if (!g.ok) return erreur(res, 400, "geometrie_invalide", "Géométrie refusée.", { champs: ["geometrie"], diagnostics: g.diagnostics });
    geo = JSON.stringify(g.geometrie);
  }
  const lignes = await requete(
    `WITH g AS (SELECT CASE WHEN $6::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326) END AS g)
     UPDATE geodata_zones z SET nom = coalesce($4, z.nom), texte = coalesce($5, z.texte),
       geom = CASE WHEN g.g IS NULL THEN z.geom WHEN ST_IsValid(g.g) THEN g.g ELSE ST_MakeValid(g.g) END,
       geometrie_reparee = CASE WHEN g.g IS NULL THEN z.geometrie_reparee ELSE NOT ST_IsValid(g.g) END,
       revision = z.revision + 1, modifie_le = now()
     FROM g WHERE z.id = $1 AND z.espace_id = $2 AND z.revision = $3 AND z.etat = 'active' RETURNING z.id`,
    [req.params.id, espaceId, revisionAttendue, typeof nom === "string" ? nom.trim() : null, texte ?? null, geo],
  );
  if (!lignes.length) return erreur(res, 409, "revision_conflict", "La zone a été modifiée ailleurs : rechargez-la.", { revisionCourante: actuelle["revision"] });
  await journal(req.user!.id, "zone.revisee", req.params.id, "succes");
  const [z] = await requete(`SELECT ${COLONNES_ZONE} FROM geodata_zones WHERE id = $1`, [req.params.id]);
  res.json(vueZone(z!));
});

/** Archivage : la zone reste lisible par les analyses qui l'ont utilisée (leur géométrie d'entrée est d'ailleurs copiée). */
etudesRouter.post("/zones/:id/archiver", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`UPDATE geodata_zones SET etat = 'archivee', revision = revision + 1, modifie_le = now() WHERE id = $1 AND espace_id = $2 AND etat = 'active' RETURNING id`, [req.params.id, espaceId]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "zone.archivee", req.params.id, "succes");
  res.json({ id: req.params.id, etat: "archivee" });
});

async function vueAnalyse(espaceId: string, a: Record<string, unknown>) {
  const [etat] = await requete(
    `SELECT z.revision AS zone_revision_courante, z.etat AS zone_etat,
            (SELECT v2.id FROM geodata_versions v2 JOIN geodata_versions v ON v.id = $3 WHERE v2.source_id = v.source_id AND v2.id <> v.id
               AND ${VERSION_CONSULTABLE("v2", "$1")} AND v2.publiee_le > coalesce(v.publiee_le, v.preparee_le) ORDER BY v2.publiee_le DESC LIMIT 1) AS version_plus_recente,
            (SELECT v.etat FROM geodata_versions v WHERE v.id = $3) AS version_etat
       FROM geodata_zones z WHERE z.id = $2 AND z.espace_id = $1`,
    [espaceId, a["zone_id"], a["version_id"]],
  );
  const motifs: string[] = [];
  if (etat && etat["zone_revision_courante"] !== a["zone_revision"]) motifs.push("La zone a été modifiée depuis le calcul.");
  if (etat?.["version_plus_recente"]) motifs.push("Une version plus récente de la source est publiée.");
  if (etat?.["version_etat"] === "retiree") motifs.push("La version utilisée a été retirée.");
  return {
    id: a["id"], zoneId: a["zone_id"], zoneRevision: a["zone_revision"], coucheId: a["couche_id"], versionId: a["version_id"],
    methode: a["methode"], versionMethode: a["version_methode"], parametres: a["parametres"], resultat: a["resultat"], creeLe: a["cree_le"],
    geometrieEntree: a["geometrie_entree"] ? JSON.parse(a["geometrie_entree"] as string) : undefined,
    aRecalculer: motifs.length > 0, motifsRecalcul: motifs, versionPlusRecente: etat?.["version_plus_recente"] ?? null,
  };
}

etudesRouter.get("/analyses", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`SELECT id, zone_id, zone_revision, couche_id, version_id, methode, version_methode, parametres, resultat, cree_le FROM geodata_analyses
    WHERE espace_id = $1 ORDER BY cree_le DESC LIMIT 200`, [espaceId]);
  res.json({ analyses: await Promise.all(lignes.map((a) => vueAnalyse(espaceId, a))) });
});

etudesRouter.get("/analyses/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const [a] = await requete(`SELECT id, zone_id, zone_revision, couche_id, version_id, methode, version_methode, parametres, resultat, cree_le, ST_AsGeoJSON(geom_entree, 7) AS geometrie_entree
    FROM geodata_analyses WHERE id = $1 AND espace_id = $2`, [req.params.id, espaceId]);
  if (!a) return introuvable(res);
  res.json(await vueAnalyse(espaceId, a));
});

/** Lance l'analyse « superficie et unités intersectées » d'une zone sur une couche de polygones consultable. */
etudesRouter.post("/analyses", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { zoneId, coucheId } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof zoneId !== "string" || typeof coucheId !== "string") return erreur(res, 400, "invalid_input", "Zone et couche obligatoires.", { champs: ["zoneId", "coucheId"] });
  const [zone] = await requete(`SELECT id, revision, nature FROM geodata_zones WHERE id = $1 AND espace_id = $2 AND etat = 'active'`, [zoneId, espaceId]);
  if (!zone || zone["nature"] !== "zone") return introuvable(res);
  const couche = await coucheConsultable(espaceId, coucheId);
  if (!couche) return introuvable(res);
  if (couche["type_geometrie"] !== "polygone") return erreur(res, 400, "couche_non_polygonale", "L'analyse porte sur une couche de polygones.");
  const droit = verifierUsage(lireDroits(couche["droits"]), "calcul");
  if (!droit.ok) {
    await journal(req.user!.id, "analyse.refusee", coucheId, "refus", { usage: "calcul", etat: droit.etat });
    return erreur(res, 403, "usage_refuse", droit.motif, { usage: "calcul", etat: droit.etat });
  }
  const id = newId("gdana");
  const a = await transaction(async (client) => {
    const [z] = (await client.query(`SELECT geom, revision, ST_Area(geom::geography) AS aire FROM geodata_zones WHERE id = $1 AND espace_id = $2 FOR SHARE`, [zoneId, espaceId])).rows;
    const unites = (await client.query(
      `SELECT o.code, o.nom, ST_Area(ST_Intersection(o.geom, z.geom)::geography) AS aire_intersection, ST_Area(o.geom::geography) AS aire_unite
         FROM geodata_objets o, geodata_zones z WHERE z.id = $2 AND o.couche_id = $1 AND ST_Intersects(o.geom, z.geom)
        ORDER BY aire_intersection DESC, o.code LIMIT 5000`, [coucheId, zoneId])).rows;
    const aireZone = Number(z.aire);
    const couverte = unites.reduce((s, u) => s + Number(u.aire_intersection), 0);
    const resultat = {
      aireZoneM2: aireZone,
      unitesIntersectees: unites.length,
      // Part de la zone couverte par la couche : si la zone sort de la couverture, la part manquante est déclarée.
      aireHorsCouvertureM2: Math.max(0, aireZone - couverte),
      unites: unites.map((u) => ({
        code: u.code, nom: u.nom, aireIntersectionM2: Number(u.aire_intersection), aireUniteM2: Number(u.aire_unite),
        partDeLaZone: aireZone > 0 ? Number(u.aire_intersection) / aireZone : null, partDeLUnite: Number(u.aire_unite) > 0 ? Number(u.aire_intersection) / Number(u.aire_unite) : null,
      })),
      methode: DESCRIPTION_METHODE,
      couche: { id: coucheId, titre: couche["couche_titre"] },
      version: { id: couche["version_id"], libelle: couche["libelle"], licence: couche["licence"], attribution: couche["attribution"], empreinte: couche["empreinte"] },
      limites: "Résultat géométrique indicatif : il ne vaut ni superficie cadastrale, ni population, ni conclusion réglementaire.",
    };
    await client.query(
      `INSERT INTO geodata_analyses (id, espace_id, auteur_id, zone_id, zone_revision, geom_entree, couche_id, version_id, methode, version_methode, parametres, resultat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, espaceId, req.user!.id, zoneId, z.revision, z.geom, coucheId, couche["version_id"], METHODE_ANALYSE, VERSION_METHODE_ANALYSE, JSON.stringify({ coucheId }), JSON.stringify(resultat)],
    );
    const [ligne] = (await client.query(`SELECT id, zone_id, zone_revision, couche_id, version_id, methode, version_methode, parametres, resultat, cree_le FROM geodata_analyses WHERE id = $1`, [id])).rows;
    return ligne;
  });
  await journal(req.user!.id, "analyse.creee", id, "succes", { methode: METHODE_ANALYSE });
  res.status(201).json(await vueAnalyse(espaceId, a));
});
