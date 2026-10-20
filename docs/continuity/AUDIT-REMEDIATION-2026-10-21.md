# Audit remediation and branch reconciliation — 21 October 2026

Baseline: `main@78e9f4a89e9634189c3bd4fb9ed82576eafe2a64` (#222). Owner instruction: fix the audit findings and clean up the branch. This authorizes remediation and integration, not a declaration that every Studio feature is complete.

## Implemented corrections

- Sandbox uses checked draft reads/writes. Failed writes are surfaced with a visible FR/EN state, retry action and navigation warning; no save is announced before completion. Writes are ordered and stale completions cannot confirm a newer draft. A failed read does not trigger an overwrite of an unread draft.
- Regression: without IndexedDB, the original save resolved successfully; `brouillon-stockage.test.ts` reproduced it before repair. Cases cover write failure, retry and concurrent-save order.
- The register checker recognizes `À faire`, already a documented continuity state. It still rejects unknown states and does not promote tasks to verified/accepted. Current counters are restored in all four checkpoints, with the previous milestone retained as an explicitly historical archive. The checker and its unit tests now run in every continuity CI.
- Existing main protection proposal updated with the current unconditional check names. `python3 scripts/apply-main-ruleset.py` is a dry run; `--apply` requires an administrator token and updates existing ruleset 25417703, then re-reads it. No new ruleset is created. Zero additional GitHub approvals preserves the documented solo-maintainer policy. Runtime activation is not claimed without an authenticated administrative write and verification.

## Operations branch decision

| Branch to integrate and delete | Recorded tip |
| --- | --- |
| `ops/automated-preprod-deploy` | `33e8945ae9d04b7294fae2aca806d51a8de9f58f` |

Its ten unmerged commits propose GitHub-to-VPS SSH delivery, privileged CI entry points and GitHub-held SSH credentials. The later owner-approved plan (`docs/deploiement-automatique.md`, #219; implementation #221) explicitly chooses VPS pull with no server credential in GitHub and rejects that delivery path. Preserve the old branch tip as a merge parent, retain current main's deployment implementation, and do not introduce the competing workflow or privileged SSH entry points. Original files remain accessible in Git history. This resolves the branch without activating obsolete infrastructure.

Cleanup must verify the recorded tip is unchanged and an ancestor of the final main before deleting its name. The corrective helper branch is deleted only at its exact PR-merge second-parent SHA. Never delete main or unrecorded branches. GitHub ref deletion is eventually consistent; confirm with bounded retries and allow reruns.

## Validation and remaining acceptance work

| Audit item | Evidence / next action | Limit |
| --- | --- | --- |
| Sandbox persistence | `brouillon-stockage.test.ts`; typecheck, web tests and Sandbox E2E in CI | Local browser draft only; no new server persistence promised |
| Register | `python3 docs/ai-team/tableau_registre.py --controle`; 13 unit tests | 630 assignments are not 630 delivered features; P630=49/630 is documentary/cadrage |
| Required CI before merge | Existing ruleset JSON and dry-run/apply script | Blocked on an authenticated administrator connection; not activated by source code |
| Independent 2D | `studio-v1.mjs` on the attested fresh profile; `studio-persistance.mjs`, `studio-dossier.mjs` | Inspect reports at the exact PR SHA; CI is not owner acceptance |
| Independent 3D | `studio-espace.mjs`, `studio-visualisation.mjs`; `packages/atelier-model/src/studio/objets-3d/objets-3d.test.ts` | Does not establish every 3D tool or photorealistic rendering |
| Associated design | `packages/atelier-model/src/studio/architecture/architecture.test.ts` (3,180 → 3,096 m³, IDs et maillage), `studio-exigences.mjs`, `studio-observations.mjs`, `studio-publication.mjs`, `studio-restauration.mjs` | End-to-end concept scenario and G1–G4 acceptance remain open; do not infer full compliance from separate recipes |
| Database integration | Existing closed DB3 guard and its explicit refused-suite report | Never enable or bypass DB3 just to make `npm test` green |
| Live deployment / restoration | VPS: inspect timer and state, compare `/version` with approved commit, then observe an authorized restoration on disposable infrastructure | No authenticated VPS access in this session; no production action performed |
| Advanced AI rendering | Interface explicitly marks unavailable modes | No implementation or product acceptance is claimed by this remediation |

No acceptance or business-completion field in the task register is changed by this correction. Final test results and CI links belong to the remediation PR. Administrative protection activation, live VPS validation and complete Studio acceptance remain explicit follow-up work rather than fabricated successes.
