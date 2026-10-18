/**
 * Lectures pures du panneau « Commentaires » de Studio (aucun DOM, aucune requête) : regroupement des fils tels que le
 * serveur les ordonne, objets citables de la révision affichée, objets d'un commentaire encore présents.
 */
import type { StudioDocument } from "@parcours/atelier-model";
import type { StudioComment } from "../../../lib/api";

export interface FilCommentaires { origine: StudioComment; reponses: StudioComment[] }

/**
 * Fils dans l'ordre du serveur (origine puis réponses). Une réponse dont l'origine manque reste visible comme un fil
 * à part : rien n'est omis en silence.
 */
export function regrouperFils(comments: readonly StudioComment[]): FilCommentaires[] {
  const fils: FilCommentaires[] = [];
  const parId = new Map<string, FilCommentaires>();
  for (const c of comments) {
    const parent = c.parentId ? parId.get(c.parentId) : undefined;
    if (parent) { parent.reponses.push(c); continue; }
    const fil = { origine: c, reponses: [] };
    fils.push(fil);
    parId.set(c.id, fil);
  }
  return fils;
}

/** Identifiants d'objets et de cotes d'un document. */
export function identifiantsDocument(doc: StudioDocument): Set<string> {
  return new Set([...doc.objects.map((o) => o.id), ...(doc.dimensions ?? []).map((d) => d.id)]);
}

/** Partage de la sélection : ce qui existe dans la révision enregistrée (citable) et ce qui ne l'est pas encore. */
export function ancrageSelection(selection: readonly string[], revision: StudioDocument): { citables: string[]; nonEnregistres: string[] } {
  const ids = identifiantsDocument(revision);
  return { citables: selection.filter((id) => ids.has(id)), nonEnregistres: selection.filter((id) => !ids.has(id)) };
}

/** Objets cités par un commentaire et encore présents dans le dessin affiché, et nombre d'objets disparus. */
export function objetsPresents(comment: StudioComment, doc: StudioDocument): { presents: string[]; absents: number } {
  const ids = identifiantsDocument(doc);
  const presents = comment.objectIds.filter((id) => ids.has(id));
  return { presents, absents: comment.objectIds.length - presents.length };
}
