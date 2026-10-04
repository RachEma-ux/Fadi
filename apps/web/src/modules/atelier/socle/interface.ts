/** État de vue partagé du nouvel Atelier (contrat `EtatInterface`, figé au lot 3a). */
import type { EtatInterface, EtatVue } from "./contrats";

export const VUE_INITIALE: EtatVue = {
  niveauActifId: null,
  calqueActifId: null,
  vue: "plan",
  niveauAffichage: "essentiel",
  outilActif: null,
  favoris: [],
  calquesMasques: [],
  immersif: false,
};

export function creerEtatInterface(initial: Partial<EtatVue> = {}): EtatInterface {
  let courant: EtatVue = { ...VUE_INITIALE, ...initial };
  const ecouteurs = new Set<() => void>();
  return {
    lire: () => courant,
    modifier(changement) {
      const cles = Object.keys(changement) as (keyof EtatVue)[];
      if (cles.every((k) => changement[k] === courant[k])) return;
      courant = { ...courant, ...changement };
      for (const e of [...ecouteurs]) e();
    },
    abonner(ecouteur) {
      ecouteurs.add(ecouteur);
      return () => ecouteurs.delete(ecouteur);
    },
  };
}
