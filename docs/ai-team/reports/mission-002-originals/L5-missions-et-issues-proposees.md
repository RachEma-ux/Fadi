# L5 — Missions indépendantes prêtes à lancer

Les agents A1/A2/A4/A5/A6 ont réellement exécuté une première analyse. Ces instructions servent à leurs prochaines unités bornées ; elles ne sont pas des autorisations d’implémentation.

## A1

Cadre commun : Mission002 Fadi, analyse/spécification seulement. Lire AGENTS.md, CLAUDE.md, docs/architecture.md, docs/continuity/README.md ; pour tout chantier lire HANDOFF puis STATUS, TASKS, CONTEXT et Issue/PR. Relever main/HEAD/diff et CI par SHA. Lire charte StudioV2.1, RT001V1.0, plan et checklist630 sans modifier ses cases. Aucun code, commit, Issue/PR, admin, migration, déploiement ou test destructif. Ne pas toucher DrawAll, Atelier/21étapes et fonctions industrielles restent conservés. Livrer en français avec fichiers/lignes/SHA, preuves actuelles/historiques/non exécutées séparées, critères et décisions. Écrire seulement rapport propre hors dépôt ; ne pas écraser le rapport d'un autre agent.

Produit : compléter104EX +15INV +11IF +11AC, relier contrats/composants/tests/preuves/DEC. Ratifier par proposition le pilote local/pavillon synthétique et ses trois parcours terminables A2D/B3D/Cassocié, quatre domaines ; distinguer autonomie cible et capacités candidates Atelier. Confirmer21 étapes/six phases. Sortie : dossierG0/G1 et matrice sans obligation critique non affectée ; aucune acceptation implicite. Dépend A0 pour référence, A2 pour contrats et A5 pour oracles.

## A2

Cadre commun : Mission002 Fadi, analyse/spécification seulement. Lire AGENTS.md, CLAUDE.md, docs/architecture.md, docs/continuity/README.md ; pour tout chantier lire HANDOFF puis STATUS, TASKS, CONTEXT et Issue/PR. Relever main/HEAD/diff et CI par SHA. Lire charte StudioV2.1, RT001V1.0, plan et checklist630 sans modifier ses cases. Aucun code, commit, Issue/PR, admin, migration, déploiement ou test destructif. Ne pas toucher DrawAll, Atelier/21étapes et fonctions industrielles restent conservés. Livrer en français avec fichiers/lignes/SHA, preuves actuelles/historiques/non exécutées séparées, critères et décisions. Écrire seulement rapport propre hors dépôt ; ne pas écraser le rapport d'un autre agent.

Architecture : graphe des dépendances type/runtime, frontières/façades publiques, revue proposition PR152 plutôt que duplication. Décrire les trois autorités de données, Projet/Étude/Variante/Révision, associations/référence/copie, historique et manifeste. Instruire18DEC par lot et ADRnavigation ; inventorier conserver/compléter/corriger/isoler/remplacer/retirer sur preuve. Qualifier doublon echelle sans renommage aveugle. Sortie : schémas logiques, alternatives, critères et périmètre G1/G2/G3.

## A4

Cadre commun : Mission002 Fadi, analyse/spécification seulement. Lire AGENTS.md, CLAUDE.md, docs/architecture.md, docs/continuity/README.md ; pour tout chantier lire HANDOFF puis STATUS, TASKS, CONTEXT et Issue/PR. Relever main/HEAD/diff et CI par SHA. Lire charte StudioV2.1, RT001V1.0, plan et checklist630 sans modifier ses cases. Aucun code, commit, Issue/PR, admin, migration, déploiement ou test destructif. Ne pas toucher DrawAll, Atelier/21étapes et fonctions industrielles restent conservés. Livrer en français avec fichiers/lignes/SHA, preuves actuelles/historiques/non exécutées séparées, critères et décisions. Écrire seulement rapport propre hors dépôt ; ne pas écraser le rapport d'un autre agent.

UX/UI : après revalidation PR142, spécifier Studio dans rail principal FR/EN desktop/mobile et routes autonomes sans ProjectShell préalable. Décrire quatre domaines/deux planches, projet absent/lectureseule/refus/chargement/erreur/offline/pending/conflit ; pleinécran explicite et sortie visible. Protéger transitions route/langue (rechargement)/fermeture. Sortie : contratNAV001–009 mesurable et maquette d'interaction proposée, pas capture de boutons réputée MVP. Ne pas entrer en conflit AppShell/HomeTopbar/CSS.

## A5

Cadre commun : Mission002 Fadi, analyse/spécification seulement. Lire AGENTS.md, CLAUDE.md, docs/architecture.md, docs/continuity/README.md ; pour tout chantier lire HANDOFF puis STATUS, TASKS, CONTEXT et Issue/PR. Relever main/HEAD/diff et CI par SHA. Lire charte StudioV2.1, RT001V1.0, plan et checklist630 sans modifier ses cases. Aucun code, commit, Issue/PR, admin, migration, déploiement ou test destructif. Ne pas toucher DrawAll, Atelier/21étapes et fonctions industrielles restent conservés. Livrer en français avec fichiers/lignes/SHA, preuves actuelles/historiques/non exécutées séparées, critères et décisions. Écrire seulement rapport propre hors dépôt ; ne pas écraser le rapport d'un autre agent.

Qualité : tests négatifs purs de la garde DB (absence/URLprod/inconnue/override/attestation/reconnexion/logsecret) et zéro mutation ; aucune tentative contre une production réelle. Matrice nonrégression Fadi/Studio,38TEST+9NAV, corpusS1–S7 et mesuresDEC13. Conserver IFC proxy/paramétrique distinct. Préparer triageCSP/scan vulnérabilités. Sortie : cas entrée/oracle/effets interdits/preuve par SHA. SuitesAPI/E2E restent interdites avant protections vérifiées et autorisation d'essai.

## A6

Cadre commun : Mission002 Fadi, analyse/spécification seulement. Lire AGENTS.md, CLAUDE.md, docs/architecture.md, docs/continuity/README.md ; pour tout chantier lire HANDOFF puis STATUS, TASKS, CONTEXT et Issue/PR. Relever main/HEAD/diff et CI par SHA. Lire charte StudioV2.1, RT001V1.0, plan et checklist630 sans modifier ses cases. Aucun code, commit, Issue/PR, admin, migration, déploiement ou test destructif. Ne pas toucher DrawAll, Atelier/21étapes et fonctions industrielles restent conservés. Livrer en français avec fichiers/lignes/SHA, preuves actuelles/historiques/non exécutées séparées, critères et décisions. Écrire seulement rapport propre hors dépôt ; ne pas écraser le rapport d'un autre agent.

DevOps : vérifier version Cloud publiée/scripts par lecture, SHA attendu, diagnostic service/proxy/DB sans restart ; expliquer work sans anomalie nominale. Préparer session neuve/base jetable attestée et identité immutable. Revalider main/protected et checks actuels via GET ; proposer règles sans les activer, politique solo à décider, réutiliser JSON PR152. Sortie : preuve des limites, procédure non exécutée de reproduction et acceptation santéAPI/DB/PostGIS/HTML/401. Aucun VPS,prod,sauvegarde/rétention.

## Futurs lots A3 — inactifs, activation après accord distinct

A3-DB (P1 sécurité, hors gates de réalisation Studio) : après validation de la spécification A2/A5/A6, créer garde pure + lanceur dédié TEST_DATABASE_URL, attestation identité avant destruction, centraliser resets des12fichiers et autres lanceurs. Commencer par tests purs/mocks négatifs zéro mutation ; tests positifs seulement base jetable approuvée et attestée. Ne pas altérer le client production. Livrables : branche courte/PR après mandat, matrice des chemins protégés, refus et limites, rollback. Pas de fusion/déploiement.

A3-CONTRATS (P2) : après accord borné, aligner manifeste v3/compatibilité et contrôles. Revoir PR152 avant toute duplication. Tester enveloppesv1/v2/v3 et métadonnées ; aucun changement métier ou migration d'ID implicitement autorisé.

A3-I+A1 (P0 réalisation Studio, désignations de lots I et A.1) : après G3 du sous-ensemble et accord code, basePR142 décidée, contrats navigation/étude/commandes stabilisés, gardeDB vérifiée. StudioShell autonome et contexte persistant via services Fadi, pas raccourci Atelier. Un seul éditeur App/AppShell/HomeTopbar/schema. Acceptation NAV pertinents + isolation et sauvegarde/réouverture ; ne pas déclarer MVP avant deux autonomies/association/publication.

A3-B (P0 Studio) : après DEC04/05/06/07/14/18 pertinentes, registry versionné IDsuniques/alias, Manager/profils/loaders sans noyau par outil, mesures froid/chaud et offline vérité. Séparer préférences des droits et révision.

A3-CSP/SCAN (P2) : deux unités après validation, inventaire origins/Workers/WASM/offline et politique, essais report-only autorisés puis enforcement accepté ; jobscan avec triage et exceptions expirables. Aucun changement de frontal production.

A3-A2/A3/A4/A5/E (sous-lots A.2–A.5 et E, pas agents) : autorisations distinctes après contrats/preuves nécessaires ; deux planches autonomes, mêmes objets associés et historique, puis manifeste approuvé/publication. Préserver Atelier et corpus industriels.

## Propositions d’Issues — non créées

Réutiliser #146 protections, #147 autonomie, #151/#152 garde-fous et #153/#154 relais. Ne pas ouvrir de doublons.

- M002-ENV — Reproduction Cloud et diagnostic de démarrage, P1, A6/A5 : version/scripts + session neuve, santé et cibleDB attestées ; sans production.
- M002-DB — Garde des bases de tests, P1, A3futur/A5/A6 : refus fermés et12suites protégées ; essais jetables seulement.
- ST-G0 — Cadrage Studio et sources canoniques, P0préparation, A0/A1 : pilote, responsabilités, exclusions et référenceRT001 ratifiés.
- ST-G1-MODELE — Autorités/données/historique, P0préparation, A2 : DEC01/02/03/12/18 et manifesteDEC16, schémas et risques.
- ST-G1-NAV — Navigation et coexistence, P0préparation, A4/A2 : NAV001–009, PR142 décidée avant édition de ses fichiers.
- ST-G1-REGISTRY — Catalogues/profils/chargement, P0préparation, A2/A4 : DEC04/05/06/07/14, IDs et cache.
- ST-X — Corpus/traçabilité/sécurité, P0transversal, A5 : oracles,38TEST/9NAV, matrices et preuves versionnées.
- ST-G2-* — Un POC borné par risque après autorisation propre ; pas d’Issue d’implémentation globale ouverte avant G3.

Chaque Issue future contient besoin, EX/INV/IF/AC, inclus/exclus, dépendances/DEC, fichiers partagés, risques, positif/négatif, preuves et rollback. Aucun numéro attribué par anticipation.
