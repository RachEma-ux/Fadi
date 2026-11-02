/**
 * Saisie des graphismes (EX-055) et du système de projet (EX-023) : lecture des champs du formulaire et commandes
 * produites. Pur : ni React ni DOM. Rien n'est supposé : un champ vide ou illisible est une erreur dite, jamais une
 * valeur par défaut ; le modèle (`validerGraphisme`, `validerVersionSystemeProjet`) reste seul juge.
 */
import {
  STUDIO_DEFAULT_LAYER_ID, StudioValidationError, studioDepuisProjet, studioNombreDroitesHachure, studioVersProjet, validerGraphisme, validerVersionSystemeProjet,
  type StudioCommand, type StudioDocument, type StudioGraphisme, type StudioNomSymbole, type StudioPoint, type StudioPointConverti,
} from "@parcours/atelier-model";

export type TypeGraphisme = StudioGraphisme["type"];

export interface SaisieGraphisme {
  type: TypeGraphisme;
  /** Points « x y ; x y ; … » : spline (départ, contrôle 1, contrôle 2, arrivée…) ou contour de hachure. */
  points: string;
  /** Hachure : angle (degrés) et espacement (m). */
  angle: string;
  espacement: string;
  /** Symbole : nom, position, rotation (degrés), échelle. */
  symbole: StudioNomSymbole;
  x: string;
  y: string;
  rotation: string;
  echelle: string;
  /** Opacité en pour cent (1 à 100 ; 100 = opaque). */
  opacite: string;
}

export const SAISIE_GRAPHISME_INITIALE: SaisieGraphisme = {
  type: "spline", points: "", angle: "", espacement: "", symbole: "nord", x: "", y: "", rotation: "", echelle: "", opacite: "100",
};

export const NOMS_TYPES_GRAPHISME: Readonly<Record<TypeGraphisme, string>> = Object.freeze({ spline: "Spline (courbe de Bézier)", hachure: "Hachure", symbole: "Symbole" });
export const NOMS_SYMBOLES: Readonly<Record<StudioNomSymbole, string>> = Object.freeze({ nord: "Nord", croix: "Croix de repère", niveau: "Repère de niveau" });

/** Nombre lu (virgule ou point décimal) ; null si vide ou illisible. */
export function lireNombre(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Points « x y ; x y ; … » ; null si un point est illisible. */
export function lirePoints(s: string): StudioPoint[] | null {
  const morceaux = s.split(";").map((m) => m.trim()).filter(Boolean);
  const out: StudioPoint[] = [];
  for (const m of morceaux) {
    const v = m.replace(/,/g, ".").split(/\s+/).map(Number);
    if (v.length !== 2 || v.some((x) => !Number.isFinite(x))) return null;
    out.push({ x: v[0]!, y: v[1]! });
  }
  return out;
}

export type ResultatSaisie = { commandes: StudioCommand[] } | { erreur: string };

const deg = (d: number) => (d * Math.PI) / 180;

/** Commande de création d'un graphisme depuis la saisie (calque actif, identifiant fourni) ; erreur dite sinon. */
export function commandeGraphisme(s: SaisieGraphisme, id: string, layerId: string | undefined, doc: StudioDocument): ResultatSaisie {
  const opacite = lireNombre(s.opacite);
  if (opacite === null || opacite <= 0 || opacite > 100) return { erreur: "Opacité : un pourcentage de 1 à 100 est attendu (100 = opaque)." };
  const base = { id, ...(layerId && layerId !== STUDIO_DEFAULT_LAYER_ID ? { layerId } : {}), ...(opacite < 100 ? { opacite: opacite / 100 } : {}) };
  let g: StudioGraphisme;
  if (s.type === "spline") {
    const points = lirePoints(s.points);
    if (!points) return { erreur: "Points illisibles : écrivez « x y ; x y ; … » en mètres." };
    g = { ...base, type: "spline", points };
  } else if (s.type === "hachure") {
    const contour = lirePoints(s.points), angle = lireNombre(s.angle), espacement = lireNombre(s.espacement);
    if (!contour) return { erreur: "Points illisibles : écrivez « x y ; x y ; … » en mètres." };
    if (angle === null || espacement === null) return { erreur: "Angle et espacement des traits sont à saisir." };
    const a = ((angle % 180) + 180) % 180;
    g = { ...base, type: "hachure", contour, angle: deg(a), espacement };
  } else {
    const x = lireNombre(s.x), y = lireNombre(s.y), rotation = lireNombre(s.rotation), echelle = lireNombre(s.echelle);
    if (x === null || y === null || rotation === null || echelle === null) return { erreur: "Position, rotation et échelle du symbole sont à saisir." };
    g = { ...base, type: "symbole", symbole: s.symbole, position: { x, y }, rotation: deg(rotation), echelle };
  }
  // Contrôle du modèle avant l'envoi au brouillon (qui reste seul à appliquer la commande, contrat A.5-01).
  try { validerGraphisme(g, "graphisme"); } catch (e) { if (e instanceof StudioValidationError) return { erreur: `Graphisme refusé : ${e.message}` }; throw e; }
  if ([...doc.objects, ...(doc.graphismes ?? [])].some((o) => o.id === id)) return { erreur: "Graphisme refusé : identifiant déjà utilisé." };
  return { commandes: [{ toolId: "studio.graphisme.creer", params: g }] };
}

/** Nombre de traits qu'une hachure saisie produirait (aperçu), ou null si la saisie est incomplète. */
export function traitsPrevus(s: SaisieGraphisme): number | null {
  if (s.type !== "hachure") return null;
  const c = lirePoints(s.points), a = lireNombre(s.angle), e = lireNombre(s.espacement);
  if (!c || c.length < 3 || a === null || e === null || !(e > 0)) return null;
  return studioNombreDroitesHachure(c, deg(((a % 180) + 180) % 180), e);
}

/** Commande de retrait des graphismes nommés (ceux du document seulement). */
export function commandeRetrait(doc: StudioDocument, ids: readonly string[]): StudioCommand[] {
  const presents = new Set((doc.graphismes ?? []).map((g) => g.id));
  const retenus = ids.filter((id) => presents.has(id));
  return retenus.length ? [{ toolId: "studio.graphisme.retirer", params: { ids: retenus } }] : [];
}

// ——— Système de projet ———

export interface SaisieSystemeProjet { x: string; y: string; rotation: string }

/** Commande de la version suivante du système de projet (origine du document dans le projet, rotation en degrés). */
export function commandeSystemeProjet(doc: StudioDocument, s: SaisieSystemeProjet): ResultatSaisie {
  const x = lireNombre(s.x), y = lireNombre(s.y), r = lireNombre(s.rotation);
  if (x === null || y === null || r === null) return { erreur: "Origine (X, Y) et rotation du système de projet sont à saisir." };
  const version = (doc.systemeProjet?.versions.length ?? 0) + 1;
  const params = { version, origine: { x, y }, rotation: deg(r) };
  try { validerVersionSystemeProjet(params, "systemeProjet"); } catch (e) { if (e instanceof StudioValidationError) return { erreur: `Système de projet refusé : ${e.message}` }; throw e; }
  return { commandes: [{ toolId: "studio.repere.projet", params }] };
}

/** Conversion affichée : point du document vers le projet (ou l'inverse), version en vigueur ; erreur dite sinon. */
export function convertir(doc: StudioDocument, sens: "vers-projet" | "depuis-projet", x: string, y: string): StudioPointConverti | { erreur: string } {
  const px = lireNombre(x), py = lireNombre(y);
  if (px === null || py === null) return { erreur: "Coordonnées à saisir (mètres)." };
  try {
    return sens === "vers-projet" ? studioVersProjet(doc.systemeProjet, { x: px, y: py }) : studioDepuisProjet(doc.systemeProjet, { x: px, y: py });
  } catch (e) {
    if (e instanceof StudioValidationError) return { erreur: "Système de projet non déclaré : aucune conversion n’est supposée." };
    throw e;
  }
}

/** Nombre affiché au millimètre, sans zéro négatif. */
export const metres = (v: number): string => { const r = Math.round(v * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toFixed(3); };
export const degres = (rad: number): string => { const r = Math.round(((rad * 180) / Math.PI) * 1e6) / 1e6; return String(Object.is(r, -0) ? 0 : r); };
