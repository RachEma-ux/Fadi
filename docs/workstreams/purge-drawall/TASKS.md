# Purge DrawAll dans Fadi — Tâches

## À faire

- [ ] PURGE-02 — Inspecter les occurrences dans le code et les fichiers avec l'audit complet exécuté par GitHub Actions ; classer les résultats.
- [ ] PURGE-03 — Établir la matrice de suppression : artefacts exclusivement DrawAll / références historiques / dépendances logicielles / fonctionnalités Fadi à maintenir ou retirer.
- [ ] PURGE-04 — Faire confirmer la frontière entre purge documentaire et suppression fonctionnelle avant tout retrait de moteurs, API, ontologies ou migrations.
- [ ] PURGE-05 — Supprimer ou remplacer les artefacts DrawAll validés **uniquement dans le dépôt Fadi** et réparer les liens.
- [ ] PURGE-06 — Vérifier types, build, tests, E2E et état des projets persistés avant fusion et déploiement.

## En cours

- PURGE-01 — Inventaire initial des fichiers et des références ; brancher la vérification exhaustive GitHub.

## Terminé

- Issue #147 ouverte et branche spécifique créée dans `RachEma-ux/Fadi`.
- Inventaire de base : trois fichiers `docs/drawall/`, une proposition `docs/atelier-drawall.md`, environ 269 fiches Atelier `DA-*.md` présentes dans le dépôt (classification fonctionnelle en cours).

## Bloqué

- Suppression de code Fadi encore actif : impact fonctionnel et périmètre des fonctionnalités à retirer non arbitrés.

## Critères de sortie

- Aucun lien d'exécution ou référentiel actif de Fadi vers le produit DrawAll ; tous les fichiers suspects justifiés, supprimés ou explicitement maintenus comme éléments Fadi.
- Traçabilité des suppressions ; absence d'action sur le dépôt DrawAll.
- PR et CI vertes, acceptation de l'éventuelle suppression fonctionnelle, production inchangée jusqu'au déploiement autorisé.
