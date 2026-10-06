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
  // Mode Planche (cahier-planche, lot 2).
  "mode.planche": "Planche",
  "mode.planche.aide": "Planche : géométrie libre (arêtes et faces), brouillon local",
  "planche.chargement": "Chargement de la Planche…",
  "planche.brouillon": "Brouillon local — non enregistré dans le projet (lot 7)",
  "planche.brouillon.aide": "Le dessin de la Planche est conservé dans ce navigateur seulement ; il n'est ni envoyé au serveur ni partagé.",
  "planche.brouillon.indisponible": "Stockage local indisponible : le brouillon n'est conservé que dans cette page.",
  "planche.outils": "Outils de la Planche",
  "planche.rechercher": "Rechercher un outil",
  "planche.plus": "Plus d'outils",
  "planche.recents": "Outil récent",
  "planche.grille": "Outils étendus",
  "planche.prevu": "{outil} : prévu au lot {lot}.",
  "planche.prevu.court": "prévu au lot {lot}",
  "planche.lecture": "{outil} : projet en lecture seule (navigation et sélection seulement).",
  "planche.annuler": "Annuler",
  "planche.retablir": "Rétablir",
  "planche.annuler.titre": "Annuler {operation} (Ctrl Z)",
  "planche.retablir.titre": "Rétablir {operation} (Ctrl Y)",
  "planche.rien.annuler": "Rien à annuler.",
  "planche.rien.retablir": "Rien à rétablir.",
  "planche.annule": "Annulé : {operation}.",
  "planche.retabli": "Rétabli : {operation}.",
  "planche.vue": "Zone de dessin de la Planche : cliquez pour utiliser l'outil actif ; bouton du milieu = orbite, Maj + bouton du milieu = panoramique, molette = zoom",
  "planche.webgl": "Vue 3D indisponible : ce navigateur ne fournit pas WebGL2.",
  "planche.etat": "Barre d'état",
  "planche.mesures": "Mesures",
  "planche.mesures.aide": "Tapez une valeur (sans cliquer dans le champ), puis Entrée",
  "planche.saisie.refusee": "Saisie non reconnue : {texte}",
  "planche.saisie.inactive": "Le champ Mesures n'accepte pas de valeur à cette étape.",
  "planche.modificateurs": "Touches modificatrices",
  "planche.mod.maj": "Maj",
  "planche.mod.ctrl": "Ctrl",
  "planche.mod.alt": "Alt",
  "planche.mod.droite": "Flèche droite : axe rouge",
  "planche.mod.gauche": "Flèche gauche : axe vert",
  "planche.mod.haut": "Flèche haut : axe bleu",
  "planche.mod.bas": "Flèche bas : parallèle / perpendiculaire",
  "planche.mod.maj.aide": "Maj maintenue tant que le bouton est enfoncé ; appui long : verrouillée jusqu'au prochain appui",
  "planche.recherche.titre": "Rechercher un outil (Maj + -)",
  "planche.recherche.champ": "Nom de l'outil (français ou anglais)",
  "planche.recherche.vide": "Aucun outil trouvé.",
  "planche.fermer": "Fermer",
  "planche.instructeur.aucun": "Aucun outil actif.",
  "planche.instructeur.etapes": "Opération",
  "planche.instructeur.modificateurs": "Touches modificatrices",
  "planche.instructeur.apres": "Ensuite",
  "planche.instructeur.releve": "Statut du relevé : {statut}",
  "planche.instructeur.echap": "Échap : annule l'opération en cours ; sans opération en cours, revient à l'outil précédent.",
  "planche.camera.fov": "Champ de vision : {valeur}°",
  "planche.outil.choisi": "Outil : {outil}.",
  "planche.edition": "Édition : {nom}",
} as const;

export type CleMessage = keyof typeof FR;

export const CATALOGUE: Record<Langue, Record<CleMessage, string>> = { fr: FR };

/** Message du catalogue, avec remplacement des paramètres `{nom}` ; une clé sans paramètre fourni reste visible. */
export function t(cle: CleMessage, params: Record<string, string> = {}, langue: Langue = LANGUE_INTERFACE): string {
  return CATALOGUE[langue][cle].replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
}
