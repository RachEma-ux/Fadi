import { StudioValidationError } from "../noyau/validation.js";

/**
 * Lecture minimale d'un fichier STEP physique (ISO 10303-21) pour l'import IFC de Studio : en-tête (`FILE_SCHEMA`) et
 * instances de la section `DATA` (`#n=ENTITE(...);`), valeurs typées. Pur, sans dépendance : ni web-ifc ni WebAssembly.
 * Ce lecteur ne connaît aucun schéma EXPRESS : il rend des enregistrements (type en capitales, attributs dans l'ordre) ;
 * l'interprétation IFC (`import-ifc.ts`) choisit les attributs qu'elle lit et compte le reste.
 *
 * Chaînes : apostrophe doublée, `\\`, `\X2\…\X0\` (UTF-16), `\X4\…\X0\` (points de code), `\X\hh` (ISO 8859-1),
 * `\S\c` (page haute) décodés ; directives `\P…\` ignorées. Commentaires `/* … *\/` retirés.
 */

export type StepValeur =
  | { t: "ref"; n: number }
  | { t: "str"; v: string }
  | { t: "enum"; v: string }
  | { t: "num"; v: number }
  | { t: "list"; v: StepValeur[] }
  | { t: "typed"; type: string; v: StepValeur[] }
  | { t: "null" }
  | { t: "derive" }
  | { t: "bin"; v: string };

export interface StepEntite {
  n: number;
  type: string;
  attrs: StepValeur[];
}

export interface StepFichier {
  /** Schémas déclarés par `FILE_SCHEMA`, en capitales. */
  schemas: string[];
  entites: Map<number, StepEntite>;
}

/** Bornes techniques (pas des valeurs métier) : fichier de 5 Mo au plus, 500 000 instances au plus. */
export const STUDIO_STEP_LIMITES = Object.freeze({ octets: 5 * 1024 * 1024, instances: 500_000, profondeur: 64 } as const);

function fail(message: string): never {
  throw new StudioValidationError("ifc", message);
}

/** Ligne (1-based) d'un indice du texte, pour les messages de refus. */
function ligne(texte: string, i: number): number {
  let n = 1;
  for (let k = 0; k < i && k < texte.length; k++) if (texte.charCodeAt(k) === 10) n++;
  return n;
}

function decoderChaine(brut: string): string {
  let out = "";
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i]!;
    if (c !== "\\") { out += c; continue; }
    const suite = brut.slice(i);
    if (suite.startsWith("\\\\")) { out += "\\"; i += 1; continue; }
    let m = /^\\X2\\((?:[0-9A-Fa-f]{4})*)\\X0\\/.exec(suite);
    if (m) {
      for (let k = 0; k < m[1]!.length; k += 4) out += String.fromCharCode(Number.parseInt(m[1]!.slice(k, k + 4), 16));
      i += m[0].length - 1;
      continue;
    }
    m = /^\\X4\\((?:[0-9A-Fa-f]{8})*)\\X0\\/.exec(suite);
    if (m) {
      for (let k = 0; k < m[1]!.length; k += 8) out += String.fromCodePoint(Number.parseInt(m[1]!.slice(k, k + 8), 16));
      i += m[0].length - 1;
      continue;
    }
    m = /^\\X\\([0-9A-Fa-f]{2})/.exec(suite);
    if (m) { out += String.fromCharCode(Number.parseInt(m[1]!, 16)); i += m[0].length - 1; continue; }
    m = /^\\S\\(.)/s.exec(suite);
    if (m) { out += String.fromCharCode(m[1]!.charCodeAt(0) + 128); i += m[0].length - 1; continue; }
    m = /^\\P[A-I]\\/.exec(suite);
    if (m) { i += m[0].length - 1; continue; }
    out += c;
  }
  return out;
}

const NOMBRE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

class Lecteur {
  i = 0;
  constructor(readonly s: string) {}
  espaces(): void {
    for (;;) {
      for (let c = this.s.charCodeAt(this.i); c === 32 || c === 9 || c === 10 || c === 13 || c === 12; c = this.s.charCodeAt(this.i)) this.i++;
      if (this.s.startsWith("/*", this.i)) {
        const fin = this.s.indexOf("*/", this.i + 2);
        if (fin < 0) fail(`ligne ${ligne(this.s, this.i)} : commentaire non terminé`);
        this.i = fin + 2;
        continue;
      }
      return;
    }
  }
  attendre(c: string): void {
    this.espaces();
    if (this.s[this.i] !== c) fail(`ligne ${ligne(this.s, this.i)} : « ${c} » attendu`);
    this.i++;
  }
  mot(): string {
    this.espaces();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i, this.i + 256));
    if (!m) fail(`ligne ${ligne(this.s, this.i)} : nom d'entité attendu`);
    this.i += m[0].length;
    return m[0].toUpperCase();
  }
  liste(profondeur: number): StepValeur[] {
    if (profondeur > STUDIO_STEP_LIMITES.profondeur) fail(`ligne ${ligne(this.s, this.i)} : listes imbriquées trop profondes`);
    this.attendre("(");
    const out: StepValeur[] = [];
    this.espaces();
    if (this.s[this.i] === ")") { this.i++; return out; }
    for (;;) {
      out.push(this.valeur(profondeur + 1));
      this.espaces();
      const c = this.s[this.i];
      if (c === ",") { this.i++; continue; }
      if (c === ")") { this.i++; return out; }
      fail(`ligne ${ligne(this.s, this.i)} : « , » ou « ) » attendu`);
    }
  }
  valeur(profondeur: number): StepValeur {
    this.espaces();
    const c = this.s[this.i];
    if (c === undefined) fail("fin de fichier inattendue");
    if (c === "$") { this.i++; return { t: "null" }; }
    if (c === "*") { this.i++; return { t: "derive" }; }
    if (c === "(") return { t: "list", v: this.liste(profondeur) };
    if (c === "#") {
      const m = /^#(\d+)/.exec(this.s.slice(this.i, this.i + 24));
      if (!m) fail(`ligne ${ligne(this.s, this.i)} : référence attendue`);
      this.i += m[0].length;
      return { t: "ref", n: Number(m[1]) };
    }
    if (c === "'") {
      let j = this.i + 1, brut = "";
      for (;;) {
        const k = this.s.indexOf("'", j);
        if (k < 0) fail(`ligne ${ligne(this.s, this.i)} : chaîne non terminée`);
        brut += this.s.slice(j, k);
        if (this.s[k + 1] === "'") { brut += "'"; j = k + 2; continue; }
        this.i = k + 1;
        break;
      }
      return { t: "str", v: decoderChaine(brut) };
    }
    if (c === ".") {
      const m = /^\.([A-Za-z_][A-Za-z0-9_]*)\./.exec(this.s.slice(this.i, this.i + 256));
      if (m) { this.i += m[0].length; return { t: "enum", v: m[1]!.toUpperCase() }; }
    }
    if (c === "\"") {
      const k = this.s.indexOf("\"", this.i + 1);
      if (k < 0) fail(`ligne ${ligne(this.s, this.i)} : binaire non terminé`);
      const v = this.s.slice(this.i + 1, k);
      this.i = k + 1;
      return { t: "bin", v };
    }
    if (/[A-Za-z_]/.test(c)) {
      const type = this.mot();
      return { t: "typed", type, v: this.liste(profondeur) };
    }
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i, this.i + 64));
    if (!m || !NOMBRE.test(m[0])) fail(`ligne ${ligne(this.s, this.i)} : valeur attendue`);
    const v = Number(m[0]);
    if (!Number.isFinite(v)) fail(`ligne ${ligne(this.s, this.i)} : nombre fini attendu`);
    this.i += m[0].length;
    return { t: "num", v };
  }
}

/** Section `HEADER` → schémas déclarés ; section `DATA` → instances (une seule section DATA lue, la première). */
export function lireStep(texte: string): StepFichier {
  if (typeof texte !== "string") fail("texte attendu");
  if (texte.length > STUDIO_STEP_LIMITES.octets) fail(`fichier de ${STUDIO_STEP_LIMITES.octets / 1024 / 1024} Mo au plus`);
  const s = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
  if (!/^\s*ISO-10303-21\s*;/.test(s)) fail("fichier STEP attendu (ISO-10303-21) : seul l’IFC en texte (STEP physique) est lu");
  const schemaMatch = /FILE_SCHEMA\s*\(\s*\(([^)]*)\)\s*\)/i.exec(s);
  const schemas = schemaMatch ? [...schemaMatch[1]!.matchAll(/'([^']*)'/g)].map((m) => m[1]!.trim().toUpperCase()) : [];
  const debut = /(^|;)\s*DATA\s*;/m.exec(s);
  if (!debut) fail("section DATA absente");
  const lecteur = new Lecteur(s);
  lecteur.i = debut.index + debut[0].length;
  const entites = new Map<number, StepEntite>();
  for (;;) {
    lecteur.espaces();
    if (lecteur.i >= s.length) fail("section DATA non terminée (ENDSEC attendu)");
    if (/^ENDSEC\s*;/.test(s.slice(lecteur.i, lecteur.i + 16))) break;
    const m = /^#(\d+)\s*=/.exec(s.slice(lecteur.i, lecteur.i + 32));
    if (!m) fail(`ligne ${ligne(s, lecteur.i)} : instance « #n = … » attendue`);
    lecteur.i += m[0].length;
    const n = Number(m[1]);
    lecteur.espaces();
    // Instance complexe `#n=(A(...)B(...));` : non interprétée, gardée sous le type `(COMPLEXE)`.
    let type: string, attrs: StepValeur[];
    if (s[lecteur.i] === "(") {
      lecteur.i++;
      const parts: StepValeur[] = [];
      for (;;) {
        lecteur.espaces();
        if (s[lecteur.i] === ")") { lecteur.i++; break; }
        const t = lecteur.mot();
        parts.push({ t: "typed", type: t, v: lecteur.liste(1) });
      }
      type = "(COMPLEXE)";
      attrs = parts;
    } else {
      type = lecteur.mot();
      attrs = lecteur.liste(0);
    }
    lecteur.attendre(";");
    if (entites.has(n)) fail(`instance #${n} définie deux fois`);
    if (entites.size >= STUDIO_STEP_LIMITES.instances) fail(`${STUDIO_STEP_LIMITES.instances} instances au plus`);
    entites.set(n, { n, type, attrs });
  }
  return { schemas, entites };
}
