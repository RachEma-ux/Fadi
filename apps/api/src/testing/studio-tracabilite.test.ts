import { describe, expect, it } from "vitest";
/**
 * X.2-01 / X.2-04 — table de traçabilité INV → tests et défauts éliminatoires → contrôles bloquants, **générée et
 * vérifiée** : `docs/ai-team/reports/claude-v9-x2/INVARIANTS.md` doit être exactement la table recalculée ici (sinon le
 * test échoue ; `STUDIO_TRACABILITE_ECRIRE=1` la réécrit). Rien n'est recopié à la main sans contrôle :
 *
 * - les quinze libellés INV-001 à INV-015 sont relus dans la source elle-même, le référentiel technique REF-02
 *   (`Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`, STUDIO-RT-001 §2.4, `word/document.xml`, paragraphes
 *   `w:p` numérotés à partir de 1) : identifiant et libellé doivent s'y trouver à la place citée ;
 * - les défauts éliminatoires sont relus dans le Plan §7.3 (`Fadi_Studio_Plan_Implementation_V1_0.md`) et les contrôles
 *   BLOC-01 à BLOC-08 dans la Checklist §7.3 (`Fadi_Studio_Checklist_Execution_V1_0.md`) ;
 * - les tests sont lus dans les trois volets de la suite `studio-invariants` (modèle, serveur, interface) : titre
 *   `INV-xxx [+]` (positif) ou `INV-xxx [−]` (échec), plusieurs identifiants possibles. Chaque invariant exige au moins un
 *   test positif et un test d'échec ; chaque défaut éliminatoire automatisable exige au moins un test d'échec.
 * Pur : aucune base, aucun réseau (lecture de fichiers du dépôt et décompression `zlib`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DESACTIVES, entreeZip, paragraphesDocx, sansCommentaires, titresDeTests } from "./sources-tracabilite.js";

export { DESACTIVES, entreeZip, paragraphesDocx, sansCommentaires, titresDeTests };

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const lire = (chemin: string) => readFileSync(`${RACINE}${chemin}`);
const FICHIER = "docs/ai-team/reports/claude-v9-x2/INVARIANTS.md";
const REF02 = "Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx";
const PLAN = "Studio/Fadi_Studio_Plan_Implementation_V1_0.md";
const CHECKLIST = "Studio/Fadi_Studio_Checklist_Execution_V1_0.md";
export const SUITES = [
  "packages/atelier-model/src/studio/studio-invariants.test.ts",
  "apps/api/src/routes/studio-invariants.test.ts",
  "apps/web/src/modules/studio/studio-invariants.test.ts",
] as const;


/** Invariants de référence (REF-02 §2.4) : identifiant, libellé exact, paragraphe de l'identifiant (le libellé suit). */
export const INVARIANTS = [
  ["INV-001", "Une approbation référence exactement les éléments présentés à la décision.", 207],
  ["INV-002", "Une définition architecturale associée possède une autorité unique.", 209],
  ["INV-003", "Une copie indépendante ne propage pas vers son origine.", 211],
  ["INV-004", "Une exigence approuvée reste distincte du résultat de conception.", 213],
  ["INV-005", "Une opération rejetée ne modifie pas partiellement les données canoniques.", 215],
  ["INV-006", "Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.", 217],
  ["INV-007", "Une optimisation préserve les résultats métier dans les tolérances déclarées.", 219],
  ["INV-008", "Un cache/index/projection est reconstruisible depuis la donnée de référence.", 221],
  ["INV-009", "Un profil personnalisé ne change ni données, ni droits, ni révision de conception.", 223],
  ["INV-010", "Une requête IA ou extension passe par les mêmes validations centrales qu’une action humaine.", 225],
  ["INV-011", "Les annulations concurrentes ne détruisent pas silencieusement le travail d’un autre acteur.", 227],
  ["INV-012", "Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.", 229],
  ["INV-013", "Une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre ».", 231],
  ["INV-014", "Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.", 233],
  ["INV-015", "Un outil masqué reste retrouvable s’il est autorisé, et n’est pas désinstallé implicitement.", 235],
] as const;
/** Règle de preuve citée par REF-02 juste après la table (paragraphe 238). */
const REGLE_PREUVE = "Chaque invariant doit recevoir au moins un test positif, un test d’échec et un identifiant de preuve. La matrice du chapitre 20 en fixe les premières correspondances.";

/**
 * Défauts éliminatoires du Plan §7.3 (texte exact) et contrôle de la Checklist §7.3 qui les porte. `preuves` : identifiants
 * qu'un test d'échec doit tous porter ; `nonAutomatise` : justification quand aucun test ne peut trancher.
 */
export const ELIMINATOIRES: { defaut: string; bloc: string; preuves?: string[]; nonAutomatise?: string }[] = [
  { defaut: "double autorité 2D/3D", bloc: "BLOC-01", preuves: ["BLOC-01", "INV-002"] },
  { defaut: "corruption de référence", bloc: "BLOC-01", preuves: ["BLOC-01", "INV-013"] },
  { defaut: "accès inter-projets non autorisé", bloc: "BLOC-02", preuves: ["BLOC-02"] },
  { defaut: "commande appliquée deux fois", bloc: "BLOC-03", preuves: ["BLOC-03"] },
  { defaut: "écrasement de conflit", bloc: "BLOC-03", preuves: ["BLOC-03"] },
  { defaut: "résultat ancien engagé comme courant", bloc: "BLOC-04", preuves: ["BLOC-04"] },
  { defaut: "publication sous une approbation ne couvrant pas le contenu", bloc: "BLOC-05", preuves: ["BLOC-05"] },
];
/** Règles de conduite de la Checklist §7.3 (BLOC-06 à BLOC-08). */
export const REGLES_BLOC: { bloc: string; traitement: string }[] = [
  { bloc: "BLOC-06", traitement: "Automatisé par construction : chaque contrôle bloquant ci-dessus est un test des suites `npm test` (atelier-model, web) et du rapport API vérifié par `scripts/check-api-tests-db3.mjs` en CI ; un échec bloque la fusion, aucune mesure de performance n'entre dans ces tests. La décision de livraison (porte G4) reste une décision distincte, non automatisée." },
  { bloc: "BLOC-07", traitement: "Non automatisé : une non-applicabilité est une décision motivée et validée par une personne habilitée (aucune n'est déclarée par ce lot)." },
  { bloc: "BLOC-08", traitement: "Non automatisé : déclaration. Hors périmètre constaté au commit de ce lot : adaptateur IA / MCP (aucun point d'entrée d'agent, `agentExposure: none` — INV-010 prouve qu'il n'existerait que par le point d'entrée commun) ; un test n'est réputé réussi que par son exécution (résultats consignés dans le compte rendu), pas par sa seule présence en CI." },
];

// --- Tests des suites --------------------------------------------------------------------------------------------

export interface TestTrace { fichier: string; titre: string; ids: string[]; sens: "+" | "−" }
const TITRE = /^((?:(?:INV-\d{3}|BLOC-\d{2}|X\.2-0\d)\s+)+)\[([+−])\]\s+(.+)$/;
export function testsTraces(): TestTrace[] {
  const out: TestTrace[] = [];
  for (const fichier of SUITES) {
    const source = lire(fichier).toString("utf8");
    const desactive = DESACTIVES.exec(sansCommentaires(source));
    if (desactive) throw new Error(`${fichier} : test désactivé ou exclusif (« ${desactive[0]} ») interdit dans la suite tracée`);
    for (const titre of titresDeTests(source)) {
      const t = TITRE.exec(titre);
      if (t) out.push({ fichier, titre, ids: t[1]!.trim().split(/\s+/), sens: t[2] as "+" | "−" });
    }
  }
  return out;
}

/** Volet d'un fichier de la suite : modèle pur, serveur, interface. */
const VOLET: Record<string, string> = { [SUITES[0]]: "modèle", [SUITES[1]]: "serveur", [SUITES[2]]: "interface" };
const preuve = (id: string, sens: "+" | "−", rang: number) => `X2-${id}-${sens === "+" ? "P" : "N"}${rang}`;
const echapper = (titre: string) => titre.replace(/\|/g, "\\|");
const cellule = (tests: TestTrace[], id: string, sens: "+" | "−") =>
  tests.map((t, i) => `${preuve(id, sens, i + 1)} (${VOLET[t.fichier]}) — ${echapper(t.titre)}`).join("<br>");

export function tableMarkdown(): string {
  const tests = testsTraces();
  const de = (id: string, sens: "+" | "−") => tests.filter((t) => t.ids.includes(id) && t.sens === sens);
  const lignes = [
    "# Invariants et défauts éliminatoires Studio — traçabilité vers les tests (X.2-01, X.2-04)",
    "",
    "Fichier **généré et vérifié** par `apps/api/src/testing/studio-tracabilite.test.ts` : le test échoue si ce fichier",
    "diffère de la table recalculée (`STUDIO_TRACABILITE_ECRIRE=1` le régénère). Libellés relus dans la source à",
    "chaque exécution : REF-02 = `" + REF02 + "` (STUDIO-RT-001 §2.4, `word/document.xml`, paragraphes `w:p` numérotés",
    "à partir de 1) ; Plan §7.3 = `" + PLAN + "` ; Checklist §7.3 = `" + CHECKLIST + "`.",
    "",
    `Règle de preuve (REF-02, w:p 238) : « ${REGLE_PREUVE} » Identifiant de preuve : \`X2-<id>-P<n>\` (positif) ou`,
    "`X2-<id>-N<n>` (échec), attribué dans l'ordre des volets puis des tests. Volets de la suite `studio-invariants` :",
    ...SUITES.map((s) => `- ${VOLET[s]} : \`${s}\``),
    "",
    "Statut : « exécuté » = test présent et vérifié par ce fichier ; le verdict d'exécution est celui de la CI du commit",
    "(un test inscrit n'est pas réputé réussi par sa seule inscription, BLOC-08).",
    "",
    "## Invariants INV-001 à INV-015 (REF-02 §2.4)",
    "",
    "| Invariant | Libellé exact (source) | Tests positifs | Tests d'échec |",
    "|---|---|---|---|",
  ];
  for (const [id, libelle, p] of INVARIANTS) {
    lignes.push(`| ${id} | ${libelle} (REF-02 w:p ${p}–${p + 1}) | ${cellule(de(id, "+"), id, "+")} | ${cellule(de(id, "−"), id, "−")} |`);
  }
  lignes.push(
    "",
    "## Défauts éliminatoires (Plan §7.3) et contrôles bloquants (Checklist §7.3, X.2-04)",
    "",
    "Plan §7.3 : « La livraison est bloquée par une double autorité 2D/3D, une corruption de référence, un accès",
    "inter-projets non autorisé, une commande appliquée deux fois, un écrasement de conflit, un résultat ancien engagé comme",
    "courant ou une publication sous une approbation ne couvrant pas le contenu. Un gain de FPS ou une moyenne favorable ne",
    "compense aucun de ces défauts. » Chaque contrôle ci-dessous est un test d'échec : il échoue si le défaut apparaît.",
    "",
    "| Défaut (Plan §7.3) | Contrôle | Contrôle bloquant (tests d'échec) | Témoins positifs |",
    "|---|---|---|---|",
  );
  for (const e of ELIMINATOIRES) {
    const porte = (sens: "+" | "−") => tests.filter((t) => t.sens === sens && e.preuves!.every((x) => t.ids.includes(x)));
    lignes.push(`| ${e.defaut} | ${e.bloc} | ${cellule(porte("−"), e.bloc, "−")} | ${cellule(porte("+"), e.bloc, "+")} |`);
  }
  lignes.push("", "| Règle (Checklist §7.3) | Traitement |", "|---|---|");
  for (const r of REGLES_BLOC) lignes.push(`| ${r.bloc} | ${r.traitement} |`);
  const x203 = tests.filter((t) => t.ids.includes("X.2-03"));
  lignes.push(
    "",
    "## Validations centrales à l'exécution (X.2-03)",
    "",
    "Entrées que les types interdisent, passées malgré tout (forçage `as`, JSON forgé) : refusées à l'exécution par le noyau.",
    "Côté serveur, le point d'entrée Studio est couvert par `apps/api/src/testing/studio-validation-runtime.test.ts`",
    "(outil hors registre, paramètres hors schéma, contrat inconnu : 400 sans écriture).",
    "",
    "| Preuve | Test |",
    "|---|---|",
    ...x203.map((t, i) => `| ${preuve("X.2-03", "−", i + 1)} | (${VOLET[t.fichier]}) ${echapper(t.titre)} |`),
    "",
    "## Permissions et erreurs (X.2-02)",
    "",
    "Matrice rôle × route × attendu, exécutée sur le routeur réel : `docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`",
    "(générée et vérifiée par `apps/api/src/routes/studio-permissions.test.ts`).",
    "",
  );
  return lignes.join("\n");
}

describe("Traçabilité INV → tests (X.2-01, X.2-04), vérifiée contre les sources", () => {
  it("les quinze libellés INV-001 à INV-015 sont ceux de REF-02 §2.4, à la place citée", () => {
    const p = paragraphesDocx(lire(REF02));
    expect(p[205]).toBe("Invariant testable");
    for (const [id, libelle, n] of INVARIANTS) {
      expect(p[n - 1], `${id} w:p ${n}`).toBe(id);
      expect(p[n], `${id} w:p ${n + 1}`).toBe(libelle);
    }
    expect(p[237]).toBe(REGLE_PREUVE);
    // Aucun autre invariant INV-0xx dans le référentiel.
    expect(p.filter((x) => /^INV-\d{3}$/.test(x))).toEqual(INVARIANTS.map(([id]) => id));
  });

  it("les défauts éliminatoires sont ceux du Plan §7.3 et les contrôles BLOC-01 à BLOC-08 ceux de la Checklist §7.3", () => {
    const plan = lire(PLAN).toString("utf8");
    const section = plan.slice(plan.indexOf("### 7.3. Conditions éliminatoires"), plan.indexOf("## 8."));
    for (const e of ELIMINATOIRES) expect(section, e.defaut).toContain(e.defaut);
    const checklist = lire(CHECKLIST).toString("utf8");
    const blocs = [...checklist.matchAll(/\*\*(BLOC-\d{2})\*\*/g)].map((m) => m[1]);
    expect(blocs).toEqual(["BLOC-01", "BLOC-02", "BLOC-03", "BLOC-04", "BLOC-05", "BLOC-06", "BLOC-07", "BLOC-08"]);
    expect(new Set([...ELIMINATOIRES.map((e) => e.bloc), ...REGLES_BLOC.map((r) => r.bloc)])).toEqual(new Set(blocs));
  });

  it("chaque invariant a au moins un test positif et un test d'échec ; chaque défaut éliminatoire, au moins un contrôle bloquant", () => {
    const tests = testsTraces();
    for (const [id] of INVARIANTS) {
      expect(tests.some((t) => t.ids.includes(id) && t.sens === "+"), `${id} positif`).toBe(true);
      expect(tests.some((t) => t.ids.includes(id) && t.sens === "−"), `${id} échec`).toBe(true);
    }
    for (const e of ELIMINATOIRES) {
      if (e.nonAutomatise) continue;
      expect(tests.some((t) => t.sens === "−" && e.preuves!.every((x) => t.ids.includes(x))), e.defaut).toBe(true);
    }
    // Aucun identifiant cité par un test hors des listes de référence (pas d'identifiant inventé).
    const connus = new Set<string>([...INVARIANTS.map(([id]) => id), ...ELIMINATOIRES.map((e) => e.bloc), "X.2-03"]);
    expect(tests.flatMap((t) => t.ids).filter((id) => !connus.has(id))).toEqual([]);
  });

  it("lecture des titres : commentaires retirés, it.each reconnu, tests désactivés ou exclusifs refusés", () => {
    const source = [
      `// it("INV-001 [+] commenté")`,
      `/* it("INV-001 [−] commenté aussi") */`,
      `it("INV-002 [+] vrai, // pas un commentaire", () => {});`,
      `it.each([["a", (x: string) => x.replace(")", "(")]])("INV-003 [−] paramétré %s", () => {});`,
      `test("INV-004 [+] alias", () => {});`,
    ].join("\n");
    expect(titresDeTests(source)).toEqual(["INV-002 [+] vrai, // pas un commentaire", "INV-003 [−] paramétré %s", "INV-004 [+] alias"]);
    for (const d of [`it.skip("x", f)`, `it.only("x", f)`, `describe.skip("x", f)`, `xit("x", f)`, `it.todo("x")`, `it.skipIf(true)("x", f)`]) expect(DESACTIVES.test(d), d).toBe(true);
    expect(DESACTIVES.test(sansCommentaires(`// it.skip("x")\nit("y", f)`))).toBe(false);
    // Les suites tracées n'en contiennent aucun (testsTraces échouerait).
    expect(testsTraces().length).toBeGreaterThan(0);
  });

  it("la table publiée est exactement celle recalculée", () => {
    const md = tableMarkdown();
    if (process.env["STUDIO_TRACABILITE_ECRIRE"] === "1") writeFileSync(`${RACINE}${FICHIER}`, md);
    expect(lire(FICHIER).toString("utf8")).toBe(md);
  });
});
