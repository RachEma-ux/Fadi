/**
 * Édition de groupe dans la vue 3D (EX-005, TR-EX-005) : plusieurs solides libres choisis ensemble sont déplacés,
 * pivotés autour d'un axe vertical, mis à l'échelle (volumes compris) ou supprimés par **un seul lot** de commandes —
 * une seule révision, un seul pas d'annulation. Le groupe est une sélection de l'éditeur (jamais une donnée du
 * document) ; chaque commande reste validée par le modèle et par le serveur (tout ou rien).
 *
 * Pur : ni React, ni DOM.
 */
import type { StudioCommand, StudioDocument } from "@parcours/atelier-model";
import { commandeEchelle3d, type ResultatVolume } from "./volume-libre";

const fini = (...v: number[]) => v.every((x) => Number.isFinite(x));

/** Membres du groupe encore présents parmi les solides libres du document (ordre du document). */
export function membresGroupe(doc: Pick<StudioDocument, "solides">, groupe: ReadonlySet<string>): string[] {
  return (doc.solides ?? []).filter((s) => groupe.has(s.id)).map((s) => s.id);
}

export function basculerMembre(groupe: ReadonlySet<string>, id: string): Set<string> {
  const g = new Set(groupe);
  if (g.has(id)) g.delete(id); else g.add(id);
  return g;
}

const MESSAGE_GROUPE = "Choisissez au moins deux solides pour éditer un groupe.";

/** Déplacement du groupe : un `studio.solide.deplacer` par membre, dans un seul lot. */
export function commandeDeplacerGroupe(ids: readonly string[], v: { dx: number; dy: number; dz: number }): ResultatVolume {
  if (ids.length < 2) return { erreur: MESSAGE_GROUPE };
  if (!fini(v.dx, v.dy, v.dz) || (v.dx === 0 && v.dy === 0 && v.dz === 0)) return { erreur: "Saisissez le déplacement dx, dy, dz, en mètres (non nul)." };
  return { commandes: ids.map((id): StudioCommand => ({ toolId: "studio.solide.deplacer", params: { id, dx: v.dx, dy: v.dy, dz: v.dz } })) };
}

/** Rotation du groupe autour de l'axe vertical passant par `centre` (degrés, sens trigonométrique). */
export function commandePivoterGroupe(ids: readonly string[], centre: { x: number; y: number }, degres: number): ResultatVolume {
  if (ids.length < 2) return { erreur: MESSAGE_GROUPE };
  if (!fini(centre.x, centre.y)) return { erreur: "Saisissez le centre de rotation (x, y), en mètres." };
  if (!fini(degres) || degres === 0) return { erreur: "Saisissez un angle non nul, en degrés." };
  return { commandes: [{ toolId: "studio.dessin.rotation", params: { ids: [...ids], center: { x: centre.x, y: centre.y }, angle: (degres * Math.PI) / 180 } }] };
}

/** Échelle du groupe autour de `centre`, volumes compris. */
export function commandeEchelleGroupe(ids: readonly string[], centre: { x: number; y: number }, facteur: number): ResultatVolume {
  if (ids.length < 2) return { erreur: MESSAGE_GROUPE };
  return commandeEchelle3d(ids, centre, facteur);
}

/** Suppression du groupe : une seule commande. */
export function commandeSupprimerGroupe(ids: readonly string[]): ResultatVolume {
  if (ids.length < 2) return { erreur: MESSAGE_GROUPE };
  return { commandes: [{ toolId: "studio.solide.supprimer", params: { ids: [...ids] } }] };
}
