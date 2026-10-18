# M13/M16 — Contrat de navigation Studio pour spécifications, Mission 004

Version spécification 0.2 — 18 octobre 2026. Référence M004 lue : `301a4fa8f2594fa1c8f0317c18085b5ae22ac7a3`. Reprise de `/workspace/work/mission002/A4-ux.md` sans le modifier. Référence examinée : PR #165, HEAD local `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Sources : AGENTS/CLAUDE, continuité, CODEX-START-HERE, MISSIONS/missions.json, HANDOFF→STATUS→TASKS→CONTEXT ai-team et studio, réception Mission 002. Ce document précise M13 et prépare M16/M21 ; aucune architecture, porte, code ou recette n'est déclaré accepté.

## Autorité et décisions

**Imposé par le mandat et les références :** entrée exactement Studio dans le rail vertical principal ; module natif autonome sans passage Parcours ni simple raccourci/iframe Atelier ; services Fadi communs ; quatre domaines et deux planches 2D/3D indépendantes dans Dessin et modélisation ; Projet→Étude→Variante→Révision ; pas de seconde autorité métier ; droits serveur, traçabilité, sauvegarde et publication ; Atelier et 21 étapes préservés ; interface FR/EN et règle Planche icône/barre/raccourci.

**D07 RETENU pour spécifications :** Studio après Projets, URLs complètes et contexte hiérarchique vérifié serveur, plein écran explicite réversible, protection des gestes/sauvegardes, UX clavier/mobile/FR–EN, approbation/publication séparées avec cumul explicite traçable. Les chemins physiques et query ci-dessous sont le contrat opérationnel proposé dans ce cadre ; DEC-13 appareils/budgets et mapping des rôles restent à documenter. D01 retient le référentiel et pilote synthétique pour cadrage, D02 les reports du pilote ; ni G0 ni G1 n’est passé par ce seul arbitrage. D06 retient ordre de revue #154→#152→#142, sans autoriser fusion. Les noms d'actions `study.read`, etc. dans cette contribution sont des droits logiques à mapper aux rôles Fadi, pas des permissions déjà implantées.

## Routes proposées, complètes et non ambiguës

| Route candidate | Contenu et préconditions |
|---|---|
| `/studio` | Accueil global, liste des projets/études autorisés, sélection explicite. Aucun projet fictif, aucune création au GET. |
| `/studio/projets/:projectId` | Études du projet autorisé, création avec droit explicite ; pas de requête Parcours obligatoire. |
| `/studio/projets/:projectId/etudes/:studyId` | Cadrage, sources et variantes de l'étude appartenant au projet. Étude sans variante permise, géométrie interdite sans variante. |
| `/studio/projets/:projectId/etudes/:studyId/variantes/:variantId` | Révision de travail de la variante, contexte actif et droits reçus de la façade autorisée. |
| `/studio/projets/:projectId/etudes/:studyId/variantes/:variantId/revisions/:revisionId` | Consultation d'une révision identifiée et immuable de cette variante. Éditer crée une intention explicite vers travail courant/nouvelle variante, jamais une mutation de cette révision. |

Tous les identifiants sont opaques, encodés comme segments ; type/longueur admis par contrat A2, jamais interprétés comme noms de fichiers. Résolution serveur vérifie existence **et** projectId↔studyId↔variantId↔revisionId et droits sur chaque ressource. Aucune redirection automatique vers le dernier projet en cas de lien interdit. Un contexte obsolète n'est pas remplacé silencieusement. Ordre de priorité : URL explicite autorisée, puis choix utilisateur ; dernier contexte personnel = suggestion seulement. Aucun paramètre URL ne transmet une permission.

Query proposée sur routes variantes/révisions : `domaine=dessin|bim|visualisation|documentation`. Dans `dessin` seulement, `planche=2d|3d`. Exemple complet : `/studio/projets/p1/etudes/s1/variantes/v1?domaine=dessin&planche=2d`. Exemple historique : `/studio/projets/p1/etudes/s1/variantes/v1/revisions/r8?domaine=bim`. Les IDs sont des exemples synthétiques.

Absence de domaine : écran d'accueil de variante, sans créer de planche. Absence de planche en dessin : choix explicite 2D/3D ; reprendre une préférence peut pré-sélectionner le choix sans créer de géométrie. Domaine inconnu/planche inconnue ou `planche` hors dessin : afficher un état URL non reconnue et lien vers contexte parent valide, aucune mutation ; pas de substitution métier silencieuse. Paramètres d'interface sans effet métier (panneau/caméra) restent hors de ce contrat initial. Ne pas coder de données privées dans URL ou analytics.

Précédent/suivant et refresh conservent les segments et choix domaine/planche ; changement de domaine crée une entrée d'historique. Canonicalisation pure de paramètres d'affichage peut utiliser replace, sans perdre contexte ni modifier les modèles. Les liens historiques ne pointent jamais implicitement vers « latest ». Les chemins d'API ne sont pas déduits mécaniquement des routes web.

## Façade de contexte proposée pour A2/M17

StudioShell autonome sous AppShell/RequireAuth ; aucune dépendance à ProjectShell, aucune iframe. Une façade partagée fournit contexte demandé/validé, droits effectifs, révision de base/courante, métadonnées de bandeau et état de synchronisation. Schéma logique candidat : `{ projectId, studyId?, variantId?, requestedRevisionId?, baseRevisionId?, effectivePermissions, accessState, freshness, writerAuthority, schemaVersion }`. Le champ writerAuthority désigne le propriétaire d’écriture unique décidé pour le jeu de données pendant coexistence ; schemaVersion borne compatibilité/reprise (à définir avec M17/M27). Aucun outil n'est actif avant résolution du propriétaire de sa donnée ; géométrie 2D, géométrie 3D libre et objet associé gardent leurs autorités distinctes.

AppShell doit reconnaître `/studio/...` pour le bandeau, mais n'active pas Projets. HomeTopbar actuel appelle étapes/programme quand projectId existe : adaptation par façade ou contrat de bandeau borné, sans faire de Parcours une dépendance de Studio. Les données d'étapes restent consultables par lien explicite lorsque nécessaire. Switching projet détruit ou isole la scène/caches de l'ancien contexte ; un retour de requête tardive ne remplace pas le nouveau contexte. Droit révoqué invalide les vues sensibles selon politique cache arrêtée par A2/A5, y compris offline.

## Surface et navigation

Rail Fadi persistant hors plein écran explicite ; Studio actif sur toutes ses routes, pas Projets/Collaboration. Placement après Projets retenu pour spécifications par D07 ; ne pas le reposer comme question ouverte. Rail replié : icône dédiée avec accessible name/title Studio ; déplié : texte visible identique. Menu mobile donne la même entrée, pas un raccourci vers Atelier. Navigation commune reste utilisable en loading/erreur.

Bandeau : Projet / Étude / Variante / Révision, raccourcis parents autorisés, statut de travail et synchronisation distincts. Si contexte partiel, indiquer « Choisir une étude/variante » plutôt qu'inventer une valeur. Si accès refusé, aucun nom du projet interdit. Historique : badge consultation et révision source ; les documents dérivés indiquent leur actualité.

| Domaine | Entrée/limite |
|---|---|
| Dessin et modélisation | Deux planches éditables autonomes ; relation associé/référence liée/copie indépendante visible. Une coupe dérivée ne devient pas document 2D indépendant implicitement. |
| BIM et coordination | Propriétés, exigences/mesures distinctes, contrôles et observations ; aucune autorité géométrique concurrente. |
| Visualisation, rendu et immersion | Vue/caméra/apparence et provenance ; couleur apparente ne modifie pas composition ni volumes. IA/immersion avancées conditionnelles ne suppriment pas ce domaine. |
| Documentation, métrés et collaboration | Vues→feuilles→dossier, observations/revue, approbation et publication séparées ; manifeste des versions effectivement approuvées. |

Desktop : focus visible, pas de débordement global ; panneaux/outils peuvent défiler localement. Mobile : cibles proposées >=44×44 px, défilement local domaines/outils, panneaux refermables, actions importantes nommées et atteignables sans geste secret. Rotation/clavier virtuel : sortie/validation toujours atteignables. Ces seuils UX candidats ne remplacent pas DEC-13 ni un audit WCAG.

Plein écran : bouton explicite « Plein écran » / « Full screen » et sortie « Quitter le plein écran » / « Exit full screen ». Ne pas appliquer automatiquement `atelier-immersive`. Fullscreen API est facultative : échec/refus laisse le mode normal utilisable. Bouton de sortie visible et clavier utilisable ; Échap ferme d'abord menu/geste selon contrat de l'outil et ne constitue pas l'unique sortie. Événement fullscreenchange synchronise le bouton ; sortie système conserve contexte, file et focus. Navigation Fadi demeure réaccessible via sortie, sans masquer une erreur de sauvegarde.

## États et droits candidats

| État | Présentation et action autorisée | Interdit |
|---|---|---|
| Auth en attente/expirée | Chargement de session puis connexion ; retour URL demandé après validation. | Afficher contenu sensible avant session ou envoyer les commandes en tant qu'anonyme. |
| Aucun projet/étude/variante | Choisir/créer selon droits, liens parents. | Géométrie orpheline, création par simple ouverture. |
| Chargement | role=status ; commandes dépendantes inactives, rail disponible. | Afficher le précédent projet comme projet courant confirmé. |
| Refus/introuvable | Message neutre, retour autorisé. | Fuite de noms, vignettes, exports ou données mises en cache d'un contexte interdit. |
| Lecture seule/lock | Badge et motif ; consultation/outils compatibles permis. | Mutations depuis bouton, raccourci, profil importé ou appel direct. |
| Réseau/chunk/moteur en erreur | État localisé, réessai contrôlé, sortie et modèle canonique conservés. | Spinner permanent, succès fictif, mutation partielle. |
| Offline préparé | Statut local et outils réellement présents ; droits à revalider. | Présenter catalogue disponible comme installé ou confirmer publication serveur. |
| Preview/geste | Visuel transitoire identifié, Annuler/Terminer selon contrat. | Persister un geste en changeant d'espace sans décision. |
| Local durable / pending / confirmé | Trois états explicites, conflits/refus séparés. | Bouton « Enregistré » confondant stockage local et confirmation centrale. |
| Conflit/résultat périmé | Base/courant et résolution autorisée ; résultat périmé non engagé. | Last-write-wins ou application double après reconnexion. |
| Approuvé/publié/historique | Versions exactes et rôles distincts. | Publier une nouvelle version sous approbation de l'ancienne. |

Droits logiques candidats : lire étude, créer étude, modifier variante, exécuter contrôle, commenter, soumettre, approuver, publier. Mapper aux permissions Fadi et au verrou d'édition sans inventer une élévation d'administrateur. Profil personnel ne modifie aucun droit ; découverte≠exécution. Permission perdue pendant attente : refus serveur, conserver un brouillon local autorisé selon politique, pas de confirmation réussie.

FR source dans composants + en.json et messages.ts pour l'ergonomie Atelier réutilisée. Nom Studio identique FR/EN ; libellés des domaines traduits sans traduire données, noms de projet, exemples ou livrables. Locale nombres/dates suit dispositif existant. Changer de langue recharge actuellement la page (`lib/i18n/index.ts`) : soumettre au même garde de transition que fermeture/refresh, sans se reposer seulement sur beforeunload.

## Contrat de transition pending proposé

Portée : route globale, changement de projet/étude/variante/révision/domaine/planche, historique navigateur, langue, sortie fenêtre et mise à jour SW. Séparer changement de disposition (plein écran/panneau) qui ne devrait pas abandonner le geste, et changement de propriétaire de données qui exige une frontière.

1. Aucun geste/commande pending : naviguer et restaurer focus.
2. Geste non engagé : Rester / Annuler le geste puis quitter ; « Terminer puis quitter » uniquement si contrat d'outil le permet et commande confirmée ou localement durable selon choix utilisateur.
3. Commandes localement durables en attente : Rester / Attendre confirmation / Quitter en conservant le travail local si preuve de reprise du contexte. Montrer explicitement non confirmé serveur ; ne jamais vider la queue.
4. Erreur de stockage local : empêcher une promesse de reprise, proposer Rester/récupération explicite ; téléchargement n'est pas réputé sûr ou complet sans contrat.
5. Conflit/refus : garder traces et accéder à résolution ; quitter n'équivaut ni à résoudre ni à publier.
6. Fermeture forcée mobile : la durabilité est assurée avant l'événement par le modèle/queue, pas par une boîte native incertaine. SW incompatible n'écrase pas contrat/queue.

Chaque intention garde contexte complet et requestId ; aucune commande ancienne n'est réadressée à la variante visible après navigation. D07 acte la protection et les permissions pour spécifications ; les mécanismes exacts dépendent des contrats DEC-12/14/M17. Leur rédaction ne lève ni G1, ni G3, ni l’autorisation de code Studio.

## M16 : sous-lots préparés, pas implémentés

I.1 rail/descripteur avec position retenue et base PR142 à requalifier ; I.2 routes protégées et erreurs ; I.3 façade/bandeau ; I.4 domaines/choix planches ; I.5 focus/transitions/plein écran. Entrées : M13 approuvé, M14 G3 lot I, M17 contexte stable, M15 fixtures/oracles. Sortie : NAV pertinents sur SHA précis et preuve de non-régression. Une enveloppe sans édition/sauvegarde n'est pas un MVP. Réalisation AUTORISATION_REQUISE.


## Delta Mission 004 — mandat et portes

Sources relues : AGENTS, `CODEX-MISSION-004-PROMPT.md` (nom exact du prompt local), `CODEX-DELEGATED-DECISIONS.md`, checkpoints Studio et règles de reprise. D01/D02/D07 sont retenus pour cadrage/spécifications ; ne pas les présenter encore en attente du même accord. A3-DB-1/2 est autorisé dans son lot séparé, ce qui ne donne aucun droit de code Studio à A4/M16. La présente contribution ne prétend pas avoir exécuté ou validé le lot DB. D08 couvre l’intégration documentaire par A0.

| Élément | État au titre de cette contribution |
|---|---|
| D07 principes/placement/droits | Retenu pour spécifications, portée bornée par délégation |
| Contrat M13 et neuf fiches NAV | Documentation précisée ; revue/complétude G1 à consolider par A2/A5/A0 |
| Maquettes | Documentaires statiques, non application ni revue utilisateur effectuée |
| G0/G1 | Pas déclarés passés ; dossier et preuves restent à rapprocher |
| G2/G3 Studio | Non passés ; POC/code non autorisés par D07 seul |
| M16/M21 code | Non implémentés, aucun lot ouvert par A4 |
| NAV/TEST Studio | Prescrits, non exécutés ; aucune validation Code/ChatGPT/Admin cochée |

### Authentification et deep link : contrat précis supplémentaire

- Entrée anonyme par URL complète : authentification sans précharger noms/vignettes/contenus sensibles. Garder un `returnTo` interne validé (même origine, chemin Studio autorisé, pas protocole/host arbitraire), puis revalider toute appartenance serveur. Une session acquise ne valide pas l’objet demandé.
- Session expirée en édition : arrêter l’envoi de nouvelles mutations ; distinguer commande dont accusé serveur manque d’une commande refusée. Conserver la file locale autorisée et son propriétaire utilisateur/contexte ; ne pas l’envoyer sous un nouvel utilisateur après reconnexion.
- Reconnexion même utilisateur : revalider droits/baseRevision et requestId avant reprise ; résultat accepté mais réponse perdue doit être dédupliqué côté serveur. Reconnexion autre utilisateur : isoler/verrouiller la file d’origine sans fuite ; proposer revenir au bon compte, pas réattribuer les objets.
- Lien historique : ouverture en consultation même si le rôle peut éditer le courant. « Reprendre le travail courant » change explicitement l’URL et le contexte ; aucune modification rétroactive de la révision citée.
- Retour navigateur pendant chargement/conflit : respecter garde de transition ; `AbortController` ou cancellation d’affichage seul ne prouve pas annulation de commande serveur. Une commande partie reste suivie dans son contexte initial.

### Permissions et cumul explicite

Approbation et publication ont deux capacités logiques indépendantes. Matrice de recette : lecteur aucune ; concepteur mutation autorisée seulement ; approbateur approuve l’ensemble identifié sans droit publier implicite ; publieur diffuse seulement sous approbation valide ; rôle cumulatif uniquement si configuration explicite des deux permissions et décision tracée. Administrateur technique sans délégation métier ne gagne aucun droit implicite. Révoquer une permission avant l’acte déclenche refus serveur même si le bouton était visible.

### Critère READY de M16

READY ici signifie **préparation documentaire** avec entrées présentes. Le lot d’implémentation exige contrat contexte M17 stabilisé, décision G3 du lot I et autorisation de code distincte. Une route/maquette exposant les quatre domaines ne termine aucun parcours A/B/C ni publication.


## Complément documentaire ROUTE-03 — étude : cadrage, sources et variantes

Libellé source conservé sans réécriture : **« Décrire l’option `/studio/projets/:projectId/etudes/:studyId` pour le cadrage, les sources et les variantes. »** Le registre canonique conserve son texte exact source ; cette section précise sa conception, sans cocher sa réalisation.

À l’URL d’étude, afficher trois zones nommées **Cadrage**, **Sources de l’étude**, **Variantes**. Les sources sont des références au catalogue/stockage Fadi commun, jamais une seconde base documentaire. L’étude peut déjà référencer des sources avant sa première variante ; ouvrir la page ou une source ne crée aucune géométrie.

- **Lecture :** lister uniquement les références autorisées de cette étude, avec titre, type/format, auteur/fournisseur si connu, date, version et état de disponibilité ; afficher provenance, unités/repère/transformation et restrictions lorsqu’applicables (EX-014/IF-001). Une information absente reste non renseignée ; pas d’auteur ou de validation inventés. Consultation/téléchargement de chaque pièce revérifie les droits de sa ressource ; un titre ou aperçu interdit ne fuit pas depuis une ancienne étude en cache.
- **Rattachement/import :** actions explicites distinctes « Lier une source existante » et « Importer une source », offertes seulement selon autorisation. L’import n’est pas une conversion native/BIM automatique : choix de fichier, métadonnées/provenance et restrictions, contrôles de type/taille/sanitation, rapport d’incompatibilités/pertes puis confirmation de rattachement au contexte exact selon contrat A2/API. Aucun téléversement réel ni import n’est effectué par cette spécification. Les données inconnues ne sont pas silencieusement ignorées.
- **État :** aucune source → message et action autorisée ; lecture seule → liste/consultation autorisées, mutation refusée avec motif ; chargement/erreur → état récupérable ; source retirée/indisponible → référence explicitement indisponible, sans substitution ni effacement des versions historiques. Changement d’étude pendant import/pending suit la garde NAV-007 ; aucune pièce n’est réadressée à la nouvelle étude.
- **Variantes :** la zone reste accessible même vide, avec « Aucune variante » et « Créer une variante » selon droit. La liste permet ouvrir une variante existante ; la création intentionnelle fournit son propriétaire studyId/projectId vérifié serveur. Sans droit, lecture selon autorisation et motif du refus. Une source liée à l’étude n’est pas copiée/convertie implicitement lors de la création ; les références/versionnements et la politique d’évolution sont explicités par M17. Aucun modèle 2D/3D n’est créé par simple navigation.

Oracles documentaires proposés : URL étude vide expose les trois zones sans variante fictive ; source autorisée consultable avec provenance ; pièce d’autre étude/projet refusée sans fuite ; import non autorisé/refusé n’engendre ni référence partielle ni objet ; variante créée seulement par intention autorisée, source immuable conservée. Exécution future : NAV-003/004/006/007, TEST-028/035 selon capacités ; la description seule ne les déclare pas réussis et ne passe pas G1.
