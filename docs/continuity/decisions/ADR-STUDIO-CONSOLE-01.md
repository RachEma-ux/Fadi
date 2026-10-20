# ADR-STUDIO-CONSOLE-01 — Console de Studio : les outils des quatre domaines ouverts sans projet

Statut : **Proposé** (Proposé / Accepté / Remplacé) — demande du maître d'ouvrage du 20 octobre 2026, implémentée ; l'acceptation reste à constater.
Date : 20 octobre 2026.
Chantier : `studio`.
Complète [ADR-STUDIO-NAV-01](ADR-STUDIO-NAV-01.md) (menu « Studio », routes) ; **déroge** à sa règle « toute géométrie exige une variante » (NAV-003 : aucun projet fictif, aucune géométrie orpheline) — voir « Écart assumé ».

## Demande

Ajouter au menu « Studio » un article **« Console »** qui ouvre une page de cinq cartes : « 00 Sadbox (coming soon) », « 01 Dessin et modélisation », « 02 BIM et coordination », « 03 Visualisation, rendu et immersion », « 04 Documentation, métrés et collaboration ». La carte 00 ouvre une page « bientôt disponible » ; chacune des cartes 01 à 04 ouvre l'outil correspondant **indépendamment de tout projet, sans charger de projet**.

## Décision

| Route | Rôle |
|---|---|
| `/studio/console` | Page des cinq cartes. |
| `/studio/console/sadbox` | Page « Bientôt disponible » (aucun outil, aucune création). |
| `/studio/console/outil?domaine=dessin\|bim\|visualisation\|documentation[&planche=2d\|3d\|double]` | L'outil du domaine, sans projet. `domaine` obligatoire, une seule fois ; `planche` seulement avec `dessin` ; tout le reste donne « adresse non reconnue ». |

- Le domaine est dans la requête (comme sur une variante) : changer de domaine ou de planche ne décharge pas ce qui est dessiné.
- L'espace de travail est le **même** composant (`VariantWorkspace`) en mode `autonome` : contexte local (document vide, `console/contexte-console.ts`), aucune lecture ni aucun enregistrement, aucune requête de projet, d'étude ou de variante, aucun brouillon conservé sur l'appareil.
- Indisponibles dans ce mode, et dit comme tel : Enregistrer, exports SVG / DXF / IFC du serveur, « Feuilles et dossier », panneaux Propriétés et exigences, Commentaires et observations, Historique des révisions, Quantités, Publications, bouton Commentaires. Disponibles : dessin, Planche 3D, visualisation et export PNG, import DXF dans le brouillon, feuille de présentation, matrice d'échanges.
- Quitter l'outil (lien, retour, fermeture de l'onglet) avec un tracé non vide demande confirmation : le dessin n'existe que dans la page.
- « Console » est traduit « Bracket » par le dictionnaire anglais pour le support des réseaux (Atelier) : l'entrée de menu, le titre et le fil portent `translate="no"` pour rester « Console ».

## Écart assumé

NAV-003 interdit un projet fictif et une géométrie sans variante. La Console n'en crée aucun : le document est tenu dans la page, jamais envoyé au serveur, jamais rattaché à un projet. Ce qui est dessiné est perdu à la fermeture de la page. Les identifiants `console` du contexte local ne quittent pas le navigateur.

## Points ouverts (décisions du maître d'ouvrage)

1. Libellé de la carte 00 : écrit « **Sadbox** » comme demandé ; confirmer s'il s'agit de « Sandbox ».
2. Faut-il un moyen d'enregistrer le travail de la Console dans un projet (copier vers une étude) ? Non livré.
3. Le domaine 04 est presque vide sans projet (ses panneaux lisent une étude). Acceptable, ou masquer la carte ?

## Preuves

`npm run typecheck`, `npm run build` ; tests Vitest du web (813 réussis) dont `routes-studio.test.ts` (routes), `console/cartes.test.ts` (cartes et contexte local), `routes/MenuStudio.test.ts` (entrée « Console »). **Non vérifié** : rendu dans un navigateur et recette de bout en bout (navigateur et base de test indisponibles dans la session de développement) ; tests API non lancés (`TARGET_REQUIRED`, base de test absente).
