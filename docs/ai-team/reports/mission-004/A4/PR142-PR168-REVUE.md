# N/D % — Avancement du développement total Fadi / Studio

## A4 — M004 : revue ciblée #142 et snapshot #168

18 octobre 2026. Lectures seules, faits par SHA dans PREUVES-LECTURE.json ; aucun workflow/script de branche exécuté, aucune édition HTML concurrente, aucune interaction navigateur ni DB. PDEV reste N/D faute de DEV_SCOPE/baseline fonctionnelle homologués. Ce rapport n'est pas une autorisation de fusion ou de mise en service.

### #142 : dépendance de la future réalisation

PR ouverte/non fusionnée à tête `0d9606059f383e993b4bc69d57700ff411856919`, inchangée par rapport au relevé M003. La liste des runs propre à cette tête donne CI38766145763 failure et Project layout38766145731 success. L'examen jobs M003 situe l'échec e2e à planche-boutons, pas les quatre anciens échecs atelier-complements d'a383fa…. Les29 fichiers de patches lus en M003 recouvrent ProjectShell/ProjectModuleNav/use-immersive/CSS/Plan2D/barres et tests ; cette mission ne les modifie pas et ne rediagnostique pas leur cause sans logs nouveaux.

D06 retient désormais l'ordre de revue #154→#152→#142 ; l'ordre n'autorise ni correction #142 non bornée ni fusion. D07 permet finaliser le contrat/maquettes en parallèle ; futur lot I requalifiera sa base et les propriétés partagées. Le succès layout et mergeable ne signifient pas CI applicative complète ni acceptation UX.

### #168 : provenance relue

PR ouverte/non fusionnée à tête `5eaa11c81575a1d347834500af33eb67d7350883`, branche `feat/167-studio-daily-checklist`. Lus au SHA exact : STUDIO-DAILY-UPDATES.md, générateur Python, tests hors réseau, workflow et HTML interactif. Les runs retournés : snapshot39124724192/continuité39124724088/isolation39124724076 success ; CI39124724104 encore in_progress au relevé. Aucune conclusion transférée au prochain commit ni recette manuelle prétendue.

**Contrôle statique réellement exécuté par A4 :** extraction JSON seed de l'HTML de cette tête, comparaison à la checklist Markdown locale verrouillée. 630 entrées, 630 IDs uniques, ensembles identiques (0 manquant/0 supplémentaire). Présence des champs codeDone/chatgptReviewed/adminReviewed et localStorage ; clé conservée `fadi-studio-tasks-v1.0-local`. Il s'agit d'une vérification documentaire, pas d'une sauvegarde de localStorage ou d'une recette utilisateur réelle.

### Compatibilité et trois validations

Le générateur : valide nombre/unicité630 et présence des champs locaux ; remplace uniquement son bloc quotidien délimité et réinjecte un script d'annotation. Le client annote des cartes avec liens non validants ; il n'appelle pas localStorage ni les handlers de coches. Les trois états restent **Code**, **Review ChatGPT**, **Review Admin**, indépendants du signal `stage`. `pdev_verified`/`p630_verified` restent null dans le snapshot ; P630 extrait d'un commentaire est « rapporté, non homologué ». Une délégation répond à une question, pas à la preuve individuelle de code. L'interface de suivi n'est pas Studio ni son workflow d'approbation/publication métier.

En lecture statique, le dispositif est compatible avec cette séparation. Limites : aucune ouverture réelle du HTML avec stockage existant/import/export ni validation d'accessibilité réelle ; les tests comptant des tokens ne prouvent pas la conservation comportementale de tout un stockage utilisateur. La comparaison A4 des ensembles630 est plus forte que le simple compte dans task_ids(), mais n'est pas actuellement démontrée comme garde permanente du générateur.

### Observations à corriger/qualifier dans un futur lot documentaire autorisé

1. **État d'activité non contemporain.** `execution_confirmed = bool(acknowledgements and reports)` prouve des marqueurs ACK/progrès présents dans l'historique lu, sans authentifier l'auteur ou la disponibilité courante de Codex. Le libellé rendu « Accusé + activité GitHub observés » et les dates limitent le risque ; ne pas l'interpréter comme agent actif ni relance Cloud. Amélioration : nommer « traces déclarées présentes » et vérifier auteur/identité/sources séparément.
2. **Pagination bornée silencieuse.** collect() boucle11 pages de100 commentaires et ne marque pas tronqué si la11e est pleine ; à plus de1100 commentaires le « dernier rapport » peut ne plus être dernier. Prévoir exhaustion/flag incomplet et ne pas déclarer fraîcheur complète ; aucun incident réel déduit ici.
3. **Décision propriétaire historique persistante.** owner_pending reste alimenté par tout ancien marqueur, même après décision déléguée ultérieure ; pas de transition temporelle fermant explicitement un pending. Afficher comme « signalements historiques à rapprocher » ou traiter un protocole explicite de résolution, sans fermer une opération réservée par une simple réponse. Aucune coche n'est affectée.
4. **Compatibilité630 permanente.** task_ids() valide630 IDs uniques mais pas l'ensemble exact du Markdown verrouillé ni le texte ; ajouter comparaison source/empreinte avant génération et tests de remplacement d'unID par un autre tout en gardant630.
5. **Écritures snapshot/HTML non atomiques.** Le script calcule tout avant les deux write_text ; en cas d'erreur d'écriture après JSON il peut rester une paire incohérente. Prévoir écriture temporaire puis remplacement et test de panne ; ce n'est pas une corruption DB ni un incident observé.

Ces points portent sur la fiabilité du reporting, pas sur l'intégrité du modèle Fadi. Recommandation : traiter avant activation/schedule généralisé les cas de troncature et d'état trompeur ; tests/recette sans réseau avec fixtures avant publication. A4 ne modifie pas cette branche ni les coches. A0 possède le triage de ces réserves avec le propriétaire #168.

### Mise en service distincte

Le cron05:17UTC est déclaré, mais ne devient effectif sur branche par défaut qu'après fusion autorisée. create-pull-request vise `automation/studio-checklist-daily`, pas push direct main ni auto-merge. L'autorisation administrative Actions→créationPR et le workflow_dispatch ne sont pas exécutés ici. Attention : workflow_dispatch peut être lancé sur une branche par une personne habilitée ; sa simple disponibilité n'est pas l'accord de cette mission. La recette après fusion doit être autorisée séparément, vérifier PR snapshot, sémantique des dates et conservation manuelle des trois validations sur copie de stockage de test.

### Suite autorisée

A0 intègre contribution A4 et publie les observations dans le suivi approprié s'il le juge couvert ; A4 continue préparation NAV/maquettes, A5 relie fixtures/oracles. Aucun code Studio, fusion #142/#168, réglage Actions ni édition HTML n'est lancé par ce rapport.
