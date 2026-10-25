import { comparerDocumentsStudio, comparerElementsStudio, type StudioCompteDifferences, type StudioDifferenceElement, type StudioFamilleElement } from "../comparaison.js";
import { applyStudioCommands } from "../composition/commandes.js";
import { newStudioDocument, validateStudioDocument } from "../composition/document.js";
import type { StudioDocument } from "../composition/types.js";
import { lireIfcStudio, validerTransformation, type StudioIfcRapport, type StudioTransformationDeclaree } from "../import-ifc/import-ifc.js";
import { StudioValidationError } from "../noyau/validation.js";

/**
 * Modèles externes (partenaires) d'une variante Studio (lot F3, TR-EX-066) : règles pures du circuit
 * **réception → comparaison → acceptation ou refus**. Le serveur (`apps/api/src/lib/studio-modeles-externes.ts`) les
 * applique sous transaction, journalise chaque passage et vérifie le rôle ; rien ici ne lit ni n'écrit de base.
 *
 * - Un modèle reçu est **référencé** avec ce que son émetteur déclare : référence, auteur, discipline, format, version,
 *   unité et, s'il y en a une, transformation (translation et rotation autour de z vers le repère local de la
 *   variante). Rien n'est deviné : sans transformation déclarée, aucune n'est appliquée (et la comparaison le dit).
 * - Le fichier est lu par le lecteur pur (`lireIfcStudio`) dans un document **à part** : un modèle reçu, comparé ou
 *   refusé ne modifie jamais la variante. L'unité est celle **lue** dans le fichier ; l'unité déclarée qui la contredit
 *   est un écart signalé, jamais une correction.
 * - La comparaison réutilise `comparerDocumentsStudio` (objets, calques, cotes) et `comparerElementsStudio` (murs,
 *   ouvertures, solides, éléments non natifs), de la révision courante (avant) vers le modèle reçu (après), par
 *   identifiant : les identifiants IFC (`ifc-<GlobalId>`) sont stables d'une version à l'autre d'un même modèle.
 * - Acceptation ou refus : décisions explicites d'un rôle habilité (propriétaire), sur une comparaison faite avec la
 *   révision courante ; un refus porte un motif. Les deux sont définitives pour cette réception (une nouvelle version
 *   est une nouvelle réception). Accepter ne fusionne rien : le modèle devient une référence acceptée, que
 *   l'utilisateur peut ensuite ajouter à son brouillon par l'import, explicitement.
 */

export const STUDIO_FORMATS_MODELE_EXTERNE = ["ifc"] as const;
export type StudioFormatModeleExterne = (typeof STUDIO_FORMATS_MODELE_EXTERNE)[number];
/** Unités qu'un émetteur peut déclarer (comparées au facteur lu dans le fichier). */
export const STUDIO_UNITES_DECLAREES = Object.freeze({ m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 } as const);
export type StudioUniteDeclaree = keyof typeof STUDIO_UNITES_DECLAREES;

export const STUDIO_STATUTS_MODELE_EXTERNE = ["compare", "accepte", "refuse"] as const;
export type StudioStatutModeleExterne = (typeof STUDIO_STATUTS_MODELE_EXTERNE)[number];
export const STUDIO_ACTIONS_MODELE_EXTERNE = ["comparer", "accepter", "refuser"] as const;
export type StudioActionModeleExterne = (typeof STUDIO_ACTIONS_MODELE_EXTERNE)[number];

/** Bornes techniques des champs déclarés (pas des valeurs métier). */
export const STUDIO_LIMITES_MODELE_EXTERNE = Object.freeze({ reference: 200, auteur: 200, discipline: 80, version: 80, nomFichier: 255, motif: 2000 } as const);

export interface StudioMetaModeleExterne {
  /** Nom du modèle chez l'émetteur (« Structure — bâtiment A »). */
  reference: string;
  auteur: string;
  discipline: string;
  format: StudioFormatModeleExterne;
  version: string;
  uniteDeclaree: StudioUniteDeclaree;
  /** Transformation déclarée vers le repère local de la variante ; null : aucune déclarée (aucune appliquée). */
  transformation: StudioTransformationDeclaree | null;
  nomFichier: string;
}

const texte = (v: unknown, max: number, path: string): string => {
  if (typeof v !== "string" || !v.trim() || v.includes("\0")) throw new StudioValidationError(path, "texte non vide attendu");
  if (v.trim().length > max) throw new StudioValidationError(path, `${max} caractères au plus`);
  return v.trim();
};

export function validerMetaModeleExterne(value: unknown): StudioMetaModeleExterne {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudioValidationError("modele", "objet attendu");
  const o = value as Record<string, unknown>;
  const attendus = ["reference", "auteur", "discipline", "format", "version", "uniteDeclaree", "transformation", "nomFichier"];
  for (const k of Object.keys(o)) if (!attendus.includes(k)) throw new StudioValidationError(`modele.${k}`, "champ inconnu");
  if (!(STUDIO_FORMATS_MODELE_EXTERNE as readonly unknown[]).includes(o.format)) throw new StudioValidationError("modele.format", "format ifc attendu");
  if (typeof o.uniteDeclaree !== "string" || !Object.hasOwn(STUDIO_UNITES_DECLAREES, o.uniteDeclaree)) throw new StudioValidationError("modele.uniteDeclaree", "unité m, cm, mm, ft ou in attendue");
  return {
    reference: texte(o.reference, STUDIO_LIMITES_MODELE_EXTERNE.reference, "modele.reference"),
    auteur: texte(o.auteur, STUDIO_LIMITES_MODELE_EXTERNE.auteur, "modele.auteur"),
    discipline: texte(o.discipline, STUDIO_LIMITES_MODELE_EXTERNE.discipline, "modele.discipline"),
    format: o.format as StudioFormatModeleExterne,
    version: texte(o.version, STUDIO_LIMITES_MODELE_EXTERNE.version, "modele.version"),
    uniteDeclaree: o.uniteDeclaree as StudioUniteDeclaree,
    transformation: o.transformation === null || o.transformation === undefined ? null : validerTransformation(o.transformation),
    nomFichier: texte(o.nomFichier, STUDIO_LIMITES_MODELE_EXTERNE.nomFichier, "modele.nomFichier"),
  };
}

export interface StudioLectureModeleExterne {
  /** Rapport du lecteur (unité lue, effectifs, éléments non natifs, pertes). */
  rapport: StudioIfcRapport;
  /** Document à part du modèle reçu (vide si l'unité est non évaluée) ; jamais la variante. */
  document: StudioDocument;
  /** Unité déclarée ≠ unité lue : écart signalé ; null si l'unité du fichier est non évaluée. */
  uniteConcorde: boolean | null;
}

/** Lecture d'un modèle reçu dans un document à part ; lève `StudioValidationError` pour un fichier illisible. */
export function lireModeleExterne(contenu: string, meta: StudioMetaModeleExterne): StudioLectureModeleExterne {
  const r = lireIfcStudio(contenu, meta.transformation ? { transformation: meta.transformation } : {});
  const vide = newStudioDocument("modele-externe");
  const document = r.commandes.length ? applyStudioCommands(vide, r.commandes) : vide;
  const lu = r.rapport.unite.facteur;
  return { rapport: r.rapport, document, uniteConcorde: lu === null ? null : Math.abs(lu - STUDIO_UNITES_DECLAREES[meta.uniteDeclaree]) <= 1e-12 * Math.max(1, lu) };
}

/** Écarts dits en clair d'une comparaison (codes ; le texte est celui de l'interface). */
export type StudioEcartModeleExterne = "unite-non-evaluee" | "unite-declaree-differente" | "transformation-non-declaree" | "elements-non-natifs";

export interface StudioComparaisonModeleExterne {
  /** Révision de la variante comparée (avant). */
  revisionId: string;
  resume: { objets: StudioCompteDifferences; calques: StudioCompteDifferences; cotes: StudioCompteDifferences } & Record<StudioFamilleElement, StudioCompteDifferences>;
  /** Éléments rangés hors de `objects` qui diffèrent (ajoutés, supprimés, modifiés), 500 au plus, ordre stable. */
  differences: StudioDifferenceElement[];
  /** Nombre total de différences listables (au-delà de 500, la liste est tronquée et le dit). */
  differencesTotal: number;
  identiques: boolean;
  ecarts: StudioEcartModeleExterne[];
}

const MAX_DIFFERENCES = 500;

/** Comparaison de la révision courante (avant) vers le modèle reçu (après) ; aucun des deux n'est modifié. */
export function comparerModeleExterne(courant: StudioDocument, revisionId: string, lecture: StudioLectureModeleExterne, meta: Pick<StudioMetaModeleExterne, "transformation">): StudioComparaisonModeleExterne {
  const a = validateStudioDocument(courant), b = validateStudioDocument(lecture.document);
  const d = comparerDocumentsStudio(a, b), e = comparerElementsStudio(a, b);
  const changes = e.elements.filter((x) => x.etat !== "identique");
  const ecarts: StudioEcartModeleExterne[] = [];
  if (lecture.uniteConcorde === null) ecarts.push("unite-non-evaluee");
  else if (!lecture.uniteConcorde) ecarts.push("unite-declaree-differente");
  if (!meta.transformation) ecarts.push("transformation-non-declaree");
  if (lecture.rapport.nonNatifsTotal > 0) ecarts.push("elements-non-natifs");
  return {
    revisionId,
    resume: { objets: d.resume.objets, calques: d.resume.calques, cotes: d.resume.cotes, ...e.resume },
    differences: changes.slice(0, MAX_DIFFERENCES), differencesTotal: changes.length,
    identiques: d.identiques && e.identiques,
    ecarts,
  };
}

export type StudioRefusModeleExterne = "deja-decide" | "role-insuffisant" | "motif-obligatoire" | "comparaison-perimee" | "unite-non-evaluee";

/**
 * Passage d'un modèle reçu : `comparer` (avec la révision courante, tant que rien n'est décidé), `accepter` (rôle
 * habilité, comparaison faite avec la révision courante, unité lue), `refuser` (rôle habilité, motif). Rend le statut
 * suivant ou le motif du refus ; rien n'est écrit ici.
 */
export function passageModeleExterne(
  etat: { statut: StudioStatutModeleExterne; revisionComparee: string | null; uniteLue: boolean },
  action: StudioActionModeleExterne,
  contexte: { habilite: boolean; revisionCourante: string; motif?: string | null },
): { statut: StudioStatutModeleExterne } | { refus: StudioRefusModeleExterne } {
  if (etat.statut !== "compare") return { refus: "deja-decide" };
  if (action === "comparer") return { statut: "compare" };
  if (!contexte.habilite) return { refus: "role-insuffisant" };
  if (action === "refuser") return contexte.motif && contexte.motif.trim() ? { statut: "refuse" } : { refus: "motif-obligatoire" };
  if (!etat.uniteLue) return { refus: "unite-non-evaluee" };
  if (etat.revisionComparee !== contexte.revisionCourante) return { refus: "comparaison-perimee" };
  return { statut: "accepte" };
}
