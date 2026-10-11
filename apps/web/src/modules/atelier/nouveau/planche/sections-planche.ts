/**
 * Sections des outils Profilé (lot L12, D-215) — adaptateur pur, sans React ni DOM.
 *
 * Trois sources, jamais de valeur supposée (R3, D-180) :
 * 1. une **ligne d'un catalogue du projet** (définition `catalogue` de l'Atelier, gabarits `profils-acier.csv` et
 *    `sections-bois.csv`) : les colonnes `_mm` sont converties en mètres par l'Atelier (`sectionDepuisCatalogue`), une
 *    cellule requise vide est refusée par son nom, jamais remplacée par zéro ; la source est copiée dans la pièce ;
 * 2. des **dimensions saisies** (mm) : un champ requis vide bloque (« dimension manquante ») ;
 * 3. une **face de la Planche** : son contour (trous compris) dans son plan.
 * Le rond et le rond creux sont facettisés avec le nombre de segments saisi (24 par défaut, relevé du Cercle).
 */
import {
  type FormeSection,
  type LigneCatalogue,
  type SectionStructure,
  contourBois,
  contourSection,
  designationSection,
  sectionBoisDepuisCatalogue,
  sectionDepuisCatalogue,
  trousSection,
} from "@parcours/atelier-model";
import { type Id, type Modele, type PointSection, type SectionCourante, type SectionProfil, baseDuPlan, contexte, dot, validerSection } from "@parcours/planche-model";

export type FormeSaisie = "rectangle" | "rond" | "rond-creux" | "tube" | "I" | "H" | "T" | "L" | "U";
export const FORMES_SAISIE: readonly FormeSaisie[] = ["rectangle", "rond", "rond-creux", "tube", "I", "H", "T", "L", "U"];

/** Formes saisies qui demandent une épaisseur (âme ou paroi) et une épaisseur d'aile. */
export const SAISIE_AVEC_EPAISSEUR: readonly FormeSaisie[] = ["rond-creux", "tube", "I", "H", "T", "L", "U"];
export const SAISIE_AVEC_AILE: readonly FormeSaisie[] = ["I", "H", "T", "U"];
export const SAISIE_AVEC_HAUTEUR: readonly FormeSaisie[] = ["rectangle", "tube", "I", "H", "T", "L", "U"];

/** Nombre de segments d'un rond par défaut : celui relevé pour le Cercle de la Planche. */
export const SEGMENTS_ROND_DEFAUT = 24;

export interface DimensionsSaisies {
  readonly forme: FormeSaisie;
  /** Largeur (ou diamètre d'un rond), hauteur, épaisseurs : texte du champ, en millimètres. */
  readonly largeur: string;
  readonly hauteur: string;
  readonly epaisseur: string;
  readonly epaisseurAile: string;
  /** Segments d'un rond, texte « 24 » ou « 24s » ; vide = défaut. */
  readonly segments: string;
}

export const DIMENSIONS_VIDES: DimensionsSaisies = { forme: "rectangle", largeur: "", hauteur: "", epaisseur: "", epaisseurAile: "", segments: "" };

/** Erreur nommée d'une section (dimension manquante, cellule vide…) : affichée telle quelle, rien n'est posé. */
export class ErreurSection extends Error {}

const NOMS_CHAMPS: Record<"largeur" | "hauteur" | "epaisseur" | "epaisseurAile", string> = { largeur: "largeur", hauteur: "hauteur", epaisseur: "épaisseur", epaisseurAile: "épaisseur d'aile" };

function millimetres(d: DimensionsSaisies, champ: keyof typeof NOMS_CHAMPS): number {
  const t = d[champ].trim().replace(",", ".");
  if (t === "") throw new ErreurSection(`Dimension manquante : ${NOMS_CHAMPS[champ]}.`);
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new ErreurSection(`Dimension invalide : ${NOMS_CHAMPS[champ]} « ${d[champ]} » (un nombre de millimètres positif).`);
  return n / 1000;
}

function segmentsDe(texte: string): number {
  const t = texte.trim().replace(/s$/i, "");
  if (t === "") return SEGMENTS_ROND_DEFAUT;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 3 || n > 999) throw new ErreurSection("Segments d'un rond : un entier de 3 à 999 (ex. 24 ou 24s).");
  return n;
}

const point = ([y, z]: readonly [number, number]): PointSection => ({ y, z });
const cercle = (rayon: number, n: number, sens: 1 | -1 = 1): PointSection[] => Array.from({ length: n }, (_, k) => ({ y: rayon * Math.cos((sens * 2 * Math.PI * k) / n), z: rayon * Math.sin((sens * 2 * Math.PI * k) / n) }));
const mmTexte = (m: number) => `${Math.round(m * 1e4) / 10}`.replace(".", ",");

/** Rond plein ou creux facettisé : contour direct, trou en sens inverse. */
function rond(diametre: number, epaisseur: number | null, n: number): SectionProfil {
  if (epaisseur !== null && epaisseur * 2 >= diametre) throw new ErreurSection("Épaisseur incompatible avec le diamètre du rond creux.");
  return { exterieur: cercle(diametre / 2, n), trous: epaisseur !== null ? [cercle(diametre / 2 - epaisseur, n, -1)] : [] };
}

/** Section polygonale (formes de l'Atelier) : contour et trous calculés par `contourSection` / `trousSection`. */
function polygonale(s: SectionStructure): SectionProfil {
  return { exterieur: contourSection(s).map(point), trous: trousSection(s).map((t) => t.map(point)) };
}

/** Section saisie : dimensions en millimètres, aucune valeur par défaut. */
export function sectionSaisie(d: DimensionsSaisies): SectionCourante {
  const largeur = millimetres(d, "largeur");
  let section: SectionProfil;
  let designation: string;
  if (d.forme === "rond" || d.forme === "rond-creux") {
    const n = segmentsDe(d.segments);
    const e = d.forme === "rond-creux" ? millimetres(d, "epaisseur") : null;
    section = rond(largeur, e, n);
    designation = `${d.forme === "rond" ? "Rond" : "Rond creux"} Ø ${mmTexte(largeur)}${e !== null ? ` e ${mmTexte(e)}` : ""} mm (${n} segments)`;
  } else {
    const hauteur = millimetres(d, "hauteur");
    const epaisseur = SAISIE_AVEC_EPAISSEUR.includes(d.forme) ? millimetres(d, "epaisseur") : null;
    const epaisseurAile = SAISIE_AVEC_AILE.includes(d.forme) ? millimetres(d, "epaisseurAile") : null;
    if (epaisseur !== null && epaisseur * 2 >= Math.min(largeur, hauteur)) throw new ErreurSection("Épaisseur incompatible avec les dimensions de la section.");
    if (epaisseurAile !== null && epaisseurAile * 2 >= hauteur) throw new ErreurSection("Épaisseur d'aile incompatible avec la hauteur de la section.");
    const s: SectionStructure = {
      forme: d.forme as FormeSection,
      largeur: { value: largeur, unit: "m" },
      hauteur: { value: hauteur, unit: "m" },
      epaisseur: epaisseur !== null ? { value: epaisseur, unit: "m" } : null,
      epaisseurAile: epaisseurAile !== null ? { value: epaisseurAile, unit: "m" } : null,
      profil: null,
      masseLineique: null,
    };
    section = polygonale(s);
    designation = designationSection(s);
  }
  validerSection(section);
  return { designation, section, source: { genre: "saisie" } };
}

/** Catalogue du projet vu par la Planche : identifiant, nom et lignes retenues à l'import. */
export interface CataloguePlanche {
  readonly id: string;
  readonly nom: string;
  readonly lignes: readonly LigneCatalogue[];
}

const valeurMm = (v: string | number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v / 1000 : null);

/**
 * Section d'une ligne de catalogue sourcé : profilés (forme lue ou déduite de la désignation, via l'Atelier), ronds
 * (creux si une épaisseur est donnée, facettisés en `segments`), sinon section de bois rectangulaire (gabarit
 * `sections-bois.csv`). Une cellule requise vide est refusée par son nom ; la source est copiée.
 */
export function sectionCatalogue(cat: CataloguePlanche, ligne: LigneCatalogue, segments = ""): SectionCourante {
  const v = ligne.valeurs;
  // Lot L14 : la masse linéique n'est copiée que si la même ligne sourcée la porte (jamais supposée).
  const masse = v["masse_kg_m"];
  const source = {
    genre: "catalogue" as const,
    source: ligne.source.source,
    edition: ligne.source.edition,
    page: ligne.source.page,
    ligne: String(ligne.numero),
    ...(typeof masse === "number" && Number.isFinite(masse) && masse > 0 ? { masseLineique: masse } : {}),
  };
  const designation = String(v["designation"] ?? "").trim();
  let section: SectionProfil;
  try {
    const s = sectionDepuisCatalogue(cat.id, ligne);
    if (s.forme === "cercle") {
      const e = valeurMm(v["epaisseur_ame_mm"]) ?? valeurMm(v["epaisseur_mm"]);
      section = rond(s.largeur.value, e, segmentsDe(segments));
    } else section = polygonale(s);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Gabarit bois : ni forme ni épaisseur — une section rectangulaire par nature (largeur × hauteur).
    if (!/forme de section non déterminable/.test(message)) throw new ErreurSection(message);
    try {
      section = { exterieur: contourBois(sectionBoisDepuisCatalogue(cat.id, ligne)).map(point), trous: [] };
    } catch (e2) {
      throw new ErreurSection(e2 instanceof Error ? e2.message : String(e2));
    }
  }
  validerSection(section);
  return { designation: designation || `${cat.nom}, ligne ${ligne.numero}`, section, source };
}

/** Section d'une face de la Planche : son contour et ses trous dans son plan, centrés sur sa boîte. */
export function sectionDepuisFace(m: Modele, face: Id, dans?: Id): SectionCourante {
  const c = contexte(m, dans);
  const f = c.faces[face];
  if (!f) throw new ErreurSection("Sélectionnez une face pour en faire la section.");
  const { u, w } = baseDuPlan(f.normale);
  const pos = (s: Id) => c.sommets[s]!.position;
  const p2 = (s: Id): PointSection => ({ y: dot(pos(s), u), z: dot(pos(s), w) });
  const ext = f.exterieur.map(p2);
  const ys = ext.map((p) => p.y);
  const zs = ext.map((p) => p.z);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const centrer = (p: PointSection): PointSection => ({ y: p.y - cy, z: p.z - cz });
  const section: SectionProfil = { exterieur: ext.map(centrer), trous: f.trous.map((b) => b.map(p2).map(centrer)) };
  validerSection(section);
  return { designation: `Contour de face (${f.exterieur.length} sommets${f.trous.length ? `, ${f.trous.length} trou${f.trous.length > 1 ? "s" : ""}` : ""})`, section, source: { genre: "saisie" } };
}

/** Texte de la source d'une pièce, pour l'Info entité : « saisie » ou « source, édition, page, ligne ». */
export function texteSource(s: SectionCourante["source"]): string {
  if (s.genre === "saisie") return "saisie";
  return [s.source, s.edition, s.page ? `p. ${s.page}` : null, s.ligne ? `ligne ${s.ligne}` : null].filter(Boolean).join(", ");
}
