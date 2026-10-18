/**
 * Export CSV du métré Studio : UTF-8 avec BOM (lisible tel quel par un tableur), séparateur point-virgule, fins de ligne
 * CRLF, virgule ou point décimal au choix. Une ligne par grandeur d'objet, puis les totaux par calque et le total
 * général. « non évalué » est écrit en toutes lettres, jamais remplacé par zéro. Document produit : il reste en français.
 * Pur : ni React, ni DOM.
 */
import type { CalqueAjuste, QuantitesAjustees, TotalAjuste, ValeurAjustee } from "@parcours/atelier-model";
import { LIBELLE_GRANDEUR, LIBELLE_MOTIF, LIBELLE_NATURE, NON_EVALUE, SYMBOLE_UNITE } from "./quantites-vue";

export const BOM = "﻿";
export const SEPARATEUR_CSV = ";";
export type SeparateurDecimal = "," | ".";

/**
 * Cellule texte : entre guillemets si elle contient le séparateur, un guillemet, un retour à la ligne ou des espaces de
 * bord (guillemets doublés). Une cellule commençant par = + - @ (ou une tabulation) est préfixée d'une apostrophe pour
 * qu'un tableur ne l'exécute jamais comme formule.
 */
export function celluleCsv(texte: string): string {
  const t = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return /[;"\r\n]/.test(t) || t !== t.trim() ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Nombre exporté : 6 décimales au plus (arrondi d'export, déterministe), sans zéros superflus. */
export function nombreCsv(v: number, decimal: SeparateurDecimal): string {
  let s = v.toFixed(6);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return decimal === "," ? s.replace(".", ",") : s;
}

export const ENTETES_CSV = [
  "Calque", "Calque masqué", "Objet", "Type", "Nature", "Grandeur", "Unité",
  "Valeur dérivée", "Valeur ajustée", "Valeur retenue", "Motif de l’ajustement", "Auteur", "Date", "Remarque",
] as const;

const nomCalque = (c: Pick<CalqueAjuste, "nom" | "implicite">) => (c.implicite ? "Calque par défaut" : c.nom);

function ligneValeur(c: CalqueAjuste, o: CalqueAjuste["objets"][number], v: ValeurAjustee, d: SeparateurDecimal): string[] {
  const n = (x: number | null | undefined) => (x === null ? NON_EVALUE : x === undefined ? "" : nombreCsv(x, d));
  const a = v.ajustement;
  const remarque = v.derivee === null && v.motif ? `dérivée non évaluée : ${LIBELLE_MOTIF[v.motif]}` : a && a.valeur === null ? "retour à la valeur dérivée" : "";
  return [
    nomCalque(c), c.masque ? "oui" : "non", o.objetId, o.type, LIBELLE_NATURE[o.nature], LIBELLE_GRANDEUR[v.grandeur], SYMBOLE_UNITE[v.unite],
    n(v.derivee), n(v.ajustee), n(v.retenue), a?.motif ?? "", a?.auteur ?? "", a?.date ?? "", remarque,
  ];
}

function ligneTotal(calque: string, masque: string, objet: string, t: TotalAjuste, d: SeparateurDecimal, remarque = ""): string[] {
  const n = (x: number | null) => (x === null ? NON_EVALUE : nombreCsv(x, d));
  const notes = [t.nonEvalues ? `partiel : ${t.nonEvalues} non évalué(s)` : "", t.ajustes ? `${t.ajustes} ajusté(s)` : "", remarque].filter(Boolean).join(", ");
  return [calque, masque, objet, "", "", LIBELLE_GRANDEUR[t.grandeur], SYMBOLE_UNITE[t.unite], n(t.valeur), "", n(t.retenue), "", "", "", notes];
}

export interface OptionsCsvQuantites { decimal: SeparateurDecimal }

export function csvQuantites(q: QuantitesAjustees, { decimal }: OptionsCsvQuantites): string {
  const lignes: string[][] = [[...ENTETES_CSV]];
  for (const c of q.calques) {
    for (const o of c.objets) {
      if (!o.valeurs.length) {
        lignes.push([nomCalque(c), c.masque ? "oui" : "non", o.objetId, o.type, LIBELLE_NATURE[o.nature], "", "", NON_EVALUE, "", NON_EVALUE, "", "", "", o.motif ? LIBELLE_MOTIF[o.motif] : ""]);
        continue;
      }
      for (const v of o.valeurs) lignes.push(ligneValeur(c, o, v, decimal));
    }
    for (const t of c.totaux) lignes.push(ligneTotal(nomCalque(c), c.masque ? "oui" : "non", "TOTAL DU CALQUE", t, decimal));
  }
  for (const t of q.totaux) lignes.push(ligneTotal("", "", "TOTAL GÉNÉRAL", t, decimal, "quantités brutes, déductions non déclarées"));
  return BOM + lignes.map((l) => l.map(celluleCsv).join(SEPARATEUR_CSV)).join("\r\n") + "\r\n";
}

/** Nom de fichier sûr, dérivé de l'identifiant du document. */
export function nomFichierCsvQuantites(documentId: string): string {
  return `quantites-${documentId.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "studio"}.csv`;
}
