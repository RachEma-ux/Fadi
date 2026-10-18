# Quatre deltas résiduels finis

COEX-01 :11fonctions liées auxgroupesClaudeexistants, interfacespubliques à instruire sans importerlesinternesUI. G3-01 :18DEC et10choix rapportés auxfrontièresI/A.1. G3-03 :six demandesd’estimationcompétente structurées, valeursinconnues. ADR-05 :10risquesRT+7NAV priorisés qualitativement, pasadoptés.

| Fonction | Groupes existants | Interface proposée |

|---|---|---|

|Entrer par Studio, routes complètes et contexte partiel|C02,C08,C10,C12|Façade publique de contexte/routage Studio proposée ; aucun import direct AtelierNouveau/ProjectShell.|

|Résoudre parenté et autorisations|C16,C17,C18,C19|Service projet/identité + résolveur de parenté/droits côté serveur ; API publique Studio reste à ratifier.|

|Cadrer/lire/créer une étude, sources autorisées|C16,C18,C19|Façade Étude rattachée au Projet ; pas accès direct aux tables atelier_* depuis UI.|

|Créer/lire une variante, provenance d'un fork|C13,C18,C19|Service fork/variante par contexte complet ; mapping ancien projet-fork explicite, pas copie opaque.|

|Créer/citer un contenu2D autonome, vide ou défini selon contrat|C03,C13,C16|Document2D canonique + primitives pures réutilisables ; renderer React interne reste adaptateur, pas APIpublique présumée.|

|Engager une modification et produire révision|C01,C13,C17,C21|Façade commande validée/enveloppecontexte + bus existant candidat ; un writer ettransaction, pas deuxième bus.|

|Lire une révision historique exacte|C18,C19|Lecteur snapshot complet immuable souscontexte etempreintes ; endpoint physique à ratifier.|

|Sauvegarder/fermer/rouvrir|C01,C18,C19,C21,C22|Persistance/queue versionnées parfaçade ; scènes etprécache ne sont pas canonique.|

|Gérer versions et compatibilité|C13,C16,C18,C19,C21,C22|Lecteurs/writers versionnés compatibles ; inconnus conservés/refusés selon décision, pas autobump.|

|Protéger navigation, actions/pending et changement compte|C01,C10,C12,C21,C22|UI transition/auth vers propriétairequeue/commande ; annulerUI≠annulerserveur, pas mutationcontexte pending.|

|Préparer contrats aval sans réaliser E/B|C07,C09,C11,C19|Métadonnées Registry etréférences publicationexacte seulement ; servicesE/B complets horspremierlot.|



Sources/hash/textesexacts et18DEC/10choix/sixestimations/17risques dansJSON. RisquesI/A.1 immédiats proposés : contexte/droits/navigation, commandesrejouées, identités/historique ; publication avantE, moteurs/charge/formats avantlotsconcernés. Probabilités/chiffres inconnus ; aucuneprioritéconfirmée.



Aucun re-audit/extraction globale/registrecoches/code/test/moteur/DB/service/admin effectué.

NomsC-* candidats, jamais nouvelleAPI normative ; qualificationClaude etquestionsexistantes nonadoptées.

G0 cadragedoc accepté seulement ; G1/G2/G3 ouverts. Pas choixphysique, optionexclue seulement livraisoninitiale sanssuppressionexigence.

Quatre remises finies ; aucune expansion spéculative après celles-ci.
