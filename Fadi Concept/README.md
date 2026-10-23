# Fadi Concept — Document Management

This directory is the official location for **current Fadi concept documents**. The `Archive/` subdirectory holds previous versions. This README is the governing policy for concept files in this directory; it is not itself a concept and does not need a DOCX copy.

## 1. Naming and formats

Every current concept must have **exactly one pair** of files:

- `Fadi Concept - [Concept Name].md`
- `Fadi Concept - [Concept Name].docx`

Use the exact prefix `Fadi Concept - `, including capitalization and spaces. The two files must contain the same substantive content, title and internal version number. **Do not put version numbers in current filenames.**

Examples of valid concept names: `Users Management`, `Communication`, `Real-time Collaboration`, `Collaboration Common Rules`, `Studio`, `Intranet`. These are examples, not claims that the files already exist.

## 2. Directory layout

```text
Fadi Concept/
├── README.md
├── Fadi Concept - Users Management.md
├── Fadi Concept - Users Management.docx
├── Fadi Concept - Communication.md
├── Fadi Concept - Communication.docx
└── Archive/
    ├── Fadi Concept - Users Management - v2.0.md
    ├── Fadi Concept - Users Management - v2.0.docx
    └── ...
```

The tree is illustrative; include only files actually present and validated.

## 3. Versions and archive

- Current accepted versions belong directly in `Fadi Concept/`.
- Previous versions belong in `Fadi Concept/Archive/` as `Fadi Concept - [Concept Name] - v[Version].md` and `.docx`.
- Archived version labels must match the version written inside each archived document.
- Never overwrite an existing archived version. If the content or version is uncertain, stop and resolve the discrepancy.
- Git history supplements, but does not replace, the explicit archive.
- When first creating a concept, no archived predecessor is required.

## 4. Required update procedure

1. Identify the current MD/DOCX pair and verify both internal version numbers.
2. Preserve the previous pair in `Archive/` with its exact version suffix, checking for an existing archive collision.
3. Prepare both updated current files under the stable filenames, with the same new version inside.
4. Check substantive parity between MD and DOCX, Word readability, valid Markdown, links and filenames.
5. Commit the archive and replacement pair **together in one branch and pull request**. Do not leave only one format updated.
6. Review the resulting GitHub diff and verify both current files and both archived files.
7. Update the concept index below when a concept is added, renamed or retired.
8. Merge only through the repository's applicable review and authorization process. Do not deploy merely because concept documentation changed.

A failed or incomplete update must leave a valid current pair intact.

## 5. Concept index

Only list **current, verified pairs on the target branch** here. The index below lists the current pairs introduced in the coordinated migration. Earlier versions available in GitHub are retained in Archive/. Additional historical copies are archived only when their original bytes are verified.

| Concept | Markdown | Word | Version |
| --- | --- | --- | --- |
| Users Management | [MD](Fadi%20Concept%20-%20Users%20Management.md) | [DOCX](Fadi%20Concept%20-%20Users%20Management.docx) | 2.2 |
| Communication | [MD](Fadi%20Concept%20-%20Communication.md) | [DOCX](Fadi%20Concept%20-%20Communication.docx) | 1.2 |
| Real-time Collaboration | [MD](Fadi%20Concept%20-%20Real-time%20Collaboration.md) | [DOCX](Fadi%20Concept%20-%20Real-time%20Collaboration.docx) | 1.2 |
| Collaboration Common Rules | [MD](Fadi%20Concept%20-%20Collaboration%20Common%20Rules.md) | [DOCX](Fadi%20Concept%20-%20Collaboration%20Common%20Rules.docx) | 1.0 |
| Collaboration Concept Map | [MD](Fadi%20Concept%20-%20Collaboration%20Concept%20Map.md) | [DOCX](Fadi%20Concept%20-%20Collaboration%20Concept%20Map.docx) | 1.0 |
| Axes | [MD](Fadi%20Concept%20-%20Axes.md) | [DOCX](Fadi%20Concept%20-%20Axes.docx) | 1.0 |

After a pair is added, replace the placeholder with relative links to the corresponding `.md` and `.docx` files and their internal version.

## 6. Validation checklist

- [ ] Each current concept has one `.md` and one `.docx` with the same basename.
- [ ] All current filenames use the exact prefix and omit version suffixes.
- [ ] Both formats have the same title, version and substantive content.
- [ ] All replaced versions are archived as complete MD/DOCX pairs, without overwrites.
- [ ] The current concept index links to files that actually exist on the branch.
- [ ] The PR contains the intended files and no unrelated changes.
- [ ] Repository review and merge requirements are respected.

## 7. Initial migration

Inventory existing concept files and open concept PRs; identify the latest valid pair for each concept; archive genuine predecessors; rename the current pairs; verify MD/DOCX parity; and submit the complete migration in a separate, controlled PR. **This README does not itself perform that migration.**

