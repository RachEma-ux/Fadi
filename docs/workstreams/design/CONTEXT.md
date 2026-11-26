# Design — Contexte

## Objectif

Rendre l'interface de la WebApp cohérente d'un module à l'autre, lisible sur téléphone Android d'abord et conforme
WCAG 2.2 AA, sans régression des décisions de design validées, en réduisant la dispersion (couleurs, points de rupture,
styles locaux) plutôt qu'en ajoutant des couches.

La conception cible vient d'une analyse Multi-Arena menée sans modifier le dépôt (brief validé le 25-11-2026 à 18 h 46,
équipe retenue le 26-11-2026 à 1 h 19, heure suisse). Elle est mise en œuvre par lots de PR ([PLAN-LOTS.md](PLAN-LOTS.md)).

## Périmètre

- Inclus : coquille (`AppShell`, `ProjectShell`, barre des modules), navigation globale et par projet, Accueil, Projets,
  page d'un projet et habillage d'une étape du Parcours, GeoData, Mon compte, organisations et administration, écrans
  publics, états transverses (vide, chargement, erreur, hors-ligne, droits insuffisants).
- Exclus : contenu métier des 21 étapes ; outils de dessin internes de l'Atelier, de la Planche et du Studio (jetons
  seulement) ; production ; tout lot non autorisé par le maître d'ouvrage.

## Sources canoniques

- `AGENTS.md` ; `CLAUDE.md` ; `docs/architecture.md`
- `Design/Design Historique.md` (12-10-2026) ; `Design/2026-10-14-Gabarit-modules.md`
- Issue de chantier : https://github.com/RachEma-ux/Fadi/issues/412

## Décisions du maître d'ouvrage

- **Navigation téléphone (25-11-2026, 19 h 51)** : sous 700 px, le rail est remplacé par une barre du bas de cinq entrées
  au plus (Accueil, Projets, Studio, GeoData, Plus) ; le rail reste au bureau. Amende Design Historique § 4.2. Dans
  GeoData, la barre du module et la barre globale sont fusionnées (pas d'empilement).
- **Équipe de conception retenue (26-11-2026, 1 h 19)** : équipe A avec les greffons G1 à G12.
- **Lots autorisés (26-11-2026, 1 h 21)** : L0 à L3, puis L4 (retour de l'action utile de la Tâche 3).

## Contraintes

- Les 21 étapes du Parcours sont intouchables ; interface bilingue (FR source, `en.json`) ; hors-ligne préservé.
- Seuils (arbitrage 7) : 2.5.8 (24 px) bloquant, 48 dp recommandé ; police Android 130 % bloquante ; toute nouvelle
  violation axe critique ou grave bloque, les autres vont dans `apps/web/design-exceptions.json`, liste datée qui ne
  peut que se réduire.
- Plafonds de dispersion (`apps/web/design-plafonds.json`) en cliquet : ils ne remontent jamais.
- Preuves : émulation Pixel 7 (412 px) et bureau 1 440 px ; capture sur un vrai téléphone Android à chaque PR.

## Hypothèses et questions ouvertes

- Neuf décisions mineures de conception restent ouvertes ; leur option recommandée s'applique par défaut.
