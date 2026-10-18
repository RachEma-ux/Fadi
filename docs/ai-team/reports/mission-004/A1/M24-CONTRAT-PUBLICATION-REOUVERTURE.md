# M24 — Contrat documentaire de publication et réouverture du pilote A/B/C

Mission 004, 18 octobre 2026. A1 Produit ; interfaces à rapprocher d'A2, oracles et refus à revoir par A5, exploitation/restauration par A6. **Spécification candidate non exécutable** : aucun code Studio, schéma SQL, route API, compte, permission effective, publication, gate ou résultat produit accepté par ce dossier. A0 seul intègre ces fichiers aux checkpoints ; aucune écriture partagée par A1.

## 1. Sources et autorité

Cadrage D01/D02/D07 retenu : commentaire officiel [6249520098](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249520098), document CODEX-DELEGATED-DECISIONS lu à la référence A0 `301a4fa8f2594fa1c8f0317c18085b5ae22ac7a3`. Ni l'autorisation A3-DB-1/2 ni la préparation de ce contrat n'ouvrent le code Studio.

Référentiel RT001 V1.0 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32` ; texte exact dans les 141 fiches A1, source XML w:p 1-based. Points principaux : IF-001¶141 rattachement projet, IF-004¶330 précondition de version, IF-006¶529–531 enveloppe et identité serveur, IF-009¶765 manifeste exact, IF-011¶868 engagement/journal ; AC-001¶419 identités/quantités/historique, AC-008¶732 traçabilité des déductions, AC-009¶768 changement après approbation, AC-010¶817 refus de droit. EX-012/016/017/018/019/074–091, INV-001/002/004/005/006/012/014 continuent à s'appliquer.

Les dossiers M003 LOT-E et LOT-R, G0 M004 et la matrice 141 sont les reprises, pas de nouvelles exigences renumérotées. Les noms **C-STUDY, C-COMMAND, C-DRAWING2D, C-MODEL3D, C-ASSOCIATION, C-PUBLICATION** restent les contrats candidats A2. Les exemples ci-joints illustrent IF-009 et ses relations ; ils ne constituent ni une deuxième API normative ni une affirmation de compatibilité avec le code actuel.

A2 M05-M17-CONTRATS-DURABLES est repris : contexte complet, `schemaVersion`/`contractVersion`/`documentVersion` distincts, `writerAuthority` serveur unique, snapshot en une coupe logique cohérente, IF-006 intact, préconditions supplémentaires seulement dans un dossier documentaire non-wire. La forme physique, les schémas définitifs, la canonicalisation d'empreinte et le stockage demeurent DEC-01/03/16/18 ; ne pas coder les exemples en supposant ces choix adoptés.

## 2. Objets, identités et autorités

| Objet | Identité et version | Autorité / invariant |
|---|---|---|
| Projet Fadi | projectId, droits et sources | Service projet existant, pas projet parallèle |
| Étude | studyId appartenant au projet, sources et hypothèses | Peut exister avant variante et avant géométrie |
| Variante | variantId appartenant à une étude | Propriétaire de toute géométrie persistée ; fork explicite, identités/provenance selon C-STUDY |
| Révision de référence | revisionId, variante propriétaire, parents et transaction | Immuable ; aucune confusion avec baseRevisionId de commande ou «latest» |
| Dessin2D autonome | documentId, schemaVersion, contenu et empreinte, repère/unité | `drawing2d` candidat ; aucun modèle3D fictif requis |
| Modèle3D libre | modelId, schemaVersion, contenu et empreinte, repère/unité | `model3d` candidat ; aucune esquisse2D imposée ni sémantique BIM implicite |
| Objet associé | objectId, hôtes/relations/contraintes/versions | `associated` candidat ; vues2D/3D projections du même objet, pas deux écrivains |
| Document livré | documentId + documentVersion + empreinte | Pièce immutable référencée, distincte du dessin canonique et d'une vue de travail |
| Manifeste candidat | manifestId/version/empreinte, usage et liste ordonnée des pièces | Ensemble coordonné exact ; versions de disciplines distinctes autorisées si explicitement listées |
| Approbation | approvalId, décision et empreinte exacte de l'ensemble | Acte métier d'un rôle habilité ; pas simple case UI |
| Publication | publicationId, manifeste/approbation/événement, diffusion | Nouvel objet historique ; retrait/remplacement journalisés, contenu antérieur identifiable |

Un objet canonique a un propriétaire logique et un writerAuthority établi côté serveur ; la route, le profil d'outils ou l'image de scène ne les choisit pas. Une copie indépendante reçoit ses nouvelles identités et ne propage pas vers l'origine. Référence liée, copie et associé demeurent trois relations distinctes. Aucun lien de publication ne confère un droit d'édition sur un autre contexte.

Les exemples utilisent une publication par variante A/B/C d'une même étude synthétique. IF-009 permet un ensemble coordonné multi-sources : un futur dossier peut référencer plusieurs variantes/révisions explicitement autorisées, mais ne mélange jamais implicitement les sources sous un unique faux numéro de révision. Les règles de choix inter-variantes restent à instruire par DEC-16 ; les exemples n'en font pas une API acquise.

## 3. Entrées, sorties et séparation des actes

### Préparer / sauvegarder

Entrées : session serveur, contexte projet/étude/variante, baseRevisionId, contrats et schémas supportés, intentions IF-006, unités/repères explicites, sources/relations autorisées et writerAuthority valide. La présence d'actorId dans un message ne crée aucun droit : l'identité authentifiée est rétablie et confrontée côté serveur.

Sortie attendue après engagement atomique : révision de sortie, transaction, résultat de commande/requestId et effets, journal IF-011 durable ; statut dérivé à jour/périmé/en calcul/échec distinct. Une notification, un fichier local ou une preview ne confirme pas une sauvegarde centrale. Après timeout, résultat «indéterminé côté client» puis recherche/rejeu idempotent, pas annulation supposée du commit.

### Figer un dossier candidat

Entrées : ensemble de sources canoniques révisées, dessins libres ou associés, références versionnées acceptées, vues/feuilles/quantités/documents, contrôles et observations. Toutes les références doivent former une coupe logique cohérente : interdiction d'assembler une ancienne pièce et une nouvelle géométrie après lectures entrelacées sans signalement.

Sortie : manifeste candidat IF-009 avec identifiant, usage, auteur/date, documents ordonnés (ID/version/empreinte), révisions/empreintes sources, règles/versions, rapports de contrôle et décisions sur observations bloquantes. Une pièce non générée, manquante, périmée, inaccessible ou de source ambiguë ne devient pas prête par présence d'une ligne de catalogue.

### Contrôler et soumettre

Le contrôle distingue **état d'exécution** (non lancé/en cours/terminé/échec) et **conclusion** (conforme/non conforme/non testé/non applicable justifié). Un échec technique ne signifie jamais conforme. Un contrôleur habilité recontrôle les corrections ; une observation ne se clôt pas parce que son concepteur la dit corrigée ou supprime l'objet. Une dérogation, si permise, est une décision tracée sur la bonne source et le bon usage, pas une fermeture silencieuse.

Sortie : résultats avec source/règle/tolérance/versions et dossier figé soumis à l'approbation, ou corrections demandées et nouvelle révision. Le statut «contrôlé» est un jalon de conformité des contrôles requis, pas l'approbation du dossier ni sa publication.

### Approuver

Entrées : droit d'approbation effectif, ensemble figé exact, contrôles requis et observations bloquantes traitées selon politique, usage et décision. Sortie : approbation liée à **l'empreinte du manifeste et à ses pièces**, acteur et date serveur, portée/usage et journal. L'ancienne décision reste liée à son ancien ensemble lorsque le travail continue.

Toute modification d'une pièce/version/source/règle ou d'un élément de contrôle/observation participant à la décision nécessite une nouvelle vérification de l'éligibilité et, lorsque le manifeste change, une nouvelle approbation. Pas de réutilisation de l'ancienne signature sur un autre contenu. L'événement d'approbation est séparé des octets du manifeste qu'il vise, pour éviter une empreinte circulaire ; la forme physique reste DEC-16.

### Publier

Entrées : droit de publication **distinct** revalidé au moment de l'acte, approbation valide pour le manifeste exact, présence/empreintes des pièces, restrictions de diffusion satisfaites, transaction et requestId. Sortie : publication durable avec identifiant, manifeste exact, décision associée, événement/date/acteur et état de diffusion ; aucune réécriture de publication antérieure.

Publier est distinct de déployer Fadi ou diffuser à des clients réels. Ce dossier ne réalise aucun de ces actes. Une préparation hors ligne reste locale/en attente et ne reçoit aucun statut central approuvé/publié avant validation serveur et engagement durable.

## 4. États : trois dimensions, pas un enum universel inventé

| Phase d'usage | Travail / dossier | Diffusion | Actualité des dérivés |
|---|---|---|---|
| Brouillon | En cours, modifiable sur tête autorisée | Non publié | À jour pour source / à recalculer / en calcul / échec |
| À contrôler | Révision/dossier figé identifié pour revue | Non publié | Sources et contrôles identifiés |
| Contrôlé | Contrôles requis conformes, observations résolues/dérogées selon politique ; peut être soumis | Non publié | Fraîcheur et versions vérifiées selon contrat |
| Corrections demandées | Constat puis nouvelle révision, recontrôle | Ancienne publication éventuelle inchangée | Nouveaux résultats/rapports attendus |
| Approuvé | Décision sur ensemble exact, approbation historique immuable | Pas encore publié nécessairement | Fraîcheur de l'ensemble examiné identifiée |
| Publié | Travail courant peut déjà évoluer après révision approuvée | Publication identifiée, éventuellement ensuite remplacée/retirée | Dérivés historiques gardent source ; nouveaux résultats séparés |

Cette table décrit la conception des transitions ; les noms de stockage/valeurs API ne sont pas arrêtés. Le statut de travail courant, le statut de diffusion et celui d'un dérivé ne se remplacent pas. Révoquer un droit invalide l'action future selon politique, sans falsifier les événements historiques valablement enregistrés.

## 5. Rôles et preuves séparées

| Capacité | Condition | Refus obligatoire |
|---|---|---|
| Concevoir/sauvegarder | Droit d'édition sur bon contexte et versions | Éditer une révision historique ou autre projet |
| Contrôler/recontrôler | Rôle/règle et source autorisés | Déclarer conforme un job échoué, clore sans recontrôle requis |
| Approuver | Permission métier approve et ensemble soumis exact | Concepteur ou admin technique sans droit métier |
| Publier | Permission métier publish et approbation applicable | Approbateur sans droit publish, document changé, pièce manquante |
| Cumul approve+publish | Attribution explicite des deux permissions, politique admise et journal | Cumul déduit d'un profil UI ou d'une simple appartenance admin |
| Réouvrir/consulter | Droit actuel sur publication et pièces, identité/version exactes | URL/blob/job d'un autre projet ou substitution vers «latest» |

Quatre preuves distinctes : **enregistrement durable** (révision/transaction/requestId), **contrôle** (exécution et conclusion sur sources), **approbation** (décision exacte et acteur habilité), **diffusion** (publication/manifestes/pièces/événement). Un succès de l'une ne prouve pas les trois autres. La preuve d'exécution future cite build/SHA/contrat/corpus/empreinte/environnement/horodatage/exécutant/verdict/lien, et non un champ client déclarant «approved».

## 6. Réouverture et reprise

1. Distinguer l'intention : ouvrir **travail courant**, **révision historique** ou **publication identifiée**. L'URL complète et l'action explicite déterminent ce choix ; le dernier contexte personnel n'est qu'une suggestion.
2. Authentifier et autoriser projet/étude/variante/révision/publication et chacune des pièces ; ne pas divulguer noms ou contenu interdits, y compris via blob/job/cache d'une ancienne session.
3. Résoudre identités et parentés exactes. Pour publication, relire manifeste immuable, approbation/diffusion et références de contenu ; vérifier disponibilité et empreintes des pièces. Aucune substitution silencieuse de version, de document «équivalent» ni de tête courante.
4. Charger seulement les autorités présentes : A peut restaurer le document2D seul ; B le modèle3D libre seul ; C l'objet associé et relations/topologie, puis ses projections. L'absence de3D dans A et d'esquisse2D dans B n'est pas une erreur à combler artificiellement.
5. Vérifier versions de schéma/contrat et lecteur compatible. Schéma inconnu : refus/lecture bornée selon contrat, conservation source et rapport explicite ; une conversion/migration nécessite son propre contrat et accord, pas un fallback destructeur.
6. Restaurer unités/repères/provenance et données canoniques ; reconstruire scènes/index/caches sans les prendre comme autorité. Les annotations topologiques ambiguës restent «à résoudre» et ne se rattachent pas au hasard.
7. Afficher source/révision/statut historique ou courant et restrictions. Modifier une publication/révision historique exige nouveau travail/fork/commande explicite avec bonne base, jamais mutation rétroactive.
8. Après coupure : distinguer confirmées, pendantes, rejetées, conflictuelles et previews abandonnées. Rejouer sous même identité/contexte/requestId selon C-COMMAND ; ne pas réadresser une ancienne queue à l'utilisateur ou la variante désormais affichés. Reconnexion ≠ confirmation automatique.
9. Si une pièce manque ou diverge : état incomplet/récupération/diagnostic explicite ; ne pas déclarer «réouverture fidèle» sur taux global partiel. Une restauration de sauvegarde exige aussi pièces/droits/associations/publications, pas seulement JSON ou cache ; c'est lotR/TEST034 séparé, non exécuté ici.

## 7. Unités, provenance et quantités

Chaque source externe ou canonique transportée porte contexte/version/empreinte, auteur/fournisseur connu ou inconnue signalée, format/date, unité, repère/transformation versionnée et restrictions. Coordonnées en pixels ne sont pas mètres ; document2D/local3D/projet/géographie ne sont jamais mélangés sans conversion explicite.

Quantité IF-008 : sourceRevisionSet, ruleId/ruleVersion, sourceObjectIds, unité, rawValue, déductions, valeur affichée et fraîcheur ; ajustement manuel séparé avec auteur/motif, pas écrasement du calcul. Ne pas sommer règles/unités/révisions incompatibles silencieusement. Exigence approuvée reste indépendante du dessin, EX-065.

Oracle simplifié RT001/AC-008 : mur6×3×0,2m =3,600m³ ; ouverture1×2,1×0,2=0,420m³ ; net3,180m³. Largeur ouverture1,2→déduction0,504→net3,096m³. Autres déductions/jonctions exclues de ce cas. PublicationR1 conserve net3,180 avec sa source quand R2 vaut3,096 ; undo/redo ne réécrit ni cette publication ni l'exigence programme.

## 8. Exemples et refus proposés

`M24-EXEMPLES-MANIFESTES.json` contient trois exemples positifs **documentaires** A/B/C et quinze cas négatifs JSON bien formés. Les noms `illustrative-*`, `fixture-*`, états `expected-*`, contenus et permissions supposées ne sont pas des données/états/contrats réellement enregistrés. Même un exemple appelé positif n'est pas un test Fadi passé. Ses pièces sont des objetsJSON synthétiques de démonstration de manifeste, **pas des exportsPDF/IFC ni un format natif Studio livré** ; il ne couvre pas seul le contenu complet du MVP.

Les empreintes des exemples positifs sont réellement calculées sur leur contenu JSON pour rendre les relations vérifiables. Méthode utilisée pour la démonstration : SHA-256 sur JSON UTF-8, clés triées, séparateurs compacts ; **ceci ne décide pas la canonicalisation/empreinte en production**. La décision est DEC-16, notamment précision numérique, normalisation et compatibilité. Approbation/publication dans le fichier sont des enregistrements synthétiques attendus, pas des signatures ou preuves serveur réelles.

| Cas négatif | Refus attendu, code candidat non API actuelle |
|---|---|
| Parenté projet/étude/variante/révision incohérente | CONTEXT_PARENT_MISMATCH, zéro création/diffusion |
| Document changé après approbation | APPROVAL_MISMATCH, nouveau contrôle/approbation requis |
| Pièce référencée absente | PUBLICATION_INCOMPLETE, aucune réussite partielle silencieuse |
| Quantité d'ancienne source présentée courante | SOURCE_REVISION_MISMATCH ou état périmé hors éligibilité |
| Volume avec unitém² | UNIT_MISMATCH, pas conversion implicite |
| Schéma sans lecteur/migration | SCHEMA_UNSUPPORTED, source conservée |
| Contrôle échoué déclaré conforme | CHECK_NOT_CONFORMANT, pas approbation automatique |
| Observation bloquante ouverte | UNRESOLVED_OBSERVATION selon politique de dérogation explicite |
| Approbation sans permission | FORBIDDEN_SCOPE, profilUI/actorId ne crée pas droit |
| Publication par approbateur sans publish | FORBIDDEN_SCOPE, cumul seulement explicite |
| Statut publication locale non confirmé | CENTRAL_COMMIT_REQUIRED, queue reste locale |
| Deux écrivains pour même objet | WRITER_MISMATCH, pas double autorité |
| Réouverture historique substitue latest | IMMUTABLE_REVISION / refus de substitution |
| Liste/ordre de pièces changé sans approbation | APPROVAL_MISMATCH, ordre fait partie de l'ensemble examiné |
| Proxys IFC présentés natifs/certifiés sans preuve | UNSUPPORTED_CAPABILITY_CLAIM, rapport de couverture honnête |

Ordre réel des contrôles et mappingHTTP restent à définir par A2. Les cas modifiant un contenu approuvé conservent intentionnellement une empreinte divergente ; les autres scénarios sémantiques ont des empreintes internes recalculées pour éviter de masquer leur faute par un simple hash obsolète. Ce travail produit des documents d'essai et vérifie syntaxe/cohérence interne, pas un validateur de contrat Fadi ni un POC autorisé.

## 9. Matrice de preuve future et critères de sortie

| Obligation | Candidat partagé | Scénarios et preuve future |
|---|---|---|
| A publiable sans3D, B3D directe avec vue/coupe | C-STUDY/C-DRAWING2D/C-MODEL3D/C-PUBLICATION | TEST001/002 ; fermeture/réouverture fidèle, source/empreinte/pièces, aucun modèle de substitution |
| Même objet/hôte et quantités/historique | C-ASSOCIATION/C-COMMAND/C-QUANTITY | TEST003–014/027, AC001/008 ; net3,180→3,096, identité, refus atomique/rejeu/conflit |
| Vue/feuille/dossier et manifeste exact | C-PUBLICATION, catalogue Documents Fadi | TEST030/038, AC009 ; mutation après approbation refusée, versions coordonnées identifiées |
| Rôles séparés et accès interprojets | Service droits existant via façade autorisée | TEST018/035, AC010 ; approbation/publication/URLblob refusées selon contexte et droits |
| Observation et clôture | C-OBSERVATION | TEST029 ; recontrôle autorisé, identité unique et décision de clôture sourcée |
| Retrait/remplacement et restauration | C-PUBLICATION/C-MIGRATION et lotR | TEST031/034/036 ; historique/pièces/droits/associations restitués, queue non perdue |
| IFC/DXF et limites | Adaptateurs existants à qualifier par sens/version/entité | TEST028 ; rapport pertes/proxies/non natif, jamais certification/round-trip supposés |

**Document prêt à revue** : sources/candidats/entrées/sorties/transitions/refus/cas/preuves/limites présents et confrontés aux contrats A2/oracles A5. **Capacité vérifiée** : uniquement après implémentation autorisée et scénarios réellement exécutés au build/SHA/corpus précis. **Accepté** : décision de l'autorité compétente sur le périmètre/preuves exacts, pas validation syntaxeJSON ou CI générale.

DEC-03/12/16/18 et DEC-02 pour C restent à instruire ; D07 fixe déjà séparation des permissions et D01/D02 le cadrage/reports, sans reposer les mêmes choix. G1 exige contrats stabilisés, G2 POC explicitement autorisé, G3 sous-lot borné décidé puis réalisation autorisée ; G4 recette et décision de livraison distincte. Une publication documentaire ou un contrat ne fait passer aucune porte. Continuer les tâches indépendantes autorisées.
