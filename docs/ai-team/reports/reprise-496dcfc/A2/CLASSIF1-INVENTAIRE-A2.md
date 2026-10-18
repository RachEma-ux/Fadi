# CLASSIF1 — inventaire préalable A2, lecture seule

Décision [#166/6250110849](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110849), référence code PR169 `a15d65044ca4454bf3159f4155e51465b2a70a2c`. Aucun code applicatif, test, DB, service ou navigateur exécuté ou modifié. A0 seul réserve la branche et active A3 après avis conjoint A5 ; A2 ne crée pas une nouvelle autorisation.

**Aucun effet identifié exigeant une extension du lot vers UI/API/IFC-engine/schéma/données historiques.** L'inventaire est prêt pour confrontation finale A5. Les tests purs manquants sont ceux déjà inclus dans l'autorisation, pas des garanties réputées acquises.

Périmètre lexical complet aux motifs déclarés : **81 lignes dans 19 fichiers** suivis apps/packages/scripts/.github. Recherche complémentaire du reste du dépôt, hors docs/Studio, sans autre occurrence. Index additionnel des accès aux propriétés : **114 lignes dans 31 fichiers**, avec qualifications et limites ; **42 sources** au total avec blobs et SHA256. Ces compteurs ne sont pas des nombres de dépendances runtime. Les variables locales `classeIfc` de l'export IFC et le champ descriptif `classification` de composant sont explicitement distingués de la propriété canonique. Les accès génériques couvrent transport/archives/copies/diff, lecteurs UI et clés spécifiques d'autres domaines, sans prétendre un audit de leurs algorithmes.

| Chaîne | Lecture et impact à préserver |
|---|---|
| Complements79/85, proposition classification-regle53 | Retrait code=null, multi-sélection de commandes id, règle ids ; aucune dépendance à classe IFC fabriquée identifiée. |
| Dispatcher index292–303 et pipeline377–397/410–429 | Même réducteur pour id/ids ; contrôles de domaines et verrous après réducteur, inverse différentiel après lot. Tester par appliquerLot. |
| organisation414–439 | Instruction436 unique explicitement dédiée à l'écriture automatique ; copie des autres propriétés, code/libellé/référentiel et effets à conserver. Alignement commentaire414 inclus dans correctif autorisé. |
| annexe-c62–73 → API232 → type api1143 → Modifications141–149 | Déclaration lue sans correction ; absence ne fabrique rien. Un diagnostic peut rester visible après code externe grâce à déclaration préservée. Pas de changement API/UI attendu. |
| IFC1123–1145/1187 | Associations des codes et remarques du contrôle distinctes de la classe du produit exporté. Conserver mapping Annexe C et logique du moteur, pas modification IFC-engine. |
| Inspecteur255–263/1551–1556 | Ligne, colonne ou compteur auparavant créé implicitement peut ne plus apparaître : effet visible attendu du contrat, pas besoin de correction UI démontré. Le volet2030 cible groupe/calque, distinct des occurrences de CLASSIF1. |
| proprietesEffectives bloc211–217 | Propriété de définition et surcharge d'occurrence projetées génériquement ; aucune nouvelle fonctionnalité de classification type/héritage autorisée. |
| Archive109, persistance atelier-modele, copies, versions/diff/base213–244 | Conserver propriétés entières, métadonnées inconnues et anciennes valeurs déjà enregistrées ; pas nettoyage, migration ou réparation par hypothèse. |
| Oracles commandes279–282, référentiels15–26/51–60, annexe-c17–58 | Remplacer attente contradictoire281 sans diminuer garanties code/retrait/référentiel/export/règle/exclusions/inverse. Ajouter combinaison avant/après code externe et déclaration préexistante. |
| API948–955 et E2E compléments807–825/1732–1752 | Sources de non-régression lues seulement ; aucun test mutateur autorisé ou exécuté. |

Matrice pure requise : absence, déclaration saisie, importée et ancienne `regle/verifiee`, cohérentes ou incohérentes ; ajout/remplacement/retrait, système libre ou référentiel ; id/ids et objets exclus ; comparaison profonde des propriétés inconnues et de l'état d'entrée après refus de deuxième cible ; inverse exact, répétabilité et effets ; contrôle/export dérivés sans mutation et diagnostic conservé. Le test `toThrow` seul ne prouve pas l'atomicité. Ne pas introduire un nettoyage des anciens `regle/verifiee` pour faire passer les tests.

Rapprochement de l'inventaire indépendant A5 : empreintes de toutes ses sources identiques ; mêmes14 points de flux, y compris verrous/post-contrôles, génériques de l'inspecteur et propriétés effectives. Différence de compteurs expliquée par motifs et index générique supplémentaires. A5 doit consigner son accord final sur le JSON figé ; A0 peut alors s'appuyer sur l'autorisation existante pour lancer A3, sans redemander le même accord.

Limites : exhaustivité des recherches statiques dans le périmètre déclaré, pas preuve contre clés construites à runtime, règles/plugins externes, anciens clients ou données privées. Aucun lecteur explicite identifié ne requiert l'ancienne déduction interdite ; aucun impact runtime ou volume de données affectées prétendu. Si un besoin de modifier un autre code ou une donnée apparaît pendant le lot, suspendre l'écriture nouvelle concernée et demander l'extension bornée exigée par6250110849.
