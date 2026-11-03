/**
 * Porte qualité d'une version de terrain (plan v1.0, § TER-01 et TER-03, Issue #381). Statistiques **exactement** comme
 * au plan : pour le point de contrôle i, résidu e_i = altitude du modèle − altitude levée ; biais = moyenne(e_i) ;
 * RMSEz = racine(moyenne(e_i²)) ; P95 = 95ᵉ percentile empirique de |e_i|.
 *
 * Choix déclarés : percentile empirique par la méthode du **rang le plus proche** (valeur de rang ⌈0,95 n⌉ des |e_i|
 * triés) ; aucun point n'est retiré en silence — un point sans valeur du modèle (hors couverture, NoData) est **exclu et
 * listé avec son motif** ; aucun niveau de confiance n'est déduit du RMSE ; l'incertitude de chaque point et la méthode
 * de contrôle sont conservées. Sans point de contrôle indépendant, la qualité est « non évaluée ».
 */

export interface ResiduControle {
  readonly id: string;
  readonly classe: string;
  /** Altitude du modèle − altitude levée (m), ou null si le modèle n'a pas de valeur au point. */
  readonly residu: number | null;
  readonly incertitude: number | null;
}

export interface Statistiques {
  readonly n: number;
  readonly biais: number;
  readonly rmsez: number;
  readonly p95: number;
  readonly maxAbs: number;
}

export interface RapportQualite {
  readonly methodePercentile: "rang-le-plus-proche";
  readonly global: Statistiques | null;
  readonly parClasse: Readonly<Record<string, Statistiques>>;
  readonly exclus: readonly { readonly id: string; readonly motif: string }[];
}

/** Percentile empirique (rang le plus proche) d'une série déjà triée par ordre croissant. */
export function percentileRangProche(tries: readonly number[], p: number): number {
  if (!tries.length) throw new Error("Série vide.");
  const rang = Math.max(1, Math.ceil(p * tries.length));
  return tries[rang - 1]!;
}

export function statistiques(residus: readonly number[]): Statistiques | null {
  if (!residus.length) return null;
  const n = residus.length;
  const biais = residus.reduce((s, e) => s + e, 0) / n;
  const rmsez = Math.sqrt(residus.reduce((s, e) => s + e * e, 0) / n);
  const abs = residus.map(Math.abs).sort((a, b) => a - b);
  return { n, biais, rmsez, p95: percentileRangProche(abs, 0.95), maxAbs: abs[abs.length - 1]! };
}

export function rapportQualite(points: readonly ResiduControle[]): RapportQualite {
  const valides = points.filter((p): p is ResiduControle & { residu: number } => p.residu !== null && Number.isFinite(p.residu));
  const classes = [...new Set(valides.map((p) => p.classe))].sort();
  const parClasse: Record<string, Statistiques> = {};
  for (const c of classes) parClasse[c] = statistiques(valides.filter((p) => p.classe === c).map((p) => p.residu))!;
  return {
    methodePercentile: "rang-le-plus-proche",
    global: statistiques(valides.map((p) => p.residu)),
    parClasse,
    exclus: points.filter((p) => p.residu === null || !Number.isFinite(p.residu)).map((p) => ({ id: p.id, motif: "Aucune valeur du modèle au point (hors couverture ou NoData)." })),
  };
}

export type EtatQualite = "non-evaluee" | "conforme" | "non-conforme" | "sans-cible";
export interface CiblesQualite { readonly rmsez: number; readonly p95: number; readonly classe: string | null }

/**
 * État de qualité : « non évaluée » sans point ; « sans cible » si aucune cible n'est convenue (le rapport est alors
 * seulement descriptif) ; sinon conforme si RMSEz et P95 respectent les cibles (sur la classe visée, ou l'ensemble).
 */
export function etatQualite(r: RapportQualite, cibles: CiblesQualite | null): EtatQualite {
  if (!r.global) return "non-evaluee";
  if (!cibles) return "sans-cible";
  const s = cibles.classe ? r.parClasse[cibles.classe] : r.global;
  if (!s) return "non-evaluee";
  return s.rmsez <= cibles.rmsez && s.p95 <= cibles.p95 ? "conforme" : "non-conforme";
}

/** Lit un fichier CSV de points de contrôle `id;x;y;z;classe;incertitude` (séparateur ; ou ,). Erreur explicite sinon. */
export function lirePointsControle(texte: string): { id: string; x: number; y: number; z: number; classe: string; incertitude: number | null }[] {
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lignes.length) throw new Error("Fichier de points de contrôle vide.");
  const sep = lignes[0]!.includes(";") ? ";" : ",";
  const entete = lignes[0]!.split(sep).map((c) => c.trim().toLowerCase());
  const attendu = ["id", "x", "y", "z", "classe", "incertitude"];
  if (attendu.some((c, i) => entete[i] !== c)) throw new Error(`En-tête attendu : ${attendu.join(sep)}`);
  const ids = new Set<string>();
  return lignes.slice(1).map((l, i) => {
    const [id, x, y, z, classe, inc] = l.split(sep).map((c) => c.trim());
    const n = (v: string | undefined) => (v === undefined || v === "" ? Number.NaN : Number(v));
    if (!id || ids.has(id)) throw new Error(`Ligne ${i + 2} : identifiant absent ou en double.`);
    ids.add(id);
    if (![n(x), n(y), n(z)].every(Number.isFinite)) throw new Error(`Ligne ${i + 2} : x, y et z numériques requis.`);
    if (!classe) throw new Error(`Ligne ${i + 2} : classe de terrain requise.`);
    const incertitude = inc === undefined || inc === "" ? null : n(inc);
    if (incertitude !== null && !(incertitude >= 0)) throw new Error(`Ligne ${i + 2} : incertitude positive ou vide.`);
    return { id, x: n(x), y: n(y), z: n(z), classe, incertitude };
  });
}
