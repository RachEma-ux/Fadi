# Temps réel — preuves de sécurité et modes d'échec de la CI

Réponse aux contrôles **ECC Tools** des PR du chantier (« Security Evidence », « CI failure-mode evidence ») et aux
revues Codex. Mis à jour : 2026-10-25 (UTC).

## Sécurité

### Dépendances (`npm audit --omit=dev --workspace apps/api`, 2026-10-25)

| Paquet | Avis | Portée | Traitement |
| --- | --- | --- | --- |
| `ws` 8.18.3 (canal temps réel) | GHSA-58qx-3vcg-4xpx (mémoire non initialisée divulguée), GHSA-96hv-2xvq-fx4p (épuisement mémoire par fragments) | ce chantier | **Corrigé** : `ws` **8.22.0** épinglé (PR #289) ; recettes et tests du canal relancés verts |
| `zod` < 4.6.6 | GHSA-mrhx-c7xc-m3w5 (mémoire sur collections bornées surdimensionnées) | commun à l'API | Signalé, hors périmètre (dépendance partagée) ; le canal borne déjà chaque message à 16 Kio **avant** l'analyse zod (`lireMessage`) et les sélections à 500 identifiants |
| `body-parser` 2.0–2.3 | GHSA-27r3-jxmh-p828 | Express (toute l'API) | Signalé, hors périmètre |
| `nodemailer` ≤ 10.1.3 | 17 avis | courriel (autre chantier) | Signalé, hors périmètre |

### Défenses du canal, chacune testée

- Montée de protocole : chemin exact, origine en liste blanche, session de compte valide — sinon 404 / 403 / 401 avant
  toute diffusion (`temps-reel-sessions.mjs`, TR-T17 partiel).
- Taille (16 Kio, `maxPayload`), débit (10 éphémères / s), file d'envoi (256 Kio), 20 connexions par compte,
  50 personnes par session (`temps-reel-hub.test.ts`, `temps-reel-charge.mjs`).
- Projection par destinataire : droit relu depuis moins de 3 s, sélection réduite au document épinglé, notes `equipe`
  jamais servies à un lecteur, liste des participants sous la même porte (revue Codex #288).
- Gestionnaire d'erreur sur chaque prise (sans lui, un message trop gros arrêtait le processus, essai RTC-0.3).
- Supervision sans identifiant ni contenu (motifs de fermeture constants, refus par code).
- Drapeau `FADI_TEMPS_REEL` absent : aucune route ni canal (répétition `temps-reel-retour-arriere.mjs`).

## Modes d'échec de la CI rencontrés (et corrigés)

| Symptôme | Cause | Correctif |
| --- | --- | --- |
| « Studio V1 » : 4 réponses 404 consignées par le navigateur | la liste des sessions répondait 404 sans le drapeau | 200 `{ actif: false }` pour cette seule lecture (PR #289) |
| `studio-navigation.mjs` : planche de 351 px < 360 px à 1280 × 720 | bandeau hors session permanent | entrée compacte « En direct » dans la barre (PR #289) |
| 409 au premier enregistrement d'une annotation | `jsonb` réordonne les clés ; comparaison `JSON.stringify` | comparaison canonique (`canonique`, testée) |
| Suivi et sélection refusés « pas-en-session » à l'entrée | messages envoyés avant l'état de la session | renvoyés à la réception de `etat` (revue Codex #289, testé) |
| Pointeur réapparu après sa sortie | valeur en attente du regroupeur envoyée après le masque | `Regroupeur.oublier()` (revue d'équipe, testé) |
| Recettes locales : serveur « fantôme » sur le port | PID d'un sous-shell, `pkill -f` qui tue son propre shell | lancement `nohup` direct, attente de la fin du PID (outillage local, hors dépôt) |

## Où lire un échec

- Tranche `p2` du job e2e : chaque recette temps réel a son étape nommée ; `e2e.log` et `api.log` sont joints.
- `node scripts/check-api-tests-db3.mjs` : les suites API sur base réelle restent refusées hors CI (règle DB-3).

## Revue d'équipe de RTC-3 à RTC-5 (RT-D7)

Trois relecteurs indépendants, en parallèle, sur les commits de chaque lot. Aucun P1. Constats retenus et corrigés :

| Lot | Constat | Correctif (preuve) |
| --- | --- | --- |
| RTC-3 | P2 — réponse perdue puis session passée à une autre révision ou close : faux 409 au rejeu | la révision d'ancrage du premier envoi est relue ; rejeu permis même session close (recette : 200 après R04 et après clôture) |
| RTC-3 | P3 — formulaire bloqué après un envoi partiel (vue ou sélection relues à chaque envoi) | contenu figé au premier envoi, champs en lecture seule, avis à l'écran |
| RTC-3 | P3 — caméra d'annotation réappliquée après reprise du suivi | oubliée quand le suivi reprend |
| RTC-3 | P3 — commentaire supprimé : objets cités encore exposés | `objectIds` vide si supprimé (recette) |
| RTC-3 | P3 — règle d'or : bascules Participants / Annotations et « Citer la sélection » sans icône ni raccourci | trois commandes enregistrées (Ctrl+Alt+Maj+K, L, S), test à 19 commandes |
| RTC-4 | P2 — « actualiser » réécrit la publication sous une revue ouverte | empreinte du manifeste figée à l'ouverture (`publication_manifest_hash`) ; revue signalée « publication changée », restée sur la révision examinée (recette) |
| RTC-4 | P3 — retrait concurrent entre contrôle et insertion | publication relue sous verrou partagé (`FOR SHARE`) |
| RTC-5 | P2 — pointeur fantôme après sortie (valeur en attente du regroupeur) | `Regroupeur.oublier()` (PR #289, test) |
| RTC-5 | P2 — lancer de rayon à chaque mouvement | une fois par image, rayon et plan réutilisés ; coordonnées bornées à 1 km |
| RTC-5 | P3 — étiquette affichée un instant en (0, 0) ; pointeur périmé gardé sans rendu | étiquette masquée jusqu'au premier placement ; relecture chaque seconde tant qu'il y a des pointeurs |
| RTC-5 | P3 — « trop de connexions » non compté ; test de supervision trop lâche ; recette de charge : borne de débit peu exigeante, reconnexion à 20 + 20 prises | compté ; assertion exacte ; borne de 10 / s par émetteur ; attente des fermetures avant la reconnexion |

Constats écartés, motivés : sphères recréées à chaque mise à jour (correct, coût faible, mémoire libérée par `vider`) ;
règle « remplacée » héritée des publications antérieures au lot E.4 (lignes sans `diffusion_status`, non concernées par une
revue au manifeste figé) ; titres de session par défaut non traduits (donnée, comme « Session — … »).
