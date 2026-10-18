/**
 * Formulaire d'extrusion de la sélection (Studio) : des valeurs saisies aux commandes `studio.objet.extruder` /
 * `studio.objet.aplatir`. Aucune valeur par défaut : un champ vide (NaN) reste vide et bloque l'extrusion (base et
 * hauteur) ou signifie « sans épaisseur » (épaisseur). L'épaisseur ne vaut que pour les lignes ; les rectangles
 * s'extrudent sur leur emprise. Le modèle reste seul juge (calques verrouillés, valeurs). Pur : ni React ni DOM.
 */
import type { StudioCommand, StudioDocument, StudioShape } from "@parcours/atelier-model";

export interface ValeursExtrusion { base: number; hauteur: number; epaisseur: number }
export const VALEURS_VIDES: ValeursExtrusion = Object.freeze({ base: Number.NaN, hauteur: Number.NaN, epaisseur: Number.NaN });

/** Objets (lignes, rectangles) de la sélection, dans l'ordre du document ; les cotes ne s'extrudent pas. */
export function formesSelectionnees(doc: StudioDocument, ids: readonly string[]): StudioShape[] {
  const choisis = new Set(ids);
  return doc.objects.filter((o) => choisis.has(o.id));
}

/** Valeurs affichées pour un objet extrudé (celles que l'utilisateur a saisies) ; null s'il n'est pas extrudé. */
export function valeursDe(o: StudioShape): ValeursExtrusion | null {
  if (!o.extrusion) return null;
  const epaisseur = o.type === "line" ? o.extrusion.thickness : undefined;
  return { base: o.extrusion.base, hauteur: o.extrusion.height, epaisseur: epaisseur ?? Number.NaN };
}

export type ResultatExtrusion = { commandes: StudioCommand[]; info?: string } | { erreur: string };

export function commandesExtrusion(doc: StudioDocument, ids: readonly string[], v: ValeursExtrusion): ResultatExtrusion {
  const formes = formesSelectionnees(doc, ids);
  if (!formes.length) return { erreur: "Sélectionnez une ligne ou un rectangle à extruder." };
  if (!Number.isFinite(v.base) || !Number.isFinite(v.hauteur)) return { erreur: "Saisissez la base et la hauteur, en mètres." };
  if (v.hauteur <= 0) return { erreur: "La hauteur doit être strictement positive." };
  const avecEpaisseur = !Number.isNaN(v.epaisseur);
  if (avecEpaisseur && !(Number.isFinite(v.epaisseur) && v.epaisseur > 0)) return { erreur: "L’épaisseur doit être strictement positive, ou laissée vide." };
  const lignes = formes.filter((o) => o.type === "line").map((o) => o.id);
  const rectangles = formes.filter((o) => o.type === "rectangle").map((o) => o.id);
  const commandes: StudioCommand[] = [];
  if (lignes.length) commandes.push({ toolId: "studio.objet.extruder", params: { ids: lignes, base: v.base, height: v.hauteur, ...(avecEpaisseur ? { thickness: v.epaisseur } : {}) } });
  if (rectangles.length) commandes.push({ toolId: "studio.objet.extruder", params: { ids: rectangles, base: v.base, height: v.hauteur } });
  return avecEpaisseur && rectangles.length
    ? { commandes, info: "L’épaisseur ne s’applique qu’aux lignes : les rectangles s’extrudent sur leur emprise." }
    : { commandes };
}

/** Aplatir : seuls les objets extrudés de la sélection ; aucune commande s'il n'y en a pas. */
export function commandesAplatir(doc: StudioDocument, ids: readonly string[]): StudioCommand[] {
  const extrudes = formesSelectionnees(doc, ids).filter((o) => o.extrusion).map((o) => o.id);
  return extrudes.length ? [{ toolId: "studio.objet.aplatir", params: { ids: extrudes } }] : [];
}
