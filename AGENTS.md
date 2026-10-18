# Fadi development rules

- Preserve the authoritative Parcours workflow: 21 steps numbered 01–21, original phases, labels and mobile card presentation.
- The user-facing application is bilingual French / English (owner decision of 2026-10-07, D-163). French stays the
  source language: write user-facing text in French in the code, then add its English translation to
  `apps/web/src/lib/i18n/en.json` (and `messages.ts` for the Atelier ergonomics catalogue); `apps/web/e2e/interface-anglais.mjs`
  reports any interface text left in French. Project data, examples, produced documents (PDF, DXF, IFC, reports) and the
  prototype Plot tool stay in their own language. Integrate Harmonie inside each relevant step.
- Keep geometry independent of React. Do not silently omit unsupported model elements.
- Treat the supplied geometry package as a traceable extraction, not proof of correctness.
- Do not invent regulatory, structural or source-project data. Distinguish hypotheses, requirements and recommendations (`packages/domain-model`) — they are never the same thing.
- Never mix the cadastral, geographic and local coordinate frames; convert explicitly and keep each value tagged with its frame (see `Coordinate` in `packages/domain-model`).
- `docs/architecture.md` follows the objective brief (modular monolith, 7 modules, versioned domain model, reversible commands). Where a code change would contradict it, fix the plan or ask, don't silently diverge.
- Planche golden rule (owner decision of 2026-10-10, D-202), mandatory: every Planche tool has (1) its own icon, never
  shared with another tool, (2) a place in an appropriate toolbar (its family in « Outils ▾ » and its operations bar),
  and (3) a keyboard shortcut (surveyed SketchUp shortcut, otherwise the declared Fadi layer). The rule extends to every
  Planche command (Group, Explode, Isolate, Close group…) as each one is delivered — listed in « Outils ▾ » (group
  « Objets ») and placed in the contextual bar where it acts (floating actions bar, breadcrumb) — and to the single
  command registry of lot 9. It is enforced by tests (`apps/web/src/modules/atelier/nouveau/planche/barres-outils.test.ts`, « Règle
  d'or »): a tool without its own icon, toolbar or shortcut fails CI; every context-menu command of the Planche must be
  listed with the lot that will give it its icon, toolbar and shortcut (O-1, O-2, O-3, L9), so no command can appear
  without being accounted for. On touch screens the shortcut is complemented by a
  visible named button, never replaced by a hidden gesture.
- Run npm run typecheck, npm test and npm run build for relevant code changes. Report checks that could not run.
- Never commit secrets, node_modules or build outputs.

## Continuité des sessions et des agents

- Lire `docs/continuity/README.md` et le dernier `docs/workstreams/<chantier>/HANDOFF.md` **avant de reprendre** un chantier existant. Lire ensuite `STATUS.md`, `TASKS.md`, `CONTEXT.md`, l'Issue et la PR correspondantes, et vérifier le code/la CI actuelle. La mémoire d'une session IA n'est pas une preuve.
- Suivre le cycle **Issue → branche courte → PR → preuves → STATUS/HANDOFF → revue** ; ne pas créer de branche permanente par module. Ne pas écraser un état de reprise existant.
- Tout changement dans `docs/workstreams/<chantier>/` doit actualiser **`STATUS.md` et `HANDOFF.md` dans la même PR**. Consigner une décision structurante dans son journal déjà existant, ou une nouvelle ADR si aucun journal canonique ne couvre le sujet.
- Distinguer `À définir`, `Implémenté`, `Vérifié`, `Accepté` et `Bloqué`; chaque état « Vérifié » doit citer une preuve concrète (commit, test, rapport, revue). Avant une opération irréversible, enregistrer un checkpoint sur GitHub.
- Ces consignes complètent les règles précédentes et **ne constituent pas une autorisation** de modifier l'architecture cible, fusionner une PR ou déployer Fadi sans accord.

## Programme de missions Codex — Fadi et Studio (#156)

- Pour une mission de ce programme, lire `docs/ai-team/CODEX-START-HERE.md`, `docs/ai-team/MISSIONS.md` et `docs/ai-team/missions.json`, puis les checkpoints des chantiers `ai-team` et `studio` selon l'ordre de reprise ci-dessus.
- Traiter toutes les sous-tâches autorisées prêtes ; ne pas s'arrêter au plan ou à la première PR. Une tâche bloquée conserve cause, responsable, essais, déblocage et prochaine action ; poursuivre les tâches indépendantes. Avant interruption, enregistrer un checkpoint vérifiable, pas une promesse de travail en arrière-plan.
- Vérifier la couverture avec `python3 docs/ai-team/check_missions.py --check`. Préserver tous les identifiants source ; une affectation 630/630 n'est pas une preuve de 630 réalisations. Ne pas cocher les options reportées/exclues comme livrées.
- La disponibilité et l'exécution de sous-agents doivent être constatées, jamais simulées. Dépendances par contrat/livrable ; un seul agent propriétaire des fichiers partagés à la fois.
- Ce programme conserve toutes les restrictions précédentes : POC/correctifs et portes G0–G4 selon autorisation, aucune fusion, administration ou production implicitement autorisée ; aucun test destructif sur une cible non explicitement jetable. Ne jamais modifier DrawAll ni supprimer les capacités industrielles/règles de dessin natives Fadi.

- **Contrôle horaire et questions :** avant toute mission du programme #156, lire `docs/ai-team/CODEX-HOURLY-OPERATIONS.md`. Dans l'Issue #166, accuser réception sous `[CODEX-ACK]`, consigner les questions avec `[CODEX-QUESTION]` et poster les progrès réels avec `[CODEX-PROGRESS]`. Réponses factuelles possibles par ChatGPT ; les décisions et autorisations sensibles restent au responsable. Le suivi horaire ne lance pas une session Codex à lui seul.

- **Progression sans attente globale :** pour #156, lire `docs/ai-team/CODEX-NONBLOCKING-EXECUTION.md`, les réponses `Q-M003-D01..D07` dans l'Issue #166 et reprendre la prochaine sous-tâche READY. Un accord manquant bloque seulement l'opération effectivement dépendante ; les travaux indépendants autorisés continuent. Les orientations ChatGPT ne valent pas autorisation d'administration GitHub, de correction applicative sensible, de test destructif, de fusion ou de production.
