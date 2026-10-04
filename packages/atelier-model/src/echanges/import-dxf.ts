/**
 * Import DXF 2D (lot 6) — pur : du texte DXF ASCII à un **fond de plan** (`reference-plan`, cahier §5.10) : le cadre
 * du dessin (rectangle englobant, fichier source) sur le calque « Référence DXF », et son contenu en esquisses et
 * textes sur un calque « DXF · <calque> » par calque du fichier, le tout dans un groupe — calé ensuite comme un seul
 * objet (déplacer, tourner, échelle) ; décision D-019.
 *
 * Entités lues : LINE, LWPOLYLINE (arrondis « bulge » discrétisés), POLYLINE / VERTEX / SEQEND (2D), CIRCLE, ARC, TEXT,
 * MTEXT (texte brut). Les autres entités (blocs INSERT, hachures, cotes, splines, 3D…) sont comptées et signalées,
 * jamais devinées.
 *
 * Unités : `$INSUNITS` de l'en-tête ; quand il est absent ou « sans unité », l'unité est celle que l'utilisateur
 * choisit (`uniteSiAbsente`) et le rapport l'écrit comme une hypothèse. Repère (R5) : `local` (les coordonnées sont
 * celles du repère local du projet) ou `cadastral` (coordonnées dans le CRS de la parcelle, converties explicitement
 * par `local = cadastral − origineLocale`).
 */
import type { Commande } from "../commandes/index.js";
import type { ModeleAtelier } from "../modele.js";
import { m, pt, type Point2 } from "../unites.js";

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
}

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

/** Sections HEADER et ENTITIES, entités découpées sur le code 0. */
function lire(texte: string): { insunits: number | null; entites: Entite[] } {
  const ps = paires(texte);
  let insunits: number | null = null;
  const entites: Entite[] = [];
  let section: string | null = null;
  let courante: Entite | null = null;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (p.code === 0 && p.valeur === "SECTION") {
      section = ps[i + 1]?.code === 2 ? ps[i + 1]!.valeur : null;
      i++;
      continue;
    }
    if (p.code === 0 && p.valeur === "ENDSEC") {
      if (courante) entites.push(courante);
      courante = null;
      section = null;
      continue;
    }
    if (section === "HEADER" && p.code === 9 && p.valeur === "$INSUNITS") {
      const v = ps[i + 1];
      if (v && v.code === 70) insunits = Number.parseInt(v.valeur, 10);
      continue;
    }
    if (section === "ENTITIES" || section === "BLOCKS") {
      if (section === "BLOCKS") continue; // le contenu des blocs n'est pas lu (INSERT signalés)
      if (p.code === 0) {
        if (courante) entites.push(courante);
        courante = { type: p.valeur, champs: [] };
      } else courante?.champs.push(p);
    }
  }
  return { insunits, entites };
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
  const { insunits, entites } = lire(texte);
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
  const P = (x: number, y: number): Point2 => pt(Math.round((x * f - ox) * 1e6) / 1e6, Math.round((y * f - oy) * 1e6) / 1e6);

  const comptes = new Map<string, { lues: number; importees: number; remarque: string | null }>();
  const compter = (type: string, ok: boolean, remarque: string | null = null) => {
    const c = comptes.get(type) ?? { lues: 0, importees: 0, remarque };
    c.lues++;
    if (ok) c.importees++;
    if (remarque && !c.remarque) c.remarque = remarque;
    comptes.set(type, c);
  };
  const calques = new Map<string, string>();
  const commandes: Commande[] = [];
  const calqueDe = (e: Entite) => {
    const nom = nomCalque(txt(e, 8));
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
    for (const q of (params["points"] as Point2[] | undefined) ?? []) etendre(q);
    if (params["centre"]) etendre(params["centre"] as Point2, (params["rayon"] as { value: number }).value);
    if (params["position"]) etendre(params["position"] as Point2);
  };
  const distincts = (pts: Point2[]) => pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 1e-6);

  for (let i = 0; i < entites.length; i++) {
    const e = entites[i]!;
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
        for (; j < entites.length && entites[j]!.type === "VERTEX"; j++) sommets.push({ x: num(entites[j]!, 10, 0)!, y: num(entites[j]!, 20, 0)!, bulge: num(entites[j]!, 42, 0)! });
        if (entites[j]?.type === "SEQEND") j++;
        i = j - 1;
        if ((num(e, 70, 0)! & (8 | 16 | 64)) !== 0) {
          compter("POLYLINE", false, "polylignes 3D et maillages ignorés (import 2D)");
          break;
        }
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
        const r = (num(e, 40, 0) ?? 0) * f;
        if (!(r > 1e-6)) {
          compter(e.type, false, "rayon nul ignoré");
          break;
        }
        const centre = P(num(e, 10, 0)!, num(e, 20, 0)!);
        if (e.type === "CIRCLE") poser("esquisse.cercle", { points: [], centre, rayon: m(Math.round(r * 1e6) / 1e6), calqueId: calqueDe(e) });
        else poser("esquisse.arc", { points: [], centre, rayon: m(Math.round(r * 1e6) / 1e6), angleDebut: { value: num(e, 50, 0)!, unit: "deg" }, angleFin: { value: num(e, 51, 360)!, unit: "deg" }, calqueId: calqueDe(e) });
        compter(e.type, true);
        break;
      }
      case "TEXT":
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
      case "VERTEX":
      case "SEQEND":
        break;
      default:
        compter(e.type, false, e.type === "INSERT" ? "blocs insérés non décomposés (à exploser dans l'outil d'origine)" : e.type === "HATCH" ? "hachures non importées" : e.type === "DIMENSION" ? "cotes non importées (à recréer, associatives)" : "entité hors du sous-ensemble 2D lu");
    }
  }
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
