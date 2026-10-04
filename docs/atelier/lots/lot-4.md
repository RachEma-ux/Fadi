# Lot 4 — Bascule : un seul Atelier, sur le modèle typé — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010).

Ouvrir : n'importe quel projet, `?module=atelier`, ou les étapes 10 et 11 du Parcours. Il n'y a plus de paramètre
`version=nouveau` : le nouvel Atelier est le seul.

## Fait

| Tâche | Résultat |
| --- | --- |
| L4.1 | **Consommateurs rebranchés sur la projection du modèle typé** (`apps/api/src/lib/model-context.ts` : `loadModelDomains` = `chargerModele` + `projeterPourAnalyse` → niveaux, plancher, parcelle, emprise) : analyse du modèle, propositions Harmonie localisées des étapes 10 / 11, bilan du bâtiment conçu, contexte de site, aperçu conceptuel, liens Programme ↔ locaux, documents et leur fraîcheur, journal de la Collaboration (lit désormais `atelier_commands`). **Transmission de la parcelle en commandes** (`commandesParcelleNative` dans `atelier-model/import/natif.ts`, appliquées côté serveur par `appliquerCommandesInternes` dans une transaction, journalisées « Parcelle transmise depuis l'étape 01 » ; même contrôle d'emprise qu'avant). **Archive version 2** (`domain-model/archive.ts`) : le modèle typé complet, revalidé à l'import (`atelier-model/archive.ts` → `verifierModele`, refus 422 `archive_model` avec la liste des erreurs) ; les archives version 1 restent lisibles et leur magasin V14 passe par l'importeur à sens unique (D-015). **Exemple P.118** importé directement dans le modèle typé (`exampleNativeModel` → importeur). Exports de travail purs ajoutés au modèle : DXF R12 d'un niveau en repère local, origine cadastrale en commentaire (`echanges/plan.ts`, R5), CSV des quantités. |
| L4.2 | `AtelierNouveau` est le module `atelier` et l'Atelier des étapes 10 / 11 (`ProjectShell.tsx`, `ParcoursModule.tsx`) ; bouton « Harmonie » de la barre à l'étape 10 (sous-page « Harmonie du bâtiment » inchangée). **Supprimé** (section 5.5 du cahier) : `apps/web/public/atelier-native/`, `apps/web/src/modules/atelier/native/`, `NativeAtelier.tsx`, `scripts/extract-native-atelier.mjs`, `core-geometry/project-repository.ts` (`V14Bridge`), `routes/atelier.ts`, `lib/atelier-store.ts`, `lib/native-projection.ts`, routes `levels`, tables `atelier_store`, `levels`, `architectural_objects`. **Migration de bascule** `apps/api/src/db/bascule.ts` (D-015) : 447 projets de la base de développement repris sans perte, chacun journalisé. Référence protégée conservée dans le nouvel Atelier : la première modification validée crée la copie de travail (« … — copie de travail · Atelier »), y applique le lot et y bascule l'écran. File locale du client (Dexie v4 : `lots`, `modelCache`) branchée sur l'indicateur de synchronisation et le bandeau des conflits de l'en-tête (« Garder le serveur » / « Réappliquer sur la version courante ») ; ouverture hors ligne depuis le cache local. Barre d'état : lecture seule, hors-ligne avec le nombre de modifications en attente, serveur injoignable, conflit, cache, « Enregistré · rN ». Menu « Exporter » : DXF du niveau, SVG du plan, CSV des quantités, modèle JSON, PNG de la vue 3D — téléchargés **et** inscrits au catalogue des documents avec niveau, vue et révision. Navigateur : rubrique « Site » (CRS, aire de la parcelle, origine locale). `module-registry.ts`, `modules/atelier/README.md`, `docs/migration/matrix.md` §3 et les fiches d'étape 10 / 11 réécrits. |
| L4.3 | Scénario d'acceptation `apps/web/e2e/parcours-scenario.mjs` réécrit pour le nouvel Atelier (blocs 6b et 6k, étapes 10 / 11, accessibilité, clavier, téléphone, lecteur, bibliothèque) : copie de travail créée par le premier mur sur la référence, dessin / annuler / rétablir persistés avec révisions successives, second appareil à la même révision, rechargement, 6 niveaux × 3 présentations 3D, plan / 2 coupes / 4 façades, mur tracé sur la mezzanine, hauteur modifiée à l'inspecteur, pousser / tirer en 3D, annuler / rétablir de la hauteur, réouverture sur un troisième appareil, exports DXF / SVG / CSV / PNG au catalogue à la révision courante, tableau des surfaces à la même révision ; hors ligne : lots en IndexedDB, conflit provoqué depuis un autre appareil puis tranché, API coupée puis rétablie, ouverture depuis le cache. Recette dédiée `apps/web/e2e/atelier-nouveau.mjs` mise à jour (référence protégée, rubrique Site, catalogue des exports). Captures `docs/migration/captures/webapp/` régénérées. |
| L4.4 | `scripts/verify-restore.sh` : tables et empreintes du modèle typé (`atelier_site`, `atelier_niveaux`, `atelier_objets`, `atelier_commands`…) à la place de l'ancien magasin. `docs/architecture.md` (« Code reuse », « Where this repository stands », synchronisation) mis à jour. Image Docker : rien à changer (le `Dockerfile` ne référençait pas l'ancien moteur) ; sondée par la CI (job « image »). |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 93, **atelier-model 46** — archive typée
  aller-retour sur P.118, refus d'un modèle invalide, commandes de parcelle, exports DXF / CSV, ordre natif des
  locaux — API 66 dont la bascule d'un ancien magasin et l'archive v2, web 20) · `npm run build` ✅.
- Scénario complet `apps/web/e2e/parcours-scenario.mjs` : **326 contrôles verts, « Scénario conforme. »**, aucune
  erreur JavaScript. Recette `apps/web/e2e/atelier-nouveau.mjs` : 41 contrôles verts.
- `scripts/verify-restore.sh` sur la base de développement (après bascule) : comptes de lignes et empreintes des
  étapes, des objets du modèle typé et du journal identiques après restauration ✅ (le rôle de la base a dû être
  rendu superutilisateur le temps du contrôle pour recréer PostGIS dans la base restaurée, puis remis en l'état).
- `⏱` (Chromium headless, cette machine) : ouverture de l'Atelier sur le P.118 typé → plan affiché 0,78 s
  (recette dédiée, premier chargement : 1,5 s) ; rechargement → plan 0,73 s ; annulation d'un mur → enregistrée
  0,53 s ; import de l'exemple → vue d'ensemble 2,5 s ; passage en 3D → première image 2,0 s.
- CI (validate, e2e, image) verte sur `a47db68`, après deux corrections découvertes par le pipeline : scripts racine
  `db:migrate` / `build` / `dev:api` rétablis (une substitution du lot 3 y avait ajouté l'espace de travail web) et
  fichiers de test de l'API exécutés l'un après l'autre (remise à zéro de la base partagée).

## Défauts corrigés pendant la bascule

- **Indicateur de joignabilité** : `reachability.get()` renvoie la chaîne `"reachable"` / `"unreachable"`, le bus la comparait à un booléen — un serveur injoignable n'était jamais signalé comme tel. Comparaisons corrigées.
- **Vue 3D** : le niveau actif recopié dans un état local pouvait rester l'ancien après un changement rapide ; il est lu dans l'état d'affichage partagé.
- **Saisie de précision** : le « ; » (séparateur dx ; dy) n'était pas capté et deux frappes rapides pouvaient se perdre ; référence mutable et liste de touches corrigées.
- **Échap dans un champ de l'inspecteur** rendait la frappe suivante au champ : Échap quitte désormais le champ, les raccourcis de l'Atelier reprennent.
- **Ordre des fiches d'espaces et des tableaux** : la projection d'analyse listait les objets par identifiant, pas
  dans l'ordre de l'exemple (première fiche de l'étape 07 différente de la référence). L'importeur conserve
  désormais le rang de chaque objet dans le jeu natif (`natif:rang`) et la projection le suit ; un objet créé
  ensuite vient après (test : même ordre des 74 locaux que l'analyse du jeu natif).
- **Lecteur sur un projet sans modèle** : l'accueil vide disait seulement « rien à afficher » ; il dit maintenant
  que le projet est partagé en lecture et qu'aucun niveau ne peut y être créé.
- **Bilan du bâtiment à l'étape 10** : « Lire le bilan du bâtiment conçu » cliqué avant l'arrivée du bilan (serveur chargé) laissait le pli fermé ; la demande est traitée dès que le bilan est là.

## `git grep` d'acceptation

`V14Bridge`, `design.v13`, `atelier_store`, `atelier-native` ne subsistent que dans des emplacements documentés,
sans code de l'ancien moteur :

- lecture des archives version 1 (`domain-model/archive.ts`, ses tests) et importeur à sens unique
  (`atelier-model/import/natif.ts`), qui doivent nommer l'ancien format pour le lire (D-015) ;
- migration de bascule et son test (`db/bascule.ts`, `routes/atelier-commands.test.ts`), commentaire de `init.sql` ;
- extraction des données du prototype (`apps/api/scripts/extract-prototype-data.mjs`), inventaire du prototype
  (`docs/migration/reference.md`) et documents de cadrage (`docs/atelier-cahier-des-charges.md`,
  `docs/atelier-drawall.md`, `docs/architecture.md` — historique de `V14Bridge`).

## Non fait / reporté

- **Protection serveur de la référence** : la copie automatique est faite par l'interface ; une commande envoyée
  directement à l'API sur la référence est acceptée (D-016, à décider avec le maître d'ouvrage).
- **Ensoleillement du bilan** : non évalué depuis la bascule (D-016).
- Fiches de capacité : restent « prototype » ; le passage à « vérifiée » attend l'acceptation du maître d'ouvrage.
- Reportés du lot 3b, repris au lot 5 : remplissage des coupes, jonctions de murs, lasso, toitures en pente,
  manipulateur 3D à poignées. WebGPU toujours non testé (pas d'adaptateur dans le bac à sable).
