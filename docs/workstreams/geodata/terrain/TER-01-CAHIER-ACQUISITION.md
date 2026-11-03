# TER-01 — Cahier des charges d'acquisition (document à compléter)

Date : 2 novembre 2026. Issue : https://github.com/RachEma-ux/Fadi/issues/381. Plan : [`PLAN.md`](PLAN.md), § TER-01.

**Statut : modèle à compléter par le maître d'ouvrage et son géomètre.** Aucun fournisseur n'a été contacté, aucune
offre demandée, aucun achat engagé. Les noms de fournisseurs viennent du registre de sources du plan ; ils ne valent ni
recommandation ni contrat. Les précisions publiées par un fournisseur sont des affirmations à vérifier, jamais des mesures
acceptées. Toute case vide reste « à compléter » ; rien n'est rempli par supposition.

## 1. Maître d'ouvrage et objet

| Champ | Valeur |
| --- | --- |
| Maître d'ouvrage | à compléter |
| Ingénieur géomètre-topographe habilité au Maroc (réviseur) | à compléter |
| Usage prévu (TER-D1) | à compléter : visualisation exploratoire / appui à la conception |
| Référence de situation | Vue Benslimane centrée sur 33.5315 N, 7.10621 W — **n'est pas une limite** |
| Polygone de la zone d'étude (AOI) et tampon | à joindre (fichier, repère, superficie calculée en repère métrique) — la parcelle P.118 n'est pas substituée sans confirmation |
| Sous-zone optionnelle à 5 cm | à joindre (polygone, usage démontré) |

## 2. Étape préalable : archives ANCFCC

| Question à l'ANCFCC | Réponse |
| --- | --- |
| Modèles numériques de terrain disponibles sur l'AOI exacte (produit, date, méthode, pas de grille) | à compléter |
| Repère horizontal, datum vertical, unités, repères de nivellement | à compléter |
| Précision documentée et méthode de contrôle | à compléter |
| Droits : stockage, traitement, affichage web, publication de cartes dérivées, export, attribution | à compléter |
| Coût et délai | à compléter |

## 3. Prestations demandées (une spécification identique pour chaque soumissionnaire)

Candidats cités par le plan : SEPRET (laser aéroporté), GEOMAITRISE (levés par drone). Préférer le LiDAR pour le sol sous
végétation en contrôlant les retours sol réels ; photogrammétrie seulement sur surfaces visibles et texturées ; observations
au sol complémentaires là où bâti, eau, végétation ou pente empêchent une reconstruction fiable du sol.

1. Couverture de l'AOI et du tampon ; date de levé ; méthode d'acquisition.
2. MNT terrain nu à 0,25 m ; option chiffrée séparément à 0,05 m sur la sous-zone.
3. MNS distinct ; nuage de points classé LAS ou LAZ ; densité de points sol et cartes de lacunes ; lignes de rupture si
   pertinent ; rasters d'altitude GeoTIFF.
4. Repère horizontal, datum vertical, unités, repères de nivellement et détail des transformations (fichiers de grille,
   précision de transformation). Candidats **à confirmer par le géomètre**, jamais imposés par Fadi : Merchich / Lambert
   Nord Maroc (EPSG:26191) ; altitudes orthométriques du nivellement général du Maroc. Une hauteur ellipsoïdale doit être
   livrée avec sa transformation approuvée, sinon elle sera mise en quarantaine.
5. Points de contrôle indépendants, exclus de l'ajustement et de la modélisation : répartition, classes de sol, incertitude
   de mesure.
6. Rapport qualité signé : biais, RMSEz, percentiles d'erreur absolue, lacunes, limites par classe de terrain ou de
   végétation.
7. Droits : stockage, traitement, affichage web, publication de cartes dérivées, export ; mention d'attribution.
8. Coûts détaillés : acquisition, traitement, contrôle, livraison, mises à jour ; calendrier ; responsabilité des
   autorisations de terrain (survol, accès).

## 4. Cibles d'acceptation proposées (à confirmer par un professionnel de la géomatique avant achat)

| Élément | Pilote 25 cm | Option 5 cm |
| --- | --- | --- |
| Pas de grille livré | 0,25 m | 0,05 m |
| RMSEz cible sur sol nu contrôlé indépendamment | ≤ 0,10 m | ≤ 0,05 m |
| P95 de l'erreur verticale absolue | ≤ 0,20 m | ≤ 0,10 m |
| Points de contrôle | ≥ 30 indépendants, répartis en altitude et par classe de sol ; davantage si site étendu ou hétérogène | contrôles supplémentaires dans la sous-zone, nombre convenu avant acquisition |
| Couverture | aucune lacune non documentée dans la zone analysable contractuelle | idem + preuve que la mesure plus fine apporte du détail |
| Végétation, sol inaccessible | résultats et exclusions par classe ; aucune extension des précisions du sol nu | idem |

Calcul (identique au plan) : pour le point de contrôle i, résidu e_i = altitude du modèle − altitude levée ;
biais = moyenne(e_i) ; RMSEz = racine(moyenne(e_i²)) ; P95 = 95ᵉ percentile empirique de |e_i|. Aucune valeur aberrante
retirée en silence ; aucun niveau de confiance déduit du seul RMSE ; incertitude des points et méthode de contrôle jointes au
rapport.

## 5. Tableau de comparaison des réponses

| Critère | ANCFCC (archives) | SEPRET | GEOMAITRISE | Autre |
| --- | --- | --- | --- | --- |
| Méthode, date | | | | |
| Pas MNT / MNS livré | | | | |
| Nuage de points (classes, densité sol) | | | | |
| Repère, datum, transformation | | | | |
| Points de contrôle indépendants (nombre, répartition) | | | | |
| Biais / RMSEz / P95 annoncés (à vérifier) | | | | |
| Droits (stockage, web, dérivés, export), attribution | | | | |
| Coût détaillé | | | | |
| Délai | | | | |

## 6. Volumes à prévoir (formule du plan)

Cellules ≈ A / r² ; une bande Float32 ≈ 4 A / r² octets avant compression. Pour une AOI de A km² : 25 cm → 16 M cellules
et 64 Mo par km² ; 5 cm → 400 M cellules et 1,6 Go par km². Prévoir en plus nuages de points, originaux, dérivés,
sauvegardes. Budget disque de préproduction : voir TER-D7.
