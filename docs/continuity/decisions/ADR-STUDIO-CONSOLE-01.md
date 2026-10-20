# ADR-STUDIO-CONSOLE-01 — Console de Studio : les outils des quatre domaines ouverts sans projet

Statut : **Proposé** (Proposé / Accepté / Remplacé) — demande du maître d'ouvrage du 20 octobre 2026, implémentée ; l'acceptation reste à constater.
Date : 20 octobre 2026 (Sandbox : Planche propre, même jour).
Chantier : `studio`.
Complète [ADR-STUDIO-NAV-01](ADR-STUDIO-NAV-01.md) (menu « Studio », routes) ; **déroge** à sa règle « toute géométrie exige une variante » (NAV-003 : aucun projet fictif, aucune géométrie orpheline) — voir « Écart assumé ».

## Demande

Ajouter au menu « Studio » un article **« Console »** qui ouvre une page de cinq cartes : « 00 Sandbox (coming soon) », « 01 Dessin et modélisation », « 02 BIM et coordination », « 03 Visualisation, rendu et immersion », « 04 Documentation, métrés et collaboration ». La carte 00 ouvre une page « bientôt disponible » ; chacune des cartes 01 à 04 ouvre l'outil correspondant **indépendamment de tout projet, sans charger de projet**.

## Décision

| Route | Rôle |
|---|---|
| `/studio/console` | Page des cinq cartes. |
| `/studio/console/sandbox` | La Planche de Sandbox (voir « Sandbox : une Planche à soi » ci-dessous). |
| `/studio/console/outil?domaine=dessin\|bim\|visualisation\|documentation[&planche=2d\|3d\|double]` | L'outil du domaine, sans projet. `domaine` obligatoire, une seule fois ; `planche` seulement avec `dessin` ; tout le reste donne « adresse non reconnue ». |

- Le domaine est dans la requête (comme sur une variante) : changer de domaine ou de planche ne décharge pas ce qui est dessiné.
- L'espace de travail est le **même** composant (`VariantWorkspace`) en mode `autonome` : contexte local (document vide, `console/contexte-console.ts`), aucune lecture ni aucun enregistrement, aucune requête de projet, d'étude ou de variante, aucun brouillon conservé sur l'appareil.
- Indisponibles dans ce mode, et dit comme tel : Enregistrer sur le serveur (remplacé par « Enregistrer dans un projet », ci-dessous), exports SVG / DXF / IFC du serveur, « Feuilles et dossier », panneaux Propriétés et exigences, Commentaires et observations, Historique des révisions, Quantités, Publications, bouton Commentaires. Disponibles : dessin, Planche 3D, visualisation et export PNG, import DXF dans le brouillon, feuille de présentation, matrice d'échanges.
- Quitter l'outil (lien, retour, fermeture de l'onglet) avec un tracé non vide demande confirmation : le dessin n'existe que dans la page.
- « Console » est traduit « Bracket » par le dictionnaire anglais pour le support des réseaux (Atelier) : l'entrée de menu, le titre et le fil portent `translate="no"` pour rester « Console ».

## Sandbox : une Planche à soi

Demande du maître d'ouvrage du 20 octobre 2026 : « cloner la Planche de l'étape 10 dans Sandbox ; aucune relation entre les deux ; la Planche de Sandbox doit exister par elle-même sans solliciter l'étape 10 pour quoi que ce soit ». La carte « 00 Sandbox » n'est donc plus « bientôt disponible ».

- **Copie, pas partage** : `packages/sandbox-planche-model` (copie du modèle `@parcours/planche-model`, tests compris) et `apps/web/src/modules/studio/console/sandbox/` (interface : outils, vue, état d'affichage, textes, barre d'actions, navigation). Aucun import de `modules/atelier`, d'`@parcours/atelier-model`, de `@parcours/planche-model` ni du client d'API (test `sandbox/independance.test.ts`). Les deux copies évoluent désormais séparément : une correction de l'une n'atteint pas l'autre.
- **Ce qui n'est pas copié, car lié à un projet** : les Planches nommées du projet, leurs commandes, l'export IFC du serveur, les catalogues de profilés sourcés (la section se saisit ou vient d'une face), l'envoi au journal de l'Atelier. Restent : tous les outils de dessin et de modification, le champ Mesures, les profilés saisis, la 3D, les exports OBJ / STL / PNG, la Planche détachable.
- **Stockage propre** : brouillon `sandbox-planche-brouillon`, préférences `fadi.sandbox.prefs`, précision `fadi.sandbox.planche.precision` — rien ne se partage avec la Planche de l'étape 10.
- **Style isolé** : `sandbox.css`, toute règle sous `.sandbox-planche` (testé).
- **Chargement** : page chargée à la demande (three.js, Manifold), jamais dans la coquille de Studio ; contrôle de découpage du build vert.
- **Écart de nommage** : les textes de la copie (`sandbox/messages.ts`) reprennent ceux de l'Atelier, avec le brouillon renommé « Brouillon Sandbox ».
- **Non copié mais partagé, car général à l'application** : `lib/i18n` (langue), `lib/local-store` (IndexedDB générique), `components/ChoixLangue`.

## Place dans le menu

« Console » est un **article principal de Studio** : sous l'en-tête « Studio », hors du sous-menu dépliable (donc visible aussi quand il est replié), avec son icône propre, surligné sur toutes les pages de la Console. « Choisir une étude » reste seul dans « Accès Studio » ; les quatre domaines sont inchangés.

## Enregistrer dans un projet

Le bouton Enregistrer devient « Enregistrer dans un projet » dès qu'il y a des commandes. Le dialogue (`console/DialogueEnregistrerConsole.tsx`) demande un projet (rôle « lecteur » exclu) et un nom d'étude, puis `console/transfert.ts` **crée une étude neuve** et lui envoie les commandes de la Console par enveloppes de 500, chacune sur la révision de la précédente, puis ouvre la variante créée. Jamais dans une étude existante. Le plan d'envoi garde ses `requestId` : après un échec la reprise rejoue les mêmes demandes, sans recréer l'étude ni dupliquer un lot. La Console reste non liée : elle n'est pas rattachée au projet après l'enregistrement.

## Écart assumé

NAV-003 interdit un projet fictif et une géométrie sans variante. La Console n'en crée aucun : le document est tenu dans la page, jamais envoyé au serveur, jamais rattaché à un projet. Ce qui est dessiné est perdu à la fermeture de la page. Les identifiants `console` du contexte local ne quittent pas le navigateur.

## Points ouverts (décisions du maître d'ouvrage)

1. *(Résolu)* Libellé « Sandbox » ; enregistrement dans un projet demandé et livré.
2. Compatibilité du document initial côté serveur avec `newStudioDocument` du client : non vérifiée de bout en bout.
3. Le domaine 04 est presque vide sans projet (ses panneaux lisent une étude). Acceptable, ou masquer la carte ?

## Preuves

`npm run typecheck`, `npm run build` ; tests Vitest du web (dont `routes-studio.test.ts` (routes), `console/cartes.test.ts` (cartes et contexte local), `routes/MenuStudio.test.ts` (entrée « Console »), `console/transfert.test.ts` (création unique, lots, reprise). **Non vérifié** : rendu dans un navigateur et recette de bout en bout (navigateur et base de test indisponibles dans la session de développement) ; tests API non lancés (`TARGET_REQUIRED`, base de test absente).
