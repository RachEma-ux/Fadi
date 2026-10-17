# Inventaire contrôlé — Contamination DrawAll dans Fadi

Date de l'audit : 17 octobre 2026. Cible : **`RachEma-ux/Fadi` uniquement**.

Le rapport exhaustif est produit par `.github/workflows/audit-drawall.yml`, artefact `fadi-drawall-inventory`. Il recense des occurrences textuelles de `DrawAll` et des identifiants `DA-NN-NN` : un résultat de recherche n'est **pas** une preuve qu'un fichier entier appartient à une autre application.

## Résultat GitHub Actions confirmé

| Catégorie | Fichiers trouvés | Lignes détectées | Traitement |
|---|---:|---:|---|
| A. Documents autonomes propres à DrawAll | 3 | 355 | **Retirer du dépôt Fadi** après cartographie des liens ; source historique consultable via historique Git |
| B. Contrat interproduits `docs/atelier-drawall.md` | 1 | 17 | **Adapter/archiver ou retirer**, après vérification des cahiers et de leurs consommateurs |
| C. Fiches `DA-*.md` dans Atelier Fadi | 269 | 853 | **Arbitrer au cas par cas** ; plusieurs documentent des fonctions Fadi réelles |
| D. Autre documentation Fadi | 37 | 565 | **Nettoyer les dépendances normatives** ; conserver les faits historiques vérifiables |
| E. Code actif Fadi | 180 | 457 | **Ne pas supprimer par mot-clé** ; distinguer simples commentaires et identifiants exploités par la logique |
| F. Autres métadonnées | 4 | 20 | Nettoyage limité aux références inutiles |

Total : **1261 fichiers texte inspectés, 494 fichiers avec occurrences, 2267 lignes détectées** ; aucun fichier texte n'a été omis pour taille dans le rapport. Les binaires et formats hors liste d'extensions ne sont pas inspectés par ce scanner et doivent être examinés séparément avant de prétendre à une purge exhaustive.

## Références du produit distinct (catégorie A)

- `docs/drawall/DrawAll_v4.1_Architecture.md`
- `docs/drawall/DrawAll_v4.1_Concept.md`
- `docs/drawall/DrawAll_v4.1_Exigences_Sources.md`

Ces trois documents décrivent **explicitement l'application DrawAll** et ne sont pas des spécifications officielles Fadi. Leur retrait du dépôt Fadi est justifié indépendamment de la décision sur les fonctionnalités Fadi.

## Couplages fonctionnels nécessitant un arbitrage

- `docs/atelier-cahier-p2.md` : cahier de l'Atelier au-delà de la seule architecture, avec ontologies mécanique, structure, tôlerie, bois, MEP et formes libres, déclarées livrées selon diverses décisions. Ce document porte des décisions Fadi et un emprunt explicite au référentiel DrawAll.
- `packages/atelier-model/src/ontologies/{mechanical,sheetmetal,mep,timber,structure}/` : composants métier présents dans le code Fadi. **Une fonction mécanique ne doit pas être présumée propre à DrawAll uniquement à cause de son domaine**.
- `apps/api/src/routes/atelier-{mecanique,bois-tolerie,reseaux,structure}.test.ts` (et routes connexes), `apps/web/src/modules/atelier/nouveau/panneaux/{Mecanique,Tolerie,Reseaux,Bois,Structure}.tsx` : consommateurs possibles.
- `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/atelier-model/src/modele.ts` : grand nombre d'identifiants `DA-..`, probablement utilisés en inventaire/catalogue de capacités ; il faut savoir lesquels sont persistés ou requis par les tests avant remplacement.
- `docs/atelier/decisions.md` : journal historique comportant des décisions déjà prises pour Fadi ; **ne pas effacer ni renuméroter ce journal aveuglément**.

## Suppression sûre déjà réalisée dans la branche

Des références nominales et commentaires ont été adaptés dans :
- `apps/api/scripts/generate-step-sheets.mjs`
- `apps/api/src/db/init.sql`
- `apps/api/src/db/schema.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/modules/atelier/README.md`

Ces modifications ne doivent pas affecter le comportement exécuté. Vérifier toutefois le générateur de fiches dans les tests du dépôt.

## Limites d'interprétation

**Décision prise le 17 octobre 2026 : les fonctionnalités industrielles et les règles normatives de dessin doivent toutes être conservées comme capacités natives Fadi.** Purger les artefacts externes, corriger les cahiers et enlever les dépendances DrawAll, sans retirer les outils, les modèles persistés ni les règles techniques. Préserver l'identification légitime des normes officielles et les licences ; toute migration de code ou d'identifiants nécessite compatibilité et tests.

**Le dépôt DrawAll n'est jamais une destination de modification dans cette opération.** GitHub `main` et Fadi-Serv sont préservés tant que la PR de nettoyage n'est pas testée, revue et fusionnée.
