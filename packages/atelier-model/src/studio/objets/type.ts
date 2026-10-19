import type { DxfWriter } from "../exporteurs/dxf.js";
import type { IfcConstruit, IfcContexte } from "../exporteurs/ifc-step.js";
import type { Volume3d } from "../exporteurs/maillage.js";
import type { StudioAnchor } from "../noyau/ancres.js";
import type { StudioCommandToolId, StudioExtrusion, StudioPoint, StudioShape } from "../noyau/types.js";

/**
 * Contrat d'un type d'objet de Studio : tout ce qui dépend du type (validation, sommets, translation, écrivains SVG / DXF
 * / IFC, volume 3D) vit dans son module (`objets/<type>.ts`) ; le noyau et les exports ne font que l'appeler par la table
 * `STUDIO_TYPES_OBJETS` (`objets/index.ts`). Ajouter un type = un module, une entrée dans la table, son interface dans
 * l'union `StudioShape`, son schéma et son outil de création dans `registre/dessin.ts`.
 */
export interface StudioTypeObjet<T extends StudioShape> {
  readonly type: T["type"];
  /** Commande de création (une par type, dans le registre `dessin`). */
  readonly outilCreation: StudioCommandToolId;
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
