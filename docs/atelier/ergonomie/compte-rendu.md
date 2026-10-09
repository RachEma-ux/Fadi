# Ergonomie « SketchUp pour le Web » — compte rendu des tranches D-156 à D-161

Source : `cahier-sketchup-web.md` ; audit, écart et plan : `etape-0-audit-ecart-plan.md`. Toutes les tranches sont
additives : la disposition classique à cinq repères reste celle par défaut, les recettes existantes passent toujours,
aucune règle d'`AGENTS.md` ni du cahier des charges de l'Atelier n'est modifiée.

## Ce qui est livré

| Tranche | Décision | Contenu | Preuves |
|---|---|---|---|
| 1 | D-156 | Disposition Canevas : dessin plein écran, barre d'outils flottante repliable, grille d'outils étendus, colonne d'icônes et panneaux flottants exclusifs, Instructeur, champ Mesures toujours visible, Échap → outil précédent, mobile en surcouche | `atelier-canevas.mjs` |
| 2 | D-157 | Navigation configurable : souris / trackpad, deux doigts, inversions, sensibilités, « Réinitialiser tout » ; 3D : molette maintenue = orbite, Maj = panoramique ; trackpad 2D et 3D | `navigation.test.ts`, `atelier-canevas.mjs` |
| 3 | D-158 | Outils Panoramique, Zoom, Zoom étendu ; Rapporteur ; accrochage Parallèle ; raccourcis configurables (infobulles, palette, Instructeur) | `nouveau.test.ts`, `atelier-canevas.mjs` |
| 4 | D-159 | Panneaux Affichage (masquer / réafficher, isolement, ombres d'affichage en 3D), Info modèle, Matériaux (lecture), arborescence dans le navigateur | `nouveau.test.ts`, `atelier-canevas.mjs` |
| 5 | D-160 | Menu principal : enregistrer maintenant (Ctrl + S), exporter, importer, imprimer (feuilles en PDF), partager après enregistrement confirmé, ouvrir un autre projet | `nouveau.test.ts`, `atelier-canevas.mjs` (dont hors-ligne) |
| 6 | D-161 | Qualité : catalogue de messages (français), focus des panneaux au clavier (ouverture, Échap, retour à l'icône), Entrée active le bouton focalisé hors tracé, cibles de 24 px au moins dans les panneaux et 44 px pour les outils et icônes au téléphone, recette desktop + mobile, axe-core | `nouveau.test.ts`, `atelier-canevas.mjs` |
| — | D-163 | Interface bilingue français / anglais (décision du maître d'ouvrage du 07/10/2026) : choix de la langue par appareil, dictionnaire anglais, couche de traduction de l'affichage, catalogue `messages.ts` en deux langues | `traduire.test.ts`, `interface-anglais.mjs` |
| — | D-162 | Scènes (vues 3D enregistrées) et Styles par classe accessibles depuis la colonne ; indicateur « Synchronisé » affiché seulement quand toutes les écritures sont acceptées | `atelier-canevas.mjs`, `parcours-scenario.mjs` |
| 7 | D-195 | Barre de l'Atelier réduite à Fichier · Plan (mode + liste des niveaux) · 3D · Documents · Planche · ⚙ · état ; Exporter / Importer / Harmonie dans Fichier ; affichage, accrochages et Canevas sous ⚙ ; barre d'actions flottante (Annuler, Rétablir, Cadrer ; Planche : Détacher) déplaçable et bornée à l'écran, mémorisée par appareil | `lots/barre-atelier.md`, recettes `planche-detachee-documents.mjs`, `planche-boutons.mjs`, `atelier-barre.mjs` |

## Métriques de succès (étape 0)

En disposition Canevas, sur desktop (1440 × 900) et téléphone émulé (390 × 844, tactile) : ouvrir le plan, choisir
un outil, tracer avec une valeur saisie (mur de 5,00 m exact), naviguer (molette, trackpad, 3D), ouvrir un panneau sans
redimensionner le dessin, enregistrer (Ctrl + S et menu) — recette `atelier-canevas.mjs` verte ; recettes existantes
vertes (`parcours-scenario`, `atelier-nouveau`, `atelier-documents`, `atelier-echanges`, `atelier-versions`,
`atelier-automatisation`, `atelier-complements`) ; aucune violation axe-core critique ou sérieuse (desktop et mobile).

Performance : le moteur 3D reste chargé à la demande (morceau `scene3d` séparé) ; le zoom étendu en 3D l'importe
dynamiquement. Les mesures indicatives du scénario de bout en bout (ouverture de l'Atelier, rechargement) restent
publiées par `parcours-scenario.mjs`.

## Écarts déclarés (décisions du maître d'ouvrage ou données à spécifier)

- **Interface anglaise** : livrée par D-163 sur décision du maître d'ouvrage (07/10/2026) ; `AGENTS.md` est adapté. Les
  données du projet, les exemples, la bibliothèque des bâtiments et les documents produits restent en français.
- **Matériaux peints sur une face** (pot de peinture, création de matériaux) : non livrés — ce serait une nouvelle
  donnée du modèle typé à spécifier ; le panneau Matériaux lit les compositions de murs (D-026).
- **Ombres** : option d'affichage (lumière de direction fixe), **pas** une étude d'ensoleillement : orientation, date
  et heure non évaluées (aucune donnée géographique supposée).
- **Retourner / coque extérieure / suis-moi complet** : opérations de solides qui dépendent du noyau OCCT, dont la
  licence relève de la section 10.1 du cahier des charges (décision ouverte).
- **Accrochage Parallèle** désactivé par défaut (comme Proche) pour ne pas changer les tracés existants ; il s'active
  dans le menu Accrochages.
