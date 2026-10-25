/**
 * Écriture d'une version de données (chaîne réception → contrôle → préparation, concept § 7 et plan GD-03) : partagée par
 * l'import de référence (`npm run geodata:import-reference`, version commune en préparation, publiée ensuite par un
 * responsable de publication) et par l'import personnel confirmé (version privée de l'espace, publiée pour lui seul).
 *
 * Les géométries sont écrites telles quelles en WGS 84 ; une géométrie invalide est réparée par `ST_MakeValid` et la
 * réparation est **comptée et consignée** dans les transformations de la version (jamais silencieuse).
 */
import type { PoolClient } from "pg";
import type { DroitsVersion, MotifAbsence, ObjetImporte, StyleCouche } from "@parcours/geodata-model";
import { estMotifAbsence } from "@parcours/geodata-model";
import { newId } from "../ids.js";

export interface IndicateurDeclare {
  /** Propriété de l'objet qui porte la valeur. */
  readonly propriete: string;
  readonly titre: string;
  readonly unite: string;
  readonly periode: string | null;
  readonly denominateur: string | null;
  readonly description: string;
  /** Motif inscrit quand la propriété est vide ou absente (jamais zéro). */
  readonly motifSiAbsente: MotifAbsence;
}

export interface VersionAEcrire {
  readonly source: { readonly cle: string; readonly titre: string; readonly producteur: string; readonly theme: string; readonly couverture: string; readonly description: string };
  readonly espaceId: string | null;
  readonly version: {
    readonly libelle: string;
    readonly empreinte: string;
    readonly fichierNom: string | null;
    readonly fichierTaille: number | null;
    readonly urlSource: string | null;
    readonly recupereLe: string | null;
    readonly periode: string | null;
    readonly licence: string;
    readonly attribution: string;
    readonly droits: DroitsVersion;
    readonly crsSource: string;
    readonly precision: string | null;
    readonly transformations: readonly string[];
    readonly controles: Record<string, unknown>;
    readonly synthetique: boolean;
  };
  readonly couche: {
    readonly titre: string;
    readonly description: string;
    readonly niveau: string | null;
    readonly champCode: string | null;
    readonly champNom: string | null;
    readonly proprietesExposees: readonly string[];
    readonly styleDefaut: StyleCouche;
  };
  readonly objets: readonly ObjetImporte[];
  readonly indicateurs: readonly IndicateurDeclare[];
  /** Ajouter l'indicateur calculé « Superficie » (couches de polygones). */
  readonly superficie: boolean;
  readonly preparePar: string | null;
}

export interface VersionEcrite {
  readonly sourceId: string;
  readonly versionId: string;
  readonly coucheId: string;
  readonly objets: number;
  readonly reparees: number;
  readonly indicateurs: readonly string[];
}

export const METHODE_SUPERFICIE = "Aire ellipsoïdale WGS 84 de la géométrie de référence (PostGIS ST_Area sur geography), en km² — résultat calculé, non une valeur de la source";

function typeCouche(objets: readonly ObjetImporte[]): "polygone" | "ligne" | "point" | "mixte" {
  const familles = new Set(objets.map((o) => (/Polygon/.test(o.geometrie.type) ? "polygone" : /LineString/.test(o.geometrie.type) ? "ligne" : "point")));
  return familles.size === 1 ? ([...familles][0] as "polygone" | "ligne" | "point") : "mixte";
}

/** Codes texte stables : champ déclaré (zéros initiaux conservés), sinon rang de l'objet. Un code en double est une erreur. */
export function codesDesObjets(objets: readonly ObjetImporte[], champCode: string | null): { codes: string[]; doublons: string[]; manquants: number } {
  const codes: string[] = [];
  const vus = new Set<string>();
  const doublons = new Set<string>();
  let manquants = 0;
  objets.forEach((o, i) => {
    const brut = champCode ? o.proprietes[champCode] : null;
    let code = brut === null || brut === undefined || brut === "" ? null : String(brut);
    if (code === null) { if (champCode) manquants++; code = String(i + 1); }
    if (vus.has(code)) doublons.add(code);
    vus.add(code);
    codes.push(code);
  });
  return { codes, doublons: [...doublons], manquants };
}

export async function ecrireVersion(client: PoolClient, v: VersionAEcrire): Promise<VersionEcrite> {
  const { codes, doublons } = codesDesObjets(v.objets, v.couche.champCode);
  if (doublons.length) throw Object.assign(new Error("codes_en_double"), { code: "codes_en_double", doublons });
  const [src] = (await client.query<{ id: string }>(
    `INSERT INTO geodata_sources (id, cle, espace_id, titre, producteur, theme, couverture, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (cle) DO UPDATE SET cle = EXCLUDED.cle RETURNING id`,
    [newId("gdsrc"), v.source.cle, v.espaceId, v.source.titre, v.source.producteur, v.source.theme, v.source.couverture, v.source.description],
  )).rows;
  const sourceId = src!.id;
  const versionId = newId("gdver");
  await client.query(
    `INSERT INTO geodata_versions (id, source_id, espace_id, libelle, empreinte, fichier_nom, fichier_taille, url_source, recupere_le, periode, licence, attribution,
       droits, crs_source, precision_donnees, transformations, controles, synthetique, preparee_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [versionId, sourceId, v.espaceId, v.version.libelle, v.version.empreinte, v.version.fichierNom, v.version.fichierTaille, v.version.urlSource, v.version.recupereLe,
      v.version.periode, v.version.licence, v.version.attribution, JSON.stringify(v.version.droits), v.version.crsSource, v.version.precision,
      JSON.stringify(v.version.transformations), JSON.stringify(v.version.controles), v.version.synthetique, v.preparePar],
  );
  const coucheId = newId("gdcou");
  await client.query(
    `INSERT INTO geodata_couches (id, version_id, titre, description, type_geometrie, niveau, proprietes_exposees, style_defaut) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [coucheId, versionId, v.couche.titre, v.couche.description, typeCouche(v.objets), v.couche.niveau, JSON.stringify(v.couche.proprietesExposees), JSON.stringify(v.couche.styleDefaut)],
  );
  let reparees = 0;
  for (let debut = 0; debut < v.objets.length; debut += 400) {
    const lot = v.objets.slice(debut, debut + 400).map((o, k) => ({
      code: codes[debut + k],
      nom: v.couche.champNom && o.proprietes[v.couche.champNom] !== undefined && o.proprietes[v.couche.champNom] !== null ? String(o.proprietes[v.couche.champNom]) : null,
      proprietes: o.proprietes,
      geometrie: o.geometrie,
    }));
    const r = await client.query<{ reparees: string }>(
      `WITH entree AS (
         SELECT e.code, e.nom, e.proprietes, ST_SetSRID(ST_GeomFromGeoJSON(e.geometrie::text), 4326) AS g
           FROM jsonb_to_recordset($2::jsonb) AS e(code text, nom text, proprietes jsonb, geometrie jsonb)
       ), ins AS (
         INSERT INTO geodata_objets (couche_id, code, nom, niveau, proprietes, geom, geometrie_reparee)
         SELECT $1, code, nom, $3, proprietes, CASE WHEN ST_IsValid(g) THEN g ELSE ST_MakeValid(g) END, NOT ST_IsValid(g) FROM entree
         RETURNING geometrie_reparee
       ) SELECT count(*) FILTER (WHERE geometrie_reparee) AS reparees FROM ins`,
      [coucheId, JSON.stringify(lot), v.couche.niveau],
    );
    reparees += Number(r.rows[0]?.reparees ?? 0);
  }
  const indicateurs: string[] = [];
  for (const ind of v.indicateurs) {
    const id = newId("gdind");
    await client.query(
      `INSERT INTO geodata_indicateurs (id, couche_id, titre, unite, periode, nature, methode, denominateur, description) VALUES ($1, $2, $3, $4, $5, 'source', $6, $7, $8)`,
      [id, coucheId, ind.titre, ind.unite, ind.periode, `Valeur de la propriété « ${ind.propriete} » de la source, sans transformation`, ind.denominateur, ind.description],
    );
    const motif = estMotifAbsence(ind.motifSiAbsente) ? ind.motifSiAbsente : "non-evaluee";
    // Une valeur non numérique ou vide n'est jamais convertie en zéro : elle reçoit le motif déclaré par la fiche.
    await client.query(
      `INSERT INTO geodata_valeurs (indicateur_id, code, valeur, motif_absence)
       SELECT $1, o.code, x.v, CASE WHEN x.v IS NULL THEN $4 END
         FROM geodata_objets o
         CROSS JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(o.proprietes -> $3) = 'number' THEN (o.proprietes ->> $3)::double precision END AS v) x
        WHERE o.couche_id = $2`,
      [id, coucheId, ind.propriete, motif],
    );
    indicateurs.push(id);
  }
  if (v.superficie && typeCouche(v.objets) === "polygone") {
    const id = newId("gdind");
    await client.query(
      `INSERT INTO geodata_indicateurs (id, couche_id, titre, unite, periode, nature, methode, denominateur, description) VALUES ($1, $2, 'Superficie calculée', 'km²', NULL, 'calcule', $3, NULL, $4)`,
      [id, coucheId, METHODE_SUPERFICIE, "Superficie de chaque unité calculée par GeoData à partir de la géométrie de la version ; ce n'est pas une superficie officielle."],
    );
    await client.query(
      `INSERT INTO geodata_valeurs (indicateur_id, code, valeur, motif_absence) SELECT $1, code, round((ST_Area(geom::geography) / 1e6)::numeric, 3)::double precision, NULL FROM geodata_objets WHERE couche_id = $2`,
      [id, coucheId],
    );
    indicateurs.push(id);
  }
  await client.query(
    `UPDATE geodata_couches SET nombre_objets = s.n, emprise = s.e FROM (
       SELECT x.c::int AS n, ST_MakeEnvelope(ST_XMin(x.b) - 1e-6, ST_YMin(x.b) - 1e-6, ST_XMax(x.b) + 1e-6, ST_YMax(x.b) + 1e-6, 4326) AS e
         FROM (SELECT ST_Extent(geom) AS b, count(*) AS c FROM geodata_objets WHERE couche_id = $1) x) s
     WHERE id = $1`,
    [coucheId],
  );
  if (reparees) {
    await client.query(`UPDATE geodata_versions SET transformations = transformations || $2::jsonb WHERE id = $1`, [versionId, JSON.stringify([`${reparees} géométrie(s) invalide(s) réparée(s) par ST_MakeValid (objets marqués « géométrie réparée »)`])]);
  }
  return { sourceId, versionId, coucheId, objets: v.objets.length, reparees, indicateurs };
}
