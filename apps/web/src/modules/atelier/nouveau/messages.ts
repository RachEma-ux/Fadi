/**
 * Catalogue de messages de la couche d'ergonomie (D-161) : libellés de la disposition Canevas, des panneaux et du
 * menu principal, regroupés pour être relus et traduits d'un seul endroit. Seul le français est livré : AGENTS.md
 * impose une application en français ; ouvrir une autre langue est une décision du maître d'ouvrage. Pur.
 */
export type Langue = "fr";

export const LANGUE_INTERFACE: Langue = "fr";
export const NOM_LANGUE: Record<Langue, string> = { fr: "Français" };

const FR = {
  "canevas.panneaux": "Panneaux",
  "panneau.instructeur": "Instructeur",
  "panneau.entite": "Info entité",
  "panneau.outliner": "Navigateur",
  "panneau.modifications": "Modifications",
  "panneau.versions": "Versions",
  "panneau.affichage": "Affichage",
  "panneau.materiaux": "Matériaux",
  "panneau.modele": "Info modèle",
  "panneau.navigation": "Navigation",
  "panneau.raccourcis": "Raccourcis",
  "panneau.scenes": "Scènes",
  "panneau.styles": "Styles",
  "panneau.scenes.aide": "Vues 3D enregistrées (scènes) : ouvertes dans la vue 3D",
  "panneau.styles.aide": "Styles d'affichage par classe : ouverts dans la vue 3D",
  "panneau.fermer": "Fermer le panneau {titre}",
  "panneau.replier": "Replier le panneau {titre}",
  "bas.aide": "Aide de l'outil actif",
  "bas.langue": "L'interface de Fadi est en français.",
  "menu.titre": "Menu principal",
  "menu.fichier": "☰ Fichier",
  "menu.enregistrer": "Enregistrer maintenant",
  "menu.exporter": "Exporter…",
  "menu.importer": "Importer…",
  "menu.imprimer": "Imprimer (feuilles en PDF)…",
  "menu.partager": "Partager…",
  "menu.projets": "Ouvrir un autre projet…",
} as const;

export type CleMessage = keyof typeof FR;

export const CATALOGUE: Record<Langue, Record<CleMessage, string>> = { fr: FR };

/** Message du catalogue, avec remplacement des paramètres `{nom}` ; une clé sans paramètre fourni reste visible. */
export function t(cle: CleMessage, params: Record<string, string> = {}, langue: Langue = LANGUE_INTERFACE): string {
  return CATALOGUE[langue][cle].replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
}
