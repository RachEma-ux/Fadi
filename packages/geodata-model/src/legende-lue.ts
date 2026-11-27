/**
 * Légende lue d'un indicateur coloré (feuille de route équipe A, PR P9 ; carto-2 § 1.1, règles L1 à L5) : ce que
 * l'utilisateur lit, dans l'ordre de lecture — titre, unité, période, nature (L1) ; classification nommée (L2) ; classes
 * et absences ventilées par motif, jamais lues comme zéro (L3) ; source et statut provisoire (L4) ; lieu sélectionné
 * (L5). Pur, sans React ni réseau ; entrées structurelles (aucun type de l'interface).
 */
import { PALETTES_CLASSES, type EntreeLegende, type IdPalette, type MethodeClassification } from "./classification.js";
import { MOTIFS_ABSENCE, type MotifAbsence, type ValeurIndicateur } from "./valeurs.js";

export interface ClassificationLue {
  readonly methode: MethodeClassification;
  /** Nombre effectif de classes (moins que demandé quand les valeurs se répètent). */
  readonly classes: number;
  readonly palette: IdPalette;
  readonly decision: string;
}

export interface LegendeLue {
  readonly titre: string;
  readonly unite: string | null;
  readonly periode: { readonly texte: string; readonly origine: "indicateur" | "version" } | { readonly texte: null; readonly origine: "non-evaluee" };
  readonly nature: "source" | "calcule";
  readonly classification: ClassificationLue & { readonly natureP: "sequentielle" | "divergente" };
  /** Classes présentes, sans l'entrée « absente ». */
  readonly classes: readonly EntreeLegende[];
  readonly absences: { readonly effectif: number; readonly parMotif: readonly { readonly motif: MotifAbsence; readonly effectif: number }[] };
  /** Somme des classes et des absences : toutes les valeurs lues, chacune comptée une fois. */
  readonly valeursLues: number;
  readonly source: { readonly titre: string; readonly libelle: string; readonly attribution: string; readonly provisoire: boolean; readonly decision: string | null };
  readonly lieu: { readonly code: string; readonly classe: number | "absente"; readonly motif: MotifAbsence | null } | null;
}

/** Libellés des méthodes de classification (français source, traduits par le dictionnaire de l'interface). */
export const LIBELLES_METHODES: Readonly<Record<MethodeClassification, string>> = {
  quantiles: "Quantiles (effectifs égaux)", "intervalles-egaux": "Intervalles égaux", "seuils-naturels": "Seuils naturels (Jenks)", manuel: "Seuils manuels",
};

export function legendeLue(e: {
  indicateur: { titre: string; unite: string | null; periode: string | null; nature: "source" | "calcule" };
  version: { periode: string | null; libelle: string; attribution: string; source: { titre: string }; qualification?: { etat: string; decision?: string | null } };
  valeurs: ReadonlyMap<string, ValeurIndicateur>;
  /** Entrées de `colorationIndicateur` (l'entrée « absente » éventuelle comprise). */
  entrees: readonly EntreeLegende[];
  classification: ClassificationLue;
  /** Classe de chaque code (même calcul que les couleurs). */
  classeDe: ReadonlyMap<string, number | "absente">;
  /** Code sélectionné sur cette couche, ou null. */
  selection: string | null;
}): LegendeLue {
  const i = e.indicateur;
  const periode: LegendeLue["periode"] = i.periode?.trim() ? { texte: i.periode, origine: "indicateur" }
    : e.version.periode?.trim() ? { texte: e.version.periode, origine: "version" } : { texte: null, origine: "non-evaluee" };
  // Absences comptées depuis les valeurs elles-mêmes (jamais depuis un total annoncé) ; un motif sans effectif n'a pas de ligne.
  const parMotif = new Map<MotifAbsence, number>();
  let absentes = 0;
  for (const v of e.valeurs.values()) if (v.valeur === null) { absentes++; parMotif.set(v.motifAbsence, (parMotif.get(v.motifAbsence) ?? 0) + 1); }
  const motifs = (Object.keys(MOTIFS_ABSENCE) as MotifAbsence[]).flatMap((m) => (parMotif.get(m) ? [{ motif: m, effectif: parMotif.get(m)! }] : []));
  const classes = e.entrees.filter((x) => x.classe !== "absente");
  const q = e.version.qualification;
  const code = e.selection;
  const classe = code !== null ? e.classeDe.get(code) : undefined;
  const v = code !== null ? e.valeurs.get(code) : undefined;
  return {
    titre: i.titre, unite: i.unite || null, periode, nature: i.nature,
    classification: { ...e.classification, natureP: PALETTES_CLASSES[e.classification.palette].nature },
    classes,
    absences: { effectif: absentes, parMotif: motifs },
    valeursLues: classes.reduce((s, x) => s + x.effectif, 0) + absentes,
    source: { titre: e.version.source.titre, libelle: e.version.libelle, attribution: e.version.attribution, provisoire: q?.etat === "provisoire", decision: q?.etat === "provisoire" ? q.decision ?? null : null },
    lieu: code !== null && classe !== undefined ? { code, classe, motif: v && v.valeur === null ? v.motifAbsence : null } : null,
  };
}
