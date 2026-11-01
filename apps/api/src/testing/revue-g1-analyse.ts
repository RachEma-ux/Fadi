/**
 * G1-03 — lecture statique du code pour la revue fonction par fonction : index des fichiers TypeScript du dépôt (analyseur
 * de TypeScript, jamais d'expression régulière sur le texte), résolution des imports relatifs et des paquets
 * `@parcours/*`, et **atteignabilité** : depuis un nœud (gestionnaire d'une commande, d'une route, symbole d'un format),
 * toutes les déclarations de premier niveau qu'il nomme, de proche en proche, à travers les fichiers.
 *
 * Ce qui en est tiré (sur-approximation déclarée : une branche jamais prise compte comme une autre) :
 * - champs du document Studio **écrits** (`state.<champ> = …`, `state.<champ>.push(…)`, `state.<champ>[i] = …`) ;
 * - tables de `db/schema.ts` **écrites** (`insert`, `update`, `delete`) ou **lues** (`from`, jointures), et tables
 *   `studio_*` citées en SQL brut ;
 * - identifiants de contrats versionnés cités (`studio-…/n`, `fadi-studio-…/n`) et schémas zod nommés (`…Schema`).
 * Pur : lecture de fichiers, sans base ni réseau.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

export interface Declaration { readonly fichier: string; readonly nom: string; readonly noeud: ts.Node }
interface Fichier {
  readonly chemin: string;
  readonly source: ts.SourceFile;
  readonly declarations: Map<string, ts.Node>;
  /** Nom local → (module résolu, nom exporté) ; `*` = espace de noms. */
  readonly imports: Map<string, { module: string | null; nom: string }>;
  /** Réexportations nommées (`export { a as b } from`) et globales (`export * from`). */
  readonly reexports: Map<string, { module: string | null; nom: string }>;
  readonly reexportsGlobaux: (string | null)[];
  /** Types déclarés dans le fichier et noms importés (types compris). */
  readonly typesImportes: ReadonlySet<string>;
}

const METHODES_ECRITURE = new Set(["insert", "update", "delete"]);
const METHODES_LECTURE = new Set(["from", "innerJoin", "leftJoin", "rightJoin", "fullJoin"]);
const CONTRAT_VERSIONNE = /^(?:fadi-)?studio-[a-z0-9-]+\/[1-9][0-9]*$/;

export class IndexCode {
  private readonly fichiers = new Map<string, Fichier | null>();
  /** Tables de `db/schema.ts` : identifiant drizzle → nom SQL. */
  readonly tables: ReadonlyMap<string, string>;
  readonly fichierSchema: string;

  constructor(readonly racine: string) {
    this.fichierSchema = join(racine, "apps/api/src/db/schema.ts");
    const tables = new Map<string, string>();
    const schema = this.fichier(this.fichierSchema)!;
    for (const [nom, noeud] of schema.declarations) {
      if (ts.isVariableDeclaration(noeud) && noeud.initializer && ts.isCallExpression(noeud.initializer)
        && ts.isIdentifier(noeud.initializer.expression) && noeud.initializer.expression.text === "pgTable") {
        const premier = noeud.initializer.arguments[0];
        if (premier && ts.isStringLiteral(premier)) tables.set(nom, premier.text);
      }
    }
    this.tables = tables;
  }

  relatif(chemin: string): string { return relative(this.racine, chemin).split("\\").join("/"); }

  /** Module résolu depuis `depuis` : relatif (`./x.js` → `x.ts`, `x/index.ts`) ou paquet `@parcours/<nom>[/sous-chemin]`. */
  resoudre(depuis: string, specifier: string): string | null {
    const candidats = (base: string) => [base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
    if (specifier.startsWith(".")) return candidats(join(dirname(depuis), specifier)).find((c) => existsSync(c) && c.match(/\.tsx?$/)) ?? null;
    const m = /^@parcours\/([\w-]+)(?:\/(.+))?$/.exec(specifier);
    if (!m) return null;
    const dossier = join(this.racine, "packages", m[1]!);
    if (!m[2]) return existsSync(join(dossier, "src/index.ts")) ? join(dossier, "src/index.ts") : null;
    try {
      const exports = (JSON.parse(readFileSync(join(dossier, "package.json"), "utf8")) as { exports?: Record<string, string> }).exports ?? {};
      const cible = exports[`./${m[2]}`];
      return cible ? join(dossier, cible) : null;
    } catch { return null; }
  }

  fichier(chemin: string): Fichier | null {
    if (this.fichiers.has(chemin)) return this.fichiers.get(chemin)!;
    if (!existsSync(chemin)) { this.fichiers.set(chemin, null); return null; }
    const source = ts.createSourceFile(chemin, readFileSync(chemin, "utf8"), ts.ScriptTarget.Latest, true, chemin.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const declarations = new Map<string, ts.Node>();
    const imports = new Map<string, { module: string | null; nom: string }>();
    const reexports = new Map<string, { module: string | null; nom: string }>();
    const reexportsGlobaux: (string | null)[] = [];
    const typesImportes = new Set<string>();
    for (const s of source.statements) {
      if (ts.isFunctionDeclaration(s) && s.name) declarations.set(s.name.text, s);
      else if (ts.isClassDeclaration(s) && s.name) declarations.set(s.name.text, s);
      else if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) typesImportes.add(s.name.text);
      else if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) { if (ts.isIdentifier(d.name)) declarations.set(d.name.text, d); }
      else if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.importClause) {
        const module = this.resoudre(chemin, s.moduleSpecifier.text);
        if (module && s.importClause.namedBindings && ts.isNamedImports(s.importClause.namedBindings)) {
          for (const e of s.importClause.namedBindings.elements) typesImportes.add(e.name.text);
        }
        if (s.importClause.isTypeOnly) continue;
        const c = s.importClause;
        if (c.name) imports.set(c.name.text, { module, nom: "default" });
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) imports.set(c.namedBindings.name.text, { module, nom: "*" });
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
          for (const e of c.namedBindings.elements) if (!e.isTypeOnly) imports.set(e.name.text, { module, nom: (e.propertyName ?? e.name).text });
        }
      } else if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
        const module = s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) ? this.resoudre(chemin, s.moduleSpecifier.text) : undefined;
        if (!s.exportClause) { if (module !== undefined) reexportsGlobaux.push(module); continue; }
        if (ts.isNamedExports(s.exportClause)) {
          for (const e of s.exportClause.elements) {
            if (e.isTypeOnly) continue;
            const nom = (e.propertyName ?? e.name).text;
            reexports.set(e.name.text, module === undefined ? { module: chemin, nom } : { module, nom });
          }
        }
      }
    }
    const f: Fichier = { chemin, source, declarations, imports, reexports, reexportsGlobaux, typesImportes };
    this.fichiers.set(chemin, f);
    return f;
  }

  /** Déclaration exportée sous `nom` par le module (suit les réexportations). */
  exportee(module: string | null, nom: string, vus = new Set<string>()): Declaration | null {
    if (!module || vus.has(`${module}#${nom}`)) return null;
    vus.add(`${module}#${nom}`);
    const f = this.fichier(module);
    if (!f) return null;
    const re = f.reexports.get(nom);
    if (re) return re.module === module ? this.locale(f, re.nom, vus) : this.exportee(re.module, re.nom, vus);
    const d = f.declarations.get(nom);
    if (d) return { fichier: module, nom, noeud: d };
    const imp = f.imports.get(nom);
    if (imp && imp.nom !== "*") return this.exportee(imp.module, imp.nom, vus);
    for (const g of f.reexportsGlobaux) { const r = this.exportee(g, nom, vus); if (r) return r; }
    return null;
  }

  private locale(f: Fichier, nom: string, vus: Set<string>): Declaration | null {
    const d = f.declarations.get(nom);
    if (d) return { fichier: f.chemin, nom, noeud: d };
    const imp = f.imports.get(nom);
    return imp && imp.nom !== "*" ? this.exportee(imp.module, imp.nom, vus) : null;
  }

  /** Déclaration nommée par un identifiant du fichier (déclaration locale, import, membre d'un espace de noms). */
  resoudreIdentifiant(fichier: string, id: ts.Identifier): Declaration | null {
    const f = this.fichier(fichier);
    if (!f) return null;
    const p = id.parent;
    if (p && ts.isPropertyAccessExpression(p) && p.name === id) {
      if (ts.isIdentifier(p.expression)) {
        const ns = f.imports.get(p.expression.text);
        if (ns?.nom === "*") return this.exportee(ns.module, id.text);
      }
      return null;
    }
    if (p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === id) return null;
    return this.locale(f, id.text, new Set());
  }

  /** Le nom de type est-il déclaré dans le fichier, ou importé (types compris) ? Un type global (`Uint8Array`) ne l'est pas. */
  typeDuDepot(fichier: string, nom: string): boolean {
    const f = this.fichier(fichier);
    return !!f && (f.declarations.has(nom) || f.typesImportes.has(nom));
  }

  /** Déclaration de premier niveau d'un fichier par son nom. */
  declaration(fichier: string, nom: string): Declaration | null {
    const f = this.fichier(fichier);
    const d = f?.declarations.get(nom);
    return d ? { fichier, nom, noeud: d } : null;
  }
}

export interface Atteinte {
  /** Nœuds parcourus : le nœud de départ et chaque déclaration atteinte. */
  readonly noeuds: readonly { fichier: string; noeud: ts.Node }[];
  readonly declarations: ReadonlySet<string>;
}

/**
 * Déclarations atteintes depuis `depart` (fichier, nœud), de proche en proche. `arret(fichier)` vrai : la déclaration
 * est notée mais non parcourue (schéma de la base, paquets hors périmètre).
 */
export function atteindre(index: IndexCode, fichier: string, depart: ts.Node, arret: (fichier: string) => boolean = () => false, max = 4000): Atteinte {
  const noeuds: { fichier: string; noeud: ts.Node }[] = [{ fichier, noeud: depart }];
  const declarations = new Set<string>();
  for (let i = 0; i < noeuds.length && declarations.size < max; i++) {
    const { fichier: f, noeud } = noeuds[i]!;
    const visiter = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        const d = index.resoudreIdentifiant(f, n);
        if (d) {
          const cle = `${d.fichier}#${d.nom}`;
          if (!declarations.has(cle)) {
            declarations.add(cle);
            if (!arret(d.fichier) && d.fichier !== index.fichierSchema) noeuds.push({ fichier: d.fichier, noeud: d.noeud });
          }
        }
      }
      ts.forEachChild(n, visiter);
    };
    visiter(noeud);
  }
  return { noeuds, declarations };
}

const visiterTout = (a: Atteinte, f: (n: ts.Node, fichier: string) => void) => {
  for (const { fichier, noeud } of a.noeuds) { const v = (n: ts.Node): void => { f(n, fichier); ts.forEachChild(n, v); }; v(noeud); }
};

/** Champs écrits sur l'état d'un lot (`state.X` / alias `s.X`, X parmi `champs`). */
export function champsEcrits(a: Atteinte, champs: ReadonlySet<string>, receveurs: ReadonlySet<string> = new Set(["state", "s"])): string[] {
  const out = new Set<string>();
  visiterTout(a, (n) => {
    if (!ts.isPropertyAccessExpression(n) || !ts.isIdentifier(n.expression) || !receveurs.has(n.expression.text) || !champs.has(n.name.text)) return;
    const p = n.parent;
    const assigne = (x: ts.Node) => ts.isBinaryExpression(x.parent) && x.parent.left === x && x.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && x.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if (assigne(n)) out.add(n.name.text);
    else if (ts.isElementAccessExpression(p) && p.expression === n && assigne(p)) out.add(n.name.text);
    else if (ts.isPropertyAccessExpression(p) && p.expression === n && ["push", "splice", "unshift", "pop", "shift", "sort", "reverse", "fill"].includes(p.name.text) && ts.isCallExpression(p.parent)) out.add(n.name.text);
  });
  return [...out].sort();
}

/** Champs lus sur un receveur quelconque (`x.champ`, champ parmi `champs`). */
export function champsLus(a: Atteinte, champs: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  visiterTout(a, (n) => { if (ts.isPropertyAccessExpression(n) && champs.has(n.name.text)) out.add(n.name.text); });
  return [...out].sort();
}

/** Tables de la base écrites et lues (identifiants drizzle de `db/schema.ts`), plus tables `studio_*` du SQL brut. */
export function tablesTouchees(index: IndexCode, a: Atteinte): { ecrites: string[]; lues: string[]; nommees: string[] } {
  const ecrites = new Set<string>();
  const lues = new Set<string>();
  /** Noms SQL cités en littéral (tables traitées par liste : archive, restauration). */
  const nommees = new Set<string>();
  const sql = new Set(index.tables.values());
  visiterTout(a, (n, fichier) => {
    if (ts.isStringLiteral(n) && sql.has(n.text)) nommees.add(n.text);
    if (ts.isIdentifier(n)) {
      const d = index.resoudreIdentifiant(fichier, n);
      if (!d || d.fichier !== index.fichierSchema) return;
      const sql = index.tables.get(d.nom);
      if (!sql) return;
      const p = n.parent;
      if (ts.isCallExpression(p) && p.arguments.includes(n as never) && ts.isPropertyAccessExpression(p.expression)) {
        const m = p.expression.name.text;
        if (METHODES_ECRITURE.has(m)) ecrites.add(sql);
        else if (METHODES_LECTURE.has(m)) lues.add(sql);
      }
    } else if (ts.isTaggedTemplateExpression(n) && n.tag.getText() === "sql") {
      for (const m of n.template.getText().matchAll(/\b(insert\s+into|update|delete\s+from|from|join)\s+"?(studio_\w+)/gi)) {
        (/^(insert|update|delete)/i.test(m[1]!) ? ecrites : lues).add(m[2]!);
      }
    }
  });
  return { ecrites: [...ecrites].sort(), lues: [...lues].filter((t) => !ecrites.has(t)).sort(), nommees: [...nommees].sort() };
}

/** Identifiants de contrats versionnés cités en littéral (`studio-commands/1`, `fadi-studio-archive/1`…). */
export function contratsVersionnes(a: Atteinte): string[] {
  const out = new Set<string>();
  visiterTout(a, (n) => { if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && CONTRAT_VERSIONNE.test(n.text)) out.add(n.text); });
  return [...out].sort();
}

/** Schémas zod atteints : déclarations nommées `…Schema` dont l'initialiseur appelle `z.…`. */
export function schemasZod(index: IndexCode, a: Atteinte): string[] {
  const out = new Set<string>();
  for (const cle of a.declarations) {
    const [fichier, nom] = [cle.slice(0, cle.lastIndexOf("#")), cle.slice(cle.lastIndexOf("#") + 1)];
    if (!/Schema$/.test(nom)) continue;
    const d = index.declaration(fichier, nom);
    if (d && ts.isVariableDeclaration(d.noeud) && d.noeud.initializer && /^z\./.test(d.noeud.initializer.getText().replace(/\s/g, ""))) out.add(nom);
  }
  return [...out].sort();
}
