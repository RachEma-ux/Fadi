/**
 * Déduplication des observations d'annonces (Concept §4, PRX02–PRX04).
 *
 * 1. Doublons exacts : une même observation (source, identifiant d'annonce, date) réimportée n'est comptée qu'une fois
 *    (PRX02) ; plusieurs observations d'une même annonce sont résumées par la plus récente.
 * 2. Doublons inter-sources : paires candidates établies sur des signaux documentés (règle versionnée
 *    `doublons-v1`) — même libellé de localité normalisé, même type de bien, même transaction, même période et même base
 *    de surface, surface et prix à ±3 % l'un de l'autre, empreinte de contenu facultative. Confiance `forte` seulement si
 *    les empreintes existent et sont égales ; sinon `a-revoir`. Seules les paires `forte` sont fusionnées
 *    automatiquement ; une paire `a-revoir` ne l'est **jamais** sans décision revue (PRX04).
 * 3. Biens : les décisions persistées (fusion, séparation) sont rejouées de façon déterministe ; l'identifiant d'un bien
 *    est la plus petite clé d'annonce qu'il regroupe. Un bien garde toute sa lignée (toutes ses annonces) mais ne
 *    contribue qu'une fois aux statistiques (PRX03).
 */
import { normaliserLibelleLocalite } from "./rattachement.js";
import { jsonCanonique } from "./hachage.js";
import { cleAnnonce, cleObservation, comparerTexte, type ObservationAnnonce } from "./types.js";

// ——— 1. Doublons exacts ———

export interface ResultatDedoublonnageExact {
  /** Observations uniques, triées par clé d'observation. */
  readonly observations: readonly ObservationAnnonce[];
  /** Nombre d'observations identiques écartées (réimport). */
  readonly doublonsIdentiques: number;
  /**
   * Clés d'observation présentes plusieurs fois avec un contenu différent : conflit d'import à revoir. La version
   * retenue est la plus petite dans l'ordre du JSON canonique (choix déterministe, indépendant de l'ordre d'entrée).
   */
  readonly conflits: readonly string[];
}

/** Retire les doublons exacts (même clé d'observation) ; même entrée dans n'importe quel ordre → même sortie. */
export function dedoublonnerExact(observations: readonly ObservationAnnonce[]): ResultatDedoublonnageExact {
  const parCle = new Map<string, { obs: ObservationAnnonce; json: string }[]>();
  for (const o of observations) {
    const k = cleObservation(o);
    const l = parCle.get(k) ?? [];
    l.push({ obs: o, json: jsonCanonique(o) });
    parCle.set(k, l);
  }
  let doublonsIdentiques = 0;
  const conflits: string[] = [];
  const retenues: ObservationAnnonce[] = [];
  for (const k of [...parCle.keys()].sort(comparerTexte)) {
    const l = parCle.get(k)!.sort((a, b) => comparerTexte(a.json, b.json));
    const distincts = new Set(l.map((x) => x.json));
    if (distincts.size > 1) conflits.push(k);
    doublonsIdentiques += l.length - distincts.size;
    retenues.push(l[0]!.obs);
  }
  return { observations: retenues, doublonsIdentiques, conflits };
}

/** Plus récente observation de chaque annonce (même source + même identifiant) ; égalité de date → plus grande clé. */
export function derniereObservationParAnnonce(observations: readonly ObservationAnnonce[]): Map<string, ObservationAnnonce> {
  const r = new Map<string, ObservationAnnonce>();
  for (const o of observations) {
    const k = cleAnnonce(o);
    const p = r.get(k);
    if (!p || o.dateObservation > p.dateObservation || (o.dateObservation === p.dateObservation && comparerTexte(cleObservation(o), cleObservation(p)) > 0)) r.set(k, o);
  }
  return new Map([...r.entries()].sort((a, b) => comparerTexte(a[0], b[0])));
}

// ——— 2. Candidats inter-sources ———

export interface RegleDoublons {
  readonly version: string;
  /** Écart relatif maximal de surface, en pour cent du plus petit des deux (3 → ±3 %). */
  readonly toleranceSurfacePourcent: number;
  /** Écart relatif maximal de prix, en pour cent du plus petit des deux. */
  readonly tolerancePrixPourcent: number;
}

export const REGLE_DOUBLONS_V1: RegleDoublons = { version: "doublons-v1", toleranceSurfacePourcent: 3, tolerancePrixPourcent: 3 };

export type ConfianceDoublon = "forte" | "a-revoir";

export interface CandidatDoublon {
  /** Clé d'annonce la plus petite de la paire. */
  readonly a: string;
  readonly b: string;
  readonly confiance: ConfianceDoublon;
  readonly signaux: {
    readonly localite: string;
    readonly ecartSurfacePourcent: number;
    readonly ecartPrixPourcent: number;
    readonly empreinte: "egale" | "differente" | "absente";
  };
  readonly regle: string;
}

/** Écart relatif |a − b| / min(a, b), en pour cent. */
const ecartRelatifPourcent = (x: number, y: number): number => (Math.abs(x - y) / Math.min(x, y)) * 100;
/** |a − b| ≤ t % de min(a, b), comparé sans division : |a − b| × 100 ≤ t × min(a, b). */
const dansTolerance = (x: number, y: number, t: number): boolean => Math.abs(x - y) * 100 <= t * Math.min(x, y);

/**
 * Paires candidates de doublons **entre sources différentes**, comparées sur la dernière observation de chaque annonce.
 * Les observations doivent avoir été validées (prix et surface positifs). Résultat trié par (a, b).
 */
export function chercherCandidatsDoublons(observations: readonly ObservationAnnonce[], regle: RegleDoublons = REGLE_DOUBLONS_V1): CandidatDoublon[] {
  const dernieres = [...derniereObservationParAnnonce(observations).entries()];
  // Blocs : seules les annonces de même localité, type, transaction, période et base sont comparées.
  const blocs = new Map<string, [string, ObservationAnnonce][]>();
  for (const e of dernieres) {
    const o = e[1];
    const bloc = [normaliserLibelleLocalite(o.libelleLocalite), o.typeBien, o.transaction, o.periode, o.baseSurface].join("|");
    const l = blocs.get(bloc) ?? [];
    l.push(e);
    blocs.set(bloc, l);
  }
  const paires: CandidatDoublon[] = [];
  for (const l of blocs.values()) {
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const [ka, oa] = l[i]!, [kb, ob] = l[j]!;
        if (oa.source === ob.source) continue;
        if (oa.prix === null || ob.prix === null || oa.surface === null || ob.surface === null) continue;
        if (oa.prix <= 0 || ob.prix <= 0 || oa.surface <= 0 || ob.surface <= 0) continue;
        if (!dansTolerance(oa.surface, ob.surface, regle.toleranceSurfacePourcent)) continue;
        if (!dansTolerance(oa.prix, ob.prix, regle.tolerancePrixPourcent)) continue;
        const ea = oa.empreinte ?? null, eb = ob.empreinte ?? null;
        const empreinte = ea && eb ? (ea === eb ? "egale" : "differente") : "absente";
        const [a, b] = comparerTexte(ka, kb) < 0 ? [ka, kb] : [kb, ka];
        paires.push({
          a, b,
          confiance: empreinte === "egale" ? "forte" : "a-revoir",
          signaux: {
            localite: normaliserLibelleLocalite(oa.libelleLocalite),
            ecartSurfacePourcent: ecartRelatifPourcent(oa.surface, ob.surface),
            ecartPrixPourcent: ecartRelatifPourcent(oa.prix, ob.prix),
            empreinte,
          },
          regle: regle.version,
        });
      }
    }
  }
  return paires.sort((x, y) => comparerTexte(x.a, y.a) || comparerTexte(x.b, y.b));
}

// ——— 3. Biens (grappes d'annonces) ———

/** Décision revue et persistée sur une paire d'annonces. */
export interface DecisionDoublon {
  readonly a: string;
  readonly b: string;
  readonly decision: "fusion" | "separation";
  /** Date de la décision (ISO 8601) : la plus récente l'emporte pour une même paire. */
  readonly date: string;
  readonly auteur: string;
  readonly motif?: string;
}

export interface LienBien {
  readonly a: string;
  readonly b: string;
  readonly origine: "empreinte" | "decision";
}

export interface Bien {
  /** Identifiant stable : la plus petite clé d'annonce du bien. */
  readonly id: string;
  /** Lignée : toutes les annonces regroupées, triées. */
  readonly annonces: readonly string[];
  readonly liens: readonly LienBien[];
}

export interface ResultatBiens {
  readonly biens: readonly Bien[];
  /** Annonce → identifiant de son bien. */
  readonly bienDe: ReadonlyMap<string, string>;
  /** Liens non appliqués parce qu'ils réuniraient deux annonces explicitement séparées. */
  readonly liensRefuses: readonly LienBien[];
  /** Paires `a-revoir` sans décision : file de revue. */
  readonly aRevoir: readonly CandidatDoublon[];
}

const clePaire = (a: string, b: string) => (comparerTexte(a, b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * Construit les biens à partir des annonces, des candidats et des décisions persistées. Déterministe : même entrée
 * (dans n'importe quel ordre) → mêmes biens et mêmes identifiants.
 *
 * - Pour une paire, la décision la plus récente l'emporte ; à date égale, la séparation l'emporte (prudence).
 * - Liens appliqués : fusions décidées (d'abord), puis candidats `forte` non contredits, chacun dans l'ordre (a, b).
 * - Un lien qui réunirait, directement ou par transitivité, deux annonces séparées par décision est refusé et listé.
 * - Les candidats `a-revoir` ne créent jamais de lien ; ceux sans décision sont rendus dans `aRevoir`.
 */
export function construireBiens(annonces: readonly string[], candidats: readonly CandidatDoublon[], decisions: readonly DecisionDoublon[] = []): ResultatBiens {
  const connues = new Set(annonces);
  const decisionDe = new Map<string, DecisionDoublon>();
  const ordreDecisions = [...decisions].sort((x, y) => comparerTexte(x.date, y.date) || (x.decision === y.decision ? 0 : x.decision === "fusion" ? -1 : 1));
  for (const d of ordreDecisions) decisionDe.set(clePaire(d.a, d.b), d);
  const separations = [...decisionDe.values()].filter((d) => d.decision === "separation");

  const norm = (a: string, b: string): [string, string] => (comparerTexte(a, b) <= 0 ? [a, b] : [b, a]);
  const liensFusion: LienBien[] = [...decisionDe.values()].filter((d) => d.decision === "fusion")
    .map((d) => { const [a, b] = norm(d.a, d.b); return { a, b, origine: "decision" as const }; })
    .sort((x, y) => comparerTexte(x.a, y.a) || comparerTexte(x.b, y.b));
  const liensAuto: LienBien[] = candidats.filter((c) => c.confiance === "forte" && !decisionDe.has(clePaire(c.a, c.b)))
    .map((c) => { const [a, b] = norm(c.a, c.b); return { a, b, origine: "empreinte" as const }; })
    .sort((x, y) => comparerTexte(x.a, y.a) || comparerTexte(x.b, y.b));

  // Union-find avec ensembles de membres explicites (petits volumes : grappes de quelques annonces).
  const parent = new Map<string, string>([...connues].map((k) => [k, k]));
  const membres = new Map<string, Set<string>>([...connues].map((k) => [k, new Set([k])]));
  const racine = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  const liensAppliques: LienBien[] = [], liensRefuses: LienBien[] = [];
  for (const lien of [...liensFusion, ...liensAuto]) {
    if (!connues.has(lien.a) || !connues.has(lien.b)) continue;
    const ra = racine(lien.a), rb = racine(lien.b);
    if (ra === rb) { liensAppliques.push(lien); continue; }
    const ma = membres.get(ra)!, mb = membres.get(rb)!;
    const viole = separations.some((s) => (ma.has(s.a) && mb.has(s.b)) || (ma.has(s.b) && mb.has(s.a)));
    if (viole) { liensRefuses.push(lien); continue; }
    const [garde, absorbe] = comparerTexte(ra, rb) <= 0 ? [ra, rb] : [rb, ra];
    parent.set(absorbe, garde);
    for (const m of membres.get(absorbe)!) membres.get(garde)!.add(m);
    membres.delete(absorbe);
    liensAppliques.push(lien);
  }
  const biens: Bien[] = [...membres.values()].map((s) => {
    const liste = [...s].sort(comparerTexte);
    return { id: liste[0]!, annonces: liste, liens: liensAppliques.filter((l) => s.has(l.a)) };
  }).sort((x, y) => comparerTexte(x.id, y.id));
  const bienDe = new Map<string, string>();
  for (const b of biens) for (const a of b.annonces) bienDe.set(a, b.id);
  const aRevoir = candidats.filter((c) => c.confiance === "a-revoir" && !decisionDe.has(clePaire(c.a, c.b)))
    .slice().sort((x, y) => comparerTexte(x.a, y.a) || comparerTexte(x.b, y.b));
  return { biens, bienDe, liensRefuses, aRevoir };
}
