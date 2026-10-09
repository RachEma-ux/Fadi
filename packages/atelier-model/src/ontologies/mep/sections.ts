/**
 * Sections de réseau (P2-5, DA-12-05, 17, 18, 19) — pur. Section circulaire (diamètre extérieur, épaisseur) ou
 * rectangulaire saisie en mètres, ou ligne d'un catalogue sourcé (gabarit `tubes-raccords.csv` : designation,
 * diametre_exterieur_mm, epaisseur_mm, diametre_nominal, fluide, materiau, source, edition, page ; D-180). Aucun
 * diamètre nominal, aucune épaisseur ni pression n'est connu du code : tout vient du projet ou de sa source.
 */
import type { ProfilReseau, SectionReseau } from "../../modele.js";
import type { LigneCatalogue } from "../../catalogues/csv-source.js";

const mm = (v: string | number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v / 1000 : null);
const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export interface SectionCatalogueReseau {
  section: SectionReseau;
  profil: ProfilReseau;
  fluide: string | null;
  materiau: string | null;
}

/** Ligne du catalogue → section circulaire sourcée (diamètre extérieur requis, épaisseur facultative). */
export function sectionReseauDepuisCatalogue(catalogueId: string, ligne: LigneCatalogue): SectionCatalogueReseau {
  const v = ligne.valeurs;
  const designation = String(v["designation"] ?? "").trim();
  if (!designation) throw new Error(`ligne ${ligne.numero} : désignation absente`);
  const d = mm(v["diametre_exterieur_mm"]);
  if (d === null || d <= 0) throw new Error(`${designation} : diametre_exterieur_mm absent du catalogue (non évalué)`);
  const e = mm(v["epaisseur_mm"]);
  if (e !== null && e * 2 >= d) throw new Error(`${designation} : épaisseur ${Math.round(e * 1000)} mm incompatible avec le diamètre ${Math.round(d * 1000)} mm`);
  return {
    section: { forme: "circulaire", diametre: { value: d, unit: "m" }, epaisseur: e !== null && e > 0 ? { value: e, unit: "m" } : null },
    profil: { catalogueId, designation, source: `${ligne.source.source}, ${ligne.source.edition}, ${ligne.source.page}`, diametreNominal: texte(v["diametre_nominal"]) },
    fluide: texte(v["fluide"]),
    materiau: texte(v["materiau"]),
  };
}

/** Désignation lisible : DN du catalogue, sinon Ø ou l × h en millimètres. */
export function designationReseau(s: SectionReseau, profil: ProfilReseau | null = null): string {
  if (profil) return profil.diametreNominal ? `${profil.designation} (${profil.diametreNominal})` : profil.designation;
  return s.forme === "circulaire" ? `Ø ${Math.round(s.diametre.value * 1000)}${s.epaisseur ? ` × ${Math.round(s.epaisseur.value * 10000) / 10} ` : " "}mm` : `${Math.round(s.largeur.value * 1000)} × ${Math.round(s.hauteur.value * 1000)} mm`;
}

/** Deux sections sont égales à 1 mm près (même forme, mêmes dimensions). */
export function sectionsEgales(a: SectionReseau, b: SectionReseau, tol = 0.001): boolean {
  if (a.forme !== b.forme) return false;
  if (a.forme === "circulaire" && b.forme === "circulaire") return Math.abs(a.diametre.value - b.diametre.value) <= tol;
  if (a.forme === "rectangulaire" && b.forme === "rectangulaire") return Math.abs(a.largeur.value - b.largeur.value) <= tol && Math.abs(a.hauteur.value - b.hauteur.value) <= tol;
  return false;
}

/** Aire de la section de passage (m²) : disque intérieur (diamètre − 2 e) ou rectangle. */
export function airePassage(s: SectionReseau): number {
  if (s.forme === "rectangulaire") return s.largeur.value * s.hauteur.value;
  const di = s.diametre.value - 2 * (s.epaisseur?.value ?? 0);
  return (Math.PI * di * di) / 4;
}

/** Demi-dimensions d'encombrement (n, w) de la section : rayon ou demi-largeur / demi-hauteur. */
export function encombrement(s: SectionReseau): { dn: number; dw: number } {
  return s.forme === "circulaire" ? { dn: s.diametre.value / 2, dw: s.diametre.value / 2 } : { dn: s.largeur.value / 2, dw: s.hauteur.value / 2 };
}
