# G1 — Index de contrats du premier sous-ensemble I/A.1 proposé

Programme#156, contribution A1, 18 octobre2026. Cet index **référence** les contrats existants, sans les recopier ni devenir une deuxième norme. G0 documentaire accepté au dossier7b0cca44… par6250109830 ; orientations DEC01/03 retenues pour spécifications par6250110124/0501 ; décisions physiques et G1–G4 encore ouvertes. Aucun nouveau code, POC exécuté, stockage SQL/paquet ou DEV_SCOPE n'est décidé ici.

## Sources actives uniques et versions

| Référence courte | Source active | Portée / stabilité |
|---|---|---|
| NORM | RT001V1.0 blobce7cf463… et141fiches normatives exactes A1 | Textes EX/INV/IF/AC préservés ; aucune réécriture par cet index |
| NAV | `docs/ai-team/reports/mission-004/A4/CONTRAT-NAV-M004.md` | Routes/contexte/états/permissions/transition, incluant Sources étude ; D07principes retenus, détails physiques candidats |
| M17 | `docs/ai-team/reports/mission-004/A2/M05-M17-CONTRATS-DURABLES.md` | C-STUDY/C-COMMAND et autorités ; propriétaire A2 ; forme physique non décidée |
| M21 | `docs/ai-team/reports/mission-004/A4/M21-CONTRAT-MINIMAL.md` | Registry/Manager, distinction capacité/commandType/résultat et permissions ; pas catalogue industriel complet |
| M24 | `docs/ai-team/reports/mission-004/A1/M24-CONTRAT-PUBLICATION-REOUVERTURE.md` | Publication et réouverture, ensemble exact/versions/droits, pas APIformatnatif livré |
| G1-DELTA-v2 | `G1-COMPLEMENTS-M17-M24-DEC01-DEC03-v2.md`, schémas/exemples documentaires-v2 dans ce dossier | Ajouts à intégrer aux sections M17/M24 ; contentVersion illustratif≠documentVersion pièce ; aucun nouveau choix physique |
| G0 | `docs/ai-team/reports/mission-004/A1/G0-DOSSIER-FINALISE-M004.md` auSHA7b0cca44fa44449cae80785dea078a857be4180c | Cadrage accepté seulement avec réserves explicites, CAD-DEC-03 ouvert |

Les anciens exemplesG1v1 restent historiques. Les modèles M17 et les exemplesM24 ne sont pas remplacés par un autre sérialiseur : les exemplesv2 sont des illustrations de contraintes qui complètent ces dossiers. Les références de code sont des candidats, pas des capacités testées.

## Périmètre de contrat proposé, distinct d'une autorisation de réalisation

Premier sous-ensemble : intégration autonome Studio I (rail/routes/contexte/états/refus/transitions) et fondations A.1 (identités Étude/Variante/Révision, propriétaire canonique et sauvegarde/réouverture versionnée). Il doit pouvoir cadrer une étude et créer une variante sans géométrie fictive, puis enregistrer/lire une référence de contenu canonique avec isolation et historique.

Exclus de sa réalisation initiale proposée : éditeurs/outils complets A.2/A.3, association topologique A.4, tous moteurs industriels réintégrés dans un nouveau catalogue, Registry/Manager completB, optimisationC/ordonnanceurD, revue/publication métier complèteE, migration de données existantesR et optionsF reportées. Leurs **interfaces** utiles restent prises en compte pour ne pas créer un contrat incompatible. Une intégration I/A.1 livrée ne serait pas le MVP A/B/C terminable ; TEST001 complet attend E. Aucun de ces lots n'est ouvert par cet index.

## Source unique et contrat vérifiable par fonction

| Fonction du sous-ensemble | Source d'autorité / responsable logique | Contrat unique / références | Condition vérifiable et refus | Manque avant décision G1 |
|---|---|---|---|---|
| Entrer par Studio, routes complètes et contexte partiel | AppShell/auth existants, façade contexte ; A4/A2 | NAV sections Routes/Surface/Façade, IF001 ; NAV001–006/008/009 | URL autorisée donne bon contexte ; absence projet/étude/variante mène choix, aucun GET créateur ni étapeParcours validée | Interface physique façade et mapping ressource/erreur/focus, dépendances #142 requalifiées |
| Résoudre parenté et autorisations | Service projets/identité Fadi, décision serveur ; A2 | C-STUDY/NAV/IF001/004, EX087/088/092 ; TEST035 | Tous IDs existants mais parents différents → refus sans fuite ni mutation ; URL/profil ne crée aucun droit | Politique tenant/ressource/masquage refus et droits finaux non ratifiés |
| Cadrer/lire/créer une étude, sources autorisées | Étude identité propre dans Projet transverse, références catalogueFadi ; A2/A1 | M17§1 et NAVSources étude ; IF001 | Étude sans variante autorisée ; géométrie persistée orpheline interdite ; source d'autrui non divulguée | Transport/validation des champs/stockage/transaction, choix physiquesDEC03 |
| Créer/lire une variante, provenance d'un fork | Variante identité propre, uniqueÉtude/Projet ; A2 | C-STUDY, M17§1/2, EX013 | Nouvelle identité et filiation ; aucune propagation vers origine ; références/propriétaires cohérents | Allocation IDs/cycle de vie, mapping anciens projets-forks ; migration non réalisée |
| Créer/citer un contenu2D autonome, vide ou défini selon contrat | Document canonique drawing2d, writer unique serveur ; A2 | C-DRAWING2D/M17§2, G1-DELTA-v2 ; EX004/020/023 | Aucune création de modèle3D de substitution ; unités/repère/version/IDs explicites ; calque/cote vers cible valide | Types physiques, contraintes/schema/compatibilité et coûtDEC01 ; absence3D/persistance encore à prouverG2 |
| Engager une modification et produire révision | C-COMMAND, propriétaire de donnée et transaction autoritaire ; A2 | M17§3, IF004/006/011, EX017/018/045–049 | Précondition version/droits/writer avant effet ; refus atomique ; même requestId/contenu retourne premier résultat, pas doublon ; changement de contenu sous mêmeID refusé | Atomicité/déduplication/limites/quotas/reprise et historique physique, DEC12/03 |
| Lire une révision historique exacte | Révision immuable d'une uniquevariante et sourcescitées ; A2 | M17§4, M24§6, IF004/009/011 | Identités et empreintes cohérentes ; aucune substitutionlatest ; éditionhistorique exige nouvelle intention | Snapshot en coupe logique, lecteurcompatible et contrôle droits parsource ; preuvelecturecohérente à établir |
| Sauvegarder/fermer/rouvrir | Contenus canoniques confirmés, pas scènes/caches ; A2/A6 | C-STUDY/C-DRAWING2D, M24§3/6, EX089/090 | Accusé suit engagementdurable, après coupure distinguer confirmé/pending/conflit ; retrouver contenu exact sous bon compte | Choix persistance/incident/reconnexion et garanties de reprise, mesures non inventées |
| Gérer versions et compatibilité | Contrats/formats/snapshots versionnés, chaque service propriétaire ; A2 | M17§1/5, M24§7/8, EX019/030/044/091 | schemaVersion/contractVersion/revisionId/baseRevisionId/contentVersion illustratif/documentVersion pièce non confondus ; inconnues refusées ou conservées avec rapport | Matrice lecteurs/imports/exports anciensformats réels, décision transformation/rollback ; aucun autobump |
| Protéger navigation, actions/pending et changement compte | UI guide ; commande/queue propriétaire fait autorité ; A4/A2/A5 | NAVTransition/auth, M21cycle, M17C-COMMAND ; NAV007/008 | Quitter ≠ sauver, fermerUI ≠ annuler serveur ; queueA jamais envoyée sousB ; contexte ancien non réadressé | Protocole durable de queue/annulation et compatibilitéSW ; pas garanti par seul dialogue |
| Préparer contrats aval sans réaliser E/B | Catalogue léger et C-PUBLICATION/IF009, pas nouveau modèle canonique ; A4/A1/A2 | M21, M24§2–8 | Registry métadonnées seul ; approbation/publication distinctes ; contenuexact référencé, pas hashclient faisant preuve | DEC04–07/14/16 pour lots concernés ; absence de ces fonctions dans I/A.1 ne vaut pas livraison du MVP |

Ces conditions sont des **oracles à réaliser ultérieurement dans le périmètre autorisé**, pas des tests Studio exécutés. Les validationsJSON/hash documentaires v2 n'ont ni chargé les moteurs ni connecté une base. Reprises A0/A2/A4/A5 ne doivent pas les convertir en certification de contrat runtime.

## G1-01 à G1-04 : état réel des conditions

| ID et verbe source | Condition de clôture par nature | État du dossier / reste à faire |
|---|---|---|
| G1-01 — Rassembler | Contrats navigation/outils retenus/modèles/droits/historique/migrations/risques réunis et indexés pour le sous-ensemble | Index et sourcesM17/M21/M24/NAV réunis ; interfacesphysiques/mappingdroits/compatmigrations toujours candidats. Rassembler n'accepte pas les contrats |
| G1-02 — Relever | Toutes exigences du référentiel relevées dans traçabilité avec identifiants/textes exacts | 104EX/15INV/11IF/11AC exacts et liensTR existants ; compléter les liens parfonction/corpus/preuve, pas104capacités vérifiées |
| G1-03 — Vérifier | Chaque fonction retenue possède sourceunique et contrat vérifiable complet, revue de contenu puis décisionG1 | Table parfonction explicite candidats et manques ; pas clore par existence de141fiches ou modèlelogique orienté |
| G1-04 — Enregistrer | Résultat formelG1 et pointsouverts consignés avec preuves et décision effective | Ce dossier propose étatG1 eninstruction, nonaccepté ; A0 journalise résultat/revues et garde inconnues locales au checkpoint |

Aucun changement de ces quatre statuts n'est appliqué par A1 ; ce n'est pas un nouveau registre. G0-03 accepté n'implique ni G1-03 vérifié ni G1 passé. CAD-DEC-03 noms/disponibilités des personnes demeure ouvert.

## Arbitrages possibles maintenant vs preuves manquantes

**Peut être arbitré en conception sur documents revus :** propriétaires/interfaceslogiques retenus pour ce sous-ensemble ; distinction document2D canonique/piècepubliée et cinqnotionsdeversionsM17 ; liste de fonctions proposées, refus/logique des actes, obligations de durabilité et non-substitution ; critères des futurs POC. Les orientations DEC01/03 déjà retenues ne sont pas reposées.

**Exige modèlephysique comparé/décision restant ouvertes :** stockage/schéma/IDs physiques de document2D et Étude/Variante/Révision, atomicité du snapshot/transactions, déduplication/rétention, politique de lecteurs/format/compatibilité, coûts et interfacesd'extraction des moteurs. Les noms C-* ne sont pas des endpoints ratifiés.

**Exige G2 sur POC explicitement autorisé ou recette future :** autonomie2D sans3D, sauvegarde/réouverture fidèle, rejet faussesrévisions, refus zéroeffet, maintienidentités/cotes/calques et replay, absence duplication/gainréutilisation/coûts réellement mesurés. Un POC purementfichierlocal ne prouvera ni isolationserveur/transactionsDB ni fonctionnementUI/permissions.

**Risques et rollback encore à spécifier par sous-ensemble :** doubleécrivain, lecture entrelacée, confusionversion/dernièreimage, migrationanciensforks, pertequeue horsligne/clientsanciens, rollbackignorant les nouvellesécritures. Politique proposée conserve sources et correspondances, ne supprime aucune publication/identité et définit traitement des nouvellesécritures avant bascule ; aucune opération de retourarrière/données n'est autorisée ici.

## Prochaine action exacte

A2/A4/A5 relisent les deltas de vocabulaire/empreintes v2 et ce tableau parfonction ; A0 consolide une question bornée sur les seuls choix encore ouverts, ou soumet le POCpur proposé dans le dossierdistinct. Toute décision deG1/G2/G3 devra citer périmètre/preuves/autorité ; aucune déduction depuis ce fichier, aucune demande globale de tout réautoriser. Continuer les tâches READY indépendantes.
