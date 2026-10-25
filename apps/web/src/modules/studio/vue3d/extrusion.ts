/**
 * Formulaire d'extrusion de la sélection (Studio) : des valeurs saisies aux commandes `studio.objet.extruder` /
 * `studio.objet.aplatir`. Aucune valeur par défaut : un champ vide (NaN) reste vide et bloque l'extrusion (base et
 * hauteur) ou signifie « sans épaisseur » (épaisseur). L'épaisseur ne vaut que pour les lignes et les arcs ; rectangles,
 * cercles et polylignes s'extrudent sans épaisseur (prisme sur l'emprise fermée, surface le long d'un tracé ouvert). Le modèle reste seul juge (calques verrouillés, valeurs). Pur : ni React ni DOM.
 * Direction (lot F1, TEST-005) : « vers le haut (+Z) » ou « vers le bas (−Z) », choisie explicitement ; vide, elle bloque
 * l'extrusion (aucun sens proposé). Un objet extrudé avant le lot F1 (sans direction enregistrée) s'affiche en +Z, le
 * seul sens qu'il ait jamais eu.
 */
import type { StudioCommand, StudioDocument, StudioShape } from "@parcours/atelier-model";

export type DirectionSaisie = "" | "+z" | "-z";
export interface ValeursExtrusion { base: number; hauteur: number; epaisseur: number; direction: DirectionSaisie }
export const VALEURS_VIDES: ValeursExtrusion = Object.freeze({ base: Number.NaN, hauteur: Number.NaN, epaisseur: Number.NaN, direction: "" as DirectionSaisie });

/** Objets (lignes, rectangles) de la sélection, dans l'ordre du document ; les cotes ne s'extrudent pas. */
export function formesSelectionnees(doc: StudioDocument, ids: readonly string[]): StudioShape[] {
  const choisis = new Set(ids);
  return doc.objects.filter((o) => choisis.has(o.id));
}

/** Valeurs affichées pour un objet extrudé (celles que l'utilisateur a saisies) ; null s'il n'est pas extrudé. */
export function valeursDe(o: StudioShape): ValeursExtrusion | null {
  if (!o.extrusion) return null;
  const epaisseur = o.type === "line" || o.type === "arc" ? o.extrusion.thickness : undefined;
  return { base: o.extrusion.base, hauteur: o.extrusion.height, epaisseur: epaisseur ?? Number.NaN, direction: o.extrusion.direction ?? "+z" };
}

export type ResultatExtrusion = { commandes: StudioCommand[]; info?: string } | { erreur: string };

export function commandesExtrusion(doc: StudioDocument, ids: readonly string[], v: ValeursExtrusion): ResultatExtrusion {
  const formes = formesSelectionnees(doc, ids);
  if (!formes.length) return { erreur: "Sélectionnez une ligne ou un rectangle à extruder." };
  if (!Number.isFinite(v.base) || !Number.isFinite(v.hauteur)) return { erreur: "Saisissez la base et la hauteur, en mètres." };
  if (v.hauteur <= 0) return { erreur: "La hauteur doit être strictement positive." };
  if (v.direction !== "+z" && v.direction !== "-z") return { erreur: "Choisissez la direction d’extrusion : vers le haut (+Z) ou vers le bas (−Z)." };
  const avecEpaisseur = !Number.isNaN(v.epaisseur);
  if (avecEpaisseur && !(Number.isFinite(v.epaisseur) && v.epaisseur > 0)) return { erreur: "L’épaisseur doit être strictement positive, ou laissée vide." };
  // « lignes » : objets qui acceptent une épaisseur (lignes, arcs) ; « rectangles » : les autres, sans épaisseur.
  const lignes = formes.filter((o) => o.type === "line" || o.type === "arc").map((o) => o.id);
  const rectangles = formes.filter((o) => o.type !== "line" && o.type !== "arc").map((o) => o.id);
  const commandes: StudioCommand[] = [];
  if (lignes.length) commandes.push({ toolId: "studio.objet.extruder", params: { ids: lignes, base: v.base, height: v.hauteur, ...(avecEpaisseur ? { thickness: v.epaisseur } : {}), direction: v.direction } });
  if (rectangles.length) commandes.push({ toolId: "studio.objet.extruder", params: { ids: rectangles, base: v.base, height: v.hauteur, direction: v.direction } });
  return avecEpaisseur && rectangles.length
    ? { commandes, info: formes.every((o) => o.type === "line" || o.type === "rectangle") ? "L’épaisseur ne s’applique qu’aux lignes : les rectangles s’extrudent sur leur emprise." : "L’épaisseur ne s’applique qu’aux lignes et aux arcs : les autres objets s’extrudent sans épaisseur." }
    : { commandes };
}

/** Aplatir : seuls les objets extrudés de la sélection ; aucune commande s'il n'y en a pas. */
export function commandesAplatir(doc: StudioDocument, ids: readonly string[]): StudioCommand[] {
  const extrudes = formesSelectionnees(doc, ids).filter((o) => o.extrusion).map((o) => o.id);
  return extrudes.length ? [{ toolId: "studio.objet.aplatir", params: { ids: extrudes } }] : [];
}
