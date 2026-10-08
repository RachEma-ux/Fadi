/**
 * Catalogues sourcés (D-180) — pur.
 *
 * Un catalogue d'ontologie P2 (profilés acier, tubes, sections bois, table de pliage) est importé depuis un CSV dont
 * chaque ligne porte sa source : colonnes `source`, `edition`, `page` obligatoires et non vides. Une ligne sans source
 * est refusée nominativement ; le fichier entier est refusé dès qu'une ligne l'est (rien n'est importé partiellement,
 * R3 : rien d'inventé). Les colonnes numériques (suffixes `_mm`, `_kg_m`, `_deg`, `facteur_k`) doivent être des nombres
 * (virgule ou point décimal) ; une cellule vide devient `null` (« non évaluée »), jamais zéro.
 */

export const COLONNES_SOURCE = ["source", "edition", "page"] as const;

export interface LigneCatalogue {
  numero: number;
  valeurs: Record<string, string | number | null>;
  source: { source: string; edition: string; page: string };
}

export interface RapportCatalogueCsv {
  colonnes: string[];
  lignes: number;
  retenues: LigneCatalogue[];
  refus: { ligne: number; motif: string }[];
  /** Vrai si et seulement si aucune ligne n'est refusée : alors seulement le catalogue peut être importé. */
  importable: boolean;
}

function cellules(ligne: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let guil = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i]!;
    if (guil) {
      if (ch === '"' && ligne[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') guil = false;
      else cur += ch;
    } else if (ch === '"') guil = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const normaliser = (c: string): string =>
  c
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export const estColonneNumerique = (colonne: string): boolean => /(_mm|_kg_m|_deg|^facteur_k)$/.test(colonne);

/** Nombre à virgule ou point décimal ; `null` si la chaîne n'est pas un nombre. */
export function lireNombre(texte: string): number | null {
  const t = texte.replace(/\s/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

export function validerCatalogueCsv(texte: string, colonnesAttendues?: readonly string[]): RapportCatalogueCsv {
  // Lignes physiques du fichier : les lignes vides sont ignorées sans renuméroter les suivantes, un refus désigne
  // la ligne telle que l'éditeur de la source la voit (contrat des catalogues, D-180).
  const physiques = texte
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l, i) => ({ l, numero: i + 1 }))
    .filter(({ l }) => l.trim() !== "");
  if (!physiques.length) throw new Error("Fichier vide.");
  const entete = physiques[0]!.l;
  const sep = (entete.match(/;/g)?.length ?? 0) >= (entete.match(/,/g)?.length ?? 0) ? ";" : ",";
  const colonnes = cellules(entete, sep).map(normaliser);
  for (const c of COLONNES_SOURCE) if (!colonnes.includes(c)) throw new Error(`Colonne obligatoire absente de l'en-tête : « ${c} ».`);
  if (colonnesAttendues) for (const c of colonnesAttendues) if (!colonnes.includes(normaliser(c))) throw new Error(`Colonne attendue absente de l'en-tête : « ${c} ».`);
  const refus: RapportCatalogueCsv["refus"] = [];
  const retenues: LigneCatalogue[] = [];
  for (let i = 1; i < physiques.length; i++) {
    const { l: ligne, numero } = physiques[i]!;
    const cells = cellules(ligne, sep);
    if (cells.length !== colonnes.length) {
      refus.push({ ligne: numero, motif: `${cells.length} cellule(s) pour ${colonnes.length} colonne(s).` });
      continue;
    }
    const valeurs: Record<string, string | number | null> = {};
    const motifs: string[] = [];
    colonnes.forEach((c, k) => {
      const brut = cells[k]!;
      if ((COLONNES_SOURCE as readonly string[]).includes(c)) {
        if (brut === "") motifs.push(`« ${c} » vide`);
        valeurs[c] = brut;
      } else if (estColonneNumerique(c)) {
        if (brut === "") valeurs[c] = null;
        else {
          const n = lireNombre(brut);
          if (n === null) motifs.push(`« ${c} » n'est pas un nombre (« ${brut} »)`);
          valeurs[c] = n;
        }
      } else valeurs[c] = brut;
    });
    if (motifs.length) {
      refus.push({ ligne: numero, motif: motifs.join(" ; ") + "." });
      continue;
    }
    retenues.push({ numero, valeurs, source: { source: String(valeurs.source), edition: String(valeurs.edition), page: String(valeurs.page) } });
  }
  return { colonnes, lignes: physiques.length - 1, retenues, refus, importable: refus.length === 0 };
}
