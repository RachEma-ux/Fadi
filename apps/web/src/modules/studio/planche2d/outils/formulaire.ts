/**
 * Saisie numérique des outils (« Valeurs en mètres ») : champs affichés selon l'outil et l'objet sélectionné, reprise
 * des valeurs d'un objet, et action produite à la validation (mêmes constructeurs de commandes que le pointeur).
 */
import { studioAngleNormal, type StudioDimension, type StudioDocument, type StudioPoint, type StudioShape } from "@parcours/atelier-model";
import { estVisible } from "../calques";
import { ecrireSommets, lireSommets, pointsAccroche, sommetExact } from "../geometrie-2d";
import type { StudioToolId } from "../raccourcis";
import { commandeArc, commandeCercle, commandePolyligne } from "./courbes";
import { commandeCote, commandeTrace } from "./trace";
import type { ActionOutil, ContexteCreation } from "./type";
import { BOUTONS_TRANSFORMATION, CHAMPS_TRANSFORMATION, estTransformation, libelleTransformation, soumettreTransformation, type SaisieTransformation } from "./modification";

export type Valeurs = { x: number; y: number; a: number; b: number; dx: number; dy: number; offset: number; r: number; a0: number; a1: number; distance: number }
  & Pick<SaisieTransformation, "angle" | "facteur" | "copies" | "garder" | "volumes">;
export const VALEURS_INITIALES: Valeurs = { x: 0, y: 0, a: 4, b: 3, dx: 1, dy: 0, offset: 0.5, r: 1, a0: 0, a1: 90, distance: 0.5, angle: 90, facteur: 2, copies: 1, garder: 1, volumes: 0 };
export const SOMMETS_INITIAUX = "0 0; 4 0; 4 3";

export const enDegres = (a: number) => Math.round(((a * 180) / Math.PI) * 1e6) / 1e6;
export const enRadians = (d: number) => studioAngleNormal((d * Math.PI) / 180);

type Selectionne = StudioShape | StudioDimension | null;

/** Champs du formulaire, libellés, et forme de la saisie pour l'outil actif (et l'objet sélectionné pour Modifier). */
export function champsFormulaire(tool: StudioToolId, selected: Selectionne) {
  if (estTransformation(tool)) return { fields: [...CHAMPS_TRANSFORMATION[tool]] as (keyof Valeurs)[], label: (k: keyof Valeurs) => libelleTransformation(tool, k as keyof SaisieTransformation), saisiePolyligne: false, bouton: BOUTONS_TRANSFORMATION[tool] };
  const typeSaisi = tool === "studio.dessin.modifier" ? selected?.type : ({ "studio.dessin.cercle": "circle", "studio.dessin.arc": "arc", "studio.dessin.polyligne": "polyline" } as const)[tool as string];
  const centreEtAngles: (keyof Valeurs)[] = ["x", "y", "r", "a0", "a1"];
  const fields: (keyof Valeurs)[] = tool === "studio.dessin.deplacer" ? ["dx", "dy"] : tool === "studio.dessin.decaler" ? ["distance"]
    : typeSaisi === "dimension" ? ["offset"] : typeSaisi === "circle" ? ["x", "y", "r"] : typeSaisi === "arc" ? centreEtAngles : typeSaisi === "polyline" ? []
    : tool === "studio.dessin.cote" ? ["x", "y", "a", "b", "offset"] : ["x", "y", "a", "b"];
  const saisiePolyligne = typeSaisi === "polyline";
  const sized = selected?.type === "rectangle" && tool === "studio.dessin.modifier" || tool === "studio.dessin.rectangle";
  const centre = typeSaisi === "circle" || typeSaisi === "arc";
  const label = (k: keyof Valeurs) => ({ x: centre ? "Centre X" : "X", y: centre ? "Centre Y" : "Y", a: sized ? "Largeur" : "X final", b: sized ? "Hauteur" : "Y final", dx: "Déplacement X", dy: "Déplacement Y", offset: "Décalage", r: "Rayon", a0: "Angle de début (°)", a1: "Angle de fin (°)", distance: "Distance" } as Partial<Record<keyof Valeurs, string>>)[k] ?? k;
  const bouton = tool === "studio.dessin.deplacer" ? "Déplacer la sélection" : tool === "studio.dessin.decaler" ? "Décaler la sélection" : tool === "studio.dessin.modifier" ? "Modifier la sélection" : "Ajouter au dessin";
  return { fields, label, saisiePolyligne, bouton };
}

/** Le formulaire attend une sélection (Déplacer, Décaler) ou un objet unique (Modifier). */
export const formulaireInactif = (tool: StudioToolId, selectionIds: readonly string[], selected: Selectionne): boolean =>
  tool === "studio.dessin.deplacer" || tool === "studio.dessin.decaler" || estTransformation(tool) ? selectionIds.length === 0 : tool === "studio.dessin.modifier" ? !selected : false;

/** Valeurs reprises d'un objet sélectionné (jamais une proposition) : mise à jour des champs, ou des sommets d'une polyligne. */
export function valeursObjet(o: StudioShape | StudioDimension): { maj?: (v: Valeurs) => Valeurs; sommets?: { texte: string; fermee: boolean } } {
  switch (o.type) {
    case "rectangle": return { maj: v => ({ ...v, x: o.origin.x, y: o.origin.y, a: o.width, b: o.height }) };
    case "circle": return { maj: v => ({ ...v, x: o.center.x, y: o.center.y, r: o.radius }) };
    case "arc": return { maj: v => ({ ...v, x: o.center.x, y: o.center.y, r: o.radius, a0: enDegres(o.startAngle), a1: enDegres(o.endAngle) }) };
    case "polyline": return { sommets: { texte: ecrireSommets(o.points), fermee: o.closed } };
    default: return { maj: v => ({ ...v, x: o.start.x, y: o.start.y, a: o.end.x, b: o.end.y, ...(o.type === "dimension" ? { offset: o.offset } : {}) }) };
  }
}

/** Action de la saisie : commandes, refus, déplacement ou décalage de la sélection. */
export type ActionFormulaire = ActionOutil | { type: "decaler"; distance: number };

export interface Saisie {
  tool: StudioToolId;
  values: Valeurs;
  sommetsTexte: string;
  fermee: boolean;
  selected: Selectionne;
  selectionIds: readonly string[];
  drawing: StudioDocument | null;
  creation: ContexteCreation;
}

export function soumettre(s: Saisie): ActionFormulaire {
  const { tool, values, fermee, selected, creation } = s;
  const { fields } = champsFormulaire(tool, selected);
  /** Sommets saisis pour une polyligne ; refus si la saisie ne suffit pas. */
  const sommetsSaisis = (): StudioPoint[] | ActionOutil => {
    const points = lireSommets(s.sommetsTexte);
    if (!points || points.length < (fermee ? 3 : 2)) return { type: "erreur", message: `Saisissez ${fermee ? "trois" : "deux"} sommets au moins, « x y » séparés par des points-virgules.` };
    return points;
  };
  const entered = fields.map(k => values[k]);
  if (!entered.every(Number.isFinite)) return { type: "erreur", message: "Saisissez des nombres finis dans tous les champs." };
  const rectangleSaisi = tool === "studio.dessin.rectangle" || tool === "studio.dessin.modifier" && selected?.type === "rectangle";
  if (rectangleSaisi && (values.a <= 0 || values.b <= 0)) return { type: "erreur", message: "La largeur et la hauteur doivent être strictement positives." };
  if (fields.includes("r") && values.r <= 0) return { type: "erreur", message: "Le rayon doit être strictement positif." };
  if (fields.includes("a0") && enRadians(values.a0) === enRadians(values.a1)) return { type: "erreur", message: "Les angles de début et de fin doivent être différents." };
  if (tool === "studio.dessin.deplacer" && s.selectionIds.length) return { type: "deplacer", dx: values.dx, dy: values.dy };
  if (tool === "studio.dessin.decaler") return { type: "decaler", distance: values.distance };
  if (estTransformation(tool)) return soumettreTransformation(tool, values, s.selectionIds, creation);
  if (tool === "studio.dessin.modifier" && selected) {
    if (selected.type === "dimension") return { type: "commandes", commandes: [{ toolId: "studio.dessin.modifier", params: { ...selected, offset: values.offset } }] };
    let modifie: StudioShape;
    switch (selected.type) {
      case "line": modifie = { ...selected, start: { x: values.x, y: values.y }, end: { x: values.a, y: values.b } }; break;
      case "rectangle": modifie = { ...selected, origin: { x: values.x, y: values.y }, width: values.a, height: values.b }; break;
      case "circle": modifie = { ...selected, center: { x: values.x, y: values.y }, radius: values.r }; break;
      case "arc": modifie = { ...selected, center: { x: values.x, y: values.y }, radius: values.r, startAngle: enRadians(values.a0), endAngle: enRadians(values.a1) }; break;
      case "polyline": {
        const points = sommetsSaisis(); if (!Array.isArray(points)) return points;
        // Les renflements ne se gardent que si le nombre de segments est inchangé.
        const { bulges, ...reste } = selected;
        const garde = bulges && bulges.length === (fermee ? points.length : points.length - 1) ? { bulges } : {};
        modifie = { ...reste, points, closed: fermee, ...garde };
      }
    }
    return { type: "commandes", commandes: [{ toolId: "studio.dessin.modifier", params: modifie }] };
  }
  if (tool === "studio.dessin.cercle") return commandeCercle(creation, { x: values.x, y: values.y }, values.r);
  if (tool === "studio.dessin.arc") return commandeArc(creation, { center: { x: values.x, y: values.y }, radius: values.r, startAngle: enRadians(values.a0), endAngle: enRadians(values.a1) });
  if (tool === "studio.dessin.polyligne") { const points = sommetsSaisis(); return Array.isArray(points) ? commandePolyligne(creation, points, fermee) : points; }
  if (tool === "studio.dessin.cote" && s.drawing) {
    const drawing = s.drawing;
    const sommets = pointsAccroche(drawing.objects, l => estVisible(drawing, l));
    const debut = { x: values.x, y: values.y }, fin = { x: values.a, y: values.b };
    return commandeCote(creation, { point: debut, accroche: sommetExact(sommets, debut) }, { point: fin, accroche: sommetExact(sommets, fin) });
  }
  return commandeTrace(tool, creation, { x: values.x, y: values.y }, tool === "studio.dessin.rectangle" ? { x: values.x + values.a, y: values.y + values.b } : { x: values.a, y: values.b });
}
