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

Depuis la bascule du lot 4 (D-052), un seul Atelier : celui de DrawAll V4.1 (lots 1 à 3b). `NouvelAtelier.tsx` monte
le bus local (`bus/`, file hors-ligne et synchronisation par révision), les registres d'outils, de dessinateurs et
d'inspecteurs alimentés par les modules installés (`plan2d/`, `objets/`, `documents/`, `vue3d/`), le contexte et le
pilote (`socle/`), puis l'interface (`ui/`). Le modèle est le modèle typé de `@parcours/atelier-model`, écrit
uniquement par des commandes journalisées (`/projects/:id/atelier/commands`, §5.4) ; chaque écriture validée avance
la révision du projet.

L'Atelier sert le module `atelier` et les étapes 10 et 11 du Parcours : bandeau « Atelier Architectural · ÉTAPE n /
21 » et, à l'étape 10, le bouton « Harmonie » (`#atelier-harmonie-button`) qui ouvre la sous-page « Harmonie du
bâtiment ». Il n'est chargé qu'à sa première ouverture.

`AtelierHarmonyPage.tsx` porte la sous-page « Harmonie du bâtiment » de l'étape 10 (V8.4) ; `DesignReview.tsx` le bilan Harmonie du bâtiment conçu (flow-v62 : analyse du modèle, réserves, plans, audit des transmissions, revue, rapport, références directionnelles), calculé côté serveur à partir de `packages/domain-model/src/design-review.ts` sur la projection du modèle typé.

Référence protégée de l'exemple (D-052 §7) : sur un projet en mode « référence », la première commande demande la
copie de travail au serveur (`POST /projects/:id/copies`, modèle typé repris à l'identique), y est envoyée, puis
l'écran bascule sur la copie, même module et même étape (`transportReference`) ; la référence n'est jamais écrite.

L'onglet « Hypothèses & MapTiler » du bilan reçoit l'observation déclarée du contexte extérieur (`SiteObservationForm` → `PUT …/design-review/observation`, 20 caractères minimum, statut du prototype) ; elle lève la réserve « Contexte extérieur non observé » avec un géoréférencement et périme le bilan produit avant elle.

« Collecter l'altitude indicative du centre » appelle le service MapTiler depuis le navigateur avec la clé de l'utilisateur (`lib/maptiler.ts`) et pose l'altitude reçue sur le contexte (`PUT …/design-review/elevation`).

Référence protégée de l'exemple : le moteur extrait appelle `window.P118Resolved.ensureDrawingCopy()` avant de valider une modification du dessin (`fdCommit`) ; Fadi y répond en demandant la copie de travail au serveur (`POST /projects/:id/copies`, mêmes clés natives) et en destinant dès cet instant les écritures du moteur à la copie (file locale puis envoi) — l'original n'est jamais écrit ; une fois les écritures envoyées, l'écran bascule sur la copie, même module et même étape. Sans copie possible, la modification reste affichée, rien n'atteint l'original et l'Atelier passe en lecture seule avec le motif.

Reste : la page Harmony V6 (superseded) qui lisait les revues documentaires du dossier.
