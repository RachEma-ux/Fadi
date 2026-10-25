/**
 * Règle des accélérations de Studio (F.1-01, EX-098, EX-056) : **toute accélération supplémentaire n'est activée
 * qu'après preuve du gain ET de la non-régression**, établies par un rapport de comparaison entre le chemin de
 * référence et le chemin accéléré. Ce module est le mécanisme : la règle (`studioEvaluerAcceleration`), le registre des
 * accélérations déclarées (`STUDIO_ACCELERATIONS`), les moteurs par défaut et de référence de chaque surface
 * (`STUDIO_MOTEURS_PAR_DEFAUT`, DEC-08 : SVG pour la planche ; WebGL2 pour la vue 3D) et le contrôle qui refuse un
 * moteur par défaut changé sans rapport qualifiant (`studioControlerMoteursParDefaut`, test « moteur par défaut »).
 *
 * La règle, sans seuil inventé :
 * - **gain** : sur chaque scène mesurée, le p95 du chemin accéléré est strictement inférieur à celui de la référence
 *   (mesures finies des deux côtés ; une scène sans mesure, ou plus lente, refuse) ;
 * - **non-régression** (EX-098) : chaque critère d'équivalence exigé par l'accélération est présent dans le rapport, son
 *   écart est mesuré (jamais « non évalué ») et ne dépasse pas la tolérance déclarée dans le rapport, elle-même bornée
 *   par la tolérance maximale de l'accélération (0 pour un critère exact : mêmes cibles, même sélection…) ;
 * - **appareil** : une accélération GPU exige une mesure sur un appareil réel ; une mesure en rendu logiciel (SwiftShader
 *   de la CI) n'en est pas la preuve (REC-C-02 : profils GPU séparés des mesures logicielles).
 * Un gain hors tolérance est rejeté (EX-098, cas négatif) ; rien n'est activé par défaut sans rapport. Pur.
 */

export const STUDIO_RAPPORT_ACCELERATION_SCHEMA = "studio-rapport-acceleration/1" as const;

/** Critères d'équivalence (EX-098) : mêmes cibles d'accrochage, même sélection, mêmes dimensions et quantités, mêmes objets exportés, même annulation et mêmes conflits, et, pour un moteur de rendu, mêmes primitives et textes exposés. */
export const STUDIO_CRITERES_EQUIVALENCE = Object.freeze([
  "cibles-accrochage", "selection", "dimensions-quantites", "objets-exportes", "annulation-conflits", "primitives-rendues", "textes-accessibles",
] as const);
export type StudioCritereEquivalence = (typeof STUDIO_CRITERES_EQUIVALENCE)[number];

export type StudioSurfaceRendu = "planche-2d" | "vue-3d";
export const STUDIO_MOTEURS = Object.freeze({ "planche-2d": ["svg", "canvas"], "vue-3d": ["webgl2", "webgpu"] } as const);
export type StudioMoteur<S extends StudioSurfaceRendu = StudioSurfaceRendu> = (typeof STUDIO_MOTEURS)[S][number];

export interface StudioAccelerationDeclaree {
  id: string;
  surface: StudioSurfaceRendu | "recherches-2d" | "maillage-3d";
  libelle: string;
  /** Décision qui encadre l'accélération. */
  decision: string;
  reference: string;
  candidat: string;
  /** Critères exigés pour la non-régression et tolérance maximale de chacun (0 : exact). */
  criteres: readonly { critere: StudioCritereEquivalence; toleranceMax: number }[];
  /** Mesure sur appareil réel exigée (accélération GPU). */
  appareilReelRequis: boolean;
  /** État actuel et preuve qui le justifie (tests, recette, mesure). */
  etat: "active" | "inactive";
  preuve: string;
}

/**
 * Accélérations déclarées. `active` : en place, avec sa preuve d'équivalence (DEC-09 : index = parcours linéaire,
 * DEC-10 : lots dont la désignation reste exacte) ; `inactive` : derrière la règle, aucun rapport qualifiant n'existe.
 */
export const STUDIO_ACCELERATIONS: readonly StudioAccelerationDeclaree[] = Object.freeze([
  {
    id: "index-spatial-2d", surface: "recherches-2d", libelle: "Index spatial de la planche (grille uniforme au-delà de 1 000 éléments)", decision: "DEC-09",
    reference: "parcours-lineaire", candidat: "grille-uniforme", criteres: [{ critere: "cibles-accrochage", toleranceMax: 0 }, { critere: "selection", toleranceMax: 0 }],
    appareilReelRequis: false, etat: "active", preuve: "mesure-spatiale.test.ts (index = parcours linéaire, TEST-022) ; recette studio-rend.mjs (mesure C.1 complète en CI)",
  },
  {
    id: "lots-3d", surface: "maillage-3d", libelle: "Lots stables et invalidation par signature de la vue 3D", decision: "DEC-10",
    reference: "reconstruction-complete", candidat: "lots-par-signature", criteres: [{ critere: "selection", toleranceMax: 0 }, { critere: "primitives-rendues", toleranceMax: 0 }],
    appareilReelRequis: false, etat: "active", preuve: "scene-rendu.test.ts, picking.test.ts (désignation exacte des lots)",
  },
  {
    id: "rendu-canvas-planche", surface: "planche-2d", libelle: "Moteur Canvas de la planche 2D", decision: "DEC-08",
    reference: "svg", candidat: "canvas",
    criteres: [{ critere: "primitives-rendues", toleranceMax: 1e-6 }, { critere: "textes-accessibles", toleranceMax: 0 }, { critere: "cibles-accrochage", toleranceMax: 0 }, { critere: "selection", toleranceMax: 0 }],
    appareilReelRequis: false, etat: "inactive", preuve: "TEST-025 (studio-rendu.mjs) : aucun rapport qualifiant",
  },
  {
    id: "webgpu-vue3d", surface: "vue-3d", libelle: "Moteur WebGPU de la vue 3D", decision: "EX-056 / DEC-18",
    reference: "webgl2", candidat: "webgpu", criteres: [{ critere: "primitives-rendues", toleranceMax: 0 }, { critere: "selection", toleranceMax: 0 }],
    appareilReelRequis: true, etat: "inactive", preuve: "aucune mesure sur appareil réel (DEC-13) : repli WebGL2 déclaré",
  },
].map((a) => Object.freeze({ ...a, criteres: Object.freeze(a.criteres.map((c) => Object.freeze({ ...c }))) })) as StudioAccelerationDeclaree[]);

/** Moteur de référence de chaque surface (décision) et moteur par défaut livré : égaux tant qu'aucun rapport ne qualifie un autre. */
export const STUDIO_MOTEURS_DE_REFERENCE: Readonly<{ [S in StudioSurfaceRendu]: StudioMoteur<S> }> = Object.freeze({ "planche-2d": "svg", "vue-3d": "webgl2" });
export const STUDIO_MOTEURS_PAR_DEFAUT: Readonly<{ [S in StudioSurfaceRendu]: StudioMoteur<S> }> = Object.freeze({ "planche-2d": "svg", "vue-3d": "webgl2" });
/** Accélération qui porte chaque moteur candidat d'une surface. */
export const STUDIO_ACCELERATION_DU_MOTEUR: Readonly<Record<string, string>> = Object.freeze({ "planche-2d:canvas": "rendu-canvas-planche", "vue-3d:webgpu": "webgpu-vue3d" });

export interface StudioMesureAcceleration {
  scene: string;
  /** p95 en millisecondes ; null : non mesuré. */
  reference: number | null;
  candidat: number | null;
}
export interface StudioEcartEquivalence {
  critere: StudioCritereEquivalence;
  /** Écart mesuré (0 : identique) ; null : non évalué. */
  ecart: number | null;
  tolerance: number;
}
export interface StudioRapportAcceleration {
  schema: typeof STUDIO_RAPPORT_ACCELERATION_SCHEMA;
  acceleration: string;
  /** Test ou recette qui a produit le rapport (TEST-025…). */
  test: string;
  reference: string;
  candidat: string;
  environnement: { appareil: string; renduLogiciel: boolean; navigateur?: string; commit?: string; date: string };
  mesures: StudioMesureAcceleration[];
  equivalence: StudioEcartEquivalence[];
}

export type StudioRefusAcceleration =
  | "acceleration-inconnue" | "rapport-absent" | "rapport-invalide" | "rapport-d-une-autre-acceleration" | "chemins-differents"
  | "mesure-absente" | "gain-non-prouve" | "critere-absent" | "critere-non-evalue" | "hors-tolerance" | "tolerance-trop-large" | "appareil-reel-requis";

export interface StudioVerdictAcceleration {
  acceleration: string;
  autorisee: boolean;
  /** Motifs du refus, dans l'ordre des contrôles (vide si autorisée). */
  refus: { motif: StudioRefusAcceleration; detail: string }[];
  /** Gain relatif par scène ((référence − candidat) / référence), quand les deux mesures existent. */
  gains: { scene: string; gain: number }[];
}

const nombreFini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Applique la règle F.1-01 à un rapport (ou à son absence) pour une accélération déclarée. */
export function studioEvaluerAcceleration(id: string, rapport: StudioRapportAcceleration | null | undefined): StudioVerdictAcceleration {
  const decl = STUDIO_ACCELERATIONS.find((a) => a.id === id);
  const refus: StudioVerdictAcceleration["refus"] = [];
  const gains: StudioVerdictAcceleration["gains"] = [];
  const sortie = () => ({ acceleration: id, autorisee: refus.length === 0, refus, gains });
  if (!decl) { refus.push({ motif: "acceleration-inconnue", detail: id }); return sortie(); }
  if (!rapport) { refus.push({ motif: "rapport-absent", detail: `aucun rapport de comparaison ${decl.reference} / ${decl.candidat}` }); return sortie(); }
  if (rapport.schema !== STUDIO_RAPPORT_ACCELERATION_SCHEMA || !Array.isArray(rapport.mesures) || !Array.isArray(rapport.equivalence) || !rapport.environnement) {
    refus.push({ motif: "rapport-invalide", detail: "schéma studio-rapport-acceleration/1 attendu" }); return sortie();
  }
  if (rapport.acceleration !== decl.id) refus.push({ motif: "rapport-d-une-autre-acceleration", detail: rapport.acceleration });
  if (rapport.reference !== decl.reference || rapport.candidat !== decl.candidat) refus.push({ motif: "chemins-differents", detail: `${rapport.reference} / ${rapport.candidat}` });
  if (decl.appareilReelRequis && rapport.environnement.renduLogiciel !== false) refus.push({ motif: "appareil-reel-requis", detail: `mesure sur « ${rapport.environnement.appareil} » (rendu logiciel) : profil GPU non évalué` });
  // Gain : sur chaque scène, p95 accéléré < p95 de référence.
  if (!rapport.mesures.length) refus.push({ motif: "mesure-absente", detail: "aucune scène mesurée" });
  for (const m of rapport.mesures) {
    if (!nombreFini(m.reference) || !nombreFini(m.candidat) || m.reference < 0 || m.candidat < 0) { refus.push({ motif: "mesure-absente", detail: m.scene }); continue; }
    gains.push({ scene: m.scene, gain: m.reference > 0 ? (m.reference - m.candidat) / m.reference : 0 });
    if (!(m.candidat < m.reference)) refus.push({ motif: "gain-non-prouve", detail: `${m.scene} : p95 ${m.candidat} ms ≥ ${m.reference} ms` });
  }
  // Non-régression : chaque critère exigé, mesuré, dans la tolérance du rapport, elle-même bornée par la déclaration.
  for (const c of decl.criteres) {
    const e = rapport.equivalence.find((x) => x.critere === c.critere);
    if (!e) { refus.push({ motif: "critere-absent", detail: c.critere }); continue; }
    if (!nombreFini(e.ecart)) { refus.push({ motif: "critere-non-evalue", detail: c.critere }); continue; }
    if (!nombreFini(e.tolerance) || e.tolerance < 0 || e.tolerance > c.toleranceMax) refus.push({ motif: "tolerance-trop-large", detail: `${c.critere} : ${e.tolerance} > ${c.toleranceMax}` });
    if (Math.abs(e.ecart) > Math.min(nombreFini(e.tolerance) ? e.tolerance : 0, c.toleranceMax)) refus.push({ motif: "hors-tolerance", detail: `${c.critere} : écart ${e.ecart}` });
  }
  return sortie();
}

/** Moteur effectif d'une surface : le moteur demandé seulement si la règle l'autorise, sinon la référence, avec le motif. */
export function studioMoteurEffectif<S extends StudioSurfaceRendu>(surface: S, demande: StudioMoteur<S>, rapport: StudioRapportAcceleration | null | undefined): { moteur: StudioMoteur<S>; verdict: StudioVerdictAcceleration | null } {
  const reference = STUDIO_MOTEURS_DE_REFERENCE[surface] as StudioMoteur<S>;
  if (demande === reference) return { moteur: reference, verdict: null };
  const id = STUDIO_ACCELERATION_DU_MOTEUR[`${surface}:${demande}`];
  const verdict = studioEvaluerAcceleration(id ?? `${surface}:${demande}`, rapport);
  return { moteur: verdict.autorisee ? demande : reference, verdict };
}

/**
 * Contrôle des moteurs par défaut : un moteur par défaut différent de la référence de sa surface exige un rapport
 * qualifiant (règle F.1-01) parmi `rapports`. Rend les problèmes (vide : conforme). C'est le blocage d'un remplacement
 * de moteur sans preuve : le test du dépôt échoue dès qu'un défaut change sans rapport.
 */
export function studioControlerMoteursParDefaut(
  defauts: Readonly<Record<StudioSurfaceRendu, string>>,
  rapports: readonly StudioRapportAcceleration[],
): string[] {
  const out: string[] = [];
  for (const surface of Object.keys(STUDIO_MOTEURS_DE_REFERENCE) as StudioSurfaceRendu[]) {
    const d = defauts[surface], ref = STUDIO_MOTEURS_DE_REFERENCE[surface];
    if (!(STUDIO_MOTEURS[surface] as readonly string[]).includes(d)) { out.push(`${surface} : moteur inconnu ${d}`); continue; }
    if (d === ref) continue;
    const id = STUDIO_ACCELERATION_DU_MOTEUR[`${surface}:${d}`]!;
    const verdicts = rapports.filter((r) => r.acceleration === id).map((r) => studioEvaluerAcceleration(id, r));
    if (!verdicts.some((v) => v.autorisee)) out.push(`${surface} : moteur par défaut ${d} sans rapport de comparaison qualifiant (référence ${ref}, règle F.1-01)`);
  }
  return out;
}

/**
 * Rapports de comparaison versionnés qui qualifient une accélération (sources de l'activation) : vide aujourd'hui. Un
 * rapport ne s'y ajoute qu'avec sa mesure (TEST-025 sur appareil désigné, recette RECETTE-APPAREILS).
 */
export const STUDIO_RAPPORTS_ACCELERATION: readonly StudioRapportAcceleration[] = Object.freeze([]);
