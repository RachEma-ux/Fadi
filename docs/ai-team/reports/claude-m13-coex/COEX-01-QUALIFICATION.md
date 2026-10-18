# COEX-01 — qualification proposée des composants de l'Atelier pour la coexistence avec Studio

**Tâche :** COEX-01, checklist ligne 193 : « Qualifier chaque composant Atelier : conserver, compléter, corriger, isoler, remplacer ou retirer, avec preuve et décision. » Sources : Plan §3.3 et §8.2.
**Commit lu :** `main@817bd36e7d4b1ab60ab9c00309509c7cdfed0798`. **Exécutant :** Claude Code, hors équipe Codex ([annonce #166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250925570)).
**Nature :** la qualification est une **proposition étayée**. La **décision** qu'exige l'intitulé n'est pas prise ici ; elle est demandée dans #166. COEX-01 reste donc ouvert.

Données structurées : [`COEX-01-QUALIFICATION.json`](COEX-01-QUALIFICATION.json). Liens : `P` = `https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798`.

## Règles appliquées à la proposition

1. **Aucun « retirer » n'est proposé.** Tous les composants servent Fadi aujourd'hui, et AGENTS.md interdit de supprimer les capacités natives. Selon COEX-06 et MIG-COEX-07, un retrait sera toujours un lot ultérieur, autorisé explicitement.
2. **« Remplacer » n'est proposé que si une décision le permet déjà.** Ce n'est le cas d'aucun composant au 18 octobre : DEC-01 et DEC-03 orientent le travail sans arrêter les contrats physiques.
3. **« Isoler »** veut dire : le composant reste intact dans l'Atelier, mais Studio ne l'embarque pas. Studio passe par une interface publique, ou ne l'utilise pas du tout (ARC-09, ARC-10 : pas d'iframe).
4. Chaque ligne cite sa preuve : un fichier au `817bd36`, les observations OBS de [REP-09](../claude-m13-rep/REP-09-REQUALIFICATION.md) ou les constats de [REP-02 à REP-08](../claude-m13-rep/REP-02-08-CONSTATS.md).

## Tableau de qualification (22 composants)

| # | Composant (chemin au `817bd36`) | Taille / tests | Qualification proposée | Motif et preuve | Condition, lot ou décision |
|---|---|---|---|---|---|
| C01 | Bus client `apps/web/src/modules/atelier/bus/` (`atelier-client.ts`, `etat-projet.ts`) | 599 lignes | **Conserver**, réutiliser par interface | Chemin client unique vers le service de commandes : file locale, rejeu (`packages/atelier-model/src/sync.ts`). Studio doit passer par le même bus (RISK-07, R9). | ARC-07 et ARC-DATA-05 : enveloppe enrichie du contexte étude / variante (DEC-03) |
| C02 | Enveloppe `nouveau/AtelierNouveau.tsx` | 946 lignes | **Isoler** | Point d'entrée de l'Atelier actuel. Studio ne l'embarque pas (ARC-10, Plan §3.1). | ADR-STUDIO-NAV-01 |
| C03 | Plan 2D `nouveau/plan2d/` (`Plan2D.tsx`, `rendu.tsx`, `accrochage.ts`…) | 3 360 lignes ; aucun test propre, tests dans `nouveau.test.ts` | **Compléter** | OBS-01 : SVG React ; OBS-02 : accrochage sans index spatial. C'est le candidat au document 2D autonome, sous l'orientation DEC-01. | DEC-08, DEC-09, lot C ; non-régression d'accrochage |
| C04 | Vue 3D `nouveau/vue3d/scene3d.ts` | 1 931 lignes ; **0 test** | **Compléter** | OBS-03 et OBS-04 : WebGL2 avec WebGPU en option, reconstruction complète à chaque état. Aucun test ne couvre le fichier. | DEC-10, lot C ; tests à créer avant toute optimisation |
| C05 | Planche `nouveau/planche/` | 7 882 lignes, 8 fichiers de test | **Conserver** + **corriger** (documentation) | OBS-05 : candidat Planche 3D. OBS-09 : historique local et commande `planche.operation`. L'en-tête `historique.ts:4` est périmé. | Contrat d'historique hybride (lot A) ; correction du commentaire dans un lot autorisé |
| C06 | Noyau exact client `nouveau/exact/` | 285 lignes, 1 test | **Corriger** | OBS-07 : après une erreur, le worker n'est jamais recréé dans la session, et aucune demande n'a de délai d'attente. | Lot D (résilience), TEST-014, TEST-015 et TEST-037 |
| C07 | Génération documentaire `nouveau/documents/` | 1 020 lignes ; tests dans `atelier-model/src/documents` | **Compléter** | OBS-08 : worker dédié avec repli sur le fil principal, modèle entier copié à chaque demande, aucune annulation. | Lot D et lot E |
| C08 | Panneaux `nouveau/panneaux/` (32 fichiers) | 9 177 lignes, 1 test | **Isoler** (réutilisation cas par cas) | Interface propre à l'Atelier (barre D-195, réglages, versions…). Plan §3.3 : « la réutilisation d'une fonction ne signifie pas recopier l'ensemble du module ». | ARC-04 ; chaque reprise justifiée par une fiche |
| C09 | Palette `nouveau/outils.ts` | 182 lignes | **Corriger** | OBS-11 : 111 entrées pour 110 identifiants. La collision `echelle` (lignes 84 et 120) masque la première entrée dans `OUTILS_PAR_ID`. | Lot B (registre) ; correction de code à autoriser |
| C10 | État d'interface, navigation, raccourcis, actions (`nouveau/etat-ui.ts`, `navigation*.ts`, `raccourcis.ts`, `actions.ts`, `messages.ts`) | ≈ 1 900 lignes | **Isoler** | Propres à l'ergonomie de l'Atelier. La règle d'or de la Planche (icône, barre, raccourci) s'applique à ses outils. | Le registre Studio (lot B) définit les siens |
| C11 | Revue de conception et Harmonie (`DesignReview.tsx`, `AtelierHarmonyPage.tsx`) | 772 lignes | **Conserver** (hors Studio) | AGENTS.md : Harmonie est intégrée aux étapes. Studio ne la duplique pas. | Aucune |
| C12 | Mode immersif `apps/web/src/lib/use-immersive.ts` | 18 lignes | **Isoler** (ne pas réutiliser) | REP-05 : drapeau global qui masque la barre latérale (NAV-008). La PR #142, ouverte, le transforme. | Lecture de #142 si elle est fusionnée |
| C13 | Paquet `packages/atelier-model` | 129 sources, 106 tests | **Conserver** + **compléter** | Modèle canonique, réducteurs purs et commandes, partagés entre navigateur et serveur (R9). Les identités Étude / Variante / Révision sont à ajouter selon l'orientation DEC-03. | DEC-01, DEC-02, DEC-03 (contrats physiques ouverts) |
| C14 | Paquet `packages/planche-model` | 64 sources, 61 tests | **Conserver** + **compléter** | OBS-06 : six registres importés statiquement, ce qui empêche un chargement sélectif. Le catalogue compte 52 outils. | DEC-05, DEC-06, DEC-07, lot B.3 |
| C15 | Paquet `packages/geometry-exact` | 1 source, 1 test | **Conserver** | Seul point d'entrée d'`occt-wasm`, sous la frontière LGPL D-177. 22 tests réussis ([REP-09](../claude-m13-rep/REP-09-REQUALIFICATION.md)). | DEC-18 (licences et frontières) |
| C16 | Paquets `core-geometry` et `domain-model` | 23 sources, 17 tests | **Conserver** | Géométrie et repères purs, et distinction exigence / hypothèse / recommandation (AGENTS.md). | Aucune |
| C17 | Service de commandes `apps/api/src/routes/atelier-commands.ts` | — | **Conserver** + **compléter** | Seul écrivain du modèle (R9, [P/…/atelier-modele.ts#L5-L6](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/lib/atelier-modele.ts#L5-L6)). Il impose la révision de base (409), l'idempotence et le journal ([#L1-L12](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/routes/atelier-commands.ts#L1-L12)). | ARC-DATA-05 à ARC-DATA-07 |
| C18 | Persistance du modèle `apps/api/src/lib/atelier-modele.ts` et tables `atelier_*` | 9 tables ([schema.ts#L310-L445](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/db/schema.ts#L310-L445)) | **Conserver** | Écriture par différentiel, appelée seulement par le service de commandes et les imports contrôlés. | DEC-01 et DEC-03 : correspondance avec le stockage Studio |
| C19 | Versions, variantes, publications et verrous `routes/atelier-versions.ts`, `lib/atelier-versions.ts` | tables [L486-L572](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/db/schema.ts#L486-L572) | **Conserver** + **correspondance explicite** | Une variante actuelle est un **projet** bifurqué (`atelier_variants.project_id` / `parent_id`, [L499-L515](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/db/schema.ts#L499-L515)). Ce n'est pas la Variante Studio de DEC-03. Une correspondance explicite est requise, sans migration silencieuse. | DEC-03, MIG-COEX-02 |
| C20 | Automatisation `routes/atelier-automatisation.ts` (scripts, propositions, graphes) | tables [L574-L600](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/db/schema.ts#L574-L605) | **Conserver** | Elle passe déjà par la boucle contrôlée et les mêmes commandes (R9). Studio ne crée pas de seconde boucle. | RISK-07 |
| C21 | File locale `apps/web/src/lib/local-store.ts` (Dexie `fadi-local` v4 : `lots`, `modelCache`, `keyValue`) | [#L58-L64](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/lib/local-store.ts#L58-L64) | **Conserver** | Elle contient les commandes hors ligne en attente. MIG-COEX-04 interdit de les supprimer avant bascule. | MIG-COEX-04, TEST-036 |
| C22 | Précache du service worker `apps/web/vite.config.ts` et `public/sw.js` | 0 test | **Compléter** | OBS-10 : tous les morceaux du build sont précachés, y compris ceux chargés à la demande. | DEC-07, lot B.3, TEST-016 |

Bilan :

| Qualification | Nombre | Composants |
|---|---|---|
| Conserver (avec ou sans complément) | 12 | C01, C05, C11, C13 à C21 |
| Compléter seul | 4 | C03, C04, C07, C22 |
| Corriger | 2 | C06, C09 |
| Isoler | 4 | C02, C08, C10, C12 |
| Remplacer | 0 | — |
| Retirer | 0 | — |

Total : 12 + 4 + 2 + 4 = 22. C05 est compté dans « conserver » ; sa correction de commentaire n'est pas comptée une seconde fois.

## Ce qui reste à décider (question publiée dans #166)

- Valider ou modifier chaque qualification.
- Confirmer qu'aucun « remplacer » ni « retirer » n'est engagé avant DEC-01, DEC-03 et G3.
- Désigner le responsable de chaque « corriger » (C05, C06, C09) : ce sont des lots de code distincts, à autoriser un par un.

## Limites

- Cette qualification se fait **par répertoire ou par fichier principal**, pas par fonction. Une reprise effective dans Studio exige une fiche par fonction (règle C de M12).
- Les comptes de lignes et de tests sont statiques (`wc`, `find`). Aucun test n'a été exécuté pour COEX-01. Les 198 tests de REP-09 restent la seule exécution associée.
