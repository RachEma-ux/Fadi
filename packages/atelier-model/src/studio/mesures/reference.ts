/**
 * AC-002 / TEST-016 — « Une barre contenant environ vingt outils de dessin usuels peut être ouverte sans initialiser tous
 * les modules spécialisés. Le test compare les requêtes réseau, la taille transférée, les chunks exécutés et l'empreinte
 * mémoire à une référence, en distinguant cache froid et chaud. Aucun taux de réduction n'est présumé avant mesure. »
 *
 * Pur : une **référence versionnée** (`studio-reference-mesures/1`, établie par une mesure réelle sur un appareil désigné,
 * jamais saisie) et le **verdict** d'une nouvelle mesure contre elle, par cache. La comparaison est une garde de
 * régression : une valeur au-delà de la référence augmentée de sa tolérance est une régression ; en deçà de la
 * référence diminuée de sa tolérance, une amélioration constatée (la référence est à rétablir, aucun taux n'est
 * annoncé d'avance). Les invariants d'AC-002 sont jugés à part : aucune famille de morceaux spécialisés exécutée, aucun
 * moteur hors de ceux de la planche initialisé, aucun fichier interdit (binaire du noyau exact) demandé.
 * Une mesure faite sur une autre classe d'appareil que la référence n'est pas comparée (« non évalué »).
 */

export const STUDIO_REFERENCE_MESURES_SCHEMA = "studio-reference-mesures/1" as const;

/** Grandeurs comparées, par cache. */
export const STUDIO_GRANDEURS_CHARGEMENT = Object.freeze(["requetes", "octetsTransferes", "octetsServeur", "chunksExecutes", "tasOctets"] as const);
export type StudioGrandeurChargement = (typeof STUDIO_GRANDEURS_CHARGEMENT)[number];

export type StudioMesureChargement = { [G in StudioGrandeurChargement]: number | null };

export interface StudioReferenceMesures {
  schema: typeof STUDIO_REFERENCE_MESURES_SCHEMA;
  /** Révision de la référence : montée à chaque rétablissement, avec son motif. */
  revision: number;
  etablieLe: string;
  commit: string;
  build: string;
  motif: string;
  appareil: { classe: "chromium-logiciel" | "appareil-gpu"; navigateur: string; moteurWebgl: string | null; fenetre: { largeur: number; hauteur: number } };
  /** Profil d'outils de la barre mesurée (identifiants). */
  profil: readonly string[];
  repetitions: number;
  /** Tolérance relative par grandeur, et marge absolue (même unité que la grandeur) pour les petites valeurs. */
  tolerances: { [G in StudioGrandeurChargement]: { relative: number; absolue: number } };
  froid: StudioMesureChargement;
  chaud: StudioMesureChargement;
  invariants: {
    /** Familles de morceaux du build (carte `/chargement.json`) qui ne doivent jamais être exécutées. */
    famillesInterdites: readonly string[];
    /** Moteurs (`__fadiRessources`) admis initialisés avec la barre de vingt outils. */
    moteursAdmis: readonly string[];
    /** Motifs (expressions régulières) de fichiers qui ne doivent jamais être demandés. */
    fichiersInterdits: readonly string[];
  };
}

export interface StudioMesureCache extends StudioMesureChargement {
  /** Familles des morceaux exécutés (carte du build). */
  famillesExecutees: readonly string[];
  moteursInitialises: readonly string[];
  fichiersDemandes: readonly string[];
}

export type StudioVerdictGrandeur = "conforme" | "regression" | "amelioration" | "non-evalue";

export interface StudioComparaisonGrandeur {
  cache: "froid" | "chaud";
  grandeur: StudioGrandeurChargement;
  mesure: number | null;
  reference: number | null;
  borneHaute: number | null;
  borneBasse: number | null;
  /** Écart relatif constaté (mesure / référence − 1), sans interprétation. */
  ecartRelatif: number | null;
  verdict: StudioVerdictGrandeur;
}

export interface StudioVerdictReference {
  verdict: "conforme" | "regression" | "non-evalue";
  comparaisons: StudioComparaisonGrandeur[];
  invariants: { cache: "froid" | "chaud"; regle: "famille-interdite-executee" | "moteur-non-admis-initialise" | "fichier-interdit-demande"; detail: string }[];
  /** Une amélioration a été constatée : la référence est à rétablir (aucun taux annoncé d'avance). */
  referenceARetablir: boolean;
  motifs: string[];
}

/** Erreurs de forme d'une référence (vide : valide). */
export function studioValiderReference(r: unknown): string[] {
  const e: string[] = [];
  const o = r as Partial<StudioReferenceMesures> | null;
  if (!o || typeof o !== "object") return ["référence absente"];
  if (o.schema !== STUDIO_REFERENCE_MESURES_SCHEMA) e.push(`schéma ${String(o.schema)} au lieu de ${STUDIO_REFERENCE_MESURES_SCHEMA}`);
  if (!Number.isInteger(o.revision) || (o.revision ?? 0) < 1) e.push("révision entière ≥ 1 exigée");
  for (const c of ["etablieLe", "commit", "build", "motif"] as const) if (typeof o[c] !== "string" || !o[c]) e.push(`${c} manquant`);
  if (!o.appareil || (o.appareil.classe !== "chromium-logiciel" && o.appareil.classe !== "appareil-gpu")) e.push("classe d'appareil manquante");
  if (!Array.isArray(o.profil) || o.profil.length < 15 || o.profil.length > 25) e.push("profil d'environ vingt outils exigé (15 à 25)");
  if (!Number.isInteger(o.repetitions) || (o.repetitions ?? 0) < 1) e.push("répétitions manquantes");
  for (const cache of ["froid", "chaud"] as const) {
    for (const g of STUDIO_GRANDEURS_CHARGEMENT) {
      const v = o[cache]?.[g];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) e.push(`${cache}.${g} : valeur mesurée exigée`);
    }
  }
  for (const g of STUDIO_GRANDEURS_CHARGEMENT) {
    const t = o.tolerances?.[g];
    if (!t || !(t.relative >= 0 && t.relative < 1) || !(t.absolue >= 0)) e.push(`tolérance ${g} invalide`);
  }
  if (!o.invariants || !Array.isArray(o.invariants.famillesInterdites) || o.invariants.famillesInterdites.length === 0) e.push("familles interdites manquantes");
  if (!o.invariants || !Array.isArray(o.invariants.moteursAdmis)) e.push("moteurs admis manquants");
  if (!o.invariants || !Array.isArray(o.invariants.fichiersInterdits)) e.push("fichiers interdits manquants");
  return e;
}

/**
 * Verdict d'une mesure (froid et chaud) contre la référence. `appareil` : classe et fenêtre de la mesure ; une autre
 * classe ou une autre fenêtre que celles de la référence → « non évalué » (rien n'est comparé entre appareils).
 */
export function studioComparerAReference(
  ref: StudioReferenceMesures,
  mesure: { froid: StudioMesureCache | null; chaud: StudioMesureCache | null },
  appareil: { classe: StudioReferenceMesures["appareil"]["classe"]; fenetre: { largeur: number; hauteur: number } },
): StudioVerdictReference {
  const motifs: string[] = [];
  const erreurs = studioValiderReference(ref);
  if (erreurs.length) return { verdict: "non-evalue", comparaisons: [], invariants: [], referenceARetablir: false, motifs: [`référence invalide : ${erreurs.join(" ; ")}`] };
  if (appareil.classe !== ref.appareil.classe || appareil.fenetre.largeur !== ref.appareil.fenetre.largeur || appareil.fenetre.hauteur !== ref.appareil.fenetre.hauteur) {
    return { verdict: "non-evalue", comparaisons: [], invariants: [], referenceARetablir: false, motifs: [`appareil de la mesure (${appareil.classe}, ${appareil.fenetre.largeur}×${appareil.fenetre.hauteur}) différent de la référence (${ref.appareil.classe}, ${ref.appareil.fenetre.largeur}×${ref.appareil.fenetre.hauteur}) : non comparé`] };
  }
  const comparaisons: StudioComparaisonGrandeur[] = [];
  const invariants: StudioVerdictReference["invariants"] = [];
  const interdits = ref.invariants.fichiersInterdits.map((m) => new RegExp(m));
  for (const cache of ["froid", "chaud"] as const) {
    const m = mesure[cache];
    if (!m) motifs.push(`cache ${cache} non mesuré`);
    for (const g of STUDIO_GRANDEURS_CHARGEMENT) {
      const r = ref[cache][g]!, t = ref.tolerances[g];
      const v = m?.[g] ?? null;
      const haute = r * (1 + t.relative) + t.absolue, basse = Math.max(0, r * (1 - t.relative) - t.absolue);
      const verdict: StudioVerdictGrandeur = v === null ? "non-evalue" : v > haute ? "regression" : v < basse ? "amelioration" : "conforme";
      comparaisons.push({ cache, grandeur: g, mesure: v, reference: r, borneHaute: haute, borneBasse: basse, ecartRelatif: v === null || r === 0 ? null : v / r - 1, verdict });
    }
    if (!m) continue;
    for (const f of m.famillesExecutees) if (ref.invariants.famillesInterdites.includes(f)) invariants.push({ cache, regle: "famille-interdite-executee", detail: f });
    for (const id of m.moteursInitialises) if (!ref.invariants.moteursAdmis.includes(id)) invariants.push({ cache, regle: "moteur-non-admis-initialise", detail: id });
    for (const f of m.fichiersDemandes) if (interdits.some((x) => x.test(f))) invariants.push({ cache, regle: "fichier-interdit-demande", detail: f });
  }
  const regressions = comparaisons.filter((c) => c.verdict === "regression");
  for (const c of regressions) motifs.push(`régression ${c.cache}.${c.grandeur} : ${c.mesure} > ${c.borneHaute!.toFixed(0)} (référence ${c.reference})`);
  for (const i of invariants) motifs.push(`invariant AC-002 (${i.cache}) : ${i.regle} — ${i.detail}`);
  const nonEvalues = comparaisons.filter((c) => c.verdict === "non-evalue");
  const verdict = regressions.length || invariants.length ? "regression" : nonEvalues.length ? "non-evalue" : "conforme";
  if (verdict === "non-evalue") motifs.push(`${nonEvalues.length} grandeur(s) non mesurée(s)`);
  return { verdict, comparaisons, invariants, referenceARetablir: comparaisons.some((c) => c.verdict === "amelioration"), motifs };
}

/**
 * Nouvelle référence établie depuis une mesure (médianes par cache), révision suivante : le seul chemin d'écriture,
 * jamais une saisie. Les tolérances et invariants de la référence précédente sont conservés.
 */
export function studioEtablirReference(
  precedente: StudioReferenceMesures,
  mesure: { froid: StudioMesureChargement; chaud: StudioMesureChargement },
  contexte: { etablieLe: string; commit: string; build: string; motif: string; appareil: StudioReferenceMesures["appareil"]; repetitions: number },
): StudioReferenceMesures {
  const copie = (m: StudioMesureChargement): StudioMesureChargement => Object.fromEntries(STUDIO_GRANDEURS_CHARGEMENT.map((g) => [g, m[g]])) as StudioMesureChargement;
  return { ...precedente, revision: precedente.revision + 1, ...contexte, froid: copie(mesure.froid), chaud: copie(mesure.chaud) };
}
