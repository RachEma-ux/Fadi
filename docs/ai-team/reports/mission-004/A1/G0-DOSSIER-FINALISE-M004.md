# N/D % — Avancement du développement total Fadi / Studio

## M11 — Dossier G0 finalisé pour revue, Mission 004

Date :18 octobre2026 ; A1 Produit. Programme#156, périmètreStudio#159, PR documentaire#165. Référence d'instructions A0 `301a4fa…`, copie lecture seule `/workspace/work/mission003/repo`. G0 **En cours**, dossier finalisé pour revue croisée ; aucune porte déclarée passée par A1. PDEV N/D : DEV_SCOPE/baseline acceptés absents. Aucun développement Studio ni test métier exécuté par A1.

### Autorité et décisions déjà acquises

Lecture réelle : AGENTS, CODEX-MISSION-004-PROMPT, CODEX-DELEGATED-DECISIONS, protocoles et sources M003 ; export réel des commentaires#166 remis par A0 dans `github-166-decisions.json`. Le commentaire [6249520098](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249520098) porte `[CHATGPT-DECISION][DELEGATED-WORKFLOW]` et remplace les sept anciennes recommandations candidates dans ses seules limites. L'appel réseau est celui d'A0 ; A1 a lu l'export, pas prétendu un accès autonome.

- **M002-D01 retenue pour cadrage :** STUDIO-RT-001 V1.0 référence technique de travail et petite étude synthétique local/pavillon couvrant A2D seule publiable, B3D directe jusqu'à vue/coupe et Cassocié jusqu'à revue/publication. Ces choix ne sont plus des questions à reposer.
- **M002-D02 retenue pour MVP :** report IA externe, MCP, extensions tierces, immersion/rendu avancés ; Visualisation utile et capacités Fadi natives conservées ; D-179 DWG/DGN maintenue. Les reports restent dans le backlog, jamais cochés comme réalisés.
- **M002-D07 retenue pour spécifications :** Studio après Projets, quatre domaines/deux planchesD1, URLs complètes/contexte serveur, plein écran explicite réversible, transitions sûres, clavier/mobile/FR-EN ; approbation/publication deux permissions distinctes, cumul configuré et tracé seulement pour rôle habilité.
- **M002-D03 :** seul A3-DB-1/2 applicatif est autorisé. Cette autorisation ne couvre aucun code/POCStudio, aucune base réelle ni tests mutateurs. A0 affecte A3 séparément ; A1 n'intervient pas dans ses fichiers.
- **M002-D08 :** enregistrement documentaire déjà couvert ; A0 seul intègre ces sorties aux fichiers partagés. Aucune fusion/administration/déploiement accordé par ce dossier.

### Sources et classement des contradictions

| Source | Portée | Identité immuable |
|---|---|---|
| Charte officielleV2.1 | Finalité/quatre domaines/deux planches/invariants, subordination technique | DOCX blob`e1d61ca38809e1faac6111c5ffb0881619b9a6dc` |
| RT001V1.0 |104EX/15INV/11IF/11AC et38TEST,18DEC | DOCX blob`ce7cf463e34c92c0178fa0c0b495569a13c7fe32` |
| PlanV1.0 | Découpage/portes/lots/NAV, propositions techniques à instruire | Markdown blob`db5588eca8980efcd7276c1cc2182b9070c6eb38` |
| ChecklistV1.0 |630 tâches hétérogènes, état de case distinct des preuves | Markdown blob`24a5e04346ed7605b82b7079d6259b378ca6bf64` |
| Décision déléguée#166 | Cadrage retenu dans limites ci-dessus | commentaire6249520098 + document délégation@301a4fa… ; empreinte export dans141fichesv2 |
| AGENTS/continuité/architecture/décisions Fadi |21 étapes, monolithe, langues, géométrie pure, fonctions industrielles et normes | Références existantes conservées, pas réécriture de faits historiques |

Classement clos pour le **cadrage**, sans réécrire les sources historiques :

1. Ancien renvoi de la charte au ConceptV2 : divergence éditoriale conservée et à synchroniser dans un lot documentaire ; D01 fixe désormais RT001V1.0 comme référence technique de travail. Ce renvoi ne justifie plus une question identique sur le choix de référence.
2. Architecture sept modules/Planche dans Atelier versus Studio autonome : coexistence/addition de Studio, pas suppression ni refonte implicite ; interfaces/propriétaire d'écriture restent DEC techniques à instruire. La décision produit n'autorise aucun changement applicatif.
3. DWG conditionnel dans formats cible versus D-179 : D02 maintient renoncement existant ; aucune promesse DWG/DGN dans pilote et pas de réouverture/licence implicite.
4. Anciennes formulations «candidat» de M003 versus décisions déléguées nouvelles : conserver M003 comme historique daté ; métadonnées M004 enregistrent les choix retenus et leurs limites. Aucun effacement de l'historique.
5. IFC valide/export versus paramétrique : consultation/import en représentations ne prouve ni round-trip paramétrique ni certification ; rapports pertes et statut non natif restent obligatoires.

### Usage et périmètre pilote précis

**Objectif :** terminer une petite étude synthétique local/pavillon, depuis entrée autonome Studio jusqu'à réouverture et livrables identifiés. Aucun jeu client/production. L'étude porte trois variantes pédagogiques distinctes pour séparer dessin2D libre, géométrie3D libre et conception architecturale associée, avec provenances explicites ; une copie indépendante ne propage jamais vers sa source.

**Contexte minimal :** un projet synthétique autorisé, étude cadrée avant géométrie possible, variantes propriétaires nommées, révisions identifiées et immuables comme références. Utiliser services Fadi comptes/projets/données/stockage/documents, sans seconde application/base métier/identité concurrente. Les variants actuels par projets bifurqués ne valent pas implémentation de cette hiérarchie : DEC03 doit préciser le modèle physique.

**Minimum fonctionnel de la spécification pilote**, sans affirmer la disponibilité du code :

- A : créer ligne/contour fermé indépendant, sélectionner/modifier/déplacer, gérer calques, coter et annoter ; sauvegarder/fermer/rouvrir, composer vue/feuille et publier. Précision/saisie numérique/annulation font partie du contrat, pas une démonstration de boutons.
- B : créer une géométrie spatiale directement sans dessin préalable, sélectionner/éditer des faces et transformer le volume, grouper selon besoin ; naviguer, sauvegarder/rouvrir puis produire vue ou coupe dérivée.
- C : mur/ouverture communs aux deux planches, hôtes/contraintes et métrés sourcés ; annuler/rétablir, copie indépendante, conflit deux sessions/rejeu, contrôle d'une exigence, observation/correction/recontrôle, approbation et publication du dossier exact.

La liste ci-dessus décrit les capacités minimales du cas métier et non des toolId nouveaux déjà approuvés ; A2/A4 rattachent chaque opération au contrat/version/outil existant ou à l'écart identifié. Aucun remplacement systématique de moteur ni extraction de paquet par bouton.

### Quatre domaines et produits attendus

| Domaine | Usage pilote | Sortie mesurable |
|---|---|---|
| D1Dessin et modélisation | Deux planches autonomes, trois relations explicites, mêmes objets associés | Document2D sans3D ; modèle3D sans esquisse obligatoire ; objectId associé commun |
| D2BIM et coordination | Propriétés/contrôles/exigences distinctes des résultats ; références externes acceptées | Résultat avec source/règle/révision/conclusion, observation identifiée et recontrôlée |
| D3Visualisation | Caméra/vue/rendu modèle utiles à l'étude | Média/vue avec révision source et provenance, aucun effet implicite sur géométrie/métrés |
| D4Documentation/métrés/collaboration | Vue→feuille→dossier, quantités, tâches/revue/approbation/publication | Manifeste coordonné immuable, empreintes et permissions distinctes, historique retrouvable |

### Données d'essai, provenance et sécurité

Corpus synthétiques S1détail2D, S2plan/mur-ouverture, S3dense seulement si risque étudié, S4multi-niveaux si utile à non-régression native, S5libre3D, S6étude/variantes/révisions/publications, S7offline/reconnexion. A5 est propriétaire de leurs manifestes et empreintes ; A1 ne modifie pas leurs fichiers partagés. La fiche de corpus indique licence/origine synthétique, unités/repères, générateur ou contenu déclaré, oracle et volume ; absence de seuil de charge accepté ≠ capacité promise.

Les dimensions du test murRT001 sont **données synthétiques sources**, pas valeurs de projet ou règles universelles :6×3×0,2m, ouverture1×2,1m→3,600brut/0,420déduction/**3,180net** ; ouverture1,2m→0,504déduction/**3,096net**. Exclure autres déductions/jonctions de ce cas. L'exemple EX065 de28m²/26m² sert à vérifier exigence distincte/écart, pas à imposer un programme réel. Les repères document/local/projet/géographique restent tagués et transformés explicitement.

Aucun POC/code/écriture réelle/DB n'est exécuté par ce dossier. Toute recette mutatrice attend garde/cible et autorisation appropriées ; DB3 demeure distinct. Publication du pilote signifie publication **dans le corpus de validation autorisé** ; aucune diffusion client/production ou déploiement fadimmo.com.

### Responsabilités et permissions

| Objet | Responsable de préparation | Vérificateur / autorité |
|---|---|---|
| Périmètre métier/G0/exigences/source | A1 | A2/A4/A5 revue croisée ; décision de porte selon délégation publiée, portée/preuve explicites |
| Modèle/CAO/BIM/interfaces/DEC | A2 | A1 cohérence métier, A5 sécurité/non-régression, A6 exploitation/licence |
| UX/navigation/langues/accessibilité | A4 | A1 usage ; A2 contexte ; A5 NAV |
| Corpus/oracles/exécution future/preuves | A5 | A1 résultats métier ; A2 géométrie ; A6 environnement sûr |
| Cloud/CI/administration candidate/reprise | A6 | A0 coordination ; opérations réservées nécessitent accord distinct |
| Intégration documentaire/checkpoints/questions | A0 | Un propriétaire de fichier partagé à la fois ; pas fusion implicite |
| Code | A3 uniquement DB1/2 autorisé | Revue A2/A5/A6 ; aucun lotStudio autorisé depuis mandatDB |

Rôles fonctionnels de test : concepteur édite, contrôleur constate/recontrôle, approbateur statue sur ensemble figé, publieur diffuse cet ensemble. Il s'agit de fixtures de permissions, pas d'attributions à des comptes réels. Même individu possible seulement via configuration explicite des deux permissions et journal, conformément D07 ; rôle administrateur technique seul ne les confère pas. L'absence d'approbateur ne vaut jamais accord.

### Critères des trois parcours, pas démonstration partielle

| Parcours | Acceptation fonctionnelle future | Preuve exigée |
|---|---|---|
| A2Dindépendante | Édition/calques/cotes/annotation/sauvegarde/fermeture/réouverture/feuille/publication sans modèle3D requis/créé implicitement | TEST001 complet + permissions018/035, source dessin/revisions, manifeste et empreintes ; capture de bouton insuffisante |
| B3Ddirecte | Création spatiale/édition face/volume/transformation/sauvegarde/réouverture/vue ou coupe sans esquisse2D ni BIM implicite | TEST002 + sélections/topologie pertinentes, source modèle/vue, réouverture fidèle |
| Cassociée | Même mur/hôte depuis2D/3D, volumes exacts du casRT, undo/redo/conflit/rejeu/copie, observation/correction/recontrôle/approbation/publication | TEST003–014,027,029–031,038,018/035 selon exigences ; révisions/sources exactes et refus négatifs |

Transversaux éliminatoires : double autorité, corruption de référence, accès interprojets, doublon de commande, écrasement de conflit, résultat périmé engagé courant, publication sous approbation d'un autre contenu. Gain performance/CI verte ne compense jamais un de ces défauts. Même snapping/picking/cotes/volumes/export dans tolérances contractuelles avant/après optimisation ; aucune tolérance inventée pour passer.

### Reports MVP retenus et obligations conservées

IA externe, MCP, extensions tierces, immersion/rendu avancés sont **reportés du MVP** par D02 ; pas supprimés du programme/F, pas tâchesF cochées ni tests réputés réussis/non applicables au produit entier. Une fiche mixte reste applicable au socle (provenance rendus, confidentialité, permissions, séparation visuel/technique). D3Visualisation demeure. DWG/DGN restent renoncés selon D179. Renderer alternatif/index/ordonnanceur complet dépendent des preuves et charges, sans bloquer artificiellement le cadrage ; protections minimales des fonctions exposées restent obligatoires.

### Définition Vérifié / Accepté et porte G0

**Vérifié, tâche documentaire :** résultat attendu effectivement complet pour cet ID, sources/versions/empreintes et arbitrages rattachés, revue de contenu datée par rôles compétents, traces accessibles au SHA documentaire exact. Un formatJSON valide ou141champs remplis ne suffit pas ; extraction vérifiée ≠ contrat validé. Le registre conserve preuve de vérification et condition de clôture distinctes de conformité produit.

**Vérifié, capacité :** code/build/contrat/corpus/env/horodatage/exécutant identifiés ; cas positifs et négatifs pertinents exécutés et comparés aux oracles, invariants/droits/historique/persistance/non-régression démontrés ; résultat actuel, pas logs historiques. Reports et scénarios non exécutés ne deviennent jamais vérifiés.

**Accepté :** acte explicite daté de l'autorité habilitée couvrant le périmètre et les preuves exacts, après critères applicables satisfaits ; dérogations éventuelles tracées sans supprimer invariant. D01/D02/D07 sont des choix de cadrage/spécification retenus ; pas acceptation implicite deG0/G1, code, fusion ou production.

| Condition G0 | Pièce présente dans ce dossier | État de revue |
|---|---|---|
| Sources de référence et contradictions classées | Table sources +5classements, décisionD01/D02 | Préparé ; source immuable déjà vérifiée, classement à revue |
| Premier usage/pilote et trois parcours | Étude synthétique précise, minimum opérations et critèresA/B/C | Préparé conformément décision retenue, pas question identique à reposer |
| Responsables/rôles et limites | Table A0–A6 et permissions fixtures distinctes | Préparé ; aucune attribution de compte réel |
| Options incluses/reportées/contraintes |4domaines, reportsD02 et invariants AGENTS | Choix déjà retenus, documentation achevée pour revue |
| Données et preuve future | Corpus synthétiques/oraclesRT, manifestes A5 à joindre pour G1/G2 | Cadré ; exécution/corpus effectifs ne sont pas inventés |
| Décision de passage G0 | À enregistrer après revue de ce dossier et preuves au checkpoint | Non passée par A1 ; ne pas confondre choix retenus et porte |

**Prochaine action READY :** A2/A4/A5 examinent dossierG0 et delta141 ; A0 consolide réserves précises/preuves, puis enregistre décision de porte si son autorité/critères sont réunis. Ne reposer D01/D02/D07 qu'en présence d'un fait nouveau incompatible, sinon poursuivreG1. Les DEC techniques restent priorisées par sous-ensemble ; aucune demande de codeStudio globale.
