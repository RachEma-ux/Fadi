# Module : Programmation

Responsabilité : besoins, effectifs, espaces, surfaces et relations fonctionnelles.

Enregistre les espaces programmés (le « programme ») séparément des locaux dessinés dans l'Atelier, puis les
relie — cette distinction permet de comparer les objectifs du programme avec le projet effectivement conçu
(voir `docs/architecture.md`, « Domain model »). Ne dessine rien : produit les exigences de surface, d'effectif
et de relation fonctionnelle que l'Atelier et les Analyses métier consomment.

## Statut

Porté depuis le prototype V8.19 (voir `docs/migration/matrix.md`, section 2) :

- `ProgrammeRepartition.tsx` : répartition programmatique par type de bâtiment (étapes 06 / 07 et onglet Programmation), bloc « Programme transmis à l'Atelier » / « Programme lié » (10), présentation protégée de l'exemple résolu (« Répartition renseignée et liée au modèle », fiches d'espaces, CSV, « Essayer une autre répartition en copie ») ;
- `ProgrammeCase.tsx` : le cas de programme appliqué depuis la bibliothèque des bâtiments (`modules/bibliotheque`) — répartition du dossier maître, lignes modifiables, décision à réexaminer, écarts, historique, plis des étapes ;
- `ProgrammeLinks.tsx` : « Programme ↔ modèle dessiné » (`?module=programmation&vue=modele`, liaison des lignes aux zones du modèle par identifiant) et « Registre des hypothèses » (`?vue=hypotheses`) ;
- `ProgrammeTransferFold.tsx` : transfert surfacique à total constant, monté dans le panneau Harmonie de l'étape 07.

Le programme (`programme_cases`, révisions) reste distinct des locaux dessinés (pièces du modèle typé de l'Atelier, `atelier_objects`) ; les liaisons relient les deux par identifiant et le bilan du bâtiment compare cibles et surfaces dessinées. Toutes les règles s'exécutent côté serveur (`apps/api/src/routes/programme.ts`, `lib/programme-case.ts`), à partir des fonctions pures de `packages/domain-model/src/building-library.ts`.
