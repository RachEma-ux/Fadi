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
    status: "La parcelle du projet dans l'outil Parcelle du prototype (import KML/KMZ, bornes, cotes, dossier), transmise au modèle de l'Atelier ; sources des étapes ; archive de projet (sauvegarde, import, copie).",
  },
  {
    id: "parcours",
    label: "Parcours",
    implemented: true,
    status: "Les 21 étapes avec leur formulaire métier, leurs propositions Harmonie arbitrables (péremption, rapports), leurs indicateurs, leur transmission, l'outil Parcelle (01), l'Atelier et la sous-page « Harmonie du bâtiment » (10, 11), les sources de l'étape.",
  },
  {
    id: "programmation",
    label: "Programmation",
    implemented: true,
    status: "Répartition programmatique par type de bâtiment (fourchettes, ratios, adjacences), bibliothèque des bâtiments et cas de programme appliqué (fiches, liaison au modèle dessiné, registre des hypothèses, transfert surfacique à total constant).",
  },
  {
    id: "atelier",
    label: "Atelier architectural",
    implemented: true,
    status: "L'Atelier reconstruit sur le modèle typé du projet : plan 2D et outils de dessin, vue 3D, niveaux, coupes et façades de travail, inspecteur, annuler / rétablir, exports DXF / SVG / CSV / PNG ; documents dérivés (vues, feuilles, tableaux, PDF au catalogue), toitures en pente, garde-corps, blocs et composants, contraintes d'esquisse, phases ; échanges IFC 4.3 (export validé par IfcOpenShell, import en représentations) et import DXF 2D avec rapport de fidélité ; chaque modification est une commande enregistrée avec révision contrôlée, utilisable hors ligne.",
  },
  {
    id: "analyses",
    label: "Analyses métier",
    implemented: true,
    status: "Quantités dérivées du modèle, contrôles traçables (règles de flow-v62, transmissions, chiffrage, structure déclarée), résultats des étapes, variantes de programme ; contrôles réglementaires (accessibilité, incendie) non portés.",
  },
  {
    id: "documents",
    label: "Documents",
    implemented: true,
    status: "Catalogue des documents produits depuis la révision courante (rapports Harmonie, bilan du bâtiment, plans de lecture, tableaux, archive) avec leur actualité ; dessins techniques et exports DXF / PNG restent dans l'Atelier.",
  },
  {
    id: "collaboration",
    label: "Collaboration",
    implemented: true,
    status: "Commentaires par projet et par étape, journal des révisions, synchronisation hors-ligne de l'Atelier (file locale des modifications, envoyée dans l'ordre) et lecture hors-ligne ; partage multi-utilisateur et droits non disponibles (Lot 4), annoncés tels quels.",
  },
];
