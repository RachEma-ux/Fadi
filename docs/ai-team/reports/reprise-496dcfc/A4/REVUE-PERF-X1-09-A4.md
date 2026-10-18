# Revue indépendante PERF/X.1-09 — A4

Les10sources/40cellules sont reproduites exactement, sans perte ni renumérotation. Exigences et propositions sont séparées ; aucun budget numérique adopté ou résultat runtime fabriqué. Protocole utile pour préparation, réserves de bornes ci-dessous à conserver avant instrumentation/mesure.

Word vérifié au SHA `817bd36e7d4b1ab60ab9c00309509c7cdfed0798`, blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32` ; lignes XML222–231. Lecture et comparaison XML/JSON uniquement, aucun essai produit. Les extraits exacts et empreintes sont conservés dans le JSON.

| PERF | Pertinence UX début/fin | Réserve bornée du protocole proposé |
|---|---|---|
| PERF-01 | Pertinent : fin sur une action métier disponible, pas sur le shell peint. | À renseigner par scénario : action utile précise et intention accessible (clavier/tactile) ; fin identique froid/chaud. Un refus explicite est une issue distincte, pas un échantillon de succès. |
| PERF-02 | Pertinent : demande explicite, préparation des ressources et réponse valide. | Consigner séparément outil prêt et première réponse : fusionner ces deux instants masquerait le temps d’activation. Chargement, worker, transferts et mémoire gardent leurs unités/limites. |
| PERF-03 | Pertinent : lien causal entre événement pointeur et aperçu correspondant, sans attribuer un ancien résultat. | La future méthode doit distinguer soumission de frame et aperçu réellement observable ; un timestamp renderer/rAF ne prouve pas à lui seul une latence physique de bout en bout. |
| PERF-04 | Pertinent : scène versionnée, cible/identité/coordonnées comparées et résultat faux non accepté. | Séparer t_resultat du contrôle d’oracle ; le temps de comparaison n’entre pas implicitement dans la latence snapping. La vérification géométrique reste obligatoire avant d’accepter les statistiques. |
| PERF-05 | Pertinent : navigation prescrite, état caméra et CPU/GPU séparés. | Définir la trace et fenêtre début/fin avant mesure, compter trames manquées ; SwiftShader et GPU réel distincts. Indisponibilité ou échec reste visible et ne disparaît pas des résultats. |
| PERF-06 | Pertinent : propagation de commande aux dépendances et cohérence de même révision. | Le protocole candidat doit préciser les deux bras invalidation et reconstruction totale à entrées/versions/scène égales, avec même état final. La source exige une comparaison de coûts, pas seulement une fin de mise à jour. |
| PERF-07 | Pertinent : demande identifiée, réponse géométrique validée, erreurs dégénérées et refus sans mutation. | Garder chargement et calcul séparés, mémoire/erreurs/précision explicites ; tolérances viennent du contrat/corpus, pas de seuil ajouté par la revue. |
| PERF-08 | Pertinent : sources immuables et document contrôlé par rapport à leur version, annulation explicite. | Séparer disponibilité des octets/livrable et contrôle de fidélité ; un export historique épinglé encore exact n’est pas automatiquement invalide si la tête courante évolue. Interdire sa présentation comme nouveau courant ou publication sous approbation différente. |
| PERF-09 | Pertinent : séquence versionnée et mesures de pic/résiduelle par phase. | Préciser durées/cycles et ressources attendues vivantes ou libérées ; cache ou worker partagé encore utilisé ne constitue pas à lui seul une fuite. Absence de fuite exige un protocole, pas une moyenne favorable. |
| PERF-10 | Pertinent : cache attesté, interruption prescrite et données récupérables après reprise. | Séparer disponibilité pendant coupure, durabilité locale et confirmation centrale après reconnexion ; conflit/brouillon reste explicite. Catalogue en cache seul ne vaut pas outil réellement disponible. |

Priorités de précision : PERF04/08 doivent séparer fin de calcul/livraison et comparaison d’oracle ; PERF06 doit décrire les deux bras invalidation/reconstruction ; PERF08 doit conserver les exports historiques épinglés valides ; PERF09 distingue ressource partagée utile et fuite. Les autres points précisent le futur banc, sans ajouter de seuil ni modifier les exigences.

Aucune erreur bloquante de source. Cet avis valide seulement la fidélité documentaire et l’utilité de préparation ; il ne vérifie ni performance, ni outil, ni gate. Les budgets réels, appareil, protocole de répétitions, mesures et autorisations restent à établir.
