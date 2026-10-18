# Mission 002 — A4 UX/UI : diagnostic et spécification proposée

Date : 18 octobre 2026. Périmètre : lecture statique et préparation, aucune modification applicative ou GitHub, aucun navigateur, aucun test avec écriture en base. Rapport de travail externe au dépôt. Le statut de cette spécification est **préparé, à valider** ; les critères ci-dessous ne sont pas des résultats exécutés.

## 1. Référence et limites

Code local examiné : `aadd083ca282ed7db8af31f0fb3724c861b5107f`, branche locale `work`. A0 doit rapprocher cette copie du `main` courant. Les constats de fichiers ci-dessous sont bornés à ce SHA ; la présence de cette branche n'établit pas une anomalie Cloud. `git status --porcelain` vide lors de l'examen.

Sources : AGENTS.md, CLAUDE.md, architecture, protocole de continuité, index des chantiers et quatre fichiers architecture-webapp ; charte Studio V2.1 extraite du DOCX, référentiel technique V1.0 extrait, plan Studio V1.0 et checklist (notamment UX-01..09, ROUTE, I, NAV et parcours). Le plan propose des routes et une position dans le rail : ce ne sont pas des décisions de réalisation acquises. Les dossiers Studio exécutables et `docs/workstreams/studio/` n'existent pas dans cette copie. A0/A1 consolident la qualification intégrale des 630 lignes ; ce rapport qualifie le périmètre UX/navigation et ses dépendances, pas toutes les capacités CAO.

La charte DOCX porte encore « Texte de référence à adopter ». La mission actuelle impose cependant autonomie, quatre domaines et deux planches ; conserver cette distinction entre exigences du mandat et ratification documentaire G0. La charte renvoie à un « Référentiel complet Concept V2 » tandis que le plan utilise STUDIO-RT-001 V1.0 : A0/A1 doivent figer les références sans dupliquer les autorités.

## 2. Diagnostic vérifié par lecture

| Élément | Constat / référence locale | Conséquence |
|---|---|---|
| Routage | `apps/web/src/App.tsx:39` : routes protégées sous AppShell ; aucun chemin Studio. | Une vraie enveloppe Studio reste à faire ; lien vers `?module=atelier` insuffisant. |
| Rail principal | `routes/AppShell.tsx:18` résout seulement `/projets/:projectId` et `/projets/:projectId/pilotage` ; navigation Accueil, Projets, Collaboration. | Ajouter un accès global et un résolveur partagé de contexte. |
| Modules | `routes/ProjectShell.tsx:71` choisit `?module=` parmi sept modules. Son chargement demande projet, étapes et aperçu. | Studio ne doit pas dépendre de ProjectShell. Préserver les sept modules et 21 étapes. |
| Immersion | `lib/use-immersive.ts:12` ajoute `atelier-immersive` ; `style.css:1720` masque rail, topbar, header projet et modules ; CSS accueil l'accompagne. | Ne pas appliquer ce hook automatiquement à Studio. Ne pas retirer l'ancien comportement dans ce mandat. |
| Bandeau partagé | `modules/accueil/HomeTopbar.tsx:25` reçoit projectId ; les requêtes étapes/programme s'activent dès projet accessible ; titre générique pour route inconnue. | Adapter le contexte/titre Studio ; séparer rattachement projet et requêtes méthodologiques inutiles. |
| Accessibilité existante | AppShell fournit lien d'évitement, labels, aria-expanded/current, navigation clavier du menu Projets, restitution de focus et fermeture à Échap. | Réutiliser ces conventions avec tests ; leur présence ne prouve pas une conformité WCAG globale. |
| Responsive | `modules/accueil/accueil.css:3` : rail 68 px / 272 px ; à <=700 px, rail 60 px et panneau déplié 240 px. Cibles courantes >=44 px et focus visible. | Conserver cohérence visuelle, vérifier la place utile dans la planche à 390 px. |
| FR/EN | `lib/i18n/index.ts:38` : changer de langue sauvegarde préférence puis recharge la page. AGENTS et D-163 imposent français source et dictionnaire anglais. | Un changement de langue pendant une édition est aussi une transition à protéger (NAV-007). Données/noms/documents ne sont pas traduits. |
| Capacités réutilisables | AtelierNouveau traite lecture seule, sauvegarde, conflits, menus/outils ; barres et raccourcis gouvernés par D-195/D-198/D-202. | Candidats à qualifier, pas preuve d'un Studio autonome. Règle icône propre + barre + raccourci conservée. |

### PR #142 : conflit de périmètre concret, pas changement fusionné

Lecture GitHub directe via `github_fetch_pr`, PR https://github.com/RachEma-ux/Fadi/pull/142 : **ouverte, non fusionnée**, `mergeable: false`, tête `0d9606059f383e993b4bc69d57700ff411856919`, base rapportée `3bcda9296eaa0a0376ca5d2279dd71f52a75184b`. Elle modifie ProjectShell, useImmersive et les styles pour conserver l'enveloppe Fadi, uniformiser neuf pages et adapter les gestes aux menus superposés. La recette 593/593 citée dans le corps vise `a383fa4555725b8643ffe8ea6ed91c8b65fd9fff`, pas une preuve exécutée sur la dernière tête. Aucun verdict CI actuel déduit ici. L'état actuel du code local conserve le masquage.

Décision à prendre : ordonner revue/revalidation de #142 séparément puis rebaser le futur lot I sur sa base décidée, ou cadrer explicitement sa coexistence. Ne pas réimplémenter son périmètre dans Studio et ne pas considérer sa fusion comme autorisée par Mission 002.

## 3. Spécification d'interaction proposée

### Accès, routes et contexte

Entrée exacte **Studio**, niveau global identique à Accueil/Projets ; position proposée après Projets. Rail déplié : icône et texte ; replié : icône, nom accessible Studio, infobulle. Toutes les routes Studio gardent cet état actif ; Projets et Collaboration ne sont pas faussement actifs.

Routes candidates du plan à arbitrer avec A2 : `/studio`, `/studio/projets/:projectId`, puis `/etudes/:studyId/variantes/:variantId` et `/revisions/:revisionId` dans cette hiérarchie. Définir un schéma URL versionné pour domaine, planche et vue ; ne pas coder un `...` littéral. Le dernier contexte n'est qu'une suggestion. L'URL demandée prime et tous les liens d'appartenance sont validés serveur avant affichage de contenu sensible.

Accueil Studio : choisir un projet autorisé, ouvrir/créer une étude, puis choisir/ouvrir une variante ; une étude peut être cadrée sans géométrie. Aucune géométrie avant une variante propriétaire, aucun projet fictif et aucune étape Parcours créée/validée implicitement. Le bandeau affiche Projet → Étude → Variante → Révision avec limites de droits et état de synchronisation ; l'historique consulté est identifié comme tel et non écrasé.

Quatre domaines : Dessin et modélisation ; BIM et coordination ; Visualisation, rendu et immersion ; Documentation, métrés et collaboration. Les deux planches **2D et 3D** sont dans le premier uniquement. Une vue plane dérivée n'est pas renommée Planche 2D autonome. Une feuille n'est pas une planche. Afficher clairement associé / référence liée / copie indépendante et l'actualité des dérivés.

### Desktop, tactile et plein écran

- Desktop : rail Fadi accessible, bandeau commun compact, contexte Studio, navigation des quatre domaines, puis outils/panneaux et planche ; aucun outil flottant ne masque la cible d'une commande sans qu'il soit déplaçable et atteignable au clavier.
- Mobile : même entrée dans le rail adaptatif ; accès tactile nommé aux actions et modificateurs ; domaines par liste/onglets défilant localement ; pas de débordement horizontal global. Panneaux en surcouche refermable avec focus restitué. Sous clavier virtuel/rotation, sortie et validation restent visibles et atteignables.
- Plein écran : action explicite, distincte d'« Isoler un objet ». Préserver contexte et un bouton **Quitter le plein écran** toujours visible. Échap dépile d'abord le geste/menu/panneau actif selon contrat ; quitter reste possible par bouton sans dépendre d'Échap ni du support Fullscreen API. Retour au mode normal sans perte de données/focus. Ne pas réutiliser le masquage automatique Atelier comme entrée implicite.
- Clavier : Tab/Shift+Tab suivent l'ordre visuel ; liens navigables par Entrée ; menus flèches/Home/End et Échap ; pas de raccourci de dessin capturé dans un champ texte ou boîte de dialogue. Afficher les raccourcis et fournir boutons tactiles équivalents. Le retour de route place le focus au titre du contenu, sauf restauration intentionnelle de contexte.

### États et transitions obligatoires

| État | Comportement proposé | Vérification discriminante |
|---|---|---|
| Aucun projet/étude | Choix explicite, créer seulement si droit ; retour Fadi disponible. | Aucune mutation de géométrie ni appel création implicite à l'ouverture. |
| Chargement | État `role=status`, contexte non validé non présenté comme acquis, commandes dépendantes inactives. | Navigation Fadi utilisable, pas de spinner sans action de sortie. |
| Accès refusé/révoqué | Message neutre sans nom/contenu caché, vider/masquer données sensibles selon contrat de cache, retour aux projets. | URL falsifiée et droits révoqués ne montrent pas le contenu du précédent contexte. |
| Lecture seule | État explicite, outils interdits avec motif ; consultation permise selon droits. | UI et appel direct produisent le refus attendu ; profil personnel n'élève pas les droits. |
| Erreur réseau/chunk/moteur | Erreur localisée avec Réessayer/Retour ; modèle canonique conservé ; jobs en attente résolus. | Erreur moteur ne bloque pas Accueil/Projets ni ne confirme une sauvegarde inexistante. |
| Hors ligne | Local / en attente serveur / synchronisé sont distincts ; outils absents du cache identifiés indisponibles. | Ni publication ni approbation prétendument confirmée sans serveur. |
| Geste/preview actif | Annuler/Terminer/Rester selon contrat ; aperçu non engagé signalé. | Changement de domaine ne transforme pas un aperçu en objet ni ne l'efface sans signal. |
| Sauvegarde locale/envoi | Statut durable local, pending serveur, succès confirmé ou conflit séparés. | Changer route/langue, retour historique et fermeture ne suppriment pas la file. |
| Conflit/refus | Montrer contexte base/courant, options autorisées de résolution ; pas de last-write-wins silencieux. | Deux sessions sur même mur ne perdent pas une modification. |
| Révision approuvée/publiée | Lecture historique identifiable ; nouvelle modification crée un état candidat distinct. | Dossier modifié bloqué sous l'ancienne approbation. |

Pour une transition avec travail en attente : proposer Rester, conserver localement/quitter si le contrat le garantit, ou sauvegarder puis quitter. Le comportement exact reste à décider avec A2/A5 ; aucun bouton « Enregistré » avant confirmation durable correspondante. `beforeunload` seul n'est pas une garantie de persistance, particulièrement sur mobile.

## 4. Recette NAV proposée — aucun scénario exécuté

Profil initial à ratifier : desktop 1920/1440/1024, tablette 768, téléphone 390 (portrait/paysage), rail replié/déplié, FR et EN, clavier et tactile, zoom 200 % ; compléter DEC-13 avec appareils physiques, versions et budgets. Cibles minimales proposées 44×44 px, cohérentes avec Fadi ; mesures de contraste et accessibilité à fixer selon politique approuvée, pas une conformité déjà acquise.

| ID | Critère mesurable proposé et preuve à produire | Dépendances |
|---|---|---|
| NAV-001 | Studio visible et nommé dans les deux rails et mobile ; une seule entrée active ; activation clavier/tactile ; snapshot arbre accessible + capture + DOM. | I.1/I.5, choix icône/position |
| NAV-002 | Ouvrir lien direct Studio sur projet sans historique Parcours ; aucune étape créée/validée, pas de redirection Atelier ; trace réseau et diff d'état des 21 étapes. | I.2, contexte A.1 |
| NAV-003 | Compte sans projet/étude : choix/création autorisée affichés ; géométrie impossible hors variante ; zéro objet orphelin. | A.1, API autorisations |
| NAV-004 | URL directe, rechargement, précédent/suivant : même contexte autorisé ; URL croisée/revocation refuse sans fuite. Conserver identifiants anonymisés et réponses. | Routes A2, A5 TEST-035 |
| NAV-005 | Quatre domaines présents ; deux éditeurs accessibles dans D1 seulement ; aucun 3D créé implicitement par parcours A et aucun dessin préalable exigé par B. | A.2/A.3/E |
| NAV-006 | Bandeau conforme à l'URL et données autorisées ; Projet/Étude/Variante/Révision exacts ; Projets inactif dans Studio ; IDs contrôlés aux changements rapides. | Résolveur commun, HomeTopbar |
| NAV-007 | Transitions route/domaine/planche/langue/retour et coupure à différents états : geste non engagé, commande pending, conflit ; reprise conserve exactement état ou choix explicite. | A.5/B/R, TEST-011/013/021/036 |
| NAV-008 | Échec de chunk, réseau et worker simulé : sortie/réessai accessibles ; rail visible hors plein écran explicite, sortie visible en plein écran ; pas de corruption/attente sans issue. | I.2/I.5/D, TEST-015 |
| NAV-009 | Recettes existantes adaptées à la base décidée : Accueil, Projets, 21 étapes/cartes mobiles, Atelier étapes 10/11, Collaboration, clavier et FR/EN ; comparer aux assertions métier conservées. | Base #142 arbitrée, A5 |

Chaque preuve : SHA/build, corpus et empreinte, navigateur/appareil/viewport, locale, droits, date/exécutant, résultat attendu/observé, journaux/captures et lien stable. Snapshot de bouton ou existence d'un test ne clôturent aucun critère. Tests futurs exclusivement sur corpus synthétique et base jetable autorisée.

## 5. MVP métier et limites de preuve

| Parcours | Contrat de sortie utile | Preuves requises |
|---|---|---|
| A — 2D indépendante | Dessiner, modifier, coter, annoter, enregistrer, fermer/réouvrir, composer feuille et publier sans modèle 3D. | TEST-001 complet, exactitude des cotes, données persistantes, manifeste ; publication dépend E. |
| B — 3D indépendante | Créer spatialement, modifier faces/volume, sauvegarder/réouvrir, générer vue/coupe sans esquisse 2D initiale. | TEST-002, sélection/undo/export cohérents, sémantique libre explicite. |
| C — Associée | Même objet 2D/3D, hôtes/contraintes et métrés, undo/redo, conflit, observation/recontrôle, approbation puis publication. | TEST-003..014, 027/029/030/038 ; net mur 3,180 puis 3,096 m³, historique inchangé ; étude réellement terminable validée par A1. |

I seul constitue une intégration technique. Ni boutons, ni géométrie visible, ni métrés du seul mur ne constituent un MVP accepté. Les quatre domaines restent dans le pilote ; IA/immersion avancée/MCP restent P2 conditionnels et ne bloquent pas artificiellement le socle. Formats annoncés selon couverture ; IFC en proxys n'est pas présenté comme paramétrique intégral ou certifié.

## 6. Tâches prêtes à autoriser et orchestration

| Tâche | Agent | Priorité | Statut de cette mission | Dépendances / sortie |
|---|---|---|---|---|
| UX-SPEC-01 | A4 + A1 | P0 Studio | Préparé | Ratifier schéma de navigation, états et étude pilote ; maquette d'interaction attendue avant REC-I-01. |
| UX-CONTRACT-02 | A2 + A4 | P0 Studio | À définir | ADR-STUDIO-NAV-01 : routes, contexte, transitions, plein écran, coexistence ; DEC-01/02/03/12/18. |
| UX-TEST-03 | A5 + A4 | P0 transversal | Préparé | Transformer NAV en scénarios automatisés/assistés, fixtures autorisées ; aucune exécution destructive avant garde DB. |
| UX-BASE-04 | A0/A6 | P1 | Bloqué pour code | Décision #142 et revalidation SHA/CI ; aucune fusion Mission 002. |
| I-UX-05 | A3 futur | P0 Studio | À faire après G3 et accord code | Enveloppe Studio autonome, rail, bandeau et états ; preuves NAV pertinentes, pas déclaration MVP. |
| UX-DEVICE-06 | A4/A5 | P3 audit / X Studio | À définir | Appareils réels et budget DEC-13, interaction tactile/clavier, mesures ; ne pas remplacer par émulation seule. |

Préparation UX indépendante des analyses A1/A2/A5/A6 : rédaction de critères, états, inventaire des textes et parcours. Les maquettes détaillées d'édition dépendent des contrats A2, du pilote A1 et de la base #142. A3 n'a pas été activé.

### Fichiers partagés à verrouiller par lot autorisé

A0 attribue un seul écrivain à la fois pour App.tsx, AppShell.tsx, ProjectShell.tsx, HomeTopbar.tsx, module-registry.ts, use-immersive.ts, style.css, accueil.css, components/Icon.tsx, i18n/en.json et catalogue Atelier messages.ts. #142 touche notamment ProjectShell, le hook immersif et CSS. A4 prépare textes et contrats ; futur A3 intègre le lot I après stabilisation ; A2 approuve interfaces ; A5 maintient les scénarios et preuves. Éviter deux branches qui changent simultanément rail ou schéma de contexte. Nouveaux fichiers UX Studio peuvent être préparés séparément seulement après autorisation, via interfaces déjà convenues.

### Mission A4 indépendante prête à relancer

« Relever main/HEAD/PR142/CI. Lire AGENTS, continuité et HANDOFF/STATUS/TASKS/CONTEXT Studio s'ils existent. Lire charte, référentiel et décision de navigation. Préparer maquettes et contrat d'interaction FR/EN pour Studio autonome, quatre domaines, deux planches ; états absents/interdits/loading/erreurs/offline/pending ; clavier/tactile et sortie plein écran explicite. Maintenir les 21 étapes et Atelier. Produire NAV-001..009 mesurables et matrice vers exigences/tests, preuves et décisions. Ne pas modifier application/GitHub ni exécuter de scénario écrivant en base sous ce mandat ; signaler les vérifications absentes. »

## 7. Décisions humaines à soumettre

1. Ratifier au G0 les sources et le pilote métier terminable proposé par A1 ; conserver les invariants déjà imposés.
2. Valider placement Studio après Projets et icône dédiée ; définir choix de routes/URL et place du contexte Projet/Étude/Variante/Révision dans le bandeau.
3. Arbitrer le traitement de #142 avant modifications de ses fichiers partagés ; sa fusion n'est pas incluse dans la mission.
4. Fixer la politique de sortie avec travaux locaux/envoi/conflit et le comportement de changement de langue (rechargement actuel), fermeture et plein écran.
5. Choisir les appareils et budgets DEC-13 et les critères d'accessibilité contractuels ; ne pas déclarer GPU/mobile conformes sans mesures réelles.
6. Autoriser séparément les POC G2, puis les sous-lots après G3 ; aucune autorisation de code, admin, migration ou déploiement déduite de ce rapport.

Bilan A4 : code/navigation et #142 effectivement lus ; spécification et recette préparées ; aucun Studio implémenté/vérifié/accepté au titre de Mission 002 ; preuves navigateur actuelles et arbitrages ci-dessus encore ouverts. Agent A4 effectivement mobilisé en analyse seulement.
