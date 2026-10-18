# A2 — Préparation M05 / M07 / M08

Référence : copie PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`, programme #156 ; ne vaut pas main fusionné. Réemploi du rapport original Mission002, non réécrit. Vérifications du 18 octobre 2026, sources dépôt inchangées ; seuls fichiers de préparation agents/A2 créés. Les contrats ci-dessous sont PROPOSÉS, sans correctif applicatif, validation DEC ou autorisation A3.

## M05 : version de commandes et compatibilité

**Constat revalidé** : `packages/atelier-model/manifest.json` annonce `atelier-commands:2`; `commandes/base.ts:9–10` émet /3 et accepte /1,/2,/3. `apps/api/src/routes/atelier-commands.ts:57–63` valide avec CONTRATS_ACCEPTES. Ne pas modifier la constante pour la ramener à /2.

**Contrat proposé C-ATELIER-V3** : source d'autorité de la version émise = constante du package pur ; manifeste reflète version courante 3 et liste explicite des versions lisibles 1,2,3 (forme exacte du manifeste à ratifier). Conserver enveloppe existante `{requestId,baseRevision,contract,label,commands:[{type,params,cibles?}]}`. Aucun actorId client n'est autoritaire ; appartenance et droits serveur, limites existantes conservées. Version inconnue refusée avant mutation ; chaîne mal formée, nombre, null et absent refusés. `/1` et `/2` restent acceptés seulement pour les commandes et schémas réellement compatibles : ne pas supposer toutes commandes v3 utilisables en v1. Recenser par commande version d'introduction, migration paramètres et inverse ; garder commandes historiques lisibles. Aucun bump automatique des archives natives, du modèle ou des journaux.

**Compatibilité et preuve attendue** : matrice 3 versions × commandes anciennes/nouvelles × preview/commit/undo/redo ; jeu historique synthétique pour /1 et /2 ; aller-retour de sérialisation sans perte ; déduplication même requestId ; conflit baseRevision ; refus version inconnue sans changement du modèle/journal/outbox ; profils et queue offline d'ancienne version préservés. Tests purs d'abord, intégration seulement sur cible M02 vérifiée jetable. Ajouter contrôle cohérence manifeste/constante dans un lot borné, pas refaire garde-fous #152. Rollback : restauration du manifeste/build, aucune réécriture de données ; version future réellement incompatible nécessite décision séparée et migration.

### Collision du catalogue : C-TOOL-IDENTITY (DEC-05/18)

`nouveau/outils.ts:84` id=echelle pour objet échelle accès ; :120 id=echelle transformation ; :150 Object.fromEntries conserve la seconde. Déclaration ambigüe prouvée statiquement, panne utilisateur non reproduite.

Proposition : identités distinctes `atelier.arch.ladder` et `atelier.transform.scale` (noms **candidats**, alignement Registry Studio requis), labels FR Échelle/Mettre à l'échelle contextualisés et EN Ladder/Scale. toolId de catalogue ne doit pas renommer classe sémantique `echelle`, type de commande ou propriété persistée. Mapper anciennes références avec contexte famille/fiche : `creer+DA-07-13`→ladder ; `modifier+DA-02-05`→scale ; ancien `echelle` seul = ambigu, conserver et demander résolution, jamais convertir silencieusement. Nouveau profil sérialisé porte toolId+version ; ancien profil reste récupérable et rapport de migration. Unicité de tous IDs avant construction du dictionnaire ; refus explicite collision. Tests lookup/recherche/palette/actions sur les deux outils, permissions/contexte, round-trip et alias ambigus ; icône/barre/raccourci suivant AGENTS, statut non validé tant que recette A5/A4 absente. A3 inactif, changement de nom final et migration à autoriser.

## M07 : PR #152, frontière et graphe

Snapshots A0 relus : #152 ouverte brouillon head `f2777230e3e9c3bd6a2a5f61e2147acd1fba4b38`, mergeable true ; diff 13 fichiers, scripts/workflow/docs. #151 ouverte vérifiée par API (snapshot issue-151.json). Le patch introduit AST/résolution alias, imports type/require/dynamiques, refus cibles calculées, séparation apps/packages/ontologies et cycles **paquets/apps** ; 52 tests déclarés/rapportés dans PR. Pas de nouveau moteur à recréer. Les résultats CI cités dans son corps sont historiques, pas réexécutés par A2.

Limite explicitement confirmée par diff : aucun contrôle des cycles de fichiers interne à un package ; aucune politique complète des sept modules web. Revue et tests du SHA #152 avant complément ; ne pas fusionner ni cocher M07 en entier sur ce rapport.

`module-edges.json` contient 25 arêtes locales intermodules issues d'AST TypeScript (dont 1 dynamic import, 2 CSS). 0 import explicitement type-only détecté sur ces arêtes ; 24 imports/exports à syntaxe valeur, 1 dynamique. Cette classification distingue syntaxe type/value, pas une preuve de code effectivement exécuté : compiler, tree-shaking, CSS et dépendances transitives non simulés. Le script local couvre relatifs littéraux, pas alias ni require ; #152 couvre d'autres angles. Cycles agrégés de responsabilités : atelier↔parcours, parcours↔projets-sources, accueil↔pilotage. Cela ne prouve pas un SCC de fichiers ni une erreur au chargement.

### Frontières permises PROPOSÉES (pas architecture acceptée)

| Source | Cible permise | Règle / exception |
|---|---|---|
| AppShell / routes composition | Façades publiques des modules | Composition UI explicite ; pas code métier dans shell. |
| Module métier | lib/services communs, composants UI neutres, packages purs publics | Une interface publique versionnée ; tests et direction unique. |
| Parcours | Façades d'Atelier/Programmation/Projets/Collaboration | Intégrations existantes à isoler, pas accès profonds arbitraires ; Harmonie reste intégrée. |
| Atelier / Studio | Services et moteurs communs via adaptateurs publics | Pas import de ProjectShell, pas Atelier complet/iframe ; aucun Studio↔Atelier profond. |
| Programmation / Analyses / Documents / Collaboration | Contrats publics de lecture/commande, pas état UI privé d'un autre module | Programme exigence distinct du dessin, calculs non dupliqués. |
| Packages purs | Dépendances déclarées, pas apps, React/DOM/renderer | Règles existantes et #152, ontologies sans imports directs réciproques. |
| Tous | DrawAll opérationnel | Interdit ; historique et normes/licences légitimes conservés. |

Extractions candidates à décider : HarmonieToast/CenterElevationButton/TextConflicts dans façades adaptées, données dossier partagées accueil/pilotage hors cycle, service transmission parcelle hors bus UI profond. Ne pas déplacer automatiquement ces composants : inventaire consommateurs, séparation métier/UI, test contrats et non-régression d'abord. Baseline d'exceptions nommée, justifiée, datée et propriétaire ; interdire toute nouvelle arête non prévue sans ADR, pas ignorer le graphe existant. Tests futurs : type-only, runtime, alias, CSS/dynamic, interface permise, import profond refusé, exception exacte et cycle nouveau ; conserver #152 plutôt que fork.

## M08 : isolation et inventaire

#147 ouverte revalidée API ; #148 fusionnée revalidée snapshot A0, ne pas garder « PR brouillon non fusionnée » comme fait actuel. Aucun accès à DrawAll. Scanner local relancé en lecture seule : **1 283 fichiers texte scannés, 488 touchés, 1 887 lignes**, 0 fichier sauté par taille dans son périmètre. 269 fiches, 176 fichiers code, 39 documents, 4 métadonnées ; ancien chiffre 494/2267 n'est pas le résultat actuel. `check-fadi-isolation` : **761 fichiers**, aucune référence nominale interdite ; limite de périmètre connue.

Artefacts locaux `isolation-inventory.json` (chaque ligne/extrait) et `isolation-triage.json` (488 dispositions provisoires) produits. Triage mécanique : 269 fiches DA à conserver/revoir, 176 codes DA à conserver/revoir, 23 fichiers à marqueur nominal à lire individuellement, 20 autres traces DA à rapprocher. **Ce n'est pas une qualification sémantique exhaustive ni 488 décisions acceptées.** Aucun artefact GitHub ancien téléchargé : inventaire local accessible préféré et différence de périmètre explicite ; archives/binaires, contenu téléchargé, licences transitives, fichiers sans marqueurs et données de production non vérifiés.

Revue ciblée : titre `docs/atelier/README.md` encore « DrawAll V4.1 » = ADAPTER point d'entrée ; `docs/atelier/decisions.md` décision D-200 et journaux mission = CONSERVER historique/protection ; anciens cahiers/matrix migration = ARBITRER toute prescription contractuelle résiduelle ligne par ligne, ne pas effacer les sources normatives officielles. scripts/workflow audit = CONSERVER contrôle de séparation. Inventaire/métadonnées de purge = conserver preuve, actualiser checkpoint sans fausse clôture. Fonctions industrielles natives, codes DA, classes persistées et normes = CONSERVER avec traçabilité/mapping, jamais retrait global.

Prochaine étape autorisée : qualifier sémantiquement les 23 fichiers nominaux puis liens des 269 fiches et 176 codes en matrice stable ; assigner propriétaire/relecteur et preuve de chaque décision ; signaler licences et références inconnues. Tout nettoyage effectif reste un lot borné soumis à accord applicable ; aucun rename DA ou suppression de fonction implicite. M08 reste partiel, #147 non clôturée.

## Dossiers Studio et autorisations

Les fichiers `LOT-*.md` sont des dossiers de préparation liés aux missions existantes, pas un second programme. Sources exactes EX/INV/IF/AC du DOCX RT001 blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches A1. Chaque dossier référence des identifiants exacts ; les spécifications ci-dessus ne remplacent pas leurs textes. A1 fournit DEC, A4 contrat NAV ; A2 ne modifie pas ces fichiers. Réalisation BLOQUÉE AUTORISATION_REQUISE tant que G3 et périmètre du sous-lot non ratifiés ; POC G2, migration, admin, fusion et déploiement ont des accords distincts. Préparation documentaire seule exécutée.

### Compléments de réception A2

- `isolation-nominal-review.json` qualifie les **23 fichiers à marqueurs nominaux** : titre Atelier et étiquettes des trois documents migration à ADAPTER, checkpoints purge à conserver/actualiser, autres occurrences relues à CONSERVER (interdiction, preuve ou historique). Dispositions proposées, non appliquées ; **465 autres fichiers DA et dépendances hors scan restent à qualifier sémantiquement**, pas inventaire clos.
- Douze dossiers LOT contiennent désormais **citations exactes des IDs applicables** depuis les fiches A1 ; 342 rattachements ne représentent pas 342 obligations réalisées. Contrôle indépendant XML du DOCX : **141 textes exacts/141 correspondent à leurs ancrages A1, aucun écart**. Aucun résultat d'exécution métier déduit de ce contrôle.
- Façade NAV A4 relue : contexte plein, query domaine/planche, absence de planche => choix, absence de domaine => accueil, aucun objet créé ; garde des files pending conforme. Aucun conflit observé avec contrats A2. Ajouter writerAuthority/schemaVersion au contrat de coexistence à arbitrer ; distinction contexte UI/révision de référence maintenue.
- Carte AST : `module-registry` est un fichier commun cible, pas un huitième module métier. Compte 25 inclut cette arête et 2 CSS ; aucun décompte alternatif de modules n'est adopté.
