/**
 * Contrôles de traçabilité des fiches EX de Studio (lot F4) — règles pures, appliquées par
 * `studio-tracabilite-ex.test.ts` aux données réelles du dépôt (fiches M004, registre des 630 tâches, tests, sources
 * REF-01 / REF-02). Aucune donnée n'est fabriquée : un champ absent est signalé, jamais déduit.
 *
 * - **EX-100** (REF-02 w:p 998) — critère de preuve : une preuve est rattachée à build, commit, version du contrat, jeu
 *   de données/empreinte, environnement, auteur/exécutant, horodatage, verdict, logs utiles et référence stable ; une
 *   preuve sans SHA, ou un lien de CI sans scénario, ne permet pas d'attribuer une conformité (`controlerPreuve`).
 * - **EX-102** (w:p 1125) — lien bidirectionnel : identifiant, source de niveau 1, propriétaire, contrat, composant
 *   candidat, tests, preuves, état, décision ; un composant sans source ou un test sans exigence est signalé
 *   (`lacunesFiche`, `signalerLiens`, `indexInverse`).
 * - **EX-103** (w:p 1248) — couverture des preuves : une exigence critique n'est jamais « conforme » si test, résultat,
 *   build, preuve ou décision applicable manque, sauf non-applicabilité justifiée et vérifiable (`couverturePreuves`).
 * - **EX-104** (w:p 1251) — auditabilité : remonter d'un défaut au test, à l'exigence, au composant et au principe ;
 *   couverture inverse principe → exigences → composants → preuves (`remonterDefaut`, `couvertureInverse`).
 */

// --- EX-100 : critère de preuve ------------------------------------------------------------------------------------

export const CHAMPS_PREUVE = ["build", "commit", "contrat", "corpus", "environnement", "executant", "date", "verdict", "log", "reference", "scenario"] as const;
export type ChampPreuve = (typeof CHAMPS_PREUVE)[number];
export type RefusPreuve = "preuve-sans-sha" | "lien-ci-sans-scenario";

/** Preuve telle que consignée (registre ou rapport) : champs facultatifs, jamais complétés ici. */
export interface PreuveConsignee {
  type?: string; build?: string; commit?: string; contrat?: string; corpus?: string; empreinte?: string; environnement?: string; executant?: string;
  date?: string; verdict?: string; log?: string; rapport?: string; url?: string; fichier?: string; ligne?: number; controle?: string; controles?: readonly string[];
}
export interface VerdictPreuve { manques: ChampPreuve[]; refus: RefusPreuve[]; conformiteAttribuable: boolean }

const plein = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
/** Lien vers une exécution d'intégration continue (GitHub Actions). */
export const LIEN_CI = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(\d+)/;
export const SHA = /^[0-9a-f]{7,40}$/;

export function controlerPreuve(p: PreuveConsignee): VerdictPreuve {
  const scenario = plein(p.controle) || (Array.isArray(p.controles) && p.controles.some(plein));
  const present: Record<ChampPreuve, boolean> = {
    build: plein(p.build) || (plein(p.url) && LIEN_CI.test(p.url)),
    commit: plein(p.commit) && SHA.test(p.commit),
    contrat: plein(p.contrat),
    corpus: plein(p.corpus) || plein(p.empreinte),
    environnement: plein(p.environnement),
    executant: plein(p.executant),
    date: plein(p.date) && !Number.isNaN(Date.parse(p.date)),
    verdict: plein(p.verdict),
    log: plein(p.log) || plein(p.rapport),
    reference: plein(p.url) || plein(p.rapport) || (plein(p.fichier) && typeof p.ligne === "number"),
    scenario,
  };
  const manques = CHAMPS_PREUVE.filter((c) => !present[c]);
  const refus: RefusPreuve[] = [];
  if (!present.commit) refus.push("preuve-sans-sha");
  if (plein(p.url) && LIEN_CI.test(p.url) && !scenario) refus.push("lien-ci-sans-scenario");
  return { manques, refus, conformiteAttribuable: manques.length === 0 && refus.length === 0 };
}

// --- EX-103 : couverture des preuves --------------------------------------------------------------------------------

export const CHAMPS_COUVERTURE = ["test", "resultat", "build", "preuve", "decision"] as const;
export type ChampCouverture = (typeof CHAMPS_COUVERTURE)[number];
export interface NonApplicabilite { champ: ChampCouverture; justification: string; source: string }
export interface Couverture { critique: boolean; champs: Record<ChampCouverture, boolean>; nonApplicables?: readonly NonApplicabilite[] }

/**
 * Champs qui manquent pour qu'une exigence soit « conforme ». Une non-applicabilité ne compte que justifiée ET
 * vérifiable (source citée) ; sinon le champ reste manquant. Une exigence non critique n'est pas jugée ici.
 */
export function couverturePreuves(c: Couverture): { manques: ChampCouverture[]; conformeAdmis: boolean } {
  if (!c.critique) return { manques: [], conformeAdmis: true };
  const na = (champ: ChampCouverture) => (c.nonApplicables ?? []).some((n) => n.champ === champ && plein(n.justification) && plein(n.source));
  const manques = CHAMPS_COUVERTURE.filter((k) => !c.champs[k] && !na(k));
  return { manques, conformeAdmis: manques.length === 0 };
}

/** Le verdict déclare-t-il une conformité ? « Non conforme », « non évaluée », « non testé » : non. */
export function declareConforme(verdict: string | null | undefined): boolean {
  if (!plein(verdict)) return false;
  const v = verdict.toLowerCase();
  if (/\bnon\b/.test(v)) return false;
  return /\bconforme\b/.test(v);
}

// --- EX-102 : lien bidirectionnel ----------------------------------------------------------------------------------

export const CHAMPS_TRACE = ["identifiant", "sourceNiveau1", "proprietaire", "contrat", "composant", "tests", "preuves", "etat", "decision"] as const;
export type ChampTrace = (typeof CHAMPS_TRACE)[number];
export interface LienFiche {
  id: string; sourceNiveau1: string | null; proprietaire: string | null; contrat: string | null; composants: readonly string[];
  tests: readonly string[]; preuves: number; etat: string | null; decision: string | null;
}
export function lacunesFiche(l: LienFiche): ChampTrace[] {
  const present: Record<ChampTrace, boolean> = {
    identifiant: /^EX-\d{3}$/.test(l.id), sourceNiveau1: plein(l.sourceNiveau1), proprietaire: plein(l.proprietaire), contrat: plein(l.contrat),
    composant: l.composants.length > 0, tests: l.tests.length > 0, preuves: l.preuves > 0, etat: plein(l.etat), decision: plein(l.decision),
  };
  return CHAMPS_TRACE.filter((c) => !present[c]);
}

export interface TestCitant { fichier: string; titre: string; ids: readonly string[] }
/**
 * Signalements : composant cité sans source dans le dépôt ; test qui cite une exigence inconnue des fiches (« test sans
 * exigence ») ; contrôle consigné introuvable dans le fichier de test cité.
 */
export function signalerLiens(e: {
  composants: readonly { fiche: string; chemin: string; existe: boolean }[];
  tests: readonly TestCitant[];
  fiches: ReadonlySet<string>;
  controlesConsignes?: readonly { tache: string; fichier: string; controle: string; trouve: boolean }[];
}) {
  return {
    composantsSansSource: e.composants.filter((c) => !c.existe).map((c) => ({ fiche: c.fiche, chemin: c.chemin })),
    testsSansExigence: e.tests.flatMap((t) => t.ids.filter((id) => !e.fiches.has(id)).map((id) => ({ fichier: t.fichier, titre: t.titre, id }))),
    controlesIntrouvables: (e.controlesConsignes ?? []).filter((c) => !c.trouve).map((c) => ({ tache: c.tache, fichier: c.fichier, controle: c.controle })),
  };
}

/** Index inverse : depuis un test ou un composant, les exigences qu'il vérifie ou satisfait. */
export function indexInverse(liens: readonly LienFiche[]): { exigencesDuTest: Map<string, string[]>; exigencesDuComposant: Map<string, string[]> } {
  const exigencesDuTest = new Map<string, string[]>(), exigencesDuComposant = new Map<string, string[]>();
  const ajouter = (m: Map<string, string[]>, k: string, v: string) => { const l = m.get(k) ?? []; if (!l.includes(v)) l.push(v); m.set(k, l); };
  for (const l of liens) {
    for (const t of l.tests) ajouter(exigencesDuTest, t, l.id);
    for (const c of l.composants) ajouter(exigencesDuComposant, c, l.id);
  }
  return { exigencesDuTest, exigencesDuComposant };
}

// --- EX-104 : auditabilité ------------------------------------------------------------------------------------------

export type NiveauAudit = "test" | "exigence" | "composant" | "principe";
export interface Remontee { defaut: string; tests: string[]; exigences: string[]; composants: string[]; principes: string[]; rupture: NiveauAudit | null }

/** Remonte un défaut observé : tests qui le contrôlent → exigences qu'ils citent → composants candidats → principes. */
export function remonterDefaut(defaut: string, e: {
  testsDuDefaut: readonly string[]; exigencesDuTest: (test: string) => readonly string[];
  composantsDe: (exigence: string) => readonly string[]; principeDe: (exigence: string) => string | null;
}): Remontee {
  const tests = [...new Set(e.testsDuDefaut)];
  const exigences = [...new Set(tests.flatMap((t) => e.exigencesDuTest(t)))];
  const composants = [...new Set(exigences.flatMap((x) => e.composantsDe(x)))];
  const principes = [...new Set(exigences.map((x) => e.principeDe(x)).filter((p): p is string => p !== null))];
  const rupture: NiveauAudit | null = !tests.length ? "test" : !exigences.length ? "exigence" : !composants.length ? "composant"
    : exigences.some((x) => e.principeDe(x) === null) ? "principe" : null;
  return { defaut, tests, exigences, composants, principes, rupture };
}

/** Pour chaque principe : exigences rattachées, composants candidats et preuves ; `complet` si chacun est non vide. */
export function couvertureInverse(principes: readonly string[], exigences: readonly { id: string; principe: string | null; composants: readonly string[]; preuves: number }[]) {
  return principes.map((p) => {
    const x = exigences.filter((e) => e.principe === p);
    const composants = [...new Set(x.flatMap((e) => e.composants))];
    const preuves = x.reduce((s, e) => s + e.preuves, 0);
    return { principe: p, exigences: x.map((e) => e.id), composants, preuves, complet: x.length > 0 && composants.length > 0 && preuves > 0 };
  });
}
