# Module : Parcours

Responsabilité : étapes, avancement, décisions et transmissions.

Porte les 21 étapes numérotées de 01 à 21, dans leur ordre, avec leurs intitulés et leurs phases d'origine, la
grille de navigation mobile, et l'intégration de l'Harmonie aux étapes concernées — tels que définis par
l'application de référence (`Parcours_V8_19_Escalier_B_Mezzanine.html`). Ce module ne redéfinit pas ces 21
étapes : il les reproduit fidèlement, puis les relie au modèle de projet commun (décisions tracées, transmission
d'une étape à la suivante avec provenance).

## Statut

Porté depuis le prototype V8.19 (voir `docs/migration/matrix.md`, section 1, et les fiches `docs/migration/etapes/NN.md`) :

- `ParcoursModule.tsx` : vue d'ensemble (21 cartes, phases, progression), vue d'une étape (`?etape=N`), Précédente / Suivante, « Marquer terminée », outils du projet (archive JSON, import, synthèse Harmonie) ;
- `StepForm.tsx` : les formulaires métier `BIZ_SCHEMAS` (17 étapes) avec leurs indicateurs (14, 17, 19), validés et persistés par l'API ;
- `HarmoniePanel.tsx` + `SiteHarmonie.tsx` : le panneau Harmonie de chaque étape (propositions A/B/C, arbitrages, péremption « à réexaminer », onglets, rapports) et les propositions de site de l'étape 01 ; `MapTilerCard.tsx` (avec `lib/maptiler.ts`) : fond satellite, altimétrie du centre et des sommets et connexion MapTiler du pli « Données du site », appels depuis le navigateur avec la clé de l'utilisateur, résultats enregistrés comme données déclarées de l'étape ; à l'étape 07, le pli « Proposer un transfert surfacique à total constant » (`modules/programmation/ProgrammeTransferFold.tsx`) ;
- les outils des étapes outillées : outil Parcelle (01, `modules/projets-sources/ParcelleTool.tsx`), Atelier natif et sous-page « Harmonie du bâtiment » (10, 11, `modules/atelier`), bilan du bâtiment conçu ;
- le récit de l'exemple P.118 importé, jamais fabriqué pour une étape qui n'en a pas.

Les règles (arbitrages, péremption, effets amont / aval) s'exécutent côté serveur (`apps/api/src/routes/parcours-steps.ts`) ; le client affiche les refus tels quels.
