/**
 * Lecture d'un fichier IFC pour la boîte « Importer IFC » (lot F3, TEST-028) : appel du lecteur pur `lireIfcStudio`
 * sur le brouillon courant, messages d'interface (français source, traduits par le dictionnaire) et libellés du
 * rapport de pertes et des éléments non natifs. Pur : ni React ni DOM.
 */
import {
  lireIfcStudio, STUDIO_LIMITS, StudioValidationError, studioSha256, type StudioDocument, type StudioIfcResultat, type StudioMotifPerteIfc, type StudioRaisonNonNatif,
  type StudioTransformationDeclaree,
} from "@parcours/atelier-model";

/** Lecture d'un IFC : résultat du lecteur, plus l'empreinte SHA-256 du texte lu (EX-014). */
export type LectureIfc = { resultat: StudioIfcResultat; empreinteSha256: string } | { erreur: string };

export const MESSAGE_IFC_ILLISIBLE = "Fichier IFC illisible : seul l’IFC en texte (STEP physique, IFC2X3, IFC4 ou IFC4X3) est lu.";

/** Message d'interface pour un refus du lecteur ; jamais le message technique brut (sauf le schéma lu, donnée). */
export function messageImportIfc(e: unknown): string {
  const m = e instanceof StudioValidationError ? e.message : "";
  if (m.includes("Mo au plus")) return "Fichier trop volumineux : 5 Mo au plus.";
  const schema = /schéma IFC non pris en charge : (\S+)/.exec(m);
  if (schema) return `Schéma IFC non pris en charge : ${schema[1]}. Schémas lus : IFC2X3, IFC4, IFC4X3.`;
  if (m.includes("éléments non natifs au plus")) return `L’import dépasserait la limite de ${STUDIO_LIMITS.objects} éléments non natifs du document : rien n’est ajouté.`;
  if (m.includes("objets au plus")) return `L’import dépasserait la limite de ${STUDIO_LIMITS.objects} objets du document : rien n’est ajouté.`;
  if (m.includes("calques au plus")) return `L’import dépasserait la limite de ${STUDIO_LIMITS.layers} calques du document : rien n’est ajouté.`;
  const verrou = /calque verrouillé dans le document : (.*)$/.exec(m);
  if (verrou) return `Calque verrouillé dans le document : ${verrou[1]}. Déverrouillez-le avant l’import.`;
  if (m.includes("calque implicite")) return "Le calque implicite du document est verrouillé : déverrouillez-le avant l’import.";
  return MESSAGE_IFC_ILLISIBLE;
}

export function lireIfc(texte: string, document: StudioDocument, transformation?: StudioTransformationDeclaree | null): LectureIfc {
  try {
    return { resultat: lireIfcStudio(texte, { document, ...(transformation ? { transformation } : {}) }), empreinteSha256: studioSha256(texte) };
  } catch (e) {
    return { erreur: messageImportIfc(e) };
  }
}

/** Raison de l'état non natif (texte d'interface). */
export const LIBELLES_RAISON_NON_NATIF: Readonly<Record<StudioRaisonNonNatif, string>> = Object.freeze({
  "type-sans-equivalent": "type sans équivalent natif",
  "representation-non-interpretable": "géométrie non interprétable",
  "placement-non-interpretable": "placement non interprétable",
  "hote-introuvable": "hôte introuvable",
  "dimensions-non-interpretables": "dimensions non interprétables",
});

/** Motif d'une perte (texte d'interface) ; absent : l'information n'est pas reprise. */
export const LIBELLES_MOTIF_PERTE: Readonly<Record<StudioMotifPerteIfc | "aucun", string>> = Object.freeze({
  aucun: "non repris",
  "prisme-libre": "prisme libre, sémantique non reprise",
  "axe-decale": "axe décalé du corps : axe central retenu",
  "remplissage-non-repris": "géométrie du remplissage non reprise",
  "instance-complexe": "instance complexe non lue",
});
