# Équipe B1 — catalogue d'outils et profils du Studio (B.1-01..06, B.2-01..08)

Vague 8, 19/10/2026. Base : `3716e06` (`main` après #199). Le statut « Vérifié » de chaque ligne cite son essai ; aucune
ligne n'est « Acceptée ».

## 1. Inventaire des catalogues au commit de réalisation (B.1-01)

| Catalogue | Source | Entrées | Identifiants | Remarque |
|---|---|---|---|---|
| Registre Studio | `packages/atelier-model/src/studio/registry.ts` (`STUDIO_TOOLS`) | 38 | 38 | source unique des libellés, icônes, raccourcis, barres et schémas ; figé par la caractérisation |
| Commandes de l'éditeur Studio | `apps/web/src/modules/studio/planche2d/raccourcis.ts` (`COMMANDES_EDITEUR`) | 35 | 35 | hors registre, jamais envoyées au serveur telles quelles |
| Catalogue de la Planche | `packages/planche-model/src/catalogue-outils.ts` (`OUTILS`) | 52 | 52 | 47 littérales + 5 solides générés (REP-09) |
| Palette de l'Atelier | `apps/web/src/modules/atelier/nouveau/outils.ts` (`OUTILS`) | 111 | 111 | 110 identifiants avant 1a6f9b5 (#173) |

Réconciliation : la table d'alias du manifeste (`STUDIO_ALIAS_OUTILS`) ne relie que les capacités **de même nature** —
11 équivalences Planche, 17 Atelier, plus `echelle-acces` (hors Studio). Les autres entrées Planche / Atelier n'ont pas
d'équivalent Studio (Pousser / tirer, Rapporteur, Retourner, ontologies, etc.) et ne sont pas converties vers un outil
voisin. Les raccourcis des trois catalogues restent des contrats distincts (ex. Rotation : Q en Planche, Maj+R en
Studio) : aucun n'est modifié. Preuve : `apps/web/src/lib/inventaire-catalogues-outils.test.ts` (unicité dans chaque
catalogue, chaque alias « courant » cite un identifiant présent dans sa source).

## 2. Collision historique « echelle » requalifiée (B.1-05)

Constat au commit `3716e06`, sans présumer qu'elle subsiste :

- **Atelier** : la collision a été corrigée par `1a6f9b5` (#173). `echelle-acces` = objet d'accès (famille *créer*,
  fiche DA-07-13) ; `echelle` = transformation (famille *modifier*, fiche DA-02-05). 111 entrées, 111 identifiants,
  `OUTILS_PAR_ID` les connaît toutes deux. **La collision ne subsiste pas.**
- **Planche** : un seul `echelle` (Scale, S). Pas de collision.
- **Studio** : un seul outil d'échelle, `studio.dessin.echelle` (transformation, barre Modification, S). Aucun objet
  d'accès dans Studio. Pas de collision.
- **Reste** (limite déjà signalée par #173) : une référence enregistrée **avant** `1a6f9b5` sous `echelle` seul est
  ambiguë. `resoudreAliasOutil("echelle", { catalogue: "atelier", periode: "avant-1a6f9b5" })` rend `ambigu` avec les
  deux lectures, jamais un choix par défaut ; la fiche (`contexte` DA-07-13 / DA-02-05) lève l'ambiguïté. Aucune
  migration en base n'est faite (aucune préférence Studio n'a jamais porté d'identifiant Atelier).

Preuves : `manifeste-outils.test.ts` (« echelle » de l'Atelier, unicité Studio), `inventaire-catalogues-outils.test.ts`.

## 3. Manifeste versionné et registre des chargeurs (B.1-02, B.1-03, B.1-04, B.1-06)

`packages/atelier-model/src/studio/manifeste-outils.ts`, version `studio-tool-manifest/1`, au-dessus du registre (qui
n'est ni recopié ni modifié) :

- par `toolId` : propriétaire (module du modèle qui porte le contrat), contrat (version, nature, refus, essai à blanc,
  exposition aux agents), contextes (`planche-2d`, `vue-3d`, `feuille`), droit requis (`lecture` / `ecriture`),
  chargeur, prérequis ; `satisfies Record<StudioToolId, …>` interdit un outil oublié ;
- chargeurs : `planche-2d` (inclus), `vue-3d` (à la demande, `three`), `feuille` (inclus). L'état réel des moteurs reste
  à l'équipe chargée de `taches/` ;
- alias scopés et versionnés `{ catalogue, periode, idHistorique, contexte?, regle, toolId }` ; aucun identifiant Studio
  n'a été renommé depuis le premier registre (historique de `registre/` relu) : aucune entrée `renomme` ;
- `controlerManifesteOutils` : entrée manquante ou en double, chargeur inconnu ou circulaire, prérequis circulaire,
  contexte inconnu, droit incohérent avec la nature, alias qui masque un `toolId`, cible hors registre, doublon.
- commandes de l'éditeur : `MANIFESTE_COMMANDES` (contextes) dans `planche2d/catalogue.ts`, propriétaire
  `studio.editeur`, droit `ecriture` si la commande est indisponible en lecture seule.

Les préférences relues (serveur et interface) passent par `toolIdCanonique` ; chaque ligne écrite porte
`manifest_version`.

## 4. Manager et personnalisation (B.2)

| Tâche | Livré | Preuve |
|---|---|---|
| B.2-01 recherche et filtres | recherche existante + filtres barre, contexte, nature, regroupement, favoris, « Autorisés pour moi » (`filtrerCatalogue`) | `profils.test.ts` (filtres), `studio-catalogue.mjs` |
| B.2-02 favoris et regroupements | favoris existants ; regroupements personnels créés, composés, supprimés dans « Outils », enregistrés (colonne `groups`) | `profils.test.ts`, `studio-preferences.test.ts`, `studio-catalogue.mjs` |
| B.2-03 raccourcis | contrat existant inchangé : **aucun nouvel outil ni raccourci** ; `regle-or.test.ts` vert | `regle-or.test.ts` |
| B.2-04 profils | Standard, Métier (3), Personnel — existants | `profils.test.ts`, `studio-profils.mjs` |
| B.2-05 persistance | côté serveur par compte (`studio_tool_preferences`, colonnes additives `groups`, `manifest_version`) | `studio-catalogue.mjs` (relu après actualisation) |
| B.2-06 visibilité / disponibilité / droit | `variante/droits.ts` ; `GET …/studio/preferences/catalogue` (droit réel du serveur et motif) ; outil visible non autorisé = désactivé avec sa raison (barre, gestionnaire, palette) | `droits.test.ts`, `studio-catalogue.mjs` |
| B.2-07 profil sans effet sur géométrie, révision, droits | verdicts identiques pour tous les profils ; document et tête de révision inchangés | `droits.test.ts`, `studio-catalogue.mjs`, `studio-profils.mjs` |
| B.2-08 profil d'équipe | **option non implémentée** : aucun contrat retenu ; le serveur refuse tout profil hors `standard` / `personnel` / `metier:<id>` et tout champ de partage | `studio-preferences.test.ts` |

## 5. Choix conservateurs (à confirmer par le lead)

- **Table** : la persistance réutilise `studio_tool_preferences` (déjà par compte, déjà archivée) avec deux colonnes
  additives **facultatives** plutôt qu'une table `studio_tool_profiles` nouvelle : une ligne d'archive antérieure se
  relit sans elles (`jsonb_populate_recordset` → null), et l'inventaire des colonnes `jsonb` archivées est tenu
  (`STUDIO_JSON_FIELDS_WITHOUT_ACCOUNTS`).
- **PUT sans `groupes`** (client antérieur) : regroupements laissés tels quels, jamais effacés.
- **Profils métier** : listes inchangées (interface) ; aucun profil nouveau inventé.
- **Contextes** : déclarés d'après le code actuel (volume libre et visualisation agissent dans la vue 3D) ; aucune
  désactivation nouvelle selon la vue ouverte n'est introduite.
