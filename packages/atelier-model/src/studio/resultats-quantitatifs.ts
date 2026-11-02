import { bilanQuantitesStudio, type DeductionDeclaree } from "./bilan-quantites.js";
import type { StudioDocument } from "./document-2d.js";
import { studioSha256 } from "./empreinte-sha256.js";
import { studioJsonStable } from "./projections.js";
import { GRANDEUR_CUMULABLE, quantitesStudio, UNITE_GRANDEUR, type GrandeurQuantite, type MotifNonEvalue, type QuantitesStudio, type UniteQuantite } from "./quantites.js";

/**
 * Résultat quantitatif traçable (IF-008, EX-077) et cohérence des totaux (EX-078). Pur : ni React, ni DOM, ni stockage.
 *
 * Contrat IF-008 : `quantityId + sourceRevisionSet + ruleId + ruleVersion + sourceObjectIds + unit + rawValue +
 * deductions + displayValue + freshnessStatus` ; `manualAdjustment` facultatif, distinct, motivé et attribué. La
 * structure physique (table, colonne) reste une décision ouverte de la fiche : ce module en est la forme logique, servie
 * par l'API à côté du métré (`GET …/quantites`, champ `resultats`), recalculée à chaque lecture depuis la révision.
 *
 * - **Jeu de sources** (`sourceRevisionSet`) : la ou les révisions immuables lues (étude, variante, révision, empreinte
 *   SHA-256 du document) et l'identifiant du jeu (SHA-256 de son JSON canonique).
 * - **Règle** : chaque grandeur est calculée par une règle nommée et versionnée (`STUDIO_REGLES_METRE`) ; une règle qui
 *   change de calcul change de version, et un total refuse de mélanger deux versions.
 * - **Précision interne** : flottant binaire 64 bits (IEEE 754), aucune valeur arrondie avant l'affichage ; l'arrondi de
 *   présentation est déclaré (`arrondiPresentation`) et n'affecte que `displayValue`.
 * - **Exclusions** : ce que la quantité n'a pas compté, élément par élément, avec son motif (cotes et annotations hors
 *   métré, éléments non natifs, objets dont la grandeur n'est pas évaluée) — jamais un silence.
 * - **Ajustement manuel** : une donnée distincte (`manualAdjustment` : valeur, unité, motif, auteur, date), jamais le
 *   remplacement de `rawValue`. Sans motif ou sans auteur, ou dans une autre unité, il est refusé (`ajusterResultat`).
 * - **Actualité** (`freshnessStatus`) : `a-jour` tant que chaque révision source est la tête de sa variante ; `perimee`
 *   sinon ; `source-inconnue` si une variante source n'existe plus. Jamais « à jour » par défaut.
 *
 * Totaux (EX-078, `totaliserResultats`) : une somme ne mélange pas sans le signaler des unités, grandeurs, règles ou
 * versions de règle, ni des jeux de sources différents ; dès qu'un mélange est relevé, aucun total n'est produit
 * (`valeur: null`) et les signalements disent pourquoi. Les totaux distinguent brut, déductions, net, quantités non
 * testées (non évaluées) et corrections manuelles.
 */

export const STUDIO_RESULTAT_QUANTITATIF_SCHEMA = "studio-resultat-quantitatif/1" as const;

/** Règle de calcul d'une grandeur : identifiant stable et version (à incrémenter avec tout changement de calcul). */
export interface RegleMetre {
  ruleId: string;
  ruleVersion: string;
  grandeur: GrandeurQuantite;
  description: string;
}

const regle = (grandeur: GrandeurQuantite, description: string): RegleMetre => ({ ruleId: `studio.metre.${grandeur}`, ruleVersion: "1", grandeur, description });
/** Règles du métré Studio (E.3-04, A.4), une par grandeur. */
export const STUDIO_REGLES_METRE: Readonly<Record<GrandeurQuantite, RegleMetre>> = Object.freeze({
  longueur: regle("longueur", "Longueur exacte du tracé saisi (segments, arcs rθ, renflements)."),
  perimetre: regle("perimetre", "Périmètre exact du contour fermé saisi."),
  surface: regle("surface", "Aire exacte du contour fermé saisi (polygone et segments circulaires signés)."),
  hauteur: regle("hauteur", "Hauteur d'extrusion déclarée ; non cumulable."),
  "surface-laterale": regle("surface-laterale", "Périmètre × hauteur d'extrusion déclarée."),
  "surface-verticale": regle("surface-verticale", "Longueur × hauteur d'extrusion déclarée (surface ouverte)."),
  volume: regle("volume", "Aire × hauteur d'extrusion déclarée (volume brut)."),
  "volume-deduit": regle("volume-deduit", "Vides des ouvertures déclarées d'un mur architectural (largeur × hauteur × épaisseur)."),
  "volume-net": regle("volume-net", "Volume brut du mur architectural moins les vides de ses ouvertures déclarées."),
  "surface-ouverture": regle("surface-ouverture", "Largeur × hauteur d'une ouverture déclarée."),
});

/** Révision source d'une quantité. */
export interface RevisionSourceQuantite {
  studyId: string;
  variantId: string;
  revisionId: string;
  /** SHA-256 du JSON canonique du document de la révision. */
  documentHash: string;
}
export interface JeuSourcesQuantite {
  /** SHA-256 du JSON canonique des révisions (triées). */
  id: string;
  revisions: RevisionSourceQuantite[];
}

export type MotifExclusion = "cote-hors-metre" | "annotation-hors-metre" | "non-natif-hors-metre" | "grandeur-non-evaluee";
export interface ExclusionQuantite {
  ref: string;
  motif: MotifExclusion;
  /** Motif du métré pour une grandeur non évaluée. */
  detail?: MotifNonEvalue;
}

export interface AjustementManuelQuantite {
  valeur: number;
  unit: UniteQuantite;
  motif: string;
  /** Compte auteur. */
  auteur: string;
  /** Date ISO 8601. */
  date: string;
}

export type FraicheurQuantite = "a-jour" | "perimee" | "source-inconnue";

export interface ResultatQuantitatif {
  schema: typeof STUDIO_RESULTAT_QUANTITATIF_SCHEMA;
  /** Identité stable : SHA-256 (préfixé) du jeu de sources, de la règle, de la portée et des objets sources. */
  quantityId: string;
  /** `objet` : une grandeur d'un objet ; `total` : somme de la grandeur sur le document (grandeur cumulable). */
  portee: "objet" | "total";
  sourceRevisionSet: JeuSourcesQuantite;
  ruleId: string;
  ruleVersion: string;
  grandeur: GrandeurQuantite;
  unit: UniteQuantite;
  /** Objets inclus (évalués). */
  sourceObjectIds: string[];
  /** Valeur calculée, pleine précision ; null : non évaluée (« non testée » dans un total). */
  rawValue: number | null;
  motifNonEvalue?: MotifNonEvalue;
  /** Déductions détaillées (volume net d'un mur architectural) ; tableau vide : aucune déduction applicable. */
  deductions: DeductionDeclaree[];
  exclusions: ExclusionQuantite[];
  precisionInterne: "ieee754-binary64";
  arrondiPresentation: { decimales: number; mode: "demi-eloigne-de-zero" };
  /** Valeur affichée (arrondie à la présentation, « non évalué » si absente) ; ne sert jamais au calcul. */
  displayValue: string;
  /** Date du calcul (ISO 8601, horloge de l'appelant). */
  computedAt: string;
  freshnessStatus: FraicheurQuantite;
  manualAdjustment?: AjustementManuelQuantite;
}

export const STUDIO_NON_EVALUE_QUANTITE = "non évalué" as const;
const DECIMALES_DEFAUT = 3;

/** Valeur arrondie pour l'affichage seulement (décimale « , » du français). */
export function valeurAffichee(v: number | null, decimales = DECIMALES_DEFAUT): string {
  if (v === null || !Number.isFinite(v)) return STUDIO_NON_EVALUE_QUANTITE;
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: false }).format(v);
}

/** Jeu de sources : révisions triées, identifiant = SHA-256 de leur JSON canonique. */
export function jeuSourcesQuantite(revisions: readonly RevisionSourceQuantite[]): JeuSourcesQuantite {
  if (!revisions.length) throw new RangeError("au moins une révision source attendue");
  const triees = [...revisions].map((r) => ({ studyId: r.studyId, variantId: r.variantId, revisionId: r.revisionId, documentHash: r.documentHash }))
    .sort((a, b) => (a.variantId + a.revisionId < b.variantId + b.revisionId ? -1 : 1));
  return { id: studioSha256(studioJsonStable({ schema: "studio-jeu-sources/1", revisions: triees })), revisions: triees };
}

const identite = (jeu: JeuSourcesQuantite, r: RegleMetre, portee: "objet" | "total", objets: readonly string[]): string =>
  `q_${studioSha256(studioJsonStable({ jeu: jeu.id, ruleId: r.ruleId, ruleVersion: r.ruleVersion, portee, objets: [...objets].sort() })).slice(0, 32)}`;

export interface OptionsResultats {
  /** Date du calcul (ISO 8601). */
  calculeLe: string;
  decimales?: number;
  /** Métré déjà calculé du document (sinon calculé ici). */
  metre?: QuantitesStudio;
}

/** Exclusions du document : cotes, annotations et éléments non natifs, jamais comptés par le métré. */
function exclusionsDocument(doc: StudioDocument): ExclusionQuantite[] {
  return [
    ...(doc.dimensions ?? []).map((d) => ({ ref: d.id, motif: "cote-hors-metre" as const })),
    ...(doc.annotations ?? []).map((a) => ({ ref: a.id, motif: "annotation-hors-metre" as const })),
    ...(doc.nonNatifs ?? []).map((n) => ({ ref: n.id, motif: "non-natif-hors-metre" as const })),
  ];
}

/**
 * Résultats quantitatifs d'une révision : une entrée par grandeur de chaque objet, puis un total par grandeur cumulable.
 * Toutes portent le même jeu de sources (cette révision) et sont « à jour » au calcul.
 */
export function resultatsQuantitatifs(doc: StudioDocument, source: RevisionSourceQuantite, o: OptionsResultats): ResultatQuantitatif[] {
  if (typeof o?.calculeLe !== "string" || Number.isNaN(Date.parse(o.calculeLe))) throw new RangeError("date de calcul ISO 8601 attendue");
  const decimales = o.decimales ?? DECIMALES_DEFAUT;
  const jeu = jeuSourcesQuantite([source]);
  const metre = o.metre ?? quantitesStudio(doc);
  const bilan = bilanQuantitesStudio(doc, metre);
  const deductionsDe = new Map(bilan.lignes.map((l) => [l.objetId, l.deductions]));
  const commun = { schema: STUDIO_RESULTAT_QUANTITATIF_SCHEMA, sourceRevisionSet: jeu, precisionInterne: "ieee754-binary64" as const, arrondiPresentation: { decimales, mode: "demi-eloigne-de-zero" as const }, computedAt: o.calculeLe, freshnessStatus: "a-jour" as const };
  const sortie: ResultatQuantitatif[] = [];
  for (const objet of metre.objets) {
    for (const v of objet.valeurs) {
      const r = STUDIO_REGLES_METRE[v.grandeur];
      const deductions = v.grandeur === "volume-net" ? deductionsDe.get(objet.objetId) ?? [] : [];
      sortie.push({
        ...commun, quantityId: identite(jeu, r, "objet", [objet.objetId]), portee: "objet", ruleId: r.ruleId, ruleVersion: r.ruleVersion, grandeur: v.grandeur, unit: v.unite,
        sourceObjectIds: [objet.objetId], rawValue: v.valeur, ...(v.valeur === null ? { motifNonEvalue: v.motif ?? "geometrie-invalide" } : {}),
        deductions, exclusions: [], displayValue: valeurAffichee(v.valeur, decimales),
      });
    }
  }
  const docExclus = exclusionsDocument(doc);
  for (const t of metre.totaux) {
    if (!GRANDEUR_CUMULABLE[t.grandeur]) continue;
    const r = STUDIO_REGLES_METRE[t.grandeur];
    const inclus: string[] = [];
    const exclus: ExclusionQuantite[] = [...docExclus];
    for (const objet of metre.objets) {
      const v = objet.valeurs.find((x) => x.grandeur === t.grandeur);
      if (!v) continue;
      if (v.valeur === null) exclus.push({ ref: objet.objetId, motif: "grandeur-non-evaluee", detail: v.motif ?? "geometrie-invalide" });
      else inclus.push(objet.objetId);
    }
    const deductions = t.grandeur === "volume-net" ? bilan.lignes.flatMap((l) => (l.net !== null ? l.deductions : [])) : [];
    sortie.push({
      ...commun, quantityId: identite(jeu, r, "total", inclus), portee: "total", ruleId: r.ruleId, ruleVersion: r.ruleVersion, grandeur: t.grandeur, unit: t.unite,
      sourceObjectIds: inclus, rawValue: t.valeur, deductions, exclusions: exclus, displayValue: valeurAffichee(t.valeur, decimales),
    });
  }
  return sortie;
}

/** Actualité de résultats contre les têtes courantes des variantes (absente de la table : variante disparue). */
export function fraicheurResultats(resultats: readonly ResultatQuantitatif[], tetes: ReadonlyMap<string, string>): ResultatQuantitatif[] {
  return resultats.map((r) => {
    let f: FraicheurQuantite = "a-jour";
    for (const s of r.sourceRevisionSet.revisions) {
      const tete = tetes.get(s.variantId);
      if (tete === undefined) { f = "source-inconnue"; break; }
      if (tete !== s.revisionId) f = "perimee";
    }
    return { ...r, freshnessStatus: f };
  });
}

export type RefusAjustementResultat = "motif-obligatoire" | "auteur-obligatoire" | "unite-incompatible" | "valeur-invalide" | "date-invalide";

/**
 * Ajustement manuel d'un résultat : donnée distincte, motivée et attribuée. `rawValue` n'est jamais modifiée ; un
 * ajustement sans motif ni auteur, dans une autre unité, d'une valeur invalide ou mal daté est refusé.
 */
export function ajusterResultat(r: ResultatQuantitatif, a: AjustementManuelQuantite): { ok: ResultatQuantitatif } | { refus: RefusAjustementResultat } {
  if (typeof a?.motif !== "string" || !a.motif.trim()) return { refus: "motif-obligatoire" };
  if (typeof a.auteur !== "string" || !a.auteur.trim()) return { refus: "auteur-obligatoire" };
  if (a.unit !== r.unit) return { refus: "unite-incompatible" };
  if (typeof a.valeur !== "number" || !Number.isFinite(a.valeur) || a.valeur < 0) return { refus: "valeur-invalide" };
  if (typeof a.date !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(a.date) || Number.isNaN(Date.parse(a.date))) return { refus: "date-invalide" };
  return { ok: { ...r, manualAdjustment: { valeur: a.valeur, unit: a.unit, motif: a.motif.trim(), auteur: a.auteur.trim(), date: a.date } } };
}

/** Valeur retenue : l'ajustement manuel s'il existe, sinon la valeur calculée. */
export const valeurRetenue = (r: ResultatQuantitatif): number | null => r.manualAdjustment?.valeur ?? r.rawValue;

// ——— Totaux (EX-078) ———

export type SignalementTotal =
  | { type: "unites-heterogenes"; unites: UniteQuantite[] }
  | { type: "grandeurs-heterogenes"; grandeurs: GrandeurQuantite[] }
  | { type: "grandeur-non-cumulable"; grandeur: GrandeurQuantite }
  | { type: "regles-incompatibles"; regles: string[] }
  | { type: "revisions-heterogenes"; jeux: string[] };

export interface TotalResultats {
  unit: UniteQuantite | null;
  grandeur: GrandeurQuantite | null;
  /** Mélanges relevés ; non vide : aucun total n'est produit. */
  signalements: SignalementTotal[];
  /** Brut : somme des valeurs calculées, déductions détaillées rajoutées ; null si non produit ou rien d'évalué. */
  brut: number | null;
  /** Somme des déductions détaillées des quantités évaluées. */
  deductions: number | null;
  /** Net : somme des valeurs calculées (une quantité à déductions est déjà nette) ; brut − déductions. */
  net: number | null;
  /** Quantités non testées (non évaluées) : le total est alors partiel. */
  nonTestees: number;
  /** Corrections manuelles : nombre et écart cumulé (ajustée − calculée), rapportés à part. */
  corrections: { nombre: number; ecart: number | null };
  /** Total retenu (calculées, corrections comprises) ; null si non produit. */
  retenu: number | null;
  /** Nombre de quantités sommées. */
  quantites: number;
}

const unique = <T>(v: readonly T[]): T[] => [...new Set(v)];

/** Somme contrôlée de résultats quantitatifs : signale tout mélange au lieu de produire un total trompeur. */
export function totaliserResultats(resultats: readonly ResultatQuantitatif[]): TotalResultats {
  const unites = unique(resultats.map((r) => r.unit));
  const grandeurs = unique(resultats.map((r) => r.grandeur));
  const regles = unique(resultats.map((r) => `${r.ruleId}@${r.ruleVersion}`));
  const jeux = unique(resultats.map((r) => r.sourceRevisionSet.id));
  const signalements: SignalementTotal[] = [];
  if (unites.length > 1) signalements.push({ type: "unites-heterogenes", unites });
  if (grandeurs.length > 1) signalements.push({ type: "grandeurs-heterogenes", grandeurs });
  if (grandeurs.length === 1 && !GRANDEUR_CUMULABLE[grandeurs[0]!]) signalements.push({ type: "grandeur-non-cumulable", grandeur: grandeurs[0]! });
  if (regles.length > 1) signalements.push({ type: "regles-incompatibles", regles });
  if (jeux.length > 1) signalements.push({ type: "revisions-heterogenes", jeux });
  const nonTestees = resultats.filter((r) => r.rawValue === null).length;
  const ajustes = resultats.filter((r) => r.manualAdjustment);
  const base = { unit: unites.length === 1 ? unites[0]! : null, grandeur: grandeurs.length === 1 ? grandeurs[0]! : null, signalements, nonTestees, quantites: resultats.length };
  if (signalements.length) return { ...base, brut: null, deductions: null, net: null, retenu: null, corrections: { nombre: ajustes.length, ecart: null } };
  // La valeur calculée d'une quantité à déductions (volume net) est déjà nette : son brut = valeur + déductions.
  const evalues = resultats.filter((r) => r.rawValue !== null);
  const net = evalues.length ? evalues.reduce((s, r) => s + r.rawValue!, 0) : null;
  const deductions = evalues.reduce((s, r) => s + r.deductions.reduce((t, d) => t + d.valeur, 0), 0);
  const retenues = resultats.map(valeurRetenue).filter((v): v is number => v !== null);
  const ecart = ajustes.reduce((s, r) => s + (r.manualAdjustment!.valeur - (r.rawValue ?? 0)), 0);
  return {
    ...base, brut: net === null ? null : net + deductions, deductions, net,
    retenu: retenues.length ? retenues.reduce((s, v) => s + v, 0) : null,
    corrections: { nombre: ajustes.length, ecart: ajustes.length ? ecart : 0 },
  };
}

/** Unité attendue d'une grandeur (rappel du vocabulaire). */
export const uniteDeGrandeur = (g: GrandeurQuantite): UniteQuantite => UNITE_GRANDEUR[g];
