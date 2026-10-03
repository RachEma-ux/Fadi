/**
 * Correspondance IFC 4.3 (cahier annexe C, DA-06-08). La classe IFC est dérivée de la classe d'ontologie,
 * jamais saisie. `null` : pas de correspondance dans l'annexe C — à décider au lot 6, jamais reclassé en
 * silence (un solide reste `IfcBuildingElementProxy` avec son `role` en propriété).
 */
import type { ClasseObjet } from "./classes.js";

export interface CorrespondanceIfc {
  readonly entite: string;
  /** `PredefinedType` éventuel (`FLOOR`, `ROOF`). */
  readonly typePredefini?: string;
  /** Entité de type (`IfcWallType`…) pour les définitions du catalogue. */
  readonly entiteType?: string;
  readonly remarque?: string;
}

export const CLASSES_IFC: Readonly<Record<ClasseObjet, CorrespondanceIfc | null>> = {
  niveau: { entite: "IfcBuildingStorey", remarque: "Elevation" },
  mur: { entite: "IfcWall", entiteType: "IfcWallType", remarque: "IfcExtrudedAreaSolid ; IfcMaterialLayerSet si connu" },
  porte: { entite: "IfcDoor", entiteType: "IfcDoorType", remarque: "IfcOpeningElement + IfcRelVoidsElement / IfcRelFillsElement" },
  fenetre: { entite: "IfcWindow", entiteType: "IfcWindowType", remarque: "IfcOpeningElement + IfcRelVoidsElement / IfcRelFillsElement" },
  ouverture: { entite: "IfcOpeningElement", remarque: "IfcRelVoidsElement" },
  dalle: { entite: "IfcSlab", typePredefini: "FLOOR" },
  toiture: { entite: "IfcRoof", remarque: "ou IfcSlab ROOF (annexe C)" },
  escalier: { entite: "IfcStair", remarque: "IfcStairFlight si décomposé ; paramètres en Pset_StairCommon" },
  poteau: { entite: "IfcColumn" },
  piece: { entite: "IfcSpace", remarque: "aires en Qto_SpaceBaseQuantities" },
  espace: { entite: "IfcSpace", remarque: "aires en Qto_SpaceBaseQuantities" },
  zone: { entite: "IfcZone", remarque: "IfcRelAggregates" },
  solide: { entite: "IfcBuildingElementProxy", remarque: "role en propriété ; jamais reclassé silencieusement" },
  "esquisse.ligne": null,
  "esquisse.polyligne": null,
  "esquisse.arc": null,
  "esquisse.cercle": null,
  "esquisse.rectangle": null,
  "esquisse.polygone": null,
  "esquisse.spline": null,
  "esquisse.construction": null,
  "esquisse.hachure": null,
  "reference-plan": null,
  cotation: { entite: "IfcAnnotation", remarque: "export seulement" },
  texte: { entite: "IfcAnnotation", remarque: "export seulement" },
  etiquette: null,
  calque: null,
  groupe: null,
  parcelle: { entite: "IfcSite", remarque: "IfcMapConversion + IfcProjectedCRS depuis le CRS de la parcelle (R5)" },
  emprise: null,
  hypothese: { entite: "IfcPropertySet", remarque: "Fadi_Hypotheses ; statut explicite" },
  source: { entite: "IfcPropertySet", remarque: "Fadi_Sources ; statut explicite" },
  structureDeclaree: null,
};
