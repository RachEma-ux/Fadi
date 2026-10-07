/**
 * Traduction d'un texte d'interface français vers l'anglais (D-163). Pur : aucun DOM.
 *
 * - Correspondance exacte (espaces normalisés, espaces de bord conservés).
 * - Motifs : une clé contenant `{0}`, `{1}`… (gabarit du code) devient une expression ; les valeurs capturées sont
 *   traduites à leur tour quand elles sont elles-mêmes au dictionnaire, et leurs décimales passent au point.
 * - Nombres décimaux français (virgule) écrits avec un point en anglais.
 */
export type Dictionnaire = Record<string, string>;

interface Motif {
  re: RegExp;
  en: string;
  /** Fragment littéral le plus long : filtre rapide avant l'expression. */
  indice: string;
  /** Nombre de lettres littérales (hors valeurs). */
  lettres: number;
}

/** Séparateurs d'énumération de l'interface, du plus large au plus fin : un texte composé se traduit morceau par morceau. */
const SEPARATEURS = [" · ", " — ", " : ", " ; ", " – "];

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const decimales = (s: string) => s.replace(/(\d),(\d)/g, "$1.$2");

export class Traducteur {
  private exact = new Map<string, string>();
  private motifs: Motif[] = [];
  private cache = new Map<string, string | null>();

  constructor(dico: Dictionnaire) {
    for (const [fr, en] of Object.entries(dico)) {
      if (!en) continue;
      if (/\{\d+\}/.test(fr)) {
        const parts = fr.split(/\{\d+\}/);
        const lettres = parts.join("").replace(/[^A-Za-zÀ-ÿ]/g, "");
        // Un motif sans au moins quelques lettres littérales reconnaîtrait n'importe quoi.
        if (lettres.length < 3) continue;
        const vus = new Set<string>();
        let src = "^";
        fr.split(/(\{\d+\})/).forEach((p) => {
          const n = /^\{(\d+)\}$/.exec(p)?.[1];
          if (n !== undefined) {
            // Une valeur répétée dans le gabarit : la seconde occurrence reprend la première.
            src += vus.has(n) ? `\\k<v${n}>` : `(?<v${n}>[\\s\\S]*?)`;
            vus.add(n);
          } else src += echapper(p.replace(/\s+/g, " "));
        });
        src += "$";
        try {
          this.motifs.push({ re: new RegExp(src), en, indice: parts.reduce((a, b) => (b.length > a.length ? b : a), ""), lettres: lettres.length });
        } catch {
          /* motif illisible : ignoré */
        }
      } else this.exact.set(fr.replace(/\s+/g, " ").trim(), en);
    }
    // Les motifs les plus longs (les plus précis) d'abord.
    this.motifs.sort((a, b) => b.indice.length - a.indice.length);
  }

  /** Traduction du cœur d'un texte (sans ses espaces de bord), ou null si inconnu. */
  private coeur(t: string, profondeur = 0): string | null {
    const e = this.exact.get(t);
    if (e !== undefined) return e;
    if (profondeur > 1) return null;
    for (const m of this.motifs) {
      if (m.indice && !t.includes(m.indice)) continue;
      const r = m.re.exec(t);
      if (!r) continue;
      const g = r.groups ?? {};
      // Un motif court ne doit pas « traduire » une donnée : sa partie littérale couvre au moins la moitié du texte,
      // ou elle compte au moins 10 lettres.
      const valeurs = Object.values(g).reduce((n, v) => n + (v?.length ?? 0), 0);
      if (m.lettres < 10 && t.length - valeurs < t.length * 0.5) continue;
      return m.en.replace(/\{(\d+)\}/g, (_x, i: string) => {
        const v = g[`v${i}`] ?? "";
        const vt = v.trim();
        if (!vt) return v;
        const tr = this.exact.get(vt) ?? (/[A-Za-zÀ-ÿ]/.test(vt) && vt.length > 2 ? (this.coeur(vt, profondeur + 1) ?? this.morceaux(vt, 0, profondeur + 1)) : null);
        return decimales(tr !== null && tr !== undefined ? v.replace(vt, tr) : v);
      });
    }
    return null;
  }

  /** Texte composé (« Mur (M) — aide », « 01 · Titre · Terminée ») : chaque morceau traduit s'il est connu. */
  private morceaux(t: string, niveau = 0, profondeur = 0): string | null {
    for (let k = niveau; k < SEPARATEURS.length; k++) {
      const sep = SEPARATEURS[k]!;
      if (!t.includes(sep)) continue;
      let change = false;
      const out = t.split(sep).map((p) => {
        const r = this.morceau(p, k + 1, profondeur);
        if (r !== null) change = true;
        return r ?? p;
      });
      if (change) return out.join(sep);
    }
    return null;
  }

  /** Un morceau : symbole de tête et suffixe court entre parenthèses (raccourci, unité) conservés. */
  private morceau(p: string, niveau: number, profondeur: number): string | null {
    const m = /^([^A-Za-zÀ-ÿ0-9]*\s)?(.*?)(\s\([^()]{1,4}\))?$/.exec(p)!;
    const c = m[2]!;
    if (!/[A-Za-zÀ-ÿ]/.test(c)) return null;
    const r = this.coeur(c, profondeur) ?? this.morceaux(c, niveau, profondeur);
    return r === null ? null : `${m[1] ?? ""}${r}${m[3] ?? ""}`;
  }

  /** Texte traduit (espaces de bord conservés) ; un texte inconnu ne change que par ses décimales. */
  traduire(texte: string): string {
    if (!/[A-Za-zÀ-ÿ0-9]/.test(texte)) return texte;
    const c = this.cache.get(texte);
    if (c !== undefined) return c ?? decimales(texte);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(texte)!;
    const coeur = m[2]!.replace(/\s+/g, " ");
    const tr = /[A-Za-zÀ-ÿ]/.test(coeur) ? (this.coeur(coeur) ?? this.morceau(coeur, 0, 0)) : null;
    const res = tr === null ? null : `${m[1]}${tr}${m[3]}`;
    if (this.cache.size > 20000) this.cache.clear();
    this.cache.set(texte, res);
    return res ?? decimales(texte);
  }
}
