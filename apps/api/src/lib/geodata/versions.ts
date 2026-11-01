/**
 * Écriture d'une version de données (chaîne réception → contrôle → préparation, concept § 7 et plan GD-03) : partagée par
 * l'import de référence (`npm run geodata:import-reference`, version commune en préparation, publiée ensuite par un
 * responsable de publication) et par l'import personnel confirmé (version privée de l'espace, publiée pour lui seul).
 *
 * Les géométries sont écrites telles quelles en WGS 84 ; une géométrie invalide est réparée par `ST_MakeValid` et la
 * réparation est **comptée et consignée** dans les transformations de la version (jamais silencieuse).
 */
import type { PoolClient } from "pg";
import type { DefinitionTableauDeBord, DescriptionRaster, DroitsVersion, Milieu, MotifAbsence, ObjetImporte, Qualification, Sexe, StyleCouche } from "@parcours/geodata-model";
import { estMilieu, estMotifAbsence, estSexe } from "@parcours/geodata-model";
import { newId } from "../ids.js";
import { compresser, type GrilleRaster } from "./raster.js";
import type { LignePrixPublie } from "./prix/agregats.js";

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
  /** Dimensions (D-GD-17, lot A2) : thème, famille, modalité, milieu, sexe ; ordre d'affichage. */
  readonly theme?: string | null;
  readonly famille?: string | null;
  readonly modalite?: string | null;
  readonly milieu?: Milieu | null;
  readonly sexe?: Sexe | null;
  readonly ordre?: number;
  /**
   * Valeurs lues d'un tableau livré avec la fiche (code → nombre ou signe conventionnel) au lieu des propriétés des
   * objets ; un signe déclaré dans `signes` donne son motif, tout autre absence le motif `motifSiAbsente`.
   */
  readonly valeurs?: ReadonlyMap<string, number | string | null>;
  readonly signes?: Readonly<Record<string, MotifAbsence>>;
  /**
   * Indicateur calculé par la préparation (D-GD-37 : total national de la CEE, somme des régions) : méthode écrite ;
   * l'indicateur prend la nature « calcule », jamais présenté comme une valeur publiée par la source.
   */
  readonly calcul?: string;
}

/** Concept du producteur (D-GD-37) : une entrée par concept et par langue. */
export interface ConceptAnnexe { readonly langue: "fr" | "ar"; readonly ordre: number; readonly titre: string; readonly texte: string }

/** Douar du RGPH 2024 : nombres tels que publiés ; null = absent ; secret = pourcentages supprimés par le HCP. */
export interface LigneDouar {
  readonly code: string; readonly commune: string; readonly fraction: string; readonly nom: string; readonly type: "groupé" | "éclaté" | "dispersé" | null;
  readonly menages: number | null; readonly population: number | null; readonly masculin: number | null; readonly feminin: number | null;
  readonly moins_15: number | null; readonly de_15_a_59: number | null; readonly plus_60: number | null; readonly secret: boolean;
  /** Compléments (D-GD-43) : colonne de l'annexe → nombre publié, null si absent ou secret. */
  readonly complements?: Readonly<Record<string, number | null>>;
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
    /** Qualification de la source (D-GD-54) ; absente = qualifiée. */
    readonly qualification?: Qualification;
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
  /** Couche raster (D-GD-13) : grille et symbologie ; `objets` est alors vide. */
  readonly raster?: { readonly grille: GrilleRaster; readonly description: DescriptionRaster };
  /** Douars (annexe sans géométrie, lot E) : rangés sous leur commune, affichés dans sa fiche. */
  readonly douars?: readonly LigneDouar[];
  /** Concepts et définitions du producteur (annexe, D-GD-37), avec la citation de leur source. */
  readonly concepts?: { readonly source: string; readonly liste: readonly ConceptAnnexe[] };
  /** Définition du tableau de bord (annexe, D-GD-37), validée par `validerDefinitionTableauDeBord`. */
  readonly tableauDeBord?: DefinitionTableauDeBord;
  /**
   * Agrégats de prix publiés par un tiers (annexe `prixPublies`, Concept Prix §4) : lignes telles que publiées, déjà
   * rattachées (ville → objet de la couche ; quartiers commerciaux non rattachés), écrites dans `geodata_prix_agregats_publies`.
   */
  readonly prixPublies?: readonly LignePrixPublie[];
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
     ON CONFLICT (cle) DO UPDATE SET titre = EXCLUDED.titre, producteur = EXCLUDED.producteur, theme = EXCLUDED.theme,
       couverture = EXCLUDED.couverture, description = EXCLUDED.description RETURNING id`,
    [newId("gdsrc"), v.source.cle, v.espaceId, v.source.titre, v.source.producteur, v.source.theme, v.source.couverture, v.source.description],
  )).rows;
  const sourceId = src!.id;
  const versionId = newId("gdver");
  await client.query(
    `INSERT INTO geodata_versions (id, source_id, espace_id, libelle, empreinte, fichier_nom, fichier_taille, url_source, recupere_le, periode, licence, attribution,
       droits, crs_source, precision_donnees, transformations, controles, synthetique, preparee_par, qualification, qualification_motif, qualification_decision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
    [versionId, sourceId, v.espaceId, v.version.libelle, v.version.empreinte, v.version.fichierNom, v.version.fichierTaille, v.version.urlSource, v.version.recupereLe,
      v.version.periode, v.version.licence, v.version.attribution, JSON.stringify(v.version.droits), v.version.crsSource, v.version.precision,
      JSON.stringify(v.version.transformations), JSON.stringify(v.version.controles), v.version.synthetique, v.preparePar,
      v.version.qualification?.etat ?? "qualifiee", v.version.qualification?.motif ?? null, v.version.qualification?.decision ?? null],
  );
  const coucheId = newId("gdcou");
  await client.query(
    `INSERT INTO geodata_couches (id, version_id, titre, description, type_geometrie, niveau, proprietes_exposees, style_defaut) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [coucheId, versionId, v.couche.titre, v.couche.description, v.raster ? "raster" : typeCouche(v.objets), v.couche.niveau, JSON.stringify(v.couche.proprietesExposees), JSON.stringify(v.couche.styleDefaut)],
  );
  if (v.raster) {
    const { grille: g, description } = v.raster;
    const [ouest, sud, est, nord] = g.emprise;
    await client.query(
      `INSERT INTO geodata_rasters (couche_id, largeur, hauteur, ouest, sud, est, nord, nodata, valeurs, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [coucheId, g.largeur, g.hauteur, ouest, sud, est, nord, g.nodata, compresser(g.valeurs), JSON.stringify(description)],
    );
    await client.query(`UPDATE geodata_couches SET nombre_objets = 0, emprise = ST_MakeEnvelope($2, $3, $4, $5, 4326) WHERE id = $1`, [coucheId, ouest, sud, est, nord]);
    return { sourceId, versionId, coucheId, objets: 0, reparees: 0, indicateurs: [] };
  }
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
  let codesCouche: string[] | null = null;
  for (const [rang, ind] of v.indicateurs.entries()) {
    const id = newId("gdind");
    await client.query(
      `INSERT INTO geodata_indicateurs (id, couche_id, titre, unite, periode, nature, methode, denominateur, description, theme, famille, modalite, milieu, sexe, ordre)
       VALUES ($1, $2, $3, $4, $5, $15, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [id, coucheId, ind.titre, ind.unite, ind.periode,
        ind.calcul ? ind.calcul : ind.valeurs ? `Valeur de la colonne « ${ind.propriete} » du tableau livré avec la source, sans transformation` : `Valeur de la propriété « ${ind.propriete} » de la source, sans transformation`,
        ind.denominateur, ind.description, ind.theme ?? null, ind.famille ?? null, ind.modalite ?? null,
        estMilieu(ind.milieu) ? ind.milieu : null, estSexe(ind.sexe) ? ind.sexe : null, ind.ordre ?? rang, ind.calcul ? "calcule" : "source"],
    );
    const motif = estMotifAbsence(ind.motifSiAbsente) ? ind.motifSiAbsente : "non-evaluee";
    if (ind.valeurs) {
      // Tableau livré : une valeur par code d'objet ; un signe conventionnel déclaré donne son motif ; jamais zéro.
      codesCouche ??= (await client.query<{ code: string }>(`SELECT code FROM geodata_objets WHERE couche_id = $1`, [coucheId])).rows.map((r) => r.code);
      const lignes = codesCouche.map((code) => {
        const x = ind.valeurs!.get(code);
        if (typeof x === "number" && Number.isFinite(x)) return { code, valeur: x, motif: null };
        const m = typeof x === "string" ? ind.signes?.[x.trim()] : undefined;
        return { code, valeur: null, motif: m && estMotifAbsence(m) ? m : motif };
      });
      await client.query(
        `INSERT INTO geodata_valeurs (indicateur_id, code, valeur, motif_absence)
         SELECT $1, e.code, e.valeur, e.motif FROM jsonb_to_recordset($2::jsonb) AS e(code text, valeur double precision, motif text)`,
        [id, JSON.stringify(lignes)],
      );
      await client.query(`UPDATE geodata_indicateurs SET nb_absentes = $2, nb_total = $3 WHERE id = $1`, [id, lignes.filter((l) => l.valeur === null).length, lignes.length]);
      indicateurs.push(id);
      continue;
    }
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
  for (let i = 0; i < (v.douars?.length ?? 0); i += 5000) {
    await client.query(
      `INSERT INTO geodata_douars (version_id, code, commune, fraction, nom, type, menages, population, masculin, feminin, moins_15, de_15_a_59, plus_60, secret, complements)
       SELECT $1, d.code, d.commune, d.fraction, d.nom, d.type, d.menages, d.population, d.masculin, d.feminin, d.moins_15, d.de_15_a_59, d.plus_60, d.secret, d.complements
         FROM jsonb_to_recordset($2::jsonb) AS d(code text, commune text, fraction text, nom text, type text, menages integer, population integer,
              masculin double precision, feminin double precision, moins_15 double precision, de_15_a_59 double precision, plus_60 double precision, secret boolean,
              complements jsonb)`,
      [versionId, JSON.stringify(v.douars!.slice(i, i + 5000))],
    );
  }
  if (v.concepts?.liste.length) {
    await client.query(
      `INSERT INTO geodata_concepts (version_id, langue, ordre, titre, texte, source)
       SELECT $1, c.langue, c.ordre, c.titre, c.texte, $3 FROM jsonb_to_recordset($2::jsonb) AS c(langue text, ordre integer, titre text, texte text)`,
      [versionId, JSON.stringify(v.concepts.liste), v.concepts.source],
    );
  }
  if (v.tableauDeBord) {
    const t = v.tableauDeBord;
    await client.query(`INSERT INTO geodata_tableaux_bord (version_id, pays, zone_code, zone_nom, definition) VALUES ($1, $2, $3, $4, $5)`, [versionId, t.pays, t.zone.code, t.zone.nom, JSON.stringify(t)]);
  }
  if (v.prixPublies?.length) {
    await client.query(
      `INSERT INTO geodata_prix_agregats_publies (version_id, ordre, editeur, ville, niveau_geo, libelle_geo, code_rattache, etat_rattachement, type_bien,
         type_bien_original, transaction, nombre_annonces, prix_median, prix_median_approximatif, prix_median_texte, prix_m2, prix_m2_texte, unite, unite_m2,
         tendance_90j, periode_debut, periode_fin, periode, source_url, licence, prix_m2_approximatif)
       SELECT $1, a."ordre", a."editeur", a."ville", a."niveauGeo", a."libelleGeo", a."codeRattache", a."etatRattachement", a."typeBien",
         a."typeBienOriginal", a."transaction", a."nombreAnnonces", a."prixMedian"::numeric, a."prixMedianApproximatif", a."prixMedianTexte", a."prixM2"::numeric,
         a."prixM2Texte", a."unite", a."uniteM2", a."tendance90j"::numeric, a."periodeDebut"::date, a."periodeFin"::date, a."periode", a."sourceUrl", a."licence", a."prixM2Approximatif"
         FROM jsonb_to_recordset($2::jsonb) AS a("ordre" integer, "editeur" text, "ville" text, "niveauGeo" text, "libelleGeo" text, "codeRattache" text,
              "etatRattachement" text, "typeBien" text, "typeBienOriginal" text, "transaction" text, "nombreAnnonces" integer, "prixMedian" text,
              "prixMedianApproximatif" boolean, "prixMedianTexte" text, "prixM2" text, "prixM2Texte" text, "unite" text, "uniteM2" text, "tendance90j" text,
              "periodeDebut" text, "periodeFin" text, "periode" text, "sourceUrl" text, "licence" text, "prixM2Approximatif" boolean)`,
      // Tendance en texte : le nombre publié (« -4.8 ») passe tel quel en `numeric`, sans arrondi binaire.
      [versionId, JSON.stringify(v.prixPublies.map((l) => ({ ...l, tendance90j: l.tendance90j === null ? null : String(l.tendance90j) })))],
    );
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
