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
  if (ligne.length < 2) throw new Error("Une ligne de profil a au moins deux sommets.");
  if (!(pas > 0)) throw new Error("Pas d'échantillonnage strictement positif requis.");
  const points: PointProfil[] = [];
  let chainage = 0;
  const ajouter = (x: number, y: number, ch: number) => {
    if (points.length >= maxPoints) throw new Error(`Profil limité à ${maxPoints} points : traitement de fond requis.`);
    const v = altitudeAuPoint(ordonnees, x, y);
    const src = v ? ordonnees.find((s) => s.id === v.source)! : null;
    points.push({ chainage: ch, x, y, altitude: v?.valeur ?? null, source: v?.source ?? null, interpolee: v ? v.interpolee || pas < src!.pas : false });
  };
  for (let i = 0; i < ligne.length - 1; i++) {
    const [x0, y0] = ligne[i]!;
    const [x1, y1] = ligne[i + 1]!;
    const long = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(long / pas - 1e-9));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = Math.min(1, (k * pas) / long);
      if (k === n) ajouter(x1, y1, chainage + long);
      else ajouter(x0 + t * (x1 - x0), y0 + t * (y1 - y0), chainage + k * pas);
    }
    chainage += long;
  }
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
