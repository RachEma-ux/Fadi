/**
 * Sélection des semblables (D-134, DA-02-17) : objets de même classe et de même type (définition) qu'un objet donné —
 * même forme pour une esquisse —, sur son niveau ou sur tous les niveaux (sélection multi-niveaux). Objets verrouillés
 * ou sur calque verrouillé ou gelé écartés (ils ne se transforment pas). Fonction pure : la sélection reste un état
 * d'affichage, rien n'est écrit.
 */
import type { ModeleAtelier } from "./modele.js";
import { raisonVerrou } from "./commandes/verrous.js";

export function objetsSemblables(etat: ModeleAtelier, id: string, options: { tousNiveaux?: boolean } = {}): string[] {
  const o = etat.objets[id];
  if (!o) return [];
  const forme = o.classe === "esquisse" ? o.params.forme : null;
  return Object.values(etat.objets)
    .filter((x) => x.classe === o.classe && (x.definitionId ?? null) === (o.definitionId ?? null))
    .filter((x) => forme === null || (x.classe === "esquisse" && x.params.forme === forme))
    .filter((x) => options.tousNiveaux || x.niveauId === o.niveauId)
    .filter((x) => x.id === id || !raisonVerrou(etat, x))
    .map((x) => x.id)
    .sort((a, b) => (a === id ? -1 : b === id ? 1 : a < b ? -1 : 1));
}
