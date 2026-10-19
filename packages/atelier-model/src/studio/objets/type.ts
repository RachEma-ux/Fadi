import type { DxfWriter } from "../exporteurs/dxf.js";
import type { IfcConstruit, IfcContexte } from "../exporteurs/ifc-step.js";
import type { Volume3d } from "../exporteurs/maillage.js";
import type { StudioAnchor } from "../noyau/ancres.js";
import type { StudioExtrusion, StudioPoint } from "../noyau/types.js";
import type { StudioShape } from "./formes.js";

/**
 * Outils de création des formes (un par type, famille `dessin`). Sous-ensemble de `StudioCommandToolId`, nommé ici pour
 * que les objets ne dépendent pas du contrat composé (`composition/types.ts`) ; l'inclusion est contrôlée à la
 * compilation (`composition/composition.test.ts`).
 */
export type StudioOutilCreationForme = "studio.dessin.ligne" | "studio.dessin.rectangle" | "studio.dessin.cercle" | "studio.dessin.arc" | "studio.dessin.polyligne";

/**
 * Contrat d'un type d'objet de Studio : tout ce qui dépend du type (validation, sommets, translation, écrivains SVG / DXF
 * / IFC, volume 3D) vit dans son module (`objets/<type>.ts`) ; le noyau et les exports ne font que l'appeler par la table
 * `STUDIO_TYPES_OBJETS` (`objets/index.ts`). Ajouter un type = un module, une entrée dans la table, son interface dans
 * l'union `StudioShape` (`formes.ts`), son discriminant dans `StudioShapeType` (`noyau/types.ts`), son outil de création
 * dans `StudioOutilCreationForme` et `StudioCommand` (`composition/types.ts`), son schéma et son outil dans
 * `registre/dessin.ts`.
 */
export interface StudioTypeObjet<T extends StudioShape> {
  readonly type: T["type"];
  /** Commande de création (une par type, dans le registre `dessin`). */
  readonly outilCreation: StudioOutilCreationForme;
  /** Copie canonique privée ou `StudioValidationError` ; l'ordre des contrôles fixe le message de refus. */
  valider(value: unknown, path: string): T;
  /** Sommet nommé par un lien de cote, ou null si le sommet n'existe pas pour ce type. */
  ancre(o: T, anchor: StudioAnchor): StudioPoint | null;
  /** Translation de tous les points (rayons, angles, renflements inchangés). */
  translater(o: T, t: (p: StudioPoint) => StudioPoint): T;
  /** Élément SVG (repère retourné : y SVG = −y local). */
  svg(o: T): string;
  /** Entités DXF R12 sur le calque DXF `layer`. */
  dxf(o: T, layer: string, w: DxfWriter): void;
  /** Élément IFC d'un objet extrudé (`e` = son extrusion déclarée). */
  ifc(o: T, e: StudioExtrusion, c: IfcContexte): IfcConstruit;
  /** Volume 3D d'un objet extrudé entre `zMin` et `zMax`. */
  volume(o: T, zMin: number, zMax: number): Volume3d;
}
