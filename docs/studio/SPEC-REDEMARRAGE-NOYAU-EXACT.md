# Redémarrage du worker exact après erreur — spécification

- **Identifiant** : `studio-spec-redemarrage-noyau-exact/1` (D.2-04).
- **Version** : 1, 26 octobre 2026.
- **Exigences couvertes** : EX-061 (« un mécanisme de recréation du worker spécialisé doit être spécifié et testé ; les
  requêtes pending ne restent pas bloquées indéfiniment »), AC-006, TEST-015, IF-007 (statuts `failed` et `timed_out`).
- **Origine** : Issue #173, correction C06 de la qualification COEX-01 (`docs/ai-team/reports/claude-m13-coex/COEX-01-QUALIFICATION.md`,
  OBS-07 : « après une erreur, le worker n'est jamais recréé dans la session, et aucune demande n'a de délai d'attente »),
  autorisée le 18 octobre 2026 ; reprise ici en document versionné. Aucune règle nouvelle : ce document écrit ce que le code
  fait déjà et le relie à ses tests. Le contrôle `apps/web/src/modules/studio/exact/specification-redemarrage.test.ts` relit ce
  fichier : chaque test cité doit exister avec son libellé exact, chaque constante citée doit avoir la valeur du code.

Trois noyaux exacts existent ; ils partagent le même binaire OCCT (`occt-wasm`, `@parcours/geometry-exact`) mais pas la
même politique de reprise, parce qu'ils n'ont pas le même utilisateur :

| Noyau | Composant | Politique |
|---|---|---|
| Studio (navigateur) | `apps/web/src/modules/studio/exact/client-exact.ts` (`NoyauExactStudio`), Worker `noyau-exact.worker.ts`, ordonnanceur `noyau-studio.ts` | Relance **explicite** seulement (bouton « Relancer le noyau exact ») |
| Atelier (navigateur) | `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, Worker `exact.worker.ts` | Recréation **à la demande suivante**, bornée à `ECHECS_MAX` échecs consécutifs |
| Serveur | `apps/api/src/lib/atelier-exact.ts` (`moteurExact`) | Chargement en échec oublié : le suivant recharge ; un calcul en erreur n'arrête pas le noyau |

## S1 — Ce qui est une panne

Est une **panne** du Worker : son événement `error` (interruption, plantage du WebAssembly), son événement `messageerror`
(réponse illisible), et une demande restée sans réponse au-delà de son délai. N'est **pas** une panne : une erreur de calcul
renvoyée par le Worker (opération refusée par OCCT, intersection vide) ; elle rejette seulement sa demande, le Worker reste
en service.

- Constante : `DELAI_OPERATION_EXACT_MS` = 120000 (`apps/web/src/modules/studio/exact/client-exact.ts`) — borne de sûreté, pas une mesure.
- Constante : `DELAI_CHARGEMENT_EXACT_MS` = 300000 (`apps/web/src/modules/studio/exact/client-exact.ts`) — premier chargement (téléchargement et compilation du `.wasm`).
- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « réponse illisible (messageerror) et délai dépassé : même issue, aucune attente laissée en suspens »
- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « une erreur de calcul (opération refusée par le noyau) n'est pas une panne : le Worker reste prêt »
- Test : `apps/web/src/modules/studio/exact/booleen-session.test.ts` — « erreur de calcul (intersection vide refusée par le noyau) : échec sans relance, document identique »

## S2 — À la panne : arrêter, rejeter tout, ne rien écrire

À la panne, le Worker défaillant est **arrêté** (`terminate`), **toutes** ses demandes en cours sont rejetées
(`ErreurTache` `plantage` ou `delai`) — aucune attente ne reste en suspens —, le noyau passe à l'état `echec` avec un
message intelligible, et le document n'est pas touché : seul un résultat rendu peut, plus tard, être engagé par une commande
explicite. Un Worker arrêté ne résout ni ne rejette plus rien (chaque écouteur vérifie qu'il est toujours le Worker courant).

- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « le Worker s'interrompt pendant deux calculs : les deux attentes sont rejetées (plantage), le Worker est arrêté, le noyau passe en échec »
- Test : `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts` — « plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée »
- Test : `apps/web/e2e/studio-exact.mjs` — « TEST-015 : coupure du Worker — erreur affichée, noyau en échec, Worker arrêté, aucune attente en suspens »
- Test : `apps/web/e2e/studio-exact.mjs` — « TEST-015 : pas de corruption — document identique (empreinte de contenu), aucune commande en attente »

## S3 — Studio : redémarrage explicite, jamais silencieux

Après une panne, la demande suivante est **refusée** (`indisponible`,
« Noyau exact en échec : relancez-le avant un nouveau calcul. ») ; aucun Worker n'est recréé en silence. Le redémarrage se fait par `relancer()` — bouton « Relancer le noyau
exact » —, qui crée **un** nouveau Worker et recharge le noyau ; l'ordonnanceur des tâches exactes n'a aucune reprise
automatique (`reprisesMax: 0`, un emplacement). Un chargement en échec (binaire introuvable) suit la même règle. Une
libération volontaire (moteur inactif, annulation d'un calcul synchrone) arrête le Worker **sans** panne comptée : il est
recréé à la demande suivante.

- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « aucune relance silencieuse : la demande suivante est refusée (indisponible) ; relancer crée un nouveau Worker qui calcule »
- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « chargement en échec (binaire introuvable) : échec annoncé, Worker arrêté, relance explicite seulement »
- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « annulation d'un calcul en cours : rejet « annulee », Worker arrêté (calcul synchrone), rechargé ensuite sans panne »
- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « libération (moteur inactif) : le Worker est arrêté, recréé à la demande suivante sans panne comptée »
- Test : `apps/web/src/modules/studio/exact/booleen-session.test.ts` — « panne pendant le calcul : attente résolue (failed), erreur annoncée, document identique, relance explicite puis calcul abouti »
- Test : `apps/web/e2e/studio-exact.mjs` — « TEST-015 : aucune relance silencieuse — le calcul suivant est refusé (relancez), aucun nouveau Worker, attente résolue »
- Test : `apps/web/e2e/studio-exact.mjs` — « TEST-015 : relance contrôlée — nouveau Worker, calcul de nouveau abouti »
- Test : `apps/web/e2e/studio-exact.mjs` — « TEST-015 : relance après retour au binaire distribué — prêt, une instance »

## S4 — Relance sans doublon

Un redémarrage ne rejoue rien : les demandes rejetées le restent, la relance produit **un** seul Worker vivant et **une**
seule instance du noyau ; un résultat calculé pour une révision dépassée pendant la panne revient « périmé » et n'est
jamais engagé (D.2-03, TEST-014).

- Test : `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts` — « plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée »
- Test : `apps/web/src/modules/studio/exact/booleen-session.test.ts` — « le brouillon change pendant le calcul : le résultat revient marqué périmé et n'est jamais engagé dans le modèle courant »
- Test : `apps/web/src/modules/studio/exact/client-exact.test.ts` — « deux chargements simultanés partagent le même chargement (jamais deux noyaux) »

## S5 — Atelier : recréation à la demande suivante, bornée

Le client de l'Atelier (outil « Solide exact ») suit S1 et S2 ; après une panne, la demande **suivante** crée un nouveau
Worker. Après `ECHECS_MAX` échecs consécutifs sans aucune réponse réussie, le noyau reste indisponible pour la session
(rechargement de la page), pour ne pas relancer sans fin un binaire défaillant ; une réponse réussie remet le compteur à
zéro.

- Constante : `ECHECS_MAX` = 3 (`apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`)
- Constante : `DELAI_OPERATION_MS` = 120000 (`apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`)
- Constante : `DELAI_CHARGEMENT_MS` = 300000 (`apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`)
- Test : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.test.ts` — « erreur fatale : les demandes en cours sont rejetées, la suivante crée un nouveau Worker et réussit »
- Test : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.test.ts` — « demande sans réponse : rejet au délai, Worker arrêté puis recréé ; la réponse tardive de l'ancien est ignorée »
- Test : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.test.ts` — « une réponse réussie remet le compteur d'échecs à zéro »

## S6 — Serveur : chargement oublié en échec, panne mesurée

Le serveur charge OCCT dans son processus à la première opération exacte, jamais au démarrage. Un chargement en échec
n'est pas retenu : le suivant recharge. Une opération en erreur rejette seulement la commande (400, `exact-echec` ou
`invalide`) ; aucun résultat approché n'est écrit (R9). Chaque chargement et chaque opération sont mesurés par la
surveillance d'exploitation (R.5-03) ; un chargement en échec passe la règle `noyau.chargement-echec` en alerte.

- Test : `apps/api/src/testing/studio-surveillance.test.ts` — « noyau exact du serveur branché : un chargement d'OCCT en échec est compté et passe la règle « noyau.chargement-echec » en alerte ; une opération refusée est comptée »

## Limites

- La coupure de la recette navigateur est provoquée par l'accroche de diagnostic (`__fadiExact.interrompre`), qui suit le
  même chemin que l'événement `error` ; un plantage réel du WebAssembly sur appareil physique n'est pas joué (DEC-13).
- Aucun délai n'est une mesure de performance : ce sont des bornes de sûreté choisies par Fadi (DEC-13 n'en fixe aucun).
