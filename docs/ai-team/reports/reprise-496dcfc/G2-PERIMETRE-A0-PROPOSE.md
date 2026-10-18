# G2 — périmètre concret proposé, sans autorisation d'exécution

Cette annexe complète le [dossier A1](A1/G2-DOSSIER-POC-PUR-2D-IDENTITES-PROPOSE.md) et sa [revue de sécurité A6](A6/REVUE-G2-SECURITE.json). Elle prépare une décision déléguée dans #166. G1, G2 et G3 restent non acceptés ; aucun code de POC n'est écrit ou exécuté par cette annexe.

## Objet et fichiers futurs

Branche courte proposée : `feat/156-poc-g2-2d-identities`, issue du `main` à vérifier après une éventuelle autorisation. Sources futures limitées à `experiments/studio/g2-2d-identities/` : `README.md`, `schema.ts`, `fixtures.ts`, `harness.ts`, `harness.test.ts`. Aucun nouveau package/workspace, dépendance, script npm, workflow ou fichier applicatif modifié. Une extension de cette liste demande une nouvelle décision bornée.

Le schéma serait expérimental, distinct d'un format Studio ratifié. Deux chemins : document 2D sans modèle 3D et identités Projet → Étude → Variante → Révision, avec ancien contenu conservé et nouvelle révision. Les dix refus documentaires G1 v2 seraient transformés en cas purs, sans les présenter aujourd'hui comme tests réussis. Rectangle synthétique 6×2 puis 7×2 : oracle analytique 12 puis 14 m², sans portée normative générale.

## Frontière d'import à instruire avant code

Seul candidat produit : export public `polygonArea` de `@parcours/core-geometry`. Aucun import profond depuis `apps/web`, moteur 3D, WASM, worker, client DB ou module UI. Le [dossier DEC18](A3/DEC18-MOTEURS-PUBLICS-CANDIDATS.json) constate des exports et leurs limites, sans prouver encore l'absence d'effets de toutes les réexportations transitives du point d'entrée public. A2 doit attester ce graphe précis au SHA retenu avant tout import exécuté. À défaut, ce sous-point reste bloqué : pas de copie silencieuse du moteur ni de contournement par import interne.

## Bornes proposées au futur harness

Racine de sortie physique proposée : répertoire inédit créé exclusivement sous `/workspace/work/fadi-g2-2d-identities/`, nom de session aléatoire ; l'existence préalable de la racine de session est un refus. La racine et ses parents sont contrôlés sans suivre de lien symbolique. Aucun chemin externe fourni par une fixture, traversal, destination existante ou lien symbolique n'est autorisé. Tous les fichiers sont créés exclusivement ; les entrées/anciennes révisions restent immuables. Aucune suppression ou opération de nettoyage automatique.

Bornes de confinement proposées, à approuver : 16 fichiers de sortie au maximum, 1 Mio par JSON, 8 Mio cumulés, profondeur JSON maximale 32, 1 000 objets et 10 000 points au maximum, un processus enfant de relecture au maximum, 30 secondes par exécution et annulation après ce délai. Ce sont des limites d'arrêt du petit POC, **pas des objectifs de performance Studio ni des mesures obtenues**. Une limite dépassée provoque un refus avant promotion ; rien n'est déclaré validé par défaut.

Environnement enfant minimal explicite : exécutable et arguments fixes sans shell, aucun héritage de secrets, credential, `DATABASE_URL` ou `TEST_DATABASE_URL`. L'absence de variable ne prouve pas une interdiction réseau : le futur environnement doit effectivement refuser le réseau pendant les essais, et A6 doit le constater avant exécution. Aucun serveur, URL distante, installation, script lifecycle, navigateur, DB, API, migration ou reprise de service. Fixtures exclusivement synthétiques. Aucune écriture dans le dépôt hors des cinq sources autorisées ; rapports documentaires relus séparément par A0.

Réserves de la revue A6 incorporées dans cette proposition : ancrage fiable de la racine et ouvertures sans suivi de symlink avec création exclusive, pas simple contrôle de parents vulnérable à une substitution entre contrôle et ouverture ; aucune promotion par rename écrasant une destination. Si ces garanties ne peuvent pas être démontrées dans les primitives retenues, arrêter ce sous-point. Le délai de30s doit être surveillé par un superviseur externe au calcul synchrone du harness ; pas seulement un timer de son event loop, et aucun signal à un processus partagé. La relecture utilise un processus distinct lors d'une invocation suivante, sans enfant supplémentaire imbriqué. Compter les octets UTF-8 et le cumul avant écriture, refuser les valeurs non finies avant sérialisation ; une annulation interdit toute promotion ultérieure.

## Vérifications et retour arrière proposés

Comparer avant/après chaque refus ; isoler la faute ciblée, vérifier identité, parenté, version, non-finitude, référence manquante, writer contradictoire et empreinte de l'ancienne révision. Parsing et sérialisation ne prouvent ni droits serveur, ni transaction DB, ni concurrence réelle, ni résistance matérielle à une coupure. L'absence de 3D doit être explicite dans le cas autonome.

Vérifications futures : tests du harness seul, typecheck pertinent sans démarrage, rapports de commandes et SHA. Aucun lancement de la CI intégration existante : une configuration de CI pure exacte devra être autorisée séparément si nécessaire avant une PR déclenchant des jobs avec services. La présente annexe n'autorise pas une modification de workflow.

Retour arrière : abandon de la branche et de l'usage des seuls fichiers expérimentaux ; originaux conservés. Aucune restauration de sauvegarde ni migration. Un échec ne ferme aucune porte et ne bloque pas les autres READY.

## Décisions à demander

1. Recevoir le dossier G1 v2 et l'index de ses preuves, en distinguant les conditions encore insuffisantes de G1-01 à G1-04 ; aucune acceptation globale présumée.
2. Autoriser ou refuser ce POC expérimental borné **uniquement après satisfaction des préconditions de G1 et revue A2/A5/A6 des imports, fixtures et confinement** ; préciser si les bornes ci-dessus conviennent.
3. Garder G2 comme porte à décider sur les résultats réellement obtenus et G3 comme décision ultérieure de réalisation. Le POC ne vaut pas autorisation d'intégration Studio.

Les choix physiques DEC01/03, personnes/disponibilités CAD-DEC-03, droits finaux et budgets produit restent ouverts. L'orientation déjà retenue n'est pas reposée.
