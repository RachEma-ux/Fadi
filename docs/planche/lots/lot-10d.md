# Lot Planche 10d — Révolution — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-213 ; programme `docs/planche/analyses/programme-lots.md`
(L10, découpage D-211 ; l'ancien L15 est absorbé) ; cahier V1, B3 (EX-RV-01 à 04 ; cas R-01 à R-04).

## Livré

- **Méthode nommée de Suivez-moi (EX-RV-01).**
  - Suivez-moi a une option **Méthode** : Chemin (par défaut) ou Révolution. Alt frappé seul fait basculer de l'une à
    l'autre.
  - Il n'y a pas de quatrième outil principal ni de lettre de raccourci de plus : Suivez-moi garde son icône ↬, ses barres
    et Maj+F.
  - Les options ont leurs touches de modification frappées seules (lot 9) : Alt pour Méthode, Ctrl pour Capuchons, Maj
    pour « Résultat en nouveau groupe ».
- **Axe.**
  - Une arête présélectionnée seule sert d'axe ; sinon, on clique deux points, avec accrochage aux sommets, arêtes et
    axes, et l'axe s'affiche en pointillé.
  - Un axe nul est refusé.
  - Après la validation, l'arête-axe reste sélectionnée pour le profil suivant.
- **Noyau `revolution` (EX-RV-02 à 04).**
  - Angle de −360° à +360°, zéro exclu ; +360° par défaut.
  - Segments par tour complet : un entier de 12 à 512, 48 par défaut.
  - Un tour partiel prend `max(1, ⌈N × |angle| / 360°⌉)` segments, et le dernier anneau tombe exactement sur l'angle
    demandé.
  - Tour complet : la couture est soudée, sans coiffe ni sommet en double (R-01).
  - Tour partiel : des coiffes de début et de fin, trous compris, ou une surface ouverte sans coiffes (R-02).
  - Profil qui touche l'axe : les sommets posés sur l'axe deviennent des pôles partagés, sans aucune face d'aire nulle.
    Une matière qui traverse l'axe est refusée (R-03).
  - Le profil doit avoir l'axe dans son plan.
  - Les parties valides du balayage sont réutilisées : refus des trous jointifs, consommation du profil, insertion
    collante et orientation décidée sur la coque extérieure.
  - Le noyau ne passe pas par un chemin polygonal générique : chaque anneau est la rotation exacte du profil.
- **Aperçu et validation.**
  - Au survol, le profil est tourné sur un modèle candidat ; la consigne annonce le nombre de segments posés et l'écart
    de facettage estimé, `r (1 − cos π/N)`.
  - Le clic valide le même calcul.
- **Correction depuis la recette (EX-RV-04, R-04).**
  - Après la validation, le champ Mesures (« Angle / segments ») prend un angle (`90`) ou des segments par tour (`96s`).
  - L'opération est recalculée depuis le modèle d'avant et le profil d'origine, jamais depuis le résultat précédent. Le
    dernier pas d'historique est remplacé.
  - Les options ne créent jamais de pas d'historique : elles valent pour la suite.
- **Correctif de robustesse du noyau.** `echantillon2`, qui choisit le point intérieur d'une région, prenait pour
  distinctes deux ordonnées égales au bruit flottant près. Le point tombait alors sur le bord, et la face source n'était
  pas reconnue : des parois de révolution manquaient. Les ordonnées sont maintenant regroupées à 1e-9 près, et un test de
  régression couvre trois décalages et trois résolutions.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `revolution-l10d.test.ts` (10) : R-01 à R-04, cavité tournée, domaines refusés, régression de l'échantillonnage | verts |
| `outils/revolution-outil.test.ts` (7) : méthode et Alt seul, axe présélectionné ou cliqué, aperçu, corrections 90 / 96s, groupe, coiffes, refus | verts |
| Recette `planche-revolution.mjs` (nouvelle, ajoutée à la CI) : Maj+F puis Alt, aperçu 192 faces, tour complet, 90, 96s | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- Profil troué en tour complet : le résultat a deux coques fermées, la matière et la cavité. `volume` (une seule coque)
  ne le mesure pas ; le test le vérifie par le volume signé et l'étanchéité.
- La correction par le champ Mesures n'est possible que tant que le modèle n'a pas changé depuis la validation. Les
  options ne corrigent pas l'opération déjà faite.
- Les consignes et les messages d'erreur du noyau restent en français, comme ceux des lots précédents. Les codes de
  diagnostic bilingues sont prévus au lot L19.
