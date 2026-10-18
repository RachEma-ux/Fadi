# Mission 003 — A1 — Suite documentaire M11/M12/M14

Date : 18 octobre 2026. Programme #156 ; suivi métier #159. Copie de référence fournie par A0 : PR #165 ouverte, branche `docs/156-codex-missions-completes`, tête `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Ces états GitHub sont les données de coordination A0, pas une vérification réseau autonome A1. A1 écrit exclusivement ses artefacts dans `work/mission003/agents/A1/` ; ni copie du dépôt, ni originaux Mission 002 modifiés.

## Travail effectivement accompli et provenance

Reprise selon AGENTS et continuité, HANDOFF→STATUS→TASKS→CONTEXT de `ai-team` puis `studio`, CODEX-START-HERE, catalogue MISSIONS, missions.json et réception Mission 002. La suite exploite A1-produit.md et ses deux CSV originaux, sans refaire l'audit général.

**Nouvelle extraction Mission 003 :** 104 EX, 15 INV, 11 IF, 11 AC du DOCX officiel RT001, soit 141 fiches individuelles. Les INV/IF/AC ne sont pas présentés comme originaux Mission 002 retrouvés : c'est une extraction nouvelle, distincte de l'extraction historique des 104 EX. Le texte provient directement de `word/document.xml`, pas d'une reformulation du plan.

| Source | Version/statut documentaire | Blob Git recalculé à consigner |
|---|---|---|
| Définition officielle DOCX | V2.1, 17 octobre 2026 ; charte proposée à adopter | `e1d61ca38809e1faac6111c5ffb0881619b9a6dc` |
| Référentiel détaillé DOCX | V1.0 STUDIO-RT-001, 17 octobre 2026 ; spécification proposée à validation | `ce7cf463e34c92c0178fa0c0b495569a13c7fe32` |
| Plan Markdown | V1.0 STUDIO-PLAN-001, 18 octobre 2026 ; découpage proposé | `db5588eca8980efcd7276c1cc2182b9070c6eb38` |
| Checklist | V1.0 STUDIO-TASKS-001 ; 630 tâches, aucune réalisation déduite | Blob canonique annoncé par le programme `24a5e04346ed7605b82b7079d6259b378ca6bf64`, recalcul dans manifest source |

L'extraction conserve la ponctuation et les formulations sources, y compris « côtes » EX-004 et « Le objectId » AC-001, sans correction silencieuse. L'ancre est l'index 1-based de tous les descendants `w:p`, en ordre XML, incluant cellules et paragraphes vides ; ce n'est ni une page Word ni une ligne TXT. Les INV ont leur ID et texte en cellules séparées ; les deux ancres sont fournies. IF-006 conserve aussi les paragraphes JSON illustratif et avertissement sur l'identité de session : l'exemple n'est pas présenté comme une API réellement exposée.

Fichiers livrés :

- `studio-141-fiches.json` et `.csv` : texte/source/blob/paragraphes, responsable proposé, contrat et composants candidats, état de capacité/conformité/test distincts, cas positif/négatif **concrets pour chaque fiche**, scénario RT lié proposé, preuve existante et limite, DEC applicables à qualifier, prochaine action.
- `validation-141-fiches.json` : parsing/exactitude/comptages/champs et limites ; zéro test métier exécuté, zéro gate accepté, M12 non close.
- `studio-18-decisions.json` et `.csv` : chaque question et preuve exactes, deux options à comparer, risque spécifique, responsable, gate local, POC et demande humaine M002 canonique.
- Scripts d'extraction et entrées des scénarios/DEC conservés pour reproductibilité ; ils ne touchent ni application ni base.

**Contrôle exécuté :** 141 IDs uniques avec compte exact 104/15/11/11 ; chaque texte comparé au paragraphe XML indiqué ; blob RT001 recalculé et égal au canonique ; champs requis présents. A2 a également communiqué une revue indépendante d'extraction **141/141 sans écart**. A5 réalise sa revue distincte. Cette validation de structure et d'extraction n'est ni une preuve d'exécution des fonctions ni une revue métier suffisante par la seule présence de champs.

## Limites de la qualification M12

Chaque état de capacité décrit des socles **candidats** rapportés par Mission 002 et la présence actuelle des chemins dans la copie fournie. Aucun état « vérifié conforme Studio » n'est attribué ; aucun historique 1 757/47/3, test présent ou CI verte n'est utilisé comme succès d'un scénario Studio. Les liens TEST des fiches sont des propositions de rattachement et non une démonstration de couverture totale ; les cas positifs/négatifs affinent ces scénarios et ne remplacent pas les attendus exacts RT001.

Les IF normatifs restent inchangés ; les noms C-* de contrats proposés par A2 sont des contrats candidats d'implémentation, pas une renumérotation des IF. Les textes de cas d'essai sont explicitement proposés, pas copiés ni attribués au DOCX lorsqu'ils n'y figurent pas. Les tolérances et budgets inconnus restent à décider ; aucun seuil arbitraire par outil.

**M12 reste En cours :** livraison des 141 fiches préparées, revue croisée de leur adéquation et des composants/DEC encore à effectuer. La présence de ces fichiers peut justifier le contrôle d'extraction, pas cocher automatiquement TR-*, TEST, NAV, lot ou gate. Les fiches permettent de conserver un verdict non testé/inconnu sans dissimuler un écart.

## G0 — Dossier produit proposé, sans ratification implicite

Les invariants suivants sont déjà fixés par la Mission 002 et ne sont pas à rouvrir : Studio natif autonome dans navigation verticale, accessible sans Parcours ; quatre domaines ; deux planches autonomes dans Dessin et modélisation ; Projet→Étude→Variante→Révision ; services généraux partagés ; pas d'iframe/seconde application/seconde autorité métier ; conservation Atelier, 21 étapes, capacités industrielles et règles normatives.

**Usage pilote proposé :** une petite étude synthétique d'aménagement de local/pavillon, avec un document 2D indépendant publiable, une variante 3D libre et une variante architecturale associée contrôlée. Les trois parcours produisent chacun un résultat conservé/réouvrable, et le dossier final est revu, approuvé et publié sur versions identifiées. Le cas mur/ouverture RT001 reste un oracle isolé d'intégrité et ne constitue pas seul la preuve d'utilité du pilote.

**Données :** corpus synthétique explicitement autorisé, sans données client/production. Projet/site, programme et hypothèses fournis comme données d'essai, avec provenance/unités/repères ; aucune règle réglementaire inventée. Une exigence surfacique illustrative doit rester une exigence versionnée distincte de la surface dessinée. Le libellé et les valeurs finales du programme pilote seront validés à G0 ; EX-065 propose le cas 28m²/26m² comme test, pas une norme.

**Utilisateurs/permissions proposés :** concepteur, contrôleur, approbateur et publieur avec distinction approbation/diffusion ; cumul humain éventuel identifié explicitement. Administrateur technique ≠ approbateur métier automatique. A1 produit prépare l'utilité et la recette, A2 modèle/architecture/CAO/BIM, A4 interactions, A5 preuve et sécurité, A6 exploitation, A0 coordination ; responsable humain compétent signe les acceptations. Aucun nom de personne/disponibilité ni calendrier inventé.

| Domaine maintenu | Résultat minimal utile du pilote | Limite explicite |
|---|---|---|
| Dessin et modélisation | Dessin2D autonome ; géométrie3D directe ; objets associés et modifications contrôlées | Catalogue complet non promis par un profil d'environ20 outils |
| BIM et coordination | Propriétés du périmètre, exigence séparée, contrôle sourcé, observation et recontrôle | Aucune certification BIM ni conclusion réglementaire sans source |
| Visualisation, rendu et immersion | Caméra/vue et rendu modèle avec provenance | IA et immersion avancées proposées hors pilote initial, décision requise |
| Documentation, métrés et collaboration | Vue/feuille/dossier, quantités tracées, revue/approbation/publication immuable | Tous formats et round-trips non promis |

**Propositions d'exclusions initiales M002-D02 :** DWG (respect de D-179 existante, pas réouverture tacite), IA externe, MCP, extensions tierces, immersion/rendus avancés et renderer alternatif tant que non justifié. Ces options restent visibles et conditionnelles dans le programme ; leur non-engagement n'est jamais coché comme réalisation. Ne supprimer aucune capacité Fadi existante.

**Choix d'outils à ratifier selon le travail**, pas un catalogue inventé : dessin/édition/précision/annotation/calques pour A ; création spatiale/édition faces/transformation/navigation/coupe pour B ; mur/ouverture/hôtes/cotes/quantités pour C. Chaque outil doit satisfaire AC-011 (contrat/préconditions/droits/risques/mesures/jeux) et, lorsque applicable, règle d'or icône/barre/raccourci. Profil de vingt outils = cas d'essai de chargement, pas maximum architectural.

### Trois parcours et critères du pilote

| Parcours | Scénario complet exigé | Conditions d'acceptation et défauts éliminatoires |
|---|---|---|
| A indépendant2D | Entrée Studio→projet/étude/variante→document2D→tracer/modifier/coter/annoter/calques→sauver/fermer/rouvrir→vue/feuille→approbation/publication | Aucun modèle3D requis/créé implicitement ; contenu/identités/calques/cotes restitués ; TEST-001 jusqu'à publication, pas seulement sauvegarde |
| B indépendant3D | Entrée Studio→étude/variante→création spatiale directe→édition faces/volume/transformation→sauver/rouvrir→vue ou coupe plane dérivée | Pas d'esquisse2D obligatoire ; aucune BIMisation implicite ; source/provenance conservées ; TEST-002 |
| C associé | Même mur/ouverture depuis2D puis3D→quantités/contraintes/hôtes→undo/redo→conflit deux sessions→observation/correction/recontrôle→approbation/publication | Même objectId, pas double autorité ; copie indépendante autonome ; TEST-003–014/027/029–031/038 et018/035 ; dossiers publiés immuables |

Oracle simplifié RT001, sans autre déduction/jonction : mur6×3×0,2 =3,600m³ ; ouverture1×2,1×0,2 =0,420m³ ; net3,180m³. Largeur ouverture1,2→déduction0,504→net3,096m³. Retrouver les sources et valeurs historiques après undo/redo/réouverture et publication. Cet oracle ne définit pas un métré universel.

## G1 — Contrats à compléter par sous-ensemble

| Contrat/dossier | Sources exactes à utiliser | Préparation et manque avant fermeture |
|---|---|---|
| Navigation et contexte | EX-001/003/004/005/007, IF-001, NAV-001–009 du plan | A4/A2 spécifient routes/position/transitions/contexte/permissions/FR-EN/mobile/clavier/plein écran ; M002-D07 non ratifiée |
| Étude et deux autorités indépendantes | EX-003/009/012–023, IF-004/006 | A2 propose stockage/identités/versions/migration et interfaces publiques ; DEC-01/02/03/12/18 ouvertes |
| Commandes et historique | EX-008/010/017/018/024/045–049, IF-004/006/011 | Définir atomicité/idempotence/résultats/effets/concurrence/reprise selon contexte ; pas écriture directe ni last-write-wins tacite |
| Outils/profils/chargement | EX-026–044, IF-005, AC-002 | A2/A4 fixent loaders/profils/cache/compatibilité/droits ; coût réel froid/chaud encore non mesuré |
| Projections/jobs | EX-050–063, IF-002/003/007, AC-004–006 | Oracle/invalidation/picking/job périmé/crash/mémoire ; protections minimales avant exposition lourde |
| BIM/quantités/observations/publication | EX-064–091, IF-008/009/010, AC-001/007–010 | Contrat DEC-16 dès G1 parce que pilote terminable en dépend ; formats/couverture/droits et clôture à qualifier |
| Qualité/sécurité/traçabilité | EX-092–104, INV-001–015, AC-011 | A5 rattache38TEST, corpusS1–S7, oracles et négatifs ; A6 sécurité/exploitation ; aucun résultat exécuté déduit |

Une définition de source d'autorité et un propriétaire d'écriture sont nécessaires pour chaque type. Les variantes actuelles par projets bifurqués ne sont pas présumées satisfaire le modèle Étude/Variante/Révision. Toute extraction de package doit être justifiée par interface/coût et préserver géométrie hors React/DOM ; aucune seconde base métier.

## G2 — Dossiers de POC bornés proposés, tous non exécutés

Un POC peut produire du code et des écritures sur corpus ; il exige donc son autorisation spécifique. Les dossiers ci-dessous ne déclenchent rien. A0 peut soumettre le sous-ensemble minimal une fois contrats/corpus sûrs définis, sans attendre artificiellement DEC-15 ou toutes les optimisations.

| POC proposé | Question / corpus / portée | Oracle et preuves attendues | Accord/conditions |
|---|---|---|---|
| POC-CONTEXTE | Étude/variante sur projet test autorisé ; S6 synthétique | Identités/appartenance/versions, isolement deux variantes, accès croisé refusé, réouverture | DEC-03/18 préparées ; aucun schéma réel migré depuis ce dossier |
| POC-2D | Document2D autonome sur S1, primitive/cote/texte/calque et sauvegarde/export | Absence dépendance modèle3D, contenu/identités réouvrables ; rapport fidélité | DEC-01/08/18 ; code/stockage jetable autorisés séparément |
| POC-3D | Création spatiale/édition faces/vue plane sur S5 borné | Pas esquisse2D préalable, pas BIM implicite, sauvegarde/réouverture | DEC-03/11/18 ; protéger panne avant noyau lourd exposé |
| POC-ASSOCIATION | Mur/ouverture RT001 et copie, S2+S6 | MêmeID/hôtes, 3,180→3,096, ambiguïté topologique à résoudre, copie sans propagation | DEC-02/12, TEST003–011 ; aucun dossier existant/client |
| POC-CONFLIT | Deux sessions sur même mur, coupure/rejeu synthétiques | Rejet conflit atomique, pas dernier écrivain gagnant ; requestId appliqué une fois ; undo revalidé | DEC-12/03 ; garde DB+base jetable attestée avant tout test API mutateur |
| POC-CHARGEMENT | Profil20 outils d'essai, S1/S7 à froid/chaud | Requêtes/octets/chunks/initialisations/mémoire ; outils absents offline déclarés ; pas gain chiffré inventé | DEC04–07/13/14 ; budget/appareil/méthode avant verdict performance |
| POC-INDEX | Snapping/picking et rendu avant/après sur S1–S3 et vue3D | Même cible/point/priorité/ID, traces ambiguës, hôtes recalculés ; mesures séparées | DEC08–10/13/17 ; facultatif pour premier cadrage sans charge le nécessitant |
| POC-REPRISE | Crash noyau/job obsolète/upgrade file sur S5/S7 | pending résolu, modèle intact, relance sans doublon, file non perdue ; courbe50cycles quand applicable | DEC11/14 ; ni test destructif sur cible inconnue ni changement rétention |
| POC-PUBLICATION | Dossier synthétique multi-sources et approbation exacte, S6 | Manifeste/empreintes inchangés, mutation après approbation bloquée, historique conservé | DEC16 ; approbation/diffusion distinctes ; pas de publication client/production |

Tous attendent périmètre/autorisation/jeu sûr et critères d'essai explicites ; les valeurs d'essai ci-dessus ne donnent aucune permission d'exécution. IA/MCP ne sont pas nécessaires à ces preuves ; POC-MCP n'est instruit que si M002-D02 retient l'option.

## G3 — Autorisation par sous-ensemble, puis seulement réalisation

Préparer les composants/interfaces retenus, impacts données/sécurité/licence, compatibilité, migrations, rollback avec nouvelles écritures et chiffrage. Le chiffrage attend réutilisation mesurée/disponibilité/corpus ; aucune date fiable n'est déduite de630cases.

Séquence recommandée conservée : I/X/A.1 ; B seulement sur contrats stables ; A.2/A.3 ; association A.4/A.5 ; C/D selon charges avec protections minimales dès exposition ; E indispensable au résultat publiable ; R avant généralisation ; F selon ses décisions. Chaque sous-lot reçoit décision applicable et autorisation de code distincte ; aucun « toutes DEC closes » fictif ni blocage global sur option indépendante.

| Porte | État factuel à enregistrer | Prochaine action |
|---|---|---|
| G0 | Dossier pilote et sources préparés, pas ratifiés | M002-D01/D02 ; approbateur produit confirme sources/pilote/exclusions |
| G1 | Fiches exactes et critères proposés ; contrats détaillés sous revue | A2/A4/A5 confrontent141fiches, contrats et38oracles ; A0 soumet sous-ensemble |
| G2 | POC bornés définis en proposition, aucun exécuté par A1 | Autorisation spécifique/code/corpus/garde de tests puis preuves datées |
| G3 | DEC18 dossiers préparés ; aucune décision technique acceptée | Comparaison des alternatives et preuves/rollback/chiffrage, autorisation sous-lot |
| G4 | Hors portée de cette préparation | Build+recette+sécurité+mesures/restauration et acceptation ; déploiement séparé |

## Décisions humaines : conserver les huit identifiants canoniques

| Identifiant | Partie préparée / aucun changement de sens | Validation encore nécessaire |
|---|---|---|
| M002-D01 | Sources/renvoi ancien, pilote A/B/C, DEC critiques préparés | Confirmer référentiel technique applicable et ratifier pilote/G0 ; le renvoi ConceptV2 demeure conflit documentaire |
| M002-D02 | Exclusions initiales et maintien options visibles | Décider reports/exclusions sans supprimer capacités ni rouvrir D-179 implicitement |
| M002-D03 | Préparation DB fournie par A5/A2 | Autoriser garde DB puis essais jetables séparés ; A1 n'a exécuté aucun test mutateur |
| M002-D04 | Diagnostic/procédure Cloud A6 | Autorisation reprise locale bornée ; pas production/migration implicite |
| M002-D05 | Politique revue/protection A6 | Choix organisation et activation administrative explicite |
| M002-D06 | Préparation conflits #142/#152/#154 et intégration A0/A2/A4 | Arbitrer ordre sans fusion depuis ce rapport |
| M002-D07 | Contrats navigation/rôles/appareils et DEC correspondantes | Choisir placement/routes/transitions/permissions/appareils ; pas « après Projets » présumé adopté |
| M002-D08 | Enregistrement documentaire couvert par #156 | A0 intègre ces artefacts/checkpoints dans la PR autorisée ; ce n'est pas autorisation de fusion |

Aucune nouvelle série de décisions humaines ne remplace M002-D01–D08. Les DEC-01–18 restent les identifiants normatifs ; les POC sont des propositions de preuve et les C-* des noms de contrat candidats.

## Blocages et prochaine reprise

- M11 : G0 non ratifiée, ancien renvoi ConceptV2 ; propriétaire A1/A0/utilisateur ; dossier préparé, action = décision M002-D01/D02.
- M12 : revue croisée métier/contrats/preuves de141fiches non achevée ; propriétaires A1/A2/A5 ; extraction exacte vérifiée, action = relier oraclesA5 et contratsA2, qualifier manques sans fermer gate.
- M14 : POC non autorisés/exécutés et décisions non ratifiées ; propriétaire A2/A0/utilisateur ; dossiers18DEC préparés, action = autorisation limitée du premier sous-ensemble appuyé sur corpus/contrat.
- Publication : A0 seul intègre ; fichiers locaux A1 prêts à verser, aucune écriture GitHub A1.

Ne pas refaire l'audit global à la prochaine reprise : lire manifest, vérifier source/blob et état PR, reprendre les revues encore ouvertes. Les originaux Mission002 restent inchangés ; aucune case Studio ou recette n'a été cochée.
