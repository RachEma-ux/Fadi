# Protocole de mesures T17 (apprentissage) et T18 (performance) — à l'usage du maître d'ouvrage

Les exigences T17 « apprentissage mesuré » et T18 « performance et diagnostic » de DrawAll V4.1 ne peuvent pas être
prouvées par la CI : la première demande des utilisateurs réels, la seconde vos appareils. Ce protocole dit
**quoi mesurer, comment, et comment consigner**, pour que les chiffres soient comparables d'une session à l'autre.
Les seuils d'acceptation sont à fixer par vous : aucun chiffre n'est annoncé à l'avance (R14).

## 1. T17 — Apprentissage mesuré

### 1.1 Participants

- 5 à 8 personnes par profil, au plus deux profils pour une première campagne : **architecte habitué** à un logiciel
  de dessin (Revit, ArchiCAD, AutoCAD, SketchUp…) et **non-spécialiste** du dessin (maître d'ouvrage, programmiste).
- Aucune formation préalable ; une seule consigne écrite (ci-dessous). Consentement et anonymat : un identifiant par
  participant (P01, P02…), aucune donnée personnelle dans le relevé.

### 1.2 Préparation

- Instance déployée (`docs/deploiement.md`) ou poste local (`README.md`) ; navigateur à jour ; ordinateur **et**
  téléphone pour au moins deux participants par profil.
- Pour chaque participant : un compte neuf, l'exemple P.118 importé, **une copie de travail** (l'exemple protégé
  n'est pas modifié).
- Enregistrement d'écran avec l'accord du participant ; chronomètre ; grille ci-dessous.

### 1.3 Tâches (dans cet ordre, sans aide orale)

| Nº | Tâche | Réussie quand | Repère de l'Atelier exercé |
| --- | --- | --- | --- |
| A1 | Ouvrir l'Atelier du projet et afficher le niveau « Mezzanine » | le plan de la mezzanine est affiché | navigateur, niveaux |
| A2 | Tracer un mur de 4,00 m sur le RDC | un mur de 4,00 m (inspecteur) existe | outil Mur, saisie de précision |
| A3 | Y poser une porte de 0,90 m | la porte est hébergée par ce mur | outil Porte |
| A4 | Changer l'épaisseur du mur à 0,25 m | l'inspecteur affiche 0,25 m | inspecteur |
| A5 | Annuler puis rétablir la dernière modification | état final identique à A4 | annuler / rétablir |
| A6 | Voir le bâtiment en 3D, puis revenir au plan | la vue 3D s'est affichée | barre (Plan / 3D) |
| A7 | Trouver l'outil « décaler » par la palette en tapant « offset » | l'outil est activé | palette (UX2) |
| A8 | Produire le PDF d'un plan du RDC | le PDF est téléchargé, « à jour » au catalogue | mode Documents |
| A9 | Enregistrer une version nommée « Essai » puis la comparer à l'état courant | la comparaison s'affiche | panneau Versions |
| A10 | Demander à l'assistant « feuilles et quantités », lire les hypothèses, refuser | statut « Refusée », rien d'écrit | Automatisation |

### 1.4 Relevé (une ligne par participant et par tâche)

| Champ | Contenu |
| --- | --- |
| participant, profil, appareil | P03, architecte, ordinateur 1440 × 900 |
| tâche | A1…A10 |
| réussite | oui / oui avec aide écrite / non (abandon après 5 min) |
| temps | secondes, du début de la lecture de la consigne à la réussite |
| erreurs | nombre de gestes annulés ou refusés (refus du serveur compris) |
| aide consultée | aide située (barre d'état, palette), aucune |
| verbatim | une phrase, si le participant en dit une |

Après les tâches : **SUS** (System Usability Scale, 10 questions, échelle 1–5), puis deux questions ouvertes
(« ce qui vous a le plus gêné », « ce que vous chercheriez en premier demain »).

### 1.5 Calculs et seuils (à fixer par vous)

- Taux de réussite sans aide par tâche et par profil ; temps médian ; erreurs médianes ; score SUS moyen.
- Proposition de seuils pour une première campagne (à confirmer ou remplacer) : A1–A6 réussies sans aide par 4
  participants sur 5 ; SUS ≥ 68 (moyenne de la littérature). Ce sont des repères, pas des exigences du projet.
- Consigner dans `docs/atelier/mesures-utilisateurs/AAAA-MM-JJ.md` (relevé brut, calculs, observations), sans
  identifier les personnes.

## 2. T18 — Performance et diagnostic

### 2.1 Ce que la CI mesure déjà (banc déclaré)

Les recettes impriment des lignes `⏱` (Chromium headless, rendu logiciel, machine de CI) : ouverture de l'Atelier
P.118, tracé d'un mur, passage en 3D, orbite (temps CPU par image, p95), pousser / tirer, sélection, glisser,
aperçu des vues, export / import IFC, création de variante, publication, proposition de l'assistant. Les valeurs
relevées pendant le chantier sont dans `docs/atelier/p0-mesures.md`. Elles servent à **détecter une régression**, pas
à promettre une performance sur vos appareils.

### 2.2 Mesure sur vos appareils

1. Choisir 3 appareils réels : un ordinateur de bureau courant, un ordinateur portable d'entrée de gamme, un
   téléphone récent (et, si possible, une tablette).
2. Sur chacun, compte neuf, P.118 importé, copie de travail ; navigateur à jour, aucune autre application ouverte.
3. Exécuter les gestes suivants trois fois, noter le temps ressenti et, sur ordinateur, le temps exact avec l'outil
   « Performance » du navigateur (enregistrement → durée de la tâche longue correspondante) :

| Geste | Mesure |
| --- | --- |
| Ouvrir l'Atelier P.118 | jusqu'au plan affiché |
| Tracer un mur (clic, saisie 4, Entrée) | jusqu'au mur affiché |
| Passer en 3D | jusqu'à la première image |
| Orbiter 10 s en 3D | images par seconde affichées (outil « Rendu » du navigateur) |
| Ouvrir le mode Documents, générer la façade sud | jusqu'à l'aperçu |
| Exporter la maquette IFC | jusqu'au téléchargement |
| Importer cette maquette dans un autre projet | jusqu'au rapport |

4. Consigner (appareil, système, navigateur, réseau, valeurs médianes) dans `docs/atelier/mesures-appareils/AAAA-MM-JJ.md`.

### 2.3 Diagnostic

- Côté serveur : `/health` (base joignable), journal de l'API (requêtes lentes : durée et route), `X-Model-Revision`
  et `X-Input-Hash` sur chaque document produit.
- Côté navigateur : Paramètres → « données conservées par le navigateur » (quota), barre d'état de l'Atelier
  (révision, lots en attente, hors ligne / serveur injoignable), panneau des modifications (lots en conflit,
  problèmes, collisions, documents périmés).
- Un geste lent se rejoue sur une copie du projet (archive JSON, « Sauvegarder projet JSON ») pour être reproduit sur
  le banc de CI.
