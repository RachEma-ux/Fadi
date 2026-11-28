# Écarts déclarés — Nuage de points (cas 4, lot C4, étape 7f)

Maquette validée par Roch (28.11.2026) : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7f-nuage.png`.
Catalogue : D10-F23a-009.

## Ce qui est livré
- Panneau « Nuage de points » (Ctrl+Maj+Espace, Maj+I, N : famille Échanges) : fichier (archivé), nombre de points et
  points affichés, unité et axe, tranche horizontale (altitude et épaisseur en millimètres), boîte de découpe et points
  de la tranche, case « Accrocher aux points mesurés », plan ajusté et son résultat, formats acceptés. Sans nuage, le
  panneau propose « Charger une référence » (commande existante des références, Ctrl+Maj+Espace, C).
- Lecture sans bibliothèque (`packages/sandbox-planche-model/src/nuage-points.ts`) : LAS 1.0 à 1.4 non compressé
  (formats de point 0 à 10), XYZ et PTS en texte, PLY sans faces (ASCII ou binaire). LAZ, E57 et PLY avec faces sont
  refusés avec leur motif. Le fichier est archivé tel quel en base (`sandbox_references_fichiers`, formats `las`, `xyz`,
  `pts` ajoutés, D-GD-29) et relu à l'ouverture ; le dessin ne garde que la fiche de la référence (marquée `nuage`).
- Posé en référence verrouillée : coin minimal du relevé à l'origine du projet, point le plus bas à l'altitude 0 ;
  la vue passe en vue de dessus, cadrée sur le relevé. Les points sont gardés relatifs à leur coin minimal (précision
  des grandes coordonnées d'un relevé géoréférencé).
- Vue : tout le nuage en gris clair, la tranche en sombre, les points choisis en orange ; panneau ouvert, la boîte de
  découpe en pointillé bleu à l'altitude de la tranche, avec quatre poignées. Glisser une poignée règle la boîte (le coin
  opposé reste fixe) ; la bulle « Boîte de découpe : poignées dans la vue » le rappelle.
- Accrochage : les outils de dessin s'accrochent au point mesuré de la tranche le plus proche du pointeur (inférence
  « Point mesuré », infobulle avec l'écart au point visé en millimètres). Un genre d'accrochage forcé (Alt + chiffre)
  l'écarte.
- « Ajuster un plan aux points choisis » (Ctrl+Maj+Espace, Maj+I, Maj+N) : points choisis au clic de l'outil Sélection
  sur la tranche (un nouveau clic les retire), plan des moindres carrés, écart quadratique moyen et plus grand écart en
  millimètres. Des points presque alignés (deuxième dispersion sous 2 % de la première, cas d'une seule tranche mince le
  long d'un mur) sont refusés avec leur motif : les choisir aussi dans une tranche à une autre altitude.

## Écarts
- L'unité est celle choisie dans le panneau des références (mètre par défaut) : un LAS ne la déclare pas dans son
  en-tête. La maquette écrit « (lus) », le panneau écrit « (choisis) ».
- Au-delà de 250 000 points, le nuage est décimé à pas régulier pour l'affichage ; tranche, accrochage et plan ajusté
  portent sur les points affichés. Le fichier archivé reste entier.
- Tranche, boîte de découpe, case d'accrochage et points choisis sont des réglages de la vue : ils ne vont pas au dessin
  et ne survivent pas au rechargement (le nuage, lui, est relu de l'archive).
- Le plan ajusté est mesuré et affiché ; il n'est pas encore posé dans le dessin (plan de travail ou face) : cette suite
  attend une demande.
- Un seul nuage est montré à la fois : celui choisi dans le panneau des références, sinon le dernier posé.
- Les couleurs des points (LAS, PTS, PLY) ne sont pas portées ; le récolement des références ne s'applique pas à un
  nuage (motif affiché).
- Fichier de 60 Mo au plus (limite de l'archive des références).

## Raccourcis
Trois temps après Ctrl+Maj+Espace : Maj+I (famille Échanges), puis N (panneau) ou Maj+N (ajuster un plan).
