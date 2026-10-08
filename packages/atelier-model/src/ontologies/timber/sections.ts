/**
 * Sections de bois (P2-4, DA-09-01) — pur. Rectangle largeur × hauteur saisi (m) ou ligne d'un catalogue sourcé
 * (gabarit `sections-bois.csv` : designation, largeur_mm, hauteur_mm, essence, classe_resistance, type, source, edition,
 * page ; D-180). Essence et classe sont des noms déclarés : aucune propriété mécanique n'est connue du code.
 */
import type { SectionBois } from "../../modele.js";
import type { LigneCatalogue } from "../../catalogues/csv-source.js";

const mm = (v: string | number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v / 1000 : null);
const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function sectionBoisDepuisCatalogue(catalogueId: string, ligne: LigneCatalogue): SectionBois {
  const v = ligne.valeurs;
  const designation = String(v["designation"] ?? "").trim();
  if (!designation) throw new Error(`ligne ${ligne.numero} : désignation absente`);
  const largeur = mm(v["largeur_mm"]), hauteur = mm(v["hauteur_mm"]);
  if (largeur === null || largeur <= 0) throw new Error(`${designation} : largeur_mm absente du catalogue (non évaluée)`);
  if (hauteur === null || hauteur <= 0) throw new Error(`${designation} : hauteur_mm absente du catalogue (non évaluée)`);
  return {
    largeur: { value: largeur, unit: "m" },
    hauteur: { value: hauteur, unit: "m" },
    profil: { catalogueId, designation, source: `${ligne.source.source}, ${ligne.source.edition}, ${ligne.source.page}` },
    essence: texte(v["essence"]),
    classe: texte(v["classe_resistance"]) ?? texte(v["classe"]),
  };
}

export const designationBois = (s: SectionBois): string => s.profil?.designation ?? `${Math.round(s.largeur.value * 1000)} × ${Math.round(s.hauteur.value * 1000)} mm`;
export const aireBois = (s: SectionBois): number => s.largeur.value * s.hauteur.value;

/** Contour [y, z] centré d'une section rectangulaire (sens direct). */
export function contourBois(s: SectionBois): [number, number][] {
  const x = s.largeur.value / 2, y = s.hauteur.value / 2;
  return [[-x, -y], [x, -y], [x, y], [-x, y]];
}
