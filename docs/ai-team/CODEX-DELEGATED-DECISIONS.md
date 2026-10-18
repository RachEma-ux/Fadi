# Fadi — délégation de décisions ChatGPT et autorisations bornées Codex

**Programme :** [#156](https://github.com/RachEma-ux/Fadi/issues/156) · **Canal :** [#166](https://github.com/RachEma-ux/Fadi/issues/166) · **Branche documentaire :** `docs/156-codex-missions-completes` · **Date :** 18 octobre 2026.

## 1. Mandat attribué dans la conversation

Le propriétaire a répondu **« Oui, t'es autorisé »** à la demande d'engager **A3-DB-1/2** (garde des bases de tests et tests totalement simulés), avec PR et vérifications **sans fusion automatique**. Il a également confié à ChatGPT le traitement des décisions que Codex soumet dans le canal GitHub.

**Champ de délégation exercé par ChatGPT :** cadrage produit et pilote, arbitrages UX/architecture/organisation et priorités, spécifications techniques, préparation et décision de sous-lots **réversibles et explicitement bornés**. Chaque décision doit être publiée dans [#166](https://github.com/RachEma-ux/Fadi/issues/166) avec identifiant, portée, justification, exclusions et preuve, puis reprise dans les registres de décision existants. Éviter les demandes répétées quand un choix est déjà couvert.

**Réserves :** cette délégation générale ne doit pas être interprétée comme une autorisation illimitée et sans traçabilité. **Pas de fusion, push direct `main`, déploiement sur `fadimmo.com`, migration de production, changement de sauvegardes/rétention, suppression de données, utilisation d'identifiants réels ou activation administrative de permissions/rulesets** sur la base du présent texte. Demander un accord ponctuel sur ces opérations à effets externes ou irréversibles. Ne jamais modifier DrawAll. Les opérations de code supplémentaires hors A3-DB-1/2 doivent disposer d'un périmètre et d'une décision documentés avant lancement.

**Important :** cette délégation ne donne pas à Codex le droit de s'auto-autoriser. ChatGPT traite les demandes dans #166 au rythme des vérifications et des sessions réellement disponibles ; la présence d'un fichier ne lance pas automatiquement une tâche Codex ni un processus permanent.

## 2. Sept arbitrages demandés — suite opérationnelle

Les recommandations antérieures [Q-M003-D01..D07](https://github.com/RachEma-ux/Fadi/issues/166) restent les sources d'analyse. Les décisions ci-dessous les remplacent lorsqu'elles étaient seulement candidates, dans les limites précisées.

| Question | Décision déléguée | Ce que Codex peut engager | Réserves |
| --- | --- | --- | --- |
| **D01 — Référentiel / pilote** | **RETENU pour cadrage :** STUDIO-RT-001 V1.0 comme référence technique de travail, sous réserve du classement des contradictions documentées, et une **petite étude synthétique local/pavillon** couvrant A (2D autonome jusqu'à publication), B (3D directe jusqu'à vue/coupe), C (objets associés jusqu'à revue/publication). | Finaliser dossier G0, maquettes, contrat, oracles, corpus synthétiques et critères du pilote. | Ne pas qualifier G0 de passé tant que le dossier complet (sources, rôles, exclusions et critères) ne satisfait pas sa porte et sa preuve. Aucun lot code Studio implicitement autorisé. |
| **D02 — Options** | **RETENU pour MVP :** reporter IA externe, MCP, extensions tierces, immersion/rendu avancés ; conserver Visualisation utile et toutes fonctions Fadi natives, y compris normes industrielles. D-179 DWG/DGN maintenue. | Marquer ces options comme « reportées du pilote », documenter leurs dépendances et poursuivre le socle. | Ne pas supprimer les options du backlog, ni cocher les tâches F comme livrées. |
| **D03 — Tests DB** | **AUTORISÉ : A3-DB-1/2 exclusivement.** | Sur **branche courte dédiée / PR**, implémenter `TEST_DATABASE_URL` obligatoire sans repli `DATABASE_URL`, vérification préalable endpoint/base/rôle et marqueur de cible jetable, blocage avant toute opération mutatrice, connexion validée et non modifiable, branchement des lanceurs concernés, tests purs simulés incluant les 16 refus/2 positifs proposés et cas de substitution/reconnexion. Revues A2/A5/A6, CI sûre. | **Interdit** : connexion à une base réelle, `TRUNCATE` effectif, tests API/E2E mutateurs, init/restart DB, migration, secrets ou accès prod. **DB-3** (essais sur base jetable réelle) est un lot ultérieur séparé. Aucune fusion automatique. |
| **D04 — Cloud** | **RETENU : D04a bornée**, uniquement sur un environnement Codex isolé et une cible jetable *déjà provisionnée* dont l'identité est attestée ; sinon diagnostic lecture seule et dossier D04b. | Vérifier scripts Cloud et versions, puis autoriser le démarrage **local** API/DB/web sur cette cible, `MIGRATE_ON_START=0`, **sans initialisation, réinitialisation, migration, tests mutateurs ou suppression**, et avec sondes `/health`, HTML, refus non authentifié, lecture PostGIS. | Si la cible, ses volumes, droits, schéma ou absence de migration implicite ne sont pas certains : **ne pas démarrer** et poursuivre les autres travaux. D04b (création/initialisation/destruction) non autorisée. Jamais prod. |
| **D05 — Politique de revue** | **RETENU comme conception :** profil solo tant qu'un réviseur indépendant réel n'est pas identifié ; PR et checks pertinents, conversations résolues, acceptation humaine tracée, force-push et suppression interdits. | Préparer/valider le ruleset candidat dans #146/#152 et la liste effective de checks ; vérifier la faisabilité sans rendre main inaccessible. | **Aucune activation GitHub administrative** ni bypass avant une revue spécifique des réglages finaux. |
| **D06 — Séquence PR** | **RETENU pour revue :** #154 puis #152 puis #142 après traitement de sa CI déficiente. Les préparations hors conflit continuent en parallèle. | Réviser les PR sur leur tête courante, réserver les fichiers partagés, préparer corrections/recettes si le sous-lot est autorisé. | Une décision d'ordre n'autorise ni correction non bornée, ni fusion, ni déploiement. |
| **D07 — Studio UX / droits** | **RETENU pour spécifications :** Studio après Projets, quatre domaines, deux planches dans Dessin/modélisation, URLs complètes et contexte projet/étude/variante/révision vérifié serveur, écran plein explicite réversible, protection des actions/sauvegardes, UX clavier/mobile/FR–EN. **Approbation et publication sont deux permissions distinctes** ; cumul uniquement configuré explicitement pour un rôle habilité, avec traçabilité. | Achever contrat et NAV-001–009, maquettes et scénarios négatifs, puis vérifier G1 selon critères. | Ne pas attribuer silencieusement des droits, ne pas considérer G1 passé sans preuve, aucun code Studio ouvert implicitement. |

**D08 — écritures documentaires** demeure couvert par le programme #156 : aucune nouvelle demande nécessaire.

## 3. Flux d'exécution non bloquant

1. Lire `AGENTS.md` et `docs/ai-team/CODEX-START-HERE.md`, puis `CODEX-NONBLOCKING-EXECUTION.md`, HANDOFF → STATUS → TASKS → CONTEXT, le présent dossier, les missions et les nouvelles questions dans #166.
2. Dans #166, confirmer la prise en compte de ces autorisations sous `[CODEX-ACK][DELEGATED-WORKFLOW]` avec SHA, décisions retrouvées et première sous-tâche.
3. **Démarrer A3-DB-1/2** par son Issue existante #157, une branche courte et une PR distincte ; produire le diff et les tests simulés sans base. Ne pas modifier la PR documentaire #165 pour y inclure le code.
4. En parallèle, A1/A2/A4/A5/A6 continuent la file READY : M08 (125 chemins), G0/G1 documentaire, 141 fiches, NAV, 38 oracles/7 corpus, contrats M01–M09, documentation et checks par SHA ; éviter les conflits sur fichiers communs.
5. Les questions nouvelles passent dans #166 avec `[CODEX-QUESTION][Q-ID][OPEN]` et recommandation. **Continuer immédiatement la prochaine sous-tâche autorisée** sans attendre ChatGPT si la question n'est pas une dépendance du travail courant. ChatGPT répondra lors de ses contrôles ou dans une nouvelle session utilisateur.
6. Pour les décisions déléguées, attendre une `[CHATGPT-DECISION][Q-ID]` clairement bornée, distincte d'une simple `[CHATGPT-ANSWER]`. Conserver date/auteur/portée et liens. Une opération réservée requiert toujours l'accord spécifique du propriétaire.
7. Avant revue, publier `[CODEX-PROGRESS]`, les preuves, les vérifications effectuées sur le SHA exact, puis STATUS/HANDOFF **ensemble**. Aucune tâche ne disparaît si bloquée ; si la session s'arrête, laisser un point de reprise exécutable. Le monitoring horaire vérifie mais **ne relance pas** Codex.

## 4. Compteurs et réception

- Rapport : « **N/D % — Avancement du développement total Fadi / Studio** » tant que `DEV_SCOPE` vérifié n'existe pas.
- Les six contrôles de provenance `6/630 = 1,0 %` ne démontrent pas six fonctions développées ; 630 affectations ne font pas 630 livraisons.
- « Code », « Review ChatGPT » et « Review Admin » restent trois validations séparées dans la checklist interactive ; aucune coche implicite.
- Livrables code ne sont « prêts à revue » qu'avec preuve des tests simulés, de l'absence de connexion DB et des contrôles CI pertinentes. Le propriétaire conserve les opérations extérieures réservées.
