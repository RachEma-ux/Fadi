# Évaluation du plan d'implémentation « Real-time Collaboration » — 24 octobre 2026

Statut : **évaluation documentaire**, pas une décision. Elle n'ouvre pas le chantier Temps réel (ordre CR-D9, tâche
CR-3) et ne modifie aucun code. Document évalué : `Fadi-Real-Time-Collaboration-Implementation-Plan.md` (fourni dans la
session, non versionné), base déclarée `main@2577e25`.

Méthode : lecture du code de `main@2577e25` (identique au HEAD de `origin/main` au moment de l'évaluation, CI « CI »,
architecture, continuité, isolation et project-layout vertes sur ce SHA), des branches et PR ouvertes, et des comptes
rendus des sessions Claude Code actives le 24 octobre 2026. Aucune recette navigateur, aucun déploiement ni aucun test
de charge n'a été exécuté pour cette évaluation.

---

> **Suite donnée (2026-10-24)** : chantier ouvert ([`real-time-collaboration/`](../workstreams/real-time-collaboration/CONTEXT.md),
> Issue #283). Le maître d'ouvrage a tranché les décisions de la § 4 : RTC-0 ouvert en parallèle (RT-D1) ; **Studio seul**
> et **canal propre au Temps réel** (RT-D3), ce qui écarte la recommandation (b) sur l'Atelier (P2) et le canal partagé
> avec COM (P5). Les recommandations ci-dessous restent l'état de l'évaluation à sa date.

## 1. Évaluation de la web app Fadi (au regard du temps réel)

| Domaine | Constat vérifié dans le code | Conséquence pour le temps réel |
| --- | --- | --- |
| Architecture | Monolithe modulaire npm (React 19 / Vite, Express 5, Drizzle, PostgreSQL + PostGIS) ; modèles purs (`packages/atelier-model`, `core-geometry`). | Le transport doit rester une couche mince : la logique métier est déjà pure et partagée navigateur / serveur. |
| Écritures Studio | `lib/studio-commands.ts` : contrat versionné, `requestId` + `baseRevisionId`, verrou de projet, rejeu idempotent. | Base saine pour la reprise (RT-R5). À conserver telle quelle. |
| Écritures Atelier | `routes/atelier-commands.ts` : microversions `projects.model_revision`, `atelier_commands` unique par `(projet, requestId)`, `atelier_outbox` transactionnelle, **journal `GET /journal?apres=n`** (curseur par révision), annuler / rétablir par inverse. | Un curseur de rejeu par client **existe déjà** pour l'Atelier (révision). Le client le relit toutes les 60 s (`atelier-client.ts:138`). |
| Verrous | Réservation d'édition projet 30 min (`routes/lock.ts`, 423) ; verrous fins de l'Atelier (`atelier_locks` : étage, zone, objet, échéance, motif). | RT-R6 (réservation avec titulaire, portée, échéance, reprise) est déjà à moitié réalisé côté Atelier. |
| Accès | `lib/owned-project.ts` (`loadProjectAccess`) : propriétaire / éditeur / lecteur / support, relu à chaque requête ; droits encore portés par `project_members`, pas par les affectations de rôles. | Point d'autorisation unique réutilisable pour l'entrée, l'envoi et la reconnexion (RT-R1). |
| Audience | `lib/audience.ts` : `equipe` / `projet` (E1, PR #274). | Insuffisant pour une session « paquet seul » : dépend d'Organisations phase 4. |
| Observations | Observations Studio avec contexte de vue (`VUE_MODES` : plan, 3d, feuille…), domaines, révision. | Les annotations enregistrées ont un propriétaire naturel (CR-D1 (a)). |
| Hors ligne | IndexedDB (Dexie), files de lots, cache de modèle, `project-cache-guard`, oubli de la copie locale (E7). | La reprise de session doit s'y brancher, pas dupliquer une file. |
| Temps réel | **Aucun** WebSocket / SSE / EventSource dans `apps` et `packages` (seule occurrence : le test d'indépendance du Sandbox). Rafraîchissements par relecture (60 s : projet, notifications, journal et verrous de l'Atelier). | Tout le transport est à construire. |
| Serveur et proxy | `app.listen` simple (`server.ts:94`), `helmet` sans CSP, `trust proxy` configurable, garde CSRF sur les écritures par cookie ; Caddy `reverse_proxy` (préproduction derrière `basic_auth`). | Upgrade WebSocket supporté par Caddy par défaut ; à vérifier : `basic_auth` et cookies sur l'upgrade, garde d'origine (la garde CSRF HTTP ne couvre pas un upgrade). |
| Sandbox | Indépendance bidirectionnelle testée (`modules/sandbox/independance.test.ts`), aucun appel serveur hors préférences. | Exclusion du Sandbox justifiée. |
| Qualité | CI verte sur `2577e25` ; recettes e2e nombreuses (`collaboration-audience`, `studio-persistance`, `studio-hors-ligne`, `studio-conflits`, `atelier-versions`…). | Socle de non-régression riche ; les nouvelles recettes multi-contextes doivent s'y ajouter. |

**Verdict application** : socle robuste pour un temps réel « vue partagée + annotations + revue figée » (idempotence,
versions, verrous, journal à curseur, audience, hors ligne). Manques réels : transport, sessions, présence, audience
« paquet », rôles Approbateur / Diffuseur (en cours), revue externe figée (non commencée).

## 2. Travail des équipes en cours (sessions et PR du 24 octobre 2026)

| Travail | Où | État | Effet sur le plan évalué |
| --- | --- | --- | --- |
| **Organisations, exécution de bout en bout (OP-3)** | PR #281, branche `ccr-3b26a9f6-z073dc` ; session « Plan de mise en œuvre » active | OP-3 : l'ordre « implémente de A à Z » vaut validation 🛑 1 et enchaînement des phases 2, 3, 3 bis, 4, 5, 6 sans acceptation intermédiaire. Phases 2, 3 bis et 5 en cours dans des arbres de travail (non poussées). `lib/project-responsables.ts` ajouté. | Le prérequis « Organisations 1–4 » avance vite ; le plan le décrit encore comme une PR « ouverte, hors base ». |
| **Écarts E5, E6, E9, E10** | PR #282, branche `ccr-e2b77568-r17oja` ; session « User management » | Approbateur et Diffuseur désignables (E5), fin de participation qui libère réservation et verrous (E6), glossaire « publication » (E9), gardien du contenu (E10), annexe A reportée dans le plan d'Organisations (CR-1). CI DB-3 en attente. | Fournit l'autorité ciblée dont dépend RT-06 / RT-R2 et la libération des réservations au départ (RT-R6). Le plan l'ignore. |
| **Communication (COM)** | Issue #280, branche `ccr-a50667e3-fng2br` ; session « Module Communication » active | **Ouvert avant Organisations 2–4 par dérogation à CR-D9 (COM-D1)**. Plan COM-1 à COM-8 et socle API poussés : `com_conversations` (contextes dont `revision-atelier`), messages idempotents, audiences `participants` / `equipe` / `projet`, notifications `message` et `demande`, boîte. Pas de PR. Aucun transport temps réel (relecture). | L'ordre CR-D9 n'est plus l'ordre réel. COM fixe déjà des choix (audiences, contexte, raccourcis Alt+Maj+4…0 et ponctuation) que le temps réel doit réutiliser. |
| Suivi UM-31 | PR #279 | Documentaire. | Aucun. |
| État des modules | Session « Modules implementation status » (terminée) | Confirme : Temps réel sans chantier ni plan ; Organisations phase 1 seule dans `main`. | Corrobore le constat du plan. |

Retards de suivi confirmés (comme le dit le plan) : `collaboration-rules/STATUS.md` et `HANDOFF.md` décrivent #274 comme
non fusionnée ; `organisations-participation/STATUS.md` décrit la phase 1 « en attente de revue ». À corriger par leurs
chantiers respectifs (PR #281 / #282 en cours), pas ici.

## 3. Évaluation du plan fourni

### 3.1 Exactitude des constats — vérifiée

Tous les faits de la section 2 du plan ont été recoupés et sont **exacts** au SHA `2577e25` : stack, `owned-project.ts`,
`audience.ts`, `submitStudioCommands` (`requestId`, `baseRevisionId`, verrou), observations avec contexte de vue,
`atelier_outbox` à drapeau `processed_at` (pas un curseur par client), absence de transport temps réel, fusion de #265 et
#274, retard des fichiers de suivi, script `deploy/preprod/fadi-preprod-auto` et gabarit Caddy, contrat d'indépendance du
Sandbox. Les recettes citées pour la non-régression existent toutes.

### 3.2 Points forts

1. **Bon découpage** : vue partagée, annotations, revue figée avant toute coédition ; coédition reportée (RTC-6) avec
   ADR distincte — conforme au concept v1.2 et à « no last-writer-wins / CRDT géométrique ».
2. **Invariants de sécurité solides** : projection par destinataire, revalidation à chaque envoi, échec fermé, frontière de
   révocation testable, portée discriminée (session projet ≠ session paquet).
3. **Deux classes de livraison** (éphémère / durable) et « un accusé de socket n'est pas une sauvegarde » : juste.
4. **Déploiement et retour arrière** réalistes : drapeau serveur désactivé par défaut, pas de suppression de tables,
   vérification de `/version`, passage par le chemin Caddy réel.
5. **Honnêteté** : limites déclarées, budgets présentés comme cibles et non mesures, estimation donnée comme fourchette.

### 3.3 Écarts et corrections demandées

| # | Gravité | Écart | Correction proposée |
| --- | --- | --- | --- |
| P1 | **Majeur** | **Séquence obsolète** : le plan pose CR-D9 « Organisations 1–4 → COM → RTC » comme ordre réel. COM est déjà ouvert par dérogation (COM-D1) et Organisations s'exécute de bout en bout (OP-3). | Réécrire § 1 et la porte « Prerequisite integration » : prérequis = **fusion** d'Organisations phases 2–4 (PR issues d'OP-3), de #282 et du socle COM (#280) ; déclarer que l'ordre réel diffère de CR-D9 (a) et demander au maître d'ouvrage si RTC-0 peut démarrer en parallèle (documentaire seulement). |
| P2 | **Majeur** | **Atelier absent du périmètre** : le plan ne parle que du Studio. Or l'Atelier a ses propres révisions, journal à curseur, verrous fins, annuler / rétablir, et COM le cite comme contexte (`revision-atelier`). | Déclarer explicitement l'Atelier (et la Planche de l'étape 10) **dans** ou **hors** du premier périmètre. Recommandation : adaptateur Studio en premier, Atelier en second adaptateur de RTC-2, en réutilisant `GET /journal?apres=n` comme source de rejeu au lieu de le réinventer. |
| P3 | **Majeur** | **Critères RT-R1 à RT-R7 non repris** : la tâche CR-3 exige de les inscrire dans le plan Temps réel. Le plan crée ses propres « cinq invariants » et des tests `RT-01…RT-16` dont le préfixe se confond avec `RT-R*`. | Ajouter une table de traçabilité RT-R1…RT-R7 → lots → tests ; renommer les tests (par ex. `TR-T01…`) ; relier S6, S7, S9 de la recette commune (vague 4). |
| P4 | Moyen | **#282 ignorée** : E5 (Approbateur / Diffuseur hors propriétaire) et E6 (fin de participation libérant réservations et verrous) livrent une partie de RT-R2 et RT-R6. | Citer #282 comme fournisseur de l'autorité ciblée et de la libération des réservations ; RT-06 et RT-10 s'appuient dessus. |
| P5 | Moyen | **Frontière COM ↔ RTC** non tranchée : COM relit ses notifications toutes les 60 s ; si le temps réel ouvre un canal, la question « COM passe-t-il par ce canal ? » se posera, avec un risque de second transport. | Décision RTC-0 : un seul canal serveur → client, propriété du Temps réel (transport), contenus et audiences restant à COM ; réutiliser les audiences COM-D3 et la résolution de référence par lecteur COM-D8 (même règle que RT-R7). |
| P6 | Moyen | **Verrous existants sous-exploités** : RTC-6 parle de « réservations granulaires si justifiées » sans citer `atelier_locks` ni la réservation projet. | RT-R6 : partir de `atelier_locks` et `routes/lock.ts` (titulaire, portée, échéance existent déjà) ; ajouter seulement la reprise autorisée et l'affichage en session. |
| P7 | Moyen | **Sécurité de l'upgrade WebSocket** : la garde CSRF HTTP ne s'applique pas à l'upgrade ; `helmet` tourne sans CSP ; préproduction derrière `basic_auth`. Le plan mentionne Origin et basic-auth, mais pas l'absence de CSP ni la ré-authentification de session périodique sur une connexion longue. | Ajouter à RTC-1 : vérification d'origine **et** de session à l'upgrade, revalidation de la session de compte (expiration, révocation UM) à intervalle borné, CSP `connect-src` si une CSP est introduite. |
| P8 | Mineur | **Placement « Collaboration → Live sessions »** : nom anglais ; Fadi exige la source française (D-163) et la règle d'or (icône, barre, raccourci). Les raccourcis Alt+Maj+chiffres et ponctuation sont pris par COM-D14 et #282 (Alt+Maj+4…6). | Libellés source français (« Sessions en direct »), plan de raccourcis concerté avec COM-D14 et la Planche, test de non-collision étendu. |
| P9 | Mineur | Budgets de capacité sans profil de référence Fadi (taille de modèle P.118, appareil Android réel). | Les fixer en RTC-0 sur l'exemple P.118 et l'appareil de recette déclaré. |
| P10 | Mineur | Estimation 29–47 j·h sans la charge de l'adaptateur Atelier ni de l'intégration COM. | Réestimer après P2 / P5 (ordre de grandeur +5 à +10 j·h). |

### 3.4 Ce qui ne doit pas changer

Portée discriminée, projection par destinataire, aucune autorité par l'hébergement, séparation caméra ≠ édition ≠
annotation ≠ approbation ≠ publication, drapeau désactivé par défaut, retour arrière sans suppression de données,
exclusion du Sandbox, report de la coédition.

## 4. Conclusion

- **Plan : bon, à amender avant validation.** Les constats sont exacts et l'architecture proposée est cohérente avec
  Fadi. Trois amendements majeurs sont nécessaires : séquence réelle (P1), périmètre Atelier (P2), traçabilité RT-R1…R7
  (P3).
- **Implémentation : pas prête.** Les prérequis (Organisations 2–4, #282, socle COM) sont en cours sur des branches non
  fusionnées ; aucune décision n'ouvre le chantier Temps réel.

### Décisions qui appartiennent au maître d'ouvrage

1. Ouvrir RTC-0 (cadrage documentaire, dossier `docs/workstreams/real-time-collaboration/`) **maintenant**, en parallèle
   des chantiers en cours, ou attendre la fusion d'Organisations 2–4 et de COM (CR-D9 (a)).
2. Périmètre du premier lot : Studio seul, ou Studio + Atelier.
3. Transport : un canal unique partagé avec COM, ou propre au Temps réel.

### Prochaine action proposée

Si (1) est accordé : ouvrir l'Issue Temps réel, créer le dossier de continuité, y reporter le plan amendé (P1–P10) et les
critères RT-R1…RT-R7 (clôt CR-3), sans code, puis attendre la fusion des prérequis avant RTC-1.
