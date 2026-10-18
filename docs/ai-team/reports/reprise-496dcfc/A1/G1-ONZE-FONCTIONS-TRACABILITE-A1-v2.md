# Onze fonctions I/A.1 — traçabilité v2 active

V1 figée conservée. Correction de six liaisons abrégées omises : EX020/023 fonction5, EX018 fonction6, IF009/011 fonction7, EX090 fonction8. Aucune exigence nouvelle.

53 exigences sélectionnées,88 hors sélection conservées ;141sources exactes. Catalogue de38oracles source,27 distincts liés comme candidats, non exécutés. NAV-M004.json hashé,9prescriptions non exécutées. Aucun AC sélectionné : les11 restent hors sélection, sans conformité déduite.

| Fonction | Exigences sélectionnées | Manque |

|---|---|---|

|Entrer par Studio, routes complètes et contexte partiel|EX-001 (proposé), EX-002 (proposé), EX-003 (proposé), EX-007 (proposé), EX-036 (proposé), EX-038 (proposé), IF-001|Interface physique façade et mapping ressource/erreur/focus, dépendances #142 requalifiées|

|Résoudre parenté et autorisations|EX-087, EX-088, EX-092, EX-094 (proposé), IF-001, IF-004|Politique tenant/ressource/masquage refus et droits finaux non ratifiés|

|Cadrer/lire/créer une étude, sources autorisées|EX-003 (proposé), EX-009 (proposé), EX-014 (proposé), EX-094 (proposé), IF-001|Transport/validation des champs/stockage/transaction, choix physiquesDEC03|

|Créer/lire une variante, provenance d'un fork|EX-012 (proposé), EX-013, EX-014 (proposé), INV-003 (proposé)|Allocation IDs/cycle de vie, mapping anciens projets-forks ; migration non réalisée|

|Créer/citer un contenu2D autonome, vide ou défini selon contrat|EX-004, EX-009 (proposé), EX-014 (proposé), INV-002 (proposé), EX-020, EX-023|Types physiques, contraintes/schema/compatibilité et coûtDEC01 ; absence3D/persistance encore à prouverG2|

|Engager une modification et produire révision|EX-017, EX-024 (proposé), EX-045, EX-046, EX-047, EX-048, EX-049, IF-004, IF-006, IF-011, INV-005 (proposé), INV-011 (proposé), EX-018|Atomicité/déduplication/limites/quotas/reprise et historique physique, DEC12/03|

|Lire une révision historique exacte|EX-012 (proposé), EX-014 (proposé), EX-016 (proposé), IF-004, INV-006 (proposé), IF-009, IF-011|Snapshot en coupe logique, lecteurcompatible et contrôle droits parsource ; preuvelecturecohérente à établir|

|Sauvegarder/fermer/rouvrir|EX-043 (proposé), EX-049 (proposé), EX-089, INV-008 (proposé), INV-014 (proposé), EX-090|Choix persistance/incident/reconnexion et garanties de reprise, mesures non inventées|

|Gérer versions et compatibilité|EX-019, EX-030, EX-044, EX-091|Matrice lecteurs/imports/exports anciensformats réels, décision transformation/rollback ; aucun autobump|

|Protéger navigation, actions/pending et changement compte|EX-003 (proposé), EX-037 (proposé), EX-043 (proposé), INV-014 (proposé)|Protocole durable de queue/annulation et compatibilitéSW ; pas garanti par seul dialogue|

|Préparer contrats aval sans réaliser E/B|EX-026 (proposé), EX-032 (proposé), EX-081 (proposé), EX-082 (proposé), EX-083 (proposé), IF-009, INV-001 (proposé), INV-012 (proposé)|DEC04–07/14/16 pour lots concernés ; absence de ces fonctions dans I/A.1 ne vaut pas livraison du MVP|



G0 accepté cadrage documentaire seulement ; G1 ouvert. Liens explicites de l’index distincts des rapprochements proposés ; aucun DEV_SCOPE ou preuve métier déduit. Source normative, paragraphesXML, textes exacts, contrats, candidats et oracles détaillés dans JSON. ExemplesG1v2/S1/S6 existants réutilisés sans clone ; preuves runtime absentes.

V1 SHA256 `3d212ffb93dc33380ac313556cb36b00302246b82ac7096b466c530b4923c719`. V2 JSON SHA256 `ea5300f241df47d168b1c3f0fc7180cd189b70d7d6b64e5f299a55522dd52f0c`. Aucun code/test/moteur/registre ni case modifié.
