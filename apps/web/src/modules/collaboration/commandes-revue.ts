/**
 * Commandes de la revue externe (phase 4, Issue #262) — règle d'or (AGENTS.md) : chaque commande a sa propre icône
 * (jamais partagée, ni avec une autre commande de revue ni avec une commande de collaboration), sa place dans la barre
 * où elle agit, et un raccourci clavier affiché à côté de la commande et déclaré par `aria-keyshortcuts`. Sur écran
 * tactile, le bouton nommé reste visible : le raccourci le complète. Pur : aucun DOM, testé par `commandes-revue.test.ts`.
 *
 * Deux écrans : l'espace du destinataire (`/revues/:id`, barres « paquet » et « constat ») et le panneau « Revues
 * externes » de l'équipe (Collaboration, barres « revues » et « destinataires »). Les choix d'une même décision (revue
 * satisfaisante ou constats ; approuver ou refuser) sont les options d'UNE commande, ouverte par son raccourci.
 */

export type CommandeRevue =
  | "nouveau-constat" | "envoyer-constat" | "repondre-revue" | "decider-revue"
  | "preparer-revue" | "inviter-destinataire" | "partager-paquet" | "nouvelle-version" | "revoquer-acces";

export interface RaccourciRevue { code: string; libelle: string; aria: string }
export interface DefinitionCommandeRevue {
  libelle: string;
  ecran: "destinataire" | "equipe";
  barre: "paquet" | "constat" | "revues" | "destinataires";
  raccourci: RaccourciRevue;
  icone: readonly string[];
}

/**
 * Alt+Maj+F6 à F9 pour le destinataire ; Alt+Maj+Y et Alt+Maj+ponctuation (touches physiques Virgule, Point, Barre
 * oblique, Barre oblique inverse) pour l'équipe : aucun autre raccourci de Fadi ne les emploie (Alt+Maj+lettre : Planche ;
 * Alt+Maj+chiffre et crochet : collaboration et participants) ; `code` = touche physique (AZERTY compris). Évités : F4
 * (fermeture de fenêtre), F5 (rechargement), F10 (menu contextuel), F11 et F12.
 */
const altMaj = (touche: string, code: string): RaccourciRevue => ({ code, libelle: `Alt+Maj+${touche}`, aria: `Alt+Shift+${touche}` });

export const COMMANDES_REVUE: Readonly<Record<CommandeRevue, DefinitionCommandeRevue>> = Object.freeze({
  // Bulle avec un plus : écrire un constat.
  "nouveau-constat": { libelle: "Nouveau constat", ecran: "destinataire", barre: "paquet", raccourci: altMaj("F6", "F6"),
    icone: ["M4 5h16v11H9l-5 4z", "M12 8v5", "M9.5 10.5h5"] },
  // Avion en papier : envoyer le constat.
  "envoyer-constat": { libelle: "Envoyer le constat", ecran: "destinataire", barre: "constat", raccourci: altMaj("F7", "F7"),
    icone: ["M22 2 11 13", "M22 2 15 22l-4-9-9-4z"] },
  // Presse-papiers coché : répondre à la revue (constats ou revue satisfaisante).
  "repondre-revue": { libelle: "Répondre à la revue", ecran: "destinataire", barre: "paquet", raccourci: altMaj("F8", "F8"),
    icone: ["M9 4h6v3H9z", "M7 5H5v16h14V5h-2", "M9 14l2 2 4-4"] },
  // Sceau : décision de l'approbateur nommé (approuver ou refuser).
  "decider-revue": { libelle: "Décider (approbation)", ecran: "destinataire", barre: "paquet", raccourci: altMaj("F9", "F9"),
    icone: ["M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12z", "M9 14.5 7 21l5-2 5 2-2-6.5", "M10 9l1.5 1.5L14 8"] },
  // Dossier avec loupe : préparer un paquet de revue.
  "preparer-revue": { libelle: "Préparer une revue", ecran: "equipe", barre: "revues", raccourci: altMaj("Y", "KeyY"),
    icone: ["M3 7h6l2 2h10v10H3z", "M15.5 15.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 17l2 2"] },
  // Personne avec un plus : inviter un destinataire nommé.
  "inviter-destinataire": { libelle: "Inviter un destinataire", ecran: "equipe", barre: "destinataires", raccourci: altMaj(",", "Comma"),
    icone: ["M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M3 21v-1a7 7 0 0 1 11-5.7", "M19 14v6", "M16 17h6"] },
  // Boîte et flèche montante : partager le paquet figé.
  "partager-paquet": { libelle: "Partager le paquet", ecran: "equipe", barre: "revues", raccourci: altMaj(".", "Period"),
    icone: ["M4 12v8h16v-8", "M12 3v12", "M8 7l4-4 4 4"] },
  // Deux feuilles décalées : nouvelle version qui remplace la précédente.
  "nouvelle-version": { libelle: "Nouvelle version", ecran: "equipe", barre: "revues", raccourci: altMaj("/", "Slash"),
    icone: ["M8 3h9l3 3v12H8z", "M5 6v15h11", "M13 9v6", "M10 12h6"] },
  // Clé barrée : révoquer l'accès d'un destinataire.
  "revoquer-acces": { libelle: "Révoquer l’accès", ecran: "equipe", barre: "destinataires", raccourci: altMaj("\\", "Backslash"),
    icone: ["M7.5 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M11 12h10", "M18 12v3", "M3 3l18 18"] },
});

/** L'évènement clavier déclenche-t-il cette commande ? Alt et Maj enfoncés, ni Ctrl ni Méta, touche par son code. */
export function declencheRevue(e: { code: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, commande: CommandeRevue): boolean {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === COMMANDES_REVUE[commande].raccourci.code;
}

export function propsRaccourciRevue(commande: CommandeRevue): { "aria-keyshortcuts": string; "data-commande-revue": CommandeRevue } {
  return { "aria-keyshortcuts": COMMANDES_REVUE[commande].raccourci.aria, "data-commande-revue": commande };
}
