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
    implemented: false,
    status: "Pas encore implémenté : import et suivi des données sources (relevés, PLU, documents).",
  },
  {
    id: "parcours",
    label: "Parcours",
    implemented: true,
    status: "Les 21 étapes sont listées comme emplacements ; leur contenu métier réel reste à migrer (Lot 3).",
  },
  {
    id: "programmation",
    label: "Programmation",
    implemented: false,
    status: "Pas encore implémenté : exigences, hypothèses et recommandations de programme.",
  },
  {
    id: "atelier",
    label: "Atelier architectural",
    implemented: true,
    status: "Murs créés ici sont persistés sur le projet (révision du modèle incluse) et annulables/rétablissables.",
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
