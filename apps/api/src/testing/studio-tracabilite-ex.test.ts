import { describe, expect, it } from "vitest";
/**
 * Contrôles de traçabilité des fiches EX de Studio (lot F4 : EX-100, EX-102, EX-103, EX-104), appliqués aux données
 * réelles du dépôt, sans rien fabriquer :
 *  - fiches : `docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json` (141 fiches, dont 104 EX) et la matrice
 *    `matrice-141-exigences-composants-tests-preuves.csv` (décisions retenues) ;
 *  - registre : `docs/workstreams/studio/task-register.json` (preuves d'exécution `test_automatise`, `recette_e2e`) ;
 *  - sources : REF-02 (`Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`, texte exact des fiches et des
 *    quatre exigences contrôlées) et REF-01 (`Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx`, les huit
 *    sections de la charte, principes de niveau 1) ;
 *  - tests : titres des `*.test.ts(x)` du dépôt (un test qui cite `EX-xxx` identifie l'exigence qu'il vérifie) ;
 *  - défauts observés : défauts éliminatoires du Plan §7.3 et leurs contrôles bloquants, relus dans la table vérifiée
 *    `docs/ai-team/reports/claude-v9-x2/INVARIANTS.md` (générée par `studio-tracabilite.test.ts`).
 *
 * Chaque règle est d'abord prouvée sur des cas positifs et négatifs construits (titres `EX-1xx [+]` / `[−]`), puis
 * appliquée au dépôt : les règles bloquantes (aucune conformité attribuée sur une preuve refusée, aucune fiche critique
 * « conforme » incomplète, aucun test citant une exigence inconnue, aucun lien de CI sans scénario) doivent tenir ; les
 * manques réels sont des **écarts connus**, calculés et publiés dans `docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md`
 * (réécrit par `STUDIO_TRACABILITE_ECRIRE=1` ; le test vérifie les règles, pas l'instantané, qui change avec le registre).
 * Pur : aucune base, aucun réseau.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { paragraphesDocx, titresDeTests } from "./sources-tracabilite.js";
import {
  CHAMPS_COUVERTURE, CHAMPS_PREUVE, CHAMPS_TRACE, controlerPreuve, couverturePreuves, couvertureInverse, declareConforme, indexInverse, lacunesFiche,
  remonterDefaut, signalerLiens, type ChampCouverture, type LienFiche, type PreuveConsignee, type TestCitant,
} from "./tracabilite-ex.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const lire = (chemin: string) => readFileSync(`${RACINE}${chemin}`, "utf8");
const FICHES = "docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json";
const MATRICE = "docs/ai-team/reports/mission-004/A1/matrice-141-exigences-composants-tests-preuves.csv";
const REGISTRE = "docs/workstreams/studio/task-register.json";
const REF01 = "Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx";
const REF02 = "Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx";
const INVARIANTS_MD = "docs/ai-team/reports/claude-v9-x2/INVARIANTS.md";
const RAPPORT = "docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md";

/** Les quatre exigences contrôlées, relues dans REF-02 (paragraphe `w:p` numéroté à partir de 1). */
const EXIGENCES_CONTROLEES = [
  ["EX-100", 998, "EX-100 — Critère de preuve."], ["EX-102", 1125, "EX-102 — Lien bidirectionnel."],
  ["EX-103", 1248, "EX-103 — Couverture des preuves."], ["EX-104", 1251, "EX-104 — Auditabilité."],
] as const;

// --- Chargement des données réelles ----------------------------------------------------------------------------------

interface Fiche {
  id: string; type: string; task_source: string; texte_exact: string; source_paragraphs: number[]; responsable_propose: string; contrats_candidats: string;
  composants_candidats: { chemin: string }[]; etat_travail_fiche: string; verdict_conformite: string; decisions_applicables_a_qualifier: string; level1Anchor?: string;
}
interface Tache { id: string; statut: string; priorite: string; conformite: string; tests: { etat: string }; preuves: (PreuveConsignee & { type: string })[] }
const EXECUTION = new Set(["test_automatise", "recette_e2e"]);

/** Analyse CSV (guillemets doublés, champs multilignes). */
function csv(texte: string): Record<string, string>[] {
  const lignes: string[][] = [];
  let champ = "", ligne: string[] = [], guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]!;
    if (guillemets) {
      if (c === "\"" && texte[i + 1] === "\"") { champ += "\""; i++; } else if (c === "\"") guillemets = false; else champ += c;
    } else if (c === "\"") guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else if (c !== "\r") champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [tete, ...corps] = lignes;
  return corps.filter((l) => l.length > 1).map((l) => Object.fromEntries(tete!.map((k, i) => [k, l[i] ?? ""])));
}

function fichiersDeTests(dir: string): string[] {
  return readdirSync(`${RACINE}${dir}`).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(`${RACINE}${p}`).isDirectory()) return n === "node_modules" || n === "dist" ? [] : fichiersDeTests(p);
    return /\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

function donnees() {
  const fiches = (JSON.parse(lire(FICHES)) as { fiches: Fiche[] }).fiches;
  const taches = new Map((JSON.parse(lire(REGISTRE)) as { tasks: Tache[] }).tasks.map((t) => [t.id, t]));
  const matrice = new Map(csv(lire(MATRICE)).map((r) => [r["id"]!, r]));
  const ids = new Set(fiches.map((f) => f.id));
  // Tests du dépôt qui citent une fiche (EX, INV, IF, AC) dans leur titre.
  const tests: TestCitant[] = [];
  for (const racine of ["apps/api/src", "apps/web/src", "packages"]) {
    for (const fichier of fichiersDeTests(racine)) {
      for (const titre of titresDeTests(lire(fichier))) {
        const citees = [...new Set(titre.match(/\b(?:EX|IF|AC)-\d{3}\b/g) ?? [])];
        if (citees.length) tests.push({ fichier, titre, ids: citees });
      }
    }
  }
  const preuvesDe = (f: Fiche) => (taches.get(f.task_source)?.preuves ?? []).filter((p) => EXECUTION.has(p.type));
  const testsDe = (f: Fiche) => [
    ...preuvesDe(f).flatMap((p) => (p.controle ? [p.controle] : p.controles ?? []).map((c) => `${p.fichier}#${c}`)),
    ...tests.filter((t) => t.ids.includes(f.id)).map((t) => `${t.fichier}#${t.titre}`),
  ];
  return { fiches, taches, matrice, ids, tests, preuvesDe, testsDe };
}
type Donnees = ReturnType<typeof donnees>;

function lienDe(d: Donnees, f: Fiche): LienFiche {
  return {
    id: f.id, sourceNiveau1: f.level1Anchor ?? null, proprietaire: f.responsable_propose || null, contrat: f.contrats_candidats || null,
    composants: f.composants_candidats.map((c) => c.chemin), tests: d.testsDe(f), preuves: d.preuvesDe(f).length, etat: f.etat_travail_fiche || null,
    decision: f.decisions_applicables_a_qualifier || null,
  };
}
function couvertureDe(d: Donnees, f: Fiche) {
  const preuves = d.preuvesDe(f).map((p) => controlerPreuve(p));
  const t = d.taches.get(f.task_source);
  const champs: Record<ChampCouverture, boolean> = {
    test: d.testsDe(f).length > 0, resultat: t?.tests.etat === "Exécuté", build: preuves.some((p) => !p.manques.includes("build")),
    preuve: preuves.some((p) => p.conformiteAttribuable), decision: (d.matrice.get(f.id)?.["decision_retenue"] ?? "").trim() !== "",
  };
  return { critique: (t?.priorite ?? "").startsWith("P0"), champs };
}

/** Principes de niveau 1 : les huit sections numérotées de la charte (REF-01), texte exact. */
function principes(): string[] {
  return paragraphesDocx(readFileSync(`${RACINE}${REF01}`)).filter((p) => /^0[1-8] {2}\S/.test(p)).map((p) => p.replace(/ {2}/, " "));
}

/** Défauts éliminatoires et titres de leurs contrôles bloquants (tests d'échec), relus dans la table vérifiée. */
function defautsObserves(): { defaut: string; tests: { fichier: string; titre: string }[] }[] {
  const VOLETS: Record<string, string> = {
    "modèle": "packages/atelier-model/src/studio/studio-invariants.test.ts", serveur: "apps/api/src/routes/studio-invariants.test.ts", interface: "apps/web/src/modules/studio/studio-invariants.test.ts",
  };
  const md = lire(INVARIANTS_MD);
  const section = md.slice(md.indexOf("| Défaut (Plan §7.3) |"), md.indexOf("| Règle (Checklist §7.3) |"));
  return section.split("\n").filter((l) => /^\| [^-|]/.test(l) && !l.startsWith("| Défaut")).map((l) => {
    const cellules = l.split(" | ");
    const defaut = cellules[0]!.replace(/^\| /, "");
    const tests = (cellules[2] ?? "").split("<br>").map((x) => /^X2-\S+ \(([^)]+)\) — (.+)$/.exec(x.trim())).filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ fichier: VOLETS[m[1]!] ?? m[1]!, titre: m[2]!.replace(/\\\|/g, "|") }));
    return { defaut, tests };
  });
}

// --- Rapport des écarts connus ---------------------------------------------------------------------------------------

function rapport(d: Donnees): string {
  const ex = d.fiches.filter((f) => f.type === "EX");
  const preuves = [...d.taches.values()].flatMap((t) => t.preuves.filter((p) => EXECUTION.has(p.type)).map((p) => ({ tache: t.id, p, v: controlerPreuve(p) })));
  const parManque = Object.fromEntries(CHAMPS_PREUVE.map((c) => [c, preuves.filter((x) => x.v.manques.includes(c)).length]));
  const sansSha = [...new Set(preuves.filter((x) => x.v.refus.includes("preuve-sans-sha")).map((x) => x.tache))];
  const ciSansScenario = preuves.filter((x) => x.v.refus.includes("lien-ci-sans-scenario"));
  const verifieesSansPreuve = [...d.taches.values()].filter((t) => ["Vérifié", "Accepté"].includes(t.statut) && t.preuves.some((p) => EXECUTION.has(p.type))
    && !t.preuves.some((p) => EXECUTION.has(p.type) && controlerPreuve(p).conformiteAttribuable)).map((t) => t.id);
  const liens = ex.map((f) => lienDe(d, f));
  const sig = signalerLiens({
    composants: d.fiches.flatMap((f) => f.composants_candidats.map((c) => ({ fiche: f.id, chemin: c.chemin, existe: existsSync(`${RACINE}${c.chemin}`) }))),
    tests: d.tests, fiches: d.ids, controlesConsignes: controlesConsignes(d),
  });
  const couvertures = d.fiches.map((f) => ({ f, c: couverturePreuves(couvertureDe(d, f)) }));
  const pr = principes();
  const inverse = couvertureInverse(pr, d.fiches.map((f) => ({ id: f.id, principe: f.level1Anchor ?? null, composants: f.composants_candidats.map((c) => c.chemin), preuves: d.preuvesDe(f).length })));
  const remontees = remonteesDefauts(d);
  const l: string[] = [
    "# Traçabilité des fiches EX de Studio — écarts connus (EX-100, EX-102, EX-103, EX-104)",
    "",
    "Instantané **calculé** par `apps/api/src/testing/studio-tracabilite-ex.test.ts` (`STUDIO_TRACABILITE_ECRIRE=1` le réécrit) à",
    "partir des fiches M004 (`" + FICHES + "`), de la matrice (`" + MATRICE + "`), du registre",
    "(`" + REGISTRE + "`), des titres des tests du dépôt, de REF-01 et REF-02. Aucune valeur n'est",
    "complétée : un champ absent est un écart. Le test vérifie les règles (bloquantes ci-dessous) ; cet instantané évolue",
    "avec le registre et n'est pas comparé à l'octet.",
    "",
    "Règles bloquantes vérifiées par le test : aucune conformité attribuée sur une preuve refusée (sans SHA, ou lien de CI",
    "sans scénario) ; aucune fiche critique déclarée « conforme » avec un champ test / résultat / build / preuve / décision",
    "manquant ; aucun test citant une exigence inconnue des fiches ; aucun lien de CI sans scénario au registre.",
    "",
    "## EX-100 — critère de preuve (preuves d'exécution du registre)",
    "",
    `Preuves d'exécution (\`test_automatise\`, \`recette_e2e\`) : ${preuves.length} ; conformité attribuable : ${preuves.filter((x) => x.v.conformiteAttribuable).length}.`,
    "",
    "| Champ exigé | Preuves où il manque |",
    "|---|---:|",
    ...CHAMPS_PREUVE.map((c) => `| ${c} | ${parManque[c]} |`),
    "",
    `Refus « preuve sans SHA » : ${preuves.filter((x) => x.v.refus.includes("preuve-sans-sha")).length} preuves, ${sansSha.length} tâches. Refus « lien de CI sans scénario » : ${ciSansScenario.length}.`,
    `Tâches « Vérifié » ou « Accepté » dont aucune preuve d'exécution n'est attribuable : ${verifieesSansPreuve.length} (le statut documentaire du registre n'est pas une conformité ; aucune n'est déclarée conforme).`,
    "",
    "## EX-102 — lien bidirectionnel (104 fiches EX)",
    "",
    "| Champ (REF-02 §20.1) | Fiches EX où il manque |",
    "|---|---:|",
    ...CHAMPS_TRACE.map((c) => `| ${c} | ${liens.filter((x) => lacunesFiche(x).includes(c)).length} |`),
    "",
    `Composants candidats cités sans source dans le dépôt : ${sig.composantsSansSource.length}${sig.composantsSansSource.length ? ` (${sig.composantsSansSource.map((c) => `${c.fiche} → \`${c.chemin}\``).join(", ")})` : ""}.`,
    `Tests citant une exigence inconnue des fiches : ${sig.testsSansExigence.length}.`,
    `Contrôles consignés au registre introuvables mot pour mot dans le fichier cité (libellé composé, déplacé ou reformulé) : ${sig.controlesIntrouvables.length}.`,
    "",
    "Fiches EX avec au moins un test lié (registre ou titre de test) :",
    "",
    ...ex.map((f) => ({ f, l: lienDe(d, f) })).filter((x) => x.l.tests.length).map((x) => `- ${x.f.id} : ${x.l.tests.length} test(s), ${x.l.preuves} preuve(s) d'exécution consignée(s)`),
    "",
    "Sens inverse (test → exigence) : chaque fichier de test qui cite une exigence EX dans un titre.",
    "",
    ...[...new Set(d.tests.filter((t) => t.ids.some((i) => i.startsWith("EX-"))).map((t) => t.fichier))].sort()
      .map((f) => `- \`${f}\` → ${[...new Set(d.tests.filter((t) => t.fichier === f).flatMap((t) => t.ids))].sort().join(", ")}`),
    "",
    "## EX-103 — couverture des preuves (141 fiches, critiques = priorité « P0 » du registre)",
    "",
    `Fiches critiques : ${couvertures.filter((x) => couvertureDe(d, x.f).critique).length} ; déclarées conformes : ${d.fiches.filter((f) => declareConforme(f.verdict_conformite) || declareConforme(d.taches.get(f.task_source)?.conformite)).length} ; pouvant l'être aujourd'hui : ${couvertures.filter((x) => x.c.conformeAdmis).length}.`,
    "",
    "| Champ | Fiches critiques où il manque |",
    "|---|---:|",
    ...CHAMPS_COUVERTURE.map((c) => `| ${c} | ${couvertures.filter((x) => x.c.manques.includes(c)).length} |`),
    "",
    "## EX-104 — auditabilité",
    "",
    "Principes de niveau 1 (REF-01, sections de la charte) et couverture inverse : aucune fiche ne déclare son ancrage de",
    "niveau 1 (`level1Anchor` du modèle REF-02 §20.1) ; le rattachement n'est pas déduit ici.",
    "",
    "| Principe (REF-01) | Exigences | Composants | Preuves | Complet |",
    "|---|---:|---:|---:|---|",
    ...inverse.map((p) => `| ${p.principe} | ${p.exigences.length} | ${p.composants.length} | ${p.preuves} | ${p.complet ? "oui" : "non — auditabilité incomplète"} |`),
    "",
    "Défauts observés (Plan §7.3) remontés : test → exigence → composant → principe.",
    "",
    "| Défaut | Tests | Exigences | Composants | Rupture |",
    "|---|---:|---|---:|---|",
    ...remontees.map((r) => `| ${r.defaut} | ${r.tests.length} | ${r.exigences.join(", ") || "—"} | ${r.composants.length} | ${r.rupture ?? "aucune"} |`),
    "",
  ];
  return l.join("\n");
}

function controlesConsignes(d: Donnees) {
  return [...d.taches.values()].flatMap((t) => t.preuves.filter((p) => EXECUTION.has(p.type) && p.fichier).flatMap((p) => {
    const source = existsSync(`${RACINE}${p.fichier}`) ? lire(p.fichier!) : "";
    return (p.controle ? [p.controle] : p.controles ?? []).map((c) => ({ tache: t.id, fichier: p.fichier!, controle: c, trouve: source.includes(c) }));
  }));
}

function remonteesDefauts(d: Donnees) {
  const parId = new Map(d.fiches.map((f) => [f.id, f]));
  return defautsObserves().map((x) => remonterDefaut(x.defaut, {
    testsDuDefaut: x.tests.map((t) => `${t.fichier}#${t.titre}`),
    exigencesDuTest: (t) => [...new Set(t.split("#").slice(1).join("#").match(/\b(?:INV|EX)-\d{3}\b/g) ?? [])].filter((id) => parId.has(id)),
    composantsDe: (id) => parId.get(id)?.composants_candidats.map((c) => c.chemin) ?? [],
    principeDe: (id) => parId.get(id)?.level1Anchor ?? null,
  }));
}

// --- Tests -----------------------------------------------------------------------------------------------------------

const PREUVE_COMPLETE: PreuveConsignee = {
  type: "recette_e2e", build: "ci-40192137528", commit: "3e992b66a0e7b03d4bcdd4d7e49b4af65b333a30", contrat: "studio-commands/1", corpus: "sha256:ab12",
  environnement: "PostgreSQL 16 + PostGIS 3, Chromium headless", executant: "CI GitHub Actions (job e2e)", date: "2026-10-25T08:00:00Z", verdict: "réussi",
  rapport: "docs/workstreams/studio/recettes/RECETTE-PILOTE-2026-10-25.md", url: "https://github.com/RachEma-ux/Fadi/actions/runs/40192137528/job/121165189052",
  fichier: "apps/web/e2e/studio-navigation.mjs", controles: ["NAV-001 : entrée Studio dans la navigation principale"],
};

describe("EX-100 — critère de preuve", () => {
  it("EX-100 [+] une preuve portant build, SHA, contrat, corpus, environnement, exécutant, date, verdict, log et référence permet d'attribuer la conformité", () => {
    expect(controlerPreuve(PREUVE_COMPLETE)).toEqual({ manques: [], refus: [], conformiteAttribuable: true });
  });
  it("EX-100 [−] preuve sans SHA, ou lien de CI « vert » sans scénario : conformité refusée, motif nommé", () => {
    const { commit: _c, ...sansSha } = PREUVE_COMPLETE;
    expect(controlerPreuve(sansSha)).toMatchObject({ refus: ["preuve-sans-sha"], conformiteAttribuable: false });
    expect(controlerPreuve({ ...PREUVE_COMPLETE, commit: "4e026ac-pas-un-sha" }).refus).toContain("preuve-sans-sha");
    const { controles: _s, ...sansScenario } = PREUVE_COMPLETE;
    expect(controlerPreuve(sansScenario)).toMatchObject({ refus: ["lien-ci-sans-scenario"], conformiteAttribuable: false });
    for (const champ of ["contrat", "environnement", "executant", "date", "verdict"] as const) {
      const p = { ...PREUVE_COMPLETE, [champ]: undefined };
      expect(controlerPreuve(p).manques, champ).toEqual([champ]);
      expect(controlerPreuve(p).conformiteAttribuable, champ).toBe(false);
    }
  });
  it("EX-100 [−] registre réel : aucune conformité n'est attribuée sur une preuve refusée, aucun lien de CI sans scénario", () => {
    const d = donnees();
    const execution = [...d.taches.values()].flatMap((t) => t.preuves.filter((p) => EXECUTION.has(p.type)).map((p) => ({ t, v: controlerPreuve(p) })));
    expect(execution.length).toBeGreaterThan(0);
    expect(execution.filter((x) => x.v.refus.includes("lien-ci-sans-scenario")).map((x) => x.t.id)).toEqual([]);
    // Une tâche déclarée conforme devrait s'appuyer sur au moins une preuve attribuable (écart connu : aucune ne l'est aujourd'hui).
    const conformes = [...d.taches.values()].filter((t) => declareConforme(t.conformite));
    for (const t of conformes) expect(t.preuves.some((p) => EXECUTION.has(p.type) && controlerPreuve(p).conformiteAttribuable), t.id).toBe(true);
  });
});

describe("EX-102 — lien bidirectionnel exigence ↔ contrat ↔ composant ↔ tests ↔ preuves ↔ décision", () => {
  const complet: LienFiche = {
    id: "EX-025", sourceNiveau1: "« Non-régression géométrique »", proprietaire: "D1", contrat: "IF-002", composants: ["plan2d/accrochage.ts"],
    tests: ["apps/web/src/x.test.ts#EX-025 [+] accrochage"], preuves: 1, etat: "Non vérifié", decision: "DEC-09",
  };
  it("EX-102 [+] depuis une exigence on retrouve charte, contrat, composant, tests, preuve, décision ; depuis le test on revient à l'exigence", () => {
    expect(lacunesFiche(complet)).toEqual([]);
    const inv = indexInverse([complet, { ...complet, id: "EX-026", tests: [], composants: ["plan2d/accrochage.ts"] }]);
    expect(inv.exigencesDuTest.get("apps/web/src/x.test.ts#EX-025 [+] accrochage")).toEqual(["EX-025"]);
    expect(inv.exigencesDuComposant.get("plan2d/accrochage.ts")).toEqual(["EX-025", "EX-026"]);
    // Dépôt réel : EX-085 (lot F4) se retrouve par ses tests, et ses tests reviennent à EX-085.
    const d = donnees();
    const ex085 = lienDe(d, d.fiches.find((f) => f.id === "EX-085")!);
    expect(ex085.tests.length).toBeGreaterThan(0);
    const retour = indexInverse([ex085]).exigencesDuTest;
    for (const t of ex085.tests) expect(retour.get(t)).toEqual(["EX-085"]);
  });
  it("EX-102 [−] composant sans source, test sans exigence ou contrôle introuvable : fiche incomplète signalée", () => {
    expect(lacunesFiche({ ...complet, sourceNiveau1: null, composants: [], tests: [] })).toEqual(["sourceNiveau1", "composant", "tests"]);
    const s = signalerLiens({
      composants: [{ fiche: "EX-025", chemin: "plan2d/accrochage.ts", existe: true }, { fiche: "EX-026", chemin: "plan2d/disparu.ts", existe: false }],
      tests: [{ fichier: "a.test.ts", titre: "EX-025 [+] ok", ids: ["EX-025"] }, { fichier: "b.test.ts", titre: "EX-999 [+] orphelin", ids: ["EX-999"] }],
      fiches: new Set(["EX-025", "EX-026"]),
      controlesConsignes: [{ tache: "TR-EX-025", fichier: "a.test.ts", controle: "renommé", trouve: false }],
    });
    expect(s).toEqual({
      composantsSansSource: [{ fiche: "EX-026", chemin: "plan2d/disparu.ts" }],
      testsSansExigence: [{ fichier: "b.test.ts", titre: "EX-999 [+] orphelin", id: "EX-999" }],
      controlesIntrouvables: [{ tache: "TR-EX-025", fichier: "a.test.ts", controle: "renommé" }],
    });
  });
  it("EX-102 [−] dépôt réel : aucun test ne cite une exigence inconnue des fiches ; les fiches citées sont celles de REF-02", () => {
    const d = donnees();
    expect(d.fiches.filter((f) => f.type === "EX")).toHaveLength(104);
    expect(signalerLiens({ composants: [], tests: d.tests, fiches: d.ids }).testsSansExigence).toEqual([]);
    const p = paragraphesDocx(readFileSync(`${RACINE}${REF02}`));
    for (const [id, n, debut] of EXIGENCES_CONTROLEES) {
      expect(p[n - 1]!.startsWith(debut), id).toBe(true);
      expect(d.fiches.find((f) => f.id === id)!.texte_exact).toBe(p[n - 1]);
    }
  });
});

describe("EX-103 — couverture des preuves d'une exigence critique", () => {
  const tout: Record<ChampCouverture, boolean> = { test: true, resultat: true, build: true, preuve: true, decision: true };
  it("EX-103 [+] test, résultat, build, preuve et décision présents (ou non-applicabilité justifiée et vérifiable) : « conforme » admis", () => {
    expect(couverturePreuves({ critique: true, champs: tout })).toEqual({ manques: [], conformeAdmis: true });
    expect(couverturePreuves({ critique: true, champs: { ...tout, decision: false }, nonApplicables: [{ champ: "decision", justification: "Aucun arbitrage requis : contrat unique", source: "REF-02 w:p 1125" }] }).conformeAdmis).toBe(true);
  });
  it("EX-103 [−] un champ preuve ou décision absent, ou une non-applicabilité sans justification vérifiable : jamais « conforme »", () => {
    for (const champ of CHAMPS_COUVERTURE) expect(couverturePreuves({ critique: true, champs: { ...tout, [champ]: false } }), champ).toEqual({ manques: [champ], conformeAdmis: false });
    expect(couverturePreuves({ critique: true, champs: { ...tout, preuve: false }, nonApplicables: [{ champ: "preuve", justification: "", source: "x" }] }).conformeAdmis).toBe(false);
    expect(couverturePreuves({ critique: true, champs: { ...tout, preuve: false }, nonApplicables: [{ champ: "preuve", justification: "Sans objet", source: "" }] }).conformeAdmis).toBe(false);
    expect(["Conforme", "Vérifié conforme"].map(declareConforme)).toEqual([true, true]);
    expect(["Non testé pour Studio", "Non conforme", "Non évaluée pour le produit Studio", "Condition documentaire satisfaite ; conformité fonctionnelle Studio non évaluée", ""].map(declareConforme)).toEqual([false, false, false, false, false]);
  });
  it("EX-103 [−] dépôt réel : aucune fiche critique n'est déclarée conforme avec un champ manquant", () => {
    const d = donnees();
    const violations = d.fiches.filter((f) => declareConforme(f.verdict_conformite) || declareConforme(d.taches.get(f.task_source)?.conformite))
      .filter((f) => !couverturePreuves(couvertureDe(d, f)).conformeAdmis).map((f) => f.id);
    expect(violations).toEqual([]);
    expect(d.fiches.every((f) => couvertureDe(d, f).critique)).toBe(true);
  });
});

describe("EX-104 — auditabilité défaut → test → exigence → composant → principe, et couverture inverse", () => {
  const e = {
    exigencesDuTest: (t: string) => (t === "t1" ? ["INV-002"] : []),
    composantsDe: (x: string) => (x === "INV-002" ? ["packages/atelier-model/src/studio"] : []),
    principeDe: (x: string) => (x === "INV-002" ? "05 Invariants, sécurité et réversibilité" : null),
  };
  it("EX-104 [+] d'un défaut on remonte au test, à l'exigence, au composant et au principe ; chaque principe montre ses composants et preuves", () => {
    expect(remonterDefaut("double autorité 2D/3D", { ...e, testsDuDefaut: ["t1"] })).toEqual({
      defaut: "double autorité 2D/3D", tests: ["t1"], exigences: ["INV-002"], composants: ["packages/atelier-model/src/studio"], principes: ["05 Invariants, sécurité et réversibilité"], rupture: null,
    });
    expect(couvertureInverse(["05 Invariants, sécurité et réversibilité"], [{ id: "INV-002", principe: "05 Invariants, sécurité et réversibilité", composants: ["c"], preuves: 2 }]))
      .toEqual([{ principe: "05 Invariants, sécurité et réversibilité", exigences: ["INV-002"], composants: ["c"], preuves: 2, complet: true }]);
  });
  it("EX-104 [−] défaut sans test, test sans exigence, exigence sans principe, principe sans composant : auditabilité incomplète, rupture nommée", () => {
    expect(remonterDefaut("d", { ...e, testsDuDefaut: [] }).rupture).toBe("test");
    expect(remonterDefaut("d", { ...e, testsDuDefaut: ["t2"] }).rupture).toBe("exigence");
    expect(remonterDefaut("d", { ...e, testsDuDefaut: ["t1"], principeDe: () => null }).rupture).toBe("principe");
    expect(remonterDefaut("d", { ...e, testsDuDefaut: ["t1"], composantsDe: () => [] }).rupture).toBe("composant");
    expect(couvertureInverse(["01 Mission et périmètre"], [])[0]).toMatchObject({ exigences: [], complet: false });
  });
  it("EX-104 [−] dépôt réel : chaque défaut éliminatoire a un contrôle bloquant ; les huit principes de REF-01 sont relus ; les ruptures sont nommées", () => {
    const pr = principes();
    expect(pr).toEqual([
      "01 Mission et périmètre", "02 Organisation fonctionnelle", "03 Personnalisation et système d’outils", "04 Moteurs mutualisés et qualité d’exécution",
      "05 Invariants, sécurité et réversibilité", "06 Études, workflow et publications", "07 Intelligence artificielle et extensions", "08 Hiérarchie documentaire, décisions et traçabilité",
    ]);
    const d = donnees();
    const r = remonteesDefauts(d);
    expect(r).toHaveLength(7);
    for (const x of r) {
      expect(x.tests.length, x.defaut).toBeGreaterThan(0);
      // Écart connu : jamais d'auditabilité déclarée complète sans principe rattaché.
      expect(x.rupture === null ? x.principes.length > 0 : ["exigence", "composant", "principe"].includes(x.rupture), x.defaut).toBe(true);
    }
  });
});

describe("Écarts connus publiés", () => {
  it("le rapport des écarts connus est calculé sur le dépôt et publié", () => {
    const md = rapport(donnees());
    if (process.env["STUDIO_TRACABILITE_ECRIRE"] === "1") {
      mkdirSync(`${RACINE}docs/ai-team/reports/claude-f4-tracabilite`, { recursive: true });
      writeFileSync(`${RACINE}${RAPPORT}`, md);
    }
    expect(existsSync(`${RACINE}${RAPPORT}`)).toBe(true);
    // Mêmes sections que le calcul courant (le contenu suit le registre et n'est pas comparé à l'octet).
    const publie = lire(RAPPORT);
    for (const titre of md.split("\n").filter((x) => x.startsWith("## "))) expect(publie, titre).toContain(titre);
  });
});
