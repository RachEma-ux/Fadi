/**
 * G1-03 — index des tests et recettes du dépôt pour retrouver, à partir du code, **un test qui exerce une fonction** :
 * chaque littéral d'un fichier de test (`*.test.ts`, `*.test.tsx`, `*.test.mjs`) ou de recette (`apps/web/e2e/*.mjs`,
 * `scripts/…/recette-*.mjs`) est relevé avec le **libellé exact** du contrôle qui le porte :
 *
 * - Vitest : nom complet « bloc > test » (`describe` englobants, puis `it` / `test`, `.each` compris ; `.skip` et
 *   `.todo` exclus). Un littéral hors de tout test mais dans un bloc prend le nom du bloc ;
 * - recette : le `check(…)` (ou `ok(…)`, `exiger(…)`) qui contient le littéral, sinon le premier qui le suit dans la
 *   même fonction (la requête précède le contrôle de son résultat).
 * Un gabarit (`` `${V}/commands` ``) est relevé sous sa forme résolue : une constante du fichier (`const V = …`) ou une
 * fonction fléchée qui rend un gabarit (`const chemin = (s) => \`…\``) est remplacée par sa valeur ; toute autre
 * substitution est marquée `SUBST`. Pur : lecture de fichiers.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { estTestOuRecette } from "./libelles-sources.js";

export const SUBST = "\u0000";
export interface Occurrence {
  readonly fichier: string;
  /** Texte du littéral ; un gabarit est résolu, ses substitutions inconnues remplacées par `SUBST`. */
  readonly texte: string;
  /** Texte source du littéral (motif cité dans le rapport). */
  readonly motif: string;
  readonly ligne: number;
  readonly libelle: string;
  readonly genre: "vitest" | "recette";
  /** Méthode HTTP de l'appel qui porte le littéral, quand elle s'y lit (`.post(url)`, `post(url)`, `owner("POST", url)`, `{ method }`). */
  readonly methode: string | null;
  /** Nom de la propriété dont le littéral est la valeur (`toolId: "…"` : commande appliquée), sinon null. */
  readonly cle: string | null;
}

const IGNORES = new Set(["node_modules", "dist", ".git", "coverage", ".vite", "playwright-report", "test-results"]);
const METHODES = new Set(["get", "post", "put", "patch", "delete"]);
const CONTROLES_RECETTE = new Set(["check", "ok", "exiger"]);

export function fichiersDeTests(racine: string, dossiers = ["apps", "packages", "scripts"]): string[] {
  const out: string[] = [];
  const parcourir = (d: string): void => {
    for (const nom of readdirSync(d)) {
      if (IGNORES.has(nom)) continue;
      const p = join(d, nom);
      if (statSync(p).isDirectory()) parcourir(p);
      else { const r = relative(racine, p).split("\\").join("/"); if (estTestOuRecette(r)) out.push(r); }
    }
  };
  for (const d of dossiers) parcourir(join(racine, d));
  return out.sort();
}

const texteDe = (n: ts.Node): string | null => {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.getText().slice(1, -1);
  return null;
};

/** Appel de test Vitest : `it(…)`, `test(…)`, `it.each(t)(…)`, `it.only(…)`, `describe(…)` ; null sinon (ou `.skip` / `.todo`). */
function genreAppel(c: ts.CallExpression): "test" | "bloc" | null {
  let e: ts.Expression = c.expression;
  if (ts.isCallExpression(e)) e = e.expression; // it.each(table)(nom, fn)
  const noms: string[] = [];
  while (ts.isPropertyAccessExpression(e)) { noms.unshift(e.name.text); e = e.expression; }
  if (!ts.isIdentifier(e)) return null;
  if (noms.some((n) => n === "skip" || n === "todo")) return null;
  if (e.text === "it" || e.text === "test") return "test";
  if (e.text === "describe") return "bloc";
  return null;
}

function nomVitest(n: ts.Node): string | null {
  const chaine: string[] = [];
  let test = false;
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (!ts.isCallExpression(p)) continue;
    const g = genreAppel(p);
    if (!g) continue;
    const premier = p.arguments[0];
    const nom = premier ? texteDe(premier) : null;
    if (nom === null) continue;
    if (g === "test") { if (test) continue; test = true; }
    chaine.unshift(nom);
  }
  return chaine.length ? chaine.join(" > ") : null;
}

const fonctionEnglobante = (n: ts.Node): ts.Node => {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return p;
  return n.getSourceFile();
};

function methodeDe(n: ts.Node): string | null {
  const appel = n.parent;
  if (!appel || !ts.isCallExpression(appel) || !appel.arguments.includes(n as ts.Expression)) return null;
  if (ts.isPropertyAccessExpression(appel.expression) && METHODES.has(appel.expression.name.text)) return appel.expression.name.text.toUpperCase();
  if (ts.isIdentifier(appel.expression) && METHODES.has(appel.expression.text)) return appel.expression.text.toUpperCase();
  for (const a of appel.arguments) {
    if (a === n) continue;
    const t = texteDe(a);
    if (t && METHODES.has(t.toLowerCase())) return t.toUpperCase();
    if (ts.isObjectLiteralExpression(a)) {
      for (const p of a.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText() === "method") { const v = texteDe(p.initializer); if (v) return v.toUpperCase(); }
      }
    }
  }
  return null;
}

interface FichierTest {
  readonly fichier: string;
  readonly texte: string;
  readonly source: ts.SourceFile;
  readonly controles: readonly { fn: ts.Node; pos: number; fin: number; libelle: string }[];
}

function analyser(racine: string, fichier: string): FichierTest {
  const texte = readFileSync(join(racine, fichier), "utf8");
  const kind = fichier.endsWith(".tsx") ? ts.ScriptKind.TSX : fichier.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, kind);
  const controles: { fn: ts.Node; pos: number; fin: number; libelle: string }[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CONTROLES_RECETTE.has(n.expression.text) && n.arguments[0]) {
      const l = texteDe(n.arguments[0]);
      if (l !== null) controles.push({ fn: fonctionEnglobante(n), pos: n.getStart(), fin: n.getEnd(), libelle: l });
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return { fichier, texte, source, controles };
}

/** Libellé du contrôle qui porte ce nœud : nom Vitest, sinon `check` englobant ou suivant ; null hors de tout contrôle. */
function libelleDe(f: FichierTest, n: ts.Node, profondeur = 0): { libelle: string; genre: Occurrence["genre"] } | null {
  const v = nomVitest(n);
  if (v !== null) return { libelle: v, genre: "vitest" };
  const pos = n.getStart();
  const englobant = f.controles.find((k) => k.pos <= pos && n.getEnd() <= k.fin);
  if (englobant) return { libelle: englobant.libelle, genre: "recette" };
  // Premier contrôle qui suit, dans la fonction englobante puis dans chacune de celles qui l'englobent.
  for (let fn: ts.Node = fonctionEnglobante(n); ; fn = fonctionEnglobante(fn)) {
    const c = f.controles.find((k) => k.fn === fn && k.pos >= n.getEnd());
    if (c) return { libelle: c.libelle, genre: "recette" };
    // Fonction d'aide nommée (`const lire = (…) => …`) : le contrôle de son premier appel qui en a un.
    const nom = ts.isFunctionDeclaration(fn) && fn.name ? fn.name.text
      : (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : null;
    if (nom && profondeur < 2) {
      let trouve: { libelle: string; genre: Occurrence["genre"] } | null = null;
      const chercher = (x: ts.Node): void => {
        if (trouve) return;
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === nom) trouve = libelleDe(f, x, profondeur + 1);
        ts.forEachChild(x, chercher);
      };
      chercher(f.source);
      if (trouve) return trouve;
    }
    if (ts.isSourceFile(fn)) return null;
  }
}

function occurrences(f: FichierTest): Occurrence[] {
  // Constantes et fonctions fléchées de chemin du fichier (un nom déclaré deux fois n'est pas résolu).
  const consts = new Map<string, ts.Expression | null>();
  const declarer = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, consts.has(n.name.text) ? null : n.initializer);
    ts.forEachChild(n, declarer);
  };
  declarer(f.source);
  const forme = (e: ts.Expression, profondeur: number): string | null => {
    if (profondeur > 6) return null;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isParenthesizedExpression(e)) return forme(e.expression, profondeur + 1);
    if (ts.isTemplateExpression(e)) return e.head.text + e.templateSpans.map((s) => (forme(s.expression, profondeur + 1) ?? SUBST) + s.literal.text).join("");
    if (ts.isIdentifier(e)) { const i = consts.get(e.text); return i ? forme(i, profondeur + 1) : null; }
    if (ts.isArrowFunction(e) && !ts.isBlock(e.body)) return forme(e.body, profondeur + 1);
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const i = consts.get(e.expression.text);
      return i && ts.isArrowFunction(i) && !ts.isBlock(i.body) ? forme(i.body, profondeur + 1) : null;
    }
    return null;
  };
  const out: Occurrence[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const l = libelleDe(f, n);
      if (l) {
        out.push({
          fichier: f.fichier, texte: forme(n as ts.Expression, 0) ?? "", motif: n.getText(), ligne: f.source.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          libelle: l.libelle, genre: l.genre, methode: methodeDe(n),
          cle: ts.isPropertyAssignment(n.parent) && n.parent.initializer === n ? n.parent.name.getText().replace(/^["']|["']$/g, "") : null,
        });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(f.source);
  return out;
}

export class IndexTests {
  readonly occurrences: readonly Occurrence[];
  private readonly analyses = new Map<string, FichierTest>();
  constructor(readonly racine: string, readonly fichiers: readonly string[] = fichiersDeTests(racine)) {
    for (const f of fichiers) this.analyses.set(f, analyser(racine, f));
    this.occurrences = [...this.analyses.values()].flatMap(occurrences);
  }
  /** Littéraux égaux à `texte`, ou qui le contiennent comme mot entier (sélecteur, message). */
  citant(texte: string): Occurrence[] {
    const mot = new RegExp(`(^|[^\\w.-])${texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w.-])`);
    return this.occurrences.filter((o) => o.texte === texte || mot.test(o.texte));
  }
  /**
   * Preuve citée par la matrice d'échanges (fichier + motif littéral) : première apparition du motif qui se trouve dans
   * un contrôle (un import en tête de fichier n'en est pas un), avec le libellé de ce contrôle.
   */
  aPosition(fichier: string, motif: string): Occurrence | null {
    const f = this.analyses.get(fichier);
    if (!f) return null;
    for (let i = f.texte.indexOf(motif); i >= 0; i = f.texte.indexOf(motif, i + 1)) {
      let noeud: ts.Node = f.source;
      for (let encore = true; encore;) {
        encore = false;
        ts.forEachChild(noeud, (c) => { if (!encore && c.getStart() <= i && i < c.getEnd()) { noeud = c; encore = true; } });
      }
      const l = libelleDe(f, noeud);
      if (l) return { fichier, texte: motif, motif, ligne: f.source.getLineAndCharacterOfPosition(i).line + 1, libelle: l.libelle, genre: l.genre, methode: null, cle: null };
    }
    return null;
  }
}

/**
 * Le gabarit d'URL d'un littéral (`SUBST` = substitution) peut-il désigner cette route (`/a/:p/b`) ? Une substitution
 * en tête couvre un ou plusieurs segments (préfixe de chemin inconnu) ; ailleurs, seule dans son segment, elle ne
 * couvre qu'un paramètre de la route ; mêlée à du texte, un segment dont le texte lui correspond. La
 * requête (`?…`) est ignorée ; un gabarit sans aucun segment fixe ne désigne rien.
 */
export function gabaritDesigneRoute(gabarit: string, route: string): boolean {
  return segmentsFixesCommuns(gabarit, route) > 0;
}

/**
 * Nombre de segments fixes du gabarit retrouvés tels quels dans la route (meilleure lecture), ou 0 si le gabarit ne
 * peut pas la désigner. Il en faut au moins un : `${BASE}/auth/login` ne désigne pas `…/:modelId/:action`.
 */
export function segmentsFixesCommuns(gabarit: string, route: string): number {
  const g = gabarit.split("?")[0]!.split("#")[0]!;
  if (!g.includes("/")) return 0;
  const gs = g.split("/");
  const rs = route.split("/");
  if (gs[0] !== "" && gs[0] !== SUBST) return 0;
  const echapper = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ECHEC = -1;
  const memo = new Map<string, number>();
  const suite = (r: number, gain: number) => (r === ECHEC ? ECHEC : r + gain);
  const m = (i: number, j: number): number => {
    const cle = `${i},${j}`;
    if (memo.has(cle)) return memo.get(cle)!;
    let r: number;
    if (i === gs.length) r = j === rs.length ? 0 : ECHEC;
    else if (j === rs.length) r = ECHEC;
    else {
      const s = gs[i]!;
      const seg = rs[j]!;
      const param = seg.startsWith(":");
      if (s === SUBST && i === 0) { r = ECHEC; for (let k = j + 1; k <= rs.length; k++) r = Math.max(r, m(i + 1, k)); }
      // Substitution seule hors de tête : une valeur (identifiant), donc un paramètre de la route, jamais un segment fixe.
      else if (s === SUBST) r = param ? m(i + 1, j + 1) : ECHEC;
      else if (s.includes(SUBST)) r = param || new RegExp(`^${s.split(SUBST).map(echapper).join(".+")}$`).test(seg) ? m(i + 1, j + 1) : ECHEC;
      else if (s === seg) r = suite(m(i + 1, j + 1), s && !param ? 1 : 0);
      else r = param && s !== "" ? m(i + 1, j + 1) : ECHEC;
    }
    memo.set(cle, r);
    return r;
  };
  return Math.max(0, m(0, 0));
}
