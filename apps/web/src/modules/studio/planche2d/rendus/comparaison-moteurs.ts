/**
 * Comparaison des moteurs de rendu 2D SVG / Canvas / GPU (TEST-025) — **preuve seulement** : DEC-08 retient SVG pour la
 * planche ; ce module ne bascule rien et n'est importé par aucun écran. Il sert à la recette `e2e/studio-rendu.mjs`
 * (mesures dans le navigateur : fidélité en pixels, accessibilité, latence) et au test `comparaison-moteurs.test.ts`
 * (fidélité des primitives et des positions, sans navigateur).
 *
 * Scène commune : le SVG exporté par le modèle (`exportStudioSvg`, référence des scènes S1–S3 du corpus). Il est lu en
 * primitives (`lirePrimitivesSvg` : ligne, rectangle, cercle, chemin M/L/A/Z, polygone, texte) ; le moteur Canvas les
 * trace par l'API Canvas 2D (`dessinerCanvas`, sur tout contexte qui offre ses méthodes) ; le moteur GPU les réduit en
 * segments de droite (`segmentsGpu` ; arcs découpés à pas angulaire fixe déclaré, textes **non tracés** : il faudrait un
 * atlas de glyphes, absent). Fidélité géométrique : les deux tracés sont ramenés en traits élémentaires (segments, arcs
 * exacts, textes) dans le repère de l'utilisateur SVG et comparés (`comparerTraits`). Aucun seuil n'est posé ici.
 *
 * Pur : aucun import, ni React ni DOM (le contexte Canvas est injecté).
 */

export type CommandeChemin = { c: "M" | "L"; x: number; y: number } | { c: "A"; r: number; grand: boolean; sens: boolean; x: number; y: number } | { c: "Z" };

interface Commun { calque: string; visible: boolean }
export type Primitive2D = Commun & (
  | { genre: "ligne"; x1: number; y1: number; x2: number; y2: number }
  | { genre: "rect"; x: number; y: number; w: number; h: number }
  | { genre: "cercle"; cx: number; cy: number; r: number }
  | { genre: "chemin"; commandes: CommandeChemin[] }
  | { genre: "polygone"; points: [number, number][] }
  | { genre: "texte"; x: number; y: number; taille: number; ancre: "start" | "middle" | "end"; rotation: number; contenu: string }
);

export interface SceneSvg { viewBox: [number, number, number, number]; primitives: Primitive2D[] }

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decoder = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITES[e]!));
const attributs = (s: string): Record<string, string> => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, decoder(m[2]!)]));
const nombre = (v: string | undefined): number => (v === undefined ? Number.NaN : Number(v));

function lireChemin(d: string): CommandeChemin[] {
  const jetons = d.match(/[MLAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: CommandeChemin[] = [];
  let i = 0;
  const n = () => Number(jetons[i++]);
  while (i < jetons.length) {
    const c = jetons[i++]!.toUpperCase();
    if (c === "M" || c === "L") out.push({ c, x: n(), y: n() });
    else if (c === "A") { const rx = n(); n(); n(); const grand = n() === 1, sens = n() === 1; out.push({ c: "A", r: rx, grand, sens, x: n(), y: n() }); }
    else if (c === "Z") out.push({ c: "Z" });
    else throw new Error(`commande de chemin non prise en charge : ${c}`);
  }
  return out;
}

/** Rotation `rotate(a x y)` d'un texte (degrés), 0 sans transformation. */
function rotationTexte(t: string | undefined): number {
  if (!t) return 0;
  const m = /^rotate\(\s*(-?[\d.e+-]+)(?:[\s,]+-?[\d.e+-]+[\s,]+-?[\d.e+-]+)?\s*\)$/.exec(t.trim());
  if (!m) throw new Error(`transformation non prise en charge : ${t}`);
  return Number(m[1]);
}

/**
 * Lit le SVG exporté par Studio en primitives, dans l'ordre du fichier. Un élément graphique inconnu est une erreur
 * (jamais ignoré en silence) ; un calque masqué (`display="none"`) garde ses primitives, marquées non visibles.
 */
export function lirePrimitivesSvg(svg: string): SceneSvg {
  const racine = /<svg\b([^>]*)>/.exec(svg);
  if (!racine) throw new Error("SVG sans élément racine");
  const vb = (attributs(racine[1]!).viewBox ?? "").split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) throw new Error("viewBox absente ou illisible");
  const primitives: Primitive2D[] = [];
  const pile: { calque: string | null; visible: boolean }[] = [];
  const re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>|([^<]+)/g;
  let texte: (Commun & { genre: "texte"; x: number; y: number; taille: number; ancre: "start" | "middle" | "end"; rotation: number; contenu: string }) | null = null;
  let m: RegExpExecArray | null;
  const etat = () => ({ calque: [...pile].reverse().find((p) => p.calque !== null)?.calque ?? "", visible: pile.every((p) => p.visible) });
  while ((m = re.exec(svg))) {
    if (m[5] !== undefined) { if (texte) texte.contenu += decoder(m[5]); continue; }
    const [, fin, nom, brut, auto] = m;
    if (nom === "svg" || nom === "xml" || nom === "?xml") continue;
    if (fin) {
      if (nom === "g") pile.pop();
      if (nom === "text" && texte) { primitives.push(texte); texte = null; }
      continue;
    }
    const a = attributs(brut ?? "");
    if (nom === "g") { if (!auto) pile.push({ calque: a["data-layer"] ?? null, visible: a.display !== "none" }); continue; }
    const c = etat();
    switch (nom) {
      case "line": primitives.push({ ...c, genre: "ligne", x1: nombre(a.x1), y1: nombre(a.y1), x2: nombre(a.x2), y2: nombre(a.y2) }); break;
      case "rect": primitives.push({ ...c, genre: "rect", x: nombre(a.x), y: nombre(a.y), w: nombre(a.width), h: nombre(a.height) }); break;
      case "circle": primitives.push({ ...c, genre: "cercle", cx: nombre(a.cx), cy: nombre(a.cy), r: nombre(a.r) }); break;
      case "path": primitives.push({ ...c, genre: "chemin", commandes: lireChemin(a.d ?? "") }); break;
      case "polygon": primitives.push({ ...c, genre: "polygone", points: (a.points ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number) as [number, number]) }); break;
      case "text":
        texte = { ...c, genre: "texte", x: nombre(a.x), y: nombre(a.y), taille: nombre(a["font-size"]), ancre: (a["text-anchor"] ?? "start") as "start" | "middle" | "end", rotation: rotationTexte(a.transform), contenu: "" };
        if (auto) { primitives.push(texte); texte = null; }
        break;
      default: throw new Error(`élément SVG non pris en charge : ${nom}`);
    }
  }
  return { viewBox: vb as [number, number, number, number], primitives };
}

/** Éléments graphiques du fichier (comptage indépendant du lecteur : rien n'est perdu à la lecture). */
export function compterElementsSvg(svg: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of svg.matchAll(/<(line|rect|circle|path|polygon|text)\b/g)) out[m[1]!] = (out[m[1]!] ?? 0) + 1;
  return out;
}

// ——— Arcs : extrémités SVG → centre ———

export interface ArcCentre { cx: number; cy: number; r: number; debut: number; fin: number; /** Sens des angles croissants (sens horaire à l'écran, y descendant). */ positif: boolean }

/** Arc circulaire SVG de (x0, y0) à (x1, y1), rayon r (agrandi s'il est trop petit, comme SVG le prescrit). */
export function arcCentre(x0: number, y0: number, r0: number, grand: boolean, sens: boolean, x1: number, y1: number): ArcCentre | null {
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || !(r0 > 0)) return null;
  const r = Math.max(Math.abs(r0), Math.sqrt(d2));
  const k = (grand === sens ? -1 : 1) * Math.sqrt(Math.max(0, (r * r - d2) / d2));
  const cx = (x0 + x1) / 2 + k * dy, cy = (y0 + y1) / 2 - k * dx;
  const debut = Math.atan2(y0 - cy, x0 - cx), fin = Math.atan2(y1 - cy, x1 - cx);
  return { cx, cy, r, debut, fin, positif: sens };
}

// ——— Canvas ———

/** Ce que le moteur Canvas emploie de `CanvasRenderingContext2D` (un contexte réel ou un enregistreur). */
export interface Contexte2D {
  lineWidth: number;
  strokeStyle: string;
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, antihoraire?: boolean): void;
  closePath(): void;
  stroke(): void;
  fillText(t: string, x: number, y: number): void;
}

/** Cadre d'affichage : la viewBox posée dans `largeur` × `hauteur` pixels (préservation des proportions, centrée, comme SVG). */
export interface Cadre2D { echelle: number; ox: number; oy: number }
export function cadreViewBox(vb: readonly [number, number, number, number], largeur: number, hauteur: number): Cadre2D {
  const echelle = Math.min(largeur / vb[2], hauteur / vb[3]);
  return { echelle, ox: (largeur - vb[2] * echelle) / 2 - vb[0] * echelle, oy: (hauteur - vb[3] * echelle) / 2 - vb[1] * echelle };
}

const ALIGN = { start: "left", middle: "center", end: "right" } as const;

/**
 * Trace les primitives visibles sur `ctx` : traits de 1 px (comme `vector-effect="non-scaling-stroke"` de l'export),
 * noir, sans remplissage ; textes remplis, police sans empattement, ligne de base alphabétique. Les coordonnées sont
 * transformées à la main (le trait garde 1 px quelle que soit l'échelle).
 */
export function dessinerCanvas(ctx: Contexte2D, scene: SceneSvg, largeur: number, hauteur: number): void {
  const { echelle: s, ox, oy } = cadreViewBox(scene.viewBox, largeur, hauteur);
  const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  for (const p of scene.primitives) {
    if (!p.visible) continue;
    switch (p.genre) {
      case "ligne": ctx.beginPath(); ctx.moveTo(X(p.x1), Y(p.y1)); ctx.lineTo(X(p.x2), Y(p.y2)); ctx.stroke(); break;
      case "rect": ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(p.x + p.w), Y(p.y)); ctx.lineTo(X(p.x + p.w), Y(p.y + p.h)); ctx.lineTo(X(p.x), Y(p.y + p.h)); ctx.closePath(); ctx.stroke(); break;
      case "cercle": ctx.beginPath(); ctx.moveTo(X(p.cx + p.r), Y(p.cy)); ctx.arc(X(p.cx), Y(p.cy), p.r * s, 0, 2 * Math.PI, false); ctx.stroke(); break;
      case "polygone": ctx.beginPath(); p.points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.closePath(); ctx.stroke(); break;
      case "chemin": {
        ctx.beginPath();
        let cx = 0, cy = 0;
        for (const c of p.commandes) {
          if (c.c === "M") { ctx.moveTo(X(c.x), Y(c.y)); cx = c.x; cy = c.y; }
          else if (c.c === "L") { ctx.lineTo(X(c.x), Y(c.y)); cx = c.x; cy = c.y; }
          else if (c.c === "A") {
            const a = arcCentre(cx, cy, c.r, c.grand, c.sens, c.x, c.y);
            if (a) ctx.arc(X(a.cx), Y(a.cy), a.r * s, a.debut, a.fin, !a.positif); else ctx.lineTo(X(c.x), Y(c.y));
            cx = c.x; cy = c.y;
          } else ctx.closePath();
        }
        ctx.stroke();
        break;
      }
      case "texte":
        ctx.save();
        ctx.translate(X(p.x), Y(p.y));
        if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.font = `${p.taille * s}px sans-serif`;
        ctx.textAlign = ALIGN[p.ancre];
        ctx.fillText(p.contenu, 0, 0);
        ctx.restore();
        break;
    }
  }
}

/** Enregistreur : un `Contexte2D` qui consigne les appels (avec la transformation courante) au lieu de dessiner. */
export type Appel = { f: string; args: number[]; texte?: string; font?: string; align?: string; m: [number, number, number, number, number, number] };
export class EnregistreurCanvas implements Contexte2D {
  lineWidth = 1; strokeStyle = "#000"; fillStyle = "#000"; font = "10px sans-serif"; textAlign = "start"; textBaseline = "alphabetic";
  readonly appels: Appel[] = [];
  private m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  private pile: [number, number, number, number, number, number][] = [];
  private noter(f: string, args: number[], plus: Partial<Appel> = {}) { this.appels.push({ f, args, m: [...this.m], ...plus }); }
  save() { this.pile.push([...this.m]); }
  restore() { this.m = this.pile.pop() ?? [1, 0, 0, 1, 0, 0]; }
  translate(x: number, y: number) { const [a, b, c, d, e, f] = this.m; this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]; }
  rotate(t: number) { const [a, b, c, d, e, f] = this.m, co = Math.cos(t), si = Math.sin(t); this.m = [a * co + c * si, b * co + d * si, c * co - a * si, d * co - b * si, e, f]; }
  beginPath() { this.noter("beginPath", []); }
  moveTo(x: number, y: number) { this.noter("moveTo", [x, y]); }
  lineTo(x: number, y: number) { this.noter("lineTo", [x, y]); }
  arc(x: number, y: number, r: number, a0: number, a1: number, anti = false) { this.noter("arc", [x, y, r, a0, a1, anti ? 1 : 0]); }
  closePath() { this.noter("closePath", []); }
  stroke() { this.noter("stroke", []); }
  fillText(t: string, x: number, y: number) { this.noter("fillText", [x, y], { texte: t, font: this.font, align: this.textAlign }); }
}

// ——— Traits élémentaires (fidélité géométrique) ———

/** Trait élémentaire dans le repère de l'utilisateur SVG : segment, arc exact (centre, rayon, angles) ou texte. */
export type Trait =
  | { t: "segment"; x1: number; y1: number; x2: number; y2: number }
  | { t: "arc"; cx: number; cy: number; r: number; debut: number; balayage: number }
  | { t: "texte"; x: number; y: number; taille: number; rotation: number; ancre: string; contenu: string };

const DEUX_PI = 2 * Math.PI;
const norm = (a: number) => ((a % DEUX_PI) + DEUX_PI) % DEUX_PI;
/** Arc ramené au sens positif : départ normalisé, balayage dans ]0 ; 2π]. */
function arcPositif(cx: number, cy: number, r: number, a0: number, a1: number, positif: boolean, complet = false): Trait {
  if (complet) return { t: "arc", cx, cy, r, debut: 0, balayage: DEUX_PI };
  const [d, f] = positif ? [a0, a1] : [a1, a0];
  const b = norm(f - d);
  return { t: "arc", cx, cy, r, debut: norm(d), balayage: b === 0 ? DEUX_PI : b };
}
function segment(x1: number, y1: number, x2: number, y2: number): Trait {
  // Orientation canonique : un même segment se compare quel que soit son sens de parcours.
  return x1 < x2 || (x1 === x2 && y1 <= y2) ? { t: "segment", x1, y1, x2, y2 } : { t: "segment", x1: x2, y1: y2, x2: x1, y2: y1 };
}

/** Traits des primitives visibles de la scène SVG. */
export function traitsSvg(scene: SceneSvg): Trait[] {
  const out: Trait[] = [];
  for (const p of scene.primitives) {
    if (!p.visible) continue;
    switch (p.genre) {
      case "ligne": out.push(segment(p.x1, p.y1, p.x2, p.y2)); break;
      case "rect": { const q = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]] as const; q.forEach((a, i) => { const b = q[(i + 1) % 4]!; out.push(segment(a[0], a[1], b[0], b[1])); }); break; }
      case "cercle": out.push(arcPositif(p.cx, p.cy, p.r, 0, 0, true, true)); break;
      case "polygone": p.points.forEach((a, i) => { const b = p.points[(i + 1) % p.points.length]!; out.push(segment(a[0], a[1], b[0], b[1])); }); break;
      case "chemin": {
        let x = 0, y = 0, x0 = 0, y0 = 0;
        for (const c of p.commandes) {
          if (c.c === "M") { x = x0 = c.x; y = y0 = c.y; }
          else if (c.c === "L") { out.push(segment(x, y, c.x, c.y)); x = c.x; y = c.y; }
          else if (c.c === "A") { const a = arcCentre(x, y, c.r, c.grand, c.sens, c.x, c.y); out.push(a ? arcPositif(a.cx, a.cy, a.r, a.debut, a.fin, a.positif) : segment(x, y, c.x, c.y)); x = c.x; y = c.y; }
          else { if (x !== x0 || y !== y0) out.push(segment(x, y, x0, y0)); x = x0; y = y0; }
        }
        break;
      }
      case "texte": out.push({ t: "texte", x: p.x, y: p.y, taille: p.taille, rotation: p.rotation, ancre: p.ancre, contenu: p.contenu }); break;
    }
  }
  return out;
}

/**
 * Traits relus des appels Canvas enregistrés, ramenés dans le repère de l'utilisateur SVG (inverse du cadre). Reconstitue
 * ce que le contexte aurait tracé : segments des `lineTo`, arcs des `arc`, fermetures, textes (position, taille,
 * rotation lues de la transformation courante).
 */
export function traitsCanvas(appels: readonly Appel[], cadre: Cadre2D): Trait[] {
  const ux = (x: number) => (x - cadre.ox) / cadre.echelle, uy = (y: number) => (y - cadre.oy) / cadre.echelle;
  const out: Trait[] = [];
  let x = 0, y = 0, x0 = 0, y0 = 0, ouvert = false;
  const ANCRE: Record<string, string> = { left: "start", center: "middle", right: "end" };
  for (const a of appels) {
    switch (a.f) {
      case "beginPath": ouvert = false; break;
      case "moveTo": x = x0 = a.args[0]!; y = y0 = a.args[1]!; ouvert = true; break;
      case "lineTo": out.push(segment(ux(x), uy(y), ux(a.args[0]!), uy(a.args[1]!))); x = a.args[0]!; y = a.args[1]!; break;
      case "arc": {
        const [cx, cy, r, d, f, anti] = a.args as [number, number, number, number, number, number];
        const complet = Math.abs(f - d) >= DEUX_PI - 1e-12;
        const sx = cx + r * Math.cos(d), sy = cy + r * Math.sin(d);
        // Le contexte relie le point courant au départ de l'arc ; un départ confondu n'ajoute rien.
        if (ouvert && Math.hypot(sx - x, sy - y) > 1e-9 * Math.max(1, r)) out.push(segment(ux(x), uy(y), ux(sx), uy(sy)));
        out.push(arcPositif(ux(cx), uy(cy), r / cadre.echelle, d, f, anti === 0, complet));
        x = cx + r * Math.cos(f); y = cy + r * Math.sin(f);
        if (!ouvert) { x0 = sx; y0 = sy; ouvert = true; }
        break;
      }
      case "closePath": if (Math.hypot(x - x0, y - y0) > 1e-9) out.push(segment(ux(x), uy(y), ux(x0), uy(y0))); x = x0; y = y0; break;
      case "fillText": {
        const [m0, m1, , , e, f] = a.m;
        const taille = Number(/^([\d.e+-]+)px/.exec(a.font ?? "")?.[1] ?? Number.NaN) / cadre.echelle;
        const rot = (Math.atan2(m1, m0) * 180) / Math.PI;
        out.push({ t: "texte", x: ux(e + m0 * a.args[0]!), y: uy(f + m1 * a.args[0]!), taille, rotation: Math.abs(rot) < 1e-12 ? 0 : rot, ancre: ANCRE[a.align ?? "left"] ?? "start", contenu: a.texte ?? "" });
        break;
      }
    }
  }
  return out;
}

export interface ComparaisonTraits {
  /** Traits par type, de chaque côté. */
  reference: Record<Trait["t"], number>;
  compare: Record<Trait["t"], number>;
  /** Traits de la référence sans correspondant (à la tolérance de comparaison), et inversement. */
  manquants: number;
  enTrop: number;
  /** Plus grand écart de position (unités utilisateur SVG, mètres) entre traits appariés. */
  ecartMax: number;
}

const cleTri = (t: Trait): string => (t.t === "segment" ? `s${t.x1.toFixed(4)},${t.y1.toFixed(4)}` : t.t === "arc" ? `a${t.cx.toFixed(4)},${t.cy.toFixed(4)}` : `t${t.contenu}`);
function ecart(a: Trait, b: Trait): number {
  if (a.t !== b.t) return Infinity;
  if (a.t === "segment" && b.t === "segment") return Math.max(Math.abs(a.x1 - b.x1), Math.abs(a.y1 - b.y1), Math.abs(a.x2 - b.x2), Math.abs(a.y2 - b.y2));
  if (a.t === "arc" && b.t === "arc") {
    const da = Math.abs(norm(a.debut - b.debut + Math.PI) - Math.PI), db = Math.abs(a.balayage - b.balayage);
    return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy), Math.abs(a.r - b.r), (da + db) * Math.max(a.r, 1));
  }
  if (a.t === "texte" && b.t === "texte") return a.contenu !== b.contenu || a.ancre !== b.ancre ? Infinity : Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.taille - b.taille), Math.abs(norm(((a.rotation - b.rotation) * Math.PI) / 180 + Math.PI) - Math.PI) * a.taille);
  return Infinity;
}

/** Appariement des traits (même type, plus proche, à `tolerance` près) : écarts mesurés, rien n'est corrigé. */
export function comparerTraits(reference: readonly Trait[], compare: readonly Trait[], tolerance = 1e-6): ComparaisonTraits {
  const compte = (l: readonly Trait[]) => l.reduce((o, t) => ({ ...o, [t.t]: o[t.t] + 1 }), { segment: 0, arc: 0, texte: 0 } as Record<Trait["t"], number>);
  const restants = new Map<string, Trait[]>();
  for (const t of compare) { const k = `${t.t}|${cleTri(t)}`; (restants.get(k) ?? restants.set(k, []).get(k)!).push(t); }
  let manquants = 0, ecartMax = 0;
  const libres = new Set(compare);
  for (const r of reference) {
    let choisi: Trait | null = null, meilleur = Infinity;
    for (const c of restants.get(`${r.t}|${cleTri(r)}`) ?? []) { if (!libres.has(c)) continue; const e = ecart(r, c); if (e < meilleur) { meilleur = e; choisi = c; } }
    // Repli (arrondi de la clé à la frontière) : parcours de tous les restants du même type.
    if (!choisi || meilleur > tolerance) for (const c of libres) { if (c.t !== r.t) continue; const e = ecart(r, c); if (e < meilleur) { meilleur = e; choisi = c; } }
    if (choisi && meilleur <= tolerance) { libres.delete(choisi); ecartMax = Math.max(ecartMax, meilleur); } else manquants++;
  }
  return { reference: compte(reference), compare: compte(compare), manquants, enTrop: libres.size, ecartMax };
}

// ——— GPU (segments de droite) ———

/** Pas angulaire de découpe des arcs pour le moteur GPU (radians) : choix de la comparaison, déclaré, pas une tolérance métier. */
export const PAS_ARC_GPU = Math.PI / 32;

/**
 * Segments de droite des primitives visibles, en coordonnées de découpe WebGL (x, y dans [−1 ; 1], y montant), deux
 * sommets par segment. Les arcs sont découpés au pas `PAS_ARC_GPU` ; les textes ne sont pas tracés (comptés à part).
 */
export function segmentsGpu(scene: SceneSvg, largeur: number, hauteur: number): { sommets: Float32Array; segments: number; textesNonTraces: number } {
  const { echelle: s, ox, oy } = cadreViewBox(scene.viewBox, largeur, hauteur);
  const cx = (x: number) => ((ox + x * s) / largeur) * 2 - 1, cy = (y: number) => 1 - ((oy + y * s) / hauteur) * 2;
  const v: number[] = [];
  let textes = 0;
  for (const t of traitsSvg(scene)) {
    if (t.t === "segment") v.push(cx(t.x1), cy(t.y1), cx(t.x2), cy(t.y2));
    else if (t.t === "arc") {
      const n = Math.max(1, Math.ceil(t.balayage / PAS_ARC_GPU));
      for (let i = 0; i < n; i++) {
        const a = t.debut + (t.balayage * i) / n, b = t.debut + (t.balayage * (i + 1)) / n;
        v.push(cx(t.cx + t.r * Math.cos(a)), cy(t.cy + t.r * Math.sin(a)), cx(t.cx + t.r * Math.cos(b)), cy(t.cy + t.r * Math.sin(b)));
      }
    } else textes++;
  }
  return { sommets: new Float32Array(v), segments: v.length / 4, textesNonTraces: textes };
}

/** Statistiques d'une série de durées (rang le plus proche : valeurs effectivement mesurées). */
export function statistiquesDurees(v: readonly number[]): { n: number; min: number; p50: number; p95: number; max: number } | null {
  if (!v.length) return null;
  const t = [...v].sort((a, b) => a - b), q = (p: number) => t[Math.min(t.length - 1, Math.max(0, Math.ceil(p * t.length) - 1))]!;
  return { n: t.length, min: t[0]!, p50: q(0.5), p95: q(0.95), max: t[t.length - 1]! };
}
