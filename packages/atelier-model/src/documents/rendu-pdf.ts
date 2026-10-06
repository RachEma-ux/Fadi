/**
 * PDF vectoriel d'une feuille (PDF 1.4, une page, police standard Helvetica en WinAnsi, sans compression ni
 * dépendance) : mêmes primitives que le SVG, mêmes octets d'une génération à l'autre (pas de date de création).
 */
import type { Vec } from "../geometrie.js";
import { EPAISSEUR_MM, grisRemplissage, GRIS_TRAIT, TIRETS_MM, type Primitive, type Trait } from "./dessin.js";
import type { FeuilleComposee } from "./feuilles.js";

const PT = 72 / 25.4;
const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) || Math.abs(r) < 0.0005 ? "0" : String(r);
};

/** Caractères hors Latin-1 de la table WinAnsi (0x80–0x9F). */
const WINANSI: Record<string, number> = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
const SUBSTITUTS: Record<string, string> = { "\u2212": "-", "\u2264": "<=", "\u2265": ">=", "\u2192": "->", "\u2190": "<-", "\u202f": " ", "\u2009": " " };

/** Texte encodé en WinAnsi (octets 0–255 portés par une chaîne binaire), échappé pour une chaîne PDF. */
export function winAnsi(t: string): string {
  let out = "";
  for (const ch of t) {
    const s = SUBSTITUTS[ch];
    if (s !== undefined && s !== ch) {
      out += winAnsi(s);
      continue;
    }
    const code = ch.codePointAt(0)!;
    let b: number;
    if (WINANSI[ch] !== undefined) b = WINANSI[ch]!;
    else if (code === 0x0d7) b = 0xd7;
    else if (code >= 0x20 && code <= 0x7e) b = code;
    else if (code >= 0xa0 && code <= 0xff) b = code;
    else b = 0x3f; // « ? » : caractère absent de la police standard
    const c = String.fromCharCode(b);
    out += c === "(" || c === ")" || c === "\\" ? `\\${c}` : c;
  }
  return out;
}

/** Largeur approchée d'un texte Helvetica (en fractions de corps) pour aligner au milieu ou à droite. */
function largeurHelvetica(t: string): number {
  let w = 0;
  for (const ch of t) {
    if (" .,:;'!|il".includes(ch)) w += 0.278;
    else if ("jft()[]-".includes(ch)) w += 0.333;
    else if ("mwMW@%".includes(ch)) w += 0.833;
    else if (ch >= "A" && ch <= "Z") w += 0.667;
    else w += 0.556;
  }
  return w;
}

function etatTrait(t: Trait): string {
  const tirets = TIRETS_MM[t];
  return `${n(EPAISSEUR_MM[t] * PT)} w ${n(GRIS_TRAIT[t])} G [${tirets.map((d) => n(d * PT)).join(" ")}] 0 d`;
}

function cheminPdf(pts: readonly Vec[], ferme: boolean): string {
  const q = pts.map((p) => `${n(p.x * PT)} ${n(p.y * PT)}`);
  return `${q[0]} m ${q.slice(1).map((s) => `${s} l`).join(" ")}${ferme ? " h" : ""}`;
}

function cerclePdf(c: Vec, r: number): string {
  const k = 0.5523 * r;
  const p = (x: number, y: number) => `${n(x * PT)} ${n(y * PT)}`;
  return [
    `${p(c.x + r, c.y)} m`,
    `${p(c.x + r, c.y + k)} ${p(c.x + k, c.y + r)} ${p(c.x, c.y + r)} c`,
    `${p(c.x - k, c.y + r)} ${p(c.x - r, c.y + k)} ${p(c.x - r, c.y)} c`,
    `${p(c.x - r, c.y - k)} ${p(c.x - k, c.y - r)} ${p(c.x, c.y - r)} c`,
    `${p(c.x + k, c.y - r)} ${p(c.x + r, c.y - k)} ${p(c.x + r, c.y)} c`,
  ].join(" ");
}

/** Flux de contenu de la page (primitives en millimètres, y vers le haut). */
function contenu(primitives: readonly Primitive[]): string {
  const l: string[] = ["1 J 1 j"];
  // Remplissages d'abord, puis traits, puis textes (même ordre que le SVG).
  for (const p of primitives) if (p.type === "poly" && p.remplissage) l.push(`${n(grisRemplissage(p))} g ${cheminPdf(p.points, true)} f`);
  let courant: Trait | null = null;
  const regler = (t: Trait) => {
    if (t !== courant) {
      l.push(etatTrait(t));
      courant = t;
    }
  };
  for (const p of primitives) {
    if (p.type === "ligne") {
      regler(p.trait);
      l.push(`${n(p.a.x * PT)} ${n(p.a.y * PT)} m ${n(p.b.x * PT)} ${n(p.b.y * PT)} l S`);
    } else if (p.type === "poly" && p.trait) {
      regler(p.trait);
      l.push(`${cheminPdf(p.points, p.ferme)} S`);
    } else if (p.type === "cercle") {
      regler(p.trait);
      l.push(`${cerclePdf(p.centre, p.rayon)} S`);
    }
  }
  for (const p of primitives) {
    if (p.type !== "texte") continue;
    const corps = p.hauteurMm * PT;
    const w = largeurHelvetica(p.texte) * corps;
    const decal = p.ancre === "milieu" ? -w / 2 : p.ancre === "fin" ? -w : 0;
    const a = (p.angle * Math.PI) / 180;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const x = p.position.x * PT + decal * cs;
    const y = p.position.y * PT + decal * sn;
    l.push(`BT /F1 ${n(corps)} Tf ${n(GRIS_TRAIT[p.trait])} g ${n(cs)} ${n(sn)} ${n(-sn)} ${n(cs)} ${n(x)} ${n(y)} Tm (${winAnsi(p.texte)}) Tj ET`);
  }
  return l.join("\n");
}

/** Octets d'un PDF d'une page aux dimensions données (mm). */
export function pdfPage(largeurMm: number, hauteurMm: number, primitives: readonly Primitive[], titre: string): Uint8Array {
  const flux = contenu(primitives);
  const objets = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(largeurMm * PT)} ${n(hauteurMm * PT)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Title (${winAnsi(titre)}) /Producer (Fadi - Atelier) >>`,
  ];
  let doc = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const decalages: number[] = [];
  objets.forEach((o, i) => {
    decalages.push(doc.length);
    doc += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = doc.length;
  doc += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${decalages.map((d) => `${String(d).padStart(10, "0")} 00000 n \n`).join("")}`;
  doc += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const octets = new Uint8Array(doc.length);
  for (let i = 0; i < doc.length; i++) octets[i] = doc.charCodeAt(i) & 0xff;
  return octets;
}

export function pdfFeuille(f: FeuilleComposee): Uint8Array {
  return pdfPage(f.largeur, f.hauteur, f.primitives, `${f.params.numero} - ${f.params.titre}`);
}

/** Une vue seule en PDF, à son échelle (page à la taille du dessin), avec titre, révision et empreinte. */
export function pdfVue(vue: import("./vues.js").VueGeneree, revision: number): Uint8Array {
  const MARGE = 10;
  const k = 1000 / vue.params.echelle;
  const b = vue.bornes ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const largeur = Math.max(120, (b.max.x - b.min.x) * k + 2 * MARGE);
  const hauteur = (b.max.y - b.min.y) * k + 2 * MARGE + 12;
  const tr = (p: Vec): Vec => ({ x: MARGE + (p.x - b.min.x) * k, y: 12 + MARGE + (p.y - b.min.y) * k });
  const prims: Primitive[] = vue.primitives.map((p) => {
    switch (p.type) {
      case "ligne":
        return { ...p, a: tr(p.a), b: tr(p.b) };
      case "poly":
        return { ...p, points: p.points.map(tr) };
      case "cercle":
        return { ...p, centre: tr(p.centre), rayon: p.rayon * k };
      case "texte":
        return { ...p, position: tr(p.position) };
    }
  });
  prims.push({ type: "texte", position: { x: MARGE, y: 8 }, texte: `${vue.params.titre} · 1:${vue.params.echelle} · révision du modèle ${revision} · empreinte ${vue.empreinte}`, hauteurMm: 3, ancre: "debut", angle: 0, trait: "annotation", objetId: null });
  return pdfPage(largeur, hauteur, prims, vue.params.titre);
}
