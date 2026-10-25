/**
 * Instrumentation PERF-01 à PERF-10 avant toute optimisation (X.1-09). Définitions relevées mot pour mot dans le
 * référentiel technique (REF-02 §18.1, tableau « Mesures séparées, sans seuils inventés ») : mesure, profils à
 * renseigner, porte de qualité. **Aucun seuil** n'est posé ici : les seuils, appareils et critères d'acceptation
 * relèvent de DEC-13. Le module mesure et journalise seulement (`performance.mark` / `performance.measure` quand
 * l'environnement les offre), dans un relevé borné consultable (Tool Manager, `globalThis.__fadiPerf`).
 *
 * Une mesure ne contient jamais de géométrie ni de contenu de l'étude (EX-095) : un code, une valeur, une unité et
 * quelques étiquettes non sensibles (identifiant d'outil, nature, nombre d'objets).
 *
 * Pur (aucune dépendance) : l'horloge et `performance` sont lus s'ils existent.
 */

export type CodePerf = "PERF-01" | "PERF-02" | "PERF-03" | "PERF-04" | "PERF-05" | "PERF-06" | "PERF-07" | "PERF-08" | "PERF-09" | "PERF-10";
export type UnitePerf = "ms" | "octets" | "nombre";

export interface DefinitionPerf {
  readonly code: CodePerf;
  /** REF-02 §18.1, colonne « Mesure ». */
  readonly mesure: string;
  /** REF-02 §18.1, colonne « Profils à renseigner ». */
  readonly profils: string;
  /** REF-02 §18.1, colonne « Porte de qualité » (sa limite est décidée par DEC-13, jamais ici). */
  readonly porte: string;
  /** Ce que Studio V1 relève effectivement pour ce code. */
  readonly instrumentation: string;
  /** `non-applicable` : aucune opération de ce type dans Studio V1 (déclaré, jamais simulé). */
  readonly etat: "instrumente" | "non-applicable";
}

export const DEFINITIONS_PERF: readonly DefinitionPerf[] = Object.freeze([
  { code: "PERF-01", mesure: "Ouverture de Studio jusqu’à la première action utile.", profils: "Cache froid/chaud, réseau, CPU, appareil.", porte: "p50/p95 avec limite décidée.",
    instrumentation: "Durée entre l’entrée sur la route d’une variante (ou le début de la navigation quand la page s’ouvre directement sur une variante) et la planche prête à recevoir une commande (document lu, barres actives).", etat: "instrumente" },
  { code: "PERF-02", mesure: "Activation d’outil simple et spécialisé.", profils: "Bundle, dépendances, worker, première réponse.", porte: "Temps d’activation + bytes + mémoire.",
    instrumentation: "Durée d’activation de chaque outil (simple : moteurs déjà prêts ; spécialisé : moteur chargé à cette occasion), moteurs chargés ; octets et mémoire relevés par le script de mesure.", etat: "instrumente" },
  { code: "PERF-03", mesure: "Pointeur → preview visible.", profils: "Périphérique, FPS, densité de scène.", porte: "Latence de bout en bout.",
    instrumentation: "Durée entre l’événement du pointeur sur la planche 2D et la trame suivant l’aperçu (deux trames d’animation), avec le nombre d’objets du document.", etat: "instrumente" },
  { code: "PERF-04", mesure: "Snapping/ciblage correct.", profils: "100 / 10 000 / 100 000 primitives illustratives, densité variable.", porte: "p50/p95/p99 ET conformité géométrique.",
    instrumentation: "Durée de résolution de l’accrochage (moteur d’accrochage de la planche) à chaque point posé ou survolé, avec le nombre d’objets ; la conformité géométrique reste vérifiée par les tests d’accrochage.", etat: "instrumente" },
  { code: "PERF-05", mesure: "Navigation 2D/3D.", profils: "Plans annotés, modèles BIM mixtes, GPU réel.", porte: "CPU/GPU séparés, trames manquées.",
    instrumentation: "2D : durée entre un changement de cadrage (zoom, panoramique) et la trame suivante. 3D : durée CPU de renderer.render() — jamais assimilée au coût GPU (EX-097).", etat: "instrumente" },
  { code: "PERF-06", mesure: "Modif. objet architectural.", profils: "Mur hôte, ouvertures, dépendances, index.", porte: "Coût d’invalidation vs reconstruction totale.",
    instrumentation: "Durée d’application d’une commande d’architecture au brouillon (application complète par le modèle) ; l’invalidation incrémentale n’existe pas encore, la comparaison reste à faire.", etat: "instrumente" },
  { code: "PERF-07", mesure: "Booléen exact.", profils: "Formes simples, cas dégénérés, BRep fournisseurs.", porte: "Chargement, calcul, mémoire, erreurs, précision.",
    instrumentation: "Booléen exact (lot F2, noyau OCCT chargé à la demande dans un Worker) : durée du premier chargement, octets transférés du .wasm, instances compilées, durée de chaque calcul et son issue (aboutie, calcul, plantage, délai, annulée) ; mémoire du tas après chaque calcul (PERF-09). Précision : comparaison aperçu / exact relevée par le panneau, cas dégénérés et BRep fournisseurs non mesurés.", etat: "instrumente" },
  { code: "PERF-08", mesure: "Génération documentaire.", profils: "Détails, vues, feuilles multi-sources, PDF/DXF.", porte: "Temps, annulation, export fidèle.",
    instrumentation: "Durée de composition de la feuille de présentation (tâche du groupe de Workers), aboutie, annulée ou en échec.", etat: "instrumente" },
  { code: "PERF-09", mesure: "Mémoire longue session.", profils: "Changement d’outils, fermer/réouvrir.", porte: "Pic, résiduelle, absence de fuite.",
    instrumentation: "Tas JavaScript utilisé (performance.memory, Chromium seulement ; sinon non évalué) à chaque changement d’outil, montage et démontage de la vue 3D et libération d’un moteur.", etat: "instrumente" },
  { code: "PERF-10", mesure: "Travail hors ligne.", profils: "Profils en cache, interruption/sync.", porte: "Disponibilité réelle et données récupérables.",
    instrumentation: "Durée de vérification du cache et nombre d’outils disponibles et indisponibles hors connexion ; durée d’ouverture d’une variante depuis l’appareil faute de réseau.", etat: "instrumente" },
] satisfies DefinitionPerf[]);

export interface MesurePerf {
  readonly code: CodePerf;
  readonly valeur: number;
  readonly unite: UnitePerf;
  /** Instant de la mesure (ms depuis l'origine de la page, ou horloge injectée). */
  readonly t: number;
  readonly etiquettes: Readonly<Record<string, string | number>>;
}

export interface SyntheseCode {
  readonly code: CodePerf;
  readonly unite: UnitePerf | null;
  readonly n: number;
  readonly min: number | null;
  readonly mediane: number | null;
  readonly max: number | null;
  readonly derniere: MesurePerf | null;
}

/**
 * Relevé exporté (`studio-releve-perf.json`, Tool Manager) : format versionné `studio-releve-perf/1`. Un changement
 * incompatible (champ retiré, renommé, de type ou de sens changé) exige `studio-releve-perf/2` ; `controlerRelevePerf`
 * relit un relevé et en nomme chaque écart (jamais de correction).
 */
export const STUDIO_RELEVE_PERF_SCHEMA = "studio-releve-perf/1" as const;
export interface RelevePerf {
  readonly schema: typeof STUDIO_RELEVE_PERF_SCHEMA;
  readonly definitions: readonly DefinitionPerf[];
  readonly contexte: Readonly<Record<string, string | number | null>>;
  readonly synthese: readonly SyntheseCode[];
  readonly journal: readonly MesurePerf[];
}

const CODES_PERF: readonly string[] = ["PERF-01", "PERF-02", "PERF-03", "PERF-04", "PERF-05", "PERF-06", "PERF-07", "PERF-08", "PERF-09", "PERF-10"];
const UNITES_PERF: readonly string[] = ["ms", "octets", "nombre"];
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fini = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
const nombreOuNul = (v: unknown): boolean => v === null || fini(v);
const cles = (o: Record<string, unknown>): string => Object.keys(o).sort().join(",");
function ecartsMesure(m: unknown, ou: string): string[] {
  if (!estObjet(m)) return [`${ou} : objet attendu`];
  const e: string[] = [];
  if (cles(m) !== "code,etiquettes,t,unite,valeur") e.push(`${ou} : champs code, valeur, unite, t, etiquettes attendus`);
  if (!CODES_PERF.includes(m["code"] as string)) e.push(`${ou}.code : code PERF-01 à PERF-10 attendu`);
  if (!fini(m["valeur"])) e.push(`${ou}.valeur : nombre fini attendu`);
  if (!UNITES_PERF.includes(m["unite"] as string)) e.push(`${ou}.unite : ms, octets ou nombre attendu`);
  if (!fini(m["t"])) e.push(`${ou}.t : nombre fini attendu`);
  const et = m["etiquettes"];
  if (!estObjet(et) || !Object.values(et).every((x) => typeof x === "string" || fini(x))) e.push(`${ou}.etiquettes : texte ou nombre attendus`);
  return e;
}

/** Écarts d'un relevé au schéma `studio-releve-perf/1` (liste vide : conforme). Pur. */
export function controlerRelevePerf(r: unknown): string[] {
  if (!estObjet(r)) return ["relevé : objet attendu"];
  const e: string[] = [];
  if (r["schema"] !== STUDIO_RELEVE_PERF_SCHEMA) e.push(`schema : ${STUDIO_RELEVE_PERF_SCHEMA} attendu`);
  if (cles(r) !== "contexte,definitions,journal,schema,synthese") e.push("relevé : champs schema, definitions, contexte, synthese, journal attendus");
  const defs = r["definitions"];
  if (!Array.isArray(defs) || defs.map((d) => (estObjet(d) ? d["code"] : null)).join(",") !== CODES_PERF.join(",")) e.push("definitions : les dix codes PERF-01 à PERF-10, dans l'ordre");
  else defs.forEach((d: Record<string, unknown>, i) => {
    if (!["mesure", "profils", "porte", "instrumentation"].every((k) => typeof d[k] === "string") || !["instrumente", "non-applicable"].includes(d["etat"] as string)) e.push(`definitions[${i}] : mesure, profils, porte, instrumentation et état attendus`);
  });
  const ctx = r["contexte"];
  if (!estObjet(ctx) || !Object.values(ctx).every((x) => x === null || typeof x === "string" || fini(x))) e.push("contexte : texte, nombre ou null attendus");
  const synthese = r["synthese"];
  if (!Array.isArray(synthese)) e.push("synthese : liste attendue");
  else synthese.forEach((s: unknown, i) => {
    if (!estObjet(s) || !CODES_PERF.includes(s["code"] as string)) { e.push(`synthese[${i}] : code attendu`); return; }
    if (!(s["unite"] === null || UNITES_PERF.includes(s["unite"] as string)) || !Number.isInteger(s["n"]) || !["min", "mediane", "max"].every((k) => nombreOuNul(s[k]))) e.push(`synthese[${i}] : unite, n, min, mediane, max attendus`);
    if (s["derniere"] !== null) e.push(...ecartsMesure(s["derniere"], `synthese[${i}].derniere`));
  });
  const journal = r["journal"];
  if (!Array.isArray(journal)) e.push("journal : liste attendue");
  else journal.forEach((m: unknown, i) => e.push(...ecartsMesure(m, `journal[${i}]`)));
  return e;
}

/** Mesures gardées par code (les plus récentes) : un code fréquent (rendu, survol) n'efface jamais les autres. */
const TAILLE_PAR_CODE = 200;

interface PerfLike {
  now(): number;
  mark?(n: string, o?: unknown): unknown;
  measure?(n: string, o?: unknown): unknown;
  clearMarks?(n?: string): void;
  clearMeasures?(n?: string): void;
}
const perfGlobal = (): PerfLike | null => (typeof performance !== "undefined" ? (performance as unknown as PerfLike) : null);

export class ReleveurPerf {
  private readonly parCode = new Map<CodePerf, MesurePerf[]>();
  private readonly totaux = new Map<CodePerf, number>();
  private readonly abonnes = new Set<() => void>();
  private version = 0;

  constructor(private readonly horloge: () => number = () => perfGlobal()?.now() ?? Date.now(), private readonly taille = TAILLE_PAR_CODE) {}

  /** Toutes les mesures gardées, dans l'ordre chronologique. */
  get journal(): MesurePerf[] { return [...this.parCode.values()].flat().sort((a, b) => a.t - b.t); }
  mesures(code: CodePerf): readonly MesurePerf[] { return this.parCode.get(code) ?? []; }

  maintenant(): number { return this.horloge(); }

  /** Enregistre une valeur. Une valeur non finie n'est jamais enregistrée (« non évalué » plutôt qu'un faux zéro). */
  enregistrer(code: CodePerf, valeur: number, unite: UnitePerf = "ms", etiquettes: Record<string, string | number> = {}, debut?: number): MesurePerf | null {
    if (!Number.isFinite(valeur)) return null;
    const t = this.horloge();
    const m: MesurePerf = Object.freeze({ code, valeur, unite, t, etiquettes: Object.freeze({ ...etiquettes }) });
    const liste = this.parCode.get(code) ?? [];
    liste.push(m);
    if (liste.length > this.taille) liste.splice(0, liste.length - this.taille);
    const total = (this.totaux.get(code) ?? 0) + 1;
    this.totaux.set(code, total);
    this.parCode.set(code, liste);
    const p = perfGlobal();
    try {
      // La ligne du temps du navigateur reste bornée elle aussi : aucune croissance en session longue (PERF-09).
      if (total % this.taille === 0) { p?.clearMarks?.(`fadi:${code}`); p?.clearMeasures?.(`fadi:${code}`); }
      if (unite === "ms" && debut !== undefined && p?.measure) p.measure(`fadi:${code}`, { start: debut, end: debut + valeur, detail: m.etiquettes });
      else p?.mark?.(`fadi:${code}`, { detail: { valeur, unite, ...m.etiquettes } });
    } catch { /* environnement sans User Timing niveau 3 : le relevé interne suffit */ }
    this.version += 1;
    for (const f of this.abonnes) f();
    return m;
  }

  /** Début d'une durée ; `fin` l'enregistre. */
  debut(code: CodePerf, etiquettes: Record<string, string | number> = {}): { fin: (plus?: Record<string, string | number>) => MesurePerf | null } {
    const t0 = this.horloge();
    return { fin: (plus = {}) => this.enregistrer(code, this.horloge() - t0, "ms", { ...etiquettes, ...plus }, t0) };
  }

  /** Synthèse par code : effectif, minimum, médiane, maximum, dernière mesure. Aucune porte, aucun verdict. */
  synthese(): SyntheseCode[] {
    return DEFINITIONS_PERF.map(({ code }) => {
      const ms = this.mesures(code);
      if (!ms.length) return { code, unite: null, n: 0, min: null, mediane: null, max: null, derniere: null };
      const unite = ms[ms.length - 1]!.unite;
      const v = ms.filter((m) => m.unite === unite).map((m) => m.valeur).sort((a, b) => a - b);
      const milieu = Math.floor(v.length / 2);
      const mediane = v.length % 2 ? v[milieu]! : (v[milieu - 1]! + v[milieu]!) / 2;
      return { code, unite, n: v.length, min: v[0]!, mediane, max: v[v.length - 1]!, derniere: ms[ms.length - 1]! };
    });
  }

  /** Relevé complet exportable (schéma versionné, définitions, contexte, synthèse, journal). */
  releve(contexte: Record<string, string | number | null> = {}): RelevePerf {
    return { schema: STUDIO_RELEVE_PERF_SCHEMA, definitions: DEFINITIONS_PERF, contexte, synthese: this.synthese(), journal: this.journal };
  }

  readonly abonner = (f: () => void): (() => void) => { this.abonnes.add(f); return () => { this.abonnes.delete(f); }; };
  readonly lireVersion = (): number => this.version;
}

/** Tas JavaScript utilisé (octets), Chromium seulement ; null ailleurs (non évalué). */
export function tasUtilise(): number | null {
  const m = (perfGlobal() as { memory?: { usedJSHeapSize?: number } } | null)?.memory;
  return typeof m?.usedJSHeapSize === "number" ? m.usedJSHeapSize : null;
}

/** Relevé de la session (singleton), lisible par la recette et le script de mesure. */
export const perfStudio = new ReleveurPerf();
(globalThis as { __fadiPerf?: unknown }).__fadiPerf = perfStudio;

/** Mesure mémoire PERF-09 ; rien n'est enregistré si le navigateur ne l'expose pas. */
export function echantillonMemoire(occasion: string): void {
  const tas = tasUtilise();
  if (tas !== null) perfStudio.enregistrer("PERF-09", tas, "octets", { occasion });
}

/** Durée entre `debut` et la trame qui suit le prochain rendu (deux trames d'animation) ; une seule en vol par clé. */
const enVol = new Set<string>();
export function mesurerJusquALaTrame(code: CodePerf, cle: string, debut: number, etiquettes: Record<string, string | number> = {}): void {
  if (typeof requestAnimationFrame !== "function" || enVol.has(cle)) return;
  enVol.add(cle);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    enVol.delete(cle);
    perfStudio.enregistrer(code, perfStudio.maintenant() - debut, "ms", etiquettes, debut);
  }));
}
