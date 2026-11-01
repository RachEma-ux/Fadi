# Axes et repères — évaluation du plan de mise en œuvre du concept

Mis à jour : 2026-10-25 (UTC). Concept évalué : `Fadi Concept/Fadi Concept - Axes.md` et `.docx`, version 1.0
(23 octobre 2026, contenu identique), contre le code de `main@0ff0638`.

## 1. Ce que le concept apporte

- Une séparation nette de sept notions (repère du modèle, repère de travail, plan de travail, repère de composant,
  caméra, référence géographique, trame structurelle) et sept invariants vérifiables (§ 3.2). C'est la partie la plus
  solide : elle se traduit directement en tests.
- Un catalogue de 13 commandes (§ 4.2) cohérent avec la règle d'or (icône, barre, nom accessible, raccourci).
- 20 scénarios d'acceptation (AX01–AX20) et un découpage en quatre phases A–D avec critères de sortie.
- Trois risques relevés dans le code, que la lecture confirme :
  1. `repereDepuis` (`outils/axes.ts`) remplace une direction Y colinéaire par `Z × X` puis `X × X`, sans le dire (AX02) ;
  2. `viserLibre` (`outils/commun-formes.ts`) renvoie la normale **Z du monde** hors face survolée, même quand le repère
     de travail est incliné : un rectangle dessiné « dans le repère » tombe sur un plan horizontal (AX05) ;
  3. `axesDuPlan` construit les axes du plan depuis X / Y du monde, et l'affichage des axes (`majAxes`) suit le repère
     sans limite propre (AX20).
- Deux constats supplémentaires : la commande de menu « Aligner les axes » (`Planche.tsx`) construit X depuis le côté
  `u` de la face sans contrôle de colinéarité ; « Changer les axes » existe dans le menu contextuel mais est grisé.

## 2. Évaluation du plan A–D du concept

| Critère | Évaluation |
| --- | --- |
| Ordre des phases | **Bon.** Fondation → réutilisation → composants → associations : chaque phase dépend de la précédente. |
| Taille de la phase A | **Trop grosse pour un seul lot.** Elle mêle le modèle pur (validation, plans, historique) et toute l'interface (barre, inspecteur, accessibilité). Un échec d'interface bloquerait la correction des trois risques. → scindée en AX-1 (modèle) et AX-2 (interface). |
| Correction des risques | **Absente comme étape explicite.** Les trois risques sont cités mais ne sont rattachés à aucune phase. → corrigés dans AX-1, en premier, avec tests de non-régression. |
| Contexte de travail et Annuler | **Bien posé (AX07) mais sans décision de stockage.** Le code actuel range le repère dans le document et le fait défaire par Annuler. → AX-D3 : contexte personnel hors historique, mémorisé localement. |
| Raccourcis | **Non résolu** (« à vérifier contre le registre »). Le registre n'a plus aucune combinaison Alt + Maj + lettre libre. → AX-D6 : Alt + Maj + chiffre (touche physique), F4, Maj + F4. |
| Portée Studio / Sandbox (AX18) | **Ambigu.** Le concept demande « des outils équivalents » dans le Studio, qui n'a pas d'outil de dessin 3D. → AX-D2 : barre dans le Sandbox seul ; AX18 et AX19 vérifiés comme frontières et indépendance. |
| Collaboration (AX15) | **Inapplicable au Sandbox**, local et mono-utilisateur. → AX-D9 : sans objet, déclaré. |
| Mode Lié | **Bien placé en phase D**, mais exige une identité topologique que le Sandbox n'a pas au-delà de l'identifiant de face. → AX-D7 : lien par identifiant + instantané de contrôle ; santé explicite, aucune réparation devinée. |
| Composants miroirs / biais | **Laissé ouvert** (§ 13). → AX-D8 : refus explicite. |
| Exports (AX16) | **Sous-spécifié** (« selon l'exportateur »). → AX-D10 : OBJ / STL / IFC, modèle ou repère de travail ; coordonnées d'origine seulement si l'import les a consignées. |
| Preuves | **Bon** : une Issue, une revue, des preuves par phase. Retenu tel quel (un compte rendu par lot, CI verte). |

## 3. Verdict

Le concept est solide sur les notions, les invariants et les scénarios ; son plan est juste dans l'ordre mais
incomplet sur quatre points (risques non planifiés, stockage du contexte, raccourcis, portée Studio) et trop gros en
phase A. Le plan propre (`PLAN.md`) garde ses phases et ses scénarios, scinde A en deux lots, place la correction des
risques en tête et tranche les points ouverts (AX-D2 à AX-D10).
