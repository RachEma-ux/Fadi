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
  Planche command (Group, Explode, Isolate, Close group…) as each one is delivered, and to the single command registry
  of lot 9. It is enforced by tests (`apps/web/src/modules/atelier/nouveau/planche/barres-outils.test.ts`, « Règle
  d'or »): a tool without its own icon, toolbar or shortcut fails CI. On touch screens the shortcut is complemented by a
  visible named button, never replaced by a hidden gesture.
- Run npm run typecheck, npm test and npm run build for relevant code changes. Report checks that could not run.
- Never commit secrets, node_modules or build outputs.
