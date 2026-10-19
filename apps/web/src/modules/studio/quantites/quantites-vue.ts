/**
 * Libellés, filtres et mise en forme du métré Studio. Pur : ni React, ni DOM. L'arrondi n'a lieu qu'ici, à l'affichage
 * et à l'export ; le modèle (`quantitesStudio`) garde la pleine précision.
 */
import {
  totaliserQuantites, type GrandeurQuantite, type MotifNonEvalue, type MotifRevueAjustement, type NatureQuantite, type QuantitesStudio, type RefusAjustement,
  type RefusAjustementEnregistre, type StatutAjustementEnregistre, type UniteQuantite,
} from "@parcours/atelier-model";

export const LIBELLE_GRANDEUR: Readonly<Record<GrandeurQuantite, string>> = {
  longueur: "Longueur", perimetre: "Périmètre", surface: "Surface", hauteur: "Hauteur",
  "surface-laterale": "Surface latérale (deux faces)", "surface-verticale": "Surface verticale", volume: "Volume",
  "volume-deduit": "Volume déduit (ouvertures déclarées)", "volume-net": "Volume net", "surface-ouverture": "Surface d’ouverture",
};
export const SYMBOLE_UNITE: Readonly<Record<UniteQuantite, string>> = { m: "m", m2: "m²", m3: "m³" };
export const LIBELLE_NATURE: Readonly<Record<NatureQuantite, string>> = {
  ligne: "Ligne", rectangle: "Rectangle", mur: "Mur (ligne extrudée avec épaisseur)", "ligne-extrudee": "Ligne extrudée sans épaisseur",
  prisme: "Prisme (rectangle extrudé)",
  cercle: "Cercle", cylindre: "Cylindre (cercle extrudé)", arc: "Arc", "mur-courbe": "Mur courbe (arc extrudé avec épaisseur)",
  "arc-extrude": "Arc extrudé sans épaisseur", "polyligne-ouverte": "Polyligne ouverte",
  "polyligne-ouverte-extrudee": "Polyligne ouverte extrudée", "polyligne-fermee": "Polyligne fermée",
  "prisme-polyligne": "Prisme (polyligne fermée extrudée)", "non-pris-en-charge": "Type non pris en charge",
  "mur-architectural": "Mur (objet architectural)", ouverture: "Ouverture (objet architectural)",
};
export const LIBELLE_MOTIF: Readonly<Record<MotifNonEvalue, string>> = {
  "non-extrude": "non extrudé", "epaisseur-non-declaree": "épaisseur non déclarée",
  "type-non-pris-en-charge": "type non pris en charge par le métré", "geometrie-invalide": "géométrie illisible",
  "contour-non-simple": "contour qui se croise : surface non définie", "contour-non-controle": "contour trop détaillé pour être contrôlé",
};
export const LIBELLE_REFUS: Readonly<Record<RefusAjustement, string>> = {
  "objet-inconnu": "objet absent du métré", "grandeur-non-applicable": "grandeur sans objet pour cet objet",
  "valeur-invalide": "valeur positive ou nulle attendue", "motif-obligatoire": "le motif est obligatoire",
  "auteur-obligatoire": "l’auteur est obligatoire", "date-invalide": "date illisible",
};
/** Refus d'un ajustement à enregistrer (E.3-05) : ceux du métré, plus la cible calque et l'unité. */
export const LIBELLE_REFUS_ENREGISTRE: Readonly<Record<RefusAjustementEnregistre, string>> = {
  ...LIBELLE_REFUS,
  "calque-inconnu": "calque absent du métré", "grandeur-non-cumulable": "cette grandeur ne s’additionne pas : le total d’un calque ne s’ajuste pas",
  "unite-incoherente": "unité sans rapport avec la grandeur", "motif-trop-long": "motif de 2000 caractères au plus",
};
export const LIBELLE_STATUT_AJUSTEMENT: Readonly<Record<StatutAjustementEnregistre, string>> = {
  "en-vigueur": "en vigueur", "a-revoir": "à revoir", remplace: "remplacé",
};
export const LIBELLE_REVUE: Readonly<Record<MotifRevueAjustement, string>> = {
  "cible-modifiee": "la cible a changé depuis la révision de l’ajustement : il n’est pas appliqué",
  "cible-absente": "la cible n’existe plus dans cette révision : l’ajustement n’est pas appliqué",
};
export const NON_EVALUE = "non évalué";

/**
 * Adresse du CSV exportable : seulement quand le métré correspond à la révision affichée (sinon le fichier porterait
 * les chiffres d'une révision antérieure) ; `null` désactive « Exporter en CSV ».
 */
export const lienCsvExportable = (lien: string | null, aJour: boolean): string | null => (aJour ? lien : null);

/** Nombre arrondi à l'affichage seulement (au plus 3 décimales), selon le paramètre régional. */
export function formaterQuantite(v: number, locale: string): string {
  return v.toLocaleString(locale, { maximumFractionDigits: 3 });
}

/** Saisie d'un nombre décimal, virgule ou point ; null si illisible. */
export function lireNombre(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface FiltreQuantites {
  /** Identifiant de calque, ou null pour tous. */
  calqueId: string | null;
  nature: NatureQuantite | null;
  /** Inclure les objets des calques masqués (inclus par défaut, et signalés). */
  masques: boolean;
}
export const FILTRE_INITIAL: FiltreQuantites = { calqueId: null, nature: null, masques: true };

/** Sous-ensemble du métré, totaux recalculés sur les seuls objets retenus. */
export function filtrerQuantites(q: QuantitesStudio, f: FiltreQuantites): QuantitesStudio {
  const garde = (o: QuantitesStudio["objets"][number]) =>
    (f.calqueId === null || o.calqueId === f.calqueId) && (f.nature === null || o.nature === f.nature) && (f.masques || !o.calqueMasque);
  const calques = q.calques
    .filter((c) => (f.calqueId === null || c.calqueId === f.calqueId) && (f.masques || !c.masque))
    .map((c) => {
      const objets = c.objets.filter(garde);
      return { ...c, objets, totaux: totaliserQuantites(objets) };
    });
  const objets = q.objets.filter(garde);
  return { ...q, calques, objets, totaux: totaliserQuantites(objets), nonPrisEnCharge: objets.filter((o) => o.nature === "non-pris-en-charge").length };
}
