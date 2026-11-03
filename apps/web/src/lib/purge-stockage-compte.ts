/**
 * BD-1.7 (chantier base-donnees, constat A1) : clés du stockage local qui portent des données d'un compte ou d'un
 * projet, effacées par `forgetDevice` (déconnexion, 401 du serveur, connexion d'un autre compte).
 *
 * Restent volontairement : les réglages de l'appareil (langue, précision d'affichage, position des barres, module
 * OCCT en cache), qui ne disent rien du compte, et l'état de la page GeoData (`geodata.*` : dernière carte ouverte,
 * pays, panneaux) — GeoData est autonome des projets ; un identifiant de carte n'ouvre rien sans droit (l'API répond 404
 * et la page l'oublie), et la reconnexion du même compte rouvre sa dernière carte (recette GEO 05). Les suggestions Studio sont déjà rangées par compte.
 *
 * Toute nouvelle clé qui porte des données de compte ou de projet doit être ajoutée ici (test associé).
 */
import { CLE_LOCALE_MAPTILER, CLE_SESSION_MAPTILER } from "@parcours/geodata-model";

/** Préfixes (une clé exacte est un préfixe d'elle-même). */
export const PREFIXES_DONNEES_COMPTE: readonly string[] = Object.freeze([
  // Presse-papiers de l'Atelier : objets, définitions et calques d'un projet, collables par un autre compte.
  "fadi-atelier-presse-papiers",
  // Préférences de l'Atelier (dont les ensembles d'affichage personnels, synchronisés avec le compte) et base de synchronisation.
  "fadi.atelier.prefs",
  "fadi.atelier.ensembles-sync",
  // Bac à sable : contexte de travail par planche.
  "fadi.sandbox.contexte-travail.",
  // Conflits d'écriture affichés (déjà vidés par `conflictsStore.clearAll`, repris ici par sûreté).
  "fadi.conflicts.",
  // Clé d'API MapTiler saisie par l'utilisateur : un secret, oublié avec la session.
  CLE_LOCALE_MAPTILER,
  CLE_SESSION_MAPTILER,
]);

/** Événement émis après la purge : les modules déjà chargés (Atelier) vident leur état en mémoire. */
export const EVENEMENT_OUBLI_COMPTE = "fadi-oubli-compte";

/** Efface les clés du compte dans un stockage ; renvoie les clés effacées. Un stockage indisponible n'est pas une erreur. */
export function purgerStockageCompte(stockage: Pick<Storage, "length" | "key" | "removeItem"> | null | undefined): string[] {
  if (!stockage) return [];
  const effacees: string[] = [];
  try {
    const cles: string[] = [];
    for (let i = 0; i < stockage.length; i++) {
      const k = stockage.key(i);
      if (k !== null) cles.push(k);
    }
    for (const k of cles) {
      if (PREFIXES_DONNEES_COMPTE.some((p) => k.startsWith(p))) {
        stockage.removeItem(k);
        effacees.push(k);
      }
    }
  } catch {
    /* stockage indisponible : rien à effacer */
  }
  return effacees;
}

/** Purge du `localStorage` et du `sessionStorage`, puis signal aux modules chargés. */
export function oublierStockageCompte(): void {
  const lire = (nom: "localStorage" | "sessionStorage"): Storage | null => {
    try { return typeof window === "undefined" ? null : window[nom]; } catch { return null; }
  };
  purgerStockageCompte(lire("localStorage"));
  purgerStockageCompte(lire("sessionStorage"));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENEMENT_OUBLI_COMPTE));
}
