# Purge DrawAll dans Fadi — Tâches

## À faire

- [ ] PURGE-02 — Inspecter les occurrences dans le code et les fichiers avec l'audit complet exécuté par GitHub Actions ; classer les résultats.
- [ ] PURGE-03 — Établir la matrice **RETIRER les artefacts DrawAll / ADAPTER les cahiers Fadi / CONSERVER toutes les fonctions et règles de dessin / MIGRER les identifiants avec compatibilité**.
- [x] PURGE-04 — Décision prise : préserver toutes les fonctions industrielles et règles normatives de dessin ; seule leur intégration native Fadi est à réaliser.
- [ ] PURGE-05 — Terminer le nettoyage documentaire et fonctionnel validé ; **premier lot déjà effectué** : suppression de 4 fichiers explicitement interproduits et réécriture des liens entrants / commentaires concernés, uniquement dans Fadi.
- [ ] PURGE-06 — Vérifier types, build, tests, E2E et état des projets persistés avant fusion et déploiement.

## En cours

- PURGE-02 — Analyser les 494 fichiers signalés par le rapport GitHub, en distinguant les identifiants DA des couplages normatifs résiduels.

## Terminé

- Issue #147 ouverte et branche spécifique créée dans `RachEma-ux/Fadi`.
- PURGE-01 — Rapport d'audit automatique : 1 261 fichiers scannés, 494 touchés, 2 267 lignes détectées.
- Suppression sur branche de 4 fichiers clairement liés au produit distinct (`docs/drawall/` ×3 et `docs/atelier-drawall.md`) ; principaux liens supprimés ou redirigés.
- Nettoyage de cinq références nominales dans les sources de Fadi et ajout d'un contrôle CI refusant leur réintroduction explicite.
- Inventaire de base : trois fichiers `docs/drawall/`, une proposition `docs/atelier-drawall.md`, environ 269 fiches Atelier `DA-*.md` présentes dans le dépôt (classification fonctionnelle en cours).

## Bloqué

- Aucune suppression fonctionnelle autorisée ou nécessaire ; la migration des identifiants DA et les contrats normatifs Fadi exigent encore une analyse des usages et des tests.

## Décisions confirmées

- Toutes les fonctions industrielles et les règles normatives de dessin sont conservées comme capacités natives Fadi (décision du 17 octobre 2026).
- Aucun lien actif à DrawAll, aucune modification du dépôt DrawAll.

## Critères de sortie

- Aucun lien d'exécution ou référentiel actif de Fadi vers le produit DrawAll ; tous les fichiers suspects justifiés, supprimés ou explicitement maintenus comme éléments Fadi.
- Traçabilité des suppressions ; absence d'action sur le dépôt DrawAll.
- PR et CI vertes, acceptation de l'éventuelle suppression fonctionnelle, production inchangée jusqu'au déploiement autorisé.

## Actualisation M06/M08 — Mission 003

La fusion du premier lot #148 est vérifiée, mais PURGE-02/03 et la qualification complète restent ouvertes dans #147. Le titre Atelier opérationnel et les checkpoints sont réconciliés ; aucun code DA, norme ou fonction industrielle supprimé. Lire le dernier STATUS/HANDOFF avant les observations historiques.
