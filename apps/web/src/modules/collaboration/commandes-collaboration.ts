/**
 * Commandes de collaboration livrées avec les écarts E1 et E2 des règles communes (CR-C1) : la règle d'or (AGENTS.md)
 * leur est appliquée comme aux commandes de la Planche — chacune a sa propre icône (jamais partagée), sa place dans la
 * barre où elle agit (formulaire de rédaction, en-tête du fil, ligne du membre) et un raccourci clavier, affiché à côté
 * de la commande et déclaré par `aria-keyshortcuts`. Sur écran tactile, la case ou le bouton nommé reste visible : le
 * raccourci le complète, il ne le remplace pas. Pur : aucun DOM, testé par `commandes-collaboration.test.ts`.
 */

export type CommandeCollaboration = "visible-lecteurs" | "rendre-visible" | "reserver-equipe" | "export-lecteur";

export interface Raccourci {
  /** `KeyboardEvent.code` : indépendant de la disposition et de la touche Alt (macOS). */
  code: string;
  /** Libellé affiché (français ; traduit à l'affichage) et valeur de `aria-keyshortcuts`. */
  libelle: string;
  aria: string;
}

export interface DefinitionCommande {
  libelle: string;
  /** Où la commande agit : sa barre. */
  barre: "rédaction" | "fil" | "membres";
  raccourci: Raccourci;
  /** Tracés SVG (24 × 24) de son icône propre. */
  icone: readonly string[];
}

/**
 * Alt+Maj+chiffre : aucun autre raccourci de Fadi ne l'emploie (les Alt+Maj+lettre sont pris par la Planche, dont le
 * journal de l'Atelier partage l'écran) ; `code` = touche physique, quelle que soit la disposition (AZERTY compris).
 */
const altMaj = (chiffre: string): Raccourci => ({ code: `Digit${chiffre}`, libelle: `Alt+Maj+${chiffre}`, aria: `Alt+Shift+${chiffre}` });

export const COMMANDES_COLLABORATION: Readonly<Record<CommandeCollaboration, DefinitionCommande>> = Object.freeze({
  // Case de rédaction : œil ouvert (le fil sera lu par les lecteurs).
  "visible-lecteurs": {
    libelle: "Visible par les lecteurs", barre: "rédaction", raccourci: altMaj("1"),
    icone: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  },
  // Fil de l'équipe ouvert aux lecteurs : groupe de personnes et flèche sortante.
  "rendre-visible": {
    libelle: "Rendre visible aux lecteurs", barre: "fil", raccourci: altMaj("2"),
    icone: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21v-1a6 6 0 0 1 12 0v1", "M16 11h6", "M19 8l3 3-3 3"],
  },
  // Fil réservé à l'équipe : cadenas.
  "reserver-equipe": {
    libelle: "Réserver à l’équipe", barre: "fil", raccourci: altMaj("2"),
    icone: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4", "M12 15v2"],
  },
  // Export accordé à un lecteur : flèche de téléchargement dans un plateau.
  "export-lecteur": {
    libelle: "Export accordé", barre: "membres", raccourci: altMaj("3"),
    icone: ["M12 3v12", "M7 10l5 5 5-5", "M4 21h16"],
  },
});

/**
 * `rendre-visible` et `reserver-equipe` sont les deux sens d'une même bascule (un seul bouton par fil, l'un ou l'autre
 * selon l'audience) : ils partagent donc leur raccourci, et seulement entre eux.
 */
export const BASCULE_AUDIENCE: readonly CommandeCollaboration[] = ["rendre-visible", "reserver-equipe"];

/** L'évènement clavier déclenche-t-il cette commande ? Alt et Maj enfoncés, ni Ctrl ni Méta, touche par son code. */
export function declenche(e: { code: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, commande: CommandeCollaboration): boolean {
  const r = COMMANDES_COLLABORATION[commande].raccourci;
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === r.code;
}

/** Attributs du raccourci sur l'élément de la commande (`aria-keyshortcuts`, et la commande pour les recettes). */
export function propsRaccourci(commande: CommandeCollaboration): { "aria-keyshortcuts": string; "data-commande-collaboration": CommandeCollaboration } {
  return { "aria-keyshortcuts": COMMANDES_COLLABORATION[commande].raccourci.aria, "data-commande-collaboration": commande };
}
