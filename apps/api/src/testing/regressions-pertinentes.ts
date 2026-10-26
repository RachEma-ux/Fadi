/**
 * EX-101 — gestion des régressions (lot G4) : « Un correctif modifiant la géométrie, les projections, les workers ou le
 * Registry déclenche les tests pertinents d'exactitude, d'historique, de permissions, de persistance et de
 * compatibilité des profils. » Cas négatif prescrit : skip des tests pertinents ou assertion affaiblie pour verdir la CI
 * → preuve insuffisante.
 *
 * Pur (le diff et les fichiers sont fournis) :
 * - `zonesTouchees` / `testsPertinents` : les fichiers modifiés sont rapprochés des zones de la table
 *   `scripts/studio-regressions.json` ; chaque zone touchée exige ses tests, par catégorie ;
 * - `controlerTable` : chaque test listé existe, n'est ni sauté, ni isolé, ni « à faire », et la CI l'exécute ; chaque
 *   Worker et chaque fichier du registre appartient à une zone ;
 * - `affaiblissements` : lecture d'un diff unifié des tests — skip / only / todo / skipIf / fails ajoutés, matcher
 *   remplacé par un plus faible sur le même sujet (`toEqual` → `toBeDefined`…), condition rendue toujours vraie,
 *   précision de `toBeCloseTo` abaissée, assertions retirées d'un fichier, test pertinent supprimé. Seul le retrait
 *   d'assertions admet une dérogation, écrite dans un message de commit (`Assertion-retiree: <fichier> — <raison>`) et
 *   rapportée ; les autres affaiblissements sont toujours refusés.
 */

export interface TableRegressions {
  schema: "studio-regressions/1";
  categories: readonly string[];
  zones: Record<string, { motifs: readonly string[]; tests: Record<string, readonly string[]> }>;
  controlesObligatoires: { motifs: readonly string[] };
}

/** Motif de la table : préfixe de dossier (« …/ »), chemin exact, ou glob avec `**` et `*`. */
export function correspond(motif: string, fichier: string): boolean {
  if (motif.endsWith("/")) return fichier.startsWith(motif);
  if (!motif.includes("*")) return fichier === motif;
  const re = motif.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "§").replace(/\*/g, "[^/]*").replace(/§/g, "(?:.*/)?");
  return new RegExp(`^${re}$`).test(fichier);
}

export function zonesTouchees(table: TableRegressions, fichiers: readonly string[]): { zone: string; fichiers: string[] }[] {
  return Object.entries(table.zones)
    .map(([zone, z]) => ({ zone, fichiers: fichiers.filter((f) => z.motifs.some((m) => correspond(m, f))) }))
    .filter((z) => z.fichiers.length > 0);
}

/** Tests exigés par les zones touchées, par catégorie (sans doublon). */
export function testsPertinents(table: TableRegressions, fichiers: readonly string[]): { zones: string[]; parCategorie: Record<string, string[]>; tous: string[] } {
  const zones = zonesTouchees(table, fichiers).map((z) => z.zone);
  const parCategorie: Record<string, string[]> = {};
  for (const c of table.categories) parCategorie[c] = [...new Set(zones.flatMap((z) => table.zones[z]!.tests[c] ?? []))].sort();
  return { zones, parCategorie, tous: [...new Set(Object.values(parCategorie).flat())].sort() };
}

/** Saut inconditionnel (partout refusé) et saut conditionnel (refusé dans un test pertinent). */
const MARQUES_SAUT = /\b(?:it|test|describe|suite|bench)\s*\.\s*(?:skip|only|todo|fails|concurrent\.skip|concurrent\.only)\b|\b(?:xit|xdescribe|fit|fdescribe)\s*\(/;
const MARQUES_SAUT_CONDITIONNEL = /\b(?:it|test|describe|suite)\s*\.\s*(?:skipIf|runIf)\b/;
/** Contrôle de recette `check(nom, condition…)` dont le nom est un littéral. */
function nomCheck(l: string): { nom: string; condition: string } | null {
  const m = l.match(/\bcheck\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1\s*,\s*(.*)$/);
  return m ? { nom: m[2]!, condition: m[3]!.replace(/\)\s*;?\s*$/, "").trim() } : null;
}

export interface ProblemeTable { regle: "test-absent" | "test-saute" | "test-hors-ci" | "categorie-vide" | "fichier-hors-zone"; detail: string }

/**
 * Contrôle de la table contre le dépôt. `lire(f)` : contenu d'un fichier ou `null` ; `fichiersDepot` : chemins suivis ;
 * `ci` : texte des workflows (une recette e2e doit y être citée).
 */
export function controlerTable(table: TableRegressions, lire: (f: string) => string | null, fichiersDepot: readonly string[], ci: string): ProblemeTable[] {
  const p: ProblemeTable[] = [];
  const vus = new Set<string>();
  for (const [zone, z] of Object.entries(table.zones)) {
    for (const c of table.categories) {
      const liste = z.tests[c] ?? [];
      if (liste.length === 0) p.push({ regle: "categorie-vide", detail: `${zone} : aucun test « ${c} »` });
      for (const t of liste) {
        if (vus.has(t)) continue;
        vus.add(t);
        const texte = lire(t);
        if (texte === null) { p.push({ regle: "test-absent", detail: t }); continue; }
        if (MARQUES_SAUT.test(texte) || MARQUES_SAUT_CONDITIONNEL.test(texte)) p.push({ regle: "test-saute", detail: t });
        const vitest = /\.test\.(?:ts|tsx|mjs)$/.test(t) && /^(?:apps\/(?:web|api)|packages\/[^/]+)\/src\//.test(t);
        const recette = /^apps\/web\/e2e\/[^/]+\.mjs$/.test(t) && ci.includes(t);
        if (!vitest && !recette) p.push({ regle: "test-hors-ci", detail: t });
      }
    }
  }
  const zones = Object.values(table.zones);
  for (const f of fichiersDepot) {
    if (!table.controlesObligatoires.motifs.some((m) => correspond(m, f))) continue;
    if (/\.test\.[a-z]+$/.test(f)) continue;
    if (!zones.some((z) => z.motifs.some((m) => correspond(m, f)))) p.push({ regle: "fichier-hors-zone", detail: f });
  }
  return p;
}

// ——— Lecture du diff unifié ———

export interface FichierDiff { fichier: string; supprime: boolean; ajoutees: string[]; retirees: string[] }

/** Découpe un diff unifié (`git diff -U0`) par fichier : lignes ajoutées et retirées. */
export function lireDiff(diff: string): FichierDiff[] {
  const out: FichierDiff[] = [];
  let cur: FichierDiff | null = null;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git ")) { cur = { fichier: l.replace(/^diff --git a\/(.*) b\/.*$/, "$1"), supprime: false, ajoutees: [], retirees: [] }; out.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith("deleted file mode")) { cur.supprime = true; continue; }
    if (l.startsWith("+++ ")) { const b = l.slice(4); if (b !== "/dev/null") cur.fichier = b.replace(/^b\//, ""); continue; }
    if (l.startsWith("--- ")) continue;
    if (l.startsWith("+")) cur.ajoutees.push(l.slice(1));
    else if (l.startsWith("-")) cur.retirees.push(l.slice(1));
  }
  return out;
}

/** Force d'un matcher Vitest / Jest (plus grand = plus strict). */
export function forceMatcher(matcher: string, nie: boolean, args: string): number {
  const vide = args.trim() === "";
  if (nie && ["toBeNull", "toBeUndefined", "toBeNaN", "toBeFalsy", "toBeTruthy"].includes(matcher)) return 1;
  if (["toBeTruthy", "toBeFalsy", "toBeDefined"].includes(matcher)) return 1;
  if ((matcher === "toThrow" || matcher === "toThrowError") && vide) return 2;
  if (["toMatchObject", "toContain", "toContainEqual", "toBeCloseTo", "toMatch", "toBeInstanceOf", "toBeGreaterThan", "toBeGreaterThanOrEqual", "toBeLessThan", "toBeLessThanOrEqual", "toHaveBeenCalled"].includes(matcher)) return 3;
  if (matcher === "toHaveProperty") return args.includes(",") ? 5 : 3;
  if (/expect\.anything\(\)|expect\.any\(/.test(args)) return 2;
  return 5;
}

interface Assertion { sujet: string; matcher: string; nie: boolean; args: string; force: number }

/** Assertion `expect(sujet)[.not].matcher(args)` d'une ligne (la dernière de la ligne). */
export function lireAssertion(ligne: string): Assertion | null {
  const i = ligne.indexOf("expect(");
  if (i < 0) return null;
  const re = /\)\s*\.\s*(not\s*\.\s*)?(?:resolves\s*\.\s*|rejects\s*\.\s*)?(to[A-Za-z]+)\s*\(/g;
  let m: RegExpExecArray | null, dernier: RegExpExecArray | null = null;
  while ((m = re.exec(ligne))) if (m.index > i) dernier = m;
  if (!dernier) return null;
  const sujet = ligne.slice(i + "expect(".length, dernier.index).replace(/\s+/g, " ").trim();
  const debutArgs = dernier.index + dernier[0].length;
  let prof = 1, k = debutArgs;
  for (; k < ligne.length && prof > 0; k++) { if (ligne[k] === "(") prof++; else if (ligne[k] === ")") prof--; }
  const args = ligne.slice(debutArgs, Math.max(debutArgs, k - 1));
  const nie = !!dernier[1];
  return { sujet, matcher: dernier[2]!, nie, args, force: forceMatcher(dernier[2]!, nie, args) };
}

const ASSERTION = /\bexpect\s*\(|\bassert(?:\.[a-zA-Z]+)?\s*\(|\bcheck\s*\(/g;
export const compterAssertions = (texte: string): number => (texte.match(ASSERTION) ?? []).length;

export interface Affaiblissement {
  regle: "saut-ajoute" | "matcher-affaibli" | "condition-toujours-vraie" | "precision-abaissee" | "assertions-retirees" | "test-pertinent-supprime";
  fichier: string;
  detail: string;
  /** Admis par une dérogation écrite dans un commit (retrait d'assertions seulement). */
  deroge?: string;
}

const estTest = (f: string) => /\.test\.(?:ts|tsx|mjs|js)$/.test(f) || /^apps\/web\/e2e\/[^/]+\.mjs$/.test(f);

/**
 * Affaiblissements d'assertion dans un diff. `avant(f)` / `apres(f)` : contenus du fichier à la base et à la tête
 * (`null` si absent) ; `pertinents` : tests exigés ; `derogations` : lignes `Assertion-retiree: <fichier> — <raison>`.
 */
export function affaiblissements(diff: readonly FichierDiff[], avant: (f: string) => string | null, apres: (f: string) => string | null, pertinents: readonly string[], derogations: readonly string[]): Affaiblissement[] {
  const out: Affaiblissement[] = [];
  const deroge = (f: string) => derogations.map((d) => d.match(/^Assertion-retiree:\s*(\S+)\s+[—-]\s+(.+)$/)).find((m) => m && m[1] === f && m[2]!.trim().length >= 10)?.[2]?.trim();
  for (const d of diff) {
    if (!estTest(d.fichier)) continue;
    if (d.supprime) {
      if (pertinents.includes(d.fichier)) out.push({ regle: "test-pertinent-supprime", fichier: d.fichier, detail: "test exigé par la table supprimé" });
      else {
        const n = compterAssertions(avant(d.fichier) ?? "");
        if (n > 0) { const r = deroge(d.fichier); out.push({ regle: "assertions-retirees", fichier: d.fichier, detail: `fichier supprimé : ${n} assertion(s)`, ...(r ? { deroge: r } : {}) }); }
      }
      continue;
    }
    for (const l of d.ajoutees) {
      if (MARQUES_SAUT.test(l) || (pertinents.includes(d.fichier) && MARQUES_SAUT_CONDITIONNEL.test(l))) out.push({ regle: "saut-ajoute", fichier: d.fichier, detail: l.trim() });
      if (/\|\|\s*true\b|expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)/.test(l)) out.push({ regle: "condition-toujours-vraie", fichier: d.fichier, detail: l.trim() });
    }
    // `check(nom, true)` ajouté seul est l'idiome « l'action a abouti » ; il affaiblit quand il remplace check(nom, condition).
    const checksRetires = new Map<string, string>();
    for (const c of d.retirees.map(nomCheck)) if (c && !/^true\b/.test(c.condition)) checksRetires.set(c.nom, c.condition);
    for (const c of d.ajoutees.map(nomCheck)) {
      if (c && /^true\b/.test(c.condition) && checksRetires.has(c.nom)) out.push({ regle: "condition-toujours-vraie", fichier: d.fichier, detail: `check(« ${c.nom} ») : ${checksRetires.get(c.nom)} → true` });
    }
    const retirees = d.retirees.map(lireAssertion).filter((a): a is Assertion => a !== null);
    const ajoutees = d.ajoutees.map(lireAssertion).filter((a): a is Assertion => a !== null);
    for (const r of retirees) {
      const remplace = ajoutees.filter((a) => a.sujet === r.sujet);
      if (remplace.length === 0) continue;
      const meilleur = remplace.reduce((x, y) => (y.force > x.force ? y : x));
      if (meilleur.force < r.force) out.push({ regle: "matcher-affaibli", fichier: d.fichier, detail: `expect(${r.sujet}) : ${r.nie ? "not." : ""}${r.matcher} → ${meilleur.nie ? "not." : ""}${meilleur.matcher}` });
      else if (r.matcher === "toBeCloseTo" && meilleur.matcher === "toBeCloseTo") {
        const prec = (a: string) => { const m = a.match(/,\s*(\d+)\s*$/); return m ? Number(m[1]) : 2; };
        if (prec(meilleur.args) < prec(r.args)) out.push({ regle: "precision-abaissee", fichier: d.fichier, detail: `expect(${r.sujet}).toBeCloseTo : ${prec(r.args)} → ${prec(meilleur.args)} décimales` });
      }
    }
    const a0 = avant(d.fichier), a1 = apres(d.fichier);
    if (a0 !== null && a1 !== null) {
      const n0 = compterAssertions(a0), n1 = compterAssertions(a1);
      if (n1 < n0) { const r = deroge(d.fichier); out.push({ regle: "assertions-retirees", fichier: d.fichier, detail: `${n0} → ${n1} assertion(s)`, ...(r ? { deroge: r } : {}) }); }
    }
  }
  return out;
}

export interface VerdictRegressions {
  zones: string[];
  pertinents: Record<string, string[]>;
  affaiblissements: Affaiblissement[];
  refus: Affaiblissement[];
  derogations: Affaiblissement[];
  /** Tests Vitest à exécuter, groupés par paquet (dossier du paquet → chemins relatifs à ce dossier). */
  aExecuter: Record<string, string[]>;
  /** Recettes e2e pertinentes, jouées par le job e2e de la CI. */
  recettes: string[];
}

/** Paquet d'un fichier de test (dossier qui porte son `package.json`). */
export const paquetDe = (f: string): string | null => f.match(/^(apps\/[^/]+|packages\/[^/]+)\//)?.[1] ?? null;

export function analyser(table: TableRegressions, fichiers: readonly string[], diff: string, avant: (f: string) => string | null, apres: (f: string) => string | null, derogations: readonly string[]): VerdictRegressions {
  const t = testsPertinents(table, fichiers);
  const aff = affaiblissements(lireDiff(diff), avant, apres, t.tous, derogations);
  const aExecuter: Record<string, string[]> = {};
  for (const f of t.tous) {
    if (!/\.test\.[a-z]+$/.test(f)) continue;
    const p = paquetDe(f);
    if (p) (aExecuter[p] ??= []).push(f.slice(p.length + 1));
  }
  return {
    zones: t.zones, pertinents: t.parCategorie, affaiblissements: aff, refus: aff.filter((a) => !a.deroge), derogations: aff.filter((a) => a.deroge),
    aExecuter, recettes: t.tous.filter((f) => f.startsWith("apps/web/e2e/")),
  };
}
