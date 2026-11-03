/**
 * Traitement et porte qualité d'une version de terrain (plan v1.0, lot TER-03, Issue #381) — orchestration en base :
 *
 *  - `traiterVersion` : une version « prête au traitement » → dérivés (COG d'altitude vérifié, pente, ombrage),
 *    couverture exacte transformée en WGS 84 par PostGIS (transformation consignée), courbes de niveau à l'équidistance
 *    permise (TER-D17), rapport qualité initial « non évaluée », puis « en attente de revue ». Traitement idempotent
 *    (empreinte + paramètres + version de GDAL), sérialisé par version, reprenable ;
 *  - `controlerQualite` : points de contrôle indépendants → résidus (modèle − levé, valeur bilinéaire), biais, RMSEz, P95
 *    exactement comme au plan, état « conforme » / « non conforme » si des cibles sont données ;
 *  - `deciderRevue` : un responsable de publication accepte, remet en quarantaine ou retire, avec motif ; l'état de
 *    qualité du dernier rapport est consigné avec la décision. La publication vient au lot TER-04.
 * Ce module n'ouvre aucun pool : l'appelant fournit la connexion.
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { fromFile } from "geotiff";
import {
  equidistanceMinimale, etatQualite, rapportQualite, texteIdempotence, valeurBilineaire,
  type CiblesQualite, type DeclarationTerrain, type EnTeteRaster, type EtatQualite, type EtatTerrain, type RapportQualite,
} from "@parcours/geodata-model";
import { newId } from "../../ids.js";
import { calculerCourbes, calculerDerives, versionGdal } from "./derives.js";
import { empreinteFichier, type StockageTerrain } from "./stockage.js";

export class TraitementRefuse extends Error {}

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const verrouDe = (texte: string) => BigInt.asIntN(64, BigInt(`0x${sha256(texte).slice(0, 16)}`)).toString();

async function transaction<T>(c: PoolClient, f: () => Promise<T>): Promise<T> {
  await c.query("BEGIN");
  try {
    const r = await f();
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

async function evenement(c: PoolClient, versionId: string, de: EtatTerrain, vers: EtatTerrain, acteur: string | null, motif: string | null, decision: unknown = null) {
  const r = await c.query("UPDATE geodata_terrain_versions SET etat = $2, etat_le = now() WHERE id = $1 AND etat = $3", [versionId, vers, de]);
  if (r.rowCount !== 1) throw new TraitementRefuse(`Version ${versionId} : état « ${de} » attendu.`);
  await c.query("INSERT INTO geodata_terrain_evenements (terrain_version_id, de, vers, motif, decision, acteur_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [versionId, de, vers, motif, decision === null ? null : JSON.stringify(decision), acteur]);
}

interface VersionLue {
  readonly id: string;
  readonly etat: EtatTerrain;
  readonly declaration: DeclarationTerrain;
  readonly entete: EnTeteRaster | null;
  readonly empreinte: string;
  readonly nodata: number | null;
  readonly cle_stockage: string | null;
}

async function lireVersion(c: PoolClient, id: string): Promise<VersionLue> {
  const [v] = (await c.query<VersionLue>(
    `SELECT v.id, v.etat, v.declaration, v.entete, v.empreinte, v.nodata, f.cle_stockage FROM geodata_terrain_versions v
       LEFT JOIN geodata_terrain_fichiers f ON f.terrain_version_id = v.id AND f.role = 'original' WHERE v.id = $1`, [id])).rows;
  if (!v) throw new TraitementRefuse("Version de terrain introuvable.");
  return v;
}

/** Dernière RMSEz mesurée d'une version (rapport avec au moins un point), ou null. */
async function rmsezMesuree(c: PoolClient, id: string): Promise<number | null> {
  const [r] = (await c.query<{ rapport: RapportQualite }>("SELECT rapport FROM geodata_terrain_rapports_qualite WHERE terrain_version_id = $1 ORDER BY cree_le DESC, id DESC LIMIT 1", [id])).rows;
  return r?.rapport.global?.rmsez ?? null;
}

/** Équidistance exigée maintenant (TER-D17) : dernière RMSEz mesurée, sinon précision déclarée, sinon mondiale. */
async function equidistanceExigee(c: PoolClient, v: VersionLue): Promise<number> {
  return equidistanceMinimale({ niveau: v.declaration.niveau, rmsezMesuree: await rmsezMesuree(c, v.id), verticaleDeclaree: v.declaration.precisionDeclaree?.verticaleM ?? null });
}

/** Plus grande équidistance de courbes déjà calculée pour la version (traitements terminés), ou null. */
async function equidistanceCalculee(c: PoolClient, id: string): Promise<number | null> {
  const [r] = (await c.query<{ e: number | null }>(
    `SELECT max((sorties->>'equidistance')::float8) AS e FROM geodata_terrain_traitements
      WHERE etat = 'termine' AND type IN ('derives', 'courbes') AND sorties->>'versionId' = $1`, [id])).rows;
  return r?.e ?? null;
}

async function insererCourbes(c: PoolClient, versionId: string, equidistance: number, srid: number, courbes: Awaited<ReturnType<typeof calculerCourbes>>): Promise<number> {
  let n = 0;
  for (const k of courbes) {
    await c.query(
      `INSERT INTO geodata_terrain_courbes (terrain_version_id, equidistance, altitude, maitresse, geom)
       VALUES ($1, $2, $3, $4, ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5), $6), 4326)))`,
      [versionId, equidistance, k.altitude, k.maitresse, JSON.stringify({ type: "MultiLineString", coordinates: k.lignes }), srid]);
    n += k.lignes.length;
  }
  return n;
}

/**
 * Courbes à l'équidistance donnée, calculées sur la grille d'origine et ajoutées si elles n'existent pas encore (traitement
 * « courbes » idempotent). Utilisé quand la précision mesurée exige une équidistance plus grande que celle déjà calculée.
 */
async function assurerCourbes(c: PoolClient, stockage: StockageTerrain, v: VersionLue, equidistance: number, demandePar: string | null): Promise<number> {
  if (!v.cle_stockage || !v.entete?.crsHorizontal) throw new TraitementRefuse("Original ou géoréférence absents.");
  const srid = Number(v.entete.crsHorizontal.replace(/^EPSG:/, ""));
  const cle = sha256(texteIdempotence("courbes", [v.empreinte], { versionId: v.id, equidistance }));
  const [fait] = (await c.query<{ etat: string; sorties: { courbes?: number } }>("SELECT etat, sorties FROM geodata_terrain_traitements WHERE cle_idempotence = $1", [cle])).rows;
  if (fait?.etat === "termine") return fait.sorties.courbes ?? 0;
  const [{ id: traitementId }] = (await c.query<{ id: string }>(
    `INSERT INTO geodata_terrain_traitements (id, cle_idempotence, type, entrees, parametres, logiciels, etat, demande_par)
     VALUES ($1, $2, 'courbes', $3, $4, '{}'::jsonb, 'en_cours', $5)
     ON CONFLICT (cle_idempotence) DO UPDATE SET etat = 'en_cours', tentatives = geodata_terrain_traitements.tentatives + 1, progression = 0, motif_echec = NULL, maj_le = now()
     RETURNING id`,
    [newId("gdtt"), cle, JSON.stringify([{ versionId: v.id, empreinte: v.empreinte }]), JSON.stringify({ equidistance }), demandePar])).rows as [{ id: string }];
  try {
    const courbes = await calculerCourbes(stockage.chemin(v.cle_stockage), { geographique: v.entete.geographique, nodata: v.nodata, equidistance });
    return await transaction(c, async () => {
      const n = await insererCourbes(c, v.id, equidistance, srid, courbes);
      await c.query("UPDATE geodata_terrain_traitements SET etat = 'termine', progression = 100, sorties = $2, maj_le = now() WHERE id = $1",
        [traitementId, JSON.stringify({ versionId: v.id, equidistance, courbes: n })]);
      return n;
    });
  } catch (e) {
    await c.query("UPDATE geodata_terrain_traitements SET etat = 'echec', motif_echec = $2, maj_le = now() WHERE id = $1", [traitementId, ((e as Error).message || String(e)).slice(0, 2000)]).catch(() => undefined);
    throw e;
  }
}

export interface ResultatTraitement { readonly versionId: string; readonly deja: boolean; readonly equidistance: number; readonly courbes: number; readonly surfaceM2: number }

/** Versions prêtes au traitement, des plus anciennes aux plus récentes. */
export async function versionsATraiter(c: PoolClient): Promise<string[]> {
  return (await c.query<{ id: string }>("SELECT id FROM geodata_terrain_versions WHERE etat = 'traitement' ORDER BY etat_le, id")).rows.map((r) => r.id);
}

export async function traiterVersion(c: PoolClient, stockage: StockageTerrain, versionId: string, demandePar: string | null = null): Promise<ResultatTraitement> {
  const verrou = verrouDe(`derives:${versionId}`);
  await c.query("SELECT pg_advisory_lock($1::bigint)", [verrou]);
  try {
    const v = await lireVersion(c, versionId);
    const gdal = await versionGdal();
    if (!gdal) throw new TraitementRefuse("GDAL absent : lancer le traitement dans le travailleur terrain (TER-D6).");
    const equidistance = await equidistanceExigee(c, v);
    const parametres = { methodePente: "horn", ombrage: [315, 45], equidistance, cog: "DEFLATE PREDICTOR=YES BLOCKSIZE=512 AVERAGE" };
    const cle = sha256(texteIdempotence("derives", [v.empreinte], { versionId, parametres, gdal }));
    const [fait] = (await c.query<{ id: string; etat: string; sorties: { courbes?: number; surfaceM2?: number } }>("SELECT id, etat, sorties FROM geodata_terrain_traitements WHERE cle_idempotence = $1", [cle])).rows;
    if (fait?.etat === "termine") {
      // Dérivés déjà calculés avec les mêmes paramètres : une version revenue « prête au traitement » (après une remise en
      // quarantaine levée) repasse en attente de revue sans nouveau calcul.
      if (v.etat === "traitement") await transaction(c, () => evenement(c, versionId, "traitement", "revue", demandePar, "Dérivés déjà calculés avec les mêmes paramètres : repris sans nouveau calcul."));
      return { versionId, deja: true, equidistance, courbes: fait.sorties.courbes ?? 0, surfaceM2: fait.sorties.surfaceM2 ?? 0 };
    }
    if (v.etat !== "traitement") throw new TraitementRefuse(`Version en état « ${v.etat} » : seule une version prête au traitement est traitée.`);
    // Dérivés déjà présents (seule l'équidistance exigée a changé) : courbes seules, puis en attente de revue.
    const [{ n: derivesExistants }] = (await c.query<{ n: number }>("SELECT count(*)::int AS n FROM geodata_terrain_fichiers WHERE terrain_version_id = $1 AND role = 'derive'", [versionId])).rows as [{ n: number }];
    if (derivesExistants > 0) {
      const n = await assurerCourbes(c, stockage, v, equidistance, demandePar);
      await transaction(c, () => evenement(c, versionId, "traitement", "revue", demandePar, `Dérivés existants repris ; courbes à ${equidistance} m.`));
      const [couv] = (await c.query<{ s: number }>("SELECT surface_m2 AS s FROM geodata_terrain_couvertures WHERE terrain_version_id = $1", [versionId])).rows;
      return { versionId, deja: true, equidistance, courbes: n, surfaceM2: couv?.s ?? 0 };
    }
    if (!v.cle_stockage || !v.entete?.crsHorizontal) throw new TraitementRefuse("Original ou géoréférence absents : rien n'est traité.");
    // L'original doit être présent et intact (empreinte relue) avant tout calcul.
    const relu = await empreinteFichier(stockage.chemin(v.cle_stockage)).catch(() => null);
    if (!relu) throw new TraitementRefuse(`Original absent du volume : ${v.cle_stockage}. Rien n'est traité.`);
    if (relu.empreinte !== v.empreinte) throw new TraitementRefuse(`Original altéré : empreinte relue ${relu.empreinte} différente de ${v.empreinte}. Rien n'est traité.`);
    const srid = Number(v.entete.crsHorizontal.replace(/^EPSG:/, ""));
    const [ref] = (await c.query("SELECT 1 FROM spatial_ref_sys WHERE srid = $1", [srid])).rows;
    if (!ref) throw new TraitementRefuse(`${v.entete.crsHorizontal} inconnu de PostGIS : aucune transformation n'est devinée.`);

    const [{ id: traitementId }] = (await c.query<{ id: string }>(
      `INSERT INTO geodata_terrain_traitements (id, cle_idempotence, type, entrees, parametres, logiciels, etat, demande_par)
       VALUES ($1, $2, 'derives', $3, $4, $5, 'en_cours', $6)
       ON CONFLICT (cle_idempotence) DO UPDATE SET etat = 'en_cours', tentatives = geodata_terrain_traitements.tentatives + 1,
         progression = 0, motif_echec = NULL, maj_le = now()
       RETURNING id`,
      [newId("gdtt"), cle, JSON.stringify([{ versionId, empreinte: v.empreinte }]), JSON.stringify(parametres), JSON.stringify({ gdal }), demandePar],
    )).rows as [{ id: string }];

    try {
      const dossierCle = `derives/${versionId}`;
      const r = await calculerDerives(stockage.chemin(v.cle_stockage), stockage.chemin(dossierCle), { geographique: v.entete.geographique, nodata: v.nodata, equidistance });
      const [proj] = (await c.query<{ v: string }>("SELECT PostGIS_PROJ_Version() AS v")).rows;
      const transformation = srid === 4326 ? "aucune (données en WGS 84)" : `PostGIS ST_Transform EPSG:${srid} → EPSG:4326, PROJ ${(proj?.v ?? "?").split(" ")[0]} (précision de l'opération retenue par PROJ ; affichage et emprise seulement)`;
      const sortie = await transaction(c, async () => {
        for (const f of r.fichiers) {
          await c.query("INSERT INTO geodata_terrain_fichiers (id, terrain_version_id, role, nature, cle_stockage, empreinte, taille, format) VALUES ($1, $2, 'derive', $3, $4, $5, $6, 'COG')",
            [newId("gdtf"), versionId, f.nature, `${dossierCle}/${f.nature}.tif`, f.empreinte, f.taille]);
        }
        const rects = r.rectangles.length ? r.rectangles : [];
        const [couv] = (await c.query<{ surface: number }>(
          `WITH r AS (SELECT ST_MakeEnvelope((e->>0)::float8, (e->>1)::float8, (e->>2)::float8, (e->>3)::float8, $2) AS g FROM jsonb_array_elements($3::jsonb) e),
                u AS (SELECT ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_Collect(g)), 3)) AS g FROM r)
           INSERT INTO geodata_terrain_couvertures (terrain_version_id, geom, srid_natif, cellules_valides, cellules_total, surface_m2, transformation)
           SELECT $1, ST_Multi(ST_Transform(u.g, 4326)), $2, $4, $5,
                  CASE WHEN $2 = 4326 THEN ST_Area(u.g::geography) ELSE ST_Area(u.g) END, $6 FROM u WHERE u.g IS NOT NULL
           RETURNING surface_m2 AS surface`,
          [versionId, srid, JSON.stringify(rects), r.cellulesValides, r.cellulesTotal, transformation])).rows;
        if (!couv) throw new TraitementRefuse("Aucune cellule valide : la version n'a pas de couverture.");
        const n = await insererCourbes(c, versionId, equidistance, srid, r.courbes);
        const initial = rapportQualite([]);
        await c.query(
          `INSERT INTO geodata_terrain_rapports_qualite (id, terrain_version_id, methode, echantillonnage, points, rapport, cibles, etat_qualite, auteur_id)
           VALUES ($1, $2, $3, 'aucun', '[]'::jsonb, $4, NULL, 'non-evaluee', NULL)`,
          [newId("gdtq"), versionId, "Aucun point de contrôle indépendant : qualité non évaluée.", JSON.stringify(initial)]);
        await evenement(c, versionId, "traitement", "revue", demandePar, "Dérivés calculés ; qualité non évaluée tant qu'aucun point de contrôle indépendant n'est fourni.");
        const sorties = { versionId, equidistance, courbes: n, surfaceM2: couv.surface, fichiers: r.fichiers.map((f) => f.nature) };
        await c.query("UPDATE geodata_terrain_traitements SET etat = 'termine', progression = 100, sorties = $2, logiciels = $3, maj_le = now() WHERE id = $1",
          [traitementId, JSON.stringify(sorties), JSON.stringify(r.logiciels)]);
        await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.derives', $2, 'succes', $3)",
          [demandePar, versionId, JSON.stringify({ equidistance, courbes: n })]);
        return sorties;
      });
      return { versionId, deja: false, equidistance, courbes: sortie.courbes, surfaceM2: sortie.surfaceM2 };
    } catch (e) {
      await c.query("UPDATE geodata_terrain_traitements SET etat = 'echec', motif_echec = $2, maj_le = now() WHERE id = $1", [traitementId, ((e as Error).message || String(e)).slice(0, 2000)]).catch(() => undefined);
      throw e;
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock($1::bigint)", [verrou]).catch(() => undefined);
  }
}

export interface PointLeve { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly classe: string; readonly incertitude: number | null }

/**
 * Rapport qualité contre des points de contrôle **indépendants** (coordonnées dans le repère natif de la version).
 * Altitude du modèle par interpolation bilinéaire sur la grille d'origine ; un point sans valeur est exclu et listé.
 */
export async function controlerQualite(
  c: PoolClient, stockage: StockageTerrain, versionId: string,
  o: { readonly points: readonly PointLeve[]; readonly methode: string; readonly cibles: CiblesQualite | null; readonly par: string },
): Promise<{ rapport: RapportQualite; etat: EtatQualite; equidistance: number }> {
  const v = await lireVersion(c, versionId);
  if (!["revue", "accepte", "publie"].includes(v.etat)) throw new TraitementRefuse(`Version en état « ${v.etat} » : le contrôle suit le traitement.`);
  if (!v.cle_stockage) throw new TraitementRefuse("Original absent.");
  if (!o.methode || o.methode.trim().length < 10) throw new TraitementRefuse("Méthode de contrôle requise (comment les points ont été levés, et par qui).");
  if (!o.points.length) throw new TraitementRefuse("Aucun point de contrôle.");
  const tiff = await fromFile(stockage.chemin(v.cle_stockage));
  let residus;
  try {
    const image = await tiff.getImage();
    const [rx, ry] = image.getResolution() as [number, number];
    const pointe = (image.getGeoKeys() ?? {})["GTRasterTypeGeoKey"] === 2;
    const [ox0, oy0] = image.getOrigin() as [number, number];
    const ox = ox0 - (pointe ? rx / 2 : 0);
    const oy = oy0 - (pointe ? ry / 2 : 0);
    const L = image.getWidth(), H = image.getHeight();
    residus = [];
    for (const p of o.points) {
      const col = (p.x - ox) / rx;
      const lig = (p.y - oy) / ry;
      const c0 = Math.floor(col - 0.5), l0 = Math.floor(lig - 0.5);
      let valeur: number | null = null;
      if (c0 >= 0 && l0 >= 0 && c0 + 1 < L && l0 + 1 < H) {
        const [b] = (await image.readRasters({ window: [c0, l0, c0 + 2, l0 + 2], samples: [0] })) as unknown as [ArrayLike<number>];
        valeur = valeurBilineaire({ largeur: 2, hauteur: 2, valeurs: b, nodata: v.nodata, pasX: 1, pasY: 1 }, col - c0, lig - l0);
      }
      residus.push({ id: p.id, classe: p.classe, residu: valeur === null ? null : valeur - p.z, incertitude: p.incertitude });
    }
  } finally {
    await tiff.close?.();
  }
  const rapport = rapportQualite(residus);
  const etat = etatQualite(rapport, o.cibles);
  await c.query(
    `INSERT INTO geodata_terrain_rapports_qualite (id, terrain_version_id, methode, echantillonnage, points, rapport, cibles, etat_qualite, auteur_id)
     VALUES ($1, $2, $3, 'bilineaire', $4, $5, $6, $7, $8)`,
    [newId("gdtq"), versionId, o.methode, JSON.stringify(o.points), JSON.stringify(rapport), o.cibles ? JSON.stringify(o.cibles) : null, etat, o.par]);
  await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.qualite', $2, 'succes', $3)",
    [o.par, versionId, JSON.stringify({ n: rapport.global?.n ?? 0, etat })]);
  // TER-D17 : une erreur mesurée plus grande que prévu exige des courbes plus espacées ; elles sont calculées maintenant
  // (les plus fines restent en base, jamais servies sous le seuil).
  const exigee = await equidistanceExigee(c, v);
  const calculee = await equidistanceCalculee(c, versionId);
  if (calculee === null || calculee < exigee) await assurerCourbes(c, stockage, v, exigee, o.par);
  return { rapport, etat, equidistance: exigee };
}

/** Décision de revue (TER-D13) : accepter, remettre en quarantaine ou retirer ; motif écrit, état de qualité consigné. */
export async function deciderRevue(c: PoolClient, versionId: string, decision: "accepte" | "quarantaine" | "retire", motif: string, par: string): Promise<EtatQualite> {
  if (!motif || motif.trim().length < 10) throw new TraitementRefuse("Motif écrit requis (10 caractères au moins).");
  return transaction(c, async () => {
    const [v] = (await c.query<{ etat: EtatTerrain }>("SELECT etat FROM geodata_terrain_versions WHERE id = $1 FOR UPDATE", [versionId])).rows;
    if (!v) throw new TraitementRefuse("Version de terrain introuvable.");
    if (v.etat !== "revue") throw new TraitementRefuse(`Version en état « ${v.etat} » : seule une version en attente de revue se décide.`);
    const [q] = (await c.query<{ etat_qualite: EtatQualite; id: string }>("SELECT id, etat_qualite FROM geodata_terrain_rapports_qualite WHERE terrain_version_id = $1 ORDER BY cree_le DESC, id DESC LIMIT 1", [versionId])).rows;
    if (!q) throw new TraitementRefuse("Aucun rapport qualité : la version n'a pas été traitée.");
    if (decision === "accepte") {
      const exigee = await equidistanceExigee(c, await lireVersion(c, versionId));
      const calculee = await equidistanceCalculee(c, versionId);
      if (calculee === null || calculee < exigee) throw new TraitementRefuse(`Courbes calculées à ${calculee ?? "—"} m, plus fines que les ${exigee} m permis par la précision (TER-D17) : contrôler la qualité ou relancer le traitement avant d'accepter.`);
    }
    await evenement(c, versionId, "revue", decision, par, motif, { decision, motif, etatQualite: q.etat_qualite, rapport: q.id });
    await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.revue', $2, 'succes', $3)",
      [par, versionId, JSON.stringify({ decision, etatQualite: q.etat_qualite })]);
    return q.etat_qualite;
  });
}
