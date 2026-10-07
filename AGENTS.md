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
- Run npm run typecheck, npm test and npm run build for relevant code changes. Report checks that could not run.
- Never commit secrets, node_modules or build outputs.
