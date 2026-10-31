/**
 * Prix immobiliers de GeoData (Fadi Concept Prix v1.1, Plan §6, lots P3 à P6), montés sous `/geodata/api/prix/…` :
 * registre des sources, état des deux couches (valeurs de référence officielles ; prix affichés dans les annonces),
 * agrégats publiés par un tiers (baromètre FeenWay, repris tels que publiés), cellules de l'instantané publié,
 * comparaison qualifiée, import contrôlé d'observations, instantanés candidats, publication atomique, retour arrière,
 * statut des sources et export.
 *
 * Interface ≠ base de données (D-GD-29) : tout est lu en base ; une base vide donne des états vides explicites, jamais
 * un repli (PRX01). Capacités portées sur les rôles GeoData (`lib/geodata/prix/droits.ts`) : la consultation seule ne
 * lit jamais d'observation brute, de lot, de quarantaine ni de lignée (`cles_retenues`) et n'exporte rien (PRX10).
 * Réponses privées non mises en cache (en-tête du routeur GeoData) : un retrait se voit à la requête suivante (PRX13).
 */
import express, { Router, type NextFunction, type Request, type Response } from "express";
import {
  comparerAuReferentiel, deriverEtatCouche, LIBELLE_ECART_REFERENCE, lireDroits, valeurMarcheDepuisAgregat, verifierUsage,
  type AgregatPublie, type EtatCouche, type EtatDonneePrix, type ReferenceOfficielle, type StatutSourcePrix, type ValeurMarche,
} from "@parcours/geodata-model";
import { pool } from "../../db/client.js";
import { erreur, journal, requete, rolesDe, transaction } from "../../lib/geodata/acces.js";
import { capacitesPrixDe, type CapacitePrix } from "../../lib/geodata/prix/droits.js";
import {
  analyserImport, changerStatutSource, construireInstantane, deciderDoublon, ErreurPrix, exigerSource, importerObservations, LIMITES_IMPORT_PRIX,
  publicationActive, publier, retourArriere, sourceAutorisee, type CouchePublication, type DemandeImport, type ProduitPublication,
} from "../../lib/geodata/prix/pipeline.js";
import { STATUTS_REGISTRE } from "../../lib/geodata/prix/registre.js";

export const prixRouter = Router();
const corpsImport = express.json({ limit: Math.ceil(LIMITES_IMPORT_PRIX.octets * 1.2) });

/** Date du jour en heure suisse (AAAA-MM-JJ) : fraîcheur et comparaisons. */
export const aujourdhui = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const capacitesPrix = async (req: Request) => capacitesPrixDe(await rolesDe(req.user!.id));

const exiger = (c: CapacitePrix) => async (req: Request, res: Response, next: NextFunction) => {
  if (!(await capacitesPrix(req)).has(c)) {
    await journal(req.user!.id, "prix.refuse", req.path, "refus", { capacite: c });
    return erreur(res, 403, "forbidden", "Rôle GeoData requis pour cette action sur les prix.", { capacite: c });
  }
  next();
};

/** Traduit une erreur métier de la chaîne des prix en réponse ; toute autre erreur suit le gestionnaire commun. */
const gerer = (f: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
  try { await f(req, res); } catch (e) {
    if (e instanceof ErreurPrix) return erreur(res, e.statut, e.code, e.message, e.details);
    throw e;
  }
};

const nombre = (x: unknown): number | null => (x === null || x === undefined ? null : Number(x));
const dateIso = (x: unknown): string | null => (x === null || x === undefined ? null : x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));
const param = (req: Request, k: string, motif = /^[A-Za-z0-9:._-]{1,80}$/): string | null => {
  const v = req.query[k];
  return typeof v === "string" && motif.test(v) ? v : null;
};

// ——— Registre des sources ———

interface LigneSource extends Record<string, unknown> {
  cle: string; titre: string; couche: "officielle" | "annonces"; produit: string; statut: string; statut_origine: string; editeur: string; url: string | null;
  licence: string | null; motif: string | null; prochaine_action: string | null; derivee: boolean; fiche_geodata: string | null; revue_le: unknown; revue_avant: unknown;
  responsable: string | null; dossier: string | null; version_registre: string | null; charge_le: unknown;
}

const lireSources = () => requete<LigneSource>(`SELECT * FROM geodata_prix_sources ORDER BY couche DESC, produit, cle`);

/** Agrégats publiés consultables : version commune publiée, consultation autorisée, source du registre non suspendue. */
const AGREGATS_CONSULTABLES = `
  FROM geodata_prix_agregats_publies a
  JOIN geodata_versions v ON v.id = a.version_id
  JOIN geodata_sources s ON s.id = v.source_id
 WHERE v.etat = 'publiee' AND v.espace_id IS NULL AND v.droits->>'consultation' = 'autorise'
   AND NOT EXISTS (SELECT 1 FROM geodata_prix_sources ps WHERE ps.fiche_geodata = s.cle AND ps.statut NOT IN ('active', 'autorisee'))`;

/** État dérivé (deriverEtatCouche) d'une source et de ce qu'elle a en base ; un statut « bloquee » reste non autorisé. */
async function etatSource(s: LigneSource, dateReference: string): Promise<EtatCouche> {
  const source = { statut: s.statut as StatutSourcePrix, motifBlocage: s.motif };
  let edition: { validite: "verifiee" | "non-verifiee" | "historique" | null; dateDonnees: string | null } | null = null;
  let nombreValeurs = 0;
  if (s.produit === "agregat-publie" && s.fiche_geodata) {
    const [x] = await requete(`SELECT max(a.periode_fin) AS fin, count(*) AS n FROM geodata_prix_agregats_publies a JOIN geodata_versions v ON v.id = a.version_id
      JOIN geodata_sources so ON so.id = v.source_id WHERE so.cle = $1 AND v.etat = 'publiee' AND v.espace_id IS NULL AND v.droits->>'consultation' = 'autorise'`, [s.fiche_geodata]);
    if (Number(x?.["n"] ?? 0) > 0) { edition = { validite: null, dateDonnees: dateIso(x!["fin"]) }; nombreValeurs = Number(x!["n"]); }
  } else if (s.produit === "observations") {
    const [x] = await requete(`SELECT max(e.date_fin) AS fin, (SELECT count(*) FROM geodata_prix_observations o WHERE o.source_cle = $1) AS n
      FROM geodata_prix_editions e WHERE e.source_cle = $1 AND e.etat = 'active' HAVING count(*) > 0`, [s.cle]);
    if (x) { edition = { validite: null, dateDonnees: dateIso(x["fin"]) }; nombreValeurs = Number(x["n"]); }
  } else if (s.produit === "valeurs-officielles") {
    const [x] = await requete(`SELECT e.validite, e.date_fin, (SELECT count(*) FROM geodata_prix_valeurs_officielles vo WHERE vo.edition_id = e.id) AS n
      FROM geodata_prix_editions e WHERE e.source_cle = $1 AND e.etat = 'active' ORDER BY (e.validite = 'verifiee') DESC, e.date_debut DESC NULLS LAST LIMIT 1`, [s.cle]);
    if (x) { edition = { validite: x["validite"] as "verifiee", dateDonnees: dateIso(x["date_fin"]) ?? dateReference }; nombreValeurs = Number(x["n"]); }
  }
  return deriverEtatCouche({ couche: s.couche, source, edition, nombreValeurs, dateReference });
}

prixRouter.get("/prix/sources", async (_req, res) => {
  const sources = await lireSources();
  const date = aujourdhui();
  res.json({
    sources: await Promise.all(sources.map(async (s) => ({
      cle: s.cle, titre: s.titre, couche: s.couche, produit: s.produit, statut: s.statut, statutOrigine: s.statut_origine, editeur: s.editeur, url: s.url,
      licence: s.licence, motif: s.motif, prochaineAction: s.prochaine_action, derivee: s.derivee, ficheGeodata: s.fiche_geodata,
      revueLe: dateIso(s.revue_le), revueAvant: dateIso(s.revue_avant), etatCouche: await etatSource(s, date),
    }))),
    dossier: sources[0]?.dossier ?? null,
    version: sources[0]?.version_registre ?? null,
    responsable: sources[0]?.responsable ?? null,
    chargeLe: sources[0]?.charge_le ?? null,
  });
});

// ——— État des couches ———

const ORDRE_ETATS: readonly EtatDonneePrix[] = ["disponible", "perime", "validite-non-verifiee", "historique", "echantillon-insuffisant", "echec", "indisponible", "non-autorise"];
const meilleur = (etats: readonly EtatDonneePrix[]): EtatDonneePrix => [...etats].sort((a, b) => ORDRE_ETATS.indexOf(a) - ORDRE_ETATS.indexOf(b))[0] ?? "indisponible";

interface Produit { produit: string; etat: EtatDonneePrix; motif: string | null; detail?: string | null; versionIds?: string[]; instantaneId?: string | null; editionIds?: string[] }

/** Motifs lisibles des sources non autorisées d'un produit (« Titre : motif »), tels qu'enregistrés au registre. */
const motifsBlocage = (sources: readonly LigneSource[]) => sources.filter((s) => !sourceAutorisee(s.statut)).map((s) => `${s.titre} : ${s.motif ?? s.statut}`);

async function etatProduit(produit: "valeurs-officielles" | "agregat-publie" | "observations", sources: readonly LigneSource[], date: string): Promise<Produit> {
  const du = sources.filter((s) => s.produit === produit);
  if (!du.length) return { produit, etat: "indisponible", motif: "aucune-source", detail: null, ...(produit === "observations" ? { instantaneId: null } : {}) };
  const autorisees = du.filter((s) => sourceAutorisee(s.statut));
  if (!autorisees.length) {
    const e = await etatSource(du[0]!, date);
    return { produit, etat: "non-autorise", motif: e.motif, detail: motifsBlocage(du).join(" ; "), ...(produit === "observations" ? { instantaneId: null } : {}) };
  }
  if (produit === "agregat-publie") {
    const fiches = autorisees.map((s) => s.fiche_geodata).filter((x): x is string => !!x);
    const versions = (await requete(`SELECT DISTINCT v.id, v.publiee_le ${AGREGATS_CONSULTABLES} AND s.cle = ANY($1) ORDER BY v.publiee_le DESC`, [fiches])).map((l) => String(l["id"]));
    const etats = await Promise.all(autorisees.map((s) => etatSource(s, date)));
    const e = etats.find((x) => x.etat === meilleur(etats.map((y) => y.etat)))!;
    return { produit, etat: e.etat, motif: e.motif, detail: e.detail, versionIds: versions };
  }
  if (produit === "observations") {
    const p = await publicationActive(pool, "annonces", "observations");
    if (!p) return { produit, etat: "indisponible", motif: "aucune-publication", detail: null, instantaneId: null };
    const [i] = await requete(`SELECT parametres->>'dateReference' AS date, (SELECT count(*) FROM geodata_prix_cellules c WHERE c.instantane_id = i.id AND c.etat = 'disponible') AS n
      FROM geodata_prix_instantanes i WHERE i.id = $1`, [p.instantaneId]);
    const e = deriverEtatCouche({ couche: "annonces", source: { statut: "active" }, edition: { validite: null, dateDonnees: (i?.["date"] as string) ?? null }, nombreValeurs: Number(i?.["n"] ?? 0), dateReference: date });
    // Cellules toutes sous le seuil : état « échantillon insuffisant », jamais une valeur.
    return { produit, etat: e.etat === "indisponible" && e.motif === "aucune-donnee" ? "echantillon-insuffisant" : e.etat, motif: e.motif, detail: e.detail, instantaneId: p.instantaneId };
  }
  const etats = await Promise.all(autorisees.map((s) => etatSource(s, date)));
  const editions = (await requete(`SELECT id FROM geodata_prix_editions WHERE source_cle = ANY($1) AND etat = 'active' ORDER BY cree_le DESC`, [autorisees.map((s) => s.cle)])).map((l) => String(l["id"]));
  const e = etats.find((x) => x.etat === meilleur(etats.map((y) => y.etat)))!;
  return { produit, etat: e.etat, motif: e.motif, detail: e.detail, editionIds: editions };
}

prixRouter.get("/prix/couches", async (req, res) => {
  const sources = await lireSources();
  const date = aujourdhui();
  const officielle = [await etatProduit("valeurs-officielles", sources, date)];
  const annonces = [await etatProduit("agregat-publie", sources, date), await etatProduit("observations", sources, date)];
  const couche = (c: "officielle" | "annonces", produits: Produit[]) => ({
    couche: c,
    etat: meilleur(produits.map((p) => p.etat)),
    motifs: motifsBlocage(sources.filter((s) => s.couche === c && (c === "annonces" ? ["agregat-publie", "observations"] : ["valeurs-officielles"]).includes(s.produit))),
    produits,
  });
  res.json({ couches: [couche("officielle", officielle), couche("annonces", annonces)], dateReference: date, capacites: [...(await capacitesPrix(req))].sort() });
});

// ——— Agrégats publiés ———

const lireEdition = (l: Record<string, unknown>) => ({
  versionId: l["version_id"], coucheId: l["couche_id"], editeur: l["editeur"], libelle: l["libelle"], periode: l["version_periode"],
  periodeDonnees: { debut: dateIso(l["periode_debut"]), fin: dateIso(l["periode_fin"]) },
  attribution: l["attribution"], licence: l["version_licence"], licenceUrl: l["licence"] || null, sourceUrl: l["source_url"] || null, publieeLe: l["publiee_le"],
  source: l["fiche"], nature: "agregat-publie", synthetique: l["synthetique"],
});

const lireLigneAgregat = (l: Record<string, unknown>) => ({
  versionId: l["version_id"], ordre: Number(l["ordre"]), niveauGeo: l["niveau_geo"], libelleGeo: l["libelle_geo"], ville: l["ville"], codeRattache: l["code_rattache"] ?? null,
  etatRattachement: l["etat_rattachement"], typeBien: l["type_bien"], typeBienOriginal: l["type_bien_original"], transaction: l["transaction"],
  nombreAnnonces: Number(l["nombre_annonces"]),
  prixMedian: l["prix_median"] === null ? null : { valeur: Number(l["prix_median"]), approximatif: l["prix_median_approximatif"], texte: l["prix_median_texte"] },
  prixM2: l["prix_m2"] === null ? null : { valeur: Number(l["prix_m2"]), texte: l["prix_m2_texte"] },
  unite: l["unite"], uniteM2: l["unite_m2"], tendance90j: nombre(l["tendance_90j"]),
});

const COLONNES_AGREGAT = `a.*, v.libelle, v.periode AS version_periode, v.attribution, v.licence AS version_licence, v.publiee_le, v.droits, v.synthetique, s.cle AS fiche,
  (SELECT min(c.id) FROM geodata_couches c WHERE c.version_id = v.id) AS couche_id`;

/**
 * Lignes d'agrégats publiés consultables. Avec `code` : les éditions où ce territoire a des lignes rattachées, avec
 * leurs lignes rattachées et les lignes non rattachées de la même édition (quartiers commerciaux, tableau de la commune).
 */
export async function agregatsPublies(filtres: { code?: string | null; versionId?: string | null; transaction?: string | null; type?: string | null }) {
  const lignes = await requete(
    `SELECT ${COLONNES_AGREGAT} ${AGREGATS_CONSULTABLES}
       AND ($1::text IS NULL OR a.version_id IN (SELECT a2.version_id FROM geodata_prix_agregats_publies a2 WHERE a2.code_rattache = $1))
       AND ($1::text IS NULL OR a.code_rattache = $1 OR a.code_rattache IS NULL)
       AND ($2::text IS NULL OR a.version_id = $2)
       AND ($3::text IS NULL OR a.transaction = $3)
       AND ($4::text IS NULL OR a.type_bien = $4)
     ORDER BY v.publiee_le DESC, a.version_id, a.ordre LIMIT 5000`,
    [filtres.code ?? null, filtres.versionId ?? null, filtres.transaction ?? null, filtres.type ?? null],
  );
  const editions = new Map<string, ReturnType<typeof lireEdition>>();
  for (const l of lignes) if (!editions.has(String(l["version_id"]))) editions.set(String(l["version_id"]), lireEdition(l));
  return { editions: [...editions.values()], lignes };
}

prixRouter.get("/prix/agregats-publies", async (req, res) => {
  const { editions, lignes } = await agregatsPublies({ code: param(req, "code"), transaction: param(req, "transaction"), type: param(req, "type") });
  res.json({ editions, lignes: lignes.map(lireLigneAgregat) });
});

/**
 * Agrégats publiés pour la fiche d'objet (`consultation.ts`) : lignes de cette version rattachées à ce code, et lignes non
 * rattachées de la même édition ; null si l'objet n'a aucune ligne rattachée.
 */
export async function prixPubliesDeLObjet(versionId: string, code: string) {
  const { editions, lignes } = await agregatsPublies({ code, versionId });
  const rattachees = lignes.filter((l) => l["code_rattache"] === code);
  if (!rattachees.length) return null;
  return { editions, lignes: rattachees.map(lireLigneAgregat), nonRattaches: lignes.filter((l) => l["code_rattache"] === null).map(lireLigneAgregat) };
}

// ——— Cellules de l'instantané publié ———

async function instantanePublie() {
  const p = await publicationActive(pool, "annonces", "observations");
  if (!p) return null;
  const [i] = await requete(`SELECT id, empreinte, methode_version, parametres, sources, decoupage FROM geodata_prix_instantanes WHERE id = $1`, [p.instantaneId]);
  return i ? { publication: p, instantane: i } : null;
}

const lireCellule = (c: Record<string, unknown>) => ({
  cohorte: {
    territoire: c["territoire_code"], niveau: c["niveau"], transaction: c["transaction"], typeBien: c["type_bien"], etatBien: c["etat_bien"] ?? null,
    baseSurface: c["base_surface"], periode: c["periode"], monnaie: c["monnaie"], unite: c["unite"],
  },
  etat: c["etat"], mediane: nombre(c["mediane"]), q1: nombre(c["q1"]), q3: nombre(c["q3"]),
  nombres: { brutes: Number(c["brutes"]), eligibles: Number(c["eligibles"]), distinctes: Number(c["distinctes"]) },
  exclusions: c["exclusions"], contributionSources: c["contribution_sources"], atypiques: Number(c["atypiques"]), medianeHorsAtypiques: nombre(c["mediane_hors_atypiques"]),
  premiereObservation: dateIso(c["premiere_observation"]), derniereObservation: dateIso(c["derniere_observation"]),
});

/** Colonnes servies d'une cellule : jamais `cles_retenues` (lignée des observations, accès restreint). */
const COLONNES_CELLULE = `territoire_code, niveau, transaction, type_bien, etat_bien, base_surface, periode, monnaie, unite, etat, mediane, q1, q3, brutes, eligibles, distinctes,
  exclusions, contribution_sources, atypiques, mediane_hors_atypiques, premiere_observation, derniere_observation`;

async function cellulesFiltrees(instantaneId: string, req: Request) {
  return requete(
    `SELECT ${COLONNES_CELLULE} FROM geodata_prix_cellules WHERE instantane_id = $1
       AND ($2::text IS NULL OR territoire_code = $2) AND ($3::text IS NULL OR niveau = $3) AND ($4::text IS NULL OR transaction = $4)
       AND ($5::text IS NULL OR type_bien = $5) AND ($6::text IS NULL OR base_surface = $6)
     ORDER BY cle LIMIT 5000`,
    [instantaneId, param(req, "code"), param(req, "niveau"), param(req, "transaction"), param(req, "type"), param(req, "base")],
  );
}

prixRouter.get("/prix/cellules", async (req, res) => {
  const date = aujourdhui();
  const pub = await instantanePublie();
  if (!pub) {
    const p = await etatProduit("observations", await lireSources(), date);
    return void res.json({ instantane: null, etat: p.etat, motif: p.motif, detail: p.detail ?? null, cellules: [] });
  }
  const i = pub.instantane;
  const parametres = i["parametres"] as { dateReference: string; fenetreJours: number; seuil: number };
  const cellules = await cellulesFiltrees(String(i["id"]), req);
  const e = deriverEtatCouche({ couche: "annonces", source: { statut: "active" }, edition: { validite: null, dateDonnees: parametres.dateReference }, nombreValeurs: cellules.filter((c) => c["etat"] === "disponible").length, dateReference: date });
  res.json({
    instantane: { id: i["id"], empreinte: i["empreinte"], methode: i["methode_version"], publieLe: pub.publication.le, parametres, sources: i["sources"], decoupage: i["decoupage"] ?? null },
    etat: e.etat === "indisponible" && e.motif === "aucune-donnee" && cellules.length ? "echantillon-insuffisant" : e.etat,
    motif: e.motif,
    cellules: cellules.map(lireCellule),
  });
});

// ——— Comparaison ———

prixRouter.get("/prix/comparaison", async (req, res) => {
  const code = param(req, "code"), type = param(req, "type"), transaction = param(req, "transaction");
  if (!code || !type || (transaction !== "vente" && transaction !== "location")) return erreur(res, 400, "invalid_input", "Paramètres attendus : code, type, transaction (vente ou location).", { champs: ["code", "type", "transaction"] });
  const base = param(req, "base") ?? "habitable";
  const date = aujourdhui();
  // Référence officielle : zone de ce code, ou zone dont l'attribution à ce territoire a été revue et validée.
  const [r] = await requete(
    `SELECT vo.*, z.zone_code, z.territoire_code, z.revue AS revue_zone, e.libelle AS edition_libelle, s.statut AS statut_source
       FROM geodata_prix_valeurs_officielles vo JOIN geodata_prix_zones z ON z.id = vo.zone_id JOIN geodata_prix_editions e ON e.id = vo.edition_id
       JOIN geodata_prix_sources s ON s.cle = e.source_cle
      WHERE (z.zone_code = $1 OR (z.territoire_code = $1 AND z.revue = 'validee')) AND vo.type_bien = $2 AND vo.transaction = $3 AND e.etat = 'active'
      ORDER BY (vo.validite = 'verifiee') DESC, vo.date_debut DESC, vo.id LIMIT 1`,
    [code, type, transaction],
  );
  let marche: ValeurMarche | null = null;
  let descriptionMarche: Record<string, unknown> | null = null;
  const pub = await instantanePublie();
  if (pub) {
    const parametres = pub.instantane["parametres"] as { dateReference: string };
    const [c] = await requete(
      `SELECT ${COLONNES_CELLULE} FROM geodata_prix_cellules WHERE instantane_id = $1 AND territoire_code = $2 AND type_bien = $3 AND transaction = $4 AND base_surface = $5
         AND periode = $6 ORDER BY cle LIMIT 1`,
      [pub.instantane["id"], code, type, transaction, base, transaction === "vente" ? "total" : "mois"],
    );
    if (c) {
      const fraicheur = deriverEtatCouche({ couche: "annonces", source: { statut: "active" }, edition: { validite: null, dateDonnees: parametres.dateReference }, nombreValeurs: 1, dateReference: date });
      marche = {
        nature: "cellule-fadi", territoire: code, typeBien: type as ValeurMarche["typeBien"], etat: (c["etat_bien"] ?? null) as ValeurMarche["etat"], transaction,
        baseSurface: c["base_surface"] as ValeurMarche["baseSurface"], monnaie: String(c["monnaie"]), unite: String(c["unite"]),
        etatDonnee: c["etat"] === "disponible" ? (fraicheur.etat === "perime" ? "perime" : "disponible") : "echantillon-insuffisant",
        mediane: nombre(c["mediane"]), dateDonnees: parametres.dateReference, autorisee: true, baseDocumentee: true,
      };
      descriptionMarche = { nature: "cellule-fadi", instantaneId: pub.instantane["id"], ...lireCellule(c) };
    }
  }
  if (!marche) {
    const { lignes } = await agregatsPublies({ code, type, transaction });
    const a = lignes.find((l) => l["code_rattache"] === code);
    if (a) {
      const montant = (v: unknown, t: unknown, approx: unknown) => (v === null ? null : { valeur: Number(v), centimes: Math.round(Number(v) * 100), approximatif: approx === true, texteOriginal: String(t ?? "") });
      const agregat: AgregatPublie = {
        editeur: String(a["editeur"]), edition: String(a["libelle"]), ligne: Number(a["ordre"]), ville: String(a["ville"]), niveauGeo: a["niveau_geo"] as AgregatPublie["niveauGeo"],
        libelleGeo: String(a["libelle_geo"]), typeBien: a["type_bien"] as AgregatPublie["typeBien"], typeBienOriginal: String(a["type_bien_original"]), transaction,
        nombreAnnonces: Number(a["nombre_annonces"]), prixMedian: montant(a["prix_median"], a["prix_median_texte"], a["prix_median_approximatif"]),
        prixMedianM2: montant(a["prix_m2"], a["prix_m2_texte"], false), unite: String(a["unite"]), uniteM2: String(a["unite_m2"]), tendance90j: nombre(a["tendance_90j"]),
        periode: { debut: dateIso(a["periode_debut"])!, fin: dateIso(a["periode_fin"])! }, source: String(a["editeur"]), sourceUrl: String(a["source_url"]), licence: String(a["licence"]),
      };
      marche = valeurMarcheDepuisAgregat(agregat, { territoire: code, autorisee: true });
      descriptionMarche = { nature: "agregat-publie", ...lireLigneAgregat(a) };
    }
  }
  const reference: ReferenceOfficielle | null = r ? {
    id: String(r["id"]), edition: String(r["edition_libelle"]), zone: String(r["zone_code"]), categorieOriginale: String(r["categorie_originale"]),
    typeBien: r["type_bien"] as ReferenceOfficielle["typeBien"], etat: (r["etat_bien"] ?? null) as ReferenceOfficielle["etat"], transaction: r["transaction"] as ReferenceOfficielle["transaction"],
    baseSurface: r["base_surface"] as ReferenceOfficielle["baseSurface"], monnaie: String(r["monnaie"]), unite: String(r["unite"]),
    valeur: r["forme"] === "unique" ? { forme: "unique", valeur: Number(r["valeur"]), texteOriginal: String(r["texte_original"]) }
      : r["forme"] === "fourchette" ? { forme: "fourchette", min: Number(r["valeur_min"]), max: Number(r["valeur_max"]), texteOriginal: String(r["texte_original"]) }
        : r["forme"] === "terrain-construction" ? { forme: "terrain-construction", terrain: Number(r["valeur_terrain"]), construction: Number(r["valeur_construction"]), texteOriginal: String(r["texte_original"]) }
          : { forme: "conditionnelle", condition: String(r["condition"]), valeur: Number(r["valeur"]), texteOriginal: String(r["texte_original"]) },
    dateDebut: dateIso(r["date_debut"])!, dateFin: dateIso(r["date_fin"]), validite: r["validite"] as ReferenceOfficielle["validite"], autorisee: sourceAutorisee(String(r["statut_source"])),
  } : null;
  const descriptionReference = reference ? { ...reference, editionId: r!["edition_id"], territoire: r!["territoire_code"] ?? null } : null;
  if (!reference || !marche) {
    return void res.json({
      comparable: false, dimensionsIncompatibles: [], motif: !reference ? "aucune-reference-officielle" : "aucune-valeur-marche", libelle: LIBELLE_ECART_REFERENCE,
      reference: descriptionReference, marche: descriptionMarche,
    });
  }
  const correspondances = r!["territoire_code"] === code && r!["revue_zone"] === "validee" ? [{ zone: reference.zone, territoire: code }] : [];
  const c = comparerAuReferentiel(reference, marche, { dateComparaison: date, correspondancesQualifiees: correspondances });
  if (!c.comparable) {
    return void res.json({ comparable: false, dimensionsIncompatibles: c.dimensionsIncompatibles, motif: "dimensions-incompatibles", libelle: LIBELLE_ECART_REFERENCE, reference: descriptionReference, marche: descriptionMarche });
  }
  res.json({
    comparable: true, mode: c.mode, libelle: LIBELLE_ECART_REFERENCE,
    ...(c.mode === "ecart" ? { ecartPourcent: c.ecartPourcent, valeurReference: c.valeurReference } : { position: c.position, min: c.min, max: c.max }),
    reference: descriptionReference, marche: descriptionMarche,
  });
});

// ——— Import d'observations (restreint) ———

prixRouter.post("/prix/imports", exiger("prix-importer"), corpsImport, gerer(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const ed = (b["edition"] ?? {}) as Record<string, unknown>;
  const champs: string[] = [];
  if (typeof b["source"] !== "string" || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(b["source"])) champs.push("source");
  if (typeof b["pays"] !== "string" || !/^[A-Z]{2}$/.test(b["pays"])) champs.push("pays");
  if (typeof ed["libelle"] !== "string" || ed["libelle"].trim().length < 2 || ed["libelle"].length > 200) champs.push("edition.libelle");
  for (const k of ["dateDebut", "dateFin"]) if (ed[k] !== undefined && ed[k] !== null && (typeof ed[k] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ed[k] as string))) champs.push(`edition.${k}`);
  if (ed["url"] !== undefined && ed["url"] !== null && (typeof ed["url"] !== "string" || !/^https:\/\/\S{3,500}$/.test(ed["url"]))) champs.push("edition.url");
  if (b["format"] !== "csv" && b["format"] !== "json") champs.push("format");
  if (typeof b["contenu"] !== "string" || !b["contenu"].length) champs.push("contenu");
  if (b["mode"] !== "apercu" && b["mode"] !== "valider") champs.push("mode");
  if (b["mode"] === "valider" && typeof b["cleIdempotence"] !== "string") champs.push("cleIdempotence");
  if (champs.length) return erreur(res, 400, "invalid_input", "Demande d'import incomplète.", { champs });
  const contenu = b["contenu"] as string;
  if (Buffer.byteLength(contenu, "utf8") > LIMITES_IMPORT_PRIX.octets) return erreur(res, 413, "limite_depassee", `Fichier au-delà de ${LIMITES_IMPORT_PRIX.octets} octets.`, { limite: LIMITES_IMPORT_PRIX.octets });
  const d: DemandeImport = {
    source: b["source"] as string, pays: b["pays"] as string, format: b["format"] as "csv" | "json", contenu, acteur: req.user!.id,
    edition: { libelle: (ed["libelle"] as string).trim(), dateDebut: (ed["dateDebut"] as string | undefined) ?? null, dateFin: (ed["dateFin"] as string | undefined) ?? null, url: (ed["url"] as string | undefined) ?? null },
  };
  try {
    if (b["mode"] === "apercu") {
      // Aperçu : aucune écriture ; la source doit déjà être autorisée (une source bloquée n'est jamais lue).
      const a = await transaction(async (c) => { await exigerSource(c, d.source, "observations"); return analyserImport(c, d); });
      const [deja] = await requete(`SELECT id FROM geodata_prix_lots WHERE cle_idempotence = $1`, [a.rapport.cleIdempotence]);
      return void res.json({ mode: "apercu", dejaImporte: deja ? deja["id"] : null, rapport: a.rapport });
    }
    const r = await transaction((c) => importerObservations(c, d, b["cleIdempotence"] as string));
    res.status(r.deja ? 200 : 201).json({ mode: "valider", deja: r.deja, lotId: r.lotId, editionId: r.editionId, nouvelles: r.nouvelles, rapport: r.rapport });
  } catch (e) {
    if (e instanceof ErreurPrix && e.code === "source_non_autorisee") await journal(req.user!.id, "prix.import.refuse", d.source, "refus", { motif: e.code });
    throw e;
  }
}));

/** Lots d'import (restreint) : effectifs, erreurs, fichier archivé. */
prixRouter.get("/prix/lots", exiger("prix-lire-observations"), async (_req, res) => {
  const lots = await requete(`SELECT l.id, l.edition_id, e.libelle AS edition, l.source_cle, l.empreinte, l.version_analyseur, l.format, l.fichier_chemin, l.etat, l.lignes_lues, l.admises,
      l.quarantaine, l.nouvelles, l.deja_presentes, l.rattachees, l.erreurs, l.cree_le FROM geodata_prix_lots l JOIN geodata_prix_editions e ON e.id = l.edition_id ORDER BY l.cree_le DESC LIMIT 200`);
  res.json({ lots: lots.map((l) => ({
    id: l["id"], editionId: l["edition_id"], edition: l["edition"], source: l["source_cle"], empreinte: l["empreinte"], versionAnalyseur: l["version_analyseur"], format: l["format"],
    fichier: l["fichier_chemin"], etat: l["etat"], lignesLues: l["lignes_lues"], admises: l["admises"], quarantaine: l["quarantaine"], nouvelles: l["nouvelles"],
    dejaPresentes: l["deja_presentes"], rattachees: l["rattachees"], erreurs: l["erreurs"], creeLe: l["cree_le"],
  })) });
});

/** Quarantaine d'un lot (restreint) : ligne, motifs, colonnes documentées. */
prixRouter.get("/prix/lots/:id/quarantaine", exiger("prix-lire-observations"), async (req, res) => {
  const lignes = await requete(`SELECT ligne, annonce_id, motifs, donnees FROM geodata_prix_quarantaine WHERE lot_id = $1 ORDER BY ligne LIMIT 5000`, [String(req.params["id"])]);
  res.json({ lignes: lignes.map((l) => ({ ligne: l["ligne"], annonceId: l["annonce_id"], motifs: l["motifs"], donnees: l["donnees"] })) });
});

/** Observations brutes (restreint, PRX10) : jamais servies à la consultation seule. */
prixRouter.get("/prix/observations", exiger("prix-lire-observations"), async (req, res) => {
  const lignes = await requete(
    `SELECT o.id, o.lot_id, o.source_cle, o.annonce_id, o.observe_le, o.transaction, o.type_bien, o.etat_bien, o.prix_original, o.prix, o.monnaie, o.periode, o.surface_originale,
            o.surface, o.base_surface, o.libelle_localite, o.precision_niveau, r.resultat, r.territoire_code, r.territoire_niveau, r.motif, r.revue
       FROM geodata_prix_observations o LEFT JOIN geodata_prix_rattachements r ON r.observation_id = o.id
      WHERE ($1::text IS NULL OR o.source_cle = $1) AND ($2::text IS NULL OR o.lot_id = $2) ORDER BY o.id LIMIT 1000`,
    [param(req, "source"), param(req, "lot")],
  );
  res.json({ observations: lignes.map((o) => ({
    id: Number(o["id"]), lotId: o["lot_id"], source: o["source_cle"], annonceId: o["annonce_id"], observeLe: dateIso(o["observe_le"]), transaction: o["transaction"],
    typeBien: o["type_bien"], etatBien: o["etat_bien"], prixOriginal: o["prix_original"], prix: Number(o["prix"]), monnaie: o["monnaie"], periode: o["periode"],
    surfaceOriginale: o["surface_originale"], surface: Number(o["surface"]), baseSurface: o["base_surface"], localite: o["libelle_localite"], precision: o["precision_niveau"],
    rattachement: { resultat: o["resultat"] ?? null, territoire: o["territoire_code"] ?? null, niveau: o["territoire_niveau"] ?? null, motif: o["motif"] ?? null, revue: o["revue"] ?? null },
  })) });
});

/** Décision revue sur une paire d'annonces (`source|annonce`) : fusion ou séparation, rejouée à la construction suivante. */
prixRouter.post("/prix/doublons/decisions", exiger("prix-construire"), gerer(async (req, res) => {
  const { a, b, decision, motif } = (req.body ?? {}) as Record<string, unknown>;
  const cle = /^[a-z0-9][a-z0-9-]{1,79}\|[^|]{1,200}$/;
  if (typeof a !== "string" || !cle.test(a) || typeof b !== "string" || !cle.test(b) || (decision !== "fusion" && decision !== "separation") || typeof motif !== "string" || motif.trim().length < 3 || motif.length > 500) {
    return erreur(res, 400, "invalid_input", "Paire d'annonces (source|annonce), décision (fusion ou separation) et motif (3 à 500 caractères) attendus.", { champs: ["a", "b", "decision", "motif"] });
  }
  await transaction((c) => deciderDoublon(c, a, b, decision, motif.trim(), req.user!.id));
  res.status(201).json({ a: a < b ? a : b, b: a < b ? b : a, decision });
}));

// ——— Instantanés et publications ———

const lireInstantane = (i: Record<string, unknown>) => ({
  id: i["id"], couche: i["couche"], produit: i["produit"], empreinte: i["empreinte"], empreinteManifeste: i["empreinte_manifeste"], methode: i["methode_version"],
  parametres: i["parametres"], sources: i["sources"], lots: i["lots"], decoupage: i["decoupage"] ?? null, etat: i["etat"], rapport: i["rapport"], creeLe: i["cree_le"],
});

prixRouter.get("/prix/instantanes", exiger("prix-lire-observations"), async (_req, res) => {
  const lignes = await requete(`SELECT id, couche, produit, empreinte, empreinte_manifeste, methode_version, parametres, sources, lots, decoupage, etat, rapport, cree_le
    FROM geodata_prix_instantanes ORDER BY cree_le DESC LIMIT 100`);
  res.json({ instantanes: lignes.map(lireInstantane) });
});

prixRouter.post("/prix/instantanes", exiger("prix-construire"), gerer(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const r = await transaction((c) => construireInstantane(c, {
    dateReference: typeof b["dateReference"] === "string" ? b["dateReference"] : aujourdhui(),
    ...(b["fenetreJours"] !== undefined ? { fenetreJours: Number(b["fenetreJours"]) } : {}),
    ...(b["seuil"] !== undefined ? { seuil: Number(b["seuil"]) } : {}),
    ...(b["ventilerParEtat"] === true ? { ventilerParEtat: true } : {}),
    acteur: req.user!.id,
  }));
  res.status(r.deja ? 200 : 201).json(r);
}));

const motifValide = (m: unknown): m is string => typeof m === "string" && m.trim().length >= 3 && m.length <= 500;

/** Refus de publication (conflit, source retirée…) : consigné au journal hors de la transaction annulée (PRX11). */
async function consignerRefus(req: Request, e: unknown, ressource: string) {
  if (e instanceof ErreurPrix) await journal(req.user!.id, "prix.publication.refusee", ressource, "refus", { code: e.code, ...e.details });
}

prixRouter.post("/prix/instantanes/:id/publier", exiger("prix-publier"), gerer(async (req, res) => {
  const { attendu, motif } = (req.body ?? {}) as Record<string, unknown>;
  if (attendu !== null && typeof attendu !== "string") return erreur(res, 400, "invalid_input", "Instantané actif attendu (identifiant, ou null s'il n'y en a pas).", { champs: ["attendu"] });
  if (!motifValide(motif)) return erreur(res, 400, "invalid_input", "Motif de publication obligatoire (3 à 500 caractères).", { champs: ["motif"] });
  const id = String(req.params["id"]);
  try {
    const r = await transaction((c) => publier(c, { couche: "annonces", produit: "observations", instantaneId: id, attendu, motif: motif.trim(), acteur: req.user!.id, action: "publication" }));
    res.json({ instantaneId: id, publicationId: r.publicationId, precedent: r.precedentId });
  } catch (e) { await consignerRefus(req, e, id); throw e; }
}));

const coucheDe = (x: string): { couche: CouchePublication; produit: ProduitPublication } | null =>
  x === "annonces" ? { couche: "annonces", produit: "observations" } : x === "officielle" ? { couche: "officielle", produit: "valeurs-officielles" } : null;

prixRouter.post("/prix/publications/:couche/retour", exiger("prix-publier"), gerer(async (req, res) => {
  const cp = coucheDe(String(req.params["couche"]));
  if (!cp) return erreur(res, 404, "not_found", "Couche inconnue.");
  const { attendu, instantaneId, motif } = (req.body ?? {}) as Record<string, unknown>;
  if (attendu !== null && typeof attendu !== "string") return erreur(res, 400, "invalid_input", "Instantané actif attendu (identifiant ou null).", { champs: ["attendu"] });
  if (instantaneId !== undefined && instantaneId !== null && typeof instantaneId !== "string") return erreur(res, 400, "invalid_input", "Identifiant d'instantané attendu.", { champs: ["instantaneId"] });
  if (!motifValide(motif)) return erreur(res, 400, "invalid_input", "Motif du retour arrière obligatoire (3 à 500 caractères).", { champs: ["motif"] });
  try {
    const r = await transaction((c) => retourArriere(c, { ...cp, attendu, cible: (instantaneId as string | undefined) ?? null, motif: motif.trim(), acteur: req.user!.id }));
    res.json({ instantaneId: r.instantaneId, publicationId: r.publicationId, precedent: r.precedentId });
  } catch (e) { await consignerRefus(req, e, `${cp.couche}:retour`); throw e; }
}));

/** Historique des publications d'une couche (restreint) : publications, retours et retraits, jamais effacés. */
prixRouter.get("/prix/publications/:couche", exiger("prix-lire-observations"), async (req, res) => {
  const cp = coucheDe(String(req.params["couche"]));
  if (!cp) return erreur(res, 404, "not_found", "Couche inconnue.");
  const lignes = await requete(`SELECT p.id, p.action, p.instantane_id, p.precedent_id, p.active, p.motif, p.le, p.desactivee_le, u.email AS approbateur
      FROM geodata_prix_publications p LEFT JOIN users u ON u.id = p.approuve_par WHERE p.couche = $1 AND p.produit = $2 ORDER BY p.le DESC, p.id DESC LIMIT 200`, [cp.couche, cp.produit]);
  res.json({ publications: lignes.map((l) => ({
    id: String(l["id"]), action: l["action"], instantaneId: l["instantane_id"], precedentId: l["precedent_id"], active: l["active"], motif: l["motif"],
    le: l["le"], desactiveeLe: l["desactivee_le"], approbateur: l["approbateur"] ?? null,
  })) });
});

// ——— Statut des sources (administrateur) ———

prixRouter.post("/prix/sources/:cle/statut", exiger("prix-gerer-sources"), gerer(async (req, res) => {
  const { statut, motif } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof statut !== "string" || !(STATUTS_REGISTRE as readonly string[]).includes(statut)) return erreur(res, 400, "invalid_input", "Statut inconnu.", { champs: ["statut"], statuts: STATUTS_REGISTRE });
  if (!motifValide(motif)) return erreur(res, 400, "invalid_input", "Motif obligatoire (3 à 500 caractères).", { champs: ["motif"] });
  const r = await transaction((c) => changerStatutSource(c, String(req.params["cle"]), statut, motif.trim(), req.user!.id));
  res.json({ cle: String(req.params["cle"]), ...r });
}));

// ——— Export (restreint ; droit « export » de chaque source ; provenance et attribution) ———

const csv = (lignes: readonly (readonly unknown[])[]) =>
  `${lignes.map((l) => l.map((v) => {
    const t = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }).join(",")).join("\r\n")}\r\n`;

prixRouter.get("/prix/export", exiger("prix-exporter"), async (req, res) => {
  if ((req.query["format"] ?? "csv") !== "csv") return erreur(res, 400, "format_non_pris_en_charge", "Format d'export : csv.", { champs: ["format"] });
  const produit = req.query["produit"] ?? "agregats";
  if (produit === "agregats") {
    const { lignes } = await agregatsPublies({ code: param(req, "code"), transaction: param(req, "transaction"), type: param(req, "type") });
    const refusees = new Set(lignes.filter((l) => !verifierUsage(lireDroits(l["droits"]), "export").ok).map((l) => String(l["version_id"])));
    const permises = lignes.filter((l) => !refusees.has(String(l["version_id"])));
    if (!permises.length && refusees.size) {
      await journal(req.user!.id, "prix.export.refuse", null, "refus", { versions: [...refusees] });
      return erreur(res, 403, "usage_refuse", "Export non autorisé par les conditions de la source.", { usage: "export" });
    }
    const corps = csv([
      ["version_id", "edition", "editeur", "niveau_geo", "libelle_geo", "code_rattache", "etat_rattachement", "type_bien", "type_bien_original", "transaction", "nombre_annonces",
        "prix_median", "prix_median_approximatif", "prix_median_texte", "prix_m2", "prix_m2_texte", "unite", "unite_m2", "tendance_90j", "periode", "source_url", "licence", "attribution", "nature"],
      ...permises.map((l) => [l["version_id"], l["libelle"], l["editeur"], l["niveau_geo"], l["libelle_geo"], l["code_rattache"], l["etat_rattachement"], l["type_bien"], l["type_bien_original"],
        l["transaction"], l["nombre_annonces"], l["prix_median"], l["prix_median_approximatif"], l["prix_median_texte"], l["prix_m2"], l["prix_m2_texte"], l["unite"], l["unite_m2"], l["tendance_90j"],
        l["periode"], l["source_url"], l["version_licence"], l["attribution"], "agregat publie par un tiers (source unique derivee), non recalcule"]),
    ]);
    await journal(req.user!.id, "prix.export", null, "succes", { produit: "agregats", lignes: permises.length, versions: [...new Set(permises.map((l) => String(l["version_id"])))] });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="prix-agregats-publies.csv"');
    return void res.send(`﻿${corps}`);
  }
  if (produit !== "cellules") return erreur(res, 400, "invalid_input", "Produit d'export : agregats ou cellules.", { champs: ["produit"] });
  const pub = await instantanePublie();
  if (!pub) return erreur(res, 404, "not_found", "Aucun instantané publié.");
  const sources = (await requete<LigneSource>(`SELECT * FROM geodata_prix_sources WHERE cle = ANY($1)`, [pub.instantane["sources"]]));
  if (sources.length !== (pub.instantane["sources"] as string[]).length || sources.some((s) => !sourceAutorisee(s.statut))) {
    await journal(req.user!.id, "prix.export.refuse", String(pub.instantane["id"]), "refus", { motif: "source-non-autorisee" });
    return erreur(res, 403, "usage_refuse", "Une source de l'instantané n'est pas autorisée : export refusé.", { usage: "export" });
  }
  const attribution = sources.map((s) => `${s.editeur}${s.licence ? ` (${s.licence})` : ""}`).join(" ; ");
  const cellules = await cellulesFiltrees(String(pub.instantane["id"]), req);
  const corps = csv([
    ["instantane_id", "empreinte", "methode", "territoire", "niveau", "transaction", "type_bien", "etat_bien", "base_surface", "periode", "unite", "etat", "mediane", "q1", "q3",
      "observations_brutes", "observations_eligibles", "biens_distincts", "exclusions", "contribution_sources", "premiere_observation", "derniere_observation", "sources", "nature"],
    ...cellules.map((c) => [pub.instantane["id"], pub.instantane["empreinte"], pub.instantane["methode_version"], c["territoire_code"], c["niveau"], c["transaction"], c["type_bien"],
      c["etat_bien"], c["base_surface"], c["periode"], c["unite"], c["etat"], c["mediane"], c["q1"], c["q3"], c["brutes"], c["eligibles"], c["distinctes"], c["exclusions"],
      c["contribution_sources"], dateIso(c["premiere_observation"]), dateIso(c["derniere_observation"]), attribution, "prix demandes dans les annonces (mediane de biens distincts), pas des prix de transaction"]),
  ]);
  await journal(req.user!.id, "prix.export", String(pub.instantane["id"]), "succes", { produit: "cellules", lignes: cellules.length });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="prix-cellules.csv"');
  res.send(`﻿${corps}`);
});
