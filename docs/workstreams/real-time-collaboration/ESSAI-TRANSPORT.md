# RTC-0.3 — Essai de transport (WebSocket sur Express 5, à travers Caddy)

Date : 2026-10-24 (UTC). Statut : **essai réalisé hors du dépôt** (scripts jetables dans l'espace de travail de la
session, non commités) ; aucun code applicatif de Fadi modifié. Il éclaire RT-D2 (transport WebSocket) ; il n'est ni
une implémentation ni une mesure de capacité.

## Montage

- Node 22.22.0 ; `express@5.1.0` (version du dépôt, `apps/api/package.json` : `~5.1.0`) ; `ws@8.18.3` installé avec
  `--ignore-scripts` (aucune dépendance native requise) ; `cookie@1.1.1`.
- Serveur : `createServer(app)` d'Express, `WebSocketServer({ noServer: true, maxPayload: 16 Kio })`, montée de protocole
  traitée dans `server.on("upgrade")` sur le seul chemin du canal.
- Contrôles à la montée : chemin exact, en-tête `Origin` égal à l'origine de l'application, cookie de session résolu ;
  sinon réponse HTTP 404 / 403 / 401 et socket détruit **avant** toute ouverture.
- Abonnement à un projet : refus sans détail (« indisponible ») si le compte n'y a pas accès ; relais d'un pointeur aux
  seuls abonnés autorisés ; débit limité à 10 messages / s par connexion ; battement ping / pong.
- Proxy : Caddy 2.10.2 avec la même forme que `deploy/preprod/proxy/Caddyfile.template` (préproduction) :
  `basic_auth`, en-têtes, `reverse_proxy`.

## Résultats

Serveur direct : **13 / 13** vérifications.

| Vérification | Résultat |
| --- | --- |
| Routes HTTP d'Express inchangées à côté du canal | ✓ |
| Origine étrangère / origine absente | ✓ refusées (403) |
| Cookie absent ou inconnu | ✓ refusés (401) |
| Autre chemin que celui du canal | ✓ refusé (404) |
| Deux comptes autorisés connectés ; projet non accessible refusé sans détail | ✓ |
| Pointeur relayé à l'autre participant | ✓ 0,7 ms en local (pas une mesure de réseau) |
| Débit : 50 pointeurs envoyés en rafale | ✓ 7 relayés (limite 10 / s) |
| Message de plus de 16 Kio | ✓ connexion fermée (1009), **serveur toujours en vie** |
| Révocation : `fermerPour(compte, projet)` | ✓ connexion fermée (code 4403) en ≈ 1 ms |
| Client sain conservé sur plusieurs battements ; client muet retiré | ✓ retiré en ≈ 330 ms (battement de 200 ms dans l'essai) |

À travers Caddy (forme préproduction) : **5 / 5**.

| Vérification | Résultat |
| --- | --- |
| HTTP avec `basic_auth` | ✓ |
| WebSocket sans `basic_auth` | ✓ refusé par Caddy (401) avant d'atteindre l'API |
| WebSocket avec `basic_auth`, origine et cookie | ✓ ouvert, aller-retour ≈ 1,5 ms en local |
| Origine étrangère derrière Caddy | ✓ refusée par l'API (403) |
| Cookie absent derrière Caddy | ✓ refusé par l'API (401) |

## Constats à reporter dans RTC-1

1. **Gestionnaire d'erreur obligatoire sur chaque connexion.** Première exécution : un message de plus de 16 Kio a levé
   une erreur `ws` non gérée qui a **arrêté tout le processus Node** (donc toute l'API). Avec
   `ws.on("error", () => ws.terminate())`, la connexion seule est fermée. Test de non-régression exigé (TR-T17).
2. **Nom du cookie.** La session est dans `__Host-fadi_sid` (production) ou `fadi_sid` (développement), avec l'ancien
   `fadi_session` encore lu (`apps/api/src/lib/auth.ts`). Le canal doit réutiliser la lecture du cookie de l'API
   (`resolveSession`), pas un nom codé en dur (le plan du 22 octobre citait encore `fadi_session`).
3. **Origine.** Le cookie est `SameSite=Lax`, mais l'origine reste à contrôler explicitement à la montée : la garde CSRF
   des requêtes HTTP ne s'applique pas à l'upgrade.
4. **Caddy** relaie l'upgrade sans configuration supplémentaire ; `basic_auth` de préproduction s'applique aussi au
   canal. Un navigateur réel renvoie-t-il les identifiants `basic_auth` mis en cache lors de la montée WebSocket ? Non
   vérifié ici (client Node) : à contrôler en préproduction, Chromium, Firefox, WebKit et Android (RTC-5).
5. **Battement** : un client qui ne lit plus est retiré en un à deux battements ; avec la cible de 10 s du plan, une
   présence périmée disparaît en 10 à 20 s, sous le seuil de 30 s.

## Bibliothèque retenue (proposition, sous réserve d'acceptation)

`ws` 8.x : sans dépendance native ni script d'installation, `noServer` compatible avec le serveur HTTP d'Express 5,
`maxPayload`, ping / pong et codes de fermeture applicatifs. Version exacte épinglée et lockfile commité en RTC-1.

## Non vérifié par cet essai

Navigateurs réels ; délai d'inactivité et vidange des connexions de Caddy lors d'un déploiement ; arrière-plan mobile ;
charge (10 × 10 participants, 60 min) ; plusieurs instances. Ces points restent à RTC-0.4 et RTC-5.
