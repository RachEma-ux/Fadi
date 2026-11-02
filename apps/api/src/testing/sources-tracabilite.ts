/**
 * Lecture des sources des contrôles de traçabilité Studio (`studio-tracabilite.test.ts`, `studio-tracabilite-ex.test.ts`) :
 * paragraphes d'un `.docx` (REF-01, REF-02) et titres des tests d'une source. Pur : aucune base, aucun réseau
 * (décompression `zlib` seulement).
 */
import { inflateRawSync } from "node:zlib";

// --- Source .docx : lecture de word/document.xml (archive zip) ------------------------------------------------------

/** Une entrée d'une archive zip (méthodes 0 « stockée » et 8 « deflate »), par son nom ; null si absente. */
export function entreeZip(zip: Buffer, nom: string): Buffer | null {
  let fin = zip.length - 22;
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error("archive zip illisible");
  const n = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  for (let i = 0; i < n; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("répertoire zip illisible");
    const methode = zip.readUInt16LE(p + 10), taille = zip.readUInt32LE(p + 20);
    const lNom = zip.readUInt16LE(p + 28), lExtra = zip.readUInt16LE(p + 30), lComm = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    if (zip.toString("utf8", p + 46, p + 46 + lNom) === nom) {
      const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const brut = zip.subarray(debut, debut + taille);
      if (methode === 0) return Buffer.from(brut);
      if (methode === 8) return inflateRawSync(brut);
      throw new Error(`méthode zip ${methode} non prise en charge`);
    }
    p += 46 + lNom + lExtra + lComm;
  }
  return null;
}
const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
/** Texte de chaque paragraphe `w:p` du document, dans l'ordre (index 0 = paragraphe 1). */
export function paragraphesDocx(docx: Buffer): string[] {
  const xml = entreeZip(docx, "word/document.xml")!.toString("utf8");
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]!).join("")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_x, e: string) => ENTITES[e]!).replace(/&#(\d+);/g, (_x, d: string) => String.fromCodePoint(Number(d))));
}

// --- Titres des tests ------------------------------------------------------------------------------------------------

/**
 * Source sans commentaires (`//` et `/* … *\/`), chaînes et gabarits conservés tels quels : un test commenté n'est pas
 * compté comme une preuve.
 */
export function sansCommentaires(source: string): string {
  let out = "", i = 0;
  while (i < source.length) {
    const c = source[i]!, d = source[i + 1];
    if (c === "/" && d === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const f = source.indexOf("*/", i + 2); i = f < 0 ? source.length : f + 2; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}
/** Indice juste après la parenthèse fermante qui répond à celle de `debut` (chaînes ignorées). */
function apresParentheses(source: string, debut: number): number {
  let p = 0;
  for (let i = debut; i < source.length; i++) {
    const c = source[i]!;
    if (c === "\"" || c === "'" || c === "`") { let j = i + 1; while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1; i = j; continue; }
    if (c === "(") p++;
    else if (c === ")" && --p === 0) return i + 1;
  }
  throw new Error("parenthèse non fermée");
}
/** Tests désactivés ou exclusifs : interdits dans les suites tracées (une preuve sautée n'est pas une preuve). */
export const DESACTIVES = /\b(?:it|test|describe)\s*\.\s*(?:skip|only|todo|skipIf|runIf|fails)\b|\b[xf](?:it|describe|test)\s*\(/;
/** Titres des tests d'une source (`it("…")`, `it.each(…)("…")`, `test(…)`), commentaires retirés. */
export function titresDeTests(source: string): string[] {
  const s = sansCommentaires(source);
  const out: string[] = [];
  for (const m of s.matchAll(/\b(?:it|test)\s*(\.\s*each\s*)?\(/g)) {
    let i = m.index! + m[0].length;
    if (m[1]) { i = apresParentheses(s, i - 1); if (s[i] !== "(") continue; i++; }
    const t = /^\s*"((?:[^"\\]|\\.)*)"/.exec(s.slice(i));
    if (t) out.push(t[1]!);
  }
  return out;
}
