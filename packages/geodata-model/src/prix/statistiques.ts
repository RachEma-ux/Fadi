/**
 * Statistiques des prix affichés (Concept §4, Plan §5, lot P5) : cellules par cohorte explicite, reproductibles.
 *
 * Méthode (versionnée par `versionMethode`) :
 * - doublons exacts retirés (même clé d'observation : un réimport ne change rien, PRX02) ;
 * - fenêtre d'observation : `dateReference − fenetreJours < date ≤ dateReference` (90 jours = la date de référence et
 *   les 89 jours qui la précèdent) ; hors fenêtre → exclusion `hors-fenetre` ;
 * - observation non rattachée à un territoire → exclue (`non-rattachee`), comptée au total, jamais devinée ;
 * - un bien (grappe d'annonces, `deduplication.ts`) ne contribue qu'une fois : sa dernière observation éligible dans la
 *   fenêtre (égalité de date → plus grande clé d'observation). Les autres sont exclues (`observation-remplacee` pour
 *   la même annonce, `doublon-inter-sources` pour une autre annonce du même bien) ;
 * - prix unitaire = prix / surface (vente : MAD/m² ; location : MAD/m² par période du loyer, ex. MAD/m²/mois) ;
 * - cohorte = territoire, niveau, transaction, type, état (si ventilé), base de surface, période : la parcelle, la base
 *   inconnue, le loyer journalier ou hebdomadaire forment chacun leurs propres cohortes, jamais mélangées (PRX05) ;
 * - médiane et quartiles : quantile de type 7 de Hyndman et Fan (interpolation linéaire entre statistiques d'ordre),
 *   arrondis au centime ; une cellule sous le seuil de biens distincts est `echantillon-insuffisant`, sans valeur (PRX07) ;
 * - valeurs atypiques signalées (règle versionnée), conservées ; la médiane hors atypiques est fournie pour rapporter la
 *   sensibilité, jamais substituée.
 *
 * Reproductibilité (PRX12) : un manifeste (clés d'entrée triées, empreinte du contenu des entrées, biens, version et
 * paramètres) et une empreinte SHA-256 du résultat ; même entrée et même méthode → mêmes cellules et même empreinte.
 */
import { dedoublonnerExact, type Bien } from "./deduplication.js";
import { empreinteCanonique } from "./hachage.js";
import { arrondirDecimal, composerUnite } from "./montants.js";
import {
  REGLE_ATYPIQUE_V1, VERSION_VALIDATION_PRIX, estDateIso, quantileTrie, signalerAtypiques, validerObservation, type RegleAtypique,
} from "./validation.js";
import {
  cleAnnonce, cleObservation, comparerTexte,
  type BaseSurface, type EtatBien, type EtatDonneePrix, type Monnaie, type ObservationAnnonce, type PeriodePrix, type TransactionPrix, type TypeBien,
} from "./types.js";

/** Convention de quantile retenue (Plan §5). */
export const METHODE_QUANTILE = "hyndman-fan-7";

/** Quantile de type 7 (Hyndman–Fan) : h = (n − 1)·p, x[⌊h⌋] + (h − ⌊h⌋)(x[⌊h⌋+1] − x[⌊h⌋]) ; null sur une liste vide. */
export function quantileType7(valeurs: readonly number[], p: number): number | null {
  if (!valeurs.length) return null;
  return quantileTrie([...valeurs].sort((a, b) => a - b), p);
}

export const mediane = (valeurs: readonly number[]): number | null => quantileType7(valeurs, 0.5);

/** Premier quartile, médiane et troisième quartile (type 7) ; null sur une liste vide. */
export function quartiles(valeurs: readonly number[]): { readonly q1: number; readonly mediane: number; readonly q3: number } | null {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  return { q1: quantileTrie(t, 0.25), mediane: quantileTrie(t, 0.5), q3: quantileTrie(t, 0.75) };
}

// ——— Cohortes ———

export interface DimensionsCohorte {
  readonly territoire: string;
  readonly niveau: string;
  readonly transaction: TransactionPrix;
  readonly typeBien: TypeBien;
  /** État ventilé ; null = non précisé (si ventilé) ou tous états confondus (si non ventilé). */
  readonly etat: EtatBien;
  readonly baseSurface: BaseSurface;
  readonly periode: PeriodePrix;
}

/**
 * Clé stable d'une cohorte. `ventilerParEtat` distingue « non précisé » (`e=non-precise`) de « tous états » (`e=*`).
 */
export function cleCohorte(d: DimensionsCohorte, ventilerParEtat = false): string {
  const e = ventilerParEtat ? (d.etat ?? "non-precise") : "*";
  return `t=${d.territoire}|n=${d.niveau}|tr=${d.transaction}|ty=${d.typeBien}|e=${e}|b=${d.baseSurface}|p=${d.periode}`;
}

// ——— Cellules ———

export interface ParametresCellules {
  /** Fenêtre d'observation en jours (pilote : 90). */
  readonly fenetreJours: number;
  /** Seuil de publication en biens distincts (pilote : 20). */
  readonly seuil: number;
  /** Version de la méthode, consignée dans le manifeste. */
  readonly versionMethode: string;
  /** Date de référence de la fenêtre (AAAA-MM-JJ). */
  readonly dateReference: string;
  /** Ventiler les cohortes par état (ancien / récent / neuf / non précisé). Défaut : non. */
  readonly ventilerParEtat?: boolean;
  /** Règle de signalement des atypiques. Défaut : `REGLE_ATYPIQUE_V1`. */
  readonly regleAtypique?: RegleAtypique;
}

/** Motifs d'exclusion comptés par cellule. */
export const MOTIFS_EXCLUSION_CELLULE = ["hors-fenetre", "observation-remplacee", "doublon-inter-sources"] as const;
export type MotifExclusionCellule = (typeof MOTIFS_EXCLUSION_CELLULE)[number];

export interface CellulePrix extends DimensionsCohorte {
  readonly cle: string;
  readonly monnaie: Monnaie;
  /** Unité des valeurs : `MAD/m2` (vente), `MAD/m2/mois`, `MAD/m2/jour`… (location). */
  readonly unite: string;
  readonly etatDonnee: Extract<EtatDonneePrix, "disponible" | "echantillon-insuffisant">;
  /** Médiane des prix unitaires des biens distincts ; null sous le seuil (jamais 0). */
  readonly mediane: number | null;
  readonly q1: number | null;
  readonly q3: number | null;
  readonly effectifs: {
    /** Observations admises de la cohorte (après retrait des doublons exacts). */
    readonly brutes: number;
    /** Observations dans la fenêtre. */
    readonly eligibles: number;
    /** Biens distincts retenus. */
    readonly distinctes: number;
  };
  readonly exclusions: Readonly<Record<MotifExclusionCellule, number>>;
  /** Nombre de biens retenus par source de l'observation retenue (concentration des sources). */
  readonly contributionParSource: Readonly<Record<string, number>>;
  /** Biens signalés atypiques (conservés dans la médiane). */
  readonly atypiques: number;
  /** Médiane sans les atypiques (sensibilité) ; null sous le seuil ou sans atypique calculable. */
  readonly medianeHorsAtypiques: number | null;
  readonly premiereObservation: string | null;
  readonly derniereObservation: string | null;
  /** Lignée : clés des observations retenues, triées (accès restreint côté API). */
  readonly clesRetenues: readonly string[];
}

export interface ManifesteCellules {
  readonly versionMethode: string;
  readonly versionValidation: string;
  readonly methodeQuantile: string;
  readonly regleAtypique: RegleAtypique;
  readonly parametres: { readonly fenetreJours: number; readonly seuil: number; readonly dateReference: string; readonly ventilerParEtat: boolean };
  /** Clés d'observation d'entrée, uniques et triées. */
  readonly entrees: readonly string[];
  /** SHA-256 du JSON canonique des observations d'entrée (triées) : tout changement de contenu change l'empreinte. */
  readonly empreinteEntrees: string;
  /** Biens regroupant plusieurs annonces (décisions et fusions automatiques appliquées), triés. */
  readonly biens: readonly { readonly id: string; readonly annonces: readonly string[] }[];
  readonly algorithmeEmpreinte: "sha-256";
}

export interface ResultatCellules {
  readonly cellules: readonly CellulePrix[];
  readonly totaux: {
    readonly observations: number;
    readonly doublonsIdentiques: number;
    readonly nonAdmises: number;
    readonly nonRattachees: number;
  };
  readonly manifeste: ManifesteCellules;
  /** SHA-256 du JSON canonique du manifeste. */
  readonly empreinteManifeste: string;
  /** SHA-256 du JSON canonique de { manifeste, cellules } : identifiant reproductible de l'instantané. */
  readonly empreinte: string;
}

const JOUR_MS = 86_400_000;
const jours = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / JOUR_MS;

function verifierParametres(p: ParametresCellules): void {
  if (!Number.isInteger(p.fenetreJours) || p.fenetreJours < 1) throw new RangeError("fenetreJours doit être un entier ≥ 1");
  if (!Number.isInteger(p.seuil) || p.seuil < 1) throw new RangeError("seuil doit être un entier ≥ 1");
  if (!estDateIso(p.dateReference)) throw new RangeError("dateReference doit être une date AAAA-MM-JJ");
  if (!p.versionMethode) throw new RangeError("versionMethode est obligatoire");
}

interface Accumulateur {
  dims: DimensionsCohorte;
  brutes: number;
  eligibles: number;
  exclusions: Record<MotifExclusionCellule, number>;
  retenues: ObservationAnnonce[];
}

/**
 * Construit les cellules de prix à partir des observations admises (`validation.ts`) et des biens
 * (`construireBiens`). Une observation non admise qui serait passée est écartée et comptée (`nonAdmises`).
 */
export function construireCellules(observationsAdmises: readonly ObservationAnnonce[], biens: readonly Bien[], params: ParametresCellules): ResultatCellules {
  verifierParametres(params);
  const ventiler = params.ventilerParEtat ?? false;
  const regle = params.regleAtypique ?? REGLE_ATYPIQUE_V1;
  const dedup = dedoublonnerExact(observationsAdmises);
  const bienDe = new Map<string, string>();
  for (const b of biens) for (const a of b.annonces) bienDe.set(a, b.id);

  let nonAdmises = 0, nonRattachees = 0;
  const acc = new Map<string, Accumulateur>();
  const cohorteDe = new Map<ObservationAnnonce, string>();
  const parBien = new Map<string, ObservationAnnonce[]>();
  const ref = jours(params.dateReference);

  for (const o of dedup.observations) {
    if (!validerObservation(o).admis) { nonAdmises++; continue; }
    if (!o.territoire) { nonRattachees++; continue; }
    const dims: DimensionsCohorte = {
      territoire: o.territoire.code, niveau: o.territoire.niveau, transaction: o.transaction!, typeBien: o.typeBien!,
      etat: ventiler ? o.etat : null, baseSurface: o.baseSurface, periode: o.periode!,
    };
    const cle = cleCohorte(dims, ventiler);
    const a = acc.get(cle) ?? { dims, brutes: 0, eligibles: 0, exclusions: { "hors-fenetre": 0, "observation-remplacee": 0, "doublon-inter-sources": 0 }, retenues: [] };
    acc.set(cle, a);
    a.brutes++;
    const age = ref - jours(o.dateObservation);
    if (age < 0 || age >= params.fenetreJours) { a.exclusions["hors-fenetre"]++; continue; }
    a.eligibles++;
    cohorteDe.set(o, cle);
    const bien = bienDe.get(cleAnnonce(o)) ?? cleAnnonce(o);
    const l = parBien.get(bien) ?? [];
    l.push(o);
    parBien.set(bien, l);
  }

  // Une contribution par bien : sa dernière observation éligible.
  for (const l of parBien.values()) {
    l.sort((x, y) => comparerTexte(y.dateObservation, x.dateObservation) || comparerTexte(cleObservation(y), cleObservation(x)));
    const [retenue, ...autres] = l as [ObservationAnnonce, ...ObservationAnnonce[]];
    acc.get(cohorteDe.get(retenue)!)!.retenues.push(retenue);
    for (const o of autres) {
      acc.get(cohorteDe.get(o)!)!.exclusions[cleAnnonce(o) === cleAnnonce(retenue) ? "observation-remplacee" : "doublon-inter-sources"]++;
    }
  }

  const cellules: CellulePrix[] = [...acc.entries()].sort((x, y) => comparerTexte(x[0], y[0])).map(([cle, a]) => {
    const retenues = a.retenues.sort((x, y) => comparerTexte(cleObservation(x), cleObservation(y)));
    const unitaires = retenues.map((o) => ({ cle: cleObservation(o), valeur: o.prix! / o.surface! }));
    const distinctes = retenues.length;
    const suffisant = distinctes >= params.seuil;
    const q = suffisant ? quartiles(unitaires.map((u) => u.valeur)) : null;
    const atyp = signalerAtypiques(unitaires, regle);
    const atypiques = atyp.signalements.filter((s) => s.atypique).length;
    const horsAtyp = atyp.signalements.filter((s) => !s.atypique).map((s) => s.valeur);
    const contributionParSource: Record<string, number> = {};
    for (const o of retenues) contributionParSource[o.source] = (contributionParSource[o.source] ?? 0) + 1;
    const dates = retenues.map((o) => o.dateObservation).sort(comparerTexte);
    const medHors = suffisant && atypiques > 0 ? mediane(horsAtyp) : null;
    return {
      cle, ...a.dims,
      monnaie: "MAD",
      unite: composerUnite("MAD", true, a.dims.periode),
      etatDonnee: suffisant ? "disponible" : "echantillon-insuffisant",
      mediane: q ? arrondirDecimal(q.mediane) : null,
      q1: q ? arrondirDecimal(q.q1) : null,
      q3: q ? arrondirDecimal(q.q3) : null,
      effectifs: { brutes: a.brutes, eligibles: a.eligibles, distinctes },
      exclusions: a.exclusions,
      contributionParSource: Object.fromEntries(Object.entries(contributionParSource).sort((x, y) => comparerTexte(x[0], y[0]))),
      atypiques,
      medianeHorsAtypiques: medHors === null ? null : arrondirDecimal(medHors),
      premiereObservation: dates[0] ?? null,
      derniereObservation: dates[dates.length - 1] ?? null,
      clesRetenues: retenues.map(cleObservation),
    } satisfies CellulePrix;
  });

  const manifeste: ManifesteCellules = {
    versionMethode: params.versionMethode,
    versionValidation: VERSION_VALIDATION_PRIX,
    methodeQuantile: METHODE_QUANTILE,
    regleAtypique: regle,
    parametres: { fenetreJours: params.fenetreJours, seuil: params.seuil, dateReference: params.dateReference, ventilerParEtat: ventiler },
    entrees: dedup.observations.map(cleObservation),
    empreinteEntrees: empreinteCanonique(dedup.observations),
    biens: biens.filter((b) => b.annonces.length > 1).map((b) => ({ id: b.id, annonces: [...b.annonces].sort(comparerTexte) }))
      .sort((x, y) => comparerTexte(x.id, y.id)),
    algorithmeEmpreinte: "sha-256",
  };
  return {
    cellules,
    totaux: { observations: observationsAdmises.length, doublonsIdentiques: dedup.doublonsIdentiques, nonAdmises, nonRattachees },
    manifeste,
    empreinteManifeste: empreinteCanonique(manifeste),
    empreinte: empreinteCanonique({ manifeste, cellules }),
  };
}
