/**
 * Valeurs immobilières de référence officielles (Concept Prix v1.1 §3, Plan §5 et §6) : import contrôlé (aperçu sans
 * écriture, puis validation avec clé d'idempotence) d'un fichier de valeurs d'une source du registre au produit
 * `valeurs-officielles`, refusé tant que cette source n'est pas `active` ou `autorisee` (au 31 octobre 2026, aucune
 * édition officielle ne l'est : la chaîne est livrée vide, éprouvée sur des jeux synthétiques de test seulement).
 *
 * Chaque valeur garde sa forme et son texte d'origine (aucune transformation) ; la validité de l'édition est déclarée
 * par l'importateur et n'est jamais déduite de la date d'import ; une zone garde son identifiant et sa géométrie
 * d'origine (WGS 84 déclaré) et attend toujours la revue de son attribution territoriale (`a-revoir`), même quand le
 * fichier propose un territoire. Le fichier est archivé tel quel (`geodata_fichiers`, rôle `import-prix`).
 * Ce module n'ouvre ni pool ni transaction : l'appelant les fournit.
 */
import { createHash } from "node:crypto";
import { COLONNES_OBLIGATOIRES_OFFICIELLES, lireLigneOfficielle, type MotifQuarantaineOfficielle, type ValeurOfficielleLue } from "@parcours/geodata-model";
import type { Executeur } from "../archive-fichiers.js";
import { newId } from "../../ids.js";
import { ErreurPrix, exigerSource, lireFichierTabulaire } from "./pipeline.js";

/** Version de l'analyseur des fichiers de valeurs officielles (entre dans la clé d'idempotence). */
export const VERSION_ANALYSEUR_OFFICIELLES = "prix-officielles-1";
export const VALIDITES_DECLAREES = ["verifiee", "non-verifiee", "historique"] as const;
export type ValiditeDeclaree = (typeof VALIDITES_DECLAREES)[number];

export interface DemandeImportOfficiel {
  readonly source: string;
  readonly edition: { readonly libelle: string; readonly dateDebut: string | null; readonly dateFin: string | null; readonly url: string | null; readonly validite: ValiditeDeclaree };
  readonly format: "csv" | "json";
  readonly contenu: string;
  readonly acteur: string | null;
}

export interface RapportImportOfficiel {
  readonly cleIdempotence: string;
  readonly empreinte: string;
  readonly versionAnalyseur: string;
  readonly lignesLues: number;
  readonly admises: number;
  readonly quarantaine: number;
  readonly parMotif: Readonly<Record<string, number>>;
  readonly zones: number;
  readonly zonesSansGeometrie: number;
  readonly validite: ValiditeDeclaree;
  readonly exemplesQuarantaine: readonly { readonly ligne: number; readonly zone: string | null; readonly motifs: readonly string[] }[];
}

export const cleIdempotenceOfficielle = (empreinte: string, source: string) => `${empreinte}.${VERSION_ANALYSEUR_OFFICIELLES}.${source}`;

const descriptionZone = (z: ValeurOfficielleLue["zone"]) => JSON.stringify([z.libelle, z.description, z.geometrie, z.crs, z.territoirePropose]);

interface AnalyseOfficielle {
  readonly rapport: RapportImportOfficiel;
  readonly admises: readonly { readonly ligne: number; readonly v: ValeurOfficielleLue }[];
  readonly quarantaine: readonly { readonly ligne: number; readonly brut: Record<string, string>; readonly motifs: readonly MotifQuarantaineOfficielle[] }[];
}

/** Analyse sans écriture : lecture, contrôle de chaque ligne, cohérence des zones (fichier et édition déjà en base). */
export async function analyserImportOfficiel(ex: Executeur, d: DemandeImportOfficiel): Promise<AnalyseOfficielle> {
  const empreinte = createHash("sha256").update(d.contenu, "utf8").digest("hex");
  const lues = lireFichierTabulaire(d.contenu, d.format, COLONNES_OBLIGATOIRES_OFFICIELLES);
  const admises: { ligne: number; v: ValeurOfficielleLue }[] = [];
  const quarantaine: { ligne: number; brut: Record<string, string>; motifs: MotifQuarantaineOfficielle[] }[] = [];
  // Zones déjà décrites dans cette édition (lots précédents) : la première description fait foi.
  const enBase = new Map((await ex.query<{ zone_code: string; d: string }>(
    `SELECT z.zone_code, jsonb_build_array(z.libelle, z.description_textuelle, CASE WHEN z.geom IS NULL THEN NULL ELSE ST_AsGeoJSON(z.geom)::jsonb END, z.crs_origine, z.territoire_propose)::text AS d
       FROM geodata_prix_zones z JOIN geodata_prix_editions e ON e.id = z.edition_id WHERE e.source_cle = $1 AND e.libelle = $2`,
    [d.source, d.edition.libelle],
  )).rows.map((x) => [x.zone_code, x.d]));
  const vues = new Map<string, string>();
  for (const l of lues) {
    const r = lireLigneOfficielle(l.valeurs);
    if (!r.ok) { quarantaine.push({ ligne: l.ligne, brut: l.valeurs, motifs: [...r.motifs] }); continue; }
    const z = r.valeur.zone;
    const desc = descriptionZone(z);
    const deja = vues.get(z.code);
    // Une zone déjà en base est comparée sur ses champs textuels (la géométrie relue de PostGIS peut différer
    // d'écriture) : même libellé, description, CRS et territoire proposé ; sinon incohérente.
    const base = enBase.get(z.code);
    const baseIncoherente = base !== undefined && (() => {
      const [lib, des, , crs, ter] = JSON.parse(base) as [string | null, string | null, unknown, string | null, string | null];
      return lib !== z.libelle || des !== z.description || crs !== z.crs || ter !== z.territoirePropose;
    })();
    if ((deja !== undefined && deja !== desc) || baseIncoherente) { quarantaine.push({ ligne: l.ligne, brut: l.valeurs, motifs: ["zone-incoherente"] }); continue; }
    vues.set(z.code, desc);
    admises.push({ ligne: l.ligne, v: r.valeur });
  }
  quarantaine.sort((a, b) => a.ligne - b.ligne);
  const parMotif: Record<string, number> = {};
  for (const q of quarantaine) for (const m of q.motifs) parMotif[m] = (parMotif[m] ?? 0) + 1;
  const zones = [...new Map(admises.map((a) => [a.v.zone.code, a.v.zone])).values()];
  return {
    rapport: {
      cleIdempotence: cleIdempotenceOfficielle(empreinte, d.source), empreinte, versionAnalyseur: VERSION_ANALYSEUR_OFFICIELLES,
      lignesLues: lues.length, admises: admises.length, quarantaine: quarantaine.length, parMotif, zones: zones.length,
      zonesSansGeometrie: zones.filter((z) => !z.geometrie).length, validite: d.edition.validite,
      exemplesQuarantaine: quarantaine.slice(0, 50).map((q) => ({ ligne: q.ligne, zone: q.brut["zone_code"] || null, motifs: q.motifs })),
    },
    admises, quarantaine,
  };
}

/** Colonnes documentées seulement (aucune autre colonne du fichier n'est conservée en quarantaine). */
const COLONNES_GARDEES = ["zone_code", "categorie_originale", "type_bien", "etat_bien", "transaction", "base_surface", "forme", "valeur", "valeur_min", "valeur_max",
  "valeur_terrain", "valeur_construction", "condition", "texte_original", "monnaie", "unite", "date_debut", "date_fin", "page_ou_ligne", "crs"] as const;

export interface ResultatImportOfficiel { readonly deja: boolean; readonly lotId: string; readonly editionId: string; readonly rapport: RapportImportOfficiel | null; readonly nouvelles: number }

/**
 * Import validé (dans la transaction de l'appelant) : source autorisée exigée et tenue en partage, clé d'idempotence
 * comparée à celle de l'aperçu, archive du fichier, édition (validité déclarée ; une édition existante garde la sienne),
 * lot, zones (nouvelles seulement, revue `a-revoir`), valeurs et quarantaine. Même clé → lot existant rendu, rien d'écrit.
 */
export async function importerValeursOfficielles(ex: Executeur, d: DemandeImportOfficiel, cleAttendue: string | null): Promise<ResultatImportOfficiel> {
  await exigerSource(ex, d.source, "valeurs-officielles", true);
  const empreinte = createHash("sha256").update(d.contenu, "utf8").digest("hex");
  const cle = cleIdempotenceOfficielle(empreinte, d.source);
  if (cleAttendue !== null && cleAttendue !== cle) throw new ErreurPrix(409, "cle_idempotence_differente", "Le fichier ne correspond pas à l'aperçu validé (clé d'idempotence différente).", { attendue: cleAttendue, calculee: cle });
  await ex.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`geodata_prix_lot:${cle}`]);
  const [deja] = (await ex.query<{ id: string; edition_id: string }>("SELECT id, edition_id FROM geodata_prix_lots WHERE cle_idempotence = $1", [cle])).rows;
  if (deja) return { deja: true, lotId: deja.id, editionId: deja.edition_id, rapport: null, nouvelles: 0 };
  const a = await analyserImportOfficiel(ex, d);
  const chemin = `imports-prix/${empreinte}.${d.format}`;
  const octets = Buffer.from(d.contenu, "utf8");
  await ex.query(
    `INSERT INTO geodata_fichiers (chemin, role, source_cle, type_media, taille, empreinte, contenu) VALUES ($1, 'import-prix', $2, $3, $4, $5, $6) ON CONFLICT (chemin) DO NOTHING`,
    [chemin, d.source, d.format === "csv" ? "text/csv" : "application/json", octets.length, empreinte, octets],
  );
  await ex.query(
    `INSERT INTO geodata_prix_editions (id, source_cle, couche, produit, libelle, date_debut, date_fin, url_origine, validite, cree_par)
     VALUES ($1, $2, 'officielle', 'valeurs-officielles', $3, $4, $5, $6, $7, $8) ON CONFLICT (source_cle, libelle) DO NOTHING`,
    [newId("gdped"), d.source, d.edition.libelle, d.edition.dateDebut, d.edition.dateFin, d.edition.url, d.edition.validite, d.acteur],
  );
  const [ed] = (await ex.query<{ id: string; etat: string; produit: string; validite: string }>("SELECT id, etat, produit, validite FROM geodata_prix_editions WHERE source_cle = $1 AND libelle = $2", [d.source, d.edition.libelle])).rows;
  if (ed!.produit !== "valeurs-officielles") throw new ErreurPrix(409, "produit_incompatible", "Cette édition n'est pas une édition de valeurs officielles.");
  if (ed!.etat !== "active") throw new ErreurPrix(409, "edition_non_active", `Édition « ${d.edition.libelle} » ${ed!.etat} : aucun import.`);
  // Une édition existante garde sa validité (jamais modifiée par un nouveau lot) : la validité déclarée doit concorder.
  if (ed!.validite !== d.edition.validite) throw new ErreurPrix(409, "validite_differente", `Édition déjà enregistrée avec la validité « ${ed!.validite} ».`, { validite: ed!.validite });
  const lotId = newId("gdplt");
  await ex.query(
    `INSERT INTO geodata_prix_lots (id, edition_id, source_cle, cle_idempotence, empreinte, version_analyseur, format, fichier_chemin, etat, lignes_lues, admises, quarantaine, nouvelles, erreurs, cree_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'valide', $9, $10, $11, $10, $12, $13)`,
    [lotId, ed!.id, d.source, cle, empreinte, VERSION_ANALYSEUR_OFFICIELLES, d.format, chemin, a.rapport.lignesLues, a.rapport.admises, a.rapport.quarantaine,
      JSON.stringify({ parMotif: a.rapport.parMotif, validite: d.edition.validite }), d.acteur],
  );
  // Zones : insérées une fois par édition (identifiant d'origine) ; revue de l'attribution territoriale toujours attendue.
  const zones = [...new Map(a.admises.map((x) => [x.v.zone.code, x.v.zone])).values()];
  if (zones.length) {
    await ex.query(
      `INSERT INTO geodata_prix_zones (id, edition_id, zone_code, libelle, geom, crs_origine, description_textuelle, territoire_propose, revue)
       SELECT 'gdpzo_' || md5($1 || ':' || z.code), $1, z.code, z.libelle,
              CASE WHEN z.geometrie IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(z.geometrie::text), 4326)) END,
              z.crs, z.description, z.territoire, 'a-revoir'
         FROM jsonb_to_recordset($2::jsonb) AS z(code text, libelle text, geometrie jsonb, crs text, description text, territoire text)
       ON CONFLICT (edition_id, zone_code) DO NOTHING`,
      [ed!.id, JSON.stringify(zones.map((z) => ({ code: z.code, libelle: z.libelle, geometrie: z.geometrie, crs: z.crs, description: z.description, territoire: z.territoirePropose })))],
    );
  }
  for (let i = 0; i < a.admises.length; i += 1000) {
    await ex.query(
      `INSERT INTO geodata_prix_valeurs_officielles (id, edition_id, zone_id, lot_id, categorie_originale, type_bien, etat_bien, transaction, base_surface, forme, valeur, valeur_min,
         valeur_max, valeur_terrain, valeur_construction, condition, texte_original, monnaie, unite, date_debut, date_fin, page_ou_ligne, validite)
       SELECT 'gdpvo_' || md5($2 || ':' || v.ligne), $1, z.id, $2, v.categorie, v.type_bien, v.etat_bien, v.transaction, v.base, v.forme, v.valeur::numeric, v.vmin::numeric,
              v.vmax::numeric, v.vterrain::numeric, v.vconstruction::numeric, v.condition, v.texte, v.monnaie, v.unite, v.debut::date, v.fin::date, v.page, $3
         FROM jsonb_to_recordset($4::jsonb) AS v(ligne integer, zone text, categorie text, type_bien text, etat_bien text, transaction text, base text, forme text, valeur text, vmin text,
              vmax text, vterrain text, vconstruction text, condition text, texte text, monnaie text, unite text, debut text, fin text, page text)
         JOIN geodata_prix_zones z ON z.edition_id = $1 AND z.zone_code = v.zone`,
      [ed!.id, lotId, ed!.validite, JSON.stringify(a.admises.slice(i, i + 1000).map(({ ligne, v }) => {
        const t = (x: number | null) => (x === null ? null : String(x));
        return {
          ligne, zone: v.zone.code, categorie: v.categorieOriginale, type_bien: v.typeBien, etat_bien: v.etat, transaction: v.transaction, base: v.baseSurface, forme: v.forme,
          valeur: t(v.valeur), vmin: t(v.valeurMin), vmax: t(v.valeurMax), vterrain: t(v.valeurTerrain), vconstruction: t(v.valeurConstruction), condition: v.condition,
          texte: v.texteOriginal, monnaie: v.monnaie, unite: v.unite, debut: v.dateDebut, fin: v.dateFin, page: v.pageOuLigne ?? `ligne ${ligne}`,
        };
      }))],
    );
  }
  for (let i = 0; i < a.quarantaine.length; i += 1000) {
    await ex.query(
      `INSERT INTO geodata_prix_quarantaine (lot_id, ligne, annonce_id, motifs, donnees)
       SELECT $1, e.ligne, e.zone, e.motifs, e.donnees FROM jsonb_to_recordset($2::jsonb) AS e(ligne integer, zone text, motifs text[], donnees jsonb)`,
      [lotId, JSON.stringify(a.quarantaine.slice(i, i + 1000).map((q) => ({
        ligne: q.ligne, zone: q.brut["zone_code"] || null, motifs: q.motifs, donnees: Object.fromEntries(COLONNES_GARDEES.map((k) => [k, q.brut[k] ?? ""])),
      })))],
    );
  }
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.officielles.import', $2, 'succes', $3)",
    [d.acteur, lotId, JSON.stringify({ source: d.source, edition: d.edition.libelle, validite: ed!.validite, lignes: a.rapport.lignesLues, admises: a.rapport.admises, quarantaine: a.rapport.quarantaine })]);
  return { deja: false, lotId, editionId: ed!.id, rapport: a.rapport, nouvelles: a.admises.length };
}
