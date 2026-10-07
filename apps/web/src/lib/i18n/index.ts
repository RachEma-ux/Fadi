/**
 * Langue de l'interface (D-163) : français (par défaut) ou anglais, préférence locale de l'appareil. Le français
 * reste la langue source : les textes sont écrits en français dans le code et traduits à l'affichage par le
 * dictionnaire anglais (`en.json`), chargé seulement quand l'anglais est choisi. Les données du projet (saisies,
 * noms, exemples), les documents produits (PDF, DXF, IFC, rapports) et l'outil Parcelle du prototype ne sont pas
 * traduits : ce sont des contenus, pas l'interface.
 */
export type Langue = "fr" | "en";

export const LANGUES: { code: Langue; nom: string }[] = [
  { code: "fr", nom: "Français" },
  { code: "en", nom: "English" },
];

export const CLE_LANGUE = "fadi.langue";

function lireLangue(): Langue {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(CLE_LANGUE);
    return v === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

/** Langue de cette page (fixée au chargement : changer de langue recharge la page). */
export const LANGUE: Langue = lireLangue();

/** Paramètre régional des nombres et des dates. */
export const LOCALE = LANGUE === "en" ? "en-GB" : "fr-FR";

/** Enregistre la langue choisie et recharge la page pour l'appliquer partout. */
export function choisirLangue(l: Langue): void {
  if (l === LANGUE) return;
  try {
    localStorage.setItem(CLE_LANGUE, l);
  } catch {
    /* stockage indisponible : la langue ne sera pas retenue */
  }
  window.location.reload();
}
