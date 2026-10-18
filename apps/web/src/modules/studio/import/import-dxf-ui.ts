/**
 * Lecture d'un fichier DXF pour la boîte « Importer DXF » : appel du lecteur pur `lireDxfStudio` sur le brouillon
 * courant, messages d'interface (français source, traduits par le dictionnaire) et libellés du rapport. Pur : ni React
 * ni DOM.
 */
import { lireDxfStudio, STUDIO_DXF_LIMITES, STUDIO_LIMITS, StudioValidationError, type StudioDocument, type StudioDxfResultat, type StudioDxfUnite } from "@parcours/atelier-model";

/** Unités proposées quand le fichier n'en déclare pas : aucune n'est présélectionnée. */
export const UNITES_PROPOSEES: readonly { valeur: StudioDxfUnite; libelle: string }[] = Object.freeze([
  { valeur: "mm", libelle: "Millimètres (mm)" },
  { valeur: "cm", libelle: "Centimètres (cm)" },
  { valeur: "m", libelle: "Mètres (m)" },
  { valeur: "in", libelle: "Pouces (in)" },
  { valeur: "ft", libelle: "Pieds (ft)" },
]);

export const TAILLE_MAX_OCTETS = STUDIO_DXF_LIMITES.octets;
export const MESSAGE_TROP_GROS = "Fichier trop volumineux : 5 Mo au plus.";

export type LectureDxf = { resultat: StudioDxfResultat } | { erreur: string };

/** Message d'interface pour un refus du lecteur ; jamais le message technique brut. */
export function messageImport(e: unknown): string {
  const m = e instanceof StudioValidationError ? e.message : "";
  if (m.includes("DXF binaire")) return "DXF binaire non pris en charge : enregistrez le fichier en DXF ASCII.";
  if (m.includes("Mo au plus")) return MESSAGE_TROP_GROS;
  if (m.includes("objets au plus")) return `L’import dépasserait la limite de ${STUDIO_LIMITS.objects} objets du document : rien n’est ajouté.`;
  if (m.includes("calques au plus")) return `L’import dépasserait la limite de ${STUDIO_LIMITS.layers} calques du document : rien n’est ajouté.`;
  const verrou = /calque verrouillé dans le document : (.*)$/.exec(m);
  if (verrou) return `Calque verrouillé dans le document : ${verrou[1]}. Déverrouillez-le avant l’import.`;
  if (m.includes("calque implicite")) return "Le calque implicite du document est verrouillé : déverrouillez-le avant l’import.";
  if (m.includes("nanomètre")) return "Un segment ou un rectangle devient nul après conversion : vérifiez l’unité.";
  return "Fichier DXF illisible : seul le DXF ASCII (R12 ou suivant) est lu.";
}

export function lireDxf(texte: string, document: StudioDocument, unite: StudioDxfUnite | null): LectureDxf {
  try {
    return { resultat: lireDxfStudio(texte, { document, ...(unite ? { unite } : {}) }) };
  } catch (e) {
    return { erreur: messageImport(e) };
  }
}

/** « LWPOLYLINE (segment courbe) » → type DXF (donnée, non traduit) et précision (texte d'interface). */
export function typeNonPris(type: string): { base: string; precision: string | null } {
  const m = /^(\S+) \((.+)\)$/.exec(type);
  return m ? { base: m[1]!, precision: m[2]! } : { base: type, precision: null };
}

export const CIBLES_CALQUE: Record<"implicite" | "existant" | "cree" | "sans-objet", string> = {
  implicite: "calque implicite",
  existant: "calque existant du même nom",
  cree: "nouveau calque",
  "sans-objet": "aucun objet importé, non créé",
};

/** Mètres affichés (6 décimales au plus, sans bruit) dans la langue de l'interface. */
export const metres = (v: number, locale: string): string => v.toLocaleString(locale, { maximumFractionDigits: 6 });
