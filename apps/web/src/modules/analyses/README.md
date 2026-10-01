# Module : Analyses métier

Responsabilité : quantités, contraintes, contrôles et comparaison des scénarios.

Traduit les compétences Programmiste et Dessin de bâtiment en fonctions traçables : chaque contrôle précise son
domaine d'application, sa source, sa version et son résultat ; l'absence de données produit un état « non
évalué » plutôt qu'une supposition. Une exigence réglementaire reste distincte d'une hypothèse ou d'une
recommandation (voir `docs/architecture.md`, « Business expertise as traceable functions »).

## Statut

Pas encore implémenté. Dépend des entités `Exigence`, `Hypothèse` et `Résultat calculé` du modèle de domaine
(`packages/domain-model`, en cours) et des objets architecturaux produits par l'Atelier.
