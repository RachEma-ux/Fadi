# Onglets et tableau de bord RGPH 2024 (D-GD-37)

29 octobre 2026 · spécification du maître d'ouvrage « Évolution GeoData : supprimer la barre blanche, étudier le
tableau de bord RGPH 2024, implémenter 5 onglets » · étape 2 (étude) validée « Ok continue ».

## Ce qui est livré

| Onglet | Adresse | Contenu |
|---|---|---|
| Cartes thématiques | `/geodata` | la carte (inchangée) ; elle reste montée sous les autres onglets |
| Chiffres clés 2024 | `/geodata/chiffres-cles` | 6 cartes de chiffres clés + 9 paires tableau / graphique, menu ⋮ (CSV, plein écran), tableaux triables |
| Tableaux RGPH 2024 | `/geodata/tableaux` | un tableau par thème ; colonnes Zone → Milieu → Sexe ; tri, filtre de zone, compteur, CSV |
| CEE 2024 | `/geodata/cee` | 3 tableaux : par secteur, par type, par classe d'emploi |
| Concepts et définitions | `/geodata/concepts` | sous-onglets Arabe / Français, textes lus en base, source citée |

- **Zone** : l'entité sélectionnée sur la carte (clics) ou le niveau courant de la barre territoriale ; sinon la zone
  nationale de la définition (Royaume du Maroc). Le filtre de zone (découpage territorial en base) la change ; le
  compteur donne le nombre de valeurs disponibles sur le nombre de cellules affichées.
- **Changer d'onglet** ne réinitialise rien : couches, sélection, indicateur actif, zoom (recette `geodata.mjs`).
- **Barre blanche** : seule la barre d'onglets et ☰ (à droite) restent ; sur téléphone, les onglets défilent.

## Interface ≠ base de données (D-GD-29)

| Élément | Où il vit |
|---|---|
| Valeurs de la zone | `geodata_valeurs` (fiche d'objet `GET /couches/:id/objets/:code`) |
| Zone nationale (code `MA`) | fiche `docs/geodata/sources/hcp-rgph2024-royaume.json` → version, couche ADM0, 1 objet |
| Concepts | `geodata_concepts` (annexe `donnees/hcp-rgph2024-concepts.json`, feuille « Définitions_des_Concepts » du HCP) |
| Définition des blocs | `geodata_tableaux_bord` (annexe `donnees/hcp-rgph2024-tableau-de-bord.json`, produite par `scripts/geodata/tableau_de_bord_hcp.py`) |
| Fichiers | archivés tels quels dans `geodata_fichiers` (import automatique) |

La définition des blocs n'est pas une donnée du HCP : c'est la mise en page (quelle famille d'indicateurs va dans quel
bloc, sommes et rapports déclarés). Elle ne contient **aucune valeur**. Le code de l'interface ne contient ni chiffre
ni libellé d'indicateur ; le test `geodata-sources.test.ts` vérifie que chaque famille désignée existe dans la fiche
nationale et rejoue les valeurs de contrôle.

API (lecture seule, version de référence publiée) : `GET /geodata/api/tableau-de-bord?pays=MA`,
`GET /geodata/api/tableau-de-bord/concepts?pays=MA&langue=fr|ar`.

## Valeurs de contrôle (Royaume du Maroc)

| Valeur | Attendu | Base |
|---|---|---|
| Population légale | 36 828 330 | 36 828 330 |
| Ménages | 9 275 038 | 9 275 038 |
| Taux d'urbanisation | 62,8 % | 62,8 % * (calculé : 23 110 108 ÷ 36 828 330 × 100) |
| Population municipale | 36 490 591 | 36 490 591 (urbain 22 921 202, rural 13 569 389) |
| Taux de chômage | 21,3 % | 21,3 % |

## Calculs déclarés (marqués « * calculé par GeoData »)

- Taux d'urbanisation = population légale urbaine ÷ population légale × 100 (le fichier HCP ne publie pas le taux).
- Grands groupes d'âges = somme des parts par âge quinquennal publiées (moins de 15 ans, 15–59, 60 et plus).
- Totaux nationaux de la CEE 2023/2024 = somme des 12 régions (effectifs seulement : établissements, emplois, souks) ;
  un total dont une région manque reste absent.

## Données manquantes (« Donnée non disponible »)

| Donnée | Motif | Pour la charger |
|---|---|---|
| Population et taux d'accroissement 1960–2014 | séries des recensements antérieurs non chargées | fiche qualifiée des RGPH 1960–2014 (HCP) |
| Taux d'urbanisation 1960–2014 | idem | idem |
| Taille moyenne des ménages 2004 et 2014 | idem | RGPH 2004 et 2014 (HCP) |
| Concepts et définitions en arabe | absents du fichier HCP chargé | publication arabe du HCP (fiche de source) |
| Emplois par secteur (CEE) | non publiés dans le fichier CEE chargé (total seulement) | résultats CEE détaillés (HCP) |
| Indicateurs nationaux du parc logement urbain et des modes de transport | fichiers communaux sans ligne nationale | aucun calcul inventé ; à charger si le HCP publie la ligne nationale |

## Mise à jour des données

```
python3 scripts/geodata/preparer_hcp_royaume.py --indicateurs <indicateurs.xlsx>   # https://www.hcp.ma/file/242671/
```

Le script lit la ligne « Ensemble du territoire national », recalcule les totaux CEE depuis la fiche des régions,
réécrit le contour (union des régions), les concepts et la définition des blocs, puis la fiche. Au déploiement,
l'import automatique prépare et publie la nouvelle version (empreinte nouvelle).

## Recette

- `apps/web/e2e/geodata.mjs` : jeu synthétique `synthetique-pays.fiche.json` (pays ZZ, valeurs fabriquées, un concept,
  une définition) ; contrôles « onglets : … » (adresses, zone = sélection, valeurs, calculé, CSV, plein écran, tri,
  Retour du navigateur, carte conservée) et interface anglaise.
- `packages/geodata-model/src/tableau-de-bord.test.ts` (validation, évaluation, tri, CSV, adresses) ;
  `apps/api/src/db/geodata-sources.test.ts` (fiche nationale, valeurs de contrôle, définition, concepts).
