# Niveaux infra-communaux sur tout le territoire (D-GD-35)

État : **Implémenté**, en revue (branche `claude/maroc-infra-communal-levels-5abxes`, PR vers `main`, après #356).
Demande du maître d'ouvrage du 27 octobre 2026 : arrondissements et préfectures d'arrondissements dans la hiérarchie,
pour tout le Maroc, **tout venant de la base de données** ; import HCP **unique**, sur le serveur VPS.

## Principe

- Les niveaux, les entités et leurs liens de parenté sont **en base** ; aucun pays, niveau, nombre de niveaux, ville,
  arrondissement ni préfecture d'arrondissements n'est écrit dans le code (contrôlé par un test qui parcourt le code
  GeoData : `packages/geodata-model/src/decoupage.test.ts`, « aucune liste de territoires ni de niveaux »).
- La hiérarchie se lit par le lien parent → enfant ; sa profondeur varie selon l'endroit.
- Un changement de découpage est une **mise à jour des données** (nouveau fichier HCP → script → import), jamais du code.
- Interface ≠ base de données (D-GD-29) : l'interface lit niveaux, liens et rangs par l'API.

## Modèle de données (`apps/api/src/db/init.sql`)

| Table | Contenu |
| --- | --- |
| `geodata_niveaux_administratifs` | `pays`, `code` (identifiant du niveau), `rang` (1 = le plus global, sans borne), `singulier`, `pluriel`, `fiche_cle` (fiche de la couche du niveau) ; unique par (pays, rang) |
| `geodata_entites_administratives` | `pays`, `code` (code géographique HCP), `niveau`, `parent_code`, `nom`, `nom_ar`, `type`, `source`, `periode` (date du découpage), `cree_le`, `mis_a_jour_le`, `retire_le` (une entité absente d'un nouveau fichier est marquée retirée, jamais effacée) |
| `geodata_decoupage_imports` | journal des imports : pays, fichier, empreinte (unique par pays : un même fichier n'est importé qu'une fois), source, bilan |
| `geodata_territoires` | contours des unités publiées (inchangée), `rang` désormais sans borne fixe ; `parent_code` recopié des liens en base (règle « decoupage ») |

Niveaux du Maroc, du plus global au plus fin (table de données `docs/geodata/sources/decoupage/ma-niveaux.csv`) :
région (1), province ou préfecture (2), commune (3), préfecture d'arrondissements (4), arrondissement (5). Ajouter un
niveau = ajouter une ligne (rang, noms, libellés du fichier source, fiche, contours) : aucune modification du code.

## Script d'import (`scripts/geodata/decoupage_hcp.py`)

```
python3 scripts/geodata/decoupage_hcp.py --excel <population-legale.xlsx> [--indicateurs <indicateurs.xlsx>]
```

- Source : « Population légale du Royaume du Maroc … selon les résultats du RGPH 2024 » (HCP,
  https://www.hcp.ma/file/242341/, CC BY 4.0), livré tel quel : `decoupage/originaux/hcp-rgph2024-population-legale.xlsx`
  (SHA-256 `7e9d3d40…7dca`), archivé en base avec les autres fichiers (`geodata_fichiers`, rôle `decoupage`).
- Entités : une ligne est une entité d'un niveau si son libellé commence par un libellé source de ce niveau (le plus long
  gagne : « Préfecture d'arrondissements de … » n'est pas une préfecture) ; parent = dernière entité d'un rang plus
  global qui la précède (le fichier est rangé par emboîtement). Cercles, « dont le centre urbain », lignes par milieu et
  totaux ne sont pas des entités (comptés dans le rapport).
- Type : libellé source (Région, Province, Préfecture, Préfecture d'arrondissement(s), Arrondissement) ; communes :
  « rattachée à un cercle » / « hors cercle » — le fichier ne publie pas le statut urbain / rural, qui n'est donc pas
  déduit (non évalué).
- Sorties : `decoupage/hcp-rgph2024-entites.csv`, déclaration `decoupage/ma.json` (empreintes), rapport
  [`INVENTAIRE-DECOUPAGE.md`](INVENTAIRE-DECOUPAGE.md) (comptes par niveau, profondeurs, communes à arrondissements et
  leurs subdivisions, contrôles de population, différences avec la livraison précédente : ajoutées, modifiées, retirées,
  sans parent). Relancé sur le même fichier : mêmes octets, aucune différence.
- `--indicateurs` : crée la fiche et le tableau de valeurs d'un niveau qui n'en a pas (ici les préfectures
  d'arrondissements : indicateurs RGPH 2024 du HCP à ce niveau ; les valeurs non publiées restent vides, jamais zéro).

## Import en base : opération unique sur le serveur

```
node apps/api/dist/geodata-reference.js --decoupage [MA]        # image de production, une fois
npm run geodata:import-decoupage --workspace=@fadi/api         # développement
```

- Lancé **une fois** par l'exploitant ; **jamais au démarrage de l'API** (l'import automatique des couches, D-GD-23,
  n'y touche pas). Relancé sur le même fichier : « déjà importé », rien n'est fait. Nouveau fichier : mise à jour par code
  (aucun doublon), bilan affiché et consigné dans `geodata_decoupage_imports`. Transaction : en cas d'erreur (niveau
  inconnu, parent absent, parent d'un rang qui n'est pas plus global), la base reste dans son état précédent.
- Ensuite, les unités des couches déjà publiées sont (re)chargées dans `geodata_territoires` avec leurs parents. Avant
  l'import, une couche HCP publiée l'est normalement ; ses unités attendent l'import (avis, pas d'échec).

## Contours (`scripts/geodata/construire_niveaux.py`)

Union **de bas en haut** en suivant les liens en base : entités élémentaires (sans enfant) = arrondissements (contours
OpenStreetMap de niveau 10) et communes sans arrondissement (contours OSM des communes) ; une seule simplification sur la
topologie partagée (mapshaper) ; chaque niveau = union de la descendance (une commune à arrondissements est l'union de
ses arrondissements). Aucun niveau dans le script : colonnes `contours` et `correspondance` de la table des niveaux.
Rapport [`CONTOURS-NIVEAUX.md`](CONTOURS-NIVEAUX.md) : 0 chevauchement à tous les niveaux, frontières de chaque niveau
incluses dans les limites élémentaires (0 m), 16 communes HCP sans contour OSM signalées (lacunes, jamais comblées).

## Indicateurs

Reliés aux entités par le code HCP, au niveau le plus fin publié : arrondissements (41), préfectures d'arrondissements
(8, couche nouvelle), communes, provinces, régions. Pour chaque commune à arrondissements, la somme des populations des
arrondissements est égale à celle de la commune (contrôle du script et test).

## Interface (lit uniquement la base)

- Sélection par clics (D-GD-34 étendue) : carte vierge → 1ᵉʳ clic sur l'unité la plus fine en base à cet endroit, chaque
  clic suivant remonte d'un parent : **5 clics à Casablanca** (arrondissement, préfecture d'arrondissements, commune,
  préfecture, région), 4 dans les autres communes à arrondissements, 3 ailleurs. Couches chargées : seuls leurs niveaux.
- Catalogue › Limites administratives : couches rangées dans l'ordre de la table des niveaux, nom du niveau affiché ;
  un niveau sans couche publiée le dit.
- Barre territoriale : la liste qui suit une unité est celle de ses enfants, nommée par leur niveau réel.
- Fiche : « Voir ses … » et subdivisions lues des liens en base (préfectures d'arrondissements de Casablanca,
  arrondissements de Tanger…).

## Point à arbitrer par le maître d'ouvrage

Le fichier HCP range les préfectures d'arrondissements **sous la commune de Casablanca** (codes 6141010x0 sous 6141010) :
la hiérarchie livrée est donc arrondissement → préfecture d'arrondissements → commune de Casablanca → préfecture de
Casablanca → région, soit **5 clics** et non 4 comme dans la demande. Elle suit le fichier (règle « ne pas partir d'une
liste écrite de mémoire ») ; pour retirer la commune de cette chaîne, il faudrait une décision (et une table des
parents corrigée en données), pas une modification du code de l'interface.

## Contrôles

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| Aucune liste de villes, d'arrondissements ou de niveaux dans le code | conforme | test « aucune liste de territoires ni de niveaux » |
| Inventaire = fichier HCP | 6 communes à arrondissements, 41 arrondissements, 8 préfectures d'arrondissements | `INVENTAIRE-DECOUPAGE.md`, `decoupage.test.ts` |
| Somme des arrondissements = commune | 6 / 6 (et 101 / 101 parents) | idem |
| Trous, chevauchements, bordures | 0 chevauchement, 0 m de frontière hors des limites élémentaires, lacunes = communes sans contour | `CONTOURS-NIVEAUX.md` |
| Clics : Casablanca, Tanger, Rabat, Marrakech, commune ordinaire | 5, 4, 4, 4, 3 | `decoupage.test.ts`, API sur base locale |
| Totaux | 12 régions, 75 provinces / préfectures | idem |
| Relance de l'import sans doublon | « déjà importé » ; nouveau fichier mis à jour par code | `geodata.test.ts` (DB-3), recette e2e |
