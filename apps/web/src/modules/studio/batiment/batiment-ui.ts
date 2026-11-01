/**
 * Panneau « Bâtiment » (lot W3-B, X.1-04) — fonctions pures : constructeurs des commandes des quatre outils (Niveau,
 * Composant, Occurrence de composant, Élément structurel), « Rendre unique », lecture des niveaux et filtre de vue par
 * niveau. Aucune valeur n'est proposée : un champ vide refuse la création avec un message (aucune section, cote,
 * hauteur ni épaisseur par défaut, aucune constante normative). Pur : ni React ni DOM.
 *
 * Cote d'un élément rattaché : la valeur saisie « Cote de base » est **relative au niveau choisi** (hauteur au-dessus de
 * la cote du niveau) ; sans niveau, elle est la cote absolue. Le document reçoit toujours la cote absolue.
 */
import {
  studioCommandesRendreUnique, studioNiveauxParCote, STUDIO_SANS_NIVEAU,
  type StudioBeam, type StudioBox, type StudioColumn, type StudioCommand, type StudioComposant, type StudioDocument, type StudioNiveau, type StudioOccurrence, type StudioPoint, type StudioSlab,
} from "@parcours/atelier-model";
import { radiansOrientation } from "../planche2d/architecture/architecture-ui";

export type ResultatBatiment = { commandes: StudioCommand[] } | { erreur: string };
export interface ContexteBatiment { nouvelId: () => string; layerId: string | undefined }

const fini = (v: number) => Number.isFinite(v);

/** Niveaux du document par cote croissante. */
export const niveauxDu = (doc: StudioDocument | null): StudioNiveau[] => studioNiveauxParCote(doc?.niveaux);
export const composantsDu = (doc: StudioDocument | null): StudioComposant[] => doc?.composants ?? [];
export const occurrencesDu = (doc: StudioDocument | null): StudioOccurrence[] => doc?.occurrences ?? [];

/** Cote absolue d'une cote saisie relative au niveau `niveauId` (ou absolue sans niveau) ; null si le niveau est inconnu. */
export function coteAbsolue(doc: StudioDocument | null, niveauId: string, saisie: number): number | null {
  if (!niveauId) return saisie;
  const n = doc?.niveaux?.find((x) => x.id === niveauId);
  return n ? n.cote + saisie : null;
}

// ——— Niveau ———

export interface SaisieNiveau { id?: string; nom: string; cote: number }
export const ERREUR_NIVEAU = "Saisissez le nom et la cote du niveau (m) : aucune valeur n’est proposée.";

/** Niveau créé (identifiant nouveau) ou modifié (même identifiant : nom, cote ; ses objets suivent sa cote). */
export function commandeNiveau(c: ContexteBatiment, s: SaisieNiveau): ResultatBatiment {
  if (!s.nom.trim() || !fini(s.cote)) return { erreur: ERREUR_NIVEAU };
  return { commandes: [{ toolId: "studio.niveau.definir", params: { id: s.id ?? c.nouvelId(), nom: s.nom.trim(), cote: s.cote } }] };
}

export function commandeSupprimerNiveau(id: string): StudioCommand[] {
  return [{ toolId: "studio.dessin.supprimer", params: { ids: [id] } }];
}

// ——— Composant ———

/**
 * Solides d'une définition saisis au clavier : une boîte par ligne, « x y z largeur profondeur hauteur » (repère local
 * du composant, mètres). Rien n'est complété : une ligne incomplète refuse la saisie.
 */
export function lireBoites(texte: string): StudioBox[] | null {
  const lignes = texte.split(/[;\n]+/).map((t) => t.trim()).filter(Boolean);
  if (!lignes.length) return null;
  const nombre = (v: string) => (/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(v) ? Number(v.replace(",", ".")) : Number.NaN);
  const boites: StudioBox[] = [];
  for (const [i, l] of lignes.entries()) {
    const v = l.split(/\s+/).map(nombre);
    if (v.length !== 6 || !v.every(fini)) return null;
    boites.push({ id: `s${i + 1}`, type: "box", placement: { origin: { x: v[0]!, y: v[1]!, z: v[2]! }, rotation: 0 }, width: v[3]!, depth: v[4]!, height: v[5]! });
  }
  return boites;
}
export const ecrireBoites = (c: StudioComposant): string => c.solides.map((s) => s.type === "box" ? `${s.placement.origin.x} ${s.placement.origin.y} ${s.placement.origin.z} ${s.width} ${s.depth} ${s.height}` : `# prisme ${s.id}`).join("; ");

export interface SaisieComposant { id?: string; nom: string; boites: string }
export const ERREUR_COMPOSANT = "Saisissez le nom du composant et ses boîtes, « x y z largeur profondeur hauteur » (m), une par ligne : aucune dimension n’est proposée.";

/**
 * Définition créée ou modifiée (même identifiant : toutes ses occurrences changent). Une définition qui a des prismes
 * (saisis par commande) garde ses prismes : seules ses boîtes viennent de la saisie.
 */
export function commandeComposant(c: ContexteBatiment, s: SaisieComposant, existant?: StudioComposant): ResultatBatiment {
  const boites = lireBoites(s.boites.split(/[;\n]+/).filter((l) => !l.trim().startsWith("#")).join("\n"));
  if (!s.nom.trim() || !boites) return { erreur: ERREUR_COMPOSANT };
  const prismes = (existant?.solides ?? []).filter((x) => x.type === "prism");
  const solides = [...boites.map((b, i) => ({ ...b, id: `s${i + 1}` })), ...prismes];
  return { commandes: [{ toolId: "studio.composant.definir", params: { id: s.id ?? c.nouvelId(), nom: s.nom.trim(), solides } }] };
}

// ——— Occurrence ———

export interface SaisieOccurrence { id?: string; composantId: string; niveauId: string; x: number; y: number; z: number; orientation: number }
export const ERREUR_OCCURRENCE = "Choisissez le composant et saisissez l’origine (x, y, cote) et l’orientation (degrés) de l’occurrence : aucune valeur n’est proposée.";

/** Occurrence placée (ou replacée, même identifiant) ; la cote saisie est relative au niveau choisi. */
export function commandeOccurrence(c: ContexteBatiment, doc: StudioDocument | null, s: SaisieOccurrence, existante?: StudioOccurrence): ResultatBatiment {
  if (!s.composantId || ![s.x, s.y, s.z, s.orientation].every(fini)) return { erreur: ERREUR_OCCURRENCE };
  const z = coteAbsolue(doc, s.niveauId, s.z);
  if (z === null) return { erreur: "Niveau introuvable." };
  const layerId = existante ? existante.layerId : c.layerId;
  const params: StudioOccurrence = {
    id: s.id ?? c.nouvelId(), type: "occurrence", composantId: s.composantId, ...(layerId ? { layerId } : {}), ...(s.niveauId ? { niveauId: s.niveauId } : {}),
    placement: { origin: { x: s.x, y: s.y, z }, rotation: radiansOrientation(s.orientation) },
  };
  return { commandes: [{ toolId: "studio.composant.placer", params }] };
}

/** Rendre unique : copie de la définition sous un nouvel identifiant, puis l'occurrence replacée sur elle, en un lot. */
export function commandeRendreUnique(c: ContexteBatiment, doc: StudioDocument, occurrenceId: string): ResultatBatiment {
  const o = occurrencesDu(doc).find((x) => x.id === occurrenceId);
  const d = o && composantsDu(doc).find((x) => x.id === o.composantId);
  if (!o || !d) return { erreur: "Occurrence ou définition introuvable." };
  const nom = `${d.nom} (unique)`.slice(0, 80);
  return { commandes: studioCommandesRendreUnique(composantsDu(doc), o, c.nouvelId(), nom) };
}

// ——— Élément structurel ———

export type TypeStructure = "column" | "beam" | "slab";
export const LIBELLES_TYPE_STRUCTURE: Readonly<Record<TypeStructure, string>> = { column: "Poteau", beam: "Poutre", slab: "Dalle" };

/** Saisie d'un élément structurel : géométrie en texte « x y ; … », dimensions en mètres, cote relative au niveau choisi. */
export interface SaisieStructure {
  type: TypeStructure | "";
  niveauId: string;
  /** Poteau : un point (centre de la section) ; poutre : deux points (axe) ; dalle : trois points au moins (contour). */
  geometrie: string;
  largeur: number;
  /** Poteau : profondeur de section. */
  profondeur: number;
  /** Poteau : hauteur ; poutre : hauteur de section ; dalle : épaisseur. */
  hauteur: number;
  base: number;
  /** Poteau : orientation de la largeur (degrés). */
  orientation: number;
}
export const SAISIE_STRUCTURE_VIDE: SaisieStructure = Object.freeze({ type: "", niveauId: "", geometrie: "", largeur: Number.NaN, profondeur: Number.NaN, hauteur: Number.NaN, base: Number.NaN, orientation: Number.NaN });
export const ERREUR_STRUCTURE = "Choisissez le type (poteau, poutre, dalle) et saisissez sa géométrie, sa section ou son épaisseur et sa cote (m) : aucune valeur n’est proposée.";

export function commandeStructure(c: ContexteBatiment, doc: StudioDocument | null, s: SaisieStructure, lireSommets: (t: string) => StudioPoint[] | null): ResultatBatiment {
  if (!s.type || !fini(s.hauteur) || !fini(s.base)) return { erreur: ERREUR_STRUCTURE };
  const points = lireSommets(s.geometrie);
  const base = coteAbsolue(doc, s.niveauId, s.base);
  if (base === null) return { erreur: "Niveau introuvable." };
  const commun = { id: c.nouvelId(), ...(c.layerId ? { layerId: c.layerId } : {}), ...(s.niveauId ? { niveauId: s.niveauId } : {}), base };
  if (s.type === "column") {
    if (!points || points.length !== 1) return { erreur: "Poteau : saisissez le centre de la section, « x y », en mètres." };
    if (![s.largeur, s.profondeur, s.orientation].every(fini)) return { erreur: ERREUR_STRUCTURE };
    const params: StudioColumn = { ...commun, type: "column", position: points[0]!, rotation: radiansOrientation(s.orientation), width: s.largeur, depth: s.profondeur, height: s.hauteur };
    return { commandes: [{ toolId: "studio.structure.element", params }] };
  }
  if (s.type === "beam") {
    if (!points || points.length !== 2) return { erreur: "Poutre : saisissez les deux points de l’axe, « x y ; x y », en mètres." };
    if (!fini(s.largeur)) return { erreur: ERREUR_STRUCTURE };
    const params: StudioBeam = { ...commun, type: "beam", start: points[0]!, end: points[1]!, width: s.largeur, height: s.hauteur };
    return { commandes: [{ toolId: "studio.structure.element", params }] };
  }
  if (!points || points.length < 3) return { erreur: "Dalle : saisissez trois points au moins du contour, « x y ; x y ; x y », en mètres." };
  const params: StudioSlab = { ...commun, type: "slab", contour: points, thickness: s.hauteur };
  return { commandes: [{ toolId: "studio.structure.element", params }] };
}

// ——— Vue par niveau ———

/** Choix de vue : tous les niveaux (null), un niveau, ou les objets sans niveau. */
export type ChoixVueNiveau = string | null;
export const VUE_SANS_NIVEAU = STUDIO_SANS_NIVEAU;
/** Le choix courant reste-t-il valable pour ce document (un niveau supprimé revient à « tous ») ? */
export const choixVueValide = (doc: StudioDocument | null, choix: ChoixVueNiveau): ChoixVueNiveau =>
  choix === null || choix === VUE_SANS_NIVEAU || doc?.niveaux?.some((n) => n.id === choix) ? choix : null;
