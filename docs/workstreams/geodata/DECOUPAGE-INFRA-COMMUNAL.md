# Niveaux infra-communaux sur tout le territoire (D-GD-35) — préparation

État : **À définir → en préparation** (branche `claude/maroc-infra-communal-levels-5abxes`, partie de la PR #356 dont elle
dépend). L'implémentation reprend quand la CI de #356 est verte (consigne du maître d'ouvrage du 27 octobre 2026).

## Fait (vérifiable sur la branche)

- Fichier HCP « Population légale … RGPH 2024 » livré tel quel :
  `docs/geodata/sources/decoupage/originaux/hcp-rgph2024-population-legale.xlsx` (SHA-256
  `7e9d3d40…7dca`, identique à l'empreinte déjà consignée dans les fiches HCP).
- Table de données des niveaux `docs/geodata/sources/decoupage/ma-niveaux.csv` (code, rang, noms, libellés source,
  fiche de la couche) : aucun niveau dans le code.
- Script d'import `scripts/geodata/decoupage_hcp.py` : entités et parents lus dans le fichier (libellé, emboîtement des
  lignes), sortie `decoupage/hcp-rgph2024-entites.csv` + déclaration `decoupage/ma.json` ; relancé sans changement :
  0 ajoutée, 0 modifiée, 0 retirée (aucun doublon) ; rapport `INVENTAIRE-DECOUPAGE.md`.
- Inventaire obtenu : 12 régions, 75 provinces / préfectures, 1 503 communes, 8 préfectures d'arrondissements,
  41 arrondissements ; 6 communes à arrondissements (Tanger, Fès, Rabat, Salé, Casablanca, Marrakech) ; somme des
  enfants = population du parent pour les 101 entités qui ont des enfants ; 0 entité sans parent.
- Contrôle Casablanca conforme à la liste du maître d'ouvrage (8 préfectures d'arrondissements, 16 arrondissements).
- Contours : les arrondissements OSM (niveau 10) recouvrent exactement leur commune (écart ≤ 0,004 km² pour Fès, 0 ailleurs).

## Point à arbitrer par le maître d'ouvrage

Le fichier HCP range les préfectures d'arrondissements **sous la commune de Casablanca** (codes 6141010x0, commune
6141010) : arrondissement → préfecture d'arrondissements → commune de Casablanca → préfecture de Casablanca → région,
soit **5 clics** à Casablanca et non 4. L'implémentation suivra le fichier (règle « ne pas partir d'une liste écrite de
mémoire ») sauf décision contraire. Type des communes : le fichier ne publie pas le statut urbain / rural ; le type
retenu est « rattachée à un cercle » / « hors cercle » (21 communes hors cercle comptent une population rurale).

## Reste à faire (après #356 verte)

1. `construire_niveaux.py` : union de bas en haut suivant les liens parent (feuilles = arrondissements + communes),
   une seule simplification sur la topologie partagée ; couche « Préfectures d'arrondissements » (fiche créée par
   `decoupage_hcp.py --indicateurs`, valeurs RGPH 2024 du HCP).
2. Base : tables `geodata_niveaux_administratifs`, `geodata_entites_administratives` ; chargeur idempotent (upsert,
   rapport ajoutées / modifiées / sans parent) au démarrage ; rang du découpage sans borne fixe.
3. API : parenté par les liens en base (`/territoires`), niveau de chaque couche, découpage servi à l'interface.
4. Interface : sélection par clics suivant les niveaux réels du point ; catalogue « Limites administratives » généré
   depuis la table des niveaux ; navigation et fiche sans règle de codes.
5. Tests (Casablanca, Tanger, Rabat, commune ordinaire ; relance sans doublon ; absence de liste codée), docs, PR.
