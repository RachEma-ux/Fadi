/**
 * Prix immobiliers (Concept Prix v1.1, lot P7) — logique pure de l'interface : libellés français des codes rendus par
 * l'API (états, statuts, produits, motifs, dimensions de comparaison), mise en forme des montants publiés (≈ quand
 * l'éditeur abrège), tri et filtre des tableaux. Aucune donnée : les valeurs viennent toutes de la base, lues par l'API
 * (D-GD-29). Une valeur absente n'est jamais 0 : elle porte un libellé explicite.
 */
import { formatNombre, type DimensionComparaison, type EtatDonneePrix, type TypeBien } from "@parcours/geodata-model";
import type { CellulePrixRecue, EditionPrixRecue, LignePrixRecue, MontantPublieRecu } from "../client";

/** Thème des sources de la couche des prix affichés (code technique de la fiche de source, pas une donnée). */
export const THEME_PRIX = "prix-immobiliers";

/** États d'affichage : états des données (modèle) et états de lecture de l'interface. */
export type EtatAffichagePrix = EtatDonneePrix | "chargement" | "erreur";

/** Libellés des états (Concept §5 : manquant, insuffisant, périmé, non autorisé, en échec… restent distincts). */
export const LIBELLES_ETAT_PRIX: Readonly<Record<EtatAffichagePrix, string>> = {
  disponible: "Disponible",
  "echantillon-insuffisant": "Échantillon insuffisant",
  "non-autorise": "Non autorisé",
  indisponible: "Indisponible",
  perime: "Données périmées",
  historique: "Édition historique",
  "validite-non-verifiee": "Validité non vérifiée",
  echec: "Échec du chargement des données",
  chargement: "Chargement…",
  erreur: "Lecture impossible",
};

/** Repère non coloré de chaque état (icône textuelle, doublée du libellé). */
export const SYMBOLES_ETAT_PRIX: Readonly<Record<EtatAffichagePrix, string>> = {
  disponible: "✓",
  "echantillon-insuffisant": "◔",
  "non-autorise": "⊘",
  indisponible: "○",
  perime: "⌛",
  historique: "↺",
  "validite-non-verifiee": "?",
  echec: "✕",
  chargement: "…",
  erreur: "✕",
};

export const estEtatConnu = (e: string): e is EtatAffichagePrix => Object.hasOwn(LIBELLES_ETAT_PRIX, e);
export const libelleEtatPrix = (e: string): string => (estEtatConnu(e) ? LIBELLES_ETAT_PRIX[e] : "État non reconnu");
export const symboleEtatPrix = (e: string): string => (estEtatConnu(e) ? SYMBOLES_ETAT_PRIX[e] : "?");
/** Ton visuel d'un état : seul « disponible » est neutre ; tout autre état attire l'attention (jamais par la couleur seule). */
export const tonEtatPrix = (e: string): "ok" | "attente" | "alerte" => (e === "disponible" ? "ok" : e === "chargement" ? "attente" : "alerte");

/** Statuts d'une source du registre (Concept §2) ; `bloquee` est le statut du dossier pour une source sans voie permise. */
export const LIBELLES_STATUT_SOURCE: Readonly<Record<string, string>> = {
  candidate: "Candidate",
  qualifiee: "Qualifiée",
  autorisee: "Autorisée",
  active: "Active",
  suspendue: "Suspendue",
  retiree: "Retirée",
  bloquee: "Bloquée",
};
export const libelleStatutSource = (s: string): string => LIBELLES_STATUT_SOURCE[s] ?? "Statut non reconnu";
export const statutSourceUtilisable = (s: string): boolean => s === "active" || s === "autorisee";

/** Produits des deux couches de prix. */
export const LIBELLES_PRODUIT_PRIX: Readonly<Record<string, string>> = {
  "agregat-publie": "Agrégat publié par un tiers",
  observations: "Observations d'annonces (médianes calculées par Fadi)",
  "valeurs-officielles": "Valeurs officielles",
  "contexte-indice": "Indice de contexte (jamais un niveau de prix)",
  "contexte-transactions": "Contexte des transactions",
};
export const libelleProduitPrix = (p: string): string => LIBELLES_PRODUIT_PRIX[p] ?? "Produit non reconnu";

/** Couches de prix (libellés du Concept §3 et §4). */
export const LIBELLES_COUCHE_PRIX: Readonly<Record<"annonces" | "officielle", string>> = {
  annonces: "Prix immobiliers affichés dans les annonces",
  officielle: "Valeurs immobilières de référence officielles",
};

/** Motifs codés d'état d'une couche (`MotifEtatCouche` du modèle) et statuts de source qui bloquent. */
export const LIBELLES_MOTIF_PRIX: Readonly<Record<string, string>> = {
  "source-candidate": "Source candidate : réutilisation non établie",
  "source-qualifiee": "Source qualifiée mais pas encore autorisée",
  "source-suspendue": "Source suspendue",
  "source-retiree": "Source retirée",
  "source-bloquee": "Source bloquée : aucune voie de réutilisation permise",
  "aucune-edition": "Aucune édition importée",
  "aucune-donnee": "Aucune valeur publiable dans l'édition",
  "import-echoue": "Le dernier import a échoué",
  "edition-historique": "Édition historique : elle ne remplace pas une valeur en vigueur",
  "validite-non-verifiee": "Validité de l'édition non vérifiée",
  "date-donnees-inconnue": "Date des données inconnue",
  "donnees-perimees": "Données plus anciennes que la règle de fraîcheur",
  "aucun-instantane": "Aucun instantané publié",
};
/** Motif : libellé d'interface s'il est codé, sinon le texte du registre tel quel (donnée, non traduite). */
export const libelleMotifPrix = (m: string): { texte: string; code: boolean } =>
  LIBELLES_MOTIF_PRIX[m] !== undefined ? { texte: LIBELLES_MOTIF_PRIX[m]!, code: true } : { texte: m, code: false };

/** Types de biens (codes du modèle) au pluriel, comme dans les tableaux. */
export const LIBELLES_TYPE_BIEN: Readonly<Record<TypeBien, string>> = {
  appartement: "Appartements",
  maison: "Maisons",
  villa: "Villas",
  terrain: "Terrains",
  bureau: "Bureaux",
  "local-commercial": "Locaux commerciaux",
  studio: "Studios",
  immeuble: "Immeubles",
  ferme: "Fermes",
  autre: "Autres biens",
};
const ORDRE_TYPES = Object.keys(LIBELLES_TYPE_BIEN);
export const libelleTypeBien = (t: string): string => (LIBELLES_TYPE_BIEN as Record<string, string>)[t] ?? "Type de bien non reconnu";

export const LIBELLES_TRANSACTION_PRIX: Readonly<Record<"vente" | "location", string>> = { vente: "Vente", location: "Location" };

/** Dimensions qui empêchent une comparaison (PRX09), en clair. */
export const LIBELLES_DIMENSION_COMPARAISON: Readonly<Record<DimensionComparaison, string>> = {
  territoire: "Territoire : aucune attribution spatiale qualifiée",
  "type-bien": "Type de bien différent",
  etat: "État du bien (ancien, récent, neuf) différent",
  transaction: "Transaction différente (vente ou location)",
  "base-surface": "Base de surface différente",
  "base-non-documentee": "Base de calcul de la valeur affichée non documentée",
  monnaie: "Monnaie différente",
  unite: "Unité différente",
  dates: "Dates non compatibles",
  "validite-reference": "Référence officielle non valide à cette date",
  autorisation: "Une des deux valeurs n'est pas autorisée",
  "etat-valeur-marche": "Valeur affichée indisponible ou insuffisante",
  "reference-non-positive": "Référence officielle non positive",
  "forme-non-applicable": "Forme de la référence non applicable à cette cohorte",
};
export const libelleDimension = (d: string): string => (LIBELLES_DIMENSION_COMPARAISON as Record<string, string>)[d] ?? "Dimension non reconnue";

export const LIBELLES_POSITION_FOURCHETTE: Readonly<Record<"en-dessous" | "dans" | "au-dessus", string>> = {
  "en-dessous": "En dessous de la fourchette officielle",
  dans: "Dans la fourchette officielle",
  "au-dessus": "Au-dessus de la fourchette officielle",
};

/** Unité affichée : m² en exposant, période en français (l'anglais vient du dictionnaire). */
export function formaterUnitePrix(u: string | null | undefined): string {
  if (!u) return "unité non publiée";
  return u.replace(/m2\b/g, "m²").replace(/\bmonth\b/g, "mois").replace(/\bDH\b/g, "MAD");
}

/** Mise en forme d'un montant publié. `absent` : rien de publié (jamais 0). `approximatif` : abrégé par l'éditeur. */
export interface MontantAffiche { readonly absent: boolean; readonly texte: string; readonly approximatif: boolean; readonly original: string | null }
export function formaterMontantPrix(m: MontantPublieRecu | null | undefined): MontantAffiche {
  if (!m || m.valeur === null || m.valeur === undefined || !Number.isFinite(m.valeur)) return { absent: true, texte: "non publié", approximatif: false, original: m?.texte ?? null };
  const approximatif = !!m.approximatif;
  const nombre = formatNombre(m.valeur, Number.isInteger(m.valeur) ? 0 : 2);
  return { absent: false, texte: `${approximatif ? "≈ " : ""}${nombre}`, approximatif, original: m.texte ?? null };
}

/** Nombre (effectif, médiane calculée) : absent → libellé donné, jamais 0. */
export const formaterNombrePrix = (v: number | null | undefined, absent = "non publié"): string =>
  v === null || v === undefined || !Number.isFinite(v) ? absent : formatNombre(v, Number.isInteger(v) ? 0 : 2);

/** Signe typographique d'un pourcentage : + ou − (signe moins), rien pour zéro. */
const pourcentSigne = (v: number, decimales: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNombre(Math.abs(v), decimales)} %`;
/** Tendance publiée sur 3 mois : « non publiée » quand l'éditeur ne la publie pas (jamais 0). */
export const formaterTendancePrix = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? "non publiée" : pourcentSigne(v, 1));
/** Écart descriptif à la référence officielle (Concept §6), au centième. */
export const formaterEcartPrix = (v: number): string => pourcentSigne(v, 2);

/** Période d'une édition : texte publié, ou bornes AAAA-MM-JJ au format suisse. */
export function formaterPeriodePrix(p: EditionPrixRecue["periode"]): string | null {
  if (!p) return null;
  if (typeof p === "string") return p;
  return `${formaterDatePrix(p.debut) ?? p.debut} → ${formaterDatePrix(p.fin) ?? p.fin}`;
}
/** Date (AAAA-MM-JJ ou horodatage ISO) au format suisse, en heure suisse. */
export function formaterDatePrix(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" });
}

/** Lignes de niveau ville d'une transaction, dans l'ordre des types de biens. */
export function lignesVillePrix(lignes: readonly LignePrixRecue[], transaction: "vente" | "location"): LignePrixRecue[] {
  const rang = (t: string) => { const i = ORDRE_TYPES.indexOf(t); return i < 0 ? ORDRE_TYPES.length : i; };
  return lignes.filter((l) => l.niveauGeo === "ville" && l.transaction === transaction).sort((a, b) => rang(a.typeBien) - rang(b.typeBien) || a.libelleGeo.localeCompare(b.libelleGeo, "fr"));
}

/** Clés de tri des tableaux de quartiers. */
export type CleTriPrix = "libelleGeo" | "nombreAnnonces" | "prixMedian" | "prixM2" | "tendance90j";
export type OrdreTri = "asc" | "desc";
const valeurTri = (l: LignePrixRecue, c: CleTriPrix): number | string | null => {
  switch (c) {
    case "libelleGeo": return l.libelleGeo;
    case "nombreAnnonces": return l.nombreAnnonces;
    case "prixMedian": return l.prixMedian?.valeur ?? null;
    case "prixM2": return l.prixM2?.valeur ?? null;
    case "tendance90j": return l.tendance90j;
  }
};
/** Tri stable ; une valeur absente va toujours en fin de tableau, quel que soit l'ordre (elle n'est pas un 0). */
export function trierLignesPrix(lignes: readonly LignePrixRecue[], cle: CleTriPrix, ordre: OrdreTri): LignePrixRecue[] {
  const s = ordre === "asc" ? 1 : -1;
  return lignes.map((l, i) => ({ l, i })).sort((a, b) => {
    const va = valeurTri(a.l, cle), vb = valeurTri(b.l, cle);
    if (va === null && vb === null) return a.i - b.i;
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb), "fr", { sensitivity: "base" }) : va - vb;
    return c === 0 ? a.i - b.i : c * s;
  }).map((x) => x.l);
}

const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Filtre texte sur le libellé publié (casse et accents ignorés). */
export function filtrerLignesPrix(lignes: readonly LignePrixRecue[], texte: string): LignePrixRecue[] {
  const f = normaliser(texte);
  return f ? lignes.filter((l) => normaliser(l.libelleGeo).includes(f)) : [...lignes];
}

/** Lignes par quartier commercial (non rattachées) séparées par transaction. */
export function quartiersParTransaction(lignes: readonly LignePrixRecue[]): { vente: LignePrixRecue[]; location: LignePrixRecue[] } {
  const q = lignes.filter((l) => l.niveauGeo === "quartier-commercial");
  return { vente: q.filter((l) => l.transaction === "vente"), location: q.filter((l) => l.transaction === "location") };
}

/** Prochain tri après un clic sur l'en-tête : même colonne → ordre inversé ; autre colonne → texte croissant, nombre décroissant. */
export function triSuivant(courant: { cle: CleTriPrix; ordre: OrdreTri }, cle: CleTriPrix): { cle: CleTriPrix; ordre: OrdreTri } {
  if (courant.cle === cle) return { cle, ordre: courant.ordre === "asc" ? "desc" : "asc" };
  return { cle, ordre: cle === "libelleGeo" ? "asc" : "desc" };
}

/** Libellé d'une cohorte d'observations (texte, ou dimensions de la cohorte jointes). */
export function libelleCohorte(c: CellulePrixRecue["cohorte"]): string {
  if (typeof c === "string") return c;
  if (!c || typeof c !== "object") return "—";
  return Object.values(c).filter((v) => v !== null && v !== undefined && v !== "").map(String).join(" · ") || "—";
}
/** Total des exclusions d'une cellule (nombre, ou motifs → nombres). */
export function totalExclusions(e: CellulePrixRecue["exclusions"]): number | null {
  if (e === null || e === undefined) return null;
  if (typeof e === "number") return e;
  return Object.values(e).reduce((n, x) => n + (Number.isFinite(x) ? x : 0), 0);
}

/** Types et transactions présents au niveau ville (choix de la carte de comparaison). */
export function choixComparaison(lignes: readonly LignePrixRecue[]): { type: string; transaction: "vente" | "location" }[] {
  const vus = new Set<string>();
  const out: { type: string; transaction: "vente" | "location" }[] = [];
  for (const t of ["vente", "location"] as const) for (const l of lignesVillePrix(lignes, t)) {
    const k = `${l.typeBien}|${t}`;
    if (!vus.has(k)) { vus.add(k); out.push({ type: l.typeBien, transaction: t }); }
  }
  return out;
}

/** Tous les libellés français de ce module (contrôle du dictionnaire anglais, D-163). */
export const TEXTES_PRIX: readonly string[] = [
  ...Object.values(LIBELLES_ETAT_PRIX), ...Object.values(LIBELLES_STATUT_SOURCE), ...Object.values(LIBELLES_PRODUIT_PRIX),
  ...Object.values(LIBELLES_COUCHE_PRIX), ...Object.values(LIBELLES_MOTIF_PRIX), ...Object.values(LIBELLES_TYPE_BIEN),
  ...Object.values(LIBELLES_TRANSACTION_PRIX), ...Object.values(LIBELLES_DIMENSION_COMPARAISON), ...Object.values(LIBELLES_POSITION_FOURCHETTE),
  "État non reconnu", "Statut non reconnu", "Produit non reconnu", "Type de bien non reconnu", "Dimension non reconnue",
  "unité non publiée", "non publié", "non publiée",
];
