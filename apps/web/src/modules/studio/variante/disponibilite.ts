/**
 * Disponibilité des outils du registre et des commandes de l'éditeur (barres, palette, raccourcis) : lecture pure de
 * l'état de l'espace de travail. Une commande indisponible est grisée et son raccourci refusé.
 */
import type { StudioDocument, StudioShape } from "@parcours/atelier-model";
import { peutAnnuler, peutRetablir, type Brouillon } from "../planche2d/brouillon";
import type { PointPose } from "../planche2d/Dessin2D";
import { OUTILS_MODES, type CommandeEditeur, type StudioToolEntry, type StudioToolId } from "../planche2d/raccourcis";
import { toutSelectionnable } from "../planche2d/selection";
import { LARGEUR_VUE } from "../planche2d/vue";

export interface EtatOutils {
  writable: boolean;
  selectionIds: readonly string[];
  formesChoisies: readonly StudioShape[];
}

export function outilDisponible(t: StudioToolEntry, s: EtatOutils): boolean {
  if (t.nature === "lecture" || OUTILS_MODES.has(t.toolId)) return t.nature === "lecture" || s.writable;
  if (!s.writable) return false;
  if (t.toolId === "studio.dessin.supprimer" || t.toolId === "studio.objet.calque") return s.selectionIds.length > 0;
  if (t.toolId === "studio.objet.extruder") return s.formesChoisies.length > 0;
  if (t.toolId === "studio.objet.aplatir") return s.formesChoisies.some(o => o.extrusion);
  return true;
}

export interface EtatCommandes {
  writable: boolean;
  brouillon: Brouillon | null;
  drawing: StudioDocument | null;
  trace: PointPose | null;
  suite: readonly unknown[];
  selectionIds: readonly string[];
  tool: StudioToolId;
  canSave: boolean;
  /** Largeur de la vue (mètres). */
  largeurVue: number;
}

export function commandeDisponible(c: CommandeEditeur, s: EtatCommandes): boolean {
  switch (c.id) {
    case "annuler": return s.writable && !!s.brouillon && peutAnnuler(s.brouillon);
    case "retablir": return s.writable && !!s.brouillon && peutRetablir(s.brouillon);
    case "annuler-trace": return !!s.trace || s.selectionIds.length > 0 || s.tool !== "studio.dessin.selection";
    case "enregistrer": return s.canSave;
    case "tout-selectionner": return !!s.drawing && toutSelectionnable(s.drawing).length > 0;
    case "terminer-polyligne": return s.writable && s.tool === "studio.dessin.polyligne" && !!s.trace && s.suite.length >= 1;
    case "fermer-polyligne": return s.writable && s.tool === "studio.dessin.polyligne" && !!s.trace && s.suite.length >= 2;
    case "zoom-avant": return s.largeurVue > LARGEUR_VUE.min;
    case "zoom-arriere": return s.largeurVue < LARGEUR_VUE.max;
    default: return c.ecrit ? s.writable : true;
  }
}
