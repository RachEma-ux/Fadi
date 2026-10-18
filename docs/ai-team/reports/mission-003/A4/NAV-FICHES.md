# NAV-001 à NAV-009 — fiches de recette candidates M13/M16/M26

Version proposée 0.1 — 18 octobre 2026. Référence de préparation `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Source : critères NAV du plan Studio V1.0 ; précision des oracles par A4, pas réécriture des critères normatifs. État des **neuf fiches : préparées / test non exécuté / conformité non évaluée / acceptation absente**. Référence du contrat candidat : CONTRAT-NAV-CANDIDAT.md dans ce dossier.

## Dispositif commun proposé

Prérequis d'exécution : sous-lot implémenté et autorisé, SHA/build arrêté, garde M02 vérifiée, base jetable explicitement autorisée (ou fixtures/mocks sans base pour les tests d'interface bornés), sessions synthétiques et corpus/licence. Aucun test mutateur sous la présente préparation. Mock d'interface ne valide pas les droits serveur ni la durabilité réelle.

Corpus candidat UX-S0 : P1 autorisé/P2 interdit ; étude S1 dans P1/S2 dans P2 ; variantes V1/V2 indépendantes ; révisions R1/R2 immuables, travail courant W3 ; rôles lecteur, concepteur, contrôleur, approbateur, publieur, accès révoqué ; zéro projet, projet sans étude, étude sans variante. Jeux uniquement synthétiques. Créer/figer les fixtures dans un futur lot autorisé, conserver empreinte ; ne pas les déclarer présentes aujourd'hui. Corpus géométriques S1–S7 source pilotés par A5 : ne pas confondre UX-S0 et scène S1.

Environnement commun E-UX proposé à ratifier M002-D07/DEC-13 : Chromium version Playwright verrouillée et navigateur système séparément identifiés ; desktop 1920×1080/1440×900/1024×768, tablette 768×1024, téléphone 390×844 et paysage ; rail replié/déplié, FR/EN, clavier/souris/tactile, zoom200%, reduced motion, réseau en ligne/hors ligne si concerné. Tests appareil/GPU physiques séparés de l'émulation, aucune performance physique déduite du headless. Les seuils de latence/mémoire attendent DEC-13 ; zéro fuite de contenu et zéro perte/double commande sont des critères fonctionnels éliminatoires sans moyenne compensatoire.

Preuve commune P-UX : ID, requirementIds, contrat/version, SHA/build/image, OS/navigateur/appareil/GPU/viewport/locale/rôle, fixture hash, date/exécutant, étapes/attendus/observés/verdict, assertions machine/logs réseau expurgés/arbre accessible/captures pertinentes, trace de données avant/après et décision utilisateur quand requise. Aucun secret, contenu client ou dump public. Une exécution E2E peut couvrir plusieurs NAV/TEST mais reste **une seule preuve** liée à tous ses IDs. Référencer A5 plutôt que recopier un résultat.

## NAV-001 — entrée Studio et accès

**Source inchangée :** Studio présent dans le rail, nom accessible, clavier et actif corrects. **Dépendances :** I.1/I.5, décision placement/icône et base commune. **Liens :** UX-01..04 ; EX-001/032..037.

**Positif :** depuis Accueil, Tab jusqu'à Studio, activer Entrée ; vérifier URL Studio, label visible déplié et nom accessible/infobulle replié ; répéter tactile mobile et toutes les routes Studio. **Négatif :** route Accueil/Projets/Collaboration ne présente pas Studio comme actif ; rail déplié/replié ne crée pas de doubles liens focusables ni ne perd son nom ; focus ne reste pas dans un panneau fermé.

**Oracle :** un seul contrôle de navigation Studio, un seul actif global (`aria-current=page` ou sémantique validée), destination autonome ; nom Studio dans l'arbre accessible ; focus visible/atteignable ; dimensions proposées >=44px pour cible mobile. **Env :** E-UX sans corpus géométrique. **Preuve :** P-UX + ordre Tab et arbre accessible avant/après rail.

## NAV-002 — autonomie et Parcours intact

**Source :** ouverture sans Parcours/Atelier, aucune étape créée/validée implicitement. **Dépendances :** I.2, A.1 contexte, EX-001. **Liens :** TEST-001/002 pour autonomies finales, pas équivalence avec MVP.

**Positif :** lien direct `/studio` puis projet synthétique sans étapes accomplies, étude/variante, choix 2D puis autre étude 3D ; StudioShell s'affiche sans ouverture Atelier. **Négatif :** supprimer les caches UI Parcours/Atelier et faire échouer leurs endpoints non requis : Studio doit encore proposer le contexte autorisé ; aucun prérequis « terminer étape10 » ; ouverture seule ne crée géométrie ou progression.

**Oracle :** même inventaire 21 étapes, numéros/phases/libellés/cartes/stats avant/après navigation ; pas d'appel obligatoire à données Parcours pour ouvrir Studio ; pas de redirection `?module=atelier`, iframe ou initialisation Atelier complet ; géométrie sans 3D/2D fictive selon choix. Vérifier réseau et données, pas seule absence de texte. **Env :** E-UX + UX-S0, données read fixtures pour premier test, vrai backend jetable pour preuve de non-mutation. **Preuve :** P-UX + diff d'état et graphe routes/requêtes.

## NAV-003 — contexte absent sans objets orphelins

**Source :** absence projet/étude conduit à choix explicite. **Dépendances :** I.2, A.1, permissions. **Liens :** EX-003 et IF-001.

**Positif :** trois comptes/états : aucun projet ; projet sans étude ; étude sans variante. Présenter choix/creation seulement autorisée, puis contexte complet avant édition. **Négatif :** deep-link incomplet, double clic Créer et essai géométrie avant variante ; lecteur sans droit création ne peut créer via raccourci/profil/API ; absence d'étude ne déclenche pas insertion cachée.

**Oracle :** aucune géométrie sans variantId propriétaire ; ouvrir une page est non mutateur ; nombre de créations correspond exactement aux intentions confirmées/idempotentes ; choix accessible et retour Fadi possible. **Env :** E-UX + UX-S0, base jetable obligatoire pour création. **Preuve :** P-UX + commandes/requestId et comptages anonymisés par propriétaire.

## NAV-004 — URL, historique et refus sans fuite

**Source :** URL/réouverture/précédent-suivant restituent contexte autorisé, lien interdit ne divulgue rien. **Dépendances :** routes et façade A2/M17, garde isolation serveur. **Liens :** TEST-035, EX-088.

**Positif :** URL complète V1 dessin2D, naviguer V2 visualisation puis R1 BIM ; refresh/précédent/suivant rétablissent exactement P/S/V/R/domaine/planche. Dernier projet personnel différent ne remplace pas l'URL. **Négatif :** permuter project/study/variant/revision entre propriétaires, ID absent/malformé, révoquer permission après cache chargé, rejouer URL/export/job interdits ; aucun nom, image, metadata ou anciennes données sensibles ne doit fuir.

**Oracle :** chaîne d'appartenance et droits contrôlée serveur à chaque ressource ; refus neutre/autorisé selon politique arrêtée ; absence de corps sensible et scène/caches précédent contexte non affichés ; URL historique ne passe pas à latest. Paramètre domaine/planche invalide produit état non reconnu sans mutation. **Env :** E-UX + UX-S0, vraies sessions/API de test pour preuve sécurité, mocks seulement complément. **Preuve :** P-UX + matrice réponses expurgées et assertions absence de fuite.

## NAV-005 — quatre domaines et deux planches véritables

**Source :** quatre domaines accessibles, deux planches dans Dessin et modélisation seulement. **Dépendances :** I.4 puis A.2/A.3/E pour capacités métier. **Liens :** EX-004..007, TEST-001/002/003.

**Positif :** parcourir quatre domaines, ouvrir 2D seule et 3D seule ; vérifier que leurs contrôles d'édition existent et que données indépendantes restent persistantes dans leurs propriétaires. **Négatif :** `planche=3d&domaine=bim`/planche inconnue refusée ou état explicite ; ne pas présenter coupe/feuille/visionneuse comme planche autonome ; ni volume fictif créé en A ni esquisse requise en B.

**Oracle :** noms/responsabilités des quatre domaines identiques au contrat ; planches éditables uniquement D1 ; absence d'effet métier parasite. Test enveloppe I ne ferme que présence/navigation ; autonomie persistante et publication attendent les TEST aval. **Env :** E-UX + corpus de parcours A/B/C fourni A5. **Preuve :** P-UX + identités/modèles avant/après et sous-critères d'édition explicitement exécutés ou non.

## NAV-006 — bandeau exact et courses de navigation

**Source :** bon Projet/Étude/Variante/Révision ; Projets non faussement actif. **Dépendances :** I.3/M17, HomeTopbar/façade. **Liens :** EX-003/012/016/087/088/092, IF-001, NAV-004.

**Positif :** ouvrir W3 puis R1, vérifier labels/IDs/readonly et source de chaque vue ; navigation rapide entre deux projets avec requêtes retardées. **Négatif :** réponse P1 tardive après ouverture P2 ; refus accès/absence révision ; ne pas mélanger nom P1 avec actions P2, ni montrer dernière révision sous URL historique, ni nom de projet interdit.

**Oracle :** contexte de toutes les commandes égal au contexte autorisé de l'écran ; identités du bandeau et URL alignées ; historique clairement identifié ; Projets inactif, Studio seul actif. **Env :** E-UX + UX-S0 avec latences déterministes et retour de requête inversé. **Preuve :** P-UX + chronologie IDs/navigation/réponses expurgée et capture finale.

## NAV-007 — aucun abandon silencieux

**Source :** transition protège geste, commande locale et sauvegarde pending. **Dépendances :** I.5, A.5/DEC-12, B/DEC-14, R/SW. **Liens :** TEST-011/012/013/019/021/036.

**Positif :** pour preview, commande durable locale, envoi pending et conflit, choisir Rester puis sortie autorisée ; rouvrir même contexte et confirmer uniquement ce qui a été engagé ; tester route/domaine/planche/projet, historique, changement FR/EN (reload actuel), fermeture et SW. Plein écran seul conserve le geste/queue selon contrat.

**Négatif :** réseau coupé entre envoi/réponse, réponse doublée, quota local épuisé, permission retirée pendant envoi, ancienne commande après changement de variante, SW incompatible, crash mobile sans beforeunload. Interdire fausse confirmation serveur, perte de file et application dans le nouveau contexte.

**Oracle :** modèle/queue/journal source de vérité préservés ou annulation explicitement choisie ; exactement un effet par requestId ; contextes P/S/V/baseRevision inchangés par réadressage ; historique/publication anciens intacts ; récupération vérifiable après reopen. Définir précisément « local durable » dans M17, pas inférer depuis toast. **Env :** E-UX + corpus S7/A5, sessions concurrentes et stockage fault-injection sur cible jetable. **Preuve :** P-UX + queue avant/après, journal commandes/résolution et métriques de pertes/doublons=0.

## NAV-008 — erreurs récupérables, plein écran explicite

**Source :** erreur moteur/chargement récupérable ; rail non masqué par ancien mode Atelier. **Dépendances :** I.2/I.5, D protections minimales ; plein écran M002-D07. **Liens :** TEST-014/015/037.

**Positif :** provoquer échec de chunk/moteur/requête, utiliser Réessayer puis sortir vers Accueil/Projets ; demander plein écran puis le quitter avec bouton et événement système, focus/restauration contexte exacts. **Négatif :** Fullscreen API refuse ; worker crash avec pending ; résultat ancien après retry ; rotation/clavier virtuel rend habituellement bouton hors écran ; vérifier navigation toujours accessible hors mode explicite, sortie jamais dépendante d'un geste caché.

**Oracle :** aucune activation automatique `atelier-immersive` par Studio ; erreur bornée avec action/aria-alert, navigation Fadi utilisable ; modèle canonique non partiel ; pending résolus explicitement, résultat périmé exclu, retry idempotent ; bouton de sortie visible/actionnable et état cohérent après sortie système. **Env :** E-UX + contrôles fault-injection, matériel physique pour comportements fullscreen/clavier mobile. **Preuve :** P-UX + DOM/classes/cibles tactiles, erreurs et transitions job ; aucun seuil mémoire inventé.

## NAV-009 — coexistence et non-régression Fadi

**Source :** Accueil/Projets/Parcours/Atelier/Collaboration conservent leurs parcours pendant coexistence. **Dépendances :** base PR142 décidée/revalidée, A5 matrice M04/M26 ; capacités Fadi inchangées. **Liens :** recettes existantes et TEST de persistance/permissions, sans dupliquer leurs résultats.

**Positif :** rejouer sur build candidat les parcours Fadi applicables, étapes10/11 et Atelier direct, carte mobile21 étapes, Collaboration, menus/outils/clavier et FR/EN ; revenir Studio puis Fadi. Mesurer navigation et absence débordement global ; vérifier cibles réelles des gestes sous barres flottantes.

**Négatif :** méta CSS Studio sur ancien écran, route active erronée, raccourci Studio déclenché dans un champ Fadi, manque traduction, panneau superposé intercepte clic géométrique, retour vers un projet non autorisé. Ne pas corriger l'oracle pour masquer un défaut ; ne pas neutraliser assertions métier ou droits.

**Oracle :** résultats métier avant/après conformes au corpus validé ; 21 étapes/ordre/phases/libellés et Harmonie conservés ; capacités industrielles et règle outils conservées ; assertions identités/quantités/undo/documents/permissions toujours présentes. Les traces PR142 anciennes a383fa… ne valident pas le candidat. Sur tête PR142 0d960605… la CI38766145763 échoue à planche-boutons ; layout vert seul insuffisant. **Env :** E-UX et cibles jetables A5/A6, nouveaux tests sécurité selon droits. **Preuve :** P-UX + matrice script→assertions→SHA→verdict ; skipped/non exécuté affichés, preuve issue PR142 séparée.

## Verdict et prochaine action

A0/A1/A2 arbitrent M002-D07 et contexte ; A5 relie ces fiches aux EX/INV/IF/AC et aux 38 TEST sans créer neuf réussites fictives. A3/M16 implémentation et exécution après autorisation/G3/cible sûre. A4 valide maquette et recette utilisateur sur le build réellement exécuté ; une fiche proposée n'est ni une recette passée ni une acceptation de G1.

## Traçabilité croisée ciblée après revue des 141 fiches A1

La liste ci-dessous précise des liens directs/complémentaires proposés, **sans affirmer une couverture complète des exigences**, et sans remplacer leurs fiches exactes ni augmenter le nombre de tests exécutés. Les IF nomment des contrats métier, pas des routes web existantes.

| NAV | Liens directs candidats | Compléments selon scénario |
|---|---|---|
| 001 | EX-001/036 ; IF-005 | EX-032/035, INV-015 (catalogue/outils) |
| 002 | EX-001/004/005/007 ; IF-001 | EX-087 |
| 003 | EX-003/087/088/092 ; IF-001/006 | INV-005 |
| 004 | EX-003/012/088/092 ; IF-001/004/006 | INV-006 (retours obsolètes), TEST-035 |
| 005 | EX-004/005/006/007/036 ; IF-001/002/006 | INV-002/003 ; publication A attend IF-009 |
| 006 | EX-003/012/016/087/088 ; IF-001 | INV-006 ; EX-013 clonage n'est pas un lien direct du bandeau |
| 007 | EX-017/018/019/037/044/045/046/047/048/049/089 ; IF-004/005/006/011 | INV-005/011/014, IF-009 pour publication historique |
| 008 | EX-036/058/061 ; IF-003/005/007 | INV-005/006, protections erreurs/annulation |
| 009 | EX-087/091/098/101 ; IF-006/011 | INV-007/011 ; contrats géométriques/documents selon recette retenue |

Chaque lien complémentaire doit être confirmé par l'assertion réellement exécutée ; la navigation seule ne prouve pas atomicité, restauration ou autonomie métier. Les profils M21 renvoient directement à EX-026..044, IF-005 et INV-009/014/015, avec IF-006/004/011 pour l'exécution métier sous-jacente.
