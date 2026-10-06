/**
 * Import DXF 2D (lot 6) — pur : du texte DXF ASCII à un **fond de plan** (`reference-plan`, cahier §5.10) : le cadre
 * du dessin (rectangle englobant, fichier source) sur le calque « Référence DXF », et son contenu en esquisses et
 * textes sur un calque « DXF · <calque> » par calque du fichier, le tout dans un groupe — calé ensuite comme un seul
 * objet (déplacer, tourner, échelle) ; décision D-019.
 *
 * Entités lues : LINE, LWPOLYLINE (arrondis « bulge » discrétisés), POLYLINE / VERTEX / SEQEND (2D), CIRCLE, ARC, TEXT,
 * MTEXT (texte brut), ATTRIB ; INSERT (blocs décomposés : point de base, échelles, rotation, réseaux ; blocs imbriqués
 * jusqu'à 8 niveaux) ; HATCH (contours extérieurs en hachures, motif nommé) ; DIMENSION linéaires et alignées (cotes),
 * radiales et diamétrales (cotes linéaires dont la valeur est le rayon ou le diamètre), angulaires (arc et texte de
 * l'angle mesuré, D-031), d'ordonnée (ligne de rappel et texte de la valeur). Une XREF est résolue par un fichier
 * joint de même nom (D-036), sinon signalée. Les autres entités (splines, 3D…) sont comptées et signalées, jamais
 * devinées.
 *
 * Unités : `$INSUNITS` de l'en-tête ; quand il est absent ou « sans unité », l'unité est celle que l'utilisateur
 * choisit (`uniteSiAbsente`) et le rapport l'écrit comme une hypothèse. Repère (R5) : `local` (les coordonnées sont
 * celles du repère local du projet) ou `cadastral` (coordonnées dans le CRS de la parcelle, converties explicitement
 * par `local = cadastral − origineLocale`).
 */
import type { Commande } from "../commandes/index.js";
import type { ModeleAtelier } from "../modele.js";
import { m, pt, type Point2 } from "../unites.js";
import { pointsPolyligne } from "../geometrie.js";

export type UniteDxf = "mm" | "cm" | "m" | "in" | "ft";
const FACTEURS: Record<UniteDxf, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
const INSUNITS: Record<number, UniteDxf> = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };

export interface OptionsImportDxf {
  source: string;
  niveauId: string;
  repere: "local" | "cadastral";
  uniteSiAbsente: UniteDxf;
  prefixe?: string;
  tailleLot?: number;
  /**
   * Fichiers joints pour résoudre les références externes (XREF, D-036) : texte DXF par nom de fichier. Une XREF
   * « voisin.dwg » est résolue par un fichier joint de même nom sans extension (« voisin.dxf »).
   */
  xrefs?: Readonly<Record<string, string>>;
}

/** Nom d'appariement d'une XREF : nom de fichier sans dossier ni extension, en minuscules. */
export const cleXref = (chemin: string) => (chemin.split(/[\\/]/).pop() ?? chemin).replace(/\.[^.]*$/, "").trim().toLowerCase();

export interface RapportImportDxf {
  format: "DXF";
  unite: { valeur: UniteDxf; origine: "fichier" | "choix" };
  repere: "local" | "cadastral";
  entites: { type: string; lues: number; importees: number; remarque: string | null }[];
  calques: string[];
  remarques: string[];
}

interface Paire {
  code: number;
  valeur: string;
}

function paires(texte: string): Paire[] {
  const l = texte.replace(/\r\n?/g, "\n").split("\n");
  const out: Paire[] = [];
  for (let i = 0; i + 1 < l.length; i += 2) {
    const code = Number.parseInt(l[i]!.trim(), 10);
    if (!Number.isFinite(code)) throw new Error(`DXF illisible à la ligne ${i + 1} : code de groupe attendu (seul le DXF ASCII est lu).`);
    out.push({ code, valeur: l[i + 1]!.trimEnd() });
  }
  return out;
}

interface Entite {
  type: string;
  champs: Paire[];
}

interface Bloc {
  nom: string;
  base: { x: number; y: number };
  /** Bloc de référence externe (XREF) : son contenu est dans un autre fichier. */
  externe: boolean;
  chemin: string | null;
  entites: Entite[];
}

/** Sections HEADER, BLOCKS et ENTITIES, entités découpées sur le code 0. */
function lire(texte: string): { insunits: number | null; entites: Entite[]; blocs: Map<string, Bloc> } {
  const ps = paires(texte);
  let insunits: number | null = null;
  const entites: Entite[] = [];
  const blocs = new Map<string, Bloc>();
  let section: string | null = null;
  let courante: Entite | null = null;
  let entete: Entite | null = null;
  let bloc: Bloc | null = null;
  const fermer = () => {
    if (courante) (bloc ? bloc.entites : entites).push(courante);
    courante = null;
  };
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (p.code === 0 && p.valeur === "SECTION") {
      section = ps[i + 1]?.code === 2 ? ps[i + 1]!.valeur : null;
      i++;
      continue;
    }
    if (p.code === 0 && p.valeur === "ENDSEC") {
      fermer();
      section = null;
      bloc = null;
      continue;
    }
    if (section === "HEADER" && p.code === 9 && p.valeur === "$INSUNITS") {
      const v = ps[i + 1];
      if (v && v.code === 70) insunits = Number.parseInt(v.valeur, 10);
      continue;
    }
    if (section === "BLOCKS") {
      if (p.code === 0 && p.valeur === "BLOCK") {
        fermer();
        entete = { type: "BLOCK", champs: [] };
        continue;
      }
      if (entete && p.code !== 0) {
        entete.champs.push(p);
        continue;
      }
      if (entete && p.code === 0) {
        // Fin de l'en-tête du bloc : il est créé, ses entités suivent (un bloc peut être vide, XREF par exemple).
        const e: Entite = entete;
        const nom = e.champs.find((c) => c.code === 2)?.valeur ?? "";
        const f = (code: number) => Number.parseFloat(e.champs.find((c) => c.code === code)?.valeur ?? "0") || 0;
        const drapeaux = Number.parseInt(e.champs.find((c) => c.code === 70)?.valeur ?? "0", 10) || 0;
        bloc = { nom, base: { x: f(10), y: f(20) }, externe: (drapeaux & 4) !== 0, chemin: e.champs.find((c) => c.code === 1)?.valeur ?? null, entites: [] };
        if (nom) blocs.set(nom, bloc);
        entete = null;
      }
      if (p.code === 0 && p.valeur === "ENDBLK") {
        fermer();
        bloc = null;
        continue;
      }
      if (!bloc) continue;
      if (p.code === 0) {
        fermer();
        courante = { type: p.valeur, champs: [] };
      } else courante?.champs.push(p);
      continue;
    }
    if (section === "ENTITIES") {
      if (p.code === 0) {
        fermer();
        courante = { type: p.valeur, champs: [] };
      } else courante?.champs.push(p);
    }
  }
  fermer();
  return { insunits, entites, blocs };
}

/** Transformation affine 2D (unités du fichier) : x' = a x + c y + e ; y' = b x + d y + f. */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const IDENTITE: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const appliquerAffine = (m: Affine, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
const composer = (m: Affine, n: Affine): Affine => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f });
/** Échelle uniforme et sens conservé (similitude directe) : les cercles et arcs restent des cercles et arcs. */
function similitude(m: Affine): { echelle: number; rotation: number } | null {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const det = m.a * m.d - m.b * m.c;
  if (det <= 0 || Math.abs(sx - sy) > 1e-9 * Math.max(1, sx) || Math.abs(m.a * m.c + m.b * m.d) > 1e-9 * Math.max(1, sx * sy)) return null;
  return { echelle: sx, rotation: (Math.atan2(m.b, m.a) * 180) / Math.PI };
}

const num = (e: Entite, code: number, defaut: number | null = null): number | null => {
  const p = e.champs.find((c) => c.code === code);
  if (!p) return defaut;
  const v = Number.parseFloat(p.valeur);
  return Number.isFinite(v) ? v : defaut;
};
const txt = (e: Entite, code: number): string | null => e.champs.find((c) => c.code === code)?.valeur ?? null;

/** Points d'un arrondi DXF (bulge = tan(θ/4)) de a vers b, a exclu, b inclus. */
function arrondi(a: { x: number; y: number }, b: { x: number; y: number }, bulge: number): { x: number; y: number }[] {
  if (Math.abs(bulge) < 1e-9) return [b];
  const theta = 4 * Math.atan(bulge);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-12) return [b];
  const r = d / (2 * Math.sin(theta / 2));
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const h = r * Math.cos(theta / 2);
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const cx = mx - uy * h;
  const cy = my + ux * h;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const n = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
  const out: { x: number; y: number }[] = [];
  for (let k = 1; k <= n; k++) {
    const t = a0 + (theta * k) / n;
    out.push({ x: cx + Math.abs(r) * Math.cos(t), y: cy + Math.abs(r) * Math.sin(t) });
  }
  out[out.length - 1] = b;
  return out;
}

const nomCalque = (s: string | null) => (s && s.trim() ? s.trim() : "0");
const idSur = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "0";

export function commandesImportDxf(etat: ModeleAtelier, texte: string, options: OptionsImportDxf): { lots: { label: string; commands: Commande[] }[]; rapport: RapportImportDxf } {
  if (!etat.niveaux[options.niveauId]) throw new Error(`Niveau inconnu : ${options.niveauId}`);
  const { insunits, entites, blocs } = lire(texte);
  const prefixe = options.prefixe ?? "dxf";
  const remarques: string[] = [];
  const uniteFichier = insunits !== null ? INSUNITS[insunits] : undefined;
  const unite: RapportImportDxf["unite"] = uniteFichier ? { valeur: uniteFichier, origine: "fichier" } : { valeur: options.uniteSiAbsente, origine: "choix" };
  if (!uniteFichier) remarques.push(`Unité non déclarée par le fichier ($INSUNITS ${insunits ?? "absent"}) : ${unite.valeur} retenu par choix de l'utilisateur (hypothèse, à vérifier sur une cote connue).`);
  const f = FACTEURS[unite.valeur];
  const parcelle = etat.site.parcelle;
  if (options.repere === "cadastral" && !parcelle) throw new Error("Repère cadastral demandé mais le projet n'a pas de parcelle : importer en repère local.");
  const ox = options.repere === "cadastral" ? parcelle!.origineLocale.x : 0;
  const oy = options.repere === "cadastral" ? parcelle!.origineLocale.y : 0;
  remarques.push(options.repere === "cadastral" ? `Repère : coordonnées lues dans ${parcelle!.crs}, converties explicitement en repère local (− ${ox} ; − ${oy}).` : "Repère : coordonnées lues comme celles du repère local du projet.");
  const P0 = (x: number, y: number): Point2 => pt(Math.round((x * f - ox) * 1e6) / 1e6, Math.round((y * f - oy) * 1e6) / 1e6);

  const comptes = new Map<string, { lues: number; importees: number; remarque: string | null }>();
  const compter = (type: string, ok: boolean, remarque: string | null = null) => {
    const c = comptes.get(type) ?? { lues: 0, importees: 0, remarque };
    c.lues++;
    if (ok) c.importees++;
    // Remarques distinctes cumulées (trois au plus) : un type d'entité peut être repris de plusieurs façons.
    if (remarque && !c.remarque) c.remarque = remarque;
    else if (remarque && c.remarque && !c.remarque.includes(remarque) && c.remarque.split(" | ").length < 3) c.remarque = `${c.remarque} | ${remarque}`;
    comptes.set(type, c);
  };
  const calques = new Map<string, string>();
  const commandes: Commande[] = [];
  const calqueNomme = (nom: string) => {
    let id = calques.get(nom);
    if (!id) {
      id = `${prefixe}-calque-${idSur(nom)}`;
      let k = 2;
      while ([...calques.values()].includes(id)) id = `${prefixe}-calque-${idSur(nom)}-${k++}`;
      calques.set(nom, id);
      if (!etat.calques[id]) commandes.push({ type: "calque.creer", params: { id, nom: `DXF · ${nom}` } });
    }
    return id;
  };
  let n = 0;
  const nouvelId = () => `${prefixe}-${idSur(options.source)}-${(++n).toString(36)}`;
  if (etat.objets[`${prefixe}-${idSur(options.source)}-1`]) throw new Error(`Ce fichier semble déjà importé (identifiants ${prefixe}-${idSur(options.source)}-* présents) : renommer le fichier ou supprimer l'import précédent.`);
  const crees: string[] = [];
  const cadre = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const etendre = (p: { x: number; y: number }, r = 0) => {
    cadre.x0 = Math.min(cadre.x0, p.x - r);
    cadre.y0 = Math.min(cadre.y0, p.y - r);
    cadre.x1 = Math.max(cadre.x1, p.x + r);
    cadre.y1 = Math.max(cadre.y1, p.y + r);
  };
  const poser = (type: string, params: Record<string, unknown>) => {
    const id = nouvelId();
    commandes.push({ type, params: { id, niveauId: options.niveauId, ...params } });
    crees.push(id);
    const renflements = params["renflements"] as number[] | undefined;
    for (const q of renflements ? pointsPolyligne(params["points"] as Point2[], params["ferme"] === true, renflements) : ((params["points"] as Point2[] | undefined) ?? [])) etendre(q);
    if (params["centre"]) etendre(params["centre"] as Point2, (params["rayon"] as { value: number }).value);
    if (params["position"]) etendre(params["position"] as Point2);
  };
  const distincts = (pts: Point2[]) => pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 1e-6);

  let decomposes = 0;
  // Fichiers joints (XREF) : lus à la demande, une fois.
  const joints = new Map<string, { source: string; texte: string }>();
  for (const [nom, t] of Object.entries(options.xrefs ?? {})) joints.set(cleXref(nom), { source: nom, texte: t });
  const xrefsLues = new Map<string, ReturnType<typeof lire>>();
  /**
   * Une liste d'entités (le dessin, le contenu d'un bloc ou d'une XREF résolue) sous une transformation ; `table` :
   * les blocs du fichier d'où viennent ces entités ; `prefixeCalque` : calques d'une XREF nommés « xref|calque ».
   */
  const importer = (liste: Entite[], M: Affine, chemin: string[], calqueParent: string | null, table: Map<string, Bloc> = blocs, prefixeCalque = ""): void => {
    const P = (x: number, y: number): Point2 => {
      const q = appliquerAffine(M, x, y);
      return P0(q.x, q.y);
    };
    const sim = similitude(M);
    // Une entité de bloc sur le calque « 0 » prend le calque de l'insertion (convention DXF).
    const nomDe = (x: Entite) => {
      const nom = nomCalque(txt(x, 8));
      return nom === "0" && calqueParent ? calqueParent : `${prefixeCalque}${nom}`;
    };
    const calqueDe = (x: Entite) => calqueNomme(nomDe(x));
    /**
     * Polyligne à arrondis (D-063) : gardée avec ses segments en arc (renflements) quand la transformation est une
     * similitude directe et que chaque arrondi fait au plus un demi-cercle ; sinon discrétisée (comportement antérieur).
     */
    const poserAvecArcs = (sommets: { x: number; y: number; bulge: number }[], ferme: boolean, e: Entite, type: string): boolean => {
      if (!sim || !sommets.some((q) => Math.abs(q.bulge) > 1e-9) || !sommets.every((q) => Math.abs(q.bulge) <= 1)) return false;
      const pts = sommets.map((q) => P(q.x, q.y));
      const f = ferme && pts.length >= 3;
      const n = pts.length - 1 + (f ? 1 : 0);
      for (let k = 0; k < n; k++) if (Math.hypot(pts[(k + 1) % pts.length]!.x - pts[k]!.x, pts[(k + 1) % pts.length]!.y - pts[k]!.y) <= 1e-6) return false;
      poser("esquisse.polyligne", { points: pts, ferme: f, renflements: sommets.slice(0, n).map((q) => (Math.abs(q.bulge) <= 1e-9 ? 0 : q.bulge)), calqueId: calqueDe(e) });
      compter(type, true, "arrondis (bulge) gardés en segments en arc");
      return true;
    };
    /** Cercle ou arc sous une transformation quelconque : polyligne (≤ 11,25° par segment). */
    const arcEnPoints = (cx: number, cy: number, r: number, a0: number, a1: number) => {
      let fin = a1;
      while (fin <= a0) fin += 360;
      const n = Math.max(4, Math.ceil((fin - a0) / 11.25));
      const pts: Point2[] = [];
      for (let k = 0; k <= n; k++) {
        const t = ((a0 + ((fin - a0) * k) / n) * Math.PI) / 180;
        pts.push(P(cx + r * Math.cos(t), cy + r * Math.sin(t)));
      }
      return pts;
    };
    for (let i = 0; i < liste.length; i++) {
      const e = liste[i]!;
      switch (e.type) {
        case "LINE": {
          const a = P(num(e, 10, 0)!, num(e, 20, 0)!);
          const b = P(num(e, 11, 0)!, num(e, 21, 0)!);
          if (Math.hypot(b.x - a.x, b.y - a.y) <= 1e-6) {
            compter("LINE", false, "segments de longueur nulle ignorés");
            break;
          }
          poser("esquisse.ligne", { points: [a, b], calqueId: calqueDe(e) });
          compter("LINE", true);
          break;
        }
        case "LWPOLYLINE": {
          const ferme = ((num(e, 70, 0) ?? 0) & 1) === 1;
          const sommets: { x: number; y: number; bulge: number }[] = [];
          for (const c of e.champs) {
            if (c.code === 10) sommets.push({ x: Number.parseFloat(c.valeur), y: 0, bulge: 0 });
            else if (c.code === 20 && sommets.length) sommets[sommets.length - 1]!.y = Number.parseFloat(c.valeur);
            else if (c.code === 42 && sommets.length) sommets[sommets.length - 1]!.bulge = Number.parseFloat(c.valeur);
          }
          if (poserAvecArcs(sommets, ferme, e, "LWPOLYLINE")) break;
          const brut: { x: number; y: number }[] = sommets.length ? [sommets[0]!] : [];
          let arrondis = false;
          for (let k = 0; k + 1 < sommets.length + (ferme ? 1 : 0); k++) {
            const a = sommets[k]!;
            const b = sommets[(k + 1) % sommets.length]!;
            if (Math.abs(a.bulge) > 1e-9) arrondis = true;
            brut.push(...arrondi(a, b, a.bulge));
          }
          if (ferme && brut.length > 1) brut.pop();
          const pts = distincts(brut.map((p) => P(p.x, p.y)));
          if (pts.length < 2) {
            compter("LWPOLYLINE", false, "polylignes de moins de deux sommets ignorées");
            break;
          }
          poser(ferme && pts.length >= 3 ? "esquisse.polygone" : "esquisse.polyligne", { points: pts, ferme: ferme && pts.length >= 3, calqueId: calqueDe(e) });
          compter("LWPOLYLINE", true, arrondis ? "arrondis (bulge) discrétisés en segments (≤ 11,25° par segment)" : null);
          break;
        }
        case "POLYLINE": {
          const ferme = ((num(e, 70, 0) ?? 0) & 1) === 1;
          const sommets: { x: number; y: number; bulge: number }[] = [];
          let j = i + 1;
          for (; j < liste.length && liste[j]!.type === "VERTEX"; j++) sommets.push({ x: num(liste[j]!, 10, 0)!, y: num(liste[j]!, 20, 0)!, bulge: num(liste[j]!, 42, 0)! });
          if (liste[j]?.type === "SEQEND") j++;
          i = j - 1;
          if ((num(e, 70, 0)! & (8 | 16 | 64)) !== 0) {
            compter("POLYLINE", false, "polylignes 3D et maillages ignorés (import 2D)");
            break;
          }
          if (poserAvecArcs(sommets, ferme, e, "POLYLINE")) break;
          const brut: { x: number; y: number }[] = sommets.length ? [sommets[0]!] : [];
          for (let k = 0; k + 1 < sommets.length + (ferme ? 1 : 0); k++) brut.push(...arrondi(sommets[k]!, sommets[(k + 1) % sommets.length]!, sommets[k]!.bulge));
          if (ferme && brut.length > 1) brut.pop();
          const pts = distincts(brut.map((p) => P(p.x, p.y)));
          if (pts.length < 2) {
            compter("POLYLINE", false, "polylignes de moins de deux sommets ignorées");
            break;
          }
          poser(ferme && pts.length >= 3 ? "esquisse.polygone" : "esquisse.polyligne", { points: pts, ferme: ferme && pts.length >= 3, calqueId: calqueDe(e) });
          compter("POLYLINE", true);
          break;
        }
        case "CIRCLE":
        case "ARC": {
          const rf = num(e, 40, 0) ?? 0;
          if (!(rf * f > 1e-6)) {
            compter(e.type, false, "rayon nul ignoré");
            break;
          }
          const cx = num(e, 10, 0)!;
          const cy = num(e, 20, 0)!;
          if (!sim) {
            // Bloc inséré avec des échelles inégales ou en miroir : la courbe est reprise point par point.
            const pts = e.type === "CIRCLE" ? arcEnPoints(cx, cy, rf, 0, 360).slice(0, -1) : arcEnPoints(cx, cy, rf, num(e, 50, 0)!, num(e, 51, 360)!);
            poser(e.type === "CIRCLE" ? "esquisse.polygone" : "esquisse.polyligne", { points: pts, ferme: e.type === "CIRCLE", calqueId: calqueDe(e) });
            compter(e.type, true, "dans un bloc à échelles inégales ou en miroir : discrétisé en segments");
            break;
          }
          const r = rf * f * sim.echelle;
          const centre = P(cx, cy);
          if (e.type === "CIRCLE") poser("esquisse.cercle", { points: [], centre, rayon: m(Math.round(r * 1e6) / 1e6), calqueId: calqueDe(e) });
          else poser("esquisse.arc", { points: [], centre, rayon: m(Math.round(r * 1e6) / 1e6), angleDebut: { value: Math.round((num(e, 50, 0)! + sim.rotation) * 1e6) / 1e6, unit: "deg" }, angleFin: { value: Math.round((num(e, 51, 360)! + sim.rotation) * 1e6) / 1e6, unit: "deg" }, calqueId: calqueDe(e) });
          compter(e.type, true);
          break;
        }
        case "ELLIPSE": {
          // Ellipse (D-046) : centre (10), extrémité du grand axe relative au centre (11), rapport b / a (40),
          // paramètres de début et de fin (41, 42, radians). Complète et sous une similitude : ellipse ; sinon points.
          const cx = num(e, 10, 0)!;
          const cy = num(e, 20, 0)!;
          const mx = num(e, 11, 0)!;
          const my = num(e, 21, 0)!;
          const ratio = num(e, 40, 1)!;
          const t0 = num(e, 41, 0)!;
          const t1 = num(e, 42, 2 * Math.PI)!;
          const a = Math.hypot(mx, my);
          if (!(a * f > 1e-6) || !(ratio > 0)) {
            compter("ELLIPSE", false, "ellipses dégénérées ignorées");
            break;
          }
          const complete = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6 || Math.abs(t1 - t0) < 1e-9;
          if (complete && sim) {
            const rot = (Math.atan2(my, mx) * 180) / Math.PI + sim.rotation;
            const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
            poser("esquisse.ellipse", { points: [], centre: P(cx, cy), rayon: m(r6(a * f * sim.echelle)), rayonB: m(r6(a * ratio * f * sim.echelle)), rotation: { value: r6(rot), unit: "deg" }, calqueId: calqueDe(e) });
            compter("ELLIPSE", true);
            break;
          }
          let fin = t1;
          while (fin <= t0) fin += 2 * Math.PI;
          const n = Math.max(8, Math.ceil(((fin - t0) * 180) / Math.PI / 5.625));
          const ux = mx / a;
          const uy = my / a;
          const pts: Point2[] = [];
          for (let k = 0; k <= (complete ? n - 1 : n); k++) {
            const t = t0 + ((fin - t0) * k) / n;
            const x = a * Math.cos(t);
            const y = a * ratio * Math.sin(t);
            pts.push(P(cx + x * ux - y * uy, cy + x * uy + y * ux));
          }
          poser(complete ? "esquisse.polygone" : "esquisse.polyligne", { points: pts, ferme: complete, calqueId: calqueDe(e) });
          compter("ELLIPSE", true, complete ? "ellipse dans un bloc à échelles inégales ou en miroir : discrétisée en segments" : "arcs d'ellipse discrétisés en segments (≤ 5,6° de paramètre)");
          break;
        }
        case "TEXT":
        case "ATTRIB":
        case "MTEXT": {
          const brut = e.type === "MTEXT" ? e.champs.filter((c) => c.code === 3 || c.code === 1).map((c) => c.valeur).join("") : (txt(e, 1) ?? "");
          const t = brut.replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").replace(/%%[cC]/g, "⌀").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").trim();
          if (!t) {
            compter(e.type, false, "textes vides ignorés");
            break;
          }
          poser("texte.creer", { position: P(num(e, 10, 0)!, num(e, 20, 0)!), texte: t.slice(0, 500), calqueId: calqueDe(e) });
          compter(e.type, true, "position et contenu repris ; hauteur, rotation et style non portés");
          break;
        }
        case "INSERT": {
          const nom = txt(e, 2) ?? "";
          const b = table.get(nom);
          if (!b) {
            const message = `Bloc « ${nom} » inséré mais absent de la section BLOCKS : non décomposé.`;
            if (!remarques.includes(message)) remarques.push(message);
            compter("INSERT", false, "blocs absents du fichier : voir les remarques");
            break;
          }
          const joint = b.externe ? joints.get(cleXref(b.chemin ?? nom)) : undefined;
          if (b.externe && !joint) {
            const message = `Référence externe XREF « ${b.chemin ?? nom} » : fichier non fourni avec le dessin, non résolue (joindre « ${cleXref(b.chemin ?? nom)}.dxf » pour la résoudre).`;
            if (!remarques.includes(message)) remarques.push(message);
            compter("INSERT", false, "références externes (XREF) non résolues : voir les remarques");
            break;
          }
          if (chemin.includes(nom) || chemin.length >= 8) {
            compter("INSERT", false, "blocs imbriqués au-delà de 8 niveaux, ou récursifs : non décomposés");
            break;
          }
          // XREF résolue : le contenu du fichier joint, converti de son unité vers celle du dessin hôte.
          let contenu = b.entites;
          let tableContenu = table;
          let k = 1;
          let prefixeContenu = prefixeCalque;
          if (joint) {
            const cle = cleXref(b.chemin ?? nom);
            let lu = xrefsLues.get(cle);
            if (!lu) {
              try {
                lu = lire(joint.texte);
              } catch (err) {
                const message = `Référence externe XREF « ${b.chemin ?? nom} » : fichier joint « ${joint.source} » illisible (${err instanceof Error ? err.message : String(err)}).`;
                if (!remarques.includes(message)) remarques.push(message);
                compter("INSERT", false, "références externes (XREF) non résolues : voir les remarques");
                break;
              }
              xrefsLues.set(cle, lu);
              const uX = lu.insunits !== null ? INSUNITS[lu.insunits] : undefined;
              remarques.push(uX ? `Référence externe XREF « ${b.chemin ?? nom} » résolue par le fichier joint « ${joint.source} » (unité ${uX}, convertie vers ${unite.valeur}).` : `Référence externe XREF « ${b.chemin ?? nom} » résolue par le fichier joint « ${joint.source} » : unité non déclarée, celle du dessin hôte (${unite.valeur}) est retenue (hypothèse, à vérifier).`);
            }
            const uX = lu.insunits !== null ? INSUNITS[lu.insunits] : undefined;
            k = uX ? FACTEURS[uX] / f : 1;
            contenu = lu.entites;
            tableContenu = lu.blocs;
            prefixeContenu = `${cleXref(b.chemin ?? nom)}|`;
          }
          const sx = num(e, 41, 1)! * k;
          const sy = num(e, 42, 1)! * k;
          const rot = ((num(e, 50, 0) ?? 0) * Math.PI) / 180;
          const colonnes = Math.max(1, Math.min(100, num(e, 70, 1)!));
          const rangees = Math.max(1, Math.min(100, num(e, 71, 1)!));
          const dc = num(e, 44, 0)!;
          const dr = num(e, 45, 0)!;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          for (let r = 0; r < rangees; r++) {
            for (let c = 0; c < colonnes; c++) {
              // Repère du bloc → repère d'insertion : retrait du point de base, échelles, rotation, translation (+ pas du réseau, dans le repère tourné).
              const ix = num(e, 10, 0)! + cos * c * dc - sin * r * dr;
              const iy = num(e, 20, 0)! + sin * c * dc + cos * r * dr;
              const local: Affine = { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: ix - (cos * sx * b.base.x - sin * sy * b.base.y), f: iy - (sin * sx * b.base.x + cos * sy * b.base.y) };
              importer(contenu, composer(M, local), [...chemin, nom], joint ? null : nomDe(e), tableContenu, prefixeContenu);
            }
          }
          decomposes += colonnes * rangees;
          compter("INSERT", true, joint ? "références externes (XREF) résolues par les fichiers joints, décomposées" : "bloc décomposé en esquisses et textes (point de base, échelles, rotation, réseau)");
          break;
        }
        case "HATCH": {
          // Contours : chemins polylignes (sommets, arrondis) ou arêtes (segments, arcs) ; le motif est porté par son nom.
          const champs = e.champs;
          const motif = (txt(e, 2) ?? "").trim() || null;
          const plein = (num(e, 70, 0) ?? 0) === 1;
          // Dégradé (D-120) : drapeau 450, angle 460 (radians), couleurs vraies 421 ramenées à leur gris (luminance) ;
          // sans deux couleurs lisibles, la hachure reste pleine (rien d'inventé).
          const couleurs = (num(e, 450, 0) ?? 0) === 1 ? champsDegrade(e.champs) : [];
          const degrade = couleurs.length >= 2 ? { de: couleurs[0]!, a: couleurs[1]!, angle: { value: Math.round((((num(e, 460, 0) ?? 0) * 180) / Math.PI) * 1e6) / 1e6, unit: "deg" } } : null;
          const boucles: { x: number; y: number }[][] = [];
          let k = champs.findIndex((c) => c.code === 91);
          const nb = k >= 0 ? Number.parseInt(champs[k]!.valeur, 10) : 0;
          let nonLus = 0;
          k++;
          for (let b = 0; b < nb && k < champs.length; b++) {
            while (k < champs.length && champs[k]!.code !== 92) k++;
            if (k >= champs.length) break;
            const type = Number.parseInt(champs[k]!.valeur, 10);
            k++;
            const pts: { x: number; y: number }[] = [];
            const val = (code: number) => {
              while (k < champs.length && champs[k]!.code !== code) k++;
              return k < champs.length ? Number.parseFloat(champs[k++]!.valeur) : 0;
            };
            if (type & 2) {
              const avecArrondis = val(72) === 1;
              val(73);
              const n = val(93);
              const sommets: { x: number; y: number; bulge: number }[] = [];
              for (let v = 0; v < n; v++) sommets.push({ x: val(10), y: val(20), bulge: avecArrondis ? val(42) : 0 });
              if (sommets.length) pts.push(sommets[0]!);
              for (let v = 0; v < sommets.length; v++) pts.push(...arrondi(sommets[v]!, sommets[(v + 1) % sommets.length]!, sommets[v]!.bulge));
              pts.pop();
            } else {
              const n = val(93);
              for (let a = 0; a < n; a++) {
                const t = val(72);
                if (t === 1) {
                  const p0 = { x: val(10), y: val(20) };
                  const p1 = { x: val(11), y: val(21) };
                  if (!pts.length) pts.push(p0);
                  pts.push(p1);
                } else if (t === 2) {
                  const cx = val(10);
                  const cy = val(20);
                  const r = val(40);
                  let a0 = val(50);
                  let a1 = val(51);
                  const direct = val(73) === 1;
                  if (!direct) [a0, a1] = [360 - a0, 360 - a1];
                  let fin = a1;
                  while (fin <= a0) fin += 360;
                  const nseg = Math.max(2, Math.ceil((fin - a0) / 11.25));
                  for (let q = 0; q <= nseg; q++) {
                    const ang = ((a0 + ((fin - a0) * q) / nseg) * Math.PI) / 180;
                    const pnt = { x: cx + r * Math.cos(ang), y: cy + r * (direct ? 1 : -1) * Math.sin(ang) };
                    if (q > 0 || !pts.length) pts.push(pnt);
                  }
                } else nonLus++;
              }
            }
            if (pts.length >= 3) boucles.push(pts);
          }
          if (!boucles.length) {
            compter("HATCH", false, "hachures sans contour lisible ignorées");
            break;
          }
          // Contours extérieurs seulement : un contour contenu dans un autre est un îlot (non porté par la hachure).
          const contient = (poly: { x: number; y: number }[], q: { x: number; y: number }) => {
            let dedans = false;
            for (let u = 0, v = poly.length - 1; u < poly.length; v = u++) {
              const A = poly[u]!;
              const B = poly[v]!;
              if (A.y > q.y !== B.y > q.y && q.x < ((B.x - A.x) * (q.y - A.y)) / (B.y - A.y) + A.x) dedans = !dedans;
            }
            return dedans;
          };
          const exterieurs = boucles.filter((bq, u) => !boucles.some((o, v) => v !== u && contient(o, bq[0]!)));
          for (const bq of exterieurs) {
            const pts = distincts(bq.map((q) => P(q.x, q.y)));
            if (pts.length >= 3) poser("esquisse.hachure", { points: pts, ferme: true, motif: plein ? "plein" : motif, calqueId: calqueDe(e), ...(degrade ? { degrade } : {}) });
          }
          const ilots = boucles.length - exterieurs.length;
          compter("HATCH", true, `contour extérieur en hachure, ${degrade ? "dégradé" : "motif nommé"}${ilots ? ` ; ${ilots} îlot(s) non porté(s)` : ""}${nonLus ? ` ; ${nonLus} arête(s) elliptique(s) ou spline ignorée(s)` : ""}`);
          break;
        }
        case "DIMENSION": {
          const type = (num(e, 70, 0) ?? 0) & 7;
          const texteImpose = (txt(e, 1) ?? "").trim();
          if (type === 6) {
            // Ordonnée (10 = origine, 13 = point repéré, 14 = fin de la ligne de rappel ; bit 64 : abscisse, sinon
            // ordonnée) : reprise en ligne de rappel et texte de la valeur mesurée sur le fichier (m, non associative).
            const origine = { x: num(e, 10, 0)!, y: num(e, 20, 0)! };
            const repere = { x: num(e, 13, 0)!, y: num(e, 23, 0)! };
            const fin = { x: num(e, 14, 0)!, y: num(e, 24, 0)! };
            const enX = ((num(e, 70, 0) ?? 0) & 64) === 64;
            const valeur = Math.round((enX ? repere.x - origine.x : repere.y - origine.y) * f * 1000) / 1000;
            const A = P(repere.x, repere.y);
            const B = P(fin.x, fin.y);
            if (Math.hypot(B.x - A.x, B.y - A.y) > 1e-6) poser("esquisse.ligne", { points: [A, B], calqueId: calqueDe(e) });
            poser("texte.creer", { position: B, texte: `${enX ? "x" : "y"} = ${valeur.toFixed(3).replace(".", ",")} m`, calqueId: calqueDe(e) });
            const r = "cotes d'ordonnée reprises en ligne de rappel et texte de la valeur mesurée sur le fichier (repère de la cote, non associatives)";
            compter("DIMENSION", true, texteImpose && texteImpose !== "<>" ? `${r} ; texte imposé « ${texteImpose.slice(0, 40)} » non repris` : r);
            break;
          }
          if (type === 3 || type === 4) {
            // Radiale (10 = centre, 15 = point de la courbe) ou diamétrale (15 et 10 = points opposés) : reprise comme
            // cote linéaire entre ces deux points, dont la valeur recalculée est le rayon ou le diamètre.
            const A = type === 4 ? P(num(e, 10, 0)!, num(e, 20, 0)!) : P(num(e, 15, 0)!, num(e, 25, 0)!);
            const B = type === 4 ? P(num(e, 15, 0)!, num(e, 25, 0)!) : P(num(e, 10, 0)!, num(e, 20, 0)!);
            if (Math.hypot(B.x - A.x, B.y - A.y) <= 1e-6) {
              compter("DIMENSION", false, "cotes de longueur nulle ignorées");
              break;
            }
            const id = nouvelId();
            commandes.push({ type: "cotation.creer", params: { id, niveauId: options.niveauId, a: A, b: B, decalage: m(0), calqueId: calqueDe(e) } });
            crees.push(id);
            etendre(A);
            etendre(B);
            const r = "cotes radiales et diamétrales reprises en cotes linéaires (centre → courbe, ou d'un point à l'opposé : la valeur est le rayon ou le diamètre ; préfixe R / ⌀ non porté, non associatives)";
            compter("DIMENSION", true, texteImpose && texteImpose !== "<>" ? `${r} ; texte imposé « ${texteImpose.slice(0, 40)} » non repris` : r);
            break;
          }
          if (type === 2 || type === 5) {
            // Angulaire : deux droites (13-14 et 15-10, type 2) ou trois points (sommet 15, côtés 13 et 14, type 5) ; l'arc
            // de cote passe par 16. Reprise en arc d'esquisse et texte de la valeur mesurée sur la géométrie du fichier.
            const p = (cx: number, cy: number) => ({ x: num(e, cx, 0)!, y: num(e, cy, 0)! });
            const arcPt = p(16, 26);
            let sommet: { x: number; y: number } | null;
            let d1: { x: number; y: number };
            let d2: { x: number; y: number };
            if (type === 5) {
              sommet = p(15, 25);
              const q1 = p(13, 23);
              const q2 = p(14, 24);
              d1 = { x: q1.x - sommet.x, y: q1.y - sommet.y };
              d2 = { x: q2.x - sommet.x, y: q2.y - sommet.y };
            } else {
              const a1 = p(13, 23);
              const b1 = p(14, 24);
              const a2 = p(15, 25);
              const b2 = p(10, 20);
              d1 = { x: b1.x - a1.x, y: b1.y - a1.y };
              d2 = { x: b2.x - a2.x, y: b2.y - a2.y };
              const det = d1.x * d2.y - d1.y * d2.x;
              if (Math.abs(det) < 1e-12) sommet = null;
              else {
                const t = ((a2.x - a1.x) * d2.y - (a2.y - a1.y) * d2.x) / det;
                sommet = { x: a1.x + d1.x * t, y: a1.y + d1.y * t };
                // Côtés : les demi-droites dont le secteur contient le point de l'arc.
                const w = { x: arcPt.x - sommet.x, y: arcPt.y - sommet.y };
                const al = (w.x * d2.y - w.y * d2.x) / det;
                const be = (d1.x * w.y - d1.y * w.x) / det;
                if (al < 0) d1 = { x: -d1.x, y: -d1.y };
                if (be < 0) d2 = { x: -d2.x, y: -d2.y };
              }
            }
            const rayon = sommet ? Math.hypot(arcPt.x - sommet.x, arcPt.y - sommet.y) : 0;
            if (!sommet || Math.hypot(d1.x, d1.y) < 1e-9 || Math.hypot(d2.x, d2.y) < 1e-9 || !(rayon * f > 1e-6)) {
              compter("DIMENSION", false, "cotes angulaires sans géométrie lisible (côtés parallèles ou nuls) ignorées");
              break;
            }
            const deg = (v: { x: number; y: number }) => ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
            let a0 = deg(d1);
            let ouverture = (deg(d2) - a0 + 360) % 360;
            const aP = (deg({ x: arcPt.x - sommet.x, y: arcPt.y - sommet.y }) - a0 + 360) % 360;
            if (aP > ouverture + 1e-9) {
              // Le point de l'arc est dans l'autre secteur : l'arc va de d2 à d1.
              a0 = deg(d2);
              ouverture = 360 - ouverture;
            }
            const valeur = Math.round(ouverture * 10) / 10;
            if (sim) {
              poser("esquisse.arc", { points: [], centre: P(sommet.x, sommet.y), rayon: m(Math.round(rayon * f * sim.echelle * 1e6) / 1e6), angleDebut: { value: Math.round((a0 + sim.rotation) * 1e6) / 1e6, unit: "deg" }, angleFin: { value: Math.round((a0 + ouverture + sim.rotation) * 1e6) / 1e6, unit: "deg" }, calqueId: calqueDe(e) });
            } else poser("esquisse.polyligne", { points: arcEnPoints(sommet.x, sommet.y, rayon, a0, a0 + ouverture), ferme: false, calqueId: calqueDe(e) });
            const mi = ((a0 + ouverture / 2) * Math.PI) / 180;
            const posTexte = e.champs.some((c) => c.code === 11) ? p(11, 21) : { x: sommet.x + rayon * Math.cos(mi), y: sommet.y + rayon * Math.sin(mi) };
            poser("texte.creer", { position: P(posTexte.x, posTexte.y), texte: `${valeur.toFixed(1).replace(".", ",")}°`, calqueId: calqueDe(e) });
            const r = "cotes angulaires reprises en arc d'esquisse et texte de l'angle mesuré sur la géométrie du fichier (non associatives)";
            compter("DIMENSION", true, texteImpose && texteImpose !== "<>" ? `${r} ; texte imposé « ${texteImpose.slice(0, 40)} » non repris` : r);
            break;
          }
          if (type !== 0 && type !== 1) {
            compter("DIMENSION", false, "type de cote inconnu, non importé");
            break;
          }
          const a = { x: num(e, 13, 0)!, y: num(e, 23, 0)! };
          let b = { x: num(e, 14, 0)!, y: num(e, 24, 0)! };
          const ligne = { x: num(e, 10, 0)!, y: num(e, 20, 0)! };
          let remarque = "cotes linéaires et alignées reprises (valeur recalculée par l'Atelier, non associatives)";
          if (type === 0) {
            // Cote orientée : la mesure est la projection sur sa direction ; la cote est posée sur cette direction.
            const ang = ((num(e, 50, 0) ?? 0) * Math.PI) / 180;
            const u = { x: Math.cos(ang), y: Math.sin(ang) };
            const l = (b.x - a.x) * u.x + (b.y - a.y) * u.y;
            b = { x: a.x + u.x * l, y: a.y + u.y * l };
            remarque = "cotes orientées reprises sur leur direction (valeur conservée), linéaires et alignées ; non associatives";
          }
          const A = P(a.x, a.y);
          const B = P(b.x, b.y);
          const L = Math.hypot(B.x - A.x, B.y - A.y);
          if (L <= 1e-6) {
            compter("DIMENSION", false, "cotes de longueur nulle ignorées");
            break;
          }
          const Lg = P(ligne.x, ligne.y);
          const decalage = ((-(B.y - A.y) / L) * (Lg.x - A.x) + ((B.x - A.x) / L) * (Lg.y - A.y));
          const id = nouvelId();
          commandes.push({ type: "cotation.creer", params: { id, niveauId: options.niveauId, a: A, b: B, decalage: m(Math.round(decalage * 1e6) / 1e6), calqueId: calqueDe(e) } });
          crees.push(id);
          etendre(A);
          etendre(B);
          const texte = (txt(e, 1) ?? "").trim();
          compter("DIMENSION", true, texte && texte !== "<>" ? `${remarque} ; texte imposé « ${texte.slice(0, 40)} » non repris` : remarque);
          break;
        }
        case "ATTDEF":
          compter("ATTDEF", false, "définitions d'attributs de bloc : seules les valeurs (ATTRIB) sont reprises");
          break;
        case "VERTEX":
        case "SEQEND":
          break;
        default:
          compter(e.type, false, "entité hors du sous-ensemble 2D lu");
      }
    }
  };
  importer(entites, IDENTITE, [], null);
  if (decomposes) remarques.push(`${decomposes} insertion(s) de bloc décomposée(s) en esquisses et textes (le bloc lui-même n'est pas recréé).`);

  // Fond de plan : cadre englobant du dessin (jamais agrandi ni deviné ; un dessin sans surface n'a pas de cadre).
  if (crees.length && cadre.x1 - cadre.x0 > 1e-6 && cadre.y1 - cadre.y0 > 1e-6) {
    const idCadre = `${prefixe}-${idSur(options.source)}-cadre`;
    const calqueRef = `${prefixe}-calque-reference`;
    if (!etat.calques[calqueRef]) commandes.push({ type: "calque.creer", params: { id: calqueRef, nom: "Référence DXF" } });
    const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
    commandes.push({
      type: "referencePlan.creer",
      params: { id: idCadre, niveauId: options.niveauId, calqueId: calqueRef, contour: [pt(r6(cadre.x0), r6(cadre.y0)), pt(r6(cadre.x1), r6(cadre.y0)), pt(r6(cadre.x1), r6(cadre.y1)), pt(r6(cadre.x0), r6(cadre.y1))], trous: [], source: options.source, nom: `Fond DXF · ${options.source}`.slice(0, 120) },
    });
    crees.unshift(idCadre);
    remarques.push(`Fond de plan « ${options.source} » : cadre ${r6(cadre.x1 - cadre.x0)} × ${r6(cadre.y1 - cadre.y0)} m, contenu groupé — à caler d'un seul geste (déplacer, tourner, échelle).`);
  } else if (crees.length) remarques.push("Dessin sans surface (contenu aligné) : pas de cadre de fond de plan.");
  if (crees.length) commandes.push({ type: "groupe.creer", params: { id: `${prefixe}-groupe-${idSur(options.source)}`, nom: `Import ${options.source}`.slice(0, 120), cibles: crees } });
  else remarques.push("Aucune entité importable dans ce fichier.");

  const taille = Math.max(1, Math.min(500, options.tailleLot ?? 500));
  // Le groupe nomme tous les objets créés : il doit rester dans un lot qui suit leur création (il est le dernier).
  const lots: { label: string; commands: Commande[] }[] = [];
  for (let k = 0; k < commandes.length; k += taille) lots.push({ label: `Import DXF ${options.source}`, commands: commandes.slice(k, k + taille) });
  return {
    lots,
    rapport: {
      format: "DXF",
      unite,
      repere: options.repere,
      entites: [...comptes.entries()].map(([type, c]) => ({ type, ...c })).sort((a, b) => b.lues - a.lues),
      calques: [...calques.keys()],
      remarques,
    },
  };
}

/** Gris (0 = noir, 1 = blanc) des couleurs vraies (code 421) d'un dégradé de HATCH, dans l'ordre. */
function champsDegrade(champs: readonly { code: number; valeur: string }[]): number[] {
  const debut = champs.findIndex((c) => c.code === 450);
  return champs
    .slice(debut)
    .filter((c) => c.code === 421)
    .map((c) => {
      const v = Number.parseInt(c.valeur, 10);
      if (!Number.isFinite(v)) return Number.NaN;
      const r = (v >> 16) & 255;
      const g = (v >> 8) & 255;
      const b = v & 255;
      return Math.round(((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 1000) / 1000;
    })
    .filter((x) => Number.isFinite(x));
}
