import { STUDIO_DEFAULT_LAYER_ID, type StudioDocument } from "./document-2d.js";

/**
 * Métré du document 2D Studio (E.3-04 / E.3-05). Pur : ni React, ni DOM, ni stockage.
 *
 * - Les quantités sont **brutes** et dérivées de la seule géométrie saisie, en mètres (repère `local-2d`) : longueur
 *   d'une ligne, périmètre et surface d'un rectangle ; avec une extrusion déclarée, hauteur, surfaces et volume.
 * - Une grandeur dont l'entrée n'est pas déclarée est « non évaluée » (`valeur: null`, avec son motif) : un objet non
 *   extrudé n'a pas de volume, une ligne extrudée sans épaisseur non plus. Aucune valeur par défaut n'est inventée.
 * - **Déductions : non déclarées.** Aucune ouverture n'est devinée d'un recouvrement (un prisme posé sur un mur n'est pas
 *   une baie) : les quantités nettes restent non évaluées tant qu'aucune déduction n'est déclarée.
 * - Les cotes sont exclues ; les objets des calques masqués sont comptés mais signalés.
 * - Un type d'objet inconnu de ce métré est rapporté « non évalué » par son `type`, jamais ignoré en silence.
 * - Aucun arrondi ici : l'arrondi appartient à l'affichage.
 *
 * Les ajustements manuels (E.3-05) s'appliquent par-dessus (`appliquerAjustementsQuantites`) : la valeur dérivée est
 * conservée à côté de la valeur ajustée, avec motif, auteur et date.
 */

export type GrandeurQuantite = "longueur" | "perimetre" | "surface" | "hauteur" | "surface-laterale" | "surface-verticale" | "volume";
export type UniteQuantite = "m" | "m2" | "m3";

export const GRANDEURS_QUANTITE: readonly GrandeurQuantite[] = Object.freeze(["longueur", "perimetre", "surface", "hauteur", "surface-laterale", "surface-verticale", "volume"] as const);
export const UNITE_GRANDEUR: Readonly<Record<GrandeurQuantite, UniteQuantite>> = Object.freeze({
  longueur: "m", perimetre: "m", surface: "m2", hauteur: "m", "surface-laterale": "m2", "surface-verticale": "m2", volume: "m3",
});
/** Une hauteur ne s'additionne pas : elle n'entre dans aucun total. */
export const GRANDEUR_CUMULABLE: Readonly<Record<GrandeurQuantite, boolean>> = Object.freeze({
  longueur: true, perimetre: true, surface: true, hauteur: false, "surface-laterale": true, "surface-verticale": true, volume: true,
});

/**
 * Nature métrée d'un objet : `ligne` / `rectangle` non extrudés, `mur` (ligne + épaisseur extrudée), `ligne-extrudee`
 * (sans épaisseur : surface verticale seulement), `prisme` (rectangle extrudé), `non-pris-en-charge` (type inconnu).
 */
export type NatureQuantite = "ligne" | "rectangle" | "mur" | "ligne-extrudee" | "prisme" | "non-pris-en-charge";

export type MotifNonEvalue = "non-extrude" | "epaisseur-non-declaree" | "type-non-pris-en-charge" | "geometrie-invalide";

export interface ValeurQuantite {
  grandeur: GrandeurQuantite;
  unite: UniteQuantite;
  /** Valeur brute dérivée, pleine précision ; null = non évaluée. */
  valeur: number | null;
  motif?: MotifNonEvalue;
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
  /** Quantités brutes seulement ; aucune déduction n'est devinée. */
  deductions: "non-declarees";
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
    documentId: doc.id, unites: "m", repere: "local-2d", deductions: "non-declarees",
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
