# Fadi — Cahier des charges : Plan de dessin de l'Atelier architecture
**Référence d'ergonomie : SketchUp pour le Web (mobile + desktop)**
Version 1 — 06/10/2026

Sources : 17 captures d'écran mobile (Chrome Android) de app.sketchup.com + documentation officielle SketchUp for Web (help.sketchup.com : Navigating SketchUp for Web, Using Shortcuts, Trackpad Controls).
Limite : l'app connectée n'a pas pu être explorée en direct (navigateur indisponible sur mobile). Les points marqués **[À VÉRIFIER]** sont à confirmer sur desktop.

---

## 1. Analyse de SketchUp Web

### 1.1 Anatomie de l'écran (5 zones)

| Zone | Contenu observé |
|---|---|
| **Barre supérieure** | Menu hamburger · assistant IA (étincelles) · bouton lecture/tutoriel · Annuler / Rétablir · état de sauvegarde (« Saved » / « Save » / triangle d'alerte) · avatar · indicateur de collaboration · bouton **Share** |
| **Barre d'outils gauche (verticale, flottante)** | Recherche d'outil (loupe) · chevron « réduire » · Sélection · Gomme · Ligne · Rectangle · Pousser/Tirer · Déplacer · Rotation · Échelle · Pot de peinture · Orbite · **Pan (outil actif, barre bleue)** · Mètre ruban · « … » (outils étendus) |
| **Outils étendus (popover en grille 4 colonnes)** | Lasso, Prélever matériau, Commentaire · Cercle, Arc 2 points, Arc, Polygone · Décalage, Suis-moi, Retourner, Coque extérieure · Cotes, Rapporteur, Axes, Texte · Zoom, Zoom étendu, Position caméra, Regarder autour · Assistant IA, Rendu IA |
| **Panneaux droits (pile verticale d'icônes + étiquette)** | Commentaires · Info entité · Outliner · Instructeur · 3D Warehouse · Matériaux · Styles · Balises · Ombres · Scènes · Affichage · Adoucir/Lisser · Info modèle · Inspecteur solide. Colonne défilante, chevron « >> » pour replier |
| **Barre inférieure** | Aide (?) · Langue (globe) · Périphérique d'entrée (souris/trackpad) · **champ Mesures (VCB)** |

### 1.2 Comportements clés à reproduire

1. **Canvas plein écran**, outils et panneaux **flottants par-dessus** (aucune zone fixe qui mange le dessin). Fond gris neutre, axes rouge/vert/bleu, personnage-échelle.
2. **Outil actif toujours visible** (barre bleue à gauche) ; **un seul outil actif** ; Échap = revient à l'outil précédent.
3. **Panneaux flottants exclusifs** : un clic sur une icône ouvre le panneau en superposition, positionné à côté de l'icône ; un autre clic en ouvre un autre ; barre bleue en bas du panneau = poignée de repli. Le panneau reste en contexte (liste défilante, recherche, mini-barre d'actions).
4. **Panneau Instructeur contextuel** : explique l'outil actif (nom, description, « Tool Operation » en étapes, « Tips » avec raccourcis).
5. **Info entité** : « No Selection » par défaut, propriétés de l'objet sélectionné sinon.
6. **Outliner** : arbre hiérarchique (groupes/composants), recherche, visibilité (œil), déplier tout, cibler, supprimer.
7. **Balises (calques)** : recherche, afficher/masquer, ajouter, dossier, tri A-Z, nettoyage.
8. **Matériaux** : matériau par défaut, onglets (modèle / recherche / bibliothèque en ligne), « Materials in use » en grille, créer / modifier / supprimer.
9. **Affichage** : Réafficher tout / sélection / dernier ; édition de composant (masquer le reste du modèle, masquer composants similaires).
10. **Saisie numérique (VCB)** : champ « Measurements » en bas, saisie de valeurs exactes pendant un tracé.
11. **Sauvegarde explicite et visible** : état « Saved/Save », confirmation avant partage (« Votre modèle doit être enregistré »), case « ne plus afficher ».
12. **Réglages de navigation** (App Settings > Navigation) : périphérique Souris/Trackpad ; geste à deux doigts mappé à Orbit/Pan/Zoom ; inversion zoom/orbit/pan ; sensibilité zoom/orbit/pan ; « Reset All ». Menu rapide « Choisissez votre périphérique ».
13. **Navigation souris** : molette = zoom ; maintenir molette = orbite ; molette + clic gauche = pan. Raccourcis clavier quasi identiques à la version desktop, personnalisables, visibles au survol de l'outil et dans la recherche d'outils. **Trackpad/tactile** : pincer = zoom, deux doigts = orbite ou pan (au choix), Shift/Ctrl pour accéder aux deux autres.
14. **Menu principal** : Accueil, Nouveau, Ouvrir, Enregistrer sous, Partager, Importer, Exporter, Télécharger, Réglages, Ajouter un emplacement, Imprimer.
15. **Aide** : Centre d'aide, forums, support, recherche. **Langues** : de, en, es, fr, it, ja, ko, pt, ru, sv, zh-CN, zh-TW.
16. **Responsive mobile** : mêmes composants, mais panneaux en surcouche pleine largeur (moins la barre gauche), liste d'icônes droite défilante, clavier système géré (le canvas se redimensionne).

---

## 2. Cahier des charges — liste de tâches

Règle d'or : **ne rien casser de l'existant**. Chaque tâche est additive ou isolée derrière une couche d'adaptation. Critères d'acceptation en italique.

### Phase 0 — Cadrage (obligatoire avant tout code)
- [ ] T0.1 Auditer l'existant du plan de dessin de l'Atelier architecture (moteur de rendu, modèle de données, outils, état, tests) et lister ce qui est conservé tel quel. *Livrable : note d'audit, aucune modification.*
- [ ] T0.2 Cartographier l'écart entre l'existant et la section 1 (matrice « existe / partiel / absent »). *Livrable : tableau d'écart validé.*
- [ ] T0.3 Figer le périmètre MVP vs. phases suivantes et les métriques de succès. *Livrable : périmètre signé.*

### Phase 1 — Squelette d'interface (coquille sans toucher au moteur)
- [ ] T1.1 Mise en page « canvas plein écran + surcouches flottantes » en desktop et mobile. *Le canvas occupe 100 % de la zone ; aucun panneau ne le redimensionne.*
- [ ] T1.2 Barre supérieure : menu, annuler/rétablir, état de sauvegarde, partage. *Les actions existantes sont reliées, pas réécrites.*
- [ ] T1.3 Barre d'outils gauche flottante repliable avec indicateur d'outil actif. *Un seul outil actif ; Échap revient à l'outil précédent.*
- [ ] T1.4 Popover « outils étendus » en grille. *Fermeture au clic extérieur et à Échap.*
- [ ] T1.5 Barre inférieure : aide, langue, périphérique d'entrée, champ Mesures.
- [ ] T1.6 Pile d'icônes de panneaux à droite, défilante, repliable (« >> »).
- [ ] T1.7 Gestionnaire de panneaux flottants exclusifs (ouverture, ancrage à l'icône, repli par poignée, défilement interne).
- [ ] T1.8 Points de rupture mobile / tablette / desktop. *Cibles tactiles ≥ 44 px ; tout accessible à une main sur mobile.*

### Phase 2 — Navigation et saisie (le « toucher » de SketchUp)
- [ ] T2.1 Navigation souris : molette zoom, molette maintenue orbite, molette + clic pan.
- [ ] T2.2 Navigation tactile : pincer = zoom, un doigt = outil actif, deux doigts = orbite/pan configurable, sans conflit avec le tracé.
- [ ] T2.3 Navigation trackpad : mapping deux doigts, modificateurs Shift/Ctrl.
- [ ] T2.4 Réglages de navigation : périphérique, inversions, sensibilités, « Reset All », persistance par utilisateur.
- [ ] T2.5 Outils de vue : Orbite, Pan, Zoom, Zoom étendu, Regarder autour, Position caméra.
- [ ] T2.6 Accrochages et inférence (extrémité, milieu, intersection, axes, perpendiculaire/parallèle) avec aides visuelles.
- [ ] T2.7 Champ Mesures (VCB) : saisie d'une valeur exacte pendant un tracé, unités métriques, validation à Entrée.
- [ ] T2.8 Raccourcis clavier configurables, affichés en infobulle et dans la recherche d'outils.
- [ ] T2.9 Recherche d'outils (loupe) avec exécution directe.

### Phase 3 — Outils de dessin (priorité architecture)
- [ ] T3.1 Noyau : Sélection (+ Lasso), Gomme, Ligne, Rectangle, Cercle, Arc, Polygone, Déplacer, Rotation, Échelle, Décalage.
- [ ] T3.2 Mesure et annotation : Mètre ruban, Cotes, Rapporteur, Texte, Axes.
- [ ] T3.3 Volumes (si le plan est 3D) : Pousser/Tirer, Suis-moi, Retourner, Coque extérieure. *Si le plan est 2D, documenter l'équivalent ou reporter.*
- [ ] T3.4 Annuler/rétablir granulaire sur toutes les opérations.
- [ ] T3.5 Impératif métier : échelle, cotation, cartouche, unités (cm/m), surfaces. *Conforme aux compétences architecture déjà prévues pour Fadi.*

### Phase 4 — Panneaux
- [ ] T4.1 Instructeur contextuel (texte par outil : nom, opération en étapes, astuces).
- [ ] T4.2 Info entité (aucune sélection / propriétés éditables).
- [ ] T4.3 Outliner (arbre, recherche, visibilité, déplier, cibler, supprimer).
- [ ] T4.4 Balises/calques (visibilité, ajout, dossiers, tri, nettoyage).
- [ ] T4.5 Matériaux (par défaut, en usage, créer/modifier/supprimer, prélèvement).
- [ ] T4.6 Affichage (réafficher tout/sélection/dernier, isolation de composant).
- [ ] T4.7 Scènes (vues enregistrées), Styles, Ombres (version simple), Info modèle (unités, emplacement).
- [ ] T4.8 Commentaires et partage (après Phase 5).

### Phase 5 — Fichiers et sauvegarde
- [ ] T5.1 État de sauvegarde visible, enregistrement manuel + automatique, alerte en cas d'échec.
- [ ] T5.2 Menu principal : Nouveau, Ouvrir, Enregistrer sous, Importer, Exporter (PDF/DXF/image), Télécharger, Imprimer.
- [ ] T5.3 Partage avec confirmation d'enregistrement préalable.

### Phase 6 — Qualité
- [ ] T6.1 i18n : fr par défaut, en ; structure prête pour les autres langues.
- [ ] T6.2 Accessibilité WCAG 2.2 AA : clavier complet, focus visible, labels, contrastes, annonces lecteur d'écran pour panneaux et outils (exigence européenne).
- [ ] T6.3 Performance : 60 i/s au dessin sur mobile milieu de gamme, grands plans, pas de blocage du thread principal. INP ≤ 200 ms.
- [ ] T6.4 Tests : unitaires (logique d'outils), E2E Playwright (dessiner, annuler, sauvegarder, naviguer) en desktop + émulation mobile, régression visuelle des panneaux.
- [ ] T6.5 Non-régression : toute fonction existante listée en T0.1 passe toujours.

### Définition de « terminé » (globale)
Sur mobile et desktop : on ouvre le plan, on choisit un outil, on trace avec saisie numérique, on navigue (orbite/pan/zoom), on ouvre un panneau sans perdre le dessin, on enregistre, et rien de l'existant n'est cassé.

---

## 3. Prompt prêt à coller dans le développement de Fadi

```
CONTEXTE
Projet : Fadi (dépôt github.com/RachEma-ux/Fadi), module « Plan de dessin de l'Atelier architecture », développement en cours.
Objectif impératif : le plan de dessin doit offrir la même souplesse d'utilisation que SketchUp pour le Web, en version mobile ET desktop. Cet objectif est une exigence structurante, à prendre en compte dans toutes les décisions de développement à venir.

CONTRAINTE ABSOLUE
Ne remets PAS en question ce qui est déjà fait. Interdit : réécrire, renommer, changer de stack ou de moteur de rendu, modifier le modèle de données existant sans nécessité démontrée. Tout ajout est additif ou isolé derrière une couche d'adaptation. Si un changement d'existant te semble inévitable, STOP : explique pourquoi et attends ma validation.

ÉTAPE 0 (avant d'écrire du code)
1. Audite le code actuel du plan de dessin : moteur de rendu (canvas/SVG/WebGL), modèle de données, outils existants, gestion d'état, tests, support tactile.
2. Produis un tableau d'écart « existe / partiel / absent » face aux exigences ci-dessous.
3. Propose un plan par phases qui réutilise l'existant. Attends mon accord avant de coder.

EXIGENCES D'ERGONOMIE (référence : SketchUp pour le Web)
Disposition :
- Canvas plein écran ; tous les outils et panneaux sont des surcouches flottantes qui ne redimensionnent jamais le canvas.
- Barre supérieure : menu principal, annuler/rétablir, état de sauvegarde (« Saved/Save »), partage.
- Barre d'outils verticale à gauche, repliable : Sélection, Gomme, Ligne, Rectangle, Pousser/Tirer (si 3D), Déplacer, Rotation, Échelle, Peinture, Orbite, Pan, Mètre ruban, plus un bouton « … » ouvrant une grille d'outils étendus (Lasso, Cercle, Arcs, Polygone, Décalage, Cotes, Rapporteur, Texte, Axes, Zoom, Zoom étendu, Position caméra, Regarder autour…). Recherche d'outil par loupe.
- Un seul outil actif, clairement signalé ; Échap revient à l'outil précédent.
- Colonne droite d'icônes avec étiquette, défilante et repliable ; chaque icône ouvre un panneau flottant exclusif (un seul à la fois), ancré près de l'icône, avec défilement interne et poignée de repli.
- Panneaux : Instructeur (aide contextuelle de l'outil actif : opération en étapes + astuces), Info entité, Outliner (arbre avec recherche et visibilité), Balises/calques, Matériaux, Affichage (réafficher tout/sélection/dernier, isolation), Scènes, Styles, Info modèle (unités).
- Barre inférieure : aide, langue, périphérique d'entrée (souris/trackpad), champ « Mesures » pour saisir des valeurs exactes pendant un tracé.

Interaction :
- Souris : molette = zoom ; molette maintenue = orbite ; molette + clic gauche = pan.
- Tactile : pincer = zoom ; un doigt = outil actif ; deux doigts = orbite ou pan (configurable), sans jamais entrer en conflit avec le tracé. Cibles ≥ 44 px, utilisable à une main.
- Trackpad : geste deux doigts configurable, Shift/Ctrl pour les autres modes.
- Réglages de navigation : périphérique, inversion zoom/orbite/pan, sensibilité, « Reset All », persistés par utilisateur.
- Accrochages et inférence (extrémité, milieu, intersection, axes, perpendiculaire/parallèle) avec aides visuelles.
- Raccourcis clavier configurables, visibles en infobulle.
- Annuler/rétablir sur toutes les opérations. Sauvegarde automatique + manuelle, état toujours visible, confirmation avant partage.

Spécificités métier (Fadi / architecture Maroc) :
- Échelle, unités métriques, cotation, cartouche, surfaces calculées. Les règles métier existantes de Fadi restent prioritaires.

QUALITÉ (non négociable)
- TypeScript strict, validation des entrées aux frontières, pas de secrets côté client.
- Accessibilité WCAG 2.2 AA : navigation clavier complète, focus visible, labels, contrastes, annonces pour lecteurs d'écran.
- Performance : 60 i/s au dessin sur mobile milieu de gamme, INP ≤ 200 ms, aucun travail lourd sur le thread principal.
- i18n : français par défaut, anglais, structure prête pour d'autres langues.
- Tests : unitaires (outils), E2E Playwright desktop + émulation mobile, test de non-régression sur toutes les fonctions listées à l'étape 0.

MÉTHODE
- Livre par petites tranches verticales, chacune testable et fusionnable seule (phases : coquille UI → navigation/saisie → outils de dessin → panneaux → fichiers/sauvegarde → qualité).
- Après chaque tranche : ce qui a été fait, ce qui reste, risques, et confirmation explicite que l'existant fonctionne toujours.
- En cas de doute ou d'information manquante, pose UNE question ciblée plutôt que de supposer.

CRITÈRE DE SUCCÈS
Sur mobile et desktop, un utilisateur ouvre le plan, choisit un outil, trace avec saisie numérique, navigue (orbite/pan/zoom), ouvre un panneau sans perdre son dessin, enregistre, et aucune fonction existante n'est cassée.
```

---

## 4. Points à vérifier sur SketchUp en direct (desktop)
- Liste exacte des raccourcis clavier par outil et comportement exact de l'inférence.
- Comportement détaillé des gestes tactiles à un et deux doigts sur tablette.
- Contenu complet des panneaux Styles, Ombres, Scènes, Info modèle, Adoucir/Lisser, Inspecteur solide (non visibles dans les captures).
- Disposition desktop (largeur des panneaux, ancrage, possibilité de redimensionner).
- Barres d'outils masquées derrière le chevron « ^^ » à gauche.

Sources : help.sketchup.com — « Navigating SketchUp for Web », « Using Shortcuts in SketchUp for Web », « Trackpad Controls ».
