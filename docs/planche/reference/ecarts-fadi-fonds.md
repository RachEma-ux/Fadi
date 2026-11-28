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
