/**
 * Chaîne des observations d'annonces (Concept Prix v1.1 §4 et §7, Plan §5, lots P3 à P6) : archive → mise en attente →
 * validation (quarantaine) → normalisation → rattachement territorial → dédoublonnage → instantané candidat → publication
 * atomique → retour arrière. Chaque transition consigne ses entrées, ses effectifs et ses motifs ; un même fichier
 * réimporté ne crée rien (PRX02) ; une même entrée et une même méthode redonnent le même instantané (PRX12).
 *
 * Règles :
 * - seule une source du registre (`geodata_prix_sources`) au produit `observations` et au statut `active` (ou
 *   `autorisee`) est importée ; sinon le refus cite le motif de blocage enregistré (aujourd'hui, aucune source réelle
 *   d'observations n'est autorisée : la chaîne est livrée vide, éprouvée sur des jeux synthétiques de test) ;
 * - le rattachement lit la hiérarchie administrative en base (`geodata_entites_administratives` et ses niveaux) ;
 *   il n'est jamais plus fin que la précision déclarée par la source (PRX06) ;
 * - la publication compare le pointeur courant à celui attendu par l'appelant : périmé ou concurrent → conflit (409),
 *   consigné, l'instantané précédent reste servi (PRX11) ; le retour arrière resélectionne un instantané validé sans
 *   rien effacer (PRX14) ; la suspension d'une source retire les publications construites avec elle (PRX13).
 * Toutes les fonctions reçoivent l'exécuteur de l'appelant (transaction comprise) : ce module n'ouvre aucun pool.
 */
import { createHash } from "node:crypto";
import {
  chercherCandidatsDoublons, cleAnnonce, construireBiens, construireCellules, dedoublonnerExact, estBaseSurface, estDateIso,
  estPeriodePrix, estTransactionPrix, estTypeBien, lireCsv, parserMontant, rattacherLocalite, trierObservations, versCentimes,
  type BaseSurface, type DecisionDoublon, type EtatBien, type ObservationAnnonce, type ResultatRattachement, type TerritoireCandidat,
} from "@parcours/geodata-model";
import type { Executeur } from "../archive-fichiers.js";
import { newId } from "../../ids.js";

/** Version de l'analyseur des fichiers d'observations (entre dans la clé d'idempotence). */
export const VERSION_ANALYSEUR_PRIX = "prix-observations-1";
/** Version de la méthode des cellules (consignée dans chaque manifeste). */
export const VERSION_METHODE_PRIX = "prix-methode-1";
/** Paramètres de départ du pilote (Concept §4) : fenêtre de 90 jours, seuil de 20 biens distincts, versionnés. */
export const PARAMETRES_PILOTE = Object.freeze({ fenetreJours: 90, seuil: 20 });
/** Bornes d'un fichier d'observations reçu. */
export const LIMITES_IMPORT_PRIX = Object.freeze({ octets: 10 * 1024 * 1024, lignes: 50_000 });

/** Colonnes documentées d'un fichier d'observations (CSV avec en-tête, ou JSON : liste d'objets de mêmes clés). */
export const COLONNES_OBSERVATIONS = [
  "annonce_id", "observe_le", "transaction", "type_bien", "etat_bien", "prix", "monnaie", "periode", "surface", "base_surface",
  "localite", "precision", "empreinte",
] as const;
/** Colonnes obligatoires (les autres peuvent manquer : état non précisé, précision inconnue, empreinte absente). */
export const COLONNES_OBLIGATOIRES = ["annonce_id", "observe_le", "transaction", "type_bien", "prix", "monnaie", "periode", "surface", "base_surface", "localite"] as const;

export const sourceAutorisee = (statut: string | null | undefined): boolean => statut === "active" || statut === "autorisee";

/** Erreur métier de la chaîne des prix : statut HTTP, code stable, message, détails. */
export class ErreurPrix extends Error {
  constructor(readonly statut: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
}

// ——— Lecture et normalisation ———

/** Lit un fichier d'observations (CSV ou JSON) en lignes de texte ; refuse un format illisible ou incomplet. */
export function lireFichierObservations(contenu: string, format: "csv" | "json"): Record<string, string>[] {
  let lignes: Record<string, string>[];
  if (format === "csv") lignes = lireCsv(contenu);
  else {
    let brut: unknown;
    try { brut = JSON.parse(contenu); } catch { throw new ErreurPrix(400, "format_illisible", "Le fichier n'est pas un JSON valide."); }
    if (!Array.isArray(brut) || !brut.every((x) => x && typeof x === "object" && !Array.isArray(x))) throw new ErreurPrix(400, "format_illisible", "Liste d'objets attendue.");
    // Valeurs ramenées en texte : la normalisation est la même pour les deux formats ; null et absent = vide.
    lignes = (brut as Record<string, unknown>[]).map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.trim(), v === null || v === undefined ? "" : String(v).trim()])));
  }
  if (!lignes.length) throw new ErreurPrix(400, "fichier_vide", "Aucune ligne d'observation.");
  if (lignes.length > LIMITES_IMPORT_PRIX.lignes) throw new ErreurPrix(413, "limite_depassee", `${lignes.length} lignes : ${LIMITES_IMPORT_PRIX.lignes} au plus.`);
  const presentes = new Set(lignes.flatMap((l) => Object.keys(l)));
  const manquantes = COLONNES_OBLIGATOIRES.filter((c) => !presentes.has(c));
  if (manquantes.length) throw new ErreurPrix(400, "colonnes_manquantes", `Colonne(s) manquante(s) : ${manquantes.join(", ")}.`, { colonnes: manquantes });
  return lignes;
}

/** Nombre décimal d'un texte (« 1250000 », « 82,5 », « -3 ») ; montants convertis par centimes (sans flottant) ; null si illisible. */
function lireNombre(t: string): number | null {
  const s = t.replace(/[\s  ]/g, "").replace(",", ".");
  if (!s) return null;
  const negatif = s.startsWith("-");
  const c = versCentimes(negatif ? s.slice(1) : s);
  if (c !== null) return (negatif ? -c : c) / 100;
  const m = parserMontant(t);
  return m.valeur;
}

export interface LigneNormalisee {
  readonly ligne: number;
  readonly observation: ObservationAnnonce;
  readonly prixOriginal: string;
  readonly surfaceOriginale: string;
  /** Niveau administratif le plus fin connu de la source pour cette localité (`commune`, `arrondissement`…), ou null. */
  readonly precision: string | null;
  /** Avertissements non bloquants (ex. état du bien inconnu, ramené à « non précisé »). */
  readonly avertissements: readonly string[];
}

/** Normalise une ligne lue (montants décimaux, codes canoniques) ; la validation décide ensuite de l'admission. */
export function normaliserLigne(l: Readonly<Record<string, string>>, source: string, ligne: number): LigneNormalisee {
  const v = (k: string) => (l[k] ?? "").trim();
  const avertissements: string[] = [];
  const tr = v("transaction").toLowerCase();
  const ty = v("type_bien").toLowerCase();
  const et = v("etat_bien").toLowerCase().replace("é", "e");
  let etat: EtatBien = null;
  if (et === "ancien" || et === "recent" || et === "neuf") etat = et;
  else if (et) avertissements.push("etat-bien-inconnu");
  const pe = v("periode").toLowerCase();
  const base = v("base_surface").toLowerCase();
  const observation: ObservationAnnonce = {
    source,
    idAnnonce: v("annonce_id"),
    dateObservation: v("observe_le"),
    transaction: estTransactionPrix(tr) ? tr : null,
    typeBien: estTypeBien(ty) ? ty : null,
    etat,
    prix: lireNombre(v("prix")),
    monnaie: v("monnaie") ? v("monnaie").toUpperCase() : null,
    periode: estPeriodePrix(pe) ? pe : null,
    surface: lireNombre(v("surface")),
    // Base inconnue de la liste : gardée telle quelle pour que la validation la refuse (`base-surface-inconnue`).
    baseSurface: (estBaseSurface(base) ? base : base || "absente") as BaseSurface,
    libelleLocalite: v("localite"),
    territoire: null,
    empreinte: v("empreinte") || null,
  };
  return { ligne, observation, prixOriginal: v("prix"), surfaceOriginale: v("surface"), precision: v("precision") || null, avertissements };
}

// ——— Rattachement ———

interface CandidatsPays { readonly candidats: TerritoireCandidat[]; readonly rangs: ReadonlyMap<string, number>; readonly decoupage: string | null }

/** Territoires candidats du pays, lus dans la hiérarchie administrative en base (entités non retirées et leur rang). */
export async function lireCandidats(ex: Executeur, pays: string): Promise<CandidatsPays> {
  const niveaux = (await ex.query<{ code: string; rang: number }>("SELECT code, rang FROM geodata_niveaux_administratifs WHERE pays = $1", [pays])).rows;
  const entites = (await ex.query<{ code: string; nom: string; nom_ar: string | null; niveau: string; rang: number }>(
    `SELECT e.code, e.nom, e.nom_ar, e.niveau, n.rang FROM geodata_entites_administratives e
       JOIN geodata_niveaux_administratifs n ON n.pays = e.pays AND n.code = e.niveau
      WHERE e.pays = $1 AND e.retire_le IS NULL`, [pays],
  )).rows;
  const [d] = (await ex.query<{ empreinte: string; source: string }>("SELECT empreinte, source FROM geodata_decoupage_imports WHERE pays = $1 ORDER BY importe_le DESC, id DESC LIMIT 1", [pays])).rows;
  return {
    // Nom officiel en arabe : autre libellé publié de la même entité (jamais une correspondance devinée).
    candidats: entites.map((e) => ({ code: e.code, nom: e.nom, niveau: e.niveau, rang: Number(e.rang), ...(e.nom_ar ? { alias: [e.nom_ar] } : {}) })),
    rangs: new Map(niveaux.map((n) => [n.code, Number(n.rang)])),
    decoupage: d ? `${d.source} (${d.empreinte.slice(0, 12)})` : null,
  };
}

export type RattachementCalcule = ResultatRattachement | { readonly resultat: "non-rattache"; readonly motif: "precision-inconnue" };

/** Rattache une localité au plus à la précision déclarée ; précision absente ou inconnue en base → non rattachée. */
export function rattacher(libelle: string, precision: string | null, c: CandidatsPays): RattachementCalcule {
  const rang = precision ? c.rangs.get(precision) : undefined;
  if (rang === undefined) return { resultat: "non-rattache", motif: "precision-inconnue" };
  return rattacherLocalite(libelle, c.candidats, rang);
}

// ——— Import d'un fichier ———

export interface DemandeImport {
  readonly source: string;
  readonly pays: string;
  readonly edition: { readonly libelle: string; readonly dateDebut: string | null; readonly dateFin: string | null; readonly url: string | null };
  readonly format: "csv" | "json";
  readonly contenu: string;
  readonly acteur: string | null;
}

export interface RapportImport {
  readonly cleIdempotence: string;
  readonly empreinte: string;
  readonly versionAnalyseur: string;
  readonly lignesLues: number;
  readonly admises: number;
  readonly quarantaine: number;
  readonly parMotif: Readonly<Record<string, number>>;
  readonly dejaPresentes: number;
  readonly doublonsDansLeFichier: number;
  readonly conflits: readonly string[];
  readonly rattachees: number;
  readonly nonRattachees: Readonly<Record<string, number>>;
  readonly avertissements: Readonly<Record<string, number>>;
  /** Premières lignes refusées (ligne, identifiant, motifs) — jamais de donnée personnelle (colonnes documentées seules). */
  readonly exemplesQuarantaine: readonly { readonly ligne: number; readonly annonceId: string | null; readonly motifs: readonly string[] }[];
}

/** Clé d'idempotence d'un lot : SHA-256 du fichier, version de l'analyseur, source. */
export const cleIdempotence = (empreinte: string, source: string) => `${empreinte}.${VERSION_ANALYSEUR_PRIX}.${source}`;

/** Source du registre autorisée pour un produit, sinon refus avec le motif de blocage enregistré. */
export async function exigerSource(ex: Executeur, cle: string, produit: string): Promise<{ cle: string; statut: string }> {
  const [s] = (await ex.query<{ cle: string; statut: string; produit: string; motif: string | null; prochaine_action: string | null }>(
    "SELECT cle, statut, produit, motif, prochaine_action FROM geodata_prix_sources WHERE cle = $1", [cle],
  )).rows;
  if (!s) throw new ErreurPrix(404, "source_inconnue", "Source absente du registre des sources de prix.");
  if (s.produit !== produit) throw new ErreurPrix(409, "produit_incompatible", `La source « ${cle} » fournit le produit « ${s.produit} », pas « ${produit} ».`, { produit: s.produit });
  if (!sourceAutorisee(s.statut)) {
    throw new ErreurPrix(409, "source_non_autorisee", s.motif ?? `Source au statut « ${s.statut} » : import refusé.`, { statut: s.statut, motif: s.motif, prochaineAction: s.prochaine_action });
  }
  return { cle: s.cle, statut: s.statut };
}

interface Analyse {
  readonly rapport: RapportImport;
  readonly admises: readonly { readonly n: LigneNormalisee; readonly r: RattachementCalcule }[];
  readonly quarantaine: readonly { readonly n: LigneNormalisee; readonly motifs: readonly string[] }[];
  readonly decoupage: string | null;
}

/** Analyse complète d'un fichier, sans écriture (aperçu) : lecture, normalisation, validation, rattachement. */
export async function analyserImport(ex: Executeur, d: DemandeImport): Promise<Analyse> {
  const empreinte = createHash("sha256").update(d.contenu, "utf8").digest("hex");
  const lues = lireFichierObservations(d.contenu, d.format);
  const normalisees = lues.map((l, i) => normaliserLigne(l, d.source, i + 1));
  const tri = trierObservations(normalisees.map((n) => n.observation));
  const parObs = new Map(normalisees.map((n) => [n.observation, n]));
  const quarantaine = tri.quarantaine.map((q) => ({ n: parObs.get(q.observation)!, motifs: q.motifs }));
  // Doublons exacts dans le fichier : une seule observation par (source, annonce, date) ; conflits signalés.
  const dedup = dedoublonnerExact(tri.admises);
  const retenues = new Set(dedup.observations);
  const admisesN = tri.admises.filter((o) => retenues.has(o)).map((o) => parObs.get(o)!);
  const cles = admisesN.map((n) => [n.observation.idAnnonce, n.observation.dateObservation] as const);
  const existantes = cles.length ? (await ex.query<{ n: string }>(
    `SELECT count(*) AS n FROM geodata_prix_observations o JOIN jsonb_to_recordset($2::jsonb) AS e(a text, d text) ON o.annonce_id = e.a AND o.observe_le = e.d::date
      WHERE o.source_cle = $1`, [d.source, JSON.stringify(cles.map(([a, dt]) => ({ a, d: dt })))],
  )).rows : [];
  const c = await lireCandidats(ex, d.pays);
  const admises = admisesN.map((n) => ({ n, r: rattacher(n.observation.libelleLocalite, n.precision, c) }));
  const nonRattachees: Record<string, number> = {};
  for (const a of admises) if (a.r.resultat !== "exact") { const k = a.r.resultat === "ambigu" ? "ambigu" : a.r.motif; nonRattachees[k] = (nonRattachees[k] ?? 0) + 1; }
  const avertissements: Record<string, number> = {};
  for (const n of normalisees) for (const a of n.avertissements) avertissements[a] = (avertissements[a] ?? 0) + 1;
  return {
    rapport: {
      cleIdempotence: cleIdempotence(empreinte, d.source), empreinte, versionAnalyseur: VERSION_ANALYSEUR_PRIX,
      lignesLues: lues.length, admises: admises.length, quarantaine: quarantaine.length, parMotif: tri.parMotif as Record<string, number>,
      dejaPresentes: Number(existantes[0]?.n ?? 0), doublonsDansLeFichier: tri.admises.length - dedup.observations.length, conflits: dedup.conflits,
      rattachees: admises.filter((a) => a.r.resultat === "exact").length, nonRattachees, avertissements,
      exemplesQuarantaine: quarantaine.slice(0, 50).map((q) => ({ ligne: q.n.ligne, annonceId: q.n.observation.idAnnonce || null, motifs: q.motifs })),
    },
    admises, quarantaine, decoupage: c.decoupage,
  };
}

/** Colonnes documentées d'une ligne en quarantaine (aucune autre colonne du fichier n'est conservée). */
const donneesQuarantaine = (n: LigneNormalisee) => ({
  annonce_id: n.observation.idAnnonce, observe_le: n.observation.dateObservation, transaction: n.observation.transaction, type_bien: n.observation.typeBien,
  prix: n.prixOriginal, monnaie: n.observation.monnaie, periode: n.observation.periode, surface: n.surfaceOriginale, base_surface: n.observation.baseSurface,
  localite: n.observation.libelleLocalite, precision: n.precision,
});

export interface ResultatImport { readonly deja: boolean; readonly lotId: string; readonly editionId: string; readonly rapport: RapportImport | null; readonly nouvelles: number }

/**
 * Import validé d'un fichier (dans la transaction de l'appelant) : archive du fichier tel quel, édition, lot, observations
 * admises (nouvelles seulement), rattachements, quarantaine. Même clé d'idempotence → lot existant rendu, rien d'écrit.
 */
export async function importerObservations(ex: Executeur, d: DemandeImport, cleAttendue: string | null): Promise<ResultatImport> {
  await exigerSource(ex, d.source, "observations");
  const empreinte = createHash("sha256").update(d.contenu, "utf8").digest("hex");
  const cle = cleIdempotence(empreinte, d.source);
  if (cleAttendue !== null && cleAttendue !== cle) throw new ErreurPrix(409, "cle_idempotence_differente", "Le fichier ne correspond pas à l'aperçu validé (clé d'idempotence différente).", { attendue: cleAttendue, calculee: cle });
  // Verrou par clé : deux validations simultanées du même fichier n'en écrivent qu'une.
  await ex.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`geodata_prix_lot:${cle}`]);
  const [deja] = (await ex.query<{ id: string; edition_id: string; nouvelles: number }>("SELECT id, edition_id, nouvelles FROM geodata_prix_lots WHERE cle_idempotence = $1", [cle])).rows;
  if (deja) return { deja: true, lotId: deja.id, editionId: deja.edition_id, rapport: null, nouvelles: 0 };
  const a = await analyserImport(ex, d);
  const chemin = `imports-prix/${empreinte}.${d.format}`;
  const octets = Buffer.from(d.contenu, "utf8");
  await ex.query(
    `INSERT INTO geodata_fichiers (chemin, role, source_cle, type_media, taille, empreinte, contenu) VALUES ($1, 'import-prix', $2, $3, $4, $5, $6) ON CONFLICT (chemin) DO NOTHING`,
    [chemin, d.source, d.format === "csv" ? "text/csv" : "application/json", octets.length, empreinte, octets],
  );
  await ex.query(
    `INSERT INTO geodata_prix_editions (id, source_cle, couche, produit, libelle, date_debut, date_fin, url_origine, validite, cree_par)
     VALUES ($1, $2, 'annonces', 'observations', $3, $4, $5, $6, NULL, $7) ON CONFLICT (source_cle, libelle) DO NOTHING`,
    [newId("gdped"), d.source, d.edition.libelle, d.edition.dateDebut, d.edition.dateFin, d.edition.url, d.acteur],
  );
  const [ed] = (await ex.query<{ id: string; etat: string }>("SELECT id, etat FROM geodata_prix_editions WHERE source_cle = $1 AND libelle = $2", [d.source, d.edition.libelle])).rows;
  if (ed!.etat !== "active") throw new ErreurPrix(409, "edition_non_active", `Édition « ${d.edition.libelle} » ${ed!.etat} : aucun import.`);
  const lotId = newId("gdplt");
  await ex.query(
    `INSERT INTO geodata_prix_lots (id, edition_id, source_cle, cle_idempotence, empreinte, version_analyseur, format, fichier_chemin, etat, lignes_lues, admises, quarantaine, erreurs, cree_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'valide', $9, $10, $11, $12, $13)`,
    [lotId, ed!.id, d.source, cle, empreinte, VERSION_ANALYSEUR_PRIX, d.format, chemin, a.rapport.lignesLues, a.rapport.admises, a.rapport.quarantaine,
      JSON.stringify({ parMotif: a.rapport.parMotif, conflits: a.rapport.conflits, avertissements: a.rapport.avertissements, nonRattachees: a.rapport.nonRattachees }), d.acteur],
  );
  let nouvelles = 0, rattachees = 0;
  for (let i = 0; i < a.admises.length; i += 1000) {
    const tranche = a.admises.slice(i, i + 1000);
    const ins = (await ex.query<{ id: string; annonce_id: string; observe_le: string }>(
      `INSERT INTO geodata_prix_observations (lot_id, source_cle, annonce_id, observe_le, transaction, type_bien, etat_bien, prix_original, prix, monnaie, periode,
         surface_originale, surface, base_surface, libelle_localite, precision_niveau, empreinte_contenu)
       SELECT $1, $2, e.annonce_id, e.observe_le::date, e.transaction, e.type_bien, e.etat_bien, e.prix_original, e.prix::numeric, e.monnaie, e.periode,
         e.surface_originale, e.surface::numeric, e.base_surface, e.localite, e.precision, e.empreinte
         FROM jsonb_to_recordset($3::jsonb) AS e(annonce_id text, observe_le text, transaction text, type_bien text, etat_bien text, prix_original text, prix text,
              monnaie text, periode text, surface_originale text, surface text, base_surface text, localite text, precision text, empreinte text)
       ON CONFLICT (source_cle, annonce_id, observe_le) DO NOTHING
       RETURNING id, annonce_id, to_char(observe_le, 'YYYY-MM-DD') AS observe_le`,
      [lotId, d.source, JSON.stringify(tranche.map(({ n }) => ({
        annonce_id: n.observation.idAnnonce, observe_le: n.observation.dateObservation, transaction: n.observation.transaction, type_bien: n.observation.typeBien,
        etat_bien: n.observation.etat, prix_original: n.prixOriginal, prix: String(n.observation.prix), monnaie: n.observation.monnaie, periode: n.observation.periode,
        surface_originale: n.surfaceOriginale, surface: String(n.observation.surface), base_surface: n.observation.baseSurface, localite: n.observation.libelleLocalite,
        precision: n.precision, empreinte: n.observation.empreinte ?? null,
      })))],
    )).rows;
    nouvelles += ins.length;
    const parCle = new Map(tranche.map((x) => [`${x.n.observation.idAnnonce}|${x.n.observation.dateObservation}`, x.r]));
    const lignes = ins.map((o) => {
      const r = parCle.get(`${o.annonce_id}|${o.observe_le}`)!;
      if (r.resultat === "exact") rattachees++;
      return {
        id: Number(o.id), resultat: r.resultat,
        code: r.resultat === "exact" ? r.territoire.code : null, niveau: r.resultat === "exact" ? r.territoire.niveau : null,
        methode: r.resultat === "exact" ? r.methode : null, motif: r.resultat === "non-rattache" ? r.motif : null,
        candidats: r.resultat === "ambigu" ? r.candidats.map((x) => ({ code: x.code, niveau: x.niveau, nom: x.nom })) : [],
        revue: r.resultat === "exact" ? "automatique" : "a-revoir",
      };
    });
    if (lignes.length) {
      await ex.query(
        `INSERT INTO geodata_prix_rattachements (observation_id, resultat, pays, territoire_code, territoire_niveau, methode, motif, candidats, decoupage, revue)
         SELECT e.id, e.resultat, $2, e.code, e.niveau, e.methode, e.motif, e.candidats, $3, e.revue
           FROM jsonb_to_recordset($1::jsonb) AS e(id bigint, resultat text, code text, niveau text, methode text, motif text, candidats jsonb, revue text)`,
        [JSON.stringify(lignes), d.pays, a.decoupage],
      );
    }
  }
  for (let i = 0; i < a.quarantaine.length; i += 1000) {
    await ex.query(
      `INSERT INTO geodata_prix_quarantaine (lot_id, ligne, annonce_id, motifs, donnees)
       SELECT $1, e.ligne, e.annonce_id, e.motifs, e.donnees FROM jsonb_to_recordset($2::jsonb) AS e(ligne integer, annonce_id text, motifs text[], donnees jsonb)`,
      [lotId, JSON.stringify(a.quarantaine.slice(i, i + 1000).map((q) => ({ ligne: q.n.ligne, annonce_id: q.n.observation.idAnnonce || null, motifs: q.motifs, donnees: donneesQuarantaine(q.n) })))],
    );
  }
  await ex.query("UPDATE geodata_prix_lots SET nouvelles = $2, deja_presentes = $3, rattachees = $4 WHERE id = $1", [lotId, nouvelles, a.admises.length - nouvelles, rattachees]);
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.import', $2, 'succes', $3)",
    [d.acteur, lotId, JSON.stringify({ source: d.source, lignes: a.rapport.lignesLues, admises: a.rapport.admises, quarantaine: a.rapport.quarantaine, nouvelles })]);
  return { deja: false, lotId, editionId: ed!.id, rapport: a.rapport, nouvelles };
}

// ——— Instantanés ———

export interface DemandeInstantane {
  readonly dateReference: string;
  readonly fenetreJours?: number;
  readonly seuil?: number;
  readonly ventilerParEtat?: boolean;
  readonly acteur: string | null;
}

export interface InstantaneConstruit { readonly id: string; readonly empreinte: string; readonly deja: boolean; readonly cellules: number; readonly rapport: Record<string, unknown> }

/** Observations admises des lots valides des sources autorisées, avec leur rattachement exact (sinon territoire nul). */
async function lireEntrees(ex: Executeur) {
  const lignes = (await ex.query<Record<string, string | null>>(
    `SELECT o.source_cle, o.annonce_id, to_char(o.observe_le, 'YYYY-MM-DD') AS observe_le, o.transaction, o.type_bien, o.etat_bien, o.prix::text AS prix,
            o.monnaie, o.periode, o.surface::text AS surface, o.base_surface, o.libelle_localite, o.empreinte_contenu, o.lot_id,
            r.territoire_code, r.territoire_niveau, r.decoupage
       FROM geodata_prix_observations o
       JOIN geodata_prix_lots l ON l.id = o.lot_id AND l.etat = 'valide'
       JOIN geodata_prix_editions e ON e.id = l.edition_id AND e.etat = 'active'
       JOIN geodata_prix_sources s ON s.cle = o.source_cle AND s.produit = 'observations' AND s.statut IN ('active', 'autorisee')
       LEFT JOIN geodata_prix_rattachements r ON r.observation_id = o.id AND r.resultat = 'exact'
      ORDER BY o.source_cle, o.annonce_id, o.observe_le`,
  )).rows;
  const observations: ObservationAnnonce[] = lignes.map((l) => ({
    source: l["source_cle"]!, idAnnonce: l["annonce_id"]!, dateObservation: l["observe_le"]!,
    transaction: l["transaction"] as ObservationAnnonce["transaction"], typeBien: l["type_bien"] as ObservationAnnonce["typeBien"], etat: (l["etat_bien"] ?? null) as EtatBien,
    prix: Number(l["prix"]), monnaie: l["monnaie"] ?? null, periode: l["periode"] as ObservationAnnonce["periode"], surface: Number(l["surface"]),
    baseSurface: l["base_surface"] as BaseSurface, libelleLocalite: l["libelle_localite"]!,
    territoire: l["territoire_code"] ? { code: l["territoire_code"], niveau: l["territoire_niveau"]! } : null,
    empreinte: l["empreinte_contenu"] ?? null,
  }));
  return {
    observations,
    sources: [...new Set(lignes.map((l) => l["source_cle"]!))].sort(),
    lots: [...new Set(lignes.map((l) => l["lot_id"]!))].sort(),
    decoupage: [...new Set(lignes.map((l) => l["decoupage"]).filter((x): x is string => !!x))].sort().join(" ; ") || null,
  };
}

/**
 * Construit un instantané candidat : biens (candidats de doublons + décisions revues rejouées), cellules (type 7,
 * seuil, fenêtre), manifeste et empreinte reproductibles. Même empreinte qu'un instantané existant → celui-ci est rendu
 * (aucun doublon, PRX12). L'instantané et son contenu sont immuables.
 */
export async function construireInstantane(ex: Executeur, d: DemandeInstantane): Promise<InstantaneConstruit> {
  if (!estDateIso(d.dateReference)) throw new ErreurPrix(400, "invalid_input", "Date de référence attendue (AAAA-MM-JJ).", { champs: ["dateReference"] });
  const fenetreJours = d.fenetreJours ?? PARAMETRES_PILOTE.fenetreJours;
  const seuil = d.seuil ?? PARAMETRES_PILOTE.seuil;
  if (!Number.isInteger(fenetreJours) || fenetreJours < 1 || fenetreJours > 3660) throw new ErreurPrix(400, "invalid_input", "Fenêtre de 1 à 3 660 jours.", { champs: ["fenetreJours"] });
  if (!Number.isInteger(seuil) || seuil < 1 || seuil > 10_000) throw new ErreurPrix(400, "invalid_input", "Seuil de 1 à 10 000 biens.", { champs: ["seuil"] });
  // Une construction à la fois : deux demandes simultanées des mêmes entrées n'écrivent qu'un instantané.
  await ex.query("SELECT pg_advisory_xact_lock(hashtext('geodata_prix_instantane'))");
  const e = await lireEntrees(ex);
  if (!e.observations.length) throw new ErreurPrix(409, "aucune_observation", "Aucune observation admise d'une source autorisée : rien à construire.");
  const decisions: DecisionDoublon[] = (await ex.query<{ a: string; b: string; decision: "fusion" | "separation"; le: string; auteur: string | null; motif: string }>(
    `SELECT annonce_a AS a, annonce_b AS b, decision, to_char(decide_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS le, auteur_id AS auteur, motif
       FROM geodata_prix_decisions_doublons ORDER BY decide_le, id`,
  )).rows.map((x) => ({ a: x.a, b: x.b, decision: x.decision, date: x.le, auteur: x.auteur ?? "", motif: x.motif }));
  const candidats = chercherCandidatsDoublons(e.observations);
  const annonces = [...new Set(e.observations.map(cleAnnonce))];
  const biens = construireBiens(annonces, candidats, decisions);
  const r = construireCellules(e.observations, biens.biens, {
    fenetreJours, seuil, versionMethode: VERSION_METHODE_PRIX, dateReference: d.dateReference, ventilerParEtat: d.ventilerParEtat ?? false,
  });
  const [existant] = (await ex.query<{ id: string }>("SELECT id FROM geodata_prix_instantanes WHERE empreinte = $1", [r.empreinte])).rows;
  const rapport = {
    totaux: r.totaux, cellules: r.cellules.length, disponibles: r.cellules.filter((c) => c.etatDonnee === "disponible").length,
    biensMultiples: biens.biens.filter((b) => b.annonces.length > 1).length,
    aRevoir: biens.aRevoir.map((c) => ({ a: c.a, b: c.b, signaux: c.signaux, regle: c.regle })),
    liensRefuses: biens.liensRefuses,
  };
  if (existant) return { id: existant.id, empreinte: r.empreinte, deja: true, cellules: r.cellules.length, rapport };
  const id = newId("gdpin");
  const parametres = { fenetreJours, seuil, dateReference: d.dateReference, ventilerParEtat: d.ventilerParEtat ?? false };
  await ex.query(
    `INSERT INTO geodata_prix_instantanes (id, couche, produit, empreinte, empreinte_manifeste, manifeste, methode_version, parametres, sources, lots, decoupage, rapport, cree_par)
     VALUES ($1, 'annonces', 'observations', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, r.empreinte, r.empreinteManifeste, JSON.stringify(r.manifeste), VERSION_METHODE_PRIX, JSON.stringify(parametres), e.sources, e.lots, e.decoupage, JSON.stringify(rapport), d.acteur],
  );
  for (let i = 0; i < r.cellules.length; i += 500) {
    await ex.query(
      `INSERT INTO geodata_prix_cellules (instantane_id, cle, territoire_code, niveau, transaction, type_bien, etat_bien, base_surface, periode, monnaie, unite, etat,
         mediane, q1, q3, brutes, eligibles, distinctes, exclusions, contribution_sources, atypiques, mediane_hors_atypiques, premiere_observation, derniere_observation, cles_retenues)
       SELECT $1, c.cle, c.territoire, c.niveau, c.transaction, c.type_bien, c.etat_bien, c.base, c.periode, c.monnaie, c.unite, c.etat, c.mediane::numeric, c.q1::numeric, c.q3::numeric,
         c.brutes, c.eligibles, c.distinctes, c.exclusions, c.contribution, c.atypiques, c.mha::numeric, c.premiere::date, c.derniere::date, c.cles
         FROM jsonb_to_recordset($2::jsonb) AS c(cle text, territoire text, niveau text, transaction text, type_bien text, etat_bien text, base text, periode text, monnaie text,
              unite text, etat text, mediane text, q1 text, q3 text, brutes integer, eligibles integer, distinctes integer, exclusions jsonb, contribution jsonb, atypiques integer,
              mha text, premiere text, derniere text, cles text[])`,
      [id, JSON.stringify(r.cellules.slice(i, i + 500).map((c) => ({
        cle: c.cle, territoire: c.territoire, niveau: c.niveau, transaction: c.transaction, type_bien: c.typeBien, etat_bien: c.etat, base: c.baseSurface, periode: c.periode,
        monnaie: c.monnaie, unite: c.unite, etat: c.etatDonnee, mediane: c.mediane === null ? null : String(c.mediane), q1: c.q1 === null ? null : String(c.q1),
        q3: c.q3 === null ? null : String(c.q3), brutes: c.effectifs.brutes, eligibles: c.effectifs.eligibles, distinctes: c.effectifs.distinctes, exclusions: c.exclusions,
        contribution: c.contributionParSource, atypiques: c.atypiques, mha: c.medianeHorsAtypiques === null ? null : String(c.medianeHorsAtypiques),
        premiere: c.premiereObservation, derniere: c.derniereObservation, cles: c.clesRetenues,
      })))],
    );
  }
  const multiples = biens.biens.filter((b) => b.annonces.length > 1);
  if (multiples.length) {
    await ex.query(
      `INSERT INTO geodata_prix_biens (instantane_id, bien_id, annonces, liens) SELECT $1, b.id, b.annonces, b.liens FROM jsonb_to_recordset($2::jsonb) AS b(id text, annonces text[], liens jsonb)`,
      [id, JSON.stringify(multiples.map((b) => ({ id: b.id, annonces: b.annonces, liens: b.liens })))],
    );
  }
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.instantane.construit', $2, 'succes', $3)",
    [d.acteur, id, JSON.stringify({ empreinte: r.empreinte, cellules: r.cellules.length, sources: e.sources })]);
  return { id, empreinte: r.empreinte, deja: false, cellules: r.cellules.length, rapport };
}

/** Décision revue sur une paire d'annonces (en ajout seulement) ; rejouée à la prochaine construction. */
export async function deciderDoublon(ex: Executeur, a: string, b: string, decision: "fusion" | "separation", motif: string, acteur: string): Promise<void> {
  const [x, y] = a < b ? [a, b] : [b, a];
  if (x === y) throw new ErreurPrix(400, "invalid_input", "Deux annonces distinctes attendues.", { champs: ["a", "b"] });
  await ex.query("INSERT INTO geodata_prix_decisions_doublons (annonce_a, annonce_b, decision, motif, auteur_id) VALUES ($1, $2, $3, $4, $5)", [x, y, decision, motif, acteur]);
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.doublon.decision', $2, 'succes', $3)", [acteur, `${x}~${y}`, JSON.stringify({ decision })]);
}

// ——— Publications ———

export type CouchePublication = "annonces" | "officielle";
export type ProduitPublication = "observations" | "valeurs-officielles";

export interface PublicationActive { readonly id: string; readonly instantaneId: string; readonly precedentId: string | null; readonly le: string }

export async function publicationActive(ex: Executeur, couche: CouchePublication, produit: ProduitPublication): Promise<PublicationActive | null> {
  const [p] = (await ex.query<{ id: string; instantane_id: string; precedent_id: string | null; le: string }>(
    "SELECT id::text AS id, instantane_id, precedent_id, le FROM geodata_prix_publications WHERE couche = $1 AND produit = $2 AND active", [couche, produit],
  )).rows;
  return p ? { id: p.id, instantaneId: p.instantane_id, precedentId: p.precedent_id, le: p.le } : null;
}

export interface DemandePublication {
  readonly couche: CouchePublication;
  readonly produit: ProduitPublication;
  readonly instantaneId: string;
  /** Instantané actif attendu par l'appelant (null : aucune publication active attendue). */
  readonly attendu: string | null;
  readonly motif: string;
  readonly acteur: string;
  readonly action: "publication" | "retour";
}

/**
 * Publication atomique avec comparaison du pointeur courant (verrou transactionnel par couche) : pointeur différent de
 * l'attendu → conflit 409 (journalisé par l'appelant), rien ne change. Les sources de l'instantané doivent être encore
 * autorisées. L'ancien pointeur est désactivé, le nouveau inséré ; l'instantané devient « validé ».
 */
export async function publier(ex: Executeur, d: DemandePublication): Promise<{ publicationId: string; precedentId: string | null }> {
  await ex.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`geodata_prix_publication:${d.couche}:${d.produit}`]);
  const courante = await publicationActive(ex, d.couche, d.produit);
  if ((courante?.instantaneId ?? null) !== d.attendu) {
    throw new ErreurPrix(409, "conflit_publication", "La publication courante a changé : rechargez avant de publier.", { attendu: d.attendu, actuel: courante?.instantaneId ?? null });
  }
  const [inst] = (await ex.query<{ id: string; etat: string; couche: string; produit: string; sources: string[] }>(
    "SELECT id, etat, couche, produit, sources FROM geodata_prix_instantanes WHERE id = $1 FOR UPDATE", [d.instantaneId],
  )).rows;
  if (!inst || inst.couche !== d.couche || inst.produit !== d.produit) throw new ErreurPrix(404, "not_found", "Instantané introuvable pour cette couche.");
  if (d.action === "retour" && inst.etat !== "valide") throw new ErreurPrix(409, "instantane_non_valide", "Le retour arrière ne resélectionne qu'un instantané déjà validé.");
  if (courante?.instantaneId === inst.id) throw new ErreurPrix(409, "deja_publie", "Cet instantané est déjà publié.");
  const etats = (await ex.query<{ cle: string; statut: string }>("SELECT cle, statut FROM geodata_prix_sources WHERE cle = ANY($1)", [inst.sources])).rows;
  const bloquees = inst.sources.filter((k) => !sourceAutorisee(etats.find((x) => x.cle === k)?.statut));
  if (bloquees.length) {
    throw new ErreurPrix(409, "source_non_autorisee", "Une source de cet instantané n'est plus autorisée : publication refusée.", {
      sources: bloquees.map((k) => ({ cle: k, statut: etats.find((x) => x.cle === k)?.statut ?? null })),
    });
  }
  if (courante) await ex.query("UPDATE geodata_prix_publications SET active = false, desactivee_le = clock_timestamp() WHERE id = $1", [courante.id]);
  const [p] = (await ex.query<{ id: string }>(
    `INSERT INTO geodata_prix_publications (couche, produit, action, instantane_id, precedent_id, active, approuve_par, motif, portee_droits)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8) RETURNING id::text AS id`,
    [d.couche, d.produit, d.action, inst.id, courante?.instantaneId ?? null, d.acteur, d.motif, JSON.stringify({ consultation: "agregats", observations: "restreintes", sources: inst.sources })],
  )).rows;
  if (inst.etat === "candidat") await ex.query("UPDATE geodata_prix_instantanes SET etat = 'valide' WHERE id = $1", [inst.id]);
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, $2, $3, 'succes', $4)",
    [d.acteur, d.action === "retour" ? "prix.publication.retour" : "prix.publication", inst.id, JSON.stringify({ couche: d.couche, produit: d.produit, precedent: courante?.instantaneId ?? null, motif: d.motif })]);
  return { publicationId: p!.id, precedentId: courante?.instantaneId ?? null };
}

/**
 * Retour arrière : resélectionne un instantané validé (celui demandé, sinon le dernier publié avant le pointeur courant
 * dont les sources sont encore autorisées). Rien n'est effacé : l'historique des publications garde chaque étape.
 */
export async function retourArriere(ex: Executeur, d: Omit<DemandePublication, "instantaneId" | "action"> & { readonly cible: string | null }): Promise<{ publicationId: string; instantaneId: string; precedentId: string | null }> {
  let cible = d.cible;
  if (!cible) {
    const [c] = (await ex.query<{ id: string }>(
      `SELECT i.id FROM geodata_prix_publications p JOIN geodata_prix_instantanes i ON i.id = p.instantane_id
        WHERE p.couche = $1 AND p.produit = $2 AND i.etat = 'valide' AND i.id IS DISTINCT FROM $3
          AND NOT EXISTS (SELECT 1 FROM unnest(i.sources) s LEFT JOIN geodata_prix_sources ps ON ps.cle = s WHERE ps.statut IS NULL OR ps.statut NOT IN ('active', 'autorisee'))
        ORDER BY p.le DESC, p.id DESC LIMIT 1`,
      [d.couche, d.produit, d.attendu],
    )).rows;
    if (!c) throw new ErreurPrix(409, "aucun_instantane_precedent", "Aucun instantané validé précédent n'est disponible.");
    cible = c.id;
  }
  const r = await publier(ex, { ...d, instantaneId: cible, action: "retour" });
  return { ...r, instantaneId: cible };
}

/**
 * Suspension ou retrait d'une source (PRX13) : ses publications actives sont retirées (pointeur désactivé, événement
 * « retrait » consigné) ; ses éditions passent `suspendue`. Les instantanés restent (lignée), non publiables tant que la
 * source n'est pas de nouveau autorisée. Les lectures de l'API ne servent que le pointeur actif : rien n'est gardé en cache.
 */
export async function retirerSortiesDeSource(ex: Executeur, cle: string, motif: string, acteur: string | null): Promise<number> {
  const actives = (await ex.query<{ id: string; couche: string; produit: string; instantane_id: string }>(
    `SELECT p.id::text AS id, p.couche, p.produit, p.instantane_id FROM geodata_prix_publications p JOIN geodata_prix_instantanes i ON i.id = p.instantane_id
      WHERE p.active AND $1 = ANY(i.sources) FOR UPDATE OF p`, [cle],
  )).rows;
  for (const p of actives) {
    await ex.query("UPDATE geodata_prix_publications SET active = false, desactivee_le = clock_timestamp() WHERE id = $1", [p.id]);
    await ex.query(
      `INSERT INTO geodata_prix_publications (couche, produit, action, instantane_id, precedent_id, active, approuve_par, motif) VALUES ($1, $2, 'retrait', NULL, $3, false, $4, $5)`,
      [p.couche, p.produit, p.instantane_id, acteur, motif.slice(0, 500)],
    );
    await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.publication.retrait', $2, 'succes', $3)",
      [acteur, p.instantane_id, JSON.stringify({ source: cle, motif: motif.slice(0, 500), ...(acteur ? {} : { par: "registre" }) })]);
  }
  await ex.query("UPDATE geodata_prix_editions SET etat = 'suspendue' WHERE source_cle = $1 AND etat = 'active'", [cle]);
  return actives.length;
}

/** Statut d'une source changé par l'administration (journalisé ; sortie de l'état autorisé → retrait des sorties). */
export async function changerStatutSource(ex: Executeur, cle: string, statut: string, motif: string, acteur: string): Promise<{ avant: string; apres: string; retraits: number }> {
  const [s] = (await ex.query<{ statut: string }>("SELECT statut FROM geodata_prix_sources WHERE cle = $1 FOR UPDATE", [cle])).rows;
  if (!s) throw new ErreurPrix(404, "not_found", "Source absente du registre.");
  if (s.statut === statut) return { avant: s.statut, apres: statut, retraits: 0 };
  await ex.query(
    "UPDATE geodata_prix_sources SET statut = $2, statut_origine = 'administration', motif = CASE WHEN $2 IN ('active', 'autorisee') THEN motif ELSE $3 END, modifie_par = $4, modifie_le = now() WHERE cle = $1",
    [cle, statut, motif, acteur],
  );
  await ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES ($1, 'prix.source.statut', $2, 'succes', $3)",
    [acteur, cle, JSON.stringify({ avant: s.statut, apres: statut, origine: "administration", motif })]);
  let retraits = 0;
  if (sourceAutorisee(s.statut) && !sourceAutorisee(statut)) retraits = await retirerSortiesDeSource(ex, cle, `Source « ${cle} » ${statut} : ${motif}`, acteur);
  // Source de nouveau autorisée : ses éditions suspendues par la suspension reprennent (aucune publication rétablie d'office).
  if (!sourceAutorisee(s.statut) && sourceAutorisee(statut)) await ex.query("UPDATE geodata_prix_editions SET etat = 'active' WHERE source_cle = $1 AND etat = 'suspendue'", [cle]);
  return { avant: s.statut, apres: statut, retraits };
}
