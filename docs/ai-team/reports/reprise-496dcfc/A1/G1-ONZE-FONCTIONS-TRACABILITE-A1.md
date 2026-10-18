# Onze fonctions I/A.1 — traçabilité proposée G1-02/03

Onze fonctions exactes de l’index rapprochées des141fiches existantes. Liens explicites de l’index distingués des propositions A1. Textes normatifs exacts, blobsDOCX, paragraphesXML, hashes des sources, candidats composants,38oracles réutilisés et preuves manquantes figurent auJSON.

| Fonction | Exigences explicites/proposées | Manque avant décision |

|---|---|---|

|Entrer par Studio, routes complètes et contexte partiel|EX-001 (proposé), EX-002 (proposé), EX-003 (proposé), EX-007 (proposé), EX-036 (proposé), EX-038 (proposé), IF-001|Interface physique façade et mapping ressource/erreur/focus, dépendances #142 requalifiées|

|Résoudre parenté et autorisations|EX-087, EX-088, EX-092, EX-094 (proposé), IF-001, IF-004|Politique tenant/ressource/masquage refus et droits finaux non ratifiés|

|Cadrer/lire/créer une étude, sources autorisées|EX-003 (proposé), EX-009 (proposé), EX-014 (proposé), EX-094 (proposé), IF-001|Transport/validation des champs/stockage/transaction, choix physiquesDEC03|

|Créer/lire une variante, provenance d'un fork|EX-012 (proposé), EX-013, EX-014 (proposé), INV-003 (proposé)|Allocation IDs/cycle de vie, mapping anciens projets-forks ; migration non réalisée|

|Créer/citer un contenu2D autonome, vide ou défini selon contrat|EX-004, EX-009 (proposé), EX-014 (proposé), INV-002 (proposé)|Types physiques, contraintes/schema/compatibilité et coûtDEC01 ; absence3D/persistance encore à prouverG2|

|Engager une modification et produire révision|EX-017, EX-024 (proposé), EX-045, EX-046, EX-047, EX-048, EX-049, IF-004, IF-006, IF-011, INV-005 (proposé), INV-011 (proposé)|Atomicité/déduplication/limites/quotas/reprise et historique physique, DEC12/03|

|Lire une révision historique exacte|EX-012 (proposé), EX-014 (proposé), EX-016 (proposé), IF-004, INV-006 (proposé)|Snapshot en coupe logique, lecteurcompatible et contrôle droits parsource ; preuvelecturecohérente à établir|

|Sauvegarder/fermer/rouvrir|EX-043 (proposé), EX-049 (proposé), EX-089, INV-008 (proposé), INV-014 (proposé)|Choix persistance/incident/reconnexion et garanties de reprise, mesures non inventées|

|Gérer versions et compatibilité|EX-019, EX-030, EX-044, EX-091|Matrice lecteurs/imports/exports anciensformats réels, décision transformation/rollback ; aucun autobump|

|Protéger navigation, actions/pending et changement compte|EX-003 (proposé), EX-037 (proposé), EX-043 (proposé), INV-014 (proposé)|Protocole durable de queue/annulation et compatibilitéSW ; pas garanti par seul dialogue|

|Préparer contrats aval sans réaliser E/B|EX-026 (proposé), EX-032 (proposé), EX-081 (proposé), EX-082 (proposé), EX-083 (proposé), IF-009, INV-001 (proposé), INV-012 (proposé)|DEC04–07/14/16 pour lots concernés ; absence de ces fonctions dans I/A.1 ne vaut pas livraison du MVP|



Sélection finie : 49 exigences ; 92 hors sélection conservées individuellement dans JSON. Aucun dénominateur DEV_SCOPE ni statut de capacité déduit.



G0 accepté cadrage documentaire seulement ; G1 reste ouvert.

Aucun nouvel identifiant EX/INV/IF/AC/TEST/NAV ni corpus créé. Source de fonction unique renvoie contrats existants, pas nouvelle norme.

Sélection de traçabilité et interfaces aval ne constitue pas périmètre de développement autorisé, ni dénominateur DEV_SCOPE.

TEST001 complet et publication métier débordent I/A.1 ; simple lien ne prouve pas couverture.

S1/S6 partiels documentaires et exemplesG1v2 non exécutables : aucun moteur/runner, API, test, DB ou registre modifié.

L’exhaustivité des141sources est conservée au registre des fiches ; sélection finie proposée ici à revue, pas démonstration exhaustive du contrat G1-03.
