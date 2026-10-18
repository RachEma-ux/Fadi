# Delta G1 v2 vers NAV-001 à NAV-009

Les neuf critères existants restent prescrits et non exécutés. Ce document précise leurs liens aux identités et contenus canoniques G1 v2, sans nouvelle numérotation ni modification des sources. G1 et les contrats physiques restent ouverts. Aucun code, interface, navigateur ou test exécuté.

Référence documentaire Git : `b1023605b965b27ff56fabf179756592673c98d4`. Les propositions A1 locales sont identifiées par leurs empreintes, sans SHA de commit inventé. Le JSON joint contient le texte exact de chaque critère et les extraits sources par ligne ou pointeur JSON.

## NAV-001 — entrée Studio et accès

Pas de nouveau placement, contrôle ou libellé introduit par G1 v2. Le rail Studio après Projets et son nom accessible restent le contrat D07. Les identités propres ne créent pas une seconde entrée par étude ou variante.

**Acquis de spécification :** D07 acquis pour spécifications ; détails de façade, focus et mapping des ressources restent proposés.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Entrée unique sous plusieurs identités** : Ouvrir deux variantes autorisées, revenir Accueil puis activer Studio au clavier et au toucher. Oracle : Un seul contrôle Studio ; zéro lien supplémentaire portant une identité métier ; Studio seul actif sur ses routes et focus visible. Cas négatif : Changement de studyId/variantId ne produit ni double lien focusable ni actif Projets erroné.

## NAV-002 — autonomie et Parcours intact

DEC-01 retient le principe du contenu 2D canonique indépendant ; DEC-03 retient des identités Étude/Variante propres. L’ouverture Studio et l’étude vide ne doivent charger ni créer un modèle 3D de substitution, ni exiger l’Atelier ou une étape Parcours.

**Acquis de spécification :** Orientations logiques retenues pour préparer G1 ; réemploi par interface publique et autonomie persistante restent à prouver.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Autonomie 2D sous identité propre** : Depuis /studio ouvrir une étude sans étapes terminées, choisir une variante puis la planche 2D indépendante. Oracle : Zéro modèle 3D créé ; inventaire des 21 étapes, phases et états identique avant/après ; documentId stable au réouvrir. Cas négatif : Indisponibilité des données Parcours/Atelier non requises ne crée pas de prérequis caché ni de faux volume.

## NAV-003 — contexte absent sans objets orphelins

L’étude possède une identité propre et peut contenir cadrage/sources sans variante. Toute géométrie persistée reste rattachée à une variante autorisée ; aucune attribution au dernier projet ou création implicite n’est permise. Le cas positif documentaire Étude vide précise le contexte admissible, pas un écran livré.

**Acquis de spécification :** Principe d’identité DEC-03 retenu ; transports, cycle de création et allocation physique non ratifiés.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Étude avec sources, sans variante** : Ouvrir la route étude existante avec sources autorisées et liste de variantes vide. Oracle : Trois zones Cadrage/Sources/Variantes accessibles ; zéro variante, document, géométrie ou révision créée par GET/navigation. Cas négatif : Commande géométrique avant variantId propriétaire refusée sans effet ; lecteur ne crée pas via raccourci ou double clic.
- **Création intentionnelle de variante** : Choisir Créer selon permission, confirmer une seule intention. Oracle : Une seule nouvelle identité sous le studyId/projectId autorisés et provenance explicite ; aucun modèle fictif produit. Cas négatif : Requête répétée ne double pas la création selon le futur contrat idempotent ; parenté étrangère refusée.

## NAV-004 — URL, historique et refus sans fuite

Les segments P/S/V/R correspondent à des identités métier propres, non à des aliases de projets copiés. Parenté, droits de chaque ressource et révision immuable sont vérifiés serveur, y compris après login, cache, retour navigateur et réouverture historique. Les anciennes variantes-projets exigent un mapping explicite ; aucune migration ou route API n’est décidée.

**Acquis de spécification :** Identités/logique historique retenues en orientation ; chemins web et politique de refus restent candidats, formats/stockage non choisis.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Lien historique exact après authentification** : Ouvrir anonymement une URL complète P/S/V/R puis se connecter ; rafraîchir et utiliser précédent/suivant. Oracle : Même P/S/V/R/domaine/planche ; consultation historique explicite ; zéro substitution latest et aucun contenu privé avant autorisation. Cas négatif : ID valides mais parents différents, autre utilisateur ou returnTo externe : refus neutre sans nom/vignette/contenu sensible.
- **Réouverture avec pièce incompatible** : Réouvrir une révision exacte dont une source est absente, divergente ou illisible. Oracle : État explicite avec récupération ; version/source manquante identifiée seulement selon droits ; zéro création de remplacement. Cas négatif : Cache d’une ancienne étude ne fuit pas ; aucun fallback sur une pièce courante portant le même nom.

## NAV-005 — quatre domaines et deux planches véritables

Les quatre domaines et deux planches demeurent inchangés. G1 précise que la révision A peut citer seulement drawing2d, B seulement model3d et C associated avec relations/projections. Une planche, une scène ou une coupe dérivée ne devient pas une seconde autorité géométrique ; conversion, référence, copie et association restent des intentions distinctes.

**Acquis de spécification :** Autonomie 2D retenue en principe ; association topologique DEC-02 et choix physiques restent ouverts. I/A.1 n’est pas le MVP A/B/C.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Choix de planche indépendant** : Depuis une variante sans planche sélectionnée, choisir 2D puis une autre variante 3D indépendante ; traverser les quatre domaines. Oracle : Deux planches seulement dans Dessin et modélisation ; aucun contenu de l’autorité absente créé à la lecture ; propriétaires et contexte conservés. Cas négatif : planche=3d hors domaine dessin ou planche inconnue : état URL non reconnue, zéro mutation.
- **Projection et extraction explicites** : Consulter une coupe associée puis demander, si autorisé et contrat ratifié, une copie 2D indépendante. Oracle : Avant extraction la coupe est marquée dérivée ; une copie confirmée a documentId/provenance propres et aucune propagation implicite. Cas négatif : Changer de planche ou ouvrir la coupe seule ne convertit pas silencieusement la projection en document canonique.

## NAV-006 — bandeau exact et courses de navigation

Le bandeau doit nommer la révision historique et la variante propriétaire, en distinguant revisionId, contentVersion illustratif du contenu, documentVersion de pièce, schemaVersion et contractVersion. Un résultat tardif conserve son contexte initial ; ancien contenu ou publication ne peut être présenté sous la tête courante.

**Acquis de spécification :** Distinction de vocabulaire documentaire clarifiée ; contentVersion n’est pas un nouveau champ applicatif adopté.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Course entre variantes et versions** : Retarder la réponse V1/R1 puis ouvrir V2/R2 et livrer la réponse V1 ; afficher ensuite une pièce publiée distincte. Oracle : URL et bandeau P/S/V/R alignés à V2/R2 ; aucune action ou scène V1 active ; version de pièce jamais utilisée comme révision de variante. Cas négatif : Réponse de contexte interdit ou hash divergent : aucune confirmation ni remplacement latest.
- **Passage historique vers édition** : Sur R1 historique, choisir explicitement Reprendre le travail courant ou nouvelle variante selon droit. Oracle : R1 immuable ; URL et nouvelle base changées par intention autorisée ; aucune commande pending de R1 réadressée. Cas négatif : Bouton/shortcut d’édition directe sur historique refuse sans mutation rétroactive.

## NAV-007 — aucun abandon silencieux

G1 renforce la distinction entre contenu canonique engagé durablement et rendu/cache. Un statut local pending ne vaut ni confirmation centrale ni publication. Parenté, permission, writerAuthority et baseRevision sont recontrôlés avant effet ; contenu et anciennes révisions sont conservés sous leurs identités. Le v2 ne fournit pas la mécanique physique de queue, durabilité ou déduplication.

**Acquis de spécification :** Obligations de sauvegarde et non-réadressage acquises de spécification ; garanties réelles de transaction/queue/incidents restent ouvertes.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Réponse perdue et changement de variante** : Envoyer sous V1/baseR1, perdre la réponse, demander V2 puis changer FR/EN ; choisir Rester ou quitter en conservant selon contrat. Oracle : Contexte et requestId V1 conservés ; zéro effet dans V2 ; au plus un effet central ; état indéterminé/pending jamais Enregistré confirmé. Cas négatif : Second utilisateur connecté : queue du premier non envoyée, aucun contenu divulgué ni réattribué.
- **Sauvegarde puis réouverture fidèle** : Modifier le contenu 2D et obtenir un engagement durable selon le futur protocole, fermer puis rouvrir les révisions ancienne et nouvelle. Oracle : Mêmes documentId/primitiveId/calques/cotes/annotations et unités attendus ; ancienne révision inchangée ; nouvelle contentVersion illustrative non confondue avec pièce publiée. Cas négatif : Quota local, base périmée, droits révoqués ou writer incohérent : refus explicite sans effet partiel, traces et récupération autorisée préservées.

## NAV-008 — erreurs récupérables, plein écran explicite

La réouverture exige un lecteur compatible, les empreintes exactes et une récupération explicite si une source diverge. Le plein écran explicite, le rail réaccessible, le clavier et le mobile restent inchangés par les modèles G1 ; sortie ou échec moteur ne doit pas faire croire à une sauvegarde ni effacer le contexte canonique.

**Acquis de spécification :** Principe D07 retenu ; erreurs/compatibilité/reprise prescrites, matériel mobile/fullscreen et budgets DEC-13 non validés.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Erreur de lecteur pendant pending et plein écran** : Avec une commande pending, provoquer un lecteur incompatible ou un résultat divergent, demander puis quitter le plein écran. Oracle : Erreur accessible avec action, sortie visible au clavier et au toucher ; P/S/V/R et queue conservés ; zéro publication/confirmation fictive. Cas négatif : Fullscreen API refusée, clavier virtuel et rotation : navigation et récupération restent atteignables sans geste caché.
- **Récupération sans latest** : Réessayer une révision historique après erreur de source. Oracle : Même révision et source/version demandées ; résultat ancien de retry exclu ; aucune substitution par contenu courant. Cas négatif : Erreur permanente ne produit ni spinner sans issue ni document partiel déclaré complet.

## NAV-009 — coexistence et non-régression Fadi

L’index I/A.1 référence les contrats existants et exclut éditeurs complets, Registry complet et publication métier complète. Les schémas logiques ne modifient ni les 21 étapes ni Atelier/Planche natifs et n’autorisent aucune migration des anciens forks. FR/EN, clavier, tactile et coexistence restent les mêmes obligations, sans nouvelle norme d’interface.

**Acquis de spécification :** G0 documentaire accepté sur dossier borné ; mentions antérieures G0 non passé restent historiques. G1–G4, contrats physiques et POC proposé non clos/non autorisés par ces pièces.

**Preuve manquante :** NAV prescrit, non exécuté. Ni interface Studio, ni contrôle serveur, ni persistance/reprise, ni droit effectif validé ici. Syntaxe et empreintes JSON cohérentes ne prouvent aucun de ces comportements.

- **Retour Fadi après nouveau contexte Studio** : Naviguer Studio sous nouveaux P/S/V/R puis revenir Atelier direct, Parcours21étapes, Collaboration et Planche ; répéter FR/EN, mobile et clavier. Oracle : Ordre/phases/libellés/stats des21étapes identiques ; mêmes propriétaires et données Fadi ; aucune CSS/commande/raccourci Studio parasite. Cas négatif : Champ de saisie Fadi ne déclenche pas raccourci Studio ; changement de langue avec pending respecte NAV-007.
- **Permissions d’approbation et publication au retour de revue** : Sur un ensemble exact identifié, exercer séparément lecteurs, concepteurs, approbateurs, publieurs et cumul explicitement configuré. Oracle : Approve et publish restent capacités distinctes ; révision/contenus approuvés exactement ceux publiés ; administrateur technique sans délégation n’obtient aucun droit. Cas négatif : Révoquer publish entre affichage et acte, ou modifier le contenu après approbation : refus serveur sans publication, ancienne référence immuable intacte.

La séparation approbation/publication se rattache aux NAV-004/005/006/007/009 selon accès, contexte, attente et non-régression ; aucun nouveau NAV est créé. Les quatre domaines, deux planches, règles FR/EN/mobile/clavier et 21 étapes restent inchangés. Les exemples documentaires ne démontrent ni rendu, ni contrôle serveur, ni durabilité réelle. Le POC local proposé ne suffirait pas à les valider.

Restent à décider ou prouver : contrats physiques DEC-01/03, topologie DEC-02, queue/historique/chargement DEC-12/14, empreintes de production DEC-16, mapping effectif des droits, politique cache/révocation et tests sur appareils. Aucune disponibilité humaine CAD-DEC-03 n’est inventée. Aucun passage G1–G4, code Studio ou recette mutatrice autorisé par ce delta.
