# Lot 8 — Automatisation et assistant à boucle contrôlée — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010). Décision : D-021.

Ouvrir : un projet, `?module=atelier`, panneau de droite, « Automatisation et assistant » (sur téléphone : onglet des
modifications).

## Fait

| Sujet | Résultat |
| --- | --- |
| API de script | Un script est un **gabarit de commandes** (`packages/atelier-model/src/automatisation/scripts.ts`) : paramètres typés et bornés, boucles bornées (entiers, niveaux du modèle), expressions arithmétiques sûres (analyseur dédié, aucune évaluation de code), commandes `interne.*` interdites. `POST /projects/:id/atelier/scripts/:id/essai` : développement + exécution à blanc + aperçu (objets affectés, documents à recalculer) ; `POST …/executer` : le même cœur transactionnel que `POST /commands` (mêmes droits, mêmes refus, journal « Script « nom » vN »). |
| Bibliothèque versionnée | Scripts intégrés : trame de poteaux, enceinte rectangulaire de murs, un plan par niveau. Scripts du projet : `POST /atelier/scripts` (validation de forme, version + 1, immuables), `GET /atelier/scripts`, `GET /scripts/:id/versions` ; exécution d'une version précise. |
| Assistant à boucle contrôlée | `boucleControlee` (`automatisation/assistant.ts`) : intention → générateur (adaptateur) → séquence inspectable + **journal des hypothèses** → exécution à blanc → auto-correction (retrait de la commande refusée, noté) **≤ 3 itérations** → aperçu. `POST /atelier/assistant/propositions` n'écrit **rien** dans le modèle ; `POST …/:id/accepter` (accord explicite) exécute par le cœur transactionnel ; `…/refuser`. Historique des propositions (`atelier_propositions`). |
| Générateur sans fournisseur | « regles-fadi/1 » : **feuilles et quantités** (un plan et une feuille par niveau sans plan, format choisi pour que le plan tienne, hypothèses : échelle, format, numérotation), **pièces détectées** depuis les murs fermés (noms provisoires « à nommer », aucun usage déduit), **trame de poteaux** (comprise depuis l'intention : « 4 x 3 tous les 6 m hauteur 3 » ; hauteur du niveau sinon, et si elle manque, la règle la demande au lieu de la supposer), **ouvertures hors mur** ramenées dans leur hôte. Intention non reconnue : dite, avec des exemples. Le fournisseur de modèle de langage reste une décision du maître d'ouvrage (§10.1) : l'adaptateur est prêt, aucun n'est appelé. |
| Cache | Clé = intention normalisée + version des règles + niveau ; la dernière séquence acceptée est réessayée sur l'état courant et régénérée si elle ne passe plus. |
| Interface | `apps/web/src/modules/atelier/nouveau/panneaux/Automatisation.tsx` : intention et suggestions, statut, essais, hypothèses, aperçu (créations, modifications, suppressions, documents à recalculer), séquence, Accepter / Refuser ; scripts avec formulaire de paramètres, « Essayer (à blanc) » puis « Exécuter » (désactivé tant que l'essai ne correspond pas aux paramètres), ajout d'un script JSON au projet. |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 95, **atelier-model 98** dont 8 nouveaux —
  expressions sûres, trame de poteaux, refus du réducteur, boucle sur les niveaux, validation de forme, assistant
  « feuilles et quantités » sur le P.118 sans écriture, pièces, trame, intention inconnue, auto-correction bornée,
  cache — **API 75** dont 3 nouveaux (T19) : un script donne exactement les objets des mêmes commandes envoyées à
  la main et les mêmes refus (409, 423, 403, 400) ; bibliothèque versionnée ; assistant : rien d'écrit avant
  l'accord, accord, refus, cache — web 20) · `npm run build` ✅.
- Recette `apps/web/e2e/atelier-automatisation.mjs` (nouvelle, en CI) : **13 contrôles verts** — proposition inspectable sans écriture (aperçu : le document produit sera à recalculer), accord, intention non reconnue, script essayé puis exécuté, journal, refus 423 identique à un geste, 390 px, axe-core, aucune erreur JavaScript.
- Recettes `atelier-versions.mjs` (24 ✓), `atelier-echanges.mjs` (17 ✓), `atelier-documents.mjs` (18 ✓),
  `atelier-nouveau.mjs` (41 ✓) ; scénario complet `parcours-scenario.mjs` : 326 contrôles verts, « Scénario conforme. »
  (un premier passage, lancé juste après les cinq recettes, a vu la reprise automatique hors ligne dépasser son délai de
  30 s ; le second passage est vert — contrôle sans lien avec le lot, à surveiller en CI).
- `⏱` : proposition « feuilles et quantités » sur le P.118 (aperçu complet) 2,9 s.
- Acceptation du cahier : un script qui pose une trame de poteaux passe par les mêmes commandes et les mêmes refus
  qu'un utilisateur ✅ ; une proposition de l'assistant n'écrit rien sans accord ✅ ; trois itérations maximum ✅.

## Non fait / reporté

- Fournisseur de modèle de langage (génération libre) : décision réservée au maître d'ouvrage ; aucune clé, aucun appel.
- Règles « objets reportés » au-delà des quatre intentions : une règle qui inventerait une donnée (hauteur de garde-corps,
  composition de paroi) n'est pas écrite.
- Éditeur de scripts guidé (le JSON est saisi tel quel, validé à l'enregistrement).
