import type { StudioPoint } from "../noyau/types.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import { array, fail, identifier, layerRef, point, record } from "../noyau/validation.js";
import { id, layerId, point as pointSchema } from "../registre/schemas-base.js";

/**
 * Éléments **non natifs** de Studio (lot F3, TEST-028) : ce qu'un import (IFC, DXF) a lu sans pouvoir le traduire en
 * objet natif. Ils ne sont plus seulement comptés et écartés : chacun est **conservé** dans le document (extension
 * additive, facultative `StudioDocument.nonNatifs`), avec son format d'origine, son type d'entité, son identifiant
 * d'origine (GlobalId IFC, handle DXF), son nom déclaré et la raison pour laquelle il n'est pas natif.
 *
 * Règles :
 * - un élément non natif n'est **pas éditable** comme un objet natif : aucune commande de dessin, de modification, de
 *   volume ou d'architecture ne le trouve (ses identifiants sont réservés dans le document, rangés à part) ; seules
 *   `studio.nonnatif.conserver` (l'import) et `studio.nonnatif.retirer` (retrait explicite) l'écrivent ;
 * - il est **exclu des métrés**, avec mention (`QuantitesStudio.nonNatifsExclus`) ; jamais une quantité n'en est tirée ;
 * - son empreinte en plan (facultative) est celle **lue** dans le fichier, convertie en mètres dans le repère
 *   `local-2d` ; elle sert à le montrer, jamais à le métrer ni à l'exporter ;
 * - les textes d'origine (type, identifiant, nom, précision) sont des **données** du fichier : jamais traduits.
 * Pur : ni React, ni DOM.
 */

export type StudioFormatNonNatif = "ifc" | "dxf";
export const STUDIO_FORMATS_NON_NATIFS: readonly StudioFormatNonNatif[] = Object.freeze(["ifc", "dxf"] as const);

/**
 * Raison de l'état non natif :
 * - `type-sans-equivalent` : le type d'entité n'a pas d'équivalent natif dans Studio (poteau, escalier, espace, TEXT…) ;
 * - `representation-non-interpretable` : la géométrie n'est pas d'une forme lue (brep, élément répété, booléen…) ;
 * - `placement-non-interpretable` : placement absent, incliné ou circulaire ;
 * - `hote-introuvable` : porte ou fenêtre dont le mur hôte n'est pas importé comme mur natif ;
 * - `dimensions-non-interpretables` : dimensions absentes, nulles, hors bornes ou hors de l'hôte.
 */
export type StudioRaisonNonNatif =
  | "type-sans-equivalent" | "representation-non-interpretable" | "placement-non-interpretable" | "hote-introuvable" | "dimensions-non-interpretables";
export const STUDIO_RAISONS_NON_NATIF: readonly StudioRaisonNonNatif[] = Object.freeze([
  "type-sans-equivalent", "representation-non-interpretable", "placement-non-interpretable", "hote-introuvable", "dimensions-non-interpretables",
] as const);

/** Bornes techniques (pas des valeurs métier) des textes d'origine et de l'empreinte. */
export const STUDIO_LIMITES_NON_NATIFS = Object.freeze({ elements: STUDIO_LIMITS.objects, entite: 64, identifiant: 128, nom: 200, detail: 200, empreinte: 1024 } as const);

export interface StudioOrigineNonNatif {
  format: StudioFormatNonNatif;
  /** Type d'entité tel que lu (`IfcColumn`, `INSERT`…). */
  entite: string;
  /** GlobalId IFC ou handle DXF (code 5), quand le fichier en donne un. */
  identifiant?: string;
  /** Nom déclaré dans le fichier (attribut `Name` IFC, nom de bloc DXF). */
  nom?: string;
}

export interface StudioNonNatif {
  id: string;
  type: "non-native";
  layerId?: string;
  origine: StudioOrigineNonNatif;
  raison: StudioRaisonNonNatif;
  /** Précision lue (entité de représentation, type de profil…) : donnée, jamais traduite. */
  detail?: string;
  /** Empreinte en plan lue dans le fichier (repère `local-2d`, m), contour fermé de 3 sommets au moins ; affichage seulement. */
  empreinte?: StudioPoint[];
}

const texte = (v: unknown, max: number, path: string): string => {
  if (typeof v !== "string" || !v.trim() || v.includes("\0")) fail(path, "texte non vide attendu");
  if (v.length > max) fail(path, `${max} caractères au plus`);
  return v;
};

export function validerNonNatif(value: unknown, path: string): StudioNonNatif {
  const o = record(value, ["id", "type", "origine", "raison"], path, ["layerId", "detail", "empreinte"]);
  if (o.type !== "non-native") fail(`${path}.type`, "non-native attendu");
  const or = record(o.origine, ["format", "entite"], `${path}.origine`, ["identifiant", "nom"]);
  if (!(STUDIO_FORMATS_NON_NATIFS as readonly unknown[]).includes(or.format)) fail(`${path}.origine.format`, "format ifc ou dxf attendu");
  const origine: StudioOrigineNonNatif = {
    format: or.format as StudioFormatNonNatif,
    entite: texte(or.entite, STUDIO_LIMITES_NON_NATIFS.entite, `${path}.origine.entite`),
    ...(Object.hasOwn(or, "identifiant") ? { identifiant: texte(or.identifiant, STUDIO_LIMITES_NON_NATIFS.identifiant, `${path}.origine.identifiant`) } : {}),
    ...(Object.hasOwn(or, "nom") ? { nom: texte(or.nom, STUDIO_LIMITES_NON_NATIFS.nom, `${path}.origine.nom`) } : {}),
  };
  if (!(STUDIO_RAISONS_NON_NATIF as readonly unknown[]).includes(o.raison)) fail(`${path}.raison`, "raison inconnue");
  let empreinte: StudioPoint[] | undefined;
  if (Object.hasOwn(o, "empreinte")) {
    const pts = array(o.empreinte, `${path}.empreinte`);
    if (pts.length < 3 || pts.length > STUDIO_LIMITES_NON_NATIFS.empreinte) fail(`${path}.empreinte`, `de 3 à ${STUDIO_LIMITES_NON_NATIFS.empreinte} sommets`);
    empreinte = pts.map((p, i) => point(p, `${path}.empreinte[${i}]`));
  }
  return {
    id: identifier(o.id, `${path}.id`), type: "non-native", ...layerRef(o, path), origine, raison: o.raison as StudioRaisonNonNatif,
    ...(Object.hasOwn(o, "detail") ? { detail: texte(o.detail, STUDIO_LIMITES_NON_NATIFS.detail, `${path}.detail`) } : {}),
    ...(empreinte ? { empreinte } : {}),
  };
}

const chaine = (max: number) => ({ type: "string", minLength: 1, maxLength: max, pattern: "\\S" }) as const;
export const SCHEMA_NON_NATIF = {
  type: "object", additionalProperties: false, required: ["id", "type", "origine", "raison"],
  properties: {
    id, type: { const: "non-native" }, layerId,
    origine: {
      type: "object", additionalProperties: false, required: ["format", "entite"],
      properties: {
        format: { enum: ["ifc", "dxf"] }, entite: chaine(STUDIO_LIMITES_NON_NATIFS.entite),
        identifiant: chaine(STUDIO_LIMITES_NON_NATIFS.identifiant), nom: chaine(STUDIO_LIMITES_NON_NATIFS.nom),
      },
    },
    raison: { enum: [...STUDIO_RAISONS_NON_NATIF] },
    detail: chaine(STUDIO_LIMITES_NON_NATIFS.detail),
    empreinte: { type: "array", minItems: 3, maxItems: STUDIO_LIMITES_NON_NATIFS.empreinte, items: pointSchema },
  },
} as const;
