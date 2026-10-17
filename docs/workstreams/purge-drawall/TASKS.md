# Purge DrawAll dans Fadi — Tâches

## À faire

- [ ] PURGE-02 — Inspecter les occurrences dans le code et les fichiers avec l'audit complet exécuté par GitHub Actions ; classer les résultats.
- [ ] PURGE-03 — Établir la matrice de suppression : artefacts exclusivement DrawAll / références historiques / dépendances logicielles / fonctionnalités Fadi à maintenir ou retirer.
- [ ] PURGE-04 — Faire confirmer la frontière entre purge documentaire et suppression fonctionnelle avant tout retrait de moteurs, API, ontologies ou migrations.
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

- Suppression de code Fadi encore actif : impact fonctionnel et périmètre des fonctionnalités à retirer non arbitrés.

## Critères de sortie

- Aucun lien d'exécution ou référentiel actif de Fadi vers le produit DrawAll ; tous les fichiers suspects justifiés, supprimés ou explicitement maintenus comme éléments Fadi.
- Traçabilité des suppressions ; absence d'action sur le dépôt DrawAll.
- PR et CI vertes, acceptation de l'éventuelle suppression fonctionnelle, production inchangée jusqu'au déploiement autorisé.
