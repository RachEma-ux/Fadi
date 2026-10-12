# Compétences techniques pour les accueils de Fadi

**Établi le 12 octobre 2026.** Périmètre : mettre en œuvre les trois tâches validées dans le dépôt `RachEma-ux/Fadi` et maintenir leurs comportements réels.

## 1. Partir de la stack existante

L’inspection de `package.json`, `package-lock.json`, `apps/web/package.json`, `apps/api/package.json` et `docs/architecture.md` confirme :

| Domaine | Stack du dépôt | Conséquence pour l’implémentation |
|---|---|---|
| Interface | React 19, TypeScript 5.9, Vite 6 | Composants partagés dans l’application existante ; aucune migration de framework. |
| Navigation | React Router 7, mode déclaratif | Conserver les routes `/accueil`, `/projets/:projectId` et les paramètres `module`, `etape`, `bilan`. |
| Lectures serveur | TanStack Query 5, avec persistance | Séparer état de lecture, copie disponible, date de réussite, erreur et reprise ; isoler les clés par dossier. |
| Sauvegarde locale | Dexie 4 / IndexedDB, file de commandes de l’Atelier | Rendre les erreurs observables ; conserver les commandes non confirmées et leurs identifiants ; ne pas annoncer une sauvegarde réussie sans confirmation. |
| API et données | Express 5, Drizzle, PostgreSQL/PostGIS, Zod | Réutiliser les droits, réservations, données et événements réellement disponibles. |
| Vérification | Vitest, Playwright, axe-core, GitHub Actions | Tests des décisions et erreurs ; intégration avec PostgreSQL ; parcours, géométrie d’interface, accessibilité automatisée et captures en CI. |

Les versions exactes reproductibles sont celles du fichier de verrouillage du commit livré.

## 2. Compétences déjà disponibles et nécessaires

Les cinq compétences de design restent le fil de travail : `get-context`, `frontend-app-builder`, `design-system`, `responsive-accessibility`, `visual-qa-testing`.

| Compétence technique disponible | Utilité concrète dans Fadi |
|---|---|
| `architecture-and-design-patterns` | Partager la même carte entre les deux accueils ; séparer navigation, état du dossier, lectures et règles d’action. |
| `frontend-development` | Intégrer React, les liens natifs, le sous-menu de projets, les dialogues, le clavier et les layouts responsive. |
| `backend-and-apis` | Fournir une lecture indépendante de la revue et des historiques à accès contrôlé. |
| `sql-and-databases` | Vérifier les requêtes d’historique, leur portée, leur limite et leur coût ; aucune nouvelle base ni migration n’est nécessaire pour ces accueils. |
| `testing` | Couvrir les droits inconnus, les écritures non confirmées, les conflits, la reprise non séquentielle et les parcours réels. |
| `code-review-and-refactor` | Relire les erreurs de cache, la provenance des informations, les destinations et les régressions de navigation. |
| `git-and-version-control` | Conserver les références, isoler les changements, créer les commits et suivre les contrôles du dépôt. |
| `devops-and-deployment` | Comprendre les portes de CI et le build de production. Le déploiement public est une opération distincte de cette implémentation. |

Cette liste décrit les capacités pertinentes du catalogue disponible. Elle ne signifie pas qu’un nouveau plugin ou chaque compétence de ce tableau a été installé ou invoqué pendant cette session.

## 3. Compléments spécialisés trouvés dans les sources officielles

| Complément | Source | Usage recommandé et limite |
|---|---|---|
| `react-router` | [React Router — compétence officielle](https://github.com/remix-run/react-router/blob/main/.agents/skills/react-router/SKILL.md) | Complément le plus directement adapté : sélectionner les instructions du mode déclaratif utilisé par Fadi. Éviter d’introduire les conventions du mode framework dans cette application Vite. |
| `vercel-react-best-practices` | [Vercel — React Best Practices](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md) | Utile pour les rendus, chargements et performances React. Appliquer seulement les recommandations compatibles avec React/Vite ; les parties Next.js ne constituent pas des exigences de Fadi. |
| `supabase-postgres-best-practices` | [Supabase — Postgres Best Practices](https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/SKILL.md) | Complément conditionnel pour les requêtes et évolutions de données. Les principes PostgreSQL sont utilisables sans déplacer Fadi vers un hébergement Supabase. |

Ces compléments ont été identifiés ; aucune installation globale supplémentaire n’est nécessaire pour terminer les changements présents. Les compétences disponibles et l’outillage existant couvrent l’implémentation demandée.

## 4. Documentation à utiliser pour les contrats sensibles

- [TanStack Query : modes réseau](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode) — distinguer une requête en attente du réseau, une lecture en cours et son résultat.
- [Dexie : bonnes pratiques](https://dexie.org/docs/Tutorial/Best-Practices) — propagation et traitement des échecs de stockage ; ne pas transformer une promesse rejetée en succès apparent.
- [React Router](https://reactrouter.com/start/declarative/installation) — navigation dans le mode déclaratif existant.
- [Playwright : assertions](https://playwright.dev/docs/test-assertions) — vérifier les interactions et destinations dans le navigateur, au-delà d’une inspection du code.

La documentation officielle complète les compétences ; elle ne remplace pas les contrats et tests déjà présents dans le dépôt.

## 5. Décisions techniques prises

1. Une seule vue d’ensemble est utilisée par les deux accueils ; ses données et actions portent le même identifiant de dossier.
2. La dernière consultation, l’étape connue et l’espace explicitement visité sont des préférences de navigation par utilisateur et par dossier. Elles ne sont pas déduites de la date de modification du projet.
3. L’action principale est une décision pure testable, indépendante du rendu et des mutations. Elle ne termine aucune étape lors d’une navigation.
4. Les états de progression, de revue, de sauvegarde locale, d’envoi et de lecture des ressources restent indépendants. Un compteur inconnu n’est pas converti en zéro.
5. Les historiques utilisent les enregistrements et événements existants. Leur couverture partielle est annoncée ; une commande de modèle acceptée ne prouve pas la synchronisation complète d’un dossier.
6. Les scénarios de démonstration restent dans le HTML et les fixtures de tests. Les écrans de l’application utilisent les projets, droits et réponses des services réels.

Les résultats effectivement obtenus et les limites de vérification sont consignés dans [Design Historique](<Design Historique.md>).
