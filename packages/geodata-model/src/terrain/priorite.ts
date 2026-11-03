/**
 * Choix de la source d'altitude et profils (TER-D16, plan § TER-03, Issue #381). Logique pure :
 *  1. le produit d'abord (MNT ou MNS) — l'un ne remplace jamais l'autre ;
 *  2. seules les versions publiées (acceptées puis publiées) sont candidates ;
 *  3. parmi celles qui couvrent le point (emprise exacte, NoData exclu) : la plus fine (pas natif), puis la meilleure
 *     qualité (précision mesurée si elle existe, sinon déclarée ; « non évaluée » en dernier), puis la plus récente ;
 *  4. une référence verticale différente de celle retenue écarte la source (aucune transformation approuvée ici) ;
 *  5. aucune source : « indisponible », jamais une valeur inventée.
 */
import type { ProduitTerrain } from "./catalogue.js";
import { pointsLigne } from "./services.js";

export interface SourceAltitude {
  readonly id: string;
  readonly produit: ProduitTerrain;
  readonly publiee: boolean;
  /** Pas natif en mètres. */
  readonly pas: number;
  readonly precisionMesuree: number | null;
  readonly precisionDeclaree: number | null;
  /** Date du levé ou de la version (ISO), ou null. */
  readonly date: string | null;
  /** Code de la référence verticale retenue (« EPSG:3855 »…) ou null si non déclarée. */
  readonly referenceVerticale: string | null;
  /** Valeur au point (coordonnées dans un repère commun choisi par l'appelant), null hors couverture ou NoData. */
  valeur(x: number, y: number): { readonly valeur: number; readonly interpolee: boolean } | null;
}

/**
 * Date triable des données (TER-D16 : date du levé, sinon de la version) lue dans le texte déclaré par la fiche : la plus
 * récente des dates qu'il cite (AAAA-MM-JJ, JJ.MM.AAAA ou année seule, 1900 à 2199), au format ISO ; null si aucune.
 * Jamais la date de publication dans Fadi : une republication ne rend pas une mesure plus récente.
 */
export function dateDeDonnees(texte: string | null): string | null {
  if (!texte) return null;
  const dates: string[] = [];
  for (const m of texte.matchAll(/\b(19\d\d|2[01]\d\d)-(\d\d)-(\d\d)\b/g)) dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of texte.matchAll(/\b(\d\d)\.(\d\d)\.(19\d\d|2[01]\d\d)\b/g)) dates.push(`${m[3]}-${m[2]}-${m[1]}`);
  for (const m of texte.replace(/\b\d\d\.\d\d\.\d{4}\b|\b\d{4}-\d\d-\d\d\b/g, " ").matchAll(/\b(19\d\d|2[01]\d\d)\b/g)) dates.push(`${m[1]}-12-31`);
  return dates.length ? dates.sort().at(-1)! : null;
}

const qualite = (s: SourceAltitude) => s.precisionMesuree ?? s.precisionDeclaree ?? Number.POSITIVE_INFINITY;

/** Ordre de priorité de sources candidates pour un produit (sans tenir compte de la couverture du point). */
export function ordonnerSources(sources: readonly SourceAltitude[], produit: ProduitTerrain, referenceVerticale: string | null): SourceAltitude[] {
  return sources
    .filter((s) => s.produit === produit && s.publiee && (referenceVerticale === null || s.referenceVerticale === referenceVerticale))
    .slice()
    .sort((a, b) => a.pas - b.pas || qualite(a) - qualite(b) || (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
}

export interface ValeurAltitude { readonly valeur: number; readonly source: string; readonly interpolee: boolean }

/** Altitude au point par la première source ordonnée qui le couvre ; null = indisponible. */
export function altitudeAuPoint(ordonnees: readonly SourceAltitude[], x: number, y: number): ValeurAltitude | null {
  for (const s of ordonnees) {
    const v = s.valeur(x, y);
    if (v) return { valeur: v.valeur, source: s.id, interpolee: v.interpolee };
  }
  return null;
}

export interface PointProfil { readonly chainage: number; readonly x: number; readonly y: number; readonly altitude: number | null; readonly source: string | null; readonly interpolee: boolean }
export interface Profil {
  readonly points: readonly PointProfil[];
  /** Chaînages où la source change (raccord entre jeux, jamais silencieux). */
  readonly transitions: readonly { readonly chainage: number; readonly de: string | null; readonly vers: string | null }[];
  /** Intervalles sans altitude (hors couverture, NoData). */
  readonly lacunes: readonly { readonly debut: number; readonly fin: number }[];
}

/**
 * Profil le long d'une polyligne (repère métrique commun), un point tous les `pas` mètres et à chaque sommet. Un point
 * plus serré que le pas natif de sa source est marqué interpolé ; un changement de source est une transition ; un trou
 * est une lacune.
 */
export function profil(ligne: readonly (readonly [number, number])[], pas: number, ordonnees: readonly SourceAltitude[], maxPoints = 10_000): Profil {
  const points: PointProfil[] = pointsLigne(ligne, pas, maxPoints).map(({ chainage, x, y }) => {
    const v = altitudeAuPoint(ordonnees, x, y);
    const src = v ? ordonnees.find((s) => s.id === v.source)! : null;
    return { chainage, x, y, altitude: v?.valeur ?? null, source: v?.source ?? null, interpolee: v ? v.interpolee || pas < src!.pas : false };
  });
  const transitions: { chainage: number; de: string | null; vers: string | null }[] = [];
  const lacunes: { debut: number; fin: number }[] = [];
  let debutLacune: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prec = points[i - 1];
    if (prec && prec.source !== p.source) transitions.push({ chainage: p.chainage, de: prec.source, vers: p.source });
    if (p.altitude === null && debutLacune === null) debutLacune = p.chainage;
    if (p.altitude !== null && debutLacune !== null) { lacunes.push({ debut: debutLacune, fin: prec!.chainage }); debutLacune = null; }
  }
  if (debutLacune !== null) lacunes.push({ debut: debutLacune, fin: points[points.length - 1]!.chainage });
  return { points, transitions, lacunes };
}
