# Écarts Fadi — fonds calés (cas 4 du catalogue des extensions, lot C4, étape 1)

Référence de l'outil Calage et du panneau Fonds calés (fiche D10-F23a-002 du catalogue des extensions, lot C4 du cas 4
« Noyau ou hôte » ; maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-1-calage.png`). SketchUp n'a pas
d'outil de calage : l'outil est **déclaré** au catalogue avec le statut `fadi`. Aucune longueur ni position n'est
fournie par Fadi : elles sont saisies.

## § 1 — Fonds et calage

- **Importer un fond** (Ctrl+Alt+Maj+F3, aussi Fichier ▸ Importer un fond) : image PNG ou JPEG, réduite à 4 096 px de
  côté au plus, posée à plat à l'altitude du niveau actif (0 sans niveau). Pose **provisoire** : 1 px = 1 cm, coin haut
  gauche à l'origine ; le fond est marqué « non calé ».
- **Outil Calage** (Ctrl+Alt+Maj+F2) : « Cliquez le fond pour poser le point de calage suivant ; la position se saisit
  dans le panneau Fonds calés. » Un clic sur un fond déverrouillé pose le point suivant (A, B, C…, 26 au plus) au pixel
  visé. Un pas d'historique « Point de calage ».
- **Panneau Fonds calés** (Ctrl+Alt+Maj+F1, hors de la colonne) : liste des fonds (taille, état, mètres par pixel),
  méthode, tableau des points (pixel, position, résidu), longueur saisie, opacité.
- **Caler** (Ctrl+Alt+Maj+F4) :
  - « Deux points et une longueur » : l'échelle devient longueur saisie / distance A–B en pixels ; A reste en place, la
    rotation ne change pas.
  - « Paires de points » : similitude (translation, rotation, échelle) aux moindres carrés sur les points dont la
    position est saisie. À trois paires ou plus, chaque point a son résidu (distance après calage) et l'écart
    quadratique moyen est donné ; à deux, ils sont « non évalués ».
- **Verrouiller / déverrouiller** (Ctrl+Alt+Maj+F5) : un fond verrouillé refuse points et calage ; l'outil Calage
  l'ignore.
- **Supprimer le point** (Ctrl+Alt+Maj+F6) : les points suivants sont renommés pour garder A, B, C…
- **Supprimer le fond** (Ctrl+Alt+Maj+F7).

## § 2 — Écarts déclarés

- Raccourcis Ctrl+Alt+Maj+F1 à F7 : dernière famille libre du cœur ; sous Linux de bureau, Ctrl+Alt+F change de console.
- La page de PDF à caler vient avec l'étape 4 (PDF reçu) du lot C4, qui lit déjà le PDF.

## Original archivé en base (décision du maître d'ouvrage, 27 novembre 2026)

Le fichier reçu (PNG ou JPEG, 25 Mo au plus, choix Fadi) est rangé tel quel dans `sandbox_fonds_originaux` avec son
empreinte SHA-256, au nom du compte, **avant** la pose ; le même fichier n'est rangé qu'une fois par compte. Le fond ne
porte dans le dessin que la copie réduite (4 096 px au plus) et la référence `original` (id, empreinte, taille, type) ;
l'original se relit par `GET /sandbox/fonds/:id`. Sans archive (hors connexion, sans compte, refus du serveur), le fond
n'est pas posé : le motif est affiché. Le type est jugé sur la signature des octets, jamais sur le seul en-tête.

## Étape 2 : fiche de calage et orthophoto (lot C4)

Maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-2-fiche-calage.png`. Écarts déclarés :

- **GeoTIFF non lu** : le navigateur ne décode pas le TIFF ; une orthophoto se reçoit en PNG ou JPEG avec son fichier
  de calage d'image (`.tfw`, `.jgw`, `.pgw`, `.wld`) et, si possible, son `.prj`.
- **Aucune conversion de système** : un fichier dans un autre système que le point de base du projet est refusé avec
  son motif ; sans `.prj` lisible, le système est demandé (jamais supposé) et doit être celui du projet.
- **Pose par similitude seulement** : pixels non carrés, cisaillés ou en miroir sont refusés (Fadi pose un fond par
  translation, rotation et échelle).
- **Le `.prj` n'est pas écrit** à l'export du calage d'un fond : Fadi n'a pas de base de systèmes.
- **Appliquer une fiche** reprend le point de base et ajoute les niveaux absents ; un niveau existant n'est jamais
  modifié et l'altitude du ±0,00 (réglage de la Planche, hors du dessin) n'est que comparée.
- **Raccourcis** : Exporter la fiche Ctrl+Alt+Maj+F8, Importer une fiche F9, Importer une orthophoto F10, Exporter le
  calage du fond F11, Appliquer F12 ; Ignorer Alt+F3, Poser l'orthophoto Alt+F2 (Ctrl+Alt+Maj+F est épuisée, Alt+F6 à
  F12 et Ctrl+Maj+F1 à F12 sont pris). Certains bureaux Linux gardent Alt+F2 : la commande reste dans le panneau et
  la liste Outils.
- **Publication par lien** (bulle de la maquette) : non ajoutée à cette étape ; la fiche s'exporte en fichier.
