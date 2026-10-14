# Modular Project Cockpit — R3 · Intégration des outils métier

Date : 13 octobre 2026 · Base : R2 fusionnée dans `main`.

## Contrat d'architecture

Le cockpit orchestre les modules déjà implémentés. Il n'est ni un huitième module métier ni une copie de Parcours, de la géométrie de l'Atelier ou du catalogue des Documents. Les routes restent celles de `ProjectShell`, attachées à l'identifiant de projet authentifié.

- Cliquer sur une carte sélectionne l'étape et ouvre son panneau métier ; le raccourci ↗ adjacent ouvre directement un module existant.
- Le tableau propose la même action utile, et le panneau détail liste les autres outils propres à l'étape.
- Chaque action affiche son périmètre réel : **Disponible**, **Périmètre limité**, **Prérequis manquants**, **À vérifier**, **Non développé**.
- Une opération bloquée ou non développée **n'a jamais de lien actif** ; une voie de préparation peut ouvrir un module existant.
- Le statut des 21 étapes appartient exclusivement à Parcours. Les échéances et responsabilités restent dans le planning R2 ; les calculs avancés et KPI vérifiés restent hors du lot R3.

## Destinations concrètes

| Étapes | Accès privilégié | Route actuelle | Limites |
| --- | --- | --- | --- |
| 01 | Parcelle et sources | `?module=projets-sources` | Outil Parcelle existant, certaines fonctions encore en prototype |
| 02–03 | Parcours, étape exacte | `?module=parcours&etape=N` | Aucune opération créée |
| 04–08 | Programmation | `?module=programmation` | Hypothèses et liens au modèle exigent leurs prérequis |
| 09–12 | Atelier architectural | `?module=atelier` | Disponibilité dépendante des outils natifs, sans inventer de mode |
| 13–16 | Analyses métier | `?module=analyses` | Contrôles dans le domaine calculable seulement |
| 17–21 | Documents | `?module=documents` | Catalogue et actualité, documents non produits signalés |
| Toutes | Parcours, étape exacte | `?module=parcours&etape=N` | Recours conservé |

Les étapes 07–08 ouvrent le registre des hypothèses avec `?module=programmation&vue=hypotheses` uniquement si `GET programme` confirme un cas appliqué. La comparaison programme-modèle aux étapes 09–12 exige également des zones dessinées dans le modèle. Si la lecture API échoue, l'état reste « À vérifier », pas « Manquant ».

Le dossier reste consultable par les lecteurs autorisés ; aucun droit d'écriture n'est déduit du simple accès à une vue. Les routes et leurs contrôles serveur restent les seules autorités. Les vues réglementaires automatiques ne sont pas disponibles.

## Recette d'acceptation

1. Les 21 cartes présentent un raccourci vers un vrai module, sans élément interactif imbriqué dans un bouton.
2. Les raccourcis et le panneau conservant l'identité du projet, l'URL est toujours construite avec son identifiant encodé.
3. Sans cas de programme, la comparaison avancée n'est pas activable et une voie vers Programmation est proposée.
4. Sans zones dessinées, la comparaison est suspendue et une voie vers Atelier est proposée.
5. Les rôles lecteurs conservent la consultation et ne reçoivent aucune promesse d'édition.
6. Les fonctions non développées et la conformité réglementaire automatique n'ont pas de lien.
7. L'accueil, le planning R2, les six phases, les 21 étapes et les modes ordinateur/mobile ne régressent pas.

## Hors périmètre

R3 ne crée aucune fonction CAO/BIM manquante, ne certifie pas la conformité réglementaire et n'active pas les KPI métiers non validés (R4).
