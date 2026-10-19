import { studioArcSweep, studioBulgeArc, studioPolylinePath, studioPolylineSegments, studioRingSimple, studioSignedArea } from "./courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS, type StudioDocument, type StudioPoint } from "./document-2d.js";
import { studioQuantitesArchitecture } from "./architecture/quantites.js";

/**
 * Métré du document 2D Studio (E.3-04 / E.3-05). Pur : ni React, ni DOM, ni stockage.
 *
 * - Les quantités sont **brutes** et dérivées de la seule géométrie saisie, en mètres (repère `local-2d`) : longueur
 *   d'une ligne, périmètre et surface d'un rectangle ; avec une extrusion déclarée, hauteur, surfaces et volume.
 * - Une grandeur dont l'entrée n'est pas déclarée est « non évaluée » (`valeur: null`, avec son motif) : un objet non
 *   extrudé n'a pas de volume, une ligne extrudée sans épaisseur non plus. Aucune valeur par défaut n'est inventée.
 * - **Déductions : non déclarées.** Aucune ouverture n'est devinée d'un recouvrement (un prisme posé sur un mur n'est pas
 *   une baie) : les quantités nettes restent non évaluées tant qu'aucune déduction n'est déclarée.
 * - **Seule exception, A.4** : un mur architectural (`architecture`, créé comme mur par l'utilisateur) déduit les vides
 *   de ses ouvertures **déclarées** (créées comme ouvertures de ce mur) : volume brut, volume déduit, volume net
 *   (`architecture/quantites.ts`) ; `deductions` vaut alors `ouvertures-declarees`. Rien d'autre n'est déduit.
 * - Courbes (cercle, arc, polyligne) : valeurs **exactes** tirées de la courbe saisie, jamais de sa discrétisation —
 *   longueur d'arc rθ, renflement `bulge = tan(θ/4)` porté par un arc de rayon c(1 + b²) / (4|b|), aire d'une polyligne
 *   fermée = aire du polygone des sommets + segments circulaires signés R²(θ − sin θ) / 2. Mur courbe (arc + épaisseur e,
 *   centré, e < 2r) : faces r ± e/2, surface des deux faces 2rθh, volume = secteur annulaire θ·r·e × h (exact).
 *   Une polyligne fermée dont le contour se croise n'a pas d'aire définie : non évaluée (`contour-non-simple`).
 *   Une polyligne ouverte ne prend pas d'épaisseur (refusée) : elle n'a pas de volume, pas même « non évalué ».
 * - Les cotes sont exclues ; les objets des calques masqués sont comptés mais signalés.
 * - Un type d'objet inconnu de ce métré est rapporté « non évalué » par son `type`, jamais ignoré en silence.
 * - Aucun arrondi ici : l'arrondi appartient à l'affichage.
 *
 * Les ajustements manuels (E.3-05) s'appliquent par-dessus (`appliquerAjustementsQuantites`) : la valeur dérivée est
 * conservée à côté de la valeur ajustée, avec motif, auteur et date.
 */

export type GrandeurQuantite = "longueur" | "perimetre" | "surface" | "hauteur" | "surface-laterale" | "surface-verticale" | "volume"
  /** A.4 : vides des ouvertures déclarées d'un mur, volume net du mur, surface d'une ouverture. */
  | "volume-deduit" | "volume-net" | "surface-ouverture";
export type UniteQuantite = "m" | "m2" | "m3";

export const GRANDEURS_QUANTITE: readonly GrandeurQuantite[] = Object.freeze(["longueur", "perimetre", "surface", "hauteur", "surface-laterale", "surface-verticale", "volume", "volume-deduit", "volume-net", "surface-ouverture"] as const);
export const UNITE_GRANDEUR: Readonly<Record<GrandeurQuantite, UniteQuantite>> = Object.freeze({
  longueur: "m", perimetre: "m", surface: "m2", hauteur: "m", "surface-laterale": "m2", "surface-verticale": "m2", volume: "m3",
  "volume-deduit": "m3", "volume-net": "m3", "surface-ouverture": "m2",
});
/** Une hauteur ne s'additionne pas : elle n'entre dans aucun total. */
export const GRANDEUR_CUMULABLE: Readonly<Record<GrandeurQuantite, boolean>> = Object.freeze({
  longueur: true, perimetre: true, surface: true, hauteur: false, "surface-laterale": true, "surface-verticale": true, volume: true,
  "volume-deduit": true, "volume-net": true, "surface-ouverture": true,
});

/**
 * Nature métrée d'un objet : `ligne` / `rectangle` non extrudés, `mur` (ligne + épaisseur extrudée), `ligne-extrudee`
 * (sans épaisseur : surface verticale seulement), `prisme` (rectangle extrudé), `cercle` / `cylindre` (cercle extrudé),
 * `arc` / `mur-courbe` (arc + épaisseur) / `arc-extrude` (sans épaisseur : surface verticale), `polyligne-ouverte` /
 * `polyligne-ouverte-extrudee` (surface verticale), `polyligne-fermee` / `prisme-polyligne`, `non-pris-en-charge` (type
 * inconnu).
 */
export type NatureQuantite =
  | "ligne" | "rectangle" | "mur" | "ligne-extrudee" | "prisme"
  | "cercle" | "cylindre" | "arc" | "mur-courbe" | "arc-extrude"
  | "polyligne-ouverte" | "polyligne-ouverte-extrudee" | "polyligne-fermee" | "prisme-polyligne"
  /** A.4 : mur et ouverture créés comme tels (`architecture`). */
  | "mur-architectural" | "ouverture"
  | "non-pris-en-charge";

export type MotifNonEvalue =
  | "non-extrude" | "epaisseur-non-declaree" | "type-non-pris-en-charge" | "geometrie-invalide"
  /** Polyligne fermée dont le contour se croise : aire non définie. */
  | "contour-non-simple"
  /** Contour discrétisé au-delà de la borne de contrôle de simplicité (`STUDIO_LIMITS.extrudedRing`) : non évaluée. */
  | "contour-non-controle";

export interface ValeurQuantite {
  grandeur: GrandeurQuantite;
  unite: UniteQuantite;
  /** Valeur brute dérivée, pleine précision ; null = non évaluée. */
  valeur: number | null;
  motif?: MotifNonEvalue;
  /** Mur courbe : surface de chaque face (intérieure r − e/2, extérieure r + e/2) ; leur somme est `valeur`. */
  faces?: { interieure: number; exterieure: number };
}

export interface QuantitesObjet {
  objetId: string;
  /** Type tel que lu dans le document (y compris un type inconnu de ce métré). */
  type: string;
  nature: NatureQuantite;
  calqueId: string;
  /** Calque masqué : l'objet est compté, et signalé. */
  calqueMasque: boolean;
  valeurs: ValeurQuantite[];
  /** Présent pour un type non pris en charge : toutes ses grandeurs sont non évaluées. */
  motif?: MotifNonEvalue;
}

export interface TotalQuantite {
  grandeur: GrandeurQuantite;
  unite: UniteQuantite;
  /** Somme des valeurs évaluées ; null si aucune ne l'est. */
  valeur: number | null;
  evalues: number;
  /** Objets pour lesquels la grandeur s'applique mais n'est pas évaluée : le total est alors partiel. */
  nonEvalues: number;
}

export interface QuantitesCalque {
  calqueId: string;
  nom: string;
  masque: boolean;
  implicite: boolean;
  objets: QuantitesObjet[];
  totaux: TotalQuantite[];
}

export interface QuantitesStudio {
  documentId: string;
  unites: "m";
  repere: "local-2d";
  /** Quantités brutes ; aucune déduction n'est devinée. `ouvertures-declarees` : des murs déduisent leurs ouvertures (A.4). */
  deductions: "non-declarees" | "ouvertures-declarees";
  calques: QuantitesCalque[];
  objets: QuantitesObjet[];
  totaux: TotalQuantite[];
  /** Cotes du document, exclues du métré. */
  cotesExclues: number;
  /** Objets d'un type inconnu de ce métré (rapportés, jamais ignorés). */
  nonPrisEnCharge: number;
}

const val = (grandeur: GrandeurQuantite, valeur: number | null, motif?: MotifNonEvalue): ValeurQuantite => {
  const ok = valeur !== null && Number.isFinite(valeur);
  return { grandeur, unite: UNITE_GRANDEUR[grandeur], valeur: ok ? valeur : null, ...(ok ? {} : { motif: motif ?? "geometrie-invalide" }) };
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pt = (v: unknown): { x: number; y: number } | null => {
  if (!v || typeof v !== "object") return null;
  const p = v as { x?: unknown; y?: unknown };
  const x = num(p.x), y = num(p.y);
  return x === null || y === null ? null : { x, y };
};
interface ExtrusionLue { height: number | null; thickness: number | null }
const extrusionLue = (o: Record<string, unknown>): ExtrusionLue | null => {
  if (!o.extrusion || typeof o.extrusion !== "object") return null;
  const e = o.extrusion as { height?: unknown; thickness?: unknown };
  return { height: num(e.height), thickness: e.thickness === undefined ? null : num(e.thickness) };
};
const mult = (...v: (number | null)[]): number | null => (v.some((x) => x === null) ? null : v.reduce<number>((a, b) => a * b!, 1));

const TWO_PI = 2 * Math.PI;
/** Angle d'arc lu dans [0 ; 2π[. */
const angleLu = (v: unknown): number | null => {
  const a = num(v);
  return a !== null && a >= 0 && a < TWO_PI ? a : null;
};
const rayonLu = (v: unknown): number | null => {
  const r = num(v);
  return r !== null && r > 0 ? r : null;
};

interface PolyligneLue { points: StudioPoint[]; closed: boolean; bulges?: number[] }
function polyligneLue(o: Record<string, unknown>): PolyligneLue | null {
  if (!Array.isArray(o.points) || typeof o.closed !== "boolean" || o.points.length < 2) return null;
  const points: StudioPoint[] = [];
  for (const p of o.points) {
    const q = pt(p);
    if (!q) return null;
    points.push(q);
  }
  if (o.bulges === undefined) return { points, closed: o.closed };
  if (!Array.isArray(o.bulges) || o.bulges.length !== (o.closed ? points.length : points.length - 1)) return null;
  const bulges: number[] = [];
  for (const b of o.bulges) {
    const x = num(b);
    if (x === null) return null;
    bulges.push(x);
  }
  return { points, closed: o.closed, bulges };
}

/** Longueur exacte d'une polyligne (cordes et arcs de renflement) ; null si un segment est de longueur nulle. */
function longueurPolyligne(p: PolyligneLue): number | null {
  let l = 0;
  for (const s of studioPolylineSegments(p)) {
    const c = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (!(c > 0)) return null;
    const arc = studioBulgeArc(s.a, s.b, s.bulge);
    l += arc ? arc.radius * Math.abs(arc.sweep) : c;
  }
  return l;
}

/** Aire exacte d'une polyligne fermée : polygone des sommets + segments circulaires signés ; contour simple exigé. */
function surfacePolyligne(p: PolyligneLue): { valeur: number | null; motif?: MotifNonEvalue } {
  const anneau = studioPolylinePath(p);
  if (anneau.length > STUDIO_LIMITS.extrudedRing) return { valeur: null, motif: "contour-non-controle" };
  if (!studioRingSimple(anneau)) return { valeur: null, motif: "contour-non-simple" };
  // Deux sommets (fermeture courbe) : polygone d'aire nulle, l'aire est celle des segments circulaires.
  let a = studioSignedArea(p.points);
  for (const s of studioPolylineSegments(p)) {
    const arc = studioBulgeArc(s.a, s.b, s.bulge);
    if (arc) a += (arc.radius * arc.radius * (arc.sweep - Math.sin(arc.sweep))) / 2;
  }
  return { valeur: Math.abs(a) };
}

function objet(o: Record<string, unknown>, calqueId: string, calqueMasque: boolean): QuantitesObjet {
  const type = typeof o.type === "string" ? o.type : String(o.type);
  const base = { objetId: String(o.id), type, calqueId, calqueMasque };
  const ext = extrusionLue(o);
  if (type === "line") {
    const a = pt(o.start), b = pt(o.end);
    const longueur = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null;
    if (!ext) return { ...base, nature: "ligne", valeurs: [val("longueur", longueur), val("volume", null, "non-extrude")] };
    if (ext.thickness === null) {
      return { ...base, nature: "ligne-extrudee", valeurs: [
        val("longueur", longueur), val("hauteur", ext.height), val("surface-verticale", mult(longueur, ext.height)), val("volume", null, "epaisseur-non-declaree"),
      ] };
    }
    return { ...base, nature: "mur", valeurs: [
      val("longueur", longueur), val("hauteur", ext.height),
      // Deux faces du mur, sans déduction ni retour d'about.
      val("surface-laterale", mult(2, longueur, ext.height)), val("volume", mult(longueur, ext.thickness, ext.height)),
    ] };
  }
  if (type === "rectangle") {
    const w = num(o.width), h = num(o.height);
    const perimetre = w !== null && h !== null ? 2 * (w + h) : null;
    const surface = mult(w, h);
    if (!ext) return { ...base, nature: "rectangle", valeurs: [val("perimetre", perimetre), val("surface", surface), val("volume", null, "non-extrude")] };
    return { ...base, nature: "prisme", valeurs: [val("perimetre", perimetre), val("surface", surface), val("hauteur", ext.height), val("volume", mult(surface, ext.height))] };
  }
  if (type === "circle") {
    const r = rayonLu(o.radius);
    const perimetre = r === null ? null : TWO_PI * r;
    const surface = r === null ? null : Math.PI * r * r;
    if (!ext) return { ...base, nature: "cercle", valeurs: [val("perimetre", perimetre), val("surface", surface), val("volume", null, "non-extrude")] };
    return { ...base, nature: "cylindre", valeurs: [val("perimetre", perimetre), val("surface", surface), val("hauteur", ext.height), val("volume", mult(surface, ext.height))] };
  }
  if (type === "arc") {
    const r = rayonLu(o.radius), a0 = angleLu(o.startAngle), a1 = angleLu(o.endAngle);
    const theta = a0 === null || a1 === null || a0 === a1 ? null : studioArcSweep(a0, a1);
    const longueur = mult(r, theta);
    if (!ext) return { ...base, nature: "arc", valeurs: [val("longueur", longueur), val("volume", null, "non-extrude")] };
    if (ext.thickness === null) {
      return { ...base, nature: "arc-extrude", valeurs: [
        val("longueur", longueur), val("hauteur", ext.height), val("surface-verticale", mult(longueur, ext.height)), val("volume", null, "epaisseur-non-declaree"),
      ] };
    }
    const e = ext.thickness, h = ext.height;
    // Mur centré sur l'arc : rayons r ± e/2, épaisseur inférieure au diamètre.
    const valide = r !== null && theta !== null && h !== null && e > 0 && e < 2 * r;
    const laterale = val("surface-laterale", valide ? 2 * r * theta * h : null);
    if (valide) laterale.faces = { interieure: (r - e / 2) * theta * h, exterieure: (r + e / 2) * theta * h };
    return { ...base, nature: "mur-courbe", valeurs: [
      val("longueur", longueur), val("hauteur", h), laterale,
      // Secteur annulaire θ/2 · ((r + e/2)² − (r − e/2)²) = θ·r·e, fois la hauteur.
      val("volume", valide ? theta * r * e * h : null),
    ] };
  }
  if (type === "polyline") {
    const p = polyligneLue(o);
    const longueur = p ? longueurPolyligne(p) : null;
    if (!p || !p.closed) {
      if (!ext) return { ...base, nature: "polyligne-ouverte", valeurs: [val("longueur", longueur)] };
      return { ...base, nature: "polyligne-ouverte-extrudee", valeurs: [val("longueur", longueur), val("hauteur", ext.height), val("surface-verticale", mult(longueur, ext.height))] };
    }
    const s = longueur === null ? { valeur: null } : surfacePolyligne(p);
    const surface = val("surface", s.valeur, s.motif);
    if (!ext) return { ...base, nature: "polyligne-fermee", valeurs: [val("perimetre", longueur), surface, val("volume", null, "non-extrude")] };
    return { ...base, nature: "prisme-polyligne", valeurs: [val("perimetre", longueur), surface, val("hauteur", ext.height), val("volume", mult(s.valeur, ext.height), s.motif)] };
  }
  return { ...base, nature: "non-pris-en-charge", motif: "type-non-pris-en-charge", valeurs: [] };
}

/** Totaux par grandeur cumulable ; un objet d'un type non pris en charge rend partiel chaque total. */
export function totaliserQuantites(objets: readonly QuantitesObjet[]): TotalQuantite[] {
  const inconnus = objets.filter((o) => o.nature === "non-pris-en-charge").length;
  const totaux: TotalQuantite[] = [];
  for (const grandeur of GRANDEURS_QUANTITE) {
    if (!GRANDEUR_CUMULABLE[grandeur]) continue;
    let somme = 0, evalues = 0, nonEvalues = 0;
    for (const o of objets) {
      const v = o.valeurs.find((x) => x.grandeur === grandeur);
      if (!v) continue;
      if (v.valeur === null) nonEvalues++;
      else { somme += v.valeur; evalues++; }
    }
    if (evalues === 0 && nonEvalues === 0) continue;
    totaux.push({ grandeur, unite: UNITE_GRANDEUR[grandeur], valeur: evalues ? somme : null, evalues, nonEvalues: nonEvalues + inconnus });
  }
  return totaux;
}

/** Métré brut du document, par objet et par calque (calque implicite d'abord s'il porte des objets, puis l'ordre du document). */
export function quantitesStudio(doc: StudioDocument): QuantitesStudio {
  const declares = doc.layers ?? [];
  const infos = new Map<string, { nom: string; masque: boolean; implicite: boolean }>();
  for (const l of declares) infos.set(l.id, { nom: l.name, masque: !l.visible, implicite: false });
  if (!infos.has(STUDIO_DEFAULT_LAYER_ID)) infos.set(STUDIO_DEFAULT_LAYER_ID, { nom: STUDIO_DEFAULT_LAYER_ID, masque: false, implicite: true });
  const parCalque = new Map<string, QuantitesObjet[]>();
  const objets: QuantitesObjet[] = [];
  for (const raw of doc.objects as readonly unknown[]) {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const calqueId = typeof o.layerId === "string" ? o.layerId : STUDIO_DEFAULT_LAYER_ID;
    // Un calque référencé mais non déclaré (document non validé) est rapporté sous son identifiant.
    if (!infos.has(calqueId)) infos.set(calqueId, { nom: calqueId, masque: false, implicite: false });
    const q = objet(o, calqueId, infos.get(calqueId)!.masque);
    objets.push(q);
    parCalque.set(calqueId, [...(parCalque.get(calqueId) ?? []), q]);
  }
  // Objets architecturaux (A.4) : métré dérivé de la géométrie validée ; un ensemble invalide est « non évalué ».
  const architecture = doc.architecture ?? [];
  let lus: ReturnType<typeof studioQuantitesArchitecture> | null = null;
  try { lus = studioQuantitesArchitecture(architecture); } catch { lus = null; }
  architecture.forEach((it, i) => {
    const l = lus?.[i];
    const calqueId = (it.type === "wall" ? it.layerId : l?.layerId) ?? STUDIO_DEFAULT_LAYER_ID;
    if (!infos.has(calqueId)) infos.set(calqueId, { nom: calqueId, masque: false, implicite: false });
    const base = { objetId: it.id, type: it.type, calqueId, calqueMasque: infos.get(calqueId)!.masque };
    const q: QuantitesObjet = it.type === "wall"
      ? { ...base, nature: "mur-architectural", valeurs: l?.type === "wall"
        ? [val("longueur", l.longueur), val("hauteur", l.hauteur), val("volume", l.volumeBrut), val("volume-deduit", l.deduction), val("volume-net", l.volumeNet)]
        : [val("longueur", null), val("hauteur", null), val("volume", null), val("volume-deduit", null), val("volume-net", null)] }
      : { ...base, nature: "ouverture", valeurs: l?.type === "opening" ? [val("surface-ouverture", l.surface)] : [val("surface-ouverture", null)] };
    objets.push(q);
    parCalque.set(calqueId, [...(parCalque.get(calqueId) ?? []), q]);
  });
  const ordre = [STUDIO_DEFAULT_LAYER_ID, ...declares.map((l) => l.id).filter((id) => id !== STUDIO_DEFAULT_LAYER_ID), ...[...parCalque.keys()].filter((id) => id !== STUDIO_DEFAULT_LAYER_ID && !declares.some((l) => l.id === id))];
  const calques: QuantitesCalque[] = [];
  for (const id of ordre) {
    const liste = parCalque.get(id) ?? [];
    const info = infos.get(id)!;
    // Le calque implicite vide n'existe pas pour l'utilisateur ; un calque déclaré vide est montré.
    if (info.implicite && liste.length === 0) continue;
    calques.push({ calqueId: id, nom: info.nom, masque: info.masque, implicite: info.implicite, objets: liste, totaux: totaliserQuantites(liste) });
  }
  return {
    documentId: doc.id, unites: "m", repere: "local-2d", deductions: architecture.some((x) => x.type === "opening") ? "ouvertures-declarees" : "non-declarees",
    calques, objets, totaux: totaliserQuantites(objets),
    cotesExclues: doc.dimensions?.length ?? 0,
    nonPrisEnCharge: objets.filter((o) => o.nature === "non-pris-en-charge").length,
  };
}

// ——— Ajustements manuels (E.3-05) ———

/**
 * Ajustement manuel d'une grandeur d'un objet, saisi par une personne. Il ne remplace jamais la valeur dérivée : les
 * deux sont montrées. `valeur: null` revient explicitement à la valeur dérivée (le retour est lui aussi tracé).
 * Le journal est en ajout seul ; pour un même couple (objet, grandeur), le dernier ajustement l'emporte.
 */
export interface AjustementQuantite {
  objetId: string;
  grandeur: GrandeurQuantite;
  valeur: number | null;
  motif: string;
  auteur: string;
  /** Date ISO 8601. */
  date: string;
}

export type RefusAjustement = "objet-inconnu" | "grandeur-non-applicable" | "valeur-invalide" | "motif-obligatoire" | "auteur-obligatoire" | "date-invalide";

/** Contrôle d'un ajustement contre le métré : null s'il est recevable, sinon le motif du refus. */
export function controlerAjustementQuantite(q: QuantitesStudio, a: AjustementQuantite): RefusAjustement | null {
  const o = q.objets.find((x) => x.objetId === a.objetId);
  if (!o) return "objet-inconnu";
  if (!o.valeurs.some((v) => v.grandeur === a.grandeur)) return "grandeur-non-applicable";
  if (a.valeur !== null && (typeof a.valeur !== "number" || !Number.isFinite(a.valeur) || a.valeur < 0)) return "valeur-invalide";
  if (typeof a.motif !== "string" || !a.motif.trim()) return "motif-obligatoire";
  if (typeof a.auteur !== "string" || !a.auteur.trim()) return "auteur-obligatoire";
  if (typeof a.date !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(a.date) || Number.isNaN(Date.parse(a.date))) return "date-invalide";
  return null;
}

export interface ValeurAjustee extends ValeurQuantite {
  /** Valeur dérivée (identique à `valeur`, gardée explicite). */
  derivee: number | null;
  /** Valeur ajustée en vigueur ; absente sans ajustement actif. */
  ajustee?: number;
  /** Valeur retenue : l'ajustée si elle existe, sinon la dérivée. */
  retenue: number | null;
  /** Ajustement en vigueur (le dernier du couple), y compris un retour à la dérivée. */
  ajustement?: AjustementQuantite;
}
export interface ObjetAjuste extends Omit<QuantitesObjet, "valeurs"> { valeurs: ValeurAjustee[] }
export interface TotalAjuste extends TotalQuantite {
  /** Total des valeurs retenues ; null si aucune n'est disponible. */
  retenue: number | null;
  ajustes: number;
}
export interface CalqueAjuste extends Omit<QuantitesCalque, "objets" | "totaux"> { objets: ObjetAjuste[]; totaux: TotalAjuste[] }
export interface QuantitesAjustees extends Omit<QuantitesStudio, "calques" | "objets" | "totaux"> {
  calques: CalqueAjuste[];
  objets: ObjetAjuste[];
  totaux: TotalAjuste[];
  /** Journal complet, ajustements refusés compris avec leur motif. */
  journal: { ajustement: AjustementQuantite; refus: RefusAjustement | null; enVigueur: boolean }[];
}

function totauxAjustes(objets: readonly ObjetAjuste[]): TotalAjuste[] {
  const derives = totaliserQuantites(objets);
  return derives.map((t) => {
    let somme = 0, disponibles = 0, ajustes = 0;
    for (const o of objets) {
      const v = o.valeurs.find((x) => x.grandeur === t.grandeur);
      if (!v) continue;
      if (v.ajustee !== undefined) ajustes++;
      if (v.retenue !== null) { somme += v.retenue; disponibles++; }
    }
    return { ...t, retenue: disponibles ? somme : null, ajustes };
  });
}

/** Applique le journal d'ajustements au métré, sans jamais effacer la valeur dérivée. */
export function appliquerAjustementsQuantites(q: QuantitesStudio, ajustementsQuantites: readonly AjustementQuantite[]): QuantitesAjustees {
  const enVigueur = new Map<string, number>();
  const refus = ajustementsQuantites.map((a) => controlerAjustementQuantite(q, a));
  ajustementsQuantites.forEach((a, i) => { if (!refus[i]) enVigueur.set(`${a.objetId}\u0000${a.grandeur}`, i); });
  const ajuster = (o: QuantitesObjet): ObjetAjuste => ({
    ...o,
    valeurs: o.valeurs.map((v) => {
      const i = enVigueur.get(`${o.objetId}\u0000${v.grandeur}`);
      const a = i === undefined ? undefined : ajustementsQuantites[i]!;
      const ajustee = a && a.valeur !== null ? a.valeur : undefined;
      return { ...v, derivee: v.valeur, retenue: ajustee ?? v.valeur, ...(ajustee !== undefined ? { ajustee } : {}), ...(a ? { ajustement: a } : {}) };
    }),
  });
  const objets = q.objets.map(ajuster);
  const parId = new Map(objets.map((o) => [o.objetId, o]));
  const calques = q.calques.map((c) => {
    const liste = c.objets.map((o) => parId.get(o.objetId)!);
    return { ...c, objets: liste, totaux: totauxAjustes(liste) };
  });
  const vigueur = new Set(enVigueur.values());
  return {
    ...q, calques, objets, totaux: totauxAjustes(objets),
    journal: ajustementsQuantites.map((ajustement, i) => ({ ajustement, refus: refus[i] ?? null, enVigueur: vigueur.has(i) })),
  };
}
