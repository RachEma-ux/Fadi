# Module : Atelier Architectural

Responsabilité : modèle du bâtiment, dessin, sélection, édition et vues.

Conserve les fonctions de dessin de l'Atelier de référence : niveaux, vues (plan, coupe, volume, éclaté) et les
comportements retenus pour les modes Volume et Éclaté. Les formulaires et panneaux peuvent être améliorés
(saisie, explication des erreurs, accessibilité clavier/tactile) sans changer le modèle sous-jacent. Les
paramètres d'affichage (caméra, sélection, niveau visible, mode Volume/Éclaté) restent séparés des données
physiques du bâtiment — voir `docs/architecture.md`, « Coherent, reversible operations ».

Ce module consomme `@parcours/core-geometry` pour tous les calculs géométriques ; il ne réimplémente jamais une
fonction de géométrie localement.

## Statut

Le moteur de l'Atelier du prototype (Design Atelier V14-3 : viewer 3D, plan, coupes, façades, niveaux, outils de dessin, exports, études solaires, barre d'outils V8) est **extrait tel quel** par `apps/web/scripts/extract-native-atelier.mjs` et encapsulé, jamais réécrit (`native/engine.ts`, `NativeAtelier.tsx`) ; sa persistance passe par `window.ParcoursSession.storage` → `atelier_store` (révision par clé, 409 en cas de conflit) et une projection dérivée `levels` / `architectural_objects` — voir `docs/migration/matrix.md`, section 3.

`AtelierHarmonyPage.tsx` porte la sous-page « Harmonie du bâtiment » de l'étape 10 (V8.4) ; `DesignReview.tsx` le bilan Harmonie du bâtiment conçu (flow-v62 : analyse du modèle, réserves, plans, audit des transmissions, revue, rapport, références directionnelles), calculé côté serveur à partir de `packages/domain-model/src/design-review.ts`.

Le moteur (scripts, markup, feuille de style — `native/engine.ts`) n'est chargé qu'à la première ouverture de l'Atelier ou des étapes 10 / 11 ; le magasin et l'état de synchronisation (`native/storage.ts`) restent dans l'enveloppe pour l'en-tête et le bandeau des conflits. Le service worker met tous les morceaux en cache dès son installation : l'Atelier s'ouvre hors-ligne même s'il n'a jamais été visité en ligne.

Accessibilité du moteur extrait : la barre d'outils V8 déclare `role="tablist"` sans onglets ; au chargement, `engine.ts` (`accessibleToolTabs`) pose `role="tab"` sur ses boutons, reflète `aria-selected` depuis la classe `active` que le script extrait bascule (observateur de mutations) et ajoute les flèches gauche / droite — sans modifier les fichiers générés par le script d'extraction. La ligne d'information du viewer est surchargée en CSS (`style.css`) pour le contraste 4,5:1. Le scénario e2e passe axe-core sur l'Atelier monté (ordinateur et téléphone) ; les outils de dessin sur canvas ne sont pas audités.

L'onglet « Hypothèses & MapTiler » du bilan reçoit l'observation déclarée du contexte extérieur (`SiteObservationForm` → `PUT …/design-review/observation`, 20 caractères minimum, statut du prototype) ; elle lève la réserve « Contexte extérieur non observé » avec un géoréférencement et périme le bilan produit avant elle.

« Collecter l'altitude indicative du centre » appelle le service MapTiler depuis le navigateur avec la clé de l'utilisateur (`lib/maptiler.ts`) et pose l'altitude reçue sur le contexte (`PUT …/design-review/elevation`).

Référence protégée de l'exemple : le moteur extrait appelle `window.P118Resolved.ensureDrawingCopy()` avant de valider une modification du dessin (`fdCommit`) ; Fadi y répond en demandant la copie de travail au serveur (`POST /projects/:id/copies`, mêmes clés natives) et en destinant dès cet instant les écritures du moteur à la copie (file locale puis envoi) — l'original n'est jamais écrit ; une fois les écritures envoyées, l'écran bascule sur la copie, même module et même étape. Sans copie possible, la modification reste affichée, rien n'atteint l'original et l'Atelier passe en lecture seule avec le motif.

Reste : la page Harmony V6 (superseded) qui lisait les revues documentaires du dossier.
