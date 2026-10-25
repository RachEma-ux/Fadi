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
  | "repondre-demande" | "cloturer-demande" | "rouvrir-demande" | "reattribuer-demande"
  // Photos et épingles (lot COM-13).
  | "joindre-photo" | "epingler"
  // Participants et équipe (Issue #262, phase 2).
  | CommandeParticipants
  // Temps réel (Issue #283, RT-D5 § 10).
  | CommandeTempsReel;

/**
 * Sessions en direct du Studio (Issue #283, RTC-2) : chaque commande a sa propre icône, sa barre (bandeau de session,
 * ligne d'un participant) et un raccourci Ctrl+Alt+Maj+lettre (RT-D5 § 10). Aucune ne donne de droit sur le projet.
 */
export type CommandeTempsReel =
  | "ouvrir-session" | "rejoindre-session" | "quitter-session" | "suivre-presentateur" | "naviguer-librement" | "presenter"
  | "designer-presentateur" | "transmettre-hote" | "reprendre-animation" | "afficher-revision-session" | "passer-revision" | "clore-session"
  // Annotations enregistrées (RTC-3).
  | "annoter" | "enregistrer-annotation" | "voir-point-de-vue" | "citer-selection"
  // Panneaux du bandeau (participants, annotations).
  | "afficher-participants" | "afficher-annotations"
  // Revue en direct sur une publication figée (RTC-4).
  | "ouvrir-revue";

/**
 * Participants et équipe (Issue #262, phase 2) : chaque commande de l'annuaire a sa propre icône, sa barre (en-tête de
 * l'annuaire, ligne du participant, formulaire des rôles) et un raccourci. Les raccourcis agissent là où se trouve le
 * focus (la ligne du participant pour ses commandes), comme ceux des écarts E1 et E2.
 */
export type CommandeParticipants =
  | "nouveau-contact" | "modifier-participation" | "attribuer-role" | "retirer-role" | "suspendre-participation" | "reactiver-participation"
  | "terminer-participation" | "retour-participant" | "effacer-contact" | "clore-projet" | "rouvrir-projet";

export interface Raccourci {
  /** `KeyboardEvent.code` : indépendant de la disposition et de la touche Alt (macOS). */
  code: string;
  /** Libellé affiché (français ; traduit à l'affichage) et valeur de `aria-keyshortcuts`. */
  libelle: string;
  aria: string;
  /** Ctrl enfoncé en plus d'Alt et Maj (commandes Participants et équipe). */
  ctrl?: boolean;
}

export interface DefinitionCommande {
  libelle: string;
  /** Où la commande agit : sa barre. */
  barre: "rédaction" | "fil" | "membres" | "conversations" | "conversation" | "message" | "demandes" | "demande" | "annuaire" | "participant" | "rôles"
    | "session" | "participant-session" | "annotation";
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
/**
 * Ctrl+Alt+Maj+touche (Participants et équipe, Issue #262, phase 2) : Alt+Maj+chiffre et ponctuation sont pris par les
 * commandes E1/E2 et Communication (COM-D14), Alt+Maj+lettre par la Planche ; un modificateur de plus garde chaque
 * raccourci unique dans Fadi. Ces commandes agissent là où se trouve le focus (en-tête de l'annuaire, ligne du participant).
 */
const ctrlAltMaj = (code: string, signe: string): Raccourci => ({ code, libelle: `Ctrl+Alt+Maj+${signe}`, aria: `Control+Alt+Shift+${signe}`, ctrl: true });
/** Ctrl+Alt+Maj+lettre (Temps réel, RT-D5 § 10) : aucune autre commande de Fadi n'emploie cette combinaison. */
const ctrlAltMajLettre = (lettre: string): Raccourci => ctrlAltMaj(`Key${lettre}`, lettre);

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
  // Appareil photo (lot COM-13).
  "joindre-photo": { libelle: "Joindre une photo", barre: "conversation", raccourci: altMajSigne("Period", "."), icone: ["M3 8h4l2-3h6l2 3h4v12H3z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"] },
  // Punaise de plan (lot COM-13).
  "epingler": { libelle: "Épingler sur un plan", barre: "conversation", raccourci: altMajSigne("Backquote", "`"), icone: ["M12 22v-7", "M8 3h8l-1 6 3 3v3H6v-3l3-3z"] },
  "reattribuer-demande": { libelle: "Réattribuer la demande", barre: "demande", raccourci: altMajSigne("Semicolon", ";"), icone: ["M16 3h5v5", "M21 3l-7 7", "M8 21H3v-5", "M3 21l7-7"] },
  // --- Participants et équipe (Issue #262, phase 2) ---
  // Nouveau contact : fiche et signe plus.
  "nouveau-contact": {
    libelle: "Nouveau contact", barre: "annuaire", raccourci: ctrlAltMaj("Digit6", "6"),
    icone: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21v-1a7 7 0 0 1 11-5.7", "M18 14v7", "M14.5 17.5h7"],
  },
  // Modifier la participation : crayon.
  "modifier-participation": {
    libelle: "Modifier la participation", barre: "participant", raccourci: ctrlAltMaj("Digit7", "7"),
    icone: ["M4 20h4L19 9l-4-4L4 16v4z", "M13.5 6.5l4 4"],
  },
  // Attribuer un rôle par portée : badge et plus.
  "attribuer-role": {
    libelle: "Attribuer un rôle", barre: "rôles", raccourci: ctrlAltMaj("Digit8", "8"),
    icone: ["M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z", "M12 9v5", "M9.5 11.5h5"],
  },
  // Retirer un rôle attribué : badge barré.
  "retirer-role": {
    libelle: "Retirer le rôle", barre: "rôles", raccourci: ctrlAltMaj("BracketLeft", "["),
    icone: ["M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z", "M9.5 11.5h5"],
  },
  // Suspendre : pause.
  "suspendre-participation": {
    libelle: "Suspendre la participation", barre: "participant", raccourci: ctrlAltMaj("Digit9", "9"),
    icone: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M10 8v8", "M14 8v8"],
  },
  // Réactiver : lecture.
  "reactiver-participation": {
    libelle: "Réactiver la participation", barre: "participant", raccourci: ctrlAltMaj("Digit9", "9"),
    icone: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M10 8l6 4-6 4z"],
  },
  // Terminer la participation : porte de sortie.
  "terminer-participation": {
    libelle: "Terminer la participation", barre: "participant", raccourci: ctrlAltMaj("Digit0", "0"),
    icone: ["M14 3h6v18h-6", "M10 17l-5-5 5-5", "M5 12h11"],
  },
  // Retour d'un participant : flèche circulaire.
  "retour-participant": {
    libelle: "Nouvelle participation", barre: "participant", raccourci: ctrlAltMaj("BracketRight", "]"),
    icone: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 8v4l3 2"],
  },
  // Effacer un contact sans compte : gomme.
  "effacer-contact": {
    libelle: "Effacer le contact", barre: "participant", raccourci: ctrlAltMaj("Minus", "-"),
    icone: ["M7 21h10", "M5.5 14.5l7-7 5 5-7 7H7z", "M12.5 7.5l3-3 5 5-3 3"],
  },
  // Clore le projet : dossier fermé.
  "clore-projet": {
    libelle: "Clore le projet", barre: "annuaire", raccourci: ctrlAltMaj("Equal", "="),
    icone: ["M3 7h7l2 2h9v11H3z", "M8 14h8"],
  },
  // Rouvrir le projet : dossier ouvert.
  "rouvrir-projet": {
    libelle: "Rouvrir le projet", barre: "annuaire", raccourci: ctrlAltMaj("Equal", "="),
    icone: ["M3 7h7l2 2h9v3", "M3 7v13h15l3-8H6l-3 8"],
  },
  // --- Temps réel (Issue #283, RTC-2) ---
  // Ouvrir une session : écran et onde.
  "ouvrir-session": { libelle: "Ouvrir une session en direct", barre: "session", raccourci: ctrlAltMajLettre("O"), icone: ["M3 5h18v11H3z", "M8 20h8", "M12 16v4", "M9 10.5a3 3 0 0 1 6 0"] },
  // Rejoindre : flèche entrante dans un cadre.
  "rejoindre-session": { libelle: "Rejoindre la session", barre: "session", raccourci: ctrlAltMajLettre("J"), icone: ["M14 3h6v18h-6", "M3 12h11", "M10 8l4 4-4 4"] },
  // Quitter : flèche sortante d'un cadre.
  "quitter-session": { libelle: "Quitter la session", barre: "session", raccourci: ctrlAltMajLettre("Q"), icone: ["M10 3H4v18h6", "M9 12h11", "M16 8l4 4-4 4"] },
  // Suivre le présentateur : œil et lien.
  "suivre-presentateur": { libelle: "Suivre le présentateur", barre: "session", raccourci: ctrlAltMajLettre("F"), icone: ["M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z", "M12 9v6", "M9 12h6"] },
  // Naviguer librement : boussole.
  "naviguer-librement": { libelle: "Naviguer librement", barre: "session", raccourci: ctrlAltMajLettre("F"), icone: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M16 8l-2.5 5.5L8 16l2.5-5.5z"] },
  // Présenter : chevalet.
  "presenter": { libelle: "Présenter", barre: "session", raccourci: ctrlAltMajLettre("P"), icone: ["M3 4h18", "M5 4v10h14V4", "M12 14v3", "M8 21l4-4 4 4"] },
  // Désigner le présentateur : personne et chevalet.
  "designer-presentateur": { libelle: "Désigner comme présentateur", barre: "participant-session", raccourci: ctrlAltMajLettre("D"), icone: ["M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M2 15a5 5 0 0 1 10 0", "M14 6h8v7h-8z", "M18 13v3"] },
  // Transmettre l'animation : couronne et flèche.
  "transmettre-hote": { libelle: "Transmettre l’animation", barre: "participant-session", raccourci: ctrlAltMajLettre("H"), icone: ["M3 8l4 3 5-6 5 6 4-3-2 10H5z", "M8 21h8"] },
  // Reprendre l'animation : couronne et flèche circulaire.
  "reprendre-animation": { libelle: "Reprendre l’animation", barre: "session", raccourci: ctrlAltMajLettre("R"), icone: ["M4 9l3 2 5-5 5 5 3-2-1.5 7h-13z", "M4 21a8 8 0 0 0 16 0", "M20 18v3h-3"] },
  // Afficher la révision de la session : document et loupe.
  "afficher-revision-session": { libelle: "Afficher la révision de la session", barre: "session", raccourci: ctrlAltMajLettre("V"), icone: ["M6 2h9l5 5v8", "M6 2v20h7", "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M22 23l-2-2"] },
  // Passer à la nouvelle révision : document et flèche vers le haut.
  "passer-revision": { libelle: "Passer la session à la nouvelle révision", barre: "session", raccourci: ctrlAltMajLettre("N"), icone: ["M6 2h9l5 5v15H6z", "M13 18v-8", "M10 13l3-3 3 3"] },
  // Clore la session : écran barré.
  "clore-session": { libelle: "Clore la session", barre: "session", raccourci: ctrlAltMajLettre("C"), icone: ["M3 5h18v11H3z", "M8 20h8", "M9 8l6 5", "M15 8l-6 5"] },
  // --- Annotations enregistrées (RTC-3) ---
  // Annoter : épingle et crayon.
  "annoter": { libelle: "Annoter", barre: "session", raccourci: ctrlAltMajLettre("A"), icone: ["M12 22s-6-6.5-6-11a6 6 0 0 1 12 0c0 1.2-.4 2.5-1 3.8", "M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M15 21l1-3 5-5 2 2-5 5z"] },
  // Enregistrer l'annotation : épingle et coche.
  "enregistrer-annotation": { libelle: "Enregistrer l’annotation", barre: "annotation", raccourci: ctrlAltMajLettre("E"), icone: ["M10 21s-6-6.5-6-11a6 6 0 0 1 12 0", "M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M14 18l3 3 5-6"] },
  // Citer la sélection : épingle et objets encadrés.
  "citer-selection": { libelle: "Citer la sélection", barre: "annotation", raccourci: ctrlAltMajLettre("S"), icone: ["M3 3h7v7H3z", "M14 14h7v7h-7z", "M14 3l7 7", "M10 14l-7 7"] },
  // Participants de la session : trois personnes.
  "afficher-participants": { libelle: "Participants de la session", barre: "session", raccourci: ctrlAltMajLettre("K"), icone: ["M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6 21a6 6 0 0 1 12 0", "M5 10a2 2 0 1 0 0-4", "M19 10a2 2 0 1 0 0-4"] },
  // Annotations de la session : liste et épingle.
  "afficher-annotations": { libelle: "Annotations de la session", barre: "session", raccourci: ctrlAltMajLettre("L"), icone: ["M4 6h10", "M4 12h10", "M4 18h7", "M19 13s-3-3-3-5a3 3 0 0 1 6 0c0 2-3 5-3 5z"] },
  // Ouvrir une revue en direct : paquet scellé et onde.
  "ouvrir-revue": { libelle: "Ouvrir une revue en direct", barre: "session", raccourci: ctrlAltMajLettre("U"), icone: ["M4 7l8-4 8 4v10l-8 4-8-4z", "M4 7l8 4 8-4", "M12 11v10", "M9 15.5a3 3 0 0 1 6 0"] },
  // Voir le point de vue : épingle et cadre de visée.
  "voir-point-de-vue": { libelle: "Voir le point de vue", barre: "annotation", raccourci: ctrlAltMajLettre("G"), icone: ["M3 8V3h5", "M16 3h5v5", "M21 16v5h-5", "M8 21H3v-5", "M12 16s-3.5-3.5-3.5-6a3.5 3.5 0 0 1 7 0c0 2.5-3.5 6-3.5 6z"] },
});

/** Commandes des sessions en direct (Issue #283). */
export const COMMANDES_TEMPS_REEL: readonly CommandeTempsReel[] = [
  "ouvrir-session", "rejoindre-session", "quitter-session", "suivre-presentateur", "naviguer-librement", "presenter",
  "designer-presentateur", "transmettre-hote", "reprendre-animation", "afficher-revision-session", "passer-revision", "clore-session",
  "annoter", "enregistrer-annotation", "voir-point-de-vue", "citer-selection", "afficher-participants", "afficher-annotations", "ouvrir-revue",
];

/** Commandes du module Communication (COM-D14). */
export const COMMANDES_COM: readonly CommandeCollaboration[] = [
  "nouvelle-conversation", "envoyer-message", "partager-extrait", "action-liee", "audience-conversation", "accuser-reception", "nouvelle-demande",
  "ajouter-participant", "retirer-participant", "transferer-animation", "modifier-message", "retirer-message",
  "repondre-demande", "cloturer-demande", "rouvrir-demande", "reattribuer-demande",
  "joindre-photo", "epingler",
];

/**
 * `rendre-visible` et `reserver-equipe` sont les deux sens d'une même bascule (un seul bouton par fil, l'un ou l'autre
 * selon l'audience) : ils partagent donc leur raccourci, et seulement entre eux.
 */
export const BASCULE_AUDIENCE: readonly CommandeCollaboration[] = ["rendre-visible", "reserver-equipe"];
/** Bascules : les deux sens d'un même bouton partagent leur raccourci, et seulement entre eux. */
export const BASCULES: readonly (readonly CommandeCollaboration[])[] = [
  BASCULE_AUDIENCE, ["suspendre-participation", "reactiver-participation"], ["clore-projet", "rouvrir-projet"],
  ["suivre-presentateur", "naviguer-librement"],
];

/**
 * L'évènement clavier déclenche-t-il cette commande ? Alt et Maj enfoncés, Ctrl seulement si le raccourci l'exige (et
 * jamais sinon), ni Méta, touche par son code.
 */
export function declenche(e: { code: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, commande: CommandeCollaboration): boolean {
  const r = COMMANDES_COLLABORATION[commande].raccourci;
  return e.altKey && e.shiftKey && e.ctrlKey === !!r.ctrl && !e.metaKey && e.code === r.code;
}

/** Attributs du raccourci sur l'élément de la commande (`aria-keyshortcuts`, et la commande pour les recettes). */
export function propsRaccourci(commande: CommandeCollaboration): { "aria-keyshortcuts": string; "data-commande-collaboration": CommandeCollaboration } {
  return { "aria-keyshortcuts": COMMANDES_COLLABORATION[commande].raccourci.aria, "data-commande-collaboration": commande };
}
