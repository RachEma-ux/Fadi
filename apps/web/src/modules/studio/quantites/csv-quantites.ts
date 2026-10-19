/**
 * Export CSV du métré Studio : UTF-8 avec BOM (lisible tel quel par un tableur), séparateur point-virgule, fins de ligne
 * CRLF, virgule ou point décimal au choix. Une ligne par grandeur d'objet, puis les totaux par calque et le total
 * général. « non évalué » est écrit en toutes lettres, jamais remplacé par zéro. Document produit : il reste en français.
 * Ajustements (E.3-05) : la valeur brute (« dérivée ») n'est jamais remplacée ; l'écart, le statut (en vigueur, retour,
 * à revoir), la révision de saisie et, pour un ajustement à revoir, la valeur proposée (non retenue) ont leurs colonnes.
 * Un ajustement à revoir dont la cible n'existe plus a sa propre ligne. Pur : ni React, ni DOM.
 */
import type { AjustementQuantiteEnregistre, QuantitesAjusteesEnregistrees, TotalAjusteEnregistre, ValeurAjusteeEnregistree } from "@parcours/atelier-model";
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
  "Écart d’ajustement", "Statut de l’ajustement", "Révision de l’ajustement", "Valeur à revoir (non retenue)",
] as const;

/** Statut d'un ajustement tel que le CSV l'écrit. */
export const STATUT_CSV = { enVigueur: "en vigueur", retour: "retour à la valeur dérivée", aRevoir: "à revoir : cible modifiée depuis sa révision", absente: "à revoir : cible absente de cette révision" } as const;

/** Forme lue par l'export : métré ajusté, ajustements enregistrés facultatifs. */
export type MetreExporte = Omit<QuantitesAjusteesEnregistrees, "evaluation" | "calquesAppliques"> & Partial<Pick<QuantitesAjusteesEnregistrees, "evaluation" | "calquesAppliques">>;
type CalqueExporte = MetreExporte["calques"][number];

const nomCalque = (c: Pick<CalqueExporte, "nom" | "implicite">) => (c.implicite ? "Calque par défaut" : c.nom);
const auteurDe = (a: AjustementQuantiteEnregistre) => a.auteurEmail || a.auteur;

/** Colonnes d'ajustement (motif, auteur, date) puis colonnes E.3-05 (écart, statut, révision, valeur à revoir). */
function colonnesAjustement(
  enVigueur: AjustementQuantiteEnregistre | undefined, aRevoir: AjustementQuantiteEnregistre | undefined, ecart: number | null | undefined, n: (x: number | null | undefined) => string,
): { trace: string[]; suite: string[] } {
  if (enVigueur) {
    return {
      trace: [enVigueur.motif, auteurDe(enVigueur), enVigueur.date],
      suite: [n(ecart), enVigueur.valeur === null ? STATUT_CSV.retour : STATUT_CSV.enVigueur, enVigueur.revisionId, ""],
    };
  }
  if (aRevoir) return { trace: [aRevoir.motif, auteurDe(aRevoir), aRevoir.date], suite: ["", STATUT_CSV.aRevoir, aRevoir.revisionId, aRevoir.valeur === null ? STATUT_CSV.retour : n(aRevoir.valeur)] };
  return { trace: [], suite: ["", "", "", ""] };
}

function ligneValeur(c: CalqueExporte, o: CalqueExporte["objets"][number], v: ValeurAjusteeEnregistree, d: SeparateurDecimal): string[] {
  const n = (x: number | null | undefined) => (x === null ? NON_EVALUE : x === undefined ? "" : nombreCsv(x, d));
  const a = v.ajustement;
  const remarque = v.derivee === null && v.motif ? `dérivée non évaluée : ${LIBELLE_MOTIF[v.motif]}` : a && a.valeur === null ? "retour à la valeur dérivée" : "";
  const { trace, suite } = colonnesAjustement(v.enregistre, v.aRevoir, v.ecart, n);
  const [motif, auteur, date] = v.enregistre || v.aRevoir ? trace : [a?.motif ?? "", a?.auteur ?? "", a?.date ?? ""];
  return [
    nomCalque(c), c.masque ? "oui" : "non", o.objetId, o.type, LIBELLE_NATURE[o.nature], LIBELLE_GRANDEUR[v.grandeur], SYMBOLE_UNITE[v.unite],
    n(v.derivee), n(v.ajustee), n(v.retenue), motif!, auteur!, date!, remarque, ...suite,
  ];
}

function ligneTotal(calque: string, masque: string, objet: string, t: TotalAjusteEnregistre, d: SeparateurDecimal, remarque = ""): string[] {
  const n = (x: number | null | undefined) => (x === null ? NON_EVALUE : x === undefined ? "" : nombreCsv(x, d));
  const notes = [t.nonEvalues ? `partiel : ${t.nonEvalues} non évalué(s)` : "", t.ajustes ? `${t.ajustes} ajusté(s)` : "", remarque].filter(Boolean).join(", ");
  const { trace, suite } = colonnesAjustement(t.ajustementCalque, t.aRevoirCalque, t.ecart, n);
  const [motif = "", auteur = "", date = ""] = trace;
  // Total général : l'écart reporte les totaux de calque ajustés (sans ligne d'ajustement propre).
  const suiteTotal = !t.ajustementCalque && !t.aRevoirCalque && t.ecart !== undefined ? [n(t.ecart), "", "", ""] : suite;
  return [calque, masque, objet, "", "", LIBELLE_GRANDEUR[t.grandeur], SYMBOLE_UNITE[t.unite], n(t.valeur), n(t.ajusteeCalque), n(t.retenue), motif, auteur, date, notes, ...suiteTotal];
}

export interface OptionsCsvQuantites { decimal: SeparateurDecimal }

export function csvQuantites(q: MetreExporte, { decimal }: OptionsCsvQuantites): string {
  const lignes: string[][] = [[...ENTETES_CSV]];
  for (const c of q.calques) {
    for (const o of c.objets) {
      if (!o.valeurs.length) {
        lignes.push([nomCalque(c), c.masque ? "oui" : "non", o.objetId, o.type, LIBELLE_NATURE[o.nature], "", "", NON_EVALUE, "", NON_EVALUE, "", "", "", o.motif ? LIBELLE_MOTIF[o.motif] : "", "", "", "", ""]);
        continue;
      }
      for (const v of o.valeurs) lignes.push(ligneValeur(c, o, v, decimal));
    }
    for (const t of c.totaux) lignes.push(ligneTotal(nomCalque(c), c.masque ? "oui" : "non", "TOTAL DU CALQUE", t, decimal));
  }
  for (const t of q.totaux) lignes.push(ligneTotal("", "", "TOTAL GÉNÉRAL", t, decimal, "quantités brutes, déductions non déclarées"));
  // Ajustements à revoir dont la cible n'existe plus dans cette révision : jamais omis en silence.
  for (const l of q.evaluation?.journal ?? []) {
    if (l.statut !== "a-revoir" || l.revue !== "cible-absente") continue;
    const a = l.ajustement;
    const n = (x: number | null) => (x === null ? NON_EVALUE : nombreCsv(x, decimal));
    lignes.push([
      a.cible.type === "calque" ? a.cible.id : "", "", a.cible.type === "objet" ? a.cible.id : "TOTAL DU CALQUE", "", "", LIBELLE_GRANDEUR[a.grandeur], SYMBOLE_UNITE[a.unite],
      "", "", "", a.motif, auteurDe(a), a.date, `${a.cible.type === "objet" ? "objet" : "calque"} absent de cette révision`,
      "", STATUT_CSV.absente, a.revisionId, a.valeur === null ? STATUT_CSV.retour : n(a.valeur),
    ]);
  }
  return BOM + lignes.map((l) => l.map(celluleCsv).join(SEPARATEUR_CSV)).join("\r\n") + "\r\n";
}

/** Nom de fichier sûr, dérivé de l'identifiant du document. */
export function nomFichierCsvQuantites(documentId: string): string {
  return `quantites-${documentId.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "studio"}.csv`;
}
