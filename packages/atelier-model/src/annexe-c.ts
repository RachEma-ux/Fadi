/**
 * Contrôle croisé classe Fadi / classe IFC (D-111, DA-06-08, annexe C du cahier) : la correspondance de l'annexe C
 * dit en quelles classes IFC 4.3 chaque classe Fadi s'exporte. Une classe IFC déclarée sur un objet (propriété
 * `classeIfc`, saisie ou importée) qui n'en fait pas partie est signalée — jamais corrigée : l'export garde la classe
 * de l'annexe C, la déclaration reste telle quelle (R3, R16). Pur et dérivé : rien n'est écrit au modèle.
 */
import type { ModeleAtelier } from "./modele.js";
import { CLASSES, type Classe } from "./ontologie.js";

/** Classes IFC admises par classe Fadi (annexe C) ; à défaut, celle de l'ontologie. */
export const ANNEXE_C: Partial<Record<Classe, readonly string[]>> = {
  mur: ["IfcWall"],
  porte: ["IfcDoor"],
  fenetre: ["IfcWindow"],
  ouverture: ["IfcOpeningElement"],
  dalle: ["IfcSlab"],
  toiture: ["IfcSlab", "IfcRoof"],
  escalier: ["IfcStair", "IfcStairFlight"],
  piece: ["IfcSpace"],
  espace: ["IfcSpace"],
  zone: ["IfcZone"],
  poteau: ["IfcColumn"],
  solide: ["IfcBuildingElementProxy"],
  "solide-exact": ["IfcBuildingElementProxy"],
  "piece-mecanique": ["IfcBuildingElementProxy", "IfcDistributionElement"],
  assemblage: ["IfcElementAssembly"],
  poutre: ["IfcBeam", "IfcMember"],
  trame: ["IfcGrid"],
  plaque: ["IfcPlate"],
  "assemblage-structurel": ["IfcElementAssembly", "IfcPlate", "IfcMechanicalFastener"],
  soudure: ["IfcFastener"],
  armature: ["IfcReinforcingBar"],
  coulage: ["IfcGroup"],
  "element-bois": ["IfcMember", "IfcBeam", "IfcColumn"],
  ossature: ["IfcElementAssembly"],
  "panneau-clt": ["IfcWall", "IfcSlab", "IfcPlate"],
  "assemblage-bois": ["IfcFastener", "IfcDiscreteAccessory"],
  tole: ["IfcPlate"],
  plafond: ["IfcCovering"],
  coque: ["IfcRoof", "IfcSlab"],
  rampe: ["IfcRamp", "IfcRampFlight"],
  echelle: ["IfcStair", "IfcStairFlight"],
  "mur-rideau": ["IfcCurtainWall", "IfcWall"],
  terrain: ["IfcGeographicElement", "IfcSite"],
  reservation: ["IfcOpeningElement"],
  "installation-chantier": ["IfcBuildingElementProxy"],
  "surface-libre": ["IfcBuildingElementProxy"],
  cotation: ["IfcAnnotation"],
  texte: ["IfcAnnotation"],
};

export const classesIfcAttendues = (classe: Classe): readonly string[] => ANNEXE_C[classe] ?? [CLASSES[classe].ifc];

export interface IncoherenceClasseIfc {
  objetId: string;
  classe: Classe;
  declaree: string;
  attendues: readonly string[];
  message: string;
}

export function controleClassesIfc(etat: ModeleAtelier): IncoherenceClasseIfc[] {
  const out: IncoherenceClasseIfc[] = [];
  for (const o of Object.values(etat.objets)) {
    // Objet importé d'IFC : sa classe lue est conservée telle quelle (R16), rien à confronter.
    if (o.classe === "objet-importe") continue;
    const v = o.proprietes?.["classeIfc"]?.valeur;
    if (typeof v !== "string" || !v.trim()) continue;
    const attendues = classesIfcAttendues(o.classe);
    if (attendues.some((a) => a.toLowerCase() === v.trim().toLowerCase())) continue;
    out.push({ objetId: o.id, classe: o.classe, declaree: v.trim(), attendues, message: `${CLASSES[o.classe].libelle} ${o.id} : classe IFC déclarée ${v.trim()}, annexe C : ${attendues.join(" ou ")} (exporté ainsi, déclaration conservée)` });
  }
  return out.sort((a, b) => (a.objetId < b.objetId ? -1 : 1));
}
