/**
 * Libellés de contrôle d'un fichier de test ou de recette, lus par l'analyseur de TypeScript (jamais par expression
 * régulière sur le texte : un commentaire, une apostrophe ou un échappement `’` ne trompent pas la lecture).
 *
 * Règle explicite (X.3-02, G1-03) :
 * - un littéral de chaîne (`"…"`, `'…'`) ou un gabarit sans substitution (`` `…` ``) est un libellé **exact**, comparé
 *   mot pour mot après décodage des échappements (`’` vaut `’`, `\'` vaut `'`) ;
 * - un gabarit à substitutions (`` `NAV-003 : ${n} projets` ``) est un **gabarit** : un libellé lui correspond si chaque
 *   partie fixe s'y retrouve, dans l'ordre, sans rien autour, chaque `${…}` couvrant au moins un caractère. Un gabarit
 *   n'est admis que si ses parties fixes portent au moins `GABARIT_FIXE_MIN` caractères non blancs (un `${nom}` seul ne
 *   « prouve » aucun libellé) ;
 * - un nom de test Vitest paramétré (`it.each`) écrit `%s`, `%d`, `%i`, `%j`, `%o` ou `$champ` : ces jetons valent
 *   chacun au moins un caractère, avec le même seuil de partie fixe.
 * Pur : ni base ni réseau.
 */
import ts from "typescript";

export const GABARIT_FIXE_MIN = 12;

export interface LibellesFichier {
  readonly exacts: ReadonlySet<string>;
  /** Gabarits admis (seuil de partie fixe atteint), compilés en expressions ancrées. */
  readonly gabarits: readonly { readonly source: string; readonly motif: RegExp }[];
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fixeSuffisant = (parties: readonly string[]) => parties.join("").replace(/\s/g, "").length >= GABARIT_FIXE_MIN;
const JETON_EACH = /%[sdifjo]|\$[A-Za-z_][\w.]*/g;

function genreDe(chemin: string): ts.ScriptKind {
  if (chemin.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (chemin.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Littéraux exacts et gabarits admis d'un fichier source (`.ts`, `.tsx`, `.mjs`, `.js`). */
export function libellesDuFichier(chemin: string, texte: string): LibellesFichier {
  const source = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true, genreDe(chemin));
  const exacts = new Set<string>();
  const gabarits: { source: string; motif: RegExp }[] = [];
  const ajouterGabarit = (parties: readonly string[], brut: string) => {
    if (!fixeSuffisant(parties)) return;
    gabarits.push({ source: brut, motif: new RegExp(`^${parties.map(echapper).join("[\\s\\S]+?")}$`) });
  };
  const visiter = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      exacts.add(n.text);
      const parties = n.text.split(JETON_EACH);
      if (parties.length > 1) ajouterGabarit(parties, n.text);
    } else if (ts.isTemplateExpression(n)) {
      ajouterGabarit([n.head.text, ...n.templateSpans.map((s) => s.literal.text)], n.getText(source));
    }
    ts.forEachChild(n, visiter);
  };
  visiter(source);
  return { exacts, gabarits };
}

/** Le libellé est-il écrit dans le fichier : littéral exact, sinon gabarit admis qui le couvre (rend sa source). */
export function trouverLibelle(l: LibellesFichier, libelle: string): { mode: "exact" } | { mode: "gabarit"; gabarit: string } | null {
  if (l.exacts.has(libelle)) return { mode: "exact" };
  const g = l.gabarits.find((x) => x.motif.test(libelle));
  return g ? { mode: "gabarit", gabarit: g.source } : null;
}

/**
 * Fichier de test (`*.test.ts`, `*.test.tsx`, `*.test.mjs`) ou de recette (`apps/web/e2e/*.mjs`, `recette-*.mjs` sous
 * `scripts/`) : seuls ceux-là citent des libellés de contrôle.
 */
export const estTestOuRecette = (chemin: string) =>
  /\.test\.(?:tsx?|mjs)$/.test(chemin) || /^apps\/web\/e2e\/.+\.mjs$/.test(chemin) || /^scripts\/(?:.+\/)?recette-[^/]+\.mjs$/.test(chemin);
