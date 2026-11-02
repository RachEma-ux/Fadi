# POC de la porte G2 sur les corpus S1–S7 (G2-03)

Exécution du 2026-10-26T00:43:12+01:00 (heure suisse), commit `4d991ead5abb66cf72642e63600107e66c07100e`. Empreinte des résultats déterministes : `90598e7f265d70a594c61e386decd53d49e2ea6a1b3fe4441df93984203265b5`.
Périmètre autorisé : ADR-STUDIO-PILOTE-01 P-05 (contexte, 2D, association, chargement, index, conflit, reprise, publication).
Reproduire : `STUDIO_POC_SORTIE=atelier-captures/poc-corpus npx --workspace=@fadi/web vitest run src/modules/studio/poc/poc-corpus.test.ts`.
Les durées sont mesurées sans seuil ni verdict (DEC-13) et hors empreinte.

## Environnement

- node : 22.22.0
- icu : 77.1
- plateforme : linux 6.18.44-fc-v153 (x64)
- processeur : Intel(R) Xeon(R) Processor @ 2.30GHz × 4
- memoire : 16 Gio
- execution : poste local

## Résultats

| POC | Scène | Taille | Verdict | Valeurs | Durées (ms) |
|---|---|---:|---|---|---|
| 2d | S1 | 100 | conforme | feuillets=1, empreinte=278a4499afbe19757761fdc4, svg=c0d63fa2780896f703794710 | generationMs=5.08, validationMs=1.41 |
| 2d | S2 | 100 | conforme | feuillets=1, empreinte=b529af2eae3616fd89312d88, svg=7c10fab3d61e97f2667d05c3 | generationMs=4.95, validationMs=0.92 |
| 2d | S3 | 100 | conforme | feuillets=1, empreinte=e926abbb166a34909f15a2e9, svg=d3f710ae1c9561dc02e8d447 | generationMs=1.02, validationMs=0.49 |
| 2d | S7 | 100 | conforme | feuillets=1, empreinte=023960d66b42e6e115f16a02, svg=52a529a830ae9f02f30000bc | generationMs=0.86, validationMs=1.68 |
| 3d | S4 | 100 | conforme | maillage=53b8f4ef9deb6ca0, volumeSolides=2.7 | maillageMs=26.45 |
| 3d | S5 | 100 | conforme | maillage=9f8799ef9acf6900, volumeSolides=274.417750358 | maillageMs=144.54 |
| association | S1 | 100 | conforme | liees=16, libres=8, sommeMesures=49 |  |
| association | S2 | 100 | conforme | liees=12, libres=0, sommeMesures=72 |  |
| chargement | S1 | 100 | conforme | commandes=104, feuillets=1 | rejeuMs=6.69 |
| chargement | S2 | 100 | conforme | commandes=104, feuillets=1 | rejeuMs=1.40 |
| chargement | S3 | 100 | conforme | commandes=102, feuillets=1 | rejeuMs=1.36 |
| chargement | S4 | 100 | conforme | commandes=105, feuillets=1 | rejeuMs=1.24 |
| chargement | S5 | 100 | conforme | commandes=102, feuillets=1 | rejeuMs=17.30 |
| chargement | S7 | 100 | conforme | commandes=104, feuillets=1 | rejeuMs=1.04 |
| index | S1 | 100 | conforme | elements=100, formes=52, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.00, selectionLineaireP50=0.50, accrochageIndexP50=0.00 |
| index | S2 | 100 | conforme | elements=74, formes=50, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.00, selectionLineaireP50=0.06, accrochageIndexP50=0.00 |
| index | S3 | 100 | conforme | elements=100, formes=100, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.00, selectionLineaireP50=0.14, accrochageIndexP50=0.00 |
| index | S4 | 100 | conforme | elements=70, formes=60, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.01, selectionLineaireP50=0.10, accrochageIndexP50=0.00 |
| index | S5 | 100 | conforme | elements=50, formes=50, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.00, selectionLineaireP50=0.29, accrochageIndexP50=0.00 |
| index | S7 | 100 | conforme | elements=74, formes=50, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.00, selectionLineaireP50=0.05, accrochageIndexP50=0.00 |
| 2d | S1 | 10000 | conforme | feuillets=1, empreinte=bebb02711a6b068cf3c51854 | generationMs=77.93, validationMs=91.67 |
| 2d | S2 | 10000 | conforme | feuillets=1, empreinte=d7f165a9490f71721f433394 | generationMs=120.86, validationMs=54.59 |
| 2d | S3 | 10000 | conforme | feuillets=1, empreinte=daa2f9e0281558d4adab770f | generationMs=46.08, validationMs=43.80 |
| 2d | S7 | 10000 | conforme | feuillets=1, empreinte=384a23a53491be4dd30f8ef6 | generationMs=70.20, validationMs=43.77 |
| 3d | S4 | 10000 | conforme | maillage=80dc0249ec8de2ce, volumeSolides=270 | maillageMs=1055.11 |
| 3d | S5 | 10000 | conforme | maillage=b7d8da20ccdfb895, volumeSolides=28922.876760254 | maillageMs=4888.73 |
| association | S1 | 10000 | conforme | liees=1666, libres=833, sommeMesures=5411.5 |  |
| association | S2 | 10000 | conforme | liees=1250, libres=0, sommeMesures=7500 |  |
| chargement | S1 | 10000 | conforme | commandes=10004, feuillets=1 | rejeuMs=1646.55 |
| chargement | S2 | 10000 | conforme | commandes=10004, feuillets=1 | rejeuMs=526.84 |
| chargement | S3 | 10000 | conforme | commandes=10002, feuillets=1 | rejeuMs=78.11 |
| chargement | S4 | 10000 | conforme | commandes=10034, feuillets=1 | rejeuMs=274.99 |
| chargement | S5 | 10000 | conforme | commandes=10002, feuillets=1 | rejeuMs=704.46 |
| chargement | S7 | 10000 | conforme | commandes=10004, feuillets=1 | rejeuMs=608.89 |
| index | S1 | 10000 | conforme | elements=10000, formes=5002, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.05, selectionLineaireP50=41.35, accrochageIndexP50=0.00 |
| index | S2 | 10000 | conforme | elements=7500, formes=5000, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.03, selectionLineaireP50=3.54, accrochageIndexP50=0.00 |
| index | S3 | 10000 | conforme | elements=10000, formes=10000, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.04, selectionLineaireP50=14.37, accrochageIndexP50=0.01 |
| index | S4 | 10000 | conforme | elements=7000, formes=6000, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.22, selectionLineaireP50=8.07, accrochageIndexP50=0.09 |
| index | S5 | 10000 | conforme | elements=5000, formes=5000, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.05, selectionLineaireP50=16.71, accrochageIndexP50=0.00 |
| index | S7 | 10000 | conforme | elements=7500, formes=5000, divergencesSelection=0, divergencesAccrochage=0 | selectionIndexP50=0.02, selectionLineaireP50=4.37, accrochageIndexP50=0.00 |
| association | S6 | 100 | conforme | netA1=3.18, netA2=3.096 |  |
| conflit | S2 | 100 | conforme | chevauchementMemeMur=architecture:s2-0-mur-h, chevauchementAutreMur=0, memeResultat=0 |  |
| conflit | S7 | 100 | conforme | chevauchementMemeMur=architecture:s7-0-mur-h, chevauchementAutreMur=0, memeResultat=0 |  |
| reprise | S7 | 100 | conforme | objetsAvant=24, objetsApres=25, empreinteApres=e6d401f36efdbc7f592b4a8f |  |
| publication | S6 | 100 | conforme | conclusions=A:satisfaite,B:non-satis, empreinteDossier=24551285033b38e96bebd2e1, empreintePdf=2471b76486f9e1e9ead86e4a | dossierMs=16.75 |

## POC hors corpus

- contexte : ouvrir Studio dans un projet sans le Parcours ne dépend d'aucun corpus : recettes apps/web/e2e/studio-navigation.mjs (NAV-002 à NAV-004) et studio-preuves-d1.mjs (parcours A, B, C)
