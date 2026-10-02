# Module : Analyses métier

Responsabilité : quantités, contraintes, contrôles et comparaison des scénarios.

Traduit les compétences Programmiste et Dessin de bâtiment en fonctions traçables : chaque contrôle précise son
domaine d'application, sa source, sa version et son résultat ; l'absence de données produit un état « non
évalué » plutôt qu'une supposition. Une exigence réglementaire reste distincte d'une hypothèse ou d'une
recommandation (voir `docs/architecture.md`, « Business expertise as traceable functions »).

## Statut

`AnalysesModule.tsx` affiche ce que `GET /projects/:id/analyses` calcule à la lecture (voir `docs/migration/matrix.md`, section 4) :

- les contrôles traçables (`packages/domain-model/src/business-checks.ts`) : les dix règles de `analyse` et les quatorze transmissions de `audit` de flow-v62, le chiffrage de l'étape 14 et le dimensionnement structurel déclaré — chacun avec son domaine, sa source, sa version et son statut (`conforme`, `non-conforme`, `a-verifier`, `non-evalue`, `sans-objet`) ;
- les quantités dérivées du modèle courant (parcelle, emprise, dalles, zones par niveau, cibles liées), taguées de la révision du modèle et des empreintes ;
- les résultats calculés des étapes 14 / 17 / 19, le dossier de structure et les circulations déclarés (exemple P.118), les variantes de programme sommées depuis leurs fiches.

Reste : les contrôles réglementaires (accessibilité, incendie, structure calculée), qui exigent des règles sourcées et versionnées — aucune n'est inventée en attendant.
