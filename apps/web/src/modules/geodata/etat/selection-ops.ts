/**
 * Sélection et fiche (feuille de route équipe A, PR P11 : extraction du domaine D4 de `PageGeoData.tsx`, aucun
 * changement visible). `decisionPremierClic` rend, pour le premier clic d'une série (D-GD-34), ce que la page fait :
 * mêmes branches et même ordre que l'ancien `clicCarte`. Pure, sans React ni DOM.
 */
import type { RangAdministratif } from "@parcours/geodata-model";

export interface ObjetTouche { readonly coucheId: string; readonly code: string }

export type DecisionPremierClic =
  /** Objet d'une couche qui n'est pas une limite administrative (point d'intérêt, ligne…) : sélection simple et fiche. */
  | { readonly cas: "objet"; readonly objet: ObjetTouche }
  /** Entité administrative la plus fine touchée parmi les couches de limites affichées. */
  | { readonly cas: "administratif"; readonly objet: ObjetTouche; readonly rang: RangAdministratif }
  /** Valeur au point de la couche raster visible la plus haute (D-GD-13). */
  | { readonly cas: "raster"; readonly coucheId: string }
  /** Carte vierge : unités du pays courant qui contiennent le point, lues en base (D-GD-42). */
  | { readonly cas: "unites-au-point"; readonly pays: string }
  /** Rien à sélectionner : la sélection est effacée. */
  | { readonly cas: "effacer" };

export function decisionPremierClic(e: {
  objets: readonly ObjetTouche[];
  /** Couches de limites administratives visibles, avec leur rang. */
  administratives: readonly { coucheId: string; rang: RangAdministratif }[];
  /** Couches raster visibles, de la plus basse à la plus haute. */
  rastersVisibles: readonly string[];
  /** Pays courant de la barre territoriale, et les rangs de son découpage en base. */
  pays: string | null;
  rangsDuPays: readonly number[];
}): DecisionPremierClic {
  const autre = e.objets.find((o) => !e.administratives.some((a) => a.coucheId === o.coucheId));
  if (autre) return { cas: "objet", objet: autre };
  if (e.administratives.length) {
    const touches = e.objets.flatMap((o) => { const a = e.administratives.find((y) => y.coucheId === o.coucheId); return a ? [{ o, rang: a.rang }] : []; }).sort((a, b) => b.rang - a.rang);
    return touches[0] ? { cas: "administratif", objet: touches[0].o, rang: touches[0].rang } : { cas: "effacer" };
  }
  const haut = e.rastersVisibles[e.rastersVisibles.length - 1];
  if (haut) return { cas: "raster", coucheId: haut };
  if (!e.pays || !e.rangsDuPays.length) return { cas: "effacer" };
  return { cas: "unites-au-point", pays: e.pays };
}
