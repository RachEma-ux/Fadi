/**
 * Les 7 modules du brief (voir docs/architecture.md, « Shape: a modular
 * monolith »). Un seul endroit décide quels modules existent et quel est
 * leur statut réel — pour que l'UI ne puisse pas prétendre qu'un module est
 * prêt alors qu'il ne l'est pas.
 */
export interface ModuleDescriptor {
  id: string;
  label: string;
  /** true seulement si le module a un écran fonctionnel au-delà d'un statut. */
  implemented: boolean;
  status: string;
}

export const MODULES: ModuleDescriptor[] = [
  {
    id: "projets-sources",
    label: "Projets et sources",
    implemented: true,
    status: "La parcelle du projet dans l'outil Parcelle du prototype (import KML/KMZ, bornes, cotes, dossier), transmise au modèle de l'Atelier ; pièces jointes à venir.",
  },
  {
    id: "parcours",
    label: "Parcours",
    implemented: true,
    status: "Les 21 étapes avec leur formulaire métier, leurs propositions Harmonie arbitrables, leurs indicateurs et leur transmission ; les outils Parcelle (01) et Atelier (10, 11) restent à porter.",
  },
  {
    id: "programmation",
    label: "Programmation",
    implemented: true,
    status: "Répartition programmatique par type de bâtiment (fourchettes, ratios, adjacences) et cas de programme importé ; bibliothèque des bâtiments à porter.",
  },
  {
    id: "atelier",
    label: "Atelier architectural",
    implemented: true,
    status: "Le moteur de l'Atelier du prototype (3D, plan, coupes, façades, niveaux, outils de dessin, exports) sur le modèle du projet, persisté avec révision contrôlée.",
  },
  {
    id: "analyses",
    label: "Analyses métier",
    implemented: false,
    status: "Pas encore implémenté : contrôles traçables (accessibilité, incendie, structure…).",
  },
  {
    id: "documents",
    label: "Documents",
    implemented: false,
    status: "Pas encore implémenté : génération de plans, tableaux et rapports à partir du modèle.",
  },
  {
    id: "collaboration",
    label: "Collaboration",
    implemented: false,
    status: "Pas encore implémenté : accès partagé, commentaires et synchronisation (Lot 4).",
  },
];
