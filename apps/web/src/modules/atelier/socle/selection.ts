/** Magasin de sélection partagé du nouvel Atelier (contrat `SelectionAtelier`, figé au lot 3a). */
import type { IdObjet } from "@parcours/atelier-model";
import type { ModeSelection, Selection, SelectionAtelier } from "./contrats";

const VIDE: Selection = { ids: [], principal: null };

export function creerSelection(): SelectionAtelier {
  let courante = VIDE;
  const ecouteurs = new Set<() => void>();
  const publier = (suivante: Selection) => {
    if (suivante.ids.length === courante.ids.length && suivante.ids.every((id, i) => id === courante.ids[i]) && suivante.principal === courante.principal) return;
    courante = suivante;
    for (const e of [...ecouteurs]) e();
  };
  return {
    lire: () => courante,
    choisir(ids: readonly IdObjet[], mode: ModeSelection = "remplacer") {
      const uniques = [...new Set(ids)];
      let suivants: IdObjet[];
      if (mode === "remplacer") suivants = uniques;
      else if (mode === "ajouter") suivants = [...courante.ids.filter((id) => !uniques.includes(id)), ...uniques];
      else if (mode === "retirer") suivants = courante.ids.filter((id) => !uniques.includes(id));
      else {
        const presents = new Set(courante.ids);
        suivants = [...courante.ids.filter((id) => !uniques.includes(id)), ...uniques.filter((id) => !presents.has(id))];
      }
      publier({ ids: suivants, principal: suivants.at(-1) ?? null });
    },
    vider: () => publier(VIDE),
    abonner(ecouteur) {
      ecouteurs.add(ecouteur);
      return () => ecouteurs.delete(ecouteur);
    },
  };
}
