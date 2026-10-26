/**
 * Saisie numérique des outils (« Valeurs en mètres ») : champs affichés selon l'outil et l'objet sélectionné, reprise
 * des valeurs d'un objet, et action produite à la validation (mêmes constructeurs de commandes que le pointeur).
 * Annotations : Cote angulaire (sommet, un point sur chaque rayon, rayon de l'arc) et Texte (position, hauteur,
 * rotation en degrés, contenu et justification) ; Modifier reprend le rayon d'une cote angulaire, ou tout un texte.
 */
import {
  studioAngleNormal, type StudioAnnotation, type StudioDimension, type StudioDocument, type StudioPoint, type StudioShape, type StudioTextJustification,
} from "@parcours/atelier-model";
import { estVisible } from "../calques";
import { contoursMurs } from "../architecture/architecture-ui";
import { ecrireSommets, lireSommets, pointsAccroche, sommetExact } from "../geometrie-2d";
import type { StudioToolId } from "../raccourcis";
import { commandeCoteAngulaireLibre, commandeTexte } from "./annotations";
import { commandeArc, commandeCercle, commandePolyligne } from "./courbes";
import { commandeCote, commandeTrace } from "./trace";
import type { ActionOutil, ContexteCreation } from "./type";
import { BOUTONS_TRANSFORMATION, CHAMPS_TRANSFORMATION, estTransformation, libelleTransformation, soumettreTransformation, type SaisieTransformation } from "./modification";

export type Valeurs = {
  x: number; y: number; a: number; b: number; dx: number; dy: number; offset: number; r: number; a0: number; a1: number; distance: number;
  /** Second rayon d'une cote angulaire (point), rayon de son arc ; hauteur et rotation (°) d'un texte. */
  c: number; d: number; ra: number; h: number; rot: number;
} & Pick<SaisieTransformation, "angle" | "facteur" | "copies" | "garder" | "volumes">;
export const VALEURS_INITIALES: Valeurs = { x: 0, y: 0, a: 4, b: 3, dx: 1, dy: 0, offset: 0.5, r: 1, a0: 0, a1: 90, distance: 0.5, c: 0, d: 4, ra: 1, h: 0.25, rot: 0, angle: 90, facteur: 2, copies: 1, garder: 1, volumes: 0 };
export const SOMMETS_INITIAUX = "0 0; 4 0; 4 3";

/** Texte saisi : contenu (donnée du projet, jamais traduite) et justification. */
export interface SaisieContenu { contenu: string; justification: StudioTextJustification }
export const CONTENU_INITIAL: SaisieContenu = { contenu: "", justification: "left" };

export const enDegres = (a: number) => Math.round(((a * 180) / Math.PI) * 1e6) / 1e6;
export const enRadians = (d: number) => studioAngleNormal((d * Math.PI) / 180);

type Selectionne = StudioShape | StudioDimension | StudioAnnotation | null;

const TYPE_DE_L_OUTIL = {
  "studio.dessin.cercle": "circle", "studio.dessin.arc": "arc", "studio.dessin.polyligne": "polyline",
  "studio.dessin.cote-angulaire": "angular-dimension", "studio.dessin.texte": "text",
} as const;

/** Champs du formulaire, libellés, et forme de la saisie pour l'outil actif (et l'objet sélectionné pour Modifier). */
export function champsFormulaire(tool: StudioToolId, selected: Selectionne) {
  if (estTransformation(tool)) return { fields: [...CHAMPS_TRANSFORMATION[tool]] as (keyof Valeurs)[], label: (k: keyof Valeurs) => libelleTransformation(tool, k as keyof SaisieTransformation), saisiePolyligne: false, saisieTexte: false, bouton: BOUTONS_TRANSFORMATION[tool] };
  const typeSaisi = tool === "studio.dessin.modifier" ? selected?.type : (TYPE_DE_L_OUTIL as Partial<Record<string, string>>)[tool];
  const centreEtAngles: (keyof Valeurs)[] = ["x", "y", "r", "a0", "a1"];
  const fields: (keyof Valeurs)[] = tool === "studio.dessin.deplacer" ? ["dx", "dy"] : tool === "studio.dessin.decaler" ? ["distance"]
    : typeSaisi === "angular-dimension" ? (tool === "studio.dessin.modifier" ? ["ra"] : ["x", "y", "a", "b", "c", "d", "ra"])
    : typeSaisi === "text" ? ["x", "y", "h", "rot"]
    : typeSaisi === "dimension" ? ["offset"] : typeSaisi === "circle" ? ["x", "y", "r"] : typeSaisi === "arc" ? centreEtAngles : typeSaisi === "polyline" ? []
    : tool === "studio.dessin.cote" ? ["x", "y", "a", "b", "offset"] : ["x", "y", "a", "b"];
  const saisiePolyligne = typeSaisi === "polyline";
  const saisieTexte = typeSaisi === "text";
  const angulaire = typeSaisi === "angular-dimension";
  const sized = selected?.type === "rectangle" && tool === "studio.dessin.modifier" || tool === "studio.dessin.rectangle";
  const centre = typeSaisi === "circle" || typeSaisi === "arc";
  const label = (k: keyof Valeurs) => ({
    x: angulaire ? "Sommet X" : centre ? "Centre X" : "X", y: angulaire ? "Sommet Y" : centre ? "Centre Y" : "Y",
    a: angulaire ? "Premier rayon X" : sized ? "Largeur" : "X final", b: angulaire ? "Premier rayon Y" : sized ? "Hauteur" : "Y final",
    dx: "Déplacement X", dy: "Déplacement Y", offset: "Décalage", r: "Rayon", a0: "Angle de début (°)", a1: "Angle de fin (°)", distance: "Distance",
    c: "Second rayon X", d: "Second rayon Y", ra: "Rayon de l’arc", h: "Hauteur du texte", rot: "Rotation (°)",
  } as Partial<Record<keyof Valeurs, string>>)[k] ?? k;
  const bouton = tool === "studio.dessin.deplacer" ? "Déplacer la sélection" : tool === "studio.dessin.decaler" ? "Décaler la sélection" : tool === "studio.dessin.modifier" ? "Modifier la sélection" : "Ajouter au dessin";
  return { fields, label, saisiePolyligne, saisieTexte, bouton };
}

/** Le formulaire attend une sélection (Déplacer, Décaler) ou un objet unique (Modifier). */
export const formulaireInactif = (tool: StudioToolId, selectionIds: readonly string[], selected: Selectionne): boolean =>
  tool === "studio.dessin.deplacer" || tool === "studio.dessin.decaler" || estTransformation(tool) ? selectionIds.length === 0 : tool === "studio.dessin.modifier" ? !selected : false;

/** Valeurs reprises d'un objet sélectionné (jamais une proposition) : mise à jour des champs, des sommets d'une polyligne ou du texte. */
export function valeursObjet(o: StudioShape | StudioDimension | StudioAnnotation): { maj?: (v: Valeurs) => Valeurs; sommets?: { texte: string; fermee: boolean }; texte?: SaisieContenu } {
  switch (o.type) {
    case "rectangle": return { maj: v => ({ ...v, x: o.origin.x, y: o.origin.y, a: o.width, b: o.height }) };
    case "circle": return { maj: v => ({ ...v, x: o.center.x, y: o.center.y, r: o.radius }) };
    case "arc": return { maj: v => ({ ...v, x: o.center.x, y: o.center.y, r: o.radius, a0: enDegres(o.startAngle), a1: enDegres(o.endAngle) }) };
    case "polyline": return { sommets: { texte: ecrireSommets(o.points), fermee: o.closed } };
    case "angular-dimension": return { maj: v => ({ ...v, x: o.vertex.x, y: o.vertex.y, a: o.first.x, b: o.first.y, c: o.second.x, d: o.second.y, ra: o.radius }) };
    case "text": return { maj: v => ({ ...v, x: o.position.x, y: o.position.y, h: o.height, rot: enDegres(o.rotation) }), texte: { contenu: o.content, justification: o.justification } };
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
  /** Texte saisi (outil Texte, modification d'un texte) ; absent : aucun texte. */
  texte?: SaisieContenu;
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
  if (fields.includes("ra") && values.ra <= 0) return { type: "erreur", message: "Le rayon de l’arc doit être strictement positif." };
  if (fields.includes("a0") && enRadians(values.a0) === enRadians(values.a1)) return { type: "erreur", message: "Les angles de début et de fin doivent être différents." };
  if (tool === "studio.dessin.deplacer" && s.selectionIds.length) return { type: "deplacer", dx: values.dx, dy: values.dy };
  if (tool === "studio.dessin.decaler") return { type: "decaler", distance: values.distance };
  if (estTransformation(tool)) return soumettreTransformation(tool, values, s.selectionIds, creation);
  const texte = { contenu: s.texte?.contenu ?? "", hauteur: values.h, rotation: values.rot, justification: s.texte?.justification ?? "left" };
  if (tool === "studio.dessin.modifier" && selected) {
    if (selected.type === "dimension") return { type: "commandes", commandes: [{ toolId: "studio.dessin.modifier", params: { ...selected, offset: values.offset } }] };
    if (selected.type === "angular-dimension") return { type: "commandes", commandes: [{ toolId: "studio.dessin.modifier", params: { ...selected, radius: values.ra } }] };
    if (selected.type === "text") {
      // Mêmes contrôles qu'à la création ; l'identité et le calque du texte sont conservés.
      const r = commandeTexte({ ...creation, nouvelId: () => selected.id, texte }, { x: values.x, y: values.y });
      if (r.type !== "commandes") return r;
      const { id: _id, layerId: _calque, type: _type, ...saisi } = r.commandes[0]!.params as unknown as Extract<StudioAnnotation, { type: "text" }>;
      return { type: "commandes", commandes: [{ toolId: "studio.dessin.modifier", params: { ...selected, ...saisi } }] };
    }
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
  if (tool === "studio.dessin.cote-angulaire") return commandeCoteAngulaireLibre({ ...creation, rayonAngulaire: values.ra }, { x: values.x, y: values.y }, { x: values.a, y: values.b }, { x: values.c, y: values.d });
  if (tool === "studio.dessin.texte") return commandeTexte({ ...creation, texte }, { x: values.x, y: values.y });
  if (tool === "studio.dessin.cote" && s.drawing) {
    const drawing = s.drawing;
    // Sommets des formes et du contour des murs (cote associative sur mur, AC-001) : une extrémité saisie sur l'un d'eux y est liée.
    const sommets = pointsAccroche([...drawing.objects, ...contoursMurs(drawing, l => estVisible(drawing, l))], l => estVisible(drawing, l));
    const debut = { x: values.x, y: values.y }, fin = { x: values.a, y: values.b };
    return commandeCote(creation, { point: debut, accroche: sommetExact(sommets, debut) }, { point: fin, accroche: sommetExact(sommets, fin) });
  }
  return commandeTrace(tool, creation, { x: values.x, y: values.y }, tool === "studio.dessin.rectangle" ? { x: values.x + values.a, y: values.y + values.b } : { x: values.a, y: values.b });
}
