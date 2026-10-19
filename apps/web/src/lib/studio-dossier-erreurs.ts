/**
 * Libellé de l'erreur d'un dossier de conception Studio dans le catalogue des Documents (M-7). Pur, sans dépendance
 * (le module Documents ne charge pas le modèle Studio pour cela). Le serveur n'envoie qu'un code (`codeErreurDossier`
 * côté API) ; le libellé est écrit en français ici et traduit par le dictionnaire (`i18n/en.json`). Un code inconnu ou
 * absent reste « non évalué ».
 */
export function libelleErreurDossier(code: string | null | undefined): string {
  switch (code) {
    case "dossier_sheet_missing": return "Une feuille du dossier n’existe plus.";
    case "dossier_invalid":
    case "sheet_view_invalid": return "Vue à revoir : une feuille n’a pas pu être produite sur sa révision.";
    case "not_found": return "Source du dossier introuvable.";
    case "dossier_unavailable": return "Dossier indisponible : assemblage impossible.";
    default: return "non évalué";
  }
}
