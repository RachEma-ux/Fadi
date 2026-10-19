import { refs, studioStepReal, studioStepString, type Step } from "../exporteurs/ifc-step.js";
import { StudioValidationError } from "../noyau/validation.js";
import type { StudioPropriete } from "./proprietes.js";

/**
 * Écriture IFC des propriétés déclarées (E.1-01), appelée par `exportStudioIfc` quand le document en porte :
 * - un `IfcPropertySet` **de projet** `Fadi_ProprietesDeclarees` par objet porteur, relié par `IfcRelDefinesByProperties`
 *   à l'entité IFC de l'objet (`IfcWall` du mur ; `IfcDoor` / `IfcWindow` d'une ouverture dont le type est déclaré, sinon
 *   son `IfcOpeningElement` ; `IfcWall` ou `IfcBuildingElementProxy` d'un objet extrudé). Aucun `Pset_*` normalisé :
 *   Fadi ne vérifie pas la conformité d'un nom déclaré à une définition buildingSMART et ne la prétend donc pas ;
 * - un `IfcPropertySingleValue` par propriété **qui a une valeur**, dans l'ordre du document. Une propriété sans valeur
 *   (« non évaluée ») n'est pas écrite — aucune valeur n'est inventée — et elle est comptée (`DeclaredPropertiesNotEvaluated`
 *   de `Fadi_StudioExport`, rapport de fidélité) ;
 * - type de la valeur, d'après la valeur déclarée et son unité **telle que saisie** (jamais convertie) :
 *   nombre en `m` → `IfcLengthMeasure`, en `m2` / `m²` → `IfcAreaMeasure`, en `m3` / `m³` → `IfcVolumeMeasure` (unités SI
 *   du projet IFC) ; nombre d'une autre unité → `IfcReal`, l'unité déclarée écrite dans la description ;
 *   texte → `IfcLabel` (255 caractères au plus, borne du type), au-delà `IfcText` ;
 * - la source déclarée (et l'unité d'un `IfcReal` ou d'un texte) est écrite dans la description (`Specification`).
 * Le modèle des propriétés n'accepte que des nombres et des textes : aucun `IfcBoolean` n'est écrit.
 */

export const STUDIO_IFC_PSET_PROPRIETES = "Fadi_ProprietesDeclarees" as const;

/** Unités déclarées lues comme les unités SI du projet IFC (mètre, mètre carré, mètre cube). */
const MESURES: Readonly<Record<string, string>> = Object.freeze({
  m: "IFCLENGTHMEASURE", m2: "IFCAREAMEASURE", "m²": "IFCAREAMEASURE", m3: "IFCVOLUMEMEASURE", "m³": "IFCVOLUMEMEASURE",
});
/** Longueur maximale d'un `IfcLabel` (STRING(255)). */
const LABEL_MAX = 255;

/** Valeur STEP typée et description d'une propriété déclarée, ou `null` si elle n'a pas de valeur (non évaluée). */
export function studioIfcValeurPropriete(p: StudioPropriete): { valeur: string; description: string | null } | null {
  if (p.valeur === undefined) return null;
  const description: string[] = [];
  let valeur: string;
  if (typeof p.valeur === "number") {
    const mesure = p.unite !== undefined && Object.hasOwn(MESURES, p.unite) ? MESURES[p.unite] : undefined;
    if (mesure) valeur = `${mesure}(${studioStepReal(p.valeur)})`;
    else {
      valeur = `IFCREAL(${studioStepReal(p.valeur)})`;
      if (p.unite !== undefined) description.push(`Unité déclarée : ${p.unite}`);
    }
  } else {
    valeur = `${p.valeur.length <= LABEL_MAX ? "IFCLABEL" : "IFCTEXT"}(${studioStepString(p.valeur)})`;
    if (p.unite !== undefined) description.push(`Unité déclarée : ${p.unite}`);
  }
  if (p.source !== undefined) description.push(`Source déclarée : ${p.source}`);
  return { valeur, description: description.length ? description.join(" ; ") : null };
}

export interface IfcProprietesEcrites {
  exportees: number;
  nonEvaluees: number;
}

/**
 * Jeux `Fadi_ProprietesDeclarees` des propriétés déclarées : un par objet porteur (ordre de la première propriété
 * valuée), relié à l'entité de `entites`. Une cible sans entité ne peut venir que d'un document invalide : refus.
 */
export function studioIfcProprietes(
  s: Step, gid: (id: string) => string, proprietes: readonly StudioPropriete[], entites: ReadonlyMap<string, number>,
): IfcProprietesEcrites {
  const parCible = new Map<string, number[]>();
  let nonEvaluees = 0;
  let exportees = 0;
  for (const p of proprietes) {
    const v = studioIfcValeurPropriete(p);
    if (!v) { nonEvaluees++; continue; }
    if (!entites.has(p.cibleId)) throw new StudioValidationError("ifc.proprietes", `propriété « ${p.nom} » : aucune entité IFC pour ${p.cibleId}`);
    const desc = v.description === null ? "$" : studioStepString(v.description);
    const prop = s.add(`IFCPROPERTYSINGLEVALUE(${studioStepString(p.nom)},${desc},${v.valeur},$)`);
    const liste = parCible.get(p.cibleId);
    if (liste) liste.push(prop); else parCible.set(p.cibleId, [prop]);
    exportees++;
  }
  for (const [cibleId, props] of parCible) {
    const set = s.add(`IFCPROPERTYSET(${gid(`pset|declared|${cibleId}`)},$,${studioStepString(STUDIO_IFC_PSET_PROPRIETES)},$,${refs(props)})`);
    s.add(`IFCRELDEFINESBYPROPERTIES(${gid(`rel-pset|declared|${cibleId}`)},$,$,$,(#${entites.get(cibleId)}),#${set})`);
  }
  return { exportees, nonEvaluees };
}
