/**
 * Export DXF des feuilles (cas 4 du catalogue des extensions, lot C4, étape 5 : D10-F14-005, D10-F14-143, D10-F14-123).
 * Pur : ni React, ni DOM.
 *
 * - Feuille entière : un DXF par feuille, en millimètres papier (1 mm de la feuille = 1 unité), y vers le haut.
 * - Vue à l'échelle réelle : un DXF par fenêtre de vue, en mètres, dans le repère de la vue (plan, coupe ou façade).
 * - Calques fixés (table partagée avec l'extension « Échanges DXF ») : FADI_COUPE, FADI_VU, FADI_CACHE, FADI_HACHURES,
 *   FADI_TEXTES, FADI_COTES, FADI_CADRE, suffixés _EXISTANT, _A_DEMOLIR ou _PROJETE selon le statut des travaux.
 * - Hachures en HATCH (motif de la matière, familles du .pat ; aplat gris sans motif), textes en TEXT, traits en LINE.
 * - DXF R2000 (AC1015), texte ASCII : les caractères hors ASCII sont écrits en \U+XXXX.
 *
 * Écart déclaré : les couleurs des statuts (existant 7, à démolir 2 jaune, projeté 1 rouge, numéros de couleur DXF)
 * reprennent la convention SIA 400 de mémoire, non vérifiée dans la norme.
 */
import type { FamilleHachure, Feuille, MotifHachure } from "./annotations.js";
import { type CompositionFeuille, EPAISSEURS_TRAITS, type PrimitiveFeuille, projectionFenetre } from "./feuilles.js";
import type { Modele, StatutTravaux } from "./geometrie-libre.js";
import type { P2 } from "./plan-vectoriel.js";

export type CalqueDxf = "FADI_COUPE" | "FADI_VU" | "FADI_CACHE" | "FADI_HACHURES" | "FADI_TEXTES" | "FADI_COTES" | "FADI_CADRE";
export const CALQUES_DXF: readonly CalqueDxf[] = ["FADI_COUPE", "FADI_VU", "FADI_CACHE", "FADI_HACHURES", "FADI_TEXTES", "FADI_COTES", "FADI_CADRE"];
export const SUFFIXES_STATUT: Readonly<Record<StatutTravaux, string>> = { existant: "_EXISTANT", "a-demolir": "_A_DEMOLIR", projete: "_PROJETE" };
/** Couleurs DXF (ACI) des statuts : convention SIA 400 reprise de mémoire (écart déclaré). */
export const COULEURS_STATUT: Readonly<Record<StatutTravaux, number>> = { existant: 7, "a-demolir": 2, projete: 1 };

/** Épaisseur DXF (1/100 mm, valeurs normalisées) de chaque calque. */
const EPAISSEUR_CALQUE: Readonly<Record<CalqueDxf, number>> = { FADI_COUPE: 50, FADI_VU: 18, FADI_CACHE: 13, FADI_HACHURES: 13, FADI_TEXTES: 18, FADI_COTES: 18, FADI_CADRE: 50 };
const TIRETS = [EPAISSEURS_TRAITS.cache * 8, EPAISSEURS_TRAITS.cache * 6];

/** Nom d'un calque, suffixé du statut des travaux. */
export const nomCalque = (c: CalqueDxf, statut?: StatutTravaux): string => (statut ? c + SUFFIXES_STATUT[statut] : c);

const n = (v: number): string => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
};
/** Texte DXF ASCII : hors ASCII en \U+XXXX, sans saut de ligne. */
export const texteDxf = (t: string): string =>
  [...t.replace(/[\r\n]+/g, " ")].map((c) => {
    const k = c.codePointAt(0)!;
    return k >= 32 && k < 127 ? c : k > 0xffff ? "?" : `\\U+${k.toString(16).toUpperCase().padStart(4, "0")}`;
  }).join("");

interface Hachure {
  readonly calque: string;
  readonly boucles: readonly (readonly P2[])[];
  readonly motif: MotifHachure | null;
  /** Facteur des longueurs du motif (définies en mm papier). */
  readonly echelle: number;
}

/** Écrivain DXF R2000 minimal : tables, blocs de l'espace objet et de la présentation, entités, objets. */
class Dxf {
  // Poignées des entités et des calques au-delà des poignées fixes des tables et des objets (jusqu'à 1A0).
  private h = 0x200;
  private readonly entites: string[] = [];
  private readonly calques = new Map<string, { couleur: number; epaisseur: number; tirets: boolean }>();
  constructor(private readonly unite: 4 | 6, private readonly echelleTirets: number) {}
  private poignee(): string {
    return (this.h++).toString(16).toUpperCase();
  }
  calque(nom: string, base: CalqueDxf, statut?: StatutTravaux): string {
    if (!this.calques.has(nom)) this.calques.set(nom, { couleur: statut ? COULEURS_STATUT[statut] : 7, epaisseur: EPAISSEUR_CALQUE[base], tirets: base === "FADI_CACHE" });
    return nom;
  }
  private entete(type: string, calque: string, proprietaire: string, extra: string[] = []): string[] {
    return ["0", type, "5", this.poignee(), "330", proprietaire, "100", "AcDbEntity", "8", calque, ...extra];
  }
  ligne(calque: string, a: P2, b: P2, couleur?: number): void {
    this.entites.push(...this.entete("LINE", calque, "@MS", couleur ? ["62", String(couleur)] : []), "100", "AcDbLine", "10", n(a.x), "20", n(a.y), "30", "0", "11", n(b.x), "21", n(b.y), "31", "0");
  }
  texte(calque: string, p: P2, hauteur: number, t: string, ancre: "debut" | "fin" | "milieu" = "debut", couleur?: number): void {
    const h = ancre === "fin" ? 2 : ancre === "milieu" ? 1 : 0;
    this.entites.push(...this.entete("TEXT", calque, "@MS", couleur ? ["62", String(couleur)] : []), "100", "AcDbText", "10", n(p.x), "20", n(p.y), "30", "0", "40", n(hauteur), "1", texteDxf(t), "7", "Standard");
    if (h) this.entites.push("72", String(h), "11", n(p.x), "21", n(p.y), "31", "0");
    this.entites.push("100", "AcDbText");
  }
  hachure(x: Hachure): void {
    const plein = !x.motif || x.motif.familles.length === 0;
    const e = [...this.entete("HATCH", x.calque, "@MS", plein ? ["62", "9", "420", String(0xd9d9d9)] : []), "100", "AcDbHatch", "10", "0", "20", "0", "30", "0", "210", "0", "220", "0", "230", "1"];
    e.push("2", plein ? "SOLID" : x.motif!.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 31) || "FADI", "70", plein ? "1" : "0", "71", "0", "91", String(x.boucles.length));
    x.boucles.forEach((b, i) => {
      e.push("92", i === 0 ? "3" : "2", "72", "0", "73", "1", "93", String(b.length));
      for (const p of b) e.push("10", n(p.x), "20", n(p.y));
      e.push("97", "0");
    });
    e.push("75", "0", "76", plein ? "1" : "2");
    if (!plein) {
      e.push("52", "0", "41", "1", "77", "0", "78", String(x.motif!.familles.length));
      for (const f of x.motif!.familles) e.push(...familleDxf(f, x.echelle));
    }
    e.push("98", "0");
    this.entites.push(...e);
  }
  /** Fichier complet. */
  ecrire(): string {
    const MS = "1F";
    const PS = "1E";
    const ent = this.entites.map((v) => (v === "@MS" ? MS : v));
    const L: string[] = [];
    const t = (...v: string[]) => L.push(...v);
    const debutTable = (nom: string, h: string, nb: number) => t("0", "TABLE", "2", nom, "5", h, "330", "0", "100", "AcDbSymbolTable", "70", String(nb));
    const calques = [["0", { couleur: 7, epaisseur: -3, tirets: false }] as const, ...this.calques.entries()];
    const handseed = (this.h + 0x100).toString(16).toUpperCase();
    t("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$HANDSEED", "5", handseed, "9", "$INSUNITS", "70", String(this.unite), "9", "$MEASUREMENT", "70", "1", "9", "$LTSCALE", "40", n(this.echelleTirets), "9", "$DWGCODEPAGE", "3", "ANSI_1252", "0", "ENDSEC");
    t("0", "SECTION", "2", "CLASSES", "0", "ENDSEC");
    t("0", "SECTION", "2", "TABLES");
    debutTable("VPORT", "8", 1);
    t("0", "VPORT", "5", "9", "330", "8", "100", "AcDbSymbolTableRecord", "100", "AcDbViewportTableRecord", "2", "*ACTIVE", "70", "0", "10", "0", "20", "0", "11", "1", "21", "1", "12", "0", "22", "0", "40", "1000", "41", "1.5", "0", "ENDTAB");
    debutTable("LTYPE", "5", 4);
    const ltype = (h: string, nom: string, desc: string, elements: readonly number[]) => {
      t("0", "LTYPE", "5", h, "330", "5", "100", "AcDbSymbolTableRecord", "100", "AcDbLinetypeTableRecord", "2", nom, "70", "0", "3", desc, "72", "65", "73", String(elements.length), "40", n(elements.reduce((a, b) => a + Math.abs(b), 0)));
      for (const e of elements) t("49", n(e), "74", "0");
    };
    ltype("14", "ByBlock", "", []);
    ltype("15", "ByLayer", "", []);
    ltype("16", "Continuous", "Solid line", []);
    ltype("17", "FADI_TIRETS", "Traits caches", [TIRETS[0]!, -TIRETS[1]!]);
    t("0", "ENDTAB");
    debutTable("LAYER", "2", calques.length);
    for (const [nom, c] of calques) t("0", "LAYER", "5", this.poignee(), "330", "2", "100", "AcDbSymbolTableRecord", "100", "AcDbLayerTableRecord", "2", nom, "70", "0", "62", String(c.couleur), "6", c.tirets ? "FADI_TIRETS" : "Continuous", "370", String(c.epaisseur), "390", "F");
    t("0", "ENDTAB");
    debutTable("STYLE", "3", 1);
    t("0", "STYLE", "5", "11", "330", "3", "100", "AcDbSymbolTableRecord", "100", "AcDbTextStyleTableRecord", "2", "Standard", "70", "0", "40", "0", "41", "1", "50", "0", "71", "0", "42", "2.5", "3", "txt", "4", "", "0", "ENDTAB");
    debutTable("VIEW", "6", 0);
    t("0", "ENDTAB");
    debutTable("UCS", "7", 0);
    t("0", "ENDTAB");
    debutTable("APPID", "9A", 1);
    t("0", "APPID", "5", "12", "330", "9A", "100", "AcDbSymbolTableRecord", "100", "AcDbRegAppTableRecord", "2", "ACAD", "70", "0", "0", "ENDTAB");
    t("0", "TABLE", "2", "DIMSTYLE", "5", "A", "330", "0", "100", "AcDbSymbolTable", "70", "1", "100", "AcDbDimStyleTable", "71", "0");
    t("0", "DIMSTYLE", "105", "27", "330", "A", "100", "AcDbSymbolTableRecord", "100", "AcDbDimStyleTableRecord", "2", "Standard", "70", "0", "0", "ENDTAB");
    debutTable("BLOCK_RECORD", "1", 2);
    t("0", "BLOCK_RECORD", "5", MS, "330", "1", "100", "AcDbSymbolTableRecord", "100", "AcDbBlockTableRecord", "2", "*Model_Space", "340", "22");
    t("0", "BLOCK_RECORD", "5", PS, "330", "1", "100", "AcDbSymbolTableRecord", "100", "AcDbBlockTableRecord", "2", "*Paper_Space", "340", "1A");
    t("0", "ENDTAB", "0", "ENDSEC");
    t("0", "SECTION", "2", "BLOCKS");
    for (const [h, fin, rec, nom] of [["20", "21", MS, "*Model_Space"], ["1B", "1C", PS, "*Paper_Space"]] as const) {
      t("0", "BLOCK", "5", h, "330", rec, "100", "AcDbEntity", ...(nom === "*Paper_Space" ? ["67", "1"] : []), "8", "0", "100", "AcDbBlockBegin", "2", nom, "70", "0", "10", "0", "20", "0", "30", "0", "3", nom, "1", "");
      t("0", "ENDBLK", "5", fin, "330", rec, "100", "AcDbEntity", ...(nom === "*Paper_Space" ? ["67", "1"] : []), "8", "0", "100", "AcDbBlockEnd");
    }
    t("0", "ENDSEC");
    t("0", "SECTION", "2", "ENTITIES", ...ent, "0", "ENDSEC");
    // Objets : dictionnaire racine, groupes et présentations (Model, Layout1) attachées aux blocs.
    t("0", "SECTION", "2", "OBJECTS");
    t("0", "DICTIONARY", "5", "C", "330", "0", "100", "AcDbDictionary", "281", "1", "3", "ACAD_GROUP", "350", "D", "3", "ACAD_LAYOUT", "350", "1A0");
    t("0", "DICTIONARY", "5", "D", "330", "C", "100", "AcDbDictionary", "281", "1");
    t("0", "DICTIONARY", "5", "1A0", "330", "C", "100", "AcDbDictionary", "281", "1", "3", "Layout1", "350", "1A", "3", "Model", "350", "22");
    for (const [h, rec, nom, ordre] of [["22", MS, "Model", 0], ["1A", PS, "Layout1", 1]] as const) {
      t("0", "LAYOUT", "5", h, "330", "1A0", "100", "AcDbPlotSettings", "1", "", "4", "", "6", "", "40", "0", "41", "0", "42", "0", "43", "0", "44", "0", "45", "0", "46", "0", "47", "0", "48", "0", "49", "0", "140", "0", "141", "0", "142", "1", "143", "1", "70", "688", "72", "1", "73", "0", "74", "5", "7", "", "75", "16", "147", "1", "148", "0", "149", "0");
      t("100", "AcDbLayout", "1", nom, "70", "1", "71", String(ordre), "10", "0", "20", "0", "11", "420", "21", "297", "12", "0", "22", "0", "32", "0", "14", "0", "24", "0", "34", "0", "15", "0", "25", "0", "35", "0", "146", "0", "13", "0", "23", "0", "33", "0", "16", "1", "26", "0", "36", "0", "17", "0", "27", "1", "37", "0", "76", "0", "330", rec);
    }
    t("0", "ENDSEC", "0", "EOF");
    return `${L.join("\n")}\n`;
  }
}

/** Ligne de motif HATCH (angle, origine, décalage d'une ligne à la suivante, tirets), y vers le haut. */
function familleDxf(f: FamilleHachure, k: number): string[] {
  const a = (f.angle * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const nrm = { x: -u.y, y: u.x };
  // Comme le PDF : lignes espacées de |dy| sur la normale, glissées de dx le long de la ligne ; tirets alternés.
  const dy = Math.abs(f.dy) * k;
  const dx = f.dx * k;
  const tirets = f.tirets.map((t, i) => (i % 2 === 0 ? Math.abs(t) : -Math.abs(t)) * k);
  return ["53", n(f.angle), "43", n(f.x0 * k), "44", n(-f.y0 * k), "45", n(dx * u.x - dy * nrm.x), "46", n(dx * u.y - dy * nrm.y), "79", String(tirets.length), ...tirets.flatMap((t) => ["49", n(t)])];
}

function calqueTrait(p: Extract<PrimitiveFeuille, { genre: "trait" }>): CalqueDxf {
  return p.classe === "coupe" ? "FADI_COUPE" : p.classe === "vu" ? "FADI_VU" : p.classe === "cache" ? "FADI_CACHE" : p.classe === "cote" ? "FADI_COTES" : "FADI_CADRE";
}

/** Feuille entière en DXF, en millimètres papier (y vers le haut, origine au coin bas gauche de la feuille). */
export function dxfFeuille(c: CompositionFeuille): string {
  const d = new Dxf(4, 1);
  const Y = (p: P2): P2 => ({ x: p.x, y: c.hauteur - p.y });
  for (const p of c.primitives) {
    if (p.genre === "cadre") {
      const k = d.calque("FADI_CADRE", "FADI_CADRE");
      const q = [{ x: p.x, y: p.y }, { x: p.x + p.largeur, y: p.y }, { x: p.x + p.largeur, y: p.y + p.hauteur }, { x: p.x, y: p.y + p.hauteur }].map(Y);
      q.forEach((a, i) => d.ligne(k, a, q[(i + 1) % 4]!));
    } else if (p.genre === "trait") {
      const base = calqueTrait(p);
      d.ligne(d.calque(nomCalque(base, p.statut), base, p.statut), Y(p.a), Y(p.b));
    } else if (p.genre === "texte") {
      const base: CalqueDxf = p.cote ? "FADI_COTES" : "FADI_TEXTES";
      d.texte(d.calque(base, base), Y({ x: p.x, y: p.y }), p.taille * 0.72, p.texte, p.ancre ?? "debut", p.gris ? 8 : undefined);
    } else {
      d.hachure({ calque: d.calque(nomCalque("FADI_HACHURES", p.statut), "FADI_HACHURES", p.statut), boucles: p.boucles.map((b) => b.map(Y)), motif: p.motif, echelle: 1 });
    }
  }
  return d.ecrire();
}

/**
 * Une fenêtre de vue en DXF, en mètres à l'échelle réelle, dans le repère de la vue : traits par classe, poches en HATCH
 * (motif ramené à l'échelle de la fenêtre), cotes. `null` si la vue est vide.
 */
export function dxfVue(m: Modele, f: Feuille, fenetre: string, o: { readonly separateur?: "." | "," } = {}): string | null {
  const w = f.fenetres.find((x) => x.id === fenetre);
  if (!w) return null;
  const { plan, cotes } = projectionFenetre(m, w, o.separateur ? { separateur: o.separateur } : {});
  if (plan.traits.length === 0) return null;
  const k = w.echelle / 1000;
  const d = new Dxf(6, k);
  const motifs = m.annotations?.motifs ?? {};
  const materiaux = m.annotations?.materiaux ?? {};
  for (const po of plan.poches) {
    const motif = po.materiau ? materiaux[po.materiau]?.motif : undefined;
    d.hachure({ calque: d.calque(nomCalque("FADI_HACHURES", po.statut), "FADI_HACHURES", po.statut), boucles: po.boucles, motif: motif ? (motifs[motif] ?? null) : null, echelle: k });
  }
  const base: Readonly<Record<string, CalqueDxf>> = { coupe: "FADI_COUPE", vu: "FADI_VU", cache: "FADI_CACHE" };
  for (const t of plan.traits) {
    const b = base[t.classe]!;
    d.ligne(d.calque(nomCalque(b, t.statut), b, t.statut), t.a, t.b);
  }
  for (const c of cotes) {
    const kc = d.calque("FADI_COTES", "FADI_COTES");
    for (const l of c.lignes) for (let i = 1; i < l.length; i++) d.ligne(kc, l[i - 1]!, l[i]!);
    d.texte(kc, { x: c.etiquette.x, y: c.etiquette.y + 0.8 * k }, 2.5 * 0.72 * k, c.texte, "milieu");
  }
  return d.ecrire();
}

/** Relecture d'un DXF émis : calques déclarés et nombre d'entités par type (contrôle de l'export). */
export function relireDxf(texte: string): { readonly version: string; readonly calques: readonly string[]; readonly entites: Readonly<Record<string, number>> } | null {
  const l = texte.split(/\r?\n/);
  if (l.length < 4 || l[l.length - 2] !== "EOF") return null;
  let version = "";
  const calques: string[] = [];
  const entites: Record<string, number> = {};
  let section = "";
  let objet = "";
  let variable = "";
  for (let i = 0; i + 1 < l.length; i += 2) {
    const code = l[i]!.trim();
    const v = l[i + 1]!;
    if (code === "0") {
      objet = v;
      if (section === "ENTITIES" && v !== "ENDSEC") entites[v] = (entites[v] ?? 0) + 1;
      if (v === "ENDSEC") section = "";
    } else if (code === "2" && objet === "SECTION") section = v;
    else if (code === "2" && objet === "LAYER") calques.push(v);
    else if (code === "9") variable = v;
    else if (code === "1" && variable === "$ACADVER" && !version) version = v;
  }
  return { version, calques, entites };
}
