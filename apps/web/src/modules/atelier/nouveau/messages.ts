/**
 * Catalogue de messages de la couche d'ergonomie (D-161, D-163) : libellés de la disposition Canevas, des panneaux
 * et du menu principal, en français (langue source) et en anglais. Le reste de l'interface est traduit à
 * l'affichage par le dictionnaire `lib/i18n/en.json`. Pur.
 */
import { LANGUE, type Langue } from "../../../lib/i18n";

export type { Langue };
export const LANGUE_INTERFACE: Langue = LANGUE;

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

const EN: Record<CleMessage, string> = {
  "canevas.panneaux": "Panels",
  "panneau.instructeur": "Instructor",
  "panneau.entite": "Entity info",
  "panneau.outliner": "Navigator",
  "panneau.modifications": "Changes",
  "panneau.versions": "Versions",
  "panneau.affichage": "Display",
  "panneau.materiaux": "Materials",
  "panneau.modele": "Model info",
  "panneau.navigation": "Navigation",
  "panneau.raccourcis": "Shortcuts",
  "panneau.scenes": "Scenes",
  "panneau.styles": "Styles",
  "panneau.scenes.aide": "Saved 3D views (scenes): opened in the 3D view",
  "panneau.styles.aide": "Display styles by class: opened in the 3D view",
  "panneau.fermer": "Close the {titre} panel",
  "panneau.replier": "Collapse the {titre} panel",
  "bas.aide": "Help for the active tool",
  "menu.titre": "Main menu",
  "menu.fichier": "☰ File",
  "menu.enregistrer": "Save now",
  "menu.exporter": "Export…",
  "menu.importer": "Import…",
  "menu.imprimer": "Print (sheets as PDF)…",
  "menu.partager": "Share…",
  "menu.projets": "Open another project…",
};

export const CATALOGUE: Record<Langue, Record<CleMessage, string>> = { fr: FR, en: EN };

/** Message du catalogue, avec remplacement des paramètres `{nom}` ; une clé sans paramètre fourni reste visible. */
export function t(cle: CleMessage, params: Record<string, string> = {}, langue: Langue = LANGUE_INTERFACE): string {
  return CATALOGUE[langue][cle].replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
}
