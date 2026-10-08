/**
 * Sections d'éléments de structure (P2-3, DA-08-06 à 09) — pur. Une section est saisie (forme et dimensions, m) ou
 * copiée d'une ligne de catalogue sourcé (D-180 : désignation, hauteur_mm, largeur_mm, épaisseurs, masse_kg_m, avec
 * source / édition / page). Aucune valeur n'est connue du code : un profilé sans catalogue se saisit dimension par
 * dimension. Le contour de la section est exprimé dans le repère local (y : largeur, z : hauteur), centré.
 */
import type { FormeSection, SectionStructure } from "../../modele.js";
import type { LigneCatalogue } from "../../catalogues/csv-source.js";

export const FORMES_SECTION: readonly FormeSection[] = ["rectangle", "cercle", "I", "H", "T", "L", "U", "tube"];
export const LIBELLES_FORME: Record<FormeSection, string> = { rectangle: "Rectangle", cercle: "Cercle", I: "Profilé I", H: "Profilé H", T: "Profilé T", L: "Cornière L", U: "Profilé U", tube: "Tube" };

/** Formes qui exigent une épaisseur d'âme / de paroi. */
export const AVEC_EPAISSEUR: readonly FormeSection[] = ["I", "H", "T", "L", "U", "tube"];
/** Formes qui exigent une épaisseur d'aile. */
export const AVEC_AILE: readonly FormeSection[] = ["I", "H", "T", "U"];

/** Contour fermé de la section (sens direct), coordonnées [y, z] en m, centré sur l'axe de l'élément. */
export function contourSection(s: SectionStructure): [number, number][] {
  const w = s.largeur.value, h = s.hauteur.value;
  const x = w / 2, y = h / 2;
  const t = s.epaisseur?.value ?? 0, ta = s.epaisseurAile?.value ?? t;
  const hx = t / 2;
  switch (s.forme) {
    case "cercle":
      return Array.from({ length: 32 }, (_, k) => [x * Math.cos((2 * Math.PI * k) / 32), x * Math.sin((2 * Math.PI * k) / 32)] as [number, number]);
    case "tube": {
      // Tube rectangulaire creux : contour extérieur seulement (le vide est porté par `trous`).
      return [[-x, -y], [x, -y], [x, y], [-x, y]];
    }
    case "I":
    case "H":
      return [[-x, -y], [x, -y], [x, -y + ta], [hx, -y + ta], [hx, y - ta], [x, y - ta], [x, y], [-x, y], [-x, y - ta], [-hx, y - ta], [-hx, -y + ta], [-x, -y + ta]];
    case "T":
      return [[-hx, -y], [hx, -y], [hx, y - ta], [x, y - ta], [x, y], [-x, y], [-x, y - ta], [-hx, y - ta]];
    case "L":
      return [[-x, -y], [x, -y], [x, -y + t], [-x + t, -y + t], [-x + t, y], [-x, y]];
    case "U":
      return [[-x, -y], [x, -y], [x, y], [x - ta, y], [x - ta, -y + t], [-x + ta, -y + t], [-x + ta, y], [-x, y]];
    case "rectangle":
    default:
      return [[-x, -y], [x, -y], [x, y], [-x, y]];
  }
}

/** Trous de la section (tube creux) ; vide sinon. */
export function trousSection(s: SectionStructure): [number, number][][] {
  if (s.forme !== "tube" || !s.epaisseur) return [];
  const t = s.epaisseur.value;
  const x = s.largeur.value / 2 - t, y = s.hauteur.value / 2 - t;
  if (x <= 0 || y <= 0) return [];
  return [[[-x, -y], [-x, y], [x, y], [x, -y]]];
}

const aireSignee = (p: readonly [number, number][]) => p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]!; return s + x * v - u * y; }, 0) / 2;

/** Aire de la section (m²), toujours dérivée du contour (jamais lue d'un catalogue). */
export function aireSection(s: SectionStructure): number {
  return Math.abs(aireSignee(contourSection(s))) - trousSection(s).reduce((a, t) => a + Math.abs(aireSignee(t)), 0);
}

/** Forme déduite d'une désignation de catalogue quand la colonne `forme` manque (IPE, HE → I/H ; UPN, UPE → U ; L → L ; tube/RHS/SHS/CHS). */
export function formeDepuisDesignation(designation: string): FormeSection | null {
  const d = designation.trim().toUpperCase();
  if (/^(IPE|IPN|INP)/.test(d)) return "I";
  if (/^(HE|HD|HL|HP|W)/.test(d)) return "H";
  if (/^(UPN|UPE|UAP|U\s?\d|C\d)/.test(d)) return "U";
  if (/^(L\s?\d|L\d)/.test(d)) return "L";
  if (/^(T\s?\d|T\d)/.test(d)) return "T";
  if (/^(RHS|SHS|TUBE|TR|TC)/.test(d)) return "tube";
  if (/^(CHS|ROND)/.test(d)) return "cercle";
  return null;
}

const mm = (v: string | number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v / 1000 : null);

/**
 * Section depuis une ligne de catalogue sourcé : colonnes `designation`, `hauteur_mm`, `largeur_mm`, facultatives
 * `epaisseur_ame_mm`, `epaisseur_aile_mm`, `masse_kg_m`, `forme`. Une dimension requise absente : erreur nommée
 * (jamais zéro, jamais supposée).
 */
export function sectionDepuisCatalogue(catalogueId: string, ligne: LigneCatalogue): SectionStructure {
  const v = ligne.valeurs;
  const designation = String(v["designation"] ?? "").trim();
  if (!designation) throw new Error(`ligne ${ligne.numero} : désignation absente`);
  const formeBrute = typeof v["forme"] === "string" ? v["forme"].trim() : "";
  const forme = (FORMES_SECTION as readonly string[]).includes(formeBrute) ? (formeBrute as FormeSection) : formeDepuisDesignation(designation);
  if (!forme) throw new Error(`${designation} : forme de section non déterminable (ajouter la colonne « forme » au catalogue)`);
  const hauteur = mm(v["hauteur_mm"]);
  const largeur = forme === "cercle" ? hauteur : mm(v["largeur_mm"]);
  if (hauteur === null || hauteur <= 0) throw new Error(`${designation} : hauteur_mm absente du catalogue (non évaluée)`);
  if (largeur === null || largeur <= 0) throw new Error(`${designation} : largeur_mm absente du catalogue (non évaluée)`);
  const epaisseur = mm(v["epaisseur_ame_mm"]) ?? mm(v["epaisseur_mm"]);
  const epaisseurAile = mm(v["epaisseur_aile_mm"]);
  if (AVEC_EPAISSEUR.includes(forme) && (epaisseur === null || epaisseur <= 0)) throw new Error(`${designation} : epaisseur_ame_mm absente du catalogue (non évaluée)`);
  if (AVEC_AILE.includes(forme) && (epaisseurAile === null || epaisseurAile <= 0)) throw new Error(`${designation} : epaisseur_aile_mm absente du catalogue (non évaluée)`);
  const masse = v["masse_kg_m"];
  return {
    forme,
    largeur: { value: largeur, unit: "m" },
    hauteur: { value: hauteur, unit: "m" },
    epaisseur: AVEC_EPAISSEUR.includes(forme) ? { value: epaisseur!, unit: "m" } : null,
    epaisseurAile: AVEC_AILE.includes(forme) ? { value: epaisseurAile!, unit: "m" } : null,
    profil: { catalogueId, designation, source: `${ligne.source.source}, ${ligne.source.edition}, ${ligne.source.page}` },
    masseLineique: typeof masse === "number" && Number.isFinite(masse) && masse > 0 ? masse : null,
  };
}

/** Désignation lisible d'une section (catalogue ou saisie). */
export function designationSection(s: SectionStructure): string {
  if (s.profil) return s.profil.designation;
  const d = (x: number) => `${Math.round(x * 1000)}`;
  const base = s.forme === "cercle" ? `Ø ${d(s.largeur.value)}` : `${d(s.largeur.value)} × ${d(s.hauteur.value)}`;
  return `${LIBELLES_FORME[s.forme]} ${base}${s.epaisseur ? ` e ${d(s.epaisseur.value)}` : ""} mm`;
}
