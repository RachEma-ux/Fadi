# Axes et repères — recette des scénarios AX01 à AX20

Mis à jour : 2026-10-25 (UTC). Concept `Fadi Concept/Fadi Concept - Axes.md` 1.0, § 11. Hôte : Sandbox (AX-D2).
Chaque scénario renvoie à sa preuve exécutée (tests du modèle `packages/sandbox-planche-model/src/*.test.ts`, tests de
l'interface `apps/web/src/modules/sandbox/**`, recettes `apps/web/e2e/sandbox-*.mjs`, toutes en CI, tranche `planche`)
ou au motif pour lequel il est sans objet. Les comparaisons géométriques utilisent `TOLERANCES_REPERE` (AX-D5).

| Scénario | Résultat | Preuves |
| --- | --- | --- |
| AX01 Repère le long d'une aile à 27° | Vérifié | `reperes.test.ts` (AX01 : rectangle selon les axes locaux, sommets existants immobiles) ; `sandbox-axes.mjs` (repère à 45° par trois clics, géométrie inchangée) |
| AX02 Points confondus ou presque alignés | Vérifié | `reperes.test.ts` (refus nommés, sinus < 1e-6, outil : étape gardée, Échap) ; `sandbox-axes.mjs` (message « points alignés », aucun contexte poussé) |
| AX03 Origine saisie avec unités | Vérifié | `reperes.test.ts` (`[2;3;0]`, `<1;0;0>`, `[250cm;0;0]`) ; `sandbox-axes.mjs` (`[2;1;0]`, orientation, géométrie et historique inchangés) |
| AX04 Absolu / relatif dans un repère tourné, locale | Vérifié | `reperes.test.ts` (`[1;0;0]`, `<0;1,5;0>` avec virgule décimale) |
| AX05 Dessin sur un pan incliné | Vérifié | `reperes.test.ts` (rectangle dans le plan XY du repère, normale = Z local, plus de Z du monde) ; `sandbox-axes.mjs` (aligner sur une face) |
| AX06 Verrou, vue normale, affichage indépendants | Vérifié | `sandbox-axes.mjs` (Alt+Maj+4 / 5 / 6, F4 : chacun ne change que son état) ; `reperes.test.ts` (verrou : formes, Ligne, loin de l'origine) |
| AX07 Précédent ≠ Annuler | Vérifié | `reperes.test.ts` (historique de contextes, outil Axes sans pas de géométrie) ; `sandbox-axes.mjs` (Alt+Maj+7, Ctrl+Z, Ctrl+Y) |
| AX08 Enregistrer, renommer, relire après redémarrage | Vérifié | `reperes-enregistres.test.ts` ; `sandbox-reperes.mjs` (Modifié, mise à jour, renommer, dupliquer, rechargement identique) |
| AX09 Document ancien (un repère ou aucun) | Vérifié (modèle) | `reperes.test.ts` (migration, lecture, repère malformé ignoré sans exception, delta) ; pas de recette navigateur injectant un document ancien |
| AX10 Origine avec occurrences sœurs | Vérifié | `origine-composant.test.ts` (27 ancrages, 3 occurrences, monde immobile) ; `sandbox-origine.mjs` (portée annoncée, un pas, Annuler) |
| AX11 Imbriqués, miroirs, échelles | Vérifié | `origine-composant.test.ts` (groupe tourné, parent partagé et chemin, échelle uniforme ; miroir, biais, étirement, « cette occurrence » sous parent partagé refusés) |
| AX12 Annuler un lot | Vérifié | `origine-composant.test.ts` (écartés, définition traitée une fois) ; `sandbox-origine.mjs` (lot en un pas, un seul Annuler) |
| AX13 Face d'un repère lié modifiée ou supprimée | Vérifié | `axes-phase-d.test.ts` ; `sandbox-reperes-lies.mjs` (périmé, mise à jour explicite, manquant sans substitution, détacher) |
| AX14 Rappel d'une scène avec et sans option | Vérifié | `reperes-enregistres.test.ts` ; `sandbox-reperes.mjs` |
| AX15 Deux utilisateurs, rejeu hors ligne | **Sans objet** | Sandbox local et mono-utilisateur, aucune persistance partagée (AX-D9) ; le contexte de travail est personnel par construction |
| AX16 Exports modèle / travail / source | Vérifié | `axes-phase-d.test.ts` (unité source rétablie, refus IFC et imports multiples) ; `sandbox-reperes-lies.mjs` (OBJ modèle et repère de travail, en-tête et message explicites) |
| AX17 Clavier, tactile, lecteur d'écran, écran étroit | Vérifié (partiel déclaré) | `sandbox-axes.mjs` (raccourcis, Échap rend le focus, raccourci ignoré dans un champ, noms accessibles, téléphone sans débordement) ; ligne d'état `aria-live` ; aucun essai avec un lecteur d'écran réel |
| AX18 Sandbox et Studio cohérents, frontières tenues | Vérifié | `independance.test.ts` (« Axes — frontières ») ; le Studio n'a pas d'outil de dessin 3D (AX-D2) |
| AX19 Dessin 2D indépendant et vue liée | Vérifié | `independance.test.ts` (planche2d sans contexte de travail ni import du Sandbox) ; aucune vue liée 2D ↔ 3D n'existe dans le Sandbox |
| AX20 Axes près des limites et grandes coordonnées | Vérifié (partiel déclaré) | `reperes.test.ts` (1e-6 m à 1e7 m, conversions aller-retour) ; verrou à 1e7 m ; le découpage des axes de dessin au bord de la vue n'a pas de test dédié |

Aucun scénario n'est déclaré accepté par le maître d'ouvrage : cette recette consigne les preuves ; l'acceptation reste
une décision distincte.
