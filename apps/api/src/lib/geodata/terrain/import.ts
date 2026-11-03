/**
 * Import contrôlé d'une version d'altitudes (plan v1.0, lot TER-02) : fichier déposé → empreinte en flux → traitement
 * idempotent (empreinte + fiche) → version « déposé » → « validation » → contrôle de l'en-tête contre la fiche → rejeté,
 * quarantaine ou prêt au traitement → original archivé par empreinte. Chaque transition est un événement en ajout seul.
 *
 * Garanties :
 *  - un import raté ou rejeté ne touche à aucune autre version, a fortiori pas à la version publiée (index unique) ;
 *  - relancé sur le même fichier et la même fiche, l'import ne crée rien (clé d'idempotence) ; un traitement interrompu
 *    ou en échec est repris (tentatives comptées) ;
 *  - quota et taille vérifiés avant toute écriture ; aucune URL n'est lue ; aucune valeur n'est corrigée.
 * Ce module n'ouvre aucun pool : l'appelant fournit la connexion (commande d'administration, tests).
 */
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import type { PoolClient } from "pg";
import {
  controlerLevee, controlerTerrain, LIMITES_TERRAIN, texteIdempotence, verifierQuota,
  type DeclarationTerrain, type DecisionLevee, type EnTeteRaster, type EtatTerrain, type Motif, type ReferenceVerticale, type VerdictControle,
} from "@parcours/geodata-model";
import { newId } from "../../ids.js";
import { empreinteFichier, type StockageTerrain } from "./stockage.js";
import { enTeteDe, FichierIllisible, lireEnTete } from "./entete.js";
import { fromCustomClient } from "geotiff";
import { adresseDistante, CompteurBudget, empriseDalle } from "@parcours/geodata-model";
import { BUDGET_DISTANT_DEFAUT, ClientOrigine, ErreurDistante, sourcesDistantes, type Transport } from "./distant.js";

export class ImportRefuse extends Error {}

export interface ResultatImport {
  readonly versionId: string;
  readonly etat: EtatTerrain;
  readonly motifs: readonly Motif[];
  readonly empreinte: string;
  /** Vrai si rien n'a été créé : même fichier et même fiche déjà importés. */
  readonly deja: boolean;
  readonly traitementId: string;
}

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

async function evenement(c: PoolClient, versionId: string, de: EtatTerrain | null, vers: EtatTerrain, acteur: string | null, motif: string | null = null, decision: unknown = null) {
  await c.query("INSERT INTO geodata_terrain_evenements (terrain_version_id, de, vers, motif, decision, acteur_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [versionId, de, vers, motif, decision === null ? null : JSON.stringify(decision), acteur]);
}

async function changerEtat(c: PoolClient, versionId: string, de: EtatTerrain, vers: EtatTerrain, acteur: string | null, motifs: readonly Motif[] | null, motif: string | null = null, decision: unknown = null, reference: ReferenceVerticale | null = null) {
  await c.query(
    `UPDATE geodata_terrain_versions SET etat = $2, etat_le = now()${motifs ? ", motifs = $4" : ""}${reference ? `, reference_verticale = $${motifs ? 5 : 4}` : ""} WHERE id = $1 AND etat = $3`,
    [versionId, vers, de, ...(motifs ? [JSON.stringify(motifs)] : []), ...(reference ? [JSON.stringify(reference)] : [])],
  );
  await evenement(c, versionId, de, vers, acteur, motif, decision);
}

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

/** Traitement terminé pour cette clé d'idempotence : la version déjà créée, sans rien créer. */
async function dejaImporte(c: PoolClient, cle: string, empreinte: string): Promise<ResultatImport | null> {
  const [t] = (await c.query<{ id: string; etat: string; sorties: { versionId?: string } }>("SELECT id, etat, sorties FROM geodata_terrain_traitements WHERE cle_idempotence = $1", [cle])).rows;
  if (t?.etat !== "termine" || !t.sorties.versionId) return null;
  const [v] = (await c.query<{ etat: EtatTerrain; motifs: Motif[] }>("SELECT etat, motifs FROM geodata_terrain_versions WHERE id = $1", [t.sorties.versionId])).rows;
  return v ? { versionId: t.sorties.versionId, etat: v.etat, motifs: v.motifs, empreinte, deja: true, traitementId: t.id } : null;
}

/**
 * Importe le fichier `depot/<fiche.fichier.nom>` du volume terrain selon sa fiche (déjà validée). Refus (`ImportRefuse`)
 * avant toute écriture : fichier absent, trop grand, quota dépassé, empreinte différente de celle de la fiche.
 */
export async function importerTerrain(
  c: PoolClient,
  stockage: StockageTerrain,
  d: DeclarationTerrain,
  opts: { readonly deposePar: string | null; readonly quotaOctets: number; readonly limites?: { readonly octetsFichier: number; readonly cellules: number } },
): Promise<ResultatImport> {
  const limites = opts.limites ?? LIMITES_TERRAIN;
  const chemin = stockage.cheminDepot(d.fichier.nom);
  const st = await stat(chemin).catch(() => null);
  if (!st?.isFile()) {
    // Relance après un import réussi : le fichier a quitté le dépôt ; l'empreinte attendue (fiche) retrouve le traitement.
    const attendue = d.acquisition.methode === "telechargement" || d.acquisition.methode === "fenetre" ? d.acquisition.empreinte : null;
    const deja = attendue ? await dejaImporte(c, sha256(texteIdempotence("import", [attendue], d)), attendue) : null;
    if (deja) return deja;
    throw new ImportRefuse(`Fichier absent du dépôt : depot/${d.fichier.nom}.`);
  }
  if (d.acquisition.methode === "distant") throw new ImportRefuse("Fiche « distant » : importer par importerTerrainDistant (en-tête lu à la source, aucun fichier déposé).");
  if (st.size > limites.octetsFichier) throw new ImportRefuse(`Fichier de ${st.size} octets : au-delà de la limite de ${limites.octetsFichier}.`);
  const { empreinte, taille } = await empreinteFichier(chemin);
  const attendueFiche = d.acquisition.methode === "telechargement" || d.acquisition.methode === "fenetre" ? d.acquisition.empreinte : null;
  if (attendueFiche && attendueFiche !== empreinte) {
    throw new ImportRefuse(`Empreinte du fichier ${empreinte} différente de celle de la fiche ${attendueFiche} : rien n'est importé.`);
  }

  // Traitement idempotent : même fichier et même fiche → même traitement, jamais une seconde version. Les imports d'une
  // même clé sont sérialisés par un verrou consultatif de session PostgreSQL, relâché en fin d'import.
  const cle = sha256(texteIdempotence("import", [empreinte], d));
  const verrou = BigInt.asIntN(64, BigInt(`0x${cle.slice(0, 16)}`)).toString();
  await c.query("SELECT pg_advisory_lock($1::bigint)", [verrou]);
  try {
    return await importerSousVerrou(c, stockage, d, opts, limites, chemin, empreinte, taille, cle);
  } finally {
    await c.query("SELECT pg_advisory_unlock($1::bigint)", [verrou]).catch(() => undefined);
  }
}

async function importerSousVerrou(
  c: PoolClient,
  stockage: StockageTerrain,
  d: DeclarationTerrain,
  opts: { readonly deposePar: string | null; readonly quotaOctets: number },
  limites: { readonly octetsFichier: number; readonly cellules: number },
  chemin: string,
  empreinte: string,
  taille: number,
  cle: string,
): Promise<ResultatImport> {
  const deja = await dejaImporte(c, cle, empreinte);
  if (deja) return deja;
  // Quota (TER-D7) : le fichier est déjà dans le volume (dépôt) ; l'archivage en ajoute une copie temporaire.
  const quota = verifierQuota(await stockage.utilisation(), taille, opts.quotaOctets);
  if (!quota.ok) throw new ImportRefuse(quota.motif);

  // Réclamation atomique du traitement : créé, ou repris (tentative comptée) ; l'identifiant est celui de la base.
  const [{ id: traitementId }] = (await c.query<{ id: string }>(
    `INSERT INTO geodata_terrain_traitements (id, cle_idempotence, type, entrees, parametres, logiciels, etat, demande_par)
     VALUES ($1, $2, 'import', $3, $4, $5, 'en_cours', $6)
     ON CONFLICT (cle_idempotence) DO UPDATE SET etat = 'en_cours', tentatives = geodata_terrain_traitements.tentatives + 1,
       progression = 0, motif_echec = NULL, maj_le = now()
     RETURNING id`,
    [newId("gdtt"), cle, JSON.stringify([{ empreinte, taille, nom: d.fichier.nom }]), JSON.stringify({ fiche: d.cle, version: d.version.libelle }), JSON.stringify({ node: process.version, lecteur: "geotiff" }), opts.deposePar],
  )).rows as [{ id: string }];

  // Reprise : une version déjà enregistrée pour cette clé (traitement interrompu après sa création) termine le traitement.
  const [orpheline] = (await c.query<{ id: string; etat: EtatTerrain; motifs: Motif[]; cle_stockage: string | null }>(
    `SELECT v.id, v.etat, v.motifs, f.cle_stockage FROM geodata_terrain_versions v
       LEFT JOIN geodata_terrain_fichiers f ON f.terrain_version_id = v.id AND f.role = 'original' WHERE v.cle_idempotence = $1`, [cle])).rows;
  if (orpheline) {
    await c.query("UPDATE geodata_terrain_traitements SET etat = 'termine', progression = 100, sorties = $2, maj_le = now() WHERE id = $1",
      [traitementId, JSON.stringify({ versionId: orpheline.id, etat: orpheline.etat, cleStockage: orpheline.cle_stockage })]);
    if (orpheline.cle_stockage) await stockage.retirerDuDepot(d.fichier.nom);
    return { versionId: orpheline.id, etat: orpheline.etat, motifs: orpheline.motifs, empreinte, deja: true, traitementId };
  }

  try {
    let entete: EnTeteRaster | null = null;
    let verdict: VerdictControle;
    try {
      entete = await lireEnTete(chemin);
      verdict = controlerTerrain(entete, d, limites);
    } catch (e) {
      if (!(e instanceof FichierIllisible)) throw e;
      verdict = { etat: "rejete", motifs: [{ code: "dimensions", gravite: "rejet", message: e.message }], referenceVerticale: d.referenceVerticale, nodata: null, cellules: 0 };
    }
    // L'original n'est archivé que s'il est exploitable ; un fichier rejeté reste dans le dépôt pour examen.
    const archive = verdict.etat === "rejete" ? null : await stockage.archiverOriginal(chemin, empreinte);
    const versionId = newId("gdtv");
    await transaction(c, async () => {
      await c.query(
        `INSERT INTO geodata_terrain_versions (id, cle, niveau, produit, etat, declaration, empreinte, taille, entete, crs_horizontal,
           reference_verticale, nodata, cellules, synthetique, demonstration, etiquette, depose_par, cle_idempotence)
         VALUES ($1, $2, $3, $4, 'depose', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [versionId, d.cle, d.niveau, d.produit, JSON.stringify(d), empreinte, taille, entete ? JSON.stringify(entete) : null, entete?.crsHorizontal ?? null,
          JSON.stringify(verdict.referenceVerticale), verdict.nodata, entete ? verdict.cellules : null, d.synthetique, d.demonstration, d.etiquette, opts.deposePar, cle],
      );
      await evenement(c, versionId, null, "depose", opts.deposePar);
      await changerEtat(c, versionId, "depose", "validation", opts.deposePar, null);
      await changerEtat(c, versionId, "validation", verdict.etat, opts.deposePar, verdict.motifs, verdict.motifs.map((m) => m.message).join(" ") || null);
      if (archive) {
        await c.query("INSERT INTO geodata_terrain_fichiers (id, terrain_version_id, role, cle_stockage, empreinte, taille, format) VALUES ($1, $2, 'original', $3, $4, $5, 'GeoTIFF')",
          [newId("gdtf"), versionId, archive.cle, empreinte, taille]);
      }
      await c.query("UPDATE geodata_terrain_traitements SET etat = 'termine', progression = 100, sorties = $2, maj_le = now() WHERE id = $1",
        [traitementId, JSON.stringify({ versionId, etat: verdict.etat, cleStockage: archive?.cle ?? null })]);
      await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.import', $2, $3, $4)",
        [opts.deposePar, versionId, verdict.etat === "rejete" ? "refus" : "succes", JSON.stringify({ cle: d.cle, etat: verdict.etat, motifs: verdict.motifs.map((m) => m.code) })]);
    });
    if (archive) await stockage.retirerDuDepot(d.fichier.nom);
    return { versionId, etat: verdict.etat, motifs: verdict.motifs, empreinte, deja: false, traitementId };
  } catch (e) {
    const motif = (e as Error).message || String(e);
    await c.query("UPDATE geodata_terrain_traitements SET etat = 'echec', motif_echec = $2, maj_le = now() WHERE id = $1", [traitementId, motif.slice(0, 2000)]).catch(() => undefined);
    throw e;
  }
}

/**
 * Levée de quarantaine (TER-D13) par un responsable de publication : décision consignée (référence verticale déclarée
 * avec sa source, motif). La version passe « prête au traitement » ; la décision reste dans les événements.
 */
export async function leverQuarantaine(c: PoolClient, versionId: string, decision: DecisionLevee, par: string): Promise<ReferenceVerticale> {
  return transaction(c, async () => {
    const [v] = (await c.query<{ etat: EtatTerrain; motifs: Motif[]; reference_verticale: ReferenceVerticale }>("SELECT etat, motifs, reference_verticale FROM geodata_terrain_versions WHERE id = $1 FOR UPDATE", [versionId])).rows;
    if (!v) throw new ImportRefuse("Version de terrain introuvable.");
    if (v.etat !== "quarantaine") throw new ImportRefuse(`Version en état « ${v.etat} » : seule une quarantaine se lève.`);
    const erreurs = controlerLevee(v.motifs, decision);
    if (erreurs.length) throw new ImportRefuse(erreurs.join(" "));
    const reference: ReferenceVerticale = decision.referenceVerticale
      ? { statut: "declaree", code: decision.referenceVerticale.code, libelle: decision.referenceVerticale.libelle, origine: "decision", source: decision.referenceVerticale.source }
      : v.reference_verticale;
    await changerEtat(c, versionId, "quarantaine", "traitement", par, null, decision.motif, decision, reference);
    await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.quarantaine.levee', $2, 'succes', $3)",
      [par, versionId, JSON.stringify({ motifs: v.motifs.map((m) => m.code) })]);
    return reference;
  });
}

/**
 * Import d'une version **distante** (fond mondial, TER-09) : rien n'est téléchargé ni déposé. L'en-tête de la source (adresse
 * unique, ou dalle de référence d'un modèle à dalles) est lu **à la source** par plages HTTP (liste fermée de la fiche,
 * aucune redirection, budget), contrôlé contre la fiche comme un fichier déposé (repère, pas, NoData, référence verticale :
 * quarantaine si inconnue), et l'épinglage (ETag, Last-Modified, taille, empreinte du premier bloc) devient l'empreinte de
 * la version. Même cycle de vie ensuite : levée de quarantaine, traitement, revue, publication, retour arrière.
 */
export async function importerTerrainDistant(
  c: PoolClient, d: DeclarationTerrain, opts: { readonly deposePar: string | null; readonly transport?: Transport | undefined },
): Promise<ResultatImport> {
  const a = d.acquisition;
  if (a.methode !== "distant") throw new ImportRefuse("Fiche non distante : importer le fichier déposé.");
  const url = adresseDistante(a, a.dalleReference);
  if (!url) throw new ImportRefuse("Adresse de référence hors de l'emprise déclarée.");
  const client = new ClientOrigine(url, sourcesDistantes([d]), new CompteurBudget(BUDGET_DISTANT_DEFAUT), opts.transport);
  let entete: EnTeteRaster;
  try {
    const tiff = await fromCustomClient(client, { blockSize: 256 * 1024, cacheSize: 16 } as Parameters<typeof fromCustomClient>[1]);
    entete = await enTeteDe(tiff);
  } catch (e) {
    throw new ImportRefuse(`En-tête distant illisible : ${e instanceof ErreurDistante ? e.message : (e as Error).message}. Rien n'est importé.`);
  }
  if (!client.epinglage || !client.premierBloc) throw new ImportRefuse("Source distante sans épinglage (ETag, taille) : rien n'est importé.");
  const ep = client.epinglage;
  const empreinte = createHash("sha256").update(JSON.stringify({ url, etag: ep.etag, lastModified: ep.lastModified, taille: ep.taille, premierBloc: createHash("sha256").update(client.premierBloc).digest("hex") })).digest("hex");
  // Un modèle à dalles couvre l'emprise déclarée : l'en-tête garde le pas et les clés de la dalle de référence.
  const enteteVersion: EnTeteRaster = a.dalles === null ? entete : {
    ...entete, bornes: [a.emprise.ouest, a.emprise.sud, a.emprise.est, a.emprise.nord],
    largeur: Math.round((a.emprise.est - a.emprise.ouest) / entete.pas[0]), hauteur: Math.round((a.emprise.nord - a.emprise.sud) / entete.pas[1]),
  };
  if (a.dalles !== null) {
    const [o, s, e, n] = empriseDalle(a.dalleReference!);
    if (Math.abs(entete.bornes[0] - o) > entete.pas[0] || Math.abs(entete.bornes[3] - n) > entete.pas[1] || Math.abs(entete.bornes[2] - e) > entete.pas[0] || Math.abs(entete.bornes[1] - s) > entete.pas[1]) {
      throw new ImportRefuse(`Dalle de référence ${a.dalleReference} : emprise lue ${entete.bornes.join(", ")} différente de la dalle attendue. Rien n'est importé.`);
    }
  }
  // Aucune grille n'est importée : la limite de cellules d'un fichier déposé ne s'applique pas (lecture à la demande bornée).
  const verdict = controlerTerrain(enteteVersion, d, { cellules: Number.MAX_SAFE_INTEGER });
  const cle = sha256(texteIdempotence("import-distant", [empreinte], d));
  const deja = await dejaImporte(c, cle, empreinte);
  if (deja) return deja;
  const verrou = BigInt.asIntN(64, BigInt(`0x${cle.slice(0, 16)}`)).toString();
  await c.query("SELECT pg_advisory_lock($1::bigint)", [verrou]);
  try {
    const encore = await dejaImporte(c, cle, empreinte);
    if (encore) return encore;
    const [{ id: traitementId }] = (await c.query<{ id: string }>(
      `INSERT INTO geodata_terrain_traitements (id, cle_idempotence, type, entrees, parametres, logiciels, etat, demande_par)
       VALUES ($1, $2, 'import', $3, $4, $5, 'en_cours', $6)
       ON CONFLICT (cle_idempotence) DO UPDATE SET etat = 'en_cours', tentatives = geodata_terrain_traitements.tentatives + 1, progression = 0, motif_echec = NULL, maj_le = now()
       RETURNING id`,
      [newId("gdtt"), cle, JSON.stringify([{ url, ...ep }]), JSON.stringify({ fiche: d.cle, version: d.version.libelle, distant: true }), JSON.stringify({ node: process.version, lecteur: "geotiff (plages HTTP)" }), opts.deposePar],
    )).rows as [{ id: string }];
    const versionId = newId("gdtv");
    await transaction(c, async () => {
      await c.query(
        `INSERT INTO geodata_terrain_versions (id, cle, niveau, produit, etat, declaration, empreinte, taille, entete, crs_horizontal,
           reference_verticale, nodata, cellules, synthetique, demonstration, etiquette, depose_par, cle_idempotence)
         VALUES ($1, $2, $3, $4, 'depose', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [versionId, d.cle, d.niveau, d.produit, JSON.stringify(d), empreinte, ep.taille, JSON.stringify(enteteVersion), enteteVersion.crsHorizontal,
          JSON.stringify(verdict.referenceVerticale), verdict.nodata, verdict.cellules, d.synthetique, d.demonstration, d.etiquette, opts.deposePar, cle],
      );
      await evenement(c, versionId, null, "depose", opts.deposePar, `Source distante lue à la demande : ${url} (ETag ${ep.etag ?? "absent"}, ${ep.taille} octets) ; aucun fichier copié.`);
      await changerEtat(c, versionId, "depose", "validation", opts.deposePar, null);
      await changerEtat(c, versionId, "validation", verdict.etat, opts.deposePar, verdict.motifs, verdict.motifs.map((m) => m.message).join(" ") || null);
      await c.query(
        `INSERT INTO geodata_terrain_sources_distantes (terrain_version_id, url, dalle, etag, last_modified, taille, empreinte_entete) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [versionId, url, a.dalleReference, ep.etag, ep.lastModified, ep.taille, createHash("sha256").update(client.premierBloc!).digest("hex")]);
      await c.query("UPDATE geodata_terrain_traitements SET etat = 'termine', progression = 100, sorties = $2, maj_le = now() WHERE id = $1",
        [traitementId, JSON.stringify({ versionId, etat: verdict.etat, distant: true })]);
      await c.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'terrain.import', $2, $3, $4)",
        [opts.deposePar, versionId, verdict.etat === "rejete" ? "refus" : "succes", JSON.stringify({ cle: d.cle, etat: verdict.etat, distant: true, motifs: verdict.motifs.map((m) => m.code) })]);
    });
    return { versionId, etat: verdict.etat, motifs: verdict.motifs, empreinte, deja: false, traitementId };
  } finally {
    await c.query("SELECT pg_advisory_unlock($1::bigint)", [verrou]).catch(() => undefined);
  }
}
