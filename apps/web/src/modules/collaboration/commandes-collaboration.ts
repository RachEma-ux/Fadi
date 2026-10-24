/**
 * Commandes de collaboration livrées avec les écarts E1 et E2 des règles communes (CR-C1) : la règle d'or (AGENTS.md)
 * leur est appliquée comme aux commandes de la Planche — chacune a sa propre icône (jamais partagée), sa place dans la
 * barre où elle agit (formulaire de rédaction, en-tête du fil, ligne du membre) et un raccourci clavier, affiché à côté
 * de la commande et déclaré par `aria-keyshortcuts`. Sur écran tactile, la case ou le bouton nommé reste visible : le
 * raccourci le complète, il ne le remplace pas. Pur : aucun DOM, testé par `commandes-collaboration.test.ts`.
 */

export type CommandeCollaboration =
  | "visible-lecteurs" | "rendre-visible" | "reserver-equipe" | "export-lecteur"
  // Communication (COM, Issue #280, COM-D14).
  | "nouvelle-conversation" | "envoyer-message" | "partager-extrait" | "action-liee" | "audience-conversation" | "accuser-reception" | "nouvelle-demande"
  | "ajouter-participant" | "retirer-participant" | "transferer-animation" | "modifier-message" | "retirer-message"
  | "repondre-demande" | "cloturer-demande" | "rouvrir-demande" | "reattribuer-demande";

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
  barre: "rédaction" | "fil" | "membres" | "conversations" | "conversation" | "message" | "demandes" | "demande";
  raccourci: Raccourci;
  /** Tracés SVG (24 × 24) de son icône propre. */
  icone: readonly string[];
}

/**
 * Alt+Maj+chiffre et Alt+Maj+ponctuation (Communication, COM-D14) : aucun autre raccourci de Fadi ne l'emploie (les Alt+Maj+lettre sont pris par la Planche, dont le
 * journal de l'Atelier partage l'écran) ; `code` = touche physique, quelle que soit la disposition (AZERTY compris).
 */
const altMaj = (chiffre: string): Raccourci => ({ code: `Digit${chiffre}`, libelle: `Alt+Maj+${chiffre}`, aria: `Alt+Shift+${chiffre}` });
/** Alt+Maj+ponctuation (COM-D14) : touche physique (`code`), libellé du signe de la disposition QWERTY de référence. */
const altMajSigne = (code: string, signe: string): Raccourci => ({ code, libelle: `Alt+Maj+${signe}`, aria: `Alt+Shift+${signe}` });

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
  // --- Communication (COM-D14) ---
  // Bulle et signe plus.
  "nouvelle-conversation": { libelle: "Nouvelle conversation", barre: "conversations", raccourci: altMaj("4"), icone: ["M4 5h16v11H8l-4 4z", "M12 8v5", "M9.5 10.5h5"] },
  // Avion de papier.
  "envoyer-message": { libelle: "Envoyer", barre: "conversation", raccourci: altMaj("5"), icone: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"] },
  // Extrait et flèche sortante.
  "partager-extrait": { libelle: "Partager l’extrait", barre: "message", raccourci: altMaj("6"), icone: ["M4 6h7v6H4z", "M13 18h7", "M17 15l3 3-3 3"] },
  // Maillons.
  "action-liee": { libelle: "Créer une action liée", barre: "message", raccourci: altMaj("7"), icone: ["M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1", "M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"] },
  // Œil barré d'un trait d'audience.
  "audience-conversation": { libelle: "Changer l’audience", barre: "conversation", raccourci: altMaj("8"), icone: ["M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z", "M9 12h6"] },
  // Double coche.
  "accuser-reception": { libelle: "Accuser réception", barre: "message", raccourci: altMaj("9"), icone: ["M2 13l4 4 8-8", "M10 17l1 1 10-10"] },
  // Point d'interrogation cerclé.
  "nouvelle-demande": { libelle: "Nouvelle demande de précision", barre: "demandes", raccourci: altMaj("0"), icone: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"] },
  // Personne et plus.
  "ajouter-participant": { libelle: "Ajouter un participant", barre: "conversation", raccourci: altMajSigne("Minus", "-"), icone: ["M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M1 21v-1a7 7 0 0 1 14 0v1", "M19 8v6", "M16 11h6"] },
  // Personne et moins.
  "retirer-participant": { libelle: "Retirer de la conversation", barre: "conversation", raccourci: altMajSigne("Comma", ","), icone: ["M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M1 21v-1a7 7 0 0 1 14 0v1", "M16 11h6"] },
  // Flèches croisées (passage de témoin).
  "transferer-animation": { libelle: "Transférer l’animation", barre: "conversation", raccourci: altMajSigne("Slash", "/"), icone: ["M7 7h10", "M13 3l4 4-4 4", "M17 17H7", "M11 13l-4 4 4 4"] },
  // Crayon.
  "modifier-message": { libelle: "Modifier", barre: "message", raccourci: altMajSigne("Quote", "'"), icone: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"] },
  // Corbeille.
  "retirer-message": { libelle: "Retirer le message", barre: "message", raccourci: altMajSigne("Backslash", "\\"), icone: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"] },
  // Flèche de réponse.
  "repondre-demande": { libelle: "Répondre à la demande", barre: "demande", raccourci: altMajSigne("Equal", "="), icone: ["M9 17l-5-5 5-5", "M4 12h11a5 5 0 0 1 5 5v2"] },
  // Coche dans un carré.
  "cloturer-demande": { libelle: "Clôturer la demande", barre: "demande", raccourci: altMajSigne("BracketLeft", "["), icone: ["M3 3h18v18H3z", "M8 12l3 3 5-6"] },
  // Flèche circulaire.
  "rouvrir-demande": { libelle: "Rouvrir la demande", barre: "demande", raccourci: altMajSigne("BracketRight", "]"), icone: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5"] },
  // Flèches opposées (changement de personne).
  "reattribuer-demande": { libelle: "Réattribuer la demande", barre: "demande", raccourci: altMajSigne("Semicolon", ";"), icone: ["M16 3h5v5", "M21 3l-7 7", "M8 21H3v-5", "M3 21l7-7"] },
});

/** Commandes du module Communication (COM-D14). */
export const COMMANDES_COM: readonly CommandeCollaboration[] = [
  "nouvelle-conversation", "envoyer-message", "partager-extrait", "action-liee", "audience-conversation", "accuser-reception", "nouvelle-demande",
  "ajouter-participant", "retirer-participant", "transferer-animation", "modifier-message", "retirer-message",
  "repondre-demande", "cloturer-demande", "rouvrir-demande", "reattribuer-demande",
];

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
