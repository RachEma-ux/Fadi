/**
 * (Cas 4, lot C4, étape 6) Lecture d'un fichier STEP (ISO 10303-21) tel qu'IFC l'écrit, sans bibliothèque : en-tête
 * (FILE_SCHEMA) et entités de la section DATA avec leurs arguments typés. Pur : ni DOM, ni React.
 */

/** Argument STEP : `null` = `$` (non renseigné), `"*"` = dérivé, référence, énumération, valeur typée, liste. */
export type ArgStep =
  | null
  | "*"
  | number
  | { readonly texte: string }
  | { readonly ref: number }
  | { readonly enum: string }
  | { readonly type: string; readonly valeur: ArgStep }
  | readonly ArgStep[];

export interface EntiteStep {
  readonly id: number;
  readonly type: string;
  readonly args: readonly ArgStep[];
}

export interface FichierStep {
  /** Schéma déclaré (« IFC2X3 », « IFC4 », « IFC4X3_ADD2 »…), en capitales ; `null` = absent. */
  readonly schema: string | null;
  readonly entites: ReadonlyMap<number, EntiteStep>;
}

export class ErreurStep extends Error {}

/** Décodage des chaînes STEP : `''`, `\\`, `\X2\…\X0\` (UTF-16), `\X4\…\X0\`, `\X\hh` (ISO 8859-1), `\S\c`. */
export function decoderChaineStep(s: string): string {
  let r = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "'" && s[i + 1] === "'") {
      r += "'";
      i++;
    } else if (c === "\\") {
      if (s.startsWith("\\X2\\", i) || s.startsWith("\\X4\\", i)) {
        const largeur = s[i + 2] === "2" ? 4 : 8;
        const fin = s.indexOf("\\X0\\", i + 4);
        if (fin < 0) throw new ErreurStep("chaîne STEP mal fermée");
        const hex = s.slice(i + 4, fin);
        for (let k = 0; k + largeur <= hex.length; k += largeur) r += String.fromCodePoint(parseInt(hex.slice(k, k + largeur), 16));
        i = fin + 3;
      } else if (s.startsWith("\\X\\", i)) {
        r += String.fromCharCode(parseInt(s.slice(i + 3, i + 5), 16));
        i += 4;
      } else if (s.startsWith("\\S\\", i)) {
        r += String.fromCharCode((s.charCodeAt(i + 3) || 0) + 128);
        i += 3;
      } else if (s[i + 1] === "\\") {
        r += "\\";
        i++;
      } else if (/^\\P[A-I]\\/.test(s.slice(i, i + 4))) i += 3;
      else r += c;
    } else r += c;
  }
  return r;
}

/** Lecture d'une liste d'arguments à partir de `debut` (juste après la parenthèse ouvrante). */
function lireArguments(t: string, debut: number): { args: ArgStep[]; fin: number } {
  const args: ArgStep[] = [];
  let i = debut;
  const espaces = () => {
    while (i < t.length && /\s/.test(t[i]!)) i++;
  };
  const valeur = (): ArgStep => {
    espaces();
    const c = t[i];
    if (c === "$") {
      i++;
      return null;
    }
    if (c === "*") {
      i++;
      return "*";
    }
    if (c === "#") {
      const m = /^#(\d+)/.exec(t.slice(i, i + 20));
      if (!m) throw new ErreurStep("référence STEP illisible");
      i += m[0].length;
      return { ref: Number(m[1]) };
    }
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        const k = t.indexOf("'", j);
        if (k < 0) throw new ErreurStep("chaîne STEP non fermée");
        if (t[k + 1] === "'") {
          j = k + 2;
          continue;
        }
        const brut = t.slice(i + 1, k);
        i = k + 1;
        return { texte: decoderChaineStep(brut) };
      }
    }
    if (c === "\"") {
      const k = t.indexOf("\"", i + 1);
      if (k < 0) throw new ErreurStep("binaire STEP non fermé");
      const brut = t.slice(i + 1, k);
      i = k + 1;
      return { texte: brut };
    }
    if (c === ".") {
      const k = t.indexOf(".", i + 1);
      if (k < 0) throw new ErreurStep("énumération STEP non fermée");
      const e = t.slice(i + 1, k);
      i = k + 1;
      return { enum: e.toUpperCase() };
    }
    if (c === "(") {
      const r = lireArguments(t, i + 1);
      i = r.fin;
      return r.args;
    }
    const nombre = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(t.slice(i, i + 40));
    if (nombre) {
      i += nombre[0].length;
      return Number(nombre[0]);
    }
    const type = /^[A-Za-z_][A-Za-z0-9_]*/.exec(t.slice(i, i + 80));
    if (type) {
      i += type[0].length;
      espaces();
      if (t[i] !== "(") throw new ErreurStep("valeur typée STEP illisible");
      const r = lireArguments(t, i + 1);
      i = r.fin;
      return { type: type[0].toUpperCase(), valeur: r.args[0] ?? null };
    }
    throw new ErreurStep("argument STEP illisible");
  };
  espaces();
  if (t[i] === ")") return { args, fin: i + 1 };
  for (;;) {
    args.push(valeur());
    espaces();
    if (t[i] === ",") {
      i++;
      continue;
    }
    if (t[i] === ")") return { args, fin: i + 1 };
    throw new ErreurStep("liste STEP mal formée");
  }
}

/** Lecture du fichier : en-tête et entités. Les commentaires `/* … *\/` hors chaînes sont ignorés. */
export function lireStep(texte: string): FichierStep {
  if (!/ISO-10303-21\s*;/.test(texte.slice(0, 2000))) throw new ErreurStep("ce fichier n'est pas un fichier STEP (ISO-10303-21)");
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(texte)?.[1]?.trim().toUpperCase() ?? null;
  const debut = texte.search(/\bDATA\s*;/);
  if (debut < 0) throw new ErreurStep("section DATA absente");
  const entites = new Map<number, EntiteStep>();
  let i = texte.indexOf(";", debut) + 1;
  const n = texte.length;
  while (i < n) {
    // Avance jusqu'à la prochaine entité (« #n = TYPE( »), en sautant les commentaires.
    while (i < n && texte[i] !== "#") {
      if (texte.startsWith("/*", i)) {
        const k = texte.indexOf("*/", i + 2);
        i = k < 0 ? n : k + 2;
        continue;
      }
      if (texte.startsWith("ENDSEC", i)) return { schema, entites };
      i++;
    }
    if (i >= n) break;
    const tete = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/.exec(texte.slice(i, i + 200));
    if (!tete) throw new ErreurStep(`entité STEP illisible près de « ${texte.slice(i, i + 30)} »`);
    const r = lireArguments(texte, i + tete[0].length);
    entites.set(Number(tete[1]), { id: Number(tete[1]), type: tete[2]!.toUpperCase(), args: r.args });
    i = texte.indexOf(";", r.fin);
    if (i < 0) break;
    i++;
  }
  return { schema, entites };
}

// Accès typés aux arguments.
export const refDe = (a: ArgStep | undefined): number | null => (a !== null && typeof a === "object" && "ref" in a ? a.ref : null);
export const texteDe = (a: ArgStep | undefined): string | null => (a !== null && typeof a === "object" && "texte" in a ? a.texte : a !== null && typeof a === "object" && "type" in a ? texteDe(a.valeur) : null);
export const nombreDe = (a: ArgStep | undefined): number | null => (typeof a === "number" ? a : a !== null && typeof a === "object" && "type" in a ? nombreDe(a.valeur) : null);
export const enumDe = (a: ArgStep | undefined): string | null => (a !== null && typeof a === "object" && "enum" in a ? a.enum : null);
export const listeDe = (a: ArgStep | undefined): readonly ArgStep[] => (Array.isArray(a) ? a : []);
export const refsDe = (a: ArgStep | undefined): number[] => listeDe(a).flatMap((x) => {
  const r = refDe(x);
  return r === null ? [] : [r];
});
