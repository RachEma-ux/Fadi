/**
 * Contenu placé d'une occurrence de bloc (D-078) : les éléments de la définition, avec la transformation composée
 * (position, angle, échelle, miroir) et, pour les blocs imbriqués, celle de chaque niveau d'imbrication. Pur ; une
 * définition absente ou une profondeur excessive arrête la descente (rien n'est inventé).
 */
import { placementOccurrence, type Vec } from "./geometrie.js";
import type { ModeleAtelier } from "./modele.js";

export interface ElementPlace {
  classe: string;
  params: Record<string, unknown>;
  /** Point du contenu → point du modèle. */
  tr: (q: Vec) => Vec;
  /** Facteur d'échelle cumulé (rayons, hauteurs). */
  k: number;
  /** Chemin d'imbrication (identifiants de définitions). */
  chemin: string[];
}

interface Placement {
  position: Vec;
  angle: { value: number };
  echelle: number;
  miroir?: boolean;
}

export function contenuPlace(etat: ModeleAtelier, definitionId: string | null, placement: Placement, profondeurMax = 8): ElementPlace[] {
  const out: ElementPlace[] = [];
  const descendre = (defId: string | null, tr: (q: Vec) => Vec, k: number, chemin: string[]) => {
    if (!defId || chemin.length >= profondeurMax || chemin.includes(defId)) return;
    const def = etat.definitions[defId];
    const contenu = (def?.params["contenu"] as { classe: string; params: Record<string, unknown>; definitionId?: string | null }[] | undefined) ?? [];
    for (const e of contenu) {
      if (e.classe === "bloc-occurrence") {
        const p = e.params as unknown as Placement;
        const local = placementOccurrence(p);
        descendre(e.definitionId ?? null, (q) => tr(local(q)), k * (p.echelle ?? 1), [...chemin, defId]);
      } else out.push({ classe: e.classe, params: e.params, tr, k, chemin: [...chemin, defId] });
    }
  };
  descendre(definitionId, placementOccurrence(placement), placement.echelle, []);
  return out;
}


/** Définitions imbriquées dans une définition de bloc, transitivement (elle-même exclue sauf cycle). */
export function definitionsImbriquees(etat: ModeleAtelier, defId: string): Set<string> {
  const vus = new Set<string>();
  const pile = [defId];
  while (pile.length) {
    const d = etat.definitions[pile.pop()!];
    for (const e of ((d?.params["contenu"] as { classe: string; definitionId?: string | null }[] | undefined) ?? [])) {
      if (e.classe === "bloc-occurrence" && e.definitionId && !vus.has(e.definitionId)) {
        vus.add(e.definitionId);
        pile.push(e.definitionId);
      }
    }
  }
  return vus;
}

